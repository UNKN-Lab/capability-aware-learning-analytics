/**
 * ResultDisplay.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Task 4+5: Response handler → Basic result display (table + raw JSON)
 *
 * Hiển thị kết quả analytics execution dưới 2 dạng:
 *   1. Data Table — bảng dữ liệu với columns tự động infer từ response
 *   2. Raw JSON — collapsible JSON viewer cho debugging/verification
 *
 * Phase 3 sẽ thay thế bằng ChartRenderer. Phase 2 cần table view trước.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import {
  transformToTableData,
  formatCellValue,
  extractQualitySummary,
} from "../../utils/responseTransformer";

// ── Confidence badge styles ─────────────────────────────────────────────────
const CONFIDENCE_STYLES = {
  HIGH:   { bg: "bg-emerald-100", text: "text-emerald-700", icon: "🟢" },
  MEDIUM: { bg: "bg-yellow-100",  text: "text-yellow-700",  icon: "🟡" },
  LOW:    { bg: "bg-orange-100",  text: "text-orange-700",  icon: "🟠" },
};

export default function ResultDisplay({ result }) {
  const [viewMode, setViewMode] = useState("table"); // "table" | "json"
  const [expandedJson, setExpandedJson] = useState(false);

  if (!result) return null;

  const { datasets, meta, executionId } = result;
  const tableDatasets = transformToTableData(datasets);
  const quality = extractQualitySummary(meta);
  const confStyle = CONFIDENCE_STYLES[quality?.confidence] || CONFIDENCE_STYLES.MEDIUM;

  return (
    <div className="space-y-4">
      {/* ── Quality Summary Bar ──────────────────────────────────────────── */}
      {quality && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-3">
            {/* Confidence badge */}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${confStyle.bg} ${confStyle.text}`}>
              {confStyle.icon} {quality.confidence}
            </span>
            <span className="text-xs text-slate-500">{quality.reason}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>⏱ {quality.queryTime}ms</span>
            {quality.isMultiQuery && <span>📊 {quality.queryCount} queries</span>}
          </div>
        </div>
      )}

      {/* Warnings */}
      {quality?.warnings?.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          {quality.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">⚠️ {w}</p>
          ))}
        </div>
      )}

      {/* ── View Mode Toggle ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 w-fit">
        <button
          onClick={() => setViewMode("table")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
            ${viewMode === "table"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
            }`}
        >
          📋 Table
        </button>
        <button
          onClick={() => setViewMode("json")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
            ${viewMode === "json"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
            }`}
        >
          {"{ }"} JSON
        </button>
      </div>

      {/* ── Table View ───────────────────────────────────────────────────── */}
      {viewMode === "table" && (
        <div className="space-y-4">
          {tableDatasets.map((ds) => (
            <div key={ds.label} className="border border-slate-200 rounded-lg overflow-hidden">
              {/* Dataset label header */}
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <code className="text-xs font-semibold text-slate-600">{ds.label}</code>
                <span className="text-[10px] text-slate-400">{ds.rowCount} rows</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/50">
                      {ds.columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ds.rows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                      >
                        {ds.columns.map((col) => (
                          <td key={col} className="px-3 py-2 text-xs text-slate-700 font-mono">
                            {formatCellValue(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {ds.rowCount === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">
                  No data returned for this query.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── JSON View ────────────────────────────────────────────────────── */}
      {viewMode === "json" && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Raw API Response</span>
            <button
              onClick={() => setExpandedJson(!expandedJson)}
              className="text-[10px] text-emerald-600 hover:underline"
            >
              {expandedJson ? "Collapse" : "Expand full"}
            </button>
          </div>
          <pre className={`p-4 text-xs font-mono text-slate-700 bg-white overflow-x-auto
            ${expandedJson ? "" : "max-h-80"}`}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {/* Execution ID footer */}
      <p className="text-[10px] text-slate-400 text-right">
        Execution: <code className="text-slate-500">{executionId}</code>
      </p>
    </div>
  );
}
