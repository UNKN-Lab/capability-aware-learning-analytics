import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const LOG_DIR = path.join(PROJECT_ROOT, "Docs", "evaluation_logs", "profiling_mapping");
const RELATIVE_LOG_DIR = "Docs/evaluation_logs/profiling_mapping";

function toSafeLogId(date = new Date()) {
  const timestamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[^0-9TZ]/g, "");
  return `profiling_mapping_${timestamp}_${crypto.randomBytes(3).toString("hex")}`;
}

function getColumnCount(profilingResult) {
  return Array.isArray(profilingResult?.columns)
    ? profilingResult.columns.length
    : 0;
}

function compactProfilingResult(profilingResult) {
  const columns = Array.isArray(profilingResult?.columns)
    ? profilingResult.columns
    : [];

  return {
    row_count: profilingResult?.row_count ?? 0,
    detected_separator: profilingResult?.detected_separator ?? null,
    column_count: columns.length,
    sample_row_count: Array.isArray(profilingResult?.sample_rows)
      ? profilingResult.sample_rows.length
      : 0,
    columns: columns.map((column) => ({
      raw_column: column.raw_column,
      detected_type: column.detected_type,
      sample_values: column.sample_values ?? [],
      null_ratio: column.null_ratio ?? 0,
      distinct_count: column.distinct_count ?? 0
    }))
  };
}

function compactMappingSuggestion(mappingSuggestion) {
  const fieldMappings = Array.isArray(mappingSuggestion?.field_mappings)
    ? mappingSuggestion.field_mappings
    : [];

  return {
    dataset_name: mappingSuggestion?.dataset_name ?? null,
    source_dataset: mappingSuggestion?.source_dataset ?? null,
    mapping_status: mappingSuggestion?.mapping_status ?? null,
    version: mappingSuggestion?.version ?? null,
    confirmed_at: mappingSuggestion?.confirmed_at ?? null,
    field_mappings: fieldMappings.map((mapping) => ({
      id: mapping.id,
      source_fields: mapping.source_fields ?? [],
      canonical_field: mapping.canonical_field ?? null,
      transform: mapping.transform ?? null,
      status: mapping.status ?? null,
      confidence: mapping.confidence ?? 0,
      entity_scope: mapping.entity_scope ?? null,
      review_comment: mapping.review_comment ?? null
    })),
    summary: mappingSuggestion?.summary ?? {}
  };
}

function compactBundleProfilingResult(bundleProfilingResult) {
  const fileSummaries = Array.isArray(bundleProfilingResult?.file_summaries)
    ? bundleProfilingResult.file_summaries
    : [];

  return {
    total_files: bundleProfilingResult?.total_files ?? fileSummaries.length,
    total_rows: bundleProfilingResult?.total_rows ?? 0,
    file_summaries: fileSummaries.map((summary) => ({
      fileId: summary.fileId,
      fileName: summary.fileName,
      inferredRole: summary.inferredRole,
      rowCount: summary.rowCount ?? 0,
      columnCount: summary.columnCount ?? 0,
      columns: Array.isArray(summary.columns) ? summary.columns : []
    }))
  };
}

function compactBundleMappingSuggestion(bundleMappingSuggestion) {
  const fileMappings = Array.isArray(bundleMappingSuggestion?.file_mappings)
    ? bundleMappingSuggestion.file_mappings
    : [];

  return {
    dataset_name: bundleMappingSuggestion?.dataset_name ?? null,
    source_dataset: bundleMappingSuggestion?.source_dataset ?? null,
    mapping_status: bundleMappingSuggestion?.mapping_status ?? null,
    bundle_mode: !!bundleMappingSuggestion?.bundle_mode,
    file_mappings: fileMappings.map((item) => ({
      fileId: item.fileId,
      fileName: item.fileName,
      inferredRole: item.inferredRole,
      mappingSummary: item.mappingSuggestion?.summary ?? {}
    })),
    summary: bundleMappingSuggestion?.summary ?? {}
  };
}

function buildLogPayload({
  logId,
  createdAt,
  sessionId,
  requestedDatasetName,
  requestedSourceDataset,
  resolvedDatasetName,
  resolvedSourceDataset,
  uploadedFiles,
  bundleSchema,
  bundleProfilingResult,
  bundleMappingSuggestion
}) {
  const files = Array.isArray(uploadedFiles) ? uploadedFiles : [];
  const isBundleEvaluation = files.length > 1;

  return {
    run_id: logId,
    created_at: createdAt.toISOString(),
    session_id: sessionId,
    upload: {
      file_count: files.length,
      requested_datasetName: requestedDatasetName,
      requested_sourceDataset: requestedSourceDataset
    },
    session_resolution: {
      resolvedDatasetName,
      resolvedSourceDataset
    },
    files: files.map((item) => ({
      fileName: item.fileName,
      fileId: item.fileId,
      delimiterInfo: item.delimiterInfo ?? null,
      profiling: compactProfilingResult(item.profilingResult),
      detection: {
        inferredDatasetType: item.inferredDatasetType,
        inferredRole: item.inferredRole
      },
      mapping: compactMappingSuggestion(item.mappingSuggestion)
    })),
    bundle: isBundleEvaluation
      ? {
          evaluated: true,
          bundleSchema,
          bundleProfilingResult: compactBundleProfilingResult(bundleProfilingResult),
          bundleMappingSuggestion: compactBundleMappingSuggestion(bundleMappingSuggestion)
        }
      : {
          evaluated: false,
          reason: "single_file_upload"
        }
  };
}

export async function writeProfilingMappingLog(input) {
  const createdAt = new Date();
  const logId = toSafeLogId(createdAt);
  const logPayload = buildLogPayload({
    ...input,
    logId,
    createdAt
  });
  const fileName = `${logId}.json`;
  const filePath = path.join(LOG_DIR, fileName);

  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(logPayload, null, 2)}\n`, "utf8");

  return {
    logId,
    fileName,
    relativePath: `${RELATIVE_LOG_DIR}/${fileName}`,
    viewUrl: `/api/import/profile-logs/${logId}`
  };
}

export async function listProfilingMappingLogs({ limit = 50 } = {}) {
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

      return {
        logId,
        fileName,
        relativePath: `${RELATIVE_LOG_DIR}/${fileName}`,
        viewUrl: `/api/import/profile-logs/${logId}`,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        sizeBytes: stat.size
      };
    })
  );

  return logs
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, limit);
}

export async function readProfilingMappingLog(logId) {
  if (!/^profiling_mapping_[A-Za-z0-9_]+$/.test(String(logId || ""))) {
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
