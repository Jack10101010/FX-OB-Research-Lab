import React, { useState } from "react";
import { SectionLabel, Metric, ToggleChip, fmtR } from "../primitives";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";
import { DIRECTION_LAB, ENTRY_MODEL_OPTIONS } from "../../mockData";
import { ChevronDown } from "lucide-react";

const tooltipStyle = {
  backgroundColor: "#121C29",
  border: "1px solid #223142",
  borderRadius: 6,
  fontSize: 11,
  color: "#E5EDF7",
  padding: "6px 10px",
};

function DirectionCard({ side, data, color }) {
  const positive = data.netR >= 0;
  return (
    <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
          />
          <span className="font-display text-sm font-bold uppercase tracking-wider" style={{ color }}>
            {side}
          </span>
        </div>
        <button className="text-[10px] text-[#22D3EE] hover:text-[#67E8F9] font-mono uppercase tracking-wider">
          Include
        </button>
      </div>
      <div className="font-display text-4xl font-bold tabular" style={{ color: positive ? "#22C55E" : "#EF4444" }}>
        {fmtR(data.netR, 2)}
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3 mb-4 text-xs">
        <Cell label="Trades" value={data.trades} />
        <Cell label="WR" value={`${data.wr}%`} />
        <Cell label="PF" value={data.pf} />
        <Cell label="Max DD" value={`${data.dd}R`} tone="neg" />
      </div>
      <ul className="space-y-1 text-[11px]">
        <Row label="Best Structure" value={data.bestStructure.label} suffix={fmtR(data.bestStructure.value, 2)} pos={data.bestStructure.value >= 0} />
        <Row label="Worst Structure" value={data.worstStructure.label} suffix={fmtR(data.worstStructure.value, 2)} pos={data.worstStructure.value >= 0} />
        <Row label="Best Entry Model" value={data.bestEntry.label} suffix={fmtR(data.bestEntry.value, 2)} pos={data.bestEntry.value >= 0} />
        <Row label="Best Trigger Delay" value={data.bestDelay.label} suffix={fmtR(data.bestDelay.value, 2)} pos={data.bestDelay.value >= 0} />
        <Row label="Fast Stopouts (<30m)" value={`${data.fastStopouts.count} (${data.fastStopouts.pct}%)`} />
      </ul>
      <div className="mt-4">
        <div className="label-eyebrow mb-2">Equity Curve (R)</div>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.equity} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
              <defs>
                <linearGradient id={`grad-${side}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={positive ? "#22C55E" : "#EF4444"} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={positive ? "#22C55E" : "#EF4444"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#223142" vertical={false} />
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="v"
                stroke={positive ? "#22C55E" : "#EF4444"}
                strokeWidth={2}
                fill={`url(#grad-${side})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, tone }) {
  const cls = tone === "neg" ? "text-[#EF4444]" : "text-[#E5EDF7]";
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`font-mono tabular text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, suffix, pos }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-[#64748B] uppercase tracking-wider text-[9px] font-mono">{label}</span>
      <span className="text-[#E5EDF7] font-mono truncate">{value}</span>
      {suffix && (
        <span className={`font-mono ${pos ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{suffix}</span>
      )}
    </li>
  );
}

function ModelSelect({ label, value, onChange, testId }) {
  return (
    <label className="flex flex-col gap-1 flex-1 min-w-[160px]">
      <span className="label-eyebrow">{label}</span>
      <div className="relative">
        <select
          data-testid={testId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-[#223142] bg-[#172331] px-3 py-2 pr-8 text-xs text-[#E5EDF7] font-mono focus:outline-none focus:border-[#22D3EE]"
        >
          {ENTRY_MODEL_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
      </div>
    </label>
  );
}

function ComparisonBar({ label, longVal, shortVal, format = (v) => v }) {
  const total = Math.abs(longVal) + Math.abs(shortVal) || 1;
  const longPct = (Math.abs(longVal) / total) * 100;
  const shortPct = 100 - longPct;
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5">
      <span className="text-[10px] text-[#64748B] uppercase tracking-wider font-mono">{label}</span>
      <div className="flex items-center gap-3">
        <span className="w-16 text-right font-mono tabular text-xs text-[#22C55E]">{format(longVal)}</span>
        <div className="flex-1 h-4 flex items-center bg-[#172331] rounded-sm overflow-hidden">
          <div className="h-full bg-[#22C55E]/70" style={{ width: `${longPct}%` }} />
          <div className="h-full bg-[#EF4444]/70" style={{ width: `${shortPct}%` }} />
        </div>
        <span className="w-16 font-mono tabular text-xs text-[#EF4444]">{format(shortVal)}</span>
      </div>
    </div>
  );
}

export default function DirectionLab() {
  const [longModel, setLongModel] = useState("Triggered Edge Delay +2");
  const [shortModel, setShortModel] = useState("Triggered Edge Next");
  const [longsOn, setLongsOn] = useState(true);
  const [shortsOn, setShortsOn] = useState(true);

  const L = DIRECTION_LAB.longs;
  const S = DIRECTION_LAB.shorts;

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#94A3B8]">Deep dive into Long vs Short performance in this session.</p>
        <div className="flex items-center gap-3">
          <span className="label-eyebrow">Include in Preview</span>
          <ToggleChip label="LONGS" active={longsOn} onClick={() => setLongsOn((v) => !v)} color="green" testId="dl-toggle-longs" />
          <ToggleChip label="SHORTS" active={shortsOn} onClick={() => setShortsOn((v) => !v)} color="red" testId="dl-toggle-shorts" />
        </div>
      </div>

      {/* Per-direction entry model selectors */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-[#22D3EE]/20 bg-[#0F2A33]/40 p-4">
        <div className="flex-1">
          <SectionLabel hint="Choose different models for longs vs shorts">
            Per-Direction Entry Model
          </SectionLabel>
        </div>
        <ModelSelect label="Longs Use" value={longModel} onChange={setLongModel} testId="dl-longs-model" />
        <ModelSelect label="Shorts Use" value={shortModel} onChange={setShortModel} testId="dl-shorts-model" />
      </div>

      {/* Long + Short cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DirectionCard side="LONGS" data={L} color="#22C55E" />
        <DirectionCard side="SHORTS" data={S} color="#EF4444" />
      </div>

      {/* Comparison */}
      <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
        <SectionLabel className="mb-3">Long vs Short Comparison</SectionLabel>
        <ComparisonBar label="Net R"          longVal={L.netR}   shortVal={S.netR}   format={(v) => fmtR(v, 2)} />
        <ComparisonBar label="Win Rate"       longVal={L.wr}     shortVal={S.wr}     format={(v) => `${v}%`} />
        <ComparisonBar label="Profit Factor"  longVal={L.pf}     shortVal={S.pf}     format={(v) => v} />
        <ComparisonBar label="Expectancy (R)" longVal={0.69}     shortVal={-1.15}    format={(v) => fmtR(v, 2)} />
        <ComparisonBar label="Max Drawdown"   longVal={L.dd}     shortVal={S.dd}     format={(v) => `${v}R`} />
        <ComparisonBar label="Trades"         longVal={L.trades} shortVal={S.trades} />
        <p className="mt-3 text-[10px] text-[#64748B] font-mono">Results update automatically when you change filters above.</p>
      </div>
    </div>
  );
}
