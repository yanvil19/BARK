/**
 * ID Format Configuration (Backend)
 * Format: YYYY-XXXXXX (4-digit year, dash, 6-digit number)
 * Example: 2026-123456
 *
 * Modify the patterns here to change ID format globally
 */

const STUDENT_ID_PATTERN = /^\d{4}-\d{6}$/;
const ALUMNI_ID_PATTERN = /^\d{4}-\d{6}$/;

/**
 * Validate Student ID format
 * @param {string} id - Student ID to validate
 * @returns {boolean}
 */
function validateStudentId(id) {
  return STUDENT_ID_PATTERN.test(String(id || '').trim());
}

/**
 * Validate Alumni ID format
 * @param {string} id - Alumni ID to validate
 * @returns {boolean}
 */
function validateAlumniId(id) {
  return ALUMNI_ID_PATTERN.test(String(id || '').trim());
}

module.exports = {
  STUDENT_ID_PATTERN,
  ALUMNI_ID_PATTERN,
  validateStudentId,
  validateAlumniId,
};
