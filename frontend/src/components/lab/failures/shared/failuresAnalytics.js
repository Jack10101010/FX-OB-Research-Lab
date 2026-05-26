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

export function computePreventionRules(trades, classified) {
    if (!trades.length) return [];

    const losers  = classified.length ? classified.filter(t => rOf(t) < 0) : filterLosers(trades);
    const winners = filterWinners(trades);

    const avgLossR = losers.length
        ? losers.reduce((s, t) => s + Math.abs(rOf(t)), 0) / losers.length
        : 1;
    const avgWinR = winners.length
        ? winners.reduce((s, t) => s + rOf(t), 0) / winners.length
        : 1;

    const rows = PREVENTION_RULES.map(rule => {
        const lCaught  = losers.filter(rule.matchFn).length;
        const wRemoved = winners.filter(rule.matchFn).length;
        const netR     = round1(lCaught * avgLossR - wRemoved * avgWinR);
        const wPct     = winners.length ? round1((wRemoved / winners.length) * 100) : 0;
        const lPct     = losers.length  ? round1((lCaught  / losers.length)  * 100) : 0;

        return {
            key:               rule.key,
            label:             rule.label,
            group:             rule.group,
            losersCaught:      lCaught,
            losersCaughtPct:   lPct,
            winnersRemoved:    wRemoved,
            winnersRemovedPct: wPct,
            netRDelta:         netR,
            falsePosWarning:   wPct > 15,
            sampleN:           lCaught,
            confidence:        sampleConfidence(lCaught),
        };
    });

    // Sort by net R delta descending
    return rows.sort((a, b) => b.netRDelta - a.netRDelta);
}
