/**
 * capabilityUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared utility for capability-based task filtering.
 *
 * This module is the SINGLE SOURCE OF TRUTH for:
 *   1. Loading the dataset capability matrix
 *   2. Checking task compatibility against a dataset
 *
 * Used by:
 *   - src/services/capabilityValidator.service.js  (API runtime path)
 *   - scripts/runtimeSemanticValidator.js           (offline validation path)
 *
 * Both paths use the same function, the same matrix file, the same logic.
 * No dual compatibility systems.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Dataset capability matrix — loaded once at module init (sync, small file).
 * Path: src/config/datasetCapabilityMatrix.json
 */
const MATRIX_PATH = join(__dirname, "../config/datasetCapabilityMatrix.json");
export const capabilityMatrix = JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8"));

/**
 * Checks whether a dataset type satisfies a task's requiredCapabilities.
 *
 * @param {string}   datasetType - e.g. 'UCI' | 'OULAD'
 * @param {string[]} required    - task.requiredCapabilities[]
 * @returns {{ compatible: boolean, missingCapabilities: string[] }}
 *
 * @example
 * checkCapabilityCompatibility('UCI', ['assessment_scores', 'engagement_tracking'])
 * // → { compatible: false, missingCapabilities: ['engagement_tracking'] }
 */
export function checkCapabilityCompatibility(datasetType, required = []) {
  const datasetCaps = capabilityMatrix[datasetType] || {};
  const missingCapabilities = required.filter((cap) => !datasetCaps[cap]);
  return {
    compatible: missingCapabilities.length === 0,
    missingCapabilities,
  };
}

/**
 * Returns a human-readable skip reason string for a task.
 *
 * @param {Object} task          - task object from registry
 * @param {string} datasetType   - active dataset type
 * @returns {string}
 */
export function buildSkipReason(task, datasetType) {
  if (task.requiredCapabilities?.length > 0) {
    const { missingCapabilities } = checkCapabilityCompatibility(
      datasetType,
      task.requiredCapabilities
    );
    if (missingCapabilities.length > 0) {
      return `MISSING_CAPABILITIES: [${missingCapabilities.join(", ")}] not available in ${datasetType} dataset`;
    }
  }
  return `datasetCompatibility=${task.datasetCompatibility ?? "unknown"}, activeDataset=${datasetType}`;
}
