import { formatCellValue } from "../../utils/responseTransformer";
import { getChecklistDisplayValue } from "../../chartAdapters/checklist.adapter";

export default function ChecklistView({ data }) {
  const items = data?.items ?? [];
  const summary = data?.summary ?? null;

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-[160px] text-slate-400 text-sm">
        No checklist data to display
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2 pb-4">
      {summary && (
        <ChecklistSummary summary={summary} />
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <ChecklistItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function ChecklistSummary({ summary }) {
  const severityStyle = getSeverityStyle(summary.highestSeverity);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4 flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
        Risk Checklist Summary
      </span>
      <span className="text-xs text-slate-700">
        Active flags: <span className="font-semibold">{summary.triggered}</span> / {summary.total}
      </span>
      {summary.unavailable > 0 && (
        <span className="text-xs text-slate-600">
          Unavailable: <span className="font-semibold">{summary.unavailable}</span>
        </span>
      )}
      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${severityStyle.badgeClass}`}>
        Highest severity: {capitalize(summary.highestSeverity)}
      </span>
    </div>
  );
}

function ChecklistItem({ item }) {
  const status = !item.available ? "Unavailable" : item.triggered ? "Triggered" : "Stable";
  const statusStyle = !item.available
    ? "text-slate-700 bg-slate-100 border-slate-300"
    : item.triggered
      ? "text-rose-700 bg-rose-100 border-rose-300"
      : "text-emerald-700 bg-emerald-100 border-emerald-300";
  const severityStyle = getSeverityStyle(item.severity);

  return (
    <div className={`rounded-xl border p-4 sm:p-5 ${severityStyle.panelClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-semibold text-slate-800">
          {humanizeFlagName(item.flagName)}
        </h5>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusStyle}`}>
            {status}
          </span>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${severityStyle.badgeClass}`}>
            Severity: {capitalize(item.severity)}
          </span>
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-700">
        {item.description || "No description available for this flag."}
      </p>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="bg-white/80 border border-slate-200 rounded-md px-3 py-2">
          <span className="text-slate-500 uppercase tracking-wider">Current value</span>
          <div className="mt-1 font-mono text-slate-800">
            {getChecklistDisplayValue(item.flagName, item.currentValue)}
          </div>
        </div>
        <div className="bg-white/80 border border-slate-200 rounded-md px-3 py-2">
          <span className="text-slate-500 uppercase tracking-wider">Risk rule</span>
          <div className="mt-1 font-mono text-slate-800">{item.riskRule || formatCellValue(item.threshold)}</div>
        </div>
        <div className="bg-white/80 border border-slate-200 rounded-md px-3 py-2">
          <span className="text-slate-500 uppercase tracking-wider">Support area</span>
          <div className="mt-1 font-semibold text-slate-800">{formatSupportCategory(item.supportCategory)}</div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Recommended action
        </span>
        <p className="mt-1 text-sm text-slate-800">
          {item.recommendedAction || "No action provided."}
        </p>
      </div>
    </div>
  );
}

function getSeverityStyle(severity) {
  const map = {
    high: {
      panelClass: "bg-rose-50 border-rose-200",
      badgeClass: "text-rose-700 bg-rose-100 border-rose-300"
    },
    medium: {
      panelClass: "bg-amber-50 border-amber-200",
      badgeClass: "text-amber-700 bg-amber-100 border-amber-300"
    },
    low: {
      panelClass: "bg-sky-50 border-sky-200",
      badgeClass: "text-sky-700 bg-sky-100 border-sky-300"
    },
    info: {
      panelClass: "bg-slate-50 border-slate-200",
      badgeClass: "text-slate-700 bg-slate-100 border-slate-300"
    }
  };
  return map[severity] ?? map.info;
}

function humanizeFlagName(text) {
  return String(text ?? "")
    .replace(/^flag_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSupportCategory(value) {
  const labels = {
    academic_performance: "Academic Performance",
    academic_history: "Academic History",
    attendance: "Attendance",
    engagement: "Engagement",
    time_management: "Time Management",
    trend_monitoring: "Trend Monitoring",
    monitor: "Monitoring",
    general: "General",
  };
  const key = String(value ?? "").trim().toLowerCase();
  return labels[key] ?? humanizeFlagName(value);
}

function capitalize(text) {
  const value = String(text ?? "");
  if (!value) return "";
  return value[0].toUpperCase() + value.slice(1);
}
