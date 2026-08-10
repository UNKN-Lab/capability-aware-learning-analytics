/**
 * Machine-readable warning/error codes for the Capability Validator.
 *
 * Each code carries:
 *   code     — stable identifier for frontend/AI to programmatically react
 *   severity — "error" (hard block) | "warning" (soft) | "info" (advisory)
 *
 * Usage:
 *   import { WarningCodes } from '../constants/warningCodes.js';
 *   warnings.push({ ...WarningCodes.INSUFFICIENT_TEMPORAL_POINTS, message: '...', context: {...} });
 *
 * Benefits vs plain strings:
 *   - Frontend can render localized messages based on code
 *   - AI repair loop can detect and fix specific issues programmatically
 *   - Automated evaluation can assert on deterministic codes, not string matching
 *   - Logging/monitoring can alert on specific severity levels
 */

export const WarningCodes = {
  // ── Layer B: Semantic ───────────────────────────────────────────────────
  DATASET_MISMATCH: {
    code:     "DATASET_MISMATCH",
    severity: "error",
  },
  FEATURE_NOT_POPULATED: {
    code:     "FEATURE_NOT_POPULATED",
    severity: "warning",
  },
  SEMANTIC_PROXY_COMPETENCY: {
    code:     "SEMANTIC_PROXY_COMPETENCY",
    severity: "info",
    //  Emitted when a task uses assessment_name as a proxy for competency_tag
    //  because the active dataset lacks a native competency ontology.
    //  Does NOT block execution — purely advisory for UI badge + AI context.
  },

  // ── Layer C: Analytical ─────────────────────────────────────────────────
  INSUFFICIENT_TEMPORAL_POINTS: {
    code:     "INSUFFICIENT_TEMPORAL_POINTS",
    severity: "warning",
  },
  INSUFFICIENT_STUDENT_COUNT: {
    code:     "INSUFFICIENT_STUDENT_COUNT",
    severity: "warning",
  },

  // ── Layer D: Data Sufficiency ───────────────────────────────────────────
  ENROLLMENT_BELOW_MINIMUM: {
    code:     "ENROLLMENT_BELOW_MINIMUM",
    severity: "error",
  },
  ASSESSMENT_RESULTS_BELOW_MINIMUM: {
    code:     "ASSESSMENT_RESULTS_BELOW_MINIMUM",
    severity: "error",
  },
  ENGAGEMENT_BELOW_MINIMUM: {
    code:     "ENGAGEMENT_BELOW_MINIMUM",
    severity: "error",
  },
  LOW_DATA_DIVERSITY: {
    code:     "LOW_DATA_DIVERSITY",
    severity: "info",
  },

  // ── Structural ──────────────────────────────────────────────────────────
  MISSING_TABLE: {
    code:     "MISSING_TABLE",
    severity: "error",
  },
};
