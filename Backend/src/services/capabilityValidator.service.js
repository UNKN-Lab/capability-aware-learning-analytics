import prisma from "../lib/prisma.js";
import taskRegistryService from "./taskRegistry.service.js";
import { WarningCodes } from "../constants/warningCodes.js";
import {
  buildCanonicalCapabilitySnapshot,
  evaluateAvailabilityContract,
  normalizeAvailabilityContract,
} from "./canonicalCapability.service.js";


// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Whitelist of real DB table names — prevents SQL injection in dynamic queries */
const ALLOWED_TABLES = new Set([
  "student",
  "course",
  "class",
  "enrollment",
  "assessment",
  "assessment_result",
  "engagement",
  "event",
  "import_batch",
]);



// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips bracket annotations from a sourceTable entry.
 * "assessment [OULAD only]" → "assessment"
 */
function extractTableName(sourceTableStr) {
  return sourceTableStr.replace(/\s*\[.*?\]/g, "").trim().toLowerCase();
}

/**
 * Validates and returns a safe table name.
 * Throws if the name is not in the whitelist.
 */
function sanitizeTable(name) {
  if (!ALLOWED_TABLES.has(name)) {
    throw new Error(`[CapabilityValidator] Unauthorized table name: "${name}"`);
  }
  return name;
}

/**
 * Derives overall executable status from layer results.
 *
 * Rules:
 *  - Any "fail" in structural or data_sufficiency → "unsupported" or "insufficient_data"
 *  - "fail" in semantic → "partial" (dataset mismatch or FE not populated)
 *  - All pass → "executable"
 */
function deriveStatus(layers) {
  if (layers.structural === "fail")       return "unsupported";
  if (layers.data_sufficiency === "fail") return "insufficient_data";
  if (layers.semantic === "fail")         return "partial";
  return "executable";
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS
// ─────────────────────────────────────────────────────────────────────────────

class CapabilityValidatorService {
  constructor() {
    this.snapshotCache = new Map();
    this.snapshotCacheTtlMs = 30_000;
  }

  _snapshotCacheKey(batchId, classId) {
    return `${batchId}::${classId || "__NO_CLASS__"}`;
  }

  async _getSnapshot(batchId, classId) {
    const key = this._snapshotCacheKey(batchId, classId);
    const cached = this.snapshotCache.get(key);
    if (cached && Date.now() - cached.createdAt < this.snapshotCacheTtlMs) {
      return cached.snapshot;
    }
    const snapshot = await buildCanonicalCapabilitySnapshot({ batchId, classId });
    this.snapshotCache.set(key, {
      createdAt: Date.now(),
      snapshot,
    });
    return snapshot;
  }

  // ── LAYER A: Structural Capability ─────────────────────────────────────────
  /**
   * Checks that all tables referenced by the task physically exist in the DB.
   *
   * Why information_schema? → Safe, read-only, no dynamic table access needed.
   * The table names are passed as parameterized VALUES (not interpolated),
   * so prisma.$queryRaw is safe here.
   *
   * @param {Object} task
   * @returns {{ pass: boolean, missing_tables: string[] }}
   */
  async layerA_structural(task) {
    const missingTables = [];

    for (const rawTable of task.sourceTables ?? []) {
      const tableName = extractTableName(rawTable);
      if (!tableName) continue;

      const result = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS cnt
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name   = ${tableName}
      `;

      const count = result[0]?.cnt ?? 0;
      if (count === 0) missingTables.push(tableName);
    }

    return {
      pass:           missingTables.length === 0,
      missing_tables: missingTables,
    };
  }

  // ── LAYER B: Semantic Capability (FE Fields + Dataset Compat) ──────────────
  /**
   * Checks two things:
   *
   * B1. Dataset Compatibility:
   *     If task is "OULAD_only" but active dataset is "UCI" → fail.
   *
   * B2. Stored FE Field Availability:
   *     For fe_fields with storage="stored", checks that at least 1 row in
   *     the table has the field populated for this batch. This confirms the
   *     ETL pipeline ran the feature engineering step.
   *
   *     COMPUTED fields are skipped — they are derived at query time and will
   *     be available as long as source tables have data (Layer D handles this).
   *
   * @param {Object} task
   * @param {{ batchId: string, sourceDataset: string }} ctx
   * @returns {{ pass: boolean, missing_fe_fields: string[], compatibility_mismatch: boolean }}
   */
  async layerB_semantic(task, { batchId, classId, sourceDataset }) {
    const contract = normalizeAvailabilityContract(task);
    const snapshot = await this._getSnapshot(batchId, classId || null);
    const availability = evaluateAvailabilityContract({
      task,
      contract,
      snapshot,
      sourceDataset,
    });

    const missingFeFields = [];
    const storedFeFields = (task.fe_fields ?? []).filter(
      (f) => f.storage === "stored" && f.table
    );

    for (const feField of storedFeFields) {
      if (feField.dataset !== "both" && feField.dataset !== sourceDataset) continue;

      const table = sanitizeTable(feField.table);
      const field = feField.field;
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) continue;

      const sql = `
        SELECT COUNT(*)::int AS cnt
        FROM "${table}"
        WHERE "${field}" IS NOT NULL
          AND batch_id = $1
        LIMIT 1
      `;
      const result = await prisma.$queryRawUnsafe(sql, batchId);
      const count = result[0]?.cnt ?? 0;
      if (count === 0) missingFeFields.push(`${table}.${field}`);
    }

    const structuredIssues = [];

    if (availability.dataset_specific_issue) {
      structuredIssues.push(availability.dataset_specific_issue);
    }

    for (const cap of availability.missing_required_capabilities) {
      structuredIssues.push({
        code: contract.reason_codes.REQUIRED_MISSING,
        severity: "error",
        message: `Required capability missing: ${cap}`,
        context: { task_id: task.taskId, capability: cap, batch_id: batchId },
      });
    }

    if (availability.missing_required_any_capabilities.length > 0) {
      structuredIssues.push({
        code: contract.reason_codes.REQUIRED_ANY_MISSING,
        severity: "error",
        message: `At least one capability required, but none available: ${availability.missing_required_any_capabilities.join(", ")}`,
        context: {
          task_id: task.taskId,
          required_any: availability.required_any,
          missing_required_any: availability.missing_required_any_capabilities,
        },
      });
    }

    for (const cap of availability.missing_optional_enrichments) {
      structuredIssues.push({
        code: contract.reason_codes.OPTIONAL_MISSING,
        severity: "warning",
        message: `Optional enrichment missing: ${cap}`,
        context: { task_id: task.taskId, capability: cap, batch_id: batchId },
      });
    }

    if (availability.legacy_dataset_compatibility_hint) {
      structuredIssues.push(availability.legacy_dataset_compatibility_hint);
    }

    for (const f of missingFeFields) {
      structuredIssues.push({
        ...WarningCodes.FEATURE_NOT_POPULATED,
        message: `FE field not populated: ${f}`,
        field: f,
      });
    }

    const semanticAdvisories = [];
    if (
      contract.optional_enrichments.includes("proxy_competency_available") &&
      !snapshot.capabilities.competency_tagging &&
      snapshot.capabilities.proxy_competency_available
    ) {
      const msg =
        `[SEMANTIC_WARNING] Task ${task.taskId} using proxy competency inference ` +
        `(dataset "${sourceDataset}" lacks native competency ontology - ` +
        `assessment_name used as fallback proxy).`;
      console.warn(msg);
      semanticAdvisories.push({
        ...WarningCodes.SEMANTIC_PROXY_COMPETENCY,
        message: msg,
        context: {
          task_id: task.taskId,
          source_dataset: sourceDataset,
          proxy_field: "assessment_name",
          native_field: "competency_tag",
          semantic_note: task.semanticNote ?? null,
        },
      });
    }

    return {
      pass: availability.available,
      missing_fe_fields: missingFeFields,
      compatibility_mismatch: !!availability.dataset_specific_issue,
      structured_issues: structuredIssues,
      semantic_advisories: semanticAdvisories,
      availability,
      capability_snapshot: snapshot,
    };
  }

  async layerC_analytical(task, { batchId, classId }) {
    const warnings = [];
    const analysisType = task.analytics?.analysisType?.toLowerCase() ?? "";

    if (analysisType.includes("trend")) {
      // Need ≥ 2 distinct temporal points
      const result = classId
        ? await prisma.$queryRaw`
            SELECT COUNT(DISTINCT week_of_class)::int AS cnt
            FROM assessment
            WHERE batch_id = ${batchId} AND class_id = ${classId}
          `
        : await prisma.$queryRaw`
            SELECT COUNT(DISTINCT week_of_class)::int AS cnt
            FROM assessment
            WHERE batch_id = ${batchId}
          `;
      const temporalPoints = result[0]?.cnt ?? 0;
      if (temporalPoints < 2) {
        warnings.push({
          ...WarningCodes.INSUFFICIENT_TEMPORAL_POINTS,
          message: `Trend analysis requires ≥ 2 time points — found ${temporalPoints}. Results may be unreliable.`,
          context: { found: temporalPoints, required: 2 },
        });
      }
    }

    if (analysisType.includes("comparison")) {
      // Need ≥ 2 students
      const baseQuery = classId
        ? prisma.$queryRaw`
            SELECT COUNT(DISTINCT student_id)::int AS cnt
            FROM enrollment
            WHERE batch_id = ${batchId} AND class_id = ${classId}
          `
        : prisma.$queryRaw`
            SELECT COUNT(DISTINCT student_id)::int AS cnt
            FROM enrollment
            WHERE batch_id = ${batchId}
          `;
      const result = await baseQuery;
      const studentCount = result[0]?.cnt ?? 0;
      if (studentCount < 2) {
        warnings.push({
          ...WarningCodes.INSUFFICIENT_STUDENT_COUNT,
          message: `Comparison analysis requires ≥ 2 students — found ${studentCount}.`,
          context: { found: studentCount, required: 2 },
        });
      }
    }

    return {
      pass:     true, // Layer C only warns, never hard-fails
      warnings,
    };
  }

  // ── LAYER D: Data Sufficiency ───────────────────────────────────────────────
  /**
   * Checks that there is enough raw data to produce meaningful analytics.
   *
   * Thresholds (per task spec):
   *   enrollment rows   < 5  → fail (too few students)
   *   assessment_result < 2  → fail (no meaningful score data)
   *
   * Confidence bands:
   *   HIGH   → > 100 assessment_result rows
   *   MEDIUM → 10 – 100
   *   LOW    → 2 – 9
   *
   * @param {Object} task
   * @param {{ batchId: string, classId?: string }} ctx
   * @returns {{ pass: boolean, confidence: string, confidence_reason: string }}
   */
  async layerD_dataSufficiency(task, { batchId, classId }) {
    // ── Step 1: Check minimum enrollment ─────────────────────────────────────
    const enrollmentResult = classId
      ? await prisma.$queryRaw`
          SELECT COUNT(*)::int AS cnt FROM enrollment
          WHERE batch_id = ${batchId} AND class_id = ${classId}
        `
      : await prisma.$queryRaw`
          SELECT COUNT(*)::int AS cnt FROM enrollment
          WHERE batch_id = ${batchId}
        `;
    const enrollmentCount = enrollmentResult[0]?.cnt ?? 0;

    if (enrollmentCount < 5) {
      return {
        pass:              false,
        confidence:        "LOW",
        confidence_reason: `Only ${enrollmentCount} enrolled students (minimum 5 required).`,
        structured_issue: {
          ...WarningCodes.ENROLLMENT_BELOW_MINIMUM,
          message: `Only ${enrollmentCount} enrolled students (minimum 5 required).`,
          context: { found: enrollmentCount, required: 5 },
        },
      };
    }

    // ── Step 2: Composite quality metrics ────────────────────────────────────
    // Raw row count alone is a poor proxy: 100 rows from 1 student = low quality.
    // We measure 3 independent quality dimensions:
    //   - distinct_students : breadth of population coverage
    //   - distinct_assessments: diversity of measurement points
    //   - distinct_weeks    : temporal spread (requires JOIN to get week_of_class)
    //
    // JOIN to assessment is architecturally necessary here:
    //   assessment_result has batch_id (used for batch filter via ar.batch_id)
    //   but week_of_class and class_id live on assessment — JOIN is required.
    const qualityResult = classId
      ? await prisma.$queryRaw`
          SELECT
            COUNT(*)::int                         AS total_results,
            COUNT(DISTINCT ar.student_id)::int    AS distinct_students,
            COUNT(DISTINCT ar.assessment_id)::int AS distinct_assessments,
            COUNT(DISTINCT a.week_of_class)::int  AS distinct_weeks
          FROM assessment_result ar
          JOIN assessment a ON ar.assessment_id = a.assessment_id
          WHERE ar.batch_id = ${batchId} AND a.class_id = ${classId}
        `
      : await prisma.$queryRaw`
          SELECT
            COUNT(*)::int                         AS total_results,
            COUNT(DISTINCT ar.student_id)::int    AS distinct_students,
            COUNT(DISTINCT ar.assessment_id)::int AS distinct_assessments,
            COUNT(DISTINCT a.week_of_class)::int  AS distinct_weeks
          FROM assessment_result ar
          JOIN assessment a ON ar.assessment_id = a.assessment_id
          WHERE ar.batch_id = ${batchId}
        `;

    const q = qualityResult[0] ?? {};
    const totalResults       = q.total_results       ?? 0;
    const distinctStudents   = q.distinct_students   ?? 0;
    const distinctAssessments = q.distinct_assessments ?? 0;
    const distinctWeeks      = q.distinct_weeks      ?? 0;

    if (totalResults < 2) {
      return {
        pass:              false,
        confidence:        "LOW",
        confidence_reason: `Only ${totalResults} assessment results found (minimum 2 required).`,
        structured_issue: {
          ...WarningCodes.ASSESSMENT_RESULTS_BELOW_MINIMUM,
          message: `Only ${totalResults} assessment results found (minimum 2 required).`,
          context: { found: totalResults, required: 2 },
        },
      };
    }

    // ── Step 3: Composite confidence band ────────────────────────────────────
    // HIGH:   broad population + multiple assessments + temporal spread
    // MEDIUM: adequate on at least 2 of 3 dimensions
    // LOW:    minimal data — analytically valid but interpret cautiously
    const contract = normalizeAvailabilityContract(task);
    const requiredCaps = new Set([
      ...contract.required_all,
      ...contract.required_any,
    ]);

    // Engagement receives an additional runtime sufficiency check because an
    // imported dataset may contain the canonical engagement table while all
    // activity counts are zero. Layer B describes whether the capability is
    // semantically present; Layer D prevents zero-activity data from being
    // treated as sufficient evidence for engagement-based analyses.
    //
    // Other capabilities such as registration_timing or absence_tracking are
    // currently presence-based and remain semantic checks until task-specific
    // minimum sample requirements are defined for them.
    if (requiredCaps.has("engagement_tracking")) {
      const engagementResult = classId
        ? await prisma.$queryRaw`
            SELECT
              CASE WHEN EXISTS (
                SELECT 1
                FROM engagement eng
                JOIN enrollment e ON eng.enrollment_id = e.enrollment_id
                WHERE eng.batch_id = ${batchId}
                  AND e.class_id = ${classId}
              ) THEN 1 ELSE 0 END::int AS row_count,
              CASE WHEN EXISTS (
                SELECT 1
                FROM engagement eng
                JOIN enrollment e ON eng.enrollment_id = e.enrollment_id
                WHERE eng.batch_id = ${batchId}
                  AND e.class_id = ${classId}
                  AND COALESCE(eng.engagement_count, 0) > 0
              ) THEN 1 ELSE 0 END::int AS positive_row_count
          `
        : await prisma.$queryRaw`
            SELECT
              CASE WHEN EXISTS (
                SELECT 1 FROM engagement WHERE batch_id = ${batchId}
              ) THEN 1 ELSE 0 END::int AS row_count,
              CASE WHEN EXISTS (
                SELECT 1
                FROM engagement
                WHERE batch_id = ${batchId}
                  AND COALESCE(engagement_count, 0) > 0
              ) THEN 1 ELSE 0 END::int AS positive_row_count
          `;

      const engagementRows = engagementResult[0]?.row_count ?? 0;
      const positiveEngagementRows = engagementResult[0]?.positive_row_count ?? 0;

      if (positiveEngagementRows === 0) {
        return {
          pass:              false,
          confidence:        "LOW",
          confidence_reason: `No positive engagement activity found (${engagementRows} engagement rows).`,
          structured_issue: {
            ...WarningCodes.ENGAGEMENT_BELOW_MINIMUM,
            message: `No positive engagement activity found (${engagementRows} engagement rows).`,
            context: { found: positiveEngagementRows, required: 1, rowCount: engagementRows },
          },
        };
      }
    }

    let confidence, confidence_reason;

    if (distinctStudents >= 10 && distinctAssessments >= 3 && distinctWeeks >= 2) {
      confidence        = "HIGH";
      confidence_reason = (
        `${distinctStudents} students × ${distinctAssessments} assessments ` +
        `across ${distinctWeeks} weeks — strong statistical basis.`
      );
    } else if (distinctStudents >= 5 && distinctAssessments >= 2) {
      confidence        = "MEDIUM";
      confidence_reason = (
        `${distinctStudents} students × ${distinctAssessments} assessments ` +
        `(${distinctWeeks} week${distinctWeeks !== 1 ? "s" : ""}) — adequate for most analyses.`
      );
    } else {
      confidence        = "LOW";
      confidence_reason = (
        `Limited diversity: ${distinctStudents} student(s), ` +
        `${distinctAssessments} assessment(s), ${distinctWeeks} week(s). ` +
        `Results should be interpreted cautiously.`
      );
    }

    // LOW confidence → emit advisory code for frontend
    const lowDiversityIssue = confidence === "LOW"
      ? {
          ...WarningCodes.LOW_DATA_DIVERSITY,
          message: confidence_reason,
          context: { distinctStudents, distinctAssessments, distinctWeeks },
        }
      : null;

    return { pass: true, confidence, confidence_reason, structured_issue: lowDiversityIssue };
  }

  // ── MAIN: Validate a single task ───────────────────────────────────────────
  /**
   * Runs all 4 layers in sequence. Stops early if Layer A fails (no point
   * running downstream checks if tables don't even exist).
   *
   * @param {string} taskId
   * @param {{ batchId: string, classId?: string, sourceDataset: string }} ctx
   * @returns {Object} Full validation result object
   */
  async validateTask(taskId, { batchId, classId, sourceDataset }) {
    const task = taskRegistryService.getTaskById(taskId);
    if (!task) {
      return {
        task_id:              taskId,
        executable:           false,
        status:               "unsupported",
        confidence:           null,
        confidence_reason:    "Task not found in registry.",
        warnings:             [],
        missing_requirements: [`Task "${taskId}" does not exist.`],
        layer_results: {
          structural:       "fail",
          semantic:         "skip",
          analytical:       "skip",
          data_sufficiency: "skip",
        },
      };
    }

    const allWarnings        = [];
    const missingRequirements = [];

    // ── Layer A ──
    const layerA = await this.layerA_structural(task);
    if (!layerA.pass) {
      missingRequirements.push(...layerA.missing_tables.map((t) => `Missing table: ${t}`));
    }

    // Early exit: if tables don't exist, lower layers will fail anyway
    if (!layerA.pass) {
      return {
        task_id:              taskId,
        executable:           false,
        status:               "unsupported",
        confidence:           null,
        confidence_reason:    "Required database tables are missing.",
        warnings:             [],
        missing_requirements: missingRequirements,
        layer_results: {
          structural:       "fail",
          semantic:         "skip",
          analytical:       "skip",
          data_sufficiency: "skip",
        },
      };
    }

    // ── Layer B ──
    const layerB = await this.layerB_semantic(task, { batchId, classId, sourceDataset });
    if (!layerB.pass) {
      missingRequirements.push(...layerB.structured_issues);
    }

    // ── Layer C ──
    const layerC = await this.layerC_analytical(task, { batchId, classId });
    allWarnings.push(...layerC.warnings);

    // ── Layer D ──
    const layerD = await this.layerD_dataSufficiency(task, { batchId, classId });
    if (!layerD.pass) {
      missingRequirements.push(layerD.structured_issue ?? { code: "DATA_INSUFFICIENT", message: layerD.confidence_reason, severity: "error" });
    }

    // ── Assemble final result ──
    const layerResults = {
      structural:       layerA.pass ? "pass" : "fail",
      semantic:         layerB.pass ? "pass" : "fail",
      analytical:       layerC.warnings.length === 0 ? "pass" : "warn",
      data_sufficiency: layerD.pass ? "pass" : "fail",
    };

    const status     = deriveStatus(layerResults);
    const executable = status === "executable";

    return {
      task_id:              taskId,
      executable,
      status,
      confidence:           layerD.pass ? layerD.confidence : "LOW",
      confidence_reason:    layerD.confidence_reason,
      availability:         layerB.availability ?? null,
      warnings:             allWarnings,
      missing_requirements: missingRequirements,
      semantic_advisories:  layerB.semantic_advisories ?? [],
      capability_snapshot:  layerB.capability_snapshot ?? null,
      layer_results:        layerResults,
    };
  }

  // ── MAIN: Validate all tasks ────────────────────────────────────────────────
  /**
   * Validates all 53 tasks in the registry for a given dataset context.
   * Runs tasks sequentially to avoid DB connection pool exhaustion.
   *
   * @param {{ batchId: string, classId?: string, sourceDataset: string }} ctx
   * @returns {Object[]} Array of validation results, sorted by status
   */
  async validateAll({ batchId, classId, sourceDataset }) {
    this.snapshotCache.clear();
    const allTasks = taskRegistryService.getAllTasks();
    const results  = [];

    for (const task of allTasks) {
      const result = await this.validateTask(task.taskId, {
        batchId,
        classId,
        sourceDataset,
      });
      results.push(result);
    }

    // Sort: executable first, then partial, then insufficient_data, then unsupported
    const ORDER = { executable: 0, partial: 1, insufficient_data: 2, unsupported: 3 };
    results.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

    return results;
  }
}

// Export singleton
const capabilityValidatorService = new CapabilityValidatorService();
export default capabilityValidatorService;
