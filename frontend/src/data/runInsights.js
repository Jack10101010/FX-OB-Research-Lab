/**
 * runInsights.js — Research Cockpit insight selector (COCKPIT-1, Phase 1).
 *
 * Pure, React-free, dependency-free, node-testable. Given the OUTPUTS of existing
 * analytics helpers (passed in by the host page — never recomputed here), it SELECTS,
 * RANKS, and TEMPLATES a small set of insight cards for the top-level Research Cockpit.
 *
 * Design contract (see RUN-INSIGHTS-COCKPIT-DESIGN-AUDIT-1.md):
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
 * Inputs (all optional; the page passes whatever it computed):
 *   {
 *     meta: {
 *       runId, runLabel, totalTrades, performanceTrades, decidedTrades,
 *       netR, expectancy, winRate, profitFactor, directionRestricted,
 *     },
 *     researchSignals,   // buildResearchSignals(...) → { positives, negatives, ... }
 *     contextSinkholes,  // buildContextSinkholes(...) → { available, sinkholes }
 *     beVerdict,         // buildBeVerdict(...) → { available, verdict, best, note }
 *     failureDrivers,    // buildFailureDrivers(...) → { drivers: [...] }
 *     lossTriage,        // buildLossTriage(...) → { available, cells, totals }
 *     distanceBreakdown, // buildDistanceAtArmBreakdown(...) → { available, ... }
 *   }
 *
 * Output: InsightCard[] — ordered warning → hurting → working → opportunity, capped.
 *   {
 *     id, category,            // 'warning' | 'hurting' | 'working' | 'opportunity'
 *     headline, evidence,
 *     confidence,              // researchSignals level string, or null
 *     severity,                // 'warning' | 'high' | 'medium' | 'low' | 'opportunity'
 *     source: { label, route, params },
 *     caveat, suggestedQuestion,
 *   }
 */

// ── Mirrored gate constants (NOT new thresholds) ─────────────────────────────
// Kept in sync with their canonical owners; mirrored only so this module stays
// pure + import-free (same approach as lossTriage.js).
export const COCKPIT_LOW_SAMPLE_N = 15;   // mirror of TRIAGE_LOW_SAMPLE_N (data/lossTriage.js)
export const COCKPIT_LIFT_HIGHLIGHT = 1.5; // mirror of EXPLORER_LIFT_HIGHLIGHT (excursionAnalytics.js)

export const CATEGORY_ORDER = ["warning", "hurting", "working", "opportunity"];
const CATEGORY_RANK = { warning: 0, hurting: 1, working: 2, opportunity: 3 };
export const MAX_CARDS = 8;

// Provisional, single-run framing reused across cards. No card may imply a
// validated/proven/guaranteed rule — the validator enforces this wording contract.
const CAVEAT_SINGLE_RUN = "This-run-only — provisional, not yet a confirmed rule.";
const CAVEAT_SINKHOLE = "Avoid/filter context — provisional, not an exit-management signal.";
const CAVEAT_OPPORTUNITY = "Candidate to investigate — provisional, not yet a confirmed filter.";

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

// ── card producers (each returns a card or null) ─────────────────────────────

// 1 — Low-sample / run-data warning. Always evaluated first; rendered first.
function warningCard(meta) {
    const m = meta || {};
    const total = num(m.totalTrades) ?? 0;
    if (total <= 0) {
        return {
            id: "warn:no-data",
            category: "warning",
            headline: "No run data loaded",
            evidence: "Select or import a run to populate the cockpit.",
            confidence: null,
            severity: "warning",
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
        id: "warn:low-sample",
        category: "warning",
        headline,
        evidence: `This run has ${reasons.join(" · ")}.`,
        confidence: null,
        severity: "warning",
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
        id: `hurting:neg:${sig.id}`,
        category: "hurting",
        headline: `${signalLabel(sig)} is leaking ${signedR(sig.effect)}/trade`,
        evidence: signalEvidence(sig),
        confidence: level,
        severity: severityFromConfidence(level),
        source: { label: "Classification · Research Signals", route: runRoute(meta), params: { tab: "classification" } },
        caveat: CAVEAT_SINGLE_RUN,
        suggestedQuestion: "Does this leak persist in the next run or a narrower context?",
        _score: Math.abs(num(sig.effect) ?? 0) * (level === "High" ? 3 : level === "Medium" ? 2 : 1),
    };
}

// 3 — Highest loss-R sinkhole (contextSinkholes.sinkholes[0]).
function sinkholeCard(contextSinkholes) {
    if (!contextSinkholes?.available) return null;
    const sink = contextSinkholes.sinkholes?.[0];
    if (!sink) return null;
    return {
        id: `hurting:sinkhole:${sink.session}:${sink.direction}`,
        category: "hurting",
        headline: `${sink.session} ${sink.direction} is a sinkhole (${signedR1(sink.netR)})`,
        evidence: `${sink.count} trades · WR ${round1(sink.winRate)}% · net ${signedR1(sink.netR)}`,
        confidence: null,
        severity: "high",
        source: { label: "Failures Lab", route: "/failures-lab", params: { cohort: `${sink.session}|${sink.direction}` } },
        caveat: CAVEAT_SINKHOLE,
        suggestedQuestion: `Would filtering ${sink.session} ${sink.direction} lift net R without cutting winners?`,
        _score: Math.abs(num(sink.netR) ?? 0),
    };
}

// 4 — BE verdict (buildBeVerdict). Omitted when BE replay variants aren't imported.
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
        id: "be:verdict",
        category,
        headline: headlineByVerdict[verdict] || "Break-even verdict",
        evidence: `Best Δ ${signedR1(best.deltaNetR)} vs baseline ${signedR1(beVerdict.baselineNetR)}${best.n != null ? ` · n ${best.n}` : ""}`,
        confidence: null,
        severity: verdict === "NEUTRAL" ? "low" : "medium",
        source: { label: "Protection Lab · Break-even", route: "/protection-lab", params: { tab: "breakeven" } },
        caveat: `This-run-only — provisional.${note}`,
        suggestedQuestion: "Does the BE verdict hold once tested selectively, not globally?",
        _score: Math.abs(num(best.deltaNetR) ?? 0) + 0.5, // keep above near-zero sinkholes when tied
    };
}

// 5 — Top positive edge (researchSignals.positives[0]).
function positiveEdgeCard(researchSignals, meta) {
    const sig = researchSignals?.positives?.[0];
    if (!sig) return null;
    const level = confidenceLevel(sig);
    return {
        id: `working:pos:${sig.id}`,
        category: "working",
        headline: `${signalLabel(sig)} is carrying edge (${signedR(sig.effect)}/trade)`,
        evidence: signalEvidence(sig),
        confidence: level,
        severity: severityFromConfidence(level),
        source: { label: "Classification · Research Signals", route: runRoute(meta), params: { tab: "classification" } },
        caveat: CAVEAT_SINGLE_RUN,
        suggestedQuestion: "Is this edge stable across runs, or a single-sample artifact?",
        _score: Math.abs(num(sig.effect) ?? 0) * (level === "High" ? 3 : level === "Medium" ? 2 : 1),
    };
}

// 6 — Highest-lift loss cohort to investigate (failureDrivers, ranked by lift).
function opportunityDriverCard(failureDrivers) {
    const drivers = Array.isArray(failureDrivers?.drivers) ? failureDrivers.drivers : [];
    if (!drivers.length) return null;
    // Re-rank the (loss-R-sorted) drivers by LIFT and gate on the highlight floor —
    // "disproportionately damaging", not merely "frequent".
    const byLift = [...drivers]
        .filter((d) => (num(d.lift) ?? 0) >= COCKPIT_LIFT_HIGHLIGHT)
        .sort((a, b) => (num(b.lift) ?? 0) - (num(a.lift) ?? 0));
    const top = byLift[0];
    if (!top) return null;
    const liftTxt = `${round1(top.lift)}×`;
    return {
        id: `opportunity:driver:${top.dimKey}:${top.value}`,
        category: "opportunity",
        headline: `${top.dimLabel} = ${top.value} is over-represented in losses (${liftTxt})`,
        evidence: `${top.count} losers · ${round1(top.contributionPct)}% of loss-R · lift ${liftTxt}`,
        confidence: null,
        severity: "opportunity",
        source: { label: "Failures Lab · Explorer", route: "/failures-lab", params: { dimA: top.dimKey } },
        caveat: CAVEAT_OPPORTUNITY,
        suggestedQuestion: `Would removing ${top.dimLabel}=${top.value} improve net R without harming winners?`,
        _score: num(top.lift) ?? 0,
    };
}

// 7 (optional) — Confirmed false-loser pocket (lossTriage false_loser cell).
function falseLoserCard(lossTriage) {
    if (!lossTriage?.available) return null;
    const cell = (lossTriage.cells || []).find((c) => c.key === "false_loser");
    if (!cell || cell.count <= 0) return null;
    return {
        id: "opportunity:false-loser",
        category: "opportunity",
        headline: `${cell.count} "false losers" reached profit before stopping out`,
        evidence: `${round1(cell.pctOfLosses)}% of losses recovered post-stop (peak, not realized).${cell.lowSample ? " Low sample." : ""}`,
        confidence: null,
        severity: "opportunity",
        source: { label: "Failures Lab · Loss Triage", route: "/failures-lab", params: { cohort: "false_loser" } },
        caveat: "Post-stop peak is an upper bound, not realized profit — provisional.",
        suggestedQuestion: "Is there a protection rule that captures these without harming clean losers?",
        _score: num(cell.count) ?? 0,
    };
}

// 8 (optional) — Distance-at-arm thread to investigate.
function distanceCard(distanceBreakdown, meta) {
    if (!distanceBreakdown?.available) return null;
    return {
        id: "opportunity:distance-at-arm",
        category: "opportunity",
        headline: "Vacancy distance-at-arm is unresolved",
        evidence: "Distance-at-arm breakdown is available but not yet linked to a verdict.",
        confidence: null,
        severity: "opportunity",
        source: { label: "Classification · Distance-at-arm", route: runRoute(meta), params: { tab: "classification" } },
        caveat: CAVEAT_OPPORTUNITY,
        suggestedQuestion: "Does occupation-at-arm vs vacated price change expectancy?",
        _score: 0.1,
    };
}

function runRoute(meta) {
    const id = meta?.runId;
    return id ? `/runs/${id}` : "/runs/active";
}

// ── orchestrator ─────────────────────────────────────────────────────────────
/**
 * buildRunInsights(inputs) → InsightCard[]
 * Pure selection/ranking/templating over already-computed analytics outputs.
 */
export function buildRunInsights(inputs = {}) {
    const {
        meta = {},
        researchSignals = null,
        contextSinkholes = null,
        beVerdict = null,
        failureDrivers = null,
        lossTriage = null,
        distanceBreakdown = null,
    } = inputs || {};

    const warning = warningCard(meta);
    // "No run loaded" is terminal — nothing else is computable.
    if (warning && warning.id === "warn:no-data") return [warning];

    const candidates = [
        warning,
        negativeLeakCard(researchSignals, meta),
        sinkholeCard(contextSinkholes),
        beVerdictCard(beVerdict),
        positiveEdgeCard(researchSignals, meta),
        opportunityDriverCard(failureDrivers),
        falseLoserCard(lossTriage),
        distanceCard(distanceBreakdown, meta),
    ].filter(Boolean);

    // Dedup by id (defensive — sinkhole + sinkhole, etc.).
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        unique.push(c);
    }

    // Order: category rank first (warning → hurting → working → opportunity), then by
    // internal _score (confidence-weighted effect / loss magnitude / lift) descending.
    unique.sort((a, b) => {
        const cr = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
        if (cr !== 0) return cr;
        return (b._score ?? 0) - (a._score ?? 0);
    });

    // Cap, then strip the internal sort key so the public card shape is clean.
    return unique.slice(0, MAX_CARDS).map(({ _score, ...card }) => card);
}

export default buildRunInsights;
