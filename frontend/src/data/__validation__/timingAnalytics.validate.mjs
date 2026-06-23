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

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
