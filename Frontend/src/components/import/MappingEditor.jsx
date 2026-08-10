import { useMemo, useState } from "react";
import { Drawer, Select } from "antd";
import {
  CANONICAL_FIELD_OPTIONS,
  TRANSFORM_OPTIONS,
  ENTITY_SCOPE_OPTIONS,
  STATUS_OPTIONS
} from "../../config/mappingOptions";

// --- HELPERS ---
function countByStatus(rows) {
  return {
    total: rows.length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    needsReview: rows.filter((r) => r.status === "needs_review").length,
    ignored: rows.filter((r) => r.status === "ignored").length
  };
}

function Counter({ label, value, tone = "default" }) {
  const toneMap = {
    default: "bg-slate-50 border-slate-100 text-slate-900",
    success: "bg-emerald-50 border-emerald-100 text-emerald-700",
    warning: "bg-amber-50 border-amber-100 text-amber-700",
    muted: "bg-white border-slate-100 text-slate-400"
  };

  return (
    <div className={`rounded-2xl border p-4 transition-all hover:shadow-md ${toneMap[tone]}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.15em] opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}

function ValidationPanel({ validation }) {
  if (!validation) return null;

  const isValid = validation.isValid ?? false;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-500">
      <div className={`rounded-2xl border px-5 py-3 flex items-center gap-3 ${
        isValid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
      }`}>
        <div className={`h-2 w-2 rounded-full ${isValid ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`} />
        <div className="text-sm font-bold uppercase tracking-wide">
          Validation Status: {isValid ? "Passed" : "Failed"}
        </div>
      </div>
    </div>
  );
}

const GUIDE_COLUMNS = [
  ["Raw Attribute", "The original column in your uploaded CSV."],
  ["Canonical Field", "The standard field used by the analytics system."],
  ["Scope", "The unified-schema entity where the value will be stored."],
  ["Transformation", "The conversion applied before the value is saved."],
  ["Status", "Confirm the suggestion, review it, or exclude the column."],
  ["Match Accuracy", "How confident the automatic mapping suggestion is."]
];

const GUIDE_ENTITIES = [
  ["student", "Learner profile", "gender, age_years, region"],
  ["course", "Course information", "course_id, course_name"],
  ["enrollment", "Learner-course relationship", "final_outcome, previous_attempt_count"],
  ["assessment", "Assessments and results", "assessment_name, score_normalized"],
  ["engagement", "Learning activity", "resource_type, engagement_count"]
];

const GUIDE_TRANSFORMS = [
  ["direct_copy", "The source value already has the expected format."],
  ["normalize_score", "Convert a source score to the canonical 0–100 scale."],
  ["normalize_gender", "Standardize values such as Male/Female or M/F."],
  ["cast_int / cast_float", "Convert a numeric-looking value to a number."],
  ["cast_boolean", "Convert Yes/No, True/False, or 1/0 to a boolean."],
  ["ignore", "Do not import this source column."]
];

function GuideTable({ headers, rows }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((cell, index) => (
                <td
                  key={`${cell}-${index}`}
                  className={`px-4 py-3 align-top ${index === 0 ? "font-bold text-slate-800" : "text-slate-600"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MappingGuide({ open, onClose, file }) {
  const isUci = String(file?.inferredDatasetType || "").toUpperCase().includes("UCI");
  const scoreExample = isUci
    ? "UCI example: G1 = 7 → score_normalized = 35/100"
    : "Score example: score = 73 → score_normalized = 73/100";

  return (
    <Drawer
      title="Mapping Guide"
      placement="right"
      width="min(620px, 100vw)"
      open={open}
      onClose={onClose}
      styles={{ body: { padding: 24 } }}
    >
      <div className="space-y-7 pb-8">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Quick workflow</div>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
            <li>Review rows marked <strong>Needs Review</strong>.</li>
            <li>Check that the canonical field and scope describe the source column.</li>
            <li>Confirm correct rows or choose <strong>Ignored</strong> for fields you do not need.</li>
          </ol>
        </div>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-900">What each column means</h3>
          <GuideTable headers={["Column", "Meaning"]} rows={GUIDE_COLUMNS} />
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-900">Unified schema scopes</h3>
          <p className="text-sm leading-6 text-slate-500">
            Scope determines which logical entity owns the mapped value.
          </p>
          <GuideTable headers={["Scope", "Purpose", "Examples"]} rows={GUIDE_ENTITIES} />
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-black text-slate-900">Transformations</h3>
          <GuideTable headers={["Transformation", "Use it when"]} rows={GUIDE_TRANSFORMS} />
        </section>

        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h3 className="text-sm font-black text-blue-900">Score normalization preview</h3>
          <p className="mt-2 font-mono text-xs font-bold text-blue-700">{scoreExample}</p>
          <p className="mt-2 text-xs leading-5 text-blue-800/70">
            The canonical field <strong>score_normalized</strong> is stored on a 0–100 scale.
          </p>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <strong>Before confirming:</strong> verify low-confidence mappings, identifiers, score columns,
          and any transformation that changes the original value.
        </section>
      </div>
    </Drawer>
  );
}

// --- MAIN COMPONENT ---
// ✅ Nhận thêm prop onClearRowError từ parent
export default function MappingEditor({ file, onChangeEditableConfig, onClearRowError }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const searchTerm = "";
  const statusFilter = "all";

  const config = file?.editableMappingConfig || {};
  const rows = useMemo(() => config.field_mappings || [], [config.field_mappings]);
  const statusCounts = countByStatus(rows);

  const validation = file?.mappingConfirmationResult || null;

  const getRowError = (rowIndex) => {
    const errorList = validation?.errors || [];
    if (errorList.length === 0) return null;

    const rowError = errorList.find(err =>
      typeof err === "string" && err.includes(`field_mappings[${rowIndex}]`)
    );

    if (!rowError) return null;

    let cleanMsg = rowError.split(`field_mappings[${rowIndex}].`)[1] || rowError;

    if (cleanMsg.includes('status must not be "needs_review"')) {
      return "Must be set to CONFIRMED or IGNORED before proceeding.";
    }

    return cleanMsg.replace(/"/g, "");
  };

  // Returns amber warning when user manually confirmed a low-AI-confidence mapping
  const getRowWarning = (row) => {
    if (row.status !== "confirmed") return null;
    if (typeof row.confidence === "number" && row.confidence < 0.7) {
      return `Low AI confidence (${Math.round(row.confidence * 100)}%) — manually confirmed. Verify this mapping is intentional.`;
    }
    return null;
  };

  const profilingColumnMap = useMemo(() => {
    const columns = file?.profilingResult?.columns || [];
    return Object.fromEntries(columns.map((col) => [col.raw_column, col]));
  }, [file]);

  const enrichedRows = useMemo(() => {
    return rows.map((row, index) => {
      const primarySourceField =
        Array.isArray(row.source_fields) && row.source_fields.length > 0
          ? row.source_fields[0]
          : null;
      const profilingMeta = primarySourceField ? profilingColumnMap[primarySourceField] : null;
      return {
        ...row,
        _rowIndex: index,
        _displayRawColumn: primarySourceField || "-",
        _displayDetectedType: profilingMeta?.detected_type || "-"
      };
    });
  }, [rows, profilingColumnMap]);

  const filteredRows = useMemo(() => {
    return enrichedRows.filter((row) => {
      const query = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !query ||
        String(row._displayRawColumn).toLowerCase().includes(query) ||
        String(row.canonical_field).toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [enrichedRows, searchTerm, statusFilter]);

  function updateRow(index, patch) {
    const nextRows = rows.map((item, rowIndex) => {
      if (rowIndex !== index) return item;
      let updatedItem = { ...item, ...patch };
      if (updatedItem.status === "ignored") {
        updatedItem = { ...updatedItem, canonical_field: null, transform: "ignore", entity_scope: null };
      } else if (item.status === "ignored" && (patch.status === "confirmed" || patch.status === "suggested")) {
        if (!updatedItem.entity_scope) updatedItem.entity_scope = "student";
        if (updatedItem.transform === "ignore") updatedItem.transform = "direct_copy";
      }
      return updatedItem;
    });

    onChangeEditableConfig(file.fileId, { ...config, field_mappings: nextRows, mapping_status: "draft" });

    // ✅ Chỉ xóa lỗi của dòng vừa sửa, các dòng khác không bị ảnh hưởng
    onClearRowError?.(file.fileId, index);
  }

  if (!file) {
    return (
      <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">
        Select a file to begin review
      </div>
    );
  }

  return (
    <section className="rounded-[32px] border border-emerald-100 bg-white shadow-xl shadow-emerald-900/5 overflow-hidden animate-in fade-in duration-500">
      <div className="border-b border-slate-100 bg-slate-50/30 px-8 py-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            4. Mapping Editor
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
            >
              ? Mapping Guide
            </button>
            <span className="rounded-full bg-emerald-600 px-4 py-1.5 text-[10px] font-black uppercase text-white tracking-widest shadow-sm">
              Source: {file.fileName}
            </span>
          </div>
        </div>
      </div>

      <MappingGuide open={guideOpen} onClose={() => setGuideOpen(false)} file={file} />

      <div className="space-y-8 p-8">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Counter label="Total Fields" value={statusCounts.total} />
          <Counter label="Validated" value={statusCounts.confirmed} tone="success" />
          <Counter label="Pending Review" value={statusCounts.needsReview} tone="warning" />
          <Counter label="Excluded" value={statusCounts.ignored} tone="muted" />
        </div>

        <ValidationPanel validation={validation} />

        <div className="rounded-[24px] border border-slate-100 overflow-hidden shadow-inner bg-slate-50/20">
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-white shadow-md">
                <tr className="text-left text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                  <th className="w-[180px] px-6 py-4">Raw Attribute</th>
                  <th className="w-[200px] px-6 py-4">Canonical Field</th>
                  <th className="w-[140px] px-6 py-4">Scope</th>
                  <th className="w-[140px] px-6 py-4">Transformation</th>
                  <th className="w-[160px] px-6 py-4">Status</th>
                  <th className="w-[100px] px-6 py-4 text-center">Match Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {filteredRows.map((row) => {
                  const rowError = getRowError(row._rowIndex);
                  const rowWarning = !rowError ? getRowWarning(row) : null;
                  return (
                    <tr
                      key={row._rowIndex}
                      className={`group transition-all hover:bg-emerald-50/30 ${
                        rowError ? "bg-red-50/60" : rowWarning ? "bg-amber-50/40" : ""
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div
                          className={`font-black truncate ${
                            rowError ? "text-red-700" : rowWarning ? "text-amber-700" : "text-slate-800"
                          }`}
                          title={row._displayRawColumn}
                        >
                          {row._displayRawColumn}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">
                          {row._displayDetectedType}
                        </div>

                        {rowError && (
                          <div className="mt-2 p-1.5 bg-white/90 border border-red-200 rounded text-[9px] font-black text-red-600 uppercase shadow-sm">
                            <span className="mr-1">⚠️</span>
                            {rowError}
                          </div>
                        )}
                        {rowWarning && (
                          <div className="mt-2 p-1.5 bg-amber-50 border border-amber-200 rounded text-[9px] font-bold text-amber-600 shadow-sm">
                            <span className="mr-1">💡</span>
                            {rowWarning}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <Select
                          showSearch
                          allowClear
                          placeholder="-- Unmapped --"
                          value={row.canonical_field || undefined}
                          onChange={(val) => updateRow(row._rowIndex, { canonical_field: val || null })}
                          disabled={row.status === "ignored"}
                          className={`w-full text-xs font-bold ${rowError ? "status-error" : ""}`}
                          status={rowError ? "error" : ""}
                          options={CANONICAL_FIELD_OPTIONS.map(opt => ({ label: opt, value: opt }))}
                          filterOption={(input, option) =>
                            (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                          }
                        />
                      </td>

                      <td className="px-6 py-4">
                        <Select
                          placeholder="-- Scope --"
                          value={row.entity_scope || undefined}
                          onChange={(val) => updateRow(row._rowIndex, { entity_scope: val || null })}
                          disabled={row.status === "ignored"}
                          className="w-full text-[11px] font-bold"
                          options={ENTITY_SCOPE_OPTIONS.map(opt => ({ label: opt, value: opt }))}
                        />
                      </td>

                      <td className="px-6 py-4">
                        <Select
                          value={row.transform || "direct_copy"}
                          onChange={(val) => updateRow(row._rowIndex, { transform: val })}
                          disabled={row.status === "ignored"}
                          className="w-full text-[11px] font-bold italic text-slate-600"
                          options={TRANSFORM_OPTIONS.map(opt => ({ label: opt, value: opt }))}
                        />
                      </td>

                      <td className="px-6 py-4">
                        <div className={`rounded-xl border transition-all ${
                          row.status === "confirmed"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : row.status === "needs_review"
                            ? "bg-amber-50 border-amber-300 ring-2 ring-amber-100/50 text-amber-700"
                            : "bg-slate-50 border-slate-200 text-slate-500"
                        } ${rowError ? "!border-red-400 !bg-red-50 !text-red-700" : ""}`}>
                          <Select
                            variant="borderless"
                            bordered={false}
                            value={row.status}
                            onChange={(val) => updateRow(row._rowIndex, { status: val })}
                            className="w-full text-[10px] font-black uppercase tracking-wider"
                            popupClassName="custom-status-dropdown"
                            style={{ 
                              color: 'inherit',
                              fontWeight: 900 
                            }}
                            options={STATUS_OPTIONS.map(opt => ({ 
                              label: <span className="text-[10px] font-black uppercase tracking-wider">{opt.replace('_', ' ')}</span>, 
                              value: opt 
                            }))}
                          />
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center font-black text-slate-400">
                        {row.confidence ? `${Math.round(row.confidence * 100)}%` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
