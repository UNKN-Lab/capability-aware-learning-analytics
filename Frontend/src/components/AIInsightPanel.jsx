import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getAIExplanation } from "../services/analyticsApi";

const PRIORITY = {
  low: { bg: "bg-slate-100", text: "text-slate-700" },
  medium: { bg: "bg-blue-50", text: "text-blue-700" },
  high: { bg: "bg-amber-50", text: "text-amber-700" },
};

const INSIGHT_TONE = {
  low: { accent: "border-l-slate-300", dot: "bg-slate-400" },
  medium: { accent: "border-l-blue-400", dot: "bg-blue-500" },
  high: { accent: "border-l-blue-500", dot: "bg-blue-600" },
};

const CONFIDENCE = {
  HIGH: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  MEDIUM: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  LOW: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
};

export default function AIInsightPanel({
  taskId,
  executionId,
  datasets,
  meta,
  studentContext,
}) {
  const [aiOutput, setAiOutput] = useState(null);

  const mutation = useMutation({
    mutationFn: (payload) => getAIExplanation(payload),
    onSuccess: (data) => setAiOutput(data),
  });

  const isDegraded = aiOutput?.degraded === true;
  const explanation = aiOutput?.explanation;
  const confidence = aiOutput?.confidence;
  const confStyle = CONFIDENCE[confidence?.level] || {};
  const hideActionCardDuplicateSections = ["A-G03", "A-G16"].includes(taskId);
  const educationalImplications = hideActionCardDuplicateSections
    ? []
    : explanation?.educational_implications;
  const recommendations = hideActionCardDuplicateSections
    ? []
    : explanation?.recommendations;

  const handleExplain = () => {
    mutation.mutate({ taskId, executionId, datasets, meta, studentContext });
  };

  if (!taskId || !datasets) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-900">AI Explanation</h4>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
            Narrative summary from the current result
          </p>
        </div>
        {aiOutput && confidence?.level && (
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${confStyle.bg} ${confStyle.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${confStyle.dot}`} />
            {confidence.level}
          </span>
        )}
      </div>

      <div className="space-y-5 p-4">
        {!aiOutput && !mutation.isPending && !mutation.isError && (
          <button
            onClick={handleExplain}
            className="flex w-full items-center justify-center rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98]"
          >
            Get AI Explanation
          </button>
        )}

        {mutation.isPending && <ExplanationSkeleton />}

        {mutation.isError && !aiOutput && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-700">AI explanation failed</p>
            <p className="mt-1 text-xs text-red-500">{mutation.error?.message}</p>
            <button
              onClick={handleExplain}
              className="mt-2 text-xs font-medium text-red-600 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {isDegraded && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">AI Service Unavailable</p>
            <p className="mt-1 text-xs leading-5 text-amber-700">
              AI explanation is temporarily unavailable. Your chart data is still fully accurate; only the narrative explanation is affected.
            </p>
            {explanation?.warnings?.length > 0 && (
              <p className="mt-1 text-xs text-amber-600">{explanation.warnings[0]}</p>
            )}
            <button
              onClick={handleExplain}
              className="mt-2 text-xs font-medium text-amber-700 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {explanation && !isDegraded && (
          <>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-sm leading-7 text-slate-700">{explanation.summary}</p>
            </div>

            {explanation.insights?.length > 0 && (
              <section className="pt-2">
                <SectionTitle>Key Insights</SectionTitle>
                <div className="space-y-3">
                  {explanation.insights.map((insight, index) => (
                    <InsightCard key={index} insight={insight} />
                  ))}
                </div>
              </section>
            )}

            {educationalImplications?.length > 0 && (
              <section className="pt-2">
                <SectionTitle>Educational Implications</SectionTitle>
                <ul className="space-y-3">
                  {educationalImplications.map((item, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-xs leading-6 text-slate-600">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {recommendations?.length > 0 && (
              <section className="pt-2">
                <SectionTitle>Recommendations</SectionTitle>
                <div className="space-y-3">
                  {recommendations.map((rec, index) => {
                    const prio = PRIORITY[rec.priority] || PRIORITY.medium;
                    return (
                      <div key={index} className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${prio.bg} ${prio.text}`}>
                          {rec.priority || "medium"}
                        </span>
                        <p className="mt-3 text-xs font-semibold leading-6 text-slate-700">{rec.action}</p>
                        {rec.rationale && (
                          <p className="mt-1.5 text-[10px] leading-5 text-slate-500">{rec.rationale}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {explanation.warnings?.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <h5 className="mb-1 text-xs font-semibold text-amber-700">Data Warnings</h5>
                {explanation.warnings.map((warning, index) => (
                  <p key={index} className="text-xs leading-5 text-amber-600">{warning}</p>
                ))}
              </div>
            )}

            {aiOutput.safety_flags?.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                <p className="text-[10px] font-medium text-red-600">
                  Safety flags: {aiOutput.safety_flags.join(", ")}
                </p>
              </div>
            )}

            {confidence?.reason && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[10px] leading-5 text-slate-500">
                <strong className="text-slate-600">Confidence:</strong> {confidence.reason}
                {confidence.based_on?.length > 0 && (
                  <span className="ml-1 text-slate-400">
                    ({confidence.based_on.join(", ")})
                  </span>
                )}
              </div>
            )}

            {aiOutput.meta && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-[9px] leading-4 text-slate-400 sm:grid-cols-3">
                {aiOutput.ai_summary_method && (
                  <span>
                    AI Summary Method: {aiOutput.ai_summary_method}
                    {aiOutput.ai_summary_version ? ` ${aiOutput.ai_summary_version}` : ""}
                  </span>
                )}
                {aiOutput.meta.model && <span>Model: {aiOutput.meta.model}</span>}
                {aiOutput.meta.latency_ms && <span>{aiOutput.meta.latency_ms}ms</span>}
                {aiOutput.meta.token_usage && (
                  <span>{aiOutput.meta.token_usage.total_tokens} tokens</span>
                )}
                {aiOutput.meta.cost_usd != null && (
                  <span>${aiOutput.meta.cost_usd.toFixed(5)}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h5 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </h5>
  );
}

function InsightCard({ insight }) {
  const tone = INSIGHT_TONE[insight.severity] || INSIGHT_TONE.medium;
  return (
    <div className={`rounded-lg border border-l-4 border-slate-200 ${tone.accent} bg-white p-4 shadow-sm`}>
      <div className="mb-2 flex items-center gap-2.5">
        <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
        <p className="text-xs font-semibold text-slate-900">{insight.title}</p>
      </div>
      <p className="text-xs leading-6 text-slate-600">{insight.description}</p>
      {insight.evidence?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {insight.evidence.map((evidence, index) => (
            <span key={index} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-mono text-slate-500">
              {evidence.metric}: {evidence.value}
              {evidence.delta != null ? ` (${evidence.delta > 0 ? "+" : ""}${evidence.delta})` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ExplanationSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 w-3/4 rounded bg-slate-200" />
      <div className="h-3 w-full rounded bg-slate-200" />
      <div className="h-3 w-5/6 rounded bg-slate-200" />
      <div className="mt-2 h-16 rounded-lg bg-slate-100" />
      <div className="h-12 rounded-lg bg-slate-100" />
      <div className="mt-2 flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-slate-500" />
        <span className="text-xs text-slate-400">AI is analyzing your data...</span>
      </div>
    </div>
  );
}
