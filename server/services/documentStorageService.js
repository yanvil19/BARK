const crypto = require('crypto');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

// Cloudflare R2 Client configured using existing credentials
const r2Documents = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const ALLOWED_MIME_TYPES = {
  // PDF
  'application/pdf': 'pdf',
  // Word (.doc, .docx)
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  // PowerPoint (.ppt, .pptx)
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  // Excel (.xls, .xlsx)
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const EXTENSION_MAP = {
  '.pdf': 'pdf',
  '.doc': 'doc',
  '.docx': 'docx',
  '.ppt': 'ppt',
  '.pptx': 'pptx',
  '.xls': 'xls',
  '.xlsx': 'xlsx',
};

function isDocumentStorageConfigured() {
  return Boolean(
    process.env.R2_DOCUMENTS_BUCKET_NAME &&
    process.env.R2_DOCUMENTS_PUBLIC_URL &&
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}

function getDocumentPublicBaseUrl() {
  return (process.env.R2_DOCUMENTS_PUBLIC_URL || '').replace(/\/+$/, '');
}

/**
 * Uploads a document directly via S3 PutObjectCommand to the bark-documents R2 bucket
 */
async function uploadDocumentToR2(file, uploaderId) {
  if (!isDocumentStorageConfigured()) {
    throw new Error('R2 document storage is not properly configured.');
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const fileType = EXTENSION_MAP[ext] || ALLOWED_MIME_TYPES[file.mimetype];
  if (!fileType) {
    throw new Error('Invalid file type. Only PDF, Word, PowerPoint, and Excel files are allowed.');
  }

  // Generate unique clean object key: academic-docs/<random-uuid><ext>
  const uniqueId = crypto.randomUUID();
  const storageKey = `academic-docs/${uniqueId}${ext}`;
  const bucketName = process.env.R2_DOCUMENTS_BUCKET_NAME;

  await r2Documents.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        uploadedby: String(uploaderId),
        originalname: encodeURIComponent(file.originalname || ''),
      },
    })
  );

  const baseUrl = getDocumentPublicBaseUrl();
  const publicUrl = `${baseUrl}/${storageKey}`;

  return {
    storageKey,
    publicUrl,
    fileType,
    mimeType: file.mimetype,
    fileSize: file.size,
  };
}

/**
 * Deletes a document object from R2 bucket
 */
async function deleteDocumentFromR2(storageKey) {
  if (!isDocumentStorageConfigured()) {
    throw new Error('R2 document storage is not properly configured.');
  }

  const bucketName = process.env.R2_DOCUMENTS_BUCKET_NAME;
  await r2Documents.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
    })
  );
}

module.exports = {
  ALLOWED_MIME_TYPES,
  EXTENSION_MAP,
  isDocumentStorageConfigured,
  uploadDocumentToR2,
  deleteDocumentFromR2,
  getDocumentPublicBaseUrl,
};
