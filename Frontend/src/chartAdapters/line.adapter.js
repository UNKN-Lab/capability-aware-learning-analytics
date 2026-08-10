import {
  createAdapterDiagnostics,
  finalizeDiagnostics,
  registerMissingField,
  toCategoryValue,
  toFiniteNumber,
} from "./adapterPolicy.js";

export function adapt(rawData, config = {}) {
  const diag = createAdapterDiagnostics({
    chartType: "line_chart",
    selectedDatasetLabel: config.__selected_dataset_label || null,
  });

  if (!Array.isArray(rawData) || rawData.length === 0) {
    return {
      data: [],
      xKey: config.x_field,
      lines: [],
      referenceLines: [],
      meta: finalizeDiagnostics(diag),
    };
  }

  diag.input_rows = rawData.length;

  const { x_field, y_field, series_field, variant } = config;
  const thresholdFields = inferThresholdFields(rawData, config);
  const referenceLines = buildReferenceLines(rawData, thresholdFields);
  const yFields = Array.isArray(config.y_fields)
    ? config.y_fields.filter((field) => typeof field === "string" && field.trim())
    : [];

  if (yFields.length > 0) {
    return adaptMultiLineFields(rawData, {
      x_field,
      yFields,
      thresholdFields,
      referenceLines,
      seriesLabels: config.series_labels || {},
      fillMissingWeeks: isWeeklyTimeSeriesConfig(config),
      diag,
    });
  }

  if (variant === "multi_series" && series_field) {
    return adaptMultiSeries(rawData, {
      x_field,
      y_field,
      series_field,
      thresholdFields,
      referenceLines,
      diag,
    });
  }

  return adaptSingleSeries(rawData, {
    x_field,
    y_field,
    thresholdFields,
    referenceLines,
    y_label: config.y_label,
    diag,
  });
}

function adaptSingleSeries(
  rawData,
  { x_field, y_field, thresholdFields, referenceLines, y_label, diag }
) {
  const data = [];

  for (const row of rawData) {
    const x = toCategoryValue(row?.[x_field]);
    if (x === null) {
      registerMissingField(diag, x_field);
      diag.warnings.push(`Skipped row: missing x field "${x_field}".`);
      continue;
    }

    const point = { x, y: null };
    const y = toFiniteNumber(row?.[y_field]);
    if (y === null && row?.[y_field] !== 0) {
      registerMissingField(diag, y_field);
    } else {
      point.y = y;
    }

    for (const thresholdField of thresholdFields) {
      const numeric = toFiniteNumber(row?.[thresholdField]);
      if (numeric != null) {
        point[thresholdField] = numeric;
      }
    }

    data.push(point);
  }

  diag.valid_rows = data.length;
  if (diag.missing_field_counts?.[y_field] > 0) {
    diag.warnings.push(
      `Line chart kept ${diag.missing_field_counts[y_field]} null y values as gaps (no fake zero).`
    );
  }

  return {
    data,
    xKey: "x",
    lines: [{ dataKey: "y", name: y_label || y_field }],
    referenceLines,
    meta: finalizeDiagnostics(diag),
  };
}

function adaptMultiLineFields(
  rawData,
  { x_field, yFields, thresholdFields, referenceLines, seriesLabels, fillMissingWeeks, diag }
) {
  const grouped = new Map();
  let acceptedRows = 0;
  let numericXAxis = true;

  for (const row of rawData) {
    const x = toLineXValue(row?.[x_field]);
    if (x === null) {
      registerMissingField(diag, x_field);
      diag.warnings.push(`Skipped row: missing x field "${x_field}".`);
      continue;
    }

    if (typeof x !== "number") numericXAxis = false;

    const point = grouped.get(x) || { x };
    for (const field of yFields) {
      const y = toFiniteNumber(row?.[field]);
      if (y === null && row?.[field] !== 0) {
        registerMissingField(diag, field);
        point[field] = null;
      } else {
        point[field] = y;
      }
    }

    for (const thresholdField of thresholdFields) {
      const numeric = toFiniteNumber(row?.[thresholdField]);
      if (numeric != null) {
        point[thresholdField] = numeric;
      }
    }

    copyLinePassthroughFields(point, row);

    grouped.set(x, point);
    acceptedRows += 1;
  }

  let data = [...grouped.values()].sort(compareLineX);

  if (fillMissingWeeks && numericXAxis && data.length > 0) {
    data = fillContinuousWeekBuckets(data, yFields);
    data = recalculateRollingFields(data, yFields);
    diag.warnings.push("Line chart filled missing week buckets so the x-axis remains a continuous timeline.");
  }

  diag.valid_rows = data.length;
  for (const field of yFields) {
    if (diag.missing_field_counts?.[field] > 0) {
      diag.warnings.push(
        `Line chart kept ${diag.missing_field_counts[field]} null "${field}" values as gaps.`
      );
    }
  }
  if (acceptedRows > data.length) {
    diag.warnings.push(
      `Multi-line chart collapsed ${acceptedRows} rows into ${data.length} x-buckets.`
    );
  }

  return {
    data,
    xKey: "x",
    lines: yFields.map((field) => ({
      dataKey: field,
      name: seriesLabels[field] || humanize(field),
    })),
    referenceLines,
    meta: finalizeDiagnostics(diag),
  };
}

function adaptMultiSeries(
  rawData,
  { x_field, y_field, series_field, thresholdFields, referenceLines, diag }
) {
  const grouped = {};
  const seriesValues = new Set();
  let acceptedRows = 0;

  for (const row of rawData) {
    const x = toLineXValue(row?.[x_field]);
    const series = toCategoryValue(row?.[series_field]);

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

    if (!grouped[x]) grouped[x] = { x };
    seriesValues.add(series);
    acceptedRows += 1;

    const y = toFiniteNumber(row?.[y_field]);
    if (y === null && row?.[y_field] !== 0) {
      registerMissingField(diag, y_field);
      grouped[x][series] = null;
    } else {
      grouped[x][series] = y;
    }

    for (const thresholdField of thresholdFields) {
      const numeric = toFiniteNumber(row?.[thresholdField]);
      if (numeric != null) {
        grouped[x][thresholdField] = numeric;
      }
    }
  }

  const data = Object.values(grouped).sort(compareLineX);
  // Count accepted source rows as valid_rows so diagnostics do not imply
  // false row loss when many rows are intentionally collapsed into x buckets.
  diag.valid_rows = acceptedRows;
  if (acceptedRows > data.length) {
    diag.warnings.push(
      `Multi-series line collapsed ${acceptedRows} rows into ${data.length} x-buckets.`
    );
  }
  if (diag.missing_field_counts?.[y_field] > 0) {
    diag.warnings.push(
      `Line chart kept ${diag.missing_field_counts[y_field]} null y values as gaps (multi-series).`
    );
  }

  return {
    data,
    xKey: "x",
    lines: [...seriesValues].map((s) => ({ dataKey: s, name: formatSeriesLabel(s) })),
    referenceLines,
    meta: finalizeDiagnostics(diag),
  };
}

function isWeeklyTimeSeriesConfig(config) {
  return config?.x_field === "week_number";
}

function toLineXValue(value) {
  const numeric = toFiniteNumber(value);
  if (numeric !== null) return numeric;
  return toCategoryValue(value);
}

function compareLineX(a, b) {
  if (typeof a.x === "number" && typeof b.x === "number") return a.x - b.x;
  return String(a.x).localeCompare(String(b.x), undefined, { numeric: true });
}

function fillContinuousWeekBuckets(data, yFields) {
  const byWeek = new Map(data.map((point) => [point.x, point]));
  const weeks = data.map((point) => point.x).filter(Number.isFinite);
  const minWeek = Math.min(...weeks);
  const maxWeek = Math.max(...weeks);
  const filled = [];

  for (let week = minWeek; week <= maxWeek; week += 1) {
    const existing = byWeek.get(week);
    if (existing) {
      filled.push(existing);
      continue;
    }

    const point = { x: week };
    for (const field of yFields) {
      point[field] = getMissingWeekValue(field);
    }
    filled.push(point);
  }

  return filled;
}

function getMissingWeekValue(field) {
  const key = String(field).toLowerCase();
  if (key.includes("click") || key.includes("engagement_count")) return 0;
  return null;
}

function recalculateRollingFields(data, yFields) {
  if (!yFields.includes("rolling_3wk_avg")) return data;

  return data.map((point, index) => {
    if (index < 3) return { ...point, rolling_3wk_avg: null };

    const previousThree = data
      .slice(index - 3, index)
      .map((row) => toFiniteNumber(row.weekly_clicks))
      .filter((value) => value !== null);

    if (previousThree.length < 3) return { ...point, rolling_3wk_avg: null };

    const average = previousThree.reduce((sum, value) => sum + value, 0) / previousThree.length;
    return { ...point, rolling_3wk_avg: Number(average.toFixed(2)) };
  });
}

function copyLinePassthroughFields(point, row) {
  const passthroughFields = [
    "is_drop_week",
    "drop_pct",
    "cohort_avg_clicks",
    "week_total_clicks",
  ];

  for (const field of passthroughFields) {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      point[field] = row[field];
    }
  }
}

function inferThresholdFields(rawData, config) {
  const keys = Object.keys(rawData[0] ?? {});
  const fields = new Set();

  if (typeof config.threshold_field === "string") fields.add(config.threshold_field);
  if (Array.isArray(config.threshold_fields)) {
    for (const f of config.threshold_fields) {
      if (typeof f === "string") fields.add(f);
    }
  }

  for (const key of keys) {
    if (isReferenceThresholdField(key, rawData)) fields.add(key);
  }
  return [...fields].filter((field) => keys.includes(field));
}

function isReferenceThresholdField(key, rawData) {
  const normalized = String(key).toLowerCase();
  if (!normalized.includes("threshold")) return false;
  if (normalized.startsWith("below_")) return false;

  return rawData.some((row) => {
    const value = row?.[key];
    return typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
  });
}

function buildReferenceLines(rawData, thresholdFields) {
  return thresholdFields
    .map((field) => {
      const value = rawData
        .map((row) => toFiniteNumber(row[field]))
        .find((v) => v != null);
      if (value == null) return null;
      return {
        key: field,
        y: value,
        label: humanize(field),
        stroke: getThresholdColor(field),
      };
    })
    .filter(Boolean);
}

function humanize(text) {
  return String(text)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSeriesLabel(value) {
  const raw = String(value ?? "").trim();
  const sampleStudent = raw.match(/^SAMPLE_[A-Z]+_STU_([0-9]+)$/i);
  if (sampleStudent) return `Student ${sampleStudent[1]}`;

  const genericStudent = raw.match(/(?:^|[_\s-])STU[_\s-]*([0-9]+)$/i);
  if (genericStudent) return `Student ${genericStudent[1]}`;

  return humanize(raw);
}

function getThresholdColor(fieldName) {
  const key = String(fieldName).toLowerCase();
  if (key.includes("pass")) return "#ef4444";
  if (key.includes("target")) return "#f59e0b";
  return "#64748b";
}
