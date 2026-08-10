/**
 * TaskDetailPanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Task 2: Task detail panel (metadata display, required fields, output type)
 * Task 3: Analytics execution trigger UI (select task → run → loading state)
 *
 * Hiển thị full metadata của task đang được chọn:
 *   - Actionable question (câu hỏi phân tích)
 *   - Required params (student_id, class_id, etc.)
 *   - Output type (viz_type, explanation_strategy)
 *   - Run Analysis button với param inputs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useAppContext } from "../../contexts/AppContext";

// ── Infer required params from task scope ────────────────────────────────────
function getRequiredParams(task) {
  if (!task) return [];

  const params = [
    { key: "batch_id", label: "Dataset Batch", autoFill: true },
    { key: "class_id", label: "Class", autoFill: true },
  ];

  const scope = (task.scope || "").toLowerCase();

  if (scope.includes("1 student") || scope.includes("single")) {
    params.push({ key: "student_id", label: "Student ID", autoFill: false });
  }

  if (scope.includes("comparison") || scope.includes("2 student")) {
    params.push({ key: "s1", label: "Student 1 ID", autoFill: false });
    params.push({ key: "s2", label: "Student 2 ID", autoFill: false });
  }

  // OULAD engagement tasks may need enrollment_id
  if (task.taskId && ["S-T05", "S-T06"].includes(task.taskId)) {
    params.push({ key: "enrollment_id", label: "Enrollment ID", autoFill: false });
  }

  return params;
}

// ── Confidence badge ─────────────────────────────────────────────────────────
const CONFIDENCE_STYLES = {
  HIGH:   "bg-emerald-100 text-emerald-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW:    "bg-orange-100 text-orange-700",
};

// ── Capabilities not available in UCI dataset ─────────────────────────────────
// Keep in sync with TaskListPanel.jsx
const UCI_MISSING_CAPS = new Set([
  "engagement_tracking", "resource_clickstream",
  "temporal_activity", "submission_timestamps",
]);

export default function TaskDetailPanel({ task, onRun, isRunning }) {
  const { activeDataset } = useAppContext();
  const [paramState, setParamState] = useState({ key: "", values: {} });
  const paramScopeKey = `${task?.taskId ?? ""}:${activeDataset?.id ?? ""}`;
  const defaultParamValues = activeDataset?.id
    ? { batch_id: activeDataset.id }
    : {};
  const paramValues = paramState.key === paramScopeKey
    ? paramState.values
    : defaultParamValues;

  // ── Detect dataset incompatibility ────────────────────────────────────────
  const activeSource = activeDataset?.source ?? "";
  const incompatibleCaps = activeSource === "UCI"
    ? (task?.requiredCapabilities ?? []).filter(c => UCI_MISSING_CAPS.has(c))
    : [];
  const isIncompatible = incompatibleCaps.length > 0;

  if (!task) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">Select a task from the list to view details</p>
        </div>
      </div>
    );
  }

  const requiredParams = getRequiredParams(task);

  const handleParamChange = (key, value) => {
    setParamState((previous) => ({
      key: paramScopeKey,
      values: {
        ...(previous.key === paramScopeKey
          ? previous.values
          : defaultParamValues),
        [key]: value,
      },
    }));
  };

  const handleRun = () => {
    if (onRun) onRun(task.taskId, paramValues);
  };

  // Check if all non-autoFill params are provided
  const canRun = requiredParams
    .filter((p) => !p.autoFill)
    .every((p) => paramValues[p.key]?.trim());

  return (
    <div className="p-5 space-y-5 overflow-y-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <code className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
            {task.taskId}
          </code>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
            {task.scope}
          </span>
        </div>
        <h3 className="text-lg font-semibold text-slate-800">{task.taskName}</h3>
      </div>

      {/* Actionable Question */}
      {task.actionableQuestion && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-xs font-medium text-blue-600 mb-1">Analytical Question</p>
          <p className="text-sm text-blue-800">{task.actionableQuestion}</p>
        </div>
      )}

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetaItem label="Visualization" value={task.viz_type?.replace("_", " ")} />
        <MetaItem label="Analysis Type" value={task.analytics?.analysisType?.replace("_", " ")} />
        <MetaItem label="Strategy" value={task.explanation_strategy} />
        <MetaItem label="Dataset" value={task.datasetCompatibility} />
        {task.target_audience && (
          <MetaItem label="Audience" value={task.target_audience?.join(", ")} />
        )}
        {task.analysis_context?.granularity && (
          <MetaItem label="Granularity" value={task.analysis_context.granularity} />
        )}
      </div>

      {/* Required Fields (source tables) */}
      {task.sourceTables?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1.5">Source Tables</p>
          <div className="flex flex-wrap gap-1.5">
            {task.sourceTables.map((t) => (
              <span key={t} className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <hr className="border-slate-200" />

      {/* Run Parameters */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">Parameters</p>
        <div className="space-y-2.5">
          {requiredParams.map((param) => (
            <div key={param.key}>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {param.label}
                {!param.autoFill && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <input
                type="text"
                value={paramValues[param.key] || ""}
                onChange={(e) => handleParamChange(param.key, e.target.value)}
                disabled={param.autoFill}
                placeholder={param.autoFill ? "(auto-filled from active dataset)" : `Enter ${param.label.toLowerCase()}...`}
                className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors
                  ${param.autoFill
                    ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed"
                    : "bg-white border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dataset incompatibility warning */}
      {isIncompatible && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-300">
          <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ Not available for {activeSource} dataset</p>
          <p className="text-xs text-amber-600">
            This task requires{" "}
            <span className="font-mono font-semibold">{incompatibleCaps.join(", ")}</span>
            {" "}— not present in {activeSource} data. Switch to an OULAD dataset to use this task.
          </p>
        </div>
      )}

      {/* Run Button */}
      <button
        onClick={handleRun}
        disabled={isRunning || !canRun || isIncompatible}
        className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all
          ${isRunning || !canRun || isIncompatible
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] shadow-sm"
          }`}
      >
        {isRunning ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            Running...
          </span>
        ) : isIncompatible ? (
          "⚠️ Dataset Incompatible"
        ) : (
          "▶ Run Analysis"
        )}
      </button>
    </div>
  );
}

// ── Helper Component ──────────────────────────────────────────────────────────
function MetaItem({ label, value }) {
  if (!value) return null;
  return (
    <div className="p-2.5 rounded-lg bg-slate-50">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-700 font-medium mt-0.5 capitalize">{value}</p>
    </div>
  );
}
