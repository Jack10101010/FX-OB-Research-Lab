// scenarioModelWrite.validate.mjs — Session Scenario write helpers (Phase 2).
//
// Validates the pure scenario write layer in sessionProfiles.js: isAllGlobal,
// setScenarioEnabled, global/session/cohort writes, auto-create/reuse of named
// profiles, enabled tri-state, reset cohort, reset-all, no-mutation, normalized
// output. These are the single write layer SessionScenarioBuilder uses.
//
// Run from frontend/:  node src/data/__validation__/scenarioModelWrite.validate.mjs

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
    const req = (spec) => { if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec)); throw new Error(spec); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const sp = loadCjs("src/data/sessionProfiles.js");
const {
    emptyProfiles, normalizeProfiles, resolveCohortConfig, resolveCohortProvenance,
    SESSION_KEYS, CELL_KEYS, entryProfileId, beProfileId, targetProfileId,
    isAllGlobal, setScenarioEnabled, setGlobalDefaultValue, setSessionDefaultValue,
    setCohortValue, setCohortEnabled, resetCohort, resetAllToGlobal,
} = sp;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

const S = SESSION_KEYS[0];      // e.g. london
const S2 = SESSION_KEYS[1];
const C = CELL_KEYS[0];         // e.g. bos_long
const C2 = CELL_KEYS[1];
const TE25 = { model: "triggered_edge", threshold: 25, arm: "next" };
const BE1 = { trigger: "wick", armR: 1 };
const T2 = { type: "rr", value: 2 };

// 1. isAllGlobal ────────────────────────────────────────────────────────────────
console.log("\n[1] isAllGlobal");
{
    const base = normalizeProfiles({ enabled: true });
    ok(isAllGlobal(base) === true, "empty portfolio is all-global");
    ok(isAllGlobal(setCohortValue(base, S, C, "target", T2)) === false, "cohort override → not all-global");
    ok(isAllGlobal(setCohortEnabled(base, S, C, false)) === false, "cohort disable → not all-global");
    ok(isAllGlobal(setSessionDefaultValue(base, S, "be", BE1)) === false, "session default → not all-global");
    ok(isAllGlobal(setGlobalDefaultValue(base, "entry", TE25)) === true, "global default only → still all-global");
}

// 2. setScenarioEnabled ──────────────────────────────────────────────────────────
console.log("\n[2] setScenarioEnabled");
{
    const off = normalizeProfiles({ enabled: false });
    ok(setScenarioEnabled(off, true).enabled === true, "enable true");
    ok(setScenarioEnabled(off, false).enabled === false, "enable false");
}

// 3. global default writes + auto-create/reuse ───────────────────────────────────
console.log("\n[3] global default writes");
{
    const base = normalizeProfiles({ enabled: true });
    const g1 = setGlobalDefaultValue(base, "entry", TE25);
    const eid = entryProfileId(TE25);
    ok(g1.globalDefaultRef.entry === eid, "global entry ref set");
    ok(g1.profiles.entry[eid] && g1.profiles.entry[eid].threshold === 25, "entry profile auto-created");
    const g2 = setGlobalDefaultValue(g1, "target", T2);
    ok(g2.globalDefaultRef.target === targetProfileId(T2) && Object.keys(g2.profiles.target).length === 1, "target auto-created");
    // reuse: setting the SAME entry again does not add a duplicate profile
    const g3 = setGlobalDefaultValue(g2, "entry", TE25);
    ok(Object.keys(g3.profiles.entry).length === Object.keys(g2.profiles.entry).length, "identical selection reuses profile (no dup)");
    // clear
    const g4 = setGlobalDefaultValue(g3, "entry", null);
    ok(g4.globalDefaultRef.entry === null, "global entry cleared → null (run default)");
}

// 4. session default writes ───────────────────────────────────────────────────────
console.log("\n[4] session default writes");
{
    const base = normalizeProfiles({ enabled: true });
    const p = setSessionDefaultValue(base, S, "target", T2);
    ok(resolveCohortProvenance(p, S, C).target.source === "session-default", "session default applies to its cohorts");
    ok(resolveCohortProvenance(p, S2, C).target.source === "none", "other session unaffected");
    const cleared = setSessionDefaultValue(p, S, "target", null);
    ok(resolveCohortProvenance(cleared, S, C).target.source === "none", "session default cleared");
}

// 5. cohort writes (entry / BE / target) ─────────────────────────────────────────
console.log("\n[5] cohort writes");
{
    const base = normalizeProfiles({ enabled: true });
    const pe = setCohortValue(base, S, C, "entry", TE25);
    ok(resolveCohortConfig(pe, S, C).entry?.threshold === 25 && resolveCohortProvenance(pe, S, C).entry.source === "cohort", "cohort entry write");
    const pb = setCohortValue(pe, S, C, "be", BE1);
    ok(resolveCohortConfig(pb, S, C).be?.armR === 1, "cohort BE write");
    const pt = setCohortValue(pb, S, C, "target", T2);
    ok(resolveCohortConfig(pt, S, C).target?.value === 2, "cohort target (RR) write");
    ok(resolveCohortProvenance(pt, S, C2).entry.source === "none", "sibling cohort unaffected (selectivity)");
    // clear one dimension → falls back
    const cleared = setCohortValue(pt, S, C, "entry", null);
    ok(resolveCohortProvenance(cleared, S, C).entry.source === "none", "cohort entry cleared → inherit");
    ok(resolveCohortConfig(cleared, S, C).target?.value === 2, "other cohort dims retained after clearing one");
}

// 6. enabled tri-state ────────────────────────────────────────────────────────────
console.log("\n[6] cohort enabled tri-state");
{
    const base = normalizeProfiles({ enabled: true });
    const off = setCohortEnabled(base, S, C, false);
    ok(resolveCohortConfig(off, S, C).disabled === true, "enabled=false → disabled");
    const on = setCohortEnabled(off, S, C, true);
    ok(resolveCohortConfig(on, S, C).disabled === false, "enabled=true → enabled");
    const inherit = setCohortEnabled(off, S, C, null);
    ok(resolveCohortConfig(inherit, S, C).disabled === false, "enabled=null → inherit (on)");
}

// 7. resetCohort / resetAllToGlobal ──────────────────────────────────────────────
console.log("\n[7] reset");
{
    let p = normalizeProfiles({ enabled: true });
    p = setCohortValue(p, S, C, "target", T2);
    p = setCohortEnabled(p, S, C, false);
    const rc = resetCohort(p, S, C);
    ok(isAllGlobal(rc) === true, "resetCohort clears the cohort (back to all-global)");
    let q = normalizeProfiles({ enabled: true });
    q = setGlobalDefaultValue(q, "entry", TE25);
    q = setCohortValue(q, S, C, "target", T2);
    q = setSessionDefaultValue(q, S2, "be", BE1);
    const ra = resetAllToGlobal(q);
    ok(isAllGlobal(ra) === true, "resetAllToGlobal clears all sessions/cohorts");
    ok(ra.globalDefaultRef.entry === entryProfileId(TE25), "resetAllToGlobal keeps the Global defaults");
}

// 8. no mutation + normalized output ─────────────────────────────────────────────
console.log("\n[8] no mutation + normalized");
{
    const base = normalizeProfiles({ enabled: true });
    const snap = JSON.stringify(base);
    const out = setCohortValue(base, S, C, "target", T2);
    ok(JSON.stringify(base) === snap, "input not mutated");
    ok(out !== base, "returns a new object");
    // normalized: re-normalizing the output is a no-op (stable)
    ok(JSON.stringify(normalizeProfiles(out)) === JSON.stringify(out), "output is already normalized");
    // invalid dim / unknown session are no-ops (normalized passthrough)
    ok(JSON.stringify(setCohortValue(base, S, C, "bogus", T2)) === snap, "invalid dimension → no-op");
    ok(JSON.stringify(setCohortValue(base, "nope", C, "target", T2)) === snap, "unknown session → no-op");
}

// 9. custom RR targets (arbitrary decimal values) ────────────────────────────────
console.log("\n[9] custom RR targets");
{
    const base = normalizeProfiles({ enabled: true });
    const customs = [0.25, 0.5, 0.75, 1.2, 2.7, 10];
    for (const v of customs) {
        const sel = { type: "rr", value: v };
        const id = targetProfileId(sel);
        const g = setGlobalDefaultValue(base, "target", sel);
        ok(g.globalDefaultRef.target === id && g.profiles.target[id]?.value === v, `global custom target ${v}R → profile created (${id})`);
        const c = setCohortValue(base, S, C, "target", sel);
        ok(resolveCohortConfig(c, S, C).target?.value === v, `cohort custom target ${v}R resolves to value ${v}`);
    }
    // Deterministic, collision-free ids for fractional values.
    ok(targetProfileId({ type: "rr", value: 1.2 }) === "target_rr_1p2", "1.2R id = target_rr_1p2");
    ok(targetProfileId({ type: "rr", value: 0.25 }) === "target_rr_0p25", "0.25R id = target_rr_0p25");
    ok(targetProfileId({ type: "rr", value: 10 }) === "target_rr_10", "10R id = target_rr_10");
    ok(targetProfileId({ type: "rr", value: 1.2 }) !== targetProfileId({ type: "rr", value: 12 }), "1.2R and 12R ids differ");
    // Two distinct custom cohort targets coexist in the library.
    let p = setCohortValue(base, S, C, "target", { type: "rr", value: 1.2 });
    p = setCohortValue(p, S2, C, "target", { type: "rr", value: 2.7 });
    ok(resolveCohortConfig(p, S, C).target.value === 1.2 && resolveCohortConfig(p, S2, C).target.value === 2.7, "two custom cohort targets coexist");
    ok(Object.keys(p.profiles.target).length === 2, "two custom target profiles deduped into library");
    // Invalid customs rejected by the model (UI also guards, but model is authoritative).
    ok(JSON.stringify(setGlobalDefaultValue(base, "target", { type: "rr", value: 0 })) === JSON.stringify(base), "0R rejected (no-op)");
    ok(JSON.stringify(setGlobalDefaultValue(base, "target", { type: "rr", value: -3 })) === JSON.stringify(base), "negative RR rejected (no-op)");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
