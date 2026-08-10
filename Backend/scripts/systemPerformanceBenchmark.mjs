import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import { from as copyFrom } from "pg-copy-streams";
import prisma, { pool } from "../src/lib/prisma.js";
import { loadSampleBatchFromCsv } from "../src/services/sampleCsvLoader.service.js";
import { reseedSampleDatasets } from "../src/services/sampleSeeder.service.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, "..");
const projectRoot = path.resolve(backendDir, "..");
const outputDir = path.join(
  projectRoot,
  "Docs",
  "evaluation_logs",
  "system_performance",
);

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function positiveInteger(value, fallback, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed ?? fallback;
}

const baseUrl = readArg("base-url", "http://localhost:4000");
const warmupRuns = positiveInteger(readArg("warmup", "5"), 5, "warmup");
const measuredRuns = positiveInteger(readArg("runs", "30"), 30, "runs");
const timeoutMs = positiveInteger(
  readArg("timeout-ms", "120000"),
  120000,
  "timeout-ms",
);
const scenarioFilter = readArg("scenario", null);
const includeAi = hasFlag("include-ai");
const includeImport = hasFlag("include-import");
const resourceSampleIntervalMs = positiveInteger(
  readArg("resource-sample-ms", "500"),
  500,
  "resource-sample-ms",
);

if (measuredRuns < 1) {
  throw new Error("runs must be at least 1.");
}

const commonHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "x-performance-benchmark": "true",
};

const benchmarkHeaders = {
  Accept: "application/json",
  "x-performance-benchmark": "true",
};

const datasets = {
  UCI: {
    datasetId: "SAMPLE_UCI_POR",
    batchId: "SAMPLE_UCI_POR",
    classId: "SAMPLE_UCI_POR_CLASS",
    studentId: "SAMPLE_UCI_POR_STU_000001",
  },
  OULAD: {
    datasetId: "SAMPLE_OULAD",
    batchId: "SAMPLE_OULAD",
    classId: "SAMPLE_OULAD_CLASS_CCC_2014J",
    studentId: "SAMPLE_OULAD_STU_100788",
  },
};

function analyticsScenario(id, dataset, taskId, complexity) {
  const context = datasets[dataset];
  const params = {
    batch_id: context.batchId,
    class_id: context.classId,
  };
  if (taskId === "S-T01") params.student_id = context.studentId;

  return {
    id,
    category: "analytics",
    dataset,
    complexity,
    method: "POST",
    endpoint: "/api/analytics/run",
    body: { taskId, params },
    validateResponse: (body) => body?.success === true && body?.taskId === taskId,
    extractServerMetrics: (body) => ({
      analytics_execution_ms: body?.meta?.executionTimeMs ?? null,
      query_count: body?.meta?.queryCount ?? null,
      result_dataset_count: body?.datasets
        ? Object.keys(body.datasets).length
        : null,
    }),
  };
}

const scenarios = [
  {
    id: "task_availability_uci",
    category: "task_availability",
    dataset: "UCI",
    complexity: "all_52_public_tasks",
    method: "GET",
    endpoint:
      `/api/tasks/available?datasetId=${datasets.UCI.datasetId}` +
      `&classId=${datasets.UCI.classId}`,
    validateResponse: (body) =>
      body?.success === true && body?.summary?.total === 52,
    extractServerMetrics: (body) => ({
      task_count: body?.summary?.total ?? null,
      executable_count: body?.summary?.executable ?? null,
    }),
  },
  {
    id: "task_availability_oulad",
    category: "task_availability",
    dataset: "OULAD",
    complexity: "all_52_public_tasks",
    method: "GET",
    endpoint:
      `/api/tasks/available?datasetId=${datasets.OULAD.datasetId}` +
      `&classId=${datasets.OULAD.classId}`,
    validateResponse: (body) =>
      body?.success === true && body?.summary?.total === 52,
    extractServerMetrics: (body) => ({
      task_count: body?.summary?.total ?? null,
      executable_count: body?.summary?.executable ?? null,
    }),
  },
  analyticsScenario("analytics_simple_uci", "UCI", "A-B02", "simple"),
  analyticsScenario("analytics_simple_oulad", "OULAD", "A-B02", "simple"),
  analyticsScenario("analytics_trend_uci", "UCI", "S-T01", "complex"),
  analyticsScenario("analytics_trend_oulad", "OULAD", "S-T01", "complex"),
];

async function buildAiScenarios() {
  const result = [];
  for (const dataset of ["UCI", "OULAD"]) {
    const context = datasets[dataset];
    const analyticsResponse = await requestJson({
      method: "POST",
      endpoint: "/api/analytics/run",
      body: {
        taskId: "S-T01",
        params: {
          batch_id: context.batchId,
          class_id: context.classId,
          student_id: context.studentId,
        },
      },
    });
    if (!analyticsResponse.success) {
      throw new Error(
        `Unable to prepare AI evidence for ${dataset}: ` +
          `${analyticsResponse.error || analyticsResponse.statusCode}`,
      );
    }

    result.push({
      id: `ai_explanation_${dataset.toLowerCase()}`,
      category: "ai_explanation",
      dataset,
      complexity: "external_ai_service",
      method: "POST",
      endpoint: "/api/ai/explain",
      body: {
        taskId: "S-T01",
        executionId: analyticsResponse.body.executionId,
        datasets: analyticsResponse.body.datasets,
        meta: analyticsResponse.body.meta,
        studentContext: null,
      },
      validateResponse: (body) =>
        body?.task_id === "S-T01" &&
        typeof body?.degraded === "boolean",
      extractServerMetrics: (body) => ({
        ai_latency_ms: body?.meta?.latency_ms ?? null,
        degraded: body?.degraded ?? null,
        model: body?.meta?.model ?? null,
        prompt_tokens: body?.meta?.token_usage?.prompt_tokens ?? null,
        completion_tokens: body?.meta?.token_usage?.completion_tokens ?? null,
        total_tokens: body?.meta?.token_usage?.total_tokens ?? null,
        cost_usd: body?.meta?.cost_usd ?? null,
      }),
    });
  }
  return result;
}

const importScenarios = [
  {
    id: "import_pipeline_uci",
    category: "import_pipeline",
    dataset: "UCI",
    complexity: "single_csv_profile_confirm_import_with_cleanup",
    source_files: [
      path.join(backendDir, "uploads", "UCI", "student-por.csv"),
    ],
    dataset_name: "UCI",
    source_dataset: "UCI",
    chunk_size: 500,
  },
  {
    id: "import_pipeline_oulad",
    category: "import_pipeline",
    dataset: "OULAD",
    import_mode: "streaming_sample_reseed",
    complexity: "multi_csv_streaming_reseed_with_engagement_chunks",
    source_files: [
      path.join(backendDir, "uploads", "OULAD", "courses.csv"),
      path.join(backendDir, "uploads", "OULAD", "assessments.csv"),
      path.join(backendDir, "uploads", "OULAD", "studentInfo.csv"),
      path.join(backendDir, "uploads", "OULAD", "studentRegistration.csv"),
      path.join(backendDir, "uploads", "OULAD", "studentAssessment.csv"),
      path.join(backendDir, "uploads", "OULAD", "vle.csv"),
      path.join(backendDir, "uploads", "OULAD", "studentVle.csv"),
    ],
    dataset_name: "OULAD",
    source_dataset: "OULAD",
    chunk_size: 10000,
  },
];

function round(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return null;
  const rank = Math.ceil((percentileValue / 100) * sortedValues.length);
  return sortedValues[Math.max(0, rank - 1)];
}

function summarize(requests, wallClockMs) {
  const successful = requests.filter((item) => item.success);
  const durations = successful
    .map((item) => item.duration_ms)
    .sort((a, b) => a - b);
  const totalDurationMs = durations.reduce((sum, value) => sum + value, 0);
  const errorCount = requests.length - successful.length;

  return {
    runs: requests.length,
    success_count: successful.length,
    error_count: errorCount,
    error_rate_pct: round((errorCount / requests.length) * 100),
    min_ms: durations.length ? round(durations[0]) : null,
    average_ms: durations.length
      ? round(totalDurationMs / durations.length)
      : null,
    p50_ms: durations.length ? round(percentile(durations, 50)) : null,
    p95_ms: durations.length ? round(percentile(durations, 95)) : null,
    max_ms: durations.length
      ? round(durations[durations.length - 1])
      : null,
    sequential_throughput_requests_per_second:
      wallClockMs > 0 ? round(successful.length / (wallClockMs / 1000)) : null,
    measured_wall_clock_ms: round(wallClockMs),
  };
}

function cpuSnapshot() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

function calculateCpuPercent(previous, current) {
  let idleDelta = 0;
  let totalDelta = 0;

  for (let index = 0; index < current.length; index += 1) {
    const before = previous[index];
    const after = current[index];
    if (!before || !after) continue;

    const keys = ["user", "nice", "sys", "idle", "irq"];
    const coreTotal = keys.reduce(
      (sum, key) => sum + Math.max(0, after[key] - before[key]),
      0,
    );
    idleDelta += Math.max(0, after.idle - before.idle);
    totalDelta += coreTotal;
  }

  return totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0;
}

function summarizeResources(samples) {
  if (samples.length === 0) {
    return {
      sample_count: 0,
      sample_interval_ms: resourceSampleIntervalMs,
      average_cpu_percent: null,
      peak_cpu_percent: null,
      average_used_memory_bytes: null,
      peak_used_memory_bytes: null,
      average_used_memory_percent: null,
      peak_used_memory_percent: null,
    };
  }

  const average = (key) =>
    samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
  const peak = (key) => Math.max(...samples.map((sample) => sample[key]));

  return {
    sample_count: samples.length,
    sample_interval_ms: resourceSampleIntervalMs,
    average_cpu_percent: round(average("cpu_percent")),
    peak_cpu_percent: round(peak("cpu_percent")),
    average_used_memory_bytes: Math.round(average("used_memory_bytes")),
    peak_used_memory_bytes: Math.round(peak("used_memory_bytes")),
    average_used_memory_percent: round(average("used_memory_percent")),
    peak_used_memory_percent: round(peak("used_memory_percent")),
  };
}

function startResourceMonitor() {
  const samples = [];
  let previousCpu = cpuSnapshot();

  const capture = () => {
    const currentCpu = cpuSnapshot();
    const usedMemoryBytes = os.totalmem() - os.freemem();
    samples.push({
      timestamp: new Date().toISOString(),
      cpu_percent: round(calculateCpuPercent(previousCpu, currentCpu)),
      used_memory_bytes: usedMemoryBytes,
      used_memory_percent: round((usedMemoryBytes / os.totalmem()) * 100),
    });
    previousCpu = currentCpu;
  };

  const timer = setInterval(capture, resourceSampleIntervalMs);
  return {
    stop() {
      clearInterval(timer);
      capture();
      return samples;
    },
  };
}

async function requestJson(scenario) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = new Date().toISOString();
  const start = performance.now();

  try {
    const response = await fetch(`${baseUrl}${scenario.endpoint}`, {
      method: scenario.method,
      headers: commonHeaders,
      body:
        scenario.method === "GET" || scenario.body === undefined
          ? undefined
          : JSON.stringify(scenario.body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    const durationMs = performance.now() - start;
    let body = null;
    let parseError = null;
    try {
      body = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
      parseError = error.message;
    }

    const validBody =
      !parseError &&
      (scenario.validateResponse ? scenario.validateResponse(body) : true);
    const success = response.ok && validBody;

    return {
      success,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status_code: response.status,
      duration_ms: round(durationMs),
      response_bytes: Buffer.byteLength(responseText),
      validation_passed: validBody,
      parse_error: parseError,
      server_metrics:
        body && scenario.extractServerMetrics
          ? scenario.extractServerMetrics(body)
          : {},
      error: success
        ? null
        : parseError || body?.error?.message || body?.error || response.statusText,
      body,
    };
  } catch (error) {
    return {
      success: false,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status_code: null,
      duration_ms: round(performance.now() - start),
      response_bytes: 0,
      validation_passed: false,
      parse_error: null,
      server_metrics: {},
      error:
        error.name === "AbortError"
          ? `Request timed out after ${timeoutMs} ms`
          : error.message,
      body: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestMultipart({ endpoint, form }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = new Date().toISOString();
  const start = performance.now();

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: benchmarkHeaders,
      body: form,
      signal: controller.signal,
    });
    const responseText = await response.text();
    const durationMs = performance.now() - start;
    let body = null;
    let parseError = null;
    try {
      body = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
      parseError = error.message;
    }

    const success = response.ok && !parseError && body?.success === true;
    return {
      success,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status_code: response.status,
      duration_ms: round(durationMs),
      response_bytes: Buffer.byteLength(responseText),
      validation_passed: success,
      parse_error: parseError,
      server_metrics: {},
      error: success
        ? null
        : parseError || body?.error?.message || body?.error || body?.message || response.statusText,
      body,
    };
  } catch (error) {
    return {
      success: false,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status_code: null,
      duration_ms: round(performance.now() - start),
      response_bytes: 0,
      validation_passed: false,
      parse_error: null,
      server_metrics: {},
      error:
        error.name === "AbortError"
          ? `Request timed out after ${timeoutMs} ms`
          : error.message,
      body: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function restoreAppState(snapshot) {
  if (!snapshot) return;

  await prisma.appState.upsert({
    where: { id: 1 },
    update: {
      active_dataset_id: snapshot.active_dataset_id,
      active_dataset_name: snapshot.active_dataset_name,
      active_dataset_type: snapshot.active_dataset_type,
      active_dataset_source: snapshot.active_dataset_source,
      active_dataset_set_at: snapshot.active_dataset_set_at,
      is_first_use: snapshot.is_first_use,
    },
    create: {
      id: 1,
      active_dataset_id: snapshot.active_dataset_id,
      active_dataset_name: snapshot.active_dataset_name,
      active_dataset_type: snapshot.active_dataset_type,
      active_dataset_source: snapshot.active_dataset_source,
      active_dataset_set_at: snapshot.active_dataset_set_at,
      is_first_use: snapshot.is_first_use,
    },
  });
}

async function cleanupImportArtifacts({ importBatchId, sessionId, appStateSnapshot }) {
  if (importBatchId) {
    await prisma.importBatch.deleteMany({
      where: { batch_id: importBatchId },
    });
  }

  if (sessionId) {
    await prisma.uploadSession.deleteMany({
      where: { session_id: sessionId },
    });
  }

  await restoreAppState(appStateSnapshot);
}

async function buildImportForm(scenario) {
  const form = new FormData();
  form.append("datasetName", scenario.dataset_name);
  form.append("sourceDataset", scenario.source_dataset);

  const sourceFiles = Array.isArray(scenario.source_files)
    ? scenario.source_files
    : [scenario.source_file].filter(Boolean);

  for (const sourceFile of sourceFiles) {
    const buffer = await fs.readFile(sourceFile);
    form.append(
      "files",
      new Blob([buffer], { type: "text/csv" }),
      path.basename(sourceFile),
    );
  }

  return form;
}

function buildBenchmarkConfirmedMapping(mappingSuggestion) {
  const mappingConfig = JSON.parse(JSON.stringify(mappingSuggestion));

  mappingConfig.mapping_status = "confirmed";
  mappingConfig.confirmed_at = new Date().toISOString();
  mappingConfig.field_mappings = Array.isArray(mappingConfig.field_mappings)
    ? mappingConfig.field_mappings.map((item) => {
        if (!item?.canonical_field || item.transform === "ignore") {
          return {
            ...item,
            status: item?.status === "ignored" ? "ignored" : "unmapped",
            canonical_field: null,
            transform: "ignore",
            entity_scope: null,
          };
        }

        if (item.canonical_field === "absence_count") {
          return {
            ...item,
            status: "unmapped",
            canonical_field: null,
            transform: "ignore",
            entity_scope: null,
            review_comment:
              "Ignored by system performance benchmark because current strict validator and transform disagree on absence_count scope.",
          };
        }

        return {
          ...item,
          status: "confirmed",
        };
      })
    : [];

  return mappingConfig;
}

async function executeImportIteration(scenario, index, appStateSnapshot, phase) {
  const importBatchId =
    `PERF_${scenario.dataset}_${new Date().toISOString().replace(/[-:.]/g, "")}` +
    `_${phase}_${index + 1}_${crypto.randomBytes(2).toString("hex")}`;
  let sessionId = null;

  const startedAt = new Date().toISOString();
  const start = performance.now();
  const steps = {};

  try {
    await cleanupImportArtifacts({ importBatchId, sessionId: null, appStateSnapshot });

    const profile = await requestMultipart({
      endpoint: "/api/import/profile",
      form: await buildImportForm(scenario),
    });
    steps.profile = compactRequest(profile, 0);
    if (!profile.success) throw new Error(`profile failed: ${profile.error}`);

    sessionId = profile.body.sessionId;
    const uploadedFiles = Array.isArray(profile.body.uploadedFiles)
      ? profile.body.uploadedFiles
      : [];
    if (uploadedFiles.length === 0) {
      throw new Error("profile did not return uploaded files");
    }

    const confirmResults = [];
    for (const file of uploadedFiles) {
      const confirm = await requestJson({
        method: "POST",
        endpoint: "/api/import/confirm-mapping",
        body: {
          sessionId,
          fileId: file.fileId,
          mappingConfig: buildBenchmarkConfirmedMapping(file.mappingSuggestion),
        },
        validateResponse: (body) => body?.success === true,
      });
      confirmResults.push(compactRequest(confirm, confirmResults.length));
      if (!confirm.success) throw new Error(`confirm failed: ${confirm.error}`);
    }
    steps.confirm_mapping = confirmResults;

    const run = await requestJson({
      method: "POST",
      endpoint: "/api/import/run",
      body: {
        sessionId,
        fileIds: uploadedFiles.map((file) => file.fileId),
        options: {
          importBatchId,
          replaceIfExists: true,
          chunkSize: scenario.chunk_size,
        },
      },
      validateResponse: (body) =>
        body?.success === true && body?.importBatchId === importBatchId,
    });
    steps.import_run = compactRequest(run, 0);
    if (!run.success) throw new Error(`import run failed: ${run.error}`);

    const importedRows =
      Number(profile.body?.bundleProfilingResult?.total_rows) ||
      uploadedFiles.reduce(
        (sum, file) => sum + Number(file.profilingResult?.rowCount || 0),
        0,
      );
    const durationMs = performance.now() - start;
    const result = {
      success: true,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status_code: run.status_code,
      duration_ms: round(durationMs),
      response_bytes:
        (steps.profile?.response_bytes || 0) +
        confirmResults.reduce((sum, item) => sum + (item.response_bytes || 0), 0) +
        (steps.import_run?.response_bytes || 0),
      validation_passed: true,
      server_metrics: {
        import_batch_id: importBatchId,
        session_id: sessionId,
        uploaded_file_count: uploadedFiles.length,
        imported_input_rows: importedRows,
        rows_per_second:
          durationMs > 0 ? round(importedRows / (durationMs / 1000)) : null,
        profile_ms: steps.profile.duration_ms,
        confirm_mapping_ms: round(
          confirmResults.reduce((sum, item) => sum + item.duration_ms, 0),
        ),
        import_run_ms: steps.import_run.duration_ms,
      },
      steps,
      error: null,
    };

    return result;
  } catch (error) {
    return {
      success: false,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status_code: steps.import_run?.status_code || steps.profile?.status_code || null,
      duration_ms: round(performance.now() - start),
      response_bytes:
        (steps.profile?.response_bytes || 0) +
        (steps.import_run?.response_bytes || 0),
      validation_passed: false,
      server_metrics: {
        import_batch_id: importBatchId,
        session_id: sessionId,
      },
      steps,
      error: error.message,
    };
  } finally {
    await cleanupImportArtifacts({ importBatchId, sessionId, appStateSnapshot });
  }
}

function compactRequest(result, index) {
  return {
    run: index + 1,
    started_at: result.started_at,
    completed_at: result.completed_at,
    status_code: result.status_code,
    duration_ms: result.duration_ms,
    response_bytes: result.response_bytes,
    success: result.success,
    validation_passed: result.validation_passed,
    server_metrics: result.server_metrics,
    error: result.error,
  };
}

async function executeScenario(scenario) {
  process.stdout.write(
    `\n[${scenario.id}] warm-up ${warmupRuns}, measured ${measuredRuns}\n`,
  );

  const warmup = [];
  for (let index = 0; index < warmupRuns; index += 1) {
    const result = await requestJson(scenario);
    warmup.push(compactRequest(result, index));
    process.stdout.write(
      `  warm-up ${index + 1}/${warmupRuns}: ` +
        `${result.duration_ms} ms ${result.success ? "OK" : "FAIL"}\n`,
    );
  }

  const measured = [];
  const resourceMonitor = startResourceMonitor();
  const wallStart = performance.now();
  for (let index = 0; index < measuredRuns; index += 1) {
    const result = await requestJson(scenario);
    measured.push(compactRequest(result, index));
    process.stdout.write(
      `  run ${index + 1}/${measuredRuns}: ` +
        `${result.duration_ms} ms ${result.success ? "OK" : "FAIL"}\n`,
    );
  }
  const wallClockMs = performance.now() - wallStart;
  const resourceSamples = resourceMonitor.stop();

  return {
    scenario_id: scenario.id,
    category: scenario.category,
    dataset: scenario.dataset,
    complexity: scenario.complexity,
    request: {
      method: scenario.method,
      endpoint: scenario.endpoint,
      body: scenario.body ?? null,
    },
    warmup_results: warmup,
    requests: measured,
    summary: summarize(measured, wallClockMs),
    resource_summary: summarizeResources(resourceSamples),
    resource_samples: resourceSamples,
  };
}

async function deleteOuladBatchRows() {
  const batchId = "SAMPLE_OULAD";
  let deletedEngagementRows = 0;
  let deleteChunkCount = 0;
  while (true) {
    const deleted = await prisma.$executeRaw`
      DELETE FROM engagement
      WHERE ctid IN (
        SELECT ctid
        FROM engagement
        WHERE batch_id = ${batchId}
        LIMIT 100000
      )
    `;
    if (!deleted) break;
    deletedEngagementRows += Number(deleted);
    deleteChunkCount += 1;
    if (deleteChunkCount % 10 === 0) {
      process.stdout.write(
        `    delete engagement chunks=${deleteChunkCount}, ` +
          `rows_deleted=${deletedEngagementRows}\n`,
      );
    }
  }
  await prisma.assessmentResult.deleteMany({ where: { batch_id: batchId } });
  await prisma.event.deleteMany({ where: { batch_id: batchId } });
  await prisma.assessment.deleteMany({ where: { batch_id: batchId } });
  await prisma.enrollment.deleteMany({ where: { batch_id: batchId } });
  await prisma.class.deleteMany({ where: { batch_id: batchId } });
  await prisma.course.deleteMany({ where: { batch_id: batchId } });
  await prisma.student.deleteMany({ where: { batch_id: batchId } });
  return {
    engagement_rows_deleted: deletedEngagementRows,
    engagement_delete_chunks: deleteChunkCount,
  };
}

async function createManyInChunks(delegate, rows, chunkSize = 5000) {
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const result = await delegate.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    inserted += result?.count || 0;
  }
  return inserted;
}

async function insertOuladBaseDataset(dataset) {
  const counts = {};
  counts.course = await createManyInChunks(prisma.course, dataset.courses);
  counts.class = await createManyInChunks(prisma.class, dataset.classes);
  counts.student = await createManyInChunks(prisma.student, dataset.students);
  counts.enrollment = await createManyInChunks(
    prisma.enrollment,
    dataset.enrollments,
  );
  counts.assessment = await createManyInChunks(
    prisma.assessment,
    dataset.assessments,
  );
  counts.assessment_result = await createManyInChunks(
    prisma.assessmentResult,
    dataset.assessment_results,
  );
  counts.event = await createManyInChunks(prisma.event, dataset.events);
  return counts;
}

async function copyOuladEngagementFromCsv(sourceFile) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE perf_oulad_student_vle (
        code_module text,
        code_presentation text,
        id_student text,
        id_site text,
        event_day integer,
        sum_click integer
      ) ON COMMIT DROP
    `);

    const copyStream = client.query(
      copyFrom(`
        COPY perf_oulad_student_vle (
          code_module,
          code_presentation,
          id_student,
          id_site,
          event_day,
          sum_click
        )
        FROM STDIN
        WITH (FORMAT csv, HEADER true)
      `),
    );
    await pipeline(fsSync.createReadStream(sourceFile), copyStream);

    const rawCountResult = await client.query(
      "SELECT COUNT(*)::bigint AS count FROM perf_oulad_student_vle",
    );
    const rawRowCount = Number(rawCountResult.rows[0]?.count || 0);

    const insertResult = await client.query(`
      INSERT INTO engagement (
        engagement_id,
        batch_id,
        event_id,
        student_id,
        enrollment_id,
        source_dataset,
        event_day,
        week_number,
        engagement_count,
        log_click_score
      )
      SELECT
        'SAMPLE_OULAD_ENG_' || st.student_id || '_' || ev.event_id || '_' || raw.event_day,
        'SAMPLE_OULAD',
        ev.event_id,
        st.student_id,
        enr.enrollment_id,
        'OULAD',
        raw.event_day,
        FLOOR(raw.event_day / 7.0)::int + 1,
        COALESCE(raw.sum_click, 0),
        LN(COALESCE(raw.sum_click, 0) + 1)
      FROM perf_oulad_student_vle raw
      JOIN student st
        ON st.student_id = 'SAMPLE_OULAD_STU_' || raw.id_student
       AND st.batch_id = 'SAMPLE_OULAD'
      JOIN enrollment enr
        ON enr.student_id = st.student_id
       AND enr.class_id =
           'SAMPLE_OULAD_CLASS_' || raw.code_module || '_' || raw.code_presentation
       AND enr.batch_id = 'SAMPLE_OULAD'
      JOIN event ev
        ON ev.event_id = 'SAMPLE_OULAD_EVT_' || raw.id_site
       AND ev.class_id = enr.class_id
       AND ev.batch_id = 'SAMPLE_OULAD'
      ON CONFLICT (batch_id, student_id, event_id, event_day) DO NOTHING
    `);
    await client.query("COMMIT");

    return {
      raw_row_count: rawRowCount,
      inserted_row_count: Number(insertResult.rowCount || 0),
      strategy: "postgres_copy_to_temp_then_insert_select",
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function upsertOuladBenchmarkBatch(status, rowCount) {
  await prisma.importBatch.upsert({
    where: { batch_id: "SAMPLE_OULAD" },
    update: {
      batch_name: "OULAD Sample Dataset",
      source_dataset: "OULAD",
      learning_mode: "online",
      imported_at: new Date(),
      is_active: false,
      is_sample: true,
      row_count: rowCount,
      status,
    },
    create: {
      batch_id: "SAMPLE_OULAD",
      batch_name: "OULAD Sample Dataset",
      source_dataset: "OULAD",
      learning_mode: "online",
      imported_at: new Date(),
      is_active: false,
      is_sample: true,
      row_count: rowCount,
      status,
    },
  });
}

async function executeStreamingSampleImportIteration(
  scenario,
  index,
  phase,
  appStateSnapshot,
) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const stepTimings = {};

  try {
    const clearStart = performance.now();
    await upsertOuladBenchmarkBatch("processing", 0);
    const clearCounts = await deleteOuladBatchRows();
    stepTimings.clear_existing_ms = round(performance.now() - clearStart);

    const baseLoadStart = performance.now();
    const base = await loadSampleBatchFromCsv("SAMPLE_OULAD", {
      mode: "dry-run",
      scanOuladEngagementRows: false,
    });
    stepTimings.base_load_ms = round(performance.now() - baseLoadStart);
    if (!base.ok || !base.dataset) {
      throw new Error(
        `OULAD base load failed: ${(base.errors || []).join("; ")}`,
      );
    }

    const baseInsertStart = performance.now();
    const insertedBaseCounts = await insertOuladBaseDataset(base.dataset);
    stepTimings.base_insert_ms = round(performance.now() - baseInsertStart);

    const engagementStart = performance.now();
    const engagementCopy = await copyOuladEngagementFromCsv(
      path.join(backendDir, "uploads", "OULAD", "studentVle.csv"),
    );
    stepTimings.engagement_stream_insert_ms = round(
      performance.now() - engagementStart,
    );

    const canonicalRowCount =
      Object.values(insertedBaseCounts).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      ) + engagementCopy.inserted_row_count;
    await upsertOuladBenchmarkBatch("completed", canonicalRowCount);
    await restoreAppState(appStateSnapshot);

    const durationMs = performance.now() - start;

    return {
      success: true,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status_code: null,
      duration_ms: round(durationMs),
      response_bytes: 0,
      validation_passed: true,
      server_metrics: {
        import_batch_id: "SAMPLE_OULAD",
        import_mode: scenario.import_mode,
        canonical_row_count: canonicalRowCount,
        rows_per_second:
          durationMs > 0 ? round(canonicalRowCount / (durationMs / 1000)) : null,
        canonical_counts: {
          ...insertedBaseCounts,
          engagement: engagementCopy.inserted_row_count,
        },
        raw_row_counts: {
          ...base.rawRowCounts,
          "studentVle.csv": engagementCopy.raw_row_count,
        },
        engagement_import_strategy: engagementCopy.strategy,
        engagement_raw_rows: engagementCopy.raw_row_count,
        clear_counts: clearCounts,
        step_timings_ms: stepTimings,
        active_dataset_after: appStateSnapshot?.active_dataset_id ?? null,
        phase,
      },
      error: null,
    };
  } catch (error) {
    await upsertOuladBenchmarkBatch("failed", 0).catch(() => {});
    await restoreAppState(appStateSnapshot).catch(() => {});
    return {
      success: false,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status_code: null,
      duration_ms: round(performance.now() - start),
      response_bytes: 0,
      validation_passed: false,
      server_metrics: {
        import_batch_id: "SAMPLE_OULAD",
        import_mode: scenario.import_mode,
        phase,
        code: error.code ?? null,
        step_timings_ms: stepTimings,
      },
      error: error.message,
    };
  }
}

async function executeStreamingSampleImportScenario(scenario) {
  process.stdout.write(
    `\n[${scenario.id}] warm-up ${warmupRuns}, measured ${measuredRuns}\n`,
  );

  const appStateSnapshot = await prisma.appState.findUnique({ where: { id: 1 } });
  const warmup = [];
  for (let index = 0; index < warmupRuns; index += 1) {
    const result = await executeStreamingSampleImportIteration(
      scenario,
      index,
      "warmup",
      appStateSnapshot,
    );
    warmup.push(compactRequest(result, index));
    process.stdout.write(
      `  warm-up ${index + 1}/${warmupRuns}: ` +
        `${result.duration_ms} ms ${result.success ? "OK" : "FAIL"}\n`,
    );
  }

  const measured = [];
  const resourceMonitor = startResourceMonitor();
  const wallStart = performance.now();
  for (let index = 0; index < measuredRuns; index += 1) {
    const result = await executeStreamingSampleImportIteration(
      scenario,
      index,
      "measured",
      appStateSnapshot,
    );
    measured.push(compactRequest(result, index));
    process.stdout.write(
      `  run ${index + 1}/${measuredRuns}: ` +
        `${result.duration_ms} ms ${result.success ? "OK" : "FAIL"}\n`,
    );
  }
  const wallClockMs = performance.now() - wallStart;
  const resourceSamples = resourceMonitor.stop();

  return {
    scenario_id: scenario.id,
    category: scenario.category,
    dataset: scenario.dataset,
    complexity: scenario.complexity,
    request: {
      method: "DIRECT_SERVICE",
      service: "loadSampleBatchFromCsv + chunked Prisma createMany",
      batch_ids: ["SAMPLE_OULAD"],
      force_reseed: true,
      source_files: scenario.source_files.map((sourceFile) =>
        path.relative(projectRoot, sourceFile),
      ),
    },
    warmup_results: warmup,
    requests: measured,
    summary: summarize(measured, wallClockMs),
    resource_summary: summarizeResources(resourceSamples),
    resource_samples: resourceSamples,
    cleanup_protocol: {
      sample_batch_reseeded_in_place: true,
      streaming_engagement_insert: true,
      student_vle_scan_count: 1,
      app_state_restored_after_iteration: true,
    },
  };
}

async function executeProductionOuladImportIteration(phase) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  try {
    const result = await reseedSampleDatasets({
      apply: true,
      batchIds: ["SAMPLE_OULAD"],
      forceReseed: true,
    });
    const durationMs = performance.now() - start;
    const batch = result.perBatchResults?.find(
      (item) => item.batchId === "SAMPLE_OULAD",
    );
    const loaded = result.batches?.find(
      (item) => item.batchId === "SAMPLE_OULAD",
    );

    return {
      success: true,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status_code: null,
      duration_ms: round(durationMs),
      response_bytes: 0,
      validation_passed: true,
      server_metrics: {
        import_batch_id: "SAMPLE_OULAD",
        import_mode: "production_sample_reseed_bulk_copy",
        canonical_row_count: batch?.canonicalRowCount ?? null,
        base_canonical_counts: loaded?.canonicalCounts ?? null,
        phase,
      },
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status_code: null,
      duration_ms: round(performance.now() - start),
      response_bytes: 0,
      validation_passed: false,
      server_metrics: {
        import_batch_id: "SAMPLE_OULAD",
        import_mode: "production_sample_reseed_bulk_copy",
        phase,
        code: error.code ?? null,
      },
      error: error.message,
    };
  }
}

async function executeProductionOuladImportScenario(scenario) {
  process.stdout.write(
    `\n[${scenario.id}] warm-up ${warmupRuns}, measured ${measuredRuns}\n`,
  );
  const warmup = [];
  for (let index = 0; index < warmupRuns; index += 1) {
    const result = await executeProductionOuladImportIteration("warmup");
    warmup.push(compactRequest(result, index));
  }

  const measured = [];
  const resourceMonitor = startResourceMonitor();
  const wallStart = performance.now();
  for (let index = 0; index < measuredRuns; index += 1) {
    const result = await executeProductionOuladImportIteration("measured");
    measured.push(compactRequest(result, index));
    process.stdout.write(
      `  run ${index + 1}/${measuredRuns}: ` +
        `${result.duration_ms} ms ${result.success ? "OK" : "FAIL"}\n`,
    );
  }
  const wallClockMs = performance.now() - wallStart;
  const resourceSamples = resourceMonitor.stop();

  return {
    scenario_id: scenario.id,
    category: scenario.category,
    dataset: scenario.dataset,
    complexity: scenario.complexity,
    request: {
      method: "DIRECT_SERVICE",
      service: "reseedSampleDatasets",
      strategy:
        "fast_preflight_copy_stage_drop_indexes_insert_rebuild_indexes",
      batch_ids: ["SAMPLE_OULAD"],
    },
    warmup_results: warmup,
    requests: measured,
    summary: summarize(measured, wallClockMs),
    resource_summary: summarizeResources(resourceSamples),
    resource_samples: resourceSamples,
  };
}

async function executeImportScenario(scenario) {
  if (scenario.import_mode === "streaming_sample_reseed") {
    return executeProductionOuladImportScenario(scenario);
  }

  process.stdout.write(
    `\n[${scenario.id}] warm-up ${warmupRuns}, measured ${measuredRuns}\n`,
  );

  const appStateSnapshot = await prisma.appState.findUnique({ where: { id: 1 } });

  const warmup = [];
  for (let index = 0; index < warmupRuns; index += 1) {
    const result = await executeImportIteration(
      scenario,
      index,
      appStateSnapshot,
      "warmup",
    );
    warmup.push(compactRequest(result, index));
    process.stdout.write(
      `  warm-up ${index + 1}/${warmupRuns}: ` +
        `${result.duration_ms} ms ${result.success ? "OK" : "FAIL"}\n`,
    );
  }

  const measured = [];
  const resourceMonitor = startResourceMonitor();
  const wallStart = performance.now();
  for (let index = 0; index < measuredRuns; index += 1) {
    const result = await executeImportIteration(
      scenario,
      index,
      appStateSnapshot,
      "measured",
    );
    measured.push(compactRequest(result, index));
    process.stdout.write(
      `  run ${index + 1}/${measuredRuns}: ` +
        `${result.duration_ms} ms ${result.success ? "OK" : "FAIL"}\n`,
    );
  }
  const wallClockMs = performance.now() - wallStart;
  const resourceSamples = resourceMonitor.stop();

  return {
    scenario_id: scenario.id,
    category: scenario.category,
    dataset: scenario.dataset,
    complexity: scenario.complexity,
    request: {
      method: "MULTI_STEP",
      endpoints: [
        "/api/import/profile",
        "/api/import/confirm-mapping",
        "/api/import/run",
      ],
      source_files: (Array.isArray(scenario.source_files)
        ? scenario.source_files
        : [scenario.source_file].filter(Boolean)
      ).map((sourceFile) => path.relative(projectRoot, sourceFile)),
      chunk_size: scenario.chunk_size,
    },
    warmup_results: warmup,
    requests: measured,
    summary: summarize(measured, wallClockMs),
    resource_summary: summarizeResources(resourceSamples),
    resource_samples: resourceSamples,
    cleanup_protocol: {
      import_batch_deleted_after_each_iteration: true,
      upload_session_deleted_after_each_iteration: true,
      app_state_restored_after_each_iteration: true,
    },
  };
}

async function main() {
  const backendRequired =
    !(scenarioFilter === "import_pipeline_oulad" && !includeAi);

  if (backendRequired) {
    const health = await requestJson({
      method: "GET",
      endpoint: "/api/health",
      validateResponse: (body) => body?.status === "ok",
    });
    if (!health.success) {
      throw new Error(
        `Backend is not available at ${baseUrl}: ${health.error || "health check failed"}`,
      );
    }
  }

  let selectedScenarios = [...scenarios];
  if (includeAi) selectedScenarios.push(...(await buildAiScenarios()));
  if (includeImport || scenarioFilter?.startsWith("import_")) {
    selectedScenarios.push(...importScenarios);
  }
  if (scenarioFilter) {
    selectedScenarios = selectedScenarios.filter(
      (scenario) => scenario.id === scenarioFilter,
    );
    if (selectedScenarios.length === 0) {
      throw new Error(`Unknown scenario: ${scenarioFilter}`);
    }
  }

  const startedAt = new Date();
  const results = [];
  for (const scenario of selectedScenarios) {
    if (scenario.category === "import_pipeline") {
      results.push(await executeImportScenario(scenario));
    } else {
      results.push(await executeScenario(scenario));
    }
  }
  const completedAt = new Date();

  const timestamp = startedAt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const suffix = crypto.randomBytes(3).toString("hex");
  const filename = `system_performance_${timestamp}_${suffix}.json`;
  const outputPath = path.join(outputDir, filename);

  const log = {
    schema_version: "1.0.0",
    run_id: filename.replace(/\.json$/, ""),
    created_at: completedAt.toISOString(),
    benchmark_started_at: startedAt.toISOString(),
    benchmark_completed_at: completedAt.toISOString(),
    benchmark_duration_ms: completedAt.getTime() - startedAt.getTime(),
    methodology: {
      execution_mode: "sequential",
      warmup_runs: warmupRuns,
      measured_runs: measuredRuns,
      percentile_method: "nearest-rank",
      client_timer: "Node.js performance.now()",
      timeout_ms: timeoutMs,
      resource_sampling: {
        scope: "whole operating system",
        interval_ms: resourceSampleIntervalMs,
        metrics: [
          "cpu_percent",
          "used_memory_bytes",
          "used_memory_percent",
        ],
      },
      task_availability_evidence_log_disabled:
        "Requests include x-performance-benchmark=true to prevent benchmark iterations from creating Task Availability evidence logs.",
      ai_included: includeAi,
      import_included: includeImport || results.some((result) => result.category === "import_pipeline"),
      import_protocol:
        includeImport || results.some((result) => result.category === "import_pipeline")
          ? "Import benchmark uses real API calls and deletes each benchmark import batch/upload session after the iteration, then restores app_state."
          : "Import mutates the database and is only included when --include-import or an import_* scenario is selected.",
    },
    environment: {
      base_url: baseUrl,
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      cpu_model: os.cpus()[0]?.model ?? null,
      logical_cpu_count: os.cpus().length,
      total_memory_bytes: os.totalmem(),
      node_version: process.version,
    },
    scenarios: results,
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");
  process.stdout.write(`\nPerformance log written to:\n${outputPath}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[systemPerformanceBenchmark]", error);
    process.exit(1);
  });
