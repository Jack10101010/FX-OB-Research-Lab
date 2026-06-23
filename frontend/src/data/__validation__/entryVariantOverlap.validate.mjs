// entryVariantOverlap.validate.mjs — DEEP-DELAY AUDIT: variant OB overlap.
//
// Validates buildEntryVariantOverlap: ob_id matching, fallback key, executed-only
// filtering (cancelled/missed/disabled excluded), overlap %s, improved/worsened/
// same-outcome counts, deltaR, onlyA/onlyB, and no mutation of inputs.
//
// Run from frontend/:  node src/data/__validation__/entryVariantOverlap.validate.mjs

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

const { buildEntryVariantOverlap, listEntryVariants, obMatchKey } = loadCjs("src/data/entryVariantOverlap.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

// ── fixtures ──────────────────────────────────────────────────────────────────
const tr = (ob, outcome, r, extra = {}) => ({ ob_id: ob, outcome, outcomeRaw: outcome, netR: r, net_r: r, fill_session: "London", structure_tag: "BOS", direction: "Long", ...extra });
const bundle = {
    entryResults: {
        tradesByMode: {
            baseline: [
                tr("OB1", "WIN", 2),
                tr("OB2", "LOSS", -1),
                tr("OB3", "WIN", 1),
                tr("OB9", "UNFILLED", 0),          // excluded (not executed)
                { ob_id: "OB8", outcome: "COHORT_DISABLED", outcomeRaw: "COHORT_DISABLED", netR: 0 }, // excluded
            ],
            entry_triggered_edge_25p0_d30: [
                tr("OB1", "WIN", 3),               // shared, improved (+1)
                tr("OB2", "WIN", 2),               // shared, improved (+3), outcome changed
                tr("OB4", "WIN", 2),               // only B
                tr("OB7", "NEWS_TOUCH_CANCEL", 0, { missed_trade: true }), // excluded
            ],
        },
    },
};
const snap = JSON.stringify(bundle);
const res = buildEntryVariantOverlap(bundle, "baseline", "entry_triggered_edge_25p0_d30");

console.log("\n[1] executed-only A/B stats (cancelled/missed/disabled excluded)");
ok(res.a.trades === 3 && res.a.netR === 2 && res.a.wins === 2 && res.a.losses === 1, "A = 3 executed, +2R, 2W/1L (UNFILLED + COHORT_DISABLED dropped)");
ok(res.b.trades === 3 && res.b.netR === 7 && res.b.wins === 3 && res.b.losses === 0, "B = 3 executed, +7R, 3W/0L (NEWS_TOUCH_CANCEL dropped)");

console.log("\n[2] overlap by ob_id");
ok(res.overlap.obCount === 2, "2 shared OBs (OB1, OB2)");
ok(res.overlap.pctOfA === Number(((2 / 3) * 100).toFixed(1)) && res.overlap.pctOfB === Number(((2 / 3) * 100).toFixed(1)), "pctOfA / pctOfB = 66.7%");
ok(res.overlap.netRA === 1 && res.overlap.netRB === 5, "shared netRA=+1, netRB=+5");

console.log("\n[3] improved / worsened / same-outcome");
ok(res.overlap.improvedCount === 2, "2 improved (both ΔR>0)");
ok(res.overlap.worsenedCount === 0, "0 worsened");
ok(res.overlap.sameOutcomeCount === 1, "1 same outcome (OB1 WIN→WIN; OB2 LOSS→WIN differs)");

console.log("\n[4] onlyA / onlyB");
ok(res.onlyA.count === 1 && res.onlyA.netR === 1, "onlyA = OB3 (1 trade, +1R)");
ok(res.onlyB.count === 1 && res.onlyB.netR === 2, "onlyB = OB4 (1 trade, +2R)");

console.log("\n[5] matchedRows + deltaR + sort");
ok(res.matchedRows.length === 2, "2 matched rows");
ok(res.matchedRows[0].key === "id:OB2" && res.matchedRows[0].deltaR === 3, "sorted by |ΔR|: OB2 first (ΔR +3)");
ok(res.matchedRows[1].key === "id:OB1" && res.matchedRows[1].deltaR === 1, "OB1 second (ΔR +1)");
const ob2 = res.matchedRows[0];
ok(ob2.aR === -1 && ob2.bR === 2 && ob2.aOutcome === "LOSS" && ob2.bOutcome === "WIN", "OB2 row: aR -1 (LOSS) → bR +2 (WIN)");
ok(ob2.session === "London" && ob2.structure === "BOS" && ob2.direction === "Long", "row carries session/structure/direction");

console.log("\n[6] fallback key (no ob_id → detection_time|structure|direction)");
ok(obMatchKey({ detection_time: "2025-01-01T00:00", structure_tag: "CHoCH", direction: "Short" }) === "k:2025-01-01T00:00|CHoCH|Short", "fallback key built from det/struct/dir");
ok(obMatchKey({ ob_id: "OB5" }) === "id:OB5", "ob_id preferred when present");
ok(obMatchKey({}) === null, "no identity → null key");
const fb = buildEntryVariantOverlap({
    entryResults: { tradesByMode: {
        a: [{ detection_time: "T1", structure_tag: "BOS", direction: "Long", outcome: "WIN", netR: 1 }],
        b: [{ detection_time: "T1", structure_tag: "BOS", direction: "Long", outcome: "WIN", netR: 2 }],
    } },
}, "a", "b");
ok(fb.overlap.obCount === 1 && fb.matchedRows[0].deltaR === 1, "fallback-keyed OB matches across variants (ΔR +1)");

console.log("\n[7] listEntryVariants");
const vs = listEntryVariants(bundle);
ok(vs.length === 2 && vs[0].key === "baseline", "baseline listed first");
ok(vs.find((v) => v.key === "baseline").count === 3, "variant count = executed only (3)");

console.log("\n[8] no mutation");
buildEntryVariantOverlap(bundle, "baseline", "entry_triggered_edge_25p0_d30");
ok(JSON.stringify(bundle) === snap, "buildEntryVariantOverlap does not mutate the bundle");

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
