const express = require('express');
const router = express.Router();
const { getSummaryStats } = require('../controllers/statsController');

router.get('/summary', getSummaryStats);

module.exports = router;
