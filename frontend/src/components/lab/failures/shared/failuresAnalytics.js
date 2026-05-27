// ── failuresAnalytics.js ─────────────────────────────────────────────────────
// Pure analytics functions for all Phase 1 Failures Lab modules.
// No React. No side effects. Safe inside useMemo.
//
// Imports: sessionOf, dayIndex, WEEKDAYS, SESSIONS from entryFormatters.

import {
    sessionOf,
    dayIndex,
    WEEKDAYS,
    SESSIONS,
    round1,
    round2,
} from "@/components/lab/entries/analytics/entryFormatters";
import { sampleConfidence } from "@/components/lab/entries/analytics/entryRegistry";
import {
    rOf,
    filterLosers,
    filterWinners,
    directionOf,
    structureOf,
    obWidthOf,
    durationMinutes,
    entryHour,
    entryWeekday,
    entryMonth,
    entryQuarter,
} from "./failuresUtils";
import { ARCHETYPES } from "./failuresRegistry";

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(arr, fn) {
    const vals = arr.map(fn).filter(v => v != null && Number.isFinite(v));
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

function profitFactor(trades) {
    const grossWin  = trades.filter(t => rOf(t) > 0).reduce((s, t) => s + rOf(t), 0);
    const grossLoss = trades.filter(t => rOf(t) < 0).reduce((s, t) => s + Math.abs(rOf(t)), 0);
    return grossLoss > 0 ? round2(grossWin / grossLoss) : null;
}

function expectancy(trades) {
    if (!trades.length) return null;
    return round2(trades.reduce((s, t) => s + rOf(t), 0) / trades.length);
}

function lossRate(losses, all) {
    return all.length ? losses.length / all.length : null;
}

// ── Section 1 — KPI computations ─────────────────────────────────────────────

export function computeFailureKPIs(trades, classified) {
    if (!Array.isArray(trades) || !trades.length) {
        return {
            totalLosses: 0, lossRate: null, avgLossR: null, worstLossR: null,
            longestStreak: 0, topArchetype: null, topArchetypePct: null,
            severityWeightedLossRate: null,
        };
    }

    const losers = classified.length ? classified : filterLosers(trades);
    const total  = trades.length;
    const n      = losers.length;
    const avgLoss = n ? avg(losers, t => Math.abs(rOf(t))) : null;
    const worstLoss = n ? Math.max(...losers.map(t => Math.abs(rOf(t)))) : null;

    // Longest streak
    let maxStreak = 0, cur = 0;
    for (const t of trades) { rOf(t) < 0 ? cur++ : (cur = 0); if (cur > maxStreak) maxStreak = cur; }

    // Top archetype
    const archCounts = {};
    for (const t of losers) { const a = t.archetype || "standard_loss"; archCounts[a] = (archCounts[a] || 0) + 1; }
    const topArch = n ? Object.entries(archCounts).sort((a, b) => b[1] - a[1])[0] : null;

    // Severity-weighted loss rate (sum of severity / total if severity exists)
    const hasSeverity = losers.some(t => t.severity != null);
    let sevWeighted = null;
    if (hasSeverity) {
        const totalSev = losers.reduce((s, t) => s + (t.severity ?? 0), 0);
        sevWeighted = total ? totalSev / total : null;
    }

    return {
        totalLosses:              n,
        lossRate:                 total ? round1((n / total) * 100) : null,
        avgLossR:                 avgLoss != null ? -round1(avgLoss) : null,
        worstLossR:               worstLoss != null ? -round1(worstLoss) : null,
        longestStreak:            maxStreak,
        topArchetype:             topArch?.[0] ?? null,
        topArchetypePct:          topArch ? round1((topArch[1] / n) * 100) : null,
        severityWeightedLossRate: sevWeighted != null ? round1(sevWeighted) : null,
    };
}

// ── Section 2 — Archetype analytics ──────────────────────────────────────────

export function computeArchetypeDistribution(classified) {
    if (!classified.length) return [];
    const map = {};
    for (const t of classified) {
        const a = t.archetype || "standard_loss";
        if (!map[a]) map[a] = { archetype: a, count: 0, totalR: 0 };
        map[a].count++;
        map[a].totalR += rOf(t);
    }
    const total = classified.length;
    return Object.values(map)
        .map(row => ({
            ...row,
            pct:    round1((row.count / total) * 100),
            avgR:   round2(row.totalR / row.count),
        }))
        .sort((a, b) => b.count - a.count);
}

export function computeArchetypeDNAStats(classified, archetypeId) {
    const group = classified.filter(t => t.archetype === archetypeId);
    const n     = group.length;
    if (!n) return null;

    const all   = group;
    const longs  = all.filter(t => directionOf(t) === "long");
    const shorts = all.filter(t => directionOf(t) === "short");

    // Session concentration
    const sessionCounts = {};
    for (const t of all) {
        const s = t.session || sessionOf(t.entry) || "Unknown";
        sessionCounts[s] = (sessionCounts[s] || 0) + 1;
    }

    // Structure split
    const bosCnt  = all.filter(t => structureOf(t) === "bos").length;
    const chochCnt = all.filter(t => structureOf(t) === "choch").length;

    // Confidence distribution
    const confDist = { HIGH: 0, MEDIUM: 0, LOW: 0, BORDERLINE: 0, UNCLASSIFIED: 0 };
    for (const t of all) confDist[t.confidence || "UNCLASSIFIED"]++;

    const avgWidth = avg(all, obWidthOf);
    const avgDurMins = avg(all, durationMinutes);

    return {
        count:              n,
        pct:                null, // computed by caller with total
        avgR:               round2(all.reduce((s, t) => s + rOf(t), 0) / n),
        worstR:             round2(Math.min(...all.map(rOf))),
        avgSeverity:        avg(all, t => t.severity),
        longPct:            round1((longs.length / n) * 100),
        shortPct:           round1((shorts.length / n) * 100),
        sessionConcentration: sessionCounts,
        bosPct:             round1((bosCnt / n) * 100),
        chochPct:           round1((chochCnt / n) * 100),
        avgObWidth:         avgWidth,
        avgDurationMins:    avgDurMins,
        sampleConfidence:   sampleConfidence(n),
        confDist,
    };
}

// ── Section 3 — Temporal analytics ───────────────────────────────────────────

export function computeHourlyFailureMatrix(trades) {
    // Returns Map<"weekday_hour", { lossRate, lossCount, totalCount }>
    // weekday: 0=Mon…4=Fri, hour: 0–23
    const cells = {};
    for (let d = 0; d < 5; d++) {
        for (let h = 0; h < 24; h++) {
            cells[`${d}_${h}`] = { weekday: d, hour: h, lossCount: 0, totalCount: 0 };
        }
    }

    for (const t of trades) {
        const h = entryHour(t);
        const d = entryWeekday(t);
        if (h == null || d == null || d > 4) continue;
        const key = `${d}_${h}`;
        if (!cells[key]) continue;
        cells[key].totalCount++;
        if (rOf(t) < 0) cells[key].lossCount++;
    }

    for (const cell of Object.values(cells)) {
        cell.lossRate = cell.totalCount > 0 ? round1((cell.lossCount / cell.totalCount) * 100) : 0;
    }

    return cells;
}

export function computeMonthlyStats(trades) {
    const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const months = Array.from({ length: 12 }, (_, i) => ({
        month: i, label: MONTH_LABELS[i], lossCount: 0, winCount: 0, totalCount: 0,
    }));

    for (const t of trades) {
        const m = entryMonth(t);
        if (m == null) continue;
        months[m].totalCount++;
        rOf(t) < 0 ? months[m].lossCount++ : months[m].winCount++;
    }

    return months.map(row => ({
        ...row,
        lossRate: row.totalCount ? round1((row.lossCount / row.totalCount) * 100) : 0,
        winRate:  row.totalCount ? round1((row.winCount  / row.totalCount) * 100) : 0,
    }));
}

export function computeQuarterlyStats(trades) {
    const quarters = [1,2,3,4].map(q => ({ quarter: q, label: `Q${q}`, lossCount: 0, winCount: 0, totalCount: 0 }));
    for (const t of trades) {
        const q = entryQuarter(t);
        if (!q) continue;
        quarters[q-1].totalCount++;
        rOf(t) < 0 ? quarters[q-1].lossCount++ : quarters[q-1].winCount++;
    }
    return quarters.map(row => ({
        ...row,
        lossRate: row.totalCount ? round1((row.lossCount / row.totalCount) * 100) : 0,
    }));
}

export function computeWinFailureDeltaByHour(trades) {
    const hours = Array.from({ length: 24 }, (_, h) => ({
        hour: h, lossCount: 0, winCount: 0, total: 0,
    }));
    for (const t of trades) {
        const h = entryHour(t);
        if (h == null) continue;
        hours[h].total++;
        rOf(t) < 0 ? hours[h].lossCount++ : hours[h].winCount++;
    }
    return hours.map(row => ({
        hour:     row.hour,
        lossRate: row.total ? round1((row.lossCount / row.total) * 100) : 0,
        winRate:  row.total ? round1((row.winCount  / row.total) * 100) : 0,
        delta:    row.total ? round1(((row.winCount - row.lossCount) / row.total) * 100) : 0,
        total:    row.total,
    }));
}

// ── Section 4 — Directional analytics ────────────────────────────────────────

export function computeDirectionalStats(trades) {
    const longs  = trades.filter(t => directionOf(t) === "long");
    const shorts = trades.filter(t => directionOf(t) === "short");

    function stats(group) {
        const losses  = filterLosers(group);
        const winners = filterWinners(group);
        const n = group.length;
        if (!n) return null;

        // CVaR: avg of worst 10%
        const sortedLossR = losses.map(t => rOf(t)).sort((a, b) => a - b);
        const cvarN = Math.max(1, Math.ceil(sortedLossR.length * 0.1));
        const cvar  = sortedLossR.slice(0, cvarN);
        const cvarVal = cvar.length ? round2(cvar.reduce((s, v) => s + v, 0) / cvar.length) : null;

        const worst5 = sortedLossR.slice(0, 5);

        // Top archetype
        const archCounts = {};
        for (const t of losses) { const a = t.archetype || "standard_loss"; archCounts[a] = (archCounts[a] || 0) + 1; }
        const topArch = Object.entries(archCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        return {
            count:      n,
            lossCount:  losses.length,
            winCount:   winners.length,
            lossRate:   n ? round1((losses.length / n) * 100) : null,
            avgR:       round2(group.reduce((s, t) => s + rOf(t), 0) / n),
            expectancy: expectancy(group),
            profitFactor: profitFactor(group),
            avgLossR:   losses.length ? round2(losses.reduce((s, t) => s + rOf(t), 0) / losses.length) : null,
            topArchetype: topArch,
            cvar:       cvarVal,
            worst5,
            sampleConfidence: sampleConfidence(n),
        };
    }

    return { long: stats(longs), short: stats(shorts) };
}

// ── Section 5 — Session analytics ────────────────────────────────────────────

export function computeSessionFailureRates(trades) {
    const map = {};
    for (const s of [...SESSIONS, "Unknown"]) {
        map[s] = { session: s, lossCount: 0, winCount: 0, total: 0, totalSeverity: 0 };
    }

    for (const t of trades) {
        const sess = t?.session || sessionOf(t?.entry) || "Unknown";
        const key  = map[sess] ? sess : "Unknown";
        map[key].total++;
        const r = rOf(t);
        if (r < 0) {
            map[key].lossCount++;
            map[key].totalSeverity += t?.severity ?? 0;
        } else {
            map[key].winCount++;
        }
    }

    return Object.values(map).map(row => ({
        ...row,
        lossRate:    row.total ? round1((row.lossCount / row.total) * 100) : 0,
        avgSeverity: row.lossCount ? round1(row.totalSeverity / row.lossCount) : null,
    }));
}

export function computeOriginFillMatrix(trades) {
    // origin = trade.session field (where OB was created)
    // fill   = sessionOf(entry timestamp) (where trade was filled)
    const sessions = [...SESSIONS, "Unknown"];
    const matrix   = {};

    for (const origin of sessions) {
        for (const fill of sessions) {
            matrix[`${origin}||${fill}`] = { origin, fill, lossCount: 0, winCount: 0, total: 0 };
        }
    }

    for (const t of trades) {
        const origin = t?.session || "Unknown";
        const fill   = sessionOf(t?.entry) || "Unknown";
        const key    = `${origin}||${fill}`;
        if (!matrix[key]) continue;
        matrix[key].total++;
        rOf(t) < 0 ? matrix[key].lossCount++ : matrix[key].winCount++;
    }

    return Object.values(matrix).map(row => ({
        ...row,
        lossRate: row.total ? round1((row.lossCount / row.total) * 100) : 0,
    }));
}

// ── Section 6 — Streak analytics ─────────────────────────────────────────────

export function computeStreakStats(trades) {
    if (!trades.length) return { maxStreak: 0, distribution: [], streakZones: [] };

    let maxStreak = 0, cur = 0;
    const distribution = {};
    const streakZones  = [];
    let zoneStart = null;

    for (let i = 0; i < trades.length; i++) {
        const t = trades[i];
        if (rOf(t) < 0) {
            if (cur === 0) zoneStart = i;
            cur++;
            if (cur > maxStreak) maxStreak = cur;
        } else {
            if (cur > 0) {
                distribution[cur] = (distribution[cur] || 0) + 1;
                streakZones.push({ start: zoneStart, end: i - 1, length: cur });
            }
            cur = 0;
            zoneStart = null;
        }
    }
    if (cur > 0) {
        distribution[cur] = (distribution[cur] || 0) + 1;
        streakZones.push({ start: zoneStart, end: trades.length - 1, length: cur });
    }

    const dist = Array.from({ length: Math.max(5, maxStreak) }, (_, i) => ({
        streak: i + 1,
        count:  distribution[i + 1] || 0,
    }));

    return { maxStreak, distribution: dist, streakZones };
}

/**
 * buildRunsTest(trades) → RunsTestResult
 * Wald-Wolfowitz runs test for randomness of W/L sequence.
 * p-value approximated via standard normal CDF polynomial (Abramowitz & Stegun 26.2.17).
 */
export function buildRunsTest(trades) {
    if (trades.length < 10) {
        return { valid: false, reason: `Requires ≥ 10 trades (have ${trades.length})` };
    }

    const seq  = trades.map(t => rOf(t) < 0 ? "L" : "W");
    const n1   = seq.filter(s => s === "L").length;
    const n2   = seq.filter(s => s === "W").length;

    if (n1 === 0 || n2 === 0) {
        return { valid: false, reason: "All trades have the same outcome" };
    }

    // Count runs
    let runs = 1;
    for (let i = 1; i < seq.length; i++) {
        if (seq[i] !== seq[i - 1]) runs++;
    }

    const N    = n1 + n2;
    const mu   = (2 * n1 * n2) / N + 1;
    const s2   = (2 * n1 * n2 * (2 * n1 * n2 - N)) / (N * N * (N - 1));
    const sigma = Math.sqrt(Math.abs(s2));

    const z = sigma > 0 ? (runs - mu) / sigma : 0;

    // Standard normal CDF approximation (two-tailed p-value)
    const p = 2 * (1 - normalCDF(Math.abs(z)));

    let interpretation, verdict;
    if (p < 0.05 && z < 0) {
        interpretation = "clustered";
        verdict = `Losses cluster more than chance (p=${p.toFixed(3)}). Likely regime-driven failure.`;
    } else if (p < 0.05 && z > 0) {
        interpretation = "dispersed";
        verdict = `Losses are more spread out than chance (p=${p.toFixed(3)}). Strategy may be over-diversifying failures.`;
    } else {
        interpretation = "random";
        verdict = `Losses are consistent with random distribution (p=${p.toFixed(3)}). Variance is the likely cause, not a systematic regime.`;
    }

    return {
        valid: true,
        n: N, n1, n2, runs,
        expectedRuns: round2(mu),
        zStat:        round2(z),
        pValue:       round2(p),
        interpretation,
        verdict,
        sampleConfidence: sampleConfidence(N),
    };
}

// Abramowitz & Stegun 26.2.17 polynomial approximation for Φ(x)
function normalCDF(x) {
    const t  = 1 / (1 + 0.2316419 * Math.abs(x));
    const d  = 0.3989423 * Math.exp(-x * x / 2);
    const p  = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
    return x > 0 ? 1 - p : p;
}

export function computeSequenceDependency(trades) {
    if (trades.length < 4) return null;
    const seq = trades.map(t => rOf(t) < 0 ? "L" : "W");

    let lwl = 0, lww = 0, lll = 0, llw = 0;
    for (let i = 1; i < seq.length; i++) {
        if      (seq[i-1] === "W" && seq[i] === "L") lwl++;
        else if (seq[i-1] === "W" && seq[i] === "W") lww++;
        else if (seq[i-1] === "L" && seq[i] === "L") lll++;
        else if (seq[i-1] === "L" && seq[i] === "W") llw++;
    }

    const afterW = lwl + lww;
    const afterL = lll + llw;

    const pLossAfterWin  = afterW > 0 ? round2((lwl / afterW) * 100) : null;
    const pLossAfterLoss = afterL > 0 ? round2((lll / afterL) * 100) : null;

    const ratio = (pLossAfterLoss != null && pLossAfterWin != null && pLossAfterWin > 0)
        ? round2(pLossAfterLoss / pLossAfterWin)
        : null;

    let interpretation = null;
    if (ratio != null) {
        if (ratio > 1.5) interpretation = `A loss makes the next trade ${ratio.toFixed(1)}× more likely to also be a loss — losses cluster sequentially.`;
        else if (ratio < 0.7) interpretation = `A loss makes the next trade less likely to be a loss — losses do not cluster sequentially.`;
        else interpretation = "No significant sequential dependency detected.";
    }

    return { pLossAfterWin, pLossAfterLoss, ratio, interpretation, afterW, afterL };
}

// ── Section 7 — Prevention analytics ─────────────────────────────────────────

export const PREVENTION_RULES = [
    { key: "excl_asia",        label: "Exclude Asia entries",              group: "Session",    matchFn: t => (t.session || sessionOf(t?.entry)) === "Asia" },
    { key: "excl_london",      label: "Exclude London entries",            group: "Session",    matchFn: t => (t.session || sessionOf(t?.entry)) === "London" },
    { key: "excl_lull",        label: "Exclude London Lull entries",       group: "Session",    matchFn: t => (t.session || sessionOf(t?.entry)) === "London Lull" },
    { key: "excl_ny",          label: "Exclude New York entries",          group: "Session",    matchFn: t => (t.session || sessionOf(t?.entry)) === "New York" },
    { key: "excl_outside",     label: "Exclude Outside entries",           group: "Session",    matchFn: t => (t.session || sessionOf(t?.entry)) === "Outside" },
    { key: "excl_mon",         label: "Exclude Monday entries",            group: "Day",        matchFn: t => entryWeekday(t) === 0 },
    { key: "excl_tue",         label: "Exclude Tuesday entries",           group: "Day",        matchFn: t => entryWeekday(t) === 1 },
    { key: "excl_wed",         label: "Exclude Wednesday entries",         group: "Day",        matchFn: t => entryWeekday(t) === 2 },
    { key: "excl_thu",         label: "Exclude Thursday entries",          group: "Day",        matchFn: t => entryWeekday(t) === 3 },
    { key: "excl_fri",         label: "Exclude Friday entries",            group: "Day",        matchFn: t => entryWeekday(t) === 4 },
    { key: "excl_long",        label: "Exclude Long trades",               group: "Direction",  matchFn: t => directionOf(t) === "long" },
    { key: "excl_short",       label: "Exclude Short trades",              group: "Direction",  matchFn: t => directionOf(t) === "short" },
    { key: "excl_bos",         label: "Exclude BOS entries",               group: "Structure",  matchFn: t => structureOf(t) === "bos" },
    { key: "excl_choch",       label: "Exclude CHoCH entries",             group: "Structure",  matchFn: t => structureOf(t) === "choch" },
    { key: "excl_hard_inv",    label: "Exclude Hard Invalidation losses",  group: "Archetype",  matchFn: t => t.archetype === "hard_invalidation" },
    { key: "excl_close_conf",  label: "Exclude Close-Confirmed losses",    group: "Archetype",  matchFn: t => t.archetype === "close_confirmed" },
    { key: "excl_fast_stop",   label: "Exclude Fast Stopout losses",       group: "Archetype",  matchFn: t => t.archetype === "fast_stopout" },
    { key: "excl_slow_bleed",  label: "Exclude Slow Bleed losses",         group: "Archetype",  matchFn: t => t.archetype === "slow_bleed" },
    { key: "excl_ob_narrow",   label: "Exclude narrow OB losses (< 5 pips)", group: "OB Quality", matchFn: t => { const w = obWidthOf(t); return w != null && w < 5; } },
    { key: "excl_ob_wide",     label: "Exclude wide OB losses (> 10 pips)",  group: "OB Quality", matchFn: t => { const w = obWidthOf(t); return w != null && w > 10; } },
    { key: "excl_hr_12",       label: "Exclude 12:00–13:00 UTC entries",   group: "Hour",       matchFn: t => entryHour(t) === 12 },
    { key: "excl_hr_20",       label: "Exclude 20:00–22:00 UTC entries",   group: "Hour",       matchFn: t => { const h = entryHour(t); return h === 20 || h === 21; } },
];

/**
 * preventionConfidence(n) → "SPECULATIVE" | "WEAK" | "MODERATE" | "STRONG"
 * Explicit confidence tier for prevention rules — distinct from sample confidence.
 * Reflects how seriously a candidate rule should be taken.
 */
export function preventionConfidence(n) {
    if (n >= 30) return "STRONG";
    if (n >= 15) return "MODERATE";
    if (n >= 5)  return "WEAK";
    return "SPECULATIVE";
}

export function computePreventionRules(trades, classified) {
    if (!trades.length) return [];

    const losers  = classified.length ? classified.filter(t => rOf(t) < 0) : filterLosers(trades);
    const winners = filterWinners(trades);

    const rows = PREVENTION_RULES.map(rule => {
        // Use actual R values of MATCHED trades — not global averages.
        // Global average substitution was a Phase 1 bug that inflated/deflated net R
        // depending on whether the matched session/day had atypical loss sizes.
        const matchedLosers  = losers.filter(rule.matchFn);
        const matchedWinners = winners.filter(rule.matchFn);

        const lCaught  = matchedLosers.length;
        const wRemoved = matchedWinners.length;

        const savedR      = matchedLosers.reduce((s, t) => s + Math.abs(rOf(t)), 0);
        const sacrificedR = matchedWinners.reduce((s, t) => s + rOf(t), 0);
        const netR        = round1(savedR - sacrificedR);

        const avgActualLossR = lCaught  ? round2(savedR / lCaught)  : null;
        const avgActualWinR  = wRemoved ? round2(sacrificedR / wRemoved) : null;

        const wPct = winners.length ? round1((wRemoved / winners.length) * 100) : 0;
        const lPct = losers.length  ? round1((lCaught  / losers.length)  * 100) : 0;

        // Severity-weighted net R: high-severity losses are more valuable to catch.
        // Each matched loss is weighted by (1 + severity/10), so critical losses (sev=8)
        // contribute 1.8× vs uncored losses (sev=0) contributing 1.0×.
        const severityWeightedSaved = matchedLosers.reduce((s, t) => {
            const w = 1 + Math.min((t.severity ?? 0), 10) / 10;
            return s + Math.abs(rOf(t)) * w;
        }, 0);
        const severityNetR = round1(severityWeightedSaved - sacrificedR);

        const avgSeverity = lCaught
            ? round1(matchedLosers.reduce((s, t) => s + (t.severity ?? 0), 0) / lCaught)
            : null;

        const tier = preventionConfidence(lCaught);

        return {
            key:               rule.key,
            label:             rule.label,
            group:             rule.group,
            losersCaught:      lCaught,
            losersCaughtPct:   lPct,
            winnersRemoved:    wRemoved,
            winnersRemovedPct: wPct,
            savedR:            round1(savedR),
            sacrificedR:       round1(sacrificedR),
            netRDelta:         netR,
            severityNetR,
            avgActualLossR,
            avgActualWinR,
            avgSeverity,
            falsePosWarning:   wPct > 15,
            sampleN:           lCaught,
            confidence:        tier,          // SPECULATIVE / WEAK / MODERATE / STRONG
            isSpeculative:     tier === "SPECULATIVE",
        };
    });

    // Sort by net R delta descending (actual R, not severity-weighted by default)
    return rows.sort((a, b) => b.netRDelta - a.netRDelta);
}

// ── Section 8 — Overview support builders ─────────────────────────────────────

/**
 * buildCurrentStreak(trades) → number
 * Count of consecutive losses at the end of the trade series.
 */
export function buildCurrentStreak(trades) {
    if (!Array.isArray(trades) || !trades.length) return 0;
    let count = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
        if (rOf(trades[i]) < 0) count++;
        else break;
    }
    return count;
}

/**
 * buildStreakLeaderboard(trades, n=5) → StreakZone[]
 * Returns the worst N losing streaks with metadata.
 */
export function buildStreakLeaderboard(trades, n = 5) {
    if (!Array.isArray(trades)) return [];
    const { streakZones } = computeStreakStats(trades);
    return streakZones
        .sort((a, b) => b.length - a.length)
        .slice(0, n)
        .map((zone, rank) => {
            const zoneTrades = trades.slice(zone.start, zone.end + 1);
            const totalR     = zoneTrades.reduce((s, t) => s + rOf(t), 0);
            const startTrade = trades[zone.start];
            const endTrade   = trades[zone.end];
            return {
                rank:       rank + 1,
                length:     zone.length,
                totalR:     round2(totalR),
                startEntry: startTrade?.entry ?? startTrade?.fill_time ?? null,
                endEntry:   endTrade?.entry   ?? endTrade?.fill_time   ?? null,
            };
        });
}

/**
 * buildWeekdayFailureStats(trades) → DayRow[]
 * Per-weekday loss/win counts and loss rate, sorted Mon→Sun (filtered to days with trades).
 */
export function buildWeekdayFailureStats(trades) {
    const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const rows = Array.from({ length: 7 }, (_, i) => ({
        weekday: i, label: LABELS[i], lossCount: 0, winCount: 0, total: 0,
    }));
    for (const t of trades) {
        const d = entryWeekday(t);
        if (d == null || d > 6) continue;
        rows[d].total++;
        rOf(t) < 0 ? rows[d].lossCount++ : rows[d].winCount++;
    }
    return rows
        .filter(r => r.total > 0)
        .map(r => ({ ...r, lossRate: round1((r.lossCount / r.total) * 100) }));
}

/**
 * buildHourBucketStats(trades) → HourBucket[]
 * Aggregates trades into 4-hour UTC buckets.
 */
export function buildHourBucketStats(trades) {
    const buckets = [
        { label: "00–04 UTC", hours: [0,1,2,3],     lossCount: 0, total: 0 },
        { label: "04–08 UTC", hours: [4,5,6,7],     lossCount: 0, total: 0 },
        { label: "08–12 UTC", hours: [8,9,10,11],   lossCount: 0, total: 0 },
        { label: "12–16 UTC", hours: [12,13,14,15], lossCount: 0, total: 0 },
        { label: "16–20 UTC", hours: [16,17,18,19], lossCount: 0, total: 0 },
        { label: "20–24 UTC", hours: [20,21,22,23], lossCount: 0, total: 0 },
    ];
    for (const t of trades) {
        const h = entryHour(t);
        if (h == null) continue;
        const b = buckets.find(bk => bk.hours.includes(h));
        if (!b) continue;
        b.total++;
        if (rOf(t) < 0) b.lossCount++;
    }
    return buckets.map(b => ({
        label:     b.label,
        lossCount: b.lossCount,
        total:     b.total,
        lossRate:  b.total ? round1((b.lossCount / b.total) * 100) : 0,
    }));
}

/**
 * buildSeverityDistribution(losers) → { low, moderate, high, critical, total }
 * Buckets severity scores: low <4, moderate 4–6, high 6–8, critical 8+.
 */
export function buildSeverityDistribution(losers) {
    const dist = { low: 0, moderate: 0, high: 0, critical: 0 };
    for (const t of losers) {
        const s = t.severity ?? 0;
        if      (s >= 8) dist.critical++;
        else if (s >= 6) dist.high++;
        else if (s >= 4) dist.moderate++;
        else             dist.low++;
    }
    return { ...dist, total: losers.length };
}

/**
 * buildOverviewInsights(losers, allTrades, sessionStats, dirStats, weekdayStats) → string[]
 * Derives plain-English insight lines from the data.
 */
export function buildOverviewInsights(losers, allTrades, sessionStats, dirStats, weekdayStats) {
    const insights = [];
    if (!losers.length) return insights;

    // Leading loss session (min 5 trades for statistical relevance)
    const worstSession = [...sessionStats]
        .filter(s => s.total >= 5)
        .sort((a, b) => b.lossRate - a.lossRate)[0];
    if (worstSession) {
        insights.push(
            `${worstSession.session} session has the highest loss rate: ${worstSession.lossRate}% (${worstSession.lossCount}/${worstSession.total} trades)`,
        );
    }

    // Directional asymmetry
    const { long: l, short: s } = dirStats;
    if (l && s && l.lossRate != null && s.lossRate != null) {
        const diff = Math.abs(l.lossRate - s.lossRate);
        if (diff > 8) {
            const worse = l.lossRate > s.lossRate ? "Long" : "Short";
            const rate  = l.lossRate > s.lossRate ? l.lossRate : s.lossRate;
            insights.push(
                `${worse} trades have a significantly higher loss rate (${rate}%) — ${diff.toFixed(0)}pp worse than the opposite direction`,
            );
        }
    }

    // Worst weekday (min 5 trades)
    const worstDay = [...weekdayStats]
        .filter(d => d.total >= 5)
        .sort((a, b) => b.lossRate - a.lossRate)[0];
    if (worstDay && worstDay.lossRate > 50) {
        insights.push(
            `${worstDay.label} has a ${worstDay.lossRate}% loss rate — consider excluding or reviewing entries on this day`,
        );
    }

    // High/critical severity concentration
    const highSev    = losers.filter(t => (t.severity ?? 0) >= 6).length;
    const highSevPct = round1((highSev / losers.length) * 100);
    if (highSevPct > 20) {
        insights.push(
            `${highSevPct}% of losses are HIGH or CRITICAL severity — these are the highest-priority trades for forensic review`,
        );
    }

    return insights;
}

// ── Section 9 — Phase 2 Intelligence ─────────────────────────────────────────

/**
 * buildBurstDetection(trades, windowHours=48, minLosses=3) → BurstWindow[]
 * Finds time windows where losses cluster more densely than the dataset average.
 * Requires trades to have parseable entry timestamps.
 * Returns the worst burst windows sorted by lossCount desc.
 */
export function buildBurstDetection(trades, windowHours = 48, minLosses = 3) {
    if (!Array.isArray(trades) || trades.length < minLosses) return [];

    // Collect timestamped losers
    const losers = [];
    for (const t of trades) {
        if (rOf(t) >= 0) continue;
        const ts = _parseEntryMs(t);
        if (ts == null) continue;
        losers.push({ t, ts });
    }
    if (losers.length < minLosses) return [];

    losers.sort((a, b) => a.ts - b.ts);

    const windowMs = windowHours * 3600 * 1000;
    const burst    = [];

    // Sliding window: for each loser, find all losers within [ts, ts + window]
    for (let i = 0; i < losers.length; i++) {
        const start = losers[i].ts;
        const end   = start + windowMs;
        const group = losers.filter(l => l.ts >= start && l.ts <= end);
        if (group.length < minLosses) continue;

        const totalR   = group.reduce((s, l) => s + rOf(l.t), 0);
        const sessions = {};
        for (const l of group) {
            const sess = l.t.session || sessionOf(l.t.entry) || "Unknown";
            sessions[sess] = (sessions[sess] || 0) + 1;
        }
        const topSession = Object.entries(sessions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        burst.push({
            startTs:    new Date(start).toISOString().slice(0, 16).replace("T", " "),
            endTs:      new Date(end).toISOString().slice(0, 16).replace("T", " "),
            lossCount:  group.length,
            totalR:     round2(totalR),
            topSession,
            sessions,
        });
    }

    // Deduplicate overlapping windows by keeping highest-density unique start points
    // (simple: sort by lossCount desc, keep top 5 non-overlapping by start time)
    burst.sort((a, b) => b.lossCount - a.lossCount || a.startTs.localeCompare(b.startTs));
    const deduped = [];
    const seen = new Set();
    for (const w of burst) {
        // Skip if we've already captured a window that starts within 12 hours of this one
        const hourKey = w.startTs.slice(0, 13); // "YYYY-MM-DD HH"
        if (seen.has(hourKey)) continue;
        seen.add(hourKey);
        deduped.push(w);
        if (deduped.length >= 5) break;
    }
    return deduped;
}

// Internal: parse entry timestamp to ms epoch
function _parseEntryMs(trade) {
    const raw = trade?.entry ?? trade?.entryTime ?? trade?.fill_time;
    if (!raw) return null;
    const d = typeof raw === "number"
        ? (raw > 1e10 ? new Date(raw) : new Date(raw * 1000))
        : new Date(String(raw).trim().replace(/^(\d{4}-\d{2}-\d{2})\s/, "$1T"));
    const ms = d?.getTime?.();
    return Number.isFinite(ms) ? ms : null;
}

/**
 * buildStreakContext(trades) → StreakContextZone[]
 * Enriches each streak zone with session, direction, and hour concentration.
 * Used by StreakAnalysis to surface "4 of 5 losses were London Longs" patterns.
 */
export function buildStreakContext(trades) {
    if (!Array.isArray(trades) || !trades.length) return [];
    const { streakZones } = computeStreakStats(trades);

    return streakZones
        .sort((a, b) => b.length - a.length) // worst streaks first
        .slice(0, 8)                           // cap at 8 zones for display
        .map((zone, rank) => {
            const zoneTrades = trades.slice(zone.start, zone.end + 1);
            const n          = zoneTrades.length;

            const sessions   = {};
            const directions = {};
            const hours      = [];

            for (const t of zoneTrades) {
                const sess = t.session || sessionOf(t?.entry) || "Unknown";
                sessions[sess] = (sessions[sess] || 0) + 1;

                const dir = directionOf(t);
                directions[dir] = (directions[dir] || 0) + 1;

                const h = entryHour(t);
                if (h != null) hours.push(h);
            }

            const topSessionEntry    = Object.entries(sessions).sort((a, b) => b[1] - a[1])[0];
            const topDirectionEntry  = Object.entries(directions).sort((a, b) => b[1] - a[1])[0];
            const avgHour            = hours.length ? round1(hours.reduce((s, h) => s + h, 0) / hours.length) : null;

            const totalR = zoneTrades.reduce((s, t) => s + rOf(t), 0);
            const startEntry = trades[zone.start]?.entry ?? trades[zone.start]?.fill_time ?? null;
            const endEntry   = trades[zone.end]?.entry   ?? trades[zone.end]?.fill_time   ?? null;

            return {
                rank:              rank + 1,
                length:            zone.length,
                totalR:            round2(totalR),
                startEntry,
                endEntry,
                sessions,
                directions,
                topSession:        topSessionEntry?.[0] ?? null,
                topSessionPct:     topSessionEntry ? round1((topSessionEntry[1] / n) * 100) : null,
                topDirection:      topDirectionEntry?.[0] ?? null,
                topDirectionPct:   topDirectionEntry ? round1((topDirectionEntry[1] / n) * 100) : null,
                avgHourUTC:        avgHour,
                // Flag if a single session or direction dominates (≥70%)
                sessionDominated:  topSessionEntry  ? topSessionEntry[1]  / n >= 0.7 : false,
                directionDominated:topDirectionEntry ? topDirectionEntry[1] / n >= 0.7 : false,
            };
        });
}

/**
 * computeFalseLosserCandidates(losers) → FalseLosserCandidate[]
 * Identifies losing trades that may be false losers based on currently-available fields.
 * Returns candidates with typed reasons and an explicit uncertainty notice.
 *
 * WITHOUT post-stop continuation data this is always UNCERTAIN — we flag patterns
 * that are consistent with false losers but cannot confirm them.
 */
export function computeFalseLosserCandidates(losers) {
    if (!Array.isArray(losers) || !losers.length) return [];

    const candidates = [];

    for (const t of losers) {
        const signals = [];

        // Signal 1: very fast stopout (< 10 min) — timing issue or stop raid
        const durMins = durationMinutes(t);
        if (durMins != null && durMins < 10) {
            signals.push({ type: "fast_stopout", label: `Stopped out in ${Math.round(durMins)} min — possible stop raid` });
        }

        // Signal 2: fast stopout archetype with low/unclassified confidence
        if (t.archetype === "fast_stopout" && (t.confidence === "UNCLASSIFIED" || t.confidence === "LOW" || t.confidence === "BORDERLINE")) {
            signals.push({ type: "low_conf_timing", label: "Fast stopout with low classifier confidence — ambiguous invalidation" });
        }

        // Signal 3: hard invalidation via numeric threshold only (not explicit boolean)
        // These trades matched max_ob_penetration_pct ≥ 100 but NOT ob_fully_breached=true
        if (
            t.archetype === "hard_invalidation" &&
            t.max_ob_penetration_pct != null &&
            t.ob_fully_breached !== true &&
            Number(t.max_ob_penetration_pct) >= 100 &&
            Number(t.max_ob_penetration_pct) < 110
        ) {
            signals.push({ type: "marginal_breach", label: `OB penetration ${Number(t.max_ob_penetration_pct).toFixed(0)}% — marginal breach, may not be structural` });
        }

        // Signal 4: close-confirmed without full breach — stop may have been too tight
        if (t.archetype === "close_confirmed" && t.ob_fully_breached !== true) {
            signals.push({ type: "close_conf_no_breach", label: "Close-confirmed without full OB breach — stop may have been too tight" });
        }

        // Only include trades with ≥ 1 signal
        if (!signals.length) continue;

        candidates.push({
            id:        t?.id ?? t?.trade_id ?? null,
            entry:     t?.entry ?? t?.fill_time ?? null,
            direction: directionOf(t),
            session:   t?.session || sessionOf(t?.entry) || "—",
            r:         rOf(t),
            archetype: t?.archetype ?? "standard_loss",
            severity:  t?.severity  ?? null,
            signals,
            // Explicit uncertainty: we cannot confirm false losers without post-stop data
            confirmed: false,
            note: "Candidate only — confirmation requires post-stop continuation data (MAE/MFE/post_stop_continuation_r)",
            _trade: t,
        });
    }

    // Sort by signal count desc, then by severity desc
    return candidates.sort((a, b) =>
        b.signals.length - a.signals.length || (b.severity ?? 0) - (a.severity ?? 0)
    );
}

/**
 * buildDrilldownRows(losers) → DrilldownRow[]
 * Flat rows for the DataTable in FailureDrilldown.
 * Includes a _trade reference to the full trade object for the detail panel.
 */
export function buildDrilldownRows(losers) {
    if (!Array.isArray(losers)) return [];
    return losers.map((t, i) => {
        const rawTs = t?.entry ?? t?.fill_time ?? t?.entryTime ?? null;
        let dateStr = "—";
        if (rawTs) {
            try {
                const d = new Date(rawTs);
                dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
            } catch { dateStr = String(rawTs); }
        }
        return {
            _idx:       i,
            id:         t?.id ?? t?.trade_id ?? i,
            datetime:   dateStr,
            direction:  directionOf(t),
            session:    t?.session || sessionOf(t?.entry) || "—",
            r:          rOf(t),
            archetype:  t?.archetype  ?? "standard_loss",
            confidence: t?.confidence ?? "UNCLASSIFIED",
            severity:   t?.severity   ?? null,
            _trade:     t, // full trade object for detail panel
        };
    });
}
