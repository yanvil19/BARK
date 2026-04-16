/**
 * ID Format Configuration
 * Format: YYYY-XXXXXX (4-digit year, dash, 6-digit number)
 * Example: 2026-123456
 *
 * Modify the pattern, placeholder, and errorMessage here to change ID format globally
 */

export const ID_FORMATS = {
  STUDENT_ID: {
    pattern: /^\d{4}-\d{6}$/,
    placeholder: "YYYY-XXXXXX (e.g., 2026-123456)",
    errorMessage: "Student ID must be in format YYYY-XXXXXX (e.g., 2026-123456)"
  },
  ALUMNI_ID: {
    pattern: /^\d{4}-\d{6}$/,
    placeholder: "YYYY-XXXXXX (e.g., 2026-123456)",
    errorMessage: "Alumni ID must be in format YYYY-XXXXXX (e.g., 2026-123456)"
  }
};

/**
 * Validate Student ID format
 * @param {string} id - Student ID to validate
 * @returns {boolean}
 */
export function validateStudentId(id) {
  return ID_FORMATS.STUDENT_ID.pattern.test(String(id).trim());
}

/**
 * Validate Alumni ID format
 * @param {string} id - Alumni ID to validate
 * @returns {boolean}
 */
export function validateAlumniId(id) {
  return ID_FORMATS.ALUMNI_ID.pattern.test(String(id).trim());
}

/**
 * Get error message for Student ID validation
 * @returns {string}
 */
export function getStudentIdErrorMessage() {
  return ID_FORMATS.STUDENT_ID.errorMessage;
}

/**
 * Get error message for Alumni ID validation
 * @returns {string}
 */
export function getAlumniIdErrorMessage() {
  return ID_FORMATS.ALUMNI_ID.errorMessage;
}
