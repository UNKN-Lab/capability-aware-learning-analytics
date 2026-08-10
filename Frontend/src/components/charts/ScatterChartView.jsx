/**
 * ScatterChartView.jsx — Pure Recharts scatter chart rendering.
 * Supports single and colored (multi-series) scatter.
 */

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ZAxis, ReferenceLine,
} from "recharts";

import { getStableColor } from "../../utils/colorUtils";

export default function ScatterChartView({ data, config }) {
  const { series, xKey, yKey, stats, trendLine } = data;

  if (!series || series.length === 0) {
    return (
      <div className="flex items-center justify-center h-[380px] text-slate-400 text-sm">
        No data to display
      </div>
    );
  }

  const allPoints = series.flatMap((item) => item.data ?? []);
  const minX = allPoints.length ? Math.min(...allPoints.map((point) => point.x)) : null;
  const maxX = allPoints.length ? Math.max(...allPoints.map((point) => point.x)) : null;
  const minY = allPoints.length ? Math.min(...allPoints.map((point) => point.y)) : null;
  const maxY = allPoints.length ? Math.max(...allPoints.map((point) => point.y)) : null;
  const showZeroDelayLine = config?.x_field === "submission_delay_days" && minX !== null && minX <= 0 && maxX >= 0;
  const xDomain = getScatterXDomain(config, minX, maxX);
  const xTicks = getScatterXTicks(config, xDomain);
  const yDomain = getScatterYDomain(config, minY, maxY);
  const yTicks = getScatterYTicks(config, yDomain);
  const isBoundedContextScatter = isBoundedContextField(config?.x_field);

  return (
    <div className="space-y-3" style={{ minHeight: 380, width: "100%" }}>
      {series.length > 1 && <ScatterLegend series={series} hasTrend={Boolean(trendLine)} />}
      <ResponsiveContainer width="100%" height={380}>
      <ScatterChart margin={{ top: 16, right: 44, bottom: 38, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey={xKey}
          type="number"
          name={config.x_label || config.x_field}
          domain={xDomain}
          ticks={xTicks}
          axisLine={{ stroke: "#64748b" }}
          tickLine={isBoundedContextScatter ? false : { stroke: "#64748b" }}
          tick={{ fontSize: 12, fill: "#64748b" }}
          label={config.x_label ? { value: config.x_label, position: "insideBottom", offset: -12, fontSize: 12, fill: "#94a3b8" } : undefined}
        />
        <YAxis
          dataKey={yKey}
          type="number"
          name={config.y_label || config.y_field}
          domain={yDomain}
          ticks={yTicks}
          tickFormatter={(value) => formatScatterAxisTick(value, config?.y_field)}
          axisLine={{ stroke: "#64748b" }}
          tickLine={isBoundedContextScatter ? false : { stroke: "#64748b" }}
          tick={{ fontSize: 12, fill: "#64748b" }}
          label={config.y_label ? { value: config.y_label, angle: -90, position: "insideLeft", fontSize: 12, fill: "#94a3b8" } : undefined}
        />
        {showZeroDelayLine && (
          <ReferenceLine
            x={0}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            label={{ value: "Due date", position: "top", fill: "#64748b", fontSize: 11 }}
          />
        )}
        <ZAxis range={[40, 400]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        {series.map((s) => (
          <Scatter
            key={s.name}
            name={s.name}
            data={s.data}
            fill={getScatterColor(s.name)}
            fillOpacity={s.name === "Classmate" ? 0.68 : 1}
            shape={s.name === "Selected student" ? renderSelectedPoint : renderClassmatePoint}
            isAnimationActive={false}
          />
        ))}
        {trendLine && (
          <Scatter
            name="Trend"
            data={trendLine}
            line={{ stroke: "#f97316", strokeWidth: 2 }}
            shape={() => null}
            fill="#f97316"
            isAnimationActive={false}
          />
        )}
      </ScatterChart>
      </ResponsiveContainer>
      {stats && (
        <ScatterInsight stats={stats} xField={config?.x_field} minX={minX} maxX={maxX} />
      )}
      {getScatterCaution(config?.x_field)}
    </div>
  );
}

function ScatterLegend({ series, hasTrend }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-700">
      {series.map((item) => (
        <span key={item.name} className="inline-flex items-center gap-1.5">
          <span
            className={item.name === "Selected student" ? "h-3 w-3 rounded-full border-2 border-white shadow-sm" : "h-3 w-3 rounded-full opacity-70"}
            style={{ backgroundColor: getScatterColor(item.name) }}
          />
          {item.name}
        </span>
      ))}
      {hasTrend && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-7 rounded-full bg-orange-500" />
          Trend
        </span>
      )}
    </div>
  );
}

function renderClassmatePoint(props) {
  const { cx, cy, fill, fillOpacity } = props;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={fill}
      fillOpacity={fillOpacity}
    />
  );
}

function renderSelectedPoint(props) {
  const { cx, cy, fill } = props;
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="#ffffff" stroke={fill} strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={4.5} fill={fill} />
    </g>
  );
}

function ScatterInsight({ stats, xField, minX, maxX }) {
  const isLateness = xField === "submission_delay_days";
  const isRegistrationTiming = xField === "registration_lead_time";
  const isLifestyleRisk = xField === "lifestyle_risk_score";
  const isSocialBalance = xField === "social_balance_score";
  const isFamilyStability = xField === "family_stability_score";
  const usesPerTenthUnit = isLifestyleRisk || isSocialBalance || isFamilyStability;
  const slopeText = stats.slope === null
    ? "n/a"
    : usesPerTenthUnit
      ? formatSigned(stats.slope * 0.1)
      : formatSigned(stats.slope);
  const correlationText = stats.correlation === null ? "n/a" : stats.correlation.toFixed(2);
  const interpretation = getInterpretation(stats, { isLateness, isRegistrationTiming });
  const slopeUnit = getSlopeUnit(xField);
  const observedDelta = usesPerTenthUnit
    && stats.slope !== null
    && Number.isFinite(minX)
    && Number.isFinite(maxX)
    ? stats.slope * (maxX - minX)
    : null;
  const perUnitLabel = isLifestyleRisk
    ? "Per +0.1 risk"
    : isSocialBalance
      ? "Per +0.1 social balance"
      : isFamilyStability
        ? "Per +0.1 family stability"
      : "Slope";
  const perUnitTitle = isLifestyleRisk
    ? "Estimated score change for a 0.1 increase in lifestyle risk, based on the fitted cohort trendline."
    : isSocialBalance
      ? "Estimated score change for a 0.1 increase in social balance score, based on the fitted cohort trendline."
      : isFamilyStability
        ? "Estimated score change for a 0.1 increase in family stability score, based on the fitted cohort trendline."
      : undefined;
  const rangeNote = isLifestyleRisk
    ? "risk range"
    : isSocialBalance
      ? "social balance range"
      : isFamilyStability
        ? "family stability range"
      : "range";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Trend: <span className="font-semibold text-slate-900">{interpretation}</span>
        </span>
        <span>
          Correlation: <span className="font-mono text-slate-900">{correlationText}</span>
        </span>
        <span
          title={
            perUnitTitle
          }
        >
          {perUnitLabel}: <span className="font-mono text-slate-900">{slopeText}</span> {slopeUnit}
        </span>
        {observedDelta !== null && (
          <span
            title={`Estimated score change across the actual cohort ${rangeNote} in this chart (${formatCompactDecimal(minX)} to ${formatCompactDecimal(maxX)}), not across the full 0-1 scale.`}
          >
            Actual cohort range delta: <span className="font-mono text-slate-900">{formatSigned(observedDelta)}</span> score
          </span>
        )}
        <span>
          Points: <span className="font-mono text-slate-900">{stats.count}</span>
        </span>
      </div>
      {observedDelta !== null && (
        <div className="mt-1 text-[11px] leading-4 text-slate-500">
          Delta uses the actual cohort {rangeNote} shown here ({formatCompactDecimal(minX)}-{formatCompactDecimal(maxX)}), not the full 0-1 scale.
        </div>
      )}
    </div>
  );
}

function getInterpretation(stats, { isLateness, isRegistrationTiming }) {
  if (stats.slope === null || stats.correlation === null) {
    return "not enough variation";
  }
  if (stats.count < 10) {
    return "not enough data to determine trend";
  }
  const direction = stats.correlation < 0 ? "negative" : "positive";
  const absCorrelation = Math.abs(stats.correlation);
  const strength = absCorrelation >= 0.7 ? "strong" : absCorrelation >= 0.4 ? "moderate" : "weak";

  if (absCorrelation < 0.2) {
    return "no clear relationship";
  }
  if (isLateness && direction === "negative") {
    return `${strength} pattern: later submissions align with lower scores in this sample`;
  }
  if (isLateness && direction === "positive") {
    return `${strength} pattern: later submissions align with higher scores in this sample`;
  }
  if (isRegistrationTiming && direction === "positive") {
    return `${strength} pattern: longer lead time aligns with higher scores in this cohort`;
  }
  if (isRegistrationTiming && direction === "negative") {
    return `${strength} pattern: longer lead time aligns with lower scores in this cohort`;
  }
  return `${strength} ${direction} relationship`;
}

function getScatterColor(name) {
  if (name === "Selected student") return "#f97316";
  if (name === "Classmate") return "#3b82f6";
  const key = String(name ?? "").trim().toLowerCase();
  const semanticColors = {
    distinction: "#8b5cf6",
    pass: "#f97316",
    fail: "#10b981",
    withdrawn: "#64748b",
    very_low: "#7c3aed",
    low: "#14b8a6",
    medium: "#ec4899",
    high: "#06b6d4",
  };
  if (semanticColors[key]) return semanticColors[key];
  return getStableColor(name);
}

function getSlopeUnit(xField) {
  const field = String(xField || "");
  if (field === "active_days") return "score/day";
  if (field === "registration_lead_time") return "score/day";
  if (field === "submission_delay_days") return "score/day";
  if (field === "engagement_score") return "score/unit";
  if (field === "lifestyle_risk_score") return "score";
  if (field === "social_balance_score") return "score";
  if (field === "family_stability_score") return "score";
  return "score/unit";
}

function getScatterXDomain(config, minX, maxX) {
  if (config?.x_field === "social_balance_score" || config?.x_field === "family_stability_score") {
    return [0, 1];
  }
  if (config?.x_field === "lifestyle_risk_score" && Number.isFinite(minX) && Number.isFinite(maxX)) {
    return buildPaddedDomain(minX, maxX, {
      minBound: 0,
      maxBound: 1,
      minPad: 0.04,
      roundTo: 0.05,
      snapMinAt: 0.1,
    });
  }
  if (config?.x_field === "disadvantage_score") {
    return [0, 1];
  }
  if (config?.x_field === "registration_lead_time") {
    const upper = Number.isFinite(maxX)
      ? Math.max(200, Math.ceil((maxX + 5) / 10) * 10)
      : 200;
    return [0, upper];
  }
  if (config?.x_field === "submission_delay_days" && Number.isFinite(minX) && Number.isFinite(maxX)) {
    if (minX < 0 && maxX > 0) {
      const bound = Math.max(Math.abs(minX), Math.abs(maxX), 1);
      return [-Math.ceil(bound), Math.ceil(bound)];
    }
    const pad = Math.max(1, (maxX - minX) * 0.08);
    return [Math.floor(minX - pad), Math.ceil(maxX + pad)];
  }
  return ["auto", "auto"];
}

function getScatterXTicks(config, domain) {
  if (config?.x_field === "social_balance_score" || config?.x_field === "family_stability_score") {
    return [0, 0.2, 0.4, 0.6, 0.8, 1];
  }
  if (config?.x_field === "lifestyle_risk_score") {
    return buildTicksFromDomain(domain, 4, 2);
  }
  if (config?.x_field === "disadvantage_score") {
    return [0, 0.25, 0.5, 0.75, 1];
  }
  if (config?.x_field !== "submission_delay_days") return undefined;
  const [min, max] = domain;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return undefined;

  if (min < 0 && max > 0 && Math.abs(min) === Math.abs(max)) {
    const half = Math.ceil(max / 2);
    return [min, -half, 0, half, max];
  }

  const step = (max - min) / 4;
  return [min, min + step, min + step * 2, min + step * 3, max]
    .map((tick) => Number(tick.toFixed(1)));
}

function getScatterCaution(xField) {
  if (xField === "family_stability_score") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Family stability score is a sensitive composite context signal. Use the cohort pattern as an association check only; do not label families or infer that family background caused the score.
      </div>
    );
  }
  if (xField === "social_balance_score") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Social balance score is a composite context signal. Use the cohort pattern as an association check, not proof that social habits caused the score.
      </div>
    );
  }
  if (xField === "lifestyle_risk_score") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Lifestyle risk is a composite context signal. Use the cohort pattern as an association check, not proof that habits caused the score.
      </div>
    );
  }
  if (xField !== "disadvantage_score") return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      Disadvantage score is an aggregate context signal. Use this pattern to guide support review, not to label individual students or infer causation.
    </div>
  );
}

function getScatterYDomain(config, minY, maxY) {
  if (
    isBoundedContextField(config?.x_field)
    && (config?.y_field === "avg_score" || config?.y_field === "score_normalized")
    && Number.isFinite(minY)
    && Number.isFinite(maxY)
  ) {
    return buildPaddedDomain(minY, maxY, { minBound: 0, maxBound: 100, minPad: 6, roundTo: 5 });
  }
  if (config?.y_field === "avg_score" || config?.y_field === "score_normalized") {
    return [0, 100];
  }
  if (config?.y_field === "engagement_score") {
    return [0, 0.15];
  }
  return ["auto", "auto"];
}

function getScatterYTicks(config, domain) {
  if (config?.y_field === "engagement_score") {
    return [0, 0.05, 0.1, 0.15];
  }
  if (isBoundedContextField(config?.x_field)) {
    return buildTicksFromDomain(domain, 4, 1);
  }
  return undefined;
}

function isBoundedContextField(field) {
  return ["lifestyle_risk_score", "social_balance_score", "family_stability_score"].includes(String(field || ""));
}

function buildPaddedDomain(minValue, maxValue, { minBound, maxBound, minPad, roundTo, snapMinAt = null }) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return [minBound, maxBound];
  const span = Math.max(maxValue - minValue, roundTo || 1);
  const pad = Math.max(minPad, span * 0.08);
  const paddedLower = minValue - pad;
  const lower = snapMinAt !== null && paddedLower <= snapMinAt
    ? minBound
    : Math.max(minBound, Math.floor(paddedLower / roundTo) * roundTo);
  const upper = Math.min(maxBound, Math.ceil((maxValue + pad) / roundTo) * roundTo);
  if (lower >= upper) return [minBound, maxBound];
  return [Number(lower.toFixed(4)), Number(upper.toFixed(4))];
}

function buildTicksFromDomain(domain, segments, decimals) {
  if (!Array.isArray(domain) || domain.length !== 2) return undefined;
  const [min, max] = domain;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return undefined;
  const step = (max - min) / segments;
  return Array.from({ length: segments + 1 }, (_, index) =>
    Number((min + step * index).toFixed(decimals))
  );
}

function formatScatterAxisTick(value, field) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (field === "engagement_score") {
    return numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  return String(Number(numeric.toFixed(1)));
}

function formatSigned(value) {
  if (!Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  const decimals = abs > 0 && abs < 0.01 ? 4 : 2;
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

function formatCompactDecimal(value) {
  if (!Number.isFinite(value)) return "n/a";
  return Number(value.toFixed(2)).toString();
}
