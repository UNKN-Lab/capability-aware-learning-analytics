/**
 * MetricCardView.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders aggregate single-row metrics as a grid of KPI cards.
 * Receives adapted array of { key, label, value } from card.adapter.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { formatCellValue } from "../../utils/responseTransformer";

export default function MetricCardView({ data }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[120px] text-slate-400 text-sm">
        No aggregate data to display
      </div>
    );
  }

  if (!Array.isArray(data) && data.type === "risk_status") {
    return <RiskStatusCard card={data} />;
  }

  if (!Array.isArray(data) && data.type === "procrastination_summary") {
    return <ProcrastinationSummaryCard card={data} />;
  }

  if (!Array.isArray(data) && data.type === "absence_impact_summary") {
    return <AbsenceImpactSummaryCard card={data} />;
  }

  if (!Array.isArray(data) && data.type === "student_profile") {
    return <StudentProfileCard profile={data.profile} />;
  }

  if (!Array.isArray(data) && data.type === "action_plan") {
    return <ActionPlanCard plan={data} />;
  }

  if (!Array.isArray(data) && data.type === "admin_action_recommendation") {
    return <AdminActionRecommendationCard recommendation={data} />;
  }

  if (!Array.isArray(data) && data.type === "risk_comparison") {
    return <RiskComparisonCard comparison={data} />;
  }

  if (!Array.isArray(data) && data.type === "academic_background_comparison") {
    return <AcademicBackgroundComparisonCard comparison={data} />;
  }

  if (!Array.isArray(data) && data.type === "at_risk_contact_queue") {
    return <AtRiskContactQueueCard queue={data} />;
  }

  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : [];

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] text-slate-400 text-sm">
        No aggregate data to display
      </div>
    );
  }

  if (isPerformanceOverviewItems(items)) {
    return <PerformanceOverviewCard items={items} />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2 pb-4">
      {items.map((metric) => (
        <div 
          key={metric.key}
          className="bg-slate-50 rounded-lg p-4 border border-slate-100 flex flex-col justify-center min-w-0"
        >
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 leading-snug">
            {metric.label}
          </span>
          <MetricValue metric={metric} />
        </div>
      ))}
    </div>
  );
}

function isPerformanceOverviewItems(items) {
  const keys = new Set(items.map((item) => item?.key));
  return (
    keys.has("avg_score") &&
    keys.has("class_avg_score") &&
    keys.has("score_percentile") &&
    keys.has("performance_band")
  );
}

function PerformanceOverviewCard({ items }) {
  const metric = (key) => items.find((item) => item?.key === key);
  const avgScore = metric("avg_score");
  const passRate = metric("pass_rate");
  const finalOutcome = metric("final_outcome");
  const performanceBand = metric("performance_band");
  const passThreshold = metric("pass_threshold");
  const targetThreshold = metric("target_threshold");
  const band = getPerformanceBandDisplay(performanceBand?.value);

  return (
    <div className="pt-2 pb-4 space-y-4">
      <div className={`rounded-xl border p-4 sm:p-5 ${band.panelClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Current weighted score
            </p>
            <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-2">
              <span className="text-4xl font-bold leading-none text-slate-950 font-mono">
                {formatMetricDisplay(avgScore)}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${band.badgeClass}`}>
                {band.label}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
              <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1">
                Outcome: <strong>{formatMetricDisplay(finalOutcome)}</strong>
              </span>
              <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1">
                Pass rate: <strong>{formatMetricDisplay(passRate)}</strong>
              </span>
            </div>
          </div>

          <div className="w-full max-w-sm">
            <ScoreThresholdBar
              score={Number(avgScore?.value)}
              passThreshold={Number(passThreshold?.value)}
              targetThreshold={Number(targetThreshold?.value)}
              scoreScale={Number(metric("score_scale")?.value)}
            />
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Class benchmark
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <PerformanceMiniMetric metric={metric("class_avg_score")} />
          <PerformanceMiniMetric metric={metric("class_median_score")} />
          <PerformanceMiniMetric metric={metric("score_vs_class_avg")} accent />
          <PerformanceMiniMetric metric={metric("score_percentile")} />
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Score calculation
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <PerformanceMiniMetric metric={metric("weighted_avg_score")} />
          <PerformanceMiniMetric metric={metric("unweighted_avg_score")} />
          <PerformanceMiniMetric metric={metric("assessment_count")} />
          <PerformanceMiniMetric metric={metric("performance_trend")} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          <PerformancePill metric={metric("score_strategy")} />
          <PerformancePill metric={metric("cohort_size")} prefix="Cohort size" />
          <PerformancePill metric={metric("score_scale")} prefix="Score scale" />
          <PerformancePill metric={passThreshold} prefix="Pass threshold" />
          <PerformancePill metric={targetThreshold} prefix="Target threshold" />
        </div>
      </section>
    </div>
  );
}

function ScoreThresholdBar({ score, passThreshold, targetThreshold, scoreScale }) {
  const scale = Number.isFinite(scoreScale) && scoreScale > 0 ? scoreScale : 100;
  const safeScore = scalePosition(score, scale);
  const safePass = scalePosition(passThreshold, scale);
  const safeTarget = scalePosition(targetThreshold, scale);

  return (
    <div className="rounded-lg border border-white/70 bg-white/70 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
        <span>0</span>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
          Score {formatCellValue(score)}
        </span>
        <span>{formatCellValue(scale)}</span>
      </div>

      <div className="relative h-12">
        <div className="absolute left-0 right-0 top-3 h-3 rounded-full bg-slate-200">
          <div
            className="h-3 rounded-full bg-blue-500"
            style={{ width: `${safeScore}%` }}
          />
        </div>
        <div
          className="absolute top-1 h-7 border-l-2 border-emerald-500"
          style={{ left: `${safePass}%` }}
          title="Pass threshold"
        />
        <div
          className="absolute top-0 h-9 border-l-2 border-blue-700"
          style={{ left: `${safeScore}%` }}
          title="Current score"
        />
        <div
          className="absolute top-1 h-7 border-l-2 border-amber-500"
          style={{ left: `${safeTarget}%` }}
          title="Target threshold"
        />
        <span
          className="absolute top-8 -translate-x-1/2 whitespace-nowrap text-[11px] text-emerald-700"
          style={{ left: `${safePass}%` }}
        >
          Pass {formatCellValue(passThreshold)}
        </span>
        <span
          className="absolute top-8 -translate-x-1/2 whitespace-nowrap text-[11px] text-amber-700"
          style={{ left: `${safeTarget}%` }}
        >
          Target {formatCellValue(targetThreshold)}
        </span>
      </div>
    </div>
  );
}

function PerformanceMiniMetric({ metric, accent = false }) {
  if (!metric) return null;
  return (
    <div className={`rounded-lg border p-3 min-w-0 ${accent ? "border-blue-100 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="min-h-[28px] text-[11px] font-semibold uppercase tracking-wider leading-snug text-slate-500">
        {metric.label}
      </div>
      <div className="mt-1 text-xl font-bold text-slate-900 font-mono">
        {formatMetricDisplay(metric)}
      </div>
    </div>
  );
}

function PerformancePill({ metric, prefix }) {
  if (!metric) return null;
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
      {prefix ? `${prefix}: ` : ""}
      <strong className="font-semibold text-slate-800">{formatMetricDisplay(metric)}</strong>
    </span>
  );
}

function formatMetricDisplay(metric) {
  if (!metric) return "n/a";
  const value = formatMetricValue(metric);
  return isNumericMetricValue(value) ? formatCellValue(value) : formatCategoricalMetricValue(value);
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function scalePosition(value, scale) {
  if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0) return 0;
  return clampPercent((value / scale) * 100);
}

function getPerformanceBandDisplay(value) {
  const normalized = String(value ?? "").toLowerCase();
  const map = {
    below_pass_threshold: {
      label: "Below pass threshold",
      panelClass: "bg-rose-50 border-rose-200",
      badgeClass: "bg-rose-100 border-rose-300 text-rose-700",
    },
    passing_but_below_target: {
      label: "Passing but below target",
      panelClass: "bg-amber-50 border-amber-200",
      badgeClass: "bg-amber-100 border-amber-300 text-amber-700",
    },
    strong_relative_performance: {
      label: "Strong relative performance",
      panelClass: "bg-emerald-50 border-emerald-200",
      badgeClass: "bg-emerald-100 border-emerald-300 text-emerald-700",
    },
    on_track: {
      label: "On track",
      panelClass: "bg-emerald-50 border-emerald-200",
      badgeClass: "bg-emerald-100 border-emerald-300 text-emerald-700",
    },
  };

  return map[normalized] ?? {
    label: formatCategoricalMetricValue(value),
    panelClass: "bg-slate-50 border-slate-200",
    badgeClass: "bg-slate-100 border-slate-300 text-slate-700",
  };
}

function MetricValue({ metric, value: directValue, size = "default" }) {
  const value = metric ? formatMetricValue(metric) : directValue;
  if (isNumericMetricValue(value)) {
    const sizeClass = size === "compact" ? "text-xl" : "text-2xl";
    return (
      <span className={`${sizeClass} font-bold text-slate-800 font-mono`}>
        {formatCellValue(value)}
      </span>
    );
  }

  const displayValue = formatCategoricalMetricValue(value);
  return (
    <span
      className="mt-2 block max-w-full min-w-0 rounded-md bg-slate-100 px-2.5 py-1 text-sm font-semibold leading-snug text-slate-700 whitespace-normal break-words [overflow-wrap:anywhere]"
      title={String(value ?? "")}
    >
      {displayValue}
    </span>
  );
}

function isNumericMetricValue(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  return /^[+-]?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?(%| days)?$/.test(trimmed);
}

function StudentProfileCard({ profile }) {
  const risk = getRiskBadge(profile?.atRiskLabel);
  const outcome = getOutcomeBadge(profile?.finalOutcome);
  const effort = getStudyEffortDisplay(profile?.studyEffortLevel);

  return (
    <div className="pt-2 pb-4 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Student ID
            </p>
            <p className="mt-1 break-words font-mono text-xl font-bold text-slate-950">
              {formatCellValue(profile?.studentId)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full border px-3 py-1 font-semibold ${outcome.badgeClass}`}>
                {outcome.label}
              </span>
              <span className={`rounded-full border px-3 py-1 font-semibold ${risk.badgeClass}`}>
                Risk: {risk.displayLabel}
              </span>
            </div>
          </div>

          <div className="grid min-w-[220px] grid-cols-2 gap-3">
            <ProfileFigure label="Avg score" value={formatNumberValue(profile?.avgScore)} />
            <ProfileFigure label="Risk score" value={`${formatCellValue(profile?.atRiskScore)} / 5`} />
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Demographics
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ProfileMiniMetric label="Gender" value={profile?.gender} />
          <ProfileMiniMetric label="Age group" value={profile?.ageGroup} />
          <ProfileMiniMetric label="Region" value={profile?.region} />
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Academic and engagement status
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ProfileMiniMetric label="Previous attempts" value={profile?.previousAttemptCount} />
          <ProfileMiniMetric label="Engagement score" value={formatEngagementScore(profile?.engagementScore)} />
          <ProfileMiniMetric label="Study effort" value={effort.label} className={effort.className} />
          <ProfileMiniMetric label="Final outcome" value={outcome.label} className={outcome.softClass} />
        </div>
      </section>
    </div>
  );
}

function ActionPlanCard({ plan }) {
  const summary = plan?.summary || {};
  const risk = getRiskBadge(summary.riskLabel);
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const heading = summary.heading || "Next-week plan";
  const actionLabel = summary.actionLabel || "Do next week";

  return (
    <div className="pt-2 pb-4 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            {heading}
          </span>
          <ActionPlanPill label="Risk" value={risk.displayLabel} />
          <ActionPlanPill label="Risk score" value={formatRiskScore(summary.riskScore)} />
          <ActionPlanPill label="Avg score" value={formatNumberValue(summary.avgScore)} />
          <ActionPlanPill
            label="Engagement"
            value={summary.engagementAvailable === false
              ? "Not available"
              : formatEngagementScore(summary.engagementScore)}
          />
          {summary.punctualityRate !== null && summary.punctualityRate !== undefined && (
            <ActionPlanPill label="Punctuality" value={formatEngagementScore(summary.punctualityRate)} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {steps.map((step, index) => (
          <ActionStepCard
            key={step.key || index}
            step={step}
            index={index}
            actionLabel={actionLabel}
          />
        ))}
      </div>
    </div>
  );
}

function AdminActionRecommendationCard({ recommendation }) {
  const summary = recommendation?.summary || {};
  const actions = Array.isArray(recommendation?.actions) ? recommendation.actions : [];

  return (
    <div className="pt-2 pb-4 space-y-4">
      <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              {summary.heading || "2-week admin action plan"}
            </p>
            <h5 className="mt-1 text-lg font-bold text-slate-950">
              Focus outreach, assessment support, and resource nudges
            </h5>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <ActionPlanPill label="Students" value={formatCellValue(summary.totalStudents)} />
            <ActionPlanPill label="Low engagement" value={formatCellValue(summary.lowEngagementCount)} />
            <ActionPlanPill label="High risk" value={formatCellValue(summary.highRiskCount)} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ProfileMiniMetric label="Hardest assessment" value={summary.hardestAssessment} className="border-blue-100 bg-white/80" />
          <ProfileMiniMetric label="Best resource type" value={summary.bestResourceType} className="border-blue-100 bg-white/80" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3">
        {actions.map((step, index) => (
          <AdminActionRow
            key={step.key || index}
            step={step}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

function AdminActionRow({ step, index }) {
  const priority = getActionPriorityDisplay(step?.priority);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Step {index + 1} · {step?.area || "Action"}
          </div>
          <h5 className="mt-1 text-sm font-bold text-slate-950">
            {step?.title || "Action item"}
          </h5>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {step?.reason || "No trigger reason available."}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${priority.className}`}>
          {priority.label}
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
          Admin action
        </span>
        <span className="ml-2 text-sm font-semibold leading-relaxed text-slate-900">
          {step?.action || "No action available."}
        </span>
      </div>
    </div>
  );
}

function RiskComparisonCard({ comparison }) {
  const students = Array.isArray(comparison?.students) ? comparison.students : [];

  if (students.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] text-slate-400 text-sm">
        No risk comparison data to display
      </div>
    );
  }

  return (
    <div className="pt-2 pb-4 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Higher-risk profile
            </div>
            <div className="mt-1 text-lg font-bold text-slate-950">
              {comparison?.summary?.title || "Risk profile comparison"}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {comparison?.summary?.comparisonNote}
            </p>
          </div>
          {Number.isFinite(Number(comparison?.summary?.riskScoreGap)) && (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              Risk gap: <strong className="text-slate-900">{formatCellValue(comparison.summary.riskScoreGap)}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 items-stretch gap-4">
        {students.map((student) => (
          <RiskComparisonStudentCard
            key={student.key}
            student={student}
            highlighted={student.studentId === comparison?.higherRiskStudentId}
          />
        ))}
      </div>
    </div>
  );
}

function RiskComparisonStudentCard({ student, highlighted }) {
  const risk = getRiskBadge(student?.riskLabel);
  const outcome = getOutcomeBadge(student?.finalOutcome);
  const flags = Array.isArray(student?.activeFlags) ? student.activeFlags : [];

  return (
    <section className={`flex h-full min-h-[360px] flex-col rounded-xl border p-4 pb-5 ${highlighted ? risk.panelClass : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {student?.displayName || "Student"}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 text-xs">
          <span className={`rounded-full border px-3 py-1 font-semibold ${risk.badgeClass}`}>
            Current risk: {risk.displayLabel}
          </span>
          <span className={`rounded-full border px-3 py-1 font-semibold ${outcome.badgeClass}`}>
            Final: {outcome.label}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <ProfileFigure label="Risk score" value={formatRiskScore(student?.riskScore)} />
        <ProfileFigure label="Avg score" value={formatNumberValue(student?.avgScore)} />
        <ProfileFigure label="Engagement" value={formatEngagementScore(student?.engagementScore)} />
        <ProfileFigure label="Punctuality" value={formatEngagementScore(student?.punctualityRate)} />
        <ProfileFigure label="Trend" value={formatSignedNumber(student?.performanceTrend)} />
        <ProfileFigure label="Previous attempts" value={formatCellValue(student?.previousAttemptCount)} />
      </div>

      <div className="mt-4 flex-1 rounded-lg border border-slate-200 bg-white/75 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Active risk signals
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {flags.length > 0 ? (
            flags.map((flag) => (
              <span
                key={flag.key}
                className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
              >
                {flag.label}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-500">No active risk flags.</span>
          )}
        </div>
      </div>
    </section>
  );
}

function AcademicBackgroundComparisonCard({ comparison }) {
  const students = Array.isArray(comparison?.students) ? comparison.students : [];

  if (students.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] text-slate-400 text-sm">
        No academic background data to display
      </div>
    );
  }

  return (
    <div className="pt-2 pb-4 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Background comparison
            </div>
            <div className="mt-1 text-lg font-bold text-slate-950">
              {comparison?.summary?.title || "Academic background comparison"}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {comparison?.summary?.comparisonNote}
            </p>
          </div>
          {Number.isFinite(Number(comparison?.summary?.scoreGap)) && (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              Gap: <strong className="text-slate-900">{formatNumberValue(comparison.summary.scoreGap)}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 items-stretch gap-4">
        {students.map((student) => (
          <AcademicBackgroundStudentCard
            key={student.key}
            student={student}
            highlighted={student.studentId === comparison?.highlightedStudentId}
            showImdContext={Boolean(comparison?.summary?.hasImdContext)}
            showSocioeconomicContext={Boolean(comparison?.summary?.hasSocioeconomicContext)}
            showDisabilityContext={Boolean(comparison?.summary?.hasDisabilityContext)}
            showSupportContext={Boolean(comparison?.summary?.hasSupportContext)}
            showFamilyContext={Boolean(comparison?.summary?.hasFamilyContext)}
          />
        ))}
      </div>
    </div>
  );
}

function AcademicBackgroundStudentCard({
  student,
  highlighted,
  showImdContext,
  showSocioeconomicContext,
  showDisabilityContext,
  showSupportContext,
  showFamilyContext,
}) {
  const hasDisability = normalizeYesNo(student?.disabilityFlag);
  return (
    <section className={`flex h-full flex-col rounded-xl border p-4 pb-5 ${highlighted ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex min-h-[32px] flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {student?.displayName || "Student"}
          </div>
        </div>
        {highlighted ? (
          <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            Higher disadvantage score
          </span>
        ) : (
          <span className="invisible rounded-full border px-3 py-1 text-xs font-semibold">
            Higher disadvantage score
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ProfileMiniMetric label="Highest education" value={student?.highestEducation} />
        <ProfileMiniMetric label="Previous attempts" value={student?.previousAttemptCount} />
        {showImdContext && (
          <ProfileMiniMetric label="IMD score" value={formatOptionalNumber(student?.imdScore)} />
        )}
        {showSocioeconomicContext && (
          <ProfileMiniMetric label="Socioeconomic band" value={student?.socioeconomicBand} />
        )}
        {showDisabilityContext && (
          <ProfileMiniMetric
            label="Disability"
            value={hasDisability}
            className={hasDisability === "Yes" ? "border-amber-100 bg-amber-50" : "border-slate-200 bg-slate-50"}
          />
        )}
        <ProfileMiniMetric label="Disadvantage score" value={formatOptionalNumber(student?.disadvantageScore)} />
        {showSupportContext && (
          <ProfileMiniMetric label="Support score" value={formatOptionalNumber(student?.supportScore)} />
        )}
        {showFamilyContext && (
          <ProfileMiniMetric label="Family stability" value={formatOptionalNumber(student?.familyStabilityScore)} />
        )}
      </div>
    </section>
  );
}

function normalizeYesNo(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(text)) return "Yes";
  if (["0", "false", "no", "n"].includes(text)) return "No";
  return formatCellValue(value);
}

function formatOptionalNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "n/a";
  return formatNumberValue(numeric);
}

function AtRiskContactQueueCard({ queue }) {
  const students = Array.isArray(queue?.students) ? queue.students : [];

  if (students.length === 0) {
    return (
      <div className="flex items-center justify-center h-[140px] text-slate-400 text-sm">
        No students currently need immediate contact.
      </div>
    );
  }

  return (
    <div className="pt-2 pb-4 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {queue?.summary?.label || "Contact priority queue"}
            </div>
            <div className="mt-1 text-lg font-bold text-slate-950">
              {queue?.summary?.title || "At-risk contact queue"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <ActionPlanPill label="High" value={formatCellValue(queue?.summary?.highCount)} />
            <ActionPlanPill label="Medium" value={formatCellValue(queue?.summary?.mediumCount)} />
            <ActionPlanPill label="Max risk score" value={formatRiskScore(queue?.summary?.highestRiskScore)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {students.map((student) => (
          <AtRiskContactStudentCard key={student.key} student={student} />
        ))}
      </div>
    </div>
  );
}

function AtRiskContactStudentCard({ student }) {
  const risk = getRiskBadge(student?.riskLabel);
  const outcome = getOutcomeBadge(student?.finalOutcome);
  const flags = Array.isArray(student?.activeFlags) ? student.activeFlags : [];

  return (
    <section className={`rounded-xl border p-4 shadow-sm ${risk.panelClass}`}>
      <div className="space-y-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Priority {student?.rank}
          </div>
          <div className="mt-1 text-lg font-bold text-slate-950">
            {student?.displayName || "Student"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full border px-3 py-1 font-semibold ${risk.badgeClass}`}>
            Current risk: {risk.displayLabel}
          </span>
          <span className={`rounded-full border px-3 py-1 font-semibold ${outcome.badgeClass}`}>
            Final: {outcome.label}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <ProfileFigure label="Risk score" value={formatRiskScore(student?.riskScore)} />
        <ProfileFigure label="Avg score" value={formatScoreValue(student?.avgScore)} />
        <ProfileFigure
          label="Engagement"
          value={student?.engagementScoreAvailable ? formatEngagementScore(student?.engagementScore) : "n/a"}
        />
        <ProfileFigure
          label="Punctuality"
          value={student?.punctualityRateAvailable ? formatEngagementScore(student?.punctualityRate) : "n/a"}
        />
      </div>

      <div className="mt-4 rounded-lg border border-white/80 bg-white/80 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Why contact
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {flags.length > 0 ? (
            flags.map((flag) => (
              <span
                key={`${flag.key}-${flag.detail}`}
                className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                title={flag.detail}
              >
                {flag.label}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-500">No active risk flags.</span>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
          Admin action
        </div>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-900">
          {student?.recommendedAdminAction || "Contact the student and confirm the current support need."}
        </p>
      </div>
    </section>
  );
}

function formatSignedNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return formatCellValue(value);
  return `${numeric >= 0 ? "+" : ""}${formatNumberValue(numeric)}`;
}

function ActionPlanPill({ label, value }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
      {label}: <strong className="text-slate-900">{value}</strong>
    </span>
  );
}

function ActionStepCard({ step, index, actionLabel = "Do next week" }) {
  const priority = getActionPriorityDisplay(step?.priority);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Step {index + 1} · {step?.area || "Action"}
          </div>
          <h5 className="mt-1 text-sm font-bold text-slate-950">
            {step?.title || "Action item"}
          </h5>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priority.className}`}>
          {priority.label}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-slate-700">
        {step?.reason || "No trigger reason available."}
      </p>
      <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
          {actionLabel}
        </div>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-900">
          {step?.action || "No action available."}
        </p>
      </div>
    </div>
  );
}

function getActionPriorityDisplay(priority) {
  const normalized = String(priority ?? "").toLowerCase();
  const map = {
    high: { label: "High", className: "border-rose-300 bg-rose-50 text-rose-700" },
    medium: { label: "Medium", className: "border-amber-300 bg-amber-50 text-amber-700" },
    low: { label: "Low", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  };
  return map[normalized] ?? { label: formatCategoricalMetricValue(priority), className: "border-slate-300 bg-slate-50 text-slate-700" };
}

function formatRiskScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "n/a";
  return `${Math.round(numeric)} / 5`;
}

function ProfileFigure({ label, value }) {
  return (
    <div className="rounded-lg border border-white/80 bg-white/80 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900 font-mono">{value}</div>
    </div>
  );
}

function ProfileMiniMetric({ label, value, className = "border-slate-200 bg-slate-50" }) {
  return (
    <div className={`rounded-lg border p-3 min-w-0 ${className}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-bold text-slate-900">
        {formatCellValue(value)}
      </div>
    </div>
  );
}

function formatCategoricalMetricValue(value) {
  if (value === null || value === undefined) return formatCellValue(value);
  if (typeof value !== "string") return formatCellValue(value);

  const trimmed = value.trim();
  if (!trimmed) return formatCellValue(value);

  const displayLabels = {
    weighted_by_assessment_weight: "Weighted by assessment weight",
    unweighted_average_fallback: "Unweighted average fallback",
    passing_but_below_target: "Passing but below target",
    below_pass_threshold: "Below pass threshold",
    strong_relative_performance: "Strong relative performance",
    on_track: "On track",
  };

  if (displayLabels[trimmed]) return displayLabels[trimmed];

  return trimmed
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function RiskStatusCard({ card }) {
  const badge = getRiskBadge(card.riskLabel);

  return (
    <div className="pt-2 pb-4 space-y-4">
      <div className={`rounded-xl border p-4 sm:p-5 ${badge.panelClass}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Current Risk Level
            </p>
            <p className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">
              {badge.displayLabel}
            </p>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${badge.badgeClass}`}>
            {badge.badgeText}
          </span>
        </div>

        <div className="mt-3 text-sm text-slate-700">
          Risk score: <span className="font-semibold">{formatCellValue(card.riskScore)}</span> / 5
        </div>
      </div>

      {Array.isArray(card.metrics) && card.metrics.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {card.metrics.map((metric) => (
            <div
              key={metric.key}
              className="bg-slate-50 rounded-lg p-3 border border-slate-200 flex flex-col gap-1 min-w-0"
            >
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
                {metric.label}
              </span>
              <MetricValue value={formatRiskMetric(metric)} size="compact" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProcrastinationSummaryCard({ card }) {
  const statusClass = card?.status?.className ?? "bg-slate-50 border-slate-200 text-slate-700";
  const metrics = Array.isArray(card?.metrics) ? card.metrics : [];

  return (
    <div className="pt-2 pb-4 space-y-4">
      <div className={`rounded-xl border p-4 sm:p-5 ${statusClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
              Procrastination status
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {card?.status?.label ?? "Unknown"}
            </p>
          </div>
          <span className="rounded-full border border-current/25 bg-white/70 px-3 py-1 text-xs font-semibold">
            {card?.status?.badge ?? "Status"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {metrics.map((metric) => (
          <div key={metric.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {metric.label}
            </span>
            <MetricValue value={formatProcrastinationMetric(metric)} size="compact" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            What this means
          </div>
          <p className="mt-1 text-sm text-slate-700">
            {card?.insight?.reason ?? "No insight available."}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Do next
          </div>
          <p className="mt-1 text-sm font-medium text-slate-800">
            {card?.insight?.action ?? "No action available."}
          </p>
        </div>
      </div>
    </div>
  );
}

function AbsenceImpactSummaryCard({ card }) {
  const statusClass = card?.status?.className ?? "bg-slate-50 border-slate-200 text-slate-700";
  const metrics = Array.isArray(card?.metrics) ? card.metrics : [];

  return (
    <div className="pt-2 pb-4 space-y-4">
      <div className={`rounded-xl border p-4 sm:p-5 ${statusClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
              Absence impact status
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {card?.status?.label ?? "Unknown"}
            </p>
          </div>
          <span className="rounded-full border border-current/25 bg-white/70 px-3 py-1 text-xs font-semibold">
            {card?.status?.badge ?? "Status"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <div
            key={metric.key}
            className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 leading-snug">
              {metric.label}
            </span>
            <MetricValue value={formatAbsenceImpactMetric(metric)} size="compact" />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMetricValue(metric) {
  const value = metric?.value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (metric.key?.endsWith("_rate") && value >= 0 && value <= 1) {
      return `${(value * 100).toFixed(1)}%`;
    }
    if (metric.key?.includes("percentile")) {
      return `${value.toFixed(1)}%`;
    }
    if (metric.key === "registration_lead_time" || metric.key === "cohort_avg_registration_lead_time") {
      return `${formatNumber(value)} days`;
    }
    if (metric.key === "lead_time_vs_cohort_days") {
      return `${value >= 0 ? "+" : ""}${formatNumber(value)} days`;
    }
    if (metric.key === "score_vs_cohort") {
      return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
    }
    if (metric.key === "score_vs_class_avg") {
      return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
    }
  }
  return value;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return formatCellValue(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getRiskBadge(label) {
  const normalized = String(label ?? "").toLowerCase();
  const map = {
    low: {
      displayLabel: "Low",
      badgeText: "LOW RISK",
      panelClass: "bg-emerald-50 border-emerald-200",
      badgeClass: "text-emerald-700 border-emerald-300 bg-emerald-100"
    },
    medium: {
      displayLabel: "Medium",
      badgeText: "MEDIUM RISK",
      panelClass: "bg-amber-50 border-amber-200",
      badgeClass: "text-amber-700 border-amber-300 bg-amber-100"
    },
    high: {
      displayLabel: "High",
      badgeText: "HIGH RISK",
      panelClass: "bg-rose-50 border-rose-200",
      badgeClass: "text-rose-700 border-rose-300 bg-rose-100"
    }
  };

  return map[normalized] ?? {
    displayLabel: "Unknown",
    badgeText: "RISK UNKNOWN",
    panelClass: "bg-slate-50 border-slate-200",
    badgeClass: "text-slate-700 border-slate-300 bg-slate-100"
  };
}

function getOutcomeBadge(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const map = {
    distinction: {
      label: "Distinction",
      badgeClass: "bg-violet-100 border-violet-300 text-violet-700",
      softClass: "border-violet-100 bg-violet-50",
    },
    pass: {
      label: "Pass",
      badgeClass: "bg-emerald-100 border-emerald-300 text-emerald-700",
      softClass: "border-emerald-100 bg-emerald-50",
    },
    fail: {
      label: "Fail",
      badgeClass: "bg-rose-100 border-rose-300 text-rose-700",
      softClass: "border-rose-100 bg-rose-50",
    },
    withdrawn: {
      label: "Withdrawn",
      badgeClass: "bg-orange-100 border-orange-300 text-orange-700",
      softClass: "border-orange-100 bg-orange-50",
    },
  };

  return map[normalized] ?? {
    label: formatCategoricalMetricValue(value),
    badgeClass: "bg-slate-100 border-slate-300 text-slate-700",
    softClass: "border-slate-200 bg-slate-50",
  };
}

function getStudyEffortDisplay(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const map = {
    very_low: { label: "Very low", className: "border-rose-100 bg-rose-50" },
    low: { label: "Low", className: "border-orange-100 bg-orange-50" },
    medium: { label: "Medium", className: "border-amber-100 bg-amber-50" },
    high: { label: "High", className: "border-emerald-100 bg-emerald-50" },
  };
  return map[normalized] ?? {
    label: formatCategoricalMetricValue(value),
    className: "border-slate-200 bg-slate-50",
  };
}

function formatNumberValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return formatCellValue(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function formatScoreValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return formatCellValue(value);
  return numeric.toFixed(2);
}

function formatEngagementScore(value) {
  if (value === null || value === undefined || value === "") return formatCellValue(value);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return formatCellValue(value);
  if (numeric >= 0 && numeric <= 1) return `${(numeric * 100).toFixed(1)}%`;
  return formatNumberValue(numeric);
}

function formatRiskMetric(metric) {
  const value = metric?.value;
  if (metric?.key === "engagement_score" && metric?.available === false) {
    return "Not available";
  }
  if (metric?.key === "punctuality_rate" && metric?.available === false) {
    return "Not available";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (metric.key === "engagement_score" && value >= 0 && value <= 1) {
      return `${(value * 100).toFixed(1)}%`;
    }
    if (metric.key.endsWith("_rate") && value >= 0 && value <= 1) {
      return `${(value * 100).toFixed(1)}%`;
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return formatCellValue(value);
}

function formatProcrastinationMetric(metric) {
  const value = metric?.value;
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "number" && Number.isFinite(value)) {
    if (metric.key === "punctuality_rate") return `${(value * 100).toFixed(0)}%`;
    if (metric.key === "avg_late_delay" || metric.key === "max_delay") {
      return `${value.toFixed(1)} days`;
    }
    if (metric.key === "score_gap") {
      return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
    }
  }
  return formatCellValue(value);
}

function formatAbsenceImpactMetric(metric) {
  const value = metric?.value;
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "number" && Number.isFinite(value)) {
    if (metric.key === "absence_rate") return `${(value * 100).toFixed(1)}%`;
    if (metric.key === "performance_trend") {
      if (value === 0) return "0.00";
      return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
    }
    if (metric.key === "avg_score" || metric.key === "latest_score") {
      return value.toFixed(2);
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return formatCellValue(value);
}
