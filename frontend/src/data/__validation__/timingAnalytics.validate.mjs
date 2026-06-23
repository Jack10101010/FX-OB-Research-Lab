// timingAnalytics.validate.mjs — Timing & Regime Lab Phase A helpers.
//
// Validates the pure timing helpers: month/session/hour/weekday bucketing,
// metrics math (PF/WR/expectancy), cross-year stability (yearsPresent/Positive),
// the deterministic confidence tiers, overview best/worst selection (no Low pick
// when Medium/High exists), empty input, and no-mutation.
//
// Run from frontend/:  node src/data/__validation__/timingAnalytics.validate.mjs

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

const {
    timingBucketMetrics, stabilityOf, confidenceForTimingBucket,
    buildMonthBreakdown, buildSessionBreakdown, buildHourBreakdown,
    buildWeekdayBreakdown, buildDirectionBreakdown, buildTimingOverview,
    simulateTimingRemoval, timingSignal, buildTimingWhatIfCandidates,
    buildTimingDiscovery, buildMonthDrilldown, buildMonthSessionMatrix,
    buildYearBreakdown, monthSpreadVerdict,
    MONTH_LABELS, WEEKDAY_LABELS, SESSION_ORDER,
} = loadCjs("src/data/timingAnalytics.js");

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ FAIL: ${m}`); } };

// Trade factory: UTC entry timestamp + R + direction.
const T = (iso, r, dir = "bull") => ({ entry: iso, r, direction: dir });

// ── 1. metrics math ───────────────────────────────────────────────────────────
console.log("\n[1] timingBucketMetrics");
{
    // +2, +2, -1, -1, 0(scratch)
    const m = timingBucketMetrics([T("2020-01-06T08:00:00Z", 2), T("2020-01-07T08:00:00Z", 2), T("2020-01-08T08:00:00Z", -1), T("2020-01-09T08:00:00Z", -1), T("2020-01-10T08:00:00Z", 0)]);
    ok(m.trades === 5 && m.winners === 2 && m.losers === 2, "counts: 5 trades, 2W, 2L (scratch not W/L)");
    ok(m.netR === 2, "netR = +2 (2+2-1-1)");
    ok(m.pf === 2, "PF = 2.0 (4 / 2)");
    ok(m.winRate === 40, "WR = 40% (2 winners / 5 total, incl scratch)");
    ok(m.expectancy === 0.4, "expectancy = netR/trades = 0.4");
    // no-loss → PF null
    const wOnly = timingBucketMetrics([T("2020-01-06T08:00:00Z", 2)]);
    ok(wOnly.pf === null, "no losing R → PF null (∞ in UI)");
    // empty
    const e = timingBucketMetrics([]);
    ok(e.trades === 0 && e.netR === 0 && e.pf === null && e.expectancy === null, "empty bucket safe");
}

// ── 2. month / weekday / hour / session bucketing ─────────────────────────────
console.log("\n[2] bucketing");
{
    // Jan win, Mar loss, Jul win — across years
    const trades = [
        T("2020-01-06T08:00:00Z", 2), T("2021-01-04T08:00:00Z", 1), // Jan, London hour 08
        T("2020-03-10T13:00:00Z", -1),                              // Mar, New York hour 13
        T("2022-07-12T02:00:00Z", 3),                               // Jul, Asia hour 02
    ];
    const months = buildMonthBreakdown(trades);
    ok(months.length === 12 && months.map((m) => m.label).join(",") === MONTH_LABELS.join(","), "12 month-of-year rows in calendar order");
    const jan = months.find((m) => m.label === "Jan");
    ok(jan.trades === 2 && jan.netR === 3, "Jan aggregates across years (2 trades, +3R)");
    ok(months.find((m) => m.label === "Feb").trades === 0, "empty month present with 0 trades");

    const wk = buildWeekdayBreakdown(trades);
    ok(wk.length === 7 && wk[0].label === "Mon" && wk[6].label === "Sun", "7 weekday rows Mon→Sun");
    // 2020-01-06 is a Monday
    ok(wk.find((d) => d.label === "Mon").trades >= 1, "Monday bucket populated");

    const hours = buildHourBreakdown(trades);
    ok(hours.every((h) => h.trades > 0), "hour breakdown = observed hours only");
    ok(hours.find((h) => h.label === "08:00").trades === 2, "hour 08:00 has 2 trades");

    const sess = buildSessionBreakdown(trades);
    ok(sess.slice(0, 5).map((s) => s.label).join(",") === SESSION_ORDER.join(","), "session rows in canonical order");
    ok(sess.find((s) => s.label === "London").trades === 2, "08:00 UTC → London (2 trades)");
    ok(sess.find((s) => s.label === "New York").trades === 1, "13:00 UTC → New York");
    ok(sess.find((s) => s.label === "Asia").trades === 1, "02:00 UTC → Asia");

    const dir = buildDirectionBreakdown(trades);
    ok(dir.length === 2 && dir[0].label === "Bullish" && dir[1].label === "Bearish", "direction proxy: Bullish + Bearish always shown");
    ok(dir.find((d) => d.label === "Bullish").trades === 4, "all bull trades → Bullish bucket (4)");
}

// ── 3. stability (yearsPresent / yearsPositive) ───────────────────────────────
console.log("\n[3] stabilityOf");
{
    // 2020 net +1, 2021 net -1, 2022 net +2  → 3 years, 2 positive
    const s = stabilityOf([
        T("2020-05-01T08:00:00Z", 1),
        T("2021-05-01T08:00:00Z", -1),
        T("2022-05-01T08:00:00Z", 2),
    ]);
    ok(s.yearsPresent === 3, "yearsPresent = 3");
    ok(s.yearsPositive === 2, "yearsPositive = 2 (2020,2022 positive; 2021 negative)");
    ok(s.positiveYearRatio === 0.67, "positiveYearRatio = 0.67");
    ok(stabilityOf([]).yearsPresent === 0, "empty → 0 years");
    // undated rows skipped
    ok(stabilityOf([{ r: 2 }]).yearsPresent === 0, "undated trade contributes no year");
}

// ── 4. confidence tiers (exact rules) ─────────────────────────────────────────
console.log("\n[4] confidenceForTimingBucket");
{
    ok(confidenceForTimingBucket({ trades: 7, yearsPresent: 5, yearsPositive: 4 }) === "Low", "Low: trades < 8");
    ok(confidenceForTimingBucket({ trades: 50, yearsPresent: 1, yearsPositive: 1 }) === "Low", "Low: yearsPresent <= 1 (single-year veto)");
    ok(confidenceForTimingBucket({ trades: 30, yearsPresent: 4, yearsPositive: 3 }) === "High", "High: 30 trades, 4 yrs, ratio 0.75 ≥ 0.6");
    ok(confidenceForTimingBucket({ trades: 35, yearsPresent: 4, yearsPositive: 2 }) === "Medium", "High fails on ratio 0.5 → falls to Medium");
    ok(confidenceForTimingBucket({ trades: 15, yearsPresent: 3, yearsPositive: 1 }) === "Medium", "Medium: 15 trades, 3 yrs");
    ok(confidenceForTimingBucket({ trades: 14, yearsPresent: 3, yearsPositive: 2 }) === "Low", "Low: 14 trades (below Medium floor) and not High");
    ok(confidenceForTimingBucket({}) === "Low", "Low: empty/default");
}

// ── 5. overview best/worst selection avoids Low when Medium/High exists ────────
console.log("\n[5] buildTimingOverview selection");
{
    // Build a fixture where ONE session (London) is High-confidence positive, and a
    // tiny Outside bucket is a higher-Net-R but Low-confidence fluke.
    const trades = [];
    // London: 40 trades over 5 years, mostly winners (+1), small losses (-0.5)
    const yrs = [2019, 2020, 2021, 2022, 2023];
    yrs.forEach((y) => {
        for (let i = 0; i < 7; i++) trades.push(T(`${y}-06-0${(i % 9) + 1}T08:00:00Z`, 1));
        trades.push(T(`${y}-06-15T08:00:00Z`, -0.5));
    }); // 40 London trades, net strongly positive, 5 years
    // Outside: 2 trades, one huge +20 fluke in a single year
    trades.push(T("2020-12-01T20:00:00Z", 20));
    trades.push(T("2020-12-02T20:00:00Z", -1));

    const ov = buildTimingOverview(trades);
    ok(ov.bestSession && ov.bestSession.label === "London", "Best Session = London (High-conf), not the +20 Low-conf Outside fluke");
    ok(ov.bestSession.confidence !== "Low" && ov.bestSession.lowConfidence === false, "Best Session pick is not Low-confidence");
    ok(ov.mostActiveSession && ov.mostActiveSession.label === "London", "Most Active Session = London (40 trades)");

    // All-Low fixture → best is allowed but flagged lowConfidence
    const tiny = [T("2020-01-06T08:00:00Z", 2), T("2020-01-07T08:00:00Z", -1)];
    const ovTiny = buildTimingOverview(tiny);
    ok(ovTiny.bestSession && ovTiny.bestSession.lowConfidence === true, "all-Low cohort → Best still chosen but flagged low-confidence");

    // empty input → null cards, no throw
    const ovEmpty = buildTimingOverview([]);
    ok(ovEmpty.bestSession === null && ovEmpty.bestMonth === null && ovEmpty.mostActiveHour === null, "empty input → null overview cards");
}

// ── 6. no mutation ────────────────────────────────────────────────────────────
console.log("\n[6] no mutation");
{
    const rows = [T("2020-01-06T08:00:00Z", 2), T("2021-03-10T13:00:00Z", -1)];
    const snap = JSON.stringify(rows);
    buildMonthBreakdown(rows); buildSessionBreakdown(rows); buildHourBreakdown(rows);
    buildWeekdayBreakdown(rows); buildDirectionBreakdown(rows); buildTimingOverview(rows);
    stabilityOf(rows); timingBucketMetrics(rows);
    ok(JSON.stringify(rows) === snap, "timing helpers do not mutate input trades");
}

// ════════════════════════════════════════════════════════════════════════════
// Phase B — what-if removal, discovery, signal, drilldown, matrix
// ════════════════════════════════════════════════════════════════════════════

// Shared fixture: 3 London winners (+2, one per year 2020-22, Jan) + 2 NY losers
// (-1, 2020-21, Mar). Londons bull, NYs bear.
const FIX = [
    T("2020-01-06T08:00:00Z", 2, "bull"), T("2021-01-04T08:00:00Z", 2, "bull"), T("2022-01-03T08:00:00Z", 2, "bull"),
    T("2020-03-10T13:00:00Z", -1, "bear"), T("2021-03-09T13:00:00Z", -1, "bear"),
];

// ── 7. simulateTimingRemoval ──────────────────────────────────────────────────
console.log("\n[7] simulateTimingRemoval");
{
    // Remove New York session (the 2 losers).
    const sim = simulateTimingRemoval(FIX, (t) => t.entry.includes("T13:"));
    ok(sim.tradesRemoved === 2 && sim.keptTrades === 3, "removes 2 matching, keeps 3");
    ok(sim.beforeNetR === 4 && sim.afterNetR === 6, "before +4 → after +6 (NY losers gone)");
    ok(sim.deltaNetR === 2 && sim.removedNetR === -2, "deltaNetR +2, removedNetR −2");
    ok(sim.removedLoserR === 2 && sim.removedWinnerR === 0, "removed side: 2 loss R, 0 winner R");
    ok(sim.beforeWR === 60 && sim.afterWR === 100 && sim.deltaWR === 40, "WR 60 → 100 (Δ +40)");
    ok(sim.afterPF === null, "afterPF null (no losers remain → ∞)");
    ok(sim.yearsPresent === 2 && sim.yearsPositive === 0, "removed cohort spans 2 years, 0 positive");
    ok(sim.confidence === "Low", "removed cohort confidence Low (2 trades)");
    // no mutation
    const snap = JSON.stringify(FIX);
    simulateTimingRemoval(FIX, () => true);
    ok(JSON.stringify(FIX) === snap, "simulateTimingRemoval does not mutate input");
    // remove-none / remove-all
    ok(simulateTimingRemoval(FIX, () => false).tradesRemoved === 0, "predicate false → removes nothing");
    ok(simulateTimingRemoval(FIX, () => true).keptTrades === 0, "predicate true → removes all");
}

// ── 8. candidates: singles + pairs of every type ──────────────────────────────
console.log("\n[8] buildTimingWhatIfCandidates types");
{
    const cands = buildTimingWhatIfCandidates(FIX);
    const hasType = (t) => cands.some((c) => c.type === t);
    ["Month", "Session", "Weekday", "Hour", "Direction"].forEach((t) => ok(hasType(t), `single candidate type present: ${t}`));
    ["Month × Session", "Month × Hour", "Weekday × Hour", "Session × Hour", "Direction × Session", "Direction × Month"]
        .forEach((t) => ok(hasType(t), `pair candidate type present: ${t}`));
    // a known candidate: remove Session = New York → deltaNetR +2
    const ny = cands.find((c) => c.type === "Session" && c.label === "New York");
    ok(ny && ny.deltaNetR === 2 && ny.tradesRemoved === 2, "Session=New York candidate: Δ +2, 2 removed");
    // sorted: rankable (adequate-sample) first, then deltaNetR desc
    ok(cands.length > 0, "candidates produced");
}

// ── 9. signal logic (deterministic) ───────────────────────────────────────────
console.log("\n[9] timingSignal");
{
    ok(timingSignal({ deltaNetR: 5, confidence: "High", tradesRemoved: 10, removedLoserR: 10, removedWinnerR: 2 }) === "Strong", "Strong: Δ≥3, High, n≥8, cheap winners");
    ok(timingSignal({ deltaNetR: 5, confidence: "High", tradesRemoved: 10, removedLoserR: 6, removedWinnerR: 5 }) === "Test", "not Strong when winners not cheap → Test");
    ok(timingSignal({ deltaNetR: 2, confidence: "Medium", tradesRemoved: 5, removedLoserR: 5, removedWinnerR: 4 }) === "Test", "Test: Δ≥1.5 & Medium");
    ok(timingSignal({ deltaNetR: 2, confidence: "Low", tradesRemoved: 5, removedLoserR: 5, removedWinnerR: 1 }) === "Watch", "Watch: positive Δ but Low confidence");
    ok(timingSignal({ deltaNetR: 0.4, confidence: "High", tradesRemoved: 20, removedLoserR: 1, removedWinnerR: 0 }) === "Watch", "Watch: Δ below Test floor");
    ok(timingSignal({ deltaNetR: -1, confidence: "High", tradesRemoved: 20, removedLoserR: 0, removedWinnerR: 1 }) === "Noise", "Noise: non-positive Δ");
}

// ── 10. confidence inheritance + single-year veto ─────────────────────────────
console.log("\n[10] confidence inheritance");
{
    // 12 trades all in 2020 → removed cohort yearsPresent 1 → Low regardless of n
    const oneYear = Array.from({ length: 12 }, (_, i) => T(`2020-06-${String((i % 27) + 1).padStart(2, "0")}T08:00:00Z`, i % 2 ? 1 : -1, "bull"));
    const sim = simulateTimingRemoval(oneYear, () => true);
    ok(sim.tradesRemoved === 12 && sim.yearsPresent === 1, "single-year cohort: 12 trades, 1 year");
    ok(sim.confidence === "Low", "single-year veto forces Low even at n=12");
}

// ── 11. month drilldown ───────────────────────────────────────────────────────
console.log("\n[11] buildMonthDrilldown");
{
    const d = buildMonthDrilldown(FIX, 0); // January
    ok(d && d.label === "Jan" && d.trades === 3, "Jan drilldown: 3 trades (Jan-only)");
    const lon = d.breakdowns.session.find((s) => s.label === "London");
    const ny = d.breakdowns.session.find((s) => s.label === "New York");
    ok(lon.trades === 3 && ny.trades === 0, "Jan session breakdown uses only Jan trades (London 3, NY 0)");
    ok(d.whatIf.removeMonth.tradesRemoved === 3 && d.whatIf.removeMonth.label === "Remove Jan", "removeMonth what-if removes 3 Jan trades");
    const sLon = d.whatIf.bySession.find((c) => c.label === "Jan × London");
    ok(sLon && sLon.tradesRemoved === 3, "Jan × London what-if present (3 removed)");
    ok(d.whatIf.bySession.length === SESSION_ORDER.length, "bySession covers all canonical sessions");
    ok(buildMonthDrilldown(FIX, 13) === null, "out-of-range month → null");
}

// ── 12. month × session matrix ────────────────────────────────────────────────
console.log("\n[12] buildMonthSessionMatrix");
{
    const mx = buildMonthSessionMatrix(FIX);
    ok(mx.rows.length === 12, "12 month rows");
    ok(mx.sessions.join(",") === SESSION_ORDER.join(","), "canonical session columns");
    const jan = mx.rows[0];
    ok(jan.cells["London"].trades === 3 && jan.cells["London"].netR === 6, "Jan × London cell: 3 trades, +6R");
    ok(jan.cells["London"].thin === true, "Jan × London flagged thin (3 < 8)");
    ok(jan.cells["New York"].trades === 0, "Jan × New York empty");
    ok(mx.maxAbs >= 6, "maxAbs reflects largest |Net R|");
}

// ── 13. discovery payload + empty safety + no mutation ────────────────────────
console.log("\n[13] buildTimingDiscovery / empty / no-mutation");
{
    const disc = buildTimingDiscovery(FIX);
    ok(Array.isArray(disc.candidates) && disc.candidates.length > 0, "discovery produces candidates");
    ok(disc.commandCenter && "bestOverall" in disc.commandCenter && "bestMonthSession" in disc.commandCenter, "command center keys present");
    // empty input
    const empty = buildTimingDiscovery([]);
    ok(empty.candidates.length === 0 && empty.commandCenter.bestOverall === null, "empty input → no candidates, null picks");
    ok(buildMonthSessionMatrix([]).rows.length === 12, "empty matrix still 12 rows");
    ok(buildMonthDrilldown([], 0).trades === 0, "empty drilldown safe");
    // no mutation across all Phase B builders
    const snap = JSON.stringify(FIX);
    buildTimingWhatIfCandidates(FIX); buildTimingDiscovery(FIX); buildMonthDrilldown(FIX, 0); buildMonthSessionMatrix(FIX);
    ok(JSON.stringify(FIX) === snap, "Phase B builders do not mutate input");

    // timestampedTrades drops untimestamped rows (shared universe for the lab)
    const mixed = [...FIX, { r: 2 }, { entry: "", r: -1 }, { entry: "not-a-date", r: 1 }];
    const ts = loadCjs("src/data/timingAnalytics.js").timestampedTrades(mixed);
    ok(ts.length === FIX.length, "timestampedTrades keeps only parseable-entry trades (drops 3 junk rows)");
}

// ── 14. buildYearBreakdown ────────────────────────────────────────────────────
console.log("\n[14] buildYearBreakdown");
{
    // 2020: +2,+2 (2W) · 2021: -1 (1L) · 2022: +3,-1 (1W/1L)
    const trades = [
        T("2020-01-06T08:00:00Z", 2), T("2020-02-06T08:00:00Z", 2),
        T("2021-01-04T08:00:00Z", -1),
        T("2022-01-03T08:00:00Z", 3), T("2022-02-03T08:00:00Z", -1),
    ];
    const yb = buildYearBreakdown(trades);
    ok(yb.length === 3 && yb.map((r) => r.label).join(",") === "2020,2021,2022", "observed years only, ascending");
    const y = (lbl) => yb.find((r) => r.label === lbl);
    ok(y("2020").trades === 2 && y("2020").winners === 2 && y("2020").losers === 0, "2020: 2 trades, 2W/0L");
    ok(y("2020").netR === 4 && y("2020").pf === null && y("2020").winRate === 100, "2020: +4R, PF ∞ (null), WR 100%");
    ok(y("2022").winners === 1 && y("2022").losers === 1 && y("2022").pf === 3 && y("2022").netR === 2, "2022: 1W/1L, PF 3, +2R");
    ok(y("2022").expectancy === 1, "2022 expectancy = netR/trades = +1R");
    // single-year rows forced Low (yearsPresent <= 1 veto)
    ok(yb.every((r) => r.confidence === "Low"), "every year row is Low confidence (single-year veto)");
    ok(y("2020").yearsPresent === 1, "year row yearsPresent = 1");
    // empty + no mutation
    ok(buildYearBreakdown([]).length === 0, "empty input → no rows");
    const snap = JSON.stringify(trades);
    buildYearBreakdown(trades);
    ok(JSON.stringify(trades) === snap, "buildYearBreakdown does not mutate input");
}

// ── 15. buildMonthDrilldown.breakdowns.year (month-scoped years) ──────────────
console.log("\n[15] drilldown year breakdown");
{
    // Jan trades in 2020 & 2022 only; a Feb trade must NOT leak into Jan's years.
    const trades = [
        T("2020-01-06T08:00:00Z", 2), T("2022-01-03T08:00:00Z", -1),
        T("2021-02-10T08:00:00Z", 5),
    ];
    const d = buildMonthDrilldown(trades, 0); // January
    ok(Array.isArray(d.breakdowns.year), "drilldown exposes breakdowns.year");
    ok(d.breakdowns.year.map((r) => r.label).join(",") === "2020,2022", "Jan year rows = only Jan's years (2020,2022); Feb's 2021 excluded");
    ok(d.breakdowns.year.reduce((s, r) => s + r.trades, 0) === 2, "Jan year rows cover exactly the 2 Jan trades");
}

// ── 16. monthSpreadVerdict ────────────────────────────────────────────────────
console.log("\n[16] monthSpreadVerdict");
{
    ok(monthSpreadVerdict([]).text === "No dated trades for this month.", "empty → no-data verdict");
    const one = monthSpreadVerdict([{ label: "2024", netR: -3 }]);
    ok(/Single-year sample/.test(one.text) && /2024/.test(one.text), "single year → single-year sample");
    // multi-year spread: 2020 +1, 2021 -1, 2022 +0.5  → positive 2/3, no 70% dominance
    const spread = monthSpreadVerdict([{ label: "2020", netR: 1 }, { label: "2021", netR: -1 }, { label: "2022", netR: 0.5 }]);
    ok(/Spread: positive in 2\/3 years/.test(spread.text), "multi-year → spread with positive count");
    ok(/Best 2020/.test(spread.text) && /worst 2021/.test(spread.text), "spread names best + worst year");
    // concentration: total +5, 2024 = +4.8 (≥70% of |total|, same sign)
    const conc = monthSpreadVerdict([{ label: "2023", netR: 0.2 }, { label: "2024", netR: 4.8 }]);
    ok(/Concentration/.test(conc.text) && /2024/.test(conc.text), "one dominant same-sign year → concentration");
    // offsetting years must NOT over-claim concentration: +6 and -5.5 (total +0.5)
    const offset = monthSpreadVerdict([{ label: "2023", netR: 6 }, { label: "2024", netR: -5.5 }]);
    ok(/Spread/.test(offset.text), "offsetting years (near-zero total) → spread, not concentration");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
