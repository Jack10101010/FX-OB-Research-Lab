/**
 * Validation for the PURE Result-View resolution logic that backs useRunVariant
 * (runVariantResolve.js). No React / store / tradeUniverse in the import graph,
 * so this runs under plain node.
 *
 * Run: node src/data/__validation__/useRunVariant.validate.mjs
 *
 * The React hook itself (useRunVariant) and the derivePrimaryResultView wrapper
 * are covered by the Babel transpile smoke-check + host QA; here we lock the new
 * adoption / isolation rules I authored.
 */

import {
    resolveResultViewFrom,
    normalizeDefaultView,
    applyScenarioPatchLayerSafety,
    BASELINE_VIEW,
} from "../runVariantResolve.js";

let pass = 0;
let fail = 0;
function eq(name, a, b) {
    const ok = JSON.stringify(a) === JSON.stringify(b);
    if (ok) { pass += 1; }
    else { fail += 1; console.error(`  ✗ ${name}\n      got  ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`); }
}

const RUN = "run_A";
// A stand-in for the config-intent-aware default (what derivePrimaryResultView
// would yield for a triggered-edge run). resolveResultViewFrom must return THIS
// whenever the scenario does not authoritatively target the run.
const TE_DEFAULT = { family: "triggered_edge", threshold: 50, fillMode: "next", directionalStorageKey: null };

// ── normalizeDefaultView ────────────────────────────────────────────────────────
eq("normalize(null) → baseline shape",
    normalizeDefaultView(null),
    { family: "baseline", threshold: null, fillMode: null, directionalStorageKey: null, layers: [] });
eq("BASELINE_VIEW shape is stable", BASELINE_VIEW,
    { family: "baseline", threshold: null, fillMode: null, directionalStorageKey: null, layers: [] });
eq("normalize fills missing fields with null",
    normalizeDefaultView({ family: "penetration", threshold: 25 }),
    { family: "penetration", threshold: 25, fillMode: null, directionalStorageKey: null, layers: [] });

// ── Adopt the store scenario when it targets this run ───────────────────────────
eq("scenario targets run (triggered_edge) → adopt scenario, not default",
    resolveResultViewFrom(
        { runId: RUN, family: "triggered_edge", threshold: 25, fillMode: "same" },
        RUN, TE_DEFAULT),
    { family: "triggered_edge", threshold: 25, fillMode: "same", directionalStorageKey: null, layers: [] });

eq("explicit baseline for this run → adopt baseline (sticks, does NOT re-derive)",
    resolveResultViewFrom({ runId: RUN, family: "baseline" }, RUN, TE_DEFAULT),
    { family: "baseline", threshold: null, fillMode: null, directionalStorageKey: null, layers: [] });

eq("directional scenario round-trips directionalStorageKey",
    resolveResultViewFrom(
        { runId: RUN, family: "directional", directionalStorageKey: "scn__longs_only" },
        RUN, TE_DEFAULT),
    { family: "directional", threshold: null, fillMode: null, directionalStorageKey: "scn__longs_only", layers: [] });

// ── PROTECTION-LAYER Phase 2 — layers carry + safety ────────────────────────────
const BE_LAYER = { type: "break_even", mode: "selective", params: { beScenarioKey: "be_wick_1p00R" }, filters: { structures: ["choch"] }, exploratory: true };

eq("protected scenario for this run → layers carried through",
    resolveResultViewFrom({ runId: RUN, family: "triggered_edge", threshold: 25, fillMode: "d2", layers: [BE_LAYER] }, RUN, TE_DEFAULT),
    { family: "triggered_edge", threshold: 25, fillMode: "d2", directionalStorageKey: null, layers: [BE_LAYER] });

{
    const r = applyScenarioPatchLayerSafety({ runId: RUN, family: "baseline", layers: [] }, { family: "triggered_edge", threshold: 25, fillMode: "d2", layers: [BE_LAYER] });
    eq("Open-as-result-view: base view fields applied",
        { runId: r.runId, family: r.family, threshold: r.threshold, fillMode: r.fillMode }, { runId: RUN, family: "triggered_edge", threshold: 25, fillMode: "d2" });
    eq("Open-as-result-view: layers set together are preserved", r.layers, [BE_LAYER]);
}

eq("changing base entry view WITHOUT layers clears stale layers",
    applyScenarioPatchLayerSafety({ runId: RUN, family: "triggered_edge", threshold: 25, fillMode: "d2", layers: [BE_LAYER] }, { family: "penetration", threshold: 10 }).layers,
    []);

eq("orthogonal change (positionVariant) keeps layers",
    applyScenarioPatchLayerSafety({ runId: RUN, family: "triggered_edge", layers: [BE_LAYER] }, { positionVariant: "single_position" }).layers,
    [BE_LAYER]);

eq("explicit clear via layers:[] returns to base universe",
    applyScenarioPatchLayerSafety({ runId: RUN, family: "triggered_edge", layers: [BE_LAYER] }, { layers: [] }).layers,
    []);

eq("protection sugar promotes to layers[] and strips protection key",
    applyScenarioPatchLayerSafety({ runId: RUN, family: "triggered_edge", layers: [] }, { protection: BE_LAYER }),
    { runId: RUN, family: "triggered_edge", layers: [BE_LAYER] });

eq("invalid layers are sanitized out",
    applyScenarioPatchLayerSafety({ layers: [] }, { layers: [BE_LAYER, { nope: 1 }, null] }).layers,
    [BE_LAYER]);

eq("old scenario with no layers key → layers default to []",
    applyScenarioPatchLayerSafety({ runId: RUN, family: "triggered_edge" }, { threshold: 25, layers: undefined }).layers,
    []);

// ── Fall back to the supplied default otherwise (isolation preserved) ───────────
eq("scenario for a DIFFERENT run → ignored, return default [isolation]",
    resolveResultViewFrom(
        { runId: "other_run", family: "penetration", threshold: 10 }, RUN, TE_DEFAULT),
    TE_DEFAULT);

eq("scenario with null family (fresh/unset) → return default [req #5]",
    resolveResultViewFrom({ runId: RUN, family: null }, RUN, TE_DEFAULT),
    TE_DEFAULT);

eq("null scenario → return default",
    resolveResultViewFrom(null, RUN, TE_DEFAULT),
    TE_DEFAULT);

eq("default is returned by reference (no mutation)",
    resolveResultViewFrom(null, RUN, TE_DEFAULT) === TE_DEFAULT, true);

// ── Summary ─────────────────────────────────────────────────────────────────────
console.log(`\nuseRunVariant / runVariantResolve pure-logic validation: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
