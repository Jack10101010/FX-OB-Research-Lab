import React, { useState } from "react";
import { SectionLabel, fmtR } from "../primitives";
import {
  BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { WL_SEQUENCE, STREAK_DISTRIBUTION, STREAK_SUMMARY, SAMPLE_TRADE_HOVER } from "../../mockData";
import { AlertTriangle } from "lucide-react";

const tooltipStyle = {
  backgroundColor: "#121C29",
  border: "1px solid #223142",
  borderRadius: 6,
  fontSize: 11,
  color: "#E5EDF7",
  padding: "6px 10px",
};

export default function StreaksLab() {
  const [filter, setFilter] = useState("all");
  const [hoverIndex, setHoverIndex] = useState(11); // pre-show tooltip in middle

  const filteredSeq = WL_SEQUENCE.map((v, i) => ({ v, i })).filter((d) => {
    if (filter === "wins") return d.v === "W";
    if (filter === "losses") return d.v === "L";
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#94A3B8]">Winning / losing streak analysis and sequence insights.</p>
        <div className="inline-flex items-center gap-1 rounded-lg border border-[#223142] bg-[#0D1520] p-1">
          {[
            { v: "all", label: "All" },
            { v: "wins", label: "Wins" },
            { v: "losses", label: "Losses" },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => setFilter(o.v)}
              data-testid={`streak-filter-${o.v}`}
              className={[
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                filter === o.v ? "bg-[#22D3EE]/15 text-[#22D3EE]" : "text-[#94A3B8] hover:text-[#E5EDF7]",
              ].join(" ")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sequence strip */}
      <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
        <SectionLabel className="mb-3">W / L Sequence Strip</SectionLabel>
        <div className="relative overflow-x-auto pb-12">
          <div className="flex items-center gap-1.5 min-w-max">
            {filteredSeq.map(({ v, i }) => {
              const isWin = v === "W";
              const isHover = hoverIndex === i;
              return (
                <button
                  key={i}
                  onMouseEnter={() => setHoverIndex(i)}
                  onFocus={() => setHoverIndex(i)}
                  className={[
                    "h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold font-mono transition-all relative",
                    isWin
                      ? "bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/40"
                      : "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/40",
                    isHover ? "scale-110 shadow-[0_0_12px_rgba(34,211,238,0.4)] border-[#22D3EE]" : "",
                  ].join(" ")}
                >
                  {v}
                  {isHover && (
                    <div className="absolute left-1/2 top-full mt-3 -translate-x-1/2 z-10 w-48 rounded-md border border-[#22D3EE]/40 bg-[#121C29] p-3 text-left shadow-2xl">
                      <div className="text-[11px] font-bold text-[#E5EDF7]">{SAMPLE_TRADE_HOVER.id}</div>
                      <div className="text-[10px] text-[#64748B] font-mono mb-2">{SAMPLE_TRADE_HOVER.time}</div>
                      <ul className="space-y-1 text-[10px] font-mono">
                        <TR k="Session" v={SAMPLE_TRADE_HOVER.session} />
                        <TR k="Direction" v={SAMPLE_TRADE_HOVER.direction} />
                        <TR k="Structure" v={SAMPLE_TRADE_HOVER.structure} />
                        <TR k="Entry" v={SAMPLE_TRADE_HOVER.entry} />
                        <TR k="Trigger Delay" v={SAMPLE_TRADE_HOVER.delay} />
                        <TR k="Result" v={fmtR(SAMPLE_TRADE_HOVER.result, 2)} tone={SAMPLE_TRADE_HOVER.result < 0 ? "neg" : "pos"} />
                        <TR k="Exit" v={SAMPLE_TRADE_HOVER.exit} />
                      </ul>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] text-[#64748B] font-mono">
            Hover over any W/L dot to see trade details.
          </div>
        </div>
      </div>

      {/* Streak summary + Runs test + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Summary */}
        <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
          <SectionLabel className="mb-3">Streak Summary</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Longest Win Streak" value={STREAK_SUMMARY.longestWin} sub={`Net R +${STREAK_SUMMARY.netRWin}R`} tone="pos" />
            <Stat label="Longest Loss Streak" value={STREAK_SUMMARY.longestLoss} sub={`Net R ${STREAK_SUMMARY.netRLoss}R`} tone="neg" />
            <Stat label="Avg Win Streak" value={STREAK_SUMMARY.avgWin} tone="pos" />
            <Stat label="Max Consecutive Loss R" value={`${STREAK_SUMMARY.maxLossR}R`} tone="neg" />
          </div>
        </div>

        {/* Runs test */}
        <div className="rounded-lg border border-[#F59E0B]/30 bg-gradient-to-b from-[#231804] to-[#0D1520] p-4">
          <SectionLabel className="mb-3">Runs Test (Randomness)</SectionLabel>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Stat label="Z Score" value={STREAK_SUMMARY.zScore} tone="amber" />
            <Stat label="p-value" value={STREAK_SUMMARY.pValue} />
          </div>
          <div className="rounded-md border border-[#F59E0B]/30 bg-[#F59E0B]/8 px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-[#F59E0B]" />
            <div>
              <div className="font-display text-sm font-bold text-[#F59E0B] uppercase tracking-wider">{STREAK_SUMMARY.verdict}</div>
              <div className="text-[10px] text-[#94A3B8] font-mono">Trade outcomes show negative dependency.</div>
            </div>
          </div>
        </div>

        {/* Distribution */}
        <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
          <div className="flex items-baseline justify-between mb-3">
            <SectionLabel>Streak Distribution</SectionLabel>
            <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider">
              <Legend2 color="#22C55E" label="Wins" />
              <Legend2 color="#EF4444" label="Losses" />
            </div>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={STREAK_DISTRIBUTION} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#223142" vertical={false} />
                <XAxis dataKey="len" tick={{ fill: "#64748B", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#223142" }} tickLine={false} />
                <YAxis tick={{ fill: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="wins" fill="#22C55E" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                <Bar dataKey="losses" fill="#EF4444" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[10px] text-[#64748B] font-mono mt-1 text-center">Streak Length</div>
        </div>
      </div>
    </div>
  );
}

function TR({ k, v, tone }) {
  const cls = tone === "pos" ? "text-[#22C55E]" : tone === "neg" ? "text-[#EF4444]" : "text-[#E5EDF7]";
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-[#64748B]">{k}</span>
      <span className={cls}>{v}</span>
    </li>
  );
}
function Stat({ label, value, sub, tone }) {
  const cls = tone === "pos" ? "text-[#22C55E]" : tone === "neg" ? "text-[#EF4444]" : tone === "amber" ? "text-[#F59E0B]" : "text-[#E5EDF7]";
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`font-mono tabular text-2xl font-bold ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#64748B] font-mono mt-0.5">{sub}</div>}
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
