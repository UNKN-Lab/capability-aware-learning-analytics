/**
 * TaskFilters.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Filter bar cho Task list — scope filter + search input + analysis type tags.
 * Các filter được lift up ra ngoài qua onChange callback để parent quản lý state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";

const SCOPE_OPTIONS = [
  { value: "", label: "All Scopes" },
  { value: "student", label: "Single Student" },
  { value: "comparison", label: "Comparison" },
  { value: "cohort", label: "Cohort / Class" },
];

const ANALYSIS_TAGS = [
  { value: "", label: "All Types" },
  { value: "trend", label: "📈 Trend" },
  { value: "comparison", label: "⚖️ Comparison" },
  { value: "distribution", label: "📊 Distribution" },
  { value: "correlation", label: "🔗 Correlation" },
  { value: "risk", label: "⚠️ Risk" },
  { value: "behavioral", label: "🎯 Behavioral" },
];

export default function TaskFilters({ filters, onChange }) {
  const [searchInput, setSearchInput] = useState(filters.search || "");

  // Debounced search — only fire onChange after user stops typing
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    // Simple debounce using setTimeout
    clearTimeout(window.__taskSearchTimer);
    window.__taskSearchTimer = setTimeout(() => {
      onChange({ ...filters, search: value || undefined });
    }, 300);
  };

  const handleScopeChange = (e) => {
    onChange({ ...filters, scope: e.target.value || undefined });
  };

  const handleAnalysisClick = (value) => {
    onChange({
      ...filters,
      analysis: filters.analysis === value ? undefined : value || undefined,
    });
  };

  return (
    <div className="space-y-3">
      {/* Row 1: Scope dropdown + Search */}
      <div className="flex gap-3">
        <select
          value={filters.scope || ""}
          onChange={handleScopeChange}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm
                     text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30
                     focus:border-emerald-500 transition-colors"
        >
          {SCOPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search tasks by name or question..."
            value={searchInput}
            onChange={handleSearchChange}
            className="w-full px-3 py-2 pl-9 rounded-lg border border-slate-200 bg-white
                       text-sm text-slate-700 placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/30
                       focus:border-emerald-500 transition-colors"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Row 2: Analysis type tags */}
      <div className="flex flex-wrap gap-2">
        {ANALYSIS_TAGS.map((tag) => (
          <button
            key={tag.value}
            onClick={() => handleAnalysisClick(tag.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all
              ${
                (filters.analysis || "") === tag.value
                  ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
          >
            {tag.label}
          </button>
        ))}
      </div>
    </div>
  );
}
