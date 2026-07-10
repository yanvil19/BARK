const express = require('express');
const { getSettings, getPublicSettings, updateSettings, updateSettingsPending, cancelSettingsUpdate, getPendingStatus } = require('../controllers/adminSettingsController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/public', protect, authorizeRoles('super_admin', 'dean', 'program_chair', 'professor'), getPublicSettings);
router.get('/', protect, authorizeRoles('super_admin'), getSettings);
router.patch('/', protect, authorizeRoles('super_admin'), updateSettings);
router.post('/pending', protect, authorizeRoles('super_admin'), updateSettingsPending);
router.post('/cancel', protect, authorizeRoles('super_admin'), cancelSettingsUpdate);
router.get('/status', protect, authorizeRoles('super_admin', 'dean', 'program_chair', 'professor'), getPendingStatus);

module.exports = router;

