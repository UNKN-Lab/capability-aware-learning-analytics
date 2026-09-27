# Canonical Educational Schema

## Scope

The evaluated pipeline maps each imported dataset independently into eight canonical domain entities. The model accommodates structural differences between source schemas; it does not imply concurrent federation or joint transformation of multiple datasets. Every record carries `batch_id` and `source_dataset` so that its import origin remains identifiable.

The authoritative physical definition is [`Backend/prisma/schema.prisma`](../../Backend/prisma/schema.prisma). The diagram below omits operational tables such as `ImportBatch`, import-session state, and AI explanation logs so that the eight analytical entities remain legible.

## Relationship diagram

```mermaid
erDiagram
    COURSE ||--o{ CLASS : contains
    STUDENT ||--o{ ENROLLMENT : has
    CLASS ||--o{ ENROLLMENT : admits
    CLASS ||--o{ ASSESSMENT : defines
    ASSESSMENT ||--o{ ASSESSMENT_RESULT : produces
    STUDENT ||--o{ ASSESSMENT_RESULT : receives
    ENROLLMENT ||--o{ ASSESSMENT_RESULT : contextualizes
    CLASS ||--o{ EVENT : exposes
    EVENT ||--o{ ENGAGEMENT : records
    STUDENT ||--o{ ENGAGEMENT : generates
    ENROLLMENT ||--o{ ENGAGEMENT : contextualizes

    STUDENT {
        string student_id PK
        string batch_id FK
        string source_dataset
        string gender
        int age_years
        string region
        string highest_education
        float disadvantage_score
    }

    COURSE {
        string course_id PK
        string batch_id FK
        string source_dataset
        string course_name
        string subject_area
    }

    CLASS {
        string class_id PK
        string batch_id FK
        string course_id FK
        string source_dataset
        string semester
        int duration_days
    }

    ENROLLMENT {
        string enrollment_id PK
        string batch_id FK
        string student_id FK
        string class_id FK
        string final_outcome
        int absences
        int registration_lead_time
    }

    ASSESSMENT {
        string assessment_id PK
        string batch_id FK
        string class_id FK
        string assessment_type
        int assessment_order
        float weight_pct
        int week_of_class
    }

    ASSESSMENT_RESULT {
        string result_id PK
        string batch_id FK
        string assessment_id FK
        string student_id FK
        string enrollment_id FK
        float score_raw
        float score_normalized
        boolean pass_flag
        int submission_day
    }

    EVENT {
        string event_id PK
        string batch_id FK
        string class_id FK
        string resource_id
        string resource_type
        int available_from_week
        int available_to_week
    }

    ENGAGEMENT {
        string engagement_id PK
        string batch_id FK
        string event_id FK
        string student_id FK
        string enrollment_id FK
        int event_day
        int week_number
        int engagement_count
        float log_click_score
    }
```

All eight entities also have a many-to-one relation to the operational `ImportBatch` record through `batch_id`. The current `Engagement` table uses `engagement_id` as its primary key and enforces uniqueness across `(batch_id, student_id, event_id, event_day)`.

## Entity summary

| Entity | Canonical grain | Primary key | Main foreign keys | Representative content | Analytical role |
|---|---|---|---|---|---|
| `Student` | One learner within an import batch | `student_id` | `batch_id` | Demographics, education, socioeconomic context, support and lifestyle attributes | Learner identity and contextual factors |
| `Course` | One course definition | `course_id` | `batch_id` | Course name and subject area | Top-level academic context |
| `Class` | One delivery/run of a course | `class_id` | `batch_id`, `course_id` | Run, semester, academic year, duration, delivery mode | Cohort and delivery context |
| `Enrollment` | One learner registered in one class | `enrollment_id` | `batch_id`, `student_id`, `class_id` | Start/end timing, outcome, prior attempts, study load, absences | Connects learners to cohorts and outcomes |
| `Assessment` | One assessment in one class | `assessment_id` | `batch_id`, `class_id` | Type, order, due day, weight, final-assessment flag | Defines graded checkpoints |
| `AssessmentResult` | One learner result for one assessment | `result_id` | `batch_id`, `assessment_id`, `student_id`, `enrollment_id` | Raw/normalized score, pass flag, submission day, banked status | Deterministic performance evidence |
| `Event` | One learning resource or activity in one class | `event_id` | `batch_id`, `class_id` | Resource identifier/type and availability window | Defines engagement targets |
| `Engagement` | One learner-event-day aggregate | `engagement_id` | `batch_id`, `event_id`, `student_id`, `enrollment_id` | Day/week, engagement count, log-click score | Time-indexed participation evidence |

## Stored normalized and derived fields

The schema stores normalized or derived values used by registered analytics alongside source-aligned fields. These values are populated only when their required inputs are available.

| Entity | Derived fields represented in the schema |
|---|---|
| `Student` | `lifestyle_risk_score`, `support_score`, `social_balance_score`, `family_stability_score`, `disadvantage_score` |
| `Enrollment` | `registration_lead_time` |
| `Assessment` | `week_of_class` |
| `AssessmentResult` | `score_normalized`, `pass_flag` |
| `Engagement` | `week_number`, `log_click_score` |

These fields are dataset-dependent. Their presence in the canonical schema does not mean that every import can populate them; unavailable evidence remains absent and is exposed through the capability model used by task validation.

## Construction procedure

The canonical model was constructed iteratively from the analytical concepts required by the task catalogue and the structures present in the evaluated datasets:

1. **Profile the source files.** Identify record grains, identifiers, data types, missingness, and relationships within the incoming dataset.
2. **Confirm mappings.** Map source columns to canonical concepts with human confirmation where names or semantics are ambiguous. Unmatched source fields are not silently assigned to semantically different targets.
3. **Route source records by grain.** Separate learner, course/class, enrollment, assessment/result, event, and engagement observations into the corresponding canonical entities.
4. **Create keys and relationships.** Assign canonical identifiers, attach the import batch, and resolve foreign keys so that downstream queries operate over explicit entity relations.
5. **Compute supported derived fields.** Calculate normalized or task-supporting fields only when their inputs and interpretation are available for the source dataset.
6. **Preserve provenance and absence.** Retain `batch_id` and `source_dataset`; leave unsupported attributes null rather than fabricating values. Dataset capabilities are derived after import to describe which evidence types are actually usable.
7. **Load at canonical grain.** Load records at the entity's declared grain while enforcing the schema's keys and uniqueness constraints. For OULAD engagement, multiple raw clickstream observations can contribute to one learner-event-day canonical record, so the canonical row count is smaller than the raw observation count by aggregation rather than row filtering.

This procedure permits the UCI and OULAD schemas to be transformed independently into the same analytical model while preserving dataset-specific limitations for later validation.
