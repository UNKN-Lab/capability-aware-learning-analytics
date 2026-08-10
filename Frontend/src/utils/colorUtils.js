/**
 * colorUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides deterministic colors based on string hashes.
 * Ensures that 'Physics' always gets the same color across different charts
 * and re-renders, preventing color-flickering.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PALETTE = [
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#14b8a6", // Teal
  "#6366f1", // Indigo
];

/**
 * Simple string hash function
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/**
 * Returns a stable color from the palette for any given string
 * @param {string} key - The series name or category label
 * @returns {string} Hex color code
 */
export function getStableColor(key) {
  if (!key) return PALETTE[0];
  const index = hashString(String(key)) % PALETTE.length;
  return PALETTE[index];
}
