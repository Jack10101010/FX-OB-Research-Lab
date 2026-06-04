import React from "react";
import { SectionLabel, Sparkline, fmtR } from "../primitives";
import { FAILURE_CARDS, CANCELLATION_REASONS, WORST_CLUSTER } from "../../mockData";
import { AlertTriangle, ArrowRight } from "lucide-react";

function FailureCard({ card }) {
  return (
    <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-3.5">
      <div className="label-eyebrow mb-1">{card.name}</div>
      <div className="flex items-baseline gap-2">
        <span className="font-num tabular text-2xl font-bold text-[hsl(var(--text))]">{card.count}</span>
        <span className="text-[10px] text-[hsl(var(--text-2))] font-num">Trades</span>
      </div>
      <div className="font-num text-xs text-[hsl(var(--text-2))]">{card.pct}%</div>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className="text-[9px] text-muted-lab uppercase tracking-wider font-num">Net R</div>
          <div className={`font-num tabular text-sm font-semibold ${card.netR < 0 ? "text-[#EF4444]" : "text-[hsl(var(--text-2))]"}`}>
            {fmtR(card.netR, 2)}
          </div>
        </div>
        <Sparkline data={card.spark} color="#EF4444" width={70} height={24} />
      </div>
    </div>
  );
}

export default function FailureAnalysis({ failureData = null }) {
  const cards   = failureData?.failureCards        ?? FAILURE_CARDS;
  const reasons = failureData?.cancellationReasons ?? CANCELLATION_REASONS;
  const cluster = failureData?.worstCluster        ?? WORST_CLUSTER;

  return (
    <div className="space-y-5">
      <p className="text-xs text-[hsl(var(--text-2))]">Understand why trades fail in this session.</p>

      {/* Failure cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <FailureCard key={c.name} card={c} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
        {/* Cancellation Reasons */}
        <div className="rounded border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-4">
          <SectionLabel className="mb-3">Cancellation Reasons</SectionLabel>
          {reasons.length > 0 ? (
            <ul className="space-y-3">
              {reasons.map((r) => (
                <li key={r.name} className="grid grid-cols-[1fr_120px_60px] items-center gap-3 text-xs">
                  <span className="text-[hsl(var(--text))]">{r.name}</span>
                  <div className="h-3 w-full bg-[hsl(var(--panel-2))] rounded-sm overflow-hidden">
                    <div className="h-full bg-[#EF4444]/70" style={{ width: `${r.pct}%` }} />
                  </div>
                  <div className="text-right font-num">
                    <span className="text-[hsl(var(--text-2))]">{r.pct}%</span>{" "}
                    <span className="text-[#EF4444]">{fmtR(r.netR, 2)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-lab font-num">No cancellation data available.</p>
          )}
        </div>

        {/* Worst cluster */}
        <div className="rounded border border-[#EF4444]/30 bg-gradient-to-b from-[#1A0F14] to-[#0D1520] p-4">
          <div className="flex items-baseline justify-between mb-3">
            <SectionLabel>Worst Failure Cluster</SectionLabel>
            {cluster && (
              <span className="rounded-full bg-[#EF4444]/15 text-[#EF4444] text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border border-[#EF4444]/30 flex items-center gap-1">
                <AlertTriangle size={9} />
                Alert
              </span>
            )}
          </div>

          {cluster ? (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-3">
                <div>
                  <div className="label-eyebrow">Consecutive Losses</div>
                  <div className="font-num tabular text-2xl font-bold text-[#EF4444]">{cluster.losses}</div>
                </div>
                <div>
                  <div className="label-eyebrow">Net R Impact</div>
                  <div className="font-num tabular text-2xl font-bold text-[#EF4444]">{fmtR(cluster.netR, 2)}</div>
                </div>
                <div>
                  <div className="label-eyebrow">Time Window</div>
                  <div className="font-num text-sm text-[hsl(var(--text))]">{cluster.window}</div>
                </div>
                <div>
                  <div className="label-eyebrow">Trades</div>
                  <div className="font-num text-sm text-[hsl(var(--text))]">{cluster.trades}</div>
                </div>
              </div>
              <div className="rounded-md bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] p-3 mb-3">
                <div className="label-eyebrow mb-1">Dominant Cause <span className="text-muted-lab normal-case tracking-normal">(approx)</span></div>
                <div className="font-num text-[11px] text-[hsl(var(--warning))]">{cluster.cause}</div>
              </div>
              <Sparkline data={cluster.spark} color="#EF4444" width={300} height={36} />
              <button
                data-testid="worst-cluster-view-trades"
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 text-[#F87171] px-3 py-1.5 text-xs font-medium hover:bg-[#EF4444]/15"
              >
                View Trades <ArrowRight size={11} />
              </button>
            </>
          ) : (
            <p className="text-xs text-muted-lab font-num">No consecutive loss cluster detected.</p>
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-lab font-num">Failure metrics update based on your current filters.</p>
    </div>
  );
}
