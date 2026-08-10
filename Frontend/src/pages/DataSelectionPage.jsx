import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../contexts/AppContext";
import { switchSampleDataset, deleteDataset, renameDataset } from "../services/datasetApi";
import { message, Popconfirm, Input, Button } from "antd";
import Navbar from "../components/layout/Navbar";

const STANDARD_SAMPLES = {
  OULAD: {
    id: "SAMPLE_OULAD",
    source: "OULAD",
    requestKey: "OULAD",
  },
  UCI: {
    id: "SAMPLE_UCI_MAT",
    source: "UCI",
    requestKey: "UCI",
  },
};

// --- Icons ---
function InfoIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function UploadCloudIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  );
}

function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function TrashIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function PencilIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

// --- Component ---
export default function DataSelectionPage() {
  const navigate = useNavigate();
  const { activeDataset, setActiveDataset, importHistory, refreshImportHistory } = useAppContext();
  const [isSwitching, setIsSwitching] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  
  const [renamingId, setRenamingId] = useState(null);
  const [newName, setNewName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  
  const [isDeleting, setIsDeleting] = useState(false);

  const importedHistory = importHistory.filter((item) => item?.is_sample !== true);

  const isSampleActive = (sample) =>
    activeDataset?.id === sample.id ||
    (activeDataset?.type === "sample" && activeDataset?.source === sample.source);

  useEffect(() => {
    refreshImportHistory();
  }, [refreshImportHistory]);

  const handleSelectSample = async (datasetName) => {
    try {
      setIsSwitching(true);
      setLoadingId(datasetName);
      const res = await switchSampleDataset(datasetName);
      if (res.success && res.activeDataset) {
        setActiveDataset(res.activeDataset);
        message.success(`Dataset switched to ${res.activeDataset.name}`);
        // Slight delay for UX
        setTimeout(() => navigate("/admin/dashboard"), 500);
      }
    } catch (error) {
      console.error("Failed to switch sample dataset:", error);
      message.error("Failed to switch dataset. Please try again.");
    } finally {
      setIsSwitching(false);
      setLoadingId(null);
    }
  };

  const handleSelectImported = async (historyItem) => {
    const datasetObj = {
      id: historyItem.import_batch_id,
      name: `Imported Dataset (${historyItem.source_dataset})`,
      type: "imported",
      source: historyItem.source_dataset,
      setAt: new Date().toISOString(),
    };
    
    try {
      setIsSwitching(true);
      setLoadingId(historyItem.import_batch_id);
      const { setActiveDataset: apiSetActive } = await import("../services/datasetApi");
      const res = await apiSetActive(datasetObj);
      if (res.success) {
        setActiveDataset(res.activeDataset || datasetObj);
        message.success(`Dataset switched to imported dataset`);
        setTimeout(() => navigate("/admin/dashboard"), 500);
      }
    } catch (error) {
      console.error("Failed to set imported dataset:", error);
      message.error("Failed to activate imported dataset.");
    } finally {
      setIsSwitching(false);
      setLoadingId(null);
    }
  };

  const handleDeleteDataset = async (batchId) => {
    try {
      setIsDeleting(true);
      const res = await deleteDataset(batchId);
      if (res.success) {
        message.success("Dataset deleted successfully");
        if (res.wasActive && res.newActiveDataset) {
          setActiveDataset(res.newActiveDataset);
          message.info("Reverted active dataset to OULAD Sample");
        }
        refreshImportHistory();
      }
    } catch (error) {
      console.error("Failed to delete dataset:", error);
      message.error("Failed to delete dataset.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameDataset = async (batchId) => {
    if (!newName.trim()) {
      message.error("Dataset name cannot be empty");
      return;
    }
    
    try {
      setIsRenaming(true);
      const res = await renameDataset(batchId, newName);
      if (res.success) {
        message.success("Dataset renamed successfully");
        setRenamingId(null);
        refreshImportHistory();
        
        // Update activeDataset context if the renamed one is currently active
        if (activeDataset?.id === batchId) {
          setActiveDataset({ ...activeDataset, name: res.dataset.batch_name });
        }
      }
    } catch (error) {
      console.error("Failed to rename dataset:", error);
      message.error("Failed to rename dataset.");
    } finally {
      setIsRenaming(false);
    }
  };

  const startRenaming = (item) => {
    setRenamingId(item.import_batch_id);
    setNewName(item.batch_name);
  };


  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "linear-gradient(150deg,#f0fdf4 0%,#ffffff 55%,#eff6ff 100%)" }}>
      {/* Ambient glow orbs — match HomePage identity */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[10%] left-[8%] w-[min(500px,55vw)] h-[min(500px,55vw)] rounded-full"
          style={{ background: "radial-gradient(circle,rgba(16,185,129,0.07),transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute top-[30%] -right-[5%] w-[min(580px,65vw)] h-[min(580px,65vw)] rounded-full"
          style={{ background: "radial-gradient(circle,rgba(59,130,246,0.05),transparent 70%)", filter: "blur(80px)" }} />
      </div>

      {/* ── Shared Navbar ── */}
      <Navbar rightSlot={
        <button
          onClick={() => navigate("/choose-role")}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Back
        </button>
      } />

      <div className="relative z-10 mx-auto max-w-[900px] px-4 sm:px-5 lg:px-6 py-6">
        <header className="mb-5 text-center">
          <h1 className="font-extrabold text-slate-900 tracking-tight mb-2" style={{ fontSize: "clamp(1.6rem, 2.8vw, 2.4rem)" }}>
            Select Data Source
          </h1>
          <p className="text-slate-500" style={{ fontSize: "clamp(0.85rem, 1.2vw, 0.95rem)" }}>
            Choose a standard sample dataset or select from your uploaded history.
          </p>
        </header>

        {/* System Clarity Banner (Inline Helper Text) */}
        <div className="mb-5 flex items-start justify-center gap-2 text-slate-400 lg:mb-5">
          <InfoIcon className="w-4 h-4 shrink-0" />
          <p className="max-w-[780px] text-center text-[13px] font-medium leading-relaxed sm:text-sm">
            The dataset activated here will be used across all analytics dashboards for both Students and Administrators.
          </p>
        </div>

        {/* Section A: Standard Samples */}
        <section className="mb-6 lg:mb-6">
          <h2 className="mb-3 border-b pb-2 px-1 text-[1.15rem] font-bold text-slate-800">
            Standard Samples
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5">
            {/* OULAD Card */}
            <div className={`relative rounded-2xl flex flex-col justify-between transition-all duration-300 ${
              isSampleActive(STANDARD_SAMPLES.OULAD)
                ? "bg-emerald-50/40 border-2 border-emerald-500 shadow-sm" 
                : "bg-white border border-slate-200 shadow-sm hover:-translate-y-1 hover:shadow-md"
            }`} style={{ padding: "var(--desktop-data-card-pad)" }}>
              {isSampleActive(STANDARD_SAMPLES.OULAD) && (
                <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-sm">
                  <CheckIcon className="w-3 h-3" /> Active
                </div>
              )}
              <div className="mb-5">
                <h3 className="mb-1.5 text-[1.05rem] font-bold text-slate-900">OULAD Dataset</h3>
                <p className="text-[13px] leading-relaxed text-slate-500 sm:text-sm">
                  Open University Learning Analytics Dataset. Contains demographic, performance, and VLE interaction data.
                </p>
              </div>
              
              {isSampleActive(STANDARD_SAMPLES.OULAD) ? (
                <div className="mt-auto flex w-full items-center justify-center py-2 text-[13px] font-medium text-emerald-600/80 opacity-80 cursor-default sm:text-sm">
                  Currently Active
                </div>
              ) : (
                <button
                  disabled={isSwitching}
                  onClick={() => handleSelectSample(STANDARD_SAMPLES.OULAD.requestKey)}
                  className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-800 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:opacity-60 disabled:shadow-none sm:text-sm"
                >
                  {loadingId === "OULAD" ? (
                    <><div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></div> Activating...</>
                  ) : "Activate OULAD Dataset"}
                </button>
              )}
            </div>

            {/* UCI Card */}
            <div className={`relative rounded-2xl flex flex-col justify-between transition-all duration-300 ${
              isSampleActive(STANDARD_SAMPLES.UCI)
                ? "bg-emerald-50/40 border-2 border-emerald-500 shadow-sm" 
                : "bg-white border border-slate-200 shadow-sm hover:-translate-y-1 hover:shadow-md"
            }`} style={{ padding: "var(--desktop-data-card-pad)" }}>
              {isSampleActive(STANDARD_SAMPLES.UCI) && (
                <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-sm">
                  <CheckIcon className="w-3 h-3" /> Active
                </div>
              )}
              <div className="mb-5">
                <h3 className="mb-1.5 text-[1.05rem] font-bold text-slate-900">UCI Dataset</h3>
                <p className="text-[13px] leading-relaxed text-slate-500 sm:text-sm">
                  UCI Student Performance Dataset. Focuses on secondary education data with demographic and social features.
                </p>
              </div>
              
              {isSampleActive(STANDARD_SAMPLES.UCI) ? (
                <div className="mt-auto flex w-full items-center justify-center py-2 text-[13px] font-medium text-emerald-600/80 opacity-80 cursor-default sm:text-sm">
                  Currently Active
                </div>
              ) : (
                <button
                  disabled={isSwitching}
                  onClick={() => handleSelectSample(STANDARD_SAMPLES.UCI.requestKey)}
                  className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-800 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:opacity-60 disabled:shadow-none sm:text-sm"
                >
                  {loadingId === "UCI" ? (
                    <><div className="w-4 h-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></div> Activating...</>
                  ) : "Activate UCI Dataset"}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Section B: Import History */}
        <section>
          <div className="mb-3 flex items-center justify-between border-b pb-2 px-1">
            <h2 className="text-[1.15rem] font-bold text-slate-800">Import History</h2>
            {importedHistory.length > 0 && (
              <button
                onClick={() => navigate("/import/upload")}
                className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-[13px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 sm:text-sm"
              >
                <PlusIcon className="w-4 h-4" /> Import New
              </button>
            )}
          </div>

          <div className={`rounded-2xl transition-all ${importedHistory.length > 0 ? "bg-white border border-slate-200 shadow-sm overflow-hidden" : ""}`}>
            {importedHistory.length === 0 ? (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center" style={{ padding: "var(--desktop-data-empty-pad)" }}>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                  <UploadCloudIcon className="w-7 h-7" />
                </div>
                <h3 className="mb-2 text-base font-bold text-slate-900 sm:text-lg">No Custom Datasets Yet</h3>
                <p className="mb-4 max-w-md text-sm leading-relaxed text-slate-500">
                  Import your own educational data to analyze custom student cohorts and performance metrics.
                </p>
                <button 
                  onClick={() => navigate("/import/upload")}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-700"
                >
                  <PlusIcon className="w-4 h-4" /> Import New Dataset
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {importedHistory.map((item) => {
                  const isActive = activeDataset?.id === item.import_batch_id;
                  const isBeingRenamed = renamingId === item.import_batch_id;
                  
                  return (
                    <li key={item.import_batch_id} className={`flex flex-col items-start justify-between gap-3 p-3.5 transition-colors sm:flex-row sm:items-center sm:px-5 ${isActive ? 'bg-emerald-50/20' : 'hover:bg-slate-50'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          {isBeingRenamed ? (
                            <div className="flex items-center gap-2">
                              <Input 
                                size="small" 
                                value={newName} 
                                onChange={(e) => setNewName(e.target.value)}
                                onPressEnter={() => handleRenameDataset(item.import_batch_id)}
                                disabled={isRenaming}
                                autoFocus
                              />
                              <Button size="small" type="primary" loading={isRenaming} onClick={() => handleRenameDataset(item.import_batch_id)}>Save</Button>
                              <Button size="small" disabled={isRenaming} onClick={() => setRenamingId(null)}>Cancel</Button>
                            </div>
                          ) : (
                            <>
                              <p className="truncate text-[13px] font-bold text-slate-900 sm:text-sm">
                                {item.batch_name}
                              </p>
                              {isActive && (
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">
                                  Active
                                </span>
                              )}
                              <button onClick={() => startRenaming(item)} className="text-slate-400 hover:text-blue-600 transition-colors" title="Rename">
                                <PencilIcon className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                          <span className="flex min-w-0 items-center gap-1.5">
                            ID: <span className="min-w-0 break-all font-mono text-[10px]">{item.import_batch_id}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            Source: <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{item.source_dataset}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            Rows: <span className="font-semibold text-slate-700">{item.row_count?.toLocaleString()}</span>
                          </span>
                          <span>
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex w-full flex-wrap items-center gap-2 shrink-0 sm:w-auto sm:justify-end">
                        {isActive ? (
                          <div className="px-3 py-2 text-[13px] font-medium text-emerald-600/80 opacity-80 cursor-default sm:text-sm">
                            Currently Active
                          </div>
                        ) : (
                          <button
                            disabled={isSwitching || isDeleting}
                            onClick={() => handleSelectImported(item)}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-800 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:text-sm"
                          >
                            {loadingId === item.import_batch_id ? (
                              <><div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin"></div> Activating...</>
                            ) : "Activate"}
                          </button>
                        )}
                        
                        <Popconfirm
                          title="Delete Dataset"
                          description={
                            <>
                              Are you sure you want to delete this dataset?<br />
                              <span className="text-red-500 font-medium">This action cannot be undone.</span>
                            </>
                          }
                          onConfirm={() => handleDeleteDataset(item.import_batch_id)}
                          okText="Delete"
                          okButtonProps={{ danger: true, loading: isDeleting }}
                          cancelText="Cancel"
                          placement="topRight"
                        >
                          <button
                            disabled={isSwitching || isDeleting}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete Dataset"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </Popconfirm>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
