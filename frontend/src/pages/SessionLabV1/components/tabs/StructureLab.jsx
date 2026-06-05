import React from "react";
import { SectionLabel, fmtR } from "../primitives";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";
import { STRUCTURE_LAB } from "../../mockData";

const tooltipStyle = {
  backgroundColor: "#121C29",
  border: "1px solid #223142",
  borderRadius: 6,
  fontSize: 11,
  color: "#E5EDF7",
  padding: "6px 10px",
};

function StructCard({ name, data, color }) {
  const positive = data.netR >= 0;
  return (
    <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
      <div className="flex items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
          <span className="font-display text-sm font-bold uppercase tracking-wider" style={{ color }}>{name}</span>
        </div>
      </div>
      <div className={`font-display text-4xl font-bold tabular ${positive ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
        {fmtR(data.netR, 2)}
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
        <Sm label="Trades" value={data.trades} />
        <Sm label="WR" value={`${data.wr}%`} />
        <Sm label="PF" value={data.pf ?? "∞"} />
        <Sm label="Max DD" value={`${data.dd}R`} tone="neg" />
      </div>
    </div>
  );
}

function Sm({ label, value, tone }) {
  const cls = tone === "neg" ? "text-[#EF4444]" : "text-[hsl(var(--text))]";
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`font-num tabular text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

export default function StructureLab({ structureData }) {
  // Real data when available, mock fallback otherwise
  const bos    = structureData?.bos    ?? STRUCTURE_LAB.bos;
  const choch  = structureData?.choch  ?? STRUCTURE_LAB.choch;
  const matrix = structureData?.matrix ?? STRUCTURE_LAB.matrix;

  const donut = [
    { name: "BOS",   value: bos.trades,   color: "#3B82F6" },
    { name: "CHoCH", value: choch.trades, color: "#A855F7" },
  ];
  const donutTotal   = bos.trades + choch.trades;
  const bosPercent   = donutTotal > 0 ? ((bos.trades   / donutTotal) * 100).toFixed(1) : "0.0";
  const chochPercent = donutTotal > 0 ? ((choch.trades / donutTotal) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-5">
      <p className="text-xs text-[hsl(var(--text-2))]">Compare BOS vs CHoCH performance and drill into interactions.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StructCard name="BOS"   data={bos}   color="#3B82F6" />
        <StructCard name="CHoCH" data={choch} color="#A855F7" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut */}
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <SectionLabel className="mb-3">Trades by Structure</SectionLabel>
          <div className="flex items-center gap-5">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
                    {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-num tabular text-2xl font-bold text-[hsl(var(--text))]">{donutTotal}</span>
                <span className="text-[9px] text-muted-lab uppercase tracking-wider font-num">Total Trades</span>
              </div>
            </div>
            <ul className="flex-1 space-y-2 text-xs">
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#3B82F6]" />
                <span className="text-[hsl(var(--text))] font-medium">BOS</span>
                <span className="ml-auto text-[hsl(var(--text-2))] font-num">{bos.trades} ({bosPercent}%)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#A855F7]" />
                <span className="text-[hsl(var(--text))] font-medium">CHoCH</span>
                <span className="ml-auto text-[hsl(var(--text-2))] font-num">{choch.trades} ({chochPercent}%)</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Net R over time — placeholder */}
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <SectionLabel className="mb-3">Net R by Structure Over Time</SectionLabel>
          <div className="flex items-center justify-center h-44 text-[11px] text-muted-lab font-num">
            Time-series view coming in a future update.
          </div>
        </div>
      </div>

      {/* 2×2 Matrix */}
      <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
        <SectionLabel className="mb-3">Structure Breakdown by Direction</SectionLabel>
        <div className="overflow-hidden rounded-md border border-[hsl(var(--border-soft))]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[hsl(var(--panel-2))] text-muted-lab uppercase tracking-wider text-[9px]">
                <th className="text-left px-3 py-2 font-medium">Combo</th>
                <th className="text-right px-2 py-2 font-medium">Net R</th>
                <th className="text-right px-2 py-2 font-medium">Trades</th>
                <th className="text-right px-2 py-2 font-medium">Win Rate</th>
                <th className="text-right px-2 py-2 font-medium">PF</th>
                <th className="text-right px-3 py-2 font-medium">Max DD</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((r) => (
                <tr key={`${r.dir}-${r.struct}`} className="border-t border-[hsl(var(--border-soft))]/60 hover:bg-[hsl(var(--panel-2))]/40">
                  <td className="px-3 py-1.5 text-[hsl(var(--text))]">
                    <span className="font-num">
                      <span className={r.dir === "Long" ? "text-[#22C55E]" : "text-[#EF4444]"}>{r.dir}</span>
                      {" · "}
                      <span className={r.struct === "BOS" ? "text-[#3B82F6]" : "text-[#A855F7]"}>{r.struct}</span>
                    </span>
                  </td>
                  <td className={`px-2 py-1.5 font-num text-right ${r.netR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(r.netR, 2)}</td>
                  <td className="px-2 py-1.5 font-num text-right text-[hsl(var(--text))]">{r.trades}</td>
                  <td className="px-2 py-1.5 font-num text-right text-[hsl(var(--text))]">{r.wr}%</td>
                  <td className="px-2 py-1.5 font-num text-right text-[hsl(var(--text))]">{r.pf ?? "∞"}</td>
                  <td className="px-3 py-1.5 font-num text-right text-[#EF4444]">{r.dd}R</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-muted-lab font-num">Structure breakdown updates when a new session is selected.</p>
      </div>
    </div>
  );
}
