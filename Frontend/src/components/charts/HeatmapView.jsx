/**
 * HeatmapView.jsx - Custom heatmap rendering.
 * Uses a table for matrix heatmaps and a square weekly grid for week activity.
 */

export default function HeatmapView({ data, config }) {
  const { rows, cols, cells, min, max } = data;

  if (!cells || cells.length === 0) {
    return (
      <div className="flex items-center justify-center h-[380px] text-slate-400 text-sm">
        No data to display
      </div>
    );
  }

  const lookup = {};
  for (const cell of cells) {
    lookup[`${cell.row}|${cell.col}`] = cell.value;
  }

  const getIntensity = (value) => getHeatmapIntensity(value, min, max);
  const getColor = (value) => getHeatmapColor(getIntensity(value));
  const getTextColor = (value) => getHeatmapTextColor(getIntensity(value));

  if (config.variant === "week_activity" && rows.length === 1) {
    return (
      <WeeklyHeatmapGrid
        cols={cols}
        lookup={lookup}
        row={rows[0]}
        getColor={getColor}
        getTextColor={getTextColor}
        xField={config.x_field}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase text-slate-500">
              {config.series_field || ""}
            </th>
            {cols.map((col) => (
              <th
                key={col}
                className="min-w-[60px] border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] font-semibold uppercase text-slate-500"
              >
                {formatHeatmapHeader(col, config.x_field)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <td className="sticky left-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                {row}
              </td>
              {cols.map((col) => {
                const val = lookup[`${row}|${col}`];
                const hasValue = val !== undefined && val !== null;
                return (
                  <td
                    key={col}
                    className="border border-slate-200 px-3 py-2 text-center font-mono text-xs transition-colors"
                    style={hasValue ? {
                      backgroundColor: getColor(val),
                      color: getTextColor(val),
                      fontWeight: 600,
                    } : { color: "#cbd5e1", backgroundColor: "#f8fafc" }}
                  >
                    {hasValue ? formatHeatmapValue(val) : "0"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeeklyHeatmapGrid({ cols, lookup, row, getColor, getTextColor, xField }) {
  return (
    <div className="w-full overflow-x-auto pb-2">
      <div
        className="mx-auto grid w-fit gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: "repeat(7, clamp(44px, 8vw, 68px))" }}
      >
        {cols.map((col) => {
          const val = lookup[`${row}|${col}`];
          const hasValue = val !== undefined && val !== null;
          return (
            <div
              key={col}
              className="flex aspect-square min-w-0 flex-col items-center justify-center rounded-md border border-slate-200 text-center transition-colors"
              style={hasValue ? {
                backgroundColor: getColor(val),
                color: getTextColor(val),
              } : { color: "#cbd5e1", backgroundColor: "#f8fafc" }}
              title={`${formatHeatmapHeader(col, xField)}: ${hasValue ? formatHeatmapValue(val) : "0"} clicks`}
            >
              <span className="text-[9px] font-semibold uppercase opacity-80 sm:text-[10px]">
                {formatHeatmapHeader(col, xField)}
              </span>
              <span className="mt-0.5 text-xs font-bold sm:mt-1 sm:text-sm">
                {hasValue ? formatHeatmapValue(val) : "0"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatHeatmapHeader(value, field) {
  if (field === "week_number") return `W${value}`;
  return value;
}

function formatHeatmapValue(value) {
  return Number.isInteger(value) ? value : value.toFixed(1);
}

function getHeatmapIntensity(value, min, max) {
  const numeric = Number(value);
  const minValue = Number(min);
  const maxValue = Number(max);

  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return 0;
  if (maxValue <= minValue) return 0.65;

  return Math.min(1, Math.max(0, (numeric - minValue) / (maxValue - minValue)));
}

function getHeatmapColor(intensity) {
  if (intensity <= 0) return "#f8fafc";

  // Keep hue/saturation stable and vary lightness only so larger values are
  // always visually darker than smaller values.
  const lightness = 92 - intensity * 48;
  return `hsl(162 58% ${lightness.toFixed(1)}%)`;
}

function getHeatmapTextColor(intensity) {
  if (intensity <= 0) return "#cbd5e1";
  return intensity >= 0.55 ? "#ffffff" : "#065f46";
}
