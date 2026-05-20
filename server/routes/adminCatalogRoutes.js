const express = require('express');
const {
  adminListDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  adminListPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
} = require('../controllers/catalogController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect, authorizeRoles('super_admin'));

// Departments
router.get('/departments', adminListDepartments);
router.post('/departments', createDepartment);
router.patch('/departments/:id', updateDepartment);
router.delete('/departments/:id', deleteDepartment);

// Programs
router.get('/programs', adminListPrograms);
router.post('/programs', createProgram);
router.patch('/programs/:id', updateProgram);
router.delete('/programs/:id', deleteProgram);

module.exports = router;
