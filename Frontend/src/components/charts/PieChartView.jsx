/**
 * PieChartView.jsx — Pure Recharts pie chart rendering.
 * Max 5 slices (enforced by adapter).
 */

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

import { getStableColor } from "../../utils/colorUtils";

export default function PieChartView({ data }) {
  const { data: chartData } = data;

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[380px] text-slate-400 text-sm">
        No data to display
      </div>
    );
  }

  return (
    <div style={{ minHeight: 380, width: "100%" }}>
      <ResponsiveContainer width="100%" height={380}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          outerRadius={130}
          innerRadius={60}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) =>
            `${name}: ${(percent * 100).toFixed(1)}%`
          }
          labelLine={{ stroke: "#94a3b8" }}
        >
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill={getPieSliceColor(entry.name)} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
          formatter={(value) => value.toLocaleString()}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function getPieSliceColor(name) {
  const normalized = String(name || "").trim().toLowerCase();
  const outcomeColors = {
    distinction: "#7c3aed",
    pass: "#10b981",
    fail: "#ef4444",
    withdrawn: "#f97316",
    withdraw: "#f97316",
    unknown: "#94a3b8",
    other: "#64748b",
  };

  return outcomeColors[normalized] || getStableColor(name);
}
