import React, { useState } from "react";
import { SectionLabel, ToggleChip, fmtR } from "../primitives";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
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
  return (
    <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
          <span className="font-display text-sm font-bold uppercase tracking-wider" style={{ color }}>{name}</span>
        </div>
        <button className="text-[10px] text-[#22D3EE] hover:text-[#67E8F9] font-mono uppercase tracking-wider">Include</button>
      </div>
      <div className="font-display text-4xl font-bold tabular text-[#22C55E]">{fmtR(data.netR, 2)}</div>
      <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
        <Sm label="Trades" value={data.trades} />
        <Sm label="WR" value={`${data.wr}%`} />
        <Sm label="PF" value={data.pf} />
        <Sm label="Max DD" value={`${data.dd}R`} tone="neg" />
      </div>
    </div>
  );
}

function Sm({ label, value, tone }) {
  const cls = tone === "neg" ? "text-[#EF4444]" : "text-[#E5EDF7]";
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`font-mono tabular text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

export default function StructureLab() {
  const [bosOn, setBosOn] = useState(true);
  const [chochOn, setChochOn] = useState(true);

  const donut = [
    { name: "BOS",   value: STRUCTURE_LAB.bos.trades,   color: "#3B82F6" },
    { name: "CHoCH", value: STRUCTURE_LAB.choch.trades, color: "#A855F7" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#94A3B8]">Compare BOS vs CHoCH performance and drill into interactions.</p>
        <div className="flex items-center gap-3">
          <span className="label-eyebrow">Include in Preview</span>
          <ToggleChip label="BOS" active={bosOn} onClick={() => setBosOn((v) => !v)} color="blue" testId="sl-toggle-bos" />
          <ToggleChip label="CHoCH" active={chochOn} onClick={() => setChochOn((v) => !v)} color="purple" testId="sl-toggle-choch" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StructCard name="BOS" data={STRUCTURE_LAB.bos} color="#3B82F6" />
        <StructCard name="CHoCH" data={STRUCTURE_LAB.choch} color="#A855F7" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut */}
        <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
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
                <span className="font-mono tabular text-2xl font-bold text-[#E5EDF7]">27</span>
                <span className="text-[9px] text-[#64748B] uppercase tracking-wider font-mono">Total Trades</span>
              </div>
            </div>
            <ul className="flex-1 space-y-2 text-xs">
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#3B82F6]" />
                <span className="text-[#E5EDF7] font-medium">BOS</span>
                <span className="ml-auto text-[#94A3B8] font-mono">17 (63.0%)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#A855F7]" />
                <span className="text-[#E5EDF7] font-medium">CHoCH</span>
                <span className="ml-auto text-[#94A3B8] font-mono">10 (37.0%)</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Net R over time */}
        <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
          <div className="flex items-baseline justify-between mb-3">
            <SectionLabel>Net R by Structure Over Time</SectionLabel>
            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider">
              <Legend2 color="#3B82F6" label="BOS" />
              <Legend2 color="#A855F7" label="CHoCH" />
            </div>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={STRUCTURE_LAB.overTime} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#223142" />
                <XAxis dataKey="t" tick={{ fill: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#223142" }} tickLine={false} interval={2} />
                <YAxis tick={{ fill: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="bos" stroke="#3B82F6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="choch" stroke="#A855F7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 2x2 Matrix */}
      <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
        <SectionLabel className="mb-3">Structure Breakdown by Direction</SectionLabel>
        <div className="overflow-hidden rounded-md border border-[#223142]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#172331] text-[#64748B] uppercase tracking-wider text-[9px]">
                <th className="text-left px-3 py-2 font-medium">Combo</th>
                <th className="text-right px-2 py-2 font-medium">Net R</th>
                <th className="text-right px-2 py-2 font-medium">Trades</th>
                <th className="text-right px-2 py-2 font-medium">Win Rate</th>
                <th className="text-right px-2 py-2 font-medium">PF</th>
                <th className="text-right px-3 py-2 font-medium">Max DD</th>
              </tr>
            </thead>
            <tbody>
              {STRUCTURE_LAB.matrix.map((r) => (
                <tr key={`${r.dir}-${r.struct}`} className="border-t border-[#223142]/60 hover:bg-[#172331]/40">
                  <td className="px-3 py-1.5 text-[#E5EDF7]">
                    <span className="font-mono"><span className={r.dir === "Long" ? "text-[#22C55E]" : "text-[#EF4444]"}>{r.dir}</span> · <span className={r.struct === "BOS" ? "text-[#3B82F6]" : "text-[#A855F7]"}>{r.struct}</span></span>
                  </td>
                  <td className={`px-2 py-1.5 font-mono text-right ${r.netR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(r.netR, 2)}</td>
                  <td className="px-2 py-1.5 font-mono text-right text-[#E5EDF7]">{r.trades}</td>
                  <td className="px-2 py-1.5 font-mono text-right text-[#E5EDF7]">{r.wr}%</td>
                  <td className="px-2 py-1.5 font-mono text-right text-[#E5EDF7]">{r.pf}</td>
                  <td className="px-3 py-1.5 font-mono text-right text-[#EF4444]">{r.dd}R</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-[#64748B] font-mono">Toggle BOS / CHoCH above to include or exclude from preview.</p>
      </div>
    </div>
  );
}

function Legend2({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[#94A3B8]">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      {label}
    </span>
  );
}
