const express = require('express');
const { subscribeToFacultySse } = require('../controllers/sseController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/faculty', protect, authorizeRoles('dean', 'program_chair', 'professor'), subscribeToFacultySse);

module.exports = router;
