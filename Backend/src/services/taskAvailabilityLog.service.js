import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../lib/prisma.js";
import taskRegistryService from "./taskRegistry.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const LOG_DIR = path.join(PROJECT_ROOT, "Docs", "evaluation_logs", "task_availability");
const RELATIVE_LOG_DIR = "Docs/evaluation_logs/task_availability";

function toSafeLogId(date = new Date()) {
  const timestamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[^0-9TZ]/g, "");
  return `task_availability_${timestamp}_${crypto.randomBytes(3).toString("hex")}`;
}

function listAvailableCapabilities(snapshot) {
  const capabilities = snapshot?.capabilities || {};
  return Object.entries(capabilities)
    .filter(([, value]) => !!value)
    .map(([key]) => key)
    .sort();
}

function compactSnapshot(snapshot) {
  if (!snapshot) return null;

  return {
    batch_id: snapshot.batch_id,
    class_id: snapshot.class_id,
    table_counts: snapshot.table_counts || {},
    available_tables: snapshot.available_tables || [],
    metrics: snapshot.metrics || {},
    capabilities: snapshot.capabilities || {},
    available_capabilities: listAvailableCapabilities(snapshot)
  };
}

function compactIssue(issue) {
  if (typeof issue === "string") {
    return {
      code: null,
      severity: "error",
      message: issue,
      context: null
    };
  }

  if (!issue || typeof issue !== "object") {
    return {
      code: null,
      severity: "error",
      message: String(issue ?? "Unknown missing requirement."),
      context: null
    };
  }

  return {
    code: issue.code || null,
    severity: issue.severity || null,
    message: issue.message || null,
    context: issue.context || null,
    field: issue.field || null
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

function firstFailedLayer(layerResults = {}) {
  // Match the hard-failure precedence used by deriveStatus().
  // Analytical warnings are advisory and come after all failing layers.
  const layerOrder = ["structural", "data_sufficiency", "semantic", "analytical"];
  return layerOrder.find((layer) => ["fail", "warn"].includes(layerResults[layer])) || null;
}

function buildDecisionExplanation(result) {
  const disabledReason = buildDisabledReason(result);

  if (result?.status === "executable") {
    return {
      rule: "Task is clickable only when status === executable.",
      clickable: true,
      failed_layer: null,
      why_disabled: null
    };
  }

  return {
    rule: "Task is clickable only when status === executable.",
    clickable: false,
    failed_layer: firstFailedLayer(result?.layer_results || {}),
    why_disabled: disabledReason
  };
}

function compactTaskResult(result) {
  const availability = result?.availability || {};
  const capabilitySnapshot = result?.capability_snapshot || null;
  const task = taskRegistryService.getTaskById(result.task_id);

  return {
    taskId: result.task_id,
    taskName: task?.taskName || null,
    executable: !!result.executable,
    status: result.status,
    disabled_reason: buildDisabledReason(result),
    decision_explanation: buildDecisionExplanation(result),
    layer_results: result.layer_results || {},
    requiredCapabilities: {
      required_all: availability.required_all || [],
      required_any: availability.required_any || [],
      optional_enrichments: availability.optional_enrichments || []
    },
    availableCapabilities: listAvailableCapabilities(capabilitySnapshot),
    matchedCapabilities: availability.matched_capabilities || [],
    missing_requirements: (result.missing_requirements || []).map(compactIssue),
    missing_capabilities: {
      required_all: availability.missing_required_capabilities || [],
      required_any: availability.missing_required_any_capabilities || [],
      optional_enrichments: availability.missing_optional_enrichments || []
    },
    warnings: (result.warnings || []).map(compactIssue),
    semantic_advisories: (result.semantic_advisories || []).map(compactIssue),
    confidence: result.confidence,
    confidence_reason: result.confidence_reason,
    availability_reason_codes: availability.reason_codes || []
  };
}

function buildSummary(results = []) {
  return {
    total: results.length,
    executable: results.filter((item) => item.status === "executable").length,
    partial: results.filter((item) => item.status === "partial").length,
    insufficient_data: results.filter((item) => item.status === "insufficient_data").length,
    unsupported: results.filter((item) => item.status === "unsupported").length,
    layer_counts: {
      structural_fail: results.filter((item) => item.layer_results?.structural === "fail").length,
      semantic_fail: results.filter((item) => item.layer_results?.semantic === "fail").length,
      analytical_warn: results.filter((item) => item.layer_results?.analytical === "warn").length,
      data_sufficiency_fail: results.filter((item) => item.layer_results?.data_sufficiency === "fail").length
    },
    confidence_counts: {
      HIGH: results.filter((item) => item.confidence === "HIGH").length,
      MEDIUM: results.filter((item) => item.confidence === "MEDIUM").length,
      LOW: results.filter((item) => item.confidence === "LOW").length,
      null: results.filter((item) => item.confidence == null).length
    }
  };
}

function buildUiSummary(results = []) {
  return {
    total_returned_to_ui: results.length,
    executable: results.filter((item) => item.status === "executable").length,
    disabled: results.filter((item) => item.status !== "executable").length,
    partial: results.filter((item) => item.status === "partial").length,
    insufficient_data: results.filter((item) => item.status === "insufficient_data").length,
    unsupported: results.filter((item) => item.status === "unsupported").length
  };
}

function buildRequestContext(requestContext = {}) {
  return {
    source_endpoint: requestContext.sourceEndpoint || null,
    mode: requestContext.mode || "validation_report",
    ui_role: requestContext.uiRole || null,
    includeExperimental: requestContext.includeExperimental === true
  };
}

async function loadBatch(batchId) {
  if (!batchId) return null;

  const batch = await prisma.importBatch.findUnique({
    where: { batch_id: batchId }
  });

  if (!batch) return null;

  return {
    batch_id: batch.batch_id,
    batch_name: batch.batch_name,
    source_dataset: batch.source_dataset,
    learning_mode: batch.learning_mode,
    row_count: batch.row_count,
    status: batch.status,
    is_active: batch.is_active,
    is_sample: batch.is_sample,
    imported_at: batch.imported_at?.toISOString?.() ?? batch.imported_at
  };
}

function buildLogPayload({
  logId,
  createdAt,
  datasetId,
  batchId,
  sourceDataset,
  classId,
  batch,
  results,
  requestContext
}) {
  const compactResults = (Array.isArray(results) ? results : []).map(compactTaskResult);
  const firstSnapshot = results.find((item) => item.capability_snapshot)?.capability_snapshot;

  return {
    run_id: logId,
    created_at: createdAt.toISOString(),
    datasetId,
    batchId,
    sourceDataset,
    classId: classId || null,
    request_context: buildRequestContext(requestContext),
    batch,
    summary: buildSummary(compactResults),
    ui_summary: buildUiSummary(compactResults),
    dataset_snapshot: compactSnapshot(firstSnapshot),
    tasks: compactResults
  };
}

export async function writeTaskAvailabilityLog({
  datasetId,
  batchId,
  sourceDataset,
  classId,
  results,
  requestContext
}) {
  const createdAt = new Date();
  const logId = toSafeLogId(createdAt);
  const batch = await loadBatch(batchId);
  const logPayload = buildLogPayload({
    logId,
    createdAt,
    datasetId,
    batchId,
    sourceDataset,
    classId,
    batch,
    results,
    requestContext
  });
  const fileName = `${logId}.json`;
  const filePath = path.join(LOG_DIR, fileName);

  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(logPayload, null, 2)}\n`, "utf8");

  return {
    logId,
    fileName,
    relativePath: `${RELATIVE_LOG_DIR}/${fileName}`,
    viewUrl: `/api/tasks/availability-logs/${logId}`
  };
}

export async function listTaskAvailabilityLogs({ limit = 50 } = {}) {
  await fs.mkdir(LOG_DIR, { recursive: true });

  const entries = await fs.readdir(LOG_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);

  const logs = await Promise.all(
    files.map(async (fileName) => {
      const filePath = path.join(LOG_DIR, fileName);
      const stat = await fs.stat(filePath);
      const logId = fileName.replace(/\.json$/, "");
      let preview = {};

      try {
        const content = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(content);
        preview = {
          datasetId: parsed.datasetId || null,
          batchId: parsed.batchId || null,
          sourceDataset: parsed.sourceDataset || null,
          classId: parsed.classId || null,
          request_context: parsed.request_context || null,
          summary: parsed.summary || null,
          ui_summary: parsed.ui_summary || null
        };
      } catch {
        preview = {};
      }

      return {
        logId,
        fileName,
        relativePath: `${RELATIVE_LOG_DIR}/${fileName}`,
        viewUrl: `/api/tasks/availability-logs/${logId}`,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        ...preview
      };
    })
  );

  return logs
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, limit);
}

export async function readTaskAvailabilityLog(logId) {
  if (!/^task_availability_[A-Za-z0-9_]+$/.test(String(logId || ""))) {
    return null;
  }

  const filePath = path.join(LOG_DIR, `${logId}.json`);

  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
