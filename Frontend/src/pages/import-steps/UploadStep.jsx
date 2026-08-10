import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import UploadPanel from "../../components/import/UploadPanel";

/**
 * PHASE 1: Automated Data Ingestion & Metadata Collection
 * This step initiates the pipeline by parsing CSV files and 
 * detecting the dataset schema based on predefined rules.
 */
export default function UploadStep() {
  const { 
    handleUpload, 
    loadingStates, 
    uploadProgress,
    datasetName, 
    setDatasetName
  } = useOutletContext();

  const [selectedFiles, setSelectedFiles] = useState([]);

  // Auto-fill dataset name when files are dropped
  useEffect(() => {
    if (selectedFiles.length > 0 && !datasetName) {
      if (selectedFiles.length === 1) {
        // Tên file bỏ đi đuôi .csv
        const name = selectedFiles[0].name.replace(/\.[^/.]+$/, "");
        setDatasetName(name);
      } else {
        // Nếu nhiều file thì tạo tên chung
        setDatasetName(`Multi-file_Dataset_${new Date().getTime().toString().slice(-4)}`);
      }
    }
  }, [selectedFiles, datasetName, setDatasetName]);

  /**
   * Triggers the backend orchestration (Step 0 & 1)
   * Passes raw files and metadata to the ingestion service.
   */
  const handleFinalUpload = () => {
    if (selectedFiles.length === 0) return;
    
    handleUpload({
      files: selectedFiles,
      datasetName
    });
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* HEADER SECTION */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">1. Data Ingestion</h2>
        <p className="text-slate-500 text-sm">
          Select CSV files to begin the automated profiling and smart schema detection process.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
        {/* LEFT SIDE: INGESTION ZONE (Profiling Service) */}
        <div className="rounded-[2rem] bg-slate-50/50 p-2 border-2 border-dashed border-slate-200 hover:border-emerald-300 transition-colors">
          <UploadPanel 
            onFilesChange={setSelectedFiles} 
            loading={loadingStates.uploading} 
            uploadProgress={uploadProgress}
            standalone={false} 
          />
        </div>

        {/* RIGHT SIDE: METADATA & ORCHESTRATION */}
        <div className="flex flex-col gap-6">
          <div className="space-y-6 rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm">
            {/* Dataset Identification */}
            <div className="space-y-2">
              <label className="text-[13px] font-semibold text-slate-600">
                Dataset Name
              </label>
              <input
                type="text"
                placeholder="e.g., OULAD-2026-V1"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/30 p-4 text-sm font-medium focus:border-emerald-500 focus:bg-white focus:outline-none transition-all"
                value={datasetName} 
                onChange={(e) => setDatasetName(e.target.value)} 
              />
            </div>

          </div>

          {/* MAIN EXECUTION BUTTON */}
          <button
            onClick={handleFinalUpload}
            disabled={loadingStates.uploading || selectedFiles.length === 0}
            className={`w-full py-5 rounded-[2rem] font-bold text-white shadow-xl transition-all active:scale-95 ${
              selectedFiles.length > 0 && !loadingStates.uploading
                ? "bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700" 
                : "bg-slate-300 cursor-not-allowed shadow-none"
            }`}
          >
            {loadingStates.uploading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {uploadProgress < 100
                  ? `Uploading... ${uploadProgress}%`
                  : "Profiling data..."}
              </span>
            ) : (
              "Upload & Analyze"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
