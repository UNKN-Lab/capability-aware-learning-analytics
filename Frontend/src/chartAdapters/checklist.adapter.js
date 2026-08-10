import {
  createAdapterDiagnostics,
  finalizeDiagnostics,
  isMissingValue,
  registerMissingField,
} from "./adapterPolicy.js";

export function adapt(rawData, config = {}) {
  const diag = createAdapterDiagnostics({
    chartType: "checklist",
    selectedDatasetLabel: config.__selected_dataset_label || null,
  });

  if (!Array.isArray(rawData) || rawData.length === 0) {
    return { items: [], summary: null, meta: finalizeDiagnostics(diag) };
  }

  diag.input_rows = rawData.length;
  const items = [];

  rawData.forEach((row, index) => {
    const flagName = row?.flag_name;
    if (isMissingValue(flagName)) {
      registerMissingField(diag, "flag_name");
      diag.warnings.push("Checklist row skipped: missing flag_name.");
      return;
    }

    const normalizedFlagName = normalizeFlagName(flagName);
    const currentValue = getRowValue(row, "flag_value");
    const explicitAvailability = getRowValue(row, "evidence_available");
    const available = explicitAvailability === undefined
      ? !isMissingValue(currentValue)
      : parseBoolean(explicitAvailability);
    const triggered = available ? parseBoolean(row.triggered) : false;
    const stateText = getChecklistStateText(normalizedFlagName, triggered, available);
    const severity = normalizeSeverity(
      getRowValue(row, "severity"),
      normalizedFlagName,
      triggered,
      available
    );

    items.push({
      id: `${normalizedFlagName}-${index}`,
      flagName: normalizedFlagName,
      currentValue,
      threshold: getRowValue(row, "threshold"),
      riskRule: getRiskRuleLabel(normalizedFlagName, getRowValue(row, "threshold")),
      triggered,
      available,
      severity,
      description: getTextValue(getRowValue(row, "flag_description")) || stateText.description,
      recommendedAction: getTextValue(getRowValue(row, "recommended_action")) || stateText.recommendedAction,
      supportCategory: getSupportCategory(normalizedFlagName, getRowValue(row, "support_category")),
    });
  });

  diag.valid_rows = items.length;
  const triggeredCount = items.filter((item) => item.triggered).length;
  const unavailableCount = items.filter((item) => !item.available).length;
  const highestSeverity = getHighestSeverity(items);

  return {
    items,
    summary: {
      total: items.length,
      triggered: triggeredCount,
      unavailable: unavailableCount,
      highestSeverity,
    },
    meta: finalizeDiagnostics(diag),
  };
}

function getRowValue(row, snakeKey) {
  if (!row || typeof row !== "object") return undefined;
  const camelKey = snakeToCamel(snakeKey);
  return row[snakeKey] ?? row[camelKey];
}

function snakeToCamel(value) {
  return String(value).replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function getTextValue(value) {
  const text = String(value ?? "").trim();
  return text === "" ? "" : text;
}

function normalizeFlagName(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .replace(/\s+/g, "_")
    .replace(/^flag-/i, "flag_")
    .toLowerCase();
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  return ["true", "t", "yes", "y", "1", "triggered"].includes(text);
}

function normalizeSeverity(value, flagName, triggered, available = true) {
  if (!available) return "info";
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "high" || text === "medium" || text === "low" || text === "info") {
    return text;
  }
  if (!triggered) return "info";
  return getTriggeredSeverity(flagName);
}

function getTriggeredSeverity(flagName) {
  const map = {
    flag_low_score: "high",
    flag_high_absence: "high",
    flag_repeated: "medium",
    flag_low_engagement: "medium",
    flag_low_punctuality: "medium",
    flag_neg_trend: "medium",
  };
  return map[flagName] ?? "medium";
}

function getSupportCategory(flagName, value) {
  const explicitValue = getTextValue(value);
  if (explicitValue && explicitValue.toLowerCase() !== "general") {
    return explicitValue;
  }

  const map = {
    flag_low_score: "academic_performance",
    flag_high_absence: "attendance",
    flag_repeated: "academic_history",
    flag_low_engagement: "engagement",
    flag_low_punctuality: "time_management",
    flag_neg_trend: "trend_monitoring",
  };
  return map[flagName] ?? "general";
}

function getRiskRuleLabel(flagName, threshold) {
  const thresholdLabel = formatRuleThreshold(flagName, threshold);
  const map = {
    flag_low_score: `< ${thresholdLabel}`,
    flag_high_absence: `> ${thresholdLabel} absences`,
    flag_repeated: `> ${thresholdLabel} prior attempts`,
    flag_low_engagement: `< ${thresholdLabel}`,
    flag_low_punctuality: `< ${thresholdLabel}`,
    flag_neg_trend: `< ${thresholdLabel}`,
  };
  return map[flagName] ?? thresholdLabel;
}

function formatRuleThreshold(flagName, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "");
  if (["flag_low_engagement", "flag_low_punctuality", "flag_neg_trend"].includes(flagName)) {
    return numeric.toFixed(2);
  }
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(2);
}

function getHighestSeverity(items) {
  const rank = { high: 4, medium: 3, low: 2, info: 1 };
  const activeItems = items.filter((item) => item.triggered);
  const rankedItems = activeItems.length > 0 ? activeItems : items;
  return rankedItems.reduce((best, item) => {
    return rank[item.severity] > rank[best] ? item.severity : best;
  }, "info");
}

function getChecklistStateText(flagName, triggered, available = true) {
  if (!available) {
    return {
      description: "This flag cannot be evaluated because the required source data is unavailable.",
      recommendedAction: "No action is generated from this flag until reliable data becomes available.",
    };
  }
  const stableText = {
    flag_low_score: {
      description: "Average score is at or above the pass threshold for this dataset scale.",
      recommendedAction: "Keep reviewing weaker assessment topics to maintain this level.",
    },
    flag_high_absence: {
      description: "Absences are within the high-absence risk limit.",
      recommendedAction: "Keep monitoring attendance and confirm there are no new absence spikes.",
    },
    flag_repeated: {
      description: "No previous attempts are recorded for this student.",
      recommendedAction: "No catch-up plan is required from prior-attempt history.",
    },
    flag_low_engagement: {
      description: "Engagement score is above the safety threshold.",
      recommendedAction: "Maintain a consistent weekly study routine and keep using course resources.",
    },
    flag_low_punctuality: {
      description: "Submission punctuality meets the expected threshold.",
      recommendedAction: "Keep using deadline reminders and submit drafts early.",
    },
    flag_neg_trend: {
      description: "Scores are maintaining an upward or stable trend across assessments.",
      recommendedAction: "Continue monitoring assessment feedback over time.",
    },
  };

  const triggeredText = {
    flag_low_score: {
      description: "Average score is below the pass threshold for this dataset scale.",
      recommendedAction: "Review the weakest assessment topics and schedule tutor support before the next assessment.",
    },
    flag_high_absence: {
      description: "Absence count is above the high-absence threshold.",
      recommendedAction: "Check attendance barriers and arrange follow-up before missed sessions accumulate further.",
    },
    flag_repeated: {
      description: "This student has previous attempts, which can indicate accumulated difficulty or re-enrolment risk.",
      recommendedAction: "Check prior attempt context and confirm whether the student needs a catch-up plan.",
    },
    flag_low_engagement: {
      description: "Engagement score is below the low-engagement threshold.",
      recommendedAction: "Set a weekly study routine and interact with course resources before assessment deadlines.",
    },
    flag_low_punctuality: {
      description: "Submission punctuality is below the expected threshold.",
      recommendedAction: "Use deadline reminders and submit drafts earlier to reduce late-submission risk.",
    },
    flag_neg_trend: {
      description: "Scores are trending downward across assessments.",
      recommendedAction: "Compare recent feedback with earlier stronger work and intervene before the next assessment.",
    },
  };

  return (triggered ? triggeredText : stableText)[flagName] ?? {};
}

export function getChecklistDisplayValue(flagName, value) {
  if (isMissingValue(value)) return "Not available";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "—");
  if (["flag_low_engagement", "flag_low_punctuality", "flag_neg_trend", "flag_low_score"].includes(flagName)) {
    return numeric.toFixed(2);
  }
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(2);
}
