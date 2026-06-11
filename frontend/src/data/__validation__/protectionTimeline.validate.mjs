// protectionTimeline.validate.mjs — pure BE verification timeline builder.
//
// BE-STRATEGY-MAP-VISUAL-VERIFICATION P1. Covers classification, events,
// geometry, baseline pairing, and the integrity rules (no saved/cut without a
// baseline; placement uses timestamps, never candle indices).
//
// Run from frontend/:  node src/data/__validation__/protectionTimeline.validate.mjs

import babel from "@babel/core";
import fs    from "fs";

function loadCjs(absPath) {
    const src = fs.readFileSync(absPath, "utf8");
    const { code } = babel.transformSync(src, {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    new Function("require", "module", "exports", code)(() => ({}), mod, mod.exports);
    return mod.exports;
}

const { buildBreakEvenTimeline, pairBaselineTrade, classificationLabel, buildBeAffectedTrades } = loadCjs("src/data/protectionTimeline.js");

let failures = 0;
const ok = (cond, msg) => {
    if (cond) console.log(`  ✓ ${msg}`);
    else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
};
const approx = (a, b, eps = 1e-6) => Math.abs(Number(a) - Number(b)) <= eps;
const evt = (tl, type) => tl.events.find((e) => e.type === type);

// Long trade: entry 1.10000, stop 1.09000 (risk 0.01), tp 1.13300.
const baseBe = {
    id: "T-001", direction: "Long", entryPrice: 1.10000, stop: 1.09000, tp: 1.13300,
    fill_time: "2025-05-19T08:00:00Z",
    be_arm_level_r: 0.5, be_trigger_basis: "wick",
    be_arm_time: "2025-05-19T08:05:00Z", be_exit_time: "2025-05-19T08:20:00Z",
    be_exit_price: 1.10000, be_exit_r: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§1  loss_saved");
const lossSaved = buildBreakEvenTimeline({
    beTrade: { ...baseBe, be_armed: true, be_triggered: true, be_exit_reason: "be_stop", net_r: 0 },
    baselineTrade: { id: "T-001", net_r: -1.0, outcome: "LOSS" },
    scenario: { armLevelR: 0.5, triggerBasis: "wick", stopBufferR: 0, delayCandles: 0 },
});
ok(lossSaved.classification === "loss_saved", "loser + BE 0R → loss_saved");
ok(approx(lossSaved.deltaR, 1.0), "deltaR = +1.0 (0 − (−1))");
ok(classificationLabel(lossSaved.classification) === "Loss Saved", "label = Loss Saved");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§2  winner_cut");
const winnerCut = buildBreakEvenTimeline({
    beTrade: { ...baseBe, be_armed: true, be_triggered: true, be_exit_reason: "be_stop", net_r: 0 },
    baselineTrade: { id: "T-001", net_r: 2.0, outcome: "WIN" },
    scenario: { armLevelR: 0.5, triggerBasis: "wick" },
});
ok(winnerCut.classification === "winner_cut", "winner + BE 0R → winner_cut");
ok(approx(winnerCut.deltaR, -2.0), "deltaR = −2.0 (0 − 2)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§3  be_exit neutral when no baseline pairing");
const neutral = buildBreakEvenTimeline({
    beTrade: { ...baseBe, be_armed: true, be_triggered: true, be_exit_reason: "be_stop", net_r: 0 },
    baselineTrade: null,
    scenario: { armLevelR: 0.5, triggerBasis: "wick" },
});
ok(neutral.classification === "be_exit", "triggered + no baseline → neutral be_exit (NOT saved/cut)");
ok(neutral.warnings.includes("no_baseline_pairing"), "warns no_baseline_pairing");
ok(neutral.deltaR == null && neutral.originalR == null, "no delta/original R without baseline");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§4  armed_not_triggered");
const ant = buildBreakEvenTimeline({
    beTrade: { ...baseBe, be_armed: true, be_triggered: false, be_exit_reason: "armed_not_triggered", net_r: 3.3, exit_time: "2025-05-19T09:00:00Z" },
    baselineTrade: { id: "T-001", net_r: 3.3, outcome: "WIN" },
    scenario: { armLevelR: 0.5, triggerBasis: "wick" },
});
ok(ant.classification === "armed_not_triggered", "armed but survived → armed_not_triggered");
ok(!!evt(ant, "be_armed"), "has BE Armed event");
ok(!evt(ant, "be_exit") && !!evt(ant, "final_exit"), "no BE exit; has final_exit");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§5  never_armed");
const never = buildBreakEvenTimeline({
    beTrade: { ...baseBe, be_armed: false, be_triggered: false, be_exit_reason: "never_armed", be_arm_time: "", be_exit_time: "", net_r: -1.0, exit_time: "2025-05-19T08:30:00Z" },
    baselineTrade: { id: "T-001", net_r: -1.0, outcome: "LOSS" },
    scenario: { armLevelR: 0.5, triggerBasis: "wick" },
});
ok(never.classification === "never_armed", "never armed → never_armed");
ok(!evt(never, "be_armed") && !evt(never, "be_exit"), "no BE armed / BE exit events");
ok(evt(never, "entry") && evt(never, "final_exit"), "entry + final_exit only");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§6  timestamp placement + geometry");
ok(lossSaved.events.every((e) => "time" in e), "every event carries a time field");
ok(evt(lossSaved, "be_armed").time === "2025-05-19T08:05:00Z", "BE armed uses be_arm_time");
ok(evt(lossSaved, "be_exit").time === "2025-05-19T08:20:00Z", "BE exit uses be_exit_time");
ok(approx(lossSaved.geometry.beArmPrice, 1.10500), "beArmPrice = entry + 0.5×risk (1.10500)");
ok(approx(lossSaved.geometry.beStopPrice, 1.10000), "beStopPrice = be_exit_price (entry)");
ok(lossSaved.geometry.beArmTime && lossSaved.geometry.beExitTime, "geometry carries arm/exit times");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§7  no absolute candle index used for placement");
const serialized = JSON.stringify(lossSaved);
ok(!/candle_index|candleIndex/i.test(serialized), "output contains no candle-index fields (time-based only)");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§8  pairBaselineTrade");
const baseline = [{ id: "T-002", net_r: 1 }, { id: "T-001", net_r: -1 }];
ok(pairBaselineTrade({ id: "T-001" }, baseline)?.net_r === -1, "pairs by id");
ok(pairBaselineTrade({ trade_id: "T-002" }, baseline)?.net_r === 1, "pairs by trade_id");
ok(pairBaselineTrade({ id: "T-999" }, baseline) === null, "no match → null");

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n§9  buildBeAffectedTrades");
const mkBe = (id, over) => ({
    id, direction: "Long", entryPrice: 1.1, stop: 1.09, tp: 1.133,
    be_exit_r: 0, net_r: 0, be_arm_time: "2025-05-19T08:05:00Z", be_exit_time: "2025-05-19T08:20:00Z",
    displayObId: `OB-${id}`, structure: "BOS", session: "London", fill_time: "2025-05-19T08:00:00Z",
    ...over,
});
const beList = [
    mkBe("A", { be_triggered: true, be_exit_reason: "be_stop" }),                 // baseline loss → loss_saved
    mkBe("B", { be_triggered: true, be_exit_reason: "be_stop" }),                 // baseline win  → winner_cut
    mkBe("C", { be_triggered: true, be_exit_reason: "be_stop" }),                 // no baseline   → be_exit
    mkBe("D", { be_triggered: false, be_exit_reason: "never_armed" }),            // excluded
    mkBe("E", { be_armed: true, be_triggered: false, be_exit_reason: "armed_not_triggered" }), // excluded
];
const baseList = [{ id: "A", net_r: -2, outcome: "LOSS" }, { id: "B", net_r: 3, outcome: "WIN" }];
const rows = buildBeAffectedTrades({ beTrades: beList, baselineTrades: baseList, scenario: { armLevelR: 0.5, triggerBasis: "wick" } });
ok(rows.length === 3, "only BE-triggered trades included (never_armed / armed_not_triggered excluded)");
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
ok(byId.A?.classification === "loss_saved" && approx(byId.A.deltaR, 2), "A: loss_saved, ΔR +2");
ok(byId.B?.classification === "winner_cut" && approx(byId.B.deltaR, -3), "B: winner_cut, ΔR −3");
ok(byId.C?.classification === "be_exit" && byId.C.deltaR == null, "C: neutral be_exit, no ΔR (unpaired)");
ok(rows[0].id === "B" && rows[1].id === "A" && rows[2].id === "C", "sorted by |ΔR| desc; unpaired last");
ok(byId.A.baseTradeId === "A" && byId.A.obId === "OB-A" && byId.A.structure === "BOS" && byId.A.session === "London", "identifiers preserved");

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
