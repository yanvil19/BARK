const User = require('../models/User');
const Department = require('../models/Department');
const Program = require('../models/Program');
const RegistrationRequest = require('../models/RegistrationRequest');
const mongoose = require('mongoose');
const Question = require('../models/Question');
const AuditLog = require('../models/AuditLog');

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

        // Question Stats (GLOBAL)
        const [totalQuestions, totalApproved, totalPending] = await Promise.all([
            Question.countDocuments(),
            Question.countDocuments({ state: 'approved' }),
            Question.countDocuments({ state: { $in: ['pending_chair', 'pending_dean'] } })
        ]);

        // User counts by department
        const userCountByDept = await User.aggregate([
            { $group: { _id: '$department', count: { $sum: 1 } } }
        ]);
        const deptUserMap = Object.fromEntries(userCountByDept.map(item => [item._id || 'none', item.count]));

        // User counts by program
        const userCountByProg = await User.aggregate([
            { $group: { _id: '$program', count: { $sum: 1 } } }
        ]);
        const progUserMap = Object.fromEntries(userCountByProg.map(item => [item._id || 'none', item.count]));

        res.status(200).json({
            pendingAccounts: {
                students: pendingStudents,
                alumni: pendingAlumni
            },
            users: usersByRole,
            academic: {
                departments: departmentCount,
                programs: programCount,
                deptUserCounts: deptUserMap,
                progUserCounts: progUserMap
            },
            questions: {
                total: totalQuestions,
                approved: totalApproved,
                pending: totalPending
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

    const pendingQuestionsCount = await Question.countDocuments({
      program: req.user.program,
      state: 'pending_chair'
    });

    const facultyStats = await Question.aggregate([
      { $match: { program: req.user.program } },
      {
        $group: {
          _id: '$createdBy',
          totalQuestions: { $sum: 1 },
          pendingQuestions: {
            $sum: { $cond: [{ $eq: ['$state', 'pending_chair'] }, 1, 0] }
          },
          lastSubmittedAt: { $max: '$submittedAt' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'creator'
        }
      },
      { $unwind: '$creator' },
      {
        $project: {
          _id: 1,
          name: '$creator.name',
          role: '$creator.role',
          totalQuestions: 1,
          pendingQuestions: 1,
          lastSubmittedAt: 1
        }
      },
      { $sort: { lastSubmittedAt: -1 } }
    ]);

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
      pendingQuestionsCount,
      facultyStats,
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

const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.find()
        .populate('admin', 'name email role')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.status(200).json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      logs
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audit logs', error: error.message });
  }
};

module.exports = { getSummaryStats, getProgramChairStats, getAuditLogs };