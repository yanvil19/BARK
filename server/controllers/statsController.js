const User = require('../models/User');
const Department = require('../models/Department');
const Program = require('../models/Program');
const RegistrationRequest = require('../models/RegistrationRequest');
const Question = require('../models/Question'); // Added
const Exam = require('../models/Exam'); // Added
const ExamResult = require('../models/ExamResult'); // Added
const mongoose = require('mongoose');

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
            roles.map((role, i) => [
                role,
                {
                    active: activeCounts[i],
                    total: totalCounts[i]
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

// @desc    Get program chair dashboard stats
// @route   GET /api/program-chair/stats
// @access  Program Chair
const getProgramChairStats = async (req, res) => {
  try {
    const chairId = req.user._id;
    
    // 1. Get the chair and populate programs
    const chair = await User.findById(chairId).populate('programs');
    
    // DEBUG: See if the chair has programs in the console
    console.log(`--- Stats Request for Chair: ${chair?.name} ---`);
    console.log(`Assigned Programs count: ${chair?.programs?.length || 0}`);

    if (!chair || !chair.programs || chair.programs.length === 0) {
      return res.status(200).json({
        programStudentCount: [],
        totalQuestions: 0,
        pendingQuestionsCount: 0,
        examsPublished: 0,
        totalPassingRate: 0,
        subjectSuccessRates: []
      });
    }

    const programIds = chair.programs.map(p => p._id);

    // 2. Count students - CRITICAL: Verify the field name is 'program' in your User model
    const programStudentCount = await Promise.all(
      chair.programs.map(async (prog) => {
        const count = await User.countDocuments({
          role: 'student',
          isActive: true,
          program: prog._id 
        });
        return { programName: prog.name, count };
      })
    );

    // 3. Gather other stats
    const [totalQuestions, pendingQuestionsCount, examsPublished] = await Promise.all([
      Question.countDocuments({ program: { $in: programIds } }),
      Question.countDocuments({ program: { $in: programIds }, status: 'pending' }),
      Exam.countDocuments({ program: { $in: programIds }, isPublished: true })
    ]);

    // 4. Success Rates
    const subjectSuccessRates = await ExamResult.aggregate([
      { $match: { program: { $in: programIds } } },
      {
        $group: {
          _id: '$subject',
          totalAttempts: { $sum: 1 },
          passed: { $sum: { $cond: ['$passed', 1, 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          label: '$_id',
          value: {
            $round: [
              { $cond: [{ $eq: ['$totalAttempts', 0] }, 0, { $multiply: [{ $divide: ['$passed', '$totalAttempts'] }, 100] }] },
              0
            ]
          }
        }
      }
    ]);

    const totalPassingRate = subjectSuccessRates.length
      ? Math.round(subjectSuccessRates.reduce((sum, s) => sum + s.value, 0) / subjectSuccessRates.length)
      : 0;

    res.status(200).json({
      programStudentCount,
      totalQuestions,
      pendingQuestionsCount,
      examsPublished,
      totalPassingRate,
      subjectSuccessRates
    });
  } catch (error) {
    console.error("Stats Error:", error);
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
};

module.exports = { 
    getSummaryStats, 
    getProgramChairStats 
};