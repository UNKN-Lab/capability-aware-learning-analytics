import prisma from "../lib/prisma.js";

const CANONICAL_TABLES = [
  "student",
  "course",
  "class",
  "enrollment",
  "assessment",
  "assessment_result",
  "event",
  "engagement",
];

const DEFAULT_REASON_CODES = {
  REQUIRED_MISSING: "REQUIRED_CAPABILITY_MISSING",
  REQUIRED_ANY_MISSING: "REQUIRED_ANY_NOT_SATISFIED",
  OPTIONAL_MISSING: "OPTIONAL_ENRICHMENT_MISSING",
  DATASET_SPECIFIC: "DATASET_SPECIFIC_BY_DESIGN",
  LEGACY_DATASET_HINT: "LEGACY_DATASET_COMPAT_HINT",
};

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function makeTableCountQuery(table) {
  if (table === "engagement") {
    return `SELECT CASE WHEN EXISTS (SELECT 1 FROM "engagement" WHERE batch_id = $1) THEN 1 ELSE 0 END::int AS c`;
  }
  return `SELECT COUNT(*)::int AS c FROM "${table}" WHERE batch_id = $1`;
}

function buildCompatHint(task, sourceDataset) {
  const compat = String(task.datasetCompatibility || "both").toLowerCase();
  const source = String(sourceDataset || "").toLowerCase();
  if (compat === "both") return null;
  if (compat.includes(source)) return null;
  return {
    code: DEFAULT_REASON_CODES.LEGACY_DATASET_HINT,
    severity: "warning",
    message: `Legacy datasetCompatibility=${task.datasetCompatibility} does not match dataset=${sourceDataset}.`,
    context: {
      datasetCompatibility: task.datasetCompatibility,
      sourceDataset,
      mode: "legacy_hint_only",
    },
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

export function normalizeAvailabilityContract(task) {
  const contract = task?.availability_contract || {};
  const requiredAll = normalizeStringArray(
    contract.required_all ?? task?.requiredCapabilities ?? []
  );
  const requiredAny = normalizeStringArray(contract.required_any ?? []);
  const optionalEnrichments = normalizeStringArray(
    contract.optional_enrichments ?? task?.optionalCapabilities ?? []
  );
  const chartRequiredFields = normalizeStringArray(
    contract.chart_required_fields ??
      [
        task?.visualization_config?.x_field,
        task?.visualization_config?.y_field,
      ].filter(Boolean)
  );

  const reasonCodes = {
    ...DEFAULT_REASON_CODES,
    ...(contract.reason_codes || {}),
  };

  return {
    required_all: requiredAll,
    required_any: requiredAny,
    optional_enrichments: optionalEnrichments,
    chart_required_fields: chartRequiredFields,
    confidence: contract.confidence || null,
    reason_codes: reasonCodes,
    dataset_specific: contract.dataset_specific || null,
  };
}

export async function buildCanonicalCapabilitySnapshot({ batchId, classId = null }) {
  const tableCounts = {};
  for (const table of CANONICAL_TABLES) {
    const rows = await prisma.$queryRawUnsafe(makeTableCountQuery(table), batchId);
    tableCounts[table] = toInt(rows?.[0]?.c);
  }

  const enrollmentRows = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS enrollment_rows,
      COUNT(DISTINCT student_id)::int AS distinct_students,
      COUNT(*) FILTER (WHERE absences IS NOT NULL)::int AS absences_non_null_rows,
      COUNT(*) FILTER (WHERE studytime IS NOT NULL)::int AS studytime_non_null_rows,
      COUNT(*) FILTER (WHERE registration_lead_time IS NOT NULL)::int AS registration_non_null_rows,
      COUNT(*) FILTER (WHERE final_outcome IS NOT NULL)::int AS final_outcome_non_null_rows
    FROM enrollment
    WHERE batch_id = ${batchId}
      AND (${classId}::text IS NULL OR class_id = ${classId})
  `;

  const assessmentRows = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS assessment_rows,
      COUNT(*) FILTER (WHERE due_day IS NOT NULL)::int AS due_day_non_null_rows,
      COUNT(*) FILTER (WHERE week_of_class IS NOT NULL)::int AS week_of_class_non_null_rows,
      COUNT(DISTINCT week_of_class)::int AS distinct_weeks_in_assessment,
      COUNT(*) FILTER (WHERE competency_tag IS NOT NULL)::int AS competency_tag_non_null_rows,
      COUNT(*) FILTER (WHERE assessment_name IS NOT NULL)::int AS assessment_name_non_null_rows
    FROM assessment
    WHERE batch_id = ${batchId}
      AND (${classId}::text IS NULL OR class_id = ${classId})
  `;

  const assessmentResultRows = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS assessment_result_rows,
      COUNT(*) FILTER (WHERE score_normalized IS NOT NULL)::int AS score_non_null_rows,
      COUNT(*) FILTER (WHERE submission_day IS NOT NULL)::int AS submission_day_non_null_rows
    FROM assessment_result ar
    WHERE ar.batch_id = ${batchId}
      AND (
        ${classId}::text IS NULL
        OR EXISTS (
          SELECT 1
          FROM assessment a
          WHERE a.assessment_id = ar.assessment_id
            AND a.class_id = ${classId}
        )
      )
  `;

  const engagementRows = classId
    ? await prisma.$queryRaw`
        WITH first_week AS (
          SELECT eng.week_number
          FROM engagement eng
          JOIN enrollment e ON e.enrollment_id = eng.enrollment_id
          WHERE eng.batch_id = ${batchId}
            AND e.class_id = ${classId}
            AND eng.week_number IS NOT NULL
          LIMIT 1
        ),
        first_day AS (
          SELECT eng.event_day
          FROM engagement eng
          JOIN enrollment e ON e.enrollment_id = eng.enrollment_id
          WHERE eng.batch_id = ${batchId}
            AND e.class_id = ${classId}
            AND eng.event_day IS NOT NULL
          LIMIT 1
        )
        SELECT
          CASE WHEN EXISTS (
            SELECT 1
            FROM engagement eng
            JOIN enrollment e ON e.enrollment_id = eng.enrollment_id
            WHERE eng.batch_id = ${batchId}
              AND e.class_id = ${classId}
          ) THEN 1 ELSE 0 END::int AS engagement_rows,
          CASE WHEN EXISTS (
            SELECT 1
            FROM engagement eng
            JOIN enrollment e ON e.enrollment_id = eng.enrollment_id
            WHERE eng.batch_id = ${batchId}
              AND e.class_id = ${classId}
              AND COALESCE(eng.engagement_count, 0) > 0
          ) THEN 1 ELSE 0 END::int AS positive_engagement_rows,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM engagement eng
              JOIN enrollment e ON e.enrollment_id = eng.enrollment_id
              CROSS JOIN first_week fw
              WHERE eng.batch_id = ${batchId}
                AND e.class_id = ${classId}
                AND eng.week_number IS NOT NULL
                AND eng.week_number <> fw.week_number
            ) THEN 2
            WHEN EXISTS (SELECT 1 FROM first_week) THEN 1
            ELSE 0
          END::int AS distinct_engagement_weeks,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM engagement eng
              JOIN enrollment e ON e.enrollment_id = eng.enrollment_id
              CROSS JOIN first_day fd
              WHERE eng.batch_id = ${batchId}
                AND e.class_id = ${classId}
                AND eng.event_day IS NOT NULL
                AND eng.event_day <> fd.event_day
            ) THEN 2
            WHEN EXISTS (SELECT 1 FROM first_day) THEN 1
            ELSE 0
          END::int AS distinct_engagement_days
      `
    : await prisma.$queryRaw`
        WITH first_week AS (
          SELECT week_number
          FROM engagement
          WHERE batch_id = ${batchId}
            AND week_number IS NOT NULL
          LIMIT 1
        ),
        first_day AS (
          SELECT event_day
          FROM engagement
          WHERE batch_id = ${batchId}
            AND event_day IS NOT NULL
          LIMIT 1
        )
        SELECT
          CASE WHEN EXISTS (
            SELECT 1 FROM engagement WHERE batch_id = ${batchId}
          ) THEN 1 ELSE 0 END::int AS engagement_rows,
          CASE WHEN EXISTS (
            SELECT 1
            FROM engagement
            WHERE batch_id = ${batchId}
              AND COALESCE(engagement_count, 0) > 0
          ) THEN 1 ELSE 0 END::int AS positive_engagement_rows,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM engagement eng
              CROSS JOIN first_week fw
              WHERE eng.batch_id = ${batchId}
                AND eng.week_number IS NOT NULL
                AND eng.week_number <> fw.week_number
            ) THEN 2
            WHEN EXISTS (SELECT 1 FROM first_week) THEN 1
            ELSE 0
          END::int AS distinct_engagement_weeks,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM engagement eng
              CROSS JOIN first_day fd
              WHERE eng.batch_id = ${batchId}
                AND eng.event_day IS NOT NULL
                AND eng.event_day <> fd.event_day
            ) THEN 2
            WHEN EXISTS (SELECT 1 FROM first_day) THEN 1
            ELSE 0
          END::int AS distinct_engagement_days
      `;

  const eventRows = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS event_rows,
      COUNT(*) FILTER (WHERE resource_type IS NOT NULL)::int AS resource_type_non_null_rows
    FROM event
    WHERE batch_id = ${batchId}
      AND (${classId}::text IS NULL OR class_id = ${classId})
  `;

  const studentRows = await prisma.$queryRaw`
    SELECT
      COUNT(DISTINCT s.student_id)::int AS student_rows,
      COUNT(DISTINCT CASE
        WHEN (
          s.gender IS NOT NULL OR
          s.age_years IS NOT NULL OR
          s.highest_education IS NOT NULL OR
          s.region IS NOT NULL
        ) THEN s.student_id
      END)::int AS demographics_students,
      COUNT(DISTINCT CASE
        WHEN (
          s.free_time IS NOT NULL OR
          s.go_out_freq IS NOT NULL OR
          s.alcohol_weekday IS NOT NULL OR
          s.alcohol_weekend IS NOT NULL OR
          s.health_status IS NOT NULL OR
          s.lifestyle_risk_score IS NOT NULL OR
          s.social_balance_score IS NOT NULL
        ) THEN s.student_id
      END)::int AS lifestyle_students,
      COUNT(DISTINCT CASE
        WHEN (
          s.family_size IS NOT NULL OR
          s.family_relation IS NOT NULL OR
          s.family_support_flag IS NOT NULL OR
          s.school_support_flag IS NOT NULL OR
          s.parent_cohabitation_status IS NOT NULL OR
          s.mother_education_level IS NOT NULL OR
          s.father_education_level IS NOT NULL OR
          s.family_stability_score IS NOT NULL
        ) THEN s.student_id
      END)::int AS family_students,
      COUNT(DISTINCT CASE
        WHEN (
          s.socioeconomic_band IS NOT NULL OR
          s.imd_score_numeric IS NOT NULL OR
          s.disability_flag IS NOT NULL OR
          s.disadvantage_score IS NOT NULL
        ) THEN s.student_id
      END)::int AS socioeconomic_students,
      COUNT(DISTINCT CASE
        WHEN s.disadvantage_score IS NOT NULL THEN s.student_id
      END)::int AS disadvantage_score_students
    FROM student s
    JOIN enrollment e
      ON e.student_id = s.student_id
      AND e.batch_id = s.batch_id
    WHERE s.batch_id = ${batchId}
      AND (${classId}::text IS NULL OR e.class_id = ${classId})
  `;

  const enrollment = enrollmentRows[0] || {};
  const assessment = assessmentRows[0] || {};
  const assessmentResult = assessmentResultRows[0] || {};
  const engagement = engagementRows[0] || {};
  const event = eventRows[0] || {};
  const student = studentRows[0] || {};

  const metrics = {
    table_counts: tableCounts,
    enrollment_rows: toInt(enrollment.enrollment_rows),
    distinct_students: toInt(enrollment.distinct_students),
    absences_non_null_rows: toInt(enrollment.absences_non_null_rows),
    studytime_non_null_rows: toInt(enrollment.studytime_non_null_rows),
    registration_non_null_rows: toInt(enrollment.registration_non_null_rows),
    final_outcome_non_null_rows: toInt(enrollment.final_outcome_non_null_rows),
    assessment_rows: toInt(assessment.assessment_rows),
    due_day_non_null_rows: toInt(assessment.due_day_non_null_rows),
    week_of_class_non_null_rows: toInt(assessment.week_of_class_non_null_rows),
    distinct_weeks_in_assessment: toInt(assessment.distinct_weeks_in_assessment),
    competency_tag_non_null_rows: toInt(assessment.competency_tag_non_null_rows),
    assessment_name_non_null_rows: toInt(assessment.assessment_name_non_null_rows),
    assessment_result_rows: toInt(assessmentResult.assessment_result_rows),
    score_non_null_rows: toInt(assessmentResult.score_non_null_rows),
    submission_day_non_null_rows: toInt(assessmentResult.submission_day_non_null_rows),
    engagement_rows: toInt(engagement.engagement_rows),
    positive_engagement_rows: toInt(engagement.positive_engagement_rows),
    distinct_engagement_weeks: toInt(engagement.distinct_engagement_weeks),
    distinct_engagement_days: toInt(engagement.distinct_engagement_days),
    event_rows: toInt(event.event_rows),
    resource_type_non_null_rows: toInt(event.resource_type_non_null_rows),
    student_rows: toInt(student.student_rows),
    demographics_students: toInt(student.demographics_students),
    lifestyle_students: toInt(student.lifestyle_students),
    family_students: toInt(student.family_students),
    socioeconomic_students: toInt(student.socioeconomic_students),
    disadvantage_score_students: toInt(student.disadvantage_score_students),
  };

  const capabilities = {
    assessment_scores: metrics.score_non_null_rows >= 2,
    final_outcome: metrics.final_outcome_non_null_rows >= 1,
    submission_history: metrics.assessment_result_rows >= 1,
    submission_timestamps:
      metrics.submission_day_non_null_rows >= 1 &&
      metrics.due_day_non_null_rows >= 1,
    demographics: metrics.demographics_students >= 1,
    lifestyle_factors: metrics.lifestyle_students >= 1,
    family_context: metrics.family_students >= 1,
    socioeconomic_context: metrics.socioeconomic_students >= 1,
    disadvantage_scoring: metrics.disadvantage_score_students >= 2,
    engagement_tracking: metrics.positive_engagement_rows >= 1,
    resource_clickstream:
      metrics.positive_engagement_rows >= 1 && metrics.resource_type_non_null_rows >= 1,
    temporal_activity:
      metrics.positive_engagement_rows >= 1 && metrics.distinct_engagement_weeks >= 2,
    absence_tracking: metrics.absences_non_null_rows >= 1,
    studytime_tracking: metrics.studytime_non_null_rows >= 1,
    competency_tagging: metrics.competency_tag_non_null_rows >= 1,
    proxy_competency_available: metrics.assessment_name_non_null_rows >= 1,
    multi_student_comparison: metrics.distinct_students >= 2,
    registration_timing: metrics.registration_non_null_rows >= 1,
  };

  return {
    batch_id: batchId,
    class_id: classId || null,
    table_counts: tableCounts,
    available_tables: CANONICAL_TABLES.filter((t) => tableCounts[t] > 0),
    non_empty_tables: CANONICAL_TABLES.filter((t) => tableCounts[t] > 0),
    metrics,
    capabilities,
  };
}

export function evaluateAvailabilityContract({
  task,
  contract,
  snapshot,
  sourceDataset,
}) {
  const caps = snapshot.capabilities || {};
  const matchedRequired = contract.required_all.filter((cap) => !!caps[cap]);
  const missingRequired = contract.required_all.filter((cap) => !caps[cap]);

  const matchedAny = contract.required_any.filter((cap) => !!caps[cap]);
  const requiredAnySatisfied =
    contract.required_any.length === 0 || matchedAny.length > 0;
  const missingRequiredAny = requiredAnySatisfied ? [] : [...contract.required_any];

  const missingOptional = contract.optional_enrichments.filter((cap) => !caps[cap]);
  const matchedOptional = contract.optional_enrichments.filter((cap) => !!caps[cap]);

  const reasonCodes = [];
  if (missingRequired.length > 0) {
    reasonCodes.push(DEFAULT_REASON_CODES.REQUIRED_MISSING);
  }
  if (missingRequiredAny.length > 0) {
    reasonCodes.push(DEFAULT_REASON_CODES.REQUIRED_ANY_MISSING);
  }
  if (missingOptional.length > 0) {
    reasonCodes.push(DEFAULT_REASON_CODES.OPTIONAL_MISSING);
  }

  let datasetSpecificMismatch = false;
  let datasetSpecificIssue = null;
  const dsSpec = contract.dataset_specific;
  if (dsSpec?.source_dataset) {
    const expect = String(dsSpec.source_dataset).toUpperCase();
    const got = String(sourceDataset || "").toUpperCase();
    datasetSpecificMismatch = expect !== got;
    if (datasetSpecificMismatch) {
      reasonCodes.push(DEFAULT_REASON_CODES.DATASET_SPECIFIC);
      datasetSpecificIssue = {
        code: DEFAULT_REASON_CODES.DATASET_SPECIFIC,
        severity: "error",
        message:
          dsSpec.reason ||
          `Task is dataset-specific: expected ${expect}, got ${got}.`,
        context: {
          expected_source_dataset: expect,
          actual_source_dataset: got,
          task_id: task.taskId,
        },
      };
    }
  }

  const legacyCompatHint = buildCompatHint(task, sourceDataset);

  const available =
    !datasetSpecificMismatch &&
    missingRequired.length === 0 &&
    requiredAnySatisfied;

  const confidence = !available
    ? "LOW"
    : missingOptional.length === 0
      ? "HIGH"
      : "MEDIUM";

  return {
    available,
    confidence,
    required_all: contract.required_all,
    required_any: contract.required_any,
    optional_enrichments: contract.optional_enrichments,
    chart_required_fields: contract.chart_required_fields,
    matched_capabilities: Array.from(
      new Set([...matchedRequired, ...matchedAny, ...matchedOptional])
    ),
    missing_required_capabilities: missingRequired,
    missing_required_any_capabilities: missingRequiredAny,
    missing_optional_enrichments: missingOptional,
    reason_codes: Array.from(new Set(reasonCodes)),
    dataset_specific_issue: datasetSpecificIssue,
    legacy_dataset_compatibility_hint: legacyCompatHint,
  };
}
