/**
 * ResearchContextBanner — read-only, RunDetail-style premium banner for pages that
 * are MULTI-MODEL / MULTI-RUN / aggregate (RESEARCH-RESULT-VIEW-BANNER).
 *
 * Unlike ResearchResultViewBanner, this banner does NOT claim a single "Current
 * Result View" — that would lie on a page comparing many models or runs. It shows
 * truthful page context instead: run / project identity (name + symbol·TF + date
 * range) on the left, and a SCOPE panel on the right ("Entry Model Comparison —
 * comparing 4 models", "Run Comparison — 3 runs", …) plus optional facts
 * (model/run/fold count, data source, basis).
 *
 * Shares the exact shell + premium dark styling with ResearchResultViewBanner via
 * ResearchBannerShell. Read-only; no switching; no Preview Lens; no Arm C0/C1
 * warning logic (that belongs to single-universe result-view pages only).
 *
 * Contract:
 *   run = null            run/project identity { id, name, symbol, timeframe, dateRange }
 *                         (build with buildBannerRunIdentity); shown when present
 *   showRunIdentity = true show the identity cell; false to opt out
 *   scopeTitle            REQUIRED short label, e.g. "Entry Model Comparison"
 *   scopeSummary          REQUIRED sentence, e.g. "Comparing 4 entry models"
 *   facts = []            [{ label, value }] e.g. { label:"Models", value:4 }, Source, Basis
 *   tone = "neutral"      shell tone ("neutral" | "active" | "warning")
 */

import React from "react";
import { Pill } from "@/components/lab/DataTable";
import { ResearchBannerShell } from "@/components/lab/researchBanner/ResearchBannerShell";

function Field({ label, children }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab">{label}</span>
            {children}
        </span>
    );
}

export default function ResearchContextBanner({
    run = null,
    showRunIdentity = true,
    scopeTitle = "Research Context",
    scopeSummary = "",
    facts = [],
    tone = "neutral",
}) {
    const left = (
        <div className="px-4 py-3">
            {showRunIdentity && run && (
                <div className="mb-2.5 pb-2 border-b border-[hsl(var(--border-soft)/0.25)]">
                    <div className="text-[13px] font-ui font-semibold text-[hsl(var(--text-1))] truncate">
                        {run.name || run.id || "Run"}
                    </div>
                    {(run.symbol || run.timeframe || run.dateRange) && (
                        <div className="text-[10.5px] font-ui text-[hsl(var(--text-2))]">
                            {[run.symbol, run.timeframe, run.dateRange].filter(Boolean).join(" · ")}
                        </div>
                    )}
                </div>
            )}
            <div className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))] mb-2">
                Scope
            </div>
            {facts.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {facts.filter((f) => f && f.value != null && f.value !== "").map((f) => (
                        <Field key={f.label} label={f.label}>
                            <Pill tone="muted">{String(f.value)}</Pill>
                        </Field>
                    ))}
                </div>
            )}
        </div>
    );

    const right = (
        <div className="px-3 py-2">
            <div className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))] mb-1">
                {scopeTitle}
            </div>
            <div className="font-ui font-bold leading-tight text-[hsl(var(--text-1))] text-[18px]">
                {scopeSummary}
            </div>
        </div>
    );

    return <ResearchBannerShell tone={tone} left={left} right={right} />;
}
