import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const baseUrl = readArg("base-url", "http://localhost:4000").replace(/\/$/, "");
const outputDir = path.resolve(
  readArg(
    "output-dir",
    path.join(repoRoot, "reproducibility", "generated", "task_availability"),
  ),
);

const datasets = [
  {
    dataset: "UCI Portuguese",
    datasetId: "SAMPLE_UCI_POR",
    classId: "SAMPLE_UCI_POR_CLASS",
  },
  {
    dataset: "OULAD",
    datasetId: "SAMPLE_OULAD",
    classId: "SAMPLE_OULAD_CLASS_CCC_2014J",
  },
];

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

function count(rows, predicate) {
  return rows.filter(predicate).length;
}

async function collectDataset(config) {
  const query = new URLSearchParams({
    datasetId: config.datasetId,
    classId: config.classId,
  });
  const response = await fetch(`${baseUrl}/api/tasks/available?${query}`, {
    headers: {
      Accept: "application/json",
      "x-performance-benchmark": "true",
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true || !Array.isArray(body.tasks)) {
    throw new Error(
      `Task availability failed for ${config.dataset}: ` +
        `${response.status} ${body?.error ?? "invalid response"}`,
    );
  }

  const rows = body.tasks.map((task) => {
    const availability = task.availability ?? {};
    const layers = availability.layer_results ?? {};
    return {
      dataset: config.dataset,
      task_id: task.taskId,
      status: availability.status ?? "unsupported",
      executable: availability.executable === true,
      structural: layers.structural ?? "",
      semantic: layers.semantic ?? "",
      analytical: layers.analytical ?? "",
      data_sufficiency: layers.data_sufficiency ?? "",
      confidence: availability.confidence ?? "",
    };
  });
  if (rows.length !== 52) {
    throw new Error(
      `Expected 52 public tasks for ${config.dataset}, received ${rows.length}.`,
    );
  }
  return rows;
}

function summarize(dataset, rows) {
  const executable = count(rows, (row) => row.status === "executable");
  return {
    dataset,
    total_tasks: rows.length,
    executable,
    partial: count(rows, (row) => row.status === "partial"),
    insufficient_data: count(rows, (row) => row.status === "insufficient_data"),
    unsupported: count(rows, (row) => row.status === "unsupported"),
    structural_fail: count(rows, (row) => row.structural === "fail"),
    semantic_fail: count(rows, (row) => row.semantic === "fail"),
    analytical_warn: count(rows, (row) => row.analytical === "warn"),
    data_sufficiency_fail: count(rows, (row) => row.data_sufficiency === "fail"),
    high_confidence: count(rows, (row) => row.confidence === "HIGH"),
    low_confidence: count(rows, (row) => row.confidence === "LOW"),
    executable_coverage_percent: ((executable / rows.length) * 100).toFixed(2),
  };
}

async function main() {
  const allRows = [];
  const summaries = [];
  for (const dataset of datasets) {
    const rows = await collectDataset(dataset);
    allRows.push(...rows);
    summaries.push(summarize(dataset.dataset, rows));
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const recordHeaders = [
    "dataset",
    "task_id",
    "status",
    "executable",
    "structural",
    "semantic",
    "analytical",
    "data_sufficiency",
    "confidence",
  ];
  const summaryHeaders = [
    "dataset",
    "total_tasks",
    "executable",
    "partial",
    "insufficient_data",
    "unsupported",
    "structural_fail",
    "semantic_fail",
    "analytical_warn",
    "data_sufficiency_fail",
    "high_confidence",
    "low_confidence",
    "executable_coverage_percent",
  ];
  writeCsv(path.join(outputDir, "task_availability_snapshot_fresh.csv"), recordHeaders, allRows);
  writeCsv(path.join(outputDir, "task_availability_fresh.csv"), summaryHeaders, summaries);
  fs.writeFileSync(
    path.join(outputDir, "task_availability_fresh.json"),
    `${JSON.stringify({ generated_at: new Date().toISOString(), base_url: baseUrl, summaries }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Fresh task-availability evaluation written to ${outputDir}`);
  console.table(summaries);
}

main().catch((error) => {
  console.error("[collect-task-availability]", error);
  process.exitCode = 1;
});
