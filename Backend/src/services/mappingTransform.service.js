import { CANONICAL_FIELDS } from "../config/canonicalFields.js";
import { validateMapping } from "./mappingValidation.service.js";
import { normalizeText } from "../utils/textUtils.js";
import { isOuladDataset, isUciDataset } from "../utils/datasetUtils.js";
import { surrogateKeyGenerators } from "../config/surrogateKey.js";

// ==========================================
// CONSTANTS
// ==========================================

const TARGET_ENTITIES = [
  "student",
  "course",
  "class",
  "enrollment",
  "assessment",
  "assessment_result",
  "event",
  "engagement"
];

// Logical groups from canonicalFields mapping config
const LOGICAL_GROUPS = [
  "student",
  "course",
  "enrollment",
  "assessment",
  "engagement"
];

// ==========================================
// HELPERS
// ==========================================

function buildCanonicalFieldMap() {
  return Object.fromEntries(CANONICAL_FIELDS.map((field) => [field.name, field]));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pushUnique(targetArray, message) {
  if (!targetArray.includes(message)) {
    targetArray.push(message);
  }
}

function initializeTargetBuckets() {
  const buckets = {};
  for (const entity of TARGET_ENTITIES) {
    buckets[entity] = [];
  }
  return buckets;
}

function initializeLogicalRecordMap() {
  const map = {};
  for (const group of LOGICAL_GROUPS) {
    map[group] = {};
  }
  return map;
}

function initializeTargetStats() {
  const stats = {};
  for (const entity of TARGET_ENTITIES) {
    stats[entity] = 0;
  }
  return stats;
}

function isNumericLike(value) {
  if (value === null || value === undefined || value === "") return false;
  return !Number.isNaN(Number(value));
}

function castInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return Math.trunc(parsed);
}

function castFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function castBoolean(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const normalized = normalizeText(value);
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function normalizeGender(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = normalizeText(value);
  if (["m", "male"].includes(normalized)) return "M";
  if (["f", "female"].includes(normalized)) return "F";
  return String(value).trim();
}

function normalizeScore(value, { datasetName = "", sourceDataset = "", transformParams = null } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;

  // Canonical score_normalized is always stored on a 0..100 scale.
  // Allow an explicit mapping multiplier for future/custom datasets, while
  // keeping the built-in dataset rules identical to the sample adapters.
  const explicitMultiplier = Number(transformParams?.multiplier);
  if (Number.isFinite(explicitMultiplier) && explicitMultiplier > 0) {
    return parsed * explicitMultiplier;
  }

  if (isUciDataset(datasetName, sourceDataset)) {
    return parsed * 5;
  }

  // OULAD scores and unknown sources are already expected to be 0..100.
  return parsed;
}

function convertDateToRelativeDay(value) {
  if (value === null || value === undefined || value === "") return null;
  if (isNumericLike(value)) {
    return Math.trunc(Number(value));
  }
  return null;
}

function regexExtract(value, pattern) {
  if (value === null || value === undefined || value === "") return null;
  try {
    const regex = new RegExp(pattern);
    const match = regex.exec(String(value));
    if (match) {
      // Return first capture group if it exists, otherwise the full match
      return match[1] !== undefined ? match[1] : match[0];
    }
  } catch (err) {
    // Return null if regex fails or pattern is invalid
    return null;
  }
  return null;
}

function applyTransform(transformName, rawValue, transformParams, transformContext = {}) {
  switch (transformName) {
    case "direct_copy": return rawValue ?? null;
    case "ignore": return null;
    case "cast_int": return castInt(rawValue);
    case "cast_float": return castFloat(rawValue);
    case "cast_boolean": return castBoolean(rawValue);
    case "normalize_gender": return normalizeGender(rawValue);
    case "normalize_score": return normalizeScore(rawValue, {
      ...transformContext,
      transformParams
    });
    case "convert_date_to_relative_day": return convertDateToRelativeDay(rawValue);
    case "regex_extract": return regexExtract(rawValue, transformParams?.regex);
    default: throw new Error(`Unsupported transform "${transformName}".`);
  }
}

function coerceValueToCanonicalType(value, canonicalType) {
  if (value === null || value === undefined) return null;
  switch (canonicalType) {
    case "string": return String(value);
    case "int": {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : Math.trunc(parsed);
    }
    case "float": {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    case "boolean": return castBoolean(value);
    case "date": return String(value);
    default: return value;
  }
}

function getPrimarySourceField(sourceFields) {
  if (!Array.isArray(sourceFields) || sourceFields.length === 0) return null;
  return sourceFields[0];
}

function getRowValue(rawRow, sourceField) {
  if (!isPlainObject(rawRow) || !sourceField) return null;
  return rawRow[sourceField];
}

function buildRowContext(rawRowIndex, mappingId, sourceField) {
  return `row ${rawRowIndex}, mapping "${mappingId}", source field "${sourceField}"`;
}

function deriveUciCourseId(mappingConfig) {
  const datasetName = normalizeText(mappingConfig?.dataset_name);
  if (datasetName.includes("mat")) return "UCI_MAT";
  if (datasetName.includes("por")) return "UCI_POR";
  return "UCI_COURSE";
}

function deriveOuladCourseId(rawRow) {
  const codeModule = rawRow?.code_module ? String(rawRow.code_module).trim() : null;
  if (codeModule) return codeModule;
  return null;
}

function deriveOuladCourseRun(rawRow) {
  const codePresentation = rawRow?.code_presentation ? String(rawRow.code_presentation).trim() : null;
  if (codePresentation) return codePresentation;
  return null;
}

function deriveFallbackStudentId({ mappingConfig, rawRow, rowIndex, courseId }) {
  if (rawRow?.id_student !== undefined && rawRow?.id_student !== null && rawRow?.id_student !== "") {
    return String(rawRow.id_student);
  }
  if (isUciDataset(mappingConfig?.dataset_name, mappingConfig?.source_dataset)) {
    const safeCourseId = courseId || deriveUciCourseId(mappingConfig);
    return `${safeCourseId}_STUDENT_${String(rowIndex + 1).padStart(4, "0")}`;
  }
  return null;
}

/**
 * Converts accumulated assessmentScores + assessmentBase into a list of expanded
 * assessment logic objects ready for Phase 3 dispatch.
 *
 * Rules:
 *  - 0 score entries  → skip (no score data at all)
 *  - 1 score entry    → 1 row; use assessmentBase.assessment_id if present, else derive from sourceField
 *  - N score entries  → N rows; each row uses its sourceField as the assessment_name / assessment_id
 *    (UCI G1/G2/G3 fall naturally into this path without any hardcoding)
 *
 * @param {Array<{sourceField: string, value: any}>} assessmentScores
 * @param {Object} assessmentBase  — non-score canonical assessment fields (type, weight, due_day…)
 * @returns {Array<Object>}        — array of assessmentLogic objects for processAssessment()
 */
function buildExpandedAssessmentRows(assessmentScores, assessmentBase) {
  if (assessmentScores.length === 0) return [];

  if (assessmentScores.length === 1) {
    const { sourceField, value, rawValue } = assessmentScores[0];
    return [{
      ...assessmentBase,
      score_raw: rawValue,
      score_normalized: value,
      // Respect an explicit assessment_id from the mapping; else derive from the source column name
      assessment_id: assessmentBase.assessment_id || sourceField,
      assessment_name: assessmentBase.assessment_name || sourceField
    }];
  }

  // Multiple score columns → one assessment row per column (generic unpivot / melt)
  return assessmentScores.map(({ sourceField, value, rawValue }, idx) => ({
    ...assessmentBase,
    score_raw: rawValue,
    score_normalized: value,
    // Each column becomes its own assessment; the column name IS the assessment identity
    assessment_id: sourceField,
    assessment_name: sourceField,
    // Preserve natural column order so downstream analytics can sort by assessment_order
    assessment_order: assessmentBase.assessment_order ?? (idx + 1)
  }));
}

const UCI_ASSESSMENT_DEFAULTS = {
  G1: {
    assessment_name: "G1",
    assessment_type: "quiz",
    assessment_order: 1,
    assessment_due_day: 21,
    assessment_weight_pct: 25,
    is_final_assessment: false
  },
  G2: {
    assessment_name: "G2",
    assessment_type: "quiz",
    assessment_order: 2,
    assessment_due_day: 56,
    assessment_weight_pct: 35,
    is_final_assessment: false
  },
  G3: {
    assessment_name: "G3",
    assessment_type: "exam",
    assessment_order: 3,
    assessment_due_day: 98,
    assessment_weight_pct: 40,
    is_final_assessment: true
  }
};

function enrichUciAssessmentRows(expandedAssessmentRows, mappingConfig) {
  if (!isUciDataset(mappingConfig?.dataset_name, mappingConfig?.source_dataset)) {
    return expandedAssessmentRows;
  }

  return expandedAssessmentRows.map((row) => {
    const rawName = String(row?.assessment_name || row?.assessment_id || "").trim().toUpperCase();
    const defaults = UCI_ASSESSMENT_DEFAULTS[rawName];
    if (!defaults) return row;

    // Match the sample UCI adapter for imported CSVs. Mapping editor choices
    // still win if the user explicitly provides assessment metadata.
    return {
      ...row,
      assessment_name: row.assessment_name || defaults.assessment_name,
      assessment_type: row.assessment_type || defaults.assessment_type,
      assessment_order: row.assessment_order ?? defaults.assessment_order,
      assessment_due_day: row.assessment_due_day ?? defaults.assessment_due_day,
      assessment_weight_pct: row.assessment_weight_pct ?? defaults.assessment_weight_pct,
      is_final_assessment: row.is_final_assessment ?? defaults.is_final_assessment
    };
  });
}

function normalizeAssessmentKey(value) {
  if (value === null || value === undefined) return "ASSESSMENT";
  const key = String(value).trim();
  return key.length > 0 ? key : "ASSESSMENT";
}

function deriveFinalOutcomeFromAssessments(expandedAssessmentRows = [], sourceDataset = null) {
  if (!Array.isArray(expandedAssessmentRows) || expandedAssessmentRows.length === 0) {
    return null;
  }

  const scoredRows = expandedAssessmentRows
    .map((row) => {
      const score = row?.score_normalized;
      if (score === null || score === undefined || score === "") return null;
      const numeric = Number(score);
      if (Number.isNaN(numeric)) return null;
      const rawOrder = row?.assessment_order;
      const order =
        rawOrder === null || rawOrder === undefined || rawOrder === ""
          ? null
          : Number(rawOrder);
      return { numeric, order: Number.isNaN(order) ? null : order };
    })
    .filter(Boolean);

  if (scoredRows.length === 0) return null;

  // Prefer the final checkpoint score when order exists, otherwise the latest observed score.
  const ordered = [...scoredRows].sort((a, b) => {
    if (a.order === null && b.order === null) return 0;
    if (a.order === null) return 1;
    if (b.order === null) return -1;
    return a.order - b.order;
  });

  const finalScore = ordered[ordered.length - 1].numeric;
  // score_normalized is canonical 0..100; keep outcome derivation aligned
  // with source outcome semantics. UCI defines passing as G3 >= 10/20,
  // which is 50/100 after normalization. Other datasets keep the platform
  // runtime pass threshold when no explicit final_outcome is supplied.
  const passThreshold = String(sourceDataset || "").toUpperCase() === "UCI" ? 50 : 40;
  return finalScore >= passThreshold ? "Pass" : "Fail";
}

// Helper to filter out properties that are undefined (keeps nulls)
function extractModelProps(record, keys) {
  const obj = {};
  for (const key of keys) {
    if (record[key] !== undefined) {
      obj[key] = record[key];
    }
  }
  return obj;
}

// ==========================================
// MAIN SERVICE
// ==========================================

export function transformRawRowsToCanonical({
  mappingConfig,
  profilingResult,
  rawRows,
  batchId // Newly required for linking in DB
}) {
  const validationResult = validateMapping({
    mappingConfig,
    profilingResult,
    mode: "strict"
  });

  if (!validationResult.isValid) {
    const error = new Error("Mapping transform failed: mappingConfig did not pass strict validation.");
    error.code = "MAPPING_TRANSFORM_VALIDATION_FAILED";
    error.validationResult = validationResult;
    throw error;
  }

  if (!Array.isArray(rawRows)) {
    const error = new Error('Invalid rawRows: expected an array of parsed row objects.');
    error.code = "INVALID_RAW_ROWS";
    throw error;
  }

  const sourceDataset = mappingConfig.source_dataset || "CUSTOM";
  const safeBatchId = batchId || "TEMPORARY_BATCH";

  const canonicalFieldMap = buildCanonicalFieldMap();
  const output = initializeTargetBuckets();
  const targetEntityRowCounts = initializeTargetStats();
  const warnings = [];

  const activeMappings = Array.isArray(mappingConfig.field_mappings)
    ? mappingConfig.field_mappings.filter(
      (item) =>
        isPlainObject(item) &&
        item.status === "confirmed" &&
        item.transform !== "ignore" &&
        typeof item.canonical_field === "string" &&
        item.canonical_field.trim().length > 0
    )
    : [];

  let transformedValueCount = 0;
  let skippedMappingCount = 0;
  let skippedRowCount = 0;

  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const rawRow = rawRows[rowIndex];

    if (!isPlainObject(rawRow)) {
      skippedRowCount += 1;
      pushUnique(warnings, `Row at index ${rowIndex} is not a valid object and was skipped.`);
      continue;
    }

    const logicalRecordMap = initializeLogicalRecordMap();
    // Generic unpivot accumulators — populated during Phase 1
    const assessmentScores = []; // [{sourceField, value}] — one entry per score_normalized mapping
    const assessmentBase = {};   // all other assessment canonical fields

    // Phase 1: Gather mapped fields into logical groups
    for (const mappingItem of activeMappings) {
      const logicalGroup = LOGICAL_GROUPS.includes(mappingItem.entity_scope)
        ? mappingItem.entity_scope
        : (mappingItem.entity_scope === "system" ? "system" : null);

      if (!logicalGroup) {
        skippedMappingCount += 1;
        pushUnique(warnings, `Mapping "${mappingItem.id}" has unsupported entity_scope "${mappingItem.entity_scope}".`);
        continue;
      }

      const canonicalFieldName = mappingItem.canonical_field;
      const canonicalMeta = canonicalFieldMap[canonicalFieldName];

      if (!canonicalMeta) {
        skippedMappingCount += 1;
        pushUnique(warnings, `Mapping "${mappingItem.id}" references unknown canonical field "${canonicalFieldName}".`);
        continue;
      }

      const primarySourceField = getPrimarySourceField(mappingItem.source_fields);
      if (!primarySourceField) {
        skippedMappingCount += 1;
        continue;
      }

      const rawValue = getRowValue(rawRow, primarySourceField);
      let transformedValue;

      try {
        transformedValue = applyTransform(
          mappingItem.transform,
          rawValue,
          mappingItem.transform_params,
          {
            datasetName: mappingConfig?.dataset_name,
            sourceDataset: mappingConfig?.source_dataset
          }
        );
      } catch (error) {
        skippedMappingCount += 1;
        pushUnique(warnings, `Transform failed for ${buildRowContext(rowIndex, mappingItem.id, primarySourceField)}.`);
        continue;
      }

      const finalValue = coerceValueToCanonicalType(transformedValue, canonicalMeta.type);

      if (logicalGroup === "system") {
        continue; // system fields are not dumped into entities
      }

      // ── Generic Assessment Unpivot ──────────────────────────────────────────
      // Instead of overwriting logicalRecordMap.assessment.score_normalized on
      // every iteration (which causes data loss when multiple score columns are
      // mapped), we ACCUMULATE them and defer row generation to Phase 1.5.
      if (logicalGroup === "assessment" && canonicalFieldName === "score_normalized") {
        assessmentScores.push({
          sourceField: primarySourceField,
          value: finalValue,
          rawValue: normalizeScore(rawValue)
        });
        transformedValueCount += 1;
        continue;
      }

      if (logicalGroup === "assessment") {
        // Non-score assessment fields (type, weight, due_day, etc.) — shared across all rows
        assessmentBase[canonicalFieldName] = finalValue;
        transformedValueCount += 1;
        continue;
      }

      logicalRecordMap[logicalGroup][canonicalFieldName] = finalValue;
      transformedValueCount += 1;
    }

    // Phase 1.5: Build expanded assessment rows from accumulated scores
    // This converts N score columns into N distinct assessmentLogic objects.
    const expandedAssessmentRows = enrichUciAssessmentRows(
      buildExpandedAssessmentRows(assessmentScores, assessmentBase),
      mappingConfig
    );

    // Phase 2: Derive Contextual IDs (Surrogate Keys)
    const courseLogic = logicalRecordMap.course;
    const studentLogic = logicalRecordMap.student;
    const enrollmentLogic = logicalRecordMap.enrollment;
    const engagementLogic = logicalRecordMap.engagement;

    let derivedCourseId = courseLogic.course_id || null;
    let derivedCourseRun = courseLogic.course_run || null;

    if (isOuladDataset(mappingConfig?.dataset_name, mappingConfig?.source_dataset)) {
      if (!derivedCourseId) derivedCourseId = deriveOuladCourseId(rawRow);
      if (!derivedCourseRun) derivedCourseRun = deriveOuladCourseRun(rawRow);
    } else if (isUciDataset(mappingConfig?.dataset_name, mappingConfig?.source_dataset)) {
      if (!derivedCourseId) derivedCourseId = deriveUciCourseId(mappingConfig);
      if (!derivedCourseRun) derivedCourseRun = "DEFAULT_RUN"; // UCI doesn't have class runs
    }

    let derivedStudentId = studentLogic.student_id || null;
    if (!derivedStudentId) {
      derivedStudentId = deriveFallbackStudentId({ mappingConfig, rawRow, rowIndex, courseId: derivedCourseId });
    }

    // Must have at least basic keys to proceed with relations
    // Scope class identity by batch to prevent cross-batch collisions when
    // datasets share the same course/run labels (e.g. repeated UCI imports).
    const classId = (derivedCourseId && derivedCourseRun)
      ? surrogateKeyGenerators.class_id(`${safeBatchId}::${derivedCourseId}`, derivedCourseRun)
      : null;
    const enrollmentId = (derivedStudentId && classId) ? surrogateKeyGenerators.enrollment_id(derivedStudentId, classId) : null;

    // Phase 3: Shatter into 8 Entities
    const hasData = (obj) => Object.keys(obj).length > 0;

    // 1. COURSE
    // For flat-file datasets (UCI), courseLogic may be empty because no columns
    // are mapped to scope "course", but we still derive courseId/courseRun.
    // We must always create course+class records when IDs are derived.
    if (derivedCourseId) {
      output.course.push({
        batch_id: safeBatchId,
        source_dataset: sourceDataset,
        course_id: derivedCourseId,
        course_name: courseLogic.course_name || derivedCourseId,
        subject_area: courseLogic.subject_area
      });
      targetEntityRowCounts.course += 1;

      // 2. CLASS (Derived from Course logically)
      if (derivedCourseRun && classId) {
        output.class.push({
          batch_id: safeBatchId,
          source_dataset: sourceDataset,
          class_id: classId,
          course_id: derivedCourseId,
          class_run: derivedCourseRun,
          duration_days: courseLogic.course_duration_days
        });
        targetEntityRowCounts.class += 1;
      }
    }

    // 3. STUDENT
    if (derivedStudentId && hasData(studentLogic)) {
      output.student.push({
        batch_id: safeBatchId,
        source_dataset: sourceDataset,
        student_id: derivedStudentId,
        gender: studentLogic.gender,
        age_years: studentLogic.age_years,
        age_group: studentLogic.age_group,
        region: studentLogic.region,
        residence_area: studentLogic.residence_area,
        school: studentLogic.school,
        family_size: studentLogic.family_size,
        highest_education: studentLogic.highest_education,
        socioeconomic_band: studentLogic.socioeconomic_band,
        imd_score_numeric: studentLogic.imd_score_numeric,
        disability_flag: studentLogic.disability_flag,
        higher_education_intent_flag: studentLogic.higher_education_intent_flag,
        internet_access_flag: studentLogic.internet_access_flag,
        school_support_flag: studentLogic.school_support_flag,
        family_support_flag: studentLogic.family_support_flag,
        mother_education_level: studentLogic.mother_education_level,
        father_education_level: studentLogic.father_education_level,
        mother_job: studentLogic.mother_job,
        father_job: studentLogic.father_job,
        guardian_type: studentLogic.guardian_type,
        parent_cohabitation_status: studentLogic.parent_cohabitation_status,
        travel_time: studentLogic.travel_time,
        free_time: studentLogic.free_time,
        go_out_freq: studentLogic.go_out_freq,
        alcohol_weekday: studentLogic.alcohol_weekday,
        alcohol_weekend: studentLogic.alcohol_weekend,
        health_status: studentLogic.health_status,
        family_relation: studentLogic.family_relation,
        has_romantic: studentLogic.has_romantic,
        has_extracurricular: studentLogic.has_extracurricular,
        has_paid_class: studentLogic.has_paid_class
      });
      targetEntityRowCounts.student += 1;
    }

    // 4. ENROLLMENT
    if (enrollmentId) {
      const derivedFinalOutcome =
        enrollmentLogic.final_outcome || deriveFinalOutcomeFromAssessments(expandedAssessmentRows, sourceDataset);

      // Compute registration_lead_time [FE]: ABS(enrollment_start_day) only when day < 0 (registered early)
      const startDay = enrollmentLogic.enrollment_start_day != null ? Number(enrollmentLogic.enrollment_start_day) : null;
      const registrationLeadTime = (startDay !== null && startDay < 0) ? Math.abs(startDay) : null;

      output.enrollment.push({
        batch_id: safeBatchId,
        source_dataset: sourceDataset,
        enrollment_id: enrollmentId,
        student_id: derivedStudentId,
        class_id: classId,
        enrollment_start_day: enrollmentLogic.enrollment_start_day,
        enrollment_end_day: enrollmentLogic.enrollment_end_day,
        final_outcome: derivedFinalOutcome,
        previous_attempt_count: enrollmentLogic.previous_attempt_count,
        study_load_credits: courseLogic.study_load_credits,
        absences: enrollmentLogic.absence_count ?? null,  // UCI: absences from enrollment (mapped via uci.rules.js)
        studytime: enrollmentLogic.studytime,         // UCI: weekly self-study time 1-4. NULL for OULAD
        registration_lead_time: registrationLeadTime  // [FE] days registered before class start
      });
      targetEntityRowCounts.enrollment += 1;
    }

    // Helper to process a single assessment record
    const processAssessment = (aLogic) => {
      if (!classId) return;

      const rawAssessmentName = aLogic.assessment_name || aLogic.assessment_id || "ASSESSMENT";
      const assessmentKey = normalizeAssessmentKey(aLogic.assessment_id || rawAssessmentName);
      // Scope assessment id to class to avoid collision across datasets/batches (e.g. G1/G2/G3).
      const derivedAssessmentId = surrogateKeyGenerators.assessment_id(classId, assessmentKey);

      // 5. ASSESSMENT
      // [FE] week_of_class: CEIL(due_day / 7) — in-table, no JOIN needed
      const dueDayNum = aLogic.assessment_due_day != null ? Number(aLogic.assessment_due_day) : null;
      const weekOfClass = (dueDayNum !== null && !Number.isNaN(dueDayNum)) ? Math.ceil(dueDayNum / 7) : null;

      output.assessment.push({
        batch_id: safeBatchId,
        source_dataset: sourceDataset,
        assessment_id: derivedAssessmentId,
        class_id: classId,
        assessment_name: aLogic.assessment_name,
        assessment_type: aLogic.assessment_type,
        assessment_order: aLogic.assessment_order,
        due_day: aLogic.assessment_due_day,
        week_of_class: weekOfClass,            // [FE] CEIL(due_day / 7)
        weight_pct: aLogic.assessment_weight_pct,
        is_final_assessment: aLogic.is_final_assessment
      });
      targetEntityRowCounts.assessment += 1;

      // 6. ASSESSMENT_RESULT
      if (enrollmentId && (aLogic.score_normalized !== undefined || aLogic.pass_flag !== undefined)) {
        const resultId = aLogic.assessment_result_id || surrogateKeyGenerators.result_id(derivedStudentId, derivedAssessmentId);

        // [FE] pass_flag: score_normalized >= 40 — in-table, always auto-computed
        // Source mapping may carry pass_flag but we override with the canonical rule
        const scoreNum = aLogic.score_normalized != null ? Number(aLogic.score_normalized) : null;
        const computedPassFlag = (scoreNum !== null && !Number.isNaN(scoreNum)) ? scoreNum >= 40 : null;

        output.assessment_result.push({
          batch_id: safeBatchId,
          source_dataset: sourceDataset,
          result_id: resultId,
          assessment_id: derivedAssessmentId,
          student_id: derivedStudentId,
          enrollment_id: enrollmentId,
          score_raw: aLogic.score_raw,
          score_normalized: aLogic.score_normalized,
          submission_day: aLogic.submission_day,
          // submission_delay_days intentionally omitted — not stored in DB per spec.
          // Computed on-the-fly via JOIN with assessment.due_day when needed.
          pass_flag: computedPassFlag,           // [FE] score_normalized >= 40
          is_banked: aLogic.is_banked
        });
        targetEntityRowCounts.assessment_result += 1;
      }
    };

    // Dispatch all assessment rows (unified — covers both single-score and multi-score/unpivot cases)
    for (const expandedRow of expandedAssessmentRows) {
      processAssessment(expandedRow);
    }

    // 7. EVENT & 8. ENGAGEMENT
    if (classId && hasData(engagementLogic) && engagementLogic.engagement_count !== undefined) {
      const rawResourceId = engagementLogic.resource_id || "EVENT";
      const derivedEventId = engagementLogic.engagement_event_id || surrogateKeyGenerators.event_id(classId, rawResourceId);

      // EVENT
      output.event.push({
        batch_id: safeBatchId,
        source_dataset: sourceDataset,
        event_id: derivedEventId,
        class_id: classId,
        resource_id: engagementLogic.resource_id,
        resource_type: engagementLogic.resource_type
      });
      targetEntityRowCounts.event += 1;

      // ENGAGEMENT
      if (enrollmentId) {
        const rawCount = engagementLogic.engagement_count;
        const countNum = rawCount != null ? Number(rawCount) : null;

        // [FE] log_click_score: log(engagement_count + 1) — row-level click intensity, in-table
        const logClickScore = countNum !== null ? Math.log(countNum + 1) : null;

        const derivedEngagementId = surrogateKeyGenerators.engagement_id(derivedStudentId, derivedEventId, engagementLogic.event_day || 0);
        output.engagement.push({
          batch_id: safeBatchId,
          source_dataset: sourceDataset,
          engagement_id: derivedEngagementId,
          event_id: derivedEventId,
          student_id: derivedStudentId,
          enrollment_id: enrollmentId,
          engagement_count: rawCount,
          event_day: engagementLogic.event_day,
          week_number: engagementLogic.week_number,
          log_click_score: logClickScore    // [FE] log(count+1)
        });
        targetEntityRowCounts.engagement += 1;
      }
    }
  }

  // Final cleanup step: Remove completely undefined fields from all output records
  const cleanOutput = initializeTargetBuckets();
  for (const entity of TARGET_ENTITIES) {
    cleanOutput[entity] = output[entity].map(record => {
      const cleanRecord = {};
      for (const [key, value] of Object.entries(record)) {
        if (value !== undefined) cleanRecord[key] = value;
      }
      return cleanRecord;
    });
  }

  return {
    dataset_name: mappingConfig.dataset_name,
    source_dataset: sourceDataset,
    mapping_version: mappingConfig.version,
    transformed_at: new Date().toISOString(),
    output: cleanOutput,
    summary: {
      input_row_count: rawRows.length,
      active_mapping_count: activeMappings.length,
      transformed_value_count: transformedValueCount,
      skipped_mapping_count: skippedMappingCount,
      skipped_row_count: skippedRowCount,
      target_entity_row_counts: targetEntityRowCounts
    },
    warnings,
    validationResult: deepClone(validationResult)
  };
}
