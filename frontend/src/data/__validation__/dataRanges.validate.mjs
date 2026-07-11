// dataRanges.validate.mjs — full-history Data Range presets (SBv2) + run-name label.
//
// Proves: the two datasets are exposed with the correct candle files + date windows; selecting
// Full history sets the extended file + 2015 range; Recent sets the 2020 file; the run-name
// detail carries "Full history" / "Recent/UI range"; the SBv2 control + payload wiring are
// present; and NO saved config is mutated on load (presets only apply on user click). Pure.
//
// Run from frontend/:  node src/data/__validation__/dataRanges.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

const cache = new Map();
function load(p) {
    p = path.resolve(p.endsWith(".js") ? p : p + ".js");
    if (cache.has(p)) return cache.get(p);
    const { code } = babel.transformSync(fs.readFileSync(p, "utf8"), {
        filename: p, presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]], babelrc: false, configFile: false,
    });
    const mod = { exports: {} }; cache.set(p, mod.exports);
    const req = (s) => (s.startsWith(".") ? load(path.resolve(path.dirname(p), s)) : {});
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    cache.set(p, mod.exports); return mod.exports;
}

const DR = load("src/data/dataRanges.js");
const S = load("src/data/runs/scenarioPresentation.js");
const SB = fs.readFileSync(path.resolve("src/pages/StrategyBuilderV2.jsx"), "utf8");
const REG = fs.readFileSync(path.resolve("src/data/configRegistry.js"), "utf8");
const TR = fs.readFileSync(path.resolve("src/data/configTranslator.js"), "utf8");

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };

console.log("[1] dataset presets: files + windows");
ok(DR.DATA_RANGES.recent.file === "data/candles/EURUSD_1m.csv" && DR.DATA_RANGES.recent.from === "2020-01-02" && DR.DATA_RANGES.recent.to === "2026-06-18", "Recent = EURUSD_1m.csv, 2020-01-02 → 2026-06-18");
ok(DR.DATA_RANGES.full.file === "data/candles/EURUSD_1m_extended_2015_2026.csv" && DR.DATA_RANGES.full.from === "2015-01-01" && DR.DATA_RANGES.full.to === "2026-06-19", "Full = extended file, 2015-01-01 → 2026-06-19");
ok(JSON.stringify(DR.DATA_RANGE_ORDER) === JSON.stringify(["recent", "full", "custom"]), "order = recent, full, custom");

console.log("\n[2] preset patch sets file + dates");
ok(JSON.stringify(DR.dataRangePatch("full")) === JSON.stringify({ dataFile: "data/candles/EURUSD_1m_extended_2015_2026.csv", dateFrom: "2015-01-01", dateTo: "2026-06-19" }), "Full patch → extended file + 2015 range");
ok(JSON.stringify(DR.dataRangePatch("recent")) === JSON.stringify({ dataFile: "data/candles/EURUSD_1m.csv", dateFrom: "2020-01-02", dateTo: "2026-06-18" }), "Recent patch → 2020 file + range");
ok(DR.dataRangePatch("custom") === null, "Custom → no patch (user edits dates)");

console.log("\n[3] resolveDataRangeKey");
ok(DR.resolveDataRangeKey({ dataFile: "data/candles/EURUSD_1m.csv", dateFrom: "2020-01-02", dateTo: "2026-06-18" }) === "recent", "matches Recent");
ok(DR.resolveDataRangeKey({ dataFile: "data/candles/EURUSD_1m_extended_2015_2026.csv", dateFrom: "2015-01-01", dateTo: "2026-06-19" }) === "full", "matches Full");
ok(DR.resolveDataRangeKey({ dataFile: "data/candles/EURUSD_1m.csv", dateFrom: "2022-03-01", dateTo: "2024-01-01" }) === "custom", "edited dates → Custom");

console.log("\n[4] run-name label (from emitted candle_file)");
ok(DR.dataRangeLabel({ candle_file: "EURUSD_1m_extended_2015_2026.csv" }) === "Full history", "extended → 'Full history'");
ok(DR.dataRangeLabel({ candle_file: "EURUSD_1m.csv" }) === "Recent/UI range", "2020 file → 'Recent/UI range'");
ok(DR.dataRangeLabel({ candle_file: "SOMETHING_ELSE.csv" }) === null, "unknown file → null");
// deriveRunName surfaces it
const dn = S.deriveRunName({ symbol: "EURUSD", start_date: "2015-01-01", end_date: "2026-06-19", candle_file: "EURUSD_1m_extended_2015_2026.csv", rr_multiple: 2, entry_models: ["triggered_edge"], triggered_edge_trigger_thresholds: [25], triggered_edge_candle_delays: [3], portfolio_policy_enabled: true }, {}, { pmVersionLabel: "v1.1" });
ok(/Full history/.test(dn.detail), `deriveRunName detail includes 'Full history' (${dn.detail})`);
const dn2 = S.deriveRunName({ symbol: "EURUSD", start_date: "2020-01-02", end_date: "2026-06-18", candle_file: "EURUSD_1m.csv", rr_multiple: 2 }, {}, {});
ok(/Recent\/UI range/.test(dn2.detail), "deriveRunName detail includes 'Recent/UI range'");

console.log("\n[5] warmed/cold context");
ok(DR.dataRangeContext({ dataFile: "data/candles/EURUSD_1m_extended_2015_2026.csv", dateFrom: "2015-01-01", dateTo: "2026-06-19" }).mode === "warmed", "Full → warmed");
ok(DR.dataRangeContext({ dataFile: "data/candles/EURUSD_1m.csv", dateFrom: "2020-01-02", dateTo: "2026-06-18" }).mode === "cold", "Recent → cold (2020-start file)");

console.log("\n[6] bounds FOLLOW THE CANDLE FILE (bugfix — not the exact-date preset match)");
const FETCHED = { min: "2020-01-01", max: "2026-06-19" }; // the 2020 manifest bounds (the buggy fallback)
ok(DR.dataRangeBounds({ dataFile: "data/candles/EURUSD_1m_extended_2015_2026.csv", dateFrom: "2015-01-01", dateTo: "2026-06-19" }, FETCHED).min === "2015-01-01", "Full exact → min 2015-01-01");
// REGRESSION: extended file with EDITED (custom) dates must STILL unlock 2015 (was re-clamping to 2020)
ok(DR.dataRangeBounds({ dataFile: "data/candles/EURUSD_1m_extended_2015_2026.csv", dateFrom: "2017-06-01", dateTo: "2024-01-01" }, FETCHED).min === "2015-01-01", "Full file + EDITED dates → still min 2015-01-01 (regression)");
ok(DR.dataRangeBounds({ dataFile: "data/candles/EURUSD_1m.csv", dateFrom: "2020-01-02", dateTo: "2025-05-18" }, FETCHED).min === "2020-01-01", "Recent file → min 2020-01-01 (even with custom dates)");
ok(DR.dataRangeBounds({ dataFile: "data/candles/GBPUSD_1m.csv", dateFrom: "2021-01-01", dateTo: "2022-01-01" }, FETCHED).min === "2020-01-01", "Unknown file → falls back to fetched bounds");
ok(DR.fileBounds({ dataFile: "data/candles/EURUSD_1m_extended_2015_2026.csv" }).max === "2026-06-19", "fileBounds() ignores dates, keys on file");
ok(DR.fileBounds({ dataFile: "unknown.csv" }) === null, "fileBounds() unknown → null");
// bounds must NOT be overwritten by the fetched status once a known file is chosen
ok(DR.dataRangeBounds({ dataFile: "data/candles/EURUSD_1m_extended_2015_2026.csv", dateFrom: "2015-01-01", dateTo: "2026-06-19" }, FETCHED).min !== FETCHED.min, "fetched 2020 bounds do NOT override the extended file's 2015 min");

console.log("\n[6b] union bounds + auto-switch dataset on pre-2020 start (bugfix 2)");
ok(DR.unionBounds().min === "2015-01-01" && DR.unionBounds().max === "2026-06-19", "unionBounds = 2015-01-01 → 2026-06-19 (widest selectable)");
ok(DR.candleFileForStart("2015-06-01", "data/candles/EURUSD_1m.csv") === "data/candles/EURUSD_1m_extended_2015_2026.csv", "pre-2020 start on 2020 file → upgrades to extended file");
ok(DR.candleFileForStart("2018-01-01", null) === "data/candles/EURUSD_1m_extended_2015_2026.csv", "pre-2020 start with no file → extended");
ok(DR.candleFileForStart("2022-03-01", "data/candles/EURUSD_1m.csv") === "data/candles/EURUSD_1m.csv", "post-2020 start → keeps current 2020 file");
ok(DR.candleFileForStart("2023-01-01", "data/candles/EURUSD_1m_extended_2015_2026.csv") === "data/candles/EURUSD_1m_extended_2015_2026.csv", "post-2020 start on extended file → NOT downgraded");
ok(DR.candleFileForStart("2019-12-31", "data/candles/EURUSD_1m.csv") === "data/candles/EURUSD_1m_extended_2015_2026.csv", "2019-12-31 (just before 2020-01-01) → extended");

console.log("\n[7] SBv2 control wired");
ok(/data-testid="v2-data-range"/.test(SB) && /v2-data-range-\$\{key\}/.test(SB), "Data Range control + per-key testids");
ok(/const applyDataRange = \(key\) => \{/.test(SB) && /const patch = dataRangePatch\(key\)/.test(SB), "applyDataRange uses dataRangePatch");
ok(/endDateEdited\.current = true;\s*\/\/ preset owns the end date/.test(SB), "preset marks endDateEdited so status refresh can't clobber");
ok(/min=\{effectiveDateBounds\?\.min\} max=\{effectiveDateBounds\?\.max\}/.test(SB), "pickers clamp to effectiveDateBounds");
ok(/const effectiveDateBounds = unionBounds\(\)/.test(SB), "pickers span the UNION range (2015→2026 always selectable — bugfix 2)");
ok(/const setDateFrom = \(v\) => setCfg\(\(c\) => \(\{ \.\.\.c, dateFrom: v, dataFile: candleFileForStart\(v, c\.dataFile\) \}\)\);/.test(SB), "setDateFrom auto-switches candle file to cover the chosen start");
ok(/testId="v2-date-from"[\s\S]{0,160}onChange=\{\(v\) => setDateFrom\(v\)\}/.test(SB), "Start Date picker uses setDateFrom (auto-switch wired)");
ok(/data-testid="v2-dataset-line"[\s\S]*\{cfg\.dataFile\}/.test(SB), "muted dataset/candle-file line shown");
ok(/data-testid="v2-data-range-context"/.test(SB), "cold/warmed context note present");
ok(/data-testid="v2-selectable-range"[\s\S]*effectiveDateBounds\.min/.test(SB), "visible 'Selectable range' helper from effectiveDateBounds");
const DRSRC = fs.readFileSync(path.resolve("src/data/dataRanges.js"), "utf8");
ok(/export function dataRangeBounds\([^)]*\) \{\s*return fileBounds\(cfg\) \|\| fallback;/.test(DRSRC), "dataRangeBounds delegates to fileBounds (file-driven, not exact-date)");

console.log("\n[8] payload + no-silent-mutation guardrails");
ok(/candle_file:\s+normalizeCandleFile\(cfg\.dataFile\)/.test(TR), "translator emits candle_file from dataFile");
ok(/start_date:\s+cfg\.dateFrom/.test(TR) && /end_date:\s+cfg\.dateTo/.test(TR), "translator emits start_date/end_date");
ok(/defaultValue: "data\/candles\/EURUSD_1m\.csv"/.test(REG), "registry default stays Recent (2020 file) — no silent switch");
ok(/dateFrom: "2020-01-02", dateTo: "2025-05-18", dataFile: "data\/candles\/EURUSD_1m\.csv"/.test(SB), "DEFAULT_CFG unchanged (Recent) — saved configs not mutated");
// preset only applied via user click, never on load
ok(!/useEffect\([^)]*applyDataRange/.test(SB), "applyDataRange is NOT called from an effect (no silent mutation on load)");

console.log(`\n${fail === 0 ? "ALL PASSED" : fail + " FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
