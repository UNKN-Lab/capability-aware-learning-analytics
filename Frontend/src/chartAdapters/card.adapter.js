import {
  createAdapterDiagnostics,
  finalizeDiagnostics,
  toFiniteNumber,
} from "./adapterPolicy.js";

export function adapt(rawData, config = {}) {
  const diag = createAdapterDiagnostics({
    chartType: "card",
    selectedDatasetLabel: config.__selected_dataset_label || null,
  });

  if (!Array.isArray(rawData) || rawData.length === 0) {
    return { type: "card_list", items: [], meta: finalizeDiagnostics(diag) };
  }

  diag.input_rows = rawData.length;

  if (config?.variant === "procrastination_summary") {
    const procrastination = adaptProcrastinationSummary(rawData, diag);
    return { ...procrastination, meta: finalizeDiagnostics(diag) };
  }

  if (config?.variant === "absence_impact_summary") {
    const absenceImpact = adaptAbsenceImpactSummary(rawData[0], diag);
    return { ...absenceImpact, meta: finalizeDiagnostics(diag) };
  }

  if (config?.variant === "student_profile") {
    const profile = adaptStudentProfile(rawData[0], diag);
    return { ...profile, meta: finalizeDiagnostics(diag) };
  }

  if (config?.variant === "action_plan") {
    const actionPlan = adaptActionPlan(rawData[0], diag);
    return { ...actionPlan, meta: finalizeDiagnostics(diag) };
  }

  if (config?.variant === "intervention_plan") {
    const interventionPlan = adaptInterventionPlan(rawData[0], diag);
    return { ...interventionPlan, meta: finalizeDiagnostics(diag) };
  }

  if (config?.variant === "admin_action_recommendation") {
    const recommendation = adaptAdminActionRecommendation(rawData[0], diag);
    return { ...recommendation, meta: finalizeDiagnostics(diag) };
  }

  if (config?.variant === "risk_comparison") {
    const riskComparison = adaptRiskComparison(rawData, diag);
    return { ...riskComparison, meta: finalizeDiagnostics(diag) };
  }

  if (config?.variant === "academic_background_comparison") {
    const backgroundComparison = adaptAcademicBackgroundComparison(rawData, diag);
    return { ...backgroundComparison, meta: finalizeDiagnostics(diag) };
  }

  if (config?.variant === "at_risk_contact_queue" || config?.variant === "intervention_priority_ranking") {
    const contactQueue = adaptAtRiskContactQueue(rawData, diag, {
      limit: config?.queue_limit,
      label: config?.queue_label,
      isPriorityRanking: config?.variant === "intervention_priority_ranking",
    });
    return { ...contactQueue, meta: finalizeDiagnostics(diag) };
  }

  const aggregateRow = rawData[0];
  diag.valid_rows = 1;

  if (config?.variant === "risk_status") {
    const riskStatus = adaptRiskStatusCard(aggregateRow, diag);
    return { ...riskStatus, meta: finalizeDiagnostics(diag) };
  }

  const items = Object.entries(aggregateRow).map(([key, value]) => ({
    key,
    label: getMetricLabel(key),
    value,
  }));
  return {
    type: "card_list",
    items,
    meta: finalizeDiagnostics(diag),
  };
}

function adaptStudentProfile(row, diag) {
  diag.valid_rows = 1;
  return {
    type: "student_profile",
    profile: {
      studentId: row.student_id,
      gender: row.gender,
      ageGroup: row.age_group,
      region: row.region,
      previousAttemptCount: row.previous_attempt_count,
      finalOutcome: row.final_outcome,
      avgScore: row.avg_score,
      atRiskScore: row.at_risk_score,
      atRiskLabel: row.at_risk_label,
      engagementScore: row.engagement_score,
      studyEffortLevel: row.study_effort_level,
    },
  };
}

function adaptActionPlan(row, diag) {
  diag.valid_rows = 1;

  const avgScore = toFiniteNumber(row?.avg_score);
  const performanceTrend = toFiniteNumber(row?.performance_trend);
  const engagementScore = toFiniteNumber(row?.engagement_score);
  const engagementAvailable = row?.engagement_score_available === true;
  const relativeAbsenceIndex = toFiniteNumber(row?.absence_rate);
  const riskScore = toFiniteNumber(row?.at_risk_score);
  const passThreshold = toFiniteNumber(row?.pass_threshold) ?? 40;
  const targetThreshold = toFiniteNumber(row?.target_threshold) ?? 70;
  const lowEngagementThreshold = 0.15;
  const riskLabel = normalizeRiskLabel(row?.at_risk_label);

  const steps = [];

  if (avgScore !== null && avgScore < passThreshold) {
    steps.push({
      key: "score-recovery",
      area: "Score",
      title: "Build an academic recovery plan",
      priority: "High",
      reason: `Average score is ${formatNumber(avgScore)}, below the pass threshold of ${formatNumber(passThreshold)}.`,
      action: "Contact your tutor and make a short recovery plan for the next assessed topic.",
    });
  } else if (avgScore !== null && avgScore < targetThreshold) {
    steps.push({
      key: "score-target",
      area: "Score",
      title: "Set the next score target",
      priority: "Medium",
      reason: `Average score is ${formatNumber(avgScore)} against a target of ${formatNumber(targetThreshold)}.`,
      action: "Choose one upcoming assessment goal and schedule two focused study sessions toward the target.",
    });
  }

  if (performanceTrend !== null && performanceTrend < 0) {
    steps.push({
      key: "trend",
      area: "Trend",
      title: "Review the recent score trend",
      priority: "Medium",
      reason: `Performance trend is ${formatNumber(performanceTrend)} score points per assessment.`,
      action: "Review recent assessment feedback and write down one change to apply next week.",
    });
  }

  if (engagementAvailable && engagementScore !== null && engagementScore < lowEngagementThreshold) {
    steps.push({
      key: "engagement",
      area: "Engagement",
      title: "Rebuild weekly engagement",
      priority: "Medium",
      reason: `Engagement score is ${formatNumber(engagementScore)}, below the ${lowEngagementThreshold} low-engagement threshold.`,
      action: "Schedule three short course check-ins next week and complete one course activity during each check-in.",
    });
  }

  if (relativeAbsenceIndex !== null && relativeAbsenceIndex >= 0.25) {
    steps.push({
      key: "attendance",
      area: "Attendance",
      title: "Plan next week's attendance",
      priority: "Medium",
      reason: `Relative absence index is ${formatNumber(relativeAbsenceIndex)}, at or above the 0.25 monitoring threshold.`,
      action: "Plan next week's attendance in advance and set a reminder for each scheduled learning session.",
    });
  }

  if (riskScore !== null && riskScore >= 3 && riskLabel === "high") {
    steps.push({
      key: "advisor",
      area: "Support",
      title: "Coordinate the first support step",
      priority: "High",
      reason: `Composite risk is ${formatNumber(riskScore)} / 5 and classified as high.`,
      action: "Request a short advisor check-in to review the combined signals and choose the first support step.",
    });
  }

  if (steps.length === 0) {
    steps.push({
      key: "maintain",
      area: "Routine",
      title: "Maintain the current routine",
      priority: "Low",
      reason: "No high-priority action trigger is active in the returned signals.",
      action: "Keep a weekly study block and check feedback before the next assessment.",
    });
  }

  return {
    type: "action_plan",
    summary: {
      riskLabel,
      riskScore,
      avgScore,
      engagementScore: engagementAvailable ? engagementScore : null,
      engagementAvailable,
      performanceTrend,
    },
    steps: steps.slice(0, 5),
  };
}

function adaptInterventionPlan(row, diag) {
  diag.valid_rows = 1;

  const avgScore = toFiniteNumber(row?.avg_score);
  const performanceTrend = toFiniteNumber(row?.performance_trend);
  const engagementScore = toFiniteNumber(row?.engagement_score);
  const punctualityRate = toFiniteNumber(row?.punctuality_rate);
  const earlyWarningWeek = toFiniteNumber(row?.early_warning_week);
  const riskScore = toFiniteNumber(row?.at_risk_score);
  const riskLabel = normalizeRiskLabel(row?.at_risk_label);
  const lowEngagementThreshold = 0.15;
  const punctualityThreshold = 0.7;
  const targetThreshold = 70;

  const steps = [];

  if (riskScore !== null && riskScore >= 2) {
    steps.push({
      key: "check_in",
      area: "Advisor check-in",
      title: "Schedule a 15-minute support check-in",
      priority: riskScore >= 3 ? "High" : "Medium",
      reason: `Risk score is ${Math.round(riskScore)} / 5, so this student needs active follow-up rather than passive monitoring.`,
      action: "Contact the student within 7 days and confirm one concrete support need, blocker, and next deadline.",
    });
  }

  if (engagementScore !== null && engagementScore < lowEngagementThreshold) {
    steps.push({
      key: "engagement",
      area: "Engagement",
      title: "Restart course-resource activity",
      priority: "High",
      reason: `Engagement score is ${formatNumber(engagementScore)}, below the ${lowEngagementThreshold} low-engagement threshold.`,
      action: "Ask the student to complete three short VLE/resource sessions and verify activity by the next weekly review.",
    });
  }

  if (punctualityRate !== null && punctualityRate < punctualityThreshold) {
    steps.push({
      key: "punctuality",
      area: "Time management",
      title: "Set a deadline reminder plan",
      priority: "Medium",
      reason: `Punctuality rate is ${(punctualityRate * 100).toFixed(0)}%, below the ${(punctualityThreshold * 100).toFixed(0)}% threshold.`,
      action: "Set reminder checkpoints 7 days and 2 days before the next submission, then confirm draft progress.",
    });
  }

  if (avgScore !== null && avgScore < targetThreshold) {
    steps.push({
      key: "academic_support",
      area: "Academic support",
      title: "Target the next assessment gap",
      priority: avgScore < 40 ? "High" : "Medium",
      reason: `Average score is ${formatNumber(avgScore)}, below the ${targetThreshold} target threshold.`,
      action: "Route the student to tutor feedback on the weakest assessment area before the next assessed task.",
    });
  }

  if (earlyWarningWeek !== null) {
    steps.push({
      key: "warning_week",
      area: "Early warning",
      title: "Review the first disengagement point",
      priority: "Medium",
      reason: `The first engagement warning appears around week ${Math.round(earlyWarningWeek)}.`,
      action: "Check what changed around that week and log whether the issue was workload, access, confidence, or timing.",
    });
  }

  if (performanceTrend !== null && performanceTrend < 0) {
    steps.push({
      key: "trend",
      area: "Trend",
      title: "Prevent further score decline",
      priority: "Medium",
      reason: `Performance trend is ${formatNumber(performanceTrend)} score points per assessment.`,
      action: "Compare recent feedback with earlier work and agree one improvement target for the next assessment.",
    });
  }

  if (steps.length === 0) {
    steps.push({
      key: "monitor",
      area: "Monitoring",
      title: "Keep light-touch monitoring",
      priority: "Low",
      reason: "No urgent intervention trigger is active in the returned signals.",
      action: "Keep the student on weekly monitoring and re-check engagement after the next assessment deadline.",
    });
  }

  return {
    type: "action_plan",
    summary: {
      heading: "7-day intervention plan",
      actionLabel: "Admin action",
      riskLabel,
      riskScore,
      avgScore,
      engagementScore,
      performanceTrend,
      punctualityRate,
    },
    steps: steps.slice(0, 5),
  };
}

function adaptAdminActionRecommendation(row, diag) {
  diag.valid_rows = 1;

  const lowEngagementCount = toFiniteNumber(row?.low_engagement_count) ?? 0;
  const highRiskCount = toFiniteNumber(row?.high_risk_count) ?? 0;
  const totalStudents = toFiniteNumber(row?.total_students) ?? null;
  const hardestAssessment = row?.hardest_assessment;
  const bestResourceType = row?.best_resource_type;

  const actions = [
    {
      key: "high_risk_outreach",
      area: "Priority outreach",
      title: "Contact the high-risk queue first",
      priority: highRiskCount > 0 ? "High" : "Low",
      reason: `${formatCount(highRiskCount)} high-risk student${highRiskCount === 1 ? "" : "s"} need active follow-up.`,
      action: "Review the intervention priority ranking and contact the highest-risk students within the next 7 days.",
    },
    {
      key: "engagement_nudge",
      area: "Engagement",
      title: "Run a low-engagement nudge campaign",
      priority: lowEngagementCount > 0 ? "High" : "Low",
      reason: `${formatCount(lowEngagementCount)} student${lowEngagementCount === 1 ? "" : "s"} are below the engagement threshold.`,
      action: "Send a short check-in message and require one small VLE/resource activity before the next weekly review.",
    },
    {
      key: "assessment_support",
      area: "Assessment support",
      title: hardestAssessment
        ? `Prepare support for ${formatAssessmentLabel(hardestAssessment)}`
        : "Prepare support for the weakest assessment",
      priority: "Medium",
      reason: hardestAssessment
        ? `${formatAssessmentLabel(hardestAssessment)} is the current hardest assessment signal.`
        : "The hardest assessment signal is unavailable.",
      action: "Publish targeted feedback notes and schedule a short revision/support slot before the next assessment window.",
    },
    {
      key: "resource_strategy",
      area: "Resource strategy",
      title: bestResourceType
        ? `Promote ${formatResourceLabel(bestResourceType)} as the anchor resource`
        : "Promote the strongest resource type",
      priority: "Medium",
      reason: bestResourceType
        ? `${formatResourceLabel(bestResourceType)} is the most-used resource type in this class.`
        : "Resource usage evidence is incomplete.",
      action: "Link the resource directly in the weekly announcement and pair it with a concrete study task.",
    },
  ];

  return {
    type: "admin_action_recommendation",
    summary: {
      heading: "2-week admin action plan",
      lowEngagementCount,
      highRiskCount,
      totalStudents,
      hardestAssessment: formatAssessmentLabel(hardestAssessment),
      bestResourceType: formatResourceLabel(bestResourceType),
    },
    actions,
  };
}

function adaptRiskComparison(rows, diag) {
  const students = rows
    .slice(0, 2)
    .map((row, index) => {
      const riskScore = toFiniteNumber(row?.at_risk_score);
      const avgScore = toFiniteNumber(row?.avg_score);
      const engagementScore = toFiniteNumber(row?.engagement_score);
      const punctualityRate = toFiniteNumber(row?.punctuality_rate);
      const performanceTrend = toFiniteNumber(row?.performance_trend);
      const previousAttemptCount = toFiniteNumber(row?.previous_attempt_count);
      const flags = [
        { key: "low_score", label: "Low score", active: Boolean(Number(row?.flag_low_score)) },
        { key: "repeated", label: "Repeated attempt", active: Boolean(Number(row?.flag_repeated)) },
        { key: "low_engagement", label: "Low engagement", active: Boolean(Number(row?.flag_low_engagement)) },
        { key: "low_punctuality", label: "Low punctuality", active: Boolean(Number(row?.flag_low_punctuality)) },
        { key: "negative_trend", label: "Negative trend", active: Boolean(Number(row?.flag_neg_trend)) },
      ];

      return {
        key: row?.student_id ?? `student_${index + 1}`,
        studentId: row?.student_id,
        displayName: formatStudentLabel(row?.student_id, index),
        riskScore,
        riskLabel: normalizeRiskLabel(row?.at_risk_label),
        avgScore,
        engagementScore,
        punctualityRate,
        performanceTrend,
        previousAttemptCount,
        finalOutcome: row?.final_outcome,
        activeFlags: flags.filter((flag) => flag.active),
      };
    });

  diag.valid_rows = students.length;

  const riskRank = { high: 3, medium: 2, low: 1, unknown: 0 };
  const sorted = [...students].sort((a, b) => {
    const scoreDelta = (b.riskScore ?? -1) - (a.riskScore ?? -1);
    if (scoreDelta !== 0) return scoreDelta;
    return (riskRank[b.riskLabel] ?? 0) - (riskRank[a.riskLabel] ?? 0);
  });

  const higherRisk = sorted[0] || null;
  const lowerRisk = sorted[1] || null;
  const riskScoreGap = higherRisk && lowerRisk && higherRisk.riskScore !== null && lowerRisk.riskScore !== null
    ? higherRisk.riskScore - lowerRisk.riskScore
    : null;

  return {
    type: "risk_comparison",
    higherRiskStudentId: higherRisk?.studentId ?? null,
    summary: {
      title: higherRisk
        ? `${higherRisk.displayName} has the higher risk profile`
        : "Risk profile comparison",
      riskScoreGap,
      comparisonNote: buildRiskComparisonNote(higherRisk, lowerRisk, riskScoreGap),
    },
    students,
  };
}

function adaptAcademicBackgroundComparison(rows, diag) {
  const students = rows.slice(0, 2).map((row, index) => {
    const disadvantageScore = toFirstFiniteNumber(
      row?.disadvantage_score,
      row?.background_disadvantage_score
    );
    const supportScore = toFirstFiniteNumber(row?.support_score, row?.academic_support_score);
    const familyStabilityScore = toFirstFiniteNumber(
      row?.family_stability_score,
      row?.family_background_score
    );
    const imdScore = toFirstFiniteNumber(row?.imd_score_numeric, row?.imd_score);
    const previousAttemptCount = toFirstFiniteNumber(
      row?.previous_attempt_count,
      row?.num_of_prev_attempts,
      row?.failures
    );

    return {
      key: row?.student_id ?? `student_${index + 1}`,
      studentId: row?.student_id,
      displayName: formatStudentLabel(row?.student_id, index),
      highestEducation: resolveAcademicEducationLabel(row),
      previousAttemptCount,
      imdScore,
      socioeconomicBand: firstNonBlankValue(row?.socioeconomic_band, row?.imd_band),
      disabilityFlag: firstNonBlankValue(row?.disability_flag, row?.disability),
      disadvantageScore,
      supportScore,
      familyStabilityScore,
    };
  });

  diag.valid_rows = students.length;

  const scored = students.filter((student) => student.disadvantageScore !== null);
  const higherDisadvantage = scored.length > 0
    ? [...scored].sort((a, b) => b.disadvantageScore - a.disadvantageScore)[0]
    : null;
  const lowerDisadvantage = scored.length > 1
    ? [...scored].sort((a, b) => a.disadvantageScore - b.disadvantageScore)[0]
    : null;
  const scoreGap = higherDisadvantage && lowerDisadvantage
    ? higherDisadvantage.disadvantageScore - lowerDisadvantage.disadvantageScore
    : null;
  const hasMeaningfulGap = scoreGap !== null && Math.abs(scoreGap) >= 0.0001;
  const hasImdContext = students.some((student) => hasMeaningfulCompositeValue(student.imdScore));
  const hasSocioeconomicContext = students.some((student) => hasDisplayValue(student.socioeconomicBand));
  const hasDisabilityContext = students.some((student) => hasDisplayValue(student.disabilityFlag));
  const hasSupportContext = students.some((student) => hasMeaningfulCompositeValue(student.supportScore));
  const hasFamilyContext = students.some((student) => hasMeaningfulCompositeValue(student.familyStabilityScore));

  return {
    type: "academic_background_comparison",
    highlightedStudentId: hasMeaningfulGap ? higherDisadvantage?.studentId ?? null : null,
    summary: {
      title: hasMeaningfulGap && higherDisadvantage
        ? `${higherDisadvantage.displayName} has the higher background disadvantage score`
        : "Academic background comparison",
      scoreGap,
      comparisonNote: buildBackgroundComparisonNote(students, higherDisadvantage, lowerDisadvantage, scoreGap),
      hasImdContext,
      hasSocioeconomicContext,
      hasDisabilityContext,
      hasSupportContext,
      hasFamilyContext,
    },
    students,
  };
}

function resolveAcademicEducationLabel(row) {
  const direct = firstNonBlankValue(row?.highest_education);
  if (direct) return direct;

  const motherEducation = toFiniteNumber(row?.mother_education_level);
  const fatherEducation = toFiniteNumber(row?.father_education_level);
  if (motherEducation !== null || fatherEducation !== null) {
    const maxParentEducation = Math.max(motherEducation ?? 0, fatherEducation ?? 0);
    return `Parent education ${formatNumber(maxParentEducation)}/4`;
  }

  const motherLabel = firstNonBlankValue(row?.mother_education_level);
  const fatherLabel = firstNonBlankValue(row?.father_education_level);
  if (motherLabel || fatherLabel) {
    return [motherLabel && `Mother: ${motherLabel}`, fatherLabel && `Father: ${fatherLabel}`]
      .filter(Boolean)
      .join(", ");
  }

  return null;
}

function firstNonBlankValue(...values) {
  return values.find((value) =>
    value !== null && value !== undefined && String(value).trim() !== ""
  ) ?? null;
}

function toFirstFiniteNumber(...values) {
  for (const value of values) {
    const numeric = toFiniteNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function hasMeaningfulCompositeValue(value) {
  const numeric = toFiniteNumber(value);
  return numeric !== null && Math.abs(numeric) >= 0.0001;
}

function hasDisplayValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function buildBackgroundComparisonNote(students, higherDisadvantage, lowerDisadvantage, scoreGap) {
  if (higherDisadvantage && lowerDisadvantage && scoreGap !== null) {
    if (Math.abs(scoreGap) < 0.0001) {
      return "Both students have the same available disadvantage score; compare education, IMD, and prior attempts.";
    }
    return `${higherDisadvantage.displayName} is ${formatNumber(scoreGap)} points higher on the available disadvantage score than ${lowerDisadvantage.displayName}.`;
  }

  const educationLabels = students
    .map((student) => student.highestEducation)
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
  if (educationLabels.length > 0) {
    return "Disadvantage score is incomplete; compare the visible education, IMD, socioeconomic, and disability fields.";
  }

  return "Background fields are incomplete for this comparison.";
}

function adaptAtRiskContactQueue(rows, diag, options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : 12;
  const mappedStudents = rows.map((row, index) => {
    const riskScore = toFiniteNumber(row?.at_risk_score);
    const avgScore = toFiniteNumber(row?.avg_score);
    const engagementScore = toFiniteNumber(row?.engagement_score);
    const punctualityRate = toFiniteNumber(row?.punctuality_rate);
    const engagementScoreAvailable = row?.engagement_score_available === undefined
      ? engagementScore !== null
      : row.engagement_score_available === true;
    const punctualityRateAvailable = row?.punctuality_rate_available === undefined
      ? punctualityRate !== null
      : row.punctuality_rate_available === true;
    const previousAttemptCount = toFiniteNumber(row?.previous_attempt_count);
    const activeFlags = parseTriggeredFlags(row);

    return {
      key: row?.student_id ?? `student_${index + 1}`,
      rank: index + 1,
      studentId: row?.student_id,
      displayName: formatStudentLabel(row?.student_id, index),
      riskScore,
      riskLabel: normalizeRiskLabel(row?.at_risk_label),
      avgScore,
      engagementScore,
      engagementScoreAvailable,
      punctualityRate,
      punctualityRateAvailable,
      previousAttemptCount,
      finalOutcome: row?.final_outcome,
      primarySupportCategory: row?.primary_support_category,
      recommendedAdminAction: buildAdminContactAction({
        row,
        activeFlags,
        avgScore,
        engagementScore,
        punctualityRate,
        previousAttemptCount,
        riskScore,
      }),
      triggeredFlagsSummary: row?.triggered_flags_summary,
      activeFlags,
    };
  });
  const rankedStudents = options.isPriorityRanking
    ? sortInterventionPriorityStudents(mappedStudents)
    : mappedStudents;
  const students = rankedStudents.slice(0, limit).map((student, index) => ({
    ...student,
    rank: index + 1,
  }));

  diag.valid_rows = students.length;

  const highCount = students.filter((student) => student.riskLabel === "high").length;
  const mediumCount = students.filter((student) => student.riskLabel === "medium").length;
  const highestRiskScore = Math.max(0, ...students.map((student) => student.riskScore ?? 0));

  return {
    type: "at_risk_contact_queue",
    summary: {
      label: options.label || "Contact priority queue",
      title: students.length > 0
        ? options.isPriorityRanking
          ? `Top ${students.length} students needing intervention`
          : `${students.length} students in this contact queue`
        : "No students need immediate contact",
      highCount,
      mediumCount,
      highestRiskScore,
    },
    students,
  };
}

function parseTriggeredFlags(row) {
  if (Array.isArray(row?.triggered_flags)) {
    return row.triggered_flags.map(formatTriggeredFlag).filter(Boolean);
  }

  const columnFlags = [
    { column: "flag_low_score", key: "low_score", detail: "Average score is below the pass threshold." },
    { column: "flag_repeated", key: "repeated_attempt", detail: "Student has one or more previous attempts." },
    { column: "flag_low_engagement", key: "low_engagement", detail: "Engagement score is below the low-engagement threshold." },
    { column: "flag_low_punctuality", key: "low_punctuality", detail: "Punctuality rate is below the expected threshold." },
    { column: "flag_neg_trend", key: "negative_trend", detail: "Assessment scores are trending downward." },
  ]
    .filter((flag) => isTruthyFlag(row?.[flag.column]))
    .map((flag) => formatTriggeredFlag(`${flag.key}: ${flag.detail}`))
    .filter(Boolean);

  if (columnFlags.length > 0) return columnFlags;

  const summary = String(row?.triggered_flags_summary ?? "").trim();
  if (!summary || summary === "No active risk flags") return [];
  return summary
    .split(";")
    .map((item) => formatTriggeredFlag(item.trim()))
    .filter(Boolean);
}

function sortInterventionPriorityStudents(students) {
  return [...students].sort((a, b) => {
    const urgencyDelta = getInterventionUrgencyScore(b) - getInterventionUrgencyScore(a);
    if (urgencyDelta !== 0) return urgencyDelta;
    return (a.avgScore ?? Number.POSITIVE_INFINITY) - (b.avgScore ?? Number.POSITIVE_INFINITY);
  });
}

function getInterventionUrgencyScore(student) {
  const riskScore = student?.riskScore ?? 0;
  const avgScore = student?.avgScore;
  const engagementScore = student?.engagementScoreAvailable ? student?.engagementScore : null;
  const punctualityRate = student?.punctualityRateAvailable ? student?.punctualityRate : null;
  const outcome = String(student?.finalOutcome ?? "").trim().toLowerCase();
  const hasFlag = (key) => (student?.activeFlags || []).some((flag) => flag.key === key);

  const lowScorePressure = avgScore !== null && avgScore !== undefined
    ? Math.max(0, 70 - avgScore)
    : 0;
  const engagementPressure = engagementScore !== null && engagementScore !== undefined
    ? Math.max(0, 0.15 - engagementScore) * 100
    : 0;
  const punctualityPressure = punctualityRate !== null && punctualityRate !== undefined
    ? Math.max(0, 0.7 - punctualityRate) * 100
    : 0;
  const withdrawnPressure = outcome === "withdrawn" ? 125 : 0;
  const failedPressure = outcome === "fail" ? 35 : 0;
  const trendPressure = hasFlag("negative_trend") ? 10 : 0;

  return (
    riskScore * 100
    + withdrawnPressure
    + failedPressure
    + lowScorePressure
    + engagementPressure
    + punctualityPressure
    + trendPressure
  );
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(text);
}

function buildAdminContactAction({
  row,
  activeFlags,
  avgScore,
  engagementScore,
  punctualityRate,
  previousAttemptCount,
  riskScore,
}) {
  const hasFlag = (key) => activeFlags.some((flag) => flag.key === key);
  const severePunctuality = punctualityRate !== null && punctualityRate <= 0.05;
  const severeEngagement = engagementScore !== null && engagementScore < 0.05;
  const lowEngagement = severeEngagement || hasFlag("low_engagement");
  const lowPunctuality = severePunctuality || hasFlag("low_punctuality");
  const lowScore = hasFlag("low_score") || (avgScore !== null && avgScore < 40);
  const repeatedAttempt = hasFlag("repeated_attempt") || (previousAttemptCount !== null && previousAttemptCount > 0);
  const negativeTrend = hasFlag("negative_trend");
  const highRisk = riskScore !== null && riskScore >= 4;
  const finalOutcome = String(row?.final_outcome ?? "").trim().toLowerCase();

  if (finalOutcome === "withdrawn") {
    return "Contact to understand withdrawal reasons and discuss re-enrolment or recovery options.";
  }

  if (severePunctuality && severeEngagement) {
    return "Contact this week, set urgent deadline reminders, and agree a short weekly engagement routine.";
  }
  if (severePunctuality) {
    return "Send urgent submission deadline reminders and agree a catch-up submission plan this week.";
  }
  if (severeEngagement) {
    return "Schedule a VLE disengagement check-in and set three short resource sessions before the next deadline.";
  }
  if (highRisk && lowEngagement && lowScore) {
    return "Combine academic support with a weekly engagement routine before the next assessment.";
  }
  if (lowPunctuality) {
    return "Use deadline reminders and submission planning before the next assessment.";
  }
  if (lowEngagement) {
    return "Set a weekly study routine and check course-resource activity before assessment deadlines.";
  }
  if (lowScore && repeatedAttempt && negativeTrend) {
    return "Arrange an academic recovery check-in, review prior-attempt difficulties and recent feedback, then agree one improvement target for the next assessment.";
  }
  if (lowScore && repeatedAttempt) {
    return "Review prior-attempt difficulties with the student and agree a focused catch-up plan before the next assessment.";
  }
  if (lowScore && negativeTrend) {
    return "Review recent assessment feedback, identify the weakest topic, and agree one recovery target for the next assessment.";
  }
  if (negativeTrend) {
    return "Review recent assessment feedback and agree one improvement target for the next assessment.";
  }
  if (lowScore) {
    return "Prioritise academic support for low average score.";
  }
  if (repeatedAttempt) {
    return "Check prior attempt context and confirm whether the student needs a catch-up plan.";
  }

  return row?.recommended_admin_action || "Contact the student and confirm the current support need.";
}

function formatTriggeredFlag(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const [rawKey, ...rest] = text.split(":");
  const detail = rest.join(":").trim();
  const labelMap = {
    low_score: "Low score",
    repeated_attempt: "Repeated attempt",
    low_engagement: "Low engagement",
    low_punctuality: "Low punctuality",
    negative_trend: "Negative trend",
  };
  const key = rawKey.trim();
  return {
    key,
    label: labelMap[key] || key.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    detail,
  };
}

function buildRiskComparisonNote(higherRisk, lowerRisk, riskScoreGap) {
  if (!higherRisk || !lowerRisk) return "Need two comparable student rows to identify the higher-risk profile.";
  if (riskScoreGap === 0) {
    return "Both students have the same risk score; compare the active flags and engagement details.";
  }
  if (riskScoreGap !== null) {
    return `${higherRisk.displayName} has ${riskScoreGap} more active risk flag${riskScoreGap === 1 ? "" : "s"} than ${lowerRisk.displayName}.`;
  }
  return "Risk scores are incomplete; compare visible flags and metrics.";
}

function formatStudentLabel(studentId, index) {
  const text = String(studentId ?? "").trim();
  const match = text.match(/(\d{4,})$/);
  if (match) return `Student ${match[1]}`;
  return text || `Student ${index + 1}`;
}

function getMetricLabel(key) {
  const labels = {
    registration_lead_time: "Lead Time",
    cohort_avg_registration_lead_time: "Cohort Lead Time",
    lead_time_vs_cohort_days: "Lead Time Gap",
    avg_score: "Avg Score",
    cohort_avg_score: "Cohort Avg Score",
    score_vs_cohort: "Score Gap",
    registration_timing_percentile: "Registration Percentile",
    score_percentile: "Score Rank Percentile",
    class_median_score: "Class Median Score",
    registration_timing_status: "Timing Status",
    performance_status: "Performance Status",
    interpretation: "Interpretation",
  };

  return labels[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function adaptRiskStatusCard(row, diag) {
  const reportedRiskLabel = normalizeRiskLabel(row.at_risk_label);
  const riskScore = toFiniteNumber(row.at_risk_score);
  const engagementAvailable = row?.engagement_score_available === true;
  const punctualityAvailable = row?.punctuality_rate_available === true;
  if (riskScore === null && row.at_risk_score !== 0) {
    diag.warnings.push('Missing/invalid "at_risk_score"; displaying as unknown.');
  }
  const riskLabel = riskLabelFromScore(riskScore, reportedRiskLabel);

  const metricOrder = [
    "avg_score",
    "engagement_score",
    "punctuality_rate",
    "previous_attempt_count",
    "pass_threshold",
    "target_threshold",
  ];

  const metrics = metricOrder
    .filter((key) => (
      key === "engagement_score" || key === "punctuality_rate"
        ? row[key] !== undefined
        : row[key] !== undefined && row[key] !== null
    ))
    .map((key) => ({
      key,
      label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      value: row[key],
      available:
        key === "engagement_score"
          ? engagementAvailable
          : key === "punctuality_rate"
            ? punctualityAvailable
            : true,
    }));

  return {
    type: "risk_status",
    riskLabel,
    riskScore,
    metrics,
  };
}

function riskLabelFromScore(score, fallbackLabel) {
  const numeric = toFiniteNumber(score);
  if (numeric !== null) {
    if (numeric >= 3) return "high";
    if (numeric >= 2) return "medium";
    return "low";
  }
  return fallbackLabel;
}

function adaptProcrastinationSummary(rows, diag) {
  const validRows = rows
    .map((row) => ({
      delay: toFiniteNumber(row?.submission_delay_days),
      score: toFiniteNumber(row?.score_normalized),
      assessmentOrder: row?.assessment_order,
      assessmentName: row?.assessment_name,
    }))
    .filter((row) => row.delay !== null);

  diag.valid_rows = validRows.length;

  const lateRows = validRows.filter((row) => row.delay > 0);
  const onTimeRows = validRows.filter((row) => row.delay <= 0);
  const lateRate = validRows.length > 0 ? lateRows.length / validRows.length : null;
  const punctualityRate = validRows.length > 0 ? onTimeRows.length / validRows.length : null;
  const avgLateDelay = average(lateRows.map((row) => row.delay));
  const maxDelay = validRows.length > 0 ? Math.max(...validRows.map((row) => row.delay)) : null;
  const avgLateScore = average(lateRows.map((row) => row.score).filter((value) => value !== null));
  const avgOnTimeScore = average(onTimeRows.map((row) => row.score).filter((value) => value !== null));
  const scoreGap = avgLateScore !== null && avgOnTimeScore !== null ? avgLateScore - avgOnTimeScore : null;

  return {
    type: "procrastination_summary",
    status: getProcrastinationStatus({ lateRate, scoreGap }),
    metrics: [
      { key: "late_submissions", label: "Late submissions", value: `${lateRows.length} / ${validRows.length}` },
      { key: "punctuality_rate", label: "Punctuality rate", value: punctualityRate },
      { key: "avg_late_delay", label: "Avg late delay", value: avgLateDelay },
      { key: "max_delay", label: "Worst delay", value: maxDelay },
      { key: "score_gap", label: "Late score gap", value: scoreGap },
    ],
    insight: buildProcrastinationInsight({ lateRows, validRows, lateRate, avgLateDelay, scoreGap }),
  };
}

function adaptAbsenceImpactSummary(row, diag) {
  diag.valid_rows = row ? 1 : 0;

  const absences = toFiniteNumber(row?.absences);
  const absenceRate = toFiniteNumber(row?.absence_rate);
  const classMaxAbsences = toFiniteNumber(row?.class_max_absences);
  const avgScore = toFiniteNumber(row?.avg_score);
  const latestScore = toFiniteNumber(row?.latest_score);
  const performanceTrend = toFiniteNumber(row?.performance_trend);
  const assessmentCount = toFiniteNumber(row?.assessment_count);

  if (absences === null) {
    diag.warnings.push('Missing/invalid "absences"; impact summary is partial.');
  }
  if (absenceRate === null) {
    diag.warnings.push('Missing/invalid "absence_rate"; impact status uses score trend only.');
  }

  return {
    type: "absence_impact_summary",
    status: getAbsenceImpactStatus({ absenceRate, avgScore, performanceTrend }),
    metrics: [
      { key: "absences", label: "Absences", value: absences },
      { key: "absence_rate", label: "Relative absence rate", value: absenceRate },
      { key: "class_max_absences", label: "Class max absences", value: classMaxAbsences },
      { key: "avg_score", label: "Average score", value: avgScore },
      { key: "latest_score", label: "Latest score", value: latestScore },
      { key: "performance_trend", label: "Score trend", value: performanceTrend },
      { key: "assessment_count", label: "Assessments", value: assessmentCount },
    ],
  };
}

function getAbsenceImpactStatus({ absenceRate, avgScore, performanceTrend }) {
  const scoreIsLow = avgScore !== null && avgScore < 40;
  const trendIsDown = performanceTrend !== null && performanceTrend < 0;

  if (absenceRate === null) {
    return {
      label: trendIsDown || scoreIsLow ? "Performance watch" : "Impact unclear",
      badge: "Needs context",
      className: "bg-slate-50 border-slate-200 text-slate-700",
    };
  }

  if (absenceRate >= 0.3 && (scoreIsLow || trendIsDown)) {
    return {
      label: "Absence impact risk",
      badge: "Needs attention",
      className: "bg-rose-50 border-rose-200 text-rose-700",
    };
  }

  if (absenceRate >= 0.15 || (absenceRate >= 0.1 && (scoreIsLow || trendIsDown))) {
    return {
      label: "Monitor attendance",
      badge: "Watch pattern",
      className: "bg-amber-50 border-amber-200 text-amber-700",
    };
  }

  return {
    label: "Low visible absence impact",
    badge: "Stable",
    className: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };
}

function getProcrastinationStatus({ lateRate, scoreGap }) {
  if (lateRate === null) {
    return {
      label: "Unknown",
      badge: "Not enough timing data",
      className: "bg-slate-50 border-slate-200 text-slate-700",
    };
  }
  if (lateRate === 0) {
    return {
      label: "No procrastination pattern",
      badge: "On time",
      className: "bg-emerald-50 border-emerald-200 text-emerald-700",
    };
  }
  if (lateRate >= 0.5 || (scoreGap !== null && scoreGap < -5)) {
    return {
      label: "Procrastination risk",
      badge: "Needs attention",
      className: "bg-rose-50 border-rose-200 text-rose-700",
    };
  }
  return {
    label: "Occasional lateness",
    badge: "Monitor",
    className: "bg-amber-50 border-amber-200 text-amber-700",
  };
}

function buildProcrastinationInsight({ lateRows, validRows, lateRate, avgLateDelay, scoreGap }) {
  if (validRows.length === 0) {
    return {
      reason: "No valid submission timing rows were available.",
      action: "Use assessment feedback and future submission timestamps once available.",
    };
  }
  if (lateRows.length === 0) {
    return {
      reason: "All available submissions were on time or early.",
      action: "Keep the current submission rhythm and start the next assessment before the due week.",
    };
  }

  const scoreText = scoreGap === null
    ? "There is not enough score contrast to estimate mark impact."
    : scoreGap < 0
      ? `Late submissions average ${Math.abs(scoreGap).toFixed(2)} points lower than on-time submissions.`
      : `Late submissions do not show a lower average score in this sample.`;

  return {
    reason: `${lateRows.length} of ${validRows.length} submissions were late (${Math.round(lateRate * 100)}%). Average late delay is ${formatNumber(avgLateDelay)} days. ${scoreText}`,
    action: "Set a personal deadline 2 days before the official due date and submit a draft before polishing.",
  };
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "n/a";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return String(Math.round(numeric));
}

function formatAssessmentLabel(value) {
  const text = String(value ?? "").trim();
  if (!text) return "n/a";
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return `Assessment ${Math.round(numeric)}`;
  return text.replace(/_/g, " ");
}

function formatResourceLabel(value) {
  const text = String(value ?? "").trim();
  if (!text) return "n/a";
  return text.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeRiskLabel(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "low" || text === "medium" || text === "high") return text;
  return "unknown";
}
