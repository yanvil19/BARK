const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'singleton',
    },
    emailCooldownDays: {
      type: Number,
      default: 30,
      min: 0,
      max: 365,
    },
    passwordCooldownDays: {
      type: Number,
      default: 7,
      min: 0,
      max: 365,
    },
    maxUploadImages: {
      type: Number,
      default: 5,
      min: 1,
      max: 50,
    },
  },
  { timestamps: true }
);

appSettingsSchema.statics.getSingleton = async function () {
  return await this.findOneAndUpdate(
    { key: 'singleton' },
    { $setOnInsert: { key: 'singleton' } },
    { new: true, upsert: true }
  );
};

module.exports = mongoose.model('AppSettings', appSettingsSchema);

