import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Banner from "../components/import/Banner";
import StepPill from "../components/import/StepPill";
import {
  profileImport,
  confirmMapping,
  runImport
} from "../services/importApi";

function buildEditableMappingConfig(mappingSuggestion) {
  const safeSuggestion = structuredClone(mappingSuggestion || {});
  return {
    ...safeSuggestion,
    mapping_status: "draft",
    version: safeSuggestion?.version || 1,
    confirmed_at: null,
    field_mappings: (safeSuggestion?.field_mappings || []).map((item) => {
      const next = { ...item };
      const confidence = Number(next.confidence || 0);

      if (next.status === "unmapped" || next.status === "ignored") {
        return { ...next, status: "ignored", transform: "ignore", canonical_field: null, entity_scope: null };
      }

      if (next.status === "suggested") {
        return { ...next, status: confidence >= 0.97 ? "confirmed" : "needs_review" };
      }
      return next;
    })
  };
}

export default function ImportPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState(null);
  const [datasetName, setDatasetName] = useState("");
  const [sourceDataset, setSourceDataset] = useState("");
  const [bundleSchema, setBundleSchema] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [runResult, setRunResult] = useState(null);

  const [loadingStates, setLoadingStates] = useState({
    uploading: false,
    confirming: false,
    running: false
  });
  // 0-100: tiến trình upload file lên server (phase trước khi profiling)
  const [uploadProgress, setUploadProgress] = useState(0);
  const [banner, setBanner] = useState(null);

  const currentStepPath = location.pathname.split("/").pop();

  const handleUpload = async (payload) => {
    try {
      setLoadingStates(prev => ({ ...prev, uploading: true }));
      setUploadProgress(0); // Reset trước mỗi lần upload
      const response = await profileImport({
        ...payload,
        onProgress: (percent) => setUploadProgress(percent)
      });

      const files = (response.uploadedFiles || []).map((file) => ({
        ...file,
        editableMappingConfig: buildEditableMappingConfig(file.mappingSuggestion),
        confirmedMappingConfig: null,
        mappingConfirmationResult: null
      }));

      setSessionId(response.sessionId);
      if (response.datasetName) setDatasetName(response.datasetName);
      if (response.sourceDataset) setSourceDataset(response.sourceDataset);
      setBundleSchema(response.bundleSchema || null);
      setUploadedFiles(files);
      setSelectedFileId(files[0]?.fileId || null);

      setBanner(null); // Clear any old banners, let the UI transition indicate success
      navigate("/import/review");
    } catch (error) {
      setBanner({ type: "error", title: "Upload Failed", message: error.message });
    } finally {
      setLoadingStates(prev => ({ ...prev, uploading: false }));
      setUploadProgress(0); // Reset sau khi xong
    }
  };

  const handleConfirmMapping = async (file) => {
    try {
      setLoadingStates(prev => ({ ...prev, confirming: true }));
      setBanner(null);

      const response = await confirmMapping({
        sessionId,
        fileId: file.fileId,
        mappingConfig: file.editableMappingConfig
      });

      setUploadedFiles(prev => prev.map(item =>
        item.fileId === file.fileId
          ? {
              ...item,
              confirmedMappingConfig: response.confirmedMappingConfig,
              mappingConfirmationResult: null
            }
          : item
      ));

      setBanner(null); // Clear error banners if any, the green verified pill is enough feedback

    } catch (error) {
      if (error.status === 400) {
        const errorDetails = error.response;

        const normalizedResult = {
          isValid: false,
          errors: errorDetails?.validationResult?.errors
               || errorDetails?.errors
               || [],
          validationResult: errorDetails?.validationResult || null
        };

        setUploadedFiles(prev => prev.map(item =>
          item.fileId === file.fileId
            ? { ...item, mappingConfirmationResult: normalizedResult }
            : item
        ));

        setBanner({
          type: "error",
          title: "Validation Failed",
          message: "Please fix the highlighted errors in the mapping table below."
        });
      } else {
        setBanner({ type: "error", title: "Execution Failed", message: error.message });
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, confirming: false }));
    }
  };

  const handleRunPipeline = async (payload) => {
    try {
      setLoadingStates(prev => ({ ...prev, running: true }));
      const response = await runImport(payload);
      setRunResult(response);
      setBanner(null); // Clear any banners before navigating to complete step
      navigate("/import/complete");
    } catch (error) {
      setBanner({ type: "error", title: "Execution Error", message: error.message });
    } finally {
      setLoadingStates(prev => ({ ...prev, running: false }));
    }
  };

  // ✅ Xóa riêng lỗi của 1 dòng khi user sửa, giữ lại lỗi các dòng khác
  const handleClearRowError = (fileId, rowIndex) => {
    setUploadedFiles(prev => prev.map(item => {
      if (item.fileId !== fileId) return item;
      if (!item.mappingConfirmationResult) return item;

      const remainingErrors = (item.mappingConfirmationResult.errors || []).filter(
        err => typeof err === "string" && !err.includes(`field_mappings[${rowIndex}]`)
      );

      return {
        ...item,
        mappingConfirmationResult: remainingErrors.length > 0
          ? { ...item.mappingConfirmationResult, errors: remainingErrors }
          : null // Hết lỗi → ẩn ValidationPanel luôn
      };
    }));
  };

  const stepContext = {
    sessionId, uploadedFiles, setUploadedFiles,
    selectedFileId, setSelectedFileId,
    datasetName, setDatasetName,
    sourceDataset, setSourceDataset,
    bundleSchema, runResult, loadingStates,
    uploadProgress, // 0-100: tiến trình upload tổng
    handleUpload, handleConfirmMapping, handleRunPipeline,
    handleClearRowError,
    setBanner
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-[1700px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[32px] border border-emerald-100 bg-white shadow-xl shadow-emerald-900/5">
          <div className="border-b border-emerald-50 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_40%),linear-gradient(180deg,#ffffff_0%,#f0fdf4_100%)] px-8 py-10">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between relative">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex rounded-full border border-emerald-200 bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 shadow-sm">
                  Learning Analytics Dashboard
                </div>
                <h1 className="text-4xl font-black tracking-tight sm:text-5xl block !text-slate-900">
  Import & <span className="text-emerald-600">Smart</span> Mapping
</h1>
              </div>
              <div className="flex flex-wrap gap-3">
                <StepPill index="1" label="Upload" active={currentStepPath === "upload"} complete={uploadedFiles.length > 0} />
                <StepPill index="2" label="Review" active={currentStepPath === "review"} complete={uploadedFiles.length > 0 && uploadedFiles.every(f => !!f.confirmedMappingConfig)} />
                <StepPill index="3" label="Execute" active={currentStepPath === "confirm"} complete={!!runResult} />
                <StepPill index="4" label="Finish" active={currentStepPath === "complete"} complete={!!runResult} />
              </div>
            </div>
          </div>
          <div className="space-y-8 p-8">
            <Banner banner={banner} onClose={() => setBanner(null)} />
            <Outlet context={stepContext} />
          </div>
        </div>
      </div>
    </div>
  );
}