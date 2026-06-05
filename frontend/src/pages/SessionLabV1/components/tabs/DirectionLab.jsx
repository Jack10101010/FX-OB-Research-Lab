import React from "react";
import { SectionLabel, fmtR } from "../primitives";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";
import { DIRECTION_LAB } from "../../mockData";

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
    <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
      <div className="flex items-center mb-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
          />
          <span className="font-display text-sm font-bold uppercase tracking-wider" style={{ color }}>
            {side}
          </span>
        </div>
      </div>
      <div className="font-display text-4xl font-bold tabular" style={{ color: positive ? "#22C55E" : "#EF4444" }}>
        {fmtR(data.netR, 2)}
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3 mb-4 text-xs">
        <Cell label="Trades" value={data.trades} />
        <Cell label="WR" value={`${data.wr}%`} />
        <Cell label="PF" value={data.pf ?? "∞"} />
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
  const cls = tone === "neg" ? "text-[#EF4444]" : "text-[hsl(var(--text))]";
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`font-num tabular text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, suffix, pos }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-muted-lab uppercase tracking-wider text-[9px] font-num">{label}</span>
      <span className="text-[hsl(var(--text))] font-num truncate">{value}</span>
      {suffix && (
        <span className={`font-num ${pos ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{suffix}</span>
      )}
    </li>
  );
}

function ComparisonBar({ label, longVal, shortVal, format = (v) => v }) {
  const safeL = typeof longVal  === "number" && isFinite(longVal)  ? longVal  : 0;
  const safeS = typeof shortVal === "number" && isFinite(shortVal) ? shortVal : 0;
  const total = Math.abs(safeL) + Math.abs(safeS) || 1;
  const longPct  = (Math.abs(safeL) / total) * 100;
  const shortPct = 100 - longPct;
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5">
      <span className="text-[10px] text-muted-lab uppercase tracking-wider font-num">{label}</span>
      <div className="flex items-center gap-3">
        <span className="w-16 text-right font-num tabular text-xs text-[#22C55E]">{format(safeL)}</span>
        <div className="flex-1 h-4 flex items-center bg-[hsl(var(--panel-2))] rounded-sm overflow-hidden">
          <div className="h-full bg-[#22C55E]/70" style={{ width: `${longPct}%` }} />
          <div className="h-full bg-[#EF4444]/70" style={{ width: `${shortPct}%` }} />
        </div>
        <span className="w-16 font-num tabular text-xs text-[#EF4444]">{format(safeS)}</span>
      </div>
    </div>
  );
}

export default function DirectionLab({ directionData }) {
  const L = directionData?.longs  ?? DIRECTION_LAB.longs;
  const S = directionData?.shorts ?? DIRECTION_LAB.shorts;

  return (
    <div className="space-y-5">
      <p className="text-xs text-[hsl(var(--text-2))]">Deep dive into Long vs Short performance in this session.</p>

      {/* Long + Short cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DirectionCard side="LONGS" data={L} color="#22C55E" />
        <DirectionCard side="SHORTS" data={S} color="#EF4444" />
      </div>

      {/* Comparison */}
      <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
        <SectionLabel className="mb-3">Long vs Short Comparison</SectionLabel>
        <ComparisonBar label="Net R"          longVal={L.netR}          shortVal={S.netR}          format={(v) => fmtR(v, 2)} />
        <ComparisonBar label="Win Rate"       longVal={L.wr}            shortVal={S.wr}            format={(v) => `${v}%`} />
        <ComparisonBar label="Profit Factor"  longVal={L.pf ?? 0}       shortVal={S.pf ?? 0}       format={(v) => v === 0 ? "—" : v} />
        <ComparisonBar label="Expectancy (R)" longVal={L.expectancy ?? 0} shortVal={S.expectancy ?? 0} format={(v) => fmtR(v, 2)} />
        <ComparisonBar label="Max Drawdown"   longVal={L.dd}            shortVal={S.dd}            format={(v) => `${v}R`} />
        <ComparisonBar label="Trades"         longVal={L.trades}        shortVal={S.trades} />
        <p className="mt-3 text-[10px] text-muted-lab font-num">Direction breakdown updates when a new session is selected.</p>
      </div>
    </div>
  );
}
