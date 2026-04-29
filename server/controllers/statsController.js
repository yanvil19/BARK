const User = require('../models/User');
const Department = require('../models/Department');
const Program = require('../models/Program');
const RegistrationRequest = require('../models/RegistrationRequest');
const mongoose = require('mongoose');
const Question = require('../models/Question');
const AuditLog = require('../models/AuditLog');
const MockBoardExam = require('../models/MockBoardExam');
const Tag = require('../models/Tag');

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

const getDeanDashboardStats = async (req, res) => {
  try {
    if (!req.user.department) {
      return res.status(400).json({ message: 'Dean department is not set' });
    }

    const department = await Department.findById(req.user.department).select('name code');
    if (!department) {
      return res.status(404).json({ message: 'Dean department not found' });
    }

    const programs = await Program.find({ department: req.user.department, isActive: true }).select('_id name code');
    const programIds = programs.map((program) => program._id);

    const [
      studentCountsRaw,
      approvedQuestionsByProgramRaw,
      subjectCountsByProgramRaw,
      mockExamCountsRaw,
      pendingRegistrations,
      myQuestionsByStateRaw,
      recentActivity,
      approvedQuestionsByTagRaw,
      tags,
    ] = await Promise.all([
      User.aggregate([
        {
          $match: {
            role: 'student',
            isActive: true,
            program: { $in: programIds },
          },
        },
        {
          $group: {
            _id: '$program',
            count: { $sum: 1 },
          },
        },
      ]),
      Question.aggregate([
        {
          $match: {
            program: { $in: programIds },
            state: 'approved',
          },
        },
        {
          $group: {
            _id: '$program',
            count: { $sum: 1 },
          },
        },
      ]),
      Tag.aggregate([
        {
          $match: {
            program: { $in: programIds },
            isActive: true,
          },
        },
        {
          $group: {
            _id: '$program',
            count: { $sum: 1 },
          },
        },
      ]),
      MockBoardExam.aggregate([
        {
          $match: {
            program: { $in: programIds },
          },
        },
        {
          $group: {
            _id: '$program',
            total: { $sum: 1 },
            published: {
              $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] },
            },
            draft: {
              $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] },
            },
            archived: {
              $sum: { $cond: [{ $eq: ['$status', 'archived'] }, 1, 0] },
            },
          },
        },
      ]),
      RegistrationRequest.countDocuments({
        department: req.user.department,
        status: 'pending',
      }),
      Question.aggregate([
        {
          $match: {
            createdBy: req.user._id,
          },
        },
        {
          $group: {
            _id: '$state',
            count: { $sum: 1 },
          },
        },
      ]),
      AuditLog.find({ admin: req.user._id })
        .sort({ timestamp: -1 })
        .limit(8),
      Question.aggregate([
        {
          $match: {
            program: { $in: programIds },
            state: 'approved',
          },
        },
        {
          $group: {
            _id: '$tag',
            count: { $sum: 1 },
          },
        },
      ]),
      Tag.find({ program: { $in: programIds }, isActive: true }).select('_id name program').populate('program', 'name code'),
    ]);

    const studentCountMap = Object.fromEntries(studentCountsRaw.map((item) => [String(item._id), item.count]));
    const approvedQuestionMap = Object.fromEntries(approvedQuestionsByProgramRaw.map((item) => [String(item._id), item.count]));
    const subjectCountMap = Object.fromEntries(subjectCountsByProgramRaw.map((item) => [String(item._id), item.count]));
    const mockExamMap = Object.fromEntries(mockExamCountsRaw.map((item) => [String(item._id), item]));
    const approvedQuestionsByTagMap = Object.fromEntries(approvedQuestionsByTagRaw.map((item) => [String(item._id), item.count]));
    const myQuestionStateMap = Object.fromEntries(myQuestionsByStateRaw.map((item) => [item._id, item.count]));

    const programStudentCount = programs.map((program) => ({
      programId: program._id,
      programName: program.name,
      programCode: program.code,
      count: studentCountMap[String(program._id)] || 0,
    }));

    const totalApprovedQuestions = approvedQuestionsByProgramRaw.reduce((sum, item) => sum + item.count, 0);
    const examsPublished = mockExamCountsRaw.reduce((sum, item) => sum + (item.published || 0), 0);
    const draftExams = mockExamCountsRaw.reduce((sum, item) => sum + (item.draft || 0), 0);
    const returnedQuestions = myQuestionStateMap.returned || 0;

    const subjectCoverage = tags
      .map((tag) => ({
        tagId: tag._id,
        name: tag.name,
        programName: tag.program?.name || tag.program?.code || 'Program',
        approvedQuestions: approvedQuestionsByTagMap[String(tag._id)] || 0,
      }))
      .sort((a, b) => a.approvedQuestions - b.approvedQuestions || a.name.localeCompare(b.name))
      .slice(0, 6);

    const programOverview = programs.map((program) => {
      const exams = mockExamMap[String(program._id)] || {};
      return {
        programId: program._id,
        programName: program.name,
        programCode: program.code,
        students: studentCountMap[String(program._id)] || 0,
        approvedQuestions: approvedQuestionMap[String(program._id)] || 0,
        subjects: subjectCountMap[String(program._id)] || 0,
        publishedExams: exams.published || 0,
        draftExams: exams.draft || 0,
      };
    });

    const programsWithoutPublishedExams = programOverview.filter((program) => program.publishedExams === 0).length;
    const lowCoverageSubjects = subjectCoverage.filter((subject) => subject.approvedQuestions < 3).length;

    const attentionItems = [
      pendingRegistrations > 0
        ? { key: 'pendingRegistrations', label: `${pendingRegistrations} pending student registrations`, tone: 'warning' }
        : null,
      returnedQuestions > 0
        ? { key: 'returnedQuestions', label: `${returnedQuestions} of your questions were returned for revision`, tone: 'warning' }
        : null,
      draftExams > 0
        ? { key: 'draftExams', label: `${draftExams} mock board exams are still in draft`, tone: 'info' }
        : null,
      programsWithoutPublishedExams > 0
        ? { key: 'programsWithoutPublishedExams', label: `${programsWithoutPublishedExams} programs have no published exam yet`, tone: 'info' }
        : null,
      lowCoverageSubjects > 0
        ? { key: 'lowCoverageSubjects', label: `${lowCoverageSubjects} subjects have low approved-question coverage`, tone: 'warning' }
        : null,
    ].filter(Boolean);

    res.status(200).json({
      department,
      summary: {
        totalApprovedQuestions,
        examsPublished,
        draftExams,
        pendingRegistrations,
        returnedQuestions,
        myDraftQuestions: myQuestionStateMap.draft || 0,
        myPendingQuestions: myQuestionStateMap.pending_chair || 0,
        myApprovedQuestions: myQuestionStateMap.approved || 0,
      },
      programStudentCount,
      subjectCoverage,
      programOverview,
      attentionItems,
      recentActivity,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching dean dashboard stats',
      error: error.message,
    });
  }
};

module.exports = { getSummaryStats, getProgramChairStats, getAuditLogs, getDeanDashboardStats };
