import React, { useState } from "react";
import { SectionLabel, ToggleChip, fmtR } from "../primitives";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Cell, LabelList,
} from "recharts";
import { ENTRY_MODELS, ENTRY_MODEL_OPTIONS } from "../../mockData";
import { ChevronDown, Check } from "lucide-react";

const tooltipStyle = {
  backgroundColor: "#121C29",
  border: "1px solid #223142",
  borderRadius: 6,
  fontSize: 11,
  color: "#E5EDF7",
  padding: "6px 10px",
};

function ModelSelect({ label, value, onChange, testId }) {
  return (
    <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
      <span className="label-eyebrow">{label}</span>
      <div className="relative">
        <select
          data-testid={testId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] px-3 py-2 pr-8 text-xs text-[hsl(var(--text))] font-num focus:outline-none focus:border-[hsl(var(--accent-primary))]"
        >
          {ENTRY_MODEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--text-2))] pointer-events-none" />
      </div>
    </label>
  );
}

function CheckBox({ checked, color, onChange }) {
  return (
    <button
      onClick={onChange}
      className={[
        "h-4 w-4 rounded border flex items-center justify-center transition-all",
        checked ? "" : "border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))]",
      ].join(" ")}
      style={checked ? { backgroundColor: `${color}1A`, borderColor: color } : {}}
    >
      {checked && <Check size={11} style={{ color }} strokeWidth={3} />}
    </button>
  );
}

export default function EntryModelLab() {
  const [longModel, setLongModel] = useState("Triggered Edge Delay +2");
  const [shortModel, setShortModel] = useState("Triggered Edge Next");
  const [longsOn, setLongsOn] = useState(true);
  const [shortsOn, setShortsOn] = useState(true);
  const [includes, setIncludes] = useState(
    ENTRY_MODELS.reduce((acc, m) => ({ ...acc, [m.name]: { long: true, short: true } }), {})
  );

  // for chart
  const chartData = ENTRY_MODELS.map((m) => ({
    name: m.name.replace("Penetration", "Pen").replace("Triggered Edge ", "TE ").replace("Baseline", "Base"),
    long: m.long.netR,
    short: m.short.netR,
  }));

  const bestLong = [...ENTRY_MODELS].sort((a, b) => b.long.netR - a.long.netR)[0];
  const worstLong = [...ENTRY_MODELS].sort((a, b) => a.long.netR - b.long.netR)[0];
  const bestShort = [...ENTRY_MODELS].sort((a, b) => b.short.netR - a.short.netR)[0];
  const worstShort = [...ENTRY_MODELS].sort((a, b) => a.short.netR - b.short.netR)[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[hsl(var(--text-2))]">Compare all entry models. Enable different models for Longs vs Shorts.</p>
        <div className="flex items-center gap-3">
          <span className="label-eyebrow">Include in Preview</span>
          <ToggleChip label="LONGS" active={longsOn} onClick={() => setLongsOn((v) => !v)} color="green" testId="el-longs-toggle" />
          <ToggleChip label="SHORTS" active={shortsOn} onClick={() => setShortsOn((v) => !v)} color="red" testId="el-shorts-toggle" />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded border border-[hsl(var(--accent-primary))]/20 bg-[hsl(var(--accent-primary)/0.06)] p-4">
        <ModelSelect label="Longs Use" value={longModel} onChange={setLongModel} testId="el-long-model" />
        <ModelSelect label="Shorts Use" value={shortModel} onChange={setShortModel} testId="el-short-model" />
      </div>

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
                <th className="text-center px-2 py-1 font-medium border-l border-[hsl(var(--border-soft))]" colSpan={2} rowSpan={2}>Include</th>
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
              {ENTRY_MODELS.map((m) => (
                <tr key={m.name} className="border-b border-[hsl(var(--border-soft))]/40 hover:bg-[hsl(var(--panel-2))]/40">
                  <td className="px-3 py-1.5 text-[hsl(var(--text))] font-num">{m.name}</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text-2))] border-l border-[hsl(var(--border-soft))]/40">{m.long.trades}</td>
                  <td className={`px-1 py-1.5 font-num text-right ${m.long.netR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(m.long.netR, 2)}</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text))]">{m.long.wr}%</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text))]">{m.long.pf}</td>
                  <td className={`px-1 py-1.5 font-num text-right ${m.long.exp >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(m.long.exp, 2)}</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text-2))] border-l border-[hsl(var(--border-soft))]/40">{m.short.trades}</td>
                  <td className={`px-1 py-1.5 font-num text-right ${m.short.netR >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(m.short.netR, 2)}</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text))]">{m.short.wr}%</td>
                  <td className="px-1 py-1.5 font-num text-right text-[hsl(var(--text))]">{m.short.pf}</td>
                  <td className={`px-1 py-1.5 font-num text-right ${m.short.exp >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{fmtR(m.short.exp, 2)}</td>
                  <td className="px-2 py-1.5 text-center border-l border-[hsl(var(--border-soft))]/40">
                    <CheckBox
                      checked={includes[m.name]?.long}
                      color="#22C55E"
                      onChange={() =>
                        setIncludes((s) => ({ ...s, [m.name]: { ...s[m.name], long: !s[m.name].long } }))
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <CheckBox
                      checked={includes[m.name]?.short}
                      color="#EF4444"
                      onChange={() =>
                        setIncludes((s) => ({ ...s, [m.name]: { ...s[m.name], short: !s[m.name].short } }))
                      }
                    />
                  </td>
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
                <SnapshotRow label="Entry Model" bl={bestLong.name} wl={worstLong.name} bs={bestShort.name} ws={worstShort.name} />
                <SnapshotRow label="Net R" bl={fmtR(bestLong.long.netR, 2)} wl={fmtR(worstLong.long.netR, 2)} bs={fmtR(bestShort.short.netR, 2)} ws={fmtR(worstShort.short.netR, 2)} mono tonal />
                <SnapshotRow label="PF" bl={bestLong.long.pf} wl={worstLong.long.pf} bs={bestShort.short.pf} ws={worstShort.short.pf} mono />
                <SnapshotRow label="WR" bl={`${bestLong.long.wr}%`} wl={`${worstLong.long.wr}%`} bs={`${bestShort.short.wr}%`} ws={`${worstShort.short.wr}%`} mono />
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
