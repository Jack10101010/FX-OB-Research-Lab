import React from "react";
import { SectionLabel, Sparkline, fmtR } from "../primitives";
import { FAILURE_CARDS, CANCELLATION_REASONS, WORST_CLUSTER } from "../../mockData";
import { AlertTriangle, ArrowRight } from "lucide-react";

function FailureCard({ card }) {
  return (
    <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-3.5">
      <div className="label-eyebrow mb-1">{card.name}</div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono tabular text-2xl font-bold text-[#E5EDF7]">{card.count}</span>
        <span className="text-[10px] text-[#94A3B8] font-mono">Trades</span>
      </div>
      <div className="font-mono text-xs text-[#94A3B8]">{card.pct}%</div>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className="text-[9px] text-[#64748B] uppercase tracking-wider font-mono">Net R</div>
          <div className={`font-mono tabular text-sm font-semibold ${card.netR < 0 ? "text-[#EF4444]" : "text-[#94A3B8]"}`}>
            {fmtR(card.netR, 2)}
          </div>
        </div>
        <Sparkline data={card.spark} color="#EF4444" width={70} height={24} />
      </div>
    </div>
  );
}

export default function FailureAnalysis() {
  return (
    <div className="space-y-5">
      <p className="text-xs text-[#94A3B8]">Understand why trades fail in this session.</p>

      {/* Failure cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {FAILURE_CARDS.map((c) => (
          <FailureCard key={c.name} card={c} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
        {/* Cancellation Reasons */}
        <div className="rounded-lg border border-[#223142] bg-[#0D1520] p-4">
          <SectionLabel className="mb-3">Cancellation Reasons</SectionLabel>
          <ul className="space-y-3">
            {CANCELLATION_REASONS.map((r) => (
              <li key={r.name} className="grid grid-cols-[1fr_120px_60px] items-center gap-3 text-xs">
                <span className="text-[#E5EDF7]">{r.name}</span>
                <div className="h-3 w-full bg-[#172331] rounded-sm overflow-hidden">
                  <div className="h-full bg-[#EF4444]/70" style={{ width: `${r.pct}%` }} />
                </div>
                <div className="text-right font-mono">
                  <span className="text-[#94A3B8]">{r.pct}%</span>{" "}
                  <span className="text-[#EF4444]">{fmtR(r.netR, 2)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Worst cluster */}
        <div className="rounded-lg border border-[#EF4444]/30 bg-gradient-to-b from-[#1A0F14] to-[#0D1520] p-4">
          <div className="flex items-baseline justify-between mb-3">
            <SectionLabel>Worst Failure Cluster</SectionLabel>
            <span className="rounded-full bg-[#EF4444]/15 text-[#EF4444] text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border border-[#EF4444]/30 flex items-center gap-1">
              <AlertTriangle size={9} />
              Alert
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-3">
            <div>
              <div className="label-eyebrow">Consecutive Losses</div>
              <div className="font-mono tabular text-2xl font-bold text-[#EF4444]">{WORST_CLUSTER.losses}</div>
            </div>
            <div>
              <div className="label-eyebrow">Net R Impact</div>
              <div className="font-mono tabular text-2xl font-bold text-[#EF4444]">{fmtR(WORST_CLUSTER.netR, 2)}</div>
            </div>
            <div>
              <div className="label-eyebrow">Time Window</div>
              <div className="font-mono text-sm text-[#E5EDF7]">{WORST_CLUSTER.window}</div>
            </div>
            <div>
              <div className="label-eyebrow">Trades</div>
              <div className="font-mono text-sm text-[#E5EDF7]">{WORST_CLUSTER.trades}</div>
            </div>
          </div>
          <div className="rounded-md bg-[#172331] border border-[#223142] p-3 mb-3">
            <div className="label-eyebrow mb-1">Dominant Cause</div>
            <div className="font-mono text-[11px] text-[#FBBF24]">{WORST_CLUSTER.cause}</div>
          </div>
          <Sparkline data={WORST_CLUSTER.spark} color="#EF4444" width={300} height={36} />
          <button
            data-testid="worst-cluster-view-trades"
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 text-[#F87171] px-3 py-1.5 text-xs font-medium hover:bg-[#EF4444]/15"
          >
            View Trades <ArrowRight size={11} />
          </button>
        </div>
      </div>

      <p className="text-[10px] text-[#64748B] font-mono">Failure metrics update based on your current filters.</p>
    </div>
  );
}
