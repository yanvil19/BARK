const Tag = require('../models/Tag');
const Program = require('../models/Program');
const Question = require('../models/Question');

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
    res.status(500).json({ message: err.message });
  }
};

// POST /api/tags — Program Chair only
const createTag = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Tag name is required' });

    const programId = req.user.program;
    if (!programId) return res.status(400).json({ message: 'No program assigned to your account' });

    const existing = await Tag.findOne({ program: programId, name: name.trim() });
    if (existing) return res.status(409).json({ message: 'A tag with this name already exists' });

    const tag = await Tag.create({ name: name.trim(), program: programId, createdBy: req.user._id });
    res.status(201).json({ tag });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Tag already exists' });
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/tags/:id — Program Chair only
const updateTag = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Tag name is required' });

    const tag = await Tag.findById(req.params.id);
    if (!tag) return res.status(404).json({ message: 'Tag not found' });

    if (tag.program.toString() !== req.user.program?.toString()) {
      return res.status(403).json({ message: 'You can only manage tags for your own program' });
    }

    tag.name = name.trim();
    await tag.save();
    res.json({ tag });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A tag with this name already exists' });
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/tags/:id — Program Chair only (hard delete)
const deleteTag = async (req, res) => {
  try {
    const tag = await Tag.findById(req.params.id);
    if (!tag) return res.status(404).json({ message: 'Tag not found' });

    if (tag.program.toString() !== req.user.program?.toString()) {
      return res.status(403).json({ message: 'You can only manage tags for your own program' });
    }

    const questionCount = await Question.countDocuments({ tag: tag._id });
    if (questionCount > 0) {
      return res.status(400).json({ message: 'Cannot delete this subject because it is currently used by one or more questions. Please edit its name instead.' });
    }

    await tag.deleteOne();
    res.json({ message: 'Tag deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { listTags, createTag, updateTag, deleteTag };
