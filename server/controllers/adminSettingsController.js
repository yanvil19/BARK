const AppSettings = require('../models/AppSettings');
const settingsManager = require('../services/settingsManager');

function toIntOrUndefined(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

// @desc    Get application settings (singleton)
// @route   GET /api/admin/settings
// @access  Private (Super Admin only — enforced in route)
const getSettings = async (req, res) => {
  try {
    const settings = await AppSettings.getSingleton();
    const pendingStatus = await settingsManager.getPendingStatus();
    res.status(200).json({ settings, pendingStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// @desc    Get non-sensitive public settings (for faculty — only exposes what they need)
// @route   GET /api/admin/settings/public
// @access  Private (all faculty roles)
const getPublicSettings = async (req, res) => {
  try {
    const settings = await AppSettings.getSingleton();
    res.status(200).json({
      maxUploadImages: settings.maxUploadImages ?? 5,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

const updateSettingsPending = async (req, res) => {
  try {
    const emailCooldownDays = toIntOrUndefined(req.body?.emailCooldownDays);
    const passwordCooldownDays = toIntOrUndefined(req.body?.passwordCooldownDays);
    const maxUploadImages = toIntOrUndefined(req.body?.maxUploadImages);

    const payload = {};
    if (emailCooldownDays !== undefined) payload.emailCooldownDays = emailCooldownDays;
    if (passwordCooldownDays !== undefined) payload.passwordCooldownDays = passwordCooldownDays;
    if (maxUploadImages !== undefined) payload.maxUploadImages = maxUploadImages;

    const pending = await settingsManager.startCountdown(payload, req.user._id);
    res.status(200).json({ message: 'Settings update pending.', pending });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message || 'Something went wrong. Please try again later.' });
  }
};

// @desc    Directly update application settings (no pending flow)
// @route   PATCH /api/admin/settings
// @access  Private (Super Admin only)
const updateSettings = async (req, res) => {
  try {
    const emailCooldownDays = toIntOrUndefined(req.body?.emailCooldownDays);
    const passwordCooldownDays = toIntOrUndefined(req.body?.passwordCooldownDays);
    const maxUploadImages = toIntOrUndefined(req.body?.maxUploadImages);

    const update = {};
    if (emailCooldownDays !== undefined) update.emailCooldownDays = emailCooldownDays;
    if (passwordCooldownDays !== undefined) update.passwordCooldownDays = passwordCooldownDays;
    if (maxUploadImages !== undefined) update.maxUploadImages = maxUploadImages;

    const settings = await AppSettings.findOneAndUpdate(
      { key: 'singleton' },
      { $set: update },
      { new: true, upsert: true, returnDocument: 'after' }
    );

    res.status(200).json(settings.toObject());
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message || 'Something went wrong. Please try again later.' });
  }
};

const cancelSettingsUpdate = async (req, res) => {
  try {
    await settingsManager.cancelCountdown();
    res.status(200).json({ message: 'Settings update cancelled.' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message || 'Something went wrong. Please try again later.' });
  }
};

const getPendingStatus = async (req, res) => {
  try {
    const status = await settingsManager.getPendingStatus();
    res.status(200).json(status);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

module.exports = { getSettings, getPublicSettings, updateSettings, updateSettingsPending, cancelSettingsUpdate, getPendingStatus };

