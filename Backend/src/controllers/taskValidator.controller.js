import capabilityValidatorService from "../services/capabilityValidator.service.js";
import prisma from "../lib/prisma.js";
import taskRegistryService from "../services/taskRegistry.service.js";
import {
  listTaskAvailabilityLogs,
  readTaskAvailabilityLog,
  writeTaskAvailabilityLog
} from "../services/taskAvailabilityLog.service.js";
import { sanitizeTaskForClient } from "../services/taskPublicView.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Resolve batch context from datasetId
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves { batchId, sourceDataset } from an import_batch record.
 * The frontend passes the batch UUID as "datasetId".
 *
 * @param {string} datasetId - UUID of the import_batch
 * @returns {{ batchId: string, sourceDataset: string }}
 */
async function resolveBatchContext(datasetId) {
  // Prisma model name: ImportBatch → accessor: prisma.importBatch (camelCase)
  // PK field in schema.prisma: batch_id (NOT id)
  const batch = await prisma.importBatch.findUnique({
    where:  { batch_id: datasetId },
    select: { batch_id: true, source_dataset: true },
  });

  if (!batch) {
    throw Object.assign(new Error(`Dataset "${datasetId}" not found.`), {
      statusCode: 404,
    });
  }

  return {
    batchId:       batch.batch_id,
    sourceDataset: batch.source_dataset, // "OULAD" | "UCI"
  };
}

function isTaskExposed(task, includeExperimental) {
  const status = task.registry_status || "experimental";
  if (status === "deprecated") return false;
  if (status === "experimental" && includeExperimental !== "true") return false;
  return true;
}

function buildAvailabilitySummary(results = []) {
  return {
    total:             results.length,
    executable:        results.filter((r) => r.status === "executable").length,
    partial:           results.filter((r) => r.status === "partial").length,
    insufficient_data: results.filter((r) => r.status === "insufficient_data").length,
    unsupported:       results.filter((r) => r.status === "unsupported").length,
  };
}

function issueMessage(issue) {
  if (!issue) return null;
  if (typeof issue === "string") return issue;
  if (typeof issue === "object") return issue.message || issue.code || null;
  return String(issue);
}

function buildDisabledReason(result) {
  if (!result) return "Task availability was not evaluated.";
  if (result.status === "executable") return null;

  const firstMissing = (result.missing_requirements || [])
    .map(issueMessage)
    .find(Boolean);
  if (firstMissing) return firstMissing;

  const availability = result.availability || {};
  if (availability.missing_required_capabilities?.length) {
    return `Missing required capabilities: ${availability.missing_required_capabilities.join(", ")}`;
  }
  if (availability.missing_required_any_capabilities?.length) {
    return `At least one required capability group is missing: ${availability.missing_required_any_capabilities.join(", ")}`;
  }
  if (result.confidence_reason) return result.confidence_reason;

  const firstWarning = (result.warnings || []).map(issueMessage).find(Boolean);
  return firstWarning || `Task status is ${result.status}.`;
}

function compactAvailabilityForClient(result) {
  if (!result) {
    return {
      status: "unsupported",
      executable: false,
      layer_results: {},
      confidence: null,
      confidence_reason: "Task availability was not evaluated.",
      missing_requirements: ["Task availability was not evaluated."],
      missing_capabilities: {},
      warnings: [],
      semantic_advisories: [],
      disabled_reason: "Task availability was not evaluated.",
    };
  }

  const availability = result.availability || {};

  return {
    status: result.status,
    executable: !!result.executable,
    layer_results: result.layer_results || {},
    confidence: result.confidence ?? null,
    confidence_reason: result.confidence_reason || null,
    missing_requirements: result.missing_requirements || [],
    missing_capabilities: {
      required_all: availability.missing_required_capabilities || [],
      required_any: availability.missing_required_any_capabilities || [],
      optional_enrichments: availability.missing_optional_enrichments || [],
    },
    warnings: result.warnings || [],
    semantic_advisories: result.semantic_advisories || [],
    disabled_reason: buildDisabledReason(result),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER: Validate ALL tasks for a given dataset
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/tasks/validate/:datasetId?classId=...
 *
 * Validates all 53 tasks in the registry against the specified dataset/batch.
 * Returns a sorted array of validation results.
 *
 * Query params:
 *   classId (optional) — filters Layer C/D checks to a specific class
 */
export async function validateAllTasksController(req, res) {
  try {
    const { datasetId } = req.params;
    const { classId }   = req.query;

    const { batchId, sourceDataset } = await resolveBatchContext(datasetId);

    const results = await capabilityValidatorService.validateAll({
      batchId,
      classId: classId || null,
      sourceDataset,
    });

    // Summary stats for the frontend dashboard
    const summary = {
      total:            results.length,
      executable:       results.filter((r) => r.status === "executable").length,
      partial:          results.filter((r) => r.status === "partial").length,
      insufficient_data: results.filter((r) => r.status === "insufficient_data").length,
      unsupported:      results.filter((r) => r.status === "unsupported").length,
    };

    let taskAvailabilityLog = null;

    if (req.get("x-performance-benchmark") !== "true") {
      try {
        taskAvailabilityLog = await writeTaskAvailabilityLog({
          datasetId,
          batchId,
          sourceDataset,
          classId: classId || null,
          results,
          requestContext: {
            sourceEndpoint: "/api/tasks/validate/:datasetId",
            mode: "validation_report",
            uiRole: null,
            includeExperimental: true
          }
        });
      } catch (logError) {
        console.warn("[EvaluationLog] Failed to write task availability log:", logError);
      }
    }

    return res.status(200).json({
      success: true,
      datasetId,
      sourceDataset,
      classId:  classId || null,
      summary,
      taskAvailabilityLog,
      results,
    });
  } catch (err) {
    console.error("[validateAllTasksController]", err);
    return res.status(err.statusCode ?? 500).json({
      success: false,
      error:   err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER: Available tasks for a dataset
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared task validation endpoints.
 *
 * Validates a single task against the specified dataset/batch.
 * Used by the frontend before executing a specific task.
 *
 * Query params:
 *   datasetId (required) — UUID of the import_batch
 *   classId   (optional) — filters Layer C/D checks to a specific class
 */
/**
 * GET /api/tasks/available?datasetId=...&classId=...
 *
 * Returns public task metadata merged with the 4-layer availability result.
 * This endpoint is intended to become the frontend source of truth for which
 * tasks are clickable for the currently active imported dataset.
 */
export async function getAvailableTasksController(req, res) {
  try {
    const { datasetId, classId, includeExperimental, role, uiRole } = req.query;

    if (!datasetId) {
      return res.status(400).json({
        success: false,
        error: "Missing required query param: datasetId",
      });
    }

    const { batchId, sourceDataset } = await resolveBatchContext(datasetId);

    const validationResults = await capabilityValidatorService.validateAll({
      batchId,
      classId: classId || null,
      sourceDataset,
    });
    const validationByTaskId = new Map(
      validationResults.map((result) => [result.task_id, result])
    );

    const tasks = taskRegistryService
      .getAllTasks()
      .filter((task) => isTaskExposed(task, includeExperimental))
      .map((task) => {
        const availabilityResult = validationByTaskId.get(task.taskId);
        return {
          ...sanitizeTaskForClient(task),
          availability: compactAvailabilityForClient(availabilityResult),
        };
      });

    const exposedResults = tasks
      .map((task) => validationByTaskId.get(task.taskId))
      .filter(Boolean);
    const summary = buildAvailabilitySummary(exposedResults);

    let taskAvailabilityLog = null;

    if (req.get("x-performance-benchmark") !== "true") {
      try {
        taskAvailabilityLog = await writeTaskAvailabilityLog({
          datasetId,
          batchId,
          sourceDataset,
          classId: classId || null,
          results: exposedResults,
          requestContext: {
            sourceEndpoint: "/api/tasks/available",
            mode: "available_tasks",
            uiRole: role || uiRole || null,
            includeExperimental: includeExperimental === "true"
          }
        });
      } catch (logError) {
        console.warn("[EvaluationLog] Failed to write task availability log:", logError);
      }
    }

    return res.status(200).json({
      success: true,
      datasetId,
      sourceDataset,
      classId: classId || null,
      summary,
      taskAvailabilityLog,
      tasks,
    });
  } catch (err) {
    console.error("[getAvailableTasksController]", err);
    return res.status(err.statusCode ?? 500).json({
      success: false,
      error: err.message,
    });
  }
}

export async function listTaskAvailabilityLogsController(req, res) {
  try {
    const limit = Number(req.query.limit || 50);
    const logs = await listTaskAvailabilityLogs({
      limit: Number.isFinite(limit) && limit > 0 ? limit : 50
    });

    return res.status(200).json({
      success: true,
      logs
    });
  } catch (err) {
    console.error("[listTaskAvailabilityLogsController]", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function getTaskAvailabilityLogController(req, res) {
  try {
    const log = await readTaskAvailabilityLog(req.params.logId);

    if (!log) {
      return res.status(404).json({
        success: false,
        error: "Task availability log not found."
      });
    }

    return res.status(200).json({
      success: true,
      log
    });
  } catch (err) {
    console.error("[getTaskAvailabilityLogController]", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

export async function validateOneTaskController(req, res) {
  try {
    const { taskId }    = req.params;
    const { datasetId, classId } = req.query;

    if (!datasetId) {
      return res.status(400).json({
        success: false,
        error:   "Missing required query param: datasetId",
      });
    }

    const { batchId, sourceDataset } = await resolveBatchContext(datasetId);

    const result = await capabilityValidatorService.validateTask(taskId, {
      batchId,
      classId: classId || null,
      sourceDataset,
    });

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (err) {
    console.error("[validateOneTaskController]", err);
    return res.status(err.statusCode ?? 500).json({
      success: false,
      error:   err.message,
    });
  }
}
