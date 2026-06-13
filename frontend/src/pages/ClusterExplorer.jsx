import React, { useMemo, useState } from "react";
import {
    Telescope, ChevronDown, ChevronRight, ArrowRight, ShieldAlert,
    CheckCircle2, AlertTriangle, Bookmark, Microscope,
} from "lucide-react";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import { useDataset, getRunDisplayName, addProjectFinding } from "@/data/store";
import { buildResearchFindingPayload } from "@/data/projectWorkflow";
import { resolveDisplayTrades } from "@/data/resolveDisplayTrades";
import { isPerformanceTrade } from "@/data/tradeClassification";
import { FAILURE_DIMENSIONS } from "@/components/lab/failures/shared/failuresDimensions";
import {
    buildClusterExplorer, selectAvailableDimensions, distanceBandDim,
    CLUSTER_TARGETS, CLUSTER_TARGET_ORDER, DEFAULT_DIMENSION_KEYS,
} from "@/data/clusterExplorer";

// CLUSTER-1 MVP — Research Cluster Explorer.
// A discovery surface that runs the guided greedy beam search (data/clusterExplorer.js)
// over the ACTIVE run's trades and shows survivors as a RANKED FEED with an EXPLAIN
// tree. It proposes candidate cohorts (hypotheses), never prescriptions. Save reuses
// the existing finding rails; cross-run validation lives in the Hypothesis Lab.

const pctR = (v) => (v == null ? "—" : `${Math.round(Number(v) * 100)}%`);
const fmtR = (v) => { const n = Number(v); return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}R` : "—"; };

const CONF_TONE = { High: "success", Medium: "info", Low: "warning", "Very Low": "muted" };
const STABILITY = {
    stable:        { label: "stable",        tone: "success", icon: CheckCircle2 },
    stable_under:  { label: "stable",        tone: "success", icon: CheckCircle2 },
    one_half_only: { label: "one half only", tone: "warning", icon: AlertTriangle },
    unstable:      { label: "unstable",      tone: "danger",  icon: AlertTriangle },
};
const PRUNE_REASON = {
    below_floor:      "sample below depth floor",
    effect_too_small: "effect below threshold",
    no_marginal_gain: "no gain over parent",
    low_confidence:   "confidence too low",
};

const predKey = (p) => (p || []).map((x) => `${x.dim}=${x.value}`).sort().join("|");

export default function ClusterExplorer() {
    const { ACTIVE_RUN, ACTIVE_PROJECT, ACTIVE_TRADE_VARIANT, getRunData } = useDataset();
    const [target, setTarget] = useState("losses");
    const [expanded, setExpanded] = useState(null);
    const [saved, setSaved] = useState({});

    const runId = ACTIVE_RUN?.id || null;
    const runData = useMemo(() => (runId && getRunData ? getRunData(runId) : null), [runId, getRunData]);
    // Variant-aware: analyse the ACTIVE trade variant (e.g. "TrigE +2"), consistent
    // with RunDetail / Strategy Map — not the bundle's base trades array.
    const resolved = useMemo(() => resolveDisplayTrades(runData, ACTIVE_TRADE_VARIANT), [runData, ACTIVE_TRADE_VARIANT]);
    const trades = resolved.trades;
    const decidedCount = useMemo(() => trades.filter((t) => isPerformanceTrade(t)).length, [trades]);
    const projectId = runData?.projectId || ACTIVE_PROJECT?.id || null;

    // Resolve the in-play dimension catalogue from the canonical FAILURE_DIMENSIONS
    // (+ local distance-at-arm), filtered to what this run actually carries.
    const dimensions = useMemo(() => {
        const catalogue = [...FAILURE_DIMENSIONS, distanceBandDim];
        return selectAvailableDimensions(trades, catalogue, { keys: DEFAULT_DIMENSION_KEYS });
    }, [trades]);

    const result = useMemo(
        () => buildClusterExplorer(trades, { target, dimensions }),
        [trades, target, dimensions],
    );

    const hasRun = !!runId && trades.length > 0;

    const prunedByParent = useMemo(() => {
        const map = new Map();
        for (const p of result.pruned || []) {
            const k = predKey(p.parentPredicate || []);
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(p);
        }
        return map;
    }, [result]);

    function saveFinding(cluster) {
        if (!projectId) return;
        const payload = buildResearchFindingPayload({
            source: "cluster_explorer",
            type: "finding",
            title: `${CLUSTER_TARGETS[target]?.label}: ${cluster.label}`,
            note: cluster.explanation,
            runId,
            sourceRunId: runId,
            metaExtra: {
                clusterTarget: target,
                predicate: cluster.predicate,
                lift: cluster.lift,
                effect: cluster.effect,
                sampleSize: cluster.sampleSize,
                confidence: cluster.confidence,
                stability: cluster.stability,
                provisional: true,
            },
        });
        addProjectFinding(projectId, payload);
        setSaved((s) => ({ ...s, [predKey(cluster.predicate)]: true }));
    }

    return (
        <div className="pb-12">
            <LabRunHero
                pageLabel="Cluster Explorer"
                title="Research Cluster Explorer"
                description="Guided search for combinations of conditions disproportionately tied to an outcome. Every row is a provisional candidate — validated only by cross-run replication (Hypothesis Lab), never a prescription."
            />

            <div className="px-6 space-y-4">
                {/* Target selector + validity summary */}
                <NeonPanel
                    title={<span className="inline-flex items-center gap-2"><Telescope className="w-3.5 h-3.5" /> Target</span>}
                    tone="primary"
                    action={hasRun && result.available ? (
                        <Pill tone="muted">{result.clusters.length} surviving · {result.evaluatedCount} tested</Pill>
                    ) : null}
                >
                    <div className="flex flex-wrap items-center gap-1.5" data-testid="cluster-target-selector">
                        {CLUSTER_TARGET_ORDER.map((key) => {
                            const active = target === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    data-testid={`cluster-target-${key}`}
                                    onClick={() => { setTarget(key); setExpanded(null); }}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-ui uppercase tracking-wider clip-bevel-sm border transition-colors ${
                                        active
                                            ? "border-[hsl(var(--accent-primary))] bg-[hsl(var(--accent-primary)/0.14)] text-white"
                                            : "border-[hsl(var(--border-mid))] text-[hsl(var(--text-2))] hover:text-white hover:border-[hsl(var(--accent-primary)/0.5)]"
                                    }`}
                                >
                                    {CLUSTER_TARGETS[key].label}
                                </button>
                            );
                        })}
                    </div>
                    {hasRun && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10.5px] text-muted-lab" data-testid="cluster-variant-summary">
                            <Pill tone="info">Variant: {resolved.selectedVariantLabel || "Baseline"} · {decidedCount} decided</Pill>
                            {result.available && <Pill tone="muted">baseline {pctR(result.baseline.rate)} · n={result.baseline.n}</Pill>}
                            {result.available && <Pill tone="muted">FDR q≤{result.fdr.q} · {result.fdr.discoveries} discoveries</Pill>}
                            {result.available && <Pill tone="muted">dims: {result.dimensionsUsed.map((d) => d.label).join(", ") || "—"}</Pill>}
                        </div>
                    )}
                </NeonPanel>

                {!hasRun ? (
                    <NeonPanel title="No Active Run">
                        <div className="py-6 text-center text-[12px] text-[hsl(var(--text-2))]">
                            Import or select a run to search for clusters.
                        </div>
                    </NeonPanel>
                ) : !result.available ? (
                    <NeonPanel title="Not enough data">
                        <div className="py-6 text-center text-[12px] text-[hsl(var(--text-2))]">{result.reason}</div>
                    </NeonPanel>
                ) : (
                    <NeonPanel
                        title={<span className="inline-flex items-center gap-2"><Microscope className="w-3.5 h-3.5" /> Discovery Feed — {CLUSTER_TARGETS[target].label}</span>}
                        tone={target === "winners" ? "success" : "danger"}
                        action={<Pill tone="muted">{result.clusters.length}</Pill>}
                    >
                        <p className="text-[10.5px] text-muted-lab italic mb-3">
                            Ranked by stability, then shrinkage-adjusted lift. Each survivor cleared a depth-scaled
                            sample floor, an effect-size gate, a parent-conditional gain test, and Benjamini-Hochberg
                            FDR correction. Provisional — confirm across runs before acting.
                        </p>

                        {result.clusters.length === 0 ? (
                            <div className="py-6 text-center border border-dashed border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.18)] clip-bevel-sm" data-testid="cluster-feed-empty">
                                <div className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">No surviving clusters</div>
                                <div className="mt-1 text-[11px] text-[hsl(var(--text-2))]">
                                    Nothing cleared the validity gates for this target — no disproportionate cohort on this run.
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2" data-testid="cluster-feed">
                                {result.clusters.map((c) => {
                                    const k = predKey(c.predicate);
                                    const isOpen = expanded === k;
                                    const stab = STABILITY[c.stability] || STABILITY.unstable;
                                    const StabIcon = stab.icon;
                                    // pruned siblings (same parent) + pruned children (this cohort as parent)
                                    const siblings = (prunedByParent.get(predKey(c.parentPredicate || [])) || []).filter((p) => predKey(p.predicate) !== k);
                                    const children = prunedByParent.get(k) || [];
                                    return (
                                        <div key={k} className="border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.30)] clip-bevel-sm" data-testid={`cluster-row-${k}`}>
                                            <div className="flex items-center gap-3 p-3">
                                                <button type="button" onClick={() => setExpanded(isOpen ? null : k)} className="shrink-0 text-muted-lab hover:text-white" aria-label="explain">
                                                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                </button>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[12.5px] font-semibold text-[hsl(var(--text-1))]">{c.label}</span>
                                                        <Pill tone="muted">depth {c.depth}</Pill>
                                                    </div>
                                                    <div className="text-[10.5px] font-num tabular-nums text-[hsl(var(--text-2))] mt-0.5">
                                                        {pctR(c.effect)} {CLUSTER_TARGETS[target].label.toLowerCase()} · lift {c.lift}× · n={c.sampleSize} · avg {fmtR(c.avgR)}
                                                        {c.depth >= 2 && <span className="text-muted-lab"> · +{Math.round(c.marginalGain * 100)}pp vs parent “{(c.parentPredicate || []).map((p) => p.value).join(" · ")}”</span>}
                                                        {target === "breaches" ? null : <span className="text-muted-lab"> · breach {c.breachRate}%</span>}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-1.5">
                                                    <Pill tone={CONF_TONE[c.confidence] || "muted"}>{c.confidence}</Pill>
                                                    <span className={`inline-flex items-center gap-1 text-[10px] text-[hsl(var(--${stab.tone === "success" ? "success" : stab.tone === "warning" ? "warning" : "danger"}))]`}>
                                                        <StabIcon className="w-3 h-3" /> {stab.label}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        disabled={!projectId || saved[k]}
                                                        onClick={() => saveFinding(c)}
                                                        title={projectId ? "Save as finding" : "Link this run to a project to save"}
                                                        className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-ui uppercase tracking-wider clip-bevel-sm border transition-colors ${
                                                            saved[k]
                                                                ? "border-[hsl(var(--success))] text-[hsl(var(--success))]"
                                                                : projectId
                                                                    ? "border-[hsl(var(--accent-secondary))] text-[hsl(var(--accent-secondary))] hover:bg-[hsl(var(--accent-secondary)/0.12)]"
                                                                    : "border-[hsl(var(--border-mid))] text-muted-lab cursor-not-allowed"
                                                        }`}
                                                    >
                                                        <Bookmark className="w-3 h-3" /> {saved[k] ? "Saved" : "Save"}
                                                    </button>
                                                </div>
                                            </div>

                                            {isOpen && (
                                                <div className="px-3 pb-3 pt-1 border-t border-[hsl(var(--border-soft))] space-y-2" data-testid={`cluster-explain-${k}`}>
                                                    <div className="text-[10.5px] text-[hsl(var(--text-2))] leading-relaxed">{c.explanation}</div>
                                                    <div className="text-[10px] text-muted-lab">
                                                        p={c.pValue} (FDR-passed) · shrunk lift {c.shrunkLift}× · stability: {c.stability}
                                                    </div>
                                                    {/* kept path */}
                                                    <div className="text-[10px] font-ui uppercase tracking-wider text-muted-lab pt-1">Expansion trail</div>
                                                    <div className="text-[11px] text-[hsl(var(--text-1))]">
                                                        {c.predicate.map((p, i) => (
                                                            <span key={p.dim}>
                                                                {i > 0 && <span className="text-muted-lab"> → </span>}
                                                                <span className="text-[hsl(var(--success))]">{p.label}={p.value}</span>
                                                            </span>
                                                        ))}
                                                        <span className="text-[hsl(var(--success))] ml-2">✓ kept</span>
                                                    </div>
                                                    {/* pruned siblings + children */}
                                                    {(siblings.length > 0 || children.length > 0) && (
                                                        <div className="space-y-0.5 pt-1">
                                                            {[...children, ...siblings].slice(0, 8).map((p, i) => (
                                                                <div key={i} className="text-[10px] text-muted-lab">
                                                                    <span className="text-[hsl(var(--danger))]">✕ pruned</span>{" "}
                                                                    {(p.predicate || []).map((x) => x.value).join(" · ")}
                                                                    <span className="text-muted-lab"> — {PRUNE_REASON[p.reason] || p.reason}{p.detail ? ` (${p.detail})` : ""}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </NeonPanel>
                )}
            </div>
        </div>
    );
}
