function buildUciSampleData({ batchId, variantLabel }) {
  const sourceDataset = "UCI";
  const courseId = `${batchId}_COURSE_1`;
  const classId = `${batchId}_CLASS_1`;
  const classRun = variantLabel === "MAT" ? "mat-2025" : "por-2025";
  const semester = variantLabel === "MAT" ? "Spring" : "Fall";

  const students = [
    {
      student_id: `${batchId}_STU_01`,
      gender: "F",
      age_years: 16,
      age_group: "15-17",
      region: "North",
      residence_area: "Urban",
      school: "GP",
      family_size: "GT3",
      highest_education: "secondary",
      internet_access_flag: true,
      school_support_flag: true,
      family_support_flag: true,
      mother_education_level: "secondary",
      father_education_level: "secondary",
      mother_job: "teacher",
      father_job: "services",
      guardian_type: "mother",
      parent_cohabitation_status: "T",
      travel_time: 1,
      free_time: 3,
      go_out_freq: 3,
      alcohol_weekday: 1,
      alcohol_weekend: 2,
      health_status: 4,
      family_relation: 4,
      has_romantic: false,
      has_extracurricular: true,
      has_paid_class: false,
      lifestyle_risk_score: 0.22,
      support_score: 0.75,
      social_balance_score: 0.64,
      family_stability_score: 0.78,
    },
    {
      student_id: `${batchId}_STU_02`,
      gender: "M",
      age_years: 17,
      age_group: "15-17",
      region: "North",
      residence_area: "Urban",
      school: "MS",
      family_size: "LE3",
      highest_education: "secondary",
      internet_access_flag: true,
      school_support_flag: false,
      family_support_flag: true,
      mother_education_level: "primary",
      father_education_level: "secondary",
      mother_job: "health",
      father_job: "other",
      guardian_type: "father",
      parent_cohabitation_status: "T",
      travel_time: 2,
      free_time: 2,
      go_out_freq: 4,
      alcohol_weekday: 2,
      alcohol_weekend: 3,
      health_status: 3,
      family_relation: 3,
      has_romantic: true,
      has_extracurricular: false,
      has_paid_class: true,
      lifestyle_risk_score: 0.41,
      support_score: 0.5,
      social_balance_score: 0.44,
      family_stability_score: 0.62,
    },
    {
      student_id: `${batchId}_STU_03`,
      gender: "F",
      age_years: 16,
      age_group: "15-17",
      region: "South",
      residence_area: "Rural",
      school: "GP",
      family_size: "GT3",
      highest_education: "secondary",
      internet_access_flag: false,
      school_support_flag: true,
      family_support_flag: false,
      mother_education_level: "none",
      father_education_level: "primary",
      mother_job: "at_home",
      father_job: "manual",
      guardian_type: "mother",
      parent_cohabitation_status: "A",
      travel_time: 3,
      free_time: 4,
      go_out_freq: 4,
      alcohol_weekday: 2,
      alcohol_weekend: 4,
      health_status: 3,
      family_relation: 2,
      has_romantic: false,
      has_extracurricular: true,
      has_paid_class: false,
      lifestyle_risk_score: 0.56,
      support_score: 0.25,
      social_balance_score: 0.31,
      family_stability_score: 0.38,
    },
    {
      student_id: `${batchId}_STU_04`,
      gender: "M",
      age_years: 18,
      age_group: "18-20",
      region: "Central",
      residence_area: "Urban",
      school: "MS",
      family_size: "GT3",
      highest_education: "higher",
      internet_access_flag: true,
      school_support_flag: true,
      family_support_flag: true,
      mother_education_level: "higher",
      father_education_level: "higher",
      mother_job: "teacher",
      father_job: "teacher",
      guardian_type: "mother",
      parent_cohabitation_status: "T",
      travel_time: 1,
      free_time: 2,
      go_out_freq: 2,
      alcohol_weekday: 1,
      alcohol_weekend: 1,
      health_status: 5,
      family_relation: 5,
      has_romantic: false,
      has_extracurricular: true,
      has_paid_class: true,
      lifestyle_risk_score: 0.15,
      support_score: 1.0,
      social_balance_score: 0.81,
      family_stability_score: 0.92,
    },
    {
      student_id: `${batchId}_STU_05`,
      gender: "F",
      age_years: 17,
      age_group: "15-17",
      region: "South",
      residence_area: "Rural",
      school: "GP",
      family_size: "LE3",
      highest_education: "secondary",
      internet_access_flag: true,
      school_support_flag: false,
      family_support_flag: false,
      mother_education_level: "secondary",
      father_education_level: "primary",
      mother_job: "services",
      father_job: "manual",
      guardian_type: "other",
      parent_cohabitation_status: "A",
      travel_time: 3,
      free_time: 4,
      go_out_freq: 5,
      alcohol_weekday: 3,
      alcohol_weekend: 4,
      health_status: 2,
      family_relation: 3,
      has_romantic: true,
      has_extracurricular: false,
      has_paid_class: false,
      lifestyle_risk_score: 0.67,
      support_score: 0.25,
      social_balance_score: 0.22,
      family_stability_score: 0.41,
    },
    {
      student_id: `${batchId}_STU_06`,
      gender: "M",
      age_years: 16,
      age_group: "15-17",
      region: "Central",
      residence_area: "Urban",
      school: "MS",
      family_size: "GT3",
      highest_education: "secondary",
      internet_access_flag: true,
      school_support_flag: true,
      family_support_flag: false,
      mother_education_level: "secondary",
      father_education_level: "secondary",
      mother_job: "services",
      father_job: "services",
      guardian_type: "father",
      parent_cohabitation_status: "T",
      travel_time: 2,
      free_time: 3,
      go_out_freq: 3,
      alcohol_weekday: 1,
      alcohol_weekend: 2,
      health_status: 4,
      family_relation: 4,
      has_romantic: false,
      has_extracurricular: true,
      has_paid_class: true,
      lifestyle_risk_score: 0.28,
      support_score: 0.75,
      social_balance_score: 0.59,
      family_stability_score: 0.73,
    },
  ];

  const enrollmentDetails = [
    { absences: 2, studytime: 4, final_outcome: "Pass", previous_attempt_count: 0 },
    { absences: 6, studytime: 3, final_outcome: "Pass", previous_attempt_count: 1 },
    { absences: 9, studytime: 2, final_outcome: "Fail", previous_attempt_count: 0 },
    { absences: 1, studytime: 5, final_outcome: "Distinction", previous_attempt_count: 0 },
    { absences: 10, studytime: 2, final_outcome: "Fail", previous_attempt_count: 1 },
    { absences: 4, studytime: 3, final_outcome: "Pass", previous_attempt_count: 0 },
  ];

  const assessments = [
    {
      assessment_id: `${batchId}_ASM_01`,
      assessment_name: "Progress Test 1",
      assessment_type: "quiz",
      assessment_order: 1,
      week_of_class: 2,
      due_day: 14,
      weight_pct: 20,
    },
    {
      assessment_id: `${batchId}_ASM_02`,
      assessment_name: "Progress Test 2",
      assessment_type: "quiz",
      assessment_order: 2,
      week_of_class: 5,
      due_day: 35,
      weight_pct: 20,
    },
    {
      assessment_id: `${batchId}_ASM_03`,
      assessment_name: "Project",
      assessment_type: "project",
      assessment_order: 3,
      week_of_class: 9,
      due_day: 63,
      weight_pct: 20,
    },
    {
      assessment_id: `${batchId}_ASM_04`,
      assessment_name: "Final Exam",
      assessment_type: "exam",
      assessment_order: 4,
      week_of_class: 14,
      due_day: 98,
      weight_pct: 40,
    },
  ];

  const scoreMatrix = [
    [16, 15, 17, 18],
    [13, 12, 14, 13],
    [10, 9, 11, 10],
    [19, 18, 19, 20],
    [8, 9, 10, 9],
    [14, 13, 15, 14],
  ];

  const studentsWithBatch = students.map((s) => ({
    ...s,
    batch_id: batchId,
    source_dataset: sourceDataset,
  }));

  const courses = [
    {
      course_id: courseId,
      batch_id: batchId,
      source_dataset: sourceDataset,
      course_name: variantLabel === "MAT" ? "Mathematics" : "Portuguese",
      subject_area: variantLabel === "MAT" ? "STEM" : "Language",
    },
  ];

  const classes = [
    {
      class_id: classId,
      batch_id: batchId,
      course_id: courseId,
      source_dataset: sourceDataset,
      class_run: classRun,
      semester,
      academic_year: "2025",
      duration_days: 112,
      delivery_mode: "offline",
      platform: "classroom",
    },
  ];

  const enrollments = studentsWithBatch.map((s, idx) => ({
    enrollment_id: `${batchId}_ENR_${String(idx + 1).padStart(2, "0")}`,
    batch_id: batchId,
    student_id: s.student_id,
    class_id: classId,
    source_dataset: sourceDataset,
    enrollment_start_day: null,
    enrollment_end_day: null,
    final_outcome: enrollmentDetails[idx].final_outcome,
    previous_attempt_count: enrollmentDetails[idx].previous_attempt_count,
    study_load_credits: null,
    absences: enrollmentDetails[idx].absences,
    studytime: enrollmentDetails[idx].studytime,
    registration_lead_time: null,
  }));

  const assessmentsWithBatch = assessments.map((a) => ({
    ...a,
    batch_id: batchId,
    class_id: classId,
    source_dataset: sourceDataset,
    is_final_assessment: a.assessment_type === "exam",
    competency_tag: null,
  }));

  const assessmentResults = [];
  for (let i = 0; i < enrollments.length; i += 1) {
    const enrollment = enrollments[i];
    for (let j = 0; j < assessmentsWithBatch.length; j += 1) {
      const assessment = assessmentsWithBatch[j];
      const score = scoreMatrix[i][j];
      assessmentResults.push({
        result_id: `${batchId}_RES_${String(i + 1).padStart(2, "0")}_${String(j + 1).padStart(2, "0")}`,
        batch_id: batchId,
        assessment_id: assessment.assessment_id,
        student_id: enrollment.student_id,
        enrollment_id: enrollment.enrollment_id,
        source_dataset: sourceDataset,
        score_raw: score,
        score_normalized: score,
        pass_flag: score >= 10,
        submission_day: Math.max(1, assessment.due_day + (i % 3) - 1),
        is_banked: false,
      });
    }
  }

  return {
    source_dataset: sourceDataset,
    students: studentsWithBatch,
    courses,
    classes,
    enrollments,
    assessments: assessmentsWithBatch,
    assessment_results: assessmentResults,
    events: [],
    engagements: [],
  };
}

function buildOuladSampleData({ batchId }) {
  const sourceDataset = "OULAD";
  const courseId = `${batchId}_COURSE_1`;
  const classId = `${batchId}_CLASS_1`;

  const students = [
    {
      student_id: `${batchId}_STU_01`,
      gender: "F",
      age_years: 24,
      age_group: "21-30",
      region: "East Anglia",
      residence_area: "Urban",
      highest_education: "HE Qualification",
      socioeconomic_band: "40-50%",
      imd_score_numeric: 45,
      disability_flag: false,
      disadvantage_score: 0.42,
      internet_access_flag: true,
      higher_education_intent_flag: true,
    },
    {
      student_id: `${batchId}_STU_02`,
      gender: "M",
      age_years: 29,
      age_group: "21-30",
      region: "London",
      residence_area: "Urban",
      highest_education: "A Level",
      socioeconomic_band: "20-30%",
      imd_score_numeric: 28,
      disability_flag: false,
      disadvantage_score: 0.56,
      internet_access_flag: true,
      higher_education_intent_flag: true,
    },
    {
      student_id: `${batchId}_STU_03`,
      gender: "F",
      age_years: 35,
      age_group: "31-40",
      region: "Scotland",
      residence_area: "Rural",
      highest_education: "Lower Than A Level",
      socioeconomic_band: "10-20",
      imd_score_numeric: 18,
      disability_flag: true,
      disadvantage_score: 0.74,
      internet_access_flag: true,
      higher_education_intent_flag: true,
    },
    {
      student_id: `${batchId}_STU_04`,
      gender: "M",
      age_years: 22,
      age_group: "21-30",
      region: "South",
      residence_area: "Urban",
      highest_education: "Post Graduate",
      socioeconomic_band: "70-80%",
      imd_score_numeric: 78,
      disability_flag: false,
      disadvantage_score: 0.22,
      internet_access_flag: true,
      higher_education_intent_flag: true,
    },
    {
      student_id: `${batchId}_STU_05`,
      gender: "F",
      age_years: 31,
      age_group: "31-40",
      region: "Wales",
      residence_area: "Rural",
      highest_education: "No Formal quals",
      socioeconomic_band: "0-10%",
      imd_score_numeric: 12,
      disability_flag: true,
      disadvantage_score: 0.88,
      internet_access_flag: false,
      higher_education_intent_flag: false,
    },
    {
      student_id: `${batchId}_STU_06`,
      gender: "M",
      age_years: 27,
      age_group: "21-30",
      region: "Midlands",
      residence_area: "Urban",
      highest_education: "A Level",
      socioeconomic_band: "50-60%",
      imd_score_numeric: 58,
      disability_flag: false,
      disadvantage_score: 0.34,
      internet_access_flag: true,
      higher_education_intent_flag: true,
    },
  ];

  const enrollmentDetails = [
    { registration_lead_time: 21, final_outcome: "Pass", previous_attempt_count: 0 },
    { registration_lead_time: 14, final_outcome: "Pass", previous_attempt_count: 1 },
    { registration_lead_time: 10, final_outcome: "Fail", previous_attempt_count: 1 },
    { registration_lead_time: 35, final_outcome: "Distinction", previous_attempt_count: 0 },
    { registration_lead_time: 7, final_outcome: "Withdrawn", previous_attempt_count: 2 },
    { registration_lead_time: 18, final_outcome: "Pass", previous_attempt_count: 0 },
  ];

  const assessments = [
    {
      assessment_id: `${batchId}_ASM_01`,
      assessment_name: "TMA 01",
      assessment_type: "TMA",
      assessment_order: 1,
      week_of_class: 2,
      due_day: 14,
      weight_pct: 15,
    },
    {
      assessment_id: `${batchId}_ASM_02`,
      assessment_name: "TMA 02",
      assessment_type: "TMA",
      assessment_order: 2,
      week_of_class: 5,
      due_day: 35,
      weight_pct: 20,
    },
    {
      assessment_id: `${batchId}_ASM_03`,
      assessment_name: "CMA 01",
      assessment_type: "CMA",
      assessment_order: 3,
      week_of_class: 10,
      due_day: 70,
      weight_pct: 25,
    },
    {
      assessment_id: `${batchId}_ASM_04`,
      assessment_name: "Exam",
      assessment_type: "Exam",
      assessment_order: 4,
      week_of_class: 14,
      due_day: 98,
      weight_pct: 40,
    },
  ];

  const scoreMatrix = [
    [78, 82, 88, 85],
    [60, 58, 62, 65],
    [45, 50, 52, 48],
    [91, 93, 95, 94],
    [35, 40, 38, 42],
    [70, 72, 68, 74],
  ];

  const engagementMatrix = [
    [18, 22, 15],
    [12, 15, 9],
    [7, 10, 5],
    [25, 28, 20],
    [3, 5, 2],
    [16, 18, 12],
  ];

  const studentsWithBatch = students.map((s) => ({
    ...s,
    batch_id: batchId,
    source_dataset: sourceDataset,
  }));

  const courses = [
    {
      course_id: courseId,
      batch_id: batchId,
      source_dataset: sourceDataset,
      course_name: "Distance Learning Module",
      subject_area: "General Studies",
    },
  ];

  const classes = [
    {
      class_id: classId,
      batch_id: batchId,
      course_id: courseId,
      source_dataset: sourceDataset,
      class_run: "2025B",
      semester: "B",
      academic_year: "2025",
      duration_days: 112,
      delivery_mode: "online",
      platform: "VLE",
    },
  ];

  const enrollments = studentsWithBatch.map((s, idx) => ({
    enrollment_id: `${batchId}_ENR_${String(idx + 1).padStart(2, "0")}`,
    batch_id: batchId,
    student_id: s.student_id,
    class_id: classId,
    source_dataset: sourceDataset,
    enrollment_start_day: -enrollmentDetails[idx].registration_lead_time,
    enrollment_end_day: 112,
    final_outcome: enrollmentDetails[idx].final_outcome,
    previous_attempt_count: enrollmentDetails[idx].previous_attempt_count,
    study_load_credits: 60,
    absences: null,
    studytime: null,
    registration_lead_time: enrollmentDetails[idx].registration_lead_time,
  }));

  const assessmentsWithBatch = assessments.map((a) => ({
    ...a,
    batch_id: batchId,
    class_id: classId,
    source_dataset: sourceDataset,
    is_final_assessment: a.assessment_type === "Exam",
    competency_tag: null,
  }));

  const assessmentResults = [];
  for (let i = 0; i < enrollments.length; i += 1) {
    const enrollment = enrollments[i];
    for (let j = 0; j < assessmentsWithBatch.length; j += 1) {
      const assessment = assessmentsWithBatch[j];
      const score = scoreMatrix[i][j];
      assessmentResults.push({
        result_id: `${batchId}_RES_${String(i + 1).padStart(2, "0")}_${String(j + 1).padStart(2, "0")}`,
        batch_id: batchId,
        assessment_id: assessment.assessment_id,
        student_id: enrollment.student_id,
        enrollment_id: enrollment.enrollment_id,
        source_dataset: sourceDataset,
        score_raw: score,
        score_normalized: score,
        pass_flag: score >= 40,
        submission_day: Math.max(1, assessment.due_day + ((i + j) % 5) - 2),
        is_banked: false,
      });
    }
  }

  const events = [
    {
      event_id: `${batchId}_EVT_01`,
      batch_id: batchId,
      class_id: classId,
      source_dataset: sourceDataset,
      resource_id: `${batchId}_RES_FORUM`,
      resource_type: "forum",
      available_from_week: 1,
      available_to_week: 14,
    },
    {
      event_id: `${batchId}_EVT_02`,
      batch_id: batchId,
      class_id: classId,
      source_dataset: sourceDataset,
      resource_id: `${batchId}_RES_QUIZ`,
      resource_type: "quiz",
      available_from_week: 2,
      available_to_week: 14,
    },
    {
      event_id: `${batchId}_EVT_03`,
      batch_id: batchId,
      class_id: classId,
      source_dataset: sourceDataset,
      resource_id: `${batchId}_RES_PAGE`,
      resource_type: "content_page",
      available_from_week: 1,
      available_to_week: 14,
    },
  ];

  const engagements = [];
  for (let i = 0; i < enrollments.length; i += 1) {
    const enrollment = enrollments[i];
    // Keep one student with sparse activity so low-engagement cohort queries
    // have at least one realistic positive case in sample data.
    const isSparseEngagementStudent = i === 4;

    if (isSparseEngagementStudent) {
      const sparseDay = 63;
      const sparseClicks = 1;
      engagements.push({
        engagement_id: `${batchId}_ENG_${String(i + 1).padStart(2, "0")}_01_S`,
        batch_id: batchId,
        event_id: events[0].event_id,
        student_id: enrollment.student_id,
        enrollment_id: enrollment.enrollment_id,
        source_dataset: sourceDataset,
        event_day: sparseDay,
        week_number: Math.ceil(sparseDay / 7),
        engagement_count: sparseClicks,
        log_click_score: Math.log(sparseClicks + 1),
      });
      continue;
    }

    for (let j = 0; j < events.length; j += 1) {
      const clicks = engagementMatrix[i][j];
      const day1 = 7 + (j * 7);
      const day2 = 56 + (j * 5);
      engagements.push({
        engagement_id: `${batchId}_ENG_${String(i + 1).padStart(2, "0")}_${String(j + 1).padStart(2, "0")}_A`,
        batch_id: batchId,
        event_id: events[j].event_id,
        student_id: enrollment.student_id,
        enrollment_id: enrollment.enrollment_id,
        source_dataset: sourceDataset,
        event_day: day1,
        week_number: Math.ceil(day1 / 7),
        engagement_count: clicks,
        log_click_score: Math.log(clicks + 1),
      });
      engagements.push({
        engagement_id: `${batchId}_ENG_${String(i + 1).padStart(2, "0")}_${String(j + 1).padStart(2, "0")}_B`,
        batch_id: batchId,
        event_id: events[j].event_id,
        student_id: enrollment.student_id,
        enrollment_id: enrollment.enrollment_id,
        source_dataset: sourceDataset,
        event_day: day2,
        week_number: Math.ceil(day2 / 7),
        engagement_count: Math.max(1, Math.floor(clicks * 0.7)),
        log_click_score: Math.log(Math.max(1, Math.floor(clicks * 0.7)) + 1),
      });
    }
  }

  return {
    source_dataset: sourceDataset,
    students: studentsWithBatch,
    courses,
    classes,
    enrollments,
    assessments: assessmentsWithBatch,
    assessment_results: assessmentResults,
    events,
    engagements,
  };
}

export function getSampleCanonicalData(batchId) {
  if (batchId === "SAMPLE_OULAD") {
    return buildOuladSampleData({ batchId });
  }
  if (batchId === "SAMPLE_UCI_MAT") {
    return buildUciSampleData({ batchId, variantLabel: "MAT" });
  }
  if (batchId === "SAMPLE_UCI_POR") {
    return buildUciSampleData({ batchId, variantLabel: "POR" });
  }
  throw new Error(`[SampleDataLoader] Unsupported sample batch ID: ${batchId}`);
}

export function computeCanonicalRowCount(dataset) {
  return (
    dataset.students.length +
    dataset.courses.length +
    dataset.classes.length +
    dataset.enrollments.length +
    dataset.assessments.length +
    dataset.assessment_results.length +
    dataset.events.length +
    dataset.engagements.length
  );
}
