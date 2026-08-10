import React from "react";

/**
 * StatCard Component with overflow handling
 */
function StatCard({ label, value, hint, isPrimary = false }) {
  const displayValue =
    value !== undefined && value !== null && value !== ""
      ? String(value).replace(/_/g, "_ ")
      : "N/A";

  return (
    <div
      className={`group flex flex-col justify-between rounded-3xl border p-6 transition-all hover:-translate-y-1 hover:shadow-lg ${
        isPrimary
          ? "border-emerald-100 bg-emerald-50/50"
          : "border-slate-50 bg-white"
      }`}
    >
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          {label}
        </div>

        <div
          className={`mt-3 break-all text-xl font-black leading-tight tracking-tight ${
            isPrimary ? "text-emerald-600" : "text-slate-900"
          }`}
          title={displayValue}
        >
          {displayValue}
        </div>
      </div>

      {hint && (
        <div className="mt-4 border-t border-slate-50 pt-3 text-[10px] font-bold italic text-slate-400">
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * PHASE 2: Session Intelligence
 * Summarizes the result of automated schema detection and system profiling.
 */
export default function BundleSummaryCard({
  sessionId,
  datasetName,
  sourceDataset,
  bundleSchema,
  uploadedFiles,
}) {
  if (!sessionId) return null;

  return (
    <section className="rounded-[32px] border border-emerald-100 bg-white p-8 shadow-xl shadow-emerald-900/5 ring-1 ring-emerald-50">
      {/* HEADER SECTION */}
      <div className="mb-8 flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">
            2. Session Intelligence
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Detected metadata and bundle configurations from the{" "}
            <span className="text-emerald-600">Profiling Service</span>.
          </p>
        </div>

        {/* SESSION BADGE */}
        <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white shadow-sm">
            <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          </div>
          <span className="font-mono text-[10px] font-black uppercase tracking-wider text-slate-500">
            ID: {sessionId}
          </span>
        </div>
      </div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Dataset Label" value={datasetName} />

        <StatCard label="Data Origin" value={sourceDataset} />

        <StatCard
          label="Match Accuracy"
          value={
            bundleSchema?.confidence !== undefined &&
            bundleSchema?.confidence !== null
              ? `${Math.round(bundleSchema.confidence * 100)}%`
              : "-"
          }
          hint="Heuristic alignment score"
        />

        <StatCard
          label="Ingested Files"
          value={uploadedFiles?.length ?? 0}
          hint="Total processed CSVs"
        />
      </div>
    </section>
  );
}