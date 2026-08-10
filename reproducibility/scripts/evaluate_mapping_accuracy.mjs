import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { suggestMappingsFromProfiling } from "../../Backend/src/services/mappingSuggest.service.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const groundTruthPath = path.join(
  repoRoot,
  "reproducibility",
  "inputs",
  "mapping_ground_truth.csv",
);
const outputDir = path.resolve(
  process.argv.find((value) => value.startsWith("--output-dir="))?.split("=")[1]
    ?? path.join(repoRoot, "reproducibility", "generated", "mapping"),
);

const sourceFiles = [
  {
    dataset: "UCI Portuguese",
    sourceDataset: "UCI",
    file: "student-por.csv",
    filePath: path.join(repoRoot, "Backend", "uploads", "UCI", "student-por.csv"),
    delimiter: ";",
  },
  ...[
    "assessments.csv",
    "courses.csv",
    "studentAssessment.csv",
    "studentInfo.csv",
    "studentRegistration.csv",
    "studentVle.csv",
    "vle.csv",
  ].map((file) => ({
    dataset: "OULAD",
    sourceDataset: "OULAD",
    file,
    filePath: path.join(repoRoot, "Backend", "uploads", "OULAD", file),
    delimiter: ",",
  })),
];

function parseDelimitedLine(line, delimiter = ",") {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}

function readCsvRecords(filePath) {
  const lines = fs
    .readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = parseDelimitedLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseDelimitedLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function readSampleRows(filePath, delimiter, maxRows = 200) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing dataset file: ${filePath}`);
  }
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(1024 * 1024);
  const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
  fs.closeSync(descriptor);

  const lines = buffer
    .subarray(0, bytesRead)
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, maxRows + 1);
  if (lines.length < 2) {
    throw new Error(`Dataset file has no sample rows: ${filePath}`);
  }
  const headers = parseDelimitedLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => parseDelimitedLine(line, delimiter));
  return { headers, rows };
}

function detectType(values) {
  const nonEmpty = values.filter((value) => value !== "" && value != null);
  if (nonEmpty.length === 0) return "string";
  if (nonEmpty.every((value) => /^-?\d+(\.\d+)?$/.test(String(value)))) return "numeric";
  const normalized = nonEmpty.map((value) => String(value).trim().toLowerCase());
  if (
    normalized.every((value) =>
      ["0", "1", "y", "n", "yes", "no", "true", "false"].includes(value),
    )
  ) {
    return "boolean";
  }
  return "string";
}

function buildProfilingResult(filePath, delimiter) {
  const { headers, rows } = readSampleRows(filePath, delimiter);
  const columns = headers.map((header, index) => {
    const values = rows.map((row) => row[index] ?? "");
    const nonEmpty = values.filter((value) => value !== "");
    return {
      raw_column: header,
      detected_type: detectType(values),
      sample_values: [...new Set(nonEmpty)].slice(0, 8),
      distinct_count: new Set(nonEmpty).size,
      null_ratio: values.length === 0 ? 0 : (values.length - nonEmpty.length) / values.length,
    };
  });
  return { columns, sampled_rows: rows.length };
}

function splitAccepted(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function classify(expected, actual) {
  const expectedTarget = expected.expected_target || null;
  const actualTarget = actual?.canonical_field ?? null;

  if (expectedTarget === null) {
    return actualTarget === null ? "correctly_excluded" : "wrong";
  }
  if (actualTarget === null) return "unknown";
  if (actualTarget !== expectedTarget) {
    return splitAccepted(expected.accepted_near_targets).includes(actualTarget)
      ? "near_correct"
      : "wrong";
  }

  const transformMatches = splitAccepted(expected.expected_transform).includes(actual.transform);
  const scopeMatches = splitAccepted(expected.expected_scope).includes(actual.entity_scope);
  return transformMatches && scopeMatches ? "exact" : "near_correct";
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function formatPercent(numerator, denominator) {
  return ((numerator / denominator) * 100).toFixed(2);
}

function summarize(rows) {
  return ["UCI Portuguese", "OULAD", "Combined"].map((dataset) => {
    const selected = dataset === "Combined" ? rows : rows.filter((row) => row.dataset === dataset);
    const count = (category) => selected.filter((row) => row.category === category).length;
    const mappable = selected.filter((row) => row.expected_target).length;
    const exact = count("exact");
    const nearCorrect = count("near_correct");
    return {
      dataset,
      total_fields: selected.length,
      mappable_fields: mappable,
      exact,
      near_correct: nearCorrect,
      wrong: count("wrong"),
      unknown: count("unknown"),
      correctly_excluded: count("correctly_excluded"),
      exact_accuracy_percent: formatPercent(exact, mappable),
      usable_rate_percent: formatPercent(exact + nearCorrect, mappable),
    };
  });
}

async function main() {
  const groundTruth = readCsvRecords(groundTruthPath);
  const expectedByKey = new Map(
    groundTruth.map((row) => [`${row.dataset}/${row.file}/${row.raw_field}`, row]),
  );
  const results = [];

  for (const source of sourceFiles) {
    const profilingResult = buildProfilingResult(source.filePath, source.delimiter);
    const suggestion = await suggestMappingsFromProfiling({
      profilingResult,
      datasetName: source.file,
      sourceDataset: source.sourceDataset,
    });
    const mappings = suggestion.field_mappings ?? suggestion.fieldMappings ?? [];
    const expectedRows = groundTruth.filter(
      (row) => row.dataset === source.dataset && row.file === source.file,
    );

    for (const expected of expectedRows) {
      const actual = mappings.find(
        (mapping) => mapping.source_fields?.[0] === expected.raw_field,
      );
      results.push({
        dataset: source.dataset,
        file: source.file,
        raw_field: expected.raw_field,
        expected_target: expected.expected_target,
        expected_transform: expected.expected_transform,
        expected_scope: expected.expected_scope,
        actual_target: actual?.canonical_field ?? "",
        actual_transform: actual?.transform ?? "",
        actual_scope: actual?.entity_scope ?? "",
        confidence: actual?.confidence ?? 0,
        category: classify(
          expectedByKey.get(`${source.dataset}/${source.file}/${expected.raw_field}`),
          actual,
        ),
      });
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const snapshotHeaders = [
    "dataset",
    "file",
    "raw_field",
    "expected_target",
    "expected_transform",
    "expected_scope",
    "actual_target",
    "actual_transform",
    "actual_scope",
    "confidence",
    "category",
  ];
  const summaryHeaders = [
    "dataset",
    "total_fields",
    "mappable_fields",
    "exact",
    "near_correct",
    "wrong",
    "unknown",
    "correctly_excluded",
    "exact_accuracy_percent",
    "usable_rate_percent",
  ];
  const summary = summarize(results);
  writeCsv(path.join(outputDir, "mapping_snapshot_fresh.csv"), snapshotHeaders, results);
  writeCsv(path.join(outputDir, "mapping_accuracy_fresh.csv"), summaryHeaders, summary);
  fs.writeFileSync(
    path.join(outputDir, "mapping_accuracy_fresh.json"),
    `${JSON.stringify({ generated_at: new Date().toISOString(), summary, field_results: results }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Fresh mapping evaluation written to ${outputDir}`);
  console.table(summary);
}

main().catch((error) => {
  console.error("[evaluate-mapping-accuracy]", error);
  process.exitCode = 1;
});
