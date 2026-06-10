// Validation for Failures Lab V5 Phase 2 — Confirmed False Loser analytics.
// Exercises buildConfirmedFalseLosers + hasPostStopData (post-stop continuation export).
// Babel-loads the real source modules with a require-shim (same harness style as
// filterSimulator.validate.mjs / failuresAggregation.validate.mjs).
//
// Run from frontend/ (Node ≥ 22 ESM):
//   node src/data/__validation__/failuresFalseLosers.validate.mjs
//
// Coverage:
//   1. available=false (no export) → fallback signalled, all losers counted noData.
//   2. Confirmed via post_stop_mfe_r ≥ confirmR.
//   3. Confirmed via reached_original_tp (even when mfe < confirmR).
//   4. Candidate band (candidateR ≤ mfe < confirmR).
//   5. Genuine (mfe < candidateR, incl. negative).
//   6. Counts + rates correct.
//   7. Horizon + model extracted (modal).
//   8. reachedR sums confirmed peak MFE only.
//   9. Cohort breakdowns (session/direction) count + rate correct.
//  10. Dual-key (camelCase) parity with snake_case.
//  11. reached_original_tp accepts boolean / 1 / "true".
//  12. No mutation of source trades.
//  13. confirmR / candidateR overridable via opts.

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

// entryFormatters shim — sessionOf falls through to a passthrough; tests set t.session.
const entryFormattersShim = {
    isFiniteNumber: (v) => v != null && Number.isFinite(Number(v)),
    sessionOf: () => "Unknown",
    parseDate: () => null,
    dayIndex: () => null,
    WEEKDAYS: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    SESSIONS: ["Asia", "London", "New York"],
    num: Number,
    round1: (v) => Number(Number(v).toFixed(1)),
    round2: (v) => Number(Number(v).toFixed(2)),
    fmtR: String, fmtPct: String, fmtMaybeR: String, fmtMaybePct: String,
};
const entryRegistryShim = { sampleConfidence: () => ({ label: "N/A", tone: "muted" }) };

const utils = loadCjs(`${BASE}/failuresUtils.js`, () => entryFormattersShim);
const registry = loadCjs(`${BASE}/failuresRegistry.js`, () => entryRegistryShim);
const analytics = loadCjs(`${BASE}/failuresAnalytics.js`, (spec) => {
    if (spec.includes("failuresUtils")) return utils;
    if (spec.includes("failuresRegistry")) return registry;
    if (spec.includes("entryFormatters")) return entryFormattersShim;
    if (spec.includes("entryRegistry")) return entryRegistryShim;
    return {};
});

const { buildConfirmedFalseLosers, hasPostStopData } = analytics;

// ── tiny assert harness ───────────────────────────────────────────────────────
let pass = 0, fail = 0;
function ok(cond, msg) { cond ? (pass++) : (fail++, console.error(`  ✗ ${msg}`)); }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ── fixtures ──────────────────────────────────────────────────────────────────
// 5 losers, all with post-stop export, horizon 50, model "post_stop_v1".
const L = (over) => ({
    outcome: "loss", r: -1, direction: "long", structure: "bos", session: "London",
    post_stop_lookahead_bars: 50, post_stop_model: "post_stop_v1", ...over,
});

const losers = [
    L({ id: 1, post_stop_mfe_r: 1.5, post_stop_reached_original_tp: false, post_stop_bars_to_1r: 12 }), // confirmed (mfe)
    L({ id: 2, post_stop_mfe_r: 0.3, post_stop_reached_original_tp: true,  direction: "short" }),       // confirmed (TP)
    L({ id: 3, post_stop_mfe_r: 0.7, post_stop_reached_original_tp: false, session: "Asia" }),          // candidate
    L({ id: 4, post_stop_mfe_r: 0.1, post_stop_reached_original_tp: false, direction: "short" }),       // genuine
    L({ id: 5, post_stop_mfe_r: -0.2, post_stop_reached_original_tp: false, structure: "choch" }),      // genuine
];
const frozen = JSON.parse(JSON.stringify(losers));

const rep = buildConfirmedFalseLosers(losers);

// 1 — availability
eq(hasPostStopData(losers), true, "hasPostStopData true when export present");
eq(rep.available, true, "report available");

// 2–5 — classification counts
eq(rep.counts.confirmed, 2, "confirmed count");
eq(rep.counts.candidate, 1, "candidate count");
eq(rep.counts.genuine, 2, "genuine count");
eq(rep.counts.total, 5, "total count");
eq(rep.counts.noData, 0, "noData count");

// 6 — rates
eq(rep.rates.confirmedPct, 40, "confirmed pct");
eq(rep.rates.candidatePct, 20, "candidate pct");
eq(rep.rates.genuinePct, 40, "genuine pct");

// 7 — horizon + model
eq(rep.horizon, 50, "horizon extracted");
eq(rep.model, "post_stop_v1", "model extracted");

// 8 — reachedR sums confirmed peak MFE only (1.5 + 0.3)
eq(rep.reachedR, 1.8, "reachedR = sum of confirmed post_stop_mfe_r");

// 9 — cohort breakdown
const dir = Object.fromEntries(rep.cohorts.direction.map(c => [c.key, c]));
eq(dir.long.confirmed, 1, "long cohort confirmed (id1)");
eq(dir.long.total, 3, "long cohort total (id1, id3, id5)");
eq(dir.short.confirmed, 1, "short cohort confirmed (id2)");
eq(dir.short.total, 2, "short cohort total (id2, id4)");
const sess = Object.fromEntries(rep.cohorts.session.map(c => [c.key, c]));
eq(sess.London.confirmed, 2, "London confirmed (id1, id2)");
eq(sess.Asia.confirmed, 0, "Asia confirmed none (id3 candidate)");

// 10 — dual-key parity (camelCase only)
const camel = [
    { outcome: "loss", r: -1, direction: "long", session: "NY",
      postStopMfeR: 2.0, postStopReachedOriginalTp: false, postStopLookaheadBars: 50, postStopModel: "post_stop_v1" },
];
const camelRep = buildConfirmedFalseLosers(camel);
eq(camelRep.available, true, "camelCase keys detected");
eq(camelRep.counts.confirmed, 1, "camelCase confirmed");
eq(camelRep.horizon, 50, "camelCase horizon");

// 11 — reached_original_tp truthy variants
const tpVariants = [
    L({ id: 10, post_stop_mfe_r: 0.0, post_stop_reached_original_tp: 1 }),
    L({ id: 11, post_stop_mfe_r: 0.0, post_stop_reached_original_tp: "true" }),
];
const tpRep = buildConfirmedFalseLosers(tpVariants);
eq(tpRep.counts.confirmed, 2, "reached_original_tp accepts 1 and 'true'");

// 12 — no mutation
eq(JSON.stringify(losers), JSON.stringify(frozen), "source trades not mutated");

// 13 — overridable thresholds
const strict = buildConfirmedFalseLosers(losers, { confirmR: 2.0, candidateR: 1.0 });
// id1 mfe 1.5 < 2.0 but no TP → candidate now; id2 still confirmed via TP.
eq(strict.counts.confirmed, 1, "override confirmR: only TP-reached stays confirmed");
eq(strict.counts.candidate, 1, "override: id1 (1.5R) drops to candidate band [1.0,2.0)");

// unavailable path
const noExport = [{ outcome: "loss", r: -1, direction: "long", session: "London" }];
const noRep = buildConfirmedFalseLosers(noExport);
eq(noRep.available, false, "available=false without export");
eq(noRep.counts.noData, 1, "noData counts losers without export");
eq(hasPostStopData(noExport), false, "hasPostStopData false without export");

// empty input
const emptyRep = buildConfirmedFalseLosers([]);
eq(emptyRep.available, false, "empty input safe");

console.log(`\nfalseLosers.validate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
