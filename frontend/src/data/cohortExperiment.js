// cohortExperiment.js — Cohort Experiment Engine (Phase 2A, EXACT layer only).
//
// Compose EXACT, in-sample experiments on a cohort's trades and recompute results
// WITHOUT a backend run. Phase 2A supports two experiment types — both EXACT:
//   • exclude — remove trades matching a dimension cohort (membership filtering)
//   • tp      — re-take-profit at a target level (per-trade function of mfe_r)
// Exclusions apply FIRST; the TP retarget applies to the survivors. Because
// exclusion is a membership test and re-targeting is a per-trade function of that
// trade's own mfe_r, the two compose exactly and commutatively. BE / Risk-Reduction
// (BOUND) and entry-threshold (SPECULATIVE) are deliberately NOT here.
//
// Pure. No mutation (new arrays via slice/filter; trade objects never written).
// Reuses the existing truth-layer + economics helpers — no new P&L math.

import { metricsOf, simulateRemoval } from "./cohortFilterSimulator";
import { resolveDimension } from "./cohortDimensions";
import { cohortTargetEconomics, TARGET_SUITABILITY_LEVELS } from "./sessionResults";

export const EXPERIMENT_GRADES = Object.freeze({ EXACT: "EXACT", BOUND: "BOUND", SPECULATIVE: "SPECULATIVE" });
export const targetLevels = TARGET_SUITABILITY_LEVELS;

const round2 = (v) => Number(Number(v).toFixed(2));

// metricsOf → common cohort-summary shape (metricsOf calls it `profitFactor`).
function asMetrics(m) {
    return {
        trades: m.trades, winners: m.winners, losers: m.losers,
        netR: m.netR, pf: m.profitFactor, winRate: m.winRate,
        expectancy: m.trades ? round2(m.netR / m.trades) : null,
    };
}

// AND predicate over [{dim,value}] using the registry accessors (string-equality).
// Incomplete / unresolvable entries are dropped; an all-empty dim list → null
// (matches nothing → a no-op exclusion).
function predicateFromDims(dims) {
    const resolved = (Array.isArray(dims) ? dims : [])
        .map((d) => ({ reg: resolveDimension(d?.dim), value: d?.value }))
        .filter((d) => d.reg && d.value != null && d.value !== "");
    if (!resolved.length) return null;
    return (t) => resolved.every(({ reg, value }) => { const v = reg.accessor(t); return v != null && String(v) === String(value); });
}

function excludeLabel(dims) {
    const parts = (Array.isArray(dims) ? dims : [])
        .map((d) => { const reg = resolveDimension(d?.dim); return `${reg?.label || d?.dim} ${d?.value}`; });
    return parts.length ? `Exclude ${parts.join(" × ")}` : "Exclude (none)";
}

// ── Experiment factories ──────────────────────────────────────────────────────
export function buildExcludeExperiment(dims, label) {
    return { type: "exclude", grade: EXPERIMENT_GRADES.EXACT, params: { dims: Array.isArray(dims) ? dims : [] }, label: label || excludeLabel(dims) };
}
export function buildTargetExperiment(target, label) {
    const t = Number(target);
    return { type: "tp", grade: EXPERIMENT_GRADES.EXACT, params: { target: t }, label: label || `TP ${t}R` };
}

// ── EXACT building blocks ─────────────────────────────────────────────────────
// Apply every exclusion experiment (membership filtering). Returns the kept trades.
export function applyExactExclusions(trades, experiments) {
    let kept = Array.isArray(trades) ? trades.slice() : [];
    for (const e of (Array.isArray(experiments) ? experiments : [])) {
        if (e?.type !== "exclude") continue;
        const pred = predicateFromDims(e.params?.dims);
        if (!pred) continue;
        kept = kept.filter((t) => !pred(t));
    }
    return kept;
}

// Exact TP retarget of a trade set → a metrics-shaped "after" + the economics row.
// Reuses cohortTargetEconomics (handles costs + holds news-flatten at actual).
export function retargetTradesExact(trades, target, ctx = {}) {
    const list = Array.isArray(trades) ? trades : [];
    const econ = cohortTargetEconomics(list, ctx.currentTargetLabel ?? null, TARGET_SUITABILITY_LEVELS);
    const row = econ.levels.find((l) => l.level === Number(target)) || null;
    if (!row) return { available: false, target: Number(target), econ };
    const after = {
        trades: list.length,                       // re-targeting keeps the fill set
        winners: row.estW,
        losers: row.estL,
        netR: row.estNetR,
        pf: row.estPF,                             // null ⇒ no losing R (∞ upstream)
        winRate: row.estWR,
        expectancy: list.length ? round2((row.estNetR ?? 0) / list.length) : null,
    };
    return {
        available: row.estNetR != null,
        target: Number(target),
        estW: row.estW, estL: row.estL, estWR: row.estWR, estPF: row.estPF, estNetR: row.estNetR,
        deltaCurrent: row.deltaCurrent, confidence: row.confidence,
        decided: econ.decided, coverageWithMFE: econ.coverage?.withMFE ?? 0,
        after,
    };
}

// ── Stack runner ──────────────────────────────────────────────────────────────
// Exclusions first (each its own step), then the LAST tp experiment on the
// survivors (earlier tp experiments are ignored deterministically). Combined grade
// is EXACT for this exact-only stack.
export function runExperimentStack(cohortTrades, experiments, ctx = {}) {
    const list = Array.isArray(cohortTrades) ? cohortTrades : [];
    const exps = Array.isArray(experiments) ? experiments : [];
    const baseline = asMetrics(metricsOf(list));

    const steps = [];
    let current = list.slice();

    for (const e of exps) {
        if (e?.type !== "exclude") continue;
        const before = asMetrics(metricsOf(current));
        const pred = predicateFromDims(e.params?.dims);
        if (!pred) {
            steps.push({ type: "exclude", label: e.label, grade: EXPERIMENT_GRADES.EXACT, before, after: before, deltaNetR: 0, result: { tradesRemoved: 0 } });
            continue;
        }
        const sim = simulateRemoval(current, pred);
        current = current.filter((t) => !pred(t));
        const after = asMetrics(metricsOf(current));
        steps.push({
            type: "exclude", label: e.label, grade: EXPERIMENT_GRADES.EXACT,
            before, after, deltaNetR: round2(after.netR - before.netR),
            result: {
                tradesRemoved: sim.tradesRemoved, winnersRemoved: sim.winnersRemoved, losersRemoved: sim.losersRemoved,
                lossRSaved: sim.lossRRemoved, winnerRLost: sim.winnerRRemoved,
            },
        });
    }

    const activeTrades = current; // post-exclusion fill set

    const tps = exps.filter((e) => e?.type === "tp");
    let tpStep = null;
    if (tps.length) {
        const tp = tps[tps.length - 1];                 // last TP wins
        const before = asMetrics(metricsOf(activeTrades));
        const rt = retargetTradesExact(activeTrades, tp.params?.target, ctx);
        tpStep = {
            type: "tp", label: tp.label, grade: EXPERIMENT_GRADES.EXACT,
            before,
            after: rt.available ? rt.after : before,
            deltaNetR: rt.available ? round2((rt.after.netR ?? 0) - before.netR) : 0,
            result: rt,
            ignoredPriorTp: tps.length - 1,
        };
        steps.push(tpStep);
    }

    const after = (tpStep && tpStep.result.available) ? tpStep.after : asMetrics(metricsOf(activeTrades));
    return {
        baseline,
        activeTrades,
        steps,
        combined: {
            grade: EXPERIMENT_GRADES.EXACT,
            before: baseline,
            after,
            deltaNetR: round2((after.netR ?? 0) - baseline.netR),
            tradesBefore: baseline.trades,
            tradesAfter: activeTrades.length,
        },
    };
}
