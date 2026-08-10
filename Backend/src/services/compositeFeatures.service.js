import { FEATURE_RULES } from "../config/canonicalFeatureRules.js";
import { normalizeText } from "../utils/textUtils.js";

// ==========================================
// HELPERS
// ==========================================

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toBoolean(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const normalized = normalizeText(value);
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function firstNonNull(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return null;
}

function normalize01(value, min, max) {
  const numericValue = toNumber(value);
  if (numericValue === null) return null;
  if (max === min) return 0;
  const normalized = (numericValue - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

export function parseImdBandMidpoint(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!text || text === "?") return null;

  const match = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (match) {
    const lower = Number(match[1]);
    const upper = Number(match[2]);
    if (Number.isFinite(lower) && Number.isFinite(upper)) {
      return (lower + upper) / 2;
    }
  }

  const numeric = toNumber(text.replace("%", ""));
  return numeric === null ? null : numeric;
}

function hasNoFormalEducation(value) {
  const normalized = normalizeText(value);
  return FEATURE_RULES.education_levels.no_formal_values.includes(normalized);
}

// ==========================================
// FEATURE COMPUTATION
// ==========================================

function computeLifestyleFeatures(studentRecord) {
  const alcoholWeekday = toNumber(studentRecord?.alcohol_weekday);
  const alcoholWeekend = toNumber(studentRecord?.alcohol_weekend);
  const goOutFreq = toNumber(studentRecord?.go_out_freq);
  const healthStatus = toNumber(studentRecord?.health_status);
  const freeTime = toNumber(studentRecord?.free_time);
  const familyRelation = toNumber(studentRecord?.family_relation);

  const motherEdu = toNumber(studentRecord?.mother_education_level);
  const fatherEdu = toNumber(studentRecord?.father_education_level);
  const maxParentEducation = motherEdu !== null || fatherEdu !== null ? Math.max(firstNonNull(motherEdu, 0), firstNonNull(fatherEdu, 0)) : null;

  const supportSignals = [
    toBoolean(studentRecord?.school_support_flag),
    toBoolean(studentRecord?.family_support_flag),
    toBoolean(studentRecord?.has_paid_class),
    toBoolean(studentRecord?.internet_access_flag)
  ];
  const hasSupportSignal = supportSignals.some((value) => value !== null);
  const supportScore = hasSupportSignal
    ? supportSignals.reduce((sum, value) => sum + (value === true ? 1 : 0), 0) / 4
    : null;

  const lifestyleRiskScore = alcoholWeekday !== null && alcoholWeekend !== null && goOutFreq !== null && healthStatus !== null
      ? normalize01(alcoholWeekday + alcoholWeekend, FEATURE_RULES.ordinal_scales.alcohol_combined_min, FEATURE_RULES.ordinal_scales.alcohol_combined_max) * 0.4 +
        normalize01(goOutFreq, FEATURE_RULES.ordinal_scales.min, FEATURE_RULES.ordinal_scales.max) * 0.3 +
        normalize01(FEATURE_RULES.ordinal_scales.max - healthStatus, 0, FEATURE_RULES.ordinal_scales.max - FEATURE_RULES.ordinal_scales.min) * 0.3
      : null;

  const socialBalanceScore = freeTime !== null && goOutFreq !== null && alcoholWeekday !== null
      ? normalize01(freeTime, FEATURE_RULES.ordinal_scales.min, FEATURE_RULES.ordinal_scales.max) * 0.5 -
        normalize01(goOutFreq, FEATURE_RULES.ordinal_scales.min, FEATURE_RULES.ordinal_scales.max) * 0.3 -
        normalize01(alcoholWeekday, FEATURE_RULES.ordinal_scales.min, FEATURE_RULES.ordinal_scales.max) * 0.2
      : null;

  const familyStabilityScore = familyRelation !== null && maxParentEducation !== null
      ? normalize01(familyRelation, FEATURE_RULES.ordinal_scales.min, FEATURE_RULES.ordinal_scales.max) * 0.5 +
        (normalizeText(studentRecord?.parent_cohabitation_status) === "t" ? 0.3 : 0) +
        normalize01(maxParentEducation, 0, 4) * 0.2
      : null;

  return {
    lifestyle_risk_score: lifestyleRiskScore,
    support_score: supportScore,
    social_balance_score: socialBalanceScore,
    family_stability_score: familyStabilityScore
  };
}

function computeSocioeconomicFeatures(studentRecord, enrollmentRecord = null) {
  const sourceDataset = normalizeText(studentRecord?.source_dataset);
  if (sourceDataset.includes("uci")) {
    const motherEducation = toNumber(studentRecord?.mother_education_level);
    const fatherEducation = toNumber(studentRecord?.father_education_level);
    const hasParentEducation =
      motherEducation !== null || fatherEducation !== null;
    const maxParentEducation = hasParentEducation
      ? Math.max(firstNonNull(motherEducation, 0), firstNonNull(fatherEducation, 0))
      : null;
    const previousAttempts = toNumber(enrollmentRecord?.previous_attempt_count);
    const internetAccess = toBoolean(studentRecord?.internet_access_flag);
    const paidClass = toBoolean(studentRecord?.has_paid_class);
    const hasAnySignal =
      previousAttempts !== null ||
      maxParentEducation !== null ||
      internetAccess !== null ||
      paidClass !== null;

    const disadvantageScore =
      (Math.min(Math.max(firstNonNull(previousAttempts, 0), 0), 4) / 4) * 0.4 +
      ((4 - Math.min(Math.max(firstNonNull(maxParentEducation, 4), 0), 4)) / 4) * 0.4 +
      (internetAccess === false ? 0.1 : 0) +
      (paidClass === false ? 0.1 : 0);

    return {
      imd_score_numeric: null,
      disadvantage_score: hasAnySignal
        ? Math.round(disadvantageScore * 100) / 100
        : null
    };
  }

  const parsedImdScore = parseImdBandMidpoint(studentRecord?.socioeconomic_band);
  const imdScore = toNumber(studentRecord?.imd_score_numeric) ?? parsedImdScore;
  const disabilityFlag = toBoolean(studentRecord?.disability_flag);
  const highestEducation = studentRecord?.highest_education;

  const disadvantageScore = (imdScore !== null ? normalize01(100 - imdScore, 0, 100) * 0.5 : 0) +
    (disabilityFlag === true ? 0.3 : 0) +
    (hasNoFormalEducation(highestEducation) ? 0.2 : 0);

  const hasAnySignal = imdScore !== null || disabilityFlag === true || hasNoFormalEducation(highestEducation);

  return {
    imd_score_numeric: imdScore,
    disadvantage_score: hasAnySignal ? disadvantageScore : null
  };
}

// ==========================================
// PASS 1: PER-STUDENT FE (called before student insert)
// ==========================================

/**
 * Computes in-table student FE fields from a student record's own demographic data.
 * These are per-student features — no enrollment/assessment/engagement data needed.
 * Results are written directly into the student table at ETL time.
 *
 * @param {Object[]} students - Array of student objects from transform output
 * @returns {Object[]} - Same array with FE fields merged in
 */
export function computeStudentFeatures(students, enrollments = []) {
  if (!Array.isArray(students)) return [];
  const enrollmentByStudent = new Map(
    (Array.isArray(enrollments) ? enrollments : [])
      .filter((item) => item?.student_id)
      .map((item) => [item.student_id, item])
  );

  return students.map(student => ({
    ...student,
    ...computeLifestyleFeatures(student),
    ...computeSocioeconomicFeatures(
      student,
      enrollmentByStudent.get(student?.student_id) || null
    )
  }));
}
