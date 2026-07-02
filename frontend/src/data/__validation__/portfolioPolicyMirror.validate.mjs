// portfolioPolicyMirror.validate.mjs — Portfolio Manager v1 (Phase 5) sync guard.
//
// Proves the frontend policy MIRROR (src/data/deployedPolicy.v1.json) is intact and
// in sync with the Lux source via the embedded integrity checksum, and that the
// guard-grade validator rejects drift/tampering. Pure — node crypto only, no network.
//
// Run from frontend/:  node src/data/__validation__/portfolioPolicyMirror.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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
    const req = (spec) => { if (spec.startsWith(".")) return loadCjs(path.resolve(path.dirname(resolved), spec)); throw new Error(`unexpected import: ${spec}`); };
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    return mod.exports;
}

const pp = loadCjs("src/data/portfolioPolicy.js");
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const clone = (o) => JSON.parse(JSON.stringify(o));
const doc = JSON.parse(fs.readFileSync(path.resolve("src/data/deployedPolicy.v1.json"), "utf8"));

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };
const threwWith = (fn, needle) => { try { fn(); return false; } catch (e) { return needle ? String(e.message).includes(needle) : true; } };

console.log("\n[1] identical mirror passes (checksum + full guard)");
ok(doc.policy_sha256 && doc.policy_sha256.length === 64, "policy_sha256 present (64 hex)");
ok(pp.verifyPolicyChecksum(doc, sha).ok, "embedded checksum matches recomputed content hash");
ok(pp.validateMirror(doc, sha, { expectedCohorts: 48 }) === true, "validateMirror passes (48 cohorts, checksum OK)");

console.log("\n[2] checksum mismatch fails with explicit message");
const tampered = clone(doc);
tampered.cohorts[0].decision_policy.regime =
    tampered.cohorts[0].decision_policy.regime === "LABEL" ? "DISABLE" : "LABEL";
ok(!pp.verifyPolicyChecksum(tampered, sha).ok, "tampered cohort → checksum no longer matches");
ok(threwWith(() => pp.validateMirror(tampered, sha), "stale"), "validateMirror throws the 'stale' guidance on drift");

console.log("\n[3] missing metadata fails");
ok(threwWith(() => pp.validateMirror({ schema_version: 1, cohorts: doc.cohorts }, sha), "policy_version"), "missing policy_version rejected");
ok(threwWith(() => pp.validateMirror({ policy_version: "x", cohorts: doc.cohorts }, sha), "schema_version"), "missing/!=1 schema_version rejected");

console.log("\n[4] duplicate cohort fails");
const dup = clone(doc);
dup.cohorts.push(clone(dup.cohorts[0]));
delete dup.policy_sha256;                          // isolate the dup error from checksum
ok(threwWith(() => pp.validateMirror(dup), "duplicate"), "duplicate cohort rejected");

console.log("\n[5] 48-cohort invariant");
ok(doc.cohorts.length === 48, "exactly 48 cohorts in the mirror");
const short = clone(doc); short.cohorts = short.cohorts.slice(0, 47); delete short.policy_sha256;
ok(threwWith(() => pp.validateMirror(short, null, { expectedCohorts: 48 }), "expected 48"), "wrong cohort count rejected");

console.log("\n[6] unknown policy / confidence fails");
const badPolicy = clone(doc); badPolicy.cohorts[3].decision_policy.regime = "SOMETIMES"; delete badPolicy.policy_sha256;
ok(threwWith(() => pp.validateMirror(badPolicy), "regime"), "unknown policy value rejected");
const badConf = clone(doc); badConf.cohorts[3].confidence = "MAYBE"; delete badConf.policy_sha256;
ok(threwWith(() => pp.validateMirror(badConf), "confidence"), "unknown confidence value rejected");

console.log("\n[7] canonical cohort keys only");
const badKey = clone(doc); badKey.cohorts[2].cohort_key = "EURUSD|NYC|bos_long"; delete badKey.policy_sha256;
ok(threwWith(() => pp.validateMirror(badKey), "cohort_key"), "non-canonical cohort_key rejected");

console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
