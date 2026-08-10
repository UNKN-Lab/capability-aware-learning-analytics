import { formatDisplayValue } from "./formatDisplayValue";

/**
 * responseTransformer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Task 4: Response handler — map API response → display-ready format.
 *
 * Backend trả về datasets dạng:
 *   { "score_trend": [{ assessment_order: 1, score_normalized: 78.5 }, ...] }
 *
 * Transformer chuyển thành format phẳng cho DataTable:
 *   { columns: ["assessment_order", "score_normalized"], rows: [...] }
 *
 * Phase 3 sẽ thêm chart adapters. Phase 2 chỉ cần table + raw JSON.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Extract column names from a dataset array.
 * Scans first row's keys as column headers.
 *
 * @param {Object[]} rows — Array of row objects
 * @returns {string[]} — Column names
 */
export function extractColumns(rows) {
  if (!rows || rows.length === 0) return [];
  return Object.keys(rows[0]);
}

/**
 * Transform analytics response datasets into a flat table structure.
 * Handles both single-query and multi-query responses.
 *
 * @param {Object} datasets — { "label": [...rows] }
 * @returns {{ label: string, columns: string[], rows: Object[] }[]}
 */
export function transformToTableData(datasets) {
  if (!datasets || typeof datasets !== "object") return [];

  return Object.entries(datasets).map(([label, rows]) => ({
    label,
    columns: extractColumns(rows),
    rows: Array.isArray(rows) ? rows : [],
    rowCount: Array.isArray(rows) ? rows.length : 0,
  }));
}

/**
 * Format a cell value for display.
 * Handles numbers (round to 2 decimals), booleans, nulls.
 *
 * @param {*} value — Raw cell value
 * @returns {string} — Formatted display string
 */
export function formatCellValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "✓ Yes" : "✗ No";
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join("; ") : "None";
  }
  if (typeof value === "number") {
    // Integer check — don't add decimals to whole numbers
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === "object") {
    return formatDisplayValue(value);
  }
  return String(value);
}

/**
 * Get a human-readable summary of the execution result.
 *
 * @param {Object} meta — Response meta object
 * @returns {{ confidence: string, reason: string, queryTime: number, warnings: string[] }}
 */
export function extractQualitySummary(meta) {
  if (!meta) return null;

  return {
    confidence: meta.dataQuality?.confidence ?? "UNKNOWN",
    reason: meta.dataQuality?.confidence_reason ?? "",
    status: meta.dataQuality?.status ?? "unknown",
    queryTime: meta.executionTimeMs ?? 0,
    queryCount: meta.queryCount ?? 1,
    isMultiQuery: meta.isMultiQuery ?? false,
    warnings: meta.dataQuality?.warnings ?? [],
  };
}
