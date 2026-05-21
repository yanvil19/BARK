const express = require('express');
const { getSettings, updateSettings } = require('../controllers/adminSettingsController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, authorizeRoles('super_admin'), getSettings);
router.patch('/', protect, authorizeRoles('super_admin'), updateSettings);

module.exports = router;

