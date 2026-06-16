// sessionProfiles.validate.mjs — SESSION-STRATEGY-PORTFOLIO Phase 2A.1.
//
// Verifies the named-profile model:
//   • normalize: baseline seeded, empty global default, byte-identical-off
//   • migration: Phase-1 cells AND Phase-2A inline entry/be → deterministic refs
//   • ref-chain: cohort override → card default → global default → none
//   • named-profile lookup + dangling-ref drop
//   • entry SELECT via ref; EXACT BE SELECT via ref (no replay); not-available fallback
//   • disable cohort / disable session; NY PM first-class
//   • global default applies to all cohorts; countOverrides counts EXPLICIT only
//   • control summary (Live vs Control); pair-agnostic (no symbol literal)
//   • resolveTradeUniverse integration
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
    resolveCohortConfig, resolveControlSummary, cohortOf,
    entryProfileId, beProfileId, BASELINE_ENTRY_ID, SESSION_KEYS,
} = sp;
const { resolveTradeUniverse } = tu;
const { beScenarioKey } = be;

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ FAIL: ${msg}`); } };

// ── fixtures ─────────────────────────────────────────────────────────────────
const SESS = [["London Killzone","london"],["London Lull","lull"],["New York","newYork"],["NY PM","ny_pm"],["Asia","asia"],["Outside","outside"]];
const COH = [["bos_long","BOS","Long"],["bos_short","BOS","Short"],["choch_long","CHoCH","Long"],["choch_short","CHoCH","Short"]];
let _id = 0;
const build = (prefix, r) => { const o=[]; for (const [s] of SESS) for (const [,st,d] of COH) o.push({ id:`${prefix}-${++_id}`, fillSession:s, structure:st, direction:d, r, outcome:r>=0?"Win":"Loss" }); return o; };
const BASE = build("b", 1);
const TE = build("te", 2);
const TE_KEY = "entry_triggered_edge_25p0_d2";
const BE_KEY = beScenarioKey("wick", 1.0); // be_wick_1p00R
const BE_TRADES = [{ id:"be-NYPM", fillSession:"NY PM", structure:"BOS", direction:"Short", r:0, outcome:"Win" }];
const bundle = {
    trades: BASE.slice(), tradesByVariant: { single_position: BASE.slice() }, primaryVariant: "single_position", symbol: "GBPUSD",
    entryResults: { tradesByMode: { entry_baseline: BASE.slice(), [TE_KEY]: TE.slice() } },
    beResults: { single_position: { [TE_KEY]: { [BE_KEY]: {} } } },
    beTradesByMode: { single_position: { [TE_KEY]: { [BE_KEY]: BE_TRADES.slice() } } },
};
const universe = () => ({ universeType:"baseline", label:"Baseline", scenario:{family:"baseline",threshold:null,fillMode:null}, variant:"single_position", trades:BASE.slice(), stats:{total:BASE.length}, warnings:[], baselineTrades:BASE.slice(), baselineStats:{total:BASE.length} });
const countCohort = (t, ck) => t.filter((x) => cohortOf(x) === ck).length;
const idsCohort = (t, ck) => t.filter((x) => cohortOf(x) === ck).map((x) => x.id);
const TE_ENTRY = { model:"triggered_edge", threshold:25, arm:"d2" };
const TE_ID = entryProfileId(TE_ENTRY);   // entry_te_25_d2
const BE_ID = beProfileId({ trigger:"wick", armR:1.0 }); // be_wick_1

// ── 1. normalize shape + ids ─────────────────────────────────────────────────
console.log("\n[1] normalize + identity");
const e0 = normalizeProfiles(null);
ok(e0.profiles.entry[BASELINE_ENTRY_ID]?.model === "baseline", "baseline entry profile seeded");
ok(e0.globalDefaultRef.entry === null && e0.globalDefaultRef.be === null, "empty global default");
ok(e0.control.baselineProfileRef === BASELINE_ENTRY_ID, "control defaults to baseline");
ok(TE_ID === "entry_te_25_d2", "deterministic entry id");
ok(BE_ID === "be_wick_1", "deterministic be id");

// ── 2. migration ──────────────────────────────────────────────────────────────
console.log("\n[2] migration");
const migA = normalizeProfiles({ enabled:true, cards:{ asia:{ enabled:true, default:{}, overrides:{ choch_long:{ entry:TE_ENTRY, be:{trigger:"wick",armR:1} } } } } });
ok(!!migA.profiles.entry[TE_ID] && !!migA.profiles.be[BE_ID], "inline entry/be hoisted into library");
ok(migA.cards.asia.overrides.choch_long.entryRef === TE_ID && migA.cards.asia.overrides.choch_long.beRef === BE_ID, "inline rewritten to refs");
const migL = normalizeProfiles({ enabled:true, cells:{ asia:{ choch_long:"disabled" } } });
ok(migL.cards.asia.overrides.choch_long.enabled === false, "legacy cells → enabled:false");
const dangling = normalizeProfiles({ enabled:true, cards:{ asia:{ overrides:{ choch_long:{ entryRef:"nope" } } } } });
ok(!("entryRef" in (dangling.cards.asia?.overrides?.choch_long || {})), "dangling ref dropped");

// ── 3. byte-identical when inactive ──────────────────────────────────────────
console.log("\n[3] byte-identical (inactive)");
const u0 = universe();
ok(applySessionProfiles({ universe:u0, profiles: normalizeProfiles({enabled:false}), bundle }) === u0, "disabled → same ref");
ok(applySessionProfiles({ universe:u0, profiles: normalizeProfiles({enabled:true}), bundle }) === u0, "enabled but empty → same ref");
ok(applySessionProfiles({ universe:u0, profiles: dangling, bundle }) === u0, "only a dangling ref → same ref");

// ── 4. ref-chain entry SELECT ────────────────────────────────────────────────
console.log("\n[4] entry SELECT via ref");
const pEntry = normalizeProfiles({ enabled:true, profiles:{ entry:{ [TE_ID]:TE_ENTRY } }, cards:{ asia:{ enabled:true, default:{}, overrides:{ choch_long:{ entryRef:TE_ID } } } } });
const r4 = applySessionProfiles({ universe:universe(), bundle, variant:"single_position", profiles:pEntry });
ok(idsCohort(r4.trades, "asia|choch_long").every((id) => id.startsWith("te-")), "Asia CHoCH Long sourced from TE via ref");
ok(idsCohort(r4.trades, "asia|bos_short").every((id) => id.startsWith("b-")), "Asia BOS Short still baseline");
ok(r4.sessionCards?.swapped === 1, "swapped=1");

// ── 5. card default inheritance ──────────────────────────────────────────────
console.log("\n[5] card default inheritance");
const pDef = normalizeProfiles({ enabled:true, profiles:{ entry:{ [TE_ID]:TE_ENTRY } }, cards:{ asia:{ enabled:true, default:{ entryRef:TE_ID }, overrides:{ bos_long:{ entryRef:"" } } } } });
const cfgInherit = resolveCohortConfig(pDef, "asia", "bos_short"); // inherits card default
ok(cfgInherit.entry && cfgInherit.entry.arm === "d2", "cohort inherits card default entry");

// ── 6. global default applies to all cohorts ─────────────────────────────────
console.log("\n[6] global default");
const pGlobal = normalizeProfiles({ enabled:true, profiles:{ entry:{ [TE_ID]:TE_ENTRY } }, globalDefaultRef:{ entry:TE_ID } });
ok(isProfilesActive(pGlobal) === true, "global default makes it active");
const r6 = applySessionProfiles({ universe:universe(), bundle, variant:"single_position", profiles:pGlobal });
ok(r6.trades.every((t) => t.id.startsWith("te-")), "every governed cohort swapped to TE via global default");
ok(countOverrides(pGlobal) === 0, "countOverrides ignores global-default inheritance");

// ── 7. EXACT BE SELECT via ref (no replay) ───────────────────────────────────
console.log("\n[7] BE exact via ref");
const pBe = normalizeProfiles({ enabled:true, profiles:{ entry:{ [TE_ID]:TE_ENTRY }, be:{ [BE_ID]:{trigger:"wick",armR:1} } },
    cards:{ ny_pm:{ enabled:true, default:{}, overrides:{ bos_short:{ entryRef:TE_ID, beRef:BE_ID } } } } });
const r7 = applySessionProfiles({ universe:universe(), bundle, variant:"single_position", profiles:pBe });
ok(idsCohort(r7.trades, "ny_pm|bos_short").includes("be-NYPM"), "NY PM BOS Short from EXACT BE cell");
ok(r7.sessionCards?.beApplied === 1, "beApplied=1");

// ── 8. BE not available → keep entry, NO replay ──────────────────────────────
console.log("\n[8] BE not available");
const BE2 = beProfileId({ trigger:"close", armR:2 });
const pBeBad = normalizeProfiles({ enabled:true, profiles:{ be:{ [BE2]:{trigger:"close",armR:2} } },
    cards:{ london:{ enabled:true, default:{}, overrides:{ bos_long:{ beRef:BE2 } } } } });
const r8 = applySessionProfiles({ universe:universe(), bundle, variant:"single_position", profiles:pBeBad });
ok(idsCohort(r8.trades, "london|bos_long").every((id) => id.startsWith("b-")), "missing BE cell → kept base (no replay)");
ok(r8.warnings.some((w) => w.code === "SESSION_CARD_BE_UNAVAILABLE"), "BE-unavailable warning");

// ── 9. entry not available → fallback ────────────────────────────────────────
console.log("\n[9] entry not available");
const MISS = "entry_te_99_d2";
const pMiss = normalizeProfiles({ enabled:true, profiles:{ entry:{ [MISS]:{model:"triggered_edge",threshold:99,arm:"d2"} } },
    cards:{ outside:{ enabled:true, default:{}, overrides:{ choch_short:{ entryRef:MISS } } } } });
const r9 = applySessionProfiles({ universe:universe(), bundle, variant:"single_position", profiles:pMiss });
ok(idsCohort(r9.trades, "outside|choch_short").every((id) => id.startsWith("b-")), "missing entry variant → kept base");
ok(r9.warnings.some((w) => w.code === "SESSION_CARD_ENTRY_UNAVAILABLE"), "entry-unavailable warning");

// ── 10. disable cohort + session; NY PM first-class ──────────────────────────
console.log("\n[10] disable + NY PM");
const rDisCohort = applySessionProfiles({ universe:universe(), bundle, variant:"single_position",
    profiles: normalizeProfiles({ enabled:true, cards:{ ny_pm:{ enabled:true, default:{}, overrides:{ bos_short:{ enabled:false } } } } }) });
ok(countCohort(rDisCohort.trades, "ny_pm|bos_short") === 0 && countCohort(rDisCohort.trades, "newYork|bos_short") === 1, "NY PM BOS Short removed, New York untouched");
const rDisSess = applySessionProfiles({ universe:universe(), bundle, variant:"single_position",
    profiles: normalizeProfiles({ enabled:true, cards:{ london:{ enabled:false, default:{}, overrides:{} } } }) });
ok(rDisSess.trades.length === BASE.length - 4, "whole London session removed (4 cohorts)");
ok(SESSION_KEYS.includes("ny_pm"), "ny_pm is first-class");

// ── 11. control summary ──────────────────────────────────────────────────────
console.log("\n[11] control summary");
const ctrl = resolveControlSummary(bundle, normalizeProfiles({ enabled:true }));
ok(ctrl.available === true && ctrl.trades.every((t) => t.id.startsWith("b-")), "control resolves to baseline universe");
ok(ctrl.entryKey === "baseline", "control entryKey is baseline");

// ── 12. countOverrides explicit only ─────────────────────────────────────────
console.log("\n[12] countOverrides");
ok(countOverrides(pEntry) === 1, "one explicit cohort override counted");
ok(countOverrides(normalizeProfiles({ enabled:true, cards:{ london:{ enabled:false, default:{}, overrides:{} } } })) === 4, "session disable counts as 4");

// ── 13. resolveTradeUniverse integration ─────────────────────────────────────
console.log("\n[13] resolveTradeUniverse integration");
const noP = resolveTradeUniverse({ bundle, scenario:{ family:"baseline", positionVariant:"single_position" }, fallbackVariant:"single_position" });
ok(noP.trades.length === BASE.length && !noP.sessionCards, "no portfolio → full universe, no attribution");
const withP = resolveTradeUniverse({ bundle, fallbackVariant:"single_position",
    scenario:{ family:"baseline", positionVariant:"single_position", sessionProfiles: pEntry } });
ok(withP.sessionCards?.swapped === 1, "portfolio applied via resolveTradeUniverse");

// ── 14. structural: no backend / replay / symbol literals ────────────────────
console.log("\n[14] structural");
const srcText = fs.readFileSync(path.resolve("src/data/sessionProfiles.js"), "utf8");
ok(!/fetch\(|sidecar|axios|XMLHttpRequest|\/runs/.test(srcText), "no network/run calls");
ok(!/beReplay|replay\(/i.test(srcText), "no replay invoked");
ok(!/EURUSD|GBPUSD/.test(srcText), "no pair/symbol literals in resolver");
const uiText = fs.readFileSync(path.resolve("src/components/lab/sessionProfiles/SessionStrategyCards.jsx"), "utf8");
ok(!/EURUSD|GBPUSD/.test(uiText), "no pair/symbol literals in cards UI");

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
