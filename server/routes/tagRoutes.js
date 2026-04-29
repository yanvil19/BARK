const express = require('express');
const { listTags, createTag, updateTag, deleteTag } = require('../controllers/tagController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const FACULTY = ['professor', 'program_chair', 'dean'];

router.get('/', protect, authorizeRoles(...FACULTY), listTags);
router.post('/', protect, authorizeRoles('program_chair', 'dean'), createTag);
router.patch('/:id', protect, authorizeRoles('program_chair', 'dean'), updateTag);
router.delete('/:id', protect, authorizeRoles('program_chair', 'dean'), deleteTag);

module.exports = router;
