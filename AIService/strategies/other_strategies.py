"""
Remaining 6 Strategy Stubs
===========================
These inherit from BaseExplanationStrategy and override build_system_prompt
and build_user_prompt. Detailed prompt engineering for each is Phase 3 Week 8.

For now, each stub returns a functional (but generic) prompt  the service
runs end-to-end and returns valid responses. Prompts will be refined per strategy.

Strategies:
  ComparisonStrategy    "comparison"  (2-student, demographic group comparisons)
  DistributionStrategy  "distribution" (histogram, pie chart, score bands)
  CorrelationStrategy   "correlation"  (scatter, heatmap, factor relationships)
  RiskStrategy          "risk"         (at-risk flags, risk scoring tables)
  BehavioralStrategy    "behavioral"   (engagement patterns, submission behavior)
  RankingStrategy       "ranking"      (ranked tables, priority lists)
"""

from __future__ import annotations
from .base import BaseExplanationStrategy, TASK_AWARE_SUMMARY_METHOD
from schemas import ExplainRequest


def is_task_aware_summary_mode() -> bool:
    method, _warning = BaseExplanationStrategy._resolve_ai_summary_method()
    return method == TASK_AWARE_SUMMARY_METHOD

# 
# COMPARISON
# 

class ComparisonStrategy(BaseExplanationStrategy):
    strategy_name = "comparison"

    def build_system_prompt(self, req: ExplainRequest) -> str:
        tone = self.get_audience_tone(req.target_audience)
        return f"""You are a Learning Analytics expert specializing in student comparison analysis.
{tone}
Compare the provided datasets and identify meaningful differences and similarities.
Return ONLY a valid JSON object matching the ExplainResponse schema (summary, insights[], educational_implications[], recommendations[], warnings[]).
Each insight MUST include evidence[] with metric, value, comparison tag, and delta."""

    def build_user_prompt(self, req: ExplainRequest) -> str:
        data_summary = self.summarize_datasets(req)
        ac = req.analysis_context
        return f"""COMPARISON TASK: {req.task_name or req.task_id}
Context: {ac.aggregation_level if ac else 'comparison'} level, {ac.granularity if ac else 'semester'} granularity

DATASETS:
{data_summary}

Compare the groups/students in this data. Identify who is performing better, by how much, and what patterns explain the difference.
Return the JSON explanation structure."""


# 
# DISTRIBUTION
# 

class DistributionStrategy(BaseExplanationStrategy):
    strategy_name = "distribution"

    def build_system_prompt(self, req: ExplainRequest) -> str:
        tone = self.get_audience_tone(req.target_audience)

        # Proxy competency semantic note
        proxy_note = ""
        sc = req.semantic_context
        if sc and sc.competency_mode in ("proxy", "unknown", "mixed"):
            proxy_note = (
                "\n\nSEMANTIC CONTEXT  IMPORTANT: "
                "This analysis uses assessment names (e.g., G1, G2, G3) as "
                "competency area proxies because the current dataset does not provide "
                "a native competency ontology. When referring to 'competency areas' "
                "or 'skill domains', use the assessment names directly. "
                "Do NOT invent competency category names. "
                "You MAY note this is structural proxy data if relevant to confidence."
            )

        return f"""You are a Learning Analytics expert specializing in distribution and cohort analysis.
{tone}
Analyze the distribution of values and describe the shape, central tendency, and notable outliers.
Return ONLY a valid JSON object matching the ExplainResponse schema.{proxy_note}"""

    def build_user_prompt(self, req: ExplainRequest) -> str:
        # Filter competency_source column from display (internal metadata, not analytic value)
        import copy
        filtered_req = copy.copy(req)
        filtered_datasets = {}
        for label, rows in req.datasets.items():
            filtered_datasets[label] = [
                {k: v for k, v in row.items() if k != "competency_source"}
                for row in rows
            ]
        filtered_req.datasets = filtered_datasets

        data_summary = self.summarize_datasets(filtered_req)
        filtered_summary_metadata = getattr(
            filtered_req, "_ai_summary_metadata", None
        )
        if filtered_summary_metadata:
            self._attach_summary_metadata(req, filtered_summary_metadata)
        ac = req.analysis_context
        sc = req.semantic_context

        competency_hint = ""
        if sc and sc.competency_mode in ("proxy", "unknown"):
            competency_hint = (
                "\nNOTE: The 'competency_tag' column contains assessment names used "
                "as structural proxies (not from a formal competency ontology)."
            )

        return f"""DISTRIBUTION TASK: {req.task_name or req.task_id}
Context: {ac.aggregation_level if ac else 'cohort'} level{competency_hint}

DATASETS:
{data_summary}

Describe the distribution. Where do most students fall What are the tails Are there any notable clusters or gaps If competency areas are shown, identify which areas need the most improvement.
Return the JSON explanation structure."""


# 
# CORRELATION
# 

class CorrelationStrategy(BaseExplanationStrategy):
    strategy_name = "correlation"

    def build_system_prompt(self, req: ExplainRequest) -> str:
        tone = self.get_audience_tone(req.target_audience)
        vc = req.visualization_config
        x_label = vc.x_label if vc else "Variable X"
        y_label = vc.y_label if vc else "Variable Y"
        return f"""You are a Learning Analytics expert specializing in correlation analysis.
{tone}
Analyze the relationship between {x_label} and {y_label}.
Describe direction (positive/negative), strength (strong/moderate/weak), and educational meaning.
IMPORTANT: Do NOT claim causation  only describe correlation patterns.
Return ONLY a valid JSON object matching the ExplainResponse schema."""

    def build_user_prompt(self, req: ExplainRequest) -> str:
        data_summary = self.summarize_datasets(req)
        vc = req.visualization_config
        return f"""CORRELATION TASK: {req.task_name or req.task_id}
X: {vc.x_label if vc else 'Variable X'} | Y: {vc.y_label if vc else 'Variable Y'}

DATASETS:
{data_summary}

Analyze the relationship between these variables. Is there a pattern How strong What does it mean for student learning
Return the JSON explanation structure."""


# 
# RISK
# 

class RiskStrategy(BaseExplanationStrategy):
    strategy_name = "risk"

    def build_system_prompt(self, req: ExplainRequest) -> str:
        tone = self.get_audience_tone(req.target_audience)
        if req.task_id == "A-G03":
            return f"""You are a Learning Analytics expert explaining an admin contact-priority queue.
{tone}
The dashboard already displays a deterministic ADMIN ACTION for every student. Explain only why students are ranked and which returned flags support that ranking.
Do not create, repeat, paraphrase, or imply additional recommendations or actions.
Do not use unavailable engagement or punctuality as evidence.
Set explanation.recommendations and explanation.educational_implications to empty lists [].
Return ONLY a valid JSON object matching the ExplainResponse schema."""

        if req.task_id == "S-T13" and is_task_aware_summary_mode():
            return f"""You are a Learning Analytics expert explaining an already-generated next-week action plan.
{tone}
The dashboard card already displays the concrete "Do next week" actions. Do not create additional recommendations or duplicate those actions.
Use the risk indicators only to explain why the card prioritizes those steps, what evidence supports them, and any limitations.
Write the explanation as card rationale, not a general risk summary. Insight titles should explicitly connect a metric to the card step, for example "Why engagement is Step 1" or "Why score protection is Step 2".
If performance_trend is positive, mention it only as a stabilizing context or limitation; do not present it as a reason for an extra action.
For this task only, the JSON field explanation.recommendations MUST be an empty list [].
Return ONLY a valid JSON object matching the ExplainResponse schema."""

        if req.task_id == "A-S04" and is_task_aware_summary_mode():
            return f"""You are a Learning Analytics expert explaining an admin risk-flag checklist.
{tone}
The dashboard checklist already displays the concrete recommended_action for each flag. Do not create additional recommendations or duplicate those actions.
Use the risk flags to explain WHY the checklist surfaced each triggered flag and WHY its severity level is appropriate.
Write the explanation as checklist rationale, not as a new action plan. Insight titles MUST explicitly connect the visible flag to its displayed state or severity, for example "Why Low Score is High" or "Why Low Punctuality is Active".
For stable flags, keep the explanation brief and use them as context only.
Do NOT tell the admin what to do. Avoid action/intervention language such as "requires", "should", "strategy", "immediate attention", or "intervention".
Keep educational_implications as an empty list [] because this checklist already contains action guidance.
For this task only, the JSON field explanation.recommendations MUST be an empty list [].
Return ONLY a valid JSON object matching the ExplainResponse schema."""

        if req.task_id == "A-G16":
            return f"""You are a Learning Analytics expert explaining an already-generated 2-week admin action plan.
{tone}
The dashboard card already displays the concrete ADMIN ACTION for each step. Do not create additional recommendations or duplicate those actions.
Use the returned cohort metrics only to explain why the card prioritizes outreach, engagement nudges, assessment support, or resource nudges.
Write the explanation as plan rationale, not as a new action plan.
Do NOT tell the admin what to do. Avoid action/intervention language such as "implement", "schedule", "increase", "should", "needs", "requires", "support", or "improve".
Keep educational_implications as an empty list [] because this card already contains action guidance.
For this task only, the JSON field explanation.recommendations MUST be an empty list [].
Return ONLY a valid JSON object matching the ExplainResponse schema."""

        return f"""You are a Learning Analytics expert specializing in at-risk student identification.
{tone}
Analyze the risk indicators in the data. Describe which students or groups are at risk, the severity, and why.
Be careful NOT to label students harshly  focus on patterns and actionable interventions.
Return ONLY a valid JSON object matching the ExplainResponse schema.
Use severity="high" only for students showing multiple simultaneous risk signals."""

    def build_user_prompt(self, req: ExplainRequest) -> str:
        data_summary = self.summarize_datasets(req)
        if req.task_id == "A-G03":
            return f"""CONTACT PRIORITY RATIONALE TASK: {req.task_name or req.task_id}

DATASETS:
{data_summary}

Explain the ordering using at_risk_score and triggered_flags_summary only. Discuss the visible ADMIN ACTION only as existing dashboard context and do not restate it.
Do not propose any action. Set explanation.recommendations and explanation.educational_implications to [].
Return the JSON explanation structure."""

        if req.task_id == "S-T13" and is_task_aware_summary_mode():
            return f"""ACTION PLAN RATIONALE TASK: {req.task_name or req.task_id}

DATASETS:
{data_summary}

Explain why the dashboard's next-week plan is reasonable based on the returned risk and performance metrics.

Required structure:
- The summary must explain the plan logic in 2 sentences: "The card prioritizes X because metric Y crosses threshold Z..."
- Each insight must answer WHY a visible card step exists, not just describe the metric.
- If engagement_score is below 0.15, include an insight titled like "Why engagement is Step 1" and cite engagement_score vs 0.15.
- If avg_score is below target_threshold, include an insight titled like "Why score protection is Step 2" and cite avg_score vs target_threshold.
- If performance_trend is positive, say it reduces urgency for a trend-specific step; do not frame it as a new intervention.
- Explain that this is short-term next-week guidance, not a full study plan.

Do not add new next-week actions. Set explanation.recommendations to [].
Return the JSON explanation structure."""

        if req.task_id == "A-S04" and is_task_aware_summary_mode():
            return f"""ADMIN RISK CHECKLIST RATIONALE TASK: {req.task_name or req.task_id}

DATASETS:
{data_summary}

Explain why the dashboard's risk-flag checklist is prioritizing the triggered flags.

Required structure:
- The summary must use this logic: "The checklist prioritizes [flag names] because [current value] crosses [risk rule/threshold]; highest severity is [severity] because [severity reason]."
- Create one insight per triggered visible flag.
- Use exact why-style insight title patterns when the matching flag is triggered:
  * "Why Low Score is High" for flag_low_score.
  * "Why Low Punctuality is Active" for flag_low_punctuality.
  * "Why High Absence is Active" for flag_high_absence.
  * "Why Negative Trend is Active" for flag_neg_trend.
- Each insight must explain: current value vs threshold/risk rule, triggered=true, and why that maps to the shown severity or active state.
- Stable flags may be omitted unless they explain why the card is not escalating that flag.
- Do not repeat or paraphrase the per-flag recommended_action shown on the checklist card.
- Do not add new next steps or action wording such as "requires attention", "should improve", "intervention", or "strategy".

Do not add new admin actions. Set explanation.recommendations to [] and explanation.educational_implications to [].
Return the JSON explanation structure."""

        if req.task_id == "A-G16":
            return f"""ADMIN ACTION PLAN RATIONALE TASK: {req.task_name or req.task_id}

DATASETS:
{data_summary}

Explain why the dashboard's 2-week admin action plan is reasonable based on the returned cohort metrics.

Required structure:
- The summary must explain the plan logic from the visible metrics: total_students, low_engagement_count, high_risk_count, hardest_assessment, and best_resource_type.
- Each insight must answer WHY a visible plan component exists, not propose a new action.
- Use why-style insight titles such as "Why priority outreach is Step 1", "Why engagement is Step 2", "Why assessment support is Step 3", or "Why resource nudges are Step 4" when the matching metric is present.
- Do not repeat or paraphrase the ADMIN ACTION text shown on the card.
- Do not add new next steps or action wording such as "implement", "schedule", "increase", "should", "needs", "requires", "support", "intervention", or "strategy".

Do not add new admin actions. Set explanation.recommendations to [] and explanation.educational_implications to [].
Return the JSON explanation structure."""

        return f"""RISK ANALYSIS TASK: {req.task_name or req.task_id}

DATASETS:
{data_summary}

Identify risk patterns: who is at risk, what signals indicate risk, and what early interventions are appropriate.
Return the JSON explanation structure."""


# 
# BEHAVIORAL
# 

class BehavioralStrategy(BaseExplanationStrategy):
    strategy_name = "behavioral"

    def build_system_prompt(self, req: ExplainRequest) -> str:
        tone = self.get_audience_tone(req.target_audience)
        ac = req.analysis_context
        temporal_note = ""
        if ac and ac.granularity == "weekly":
            temporal_note = "Pay attention to week-by-week patterns and sudden behavioral shifts."
        return f"""You are a Learning Analytics expert specializing in student behavioral analysis.
{tone}
Analyze engagement patterns, submission behavior, platform activity, and behavioral trends.
{temporal_note}
Return ONLY a valid JSON object matching the ExplainResponse schema."""

    def build_user_prompt(self, req: ExplainRequest) -> str:
        data_summary = self.summarize_datasets(req)
        ac = req.analysis_context
        return f"""BEHAVIORAL ANALYSIS TASK: {req.task_name or req.task_id}
Context: {ac.granularity if ac else 'semester'} granularity, {ac.aggregation_level if ac else 'student'} level

DATASETS:
{data_summary}

Describe the behavioral patterns. Are they consistent Are there concerning drops in activity What do these behaviors suggest about the student's engagement with the course
Return the JSON explanation structure."""


# 
# RANKING
# 

class RankingStrategy(BaseExplanationStrategy):
    strategy_name = "ranking"

    def build_system_prompt(self, req: ExplainRequest) -> str:
        tone = self.get_audience_tone(req.target_audience)
        return f"""You are a Learning Analytics expert specializing in student ranking and prioritization.
{tone}
Analyze the ranked data and explain what the ordering reveals about student performance or risk priority.
Focus on the top and bottom of the ranking and what separates them.
Return ONLY a valid JSON object matching the ExplainResponse schema."""

    def build_user_prompt(self, req: ExplainRequest) -> str:
        data_summary = self.summarize_datasets(req)
        return f"""RANKING TASK: {req.task_name or req.task_id}

DATASETS:
{data_summary}

Analyze this ranked list. Who is at the top/bottom What metrics drive the ranking Which students should receive priority attention
Return the JSON explanation structure."""


class RecommendationStrategy(BaseExplanationStrategy):
    strategy_name = "recommendation"

    def build_system_prompt(self, req: ExplainRequest) -> str:
        tone = self.get_audience_tone(req.target_audience)
        if req.task_id == "S-T13" and is_task_aware_summary_mode():
            return f"""You are a Learning Analytics expert explaining an already-generated next-week action plan.
{tone}
The dashboard card already displays the concrete "Do next week" actions. Do not create additional recommendations or duplicate those actions.
Use the provided metrics to explain why the card prioritizes those steps, what evidence supports them, and any limitations.
For this task only, the JSON field explanation.recommendations MUST be an empty list [].
Return ONLY a valid JSON object matching the ExplainResponse schema."""

        if req.task_id == "A-S08" and is_task_aware_summary_mode():
            return f"""You are a Learning Analytics expert explaining an already-generated 7-day admin intervention plan.
{tone}
The dashboard card already displays the concrete ADMIN ACTION for each step. Do not create additional recommendations or duplicate those actions.
Use the returned metrics only to explain why the card prioritizes each intervention step, what evidence supports the priority, and any limitations.
Write the explanation as plan rationale, not as a new intervention plan.
Insight titles MUST refer to the visible step number and focus, for example "Why advisor check-in is Step 1", "Why engagement is Step 2", "Why time management is Step 3", or "Why academic support is Step 4".
Do NOT tell the admin what to do. Avoid action/intervention language such as "needs", "requires", "should", "support", "strategy", "intervention", or "improve".
Keep educational_implications as an empty list [] because this card already contains action guidance.
For this task only, the JSON field explanation.recommendations MUST be an empty list [].
Return ONLY a valid JSON object matching the ExplainResponse schema."""

        return f"""You are a Learning Analytics expert specializing in goal planning and practical recommendations.
{tone}
Use the provided metrics to explain current status, feasibility, and next realistic actions.
Avoid generic advice: tie each recommendation to concrete returned fields.
Return ONLY a valid JSON object matching the ExplainResponse schema."""

    def build_user_prompt(self, req: ExplainRequest) -> str:
        data_summary = self.summarize_datasets(req)
        if req.task_id == "S-T13" and is_task_aware_summary_mode():
            return f"""ACTION PLAN RATIONALE TASK: {req.task_name or req.task_id}

DATASETS:
{data_summary}

Explain why the dashboard's next-week plan is reasonable based on the returned metrics.
Focus on:
- the current risk level and risk score
- which metrics make engagement or score protection the priority
- why the plan should be treated as short-term guidance rather than a full study plan

Do not add new next-week actions. Set explanation.recommendations to [].
Return the JSON explanation structure."""

        if req.task_id == "A-S08" and is_task_aware_summary_mode():
            return f"""ADMIN INTERVENTION PLAN RATIONALE TASK: {req.task_name or req.task_id}

DATASETS:
{data_summary}

Explain why the dashboard's 7-day intervention plan is reasonable based on the returned metrics.

Required structure:
- The summary must use this logic: "The 7-day plan is active because at_risk_score=[value] and at_risk_label=[label]; the visible steps are ordered by the strongest returned evidence."
- Each insight must answer WHY a visible intervention step exists, not propose a new step.
- Use exact why-style insight title patterns when the matching evidence is present:
  * "Why advisor check-in is Step 1" for at_risk_score / at_risk_label.
  * "Why engagement is Step 2" for engagement_score vs 0.15.
  * "Why time management is Step 3" for punctuality_rate vs 0.70.
  * "Why academic support is Step 4" for avg_score vs target/pass threshold.
- If a visible step has missing trigger evidence, explain the missing metric as a limitation instead of inventing a reason.
- Do not repeat or paraphrase the ADMIN ACTION text shown on the card.
- Do not use action wording such as "needs support", "requires", "should", "intervention", "strategy", or "improve".

Do not add new admin actions. Set explanation.recommendations to [] and explanation.educational_implications to [].
Return the JSON explanation structure."""

        return f"""RECOMMENDATION TASK: {req.task_name or req.task_id}

DATASETS:
{data_summary}

Explain the learner's current position, whether key goals are achievable, and what immediate step is most effective next.
Return the JSON explanation structure."""


class ProgressStrategy(BaseExplanationStrategy):
    strategy_name = "progress"

    def build_system_prompt(self, req: ExplainRequest) -> str:
        tone = self.get_audience_tone(req.target_audience)
        return f"""You are a Learning Analytics expert specializing in progress tracking and completion status analysis.
{tone}
Analyze status rows in chronological order, distinguish completed vs pending items, and prioritize the most urgent next item.
Return ONLY a valid JSON object matching the ExplainResponse schema."""

    def build_user_prompt(self, req: ExplainRequest) -> str:
        data_summary = self.summarize_datasets(req)
        ac = req.analysis_context
        return f"""PROGRESS TASK: {req.task_name or req.task_id}
Context: {ac.granularity if ac else 'per_assessment'} granularity, {ac.aggregation_level if ac else 'student'} level

DATASETS:
{data_summary}

Summarize completion progress in order, identify what is still pending, and recommend the most immediate next action.
Return the JSON explanation structure."""
