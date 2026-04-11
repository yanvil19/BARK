const express = require('express');
const { listDepartments, listPrograms } = require('../controllers/catalogController');

const router = express.Router();

// Public catalog for dropdowns
router.get('/departments', listDepartments);
router.get('/programs', listPrograms);

module.exports = router;

