const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Document title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    originalFilename: {
      type: String,
      required: [true, 'Original filename is required'],
      trim: true,
    },
    fileType: {
      type: String,
      required: [true, 'File type is required'],
      enum: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'],
      lowercase: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
      trim: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    storageKey: {
      type: String,
      required: [true, 'Storage key is required'],
      trim: true,
    },
    publicUrl: {
      type: String,
      required: [true, 'Public URL is required'],
      trim: true,
    },
    program: {
      type: String,
      required: [true, 'Program is required'],
      trim: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Uploader is required'],
      index: true,
    },
  },
  {
    timestamps: true, // createdAt will serve as the timestamp
  }
);

documentSchema.index({ program: 1, createdAt: -1 });
documentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Document', documentSchema);
