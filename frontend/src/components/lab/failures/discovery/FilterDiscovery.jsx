// ── FilterDiscovery.jsx ──────────────────────────────────────────────────────
// Failures Lab V5 Phase 1 — the Filter Discovery panel (decision layer).
// Renders the filterSimulator truth layer: for every registry cohort + curated
// pair, "if I disable this cohort, what happens?" — actual trades removed, both
// sides counted, Net R / win rate / PF recomputed from the remaining trades.
//
// Population: the VALID trade universe (isPerformanceTrade), matching the Failure
// Explorer / Run Detail KPI — winners included so the cost side is real.
//
// Keep it simple (per Phase 1 spec): quick cards + one sortable table ranked by
// Net R improvement. No drilldowns, no free-form mining, no new analytics here —
// all math lives in shared/filterSimulator.js.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { cn } from "@/lib/utils";
import { Info, AlertTriangle } from "lucide-react";
import { TermTip } from "@/components/lab/TermTip";
import { isPerformanceTrade } from "@/data/tradeClassification";
import {
    buildFilterDiscovery, bestFiltersByDimension, REC_SAMPLE_FLOOR,
} from "../shared/filterSimulator";

const REC_TITLE = "Recommendation is derived from simulated net R improvement, sample size and winner cost. It is in-sample, single-run optimization — a hypothesis to re-test, not a live trading instruction.";

const fmtR = (v, signed = false) => `${signed && v > 0 ? "+" : ""}${v}R`;
const fmtPF = (pf, posR) => (pf == null ? (posR > 0 ? "∞" : "—") : pf);

function netColor(v) {
    return v > 0 ? "hsl(var(--success))" : v < 0 ? "hsl(var(--danger))" : "hsl(var(--text-2))";
}

// ── Quick cards (best positive filter per slot) ─────────────────────────────
function QuickCard({ slotLabel, row }) {
    return (
        <div className="flex-1 min-w-[180px] border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.35)] clip-bevel-sm px-3 py-2.5">
            <div className="text-[9.5px] font-ui uppercase tracking-[0.06em] text-[hsl(var(--text-3))]">Best {slotLabel} filter</div>
            <div className="mt-1 text-[12.5px] font-ui text-[hsl(var(--text))] truncate">{row.cohort}</div>
            <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[15px] font-num tabular-nums font-semibold" style={{ color: netColor(row.netRImpact) }}>{fmtR(row.netRImpact, true)}</span>
                <span className="text-[10px] font-ui text-[hsl(var(--text-2))]">−{row.losersRemoved}L / −{row.winnersRemoved}W</span>
                {row.lowSample && <Pill tone="warning">low n</Pill>}
            </div>
            <div className="mt-0.5 text-[10px] font-ui text-[hsl(var(--text-3))]">
                WR {row.before.winRate}% → {row.after.winRate}% · PF {fmtPF(row.pfBefore, row.before.posR)} → {fmtPF(row.pfAfter, row.after.posR)}
            </div>
        </div>
    );
}

// ── Sortable header cell ─────────────────────────────────────────────────────
function SortTh({ col, sort, onSort, align = "right", children }) {
    const active = sort.key === col;
    return (
        <th
            className={cn(
                "font-medium py-1.5 px-2 select-none cursor-pointer whitespace-nowrap",
                align === "right" ? "text-right" : "text-left",
                active ? "text-[hsl(var(--text))]" : "hover:text-[hsl(var(--text))]",
            )}
            onClick={() => onSort(col)}
        >
            {children}{active && <span className="ml-1 text-[8.5px]">{sort.dir === "desc" ? "▼" : "▲"}</span>}
        </th>
    );
}

const SORTABLE = new Set(["netRImpact", "lossRRemoved", "winnerRRemoved", "tradesRemoved", "winRateChange", "contributionPct"]);

export function FilterDiscovery({ allTrades = [] }) {
    // Valid trade universe — same predicate as the Explorer / Run Detail KPI.
    const validTrades = useMemo(
        () => (Array.isArray(allTrades) ? allTrades.filter(isPerformanceTrade) : []),
        [allTrades],
    );

    const discovery = useMemo(() => buildFilterDiscovery(validTrades), [validTrades]);
    const cards = useMemo(() => bestFiltersByDimension(discovery), [discovery]);

    const [sort, setSort] = useState({ key: "netRImpact", dir: "desc" });
    const onSort = (key) => {
        if (!SORTABLE.has(key)) return;
        setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
    };
    const rows = useMemo(() => {
        const list = [...discovery.rows];
        const sgn = sort.dir === "desc" ? -1 : 1;
        list.sort((a, b) => sgn * ((a[sort.key] ?? 0) - (b[sort.key] ?? 0)));
        return list;
    }, [discovery, sort]);

    if (!validTrades.length) {
        return (
            <div className="p-6">
                <NeonPanel title={<TermTip termKey="filter_discovery">Filter Discovery</TermTip>}>
                    <div className="p-6 flex items-start gap-3 text-[12px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                        <div>No valid trades in the active run — import or select a run to simulate cohort filters.</div>
                    </div>
                </NeonPanel>
            </div>
        );
    }

    const t = discovery.totals;

    return (
        <div className="p-6 space-y-5">
            {/* Overfit / in-sample caveat — the honesty banner */}
            <div className="border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.05)] clip-bevel-sm p-3 flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
                <p className="text-[11.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    Each row removes the cohort's <span className="text-[hsl(var(--text))]">actual trades</span> and recomputes the run from what remains —
                    counting <span className="text-[hsl(var(--text))]">both</span> the losses avoided and the <TermTip termKey="winner_r_lost">winners given up</TermTip>.
                    This is <span className="text-[hsl(var(--text))]">in-sample, single-run</span> optimization: treat any filter as a hypothesis to re-test (ideally on a fresh run), not a live trading rule.
                </p>
            </div>

            {/* Quick cards */}
            {cards.length > 0 && (
                <div className="flex flex-wrap gap-3">
                    {cards.map((c) => <QuickCard key={c.slot} slotLabel={c.slotLabel} row={c.row} />)}
                </div>
            )}

            {/* Main discovery table */}
            <NeonPanel
                title={<TermTip termKey="filter_discovery">Filter Discovery — what if I disable this cohort?</TermTip>}
                tone="primary"
                action={<Pill tone="muted">{t.trades} valid trades · {fmtR(t.netR, true)} net · {discovery.totalCohorts} cohorts simulated</Pill>}
            >
                <p className="px-3 pt-3 text-[10.5px] font-ui text-[hsl(var(--text-2))] leading-relaxed">
                    Single-dimension cohorts from every available dimension, plus curated pairs (no free-form mining).
                    Ranked by <TermTip termKey="net_r_impact">Net R change</TermTip>; adequate-sample rows rank first. Click a column to sort.
                </p>
                <div className="p-3 overflow-x-auto">
                    <table className="w-full text-[11.5px] font-ui border-collapse">
                        <thead>
                            <tr className="text-[9.5px] uppercase tracking-[0.05em] text-[hsl(var(--text-2))] border-b border-[hsl(var(--border-soft))]">
                                <th className="text-left font-medium py-1.5 pr-2">Cohort</th>
                                <th className="text-left font-medium py-1.5 px-2">Dimension</th>
                                <SortTh col="tradesRemoved" sort={sort} onSort={onSort}>Removed</SortTh>
                                <th className="text-right font-medium py-1.5 px-2">L / W</th>
                                <SortTh col="lossRRemoved" sort={sort} onSort={onSort}><TermTip termKey="loss_r_contribution">Loss R saved</TermTip></SortTh>
                                <SortTh col="winnerRRemoved" sort={sort} onSort={onSort}><TermTip termKey="winner_r_lost">Winner R lost</TermTip></SortTh>
                                <SortTh col="netRImpact" sort={sort} onSort={onSort}><TermTip termKey="net_r_impact">Net R change</TermTip></SortTh>
                                <SortTh col="winRateChange" sort={sort} onSort={onSort}>Win rate</SortTh>
                                <th className="text-right font-medium py-1.5 px-2"><TermTip termKey="profit_factor">PF</TermTip></th>
                                <SortTh col="contributionPct" sort={sort} onSort={onSort}><TermTip termKey="contribution_pct">Contrib</TermTip></SortTh>
                                <th className="text-right font-medium py-1.5 px-2">Sample</th>
                                <th className="text-right font-medium py-1.5 pl-2" title={REC_TITLE}>Recommendation</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className={cn(
                                    "border-b border-[hsl(var(--border-soft)/0.5)] transition-colors hover:bg-[hsl(var(--panel-2)/0.5)]",
                                    r.lowSample && "opacity-55",
                                )}>
                                    <td className="text-left py-1.5 pr-2 text-[hsl(var(--text))] truncate max-w-[170px]">{r.cohort}</td>
                                    <td className="text-left py-1.5 px-2 text-[10.5px] text-[hsl(var(--text-2))] whitespace-nowrap">{r.dimLabel}</td>
                                    <td className="text-right py-1.5 px-2 font-num tabular-nums text-white">{r.tradesRemoved}</td>
                                    <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))] whitespace-nowrap">
                                        <span className="text-[hsl(var(--danger))]">{r.losersRemoved}L</span> / <span className="text-[hsl(var(--success))]">{r.winnersRemoved}W</span>
                                    </td>
                                    <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--success))]">{fmtR(r.lossRRemoved)}</td>
                                    <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--danger))]">−{fmtR(r.winnerRRemoved)}</td>
                                    <td className="text-right py-1.5 px-2 font-num tabular-nums font-semibold" style={{ color: netColor(r.netRImpact) }}>{fmtR(r.netRImpact, true)}</td>
                                    <td className="text-right py-1.5 px-2 font-num tabular-nums whitespace-nowrap">
                                        <span className="text-[hsl(var(--text-2))]">{r.before.winRate}%</span>
                                        <span className="text-[hsl(var(--text-3))]"> → </span>
                                        <span style={{ color: netColor(r.winRateChange) }}>{r.after.winRate}%</span>
                                    </td>
                                    <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))] whitespace-nowrap">
                                        {fmtPF(r.pfBefore, r.before.posR)} → {fmtPF(r.pfAfter, r.after.posR)}
                                    </td>
                                    <td className="text-right py-1.5 px-2 font-num tabular-nums text-[hsl(var(--text-2))]">{r.contributionPct}%</td>
                                    <td className="text-right py-1.5 px-2">{r.lowSample ? <Pill tone="warning">low n</Pill> : <Pill tone="muted">ok</Pill>}</td>
                                    <td className="text-right py-1.5 pl-2 whitespace-nowrap" title={REC_TITLE}>
                                        {r.recommendation.key === "neutral"
                                            ? <span className="text-[hsl(var(--text-3))]">—</span>
                                            : <Pill tone={r.recommendation.tone}>{r.recommendation.label}</Pill>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!rows.length && (
                        <div className="p-4 text-[11.5px] font-ui text-[hsl(var(--text-2))]">No cohorts could be simulated for this run.</div>
                    )}
                    <p className="px-1 pt-2 text-[10px] font-ui text-[hsl(var(--text-3))] leading-relaxed">
                        Showing top {rows.length} of {discovery.totalCohorts} simulated cohorts · sample floor {REC_SAMPLE_FLOOR} removed losers for Test/Strong ·
                        win rate and PF recomputed from the remaining trades, not estimated.
                    </p>
                </div>
            </NeonPanel>
        </div>
    );
}
