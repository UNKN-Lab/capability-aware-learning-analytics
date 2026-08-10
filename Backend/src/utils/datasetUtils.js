/**
 * Shared dataset type detection utilities.
 * Single source of truth — import from here instead of defining locally.
 */

import { normalizeText } from "./textUtils.js";

/**
 * Returns true if the dataset is UCI Student Performance.
 * @param {string} datasetName
 * @param {string} sourceDataset
 * @returns {boolean}
 */
export function isUciDataset(datasetName = "", sourceDataset = "") {
  const d = normalizeText(datasetName);
  const s = normalizeText(sourceDataset);
  return (
    d.includes("uci") ||
    s.includes("uci") ||
    d.includes("student_mat") ||
    d.includes("student_por")
  );
}

/**
 * Returns true if the dataset is OULAD (Open University Learning Analytics Dataset).
 * @param {string} datasetName
 * @param {string} sourceDataset
 * @returns {boolean}
 */
export function isOuladDataset(datasetName = "", sourceDataset = "") {
  const d = normalizeText(datasetName);
  const s = normalizeText(sourceDataset);
  return d.includes("oulad") || s.includes("oulad");
}
