import { normalizeText } from "../utils/textUtils.js";

function getColumnNames(profilingResult) {
  return Array.isArray(profilingResult?.columns)
    ? profilingResult.columns.map((col) => normalizeText(col.raw_column))
    : [];
}

function hasAll(columns, requiredColumns) {
  return requiredColumns.every((col) => columns.includes(normalizeText(col)));
}

function hasAny(columns, candidates) {
  return candidates.some((col) => columns.includes(normalizeText(col)));
}

export function inferFileRole({ fileName, profilingResult }) {
  const normalizedFileName = normalizeText(fileName);
  const columns = getColumnNames(profilingResult);

  if (
    normalizedFileName.includes("studentinfo") ||
    hasAll(columns, ["id_student", "gender", "highest_education", "final_result"])
  ) {
    return "student";
  }

  if (
    normalizedFileName.includes("studentassessment") ||
    hasAll(columns, ["id_student", "id_assessment", "date_submitted", "score"])
  ) {
    return "assessment";
  }

  if (
    normalizedFileName.includes("studentvle") ||
    hasAll(columns, ["id_student", "id_site", "date", "sum_click"])
  ) {
    return "engagement_event";
  }

  if (
    normalizedFileName.includes("assessments") ||
    hasAll(columns, ["id_assessment", "assessment_type", "date", "weight"])
  ) {
    return "assessment_metadata";
  }

  if (
    normalizedFileName.includes("vle") ||
    hasAll(columns, ["id_site", "activity_type"])
  ) {
    return "activity_metadata";
  }

  if (
    normalizedFileName.includes("courses") ||
    hasAll(columns, ["code_module", "code_presentation"])
  ) {
    return "course";
  }

  if (
    normalizedFileName.includes("student_mat") ||
    normalizedFileName.includes("student_por") ||
    hasAll(columns, ["school", "sex", "age", "g1", "g2", "g3"])
  ) {
    return "student_course_assessment_bundle";
  }

  return "unknown";
}

export function detectDatasetType({ fileName, profilingResult }) {
  const normalizedFileName = normalizeText(fileName);
  const columns = getColumnNames(profilingResult);

  if (
    normalizedFileName.includes("student_mat") ||
    normalizedFileName.includes("student_por") ||
    hasAll(columns, ["school", "sex", "age", "g1", "g2", "g3"])
  ) {
    return "UCI";
  }

  if (
    hasAny(columns, ["id_student", "id_assessment", "sum_click", "code_module", "code_presentation"]) &&
    (
      hasAny(columns, ["final_result", "date_submitted", "activity_type"])
    )
  ) {
    return "OULAD";
  }

  return "CUSTOM";
}

export function detectBundleSchema(uploadedFiles) {
  const roles = uploadedFiles.map((file) => file.inferredRole);
  const uniqueRoles = [...new Set(roles)];

  const hasStudent = uniqueRoles.includes("student");
  const hasAssessment = uniqueRoles.includes("assessment");
  const hasEngagement = uniqueRoles.includes("engagement_event");

  if (hasStudent && hasAssessment && hasEngagement) {
    return {
      bundle_type: "OULAD_LIKE_BUNDLE",
      confidence: 0.95
    };
  }

  if (uniqueRoles.every((role) => role === "student_course_assessment_bundle")) {
    return {
      bundle_type: "UCI_MULTI_FILE_BUNDLE",
      confidence: 0.9
    };
  }

  return {
    bundle_type: "CUSTOM_MULTI_FILE_BUNDLE",
    confidence: 0.5
  };
}