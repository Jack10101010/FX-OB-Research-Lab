// dataRangesFullHistory.validate.mjs — "Full History" date resolution (bug fix).
//
// Proves the concrete defect is closed: "Full History" resolves to the selected dataset's
// ACTUAL earliest/latest candle extent (2015-01-01 → 2026-06-19), pinned deterministically,
// so two A/B runs get byte-identical dates; the extended EURUSD dataset resolves to the full
// 2015→2026 span; a truncated window (extended file + 2020 start — the exact prior bug) is
// detected and flagged; and cohort-target presets never touch the date range.
//
// Run from frontend/:  node src/data/__validation__/dataRangesFullHistory.validate.mjs

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
    const req = (s) => (s.startsWith(".") ? load(path.resolve(path.dirname(p), s)) : (s.startsWith("@/") ? load(path.resolve("src", s.slice(2))) : {}));
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    cache.set(p, mod.exports); return mod.exports;
}

const DR = load("src/data/dataRanges.js");
const CTO = load("src/data/cohortTargetOverrides.js");
const {
    DATA_RANGES, resolveFullHistory, dataRangePatch, resolveDataRangeKey,
    preLaunchDateSummary, fileBounds,
} = DR;
const { applyPreset, PRESETS } = CTO;

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fail++; };
const EXT = "eurusd_1m_extended_2015_2026.csv";

console.log("dataRangesFullHistory.validate.mjs");

// ── 1. Full History resolves to the extended dataset's full extent ──────────────
const fh = resolveFullHistory();
ok(fh.dataFile === DATA_RANGES.full.file, "resolveFullHistory → extended 2015 candle file");
ok(fh.dateFrom === "2015-01-01", "resolveFullHistory start = 2015-01-01 (earliest candle)");
ok(fh.dateTo === "2026-06-19", "resolveFullHistory end = 2026-06-19 (latest candle)");
ok(fh.dataFile.includes("extended_2015_2026"), "extended EURUSD dataset resolves to the full 2015→2026 span");

// ── 2. Deterministic & pinned: identical for repeated A/B runs ──────────────────
const a = resolveFullHistory(), b = resolveFullHistory();
ok(JSON.stringify(a) === JSON.stringify(b), "resolveFullHistory is pure/pinned — two calls byte-identical (A/B safe)");
ok(JSON.stringify(dataRangePatch("full")) === JSON.stringify(fh), "'Full history' preset patch == resolveFullHistory (single source of truth)");

// ── 3. A cfg built from Full History reads back as the 'full' preset ────────────
const fullCfg = { ...resolveFullHistory() };
ok(resolveDataRangeKey(fullCfg) === "full", "cfg from resolveFullHistory resolves to key 'full'");

// ── 4. Pre-launch summary: clean full-history window ────────────────────────────
const s = preLaunchDateSummary(fullCfg);
ok(s.candleFile === EXT, "summary candleFile = extended file");
ok(s.earliest === "2015-01-01" && s.latest === "2026-06-19", "summary earliest/latest = full extent");
ok(s.submittedStart === "2015-01-01" && s.submittedEnd === "2026-06-19", "summary submitted start/end = full extent");
ok(s.isFullHistory === true && s.startTruncated === false && s.endTruncated === false, "summary flags full history, no truncation");
ok(s.warnings.length === 0, "summary: no warnings for a true full-history window");

// ── 5. The EXACT prior bug: extended file + 2020 start → flagged, not silent ─────
const buggy = { dataFile: DATA_RANGES.full.file, dateFrom: "2020-01-02", dateTo: "2026-06-19" };
const sb = preLaunchDateSummary(buggy);
ok(sb.earliest === "2015-01-01", "buggy cfg: dataset earliest still 2015-01-01");
ok(sb.submittedStart === "2020-01-02", "buggy cfg: submitted start = 2020-01-02 (the defect)");
ok(sb.isFullHistory === false && sb.startTruncated === true, "buggy cfg flagged: NOT full history, start truncated");
ok(sb.warnings.some((w) => /earliest candle/.test(w)) && sb.warnings.some((w) => /Full history.*not/.test(w)),
    "buggy cfg emits truncation + mislabel warnings (2020-start 'Full history')");

// ── 6. Two A/B cfgs (RR2 control vs custom targets) share IDENTICAL dates ────────
const ctrl = { ...resolveFullHistory(), cohortOverridesEnabled: true, cohortTargetOverrides: applyPreset(PRESETS.SAME_ENABLED_RR2).overrides };
const cust = { ...resolveFullHistory(), cohortOverridesEnabled: true, cohortTargetOverrides: applyPreset(PRESETS.FINAL_CANDIDATE).overrides };
ok(ctrl.dateFrom === cust.dateFrom && ctrl.dateTo === cust.dateTo && ctrl.dataFile === cust.dataFile,
    "A/B control vs custom: identical dataFile + start + end (pinned)");

// ── 7. Changing cohort-target presets does NOT alter the date range ─────────────
for (const p of [PRESETS.ALL_RR2, PRESETS.FINAL_CANDIDATE, PRESETS.SAME_ENABLED_RR2, PRESETS.ALL_RUN_DEFAULT, PRESETS.RESET]) {
    const res = applyPreset(p);
    const touchesDates = res && (("overrides" in res) && Object.keys(res).some((k) => /date|dataFile|start|end/i.test(k)));
    ok(!touchesDates, `preset '${p}' does not touch date/dataFile fields`);
}

// ── 8. fileBounds authoritative for known datasets (used to pin end date) ────────
ok(JSON.stringify(fileBounds(fullCfg)) === JSON.stringify({ min: "2015-01-01", max: "2026-06-19" }),
    "fileBounds(extended) = { 2015-01-01, 2026-06-19 } — pins end date, kills async 18/19 drift");
ok(fileBounds({ dataFile: "data/candles/EURUSD_1m.csv" }).max === "2026-06-19"
    && fileBounds({ dataFile: "data/candles/EURUSD_1m.csv" }).min === "2020-01-01",
    "fileBounds(recent) known → async status cannot override a known dataset");

console.log(fail === 0 ? "\nALL PASSED" : `\n${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);
