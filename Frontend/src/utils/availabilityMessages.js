const DATASET_NAMES = /\b(?:OULAD|UCI)\b/gi;

export function issueMessage(issue) {
  if (!issue) return null;
  if (typeof issue === "string") return issue;
  if (typeof issue === "object") return issue.message || issue.code || JSON.stringify(issue);
  return String(issue);
}

export function sanitizeAvailabilityReason(message) {
  const text = String(message || "").trim();
  if (!text) return "";

  const datasetAgnostic = text
    .replace(/\b(?:OULAD|UCI)[-\s]+specific\s+/gi, "")
    .replace(/\bTask depends on\s+/i, "Missing ")
    .replace(/\bUses\s+/i, "Missing ")
    .replace(/\bdepends on\s+/i, "requires ")
    .replace(/\bcanonical data does not provide\s+/i, "missing ")
    .replace(/\bspecific\s+/gi, "")
    .replace(/\bsource_dataset\b/gi, "dataset source")
    .replace(/\bdataset\b/gi, "data")
    .replace(DATASET_NAMES, "")
    .replace(/\s*-\s*only\b/gi, "")
    .replace(/\bonly\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+-\s*/g, " ")
    .trim();

  return datasetAgnostic || "Required data is missing for this task.";
}

export function getSanitizedDisabledReason(task, fallback = "Required data is missing for this task.") {
  const availability = task?.availability;
  const firstMissing = availability?.missing_requirements?.[0];
  const rawReason =
    availability?.disabled_reason ||
    issueMessage(firstMissing) ||
    availability?.confidence_reason ||
    fallback;

  return sanitizeAvailabilityReason(rawReason);
}
