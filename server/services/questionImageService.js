const crypto = require('crypto');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const Question = require('../models/Question');
const { encryptBuffer, decryptBuffer } = require('./encryptionService');
const { getAccessibleProgramIds } = require('../utils/programAccess');

const r2 = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Images are stored encrypted in R2 under "question-images/<file>" and are only
// ever served through the decrypting proxy at "/api/questions/image/<file>".
const IMAGE_URL_PREFIX = '/api/questions/image/';
const R2_KEY_PREFIX = 'question-images/';
const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MIME_BY_EXTENSION = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const SERVED_CONTENT_TYPES = new Set(Object.values(MIME_BY_EXTENSION));

function isStorageConfigured() {
  return Boolean(process.env.R2_BUCKET_NAME);
}

function isValidImageFilename(filename) {
  return FILENAME_PATTERN.test(String(filename || ''));
}

function toImageUrl(filename) {
  return `${IMAGE_URL_PREFIX}${filename}`;
}

function toObjectKey(filename) {
  return `${R2_KEY_PREFIX}${filename}`;
}

// Returns the R2 file name for a stored image reference. Handles the proxy URLs
// used today (/api/questions/image/<file>) and legacy public R2 URLs
// (https://<host>/question-images/<file>). Returns null for anything else.
function getImageFilename(url) {
  const match = /(?:\/api\/questions\/image\/|question-images\/)([^/?#]+)$/.exec(String(url || '').trim());
  return match && isValidImageFilename(match[1]) ? match[1] : null;
}

function isProxyImageUrl(url) {
  const value = String(url || '');
  return value.startsWith(IMAGE_URL_PREFIX) && isValidImageFilename(value.slice(IMAGE_URL_PREFIX.length));
}

// Every image a question references: its own images plus one per answer.
// Works on Mongoose documents and plain payload objects alike.
function collectQuestionImageUrls(question) {
  if (!question) return [];
  const urls = [...(question.images || [])];
  for (const answer of question.answers || []) {
    if (answer?.image) urls.push(answer.image);
  }
  return [...new Set(urls.filter(Boolean))];
}

function imageReferenceFilter(imageUrl) {
  return { $or: [{ images: imageUrl }, { 'answers.image': imageUrl }] };
}

async function uploadQuestionImage(file, uploaderId) {
  const filename = `${crypto.randomUUID()}${EXTENSION_BY_MIME[file.mimetype] || ''}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: toObjectKey(filename),
      Body: encryptBuffer(file.buffer),
      ContentType: 'application/octet-stream', // Stored as an encrypted binary blob
      // The uploader is recorded so they can preview and discard the image before
      // it is attached to a saved question. The original type is kept so the
      // decrypted image can be served with the correct Content-Type.
      Metadata: {
        uploadedby: String(uploaderId),
        contenttype: MIME_BY_EXTENSION[EXTENSION_BY_MIME[file.mimetype]] || 'image/jpeg',
      },
    })
  );

  return toImageUrl(filename);
}

// Returns the uploader's user id recorded on the stored image, or null when the
// image does not exist or was uploaded before uploaders were recorded.
async function getImageUploader(filename) {
  try {
    const head = await r2.send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: toObjectKey(filename) })
    );
    return head.Metadata?.uploadedby || null;
  } catch (err) {
    if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

async function readQuestionImage(filename) {
  const obj = await r2.send(
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: toObjectKey(filename) })
  );

  const chunks = [];
  for await (const chunk of obj.Body) chunks.push(chunk);
  const buffer = decryptBuffer(Buffer.concat(chunks));

  const storedType = obj.Metadata?.contenttype;
  const contentType = SERVED_CONTENT_TYPES.has(storedType)
    ? storedType
    : MIME_BY_EXTENSION[path.extname(filename).toLowerCase()] || 'image/jpeg';

  return { buffer, contentType };
}

async function deleteImageObject(filename) {
  await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: toObjectKey(filename) }));
}

// Decides whether a user may view an image:
// - the author of the question it belongs to, in any state
// - Program Chairs and Deans for questions they review (any non-draft state in their programs)
// - Professors, students and alumni for approved questions in their own program
// - the uploader, while the image is not yet attached to any saved question
// Returns { allowed } or { allowed: false, status } with the status to respond with.
async function canViewQuestionImage(user, filename) {
  const imageUrl = toImageUrl(filename);
  const grants = [{ createdBy: user._id }];

  if (user.role === 'program_chair' || user.role === 'dean') {
    const programIds = await getAccessibleProgramIds(user);
    if (programIds.length > 0) {
      grants.push({ program: { $in: programIds }, state: { $ne: 'draft' } });
    }
  } else if (user.program) {
    grants.push({ program: user.program, state: 'approved' });
  }

  const granted = await Question.exists({ $and: [imageReferenceFilter(imageUrl), { $or: grants }] });
  if (granted) return { allowed: true };

  if (await Question.exists(imageReferenceFilter(imageUrl))) {
    return { allowed: false, status: 403 };
  }

  const uploader = await getImageUploader(filename);
  if (uploader && uploader === String(user._id)) return { allowed: true };

  return { allowed: false, status: 404 };
}

// Checks the image references a question will hold before it is saved.
// References the question(s) already had are kept as they are. Any newly added
// reference must be an image this user uploaded that no other question uses,
// so nobody can attach (and through that, gain access to) someone else's image.
async function validateImageReferences({ urls, previousUrls = [], userId, excludeQuestionIds = [] }) {
  const previous = new Set(previousUrls);
  const added = [...new Set(urls)].filter((url) => !previous.has(url));

  for (const url of added) {
    if (!isProxyImageUrl(url)) {
      return { ok: false, message: 'An image reference is invalid. Please re-upload the image.' };
    }

    const usedElsewhere = await Question.exists({
      $and: [imageReferenceFilter(url), { _id: { $nin: excludeQuestionIds } }],
    });
    if (usedElsewhere) {
      return { ok: false, message: 'An image is already attached to another question. Please upload it again.' };
    }

    const uploader = await getImageUploader(url.slice(IMAGE_URL_PREFIX.length));
    if (uploader !== String(userId)) {
      return { ok: false, message: 'An image could not be verified. Please re-upload it.' };
    }
  }

  return { ok: true };
}

// Deletes stored images that no question references any more. Call it only
// after the question change has been saved, so a failed save never loses images.
async function deleteUnreferencedImages(urls = []) {
  if (!isStorageConfigured()) return;

  for (const url of new Set(urls.filter(Boolean))) {
    try {
      const filename = getImageFilename(url);
      if (!filename) continue;

      const stillReferenced = await Question.exists({
        $or: [
          imageReferenceFilter(url),
          imageReferenceFilter(toImageUrl(filename)),
        ],
      });
      if (stillReferenced) continue;

      await deleteImageObject(filename);
    } catch (err) {
      console.error('Failed to delete question image:', err);
    }
  }
}

module.exports = {
  r2,
  IMAGE_URL_PREFIX,
  isStorageConfigured,
  isValidImageFilename,
  toImageUrl,
  getImageFilename,
  isProxyImageUrl,
  collectQuestionImageUrls,
  imageReferenceFilter,
  uploadQuestionImage,
  getImageUploader,
  readQuestionImage,
  deleteImageObject,
  canViewQuestionImage,
  validateImageReferences,
  deleteUnreferencedImages,
};
