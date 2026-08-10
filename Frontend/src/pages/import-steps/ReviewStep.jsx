import React from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import FileSelector from "../../components/import/FileSelector";
import MappingEditor from "../../components/import/MappingEditor";
import ConfirmActions from "../../components/import/ConfirmActions";
import BundleSummaryCard from "../../components/import/BundleSummaryCard";

export default function ReviewStep() {
  const navigate = useNavigate();
  const {
    uploadedFiles,
    setUploadedFiles,
    selectedFileId,
    setSelectedFileId,
    handleConfirmMapping,
    handleClearRowError,
    loadingStates,
    sessionId,
    datasetName,
    sourceDataset,
    bundleSchema
  } = useOutletContext();

  const selectedFile = uploadedFiles.find(f => f.fileId === selectedFileId);
  const allConfirmed = uploadedFiles.length > 0 && uploadedFiles.every(f => !!f.confirmedMappingConfig);

  const handleChangeEditableConfig = (fileId, nextConfig) => {
    setUploadedFiles(prev => prev.map(file =>
      file.fileId === fileId
        ? {
            ...file,
            editableMappingConfig: nextConfig,
            confirmedMappingConfig: null // Chỉ unlock, không xóa errors
          }
        : file
    ));
  };

  if (uploadedFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-300">
        <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4 shadow-inner">📂</div>
        <p className="text-slate-500 mb-4 font-medium italic">No datasets available for schema review.</p>
        <button
          onClick={() => navigate("/import/upload")}
          className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
        >
          Return to Ingestion
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-8">

      {/* SECTION HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight sm:text-3xl">2. Schema Mapping Review</h2>
          <p className="mt-1 text-slate-500 text-sm font-medium">
            Verify automated suggestions and enforce strict structural integrity rules.
          </p>
        </div>
        <div className="hidden sm:block">
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 border border-emerald-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Review Mode Active</span>
          </div>
        </div>
      </div>

      {/* SESSION METADATA */}
      <BundleSummaryCard
        sessionId={sessionId}
        datasetName={datasetName}
        sourceDataset={sourceDataset}
        bundleSchema={bundleSchema}
        uploadedFiles={uploadedFiles}
      />

      {/* MAIN WORKSPACE */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">

        {/* LEFT PANEL: FILE LIST */}
        <aside className="xl:sticky xl:top-8 xl:self-start">
          <FileSelector
            files={uploadedFiles}
            datasetName={datasetName}
            selectedFileId={selectedFileId}
            onSelect={setSelectedFileId}
          />
        </aside>

        {/* RIGHT PANEL: EDITOR + CONFIRM */}
        <div className="space-y-6">
          <div className="rounded-[2.5rem] border border-emerald-100 bg-white p-2 shadow-2xl shadow-emerald-900/5 ring-1 ring-emerald-50 overflow-hidden">
            <MappingEditor
              file={selectedFile}
              onChangeEditableConfig={handleChangeEditableConfig}
              onClearRowError={handleClearRowError}
            />
          </div>

          <ConfirmActions
            selectedFile={selectedFile}
            onConfirmSelected={handleConfirmMapping}
            confirming={loadingStates.confirming}
          />
        </div>
      </div>

      {/* STEP NAVIGATION */}
      <div className="flex flex-col items-center justify-center gap-4 rounded-[2rem] bg-slate-50/50 border border-slate-100 p-6 mt-8 transition-all shadow-inner sm:gap-6 sm:rounded-[3rem] sm:p-12 sm:mt-12">
        {!allConfirmed && (
          <div className="flex items-center gap-2 text-sm font-bold text-amber-600 animate-pulse bg-white px-6 py-2 rounded-full border border-amber-100 shadow-sm">
            <span>⚠️</span>
            <span>PLEASE CONFIRM ALL FILES ABOVE TO PROCEED TO EXECUTION</span>
          </div>
        )}

        <button
          onClick={() => navigate("/import/confirm")}
          disabled={!allConfirmed}
          className={`group relative flex items-center gap-6 px-16 py-6 rounded-[2.2rem] font-black tracking-[0.1em] transition-all active:scale-95 ${
            allConfirmed
              ? "bg-emerald-600 text-white shadow-[0_20px_50px_rgba(16,185,129,0.3)] hover:bg-emerald-700 hover:px-20"
              : "bg-slate-200 text-slate-400 cursor-not-allowed grayscale"
          }`}
        >
          <span className="text-lg">{allConfirmed ? "PROCEED TO EXECUTION" : "VALIDATION PENDING"}</span>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition-transform duration-500 ${allConfirmed ? "group-hover:translate-x-2" : ""}`}>
            {allConfirmed ? "→" : "🔒"}
          </div>
        </button>

        {allConfirmed && (
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-widest animate-in fade-in slide-in-from-bottom-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            All schema mappings verified & integrity checks passed.
          </div>
        )}
      </div>
    </div>
  );
}
