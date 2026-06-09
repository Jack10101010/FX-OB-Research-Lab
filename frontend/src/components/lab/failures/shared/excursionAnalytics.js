// ── excursionAnalytics.js ────────────────────────────────────────────────────
// Pure "Distance Before Stop" / MFE analytics for Failures Lab (V2 Phase 1).
// No React. No UI imports. Pure functions, safe inside useMemo.
//
// Answers: "before these losing trades stopped out, how far did they move in my
// favour?" — a hypothesis-generation surface for break-even / partials / protection
// research.
//
// ── INTEGRITY GUARDRAIL ──────────────────────────────────────────────────────
// All break-even "opportunity" / "savable R" outputs are an OPTIMISTIC UPPER BOUND.
// We only have peak MFE (`mfeR`), NOT the post-peak path. So we can say a loser
// *reached* a level (and *could* have armed BE), but we CANNOT know whether price
// retraced to entry to trigger the BE exit, nor model winner cost. Every returned
// object carries `upperBound: true`; callers MUST label these figures accordingly
// ("upper bound", "potentially savable", "validate with exact BE backtest").

import {
    rOf, isFiniteNumber, sessionOf, directionOf, structureOf,
    obWidthOf, entryHour, entryWeekday, WEEKDAYS,
} from "./failuresUtils";
import { archetypeLabel } from "./failuresRegistry";

const numOrNull = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const round1 = (v) => Number(Number(v).toFixed(1));

// "Never moved" threshold in R — favourable excursion at/under this counts as zero.
export const EPS_R = 0.02;
// Minimum reached-loser count before a BE level is considered actionable.
export const SAMPLE_FLOOR = 10;

// ── Field accessors ─────────────────────────────────────────────────────────

// mfeR — max favourable excursion in R (stop-anchored: 1.0R = full risk distance).
// Aliases mirror the importer (mfeR / mfe_r) plus the legacy bare `mfe`.
export function getMfeR(trade) {
    return numOrNull(trade?.mfeR ?? trade?.mfe_r ?? trade?.mfe);
}

// Target RR multiple. Per-trade `rr_config` is preferred; falls back to the
// run/config RR. Returns null when no usable (>0) target exists.
export function getTargetRR(trade, config) {
    const perTrade = numOrNull(trade?.rr_config ?? trade?.rrConfig);
    if (perTrade != null && perTrade > 0) return perTrade;
    const cfg = config || {};
    const runRR = numOrNull(
        cfg.rr_multiple ?? cfg.rrMultiple ?? cfg.rr ?? cfg.risk_reward ?? cfg.riskReward,
    );
    return runRR != null && runRR > 0 ? runRR : null;
}

// % of target reached = mfeR / targetRR · 100, clamped to [0,100]. null if N/A.
export function mfePctOfTarget(mfeR, targetRR) {
    if (!isFiniteNumber(mfeR) || !isFiniteNumber(targetRR) || targetRR <= 0) return null;
    const pct = (mfeR / targetRR) * 100;
    return Math.max(0, Math.min(100, pct));
}

// ── Bucket definitions ────────────────────────────────────────────────────────

// Primary: % of target RR. ("never" is decided by the caller via mfeR ≤ EPS_R;
// the test here only sorts pct > 0.)
export const MFE_PCT_BUCKETS = [
    { key: "never",  label: "Never moved", flag: "instant", test: (p) => p <= 0 },
    { key: "lt10",   label: "<10%",         flag: "instant", test: (p) => p > 0 && p < 10 },
    { key: "10_25",  label: "10–25%",       flag: null,      test: (p) => p >= 10 && p < 25 },
    { key: "25_50",  label: "25–50%",       flag: null,      test: (p) => p >= 25 && p < 50 },
    { key: "50_75",  label: "50–75%",       flag: null,      test: (p) => p >= 50 && p < 75 },
    { key: "75_90",  label: "75–90%",       flag: "almost",  test: (p) => p >= 75 && p < 90 },
    { key: "90plus", label: "90%+",         flag: "almost",  test: (p) => p >= 90 },
];

// Raw-R buckets — the PRIMARY language as of V3 (survives RR/target changes,
// aligns directly with risk). "instant failure" = never / <0.25R; "almost worked"
// = 1–2R / 2R+ (moved a full risk distance or more in favour before failing).
export const MFE_RAW_BUCKETS = [
    { key: "never",   label: "Never moved", flag: "instant" },
    { key: "lt025",   label: "<0.25R",      flag: "instant" },
    { key: "025_05",  label: "0.25–0.5R",   flag: null },
    { key: "05_1",    label: "0.5–1R",      flag: null },
    { key: "1_2",     label: "1–2R",        flag: "almost" },
    { key: "2plus",   label: "2R+",         flag: "almost" },
];

// Assign a pct value to a bucket key (pct > 0; "never" handled by caller via mfeR).
export function bucketMfePct(pct) {
    for (const b of MFE_PCT_BUCKETS) {
        if (b.key === "never") continue;
        if (b.test(pct)) return b.key;
    }
    return "never";
}

export function bucketMfeRaw(mfeR) {
    if (!isFiniteNumber(mfeR) || mfeR <= EPS_R) return "never";
    if (mfeR < 0.25) return "lt025";
    if (mfeR < 0.5)  return "025_05";
    if (mfeR < 1)    return "05_1";
    if (mfeR < 2)    return "1_2";
    return "2plus";
}

// ── Internal: enrich losers with mfeR / targetRR / pct / lossR ─────────────────

function enrich(losers, config) {
    return (Array.isArray(losers) ? losers : []).map((t) => {
        const mfeR = getMfeR(t);
        const targetRR = getTargetRR(t, config);
        return {
            lossR: Math.abs(rOf(t)),
            mfeR,
            targetRR,
            pct: mfePctOfTarget(mfeR, targetRR),
        };
    });
}

// Decide the distribution metric from data availability.
//   "pct"  — ≥50% of MFE-carrying losers have a usable target RR
//   "raw"  — MFE present but target RR mostly absent
//   "none" — no MFE data at all
function decideMode(withMfe, pctEligible) {
    if (!withMfe.length) return "none";
    return pctEligible.length >= withMfe.length * 0.5 ? "pct" : "raw";
}

function deriveTargetSource(losers, config) {
    const list = Array.isArray(losers) ? losers : [];
    const anyPerTrade = list.some((t) => numOrNull(t?.rr_config ?? t?.rrConfig) > 0);
    const cfg = config || {};
    const runRR = numOrNull(cfg.rr_multiple ?? cfg.rrMultiple ?? cfg.rr ?? cfg.risk_reward ?? cfg.riskReward);
    if (anyPerTrade) return "per_trade";
    if (runRR != null && runRR > 0) return "run";
    return "none";
}

// ── buildMfeDistribution ───────────────────────────────────────────────────────

export function buildMfeDistribution(losers, { config } = {}) {
    const list = Array.isArray(losers) ? losers : [];
    const total = list.length;
    const enriched = enrich(list, config);
    const withMfe = enriched.filter((e) => e.mfeR != null);
    const pctEligible = withMfe.filter((e) => e.targetRR != null);
    const mode = decideMode(withMfe, pctEligible);

    const base = {
        mode,
        coverage: {
            total,
            withMfe: withMfe.length,
            pct: total ? round1((withMfe.length / total) * 100) : 0,
            pctEligible: pctEligible.length,
        },
        targetRRSource: deriveTargetSource(list, config),
        upperBound: true,
    };

    if (mode === "none") return { ...base, buckets: [], totalLossR: 0 };

    const defs = mode === "pct" ? MFE_PCT_BUCKETS : MFE_RAW_BUCKETS;
    const considered = mode === "pct" ? pctEligible : withMfe; // pct mode: only losers with a target
    const totalLossR = considered.reduce((s, e) => s + e.lossR, 0);

    const counts = Object.fromEntries(defs.map((b) => [b.key, { count: 0, lossR: 0 }]));
    for (const e of considered) {
        const key = e.mfeR <= EPS_R
            ? "never"
            : (mode === "pct" ? bucketMfePct(e.pct) : bucketMfeRaw(e.mfeR));
        counts[key].count += 1;
        counts[key].lossR += e.lossR;
    }

    const buckets = defs.map((b) => {
        const c = counts[b.key];
        return {
            key: b.key,
            label: b.label,
            flag: b.flag ?? null,
            count: c.count,
            lossPct: considered.length ? round1((c.count / considered.length) * 100) : 0,
            lossR: round1(c.lossR),
            contributionPct: totalLossR > 0 ? round1((c.lossR / totalLossR) * 100) : 0,
        };
    });

    return { ...base, consideredN: considered.length, buckets, totalLossR: round1(totalLossR) };
}

// ── buildBeOpportunity ─────────────────────────────────────────────────────────
// Per arm level, the losers that REACHED it (could have armed BE) and the loss-R
// they represent. UPPER BOUND ONLY — see the integrity guardrail at the top.

export function buildBeOpportunity(losers, levels, { config } = {}) {
    const enriched = enrich(losers, config);
    const withMfe = enriched.filter((e) => e.mfeR != null);
    const pctEligible = withMfe.filter((e) => e.targetRR != null);
    const mode = decideMode(withMfe, pctEligible);

    const base = { mode, sampleFloor: SAMPLE_FLOOR, upperBound: true };
    if (mode === "none") return { ...base, rows: [], consideredN: 0, totalLossR: 0 };

    const considered = mode === "pct" ? pctEligible : withMfe;
    const totalLossR = considered.reduce((s, e) => s + e.lossR, 0);
    const lvls = Array.isArray(levels) && levels.length
        ? levels
        : (mode === "pct" ? [25, 50, 75, 90] : [0.25, 0.5, 0.75, 1]);

    const rows = lvls.map((L) => {
        const reached = considered.filter((e) => (mode === "pct" ? (e.pct ?? -1) >= L : e.mfeR >= L));
        const lossR = round1(reached.reduce((s, e) => s + e.lossR, 0));
        return {
            level: L,
            label: mode === "pct" ? `${L}% of TP` : `+${L}R`,
            reached: reached.length,
            reachedPct: considered.length ? round1((reached.length / considered.length) * 100) : 0,
            savableLossRUpperBound: lossR,        // UPPER BOUND — winner cost / retrace not modelled
            contributionPct: totalLossR > 0 ? round1((lossR / totalLossR) * 100) : 0,
            lowSample: reached.length < SAMPLE_FLOOR,
        };
    });

    return { ...base, rows, consideredN: considered.length, totalLossR: round1(totalLossR) };
}

// ══════════════════════════════════════════════════════════════════════════════
// V3 — Raw-R primary distribution + drilldown / failure-driver / pair-driver engine
// All ranked by DAMAGE (loss-R contribution), never by loss rate. Upper-bound note
// applies to BE framing only; the driver tables describe realized losses.
// ══════════════════════════════════════════════════════════════════════════════

export const DRILL_SAMPLE_FLOOR = 8; // min trades in a cell before it ranks

const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);
const hourLabel = (h) => (h == null ? "Unknown" : `${String(h).padStart(2, "0")}:00 UTC`);
const weekdayLabel = (d) => (d == null || d < 0 ? "Unknown" : (Array.isArray(WEEKDAYS) ? (WEEKDAYS[d] ?? `D${d}`) : `D${d}`));
function obWidthBucket(t) {
    const w = obWidthOf(t);
    if (!isFiniteNumber(w)) return "Unknown";
    if (w <= 3) return "0–3 pips";
    if (w <= 6) return "3–6 pips";
    if (w <= 10) return "6–10 pips";
    if (w <= 15) return "10–15 pips";
    return ">15 pips";
}
function structureLabel(t) {
    const s = structureOf(t);
    return s === "choch" ? "CHoCH" : s === "bos" ? "BOS" : "Unknown";
}

// Drilldown / driver dimensions. `of` returns a display value; "" or "Unknown"
// means no signal for that trade. Dimensions whose values are entirely empty
// (e.g. FFT when not exported) are auto-hidden by the aggregators below.
export const DRILL_DIMENSIONS = [
    { key: "session",    label: "Session",     of: (t) => sessionOf(t.entry) || "Unknown" },
    { key: "direction",  label: "Direction",   of: (t) => cap(directionOf(t)) || "Unknown" },
    { key: "structure",  label: "Structure",   of: (t) => structureLabel(t) },
    { key: "hour",       label: "Hour (UTC)",  of: (t) => hourLabel(entryHour(t)) },
    { key: "weekday",    label: "Weekday",     of: (t) => weekdayLabel(entryWeekday(t)) },
    { key: "archetype",  label: "Archetype",   of: (t) => archetypeLabel(t.archetype) },
    { key: "obwidth",    label: "OB Width",    of: (t) => obWidthBucket(t) },
    { key: "ghost",      label: "Ghost",       of: (t) => t?.ghost_outcome || t?.ghostOutcome || "" },
    { key: "entryModel", label: "Entry Model", of: (t) => t?.entry_model_key || t?.entryModelKey || "" },
    { key: "fft",        label: "FFT",         of: (t) => t?.first_failed_tag || t?.firstFailedTag || "" },
];
const DIM_BY_KEY = Object.fromEntries(DRILL_DIMENSIONS.map((d) => [d.key, d]));

const lossRof = (t) => Math.abs(rOf(t));
const sumLossR = (list) => list.reduce((s, t) => s + lossRof(t), 0);

// ── Raw-R primary distribution (always raw; ignores targetRR) ──────────────────
export function buildRawRDistribution(losers) {
    const list = Array.isArray(losers) ? losers : [];
    const total = list.length;
    const withMfe = list.filter((t) => getMfeR(t) != null);
    const totalLossR = sumLossR(withMfe);
    const counts = Object.fromEntries(MFE_RAW_BUCKETS.map((b) => [b.key, { count: 0, lossR: 0 }]));
    for (const t of withMfe) {
        const k = bucketMfeRaw(getMfeR(t));
        counts[k].count += 1;
        counts[k].lossR += lossRof(t);
    }
    const buckets = MFE_RAW_BUCKETS.map((b) => {
        const c = counts[b.key];
        return {
            key: b.key, label: b.label, flag: b.flag ?? null,
            count: c.count,
            lossPct: withMfe.length ? round1((c.count / withMfe.length) * 100) : 0,
            lossR: round1(c.lossR),
            contributionPct: totalLossR > 0 ? round1((c.lossR / totalLossR) * 100) : 0,
        };
    });
    return {
        mode: "raw",
        buckets,
        coverage: { total, withMfe: withMfe.length, pct: total ? round1((withMfe.length / total) * 100) : 0 },
        totalLossR: round1(totalLossR),
        upperBound: true,
    };
}

// Trades whose mfeR falls in `bucketKey`.
export function losersInRawBucket(losers, bucketKey) {
    return (Array.isArray(losers) ? losers : [])
        .filter((t) => getMfeR(t) != null && bucketMfeRaw(getMfeR(t)) === bucketKey);
}

// Aggregate a trade list by one dimension → ranked rows (by loss-R). Returns null
// if the dimension carries no real signal (all empty / Unknown).
function aggregateByDim(trades, dim, topN) {
    const map = {};
    let knownAny = false;
    for (const t of trades) {
        const raw = dim.of(t);
        const v = (raw == null || raw === "") ? "Unknown" : String(raw);
        if (v !== "Unknown") knownAny = true;
        if (!map[v]) map[v] = { value: v, count: 0, lossR: 0 };
        map[v].count += 1;
        map[v].lossR += lossRof(t);
    }
    if (!knownAny) return null;
    const totalLossR = sumLossR(trades);
    const rows = Object.values(map)
        .map((r) => ({
            value: r.value, count: r.count, lossR: round1(r.lossR),
            contributionPct: totalLossR > 0 ? round1((r.lossR / totalLossR) * 100) : 0,
        }))
        .sort((a, b) => b.lossR - a.lossR)
        .slice(0, topN);
    return { key: dim.key, label: dim.label, rows };
}

// ── Bucket drilldown — ranked contributors within a selected raw-R bucket ──────
export function buildBucketDrilldown(losers, bucketKey, { topN = 6, dims = DRILL_DIMENSIONS } = {}) {
    const withMfe = (Array.isArray(losers) ? losers : []).filter((t) => getMfeR(t) != null);
    const inBucket = withMfe.filter((t) => bucketMfeRaw(getMfeR(t)) === bucketKey);
    const allLossR = sumLossR(withMfe);
    const bucketLossR = sumLossR(inBucket);
    const sections = dims.map((d) => aggregateByDim(inBucket, d, topN)).filter(Boolean);
    return {
        bucketKey,
        trades: inBucket.length,
        lossR: round1(bucketLossR),
        contributionPct: allLossR > 0 ? round1((bucketLossR / allLossR) * 100) : 0,
        sections,
    };
}

// ── Failure drivers — top single-factor contributors across ALL losers ─────────
export function buildFailureDrivers(losers, { minSample = DRILL_SAMPLE_FLOOR, topN = 8, dims = DRILL_DIMENSIONS } = {}) {
    const list = Array.isArray(losers) ? losers : [];
    const totalLossR = sumLossR(list);
    const cells = [];
    for (const dim of dims) {
        const agg = aggregateByDim(list, dim, Infinity);
        if (!agg) continue;
        for (const r of agg.rows) {
            if (r.value === "Unknown" || r.count < minSample) continue;
            cells.push({
                dimKey: dim.key, dimLabel: dim.label, value: r.value,
                count: r.count, lossR: r.lossR,
                contributionPct: totalLossR > 0 ? round1((r.lossR / totalLossR) * 100) : 0,
            });
        }
    }
    cells.sort((a, b) => b.lossR - a.lossR);
    return { totalLossR: round1(totalLossR), minSample, drivers: cells.slice(0, topN) };
}

// ── Curated pair drivers (NO free-form combination mining) ─────────────────────
export const CURATED_PAIRS = [
    ["session", "direction"],
    ["structure", "direction"],
    ["fft", "session"],
    ["structure", "fft"],
    ["hour", "session"],
];

export function buildPairDrivers(losers, { minSample = DRILL_SAMPLE_FLOOR, topN = 8, pairs = CURATED_PAIRS } = {}) {
    const list = Array.isArray(losers) ? losers : [];
    const totalLossR = sumLossR(list);
    const out = [];
    for (const [aKey, bKey] of pairs) {
        const dimA = DIM_BY_KEY[aKey];
        const dimB = DIM_BY_KEY[bKey];
        if (!dimA || !dimB) continue;
        const map = {};
        for (const t of list) {
            const va = dimA.of(t);
            const vb = dimB.of(t);
            if (!va || va === "Unknown" || !vb || vb === "Unknown") continue; // both must be known
            const key = `${va} · ${vb}`;
            if (!map[key]) map[key] = { valueLabel: key, count: 0, lossR: 0 };
            map[key].count += 1;
            map[key].lossR += lossRof(t);
        }
        for (const cell of Object.values(map)) {
            if (cell.count < minSample) continue;
            out.push({
                pairLabel: `${dimA.label} × ${dimB.label}`,
                valueLabel: cell.valueLabel,
                count: cell.count,
                lossR: round1(cell.lossR),
                contributionPct: totalLossR > 0 ? round1((cell.lossR / totalLossR) * 100) : 0,
            });
        }
    }
    out.sort((a, b) => b.lossR - a.lossR);
    return { totalLossR: round1(totalLossR), minSample, pairs: out.slice(0, topN) };
}
