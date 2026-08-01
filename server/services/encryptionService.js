const crypto = require('crypto');
const mongoose = require('mongoose');

// AES-128-GCM for text fields — 16-byte key (32 hex chars)
const TEXT_ALGO = 'aes-128-gcm';
// AES-256-GCM for image buffers — 32-byte key (64 hex chars)
const IMG_ALGO = 'aes-256-gcm';

function getTextKey() {
  const hex = process.env.TEXT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 32) {
    throw new Error('TEXT_ENCRYPTION_KEY must be exactly 32 hex characters (16 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

function getImageKey() {
  const hex = process.env.IMAGE_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('IMAGE_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plain-text string using AES-128-GCM.
 * Returns a base64 string: [12-byte IV][16-byte authTag][ciphertext]
 * Returns the original value unchanged if null/undefined.
 */
function encryptText(plainText) {
  if (plainText == null) return plainText;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(TEXT_ALGO, getTextKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts a base64 string produced by encryptText.
 * Returns the original value unchanged if null/undefined.
 */
function decryptText(packed) {
  if (packed == null) return packed;
  try {
    const buf = Buffer.from(packed, 'base64');
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv(TEXT_ALGO, getTextKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    // If decryption fails, the value was probably stored as plaintext (e.g. legacy / test data)
    return packed;
  }
}

/**
 * Encrypts a raw image Buffer using AES-256-GCM.
 * Returns a Buffer: [12-byte IV][16-byte authTag][ciphertext]
 */
function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(IMG_ALGO, getImageKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypts a Buffer produced by encryptBuffer.
 * Returns the original plaintext image buffer.
 */
function decryptBuffer(blob) {
  const iv = blob.subarray(0, 12);
  const authTag = blob.subarray(12, 28);
  const encrypted = blob.subarray(28);
  const decipher = crypto.createDecipheriv(IMG_ALGO, getImageKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Decrypts all sensitive text fields on a plain question object.
 * Accepts both Mongoose documents (calls .toObject()) and plain objects.
 */
function decryptQuestion(q) {
  const obj = q.toObject ? q.toObject() : { ...q };
  return {
    ...obj,
    description: decryptText(obj.description),
    rationalization: decryptText(obj.rationalization),
    answers: (obj.answers || []).map((a) => ({
      ...a,
      text: decryptText(a.text),
    })),
  };
}

/**
 * Decrypts all populated questions inside an exam document.
 * @param {Object} exam - The exam document (Mongoose or plain object)
 */
function decryptExamQuestions(exam) {
  if (!exam) return exam;
  const e = exam.toObject ? exam.toObject() : { ...exam };
  if (e.questions && Array.isArray(e.questions)) {
    e.questions = e.questions.map(q => {
      // If q is just an ObjectId string, skip
      if (typeof q === 'string' || q instanceof mongoose.Types.ObjectId) return q;
      return decryptQuestion(q);
    });
  }
  return e;
}

module.exports = {
  encryptText,
  decryptText,
  encryptBuffer,
  decryptBuffer,
  decryptQuestion,
  decryptExamQuestions,
};
