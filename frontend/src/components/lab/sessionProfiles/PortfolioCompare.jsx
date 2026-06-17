// PortfolioCompare — PORTFOLIO-COMPARISON (MVP).
//
// Read-first, compact comparison of the current WORKING copy (side A) against a
// saved portfolio snapshot (side B). Both sides are resolved with
// buildEffectivePortfolioMap() against the SAME active bundle + variant, then
// diffed with compareEffectivePortfolioMaps(). This NEVER mutates the working
// copy, never loads side B, and never changes loadedPortfolioId.

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
    useDataset, getSessionProfiles, getLoadedPortfolio, listPortfolios,
    getActiveBundle, getTradeUniverse,
} from "@/data/store";
import { SESSIONS, CELLS, buildEffectivePortfolioMap } from "@/data/sessionProfiles";
import { compareEffectivePortfolioMaps } from "@/data/portfolioCompare";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const sessionLabel = (key) => SESSIONS.find((s) => s.key === key)?.label || key;
const cellLabel = (key) => CELLS.find((c) => c.key === key)?.label || key;
const shortEntry = (l) => (l === "Base universe" ? "Run Default" : l);
const flag = (st) => (st === "unavailable" ? " ⚠" : "");
const bundleLine = (eff) => {
    if (!eff) return "—";
    if (eff.disabled) return "Disabled";
    return `Entry ${shortEntry(eff.entryLabel)}${flag(eff.entryStatus)} · BE ${eff.beLabel}${flag(eff.beStatus)} · Target ${eff.targetLabel}${flag(eff.targetStatus)}`;
};

function Stat({ label, value, accent }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] px-2.5 py-1.5">
            <div className="text-[10px] font-ui uppercase tracking-[0.05em] text-muted-lab">{label}</div>
            <div className={`text-[15px] font-num ${accent && value > 0 ? "text-[hsl(var(--accent-primary))]" : "text-[hsl(var(--text-1))]"}`}>{value}</div>
        </div>
    );
}

export default function PortfolioCompare({ open, onOpenChange }) {
    useDataset();
    const working = getSessionProfiles();
    const loaded = getLoadedPortfolio();
    const portfolios = listPortfolios();
    const bundle = getActiveBundle();
    const variant = getTradeUniverse()?.variant || null;

    const [compareId, setCompareId] = useState(null);
    const effectiveCompareId = compareId && portfolios.some((p) => p.id === compareId)
        ? compareId
        : (portfolios[0]?.id || null);
    const bRecord = portfolios.find((p) => p.id === effectiveCompareId) || null;

    const aName = (loaded?.name || "Untitled") + " (working copy)";
    const bName = bRecord?.name || "—";

    let body;
    if (!bundle) {
        body = <div className="py-8 text-center text-[12.5px] font-ui text-[hsl(var(--text-2))]">Load a run before comparing portfolios.</div>;
    } else if (!bRecord) {
        body = <div className="py-8 text-center text-[12.5px] font-ui text-[hsl(var(--text-2))]">No saved portfolios to compare against.</div>;
    } else {
        const aMap = buildEffectivePortfolioMap(working, bundle, variant);
        const bMap = buildEffectivePortfolioMap(bRecord.profiles, bundle, variant);
        const { counts, groups } = compareEffectivePortfolioMaps(aMap, bMap);
        body = (
            <>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-1">
                    <Stat label="Cohorts differ" value={counts.cohortsDiffer} accent />
                    <Stat label="Entry" value={counts.entry} />
                    <Stat label="Break-Even" value={counts.be} />
                    <Stat label="Target" value={counts.target} />
                    <Stat label="Disabled" value={counts.disabled} />
                    <Stat label="Availability" value={counts.availability} />
                </div>

                {groups.length === 0 ? (
                    <div className="py-6 text-center text-[12.5px] font-ui text-[hsl(var(--accent-primary))]">
                        Identical effective strategy for this run.
                    </div>
                ) : (
                    <div className="mt-3 max-h-[46vh] overflow-y-auto flex flex-col gap-3 pr-1">
                        {groups.map((g) => (
                            <div key={g.session}>
                                <div className="text-[12px] font-ui font-semibold text-[hsl(var(--text-1))] mb-1">{sessionLabel(g.session)}</div>
                                <div className="flex flex-col gap-2">
                                    {g.rows.map((row) => (
                                        <div key={row.cell} className="pl-3 border-l border-[hsl(var(--border-soft))]">
                                            <div className="text-[11.5px] font-ui font-semibold text-[hsl(var(--text-1))]">{cellLabel(row.cell)}</div>
                                            <div className="text-[11.5px] font-ui text-[hsl(var(--text-2))]">
                                                <span className="text-muted-lab">{aName}: </span>{bundleLine(row.a)}
                                            </div>
                                            <div className="text-[11.5px] font-ui text-[hsl(var(--accent-primary))]">
                                                <span className="text-muted-lab">{bName}: </span>{bundleLine(row.b)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Compare portfolios</DialogTitle>
                    <DialogDescription>
                        Compares the current working copy against a saved snapshot, resolved for the active run. Read-only — nothing is loaded or changed.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-2 flex-wrap text-[12px] font-ui">
                    <span className="text-[hsl(var(--text-1))] font-semibold">{aName}</span>
                    <span className="text-muted-lab">vs</span>
                    <span className="relative inline-flex items-center">
                        <select
                            className="clip-bevel-sm bg-[hsl(var(--panel-2)/0.4)] border border-[hsl(var(--border-mid))] text-[12px] font-ui text-[hsl(var(--text-1))] pl-2 pr-7 py-1 appearance-none"
                            value={effectiveCompareId || ""}
                            onChange={(e) => setCompareId(e.target.value || null)}
                            data-testid="portfolio-compare-select"
                        >
                            {portfolios.length === 0 && <option value="">No saved portfolios</option>}
                            {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <ChevronDown size={14} className="pointer-events-none absolute right-1.5 text-[hsl(var(--accent-secondary))]" />
                    </span>
                </div>

                {body}
            </DialogContent>
        </Dialog>
    );
}
