// Validation for runInsights.js (Research Cockpit COCKPIT-1, Phase 1).
//
// Confirms, without a test framework, that buildRunInsights:
//   1. Orders cards warning → hurting → working → opportunity, with the warning first.
//   2. Emits a low-sample warning when decided < COCKPIT_LOW_SAMPLE_N, and a terminal
//      "no run data" card (alone) when there are zero trades.
//   3. Selects the top positive / top negative researchSignals as working / hurting cards.
//   4. Generates a BE-verdict card (HELPS → working, HURTS → hurting) and OMITS it when
//      BE replay data is unavailable.
//   5. Generates sinkhole and highest-LIFT failure-driver (opportunity) cards, gating the
//      driver on the lift-highlight floor.
//   6. Is safe on empty / missing / undefined inputs (never throws, returns an array).
//   7. Never overclaims: every card carries a non-empty caveat and no card uses
//      validated/proven/guaranteed/always wording; single-run cards say "provisional".
//   8. Caps output at MAX_CARDS and emits no duplicate ids.
//
// Run from the frontend/ directory (Node ≥ 22 auto-detects ESM in .js sources):
//   node src/data/__validation__/runInsights.validate.mjs
//
// Exits non-zero if any assertion fails.

import {
    buildRunInsights,
    buildActionQueue,
    groupByTopic,
    CATEGORY_ORDER,
    COCKPIT_TOPICS,
    PER_TOPIC_CAP,
    ACTION_QUEUE_LIMIT,
    MAX_CARDS,
    COCKPIT_LOW_SAMPLE_N,
    COCKPIT_LIFT_HIGHLIGHT,
} from "../runInsights.js";

let failures = 0;
const ok = (cond, msg) => {
    if (cond) { console.log(`  ✓ ${msg}`); }
    else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); }
};
const catRank = (c) => CATEGORY_ORDER.indexOf(c);
const BANNED = /\b(validated|proven|guaranteed|always|definitely|certain)\b/i;

// ── fixtures ──────────────────────────────────────────────────────────────────
const sig = (id, effect, level, wins, losses, label) => ({
    id, effect, label, key: id.split(":")[1] || id,
    stats: { wins, losses, winRate: wins / (wins + losses), avgR: effect },
    confidence: { level },
});

const researchSignals = {
    positives: [sig("session:new_york", 0.42, "High", 28, 18, "New York")],
    negatives: [sig("session:outside", -1.05, "Medium", 5, 33, "Outside")],
    suppressed: 1, evaluated: 6,
};
const contextSinkholes = {
    available: true,
    sinkholes: [
        { session: "Outside", direction: "Short", count: 22, netR: -3.1, winRate: 31 },
        { session: "Asia", direction: "Long", count: 18, netR: -0.6, winRate: 44 },
    ],
};
const beVerdictHurts = {
    available: true, verdict: "HURTS",
    baselineNetR: 12.0, best: { label: "BE wick 1.0R", deltaNetR: -2.4, n: 40 },
    note: "Global BE verdict is global-only — selective BE remains untested.",
};
// Loss clusters — buildExplorer-derived cells (real winners-inclusive lift).
const lossClusters = [
    { dimKey: "session",   dimLabel: "Session",   value: "New York", losers: 12, lossR: 14, contributionPct: 35, lift: 2.1, rankable: true },
    { dimKey: "structure", dimLabel: "Structure", value: "BOS",      losers: 20, lossR: 18, contributionPct: 45, lift: 1.2, rankable: true },
];
const lossTriage = {
    available: true,
    totals: { losses: 40 },
    cells: [
        { key: "false_loser", count: 9, pctOfLosses: 22.5, lowSample: true },
        { key: "clean_loss", count: 20, pctOfLosses: 50, lowSample: false },
    ],
};
const fullMeta = {
    runId: "run_123", runLabel: "EURUSD 15m",
    totalTrades: 120, performanceTrades: 110, decidedTrades: 96,
    netR: 12.0, expectancy: 0.1, winRate: 0.55, profitFactor: 1.6,
    directionRestricted: false,
};

const full = buildRunInsights({
    meta: fullMeta, researchSignals, contextSinkholes,
    beVerdict: beVerdictHurts, lossClusters, lossTriage,
});

// ── 1. ordering ─────────────────────────────────────────────────────────────
console.log("ordering");
const ranks = full.map((c) => catRank(c.category));
ok(ranks.every((r, i) => i === 0 || ranks[i - 1] <= r), "cards are ordered by category rank (non-decreasing)");
ok(full.some((c) => c.category === "hurting") && full.some((c) => c.category === "working") && full.some((c) => c.category === "opportunity"),
   "hurting, working and opportunity cards all present in the full case");

// ── 2. warning behaviour ──────────────────────────────────────────────────────
console.log("warning behaviour");
ok(COCKPIT_LOW_SAMPLE_N === 15, "low-sample gate mirrors TRIAGE_LOW_SAMPLE_N (15)");
const lowSample = buildRunInsights({
    meta: { ...fullMeta, decidedTrades: 8 }, researchSignals, contextSinkholes,
});
ok(lowSample[0].category === "warning", "low-sample (decided<15) emits a warning card FIRST");
ok(/directional/i.test(lowSample[0].caveat), "low-sample warning caveat flags directional-only reading");

const restricted = buildRunInsights({ meta: { ...fullMeta, directionRestricted: true }, researchSignals });
ok(restricted[0].category === "warning" && /single-direction/i.test(restricted[0].evidence),
   "single-direction run emits a warning card first");

const noData = buildRunInsights({ meta: { totalTrades: 0 } });
ok(noData.length === 1 && noData[0].id === "warn:no-data", "zero trades → exactly one terminal 'no run data' card");

const healthy = buildRunInsights({ meta: fullMeta, researchSignals });
ok(!healthy.some((c) => c.category === "warning"), "healthy run (decided≥15, two-sided) emits no warning card");

// ── 3. positive / negative selection ──────────────────────────────────────────
console.log("signal selection");
const neg = full.find((c) => c.id.startsWith("hurting:neg:"));
ok(!!neg && neg.category === "hurting", "top negative signal → a hurting card");
ok(neg.confidence === "Medium", "negative card surfaces the researchSignals confidence level verbatim");
ok(/Outside/.test(neg.headline), "negative card headline names the cohort (Outside)");

const pos = full.find((c) => c.id.startsWith("working:pos:"));
ok(!!pos && pos.category === "working", "top positive signal → a working card");
ok(pos.confidence === "High" && /New York/.test(pos.headline), "positive card surfaces level + names cohort");

// ── 4. BE verdict ─────────────────────────────────────────────────────────────
console.log("BE verdict");
const beHurtCard = full.find((c) => c.id === "be:verdict");
ok(!!beHurtCard && beHurtCard.category === "hurting", "BE HURTS → a hurting card");
ok(beHurtCard.caveat.includes("selective BE remains untested"), "BE card carries the global-only caveat verbatim");

const beHelps = buildRunInsights({
    meta: fullMeta, researchSignals,
    beVerdict: { available: true, verdict: "HELPS", baselineNetR: 10, best: { label: "BE close 2.0R", deltaNetR: 3.2, n: 30 }, note: "Global BE verdict is global-only — selective BE remains untested." },
});
ok(beHelps.find((c) => c.id === "be:verdict")?.category === "working", "BE HELPS → a working card");

const beNone = buildRunInsights({ meta: fullMeta, researchSignals, beVerdict: { available: false, reason: "No BE replay variants imported for this run." } });
ok(!beNone.some((c) => c.id === "be:verdict"), "BE unavailable → no BE card (omitted, not a broken card)");

// ── 5. sinkhole + opportunity driver ──────────────────────────────────────────
console.log("sinkhole + opportunity");
const sink = full.find((c) => c.id.startsWith("hurting:sinkhole:"));
ok(!!sink && /Outside Short/.test(sink.headline), "worst sinkhole (Outside Short, -3.1R) becomes a hurting card");

ok(COCKPIT_LIFT_HIGHLIGHT === 1.5, "lift gate mirrors EXPLORER_LIFT_HIGHLIGHT (1.5)");
const opp = full.find((c) => c.id.startsWith("opportunity:cluster:"));
ok(!!opp && opp.category === "opportunity", "highest-lift loss cluster → an opportunity card");
ok(/New York/.test(opp.headline) && /2\.1/.test(opp.evidence), "cluster card picks the HIGH-LIFT cohort (2.1×), not the high-loss-R low-lift one");

const lowLiftOnly = buildRunInsights({
    meta: fullMeta,
    lossClusters: [{ dimKey: "structure", dimLabel: "Structure", value: "BOS", losers: 20, lossR: 18, contributionPct: 45, lift: 1.1, rankable: true }],
});
ok(!lowLiftOnly.some((c) => c.id.startsWith("opportunity:cluster:")), "clusters below the lift floor produce no opportunity card");

const fl = full.find((c) => c.id === "opportunity:false-loser");
ok(!!fl && /false losers/i.test(fl.headline), "false-loser cell becomes an opportunity card");
ok(/upper bound|peak/i.test(fl.caveat), "false-loser card caveat frames post-stop peak as an upper bound, not realized profit");

// ── 6. empty / missing-data safety ────────────────────────────────────────────
console.log("empty/missing safety");
ok(Array.isArray(buildRunInsights()), "no args → returns an array (no throw)");
ok(Array.isArray(buildRunInsights({})) && buildRunInsights({}).length >= 1, "empty object → returns array (no-data warning)");
ok(buildRunInsights({ meta: fullMeta }).every((c) => c && c.id && c.category), "meta-only run never yields malformed cards");
ok(buildRunInsights({ meta: fullMeta, researchSignals: { positives: [], negatives: [] } }).length >= 0, "empty signal lists are safe");

// ── 7. no-overclaim wording ───────────────────────────────────────────────────
console.log("no-overclaim wording");
ok(full.every((c) => typeof c.caveat === "string" && c.caveat.trim().length > 0), "every card has a non-empty caveat");
ok(full.every((c) => !BANNED.test(c.headline) && !BANNED.test(c.evidence) && !BANNED.test(c.caveat)),
   "no card uses validated/proven/guaranteed/always wording anywhere");
ok(full.every((c) => typeof c.suggestedQuestion === "string" && c.suggestedQuestion.includes("?")),
   "every card poses a suggested next question");
ok(full.every((c) => c.source && typeof c.source.route === "string" && c.source.route.startsWith("/")),
   "every card carries a navigable source route");

// ── 8. cap + uniqueness ───────────────────────────────────────────────────────
console.log("cap + uniqueness");
ok(full.length <= MAX_CARDS, `output capped at MAX_CARDS (${MAX_CARDS})`);
ok(new Set(full.map((c) => c.id)).size === full.length, "no duplicate card ids");
ok(full.every((c) => typeof c.topic === "string" && c.topic.length > 0), "every card carries a topic tag (V2.0A)");

// ── 9. V2.0A category producers ───────────────────────────────────────────────
console.log("V2.0A category producers");
const sessionBreakdown = [
    { session: "London",   count: 30, wins: 18, losses: 12, winRate: 0.6,  netR: 6.0,  avgR: 0.20 },  // best
    { session: "Outside",  count: 24, wins: 6,  losses: 18, winRate: 0.25, netR: -8.0, avgR: -0.33 }, // worst
    { session: "Asia",     count: 8,  wins: 4,  losses: 4,  winRate: 0.5,  netR: 0.2,  avgR: 0.02 },  // below floor → ignored
    { session: "Unknown",  count: 40, wins: 20, losses: 20, winRate: 0.5,  netR: -1.0, avgR: -0.02 }, // excluded
];
const cohortStats = (trades, wins, losses, avgR) => ({ trades, wins, losses, winRate: wins / (wins + losses), avgR });
const loserRunUp = {
    available: true,
    groups: [
        { id: "all", label: "All", rows: [{ label: "All", stats: cohortStats(80, 40, 40, 0.05) }] },
        { id: "direction", label: "Direction", rows: [
            { label: "Long",  stats: cohortStats(44, 26, 18, 0.30) },   // stronger
            { label: "Short", stats: cohortStats(36, 12, 24, -0.40) },  // weaker, net-negative
        ] },
        { id: "structure", label: "Structure", rows: [
            { label: "BOS",   stats: cohortStats(50, 30, 20, 0.22) },   // stronger
            { label: "CHoCH", stats: cohortStats(20, 8, 12, -0.30) },   // weaker, above floor
        ] },
    ],
};
// Gating fixture: one cohort below the low-sample floor → produces no card.
const loserRunUpGated = {
    available: true,
    groups: [
        { id: "structure", label: "Structure", rows: [
            { label: "BOS",   stats: cohortStats(50, 30, 20, 0.22) },
            { label: "CHoCH", stats: cohortStats(10, 4, 6, -0.30) },    // n=10 < 15 → gated
        ] },
    ],
};
const v2LossClusters = [
    { dimKey: "direction", dimLabel: "Direction", value: "Short", losers: 20, lossR: 16, contributionPct: 67, lift: 2.4, rankable: true },
    { dimKey: "structure", dimLabel: "Structure", value: "BOS",   losers: 9,  lossR: 6,  contributionPct: 15, lift: 1.1, rankable: true }, // below lift floor
];

const v2 = buildRunInsights({ meta: fullMeta, researchSignals, contextSinkholes, beVerdict: beVerdictHurts, sessionBreakdown, loserRunUp, lossClusters: v2LossClusters });

const sessHurt = v2.find((c) => c.id === "hurting:session:Outside");
ok(!!sessHurt && sessHurt.topic === "sessions_timing", "worst session (Outside, net-neg) → hurting card in sessions_timing");
ok(!v2.some((c) => c.id === "hurting:session:Asia" || c.id === "working:session:Asia"), "below-floor session (Asia, n=8) is gated out");
const sessWork = v2.find((c) => c.id === "working:session:London");
ok(!!sessWork && sessWork.topic === "sessions_timing", "best session (London) → working card in sessions_timing");

const dirHurt = v2.find((c) => c.id === "hurting:direction:Short");
const dirWork = v2.find((c) => c.id === "working:direction:Long");
ok(!!dirHurt && dirHurt.topic === "direction" && /Short/.test(dirHurt.headline), "weaker direction (Short) → hurting card in direction");
ok(!!dirWork && dirWork.topic === "direction", "stronger direction (Long) → working card in direction");

const structWork = v2.find((c) => c.id === "working:structure:BOS");
const structHurt = v2.find((c) => c.id === "hurting:structure:CHoCH");
ok(!!structWork && structWork.topic === "structure", "stronger structure (BOS) → working card in structure");
ok(!!structHurt && structHurt.topic === "structure", "weaker structure (CHoCH) → hurting card in structure");
const gated = buildRunInsights({ meta: fullMeta, loserRunUp: loserRunUpGated });
ok(!gated.some((c) => c.id === "hurting:structure:CHoCH"), "below-floor cohort (CHoCH, n=10) is gated out");
ok(!gated.some((c) => c.id === "working:structure:BOS"), "single remaining cohort emits no 'stronger side' card (no contrast)");

const cluster = v2.find((c) => c.id === "opportunity:cluster:direction:Short");
ok(!!cluster && cluster.topic === "loss_clusters" && /2\.4/.test(cluster.evidence), "top loss cluster (lift 2.4) → loss_clusters opportunity card");
ok(!v2.some((c) => c.id === "opportunity:cluster:structure:BOS"), "below-lift cluster is gated out");

ok(v2.every((c) => typeof c.topic === "string"), "all V2 cards carry a topic");
ok(v2.every((c) => !BANNED.test(c.headline) && !BANNED.test(c.evidence) && !BANNED.test(c.caveat)), "no V2 card overclaims");

// ── 10. Action Queue ──────────────────────────────────────────────────────────
console.log("action queue");
const queue = buildActionQueue(v2);
ok(queue.length > 0 && queue.length <= ACTION_QUEUE_LIMIT, `action queue capped at ACTION_QUEUE_LIMIT (${ACTION_QUEUE_LIMIT})`);
ok(queue.every((c) => c.category !== "warning"), "action queue excludes warning cards");
ok(["hurting", "opportunity"].includes(queue[0].category), "action queue leads with a hurting/opportunity card");
const firstWorkingIdx = queue.findIndex((c) => c.category === "working");
const lastHurtOppIdx = Math.max(...queue.map((c, i) => (["hurting", "opportunity"].includes(c.category) ? i : -1)));
ok(firstWorkingIdx === -1 || firstWorkingIdx > lastHurtOppIdx || lastHurtOppIdx === -1, "working cards never rank above hurting/opportunity in the queue");

// ── 11. groupByTopic sections ─────────────────────────────────────────────────
console.log("groupByTopic sections");
const sections = groupByTopic(v2);
const sectionKeys = sections.map((s) => s.key);
ok(COCKPIT_TOPICS.every((t) => sectionKeys.includes(t.key)), "all four V2.0A topic sections are always present");
ok(sections.every((s) => s.cards.length <= PER_TOPIC_CAP), `each section capped at PER_TOPIC_CAP (${PER_TOPIC_CAP})`);
ok(sections.every((s) => (s.cards.length === 0) === (s.needsData === true)), "needsData flag matches emptiness exactly");
ok(sections.find((s) => s.key === "sessions_timing").cards.length >= 1, "sessions_timing section is populated in the full case");
ok(sections.every((s) => s.cards.every((c) => c.category !== "warning")), "no warning leaks into a topic section");
const general = sections.find((s) => s.key === "general");
ok(!!general && general.cards.some((c) => c.id === "be:verdict"), "Phase-1 BE card is preserved in the 'Other signals' section");

const emptySections = groupByTopic(buildRunInsights({ meta: fullMeta }));
ok(emptySections.filter((s) => COCKPIT_TOPICS.some((t) => t.key === s.key)).every((s) => s.needsData),
   "with no category data, all four sections render a needs-data state");
ok(Array.isArray(buildActionQueue()) && Array.isArray(groupByTopic()), "view fns are safe with no args");

// ── summary ───────────────────────────────────────────────────────────────────
if (failures) {
    console.error(`\n${failures} assertion(s) FAILED.`);
    process.exit(1);
}
console.log("\nAll runInsights assertions passed.");
