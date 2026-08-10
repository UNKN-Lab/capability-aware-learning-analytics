import { CANONICAL_FIELDS } from "../config/canonicalFields.js";
import {
  DIRECT_FIELD_ALIASES,
  LOW_CONFIDENCE_ALIASES,
  DERIVED_FIELD_HINTS
} from "../config/canonicalFieldAliases.js";
import { getDatasetRuleMapper } from "../config/datasetRules/index.js";
import { normalizeText } from "../utils/textUtils.js";
import { isUciDataset } from "../utils/datasetUtils.js";
import { getLearnedAliases, normalizeKey } from "../repositories/aliasMemory.repository.js";


// ==========================================
// CONSTANTS
// ==========================================

const DEFAULT_SOURCE_DATASET = "CUSTOM";
const DEFAULT_MAPPING_STATUS = "draft";
const DEFAULT_VERSION = 1;

const HIGH_CONFIDENCE_THRESHOLD = 0.95;
const REVIEW_CONFIDENCE_THRESHOLD = 0.7;

// ==========================================
// HELPERS
// ==========================================


function generateMappingId(index) {
  return `map_${String(index + 1).padStart(3, "0")}`;
}

function isNumericDetectedType(detectedType) {
  const normalized = normalizeText(detectedType);
  return ["numeric", "number", "int", "integer", "float", "double"].includes(normalized);
}

function isBooleanDetectedType(detectedType) {
  const normalized = normalizeText(detectedType);
  return ["boolean", "bool"].includes(normalized);
}

function normalizeSampleValues(sampleValues) {
  if (!Array.isArray(sampleValues)) return [];
  return sampleValues.map((value) => String(value).trim().toLowerCase());
}
function looksLikeBooleanBySamples(sampleValues = []) {
  const normalized = normalizeSampleValues(sampleValues).filter(Boolean);

  if (normalized.length === 0) return false;

  return normalized.every((value) =>
    ["0", "1", "y", "n", "yes", "no", "true", "false"].includes(value)
  );
}



function getSystemDerivedSuggestions(missingRequiredCanonicalFields = []) {
  return missingRequiredCanonicalFields.map((fieldName) => {
    if (fieldName === "course_id") {
      return {
        canonical_field: "course_id",
        suggestion_type: "system_derived",
        note: "Derive from dataset context or file identity when the raw column is absent."
      };
    }

    if (fieldName === "source_dataset") {
      return {
        canonical_field: "source_dataset",
        suggestion_type: "system_derived",
        note: "Inject from upload metadata rather than mapping from a CSV column."
      };
    }

    if (fieldName === "student_id") {
      return {
        canonical_field: "student_id",
        suggestion_type: "system_derived",
        note: "May require a generated ID or composite key when absent from raw data."
      };
    }

    return {
      canonical_field: fieldName,
      suggestion_type: "manual_review",
      note: "Required canonical field is missing from auto-suggested mappings."
    };
  });
}

function getEntityScope(canonicalFieldName, group) {
  if (canonicalFieldName === "source_dataset") {
    return "system";
  }

  if (
    ["submission_day", "assessment_due_day"].includes(canonicalFieldName) ||
    group === "assessment"
  ) {
    return "assessment";
  }

  if (
    ["event_day"].includes(canonicalFieldName) ||
    group === "event" ||
    group === "engagement"
  ) {
    return "engagement_event";
  }

  if (
    ["enrollment_start_day", "enrollment_end_day"].includes(canonicalFieldName) ||
    group === "course" ||
    group === "class"
  ) {
    return "course";
  }

  if (group === "student" || group === "demographic" || group === "time") {
    return "student";
  }

  return "student";
}

function getSuggestedTransform(canonicalField, rawColumnName, detectedType, column = null) {
  const raw = normalizeText(rawColumnName);
  const field = normalizeText(canonicalField);

  if (field === "gender") return "normalize_gender";

  if (
    field === "submission_day" ||
    field === "assessment_due_day" ||
    field === "event_day"
  ) {
    if (raw.includes("date")) return "convert_date_to_relative_day";
    if (isNumericDetectedType(detectedType)) return "cast_int";
    return "convert_date_to_relative_day";
  }

  if (field === "score_normalized") {
    return "normalize_score";
  }

  if (
    [
      "higher_education_intent_flag",
      "internet_access_flag",
      "school_support_flag",
      "family_support_flag",
      "has_romantic",
      "has_extracurricular",
      "has_paid_class",
      "disability_flag",
      "pass_flag",
      "is_banked",
      "is_final_assessment"
    ].includes(field)
  ) {
    if (
      isBooleanDetectedType(detectedType) ||
      looksLikeBooleanBySamples(column?.sample_values)
    ) {
      return "cast_boolean";
    }
  }

  if (
    isNumericDetectedType(detectedType) &&
    (field.includes("score") || field.includes("imd") || field.includes("pct"))
  ) {
    return "cast_float";
  }

  if (
    isNumericDetectedType(detectedType) &&
    (
      field.includes("day") ||
      field.includes("count") ||
      field.includes("time") ||
      field.includes("attempt")
    )
  ) {
    return "cast_int";
  }

  if (
    isBooleanDetectedType(detectedType) ||
    looksLikeBooleanBySamples(column?.sample_values)
  ) {
    return "cast_boolean";
  }

  return "direct_copy";
}

function chooseStatusByConfidence(confidence) {
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return "suggested";
  if (confidence >= REVIEW_CONFIDENCE_THRESHOLD) return "needs_review";
  return "unmapped";
}

function scoreNameMatch(rawColumn, canonicalFieldName, aliases = []) {
  const normalizedRaw = normalizeText(rawColumn);
  const normalizedCanonical = normalizeText(canonicalFieldName);
  const normalizedAliases = aliases.map(normalizeText);

  if (normalizedRaw === normalizedCanonical) {
    return 1.0;
  }

  if (normalizedAliases.includes(normalizedRaw)) {
    return 0.97;
  }

  if (
    normalizedRaw.includes(normalizedCanonical) ||
    normalizedCanonical.includes(normalizedRaw)
  ) {
    return 0.8;
  }

  for (const alias of normalizedAliases) {
    if (normalizedRaw.includes(alias) || alias.includes(normalizedRaw)) {
      return 0.72;
    }
  }

  return 0;
}

function scoreLowConfidenceAlias(rawColumn, canonicalFieldName) {
  const aliases = LOW_CONFIDENCE_ALIASES[canonicalFieldName] || [];
  const normalizedRaw = normalizeText(rawColumn);
  const normalizedAliases = aliases.map(normalizeText);

  if (normalizedAliases.includes(normalizedRaw)) {
    return 0.66;
  }

  for (const alias of normalizedAliases) {
    if (normalizedRaw.includes(alias) || alias.includes(normalizedRaw)) {
      return 0.58;
    }
  }

  return 0;
}

function scoreTypeCompatibility(canonicalFieldMeta, detectedType, sampleValues = []) {
  const canonicalType = normalizeText(canonicalFieldMeta?.type);
  const normalizedDetectedType = normalizeText(detectedType);

  if (!canonicalType) return 0;

  if (canonicalType === "string" && normalizedDetectedType === "string") return 0.03;

  if (
    ["int", "float"].includes(canonicalType) &&
    isNumericDetectedType(normalizedDetectedType)
  ) {
    return 0.04;
  }

  if (
    canonicalType === "boolean" &&
    (
      isBooleanDetectedType(normalizedDetectedType) ||
      looksLikeBooleanBySamples(sampleValues)
    )
  ) {
    return 0.04;
  }

  return 0;
}

function scoreSamplePattern(canonicalFieldName, sampleValues = []) {
  const normalizedSamples = normalizeSampleValues(sampleValues);
  if (normalizedSamples.length === 0) return 0;

  const sampleSet = new Set(normalizedSamples);

  if (
    canonicalFieldName === "gender" &&
    ["m", "f", "male", "female"].some((value) => sampleSet.has(value))
  ) {
    return 0.08;
  }

  if (
    canonicalFieldName === "parent_cohabitation_status" &&
    ["t", "a", "together", "apart"].some((value) => sampleSet.has(value))
  ) {
    return 0.08;
  }

  if (
    canonicalFieldName === "disability_flag" &&
    ["y", "n", "yes", "no", "true", "false"].some((value) => sampleSet.has(value))
  ) {
    return 0.06;
  }

  if (
    [
      "higher_education_intent_flag",
      "internet_access_flag",
      "school_support_flag",
      "family_support_flag",
      "has_romantic",
      "has_extracurricular",
      "has_paid_class",
      "pass_flag",
      "is_banked"
    ].includes(canonicalFieldName) &&
    ["y", "n", "yes", "no", "true", "false", "0", "1"].some((value) => sampleSet.has(value))
  ) {
    return 0.07;
  }

  if (
    canonicalFieldName === "socioeconomic_band" &&
    normalizedSamples.some((value) => value.includes("%") || value.includes("-"))
  ) {
    return 0.05;
  }

  if (
    canonicalFieldName === "final_outcome" &&
    ["pass", "fail", "withdrawn", "distinction"].some((value) => sampleSet.has(value))
  ) {
    return 0.07;
  }

  return 0;
}

function scoreProfileHints(canonicalFieldName, column) {
  let score = 0;

  const distinctCount = Number(column?.distinct_count);
  const nullRatio = Number(column?.null_ratio);

  if (
    canonicalFieldName === "student_id" &&
    Number.isFinite(distinctCount) &&
    distinctCount > 0
  ) {
    score += 0.03;
  }

  if (
    ["student_id", "course_id", "assessment_id", "resource_id"].includes(canonicalFieldName) &&
    Number.isFinite(nullRatio) &&
    nullRatio === 0
  ) {
    score += 0.02;
  }

  return score;
}

function clampScore(score) {
  return Math.max(0, Math.min(1, score));
}

function getDerivedHint(rawColumnName) {
  const normalizedRaw = normalizeText(rawColumnName);

  let bestDerivedField = null;
  let bestDerivedScore = 0;
  let bestDerivedHint = null;

  for (const [derivedField, hint] of Object.entries(DERIVED_FIELD_HINTS)) {
    const aliases = Array.isArray(hint?.suggested_from) ? hint.suggested_from : [];
    const score = scoreNameMatch(normalizedRaw, derivedField, aliases);

    if (score > bestDerivedScore) {
      bestDerivedScore = score;
      bestDerivedField = derivedField;
      bestDerivedHint = hint;
    }
  }

  if (!bestDerivedField || bestDerivedScore < REVIEW_CONFIDENCE_THRESHOLD) {
    return null;
  }

  return {
    canonical_field: bestDerivedField,
    confidence: Number(bestDerivedScore.toFixed(2)),
    note: bestDerivedHint?.note || null
  };
}

// ==========================================
// MAIN SERVICE
// ==========================================

export async function suggestMappingsFromProfiling({
  profilingResult,
  datasetName = "uploaded_dataset",
  sourceDataset = DEFAULT_SOURCE_DATASET
}) {
  if (!profilingResult || !Array.isArray(profilingResult.columns)) {
    throw new Error("Invalid profilingResult: expected an object with a columns array.");
  }

  const learnedAliases = await getLearnedAliases();

  const fieldMappings = [];
  const strongSuggestedCanonicalFields = new Set();
  const suggestedCanonicalFieldUsage = new Map();
  const duplicateCanonicalSuggestions = [];
  const derivedHints = [];
  const datasetRuleMapper = getDatasetRuleMapper(datasetName, sourceDataset);

 for (let index = 0; index < profilingResult.columns.length; index += 1) {
  const column = profilingResult.columns[index];
  const rawColumn = column?.raw_column;

  if (!rawColumn) continue;

  if (datasetRuleMapper) {
    const datasetSpecificSuggestion = datasetRuleMapper({
      rawColumn,
      column,
      datasetName,
      sourceDataset
    });

    if (datasetSpecificSuggestion) {
      const suggestedField = datasetSpecificSuggestion.canonical_field;

      if (datasetSpecificSuggestion.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
        strongSuggestedCanonicalFields.add(suggestedField);
      }

      const previousCount = suggestedCanonicalFieldUsage.get(suggestedField) || 0;
      suggestedCanonicalFieldUsage.set(suggestedField, previousCount + 1);

      fieldMappings.push({
        id: generateMappingId(index),
        source_fields: [rawColumn],
        canonical_field: datasetSpecificSuggestion.canonical_field,
        transform: datasetSpecificSuggestion.transform,
        status: datasetSpecificSuggestion.status,
        confidence: Number(datasetSpecificSuggestion.confidence.toFixed(2)),
        entity_scope: datasetSpecificSuggestion.entity_scope,
        review_comment: datasetSpecificSuggestion.review_comment || null
      });

      continue;
    }
  }

  let bestField = null;
  let bestScore = 0;
  let bestFieldMeta = null;

    for (const canonicalField of CANONICAL_FIELDS) {
      const directAliases = DIRECT_FIELD_ALIASES[canonicalField.name] || [];
      const nameScore = scoreNameMatch(rawColumn, canonicalField.name, directAliases);
      const lowConfidenceScore = scoreLowConfidenceAlias(rawColumn, canonicalField.name);
      const typeScore = scoreTypeCompatibility(
            canonicalField,
            column.detected_type,
            column.sample_values
      );
      const sampleScore = scoreSamplePattern(canonicalField.name, column.sample_values);
      const profileScore = scoreProfileHints(canonicalField.name, column);

      const totalScore = clampScore(
        Math.max(nameScore, lowConfidenceScore) + typeScore + sampleScore + profileScore
      );

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestField = canonicalField.name;
        bestFieldMeta = canonicalField;
      }
    }
    
    // Check Learned Memory
    const normalizedRaw = normalizeKey(rawColumn);
    if (learnedAliases[normalizedRaw]) {
      const learnedTarget = learnedAliases[normalizedRaw].canonical_field;
      if (learnedTarget) {
        bestScore = Math.max(bestScore, 0.96); // High confidence for learned
        bestField = learnedTarget;
        bestFieldMeta = CANONICAL_FIELDS.find(f => f.name === learnedTarget);
      }
    }

    const status = chooseStatusByConfidence(bestScore);

    if (!bestField || status === "unmapped") {
      const derivedHint = getDerivedHint(rawColumn);

      fieldMappings.push({
        id: generateMappingId(index),
        source_fields: [rawColumn],
        canonical_field: null,
        transform: "ignore",
        status: "unmapped",
        confidence: Number(bestScore.toFixed(2)),
        entity_scope: null,
        review_comment: derivedHint
          ? `Possible derived field hint: "${derivedHint.canonical_field}". ${derivedHint.note || ""}`.trim()
          : null
      });

      if (derivedHint) {
        derivedHints.push({
          raw_column: rawColumn,
          suggested_canonical_field: derivedHint.canonical_field,
          confidence: derivedHint.confidence,
          note: derivedHint.note
        });
      }

      continue;
    }

    if (bestScore >= HIGH_CONFIDENCE_THRESHOLD) {
      strongSuggestedCanonicalFields.add(bestField);
    }

    const previousCount = suggestedCanonicalFieldUsage.get(bestField) || 0;
    suggestedCanonicalFieldUsage.set(bestField, previousCount + 1);

    const reviewCommentParts = [];

    if (status === "needs_review") {
      reviewCommentParts.push("Low-confidence match. Please review before confirmation.");
    }

    if (
      ["final_outcome"].includes(bestField) &&
      LOW_CONFIDENCE_ALIASES[bestField]?.some(
        (alias) => normalizeText(alias) === normalizeText(rawColumn)
      )
    ) {
      reviewCommentParts.push(
        'Matched via low-confidence alias. Verify that the raw column truly represents a final course outcome, not a generic result.'
      );
    }

    fieldMappings.push({
      id: generateMappingId(index),
      source_fields: [rawColumn],
      canonical_field: bestField,
      transform: getSuggestedTransform(
        bestField,
        rawColumn,
        column.detected_type,
        column
),
      status,
      confidence: Number(bestScore.toFixed(2)),
      entity_scope: getEntityScope(bestField, bestFieldMeta.group),
      review_comment: reviewCommentParts.length > 0
        ? reviewCommentParts.join(" ")
        : null
    });
  }

  for (const [canonicalField, count] of suggestedCanonicalFieldUsage.entries()) {
    if (count > 1) {
      duplicateCanonicalSuggestions.push({
        canonical_field: canonicalField,
        suggested_count: count
      });
    }
  }

 const missingRequiredCanonicalFields = CANONICAL_FIELDS
  .filter((field) => {
    if (!field.required) return false;
    // UCI không có student_id / course_id dưới dạng cột CSV rời
    // → inject từ metadata, không báo thiếu ở đây.
    if (
      isUciDataset(datasetName, sourceDataset) &&
      ["student_id", "course_id"].includes(field.name)
    ) return false;
    return !strongSuggestedCanonicalFields.has(field.name);
  })
  .map((field) => field.name);

const systemDerivedSuggestions = getSystemDerivedSuggestions(
  missingRequiredCanonicalFields
);

const unmappedRawFields = fieldMappings
  .filter((item) => item.status === "unmapped")
  .map((item) => item.source_fields[0]);

  return {
    dataset_name: datasetName,
    source_dataset: sourceDataset,
    mapping_status: DEFAULT_MAPPING_STATUS,
    version: DEFAULT_VERSION,
    confirmed_at: null,
    field_mappings: fieldMappings,
    summary: {
  total_raw_columns: profilingResult.columns.length,
  mapped_count: fieldMappings.filter((item) => item.canonical_field).length,
  unmapped_count: unmappedRawFields.length,
  needs_review_count: fieldMappings.filter((item) => item.status === "needs_review").length,
  high_confidence_count: fieldMappings.filter(
    (item) => item.confidence >= HIGH_CONFIDENCE_THRESHOLD
  ).length,
  missing_required_canonical_fields: missingRequiredCanonicalFields,
  system_derived_suggestions: systemDerivedSuggestions,
  unmapped_raw_fields: unmappedRawFields,
  duplicate_canonical_suggestions: duplicateCanonicalSuggestions,
  derived_hints: derivedHints
}
  };
}
