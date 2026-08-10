export function resolveDatasetForVisualization({
  taskMeta,
  datasets,
  config,
  vizType,
  chartRequiredFields,
}) {
  const warnings = [];
  const availableLabels = getOrderedDatasetLabels(taskMeta, datasets);
  if (availableLabels.length === 0) {
    return { rawData: [], selectedDatasetLabel: null, warnings: ["No dataset block found."] };
  }

  const explicitLabel = config.dataset_label;
  if (explicitLabel) {
    if (Array.isArray(datasets[explicitLabel])) {
      return {
        rawData: datasets[explicitLabel],
        selectedDatasetLabel: explicitLabel,
        warnings,
      };
    }
    warnings.push(
      `dataset_label="${explicitLabel}" not found; fallback selector applied.`
    );
  }

  const candidates = availableLabels.filter((label) =>
    isDatasetCandidate({
      rows: datasets[label],
      vizType,
      config,
      chartRequiredFields,
    })
  );

  if (candidates.length > 0) {
    const selected = candidates[0];
    if (candidates.length > 1) {
      warnings.push(
        `Multiple dataset blocks match chart fields; selected "${selected}" by deterministic order.`
      );
    } else if (!explicitLabel) {
      warnings.push(`Selected dataset block "${selected}" by field match.`);
    }
    return {
      rawData: toRowArray(datasets[selected]),
      selectedDatasetLabel: selected,
      warnings,
    };
  }

  const fallback = availableLabels[0];
  warnings.push(
    `No dataset block matched required chart fields; fallback to "${fallback}".`
  );
  return {
    rawData: toRowArray(datasets[fallback]),
    selectedDatasetLabel: fallback,
    warnings,
  };
}

function toRowArray(value) {
  return Array.isArray(value) ? value : [];
}

export function deriveChartRequiredFields(taskMeta, config, vizType) {
  const explicit = taskMeta?.availability_contract?.chart_required_fields;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.filter(Boolean);
  }

  const fields = new Set();
  const add = (v) => {
    if (typeof v === "string" && v.trim() !== "") fields.add(v);
  };
  if (["line_chart", "bar_chart", "histogram", "scatter_plot", "pie_chart", "heatmap"].includes(vizType)) {
    add(config.x_field);
    add(config.y_field);
  }
  if (vizType === "scatter_plot") add(config.color_field);
  if (vizType === "heatmap") add(config.series_field);
  return [...fields];
}

export function getOrderedDatasetLabels(taskMeta, datasets) {
  const keys = Object.keys(datasets || {});
  if (keys.length === 0) return [];
  const labels = Array.isArray(taskMeta.query_labels) ? taskMeta.query_labels : [];
  const known = labels.filter((l) => keys.includes(l));
  const others = keys.filter((k) => !known.includes(k)).sort();
  return [...known, ...others];
}

export function isDatasetCandidate({ rows, vizType, config, chartRequiredFields }) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const sample = rows[0] || {};
  const hasField = (field) => field && Object.prototype.hasOwnProperty.call(sample, field);

  if (vizType === "scatter_plot") {
    const x = config.x_field;
    const y = config.y_field;
    if (!x || !y) return false;
    return rows.some((r) => Number.isFinite(Number(r?.[x])) && Number.isFinite(Number(r?.[y])));
  }

  if (chartRequiredFields.length === 0) return true;
  return chartRequiredFields.every((field) => hasField(field));
}
