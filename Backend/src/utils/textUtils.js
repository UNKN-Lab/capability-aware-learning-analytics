/**
 * Shared text normalization utilities.
 * Single source of truth — import from here instead of defining locally.
 * Normalize a string value to a consistent lowercase, underscore-separated format.
 * @param {*} value - Any value; will be coerced to string.
 * @returns {string} Normalized string, e.g. "Student ID" → "student_id"
 */
export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
