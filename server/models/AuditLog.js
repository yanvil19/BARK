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
      'registration_approved',
      'registration_rejected',
      'department_created',
      'department_updated',
      'department_toggled',
      'program_created',
      'program_updated',
      'program_toggled'
    ]
  },
  targetType: {
    type: String,
    required: true,
    enum: ['User', 'Department', 'Program', 'RegistrationRequest']
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
