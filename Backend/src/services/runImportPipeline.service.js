import { confirmMapping } from "./mappingConfirm.service.js";
import { transformRawRowsToCanonical } from "./mappingTransform.service.js";
import { insertNormalizedEntities } from "./entityInsert.service.js";
import { computeStudentFeatures } from "./compositeFeatures.service.js";

// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_PIPELINE_OPTIONS = {
  saveToDb: true,          // Whether to persist to DB (set false for dry-run/preview)
  replaceIfExists: true,
  importBatchId: null,
  chunkSize: 500,
  allowAutoConfirmMapping: false,
  confirmAt: null
};

// ==========================================
// HELPERS
// ==========================================

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ensureArray(value, name) {
  if (!Array.isArray(value)) {
    const error = new Error(`${name} must be an array.`);
    error.code = "INVALID_IMPORT_PIPELINE_INPUT";
    throw error;
  }
}

function ensurePlainObject(value, name) {
  if (!isPlainObject(value)) {
    const error = new Error(`${name} must be a plain object.`);
    error.code = "INVALID_IMPORT_PIPELINE_INPUT";
    throw error;
  }
}

function normalizePipelineOptions(options = {}) {
  return {
    ...DEFAULT_PIPELINE_OPTIONS,
    ...options
  };
}

function createPipelineMetadata(options) {
  const startedAt = new Date();

  return {
    started_at: startedAt.toISOString(),
    completed_at: null,
    duration_ms: null,
    options: {
      saveToDb: options.saveToDb,
      replaceIfExists: options.replaceIfExists,
      chunkSize: options.chunkSize,
      importBatchId: options.importBatchId,
      allowAutoConfirmMapping: options.allowAutoConfirmMapping
    }
  };
}

function assertConfirmedMapping(mappingConfig) {
  if (!isPlainObject(mappingConfig)) {
    const error = new Error("mappingConfig must be a plain object.");
    error.code = "INVALID_IMPORT_PIPELINE_INPUT";
    throw error;
  }

  if (mappingConfig.mapping_status !== "confirmed") {
    const error = new Error(
      'mappingConfig must have mapping_status = "confirmed" to run the import pipeline.'
    );
    error.code = "UNCONFIRMED_MAPPING_CONFIG";
    throw error;
  }
}

function validatePipelineInputs({ mappingConfig, profilingResult, rawRows }) {
  ensurePlainObject(mappingConfig, "mappingConfig");
  ensurePlainObject(profilingResult, "profilingResult");
  ensureArray(rawRows, "rawRows");

  if (!Array.isArray(mappingConfig.field_mappings)) {
    const error = new Error("mappingConfig.field_mappings must be an array.");
    error.code = "INVALID_IMPORT_PIPELINE_INPUT";
    throw error;
  }

  if (!Array.isArray(profilingResult.columns)) {
    const error = new Error("profilingResult.columns must be an array.");
    error.code = "INVALID_IMPORT_PIPELINE_INPUT";
    throw error;
  }
}

function countEntityRows(entityObject = {}) {
  if (!isPlainObject(entityObject)) return {};

  return Object.fromEntries(
    Object.entries(entityObject).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.length : 0
    ])
  );
}

function buildPipelineSummary({ rawRows, transformResult, saveResult }) {
  return {
    raw_row_count: Array.isArray(rawRows) ? rawRows.length : 0,
    transformed_counts: countEntityRows(transformResult?.output),
    saved_counts: saveResult?.summary?.entity_counts ?? null
  };
}

function finalizeMetadata(metadata) {
  metadata.completed_at = new Date().toISOString();
  metadata.duration_ms =
    new Date(metadata.completed_at).getTime() -
    new Date(metadata.started_at).getTime();
}

function createPipelineError(message, phase, cause) {
  const error = new Error(message);
  error.code = "IMPORT_PIPELINE_FAILED";
  error.phase = phase;
  error.cause = cause;
  return error;
}

// ==========================================
// MAIN SERVICE
// ==========================================

export async function runImportPipeline({
  mappingConfig,
  profilingResult,
  rawRows,
  options = {}
}) {
  const resolvedOptions = normalizePipelineOptions(options);
  const metadata = createPipelineMetadata(resolvedOptions);

  try {
    validatePipelineInputs({ mappingConfig, profilingResult, rawRows });

    let mappingForPipeline = mappingConfig;

    if (
      resolvedOptions.allowAutoConfirmMapping &&
      mappingConfig.mapping_status !== "confirmed"
    ) {
      mappingForPipeline = confirmMapping({
        mappingConfig,
        profilingResult,
        confirmedAt: resolvedOptions.confirmAt || new Date().toISOString()
      }).mappingConfig;
    }

    assertConfirmedMapping(mappingForPipeline);

    // ── Phase 1: TRANSFORM ──────────────────────────────────────────────
    // Parse raw rows → normalize → route to 8 canonical entity arrays
    const transformResult = transformRawRowsToCanonical({
      mappingConfig: mappingForPipeline,
      profilingResult,
      rawRows,
      batchId: resolvedOptions.importBatchId
    });

    // ── Phase 2: IN-TABLE FEATURE ENGINEERING ──────────────────────────
    // Compute student-level composite FE fields (lifestyle, socioeconomic scores).
    // Split into a separate pass because these require combining multiple
    // demographic fields with weighted formulas — done cleanly after transform.
    //
    // Row-level FE fields (registration_lead_time, pass_flag, log_click_score,
    // week_of_class) are already computed during Phase 1 transform, inline,
    // because their raw inputs are immediately available at shatter time.
    transformResult.output.student = computeStudentFeatures(
      transformResult.output.student,
      transformResult.output.enrollment
    );

    let saveResult = null;

    if (resolvedOptions.saveToDb) {
      // ── Phase 3: INSERT TO DB ─────────────────────────────────────────
      // Batch-insert all 8 normalized entity arrays into PostgreSQL.
      // Cross-table derived metrics (avg_score, at_risk, etc.) are computed
      // on-demand via SQL queries in the analytics execution engine.
      saveResult = await insertNormalizedEntities({
        normalizedData: transformResult.output,
        batchId: resolvedOptions.importBatchId,
        batchName: mappingForPipeline.dataset_name,
        sourceDataset: mappingForPipeline.source_dataset,
        chunkSize: resolvedOptions.chunkSize
      });
    }

    finalizeMetadata(metadata);

    return {
      success: true,
      metadata,
      profilingResult,
      mappingConfigUsed: mappingForPipeline,
      summary: buildPipelineSummary({ rawRows, transformResult, saveResult }),
      transformResult,
      saveResult
    };
  } catch (cause) {
    finalizeMetadata(metadata);

    throw createPipelineError(
      "Import pipeline execution failed.",
      "PIPELINE_EXECUTION",
      cause
    );
  }
}
