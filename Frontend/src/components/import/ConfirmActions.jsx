export default function ConfirmActions({
  selectedFile,
  validation,
  onConfirmSelected,
  confirming
}) {
  if (!selectedFile) return null;

  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  const confirmed = !!selectedFile.confirmedMappingConfig;

  return (
    <section className="rounded-[32px] border border-emerald-100 bg-white p-8 shadow-xl shadow-emerald-900/5 animate-in fade-in duration-500">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900">5. Finalize Mapping</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Verify automated suggestions and enforce strict schema validation rules.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onConfirmSelected(selectedFile)}
          disabled={confirming || confirmed}
          className={`inline-flex items-center justify-center rounded-2xl px-8 py-4 text-sm font-black uppercase tracking-widest transition-all shadow-lg ${
            confirmed 
              ? "bg-emerald-50 text-emerald-600 border-2 border-emerald-200 cursor-default" 
              : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200 active:scale-95 disabled:opacity-50"
          }`}
        >
          {confirming ? (
            <span className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Validating...
            </span>
          ) : confirmed ? (
            "✓ File Confirmed"
          ) : (
            "Confirm Selected File"
          )}
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target File</div>
          <div className="mt-2 text-sm font-bold text-slate-800 truncate">{selectedFile.fileName}</div>
        </div>

        <div className={`rounded-2xl border p-5 transition-colors ${confirmed ? "border-emerald-200 bg-emerald-50" : "border-slate-100 bg-slate-50/50"}`}>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Status</div>
          <div className={`mt-2 text-sm font-black ${confirmed ? "text-emerald-600" : "text-slate-500"}`}>
            {confirmed ? "READY FOR IMPORT" : "PENDING REVIEW"}
          </div>
        </div>

        <div className={`rounded-2xl border p-5 ${errors.length > 0 ? "border-red-100 bg-red-50" : "border-slate-100 bg-slate-50/50"}`}>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Validation Health</div>
          <div className={`mt-2 text-sm font-bold ${errors.length > 0 ? "text-red-600" : "text-slate-800"}`}>
            {errors.length} Errors • {warnings.length} Warnings
          </div>
        </div>
      </div>
    </section>
  );
}