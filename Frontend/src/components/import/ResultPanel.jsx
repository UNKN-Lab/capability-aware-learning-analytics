function SummaryCard({ label, value, tone = "slate" }) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 truncate text-xl font-black" title={String(value ?? "-")}>
        {value ?? "-"}
      </div>
    </div>
  );
}

function CountBlock({ title, data }) {
  if (!data || typeof data !== "object" || Object.keys(data).length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-700">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(data).map(([key, value]) => (
          <SummaryCard
            key={key}
            label={key.replace(/_/g, " ")}
            value={String(value)}
          />
        ))}
      </div>
    </div>
  );
}

export default function ResultPanel({
  result,
  datasetName,
  sourceDataset,
  fileCount,
  uploadedFiles = [],
}) {
  if (!result) return null;

  const payload = result?.result || result;
  const nested = payload?.result || payload;
  const isSuccess = result?.success === true;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              isSuccess ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}
          >
            {isSuccess ? "✓" : "!"}
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Pipeline result
            </div>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              {isSuccess ? "Import completed successfully" : "Import failed"}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Summary of the data integration process.
            </p>
          </div>
        </div>

        <span
          className={`inline-flex w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wider ${
            isSuccess
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {isSuccess ? "Success" : "Failed"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard label="Dataset name" value={datasetName || "Untitled Dataset"} tone="emerald" />
        <SummaryCard label="Target schema" value={sourceDataset || "CUSTOM"} />
        <SummaryCard label="Files imported" value={`${fileCount} file(s)`} />
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-700">
            Files processed
          </div>
          <div className="flex flex-wrap gap-2">
            {uploadedFiles.map((file) => (
              <span
                key={file.fileId || file.fileName || file.name}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
                  ✓
                </span>
                {file.fileName || file.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 space-y-4">
        <CountBlock title="Data transformation metrics" data={nested?.transformed_counts} />
        <CountBlock title="Entity merging statistics" data={nested?.merged_counts} />
        <CountBlock title="Schema flat-table records" data={nested?.flat_table_counts} />
        <CountBlock title="Final storage persistence" data={nested?.saved_counts} />
      </div>
    </section>
  );
}
