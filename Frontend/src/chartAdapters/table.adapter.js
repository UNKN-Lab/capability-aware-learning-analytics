import {
  createAdapterDiagnostics,
  finalizeDiagnostics,
  toFiniteNumber,
} from "./adapterPolicy.js";

export function adapt(rawData, config = {}) {
  const diag = createAdapterDiagnostics({
    chartType: "table",
    selectedDatasetLabel: config.__selected_dataset_label || null,
  });

  if (!Array.isArray(rawData) || rawData.length === 0) {
    return { columns: [], rows: [], meta: finalizeDiagnostics(diag) };
  }

  diag.input_rows = rawData.length;

  if (config.variant === "action_plan") {
    const actionPlan = adaptActionPlan(rawData[0], diag);
    return { ...actionPlan, meta: finalizeDiagnostics(diag) };
  }

  const columns = Object.keys(rawData[0]).map((key) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));

  let rows = rawData;
  if (config.variant === "ranked" && config.y_field) {
    rows = [...rawData].sort((a, b) => {
      const av = toFiniteNumber(a?.[config.y_field]);
      const bv = toFiniteNumber(b?.[config.y_field]);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });
  }

  diag.valid_rows = rows.length;
  return { columns, rows, meta: finalizeDiagnostics(diag) };
}

function adaptActionPlan(row, diag) {
  const actions = buildActions(row);
  diag.valid_rows = actions.length > 0 ? 1 : 0;

  return {
    type: "action_plan",
    summary: {
      avgScore: row?.avg_score,
      riskLabel: row?.at_risk_label,
      riskScore: row?.at_risk_score,
      performanceTrend: row?.performance_trend,
      engagementScore: row?.engagement_score,
    },
    actions,
  };
}

function buildActions(row) {
  const actions = [];
  const avgScore = toFiniteNumber(row?.avg_score);
  const passThreshold = toFiniteNumber(row?.pass_threshold);
  const targetThreshold = toFiniteNumber(row?.target_threshold);
  const engagementScore = toFiniteNumber(row?.engagement_score);
  const hasEngagement = row?.engagement_score_available !== false;
  const performanceTrend = toFiniteNumber(row?.performance_trend);
  const absenceRate = toFiniteNumber(row?.absence_rate);
  const lifestyleRiskScore = toFiniteNumber(row?.lifestyle_risk_score);

  if (hasEngagement && engagementScore !== null && engagementScore < 0.15) {
    actions.push({
      priority: "High",
      title: "Rebuild weekly engagement",
      reason: `Engagement score is ${formatNumber(engagementScore)}, below the 0.15 low-engagement threshold.`,
      action: "Schedule three short course-resource sessions next week before assessment work.",
      signal: "Engagement",
    });
  }

  if (avgScore !== null && targetThreshold !== null && avgScore < targetThreshold) {
    actions.push({
      priority: avgScore < (passThreshold ?? targetThreshold) ? "High" : "Medium",
      title: "Protect assessment performance",
      reason: `Average score is ${formatNumber(avgScore)} against a target of ${formatNumber(targetThreshold)}.`,
      action: "Review the weakest assessment feedback first, then do one focused practice block.",
      signal: "Score",
    });
  }

  if (performanceTrend !== null && performanceTrend < 0) {
    actions.push({
      priority: "Medium",
      title: "Stop the downward trend",
      reason: `Performance trend is ${formatNumber(performanceTrend)}, which points downward.`,
      action: "Compare the last lower-scoring assessment with an earlier stronger one and list the missing concepts.",
      signal: "Trend",
    });
  }

  if (absenceRate !== null && absenceRate >= 0.3) {
    actions.push({
      priority: "Medium",
      title: "Reduce absence risk",
      reason: `Absence rate is ${formatNumber(absenceRate)}.`,
      action: "Pick fixed study times and catch up on any missed sessions before starting new work.",
      signal: "Attendance",
    });
  }

  if (lifestyleRiskScore !== null && lifestyleRiskScore >= 0.5) {
    actions.push({
      priority: "Low",
      title: "Stabilize study conditions",
      reason: `Lifestyle risk score is ${formatNumber(lifestyleRiskScore)}.`,
      action: "Choose one routine change that protects sleep, recovery, or study consistency this week.",
      signal: "Lifestyle",
    });
  }

  if (actions.length === 0) {
    actions.push({
      priority: "Maintain",
      title: "Keep the current study pattern",
      reason: "No urgent risk signal is active in the available metrics.",
      action: "Maintain weekly review, keep interacting with course resources, and monitor the next assessment.",
      signal: "Overall",
    });
  }

  return actions.slice(0, 5).map((action, index) => ({
    id: `action-${index + 1}`,
    ...action,
  }));
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "n/a";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
