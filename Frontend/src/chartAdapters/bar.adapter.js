import {
  createAdapterDiagnostics,
  finalizeDiagnostics,
  registerMissingField,
  toCategoryValue,
  toFiniteNumber,
} from "./adapterPolicy.js";

export function adapt(rawData, config = {}) {
  const diag = createAdapterDiagnostics({
    chartType: config.variant === "histogram" ? "histogram" : "bar_chart",
    selectedDatasetLabel: config.__selected_dataset_label || null,
  });

  if (!Array.isArray(rawData) || rawData.length === 0) {
    return {
      data: [],
      xKey: config.x_field,
      bars: [],
      stacked: false,
      meta: finalizeDiagnostics(diag),
    };
  }

  diag.input_rows = rawData.length;

  const { x_field, y_field, series_field, variant } = config;
  const commonMeta = buildCommonMeta(config);
  if (variant === "ranked") {
    return adaptRanked(rawData, { x_field, y_field, y_label: config.y_label, diag, commonMeta });
  }
  if ((variant === "grouped" || variant === "stacked") && series_field) {
    return adaptGrouped(rawData, {
      x_field,
      y_field,
      series_field,
      stacked: variant === "stacked",
      diag,
      commonMeta,
    });
  }

  return adaptDefault(rawData, { x_field, y_field, y_label: config.y_label, diag, commonMeta });
}

function adaptDefault(rawData, { x_field, y_field, y_label, diag, commonMeta }) {
  const data = [];
  for (const row of rawData) {
    const rawCategory = row?.[x_field];
    const fallbackCategory = getDescriptiveCategoryFallback(x_field, rawCategory, row);
    const x = toCategoryValue(fallbackCategory ?? rawCategory);
    const rawY = toFiniteNumber(row?.[y_field]);
    if (x === null) {
      registerMissingField(diag, x_field);
      diag.warnings.push(`Skipped row: missing x field "${x_field}".`);
      continue;
    }
    if (rawY === null && row?.[y_field] !== 0) {
      registerMissingField(diag, y_field);
      diag.warnings.push(`Skipped row: missing/invalid y field "${y_field}".`);
      continue;
    }
    const y = normalizeBarMetricValue(rawY, y_field, commonMeta.valueKind);
    data.push({
      ...row,
      x,
      y,
      __categoryRaw: rawCategory,
      __categoryLabel: fallbackCategory ?? formatCategoryValue(x_field, rawCategory, row),
    });
  }

  diag.valid_rows = data.length;
  return {
    data,
    xKey: "x",
    bars: [{ dataKey: "y", name: y_label || y_field }],
    stacked: false,
    ...commonMeta,
    meta: finalizeDiagnostics(diag),
  };
}

function adaptRanked(rawData, { x_field, y_field, y_label, diag, commonMeta }) {
  const base = adaptDefault(rawData, { x_field, y_field, y_label, diag, commonMeta });
  base.data = [...base.data].sort((a, b) => b.y - a.y);
  return base;
}

function adaptGrouped(rawData, { x_field, y_field, series_field, stacked, diag, commonMeta }) {
  const grouped = {};
  const seriesValues = new Set();

  for (const row of rawData) {
    const rawCategory = row?.[x_field];
    const fallbackCategory = getDescriptiveCategoryFallback(x_field, rawCategory, row);
    const x = toCategoryValue(fallbackCategory ?? rawCategory);
    const series = toCategoryValue(row?.[series_field]);
    const rawY = toFiniteNumber(row?.[y_field]);

    if (x === null) {
      registerMissingField(diag, x_field);
      diag.warnings.push(`Skipped row: missing x field "${x_field}".`);
      continue;
    }
    if (series === null) {
      registerMissingField(diag, series_field);
      diag.warnings.push(`Skipped row: missing series field "${series_field}".`);
      continue;
    }
    if (rawY === null && row?.[y_field] !== 0) {
      registerMissingField(diag, y_field);
      diag.warnings.push(`Skipped row: missing/invalid y field "${y_field}".`);
      continue;
    }
    const y = normalizeBarMetricValue(rawY, y_field, commonMeta.valueKind);

    if (!grouped[x]) {
      grouped[x] = {
        x,
        [x_field]: rawCategory,
        __categoryRaw: rawCategory,
        __categoryLabel: fallbackCategory ?? formatCategoryValue(x_field, rawCategory, row),
      };
    }
    grouped[x][series] = y;
    seriesValues.add(series);
  }

  const data = Object.values(grouped);
  diag.valid_rows = data.length;
  return {
    data,
    xKey: "x",
    bars: [...seriesValues].map((s) => ({ dataKey: s, name: formatSeriesName(s) })),
    stacked,
    ...commonMeta,
    meta: finalizeDiagnostics(diag),
  };
}

function buildCommonMeta(config) {
  return {
    categoryField: config.x_field || null,
    valueField: config.y_field || null,
    categoryLabel: config.x_label || config.x_field || null,
    valueLabel: config.y_label || config.y_field || null,
    valueKind: inferValueKind(config.y_field, config.y_label),
  };
}

function formatCategoryValue(field, value, row) {
  if (value === null || value === undefined) return "";

  const fallbackLabel = getDescriptiveCategoryFallback(field, value, row);
  if (fallbackLabel) return fallbackLabel;

  if (field === "assessment_order") {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) {
      return `Assessment ${numberValue + 1}`;
    }
    return String(value);
  }

  if (field === "week_number") {
    return `Week ${value}`;
  }

  if (field === "student_id") {
    return formatStudentLabel(value);
  }

  return String(value);
}

function getDescriptiveCategoryFallback(field, value, row) {
  if (!row || typeof row !== "object") return null;
  const fieldName = String(field || "");
  const textValue = String(value ?? "").trim();
  const categoryIsNumeric = textValue !== "" && Number.isFinite(Number(textValue));
  const fieldLooksMetric = /(score|rate|pct|percent|count|total|avg|average|value)/i.test(fieldName);
  const needsFallback =
    fieldLooksMetric ||
    (fieldName === "competency_tag" && categoryIsNumeric) ||
    (fieldName === "resource_type" && categoryIsNumeric);
  if (!needsFallback) return null;

  const candidateFields = [
    "metric_name",
    "competency_tag",
    "assessment_name",
    "assessment_type",
    "resource_type",
    "final_outcome",
    "student_id",
    "class_id",
  ];

  for (const candidateField of candidateFields) {
    if (candidateField === fieldName) continue;
    const candidate = row[candidateField];
    if (candidate === null || candidate === undefined) continue;
    const label = String(candidate).trim();
    if (!label || Number.isFinite(Number(label))) continue;
    return label;
  }

  if (fieldName === "resource_type" && categoryIsNumeric) {
    return `Resource ${textValue}`;
  }

  return null;
}

function inferValueKind(field, label) {
  const text = `${field || ""} ${label || ""}`.toLowerCase();
  if (/0\s*[–-]\s*1/.test(text)) return "normalized_score";
  if (/(^|_)pct($|_)|percent|%/.test(text)) return "percent";
  if (/(^|_)rate($|_)| rate\b/.test(text)) return "rate";
  if (/count|total|number of/.test(text)) return "count";
  if (/score/.test(text)) return "score";
  if (/day|delay/.test(text)) return "days";
  return "number";
}

function normalizeBarMetricValue(value, field, valueKind) {
  if (!Number.isFinite(value)) return value;
  const fieldText = String(field || "").toLowerCase();
  const isFractionPercentField = valueKind === "percent" && /(^|_)(pct|percent|proportion|share|ratio)(_|$)/.test(fieldText);
  if (isFractionPercentField && Math.abs(value) <= 1) return value * 100;
  return value;
}

function formatSeriesName(value) {
  const labels = {
    active_days_norm: "Active Days",
    total_clicks_norm: "Total Clicks",
    engagement_score: "Engagement Score",
  };
  const key = String(value ?? "").trim();
  const studentLabel = formatStudentLabel(key);
  if (studentLabel !== key) return studentLabel;
  return labels[key] ?? formatUnderscoreLabel(key);
}

function formatStudentLabel(value) {
  const raw = String(value ?? "").trim();
  if (/^\d+$/.test(raw)) return `Student ${raw}`;

  const sampleStudent = raw.match(/^SAMPLE_[A-Z]+_STU_([0-9]+)$/i);
  if (sampleStudent) return `Student ${sampleStudent[1]}`;

  const genericStudent = raw.match(/(?:^|[_\s-])STU[_\s-]*([0-9]+)$/i);
  if (genericStudent) return `Student ${genericStudent[1]}`;

  return raw;
}

function formatUnderscoreLabel(value) {
  const text = String(value || "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
