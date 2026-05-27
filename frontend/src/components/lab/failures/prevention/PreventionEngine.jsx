// ── PreventionEngine.jsx ─────────────────────────────────────────────────────
// Phase 2: Prevention rules ranked by actual net R delta (matched-trade R values,
// not global averages). Severity-weighted ranking toggle. SPECULATIVE/WEAK/
// MODERATE/STRONG confidence tiers. Explicit overfit warnings. HypothesisLab bridge.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { DataTable } from "@/components/lab/DataTable";
import { Pill } from "@/components/lab/DataTable";
import { Segment } from "@/components/lab/controls";
import { Send, CheckCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { computePreventionRules } from "../shared/failuresAnalytics";
import { buildHypothesisCard, writeHypothesisToStorage } from "../shared/failuresExporter";

// ── Confidence tier helpers ───────────────────────────────────────────────────

function preventionConfidenceTone(tier) {
    return { STRONG: "success", MODERATE: "secondary", WEAK: "warning", SPECULATIVE: "danger" }[tier] ?? "muted";
}

// ── Hypothesis bridge ─────────────────────────────────────────────────────────

function useHypoPromote() {
    const [promoted, setPromoted] = useState({});
    const promote = (key, title, description, rationale, tags = []) => {
        const card = buildHypothesisCard({ title, description, rationale });
        card.tags = [...(card.tags || []), ...tags];
        const ok = writeHypothesisToStorage(card);
        if (ok) setPromoted(p => ({ ...p, [key]: true }));
    };
    return { promoted, promote };
}

// ── Promote button ────────────────────────────────────────────────────────────

function PromoteBtn({ ruleKey, rule, promoted, onPromote }) {
    const isDone = promoted[ruleKey];
    const isWeak = rule.losersCaught < 5; // raised from 3 → 5 in Phase 2
    const title  = isWeak
        ? `Need ≥ 5 losses caught to promote (have ${rule.losersCaught})`
        : undefined;

    return (
        <button
            type="button"
            disabled={isDone || isWeak}
            onClick={() => onPromote(
                ruleKey,
                `Prevention Screen: ${rule.label}`,
                `Rule catches ${rule.losersCaughtPct}% of losses (${rule.losersCaught} trades, actual saved R: +${rule.savedR}R). ` +
                `Removes ${rule.winnersRemovedPct}% of winners (−${rule.sacrificedR}R). Net R delta: ${rule.netRDelta >= 0 ? "+" : ""}${rule.netRDelta}R.`,
                `Candidate prevention screen from Failures Lab. Confidence: ${rule.confidence}. Validate on out-of-sample data before applying.`,
                ["failures-lab", "prevention", rule.group.toLowerCase()],
            )}
            title={title}
            className={cn(
                "flex items-center gap-1 px-2 py-1 text-[8.5px] font-mono uppercase tracking-wider border clip-bevel-sm transition-colors whitespace-nowrap",
                isDone
                    ? "border-[hsl(var(--success)/0.4)] text-[hsl(var(--success))] cursor-default"
                    : isWeak
                    ? "border-[hsl(var(--border-soft))] text-muted-lab opacity-40 cursor-not-allowed"
                    : "border-[hsl(var(--accent-secondary)/0.4)] text-[hsl(var(--accent-secondary))] hover:border-[hsl(var(--accent-secondary))] hover:bg-[hsl(var(--accent-secondary)/0.08)]",
            )}
        >
            {isDone ? <><CheckCircle className="w-2.5 h-2.5" /> Sent</> : <><Send className="w-2.5 h-2.5" /> Promote</>}
        </button>
    );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function PreventionEngine({ losers = [], allLosers = [], allTrades = [], config = {} }) {
    const [groupFilter, setGroupFilter] = useState("All");
    const [sortMode, setSortMode]       = useState("netR"); // "netR" | "sevR"
    const { promoted, promote }         = useHypoPromote();

    const rules = useMemo(
        () => computePreventionRules(allTrades, allLosers),
        [allTrades, allLosers],
    );

    const groups = useMemo(
        () => ["All", ...Array.from(new Set(rules.map(r => r.group)))],
        [rules],
    );

    const displayed = useMemo(() => {
        let list = groupFilter === "All" ? rules : rules.filter(r => r.group === groupFilter);
        list = list.filter(r => r.losersCaught > 0);
        if (sortMode === "sevR") {
            list = [...list].sort((a, b) => b.severityNetR - a.severityNetR);
        }
        return list;
    }, [rules, groupFilter, sortMode]);

    const speculativeCount = displayed.filter(r => r.isSpeculative).length;

    const columns = [
        {
            key: "label", label: "Rule", sortable: false,
            render: r => (
                <div className="space-y-0.5">
                    <div className="text-[11px] font-medium text-white">{r.label}</div>
                    <div className="flex items-center gap-1 flex-wrap">
                        <Pill tone="muted">{r.group}</Pill>
                        {r.isSpeculative && <Pill tone="danger">SPECULATIVE</Pill>}
                    </div>
                </div>
            ),
        },
        {
            key: "losersCaughtPct", label: "Losers %", sortable: true,
            render: r => (
                <div>
                    <span className="font-mono text-[hsl(var(--success))]">{r.losersCaughtPct}%</span>
                    {r.avgActualLossR != null && (
                        <div className="text-[9px] font-mono text-muted-lab">avg {r.avgActualLossR}R ea</div>
                    )}
                </div>
            ),
            sortValue: r => r.losersCaughtPct,
        },
        { key: "losersCaught", label: "Caught", sortable: true },
        {
            key: "winnersRemovedPct", label: "FP %", sortable: true,
            render: r => (
                <div>
                    <span className={r.falsePosWarning ? "font-semibold text-[hsl(var(--warning))]" : "text-[hsl(var(--text-2))]"}>
                        {r.winnersRemovedPct}%{r.falsePosWarning ? " ⚠" : ""}
                    </span>
                    {r.avgActualWinR != null && r.winnersRemoved > 0 && (
                        <div className="text-[9px] font-mono text-muted-lab">avg +{r.avgActualWinR}R ea</div>
                    )}
                </div>
            ),
            sortValue: r => r.winnersRemovedPct,
        },
        {
            key: "netRDelta", label: sortMode === "sevR" ? "Sev Net R" : "Net R Δ", sortable: true,
            render: r => {
                const val = sortMode === "sevR" ? r.severityNetR : r.netRDelta;
                return (
                    <div>
                        <span className={val >= 0 ? "font-mono text-[hsl(var(--success))]" : "font-mono text-[hsl(var(--danger))]"}>
                            {val >= 0 ? "+" : ""}{val}R
                        </span>
                        {sortMode !== "sevR" && (
                            <div className="text-[9px] font-mono text-muted-lab">
                                +{r.savedR}R / −{r.sacrificedR}R
                            </div>
                        )}
                    </div>
                );
            },
            sortValue: r => sortMode === "sevR" ? r.severityNetR : r.netRDelta,
        },
        {
            key: "confidence", label: "N", sortable: false,
            render: r => (
                <div className="space-y-0.5">
                    <Pill tone={preventionConfidenceTone(r.confidence)}>{r.confidence}</Pill>
                    {r.avgSeverity != null && (
                        <div className="text-[9px] font-mono text-muted-lab">sev {r.avgSeverity}</div>
                    )}
                </div>
            ),
        },
        {
            key: "_promote", label: "", sortable: false,
            render: r => <PromoteBtn ruleKey={r.key} rule={r} promoted={promoted} onPromote={promote} />,
        },
    ];

    if (!allTrades.length) return null;

    return (
        <div className="p-6 space-y-4">
            {/* Caveat */}
            <div className="border border-[hsl(var(--accent-secondary)/0.3)] bg-[hsl(var(--accent-secondary)/0.04)] clip-bevel p-3 flex items-start gap-2.5">
                <Info className="w-3.5 h-3.5 text-[hsl(var(--accent-secondary))] shrink-0 mt-0.5" />
                <p className="text-[10.5px] font-mono text-[hsl(var(--text-2))] leading-relaxed">
                    These are <span className="text-white font-semibold">candidate screens</span>, not proven rules.
                    All metrics are <span className="text-white font-semibold">in-sample</span>.
                    Net R uses actual R values of matched trades — not population averages.
                    SPECULATIVE rules (&lt;5 losses caught) cannot be promoted.
                    False-positive rates &gt;15% are flagged.
                    Always weigh sacrificed winners carefully.
                </p>
            </div>

            {/* Speculative warning */}
            {speculativeCount > 0 && (
                <div className="border border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.04)] clip-bevel p-2.5 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--danger))] shrink-0" />
                    <p className="text-[10px] font-mono text-[hsl(var(--danger))]">
                        {speculativeCount} rule{speculativeCount !== 1 ? "s" : ""} marked SPECULATIVE
                        — fewer than 5 losses caught. Treat as noise, not signal.
                    </p>
                </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-mono text-muted-lab uppercase tracking-wider">Group:</span>
                <Segment options={groups} value={groupFilter} onChange={setGroupFilter} />
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <span className="text-[10px] font-mono text-muted-lab">Rank by:</span>
                    <Segment options={["netR", "sevR"]} value={sortMode} onChange={setSortMode} />
                    <span className="text-[10px] font-mono text-muted-lab">{displayed.length} rules</span>
                </div>
            </div>

            {/* Table */}
            {displayed.length > 0 ? (
                <NeonPanel title="Prevention Rule Analysis">
                    <DataTable
                        columns={columns}
                        rows={displayed}
                        rowKey="key"
                        defaultSortKey="netRDelta"
                        defaultSortDir="desc"
                        maxHeight="520px"
                        compact
                    />
                </NeonPanel>
            ) : (
                <div className="p-10 text-center text-[10.5px] font-mono text-muted-lab">
                    No rules matched the current data / group filter.
                </div>
            )}

            {sortMode === "sevR" && (
                <p className="text-[9.5px] font-mono text-muted-lab px-1 leading-relaxed">
                    Severity-weighted Net R: each caught loss is weighted by (1 + severity/10).
                    A CRITICAL loss (sev 8) contributes 1.8× vs an unscored loss (1.0×).
                    Use this ranking to prioritise catching your highest-severity losses.
                </p>
            )}
        </div>
    );
}
