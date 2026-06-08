/**
 * obRetestResearch.logictest.cjs — Phase C1 research-layer logic test.
 *
 * Loads the real ES modules via Babel (same pattern as obRetest.logictest.cjs).
 * obRetestResearch imports sessionOf from "@/data/obRetest"; we compile obRetest
 * first and inject it via globalThis so the alias resolves.
 *
 * Run from frontend/:  node src/data/__validation__/obRetestResearch.logictest.cjs
 */
const path = require("path");
const { transformFileSync } = require("@babel/core");
const Module = require("module");

function compile(rel, replacements = {}) {
    let code = transformFileSync(path.resolve(__dirname, rel), { presets: ["@babel/preset-env"] }).code;
    for (const [from, to] of Object.entries(replacements)) code = code.split(from).join(to);
    const m = new Module(rel);
    m.paths = Module._nodeModulePaths(process.cwd());
    m._compile(code, rel + ".js");
    return m.exports;
}

const ob = compile("../obRetest.js");
globalThis.__OB_RETEST__ = ob; // inject for the aliased import below
const R = compile("../obRetestResearch.js", { 'require("@/data/obRetest")': "globalThis.__OB_RETEST__" });

let PASS = 0, FAIL = 0;
function check(name, cond, detail = "") {
    if (cond) { console.log(`  ✓  ${name}`); PASS += 1; }
    else { console.log(`  ✗  ${name}  ${detail}`); FAIL += 1; }
}

// epoch helpers for known UTC hours
const at = (y, mo, d, h) => Math.floor(Date.UTC(y, mo, d, h, 0, 0) / 1000);

function mkEvent(o = {}) {
    return {
        obId: "1", structure: "BOS", direction: "bull",
        detectionTime: at(2025, 5, 2, 0), firstTouchTime: at(2025, 5, 2, 4),
        retestTime: at(2025, 5, 2, 4), retestIndex: 1,
        entryPenetrationPct: 20, maxPenetrationPct: 20,
        reactionMaxPips: 10, reactionMet: true, outcome: "survived",
        candlesToFailure: null, session: null, minutesSinceFirstTouch: 5,
        ...o,
    };
}

// ── Test 1: obJoinKey normalization ──────────────────────────────────────────────
console.log("\nTest 1 — obJoinKey normalization");
check("'OB-3' → '3'", R.obJoinKey("OB-3") === "3");
check("'3' → '3'", R.obJoinKey("3") === "3");
check("3 → '3'", R.obJoinKey(3) === "3");
check("'ob_007' → '7'", R.obJoinKey("ob_007") === "7");
check("'' → null", R.obJoinKey("") === null);

// ── Test 2: fixed buckets ────────────────────────────────────────────────────────
console.log("\nTest 2 — fixed buckets");
check("size 5 → small", R.obSizeBucket(5) === "small (<10p)");
check("size 15 → medium", R.obSizeBucket(15) === "medium (10-20p)");
check("size 25 → large", R.obSizeBucket(25) === "large (>20p)");
check("pen 20 → clean", R.penetrationBucket(20) === "clean (0-33%)");
check("pen 50 → mid", R.penetrationBucket(50) === "mid (33-66%)");
check("pen 80 → deep", R.penetrationBucket(80) === "deep (66-99%)");
check("pen 100 → full", R.penetrationBucket(100) === "full (100%)");
check("retest# 1 → R1", R.retestNumberBucket(1) === "R1");
check("retest# 2 → R2", R.retestNumberBucket(2) === "R2");
check("retest# 5 → R3+", R.retestNumberBucket(5) === "R3+");

// ── Test 3: enrichment join + session derivation ─────────────────────────────────
console.log("\nTest 3 — enrichment join + session derivation");
const obs = [{ id: "3", obWidthPips: 15, originTime: "2025-06-02T11:00:00+00:00", side: "bull", ob_origin_news_window: false }];
const ev3 = mkEvent({ obId: "OB-003", retestTime: at(2025, 5, 2, 4), firstTouchTime: at(2025, 5, 2, 1) });
const [en3] = R.enrichRetestEvents([ev3], obs);
check("joined OB width (15) via OB-003→3", en3.obWidthPips === 15, String(en3.obWidthPips));
check("sizeBucket medium", en3.sizeBucket === "medium (10-20p)");
check("originSession New York (11:00 UTC)", en3.originSession === "New York", en3.originSession);
check("retestSession London (04:00 UTC)", en3.retestSession === "London", en3.retestSession);
check("firstTouchSession Asia (01:00 UTC)", en3.firstTouchSession === "Asia", en3.firstTouchSession);
check("sameSession cross (Asia vs London)", en3.sameSession === "cross", en3.sameSession);
check("originNewsBucket clear", en3.originNewsBucket === "clear", en3.originNewsBucket);

// ── Test 4: time-since-previous-retest per OB ─────────────────────────────────────
console.log("\nTest 4 — time since previous retest (per OB)");
const base = at(2025, 5, 2, 4);
const seq = [
    mkEvent({ obId: "9", retestIndex: 1, retestTime: base }),
    mkEvent({ obId: "9", retestIndex: 2, retestTime: base + 600 }),      // +10m
    mkEvent({ obId: "9", retestIndex: 3, retestTime: base + 600 + 3600 }), // +60m from R2
    mkEvent({ obId: "5", retestIndex: 1, retestTime: base }),            // different OB, independent
];
const enSeq = R.enrichRetestEvents(seq, []);
check("R1 prev = null → 'first'", enSeq[0].minutesSincePrevRetest === null && enSeq[0].timeSincePrevRetestBucket === "first");
check("R2 prev = 10m → '<30m'", enSeq[1].minutesSincePrevRetest === 10 && enSeq[1].timeSincePrevRetestBucket === "<30m", String(enSeq[1].minutesSincePrevRetest));
check("R3 prev = 60m → '30m-2h'", enSeq[2].minutesSincePrevRetest === 60 && enSeq[2].timeSincePrevRetestBucket === "30m-2h", String(enSeq[2].minutesSincePrevRetest));
check("OB 5 R1 independent → 'first'", enSeq[3].minutesSincePrevRetest === null);

// ── Test 5: grouped arithmetic invariant ─────────────────────────────────────────
console.log("\nTest 5 — grouped arithmetic (survived+failed+open == n)");
const batch = [];
for (let i = 0; i < 25; i++) batch.push(mkEvent({ obId: `b${i}`, structure: "BOS", outcome: i < 15 ? "survived" : i < 23 ? "failed" : "open", maxPenetrationPct: i % 2 ? 80 : 20 }));
for (let i = 0; i < 5; i++) batch.push(mkEvent({ obId: `c${i}`, structure: "CHoCH", outcome: "survived" }));
const enBatch = R.enrichRetestEvents(batch, []);
const byStruct = R.groupRetestsByDimension(enBatch, (e) => e.structure, { minN: 20 });
let invariantOk = byStruct.every((r) => r.survived + r.failed + r.open === r.n);
check("every row: survived+failed+open == n", invariantOk);
const bos = byStruct.find((r) => r.key === "BOS");
const choch = byStruct.find((r) => r.key === "CHoCH");
check("BOS n=25", bos && bos.n === 25, bos && String(bos.n));
check("BOS survivalRate = 15/23 (closed only, open excluded)", bos && Math.abs(bos.survivalRate - 15 / 23) < 1e-9, bos && String(bos.survivalRate));

// ── Test 6: min-N suppression flag ───────────────────────────────────────────────
console.log("\nTest 6 — min-N suppression (default 20)");
check("BOS (n=25) belowMinN false", bos && bos.belowMinN === false);
check("CHoCH (n=5) belowMinN true", choch && choch.belowMinN === true);

// ── Test 7: best/worst excludes thin samples ─────────────────────────────────────
console.log("\nTest 7 — best/worst excludes thin samples (n < minN)");
const bw = R.buildBestWorstRetestConditions(enBatch, { minN: 20, top: 3 });
const allEligibleNBig = [...bw.best, ...bw.worst].every((c) => c.n >= 20);
check("all best/worst entries have n >= 20", allEligibleNBig, JSON.stringify([...bw.best, ...bw.worst].map((c) => c.n)));
// NB: the dimension LABEL "Structure (BOS/CHoCH)" contains "CHoCH"; match the VALUE slice via endsWith.
check("no CHoCH-value slice (n=5) in best/worst", ![...bw.best, ...bw.worst].some((c) => c.condition.endsWith(": CHoCH")));
check("eligible count > 0", bw.eligible > 0, String(bw.eligible));

// ── Test 8: buildRetestEdgeBreakdowns shape ──────────────────────────────────────
console.log("\nTest 8 — buildRetestEdgeBreakdowns produces all standard dimensions");
const bd = R.buildRetestEdgeBreakdowns(enBatch, { minN: 20 });
for (const dim of ["byRetestNumber", "byObSize", "byOriginSession", "byRetestSession", "byStructure", "byDirection", "byPenetration", "byTimeSinceDetection", "byTimeSinceFirstTouch"]) {
    check(`has ${dim} with rows[]`, bd[dim] && Array.isArray(bd[dim].rows));
}

// ── result ───────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(52)}`);
console.log(`Results: ${PASS} passed, ${FAIL} failed`);
if (FAIL) { console.log(`FAILURES: ${FAIL}`); process.exit(1); }
console.log("ALL TESTS PASSED ✓");
