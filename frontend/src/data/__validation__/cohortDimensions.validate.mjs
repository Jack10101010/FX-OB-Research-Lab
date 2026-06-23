// cohortDimensions.validate.mjs — neutral cohort/dimension registry (Research Lab Phase 0).
//
// Verifies the extracted registry: legacy failure dimensions still resolve, the new
// month/year dims resolve + map correctly, dimensionAvailable / availableDimensions
// behave, and CORE stays scoped (no month/year leak). Uses the failures-validator
// require-shim style (stubs entryFormatters so accessors are exercisable).
//
// Run from frontend/:  node src/data/__validation__/cohortDimensions.validate.mjs

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

const entryFormattersShim = {
    isFiniteNumber: (v) => v != null && Number.isFinite(Number(v)),
    sessionOf: (e) => (e === "A" ? "Asia" : e === "N" ? "New York" : "Unknown"),
    parseDate: () => null,
    WEEKDAYS: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    SESSIONS: [], dayIndex: () => null,
    num: Number, round1: (v) => Number(Number(v).toFixed(1)), round2: (v) => Number(Number(v).toFixed(2)),
};
const entryRegistryShim = { sampleConfidence: () => ({ label: "N/A", tone: "muted" }) };

const utils = loadCjs(`${BASE}/failuresUtils.js`, () => entryFormattersShim);
const registry = loadCjs(`${BASE}/failuresRegistry.js`, () => entryRegistryShim);
const dims = loadCjs("src/data/cohortDimensions.js", (s) => (s.includes("failuresUtils") ? utils : s.includes("failuresRegistry") ? registry : {}));

const {
    CORE_DIMENSIONS, TIMING_DIMENSIONS, DIMENSIONS, byKey,
    DIMENSION_BY_KEY, resolveDimension, dimensionAvailable, availableDimensions,
} = dims;

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

const dated = Array.from({ length: 20 }, () => ({ entry: "2024-03-10T08:00:00Z", direction: "long", r: 1 }));
const markers = Array.from({ length: 20 }, () => ({ entry: "A", direction: "long", r: 1 }));

// 1. CORE = the legacy 12 dims; no month/year ──────────────────────────────────
console.log("\n[1] CORE registry unchanged");
{
    const coreKeys = CORE_DIMENSIONS.map((d) => d.key);
    const expected = ["session", "direction", "structure", "weekday", "hour", "archetype", "severity", "obwidth", "penetration", "entryModel", "ghost", "fft"];
    ok(coreKeys.join(",") === expected.join(","), "CORE_DIMENSIONS = the original 12 in order");
    ok(!coreKeys.includes("month") && !coreKeys.includes("year"), "CORE excludes month/year (no leak into Failures)");
}

// 2. DIMENSIONS adds month/year ────────────────────────────────────────────────
console.log("\n[2] full registry adds timing dims");
{
    ok(TIMING_DIMENSIONS.map((d) => d.key).join(",") === "month,year", "TIMING_DIMENSIONS = [month, year]");
    ok(DIMENSIONS.length === CORE_DIMENSIONS.length + 2, "DIMENSIONS = CORE + month + year");
    ok(byKey(DIMENSIONS).month && DIMENSION_BY_KEY.year, "byKey / DIMENSION_BY_KEY include month & year");
}

// 3. resolveDimension ──────────────────────────────────────────────────────────
console.log("\n[3] resolveDimension");
{
    ["session", "structure", "hour", "weekday"].forEach((k) => ok(resolveDimension(k)?.key === k, `legacy dim resolves: ${k}`));
    ok(resolveDimension("month")?.key === "month" && resolveDimension("year")?.key === "year", "month/year resolve");
    ok(resolveDimension("bogus") === null && resolveDimension(null) === null, "unknown/null → null");
    const obj = { key: "x" };
    ok(resolveDimension(obj) === obj, "object passthrough");
}

// 4. accessors ─────────────────────────────────────────────────────────────────
console.log("\n[4] accessors");
{
    ok(resolveDimension("month").accessor({ entry: "2024-03-10T08:00:00Z" }) === "Mar", "month accessor → 'Mar'");
    ok(resolveDimension("year").accessor({ entry: "2024-03-10T08:00:00Z" }) === "2024", "year accessor → '2024'");
    ok(resolveDimension("session").accessor({ entry: "A" }) === "Asia", "session accessor (stub) → 'Asia'");
    ok(resolveDimension("month").accessor({ entry: "" }) === null && resolveDimension("year").accessor({}) === null, "month/year null on missing/blank entry");
}

// 5. dimensionAvailable + availableDimensions ──────────────────────────────────
console.log("\n[5] availability");
{
    ok(dimensionAvailable("month", dated) === true && dimensionAvailable("year", dated) === true, "month/year available on dated trades");
    ok(dimensionAvailable("month", markers) === false, "month unavailable on non-dated (marker) trades");
    ok(dimensionAvailable("session", markers) === true, "session available on marker trades");
    ok(dimensionAvailable("month", []) === false, "empty trades → unavailable (safe)");
    const availFull = availableDimensions(dated).map((d) => d.key);
    ok(availFull.includes("month") && availFull.includes("year"), "availableDimensions(full) includes month & year for dated trades");
    const availCore = availableDimensions(dated, CORE_DIMENSIONS).map((d) => d.key);
    ok(!availCore.includes("month") && !availCore.includes("year"), "availableDimensions scoped to CORE excludes month/year");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
