const User = require('../models/User');
const Department = require('../models/Department');
const Program = require('../models/Program');

// @desc    Get counts for the Home/Landing page
// @route   GET /api/stats/summary
// @access  Public
const getSummaryStats = async (req, res) => {
    try {
        const [studentCount, professorCount, departmentCount, programCount] = await Promise.all([
            User.countDocuments({ role: 'student', isActive: true }),
            User.countDocuments({ role: 'professor', isActive: true }),
            Department.countDocuments({ isActive: true }),
            Program.countDocuments({ isActive: true }),
        ]);

        res.status(200).json({
            students: studentCount,
            professors: professorCount,
            departments: departmentCount,
            programs: programCount,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching statistics', error: error.message });
    }
};

module.exports = { getSummaryStats };