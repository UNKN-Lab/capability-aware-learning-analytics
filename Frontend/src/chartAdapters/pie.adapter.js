import {
  createAdapterDiagnostics,
  finalizeDiagnostics,
  registerMissingField,
  toCategoryValue,
  toFiniteNumber,
} from "./adapterPolicy.js";

const MAX_SLICES = 6;
const MIN_RATIO_FOR_DIRECT_SLICE = 0.03;

export function adapt(rawData, config = {}) {
  const diag = createAdapterDiagnostics({
    chartType: "pie_chart",
    selectedDatasetLabel: config.__selected_dataset_label || null,
  });

  if (!Array.isArray(rawData) || rawData.length === 0) {
    return { data: [], meta: finalizeDiagnostics(diag) };
  }

  diag.input_rows = rawData.length;
  const { x_field, y_field } = config;
  const normalized = [];

  for (const row of rawData) {
    const name = toCategoryValue(row?.[x_field]) ?? "Unknown";
    const value = toFiniteNumber(row?.[y_field]);
    if (value === null && row?.[y_field] !== 0) {
      registerMissingField(diag, y_field);
      diag.warnings.push(`Skipped slice: invalid numeric value "${y_field}".`);
      continue;
    }
    if (name === "Unknown" && (row?.[x_field] === null || row?.[x_field] === undefined || row?.[x_field] === "")) {
      registerMissingField(diag, x_field);
      diag.warnings.push(`Missing category in "${x_field}" mapped to "Unknown".`);
    }
    normalized.push({ name, value });
  }

  if (normalized.length === 0) {
    diag.valid_rows = 0;
    diag.warnings.push("All pie rows were invalid after null/NaN filtering.");
    return { data: [], meta: finalizeDiagnostics(diag) };
  }

  diag.valid_rows = normalized.length;
  const total = normalized.reduce((sum, r) => sum + r.value, 0);
  const sorted = [...normalized].sort((a, b) => b.value - a.value);

  let direct = sorted;
  let other = [];

  if (sorted.length > MAX_SLICES) {
    direct = sorted.slice(0, MAX_SLICES - 1);
    other = sorted.slice(MAX_SLICES - 1);
  }

  if (total > 0) {
    const smallSlices = direct.filter((s) => s.value / total < MIN_RATIO_FOR_DIRECT_SLICE);
    if (smallSlices.length > 1) {
      const smallSet = new Set(smallSlices.map((s) => `${s.name}@@${s.value}`));
      other.push(...smallSlices);
      direct = direct.filter((s) => !smallSet.has(`${s.name}@@${s.value}`));
    }
  }

  if (other.length > 0) {
    const otherValue = other.reduce((sum, r) => sum + r.value, 0);
    direct.push({ name: "Other", value: otherValue });
    diag.warnings.push(
      `Merged ${other.length} small/excess categories into "Other" for readability.`
    );
  }

  return { data: direct, meta: finalizeDiagnostics(diag) };
}
