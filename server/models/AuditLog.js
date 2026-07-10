const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'user_created',
      'user_updated',
      'user_deactivated',
      'user_activated',
      'user_deleted',
      'registration_approved',
      'registration_rejected',
      'department_created',
      'department_updated',
      'department_toggled',
      'department_deleted',
      'program_created',
      'program_updated',
      'program_toggled',
      'program_deleted',
      'question_created',
      'question_updated',
      'question_deleted',
      'question_submitted',
      'question_reviewed',
      'question_dean_returned',
      'tag_created',
      'tag_updated',
      'tag_deleted',
      'mock_exam_created',
      'mock_exam_updated',
      'mock_exam_deleted',
      'mock_exam_archived',
      'mock_exam_results_release_scheduled'
    ]
  },
  targetType: {
    type: String,
    required: true,
    enum: ['User', 'Department', 'Program', 'RegistrationRequest', 'Question', 'Tag', 'MockBoardExam']
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries on recent logs
auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
