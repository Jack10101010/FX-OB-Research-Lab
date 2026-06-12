// loserRunUp.validate.mjs — pure Trade Outcome & Loser Run-Up breakdown.
//
// Verifies: win/loss/performance counting via the canonical predicates, win% and
// avg/median R, loser MFE (median/avg + ≥0.5/1/1.5/2R reach counts), the
// unavailable state when no loser carries mfe_r (null, never 0), cohort splits
// (direction / structure / structure×direction / sessions), and empty-input safety.
//
// Run from frontend/:  node src/data/__validation__/loserRunUp.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

// Transpile + load an ESM source file to CJS. The require shim resolves sibling
// data-layer imports (e.g. ./tradeClassification) by recursively loading them; since
// tradeClassification.js is itself import-free, recursion bottoms out immediately.
const cache = new Map();
function loadModule(absPath) {
    if (cache.has(absPath)) return cache.get(absPath);
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(absPath, mod.exports);
    const requireShim = (spec) => {
        if (spec.startsWith(".")) {
            let p = path.resolve(path.dirname(absPath), spec);
            if (!p.endsWith(".js")) p += ".js";
            return loadModule(p);
        }
        return {};
    };
    new Function("require", "module", "exports", code)(requireShim, mod, mod.exports);
    cache.set(absPath, mod.exports);
    return mod.exports;
}

const { buildLoserRunUp, cohortStats, loserMaxROf, R_REACH_THRESHOLDS } =
    loadModule(path.resolve("src/data/loserRunUp.js"));

let pass = 0, fail = 0;
const approx = (a, b, eps = 1e-9) => a != null && b != null && Math.abs(a - b) < eps;
function check(name, cond) {
    if (cond) { pass++; } else { fail++; console.error("  ✗ FAIL:", name); }
}

// ── Fixtures ────────────────────────────────────────────────────────────────
// outcome "Win"/"Loss" drives the canonical classifier; mfe_r is the loser run-up.
const T = (o) => ({ direction: "Long", structure: "BOS", fillSession: "London",
    entry_price: 1, stop: 0.9, ...o });

const winsAndLosersWithMfe = [
    T({ outcome: "Win",  net_r: 2 }),
    T({ outcome: "Win",  net_r: 2 }),
    T({ outcome: "Win",  net_r: 2 }),
    T({ outcome: "Loss", net_r: -1, mfe_r: 0.4 }),  // reached < 0.5
    T({ outcome: "Loss", net_r: -1, mfe_r: 0.8 }),  // ≥0.5
    T({ outcome: "Loss", net_r: -1, mfe_r: 1.2 }),  // ≥0.5, ≥1
    T({ outcome: "Loss", net_r: -1, mfe_r: 2.5 }),  // ≥0.5, ≥1, ≥1.5, ≥2
];

// ── Test 1: counts, win%, R stats ─────────────────────────────────────────────
const s = cohortStats(winsAndLosersWithMfe);
check("trades = 7", s.trades === 7);
check("wins = 3", s.wins === 3);
check("losses = 4", s.losses === 4);
check("winRate = 3/7", approx(s.winRate, 3 / 7));
check("avgR = (6-4)/7", approx(s.avgR, (6 - 4) / 7));
check("medianR = -1 (sorted middle)", s.medianR === -1);

// ── Test 2: loser MFE median / avg / reach ────────────────────────────────────
check("loserMfeAvailable true", s.loserMfeAvailable === true);
check("loserMfeCount = 4", s.loserMfeCount === 4);
check("loserMedianMaxR = (0.8+1.2)/2 = 1.0", approx(s.loserMedianMaxR, 1.0));
check("loserAvgMaxR = (0.4+0.8+1.2+2.5)/4", approx(s.loserAvgMaxR, (0.4 + 0.8 + 1.2 + 2.5) / 4));
check("reach ≥0.5 = 3", s.loserReach[0.5] === 3);
check("reach ≥1 = 2", s.loserReach[1] === 2);
check("reach ≥1.5 = 1", s.loserReach[1.5] === 1);
check("reach ≥2 = 1", s.loserReach[2] === 1);

// ── Test 3: unavailable state — losers but NO mfe_r → null, never 0 ───────────
const noMfe = [T({ outcome: "Win", net_r: 1 }), T({ outcome: "Loss", net_r: -1 })];
const sNo = cohortStats(noMfe);
check("no-mfe: loserMfeAvailable false", sNo.loserMfeAvailable === false);
check("no-mfe: loserMedianMaxR null (not 0)", sNo.loserMedianMaxR === null);
check("no-mfe: loserAvgMaxR null (not 0)", sNo.loserAvgMaxR === null);
check("no-mfe: reach ≥1 null (not 0)", sNo.loserReach[1] === null);
check("no-mfe: still counts losses", sNo.losses === 1 && sNo.wins === 1);

// ── Test 4: thresholds export ─────────────────────────────────────────────────
check("R thresholds = [0.5,1,1.5,2]", JSON.stringify(R_REACH_THRESHOLDS) === JSON.stringify([0.5, 1, 1.5, 2]));

// ── Test 5: full breakdown — groups + cohort splits ───────────────────────────
const mixed = [
    T({ direction: "Long",  structure: "BOS",   outcome: "Win",  net_r: 2 }),
    T({ direction: "Short", structure: "CHoCH", outcome: "Loss", net_r: -1, mfe_r: 1.5, fillSession: "New York" }),
    T({ direction: "Short", structure: "BOS",   outcome: "Loss", net_r: -1, mfe_r: 0.3, fillSession: "New York" }),
    T({ direction: "Long",  structure: "CHoCH", outcome: "Win",  net_r: 3 }),
];
const bd = buildLoserRunUp(mixed);
check("available true (a loser has mfe_r)", bd.available === true);
check("totalTrades = 4", bd.totalTrades === 4);
check("performanceTrades = 4", bd.performanceTrades === 4);
const gid = (id) => bd.groups.find((g) => g.id === id);
check("has All group", gid("all")?.rows.length === 1);
check("Direction has Long+Short", gid("direction")?.rows.length === 2);
check("Structure has BOS+CHoCH", gid("structure")?.rows.length === 2);
check("Structure×Direction has 4 rows", gid("structure_direction")?.rows.length === 4);
const bosLong = gid("structure_direction").rows.find((r) => r.label === "BOS Long");
check("BOS Long: 1 trade, 1 win", bosLong.stats.trades === 1 && bosLong.stats.wins === 1);
const chochShort = gid("structure_direction").rows.find((r) => r.label === "CHoCH Short");
check("CHoCH Short loserMedianMaxR = 1.5", approx(chochShort.stats.loserMedianMaxR, 1.5));
check("Fill session group present (London absent → NY only)", gid("fill_session")?.rows.some((r) => r.label === "New York"));
check("Origin session group omitted when no origin data", gid("origin_session") === undefined);

// ── Test 6: empty input safety ────────────────────────────────────────────────
const empty = buildLoserRunUp([]);
check("empty: available false", empty.available === false);
check("empty: All row trades = 0", gidEmpty(empty, "all").rows[0].stats.trades === 0);
check("empty: All row loserMedianMaxR null", gidEmpty(empty, "all").rows[0].stats.loserMedianMaxR === null);
function gidEmpty(b, id) { return b.groups.find((g) => g.id === id); }
check("loserMaxROf reads camelCase mfeR", loserMaxROf({ mfeR: 1.3 }) === 1.3);
check("loserMaxROf blank → null", loserMaxROf({ mfe_r: "" }) === null);

// ── Result ────────────────────────────────────────────────────────────────────
console.log(`\nloserRunUp.validate: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
