const mongoose = require('mongoose');
const Department = require('../models/Department');
const Program = require('../models/Program');
const { logAudit } = require('../utils/auditLogger');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function pickPagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limitRaw = parseInt(query.limit, 10) || 50;
  const limit = Math.min(Math.max(limitRaw, 1), 200);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

// Public (active only)
const listDepartments = async (req, res) => {
  try {
    const { page, limit, skip } = pickPagination(req.query);
    const filter = { isActive: true };
    const [total, departments] = await Promise.all([
      Department.countDocuments(filter),
      Department.find(filter).sort({ code: 1 }).skip(skip).limit(limit),
    ]);

    res.status(200).json({ page, limit, total, pages: Math.ceil(total / limit), departments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Public (active only)
const listPrograms = async (req, res) => {
  try {
    const { page, limit, skip } = pickPagination(req.query);
    const filter = { isActive: true };
    if (req.query.departmentId) {
      if (!isObjectId(req.query.departmentId)) {
        return res.status(400).json({ message: 'Invalid departmentId' });
      }
      filter.department = req.query.departmentId;
    }

    const [total, programs] = await Promise.all([
      Program.countDocuments(filter),
      Program.find(filter).populate('department', 'name code').sort({ code: 1 }).skip(skip).limit(limit),
    ]);

    res.status(200).json({ page, limit, total, pages: Math.ceil(total / limit), programs });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Admin
const adminListDepartments = async (req, res) => {
  try {
    const { page, limit, skip } = pickPagination(req.query);
    const filter = {};
    if (req.query.isActive === 'true') filter.isActive = true;
    if (req.query.isActive === 'false') filter.isActive = false;

    const [total, departments] = await Promise.all([
      Department.countDocuments(filter),
      Department.find(filter).sort({ code: 1 }).skip(skip).limit(limit),
    ]);

    res.status(200).json({ page, limit, total, pages: Math.ceil(total / limit), departments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Admin
const createDepartment = async (req, res) => {
  try {
    const { name, code } = req.body || {};
    if (!name || !code) {
      return res.status(400).json({ message: 'Please provide name and code' });
    }
    const dept = await Department.create({ name, code });
    
    await logAudit(req.user._id, 'department_created', 'Department', dept._id, {
      name: dept.name,
      code: dept.code
    });
    res.status(201).json({ message: 'Department created', department: dept });
  } catch (error) {
    res.status(400).json({ message: 'Failed to create department', error: error.message });
  }
};

// Admin
const updateDepartment = async (req, res) => {
  try {
    const { name, code, isActive } = req.body || {};
    const update = {};
    if (typeof name === 'string' && name.trim()) update.name = name.trim();
    if (typeof code === 'string' && code.trim()) update.code = code.trim();
    if (typeof isActive === 'boolean') update.isActive = isActive;

    const dept = await Department.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!dept) return res.status(404).json({ message: 'Department not found' });

    const isToggle = Object.keys(update).length === 1 && Object.prototype.hasOwnProperty.call(update, 'isActive');
    await logAudit(req.user._id, isToggle ? 'department_toggled' : 'department_updated', 'Department', dept._id, {
      update
    });
    res.status(200).json({ message: 'Department updated', department: dept });
  } catch (error) {
    res.status(400).json({ message: 'Failed to update department', error: error.message });
  }
};

// Admin
const adminListPrograms = async (req, res) => {
  try {
    const { page, limit, skip } = pickPagination(req.query);
    const filter = {};
    if (req.query.isActive === 'true') filter.isActive = true;
    if (req.query.isActive === 'false') filter.isActive = false;
    if (req.query.departmentId) {
      if (!isObjectId(req.query.departmentId)) {
        return res.status(400).json({ message: 'Invalid departmentId' });
      }
      filter.department = req.query.departmentId;
    }

    const [total, programs] = await Promise.all([
      Program.countDocuments(filter),
      Program.find(filter).populate('department', 'name code').sort({ code: 1 }).skip(skip).limit(limit),
    ]);

    res.status(200).json({ page, limit, total, pages: Math.ceil(total / limit), programs });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Admin
const createProgram = async (req, res) => {
  try {
    const { name, code, departmentId } = req.body || {};
    if (!name || !code || !departmentId) {
      return res.status(400).json({ message: 'Please provide name, code, and departmentId' });
    }
    if (!isObjectId(departmentId)) {
      return res.status(400).json({ message: 'Invalid departmentId' });
    }

    const dept = await Department.findById(departmentId);
    if (!dept) return res.status(404).json({ message: 'Department not found' });

    const program = await Program.create({ name, code, department: departmentId });
    
    await logAudit(req.user._id, 'program_created', 'Program', program._id, {
      name: program.name,
      code: program.code,
      departmentId: program.department
    });
    res.status(201).json({ message: 'Program created', program });
  } catch (error) {
    res.status(400).json({ message: 'Failed to create program', error: error.message });
  }
};

// Admin
const updateProgram = async (req, res) => {
  try {
    const { name, code, departmentId, isActive } = req.body || {};
    const update = {};
    if (typeof name === 'string' && name.trim()) update.name = name.trim();
    if (typeof code === 'string' && code.trim()) update.code = code.trim();
    if (typeof isActive === 'boolean') update.isActive = isActive;

    if (departmentId !== undefined) {
      if (!isObjectId(departmentId)) {
        return res.status(400).json({ message: 'Invalid departmentId' });
      }
      const dept = await Department.findById(departmentId);
      if (!dept) return res.status(404).json({ message: 'Department not found' });
      update.department = departmentId;
    }

    const program = await Program.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!program) return res.status(404).json({ message: 'Program not found' });

    const isToggle = Object.keys(update).length === 1 && Object.prototype.hasOwnProperty.call(update, 'isActive');
    await logAudit(req.user._id, isToggle ? 'program_toggled' : 'program_updated', 'Program', program._id, {
      update
    });
    res.status(200).json({ message: 'Program updated', program });
  } catch (error) {
    res.status(400).json({ message: 'Failed to update program', error: error.message });
  }
};

module.exports = {
  listDepartments,
  listPrograms,
  adminListDepartments,
  createDepartment,
  updateDepartment,
  adminListPrograms,
  createProgram,
  updateProgram,
};

