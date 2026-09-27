# Task Catalogue

## Catalogue boundary

The source-controlled definitions are maintained in [`Backend/src/config/taskRegistry.json`](../../Backend/src/config/taskRegistry.json). This document presents the 52 tasks included in the reported evaluation.

The identifier prefixes are implementation groupings:

- `S` denotes a student-facing task and `A` an instructor/administrator-facing task.
- `B` denotes an overview/basic group.
- `T` denotes the student analytical/trend group.
- `S` in `A-S` denotes an administrator view of a single student.
- `C` denotes a two-student comparison.
- `G` denotes a group or cohort analysis.

These codes organize the registry; they are not proposed as a universal educational-task taxonomy.

## How the catalogue was constructed

Each registry entry was developed from an actionable educational question and then bound to an executable contract:

1. Define the intended audience, analytical scope, and actionable question.
2. Identify the canonical entities and evidence capabilities needed to answer it.
3. Register parameterized SQL using the canonical field names.
4. Name each returned dataset and specify required and optional output columns where applicable.
5. Attach visualization metadata and an AI evidence-summary type.
6. Assign fallback behaviour for datasets that do not provide the required evidence.
7. Review the entry and record its registry status before freezing the evaluation scope.

The catalogue is author-constructed and source-controlled. The status names describe implementation readiness in this registry; they do not constitute external educational validation.

## Evaluated catalogue: 52 tasks

| ID | Task name | Scope | Required capabilities | Query label(s) | Visualization | AI summary | Status |
|---|---|---|---|---|---|---|---|
| `S-B01` | Performance overview | 1 student | `assessment_scores`, `final_outcome` | `performance_summary` | `card` | `metric_snapshot` | `certified` |
| `S-B02` | Risk status card | 1 student | `assessment_scores` | `risk_summary` | `card` | `metric_snapshot` | `certified` |
| `S-B03` | Engagement summary | 1 student | `assessment_scores`, `engagement_tracking` | `engagement_summary` | `card` | `metric_snapshot` | `certified` |
| `S-T01` | Score trend analysis | 1 student | `assessment_scores`, `submission_history` | `score_trend` | `line_chart` | `trend_series` | `certified` |
| `S-T02` | Competency gap analysis | 1 student | `assessment_scores` | `competency_scores` | `bar_chart` | `ranking` | `validated` |
| `S-T03` | Peer comparison | 1 student | `assessment_scores`, `multi_student_comparison` | `peer_comparison` | `bar_chart` | `multi_metric_comparison` | `validated` |
| `S-T04` | At-risk self-check | 1 student | `assessment_scores` | `risk_flags` | `checklist` | `risk_flags` | `certified` |
| `S-T05` | Weekly engagement trend | 1 student | `engagement_tracking`, `temporal_activity` | `weekly_engagement` | `bar_chart` | `trend_series` | `validated` |
| `S-T06` | Study consistency check | 1 student | `engagement_tracking`, `temporal_activity` | `consistency_data` | `heatmap` | `trend_series` | `validated` |
| `S-T07` | Absence / inactivity impact | 1 student | `assessment_scores`, `absence_tracking` | `absence_data`, `score_series` | `bar_chart` | `trend_series` | `validated` |
| `S-T08` | Assessment lateness impact | 1 student | `submission_timestamps` | `submission_lateness` | `scatter_plot` | `trend_series` | `validated` |
| `S-T09` | Lifestyle risk vs performance | 1 student + cohort context | `assessment_scores`, `lifestyle_factors` | `lifestyle_risk_scatter` | `scatter_plot` | `correlation_evidence` | `validated` |
| `S-T10` | Resource engagement breakdown | 1 student | `engagement_tracking`, `resource_clickstream` | `resource_usage` | `pie_chart` | `categorical_distribution` | `validated` |
| `S-T11` | Registration timing vs performance | 1 student | `assessment_scores`, `registration_timing` | `registration_data` | `scatter_plot` | `correlation_evidence` | `validated` |
| `S-T12` | Procrastination analysis | 1 student | `assessment_scores`, `submission_timestamps` | `submission_series`, `punctuality_summary` | `bar_chart` | `trend_series` | `validated` |
| `S-T13` | Action plan generation | 1 student | `assessment_scores` | `synthesis_data` | `card` | `action_synthesis` | `certified` |
| `S-T14` | Social balance vs performance | 1 student + cohort context | `assessment_scores`, `lifestyle_factors` | `social_balance_scatter` | `scatter_plot` | `correlation_evidence` | `validated` |
| `S-T15` | Family context vs performance | 1 student + cohort context | `assessment_scores`, `family_context` | `family_context_scatter` | `scatter_plot` | `correlation_evidence` | `validated` |
| `A-B01` | Overall performance distribution | Cohort | `assessment_scores`, `final_outcome` | `score_distribution` | `bar_chart` | `numeric_distribution` | `validated` |
| `A-B02` | Completion / outcome summary | Cohort | `final_outcome` | `outcome_counts` | `pie_chart` | `categorical_distribution` | `certified` |
| `A-B03` | Engagement distribution | Cohort | `engagement_tracking` | `engagement_distribution` | `bar_chart` | `categorical_distribution` | `validated` |
| `A-B04` | At-risk overview | Cohort | `assessment_scores`, `engagement_tracking` | `risk_overview` | `bar_chart` | `categorical_distribution` | `validated` |
| `A-S01` | Student full profile snapshot | 1 student | `assessment_scores`, `engagement_tracking` | `student_profile` | `card` | `metric_snapshot` | `validated` |
| `A-S02` | Student score trend | 1 student | `assessment_scores`, `submission_history` | `score_trend` | `line_chart` | `trend_series` | `validated` |
| `A-S03` | Student engagement trajectory | 1 student | `engagement_tracking`, `temporal_activity` | `engagement_trajectory` | `line_chart` | `trend_series` | `validated` |
| `A-S04` | Student risk flag breakdown | 1 student | `assessment_scores`, `absence_tracking` | `risk_flags` | `checklist` | `risk_flags` | `validated` |
| `A-S05` | Student competency gap | 1 student | `assessment_scores` | `competency_scores` | `bar_chart` | `ranking` | `validated` |
| `A-S06` | Student submission & punctuality | 1 student | `submission_timestamps` | `submission_lateness` | `bar_chart` | `trend_series` | `validated` |
| `A-S07` | Student background context | 1 student | `assessment_scores`, `demographics`, `lifestyle_factors` | `background_context` | `table` | `metric_snapshot` | `validated` |
| `A-S08` | Student intervention recommendation | 1 student | `assessment_scores`, `engagement_tracking` | `synthesis_data` | `card` | `action_synthesis` | `validated` |
| `A-C01` | Compare performance trajectories | 2 students | `assessment_scores`, `multi_student_comparison` | `trajectory_comparison` | `line_chart` | `trend_comparison` | `certified` |
| `A-C02` | Compare engagement patterns | 2 students | `engagement_tracking`, `multi_student_comparison` | `engagement_comparison` | `bar_chart` | `multi_metric_comparison` | `validated` |
| `A-C03` | Compare risk profile | 2 students | `assessment_scores`, `engagement_tracking`, `multi_student_comparison` | `risk_comparison` | `table` | `multi_metric_comparison` | `validated` |
| `A-C04` | Compare lifestyle context | 2 students | `assessment_scores`, `lifestyle_factors`, `multi_student_comparison` | `lifestyle_comparison` | `bar_chart` | `multi_metric_comparison` | `validated` |
| `A-C05` | Compare academic background | 2 students | `socioeconomic_context`, `multi_student_comparison` | `background_comparison` | `table` | `multi_metric_comparison` | `validated` |
| `A-C06` | Compare resource usage | 2 students | `engagement_tracking`, `resource_clickstream`, `multi_student_comparison` | `resource_comparison` | `bar_chart` | `multi_metric_comparison` | `validated` |
| `A-G01` | Identify low-engagement group | Many students | `engagement_tracking` | `low_engagement_group` | `scatter_plot` | `ranking` | `validated` |
| `A-G02` | Engagement–performance relationship | Many students | `assessment_scores`, `engagement_tracking` | `engagement_performance_scatter` | `scatter_plot` | `correlation_evidence` | `validated` |
| `A-G03` | Identify at-risk cohort | Many students | `assessment_scores` | `at_risk_cohort` | `table` | `ranking` | `certified` |
| `A-G04` | Assessment difficulty analysis | Many students | `assessment_scores` | `assessment_difficulty` | `bar_chart` | `ranking` | `validated` |
| `A-G05` | Submission behaviour analysis | Many students | `submission_history`, `submission_timestamps` | `submission_behaviour` | `bar_chart` | `group_comparison` | `certified` |
| `A-G06` | Activity type effectiveness | Many students | `engagement_tracking`, `resource_clickstream` | `activity_effectiveness` | `bar_chart` | `ranking` | `validated` |
| `A-G07` | Factor correlation analysis | Many students | `assessment_scores`, `engagement_tracking` | `factor_correlation_matrix` | `heatmap` | `ranking` | `validated` |
| `A-G08` | Background group performance & engagement profile | Many students | `assessment_scores`, `engagement_tracking`, `demographics` | `demographic_performance` | `bar_chart` | `group_comparison` | `validated` |
| `A-G09` | Socioeconomic disadvantage impact | Many students | `assessment_scores`, `demographics`, `socioeconomic_context`, `disadvantage_scoring` | `disadvantage_impact` | `scatter_plot` | `correlation_evidence` | `validated` |
| `A-G10` | Consistency analysis across cohort | Many students | `engagement_tracking`, `temporal_activity` | `consistency_distribution` | `bar_chart` | `categorical_distribution` | `validated` |
| `A-G11` | Weekly engagement drop detection | Many students | `engagement_tracking`, `temporal_activity` | `weekly_drop_detection` | `line_chart` | `trend_series` | `validated` |
| `A-G12` | Background group pass/fail/withdrawal rate | Many students | `assessment_scores`, `final_outcome`, `demographics` | `outcome_by_group` | `bar_chart` | `group_comparison` | `validated` |
| `A-G13` | Lifestyle risk across cohort | Many students | `assessment_scores`, `lifestyle_factors` | `lifestyle_risk_scatter` | `scatter_plot` | `correlation_evidence` | `validated` |
| `A-G14` | Early withdrawal signal analysis | Many students | `engagement_tracking`, `temporal_activity`, `final_outcome` | `withdrawal_signal_trend` | `line_chart` | `trend_comparison` | `validated` |
| `A-G15` | Intervention priority ranking | Many students | `assessment_scores`, `engagement_tracking` | `intervention_priority_list` | `table` | `ranking` | `validated` |
| `A-G16` | Admin action recommendation | Many students | `assessment_scores`, `engagement_tracking` | `synthesis_data` | `table` | `action_synthesis` | `validated` |
