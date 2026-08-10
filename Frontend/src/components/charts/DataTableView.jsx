/**
 * DataTableView.jsx — Styled data table for table viz_type.
 * Receives adapted { columns, rows } from table.adapter.js.
 */

import { formatCellValue } from "../../utils/responseTransformer";
import { getSemanticTag } from "../../utils/tableSemantic";

export default function DataTableView({ data, config }) {
  if (data?.type === "action_plan") {
    return <ActionPlanView plan={data} />;
  }

  const { columns, rows } = data;

  if (!rows || rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-[380px] text-slate-400 text-sm">
        No data to display
      </div>
    );
  }

  if (config?.__task_id === "A-S07") {
    return <BackgroundContextView row={rows[0]} />;
  }

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="border-b border-slate-100 hover:bg-emerald-50/30 transition-colors"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-4 py-2 text-xs text-slate-700 font-mono"
                >
                  {renderCellValue(col.key, row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400">
        {rows.length} rows
      </div>
    </div>
  );
}

function ActionPlanView({ plan }) {
  const actions = plan?.actions ?? [];
  const summary = plan?.summary ?? {};

  if (actions.length === 0) {
    return (
      <div className="flex items-center justify-center h-[180px] text-slate-400 text-sm">
        No action plan to display
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2 pb-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold uppercase tracking-wider text-slate-700">
            Next-week plan
          </span>
          <SummaryPill label="Risk" value={summary.riskLabel} />
          <SummaryPill label="Risk score" value={summary.riskScore} />
          <SummaryPill label="Avg score" value={summary.avgScore} />
          <SummaryPill label="Engagement" value={summary.engagementScore} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {actions.map((action, index) => (
          <div key={action.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Step {index + 1} · {action.signal}
                </div>
                <h5 className="mt-1 text-sm font-semibold text-slate-900">
                  {action.title}
                </h5>
              </div>
              <PriorityBadge priority={action.priority} />
            </div>

            <p className="mt-3 text-sm text-slate-600">
              {action.reason}
            </p>

            <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                Do next week
              </div>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {action.action}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BackgroundContextView({ row }) {
  const contextItems = [
    { label: "School", value: formatSchool(row?.school) },
    { label: "Gender", value: formatGender(row?.gender) },
    { label: "Age", value: formatAge(row?.age_years, row?.age_group) },
    { label: "Family Size", value: formatFamilySize(row?.family_size) },
    { label: "Mother Education", value: formatEducation(row?.mother_education_level ?? row?.highest_education) },
    { label: "Father Education", value: formatEducation(row?.father_education_level ?? row?.highest_education) },
  ];

  const supportItems = [
    { label: "School Support", value: formatYesNo(row?.school_support_flag), tone: getYesNoTone(row?.school_support_flag) },
    { label: "Family Support", value: formatYesNo(row?.family_support_flag), tone: getYesNoTone(row?.family_support_flag) },
    { label: "Paid Classes", value: formatYesNo(row?.has_paid_class), tone: getYesNoTone(row?.has_paid_class) },
    { label: "Internet Access", value: formatYesNo(row?.internet_access_flag), tone: getYesNoTone(row?.internet_access_flag) },
  ];

  const signalItems = [
    { label: "Support Score", value: formatDecimal(row?.support_score) },
    { label: "Lifestyle Risk", value: formatDecimal(row?.lifestyle_risk_score) },
    { label: "Social Balance", value: formatDecimal(row?.social_balance_score) },
    { label: "Family Stability", value: formatDecimal(row?.family_stability_score) },
    { label: "Study Time", value: formatStudyTime(row?.studytime) },
    { label: "Absences", value: formatCount(row?.absences) },
    { label: "Previous Attempts", value: formatCount(row?.previous_attempt_count) },
  ];

  return (
    <div className="space-y-4">
      <ContextSection title="Background Profile" items={contextItems} />
      <ContextSection title="Available Support" items={supportItems} />
      <ContextSection title="Context Signals" items={signalItems} compact />
    </div>
  );
}

function ContextSection({ title, items, compact = false }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
        {items.map((item) => (
          <div key={item.label} className="min-h-[72px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {item.label}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {item.tone ? (
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${item.tone}`}>
                  {item.value}
                </span>
              ) : (
                item.value
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryPill({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
      <span className="text-slate-500">{label}:</span>
      <span className="font-semibold text-slate-800">{formatCellValue(value)}</span>
    </span>
  );
}

function PriorityBadge({ priority }) {
  const normalized = String(priority ?? "").toLowerCase();
  const classes = {
    high: "border-rose-300 bg-rose-100 text-rose-700",
    medium: "border-amber-300 bg-amber-100 text-amber-700",
    low: "border-sky-300 bg-sky-100 text-sky-700",
    maintain: "border-emerald-300 bg-emerald-100 text-emerald-700",
  };

  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${classes[normalized] ?? classes.low}`}>
      {priority}
    </span>
  );
}

function renderCellValue(columnKey, value) {
  const semantic = getSemanticTag(columnKey, value);
  const label = semantic?.label ?? formatCellValue(value);

  if (!semantic) {
    return label;
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${semantic.className}`}>
      {label}
    </span>
  );
}

function formatSchool(value) {
  const code = String(value ?? "").trim().toUpperCase();
  const labels = {
    GP: "Gabriel Pereira",
    MS: "Mousinho da Silveira",
  };
  if (!code) return "—";
  return labels[code] ? `${labels[code]} (${code})` : code;
}

function formatGender(value) {
  const code = String(value ?? "").trim().toUpperCase();
  if (code === "F") return "Female";
  if (code === "M") return "Male";
  return value ? String(value) : "—";
}

function formatAge(ageYears, ageGroup) {
  const age = ageYears === null || ageYears === undefined || ageYears === "" ? null : String(ageYears);
  const group = ageGroup === null || ageGroup === undefined || ageGroup === "" ? null : String(ageGroup);
  if (age && group) return `${age} (${group})`;
  return age || group || "—";
}

function formatFamilySize(value) {
  const code = String(value ?? "").trim().toUpperCase();
  if (code === "LE3") return "3 or fewer";
  if (code === "GT3") return "More than 3";
  return value ? String(value) : "—";
}

function formatEducation(value) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  const numeric = Number(text);
  const labels = {
    0: "None",
    1: "Primary education",
    2: "5th-9th grade",
    3: "Secondary education",
    4: "Higher education",
  };
  return Number.isFinite(numeric) && labels[numeric] ? labels[numeric] : text;
}

function formatYesNo(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  const text = String(value ?? "").trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(text)) return "Yes";
  if (["no", "n", "false", "0"].includes(text)) return "No";
  return text ? String(value) : "—";
}

function getYesNoTone(value) {
  const label = formatYesNo(value);
  if (label === "Yes") return "border-emerald-300 bg-emerald-100 text-emerald-700";
  if (label === "No") return "border-slate-300 bg-white text-slate-600";
  return "border-slate-300 bg-slate-100 text-slate-600";
}

function formatDecimal(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return numeric.toFixed(2);
}

function formatCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatStudyTime(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  const labels = {
    1: "< 2 hours",
    2: "2-5 hours",
    3: "5-10 hours",
    4: "> 10 hours",
  };
  return labels[numeric] ?? String(value);
}
