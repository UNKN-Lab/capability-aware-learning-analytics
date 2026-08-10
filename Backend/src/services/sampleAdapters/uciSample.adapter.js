function toInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBoolFromYN(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toLowerCase();
  if (v === "yes" || v === "y" || v === "true" || v === "1") return true;
  if (v === "no" || v === "n" || v === "false" || v === "0") return false;
  return null;
}

function normalizeGender(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toUpperCase();
  if (v === "M") return "M";
  if (v === "F") return "F";
  return null;
}

function normalizeResidence(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toUpperCase();
  if (v === "U") return "Urban";
  if (v === "R") return "Rural";
  return String(value).trim() || null;
}

function deriveAgeGroup(ageYears) {
  if (ageYears === null || ageYears === undefined) return null;
  if (ageYears <= 17) return "15-17";
  if (ageYears <= 20) return "18-20";
  if (ageYears <= 25) return "21-25";
  return "26+";
}

function deriveFinalOutcome(g3Raw) {
  const g3 = toFloat(g3Raw);
  if (g3 === null) return null;
  return g3 >= 10 ? "Pass" : "Fail";
}

export async function buildUciSampleFromRows({
  batchId,
  batchName,
  rows,
  sourceFileName,
}) {
  const sourceDataset = "UCI";
  const warnings = [];
  const errors = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push(`UCI source file "${sourceFileName}" has no rows.`);
    return {
      dataset: null,
      warnings,
      errors,
      rawRowCount: 0,
    };
  }

  const variantLabel = batchId.includes("POR") ? "POR" : "MAT";
  const subject = variantLabel === "POR" ? "Portuguese" : "Mathematics";
  const courseId = `${batchId}_COURSE`;
  const classId = `${batchId}_CLASS`;

  const students = [];
  const enrollments = [];
  const assessmentResults = [];

  const assessments = [
    {
      assessment_id: `${batchId}_ASM_G1`,
      batch_id: batchId,
      class_id: classId,
      source_dataset: sourceDataset,
      assessment_name: "G1",
      assessment_type: "quiz",
      assessment_order: 1,
      due_day: 21,
      week_of_class: 3,
      weight_pct: 25,
      is_final_assessment: false,
      competency_tag: null,
    },
    {
      assessment_id: `${batchId}_ASM_G2`,
      batch_id: batchId,
      class_id: classId,
      source_dataset: sourceDataset,
      assessment_name: "G2",
      assessment_type: "quiz",
      assessment_order: 2,
      due_day: 56,
      week_of_class: 8,
      weight_pct: 35,
      is_final_assessment: false,
      competency_tag: null,
    },
    {
      assessment_id: `${batchId}_ASM_G3`,
      batch_id: batchId,
      class_id: classId,
      source_dataset: sourceDataset,
      assessment_name: "G3",
      assessment_type: "exam",
      assessment_order: 3,
      due_day: 98,
      week_of_class: 14,
      weight_pct: 40,
      is_final_assessment: true,
      competency_tag: null,
    },
  ];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const ordinal = String(index + 1).padStart(6, "0");
    const studentId = `${batchId}_STU_${ordinal}`;
    const enrollmentId = `${batchId}_ENR_${ordinal}`;

    const ageYears = toInt(row.age);
    const g1Raw = toFloat(row.G1 ?? row.g1);
    const g2Raw = toFloat(row.G2 ?? row.g2);
    const g3Raw = toFloat(row.G3 ?? row.g3);

    students.push({
      student_id: studentId,
      batch_id: batchId,
      source_dataset: sourceDataset,
      gender: normalizeGender(row.sex),
      age_years: ageYears,
      age_group: deriveAgeGroup(ageYears),
      region: null,
      residence_area: normalizeResidence(row.address),
      school: row.school ? String(row.school).trim() : null,
      family_size: row.famsize ? String(row.famsize).trim() : null,
      highest_education: null,
      socioeconomic_band: null,
      imd_score_numeric: null,
      disability_flag: null,
      higher_education_intent_flag: toBoolFromYN(row.higher),
      internet_access_flag: toBoolFromYN(row.internet),
      school_support_flag: toBoolFromYN(row.schoolsup),
      family_support_flag: toBoolFromYN(row.famsup),
      mother_education_level: row.Medu ?? null,
      father_education_level: row.Fedu ?? null,
      mother_job: row.Mjob ?? null,
      father_job: row.Fjob ?? null,
      guardian_type: row.guardian ?? null,
      parent_cohabitation_status: row.Pstatus ?? null,
      travel_time: toInt(row.traveltime),
      free_time: toInt(row.freetime),
      go_out_freq: toInt(row.goout),
      alcohol_weekday: toInt(row.Dalc),
      alcohol_weekend: toInt(row.Walc),
      health_status: toInt(row.health),
      family_relation: toInt(row.famrel),
      has_romantic: toBoolFromYN(row.romantic),
      has_extracurricular: toBoolFromYN(row.activities),
      has_paid_class: toBoolFromYN(row.paid),
    });

    enrollments.push({
      enrollment_id: enrollmentId,
      batch_id: batchId,
      student_id: studentId,
      class_id: classId,
      source_dataset: sourceDataset,
      enrollment_start_day: null,
      enrollment_end_day: null,
      final_outcome: deriveFinalOutcome(g3Raw),
      previous_attempt_count: toInt(row.failures),
      study_load_credits: null,
      absences: toInt(row.absences),
      studytime: toInt(row.studytime),
      registration_lead_time: null,
    });

    const gSeries = [
      { raw: g1Raw, assessmentId: `${batchId}_ASM_G1`, order: 1 },
      { raw: g2Raw, assessmentId: `${batchId}_ASM_G2`, order: 2 },
      { raw: g3Raw, assessmentId: `${batchId}_ASM_G3`, order: 3 },
    ];

    for (const grade of gSeries) {
      if (grade.raw === null) {
        warnings.push(
          `Missing ${grade.assessmentId.slice(-2)} for row ${index + 1} in ${sourceFileName}.`
        );
        continue;
      }
      const normalized = grade.raw * 5;
      assessmentResults.push({
        result_id: `${batchId}_RES_${ordinal}_${grade.order}`,
        batch_id: batchId,
        assessment_id: grade.assessmentId,
        student_id: studentId,
        enrollment_id: enrollmentId,
        source_dataset: sourceDataset,
        score_raw: grade.raw,
        score_normalized: normalized,
        pass_flag: normalized >= 40,
        submission_day: null,
        is_banked: false,
      });
    }
  }

  const dataset = {
    source_dataset: sourceDataset,
    students,
    courses: [
      {
        course_id: courseId,
        batch_id: batchId,
        source_dataset: sourceDataset,
        course_name: `${subject} Sample`,
        subject_area: subject,
      },
    ],
    classes: [
      {
        class_id: classId,
        batch_id: batchId,
        course_id: courseId,
        source_dataset: sourceDataset,
        class_run: variantLabel === "POR" ? "por-sample" : "mat-sample",
        semester: variantLabel === "POR" ? "Fall" : "Spring",
        academic_year: "sample",
        duration_days: 112,
        delivery_mode: "offline",
        platform: "classroom",
      },
    ],
    enrollments,
    assessments,
    assessment_results: assessmentResults,
    events: [],
    engagements: [],
  };

  return {
    dataset,
    rawRowCount: rows.length,
    warnings,
    errors,
  };
}
