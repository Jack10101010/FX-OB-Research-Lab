/**
 * sessionLabV1Adapter.js — Pure adapter layer for Session Lab V1.
 *
 * Converts real app trade data into the same shapes used by mockData.js so
 * that V1 prototype components need zero internal changes.
 *
 * Phase A: buildSessionListFromTrades, buildImpactSummaryFromTrades, buildVisualSummaryFromTrades
 * Phase B: buildOverviewDataFromSessionTrades, buildDirectionLabData, buildStructureLabData
 * Phase C1: buildTimeAnalysisData
 *
 * All functions are side-effect-free and safe inside useMemo.
 *
 * DO NOT add React imports or side effects here.
 */

import {
  computeSessionMetrics,
  buildSessionProfiles,
  buildSessionEquityCurve,
  buildCardSnapshot,
  buildSessionBreakdowns,
  resolveSession,
  normalizeDirection,
  normalizeStructure,
  getR,
  isWin,
  isLoss,
  computePreviewComparison,
  SESSION_BREAKDOWN_DEFS,
} from "../../../components/lab/session/analytics/sessionAnalytics";

import { SESSION_DEFINITIONS } from "../../../components/lab/session/config/sessionConfig";

// ─── Key maps ────────────────────────────────────────────────────────────────

/** Canonical session key → V1 lowercase short key. */
const TO_V1_KEY = {
  "Asia":         "asia",
  "London":       "london",
  "London Lull":  "lull",
  "New York":     "ny",
  "NY PM":        "nypm",
  "Outside":      "outside",
};

/** Short display names for charts (matches mock data labels). */
const SESSION_DISPLAY_NAMES = {
  "Asia":         "Asia",
  "London":       "London",
  "London Lull":  "Lull",
  "New York":     "NY",
  "NY PM":        "NY PM",
  "Outside":      "Outside",
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Format average minutes as a human-readable time string. */
function formatAvgTime(metrics) {
  const { avgTimeToTarget, avgTimeToStopout, wins, losses } = metrics;
  let totalMinutes = 0;
  let count = 0;
  if (avgTimeToTarget != null && wins > 0)  { totalMinutes += avgTimeToTarget * wins;  count += wins; }
  if (avgTimeToStopout != null && losses > 0) { totalMinutes += avgTimeToStopout * losses; count += losses; }
  if (count === 0) return "—";
  const avg = Math.round(totalMinutes / count);
  if (avg < 60) return `${avg}m`;
  const h = Math.floor(avg / 60);
  const m = avg % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Compute long/short percentage split from session trades. */
function computeDirectionSplit(sessionTrades) {
  const total = sessionTrades.length;
  if (total === 0) return { long: 50, short: 50 };
  const longs = sessionTrades.filter((t) => normalizeDirection(t) === "Long").length;
  const longPct = Math.round((longs / total) * 100);
  return { long: longPct, short: 100 - longPct };
}

/** Compute BOS/CHoCH percentage split from session trades. */
function computeStructureSplit(sessionTrades) {
  const total = sessionTrades.length;
  if (total === 0) return { bos: 50, choch: 50 };
  const bos = sessionTrades.filter((t) => normalizeStructure(t) === "BOS").length;
  const bosPct = Math.round((bos / total) * 100);
  return { bos: bosPct, choch: 100 - bosPct };
}

/** Get the entry model label for a trade, consistent with SESSION_BREAKDOWN_DEFS. */
const entryModelDef = SESSION_BREAKDOWN_DEFS.find((d) => d.key === "entryModel");
function getEntryModelLabel(t) {
  return entryModelDef ? entryModelDef.getLabel(t) : "Baseline";
}

// ─── Exported adapter functions ───────────────────────────────────────────────

/**
 * Build SESSION_LIST-compatible array from real trades.
 *
 * @param {object[]} allTrades  — from useTradeUniverse().trades
 * @param {object}   sessionRules — from buildDefaultSessionRules / V1 rule state
 * @returns {object[]} SESSION_LIST-compatible array
 */
export function buildSessionListFromTrades(allTrades, sessionRules) {
  if (!allTrades || allTrades.length === 0) return [];

  return SESSION_DEFINITIONS
    .filter((def) => def.key !== "Unknown" && TO_V1_KEY[def.key])
    .map((def) => {
      const v1Key = TO_V1_KEY[def.key];

      // Filter to this session's trades
      const sessionTrades = allTrades.filter((t) => resolveSession(t) === def.key);

      // Core metrics (computeSessionMetrics filters internally — pass allTrades)
      const metrics = computeSessionMetrics(allTrades, def.key, "both");

      // Snapshot (best/worst per dimension) — null-safe
      const snapshot = sessionTrades.length >= 2 ? buildCardSnapshot(sessionTrades) : null;

      // Equity spark curve
      const equityCurve = buildSessionEquityCurve(sessionTrades);
      const spark = equityCurve.map((p) => p.netR);

      // Direction + structure splits
      const longShortSplit = computeDirectionSplit(sessionTrades);
      const bosChochSplit  = computeStructureSplit(sessionTrades);

      // Rule toggles (read from sessionRules keyed by canonical key)
      const rule = sessionRules?.[def.key];
      const enabled = rule?.enabled ?? true;
      const longs   = rule?.direction?.long  ?? true;
      const shorts  = rule?.direction?.short ?? true;
      const bos     = rule?.structure?.BOS   ?? true;
      const choch   = rule?.structure?.CHoCH ?? true;

      return {
        key:    v1Key,
        name:   def.label,
        range:  def.startUtc && def.endUtc ? `${def.startUtc}–${def.endUtc} UTC` : "—",
        icon:   v1Key,                        // matches ICONS map in SessionControlCenter

        // Metrics (guard nulls)
        netR:       metrics.netR,
        pf:         metrics.profitFactor != null ? Number(metrics.profitFactor.toFixed(2)) : null,
        wr:         metrics.winRate      != null ? Number(metrics.winRate.toFixed(1))      : 0,
        dd:         metrics.maxDD        ?? 0,
        trades:     metrics.tradeCount   ?? sessionTrades.length,
        expectancy: metrics.expectancy   != null ? Number(metrics.expectancy.toFixed(3))  : 0,
        avgR:       metrics.expectancy   != null ? Number(metrics.expectancy.toFixed(3))  : 0,
        avgTime:    formatAvgTime(metrics),
        verdict:    metrics.verdict      ?? "No Data",

        // Snapshot labels (best/worst)
        bestStructure:  snapshot?.structure?.best?.label    ?? "—",
        worstStructure: snapshot?.structure?.worst?.label   ?? "—",
        bestEntry:      snapshot?.entryModel?.best?.label   ?? "—",
        bestDelay:      snapshot?.triggerDelay?.best?.label ?? "—",

        // Splits
        longShortSplit,
        bosChochSplit,

        // Spark (cumulative R values)
        spark: spark.length > 0 ? spark : [0],

        // Rule toggles
        enabled,
        longs,
        shorts,
        bos,
        choch,
      };
    });
}

/**
 * Build IMPACT_SUMMARY-compatible object from original vs filtered trades.
 *
 * @param {object[]} allTrades      — full unfiltered trade array
 * @param {object[]} filteredTrades — trades after applying session rules
 * @returns {object} IMPACT_SUMMARY-compatible
 */
export function buildImpactSummaryFromTrades(allTrades, filteredTrades) {
  if (!allTrades || allTrades.length === 0) {
    return {
      baseline: { netR: 0, trades: 0, wr: 0,    pf: null, dd: 0 },
      preview:  { netR: 0, trades: 0, wr: 0,    pf: null, dd: 0 },
      delta:    { netR: 0, trades: 0, wr: 0,    pf: null, dd: 0, losses_removed: 0, winners_removed: 0 },
    };
  }

  const cmp = computePreviewComparison(allTrades, filteredTrades ?? allTrades);

  const wrDelta = (cmp.filtered.winRate != null && cmp.original.winRate != null)
    ? Number((cmp.filtered.winRate - cmp.original.winRate).toFixed(1))
    : 0;

  const pfDelta = (cmp.filtered.profitFactor != null && cmp.original.profitFactor != null)
    ? Number((cmp.filtered.profitFactor - cmp.original.profitFactor).toFixed(2))
    : null;

  // dd delta: filtered.maxDD - original.maxDD
  // e.g. -3.2 - (-6.5) = +3.3 → positive = improvement (less drawdown)
  const ddDelta = Number((cmp.filtered.maxDD - cmp.original.maxDD).toFixed(2));

  return {
    baseline: {
      netR:   cmp.original.netR,
      trades: cmp.original.tradeCount,
      wr:     cmp.original.winRate     ?? 0,
      pf:     cmp.original.profitFactor != null
        ? Number(cmp.original.profitFactor.toFixed(2))
        : null,
      dd:     cmp.original.maxDD,
    },
    preview: {
      netR:   cmp.filtered.netR,
      trades: cmp.filtered.tradeCount,
      wr:     cmp.filtered.winRate     ?? 0,
      pf:     cmp.filtered.profitFactor != null
        ? Number(cmp.filtered.profitFactor.toFixed(2))
        : null,
      dd:     cmp.filtered.maxDD,
    },
    delta: {
      netR:            cmp.delta.netR,
      trades:          cmp.delta.tradeCount,      // negative = trades removed
      wr:              wrDelta,
      pf:              pfDelta,
      dd:              ddDelta,                   // positive = improvement
      losses_removed:  cmp.removed.losses,
      winners_removed: cmp.removed.wins,
    },
  };
}

/**
 * Build all four VisualSummaryStrip data sets from real trades.
 *
 * @param {object[]} allTrades — full trade array
 * @returns {{ netRBySession, tradesByDirection, tradesByStructure, topEntryModel }}
 */
export function buildVisualSummaryFromTrades(allTrades) {
  if (!allTrades || allTrades.length === 0) {
    return {
      netRBySession:     [],
      tradesByDirection: [],
      tradesByStructure: [],
      topEntryModel:     [],
    };
  }

  // ── Net R by session (sorted descending) ───────────────────────────────────
  const netRBySession = buildSessionProfiles(allTrades)
    .filter((p) => p.metrics.tradeCount > 0)
    .map((p) => ({
      name:  SESSION_DISPLAY_NAMES[p.session] ?? p.session,
      netR:  p.metrics.netR,
    }))
    .sort((a, b) => b.netR - a.netR);

  // ── Trades by direction ────────────────────────────────────────────────────
  let longCount = 0;
  let shortCount = 0;
  for (const t of allTrades) {
    const dir = normalizeDirection(t);
    if (dir === "Long")  longCount++;
    if (dir === "Short") shortCount++;
  }
  const tradesByDirection = [
    { name: "Long",  value: longCount,  color: "#22C55E" },
    { name: "Short", value: shortCount, color: "#EF4444" },
  ];

  // ── Trades by structure ────────────────────────────────────────────────────
  let bosCount   = 0;
  let chochCount = 0;
  for (const t of allTrades) {
    const struct = normalizeStructure(t);
    if (struct === "BOS")   bosCount++;
    if (struct === "CHoCH") chochCount++;
  }
  const tradesByStructure = [
    { name: "BOS",   value: bosCount,   color: "#3B82F6" },
    { name: "CHoCH", value: chochCount, color: "#A855F7" },
  ];

  // ── Top entry model by net R ───────────────────────────────────────────────
  const modelMap = new Map();
  for (const t of allTrades) {
    const label = getEntryModelLabel(t);
    if (!modelMap.has(label)) modelMap.set(label, 0);
    modelMap.set(label, modelMap.get(label) + getR(t));
  }
  const topEntryModel = [...modelMap.entries()]
    .map(([name, netR]) => ({ name, netR: Number(netR.toFixed(2)) }))
    .sort((a, b) => b.netR - a.netR)
    .slice(0, 8);

  return { netRBySession, tradesByDirection, tradesByStructure, topEntryModel };
}

// ─── Phase B internal helpers ─────────────────────────────────────────────────

/** Compute core metrics for an arbitrary pre-filtered trade slice. */
function computeSideMetrics(trades) {
  if (!trades.length) return null;
  const wins    = trades.filter(isWin).length;
  const losses  = trades.filter(isLoss).length;
  const decided = wins + losses;
  const netR    = Number(trades.reduce((s, t) => s + getR(t), 0).toFixed(2));
  const wr      = decided > 0 ? Number(((wins / decided) * 100).toFixed(1)) : 0;
  const grossWin  = trades.filter((t) => getR(t) > 0).reduce((s, t) => s + getR(t), 0);
  const grossLoss = trades.filter((t) => getR(t) < 0).reduce((s, t) => s + Math.abs(getR(t)), 0);
  const pf  = grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : null;
  const exp = Number((netR / trades.length).toFixed(3));
  let peak = 0, cum = 0, maxDD = 0;
  for (const t of trades) {
    cum += getR(t);
    if (cum > peak) peak = cum;
    const dd = cum - peak;
    if (dd < maxDD) maxDD = dd;
  }
  return { netR, trades: trades.length, wr, pf, dd: Number(maxDD.toFixed(2)), expectancy: exp, wins, losses };
}

/** Count losses where minutes_to_exit < 30. */
function computeFastStopouts(sideTrades) {
  const fast = sideTrades.filter((t) => {
    if (!isLoss(t)) return false;
    const m = t.minutes_to_exit ?? t.minutesToExit ?? null;
    return m != null && Number(m) < 30;
  });
  const count = fast.length;
  const pct   = sideTrades.length > 0 ? Number(((count / sideTrades.length) * 100).toFixed(1)) : 0;
  return { count, pct };
}

/** Extract best/worst labels+netR from a buildSessionBreakdowns bucket array. */
function snapshotFromBuckets(rows) {
  if (!rows || !rows.length) return { best: null, worst: null };
  const active = rows.filter((r) => r.count > 0).sort((a, b) => b.netR - a.netR);
  if (!active.length) return { best: null, worst: null };
  return {
    best:  { label: active[0].label,                 netR: active[0].netR },
    worst: { label: active[active.length - 1].label, netR: active[active.length - 1].netR },
  };
}

// ─── Phase B exported adapter functions ──────────────────────────────────────

const OVERVIEW_BREAKDOWN_CATS = [
  { cat: "Direction",     key: "direction" },
  { cat: "Structure",     key: "structure" },
  { cat: "Entry Model",   key: "entryModel" },
  { cat: "Trigger Delay", key: "triggerDelay" },
  { cat: "R Target",      key: "rTarget" },
  { cat: "Stop Buffer",   key: "stopBuffer" },
  { cat: "BE / Trailing", key: "protection" },
  { cat: "Cancellation",  key: "cancellation" },
];

/**
 * Build DEEP_DIVE_LONDON-shaped overview data for a specific session.
 *
 * @param {object[]} sessionTrades — pre-filtered to one session
 * @returns {object|null}
 */
export function buildOverviewDataFromSessionTrades(sessionTrades) {
  if (!sessionTrades || sessionTrades.length === 0) return null;

  const m = computeSideMetrics(sessionTrades);
  if (!m) return null;

  // Equity curve: trade-indexed [{ t, v }]
  const equity = buildSessionEquityCurve(sessionTrades).map((p) => ({
    t: `T${p.i + 1}`,
    v: p.netR,
  }));

  // Breakdown table: all 8 dimensions via buildSessionBreakdowns
  const { bucketsByKey } = buildSessionBreakdowns(sessionTrades);
  const breakdown = OVERVIEW_BREAKDOWN_CATS.map(({ cat, key }) => {
    const s = snapshotFromBuckets(bucketsByKey[key]);
    return {
      cat,
      best:   s.best?.label  ?? "—",
      bestR:  s.best?.netR   ?? 0,
      worst:  s.worst?.label ?? "—",
      worstR: s.worst?.netR  ?? 0,
    };
  });

  // Avg time across all trades (minutes_to_exit field)
  const getMinutes = (t) => {
    const v = t.minutes_to_exit ?? t.minutesToExit ?? null;
    return v != null ? Number(v) : null;
  };
  const allMins = sessionTrades.map(getMinutes).filter((v) => v != null);
  let avgTime = "—";
  if (allMins.length > 0) {
    const avg = Math.round(allMins.reduce((s, v) => s + v, 0) / allMins.length);
    if (avg < 60) avgTime = `${avg}m`;
    else {
      const h  = Math.floor(avg / 60);
      const mm = avg % 60;
      avgTime = mm > 0 ? `${h}h ${mm}m` : `${h}h`;
    }
  }

  return {
    metrics: {
      netR:       m.netR,
      wr:         m.wr,
      expectancy: Number(m.expectancy.toFixed(2)),
      pf:         m.pf,  // null = no losses
      dd:         m.dd,
      trades:     m.trades,
      avgR:       Number(m.expectancy.toFixed(2)),
      avgTime,
    },
    equity,
    allSessionsEquity: [],  // Phase C: cross-session comparison
    breakdown,
  };
}

const EMPTY_DIRECTION_SIDE = {
  netR: 0, trades: 0, wr: 0, pf: null, dd: 0, expectancy: 0,
  bestStructure:  { label: "—", value: 0 },
  worstStructure: { label: "—", value: 0 },
  bestEntry:      { label: "—", value: 0 },
  bestDelay:      { label: "—", value: 0 },
  fastStopouts: { count: 0, pct: 0 },
  equity: [{ t: 0, v: 0 }],
};

/**
 * Build DIRECTION_LAB-shaped data for the selected session.
 *
 * @param {object[]} sessionTrades — pre-filtered to one session
 * @returns {object|null}
 */
export function buildDirectionLabData(sessionTrades) {
  if (!sessionTrades || sessionTrades.length === 0) return null;

  const longTrades  = sessionTrades.filter((t) => normalizeDirection(t) === "Long");
  const shortTrades = sessionTrades.filter((t) => normalizeDirection(t) === "Short");

  if (longTrades.length === 0 && shortTrades.length === 0) return null;

  function buildSide(trades) {
    if (!trades.length) return EMPTY_DIRECTION_SIDE;
    const m    = computeSideMetrics(trades);
    const snap = trades.length >= 2 ? buildCardSnapshot(trades) : null;
    const equity = buildSessionEquityCurve(trades).map((p) => ({ t: p.i, v: p.netR }));
    return {
      netR:       m.netR,
      trades:     m.trades,
      wr:         m.wr,
      pf:         m.pf,
      dd:         m.dd,
      expectancy: m.expectancy,
      bestStructure:  snap?.structure?.best    ? { label: snap.structure.best.label,    value: snap.structure.best.netR    } : { label: "—", value: 0 },
      worstStructure: snap?.structure?.worst   ? { label: snap.structure.worst.label,   value: snap.structure.worst.netR   } : { label: "—", value: 0 },
      bestEntry:      snap?.entryModel?.best   ? { label: snap.entryModel.best.label,   value: snap.entryModel.best.netR   } : { label: "—", value: 0 },
      bestDelay:      snap?.triggerDelay?.best ? { label: snap.triggerDelay.best.label, value: snap.triggerDelay.best.netR } : { label: "—", value: 0 },
      fastStopouts: computeFastStopouts(trades),
      equity,
    };
  }

  return {
    longs:  buildSide(longTrades),
    shorts: buildSide(shortTrades),
  };
}

const EMPTY_STRUCT_SIDE = { netR: 0, trades: 0, wr: 0, pf: null, dd: 0 };

/**
 * Build STRUCTURE_LAB-shaped data for the selected session.
 * The `overTime` field is always null (Phase C: requires time-series).
 *
 * @param {object[]} sessionTrades — pre-filtered to one session
 * @returns {object|null}
 */
export function buildStructureLabData(sessionTrades) {
  if (!sessionTrades || sessionTrades.length === 0) return null;

  const bosTrades   = sessionTrades.filter((t) => normalizeStructure(t) === "BOS");
  const chochTrades = sessionTrades.filter((t) => normalizeStructure(t) === "CHoCH");

  if (bosTrades.length === 0 && chochTrades.length === 0) return null;

  function buildStruct(trades) {
    if (!trades.length) return EMPTY_STRUCT_SIDE;
    const m = computeSideMetrics(trades);
    return { netR: m.netR, trades: m.trades, wr: m.wr, pf: m.pf, dd: m.dd };
  }

  // 2×2 direction × structure matrix
  const COMBOS = [
    { dir: "Long",  struct: "BOS" },
    { dir: "Short", struct: "BOS" },
    { dir: "Long",  struct: "CHoCH" },
    { dir: "Short", struct: "CHoCH" },
  ];
  const matrix = COMBOS.map(({ dir, struct }) => {
    const trades = sessionTrades.filter(
      (t) => normalizeDirection(t) === dir && normalizeStructure(t) === struct
    );
    const m = trades.length > 0 ? computeSideMetrics(trades) : EMPTY_STRUCT_SIDE;
    return { dir, struct, netR: m.netR, trades: m.trades, wr: m.wr, pf: m.pf ?? 0, dd: m.dd };
  });

  return {
    bos:     buildStruct(bosTrades),
    choch:   buildStruct(chochTrades),
    matrix,
    overTime: null,  // Phase C: time-series requires timestamp bucketing
  };
}

// ─── Phase C1 helpers ─────────────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Parse a trade's fill/entry timestamp into a Date (UTC). Returns null if unavailable. */
function getTradeDate(t) {
  const ts = t.fill_time ?? t.fillTime ?? t.entry_time ?? t.entryTime ?? t.timestamp ?? null;
  if (!ts) return null;
  const d = new Date(typeof ts === "number" ? (ts < 1e10 ? ts * 1000 : ts) : ts);
  return isFinite(d.getTime()) ? d : null;
}

/** UTC hour (0–23) for a trade. Returns null if timestamp missing. */
function getTradeUtcHour(t) {
  const d = getTradeDate(t);
  return d ? d.getUTCHours() : null;
}

/** Short weekday label ("Mon"–"Sun") for a trade's timestamp. Returns null if missing. */
function getTradeWeekday(t) {
  const d = getTradeDate(t);
  return d ? WEEKDAYS[d.getUTCDay()] : null;
}

/**
 * Returns the UTC hour integers for a given canonical session key.
 * e.g. "London" → [7, 8, 9], "Outside" → [20, 21, 22, 23]
 */
function getSessionHours(sessionKey) {
  const def = SESSION_DEFINITIONS.find((d) => d.key === sessionKey);
  if (!def || !def.startUtc || !def.endUtc) return [];
  const [sh] = def.startUtc.split(":").map(Number);
  const [eh] = def.endUtc.split(":").map(Number);
  const hours = [];
  if (def.key === "Outside") {
    // 20:00–00:00 UTC wraps midnight → [20, 21, 22, 23]
    for (let h = sh; h < 24; h++) hours.push(h);
  } else {
    for (let h = sh; h < eh; h++) hours.push(h);
  }
  return hours;
}

// ─── Phase C1 exported adapter function ──────────────────────────────────────

/**
 * Build TimeAnalysis-shaped data for the selected session.
 *
 * Returns only session hours by default (Phase C1 scope).
 * wrHeatmap is null when insufficient day×hour combinations exist.
 *
 * @param {object[]} sessionTrades     — pre-filtered to one session
 * @param {string}   selectedSessionKey — canonical session key (e.g. "London")
 * @returns {{ hourlyData, dayOfWeek, wrHeatmap, mode: "real" }}
 */
export function buildTimeAnalysisData(sessionTrades, selectedSessionKey) {
  const empty = { hourlyData: [], dayOfWeek: [], wrHeatmap: null, mode: "real" };
  if (!sessionTrades || sessionTrades.length === 0) return empty;

  const sessionHours = getSessionHours(selectedSessionKey);
  if (sessionHours.length === 0) return empty;

  // ── hourlyData ─────────────────────────────────────────────────────────────
  const hourBuckets = new Map();
  for (const h of sessionHours) hourBuckets.set(h, []);
  for (const t of sessionTrades) {
    const h = getTradeUtcHour(t);
    if (h != null && hourBuckets.has(h)) hourBuckets.get(h).push(t);
  }

  const hourlyData = sessionHours.map((h) => {
    const trades = hourBuckets.get(h);
    const label  = `${String(h).padStart(2, "0")}:00`;
    if (!trades || !trades.length) {
      return { hour: label, trades: 0, netR: 0, wr: 0, pf: "—", avgR: 0, loss: 0 };
    }
    const m = computeSideMetrics(trades);
    return {
      hour:   label,
      trades: m.trades,
      netR:   m.netR,
      wr:     m.wr,
      pf:     m.pf != null ? m.pf : "∞",
      avgR:   m.expectancy,
      loss:   m.trades > 0 ? Number(((m.losses / m.trades) * 100).toFixed(1)) : 0,
    };
  });

  // ── dayOfWeek ──────────────────────────────────────────────────────────────
  const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayBuckets = {};
  for (const day of ALL_DAYS) dayBuckets[day] = [];
  for (const t of sessionTrades) {
    const day = getTradeWeekday(t);
    if (day && Object.prototype.hasOwnProperty.call(dayBuckets, day)) {
      dayBuckets[day].push(t);
    }
  }
  const dayOfWeek = ALL_DAYS
    .filter((day) => dayBuckets[day].length > 0)
    .map((day) => ({
      day,
      netR: Number(dayBuckets[day].reduce((s, t) => s + getR(t), 0).toFixed(2)),
    }));

  // ── wrHeatmap ──────────────────────────────────────────────────────────────
  const heatDays  = ALL_DAYS.filter((day) => dayBuckets[day].length > 0);
  const heatHours = sessionHours.map((h) => `${String(h).padStart(2, "0")}:00`);

  let hasHeatData = false;
  const heatRows = heatDays.map((day) => {
    const values = sessionHours.map((h) => {
      const trades = (dayBuckets[day] || []).filter((t) => getTradeUtcHour(t) === h);
      if (!trades.length) return null;
      const wins    = trades.filter(isWin).length;
      const decided = trades.filter((t) => isWin(t) || isLoss(t)).length;
      if (decided === 0) return null;
      hasHeatData = true;
      return Math.round((wins / decided) * 100);
    });
    return { day, values };
  });

  const wrHeatmap = hasHeatData ? { hours: heatHours, rows: heatRows } : null;

  return { hourlyData, dayOfWeek, wrHeatmap, mode: "real" };
}

// ─── Phase C2 helpers ─────────────────────────────────────────────────────────

/** Raw entry model key from a trade (multiple possible field names). */
function getRawEntryModelKey(t) {
  return t.entry_model_key || t.entry_model || t.entryFamily || t.entryModel || "";
}

/**
 * Maps a raw entry model key to a display name compatible with mock ENTRY_MODELS names.
 *
 * Examples:
 *   "entry_triggered_edge_25p0_same" → "TE Same"
 *   "entry_penetration_10p0"         → "Penetration 10%"
 *   ""                               → "Baseline"
 */
function getEntryModelDisplayName(key) {
  if (!key) return "Baseline";
  const k = String(key).toLowerCase().replace(/[\s-]+/g, "_").trim();
  if (k === "baseline" || k === "") return "Baseline";
  const penMatch = k.match(/penetration_?(\d+)/);
  if (penMatch) return `Penetration ${penMatch[1]}%`;
  if (k === "penetration") return "Penetration";
  if (k.includes("triggered") || k.includes("te_") || k.startsWith("te")) {
    if (k.endsWith("_same") || k.endsWith("same")) return "TE Same";
    if (k.endsWith("_next") || k.endsWith("next")) return "TE Next";
    const dMatch = k.match(/_d(\d+)$/);
    if (dMatch) return `TE Delay +${dMatch[1]}`;
    return "Triggered Edge";
  }
  return String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Trigger delay bucket label for a trade. */
function getDelayBucket(t) {
  const raw = t.fill_delay_candles ?? t.fillDelayCandles ?? t.trigger_delay ?? null;
  const n   = raw != null ? Number(raw) : null;
  if (n == null || n === 0) return "Same Candle";
  if (n === 1) return "Next Candle";
  if (n === 2) return "Delay +2";
  if (n === 3) return "Delay +3";
  return `Delay +${n}`;
}

/** Build one directional side for an ENTRY_MODELS-compatible row. */
function buildDirectionalSide(trades) {
  if (!trades.length) return { trades: 0, netR: 0, wr: 0, pf: null, exp: 0 };
  const m = computeSideMetrics(trades);
  return { trades: m.trades, netR: m.netR, wr: m.wr, pf: m.pf, exp: m.expectancy };
}

// ─── Phase C2 exported adapter function ──────────────────────────────────────

/**
 * Build EntryModelLab-shaped data for the selected session.
 *
 * Row shape is mock-compatible: { name, long: { trades, netR, wr, pf, exp }, short: { ... } }
 *
 * @param {object[]} sessionTrades — pre-filtered to one session
 * @returns {{ entryModels, bestModel, delayBreakdown, mode: "real" }}
 */
export function buildEntryModelLabData(sessionTrades) {
  const empty = { entryModels: [], bestModel: null, delayBreakdown: [], mode: "real" };
  if (!sessionTrades || sessionTrades.length === 0) return empty;

  // ── Entry models grouped by display name ──────────────────────────────────
  const modelMap = new Map();
  for (const t of sessionTrades) {
    const name = getEntryModelDisplayName(getRawEntryModelKey(t));
    if (!modelMap.has(name)) modelMap.set(name, []);
    modelMap.get(name).push(t);
  }

  const entryModels = [...modelMap.entries()].map(([name, trades]) => ({
    name,
    long:  buildDirectionalSide(trades.filter((t) => normalizeDirection(t) === "Long")),
    short: buildDirectionalSide(trades.filter((t) => normalizeDirection(t) === "Short")),
  }));

  // Sort by combined net R descending
  entryModels.sort((a, b) => (b.long.netR + b.short.netR) - (a.long.netR + a.short.netR));

  const bestModel = entryModels.length > 0 ? entryModels[0] : null;

  // ── Delay breakdown ───────────────────────────────────────────────────────
  const delayMap = new Map();
  for (const t of sessionTrades) {
    const bucket = getDelayBucket(t);
    if (!delayMap.has(bucket)) delayMap.set(bucket, []);
    delayMap.get(bucket).push(t);
  }
  const DELAY_ORDER = ["Same Candle", "Next Candle", "Delay +2", "Delay +3"];
  const delayBreakdown = DELAY_ORDER
    .filter((b) => delayMap.has(b))
    .map((bucket) => {
      const m = computeSideMetrics(delayMap.get(bucket));
      return { bucket, trades: m.trades, netR: m.netR, wr: m.wr, pf: m.pf };
    });

  return { entryModels, bestModel, delayBreakdown, mode: "real" };
}
