// Validation for the Failures Lab excursion field-detection fix (V2 Phase 0).
// Proves the data-quality layer now detects the per-trade names the importer maps
// (mfeR/mae_r/…) while preserving the legacy mfe/mae keys, and that single-string
// callers are unregressed.
//
// The failures source modules use extensionless, alias (@/…) imports that Node's
// ESM resolver can't load directly, so we Babel-transpile the two real source files
// to CommonJS and evaluate them with a small require-shim (the unrelated
// entryFormatters re-export is stubbed — the tested functions don't use it).
//
// Run from frontend/ (Node ≥ 22 ESM):
//   node src/data/__validation__/failuresFieldDetection.validate.mjs

import babel from "@babel/core";
import fs from "fs";

const BASE = "src/components/lab/failures/shared";

function loadCjs(absPath, requireShim) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const module = { exports: {} };
    // eslint-disable-next-line no-new-func
    new Function("require", "module", "exports", code)(requireShim, module, module.exports);
    return module.exports;
}

// failuresUtils.js — stub its (unused-here) entryFormatters re-export.
const utils = loadCjs(`${BASE}/failuresUtils.js`, () => ({}));
// failuresDataQuality.js — resolve ./failuresUtils to the module above.
const dq = loadCjs(`${BASE}/failuresDataQuality.js`, (spec) =>
    (spec.includes("failuresUtils") ? utils : {}));

const { scanFieldCoverage, getMissingTier1Fields, isModuleAvailable } = dq;
const { fieldPresent } = utils;

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};

const row = (over) => ({ r: -1, ...over });
const newRun  = Array.from({ length: 8 }, () => row({ mfeR: 1.2, maeR: -0.4, rIfNoTarget: 0.5, minutes_to_exit: 14 }));
const oldRun  = Array.from({ length: 8 }, () => row({ mfe: 1.1, mae: -0.3 }));
const bareRun = Array.from({ length: 8 }, () => row({}));

console.log("scanFieldCoverage — current importer names (mfeR / maeR)");
const cov = scanFieldCoverage(newRun);
ok(cov.mfe.status === "ok", `mfeR detected → mfe status ok (got ${cov.mfe.status})`);
ok(cov.mae.status === "ok", `maeR detected → mae status ok (got ${cov.mae.status})`);
ok(cov.minutes_to_exit.status === "ok", "minutes_to_exit detected (unchanged)");
ok(cov.post_stop_continuation_r.status === "absent", "post_stop_continuation_r correctly absent (genuinely needs export)");

console.log("getMissingTier1Fields — new run");
const missingNew = getMissingTier1Fields(newRun).map((f) => f.field);
ok(!missingNew.includes("mfe"), "mfe NOT reported missing on a Phase-11B run");
ok(!missingNew.includes("mae"), "mae NOT reported missing on a Phase-11B run");
ok(missingNew.includes("post_stop_continuation_r"), "post_stop_continuation_r still reported missing");

console.log("module availability");
ok(isModuleAvailable("excursion", newRun) === true, "excursion module available when mfeR/maeR present");
ok(isModuleAvailable("excursion", bareRun) === false, "excursion module unavailable with no excursion data");

console.log("backwards compatibility — legacy mfe/mae keys");
const covOld = scanFieldCoverage(oldRun);
ok(covOld.mfe.status === "ok", "legacy mfe key still detected");
ok(covOld.mae.status === "ok", "legacy mae key still detected");

console.log("rIfNoTarget detectable via alias mechanism (for the future Distance-Before-Stop module)");
ok(fieldPresent(newRun, ["rIfNoTarget", "r_if_no_target"]) === true, "rIfNoTarget detected via alias array");
ok(fieldPresent(bareRun, ["rIfNoTarget", "r_if_no_target"]) === false, "rIfNoTarget absent when not exported");

console.log("single-string callers unaffected (no regression)");
ok(fieldPresent(newRun, "minutes_to_exit") === true, "string fieldName still works");
ok(fieldPresent(bareRun, "minutes_to_exit") === false, "string fieldName absent case still works");

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
