import { normalizeText } from "../../utils/textUtils.js";

export function mapOuladColumn({ rawColumn }) {
  const col = normalizeText(rawColumn);

  const directFieldMap = {
    id_student: {
      canonical_field: "student_id",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.99
    },
    gender: {
      canonical_field: "gender",
      transform: "normalize_gender",
      entity_scope: "student",
      confidence: 0.98
    },
    disability: {
      canonical_field: "disability_flag",
      transform: "cast_boolean",
      entity_scope: "student",
      confidence: 0.97
    },
    final_result: {
      canonical_field: "final_outcome",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.98
    },
    age_band: {
      canonical_field: "age_group",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.97
    },
    region: {
      canonical_field: "region",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.97
    },
    highest_education: {
      canonical_field: "highest_education",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.97
    },
    imd_band: {
      canonical_field: "socioeconomic_band",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.97
    },
    studied_credits: {
      canonical_field: "study_load_credits",
      transform: "cast_int",
      entity_scope: "course",
      confidence: 0.96
    },
    code_presentation: {
      canonical_field: "course_run",
      transform: "direct_copy",
      entity_scope: "course",
      confidence: 0.97
    },
    assessment_type: {
      canonical_field: "assessment_type",
      transform: "direct_copy",
      entity_scope: "assessment",
      confidence: 0.97
    },
    id_assessment: {
      canonical_field: "assessment_id",
      transform: "direct_copy",
      entity_scope: "assessment",
      confidence: 0.98
    },
    date_submitted: {
      canonical_field: "submission_day",
      transform: "cast_int",
      entity_scope: "assessment",
      confidence: 0.97
    },
    date: {
      canonical_field: "event_day",
      transform: "cast_int",
      entity_scope: "engagement_event",
      confidence: 0.96
    },
    sum_click: {
      canonical_field: "engagement_count",
      transform: "cast_int",
      entity_scope: "engagement_event",
      confidence: 0.97
    },
    id_site: {
      canonical_field: "resource_id",
      transform: "direct_copy",
      entity_scope: "engagement_event",
      confidence: 0.96
    },
    activity_type: {
      canonical_field: "resource_type",
      transform: "direct_copy",
      entity_scope: "engagement_event",
      confidence: 0.96
    },
    is_banked: {
      canonical_field: "is_banked",
      transform: "cast_boolean",
      entity_scope: "assessment",
      confidence: 0.97
    },
    score: {
      canonical_field: "score_normalized",
      transform: "normalize_score",
      entity_scope: "assessment",
      confidence: 0.97
    },
    weight: {
      canonical_field: "assessment_weight_pct",
      transform: "cast_float",
      entity_scope: "assessment",
      confidence: 0.96
    }
  };

  if (directFieldMap[col]) {
    return {
      canonical_field: directFieldMap[col].canonical_field,
      transform: directFieldMap[col].transform,
      status: "suggested",
      confidence: directFieldMap[col].confidence,
      entity_scope: directFieldMap[col].entity_scope,
      review_comment: null
    };
  }

  if (col === "code_module") {
    return {
      canonical_field: "course_name",
      transform: "direct_copy",
      status: "needs_review",
      confidence: 0.78,
      entity_scope: "course",
      review_comment:
        'Detected OULAD module code. Review whether this should remain as course_name or be combined with course_run to derive course_id in transform logic.'
    };
  }

  if (col === "num_of_prev_attempts") {
    return {
      canonical_field: "previous_attempt_count",
      transform: "cast_int",
      status: "suggested",
      confidence: 0.95,
      entity_scope: "student",
      review_comment: null
    };
  }

  return null;
}