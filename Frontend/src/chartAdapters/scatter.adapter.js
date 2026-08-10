import {
  createAdapterDiagnostics,
  finalizeDiagnostics,
  registerMissingField,
  toCategoryValue,
  toFiniteNumber,
} from "./adapterPolicy.js";

export function adapt(rawData, config = {}) {
  const diag = createAdapterDiagnostics({
    chartType: "scatter_plot",
    selectedDatasetLabel: config.__selected_dataset_label || null,
  });

  if (!Array.isArray(rawData) || rawData.length === 0) {
    return {
      series: [],
      xKey: config.x_field,
      yKey: config.y_field,
      meta: finalizeDiagnostics(diag),
    };
  }

  diag.input_rows = rawData.length;
  const { x_field, y_field, color_field, variant } = config;
  if (variant === "colored" && color_field) {
    return adaptColored(rawData, { x_field, y_field, color_field, diag });
  }
  return adaptSingle(rawData, { x_field, y_field, diag });
}

function adaptSingle(rawData, { x_field, y_field, diag }) {
  const points = [];
  for (const row of rawData) {
    const x = toFiniteNumber(row?.[x_field]);
    const y = toFiniteNumber(row?.[y_field]);
    if (x === null && row?.[x_field] !== 0) {
      registerMissingField(diag, x_field);
      continue;
    }
    if (y === null && row?.[y_field] !== 0) {
      registerMissingField(diag, y_field);
      continue;
    }
    points.push({ x, y });
  }

  diag.valid_rows = points.length;
  if (points.length === 0 && rawData.length > 0) {
    diag.warnings.push(`No valid scatter points after filtering missing "${x_field}" or "${y_field}".`);
  }
  return {
    series: [{ name: y_field, data: points }],
    xKey: "x",
    yKey: "y",
    stats: buildScatterStats(points),
    trendLine: buildTrendLine(points),
    meta: finalizeDiagnostics(diag),
  };
}

function adaptColored(rawData, { x_field, y_field, color_field, diag }) {
  const groups = {};
  let validPoints = 0;

  for (const row of rawData) {
    const x = toFiniteNumber(row?.[x_field]);
    const y = toFiniteNumber(row?.[y_field]);
    const label = toCategoryValue(row?.[color_field]) ?? "Unknown";

    if (x === null && row?.[x_field] !== 0) {
      registerMissingField(diag, x_field);
      continue;
    }
    if (y === null && row?.[y_field] !== 0) {
      registerMissingField(diag, y_field);
      continue;
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push({ x, y, label });
    validPoints += 1;
  }

  diag.valid_rows = validPoints;
  if (validPoints === 0 && rawData.length > 0) {
    diag.warnings.push(`No valid scatter points after filtering missing "${x_field}" or "${y_field}".`);
  }
  const series = Object.entries(groups)
    .map(([name, data]) => ({ name, data }))
    .sort((a, b) => {
      if (a.name === "Selected student") return 1;
      if (b.name === "Selected student") return -1;
      return a.name.localeCompare(b.name);
    });
  const allPoints = series.flatMap((item) => item.data);
  return {
    series,
    xKey: "x",
    yKey: "y",
    stats: buildScatterStats(allPoints),
    trendLine: buildTrendLine(allPoints),
    meta: finalizeDiagnostics(diag),
  };
}

function buildScatterStats(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }

  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }

  if (varianceX === 0 || varianceY === 0) {
    return {
      count: n,
      slope: null,
      correlation: null,
      direction: "flat",
      strength: "unknown",
    };
  }

  const slope = covariance / varianceX;
  const correlation = covariance / Math.sqrt(varianceX * varianceY);
  const absCorrelation = Math.abs(correlation);

  return {
    count: n,
    slope,
    correlation,
    direction: slope < -0.05 ? "negative" : slope > 0.05 ? "positive" : "flat",
    strength: absCorrelation >= 0.7 ? "strong" : absCorrelation >= 0.4 ? "moderate" : "weak",
  };
}

function buildTrendLine(points) {
  const stats = buildScatterStats(points);
  if (!stats || stats.slope === null) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  if (minX === maxX) {
    return null;
  }

  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const intercept = meanY - stats.slope * meanX;

  return [
    { x: minX, y: intercept + stats.slope * minX },
    { x: maxX, y: intercept + stats.slope * maxX },
  ];
}
