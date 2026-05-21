const AppSettings = require('../models/AppSettings');

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
    res.status(200).json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// @desc    Update application settings (singleton)
// @route   PATCH /api/admin/settings
// @access  Private (Super Admin only — enforced in route)
const updateSettings = async (req, res) => {
  try {
    const settings = await AppSettings.getSingleton();

    const emailCooldownDays = toIntOrUndefined(req.body?.emailCooldownDays);
    const passwordCooldownDays = toIntOrUndefined(req.body?.passwordCooldownDays);

    if (emailCooldownDays !== undefined) settings.emailCooldownDays = emailCooldownDays;
    if (passwordCooldownDays !== undefined) settings.passwordCooldownDays = passwordCooldownDays;

    await settings.save();
    res.status(200).json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

module.exports = { getSettings, updateSettings };

