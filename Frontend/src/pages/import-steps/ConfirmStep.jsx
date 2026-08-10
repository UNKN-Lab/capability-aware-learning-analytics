import { useOutletContext, useNavigate } from "react-router-dom";
import RunImportPanel from "../../components/import/RunImportPanel";

/**
 * Step 3: Final System Configuration and Execution
 */
export default function ConfirmStep() {
  const navigate = useNavigate();
  const {
    sessionId,
    uploadedFiles,
    handleRunPipeline,
    loadingStates,
    datasetName,
  } = useOutletContext();

  if (!sessionId || uploadedFiles.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-slate-500">No active session found.</p>
        <button
          onClick={() => navigate("/import/upload")}
          className="font-bold text-emerald-600 underline"
        >
          Return to Step 1
        </button>
      </div>
    );
  }

  const allConfirmed = uploadedFiles.every((file) => !!file.confirmedMappingConfig);
  const confirmedCount = uploadedFiles.filter((file) => !!file.confirmedMappingConfig).length;
  const remainingCount = uploadedFiles.length - confirmedCount;

  return (
    <div className="mx-auto max-w-5xl animate-in fade-in duration-500">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 px-6 py-7 sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Step 3 of 3
              </div>
              <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Final confirmation
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
                Import <span className="font-bold text-emerald-700">{uploadedFiles.length} file(s)</span>{" "}
                into <span className="font-bold text-slate-900">"{datasetName || "Default Dataset"}"</span>{" "}
                after the mapping checks are verified.
              </p>
            </div>

            <div
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${
                allConfirmed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${allConfirmed ? "bg-emerald-500" : "bg-amber-500"}`} />
              {allConfirmed ? "All mappings verified" : "Review required"}
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-100 px-6 py-5 sm:grid-cols-3 sm:px-8">
          <SummaryTile label="Total files" value={uploadedFiles.length} />
          <SummaryTile label="Ready to import" value={confirmedCount} tone="emerald" />
          <SummaryTile label="Remaining review" value={remainingCount} tone={allConfirmed ? "slate" : "amber"} />
        </div>

        <div className="px-6 py-6 sm:px-8">
          {!allConfirmed && (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-sm font-bold text-amber-900">Action required</div>
              <p className="mt-1 text-xs leading-5 text-amber-700">
                You have {remainingCount} unconfirmed file(s). Please go back to{" "}
                <button onClick={() => navigate("/import/review")} className="font-bold underline">
                  Review Mapping
                </button>{" "}
                before running the import.
              </p>
            </div>
          )}

          <RunImportPanel
            sessionId={sessionId}
            files={uploadedFiles}
            onRun={handleRunPipeline}
            loading={loadingStates.running}
            disabled={!allConfirmed}
          />

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate("/import/review")}
              className="text-sm font-bold text-slate-400 transition-colors hover:text-slate-700"
            >
              ← Back to Review Mapping
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryTile({ label, value, tone = "slate" }) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}
