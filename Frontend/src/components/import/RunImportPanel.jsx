import { useMemo, useState } from "react";

export default function RunImportPanel({
  sessionId,
  files,
  selectedFile,
  onRun,
  loading,
  disabled = false,
}) {
  const [importBatchId, setImportBatchId] = useState(`Import_${new Date().toISOString().split("T")[0]}`);
  const [chunkSize, setChunkSize] = useState(500);
  const [replaceIfExists, setReplaceIfExists] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const confirmedFiles = useMemo(
    () => files.filter((file) => !!file.confirmedMappingConfig),
    [files]
  );
  const selectedIsConfirmed = !!selectedFile && !!selectedFile.confirmedMappingConfig;
  const readyRatio = files.length > 0 ? confirmedFiles.length / files.length : 0;
  const runDisabled = disabled || loading || confirmedFiles.length === 0;

  const runOptions = { importBatchId, chunkSize: Number(chunkSize), replaceIfExists };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Execute pipeline
          </div>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">
            Push confirmed data to the database
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Review the batch settings below, then run the import when everything is ready.
          </p>
        </div>

        <div className="min-w-[220px] rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-emerald-700">
            <span>Ready files</span>
            <span>{confirmedFiles.length}/{files.length}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-emerald-200">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-500"
              style={{ width: `${readyRatio * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Batch identifier
          </label>
          <input
            type="text"
            value={importBatchId}
            onChange={(event) => setImportBatchId(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-amber-200 hover:bg-amber-50/40">
          <input
            type="checkbox"
            checked={replaceIfExists}
            onChange={(event) => setReplaceIfExists(event.target.checked)}
            className="mt-0.5 h-5 w-5 rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>
            <span className="block text-sm font-bold text-slate-800">
              Update existing records
            </span>
            <span className="mt-1 block text-xs leading-5 text-amber-700">
              Existing duplicate records in the same batch will be overwritten.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="text-xs font-bold text-slate-500 transition hover:text-slate-800"
        >
          {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
        </button>

        {showAdvanced && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="max-w-xs space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Chunk processing size
              </label>
              <input
                type="number"
                min="1"
                value={chunkSize}
                onChange={(event) => setChunkSize(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>
          </div>
        )}
      </div>

      <div className={`mt-6 grid grid-cols-1 gap-3 ${selectedFile ? "lg:grid-cols-2" : ""}`}>
        <button
          type="button"
          onClick={() => onRun({
            sessionId,
            fileIds: confirmedFiles.map((file) => file.fileId),
            options: runOptions,
          })}
          disabled={runDisabled}
          className="rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {loading ? "Processing import..." : "Run all confirmed"}
        </button>

        {selectedFile && (
          <button
            type="button"
            onClick={() => onRun({
              sessionId,
              fileIds: [selectedFile.fileId],
              options: runOptions,
            })}
            disabled={loading || disabled || !selectedIsConfirmed}
            className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
          >
            Run selected only
          </button>
        )}
      </div>
    </section>
  );
}
