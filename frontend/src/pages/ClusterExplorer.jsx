import React, { useMemo, useState } from "react";
import {
    Telescope, ChevronDown, ChevronRight, ArrowRight, ShieldAlert,
    CheckCircle2, AlertTriangle, Bookmark, Microscope,
} from "lucide-react";
import { LabRunHero } from "@/components/lab/LabRunHero";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill } from "@/components/lab/DataTable";
import ResearchResultViewBanner from "@/components/lab/ResearchResultViewBanner";
import { buildBannerRunIdentity } from "@/components/lab/researchBanner/bannerRun";
import { useDataset, getRunDisplayName, addProjectFinding } from "@/data/store";
import { useRunVariant } from "@/data/useRunVariant";
import { buildResearchFindingPayload } from "@/data/projectWorkflow";
import { isPerformanceTrade, isWinTrade, isLossTrade } from "@/data/tradeClassification";
import { computeConfidence } from "@/data/researchSignals";
import { FAILURE_DIMENSIONS } from "@/components/lab/failures/shared/failuresDimensions";
import {
    buildClusterExplorer, selectAvailableDimensions, distanceBandDim,
    CLUSTER_TARGETS, CLUSTER_TARGET_ORDER, DEFAULT_DIMENSION_KEYS,
    LIFT_MIN, SPLIT_MIN_PER_HALF,
} from "@/data/clusterExplorer";
import { scoreNearMisses, INTEREST_LABELS } from "@/data/clusterPrioritisation";

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
// Targets that require post-stop / excursion export fields. When the run lacks them
// the target is structurally inert (0 events), so we explain that rather than show 0.
const EXCURSION_TARGETS = new Set(["give_backs", "false_losers", "round_trips"]);
// Near-miss sort: closest-to-surviving reason first (passed floor + had real effect),
// then highest reconstructed lift, then largest sample.
const REASON_RANK = { effect_too_small: 0, no_marginal_gain: 1, low_confidence: 2, below_floor: 3 };

const predKey = (p) => (p || []).map((x) => `${x.dim}=${x.value}`).sort().join("|");

// Interest chip chrome (CLUSTER-2B research triage — never validation).
const INTEREST_TONE = { high: "warning", investigate: "info", weak: "muted" };
const THEME_TONE = { frequent: "info", recurring: "muted", occasional: "muted" };

// Replicated temporal split-half stability (mirrors clusterExplorer's internal
// stabilityFlag, which isn't exported). Pure; used only to enrich rejected cohorts
// for triage — it does not feed any statistical gate.
function splitHalfStability(cohortTrades, tgt, baseRate, minHalf = SPLIT_MIN_PER_HALF) {
    const ordered = [...cohortTrades].sort((a, b) => String(a?.entry ?? "").localeCompare(String(b?.entry ?? "")));
    const mid = Math.floor(ordered.length / 2);
    const halves = [ordered.slice(0, mid), ordered.slice(mid)];
    const dirs = halves.map((h) => {
        const u = h.filter((t) => tgt.universe(t));
        if (u.length < minHalf) return null;
        const r = u.filter((t) => tgt.hit(t)).length / u.length;
        return r > baseRate ? "over" : "under";
    });
    if (dirs[0] == null || dirs[1] == null) return "unstable";
    if (dirs[0] === dirs[1]) return dirs[0] === "over" ? "stable" : "stable_under";
    return "one_half_only";
}

export default function ClusterExplorer() {
    const { ACTIVE_RUN, ACTIVE_PROJECT, getRunData } = useDataset();
    const [target, setTarget] = useState("losses");
    const [expanded, setExpanded] = useState(null);
    const [saved, setSaved] = useState({});

    const runId = ACTIVE_RUN?.id || null;
    const runData = useMemo(() => (runId && getRunData ? getRunData(runId) : null), [runId, getRunData]);
    // CANONICAL universe — the SAME object Run Workspace analyses (useRunVariant →
    // useTradeUniverse → resolveTradeUniverse, scenario-aware + run-scoped). Cluster
    // Explorer previously resolved its own trades via resolveDisplayTrades, which
    // could disagree with Run Detail AND with this page's own banner (TRADE-UNIVERSE-
    // DIVERGENCE-AUDIT-1.md, Phase 1). `trades` is now bound to `universe.trades`, so
    // the banner and the analysed set are guaranteed identical.
    const { universe } = useRunVariant(runId);
    const trades = useMemo(() => (Array.isArray(universe?.trades) ? universe.trades : []), [universe]);
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

    // ── CLUSTER-2A: "why empty" diagnostics (UI-only; no engine change) ──────────
    // Accessor lookup for the in-play dimensions, used to reconstruct pruned-cohort
    // stats the engine never exposed numerically.
    const accByKey = useMemo(() => {
        const m = {};
        for (const d of dimensions) m[d.key] = d.accessor;
        return m;
    }, [dimensions]);

    // Gate funnel derived purely from the engine's existing outputs (pruned reasons +
    // evaluatedCount + clusters). No statistical change — just counting.
    const funnel = useMemo(() => {
        const r = { below_floor: 0, effect_too_small: 0, no_marginal_gain: 0, low_confidence: 0 };
        for (const p of result.pruned || []) if (r[p.reason] != null) r[p.reason] += 1;
        const tested = result.evaluatedCount || 0;
        const afterEffect = tested - r.effect_too_small;
        const afterGain = afterEffect - r.no_marginal_gain;
        const afterConf = afterGain - r.low_confidence;
        const final = result.clusters.length;
        return {
            tested, seeded: tested + r.below_floor, final,
            below_floor: r.below_floor, effect_too_small: r.effect_too_small,
            no_marginal_gain: r.no_marginal_gain, low_confidence: r.low_confidence,
            fdr: Math.max(0, afterConf - final),
        };
    }, [result]);

    // Reconstruct n / event-rate / lift for the closest rejected candidates from the
    // run's trades + dimension accessors + the selected target's predicates. The engine
    // only emitted predicate/reason, so this re-derivation lives here (read-only).
    const nearMisses = useMemo(() => {
        if (!result.available || result.clusters.length > 0) return [];
        const tgt = CLUSTER_TARGETS[target];
        if (!tgt) return [];
        const baseRate = result.baseline?.rate || 0;
        const out = [];
        for (const p of result.pruned || []) {
            const pred = p.predicate || [];
            if (!pred.length) continue;
            const cohort = trades.filter((t) => pred.every((x) => {
                const acc = accByKey[x.dim];
                return acc && String(acc(t)) === String(x.value);
            }));
            const uni = cohort.filter((t) => tgt.universe(t));
            const n = uni.length;
            const rate = n ? uni.filter((t) => tgt.hit(t)).length / n : 0;
            // Enrich with confidence + stability (CLUSTER-2B triage inputs), reusing the
            // exact engine machinery (computeConfidence + replicated split-half).
            const perf = cohort.filter((t) => isPerformanceTrade(t));
            const wins = perf.filter((t) => isWinTrade(t)).length;
            const losses = perf.filter((t) => isLossTrade(t)).length;
            const avgR = perf.length ? perf.reduce((s, t) => s + (Number(t?.r ?? t?.netR ?? t?.net_r) || 0), 0) / perf.length : 0;
            out.push({
                predicate: pred,
                label: pred.map((x) => x.value).join(" · "),
                parent: (p.parentPredicate || []).map((x) => x.value).join(" · ") || "—",
                n, rate, lift: baseRate ? rate / baseRate : 0, reason: p.reason,
                confidence: computeConfidence({ count: cohort.length, wins, losses, avgR }).level,
                stability: splitHalfStability(cohort, tgt, baseRate),
            });
        }
        out.sort((a, b) => (REASON_RANK[a.reason] - REASON_RANK[b.reason]) || (b.lift - a.lift) || (b.n - a.n));
        return out.slice(0, 10);
    }, [result, trades, accByKey, target]);

    // CLUSTER-2B: research-triage ranking + recurring themes (recurrence excluded from
    // the per-row score). Pure read-over of the reconstructed near-misses.
    const prioritised = useMemo(() => scoreNearMisses(nearMisses, { liftMin: LIFT_MIN }), [nearMisses]);

    // An excursion-dependent target with zero events on this run/variant = missing data.
    const missingExcursion = EXCURSION_TARGETS.has(target) && result.available && (result.baseline?.targetN ?? 0) === 0;

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

            {runId && (
                <div className="px-6 mt-2 mb-3">
                    <ResearchResultViewBanner universe={universe} run={buildBannerRunIdentity(ACTIVE_RUN)} />
                </div>
            )}

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
                            <Pill tone="info">Variant: {universe?.label || "Baseline"} · {decidedCount} decided</Pill>
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
                            <div className="space-y-3" data-testid="cluster-why-empty">
                                {missingExcursion && (
                                    <div className="py-3 px-3 border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.24)] clip-bevel-sm" data-testid="cluster-missing-fields">
                                        <div className="inline-flex items-center gap-1.5 text-[11px] text-[hsl(var(--warning))]">
                                            <AlertTriangle className="w-3.5 h-3.5" /> This target needs excursion data
                                        </div>
                                        <div className="mt-1 text-[10.5px] text-[hsl(var(--text-2))] leading-relaxed">
                                            “{CLUSTER_TARGETS[target].label}” needs post-stop / excursion fields such as <code>mfe_r</code> and{" "}
                                            <code>post_stop_mfe_r</code>. This run/variant doesn’t appear to contain enough of that data
                                            (0 such events found), so the target can’t be evaluated.
                                        </div>
                                    </div>
                                )}

                                {result.evaluatedCount > 0 ? (
                                    <>
                                        <div className="py-4 px-3 border border-dashed border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.18)] clip-bevel-sm">
                                            <div className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">No surviving clusters — here’s why</div>
                                            <div className="mt-1 text-[11px] text-[hsl(var(--text-2))] leading-relaxed">
                                                The engine evaluated <span className="font-num">{funnel.tested}</span> candidate cohort{funnel.tested === 1 ? "" : "s"} but
                                                none cleared the statistical gates. This does <span className="italic">not</span> mean there are no patterns — it means
                                                no pattern cleared the current evidence threshold on this run/variant.
                                                {target === "losses" && " For common targets like Losers, lift has limited headroom when the baseline loss rate is already high."}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" data-testid="cluster-funnel">
                                            <FunnelStat label="Seeded" value={funnel.seeded} />
                                            <FunnelStat label="Below floor" value={`−${funnel.below_floor}`} />
                                            <FunnelStat label="Failed effect gate" value={`−${funnel.effect_too_small}`} />
                                            <FunnelStat label="No gain vs parent" value={`−${funnel.no_marginal_gain}`} />
                                            <FunnelStat label="Low confidence" value={`−${funnel.low_confidence}`} />
                                            <FunnelStat label="FDR rejected" value={`−${funnel.fdr}`} />
                                            <FunnelStat label="Survivors" value={funnel.final} tone="danger" />
                                        </div>

                                        {prioritised.themes.length > 0 && (
                                            <div data-testid="cluster-themes" className="py-3 px-3 border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.24)] clip-bevel-sm">
                                                <div className="text-[10px] font-ui uppercase tracking-wider text-muted-lab mb-1.5">Recurring themes — what keeps showing up</div>
                                                <div className="space-y-1">
                                                    {prioritised.themes.map((th) => (
                                                        <div key={`${th.dim}=${th.factor}`} className="flex flex-wrap items-center gap-2 text-[11px]">
                                                            <span className="font-semibold text-[hsl(var(--text-1))]">{th.factor}</span>
                                                            <span className="text-muted-lab font-num">appears in {th.count}/{th.total} rejected · avg lift {th.avgLift}× · avg n {th.avgN}</span>
                                                            <Pill tone={THEME_TONE[th.status] || "muted"}>{th.status}</Pill>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-2 text-[10px] text-muted-lab italic leading-relaxed">
                                                    ⚠ Related cohorts share trades (nested in the search) — these are recurrences, not independent
                                                    confirmations. A curiosity prompt for what to investigate next, not evidence.
                                                </div>
                                            </div>
                                        )}

                                        {prioritised.scored.length > 0 && (
                                            <div data-testid="cluster-near-misses">
                                                <div className="text-[10px] font-ui uppercase tracking-wider text-muted-lab mb-1">Closest candidates — research triage (not findings)</div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-[10.5px] font-num tabular-nums">
                                                        <thead>
                                                            <tr className="text-left text-muted-lab">
                                                                <th className="py-1 pr-2 font-ui">Interest</th>
                                                                <th className="py-1 px-2 font-ui">Cluster</th>
                                                                <th className="py-1 px-2">n</th>
                                                                <th className="py-1 px-2">rate</th>
                                                                <th className="py-1 px-2">base</th>
                                                                <th className="py-1 px-2">lift</th>
                                                                <th className="py-1 px-2 font-ui">parent</th>
                                                                <th className="py-1 pl-2 font-ui">reason</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {prioritised.scored.map((m, i) => (
                                                                <tr key={i} className="border-t border-[hsl(var(--border-soft))]">
                                                                    <td className="py-1 pr-2">
                                                                        <Pill tone={INTEREST_TONE[m.interest] || "muted"}>
                                                                            {INTEREST_LABELS[m.interest].emoji} {INTEREST_LABELS[m.interest].label}
                                                                        </Pill>
                                                                    </td>
                                                                    <td className="py-1 px-2 text-[hsl(var(--text-1))]">{m.label}</td>
                                                                    <td className="py-1 px-2">{m.n}</td>
                                                                    <td className="py-1 px-2">{pctR(m.rate)}</td>
                                                                    <td className="py-1 px-2 text-muted-lab">{pctR(result.baseline.rate)}</td>
                                                                    <td className="py-1 px-2">{m.lift.toFixed(2)}×</td>
                                                                    <td className="py-1 px-2 text-muted-lab">{m.parent}</td>
                                                                    <td className="py-1 pl-2 text-muted-lab">{PRUNE_REASON[m.reason] || m.reason}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div className="mt-1.5 text-[10px] text-muted-lab italic">
                                                    Ranked by a research-interest heuristic (lift closeness · sample · confidence · stability) —
                                                    not evidence. Confirm across runs in the Hypothesis Lab.
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="py-6 text-center border border-dashed border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.18)] clip-bevel-sm" data-testid="cluster-feed-empty">
                                        <div className="font-ui text-[10px] uppercase tracking-[0.14em] text-muted-lab">No candidates to evaluate</div>
                                        <div className="mt-1 text-[11px] text-[hsl(var(--text-2))]">
                                            No single cohort had enough trades to test on this run/variant — needs a larger sample.
                                        </div>
                                    </div>
                                )}
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

function FunnelStat({ label, value, tone }) {
    return (
        <div className="px-2 py-1.5 border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.24)] clip-bevel-sm">
            <div className="text-[9px] font-ui uppercase tracking-[0.12em] text-muted-lab leading-tight">{label}</div>
            <div className={`mt-0.5 text-[13px] font-num tabular-nums ${tone === "danger" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text-1))]"}`}>{value}</div>
        </div>
    );
}
