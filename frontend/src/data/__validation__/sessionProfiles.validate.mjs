// sessionProfiles.validate.mjs — SESSION-STRATEGY-PROFILES Phase 1.
//
// Verifies the frontend-only per-session × structure × direction enable matrix:
//   • disabled / empty matrix → byte-identical universe (same reference)
//   • disabling one cohort removes ONLY that cohort
//   • multiple cohorts can be disabled together
//   • non-row sessions (NY PM / unknown) are never masked
//   • integration through resolveTradeUniverse (the real wiring point)
//   • baseline reference + stats recompute behavior
//
// Run from frontend/:  node src/data/__validation__/sessionProfiles.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

// Recursive CJS loader — resolves relative ESM imports between data modules.
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
const {
    applySessionProfiles, normalizeProfiles, isProfilesActive, countOverrides,
    canonicalSession, tradeCellKey,
} = sp;
const { resolveTradeUniverse } = tu;

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
};

// ── fixtures ───────────────────────────────────────────────────────────────
let _id = 0;
const T = (session, structure, direction, r = 1) => ({
    id: `t${++_id}`, fillSession: session, structure, direction,
    r, outcome: r >= 0 ? "Win" : "Loss",
});

const TRADES = [
    T("Asia", "CHoCH", "Long", 2),       // asia.choch_long
    T("Asia", "BOS", "Short", -1),       // asia.bos_short
    T("London Killzone", "BOS", "Short", 1),   // london.bos_short
    T("London Killzone", "CHoCH", "Long", 1),  // london.choch_long
    T("London Lull", "BOS", "Long", 1),  // lull.bos_long
    T("New York", "BOS", "Long", 1),     // newYork.bos_long
    T("NY PM", "BOS", "Short", 1),       // ny_pm (no row → never masked)
    T("Outside", "CHoCH", "Short", -1),  // outside.choch_short
    T("", "BOS", "Long", 1),             // unknown (no row → never masked)
];
const universe = () => ({
    universeType: "baseline", label: "Baseline",
    trades: TRADES.slice(), stats: { total: TRADES.length },
    warnings: [], baselineTrades: TRADES.slice(), baselineStats: { total: TRADES.length },
});
const sessOf = (u, sess, cell) =>
    u.trades.filter((t) => canonicalSession(t.fillSession) === sess && tradeCellKey(t) === cell).length;

// ── 1. canonicalizers ────────────────────────────────────────────────────────
console.log("\n[1] canonicalizers");
ok(canonicalSession("London Killzone") === "london", "London Killzone → london");
ok(canonicalSession("London Lull") === "lull", "London Lull → lull (before london)");
ok(canonicalSession("New York") === "newYork", "New York → newYork");
ok(canonicalSession("NY PM") === "ny_pm", "NY PM → ny_pm (non-row)");
ok(canonicalSession("Asia") === "asia", "Asia → asia");
ok(canonicalSession("Outside") === "outside", "Outside → outside");
ok(canonicalSession("") === "unknown", "blank → unknown (non-row)");
ok(tradeCellKey({ structure: "CHoCH", direction: "Long" }) === "choch_long", "cohort key choch_long");
ok(tradeCellKey({ structure: "BOS", direction: "Short" }) === "bos_short", "cohort key bos_short");

// ── 2. byte-identical when inactive ──────────────────────────────────────────
console.log("\n[2] byte-identical (inactive)");
const u0 = universe();
ok(applySessionProfiles({ universe: u0, profiles: { enabled: false, cells: {} } }) === u0,
    "disabled matrix → same universe reference");
ok(applySessionProfiles({ universe: u0, profiles: { enabled: true, cells: {} } }) === u0,
    "enabled but no cells → same reference");
ok(applySessionProfiles({ universe: u0, profiles: { enabled: true, cells: { asia: { choch_long: "enabled" } } } }) === u0,
    "only 'enabled' cell (no disabled) → same reference (Phase 1 only removes)");
ok(applySessionProfiles({ universe: u0, scenario: {} }) === u0, "no profiles on scenario → same reference");
ok(applySessionProfiles({ universe: u0, profiles: { enabled: true, cells: { newYork: { bos_short: "disabled" } } } }) === u0,
    "disabled cohort with zero matching trades → same reference");

// ── 3. disabling Asia CHoCH Long removes only that cohort ─────────────────────
console.log("\n[3] single-cohort removal: Asia CHoCH Long");
const before = universe();
const r3 = applySessionProfiles({ universe: before, profiles: { enabled: true, cells: { asia: { choch_long: "disabled" } } } });
ok(r3 !== before, "returns a new universe");
ok(r3.trades.length === TRADES.length - 1, "exactly one trade removed");
ok(sessOf(r3, "asia", "choch_long") === 0, "no Asia CHoCH Long remains");
ok(sessOf(r3, "asia", "bos_short") === 1, "Asia BOS Short untouched");
ok(sessOf(r3, "london", "choch_long") === 1, "London CHoCH Long untouched (same cohort, different session)");
ok(r3.sessionProfile?.removed === 1 && r3.sessionProfile.removedByCohort["asia.choch_long"] === 1,
    "attribution records asia.choch_long:1");
ok(r3.warnings.some((w) => w.code === "SESSION_PROFILE_MASK"), "mask warning emitted");
ok(before.trades.length === TRADES.length, "input universe not mutated");
ok(r3.baselineTrades.length === TRADES.length, "baseline reference left unmasked");

// ── 4. disabling London BOS Short removes only that cohort ────────────────────
console.log("\n[4] single-cohort removal: London BOS Short");
const r4 = applySessionProfiles({ universe: universe(), profiles: { enabled: true, cells: { london: { bos_short: "disabled" } } } });
ok(r4.trades.length === TRADES.length - 1, "exactly one trade removed");
ok(sessOf(r4, "london", "bos_short") === 0, "no London BOS Short remains");
ok(sessOf(r4, "asia", "bos_short") === 1, "Asia BOS Short untouched (same cohort, different session)");
ok(sessOf(r4, "london", "choch_long") === 1, "London CHoCH Long untouched");

// ── 5. multiple cohorts disabled together ────────────────────────────────────
console.log("\n[5] multiple cohorts");
const r5 = applySessionProfiles({
    universe: universe(),
    profiles: { enabled: true, cells: { asia: { choch_long: "disabled" }, london: { bos_short: "disabled" }, outside: { choch_short: "disabled" } } },
});
ok(r5.trades.length === TRADES.length - 3, "three trades removed");
ok(sessOf(r5, "asia", "choch_long") === 0 && sessOf(r5, "london", "bos_short") === 0 && sessOf(r5, "outside", "choch_short") === 0,
    "all three disabled cohorts gone");
ok(Object.keys(r5.sessionProfile.removedByCohort).length === 3, "attribution lists 3 cohorts");

// ── 6. non-row sessions never masked ─────────────────────────────────────────
console.log("\n[6] NY PM / unknown never masked");
const r6 = applySessionProfiles({
    universe: universe(),
    // try (futilely) to disable everything, including bos_short which NY PM is
    profiles: normalizeProfiles({
        enabled: true,
        cells: Object.fromEntries(["london", "lull", "newYork", "asia", "outside"]
            .map((s) => [s, { bos_long: "disabled", bos_short: "disabled", choch_long: "disabled", choch_short: "disabled" }])),
    }),
});
ok(r6.trades.some((t) => canonicalSession(t.fillSession) === "ny_pm"), "NY PM trade survives");
ok(r6.trades.some((t) => canonicalSession(t.fillSession) === "unknown"), "unknown-session trade survives");

// ── 7. normalizeProfiles / helpers ───────────────────────────────────────────
console.log("\n[7] normalize + helpers");
const norm = normalizeProfiles({ enabled: true, cells: { asia: { choch_long: "disabled", junk: "x", bos_long: "inherit" }, BAD: { x: 1 } } });
ok(norm.cells.asia && norm.cells.asia.choch_long === "disabled", "keeps valid disabled cell");
ok(!("junk" in (norm.cells.asia || {})) && !("bos_long" in (norm.cells.asia || {})), "drops junk + inherit");
ok(!("BAD" in norm.cells), "drops unknown session row");
ok(countOverrides({ cells: { asia: { choch_long: "disabled", bos_short: "enabled" } } }) === 2, "override count counts enabled+disabled");
ok(isProfilesActive({ enabled: true, cells: { asia: { choch_long: "disabled" } } }) === true, "active when a cell disabled");
ok(isProfilesActive({ enabled: true, cells: { asia: { choch_long: "enabled" } } }) === false, "inactive when only enabled");
ok(normalizeProfiles(null).enabled === false, "null → empty disabled profiles");

// ── 8. integration through resolveTradeUniverse (the real wiring) ─────────────
console.log("\n[8] resolveTradeUniverse integration");
const bundle = { trades: TRADES.slice(), tradesByVariant: { single_position: TRADES.slice() }, primaryVariant: "single_position" };
const baseScn = { family: "baseline", positionVariant: "single_position" };
const noProfile = resolveTradeUniverse({ bundle, scenario: baseScn, fallbackVariant: "single_position" });
ok(noProfile.trades.length === TRADES.length, "no sessionProfiles → full universe");
ok(!noProfile.warnings.some((w) => w.code === "SESSION_PROFILE_MASK"), "no mask warning when absent");
ok(!noProfile.sessionProfile, "no sessionProfile attribution when absent");

const withProfile = resolveTradeUniverse({
    bundle,
    scenario: { ...baseScn, sessionProfiles: { enabled: true, cells: { asia: { choch_long: "disabled" } } } },
    fallbackVariant: "single_position",
});
ok(withProfile.trades.length === TRADES.length - 1, "resolveTradeUniverse applies the mask");
ok(sessOf(withProfile, "asia", "choch_long") === 0, "Asia CHoCH Long removed via resolveTradeUniverse");
ok(withProfile.sessionProfile?.active === true, "attribution present via resolveTradeUniverse");

// ── 9. no backend run required (structural) ──────────────────────────────────
console.log("\n[9] no backend dependency");
const srcText = fs.readFileSync(path.resolve("src/data/sessionProfiles.js"), "utf8");
ok(!/fetch\(|sidecar|axios|XMLHttpRequest|\/runs/.test(srcText), "sessionProfiles.js has no network/run calls");

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
