/**
 * TaskListPanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Task 1: Task list UI (filter, search, tag-based browsing)
 *
 * Hiển thị danh sách 53 analytical tasks dạng card list.
 * Mỗi card show: taskId, taskName, scope, viz_type, analysisType.
 * Click → onSelect(task) để parent hiển thị detail panel.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useTaskRegistry } from "../../hooks/useTaskRegistry";
import { useAppContext } from "../../contexts/AppContext";
import TaskFilters from "./TaskFilters";

// ── Viz type badge colors ───────────────────────────────────────────────────
const VIZ_COLORS = {
  line_chart:   "bg-blue-100 text-blue-700",
  bar_chart:    "bg-amber-100 text-amber-700",
  histogram:    "bg-amber-100 text-amber-700",
  scatter_plot: "bg-purple-100 text-purple-700",
  pie_chart:    "bg-pink-100 text-pink-700",
  heatmap:      "bg-orange-100 text-orange-700",
  table:        "bg-slate-100 text-slate-700",
};

const VIZ_ICONS = {
  line_chart:   "📈",
  bar_chart:    "📊",
  histogram:    "📊",
  scatter_plot: "🔵",
  pie_chart:    "🥧",
  heatmap:      "🌡️",
  table:        "📋",
};

// ── Capabilities not available in UCI dataset ─────────────────────────────────
// Keep in sync with TaskDetailPanel.jsx
const UCI_MISSING_CAPS = new Set([
  "engagement_tracking", "resource_clickstream",
  "temporal_activity", "submission_timestamps",
]);

export default function TaskListPanel({ selectedTaskId, onSelect }) {
  const [filters, setFilters] = useState({});
  const { tasks, count, isLoading, isError, error } = useTaskRegistry(filters);
  const { activeDataset } = useAppContext();

  // ── Detect dataset incompatibility ────────────────────────────────────────
  const activeSource = activeDataset?.source ?? "";
  function isTaskIncompatible(task) {
    if (activeSource !== "UCI") return false;
    return (task.requiredCapabilities ?? []).some(c => UCI_MISSING_CAPS.has(c));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">
          Analytical Tasks
          {count > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({count})
            </span>
          )}
        </h2>
        <TaskFilters filters={filters} onChange={setFilters} />
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" />
            <span className="ml-2 text-sm text-slate-500">Loading tasks...</span>
          </div>
        )}

        {isError && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-700 font-medium">Failed to load tasks</p>
            <p className="text-xs text-red-500 mt-1">{error?.message}</p>
          </div>
        )}

        {!isLoading && !isError && tasks.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400 text-sm">No tasks match your filters.</p>
            <button
              onClick={() => setFilters({})}
              className="mt-2 text-xs text-emerald-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {tasks.map((task) => {
          const incompatible = isTaskIncompatible(task);
          return (
            <button
              key={task.taskId}
              onClick={() => onSelect(task)}
              className={`w-full text-left p-3 rounded-lg border transition-all
                ${
                  selectedTaskId === task.taskId
                    ? "border-emerald-400 bg-emerald-50 shadow-sm"
                    : incompatible
                    ? "border-slate-200 bg-slate-50 opacity-50 hover:opacity-70"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
            >
              {/* Row 1: ID + Name */}
              <div className="flex items-start gap-2">
                <code className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                  {task.taskId}
                </code>
                <span className="text-sm font-medium text-slate-800 leading-tight">
                  {task.taskName}
                </span>
              </div>

              {/* Row 2: Tags */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {/* Viz type */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${VIZ_COLORS[task.viz_type] || "bg-slate-100 text-slate-600"}`}>
                  {VIZ_ICONS[task.viz_type] || "📊"} {task.viz_type?.replace("_", " ")}
                </span>

                {/* Scope */}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                  {task.scope}
                </span>

                {/* Dataset compat */}
                {task.datasetCompatibility && task.datasetCompatibility !== "both" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700">
                    {task.datasetCompatibility}
                  </span>
                )}

                {/* Incompatibility badge */}
                {incompatible && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">
                    ⚠️ OULAD only
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
