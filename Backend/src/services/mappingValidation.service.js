import { CANONICAL_FIELDS } from "../config/canonicalFields.js";
import { normalizeText } from "../utils/textUtils.js";

const ALLOWED_VALIDATION_MODE = ["draft", "strict"];
const ALLOWED_MAPPING_STATUS = ["draft", "in_review", "confirmed"];
const ALLOWED_FIELD_STATUS = [
  "suggested",
  "needs_review",
  "confirmed",
  "ignored",
  "unmapped"
];

const ALLOWED_ENTITY_SCOPE = [
  "student",
  "course",
  "enrollment",
  "assessment",
  "engagement",
  "engagement_event",
  "system"
];

const ALLOWED_TRANSFORMS = [
  "direct_copy",
  "ignore",
  "cast_int",
  "cast_float",
  "cast_boolean",
  "normalize_gender",
  "normalize_score",
  "convert_date_to_relative_day",
  "regex_extract"
];

const REQUIRED_TOP_LEVEL_FIELDS = [
  "dataset_name",
  "source_dataset",
  "mapping_status",
  "version",
  "field_mappings"
];

const REQUIRED_CANONICAL_FIELDS = CANONICAL_FIELDS
  .filter((field) => field.required)
  .map((field) => field.name);

// ==========================================
// HELPERS
// ==========================================

function pushUniqueMessage(targetArray, message) {
  if (!targetArray.includes(message)) {
    targetArray.push(message);
  }
}


function buildCanonicalFieldMap() {
  return Object.fromEntries(CANONICAL_FIELDS.map((field) => [field.name, field]));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidConfidence(value) {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function isValidArrayOfNonEmptyStrings(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function isNumericDetectedType(detectedType) {
  const detected = normalizeText(detectedType);
  return ["numeric", "number", "int", "integer", "float", "double"].includes(detected);
}

function isBooleanDetectedType(detectedType) {
  const detected = normalizeText(detectedType);
  return ["boolean", "bool"].includes(detected);
}

function makeStats(mappingConfig, canonicalFieldUsage) {
  const totalFieldMappings = Array.isArray(mappingConfig?.field_mappings)
    ? mappingConfig.field_mappings.length
    : 0;

  return {
    totalFieldMappings,
    confirmedFieldMappings: Array.isArray(mappingConfig?.field_mappings)
      ? mappingConfig.field_mappings.filter((item) => item?.status === "confirmed").length
      : 0,
    suggestedFieldMappings: Array.isArray(mappingConfig?.field_mappings)
      ? mappingConfig.field_mappings.filter((item) => item?.status === "suggested").length
      : 0,
    needsReviewFieldMappings: Array.isArray(mappingConfig?.field_mappings)
      ? mappingConfig.field_mappings.filter((item) => item?.status === "needs_review").length
      : 0,
    ignoredFieldMappings: Array.isArray(mappingConfig?.field_mappings)
      ? mappingConfig.field_mappings.filter((item) => item?.status === "ignored").length
      : 0,
    unmappedFieldMappings: Array.isArray(mappingConfig?.field_mappings)
      ? mappingConfig.field_mappings.filter((item) => item?.status === "unmapped").length
      : 0,
    requiredCanonicalFieldCount: REQUIRED_CANONICAL_FIELDS.length,
    coveredRequiredCanonicalFieldCount: REQUIRED_CANONICAL_FIELDS.filter(
      (fieldName) =>
        canonicalFieldUsage.has(fieldName) ||
        (fieldName === "source_dataset" && isNonEmptyString(mappingConfig?.source_dataset))
    ).length
  };
}

function reportIssue({ mode, severity, message, errors, warnings }) {
  if (severity === "error") {
    pushUniqueMessage(errors, message);
    return;
  }

  if (severity === "warning") {
    pushUniqueMessage(warnings, message);
    return;
  }

  // severity === "strict_error"
  if (mode === "strict") {
    pushUniqueMessage(errors, message);
  } else {
    pushUniqueMessage(warnings, message);
  }
}

// ==========================================
// DUPLICATION-TABLE ARCHITECTURE RULES
// ==========================================

function getAllowedEntityScopes(canonicalFieldName, group) {
  if (group === "enrollment") {
    return ["enrollment", "student", "course"];
  }
  if (group === "engagement") {
    return ["engagement", "engagement_event", "enrollment"];
  }

  if (canonicalFieldName === "source_dataset") {
    return ["system", "student", "course", "assessment", "engagement_event"];
  }

  // shared identifiers / context fields
  if (canonicalFieldName === "student_id") {
    return ["student", "assessment", "engagement_event"];
  }

  if (canonicalFieldName === "course_id") {
    return ["student", "course", "assessment", "engagement_event"];
  }

  if (canonicalFieldName === "final_outcome") {
    return ["student", "assessment", "engagement_event"];
  }

  if (["gender", "age_group", "region", "residence_area", "highest_education", "socioeconomic_band", "imd_score_numeric", "disability_flag"].includes(canonicalFieldName)) {
    return ["student", "assessment", "engagement_event"];
  }

  if (["course_name", "course_run", "subject_area", "course_duration_days", "study_load_credits"].includes(canonicalFieldName)) {
    return ["course", "student", "assessment", "engagement_event"];
  }

  // assessment-only fields
  if (
    [
      "assessment_result_id",
      "assessment_id",
      "assessment_name",
      "assessment_type",
      "assessment_order",
      "assessment_weight_pct",
      "score_normalized",
      "pass_flag",
      "is_banked",
      "is_final_assessment",
      "submission_day",
      "assessment_due_day",
      "submission_delay_days"
    ].includes(canonicalFieldName) ||
    group === "assessment"
  ) {
    return ["assessment"];
  }

  // engagement-event-only fields
  if (
    [
      "engagement_event_id",
      "resource_id",
      "resource_type",
      "engagement_count",
      "event_day",
      "week_number",
      "active_day_count",
      "absence_count"
    ].includes(canonicalFieldName) ||
    group === "event" ||
    group === "engagement"
  ) {
    return ["engagement_event"];
  }

  // time fields that are student/course context
  if (["enrollment_start_day", "enrollment_end_day"].includes(canonicalFieldName)) {
    return ["student", "course"];
  }

  // default semantic allowance
  if (group === "student" || group === "demographic" || group === "time") {
    return ["student"];
  }

  if (group === "course") {
    return ["course"];
  }

  return ["student"];
}

function getAllowedTransforms(canonicalFieldName, rawColumnName, detectedType) {
  const raw = normalizeText(rawColumnName);
  const detected = normalizeText(detectedType);

  if (canonicalFieldName === "gender") {
    return ["normalize_gender", "direct_copy"];
  }

  if (canonicalFieldName === "score_normalized") {
    return ["normalize_score", "cast_float", "direct_copy"];
  }

  if (["submission_day", "assessment_due_day", "event_day"].includes(canonicalFieldName)) {
    if (raw.includes("date")) {
      return ["convert_date_to_relative_day", "cast_int", "direct_copy"];
    }
    return ["cast_int", "direct_copy"];
  }

  if (canonicalFieldName === "assessment_order") {
    return ["cast_int", "direct_copy"];
  }

  if (
    ["pass_flag", "is_banked", "is_final_assessment", "disability_flag", "higher_education_intent_flag", "internet_access_flag", "school_support_flag", "family_support_flag", "has_romantic", "has_extracurricular", "has_paid_class"].includes(canonicalFieldName)
  ) {
    return ["cast_boolean", "direct_copy"];
  }

  if (isBooleanDetectedType(detected)) {
    return ["cast_boolean", "direct_copy"];
  }

  if (isNumericDetectedType(detected)) {
    return ["cast_int", "cast_float", "direct_copy", "regex_extract"];
  }

  return ["direct_copy", "regex_extract"];
}

// ==========================================
// MAIN SERVICE
// ==========================================

export function validateMapping({
  mappingConfig,
  profilingResult,
  mode = "draft"
}) {
  const errors = [];
  const warnings = [];

  if (!ALLOWED_VALIDATION_MODE.includes(mode)) {
    return {
      isValid: false,
      errors: [
        `Invalid validation mode "${mode}". Allowed values: ${ALLOWED_VALIDATION_MODE.join(", ")}.`
      ],
      warnings,
      stats: {
        totalFieldMappings: 0,
        confirmedFieldMappings: 0,
        suggestedFieldMappings: 0,
        needsReviewFieldMappings: 0,
        ignoredFieldMappings: 0,
        unmappedFieldMappings: 0,
        requiredCanonicalFieldCount: REQUIRED_CANONICAL_FIELDS.length,
        coveredRequiredCanonicalFieldCount: 0
      }
    };
  }

  const canonicalFieldMap = buildCanonicalFieldMap();
  const canonicalFieldNames = new Set(Object.keys(canonicalFieldMap));

  const profiledRawColumns = new Set(
    Array.isArray(profilingResult?.columns)
      ? profilingResult.columns
          .map((column) => column?.raw_column)
          .filter((value) => typeof value === "string" && value.trim())
      : []
  );

  const profilingColumnMap = Object.fromEntries(
    Array.isArray(profilingResult?.columns)
      ? profilingResult.columns
          .filter((column) => typeof column?.raw_column === "string" && column.raw_column.trim())
          .map((column) => [column.raw_column, column])
      : []
  );

  const canonicalFieldUsage = new Map();

  if (!mappingConfig || typeof mappingConfig !== "object" || Array.isArray(mappingConfig)) {
    return {
      isValid: false,
      errors: ['Invalid mappingConfig: expected an object.'],
      warnings,
      stats: makeStats(null, canonicalFieldUsage)
    };
  }

  // ==========================================
  // 1. TOP-LEVEL STRUCTURE CHECK
  // ==========================================
  for (const fieldName of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(fieldName in mappingConfig)) {
      pushUniqueMessage(errors, `Missing required top-level field "${fieldName}".`);
    }
  }

  if ("dataset_name" in mappingConfig && !isNonEmptyString(mappingConfig.dataset_name)) {
    pushUniqueMessage(errors, 'Field "dataset_name" must be a non-empty string.');
  }

  if ("source_dataset" in mappingConfig && !isNonEmptyString(mappingConfig.source_dataset)) {
    pushUniqueMessage(errors, 'Field "source_dataset" must be a non-empty string.');
  }

  if (
    "mapping_status" in mappingConfig &&
    !ALLOWED_MAPPING_STATUS.includes(mappingConfig.mapping_status)
  ) {
    pushUniqueMessage(
      errors,
      `Invalid mapping_status "${mappingConfig.mapping_status}". Allowed values: ${ALLOWED_MAPPING_STATUS.join(", ")}.`
    );
  }

  if (
    "version" in mappingConfig &&
    (!Number.isInteger(mappingConfig.version) || mappingConfig.version <= 0)
  ) {
    pushUniqueMessage(errors, 'Field "version" must be a positive integer.');
  }

  if (!Array.isArray(mappingConfig.field_mappings)) {
    pushUniqueMessage(errors, 'Field "field_mappings" must be an array.');
  }

  if (errors.length > 0 && !Array.isArray(mappingConfig.field_mappings)) {
    return {
      isValid: false,
      errors,
      warnings,
      stats: makeStats(mappingConfig, canonicalFieldUsage)
    };
  }

  // ==========================================
  // 2. FIELD MAPPING ITEM CHECK
  // ==========================================
  const mappingIds = new Set();
  const sourceFieldUsage = new Map();
  const confirmedCanonicalFields = new Set();

  for (let index = 0; index < mappingConfig.field_mappings.length; index += 1) {
    const item = mappingConfig.field_mappings[index];
    const itemPath = `field_mappings[${index}]`;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      pushUniqueMessage(errors, `${itemPath} must be an object.`);
      continue;
    }

    // ---- id
    if (!isNonEmptyString(item.id)) {
      pushUniqueMessage(errors, `${itemPath}.id must be a non-empty string.`);
    } else if (mappingIds.has(item.id)) {
      pushUniqueMessage(errors, `Duplicate mapping id "${item.id}".`);
    } else {
      mappingIds.add(item.id);
    }

    // ---- source_fields
    if (!isValidArrayOfNonEmptyStrings(item.source_fields)) {
      pushUniqueMessage(
        errors,
        `${itemPath}.source_fields must be a non-empty array of non-empty strings.`
      );
    } else {
      for (const rawField of item.source_fields) {
        const previousCount = sourceFieldUsage.get(rawField) || 0;
        sourceFieldUsage.set(rawField, previousCount + 1);

        if (profiledRawColumns.size > 0 && !profiledRawColumns.has(rawField)) {
          pushUniqueMessage(
            errors,
            `${itemPath} references raw field "${rawField}" which does not exist in profilingResult.columns.`
          );
        }
      }
    }

    // ---- status
    if (!ALLOWED_FIELD_STATUS.includes(item.status)) {
      pushUniqueMessage(
        errors,
        `${itemPath}.status "${item.status}" is invalid. Allowed values: ${ALLOWED_FIELD_STATUS.join(", ")}.`
      );
    }

    // ---- confidence
    if (!isValidConfidence(item.confidence)) {
      pushUniqueMessage(
        errors,
        `${itemPath}.confidence must be a number between 0 and 1.`
      );
    }

    // ---- ignored / unmapped logic
    if (["ignored", "unmapped"].includes(item.status)) {
      if (item.canonical_field !== null) {
        pushUniqueMessage(
          errors,
          `${itemPath}.canonical_field must be null when status is "${item.status}".`
        );
      }

      if (item.transform !== "ignore") {
        pushUniqueMessage(
          errors,
          `${itemPath}.transform must be "ignore" when status is "${item.status}".`
        );
      }

      if (item.entity_scope !== null) {
        pushUniqueMessage(
          errors,
          `${itemPath}.entity_scope must be null when status is "${item.status}".`
        );
      }

      continue;
    }

    // ---- canonical_field
    if (!isNonEmptyString(item.canonical_field)) {
      pushUniqueMessage(errors, `${itemPath}.canonical_field must be a non-empty string.`);
      continue;
    }

    if (!canonicalFieldNames.has(item.canonical_field)) {
      pushUniqueMessage(
        errors,
        `${itemPath}.canonical_field "${item.canonical_field}" is not defined in CANONICAL_FIELDS.`
      );
      continue;
    }

    const canonicalMeta = canonicalFieldMap[item.canonical_field];
    const allowedScopes = getAllowedEntityScopes(item.canonical_field, canonicalMeta.group);

    // ---- entity_scope
    if (!ALLOWED_ENTITY_SCOPE.includes(item.entity_scope)) {
      pushUniqueMessage(
        errors,
        `${itemPath}.entity_scope "${item.entity_scope}" is invalid. Allowed values: ${ALLOWED_ENTITY_SCOPE.join(", ")}.`
      );
    } else if (!allowedScopes.includes(item.entity_scope)) {
      reportIssue({
        mode,
        severity: "strict_error",
        message: `${itemPath}.entity_scope is "${item.entity_scope}" but allowed scopes for canonical field "${item.canonical_field}" are: ${allowedScopes.join(", ")}.`,
        errors,
        warnings
      });
    }

    // ---- transform
    if (!ALLOWED_TRANSFORMS.includes(item.transform)) {
      pushUniqueMessage(
        errors,
        `${itemPath}.transform "${item.transform}" is invalid. Allowed values: ${ALLOWED_TRANSFORMS.join(", ")}.`
      );
    } else if (Array.isArray(item.source_fields) && item.source_fields.length > 0) {
      const firstRawField = item.source_fields[0];
      const profilingColumn = profilingColumnMap[firstRawField];
      const allowedTransforms = getAllowedTransforms(
        item.canonical_field,
        firstRawField,
        profilingColumn?.detected_type
      );

      if (!allowedTransforms.includes(item.transform)) {
        reportIssue({
          mode,
          severity: "strict_error",
          message: `${itemPath}.transform is "${item.transform}" but allowed transforms for canonical field "${item.canonical_field}" are: ${allowedTransforms.join(", ")}.`,
          errors,
          warnings
        });
      }

      // ---- regex validation
      if (item.transform === "regex_extract") {
        if (!item.transform_params || typeof item.transform_params.regex !== "string" || !item.transform_params.regex.trim()) {
           pushUniqueMessage(errors, `${itemPath}.transform_params.regex must be a valid non-empty string when transform is regex_extract.`);
        } else {
           try {
             new RegExp(item.transform_params.regex);
           } catch (e) {
             pushUniqueMessage(errors, `${itemPath}.transform_params.regex is an invalid regular expression: ${e.message}`);
           }
        }
      }
    }

    // ---- status consistency by mode
    if (mode === "strict" && ["suggested", "needs_review"].includes(item.status)) {
      pushUniqueMessage(
        errors,
        `${itemPath}.status must not be "${item.status}" in strict mode.`
      );
    }

    if (item.status === "confirmed" && item.confidence < 0.7) {
      reportIssue({
        mode,
        severity: "warning",
        message: `${itemPath}: confirmed with low AI confidence (${item.confidence}). This may be a manual human override — verify the mapping is intentional.`,
        errors,
        warnings
      });
    }

    // ---- usage tracking
    const previousCanonicalCount = canonicalFieldUsage.get(item.canonical_field) || 0;
    canonicalFieldUsage.set(item.canonical_field, previousCanonicalCount + 1);

    if (item.status === "confirmed") {
      confirmedCanonicalFields.add(item.canonical_field);
    }
  }

  // ==========================================
  // 3. DUPLICATE SOURCE FIELD CHECK
  // ==========================================
  for (const [rawField, count] of sourceFieldUsage.entries()) {
    if (count > 1) {
      reportIssue({
        mode,
        severity: "warning",
        message: `Raw field "${rawField}" appears in ${count} mapping items. Review whether this duplication is intentional.`,
        errors,
        warnings
      });
    }
  }

  // ==========================================
  // 4. DUPLICATE CANONICAL FIELD CHECK
  // duplication is expected in duplication-table architecture
  // ==========================================
  for (const [canonicalField, count] of canonicalFieldUsage.entries()) {
    if (count > 1) {
      reportIssue({
        mode,
        severity: "warning",
        message: `Canonical field "${canonicalField}" is mapped ${count} times. This can be valid in duplication-table architecture, but review whether the duplication is intentional.`,
        errors,
        warnings
      });
    }
  }

  // ==========================================
  // 5. REQUIRED CANONICAL FIELD COVERAGE
  // ==========================================
  const isUciDataset =
    String(mappingConfig?.source_dataset || "").toUpperCase() === "UCI" ||
    String(mappingConfig?.dataset_name || "").toUpperCase().includes("UCI");

  const isCustomDataset =
    String(mappingConfig?.source_dataset || "").toUpperCase() === "CUSTOM";

  for (const requiredField of REQUIRED_CANONICAL_FIELDS) {
    // Trong kiến trúc 3NF, không phải file nào cũng chứa cả student_id và course_id
    // Ví dụ: assessments.csv của OULAD không có student_id, courses.csv cũng không có.
    // Do đó, ta bỏ qua việc ép buộc có 2 trường này trên từng file.
    if (["student_id", "course_id"].includes(requiredField)) {
      continue;
    }

    const isCoveredInDraft =
      canonicalFieldUsage.has(requiredField) ||
      (requiredField === "source_dataset" && isNonEmptyString(mappingConfig.source_dataset));

    const isCoveredInStrict =
      confirmedCanonicalFields.has(requiredField) ||
      (requiredField === "source_dataset" && isNonEmptyString(mappingConfig.source_dataset));

    if (mode === "draft" && !isCoveredInDraft) {
      pushUniqueMessage(
        errors,
        `Required canonical field "${requiredField}" is not covered by the mapping config.`
      );
    }

    if (mode === "strict" && !isCoveredInStrict) {
      pushUniqueMessage(
        errors,
        `Required canonical field "${requiredField}" must be confirmed before strict validation passes.`
      );
    }
  }

  // ==========================================
  // 6. MAPPING STATUS CONSISTENCY
  // ==========================================
  if (mappingConfig.mapping_status === "confirmed") {
    const hasNonFinalFieldStatus = mappingConfig.field_mappings.some(
      (item) => item?.status === "suggested" || item?.status === "needs_review"
    );

    if (hasNonFinalFieldStatus) {
      reportIssue({
        mode,
        severity: "strict_error",
        message:
          'mapping_status is "confirmed" but some field mappings are still "suggested" or "needs_review".',
        errors,
        warnings
      });
    }

    if (!mappingConfig.confirmed_at) {
      reportIssue({
        mode,
        severity: "strict_error",
        message:
          'mapping_status is "confirmed" but "confirmed_at" is missing or null.',
        errors,
        warnings
      });
    }
  }

  if (mode === "strict" && mappingConfig.mapping_status !== "confirmed") {
    pushUniqueMessage(
      errors,
      'mapping_status must be "confirmed" in strict mode.'
    );
  }

  // ==========================================
  // 7. PROFILING COVERAGE WARNINGS
  // ==========================================
  if (profiledRawColumns.size > 0) {
    const referencedRawFields = new Set(
      mappingConfig.field_mappings.flatMap((item) =>
        Array.isArray(item?.source_fields) ? item.source_fields : []
      )
    );

    for (const rawField of profiledRawColumns) {
      if (!referencedRawFields.has(rawField)) {
        reportIssue({
          mode,
          severity: "warning",
          message: `Raw field "${rawField}" from profilingResult is not referenced in mappingConfig.`,
          errors,
          warnings
        });
      }
    }
  }

  // ==========================================
  // RESULT
  // ==========================================
  return {
    isValid: errors.length === 0,
    mode,
    errors,
    warnings,
    stats: makeStats(mappingConfig, canonicalFieldUsage)
  };
}
