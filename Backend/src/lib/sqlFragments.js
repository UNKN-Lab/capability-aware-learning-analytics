/**
 * Centralized SQL CTE fragment library.
 *
 * Registry SQL remains self-contained at runtime. These fragments are intended
 * for build-time/script-time composition only, then embedded into taskRegistry.
 */

export const scoreAgg = `score_context AS (
  SELECT CASE
           WHEN MAX(ar.score_normalized) <= 20 THEN 20::float8
           ELSE 100::float8
         END AS score_scale,
         CASE
           WHEN MAX(ar.score_normalized) <= 20 THEN 10::float8
           ELSE 40::float8
         END AS pass_threshold,
         CASE
           WHEN MAX(ar.score_normalized) <= 20 THEN 14::float8
           ELSE 70::float8
         END AS target_threshold
  FROM assessment_result ar
  JOIN assessment a ON ar.assessment_id = a.assessment_id
  JOIN enrollment e ON ar.enrollment_id = e.enrollment_id
                   AND a.class_id = e.class_id
  WHERE e.class_id = :class_id
),
score_agg AS (
  SELECT ar.student_id,
         ROUND((
           CASE
             WHEN SUM(a.weight_pct) FILTER (
                    WHERE a.weight_pct IS NOT NULL
                      AND ar.score_normalized IS NOT NULL
                  ) > 0
               THEN SUM(ar.score_normalized * a.weight_pct) FILTER (
                      WHERE a.weight_pct IS NOT NULL
                        AND ar.score_normalized IS NOT NULL
                    ) / NULLIF(SUM(a.weight_pct) FILTER (
                      WHERE a.weight_pct IS NOT NULL
                        AND ar.score_normalized IS NOT NULL
                    ), 0)
             ELSE AVG(ar.score_normalized)
           END
         )::numeric, 2)::float8 AS avg_score,
         ROUND(AVG(ar.score_normalized)::numeric, 2)::float8 AS unweighted_avg_score,
         ROUND((
           SUM(ar.score_normalized * a.weight_pct) FILTER (
             WHERE a.weight_pct IS NOT NULL
               AND ar.score_normalized IS NOT NULL
           ) / NULLIF(SUM(a.weight_pct) FILTER (
             WHERE a.weight_pct IS NOT NULL
               AND ar.score_normalized IS NOT NULL
           ), 0)
         )::numeric, 2)::float8 AS weighted_avg_score,
         CASE
           WHEN SUM(a.weight_pct) FILTER (
                  WHERE a.weight_pct IS NOT NULL
                    AND ar.score_normalized IS NOT NULL
                ) > 0
             THEN 'weighted_by_assessment_weight'
           ELSE 'unweighted_average_fallback'
         END AS score_strategy,
         ROUND(AVG((ar.score_normalized >= sc.pass_threshold)::int)::numeric, 4)::float8 AS pass_rate,
         COUNT(*)::int AS assessment_count,
         sc.score_scale,
         sc.pass_threshold,
         sc.target_threshold,
         REGR_SLOPE(ar.score_normalized, a.assessment_order)::float8 AS perf_trend
  FROM assessment_result ar
  JOIN assessment a ON ar.assessment_id = a.assessment_id
  JOIN enrollment e ON ar.enrollment_id = e.enrollment_id
                   AND a.class_id = e.class_id
  CROSS JOIN score_context sc
  WHERE e.class_id = :class_id
  GROUP BY ar.student_id, sc.score_scale, sc.pass_threshold, sc.target_threshold
)`;

export const punctuality = `punctuality AS (
  SELECT ar.student_id,
         CASE
           WHEN COUNT(*) FILTER (
                  WHERE a.due_day IS NOT NULL
                    AND ar.submission_day IS NOT NULL
                ) > 0
             THEN COUNT(*) FILTER (WHERE ar.submission_day <= a.due_day) * 1.0
                  / NULLIF(COUNT(*) FILTER (
                      WHERE a.due_day IS NOT NULL
                        AND ar.submission_day IS NOT NULL
                    ), 0)
           ELSE NULL
         END AS punctuality_rate
  FROM assessment_result ar
  JOIN assessment a ON ar.assessment_id = a.assessment_id
  JOIN enrollment e ON ar.enrollment_id = e.enrollment_id
                   AND a.class_id = e.class_id
  WHERE e.class_id = :class_id
  GROUP BY ar.student_id
)`;

export const engAgg = `eng_agg AS (
  SELECT e.student_id,
         COALESCE(SUM(eng.engagement_count), 0)::float8 AS total_clicks,
         COUNT(DISTINCT eng.event_day)::float8 AS active_days,
         (COUNT(eng.engagement_id) > 0) AS has_engagement_data
  FROM enrollment e
  LEFT JOIN engagement eng ON e.enrollment_id = eng.enrollment_id
  WHERE e.class_id = :class_id
  GROUP BY e.student_id
)`;

export const classMax = `class_max AS (
  SELECT NULLIF(MAX(total_clicks), 0) AS mc,
         NULLIF(MAX(active_days), 0) AS ma
  FROM eng_agg
)`;

export const engScore = `eng_score AS (
  SELECT ea.student_id,
         ea.has_engagement_data,
         CASE
           WHEN ea.has_engagement_data
             THEN COALESCE(ea.total_clicks / cm.mc, 0) * 0.5
                  + COALESCE(ea.active_days / cm.ma, 0) * 0.5
           ELSE NULL
         END AS engagement_score
  FROM eng_agg ea
  CROSS JOIN class_max cm
)`;

export const riskFlags = `risk_flags AS (
  SELECT sa.student_id,
         e.enrollment_id,
         sa.avg_score,
         sa.unweighted_avg_score,
         sa.weighted_avg_score,
         sa.score_strategy,
         sa.pass_rate,
         sa.assessment_count,
         sa.score_scale,
         sa.pass_threshold,
         sa.target_threshold,
         sa.perf_trend,
         es.engagement_score AS engagement_score,
         COALESCE(es.has_engagement_data, false) AS engagement_score_available,
         p.punctuality_rate::float8 AS punctuality_rate,
         COALESCE(e.previous_attempt_count, 0) AS previous_attempt_count,
         e.final_outcome,
         (sa.avg_score < sa.pass_threshold) AS flag_low_score,
         (COALESCE(e.previous_attempt_count, 0) > 0) AS flag_repeated,
         (COALESCE(es.has_engagement_data, false)
           AND es.engagement_score < 0.15) AS flag_low_engagement,
         (p.punctuality_rate IS NOT NULL AND p.punctuality_rate < 0.7) AS flag_low_punctuality,
         (sa.perf_trend < 0) AS flag_neg_trend,
         ((CASE WHEN sa.avg_score < sa.pass_threshold THEN 1 ELSE 0 END)
          + (CASE WHEN COALESCE(e.previous_attempt_count, 0) > 0 THEN 1 ELSE 0 END)
          + (CASE WHEN COALESCE(es.has_engagement_data, false)
                    AND es.engagement_score < 0.15 THEN 1 ELSE 0 END)
          + (CASE WHEN p.punctuality_rate IS NOT NULL AND p.punctuality_rate < 0.7 THEN 1 ELSE 0 END)
          + (CASE WHEN sa.perf_trend < 0 THEN 1 ELSE 0 END)) AS sum_flags
  FROM score_agg sa
  JOIN enrollment e ON e.student_id = sa.student_id
                   AND e.class_id = :class_id
  LEFT JOIN eng_score es ON es.student_id = sa.student_id
  LEFT JOIN punctuality p ON p.student_id = sa.student_id
)`;

export const riskLabel = `CASE
  WHEN sum_flags >= 3 THEN 'high'
  WHEN sum_flags = 2 THEN 'medium'
  ELSE 'low'
END`;

export function buildWith(fragments, finalSelect) {
  if (!fragments || fragments.length === 0) return finalSelect;
  return `WITH\n${fragments.join(',\n')}\n${finalSelect}`;
}

export const F = {
  scoreAgg,
  punctuality,
  engAgg,
  classMax,
  engScore,
  riskFlags,
  riskLabel
};
