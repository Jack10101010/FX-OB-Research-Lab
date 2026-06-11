// Phase 13 — preview composer parity validation.
//
// Asserts that the SINGLE composer build path (composePreviewBundle) emits all the
// metadata the unified drawer preview card reads, for every case the four former
// single-kind blocks used to cover:
//   cost-only · filter-only · FFT-only · RR-only · unavailable FFT · unavailable RR · multi-stage
//
// Loads the REAL composer + transform modules via a babel require-shim (same harness
// style as data/__validation__/filterSimulator.validate.mjs). Only the three leaf
// `@/` utilities are shimmed; all Master Controls transform code is the real source.
//
// Run from frontend/ (Node ≥ 18 ESM):
//   node src/components/masterControls/__validation__/previewComposer.parity.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const MC = "src/components/masterControls";

// ── module loader (transform ESM source → CJS, run with a custom require) ──────
const cache = new Map();
function loadCjs(absPath, requireShim) {
    if (cache.has(absPath)) return cache.get(absPath);
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const module = { exports: {} };
    cache.set(absPath, module.exports);
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(requireShim, module, module.exports);
    cache.set(absPath, module.exports);
    return module.exports;
}

// ── shims for the three leaf @/ utilities (only existence + faithful summaries) ─
function summarizeTradeSanity(trades) {
    const list = Array.isArray(trades) ? trades : [];
    let net = 0, wins = 0, losses = 0, peak = 0, run = 0, maxDd = 0;
    for (const t of list) {
        const r = Number(t.r) || 0;
        net += r;
        if (r > 0) wins++; else if (r < 0) losses++;
        run += r; if (run > peak) peak = run;
        const dd = run - peak; if (dd < maxDd) maxDd = dd;
    }
    const decided = wins + losses;
    return {
        netRPerformance: net,
        expectancy: list.length ? net / list.length : null,
        maxDrawdownR: maxDd,
        wins, losses,
        winRate: decided ? wins / decided : null,
    };
}
const tradeClassificationShim = {
    summarizeTradeSanity,
    classifyTrade: (t) => ((Number(t?.r) || 0) > 0 ? "win" : "loss"),
    PERFORMANCE_CATEGORIES: new Set(["win", "loss"]),
};
const configTranslatorShim = {
    selectedAllowedSessions: () => [],
    buildAllowedStructureDirections: () => [],
    mapBuilderTradeDirection: (d) => (d === "long" || d === "short" ? d : "both"),
};
const sessionConfigShim = { resolveSessionFromTimestamp: () => "London" };

// ── require resolver: real MC modules + shims for @/ leaves ────────────────────
function makeRequire(fromDir) {
    return (spec) => {
        if (spec === "@/data/tradeClassification") return tradeClassificationShim;
        if (spec === "@/data/configTranslator") return configTranslatorShim;
        if (spec === "@/components/lab/session/config/sessionConfig") return sessionConfigShim;
        if (spec.startsWith("./") || spec.startsWith("../")) {
            const abs = path.resolve(fromDir, spec) + (spec.endsWith(".js") ? "" : ".js");
            return loadCjs(abs, makeRequire(path.dirname(abs)));
        }
        throw new Error(`Unexpected import in parity harness: ${spec}`);
    };
}

const composer = loadCjs(path.resolve(MC, "previewComposer.js"), makeRequire(path.resolve(MC)));
const { composePreviewBundle } = composer;

// ── assertion helpers ──────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }

// ── synthetic bundles ───────────────────────────────────────────────────────────
// The RUN bundle's config carries the snake_case key (as stored by the importer);
// the camelCase form is the in-drawer DRAFT key and is not what controlSwap reads.
const FFT_KEY = "triggered_edge_cancel_on_first_failed_tag";

// trades with gross/net cost separation (cost rescore is exact)
function costTrades() {
    return [
        { id: "a", direction: "long", r: 1.0, grossR: 1.2, netR: 1.0, spreadCostR: 0.1, slippageCostR: 0.05, commissionR: 0.05 },
        { id: "b", direction: "short", r: -1.0, grossR: -0.8, netR: -1.0, spreadCostR: 0.1, slippageCostR: 0.05, commissionR: 0.05 },
        { id: "c", direction: "long", r: 0.5, grossR: 0.7, netR: 0.5, spreadCostR: 0.1, slippageCostR: 0.05, commissionR: 0.05 },
    ];
}
// trades carrying stop-anchored excursion fields (RR rescore available)
function rrTrades() {
    return [
        { id: "a", direction: "long", r: 1.0, mfeR: 3.2, rIfNoTarget: 2.4 },
        { id: "b", direction: "short", r: -1.0, mfeR: 0.4, rIfNoTarget: -1.0 },
    ];
}
function plainTrades() {
    return [
        { id: "a", direction: "long", r: 1.0 },
        { id: "b", direction: "short", r: -1.0 },
        { id: "c", direction: "long", r: 0.8 },
    ];
}
const baseBundle = (trades, extra = {}) => ({ id: "run1", trades, ...extra });

// pre-built direction predicate (bypasses configTranslator/sessionConfig math)
const longOnlyPredicate = {
    active: true,
    sessionActive: false, structDirActive: false, directionActive: true,
    directionMode: "long", sessionSet: [], structDirSet: [],
};

// FFT-applicable bundle: config FFT-ON + controls for a triggered-edge scenario.
function fftBundle() {
    const te = "entry_triggered_edge_25p0_next";
    return {
        id: "runFFT",
        config: { [FFT_KEY]: true },
        trades: plainTrades(),
        controlTradesByScenario: { [`base:${te}`]: [{ id: "ctl1", direction: "long", r: 0.3 }] },
        entryResults: { tradesByMode: { [te]: plainTrades() } },
    };
}

// ── cases ────────────────────────────────────────────────────────────────────
console.log("Phase 13 — previewComposer parity");

// 1. cost-only
{
    const res = composePreviewBundle(baseBundle(costTrades()), {
        costs: { spread: 0.2, slippage: 0.1, commission: 0.1 },
    });
    ok(res.stages.cost.applied === true, "cost-only: cost stage applied");
    ok(res.before && Number.isFinite(res.before.netR), "cost-only: before metrics present");
    ok(res.after && Number.isFinite(res.after.netR), "cost-only: after metrics present");
    ok(res.appliedStages.includes("cost"), "cost-only: appliedStages includes cost");
    ok(res.ok === true && !!res.bundle, "cost-only: applyable bundle present");
}

// 2. filter-only
{
    const res = composePreviewBundle(baseBundle(plainTrades()), { filters: longOnlyPredicate });
    ok(res.stages.filter.applied === true, "filter-only: filter stage applied");
    ok(res.stages.filter.filters && "direction" in res.stages.filter.filters,
        "filter-only: stages.filter.filters present (describeFilters parity)");
    ok(res.before && res.after && res.before.trades >= res.after.trades,
        "filter-only: before/after trade counts present");
    ok(res.appliedStages.includes("filter"), "filter-only: appliedStages includes filter");
}

// 3. FFT-only (applied)
{
    const res = composePreviewBundle(fftBundle(), { fft: { fftEnabled: false } });
    ok(res.stages.fft.applied === true, "FFT-only: fft stage applied");
    ok(Array.isArray(res.stages.fft.coveredScenarios) && res.stages.fft.coveredScenarios.length > 0,
        "FFT-only: coveredScenarios present (describeFftCoverage parity)");
    ok(res.stages.fft.swapScope === "full" || res.stages.fft.swapScope === "partial",
        "FFT-only: swapScope present");
    ok(res.appliedStages.includes("fft"), "FFT-only: appliedStages includes fft");
}

// 4. RR-only (applied)
{
    const res = composePreviewBundle(baseBundle(rrTrades()), { rr: 3 });
    ok(res.stages.rr.applied === true, "RR-only: rr stage applied");
    ok(Array.isArray(res.warnings) && res.warnings.length > 0, "RR-only: warning present (RR_PREVIEW_WARNING)");
    ok(res.appliedStages.includes("rr"), "RR-only: appliedStages includes rr");
}

// 5. unavailable FFT (no controls)
{
    const res = composePreviewBundle(baseBundle(plainTrades(), { config: { [FFT_KEY]: true } }), {
        fft: { fftEnabled: false },
    });
    ok(res.stages.fft.applied === false, "unavailable FFT: fft not applied");
    ok(res.unavailableStages.includes("fft"), "unavailable FFT: unavailableStages includes fft");
    ok(typeof res.stages.fft.reason === "string" && res.stages.fft.reason.length > 0,
        "unavailable FFT: stages.fft.reason present");
}

// 6. unavailable RR (no excursion fields)
{
    const res = composePreviewBundle(baseBundle(plainTrades()), { rr: 3 });
    ok(res.stages.rr.applied === false, "unavailable RR: rr not applied");
    ok(res.unavailableStages.includes("rr"), "unavailable RR: unavailableStages includes rr");
    ok(typeof res.stages.rr.reason === "string" && res.stages.rr.reason.length > 0,
        "unavailable RR: stages.rr.reason present");
}

// 7. multi-stage (filter + cost)
{
    const res = composePreviewBundle(baseBundle(costTrades()), {
        filters: longOnlyPredicate,
        costs: { spread: 0.2, slippage: 0.1, commission: 0.1 },
    });
    ok(res.stages.filter.applied === true && res.stages.cost.applied === true,
        "multi-stage: filter + cost both applied");
    ok(res.appliedStages.length >= 2, "multi-stage: appliedStages spans ≥2 kinds (composed label)");
    ok(res.ok === true && !!res.bundle, "multi-stage: applyable bundle present");
}

// ── summary ────────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
