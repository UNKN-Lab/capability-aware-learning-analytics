export function getSemanticTag(columnKey, value) {
  const key = String(columnKey ?? "").toLowerCase();

  if (typeof value === "boolean") {
    if (key.includes("triggered") || key.startsWith("flag_") || key.includes("risk")) {
      return value
        ? { label: "Triggered", className: "text-rose-700 bg-rose-100 border-rose-300" }
        : { label: "Stable", className: "text-emerald-700 bg-emerald-100 border-emerald-300" };
    }
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const palette = {
    high: { className: "text-rose-700 bg-rose-100 border-rose-300" },
    medium: { className: "text-amber-700 bg-amber-100 border-amber-300" },
    low: { className: "text-emerald-700 bg-emerald-100 border-emerald-300" },
    info: { className: "text-slate-700 bg-slate-100 border-slate-300" },
    unknown: { className: "text-slate-700 bg-slate-100 border-slate-300" },
    triggered: { className: "text-rose-700 bg-rose-100 border-rose-300" },
    stable: { className: "text-emerald-700 bg-emerald-100 border-emerald-300" },
    pass: { className: "text-emerald-700 bg-emerald-100 border-emerald-300" },
    passed: { className: "text-emerald-700 bg-emerald-100 border-emerald-300" },
    submitted: { className: "text-emerald-700 bg-emerald-100 border-emerald-300" },
    fail: { className: "text-rose-700 bg-rose-100 border-rose-300" },
    failed: { className: "text-rose-700 bg-rose-100 border-rose-300" },
    pending: { className: "text-amber-700 bg-amber-100 border-amber-300" },
    missing: { className: "text-amber-700 bg-amber-100 border-amber-300" },
    withdrawn: { className: "text-amber-700 bg-amber-100 border-amber-300" },
    distinction: { className: "text-sky-700 bg-sky-100 border-sky-300" }
  };

  const isSemanticKey =
    key.includes("risk") ||
    key.includes("status") ||
    key.includes("severity") ||
    key.includes("outcome") ||
    key.includes("triggered");

  if (!isSemanticKey || !palette[normalized]) {
    return null;
  }

  return {
    label: value,
    className: palette[normalized].className
  };
}
