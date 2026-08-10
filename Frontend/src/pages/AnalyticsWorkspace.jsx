/**
 * AnalyticsWorkspace.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2+3 workspace tổng hợp:
 *   Left panel:  TaskListPanel (browse, filter, search tasks)
 *   Right panel: TaskDetailPanel (metadata + params + Run button)
 *                + ChartRenderer (viz_type-driven chart)
 *                + AIInsightPanel (structured AI explanation)
 *                + ResultDisplay (table/JSON fallback)
 *
 * Flow: User browses tasks → clicks one → sees metadata → fills params →
 *       clicks Run → sees chart + can request AI explanation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useAnalytics } from "../hooks/useAnalytics";
import TaskListPanel from "../components/analytics/TaskListPanel";
import TaskDetailPanel from "../components/analytics/TaskDetailPanel";
import ResultDisplay from "../components/analytics/ResultDisplay";
import ChartRenderer from "../components/ChartRenderer";
import AIInsightPanel from "../components/AIInsightPanel";

export default function AnalyticsWorkspace() {
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewMode, setViewMode] = useState("chart"); // "chart" | "raw"
  const { run, result, isRunning, isError, runError, reset } = useAnalytics();

  const handleSelectTask = (task) => {
    setSelectedTask(task);
    reset();
  };

  const handleRun = (taskId, params) => {
    run(taskId, params);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50">
      {/* ── Left Panel: Task List ──────────────────────────────────────── */}
      <div className="w-[380px] shrink-0 border-r border-slate-200 bg-white overflow-hidden flex flex-col">
        <TaskListPanel
          selectedTaskId={selectedTask?.taskId}
          onSelect={handleSelectTask}
        />
      </div>

      {/* ── Right Panel: Detail + Results ──────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top: Task Detail + Run */}
        <div className="shrink-0 border-b border-slate-200 bg-white max-h-[50%] overflow-y-auto">
          <TaskDetailPanel
            task={selectedTask}
            onRun={handleRun}
            isRunning={isRunning}
          />
        </div>

        {/* Bottom: Results */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Error state */}
          {isError && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm font-medium text-red-700">Execution failed</p>
              <p className="text-xs text-red-500 mt-1">{runError?.message}</p>
              {runError?.response?.error && (
                <pre className="mt-2 text-xs text-red-400 font-mono bg-red-50 p-2 rounded">
                  {JSON.stringify(runError.response.error, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Results area */}
          {result && (
            <>
              {/* View mode toggle */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 w-fit">
                <button
                  onClick={() => setViewMode("chart")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                    ${viewMode === "chart"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                  📊 Chart
                </button>
                <button
                  onClick={() => setViewMode("raw")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                    ${viewMode === "raw"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                  📋 Raw Data
                </button>
              </div>

              {/* Chart view */}
              {viewMode === "chart" && selectedTask && (
                <ChartRenderer
                  taskMeta={selectedTask}
                  datasets={result.datasets}
                  isLoading={isRunning}
                />
              )}

              {/* Raw data view */}
              {viewMode === "raw" && <ResultDisplay result={result} />}

              {/* AI Insight Panel — always visible when chart is shown */}
              {viewMode === "chart" && result.datasets && (
                <AIInsightPanel
                  taskId={result.taskId}
                  executionId={result.executionId}
                  datasets={result.datasets}
                  meta={result.meta}
                  studentContext={null}
                />
              )}
            </>
          )}

          {/* Empty state: task selected but no result */}
          {!result && !isRunning && !isError && selectedTask && (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-3">🚀</p>
                <p className="text-sm">Fill in the parameters above and click <strong>Run Analysis</strong></p>
              </div>
            </div>
          )}

          {/* Empty state: no task selected */}
          {!selectedTask && (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <p className="text-4xl mb-3">👈</p>
                <p className="text-sm">Select a task from the left panel to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
