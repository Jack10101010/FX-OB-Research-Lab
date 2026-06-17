// Validation for failureCohortRanking.js (Failures Lab V6 — cohort ranking engine).
// Babel require-shim harness (same style as excursionAnalytics.validate.mjs): load the
// real source modules and shim the entryFormatters / entryRegistry re-exports.
//
// Run from frontend/ (Node ≥ 22 ESM):
//   node src/data/__validation__/failureCohortRanking.validate.mjs
//
// Coverage:
//   empty / MFE-less safety · cohort join correctness · Worst lens (damage) ·
//   Recoverable lens (reach1R / avgMfe) · Filter lens (truth-layer netRImpact direct) ·
//   Protection lens (recoverable pool) · confidence gating (thin cohorts excluded) ·
//   SPECULATIVE never tops queue · queue dedup · no mutation.

import babel from "@babel/core";
import fs from "fs";

const BASE = "src/components/lab/failures/shared";
function loadCjs(absPath, requireShim) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(requireShim, module, module.exports);
    return module.exports;
}

const round1 = (v) => Number(Number(v).toFixed(1));
const round2 = (v) => Number(Number(v).toFixed(2));
const entryFormattersShim = {
    isFiniteNumber: (v) => v != null && Number.isFinite(Number(v)),
    sessionOf: () => "Unknown",
    parseDate: () => null,
    dayIndex: () => null,
    WEEKDAYS: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    SESSIONS: [],
    num: Number, round1, round2,
    fmtR: String, fmtPct: String, fmtMaybeR: String, fmtMaybePct: String,
};
const entryRegistryShim = { sampleConfidence: () => ({ label: "N/A", tone: "muted" }) };
const resolveShared = (utils, registry, dimensions, aggregation, excursion, analytics, filterSim, tc) => (spec) => {
    if (spec.includes("entryFormatters")) return entryFormattersShim;
    if (spec.includes("entryRegistry")) return entryRegistryShim;
    if (spec.includes("failuresUtils")) return utils;
    if (spec.includes("failuresRegistry")) return registry;
    if (spec.includes("failuresDimensions")) return dimensions;
    if (spec.includes("failuresAggregation")) return aggregation;
    if (spec.includes("excursionAnalytics")) return excursion;
    if (spec.includes("failuresAnalytics")) return analytics;
    if (spec.includes("filterSimulator")) return filterSim;
    if (spec.includes("tradeClassification")) return tc;
    return {};
};

const utils = loadCjs(`${BASE}/failuresUtils.js`, () => entryFormattersShim);
const registry = loadCjs(`${BASE}/failuresRegistry.js`, () => entryRegistryShim);
const dimensions = loadCjs(`${BASE}/failuresDimensions.js`, (s) => (s.includes("failuresUtils") ? utils : s.includes("failuresRegistry") ? registry : {}));
const aggregation = loadCjs(`${BASE}/failuresAggregation.js`, (s) => (s.includes("failuresDimensions") ? dimensions : s.includes("failuresUtils") ? utils : {}));
const tc = loadCjs("src/data/tradeClassification.js", () => ({}));
const excursion = loadCjs(`${BASE}/excursionAnalytics.js`, resolveShared(utils, registry, dimensions, aggregation, {}, {}, {}, tc));
const analytics = loadCjs(`${BASE}/failuresAnalytics.js`, resolveShared(utils, registry, dimensions, aggregation, excursion, {}, {}, tc));
const filterSim = loadCjs(`${BASE}/filterSimulator.js`, resolveShared(utils, registry, dimensions, aggregation, excursion, analytics, {}, tc));
const ranking = loadCjs(`${BASE}/failureCohortRanking.js`, resolveShared(utils, registry, dimensions, aggregation, excursion, analytics, filterSim, tc));

const { buildFailureCohortRanking } = ranking;

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); } };

// ── Fixtures: direction × structure cohorts (session/hour stubbed → auto-hidden) ──
// Short×CHoCH: 10 big losers (-2R, low MFE) + 1 winner → worst + filterable, not recoverable.
// Long×BOS:    8 losers (-1R, MFE 1.5R reach) + 6 winners → recoverable / protection, NOT a filter (winners costly).
// Short×BOS:   3 losers (-1R) + 1 winner → THIN (< floor 5) → must be excluded.
const T = (direction, structureTag, r, mfeR) => ({ direction, structureTag, r, mfeR, outcome: r < 0 ? "LOSS" : "WIN", entry: "x" });
const trades = [
    ...Array.from({ length: 10 }, () => T("short", "choch", -2, 0.1)),
    ...Array.from({ length: 1 },  () => T("short", "choch", 1, 0.1)),
    ...Array.from({ length: 8 },  () => T("long", "bos", -1, 1.5)),
    ...Array.from({ length: 6 },  () => T("long", "bos", 2, 1.5)),
    ...Array.from({ length: 3 },  () => T("short", "bos", -1, 0.2)),
    ...Array.from({ length: 1 },  () => T("short", "bos", 1, 0.2)),
];
const snapshot = JSON.stringify(trades);
const OPT = { sampleFloor: 5, topN: 6 };

console.log("V6 buildFailureCohortRanking — core");
const res = buildFailureCohortRanking(trades, OPT);
ok(res.meta.totalTrades === 29, `valid universe = 29 (got ${res.meta.totalTrades})`);
ok(res.meta.mfeAvailable === true, "MFE available flagged");
ok(res.queue.length > 0 && res.queue.length <= OPT.topN, `queue populated, capped at topN (${res.queue.length})`);

// join correctness — Short single-dim cohort: 13 losers, lossR 23, 15 trades
const worstShort = res.worst.find((r) => r.dimA === "direction" && r.keyA === "Short" && !r.dimB);
ok(!!worstShort, "Short cohort present in worst list");
ok(worstShort.metrics.losers === 13 && worstShort.metrics.lossR === 23, `Short join: 13 losers, 23R (got ${worstShort?.metrics.losers}/${worstShort?.metrics.lossR})`);
ok(worstShort.metrics.winners === 2 && worstShort.metrics.count === 15, "Short join: 2 winners, 15 trades");

// Worst lens prioritizes damage/contribution → highest loss-R on top
ok(res.worst[0].metrics.lossR === Math.max(...res.worst.map((r) => r.metrics.lossR)), "Worst lens: rank 1 has the max loss-R");
ok(res.worst[0].keyA === "Short", "Worst lens: Short (23R, 74% contribution) tops damage");

// Recoverable lens prioritizes reach1R / avgMfe
console.log("V6 recoverable + protection lenses");
ok(res.recoverable.length > 0, "recoverable lens produced rows");
ok(res.recoverable[0].metrics.reach1R === 100 && res.recoverable[0].metrics.avgMfe === 1.5, `Recoverable rank 1: reach1R 100%, avgMfe 1.5 (got ${res.recoverable[0].metrics.reach1R}/${res.recoverable[0].metrics.avgMfe})`);
ok(res.recoverable.every((r) => r.metrics.reach1R != null), "recoverable rows all carry MFE");
// Short cohorts (mfeR 0.1/0.2, never reach +1R) must not lead recoverability
ok(res.recoverable[0].keyA !== "Short" || res.recoverable[0].dimB, "Short low-MFE cohort does not top recoverable");

// Protection lens prioritizes recoverable pool
ok(res.protectionCandidates[0].metrics.recoverablePool > 0, "Protection rank 1 has a real recoverable pool");
ok(res.protectionCandidates[0].metrics.reach1R >= 50, "Protection rank 1 has strong reach");

// Filter lens uses truth-layer netRImpact directly, recommended cohorts only
console.log("V6 filter lens (truth layer)");
ok(res.filterCandidates.length > 0, "filter candidates produced");
ok(res.filterCandidates[0].metrics.filterNetRImpact === Math.max(...res.filterCandidates.map((r) => r.metrics.filterNetRImpact)), "Filter lens: rank 1 has max netRImpact");
ok(res.filterCandidates[0].metrics.filterNetRImpact === 21, `Filter rank 1 netRImpact = 21 (Direction Short truth layer) (got ${res.filterCandidates[0].metrics.filterNetRImpact})`);
ok(res.filterCandidates.every((r) => r.metrics.filterNetRImpact > 0), "all filter candidates strictly improve net R");
// Long×BOS (removing loses 6×2=12 winner-R, saves 8 loss-R ⇒ netRImpact -4) is NOT a filter candidate
ok(!res.filterCandidates.some((r) => r.keyA === "Long"), "winner-heavy Long cohort excluded from filter candidates");

// Confidence gating — thin Short×BOS (3 losers < floor 5) excluded everywhere
console.log("V6 confidence gating + dedup");
const allRows = [...res.worst, ...res.recoverable, ...res.protectionCandidates, ...res.filterCandidates, ...res.queue];
ok(allRows.every((r) => r.metrics.losers >= OPT.sampleFloor), "no sub-floor cohort anywhere (thin cohort excluded)");
ok(res.queue.every((e) => e.confidence !== "SPECULATIVE"), "SPECULATIVE cohorts never enter the queue");
ok(res.queue[0].confidence !== "SPECULATIVE", "queue rank 1 is not SPECULATIVE");

// Queue dedup — no cohort appears twice
const ids = res.queue.map((e) => (e.dimB ? `${e.dimA}:${e.keyA}|${e.dimB}:${e.keyB}` : `${e.dimA}:${e.keyA}`));
ok(new Set(ids).size === ids.length, "queue has no duplicate cohorts");
// queue items carry action + reason + confidence (decision-support shape)
ok(res.queue.every((e) => typeof e.action === "string" && typeof e.reason === "string" && e.reason.length > 0), "every queue item has action + non-empty reason");
ok(res.queue.every((e) => ["Investigate", "Test filter", "Test protection", "Watch"].includes(e.action)), "actions are from the allowed set");

// ── Empty input safety ──────────────────────────────────────────────────────
console.log("V6 empty + MFE-less safety");
const empty = buildFailureCohortRanking([], OPT);
ok(empty.queue.length === 0 && empty.worst.length === 0 && empty.filterCandidates.length === 0, "empty input → all-empty output");
ok(empty.meta.totalTrades === 0, "empty input → meta.totalTrades 0 (no crash)");
const emptyNull = buildFailureCohortRanking(null, OPT);
ok(emptyNull.queue.length === 0, "null input → empty queue (no crash)");

// ── MFE-less input safety ───────────────────────────────────────────────────
const noMfe = trades.map((t) => { const { mfeR, ...rest } = t; return rest; });
const ddNoMfe = buildFailureCohortRanking(noMfe, OPT);
ok(ddNoMfe.meta.mfeAvailable === false, "MFE-less → meta.mfeAvailable false");
ok(ddNoMfe.recoverable.length === 0 && ddNoMfe.protectionCandidates.length === 0, "MFE-less → recoverable & protection empty (graceful)");
ok(ddNoMfe.worst.length > 0 && ddNoMfe.filterCandidates.length > 0, "MFE-less → worst & filter still produced");
ok(ddNoMfe.queue.length > 0, "MFE-less → queue still produced from damage/filter lenses");

// ── No mutation ─────────────────────────────────────────────────────────────
ok(JSON.stringify(trades) === snapshot, "source trades array not mutated");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
