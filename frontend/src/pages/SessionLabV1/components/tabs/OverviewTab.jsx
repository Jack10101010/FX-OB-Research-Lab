import React from "react";
import { SectionLabel, Metric, fmtR } from "../primitives";
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { DEEP_DIVE_LONDON } from "../../mockData";
import { ArrowRight, Calendar, Zap, Layers3, GitBranch } from "lucide-react";

const tooltipStyle = {
  backgroundColor: "#121C29",
  border: "1px solid #223142",
  borderRadius: 6,
  fontSize: 11,
  color: "#E5EDF7",
  padding: "6px 10px",
};

export default function OverviewTab({ session }) {
  const dd = DEEP_DIVE_LONDON;
  const m = dd.metrics;

  // merge equity datasets
  const merged = dd.equity.map((e, i) => ({
    t: e.t,
    session: e.v,
    all: dd.allSessionsEquity[i]?.v ?? null,
  }));

  return (
    <div className="space-y-5">
      {/* Top metric row */}
      <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] px-4 py-4">
        <SectionLabel className="mb-3">Session Overview</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-x-4 gap-y-3">
          <Metric label="Net R" value={`+${m.netR}R`} tone="pos" testId="metric-net-r" />
          <Metric label="Win Rate" value={`${m.wr}%`} tone="pos" />
          <Metric label="Expectancy (R)" value={`+${m.expectancy}R`} tone="pos" />
          <Metric label="Profit Factor" value={m.pf} tone="pos" />
          <Metric label="Max Drawdown" value={`${m.dd}R`} tone="neg" />
          <Metric label="Trades" value={m.trades} tone="cyan" />
          <Metric label="Avg R / Trade" value={`+${m.avgR}R`} tone="pos" />
          <Metric label="Avg Time in Trade" value={m.avgTime} />
        </div>
      </div>

      {/* Chart + Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        {/* Net R over time */}
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <div className="flex items-baseline justify-between mb-3">
            <SectionLabel>Net R Over Time</SectionLabel>
            <div className="flex items-center gap-3 text-[10px] font-num uppercase tracking-wider">
              <Legend2 color="#22C55E" label="This Session" />
              <Legend2 color="#94A3B8" label="All Sessions" dashed />
            </div>
          </div>
          <div className="h-56" data-testid="chart-net-r-over-time">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={merged} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#223142" />
                <XAxis
                  dataKey="t"
                  tick={{ fill: "#64748B", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                  axisLine={{ stroke: "#223142" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#64748B", fontSize: 10, fontFamily: "IBM Plex Mono" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="all"
                  stroke="#94A3B8"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="session"
                  stroke="#22C55E"
                  strokeWidth={2.25}
                  dot={{ fill: "#22C55E", r: 2.5, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Breakdown Snapshot */}
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <div className="flex items-baseline justify-between mb-3">
            <SectionLabel>Breakdown Snapshot</SectionLabel>
            <button className="text-[10px] text-[hsl(var(--accent-primary))] hover:opacity-80 font-num uppercase tracking-wider inline-flex items-center gap-1">
              View Full <ArrowRight size={10} />
            </button>
          </div>
          <div className="overflow-hidden rounded-md border border-[hsl(var(--border-soft))]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[hsl(var(--panel-2))] text-muted-lab uppercase tracking-wider text-[9px]">
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-left px-2 py-2 font-medium">Best</th>
                  <th className="text-right px-2 py-2 font-medium">Net R</th>
                  <th className="text-left px-2 py-2 font-medium">Worst</th>
                  <th className="text-right px-3 py-2 font-medium">Net R</th>
                </tr>
              </thead>
              <tbody>
                {dd.breakdown.map((row) => (
                  <tr key={row.cat} className="border-t border-[hsl(var(--border-soft))]/60 hover:bg-[hsl(var(--panel-2))]/40">
                    <td className="px-3 py-1.5 text-[hsl(var(--text-2))]">{row.cat}</td>
                    <td className="px-2 py-1.5 font-num text-[hsl(var(--text))]">{row.best}</td>
                    <td className={`px-2 py-1.5 font-num text-right ${row.bestR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                      {fmtR(row.bestR, 2)}
                    </td>
                    <td className="px-2 py-1.5 font-num text-[hsl(var(--text))]">{row.worst}</td>
                    <td className={`px-3 py-1.5 font-num text-right ${row.worstR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                      {row.worstR === 0 ? "—" : fmtR(row.worstR, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Small cards underneath */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniCard icon={Calendar} label="Best Day" value="Friday" sub="+4.12R" tone="pos" />
        <MiniCard icon={Zap} label="Fast Stopouts" value="4" sub="22.2% of trades" tone="neg" />
        <MiniCard icon={Layers3} label="OB Created" value="London" sub="+4.8R" tone="pos" />
        <MiniCard icon={GitBranch} label="OB Origin" value="New York" sub="+3.1R" tone="cyan" />
      </div>
    </div>
  );
}

function Legend2({ color, label, dashed }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[hsl(var(--text-2))]">
      <svg width="18" height="2" viewBox="0 0 18 2">
        <line
          x1="0" y1="1" x2="18" y2="1"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? "3 2" : "0"}
        />
      </svg>
      {label}
    </span>
  );
}

function MiniCard({ icon: Icon, label, value, sub, tone }) {
  const cls = tone === "pos" ? "text-[#22C55E]" : tone === "neg" ? "text-[#EF4444]" : tone === "cyan" ? "text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--text))]";
  return (
    <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-md bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] flex items-center justify-center text-[hsl(var(--accent-primary))]">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <div className="label-eyebrow">{label}</div>
        <div className={`font-num tabular text-sm font-semibold ${cls}`}>{value}</div>
        <div className="text-[10px] text-muted-lab font-num">{sub}</div>
      </div>
    </div>
  );
}
