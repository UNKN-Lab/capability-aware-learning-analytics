/**
 * LineChartView.jsx — Pure Recharts line chart rendering.
 * Receives adapted data only — zero business logic.
 */

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

import { getStableColor } from "../../utils/colorUtils";

export default function LineChartView({ data, config }) {
  const { data: chartData, xKey, lines, referenceLines = [] } = data;
  const labeledReferenceLines = spreadReferenceLineLabels(referenceLines);
  const hasReferenceLineLabels = referenceLines.some((line) => line?.label);
  const trendSummary = buildTrendSummary(chartData, lines, config);
  const numericXAxis = isNumericXAxis(chartData, xKey);
  const xTicks = getLineXTicks(chartData, xKey, config, numericXAxis);
  const xDomain = getLineXDomain(chartData, xKey, config, numericXAxis);
  const yDomain = getLineYDomain(chartData, lines, config);
  const yTicks = getLineYTicks(config);
  const dropWeekMarkers = getDropWeekMarkers(chartData, config);
  const chartMargin = {
    top: 10,
    right: hasReferenceLineLabels ? 150 : 20,
    bottom: lines.length > 1 ? 45 : 25,
    left: 0
  };

  if (!chartData || chartData.length === 0) {
    return <EmptyChart message="No data to display" />;
  }

  return (
    <div style={{ minHeight: trendSummary ? 440 : 380, width: "100%" }}>
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData} margin={chartMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey={xKey}
            type={numericXAxis ? "number" : "category"}
            domain={xDomain}
            allowDataOverflow={numericXAxis}
            ticks={xTicks}
            tickFormatter={(value) => formatLineXAxisTick(value, config)}
            height={lines.length > 1 ? 70 : 60}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickMargin={8}
            axisLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
            tickLine={false}
            label={config.x_label ? { value: config.x_label, position: "insideBottom", offset: lines.length > 1 ? -6 : -15, fontSize: 12, fill: "#94a3b8" } : undefined}
          />
        <YAxis
          domain={yDomain}
          ticks={yTicks}
          allowDataOverflow={false}
          tick={{ fontSize: 12, fill: "#64748b" }}
          tickMargin={8}
          axisLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
          tickLine={false}
          label={config.y_label ? { value: config.y_label, angle: -90, position: "insideLeft", fontSize: 12, fill: "#94a3b8" } : undefined}
        />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        {labeledReferenceLines.map((line) => (
          <ReferenceLine
            key={line.key}
            y={line.y}
            stroke={line.stroke}
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{
              value: line.label,
              position: "right",
              fill: line.stroke,
              fontSize: 11,
              dy: line.labelDy
            }}
          />
        ))}
        {lines.length > 1 && (
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="plainline"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          />
        )}
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type={config?.line_type || "linear"}
            dataKey={line.dataKey}
            name={line.name}
            stroke={getLineColor(line.dataKey)}
            strokeWidth={line.dataKey === "rolling_3wk_avg" ? 2.5 : 2}
            strokeDasharray={line.dataKey === "rolling_3wk_avg" ? "6 4" : undefined}
            dot={getLineDotRenderer(line, config)}
            activeDot={{ r: 6 }}
            connectNulls={Boolean(config.connect_nulls) || line.dataKey === "rolling_3wk_avg"}
          />
        ))}
      </LineChart>
      </ResponsiveContainer>
      {dropWeekMarkers.length > 0 && <DropWeekNote count={dropWeekMarkers.length} />}
      {trendSummary && <TrendSummary summary={trendSummary} />}
    </div>
  );
}

function getLineDotRenderer(line, config) {
  if (line.dataKey === "rolling_3wk_avg") return false;
  if (config?.__task_id === "A-G14") return false;
  return renderLineDot;
}

function renderLineDot(props) {
  const { cx, cy, payload, dataKey } = props;
  const isDropWeek = payload?.is_drop_week === true
    || String(payload?.is_drop_week).toLowerCase() === "true";
  const fill = isDropWeek ? "#ef4444" : getLineColor(dataKey);
  const radius = isDropWeek ? 5 : 3.5;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={fill}
      stroke="#ffffff"
      strokeWidth={isDropWeek ? 2 : 1}
    />
  );
}

function isNumericXAxis(chartData, xKey) {
  return Array.isArray(chartData)
    && chartData.length > 0
    && chartData.every((row) => typeof row?.[xKey] === "number" && Number.isFinite(row[xKey]));
}

function getLineXDomain(chartData, xKey, config, numericXAxis) {
  if (!numericXAxis) return undefined;
  const values = chartData.map((row) => row?.[xKey]).filter(Number.isFinite);
  if (values.length === 0) return undefined;
  if (config?.x_field === "week_number") {
    return [Math.min(...values), Math.max(...values) + 1];
  }
  if (isDiscreteNumericXAxis(config, values)) {
    return [Math.min(...values), Math.max(...values)];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const padding = range > 0 ? range * 0.06 : 1;
  return [min - padding, max + padding];
}

function getLineXTicks(chartData, xKey, config, numericXAxis) {
  if (!numericXAxis) return undefined;

  const values = chartData.map((row) => row?.[xKey]).filter(Number.isFinite);
  if (values.length === 0) return undefined;

  if (isDiscreteNumericXAxis(config, values)) {
    return [...new Set(values)].sort((a, b) => a - b);
  }

  if (config?.x_field !== "week_number") return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const ticks = new Set([min, max]);
  const firstFive = Math.ceil(min / 5) * 5;

  for (let value = firstFive; value <= max; value += 5) {
    ticks.add(value);
  }

  return [...ticks].sort((a, b) => a - b);
}

function isDiscreteNumericXAxis(config, values = []) {
  const field = String(config?.x_field || "").toLowerCase();
  const label = String(config?.x_label || "").toLowerCase();
  const looksDiscrete =
    field.includes("assessment_order")
    || field === "order"
    || field.endsWith("_order")
    || field.endsWith("_index")
    || label.includes("assessment order");

  return looksDiscrete && values.every((value) => Number.isInteger(value));
}

function getLineYDomain(chartData, lines, config) {
  if (isNormalizedScoreChart(config)) return [0, 100];

  const values = [];
  for (const row of chartData || []) {
    for (const line of lines || []) {
      const value = Number(row?.[line.dataKey]);
      if (Number.isFinite(value)) values.push(value);
    }
  }

  if (values.length === 0) return [0, "dataMax"];
  return [0, niceAxisMax(Math.max(...values), { extraPadding: true })];
}

function getLineYTicks(config) {
  if (isNormalizedScoreChart(config)) return [0, 25, 50, 75, 100];
  return undefined;
}

function getDropWeekMarkers(chartData, config) {
  if (config?.__task_id !== "A-G11") return [];

  return (chartData || [])
    .map((row) => ({
      x: Number(row?.x),
      y: Number(row?.weekly_clicks),
      isDrop: row?.is_drop_week === true || String(row?.is_drop_week).toLowerCase() === "true",
    }))
    .filter((point) => point.isDrop && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function isNormalizedScoreChart(config) {
  const yField = String(config?.y_field || "").toLowerCase();
  const yLabel = String(config?.y_label || "").toLowerCase();
  return yField === "score_normalized" || yLabel.includes("normalized score");
}

function niceAxisMax(value, options = {}) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const padded = value * (options.extraPadding ? 1.18 : 1.1);
  if (padded <= 10) return Math.ceil(padded);
  if (padded <= 100) return Math.ceil(padded / 10) * 10;
  if (padded <= 1000) return Math.ceil(padded / 100) * 100;
  if (padded <= 10000) return Math.ceil(padded / 1000) * 1000;
  return Math.ceil(padded / 5000) * 5000;
}

function formatLineXAxisTick(value, config) {
  if (config?.x_field === "week_number") {
    const week = Number(value);
    if (!Number.isFinite(week)) return value;
    return week < 0 ? "Pre-course" : `W${week}`;
  }
  if (isDiscreteNumericXAxis(config, [Number(value)])) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return String(Math.round(numeric));
  }
  return value;
}

function getLineColor(dataKey) {
  const key = String(dataKey).toLowerCase();
  if (key === "weekly_clicks" || key.includes("click")) return "#2563eb";
  if (key.includes("rolling") || key.includes("average")) return "#f97316";
  if (key === "distinction") return "#8b5cf6";
  if (key === "pass") return "#f97316";
  if (key === "fail") return "#10b981";
  if (key === "withdrawn" || key === "withdraw") return "#ef4444";
  return getStableColor(dataKey);
}

function TrendSummary({ summary }) {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span>
          Trend: <strong className="text-slate-950">{summary.label}</strong>
        </span>
        <span>
          Slope: <span className="font-mono text-slate-950">{summary.slopeText}</span> score/assessment
        </span>
        <span>
          Points: <span className="font-mono text-slate-950">{summary.pointCount}</span>
        </span>
      </div>
    </div>
  );
}

function DropWeekNote({ count }) {
  return (
    <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
      Red markers identify {count} week{count === 1 ? "" : "s"} where clicks fell below half of the recent rolling average.
    </div>
  );
}

function buildTrendSummary(chartData, lines, config) {
  if (!Array.isArray(chartData) || chartData.length < 2) return null;
  if (!Array.isArray(lines) || lines.length !== 1) return null;

  const dataKey = lines[0]?.dataKey;
  if (!dataKey) return null;

  const points = chartData
    .map((row) => ({
      x: Number(row?.x),
      y: Number(row?.[dataKey]),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (points.length < 2) return null;

  const stats = linearRegression(points);
  if (!stats) return null;

  const threshold = resolveSlopeThreshold(config);
  const label = stats.slope > threshold
    ? "improving"
    : stats.slope < -threshold
      ? "declining"
      : "mostly stable";

  return {
    label,
    slopeText: formatSigned(stats.slope),
    pointCount: points.length,
  };
}

function linearRegression(points) {
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  const varianceX = points.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0);
  if (varianceX === 0) return null;

  const covariance = points.reduce(
    (sum, p) => sum + (p.x - meanX) * (p.y - meanY),
    0
  );
  return { slope: covariance / varianceX };
}

function resolveSlopeThreshold(config) {
  const configured = Number(config?.trend_slope_threshold);
  return Number.isFinite(configured) ? Math.abs(configured) : 0.05;
}

function formatSigned(value) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function spreadReferenceLineLabels(referenceLines) {
  const sorted = referenceLines
    .map((line, index) => ({ ...line, index, labelDy: 0 }))
    .sort((a, b) => Number(a.y) - Number(b.y));

  const clusters = [];
  for (const line of sorted) {
    const current = clusters[clusters.length - 1];
    const isNearCurrent = current
      && Math.abs(Number(line.y) - Number(current[current.length - 1].y)) <= 4;

    if (isNearCurrent) {
      current.push(line);
    } else {
      clusters.push([line]);
    }
  }

  for (const cluster of clusters) {
    if (cluster.length <= 1) continue;
    const offsets = cluster.length === 2
      ? [-12, 10]
      : cluster.map((_, index) => (index - (cluster.length - 1) / 2) * 14);

    cluster.forEach((line, index) => {
      line.labelDy = offsets[index];
    });
  }

  return sorted.sort((a, b) => a.index - b.index);
}

function EmptyChart({ message }) {
  return (
    <div className="flex items-center justify-center h-[380px] text-slate-400 text-sm">
      {message}
    </div>
  );
}
