# Representative SQL Task Contracts

## Contract structure

Each task in [`Backend/src/config/taskRegistry.json`](../../Backend/src/config/taskRegistry.json) binds an educational question to executable and presentation metadata. A typical entry includes:

| Contract element | Purpose |
|---|---|
| `taskId`, `taskName`, `scope`, `actionableQuestion` | Stable identity and intended analytical use |
| `sourceTables` | Canonical entities referenced by the task |
| `requiredCapabilities`, `optionalCapabilities` | Evidence conditions checked before execution |
| `sqlQuery` or `sqlQueries` | Parameterized deterministic computation |
| `query_labels` | Names assigned to returned datasets; for `sqlQueries`, labels follow query order |
| `output_schema` | Required and optional result columns when declared |
| `viz_type`, `visualization_config` | Presentation contract |
| `aiSummaryType` and related `ai*` fields | Evidence-preparation metadata for explanation |
| `fallbackStrategy`, `registry_status` | Behaviour when evidence is unavailable and implementation status |

The current registry does not contain a separate formal parameter-schema object. Parameters are represented by named placeholders in SQL, such as `:student_id` and `:class_id`, and are bound by the execution layer. Likewise, `output_schema` is a lightweight column contract rather than a complete SQL type specification.

The examples below reproduce the SQL stored for three tasks in the evaluated 52-task catalogue. They cover a single-series student task, a multi-query student task, and a cohort-level task.

## Example 1: `S-T01` — Score trend analysis

| Field | Registered value |
|---|---|
| Scope | `1 student` |
| Actionable question | Am I getting better or worse over time? |
| Source tables | `assessment_result`, `assessment` |
| Required capabilities | `assessment_scores`, `submission_history` |
| Parameters visible in SQL | `:student_id`, `:class_id` |
| Query label | `score_trend` |
| Required output columns | `assessment_order`, `score_normalized`, `pass_flag` |
| Visualization | `line_chart` |
| AI summary type | `trend_series` |
| Fallback | `show_empty_state` |
| Status | `certified` |

```sql
WITH
score_context AS (
  SELECT CASE WHEN MAX(ar.score_normalized) <= 20 THEN 20::float8 ELSE 100::float8 END AS score_scale,
         CASE WHEN MAX(ar.score_normalized) <= 20 THEN 10::float8 ELSE 40::float8 END AS pass_threshold,
         CASE WHEN MAX(ar.score_normalized) <= 20 THEN 14::float8 ELSE 70::float8 END AS target_threshold
  FROM assessment_result ar
  JOIN assessment a ON ar.assessment_id = a.assessment_id
  WHERE a.class_id = :class_id
),
class_assessment AS (
  SELECT ar.assessment_id,
         ROUND(AVG(ar.score_normalized)::numeric, 2)::float8 AS class_avg_score
  FROM assessment_result ar
  JOIN assessment a ON ar.assessment_id = a.assessment_id
  WHERE a.class_id = :class_id
  GROUP BY ar.assessment_id
),
student_trend AS (
  SELECT ar.student_id,
         REGR_SLOPE(ar.score_normalized, a.assessment_order)::float8 AS performance_trend
  FROM assessment_result ar
  JOIN assessment a ON ar.assessment_id = a.assessment_id
  WHERE ar.student_id = :student_id
    AND a.class_id = :class_id
  GROUP BY ar.student_id
)
SELECT a.assessment_order,
       a.week_of_class,
       a.assessment_type,
       a.assessment_name,
       ar.score_normalized,
       (ar.score_normalized >= sc.pass_threshold) AS pass_flag,
       ca.class_avg_score,
       ROUND((ar.score_normalized - ca.class_avg_score)::numeric, 2)::float8 AS score_vs_class_avg,
       sc.score_scale,
       sc.pass_threshold,
       sc.target_threshold,
       (ar.score_normalized < sc.pass_threshold) AS below_pass_threshold,
       (ar.score_normalized < sc.target_threshold) AS below_target_threshold,
       st.performance_trend,
       CASE
         WHEN ar.score_normalized < sc.pass_threshold THEN 'urgent_support'
         WHEN ar.score_normalized < sc.target_threshold THEN 'targeted_practice'
         WHEN ar.score_normalized < ca.class_avg_score THEN 'monitor'
         ELSE 'maintain'
       END AS support_level,
       CASE
         WHEN ar.score_normalized < sc.pass_threshold THEN 'Review this assessment with tutor support; focus on missed core concepts before the next assessment.'
         WHEN ar.score_normalized < sc.target_threshold THEN 'Practice similar questions and review feedback to move from pass-level to target-level performance.'
         WHEN ar.score_normalized < ca.class_avg_score THEN 'You are passing but below class average here; review feedback and compare preparation habits.'
         ELSE 'Keep the current preparation pattern and use feedback to protect this level.'
       END AS recommended_action
FROM assessment_result ar
JOIN assessment a ON ar.assessment_id = a.assessment_id
JOIN class_assessment ca ON ca.assessment_id = ar.assessment_id
CROSS JOIN score_context sc
LEFT JOIN student_trend st ON st.student_id = ar.student_id
WHERE ar.student_id = :student_id
  AND a.class_id = :class_id
ORDER BY a.assessment_order
```

This contract returns an ordered assessment series, class-relative context, run-time score thresholds, flags, and deterministic action labels. The explanation layer receives the returned evidence under the `score_trend` label; it does not calculate the underlying scores.

## Example 2: `S-T07` — Absence / inactivity impact

| Field | Registered value |
|---|---|
| Scope | `1 student` |
| Actionable question | How much are my absences hurting my grades? |
| Source tables | `enrollment`, `assessment_result`, `assessment` |
| Required capabilities | `assessment_scores`, `absence_tracking` |
| Parameters visible in SQL | `:student_id`, `:class_id` |
| Query labels | `absence_data`, `score_series` |
| Required output columns | `assessment_order`, `score_normalized` |
| Visualization | `bar_chart` |
| AI summary type | `trend_series` |
| Fallback | `hide_task` |
| Status | `validated` |

The first query produces the contextual absence dataset:

```sql
SELECT e.absences,       ROUND(e.absences::float / NULLIF(         (SELECT MAX(e2.absences)          FROM enrollment e2          WHERE e2.class_id = :class_id            AND e2.source_dataset = 'UCI'), 0), 4) AS absence_rate FROM enrollment e WHERE e.student_id = :student_id AND e.class_id = :class_id
```

The second query produces the primary score series:

```sql
SELECT a.assessment_order, a.week_of_class, ar.score_normalized, ar.pass_flag FROM assessment_result ar JOIN assessment a ON ar.assessment_id = a.assessment_id WHERE ar.student_id = :student_id AND a.class_id = :class_id ORDER BY a.assessment_order
```

This example shows why a task contract can contain more than one returned dataset. The registry assigns `absence_data` the role `context_snapshot` and `score_series` the role `primary_series`. Its availability contract further restricts the absence signal to UCI because the OULAD canonical import does not provide absences. The query supplies aligned context for interpretation but does not by itself identify a causal effect of absence on grades.

## Example 3: `A-B01` — Overall performance distribution

| Field | Registered value |
|---|---|
| Scope | `Cohort` |
| Actionable question | How is the class performing overall? |
| Source tables | `assessment_result`, `assessment`, `enrollment` |
| Required capabilities | `assessment_scores`, `final_outcome` |
| Parameter visible in SQL | `:class_id` |
| Query label | `score_distribution` |
| Required output columns | `score_bucket`, `student_count` |
| Visualization | `bar_chart` |
| AI summary type | `numeric_distribution` |
| Fallback | `show_empty_state` |
| Status | `validated` |

```sql
WITH per_student AS (SELECT e.student_id, ROUND(AVG(ar.score_normalized)::numeric, 2)::float8 AS avg_score FROM enrollment e LEFT JOIN assessment_result ar ON ar.enrollment_id = e.enrollment_id WHERE e.class_id = :class_id GROUP BY e.student_id), bucketed AS (SELECT CASE WHEN avg_score IS NULL THEN 'No score' WHEN avg_score < 10 THEN '0-10' WHEN avg_score < 20 THEN '10-20' WHEN avg_score < 30 THEN '20-30' WHEN avg_score < 40 THEN '30-40' WHEN avg_score < 50 THEN '40-50' WHEN avg_score < 60 THEN '50-60' WHEN avg_score < 70 THEN '60-70' WHEN avg_score < 80 THEN '70-80' WHEN avg_score < 90 THEN '80-90' ELSE '90-100' END AS score_bucket, CASE WHEN avg_score IS NULL THEN 11 WHEN avg_score < 10 THEN 1 WHEN avg_score < 20 THEN 2 WHEN avg_score < 30 THEN 3 WHEN avg_score < 40 THEN 4 WHEN avg_score < 50 THEN 5 WHEN avg_score < 60 THEN 6 WHEN avg_score < 70 THEN 7 WHEN avg_score < 80 THEN 8 WHEN avg_score < 90 THEN 9 ELSE 10 END AS bucket_order, avg_score FROM per_student) SELECT score_bucket, COUNT(*)::int AS student_count, ROUND((COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0))::numeric, 1)::float8 AS pct_of_class, ROUND(AVG(avg_score)::numeric, 2)::float8 AS avg_score_in_bucket FROM bucketed GROUP BY score_bucket, bucket_order ORDER BY bucket_order
```

This contract illustrates a cohort-level distribution. It first computes each student's average normalized score and then returns ten-point score buckets, a separate no-score category, class percentages, and the average score within each bucket.

## Interpretation boundary

These examples document executable registry contracts and the evidence passed downstream. They demonstrate traceability from a task identifier to capability requirements, SQL, result labels, and explanation metadata. They do not establish the educational validity of every task formulation or the causal validity of relationships described by observational data.
