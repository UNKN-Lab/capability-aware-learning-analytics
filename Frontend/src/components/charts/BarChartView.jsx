/**
 * BarChartView.jsx — Pure Recharts bar chart rendering.
 * Supports grouped and stacked variants via adapted data.
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine, Cell,
} from "recharts";

import { getStableColor } from "../../utils/colorUtils";

export default function BarChartView({ data, config }) {
  const {
    data: chartData,
    xKey,
    bars,
    stacked,
    categoryField,
    valueField,
    categoryLabel,
    valueLabel,
    valueKind,
  } = data;

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[380px] text-slate-400 text-sm">
        No data to display
      </div>
    );
  }

  if (config.__task_id === "S-B03") {
    return <EngagementBenchmarkBarChart rows={chartData} />;
  }

  if (config.__task_id === "A-B01" && config.variant === "histogram") {
    return (
      <PerformanceDistributionHistogram
        rows={chartData}
        categoryLabel={categoryLabel || config.x_label || "Score Range (0-100)"}
        valueLabel={valueLabel || config.y_label || "Number of Students"}
      />
    );
  }

  if (config.__task_id === "S-T03" && Array.isArray(bars) && bars.length > 1) {
    return (
      <PeerComparisonStandardBarChart
        rows={chartData}
        bars={bars}
        categoryLabel={categoryLabel || config.x_label || "Metric"}
        valueLabel={valueLabel || config.y_label || "Value (0-100)"}
        valueKind={valueKind}
      />
    );
  }

  if (config.__task_id === "A-C06" && Array.isArray(bars) && bars.length > 1) {
    return (
      <ResourceUsageComparisonChart
        rows={chartData}
        bars={bars}
        categoryLabel={categoryLabel || config.x_label || "Resource Type"}
        valueLabel={valueLabel || config.y_label || "% of Total Clicks"}
        valueKind={valueKind}
      />
    );
  }

  if (config.__task_id === "A-C02" && Array.isArray(bars) && bars.length > 1) {
    return (
      <EngagementPatternComparisonChart
        rows={chartData}
        bars={bars}
        categoryLabel={categoryLabel || config.x_label || "Student"}
        valueLabel={valueLabel || config.y_label || "Score (0-1)"}
      />
    );
  }

  // config.orientation: "horizontal" means horizontal bars (Recharts layout="vertical")
  // config.orientation: "vertical" means vertical columns (Recharts layout="horizontal")
  const isHorizontalBar = resolveIsHorizontalBar(config, data);
  const rechartsLayout = isHorizontalBar ? "vertical" : "horizontal";
  const categoryDataKey = resolveCategoryDataKey(chartData, categoryField, xKey);
  const resolvedCategoryLabel = categoryLabel || config.x_label;
  const resolvedValueLabel = valueLabel || config.y_label;
  const renderModel = buildRenderModel({
    chartData,
    bars,
    categoryDataKey,
    categoryField,
    valueField,
    isHorizontalBar,
    valueLabel: resolvedValueLabel,
  });
  const showDataLabels = shouldShowDataLabels({
    chartData: renderModel.chartData,
    bars: renderModel.bars,
    isHorizontalBar,
    stacked,
  });
  const hasCategoryLabel = Boolean(resolvedCategoryLabel);
  const hasValueLabel = Boolean(resolvedValueLabel);
  const leftAxisTitle = isHorizontalBar ? resolvedCategoryLabel : resolvedValueLabel;
  const bottomAxisTitle = isHorizontalBar ? resolvedValueLabel : resolvedCategoryLabel;
  const showLeftAxisTitle = Boolean(leftAxisTitle);
  const showBottomAxisTitle = Boolean(bottomAxisTitle) && config.__task_id !== "A-C04";
  const useAngledCategoryTicks =
    !isHorizontalBar &&
    (config.__task_id === "A-C06" || renderModel.chartData.length > 6);
  const showExternalCategoryTicks =
    !isHorizontalBar && renderModel.bars.length > 1 && renderModel.chartData.length <= 6;
  const showExternalLegend = showExternalCategoryTicks;
  const isGroupedVerticalBar = !isHorizontalBar && renderModel.bars.length > 1;
  const isLifestyleContextChart = config.__task_id === "A-C04" && isGroupedVerticalBar;
  const chartHeight = hasCategoryLabel || hasValueLabel ? 400 : 380;
  const chartMargin = isHorizontalBar
    ? {
        top: 5,
        right: showDataLabels ? 52 : 20,
        bottom: 10,
        left: 20,
      }
    : {
        top: showDataLabels ? 24 : 5,
        right: 20,
        bottom: renderModel.bars.length > 1
          ? showExternalCategoryTicks
            ? 54
            : (useAngledCategoryTicks ? 106 : 92)
          : 35,
        left: 20,
      };
  const axisTitleStyle = {
    color: "#475569",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: "16px",
  };

  if (isHorizontalBar && renderModel.bars.length === 1) {
    const horizontalRowsModel = getHorizontalRowsModel(
      config,
      renderModel.chartData,
      renderModel.bars[0].dataKey
    );

    return (
      <HorizontalBarList
        rows={horizontalRowsModel.rows}
        categoryKey={renderModel.categoryDataKey}
        valueKey={renderModel.bars[0].dataKey}
        categoryLabel={resolvedCategoryLabel}
        valueLabel={resolvedValueLabel}
        valueKind={valueKind}
        colorMode={
          config.__task_id === "A-G04"
            ? "fail_rate_risk"
            : config.__task_id === "A-G12"
              ? "failure_dropout_risk"
            : config.__task_id === "A-G06"
              ? "activity_effectiveness"
              : config.__task_id === "A-G07"
                ? "correlation_rank"
                : config.__task_id === "A-G08"
                  ? "demographic_performance"
              : undefined
        }
        footerNote={horizontalRowsModel.footerNote}
      />
    );
  }

  if (!isHorizontalBar && renderModel.bars.length === 1 && config.variant === "signed_delay") {
    return (
      <SignedDelayBarList
        rows={renderModel.chartData}
        categoryKey={renderModel.categoryDataKey}
        valueKey={renderModel.bars[0].dataKey}
        categoryLabel={resolvedCategoryLabel}
        valueLabel={resolvedValueLabel}
        valueKind={valueKind}
      />
    );
  }

  if (!isHorizontalBar && renderModel.bars.length === 1) {
    return (
      <VerticalBarList
        rows={renderModel.chartData}
        categoryKey={renderModel.categoryDataKey}
        valueKey={renderModel.bars[0].dataKey}
        categoryLabel={resolvedCategoryLabel}
        valueLabel={resolvedValueLabel}
        valueKind={valueKind}
      />
    );
  }

  return (
    <div style={{ minHeight: chartHeight + (showBottomAxisTitle ? 22 : 0), width: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isLifestyleContextChart ? "48px minmax(0, 1fr)" : "minmax(0, 1fr)",
          columnGap: isLifestyleContextChart ? 6 : 0,
          minHeight: chartHeight,
          width: "100%",
          overflow: "visible",
        }}
      >
        {isLifestyleContextChart && (
          <LifestyleYAxisRail
            label={leftAxisTitle}
            height={chartHeight}
            top={chartMargin.top}
            bottom={chartMargin.bottom}
          />
        )}
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={renderModel.chartData}
              layout={rechartsLayout}
              margin={{ ...chartMargin, left: isHorizontalBar ? 32 : isLifestyleContextChart ? 8 : isGroupedVerticalBar ? 48 : 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              {isHorizontalBar ? (
                <>
                  <XAxis
                    type="number"
                    domain={getNumericAxisDomain(valueKind, config)}
                    tick={{ fontSize: 12, fill: "#64748b" }}
                  />
                  <YAxis
                    dataKey={renderModel.categoryDataKey}
                    type="category"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    textAnchor="end"
                    tickMargin={8}
                    width={hasCategoryLabel ? 100 : 80}
                    interval={0}
                    label={showLeftAxisTitle ? {
                      value: leftAxisTitle,
                      angle: -90,
                      position: "insideLeft",
                      offset: -20,
                      style: { ...axisTitleStyle, textAnchor: "middle" },
                    } : undefined}
                  />
                </>
              ) : (
                <>
                  <XAxis
                    dataKey={renderModel.categoryDataKey}
                    height={showExternalCategoryTicks ? 80 : useAngledCategoryTicks ? 92 : hasCategoryLabel ? 70 : 60}
                    tick={showExternalCategoryTicks ? false : { fontSize: 11, fill: "#64748b" }}
                    tickFormatter={(value) => formatBarCategoryTick(value, renderModel.categoryDataKey, config)}
                    angle={useAngledCategoryTicks ? -28 : 0}
                    textAnchor={useAngledCategoryTicks ? "end" : "middle"}
                    tickMargin={12}
                    interval={0}
                  />
                  <YAxis
                    type="number"
                    domain={isLifestyleContextChart ? [0, 5] : getNumericAxisDomain(valueKind, config)}
                    ticks={isLifestyleContextChart ? [0, 1, 2, 3, 4, 5] : getNumericAxisTicks(valueKind, config)}
                    tickFormatter={(value) => formatAxisTick(value, valueKind)}
                    tick={isLifestyleContextChart ? { fontSize: 12, fill: "#475569", fontWeight: 600 } : { fontSize: 12, fill: "#475569", fontWeight: 400 }}
                    tickMargin={isLifestyleContextChart ? 12 : 8}
                    width={isLifestyleContextChart ? 1 : isGroupedVerticalBar ? 62 : valueKind === "percent" ? 52 : 48}
                    mirror={isLifestyleContextChart}
                    interval={0}
                    minTickGap={0}
                    allowDecimals={config.__task_id !== "A-C04"}
                    allowDataOverflow={isLifestyleContextChart}
                    axisLine={isLifestyleContextChart ? false : { stroke: "#94a3b8" }}
                    tickLine={isLifestyleContextChart ? false : { stroke: "#94a3b8" }}
                    label={showLeftAxisTitle && !isLifestyleContextChart ? {
                      value: leftAxisTitle,
                      angle: -90,
                      position: "insideLeft",
                      offset: isGroupedVerticalBar ? -6 : 0,
                      style: { ...axisTitleStyle, textAnchor: "middle" },
                    } : undefined}
                  />
                </>
              )}
            {config.variant === "signed_delay" && !isHorizontalBar && (
              <ReferenceLine
                y={0}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{ value: "Due date", position: "insideTopLeft", fill: "#64748b", fontSize: 11 }}
              />
            )}
            <Tooltip
              cursor={{ fill: "rgba(59, 130, 246, 0.08)" }}
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              formatter={(value, name) => [formatBarValue(value, valueKind), name]}
              labelFormatter={(label) => label}
            />
            {renderModel.bars.length > 1 && !showExternalLegend && (
              <Legend
                verticalAlign="bottom"
                height={32}
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              />
            )}
            {renderModel.bars.map((bar, index) => (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                name={bar.name}
                fill={isGroupedVerticalBar ? getGroupedBarColor(bar, index) : getStableColor(bar.dataKey)}
                stackId={stacked ? "stack" : undefined}
                radius={stacked ? 0 : [4, 4, 0, 0]}
                maxBarSize={50}
              >
                {showDataLabels && (
                  <LabelList
                    dataKey={bar.dataKey}
                    content={(props) => renderBarValueLabel(props, isHorizontalBar, valueKind)}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
      {showExternalCategoryTicks && (
        <div
          className="mx-auto -mt-4 grid max-w-[760px] gap-3 px-16 text-center text-xs font-semibold text-slate-600"
          style={{
            gridTemplateColumns: `repeat(${renderModel.chartData.length}, minmax(0, 1fr))`,
          }}
        >
          {renderModel.chartData.map((row, index) => {
            const label = formatBarCategoryTick(
              row?.[renderModel.categoryDataKey],
              renderModel.categoryDataKey,
              config
            );
            return (
              <div key={`${label}-${index}`} className="truncate" title={label}>
                {label}
              </div>
            );
          })}
        </div>
      )}
      {showExternalLegend && (
        <div className="mx-auto mt-3 flex max-w-[760px] flex-wrap items-center justify-center gap-x-4 gap-y-2 px-6 text-xs">
          {renderModel.bars.map((bar, index) => (
            <span
              key={bar.dataKey}
              className="inline-flex items-center gap-1.5"
              style={{ color: getGroupedBarColor(bar, index) }}
            >
              <span
                className="h-3 w-3 shrink-0"
                style={{ backgroundColor: getGroupedBarColor(bar, index) }}
              />
              {bar.name}
            </span>
          ))}
        </div>
      )}
      {showBottomAxisTitle && (
        <div
          style={{
            ...axisTitleStyle,
            marginTop: 4,
            minHeight: 18,
            textAlign: "center",
          }}
          title={bottomAxisTitle}
        >
          {bottomAxisTitle}
        </div>
      )}
    </div>
  );
}

function LifestyleYAxisRail({ label, height, top, bottom }) {
  return (
    <div
      className="relative text-slate-500"
      style={{ height, paddingTop: top, paddingBottom: bottom }}
    >
      {label && (
        <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-xs font-semibold text-slate-700">
          {label}
        </div>
      )}
    </div>
  );
}

function PerformanceDistributionHistogram({ rows, categoryLabel, valueLabel }) {
  const expectedBins = [
    "0-10",
    "10-20",
    "20-30",
    "30-40",
    "40-50",
    "50-60",
    "60-70",
    "70-80",
    "80-90",
    "90-100",
  ];
  const sourceByBucket = new Map(
    rows.map((row) => [
      String(row?.score_bucket ?? row?.__categoryLabel ?? row?.x ?? "").trim(),
      row,
    ])
  );
  const histogramRows = expectedBins.map((bucket) => {
    const source = sourceByBucket.get(bucket) || {};
    const count = Number(source.student_count ?? source.y);
    return {
      ...source,
      score_bucket: bucket,
      student_count: Number.isFinite(count) ? count : 0,
    };
  });
  const noScoreSource = sourceByBucket.get("No score");
  const noScoreCount = Number(noScoreSource?.student_count ?? noScoreSource?.y);
  const scoredCount = histogramRows.reduce((sum, row) => sum + row.student_count, 0);
  const mostCommonBin = histogramRows.reduce(
    (best, row) => (row.student_count > best.student_count ? row : best),
    histogramRows[0] || { score_bucket: "n/a", student_count: 0 }
  );
  const weightedScoreSum = histogramRows.reduce((sum, row) => {
    const bucketAvg = Number(row.avg_score_in_bucket);
    if (!Number.isFinite(bucketAvg)) return sum;
    return sum + bucketAvg * row.student_count;
  }, 0);
  const estimatedAverage = scoredCount > 0 ? weightedScoreSum / scoredCount : null;

  return (
    <div className="w-full pt-2 pb-3">
      <div className="mb-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <HistogramSummaryChip label="Scored students" value={formatCompactNumber(scoredCount)} />
        <HistogramSummaryChip label="Most common range" value={mostCommonBin.score_bucket} />
        <HistogramSummaryChip
          label="No score"
          value={Number.isFinite(noScoreCount) ? formatCompactNumber(noScoreCount) : "0"}
          muted
        />
      </div>

      <div className="h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={histogramRows}
            margin={{ top: 10, right: 24, bottom: 24, left: 32 }}
            barCategoryGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="score_bucket"
              interval={0}
              tick={{ fontSize: 11, fill: "#475569" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#475569" }}
              allowDecimals={false}
              label={{
                value: valueLabel,
                angle: -90,
                position: "insideLeft",
                fill: "#0f172a",
                fontSize: 12,
                fontWeight: 600,
              }}
            />
            <Tooltip
              cursor={{ fill: "rgba(15, 23, 42, 0.06)" }}
              content={<HistogramTooltip />}
            />
            <Bar dataKey="student_count" name="Students" radius={[4, 4, 0, 0]} maxBarSize={72}>
              {histogramRows.map((row) => (
                <Cell
                  key={row.score_bucket}
                  fill={getScoreBucketColor(row.score_bucket)}
                />
              ))}
              <LabelList
                dataKey="student_count"
                position="top"
                formatter={(value) => (Number(value) > 0 ? formatCompactNumber(Number(value)) : "")}
                style={{ fill: "#0f172a", fontSize: 11, fontWeight: 700 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 text-center text-xs font-semibold text-slate-700" title={categoryLabel}>
        {categoryLabel}
        {Number.isFinite(estimatedAverage) && (
          <span className="ml-3 font-medium text-slate-500">
            Estimated avg: {formatDecimal(estimatedAverage)}
          </span>
        )}
      </div>
    </div>
  );
}

function HistogramSummaryChip({ label, value, muted = false }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${muted ? "border-slate-200 bg-slate-50" : "border-blue-100 bg-blue-50"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

function HistogramTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-semibold text-slate-800">{label}</div>
      <div>Students: <span className="font-semibold">{formatCompactNumber(Number(row.student_count || 0))}</span></div>
      {Number.isFinite(Number(row.pct_of_class)) && (
        <div>Class share: <span className="font-semibold">{formatDecimal(Number(row.pct_of_class))}%</span></div>
      )}
      {Number.isFinite(Number(row.avg_score_in_bucket)) && (
        <div>Avg in range: <span className="font-semibold">{formatDecimal(Number(row.avg_score_in_bucket))}</span></div>
      )}
    </div>
  );
}

function getScoreBucketColor(bucket) {
  const lower = Number(String(bucket).split("-")[0]);
  if (!Number.isFinite(lower)) return "#94a3b8";
  if (lower < 40) return "#ef4444";
  if (lower < 70) return "#f59e0b";
  return "#10b981";
}

function PeerComparisonStandardBarChart({ rows, bars, categoryLabel, valueKind = "score" }) {
  const visibleBars = bars.filter((bar) =>
    rows.some((row) => Number.isFinite(Number(row?.[bar.dataKey])))
  );
  const orderedBars = sortPeerComparisonBars(visibleBars);

  return (
    <div className="w-full px-2 pt-1 pb-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {categoryLabel || "Metric"}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {orderedBars.map((bar) => (
            <span key={bar.dataKey} className="inline-flex items-center gap-1.5 text-slate-600">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: getPeerComparisonColor(bar.dataKey) }}
              />
              {bar.name}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row, rowIndex) => {
          const metricName = String(row?.metric_name || row?.__categoryLabel || row?.x || `Metric ${rowIndex + 1}`);
          const unitLabel = getPeerMetricUnitLabel(metricName);

          return (
            <div
              key={`${metricName}-${rowIndex}`}
              className="rounded-lg border border-slate-100 bg-white px-4 py-3"
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800" title={metricName}>
                  {metricName}
                </div>
                <div className="text-[11px] font-medium text-slate-500">{unitLabel}</div>
              </div>

              <div className="space-y-2">
                {orderedBars.map((bar) => {
                  const numericValue = Number(row?.[bar.dataKey]);
                  if (!Number.isFinite(numericValue)) return null;
                  return (
                    <PeerComparisonRow
                      key={bar.dataKey}
                      label={bar.name}
                      value={numericValue}
                      color={getPeerComparisonColor(bar.dataKey)}
                      valueKind={valueKind}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PeerComparisonRow({ label, value, color, valueKind }) {
  const widthPct = Math.min(100, Math.max(0, value));
  return (
    <div
      className="grid items-center gap-3"
      style={{ gridTemplateColumns: "132px minmax(0, 1fr) 52px" }}
    >
      <div className="truncate text-xs font-medium text-slate-500" title={label}>
        {label}
      </div>
      <div className="relative h-3 rounded-full bg-slate-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${widthPct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-right text-xs font-bold text-slate-900">
        {formatBarValue(value, valueKind)}
      </span>
    </div>
  );
}

function sortPeerComparisonBars(bars) {
  const order = ["You", "Cohort benchmark", "Class average"];
  return [...bars].sort((a, b) => {
    const ai = order.indexOf(a.name);
    const bi = order.indexOf(b.name);
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }
    return a.name.localeCompare(b.name);
  });
}

function getPeerComparisonColor(name) {
  if (name === "You") return "#f97316";
  if (name === "Cohort benchmark" || name === "Class average") return "#10b981";
  return getStableColor(name);
}

function getPeerMetricUnitLabel(metricName) {
  const text = String(metricName || "").toLowerCase();
  if (text.includes("percentile")) return "Class rank percentile";
  if (text.includes("score")) return "Normalized score";
  return "Value";
}

function EngagementPatternComparisonChart({ rows, bars, categoryLabel, valueLabel }) {
  const categoryKey = rows.some((row) => row.__categoryLabel !== undefined)
    ? "__categoryLabel"
    : "x";
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full pt-2 pb-3">
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 24, right: 28, bottom: 46, left: 34 }}
            barCategoryGap={28}
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey={categoryKey}
              interval={0}
              tick={{ fontSize: 11, fill: "#334155", fontWeight: 600 }}
              tickMargin={10}
              axisLine={{ stroke: "#94a3b8" }}
              tickLine={{ stroke: "#94a3b8" }}
            />
            <YAxis
              domain={[0, 1]}
              ticks={yTicks}
              tickFormatter={(value) => formatNormalizedTick(value)}
              tick={{ fontSize: 11, fill: "#475569" }}
              tickMargin={8}
              axisLine={{ stroke: "#94a3b8" }}
              tickLine={{ stroke: "#94a3b8" }}
              label={{
                value: valueLabel,
                angle: -90,
                position: "insideLeft",
                fill: "#0f172a",
                fontSize: 12,
                fontWeight: 600,
              }}
            />
            <Tooltip
              cursor={{ fill: "rgba(59, 130, 246, 0.08)" }}
              contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
              formatter={(value, name) => [formatBarValue(value, "normalized_score"), name]}
              labelFormatter={(label) => label}
            />
            {bars.map((bar) => (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                name={bar.name}
                fill={getEngagementComparisonColor(bar.dataKey)}
                radius={[4, 4, 0, 0]}
                maxBarSize={58}
              >
                <LabelList
                  dataKey={bar.dataKey}
                  position="top"
                  formatter={(value) => formatBarValue(value, "normalized_score")}
                  style={{ fill: "#0f172a", fontSize: 11, fontWeight: 700 }}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
        {bars.map((bar) => (
          <span key={bar.dataKey} className="inline-flex items-center gap-1.5 text-slate-600">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: getEngagementComparisonColor(bar.dataKey) }}
            />
            {bar.name}
          </span>
        ))}
      </div>

      <div className="mt-2 text-center text-xs font-semibold text-slate-700" title={categoryLabel}>
        {categoryLabel}
      </div>
    </div>
  );
}

function formatNormalizedTick(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function getEngagementComparisonColor(dataKey) {
  const key = String(dataKey || "").toLowerCase();
  if (key.includes("active")) return "#6366f1";
  if (key.includes("engagement")) return "#06b6d4";
  if (key.includes("click")) return "#ef4444";
  return getStableColor(dataKey);
}

function EngagementBenchmarkBarChart({ rows }) {
  const chartRows = rows.map((row) => ({
    ...row,
    You: Number(row?.You),
    "Class average": Number(row?.["Class average"]),
  }));

  return <EngagementSummaryComparison rows={chartRows} />;
}

function ResourceUsageComparisonChart({
  rows,
  bars,
  categoryLabel,
  valueLabel,
  valueKind = "percent",
}) {
  const visibleBars = bars.filter((bar) =>
    rows.some((row) => Number.isFinite(Number(row?.[bar.dataKey])))
  );
  const chartRows = rows
    .map((row, index) => {
      const values = visibleBars.map((bar) => Number(row?.[bar.dataKey]) || 0);
      return {
        ...row,
        __index: index,
        __total: values.reduce((sum, value) => sum + value, 0),
      };
    })
    .filter((row) => row.__total > 0)
    .sort((a, b) => b.__total - a.__total)
    .slice(0, 9);

  const maxValue = Math.max(
    1,
    ...chartRows.flatMap((row) => visibleBars.map((bar) => Number(row?.[bar.dataKey]) || 0))
  );
  const axisMax = Math.min(100, Math.max(20, Math.ceil(maxValue / 20) * 20));
  const ticks = buildEvenTicks(axisMax, 4);

  if (chartRows.length === 0 || visibleBars.length === 0) {
    return (
      <div className="flex items-center justify-center h-[320px] text-slate-400 text-sm">
        No resource usage data to display
      </div>
    );
  }

  return (
    <div className="w-full pt-2 pb-3">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-3 px-1 text-xs">
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {visibleBars.map((bar, index) => (
            <span key={bar.dataKey} className="inline-flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: getResourceComparisonColor(index) }}
              />
              <span style={{ color: getResourceComparisonColor(index) }}>
                {bar.name || bar.dataKey}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "44px minmax(0, 1fr)" }}>
        <div className="relative h-[330px]">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-slate-500"
              style={{ bottom: `${(tick / axisMax) * 100}%` }}
            >
              {formatAxisTick(tick, valueKind)}
            </span>
          ))}
          <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-90deg] whitespace-nowrap text-xs font-semibold text-slate-700">
            {valueLabel}
          </div>
        </div>

        <div className="min-w-0">
          <div className="relative h-[330px] border-l border-b border-slate-300">
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute left-0 right-0 border-t border-dashed border-slate-200"
                style={{ bottom: `${(tick / axisMax) * 100}%` }}
              />
            ))}

            <div className="absolute inset-x-2 bottom-0 top-0 grid items-end gap-2">
              <div
                className="grid h-full items-end gap-2"
                style={{ gridTemplateColumns: `repeat(${chartRows.length}, minmax(34px, 1fr))` }}
              >
                {chartRows.map((row) => {
                  const label = getResourceUsageLabel(row);
                  return (
                    <div key={`${label}-${row.__index}`} className="flex h-full min-w-0 items-end justify-center gap-1">
                      {visibleBars.map((bar, index) => {
                        const value = Number(row?.[bar.dataKey]) || 0;
                        const heightPct = Math.max(1, Math.min(100, (value / axisMax) * 100));
                        return (
                          <div
                            key={bar.dataKey}
                            className="relative w-full max-w-[34px] rounded-t"
                            style={{
                              height: `${heightPct}%`,
                              backgroundColor: getResourceComparisonColor(index),
                            }}
                            title={`${bar.name || bar.dataKey} - ${label}: ${formatBarValue(value, valueKind)}`}
                          >
                            {value >= axisMax * 0.08 && (
                              <span className="absolute left-1/2 -top-5 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-slate-800">
                                {formatBarValue(value, valueKind)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div
            className="mt-2 grid gap-2 px-2"
            style={{ gridTemplateColumns: `repeat(${chartRows.length}, minmax(34px, 1fr))` }}
          >
            {chartRows.map((row) => {
              const label = getResourceUsageLabel(row);
              return (
                <div
                  key={`${label}-${row.__index}-label`}
                  className="min-w-0 truncate text-center text-[11px] font-medium text-slate-600"
                  title={label}
                >
                  {label}
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-center text-xs font-semibold text-slate-700">
            {categoryLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

function getResourceUsageLabel(row) {
  return formatResourceTypeLabel(
    row?.__categoryLabel ?? row?.resource_type ?? row?.x ?? row?.__categoryRaw ?? "Resource"
  );
}

function formatResourceTypeLabel(value) {
  const text = String(value ?? "").trim();
  const normalized = text.toLowerCase().replace(/[_-]+/g, " ");
  const knownLabels = {
    dataplus: "Dataplus",
    forumng: "Forum",
    homepage: "Homepage",
    oucollaborate: "OU collaborate",
    oucontent: "Content",
    subpage: "Subpage",
    url: "URL",
    quiz: "Quiz",
    resource: "Resource",
    externalquiz: "External quiz",
    page: "Page",
    glossary: "Glossary",
  };

  if (knownLabels[text.toLowerCase()]) return knownLabels[text.toLowerCase()];
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getResourceComparisonColor(index) {
  return index === 0 ? "#10b981" : "#ef4444";
}

function buildEvenTicks(maxValue, segments) {
  const step = maxValue / segments;
  return Array.from({ length: segments + 1 }, (_, index) => Number((step * index).toFixed(2)));
}

function EngagementBenchmarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};
  const value = payload[0]?.value;
  const metricKind = getEngagementMetricKind(row.metric_name);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-semibold text-slate-800">{label}</div>
      <div className="text-orange-600">
        You: {formatBarValue(value, "percent")} of class average
      </div>
      <div className="mt-1 text-slate-600">
        Raw you: {formatEngagementRawValue(row.student_raw_value, metricKind)}
      </div>
      <div className="text-slate-600">
        Raw class avg: {formatEngagementRawValue(row.cohort_raw_value, metricKind)}
      </div>
    </div>
  );
}

function formatEngagementRawValue(value, metricKind) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (metricKind === "score" && Math.abs(numeric) < 1) {
    return numeric.toFixed(4);
  }
  return formatBarValue(numeric, metricKind);
}

function EngagementSummaryComparison({ rows }) {
  return (
    <div className="w-full px-2 pt-1 pb-3">
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
          You
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Class average
        </span>
      </div>

      <div className="space-y-5">
        {rows.map((row, index) => {
          const metricName = String(row?.metric_name || row?.__categoryLabel || `Metric ${index + 1}`);
          const studentValue = Number(row?.student_raw_value);
          const cohortValue = Number(row?.cohort_raw_value);
          const maxValue = Math.max(studentValue, cohortValue, 1);
          const studentWidth = Number.isFinite(studentValue) ? (studentValue / maxValue) * 100 : 0;
          const cohortWidth = Number.isFinite(cohortValue) ? (cohortValue / maxValue) * 100 : 0;
          const valueKind = getEngagementMetricKind(metricName);

          return (
            <div key={`${metricName}-${index}`} className="border-b border-slate-100 pb-4 last:border-b-0">
              <div className="mb-3 text-sm font-semibold text-slate-800" title={metricName}>
                {metricName}
              </div>
              <EngagementComparisonRow
                label="You"
                value={studentValue}
                widthPct={studentWidth}
                colorClass="bg-orange-500"
                valueKind={valueKind}
              />
              <EngagementComparisonRow
                label="Class average"
                value={cohortValue}
                widthPct={cohortWidth}
                colorClass="bg-emerald-500"
                valueKind={valueKind}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EngagementComparisonRow({ label, value, widthPct, colorClass, valueKind }) {
  return (
    <div
      className="grid items-center gap-3 py-1"
      style={{ gridTemplateColumns: "120px minmax(0, 1fr) 72px" }}
    >
      <div className="truncate text-xs font-medium text-slate-600" title={label}>
        {label}
      </div>
      <div className="relative h-3 rounded-full bg-slate-100">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${colorClass}`}
          style={{ width: `${Math.min(100, Math.max(0, widthPct))}%` }}
        />
      </div>
      <span className="text-right text-xs font-bold text-slate-800">
        {formatBarValue(value, valueKind)}
      </span>
    </div>
  );
}

function getEngagementMetricKind(metricName) {
  const text = String(metricName || "").toLowerCase();
  if (/click|day/.test(text)) return "count";
  return "score";
}

function PeerComparisonGroupedBars({ rows, bars, categoryLabel, valueLabel, valueKind = "score" }) {
  const visibleBars = bars.filter((bar) =>
    rows.some((row) => Number.isFinite(Number(row?.[bar.dataKey])))
  );
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className="w-full px-2 pt-1 pb-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold text-slate-500">
          {categoryLabel}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {visibleBars.map((bar) => (
            <span key={bar.dataKey} className="inline-flex items-center gap-1.5 text-slate-600">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: getStableColor(bar.dataKey) }}
              />
              {bar.name}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        {rows.map((row, rowIndex) => {
          const label = String(row?.__categoryLabel || row?.metric_name || row?.x || `Metric ${rowIndex + 1}`);
          return (
            <div
              key={`${label}-${rowIndex}`}
              className="rounded-lg border border-slate-100 bg-white px-4 py-3"
            >
              <div className="mb-2 text-sm font-semibold text-slate-800" title={label}>
                {label}
              </div>
              <div className="space-y-2">
                {visibleBars.map((bar) => {
                  const numericValue = Number(row?.[bar.dataKey]);
                  if (!Number.isFinite(numericValue)) return null;
                  const widthPct = Math.min(100, Math.max(0, numericValue));
                  return (
                    <div
                      key={bar.dataKey}
                      className="grid items-center gap-3"
                      style={{ gridTemplateColumns: "120px minmax(0, 1fr) 44px" }}
                    >
                      <div className="truncate text-xs font-medium text-slate-500" title={bar.name}>
                        {bar.name}
                      </div>
                      <div className="relative h-3 rounded-full bg-slate-100">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: getStableColor(bar.dataKey),
                          }}
                        />
                      </div>
                      <span className="text-right text-xs font-bold text-slate-800">
                        {formatBarValue(numericValue, valueKind)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="grid gap-3" style={{ gridTemplateColumns: "150px minmax(0, 1fr)" }}>
          <div className="text-right text-xs font-semibold text-slate-500">{valueLabel}</div>
          <div className="relative h-5 border-t border-slate-200">
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute top-1 -translate-x-1/2 text-[10px] font-medium text-slate-400"
                style={{ left: `${tick}%` }}
              >
                {tick}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SignedDelayBarList({
  rows,
  categoryKey,
  valueKey,
  categoryLabel,
  valueLabel,
  valueKind,
}) {
  const values = rows
    .map((row) => Number(row?.[valueKey]))
    .filter(Number.isFinite);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const axisMin = niceSignedAxisBound(minValue, "min");
  const axisMax = niceSignedAxisBound(maxValue, "max");
  const range = Math.max(1, axisMax - axisMin);
  const zeroTopPct = ((axisMax - 0) / range) * 100;
  const ticks = buildSignedTicks(axisMin, axisMax);

  return (
    <div className="w-full pt-2 pb-4">
      <div className="grid min-h-[380px] gap-2" style={{ gridTemplateColumns: "42px minmax(0, 1fr)" }}>
        <div className="relative">
          <div
            className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-xs font-semibold text-slate-700"
            title={valueLabel}
          >
            {valueLabel}
          </div>
        </div>

        <div className="min-w-0">
          <div className="relative h-[320px] border-b border-slate-200">
            {ticks.map((tick) => {
              const topPct = ((axisMax - tick) / range) * 100;
              return (
                <div
                  key={tick}
                  className="absolute left-0 right-0 border-t border-dashed border-slate-200"
                  style={{ top: `${topPct}%` }}
                >
                  <span className="absolute -left-2 top-0 -translate-x-full -translate-y-1/2 text-[10px] font-medium text-slate-500">
                    {formatBarValue(tick, valueKind)}
                  </span>
                </div>
              );
            })}

            <div
              className="absolute left-0 right-0 z-10 border-t border-dashed border-slate-500"
              style={{ top: `${zeroTopPct}%` }}
            >
              <span className="absolute right-0 top-1 -translate-y-1/2 rounded bg-white/90 px-1 text-[10px] font-semibold text-slate-500">
                Due date
              </span>
            </div>

            <div className="absolute inset-0 flex gap-3 px-3">
              {rows.map((row, index) => {
                const rawValue = Number(row?.[valueKey]);
                const value = Number.isFinite(rawValue) ? rawValue : 0;
                const barPct = (Math.abs(value) / range) * 100;
                const isLate = value > 0;
                const label = formatSignedDelayCategoryLabel(row, categoryKey, index);
                const topStyle = isLate
                  ? { bottom: `${100 - zeroTopPct}%`, height: `${barPct}%` }
                  : { top: `${zeroTopPct}%`, height: `${barPct}%` };

                return (
                  <div key={`${label}-${index}`} className="relative min-w-0 flex-1">
                    <div
                      className={`absolute left-1/2 w-full max-w-[64px] -translate-x-1/2 rounded ${isLate ? "bg-amber-500" : "bg-blue-500"}`}
                      style={topStyle}
                      title={`${label}: ${formatBarValue(value, valueKind)} days`}
                    >
                      {barPct >= 8 && (
                        <span
                          className={`absolute left-1/2 -translate-x-1/2 text-xs font-bold text-slate-800 ${isLate ? "-top-5" : "-bottom-5"}`}
                        >
                          {formatBarValue(value, valueKind)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex gap-3 px-3">
            {rows.map((row, index) => {
              const label = formatSignedDelayCategoryLabel(row, categoryKey, index);
              return (
                <div
                  key={`${label}-${index}`}
                  className="min-w-0 flex-1 text-center text-[10px] font-semibold text-slate-500"
                  title={label}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 text-center text-xs font-semibold text-slate-700" title={categoryLabel}>
        {categoryLabel}
      </div>
    </div>
  );
}

function HorizontalBarList({
  rows,
  categoryKey,
  valueKey,
  categoryLabel,
  valueLabel,
  valueKind,
  colorMode,
  footerNote,
}) {
  const values = rows
    .map((row) => Number(row?.[valueKey]))
    .filter(Number.isFinite);
  const maxRaw = Math.max(1, ...values);
  const resolvedValueKind = inferHorizontalValueKind(valueKind, valueLabel, maxRaw);
  const usesBoundedPercentScale = ["score", "percent", "rate"].includes(resolvedValueKind);
  const shouldUseDataScaledPercentAxis = resolvedValueKind === "percent"
    && colorMode !== "failure_dropout_risk"
    && maxRaw > 0
    && maxRaw <= 20;
  const isCorrelationRank = colorMode === "correlation_rank";
  const maxValue = isCorrelationRank
    ? 1
    : shouldUseDataScaledPercentAxis
    ? niceAxisMax(maxRaw)
    : usesBoundedPercentScale
      ? 100
      : maxRaw;
  const ticks = isCorrelationRank
    ? [-1, -0.5, 0, 0.5, 1]
    : usesBoundedPercentScale && !shouldUseDataScaledPercentAxis
    ? [0, 25, 50, 75, 100]
    : buildNumericTicks(maxValue);
  const minValue = values.length > 0 ? Math.min(...values) : null;
  const rowGridTemplate = categoryLabel
    ? "28px 76px minmax(0, 1fr)"
    : "86px minmax(0, 1fr)";

  return (
    <div className="w-full pt-2 pb-4">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: rowGridTemplate }}
      >
        {categoryLabel && (
          <div
            className="relative flex items-center justify-center"
            style={{ gridRow: `1 / span ${rows.length}` }}
            title={categoryLabel}
          >
            <span className="absolute -rotate-90 whitespace-nowrap text-xs font-semibold text-slate-700">
              {categoryLabel}
            </span>
          </div>
        )}
        {rows.map((row, index) => {
          const rawValue = Number(row?.[valueKey]);
          const value = Number.isFinite(rawValue) ? rawValue : 0;
          const widthPct = isCorrelationRank
            ? Math.abs(value) * 50
            : Math.min(100, Math.max(0, (value / maxValue) * 100));
          const label = colorMode === "activity_effectiveness"
            ? formatResourceTypeLabel(row?.[categoryKey], index)
            : colorMode === "correlation_rank"
              ? formatCorrelationFeatureLabel(row?.[categoryKey], index)
              : colorMode === "demographic_performance"
                ? formatDemographicGroupLabel(row?.[categoryKey], index)
                : colorMode === "failure_dropout_risk"
                  ? formatDemographicGroupLabel(row?.[categoryKey], index)
            : String(row?.[categoryKey] ?? `Item ${index + 1}`);
          const color = getHorizontalBarColor(value, minValue, valueKind, colorMode, index);

          return (
          <FragmentRow
            key={`${label}-${index}`}
            label={label}
            value={value}
            widthPct={widthPct}
            valueKind={resolvedValueKind}
            color={color}
            emphasizeSmallValue={shouldUseDataScaledPercentAxis}
            diverging={isCorrelationRank}
          />
        );
      })}

        <div />
        {categoryLabel && <div />}
        <div className="relative h-5 border-t border-slate-200">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute top-1 text-[10px] font-medium text-slate-400"
              style={{
                left: `${getHorizontalTickPosition(tick, maxValue, isCorrelationRank)}%`,
                transform: !isCorrelationRank && tick === 0
                  ? "translateX(0)"
                  : !isCorrelationRank && tick === maxValue
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              }}
            >
              {formatBarValue(tick, resolvedValueKind)}
            </span>
          ))}
        </div>
      </div>

      <div
        className="mt-4 grid gap-3 text-xs font-semibold text-slate-700"
        style={{ gridTemplateColumns: rowGridTemplate }}
      >
        <div />
        {categoryLabel && <div />}
        <div className="text-center" title={valueLabel}>{valueLabel}</div>
      </div>
      {footerNote && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {footerNote}
        </div>
      )}
      {colorMode === "activity_effectiveness" && (
        <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-slate-600">
          Highlighted resources are the strongest score-associated activity types in this cohort; differences are small, so treat this as guidance rather than causation.
        </div>
      )}
      {colorMode === "correlation_rank" && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Bars show association with average score, not causation. Positive factors align with higher scores; negative factors align with lower scores.
        </div>
      )}
      {colorMode === "demographic_performance" && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Group averages describe aggregate patterns only; use them to guide support, not to label individual students.
        </div>
      )}
      {colorMode === "failure_dropout_risk" && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Bars combine Fail and Withdrawn outcomes within each demographic group. Use this to prioritise support review, not to infer that background causes outcomes.
        </div>
      )}
    </div>
  );
}

function getHorizontalRowsModel(config, rows, valueKey) {
  if (config.__task_id === "A-G08") {
    const sortedRows = [...rows].sort((a, b) => Number(b?.[valueKey] ?? 0) - Number(a?.[valueKey] ?? 0));
    const topRows = sortedRows.slice(0, 4);
    const bottomRows = sortedRows.slice(-4);
    const seen = new Set();
    const visibleRows = [...topRows, ...bottomRows].filter((row) => {
      const key = String(row?.group_value ?? row?.__categoryLabel ?? row?.x ?? JSON.stringify(row));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const hiddenCount = Math.max(0, rows.length - visibleRows.length);
    return {
      rows: visibleRows,
      footerNote: hiddenCount > 0
        ? `Showing the highest and lowest scoring demographic groups; ${hiddenCount} middle group${hiddenCount === 1 ? "" : "s"} hidden.`
        : null,
    };
  }

  if (config.__task_id === "A-G12") {
    const maxVisibleRows = 8;
    const visibleRows = rows.slice(0, maxVisibleRows);
    const hiddenCount = Math.max(0, rows.length - visibleRows.length);
    return {
      rows: visibleRows,
      footerNote: hiddenCount > 0
        ? `Showing the ${visibleRows.length} highest fail/dropout groups; ${hiddenCount} lower-risk group${hiddenCount === 1 ? "" : "s"} hidden.`
        : null,
    };
  }

  if (config.__task_id !== "A-G04") {
    return { rows };
  }

  const rowsWithValues = rows.map((row) => ({
    row,
    value: Number(row?.[valueKey]),
  }));
  const positiveRows = rowsWithValues
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .map((item) => item.row);
  const zeroRowsCount = rowsWithValues.filter((item) =>
    Number.isFinite(item.value) && item.value <= 0
  ).length;
  const maxVisibleRows = 8;

  if (positiveRows.length === 0) {
    return {
      rows: rows.slice(0, maxVisibleRows),
      footerNote: `No failing submissions found across ${rows.length} assessments.`,
    };
  }

  const visibleRows = positiveRows.slice(0, maxVisibleRows);
  const hiddenPositiveCount = Math.max(0, positiveRows.length - visibleRows.length);
  const hiddenNotes = [];
  if (hiddenPositiveCount > 0) hiddenNotes.push(`${hiddenPositiveCount} lower fail-rate assessment${hiddenPositiveCount === 1 ? "" : "s"}`);
  if (zeroRowsCount > 0) hiddenNotes.push(`${zeroRowsCount} no-fail assessment${zeroRowsCount === 1 ? "" : "s"}`);

  return {
    rows: visibleRows,
    footerNote: hiddenNotes.length > 0
      ? `Showing the highest fail-rate assessments; hidden: ${hiddenNotes.join(", ")}.`
      : null,
  };
}

function getHorizontalBarColor(value, minValue, valueKind, colorMode, index = 0) {
  if (colorMode === "fail_rate_risk") {
    if (value >= 5) return "#ef4444";
    if (value >= 3) return "#f59e0b";
    return "#10b981";
  }
  if (colorMode === "activity_effectiveness") {
    if (index === 0) return "#2563eb";
    if (index <= 2) return "#3b82f6";
    return "#94a3b8";
  }
  if (colorMode === "correlation_rank") {
    if (value > 0) return "#10b981";
    if (value < 0) return "#ef4444";
    return "#94a3b8";
  }
  if (colorMode === "demographic_performance") {
    if (value < 66) return "#f97316";
    if (value < 69) return "#f59e0b";
    return "#3b82f6";
  }
  if (colorMode === "failure_dropout_risk") {
    if (value >= 30) return "#ef4444";
    if (value >= 15) return "#f59e0b";
    return "#10b981";
  }
  if (!["score", "percent", "rate"].includes(valueKind)) return "#3b82f6";
  if (Number.isFinite(minValue) && Math.abs(value - minValue) < 0.0001) {
    return value < 40 ? "#ef4444" : "#f59e0b";
  }
  return "#3b82f6";
}

function getHorizontalTickPosition(tick, maxValue, isDiverging) {
  if (isDiverging) return ((tick + 1) / 2) * 100;
  return Math.min(100, Math.max(0, (tick / maxValue) * 100));
}

function formatCorrelationFeatureLabel(value, index) {
  const text = String(value ?? "").trim();
  if (!text) return `Factor ${index + 1}`;
  const labels = {
    active_days: "Active days",
    disadvantage_score: "Disadvantage score",
    registration_lead_time: "Registration lead time",
    total_clicks: "Total clicks",
  };
  const key = text.toLowerCase();
  if (labels[key]) return labels[key];
  return text.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDemographicGroupLabel(value, index) {
  const text = String(value ?? "").trim();
  if (!text) return `Group ${index + 1}`;
  const rangeMatch = text.match(/^(\d+)\s*-\s*(\d+)%?$/);
  if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]}%`;
  if (/unknown/i.test(text)) return "Unknown";
  return text.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function VerticalBarList({
  rows,
  categoryKey,
  valueKey,
  categoryLabel,
  valueLabel,
  valueKind,
}) {
  const values = rows
    .map((row) => Number(row?.[valueKey]))
    .filter(Number.isFinite);
  const isWeeklyEngagement = /week/i.test(String(categoryLabel || ""))
    && /click/i.test(String(valueLabel || ""));
  const isStudyEffortDistribution = /effort level/i.test(String(categoryLabel || ""));
  const isConsistencyLevelDistribution = /consistency level/i.test(String(categoryLabel || ""));
  const isRiskLevelDistribution = /risk level/i.test(String(categoryLabel || ""));
  const isSubmissionOutcomeDelay = /final outcome/i.test(String(categoryLabel || ""))
    && /late delay/i.test(String(valueLabel || ""));
  const averageValue = values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
  const maxRaw = Math.max(1, ...values);
  const maxValue = isWeeklyEngagement
    ? getWeeklyEngagementAxisMax(maxRaw)
    : niceAxisMax(maxRaw);
  const ticks = buildNumericTicks(maxValue);
  const xLabelStep = Math.max(1, Math.ceil(rows.length / 8));
  const chartBodyHeight = isWeeklyEngagement ? 280 : 320;
  const chartMinHeight = isWeeklyEngagement ? 340 : 380;
  const showValueLabels = rows.length <= 12;

  return (
    <div className="w-full pt-2 pb-4">
      <div className="grid gap-2" style={{ gridTemplateColumns: "28px minmax(0, 1fr)", minHeight: chartMinHeight }}>
        <div className="relative">
          <div
            className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-xs font-semibold text-slate-700"
            title={valueLabel}
          >
            {valueLabel}
          </div>
        </div>

        <div className="min-w-0">
          <div className="relative border-b border-slate-200" style={{ height: chartBodyHeight }}>
            {ticks.map((tick) => {
              const bottomPct = Math.min(100, Math.max(0, (tick / maxValue) * 100));
              return (
                <div
                  key={tick}
                  className="absolute left-0 right-0 border-t border-dashed border-slate-200"
                  style={{ bottom: `${bottomPct}%` }}
                >
                  <span className="absolute -left-1 top-0 -translate-x-full -translate-y-1/2 text-[10px] font-medium text-slate-500">
                    {formatBarValue(tick, valueKind)}
                  </span>
                </div>
              );
            })}

            <div className="absolute inset-0 flex items-end gap-1.5 px-1">
              {rows.map((row, index) => {
                const rawValue = Number(row?.[valueKey]);
                const value = Number.isFinite(rawValue) ? rawValue : 0;
                const heightPct = Math.min(100, Math.max(0, (value / maxValue) * 100));
                const label = formatCategoryAxisLabel(row?.[categoryKey], index);
                const weeklyStatus = isWeeklyEngagement
                  ? getWeeklyEngagementStatus(value, averageValue)
                  : null;
                const fillColor = isWeeklyEngagement
                  ? getWeeklyEngagementBarColor(value, averageValue)
                  : isStudyEffortDistribution
                    ? getStudyEffortBarColor(row?.[categoryKey])
                    : isConsistencyLevelDistribution
                      ? getConsistencyLevelBarColor(row?.[categoryKey])
                      : isRiskLevelDistribution
                        ? getRiskLevelBarColor(row?.[categoryKey])
                        : isSubmissionOutcomeDelay
                          ? getSubmissionOutcomeDelayColor(row?.[categoryKey])
                          : "#3b82f6";
                const title = isWeeklyEngagement
                  ? `${label}: ${formatBarValue(value, valueKind)} clicks (${weeklyStatus.label})`
                  : isConsistencyLevelDistribution
                    ? `${label}: ${formatBarValue(value, valueKind)} students (${getConsistencyLevelRiskLabel(row?.[categoryKey])})`
                  : isSubmissionOutcomeDelay
                    ? `${label}: ${formatBarValue(value, valueKind)} days average late delay (${getSubmissionDelayRiskLabel(value)})`
                    : `${label}: ${formatBarValue(value, valueKind)}`;

                return (
                  <div key={`${label}-${index}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div
                      className="relative w-full rounded-t"
                      style={{ height: `${heightPct}%`, backgroundColor: fillColor }}
                      title={title}
                    >
                      {showValueLabels && value > 0 && (
                        <span className="absolute left-1/2 -top-5 -translate-x-1/2 text-[10px] font-bold text-slate-700">
                          {formatBarValue(value, valueKind)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {isWeeklyEngagement && Number.isFinite(averageValue) && averageValue > 0 && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-dashed border-slate-600"
                style={{ bottom: `${Math.min(100, Math.max(0, (averageValue / maxValue) * 100))}%` }}
              >
                <span className="absolute right-0 -top-5 rounded bg-white/95 px-1 text-[10px] font-semibold text-slate-600 shadow-sm">
                  Avg {formatBarValue(averageValue, valueKind)}
                </span>
              </div>
            )}
            {isSubmissionOutcomeDelay && Number.isFinite(averageValue) && averageValue > 0 && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-dashed border-slate-500"
                style={{ bottom: `${Math.min(100, Math.max(0, (averageValue / maxValue) * 100))}%` }}
              >
                <span className="absolute right-0 -top-5 rounded bg-white/95 px-1 text-[10px] font-semibold text-slate-600 shadow-sm">
                  Group avg {formatBarValue(averageValue, valueKind)}
                </span>
              </div>
            )}
          </div>

          <div className="mt-2 flex gap-1.5 px-1">
            {rows.map((row, index) => {
              const label = formatCategoryAxisLabel(row?.[categoryKey], index);
              const showLabel = isWeeklyEngagement
                ? shouldShowWeeklyEngagementLabel(row?.[categoryKey], index, rows.length)
                : shouldShowVerticalCategoryLabel(index, rows.length, xLabelStep);
              return (
                <div
                  key={`${label}-${index}`}
                  className="min-w-0 flex-1 text-center text-[10px] font-medium text-slate-500"
                  title={label}
                >
                  {showLabel ? label : ""}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 text-center text-xs font-semibold text-slate-700" title={categoryLabel}>
        {categoryLabel}
      </div>
      {isSubmissionOutcomeDelay && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Higher bars mean larger average delay among late submissions; use this with late-submission rate or student count before treating lateness as systemic.
        </div>
      )}
    </div>
  );
}

function inferHorizontalValueKind(valueKind, valueLabel, maxRaw) {
  const label = String(valueLabel || "").toLowerCase();

  if (["score", "percent", "rate"].includes(valueKind)) {
    return valueKind;
  }

  if (valueKind === "normalized_score") {
    return maxRaw > 1 || label.includes("0-100") ? "score" : "normalized_score";
  }

  if (label.includes("0-100") || label.includes("score")) return "score";
  if (label.includes("%") || label.includes("percent")) return "percent";
  if (label.includes("rate")) return "rate";
  return valueKind;
}

function formatCategoryAxisLabel(value, index) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return `Item ${index + 1}`;
  }
  const text = String(value).trim();
  const weekMatch = text.match(/^week\s+(-?\d+)$/i);
  if (weekMatch) return formatWeekAxisLabel(Number(weekMatch[1]));
  if (/^-?\d+$/.test(text)) return formatWeekAxisLabel(Number(text));
  if (isStudyEffortValue(text)) return formatStudyEffortLabel(text);
  if (isRiskLevelValue(text)) return formatRiskLevelLabel(text);
  if (/^[a-z]+(?:_[a-z]+)+$/.test(text)) return formatUnderscoreLabel(text);
  return text;
}

function isStudyEffortValue(value) {
  return ["very_low", "low", "medium", "high"].includes(String(value || "").toLowerCase());
}

function formatStudyEffortLabel(value) {
  const labels = {
    very_low: "Very low",
    low: "Low",
    medium: "Medium",
    high: "High",
  };
  return labels[String(value || "").toLowerCase()] || String(value);
}

function isRiskLevelValue(value) {
  return ["low", "medium", "high"].includes(String(value || "").toLowerCase());
}

function formatRiskLevelLabel(value) {
  const text = String(value || "").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatUnderscoreLabel(value) {
  const text = String(value || "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatWeekAxisLabel(weekNumber) {
  if (weekNumber < 0) return "Pre-course";
  return `W${weekNumber}`;
}

function getWeeklyEngagementAxisMax(maxRaw) {
  if (!Number.isFinite(maxRaw) || maxRaw <= 0) return 10;
  return Math.max(10, Math.ceil((maxRaw * 1.12) / 10) * 10);
}

function getWeekNumberFromAxisValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const text = String(value).trim();
  const weekMatch = text.match(/^week\s+(-?\d+)$/i);
  if (weekMatch) return Number(weekMatch[1]);
  if (/^-?\d+$/.test(text)) return Number(text);
  const labelMatch = text.match(/^W(-?\d+)$/i);
  if (labelMatch) return Number(labelMatch[1]);
  if (/pre[-\s]?course/i.test(text)) return -1;
  return null;
}

function shouldShowWeeklyEngagementLabel(value, index, rowCount) {
  if (index === 0 || index === rowCount - 1) return true;

  const weekNumber = getWeekNumberFromAxisValue(value);
  if (Number.isFinite(weekNumber)) {
    if (weekNumber < 0) return true;
    return weekNumber > 0 && weekNumber % 5 === 0;
  }

  return false;
}

function getWeeklyEngagementStatus(value, averageValue) {
  if (!Number.isFinite(value) || !Number.isFinite(averageValue) || averageValue <= 0) {
    return { level: "unknown", label: "unknown" };
  }
  if (value <= averageValue * 0.25) return { level: "low", label: "low engagement" };
  if (value <= averageValue * 0.5) return { level: "medium", label: "below average" };
  return { level: "high", label: "active" };
}

function getWeeklyEngagementBarColor(value, averageValue) {
  const status = getWeeklyEngagementStatus(value, averageValue);
  if (status.level === "low") return "#ef4444";
  if (status.level === "medium") return "#f59e0b";
  return "#3b82f6";
}

function getStudyEffortBarColor(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const colors = {
    very_low: "#ef4444",
    low: "#f97316",
    medium: "#f59e0b",
    high: "#10b981",
  };
  return colors[normalized] || "#3b82f6";
}

function getConsistencyLevelBarColor(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const colors = {
    high: "#10b981",
    medium: "#f59e0b",
    low: "#ef4444",
  };
  return colors[normalized] || "#3b82f6";
}

function getConsistencyLevelRiskLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high") return "consistent study pattern";
  if (normalized === "medium") return "mixed study pattern";
  if (normalized === "low") return "cramming risk";
  return "unclassified";
}

function getRiskLevelBarColor(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const colors = {
    high: "#ef4444",
    medium: "#f59e0b",
    low: "#10b981",
  };
  return colors[normalized] || "#3b82f6";
}

function getSubmissionOutcomeDelayColor(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const colors = {
    fail: "#ef4444",
    withdrawn: "#f97316",
    pass: "#10b981",
    distinction: "#14b8a6",
  };
  return colors[normalized] || "#3b82f6";
}

function getSubmissionDelayRiskLabel(value) {
  if (value >= 10) return "high delay";
  if (value >= 7) return "moderate delay";
  if (value > 0) return "lower delay";
  return "no late delay";
}

function formatSignedDelayCategoryLabel(row, categoryKey, index) {
  const assessmentName = String(row?.assessment_name ?? "").trim();
  if (assessmentName && !Number.isFinite(Number(assessmentName))) {
    return assessmentName;
  }

  const assessmentType = String(row?.assessment_type ?? "").trim();
  const displayType = assessmentType && !Number.isFinite(Number(assessmentType))
    ? assessmentType
    : "Assessment";

  const rawAssessmentOrder = Number(row?.assessment_order);
  if (Number.isFinite(rawAssessmentOrder)) return `${displayType} ${rawAssessmentOrder}`;

  const rawLabel = row?.[categoryKey];
  const match = String(rawLabel ?? "").match(/assessment\s+(-?\d+)/i);
  if (match) return `${displayType} ${match[1]}`;

  return formatCategoryAxisLabel(rawLabel, index);
}

function shouldShowVerticalCategoryLabel(index, length, step) {
  if (length <= 8) return true;
  if (index === 0 || index === length - 1) return true;
  if (index % step !== 0) return false;
  return length - 1 - index >= Math.max(2, Math.floor(step / 2));
}

function FragmentRow({
  label,
  value,
  widthPct,
  valueKind,
  color = "#3b82f6",
  emphasizeSmallValue = false,
  diverging = false,
}) {
  const labelLeftPct = emphasizeSmallValue
    ? Math.min(98, Math.max(widthPct + 1.5, 7))
    : diverging
      ? value >= 0
        ? 50 + widthPct
        : 50 - widthPct
      : widthPct;
  const barLeftPct = diverging && value < 0 ? 50 - widthPct : diverging ? 50 : 0;
  const labelTranslate = diverging && value < 0 ? "-translate-x-full -ml-2" : "";
  const labelTextClass = "text-slate-700";

  return (
    <>
      <div className="min-w-0 truncate pr-3 text-right text-xs font-semibold text-slate-600" title={label}>
        {label}
      </div>
      <div className="relative h-8 rounded bg-slate-50">
        <div
          className="absolute inset-y-0 left-0 rounded"
          style={{ left: `${barLeftPct}%`, width: `${widthPct}%`, backgroundColor: color }}
        />
        {diverging && (
          <span className="absolute inset-y-0 left-1/2 border-l border-slate-300" aria-hidden="true" />
        )}
        <span
          className={`absolute top-1/2 -translate-y-1/2 pl-2 text-xs font-bold ${labelTextClass} ${labelTranslate}`}
          style={{ left: `${labelLeftPct}%` }}
        >
          {formatBarValue(value, valueKind)}
        </span>
      </div>
    </>
  );
}

function buildNumericTicks(maxValue) {
  const step = maxValue / 4;
  return [0, step, step * 2, step * 3, maxValue].map((tick) => Number(tick.toFixed(1)));
}

function buildSignedTicks(minValue, maxValue) {
  if (minValue < 0 && maxValue > 0) return [minValue, 0, maxValue];
  if (maxValue <= 0) return [minValue, minValue / 2, 0];
  return [0, maxValue / 2, maxValue].map((tick) => Number(tick.toFixed(1)));
}

function niceSignedAxisBound(value, direction) {
  if (!Number.isFinite(value) || value === 0) return direction === "min" ? -1 : 1;
  const abs = Math.abs(value);
  const magnitude = 10 ** Math.floor(Math.log10(abs));
  const normalized = abs / magnitude;
  const niceNormalized = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const nice = niceNormalized * magnitude;
  return direction === "min" ? -nice : nice;
}


function niceAxisMax(value) {
  if (value <= 10) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function shouldShowDataLabels({ chartData, bars, isHorizontalBar, stacked }) {
  if (stacked) return false;
  const seriesCount = bars.length;
  if (seriesCount > 1) return chartData.length * seriesCount <= 16;
  if (isHorizontalBar) return chartData.length <= 20;
  return chartData.length <= 12;
}

function buildRenderModel({
  chartData,
  bars,
  categoryDataKey,
  categoryField,
  valueField,
  isHorizontalBar,
  valueLabel,
}) {
  if (!isHorizontalBar || bars.length > 1) {
    return { chartData, bars, categoryDataKey };
  }

  const valueKey = resolveHorizontalValueKey(chartData, bars, valueField);
  if (!valueKey) {
    return { chartData, bars, categoryDataKey };
  }

  const sourceBar = bars[0] || { dataKey: valueKey, name: valueLabel || valueField || valueKey };
  const resolvedLabels = chartData.map((row, index) =>
    resolveHorizontalCategoryLabel(row, {
      categoryDataKey,
      categoryField,
      index,
    })
  );
  const labelCounts = countLabels(resolvedLabels);
  const normalizedData = chartData.map((row, index) => ({
    ...row,
    __barCategory: uniquifyHorizontalCategoryLabel(
      resolvedLabels[index],
      row,
      index,
      labelCounts
    ),
    __barValue: row?.[valueKey],
  }));

  return {
    chartData: normalizedData,
    bars: [{ ...sourceBar, dataKey: "__barValue", name: valueLabel || sourceBar.name }],
    categoryDataKey: "__barCategory",
  };
}

function resolveHorizontalValueKey(chartData, bars, valueField) {
  const candidateKeys = [
    valueField,
    "y",
    "avg_score",
    "score_normalized",
    "fail_rate_pct",
    "pct_of_class",
    "pass_rate",
    bars[0]?.dataKey,
  ].filter(Boolean);

  return candidateKeys.find((key) =>
    chartData.some((row) => Number.isFinite(Number(row?.[key])))
  );
}

function resolveHorizontalCategoryLabel(row, { categoryDataKey, categoryField, index }) {
  const assessmentProxyLabel = resolveAssessmentProxyLabel(row);
  if (assessmentProxyLabel) return assessmentProxyLabel;

  const candidateKeys = [
    categoryDataKey,
    "__categoryLabel",
    categoryField,
    "competency_tag",
    "assessment_name",
    "assessment_type",
    "assessment_order",
    "resource_type",
    "final_outcome",
    "student_id",
    "class_id",
    "x",
  ].filter(Boolean);

  for (const key of candidateKeys) {
    const value = row?.[key];
    if (value === null || value === undefined) continue;
    const label = String(value).trim();
    if (!label || Number.isFinite(Number(label))) continue;
    return label;
  }

  return `Item ${index + 1}`;
}

function resolveAssessmentProxyLabel(row) {
  const order = Number(row?.assessment_order);
  if (!Number.isFinite(order)) return null;

  const assessmentType = String(row?.assessment_type ?? "").trim();
  const assessmentName = String(row?.assessment_name ?? "").trim();
  const competencyTag = String(row?.competency_tag ?? "").trim();
  const displayType = getNonNumericLabel(assessmentType)
    || getNonNumericLabel(assessmentName)
    || getNonNumericLabel(competencyTag)
    || "Assessment";

  if (
    getNonNumericLabel(competencyTag)
    && assessmentType
    && competencyTag.toLowerCase() !== assessmentType.toLowerCase()
  ) {
    return competencyTag;
  }

  return `${displayType} ${order}`;
}

function getNonNumericLabel(value) {
  const label = String(value ?? "").trim();
  if (!label || Number.isFinite(Number(label))) return null;
  return label;
}

function countLabels(labels) {
  return labels.reduce((counts, label) => {
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
}

function uniquifyHorizontalCategoryLabel(label, row, index, labelCounts) {
  if ((labelCounts[label] || 0) <= 1) return label;

  const order = Number(row?.assessment_order);
  if (Number.isFinite(order)) {
    const type = String(row?.assessment_type || label || "Assessment").trim();
    return `${type} ${order}`;
  }

  return `${label} ${index + 1}`;
}

function resolveIsHorizontalBar(config, data) {
  if (config.orientation === "horizontal" || config.layout === "vertical") return true;
  if (config.orientation === "vertical" || config.layout === "horizontal") return false;

  const roles = config.semantic_roles || {};
  const categoryField = data?.categoryField || config.x_field;
  const valueField = data?.valueField || config.y_field;
  const xLooksCategorical = roles.x === "category" || isCategoricalField(categoryField);
  const yLooksNumeric = roles.y === "performance_metric" || isNumericMetricField(valueField);

  return xLooksCategorical && yLooksNumeric;
}

function isCategoricalField(field) {
  return /(category|competency|assessment|student|outcome|label|type|group|band|region)/i.test(String(field || ""));
}

function isNumericMetricField(field) {
  return /(score|rate|pct|percent|count|total|avg|average|days?|click|risk|delta|value)/i.test(String(field || ""));
}

function resolveCategoryDataKey(chartData, categoryField, xKey) {
  if (
    chartData.some((row) => row.__categoryLabel !== undefined)
    && !hasMostlyNumericLabels(chartData, "__categoryLabel")
  ) {
    return "__categoryLabel";
  }
  if (
    categoryField
    && chartData.some((row) => row[categoryField] !== undefined)
    && !hasMostlyNumericLabels(chartData, categoryField)
  ) {
    return categoryField;
  }
  const fallbackKey = findTextCategoryKey(chartData);
  if (fallbackKey) return fallbackKey;
  return xKey;
}

function hasMostlyNumericLabels(chartData, key) {
  const values = chartData
    .map((row) => row?.[key])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "");

  if (values.length === 0) return false;
  const numericCount = values.filter((value) => Number.isFinite(Number(value))).length;
  return numericCount / values.length >= 0.8;
}

function findTextCategoryKey(chartData) {
  const candidateKeys = [
    "competency_tag",
    "assessment_name",
    "assessment_type",
    "resource_type",
    "final_outcome",
    "student_id",
    "class_id",
    "x",
  ];

  return candidateKeys.find((key) =>
    chartData.some((row) => {
      const value = row?.[key];
      if (value === null || value === undefined) return false;
      const text = String(value).trim();
      return text !== "" && !Number.isFinite(Number(text));
    })
  );
}

function getNumericAxisDomain(valueKind, config) {
  if (config?.__task_id === "A-C04") {
    return [0, 5];
  }
  if (valueKind === "normalized_score") {
    return [0, 1];
  }
  if (["score", "percent", "rate"].includes(valueKind)) {
    return [0, 100];
  }
  return [0, "auto"];
}

function getNumericAxisTicks(valueKind, config) {
  if (config?.__task_id === "A-C04") {
    return [0, 1, 2, 3, 4, 5];
  }
  if (valueKind === "normalized_score") {
    return [0, 0.25, 0.5, 0.75, 1];
  }
  if (valueKind === "percent") {
    return [0, 20, 40, 60, 80, 100];
  }
  return undefined;
}

function formatAxisTick(value, valueKind) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (valueKind === "percent") return `${Number(numeric.toFixed(0))}%`;
  if (valueKind === "rate") return `${Number(numeric.toFixed(0))}%`;
  if (valueKind === "normalized_score") return numeric.toFixed(2).replace(/\.?0+$/, "");
  return String(Number(numeric.toFixed(1)));
}

function formatBarCategoryTick(value, categoryKey, config) {
  const text = String(value ?? "").trim();
  const categoryField = String(categoryKey || config?.x_field || "").toLowerCase();
  if (/student/.test(categoryField) && /^\d+$/.test(text)) {
    return `Student ${text}`;
  }
  return text;
}

function getGroupedBarColor(bar, index) {
  const name = String(bar?.name || bar?.dataKey || "").toLowerCase();
  const lifestyleColors = {
    weekday_alcohol: "#f97316",
    "weekday alcohol": "#f97316",
    weekend_alcohol: "#06b6d4",
    "weekend alcohol": "#06b6d4",
    go_out_frequency: "#8b5cf6",
    "go out frequency": "#8b5cf6",
    health_status: "#ef4444",
    "health status": "#ef4444",
    free_time: "#14b8a6",
    "free time": "#14b8a6",
  };
  if (lifestyleColors[name]) return lifestyleColors[name];

  const groupedPalette = [
    "#f97316",
    "#06b6d4",
    "#8b5cf6",
    "#ef4444",
    "#14b8a6",
    "#3b82f6",
    "#10b981",
    "#f59e0b",
  ];
  return groupedPalette[index % groupedPalette.length];
}

function renderBarValueLabel(props, isHorizontalBar, valueKind) {
  const { x, y, width, height, value } = props;
  if (value === null || value === undefined) return null;

  const numericWidth = Number(width);
  const numericHeight = Number(height);
  if (isHorizontalBar && numericWidth < 24) return null;
  if (!isHorizontalBar && numericHeight < 14) return null;

  const text = formatBarValue(value, valueKind);
  if (isHorizontalBar) {
    return (
      <text
        x={Number(x) + numericWidth + 6}
        y={Number(y) + numericHeight / 2}
        dy={4}
        fill="#334155"
        fontSize={11}
        fontWeight={600}
        textAnchor="start"
      >
        {text}
      </text>
    );
  }

  return (
    <text
      x={Number(x) + numericWidth / 2}
      y={Number(value) < 0 ? Number(y) + numericHeight + 12 : Number(y) - 6}
      fill="#334155"
      fontSize={11}
      fontWeight={600}
      textAnchor="middle"
    >
      {text}
    </text>
  );
}

function formatBarValue(value, valueKind = "number") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  if (valueKind === "count") {
    return formatCompactNumber(Math.round(numeric));
  }

  if (valueKind === "percent") {
    return `${formatPercentDecimal(numeric)}%`;
  }

  if (valueKind === "rate") {
    const percentValue = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
    return `${formatDecimal(percentValue)}%`;
  }

  if (valueKind === "normalized_score") {
    return numeric.toFixed(2);
  }

  if (valueKind === "score" || valueKind === "days") {
    return formatDecimal(numeric);
  }

  return Math.abs(numeric) >= 1000 ? formatCompactNumber(numeric) : formatDecimal(numeric);
}

function formatCompactNumber(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${formatDecimal(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${formatDecimal(value / 1_000)}K`;
  return String(value);
}

function formatDecimal(value) {
  return Number(value.toFixed(1)).toString();
}

function formatPercentDecimal(value) {
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.1) return value.toFixed(2);
  if (abs > 0 && abs < 1) return value.toFixed(1);
  return Number(value.toFixed(1)).toString();
}
