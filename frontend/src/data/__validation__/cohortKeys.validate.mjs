// cohortKeys.validate.mjs — 4-Layer Strategy Builder P0 (extract cohort primitives).
//
// Proves the extraction of cohort/entry-key primitives into data/cohortKeys.js is
// byte-identical and that the sessionProfiles.js re-export shim + the sessionResults.js
// repoint keep working:
//   • SESSIONS/CELLS/SESSION_KEYS/CELL_KEYS from cohortKeys === sessionProfiles (shim)
//   • cohortOf returns identical cohort keys (cohortKeys === sessionProfiles) for trades
//   • buildEntryKey identical: baseline / triggered-edge / penetration / deep-arm
//   • armToFillMode outputs identical to the documented mapping
//   • sessionResults.js still works after importing primitives from cohortKeys
//   • no mutation of inputs
//
// Run from frontend/:  node src/data/__validation__/cohortKeys.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function loadCjs(absPath) {
    const resolved = path.resolve(absPath.endsWith(".js") ? absPath : `${absPath}.js`);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const { code } = babel.transformSync(fs.readFileSync(resolved, "utf8"), {
        filename: resolved,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(resolved, mod);
    const req = (spec) => { if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec)); throw new Error(`unexpected non-relative import: ${spec}`); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const ck = loadCjs("src/data/cohortKeys.js");
const sp = loadCjs("src/data/sessionProfiles.js");          // re-export shim
const sr = loadCjs("src/data/sessionResults.js");           // now imports from cohortKeys

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. axis constants: cohortKeys === sessionProfiles re-export ─────────────────
console.log("\n[1] axis constants parity (cohortKeys ↔ sessionProfiles shim)");
ok(eq(ck.SESSIONS, sp.SESSIONS) && ck.SESSIONS.length === 6, "SESSIONS identical (6 rows)");
ok(eq(ck.CELLS, sp.CELLS) && ck.CELLS.length === 4, "CELLS identical (4 cells)");
ok(eq(ck.SESSION_KEYS, sp.SESSION_KEYS) && eq(ck.SESSION_KEYS, ["london", "lull", "newYork", "ny_pm", "asia", "outside"]), "SESSION_KEYS identical + expected order");
ok(eq(ck.CELL_KEYS, sp.CELL_KEYS) && eq(ck.CELL_KEYS, ["bos_long", "bos_short", "choch_long", "choch_short"]), "CELL_KEYS identical + expected order");
ok(sp.SESSIONS === ck.SESSIONS, "shim re-exports the SAME SESSIONS reference (true re-export)");

// ── 2. cohortOf parity for representative trades ───────────────────────────────
console.log("\n[2] cohortOf parity");
const TRADES = [
    { fill_session: "London", structure: "CHoCH", direction: "Long" },         // london|choch_long
    { fill_session: "New York PM", structure: "BOS", direction: "Short" },     // ny_pm|bos_short
    { session: "Asia", structure_tag: "BOS", side: "buy" },                    // asia|bos_long
    { fillSession: "Outside", structureType: "CHOCH", dir: "sell" },           // outside|choch_short
    { fill_session: "", structure: "BOS", direction: "Long" },                 // unknown|bos_long
];
const EXPECT = ["london|choch_long", "ny_pm|bos_short", "asia|bos_long", "outside|choch_short", "unknown|bos_long"];
TRADES.forEach((t, i) => {
    ok(ck.cohortOf(t) === EXPECT[i], `cohortOf #${i} → ${EXPECT[i]} (got ${ck.cohortOf(t)})`);
    ok(ck.cohortOf(t) === sp.cohortOf(t), `cohortOf #${i} cohortKeys === sessionProfiles`);
});

// ── 3. buildEntryKey parity ────────────────────────────────────────────────────
console.log("\n[3] buildEntryKey parity (baseline / TE / penetration / deep-arm)");
const BE_CASES = [
    [{ model: "baseline" }, "baseline"],
    [null, "baseline"],
    [{ model: "triggered_edge", threshold: 25, arm: "C40" }, "entry_triggered_edge_25p0_d40"],
    [{ model: "triggered_edge", threshold: 25, arm: "same" }, "entry_triggered_edge_25p0_same"],
    [{ model: "triggered_edge", threshold: 10, arm: "C20" }, "entry_triggered_edge_10p0_d20"],
    [{ model: "triggered_edge", threshold: 0.5, arm: "d50" }, "entry_triggered_edge_0p5_d50"],
    [{ model: "penetration", threshold: 10 }, "entry_penetration_10p0"],
];
BE_CASES.forEach(([sel, expect], i) => {
    ok(ck.buildEntryKey(sel) === expect, `buildEntryKey #${i} → ${expect} (got ${ck.buildEntryKey(sel)})`);
    ok(ck.buildEntryKey(sel) === sp.buildEntryKey(sel), `buildEntryKey #${i} cohortKeys === sessionProfiles`);
});

// ── 4. armToFillMode outputs ───────────────────────────────────────────────────
console.log("\n[4] armToFillMode mapping");
const ARM_CASES = [["same", "same"], ["next", "next"], ["c0", "same"], ["c1", "next"], ["C2", "d2"], ["C40", "d40"], ["d50", "d50"], ["5", "d5"], [null, null]];
ARM_CASES.forEach(([arm, expect], i) => {
    ok(ck.armToFillMode(arm) === expect, `armToFillMode(${JSON.stringify(arm)}) → ${JSON.stringify(expect)} (got ${JSON.stringify(ck.armToFillMode(arm))})`);
});

// ── 5. sessionResults still works after repoint to cohortKeys ──────────────────
console.log("\n[5] sessionResults integration (imports primitives from cohortKeys)");
{
    const trades = [
        { fill_session: "London", structure: "CHoCH", direction: "Long", outcome: "Win", r: 2 },
        { fill_session: "Asia", structure: "BOS", direction: "Long", outcome: "Loss", r: -1 },
    ];
    const res = sr.buildSessionResults(trades, null);
    ok(res && Array.isArray(res.sessions) && res.sessions.length === ck.SESSION_KEYS.length, `buildSessionResults returns the fixed ${ck.SESSION_KEYS.length}-session grid`);
    const empty = sr.buildSessionResults([], null);
    ok(empty && Array.isArray(empty.sessions) && empty.sessions.length === 6, "buildSessionResults([],null) safe → 6-session grid");
}

// ── 6b. canonicalSession — NY PM first-class (P0.5) ────────────────────────────
console.log("\n[6b] canonicalSession NY PM");
ok(ck.canonicalSession("NY PM") === "ny_pm", "canonicalSession('NY PM') → ny_pm");
ok(ck.canonicalSession("New York PM") === "ny_pm", "canonicalSession('New York PM') → ny_pm");
ok(ck.canonicalSession("New York") === "newYork", "canonicalSession('New York') → newYork (AM only)");
ok(ck.SESSION_KEYS.includes("ny_pm") && ck.SESSION_KEYS.length === 6, "SESSION_KEYS includes ny_pm (6 sessions)");
ok(ck.SESSIONS.find((s) => s.key === "ny_pm")?.label === "NY PM", "SESSIONS has the NY PM row/label");

// ── 6. no mutation ──────────────────────────────────────────────────────────────
console.log("\n[6] no mutation");
{
    const t = Object.freeze({ fill_session: "London", structure: "CHoCH", direction: "Long" });
    const snap = JSON.stringify(t);
    ck.cohortOf(t); ck.tradeCellKey(t); ck.canonicalSession(ck.tradeSessionRaw(t));
    ck.buildEntryKey(Object.freeze({ model: "triggered_edge", threshold: 25, arm: "C40" }));
    ok(JSON.stringify(t) === snap, "cohortOf/tradeCellKey/buildEntryKey do not mutate inputs");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
