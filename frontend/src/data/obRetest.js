/**
 * obRetest.js — OB Retest Analysis (Phase 1, frontend-derived)
 * ============================================================
 * Pure, framework-free derivation of Order Block *retest* events from
 * already-imported candle data + OB bounds + the OB↔trade join.
 *
 * SOURCE OF TRUTH: OB-RETEST-ANALYSIS-2-PHASE-1-PLAN.md (§2 model, §3 algorithm).
 *
 * This module is the ONLY place retest logic lives. It does NOT touch the
 * backend, importer, store, artifactStore, or any export schema. It reuses the
 * geometry idea from ghost_tracker.py (penetration %, close-beyond invalidation)
 * but extends it PAST the first exit to count later retests.
 *
 * A "retest" = a return into the OB zone AFTER the first touch has resolved and
 * price has left the zone (debounced), while the OB is not yet invalidated.
 *
 * Outcomes partition every retest exactly into {survived, failed, open}:
 *   • failed   — price breached the distal edge (per failureThreshold) within
 *                the reaction window.
 *   • open     — no breach, but the reaction window extends beyond the last
 *                available candle (right-censored). Excluded from rates.
 *   • survived — no breach and the window completed within available data.
 * The configured reaction-pip threshold is recorded as a hold-QUALITY flag
 * (`reactionMet`) + measured `reactionMaxPips`, not a 4th bucket (see plan §3.4
 * and the deviation note in the closeout message). This keeps the invariant
 * `survived + failed + open === totalRetests` exact.
 *
 * ENGINE v2 — CONTINUOUS INVALIDATION (OB-RETEST-SURVIVAL-DEFINITION-AUDIT-2):
 * From the first touch onward the breach predicate is evaluated on EVERY candle.
 * A breach outside any reaction window terminates the OB at the OB level
 * (`finalOutcome = "invalidated_between_windows"`) WITHOUT creating an event —
 * a between-window breach is not a retest — and no later re-entries are counted
 * ("zombie retests" are gone). ARMED ordering: re-entry is checked BEFORE breach,
 * so a candle that re-enters and closes beyond remains a genuine instant-failed
 * retest event (candlesToFailure 0). Per-OB terminal taxonomy (`finalOutcome`):
 *   invalidated_on_first_touch | invalidated_in_window |
 *   invalidated_between_windows | alive_at_data_end (censored) | capped |
 *   never_touched (geometry-degenerate OBs keep finalOutcome = null: unevaluated).
 *
 * METRIC NAMING (OB-RETEST-SURVIVAL-DEFINITION-AUDIT-1, Phase 1):
 * "survived" is a WINDOW HOLD — no close-breach inside ~N candles — NOT eventual
 * OB survival. The summary therefore exposes honest derived metrics:
 *   windowHoldRate       = survived / closed            (alias of survivalRate)
 *   reactionSuccessRate  = (survived ∧ reactionMet) / closed   ← headline
 *   weakHoldRate         = (survived ∧ ¬reactionMet) / closed
 *   failureRate          = failed / closed
 *   medianCandlesToFailure (failed events; median, not mean)
 * plus the v2 OB-level block (`summary.obLevel`, null when perOB rows carry no
 * finalOutcome — e.g. v1 backend artifacts): eventual failure, delayed failure,
 * median time to invalidation. Event ROW SCHEMA is unchanged; the event
 * POPULATION shrinks where v1 would have produced zombie retests.
 */

export const DEFAULT_RETEST_CONFIG = {
    reactionWindowCandles: 10,     // candles after entry used to judge survive/fail
    reactionMinPips: 8,            // favorable move (pips) that qualifies as a real reaction
    failureThreshold: "close_beyond_ob", // "close_beyond_ob" | "wick_beyond_ob"
    failureBufferPips: 0,          // extra pips beyond distal edge before breach counts
    retestEntryThresholdPct: 0,    // penetration % that counts as "re-entered" (0 = wick touch)
    retestExitThresholdPct: 0,     // must drop to/below this to re-arm (debounce)
    touchEpsilonPips: 0,           // tolerance for first-touch detection
    countFirstTouchAsRetest: false,
    pipSize: 0.0001,
    maxRetestsPerOB: 50,           // safety cap against pathological grinds
    // v2.1 — confirmation timeframe (minutes) for kill confirmation. Tied to the
    // run's detection timeframe in production; never hardcoded internally.
    confirmTimeframeMinutes: 15,
};

// UTC-hour session bands — mirror ghost_tracker.py _SESSION_BOUNDARIES so retest
// sessions match the rest of the app.
const SESSION_BANDS = [
    [0, 3, "Asia"],
    [3, 8, "London"],
    [8, 10, "London Lull"],
    [10, 17, "New York"],
    [17, 24, "Outside"],
];

// Exported (Phase C) so the research layer derives origin/detection/first-touch
// sessions with the EXACT same canonical bands — never a second definition.
export function sessionOf(epochSec) {
    if (epochSec == null || !isFinite(epochSec)) return "Unknown";
    const h = new Date(epochSec * 1000).getUTCHours();
    for (const [s, e, label] of SESSION_BANDS) if (h >= s && h < e) return label;
    return "Outside";
}

// Coerce a timestamp (string / number / Date) to epoch SECONDS, matching the
// candle `time` field produced by importer.parseCandlesCSV.
function normTime(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date) {
        const ms = value.getTime();
        return isFinite(ms) ? Math.floor(ms / 1000) : null;
    }
    if (typeof value === "number" && isFinite(value)) {
        return value > 1e11 ? Math.floor(value / 1000) : Math.floor(value);
    }
    let s = String(value).trim();
    if (!s) return null;
    s = s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = `${s}T00:00:00Z`;
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = `${s}Z`;
    const ms = Date.parse(s);
    return isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function num(value) {
    return value != null && value !== "" && isFinite(Number(value)) ? Number(value) : null;
}

function firstDefined(...values) {
    for (const v of values) if (v != null && v !== "") return v;
    return null;
}

// Smallest candle index whose time >= target (binary search over sorted times).
function indexAtOrAfter(times, target) {
    if (target == null) return 0;
    let lo = 0, hi = times.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// Build typed-array candle columns once for the whole run (perf: §5).
function buildCandleColumns(candles) {
    const clean = (candles || []).filter(
        (c) => c && isFinite(c.time) && isFinite(c.o) && isFinite(c.h) && isFinite(c.l) && isFinite(c.c),
    );
    // candles arrive sorted by import; guard anyway.
    clean.sort((a, b) => a.time - b.time);
    const n = clean.length;
    const time = new Float64Array(n);
    const o = new Float64Array(n);
    const h = new Float64Array(n);
    const l = new Float64Array(n);
    const c = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        time[i] = clean[i].time;
        o[i] = clean[i].o;
        h[i] = clean[i].h;
        l[i] = clean[i].l;
        c[i] = clean[i].c;
    }
    return { n, time, o, h, l, c };
}

function normalizeDirection(ob, trade) {
    const raw = String(firstDefined(ob?.side, ob?.direction, trade?.direction) || "").toLowerCase();
    if (raw.includes("bear") || raw === "short" || raw === "sell") return "bear";
    if (raw.includes("bull") || raw === "long" || raw === "buy") return "bull";
    // importer normalizes OB side to "bull"/"bear"; default to bull on anything unexpected.
    return "bull";
}

function normalizeStructure(ob, trade) {
    const raw = String(
        firstDefined(ob?.structure, ob?.structureTag, ob?.structure_tag, trade?.structure, trade?.structureTag, trade?.structure_tag) || "",
    ).toUpperCase();
    if (raw.includes("CHOCH") || raw.includes("CHOC")) return "CHoCH";
    if (raw.includes("BOS")) return "BOS";
    return raw || "—";
}

/**
 * deriveRetests — main entry point.
 *
 * @param {Object}   args
 * @param {Array}    args.orderBlocks   parsed OBs (importer.parseOrderBlocksCSV shape)
 * @param {Map}      args.tradesByObId  Map<obKey, trade>  (obLifecycle.buildTradesByObId)
 * @param {Array}    args.candles       parsed candles ({i,t,time,o,h,l,c})
 * @param {Object}   [args.config]      partial config (merged over DEFAULT_RETEST_CONFIG)
 * @param {Function} [args.deriveStatus](trade, ob) => {status} for first-touch annotation
 * @returns {{events:Array, perOB:Array, summary:Object, meta:Object}}
 */
export function deriveRetests({ orderBlocks = [], tradesByObId = null, candles = [], config = {}, deriveStatus = null } = {}) {
    const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const cfg = { ...DEFAULT_RETEST_CONFIG, ...config };
    const pip = num(cfg.pipSize) || 0.0001;
    const epsPrice = (num(cfg.touchEpsilonPips) || 0) * pip;
    const bufPrice = (num(cfg.failureBufferPips) || 0) * pip;
    const reactionMinPrice = (num(cfg.reactionMinPips) || 0) * pip;
    const N = Math.max(1, Math.floor(cfg.reactionWindowCandles || 10));
    const confirmTfSec = (num(cfg.confirmTimeframeMinutes) || 15) * 60; // v2.1 confirm-TF bucket size

    const col = buildCandleColumns(candles);
    const events = [];
    const perOB = [];

    const obLookup = (id) => {
        if (!tradesByObId) return null;
        if (id == null) return null;
        const text = String(id).trim().toLowerCase();
        const m = text.match(/\d+/);
        return tradesByObId.get(m ? String(Number(m[0])) : text) || tradesByObId.get(text) || null;
    };

    for (const ob of orderBlocks) {
        const trade = obLookup(ob?.id ?? ob?.obId);
        const direction = normalizeDirection(ob, trade);
        const isBull = direction === "bull";
        const structure = normalizeStructure(ob, trade);

        const topRaw = num(ob?.top);
        const botRaw = num(ob?.bot ?? ob?.bottom);
        const perRow = {
            obId: ob?.id ?? ob?.obId ?? null,
            direction,
            structure,
            touchCount: 0,
            retestCount: 0,
            retestsSurvived: 0,
            retestsFailed: 0,
            retestsOpen: 0,
            invalidatedOnRetestIndex: null,
            // v2 OB-level terminal fields (continuous invalidation). finalOutcome
            // stays null only for geometry-degenerate OBs that cannot be evaluated.
            finalOutcome: null,
            invalidatedAtTime: null,
            invalidatedAtCandleIndex: null,
            invalidationMode: null,
            invalidatedAfterRetestIndex: null,
            timeToInvalidationMinutes: null,
            // v2.1 — death-definition refinement + MFE family (OB-RETEST-V2.1).
            // null until computed at OB finalize; null stays for anchors/states
            // that never occurred (no invalidation, no first touch, missing Rk).
            killMarginPips: null,
            killConfirmedTf: null,
            reheldAfterKill: null,
            mfeBeforeDeathPips: null,
            mfeAfterR1Pips: null,
            mfeAfterR2Pips: null,
            mfeAfterR3Pips: null,
        };

        // Geometry guards — skip degenerate OBs but still record them.
        if (topRaw == null || botRaw == null) { perOB.push(perRow); continue; }
        const top = Math.max(topRaw, botRaw);
        const bot = Math.min(topRaw, botRaw);
        const height = top - bot;
        if (!(height > 0) || col.n === 0) { perOB.push(perRow); continue; }

        const proximal = isBull ? top : bot;   // edge price reaches first on a return
        const detectionTime = normTime(firstDefined(ob?.endTime, ob?.detectionTime, ob?.detection_time, ob?.originTime, ob?.startTime));
        const firstFillTime = trade ? normTime(firstDefined(trade?.fill_time, trade?.fillTime, trade?.entry)) : null;
        const firstTouchWasTraded = !!trade;
        let firstTouchOutcome = "untraded";
        if (trade && typeof deriveStatus === "function") {
            try { firstTouchOutcome = deriveStatus(trade, ob)?.status || "unknown"; } catch { firstTouchOutcome = "unknown"; }
        } else if (trade) {
            firstTouchOutcome = String(firstDefined(trade?.outcome, trade?.result) || "unknown").toLowerCase();
        }

        // ── helpers bound to this OB ──────────────────────────────────────────
        const intersects = (i) => col.h[i] >= bot - epsPrice && col.l[i] <= top + epsPrice;
        const penPct = (i) => {
            const depth = isBull ? top - col.l[i] : col.h[i] - bot;
            return Math.max(0, (depth / height) * 100);
        };
        const isBreach = (i) => {
            if (cfg.failureThreshold === "wick_beyond_ob") {
                return isBull ? col.l[i] < bot - bufPrice : col.h[i] > top + bufPrice;
            }
            return isBull ? col.c[i] < bot - bufPrice : col.c[i] > top + bufPrice; // close_beyond_ob (default)
        };
        const favorablePips = (i) => {
            const fav = isBull ? col.h[i] - proximal : proximal - col.l[i];
            return Math.max(0, fav) / pip;
        };
        const closesInside = (i) => col.c[i] >= bot && col.c[i] <= top;
        const closesBeyondProximal = (i) => (isBull ? col.c[i] > top : col.c[i] < bot);

        // ── walk candles for this OB ──────────────────────────────────────────
        const start = indexAtOrAfter(col.time, detectionTime);
        let firstTouchTime = null;
        let firstTouchIndex = -1;

        // v2 terminal recorder — one definition of "invalidated" per run (the same
        // configured breach predicate the windows use).
        const breachMode = cfg.failureThreshold === "wick_beyond_ob" ? "wick_breach" : "close_breach";
        const markInvalidated = (idx, kind, afterRetests) => {
            perRow.finalOutcome = kind;
            perRow.invalidatedAtTime = col.time[idx];
            perRow.invalidatedAtCandleIndex = idx;
            perRow.invalidationMode = breachMode;
            perRow.invalidatedAfterRetestIndex = afterRetests;
            perRow.timeToInvalidationMinutes =
                firstTouchTime != null ? Math.round((col.time[idx] - firstTouchTime) / 60) : null;
        };

        // v2.1 — retest entry candle indices (R1, R2, R3 anchors for MFE).
        const retestEntryIdx = [];

        // v2.1 finalize — compute kill margin, confirmation-TF, re-held, and the MFE
        // family once the OB has terminated. Called at every TOUCHED-OB exit point.
        const confirmBreach = (closeVal) => (isBull ? closeVal < bot - bufPrice : closeVal > top + bufPrice);
        const maxFavOver = (a, b) => {
            if (a == null || b == null || a > b) return null;
            let m = 0;
            for (let idx = a; idx <= b; idx++) m = Math.max(m, favorablePips(idx));
            return round2(m);
        };
        const finalizeV21 = () => {
            if (firstTouchIndex < 0) return; // never touched → all v2.1 fields stay null
            const killIdx = perRow.invalidatedAtCandleIndex;
            const endIdx = killIdx != null ? killIdx : col.n - 1; // alive/censored → data end
            // MFE family: max favorable excursion from the proximal edge, NOT counting
            // any candle after invalidation. null when the anchor never occurred.
            perRow.mfeBeforeDeathPips = maxFavOver(firstTouchIndex, endIdx);
            perRow.mfeAfterR1Pips = retestEntryIdx.length >= 1 ? maxFavOver(retestEntryIdx[0], endIdx) : null;
            perRow.mfeAfterR2Pips = retestEntryIdx.length >= 2 ? maxFavOver(retestEntryIdx[1], endIdx) : null;
            perRow.mfeAfterR3Pips = retestEntryIdx.length >= 3 ? maxFavOver(retestEntryIdx[2], endIdx) : null;
            if (killIdx == null) return; // alive/censored → kill-specific fields stay null
            // Kill margin: pips beyond the distal edge at invalidation (close for
            // close-beyond mode, low/high for wick-beyond mode).
            perRow.killMarginPips = round2(
                breachMode === "wick_breach"
                    ? (isBull ? (bot - col.l[killIdx]) / pip : (col.h[killIdx] - top) / pip)
                    : (isBull ? (bot - col.c[killIdx]) / pip : (col.c[killIdx] - top) / pip),
            );
            // Confirmation timeframe: bucket the kill candle into confirm-TF windows,
            // take the bucket's last available close (partial final bucket handled
            // deterministically), apply the close-beyond predicate.
            const killTime = col.time[killIdx];
            const bucketEnd = (Math.floor(killTime / confirmTfSec) + 1) * confirmTfSec;
            const lastInBucket = indexAtOrAfter(col.time, bucketEnd) - 1;
            perRow.killConfirmedTf = lastInBucket >= 0 ? confirmBreach(col.c[lastInBucket]) : null;
            // Re-held: does price close back inside the OB within 60 minutes of the kill?
            let reheld = false;
            const reheldDeadline = killTime + 60 * 60;
            for (let idx = killIdx + 1; idx < col.n && col.time[idx] <= reheldDeadline; idx++) {
                if (closesInside(idx)) { reheld = true; break; }
            }
            perRow.reheldAfterKill = reheld;
        };

        // Phase 1: seek first touch.
        let i = start;
        for (; i < col.n; i++) {
            if (intersects(i)) {
                firstTouchIndex = i;
                firstTouchTime = col.time[i];
                perRow.touchCount = 1;
                // Immediate breach on the very first touch → invalidated, no retest.
                if (isBreach(i)) {
                    perRow.invalidatedOnRetestIndex = 0; // legacy field, kept
                    markInvalidated(i, "invalidated_on_first_touch", 0);
                }
                break;
            }
        }
        if (firstTouchIndex < 0) { perRow.finalOutcome = "never_touched"; perOB.push(perRow); continue; }
        if (perRow.invalidatedOnRetestIndex === 0) { finalizeV21(); perOB.push(perRow); continue; }

        // State machine after first touch. We are currently INSIDE the zone.
        // INSIDE → (price leaves, debounce) → ARMED → (re-enter) → window eval.
        const STATE = { INSIDE: 0, ARMED: 1 };
        let state = STATE.INSIDE;
        let j = firstTouchIndex + 1;
        let obTerminated = false;

        const hasLeft = (idx) => {
            const pen = intersects(idx) ? penPct(idx) : 0;
            return pen <= cfg.retestExitThresholdPct;
        };

        while (j < col.n && !obTerminated && perRow.retestCount < cfg.maxRetestsPerOB) {
            if (state === STATE.INSIDE) {
                // v2: breach takes precedence over exit-debounce — a candle that
                // closes beyond the distal edge (even while still intersecting the
                // zone) is a between-window invalidation, not an exit.
                if (isBreach(j)) { markInvalidated(j, "invalidated_between_windows", perRow.retestCount); obTerminated = true; break; }
                if (hasLeft(j)) state = STATE.ARMED;
                j++;
                continue;
            }
            // ARMED — re-entry is evaluated BEFORE breach (v2 ordering guard): a
            // candle that re-enters and closes beyond stays a genuine retest event
            // that instantly fails (candlesToFailure 0) inside its window.
            const reentered = intersects(j) && penPct(j) >= cfg.retestEntryThresholdPct;
            if (!reentered) {
                // v2: gap/no-entry breach while armed → between-window invalidation.
                if (isBreach(j)) { markInvalidated(j, "invalidated_between_windows", perRow.retestCount); obTerminated = true; break; }
                j++;
                continue;
            }

            // ── Retest k begins at candle j ───────────────────────────────────
            const k = perRow.retestCount + 1;
            const retestIndex = j;
            const retestTime = col.time[j];
            let maxPen = penPct(j);
            let reactionMaxPips = favorablePips(j);
            let anyCloseInside = closesInside(j);
            let anyCloseBeyondProximal = closesBeyondProximal(j);
            let reachedDistal = penPct(j) >= 100;

            let breachAt = -1;
            const windowEnd = retestIndex + N; // entry candle + N forward
            let w = retestIndex;
            for (; w <= windowEnd; w++) {
                if (w >= col.n) break; // ran out of data
                if (w > retestIndex) {
                    maxPen = Math.max(maxPen, penPct(w));
                    reactionMaxPips = Math.max(reactionMaxPips, favorablePips(w));
                    if (closesInside(w)) anyCloseInside = true;
                    if (closesBeyondProximal(w)) anyCloseBeyondProximal = true;
                    if (penPct(w) >= 100) reachedDistal = true;
                }
                if (isBreach(w)) { breachAt = w; break; }
            }

            let outcome, failureMode = "none", candlesToFailure = null;
            if (breachAt >= 0) {
                outcome = "failed";
                failureMode = cfg.failureThreshold === "wick_beyond_ob" ? "wick_breach" : "close_breach";
                candlesToFailure = breachAt - retestIndex;
            } else if (windowEnd >= col.n) {
                outcome = "open"; // right-censored — window extends beyond available candles
            } else {
                outcome = "survived";
            }

            // Retest-type classification (deterministic).
            let retestType;
            if (anyCloseInside) retestType = "close_inside";
            else if (reachedDistal && outcome !== "failed") retestType = "full_penetration_no_invalidation";
            else if (anyCloseBeyondProximal && maxPen > 0 && maxPen <= 33) retestType = "wick_only";
            else if (maxPen <= 33) retestType = "clean";
            else retestType = "deep";

            const reactionMet = reactionMaxPips >= (cfg.reactionMinPips || 0);

            perRow.retestCount = k;
            perRow.touchCount += 1;
            if (outcome === "survived") perRow.retestsSurvived += 1;
            else if (outcome === "failed") {
                perRow.retestsFailed += 1;
                perRow.invalidatedOnRetestIndex = k; // legacy field, kept
                markInvalidated(breachAt, "invalidated_in_window", k);
            } else perRow.retestsOpen += 1;

            events.push({
                obId: perRow.obId,
                direction,
                structure,
                detectionTime,
                firstTouchTime,
                firstFillTime,
                firstTouchOutcome,
                firstTouchWasTraded,
                retestIndex: k,
                retestTime,
                retestCandleIndex: retestIndex,
                retestType,
                entryPenetrationPct: round2(penPct(retestIndex)),
                maxPenetrationPct: round2(Math.min(100, maxPen)),
                reactionMaxPips: round2(reactionMaxPips),
                reactionMet,
                outcome,
                failureMode,
                candlesToFailure,
                session: sessionOf(retestTime),
                minutesSinceFirstTouch: firstTouchTime != null ? Math.round((retestTime - firstTouchTime) / 60) : null,
            });
            retestEntryIdx.push(retestIndex); // v2.1 MFE anchor (R1/R2/R3 = [0]/[1]/[2])

            if (outcome === "failed") { obTerminated = true; break; }
            if (outcome === "open") { perRow.finalOutcome = "alive_at_data_end"; obTerminated = true; break; } // no more candles
            // survived → resume scanning after the window for the next retest.
            state = STATE.INSIDE;
            j = windowEnd + 1;
        }

        // v2 terminal default: nothing invalidated this OB. Distinguish hitting
        // the safety cap (tracking stopped) from genuinely reaching data end.
        if (perRow.finalOutcome == null) {
            perRow.finalOutcome = perRow.retestCount >= cfg.maxRetestsPerOB ? "capped" : "alive_at_data_end";
        }
        finalizeV21();
        perOB.push(perRow);
    }

    const summary = summarizeRetestEvents(events, perOB, orderBlocks.length);
    const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const meta = {
        candleCount: col.n,
        computeMs: Math.round((t1 - t0) * 10) / 10,
        config: cfg,
        dataBasis: "derived_frontend",
        engineVersion: 2,
        schemaVersion: "2.1",
        semantics: "continuous_invalidation",
    };

    return { events, perOB, summary, meta };
}

// Build the run-level summary from retest events + per-OB aggregates. Exported so
// the backend-preferred path (Phase 2.4) can reuse the EXACT same rate/breakdown
// logic on imported backend events — guaranteeing identical cards/metrics whether
// the data is frontend-derived or backend-verified. perOB carries touch/retest
// counts; when unavailable they are derived from the events themselves.
export function summarizeRetestEvents(events = [], perOB = [], obsTotal = 0) {
    const obsWithFirstTouch = perOB.filter((p) => p.touchCount > 0).length;
    const obsRetested = perOB.filter((p) => p.retestCount > 0).length;
    const totalRetests = events.length;
    let survived = 0, failed = 0, open = 0, reactionSum = 0, reactionN = 0, failCandleSum = 0, failN = 0;
    let reactionSuccessCount = 0, weakHoldCount = 0;
    const failCandles = [];
    for (const e of events) {
        if (e.outcome === "survived") {
            survived += 1;
            if (e.reactionMet) reactionSuccessCount += 1;
            else weakHoldCount += 1;
        } else if (e.outcome === "failed") failed += 1;
        else open += 1;
        if (e.outcome !== "open" && isFinite(e.reactionMaxPips)) { reactionSum += e.reactionMaxPips; reactionN += 1; }
        if (e.outcome === "failed" && isFinite(e.candlesToFailure)) {
            failCandleSum += e.candlesToFailure; failN += 1; failCandles.push(e.candlesToFailure);
        }
    }
    const closed = survived + failed;

    // ── v2 OB-level terminal block ───────────────────────────────────────────────
    // Only computable when perOB rows carry finalOutcome (frontend-derived v2, or a
    // v2 backend summary sidecar). v1 artifacts / synthesized perOB → null; callers
    // MUST hide eventual-failure metrics rather than show fake zeros.
    let obLevel = null;
    const terminalRows = perOB.filter((p) => p && p.finalOutcome != null);
    if (terminalRows.length) {
        const countOf = (s) => terminalRows.filter((p) => p.finalOutcome === s).length;
        const obsInvalidatedOnFirstTouch = countOf("invalidated_on_first_touch");
        const obsInvalidatedInWindow = countOf("invalidated_in_window");
        const obsInvalidatedBetweenWindows = countOf("invalidated_between_windows");
        const obsInvalidated = obsInvalidatedOnFirstTouch + obsInvalidatedInWindow + obsInvalidatedBetweenWindows;
        const obsAliveAtDataEnd = countOf("alive_at_data_end");
        const obsCapped = countOf("capped");
        // Denominator: touched OBs with a terminal state (never_touched excluded).
        // Censored OBs (alive_at_data_end, capped) count as not-failed — a
        // conservative lower bound; their counts are reported alongside.
        const obsTouchedTerminal = obsInvalidated + obsAliveAtDataEnd + obsCapped;
        obLevel = {
            obsInvalidated,
            obsInvalidatedOnFirstTouch,
            obsInvalidatedInWindow,
            obsInvalidatedBetweenWindows,
            obsAliveAtDataEnd,
            obsCapped,
            eventualFailureRate: obsTouchedTerminal ? obsInvalidated / obsTouchedTerminal : 0,
            delayedFailureCount: obsInvalidatedBetweenWindows,
            delayedFailureShare: obsInvalidated ? obsInvalidatedBetweenWindows / obsInvalidated : 0,
            medianTimeToInvalidationMinutes: medianOf(
                terminalRows
                    .filter((p) => p.finalOutcome.startsWith("invalidated") && p.timeToInvalidationMinutes != null)
                    .map((p) => p.timeToInvalidationMinutes),
            ),
        };
        // v2.1 — death-definition aggregates. null (not 0) when the rows carry no
        // v2.1 fields (e.g. v2 backend artifacts) so consumers can hide them.
        const confirmKnown = terminalRows.filter((p) => p.killConfirmedTf === true || p.killConfirmedTf === false);
        const reheldKnown = terminalRows.filter((p) => p.reheldAfterKill === true || p.reheldAfterKill === false);
        obLevel.killConfirmedShare = confirmKnown.length
            ? confirmKnown.filter((p) => p.killConfirmedTf === true).length / confirmKnown.length
            : null;
        obLevel.reheldAfterKillShare = reheldKnown.length
            ? reheldKnown.filter((p) => p.reheldAfterKill === true).length / reheldKnown.length
            : null;
        obLevel.medianKillMarginPips = medianOf(terminalRows.map((p) => p.killMarginPips));
    }

    return {
        obsTotal,
        obsWithFirstTouch,
        obsRetested,
        retestRate: obsWithFirstTouch ? obsRetested / obsWithFirstTouch : 0,
        totalRetests,
        survived,
        failed,
        open,
        // Honest taxonomy (Phase 1). windowHoldRate is the renamed headline-of-old;
        // reactionSuccessRate is the new headline. Invariants:
        //   reactionSuccessCount + weakHoldCount === survived
        //   reactionSuccessRate + weakHoldRate + failureRate === 1 (closed > 0)
        reactionSuccessCount,
        weakHoldCount,
        windowHoldRate: closed ? survived / closed : 0,
        reactionSuccessRate: closed ? reactionSuccessCount / closed : 0,
        weakHoldRate: closed ? weakHoldCount / closed : 0,
        // Legacy name kept for internal compatibility — same value as windowHoldRate.
        // Do NOT label this "Survival Rate" in UI (see the audit).
        survivalRate: closed ? survived / closed : 0,
        failureRate: closed ? failed / closed : 0,
        avgReactionPips: reactionN ? reactionSum / reactionN : 0,
        avgCandlesToFailure: failN ? failCandleSum / failN : 0,
        medianCandlesToFailure: medianOf(failCandles),
        // v2 OB-level terminal stats; null when terminal data is unavailable.
        obLevel,
    };
}

// Median of a numeric array (null when empty). Exported for the research layer
// so per-bucket medians use the identical definition.
export function medianOf(values) {
    const v = (values || []).filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = v.length >> 1;
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function round2(v) {
    return v == null || !isFinite(v) ? v : Math.round(v * 100) / 100;
}
