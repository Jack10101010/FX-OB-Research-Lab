// sessionProvenance.validate.mjs — SESSION-STRATEGY-PORTFOLIO Phase 2A.2a.
//
// Verifies the provenance + effective-value core (pure data derivations):
//   resolveCohortProvenance / resolveCohortAvailability / buildEffectivePortfolioMap
// and that resolveCohortConfig's PUBLIC shape is unchanged (parity), Baseline
// Control is ignored, availability is pair-aware via the bundle only, and there
// are no backend/replay/pair-literal dependencies.
//
// Run from frontend/:  node src/data/__validation__/sessionProvenance.validate.mjs

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
const be = loadCjs("src/data/beResolve.js");
const {
    normalizeProfiles, resolveCohortConfig, resolveCohortProvenance, resolveCohortAvailability,
    buildEffectivePortfolioMap, entryProfileId, beProfileId, SESSION_KEYS, CELL_KEYS,
} = sp;
const { beScenarioKey } = be;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── fixtures ─────────────────────────────────────────────────────────────────
const TE = { model: "triggered_edge", threshold: 25, arm: "d2" };
const TE_ID = entryProfileId(TE);                 // entry_te_25_d2
const TE_KEY = "entry_triggered_edge_25p0_d2";
const BE = { trigger: "wick", armR: 1.0 };
const BE_ID = beProfileId(BE);                     // be_wick_1
const BE_CELL = beScenarioKey("wick", 1.0);        // be_wick_1p00R

// Bundle A = pair with TE variant + BE cell exported. Bundle B = pair WITHOUT TE.
const mkBundle = (sym, withTE) => ({
    symbol: sym,
    entryResults: { tradesByMode: { entry_baseline: [{ id: "b1" }], ...(withTE ? { [TE_KEY]: [{ id: "t1" }] } : {}) } },
    beResults: withTE ? { single_position: { [TE_KEY]: { [BE_CELL]: {} } } } : {},
    beTradesByMode: withTE ? { single_position: { [TE_KEY]: { [BE_CELL]: [{ id: "be1" }] } } } : {},
});
const bundleA = mkBundle("PAIR_A", true);
const bundleB = mkBundle("PAIR_B", false);
const V = "single_position";

const P = (raw) => normalizeProfiles(raw);
const withProfiles = (extra) => ({ enabled: true, profiles: { entry: { [TE_ID]: TE }, be: { [BE_ID]: BE } }, ...extra });

// ── 1. global default inherited by all ───────────────────────────────────────
console.log("\n[1] global default inherited");
{
    const p = P(withProfiles({ globalDefaultRef: { entry: TE_ID } }));
    const pr = resolveCohortProvenance(p, "asia", "choch_long");
    ok(pr.entry.source === "global-default" && pr.entry.inherited && !pr.entry.explicit, "entry source=global-default, inherited");
    ok(eq(pr.entry.sel, TE), "entry sel resolves to TE");
    ok(pr.be.source === "none", "be source=none (no global be)");
}

// ── 2. session default overrides global ──────────────────────────────────────
console.log("\n[2] session default > global");
{
    const p = P(withProfiles({ globalDefaultRef: { entry: TE_ID }, cards: { asia: { enabled: true, default: { entryRef: TE_ID }, overrides: {} } } }));
    const pr = resolveCohortProvenance(p, "asia", "bos_short");
    ok(pr.entry.source === "session-default" && !pr.entry.explicit, "entry source=session-default");
}

// ── 3. cohort override > session ─────────────────────────────────────────────
console.log("\n[3] cohort > session");
{
    const p = P(withProfiles({ cards: { asia: { enabled: true, default: { entryRef: TE_ID }, overrides: { choch_long: { entryRef: TE_ID } } } } }));
    const pr = resolveCohortProvenance(p, "asia", "choch_long");
    ok(pr.entry.source === "cohort" && pr.entry.explicit, "entry source=cohort, explicit");
}

// ── 4. mixed provenance: entry cohort, BE global ─────────────────────────────
console.log("\n[4] mixed provenance");
{
    const p = P(withProfiles({ globalDefaultRef: { be: BE_ID }, cards: { asia: { enabled: true, default: {}, overrides: { choch_long: { entryRef: TE_ID } } } } }));
    const pr = resolveCohortProvenance(p, "asia", "choch_long");
    ok(pr.entry.source === "cohort" && pr.be.source === "global-default", "entry=cohort, be=global-default");
}

// ── 5. disabled session ──────────────────────────────────────────────────────
console.log("\n[5] disabled session");
{
    const p = P({ enabled: true, cards: { london: { enabled: false, default: {}, overrides: {} } } });
    const pr = resolveCohortProvenance(p, "london", "bos_long");
    ok(pr.disabled && pr.enable.source === "session-disabled", "disabled via session");
    ok(pr.entry.source === "none" && pr.entry.sel === null, "entry none when disabled");
}

// ── 6. disabled cohort ───────────────────────────────────────────────────────
console.log("\n[6] disabled cohort");
{
    const p = P({ enabled: true, cards: { asia: { enabled: true, default: {}, overrides: { bos_short: { enabled: false } } } } });
    const pr = resolveCohortProvenance(p, "asia", "bos_short");
    ok(pr.disabled && pr.enable.source === "cohort", "disabled via cohort");
}

// ── 7. no default → base universe ────────────────────────────────────────────
console.log("\n[7] no default → base");
{
    const p = P({ enabled: true });
    const pr = resolveCohortProvenance(p, "asia", "choch_long");
    const av = resolveCohortAvailability(p, bundleA, V, "asia", "choch_long");
    ok(pr.entry.source === "none" && pr.entry.sel === null, "entry none");
    ok(av.entry.status === "na", "availability na for base");
}

// ── 8. unavailable entry profile ─────────────────────────────────────────────
console.log("\n[8] unavailable entry");
{
    const p = P(withProfiles({ cards: { asia: { enabled: true, default: {}, overrides: { choch_long: { entryRef: TE_ID } } } } }));
    const avA = resolveCohortAvailability(p, bundleA, V, "asia", "choch_long");
    const avB = resolveCohortAvailability(p, bundleB, V, "asia", "choch_long");
    ok(avA.entry.status === "available", "available on pair A (has TE)");
    ok(avB.entry.status === "unavailable", "unavailable on pair B (no TE)");
    const mapB = buildEffectivePortfolioMap(p, bundleB, V);
    ok(mapB.cells["asia|choch_long"].effective.usingBaseEntry === true, "usingBaseEntry true when entry unavailable");
}

// ── 9. unavailable BE cell ───────────────────────────────────────────────────
console.log("\n[9] unavailable BE");
{
    const p = P(withProfiles({ cards: { asia: { enabled: true, default: {}, overrides: { choch_long: { entryRef: TE_ID, beRef: BE_ID } } } } }));
    ok(resolveCohortAvailability(p, bundleA, V, "asia", "choch_long").be.status === "available", "BE available on pair A");
    ok(resolveCohortAvailability(p, bundleB, V, "asia", "choch_long").be.status === "unavailable", "BE unavailable on pair B");
}

// ── 10. NY PM independent from New York ──────────────────────────────────────
console.log("\n[10] NY PM independent");
{
    const p = P({ enabled: true, cards: { ny_pm: { enabled: true, default: {}, overrides: { bos_short: { enabled: false } } } } });
    ok(resolveCohortProvenance(p, "ny_pm", "bos_short").disabled === true, "NY PM bos_short disabled");
    ok(resolveCohortProvenance(p, "newYork", "bos_short").disabled === false, "New York bos_short unaffected");
}

// ── 11. baseline control does not affect provenance ──────────────────────────
console.log("\n[11] control ignored");
{
    const base = P(withProfiles({ globalDefaultRef: { entry: TE_ID } }));
    const withCtrl = P(withProfiles({ globalDefaultRef: { entry: TE_ID }, control: { baselineProfileRef: TE_ID } }));
    ok(eq(buildEffectivePortfolioMap(base, bundleA, V).cells, buildEffectivePortfolioMap(withCtrl, bundleA, V).cells), "effective map identical regardless of control ref");
}

// ── 12. dangling refs normalized away ────────────────────────────────────────
console.log("\n[12] dangling refs");
{
    const p = P({ enabled: true, cards: { asia: { enabled: true, default: {}, overrides: { choch_long: { entryRef: "nope" } } } } });
    ok(resolveCohortProvenance(p, "asia", "choch_long").entry.source === "none", "dangling ref → none");
}

// ── 13. parity with resolveCohortConfig ──────────────────────────────────────
console.log("\n[13] parity vs resolveCohortConfig");
{
    const cfgs = [
        P({ enabled: true }),
        P(withProfiles({ globalDefaultRef: { entry: TE_ID, be: BE_ID } })),
        P(withProfiles({ cards: { asia: { enabled: true, default: { entryRef: TE_ID }, overrides: { choch_long: { entryRef: TE_ID, beRef: BE_ID }, bos_long: { enabled: false } } } } })),
        P({ enabled: true, cards: { london: { enabled: false, default: {}, overrides: {} } } }),
    ];
    let parityOk = true;
    for (const p of cfgs) for (const s of SESSION_KEYS) for (const c of CELL_KEYS) {
        const cc = resolveCohortConfig(p, s, c);
        const pr = resolveCohortProvenance(p, s, c);
        if (cc.disabled !== pr.disabled) parityOk = false;
        if (!eq(cc.entry, pr.disabled ? null : pr.entry.sel)) parityOk = false;
        if (!eq(cc.be, pr.disabled ? null : pr.be.sel)) parityOk = false;
        if ((cc.entryRef || null) !== (pr.disabled ? null : pr.entry.ref)) parityOk = false;
    }
    ok(parityOk, "provenance.sel/ref/disabled match resolveCohortConfig across config matrix");
}

// ── 14. structural ───────────────────────────────────────────────────────────
console.log("\n[14] structural");
{
    const src = fs.readFileSync(path.resolve("src/data/sessionProfiles.js"), "utf8");
    ok(!/fetch\(|sidecar|axios|XMLHttpRequest|\/runs/.test(src), "no network/run calls");
    ok(!/beReplay|replay\(/i.test(src), "no replay");
    ok(!/EURUSD|GBPUSD/.test(src), "no pair literals");
}

// ── 15. pair-aware, config pair-agnostic ─────────────────────────────────────
console.log("\n[15] pair-aware / config pair-agnostic");
{
    const p = P(withProfiles({ globalDefaultRef: { entry: TE_ID } }));
    const prA = resolveCohortProvenance(p, "asia", "choch_long");
    const prB = resolveCohortProvenance(p, "asia", "choch_long");
    ok(eq(prA, prB), "provenance identical regardless of pair (no bundle input)");
    ok(buildEffectivePortfolioMap(p, bundleA, V).pair === "PAIR_A", "map.pair read from bundle A");
    ok(buildEffectivePortfolioMap(p, bundleB, V).pair === "PAIR_B", "map.pair read from bundle B");
    ok(buildEffectivePortfolioMap(p, bundleA, V).cells["asia|choch_long"].availability.entry.status === "available", "available on A");
    ok(buildEffectivePortfolioMap(p, bundleB, V).cells["asia|choch_long"].availability.entry.status === "unavailable", "unavailable on B (same config)");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
