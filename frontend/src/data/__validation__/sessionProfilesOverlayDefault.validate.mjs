// sessionProfilesOverlayDefault.validate.mjs — SESSION-CARD-OVERLAY-DEFAULT-OFF.
//
// Locks the rule that the global frontend session-card matrix
// (`fxob_session_profiles_v1`) is NEVER applied to the canonical trade universe by
// default — it is preview-only, opt-in via `getTradeUniverse(..., { sessionProfilesPreview:true })`.
//
// `getTradeUniverse` itself is a stateful store read (not node-loadable), but it is a
// thin wrapper: the DEFAULT path passes the bare scenario to `resolveTradeUniverse`,
// and the PREVIEW path passes `scenarioWithSessionProfiles(scenario)` (the scenario
// with the matrix attached). This validator exercises both shapes directly against
// the real `resolveTradeUniverse` + `applySessionProfiles`, using the exact broken
// matrix we found in production (global ENABLED, `choch_long.enabled=false` WITH a
// target set — internally inconsistent — while `bos_long` stays enabled).
//
// Asserts:
//   • the matrix is "active" (enabled + CHoCH disabled),
//   • DEFAULT path (no sessionProfiles on the scenario) → UNMASKED baked result,
//   • PREVIEW path (sessionProfiles attached) → MASKED (CHoCH removed, even though a
//     target is set on it; BOS Long unchanged),
//   • BOS Long is identical between default and preview.
//
// Run from frontend/:  node src/data/__validation__/sessionProfilesOverlayDefault.validate.mjs

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
const { normalizeProfiles, isProfilesActive, cohortOf } = sp;
const { resolveTradeUniverse } = tu;

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ FAIL: ${msg}`); } };

// ── fixtures: one baseline trade per (session × cell) = 24 baked trades ─────────
const SESS = [["London", "london"], ["London Lull", "lull"], ["New York", "newYork"], ["NY PM", "ny_pm"], ["Asia", "asia"], ["Outside", "outside"]];
const CELLS = [["bos_long", "BOS", "Long"], ["bos_short", "BOS", "Short"], ["choch_long", "CHoCH", "Long"], ["choch_short", "CHoCH", "Short"]];
let _id = 0;
const build = () => {
    const o = [];
    for (const [s] of SESS) for (const [, st, d] of CELLS) {
        o.push({ id: `t-${++_id}`, fillSession: s, structure: st, direction: d, r: d === "Long" ? 1 : -1, outcome: d === "Long" ? "Win" : "Loss" });
    }
    return o;
};
const BASE = build();                       // 24 trades (6 per cell)
const bundle = {
    trades: BASE.slice(),
    tradesByVariant: { single_position: BASE.slice() },
    primaryVariant: "single_position",
    entryResults: { tradesByMode: { entry_baseline: BASE.slice() } },
};

// The EXACT broken production matrix: CHoCH disabled (with a target set — the
// internally-inconsistent state), BOS Long left enabled (also with a target).
const cards = {};
for (const [, sk] of SESS) {
    cards[sk] = {
        enabled: true,
        default: {},
        overrides: {
            choch_long:  { enabled: false, target: { value: 2 } },   // disabled BUT target set
            choch_short: { enabled: false },
            bos_short:   { enabled: false },
            bos_long:    { target: { value: 5 } },                    // enabled (no enabled:false), target set
        },
    };
}
const matrix = normalizeProfiles({ enabled: true, cards });

const baseScenario = { family: "baseline", threshold: null, fillMode: null };
const countCell = (trades, cell) => trades.filter((t) => cohortOf(t).endsWith(`|${cell}`)).length;
const hasWarn = (u, code) => (u.warnings || []).some((w) => w.code === code);

// ── 1. the matrix is active (enabled + CHoCH disabled) ─────────────────────────
console.log("\n[1] matrix is active");
ok(isProfilesActive(matrix) === true, "global sessionProfiles enabled + CHoCH disabled → isProfilesActive true");

// ── 2. DEFAULT canonical path (scenario WITHOUT sessionProfiles) → UNMASKED ─────
console.log("\n[2] default canonical getTradeUniverse path = unmasked baked result");
const def = resolveTradeUniverse({ bundle, scenario: baseScenario, fallbackVariant: "single_position" });
ok(def.trades.length === BASE.length, `all ${BASE.length} baked trades present (got ${def.trades.length})`);
ok(!hasWarn(def, "SESSION_CARD_MASK"), "no SESSION_CARD_MASK warning");
ok(!/Session cards/.test(def.label || ""), "label not suffixed '· Session cards'");
ok(countCell(def.trades, "choch_long") === 6, "CHoCH Long present (6) — not masked");
ok(countCell(def.trades, "bos_long") === 6, "BOS Long present (6)");

// ── 3. PREVIEW opt-in path (scenarioWithSessionProfiles attaches the matrix) ────
console.log("\n[3] explicit preview path = masked");
const prev = resolveTradeUniverse({ bundle, scenario: { ...baseScenario, sessionProfiles: matrix }, fallbackVariant: "single_position" });
ok(prev.trades.length < BASE.length, `trades removed under preview (${prev.trades.length} < ${BASE.length})`);
ok(hasWarn(prev, "SESSION_CARD_MASK"), "SESSION_CARD_MASK emitted under preview");
ok(countCell(prev.trades, "choch_long") === 0, "CHoCH Long REMOVED under preview (disabled wins despite target set)");
ok(countCell(prev.trades, "choch_short") === 0, "CHoCH Short removed under preview (disabled)");

// ── 4. BOS Long enabled — unchanged in both paths ──────────────────────────────
console.log("\n[4] BOS Long unchanged");
ok(countCell(prev.trades, "bos_long") === 6, "BOS Long survives preview (enabled)");
ok(countCell(def.trades, "bos_long") === countCell(prev.trades, "bos_long"), "BOS Long count identical default vs preview");

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
