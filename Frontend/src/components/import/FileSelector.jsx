function statusTone(file) {
  if (file?.confirmedMappingConfig) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  const hasNeedsReview = (file?.editableMappingConfig?.field_mappings || []).some(
    (item) => item.status === "needs_review"
  );

  if (hasNeedsReview) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-500";
}

function statusLabel(file) {
  if (file?.confirmedMappingConfig) return "Confirmed";
  const hasNeedsReview = (file?.editableMappingConfig?.field_mappings || []).some(
    (item) => item.status === "needs_review"
  );
  if (hasNeedsReview) return "Review Needed";
  return "Draft";
}

function FileMetaPill({ children, isActive }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
      isActive 
        ? "border-emerald-400 bg-emerald-500/20 text-emerald-50" 
        : "border-slate-200 bg-white text-slate-500"
    }`}>
      {children}
    </span>
  );
}

export default function FileSelector({
  files,
  datasetName,
  selectedFileId,
  onSelect
}) {
  if (!files.length) return null;

  const confirmedCount = files.filter((file) => !!file.confirmedMappingConfig).length;

  return (
    <section className="rounded-[28px] border border-emerald-100 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-black text-slate-900">3. Uploaded Files</h2>
        <p className="mt-1 text-sm text-slate-500">
          Dataset: <span className="font-bold text-slate-700">{datasetName || "Untitled Dataset"}</span>
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Files</div>
          <div className="mt-1 text-2xl font-black text-slate-900">{files.length}</div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Confirmed</div>
          <div className="mt-1 text-2xl font-black text-emerald-600">{confirmedCount}</div>
        </div>
      </div>

      <div className="space-y-3">
        {files.map((file) => {
          const isActive = file.fileId === selectedFileId;
          const displayName = files.length === 1 && datasetName
            ? datasetName
            : file.fileName;

          return (
            <button
              key={file.fileId}
              type="button"
              onClick={() => onSelect(file.fileId)}
              className={`group w-full rounded-3xl border p-5 text-left transition-all duration-300 ${
                isActive
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-[1.02]"
                  : "border-slate-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/30"
              }`}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-black tracking-tight ${isActive ? "text-white" : "text-slate-900"}`}>
                      {displayName}
                    </div>
                    {displayName !== file.fileName && (
                      <div className={`mt-1 truncate text-[10px] font-bold ${isActive ? "text-emerald-50" : "text-slate-400"}`}>
                        Source file: {file.fileName}
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    isActive ? "border-white/30 bg-white/20 text-white" : statusTone(file)
                  }`}>
                    {statusLabel(file)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <FileMetaPill isActive={isActive}>{file.inferredRole || "Unknown Role"}</FileMetaPill>
                  <FileMetaPill isActive={isActive}>{file.inferredDatasetType || "Generic"}</FileMetaPill>
                  <FileMetaPill isActive={isActive}>
                    CSV: {file.delimiterInfo?.delimiter || file.delimiterInfo?.detectedDelimiter || "-"}
                  </FileMetaPill>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
