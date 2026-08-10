import { useEffect, useRef, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import ResultPanel from "../../components/import/ResultPanel";
import { useAppContext } from "../../contexts/AppContext";
import { getActiveDataset, setActiveDataset as apiSetActive } from "../../services/datasetApi";

/**
 * Step 4: Success State and Ingestion Summary
 */
export default function CompleteStep() {
  const navigate = useNavigate();
  const { runResult, sessionId, sourceDataset, datasetName, uploadedFiles } = useOutletContext();
  const { setActiveDataset, refreshImportHistory } = useAppContext();
  const hasAutoSet = useRef(false);
  const [isSyncingDataset, setIsSyncingDataset] = useState(false);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    if (runResult?.success && !hasAutoSet.current) {
      hasAutoSet.current = true;
      setIsSyncingDataset(true);
      setSyncError(null);

      const importBatchId =
        runResult.result?.importBatchId ||
        runResult.result?.metadata?.options?.importBatchId ||
        sessionId;

      const resolvedSource =
        runResult.result?.result?.mappingConfigUsed?.source_dataset ||
        sourceDataset ||
        "CUSTOM";

      const datasetObj = {
        id: importBatchId,
        name: `Imported Dataset (${resolvedSource})`,
        type: "imported",
        source: resolvedSource,
        setAt: new Date().toISOString(),
      };

      const activeFromRun = runResult.activeDataset || null;
      const maybeSetActivePromise = activeFromRun
        ? Promise.resolve({ success: true, activeDataset: activeFromRun })
        : apiSetActive(datasetObj);

      maybeSetActivePromise
        .then(async (res) => {
          const serverActive = await getActiveDataset().catch(() => null);
          const nextActive = serverActive || res.activeDataset || datasetObj;
          setActiveDataset(nextActive);
          refreshImportHistory();
        })
        .catch((err) => {
          setSyncError(err.message || "Failed to sync active dataset.");
          console.error("Failed to auto-set imported dataset:", err);
        })
        .finally(() => {
          setIsSyncingDataset(false);
        });
    }
  }, [runResult, sessionId, sourceDataset, setActiveDataset, refreshImportHistory]);

  const handleViewDashboard = async () => {
    if (!runResult?.success || isSyncingDataset) return;

    try {
      const serverActive = await getActiveDataset();
      if (serverActive) {
        setActiveDataset(serverActive);
      }
      navigate("/admin/dashboard");
    } catch (err) {
      console.error("Failed to refresh active dataset before dashboard navigation:", err);
      navigate("/admin/dashboard");
    }
  };

  if (!runResult) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
          ?
        </div>
        <h2 className="text-xl font-bold text-slate-800">No import results found</h2>
        <p className="mb-6 mt-2 text-slate-500">It seems like you have not completed an import process yet.</p>
        <button
          onClick={() => navigate("/import/upload")}
          className="rounded-xl bg-emerald-600 px-6 py-2 font-bold text-white transition-all hover:bg-emerald-700"
        >
          Start new import
        </button>
      </div>
    );
  }

  const isSuccess = runResult?.success === true;

  return (
    <div className="mx-auto max-w-5xl animate-in fade-in duration-700">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <div
          className={`border-b px-6 py-7 sm:px-8 ${
            isSuccess
              ? "border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-slate-50"
              : "border-red-100 bg-gradient-to-br from-red-50 via-white to-slate-50"
          }`}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-black ${
                  isSuccess ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                }`}
              >
                {isSuccess ? "✓" : "!"}
              </div>
              <div>
                <div
                  className={`mb-2 inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                    isSuccess
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {isSuccess ? "Import complete" : "Import failed"}
                </div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                  {isSuccess ? "Dataset is ready" : "Pipeline needs attention"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  {isSuccess
                    ? "Your data has been processed, validated, and loaded into the analytics warehouse."
                    : "One or more files could not be processed. Review the details below, fix the issues, and run the import again."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <ResultPanel
            result={runResult}
            datasetName={datasetName}
            sourceDataset={sourceDataset}
            fileCount={uploadedFiles?.length || 1}
            uploadedFiles={uploadedFiles}
          />

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
            {isSuccess ? (
              <button
                type="button"
                onClick={handleViewDashboard}
                disabled={isSyncingDataset}
                className="rounded-2xl bg-slate-950 px-8 py-4 text-sm font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {isSyncingDataset ? "Syncing active dataset..." : "View dashboard analytics"}
              </button>
            ) : (
              <button
                onClick={() => navigate("/import/review")}
                className="rounded-2xl bg-red-600 px-8 py-4 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-red-700"
              >
                Go back and fix mapping
              </button>
            )}

            <button
              onClick={() => navigate("/import/upload")}
              className="rounded-2xl border border-slate-200 bg-white px-8 py-4 text-sm font-black uppercase tracking-[0.14em] text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
            >
              New data import
            </button>
          </div>

          {isSuccess && (
            <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center">
              <p className="text-xs font-medium leading-5 text-emerald-800">
                Tester tip: verify imported records in Postgres using the <code className="rounded bg-white px-1 font-mono">sessionId</code> from the logs.
              </p>
              {syncError && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  Active dataset sync warning: {syncError}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
