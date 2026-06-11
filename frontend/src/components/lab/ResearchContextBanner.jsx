/**
 * ResearchContextBanner — read-only, RunDetail-style premium banner for pages that
 * are MULTI-MODEL / MULTI-RUN / aggregate (RESEARCH-RESULT-VIEW-BANNER).
 *
 * Unlike ResearchResultViewBanner, this banner does NOT claim a single "Current
 * Result View" — that would lie on a page comparing many models or runs. It shows
 * truthful page context instead: run / project identity (name + symbol·TF + date
 * range) on the left, an optional compact chip list (e.g. the available models),
 * and a SCOPE panel on the right ("Entry Model Comparison — comparing 4 models",
 * "Run Comparison — 3 runs", …) plus optional facts.
 *
 * VISUAL STANDARD: shares the exact shell + premium dark surface with
 * ResearchResultViewBanner via ResearchBannerShell, defaults to the same blue
 * (`tone="active"`) treatment, and matches its right-panel hierarchy (20px bold
 * accent title) so the two read as one banner family — only the CONTENT differs.
 * Read-only; no switching; no Preview Lens; no Arm C0/C1 warnings (those belong to
 * single-universe result-view pages only).
 *
 * Contract:
 *   run = null            run/project identity { id, name, symbol, timeframe, dateRange }
 *                         (build with buildBannerRunIdentity); shown when present
 *   showRunIdentity = true show the identity cell; false to opt out
 *   scopeTitle            REQUIRED short label, e.g. "Entry Model Comparison"
 *   scopeSummary          REQUIRED sentence, e.g. "Comparing 4 entry models"
 *   facts = []            [{ label, value }] e.g. { label:"Models", value:4 }, Source, Basis
 *   chips = []            optional string list rendered as a compact chip row (bottom-left),
 *                         e.g. the available entry models. Collapses to "+N more" past maxChips.
 *   chipsLabel = "Models" eyebrow for the chip row
 *   maxChips = 8          show this many chips, then "+N more"
 *   tone = "active"       shell tone ("active" | "neutral" | "warning"); blue by default
 */

import React from "react";
import { Pill } from "@/components/lab/DataTable";
import { ResearchBannerShell } from "@/components/lab/researchBanner/ResearchBannerShell";
import BannerRunIdentity from "@/components/lab/researchBanner/BannerRunIdentity";

function Field({ label, children }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-[hsl(var(--text-2)/0.8)]">{label}</span>
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
    chips = [],
    chipsLabel = "Models",
    maxChips = 8,
    tone = "active",
}) {
    const visibleFacts = facts.filter((f) => f && f.value != null && f.value !== "");
    const chipList = Array.isArray(chips) ? chips.filter(Boolean) : [];
    const shownChips = chipList.slice(0, maxChips);
    const overflow = chipList.length - shownChips.length;

    const left = (
        <div className="px-4 py-3">
            {showRunIdentity && run && <BannerRunIdentity run={run} />}
            <div className="text-[10px] font-semibold font-ui uppercase tracking-[0.1em] text-[hsl(var(--text-2))] mb-2">
                Scope
            </div>
            {visibleFacts.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {visibleFacts.map((f) => (
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
            <div className="font-ui font-bold leading-tight text-[20px] text-[hsl(var(--accent-primary))]">
                {scopeSummary}
            </div>
            {/* Models (or other chips) — stacked column on the right. */}
            {chipList.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[hsl(var(--border-soft)/0.25)]">
                    <div className="text-[9.5px] font-ui uppercase tracking-[0.08em] text-muted-lab mb-1">{chipsLabel}</div>
                    <div className="flex flex-col gap-0.5">
                        {shownChips.map((c, i) => (
                            <span key={`${c}-${i}`} className="text-[11px] font-ui text-[hsl(var(--text-2))] truncate">
                                {c}
                            </span>
                        ))}
                        {overflow > 0 && (
                            <span
                                className="text-[10.5px] font-ui text-[hsl(var(--text-muted))]"
                                title={chipList.slice(maxChips).join(", ")}
                            >
                                +{overflow} more
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    return <ResearchBannerShell tone={tone} left={left} right={right} />;
}
