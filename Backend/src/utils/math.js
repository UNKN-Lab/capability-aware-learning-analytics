/**
 * Centralized math utilities to prevent "metric drift" and ensure
 * consistent precision across all analytical outputs.
 */

/**
 * Safely rounds a number to a specified number of decimal places.
 * Handles null/undefined/NaN inputs gracefully by returning null.
 *
 * @param {number|null} value - The number to round
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {number|null} - Rounded number or null
 */
export function safeRound(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Computes a pass rate given passed count and total count.
 * Returns null if total is 0 to avoid division by zero.
 * Rounds to 4 decimal places by default for precision in percentages.
 *
 * @param {number} passedCount - Number of passed instances
 * @param {number} totalCount - Total number of instances
 * @param {number} decimals - Number of decimal places (default: 4)
 * @returns {number|null} - Pass rate or null
 */
export function computePassRate(passedCount, totalCount, decimals = 4) {
  if (!totalCount || totalCount === 0) return null;
  return safeRound(passedCount / totalCount, decimals);
}
