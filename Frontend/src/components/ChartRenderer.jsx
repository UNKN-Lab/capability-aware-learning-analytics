import * as LineAdapter from "../chartAdapters/line.adapter";
import * as BarAdapter from "../chartAdapters/bar.adapter";
import * as ScatterAdapter from "../chartAdapters/scatter.adapter";
import * as PieAdapter from "../chartAdapters/pie.adapter";
import * as HeatmapAdapter from "../chartAdapters/heatmap.adapter";
import * as TableAdapter from "../chartAdapters/table.adapter";
import * as CardAdapter from "../chartAdapters/card.adapter";
import * as ChecklistAdapter from "../chartAdapters/checklist.adapter";

import LineChartView from "./charts/LineChartView";
import BarChartView from "./charts/BarChartView";
import ScatterChartView from "./charts/ScatterChartView";
import PieChartView from "./charts/PieChartView";
import HeatmapView from "./charts/HeatmapView";
import DataTableView from "./charts/DataTableView";
import MetricCardView from "./charts/MetricCardView";
import ChecklistView from "./charts/ChecklistView";
import {
  deriveChartRequiredFields,
  resolveDatasetForVisualization,
} from "./chartSelectionPolicy";
import { formatDisplayValue } from "../utils/formatDisplayValue";

const ADAPTER_MAP = {
  line_chart: LineAdapter,
  bar_chart: BarAdapter,
  histogram: BarAdapter,
  scatter_plot: ScatterAdapter,
  pie_chart: PieAdapter,
  heatmap: HeatmapAdapter,
  table: TableAdapter,
  card: CardAdapter,
  checklist: ChecklistAdapter,
};

const CHART_MAP = {
  line_chart: LineChartView,
  bar_chart: BarChartView,
  histogram: BarChartView,
  scatter_plot: ScatterChartView,
  pie_chart: PieChartView,
  heatmap: HeatmapView,
  table: DataTableView,
  card: MetricCardView,
  checklist: ChecklistView,
};

const SHOW_CHART_DIAGNOSTICS = false;

export default function ChartRenderer({ taskMeta, datasets, isLoading, error }) {
  if (isLoading) return <ChartSkeleton />;
  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200">
        <p className="text-sm font-semibold text-red-700">
          {taskMeta?.taskId || "Task"} failed
        </p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
      </div>
    );
  }
  if (!taskMeta || !datasets) return null;

  const vizType = resolveFrontendVizType(taskMeta);
  const config = normalizeVisualizationConfig(
    taskMeta,
    taskMeta.visualization_config || {}
  );
  const chartRequiredFields = deriveChartRequiredFields(taskMeta, config, vizType);

  const resolved = resolveDatasetForVisualization({
    taskMeta,
    datasets,
    config,
    vizType,
    chartRequiredFields,
  });

  const adapter = ADAPTER_MAP[vizType];
  const ChartComponent = CHART_MAP[vizType];
  if (!adapter || !ChartComponent) {
    return (
      <div className="p-6 rounded-lg bg-amber-50 border border-amber-200 text-center">
        <p className="text-sm text-amber-700 font-medium">
          Unsupported visualization type: <code className="font-mono">{vizType}</code>
        </p>
        <p className="text-xs text-amber-500 mt-1">
          Supported types: {Object.keys(CHART_MAP).join(", ")}
        </p>
      </div>
    );
  }

  const adapterConfig = {
    ...config,
    __selected_dataset_label: resolved.selectedDatasetLabel,
  };
  const safeRows = Array.isArray(resolved.rawData) ? resolved.rawData : [];

  let chartData;
  try {
    const rowsForAdapter = taskMeta?.taskId === "S-T07"
      ? buildAbsenceImpactRows(datasets)
      : taskMeta?.taskId === "A-G11"
        ? normalizeWeeklyDropRows(safeRows)
        : taskMeta?.taskId === "A-G12"
          ? normalizeBackgroundOutcomeRows(safeRows)
          : safeRows;

    if (taskMeta?.taskId === "S-T03") {
      chartData = adaptPeerComparisonChart(rowsForAdapter, adapterConfig);
    } else if (taskMeta?.taskId === "S-B03") {
      chartData = adaptEngagementSummaryChart(rowsForAdapter, adapterConfig);
    } else {
      chartData = adapter.adapt(rowsForAdapter, adapterConfig);
    }
  } catch (error) {
    console.error("[ChartRenderer] Adapter crashed", {
      taskId: taskMeta?.taskId,
      vizType,
      selectedDatasetLabel: resolved.selectedDatasetLabel,
      message: error?.message,
    });
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200">
        <p className="text-sm font-semibold text-red-700">Chart render error</p>
        <p className="text-xs text-red-600 mt-1">
          Task <code>{taskMeta?.taskId || "unknown"}</code> returned incompatible chart data.
        </p>
      </div>
    );
  }
  const adapterMeta = chartData?.meta || {};
  const diagnostics = buildDiagnostics({
    vizType,
    rawData: safeRows,
    selectedDatasetLabel: resolved.selectedDatasetLabel,
    chartRequiredFields,
    resolutionWarnings: resolved.warnings,
    adapterMeta,
  });

  const shouldShowCompetencyBadge = isCompetencyProxyTask(taskMeta);
  const hasProxyRows = shouldShowCompetencyBadge && safeRows.some(
    (r) => r?.competency_source === "proxy" || r?.competency_source === "unknown"
  );
  const hasNativeRows = shouldShowCompetencyBadge && safeRows.some((r) => r?.competency_source === "native");
  const showProxyBadge = hasProxyRows && !hasNativeRows;
  const showMixedBadge = hasProxyRows && hasNativeRows;
  const absenceContext = vizType === "card" ? null : buildAbsenceContext(taskMeta, datasets);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">{taskMeta.taskName}</h4>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
          {getDisplayedVizType(vizType, config, taskMeta)}
        </span>
      </div>

      {(showProxyBadge || showMixedBadge) && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {showProxyBadge && <ProxyCompetencyBadge mode="proxy" tooltip={taskMeta.semanticNote} />}
          {showMixedBadge && <ProxyCompetencyBadge mode="mixed" tooltip={taskMeta.semanticNote} />}
        </div>
      )}
      {absenceContext && <AbsenceContextAnnotation context={absenceContext} />}

      {hasRenderableData(vizType, chartData) ? (
        <ChartComponent data={chartData} config={{ ...adapterConfig, __task_id: taskMeta.taskId }} />
      ) : (
        <NoDataState
          datasetLabel={resolved.selectedDatasetLabel}
          message="No valid data after applying missing-data policy."
        />
      )}

      {SHOW_CHART_DIAGNOSTICS && <ChartDiagnosticsPanel diagnostics={diagnostics} />}
    </div>
  );
}

function resolveFrontendVizType(taskMeta) {
  if (taskMeta?.taskId === "S-B03") return "bar_chart";
  if (taskMeta?.taskId === "S-T07") return "card";
  if (taskMeta?.taskId === "A-S01") return "card";
  if (taskMeta?.taskId === "A-S08") return "card";
  if (taskMeta?.taskId === "A-C03") return "card";
  if (taskMeta?.taskId === "A-C05") return "card";
  if (taskMeta?.taskId === "A-G03") return "card";
  if (taskMeta?.taskId === "A-G15") return "card";
  if (taskMeta?.taskId === "A-G16") return "card";
  if (taskMeta?.taskId === "A-G07") return "bar_chart";
  return taskMeta?.viz_type;
}

function getDisplayedVizType(vizType, config, taskMeta) {
  if (taskMeta?.taskId === "A-S07") return "context";
  if (config?.variant === "histogram") return "histogram";
  return String(vizType || "").replace("_", " ");
}

function isCompetencyProxyTask(taskMeta) {
  const text = [
    taskMeta?.taskId,
    taskMeta?.taskName,
    taskMeta?.semanticNote,
    taskMeta?.visualization_config?.x_field,
  ].filter(Boolean).join(" ").toLowerCase();

  return text.includes("competency") && taskMeta?.taskId !== "A-G04";
}

function normalizeVisualizationConfig(taskMeta, config) {
  if (taskMeta?.taskId === "A-S01") {
    return {
      ...config,
      variant: "student_profile",
    };
  }

  if (taskMeta?.taskId === "A-S08") {
    return {
      ...config,
      variant: "intervention_plan",
    };
  }

  if (taskMeta?.taskId === "A-C03") {
    return {
      ...config,
      variant: "risk_comparison",
    };
  }

  if (taskMeta?.taskId === "A-C05") {
    return {
      ...config,
      variant: "academic_background_comparison",
    };
  }

  if (taskMeta?.taskId === "A-G03") {
    return {
      ...config,
      variant: "at_risk_contact_queue",
    };
  }

  if (taskMeta?.taskId === "A-G15") {
    return {
      ...config,
      variant: "intervention_priority_ranking",
      queue_limit: 10,
      queue_label: "Intervention priority ranking",
    };
  }

  if (taskMeta?.taskId === "A-G16") {
    return {
      ...config,
      variant: "admin_action_recommendation",
    };
  }

  if (taskMeta?.taskId === "A-G07") {
    return {
      ...config,
      x_field: "feature_name",
      y_field: "correlation_with_avg_score",
      series_field: null,
      color_field: "correlation_with_avg_score",
      orientation: "horizontal",
      variant: "correlation_rank",
      x_label: "Factor",
      y_label: "Correlation with Avg Score",
      semantic_roles: {
        ...(config.semantic_roles || {}),
        x: "category",
        y: "correlation_metric",
        color: "correlation_metric",
      },
    };
  }

  if (taskMeta?.taskId === "S-T03") {
    return {
      ...config,
      x_field: "metric_name",
      y_field: "metric_value",
      series_field: "comparison_group",
      color_field: "comparison_group",
      orientation: "horizontal",
      variant: "grouped",
      x_label: "Metric",
      y_label: "Value (0-100)",
      semantic_roles: {
        ...(config.semantic_roles || {}),
        x: "category",
        y: "performance_metric",
        series: "category",
      },
    };
  }

  if (taskMeta?.taskId === "S-B03") {
    return {
      ...config,
      x_field: "metric_name",
      y_field: "metric_value",
      series_field: "comparison_group",
      color_field: "comparison_group",
      orientation: "horizontal",
      variant: "grouped",
      x_label: "Engagement metric",
      y_label: "You as % of class average",
      semantic_roles: {
        ...(config.semantic_roles || {}),
        x: "category",
        y: "engagement_metric",
        series: "category",
      },
    };
  }

  if (taskMeta?.taskId === "S-T07") {
    return {
      ...config,
      variant: "absence_impact_summary",
    };
  }

  if (taskMeta?.taskId === "A-S06") {
    return {
      ...config,
      x_field: "assessment_order",
      y_field: "submission_delay_days",
      orientation: "vertical",
      variant: "signed_delay",
      x_label: "Assessment",
      y_label: "Submission Delay (days)",
      semantic_roles: {
        ...(config.semantic_roles || {}),
        x: "time",
        y: "behavioral_metric",
      },
    };
  }

  if (taskMeta?.taskId === "A-S03") {
    return {
      ...config,
      x_field: "week_number",
      y_field: "weekly_clicks",
      series_field: null,
      y_fields: ["weekly_clicks", "rolling_3wk_avg"],
      series_labels: {
        weekly_clicks: "Weekly clicks",
        rolling_3wk_avg: "Rolling 3-week average",
      },
      variant: "multi_line",
      x_label: "Week",
      y_label: "Engagement Clicks",
      semantic_roles: {
        ...(config.semantic_roles || {}),
        x: "time",
        y: "engagement_metric",
        series: "metric",
      },
    };
  }

  if (taskMeta?.taskId === "A-G11") {
    return {
      ...config,
      x_field: "week_number",
      y_field: "weekly_clicks",
      series_field: null,
      y_fields: ["weekly_clicks", "rolling_3wk_avg"],
      series_labels: {
        weekly_clicks: "Weekly clicks",
        rolling_3wk_avg: "Rolling 3-week average",
      },
      variant: "multi_line",
      x_label: "Week",
      y_label: "Total Clicks",
      semantic_roles: {
        ...(config.semantic_roles || {}),
        x: "time",
        y: "engagement_metric",
        series: "metric",
      },
    };
  }

  if (taskMeta?.taskId === "A-G12") {
    return {
      ...config,
      x_field: "group_value",
      y_field: "fail_or_withdrawn_pct",
      series_field: null,
      orientation: "horizontal",
      variant: "ranked",
      x_label: "Demographic Group",
      y_label: "Fail + Withdrawn (%)",
      semantic_roles: {
        ...(config.semantic_roles || {}),
        x: "category",
        y: "risk_rate",
        series: null,
      },
    };
  }

  return config;
}

function normalizeWeeklyDropRows(rows) {
  return rows.map((row) => ({
    ...row,
    weekly_clicks: row?.weekly_clicks ?? row?.week_total_clicks,
  }));
}

function normalizeBackgroundOutcomeRows(rows) {
  const classifiedRows = rows.map((row) => ({
    row,
    groupKind: classifyBackgroundGroupValue(row?.group_value),
  }));
  const preferredGroupKind = classifiedRows.some((item) => item.groupKind === "socioeconomic_band")
    ? "socioeconomic_band"
    : null;
  const byGroup = new Map();

  for (const item of classifiedRows) {
    if (preferredGroupKind && item.groupKind !== preferredGroupKind) continue;

    const row = item.row;
    const groupValue = String(row?.group_value ?? "Unknown").trim() || "Unknown";
    const outcome = String(row?.final_outcome ?? "").trim().toLowerCase();
    const pct = Number(row?.pct_within_group);
    const count = Number(row?.student_count);

    if (!byGroup.has(groupValue)) {
      byGroup.set(groupValue, {
        group_value: groupValue,
        fail_pct: 0,
        withdrawn_pct: 0,
        pass_pct: 0,
        distinction_pct: 0,
        student_count: 0,
      });
    }

    const group = byGroup.get(groupValue);
    if (Number.isFinite(count)) group.student_count += count;
    if (!Number.isFinite(pct)) continue;

    if (outcome === "fail") group.fail_pct += pct;
    else if (outcome === "withdrawn" || outcome === "withdraw") group.withdrawn_pct += pct;
    else if (outcome === "pass") group.pass_pct += pct;
    else if (outcome === "distinction") group.distinction_pct += pct;
  }

  return [...byGroup.values()].map((group) => ({
    ...group,
    fail_or_withdrawn_pct: Number((group.fail_pct + group.withdrawn_pct).toFixed(1)),
  }));
}

function classifyBackgroundGroupValue(value) {
  const text = String(value ?? "").trim();
  if (/^\d+\s*-\s*\d+%$/.test(text)) return "socioeconomic_band";
  if (/region$/i.test(text) || /ireland|england|scotland|wales/i.test(text)) return "region";
  if (/qualification|level|education|graduate/i.test(text)) return "education";
  if (/^\d+\s*-\s*\d+$/.test(text)) return "age_group";
  return "other";
}

function adaptPeerComparisonChart(rawRows, config) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const grouped = new Map();
  const series = new Set();

  for (const row of rows) {
    const metricName = String(row?.metric_name ?? "").trim();
    const comparisonGroup = String(row?.comparison_group ?? "").trim();
    const metricValue = Number(row?.metric_value);
    if (!metricName || !comparisonGroup || !Number.isFinite(metricValue)) continue;

    if (!grouped.has(metricName)) {
      grouped.set(metricName, {
        x: metricName,
        metric_name: metricName,
        __categoryRaw: metricName,
        __categoryLabel: metricName,
      });
    }
    grouped.get(metricName)[comparisonGroup] = metricValue;
    series.add(comparisonGroup);
  }

  const preferredSeries = ["You", "Cohort benchmark"];
  const bars = [
    ...preferredSeries.filter((name) => series.has(name)),
    ...[...series].filter((name) => !preferredSeries.includes(name)),
  ].map((name) => ({ dataKey: name, name }));

  return {
    data: [...grouped.values()],
    xKey: "x",
    bars,
    stacked: false,
    categoryField: "metric_name",
    valueField: "metric_value",
    categoryLabel: config.x_label || "Metric",
    valueLabel: config.y_label || "Value (0-100)",
    valueKind: "score",
    meta: {
      valid_rows: grouped.size,
      input_rows: rows.length,
      skipped_rows: Math.max(0, rows.length - grouped.size * Math.max(1, bars.length)),
      missing_field_counts: {},
      warnings: [],
      null_handling_policy: "real zero is preserved; null/missing is not coerced",
    },
  };
}

function adaptEngagementSummaryChart(rawRows, config) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const source = rows[0] || {};
  const metrics = [
    {
      name: "Total clicks",
      student: source.total_clicks ?? source.total_engagement_count,
      cohort: source.class_avg_total_engagement_count,
    },
    {
      name: "Active days",
      student: source.active_days,
      cohort: source.class_avg_active_days,
    },
    {
      name: "Engagement score",
      student: source.engagement_score,
      cohort: source.class_avg_engagement_score,
    },
  ];

  const data = metrics
    .map((metric) => {
      const studentValue = Number(metric.student);
      const cohortValue = Number(metric.cohort);
      if (!Number.isFinite(studentValue) || !Number.isFinite(cohortValue) || cohortValue <= 0) {
        return null;
      }

      return {
        x: metric.name,
        metric_name: metric.name,
        __categoryRaw: metric.name,
        __categoryLabel: metric.name,
        You: Number(studentValue.toFixed(4)),
        "Class average": Number(cohortValue.toFixed(4)),
        student_raw_value: studentValue,
        cohort_raw_value: cohortValue,
      };
    })
    .filter(Boolean);

  return {
    data,
    xKey: "x",
    bars: [
      { dataKey: "You", name: "You" },
      { dataKey: "Class average", name: "Class average" },
    ],
    stacked: false,
    categoryField: "metric_name",
    valueField: "metric_value",
    categoryLabel: config.x_label || "Engagement metric",
    valueLabel: "Actual value",
    valueKind: "engagement_raw",
    meta: {
      valid_rows: data.length,
      input_rows: rows.length,
      skipped_rows: metrics.length - data.length,
      missing_field_counts: {},
      warnings: [],
      null_handling_policy: "metrics without a finite class average are skipped",
    },
  };
}

function buildAbsenceImpactRows(datasets) {
  const absenceRows = Array.isArray(datasets?.absence_data) ? datasets.absence_data : [];
  const scoreRows = Array.isArray(datasets?.score_series) ? datasets.score_series : [];
  const absenceRow = absenceRows[0] || {};
  const scored = scoreRows
    .map((row, index) => ({
      score: Number(row?.score_normalized),
      order: Number(row?.assessment_order ?? index + 1),
      passFlag: row?.pass_flag,
    }))
    .filter((row) => Number.isFinite(row.score));

  const scores = scored.map((row) => row.score);
  const avgScore = scores.length > 0
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : null;
  const latestScore = scored.length > 0 ? scored[scored.length - 1].score : null;
  const minScore = scores.length > 0 ? Math.min(...scores) : null;
  const maxScore = scores.length > 0 ? Math.max(...scores) : null;
  const performanceTrend = calculateSimpleSlope(scored);

  return [{
    absences: absenceRow.absences,
    absence_rate: absenceRow.absence_rate,
    class_max_absences: deriveClassMaxAbsences(absenceRow.absences, absenceRow.absence_rate),
    avg_score: avgScore,
    latest_score: latestScore,
    min_score: minScore,
    max_score: maxScore,
    performance_trend: performanceTrend,
    assessment_count: scored.length,
  }];
}

function deriveClassMaxAbsences(absences, absenceRate) {
  const numericAbsences = Number(absences);
  const numericRate = Number(absenceRate);
  if (!Number.isFinite(numericAbsences) || !Number.isFinite(numericRate) || numericRate <= 0) {
    return null;
  }
  return Math.round(numericAbsences / numericRate);
}

function calculateSimpleSlope(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const clean = rows.filter((row) =>
    Number.isFinite(row.order) && Number.isFinite(row.score)
  );
  if (clean.length < 2) return null;
  const meanX = clean.reduce((sum, row) => sum + row.order, 0) / clean.length;
  const meanY = clean.reduce((sum, row) => sum + row.score, 0) / clean.length;
  const denominator = clean.reduce((sum, row) => sum + (row.order - meanX) ** 2, 0);
  if (denominator === 0) return null;
  const numerator = clean.reduce(
    (sum, row) => sum + (row.order - meanX) * (row.score - meanY),
    0
  );
  return numerator / denominator;
}

function buildAbsenceContext(taskMeta, datasets) {
  if (taskMeta?.taskId !== "S-T07") return null;
  const absenceRows = Array.isArray(datasets?.absence_data) ? datasets.absence_data : [];
  const firstRow = absenceRows[0];
  if (!firstRow) return null;

  const absences = firstRow.absences;
  const absenceRate = firstRow.absence_rate;
  const hasAbsences = absences !== null && absences !== undefined && absences !== "";
  const hasAbsenceRate = absenceRate !== null && absenceRate !== undefined && absenceRate !== "";
  if (!hasAbsences && !hasAbsenceRate) return null;

  return {
    absences: hasAbsences ? formatDisplayValue(absences) : null,
    absenceRate: hasAbsenceRate ? formatPercentValue(absenceRate) : null,
  };
}

function formatPercentValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return formatDisplayValue(value);
  const pct = numeric <= 1 ? numeric * 100 : numeric;
  return `${Number(pct.toFixed(1))}%`;
}

function buildDiagnostics({
  vizType,
  rawData,
  selectedDatasetLabel,
  chartRequiredFields,
  resolutionWarnings,
  adapterMeta,
}) {
  const baseFieldCounts = {};
  for (const field of chartRequiredFields) {
    baseFieldCounts[field] = Array.isArray(rawData)
      ? rawData.filter((row) => row?.[field] === null || row?.[field] === undefined || row?.[field] === "").length
      : 0;
  }

  const adapterFieldCounts = adapterMeta.missing_field_counts || {};
  const mergedFieldCounts = { ...baseFieldCounts };
  Object.entries(adapterFieldCounts).forEach(([key, value]) => {
    mergedFieldCounts[key] = Math.max(mergedFieldCounts[key] || 0, Number(value) || 0);
  });

  const missingFields = Object.keys(mergedFieldCounts).filter((f) => (mergedFieldCounts[f] || 0) > 0);
  const warnings = [
    ...(resolutionWarnings || []),
    ...(adapterMeta.warnings || []),
  ];

  const validRows = Number.isFinite(adapterMeta.valid_rows)
    ? adapterMeta.valid_rows
    : Array.isArray(rawData)
      ? rawData.length
      : 0;
  const skippedRows = Number.isFinite(adapterMeta.skipped_rows)
    ? adapterMeta.skipped_rows
    : 0;

  return {
    chart_type: vizType,
    selected_dataset_label: selectedDatasetLabel,
    null_handling_policy:
      adapterMeta.null_handling_policy ||
      "real zero is preserved; null/missing is not coerced",
    valid_rows: validRows,
    skipped_rows: skippedRows,
    missing_fields: missingFields,
    missing_field_counts: mergedFieldCounts,
    warnings,
  };
}

function hasRenderableData(vizType, chartData) {
  if (!chartData) return false;
  if (vizType === "scatter_plot") {
    return Array.isArray(chartData.series) && chartData.series.some((s) => Array.isArray(s.data) && s.data.length > 0);
  }
  if (vizType === "heatmap") {
    return Array.isArray(chartData.cells) && chartData.cells.some((c) => c.value !== null && c.value !== undefined);
  }
  if (vizType === "card") {
    if (chartData.type === "risk_status") return true;
    if (chartData.type === "student_profile") return true;
    if (chartData.type === "action_plan") return true;
    if (chartData.type === "risk_comparison") return true;
    if (chartData.type === "academic_background_comparison") return true;
    if (chartData.type === "at_risk_contact_queue") return true;
    if (chartData.type === "admin_action_recommendation") return true;
    if (chartData.type === "procrastination_summary") return true;
    if (chartData.type === "absence_impact_summary") return true;
    return Array.isArray(chartData.items) && chartData.items.length > 0;
  }
  if (vizType === "checklist") {
    return Array.isArray(chartData.items) && chartData.items.length > 0;
  }
  if (vizType === "table") {
    if (chartData.type === "action_plan") {
      return Array.isArray(chartData.actions) && chartData.actions.length > 0;
    }
    return Array.isArray(chartData.rows) && chartData.rows.length > 0;
  }
  return Array.isArray(chartData.data) && chartData.data.length > 0;
}

function NoDataState({ datasetLabel, message }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
      <p className="text-sm font-medium text-slate-600">{message}</p>
      <p className="text-xs text-slate-500 mt-2">
        Dataset block: <span className="font-mono">{datasetLabel || "none"}</span>
      </p>
    </div>
  );
}

function ChartDiagnosticsPanel({ diagnostics }) {
  if (!diagnostics) return null;
  const {
    selected_dataset_label,
    valid_rows,
    skipped_rows,
    missing_fields,
    missing_field_counts,
    null_handling_policy,
    warnings,
  } = diagnostics;
  const hasMissingRows = skipped_rows > 0 || missing_fields.length > 0;
  const hasWarnings = warnings.length > 0;
  if (!hasMissingRows && !hasWarnings) return null;
  const missingSummary = missing_fields
    .map((f) => `${f}=${missing_field_counts[f] ?? 0}`)
    .join(", ");

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-1">
        <p>
          Dataset block: <span className="font-mono text-slate-700">{selected_dataset_label || "none"}</span>
        </p>
        <p>
          Valid rows: <span className="font-semibold text-slate-700">{valid_rows}</span>
        </p>
        {skipped_rows > 0 && (
          <p>
            Skipped rows: <span className="font-semibold text-slate-700">{skipped_rows}</span>
          </p>
        )}
      </div>

      {missing_fields.length > 0 && (
        <p className="text-[11px] text-slate-500 mt-1">
          Missing values filtered: <span className="font-mono text-slate-600">{missingSummary}</span>
        </p>
      )}

      <p className="text-[11px] text-slate-500 mt-1">
        Null policy: <span className="font-mono text-slate-600">{formatDisplayValue(null_handling_policy)}</span>
      </p>

      {hasWarnings && (
        <ul className="mt-2 space-y-1 text-[11px] text-amber-700">
          {warnings.map((warning, idx) => (
            <li key={`${formatDisplayValue(warning)}-${idx}`}>- {formatDisplayValue(warning)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProxyCompetencyBadge({ mode, tooltip }) {
  const isProxy = mode === "proxy";
  return (
    <div
      title={tooltip || undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        marginBottom: 0,
        padding: "6px 12px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 500,
        cursor: tooltip ? "help" : "default",
        backgroundColor: isProxy ? "#fffbeb" : "#eff6ff",
        border: isProxy ? "1px solid #f59e0b" : "1px solid #93c5fd",
        color: isProxy ? "#92400e" : "#1e40af",
      }}
    >
      <span>{isProxy ? "!" : "i"}</span>
      <span>
        {isProxy
          ? "Competency Mode: Derived from assessment structure"
          : "Competency Mode: Mixed (native + proxy)"}
      </span>
    </div>
  );
}

function AbsenceContextAnnotation({ context }) {
  return (
    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {context.absences !== null && (
        <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">Absences</p>
          <p className="mt-1 text-sm font-bold text-slate-800">{context.absences}</p>
        </div>
      )}
      {context.absenceRate !== null && (
        <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">Absence Rate</p>
          <p className="mt-1 text-sm font-bold text-slate-800">{context.absenceRate}</p>
        </div>
      )}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm animate-pulse">
      <div className="h-4 w-48 bg-slate-200 rounded mb-4" />
      <div className="h-[340px] bg-slate-100 rounded-lg flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
          <span className="text-xs text-slate-400">Loading chart...</span>
        </div>
      </div>
    </div>
  );
}
