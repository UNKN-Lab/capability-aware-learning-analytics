export const FEATURE_RULES = {
  // ==========================================
  // THRESHOLDS
  // ==========================================
  thresholds: {
    // ETL-time threshold (In-table FE: pass_flag)
    pass_score: 40,
    
    // Analytics-time thresholds (Phase 2 Cross-table analysis)
    at_risk_avg_score: 40,
    at_risk_low_engagement: 0.15,
    at_risk_low_punctuality: 0.7,
    withdrew_early_ratio: 0.5
  },

  score: {
    min: 0,
    max: 100,
    max_std_for_consistency: 50
  },

  ordinal_scales: {
    min: 1,
    max: 5,
    alcohol_combined_min: 2,
    alcohol_combined_max: 10
  },

  weekly_drop: {
    significant_drop_ratio: 0.5,
    rolling_window_weeks: 3
  },

  resource_groups: {
    forum: ["forumng", "forum"],
    quiz: ["quiz"],
    resource: ["resource", "oucontent", "url", "subpage"]
  },

  education_levels: {
    no_formal_values: ["no_formal", "no_formal_quals", "none", "unknown"]
  }
};
