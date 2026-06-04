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

export default function StreaksLab({ streaksData = null }) {
  const [filter, setFilter] = useState("all");
  const [hoverIndex, setHoverIndex] = useState(null);

  // ── Data resolution ────────────────────────────────────────────────────────
  const wlSeq =
    streaksData?.wlSequence ??
    WL_SEQUENCE.map((v, idx) => ({
      id:        `Mock #${idx + 1}`,
      result:    v === "W" ? 1 : -1,
      mockValue: v,
    }));

  const summary  = streaksData?.streakSummary  ?? STREAK_SUMMARY;
  const distData = streaksData?.streakDistribution ?? STREAK_DISTRIBUTION;

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filteredSeq = wlSeq
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => {
      if (filter === "wins")   return item.result > 0;
      if (filter === "losses") return item.result < 0;
      return true;
    });

  // ── Empty state ────────────────────────────────────────────────────────────
  if (wlSeq.length === 0 || summary === null) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-lab font-num">
        No decided win/loss sequence available for this session.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[hsl(var(--text-2))]">Winning / losing streak analysis and sequence insights.</p>
        <div className="inline-flex items-center gap-1 rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-1">
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
                filter === o.v ? "bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
              ].join(" ")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sequence strip */}
      <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
        <SectionLabel className="mb-3">W / L Sequence Strip</SectionLabel>
        <div className="relative overflow-x-auto pb-12">
          <div className="flex items-center gap-1.5 min-w-max">
            {filteredSeq.map(({ item, i }) => {
              const isWin  = item.result > 0;
              const isLoss = item.result < 0;
              const label  = isWin ? "W" : isLoss ? "L" : "–";
              const isHover = hoverIndex === i;

              return (
                <button
                  key={i}
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex(null)}
                  onFocus={() => setHoverIndex(i)}
                  onBlur={() => setHoverIndex(null)}
                  className={[
                    "h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold font-num transition-all relative shrink-0",
                    isWin
                      ? "bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/40"
                      : isLoss
                      ? "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/40"
                      : "bg-[hsl(var(--panel-2))] text-muted-lab border border-[hsl(var(--border-soft))]",
                    isHover ? "scale-110 shadow-[0_0_12px_rgba(34,211,238,0.4)] border-[hsl(var(--accent-primary))]" : "",
                  ].join(" ")}
                >
                  {label}
                  {isHover && (
                    <TradeTooltip item={item} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] text-muted-lab font-num">
            Hover over any W/L dot to see trade details.
          </div>
        </div>
      </div>

      {/* Streak summary + Runs test + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Summary */}
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <SectionLabel className="mb-3">Streak Summary</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Longest Win Streak"    value={summary.longestWin}  sub={`Net R +${summary.netRWin}R`}  tone="pos" />
            <Stat label="Longest Loss Streak"   value={summary.longestLoss} sub={`Net R ${summary.netRLoss}R`}  tone="neg" />
            <Stat label="Avg Win Streak"         value={summary.avgWin}      tone="pos" />
            <Stat label="Max Consecutive Loss R" value={`${summary.maxLossR}R`} tone="neg" />
          </div>
        </div>

        {/* Runs test */}
        <div className="rounded border border-[#F59E0B]/30 bg-gradient-to-b from-[#231804] to-[#0D1520] p-4">
          <SectionLabel className="mb-3">Runs Test (Randomness)</SectionLabel>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Stat label="Z Score" value={summary.zScore} tone="amber" />
            <Stat label="p-value" value={summary.pValue} />
          </div>
          <div className="rounded-md border border-[#F59E0B]/30 bg-[#F59E0B]/8 px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-[#F59E0B]" />
            <div>
              <div className="font-display text-sm font-bold text-[#F59E0B] uppercase tracking-wider">{summary.verdict}</div>
              <div className="text-[10px] text-[hsl(var(--text-2))] font-num">
                {summary.verdict === "NOT RANDOM"
                  ? "Trade outcomes show non-random dependency."
                  : summary.verdict === "INSUFFICIENT"
                  ? "Too few trades to run test."
                  : "Trade outcomes appear random."}
              </div>
            </div>
          </div>
        </div>

        {/* Distribution */}
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <div className="flex items-baseline justify-between mb-3">
            <SectionLabel>Streak Distribution</SectionLabel>
            <div className="flex items-center gap-3 text-[10px] font-num uppercase tracking-wider">
              <Legend2 color="#22C55E" label="Wins" />
              <Legend2 color="#EF4444" label="Losses" />
            </div>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#223142" vertical={false} />
                <XAxis dataKey="len" tick={{ fill: "#64748B", fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#223142" }} tickLine={false} />
                <YAxis tick={{ fill: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="wins"   fill="#22C55E" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                <Bar dataKey="losses" fill="#EF4444" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[10px] text-muted-lab font-num mt-1 text-center">Streak Length</div>
        </div>
      </div>
    </div>
  );
}

/** Tooltip rendered on hover over a sequence dot. */
function TradeTooltip({ item }) {
  // Mock fallback: if item has mockValue, use SAMPLE_TRADE_HOVER shape
  const isMock = item.mockValue !== undefined;
  const hover  = isMock ? SAMPLE_TRADE_HOVER : null;

  return (
    <div className="absolute left-1/2 top-full mt-3 -translate-x-1/2 z-10 w-52 rounded-md border border-[hsl(var(--accent-primary))]/40 bg-[hsl(var(--panel-2))] p-3 text-left shadow-2xl">
      <div className="text-[11px] font-bold text-[hsl(var(--text))]">
        {isMock ? hover.id : item.id}
      </div>
      <div className="text-[10px] text-muted-lab font-num mb-2">
        {isMock ? hover.time : item.time}
      </div>
      <ul className="space-y-1 text-[10px] font-num">
        <TR k="Session"       v={isMock ? hover.session   : item.session}    />
        <TR k="Direction"     v={isMock ? hover.direction : item.direction}  />
        <TR k="Structure"     v={isMock ? hover.structure : item.structure}  />
        <TR k="Entry"         v={isMock ? hover.entry     : item.entry}      />
        <TR k="Trigger Delay" v={isMock ? hover.delay     : item.delay}      />
        <TR
          k="Result"
          v={fmtR(isMock ? hover.result : item.result, 2)}
          tone={(isMock ? hover.result : item.result) < 0 ? "neg" : "pos"}
        />
        <TR k="Exit" v={isMock ? hover.exit : item.exitLabel} />
      </ul>
    </div>
  );
}

function TR({ k, v, tone }) {
  const cls = tone === "pos" ? "text-[#22C55E]" : tone === "neg" ? "text-[#EF4444]" : "text-[hsl(var(--text))]";
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-muted-lab">{k}</span>
      <span className={cls}>{v}</span>
    </li>
  );
}

function Stat({ label, value, sub, tone }) {
  const cls = tone === "pos" ? "text-[#22C55E]" : tone === "neg" ? "text-[#EF4444]" : tone === "amber" ? "text-[#F59E0B]" : "text-[hsl(var(--text))]";
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className={`font-num tabular text-2xl font-bold ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-lab font-num mt-0.5">{sub}</div>}
    </div>
  );
}

function Legend2({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[hsl(var(--text-2))]">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      {label}
    </span>
  );
}
