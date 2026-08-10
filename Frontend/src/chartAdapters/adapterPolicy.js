export const NULL_HANDLING_POLICY = {
  numeric: "real_zero_kept_null_missing_not_coerced",
  category: "missing_category_not_silent_fallback",
  row: "invalid_rows_skipped_with_warnings",
};

export function isMissingValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

export function toFiniteNumber(value) {
  if (isMissingValue(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toCategoryValue(value) {
  if (isMissingValue(value)) return null;
  return String(value);
}

export function createAdapterDiagnostics({
  chartType,
  selectedDatasetLabel = null,
  policy = NULL_HANDLING_POLICY,
}) {
  return {
    chart_type: chartType,
    selected_dataset_label: selectedDatasetLabel,
    null_handling_policy: policy,
    input_rows: 0,
    valid_rows: 0,
    skipped_rows: 0,
    missing_fields: [],
    missing_field_counts: {},
    warnings: [],
  };
}

export function registerMissingField(diag, field) {
  if (!field) return;
  if (!diag.missing_field_counts[field]) {
    diag.missing_field_counts[field] = 0;
  }
  diag.missing_field_counts[field] += 1;
}

export function finalizeDiagnostics(diag) {
  diag.missing_fields = Object.keys(diag.missing_field_counts).filter(
    (k) => diag.missing_field_counts[k] > 0
  );
  diag.skipped_rows = Math.max(0, diag.input_rows - diag.valid_rows);
  return diag;
}

