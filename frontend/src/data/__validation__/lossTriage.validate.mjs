// lossTriage.validate.mjs — pure Failures Lab V5 Loss Triage decision layer.
//
// Verifies the two orthogonal axes (post-stop recovery × pre-stop run-up), all four
// cells, confirmed/candidate/reached-TP handling, availability gating, low-sample
// flag, percentage math, the BE verdict aggregation, and context sinkholes.
//
// Run from frontend/:  node src/data/__validation__/lossTriage.validate.mjs

import babel from "@babel/core";
import fs from "fs";

function loadCjs(absPath) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    // lossTriage.js has no imports, so the require shim is never invoked.
    new Function("require", "module", "exports", code)(() => ({}), mod, mod.exports);
    return mod.exports;
}

const { buildLossTriage, buildBeVerdict, buildContextSinkholes, TRIAGE_LOW_SAMPLE_N } =
    loadCjs("src/data/lossTriage.js");

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ FAIL: ${msg}`); } };
const approx = (a, b, e = 0.05) => Math.abs(Number(a) - Number(b)) <= e;
const cell = (rep, key) => rep.cells.find((c) => c.key === key);

// Fixtures. A loser carries outcome:"LOSS"; ps = post_stop_mfe_r, tp = reached TP, mfe = pre-stop mfe_r.
const loss = (ps, mfe, extra = {}) => ({ outcome: "LOSS", post_stop_mfe_r: ps, mfe_r: mfe, ...extra });
const win  = (extra = {}) => ({ outcome: "WIN", ...extra });

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§1  all four cells (axis A × axis B)");
{
    const trades = [
        loss(-0.2, 0.3),   // genuine + flat   → clean_loss
        loss(1.5, 0.4),    // recovered(conf) + flat → false_loser
        loss(-0.1, 1.4),   // genuine + ran    → give_back
        loss(2.0, 1.8),    // recovered + ran  → round_trip
    ];
    const r = buildLossTriage(trades);
    ok(r.available, "available with post-stop + mfe present");
    ok(cell(r, "clean_loss").count === 1, "clean_loss = 1 (genuine + flat)");
    ok(cell(r, "false_loser").count === 1, "false_loser = 1 (recovered + flat)");
    ok(cell(r, "give_back").count === 1, "give_back = 1 (genuine + ran)");
    ok(cell(r, "round_trip").count === 1, "round_trip = 1 (recovered + ran)");
    ok(r.totals.losses === 4 && r.totals.classified === 4, "totals: 4 losses, 4 classified");
}

console.log("\n§2  candidate AND confirmed both count as Recovered");
{
    const trades = [
        loss(0.6, 0.2),  // candidate (>=0.5,<1) + flat → false_loser
        loss(1.0, 0.2),  // confirmed (>=1) + flat      → false_loser
        loss(0.49, 0.2), // below candidate             → clean_loss (genuine)
    ];
    const r = buildLossTriage(trades);
    ok(cell(r, "false_loser").count === 2, "candidate + confirmed both Recovered → false_loser = 2");
    ok(cell(r, "clean_loss").count === 1, "0.49R post-stop → genuine (clean_loss)");
}

console.log("\n§3  reached original TP counts as Recovered even if post_stop_mfe_r missing/low");
{
    const trades = [
        loss(null, 0.2, { post_stop_reached_original_tp: true }), // tp true, ps missing → recovered
        loss(0.1,  0.2, { post_stop_reached_original_tp: true }), // tp true, ps low     → recovered
    ];
    const r = buildLossTriage(trades);
    ok(r.available, "available via reached-TP even with missing post-stop mfe on some rows");
    ok(cell(r, "false_loser").count === 2, "reached-TP → Recovered (false_loser = 2)");
    ok(cell(r, "clean_loss").count === 0, "no genuine when TP reached");
}

console.log("\n§4  mfe_r >= 1R counts as Ran; < 1R is Flat");
{
    const r = buildLossTriage([loss(-0.2, 1.0), loss(-0.2, 0.99)]);
    ok(cell(r, "give_back").count === 1, "mfe 1.0 → Ran (give_back)");
    ok(cell(r, "clean_loss").count === 1, "mfe 0.99 → Flat (clean_loss)");
}

console.log("\n§5  percentage math (% of losses)");
{
    const trades = [loss(-0.2, 0.2), loss(-0.2, 0.2), loss(-0.2, 0.2), loss(2.0, 2.0)];
    const r = buildLossTriage(trades); // 3 clean, 1 round_trip of 4
    ok(approx(cell(r, "clean_loss").pctOfLosses, 75), "clean_loss 3/4 = 75%");
    ok(approx(cell(r, "round_trip").pctOfLosses, 25), "round_trip 1/4 = 25%");
}

console.log("\n§6  low-sample flag (cell count < threshold)");
{
    ok(TRIAGE_LOW_SAMPLE_N === 15, "low-sample threshold = 15");
    const many = Array.from({ length: 20 }, () => loss(-0.2, 0.2)); // 20 clean losses
    const r = buildLossTriage(many);
    ok(cell(r, "clean_loss").lowSample === false, "20 in cell → not low-sample");
    ok(cell(r, "round_trip").lowSample === true, "0 in cell → low-sample");
}

console.log("\n§7  availability gating");
{
    ok(buildLossTriage([]).available === false, "empty input → unavailable");
    ok(buildLossTriage(null).available === false, "null input → unavailable (safe)");
    ok(buildLossTriage([win(), win()]).available === false, "no losers → unavailable");
    // losers but NO post-stop data anywhere
    const noPs = buildLossTriage([{ outcome: "LOSS", mfe_r: 0.5 }]);
    ok(noPs.available === false, "losers without post-stop data → unavailable");
    // losers but NO mfe data anywhere
    const noMfe = buildLossTriage([{ outcome: "LOSS", post_stop_mfe_r: 0.5 }]);
    ok(noMfe.available === false, "losers without mfe data → unavailable");
    // unavailable report still returns the 4 cells (zeroed) for stable UI
    ok(noPs.cells.length === 4, "unavailable report still exposes 4 cells");
}

console.log("\n§8  BE verdict aggregation (sum net_r per scenario vs baseline)");
{
    const beTradesByMode = {
        single_position: {
            baseline: {
                be_close_3p50R: [{ net_r: 3 }, { net_r: 2 }, { net_r: 0 }],   // netR 5
                be_close_0p25R: [{ net_r: -10 }, { net_r: -5 }],              // netR -15
            },
        },
    };
    const v = buildBeVerdict(beTradesByMode, { executionMode: "single_position", baselineNetR: 27.7 });
    ok(v.available, "BE verdict available");
    ok(v.best.key === "be_close_3p50R", "best variant = least-bad delta (be_close_3p50R)");
    ok(approx(v.best.netR, 5) && approx(v.best.deltaNetR, 5 - 27.7), "best netR 5, delta vs baseline 27.7");
    ok(v.verdict === "HURTS", "best delta < 0 → verdict HURTS");
}

console.log("\n§9  BE verdict gating");
{
    ok(buildBeVerdict(null, { baselineNetR: 10 }).available === false, "no beTradesByMode → unavailable");
    ok(buildBeVerdict({}, { baselineNetR: 10 }).available === false, "empty beTradesByMode → unavailable");
    ok(buildBeVerdict({ single_position: { baseline: { be_x: [{ net_r: 1 }] } } }, {}).available === false,
        "missing baselineNetR → unavailable");
    // helps verdict
    const helps = buildBeVerdict({ m: { baseline: { be_y: [{ net_r: 30 }] } } },
        { executionMode: "m", baselineNetR: 20 });
    ok(helps.verdict === "HELPS", "best delta > band → HELPS");
}

console.log("\n§10  context sinkholes (session × direction, n >= threshold, netR < 0)");
{
    const trades = [];
    // Outside/bearish: 16 trades, all losses → strong negative sinkhole
    for (let i = 0; i < 16; i++) trades.push({ outcome: "LOSS", session: "Outside", direction: "bearish", net_r: -1 });
    // New York/bullish: 20 trades, clearly net positive → not a sinkhole
    for (let i = 0; i < 4; i++)  trades.push({ outcome: "LOSS", session: "New York", direction: "bullish", net_r: -1 });
    for (let i = 0; i < 16; i++) trades.push({ outcome: "WIN",  session: "New York", direction: "bullish", net_r: 3.3 });
    // Asia/bullish: only 5 trades → below low-sample, excluded even though negative
    for (let i = 0; i < 5; i++)  trades.push({ outcome: "LOSS", session: "Asia", direction: "bullish", net_r: -1 });
    const r = buildContextSinkholes(trades);
    ok(r.available, "sinkholes available");
    ok(r.sinkholes.some((s) => s.session === "Outside" && s.direction === "bearish"), "Outside/bearish flagged");
    ok(!r.sinkholes.some((s) => s.session === "New York"), "net-positive NY/bullish not a sinkhole");
    ok(!r.sinkholes.some((s) => s.session === "Asia"), "below-low-sample Asia pocket excluded");
    ok(buildContextSinkholes([]).available === false, "empty → unavailable");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
