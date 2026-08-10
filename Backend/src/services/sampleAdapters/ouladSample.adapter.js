import { parseImdBandMidpoint } from "../compositeFeatures.service.js";

function norm(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

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
  const v = norm(value).toLowerCase();
  if (v === "y" || v === "yes" || v === "1" || v === "true") return true;
  if (v === "n" || v === "no" || v === "0" || v === "false") return false;
  return null;
}

function buildClassKey(moduleCode, presentation) {
  return `${moduleCode}::${presentation}`;
}

function toStudentId(batchId, rawStudentId) {
  return `${batchId}_STU_${norm(rawStudentId)}`;
}

function toCourseId(batchId, moduleCode) {
  return `${batchId}_COURSE_${moduleCode}`;
}

function toClassId(batchId, moduleCode, presentation) {
  return `${batchId}_CLASS_${moduleCode}_${presentation}`;
}

function toEnrollmentId(batchId, classId, studentId) {
  return `${batchId}_ENR_${classId}_${studentId}`;
}

function toAssessmentId(batchId, rawAssessmentId) {
  return `${batchId}_ASM_${norm(rawAssessmentId)}`;
}

function toEventId(batchId, rawSiteId) {
  return `${batchId}_EVT_${norm(rawSiteId)}`;
}

function toResultId(batchId, enrollmentId, assessmentId) {
  return `${batchId}_RES_${enrollmentId}_${assessmentId}`;
}

function toEngagementId(batchId, studentId, eventId, eventDay) {
  return `${batchId}_ENG_${studentId}_${eventId}_${eventDay}`;
}

export async function buildOuladSampleFromStreams({
  batchId,
  sourceDataset,
  iterateFileRows,
  mode = "dry-run",
  engagementChunkSize = 10000,
  onEngagementChunk = null,
  scanEngagementRows = true,
}) {
  const warnings = [];
  const errors = [];
  const rawRowCounts = {};
  let missingEventWarningCount = 0;
  const maxMissingEventWarnings = 200;

  const coursesById = new Map();
  const classesByKey = new Map();
  const studentsById = new Map();
  const enrollmentsByKey = new Map();
  const assessmentsById = new Map();
  const assessmentsByClass = new Map();
  const assessmentIdToClassId = new Map();
  const eventsByKey = new Map();
  const assessmentResultsByKey = new Map();

  await iterateFileRows("courses.csv", (row) => {
    const moduleCode = norm(row.code_module);
    const presentation = norm(row.code_presentation);
    if (!moduleCode || !presentation) return;

    const classKey = buildClassKey(moduleCode, presentation);
    const courseId = toCourseId(batchId, moduleCode);
    const classId = toClassId(batchId, moduleCode, presentation);

    if (!coursesById.has(courseId)) {
      coursesById.set(courseId, {
        course_id: courseId,
        batch_id: batchId,
        source_dataset: sourceDataset,
        course_name: moduleCode,
        subject_area: null,
      });
    }

    classesByKey.set(classKey, {
      class_id: classId,
      batch_id: batchId,
      course_id: courseId,
      source_dataset: sourceDataset,
      class_run: presentation,
      semester: presentation,
      academic_year: null,
      duration_days: toInt(row.module_presentation_length),
      delivery_mode: "online",
      platform: "VLE",
    });
  }, rawRowCounts);

  await iterateFileRows("studentInfo.csv", (row) => {
    const moduleCode = norm(row.code_module);
    const presentation = norm(row.code_presentation);
    const rawStudent = norm(row.id_student);
    if (!moduleCode || !presentation || !rawStudent) return;

    const classKey = buildClassKey(moduleCode, presentation);
    const classEntry = classesByKey.get(classKey);
    if (!classEntry) {
      warnings.push(`studentInfo references missing class key ${classKey}.`);
      return;
    }

    const studentId = toStudentId(batchId, rawStudent);
    const enrollmentKey = `${classEntry.class_id}::${studentId}`;
    const enrollmentId = toEnrollmentId(batchId, classEntry.class_id, studentId);

    const socioeconomicBand = norm(row.imd_band) || null;
    if (!studentsById.has(studentId)) {
      studentsById.set(studentId, {
        student_id: studentId,
        batch_id: batchId,
        source_dataset: sourceDataset,
        gender: norm(row.gender) || null,
        age_years: null,
        age_group: norm(row.age_band) || null,
        region: norm(row.region) || null,
        residence_area: null,
        school: null,
        family_size: null,
        highest_education: norm(row.highest_education) || null,
        socioeconomic_band: socioeconomicBand,
        imd_score_numeric: parseImdBandMidpoint(socioeconomicBand),
        disability_flag: toBoolFromYN(row.disability),
        higher_education_intent_flag: null,
        internet_access_flag: null,
        school_support_flag: null,
        family_support_flag: null,
        mother_education_level: null,
        father_education_level: null,
        mother_job: null,
        father_job: null,
        guardian_type: null,
        parent_cohabitation_status: null,
        travel_time: null,
        free_time: null,
        go_out_freq: null,
        alcohol_weekday: null,
        alcohol_weekend: null,
        health_status: null,
        family_relation: null,
        has_romantic: null,
        has_extracurricular: null,
        has_paid_class: null,
      });
    }

    const existingEnrollment = enrollmentsByKey.get(enrollmentKey);
    if (existingEnrollment) {
      existingEnrollment.final_outcome = existingEnrollment.final_outcome || norm(row.final_result) || null;
      existingEnrollment.previous_attempt_count =
        existingEnrollment.previous_attempt_count ?? toInt(row.num_of_prev_attempts);
      existingEnrollment.study_load_credits =
        existingEnrollment.study_load_credits ?? toInt(row.studied_credits);
    } else {
      enrollmentsByKey.set(enrollmentKey, {
        enrollment_id: enrollmentId,
        batch_id: batchId,
        student_id: studentId,
        class_id: classEntry.class_id,
        source_dataset: sourceDataset,
        enrollment_start_day: null,
        enrollment_end_day: null,
        final_outcome: norm(row.final_result) || null,
        previous_attempt_count: toInt(row.num_of_prev_attempts),
        study_load_credits: toInt(row.studied_credits),
        absences: null,
        studytime: null,
        registration_lead_time: null,
      });
    }
  }, rawRowCounts);

  await iterateFileRows("studentRegistration.csv", (row) => {
    const moduleCode = norm(row.code_module);
    const presentation = norm(row.code_presentation);
    const rawStudent = norm(row.id_student);
    if (!moduleCode || !presentation || !rawStudent) return;

    const classKey = buildClassKey(moduleCode, presentation);
    const classEntry = classesByKey.get(classKey);
    if (!classEntry) return;

    const studentId = toStudentId(batchId, rawStudent);
    const enrollmentKey = `${classEntry.class_id}::${studentId}`;
    const existing = enrollmentsByKey.get(enrollmentKey);
    if (!existing) return;

    existing.enrollment_start_day = toInt(row.date_registration);
    existing.enrollment_end_day = toInt(row.date_unregistration);
    existing.registration_lead_time =
      existing.enrollment_start_day !== null && existing.enrollment_start_day < 0
        ? Math.abs(existing.enrollment_start_day)
        : null;
  }, rawRowCounts);

  await iterateFileRows("assessments.csv", (row) => {
    const moduleCode = norm(row.code_module);
    const presentation = norm(row.code_presentation);
    const rawAssessmentId = norm(row.id_assessment);
    if (!moduleCode || !presentation || !rawAssessmentId) return;

    const classKey = buildClassKey(moduleCode, presentation);
    const classEntry = classesByKey.get(classKey);
    if (!classEntry) return;

    const assessmentId = toAssessmentId(batchId, rawAssessmentId);
    const dueDay = toInt(row.date);
    const assessment = {
      assessment_id: assessmentId,
      batch_id: batchId,
      class_id: classEntry.class_id,
      source_dataset: sourceDataset,
      assessment_name: rawAssessmentId,
      assessment_type: norm(row.assessment_type) || null,
      assessment_order: null,
      due_day: dueDay,
      week_of_class: dueDay !== null ? Math.ceil(dueDay / 7) : null,
      weight_pct: toFloat(row.weight),
      is_final_assessment: norm(row.assessment_type).toLowerCase() === "exam",
      competency_tag: null,
    };

    assessmentsById.set(assessmentId, assessment);
    assessmentIdToClassId.set(rawAssessmentId, classEntry.class_id);

    if (!assessmentsByClass.has(classEntry.class_id)) {
      assessmentsByClass.set(classEntry.class_id, []);
    }
    assessmentsByClass.get(classEntry.class_id).push(assessmentId);
  }, rawRowCounts);

  for (const [classId, ids] of assessmentsByClass.entries()) {
    const ordered = ids
      .map((id) => assessmentsById.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        const da = a.due_day ?? Number.MAX_SAFE_INTEGER;
        const db = b.due_day ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return a.assessment_id.localeCompare(b.assessment_id);
      });
    for (let i = 0; i < ordered.length; i += 1) {
      ordered[i].assessment_order = i + 1;
      assessmentsById.set(ordered[i].assessment_id, ordered[i]);
    }
    assessmentsByClass.set(
      classId,
      ordered.map((item) => item.assessment_id)
    );
  }

  await iterateFileRows("studentAssessment.csv", (row) => {
    const rawAssessmentId = norm(row.id_assessment);
    const rawStudent = norm(row.id_student);
    if (!rawAssessmentId || !rawStudent) return;

    const classId = assessmentIdToClassId.get(rawAssessmentId);
    if (!classId) return;

    const studentId = toStudentId(batchId, rawStudent);
    const enrollmentKey = `${classId}::${studentId}`;
    const enrollment = enrollmentsByKey.get(enrollmentKey);
    if (!enrollment) return;

    const assessmentId = toAssessmentId(batchId, rawAssessmentId);
    if (!assessmentsById.has(assessmentId)) return;

    const resultKey = `${enrollment.enrollment_id}::${assessmentId}`;
    const scoreRaw = toFloat(row.score);
    const submissionDay = toInt(row.date_submitted);
    const nextRecord = {
      result_id: toResultId(batchId, enrollment.enrollment_id, assessmentId),
      batch_id: batchId,
      assessment_id: assessmentId,
      student_id: studentId,
      enrollment_id: enrollment.enrollment_id,
      source_dataset: sourceDataset,
      score_raw: scoreRaw,
      score_normalized: scoreRaw,
      pass_flag: scoreRaw !== null ? scoreRaw >= 40 : null,
      submission_day: submissionDay,
      is_banked: toBoolFromYN(row.is_banked),
    };

    if (!assessmentResultsByKey.has(resultKey)) {
      assessmentResultsByKey.set(resultKey, nextRecord);
      return;
    }

    const prev = assessmentResultsByKey.get(resultKey);
    const prevDay = prev.submission_day ?? -999999;
    const nextDay = nextRecord.submission_day ?? -999999;
    if (nextDay >= prevDay) {
      assessmentResultsByKey.set(resultKey, nextRecord);
    }
  }, rawRowCounts);

  await iterateFileRows("vle.csv", (row) => {
    const moduleCode = norm(row.code_module);
    const presentation = norm(row.code_presentation);
    const siteId = norm(row.id_site);
    if (!moduleCode || !presentation || !siteId) return;

    const classKey = buildClassKey(moduleCode, presentation);
    const classEntry = classesByKey.get(classKey);
    if (!classEntry) return;

    const eventKey = `${classEntry.class_id}::${siteId}`;
    if (!eventsByKey.has(eventKey)) {
      eventsByKey.set(eventKey, {
        event_id: toEventId(batchId, siteId),
        batch_id: batchId,
        class_id: classEntry.class_id,
        source_dataset: sourceDataset,
        resource_id: siteId,
        resource_type: norm(row.activity_type) || null,
        available_from_week: toInt(row.week_from),
        available_to_week: toInt(row.week_to),
      });
    }
  }, rawRowCounts);

  const classes = Array.from(classesByKey.values());
  const classIdSet = new Set(classes.map((item) => item.class_id));
  const students = Array.from(studentsById.values());
  const studentIdSet = new Set(students.map((item) => item.student_id));
  const courses = Array.from(coursesById.values());
  const assessments = Array.from(assessmentsById.values()).filter((item) =>
    classIdSet.has(item.class_id)
  );
  const assessmentIdSet = new Set(assessments.map((item) => item.assessment_id));
  const enrollments = Array.from(enrollmentsByKey.values()).filter(
    (item) => classIdSet.has(item.class_id) && studentIdSet.has(item.student_id)
  );
  const enrollmentIdSet = new Set(enrollments.map((item) => item.enrollment_id));
  const events = Array.from(eventsByKey.values()).filter((item) =>
    classIdSet.has(item.class_id)
  );
  const eventIdBySite = new Map();
  for (const event of events) {
    eventIdBySite.set(norm(event.resource_id), event.event_id);
  }

  const assessmentResults = Array.from(assessmentResultsByKey.values()).filter(
    (item) => enrollmentIdSet.has(item.enrollment_id) && assessmentIdSet.has(item.assessment_id)
  );

  let engagementCount = 0;
  let engagementBuffer = [];
  const flushEngagementBuffer = async () => {
    if (engagementBuffer.length === 0) return;
    if (mode === "apply" && typeof onEngagementChunk === "function") {
      // eslint-disable-next-line no-await-in-loop
      await onEngagementChunk(engagementBuffer);
    }
    engagementBuffer = [];
  };

  if (scanEngagementRows) {
    await iterateFileRows("studentVle.csv", async (row) => {
      const moduleCode = norm(row.code_module);
      const presentation = norm(row.code_presentation);
      const rawStudent = norm(row.id_student);
      const siteId = norm(row.id_site);
      if (!moduleCode || !presentation || !rawStudent || !siteId) return;

      const classKey = buildClassKey(moduleCode, presentation);
      const classEntry = classesByKey.get(classKey);
      if (!classEntry) return;

      const studentId = toStudentId(batchId, rawStudent);
      const enrollmentKey = `${classEntry.class_id}::${studentId}`;
      const enrollment = enrollmentsByKey.get(enrollmentKey);
      if (!enrollment || !enrollmentIdSet.has(enrollment.enrollment_id)) return;

      const eventId = eventIdBySite.get(siteId);
      if (!eventId) {
        if (missingEventWarningCount < maxMissingEventWarnings) {
          warnings.push(
            `Missing event for studentVle row: id_site=${siteId}, code_module=${moduleCode}, code_presentation=${presentation}, student_id=${rawStudent}.`
          );
        }
        missingEventWarningCount += 1;
        return;
      }

      const eventDay = toInt(row.date);
      if (eventDay === null) return;

      const clicks = toInt(row.sum_click) ?? 0;
      const engagementRow = {
        engagement_id: toEngagementId(batchId, studentId, eventId, eventDay),
        batch_id: batchId,
        event_id: eventId,
        student_id: studentId,
        enrollment_id: enrollment.enrollment_id,
        source_dataset: sourceDataset,
        event_day: eventDay,
        week_number: Math.floor(eventDay / 7) + 1,
        engagement_count: clicks,
        log_click_score: Math.log(clicks + 1),
      };

      engagementCount += 1;
      if (mode === "apply") {
        engagementBuffer.push(engagementRow);
        if (engagementBuffer.length >= engagementChunkSize) {
          await flushEngagementBuffer();
        }
      }
    }, rawRowCounts);

    await flushEngagementBuffer();
  } else {
    rawRowCounts["studentVle.csv"] = null;
    warnings.push("studentVle.csv scan skipped for fast OULAD preflight.");
  }
  if (missingEventWarningCount > maxMissingEventWarnings) {
    warnings.push(
      `Missing event warnings truncated: ${missingEventWarningCount - maxMissingEventWarnings} additional rows omitted.`
    );
  }

  return {
    dataset: {
      source_dataset: sourceDataset,
      students,
      courses,
      classes,
      enrollments,
      assessments,
      assessment_results: assessmentResults,
      events,
      engagements: [],
    },
    rawRowCounts,
    warnings,
    errors,
    engagementCount,
  };
}
