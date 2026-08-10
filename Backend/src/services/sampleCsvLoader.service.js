import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { fileURLToPath } from "url";
import { detectCsvDelimiter } from "./fileFormat.service.js";
import { parseCsvFileToRawRows } from "./csvParse.service.js";
import { buildOuladSampleFromStreams } from "./sampleAdapters/ouladSample.adapter.js";
import { buildUciSampleFromRows } from "./sampleAdapters/uciSample.adapter.js";
import { computeStudentFeatures } from "./compositeFeatures.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, "..", "..");

export const SAMPLE_BATCH_WHITELIST = [
  "SAMPLE_OULAD",
  "SAMPLE_UCI_MAT",
  "SAMPLE_UCI_POR",
];

export const SAMPLE_FILE_LAYOUT = {
  SAMPLE_OULAD: {
    baseDir: path.join(BACKEND_ROOT, "uploads", "OULAD"),
    files: [
      "assessments.csv",
      "courses.csv",
      "studentAssessment.csv",
      "studentInfo.csv",
      "studentRegistration.csv",
      "studentVle.csv",
      "vle.csv",
    ],
  },
  SAMPLE_UCI_MAT: {
    baseDir: path.join(BACKEND_ROOT, "uploads", "UCI"),
    files: ["student-mat.csv"],
  },
  SAMPLE_UCI_POR: {
    baseDir: path.join(BACKEND_ROOT, "uploads", "UCI"),
    files: ["student-por.csv"],
  },
};

function countCanonicalRows(dataset) {
  if (!dataset) return 0;
  return (
    (dataset.students?.length || 0) +
    (dataset.courses?.length || 0) +
    (dataset.classes?.length || 0) +
    (dataset.enrollments?.length || 0) +
    (dataset.assessments?.length || 0) +
    (dataset.assessment_results?.length || 0) +
    (dataset.events?.length || 0) +
    (dataset.engagements?.length || 0)
  );
}

function canonicalEntityCounts(dataset) {
  return {
    student: dataset?.students?.length || 0,
    course: dataset?.courses?.length || 0,
    class: dataset?.classes?.length || 0,
    enrollment: dataset?.enrollments?.length || 0,
    assessment: dataset?.assessments?.length || 0,
    assessment_result: dataset?.assessment_results?.length || 0,
    event: dataset?.events?.length || 0,
    engagement: dataset?.engagements?.length || 0,
  };
}

function resolveBatchFiles(batchId) {
  const def = SAMPLE_FILE_LAYOUT[batchId];
  if (!def) {
    throw new Error(`Unsupported sample batch id: ${batchId}`);
  }

  const files = def.files.map((name) => {
    const absPath = path.join(def.baseDir, name);
    return { name, absPath };
  });

  return { baseDir: def.baseDir, files };
}

function getMissingFiles(resolvedFiles) {
  return resolvedFiles.filter((file) => !fs.existsSync(file.absPath));
}

async function streamCsvRows(filePath, delimiter, onRow) {
  return new Promise((resolve, reject) => {
    let rowCount = 0;
    const stream = fs.createReadStream(filePath).pipe(csv({ separator: delimiter }));

    stream.on("data", (row) => {
      rowCount += 1;
      const maybePromise = onRow(row);
      if (maybePromise && typeof maybePromise.then === "function") {
        stream.pause();
        maybePromise
          .then(() => stream.resume())
          .catch((error) => reject(error));
      }
    });
    stream.on("end", () => resolve(rowCount));
    stream.on("error", reject);
  });
}

export async function inspectSampleBatchFiles(batchId) {
  const { baseDir, files } = resolveBatchFiles(batchId);
  const missingFiles = getMissingFiles(files);

  const fileChecks = [];
  for (const file of files) {
    const exists = fs.existsSync(file.absPath);
    fileChecks.push({
      fileName: file.name,
      path: file.absPath,
      exists,
    });
  }

  return {
    batchId,
    baseDir,
    fileChecks,
    missingFiles: missingFiles.map((item) => item.name),
    ok: missingFiles.length === 0,
  };
}

async function createOuladIterator(filesWithDelimiters, rawRowCountsRef) {
  const map = new Map(filesWithDelimiters.map((f) => [f.name, f]));
  return async function iterateFileRows(fileName, onRow, explicitCounts) {
    const target = map.get(fileName);
    if (!target) {
      throw new Error(`OULAD adapter requested unknown file: ${fileName}`);
    }
    const rowCount = await streamCsvRows(target.absPath, target.delimiter, onRow);
    if (explicitCounts) explicitCounts[fileName] = rowCount;
    rawRowCountsRef[fileName] = rowCount;
  };
}

async function detectDelimitersForBatch(files) {
  const out = [];
  for (const file of files) {
    const detected = await detectCsvDelimiter(file.absPath);
    out.push({
      ...file,
      delimiter: detected.delimiter || ",",
      delimiterConfidence: detected.confidence ?? 0,
    });
  }
  return out;
}

export async function loadSampleBatchFromCsv(batchId, options = {}) {
  const {
    mode = "dry-run",
    onOuladEngagementChunk = null,
    scanOuladEngagementRows = true,
    ouladEngagementChunkSize = 10000,
  } = options;
  const inspection = await inspectSampleBatchFiles(batchId);
  if (!inspection.ok) {
    return {
      batchId,
      ok: false,
      fileChecks: inspection.fileChecks,
      missingFiles: inspection.missingFiles,
      rawRowCounts: {},
      dataset: null,
      canonicalCounts: null,
      canonicalRowCount: 0,
      warnings: [],
      errors: [`Missing files for ${batchId}: ${inspection.missingFiles.join(", ")}`],
      delimiterInfo: [],
    };
  }

  const filesWithDelimiters = await detectDelimitersForBatch(
    inspection.fileChecks.map((item) => ({
      name: item.fileName,
      absPath: item.path,
    }))
  );
  const rawRowCounts = {};
  const warnings = [];
  const errors = [];
  let streamedEngagementCount = 0;

  let dataset = null;
  if (batchId === "SAMPLE_OULAD") {
    const iterateFileRows = await createOuladIterator(filesWithDelimiters, rawRowCounts);
    const built = await buildOuladSampleFromStreams({
      batchId,
      sourceDataset: "OULAD",
      iterateFileRows,
      mode,
      engagementChunkSize: ouladEngagementChunkSize,
      onEngagementChunk: onOuladEngagementChunk,
      scanEngagementRows: scanOuladEngagementRows,
    });
    dataset = built.dataset;
    streamedEngagementCount = built.engagementCount || 0;
    warnings.push(...(built.warnings || []));
    errors.push(...(built.errors || []));
    Object.assign(rawRowCounts, built.rawRowCounts || {});
  } else if (batchId === "SAMPLE_UCI_MAT" || batchId === "SAMPLE_UCI_POR") {
    const fileDef = filesWithDelimiters[0];
    const rows = await parseCsvFileToRawRows(fileDef.absPath, {
      separator: fileDef.delimiter,
    });
    rawRowCounts[fileDef.name] = rows.length;
    const built = await buildUciSampleFromRows({
      batchId,
      batchName: batchId,
      rows,
      sourceFileName: fileDef.name,
    });
    dataset = built.dataset;
    warnings.push(...(built.warnings || []));
    errors.push(...(built.errors || []));
  } else {
    errors.push(`Unsupported batch id: ${batchId}`);
  }

  if (dataset?.students) {
    dataset.students = computeStudentFeatures(
      dataset.students,
      dataset.enrollments
    );
  }

  const canonicalCounts = canonicalEntityCounts(dataset);
  if (batchId === "SAMPLE_OULAD") {
    canonicalCounts.engagement = streamedEngagementCount;
  }
  const canonicalRowCount =
    batchId === "SAMPLE_OULAD"
      ? countCanonicalRows(dataset) + streamedEngagementCount
      : countCanonicalRows(dataset);

  return {
    batchId,
    ok: errors.length === 0,
    fileChecks: inspection.fileChecks,
    missingFiles: [],
    rawRowCounts,
    dataset,
    canonicalCounts,
    canonicalRowCount,
    warnings,
    errors,
    delimiterInfo: filesWithDelimiters.map((item) => ({
      fileName: item.name,
      delimiter: item.delimiter,
      confidence: item.delimiterConfidence,
    })),
  };
}

export async function loadAllSampleBatchesFromCsv(batchIds = SAMPLE_BATCH_WHITELIST, options = {}) {
  const results = [];
  for (const batchId of batchIds) {
    // Sequential load keeps memory bounded when OULAD studentVle is large.
    // Running in parallel would increase peak RAM significantly.
    // eslint-disable-next-line no-await-in-loop
    const loaded = await loadSampleBatchFromCsv(batchId, options);
    results.push(loaded);
  }
  return results;
}
