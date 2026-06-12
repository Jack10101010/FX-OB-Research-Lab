// lossTriage.js — Failures Lab V5 Loss Triage decision layer (pure, dependency-free).
//
// The interpretation audit found that two loss signals are ORTHOGONAL:
//   Axis A — post-stop recovery (did price recover AFTER the stop?)  → "stop too tight"
//   Axis B — pre-stop run-up    (was the trade in profit BEFORE the stop?) → "gave it back"
// They do not predict each other, so they must be shown as independent axes. The 2x2
// produces four loss types. The BE replay verdict on the analyzed run REFUTED global
// break-even, so this layer must prevent the naive "loser ran up → add BE" conclusion.
//
// CRITICAL framing (carry into every surface): post-stop recovery is a PEAK ("reached"),
// NOT a path — an upper bound on recoverability, not realized profit. This-run-only;
// nothing here is a validated rule.

// Thresholds — deliberately mirror FALSE_LOSER_CONFIRM_R / FALSE_LOSER_CANDIDATE_R in
// `components/lab/failures/shared/failuresAnalytics.js` (same single-source intent; kept
// in sync). Duplicated here only so this stays a pure, import-free data module.
export const TRIAGE_CONFIRM_R    = 1.0; // post_stop_mfe_r ≥ 1R (or reached TP) → recovered (confirmed)
export const TRIAGE_CANDIDATE_R  = 0.5; // post_stop_mfe_r ≥ 0.5R (<1R)         → recovered (candidate)
export const TRIAGE_RUNUP_R      = 1.0; // mfe_r ≥ 1R                            → ran (pre-stop run-up)
export const TRIAGE_LOW_SAMPLE_N = 15;  // a cohort below this is flagged low-sample

// ── tolerant field accessors (dual snake/camel, as the importer emits both) ──────
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const truthy = (v) => v === true || v === 1 || String(v).toLowerCase() === "true";

function postStopMfeROf(t) { return num(t?.postStopMfeR ?? t?.post_stop_mfe_r ?? t?.post_stop_continuation_r); }
function reachedTpOf(t) {
    const v = t?.postStopReachedOriginalTp ?? t?.post_stop_reached_original_tp;
    if (v == null || v === "") return null;
    return truthy(v);
}
function mfeROf(t)  { return num(t?.mfeR ?? t?.mfe_r); }
function netROf(t)  { const v = num(t?.netR ?? t?.net_r); return v == null ? 0 : v; }
function isLoss(t)  { return String(t?.outcome ?? "").toUpperCase() === "LOSS"; }
function isPerf(t)  { const o = String(t?.outcome ?? "").toUpperCase(); return o === "WIN" || o === "LOSS"; }
function sessionOf(t)   { return t?.session || t?.fill_session || "Unknown"; }
function directionOf(t) { return t?.direction || "Unknown"; }

const round1 = (n) => Math.round(n * 10) / 10;

// Axis A — 'recovered' | 'genuine' | 'nodata'.
// recovered = reached the original TP OR post-stop peak ≥ candidateR (confirmed + candidate).
function axisA(t, candidateR) {
    const mfe = postStopMfeROf(t);
    const tp  = reachedTpOf(t);
    if (mfe == null && tp == null) return "nodata";
    if (tp === true || (mfe != null && mfe >= candidateR)) return "recovered";
    return "genuine";
}
// Axis B — 'ran' | 'flat' | 'nodata'.
function axisB(t, runUpR) {
    const v = mfeROf(t);
    if (v == null) return "nodata";
    return v >= runUpR ? "ran" : "flat";
}

// The 2x2. Order: top-left → bottom-right reading.
const CELL_DEFS = [
    {
        key: "clean_loss", label: "Clean Loss", a: "genuine", b: "flat",
        meaning: "Genuine loss — never meaningfully in profit, no post-stop recovery.",
        action:  "Accept — the cost of doing business.",
    },
    {
        key: "false_loser", label: "False Loser", a: "recovered", b: "flat",
        meaning: "Stopped, then price peaked ≥1R / hit the original target (peak, not path).",
        action:  "Investigate a wider stop / re-entry — upper bound, not free profit.",
    },
    {
        key: "give_back", label: "Give-Back Loss", a: "genuine", b: "ran",
        meaning: "Ran ≥1R in profit, gave it back, and never recovered after the stop.",
        action:  "Investigate selective BE / partials on this cohort — NOT global BE.",
    },
    {
        key: "round_trip", label: "Round-Trip Loss", a: "recovered", b: "ran",
        meaning: "Ran ≥1R, stopped, then recovered post-stop — strongest stop-too-tight signal.",
        action:  "Investigate a wider stop / selective management — verify before acting.",
    },
];

const CAVEATS = [
    "This run only — not validated across runs or instruments.",
    "Post-stop recovery is a PEAK, not a path — an upper bound, not realized profit.",
    "Pre-stop run-up and post-stop recovery are independent signals.",
    "Do not treat this as a validated rule.",
];

/**
 * buildLossTriage(trades, options) → LossTriageReport
 * Classifies losing trades on two orthogonal axes into the four loss types.
 * Gated: returns { available:false } unless losers exist AND post-stop AND mfe data
 * are present, so the UI can degrade to a compact unavailable note.
 */
export function buildLossTriage(trades, options = {}) {
    const candidateR = options.candidateR ?? TRIAGE_CANDIDATE_R;
    const confirmR   = options.confirmR   ?? TRIAGE_CONFIRM_R;
    const runUpR     = options.runUpR     ?? TRIAGE_RUNUP_R;
    const lowN       = options.lowSampleN ?? TRIAGE_LOW_SAMPLE_N;

    const list   = Array.isArray(trades) ? trades : [];
    const losers = list.filter(isLoss);
    const hasPostStop = losers.some((t) => postStopMfeROf(t) != null || reachedTpOf(t) != null);
    const hasMfe      = losers.some((t) => mfeROf(t) != null);
    const available   = losers.length > 0 && hasPostStop && hasMfe;

    const thresholds = { confirmR, candidateR, runUpR, lowSampleN: lowN };

    if (!available) {
        return {
            available: false,
            reason: !losers.length ? "No losing trades in this run."
                : !hasPostStop ? "No post-stop continuation data (post_stop_mfe_r) on this run."
                : "No pre-stop excursion data (mfe_r) on this run.",
            totals: { losses: losers.length, classified: 0, unclassified: losers.length, recovered: 0, ran: 0 },
            cells: CELL_DEFS.map((c) => ({
                key: c.key, label: c.label, meaning: c.meaning, action: c.action,
                count: 0, pctOfLosses: 0, lowSample: true,
            })),
            thresholds,
            caveats: CAVEATS,
        };
    }

    const counts = { clean_loss: 0, false_loser: 0, give_back: 0, round_trip: 0 };
    let unclassified = 0, recovered = 0, ran = 0;

    for (const t of losers) {
        const a = axisA(t, candidateR);
        const b = axisB(t, runUpR);
        if (a === "nodata" || b === "nodata") { unclassified++; continue; }
        if (a === "recovered") recovered++;
        if (b === "ran") ran++;
        const cell = CELL_DEFS.find((c) => c.a === a && c.b === b);
        if (cell) counts[cell.key]++;
    }

    const classified = losers.length - unclassified;
    const cells = CELL_DEFS.map((c) => ({
        key: c.key, label: c.label, meaning: c.meaning, action: c.action,
        count: counts[c.key],
        pctOfLosses: losers.length ? round1((counts[c.key] / losers.length) * 100) : 0,
        lowSample: counts[c.key] < lowN,
    }));

    return {
        available: true,
        totals: { losses: losers.length, classified, unclassified, recovered, ran },
        cells,
        thresholds,
        caveats: CAVEATS,
    };
}

// "be_close_3p50R" → "BE close 3.5R"
function prettyBeKey(key) {
    const m = String(key).match(/^be_(wick|close)_(\d+)p(\d+)R$/i);
    if (!m) return String(key).replace(/^be_/, "BE ").replace(/_/g, " ");
    return `BE ${m[1]} ${parseInt(m[2], 10)}.${m[3].replace(/0+$/, "") || "0"}R`;
}

/**
 * buildBeVerdict(beTradesByMode, options) → BeVerdict
 * Reads the already-imported BE replay variant trade sets
 * (beTradesByMode[executionMode][entryVariantKey][scenarioKey] = trades[]) and sums
 * net_r per scenario vs the run baseline. Pure aggregation — no replay, no backend,
 * no Protection Lab dependency. Gated/unavailable when the structure is absent or the
 * baseline entry variant is ambiguous.
 *   verdict: best BE Δ > band → HELPS · < -band → HURTS · else NEUTRAL.
 */
export function buildBeVerdict(beTradesByMode, options = {}) {
    const band         = options.neutralBandR ?? 0.5;
    const baselineNetR = num(options.baselineNetR);
    const map = beTradesByMode && typeof beTradesByMode === "object" ? beTradesByMode : null;
    const unavailable = (reason) => ({ available: false, reason });

    if (!map || !Object.keys(map).length) return unavailable("No BE replay variants imported for this run.");
    if (baselineNetR == null) return unavailable("Baseline net R unavailable.");

    // Execution mode: prefer the requested one; else the sole key; else ambiguous.
    const execModes = Object.keys(map);
    let execMode = options.executionMode && map[options.executionMode] ? options.executionMode
        : execModes.length === 1 ? execModes[0] : null;
    if (!execMode) return unavailable("BE execution mode ambiguous (multiple modes imported).");

    const byEntry = map[execMode] || {};
    const entryKeys = Object.keys(byEntry);
    // Baseline entry variant: prefer requested → "baseline" → sole key; else ambiguous.
    let entryKey = options.entryVariantKey && byEntry[options.entryVariantKey] ? options.entryVariantKey
        : byEntry.baseline ? "baseline"
        : entryKeys.length === 1 ? entryKeys[0] : null;
    if (!entryKey) return unavailable("BE entry variant ambiguous (multiple entry variants; no baseline).");

    const byScenario = byEntry[entryKey] || {};
    const scenarioKeys = Object.keys(byScenario);
    if (!scenarioKeys.length) return unavailable("No BE scenarios for this entry variant.");

    const variants = scenarioKeys.map((key) => {
        const tr = Array.isArray(byScenario[key]) ? byScenario[key] : [];
        const variantNetR = round1(tr.reduce((s, t) => s + netROf(t), 0));
        return { key, label: prettyBeKey(key), netR: variantNetR, n: tr.length, deltaNetR: round1(variantNetR - baselineNetR) };
    }).sort((a, b) => b.deltaNetR - a.deltaNetR);

    const best = variants[0];
    const verdict = best.deltaNetR > band ? "HELPS" : best.deltaNetR < -band ? "HURTS" : "NEUTRAL";

    return {
        available: true,
        executionMode: execMode,
        entryVariantKey: entryKey,
        baselineNetR: round1(baselineNetR),
        variants,
        best,
        verdict,
        note: "Global BE verdict is global-only — selective BE remains untested.",
    };
}

/**
 * buildContextSinkholes(trades, options) → SinkholeReport
 * Session × direction pockets with negative net R and n ≥ low-sample, sorted worst
 * first. Framed as "avoid / filter this context," not "manage these exits."
 */
export function buildContextSinkholes(trades, options = {}) {
    const lowN = options.lowSampleN ?? TRIAGE_LOW_SAMPLE_N;
    const list = Array.isArray(trades) ? trades : [];
    const perf = list.filter(isPerf);
    if (!perf.length) return { available: false, reason: "No performance trades.", sinkholes: [], totalPockets: 0 };

    const map = {};
    for (const t of perf) {
        const session = sessionOf(t), direction = directionOf(t);
        const k = `${session}|${direction}`;
        if (!map[k]) map[k] = { session, direction, count: 0, wins: 0, netR: 0 };
        const p = map[k];
        p.count++;
        if (String(t.outcome).toUpperCase() === "WIN") p.wins++;
        p.netR += netROf(t);
    }
    const pockets = Object.values(map).filter((p) => p.count >= lowN);
    const sinkholes = pockets
        .filter((p) => p.netR < 0)
        .map((p) => ({ session: p.session, direction: p.direction, count: p.count, netR: round1(p.netR), winRate: round1((p.wins / p.count) * 100) }))
        .sort((a, b) => a.netR - b.netR);

    return { available: true, sinkholes, totalPockets: pockets.length };
}
