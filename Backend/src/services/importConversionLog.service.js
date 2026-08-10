import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../lib/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const LOG_DIR = path.join(PROJECT_ROOT, "Docs", "evaluation_logs", "import_conversion");
const RELATIVE_LOG_DIR = "Docs/evaluation_logs/import_conversion";

const ENTITY_DELEGATES = [
  ["student", "student"],
  ["course", "course"],
  ["class", "class"],
  ["enrollment", "enrollment"],
  ["assessment", "assessment"],
  ["assessment_result", "assessmentResult"],
  ["event", "event"],
  ["engagement", "engagement"]
];

function toSafeLogId(date = new Date()) {
  const timestamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[^0-9TZ]/g, "");
  return `import_conversion_${timestamp}_${crypto.randomBytes(3).toString("hex")}`;
}

function toCount(value) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (value && typeof value.count === "bigint") return Number(value.count);
  if (value && typeof value.count === "number") return value.count;
  if (value && typeof value.total === "bigint") return Number(value.total);
  if (value && typeof value.total === "number") return value.total;
  return 0;
}

function sumObjects(objects = []) {
  const totals = {};

  for (const object of objects) {
    if (!object || typeof object !== "object") continue;

    for (const [key, value] of Object.entries(object)) {
      const numericValue = Number(value);
      totals[key] = (totals[key] || 0) + (Number.isFinite(numericValue) ? numericValue : 0);
    }
  }

  return totals;
}

function subtractObjects(left = {}, right = {}) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  const result = {};

  for (const key of keys) {
    const value = Number(left?.[key] || 0) - Number(right?.[key] || 0);
    result[key] = value > 0 ? value : 0;
  }

  return result;
}

function buildRawRowsByFile(runTargets = []) {
  const rawRows = {};

  for (const file of runTargets) {
    const key = file?.fileName || file?.fileId || "unknown_file";
    rawRows[key] = Array.isArray(file?.rawRows) ? file.rawRows.length : 0;
  }

  return rawRows;
}

function buildFileLog(file, runResult) {
  const pipelineResult = runResult?.result;
  const metadata = pipelineResult?.metadata;
  const summary = pipelineResult?.summary;

  return {
    fileId: file?.fileId,
    fileName: file?.fileName,
    inferredRole: file?.inferredRole,
    raw_row_count: Array.isArray(file?.rawRows) ? file.rawRows.length : 0,
    mapping_status: file?.confirmedMappingConfig?.mapping_status || null,
    success: !!runResult?.success,
    duration_ms: metadata?.duration_ms ?? null,
    transformed_counts: summary?.transformed_counts ?? {},
    saved_counts: summary?.saved_counts ?? {},
    warnings: pipelineResult?.transformResult?.warnings ?? [],
    errors: runResult?.success
      ? []
      : [
          {
            message: runResult?.error || "Import pipeline failed."
          }
        ]
  };
}

async function countCanonicalRows(batchId) {
  if (!batchId) return {};

  const entries = await Promise.all(
    ENTITY_DELEGATES.map(async ([entityName, delegateName]) => {
      const count = await prisma[delegateName].count({
        where: { batch_id: batchId }
      });
      return [entityName, count];
    })
  );

  return Object.fromEntries(entries);
}

async function countQuery(sql, batchId) {
  const rows = await prisma.$queryRawUnsafe(sql, batchId);
  return toCount(rows?.[0]);
}

async function runFkChecks(batchId) {
  if (!batchId) return { fk_errors: null, details: {} };

  const checks = {
    class_course: `
      SELECT COUNT(*)::int AS count
      FROM "class" c
      LEFT JOIN "course" co
        ON c.course_id = co.course_id AND c.batch_id = co.batch_id
      WHERE c.batch_id = $1 AND co.course_id IS NULL
    `,
    enrollment_student_class: `
      SELECT COUNT(*)::int AS count
      FROM "enrollment" e
      LEFT JOIN "student" s
        ON e.student_id = s.student_id AND e.batch_id = s.batch_id
      LEFT JOIN "class" c
        ON e.class_id = c.class_id AND e.batch_id = c.batch_id
      WHERE e.batch_id = $1
        AND (s.student_id IS NULL OR c.class_id IS NULL)
    `,
    assessment_class: `
      SELECT COUNT(*)::int AS count
      FROM "assessment" a
      LEFT JOIN "class" c
        ON a.class_id = c.class_id AND a.batch_id = c.batch_id
      WHERE a.batch_id = $1 AND c.class_id IS NULL
    `,
    assessment_result_links: `
      SELECT COUNT(*)::int AS count
      FROM "assessment_result" ar
      LEFT JOIN "assessment" a
        ON ar.assessment_id = a.assessment_id AND ar.batch_id = a.batch_id
      LEFT JOIN "student" s
        ON ar.student_id = s.student_id AND ar.batch_id = s.batch_id
      LEFT JOIN "enrollment" e
        ON ar.enrollment_id = e.enrollment_id AND ar.batch_id = e.batch_id
      WHERE ar.batch_id = $1
        AND (a.assessment_id IS NULL OR s.student_id IS NULL OR e.enrollment_id IS NULL)
    `,
    event_class: `
      SELECT COUNT(*)::int AS count
      FROM "event" ev
      LEFT JOIN "class" c
        ON ev.class_id = c.class_id AND ev.batch_id = c.batch_id
      WHERE ev.batch_id = $1 AND c.class_id IS NULL
    `,
    engagement_links: `
      SELECT COUNT(*)::int AS count
      FROM "engagement" eg
      LEFT JOIN "event" ev
        ON eg.event_id = ev.event_id AND eg.batch_id = ev.batch_id
      LEFT JOIN "student" s
        ON eg.student_id = s.student_id AND eg.batch_id = s.batch_id
      LEFT JOIN "enrollment" e
        ON eg.enrollment_id = e.enrollment_id AND eg.batch_id = e.batch_id
      WHERE eg.batch_id = $1
        AND (ev.event_id IS NULL OR s.student_id IS NULL OR e.enrollment_id IS NULL)
    `
  };

  const details = {};

  for (const [name, sql] of Object.entries(checks)) {
    details[name] = await countQuery(sql, batchId);
  }

  return {
    fk_errors: Object.values(details).reduce((sum, value) => sum + value, 0),
    details
  };
}

async function runNullRangeChecks(batchId) {
  if (!batchId) return { null_range_errors: null, details: {} };

  const checks = {
    empty_required_ids: `
      SELECT (
        (SELECT COUNT(*) FROM "student" WHERE batch_id = $1 AND student_id = '') +
        (SELECT COUNT(*) FROM "course" WHERE batch_id = $1 AND course_id = '') +
        (SELECT COUNT(*) FROM "class" WHERE batch_id = $1 AND class_id = '') +
        (SELECT COUNT(*) FROM "enrollment" WHERE batch_id = $1 AND enrollment_id = '') +
        (SELECT COUNT(*) FROM "assessment" WHERE batch_id = $1 AND assessment_id = '') +
        (SELECT COUNT(*) FROM "assessment_result" WHERE batch_id = $1 AND result_id = '') +
        (SELECT COUNT(*) FROM "event" WHERE batch_id = $1 AND event_id = '') +
        (SELECT COUNT(*) FROM "engagement" WHERE batch_id = $1 AND engagement_id = '')
      )::int AS count
    `,
    score_out_of_range: `
      SELECT COUNT(*)::int AS count
      FROM "assessment_result"
      WHERE batch_id = $1
        AND score_normalized IS NOT NULL
        AND (score_normalized < 0 OR score_normalized > 100)
    `,
    negative_engagement_count: `
      SELECT COUNT(*)::int AS count
      FROM "engagement"
      WHERE batch_id = $1
        AND engagement_count IS NOT NULL
        AND engagement_count < 0
    `,
    invalid_log_click_score: `
      SELECT COUNT(*)::int AS count
      FROM "engagement"
      WHERE batch_id = $1
        AND log_click_score IS NOT NULL
        AND log_click_score < 0
    `
  };

  const details = {};

  for (const [name, sql] of Object.entries(checks)) {
    details[name] = await countQuery(sql, batchId);
  }

  return {
    null_range_errors: Object.values(details).reduce((sum, value) => sum + value, 0),
    details
  };
}

async function runFeatureChecks(batchId) {
  if (!batchId) {
    return {
      pass_flag_errors: null,
      week_of_class_errors: null,
      registration_lead_time_errors: null,
      log_click_score_errors: null,
      student_composite_feature_errors: null
    };
  }

  const checks = {
    pass_flag_errors: `
      SELECT COUNT(*)::int AS count
      FROM "assessment_result"
      WHERE batch_id = $1
        AND score_normalized IS NOT NULL
        AND pass_flag IS DISTINCT FROM (score_normalized >= 40)
    `,
    week_of_class_errors: `
      SELECT COUNT(*)::int AS count
      FROM "assessment"
      WHERE batch_id = $1
        AND due_day IS NOT NULL
        AND week_of_class IS DISTINCT FROM CEIL(due_day::numeric / 7.0)::int
    `,
    registration_lead_time_errors: `
      SELECT COUNT(*)::int AS count
      FROM "enrollment"
      WHERE batch_id = $1
        AND (
          (enrollment_start_day < 0 AND registration_lead_time IS DISTINCT FROM ABS(enrollment_start_day))
          OR
          (enrollment_start_day >= 0 AND registration_lead_time IS NOT NULL)
        )
    `,
    log_click_score_errors: `
      SELECT COUNT(*)::int AS count
      FROM "engagement"
      WHERE batch_id = $1
        AND engagement_count IS NOT NULL
        AND engagement_count >= 0
        AND (
          log_click_score IS NULL
          OR ABS(log_click_score - LN(engagement_count + 1)) > 0.000001
        )
    `,
    student_composite_feature_errors: `
      SELECT COUNT(*)::int AS count
      FROM "student"
      WHERE batch_id = $1
        AND (
          (lifestyle_risk_score IS NOT NULL AND (lifestyle_risk_score < 0 OR lifestyle_risk_score > 1))
          OR (support_score IS NOT NULL AND (support_score < 0 OR support_score > 1))
          OR (social_balance_score IS NOT NULL AND (social_balance_score < -1 OR social_balance_score > 1))
          OR (family_stability_score IS NOT NULL AND (family_stability_score < 0 OR family_stability_score > 1))
          OR (disadvantage_score IS NOT NULL AND (disadvantage_score < 0 OR disadvantage_score > 1))
        )
    `
  };

  const results = {};

  for (const [name, sql] of Object.entries(checks)) {
    results[name] = await countQuery(sql, batchId);
  }

  return results;
}

async function loadBatchAndActiveDataset(importBatchId) {
  const [batch, appState] = await Promise.all([
    importBatchId
      ? prisma.importBatch.findUnique({ where: { batch_id: importBatchId } })
      : null,
    prisma.appState.findUnique({ where: { id: 1 } })
  ]);

  return {
    batch: batch
      ? {
          batch_id: batch.batch_id,
          batch_name: batch.batch_name,
          source_dataset: batch.source_dataset,
          learning_mode: batch.learning_mode,
          row_count: batch.row_count,
          status: batch.status,
          is_active: batch.is_active,
          is_sample: batch.is_sample,
          imported_at: batch.imported_at?.toISOString?.() ?? batch.imported_at
        }
      : null,
    active_dataset: appState
      ? {
          active_dataset_id: appState.active_dataset_id,
          active_dataset_name: appState.active_dataset_name,
          active_dataset_type: appState.active_dataset_type,
          active_dataset_source: appState.active_dataset_source,
          active_dataset_set_at: appState.active_dataset_set_at?.toISOString?.() ?? appState.active_dataset_set_at,
          matched_import_batch: !!importBatchId && appState.active_dataset_id === importBatchId
        }
      : null
  };
}

function buildLogPayload({
  logId,
  createdAt,
  session,
  runTargets,
  results,
  success,
  importBatchId,
  importStartedAt,
  importCompletedAt,
  canonicalRows,
  duplicateSkipped,
  fkChecks,
  nullRangeChecks,
  featureChecks,
  batch,
  activeDataset,
  checkError
}) {
  const runResults = Array.isArray(results) ? results : [];
  const targets = Array.isArray(runTargets) ? runTargets : [];
  const fileLogs = targets.map((file) => {
    const runResult = runResults.find((item) => item.fileId === file.fileId);
    return buildFileLog(file, runResult);
  });

  const transformedTotals = sumObjects(fileLogs.map((file) => file.transformed_counts));

  return {
    run_id: logId,
    created_at: createdAt.toISOString(),
    session_id: session?.sessionId ?? null,
    importBatchId,
    success: !!success,
    dataset: {
      datasetName: session?.datasetName ?? null,
      sourceDataset: session?.sourceDataset ?? null,
      bundleMode: targets.length > 1
    },
    files: fileLogs,
    raw_rows: buildRawRowsByFile(targets),
    canonical_rows: canonicalRows,
    duplicate_skipped: duplicateSkipped ?? subtractObjects(transformedTotals, canonicalRows),
    integrity_checks: {
      fk_errors: fkChecks?.fk_errors ?? null,
      fk_details: fkChecks?.details ?? {},
      null_range_errors: nullRangeChecks?.null_range_errors ?? null,
      null_range_details: nullRangeChecks?.details ?? {},
      check_error: checkError ?? null
    },
    feature_checks: featureChecks,
    batch,
    active_dataset: activeDataset,
    import_time_ms:
      importStartedAt && importCompletedAt
        ? new Date(importCompletedAt).getTime() - new Date(importStartedAt).getTime()
        : null
  };
}

export async function writeImportConversionLog({
  session,
  runTargets,
  results,
  success,
  importBatchId,
  importStartedAt,
  importCompletedAt
}) {
  const createdAt = new Date();
  const logId = toSafeLogId(createdAt);
  const shouldRunDbChecks = !!importBatchId;

  let canonicalRows = {};
  let duplicateSkipped = {};
  let fkChecks = { fk_errors: null, details: {} };
  let nullRangeChecks = { null_range_errors: null, details: {} };
  let featureChecks = {
    pass_flag_errors: null,
    week_of_class_errors: null,
    registration_lead_time_errors: null,
    log_click_score_errors: null,
    student_composite_feature_errors: null
  };
  let checkError = null;

  if (shouldRunDbChecks) {
    try {
      canonicalRows = await countCanonicalRows(importBatchId);
      const fileLogs = (Array.isArray(runTargets) ? runTargets : []).map((file) => {
        const runResult = (Array.isArray(results) ? results : []).find((item) => item.fileId === file.fileId);
        return buildFileLog(file, runResult);
      });
      duplicateSkipped = subtractObjects(
        sumObjects(fileLogs.map((file) => file.transformed_counts)),
        canonicalRows
      );
      fkChecks = await runFkChecks(importBatchId);
      nullRangeChecks = await runNullRangeChecks(importBatchId);
      featureChecks = await runFeatureChecks(importBatchId);
    } catch (error) {
      checkError = error.message;
    }
  }

  const { batch, active_dataset: activeDataset } = await loadBatchAndActiveDataset(importBatchId);
  const logPayload = buildLogPayload({
    logId,
    createdAt,
    session,
    runTargets,
    results,
    success,
    importBatchId,
    importStartedAt,
    importCompletedAt,
    canonicalRows,
    duplicateSkipped,
    fkChecks,
    nullRangeChecks,
    featureChecks,
    batch,
    activeDataset,
    checkError
  });

  const fileName = `${logId}.json`;
  const filePath = path.join(LOG_DIR, fileName);

  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(logPayload, null, 2)}\n`, "utf8");

  return {
    logId,
    fileName,
    relativePath: `${RELATIVE_LOG_DIR}/${fileName}`,
    viewUrl: `/api/import/import-logs/${logId}`
  };
}

export async function listImportConversionLogs({ limit = 50 } = {}) {
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
        viewUrl: `/api/import/import-logs/${logId}`,
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

export async function readImportConversionLog(logId) {
  if (!/^import_conversion_[A-Za-z0-9_]+$/.test(String(logId || ""))) {
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
