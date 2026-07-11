// Node ESM validator for edgeAttribution.js — run: node edgeAttribution.validate.mjs
import { buildEdgeAttribution, fmtPF } from "../edgeAttribution.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name, extra); } };

// synthetic trades: shorts win (+3), longs lose (-1); NY-short strong; Wed negative
function mk(date, dir, r, session = "New York", structure = "BOS", w = 9, entryPrice = 1.1, stop = 1.099) {
    return { entry: date, direction: dir, r, session, structure, obWidthPips: w, entryPrice, stop, outcome: r > 0 ? "WIN" : "LOSS" };
}
const trades = [];
// fixed dates to isolate weekdays: 2021-03-04=Thu, 2021-03-05=Fri, 2022-05-06=Fri, 2021-01-06=Wed
// 2021: 20 NY shorts win (Thu), 10 NY longs lose (Fri)
for (let i = 0; i < 20; i++) trades.push(mk(`2021-03-04 13:3${i % 6}:00+00:00`, "Short", 3, "New York"));
for (let i = 0; i < 10; i++) trades.push(mk(`2021-03-05 13:3${i % 6}:00+00:00`, "Long", -1, "New York"));
// 2022: 10 Asia shorts win (Fri)
for (let i = 0; i < 10; i++) trades.push(mk(`2022-05-06 02:3${i % 6}:00+00:00`, "Short", 3, "Asia"));
// Wednesday drain: 8 losses on a Wednesday (2021-01-06 is a Wed); no winners on Wed
for (let i = 0; i < 8; i++) trades.push(mk(`2021-01-06 13:3${i % 6}:00+00:00`, "Long", -1, "London"));
// High-volume dead weight: 40 London-Lull longs, net 0 (Tue 2021-03-02); 20×+1, 20×-1
for (let i = 0; i < 20; i++) trades.push(mk(`2021-03-02 11:0${i % 6}:00+00:00`, "Long", 1, "London Lull"));
for (let i = 0; i < 20; i++) trades.push(mk(`2021-03-02 11:3${i % 6}:00+00:00`, "Long", -1, "London Lull"));

const ea = buildEdgeAttribution(trades);
ok("ok=true", ea.ok === true);
ok("filled count", ea.filled === trades.length, `got ${ea.filled}`);
const expectedNet = 20 * 3 + 10 * -1 + 10 * 3 + 8 * -1; // 60-10+30-8 = 72
ok("net R reconciles", ea.summary.netR === expectedNet, `got ${ea.summary.netR} want ${expectedNet}`);
ok("short carries edge (direction cohort)", (ea.cohorts.direction.find(c => c.key === "Short").netR) === 90);
ok("long is negative", (ea.cohorts.direction.find(c => c.key === "Long").netR) === -18);
ok("one_sided warning present", ea.warnings.some(w => w.code === "one_sided"));
ok("session×dir matrix has NY/Short engine", ea.sessionDirection.matrix.find(r => r.session === "New York").Short.netR === 60);
ok("Wednesday negative cohort", (ea.cohorts.weekday.find(c => c.key === "Wed")?.netR ?? 0) < 0);
ok("engines.positives ranked desc", ea.engines.positives[0].netR >= (ea.engines.positives[1]?.netR ?? -Infinity));
ok("leaky fields excluded warning", ea.warnings.some(w => w.code === "leaky_excluded"));
ok("suggestions include dir asymmetry", ea.suggestions.some(s => s.id === "dir_asym"));
ok("headline generated", typeof ea.headline.text === "string" && ea.headline.text.length > 0);
ok("concentration monthly computed", ea.concentration.monthly.units > 0);
ok("PF formatter", fmtPF(Infinity) === "∞" && fmtPF(1.234) === "1.23");

// --- enriched cohort stats ---
const shortDir = ea.cohorts.direction.find(c => c.key === "Short");
ok("gross win R (short)", shortDir.grossWinR === 90, `got ${shortDir.grossWinR}`);
ok("gross loss R (short)", shortDir.grossLossR === 0, `got ${shortDir.grossLossR}`);
ok("win/loss counts (short)", shortDir.winCount === 30 && shortDir.lossCount === 0, `got ${shortDir.winCount}/${shortDir.lossCount}`);
ok("avg win R (short)", shortDir.avgWinR === 3, `got ${shortDir.avgWinR}`);
const nyShort = ea.sessionDirection.matrix.find(r => r.session === "New York").Short;
ok("NY/Short cohort maxDD = 0 (monotonic up)", nyShort.maxDD === 0, `got ${nyShort.maxDD}`);
ok("NY/Short labelled Engine", nyShort.label === "Engine", `got ${nyShort.label}`);
ok("Wednesday labelled Drain", (ea.cohorts.weekday.find(c => c.key === "Wed")?.label) === "Drain", `got ${ea.cohorts.weekday.find(c => c.key === "Wed")?.label}`);

// --- high-volume dead weight ---
ok("dead weight list populated", ea.deadWeight.length > 0, `got ${ea.deadWeight.length}`);
ok("London Lull flagged high-volume low-edge", ea.deadWeight.some(c => c.key.includes("London Lull") && c.flags.includes("high_volume_low_net")));
ok("dead_weight warning present", ea.warnings.some(w => w.code === "dead_weight"));

// --- cost-sensitive classification (separate build) ---
const costed = [];
for (let i = 0; i < 25; i++) costed.push({ entry: `2023-04-0${(i % 5) + 1} 13:30:00+00:00`, direction: "Short", r: 0.4, total_cost_r: 0.5, session: "New York", structure: "BOS", obWidthPips: 9, entryPrice: 1.1, stop: 1.099 });
const eaCost = buildEdgeAttribution(costed);
const costDir = eaCost.cohorts.direction.find(c => c.key === "Short");
ok("cost R aggregated", costDir.costR === 12.5, `got ${costDir.costR}`);
ok("cost-eaten cohort labelled Cost-sensitive", costDir.label === "Cost-sensitive", `got ${costDir.label}`);
ok("cost_eaten warning present", eaCost.warnings.some(w => w.code === "cost_eaten"));

// --- decision + reasons (Phase: Strategy Doctor) ---
ok("clean engine → decision Trade", shortDir.decision === "Trade", `got ${shortDir.decision}`);
ok("Wed (n<20) → Insufficient Evidence", (ea.cohorts.weekday.find(c => c.key === "Wed")?.decision) === "Insufficient Evidence", `got ${ea.cohorts.weekday.find(c => c.key === "Wed")?.decision}`);
const llSess = ea.cohorts.session.find(c => c.key === "London Lull");
ok("dead-weight session → decision Avoid", llSess.decision === "Avoid", `got ${llSess.decision}`);
ok("dead-weight session → reason 'High turnover, low edge'", llSess.reasons.includes("High turnover, low edge"), `got ${llSess.reasons}`);
ok("cost-eaten cohort → decision Conditional", costDir.decision === "Conditional", `got ${costDir.decision}`);
ok("cost-eaten cohort → reason 'Cost-sensitive'", costDir.reasons.includes("Cost-sensitive"));

// --- efficiency metrics ---
ok("turnover = grossWin + grossLoss", shortDir.turnover === 90, `got ${shortDir.turnover}`);
ok("ddPerNet 0 for monotonic-up cohort", nyShort.ddPerNet === 0, `got ${nyShort.ddPerNet}`);
ok("costPct computed", costDir.costPct === 56, `got ${costDir.costPct}`);

// --- doctor's diagnosis ---
ok("diagnosis has 6 health axes", ea.diagnosis.health.axes.length === 6, `got ${ea.diagnosis.health.axes.length}`);
ok("health grade is a letter", /^[A-F]$/.test(ea.diagnosis.health.grade), `got ${ea.diagnosis.health.grade}`);
ok("primary engine identified", ea.diagnosis.primaryEngine && ea.diagnosis.primaryEngine.netR > 0);
ok("confidence is a level", ["Low", "Medium", "High"].includes(ea.diagnosis.confidence));
ok("engine profile ok + Direction=Short facet", ea.diagnosis.profile.ok && ea.diagnosis.profile.facets.some(f => f.dim === "Direction" && f.value === "Short"));

// --- research queue ---
ok("research queue populated", ea.researchQueue.length > 0, `got ${ea.researchQueue.length}`);
ok("research queue ranked desc by priority", ea.researchQueue.every((it, i, a) => i === 0 || a[i - 1].priorityScore >= it.priorityScore));
ok("queue items carry target + priority", ea.researchQueue.every(it => it.target && it.priority && typeof it.priorityScore === "number"));

// --- negative run ---
const neg = [];
for (let i = 0; i < 25; i++) neg.push({ entry: `2023-05-0${(i % 5) + 1} 13:30:00+00:00`, direction: "Short", r: -0.5, session: "New York", structure: "BOS", obWidthPips: 9, entryPrice: 1.1, stop: 1.099 });
const eaNeg = buildEdgeAttribution(neg);
ok("negative run: health grade D/F", ["D", "F"].includes(eaNeg.diagnosis.health.grade), `got ${eaNeg.diagnosis.health.grade}`);
ok("negative run: direction decision Avoid", eaNeg.cohorts.direction.find(c => c.key === "Short").decision === "Avoid", `got ${eaNeg.cohorts.direction.find(c => c.key === "Short").decision}`);

// empty-run guard
const empty = buildEdgeAttribution([{ entryPrice: 1.1, stop: 1.099, direction: "Long" /* no r, no fill time */ }]);
ok("empty/no-fill guard returns ok=false", empty.ok === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
