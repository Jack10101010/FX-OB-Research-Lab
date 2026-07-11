// portfolioLabels.validate.mjs — Portfolio Manager UI presentation layer.
//
// Proves the single-source-of-truth display module: friendly labels map correctly to
// the four canonical enum values (and only those), tooltips/rules exist for each,
// effectiveNetR / beforePMNetR derive correctly, the sample-aware ranking never crowns
// a tiny-sample or DISABLE cohort, and the frozen recommendation states the single
// approved v1 → v1.1 change. Pure — no React, no execution, no enum renames.
//
// Run from frontend/:  node src/data/__validation__/portfolioLabels.validate.mjs

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

const L = loadCjs(path.resolve("src/data/portfolioLabels.js"));

let failures = 0;
function ok(cond, msg) { console.log(`  ${cond ? "✓" : "✗"} ${msg}`); if (!cond) failures++; }

const CANON = ["LABEL", "STATE_ONLY", "DIRECTION_AWARE", "DISABLE"];

console.log("[1] friendly labels — exact, only canonical keys");
ok(L.POLICY_LABELS.LABEL === "ALWAYS ALLOW", "LABEL → ALWAYS ALLOW");
ok(L.POLICY_LABELS.STATE_ONLY === "BLOCK CHOP", "STATE_ONLY → BLOCK CHOP");
ok(L.POLICY_LABELS.DIRECTION_AWARE === "FOLLOW TREND", "DIRECTION_AWARE → FOLLOW TREND");
ok(L.POLICY_LABELS.DISABLE === "NEVER TRADE", "DISABLE → NEVER TRADE");
ok(Object.keys(L.POLICY_LABELS).sort().join(",") === CANON.slice().sort().join(","), "label map keys are exactly the 4 canonical enums (no renames/extras)");

console.log("\n[2] tooltips + short + tone + state-rules present for every class");
for (const c of CANON) {
    ok(typeof L.POLICY_TOOLTIPS[c] === "string" && L.POLICY_TOOLTIPS[c].length > 0, `tooltip for ${c}`);
    ok(typeof L.POLICY_SHORT[c] === "string", `short text for ${c}`);
    ok(typeof L.POLICY_TONE[c] === "string", `tone token for ${c}`);
    ok(Array.isArray(L.POLICY_STATE_RULES[c]) && L.POLICY_STATE_RULES[c].length > 0, `state rules for ${c}`);
}
ok(L.policyFriendly("DIRECTION_AWARE") === "FOLLOW TREND", "policyFriendly()");
ok(L.policyFriendly("UNKNOWN") === "UNKNOWN", "policyFriendly() passes through unknown");

console.log("\n[3] FOLLOW TREND / BLOCK CHOP rules exact");
const dir = L.POLICY_STATE_RULES.DIRECTION_AWARE.map((r) => `${r.when}=${r.action}`).join("|");
ok(dir.includes("Bull trend + Long=allow") && dir.includes("Bull trend + Short=block"), "DIR_AWARE: Bull→Long allow / Short block");
ok(dir.includes("Bear trend + Short=allow") && dir.includes("Bear trend + Long=block"), "DIR_AWARE: Bear→Short allow / Long block");
ok(dir.toLowerCase().includes("chop") && dir.includes("allow both directions"), "DIR_AWARE: chop allows both");
const st = L.POLICY_STATE_RULES.STATE_ONLY.map((r) => `${r.when}=${r.action}`).join("|");
ok(st.includes("Bull/Chop=block") && st.includes("Bear/Chop=block"), "STATE_ONLY blocks both chop states");

console.log("\n[4] effectiveNetR / beforePMNetR derivation");
const mk = (policy, l, s, d) => ({ policy, netRLabel: l, netRState: s, netRDirection: d, sampleSize: 100, cohortKey: policy });
ok(L.effectiveNetR(mk("LABEL", 5, 9, -9)) === 5, "LABEL → label book");
ok(L.effectiveNetR(mk("STATE_ONLY", 5, 9, -9)) === 9, "STATE_ONLY → state book");
ok(L.effectiveNetR(mk("DIRECTION_AWARE", 5, 9, -9)) === -9, "DIRECTION_AWARE → direction book");
ok(L.effectiveNetR(mk("DISABLE", 5, 9, -9)) === 0, "DISABLE → 0 (blocked)");
ok(L.beforePMNetR(mk("DISABLE", 5, 9, -9)) === 5, "beforePM → always-allow (label) book");

console.log("\n[5] ranking — sample-aware, never crowns tiny sample or DISABLE");
const cohorts = [
    mk("STATE_ONLY", 0, 30, 0),   // big positive, big sample → should be strong
    { ...mk("DIRECTION_AWARE", 0, 0, -20), cohortKey: "bigneg" }, // big negative, big sample → weak
    { ...mk("LABEL", 0, 0, 0), sampleSize: 5, netRLabel: 999, cohortKey: "tiny" }, // huge but tiny sample → neutral
    { ...mk("DISABLE", 0, 0, 0), netRLabel: 50, cohortKey: "disabled" }, // disable → neutral
    { ...mk("LABEL", 3, 0, 0), cohortKey: "mid" },
];
const tier = L.rankCohorts(cohorts);
ok(tier.get("tiny") === "neutral", "tiny-sample row is neutral (not crowned)");
ok(tier.get("disabled") === "neutral", "DISABLE row is neutral");
ok(tier.get("STATE_ONLY") === "strong", "clear positive big-sample → strong");
ok(tier.get("bigneg") === "weak", "clear negative big-sample → weak");
ok(L.MIN_SAMPLE >= 25, "MIN_SAMPLE guard is meaningful");

console.log("\n[6] frozen recommendation states the single approved change");
const r = L.PM_RECOMMENDATION;
ok(r.researchStatus === "FROZEN", "research FROZEN");
ok(r.portfolioManager.pm === "v1.1" && r.portfolioManager.state === "ON", "PM v1.1 ON");
ok(r.policyChange.from === "DISABLE" && r.policyChange.to === "DIRECTION_AWARE", "change DISABLE→DIRECTION_AWARE (canonical)");
ok(r.policyChange.fromLabel === "NEVER TRADE" && r.policyChange.toLabel === "FOLLOW TREND", "change NEVER TRADE→FOLLOW TREND (friendly)");
ok(r.policyChange.cohort.includes("New York") && r.policyChange.cohort.includes("CHoCH") && r.policyChange.cohort.includes("Short"), "change targets NY CHoCH Short");
ok(r.layers.every((l) => l.state === "OFF"), "MS gate / Session-Scenario / Directional-Chop all OFF");

console.log("\n[7] lifecycle strip shows the PM's architectural role + timing note");
ok(L.PM_LIFECYCLE.length === 7, "7 lifecycle steps");
const owners = L.PM_LIFECYCLE.map((s) => s.owner);
ok(owners[0] === "base" && owners[1] === "te", "starts base strategy → triggered entry");
ok(owners.includes("pm") && owners.includes("state") && owners.includes("decision") && owners.includes("exec"),
    "flow spans PM → market-state → keep/block → execution");
ok(L.PM_LIFECYCLE.some((s) => /cohort/i.test(s.title) && /policy/i.test(s.title)), "a step covers cohort + stored policy");
ok(L.PM_LIFECYCLE.every((s) => L.LIFECYCLE_OWNERS[s.owner]), "every step owner has a layer label + tone");
ok(/does not find trades/i.test(L.PM_LIFECYCLE_INTRO) && /predict the market/i.test(L.PM_LIFECYCLE_INTRO),
    "intro: PM does not find trades / predict the market");
ok(/entry-touch/i.test(L.PM_TIMING_NOTE) && /not changed here/i.test(L.PM_TIMING_NOTE), "timing note: entry-touch + not changed here");

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
