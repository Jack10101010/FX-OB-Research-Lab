// sessionProfiles.validate.mjs — SESSION-STRATEGY-CARDS Phase 2A.
//
// Verifies the cards resolver:
//   • byte-identical when disabled / no effective change
//   • legacy Phase-1 `cells` back-compat
//   • NY PM is a FIRST-CLASS governed session (mask / select / report)
//   • enable/disable per cohort + per session
//   • entry SELECT from a pre-exported variant (and not-available fallback)
//   • BE EXACT-cell SELECT (and not-available → keep entry trades, NO replay)
//   • integration through resolveTradeUniverse
//
// Run from frontend/:  node src/data/__validation__/sessionProfiles.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function loadCjs(absPath) {
    const resolved = path.resolve(absPath.endsWith(".js") ? absPath : `${absPath}.js`);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const src = fs.readFileSync(resolved, "utf8");
    const { code } = babel.transformSync(src, {
        filename: resolved,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(resolved, mod);
    const req = (spec) => {
        if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec));
        throw new Error(`unexpected non-relative import: ${spec}`);
    };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const sp = loadCjs("src/data/sessionProfiles.js");
const tu = loadCjs("src/data/tradeUniverse.js");
const be = loadCjs("src/data/beResolve.js");
const {
    applySessionProfiles, normalizeProfiles, isProfilesActive, countOverrides,
    canonicalSession, cohortOf, buildEntryKey, SESSION_KEYS,
} = sp;
const { resolveTradeUniverse } = tu;
const { beScenarioKey } = be;

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
};

// ── fixtures ─────────────────────────────────────────────────────────────────
const SESS = [
    ["London Killzone", "london"], ["London Lull", "lull"], ["New York", "newYork"],
    ["NY PM", "ny_pm"], ["Asia", "asia"], ["Outside", "outside"],
];
const COH = [
    ["bos_long", "BOS", "Long"], ["bos_short", "BOS", "Short"],
    ["choch_long", "CHoCH", "Long"], ["choch_short", "CHoCH", "Short"],
];
// One trade per (session × cohort) in each universe; ids prefixed so we can
// detect which universe a trade came from.
function buildUniverseTrades(prefix, r) {
    const out = [];
    for (const [sessRaw] of SESS) {
        for (const [, structure, direction] of COH) {
            out.push({ id: `${prefix}-${sessRaw}-${structure}-${direction}`, fillSession: sessRaw, structure, direction, r, outcome: r >= 0 ? "Win" : "Loss" });
        }
    }
    return out;
}
const BASE = buildUniverseTrades("b", 1);     // baseline universe
const TE = buildUniverseTrades("te", 2);      // TE 25 d2 universe (distinct ids)
const TE_KEY = "entry_triggered_edge_25p0_d2";
const BE_KEY = beScenarioKey("wick", 1.0);    // "be_wick_1p00R"
// One BE-cell trade for NY PM BOS Short on the TE variant.
const BE_TRADES = [{ id: "be-NYPM-bos-short", fillSession: "NY PM", structure: "BOS", direction: "Short", r: 0, outcome: "Win" }];

const bundle = {
    trades: BASE.slice(),
    tradesByVariant: { single_position: BASE.slice() },
    primaryVariant: "single_position",
    entryResults: { tradesByMode: { entry_baseline: BASE.slice(), [TE_KEY]: TE.slice() } },
    beResults: { single_position: { [TE_KEY]: { [BE_KEY]: {} } } },
    beTradesByMode: { single_position: { [TE_KEY]: { [BE_KEY]: BE_TRADES.slice() } } },
};
const universe = () => ({
    universeType: "baseline", label: "Baseline",
    scenario: { family: "baseline", threshold: null, fillMode: null },
    variant: "single_position",
    trades: BASE.slice(), stats: { total: BASE.length }, warnings: [],
    baselineTrades: BASE.slice(), baselineStats: { total: BASE.length },
});
const countCohort = (trades, ck) => trades.filter((t) => cohortOf(t) === ck).length;
const idsCohort = (trades, ck) => trades.filter((t) => cohortOf(t) === ck).map((t) => t.id);

// ── 1. NY PM is first-class ───────────────────────────────────────────────────
console.log("\n[1] NY PM first-class");
ok(SESSION_KEYS.includes("ny_pm"), "ny_pm is a governed session key");
ok(canonicalSession("NY PM") === "ny_pm", "NY PM → ny_pm");
ok(countCohort(BASE, "ny_pm|bos_short") === 1, "fixture has an NY PM BOS Short trade");

// ── 2. byte-identical when inactive ──────────────────────────────────────────
console.log("\n[2] byte-identical (inactive)");
const u0 = universe();
ok(applySessionProfiles({ universe: u0, profiles: { enabled: false, cards: {} }, bundle }) === u0, "disabled → same ref");
ok(applySessionProfiles({ universe: u0, profiles: { enabled: true, cards: {} }, bundle }) === u0, "no cards → same ref");
ok(applySessionProfiles({ universe: u0, scenario: {}, bundle }) === u0, "no profiles on scenario → same ref");

// ── 3. disable cohort: NY PM BOS Short only ──────────────────────────────────
console.log("\n[3] disable NY PM BOS Short (mask)");
const r3 = applySessionProfiles({
    universe: universe(), bundle, variant: "single_position",
    profiles: { enabled: true, cards: { ny_pm: { enabled: true, default: {}, overrides: { bos_short: { enabled: false } } } } },
});
ok(r3 !== universe(), "new universe");
ok(countCohort(r3.trades, "ny_pm|bos_short") === 0, "NY PM BOS Short removed");
ok(r3.trades.length === BASE.length - 1, "exactly one removed");
ok(countCohort(r3.trades, "newYork|bos_short") === 1, "New York BOS Short untouched (NOT folded with NY PM)");
ok(r3.sessionCards?.removed === 1, "attribution removed=1");

// ── 4. session-level disable removes all 4 cohorts ───────────────────────────
console.log("\n[4] disable whole London session");
const r4 = applySessionProfiles({
    universe: universe(), bundle, variant: "single_position",
    profiles: { enabled: true, cards: { london: { enabled: false, default: {}, overrides: {} } } },
});
ok(["bos_long", "bos_short", "choch_long", "choch_short"].every((c) => countCohort(r4.trades, `london|${c}`) === 0), "all 4 London cohorts removed");
ok(r4.trades.length === BASE.length - 4, "four removed");
ok(countCohort(r4.trades, "lull|bos_long") === 1, "London Lull untouched");

// ── 5. entry SELECT from exported variant ────────────────────────────────────
console.log("\n[5] entry SELECT (Asia CHoCH Long → TE 25 d2)");
const r5 = applySessionProfiles({
    universe: universe(), bundle, variant: "single_position",
    profiles: { enabled: true, cards: { asia: { enabled: true, default: {}, overrides: { choch_long: { entry: { model: "triggered_edge", threshold: 25, arm: "d2" } } } } } },
});
ok(idsCohort(r5.trades, "asia|choch_long").every((id) => id.startsWith("te-")), "Asia CHoCH Long now sourced from TE universe");
ok(idsCohort(r5.trades, "asia|bos_short").every((id) => id.startsWith("b-")), "Asia BOS Short still baseline");
ok(idsCohort(r5.trades, "london|choch_long").every((id) => id.startsWith("b-")), "London CHoCH Long still baseline (same cohort, diff session)");
ok(r5.trades.length === BASE.length, "count unchanged (1-for-1 swap)");
ok(r5.sessionCards?.swapped === 1, "attribution swapped=1");
ok(buildEntryKey({ model: "triggered_edge", threshold: 25, arm: "d2" }) === TE_KEY, "buildEntryKey → entry_triggered_edge_25p0_d2");

// ── 6. entry NOT available → keep base + warning ─────────────────────────────
console.log("\n[6] entry not available (fallback, no fabrication)");
const r6 = applySessionProfiles({
    universe: universe(), bundle, variant: "single_position",
    profiles: { enabled: true, cards: { outside: { enabled: true, default: {}, overrides: { choch_short: { entry: { model: "triggered_edge", threshold: 99, arm: "d2" } } } } } },
});
ok(idsCohort(r6.trades, "outside|choch_short").every((id) => id.startsWith("b-")), "missing variant → kept base trades");
ok(r6.warnings.some((w) => w.code === "SESSION_CARD_ENTRY_UNAVAILABLE"), "entry-unavailable warning emitted");
ok((r6.sessionCards?.unavailable || []).some((u) => u.kind === "entry"), "attribution records entry unavailable");

// ── 7. BE EXACT-cell SELECT (only if it exists) ──────────────────────────────
console.log("\n[7] BE exact-cell SELECT");
const r7 = applySessionProfiles({
    universe: universe(), bundle, variant: "single_position",
    profiles: { enabled: true, cards: { ny_pm: { enabled: true, default: {}, overrides: { bos_short: { entry: { model: "triggered_edge", threshold: 25, arm: "d2" }, be: { trigger: "wick", armR: 1.0 } } } } } },
});
ok(idsCohort(r7.trades, "ny_pm|bos_short").includes("be-NYPM-bos-short"), "NY PM BOS Short sourced from EXACT BE cell");
ok(r7.sessionCards?.beApplied === 1, "attribution beApplied=1");

// ── 8. BE NOT available → keep entry trades, NO replay ───────────────────────
console.log("\n[8] BE not available (no replay)");
const r8 = applySessionProfiles({
    universe: universe(), bundle, variant: "single_position",
    profiles: { enabled: true, cards: { london: { enabled: true, default: {}, overrides: { bos_long: { be: { trigger: "close", armR: 2.0 } } } } } },
});
ok(idsCohort(r8.trades, "london|bos_long").every((id) => id.startsWith("b-")), "missing BE cell → kept (base) entry trades");
ok(r8.warnings.some((w) => w.code === "SESSION_CARD_BE_UNAVAILABLE"), "BE-unavailable warning emitted");
ok((r8.sessionCards?.unavailable || []).some((u) => u.kind === "be"), "attribution records BE unavailable");

// ── 9. precedence: override beats card default ───────────────────────────────
console.log("\n[9] precedence override > default");
const r9 = applySessionProfiles({
    universe: universe(), bundle, variant: "single_position",
    profiles: { enabled: true, cards: { asia: { enabled: true, default: { enabled: false }, overrides: { choch_long: { enabled: true } } } } },
});
ok(countCohort(r9.trades, "asia|choch_long") === 1, "override re-enables a cohort the card default disabled");
ok(countCohort(r9.trades, "asia|bos_long") === 0, "card-default disable applies to non-overridden cohorts");

// ── 10. legacy Phase-1 `cells` back-compat ───────────────────────────────────
console.log("\n[10] legacy cells back-compat");
const legacy = normalizeProfiles({ enabled: true, cells: { asia: { choch_long: "disabled" } } });
ok(legacy.cards?.asia?.overrides?.choch_long?.enabled === false, "legacy 'disabled' → overrides.enabled=false");
const r10 = applySessionProfiles({ universe: universe(), bundle, variant: "single_position", profiles: legacy });
ok(countCohort(r10.trades, "asia|choch_long") === 0, "legacy config still masks");

// ── 11. integration through resolveTradeUniverse ─────────────────────────────
console.log("\n[11] resolveTradeUniverse integration");
const noP = resolveTradeUniverse({ bundle, scenario: { family: "baseline", positionVariant: "single_position" }, fallbackVariant: "single_position" });
ok(noP.trades.length === BASE.length, "no cards → full universe");
ok(!noP.sessionCards, "no attribution when absent");
const withP = resolveTradeUniverse({
    bundle, fallbackVariant: "single_position",
    scenario: { family: "baseline", positionVariant: "single_position", sessionProfiles: { enabled: true, cards: { ny_pm: { enabled: false, default: {}, overrides: {} } } } },
});
ok(withP.trades.length === BASE.length - 4, "resolveTradeUniverse disables whole NY PM session (4 cohorts)");
ok(withP.sessionCards?.active === true, "attribution present via resolveTradeUniverse");

// ── 12. helpers / activity ────────────────────────────────────────────────────
console.log("\n[12] helpers");
ok(isProfilesActive({ enabled: true, cards: { asia: { enabled: true, default: {}, overrides: { choch_long: { enabled: false } } } } }) === true, "active when a cohort disabled");
ok(isProfilesActive({ enabled: true, cards: { asia: { enabled: true, default: {}, overrides: {} } } }) === false, "inactive when nothing set");
ok(countOverrides({ enabled: true, cards: { asia: { enabled: true, default: {}, overrides: { choch_long: { enabled: false }, bos_short: { entry: { model: "baseline" } } } } } }) === 2, "override count = 2");

// ── 13. no backend dependency (structural) ───────────────────────────────────
console.log("\n[13] no backend / no replay in module");
const srcText = fs.readFileSync(path.resolve("src/data/sessionProfiles.js"), "utf8");
ok(!/fetch\(|sidecar|axios|XMLHttpRequest|\/runs/.test(srcText), "no network/run calls");
ok(!/beReplay|replay\(/i.test(srcText), "no replay invoked in resolver");

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
