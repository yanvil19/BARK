const Tag = require('../models/Tag');
const Program = require('../models/Program');
const Question = require('../models/Question');
const { logAudit } = require('../utils/auditLogger');

// Helper: resolve program IDs accessible to the requesting user
async function getAccessibleProgramIds(user) {
  if (user.role === 'professor' || user.role === 'program_chair') {
    if (!user.program) return [];
    return [user.program.toString()];
  }
  if (user.role === 'dean') {
    if (!user.department) return [];
    const programs = await Program.find({ department: user.department, isActive: true }).select('_id');
    return programs.map((p) => p._id.toString());
  }
  return [];
}

async function resolveManagedProgramId(req) {
  const accessibleIds = await getAccessibleProgramIds(req.user);

  if (req.user.role === 'program_chair') {
    return req.user.program?.toString() || null;
  }

  if (req.user.role === 'dean') {
    const programId = req.body.programId || req.query.program;
    if (!programId) {
      return { error: 'Dean must specify a program' };
    }
    if (!accessibleIds.includes(String(programId))) {
      return { error: 'Access denied to this program' };
    }
    return String(programId);
  }

  return null;
}

// GET /api/tags?program=<id>
const listTags = async (req, res) => {
  try {
    const accessibleIds = await getAccessibleProgramIds(req.user);
    let programId;

    if (req.query.program) {
      if (!accessibleIds.includes(req.query.program)) {
        return res.status(403).json({ message: 'Access denied to this program' });
      }
      programId = req.query.program;
    } else if (req.user.role === 'professor' || req.user.role === 'program_chair') {
      programId = req.user.program?.toString();
    } else {
      return res.status(400).json({ message: 'Dean must specify a ?program= query parameter' });
    }

    if (!programId) return res.status(400).json({ message: 'No program assigned to your account' });

    const tags = await Tag.find({ program: programId }).sort({ name: 1 });
    res.json({ tags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// POST /api/tags — Program Chair only
const createTag = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Tag name is required' });

    const programId = await resolveManagedProgramId(req);
    if (programId?.error) return res.status(400).json({ message: programId.error });
    if (!programId) return res.status(400).json({ message: 'No program assigned to your account' });

    const existing = await Tag.findOne({ program: programId, name: name.trim() });
    if (existing) return res.status(409).json({ message: 'A tag with this name already exists' });

    const tag = await Tag.create({ name: name.trim(), program: programId, createdBy: req.user._id });
    await logAudit(req.user._id, 'tag_created', 'Tag', tag._id, {
      name: tag.name,
      programId: tag.program,
    });
    res.status(201).json({ tag });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Tag already exists' });
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// PATCH /api/tags/:id — Program Chair only
const updateTag = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Tag name is required' });

    const tag = await Tag.findById(req.params.id);
    if (!tag) return res.status(404).json({ message: 'Tag not found' });

    const accessibleIds = await getAccessibleProgramIds(req.user);
    if (!accessibleIds.includes(tag.program.toString())) {
      return res.status(403).json({ message: 'You can only manage tags for your accessible programs' });
    }

    tag.name = name.trim();
    await tag.save();
    await logAudit(req.user._id, 'tag_updated', 'Tag', tag._id, {
      name: tag.name,
      programId: tag.program,
    });
    res.json({ tag });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A tag with this name already exists' });
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// DELETE /api/tags/:id — Program Chair only (hard delete)
const deleteTag = async (req, res) => {
  try {
    const tag = await Tag.findById(req.params.id);
    if (!tag) return res.status(404).json({ message: 'Tag not found' });

    const accessibleIds = await getAccessibleProgramIds(req.user);
    if (!accessibleIds.includes(tag.program.toString())) {
      return res.status(403).json({ message: 'You can only manage tags for your accessible programs' });
    }

    const questionCount = await Question.countDocuments({ tag: tag._id });
    if (questionCount > 0) {
      return res.status(400).json({ message: 'Cannot delete this subject because it is currently used by one or more questions. Please edit its name instead.' });
    }

    await tag.deleteOne();
    await logAudit(req.user._id, 'tag_deleted', 'Tag', tag._id, {
      name: tag.name,
      programId: tag.program,
    });
    res.json({ message: 'Tag deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

module.exports = { listTags, createTag, updateTag, deleteTag };
