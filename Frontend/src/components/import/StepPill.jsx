import React from "react";

function CheckIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function StepPill({ index, label, active, complete }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all duration-300 ${
        complete
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : active
          ? "border-emerald-500 bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-105"
          : "border-slate-200 bg-white text-slate-400"
      }`}
    >
      {/* Index bubble / checkmark */}
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0 ${
          complete
            ? "bg-emerald-500 text-white"
            : active
            ? "bg-white text-emerald-600"
            : "bg-slate-100 text-slate-400"
        }`}
      >
        {complete ? <CheckIcon /> : index}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}