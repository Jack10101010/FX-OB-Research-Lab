import React, { useState, useMemo, useCallback } from "react";
import { NeonPanel }       from "@/components/lab/NeonPanel";
import { Pill }            from "@/components/lab/DataTable";
import { cn }              from "@/lib/utils";
import { PromotionCard }   from "./PromotionCard";
import { PLANNED_ENTRY_MODES } from "../analytics/entryRegistry";
import { downloadCsv }         from "../analytics/entryAnalytics";
import { isFiniteNumber, num } from "../analytics/entryFormatters";

const STORAGE_KEY = "fxob_entry_promotion_v1";

function loadShortlist() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveShortlist(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

const DECISION_FILTER_OPTS = [
    { key: "all",       label: "All" },
    { key: "pending",   label: "Pending" },
    { key: "approved",  label: "Approved" },
    { key: "watchlist", label: "Watchlist" },
    { key: "rejected",  label: "Rejected" },
];

export function PromotionDesk({ exactRows }) {
    const [shortlist,  setShortlist]  = useState(() => loadShortlist());
    const [filter,     setFilter]     = useState("all");
    const [sortKey,    setSortKey]    = useState("netR");

    function persist(list) {
        setShortlist(list);
        saveShortlist(list);
    }

    // Models available to add (not already in shortlist)
    const candidateRows = useMemo(() => {
        const inList = new Set(shortlist.map(s => s.mode));
        return (exactRows || []).filter(r => r.exact && !r.isBaseline && !inList.has(r.mode));
    }, [exactRows, shortlist]);

    function handleAdd(mode) {
        const row = (exactRows || []).find(r => r.mode === mode);
        if (!row) return;
        const meta = PLANNED_ENTRY_MODES.find(m => m.mode === mode);
        const entry = {
            mode,
            label:    row.label || mode,
            family:   meta?.family || row.family || "—",
            decision: "pending",
            note:     "",
            addedAt:  new Date().toISOString(),
            row,
        };
        persist([entry, ...shortlist]);
    }

    const handleDecision = useCallback((mode, decision) => {
        persist(shortlist.map(s => s.mode === mode ? { ...s, decision } : s));
    }, [shortlist]);

    const handleRemove = useCallback((mode) => {
        if (!window.confirm("Remove from shortlist?")) return;
        persist(shortlist.filter(s => s.mode !== mode));
    }, [shortlist]);

    const handleNoteChange = useCallback((mode, note) => {
        persist(shortlist.map(s => s.mode === mode ? { ...s, note } : s));
    }, [shortlist]);

    function handleExport() {
        const header = "mode,label,family,decision,netR,expectancy,winRate,profitFactor,fillPct,maxDD,trades,deltaVsBaseline,note,addedAt";
        const rows = shortlist.map(s => {
            const r = s.row || {};
            return [
                s.mode,
                `"${s.label}"`,
                s.family,
                s.decision,
                isFiniteNumber(r.netR)        ? num(r.netR).toFixed(2)       : "",
                isFiniteNumber(r.expectancy)   ? num(r.expectancy).toFixed(4)  : "",
                isFiniteNumber(r.winRate)      ? num(r.winRate).toFixed(4)     : "",
                isFiniteNumber(r.profitFactor) ? num(r.profitFactor).toFixed(2): "",
                isFiniteNumber(r.fillPct)      ? num(r.fillPct).toFixed(2)     : "",
                isFiniteNumber(r.maxDD)        ? num(r.maxDD).toFixed(2)       : "",
                r.trades ?? "",
                isFiniteNumber(r.deltaVsBaseline) ? num(r.deltaVsBaseline).toFixed(2) : "",
                `"${(s.note || "").replace(/"/g, '""')}"`,
                s.addedAt || "",
            ].join(",");
        });
        downloadCsv("entry_promotion_shortlist.csv", [header, ...rows].join("\n"));
    }

    const sorted = useMemo(() => {
        let list = filter === "all" ? shortlist : shortlist.filter(s => s.decision === filter);
        return list.slice().sort((a, b) => {
            const av = a.row?.[sortKey];
            const bv = b.row?.[sortKey];
            if (isFiniteNumber(av) && isFiniteNumber(bv)) return num(bv) - num(av);
            return 0;
        });
    }, [shortlist, filter, sortKey]);

    const counts = useMemo(() => {
        const c = { all: shortlist.length };
        DECISION_FILTER_OPTS.slice(1).forEach(o => { c[o.key] = shortlist.filter(s => s.decision === o.key).length; });
        return c;
    }, [shortlist]);

    const approvedCount = counts.approved || 0;

    return (
        <div className="space-y-4">
            <NeonPanel title="Promotion Desk" className="xl:col-span-3"
                action={
                    <div className="flex gap-1.5">
                        <Pill tone="secondary">{shortlist.length} IN SHORTLIST</Pill>
                        {approvedCount > 0 && <Pill tone="success">{approvedCount} APPROVED</Pill>}
                    </div>
                }
            >
                <p className="mb-3 text-[10px] font-mono text-muted-lab">
                    Curate a shortlist of entry models ready for promotion to live trading.
                    Add candidates from your current run's results, record decisions, and export the final list.
                </p>

                {/* Add candidates */}
                {candidateRows.length > 0 && (
                    <div className="mb-4">
                        <span className="text-[9.5px] font-mono uppercase tracking-wider text-muted-lab mb-1.5 block">Add to shortlist:</span>
                        <div className="flex flex-wrap gap-1.5">
                            {candidateRows.map(row => (
                                <button key={row.mode} type="button"
                                    onClick={() => handleAdd(row.mode)}
                                    className="flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-mono border border-[hsl(var(--border-soft)/0.5)] text-muted-lab hover:text-white hover:border-[hsl(var(--border-mid))] transition-colors rounded-[1px]"
                                >
                                    <span>+</span>
                                    <span>{row.label}</span>
                                    {isFiniteNumber(row.netR) && (
                                        <span className={num(row.netR) >= 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"}>
                                            {num(row.netR) >= 0 ? "+" : ""}{num(row.netR).toFixed(1)}R
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Filter bar */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    {DECISION_FILTER_OPTS.map(o => (
                        <button key={o.key} type="button"
                            onClick={() => setFilter(o.key)}
                            className={cn(
                                "px-2.5 py-1 text-[9.5px] font-mono uppercase tracking-wider border rounded-[1px] transition-colors",
                                filter === o.key
                                    ? "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.1)] text-white"
                                    : "border-[hsl(var(--border-soft)/0.4)] text-muted-lab hover:text-white"
                            )}
                        >
                            {o.label} ({counts[o.key] ?? 0})
                        </button>
                    ))}

                    <div className="ml-auto flex items-center gap-2">
                        <span className="text-[9px] font-mono text-muted-lab">Sort:</span>
                        {[["netR", "Net R"], ["expectancy", "Exp"], ["fillPct", "Fill %"]].map(([k, l]) => (
                            <button key={k} type="button"
                                onClick={() => setSortKey(k)}
                                className={cn(
                                    "text-[9.5px] font-mono transition-colors",
                                    sortKey === k ? "text-white" : "text-muted-lab hover:text-white"
                                )}
                            >
                                {l}
                            </button>
                        ))}
                        <button type="button" onClick={handleExport}
                            className="ml-2 px-2.5 py-1 text-[9.5px] font-mono uppercase tracking-wider border border-[hsl(var(--border-soft)/0.5)] text-muted-lab hover:text-white transition-colors rounded-[1px]"
                        >
                            Export CSV
                        </button>
                    </div>
                </div>
            </NeonPanel>

            {/* Cards */}
            {sorted.length === 0 ? (
                <NeonPanel className="xl:col-span-3">
                    <div className="py-8 text-center text-[11px] font-mono text-muted-lab">
                        {shortlist.length === 0
                            ? "No models in shortlist yet. Add candidates using the buttons above."
                            : "No models match the current filter."}
                    </div>
                </NeonPanel>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {sorted.map(candidate => (
                        <PromotionCard
                            key={candidate.mode}
                            candidate={candidate}
                            onDecision={handleDecision}
                            onRemove={handleRemove}
                            onNoteChange={handleNoteChange}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
