import React from "react";

export default function Banner({ banner, onClose }) {
  if (!banner) return null;
  const toneMap = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-emerald-100 bg-white text-emerald-900"
  };

  return (
    <div className={`rounded-2xl border px-5 py-4 shadow-sm animate-in fade-in slide-in-from-top-2 ${toneMap[banner.type] || toneMap.info}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-2 w-2 rounded-full ${banner.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
          <div>
            <div className="text-sm font-bold">{banner.title}</div>
            <div className="text-xs opacity-80">{banner.message}</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-black/5 transition-colors">
          <span className="text-xs font-bold uppercase tracking-wider">Dismiss</span>
        </button>
      </div>
    </div>
  );
}