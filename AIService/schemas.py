"""
Pydantic Schemas  AI Explanation Service
=========================================
CONTRACT 4 from phase3_contracts.md  all models defined here.

These schemas serve 3 purposes:
  1. Input validation: FastAPI validates incoming requests automatically
  2. Output validation: ExplainResponse.model_validate(llm_json) catches LLM hallucination
  3. Documentation: FastAPI auto-generates OpenAPI docs from these models
"""

from __future__ import annotations
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Any, Literal


# 
# REQUEST SCHEMAS (Node  Python)
# 

class SemanticRoles(BaseModel):
    """
    Axis semantic meaning  used by strategies to frame AI language.
    x="time" + granularity="weekly"  "week-over-week decline"
    x="category"  "the highest performing group..."
    """
    x: str | None = None   # "time"|"category"|"cohort"|"student"|"ranking"|"assessment"
    y: str | None = None   # "performance_metric"|"engagement_metric"|"risk_metric"|...
    color: str | None = None


class VisualizationConfig(BaseModel):
    """
    Chart rendering config from taskRegistry  passed to Python for
    axis-aware prompt construction (e.g. "over time" vs "by category").
    """
    x_field:        str | None = None
    y_field:        str | None = None
    series_field:   str | None = None
    color_field:    str | None = None
    orientation:    str | None = "horizontal"
    variant:        str = "default"
    x_label:        str | None = None
    y_label:        str | None = None
    semantic_roles: SemanticRoles | None = None


class AnalysisContext(BaseModel):
    """
    Temporal and aggregation context  drives AI language choices.
    granularity="weekly"  "sudden decline", "week-over-week"
    granularity="semester"  "long-term trend", "sustained improvement"
    """
    granularity:       str   # "weekly"|"per_assessment"|"semester"|"cohort_aggregate"
    aggregation_level: str   # "student"|"cohort"|"comparison"|"instructor"


class SemanticContext(BaseModel):
    """
    Semantic enrichment for tasks that use competency proxies.
    Injected by Node ai.controller when competency_source in data rows.

    competency_mode:
      "native"   dataset has real competency_tag ontology
      "proxy"    assessment_name used as fallback (G1, G2, G3 / TMA01, CMA01)
      "mixed"    some rows native, some proxy
      "unknown"  neither field available

    competency_proxy_note:
      Human-readable explanation (from task.semanticNote in registry).
    """
    competency_mode:       str | None = None
    competency_proxy_note: str | None = None


ActionConditionOperator = Literal[
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "is_present",
    "is_true",
]
ActionPriority = Literal["critical", "high", "medium", "low"]
ActionProvenanceField = Literal[
    "dataset_label",
    "dataset_role",
    "row_index",
    "column",
    "raw_value",
    "parsed_value",
    "unit",
    "rule_id",
    "rule_version",
    "availability_state",
]
REQUIRED_ACTION_PROVENANCE_FIELDS = {
    "dataset_label",
    "dataset_role",
    "row_index",
    "column",
    "raw_value",
    "parsed_value",
    "unit",
    "rule_id",
    "rule_version",
}


class ActionEvidenceConfig(BaseModel):
    """Parse-time contract for one evidence column used by action rules."""

    model_config = ConfigDict(extra="forbid")

    column: str = Field(min_length=1)
    role: Literal["entity", "metric", "status", "threshold", "context"]
    unit: str = Field(min_length=1)
    required: bool
    nullable: bool
    availability_column: str | None = None
    sensitive: bool
    allowed_as_trigger: bool
    semantic_alias: str | None = None
    semantic_note: str | None = None

    @model_validator(mode="after")
    def validate_sensitive_trigger_policy(self) -> "ActionEvidenceConfig":
        if self.sensitive and self.allowed_as_trigger:
            raise ValueError(
                f"sensitive evidence {self.column} cannot be allowed as trigger"
            )
        return self


class ActionDerivedEvidenceConfig(BaseModel):
    """Safe derived evidence supported by the frozen Phase 1 contract."""

    model_config = ConfigDict(extra="forbid")

    evidence_id: str = Field(min_length=1)
    operation: Literal["safe_divide"]
    numerator_column: str = Field(min_length=1)
    denominator_column: str = Field(min_length=1)
    unit: Literal["ratio_0_1"]
    zero_denominator_behavior: Literal["missing"]


class ActionRuleCondition(BaseModel):
    """One non-executable predicate in an action-rule trigger."""

    model_config = ConfigDict(extra="forbid")

    evidence_id: str = Field(min_length=1)
    operator: ActionConditionOperator
    value: Any | None = None
    compare_to_evidence_id: str | None = None

    @model_validator(mode="after")
    def validate_operand(self) -> "ActionRuleCondition":
        unary = self.operator in {"is_present", "is_true"}
        has_value = self.value is not None
        has_comparison = self.compare_to_evidence_id is not None
        if unary and (has_value or has_comparison):
            raise ValueError(f"{self.operator} must not define an operand")
        if not unary and has_value == has_comparison:
            raise ValueError(
                "condition must define exactly one of value or "
                "compare_to_evidence_id"
            )
        return self


class ActionRuleTrigger(BaseModel):
    """AND/OR trigger groups; free-text or executable expressions are forbidden."""

    model_config = ConfigDict(extra="forbid")

    all: list[ActionRuleCondition] = Field(default_factory=list)
    any: list[ActionRuleCondition] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_non_empty_trigger(self) -> "ActionRuleTrigger":
        if not self.all and not self.any:
            raise ValueError("action-rule trigger must contain at least one condition")
        return self


class ActionDefinitionConfig(BaseModel):
    """Deterministic action emitted only after its rule matches."""

    model_config = ConfigDict(extra="forbid")

    action_id: str = Field(min_length=1)
    action_text: str = Field(min_length=1)
    priority: ActionPriority
    owner: str = Field(min_length=1)
    time_horizon_days: int = Field(ge=0)
    support_category: str = Field(min_length=1)
    claim_limits: list[str] = Field(min_length=1)


class ActionRuleConfig(BaseModel):
    """Versioned action rule transported from the registry to the AI service."""

    model_config = ConfigDict(extra="forbid")

    rule_id: str = Field(min_length=1)
    description: str = Field(min_length=1)
    trigger: ActionRuleTrigger
    action: ActionDefinitionConfig
    provenance_requirements: list[ActionProvenanceField] = Field(min_length=1)


class ActionConflictRuleConfig(BaseModel):
    """Evidence combination that must be preserved and surfaced as a warning."""

    model_config = ConfigDict(extra="forbid")

    conflict_id: str = Field(min_length=1)
    when: ActionRuleTrigger
    behavior: Literal["preserve_and_warn"]


class AISummaryConfig(BaseModel):
    """
    Optional registry-driven instructions for compact prompt data summaries.
    Older requests omit this and fall back to a generic conservative summary.
    """
    summary_type: str | None = None
    target_group: str | None = None
    comparison_groups: list[str] = Field(default_factory=list)
    dynamic_comparison_groups: bool = False
    comparison_alignment_columns: list[str] = Field(default_factory=list)
    divergence_threshold: int | float | None = Field(default=None, ge=0)
    time_column: str | None = None
    x_column: str | None = None
    y_column: str | None = None
    metric_column: str | None = None
    entity_column: str | None = None
    color_column: str | None = None
    coefficient_column: str | None = None
    coefficient_method: str | None = None
    sample_size_column: str | None = None
    p_value_column: str | None = None
    outlier_policy: str | None = None
    group_column: str | None = None
    group_key_columns: list[str] = Field(default_factory=list)
    series_column: str | None = None
    gap_column: str | None = None
    reliability_column: str | None = None
    minimum_reliable_count: int | float | None = None
    minimum_sample_size: int | float | None = None
    category_column: str | None = None
    bin_column: str | None = None
    count_column: str | None = None
    percent_column: str | None = None
    metric_columns: list[str] = Field(default_factory=list)
    status_columns: list[str] = Field(default_factory=list)
    threshold_columns: list[str] = Field(default_factory=list)
    benchmark_columns: list[str] = Field(default_factory=list)
    sensitive_columns: list[str] = Field(default_factory=list)
    metric_availability_columns: dict[str, str] = Field(default_factory=dict)
    threshold_sources: dict[str, str] = Field(default_factory=dict)
    benchmark_sources: dict[str, str] = Field(default_factory=dict)
    metric_key_column: str | None = None
    metric_value_column: str | None = None
    entity_order: list[str] = Field(default_factory=list)
    metric_directions: dict[str, str] = Field(default_factory=dict)
    metric_units: dict[str, str] = Field(default_factory=dict)
    metric_thresholds: dict[str, Any] = Field(default_factory=dict)
    minimum_entity_count: int = 2
    require_metric_directions: bool = False
    require_metric_units: bool = False
    require_metric_thresholds: bool = False
    selected_entity_column: str | None = None
    entity_evidence_available_column: str | None = None
    sensitive_context_policy: str | None = None
    require_sensitive_context_policy: bool = False
    focus_categories: list[str] = Field(default_factory=list)
    focus_bins: list[str] = Field(default_factory=list)
    category_order: list[str] = Field(default_factory=list)
    expected_categories: list[str] = Field(default_factory=list)
    expected_groups: list[str] = Field(default_factory=list)
    bin_order: list[str] = Field(default_factory=list)
    expected_bins: list[str] = Field(default_factory=list)
    numeric_threshold: int | float | None = None
    threshold_direction: str | None = None
    sort_by: str | None = None
    sort_direction: str | None = None
    flag_name_column: str | None = None
    flag_value_column: str | None = None
    threshold_column: str | None = None
    triggered_column: str | None = None
    severity_column: str | None = None
    description_column: str | None = None
    recommended_action_column: str | None = None
    support_category_column: str | None = None
    severity_order: list[str] = Field(default_factory=list)
    flag_order: list[str] = Field(default_factory=list)
    max_flags: int | None = None
    secondary_metric_columns: list[str] = Field(default_factory=list)
    flag_columns: list[str] = Field(default_factory=list)
    action_columns: list[str] = Field(default_factory=list)
    label_columns: list[str] = Field(default_factory=list)
    evidence_columns: list[str] = Field(default_factory=list)
    evidence_dataset_roles: dict[str, str] = Field(default_factory=dict)
    action_source: Literal[
        "candidate_action_columns",
        "versioned_registry_rules",
    ] | None = None
    action_rule_set_id: str | None = None
    action_rule_version: str | None = Field(
        default=None,
        pattern=r"^\d+\.\d+\.\d+$",
    )
    action_evidence_contract: list[ActionEvidenceConfig] = Field(
        default_factory=list
    )
    action_derived_evidence: list[ActionDerivedEvidenceConfig] = Field(
        default_factory=list
    )
    action_conflict_rules: list[ActionConflictRuleConfig] = Field(
        default_factory=list
    )
    action_rules: list[ActionRuleConfig] = Field(default_factory=list)
    priority_column: str | None = None
    owner_column: str | None = None
    time_horizon_column: str | None = None
    trigger_columns: list[str] = Field(default_factory=list)
    max_actions: int | None = Field(default=None, ge=1)
    provenance_required_fields: list[ActionProvenanceField] = Field(
        default_factory=list
    )
    require_complete_action_provenance: bool = True
    unsupported_action_behavior: Literal[
        "fail_validation",
        "emit_unsupported_actions",
    ] = "emit_unsupported_actions"
    sensitive_action_policy: Literal["exclude_sensitive_triggers"] | None = None
    require_sensitive_action_policy: bool = False
    max_points: int | None = None
    top_k: int | None = None
    bottom_k: int | None = None

    @model_validator(mode="after")
    def validate_trend_comparison_contract(self) -> "AISummaryConfig":
        if self.summary_type != "trend_comparison":
            return self

        required = {
            "group_column": self.group_column,
            "time_column": self.time_column,
            "metric_column": self.metric_column,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise ValueError(
                "trend_comparison requires " + ", ".join(missing)
            )

        if self.dynamic_comparison_groups:
            if self.target_group is not None or self.comparison_groups:
                raise ValueError(
                    "dynamic trend_comparison must not define target_group "
                    "or comparison_groups"
                )
            if self.minimum_entity_count < 2:
                raise ValueError(
                    "dynamic trend_comparison requires minimum_entity_count >= 2"
                )
            if not self.comparison_alignment_columns:
                raise ValueError(
                    "dynamic trend_comparison requires "
                    "comparison_alignment_columns"
                )
            if self.divergence_threshold is None:
                raise ValueError(
                    "dynamic trend_comparison requires divergence_threshold"
                )
            if self.time_column not in self.comparison_alignment_columns:
                raise ValueError(
                    "comparison_alignment_columns must include time_column"
                )
            if len(self.comparison_alignment_columns) != len(
                set(self.comparison_alignment_columns)
            ):
                raise ValueError(
                    "comparison_alignment_columns must be unique"
                )
        elif not self.target_group:
            raise ValueError(
                "static trend_comparison requires target_group"
            )

        return self

    @model_validator(mode="after")
    def validate_group_comparison_contract(self) -> "AISummaryConfig":
        if self.summary_type != "group_comparison":
            return self

        if not self.group_column and not self.group_key_columns:
            raise ValueError(
                "group_comparison requires group_column or group_key_columns"
            )
        if not self.metric_column:
            raise ValueError("group_comparison requires metric_column")
        if not self.count_column:
            raise ValueError("group_comparison requires count_column")

        if self.group_key_columns:
            if len(self.group_key_columns) != len(set(self.group_key_columns)):
                raise ValueError("group_key_columns must be unique")
            if len(self.group_key_columns) < 2:
                raise ValueError(
                    "composite group_comparison requires at least two "
                    "group_key_columns"
                )
            if (
                self.group_column
                and self.group_column not in self.group_key_columns
            ):
                raise ValueError(
                    "group_key_columns must include group_column when "
                    "group_column is configured"
                )
            if (
                self.series_column
                and self.series_column not in self.group_key_columns
            ):
                raise ValueError(
                    "group_key_columns must include series_column when "
                    "series_column is configured"
                )

        return self

    @model_validator(mode="after")
    def validate_trend_series_contract(self) -> "AISummaryConfig":
        if self.summary_type != "trend_series":
            return self

        if not self.time_column:
            raise ValueError("trend_series requires time_column")
        if not self.metric_column:
            raise ValueError("trend_series requires metric_column")
        if len(self.secondary_metric_columns) != len(
            set(self.secondary_metric_columns)
        ):
            raise ValueError("secondary_metric_columns must be unique")
        if len(self.flag_columns) != len(set(self.flag_columns)):
            raise ValueError("flag_columns must be unique")
        if len(self.label_columns) != len(set(self.label_columns)):
            raise ValueError("label_columns must be unique")
        if any(
            not label.strip() or not role.strip()
            for label, role in self.evidence_dataset_roles.items()
        ):
            raise ValueError(
                "evidence_dataset_roles keys and values must be non-empty"
            )

        return self

    @model_validator(mode="after")
    def validate_correlation_evidence_contract(self) -> "AISummaryConfig":
        if self.summary_type != "correlation_evidence":
            return self

        if not self.x_column:
            raise ValueError("correlation_evidence requires x_column")
        if not self.y_column:
            raise ValueError("correlation_evidence requires y_column")
        if len(self.label_columns) != len(set(self.label_columns)):
            raise ValueError("label_columns must be unique")
        if len(self.sensitive_columns) != len(set(self.sensitive_columns)):
            raise ValueError("sensitive_columns must be unique")
        if self.require_sensitive_context_policy and not self.sensitive_context_policy:
            raise ValueError(
                "sensitive_context_policy is required when "
                "require_sensitive_context_policy is true"
            )

        return self

    @model_validator(mode="after")
    def validate_action_synthesis_parse_contract(self) -> "AISummaryConfig":
        """
        Parse-time validation only.

        This checks contract shape and internal references. Runtime dataset
        presence, values, rule matching, provenance construction, conflicts,
        missing evidence and unsupported-actions behavior belong to the
        action_synthesis summarizer.
        """
        if self.summary_type != "action_synthesis":
            return self

        if len(self.evidence_columns) != len(set(self.evidence_columns)):
            raise ValueError("evidence_columns must be unique")
        if len(self.trigger_columns) != len(set(self.trigger_columns)):
            raise ValueError("trigger_columns must be unique")

        evidence_contract_by_column = {
            item.column: item for item in self.action_evidence_contract
        }
        if len(evidence_contract_by_column) != len(self.action_evidence_contract):
            raise ValueError("action_evidence_contract columns must be unique")

        declared_evidence = set(self.evidence_columns)
        declared_evidence.update(evidence_contract_by_column)
        if (
            self.evidence_columns
            and self.action_evidence_contract
            and set(self.evidence_columns) != set(evidence_contract_by_column)
        ):
            raise ValueError(
                "evidence_columns must match action_evidence_contract columns"
            )
        if any(
            not label.strip() or not role.strip()
            for label, role in self.evidence_dataset_roles.items()
        ):
            raise ValueError(
                "evidence_dataset_roles keys and values must be non-empty"
            )
        derived_by_id = {
            item.evidence_id: item for item in self.action_derived_evidence
        }
        if len(derived_by_id) != len(self.action_derived_evidence):
            raise ValueError("action_derived_evidence IDs must be unique")
        if declared_evidence.intersection(derived_by_id):
            raise ValueError(
                "derived evidence IDs must not duplicate raw evidence columns"
            )

        for item in self.action_derived_evidence:
            if item.numerator_column not in declared_evidence:
                raise ValueError(
                    f"unknown derived numerator {item.numerator_column}"
                )
            if item.denominator_column not in declared_evidence:
                raise ValueError(
                    f"unknown derived denominator {item.denominator_column}"
                )

        for column, item in evidence_contract_by_column.items():
            if (
                item.availability_column
                and item.availability_column not in declared_evidence
            ):
                raise ValueError(
                    f"availability column {item.availability_column} for "
                    f"{column} is not declared"
                )

        if (
            self.require_sensitive_action_policy
            and not self.sensitive_action_policy
        ):
            raise ValueError(
                "sensitive_action_policy is required for action_synthesis"
            )
        if any(item.sensitive for item in self.action_evidence_contract):
            if self.sensitive_action_policy != "exclude_sensitive_triggers":
                raise ValueError(
                    "sensitive action evidence requires "
                    "sensitive_action_policy=exclude_sensitive_triggers"
                )

        if self.action_source == "candidate_action_columns":
            if not self.action_columns:
                raise ValueError(
                    "candidate_action_columns source requires action_columns"
                )
        elif self.action_source == "versioned_registry_rules":
            if not self.action_rule_set_id:
                raise ValueError(
                    "versioned_registry_rules requires action_rule_set_id"
                )
            if not self.action_rule_version:
                raise ValueError(
                    "versioned_registry_rules requires action_rule_version"
                )
            if not self.action_rules:
                raise ValueError(
                    "versioned_registry_rules requires non-empty action_rules"
                )

        if self.require_complete_action_provenance and self.action_source:
            missing_global_provenance = (
                REQUIRED_ACTION_PROVENANCE_FIELDS.difference(
                    self.provenance_required_fields
                )
            )
            if missing_global_provenance:
                raise ValueError(
                    "provenance_required_fields is missing mandatory fields: "
                    + ", ".join(sorted(missing_global_provenance))
                )

        rule_ids = [rule.rule_id for rule in self.action_rules]
        if len(rule_ids) != len(set(rule_ids)):
            raise ValueError("action rule IDs must be unique")
        conflict_ids = [
            conflict.conflict_id for conflict in self.action_conflict_rules
        ]
        if len(conflict_ids) != len(set(conflict_ids)):
            raise ValueError("action conflict IDs must be unique")

        known_evidence = declared_evidence.union(derived_by_id)
        availability_by_column = {
            column: item.availability_column
            for column, item in evidence_contract_by_column.items()
            if item.availability_column
        }

        def validate_trigger(
            trigger: ActionRuleTrigger,
            context: str,
            *,
            enforce_action_trigger_policy: bool,
        ) -> None:
            all_evidence_ids = {condition.evidence_id for condition in trigger.all}
            for condition in [*trigger.all, *trigger.any]:
                if condition.evidence_id not in known_evidence:
                    raise ValueError(
                        f"{context} references unknown evidence "
                        f"{condition.evidence_id}"
                    )
                if (
                    condition.compare_to_evidence_id
                    and condition.compare_to_evidence_id not in known_evidence
                ):
                    raise ValueError(
                        f"{context} references unknown comparison evidence "
                        f"{condition.compare_to_evidence_id}"
                    )
                evidence_config = evidence_contract_by_column.get(
                    condition.evidence_id
                )
                if (
                    enforce_action_trigger_policy
                    and
                    evidence_config
                    and not evidence_config.allowed_as_trigger
                    and condition.evidence_id
                    not in set(availability_by_column.values())
                ):
                    raise ValueError(
                        f"{context} uses disallowed trigger evidence "
                        f"{condition.evidence_id}"
                    )
                availability_column = availability_by_column.get(
                    condition.evidence_id
                )
                if (
                    availability_column
                    and availability_column not in all_evidence_ids
                ):
                    raise ValueError(
                        f"{context} requires availability guard "
                        f"{availability_column}"
                    )

        for rule in self.action_rules:
            validate_trigger(
                rule.trigger,
                f"rule {rule.rule_id}",
                enforce_action_trigger_policy=True,
            )
            if self.require_complete_action_provenance:
                required_for_rule = REQUIRED_ACTION_PROVENANCE_FIELDS.union(
                    self.provenance_required_fields
                )
                missing = required_for_rule.difference(rule.provenance_requirements)
                if missing:
                    raise ValueError(
                        f"rule {rule.rule_id} is missing global provenance "
                        f"requirements: {', '.join(sorted(missing))}"
                    )

        for conflict in self.action_conflict_rules:
            validate_trigger(
                conflict.when,
                f"conflict {conflict.conflict_id}",
                enforce_action_trigger_policy=False,
            )

        if self.trigger_columns:
            unknown_trigger_columns = set(self.trigger_columns).difference(
                declared_evidence
            )
            if unknown_trigger_columns:
                raise ValueError(
                    "trigger_columns contains undeclared evidence: "
                    + ", ".join(sorted(unknown_trigger_columns))
                )

        return self


class ConfidenceInput(BaseModel):
    """
    Data quality signal from Node (from capabilityValidator output).
    Python uses this to frame explanation caveats but does NOT echo it raw 
    Python derives its own confidence.based_on[] list from this + dataset stats.
    """
    level:  str           # "HIGH" | "MEDIUM" | "LOW"
    reason: str


class ExplainRequest(BaseModel):
    """
    Full enriched request payload from Node.js proxy.
    Node reads taskRegistry and injects explanation_strategy, target_audience,
    visualization_config, analysis_context before forwarding here.
    """
    task_id:              str
    execution_id:         str
    task_name:            str | None = None
    actionable_question:  str | None = None
    ai_prompt_hint:       str | None = None
    explanation_strategy: str                    # "trend"|"comparison"|"risk"|...
    target_audience:      list[str]              # ["student"]|["instructor","academic_advisor"]
    visualization_config: VisualizationConfig | None = None
    analysis_context:     AnalysisContext | None = None

    # datasets: named dict from normalizeAnalyticsResult() in Node
    # { "score_over_time": [{week_due:2, avg_score:74.5}, ...] }
    datasets: dict[str, list[dict]] = Field(default_factory=dict)

    # confidence from capabilityValidator (data quality signal)
    confidence: ConfidenceInput | None = None

    # optional: used by strategies to personalize explanation
    student_context: dict | None = None

    # query_labels echoed from meta (same as datasets keys, ordered)
    query_labels: list[str] = Field(default_factory=list)

    # semantic context: proxy vs native competency detection (injected by Node)
    semantic_context: SemanticContext | None = None

    # optional: registry-driven prompt summarization config
    ai_summary_config: AISummaryConfig | None = None


# 
# RESPONSE SCHEMAS (Python  Node  Frontend)
# 

class EvidenceItem(BaseModel):
    """
    Structured evidence  NOT free-text.
    LLM is instructed to fill these fields explicitly.
    """
    metric:     str           # "avg_score", "click_count", "submission_delay"
    value:      float | int | str
    comparison: Literal[
        "baseline",
        "up_from_previous",
        "down_from_previous",
        "peak",
        "trough",
        "stable"
    ]
    delta:   float | None = None   # signed delta from previous; null for baseline
    context: str | None = None     # "week_due=7", "assessment_type=TMA"


class Insight(BaseModel):
    """
    One insight block  title + description + structured evidence.
    LLM generates 24 insights per response.
    """
    title:       str
    description: str
    severity:    Literal["low", "medium", "high"]
    evidence:    list[EvidenceItem] = Field(default_factory=list)


class Recommendation(BaseModel):
    """
    Actionable recommendation with priority + rationale.
    """
    priority:  Literal["low", "medium", "high"]
    action:    str
    rationale: str


class ConfidenceInfo(BaseModel):
    """
    AI-assessed confidence in the explanation.
    based_on[] is derived by Python logic  NOT by LLM (prevents hallucination).
    """
    level:    str | None                 # "HIGH"|"MEDIUM"|"LOW"|None (if degraded)
    reason:   str | None
    based_on: list[str] = Field(default_factory=list)
    # based_on enum:
    # "sufficient_data"          HIGH confidence, no issues
    # "sparse_data"              below MEDIUM threshold
    # "limited_temporal_range"   < 4 distinct time points
    # "single_student"           only 1 enrollment
    # "missing_fe_fields"        Feature Engineering fields not populated
    # "dataset_mismatch"         task not fully compatible with loaded dataset


class TokenUsage(BaseModel):
    prompt_tokens:     int
    completion_tokens: int
    total_tokens:      int


class AIMeta(BaseModel):
    """
    Execution metadata  returned in response for logging by Node proxy.
    Node reads these values to write to ai_explanation_log table.
    """
    model:       str | None = None    # "gpt-4o-mini-2024-07-18"
    latency_ms:  int
    token_usage: TokenUsage | None = None
    strategy:    str | None = None
    granularity: str | None = None
    cost_usd:    float | None = None  # estimated: tokens  per-token rate


class ExplanationBody(BaseModel):
    """
    The actual explanation content  validated against this schema
    after LLM returns JSON. If LLM output doesn't match  DEGRADED.
    """
    summary:                  str
    insights:                 list[Insight] = Field(default_factory=list)
    educational_implications: list[str] = Field(default_factory=list)
    recommendations:          list[Recommendation] = Field(default_factory=list)
    warnings:                 list[str] = Field(default_factory=list)


class ExplainResponse(BaseModel):
    """
    Complete response from Python  Node  Frontend.
    degraded=True means LLM was unavailable  Frontend renders AIDegradedBanner.
    """
    task_id:              str
    execution_id:         str
    explanation:          ExplanationBody
    confidence:           ConfidenceInfo
    explanation_strategy: str
    explanation_type:     str | None = None
    ai_summary_method:    str
    ai_summary_version:   str
    baseline_available:   bool
    input_summary_type:   str
    ai_summary_method_warning: str | None = None
    full_result_row_count: int | None = None
    included_row_count: int | None = None
    small_result_threshold: int | None = None
    small_result_full_rows_applied: bool | None = None
    dataset_row_breakdown: list[dict] = Field(default_factory=list)
    raw_row_limit: int | None = None
    included_raw_row_count: int | None = None
    baseline_reference_tokens: int | None = None
    task_aware_prompt_tokens: int | None = None
    token_ratio: float | None = None
    token_count_method: str | None = None
    evidence_sections_included: list[str] = Field(default_factory=list)
    evidence_sections_omitted: list[str] = Field(default_factory=list)
    task_output_contract: list[str] = Field(default_factory=list)
    must_keep_keys: list[str] = Field(default_factory=list)
    v3_warnings: list[str] = Field(default_factory=list)
    # Optional deterministic provenance for internal evaluation/logging. It is
    # intentionally additive so existing clients can ignore it unchanged.
    task_aware_evidence_payload: dict | None = None
    safety_flags:         list[str] = Field(default_factory=list)
    degraded:             bool = False
    meta:                 AIMeta
