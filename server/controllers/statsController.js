const User = require('../models/User');
const Department = require('../models/Department');
const Program = require('../models/Program');

// @desc    Get counts for dashboard/landing page
// @route   GET /api/stats/summary
// @access  Public
const getSummaryStats = async (req, res) => {
    try {
        const roles = [
            'student',
            'alumni',
            'professor',
            'program_chair',
            'dean',
            'super_admin'
        ];

        // ACTIVE counts per role
        const activeCounts = await Promise.all(
            roles.map(role =>
                User.countDocuments({ role, isActive: true })
            )
        );

        // TOTAL counts per role
        const totalCounts = await Promise.all(
            roles.map(role =>
                User.countDocuments({ role })
            )
        );

        // Build structured user stats
        const usersByRole = Object.fromEntries(
            roles.map((role, i) => ({
                role,
                active: activeCounts[i],
                total: totalCounts[i]
            })).map(item => [
                item.role,
                {
                    active: item.active,
                    total: item.total
                }
            ])
        );

        // Academic counts
        const [departmentCount, programCount] = await Promise.all([
            Department.countDocuments({ isActive: true }),
            Program.countDocuments({ isActive: true })
        ]);

        // Totals
        const totalActiveUsers = activeCounts.reduce((a, b) => a + b, 0);
        const totalUsers = totalCounts.reduce((a, b) => a + b, 0);

        res.status(200).json({
            users: usersByRole,
            academic: {
                departments: departmentCount,
                programs: programCount
            },
            total: {
                activeUsers: totalActiveUsers,
                users: totalUsers
            }
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error fetching statistics',
            error: error.message
        });
    }
};

module.exports = { getSummaryStats };