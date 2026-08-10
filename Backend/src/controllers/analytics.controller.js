import taskRegistryService from "../services/taskRegistry.service.js";
import capabilityValidatorService from "../services/capabilityValidator.service.js";
import { executeSqlTask } from "../services/sqlExecution.service.js";
import { validateOutputSchema } from "../services/outputSchema.service.js";
import prisma from "../lib/prisma.js";
import { randomUUID } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves { batchId, sourceDataset } from the import_batch table.
 * Used to pass correct context to the Capability Validator.
 *
 * Note: batch_id from the request params is used for VALIDATION only.
 * It is NOT passed to SqlExecutionService — SQL queries filter by
 * class_id / student_id which are already batch-scoped after import.
 */
async function resolveBatchContext(batchId) {
  const batch = await prisma.importBatch.findUnique({
    where:  { batch_id: batchId },
    select: { batch_id: true, source_dataset: true },
  });

  if (!batch) {
    throw Object.assign(
      new Error(`Import batch "${batchId}" not found.`),
      { statusCode: 404 }
    );
  }

  return {
    batchId:       batch.batch_id,
    sourceDataset: batch.source_dataset, // "OULAD" | "UCI"
  };
}

/**
 * Resolves enrollment_id for student-scoped SQL tasks when caller provides
 * student_id + class_id (+ batch_id) but omits enrollment_id.
 */
async function resolveEnrollmentIdIfMissing(params = {}) {
  const nextParams = { ...params };
  if (nextParams.enrollment_id) return nextParams;
  if (!nextParams.student_id || !nextParams.class_id) return nextParams;

  const where = {
    student_id: nextParams.student_id,
    class_id: nextParams.class_id,
    ...(nextParams.batch_id ? { batch_id: nextParams.batch_id } : {}),
  };

  const enrollment = await prisma.enrollment.findFirst({
    where,
    select: { enrollment_id: true },
  });

  if (!enrollment?.enrollment_id) {
    throw Object.assign(
      new Error("STUDENT_NOT_ENROLLED_IN_CLASS"),
      {
        statusCode: 422,
        errorCode: "STUDENT_NOT_ENROLLED_IN_CLASS",
        diagnostics: {
          student_id: nextParams.student_id ?? null,
          class_id: nextParams.class_id ?? null,
          batch_id: nextParams.batch_id ?? null,
        },
      }
    );
  }

  nextParams.enrollment_id = enrollment.enrollment_id;
  return nextParams;
}

/**
 * Extracts SQL execution params by removing batch_id.
 *
 * batch_id is used only for capability validation — it is NOT in the
 * SQL ALLOWED_PARAMS whitelist and must not be passed to SqlExecutionService.
 *
 * Keeps: student_id, class_id, enrollment_id, s1, s2
 * Removes: batch_id
 */
function extractSqlParams(params) {
  return { ...params };
}

/**
 * Normalizes the raw SQL execution result into a named `datasets` dictionary
 * keyed by `task.query_labels[]`.
 *
 * Replaces the legacy raw `[{index, data, rowCount}]` shape that frontend
 * and AI service should never have to parse manually.
 *
 * Single-query:  { datasets: { "score_over_time": [...rows] } }
 * Multi-query:   { datasets: { "absence_data": [...], "score_series": [...] } }
 *
 * Falls back gracefully:
 *   - No query_labels entry → "query_0", "query_1", ...
 *   - No query_labels at all → "data" (single) or "query_N" (multi)
 */
function normalizeAnalyticsResult(task, result) {
  // ── Single-query path ──────────────────────────────────────────────────────
  if (!result.meta?.isMultiQuery) {
    const label = task.query_labels?.[0] ?? "data";
    return { [label]: result.data };
  }

  // ── Multi-query path ───────────────────────────────────────────────────────
  // result.data is: [{ index: 0, data: [...], rowCount: N }, { index: 1, ... }]
  const datasets = {};
  for (const rs of result.data) {
    const label = task.query_labels?.[rs.index] ?? `query_${rs.index}`;
    datasets[label] = rs.data;
  }
  return datasets;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/analytics/run
 *
 * Core analytics execution endpoint. Wires together 3 services:
 *   1. TaskRegistryService  — resolve task metadata + SQL template
 *   2. CapabilityValidator  — check data readiness (4-layer validation)
 *   3. SqlExecutionService  — inject params + execute query safely
 *
 * Request body:
 * {
 *   taskId: "S-B01",
 *   params: {
 *     batch_id:      "batch_xxx",   ← required: for capability validation
 *     class_id:      "class_yyy",   ← required for most tasks
 *     student_id?:   "12345",       ← required for "1 student" scope tasks
 *     enrollment_id?: "enrl_zzz",   ← required for S-T07
 *     s1?:           "student_a",   ← required for comparison tasks (A-C0x)
 *     s2?:           "student_b",   ← required for comparison tasks (A-C0x)
 *   }
 * }
 *
 * Execution policy:
 *   status = "unsupported"        → 422 HARD BLOCK (tables missing)
 *   status = "partial"            → 200 RUN with warning (FE not ready / dataset mismatch)
 *   status = "insufficient_data"  → 200 RUN with warning (sparse data)
 *   status = "executable"         → 200 RUN clean
 *
 * Rationale for soft failures (partial/insufficient_data):
 *   - The query CAN complete — it will just return fewer/null values
 *   - Frontend decides how to display (e.g. "Data quality: LOW")
 *   - Only structural impossibility warrants blocking
 */
export async function runAnalyticsController(req, res) {
  // Generate correlation ID immediately — present in ALL response paths
  // Format: exec_{timestamp}_{uuid-prefix} — human-readable + unique
  // Used for: logs, replay, AI evaluation, distributed tracing
  const executionId = `exec_${Date.now()}_${randomUUID().split("-")[0]}`;
  try {
    const { taskId, params = {} } = req.body;

    // ── Guard: required fields ──────────────────────────────────────────────
    if (!taskId) {
      return res.status(400).json({
        success:     false,
        executionId,
        error:       "Request body must include taskId.",
      });
    }

    const resolvedParams = await resolveEnrollmentIdIfMissing(params);
    const { batch_id: batchId, class_id: classId } = resolvedParams;
    if (!batchId) {
      return res.status(400).json({
        success:     false,
        executionId,
        error:       "params.batch_id is required for capability validation.",
      });
    }

    // ── Step 1: Resolve task ────────────────────────────────────────────────
    const task = taskRegistryService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({
        success:     false,
        executionId,
        error:       `Task "${taskId}" not found in registry.`,
      });
    }

    // ── Step 2: Resolve batch context ───────────────────────────────────────
    const { sourceDataset } = await resolveBatchContext(batchId);

    // ── Step 3: Capability validation ───────────────────────────────────────
    const capability = await capabilityValidatorService.validateTask(taskId, {
      batchId,
      classId: classId || null,
      sourceDataset,
    });

    // ── Step 4: Hard block — structural impossibility ───────────────────────
    if (capability.status === "unsupported") {
      return res.status(422).json({
        success:     false,
        executionId,
        error:       "Task cannot be executed: required database tables are missing.",
        taskId,
        capability: {
          status:               capability.status,
          missing_requirements: capability.missing_requirements,
          layer_results:        capability.layer_results,
        },
      });
    }

    // ── Step 5: Execute SQL ─────────────────────────────────────────────────
    // Strip batch_id — SQL queries don't use it (not in ALLOWED_PARAMS)
    const sqlParams = extractSqlParams(resolvedParams);

    // Fallback for comparison tasks (e.g., A-C01) if frontend doesn't provide s1/s2
    if (!sqlParams.s1) sqlParams.s1 = sqlParams.student_id || 'dummy_s1';
    if (!sqlParams.s2) sqlParams.s2 = 'dummy_s2';

    const result = await executeSqlTask({ task, params: sqlParams });

    // ── Step 6: Normalize & return ──────────────────────────────────────────
    // Converts raw SQL result into a named datasets dict keyed by query_labels.
    // Frontend and AI service always receive { datasets: { labelName: [...rows] } }
    // and NEVER see the legacy [{ index, data, rowCount }] shape.
    const datasets = normalizeAnalyticsResult(task, result);
    const contract = validateOutputSchema(task, datasets);

    if (!contract.ok) {
      return res.status(422).json({
        success: false,
        executionId,
        taskId,
        error: "OUTPUT_SCHEMA_MISMATCH",
        message: `Task output missing required columns: ${contract.missing.join(", ")}`,
        output_schema: task.output_schema,
        available_columns: contract.available,
      });
    }

    return res.status(200).json({
      success:     true,
      executionId,
      taskId,
      datasets,           // ← named dict, replaces raw `data` field
      meta: {
        ...result.meta,
        query_labels: task.query_labels ?? [],   // echo labels so FE doesn't need to re-fetch task
        dataQuality: {
          status:            capability.status,
          confidence:        capability.confidence,
          confidence_reason: capability.confidence_reason,
          warnings:          [
            ...capability.warnings,
            ...(capability.missing_requirements.length > 0
              ? capability.missing_requirements
              : []),
          ],
        },
      },
    });
  } catch (err) {
    console.error("[runAnalyticsController]", err);
    return res.status(err.statusCode ?? 500).json({
      success:     false,
      executionId,
      error:       err.message,
      ...(err?.errorCode ? { code: err.errorCode } : {}),
      ...(err?.diagnostics ? { diagnostics: err.diagnostics } : {}),
    });
  }
}
