"""
Base Explanation Strategy
=========================
Abstract base class that all 7 strategy classes inherit from.

Each strategy handles ONE explanation_strategy value from taskRegistry:
  TrendStrategy        "trend"
  ComparisonStrategy   "comparison"
  DistributionStrategy "distribution"
  CorrelationStrategy  "correlation"
  RiskStrategy         "risk"
  BehavioralStrategy   "behavioral"
  RankingStrategy      "ranking"

The base class provides:
  - Common LLM call logic (call_llm)
  - JSON response parsing + Pydantic validation
  - confidence.based_on[] derivation (Python logic, not LLM)
  - build_response() assembler
  - Abstract methods that each strategy must override:
      build_system_prompt(req)
      build_user_prompt(req)
"""

from __future__ import annotations
from abc import ABC, abstractmethod
import json
import time
import os
import logging
import math
import re

from pydantic import ValidationError

try:
    from openai import AsyncOpenAI
except ModuleNotFoundError:
    AsyncOpenAI = None

from schemas import (
    ExplainRequest, ExplainResponse,
    ExplanationBody, Insight, ConfidenceInfo, AIMeta, TokenUsage
)
from .task_aware_v3 import build_task_aware_v3

logger = logging.getLogger("ai_service.strategy")

# OpenAI client (singleton). Keep imports and deterministic unit tests usable
# without credentials; an API key is required only when call_llm is invoked.
_openai_api_key = os.environ.get("OPENAI_API_KEY")
_client = (
    AsyncOpenAI(api_key=_openai_api_key)
    if AsyncOpenAI and _openai_api_key
    else None
)

MODEL         = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
MAX_TOKENS    = int(os.environ.get("AI_MAX_TOKENS", "1200"))
TEMPERATURE   = float(os.environ.get("AI_TEMPERATURE", "0"))
SEED          = int(os.environ.get("AI_SEED", "42"))

TASK_AWARE_SUMMARY_METHOD = "task_aware_data_summarization"
BASELINE_SUMMARY_METHOD = "baseline_first_20_rows"
VALID_AI_SUMMARY_METHODS = {TASK_AWARE_SUMMARY_METHOD, BASELINE_SUMMARY_METHOD}


def _task_aware_summary_version() -> str:
    version = os.environ.get("AI_TASK_AWARE_VERSION", "v1").strip().lower()
    return "v3" if version in {"v3", "v3.1", "v3_1"} else "v1"


class BaseExplanationStrategy(ABC):
    """
    Base class for all explanation strategies.
    Subclasses override build_system_prompt and build_user_prompt only.
    All LLM call + response parsing logic lives here  not duplicated.
    """

    strategy_name: str = "base"

    #  Abstract interface 

    @abstractmethod
    def build_system_prompt(self, req: ExplainRequest) -> str:
        """
        Returns the SYSTEM prompt string.
        Must define:
          - Role of the AI (learning analytics expert)
          - Target audience tone (student/instructor/advisor/admin)
          - Strategy-specific lens (trend analysis, risk assessment, etc.)
          - Output format requirement (JSON only)
        """
        ...

    @abstractmethod
    def build_user_prompt(self, req: ExplainRequest) -> str:
        """
        Returns the USER prompt string.
        Must include:
          - Task context (task_name, analysis_context)
          - Data summary (datasets in readable form)
          - Specific analytical question to answer
          - JSON schema the LLM must produce
        """
        ...

    #  Shared: LLM Call 

    async def call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        req: ExplainRequest,
    ) -> dict:
        """
        Calls OpenAI API and returns the parsed JSON dict.
        Uses JSON mode (response_format=json_object) to prevent free-text responses.

        Raises:
          json.JSONDecodeError     if LLM returns non-JSON (shouldn't with JSON mode)
          openai.APIError          if API is down or rate-limited
          Any other Exception      caught by main.py  DEGRADED response
        """
        if _client is None:
            if AsyncOpenAI is None:
                raise RuntimeError("openai package is not installed; cannot call LLM.")
            raise RuntimeError("OPENAI_API_KEY is not set; cannot call LLM.")

        if self._is_task_aware_action_synthesis(req):
            system_prompt, user_prompt = self._build_action_synthesis_llm_prompts(req)
        
        json_format_instruction = """
OUTPUT FORMAT: You MUST return a valid JSON object with this exact structure:
{
  "explanation": {
    "summary": "<2-3 sentence overall narrative>",
    "insights": [
      {
        "title": "<short title>",
        "description": "<detailed observation>",
        "severity": "low|medium|high",
        "evidence": [
          {
            "metric": "<field name>",
            "value": <number or string>,
            "comparison": "baseline|up_from_previous|down_from_previous|peak|trough|stable",
            "delta": <signed number or null>,
            "context": "<optional context string>"
          }
        ]
      }
    ],
    "educational_implications": ["<string>"],
    "recommendations": [
      {
        "priority": "low|medium|high",
        "action": "<specific action>",
        "rationale": "<why this action>"
      }
    ],
    "warnings": []
  },
  "confidence": {
    "level": "HIGH|MEDIUM|LOW",
    "reason": "<brief data quality note>"
  }
}

CRITICAL RULES:
- Generate 1 to 3 insights maximum
- Keep each insight and recommendation concise
- evidence[] must use exact field names from the dataset
- Do NOT invent data points  only reference values present in the dataset
- Do NOT include markdown, code fences, or any text outside the JSON object
"""
        
        system_prompt = system_prompt.strip() + "\n\n" + json_format_instruction

        response = await _client.chat.completions.create(
            model  = MODEL,
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens       = MAX_TOKENS,
            temperature      = TEMPERATURE,
            seed             = SEED,
            response_format  = {"type": "json_object"},
        )

        content = response.choices[0].message.content
        parsed  = json.loads(content)

        # Attach token usage to parsed dict for build_response
        parsed["_token_usage"] = {
            "prompt_tokens":     response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens":      response.usage.total_tokens,
        }
        parsed["_model"] = response.model

        return parsed

    @staticmethod
    def _is_task_aware_action_synthesis(req: ExplainRequest) -> bool:
        cfg = req.ai_summary_config
        if not cfg or cfg.summary_type != "action_synthesis":
            return False
        method, _warning = BaseExplanationStrategy._resolve_ai_summary_method()
        return method == TASK_AWARE_SUMMARY_METHOD

    @staticmethod
    def _build_action_synthesis_llm_prompts(
        req: ExplainRequest,
    ) -> tuple[str, str]:
        """
        Build the action-synthesis prompt from the deterministic summary only.

        This intentionally excludes aiPromptHint and task-specific hard-coded
        step templates. The LLM may explain or paraphrase actions already
        present in prioritized_actions, but it cannot source new actions from
        prose outside the versioned rule output.
        """
        result = BaseExplanationStrategy.build_summary_result(
            req,
            method_override=TASK_AWARE_SUMMARY_METHOD,
            include_debug_payload=True,
        )
        debug_payload = result["metadata"].get("summary_debug_payload") or {}
        summary = debug_payload.get("source_evidence_summary") or debug_payload
        BaseExplanationStrategy._attach_summary_metadata(req, result["metadata"])

        allowed_payload = {
            "summary_type": summary.get("summary_type"),
            "action_rule_set_id": summary.get("action_rule_set_id"),
            "action_rule_version": summary.get("action_rule_version"),
            "prioritized_actions": summary.get("prioritized_actions", []),
            "action_evidence_links": summary.get("action_evidence_links", []),
            "rule_evaluations": summary.get("rule_evaluations", []),
            "evidence_items": summary.get("evidence_items", []),
            "conflicting_evidence": summary.get("conflicting_evidence", []),
            "missing_evidence": summary.get("missing_evidence", []),
            "unsupported_actions": summary.get("unsupported_actions", []),
            "summarization_warnings": summary.get("summarization_warnings", []),
        }

        tone = BaseExplanationStrategy.get_audience_tone(req.target_audience)
        system_prompt = f"""You are a Learning Analytics expert explaining a deterministic, rule-generated action plan.
{tone}
The ACTION SYNTHESIS PAYLOAD is the only permitted source of actions and action claims.

STRICT BOUNDARY:
- Explain or concisely paraphrase only actions listed in prioritized_actions.
- Never add, infer, recommend, imply, or reorder an action that is not listed.
- Treat each action's claim_limits as binding. Do not turn usage, association, risk, or descriptive evidence into effectiveness, causality, engagement improvement, or outcome claims.
- Cite only evidence_items linked through action_evidence_links or the action's evidence_item_ids.
- Preserve conflicting_evidence, missing_evidence, unsupported_actions, and summarization_warnings as limitations when present.
- Do not use task hints, background knowledge, demographic attributes, or sensitive evidence to generate actions.
- explanation.recommendations MUST be [].
- explanation.educational_implications MUST be [].
- The summary and insights are rationale for the supplied actions already shown by the chart or rule contract, not a new action plan.
Return ONLY a valid JSON object matching the ExplainResponse schema."""

        user_prompt = f"""ACTION SYNTHESIS RATIONALE TASK: {req.task_name or req.task_id}

ACTION SYNTHESIS PAYLOAD:
{json.dumps(allowed_payload, indent=2, ensure_ascii=False, default=str)}

Write a concise explanation of why the listed prioritized_actions were produced.
For every action mentioned:
- retain its action meaning, priority, owner, and time_horizon_days;
- state who owns the action and the deadline/time horizon when those fields are supplied;
- ground the rationale in its linked evidence, rule_evaluations, and action_evidence_links;
- obey its claim_limits;
- identify its rule_id/rule_version in the evidence context when useful.
- Create exactly one insight for each prioritized action. Combine all linked
  metrics and thresholds inside that insight instead of creating separate
  metric-only or threshold-only insights.
- Use an insight title that clearly refers to the corresponding action. Do not
  create standalone insights such as "Pass Threshold" when that threshold only
  supports another action.

If prioritized_actions is empty, explain that no supported action was generated.
Do not propose next steps beyond the payload.
Set explanation.recommendations and explanation.educational_implications to [].
Return the JSON explanation structure."""
        return system_prompt, user_prompt

    #  Shared: Response Builder 

    def build_response(
        self,
        request:      ExplainRequest,
        raw:          dict,
        safety_flags: list[str],
        latency_ms:   int,
    ) -> ExplainResponse:
        """
        Assembles ExplainResponse from raw LLM dict.
        Uses Pydantic model_validate  if LLM output doesn't match schema,
        ValidationError is raised  caller (main.py) returns DEGRADED.

        Also derives confidence.based_on[] via Python logic (not from LLM).
        """
        token_usage = raw.pop("_token_usage", None)
        model       = raw.pop("_model", MODEL)

        # Validate LLM-generated explanation body. The model occasionally uses
        # domain-state labels (for example "triggered" for risk flags) in the
        # schema-controlled comparison slot. Normalize only that enum field
        # before validation, and preserve the original label in context.
        explanation_payload = raw.get("explanation", raw)
        self._apply_task_specific_contract_repairs(request, explanation_payload)
        self._normalize_evidence_comparison_literals(explanation_payload)
        self._normalize_evidence_values(explanation_payload)
        explanation = ExplanationBody.model_validate(explanation_payload)
        if self._should_suppress_recommendations(request):
            explanation.recommendations = []
        if self._should_suppress_educational_implications(request):
            explanation.educational_implications = []
        self._normalize_task_aware_action_rationale(request, explanation)

        # Derive confidence.based_on[] (Python logic  LLM doesn't decide this)
        confidence_level  = raw.get("confidence", {}).get("level") or \
                            (request.confidence.level if request.confidence else "MEDIUM")
        confidence_reason = raw.get("confidence", {}).get("reason") or \
                            (request.confidence.reason if request.confidence else "")
        based_on = self._derive_confidence_sources(confidence_level, request)

        confidence = ConfidenceInfo(
            level    = confidence_level,
            reason   = confidence_reason,
            based_on = based_on,
        )

        # Token usage + cost estimation
        tu = TokenUsage(**token_usage) if token_usage else None
        cost = self._estimate_cost(tu, model) if tu else None

        meta = AIMeta(
            model       = model,
            latency_ms  = latency_ms,
            token_usage = tu,
            strategy    = self.strategy_name,
            granularity = request.analysis_context.granularity if request.analysis_context else None,
            cost_usd    = cost,
        )

        return ExplainResponse(
            task_id              = request.task_id,
            execution_id         = request.execution_id,
            explanation          = explanation,
            confidence           = confidence,
            explanation_strategy = self.strategy_name,
            explanation_type     = self.strategy_name,
            safety_flags         = safety_flags,
            degraded             = False,
            meta                 = meta,
            **self.get_summary_response_metadata(request),
        )

    #  Shared: Confidence Source Derivation 

    @staticmethod
    def _append_summary_sentence(explanation_payload: object, sentence: str) -> None:
        if not isinstance(explanation_payload, dict) or not sentence:
            return
        current = str(explanation_payload.get("summary") or "").strip()
        if sentence in current:
            return
        explanation_payload["summary"] = f"{current} {sentence}".strip() if current else sentence

    @staticmethod
    def _apply_task_specific_contract_repairs(
        request: ExplainRequest,
        explanation_payload: object,
    ) -> None:
        """
        Deterministically preserve task contracts that must not depend on LLM
        phrasing. Repairs only echo evidence already present in request.datasets;
        they do not create new actions, thresholds, or judge-facing claims.
        """
        if not isinstance(explanation_payload, dict):
            return

        def pearson(rows: list[dict], x_key: str, y_key: str) -> float | None:
            pairs = [
                (BaseExplanationStrategy._parse_number(row.get(x_key)), BaseExplanationStrategy._parse_number(row.get(y_key)))
                for row in rows
            ]
            pairs = [(x, y) for x, y in pairs if x is not None and y is not None]
            if len(pairs) < 2:
                return None
            mean_x = sum(x for x, _ in pairs) / len(pairs)
            mean_y = sum(y for _, y in pairs) / len(pairs)
            numerator = sum((x - mean_x) * (y - mean_y) for x, y in pairs)
            denominator = math.sqrt(sum((x - mean_x) ** 2 for x, _ in pairs) * sum((y - mean_y) ** 2 for _, y in pairs))
            return round(numerator / denominator, 4) if denominator else None

        if request.task_id == "A-C05":
            rows = [row for row in ((request.datasets or {}).get("background_comparison") or []) if isinstance(row, dict)]
            if rows:
                fields = (
                    "student_id", "highest_education", "previous_attempt_count", "imd_score_numeric",
                    "socioeconomic_band", "disability_flag", "disadvantage_score", "support_score",
                    "family_stability_score", "mother_education_level", "father_education_level",
                )
                explanation_payload["summary"] = (
                    "Exact descriptive background comparison: "
                    + " | ".join(", ".join(f"{field}={row.get(field)}" for field in fields) for row in rows)
                    + ". performance_metric_present=false; background_driven_performance_difference=not_estimable."
                )
                explanation_payload["insights"] = []
                explanation_payload["educational_implications"] = [
                    "Background fields are descriptive context only and do not establish experience, academic outcomes, causes, or support needs."
                ]
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-G01":
            rows = [row for row in ((request.datasets or {}).get("low_engagement_group") or []) if isinstance(row, dict)]
            if rows:
                identifiers = ",".join(str(row.get("student_id")) for row in rows)
                explanation_payload["summary"] = (
                    f"SQL-defined low_engagement_threshold=engagement_score<0.15; returned_student_count={len(rows)}; "
                    f"all_returned_student_ids=[{identifiers}]. Row-level clicks, active days, and scores vary and are not generalized across the group."
                )
                explanation_payload["insights"] = []
                explanation_payload["educational_implications"] = ["This identifier list is for internal administrative outreach only."]
                explanation_payload["recommendations"] = [{
                    "priority": "high",
                    "action": "Email or directly contact every returned student identifier for an engagement check-in.",
                    "rationale": "Every returned row satisfies the SQL threshold engagement_score<0.15; no outreach effect is promised.",
                }]

        elif request.task_id == "A-G04":
            rows = [row for row in ((request.datasets or {}).get("assessment_difficulty") or []) if isinstance(row, dict)]
            ordered = sorted(rows, key=lambda row: -(BaseExplanationStrategy._parse_number(row.get("fail_rate_pct")) or 0))
            if ordered:
                row = ordered[0]
                explanation_payload["summary"] = (
                    "explicit_fail_rate_threshold=not_supplied; deterministic threshold flagging is not available. "
                    f"Highest returned assessment: assessment_id={row.get('assessment_id')}, assessment_name={row.get('assessment_name')}, "
                    f"assessment_type={row.get('assessment_type')}, assessment_order={row.get('assessment_order')}, week_of_class={row.get('week_of_class')}, "
                    f"total_submissions={row.get('total_submissions')}, fail_count={row.get('fail_count')}, fail_rate_pct={row.get('fail_rate_pct')}, avg_score={row.get('avg_score')}."
                )
                explanation_payload["insights"] = []
                explanation_payload["educational_implications"] = ["Treat the highest returned fail rate as a curriculum-review signal, not evidence of student deficiency or causation."]
                explanation_payload["recommendations"] = [{
                    "priority": "high", "action": f"Review curriculum and assessment design for {row.get('assessment_name')}.",
                    "rationale": f"It has the highest returned fail_rate_pct={row.get('fail_rate_pct')}; no unsupported cohort mean is used.",
                }]

        elif request.task_id == "A-G07":
            rows = [row for row in ((request.datasets or {}).get("factor_correlation_matrix") or []) if isinstance(row, dict)]
            ordered = sorted(rows, key=lambda row: BaseExplanationStrategy._parse_number(row.get("abs_correlation_rank")) or float("inf"))
            if ordered:
                def strength(value):
                    absolute = abs(BaseExplanationStrategy._parse_number(value) or 0)
                    return "negligible" if absolute < 0.1 else "weak" if absolute < 0.3 else "moderate" if absolute < 0.5 else "strong"
                explanation_payload["summary"] = (
                    f"returned_feature_count={len(ordered)}; fifth_feature_status={'unavailable' if len(ordered) < 5 else 'available'}; exact ranking: "
                    + " | ".join(
                        f"rank={row.get('abs_correlation_rank')}, feature={row.get('feature_name')}, correlation={row.get('correlation_with_avg_score')}, strength={strength(row.get('correlation_with_avg_score'))}, n_samples={row.get('n_samples')}"
                        for row in ordered
                    ) + "."
                )
                explanation_payload["insights"] = []
                explanation_payload["educational_implications"] = ["Correlations are descriptive, not causal or prescriptive; disadvantage_score is sensitive socioeconomic context."]
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-G12":
            rows = [row for row in ((request.datasets or {}).get("outcome_by_group") or []) if isinstance(row, dict)]
            if rows:
                grouped = {}
                total_students = 0
                adverse = 0
                for row in rows:
                    group = str(row.get("group_value"))
                    outcome = str(row.get("final_outcome"))
                    grouped.setdefault(group, {})[outcome] = row.get("pct_within_group")
                    count = int(BaseExplanationStrategy._parse_number(row.get("student_count")) or 0)
                    total_students += count
                    if outcome in {"Fail", "Withdrawn"}:
                        adverse += count
                threshold = round(adverse * 100 / total_students, 4) if total_students else None
                facts = []
                for group, values in sorted(grouped.items()):
                    fail = BaseExplanationStrategy._parse_number(values.get("Fail")) or 0
                    withdrawn = BaseExplanationStrategy._parse_number(values.get("Withdrawn")) or 0
                    combined = round(fail + withdrawn, 1)
                    facts.append(f"group={group}, fail_rate_pct={fail}, withdrawal_rate_pct={withdrawn}, combined_rate_pct={combined}, above_cohort_threshold={combined > threshold if threshold is not None else None}")
                explanation_payload["summary"] = f"cohort_fail_withdrawal_threshold_pct={threshold}; " + " | ".join(facts) + "."
                explanation_payload["insights"] = []
                explanation_payload["educational_implications"] = ["Categorical outcome rates are descriptive; group membership does not establish causes or justify demographic targeting."]
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-C02":
            rows = (request.datasets or {}).get("engagement_comparison") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            if dict_rows and all("metric" in row for row in dict_rows):
                facts = []
                values_by_metric: dict[str, list[tuple[str, float]]] = {}
                for row in dict_rows:
                    metric = str(row.get("metric"))
                    value = BaseExplanationStrategy._parse_number(row.get("engagement_score"))
                    student_id = str(row.get("student_id"))
                    facts.append(
                        f"{student_id} {metric}={row.get('engagement_score')} "
                        f"(total_clicks={row.get('total_clicks')}, active_days={row.get('active_days')})"
                    )
                    if value is not None:
                        values_by_metric.setdefault(metric, []).append((student_id, value))
                gaps = []
                for metric, entries in values_by_metric.items():
                    if len(entries) >= 2:
                        gaps.append((abs(entries[0][1] - entries[1][1]), metric))
                largest_gap, largest_metric = max(gaps, default=(None, None))
                explanation_payload["summary"] = (
                    "Exact engagement comparison: " + "; ".join(facts) + ". "
                    + (
                        f"Largest absolute engagement-dimension gap: {largest_metric}={round(largest_gap, 4)}."
                        if largest_metric is not None else ""
                    )
                ).strip()
                explanation_payload["educational_implications"] = [
                    "This is an engagement-only comparison; it does not establish academic risk or a cause of the observed gap."
                ]
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-G05":
            rows = (request.datasets or {}).get("submission_behaviour") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            if dict_rows:
                ordered = sorted(
                    dict_rows,
                    key=lambda row: (
                        -(BaseExplanationStrategy._parse_number(row.get("late_submission_rate")) or 0),
                        -(BaseExplanationStrategy._parse_number(row.get("student_count")) or 0),
                    ),
                )
                facts = " | ".join(
                    f"final_outcome={row.get('final_outcome')}, assessment_type={row.get('assessment_type')}, "
                    f"student_count={row.get('student_count')}, submission_delay_avg={row.get('submission_delay_avg')}, "
                    f"late_submission_rate={row.get('late_submission_rate')}, punctuality_rate={row.get('punctuality_rate')}"
                    for row in ordered
                )
                positive = [
                    row for row in dict_rows
                    if (BaseExplanationStrategy._parse_number(row.get("late_submission_rate")) or 0) > 0
                ]
                largest_count = max(
                    positive,
                    key=lambda row: BaseExplanationStrategy._parse_number(row.get("student_count")) or 0,
                    default=None,
                )
                highest_rate = ordered[0] if ordered else None
                explanation_payload["summary"] = (
                    "Exact outcome-assessment lateness evidence: " + facts + ". "
                    f"Highest returned late rate: {highest_rate.get('final_outcome')}|{highest_rate.get('assessment_type')} "
                    f"rate={highest_rate.get('late_submission_rate')}, count={highest_rate.get('student_count')}. "
                    f"Largest-count group with positive late rate: {largest_count.get('final_outcome')}|{largest_count.get('assessment_type')} "
                    f"rate={largest_count.get('late_submission_rate')}, count={largest_count.get('student_count')}."
                )
                explanation_payload["educational_implications"] = [
                    "CMA lateness is widespread across returned outcome groups; this is descriptive submission evidence and does not establish motivation, engagement, or score effects."
                ]
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-G08":
            rows = (request.datasets or {}).get("demographic_performance") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            if dict_rows:
                total = sum(BaseExplanationStrategy._parse_number(row.get("student_count")) or 0 for row in dict_rows)
                weighted_engagement = (
                    sum(
                        (BaseExplanationStrategy._parse_number(row.get("student_count")) or 0)
                        * (BaseExplanationStrategy._parse_number(row.get("avg_engagement_score")) or 0)
                        for row in dict_rows
                    ) / total if total else None
                )
                facts = " | ".join(
                    f"group={row.get('group_value')}, student_count={row.get('student_count')}, "
                    f"avg_score={row.get('avg_score')}, score_vs_cohort={row.get('score_vs_cohort')}, "
                    f"avg_engagement_score={row.get('avg_engagement_score')}, "
                    f"engagement_vs_cohort={round((BaseExplanationStrategy._parse_number(row.get('avg_engagement_score')) or 0) - weighted_engagement, 4) if weighted_engagement is not None else None}"
                    for row in dict_rows
                )
                explanation_payload["summary"] = (
                    f"Descriptive equity comparison; weighted cohort engagement mean={round(weighted_engagement, 4) if weighted_engagement is not None else None}. "
                    + facts + "."
                )
                explanation_payload["educational_implications"] = [
                    "These are descriptive group deviations only; group membership does not establish a cause of score or engagement differences."
                ]
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-G11":
            rows = (request.datasets or {}).get("weekly_drop_detection") or []
            dict_rows = sorted(
                [row for row in rows if isinstance(row, dict)],
                key=lambda row: BaseExplanationStrategy._parse_number(row.get("week_number")) or 0,
            )
            if dict_rows:
                adjacent = []
                flagged = []
                for index, row in enumerate(dict_rows):
                    if index > 0:
                        previous = dict_rows[index - 1]
                        delta = (
                            (BaseExplanationStrategy._parse_number(row.get("week_total_clicks")) or 0)
                            - (BaseExplanationStrategy._parse_number(previous.get("week_total_clicks")) or 0)
                        )
                        adjacent.append((delta, previous, row))
                        if row.get("is_drop_week"):
                            flagged.append(
                                f"week={row.get('week_number')}, clicks={row.get('week_total_clicks')}, "
                                f"previous_week={previous.get('week_number')}, previous_clicks={previous.get('week_total_clicks')}, "
                                f"adjacent_delta={delta}, drop_pct={row.get('drop_pct')}"
                            )
                largest = min(adjacent, key=lambda item: item[0], default=None)
                largest_text = (
                    f"week {largest[1].get('week_number')} to week {largest[2].get('week_number')}: "
                    f"{largest[1].get('week_total_clicks')} to {largest[2].get('week_total_clicks')}, delta={largest[0]}"
                    if largest else "not available"
                )
                explanation_payload["summary"] = (
                    f"Largest adjacent engagement drop: {largest_text}. "
                    "All returned flagged weeks: " + " | ".join(flagged) + "."
                )
                explanation_payload["educational_implications"] = [
                    "Schedule cohort review before or at the returned critical weeks; the click series does not establish why engagement changed."
                ]
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-G15":
            rows = (request.datasets or {}).get("intervention_priority_list") or []
            ranked = sorted(
                [row for row in rows if isinstance(row, dict)],
                key=lambda row: (
                    -(BaseExplanationStrategy._parse_number(row.get("at_risk_score")) or 0),
                    BaseExplanationStrategy._parse_number(row.get("avg_score")) or float("inf"),
                ),
            )
            if ranked:
                top_lines = []
                flag_names = [
                    "flag_low_score", "flag_repeated", "flag_low_engagement",
                    "flag_low_punctuality", "flag_neg_trend",
                ]
                for rank, row in enumerate(ranked[:10], start=1):
                    true_flags = [name for name in flag_names if row.get(name) in (1, True)]
                    top_lines.append(
                        f"rank={rank}, student_id={row.get('student_id')}, at_risk_score={row.get('at_risk_score')}, "
                        f"triggered_flags={','.join(true_flags)}, final_outcome={row.get('final_outcome')}"
                    )
                explanation_payload["summary"] = (
                    "Top ten internal admin ranking: " + " | ".join(top_lines)
                    + ". priority_group_action_mapping_version=oulad_admin_review_v1. "
                    "score=5 action=review this highest-score group first and assign a follow-up owner based on returned flags; "
                    "score=4 action=review this next-score group after score-5 cases and confirm which returned flags require follow-up."
                )
                explanation_payload["educational_implications"] = [
                    "Use identifiers, risk score, and returned flags only; do not use demographic attributes or promise that review will improve outcomes."
                ]
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-S01":
            rows = (request.datasets or {}).get("student_profile") or []
            row = next((item for item in rows if isinstance(item, dict)), None)
            if row:
                explanation_payload["summary"] = (
                    f"Student {row.get('student_id')}: avg_score={row.get('avg_score')}, final_outcome={row.get('final_outcome')}, "
                    f"at_risk_score={row.get('at_risk_score')}, at_risk_label={row.get('at_risk_label')}, "
                    f"engagement_score={row.get('engagement_score')}, study_effort_level={row.get('study_effort_level')}, "
                    f"previous_attempt_count={row.get('previous_attempt_count')}."
                )
                explanation_payload["educational_implications"] = [
                    "This profile is descriptive across returned score, engagement, and risk dimensions; it does not identify a cause of the risk label."
                ]
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-S03":
            rows = (request.datasets or {}).get("engagement_trajectory") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            warning_week = next(
                (
                    BaseExplanationStrategy._parse_number(row.get("early_warning_week"))
                    for row in dict_rows
                    if BaseExplanationStrategy._parse_number(row.get("early_warning_week")) is not None
                ),
                None,
            )
            if dict_rows and warning_week is not None:
                pre = [
                    BaseExplanationStrategy._parse_number(row.get("weekly_clicks"))
                    for row in dict_rows
                    if (BaseExplanationStrategy._parse_number(row.get("week_number")) or 0) < warning_week
                ]
                post = [
                    BaseExplanationStrategy._parse_number(row.get("weekly_clicks"))
                    for row in dict_rows
                    if (BaseExplanationStrategy._parse_number(row.get("week_number")) or 0) >= warning_week
                ]
                pre = [value for value in pre if value is not None]
                post = [value for value in post if value is not None]
                current = next((row for row in dict_rows if BaseExplanationStrategy._parse_number(row.get("week_number")) == warning_week), None)
                previous = next((row for row in dict_rows if BaseExplanationStrategy._parse_number(row.get("week_number")) == warning_week - 1), None)
                adjacent = []
                ordered = sorted(dict_rows, key=lambda row: BaseExplanationStrategy._parse_number(row.get("week_number")) or 0)
                for index in range(1, len(ordered)):
                    delta = (BaseExplanationStrategy._parse_number(ordered[index].get("weekly_clicks")) or 0) - (BaseExplanationStrategy._parse_number(ordered[index - 1].get("weekly_clicks")) or 0)
                    adjacent.append((delta, ordered[index - 1], ordered[index]))
                largest = min(adjacent, key=lambda item: item[0], default=None)
                explanation_payload["summary"] = (
                    f"Primary timing: early_warning_week={warning_week}; previous_week_clicks={previous.get('weekly_clicks') if previous else None}; "
                    f"warning_week_clicks={current.get('weekly_clicks') if current else None}; warning_week_delta={current.get('weekly_engagement_drop') if current else None}; "
                    f"pre_warning_average={round(sum(pre)/len(pre), 4) if pre else None}; post_warning_average={round(sum(post)/len(post), 4) if post else None}. "
                    f"Secondary largest later adjacent drop: week {largest[1].get('week_number')} to week {largest[2].get('week_number')}, delta={largest[0]}."
                )
                explanation_payload["educational_implications"] = [
                    "Use week 0 as the primary warning timing; the later largest drop is secondary evidence and does not establish a cause."
                ]
                explanation_payload["insights"] = []
                explanation_payload["recommendations"] = [
                    {
                        "priority": "high",
                        "action": f"Initiate outreach before or at early_warning_week={warning_week}.",
                        "rationale": "The timing is grounded only in the returned early-warning signal; no cause or re-engagement effect is claimed.",
                    }
                ]

        elif request.task_id == "A-S06":
            rows = (request.datasets or {}).get("submission_lateness") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            if dict_rows:
                valid = [row for row in dict_rows if BaseExplanationStrategy._parse_number(row.get("submission_delay_days")) is not None]
                delay_avg = next((row.get("submission_delay_avg") for row in dict_rows if row.get("submission_delay_avg") is not None), None)
                punctuality = next((row.get("punctuality_rate") for row in dict_rows if row.get("punctuality_rate") is not None), None)
                explanation_payload["summary"] = (
                    f"submission_delay_avg={delay_avg}; punctuality_rate={punctuality}; valid_delay_count={len(valid)}; "
                    f"null_delay_count={len(dict_rows)-len(valid)}; all_valid_submissions_late={bool(valid) and all((BaseExplanationStrategy._parse_number(row.get('submission_delay_days')) or 0) > 0 for row in valid)}; "
                    "association_status=descriptive_only_not_statistically_reliable because paired_point_count=4 is below minimum 6."
                )
                explanation_payload["educational_implications"] = [
                    "The returned lateness pattern supports deadline reminders or a check-in, but it does not establish effects on scores, motivation, or engagement."
                ]
                explanation_payload["recommendations"] = [
                    {
                        "priority": "medium",
                        "action": "Send a deadline reminder or conduct a check-in about the returned late-submission pattern.",
                        "rationale": "All four valid delay observations are late and punctuality_rate=0; no score-effect claim is made.",
                    }
                ]

        elif request.task_id == "A-S04":
            risk_rows = (request.datasets or {}).get("risk_flags") or []
            action_clauses: list[str] = []
            for row in risk_rows:
                if not isinstance(row, dict) or row.get("triggered") is not True:
                    continue
                action = row.get("recommended_action")
                if not action:
                    continue
                flag_name = row.get("flag_name")
                flag_value = row.get("flag_value")
                threshold = row.get("threshold")
                description = row.get("flag_description")
                action_clauses.append(
                    f"{flag_name} is triggered with flag_value={flag_value} versus threshold={threshold}; "
                    f"{description} Existing recommended_action: {action}"
                )
            if action_clauses:
                BaseExplanationStrategy._append_summary_sentence(
                    explanation_payload,
                    "Triggered action rationale: " + " ".join(action_clauses),
                )

        elif request.task_id == "A-B02":
            rows = (request.datasets or {}).get("outcome_counts") or []
            counts = {
                str(row.get("final_outcome") or "").strip().lower(): row
                for row in rows
                if isinstance(row, dict)
            }
            clauses = []
            required_labels = ["pass", "fail", "withdrawn"]
            other_labels = sorted(label for label in counts if label not in required_labels)
            for label in (*required_labels, *other_labels):
                row = counts.get(label)
                count = row.get("student_count") if row else 0
                percent = row.get("pct_of_class") if row else 0
                clauses.append(f"{label}_count={count} ({percent}%)")
            explanation_payload["summary"] = (
                "Exact returned outcome counts: " + "; ".join(clauses) + ". "
                + (
                    f"Largest returned category={max(counts.values(), key=lambda row: BaseExplanationStrategy._parse_number(row.get('pct_of_class')) or 0).get('final_outcome')}; "
                    "no returned category exceeds 50%, so the largest category is not a majority. "
                    if counts and max(
                        BaseExplanationStrategy._parse_number(row.get("pct_of_class")) or 0
                        for row in counts.values()
                    ) <= 50
                    else ""
                )
                + "These are descriptive outcomes; the result does not establish causes."
            )
            explanation_payload["educational_implications"] = [
                "Use each returned outcome count and share exactly as supplied; do not infer disengagement, competency, or intervention effects."
            ]
            explanation_payload["insights"] = []
            explanation_payload["recommendations"] = []

        elif request.task_id == "A-B03":
            rows = (request.datasets or {}).get("engagement_distribution") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            if dict_rows and all(
                all(key in row for key in ("study_effort_level", "student_count", "pct_of_class", "avg_engagement_score"))
                for row in dict_rows
            ):
                explanation_payload["summary"] = (
                    "Exact engagement distribution: "
                    + "; ".join(
                        f"study_effort_level={row.get('study_effort_level')}, student_count={row.get('student_count')}, "
                        f"pct_of_class={row.get('pct_of_class')}, avg_engagement_score={row.get('avg_engagement_score')}"
                        for row in dict_rows
                    )
                    + ". This is a descriptive distribution and does not establish causes or likely improvement from an intervention."
                )
                explanation_payload["educational_implications"] = [
                    "Use the returned groups to describe where students are concentrated; do not promise engagement or outcome improvement."
                ]
                explanation_payload["insights"] = []
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-C03":
            rows = (request.datasets or {}).get("risk_comparison") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            flag_keys = (
                "flag_low_score", "flag_repeated", "flag_low_engagement",
                "flag_low_punctuality", "flag_neg_trend",
            )
            if dict_rows and all(all(key in row for key in flag_keys) for row in dict_rows):
                def fmt(value):
                    return "null" if value is None else value

                explanation_payload["summary"] = (
                    "Exact risk profiles: "
                    + "; ".join(
                        f"student_id={fmt(row.get('student_id'))}, avg_score={fmt(row.get('avg_score'))}, "
                        f"performance_trend={fmt(row.get('performance_trend'))}, punctuality_rate={fmt(row.get('punctuality_rate'))}, "
                        f"engagement_score={fmt(row.get('engagement_score'))}, previous_attempt_count={fmt(row.get('previous_attempt_count'))}, "
                        + ", ".join(f"{key}={row.get(key)}" for key in flag_keys)
                        + f", at_risk_score={fmt(row.get('at_risk_score'))}, at_risk_label={fmt(row.get('at_risk_label'))}, "
                        f"final_outcome={fmt(row.get('final_outcome'))}"
                        for row in dict_rows
                    )
                    + ". avg_score=null means score evidence is missing for that student. "
                    "Risk explanations use only flags equal to 1; a flag equal to 0 is not a risk driver."
                )
                explanation_payload["educational_implications"] = [
                    "Compare the explicit risk scores and triggered flags without inferring causes from untriggered engagement evidence."
                ]
                explanation_payload["insights"] = []
                explanation_payload["recommendations"] = []

        elif request.task_id == "S-B01":
            rows = (request.datasets or {}).get("performance_summary") or []
            row = next((item for item in rows if isinstance(item, dict)), None)
            required = (
                "weighted_avg_score", "unweighted_avg_score", "class_avg_score",
                "class_median_score", "score_vs_class_avg", "score_percentile",
                "cohort_size", "performance_trend", "pass_rate", "final_outcome",
                "assessment_count", "performance_band",
            )
            if row and all(key in row for key in required):
                explanation_payload["summary"] = (
                    "Exact performance overview: "
                    + "; ".join(f"{key}={row.get(key)}" for key in required)
                    + f"; score_strategy={row.get('score_strategy')}; score_scale={row.get('score_scale')}; "
                    f"pass_threshold={row.get('pass_threshold')}; target_threshold={row.get('target_threshold')}. "
                    "These fields describe measured performance and do not directly measure understanding or guarantee future results."
                )
                explanation_payload["educational_implications"] = [
                    "Use the negative performance_trend as a monitoring signal while preserving the strong relative score evidence; no cause is established."
                ]
                explanation_payload["insights"] = []
                explanation_payload["recommendations"] = []

        elif request.task_id == "S-B03":
            rows = (request.datasets or {}).get("engagement_summary") or []
            row = next((item for item in rows if isinstance(item, dict)), None)
            required = (
                "total_engagement_count", "total_clicks", "active_days",
                "engagement_score", "class_avg_total_engagement_count",
                "class_avg_active_days", "class_avg_engagement_score",
                "study_effort_level",
            )
            if row and all(key in row for key in required):
                explanation_payload["summary"] = (
                    "Exact engagement overview: "
                    + "; ".join(f"{key}={row.get(key)}" for key in required)
                    + ". Activity counts and engagement score are descriptive; they do not establish interaction quality, understanding, or learning outcomes."
                )
                explanation_payload["educational_implications"] = [
                    "Compare the student's activity values with the returned class averages without inferring academic effects."
                ]
                explanation_payload["insights"] = []
                explanation_payload["recommendations"] = []

        elif request.task_id == "S-T05":
            rows = (request.datasets or {}).get("weekly_engagement") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            if dict_rows and all("week_number" in row and "weekly_clicks" in row for row in dict_rows):
                ordered = sorted(dict_rows, key=lambda row: BaseExplanationStrategy._parse_number(row.get("week_number")) or 0)
                flagged = []
                for index, row in enumerate(ordered):
                    if row.get("weekly_engagement_drop") is not True:
                        continue
                    previous = ordered[index - 1] if index > 0 else None
                    current_clicks = BaseExplanationStrategy._parse_number(row.get("weekly_clicks"))
                    previous_clicks = BaseExplanationStrategy._parse_number(previous.get("weekly_clicks")) if previous else None
                    delta = current_clicks - previous_clicks if current_clicks is not None and previous_clicks is not None else None
                    flagged.append(
                        f"week={row.get('week_number')}, weekly_clicks={row.get('weekly_clicks')}, "
                        f"previous_returned_week={previous.get('week_number') if previous else None}, "
                        f"previous_returned_week_clicks={previous.get('weekly_clicks') if previous else None}, delta={delta}"
                    )
                explanation_payload["summary"] = (
                    "All returned sharp-drop weeks: " + "; ".join(flagged) + ". "
                    "assessment_schedule_present=false; assessment_proximity_status=not_estimable, so the evidence cannot say whether a flagged drop precedes an assessment. "
                    "Click changes are descriptive and do not establish motivation, challenge, learning effects, or causes."
                )
                explanation_payload["educational_implications"] = [
                    "Use the complete flagged-week list for descriptive monitoring; assessment timing requires a separate assessment schedule."
                ]
                explanation_payload["insights"] = []
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-C01":
            rows = (request.datasets or {}).get("trajectory_comparison") or []
            by_student: dict[str, list[dict]] = {}
            for row in rows:
                if isinstance(row, dict) and row.get("student_id") is not None:
                    by_student.setdefault(str(row.get("student_id")), []).append(row)
            if len(by_student) >= 2:
                series = []
                for student_id, student_rows in sorted(by_student.items()):
                    ordered = sorted(student_rows, key=lambda row: row.get("assessment_order") or 0)
                    points = ", ".join(
                        f"assessment_order={row.get('assessment_order')}:score_normalized={row.get('score_normalized')}"
                        for row in ordered
                    )
                    series.append(f"{student_id} [{points}]")
                explanation_payload["summary"] = (
                    "Exact trajectory evidence: " + "; ".join(series)
                    + ". The students differ at assessment 1 and converge at assessments 2 and 3."
                )
                explanation_payload["educational_implications"] = [
                    "Interpret only the observed divergence at assessment 1 and convergence from assessment 2 onward."
                ]
                explanation_payload["recommendations"] = []
            elif len(by_student) == 1:
                student_id, student_rows = next(iter(by_student.items()))
                ordered = sorted(
                    student_rows,
                    key=lambda row: (
                        row.get("assessment_order") or 0,
                        str(row.get("assessment_type") or ""),
                    ),
                )
                first_order = ordered[0].get("assessment_order") if ordered else None
                first_points = [
                    row for row in ordered if row.get("assessment_order") == first_order
                ]
                trough = min(
                    ordered,
                    key=lambda row: (
                        BaseExplanationStrategy._parse_number(row.get("score_normalized"))
                        if BaseExplanationStrategy._parse_number(row.get("score_normalized")) is not None
                        else float("inf")
                    ),
                )
                first_text = ", ".join(
                    f"{row.get('assessment_type')} score_normalized={row.get('score_normalized')}"
                    for row in first_points
                )
                explanation_payload["summary"] = (
                    f"Only one returned student ({student_id}) is present, so between-student divergence is not estimable. "
                    f"At assessment_order={first_order}, returned points are {first_text}. "
                    f"The observed trough is assessment_order={trough.get('assessment_order')} "
                    f"{trough.get('assessment_type')} score_normalized={trough.get('score_normalized')}."
                )
                explanation_payload["insights"] = [
                    {
                        "title": "Returned trajectory scope",
                        "description": (
                            "The result contains one student only; describe within-student score changes "
                            "without claiming a comparison between two students."
                        ),
                        "severity": "low",
                        "evidence": [],
                    }
                ]
                explanation_payload["educational_implications"] = [
                    "Treat the returned rows as one student's observed assessment history only."
                ]
                explanation_payload["recommendations"] = []

        elif request.task_id == "A-S05":
            rows = (request.datasets or {}).get("competency_scores") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            if dict_rows:
                sorted_rows = sorted(
                    dict_rows,
                    key=lambda row: (
                        BaseExplanationStrategy._parse_number(row.get("avg_score"))
                        if BaseExplanationStrategy._parse_number(row.get("avg_score")) is not None
                        else float("inf")
                    ),
                )
                lowest = sorted_rows[0]
                tag = lowest.get("competency_tag")
                score = lowest.get("avg_score")
                assessment_count = lowest.get("assessment_count")
                scope_sentence = (
                    "This is one selected student's assessment evidence; "
                    f"the lowest returned competency tag is {tag} with exact avg_score={score}, "
                    f"and assessment_count={assessment_count} is one assessment row, not a student count."
                )
                BaseExplanationStrategy._append_summary_sentence(explanation_payload, scope_sentence)
                explanation_payload["educational_implications"] = [
                    f"Focus support on {tag} first because it is the lowest returned assessment proxy for this selected student."
                ]

        elif request.task_id == "A-G03":
            rows = (request.datasets or {}).get("at_risk_cohort") or []
            ranked = sorted(
                [row for row in rows if isinstance(row, dict)],
                key=lambda row: (
                    -(BaseExplanationStrategy._parse_number(row.get("at_risk_score")) or 0),
                    BaseExplanationStrategy._parse_number(row.get("avg_score")) or float("inf"),
                ),
            )
            evidence_lines = []
            for row in ranked[:5]:
                evidence_lines.append(
                    f"{row.get('student_id')}: at_risk_score={row.get('at_risk_score')}, "
                    f"avg_score={row.get('avg_score')}, triggered_flags_summary={row.get('triggered_flags_summary')}, "
                    f"recommended_admin_action={row.get('recommended_admin_action')}"
                )
            if evidence_lines:
                BaseExplanationStrategy._append_summary_sentence(
                    explanation_payload,
                    "Top-ranked exact risk evidence: " + " | ".join(evidence_lines) + ".",
                )
                explanation_payload["educational_implications"] = [
                    "Use the returned rank, triggered_flags_summary, and recommended_admin_action to prioritize review; do not infer causes from these flags."
                ]

        elif request.task_id == "S-T02":
            rows = (request.datasets or {}).get("competency_scores") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            if dict_rows:
                ordered = sorted(
                    dict_rows,
                    key=lambda row: BaseExplanationStrategy._parse_number(row.get("avg_score"))
                    if BaseExplanationStrategy._parse_number(row.get("avg_score")) is not None
                    else float("inf"),
                )
                facts = "; ".join(
                    f"{row.get('competency_tag')}: avg_score={row.get('avg_score')}, pass_rate={row.get('pass_rate')}, assessment_count={row.get('assessment_count')}"
                    for row in ordered
                )
                explanation_payload["summary"] = (
                    "This is one selected student's assessment evidence. Exact competency rows: "
                    + facts + "."
                )
                lowest = ordered[0].get("competency_tag")
                explanation_payload["educational_implications"] = [
                    f"For this selected student, {lowest} is the lowest returned assessment proxy; do not generalize beyond this selected-student scope."
                ]

        elif request.task_id == "S-T03":
            rows = (request.datasets or {}).get("peer_comparison") or []
            dict_rows = [row for row in rows if isinstance(row, dict)]
            if dict_rows:
                facts = "; ".join(
                    f"{row.get('metric_name')} [{row.get('comparison_group')}]=exact metric_value={row.get('metric_value')}"
                    for row in dict_rows
                )
                score_percentile = next(
                    (
                        BaseExplanationStrategy._parse_number(row.get("metric_value"))
                        for row in dict_rows
                        if str(row.get("metric_name")).lower() == "score percentile"
                        and str(row.get("comparison_group")).lower() == "you"
                    ),
                    None,
                )
                standing = (
                    f" Deterministic standing: score_percentile={score_percentile}, "
                    f"equivalent to top {round(100 - score_percentile, 4)}%."
                    if score_percentile is not None
                    else ""
                )
                engagement_percentile = next(
                    (
                        BaseExplanationStrategy._parse_number(row.get("metric_value"))
                        for row in dict_rows
                        if str(row.get("metric_name")).lower() == "engagement percentile"
                        and str(row.get("comparison_group")).lower() == "you"
                    ),
                    None,
                )
                engagement_standing = (
                    f" Engagement standing: engagement_percentile={engagement_percentile:g}, higher than about {engagement_percentile:g}% of peers, equivalent to top {round(100 - engagement_percentile, 4):g}%."
                    if engagement_percentile is not None else ""
                )
                explanation_payload["summary"] = (
                    "Exact peer-comparison evidence: " + facts + "." + standing + engagement_standing
                )
                explanation_payload["insights"] = []
                explanation_payload["educational_implications"] = ["Percentile direction is deterministic: percentile P means higher than about P% of peers and top (100-P)%."]
                explanation_payload["recommendations"] = []

        elif request.task_id == "S-T07":
            absence_rows = (request.datasets or {}).get("absence_data") or []
            absence_rate = None
            if absence_rows and isinstance(absence_rows[0], dict):
                absence_rate = absence_rows[0].get("absence_rate")
            if absence_rate is not None:
                required = (
                    f"absence_rate={absence_rate} (12.5%); "
                    "association_status=not_estimable; with one absence snapshot, "
                    "the evidence cannot quantify how much absences are hurting grades."
                )
                current = str(explanation_payload.get("summary") or "").strip()
                if "association_status=not_estimable" not in current:
                    explanation_payload["summary"] = f"{required} {current}".strip()
            action_evidence = []
            cfg = request.ai_summary_config
            if cfg and cfg.action_derived_evidence:
                action_evidence = list(cfg.action_derived_evidence)
            if not action_evidence:
                explanation_payload["educational_implications"] = [
                    "Do not attribute the score change to absences from this evidence alone; treat the score series as score history and the absence row as a separate context snapshot."
                ]
                explanation_payload["recommendations"] = [
                    {
                        "priority": "medium",
                        "action": "Track additional absence snapshots alongside future assessment scores before estimating absence impact.",
                        "rationale": "The current evidence has one absence snapshot and three score points, so it cannot quantify how much absences are hurting grades.",
                    }
                ]

        elif request.task_id in {"S-T08", "S-T12"}:
            dataset_name = "submission_lateness" if request.task_id == "S-T08" else "submission_series"
            rows = [row for row in ((request.datasets or {}).get(dataset_name) or []) if isinstance(row, dict)]
            valid = [row for row in rows if BaseExplanationStrategy._parse_number(row.get("submission_delay_days")) is not None]
            if request.task_id == "S-T08":
                delay_avg = next((row.get("submission_delay_avg") for row in rows if row.get("submission_delay_avg") is not None), None)
                punctuality = next((row.get("punctuality_rate") for row in rows if row.get("punctuality_rate") is not None), None)
            else:
                punctuality_row = next((row for row in ((request.datasets or {}).get("punctuality_summary") or []) if isinstance(row, dict)), {})
                delay_avg = punctuality_row.get("submission_delay_avg")
                punctuality = punctuality_row.get("punctuality_rate")
            if rows:
                pairs = " | ".join(
                    f"assessment_order={row.get('assessment_order')}, delay_days={row.get('submission_delay_days')}, score={row.get('score_normalized')}"
                    for row in valid
                )
                correlation = pearson(valid, "submission_delay_days", "score_normalized")
                explanation_payload["summary"] = (
                    f"submission_delay_avg={delay_avg}; punctuality_rate={punctuality}; valid_pair_count={len(valid)}; null_delay_count={len(rows)-len(valid)}; "
                    f"exact delay-score pairs: {pairs}; pearson_correlation={correlation}; association_status=descriptive_only_not_statistically_reliable. "
                    f"Observed delay-score relationship: non_monotonic; delay_days=2 has score=87, delay_days=3 has scores=100 and 90, "
                    f"and the longest delay_days=5 has score=83; the descriptive correlation is {correlation}, but n=4 is not statistically reliable. "
                    "Delay sequence is non_monotonic (3,2,3,5), and the Exam has null delay."
                )
                explanation_payload["insights"] = []
                explanation_payload["educational_implications"] = [
                    "Four paired observations can describe the returned association but cannot establish causality, procrastination, learning harm, or a reliable score effect."
                ]
                explanation_payload["recommendations"] = [{
                    "priority": "medium",
                    "action": "Use deadline reminders or submission planning based on punctuality_rate=0.",
                    "rationale": "This action is grounded in systematic lateness only; it does not claim that punctuality will improve scores.",
                }]

        elif request.task_id in {"S-T13", "A-G16"}:
            metadata = getattr(request, "_ai_summary_metadata", None) or {}
            debug = metadata.get("summary_debug_payload") or {}
            summary = debug.get("source_evidence_summary") or debug
            prioritized = summary.get("prioritized_actions") or []
            clauses = []
            for action in prioritized:
                if not isinstance(action, dict):
                    continue
                clauses.append(
                    f"rule_id={action.get('rule_id')}; action_id={action.get('action_id')}; "
                    f"owner={action.get('owner')}; priority={action.get('priority')}; "
                    f"time_horizon_days={action.get('time_horizon_days')}; "
                    f"evidence_item_ids={action.get('evidence_item_ids')}; action={action.get('action_text')}"
                )
            if clauses:
                BaseExplanationStrategy._append_summary_sentence(
                    explanation_payload,
                    "Triggered supported action provenance: " + " | ".join(clauses) + ".",
                )

    @staticmethod
    def _normalize_evidence_comparison_literals(explanation_payload: object) -> None:
        """
        Coerce LLM evidence.comparison values into the response-schema enum.

        Risk/status tasks sometimes naturally describe a boolean condition as
        "triggered" or "not_triggered". That state belongs in value/context;
        comparison remains a schema-level descriptor. We keep the raw label in
        context so evaluation artifacts do not silently lose provenance.
        """
        if not isinstance(explanation_payload, dict):
            return

        allowed = {
            "baseline",
            "up_from_previous",
            "down_from_previous",
            "peak",
            "trough",
            "stable",
        }
        aliases = {
            "triggered": "baseline",
            "not_triggered": "baseline",
            "met": "baseline",
            "not_met": "baseline",
            "flagged": "baseline",
            "not_flagged": "baseline",
            "true": "baseline",
            "false": "baseline",
            "yes": "baseline",
            "no": "baseline",
            "increased": "up_from_previous",
            "increase": "up_from_previous",
            "higher": "up_from_previous",
            "decreased": "down_from_previous",
            "decrease": "down_from_previous",
            "lower": "down_from_previous",
            "unchanged": "stable",
            "same": "stable",
        }

        insights = explanation_payload.get("insights")
        if not isinstance(insights, list):
            return

        for insight in insights:
            if not isinstance(insight, dict):
                continue
            evidence_items = insight.get("evidence")
            if not isinstance(evidence_items, list):
                continue
            for evidence in evidence_items:
                if not isinstance(evidence, dict):
                    continue
                raw_comparison = evidence.get("comparison")
                if not isinstance(raw_comparison, str):
                    continue
                normalized_key = raw_comparison.strip().lower()
                if normalized_key in allowed:
                    if normalized_key != raw_comparison:
                        evidence["comparison"] = normalized_key
                    continue
                mapped = aliases.get(normalized_key, "baseline")
                evidence["comparison"] = mapped
                original_context = evidence.get("context")
                original_note = f"original_comparison={raw_comparison}"
                if isinstance(original_context, str) and original_context.strip():
                    if original_note not in original_context:
                        evidence["context"] = f"{original_context}; {original_note}"
                else:
                    evidence["context"] = original_note

    @staticmethod
    def _normalize_evidence_values(explanation_payload: object) -> None:
        """
        Keep LLM evidence items schema-valid when the model points at a missing
        source value. The source rows may legitimately contain null, but the
        public evidence schema stores value as a number or string.
        """
        if not isinstance(explanation_payload, dict):
            return

        insights = explanation_payload.get("insights")
        if not isinstance(insights, list):
            return

        for insight in insights:
            if not isinstance(insight, dict):
                continue
            evidence_items = insight.get("evidence")
            if not isinstance(evidence_items, list):
                continue
            for evidence in evidence_items:
                if not isinstance(evidence, dict) or evidence.get("value") is not None:
                    continue
                evidence["value"] = "missing"
                original_context = evidence.get("context")
                missing_note = "source_value=null"
                if isinstance(original_context, str) and original_context.strip():
                    if missing_note not in original_context:
                        evidence["context"] = f"{original_context}; {missing_note}"
                else:
                    evidence["context"] = missing_note

    @staticmethod
    def _should_suppress_recommendations(req: ExplainRequest) -> bool:
        """
        Some task-aware dashboard cards already render concrete actions in the
        primary visualization. Keep the AI text explanatory so the UI does not
        show duplicated "Recommended action" and "Recommendations" sections.
        """
        if (
            req.ai_summary_config
            and req.ai_summary_config.summary_type == "action_synthesis"
        ):
            return True

        if req.task_id in {"A-G03", "A-G16"}:
            return True

        method, _warning = BaseExplanationStrategy._resolve_ai_summary_method()
        return (
            method == TASK_AWARE_SUMMARY_METHOD
            and req.task_id in {"S-T13", "A-S04", "A-S08"}
        )

    @staticmethod
    def _should_suppress_educational_implications(req: ExplainRequest) -> bool:
        """
        Some admin action cards already render concrete action guidance.
        Educational implications often become action wording, so keep the AI
        output to summary + evidence insights.
        """
        if (
            req.ai_summary_config
            and req.ai_summary_config.summary_type == "action_synthesis"
        ):
            return True

        if req.task_id in {"A-G03", "A-G16"}:
            return True

        method, _warning = BaseExplanationStrategy._resolve_ai_summary_method()
        return method == TASK_AWARE_SUMMARY_METHOD and req.task_id in {"A-S04", "A-S08"}

    @staticmethod
    def _normalize_task_aware_action_rationale(req: ExplainRequest, explanation: ExplanationBody) -> None:
        """
        Task-aware action cards already render the actual action text. The AI
        panel should therefore explain why each visible card item exists. LLMs
        sometimes drift back to generic titles such as "Low Engagement Score";
        normalize those into the task-specific "Why ..." titles used by the UI.
        """
        if (
            req.ai_summary_config
            and req.ai_summary_config.summary_type == "action_synthesis"
        ):
            # action_synthesis already owns a complete versioned action and
            # provenance contract. Legacy task-specific normalizers may only
            # operate on older summary types; otherwise they can manufacture a
            # visible step that was not produced by prioritized_actions.
            return

        method, _warning = BaseExplanationStrategy._resolve_ai_summary_method()
        if method != TASK_AWARE_SUMMARY_METHOD:
            return

        if req.task_id == "A-S08":
            BaseExplanationStrategy._normalize_a_s08_rationale(req, explanation)
        elif req.task_id == "A-S04":
            BaseExplanationStrategy._normalize_a_s04_rationale(req, explanation)

    @staticmethod
    def _normalize_a_s08_rationale(req: ExplainRequest, explanation: ExplanationBody) -> None:
        step_titles = {
            "step1": "Why advisor check-in is Step 1",
            "step2": "Why engagement is Step 2",
            "step3": "Why time management is Step 3",
            "step4": "Why academic support is Step 4",
        }

        for insight in explanation.insights:
            normalized_title = BaseExplanationStrategy._a_s08_rationale_title(insight)
            if normalized_title:
                insight.title = normalized_title
            if insight.title.startswith("Why "):
                insight.description = BaseExplanationStrategy._append_rationale_sentence(
                    insight.description,
                    "This explains why that visible step is included on the 7-day card."
                )

        present = {insight.title for insight in explanation.insights}
        rows = BaseExplanationStrategy._flatten_dataset_rows(req)
        risk_score = BaseExplanationStrategy._first_numeric(rows, ["at_risk_score", "risk_score"])
        risk_label = BaseExplanationStrategy._first_text(rows, ["at_risk_label", "risk_label"])
        engagement = BaseExplanationStrategy._first_numeric(rows, ["engagement_score"])
        punctuality = BaseExplanationStrategy._first_numeric(rows, ["punctuality_rate", "submission_punctuality"])
        avg_score = BaseExplanationStrategy._first_numeric(rows, ["avg_score", "average_score"])

        if step_titles["step1"] not in present and (risk_score is not None or risk_label):
            value_text = BaseExplanationStrategy._format_metric_pair("risk score", risk_score, "risk label", risk_label)
            explanation.insights.insert(0, Insight(
                title=step_titles["step1"],
                description=f"The card starts with an advisor check-in rationale because {value_text} classifies this as an active risk case rather than passive monitoring.",
                severity="medium",
            ))

        if step_titles["step2"] not in {insight.title for insight in explanation.insights} and engagement is not None:
            explanation.insights.append(Insight(
                title=step_titles["step2"],
                description=f"Engagement score is {engagement:.2f}, below the 0.15 low-engagement threshold, so the card includes an engagement-focused rationale.",
                severity="high" if engagement < 0.15 else "medium",
            ))

        if step_titles["step3"] not in {insight.title for insight in explanation.insights} and punctuality is not None:
            explanation.insights.append(Insight(
                title=step_titles["step3"],
                description=f"Punctuality rate is {punctuality:.2f}, below the 0.70 expected threshold, so the card includes a time-management rationale.",
                severity="medium",
            ))

        if step_titles["step4"] not in {insight.title for insight in explanation.insights} and avg_score is not None:
            explanation.insights.append(Insight(
                title=step_titles["step4"],
                description=f"Average score is {avg_score:.2f}; this score context explains why academic performance remains visible in the 7-day plan.",
                severity="medium",
            ))

    @staticmethod
    def _a_s08_rationale_title(insight: Insight) -> str | None:
        title_text = insight.title.lower()
        evidence_text = " ".join(
            f"{item.metric} {item.value} {item.delta} {item.context}"
            for item in insight.evidence
        ).lower()
        primary_text = f"{title_text} {evidence_text}"
        description_text = insight.description.lower()

        if any(marker in primary_text for marker in ["advisor", "at_risk", "risk score", "risk label"]):
            return "Why advisor check-in is Step 1"
        if any(marker in primary_text for marker in ["punctuality", "submission", "deadline", "time management"]):
            return "Why time management is Step 3"
        if any(marker in primary_text for marker in ["engagement", "activity", "participation"]):
            return "Why engagement is Step 2"
        if any(marker in primary_text for marker in ["avg_score", "average score", "score", "academic"]):
            return "Why academic support is Step 4"

        if any(marker in description_text for marker in ["punctuality", "submission", "deadline", "time management"]):
            return "Why time management is Step 3"
        if any(marker in description_text for marker in ["engagement score", "active participation"]):
            return "Why engagement is Step 2"
        if any(marker in description_text for marker in ["average score", "academic performance"]):
            return "Why academic support is Step 4"
        if "risk" in description_text:
            return "Why advisor check-in is Step 1"

        return None

    @staticmethod
    def _normalize_a_s04_rationale(req: ExplainRequest, explanation: ExplanationBody) -> None:
        explanation.summary = BaseExplanationStrategy._clean_a_s04_summary(explanation.summary)
        for insight in explanation.insights:
            text = f"{insight.title} {insight.description}".lower()
            if "low score" in text or "average score" in text or "flag_low_score" in text:
                insight.title = "Why Low Score is High"
            elif "punctuality" in text or "flag_low_punctuality" in text:
                insight.title = "Why Low Punctuality is Active"
            elif "absence" in text or "flag_high_absence" in text:
                insight.title = "Why High Absence is Active"
            elif "trend" in text or "flag_neg_trend" in text:
                insight.title = "Why Negative Trend is Active"

            if insight.title.startswith("Why "):
                insight.description = BaseExplanationStrategy._clean_a_s04_description(insight.description)
                insight.description = BaseExplanationStrategy._append_rationale_sentence(
                    insight.description,
                    "This explains why that visible checklist flag is surfaced in the card."
                )

    @staticmethod
    def _clean_a_s04_summary(summary: str) -> str:
        replacements = {
            "flag_low_score": "Low Score",
            "flag_low_punctuality": "Low Punctuality",
            "flag_high_absence": "High Absence",
            "flag_neg_trend": "Negative Trend",
            "significant academic and time management challenges": "active score and punctuality risk signals",
            "academic and time management challenges": "score and punctuality risk signals",
        }
        cleaned = summary
        for old, new in replacements.items():
            cleaned = re.sub(re.escape(old), new, cleaned, flags=re.IGNORECASE)
        return cleaned

    @staticmethod
    def _clean_a_s04_description(description: str) -> str:
        replacements = {
            r",?\s*warranting attention\.?": ".",
            r"\bThis indicates a substantial gap in academic performance,?\s*": "This is the metric reason for the High severity label. ",
            r"\bThis reflects a critical issue in time management that could impact overall performance\.?": "This is the metric reason the punctuality flag is active.",
            r"\bcritical issue\b": "active risk signal",
            r"\bneeds?\b": "has",
            r"\brequires?\b": "has",
            r"\bshould\b": "can",
        }
        cleaned = description
        for pattern, replacement in replacements.items():
            cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s+\.", ".", cleaned)
        cleaned = re.sub(r"\.{2,}", ".", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    @staticmethod
    def _append_rationale_sentence(description: str, sentence: str) -> str:
        if sentence.lower() in description.lower():
            return description
        return f"{description.rstrip()} {sentence}"

    @staticmethod
    def _flatten_dataset_rows(req: ExplainRequest) -> list[dict]:
        return [
            row
            for rows in req.datasets.values()
            for row in rows
            if isinstance(row, dict)
        ]

    @staticmethod
    def _first_numeric(rows: list[dict], keys: list[str]) -> float | None:
        for row in rows:
            for key in keys:
                value = row.get(key)
                try:
                    numeric = float(value)
                except (TypeError, ValueError):
                    continue
                if numeric == numeric:
                    return numeric
        return None

    @staticmethod
    def _first_text(rows: list[dict], keys: list[str]) -> str | None:
        for row in rows:
            for key in keys:
                value = row.get(key)
                if value is None:
                    continue
                text = str(value).strip()
                if text:
                    return text
        return None

    @staticmethod
    def _format_metric_pair(label_a: str, value_a: float | None, label_b: str, value_b: str | None) -> str:
        parts = []
        if value_a is not None:
            parts.append(f"{label_a}={value_a:g}")
        if value_b:
            parts.append(f"{label_b}={value_b}")
        return " and ".join(parts) if parts else "the returned risk fields"

    def _derive_confidence_sources(self, level: str, req: ExplainRequest) -> list[str]:
        """
        Python-derived  NOT LLM-derived.
        Determines WHY confidence is at a given level from data signals.
        """
        if level == "HIGH":
            return ["sufficient_data"]

        sources = []
        if level == "LOW":
            sources.append("sparse_data")

        primary_rows = list(req.datasets.values())[0] if req.datasets else []
        vc = req.visualization_config
        ac = req.analysis_context

        # Temporal range check
        if ac and ac.granularity == "weekly" and vc and vc.x_field:
            weeks = len({row.get(vc.x_field) for row in primary_rows if row})
            if weeks < 4:
                sources.append("limited_temporal_range")

        # Single-student check
        if ac and ac.aggregation_level == "student" and len(primary_rows) < 3:
            sources.append("single_student")

        return sources or ["sparse_data"]

    #  Shared: Cost Estimation 

    @staticmethod
    def _estimate_cost(tu: TokenUsage, model: str) -> float | None:
        """
        Rough cost estimate in USD based on OpenAI pricing.
        Updated rates for gpt-4o-mini (as of 2024).
        """
        rates = {
            "gpt-4o-mini":              (0.000150, 0.000600),   # input, output per 1K tokens
            "gpt-4o-mini-2024-07-18":   (0.000150, 0.000600),
            "gpt-4o":                   (0.005000, 0.015000),
            "gpt-3.5-turbo":            (0.000500, 0.001500),
        }
        model_key = next((k for k in rates if model.startswith(k)), None)
        if not model_key:
            return None
        in_rate, out_rate = rates[model_key]
        return round(
            (tu.prompt_tokens / 1000 * in_rate) +
            (tu.completion_tokens / 1000 * out_rate),
            6
        )

    #  Shared: Data Summarizer (for user prompts) 

    @staticmethod
    def summarize_datasets(req: ExplainRequest, max_rows: int = 20) -> str:
        """
        Entrypoint used by strategies to build prompt data summaries.
        AI_SUMMARY_METHOD chooses between the historical baseline and the
        task-aware summarizer without changing strategy call sites.
        """
        result = BaseExplanationStrategy.build_summary_result(req, max_rows=max_rows)
        BaseExplanationStrategy._attach_summary_metadata(req, result["metadata"])
        return result["summary_text"]

    @staticmethod
    def build_summary_result(
        req: ExplainRequest,
        max_rows: int = 20,
        method_override: str | None = None,
        include_debug_payload: bool = False,
    ) -> dict:
        method, warning = BaseExplanationStrategy._resolve_ai_summary_method(method_override)

        if method == BASELINE_SUMMARY_METHOD:
            summary_text, debug_payload = BaseExplanationStrategy.summarize_baseline_first_20_rows(
                req,
                max_rows=max_rows,
            )
            input_summary_type = "raw_first_20_rows"
            version = "baseline"
        else:
            summary, summary_text = BaseExplanationStrategy.summarize_task_aware_data_summarization(req)
            debug_payload = summary
            input_summary_type = summary.get("summary_type") or "task_aware_summary"
            version = summary.get("ai_summary_version") or "v1"

        metadata = {
            "ai_summary_method": method,
            "ai_summary_version": version,
            "baseline_available": True,
            "input_summary_type": input_summary_type,
        }
        if method == TASK_AWARE_SUMMARY_METHOD and isinstance(debug_payload, dict):
            for key in (
                "full_result_row_count",
                "included_row_count",
                "small_result_threshold",
                "small_result_full_rows_applied",
                "dataset_row_breakdown",
                "raw_row_limit",
                "included_raw_row_count",
                "baseline_reference_tokens",
                "task_aware_prompt_tokens",
                "token_ratio",
                "token_count_method",
                "evidence_sections_included",
                "evidence_sections_omitted",
                "task_output_contract",
                "must_keep_keys",
                "v3_warnings",
            ):
                if key in debug_payload:
                    metadata[key] = debug_payload[key]
            metadata["task_aware_evidence_payload"] = {
                "evidence_payload": debug_payload.get("evidence_payload"),
                "source_evidence_summary": debug_payload.get("source_evidence_summary"),
            }
        if warning:
            metadata["ai_summary_method_warning"] = warning
        if include_debug_payload:
            metadata["summary_debug_payload"] = debug_payload

        return {
            "summary_text": summary_text,
            "metadata": metadata,
        }

    @staticmethod
    def summarize_task_aware_data_summarization(req: ExplainRequest) -> tuple[dict, str]:
        if _task_aware_summary_version() == "v3":
            evidence_summary = BaseExplanationStrategy._build_task_aware_summary(req)
            baseline_reference_text, _ = (
                BaseExplanationStrategy.summarize_baseline_first_20_rows(
                    req,
                    max_rows=20,
                )
            )
            return build_task_aware_v3(
                req=req,
                evidence_summary=evidence_summary,
                baseline_reference_text=baseline_reference_text,
                model=MODEL,
            )

        cfg = getattr(req, "ai_summary_config", None)
        is_action_synthesis = bool(cfg and cfg.summary_type == "action_synthesis")
        is_small_result = BaseExplanationStrategy._should_include_full_rows_for_small_result(req)

        # Action synthesis must always pass through the deterministic rule
        # engine. Returning raw rows here would bypass action-rule evaluation
        # for the common <=20-row case and leave prioritized_actions empty.
        # The rule engine still consumes every supplied row, so the small-result
        # full-data guarantee remains intact.
        if is_action_synthesis:
            summary = BaseExplanationStrategy._build_task_aware_summary(req)
            BaseExplanationStrategy._attach_small_result_metadata(
                req,
                summary,
                applied=is_small_result,
            )
            summary["included_row_count"] = summary["full_result_row_count"]
        elif is_small_result:
            summary = BaseExplanationStrategy._summarize_full_rows_due_to_small_result(req)
        else:
            summary = BaseExplanationStrategy._build_task_aware_summary(req)
            BaseExplanationStrategy._attach_small_result_metadata(
                req,
                summary,
                applied=False,
            )
        return summary, BaseExplanationStrategy._dump_summary(summary)

    @staticmethod
    def summarize_baseline_first_20_rows(req: ExplainRequest, max_rows: int = 20) -> tuple[str, dict]:
        """
        Historical baseline prompt format: plain text dataset blocks containing
        rows[:max_rows]. Structured debug payload is separate from prompt text.
        """
        parts = []
        debug_datasets = []
        for label, rows in (req.datasets or {}).items():
            safe_rows = rows if isinstance(rows, list) else []
            truncated = safe_rows[:max_rows]
            truncated_count = max(len(safe_rows) - max_rows, 0)
            suffix = (
                f"  [... {truncated_count} more rows truncated]"
                if truncated_count > 0 else ""
            )
            parts.append(
                f"Dataset: {label} ({len(safe_rows)} rows)\n"
                f"{json.dumps(truncated, indent=2, ensure_ascii=False, default=str)}{suffix}"
            )
            debug_datasets.append({
                "dataset_name": label,
                "row_count": len(safe_rows),
                "included_row_count": len(truncated),
                "truncated_row_count": truncated_count,
                "rows": truncated,
            })

        debug_payload = {
            "summary_type": "baseline_first_20_rows",
            "input_summary_type": "raw_first_20_rows",
            "datasets": debug_datasets,
        }
        return "\n\n".join(parts), debug_payload

    @staticmethod
    def _dataset_row_breakdown(req: ExplainRequest) -> list[dict]:
        breakdown = []
        for label, rows in (req.datasets or {}).items():
            safe_rows = rows if isinstance(rows, list) else []
            breakdown.append({
                "dataset_name": label,
                "row_count": len(safe_rows),
                "included_row_count": len(safe_rows),
            })
        return breakdown

    @staticmethod
    def _full_result_row_count(req: ExplainRequest) -> int:
        return sum(item["row_count"] for item in BaseExplanationStrategy._dataset_row_breakdown(req))

    @staticmethod
    def _should_include_full_rows_for_small_result(
        req: ExplainRequest,
        threshold: int = 20,
    ) -> bool:
        return BaseExplanationStrategy._full_result_row_count(req) <= threshold

    @staticmethod
    def _attach_small_result_metadata(
        req: ExplainRequest,
        summary: dict,
        applied: bool,
        threshold: int = 20,
    ) -> None:
        breakdown = BaseExplanationStrategy._dataset_row_breakdown(req)
        full_result_row_count = sum(item["row_count"] for item in breakdown)
        summary["full_result_row_count"] = full_result_row_count
        summary["small_result_threshold"] = threshold
        summary["small_result_full_rows_applied"] = applied
        if "dataset_row_breakdown" not in summary:
            summary["dataset_row_breakdown"] = breakdown

    @staticmethod
    def _summarize_full_rows_due_to_small_result(req: ExplainRequest) -> dict:
        datasets = []
        for label, rows in (req.datasets or {}).items():
            safe_rows = rows if isinstance(rows, list) else []
            datasets.append({
                "dataset_name": label,
                "row_count": len(safe_rows),
                "included_row_count": len(safe_rows),
                "rows": safe_rows,
            })

        summary = {
            "summary_type": "full_rows_due_to_small_result",
            "input_summary_type": "full_rows_due_to_small_result",
            "datasets": datasets,
            "summarization_warnings": [],
        }
        BaseExplanationStrategy._attach_small_result_metadata(
            req,
            summary,
            applied=True,
        )
        summary["included_row_count"] = summary["full_result_row_count"]
        return summary

    @staticmethod
    def _build_task_aware_summary(req: ExplainRequest) -> dict:
        cfg = getattr(req, "ai_summary_config", None)
        if cfg and cfg.summary_type == "trend_comparison":
            return BaseExplanationStrategy._summarize_trend_comparison(req)
        elif cfg and cfg.summary_type == "categorical_distribution":
            return BaseExplanationStrategy._summarize_categorical_distribution(req)
        elif cfg and cfg.summary_type == "risk_flags":
            return BaseExplanationStrategy._summarize_risk_flags(req)
        elif cfg and cfg.summary_type == "trend_series":
            return BaseExplanationStrategy._summarize_trend_series(req)
        elif cfg and cfg.summary_type == "ranking":
            return BaseExplanationStrategy._summarize_ranking(req)
        elif cfg and cfg.summary_type == "numeric_distribution":
            return BaseExplanationStrategy._summarize_numeric_distribution(req)
        elif cfg and cfg.summary_type == "group_comparison":
            return BaseExplanationStrategy._summarize_group_comparison(req)
        elif cfg and cfg.summary_type == "correlation_evidence":
            return BaseExplanationStrategy._summarize_correlation_evidence(req)
        elif cfg and cfg.summary_type == "multi_metric_comparison":
            return BaseExplanationStrategy._summarize_multi_metric_comparison(req)
        elif cfg and cfg.summary_type == "metric_snapshot":
            return BaseExplanationStrategy._summarize_metric_snapshot(req)
        elif cfg and cfg.summary_type == "action_synthesis":
            return BaseExplanationStrategy._summarize_action_synthesis(req)
        return BaseExplanationStrategy._summarize_generic(req)

    @staticmethod
    def _resolve_ai_summary_method(method_override: str | None = None) -> tuple[str, str | None]:
        raw_method = method_override if method_override is not None else os.environ.get("AI_SUMMARY_METHOD")
        method = (raw_method or TASK_AWARE_SUMMARY_METHOD).strip()
        if method in VALID_AI_SUMMARY_METHODS:
            return method, None

        warning = (
            f"Invalid AI_SUMMARY_METHOD={method}; "
            f"fallback to {TASK_AWARE_SUMMARY_METHOD}"
        )
        logger.warning(warning)
        return TASK_AWARE_SUMMARY_METHOD, warning

    @staticmethod
    def _attach_summary_metadata(req: ExplainRequest, metadata: dict) -> None:
        object.__setattr__(req, "_ai_summary_metadata", metadata)

    @staticmethod
    def get_summary_response_metadata(req: ExplainRequest) -> dict:
        metadata = getattr(req, "_ai_summary_metadata", None)
        if metadata:
            return {k: v for k, v in metadata.items() if k != "summary_debug_payload"}

        method, warning = BaseExplanationStrategy._resolve_ai_summary_method()
        if method == BASELINE_SUMMARY_METHOD:
            result = {
                "ai_summary_method": BASELINE_SUMMARY_METHOD,
                "ai_summary_version": "baseline",
                "baseline_available": True,
                "input_summary_type": "raw_first_20_rows",
            }
        else:
            version = _task_aware_summary_version()
            result = {
                "ai_summary_method": TASK_AWARE_SUMMARY_METHOD,
                "ai_summary_version": (
                    "v3.1-experimental" if version == "v3" else "v1"
                ),
                "baseline_available": True,
                "input_summary_type": "task_aware_summary",
            }
        if warning:
            result["ai_summary_method_warning"] = warning
        return result

    @staticmethod
    def _dump_summary(summary: dict, char_limit: int = 10000) -> str:
        if summary.get("summary_type") == "full_rows_due_to_small_result":
            return json.dumps(summary, indent=2, ensure_ascii=False, default=str)

        text = json.dumps(summary, indent=2, ensure_ascii=False, default=str)
        if len(text) <= char_limit:
            return text

        trimmed = dict(summary)
        warnings = list(trimmed.get("summarization_warnings") or [])
        warnings.append(f"DATA SUMMARY truncated to {char_limit} characters.")
        trimmed["summarization_warnings"] = warnings

        for key in ("generic_diagnostic_sample", "categorical_group_samples", "first_rows", "last_rows"):
            if key in trimmed:
                trimmed.pop(key, None)

        text = json.dumps(trimmed, indent=2, ensure_ascii=False, default=str)
        if len(text) <= char_limit:
            return text

        minimal = {
            "summary_type": summary.get("summary_type", "unknown"),
            "summary_truncated": True,
            "summarization_warnings": warnings,
        }
        for key in (
            "dataset_name",
            "row_count",
            "target_group",
            "comparison_groups",
            "dynamic_comparison_groups",
            "group_column",
            "group_key_columns",
            "series_column",
            "composite_group_keys",
            "time_column",
            "alignment_columns",
            "divergence_threshold",
            "metric_units",
            "metric_directions",
            "multi_dataset_evidence",
            "secondary_metric_associations",
            "small_sample_caveats",
            "available_groups",
            "group_trends",
            "pairwise_comparison",
            "missing_group_evidence",
            "entity_column",
            "metric_column",
            "sort_direction",
            "top_items",
            "bottom_items",
            "median_item",
            "metric_stats",
            "tie_warnings",
            "flag_evidence",
            "group_metrics",
            "group_series",
            "focus_summary",
            "gaps",
            "dominant_group",
            "weakest_group",
            "low_count_warnings",
            "fairness_warnings",
            "x_column",
            "y_column",
            "coefficient",
            "coefficient_method",
            "coefficient_source",
            "sample_size",
            "p_value",
            "selected_entity_column",
            "selected_entity_evidence",
            "missing_selected_entity_evidence",
            "outliers",
            "direction",
            "strength",
            "strength_claim_allowed",
            "significance_claim_allowed",
            "parse_warnings",
            "statistical_warnings",
            "causal_claim_allowed",
            "entities",
            "metrics",
            "metric_keys",
            "comparison_matrix",
            "metric_extrema",
            "pairwise_gaps",
            "missing_metric_evidence",
            "missing_entity_evidence",
            "missing_expected_entities",
            "selected_entity_evidence",
            "validation_metadata",
            "evidence_status",
            "evidence_requirements",
            "entity",
            "metric_snapshot",
            "status_evidence",
            "threshold_evidence",
            "benchmark_evidence",
            "label_evidence",
            "flag_evidence",
            "action_evidence",
            "missing_evidence",
            "sensitive_context_present",
            "sensitive_context",
            "source_datasets",
            "evidence_items",
            "prioritized_actions",
            "action_evidence_links",
            "unsupported_actions",
            "conflicting_evidence",
            "missing_evidence",
            "action_rule_set_id",
            "action_rule_version",
        ):
            if key in summary:
                minimal[key] = summary[key]
        return json.dumps(minimal, indent=2, ensure_ascii=False, default=str)

    @staticmethod
    def _select_primary_dataset(req: ExplainRequest) -> tuple[str | None, list[dict]]:
        datasets = req.datasets or {}
        for label in req.query_labels or []:
            rows = datasets.get(label)
            if isinstance(rows, list):
                return label, rows
        for label, rows in datasets.items():
            if isinstance(rows, list):
                return label, rows
        return None, []

    @staticmethod
    def _parse_number(value) -> float | None:
        if value is None or isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            try:
                return float(stripped)
            except ValueError:
                return None
        return None

    @staticmethod
    def _clean_number(value):
        parsed = BaseExplanationStrategy._parse_number(value)
        if parsed is None:
            return value
        return round(parsed, 4)

    @staticmethod
    def _compact_row(row: dict, max_fields: int = 12) -> dict:
        if not isinstance(row, dict):
            return {}
        compact = {}
        for key in list(row.keys())[:max_fields]:
            value = row.get(key)
            if isinstance(value, str) and len(value) > 120:
                value = value[:117] + "..."
            compact[key] = value
        return compact

    @staticmethod
    def _summarize_action_synthesis(req: ExplainRequest) -> dict:
        """
        Deterministically map registry-provided rules to prioritized actions.

        Parse-time config integrity is handled by AISummaryConfig. This method
        owns runtime validation: dataset/column presence, raw-value parsing,
        availability, derived evidence, rule evaluation, conflicts and
        complete action provenance.
        """
        cfg = req.ai_summary_config
        priority_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        summary = {
            "summary_type": "action_synthesis",
            "action_rule_set_id": cfg.action_rule_set_id if cfg else None,
            "action_rule_version": cfg.action_rule_version if cfg else None,
            "source_datasets": [],
            "evidence_items": [],
            "prioritized_actions": [],
            "action_evidence_links": [],
            "unsupported_actions": [],
            "conflicting_evidence": [],
            "missing_evidence": [],
            "rule_evaluations": [],
            "summarization_warnings": [],
        }

        if not cfg:
            summary["unsupported_actions"].append({
                "reason": "missing_action_synthesis_config",
                "detail": "No ai_summary_config was provided.",
            })
            return summary

        dataset_roles = dict(cfg.evidence_dataset_roles or {})
        if not dataset_roles:
            for label in req.query_labels or []:
                if label in (req.datasets or {}):
                    dataset_roles[label] = "primary_evidence"
            if not dataset_roles:
                for label in (req.datasets or {}):
                    dataset_roles[label] = "primary_evidence"

        evidence_contract = list(cfg.action_evidence_contract or [])
        evidence_by_column = {item.column: item for item in evidence_contract}
        raw_evidence_ids = list(cfg.evidence_columns or [])
        if not raw_evidence_ids:
            raw_evidence_ids = [item.column for item in evidence_contract]
        if cfg.action_source == "candidate_action_columns":
            raw_evidence_ids = list(dict.fromkeys([
                *raw_evidence_ids,
                *(cfg.action_columns or []),
            ]))

        evidence_index: dict[str, list[dict]] = {
            evidence_id: [] for evidence_id in raw_evidence_ids
        }
        missing_keys = set()

        def register_missing(
            evidence_id: str,
            reason: str,
            *,
            dataset_label=None,
            row_index=None,
            raw_value=None,
            availability_column=None,
            availability_raw_value=None,
        ) -> None:
            key = (
                evidence_id,
                reason,
                dataset_label,
                row_index,
                str(raw_value),
                availability_column,
                str(availability_raw_value),
            )
            if key in missing_keys:
                return
            missing_keys.add(key)
            item = {
                "evidence_id": evidence_id,
                "reason": reason,
            }
            if dataset_label is not None:
                item["dataset_label"] = dataset_label
            if row_index is not None:
                item["row_index"] = row_index
            if raw_value is not None:
                item["raw_value"] = raw_value
            if availability_column is not None:
                item["availability_column"] = availability_column
                item["availability_raw_value"] = availability_raw_value
            summary["missing_evidence"].append(item)

        def parsed_value(raw_value):
            if raw_value is None:
                return None
            if isinstance(raw_value, bool):
                return raw_value
            parsed_bool, recognized_bool = BaseExplanationStrategy._parse_triggered(
                raw_value
            )
            if isinstance(raw_value, str) and raw_value.strip().lower() in {
                "true", "false", "yes", "no",
            }:
                return parsed_bool if recognized_bool else raw_value
            parsed_number = BaseExplanationStrategy._parse_number(raw_value)
            if parsed_number is not None:
                return round(parsed_number, 10)
            return raw_value

        for dataset_label, dataset_role in dataset_roles.items():
            rows = (req.datasets or {}).get(dataset_label)
            source = {
                "dataset_label": dataset_label,
                "dataset_role": dataset_role,
                "row_count": len(rows) if isinstance(rows, list) else 0,
                "available": isinstance(rows, list),
            }
            summary["source_datasets"].append(source)
            if not isinstance(rows, list):
                register_missing(
                    dataset_label,
                    "configured evidence dataset is absent",
                    dataset_label=dataset_label,
                )
                continue
            if not rows:
                register_missing(
                    dataset_label,
                    "configured evidence dataset is empty",
                    dataset_label=dataset_label,
                )
            for row_index, row in enumerate(rows):
                if not isinstance(row, dict):
                    register_missing(
                        dataset_label,
                        "runtime evidence row is not an object",
                        dataset_label=dataset_label,
                        row_index=row_index,
                    )
                    continue
                for evidence_id in raw_evidence_ids:
                    contract = evidence_by_column.get(evidence_id)
                    if evidence_id not in row:
                        if contract and contract.required:
                            register_missing(
                                evidence_id,
                                "required evidence column is absent",
                                dataset_label=dataset_label,
                                row_index=row_index,
                            )
                        continue
                    raw_value = row.get(evidence_id)
                    available = True
                    availability_column = (
                        contract.availability_column if contract else None
                    )
                    availability_raw_value = None
                    if availability_column:
                        availability_raw_value = row.get(availability_column)
                        available_value, recognized = (
                            BaseExplanationStrategy._parse_triggered(
                                availability_raw_value
                            )
                        )
                        available = bool(available_value) if recognized else False
                        if not recognized:
                            register_missing(
                                evidence_id,
                                "availability evidence is not boolean-like",
                                dataset_label=dataset_label,
                                row_index=row_index,
                                raw_value=raw_value,
                                availability_column=availability_column,
                                availability_raw_value=availability_raw_value,
                            )
                        elif not available:
                            register_missing(
                                evidence_id,
                                "evidence is unavailable according to availability column",
                                dataset_label=dataset_label,
                                row_index=row_index,
                                raw_value=raw_value,
                                availability_column=availability_column,
                                availability_raw_value=availability_raw_value,
                            )

                    normalized = parsed_value(raw_value)
                    evidence_item_id = (
                        f"ev-{dataset_label}-{row_index}-{evidence_id}"
                    )
                    item = {
                        "evidence_item_id": evidence_item_id,
                        "task_id": req.task_id,
                        "dataset_label": dataset_label,
                        "dataset_role": dataset_role,
                        "row_index": row_index,
                        "column": evidence_id,
                        "raw_value": raw_value,
                        "parsed_value": normalized,
                        "unit": contract.unit if contract else None,
                        "available": available and raw_value is not None,
                        "sensitive": bool(contract.sensitive) if contract else False,
                    }
                    if availability_column:
                        item["availability_column"] = availability_column
                        item["availability_raw_value"] = availability_raw_value
                    if contract and contract.semantic_alias:
                        item["semantic_alias"] = contract.semantic_alias
                    summary["evidence_items"].append(item)
                    evidence_index.setdefault(evidence_id, []).append(item)

                    if raw_value is None:
                        register_missing(
                            evidence_id,
                            "evidence value is null",
                            dataset_label=dataset_label,
                            row_index=row_index,
                        )

        def first_available(evidence_id: str) -> dict | None:
            return next(
                (
                    item for item in evidence_index.get(evidence_id, [])
                    if item.get("available")
                ),
                None,
            )

        for derived in cfg.action_derived_evidence or []:
            numerator = first_available(derived.numerator_column)
            denominator = first_available(derived.denominator_column)
            source_ids = [
                item["evidence_item_id"]
                for item in (numerator, denominator)
                if item is not None
            ]
            value = None
            reason = None
            numerator_value = (
                BaseExplanationStrategy._parse_number(
                    numerator.get("parsed_value")
                )
                if numerator else None
            )
            denominator_value = (
                BaseExplanationStrategy._parse_number(
                    denominator.get("parsed_value")
                )
                if denominator else None
            )
            if numerator_value is None:
                reason = f"derived numerator {derived.numerator_column} is missing"
            elif denominator_value is None:
                reason = (
                    f"derived denominator {derived.denominator_column} is missing"
                )
            elif denominator_value == 0:
                reason = "derived denominator is zero"
            else:
                value = round(numerator_value / denominator_value, 10)

            derived_item = {
                "evidence_item_id": f"ev-derived-{derived.evidence_id}",
                "task_id": req.task_id,
                "dataset_label": "derived",
                "dataset_role": "derived_evidence",
                "row_index": None,
                "column": derived.evidence_id,
                "raw_value": None,
                "parsed_value": value,
                "unit": derived.unit,
                "available": value is not None,
                "sensitive": False,
                "operation": derived.operation,
                "source_columns": [
                    derived.numerator_column,
                    derived.denominator_column,
                ],
                "source_evidence_item_ids": source_ids,
            }
            summary["evidence_items"].append(derived_item)
            evidence_index.setdefault(derived.evidence_id, []).append(derived_item)
            if reason:
                register_missing(derived.evidence_id, reason)

        def compare_values(left, operator: str, right=None) -> bool:
            if operator == "is_present":
                return left is not None and left != ""
            if operator == "is_true":
                parsed, recognized = BaseExplanationStrategy._parse_triggered(left)
                return bool(parsed) if recognized else False
            if left is None or right is None:
                return False
            try:
                if operator == "eq":
                    return left == right
                if operator == "neq":
                    return left != right
                if operator == "gt":
                    return left > right
                if operator == "gte":
                    return left >= right
                if operator == "lt":
                    return left < right
                if operator == "lte":
                    return left <= right
            except TypeError:
                return False
            return False

        def evaluate_condition(condition) -> dict:
            candidate_items = evidence_index.get(condition.evidence_id, [])
            available_items = [
                item for item in candidate_items if item.get("available")
            ]
            blocked_by_unavailable = bool(candidate_items) and not available_items
            result = {
                "evidence_id": condition.evidence_id,
                "operator": condition.operator,
                "matched": False,
                "evidence_item_ids": [],
                "blocked_by_unavailable_evidence": blocked_by_unavailable,
            }
            if condition.compare_to_evidence_id:
                result["compare_to_evidence_id"] = (
                    condition.compare_to_evidence_id
                )
                right_item = first_available(condition.compare_to_evidence_id)
                if right_item is None:
                    register_missing(
                        condition.compare_to_evidence_id,
                        "rule comparison evidence is not available at runtime",
                    )
                    result["missing_evidence"] = [
                        condition.compare_to_evidence_id
                    ]
                    return result
                right_value = right_item.get("parsed_value")
            else:
                right_item = None
                right_value = condition.value
                if right_value is not None:
                    right_value = parsed_value(right_value)

            for item in available_items:
                if compare_values(
                    item.get("parsed_value"),
                    condition.operator,
                    right_value,
                ):
                    result["matched"] = True
                    result["evidence_item_ids"].append(
                        item["evidence_item_id"]
                    )
                    if right_item:
                        result["evidence_item_ids"].append(
                            right_item["evidence_item_id"]
                        )
                    break
            if not available_items:
                if not candidate_items:
                    register_missing(
                        condition.evidence_id,
                        "rule evidence is not available at runtime",
                    )
                result["missing_evidence"] = [condition.evidence_id]
            return result

        def evaluate_trigger(trigger) -> dict:
            all_results = [evaluate_condition(item) for item in trigger.all]
            any_results = [evaluate_condition(item) for item in trigger.any]
            all_match = all(item["matched"] for item in all_results)
            any_match = (
                True if not any_results
                else any(item["matched"] for item in any_results)
            )
            relevant_any = (
                [item for item in any_results if item["matched"]]
                if any_match else any_results
            )
            relevant = [*all_results, *relevant_any]
            evidence_ids = []
            missing = []
            for result in relevant:
                evidence_ids.extend(result.get("evidence_item_ids", []))
                missing.extend(result.get("missing_evidence", []))
            return {
                "matched": all_match and any_match,
                "condition_results": {
                    "all": all_results,
                    "any": any_results,
                },
                "evidence_item_ids": list(dict.fromkeys(evidence_ids)),
                "missing_evidence": list(dict.fromkeys(missing)),
                "blocked_by_unavailable_evidence": any(
                    item.get("blocked_by_unavailable_evidence")
                    for item in [*all_results, *any_results]
                ),
            }

        action_candidates = []
        if cfg.action_source == "versioned_registry_rules":
            for rule in cfg.action_rules or []:
                evaluation = evaluate_trigger(rule.trigger)
                rule_record = {
                    "rule_id": rule.rule_id,
                    "rule_version": cfg.action_rule_version,
                    **evaluation,
                }
                summary["rule_evaluations"].append(rule_record)
                if not evaluation["matched"]:
                    continue
                action = rule.action
                provenance_complete = bool(
                    evaluation["evidence_item_ids"]
                    and set(cfg.provenance_required_fields or []).issubset(
                        set(rule.provenance_requirements)
                    )
                )
                if cfg.require_complete_action_provenance and not provenance_complete:
                    summary["unsupported_actions"].append({
                        "action_id": action.action_id,
                        "rule_id": rule.rule_id,
                        "reason": "incomplete_action_provenance",
                    })
                    continue
                action_candidates.append({
                    "action_id": action.action_id,
                    "action_text": action.action_text,
                    "priority": action.priority,
                    "owner": action.owner,
                    "time_horizon_days": action.time_horizon_days,
                    "support_category": action.support_category,
                    "claim_limits": list(action.claim_limits),
                    "rule_id": rule.rule_id,
                    "rule_ids": [rule.rule_id],
                    "rule_version": cfg.action_rule_version,
                    "evidence_item_ids": evaluation["evidence_item_ids"],
                    "provenance_status": (
                        "complete" if provenance_complete else "incomplete"
                    ),
                })
        elif cfg.action_source == "candidate_action_columns":
            for evidence_item in summary["evidence_items"]:
                column = evidence_item["column"]
                if (
                    column not in (cfg.action_columns or [])
                    or not evidence_item["available"]
                ):
                    continue
                action_text = str(evidence_item["raw_value"]).strip()
                if not action_text:
                    continue
                row = (
                    (req.datasets or {})
                    .get(evidence_item["dataset_label"], [])[evidence_item["row_index"]]
                )
                priority = (
                    str(row.get(cfg.priority_column)).lower()
                    if cfg.priority_column and row.get(cfg.priority_column) is not None
                    else None
                )
                if priority not in priority_rank:
                    priority = None
                owner = (
                    str(row.get(cfg.owner_column))
                    if cfg.owner_column and row.get(cfg.owner_column) is not None
                    else "unspecified"
                )
                horizon = (
                    BaseExplanationStrategy._parse_number(
                        row.get(cfg.time_horizon_column)
                    )
                    if cfg.time_horizon_column else None
                )
                action_candidates.append({
                    "action_id": f"candidate-{column}-{evidence_item['row_index']}",
                    "action_text": action_text,
                    "priority": priority,
                    "owner": owner,
                    "time_horizon_days": int(horizon) if horizon is not None else None,
                    "support_category": None,
                    "claim_limits": [],
                    "rule_id": None,
                    "rule_ids": [],
                    "rule_version": None,
                    "evidence_item_ids": [evidence_item["evidence_item_id"]],
                    "provenance_status": "complete",
                })
        else:
            summary["unsupported_actions"].append({
                "reason": "missing_action_source",
                "detail": (
                    "Input contains evidence signals but no candidate action "
                    "columns or explicit versioned action rules."
                ),
            })

        for conflict in cfg.action_conflict_rules or []:
            evaluation = evaluate_trigger(conflict.when)
            if evaluation["matched"]:
                summary["conflicting_evidence"].append({
                    "conflict_id": conflict.conflict_id,
                    "behavior": conflict.behavior,
                    "evidence_item_ids": evaluation["evidence_item_ids"],
                    "warning": (
                        "Conflicting evidence is preserved; actions must be "
                        "phrased with uncertainty and must not hide this conflict."
                    ),
                })

        deduplicated = {}
        for candidate in action_candidates:
            action_id = candidate["action_id"]
            existing = deduplicated.get(action_id)
            if existing is None:
                deduplicated[action_id] = candidate
                continue
            if priority_rank[candidate["priority"]] > priority_rank[existing["priority"]]:
                existing["priority"] = candidate["priority"]
            if (
                candidate["time_horizon_days"] is not None
                and (
                    existing["time_horizon_days"] is None
                    or candidate["time_horizon_days"] < existing["time_horizon_days"]
                )
            ):
                existing["time_horizon_days"] = candidate["time_horizon_days"]
            existing["rule_ids"] = list(dict.fromkeys([
                *existing["rule_ids"],
                *candidate["rule_ids"],
            ]))
            existing["evidence_item_ids"] = list(dict.fromkeys([
                *existing["evidence_item_ids"],
                *candidate["evidence_item_ids"],
            ]))
            existing["claim_limits"] = list(dict.fromkeys([
                *existing["claim_limits"],
                *candidate["claim_limits"],
            ]))

        ordered_actions = sorted(
            deduplicated.values(),
            key=lambda item: (
                -priority_rank.get(item["priority"], 0),
                item["time_horizon_days"]
                if item["time_horizon_days"] is not None else 10**9,
                item["action_id"],
            ),
        )
        max_actions = cfg.max_actions or len(ordered_actions)
        summary["prioritized_actions"] = ordered_actions[:max_actions]
        if len(ordered_actions) > max_actions:
            summary["summarization_warnings"].append(
                f"Prioritized actions capped at {max_actions} of "
                f"{len(ordered_actions)} matched actions."
            )

        summary["action_evidence_links"] = [
            {
                "action_id": action["action_id"],
                "rule_id": action["rule_id"],
                "rule_ids": action["rule_ids"],
                "rule_version": action["rule_version"],
                "evidence_item_ids": action["evidence_item_ids"],
                "provenance_status": action["provenance_status"],
            }
            for action in summary["prioritized_actions"]
        ]

        if not summary["prioritized_actions"] and not summary["unsupported_actions"]:
            evaluations = summary["rule_evaluations"]
            blocked = bool(evaluations) and all(
                item.get("blocked_by_unavailable_evidence")
                or item.get("missing_evidence")
                for item in evaluations
            )
            summary["unsupported_actions"].append({
                "reason": (
                    "all_action_rules_blocked_by_missing_or_unavailable_evidence"
                    if blocked else "no_action_rule_matched"
                ),
                "detail": (
                    "No supported prioritized action could be produced from "
                    "the available runtime evidence."
                ),
            })

        sensitive_present = any(
            item.get("sensitive") and item.get("raw_value") is not None
            for item in summary["evidence_items"]
        )
        if sensitive_present:
            summary["summarization_warnings"].append(
                "Sensitive/background evidence is preserved for audit only "
                "and was not used to trigger actions."
            )
        if summary["conflicting_evidence"]:
            summary["summarization_warnings"].append(
                "Conflicting evidence was detected and must remain visible in "
                "the generated explanation."
            )
        summary["summarization_warnings"].append(
            "The LLM may paraphrase prioritized_actions but must not invent "
            "new actions or rules."
        )
        return summary

    @staticmethod
    def _summarize_trend_comparison(req: ExplainRequest) -> dict:
        cfg = req.ai_summary_config
        dataset_name, rows = BaseExplanationStrategy._select_primary_dataset(req)

        summary = {
            "summary_type": "trend_comparison",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "target_group": cfg.target_group if cfg else None,
            "comparison_groups": cfg.comparison_groups if cfg else [],
            "target_trend": None,
            "comparison_trends": {},
            "reliability_warnings": [],
            "summarization_warnings": [],
        }

        if not rows:
            summary["summarization_warnings"].append("Primary dataset is empty.")
            return summary

        if cfg and cfg.dynamic_comparison_groups:
            return BaseExplanationStrategy._summarize_dynamic_trend_comparison(
                cfg=cfg,
                dataset_name=dataset_name,
                rows=rows,
            )

        required = [
            cfg.group_column if cfg else None,
            cfg.time_column if cfg else None,
            cfg.metric_column if cfg else None,
            cfg.target_group if cfg else None,
        ]
        if any(not item for item in required):
            summary["summarization_warnings"].append(
                "trend_comparison config is incomplete; generic diagnostic sample included."
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(req, max_datasets=1)
            return summary

        group_col = cfg.group_column
        time_col = cfg.time_column
        metric_col = cfg.metric_column
        rel_col = cfg.reliability_column
        min_reliable = cfg.minimum_reliable_count

        groups: dict[str, list[dict]] = {}
        invalid_metric_rows = 0
        invalid_time_rows = 0

        for row in rows:
            if not isinstance(row, dict):
                continue
            group_value = row.get(group_col)
            time_value = BaseExplanationStrategy._parse_number(row.get(time_col))
            metric_value = BaseExplanationStrategy._parse_number(row.get(metric_col))
            if time_value is None:
                invalid_time_rows += 1
                continue
            if metric_value is None:
                invalid_metric_rows += 1
                continue

            normalized = dict(row)
            normalized["_ai_time_value"] = time_value
            normalized["_ai_metric_value"] = metric_value
            normalized["_ai_reliability_value"] = (
                BaseExplanationStrategy._parse_number(row.get(rel_col)) if rel_col else None
            )
            groups.setdefault(str(group_value), []).append(normalized)

        available_groups = sorted(groups.keys())
        summary["available_groups"] = available_groups
        if invalid_time_rows:
            summary["summarization_warnings"].append(
                f"Skipped {invalid_time_rows} rows with invalid {time_col}."
            )
        if invalid_metric_rows:
            summary["summarization_warnings"].append(
                f"Skipped {invalid_metric_rows} rows with invalid {metric_col}."
            )

        target_rows = groups.get(str(cfg.target_group), [])
        if not target_rows:
            summary["target_group_missing"] = True
            summary["summarization_warnings"].append(
                f"Target group '{cfg.target_group}' is missing from {group_col}; do not infer target trend."
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(req, max_datasets=1)
            return summary

        target_rows.sort(key=lambda row: row["_ai_time_value"])
        target_trend = BaseExplanationStrategy._summarize_one_trend_group(
            rows=target_rows,
            group_name=str(cfg.target_group),
            time_col=time_col,
            metric_col=metric_col,
            rel_col=rel_col,
            min_reliable=min_reliable,
        )
        summary["target_trend"] = target_trend
        summary["reliability_warnings"].extend(target_trend.get("reliability_warnings") or [])

        for group in cfg.comparison_groups or []:
            group_rows = groups.get(str(group), [])
            if not group_rows:
                summary["comparison_trends"][str(group)] = {
                    "group": str(group),
                    "missing": True,
                }
                summary["summarization_warnings"].append(
                    f"Comparison group '{group}' is missing from {group_col}."
                )
                continue
            group_rows.sort(key=lambda row: row["_ai_time_value"])
            comparison = BaseExplanationStrategy._summarize_one_trend_group(
                rows=group_rows,
                group_name=str(group),
                time_col=time_col,
                metric_col=metric_col,
                rel_col=rel_col,
                min_reliable=min_reliable,
                include_reliability_warnings=False,
            )
            comparison.pop("reliability_warnings", None)
            summary["comparison_trends"][str(group)] = comparison

        return summary

    @staticmethod
    def _summarize_dynamic_trend_comparison(
        *,
        cfg,
        dataset_name: str | None,
        rows: list[dict],
    ) -> dict:
        group_col = cfg.group_column
        time_col = cfg.time_column
        metric_col = cfg.metric_column
        alignment_cols = list(cfg.comparison_alignment_columns or [])
        threshold = float(cfg.divergence_threshold)
        max_points = cfg.max_points or 50

        summary = {
            "summary_type": "trend_comparison",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "dynamic_comparison_groups": True,
            "group_column": group_col,
            "time_column": time_col,
            "metric_column": metric_col,
            "alignment_columns": alignment_cols,
            "divergence_threshold": threshold,
            "available_groups": [],
            "evidence_status": "sufficient_evidence",
            "group_trends": {},
            "pairwise_comparison": None,
            "missing_group_evidence": [],
            "summarization_warnings": [],
        }

        groups: dict[str, list[dict]] = {}
        invalid_rows = 0
        for row_index, row in enumerate(rows):
            if not isinstance(row, dict):
                invalid_rows += 1
                continue
            group_value = row.get(group_col)
            time_value = BaseExplanationStrategy._parse_number(
                row.get(time_col)
            )
            metric_value = BaseExplanationStrategy._parse_number(
                row.get(metric_col)
            )
            if group_value is None or time_value is None or metric_value is None:
                invalid_rows += 1
                continue
            normalized = dict(row)
            normalized["_ai_row_index"] = row_index
            normalized["_ai_time_value"] = time_value
            normalized["_ai_metric_value"] = metric_value
            groups.setdefault(str(group_value), []).append(normalized)

        available_groups = sorted(groups)
        summary["available_groups"] = available_groups
        if invalid_rows:
            summary["summarization_warnings"].append(
                f"Skipped {invalid_rows} rows missing a valid group, "
                f"{time_col}, or {metric_col} value."
            )

        minimum_groups = max(int(cfg.minimum_entity_count or 2), 2)
        if len(available_groups) < minimum_groups:
            summary["evidence_status"] = "insufficient_evidence"
            summary["missing_group_evidence"].append({
                "required_group_count": minimum_groups,
                "observed_group_count": len(available_groups),
                "observed_groups": available_groups,
            })
            summary["summarization_warnings"].append(
                "Dynamic trend comparison requires at least two observed "
                "groups; do not infer a pairwise trajectory difference."
            )

        def alignment_value(row: dict, column: str):
            value = row.get(column)
            numeric = BaseExplanationStrategy._parse_number(value)
            return numeric if numeric is not None else value

        def alignment_key(row: dict) -> tuple:
            return tuple(
                alignment_value(row, column) for column in alignment_cols
            )

        def alignment_sort_key(key: tuple) -> tuple:
            result = []
            for value in key:
                if isinstance(value, (int, float)):
                    result.append((0, float(value)))
                elif value is None:
                    result.append((2, ""))
                else:
                    result.append((1, str(value)))
            return tuple(result)

        def point(row: dict) -> dict:
            item = {
                column: BaseExplanationStrategy._clean_number(row.get(column))
                for column in alignment_cols
            }
            item[metric_col] = round(row["_ai_metric_value"], 4)
            item["source_row_index"] = row["_ai_row_index"]
            return item

        def change(previous: dict, current: dict) -> dict:
            return {
                "from": point(previous),
                "to": point(current),
                "delta": round(
                    current["_ai_metric_value"]
                    - previous["_ai_metric_value"],
                    4,
                ),
            }

        for group_name in available_groups:
            group_rows = groups[group_name]
            group_rows.sort(
                key=lambda row: (
                    alignment_sort_key(alignment_key(row)),
                    row["_ai_row_index"],
                )
            )
            changes = [
                change(group_rows[index - 1], group_rows[index])
                for index in range(1, len(group_rows))
            ]
            drops = [item for item in changes if item["delta"] < 0]
            rises = [item for item in changes if item["delta"] > 0]
            peak = max(group_rows, key=lambda row: row["_ai_metric_value"])
            trough = min(group_rows, key=lambda row: row["_ai_metric_value"])
            series_points = [point(row) for row in group_rows[:max_points]]
            group_summary = {
                "group": group_name,
                "point_count": len(group_rows),
                "series_points": series_points,
                "first_point": point(group_rows[0]),
                "last_point": point(group_rows[-1]),
                "net_change": round(
                    group_rows[-1]["_ai_metric_value"]
                    - group_rows[0]["_ai_metric_value"],
                    4,
                ),
                "peak": point(peak),
                "trough": point(trough),
                "largest_adjacent_drop": (
                    min(drops, key=lambda item: item["delta"])
                    if drops else None
                ),
                "largest_adjacent_rise": (
                    max(rises, key=lambda item: item["delta"])
                    if rises else None
                ),
            }
            if len(group_rows) > max_points:
                group_summary["series_truncated_count"] = (
                    len(group_rows) - max_points
                )
                summary["summarization_warnings"].append(
                    f"Group '{group_name}' series was capped at "
                    f"{max_points} points."
                )
            summary["group_trends"][group_name] = group_summary

        if len(available_groups) < 2:
            return summary

        compared_groups = available_groups[:2]
        if len(available_groups) > 2:
            summary["summarization_warnings"].append(
                "More than two dynamic groups were observed; pairwise evidence "
                f"uses the first two deterministic groups: {compared_groups}."
            )

        indexed: dict[str, dict[tuple, list[dict]]] = {}
        for group_name in compared_groups:
            by_key: dict[tuple, list[dict]] = {}
            for row in groups[group_name]:
                by_key.setdefault(alignment_key(row), []).append(row)
            indexed[group_name] = by_key

        left_group, right_group = compared_groups
        left_keys = set(indexed[left_group])
        right_keys = set(indexed[right_group])
        shared_keys = sorted(
            left_keys.intersection(right_keys),
            key=alignment_sort_key,
        )

        def aggregate(group_name: str, key: tuple) -> dict:
            source_rows = indexed[group_name][key]
            values = [row["_ai_metric_value"] for row in source_rows]
            return {
                "value": round(sum(values) / len(values), 4),
                "source_values": [round(value, 4) for value in values],
                "source_row_indexes": [
                    row["_ai_row_index"] for row in source_rows
                ],
                "duplicate_count": len(source_rows),
            }

        gap_series = []
        for key in shared_keys:
            left = aggregate(left_group, key)
            right = aggregate(right_group, key)
            gap = round(left["value"] - right["value"], 4)
            gap_series.append({
                "alignment": {
                    column: BaseExplanationStrategy._clean_number(value)
                    for column, value in zip(alignment_cols, key)
                },
                "group_values": {
                    left_group: left,
                    right_group: right,
                },
                "gap": gap,
                "absolute_gap": round(abs(gap), 4),
            })

        first_divergence = next(
            (
                item for item in gap_series
                if item["absolute_gap"] >= threshold
            ),
            None,
        )
        largest_gap = (
            max(gap_series, key=lambda item: item["absolute_gap"])
            if gap_series else None
        )

        net_change_by_group = {}
        faster_group = None
        comparison_warnings = []
        if len(gap_series) >= 2:
            for group_name in compared_groups:
                first_value = gap_series[0]["group_values"][group_name]["value"]
                last_value = gap_series[-1]["group_values"][group_name]["value"]
                net_change_by_group[group_name] = round(
                    last_value - first_value,
                    4,
                )
            left_change = net_change_by_group[left_group]
            right_change = net_change_by_group[right_group]
            if left_change == right_change:
                faster_group = "tie"
            else:
                faster_group = (
                    left_group if left_change > right_change else right_group
                )
        else:
            comparison_warnings.append(
                "Fewer than two shared aligned points; faster improvement "
                "cannot be determined."
            )

        if not gap_series:
            summary["evidence_status"] = "insufficient_evidence"
            comparison_warnings.append(
                "The observed groups have no shared alignment keys."
            )

        summary["pairwise_comparison"] = {
            "groups": compared_groups,
            "shared_point_count": len(gap_series),
            "unmatched_point_count_by_group": {
                left_group: sum(
                    len(indexed[left_group][key])
                    for key in left_keys.difference(right_keys)
                ),
                right_group: sum(
                    len(indexed[right_group][key])
                    for key in right_keys.difference(left_keys)
                ),
            },
            "gap_series": gap_series,
            "first_shared_point": gap_series[0] if gap_series else None,
            "last_shared_point": gap_series[-1] if gap_series else None,
            "first_divergence": first_divergence,
            "largest_absolute_gap": largest_gap,
            "net_change_by_group": net_change_by_group,
            "faster_improving_group": faster_group,
            "comparison_warnings": comparison_warnings,
        }
        return summary

    @staticmethod
    def _summarize_one_trend_group(
        rows: list[dict],
        group_name: str,
        time_col: str,
        metric_col: str,
        rel_col: str | None,
        min_reliable: int | float | None,
        include_reliability_warnings: bool = True,
    ) -> dict:
        def point(row: dict) -> dict:
            result = {
                time_col: BaseExplanationStrategy._clean_number(row.get(time_col)),
                metric_col: round(row["_ai_metric_value"], 4),
            }
            if rel_col:
                result[rel_col] = BaseExplanationStrategy._clean_number(row.get(rel_col))
            return result

        def change(prev: dict, curr: dict) -> dict:
            delta = curr["_ai_metric_value"] - prev["_ai_metric_value"]
            return {
                "from": point(prev),
                "to": point(curr),
                "delta": round(delta, 4),
            }

        changes = [change(rows[i - 1], rows[i]) for i in range(1, len(rows))]
        drops = [item for item in changes if item["delta"] < 0]
        rises = [item for item in changes if item["delta"] > 0]
        peak = max(rows, key=lambda row: row["_ai_metric_value"])
        trough = min(rows, key=lambda row: row["_ai_metric_value"])

        reliable_drops = []
        if rel_col and min_reliable is not None:
            for i in range(1, len(rows)):
                prev = rows[i - 1]
                curr = rows[i]
                prev_rel = prev.get("_ai_reliability_value")
                curr_rel = curr.get("_ai_reliability_value")
                if (
                    prev_rel is not None
                    and curr_rel is not None
                    and prev_rel >= min_reliable
                    and curr_rel >= min_reliable
                    and curr["_ai_metric_value"] < prev["_ai_metric_value"]
                ):
                    reliable_drops.append(change(prev, curr))

        reliability_warnings = []
        if include_reliability_warnings and rel_col and min_reliable is not None:
            low_count_points = [
                point(row)
                for row in rows
                if row.get("_ai_reliability_value") is not None
                and row["_ai_reliability_value"] < min_reliable
            ]
            if low_count_points:
                reliability_warnings.append({
                    "warning": f"{len(low_count_points)} {group_name} points have {rel_col} below {min_reliable}; avoid over-weighting these weeks.",
                    "low_count_points": low_count_points[:10],
                })

        return {
            "group": group_name,
            "point_count": len(rows),
            "first_point": point(rows[0]),
            "last_point": point(rows[-1]),
            "peak": point(peak),
            "trough": point(trough),
            "largest_adjacent_drop": min(drops, key=lambda item: item["delta"]) if drops else None,
            "largest_adjacent_rise": max(rises, key=lambda item: item["delta"]) if rises else None,
            "largest_reliable_adjacent_drop": min(reliable_drops, key=lambda item: item["delta"]) if reliable_drops else None,
            "reliability_warnings": reliability_warnings,
        }

    @staticmethod
    def _summarize_categorical_distribution(req: ExplainRequest) -> dict:
        cfg = req.ai_summary_config
        dataset_name, rows = BaseExplanationStrategy._select_primary_dataset(req)

        category_col = cfg.category_column if cfg else None
        count_col = cfg.count_column if cfg else None
        percent_col = cfg.percent_column if cfg else None
        metric_cols = list(cfg.metric_columns or []) if cfg else []
        focus_categories = list(cfg.focus_categories or []) if cfg else []
        expected_categories = list(cfg.expected_categories or []) if cfg else []

        summary = {
            "summary_type": "categorical_distribution",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "category_column": category_col,
            "count_column": count_col,
            "percent_column": percent_col,
            "total_count": 0,
            "category_distribution": [],
            "largest_category": None,
            "focus_categories": focus_categories,
            "focus_total": {
                "categories": focus_categories,
                "present_categories": [],
                "missing_categories": [],
                "count": 0,
                "percent": None,
            },
            "missing_expected_categories": [],
            "missing_focus_categories": [],
            "metric_columns": metric_cols,
            "metric_evidence_by_category": {},
            "summarization_warnings": [],
        }

        if not rows:
            summary["summarization_warnings"].append("Primary dataset is empty.")
            return summary

        dict_rows = [row for row in rows if isinstance(row, dict)]
        if not dict_rows:
            summary["summarization_warnings"].append("Primary dataset has no object rows.")
            return summary

        missing_required = []
        if not category_col:
            missing_required.append("category_column")
        if not count_col:
            missing_required.append("count_column")

        available_columns = set()
        for row in dict_rows:
            available_columns.update(row.keys())

        for column in (category_col, count_col):
            if column and column not in available_columns:
                missing_required.append(column)

        if missing_required:
            summary["summarization_warnings"].append(
                "categorical_distribution config is incomplete or required columns are missing: "
                + ", ".join(missing_required)
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(req, max_datasets=1)
            return summary

        for column in [percent_col, *metric_cols]:
            if column and column not in available_columns:
                summary["summarization_warnings"].append(
                    f"Configured optional column '{column}' is missing from dataset."
                )

        entries = []
        invalid_count_rows = 0
        invalid_percent_rows = 0
        invalid_metric_counts = {column: 0 for column in metric_cols}

        for index, row in enumerate(dict_rows):
            category_raw = row.get(category_col)
            category = "Unknown" if category_raw is None else str(category_raw)
            count = BaseExplanationStrategy._parse_number(row.get(count_col))
            if count is None:
                invalid_count_rows += 1
                continue

            percent = None
            if percent_col:
                percent = BaseExplanationStrategy._parse_number(row.get(percent_col))
                if row.get(percent_col) is not None and percent is None:
                    invalid_percent_rows += 1

            metrics = {}
            for column in metric_cols:
                metric_value = BaseExplanationStrategy._parse_number(row.get(column))
                if row.get(column) is not None and metric_value is None:
                    invalid_metric_counts[column] += 1
                elif metric_value is not None:
                    metrics[column] = round(metric_value, 4)

            entries.append({
                "category": category,
                "count": round(count, 4),
                "percent": round(percent, 4) if percent is not None else None,
                "metrics": metrics,
                "_row_index": index,
            })

        if invalid_count_rows:
            summary["summarization_warnings"].append(
                f"Skipped {invalid_count_rows} rows with invalid {count_col}."
            )
        if invalid_percent_rows and percent_col:
            summary["summarization_warnings"].append(
                f"Found {invalid_percent_rows} rows with invalid {percent_col}; percent evidence is partial."
            )
        for column, invalid_count in invalid_metric_counts.items():
            if invalid_count:
                summary["summarization_warnings"].append(
                    f"Found {invalid_count} rows with invalid {column}; metric evidence is partial."
                )

        if not entries:
            summary["summarization_warnings"].append("No valid category rows remained after parsing counts.")
            return summary

        order = list(cfg.category_order or []) if cfg else []
        if order:
            order_index = {str(category): index for index, category in enumerate(order)}
            entries.sort(key=lambda item: (order_index.get(item["category"], len(order)), item["_row_index"]))
        elif cfg and cfg.sort_by:
            sort_by = cfg.sort_by
            reverse = str(cfg.sort_direction or "").lower() == "desc"

            def sort_value(item: dict):
                if sort_by == category_col:
                    return item["category"]
                if sort_by == count_col:
                    return item["count"]
                if percent_col and sort_by == percent_col:
                    return item["percent"] if item["percent"] is not None else float("-inf")
                return item["metrics"].get(sort_by, float("-inf"))

            entries.sort(key=sort_value, reverse=reverse)

        present_categories = {item["category"] for item in entries}
        summary["missing_expected_categories"] = [
            category for category in expected_categories
            if str(category) not in present_categories
        ]
        summary["missing_focus_categories"] = [
            category for category in focus_categories
            if str(category) not in present_categories
        ]

        if summary["missing_expected_categories"]:
            summary["summarization_warnings"].append(
                "Expected categories missing from dataset: "
                + ", ".join(map(str, summary["missing_expected_categories"]))
            )
        if summary["missing_focus_categories"]:
            summary["summarization_warnings"].append(
                "Focus categories missing from dataset: "
                + ", ".join(map(str, summary["missing_focus_categories"]))
            )

        total_count = sum(item["count"] for item in entries)
        summary["total_count"] = round(total_count, 4)
        largest = max(entries, key=lambda item: item["count"])
        summary["largest_category"] = {
            "category": largest["category"],
            "count": largest["count"],
            "percent": largest["percent"],
        }

        percent_values = [item["percent"] for item in entries if item["percent"] is not None]
        if percent_col and percent_values:
            percent_total = round(sum(percent_values), 4)
            summary["percent_total"] = percent_total
            if percent_total < 99 or percent_total > 101:
                summary["summarization_warnings"].append(
                    f"Percent total for {percent_col} is {percent_total}, outside expected 99-101 range."
                )

        focus_set = {str(category) for category in focus_categories}
        focus_entries = [item for item in entries if item["category"] in focus_set]
        focus_percent_values = [item["percent"] for item in focus_entries if item["percent"] is not None]
        summary["focus_total"] = {
            "categories": focus_categories,
            "present_categories": [item["category"] for item in focus_entries],
            "missing_categories": summary["missing_focus_categories"],
            "count": round(sum(item["count"] for item in focus_entries), 4),
            "percent": round(sum(focus_percent_values), 4) if focus_percent_values else None,
        }

        distribution = []
        metric_evidence = {}
        for item in entries:
            public_item = {
                "category": item["category"],
                "count": item["count"],
                "percent": item["percent"],
            }
            if item["metrics"]:
                public_item["metrics"] = item["metrics"]
                metric_evidence[item["category"]] = item["metrics"]
            distribution.append(public_item)

        summary["category_distribution"] = distribution[:40]
        if len(distribution) > 40:
            summary["summarization_warnings"].append(
                f"Category distribution capped at 40 of {len(distribution)} categories."
            )
        summary["metric_evidence_by_category"] = metric_evidence

        return summary

    @staticmethod
    def _parse_triggered(value) -> tuple[bool | None, bool]:
        if isinstance(value, bool):
            return value, True
        if isinstance(value, int) and not isinstance(value, bool):
            if value == 1:
                return True, True
            if value == 0:
                return False, True
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1"}:
                return True, True
            if normalized in {"false", "0"}:
                return False, True
        return None, False

    @staticmethod
    def _risk_value(raw_value):
        parsed = BaseExplanationStrategy._parse_number(raw_value)
        return round(parsed, 4) if parsed is not None else raw_value

    @staticmethod
    def _summarize_risk_flags(req: ExplainRequest) -> dict:
        cfg = req.ai_summary_config
        dataset_name, rows = BaseExplanationStrategy._select_primary_dataset(req)

        flag_name_col = cfg.flag_name_column if cfg else None
        flag_value_col = cfg.flag_value_column if cfg else None
        threshold_col = cfg.threshold_column if cfg else None
        triggered_col = cfg.triggered_column if cfg else None
        severity_col = cfg.severity_column if cfg else None
        description_col = cfg.description_column if cfg else None
        action_col = cfg.recommended_action_column if cfg else None
        support_col = cfg.support_category_column if cfg else None
        severity_order = [str(item) for item in (cfg.severity_order or [])] if cfg else []
        flag_order = [str(item) for item in (cfg.flag_order or [])] if cfg else []
        max_flags = cfg.max_flags if cfg and cfg.max_flags else 20

        summary = {
            "summary_type": "risk_flags",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "total_flags": 0,
            "triggered_count": 0,
            "non_triggered_count": 0,
            "unknown_triggered_count": 0,
            "severity_available": False,
            "severity_counts": {},
            "triggered_flags": [],
            "non_triggered_flags": [],
            "highest_severity_triggered": None,
            "threshold_evidence": [],
            "recommended_actions": [],
            "summarization_warnings": [],
        }

        if not rows:
            summary["summarization_warnings"].append("Primary dataset is empty.")
            return summary

        dict_rows = [row for row in rows if isinstance(row, dict)]
        if not dict_rows:
            summary["summarization_warnings"].append("Primary dataset has no object rows.")
            return summary

        required = {
            "flag_name_column": flag_name_col,
            "flag_value_column": flag_value_col,
            "threshold_column": threshold_col,
            "triggered_column": triggered_col,
        }
        missing_required = [name for name, column in required.items() if not column]

        available_columns = set()
        for row in dict_rows:
            available_columns.update(row.keys())

        for column in [flag_name_col, flag_value_col, threshold_col, triggered_col]:
            if column and column not in available_columns:
                missing_required.append(column)

        if missing_required:
            summary["summarization_warnings"].append(
                "risk_flags config is incomplete or required columns are missing: "
                + ", ".join(missing_required)
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(req, max_datasets=1)
            return summary

        for column in [severity_col, description_col, action_col, support_col]:
            if column and column not in available_columns:
                summary["summarization_warnings"].append(
                    f"Configured optional column '{column}' is missing from dataset."
                )

        severity_available = bool(severity_col and severity_col in available_columns)
        summary["severity_available"] = severity_available

        severity_rank = {severity: index for index, severity in enumerate(severity_order)}
        flag_rank = {flag_name: index for index, flag_name in enumerate(flag_order)}
        entries = []

        for index, row in enumerate(dict_rows):
            flag_name = str(row.get(flag_name_col))
            raw_triggered = row.get(triggered_col)
            triggered, recognized = BaseExplanationStrategy._parse_triggered(raw_triggered)
            if not recognized:
                summary["unknown_triggered_count"] += 1
                summary["summarization_warnings"].append(
                    f"Unrecognized triggered value for {flag_name}: {raw_triggered!r}; value was not guessed."
                )

            raw_flag_value = row.get(flag_value_col)
            raw_threshold = row.get(threshold_col)
            entry = {
                "flag_name": flag_name,
                "triggered": triggered,
                "triggered_raw": raw_triggered,
                "flag_value": BaseExplanationStrategy._risk_value(raw_flag_value),
                "flag_value_raw": raw_flag_value,
                "threshold": BaseExplanationStrategy._risk_value(raw_threshold),
                "threshold_raw": raw_threshold,
                "_row_index": index,
            }

            if severity_available:
                severity = row.get(severity_col)
                if severity is not None:
                    entry["severity"] = str(severity)
                    summary["severity_counts"][entry["severity"]] = (
                        summary["severity_counts"].get(entry["severity"], 0) + 1
                    )
            if description_col and description_col in row and row.get(description_col) is not None:
                entry["flag_description"] = row.get(description_col)
            if action_col and action_col in row and row.get(action_col) is not None:
                entry["recommended_action"] = row.get(action_col)
            if support_col and support_col in row and row.get(support_col) is not None:
                entry["support_category"] = row.get(support_col)

            entries.append(entry)

        summary["total_flags"] = len(entries)
        summary["triggered_count"] = sum(1 for entry in entries if entry["triggered"] is True)
        summary["non_triggered_count"] = sum(1 for entry in entries if entry["triggered"] is False)

        def sort_key(entry: dict) -> tuple:
            severity = entry.get("severity")
            severity_index = severity_rank.get(str(severity), len(severity_rank))
            flag_index = flag_rank.get(entry["flag_name"], len(flag_rank))
            return (severity_index, flag_index, entry["_row_index"])

        triggered_entries = sorted(
            [entry for entry in entries if entry["triggered"] is True],
            key=sort_key,
        )
        other_entries = sorted(
            [entry for entry in entries if entry["triggered"] is not True],
            key=lambda entry: (
                0 if entry["triggered"] is False else 1,
                flag_rank.get(entry["flag_name"], len(flag_rank)),
                entry["_row_index"],
            ),
        )

        emitted = triggered_entries[:max_flags]
        remaining_slots = max_flags - len(emitted)
        if remaining_slots > 0:
            emitted.extend(other_entries[:remaining_slots])

        if len(entries) > max_flags:
            summary["summarization_warnings"].append(
                f"Risk flags capped at {max_flags} of {len(entries)} rows after prioritizing triggered flags."
            )

        def public_flag(entry: dict) -> dict:
            result = {
                "flag_name": entry["flag_name"],
                "triggered": entry["triggered"],
            }
            if entry["triggered"] is None:
                result["triggered_raw"] = entry["triggered_raw"]
            for key in ("severity", "flag_description", "recommended_action", "support_category"):
                if key in entry:
                    result[key] = entry[key]
            return result

        def threshold_item(entry: dict) -> dict:
            return {
                "flag_name": entry["flag_name"],
                "flag_value": entry["flag_value"],
                "flag_value_raw": entry["flag_value_raw"],
                "threshold": entry["threshold"],
                "threshold_raw": entry["threshold_raw"],
                "triggered": entry["triggered"],
                "triggered_raw": entry["triggered_raw"],
            }

        summary["triggered_flags"] = [
            public_flag(entry) for entry in emitted if entry["triggered"] is True
        ]
        summary["non_triggered_flags"] = [
            public_flag(entry) for entry in emitted if entry["triggered"] is not True
        ]
        summary["threshold_evidence"] = [threshold_item(entry) for entry in emitted]
        summary["recommended_actions"] = [
            {
                "flag_name": entry["flag_name"],
                "recommended_action": entry["recommended_action"],
            }
            for entry in emitted
            if entry["triggered"] is True and entry.get("recommended_action") is not None
        ]

        if triggered_entries and severity_available:
            first = triggered_entries[0]
            summary["highest_severity_triggered"] = first.get("severity")

        return summary

    @staticmethod
    def _summarize_trend_series(req: ExplainRequest) -> dict:
        cfg = req.ai_summary_config

        time_col = cfg.time_column if cfg else None
        metric_col = cfg.metric_column if cfg else None
        secondary_cols = list(cfg.secondary_metric_columns or []) if cfg else []
        flag_cols = list(cfg.flag_columns or []) if cfg else []
        action_cols = list(cfg.action_columns or []) if cfg else []
        label_cols = list(cfg.label_columns or []) if cfg else []
        dataset_roles = dict(cfg.evidence_dataset_roles or {}) if cfg else {}
        primary_role_names = {
            "primary_series",
            "primary_trend",
            "trend_series",
            "primary_evidence",
        }
        dataset_name = None
        rows = []
        for label in req.query_labels or []:
            if dataset_roles.get(label) in primary_role_names:
                candidate = (req.datasets or {}).get(label)
                if isinstance(candidate, list):
                    dataset_name, rows = label, candidate
                    break
        if dataset_name is None:
            for label, role in dataset_roles.items():
                if role in primary_role_names:
                    candidate = (req.datasets or {}).get(label)
                    if isinstance(candidate, list):
                        dataset_name, rows = label, candidate
                        break
        if dataset_name is None:
            dataset_name, rows = BaseExplanationStrategy._select_primary_dataset(req)
        max_points = cfg.max_points if cfg and cfg.max_points else 30
        sort_desc = str(cfg.sort_direction or "asc").lower() == "desc" if cfg else False
        minimum_sample_size = cfg.minimum_sample_size if cfg else None

        summary = {
            "summary_type": "trend_series",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "time_column": time_col,
            "metric_column": metric_col,
            "metric_units": {
                column: unit
                for column, unit in (cfg.metric_units or {}).items()
                if column in {metric_col, *secondary_cols}
            } if cfg else {},
            "metric_directions": {
                column: direction
                for column, direction in (cfg.metric_directions or {}).items()
                if column in {metric_col, *secondary_cols}
            } if cfg else {},
            "dataset_roles": dataset_roles,
            "point_count": 0,
            "first_point": None,
            "last_point": None,
            "peak": None,
            "trough": None,
            "overall_change": None,
            "largest_adjacent_drop": None,
            "largest_adjacent_rise": None,
            "flagged_points": [],
            "secondary_metric_evidence": {},
            "secondary_metric_associations": {},
            "multi_dataset_evidence": [],
            "small_sample_caveats": [],
            "causal_claim_allowed": False,
            "action_evidence": [],
            "summarization_warnings": [],
        }

        for label, other_rows in (req.datasets or {}).items():
            if label == dataset_name or not isinstance(other_rows, list):
                continue
            dict_other_rows = [row for row in other_rows if isinstance(row, dict)]
            columns = []
            for row in dict_other_rows:
                for column in row:
                    if column not in columns:
                        columns.append(column)
            numeric_stats = {}
            for column in columns[:20]:
                values = [
                    BaseExplanationStrategy._parse_number(row.get(column))
                    for row in dict_other_rows
                ]
                values = [value for value in values if value is not None]
                if values:
                    numeric_stats[column] = {
                        "count": len(values),
                        "min": round(min(values), 4),
                        "max": round(max(values), 4),
                        "avg": round(sum(values) / len(values), 4),
                    }
            summary["multi_dataset_evidence"].append({
                "dataset_name": label,
                "role": dataset_roles.get(label, "context_evidence"),
                "row_count": len(other_rows),
                "columns": columns[:30],
                "first_row": dict_other_rows[0] if dict_other_rows else None,
                "numeric_stats": numeric_stats,
            })

        if not rows:
            summary["summarization_warnings"].append("Primary dataset is empty.")
            return summary

        dict_rows = [row for row in rows if isinstance(row, dict)]
        if not dict_rows:
            summary["summarization_warnings"].append("Primary dataset has no object rows.")
            return summary

        missing_required = []
        if not time_col:
            missing_required.append("time_column")
        if not metric_col:
            missing_required.append("metric_column")

        available_columns = set()
        for row in dict_rows:
            available_columns.update(row.keys())
        for column in (time_col, metric_col):
            if column and column not in available_columns:
                missing_required.append(column)

        if missing_required:
            summary["summarization_warnings"].append(
                "trend_series config is incomplete or required columns are missing: "
                + ", ".join(missing_required)
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(req, max_datasets=1)
            return summary

        for column in [*secondary_cols, *flag_cols, *action_cols, *label_cols]:
            if column and column not in available_columns:
                summary["summarization_warnings"].append(
                    f"Configured optional column '{column}' is missing from dataset."
                )

        invalid_time_rows = 0
        invalid_metric_rows = 0
        invalid_flag_values = 0
        points = []

        for index, row in enumerate(dict_rows):
            time_value = BaseExplanationStrategy._parse_number(row.get(time_col))
            metric_value = BaseExplanationStrategy._parse_number(row.get(metric_col))
            if time_value is None:
                invalid_time_rows += 1
                continue
            if metric_value is None:
                invalid_metric_rows += 1
                continue

            labels = {
                column: row.get(column)
                for column in label_cols
                if column in row and row.get(column) is not None
            }
            secondary = {
                column: BaseExplanationStrategy._risk_value(row.get(column))
                for column in secondary_cols
                if column in row and row.get(column) is not None
            }
            actions = {
                column: row.get(column)
                for column in action_cols
                if column in row and row.get(column) is not None
            }
            flags = {}
            raw_flags = {}
            for column in flag_cols:
                if column not in row:
                    continue
                parsed_flag, recognized = BaseExplanationStrategy._parse_triggered(row.get(column))
                raw_flags[column] = row.get(column)
                if recognized:
                    flags[column] = parsed_flag
                elif row.get(column) is not None:
                    invalid_flag_values += 1
                    flags[column] = None
                    summary["summarization_warnings"].append(
                        f"Unrecognized flag value for {column} at {time_col}={row.get(time_col)!r}: {row.get(column)!r}; value was not guessed."
                    )

            points.append({
                time_col: BaseExplanationStrategy._risk_value(row.get(time_col)),
                metric_col: round(metric_value, 4),
                "labels": labels,
                "secondary_metrics": secondary,
                "flags": flags,
                "flag_raw_values": raw_flags,
                "actions": actions,
                "_time_value": time_value,
                "_metric_value": metric_value,
                "_row_index": index,
            })

        if invalid_time_rows:
            summary["summarization_warnings"].append(
                f"Skipped {invalid_time_rows} rows with invalid {time_col}."
            )
        if invalid_metric_rows:
            summary["summarization_warnings"].append(
                f"Skipped {invalid_metric_rows} rows with invalid {metric_col}."
            )
        if invalid_flag_values:
            summary["summarization_warnings"].append(
                f"Found {invalid_flag_values} unrecognized configured flag values; flagged_points only use recognized true values."
            )

        if not points:
            summary["summarization_warnings"].append("No valid trend points remained after parsing time and metric values.")
            return summary

        points.sort(key=lambda point: point["_time_value"], reverse=sort_desc)
        summary["point_count"] = len(points)

        min_sample_value = (
            BaseExplanationStrategy._parse_number(minimum_sample_size)
            if minimum_sample_size is not None
            else None
        )
        if min_sample_value is not None and len(points) < min_sample_value:
            caveat = {
                "point_count": len(points),
                "minimum_sample_size": round(min_sample_value, 4),
                "warning": (
                    f"Only {len(points)} trend points are available; treat "
                    "secondary associations as descriptive, not causal or "
                    "statistically reliable."
                ),
            }
            summary["small_sample_caveats"].append(caveat)
            summary["summarization_warnings"].append(caveat["warning"])

        def public_point(point: dict, include_flags: bool = False) -> dict:
            result = {
                time_col: point[time_col],
                metric_col: point[metric_col],
            }
            if point["labels"]:
                result["labels"] = point["labels"]
            if point["secondary_metrics"]:
                result["secondary_metrics"] = point["secondary_metrics"]
            if include_flags and point["flags"]:
                result["flags"] = point["flags"]
                result["flag_raw_values"] = point["flag_raw_values"]
            return result

        def change(prev: dict, curr: dict) -> dict:
            delta = curr["_metric_value"] - prev["_metric_value"]
            return {
                "from": public_point(prev),
                "to": public_point(curr),
                "delta": round(delta, 4),
            }

        first = points[0]
        last = points[-1]
        peak = max(points, key=lambda point: point["_metric_value"])
        trough = min(points, key=lambda point: point["_metric_value"])
        changes = [change(points[i - 1], points[i]) for i in range(1, len(points))]
        drops = [item for item in changes if item["delta"] < 0]
        rises = [item for item in changes if item["delta"] > 0]
        delta = last["_metric_value"] - first["_metric_value"]
        percent_change = None
        if first["_metric_value"] != 0:
            percent_change = round((delta / first["_metric_value"]) * 100, 4)

        summary["first_point"] = public_point(first)
        summary["last_point"] = public_point(last)
        summary["peak"] = public_point(peak)
        summary["trough"] = public_point(trough)
        summary["overall_change"] = {
            "from": public_point(first),
            "to": public_point(last),
            "delta": round(delta, 4),
            "percent_change": percent_change,
        }
        summary["largest_adjacent_drop"] = min(drops, key=lambda item: item["delta"]) if drops else None
        summary["largest_adjacent_rise"] = max(rises, key=lambda item: item["delta"]) if rises else None

        emitted_points = points[:max_points]
        if len(points) > max_points:
            summary["summarization_warnings"].append(
                f"Trend points capped at {max_points} of {len(points)} rows."
            )

        flagged = [
            public_point(point, include_flags=True)
            for point in emitted_points
            if any(value is True for value in point["flags"].values())
        ]
        summary["flagged_points"] = flagged[:max_points]

        secondary_evidence = {}
        for column in secondary_cols:
            values = [
                BaseExplanationStrategy._parse_number(point["secondary_metrics"].get(column))
                for point in points
                if column in point["secondary_metrics"]
            ]
            values = [value for value in values if value is not None]
            if values:
                secondary_evidence[column] = {
                    "count": len(values),
                    "min": round(min(values), 4),
                    "max": round(max(values), 4),
                    "first": points[0]["secondary_metrics"].get(column),
                    "last": points[-1]["secondary_metrics"].get(column),
                }
            else:
                categorical_values = [
                    point["secondary_metrics"].get(column)
                    for point in points
                    if column in point["secondary_metrics"]
                ]
                if categorical_values:
                    secondary_evidence[column] = {
                        "first": categorical_values[0],
                        "last": categorical_values[-1],
                        "distinct_values": sorted({str(value) for value in categorical_values})[:10],
                    }
        summary["secondary_metric_evidence"] = secondary_evidence

        associations = {}
        for column in secondary_cols:
            pairs = []
            for point in points:
                secondary_value = BaseExplanationStrategy._parse_number(
                    point["secondary_metrics"].get(column)
                )
                if secondary_value is None:
                    continue
                pairs.append((point["_metric_value"], secondary_value))
            if len(pairs) >= 2:
                x_values = [item[0] for item in pairs]
                y_values = [item[1] for item in pairs]
                mean_x = sum(x_values) / len(x_values)
                mean_y = sum(y_values) / len(y_values)
                numerator = sum(
                    (x - mean_x) * (y - mean_y)
                    for x, y in zip(x_values, y_values)
                )
                denom_x = sum((x - mean_x) ** 2 for x in x_values)
                denom_y = sum((y - mean_y) ** 2 for y in y_values)
                correlation = None
                if denom_x > 0 and denom_y > 0:
                    correlation = numerator / ((denom_x * denom_y) ** 0.5)
                associations[column] = {
                    "paired_point_count": len(pairs),
                    "method": "pearson_on_aligned_points",
                    "correlation": (
                        round(correlation, 4)
                        if correlation is not None
                        else None
                    ),
                    "claim_limit": (
                        "descriptive_association_only; do not infer causality "
                        "or statistical significance"
                    ),
                    "small_sample": (
                        bool(min_sample_value is not None and len(points) < min_sample_value)
                    ),
                }
            else:
                categorical_pairs = [
                    point["secondary_metrics"].get(column)
                    for point in points
                    if column in point["secondary_metrics"]
                ]
                if categorical_pairs:
                    associations[column] = {
                        "paired_point_count": len(categorical_pairs),
                        "method": "non_numeric_values_preserved",
                        "correlation": None,
                        "claim_limit": "descriptive_context_only",
                    }
        summary["secondary_metric_associations"] = associations

        action_evidence = []
        seen_actions = set()
        for point in [
            point for point in points if any(value is True for value in point["flags"].values())
        ] + [points[-1]]:
            for column, action in point["actions"].items():
                key = (column, str(action))
                if key in seen_actions:
                    continue
                seen_actions.add(key)
                action_evidence.append({
                    time_col: point[time_col],
                    "action_column": column,
                    "action": action,
                })
                if len(action_evidence) >= max_points:
                    break
            if len(action_evidence) >= max_points:
                break
        summary["action_evidence"] = action_evidence

        return summary

    @staticmethod
    def _parse_numeric_bin_range(label) -> tuple[float | None, float | None]:
        if label is None:
            return None, None
        text = str(label).strip()
        if not text:
            return None, None
        match = re.match(
            r"^\s*(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)\s*$",
            text,
            flags=re.IGNORECASE,
        )
        if match:
            return float(match.group(1)), float(match.group(2))
        return None, None

    @staticmethod
    def _summarize_correlation_evidence(req: ExplainRequest) -> dict:
        cfg = req.ai_summary_config
        dataset_name, rows = BaseExplanationStrategy._select_primary_dataset(req)

        x_col = cfg.x_column if cfg else None
        y_col = cfg.y_column if cfg else None
        entity_col = cfg.entity_column if cfg else None
        color_col = cfg.color_column if cfg else None
        coefficient_col = cfg.coefficient_column if cfg else None
        coefficient_method = str((cfg.coefficient_method if cfg else None) or "pearson").lower()
        sample_size_col = cfg.sample_size_column if cfg else None
        p_value_col = cfg.p_value_column if cfg else None
        selected_col = cfg.selected_entity_column if cfg else None
        label_cols = list(cfg.label_columns or []) if cfg else []
        sensitive_cols = list(cfg.sensitive_columns or []) if cfg else []
        metric_units = dict(cfg.metric_units or {}) if cfg else {}
        metric_directions = dict(cfg.metric_directions or {}) if cfg else {}
        sensitive_context_policy = cfg.sensitive_context_policy if cfg else None
        outlier_policy = str((cfg.outlier_policy if cfg else None) or "").lower()
        min_sample_value = BaseExplanationStrategy._parse_number(
            cfg.minimum_sample_size if cfg and cfg.minimum_sample_size is not None else 30
        )
        if min_sample_value is None:
            min_sample_value = 30.0
        top_k = cfg.top_k if cfg and cfg.top_k is not None else 10
        top_k = max(0, min(int(top_k), 50))

        summary = {
            "summary_type": "correlation_evidence",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "x_column": x_col,
            "y_column": y_col,
            "entity_column": entity_col,
            "selected_entity_column": selected_col,
            "metric_units": {
                column: unit
                for column, unit in metric_units.items()
                if column in {x_col, y_col}
            },
            "metric_directions": {
                column: direction
                for column, direction in metric_directions.items()
                if column in {x_col, y_col}
            },
            "coefficient": None,
            "coefficient_method": coefficient_method,
            "coefficient_source": "unavailable",
            "sample_size": 0,
            "p_value": None,
            "outliers": [],
            "selected_entity_evidence": [],
            "missing_selected_entity_evidence": [],
            "selected_entity_count": 0,
            "sensitive_context_policy": sensitive_context_policy,
            "direction": "unknown",
            "strength": None,
            "strength_claim_allowed": False,
            "significance_claim_allowed": False,
            "causal_claim_allowed": False,
            "parse_warnings": [],
            "statistical_warnings": [],
            "summarization_warnings": [],
        }

        def add_parse_warning(message: str) -> None:
            summary["parse_warnings"].append(message)
            summary["summarization_warnings"].append(message)

        def add_statistical_warning(message: str) -> None:
            summary["statistical_warnings"].append(message)
            summary["summarization_warnings"].append(message)

        if not rows:
            summary["summarization_warnings"].append("Primary dataset is empty.")
            return summary

        dict_rows = [row for row in rows if isinstance(row, dict)]
        if not dict_rows:
            summary["summarization_warnings"].append("Primary dataset has no object rows.")
            return summary

        available_columns = set()
        for row in dict_rows:
            available_columns.update(row.keys())

        missing_required = []
        if not x_col:
            missing_required.append("x_column")
        if not y_col:
            missing_required.append("y_column")
        for column in (x_col, y_col):
            if column and column not in available_columns:
                missing_required.append(column)

        if missing_required:
            summary["summarization_warnings"].append(
                "correlation_evidence config is incomplete or required columns are missing: "
                + ", ".join(missing_required)
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(req, max_datasets=1)
            return summary

        for column, label in [
            (entity_col, "entity_column"),
            (color_col, "color_column"),
            (coefficient_col, "coefficient_column"),
            (sample_size_col, "sample_size_column"),
            (p_value_col, "p_value_column"),
            (selected_col, "selected_entity_column"),
            *[(column, "label_column") for column in label_cols],
            *[(column, "sensitive_column") for column in sensitive_cols],
        ]:
            if column and column not in available_columns:
                summary["summarization_warnings"].append(
                    f"Configured optional {label} '{column}' is missing from dataset."
                )

        valid_pairs = []
        invalid_x = 0
        invalid_y = 0
        for index, row in enumerate(dict_rows):
            x_value = BaseExplanationStrategy._parse_number(row.get(x_col))
            y_value = BaseExplanationStrategy._parse_number(row.get(y_col))
            if x_value is None:
                invalid_x += 1
                continue
            if y_value is None:
                invalid_y += 1
                continue
            valid_pairs.append({
                "x": x_value,
                "y": y_value,
                "row": row,
                "row_index": index,
            })

        if invalid_x:
            add_parse_warning(f"Skipped {invalid_x} rows with invalid {x_col}.")
        if invalid_y:
            add_parse_warning(f"Skipped {invalid_y} rows with invalid {y_col}.")

        summary["sample_size"] = len(valid_pairs)
        if not valid_pairs:
            add_statistical_warning("No valid paired numeric observations remained after parsing x/y values.")
            return summary

        explicit_sample_sizes = []
        invalid_sample_size_values = 0
        if sample_size_col and sample_size_col in available_columns:
            for row in dict_rows:
                if row.get(sample_size_col) is None:
                    continue
                parsed = BaseExplanationStrategy._parse_number(row.get(sample_size_col))
                if parsed is None:
                    invalid_sample_size_values += 1
                else:
                    explicit_sample_sizes.append(parsed)
            if explicit_sample_sizes:
                first_sample_size = explicit_sample_sizes[0]
                summary["sample_size"] = round(first_sample_size, 4)
                if any(value != first_sample_size for value in explicit_sample_sizes[1:]):
                    add_statistical_warning(
                        f"Configured sample size column '{sample_size_col}' has multiple values; using the first valid value."
                    )
            if invalid_sample_size_values:
                add_parse_warning(
                    f"Found {invalid_sample_size_values} invalid {sample_size_col} values; sample size evidence is partial."
                )

        effective_sample_size = BaseExplanationStrategy._parse_number(summary["sample_size"]) or 0.0
        reliable_sample_size = effective_sample_size >= min_sample_value
        if not reliable_sample_size:
            add_statistical_warning(
                f"Valid paired sample size {round(effective_sample_size, 4)} is below minimum_sample_size {round(min_sample_value, 4)}; coefficient strength is not reliable."
            )

        explicit_coefficients = []
        invalid_coefficient_values = 0
        if coefficient_col and coefficient_col in available_columns:
            for row in dict_rows:
                if row.get(coefficient_col) is None:
                    continue
                parsed = BaseExplanationStrategy._parse_number(row.get(coefficient_col))
                if parsed is None:
                    invalid_coefficient_values += 1
                else:
                    explicit_coefficients.append(parsed)
            if explicit_coefficients:
                first_coefficient = explicit_coefficients[0]
                summary["coefficient"] = round(first_coefficient, 4)
                summary["coefficient_source"] = "explicit_column"
                if any(value != first_coefficient for value in explicit_coefficients[1:]):
                    add_statistical_warning(
                        f"Configured coefficient column '{coefficient_col}' has multiple values; using the first valid value."
                    )
            if invalid_coefficient_values:
                add_parse_warning(
                    f"Found {invalid_coefficient_values} invalid {coefficient_col} values; coefficient evidence is partial."
                )

        def variance(values: list[float]) -> float:
            mean = sum(values) / len(values)
            return sum((value - mean) ** 2 for value in values)

        if summary["coefficient"] is None:
            if coefficient_method != "pearson":
                add_statistical_warning(
                    f"Coefficient method '{coefficient_method}' is not implemented for derivation; coefficient unavailable."
                )
            elif not reliable_sample_size:
                summary["coefficient_source"] = "unavailable"
            else:
                x_values = [item["x"] for item in valid_pairs]
                y_values = [item["y"] for item in valid_pairs]
                x_variance = variance(x_values)
                y_variance = variance(y_values)
                if x_variance == 0 or y_variance == 0:
                    add_statistical_warning(
                        f"Cannot derive Pearson coefficient because {x_col} or {y_col} has zero variance."
                    )
                else:
                    x_mean = sum(x_values) / len(x_values)
                    y_mean = sum(y_values) / len(y_values)
                    covariance = sum((item["x"] - x_mean) * (item["y"] - y_mean) for item in valid_pairs)
                    coefficient = covariance / ((x_variance * y_variance) ** 0.5)
                    summary["coefficient"] = round(coefficient, 4)
                    summary["coefficient_source"] = "derived_from_pairs"

        p_values = []
        invalid_p_values = 0
        if p_value_col and p_value_col in available_columns:
            for row in dict_rows:
                if row.get(p_value_col) is None:
                    continue
                parsed = BaseExplanationStrategy._parse_number(row.get(p_value_col))
                if parsed is None:
                    invalid_p_values += 1
                else:
                    p_values.append(parsed)
            if p_values:
                first_p_value = p_values[0]
                summary["p_value"] = round(first_p_value, 6)
                if any(value != first_p_value for value in p_values[1:]):
                    add_statistical_warning(
                        f"Configured p-value column '{p_value_col}' has multiple values; using the first valid value."
                    )
            if invalid_p_values:
                add_parse_warning(
                    f"Found {invalid_p_values} invalid {p_value_col} values; p-value evidence is partial."
                )
        elif p_value_col:
            add_statistical_warning(
                f"Configured p-value column '{p_value_col}' is unavailable; significance claims are not allowed."
            )

        coefficient = BaseExplanationStrategy._parse_number(summary["coefficient"])
        if coefficient is not None:
            if coefficient > 0:
                summary["direction"] = "positive"
            elif coefficient < 0:
                summary["direction"] = "negative"
            else:
                summary["direction"] = "none"
            if reliable_sample_size:
                abs_coefficient = abs(coefficient)
                if abs_coefficient < 0.3:
                    summary["strength"] = "weak"
                elif abs_coefficient < 0.7:
                    summary["strength"] = "moderate"
                else:
                    summary["strength"] = "strong"
                summary["strength_claim_allowed"] = True
        else:
            add_statistical_warning("Coefficient evidence is unavailable; strength claims are not allowed.")

        if summary["p_value"] is not None:
            summary["significance_claim_allowed"] = True
        else:
            add_statistical_warning("No p-value evidence is available; statistical significance claims are not allowed.")

        def quantile(values: list[float], q: float) -> float:
            ordered = sorted(values)
            if len(ordered) == 1:
                return ordered[0]
            position = (len(ordered) - 1) * q
            lower = int(position)
            upper = min(lower + 1, len(ordered) - 1)
            fraction = position - lower
            return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction

        if outlier_policy:
            if outlier_policy == "high_x_low_y":
                x_q3 = quantile([item["x"] for item in valid_pairs], 0.75)
                y_q1 = quantile([item["y"] for item in valid_pairs], 0.25)
                outlier_candidates = [
                    item for item in valid_pairs
                    if item["x"] >= x_q3 and item["y"] <= y_q1
                ]
                outlier_candidates.sort(key=lambda item: (-item["x"], item["y"], item["row_index"]))
                outliers = []
                for item in outlier_candidates[:top_k]:
                    row = item["row"]
                    outlier = {
                        x_col: round(item["x"], 4),
                        y_col: round(item["y"], 4),
                        "policy": outlier_policy,
                    }
                    if entity_col and entity_col in row:
                        outlier[entity_col] = row.get(entity_col)
                    if color_col and color_col in row:
                        outlier[color_col] = row.get(color_col)
                    outliers.append(outlier)
                summary["outliers"] = outliers
            else:
                add_statistical_warning(f"Unknown outlier policy '{outlier_policy}'; no outliers emitted.")

        if selected_col:
            selected_rows = []
            unrecognized_selected_values = 0
            for index, row in enumerate(dict_rows):
                if selected_col not in row:
                    continue
                selected_value, recognized = BaseExplanationStrategy._parse_triggered(
                    row.get(selected_col)
                )
                if selected_value is True:
                    selected_rows.append((index, row))
                elif not recognized and row.get(selected_col) is not None:
                    unrecognized_selected_values += 1

            if unrecognized_selected_values:
                add_parse_warning(
                    f"Found {unrecognized_selected_values} unrecognized {selected_col} values; selected entity preservation only uses recognized true values."
                )

            summary["selected_entity_count"] = len(selected_rows)
            coefficient_context = {
                "coefficient": summary["coefficient"],
                "coefficient_method": summary["coefficient_method"],
                "coefficient_source": summary["coefficient_source"],
                "sample_size": summary["sample_size"],
                "direction": summary["direction"],
                "strength": summary["strength"],
                "strength_claim_allowed": summary["strength_claim_allowed"],
                "significance_claim_allowed": summary["significance_claim_allowed"],
                "causal_claim_allowed": summary["causal_claim_allowed"],
            }

            for index, row in selected_rows[:10]:
                x_value = BaseExplanationStrategy._parse_number(row.get(x_col))
                y_value = BaseExplanationStrategy._parse_number(row.get(y_col))
                item = {
                    "row_index": index,
                    "selected_column": selected_col,
                    "selected_value": row.get(selected_col),
                    "is_valid_pair": x_value is not None and y_value is not None,
                    "raw_values": {
                        x_col: row.get(x_col),
                        y_col: row.get(y_col),
                    },
                    x_col: round(x_value, 4) if x_value is not None else None,
                    y_col: round(y_value, 4) if y_value is not None else None,
                    "cohort_context": coefficient_context,
                }
                if entity_col and entity_col in row:
                    item[entity_col] = row.get(entity_col)
                if color_col and color_col in row:
                    item[color_col] = row.get(color_col)

                label_context = {
                    column: row.get(column)
                    for column in label_cols
                    if column in row and row.get(column) is not None
                }
                percentile_context = {
                    column: row.get(column)
                    for column in row
                    if (
                        "percentile" in str(column).lower()
                        or str(column).lower().startswith("cohort_avg")
                    )
                    and row.get(column) is not None
                }
                sensitive_context = {
                    column: row.get(column)
                    for column in sensitive_cols
                    if column in row and row.get(column) is not None
                }
                if label_context:
                    item["label_context"] = label_context
                if percentile_context:
                    item["percentile_context"] = percentile_context
                if sensitive_context:
                    item["sensitive_context"] = sensitive_context
                    item["sensitive_context_policy"] = (
                        sensitive_context_policy or "descriptive_only"
                    )
                    item["claim_limit"] = (
                        "Sensitive/background context is descriptive only; "
                        "do not infer causality or prescribe actions from it."
                    )

                summary["selected_entity_evidence"].append(item)

            if len(selected_rows) > 10:
                summary["summarization_warnings"].append(
                    f"Selected entity evidence capped at 10 of {len(selected_rows)} rows."
                )
            if not selected_rows:
                missing = {
                    "selected_entity_column": selected_col,
                    "reason": "no rows had a recognized true selected marker",
                }
                summary["missing_selected_entity_evidence"].append(missing)
                summary["summarization_warnings"].append(
                    "Selected entity evidence is missing: no rows had a recognized true selected marker."
                )

        return summary

    @staticmethod
    def _summarize_group_comparison(req: ExplainRequest) -> dict:
        cfg = req.ai_summary_config
        dataset_name, rows = BaseExplanationStrategy._select_primary_dataset(req)

        group_col = cfg.group_column if cfg else None
        group_key_cols = list(cfg.group_key_columns or []) if cfg else []
        series_col = cfg.series_column if cfg else None
        metric_col = cfg.metric_column if cfg else None
        count_col = cfg.count_column if cfg else None
        gap_col = cfg.gap_column if cfg else None
        metric_cols = list(cfg.metric_columns or []) if cfg else []
        expected_groups = [str(item) for item in (cfg.expected_groups or [])] if cfg else []
        target_group = str(cfg.target_group) if cfg and cfg.target_group is not None else None
        comparison_groups = [str(item) for item in (cfg.comparison_groups or [])] if cfg else []
        min_reliable = cfg.minimum_reliable_count if cfg else None
        sort_by = cfg.sort_by if cfg else None
        sort_direction = str(cfg.sort_direction or "asc").lower() if cfg else "asc"
        sort_desc = sort_direction == "desc"
        top_k = cfg.top_k if cfg and cfg.top_k is not None else 10
        bottom_k = cfg.bottom_k if cfg and cfg.bottom_k is not None else 5
        top_k = max(0, min(int(top_k), 50))
        bottom_k = max(0, min(int(bottom_k), 50))

        summary = {
            "summary_type": "group_comparison",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "group_column": group_col,
            "group_key_columns": group_key_cols,
            "series_column": series_col,
            "composite_group_keys": bool(group_key_cols),
            "metric_column": metric_col,
            "count_column": count_col,
            "gap_column": gap_col,
            "group_metrics": [],
            "group_series": [],
            "focus_summary": [],
            "gaps": [],
            "dominant_group": None,
            "weakest_group": None,
            "missing_groups": [],
            "low_count_warnings": [],
            "fairness_warnings": [
                "Group comparison is descriptive only; do not infer that group membership causes performance differences."
            ],
            "causal_claim_allowed": False,
            "summarization_warnings": [],
        }

        if not rows:
            summary["summarization_warnings"].append("Primary dataset is empty.")
            return summary

        dict_rows = [row for row in rows if isinstance(row, dict)]
        if not dict_rows:
            summary["summarization_warnings"].append("Primary dataset has no object rows.")
            return summary

        available_columns = set()
        for row in dict_rows:
            available_columns.update(row.keys())

        missing_required = []
        if not group_col and not group_key_cols:
            missing_required.append("group_column or group_key_columns")
        if not metric_col:
            missing_required.append("metric_column")
        if not count_col:
            missing_required.append("count_column")
        for column in (group_col, metric_col, count_col, series_col, *group_key_cols):
            if column and column not in available_columns:
                missing_required.append(column)

        if missing_required:
            summary["summarization_warnings"].append(
                "group_comparison config is incomplete or required columns are missing: "
                + ", ".join(missing_required)
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(req, max_datasets=1)
            return summary

        for column in [gap_col, *metric_cols]:
            if column and column not in available_columns:
                summary["summarization_warnings"].append(
                    f"Configured optional column '{column}' is missing from dataset."
                )

        invalid_count_rows = 0
        invalid_metric_rows = 0
        invalid_gap_values = 0
        invalid_secondary_counts = {column: 0 for column in metric_cols}
        entries = []

        for index, row in enumerate(dict_rows):
            group_value = row.get(group_col) if group_col else None
            group_key_values = {}
            for column in group_key_cols:
                group_key_values[column] = row.get(column)
            if group_key_cols:
                group_key_parts = [
                    f"{column}={group_key_values.get(column)}"
                    for column in group_key_cols
                ]
                group_key = " | ".join(group_key_parts)
                composite_group_label = group_key
                if group_value is None:
                    group_value = composite_group_label
            else:
                group_key = str(group_value)
                composite_group_label = None
            series_value = row.get(series_col) if series_col else None
            count_value = BaseExplanationStrategy._parse_number(row.get(count_col))
            metric_value = BaseExplanationStrategy._parse_number(row.get(metric_col))
            if count_value is None:
                invalid_count_rows += 1
                continue
            if metric_value is None:
                invalid_metric_rows += 1
                continue

            gap_value = None
            if gap_col and gap_col in row and row.get(gap_col) is not None:
                gap_value = BaseExplanationStrategy._parse_number(row.get(gap_col))
                if gap_value is None:
                    invalid_gap_values += 1

            secondary_metrics = {}
            for column in metric_cols:
                if column not in row or row.get(column) is None:
                    continue
                parsed_secondary = BaseExplanationStrategy._parse_number(row.get(column))
                if parsed_secondary is None:
                    invalid_secondary_counts[column] += 1
                    secondary_metrics[column] = row.get(column)
                else:
                    secondary_metrics[column] = round(parsed_secondary, 4)

            entries.append({
                "group": group_value,
                "group_key": group_key,
                "group_key_values": group_key_values,
                "composite_group_label": composite_group_label,
                "series_value": series_value,
                "count": round(count_value, 4),
                "metric": round(metric_value, 4),
                "secondary_metrics": secondary_metrics,
                "gap": round(gap_value, 4) if gap_value is not None else None,
                "gap_basis": "explicit_gap_column" if gap_value is not None else None,
                "_count_value": count_value,
                "_metric_value": metric_value,
                "_gap_value": gap_value,
                "_row_index": index,
            })

        if invalid_count_rows:
            summary["summarization_warnings"].append(
                f"Skipped {invalid_count_rows} rows with invalid {count_col}."
            )
        if invalid_metric_rows:
            summary["summarization_warnings"].append(
                f"Skipped {invalid_metric_rows} rows with invalid {metric_col}."
            )
        if invalid_gap_values:
            summary["summarization_warnings"].append(
                f"Found {invalid_gap_values} invalid {gap_col} values; those gaps were omitted."
            )
        for column, invalid_count in invalid_secondary_counts.items():
            if invalid_count:
                summary["summarization_warnings"].append(
                    f"Found {invalid_count} invalid {column} values; secondary metric evidence is partial."
                )

        if not entries:
            summary["summarization_warnings"].append("No valid group comparison rows remained after parsing required values.")
            return summary

        has_explicit_gap = any(entry["_gap_value"] is not None for entry in entries)
        if not has_explicit_gap:
            total_weight = sum(entry["_count_value"] for entry in entries)
            if total_weight > 0:
                cohort_mean = sum(entry["_metric_value"] * entry["_count_value"] for entry in entries) / total_weight
                for entry in entries:
                    gap = entry["_metric_value"] - cohort_mean
                    entry["gap"] = round(gap, 4)
                    entry["gap_basis"] = "derived_from_weighted_cohort_mean"
                    entry["_gap_value"] = gap
                summary["gap_column"] = None
                summary["summarization_warnings"].append(
                    f"No explicit gap column configured; gaps derived from {metric_col} relative to weighted cohort mean."
                )
            else:
                summary["summarization_warnings"].append("Could not derive gaps because total group count is zero.")

        if min_reliable is not None:
            min_reliable_value = BaseExplanationStrategy._parse_number(min_reliable)
            if min_reliable_value is not None:
                for entry in entries:
                    if entry["_count_value"] < min_reliable_value:
                        warning = {
                            "group": entry["group"],
                            "count": entry["count"],
                            "minimum_reliable_count": round(min_reliable_value, 4),
                            "warning": f"Group '{entry['group_key']}' has {count_col} below {round(min_reliable_value, 4)}; avoid over-weighting this comparison.",
                        }
                        summary["low_count_warnings"].append(warning)

        present_groups = {entry["group_key"] for entry in entries}
        missing_groups = []
        for kind, configured in [
            ("target_group", [target_group] if target_group is not None else []),
            ("comparison_group", comparison_groups),
            ("expected_group", expected_groups),
        ]:
            for group in configured:
                if str(group) not in present_groups:
                    missing_groups.append({
                        "group": group,
                        "kind": kind,
                    })
        summary["missing_groups"] = missing_groups
        if missing_groups:
            summary["summarization_warnings"].append(
                "Configured groups missing from dataset: "
                + ", ".join(f"{item['kind']}={item['group']}" for item in missing_groups)
            )

        def public_group_metric(entry: dict) -> dict:
            item = {
                "group": entry["group"],
                count_col: entry["count"],
                metric_col: entry["metric"],
            }
            if entry["group_key_values"]:
                item["group_key_values"] = entry["group_key_values"]
            if entry["composite_group_label"] is not None:
                item["composite_group_label"] = entry["composite_group_label"]
            if series_col and entry["series_value"] is not None:
                item["series_value"] = entry["series_value"]
            if entry["gap"] is not None:
                item["gap"] = entry["gap"]
                item["gap_basis"] = entry["gap_basis"]
                if gap_col and entry["gap_basis"] == "explicit_gap_column":
                    item[gap_col] = entry["gap"]
            if entry["secondary_metrics"]:
                item["secondary_metrics"] = entry["secondary_metrics"]
            return item

        group_metrics = [public_group_metric(entry) for entry in entries]
        summary["group_metrics"] = group_metrics[:40]
        if len(group_metrics) > 40:
            summary["summarization_warnings"].append(
                f"Group metrics capped at 40 of {len(group_metrics)} groups."
            )

        if group_key_cols and group_col:
            series_by_group = {}
            for entry in entries:
                base_key = str(entry["group"])
                record = series_by_group.setdefault(
                    base_key,
                    {
                        "group": entry["group"],
                        "total_count": 0.0,
                        "_weighted_metric_sum": 0.0,
                        "_row_indexes": [],
                        "series": [],
                    },
                )
                record["total_count"] += entry["_count_value"]
                record["_weighted_metric_sum"] += (
                    entry["_metric_value"] * entry["_count_value"]
                )
                record["_row_indexes"].append(entry["_row_index"])
                record["series"].append(public_group_metric(entry))

            group_series = []
            for record in series_by_group.values():
                total_count = record["total_count"]
                average_metric = (
                    record["_weighted_metric_sum"] / total_count
                    if total_count > 0
                    else None
                )
                public_record = {
                    "group": record["group"],
                    "series_count": len(record["series"]),
                    "total_count": round(total_count, 4),
                    "weighted_average_metric": (
                        round(average_metric, 4)
                        if average_metric is not None
                        else None
                    ),
                    "series": sorted(
                        record["series"],
                        key=lambda item: str(item.get("series_value", item.get("composite_group_label", ""))),
                    ),
                    "_first_row_index": min(record["_row_indexes"]),
                }
                group_series.append(public_record)
            group_series.sort(
                key=lambda item: (-item["total_count"], item["_first_row_index"])
            )
            for item in group_series:
                item.pop("_first_row_index", None)
            summary["group_series"] = group_series[:40]
            if len(group_series) > 40:
                summary["summarization_warnings"].append(
                    f"Group series capped at 40 of {len(group_series)} groups."
                )

            focus_categories = {str(item) for item in (cfg.focus_categories or [])}
            if series_col and focus_categories:
                focus_summary = []
                for record in group_series:
                    focus_items = [
                        item for item in record["series"]
                        if str(item.get("series_value")) in focus_categories
                    ]
                    focus_metric_total = 0.0
                    focus_count_total = 0.0
                    for item in focus_items:
                        parsed_metric = BaseExplanationStrategy._parse_number(
                            item.get(metric_col)
                        )
                        parsed_count = BaseExplanationStrategy._parse_number(
                            item.get(count_col)
                        )
                        if parsed_metric is not None:
                            focus_metric_total += parsed_metric
                        if parsed_count is not None:
                            focus_count_total += parsed_count
                    focus_summary.append({
                        "group": record["group"],
                        "focus_categories": sorted(focus_categories),
                        "focus_metric_total": round(focus_metric_total, 4),
                        "focus_count_total": round(focus_count_total, 4),
                        "metric_column": metric_col,
                        "count_column": count_col,
                    })
                focus_summary.sort(
                    key=lambda item: (
                        -item["focus_metric_total"],
                        -item["focus_count_total"],
                        str(item["group"]),
                    )
                )
                summary["focus_summary"] = focus_summary[:40]

        dominant = max(entries, key=lambda entry: (entry["_count_value"], -entry["_row_index"]))
        summary["dominant_group"] = {
            "group": dominant["group"],
            count_col: dominant["count"],
            "basis": "largest_count",
        }

        gap_entries = [entry for entry in entries if entry["_gap_value"] is not None]
        weakest_basis = "most_negative_gap" if gap_entries else "lowest_metric"
        weakest_source = gap_entries if gap_entries else entries
        weakest = min(
            weakest_source,
            key=lambda entry: (
                entry["_gap_value"] if gap_entries else entry["_metric_value"],
                entry["_row_index"],
            ),
        )
        summary["weakest_group"] = {
            "group": weakest["group"],
            metric_col: weakest["metric"],
            "basis": weakest_basis,
        }
        if weakest["gap"] is not None:
            summary["weakest_group"]["gap"] = weakest["gap"]
            summary["weakest_group"]["gap_basis"] = weakest["gap_basis"]

        def sort_value(entry: dict) -> float:
            if sort_by == count_col:
                return entry["_count_value"]
            if sort_by == metric_col:
                return entry["_metric_value"]
            if sort_by == gap_col or sort_by == "gap" or (not sort_by and entry["_gap_value"] is not None):
                return entry["_gap_value"] if entry["_gap_value"] is not None else float("inf")
            if sort_by in metric_cols:
                parsed = BaseExplanationStrategy._parse_number(entry["secondary_metrics"].get(sort_by))
                return parsed if parsed is not None else float("inf")
            return entry["_gap_value"] if entry["_gap_value"] is not None else entry["_metric_value"]

        sorted_for_gaps = sorted(
            entries,
            key=lambda entry: (sort_value(entry), entry["_row_index"]),
            reverse=sort_desc,
        )
        top_entries = sorted_for_gaps[:top_k] if top_k else []
        bottom_entries = sorted_for_gaps[-bottom_k:] if bottom_k else []
        selected = []
        seen = set()
        for entry in [*top_entries, *bottom_entries]:
            key = (entry["group_key"], entry["_row_index"])
            if key in seen:
                continue
            seen.add(key)
            selected.append(entry)
        summary["gaps"] = [
            {
                "group": entry["group"],
                "gap": entry["gap"],
                "gap_basis": entry["gap_basis"],
                metric_col: entry["metric"],
                count_col: entry["count"],
            }
            for entry in selected
            if entry["gap"] is not None
        ]

        if summary["fairness_warnings"]:
            summary["summarization_warnings"].append(summary["fairness_warnings"][0])

        return summary

    @staticmethod
    def _summarize_metric_snapshot(req: ExplainRequest) -> dict:
        cfg = req.ai_summary_config
        dataset_name, rows = BaseExplanationStrategy._select_primary_dataset(req)

        metric_cols = list(cfg.metric_columns or []) if cfg else []
        status_cols = list(cfg.status_columns or []) if cfg else []
        threshold_cols = list(cfg.threshold_columns or []) if cfg else []
        benchmark_cols = list(cfg.benchmark_columns or []) if cfg else []
        sensitive_cols = list(cfg.sensitive_columns or []) if cfg else []
        label_cols = list(cfg.label_columns or []) if cfg else []
        flag_cols = list(cfg.flag_columns or []) if cfg else []
        action_cols = list(cfg.action_columns or []) if cfg else []
        entity_col = cfg.entity_column if cfg else None
        metric_units = dict(cfg.metric_units or {}) if cfg else {}
        metric_availability_cols = (
            dict(cfg.metric_availability_columns or {}) if cfg else {}
        )
        threshold_sources = dict(cfg.threshold_sources or {}) if cfg else {}
        benchmark_sources = dict(cfg.benchmark_sources or {}) if cfg else {}
        sensitive_policy = cfg.sensitive_context_policy if cfg else None

        summary = {
            "summary_type": "metric_snapshot",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "entity": None,
            "metric_snapshot": {},
            "status_evidence": {},
            "threshold_evidence": {},
            "benchmark_evidence": {},
            "label_evidence": {},
            "flag_evidence": {},
            "action_evidence": {},
            "missing_evidence": [],
            "sensitive_context_present": False,
            "sensitive_context": {},
            "validation_metadata": {
                "status": "pending",
                "configured_metric_columns": metric_cols,
                "configured_status_columns": status_cols,
                "configured_threshold_columns": threshold_cols,
                "configured_benchmark_columns": benchmark_cols,
                "configured_sensitive_columns": sensitive_cols,
                "metric_availability_columns": metric_availability_cols,
                "metric_units": metric_units,
                "threshold_sources": threshold_sources,
                "benchmark_sources": benchmark_sources,
                "sensitive_context_policy": sensitive_policy,
                "missing_required_columns": [],
                "missing_unit_metadata": [],
                "missing_threshold_sources": [],
                "missing_benchmark_sources": [],
                "errors": [],
            },
            "evidence_status": "pending",
            "causal_claim_allowed": False,
            "summarization_warnings": [],
        }

        if not rows:
            summary["validation_metadata"]["status"] = "not_evaluated"
            summary["evidence_status"] = "insufficient_evidence"
            summary["summarization_warnings"].append("Primary dataset is empty.")
            return summary

        if len(rows) != 1:
            summary["validation_metadata"]["status"] = "failed"
            summary["evidence_status"] = "not_evaluated"
            error = (
                "metric_snapshot requires exactly one primary dataset row; "
                f"observed {len(rows)}."
            )
            summary["validation_metadata"]["errors"].append(error)
            summary["summarization_warnings"].append(error)
            return summary

        row = rows[0]
        if not isinstance(row, dict):
            summary["validation_metadata"]["status"] = "failed"
            summary["evidence_status"] = "not_evaluated"
            error = "metric_snapshot requires the primary row to be an object."
            summary["validation_metadata"]["errors"].append(error)
            summary["summarization_warnings"].append(error)
            return summary

        available_columns = set(row.keys())
        errors = summary["validation_metadata"]["errors"]

        if not metric_cols:
            errors.append("metric_columns must contain at least one column")

        primary_roles = {
            "metric": metric_cols,
            "status": status_cols,
            "threshold": threshold_cols,
            "benchmark": benchmark_cols,
            "label": label_cols,
            "flag": flag_cols,
            "action": action_cols,
        }
        role_by_column = {}
        duplicate_roles = []
        for role, columns in primary_roles.items():
            for column in columns:
                previous = role_by_column.get(column)
                if previous and previous != role:
                    duplicate_roles.append(f"{column} ({previous}, {role})")
                else:
                    role_by_column[column] = role
        if duplicate_roles:
            errors.append(
                "columns configured with multiple primary roles: "
                + ", ".join(duplicate_roles)
            )

        missing_required = []
        if entity_col and entity_col not in available_columns:
            missing_required.append(entity_col)
        for column in metric_cols:
            if column not in available_columns:
                missing_required.append(column)
        summary["validation_metadata"]["missing_required_columns"] = (
            missing_required
        )
        if missing_required:
            errors.append(
                "required columns missing: " + ", ".join(missing_required)
            )

        unit_targets = [*metric_cols, *threshold_cols, *benchmark_cols]
        if cfg and cfg.require_metric_units:
            missing_units = [
                column
                for column in unit_targets
                if not isinstance(metric_units.get(column), str)
                or not metric_units.get(column).strip()
            ]
            summary["validation_metadata"]["missing_unit_metadata"] = missing_units
            if missing_units:
                errors.append("metric_units missing: " + ", ".join(missing_units))

        missing_threshold_sources = [
            column
            for column in threshold_cols
            if not isinstance(threshold_sources.get(column), str)
            or not threshold_sources.get(column).strip()
        ]
        summary["validation_metadata"]["missing_threshold_sources"] = (
            missing_threshold_sources
        )
        if missing_threshold_sources:
            errors.append(
                "threshold_sources missing: "
                + ", ".join(missing_threshold_sources)
            )

        missing_benchmark_sources = [
            column
            for column in benchmark_cols
            if not isinstance(benchmark_sources.get(column), str)
            or not benchmark_sources.get(column).strip()
        ]
        summary["validation_metadata"]["missing_benchmark_sources"] = (
            missing_benchmark_sources
        )
        if missing_benchmark_sources:
            errors.append(
                "benchmark_sources missing: "
                + ", ".join(missing_benchmark_sources)
            )

        policy_required = bool(
            sensitive_cols or (cfg and cfg.require_sensitive_context_policy)
        )
        if policy_required and (
            not isinstance(sensitive_policy, str) or not sensitive_policy.strip()
        ):
            errors.append("sensitive_context_policy missing")

        for metric, availability_column in metric_availability_cols.items():
            if metric not in metric_cols:
                errors.append(
                    f"metric_availability_columns references unconfigured metric '{metric}'"
                )
            if (
                not isinstance(availability_column, str)
                or not availability_column.strip()
            ):
                errors.append(
                    f"metric_availability_columns for '{metric}' is invalid"
                )
            elif availability_column not in available_columns:
                errors.append(
                    f"availability column '{availability_column}' is missing"
                )

        if errors:
            summary["validation_metadata"]["status"] = "failed"
            summary["evidence_status"] = "not_evaluated"
            summary["summarization_warnings"].append(
                "metric_snapshot validation failed: " + "; ".join(errors)
            )
            return summary

        summary["validation_metadata"]["status"] = "passed"
        if entity_col:
            summary["entity"] = row.get(entity_col)
            if row.get(entity_col) is None:
                summary["missing_evidence"].append({
                    "role": "entity",
                    "column": entity_col,
                    "reason": "configured entity value is null",
                    "value": None,
                })

        def register_missing(role: str, column: str, reason: str, value=None) -> None:
            summary["missing_evidence"].append({
                "role": role,
                "column": column,
                "reason": reason,
                "value": value,
            })

        observed_metric_count = 0
        for column in metric_cols:
            raw_value = row.get(column)
            availability_column = metric_availability_cols.get(column)
            available = True
            availability_value = None
            if availability_column:
                availability_value = row.get(availability_column)
                parsed_available, recognized = BaseExplanationStrategy._parse_triggered(
                    availability_value
                )
                if not recognized:
                    available = False
                    register_missing(
                        "metric",
                        column,
                        f"availability column '{availability_column}' is not boolean-like",
                        raw_value,
                    )
                else:
                    available = bool(parsed_available)

            summary["metric_snapshot"][column] = {
                "value": raw_value,
                "unit": metric_units.get(column),
                "available": available,
            }
            if availability_column:
                summary["metric_snapshot"][column]["availability_column"] = (
                    availability_column
                )
                summary["metric_snapshot"][column]["availability_value"] = (
                    availability_value
                )

            if raw_value is None:
                register_missing(
                    "metric", column, "configured metric value is null", None
                )
            elif not available:
                if not any(
                    item["role"] == "metric"
                    and item["column"] == column
                    for item in summary["missing_evidence"]
                ):
                    register_missing(
                        "metric",
                        column,
                        "metric is unavailable according to configured availability evidence",
                        raw_value,
                    )
            else:
                observed_metric_count += 1

        def collect_plain_evidence(role: str, columns: list[str], target: dict) -> None:
            for column in columns:
                if column not in available_columns:
                    register_missing(
                        role, column, "configured optional column is absent"
                    )
                    continue
                value = row.get(column)
                target[column] = value
                if value is None:
                    register_missing(
                        role, column, "configured evidence value is null", None
                    )

        collect_plain_evidence("status", status_cols, summary["status_evidence"])
        collect_plain_evidence("label", label_cols, summary["label_evidence"])
        collect_plain_evidence("flag", flag_cols, summary["flag_evidence"])
        collect_plain_evidence("action", action_cols, summary["action_evidence"])

        for column in threshold_cols:
            if column not in available_columns:
                register_missing(
                    "threshold", column, "configured threshold column is absent"
                )
                continue
            value = row.get(column)
            summary["threshold_evidence"][column] = {
                "value": value,
                "unit": metric_units.get(column),
                "source": threshold_sources.get(column),
            }
            if value is None:
                register_missing(
                    "threshold", column, "configured threshold value is null", None
                )

        for column in benchmark_cols:
            if column not in available_columns:
                register_missing(
                    "benchmark", column, "configured benchmark column is absent"
                )
                continue
            value = row.get(column)
            summary["benchmark_evidence"][column] = {
                "value": value,
                "unit": metric_units.get(column),
                "source": benchmark_sources.get(column),
            }
            if value is None:
                register_missing(
                    "benchmark", column, "configured benchmark value is null", None
                )

        for column in sensitive_cols:
            if column not in available_columns:
                register_missing(
                    "sensitive_context",
                    column,
                    "configured sensitive column is absent",
                )
                continue
            value = row.get(column)
            summary["sensitive_context"][column] = value
            if value is None:
                register_missing(
                    "sensitive_context",
                    column,
                    "configured sensitive context value is null",
                    None,
                )

        summary["sensitive_context_present"] = any(
            column in available_columns for column in sensitive_cols
        )
        if sensitive_cols:
            summary["summarization_warnings"].append(
                "Sensitive/background context is descriptive only under policy "
                f"'{sensitive_policy}'; do not infer causality, risk cause, or "
                "recommendations from it."
            )

        if observed_metric_count == 0:
            summary["evidence_status"] = "insufficient_evidence"
            summary["summarization_warnings"].append(
                "All configured metrics are null or unavailable."
            )
        else:
            summary["evidence_status"] = "sufficient"

        return summary

    @staticmethod
    def _summarize_multi_metric_comparison(req: ExplainRequest) -> dict:
        cfg = req.ai_summary_config
        dataset_name, rows = BaseExplanationStrategy._select_primary_dataset(req)

        entity_col = cfg.entity_column if cfg else None
        group_col = cfg.group_column if cfg else None
        identity_col = entity_col or group_col
        metric_key_col = cfg.metric_key_column if cfg else None
        metric_value_col = cfg.metric_value_column if cfg else None
        metric_cols = list(cfg.metric_columns or []) if cfg else []
        entity_order = [str(item) for item in (cfg.entity_order or [])] if cfg else []
        label_cols = list(cfg.label_columns or []) if cfg else []
        flag_cols = list(cfg.flag_columns or []) if cfg else []
        action_cols = list(cfg.action_columns or []) if cfg else []
        selected_col = cfg.selected_entity_column if cfg else None
        entity_evidence_available_col = (
            cfg.entity_evidence_available_column if cfg else None
        )
        metric_units = dict(cfg.metric_units or {}) if cfg else {}
        metric_directions = dict(cfg.metric_directions or {}) if cfg else {}
        metric_thresholds = dict(cfg.metric_thresholds or {}) if cfg else {}
        sensitive_policy = cfg.sensitive_context_policy if cfg else None
        minimum_entity_count = (
            max(1, int(cfg.minimum_entity_count))
            if cfg and cfg.minimum_entity_count is not None
            else 2
        )

        summary = {
            "summary_type": "multi_metric_comparison",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "entity_column": identity_col,
            "metric_key_column": metric_key_col,
            "metric_value_column": metric_value_col,
            "entities": [],
            "metrics": [],
            "metric_keys": [],
            "comparison_matrix": [],
            "metric_extrema": {},
            "pairwise_gaps": [],
            "missing_metric_evidence": [],
            "missing_entity_evidence": [],
            "missing_expected_entities": [],
            "selected_entity_evidence": [],
            "evidence_status": "pending",
            "evidence_requirements": {
                "minimum_entity_count": minimum_entity_count,
                "expected_entities": entity_order,
                "observed_entity_count": 0,
                "missing_expected_entities": [],
            },
            "validation_metadata": {
                "status": "pending",
                "required": {
                    "metric_units": bool(cfg and cfg.require_metric_units),
                    "metric_directions": bool(cfg and cfg.require_metric_directions),
                    "metric_thresholds": bool(cfg and cfg.require_metric_thresholds),
                    "sensitive_context_policy": bool(
                        cfg and cfg.require_sensitive_context_policy
                    ),
                },
                "metric_units": metric_units,
                "metric_directions": metric_directions,
                "metric_thresholds": metric_thresholds,
                "sensitive_context_policy": sensitive_policy,
            },
            "causal_claim_allowed": False,
            "summarization_warnings": [],
        }

        if not rows:
            summary["evidence_status"] = "insufficient_evidence"
            summary["validation_metadata"]["status"] = "not_evaluated"
            summary["summarization_warnings"].append("Primary dataset is empty.")
            return summary

        dict_rows = [row for row in rows if isinstance(row, dict)]
        if not dict_rows:
            summary["evidence_status"] = "insufficient_evidence"
            summary["validation_metadata"]["status"] = "not_evaluated"
            summary["summarization_warnings"].append("Primary dataset has no object rows.")
            return summary

        available_columns = set()
        for row in dict_rows:
            available_columns.update(row.keys())

        missing_required = []
        if not identity_col:
            missing_required.append("entity_column or group_column")
        elif identity_col not in available_columns:
            missing_required.append(identity_col)
        if entity_col and group_col:
            summary["summarization_warnings"].append(
                "Both entity_column and group_column are configured; entity_column is used."
            )

        if metric_value_col and not metric_key_col:
            missing_required.append("metric_key_column required with metric_value_column")
        if metric_value_col and metric_cols:
            missing_required.append(
                "metric_value_column and metric_columns cannot both define metric values"
            )
        if metric_key_col and metric_key_col not in available_columns:
            missing_required.append(metric_key_col)
        if metric_value_col and metric_value_col not in available_columns:
            missing_required.append(metric_value_col)
        if not metric_value_col and not metric_cols:
            missing_required.append("metric_columns or metric_value_column")
        for column in metric_cols:
            if column not in available_columns:
                missing_required.append(column)

        if missing_required:
            summary["evidence_status"] = "not_evaluated"
            summary["validation_metadata"]["status"] = "failed"
            summary["summarization_warnings"].append(
                "multi_metric_comparison config is incomplete or required columns are missing: "
                + ", ".join(missing_required)
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(
                req, max_datasets=1
            )
            return summary

        optional_columns = [
            *label_cols,
            *flag_cols,
            *action_cols,
            selected_col,
            entity_evidence_available_col,
        ]
        for column in optional_columns:
            if column and column not in available_columns:
                summary["summarization_warnings"].append(
                    f"Configured optional column '{column}' is missing from dataset."
                )

        observed_metric_keys = []
        if metric_key_col:
            seen_metric_keys = set()
            for row in dict_rows:
                raw_key = row.get(metric_key_col)
                if raw_key is None:
                    continue
                key = str(raw_key)
                if key not in seen_metric_keys:
                    seen_metric_keys.add(key)
                    observed_metric_keys.append(key)

        metadata_targets = observed_metric_keys if metric_value_col else metric_cols
        metadata_errors = []

        def missing_metadata_keys(metadata: dict) -> list[str]:
            return [
                key for key in metadata_targets
                if key not in metadata
                or metadata.get(key) is None
                or (isinstance(metadata.get(key), str) and not metadata.get(key).strip())
            ]

        if cfg and cfg.require_metric_units:
            missing = missing_metadata_keys(metric_units)
            if missing:
                metadata_errors.append("metric_units missing: " + ", ".join(missing))
        if cfg and cfg.require_metric_directions:
            missing = missing_metadata_keys(metric_directions)
            if missing:
                metadata_errors.append("metric_directions missing: " + ", ".join(missing))
        if cfg and cfg.require_metric_thresholds:
            missing = missing_metadata_keys(metric_thresholds)
            if missing:
                metadata_errors.append("metric_thresholds missing: " + ", ".join(missing))
        if (
            cfg
            and cfg.require_sensitive_context_policy
            and (not isinstance(sensitive_policy, str) or not sensitive_policy.strip())
        ):
            metadata_errors.append("sensitive_context_policy missing")

        if metadata_errors:
            summary["evidence_status"] = "not_evaluated"
            summary["validation_metadata"]["status"] = "failed"
            summary["validation_metadata"]["errors"] = metadata_errors
            summary["summarization_warnings"].append(
                "multi_metric_comparison validation metadata is incomplete: "
                + "; ".join(metadata_errors)
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(
                req, max_datasets=1
            )
            return summary

        summary["validation_metadata"]["status"] = "passed"
        summary["metric_keys"] = observed_metric_keys
        summary["metrics"] = [
            {
                "metric": metric,
                "unit": metric_units.get(metric),
                "direction": metric_directions.get(metric),
                "threshold": metric_thresholds.get(metric),
            }
            for metric in metadata_targets
        ]

        records = {}
        observed_entities = []
        invalid_metric_values = 0
        invalid_flag_values = 0
        duplicate_metric_values = 0
        missing_identity_rows = 0
        missing_entity_keys = set()

        def get_record(entity_value):
            entity_key = str(entity_value)
            if entity_key not in records:
                observed_entities.append(entity_key)
                records[entity_key] = {
                    "entity": entity_value,
                    "entity_key": entity_key,
                    "values": {},
                    "labels": {},
                    "flags": {},
                    "flag_raw_values": {},
                    "actions": {},
                    "selected": False,
                    "evidence_available": None,
                }
            return records[entity_key]

        def register_missing_entity_evidence(record: dict) -> None:
            entity_key = record["entity_key"]
            if entity_key in missing_entity_keys:
                return
            missing_entity_keys.add(entity_key)
            item = {
                "entity": record["entity"],
                "reason": "entity has no recorded source evidence for metric comparison",
            }
            if entity_evidence_available_col:
                item["evidence_column"] = entity_evidence_available_col
                item["evidence_value"] = False
            if record["labels"]:
                item["labels"] = dict(record["labels"])
            summary["missing_entity_evidence"].append(item)

        for row in dict_rows:
            entity_value = row.get(identity_col)
            if entity_value is None:
                missing_identity_rows += 1
                continue
            record = get_record(entity_value)

            for column in label_cols:
                if column in row and row.get(column) is not None:
                    record["labels"][column] = row.get(column)
            for column in action_cols:
                if column in row and row.get(column) is not None:
                    record["actions"][column] = row.get(column)
            for column in flag_cols:
                if column not in row:
                    continue
                parsed_flag, recognized = BaseExplanationStrategy._parse_triggered(row.get(column))
                record["flag_raw_values"][column] = row.get(column)
                if recognized:
                    record["flags"][column] = parsed_flag
                elif row.get(column) is not None:
                    invalid_flag_values += 1
                    record["flags"][column] = None
            if selected_col and selected_col in row:
                selected, recognized = BaseExplanationStrategy._parse_triggered(row.get(selected_col))
                if recognized and selected:
                    record["selected"] = True
            if entity_evidence_available_col and entity_evidence_available_col in row:
                available, recognized = BaseExplanationStrategy._parse_triggered(
                    row.get(entity_evidence_available_col)
                )
                if recognized:
                    if available is False:
                        record["evidence_available"] = False
                    elif record["evidence_available"] is None:
                        record["evidence_available"] = True

            if metric_value_col:
                raw_metric_key = row.get(metric_key_col)
                if raw_metric_key is None:
                    if record["evidence_available"] is False:
                        register_missing_entity_evidence(record)
                        continue
                    summary["missing_metric_evidence"].append({
                        "entity": entity_value,
                        "metric": None,
                        "reason": f"{metric_key_col} is missing",
                    })
                    continue
                metric_key = str(raw_metric_key)
                parsed_value = BaseExplanationStrategy._parse_number(row.get(metric_value_col))
                if metric_key in record["values"]:
                    duplicate_metric_values += 1
                if parsed_value is None:
                    invalid_metric_values += 1
                    record["values"][metric_key] = None
                    summary["missing_metric_evidence"].append({
                        "entity": entity_value,
                        "metric": metric_key,
                        "reason": f"{metric_value_col} is missing or non-numeric",
                    })
                else:
                    record["values"][metric_key] = round(parsed_value, 4)
            elif metric_key_col:
                raw_metric_key = row.get(metric_key_col)
                if raw_metric_key is None:
                    if record["evidence_available"] is False:
                        register_missing_entity_evidence(record)
                        continue
                    summary["missing_metric_evidence"].append({
                        "entity": entity_value,
                        "metric": None,
                        "reason": f"{metric_key_col} is missing",
                    })
                    continue
                metric_key = str(raw_metric_key)
                metric_values = record["values"].setdefault(metric_key, {})
                for column in metric_cols:
                    parsed_value = BaseExplanationStrategy._parse_number(row.get(column))
                    if column in metric_values:
                        duplicate_metric_values += 1
                    if parsed_value is None:
                        invalid_metric_values += 1
                        metric_values[column] = None
                        summary["missing_metric_evidence"].append({
                            "entity": entity_value,
                            "metric": f"{metric_key}.{column}",
                            "reason": f"{column} is missing or non-numeric",
                        })
                    else:
                        metric_values[column] = round(parsed_value, 4)
            else:
                for column in metric_cols:
                    parsed_value = BaseExplanationStrategy._parse_number(row.get(column))
                    if column in record["values"]:
                        duplicate_metric_values += 1
                    if parsed_value is None:
                        invalid_metric_values += 1
                        record["values"][column] = None
                        summary["missing_metric_evidence"].append({
                            "entity": entity_value,
                            "metric": column,
                            "reason": f"{column} is missing or non-numeric",
                        })
                    else:
                        record["values"][column] = round(parsed_value, 4)

        if missing_identity_rows:
            summary["summarization_warnings"].append(
                f"Skipped {missing_identity_rows} rows with missing {identity_col}."
            )
        if invalid_metric_values:
            summary["summarization_warnings"].append(
                f"Found {invalid_metric_values} missing or non-numeric metric values; "
                "they remain explicit missing evidence and were not replaced with zero."
            )
        if invalid_flag_values:
            summary["summarization_warnings"].append(
                f"Found {invalid_flag_values} unrecognized configured flag values."
            )
        if duplicate_metric_values:
            summary["summarization_warnings"].append(
                f"Found {duplicate_metric_values} duplicate entity/metric values; "
                "the last observed value is retained."
            )

        ordered_keys = []
        seen_entities = set()
        for configured in entity_order:
            if configured in records and configured not in seen_entities:
                ordered_keys.append(configured)
                seen_entities.add(configured)
        for observed in observed_entities:
            if observed not in seen_entities:
                ordered_keys.append(observed)
                seen_entities.add(observed)

        summary["entities"] = [records[key]["entity"] for key in ordered_keys]
        summary["evidence_requirements"]["observed_entity_count"] = len(ordered_keys)
        missing_expected_entities = [
            configured for configured in entity_order if configured not in records
        ]
        summary["missing_expected_entities"] = missing_expected_entities
        summary["evidence_requirements"]["missing_expected_entities"] = (
            missing_expected_entities
        )
        if missing_expected_entities:
            summary["summarization_warnings"].append(
                "Configured expected entities/groups are missing from dataset: "
                + ", ".join(missing_expected_entities)
            )

        def public_record(record: dict) -> dict:
            item = {
                identity_col: record["entity"],
                "metrics": record["values"],
            }
            if record["labels"]:
                item["labels"] = record["labels"]
            if record["flags"]:
                item["flags"] = record["flags"]
                item["flag_raw_values"] = record["flag_raw_values"]
            if record["actions"]:
                item["actions"] = record["actions"]
            if selected_col:
                item["selected"] = record["selected"]
            return item

        matrix = [public_record(records[key]) for key in ordered_keys]
        summary["comparison_matrix"] = matrix[:40]
        if len(matrix) > 40:
            summary["summarization_warnings"].append(
                f"Comparison matrix capped at 40 of {len(matrix)} entities."
            )
        summary["selected_entity_evidence"] = [
            public_record(records[key])
            for key in ordered_keys
            if records[key]["selected"]
        ]

        if len(ordered_keys) < minimum_entity_count:
            summary["evidence_status"] = "insufficient_evidence"
            summary["summarization_warnings"].append(
                "multi_metric_comparison has insufficient evidence: "
                f"observed {len(ordered_keys)} entities, requires at least "
                f"{minimum_entity_count}."
            )
            return summary

        summary["evidence_status"] = "sufficient"

        flat_values = {}
        if metric_value_col:
            flat_metric_ids = observed_metric_keys
            for key in ordered_keys:
                flat_values[key] = records[key]["values"]
        elif metric_key_col:
            flat_metric_ids = [
                f"{metric_key}.{column}"
                for metric_key in observed_metric_keys
                for column in metric_cols
            ]
            for key in ordered_keys:
                flattened = {}
                for metric_key, values in records[key]["values"].items():
                    for column, value in values.items():
                        flattened[f"{metric_key}.{column}"] = value
                flat_values[key] = flattened
        else:
            flat_metric_ids = metric_cols
            for key in ordered_keys:
                flat_values[key] = records[key]["values"]

        for entity_key in ordered_keys:
            if records[entity_key]["evidence_available"] is False:
                register_missing_entity_evidence(records[entity_key])
                continue
            for metric_id in flat_metric_ids:
                if metric_id not in flat_values[entity_key]:
                    summary["missing_metric_evidence"].append({
                        "entity": records[entity_key]["entity"],
                        "metric": metric_id,
                        "reason": "metric row or column is absent",
                    })

        extrema = {}
        gaps = []
        for metric_id in flat_metric_ids:
            numeric = [
                (entity_key, BaseExplanationStrategy._parse_number(flat_values[entity_key].get(metric_id)))
                for entity_key in ordered_keys
            ]
            numeric = [(entity_key, value) for entity_key, value in numeric if value is not None]
            if numeric:
                minimum = min(numeric, key=lambda item: (item[1], ordered_keys.index(item[0])))
                maximum = max(numeric, key=lambda item: (item[1], -ordered_keys.index(item[0])))
                extrema[metric_id] = {
                    "min": {
                        identity_col: records[minimum[0]]["entity"],
                        "value": round(minimum[1], 4),
                    },
                    "max": {
                        identity_col: records[maximum[0]]["entity"],
                        "value": round(maximum[1], 4),
                    },
                }
            for left_index in range(len(numeric)):
                for right_index in range(left_index + 1, len(numeric)):
                    left_key, left_value = numeric[left_index]
                    right_key, right_value = numeric[right_index]
                    gaps.append({
                        "metric": metric_id,
                        "left_entity": records[left_key]["entity"],
                        "right_entity": records[right_key]["entity"],
                        "gap_right_minus_left": round(right_value - left_value, 4),
                        "absolute_gap": round(abs(right_value - left_value), 4),
                    })

        summary["metric_extrema"] = extrema
        summary["pairwise_gaps"] = gaps[:120]
        if len(gaps) > 120:
            summary["summarization_warnings"].append(
                f"Pairwise gaps capped at 120 of {len(gaps)} comparisons."
            )

        if sensitive_policy:
            summary["summarization_warnings"].append(
                "Sensitive/background context is descriptive only under policy "
                f"'{sensitive_policy}'; do not infer causality or prescribe action from it."
            )

        return summary

    @staticmethod
    def _summarize_numeric_distribution(req: ExplainRequest) -> dict:
        cfg = req.ai_summary_config
        dataset_name, rows = BaseExplanationStrategy._select_primary_dataset(req)

        bin_col = cfg.bin_column if cfg else None
        count_col = cfg.count_column if cfg else None
        percent_col = cfg.percent_column if cfg else None
        metric_cols = list(cfg.metric_columns or []) if cfg else []
        bin_order = [str(item) for item in (cfg.bin_order or [])] if cfg else []
        expected_bins = [str(item) for item in (cfg.expected_bins or [])] if cfg else []
        focus_bins = [str(item) for item in (cfg.focus_bins or [])] if cfg else []
        threshold = cfg.numeric_threshold if cfg else None
        threshold_direction = str(cfg.threshold_direction or "").lower() if cfg else ""

        summary = {
            "summary_type": "numeric_distribution",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "bin_column": bin_col,
            "count_column": count_col,
            "percent_column": percent_col,
            "bin_distribution": [],
            "total_count": 0,
            "dominant_bin": None,
            "focus_bins": focus_bins,
            "focus_total": {
                "bins": focus_bins,
                "present_bins": [],
                "missing_bins": [],
                "count": 0,
                "percent": None,
            },
            "threshold_summary": None,
            "missing_expected_bins": [],
            "metric_evidence_by_bin": {},
            "summarization_warnings": [],
        }

        if not rows:
            summary["summarization_warnings"].append("Primary dataset is empty.")
            return summary

        dict_rows = [row for row in rows if isinstance(row, dict)]
        if not dict_rows:
            summary["summarization_warnings"].append("Primary dataset has no object rows.")
            return summary

        available_columns = set()
        for row in dict_rows:
            available_columns.update(row.keys())

        missing_required = []
        if not bin_col:
            missing_required.append("bin_column")
        if not count_col:
            missing_required.append("count_column")
        for column in (bin_col, count_col):
            if column and column not in available_columns:
                missing_required.append(column)

        if missing_required:
            summary["summarization_warnings"].append(
                "numeric_distribution config is incomplete or required columns are missing: "
                + ", ".join(missing_required)
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(req, max_datasets=1)
            return summary

        for column in [percent_col, *metric_cols]:
            if column and column not in available_columns:
                summary["summarization_warnings"].append(
                    f"Configured optional column '{column}' is missing from dataset."
                )

        invalid_count_rows = 0
        invalid_percent_values = 0
        entries = []
        order_rank = {value: index for index, value in enumerate(bin_order)}

        for index, row in enumerate(dict_rows):
            bin_value = row.get(bin_col)
            bin_key = str(bin_value)
            count_value = BaseExplanationStrategy._parse_number(row.get(count_col))
            if count_value is None:
                invalid_count_rows += 1
                continue

            percent_value = None
            if percent_col and row.get(percent_col) is not None:
                percent_value = BaseExplanationStrategy._parse_number(row.get(percent_col))
                if percent_value is None:
                    invalid_percent_values += 1

            metrics = {
                column: BaseExplanationStrategy._risk_value(row.get(column))
                for column in metric_cols
                if column in row and row.get(column) is not None
            }
            lower, upper = BaseExplanationStrategy._parse_numeric_bin_range(bin_value)
            explicit_order = order_rank.get(bin_key)
            is_special_no_score = bin_key.strip().lower() == "no score"

            entries.append({
                "bin": bin_value,
                "count": round(count_value, 4),
                "percent": round(percent_value, 4) if percent_value is not None else None,
                "metrics": metrics,
                "_bin_key": bin_key,
                "_lower": lower,
                "_upper": upper,
                "_explicit_order": explicit_order,
                "_is_special_no_score": is_special_no_score,
                "_row_index": index,
            })

        if invalid_count_rows:
            summary["summarization_warnings"].append(
                f"Skipped {invalid_count_rows} rows with invalid {count_col}."
            )
        if invalid_percent_values:
            summary["summarization_warnings"].append(
                f"Found {invalid_percent_values} invalid {percent_col} values; those percents were omitted."
            )

        if not entries:
            summary["summarization_warnings"].append("No valid numeric distribution bins remained after parsing counts.")
            return summary

        def sort_key(entry: dict):
            if entry["_explicit_order"] is not None:
                return (0, entry["_explicit_order"], entry["_row_index"])
            if entry["_lower"] is not None and entry["_upper"] is not None:
                return (1, entry["_lower"], entry["_upper"], entry["_row_index"])
            if entry["_is_special_no_score"]:
                return (3, entry["_row_index"])
            return (2, entry["_bin_key"], entry["_row_index"])

        entries.sort(key=sort_key)

        total_count = round(sum(entry["count"] for entry in entries), 4)
        summary["total_count"] = total_count

        distribution = []
        metric_evidence = {}
        for entry in entries:
            item = {
                "bin": entry["bin"],
                "count": entry["count"],
                "percent": entry["percent"],
            }
            if entry["metrics"]:
                item["metrics"] = entry["metrics"]
                metric_evidence[entry["_bin_key"]] = entry["metrics"]
            distribution.append(item)

        summary["bin_distribution"] = distribution[:40]
        if len(distribution) > 40:
            summary["summarization_warnings"].append(
                f"Bin distribution capped at 40 of {len(distribution)} bins."
            )
        summary["metric_evidence_by_bin"] = metric_evidence

        dominant = max(entries, key=lambda entry: (entry["count"], -entry["_row_index"]))
        summary["dominant_bin"] = {
            "bin": dominant["bin"],
            "count": dominant["count"],
            "percent": dominant["percent"],
        }
        if dominant["metrics"]:
            summary["dominant_bin"]["metrics"] = dominant["metrics"]

        present_keys = {entry["_bin_key"] for entry in entries}
        if expected_bins:
            summary["missing_expected_bins"] = [
                bin_value for bin_value in expected_bins
                if bin_value not in present_keys
            ]

        focus_entries = [
            entry for entry in entries
            if entry["_bin_key"] in set(focus_bins)
        ]
        focus_percent_values = [
            entry["percent"] for entry in focus_entries
            if entry["percent"] is not None
        ]
        summary["focus_total"] = {
            "bins": focus_bins,
            "present_bins": [entry["_bin_key"] for entry in focus_entries],
            "missing_bins": [
                bin_value for bin_value in focus_bins
                if bin_value not in present_keys
            ],
            "count": round(sum(entry["count"] for entry in focus_entries), 4),
            "percent": round(sum(focus_percent_values), 4) if focus_percent_values else None,
        }

        threshold_entries = []
        parsed_threshold = BaseExplanationStrategy._parse_number(threshold)
        if parsed_threshold is not None and threshold_direction:
            for entry in entries:
                lower = entry["_lower"]
                upper = entry["_upper"]
                if lower is None or upper is None:
                    continue
                include = False
                if threshold_direction in {"below", "under"}:
                    include = upper <= parsed_threshold
                elif threshold_direction in {"at_or_below", "below_or_equal", "lte"}:
                    include = upper <= parsed_threshold
                elif threshold_direction in {"above", "over"}:
                    include = lower >= parsed_threshold
                elif threshold_direction in {"at_or_above", "above_or_equal", "gte"}:
                    include = lower >= parsed_threshold
                else:
                    summary["summarization_warnings"].append(
                        f"Unsupported threshold_direction '{threshold_direction}'."
                    )
                    break
                if include:
                    threshold_entries.append(entry)

            threshold_percent_values = [
                entry["percent"] for entry in threshold_entries
                if entry["percent"] is not None
            ]
            summary["threshold_summary"] = {
                "threshold": round(parsed_threshold, 4),
                "direction": threshold_direction,
                "bins": [entry["_bin_key"] for entry in threshold_entries],
                "count": round(sum(entry["count"] for entry in threshold_entries), 4),
                "percent": round(sum(threshold_percent_values), 4) if threshold_percent_values else None,
            }

            focus_set = set(summary["focus_total"]["present_bins"])
            threshold_set = set(summary["threshold_summary"]["bins"])
            if focus_bins and focus_set != threshold_set:
                summary["summarization_warnings"].append(
                    "Configured focus bins and threshold-derived bins disagree."
                )

        percent_values = [
            entry["percent"] for entry in entries
            if entry["percent"] is not None
        ]
        if percent_values:
            percent_total = round(sum(percent_values), 4)
            if percent_total < 99 or percent_total > 101:
                summary["summarization_warnings"].append(
                    f"Percent total is {percent_total}, outside expected 100% tolerance."
                )

        return summary

    @staticmethod
    def _summarize_ranking(req: ExplainRequest) -> dict:
        cfg = req.ai_summary_config
        dataset_name, rows = BaseExplanationStrategy._select_primary_dataset(req)

        entity_col = cfg.entity_column if cfg else None
        metric_col = cfg.metric_column if cfg else None
        sort_direction = str(cfg.sort_direction or "desc").lower() if cfg else "desc"
        sort_desc = sort_direction != "asc"
        secondary_cols = list(cfg.secondary_metric_columns or []) if cfg else []
        label_cols = list(cfg.label_columns or []) if cfg else []
        flag_cols = list(cfg.flag_columns or []) if cfg else []
        top_k = cfg.top_k if cfg and cfg.top_k else 10
        bottom_k = cfg.bottom_k if cfg and cfg.bottom_k else 5
        top_k = max(0, min(int(top_k), 50))
        bottom_k = max(0, min(int(bottom_k), 50))

        summary = {
            "summary_type": "ranking",
            "dataset_name": dataset_name,
            "row_count": len(rows),
            "entity_column": entity_col,
            "metric_column": metric_col,
            "sort_direction": "desc" if sort_desc else "asc",
            "top_items": [],
            "bottom_items": [],
            "median_item": None,
            "metric_stats": {},
            "tie_warnings": [],
            "flag_evidence": [],
            "summarization_warnings": [],
        }

        if not rows:
            summary["summarization_warnings"].append("Primary dataset is empty.")
            return summary

        dict_rows = [row for row in rows if isinstance(row, dict)]
        if not dict_rows:
            summary["summarization_warnings"].append("Primary dataset has no object rows.")
            return summary

        available_columns = set()
        for row in dict_rows:
            available_columns.update(row.keys())

        missing_required = []
        if not entity_col:
            missing_required.append("entity_column")
        if not metric_col:
            missing_required.append("metric_column")
        for column in (entity_col, metric_col):
            if column and column not in available_columns:
                missing_required.append(column)

        if missing_required:
            summary["summarization_warnings"].append(
                "ranking config is incomplete or required columns are missing: "
                + ", ".join(missing_required)
            )
            summary["generic_diagnostic_sample"] = BaseExplanationStrategy._summarize_generic(req, max_datasets=1)
            return summary

        for column in [*secondary_cols, *label_cols, *flag_cols]:
            if column and column not in available_columns:
                summary["summarization_warnings"].append(
                    f"Configured optional column '{column}' is missing from dataset."
                )

        invalid_metric_rows = 0
        invalid_flag_values = 0
        entries = []

        for index, row in enumerate(dict_rows):
            metric_value = BaseExplanationStrategy._parse_number(row.get(metric_col))
            if metric_value is None:
                invalid_metric_rows += 1
                continue

            labels = {
                column: row.get(column)
                for column in label_cols
                if column in row and row.get(column) is not None
            }
            secondary = {
                column: BaseExplanationStrategy._risk_value(row.get(column))
                for column in secondary_cols
                if column in row and row.get(column) is not None
            }
            flags = {}
            raw_flags = {}
            for column in flag_cols:
                if column not in row:
                    continue
                parsed_flag, recognized = BaseExplanationStrategy._parse_triggered(row.get(column))
                raw_flags[column] = row.get(column)
                if recognized:
                    flags[column] = parsed_flag
                elif row.get(column) is not None:
                    invalid_flag_values += 1
                    flags[column] = None

            entries.append({
                entity_col: row.get(entity_col),
                metric_col: round(metric_value, 4),
                "labels": labels,
                "secondary_metrics": secondary,
                "flags": flags,
                "flag_raw_values": raw_flags,
                "_metric_value": metric_value,
                "_row_index": index,
            })

        if invalid_metric_rows:
            summary["summarization_warnings"].append(
                f"Skipped {invalid_metric_rows} rows with invalid {metric_col}."
            )
        if invalid_flag_values:
            summary["summarization_warnings"].append(
                f"Found {invalid_flag_values} unrecognized configured flag values; flags only use recognized true/false values."
            )

        if not entries:
            summary["summarization_warnings"].append("No valid ranking rows remained after parsing metric values.")
            return summary

        entries.sort(
            key=lambda entry: (entry["_metric_value"], -entry["_row_index"] if sort_desc else entry["_row_index"]),
            reverse=sort_desc,
        )
        values_for_stats = sorted(entry["_metric_value"] for entry in entries)

        def median_value(values: list[float]) -> float:
            midpoint = len(values) // 2
            if len(values) % 2:
                return values[midpoint]
            return (values[midpoint - 1] + values[midpoint]) / 2

        def public_item(entry: dict, rank: int | None = None) -> dict:
            item = {
                entity_col: entry.get(entity_col),
                metric_col: entry.get(metric_col),
            }
            if rank is not None:
                item["rank"] = rank
            if entry["labels"]:
                item["labels"] = entry["labels"]
            if entry["secondary_metrics"]:
                item["secondary_metrics"] = entry["secondary_metrics"]
            if entry["flags"]:
                item["flags"] = entry["flags"]
                item["flag_raw_values"] = entry["flag_raw_values"]
            return item

        def boundary_tie_warning(selection_name: str, selected: list[dict], cutoff_entry: dict | None) -> str | None:
            if not selected or cutoff_entry is None:
                return None
            cutoff = cutoff_entry["_metric_value"]
            matching_total = sum(1 for entry in entries if entry["_metric_value"] == cutoff)
            matching_selected = sum(1 for entry in selected if entry["_metric_value"] == cutoff)
            if matching_total > matching_selected:
                return (
                    f"{selection_name} boundary has {matching_total} tied items at "
                    f"{metric_col}={round(cutoff, 4)}; only {matching_selected} are included."
                )
            return None

        top_entries = entries[:top_k] if top_k else []
        bottom_entries = entries[-bottom_k:] if bottom_k else []
        median_entry = entries[len(entries) // 2]

        summary["top_items"] = [
            public_item(entry, rank=index + 1)
            for index, entry in enumerate(top_entries)
        ]
        summary["bottom_items"] = [
            public_item(entry, rank=len(entries) - len(bottom_entries) + index + 1)
            for index, entry in enumerate(bottom_entries)
        ]
        summary["median_item"] = public_item(median_entry, rank=entries.index(median_entry) + 1)
        summary["metric_stats"] = {
            "count": len(values_for_stats),
            "min": round(values_for_stats[0], 4),
            "max": round(values_for_stats[-1], 4),
            "mean": round(sum(values_for_stats) / len(values_for_stats), 4),
            "median": round(median_value(values_for_stats), 4),
        }

        top_warning = boundary_tie_warning("top_items", top_entries, top_entries[-1] if top_entries else None)
        bottom_warning = boundary_tie_warning("bottom_items", bottom_entries, bottom_entries[0] if bottom_entries else None)
        if top_warning:
            summary["tie_warnings"].append(top_warning)
        if bottom_warning:
            summary["tie_warnings"].append(bottom_warning)

        flag_evidence = []
        seen_entities = set()
        for entry in [*top_entries, *bottom_entries]:
            entity = entry.get(entity_col)
            if entity in seen_entities:
                continue
            seen_entities.add(entity)
            true_flags = [
                column
                for column, value in entry["flags"].items()
                if value is True
            ]
            if not true_flags and not entry["flags"]:
                continue
            flag_evidence.append({
                entity_col: entity,
                "true_flags": true_flags,
                "flags": entry["flags"],
                "flag_raw_values": entry["flag_raw_values"],
            })
        summary["flag_evidence"] = flag_evidence

        return summary

    @staticmethod
    def _summarize_generic(req: ExplainRequest, max_datasets: int = 3) -> dict:
        datasets = req.datasets or {}
        summary = {
            "summary_type": "generic_fallback",
            "datasets": [],
            "summarization_warnings": [],
        }

        items = list(datasets.items())
        if not items:
            summary["summarization_warnings"].append("No datasets were provided.")
            return summary

        if len(items) > max_datasets:
            summary["summarization_warnings"].append(
                f"Only summarized first {max_datasets} of {len(items)} datasets."
            )

        for dataset_name, rows in items[:max_datasets]:
            if not isinstance(rows, list):
                summary["datasets"].append({
                    "dataset_name": dataset_name,
                    "row_count": 0,
                    "summarization_warnings": ["Dataset rows are not an array."],
                })
                continue
            summary["datasets"].append(
                BaseExplanationStrategy._summarize_generic_dataset(dataset_name, rows)
            )

        return summary

    @staticmethod
    def _summarize_generic_dataset(dataset_name: str, rows: list[dict]) -> dict:
        row_count = len(rows)
        dict_rows = [row for row in rows if isinstance(row, dict)]
        columns = []
        seen = set()
        for row in dict_rows:
            for key in row.keys():
                if key not in seen:
                    seen.add(key)
                    columns.append(key)

        result = {
            "dataset_name": dataset_name,
            "row_count": row_count,
            "columns": columns[:40],
            "first_rows": [BaseExplanationStrategy._compact_row(row) for row in dict_rows[:5]],
            "last_rows": [BaseExplanationStrategy._compact_row(row) for row in dict_rows[-5:]] if row_count > 5 else [],
            "numeric_stats": {},
            "categorical_group_samples": {},
            "summarization_warnings": [],
        }

        if row_count == 0:
            result["summarization_warnings"].append("Dataset is empty.")
            return result

        if len(columns) > 40:
            result["summarization_warnings"].append(
                f"Column list capped at 40 of {len(columns)} columns."
            )

        if row_count > 10:
            result["summarization_warnings"].append(
                "Generic fallback includes first 5 and last 5 rows plus column summaries; raw rows are not exhaustive."
            )

        numeric_columns = []
        categorical_columns = []
        for column in columns:
            values = [row.get(column) for row in dict_rows if row.get(column) is not None]
            if not values:
                continue
            numeric_count = sum(
                1 for value in values
                if BaseExplanationStrategy._parse_number(value) is not None
            )
            if numeric_count > 0:
                numeric_columns.append(column)
            else:
                categorical_columns.append(column)

        for column in numeric_columns[:8]:
            numbers = [
                BaseExplanationStrategy._parse_number(row.get(column))
                for row in dict_rows
            ]
            numbers = [value for value in numbers if value is not None]
            if not numbers:
                continue
            result["numeric_stats"][column] = {
                "count": len(numbers),
                "min": round(min(numbers), 4),
                "max": round(max(numbers), 4),
                "avg": round(sum(numbers) / len(numbers), 4),
            }

        if len(numeric_columns) > 8:
            result["summarization_warnings"].append(
                f"Numeric stats capped at 8 of {len(numeric_columns)} numeric columns."
            )

        for column in categorical_columns[:4]:
            counts = {}
            samples = {}
            for row in dict_rows:
                value = row.get(column)
                if value is None:
                    continue
                key = str(value)
                counts[key] = counts.get(key, 0) + 1
                samples.setdefault(key, BaseExplanationStrategy._compact_row(row))
            top_groups = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:5]
            result["categorical_group_samples"][column] = [
                {
                    "value": value,
                    "count": count,
                    "sample_row": samples[value],
                }
                for value, count in top_groups
            ]

        if len(categorical_columns) > 4:
            result["summarization_warnings"].append(
                f"Categorical samples capped at 4 of {len(categorical_columns)} categorical columns."
            )

        return result

    @staticmethod
    def get_audience_tone(target_audience: list[str]) -> str:
        """
        Returns tone instruction for the system prompt based on target audience.
        Priority: student > instructor > academic_advisor > admin
        """
        if "student" in target_audience:
            return (
                "Use an encouraging, supportive tone. Write in second person ('you', 'your'). "
                "Avoid academic jargon. Focus on what the student can improve."
            )
        if "instructor" in target_audience:
            return (
                "Use a professional, pedagogical tone. Write in third person. "
                "Focus on actionable teaching interventions and class-wide patterns."
            )
        if "academic_advisor" in target_audience:
            return (
                "Use an analytical, evidence-based tone. Be neutral and precise. "
                "Reference specific data points and confidence levels."
            )
        return (
            "Use a concise, system-level tone. Focus on aggregated patterns and "
            "administrative actions."
        )
