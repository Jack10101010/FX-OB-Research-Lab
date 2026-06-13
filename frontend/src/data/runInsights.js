/**
 * runInsights.js — Research Cockpit insight selector (COCKPIT-1 Phase 1 → V2.0A).
 *
 * Pure, React-free, dependency-free, node-testable. Given the OUTPUTS of existing
 * analytics helpers (passed in by the host page — never recomputed here), it SELECTS,
 * RANKS, and TEMPLATES insight cards for the top-level Research Cockpit.
 *
 * Design contract (see RUN-INSIGHTS-COCKPIT-DESIGN-AUDIT-1.md +
 * RESEARCH-COCKPIT-V2-INSIGHT-CATEGORIES-AUDIT-1.md):
 *   - It is a SELECTOR over existing outputs. It computes no analytics, runs no
 *     simulation/replay, touches no backend, and adds no metric.
 *   - It does NOT define a second confidence system — confidence on signal-derived
 *     cards is the level emitted by data/researchSignals.js, surfaced verbatim.
 *   - It introduces no new analytical threshold. The two gate constants below are
 *     MIRRORS of canonical source-module constants (same single-source intent), kept
 *     in sync — the same pattern lossTriage.js uses to mirror failuresAnalytics
 *     constants while staying import-free.
 *   - Provisional framing is mandatory: every card carries a single-run caveat and no
 *     card may claim a validated/proven rule. Findings are surfaced as candidates; the
 *     human still saves them via the existing Save-Finding flow (not this module).
 *
 * V2.0A adds, without breaking the Phase-1 contract:
 *   - a `topic` tag on every card (sessions_timing | direction | structure |
 *     loss_clusters | general) — the "general" bucket holds Phase-1 cards that don't
 *     belong to a V2.0A section (fill-state signals, BE verdict, distance-at-arm);
 *   - new single-run category producers for Sessions/Timing, Direction, Structure and
 *     Loss Clusters, each fed by an existing pure helper;
 *   - two pure VIEW functions over the flat card list — `buildActionQueue` (cross-
 *     category top-N) and `groupByTopic` (the category sections) — so the page renders
 *     a command-centre without the engine ever changing shape.
 *
 * `buildRunInsights(inputs)` STILL returns a flat InsightCard[] ordered
 * warning → hurting → working → opportunity (Phase-1 behaviour preserved). Each card:
 *   {
 *     id, category,            // 'warning' | 'hurting' | 'working' | 'opportunity'
 *     topic,                   // see COCKPIT_TOPICS (+ 'general')
 *     headline, evidence,
 *     confidence,              // researchSignals level string, or null
 *     severity,                // 'warning' | 'high' | 'medium' | 'low' | 'opportunity'
 *     source: { label, route, params },
 *     caveat, suggestedQuestion,
 *     _score,                  // internal ranking hint (used by the view fns); ignore in UI
 *   }
 *
 * Inputs (all optional; the page passes whatever it computed):
 *   {
 *     meta, researchSignals, contextSinkholes, beVerdict, failureDrivers,
 *     lossTriage, distanceBreakdown,         // Phase 1
 *     sessionBreakdown,                      // buildSessionBreakdown(...) rows
 *     loserRunUp,                            // buildLoserRunUp(...) → { groups }
 *     pairDrivers,                           // buildPairDrivers(...) → { pairs }
 *   }
 */

// ── Mirrored gate constants (NOT new thresholds) ─────────────────────────────
// Kept in sync with their canonical owners; mirrored only so this module stays
// pure + import-free (same approach as lossTriage.js).
export const COCKPIT_LOW_SAMPLE_N = 15;   // mirror of TRIAGE_LOW_SAMPLE_N (data/lossTriage.js)
export const COCKPIT_LIFT_HIGHLIGHT = 1.5; // mirror of EXPLORER_LIFT_HIGHLIGHT (excursionAnalytics.js)

export const CATEGORY_ORDER = ["warning", "hurting", "working", "opportunity"];
const CATEGORY_RANK = { warning: 0, hurting: 1, working: 2, opportunity: 3 };
export const MAX_CARDS = 24;          // generous flat cap; per-topic/queue caps below do the UX limiting
export const PER_TOPIC_CAP = 3;       // each category section shows at most this many cards
export const ACTION_QUEUE_LIMIT = 5;  // Action Queue shows the strongest few across categories

// V2.0A topic sections (ordered). 'general' is intentionally NOT a scoped section —
// it is the catch-all that keeps Phase-1 cards visible (rendered as "Other signals").
export const COCKPIT_TOPICS = [
    { key: "sessions_timing", label: "Sessions / Timing", description: "Which sessions and session×direction pockets carry edge or bleed." },
    { key: "direction",       label: "Direction",         description: "Long vs short performance asymmetry on this run." },
    { key: "structure",       label: "Structure",         description: "BOS vs CHoCH performance asymmetry on this run." },
    { key: "loss_clusters",   label: "Loss Clusters",     description: "Cohorts disproportionately concentrated in the losses." },
];
const TOPIC_ORDER = [...COCKPIT_TOPICS.map((t) => t.key), "general"];
const TOPIC_RANK = Object.fromEntries(TOPIC_ORDER.map((k, i) => [k, i]));

// Action-queue priority: surface hurting/opportunity above working above general.
const QUEUE_PRIORITY = { hurting: 3, opportunity: 2.5, working: 1.5, warning: 0, general: 1 };

// Provisional, single-run framing reused across cards. No card may imply a
// validated/proven/guaranteed rule — the validator enforces this wording contract.
const CAVEAT_SINGLE_RUN = "This-run-only — provisional, not yet a confirmed rule.";
const CAVEAT_SINKHOLE = "Avoid/filter context — provisional, not an exit-management signal.";
const CAVEAT_OPPORTUNITY = "Candidate to investigate — provisional, not yet a confirmed filter.";
const CAVEAT_COHORT = "Single-run cohort split — provisional, not a confirmed directional rule.";

// ── small pure helpers ───────────────────────────────────────────────────────
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const round1 = (v) => Math.round(Number(v) * 10) / 10;
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const pct = (v) => (v == null ? null : Math.round(Number(v) * (Number(v) <= 1 ? 100 : 1)));
const signedR = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${round2(n).toFixed(2)}R`;
};
const signedR1 = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${round1(n).toFixed(1)}R`;
};

// Humanize a signal's cohort label without importing the UI glossary (presentation
// copy only — no analytics). Sessions carry an explicit label; fill-state/entry-model
// keys are mapped here, falling back to a de-snaked key.
const FILL_STATE_LABELS = {
    occupied_at_arm: "Occupied at arm",
    vacant_at_arm: "Vacant at arm",
    aae: "AAE (arm-and-extend)",
    vacant_no_aae: "Vacant, no AAE",
};
function signalLabel(signal) {
    if (!signal) return "Cohort";
    if (signal.label) return String(signal.label);
    const key = String(signal.key || "");
    if (FILL_STATE_LABELS[key]) return FILL_STATE_LABELS[key];
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Cohort";
}
// Map a researchSignals signal to a V2.0A topic. Session signals belong to the
// Sessions/Timing section; everything else is a Phase-1 "general" card.
function signalTopic(signal) {
    return signal?.dimension === "session" ? "sessions_timing" : "general";
}

function confidenceLevel(signal) {
    return signal?.confidence?.level ?? null;
}
// Map a researchSignals confidence level → a coarse severity tag for sorting/badges.
function severityFromConfidence(level) {
    if (level === "High") return "high";
    if (level === "Medium") return "medium";
    return "low";
}

function signalEvidence(signal) {
    const s = signal?.stats || {};
    const decided = (num(s.wins) ?? 0) + (num(s.losses) ?? 0);
    const wr = num(s.winRate);
    const wrTxt = wr == null ? null : `WR ${pct(wr)}%`;
    const parts = [`Avg ${signedR(signal?.effect)}`, `${decided} decided`];
    if (wrTxt) parts.push(wrTxt);
    return parts.join(" · ");
}

// Reduce a cohort stats object ({ trades, wins, losses, winRate, avgR }) from
// loserRunUp/sessionBreakdown to the fields the cards use. netR is derived from the
// existing avgR×trades — not a new metric, just a presentation restatement.
function cohortLine(stats) {
    const s = stats || {};
    const wins = num(s.wins) ?? 0;
    const losses = num(s.losses) ?? 0;
    const decided = wins + losses;
    const trades = num(s.trades) ?? num(s.count) ?? decided;
    const avgR = num(s.avgR) ?? 0;
    const netR = num(s.netR) != null ? num(s.netR) : avgR * trades;
    return { decided, trades, avgR, netR, wr: num(s.winRate) };
}
function cohortEvidence(line) {
    const parts = [`${line.decided} decided`, `net ${signedR1(line.netR)}`, `avg ${signedR(line.avgR)}`];
    if (line.wr != null) parts.splice(1, 0, `WR ${pct(line.wr)}%`);
    return parts.join(" · ");
}

function runRoute(meta) {
    const id = meta?.runId;
    return id ? `/runs/${id}` : "/runs/active";
}

// ── Phase-1 card producers (each returns a card or null) ─────────────────────

// 1 — Low-sample / run-data warning. Always evaluated first; rendered first.
function warningCard(meta) {
    const m = meta || {};
    const total = num(m.totalTrades) ?? 0;
    if (total <= 0) {
        return {
            id: "warn:no-data", category: "warning", topic: "general",
            headline: "No run data loaded",
            evidence: "Select or import a run to populate the cockpit.",
            confidence: null, severity: "warning",
            source: { label: "Open Runs", route: "/runs", params: {} },
            caveat: "Nothing below can be computed without a loaded run.",
            suggestedQuestion: "Which run should be the active research focus?",
        };
    }
    const decided = num(m.decidedTrades) ?? 0;
    const lowSample = decided < COCKPIT_LOW_SAMPLE_N;
    const restricted = !!m.directionRestricted;
    if (!lowSample && !restricted) return null;

    const reasons = [];
    if (lowSample) reasons.push(`only ${decided} decided trades (< ${COCKPIT_LOW_SAMPLE_N})`);
    if (restricted) reasons.push("single-direction run");
    const headline = lowSample
        ? "Thin sample — read everything below as directional"
        : "Single-direction run — comparisons are one-sided";
    return {
        id: "warn:low-sample", category: "warning", topic: "general",
        headline,
        evidence: `This run has ${reasons.join(" · ")}.`,
        confidence: null, severity: "warning",
        source: { label: "Open Run Workspace", route: runRoute(m), params: { tab: "overview" } },
        caveat: "Treat every card below as provisional and directional only.",
        suggestedQuestion: "Does a larger or two-sided run reproduce these patterns?",
    };
}

// 2 — Top negative leak (researchSignals.negatives[0]).
function negativeLeakCard(researchSignals, meta) {
    const sig = researchSignals?.negatives?.[0];
    if (!sig) return null;
    const level = confidenceLevel(sig);
    return {
        id: `hurting:neg:${sig.id}`, category: "hurting", topic: signalTopic(sig),
        headline: `${signalLabel(sig)} is leaking ${signedR(sig.effect)}/trade`,
        evidence: signalEvidence(sig),
        confidence: level, severity: severityFromConfidence(level),
        source: { label: "Classification · Research Signals", route: runRoute(meta), params: { tab: "classification" } },
        caveat: CAVEAT_SINGLE_RUN,
        suggestedQuestion: "Does this leak persist in the next run or a narrower context?",
        _score: Math.abs(num(sig.effect) ?? 0) * (level === "High" ? 3 : level === "Medium" ? 2 : 1),
    };
}

// 3 — Highest loss-R sinkhole (contextSinkholes.sinkholes[0]) → Sessions/Timing.
function sinkholeCard(contextSinkholes) {
    if (!contextSinkholes?.available) return null;
    const sink = contextSinkholes.sinkholes?.[0];
    if (!sink) return null;
    return {
        id: `hurting:sinkhole:${sink.session}:${sink.direction}`, category: "hurting", topic: "sessions_timing",
        headline: `${sink.session} ${sink.direction} is a sinkhole (${signedR1(sink.netR)})`,
        evidence: `${sink.count} trades · WR ${round1(sink.winRate)}% · net ${signedR1(sink.netR)}`,
        confidence: null, severity: "high",
        source: { label: "Failures Lab", route: "/failures-lab", params: { cohort: `${sink.session}|${sink.direction}` } },
        caveat: CAVEAT_SINKHOLE,
        suggestedQuestion: `Would filtering ${sink.session} ${sink.direction} lift net R without cutting winners?`,
        _score: Math.abs(num(sink.netR) ?? 0),
    };
}

// 4 — BE verdict (buildBeVerdict). Phase-1 card; topic 'general' (BE section deferred).
function beVerdictCard(beVerdict) {
    if (!beVerdict?.available) return null;
    const verdict = beVerdict.verdict; // HELPS | HURTS | NEUTRAL
    const best = beVerdict.best || {};
    const category = verdict === "HELPS" ? "working" : "hurting";
    const headlineByVerdict = {
        HELPS: `Break-even helps this run (${best.label || "best variant"})`,
        HURTS: `Break-even hurts this run (${best.label || "best variant"})`,
        NEUTRAL: "Break-even is roughly neutral this run",
    };
    const note = beVerdict.note ? ` ${beVerdict.note}` : "";
    return {
        id: "be:verdict", category, topic: "general",
        headline: headlineByVerdict[verdict] || "Break-even verdict",
        evidence: `Best Δ ${signedR1(best.deltaNetR)} vs baseline ${signedR1(beVerdict.baselineNetR)}${best.n != null ? ` · n ${best.n}` : ""}`,
        confidence: null, severity: verdict === "NEUTRAL" ? "low" : "medium",
        source: { label: "Protection Lab · Break-even", route: "/protection-lab", params: { tab: "breakeven" } },
        caveat: `This-run-only — provisional.${note}`,
        suggestedQuestion: "Does the BE verdict hold once tested selectively, not globally?",
        _score: Math.abs(num(best.deltaNetR) ?? 0) + 0.5,
    };
}

// 5 — Top positive edge (researchSignals.positives[0]).
function positiveEdgeCard(researchSignals, meta) {
    const sig = researchSignals?.positives?.[0];
    if (!sig) return null;
    const level = confidenceLevel(sig);
    return {
        id: `working:pos:${sig.id}`, category: "working", topic: signalTopic(sig),
        headline: `${signalLabel(sig)} is carrying edge (${signedR(sig.effect)}/trade)`,
        evidence: signalEvidence(sig),
        confidence: level, severity: severityFromConfidence(level),
        source: { label: "Classification · Research Signals", route: runRoute(meta), params: { tab: "classification" } },
        caveat: CAVEAT_SINGLE_RUN,
        suggestedQuestion: "Is this edge stable across runs, or a single-sample artifact?",
        _score: Math.abs(num(sig.effect) ?? 0) * (level === "High" ? 3 : level === "Medium" ? 2 : 1),
    };
}

// 6 — Highest-lift loss cohort to investigate → Loss Clusters.
// Fed by buildExplorer cells (which carry a TRUE winners-inclusive lift). NOTE: the
// Phase-1 version consumed buildFailureDrivers, but that helper — called over losers
// only, without a baseline — returns lift=1 for every cell, so its lift gate never
// fired. The page now passes buildExplorer-derived cells (real lift) instead.
function lossClusterCard(lossClusters) {
    const cells = Array.isArray(lossClusters) ? lossClusters : [];
    const top = cells
        .filter((c) => c && c.rankable !== false && (num(c.lift) ?? 0) >= COCKPIT_LIFT_HIGHLIGHT)
        .sort((a, b) => (num(b.lift) ?? 0) - (num(a.lift) ?? 0) || (num(b.lossR) ?? 0) - (num(a.lossR) ?? 0))[0];
    if (!top) return null;
    const liftTxt = `${round1(top.lift)}×`;
    const losers = num(top.losers) ?? num(top.count) ?? 0;
    return {
        id: `opportunity:cluster:${top.dimKey}:${top.value}`, category: "opportunity", topic: "loss_clusters",
        headline: `${top.dimLabel} = ${top.value} is over-represented in losses (${liftTxt})`,
        evidence: `${losers} losers · ${round1(num(top.contributionPct) ?? 0)}% of loss-R · lift ${liftTxt}`,
        confidence: null, severity: "opportunity",
        source: { label: "Failures Lab · Explorer", route: "/failures-lab", params: { dimA: top.dimKey } },
        caveat: CAVEAT_OPPORTUNITY,
        suggestedQuestion: `Would removing ${top.dimLabel}=${top.value} improve net R without harming winners?`,
        _score: num(top.lift) ?? 0,
    };
}

// 7 — Confirmed false-loser pocket (lossTriage false_loser cell) → Loss Clusters.
function falseLoserCard(lossTriage) {
    if (!lossTriage?.available) return null;
    const cell = (lossTriage.cells || []).find((c) => c.key === "false_loser");
    if (!cell || cell.count <= 0) return null;
    return {
        id: "opportunity:false-loser", category: "opportunity", topic: "loss_clusters",
        headline: `${cell.count} "false losers" reached profit before stopping out`,
        evidence: `${round1(cell.pctOfLosses)}% of losses recovered post-stop (peak, not realized).${cell.lowSample ? " Low sample." : ""}`,
        confidence: null, severity: "opportunity",
        source: { label: "Failures Lab · Loss Triage", route: "/failures-lab", params: { cohort: "false_loser" } },
        caveat: "Post-stop peak is an upper bound, not realized profit — provisional.",
        suggestedQuestion: "Is there a protection rule that captures these without harming clean losers?",
        _score: num(cell.count) ?? 0,
    };
}

// 8 — Distance-at-arm thread (Phase-1 card; topic 'general').
function distanceCard(distanceBreakdown, meta) {
    if (!distanceBreakdown?.available) return null;
    return {
        id: "opportunity:distance-at-arm", category: "opportunity", topic: "general",
        headline: "Vacancy distance-at-arm is unresolved",
        evidence: "Distance-at-arm breakdown is available but not yet linked to a verdict.",
        confidence: null, severity: "opportunity",
        source: { label: "Classification · Distance-at-arm", route: runRoute(meta), params: { tab: "classification" } },
        caveat: CAVEAT_OPPORTUNITY,
        suggestedQuestion: "Does occupation-at-arm vs vacated price change expectancy?",
        _score: 0.1,
    };
}

// ── V2.0A category producers ─────────────────────────────────────────────────

// Sessions/Timing — best + worst SESSION cohort by avgR (sessionBreakdown rows).
function sessionCohortCards(sessionBreakdown) {
    const rows = (Array.isArray(sessionBreakdown) ? sessionBreakdown : [])
        .filter((r) => r && r.session && r.session !== "Unknown")
        .map((r) => ({ row: r, line: cohortLine(r) }))
        .filter((x) => x.line.decided >= COCKPIT_LOW_SAMPLE_N);
    if (!rows.length) return [];

    const out = [];
    const worst = rows.reduce((a, b) => (b.line.avgR < a.line.avgR ? b : a));
    const best = rows.reduce((a, b) => (b.line.avgR > a.line.avgR ? b : a));

    if (worst.line.avgR < 0) {
        out.push({
            id: `hurting:session:${worst.row.session}`, category: "hurting", topic: "sessions_timing",
            headline: `${worst.row.session} session is net-negative (${signedR1(worst.line.netR)})`,
            evidence: cohortEvidence(worst.line),
            confidence: null, severity: "medium",
            source: { label: "Session Lab", route: "/session-lab", params: { session: worst.row.session } },
            caveat: CAVEAT_COHORT,
            suggestedQuestion: `Is ${worst.row.session} structurally weak, or a sample artifact this run?`,
            _score: Math.abs(worst.line.netR),
        });
    }
    if (best.line.avgR > 0 && best.row.session !== worst.row.session) {
        out.push({
            id: `working:session:${best.row.session}`, category: "working", topic: "sessions_timing",
            headline: `${best.row.session} session is carrying (${signedR1(best.line.netR)})`,
            evidence: cohortEvidence(best.line),
            confidence: null, severity: "low",
            source: { label: "Session Lab", route: "/session-lab", params: { session: best.row.session } },
            caveat: CAVEAT_COHORT,
            suggestedQuestion: `Does ${best.row.session}'s edge hold across runs?`,
            _score: Math.abs(best.line.netR),
        });
    }
    return out;
}

// Direction / Structure — contrast the two cohorts in a loserRunUp group.
function cohortGroupCards(loserRunUp, groupId, topic, dimWord, route) {
    const group = (loserRunUp?.groups || []).find((g) => g.id === groupId);
    if (!group) return [];
    const rows = (group.rows || [])
        .map((r) => ({ label: r.label, line: cohortLine(r.stats) }))
        .filter((x) => x.line.decided >= COCKPIT_LOW_SAMPLE_N);
    if (rows.length < 1) return [];

    const worst = rows.reduce((a, b) => (b.line.avgR < a.line.avgR ? b : a));
    const best = rows.reduce((a, b) => (b.line.avgR > a.line.avgR ? b : a));
    const out = [];

    if (worst.line.avgR < 0) {
        out.push({
            id: `hurting:${groupId}:${worst.label}`, category: "hurting", topic,
            headline: `${worst.label} ${dimWord} is net-negative (${signedR(worst.line.avgR)}/trade)`,
            evidence: cohortEvidence(worst.line),
            confidence: null, severity: "medium",
            source: { label: "Failures Lab · Explorer", route, params: { dimA: groupId } },
            caveat: CAVEAT_COHORT,
            suggestedQuestion: `Should ${worst.label} be de-emphasised, or is the weakness context-specific?`,
            _score: Math.abs(worst.line.netR),
        });
    }
    if (best.line.avgR > 0 && best.label !== worst.label) {
        out.push({
            id: `working:${groupId}:${best.label}`, category: "working", topic,
            headline: `${best.label} ${dimWord} is the stronger side (${signedR(best.line.avgR)}/trade)`,
            evidence: cohortEvidence(best.line),
            confidence: null, severity: "low",
            source: { label: "Failures Lab · Explorer", route, params: { dimA: groupId } },
            caveat: CAVEAT_COHORT,
            suggestedQuestion: `Is the ${best.label} skew repeatable, or a single-run tilt?`,
            _score: Math.abs(best.line.netR),
        });
    }
    return out;
}

// ── orchestrator ─────────────────────────────────────────────────────────────
/**
 * buildRunInsights(inputs) → InsightCard[]
 * Pure selection/ranking/templating over already-computed analytics outputs.
 * Returns a flat list ordered warning → hurting → working → opportunity (then by
 * internal _score). Per-topic capping happens in groupByTopic, not here.
 */
export function buildRunInsights(inputs = {}) {
    const {
        meta = {},
        researchSignals = null,
        contextSinkholes = null,
        beVerdict = null,
        lossClusters = null,   // buildExplorer-derived cells (real lift) — see lossClusterCard
        lossTriage = null,
        distanceBreakdown = null,
        sessionBreakdown = null,
        loserRunUp = null,
    } = inputs || {};

    const warning = warningCard(meta);
    // "No run loaded" is terminal — nothing else is computable.
    if (warning && warning.id === "warn:no-data") return [warning];

    const candidates = [
        warning,
        // Phase 1
        negativeLeakCard(researchSignals, meta),
        sinkholeCard(contextSinkholes),
        beVerdictCard(beVerdict),
        positiveEdgeCard(researchSignals, meta),
        lossClusterCard(lossClusters),
        falseLoserCard(lossTriage),
        distanceCard(distanceBreakdown, meta),
        // V2.0A categories
        ...sessionCohortCards(sessionBreakdown),
        ...cohortGroupCards(loserRunUp, "direction", "direction", "direction", "/failures-lab"),
        ...cohortGroupCards(loserRunUp, "structure", "structure", "structure", "/failures-lab"),
    ].filter(Boolean);

    // Dedup by id (defensive).
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        unique.push(c);
    }

    // Order: semantic category rank first (Phase-1 contract preserved), then _score desc.
    unique.sort((a, b) => {
        const cr = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
        if (cr !== 0) return cr;
        return (b._score ?? 0) - (a._score ?? 0);
    });

    return unique.slice(0, MAX_CARDS);
}

/**
 * buildActionQueue(cards, { limit }) → InsightCard[]
 * Pure view: the strongest few cards across all categories, hurting/opportunity first.
 * Warnings are excluded (they render in their own strip). Reuses each card's existing
 * severity/_score — no new confidence system.
 */
export function buildActionQueue(cards = [], { limit = ACTION_QUEUE_LIMIT } = {}) {
    return (Array.isArray(cards) ? cards : [])
        .filter((c) => c && c.category !== "warning")
        .map((c) => ({ c, w: QUEUE_PRIORITY[c.category] ?? 1 }))
        .sort((a, b) => (b.w - a.w) || ((b.c._score ?? 0) - (a.c._score ?? 0)))
        .slice(0, Math.max(0, limit))
        .map((x) => x.c);
}

/**
 * groupByTopic(cards) → [{ key, label, description, cards, needsData }]
 * Pure view: the category sections. Returns the four V2.0A sections always (with
 * needsData when empty), then an "Other signals" section only when non-empty. Each
 * section is capped at PER_TOPIC_CAP and sorted by _score.
 */
export function groupByTopic(cards = []) {
    const list = (Array.isArray(cards) ? cards : []).filter((c) => c && c.category !== "warning");
    const byTopic = {};
    for (const c of list) {
        const t = c.topic || "general";
        (byTopic[t] = byTopic[t] || []).push(c);
    }
    const take = (key) => (byTopic[key] || [])
        .slice()
        .sort((a, b) => (b._score ?? 0) - (a._score ?? 0))
        .slice(0, PER_TOPIC_CAP);

    const sections = COCKPIT_TOPICS.map((t) => {
        const sectionCards = take(t.key);
        return { key: t.key, label: t.label, description: t.description, cards: sectionCards, needsData: sectionCards.length === 0 };
    });

    const general = take("general");
    if (general.length) {
        sections.push({
            key: "general",
            label: "Other signals",
            description: "Phase-1 cards not yet organised into a V2 category (classification, protection, distance).",
            cards: general,
            needsData: false,
        });
    }
    return sections;
}

export default buildRunInsights;
