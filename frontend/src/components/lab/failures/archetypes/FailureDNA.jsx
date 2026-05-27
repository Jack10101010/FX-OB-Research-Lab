// ── FailureDNA.jsx ───────────────────────────────────────────────────────────
// Phase 1: One card per registered archetype — count, avg R, severity, confidence,
// top session, suggested hypothesis, Promote-to-HypothesisLab action.

import React, { useMemo, useState } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { Lightbulb, Send, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    ARCHETYPES,
    getArchetype,
    archetypeLabel,
    archetypeTone,
    archetypeColour,
    sampleConfidence,
} from "../shared/failuresRegistry";
import {
    computeArchetypeDistribution,
    computeArchetypeDNAStats,
} from "../shared/failuresAnalytics";
import {
    severityLabel,
    severityTone,
    confidenceLabel,
    confidenceTone,
    safeLabel,
} from "../shared/failuresFormatters";
import { buildHypothesisCard, writeHypothesisToStorage } from "../shared/failuresExporter";

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

// ── Archetype card ────────────────────────────────────────────────────────────

function ArchetypeCard({ archetypeId, stats, total, promoted, onPromote }) {
    const arch = getArchetype(archetypeId);
    if (!stats) return null;

    const pct      = total > 0 ? ((stats.count / total) * 100).toFixed(0) : 0;
    const mainHypo = arch.suggestedHypotheses?.[0]
        ?? `Investigate ${archetypeLabel(archetypeId)} failure pattern`;

    // Top classification confidence tier from confDist
    const topConfTier = stats.confDist
        ? (Object.entries(stats.confDist).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "UNCLASSIFIED")
        : "UNCLASSIFIED";

    // Top session
    const sessionEntries = Object.entries(stats.sessionConcentration || {})
        .sort((a, b) => b[1] - a[1]);
    const topSession = sessionEntries[0]?.[0] ?? null;

    const colour = archetypeColour(archetypeId);
    const isPromoted = promoted[archetypeId];

    return (
        <div className="clip-bevel p-[1px]" style={{ background: `linear-gradient(135deg, ${colour}33, hsl(var(--border-soft)))` }}>
            <div className="clip-bevel bg-[hsl(var(--panel))] p-4 h-full flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-muted-lab">Archetype</div>
                        <div className="font-display font-semibold text-[13px] leading-tight mt-0.5 truncate" style={{ color: colour }}>
                            {archetypeLabel(archetypeId)}
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="font-display text-[24px] font-semibold text-white leading-none">{stats.count}</div>
                        <div className="text-[9.5px] font-mono text-muted-lab">{pct}% of losses</div>
                    </div>
                </div>

                {/* Description */}
                <p className="text-[10.5px] font-mono text-[hsl(var(--text-2))] leading-relaxed flex-1">{arch.description}</p>

                {/* Metrics grid */}
                <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-[hsl(var(--panel-2))] clip-bevel-sm p-1.5">
                        <div className="text-[8.5px] font-mono text-muted-lab uppercase">Avg R</div>
                        <div className={`font-mono text-[12px] font-semibold ${stats.avgR < 0 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--success))]"}`}>
                            {stats.avgR >= 0 ? "+" : ""}{stats.avgR}R
                        </div>
                    </div>
                    <div className="bg-[hsl(var(--panel-2))] clip-bevel-sm p-1.5">
                        <div className="text-[8.5px] font-mono text-muted-lab uppercase">Avg Sev</div>
                        <div className="font-mono text-[12px] font-semibold text-white">
                            {stats.avgSeverity != null ? stats.avgSeverity.toFixed(1) : "—"}
                        </div>
                    </div>
                    <div className="bg-[hsl(var(--panel-2))] clip-bevel-sm p-1.5">
                        <div className="text-[8.5px] font-mono text-muted-lab uppercase">N</div>
                        <Pill tone={confidenceTone(stats.sampleConfidence)} className="text-[8px] mt-0.5">
                            {safeLabel(stats.sampleConfidence)}
                        </Pill>
                    </div>
                </div>

                {/* Classification confidence + top session */}
                <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[9px] font-mono text-muted-lab">Conf:</span>
                    <Pill tone={confidenceTone(topConfTier)}>{confidenceLabel(topConfTier)}</Pill>
                    {topSession && (
                        <>
                            <span className="text-[9px] font-mono text-muted-lab ml-1">Top:</span>
                            <Pill tone="muted">{topSession}</Pill>
                        </>
                    )}
                </div>

                {/* Hypothesis + promote */}
                <div className="border-t border-[hsl(var(--border-soft))] pt-2.5 space-y-2">
                    <div className="flex items-start gap-1.5">
                        <Lightbulb className="w-3 h-3 text-[hsl(var(--accent-secondary))] shrink-0 mt-0.5" />
                        <span className="text-[10px] font-mono text-[hsl(var(--text-2))] leading-relaxed">{mainHypo}</span>
                    </div>
                    <button
                        type="button"
                        disabled={isPromoted || stats.count === 0}
                        onClick={() => onPromote(
                            archetypeId,
                            `${archetypeLabel(archetypeId)}: ${mainHypo}`,
                            `${stats.count} ${archetypeLabel(archetypeId)} losses found (${pct}% of all losses). Avg R: ${stats.avgR}R. Avg severity: ${stats.avgSeverity != null ? stats.avgSeverity.toFixed(1) : "N/A"}.`,
                            `Pattern observed in Failures Lab — ${stats.count} classified instances with ${safeLabel(stats.sampleConfidence)} sample confidence.`,
                            ["failures-lab", archetypeId],
                        )}
                        className={cn(
                            "w-full flex items-center justify-center gap-1.5 py-1.5 text-[9.5px] font-mono uppercase tracking-wider border clip-bevel-sm transition-colors",
                            isPromoted
                                ? "border-[hsl(var(--success)/0.4)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.05)] cursor-default"
                                : stats.count === 0
                                ? "border-[hsl(var(--border-soft))] text-muted-lab cursor-not-allowed opacity-40"
                                : "border-[hsl(var(--accent-secondary)/0.4)] text-[hsl(var(--accent-secondary))] hover:border-[hsl(var(--accent-secondary))] hover:bg-[hsl(var(--accent-secondary)/0.07)]",
                        )}
                    >
                        {isPromoted
                            ? <><CheckCircle className="w-3 h-3" /> Promoted to HypothesisLab</>
                            : <><Send className="w-3 h-3" /> Promote to Hypothesis</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Module ────────────────────────────────────────────────────────────────────

export function FailureDNA({ losers = [], allLosers = [], config = {} }) {
    const source = losers.length ? losers : allLosers;

    const dnaStats = useMemo(() => {
        const out = {};
        for (const arch of ARCHETYPES) {
            out[arch.id] = computeArchetypeDNAStats(source, arch.id);
        }
        return out;
    }, [source]);

    const { promoted, promote } = useHypoPromote();

    if (!source.length) {
        return (
            <NeonPanel title="DNA & Archetypes" className="m-6">
                <div className="p-10 text-center text-[11px] font-mono text-muted-lab">No failure data in current cohort</div>
            </NeonPanel>
        );
    }

    return (
        <div className="p-6 space-y-4">
            <div>
                <h2 className="font-display text-[14px] font-semibold text-white">Failure DNA & Archetypes</h2>
                <p className="text-[10.5px] font-mono text-muted-lab mt-0.5">
                    {source.length} losses classified across {ARCHETYPES.length} archetypes · promote patterns directly to HypothesisLab
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ARCHETYPES.map(arch => (
                    dnaStats[arch.id]
                        ? (
                            <ArchetypeCard
                                key={arch.id}
                                archetypeId={arch.id}
                                stats={dnaStats[arch.id]}
                                total={source.length}
                                promoted={promoted}
                                onPromote={promote}
                            />
                        ) : (
                            <div key={arch.id} className="clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--border-soft))] to-[hsl(var(--border-soft))] opacity-40">
                                <div className="clip-bevel bg-[hsl(var(--panel))] p-4">
                                    <div className="font-display text-[12px] text-[hsl(var(--text-2))]">{archetypeLabel(arch.id)}</div>
                                    <div className="text-[10px] font-mono text-muted-lab mt-1.5">0 instances in cohort</div>
                                </div>
                            </div>
                        )
                ))}
            </div>
        </div>
    );
}
