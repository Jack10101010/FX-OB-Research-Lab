// portfolioPolicy.validate.mjs — Portfolio Manager v1 (Phase 3) policy-viewer loader.
//
// Proves the read-only policy loader: the mirrored deployed_policy.v1.json loads +
// validates, all 48 cohorts normalize, policy/confidence counts are correct, cohort
// lookup + filters work, unknown cohorts return null, and every policy/confidence
// value is canonical. Pure loader — no React, no execution.
//
// Run from frontend/:  node src/data/__validation__/portfolioPolicy.validate.mjs

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

const pp = loadCjs("src/data/portfolioPolicy.js");
const doc = JSON.parse(fs.readFileSync(path.resolve("src/data/deployedPolicy.v1.json"), "utf8"));

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

console.log("\n[1] policy JSON loads + validates");
const table = pp.loadPolicy(doc);
ok(!!table, "loadPolicy returns a table");
ok(table.policyVersion === doc.policy_version && table.policyVersion, "policy_version preserved");
ok(typeof table.createdAt === "string", "created_at present");

console.log("\n[2] 48 cohorts present + normalized");
ok(table.cohorts.length === 48, `48 cohorts (got ${table.cohorts.length})`);
ok(table.byKey.size === 48, "byKey map has 48 entries (unique keys)");
const SESSIONS = new Set(["london", "lull", "newYork", "ny_pm", "asia", "outside"]);
ok(table.cohorts.every((c) => SESSIONS.has(c.session)), "every session canonical");
ok(table.cohorts.every((c) => c.structure === "BOS" || c.structure === "CHoCH"), "every structure BOS/CHoCH");
ok(table.cohorts.every((c) => c.direction === "Long" || c.direction === "Short"), "every direction Long/Short");
ok(table.cohorts.every((c) => c.cohortKey === `${c.instrument}|${c.session}|${(c.structure === "CHoCH" ? "choch" : "bos")}_${c.direction.toLowerCase()}`), "cohortKey derives consistently");

console.log("\n[3] policy counts match expected");
const cp = table.counts.byPolicy;
ok(cp.DISABLE === 19, `DISABLE=19 (got ${cp.DISABLE})`);
ok(cp.LABEL === 17, `LABEL=17 (got ${cp.LABEL})`);
ok(cp.STATE_ONLY === 6, `STATE_ONLY=6 (got ${cp.STATE_ONLY})`);
ok(cp.DIRECTION_AWARE === 6, `DIRECTION_AWARE=6 (got ${cp.DIRECTION_AWARE})`);
ok(cp.DISABLE + cp.LABEL + cp.STATE_ONLY + cp.DIRECTION_AWARE === 48, "policy counts sum to 48");

console.log("\n[4] confidence counts match expected");
const cc = table.counts.byConfidence;
ok(cc.HIGH === 19, `HIGH=19 (got ${cc.HIGH})`);
ok(cc.MEDIUM === 15, `MEDIUM=15 (got ${cc.MEDIUM})`);
ok(cc.LOW === 3, `LOW=3 (got ${cc.LOW})`);
ok(cc.MORE_DATA_REQUIRED === 11, `MORE_DATA_REQUIRED=11 (got ${cc.MORE_DATA_REQUIRED})`);

console.log("\n[5] cohort lookup (by key + by parts)");
ok(pp.lookupCohort(table, "GBPUSD|newYork|choch_long").policy === "DIRECTION_AWARE", "lookup by key → GBP NY CHoCH Long = DIRECTION_AWARE");
ok(pp.lookupCohort(table, "GBPUSD", "New York", "CHoCH", "Long").policy === "DIRECTION_AWARE", "lookup by parts (raw labels canonicalised)");
ok(pp.lookupCohort(table, "EURUSD", "Asia", "BOS", "Short").policy === "LABEL", "lookup EUR Asia BOS Short = LABEL");

console.log("\n[6] unknown cohort → null");
ok(pp.lookupCohort(table, "EURUSD|nasdaq|bos_long") === null, "unknown key → null");
ok(pp.lookupCohort(table, "XAUUSD", "Asia", "BOS", "Long") === null, "unknown instrument → null");

console.log("\n[7] filters work");
const onlyGbp = pp.filterCohorts(table.cohorts, { instrument: "GBPUSD" });
ok(onlyGbp.length === 24 && onlyGbp.every((c) => c.instrument === "GBPUSD"), "filter instrument=GBPUSD → 24 rows");
const dirAware = pp.filterCohorts(table.cohorts, { policy: "DIRECTION_AWARE" });
ok(dirAware.length === 6 && dirAware.every((c) => c.policy === "DIRECTION_AWARE"), "filter policy=DIRECTION_AWARE → 6 rows");
const combo = pp.filterCohorts(table.cohorts, { instrument: "EURUSD", structure: "BOS", direction: "Short" });
ok(combo.every((c) => c.instrument === "EURUSD" && c.structure === "BOS" && c.direction === "Short"), "combined filter respects all keys");
ok(pp.filterCohorts(table.cohorts, {}).length === 48, "empty filter → all 48");

console.log("\n[8] enums valid + filterOptions");
ok(table.cohorts.every((c) => pp.POLICY_REGIMES.includes(c.policy)), "every policy value canonical");
ok(table.cohorts.every((c) => c.confidence === null || pp.CONFIDENCES.includes(c.confidence)), "every confidence value canonical/null");
const opts = pp.filterOptions(table.cohorts);
ok(opts.instrument.join(",") === "EURUSD,GBPUSD", "filterOptions.instrument = EURUSD,GBPUSD");
ok(opts.policy.length >= 1 && opts.confidence.length >= 1, "filterOptions expose policy + confidence");

console.log("\n[9] normalization: numbers coerced");
const row = pp.lookupCohort(table, "EURUSD|newYork|bos_long");
ok(typeof row.sampleSize === "number" && row.sampleSize === 113, "sampleSize coerced to number");
ok(typeof row.netRState === "number", "net_r_state coerced to number");

console.log("\n[10] invalid docs rejected");
const threw = (fn) => { try { fn(); return false; } catch { return true; } };
ok(threw(() => pp.loadPolicy({ schema_version: 2, policy_version: "x", cohorts: [] })), "bad schema_version rejected");
ok(threw(() => pp.loadPolicy({ schema_version: 1, policy_version: "", cohorts: [] })), "empty policy_version rejected");
ok(threw(() => pp.loadPolicy({ schema_version: 1, policy_version: "x", cohorts: {} })), "non-array cohorts rejected");

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
