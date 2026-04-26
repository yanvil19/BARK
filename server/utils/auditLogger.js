const AuditLog = require('../models/AuditLog');

/**
 * Log an administrative action to the AuditLog collection.
 * 
 * @param {string} adminId - The ID of the admin performing the action
 * @param {string} action - The action type (from AuditLog enum)
 * @param {string} targetType - The type of object affected
 * @param {string} targetId - The ID of the object affected
 * @param {object} details - Additional metadata about the change
 */
const logAudit = async (adminId, action, targetType, targetId, details = {}) => {
  try {
    await AuditLog.create({
      admin: adminId,
      action,
      targetType,
      targetId,
      details
    });
  } catch (err) {
    // We don't want audit logging failure to crash the main request,
    // but we should definitely log the error to the server console.
    console.error('CRITICAL: Failed to save Audit Log:', err.message);
  }
};

module.exports = { logAudit };
