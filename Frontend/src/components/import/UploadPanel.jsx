import { useState, useEffect } from "react";

// Tách Component Field ra để dùng nội bộ hoặc export nếu cần
function Field({ label, hint, children }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-sm font-bold text-slate-800">{label}</label>
        {hint ? <p className="mt-1 text-xs text-slate-500 leading-relaxed">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function UploadPanel({ onFilesChange, loading, uploadProgress = 0 }) {
  const [files, setFiles] = useState([]);

  // Mỗi khi danh sách file thay đổi, báo cho UploadStep biết
  useEffect(() => {
    onFilesChange(files);
  }, [files, onFilesChange]);

  function handleFileChange(event) {
    const selectedFiles = Array.from(event.target.files || []);
    setFiles(selectedFiles);
  }

  // ---- Phase labels ----
  const isUploading = loading && uploadProgress < 100;
  const isProfiling = loading && uploadProgress >= 100;

  return (
    <div className="w-full">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">Source Files</h3>
        <div className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
          {files.length > 0 ? `${files.length} ready` : "No files"}
        </div>
      </div>

      <div className="space-y-6">
        {/* ========== UPLOAD / DROP ZONE ========== */}
        {loading ? (
          /* --- Progress Overlay (replaces drop zone while uploading) --- */
          <div className="flex flex-col items-center justify-center gap-6 rounded-[2rem] border-2 border-dashed border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white px-8 py-16">
            {/* Icon with spinning ring */}
            <div className="relative flex h-20 w-20 items-center justify-center">
              <svg
                className="absolute inset-0 h-full w-full animate-spin text-emerald-200"
                viewBox="0 0 80 80"
                fill="none"
              >
                <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="6" />
              </svg>
              <svg
                className="absolute inset-0 h-full w-full -rotate-90 text-emerald-500 transition-all"
                viewBox="0 0 80 80"
                fill="none"
                style={{ transition: "stroke-dashoffset 0.4s ease" }}
              >
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${2 * Math.PI * 36 * (1 - uploadProgress / 100)}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.4s ease" }}
                />
              </svg>
              {/* Center icon */}
              <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                {isProfiling ? (
                  /* Profiling: pulsing brain/cpu icon */
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6 animate-pulse text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                ) : (
                  /* Uploading: cloud upload icon */
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6 text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                )}
              </div>
            </div>

            {/* Phase label & percentage */}
            <div className="text-center">
              <p className="text-base font-bold text-slate-800">
                {isUploading ? "Transferring Files..." : "Analyzing Data..."}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {isUploading
                  ? `Sending ${files.length} file${files.length > 1 ? "s" : ""} to server`
                  : "Profiling columns & detecting schema — please wait"}
              </p>
            </div>

            {/* Linear progress bar */}
            <div className="w-full max-w-sm">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold">
                <span className="text-slate-500 uppercase tracking-wider">
                  {isUploading ? "Upload Progress" : "Analyzing..."}
                </span>
                {isUploading && (
                  <span className="text-emerald-600">{uploadProgress}%</span>
                )}
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                {isUploading ? (
                  /* Determinate green bar */
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 shadow-sm transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                ) : (
                  /* Indeterminate shimmer bar when profiling */
                  <div className="h-full w-full overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400"
                      style={{
                        width: "60%",
                        animation: "shimmer-slide 1.4s ease-in-out infinite"
                      }}
                    />
                  </div>
                )}
              </div>

              {/* File count chips */}
              {isUploading && files.length > 0 && (
                <p className="mt-2 text-center text-[10px] text-slate-400">
                  {files.length} file{files.length > 1 ? "s" : ""} ·{" "}
                  {(files.reduce((s, f) => s + f.size, 0) / 1024).toFixed(1)} KB total
                </p>
              )}
            </div>

            {/* CSS keyframe injected inline for shimmer */}
            <style>{`
              @keyframes shimmer-slide {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(250%); }
              }
            `}</style>
          </div>
        ) : (
          /* --- Default Drop Zone --- */
          <label className="group flex cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-emerald-200 bg-white px-6 py-16 text-center transition-all hover:border-emerald-400 hover:bg-emerald-50/30 hover:shadow-xl hover:shadow-emerald-900/5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 transition group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div className="mt-6 text-base font-bold text-slate-800">Drop your CSV files here</div>
            <div className="mt-1 text-sm text-slate-500">or click to browse your computer</div>
            <input
              type="file"
              multiple
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        )}

        {/* File List — luôn hiển thị kể cả khi đang loading để user thấy đang tải file nào */}
        {files.length > 0 && (
          <div className="grid grid-cols-1 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {files.map((file) => (
              <div
                key={`${file.name}-${file.size}`}
                className={`flex items-center justify-between rounded-2xl border p-4 shadow-sm transition-all ${
                  loading
                    ? "border-emerald-100 bg-emerald-50/40"
                    : "border-slate-100 bg-white hover:border-emerald-200"
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${loading ? "bg-emerald-100 text-emerald-500" : "bg-emerald-50 text-emerald-600"}`}>
                    {loading ? (
                      <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="truncate text-sm font-bold text-slate-700">{file.name}</span>
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">CSV Document</span>
                  </div>
                </div>
                <span className={`shrink-0 font-mono text-[11px] font-bold px-2 py-1 rounded-md ${loading ? "bg-emerald-100 text-emerald-600" : "bg-emerald-50 text-emerald-600"}`}>
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}