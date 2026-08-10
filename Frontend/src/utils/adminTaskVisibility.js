import {
  getSanitizedDisabledReason,
  issueMessage,
} from "./availabilityMessages.js";

export const ADMIN_BASIC_TASKS = ["A-B01", "A-B02", "A-B03", "A-B04"];
export const ADMIN_SINGLE_STUDENT_TASKS = ["A-S01", "A-S02", "A-S03", "A-S04", "A-S05", "A-S06", "A-S07", "A-S08"];
export const ADMIN_COMPARISON_TASKS = ["A-C01", "A-C02", "A-C03", "A-C04", "A-C05", "A-C06"];
export const ADMIN_COHORT_TASKS = [
  "A-G01", "A-G02", "A-G03", "A-G04", "A-G05", "A-G06", "A-G07", "A-G08",
  "A-G09", "A-G10", "A-G11", "A-G12", "A-G13", "A-G14", "A-G15", "A-G16",
];

export const ADMIN_ALLOWED_TASK_IDS = new Set([
  ...ADMIN_BASIC_TASKS,
  ...ADMIN_SINGLE_STUDENT_TASKS,
  ...ADMIN_COMPARISON_TASKS,
  ...ADMIN_COHORT_TASKS,
]);

export const TARGET_EXPERIMENTAL_ADMIN_TASKS = ["A-S01", "A-S08", "A-G15", "A-G16"];

export function isTaskExecutable(task) {
  return task?.availability?.status === "executable";
}

export function getDisabledReason(task) {
  return getSanitizedDisabledReason(task, "Required data is missing for this task.");
}

export function hasDatasetMismatchEvidence(task) {
  const availability = task?.availability || {};
  const contract = task?.availability_contract || task?.availabilityContract || {};
  const datasetSpecific = contract.dataset_specific || contract.datasetSpecific;
  const datasetCompatibility = String(task?.datasetCompatibility || "").toLowerCase();
  const requiredDataset = availability.required_dataset || availability.requiredDataset || datasetSpecific?.source_dataset;

  if (requiredDataset) return true;
  if (datasetCompatibility.includes("_only") || datasetCompatibility.includes("only")) return true;

  const messages = [
    availability.disabled_reason,
    availability.confidence_reason,
    ...(availability.missing_requirements || []).map(issueMessage),
    ...(availability.warnings || []).map(issueMessage),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    messages.includes("dataset") ||
    messages.includes("source_dataset") ||
    messages.includes("oulad") ||
    messages.includes("uci") ||
    messages.includes("_only")
  );
}

export function getAvailabilityLabel(task) {
  const status = task?.availability?.status || "unknown";
  if (status === "executable") return "Available";
  if (status === "partial") return "Partial";
  if (status === "insufficient_data") return "Insufficient data";
  if (status === "unsupported") {
    return hasDatasetMismatchEvidence(task) ? "Unavailable for this dataset" : "Unavailable";
  }
  return status;
}

export function getAvailabilityBadgeClass(task) {
  const status = task?.availability?.status;
  if (status === "executable") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (status === "partial") return "bg-amber-50 text-amber-700 border-amber-100";
  if (status === "insufficient_data") return "bg-orange-50 text-orange-700 border-orange-100";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

export function isExperimentalTask(task) {
  return task?.registry_status === "experimental";
}

export function filterUniqueAdminTasks(tasks = []) {
  return tasks
    .filter((task) => ADMIN_ALLOWED_TASK_IDS.has(task.taskId))
    .filter((task, idx, arr) => arr.findIndex((item) => item.taskId === task.taskId) === idx);
}
