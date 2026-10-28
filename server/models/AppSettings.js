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
    // How many answer choices per question may carry an image (0 turns answer images off).
    // Separate from maxUploadImages, which only counts the question's own images.
    maxAnswerImages: {
      type: Number,
      default: 5,
      min: 0,
      max: 5,
    },
    // Images on a question group's shared passage (0 turns them off).
    // Separate from maxUploadImages, which counts each question's own images.
    maxGroupContextImages: {
      type: Number,
      default: 5,
      min: 0,
      max: 50,
    },
  },
  { timestamps: true }
);

appSettingsSchema.statics.getSingleton = async function () {
  return await this.findOneAndUpdate(
    { key: 'singleton' },
    { $setOnInsert: { key: 'singleton' } },
    { returnDocument: 'after', upsert: true }
  );
};

module.exports = mongoose.model('AppSettings', appSettingsSchema);

