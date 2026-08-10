export const CANONICAL_FIELDS = [
  // =====================================================
  // STUDENT
  // =====================================================
  { name: "student_id", required: true, type: "string", group: "student", origin: "raw", description: "Canonical unique student identifier." },
  { name: "gender", required: false, type: "string", group: "student", origin: "raw", description: "Student gender in canonical form." },
  { name: "age_years", required: false, type: "int", group: "student", origin: "raw", description: "Student age in years." },
  { name: "age_group", required: false, type: "string", group: "student", origin: "normalized", description: "Student age group in canonical band format." },
  { name: "region", required: false, type: "string", group: "student", origin: "raw", description: "Geographic region associated with the student." },
  { name: "residence_area", required: false, type: "string", group: "student", origin: "normalized", description: "Residence area type such as urban or rural." },
  { name: "school", required: false, type: "string", group: "student", origin: "raw", description: "School identifier." },
  { name: "family_size", required: false, type: "string", group: "student", origin: "raw", description: "Family size." },
  { name: "highest_education", required: false, type: "string", group: "student", origin: "raw", description: "Highest education level before current course." },
  { name: "socioeconomic_band", required: false, type: "string", group: "student", origin: "normalized", description: "Socioeconomic band or IMD-like grouped indicator." },
  { name: "imd_score_numeric", required: false, type: "float", group: "student", origin: "normalized", description: "Numeric deprivation score if available." },
  { name: "disability_flag", required: false, type: "boolean", group: "student", origin: "raw", description: "Whether the student has declared a disability." },
  { name: "higher_education_intent_flag", required: false, type: "boolean", group: "student", origin: "raw", description: "Whether the student intends to pursue higher education." },
  { name: "internet_access_flag", required: false, type: "boolean", group: "student", origin: "raw", description: "Whether the student has internet access." },
  { name: "school_support_flag", required: false, type: "boolean", group: "student", origin: "raw", description: "Whether the student receives school educational support." },
  { name: "family_support_flag", required: false, type: "boolean", group: "student", origin: "raw", description: "Whether the student receives family educational support." },
  { name: "mother_education_level", required: false, type: "string", group: "student", origin: "normalized", description: "Mother education level in canonical format." },
  { name: "father_education_level", required: false, type: "string", group: "student", origin: "normalized", description: "Father education level in canonical format." },
  { name: "mother_job", required: false, type: "string", group: "student", origin: "raw", description: "Mother occupation category." },
  { name: "father_job", required: false, type: "string", group: "student", origin: "raw", description: "Father occupation category." },
  { name: "guardian_type", required: false, type: "string", group: "student", origin: "raw", description: "Student guardian category." },
  { name: "parent_cohabitation_status", required: false, type: "string", group: "student", origin: "normalized", description: "Parent cohabitation status." },
  { name: "travel_time", required: false, type: "int", group: "student", origin: "raw", description: "Travel time level or category." },
  { name: "free_time", required: false, type: "int", group: "student", origin: "raw", description: "Free time level." },
  { name: "go_out_freq", required: false, type: "int", group: "student", origin: "raw", description: "Frequency of going out." },
  { name: "alcohol_weekday", required: false, type: "int", group: "student", origin: "raw", description: "Weekday alcohol consumption level." },
  { name: "alcohol_weekend", required: false, type: "int", group: "student", origin: "raw", description: "Weekend alcohol consumption level." },
  { name: "health_status", required: false, type: "int", group: "student", origin: "raw", description: "Self-reported health status level." },
  { name: "family_relation", required: false, type: "int", group: "student", origin: "raw", description: "Quality of family relationship level." },
  { name: "has_romantic", required: false, type: "boolean", group: "student", origin: "raw", description: "Whether the student is in a romantic relationship." },
  { name: "has_extracurricular", required: false, type: "boolean", group: "student", origin: "raw", description: "Whether the student participates in extracurricular activities." },
  { name: "has_paid_class", required: false, type: "boolean", group: "student", origin: "raw", description: "Whether the student attends paid extra classes." },

  // =====================================================
  // COURSE
  // =====================================================
  { name: "course_id", required: true, type: "string", group: "course", origin: "raw", description: "Canonical course identifier." },
  { name: "course_name", required: false, type: "string", group: "course", origin: "normalized", description: "Human-readable course name." },
  { name: "subject_area", required: false, type: "string", group: "course", origin: "normalized", description: "Subject area or academic domain." },
  { name: "course_run", required: false, type: "string", group: "course", origin: "raw", description: "Course run or presentation identifier." },
  { name: "course_duration_days", required: false, type: "int", group: "course", origin: "normalized", description: "Course duration in relative days." },
  { name: "study_load_credits", required: false, type: "int", group: "course", origin: "raw", description: "Number of credits taken." },

  // =====================================================
  // ENROLLMENT
  // =====================================================
  { name: "enrollment_start_day", required: false, type: "int", group: "enrollment", origin: "normalized", description: "Normalized enrollment start day." },
  { name: "enrollment_end_day", required: false, type: "int", group: "enrollment", origin: "normalized", description: "Normalized enrollment end day." },
  { name: "final_outcome", required: false, type: "string", group: "enrollment", origin: "normalized", description: "Final course outcome." },
  { name: "previous_attempt_count", required: false, type: "int", group: "enrollment", origin: "normalized", description: "Number of previous attempts." },
  { name: "studytime", required: false, type: "int", group: "enrollment", origin: "raw", description: "UCI: weekly self-study time on 1-4 scale. NULL for OULAD." },
  { name: "source_dataset", required: true, type: "string", group: "enrollment", origin: "raw", description: "Source dataset name." },

  // =====================================================
  // ASSESSMENT
  // =====================================================
  { name: "assessment_result_id", required: false, type: "string", group: "assessment", origin: "normalized", description: "Assessment result identifier." },
  { name: "assessment_id", required: false, type: "string", group: "assessment", origin: "normalized", description: "Canonical assessment identifier." },
  { name: "assessment_name", required: false, type: "string", group: "assessment", origin: "normalized", description: "Assessment name." },
  { name: "assessment_type", required: false, type: "string", group: "assessment", origin: "normalized", description: "Assessment type category." },
  { name: "assessment_order", required: false, type: "int", group: "assessment", origin: "normalized", description: "Relative order of assessment." },
  { name: "assessment_weight_pct", required: false, type: "float", group: "assessment", origin: "raw", description: "Assessment weight as a percentage." },
  { name: "assessment_due_day", required: false, type: "int", group: "assessment", origin: "raw", description: "Relative due day of the assessment." },
  { name: "score_normalized", required: false, type: "float", group: "assessment", origin: "normalized", description: "Normalized score from source." },
  { name: "submission_day", required: false, type: "int", group: "assessment", origin: "raw", description: "Relative submission day." },
  { name: "submission_delay_days", required: false, type: "int", group: "assessment", origin: "derived", description: "Difference between submission day and due day." },
  { name: "pass_flag", required: false, type: "boolean", group: "assessment", origin: "derived", description: "Whether the learner passed the assessment." },
  { name: "is_banked", required: false, type: "boolean", group: "assessment", origin: "raw", description: "Whether the assessment result is banked." },
  { name: "is_final_assessment", required: false, type: "boolean", group: "assessment", origin: "normalized", description: "Whether the assessment is final." },

  // =====================================================
  // ENGAGEMENT
  // =====================================================
  { name: "engagement_event_id", required: false, type: "string", group: "engagement", origin: "normalized", description: "Engagement event identifier." },
  { name: "resource_id", required: false, type: "string", group: "engagement", origin: "raw", description: "Resource or activity identifier." },
  { name: "resource_type", required: false, type: "string", group: "engagement", origin: "normalized", description: "Canonical resource type." },
  { name: "engagement_count", required: false, type: "int", group: "engagement", origin: "raw", description: "Count of engagement actions for this row." },
  { name: "event_day", required: false, type: "int", group: "engagement", origin: "raw", description: "Relative event day." },
  { name: "week_number", required: false, type: "int", group: "engagement", origin: "raw", description: "Relative week number." },
  { name: "active_day_count", required: false, type: "int", group: "engagement", origin: "derived", description: "Count of active learning days." },
  { name: "absence_count", required: false, type: "int", group: "engagement", origin: "raw", description: "Count of absences or missed sessions." }
];
