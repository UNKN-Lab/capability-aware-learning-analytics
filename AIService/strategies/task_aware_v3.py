"""Experimental Task-Aware Summary V3/V3.1 prompt composer.

V3 preserves the strongest part of the historical baseline (the first K raw
rows) and appends compact, ordered evidence derived from the full result set.
V3.1 keeps task-critical evidence non-removable and adds task-output contracts
so the LLM explains the right evidence shape instead of only summarizing it.
The module only composes prompt text; task-specific calculations remain in the
existing summarizers in ``base.py``.
"""

from __future__ import annotations

from collections import OrderedDict
import json
import math
import os
from typing import Any


DEFAULT_TOP_K = 15
DEFAULT_SOFT_TOKEN_RATIO = 1.2
DEFAULT_MAX_TOKEN_RATIO = 1.5
DEFAULT_MAX_EXTRA_TOKENS = 800
VERSION_LABEL = "v3.1-experimental"

SECTION_ORDER = (
    "scope",
    "primary_finding",
    "comparison",
    "trend_relationship",
    "exceptions",
    "action_evidence",
    "limitations",
)


# Top-level keys are deliberately explicit. Arrays retain the deterministic
# order produced by each task summarizer; objects retain the semantic insertion
# order established there.
TYPE_SECTION_KEYS: dict[str, dict[str, tuple[str, ...]]] = {
    "metric_snapshot": {
        "scope": ("dataset_name", "row_count", "entity", "evidence_status"),
        "primary_finding": (
            "metric_snapshot", "status_evidence", "label_evidence",
        ),
        "comparison": ("threshold_evidence", "benchmark_evidence"),
        "exceptions": (
            "flag_evidence", "sensitive_context_present", "sensitive_context",
        ),
        "action_evidence": ("action_evidence",),
        "limitations": (
            "missing_evidence", "validation_metadata", "causal_claim_allowed",
            "summarization_warnings",
        ),
    },
    "trend_series": {
        "scope": (
            "dataset_name", "row_count", "point_count", "time_column",
            "metric_column", "dataset_roles", "metric_units", "metric_directions",
        ),
        "primary_finding": ("first_point", "last_point", "overall_change"),
        "comparison": (
            "secondary_metric_evidence", "secondary_metric_associations",
            "multi_dataset_evidence",
        ),
        "trend_relationship": (
            "largest_adjacent_rise", "largest_adjacent_drop",
        ),
        "exceptions": ("peak", "trough", "flagged_points"),
        "action_evidence": ("action_evidence",),
        "limitations": (
            "small_sample_caveats", "causal_claim_allowed", "summarization_warnings",
        ),
    },
    "trend_comparison": {
        "scope": (
            "dataset_name", "row_count", "group_column", "time_column",
            "metric_column", "target_group", "comparison_groups",
            "available_groups", "dynamic_comparison_groups", "alignment_columns",
        ),
        "primary_finding": ("target_trend", "group_trends", "evidence_status"),
        "comparison": ("comparison_trends", "pairwise_comparison"),
        "trend_relationship": ("divergence_threshold",),
        "limitations": (
            "missing_group_evidence", "reliability_warnings", "summarization_warnings",
        ),
    },
    "ranking": {
        "scope": (
            "dataset_name", "row_count", "entity_column", "metric_column",
            "sort_direction",
        ),
        "primary_finding": ("top_items", "median_item", "bottom_items"),
        "comparison": ("metric_stats",),
        "exceptions": ("flag_evidence", "tie_warnings"),
        "limitations": ("summarization_warnings",),
    },
    "risk_flags": {
        "scope": (
            "dataset_name", "row_count", "total_flags", "triggered_count",
            "non_triggered_count", "unknown_triggered_count", "severity_available",
        ),
        "primary_finding": (
            "highest_severity_triggered", "triggered_flags", "non_triggered_flags",
        ),
        "comparison": ("threshold_evidence", "severity_counts"),
        "action_evidence": ("recommended_actions",),
        "limitations": ("summarization_warnings",),
    },
    "categorical_distribution": {
        "scope": (
            "dataset_name", "row_count", "category_column", "count_column",
            "percent_column", "metric_columns", "total_count", "percent_total",
            "focus_categories",
        ),
        "primary_finding": ("category_distribution", "focus_total"),
        "comparison": ("metric_evidence_by_category",),
        "exceptions": ("largest_category",),
        "limitations": (
            "missing_expected_categories", "missing_focus_categories",
            "summarization_warnings",
        ),
    },
    "numeric_distribution": {
        "scope": (
            "dataset_name", "row_count", "bin_column", "count_column",
            "percent_column", "total_count", "focus_bins",
        ),
        "primary_finding": ("bin_distribution", "focus_total"),
        "comparison": ("threshold_summary", "metric_evidence_by_bin"),
        "exceptions": ("dominant_bin",),
        "limitations": ("missing_expected_bins", "summarization_warnings"),
    },
    "correlation_evidence": {
        "scope": (
            "dataset_name", "row_count", "x_column", "y_column", "entity_column",
            "sample_size", "coefficient_method", "coefficient_source",
            "selected_entity_column", "selected_entity_count", "metric_units",
            "metric_directions",
        ),
        "primary_finding": ("coefficient", "direction", "strength"),
        "comparison": ("p_value", "selected_entity_evidence"),
        "trend_relationship": (
            "strength_claim_allowed", "significance_claim_allowed",
            "causal_claim_allowed",
        ),
        "exceptions": ("outliers",),
        "limitations": (
            "missing_selected_entity_evidence", "parse_warnings",
            "statistical_warnings", "sensitive_context_policy",
            "summarization_warnings",
        ),
    },
    "group_comparison": {
        "scope": (
            "dataset_name", "row_count", "group_column", "group_key_columns",
            "series_column", "metric_column", "count_column", "gap_column",
            "composite_group_keys",
        ),
        "primary_finding": ("focus_summary", "group_metrics", "group_series"),
        "comparison": ("gaps",),
        "exceptions": ("dominant_group", "weakest_group"),
        "limitations": (
            "missing_groups", "low_count_warnings", "fairness_warnings",
            "causal_claim_allowed", "summarization_warnings",
        ),
    },
    "multi_metric_comparison": {
        "scope": (
            "dataset_name", "row_count", "entities", "entity_column", "metrics",
            "metric_keys", "metric_key_column", "metric_value_column",
            "evidence_status", "evidence_requirements",
        ),
        "primary_finding": ("comparison_matrix", "selected_entity_evidence"),
        "comparison": (
            "pairwise_gaps", "pairwise_direction_evidence", "metric_extrema",
        ),
        "limitations": (
            "missing_metric_evidence", "missing_entity_evidence",
            "missing_expected_entities", "validation_metadata",
            "causal_claim_allowed", "summarization_warnings",
        ),
    },
    "action_synthesis": {
        "scope": (
            "source_datasets", "action_rule_set_id", "action_rule_version",
        ),
        "primary_finding": ("evidence_items", "rule_evaluations"),
        "comparison": ("conflicting_evidence",),
        "action_evidence": ("prioritized_actions", "action_evidence_links"),
        "limitations": (
            "missing_evidence", "unsupported_actions", "summarization_warnings",
        ),
    },
}

LIMITATION_KEYS = {
    "summarization_warnings",
    "reliability_warnings",
    "statistical_warnings",
    "parse_warnings",
    "missing_evidence",
    "missing_group_evidence",
    "missing_metric_evidence",
    "missing_entity_evidence",
    "validation_metadata",
}

MUST_KEEP_KEYS: dict[str, set[str]] = {
    "action_synthesis": {
        "source_datasets",
        "action_rule_set_id",
        "action_rule_version",
        "evidence_items",
        "rule_evaluations",
        "prioritized_actions",
        "action_evidence_links",
        "missing_evidence",
        "unsupported_actions",
        "summarization_warnings",
    },
    "risk_flags": {
        "dataset_name",
        "row_count",
        "total_flags",
        "triggered_count",
        "non_triggered_count",
        "triggered_flags",
        "non_triggered_flags",
        "threshold_evidence",
        "recommended_actions",
        "severity_counts",
        "summarization_warnings",
    },
    "ranking": {
        "dataset_name",
        "row_count",
        "entity_column",
        "metric_column",
        "sort_direction",
        "top_items",
        "metric_stats",
        "flag_evidence",
        "summarization_warnings",
    },
    "multi_metric_comparison": {
        "dataset_name",
        "row_count",
        "entities",
        "entity_column",
        "metrics",
        "comparison_matrix",
        "selected_entity_evidence",
        "pairwise_gaps",
        "pairwise_direction_evidence",
        "metric_extrema",
        "missing_metric_evidence",
        "missing_entity_evidence",
        "missing_expected_entities",
        "validation_metadata",
        "summarization_warnings",
    },
    "trend_series": {
        "dataset_name",
        "row_count",
        "point_count",
        "time_column",
        "metric_column",
        "first_point",
        "last_point",
        "overall_change",
        "largest_adjacent_drop",
        "flagged_points",
        "action_evidence",
        "small_sample_caveats",
        "summarization_warnings",
    },
}

TASK_SPECIFIC_MUST_KEEP_KEYS: dict[str, set[str]] = {
    "A-B02": {"category_distribution", "outcome_distribution_evidence"},
    "A-B03": {"category_distribution", "engagement_distribution_evidence"},
    "A-C03": {"comparison_matrix", "risk_profile_evidence"},
    "A-C05": {"comparison_matrix", "background_scope_evidence"},
    "A-G01": {"top_items", "low_engagement_contract_evidence"},
    "A-G04": {"top_items", "assessment_review_evidence"},
    "A-G07": {"top_items", "correlation_ranking_evidence"},
    "A-G12": {"group_metrics", "outcome_rate_evidence"},
    "A-C02": {"comparison_matrix", "pairwise_gaps", "largest_gap_evidence"},
    "A-G05": {"group_metrics", "group_series", "systemic_lateness_evidence"},
    "A-G08": {"group_metrics", "gaps", "engagement_cohort_comparison", "fairness_warnings"},
    "A-G11": {"largest_adjacent_drop", "flagged_points", "critical_week_evidence"},
    "A-G15": {"top_items", "flag_evidence", "priority_group_actions"},
    "A-G16": {"rule_evaluations", "prioritized_actions", "action_evidence_links"},
    "A-S01": {"metric_snapshot", "status_evidence", "profile_contract_evidence"},
    "A-S03": {"largest_adjacent_drop", "early_warning_evidence"},
    "A-S06": {"secondary_metric_evidence", "small_sample_caveats", "lateness_evidence"},
    "S-B01": {"metric_snapshot", "performance_overview_evidence"},
    "S-B03": {"metric_snapshot", "engagement_overview_evidence"},
    "A-S04": {"triggered_flags", "threshold_evidence", "recommended_actions"},
    "A-S05": {"top_items", "metric_stats", "scope_evidence"},
    "A-S07": {
        "metric_snapshot",
        "status_evidence",
        "sensitive_context",
        "validation_metadata",
    },
    "S-T03": {
        "comparison_matrix",
        "selected_entity_evidence",
        "pairwise_gaps",
        "standing_evidence",
    },
    "S-T05": {"flagged_points", "weekly_drop_evidence"},
    "S-T08": {"secondary_metric_evidence", "delay_score_evidence"},
    "S-T12": {"multi_dataset_evidence", "delay_score_evidence"},
    "S-T07": {
        "multi_dataset_evidence",
        "secondary_metric_associations",
        "small_sample_caveats",
    },
    "S-T13": {
        "rule_evaluations",
        "prioritized_actions",
        "action_evidence_links",
        "missing_evidence",
        "unsupported_actions",
    },
}

DEFAULT_MUST_KEEP_SECTIONS = {"scope", "limitations"}

TASK_OUTPUT_CONTRACTS: dict[str, tuple[str, ...]] = {
    "action_synthesis": (
        "Explain only actions already present in prioritized_actions or supported action-rule evidence.",
        "Do not create duplicate recommendations; explanation.recommendations may be empty by design.",
        "For every explained action, connect it to rule_evaluations, action_evidence_links, evidence_items, owner, priority, and time horizon when supplied.",
        "If no supported action exists, say that only when missing_evidence/unsupported_actions/rule output supports it.",
    ),
    "risk_flags": (
        "Use checklist style: triggered flags first, then non-triggered flags briefly.",
        "For triggered flags, state flag_value versus threshold plus severity, description, support category, and existing recommended_action when supplied.",
        "Do not invent new risk flags or new recommendations outside returned flag evidence.",
    ),
    "ranking": (
        "State the ranking/top entities, rank metric value, and why they are prioritized.",
        "For risk/admin ranking rows, include returned flags or recommended action fields when present.",
        "Do not generalize beyond returned rows or omit the top ranked examples.",
    ),
    "multi_metric_comparison": (
        "Compare the returned entities directly, naming which entity is higher/lower for each key metric.",
        "Use pairwise_gaps and selected_entity_evidence for direction; do not reverse numeric direction.",
        "If expected metric/entity evidence is missing, state the limitation rather than guessing.",
    ),
    "trend_series": (
        "Identify timing, first/last points, overall change, and flagged points when supplied.",
        "For empty or insufficient data, state row count and missing capability/data-quality warnings instead of inferring a trend.",
        "Only recommend timing when critical weeks or action_evidence are present.",
    ),
}

TASK_SPECIFIC_OUTPUT_CONTRACTS: dict[str, tuple[str, ...]] = {
    "A-B02": (
        "Preserve every returned outcome category with exact student_count and pct_of_class; never replace a present category with zero.",
        "Use 'largest category' rather than 'majority' unless its returned percentage exceeds 50%. Do not infer causes of outcomes.",
    ),
    "A-B03": (
        "Preserve all returned study_effort_level groups with exact student_count, pct_of_class, and avg_engagement_score.",
        "Describe the distribution only; do not claim that an intervention will improve engagement or academic outcomes.",
    ),
    "A-C03": (
        "For both students, preserve avg_score including null, at_risk_score, at_risk_label, final_outcome, and every explicit flag_* value.",
        "Explain risk only from triggered flags. Do not call engagement a driver when flag_low_engagement=0 and do not invent missing score evidence.",
    ),
    "A-C05": (
        "Preserve every returned background value for both students and state that no performance metric is supplied, so a background-driven performance difference is not estimable.",
        "Treat education, prior attempts, IMD, disability, and disadvantage as descriptive context only; do not infer experience, outcomes, causes, or support needs.",
    ),
    "A-G01": (
        "State the SQL-defined low-engagement threshold engagement_score < 0.15, the exact returned count, and every returned student identifier.",
        "Do not generalize the lowest tied rows' clicks, active days, or engagement score to all returned students. Recommend internal admin email/contact without promising an effect.",
    ),
    "A-G04": (
        "State that no explicit fail-rate threshold is supplied; preserve the exact highest assessment values and use them only as a curriculum-review signal.",
        "Do not invent a mean fail rate or attribute the result to student deficiency.",
    ),
    "A-G07": (
        "Rank every returned feature by abs_correlation_rank; if fewer than five are returned, state the exact count and that a fifth feature is unavailable.",
        "Use deterministic strength labels and treat disadvantage_score as sensitive descriptive context; correlation is not causal or prescriptive.",
    ),
    "A-G12": (
        "For every returned demographic group, state exact fail, withdrawal, and combined percentages and compare combined rate with the deterministic cohort fail+withdrawal threshold.",
        "Keep this categorical and descriptive; do not target interventions by demographic group or reverse group rankings.",
    ),
    "A-C02": (
        "State the exact values for active_days_norm, engagement_score, and total_clicks_norm for both returned students, and identify the largest absolute gap.",
        "Do not infer academic performance or prescribe an intervention from engagement-only evidence.",
    ),
    "A-G05": (
        "Preserve every returned final_outcome and assessment_type combination with student_count, submission_delay_avg, late_submission_rate, and punctuality_rate.",
        "Prioritize the highest-rate and largest-count groups without inventing causes, motivation, or outcome effects.",
    ),
    "A-G08": (
        "For every returned demographic group, state avg_score, score_vs_cohort, avg_engagement_score, and engagement deviation from the weighted cohort mean.",
        "This is descriptive equity evidence only; do not prescribe interventions by demographic group or infer causality.",
    ),
    "A-G11": (
        "Preserve the exact largest adjacent drop, every flagged week, and each flagged week's delta from the immediately preceding returned week.",
        "Tie action timing to before or at the observed critical weeks; do not infer causes.",
    ),
    "A-G15": (
        "List the top ten identifiers in rank order with at_risk_score, exact triggered flags, and final outcome.",
        "Use only the versioned internal admin-review mapping for score priority groups; do not use demographic attributes or promise outcomes.",
    ),
    "A-G16": (
        "Explain every triggered prioritized action with rule ID, action ID, owner, priority, time horizon, and linked evidence; recommendations must remain empty.",
    ),
    "A-S01": (
        "State exact score, outcome, risk score and label, engagement score, effort level, and previous attempts.",
        "Treat background attributes as descriptive only and do not invent a check-in or infer a cause.",
    ),
    "A-S03": (
        "Use early_warning_week as the primary collapse timing when returned, and state the exact previous/current clicks plus deterministic pre/post averages.",
        "A later largest adjacent drop may be secondary evidence but must not replace early_warning_week.",
        "Use exact absolute values only; do not add a derived percentage. Explicitly recommend outreach before or at early_warning_week without promising an effect.",
    ),
    "A-S06": (
        "State exact average delay, punctuality rate, valid late-submission count, and null-delay count.",
        "With fewer than six paired points, do not claim delay affects scores, motivation, or engagement; ground reminders/check-ins only in punctuality evidence.",
    ),
    "S-B01": (
        "State exact weighted score, unweighted score, class average, class median, score difference, score percentile, cohort size, trend, pass rate, outcome, assessment count, and performance band.",
        "Describe measured performance only; do not infer understanding, causes, or guaranteed future outcomes.",
    ),
    "S-B03": (
        "State exact clicks, active days, engagement score, all class averages, and study_effort_level.",
        "Treat activity metrics as descriptive; do not infer engagement quality, understanding, or learning outcomes.",
    ),
    "A-S04": (
        "For every triggered flag, explain the existing recommended_action; do not create a replacement action.",
    ),
    "A-S05": (
        "This is one selected student's assessment evidence. Never convert assessment_count or pass_rate into a claim about multiple students or the cohort.",
        "Name the lowest competency tag, its exact avg_score, and the configured support type.",
    ),
    "A-S07": (
        "Describe which support flags are present and absent, including existing school support, without inventing thresholds or causes.",
        "Treat background metrics as descriptive context only; do not infer that a value is below average unless a benchmark is supplied.",
        "Do not invent a new intervention such as enhancing support services; if you include an action, frame it as a specific evidence-grounded review/check of the returned support flags and raw context values.",
    ),
    "S-T03": (
        "State the exact student and cohort values for every returned metric, including score percentile and engagement percentile.",
        "Translate the returned score percentile into an explicit standing without hiding the numeric percentile.",
    ),
    "S-T05": (
        "List every returned weekly_engagement_drop=true week with its exact clicks and delta from the immediately preceding returned week.",
        "State explicitly whether assessment-proximity evidence is supplied. If no assessment schedule is present, mark proximity as not estimable rather than guessing.",
        "Do not infer motivation, challenge, learning effects, or causes from click changes.",
    ),
    "S-T08": (
        "State submission_delay_avg, punctuality_rate, all valid delay-score pairs, the null Exam delay, and the deterministic descriptive correlation.",
        "With four valid pairs, label the relationship descriptive_only_not_statistically_reliable; do not claim monotonic delay growth, causality, or score benefit from punctuality.",
    ),
    "S-T12": (
        "State systematic lateness from submission_delay_avg and punctuality_rate, all valid delay-score pairs, the null Exam delay, and the deterministic descriptive correlation.",
        "With four valid pairs, label the relationship descriptive_only_not_statistically_reliable; do not infer procrastination, learning harm, or causal score effects.",
    ),
    "S-T07": (
        "Start the summary with this exact evidence statement: absence_rate=0.125 (12.5%); association_status=not_estimable; with one absence snapshot, the evidence cannot quantify how much absences are hurting grades.",
        "State the exact absence_rate and the exact association_status=not_estimable for the absence-score relationship.",
        "Answer the student question directly: from one absence snapshot, the evidence cannot quantify how much absences are hurting grades.",
        "A single absence snapshot paired with a score series cannot estimate an absence-score correlation; describe the assessment-order score trend separately and do not call it a correlation or use it as evidence of absence impact.",
        "Do not make an attendance recommendation or claim that attendance would improve scores unless supplied action_evidence explicitly supports it.",
    ),
    "S-T13": (
        "Explain only prioritized_actions whose rule_evaluation is triggered, preserving action and rule provenance.",
        "If prioritized_actions is empty, explicitly state that no supported action was triggered.",
    ),
}


def _task_contract(summary_type: str, task_id: str | None) -> tuple[str, ...]:
    return (
        *TASK_OUTPUT_CONTRACTS.get(summary_type, ()),
        *TASK_SPECIFIC_OUTPUT_CONTRACTS.get(task_id or "", ()),
    )


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(value, maximum))


def _env_float(name: str, default: float, minimum: float) -> float:
    try:
        value = float(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default
    return max(minimum, value)


def load_v3_settings() -> dict[str, Any]:
    soft_ratio = _env_float(
        "AI_TASK_AWARE_SOFT_TOKEN_RATIO", DEFAULT_SOFT_TOKEN_RATIO, 1.0
    )
    max_ratio = _env_float(
        "AI_TASK_AWARE_MAX_TOKEN_RATIO", DEFAULT_MAX_TOKEN_RATIO, soft_ratio
    )
    return {
        "top_k": _env_int("AI_TASK_AWARE_TOP_K", DEFAULT_TOP_K, 1, 20),
        "soft_ratio": soft_ratio,
        "max_ratio": max(max_ratio, soft_ratio),
        "max_extra_tokens": _env_int(
            "AI_TASK_AWARE_MAX_EXTRA_TOKENS",
            DEFAULT_MAX_EXTRA_TOKENS,
            0,
            10000,
        ),
    }


def count_tokens(text: str, model: str) -> tuple[int, str]:
    """Count model tokens when tiktoken is installed, otherwise estimate safely."""
    try:
        import tiktoken  # type: ignore

        try:
            encoding = tiktoken.encoding_for_model(model)
        except KeyError:
            encoding = tiktoken.get_encoding("o200k_base")
        return len(encoding.encode(text)), f"tiktoken:{encoding.name}"
    except (ImportError, ModuleNotFoundError):
        # JSON-heavy prompts are usually close enough for a soft experimental
        # guard at four UTF-8 bytes per token. The method is exposed in metadata.
        return max(1, math.ceil(len(text.encode("utf-8")) / 4)), "utf8_bytes_div_4"


def _ordered_datasets(req) -> list[tuple[str, list]]:
    datasets = req.datasets or {}
    labels: list[str] = []
    for label in req.query_labels or []:
        if label in datasets and label not in labels:
            labels.append(label)
    for label in datasets:
        if label not in labels:
            labels.append(label)
    return [
        (label, datasets[label] if isinstance(datasets[label], list) else [])
        for label in labels
    ]


def _serialize_raw_rows(req, top_k: int) -> tuple[str, list[dict], int, int]:
    parts: list[str] = []
    breakdown: list[dict] = []
    full_count = 0
    included_count = 0
    for label, rows in _ordered_datasets(req):
        selected = rows[:top_k]
        full_count += len(rows)
        included_count += len(selected)
        suffix = (
            f"  [... {len(rows) - len(selected)} more rows not shown]"
            if len(rows) > len(selected)
            else ""
        )
        parts.append(
            f"Dataset: {label} ({len(rows)} rows)\n"
            f"{json.dumps(selected, indent=2, ensure_ascii=False, default=str)}{suffix}"
        )
        breakdown.append({
            "dataset_name": label,
            "row_count": len(rows),
            "included_row_count": len(selected),
        })
    return "\n\n".join(parts), breakdown, full_count, included_count


def _ordered_sections(summary: dict) -> list[dict]:
    summary_type = str(summary.get("summary_type") or "generic")
    profile = TYPE_SECTION_KEYS.get(summary_type, {})
    used: set[str] = {"summary_type"}
    sections: list[dict] = []

    for section_name in SECTION_ORDER:
        facts: OrderedDict[str, Any] = OrderedDict()
        for key in profile.get(section_name, ()):  # profile order is semantic order
            if key in summary:
                facts[key] = summary[key]
                used.add(key)
        if facts:
            sections.append({"name": section_name, "facts": facts})

    remaining = OrderedDict(
        (key, value) for key, value in summary.items() if key not in used
    )
    if remaining:
        primary = next(
            (section for section in sections if section["name"] == "primary_finding"),
            None,
        )
        if primary is None:
            primary = {"name": "primary_finding", "facts": OrderedDict()}
            insert_at = 1 if sections and sections[0]["name"] == "scope" else 0
            sections.insert(insert_at, primary)
        primary["facts"].update(remaining)

    return sections


def _evidence_payload(
    summary_type: str,
    sections: list[dict],
    task_id: str | None = None,
) -> OrderedDict:
    return OrderedDict((
        ("summary_type", summary_type),
        ("task_id", task_id),
        ("task_output_contract", _task_contract(summary_type, task_id)),
        ("sections", sections),
    ))


def _render_prompt(raw_text: str, evidence_payload: dict) -> str:
    evidence_text = json.dumps(
        evidence_payload,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )
    return (
        "RAW ROWS (first rows per dataset; values are unmodified):\n"
        f"{raw_text}\n\n"
        "TASK OUTPUT CONTRACT (follow this before writing the explanation):\n"
        f"{json.dumps(evidence_payload.get('task_output_contract', ()), ensure_ascii=False, default=str)}\n\n"
        "TASK-AWARE EVIDENCE (derived from the full result; ordered by meaning):\n"
        f"{evidence_text}\n\n"
        "LIMITATIONS:\n"
        "- Raw rows are a partial sample when a dataset has more rows.\n"
        "- Use task-aware evidence for aggregate claims and raw rows for examples."
    )


def _is_must_keep(
    summary_type: str,
    section_name: str,
    key: str,
    index: int,
    task_id: str | None = None,
) -> bool:
    if section_name in DEFAULT_MUST_KEEP_SECTIONS:
        return True
    if section_name == "primary_finding" and index == 0:
        return True
    return (
        key in MUST_KEEP_KEYS.get(summary_type, set())
        or key in TASK_SPECIFIC_MUST_KEEP_KEYS.get(task_id or "", set())
    )


def _pairwise_direction_evidence(pairwise_gaps: Any) -> list[dict]:
    if not isinstance(pairwise_gaps, list):
        return []
    evidence: list[dict] = []
    for item in pairwise_gaps:
        if not isinstance(item, dict):
            continue
        gap = item.get("gap_right_minus_left")
        if not isinstance(gap, (int, float)):
            continue
        left = item.get("left_entity")
        right = item.get("right_entity")
        if gap > 0:
            higher, lower = right, left
        elif gap < 0:
            higher, lower = left, right
        else:
            higher, lower = None, None
        evidence.append({
            "metric": item.get("metric"),
            "left_entity": left,
            "right_entity": right,
            "higher_entity": higher,
            "lower_entity": lower,
            "difference": round(abs(gap), 4),
            "direction_note": (
                "right_entity is higher" if gap > 0
                else "left_entity is higher" if gap < 0
                else "entities are tied"
            ),
        })
    return evidence


def _augment_summary(summary: dict) -> dict:
    augmented = dict(summary)
    if (
        augmented.get("summary_type") == "multi_metric_comparison"
        and "pairwise_direction_evidence" not in augmented
    ):
        direction_evidence = _pairwise_direction_evidence(
            augmented.get("pairwise_gaps")
        )
        if direction_evidence:
            augmented["pairwise_direction_evidence"] = direction_evidence[:120]
    return augmented


def _augment_task_specific_summary(summary: dict, req) -> dict:
    augmented = dict(summary)
    task_id = str(getattr(req, "task_id", "") or "")
    datasets = getattr(req, "datasets", None) or {}

    def numeric(value):
        try:
            result = float(value)
        except (TypeError, ValueError):
            return None
        return result if math.isfinite(result) else None

    def pearson(rows, x_key, y_key):
        pairs = [(numeric(row.get(x_key)), numeric(row.get(y_key))) for row in rows]
        pairs = [(x, y) for x, y in pairs if x is not None and y is not None]
        if len(pairs) < 2:
            return None
        mean_x = sum(x for x, _ in pairs) / len(pairs)
        mean_y = sum(y for _, y in pairs) / len(pairs)
        numerator = sum((x - mean_x) * (y - mean_y) for x, y in pairs)
        denominator = math.sqrt(sum((x - mean_x) ** 2 for x, _ in pairs) * sum((y - mean_y) ** 2 for _, y in pairs))
        return round(numerator / denominator, 4) if denominator else None

    if task_id == "A-B02" and datasets.get("outcome_counts"):
        rows = [row for row in datasets["outcome_counts"] if isinstance(row, dict)]
        largest = max(rows, key=lambda row: numeric(row.get("pct_of_class")) or 0, default=None)
        augmented["outcome_distribution_evidence"] = {
            "categories": rows,
            "largest_category": largest,
            "majority_status": (
                "majority"
                if largest and (numeric(largest.get("pct_of_class")) or 0) > 50
                else "no_category_exceeds_50_percent"
            ),
            "causal_claim_allowed": False,
        }
    elif task_id == "A-B03" and datasets.get("engagement_distribution"):
        rows = [row for row in datasets["engagement_distribution"] if isinstance(row, dict)]
        augmented["engagement_distribution_evidence"] = {
            "groups": rows,
            "group_count": len(rows),
            "policy": "descriptive_distribution_only_no_improvement_promise",
        }
    elif task_id == "A-C03" and datasets.get("risk_comparison"):
        rows = [row for row in datasets["risk_comparison"] if isinstance(row, dict)]
        augmented["risk_profile_evidence"] = {
            "students": rows,
            "required_flag_fields": [
                "flag_low_score", "flag_repeated", "flag_low_engagement",
                "flag_low_punctuality", "flag_neg_trend",
            ],
            "policy": "explain risk only from explicit triggered flags; preserve null score evidence",
        }
    elif task_id == "A-C05" and datasets.get("background_comparison"):
        augmented["background_scope_evidence"] = {
            "students": datasets["background_comparison"],
            "performance_metric_present": False,
            "performance_difference_status": "not_estimable",
            "policy": "background_context_descriptive_only",
        }
    elif task_id == "A-G01" and datasets.get("low_engagement_group"):
        rows = [row for row in datasets["low_engagement_group"] if isinstance(row, dict)]
        scores = [numeric(row.get("engagement_score")) for row in rows if numeric(row.get("engagement_score")) is not None]
        augmented["low_engagement_contract_evidence"] = {
            "threshold": {"metric": "engagement_score", "operator": "<", "value": 0.15, "source": "task_sql"},
            "student_count": len(rows),
            "student_ids": [row.get("student_id") for row in rows],
            "score_range": [min(scores, default=None), max(scores, default=None)],
            "claim_limit": "row-level clicks and active days must not be generalized across the group",
        }
    elif task_id == "A-G04" and datasets.get("assessment_difficulty"):
        rows = [row for row in datasets["assessment_difficulty"] if isinstance(row, dict)]
        ordered = sorted(rows, key=lambda row: -(numeric(row.get("fail_rate_pct")) or 0))
        augmented["assessment_review_evidence"] = {
            "explicit_fail_rate_threshold": None,
            "threshold_status": "not_supplied",
            "highest_fail_rate_assessment": ordered[0] if ordered else None,
            "review_policy": "curriculum_review_signal_not_student_deficiency",
        }
    elif task_id == "A-G07" and datasets.get("factor_correlation_matrix"):
        rows = [row for row in datasets["factor_correlation_matrix"] if isinstance(row, dict)]
        ordered = sorted(rows, key=lambda row: numeric(row.get("abs_correlation_rank")) or float("inf"))
        augmented["correlation_ranking_evidence"] = {
            "returned_feature_count": len(ordered),
            "fifth_feature_status": "unavailable" if len(ordered) < 5 else "available",
            "features": ordered,
            "strength_policy": "abs(r)<0.1 negligible; <0.3 weak; <0.5 moderate; otherwise strong",
            "causal_claim_allowed": False,
        }
    elif task_id == "A-G12" and datasets.get("outcome_by_group"):
        rows = [row for row in datasets["outcome_by_group"] if isinstance(row, dict)]
        totals = {}
        total_students = 0
        total_adverse = 0
        for row in rows:
            group = str(row.get("group_value"))
            outcome = str(row.get("final_outcome"))
            count = int(numeric(row.get("student_count")) or 0)
            totals.setdefault(group, {})[outcome] = row.get("pct_within_group")
            total_students += count
            if outcome in {"Fail", "Withdrawn"}:
                total_adverse += count
        cohort = round(total_adverse * 100 / total_students, 4) if total_students else None
        augmented["outcome_rate_evidence"] = {
            "cohort_fail_withdrawal_threshold_pct": cohort,
            "groups": [{
                "group_value": group,
                "fail_rate_pct": values.get("Fail", 0),
                "withdrawal_rate_pct": values.get("Withdrawn", 0),
                "combined_rate_pct": round((numeric(values.get("Fail")) or 0) + (numeric(values.get("Withdrawn")) or 0), 1),
            } for group, values in sorted(totals.items())],
            "policy": "categorical_descriptive_only_no_group_prescription",
        }
    elif task_id == "A-C02" and datasets.get("engagement_comparison"):
        gaps = augmented.get("pairwise_gaps") or []
        largest = max(gaps, key=lambda item: numeric(item.get("absolute_gap")) or -1, default=None)
        augmented["largest_gap_evidence"] = largest
    elif task_id == "A-G05" and datasets.get("submission_behaviour"):
        rows = [row for row in datasets["submission_behaviour"] if isinstance(row, dict)]
        ordered = sorted(
            rows,
            key=lambda row: (
                -(numeric(row.get("late_submission_rate")) or 0),
                -(numeric(row.get("student_count")) or 0),
            ),
        )
        augmented["systemic_lateness_evidence"] = {
            "all_groups": [
                {
                    key: row.get(key)
                    for key in (
                        "final_outcome", "assessment_type", "student_count",
                        "submission_delay_avg", "late_submission_rate", "punctuality_rate",
                    )
                }
                for row in ordered
            ],
            "highest_rate_group": ordered[0] if ordered else None,
            "largest_count_among_positive_late_rate": max(
                (row for row in rows if (numeric(row.get("late_submission_rate")) or 0) > 0),
                key=lambda row: numeric(row.get("student_count")) or 0,
                default=None,
            ),
        }
    elif task_id == "A-G08" and datasets.get("demographic_performance"):
        rows = [row for row in datasets["demographic_performance"] if isinstance(row, dict)]
        total = sum(numeric(row.get("student_count")) or 0 for row in rows)
        weighted = (
            sum((numeric(row.get("student_count")) or 0) * (numeric(row.get("avg_engagement_score")) or 0) for row in rows) / total
            if total else None
        )
        augmented["engagement_cohort_comparison"] = {
            "weighted_cohort_engagement_mean": round(weighted, 4) if weighted is not None else None,
            "groups": [
                {
                    "group_value": row.get("group_value"),
                    "student_count": row.get("student_count"),
                    "avg_score": row.get("avg_score"),
                    "score_vs_cohort": row.get("score_vs_cohort"),
                    "avg_engagement_score": row.get("avg_engagement_score"),
                    "engagement_vs_cohort": (
                        round((numeric(row.get("avg_engagement_score")) or 0) - weighted, 4)
                        if weighted is not None else None
                    ),
                }
                for row in rows
            ],
            "policy": "descriptive_equity_comparison_only_no_group_prescription",
        }
    elif task_id == "A-G11" and datasets.get("weekly_drop_detection"):
        rows = [row for row in datasets["weekly_drop_detection"] if isinstance(row, dict)]
        ordered = sorted(rows, key=lambda row: numeric(row.get("week_number")) or 0)
        critical = []
        for index, row in enumerate(ordered):
            if not row.get("is_drop_week"):
                continue
            previous = ordered[index - 1] if index > 0 else None
            critical.append({
                "week_number": row.get("week_number"),
                "week_total_clicks": row.get("week_total_clicks"),
                "previous_week_number": previous.get("week_number") if previous else None,
                "previous_week_total_clicks": previous.get("week_total_clicks") if previous else None,
                "adjacent_delta": (
                    (numeric(row.get("week_total_clicks")) or 0) - (numeric(previous.get("week_total_clicks")) or 0)
                    if previous else None
                ),
                "drop_pct": row.get("drop_pct"),
            })
        augmented["critical_week_evidence"] = {
            "largest_adjacent_drop": augmented.get("largest_adjacent_drop"),
            "flagged_weeks": critical,
            "timing_policy": "schedule review before or at returned critical weeks",
        }
    elif task_id == "A-G15" and datasets.get("intervention_priority_list"):
        rows = [row for row in datasets["intervention_priority_list"] if isinstance(row, dict)]
        groups = sorted({int(numeric(row.get("at_risk_score")) or 0) for row in rows}, reverse=True)
        mapping = {
            5: "Review this highest-score group first and assign a follow-up owner based on the returned flags.",
            4: "Review this next-score group after score-5 cases and confirm which returned flags require follow-up.",
        }
        augmented["priority_group_actions"] = {
            "mapping_version": "oulad_admin_review_v1",
            "actions": [
                {"at_risk_score": score, "action": mapping[score], "claim_limit": "review workflow only; do not promise outcomes"}
                for score in groups if score in mapping
            ],
        }
    elif task_id == "A-S01" and datasets.get("student_profile"):
        row = next((row for row in datasets["student_profile"] if isinstance(row, dict)), None)
        augmented["profile_contract_evidence"] = row
    elif task_id == "A-S03" and datasets.get("engagement_trajectory"):
        rows = [row for row in datasets["engagement_trajectory"] if isinstance(row, dict)]
        warning = next((numeric(row.get("early_warning_week")) for row in rows if numeric(row.get("early_warning_week")) is not None), None)
        if warning is not None:
            pre = [numeric(row.get("weekly_clicks")) for row in rows if numeric(row.get("week_number")) is not None and numeric(row.get("week_number")) < warning]
            post = [numeric(row.get("weekly_clicks")) for row in rows if numeric(row.get("week_number")) is not None and numeric(row.get("week_number")) >= warning]
            current = next((row for row in rows if numeric(row.get("week_number")) == warning), None)
            previous = next((row for row in rows if numeric(row.get("week_number")) == warning - 1), None)
            augmented["early_warning_evidence"] = {
                "early_warning_week": warning,
                "previous_week_clicks": previous.get("weekly_clicks") if previous else None,
                "warning_week_clicks": current.get("weekly_clicks") if current else None,
                "warning_week_delta": current.get("weekly_engagement_drop") if current else None,
                "pre_warning_average": round(sum(pre) / len(pre), 4) if pre else None,
                "post_warning_average": round(sum(post) / len(post), 4) if post else None,
                "largest_later_drop": augmented.get("largest_adjacent_drop"),
            }
    elif task_id == "A-S06" and datasets.get("submission_lateness"):
        rows = [row for row in datasets["submission_lateness"] if isinstance(row, dict)]
        valid = [row for row in rows if numeric(row.get("submission_delay_days")) is not None]
        augmented["lateness_evidence"] = {
            "submission_delay_avg": next((row.get("submission_delay_avg") for row in rows if row.get("submission_delay_avg") is not None), None),
            "punctuality_rate": next((row.get("punctuality_rate") for row in rows if row.get("punctuality_rate") is not None), None),
            "valid_delay_count": len(valid),
            "null_delay_count": len(rows) - len(valid),
            "all_valid_submissions_late": bool(valid) and all((numeric(row.get("submission_delay_days")) or 0) > 0 for row in valid),
            "association_status": "descriptive_only_not_statistically_reliable",
            "paired_point_count": len(valid),
            "minimum_reliable_point_count": 6,
        }
    elif task_id == "S-B01" and datasets.get("performance_summary"):
        row = next((row for row in datasets["performance_summary"] if isinstance(row, dict)), None)
        augmented["performance_overview_evidence"] = {
            "snapshot": row,
            "policy": "measured_performance_only_no_understanding_or_future_outcome_inference",
        }
    elif task_id == "S-B03" and datasets.get("engagement_summary"):
        row = next((row for row in datasets["engagement_summary"] if isinstance(row, dict)), None)
        augmented["engagement_overview_evidence"] = {
            "snapshot": row,
            "policy": "activity_metrics_descriptive_only_no_learning_outcome_inference",
        }
    elif task_id == "A-S05":
        augmented["scope_evidence"] = {
            "scope": "one selected student",
            "student_id": getattr(getattr(req, "student_context", None), "student_id", None),
            "assessment_count_semantics": "count of assessment rows for the selected student, not student count",
        }
    elif task_id == "S-T03":
        rows = (getattr(req, "datasets", None) or {}).get("peer_comparison", [])
        standing = next((
            row.get("metric_value") for row in rows
            if isinstance(row, dict)
            and row.get("metric_name") == "Score percentile"
            and row.get("comparison_group") == "You"
        ), None)
        if isinstance(standing, (int, float)):
            engagement = next((
                row.get("metric_value") for row in rows
                if isinstance(row, dict)
                and row.get("metric_name") == "Engagement percentile"
                and row.get("comparison_group") == "You"
            ), None)
            augmented["standing_evidence"] = {
                "score_percentile": standing,
                "percent_at_or_below": standing,
                "percent_above": round(100 - standing, 4),
                "engagement_percentile": engagement,
                "engagement_percent_above": round(100 - engagement, 4) if isinstance(engagement, (int, float)) else None,
                "wording_guard": "Preserve the percentile and avoid reversing rank direction.",
            }
    elif task_id == "S-T05" and datasets.get("weekly_engagement"):
        rows = [row for row in datasets["weekly_engagement"] if isinstance(row, dict)]
        ordered = sorted(rows, key=lambda row: numeric(row.get("week_number")) or 0)
        flagged = []
        for index, row in enumerate(ordered):
            if row.get("weekly_engagement_drop") is not True:
                continue
            previous = ordered[index - 1] if index > 0 else None
            flagged.append({
                "week_number": row.get("week_number"),
                "weekly_clicks": row.get("weekly_clicks"),
                "previous_returned_week": previous.get("week_number") if previous else None,
                "previous_returned_week_clicks": previous.get("weekly_clicks") if previous else None,
                "adjacent_returned_delta": (
                    (numeric(row.get("weekly_clicks")) or 0) - (numeric(previous.get("weekly_clicks")) or 0)
                    if previous else None
                ),
            })
        augmented["weekly_drop_evidence"] = {
            "flagged_weeks": flagged,
            "assessment_schedule_present": False,
            "assessment_proximity_status": "not_estimable",
            "policy": "click changes are descriptive and do not establish cause or learning impact",
        }
    elif task_id == "S-T08" and datasets.get("submission_lateness"):
        rows = [row for row in datasets["submission_lateness"] if isinstance(row, dict)]
        valid = [row for row in rows if numeric(row.get("submission_delay_days")) is not None]
        augmented["delay_score_evidence"] = {
            "submission_delay_avg": next((row.get("submission_delay_avg") for row in rows if row.get("submission_delay_avg") is not None), None),
            "punctuality_rate": next((row.get("punctuality_rate") for row in rows if row.get("punctuality_rate") is not None), None),
            "valid_pair_count": len(valid),
            "null_delay_count": len(rows) - len(valid),
            "pairs": [{"assessment_order": row.get("assessment_order"), "delay": row.get("submission_delay_days"), "score": row.get("score_normalized")} for row in valid],
            "pearson_correlation": pearson(valid, "submission_delay_days", "score_normalized"),
            "association_status": "descriptive_only_not_statistically_reliable",
        }
    elif task_id == "S-T12" and datasets.get("submission_series"):
        rows = [row for row in datasets["submission_series"] if isinstance(row, dict)]
        valid = [row for row in rows if numeric(row.get("submission_delay_days")) is not None]
        punctuality = next((row for row in datasets.get("punctuality_summary", []) if isinstance(row, dict)), {})
        augmented["delay_score_evidence"] = {
            "submission_delay_avg": punctuality.get("submission_delay_avg"),
            "punctuality_rate": punctuality.get("punctuality_rate"),
            "valid_pair_count": len(valid),
            "null_delay_count": len(rows) - len(valid),
            "pairs": [{"assessment_order": row.get("assessment_order"), "delay": row.get("submission_delay_days"), "score": row.get("score_normalized")} for row in valid],
            "pearson_correlation": pearson(valid, "submission_delay_days", "score_normalized"),
            "association_status": "descriptive_only_not_statistically_reliable",
        }
    elif task_id == "S-T07":
        absence_rows = (getattr(req, "datasets", None) or {}).get("absence_data", [])
        score_rows = (getattr(req, "datasets", None) or {}).get("score_series", [])
        absence_rate = absence_rows[0].get("absence_rate") if absence_rows and isinstance(absence_rows[0], dict) else None
        augmented["association_evidence"] = {
            "absence_rate": absence_rate,
            "absence_observation_count": len(absence_rows),
            "score_observation_count": len(score_rows),
            "association_status": "not_estimable",
            "reason": "Only one student-level absence snapshot is supplied; assessment-order score variation cannot estimate absence-score association.",
        }
    return augmented


def _trim_optional_evidence(
    raw_text: str,
    summary_type: str,
    sections: list[dict],
    reference_tokens: int,
    max_ratio: float,
    max_extra_tokens: int,
    model: str,
    task_id: str | None = None,
) -> tuple[str, list[str], int, str]:
    omitted: list[str] = []

    def render_and_count() -> tuple[str, int, str]:
        text = _render_prompt(raw_text, _evidence_payload(summary_type, sections, task_id))
        token_count, method = count_tokens(text, model)
        return text, token_count, method

    text, token_count, method = render_and_count()
    max_tokens = max(
        1,
        math.ceil(reference_tokens * max_ratio),
        reference_tokens + max_extra_tokens,
    )
    if token_count <= max_tokens:
        return text, omitted, token_count, method

    # Remove optional facts from the end while preserving scope, the first
    # primary finding, and limitations that tell the model when not to trust data.
    removable: list[tuple[dict, str]] = []
    for section in reversed(sections):
        facts = section["facts"]
        keys = list(facts.keys())
        for index, key in reversed(list(enumerate(keys))):
            if _is_must_keep(summary_type, section["name"], key, index, task_id):
                continue
            removable.append((section, key))

    for section, key in removable:
        if token_count <= max_tokens:
            break
        section["facts"].pop(key, None)
        omitted.append(f"{section['name']}.{key}")
        sections[:] = [item for item in sections if item["facts"]]
        text, token_count, method = render_and_count()

    return text, omitted, token_count, method


def build_task_aware_v3(
    req,
    evidence_summary: dict,
    baseline_reference_text: str,
    model: str,
) -> tuple[dict, str]:
    settings = load_v3_settings()
    raw_text, breakdown, full_count, included_count = _serialize_raw_rows(
        req, settings["top_k"]
    )
    task_id = str(getattr(req, "task_id", "") or "")
    evidence_summary = _augment_task_specific_summary(
        _augment_summary(evidence_summary),
        req,
    )
    summary_type = str(evidence_summary.get("summary_type") or "generic")
    sections = _ordered_sections(evidence_summary)
    reference_tokens, reference_method = count_tokens(baseline_reference_text, model)
    prompt_text, omitted, prompt_tokens, prompt_method = _trim_optional_evidence(
        raw_text=raw_text,
        summary_type=summary_type,
        sections=sections,
        reference_tokens=reference_tokens,
        max_ratio=settings["max_ratio"],
        max_extra_tokens=settings["max_extra_tokens"],
        model=model,
        task_id=task_id,
    )
    ratio = round(prompt_tokens / reference_tokens, 4) if reference_tokens else None
    included_sections = [section["name"] for section in sections]

    warnings: list[str] = []
    if ratio is not None and ratio > settings["soft_ratio"]:
        warnings.append(
            "Task-aware V3 prompt exceeded the configured soft token ratio "
            f"({ratio} > {settings['soft_ratio']})."
        )
    if ratio is not None and ratio > settings["max_ratio"]:
        warnings.append(
            "Task-aware V3 prompt remained above the experimental safety ratio "
            "after optional evidence trimming; raw rows were preserved."
        )

    debug_payload = {
        "summary_type": summary_type,
        "ai_summary_version": VERSION_LABEL,
        "task_output_contract": _task_contract(summary_type, task_id),
        "must_keep_keys": sorted(
            MUST_KEEP_KEYS.get(summary_type, set())
            | TASK_SPECIFIC_MUST_KEEP_KEYS.get(task_id, set())
        ),
        "raw_row_limit": settings["top_k"],
        "full_result_row_count": full_count,
        "included_row_count": included_count,
        "included_raw_row_count": included_count,
        "dataset_row_breakdown": breakdown,
        "baseline_reference_tokens": reference_tokens,
        "task_aware_prompt_tokens": prompt_tokens,
        "token_ratio": ratio,
        "token_count_method": (
            prompt_method if prompt_method == reference_method
            else f"reference={reference_method};prompt={prompt_method}"
        ),
        "soft_token_ratio": settings["soft_ratio"],
        "max_token_ratio": settings["max_ratio"],
        "max_extra_tokens": settings["max_extra_tokens"],
        "evidence_sections_included": included_sections,
        "evidence_sections_omitted": omitted,
        "v3_warnings": warnings,
        "evidence_payload": _evidence_payload(summary_type, sections, task_id),
        # Runtime consumers such as action_synthesis need the complete
        # deterministic rule output. This stays in debug metadata and is never
        # serialized into the V3 data block.
        "source_evidence_summary": evidence_summary,
    }
    return debug_payload, prompt_text
