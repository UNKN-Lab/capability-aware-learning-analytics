import {
  createAdapterDiagnostics,
  finalizeDiagnostics,
  registerMissingField,
  toCategoryValue,
  toFiniteNumber,
} from "./adapterPolicy.js";

export function adapt(rawData, config = {}) {
  const diag = createAdapterDiagnostics({
    chartType: "heatmap",
    selectedDatasetLabel: config.__selected_dataset_label || null,
  });

  if (!Array.isArray(rawData) || rawData.length === 0) {
    return { rows: [], cols: [], cells: [], min: null, max: null, meta: finalizeDiagnostics(diag) };
  }

  diag.input_rows = rawData.length;
  const { x_field, y_field } = config;
  const valueField = y_field;
  const colField = x_field;
  const rowField = config.series_field || null;
  const defaultRowLabel = config.y_label || valueField || "Value";

  const rowsSet = new Set();
  const colsSet = new Set();
  const lookup = {};
  const numericValues = [];

  for (const row of rawData) {
    const r = rowField ? toCategoryValue(row?.[rowField]) : defaultRowLabel;
    const c = toCategoryValue(row?.[colField]);
    if (r === null) {
      registerMissingField(diag, rowField);
      diag.warnings.push(`Skipped row: missing row dimension "${rowField}".`);
      continue;
    }
    if (c === null) {
      registerMissingField(diag, colField);
      diag.warnings.push(`Skipped row: missing column dimension "${colField}".`);
      continue;
    }

    rowsSet.add(r);
    colsSet.add(c);
    const n = toFiniteNumber(row?.[valueField]);
    if (n === null && row?.[valueField] !== 0) {
      registerMissingField(diag, valueField);
      lookup[`${r}|${c}`] = null;
      continue;
    }
    lookup[`${r}|${c}`] = n;
    numericValues.push(n);
  }

  const rows = [...rowsSet];
  const cols = buildContinuousColumns([...colsSet], colField);
  const cells = [];
  for (const r of rows) {
    for (const c of cols) {
      const key = `${r}|${c}`;
      cells.push({
        row: r,
        col: c,
        value: Object.prototype.hasOwnProperty.call(lookup, key) ? lookup[key] : null,
      });
    }
  }

  diag.valid_rows = rows.length > 0 && cols.length > 0 ? rows.length * cols.length : 0;
  if (diag.missing_field_counts?.[valueField] > 0) {
    diag.warnings.push(
      `Heatmap kept ${diag.missing_field_counts[valueField]} cells as missing (null), not zero-filled.`
    );
  }

  const min = numericValues.length > 0 ? Math.min(...numericValues) : null;
  const max = numericValues.length > 0 ? Math.max(...numericValues) : null;
  return {
    rows,
    cols,
    cells,
    min,
    max,
    meta: finalizeDiagnostics(diag),
  };
}

function sortCategoryLike(a, b) {
  const na = Number(a);
  const nb = Number(b);
  const bothNumeric = Number.isFinite(na) && Number.isFinite(nb);
  if (bothNumeric) return na - nb;
  return String(a).localeCompare(String(b));
}

function buildContinuousColumns(cols, field) {
  const sorted = cols.sort(sortCategoryLike);
  if (field !== "week_number" || sorted.length === 0) return sorted;

  const numeric = sorted.map((col) => Number(col)).filter(Number.isFinite);
  if (numeric.length !== sorted.length) return sorted;

  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const continuous = [];
  for (let week = min; week <= max; week += 1) {
    continuous.push(String(week));
  }
  return continuous;
}
