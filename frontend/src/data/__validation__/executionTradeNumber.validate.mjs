// executionTradeNumber.validate.mjs — TradingView-style chronological trade numbering.
//
// Proves: backend execution_trade_number is PRESERVED when present; DERIVED chronologically
// (by fill/entry time) when absent (old runs); unfilled rows are null; ob_id / trade_id are
// never mutated; and old runs without the column import safely.
//
// Run from frontend/:  node src/data/__validation__/executionTradeNumber.validate.mjs

import babel from "@babel/core";
import fs from "fs";
import path from "path";

function load(absPath, cache = new Map()) {
    if (cache.has(absPath)) return cache.get(absPath);
    const { code } = babel.transformSync(fs.readFileSync(absPath, "utf8"), {
        filename: absPath,
        presets: [["@babel/preset-env", { modules: "commonjs", targets: { node: "current" } }]],
        babelrc: false, configFile: false,
    });
    const mod = { exports: {} };
    cache.set(absPath, mod.exports);
    const req = (s) => (s.startsWith(".") ? load(path.resolve(path.dirname(absPath), s.endsWith(".js") ? s : s + ".js"), cache) : {});
    new Function("require", "module", "exports", code)(req, mod, mod.exports);
    cache.set(absPath, mod.exports);
    return mod.exports;
}

const imp = load("src/data/importer.js");
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

console.log("\n[A] assignExecutionTradeNumbers — chronological, filled-only, ids untouched");
{
    const trades = [
        { id: "T-5", obId: 5, entry: "2020-01-03 10:00:00+00:00" },   // 3rd by time
        { id: "T-2", obId: 2, entry: "" },                              // unfilled
        { id: "T-9", obId: 9, entry: "2020-01-01 09:00:00+00:00" },   // 1st by time
        { id: "T-7", obId: 7, entry: "2020-01-02 12:00:00+00:00" },   // 2nd by time
    ];
    const order = trades.map((t) => t.id);
    const obids = trades.map((t) => t.obId);
    imp.assignExecutionTradeNumbers(trades);
    const by = Object.fromEntries(trades.map((t) => [t.id, t.executionTradeNumber]));
    ok("derived chronologically by fill time (T-9=1, T-7=2, T-5=3)", by["T-9"] === 1 && by["T-7"] === 2 && by["T-5"] === 3);
    ok("unfilled row → null", by["T-2"] === null);
    ok("row order unchanged (no reorder)", JSON.stringify(trades.map((t) => t.id)) === JSON.stringify(order));
    ok("ob_id values untouched", JSON.stringify(trades.map((t) => t.obId)) === JSON.stringify(obids));
    ok("snake mirror execution_trade_number set", trades.find((t) => t.id === "T-9").execution_trade_number === 1);
}

console.log("\n[B] parseTradesCSV PRESERVES backend execution_trade_number when present");
{
    const csv = [
        "trade_id,ob_id,fill_time,net_r,outcome,execution_trade_number",
        "L_5,5,2020-01-03 10:00:00+00:00,2,WIN,3",
        "L_9,9,2020-01-01 09:00:00+00:00,-1,LOSS,1",
        "L_7,7,2020-01-02 12:00:00+00:00,2,WIN,2",
    ].join("\n");
    const t = imp.parseTradesCSV(csv);
    const by = Object.fromEntries(t.map((x) => [x.rawTradeId, x.executionTradeNumber]));
    ok("backend numbers preserved exactly (not re-derived)", by["L_5"] === 3 && by["L_9"] === 1 && by["L_7"] === 2);
    ok("ob_id / trade_id preserved", t[0].obId === 5 && t[0].rawTradeId === "L_5");
}

console.log("\n[C] parseTradesCSV DERIVES when column absent (old runs) + imports safely");
{
    const csv = [
        "trade_id,ob_id,fill_time,net_r,outcome",
        "L_5,5,2020-01-03 10:00:00+00:00,2,WIN",
        "L_2,2,,,UNFILLED",
        "L_9,9,2020-01-01 09:00:00+00:00,-1,LOSS",
        "L_7,7,2020-01-02 12:00:00+00:00,2,WIN",
    ].join("\n");
    const t = imp.parseTradesCSV(csv);
    const by = Object.fromEntries(t.map((x) => [x.rawTradeId, x.executionTradeNumber]));
    ok("old run derives chronological 1..N over filled", by["L_9"] === 1 && by["L_7"] === 2 && by["L_5"] === 3);
    ok("old run unfilled → null", by["L_2"] === null);
    ok("old run ob_id/trade_id untouched", t.find((x) => x.rawTradeId === "L_9").obId === 9);
}

console.log("\n[D] empty + missing fill_time safe");
{
    ok("empty trades → returns []", JSON.stringify(imp.assignExecutionTradeNumbers([])) === "[]");
    const noFill = [{ id: "X", obId: 1 }];
    imp.assignExecutionTradeNumbers(noFill);
    ok("no entry/fill_time → execution number null, no throw", noFill[0].executionTradeNumber === null);
}

console.log("\n[E] importer equity-curve points carry the chronological number + keep obId");
{
    const src = fs.readFileSync("src/data/importer.js", "utf8");
    // computeEquityCurve point shape (source-level, function is internal).
    ok("computeEquityCurve point includes tradeNumber + executionTradeNumber", /tradeNumber,\s*\n\s*executionTradeNumber: t\.executionTradeNumber/.test(src) || (/tradeNumber/.test(src) && /executionTradeNumber: t\.executionTradeNumber/.test(src)));
    ok("computeEquityCurve keeps obId separately (forensic)", /obId: t\.obId/.test(src));
    ok("trade markers carry executionTradeNumber", /executionTradeNumber: t\.executionTradeNumber \?\? null/.test(src));
}

console.log("\n[F] Run Workspace equity tooltip uses execution number, NOT ob-derived id");
{
    const eq = fs.readFileSync("src/components/lab/EquityCurve.jsx", "utf8");
    ok("tooltip title is 'Trade #' from executionTradeNumber/tradeNumber (index fallback)", /Trade #\$\{p\.executionTradeNumber \?\? p\.tradeNumber \?\? \(Number\.isFinite\(Number\(p\.i\)\)/.test(eq));
    ok("tooltip NO LONGER leads with p.displayTradeId · direction · structure", !/\{p\.displayTradeId \|\| "—"\} · \{p\.direction/.test(eq));
    ok("tooltip keeps OB id as a muted forensic suffix", /p\.displayObId \? <span[^>]*>\{` · \$\{p\.displayObId\}`\}/.test(eq));

    const rd = fs.readFileSync("src/pages/RunDetail.jsx", "utf8");
    ok("RunDetail equity point adds executionTradeNumber + tradeNumber", /executionTradeNumber:\s*trade\.executionTradeNumber \?\? null/.test(rd) && /tradeNumber:\s*\(trade\.executionTradeNumber != null \? trade\.executionTradeNumber : idx \+ 1\)/.test(rd));
    ok("RunDetail keeps displayObId/obId on the point (forensic)", /displayObId:\s*trade\.displayObId/.test(rd) && /obId:\s*trade\.obId/.test(rd));
    ok("RunDetail trades table still exposes Trade ID + OB ID columns (forensic intact)", /label: "Trade ID"/.test(rd) && /label: "OB ID"/.test(rd));
}

console.log(`\n${fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
