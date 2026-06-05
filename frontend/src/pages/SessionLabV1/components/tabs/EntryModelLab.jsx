import React from "react";
import { SectionLabel, fmtR } from "../primitives";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell, LabelList,
} from "recharts";
import { ENTRY_MODELS } from "../../mockData";

const tooltipStyle = {
  backgroundColor: "#121C29",
  border: "1px solid #223142",
  borderRadius: 6,
  fontSize: 11,
  color: "#E5EDF7",
  padding: "6px 10px",
};

export default function EntryModelLab({ entryModelData }) {
  const models = entryModelData?.entryModels?.length > 0
    ? entryModelData.entryModels
    : ENTRY_MODELS;

  // for chart
  const chartData = models.map((m) => ({
    name: m.name.replace("Penetration", "Pen").replace("Triggered Edge ", "TE ").replace("Baseline", "Base"),
    long: m.long.netR,
    short: m.short.netR,
  }));

  const bestLong   = models.length > 0 ? [...models].sort((a, b) => b.long.netR  - a.long.netR)[0]  : null;
  const worstLong  = models.length > 0 ? [...models].sort((a, b) => a.long.netR  - b.long.netR)[0]  : null;
  const bestShort  = models.length > 0 ? [...models].sort((a, b) => b.short.netR - a.short.netR)[0] : null;
  const worstShort = models.length > 0 ? [...models].sort((a, b) => a.short.netR - b.short.netR)[0] : null;

  if (models.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-lab font-num">
        No entry model data available.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-[hsl(var(--text-2))]">Compare all entry models. Enable different models for Longs vs Shorts.</p>

      {/* Performance table */}
      <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
        <SectionLabel className="mb-3">Entry Model Performance (This Session)</SectionLabel>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-lab uppercase tracking-wider text-[9px] border-b border-[hsl(var(--border-soft))]">
                <th className="text-left px-3 py-2 font-medium" rowSpan={2}>Entry Model</th>
                <th className="text-center px-2 py-1 font-medium border-l border-[hsl(var(--border-soft))]" colSpan={5}>
                  <span className="text-[#22C55E]">LONGS</span>
                </th>
                <th className="text-center px-2 py-1 font-medium border-l border-[hsl(var(--border-soft))]" colSpan={5}>
                  <span className="text-[#EF4444]">SHORTS</span>
                </th>
              </tr>
              <tr className="text-muted-lab uppercase tracking-wider text-[9px] border-b border-[hsl(var(--border-soft))]">
                <th className="text-right px-1 py-1.5 font-medium border-l border-[hsl(var(--border-soft))]">Trades</th>
                <th className="text-right px-1 py-1.5 font-medium">Net R</th>
                <th className="text-right px-1 py-1.5 font-medium">WR</th>
                <th className="text-right px-1 py-1.5 font-medium">PF</th>
                <th className="text-right px-1 py-1.5 font-medium">Exp.</th>
                <th className="text-right px-1 py-1.5 font-medium border-l border-[hsl(var(--border-soft))]">Trades</th>
                <th className="text-right px-1 py-1.5 font-medium">Net R</th>
                <th className="text-right px-1 py-1.5 font-medium">WR</th>
                <th className="text-right px-1 py-1.5 font-medium">PF</th>
                <th className="text-right px-1 py-1.5 font-medium">Exp.</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.name} className="border-b border-[hsl(var(--border-soft))]/40 hover:bg-[hsl(var(--panel-2))]/40">
                  <td className="px-3 py-1.5 text-[hsl(var(--text))] font-num">{m.name}</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text-2))] border-l border-[hsl(var(--border-soft))]/40">{m.long.trades}</td>
                  <td className={`px-1 py-1.5 font-num text-right ${m.long.netR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(m.long.netR, 2)}</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text))]">{m.long.wr}%</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text))]">{m.long.pf ?? "∞"}</td>
                  <td className={`px-1 py-1.5 font-num text-right ${m.long.exp >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(m.long.exp, 2)}</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text-2))] border-l border-[hsl(var(--border-soft))]/40">{m.short.trades}</td>
                  <td className={`px-1 py-1.5 font-num text-right ${m.short.netR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(m.short.netR, 2)}</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text))]">{m.short.wr}%</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text))]">{m.short.pf ?? "∞"}</td>
                  <td className={`px-1 py-1.5 font-num text-right ${m.short.exp >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(m.short.exp, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar chart + best/worst */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <div className="flex items-baseline justify-between mb-3">
            <SectionLabel>Net R by Entry Model</SectionLabel>
            <div className="flex items-center gap-3 text-[10px] font-num uppercase tracking-wider">
              <Legend color="#22C55E" label="Longs" />
              <Legend color="#EF4444" label="Shorts" />
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#223142" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#223142" }} tickLine={false} angle={-12} dy={4} />
                <YAxis tick={{ fill: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="long" fill="#22C55E" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                <Bar dataKey="short" fill="#EF4444" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <SectionLabel className="mb-3">Best / Worst Snapshot</SectionLabel>
          <div className="overflow-hidden rounded-md border border-[hsl(var(--border-soft))]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[hsl(var(--panel-2))] text-muted-lab uppercase tracking-wider text-[9px]">
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-left px-2 py-2 font-medium">Best (Long)</th>
                  <th className="text-left px-2 py-2 font-medium">Worst (Long)</th>
                  <th className="text-left px-2 py-2 font-medium">Best (Short)</th>
                  <th className="text-left px-3 py-2 font-medium">Worst (Short)</th>
                </tr>
              </thead>
              <tbody>
                <SnapshotRow label="Entry Model" bl={bestLong?.name ?? "—"} wl={worstLong?.name ?? "—"} bs={bestShort?.name ?? "—"} ws={worstShort?.name ?? "—"} />
                <SnapshotRow label="Net R" bl={fmtR(bestLong?.long?.netR ?? 0, 2)} wl={fmtR(worstLong?.long?.netR ?? 0, 2)} bs={fmtR(bestShort?.short?.netR ?? 0, 2)} ws={fmtR(worstShort?.short?.netR ?? 0, 2)} mono tonal />
                <SnapshotRow label="PF" bl={bestLong?.long?.pf ?? "—"} wl={worstLong?.long?.pf ?? "—"} bs={bestShort?.short?.pf ?? "—"} ws={worstShort?.short?.pf ?? "—"} mono />
                <SnapshotRow label="WR" bl={bestLong ? `${bestLong.long.wr}%` : "—"} wl={worstLong ? `${worstLong.long.wr}%` : "—"} bs={bestShort ? `${bestShort.short.wr}%` : "—"} ws={worstShort ? `${worstShort.short.wr}%` : "—"} mono />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[hsl(var(--text-2))]">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      {label}
    </span>
  );
}

function SnapshotRow({ label, bl, wl, bs, ws, mono, tonal }) {
  const toneOf = (v) => {
    if (!tonal) return "text-[hsl(var(--text))]";
    const num = parseFloat(v);
    return num >= 0 ? "text-[#22C55E]" : "text-[#EF4444]";
  };
  return (
    <tr className="border-t border-[hsl(var(--border-soft))]/40">
      <td className="px-3 py-1.5 text-[hsl(var(--text-2))] text-[10px] uppercase tracking-wider font-num">{label}</td>
      <td className={`px-2 py-1.5 ${mono ? "font-num" : ""} ${toneOf(bl)}`}>{bl}</td>
      <td className={`px-2 py-1.5 ${mono ? "font-num" : ""} ${toneOf(wl)}`}>{wl}</td>
      <td className={`px-2 py-1.5 ${mono ? "font-num" : ""} ${toneOf(bs)}`}>{bs}</td>
      <td className={`px-3 py-1.5 ${mono ? "font-num" : ""} ${toneOf(ws)}`}>{ws}</td>
    </tr>
  );
}
