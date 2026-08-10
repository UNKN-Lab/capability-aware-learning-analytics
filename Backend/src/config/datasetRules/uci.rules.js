import { normalizeText } from "../../utils/textUtils.js";

export function mapUciColumn({ rawColumn }) {
  const col = normalizeText(rawColumn);

  const booleanFieldMap = {
    higher: "higher_education_intent_flag",
    internet: "internet_access_flag",
    schoolsup: "school_support_flag",
    famsup: "family_support_flag",
    romantic: "has_romantic",
    activities: "has_extracurricular",
    paid: "has_paid_class"
  };

  const directFieldMap = {
    pstatus: {
      canonical_field: "parent_cohabitation_status",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.97
    },
    medu: {
      canonical_field: "mother_education_level",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.97
    },
    fedu: {
      canonical_field: "father_education_level",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.97
    },
    mjob: {
      canonical_field: "mother_job",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.97
    },
    fjob: {
      canonical_field: "father_job",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.97
    },
    guardian: {
      canonical_field: "guardian_type",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.97
    },
    traveltime: {
      canonical_field: "travel_time",
      transform: "cast_int",
      entity_scope: "student",
      confidence: 0.96
    },
    freetime: {
      canonical_field: "free_time",
      transform: "cast_int",
      entity_scope: "student",
      confidence: 0.96
    },
    goout: {
      canonical_field: "go_out_freq",
      transform: "cast_int",
      entity_scope: "student",
      confidence: 0.96
    },
    dalc: {
      canonical_field: "alcohol_weekday",
      transform: "cast_int",
      entity_scope: "student",
      confidence: 0.96
    },
    walc: {
      canonical_field: "alcohol_weekend",
      transform: "cast_int",
      entity_scope: "student",
      confidence: 0.96
    },
    health: {
      canonical_field: "health_status",
      transform: "cast_int",
      entity_scope: "student",
      confidence: 0.96
    },
    famrel: {
      canonical_field: "family_relation",
      transform: "cast_int",
      entity_scope: "student",
      confidence: 0.96
    },
    failures: {
      canonical_field: "previous_attempt_count",
      transform: "cast_int",
      entity_scope: "enrollment",
      confidence: 0.95
    },
    address: {
      canonical_field: "residence_area",
      transform: "direct_copy",
      entity_scope: "student",
      confidence: 0.95
    },
    studytime: {
      canonical_field: "studytime",
      transform: "cast_int",
      entity_scope: "enrollment",
      confidence: 0.95
    }
  };

  if (col === "sex") {
    return {
      canonical_field: "gender",
      transform: "normalize_gender",
      status: "suggested",
      confidence: 0.99,
      entity_scope: "student",
      review_comment: null
    };
  }

  if (booleanFieldMap[col]) {
    return {
      canonical_field: booleanFieldMap[col],
      transform: "cast_boolean",
      status: "suggested",
      confidence: 0.98,
      entity_scope: "student",
      review_comment: null
    };
  }

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

  if (col === "g1" || col === "g2" || col === "g3") {
    return {
      canonical_field: "score_normalized",
      transform: "normalize_score",
      status: "suggested",
      confidence: 0.98,
      entity_scope: "assessment",
      review_comment:
        `Detected UCI grade column "${rawColumn}". This should later be expanded into assessment rows in transform logic.`
    };
  }

  if (col === "absences") {
    return {
      canonical_field: "absence_count",
      transform: "cast_int",
      status: "suggested",
      confidence: 0.96,
      entity_scope: "enrollment",
      review_comment:
        'Detected UCI absences column — mapped to enrollment.absences (UCI-only field).'
    };
  }

  return null;
}
