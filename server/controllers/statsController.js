const User = require('../models/User');
const Department = require('../models/Department');
const Program = require('../models/Program');
const RegistrationRequest = require('../models/RegistrationRequest');
const mongoose = require('mongoose');
const Question = require('../models/Question');

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

        // Database storage stats
        let databaseStorage = null;
        try {
            if (mongoose.connection && mongoose.connection.db) {
                const stats = await mongoose.connection.db.stats();
                const indexSize = stats.indexSize || stats.totalIndexSize || 0;
                const storageSize = stats.storageSize || 0;
                const totalStorageBytes = storageSize + indexSize;
                const limitBytes = 512 * 1024 * 1024; // 512 MB
                databaseStorage = {
                    totalSizeMB: (totalStorageBytes / (1024 * 1024)).toFixed(2),
                    limitMB: 512,
                    percentUsed: ((totalStorageBytes / limitBytes) * 100).toFixed(2),
                    storageSizeMB: (storageSize / (1024 * 1024)).toFixed(2),
                    indexSizeMB: (indexSize / (1024 * 1024)).toFixed(2)
                };
            }
        } catch (dbErr) {
            console.error("Error fetching db stats:", dbErr);
        }

        // Pending Accounts counts
        const [pendingStudents, pendingAlumni] = await Promise.all([
            RegistrationRequest.countDocuments({ status: 'pending', userType: 'student' }),
            RegistrationRequest.countDocuments({ status: 'pending', userType: 'alumni' })
        ]);

        res.status(200).json({
            pendingAccounts: {
                students: pendingStudents,
                alumni: pendingAlumni
            },
            users: usersByRole,
            academic: {
                departments: departmentCount,
                programs: programCount
            },
            total: {
                activeUsers: totalActiveUsers,
                users: totalUsers
            },
            database: databaseStorage
        });

    } catch (error) {
        res.status(500).json({
            message: 'Error fetching statistics',
            error: error.message
        });
    }
};

const getProgramChairStats = async (req, res) => {
  try {
    if (!req.user.program) {
      return res.status(400).json({ message: 'Program Chair has no assigned program' });
    }

    const program = await Program.findById(req.user.program).select('name code');
    if (!program) {
      return res.status(404).json({ message: 'Assigned program not found' });
    }

    const programStudentCount = await User.countDocuments({
      role: 'student',
      program: req.user.program,
      isActive: true,
    });

    const approvedQuestions = await Question.countDocuments({
      program: req.user.program,
      state: 'approved'
    });

    const pendingQuestions = await Question.countDocuments({
      program: req.user.program,
      state: 'pending_chair'
    });

    res.status(200).json({
      programStudentCount: [
        {
          programId: program._id,
          programName: program.name || program.code || 'Assigned Program',
          count: programStudentCount,
        },
      ],
      approvedQuestions,
      passingRate: 0,
      examsPublished: 0,
      pendingQuestions,
      subjectSummary: [],
      reviewQuestions: []
    });

  } catch (error) {
    res.status(500).json({
      message: 'Error fetching program chair stats',
      error: error.message
    });
  }
};

module.exports = { getSummaryStats, getProgramChairStats };