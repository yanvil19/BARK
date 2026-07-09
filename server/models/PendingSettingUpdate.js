const mongoose = require('mongoose');

const pendingSettingUpdateSchema = new mongoose.Schema(
  {
    settingsPayload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'applied', 'cancelled'],
      default: 'pending',
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PendingSettingUpdate', pendingSettingUpdateSchema);
