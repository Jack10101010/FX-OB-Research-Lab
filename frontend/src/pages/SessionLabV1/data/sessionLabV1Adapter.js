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
  buildSessionOBProfile,
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

import {
  classifyTrade,
  displayCancelReason,
  EXCLUDED_CATEGORIES,
} from "../../../data/tradeClassification";

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

// ─── Phase C2: OB Lab ─────────────────────────────────────────────────────────

/** True when a trade has a decided performance outcome (win or loss). */
function isPerformanceTrade(t) {
  return isWin(t) || isLoss(t);
}

/**
 * Build OB analytics for the OrderBlockLab tab.
 * Delegates to buildSessionOBProfile for origin/detection/width/news data.
 * OB age is approximated from bars_to_fill.
 *
 * @param {object[]} sessionTrades - pre-filtered to one session
 * @returns {object|null}
 */
export function buildOrderBlockLabData(sessionTrades) {
  if (!Array.isArray(sessionTrades) || sessionTrades.length === 0) return null;

  const profile = buildSessionOBProfile(sessionTrades);
  const { obFieldAvailable, hasWidth, hasNews, originRows, detectionRows, widthRows, news, clean } = profile;

  // ── Origin rows → HBars shape ───────────────────────────────────────────────
  const origin = originRows
    .filter((r) => r.count > 0)
    .map((r) => ({ session: r.label, netR: r.netR }))
    .sort((a, b) => b.netR - a.netR);

  // ── Detection rows → HBars shape ────────────────────────────────────────────
  const detection = detectionRows
    .filter((r) => r.count > 0)
    .map((r) => ({ session: r.label, netR: r.netR }))
    .sort((a, b) => b.netR - a.netR);

  // ── Width rows → BucketTable shape ──────────────────────────────────────────
  const totalWidthTrades = widthRows.reduce((s, r) => s + r.count, 0) || 1;
  const width = widthRows
    .filter((r) => r.label !== "Unknown" && r.count > 0)
    .map((r) => ({
      bucket: r.label,
      trades: r.count,
      pct: Number(((r.count / totalWidthTrades) * 100).toFixed(1)),
      netR: r.netR,
    }));

  // ── OB Age (bars_to_fill proxy) → BucketTable shape ─────────────────────────
  const AGE_ORDER = ["0–4 bars", "5–10 bars", "11–20 bars", "> 20 bars"];
  const hasAge = sessionTrades.some((t) => t.bars_to_fill != null);
  const ageMap = new Map();

  for (const t of sessionTrades) {
    const raw = t.bars_to_fill;
    if (raw == null) continue;
    const n = Number(raw);
    let bucket;
    if (n <= 4)       bucket = "0–4 bars";
    else if (n <= 10) bucket = "5–10 bars";
    else if (n <= 20) bucket = "11–20 bars";
    else              bucket = "> 20 bars";
    if (!ageMap.has(bucket)) ageMap.set(bucket, []);
    ageMap.get(bucket).push(t);
  }

  const totalAgeTrades = Array.from(ageMap.values()).reduce((s, a) => s + a.length, 0) || 1;
  const age = AGE_ORDER
    .filter((b) => ageMap.has(b))
    .map((b) => {
      const arr = ageMap.get(b);
      const netR = Number(arr.reduce((s, t) => s + getR(t), 0).toFixed(2));
      return {
        bucket: b,
        trades: arr.length,
        pct:    Number(((arr.length / totalAgeTrades) * 100).toFixed(1)),
        netR,
      };
    });

  // ── News vs Clean donut ──────────────────────────────────────────────────────
  const newsClean = [
    { name: "News OB",  value: news.count,  color: "#F59E0B" },
    { name: "Clean OB", value: clean.count, color: "#22C55E" },
  ].filter((d) => d.value > 0);
  const totalOBs = news.count + clean.count;

  // ── Meta stats ───────────────────────────────────────────────────────────────
  const widthValues = sessionTrades
    .map((t) => Number(t.obWidthPips ?? t.ob_width_pips))
    .filter((v) => Number.isFinite(v) && v > 0);
  const avgWidthNum = widthValues.length > 0
    ? widthValues.reduce((s, v) => s + v, 0) / widthValues.length
    : null;
  const avgWidth = avgWidthNum != null ? `${avgWidthNum.toFixed(1)}p` : "—";

  const decidedTrades = sessionTrades.filter(isPerformanceTrade);
  const winCount = decidedTrades.filter(isWin).length;
  const successRate = decidedTrades.length > 0
    ? `${((winCount / decidedTrades.length) * 100).toFixed(1)}%`
    : "—";

  const meta = { avgWidth, fillRate: "—", successRate };

  // ── Success rate by OB type ──────────────────────────────────────────────────
  function typeWR(filterFn) {
    const slice   = sessionTrades.filter(filterFn);
    const decided = slice.filter(isPerformanceTrade);
    if (decided.length < 2) return null;
    const wins = decided.filter(isWin).length;
    return Number(((wins / decided.length) * 100).toFixed(0));
  }

  const SUCCESS_TYPES = [
    {
      name: "BOS OB",
      color: "#3B82F6",
      wr: typeWR((t) => String(t.structure || t.structure_type || "").toUpperCase() === "BOS"),
    },
    {
      name: "CHoCH OB",
      color: "#A855F7",
      wr: typeWR((t) => String(t.structure || t.structure_type || "").toUpperCase() === "CHOCH"),
    },
    {
      name: "News OB",
      color: "#F59E0B",
      wr: typeWR((t) => t.obCreatedDuringNews === true || t.ob_created_during_news === true || t.ob_origin_news_window === true),
    },
    {
      name: "Wide OB",
      color: "#EF4444",
      wr: typeWR((t) => Number(t.obWidthPips ?? t.ob_width_pips) >= 15),
    },
    {
      name: "Old OB",
      color: "#94A3B8",
      wr: typeWR((t) => Number(t.bars_to_fill) > 10),
    },
  ];
  const successByType = SUCCESS_TYPES.filter((r) => r.wr != null);

  return {
    obFieldAvailable,
    hasWidth,
    hasNews,
    hasAge,
    origin,
    detection,
    width,
    age,
    newsClean,
    totalOBs,
    meta,
    successByType,
  };
}

// ─── Phase C3: Failure Analysis ───────────────────────────────────────────────

/**
 * Build an 8-point sparkline from a trade array.
 * Computes running cumulative R, samples n evenly-spaced points.
 * Empty array → [0, 0, 0, 0, 0, 0, 0, 0].
 */
function buildSparkline(trades, n = 8) {
  if (!trades.length) return Array(n).fill(0);
  // Build full cumulative R array
  const cum = [];
  let running = 0;
  for (const t of trades) {
    running += getR(t);
    cum.push(Number(running.toFixed(2)));
  }
  if (cum.length <= n) {
    // Pad end with final value
    const last = cum[cum.length - 1];
    while (cum.length < n) cum.push(last);
    return cum;
  }
  // Sample n evenly-spaced indices
  const result = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i / (n - 1)) * (cum.length - 1));
    result.push(cum[idx]);
  }
  return result;
}

/**
 * Extract HH:MM UTC label from an entry/fill time string.
 * Handles ISO datetimes ("2024-01-15T08:30:00Z") and bare time strings ("08:30").
 */
function parseTimeLabel(entryStr) {
  if (!entryStr) return "—";
  const s = String(entryStr).trim();
  if (!s) return "—";
  let hhmm;
  if (s.includes("T")) {
    // ISO datetime — extract chars after T
    const after = s.slice(s.indexOf("T") + 1);
    hhmm = after.slice(0, 5); // "HH:MM"
  } else {
    hhmm = s.slice(0, 5);
  }
  // Validate looks like HH:MM
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return "—";
  return `${hhmm} UTC`;
}

/**
 * Find the worst consecutive-loss streak in session trades (≥ 2 losses).
 * "Worst" = deepest (most negative) cumulative R.
 * Tie-breaker: longer streak.
 * Returns the array of trades in the worst streak, or [] if none qualifies.
 */
function findWorstCluster(sessionTrades) {
  let bestStreak = [];
  let bestNetR   = 0;

  let current = [];
  for (const t of sessionTrades) {
    if (isLoss(t)) {
      current.push(t);
    } else {
      if (current.length >= 2) {
        const cNetR = current.reduce((s, x) => s + getR(x), 0);
        if (
          cNetR < bestNetR ||
          (cNetR === bestNetR && current.length > bestStreak.length)
        ) {
          bestStreak = current;
          bestNetR   = cNetR;
        }
      }
      current = [];
    }
  }
  // Check tail
  if (current.length >= 2) {
    const cNetR = current.reduce((s, x) => s + getR(x), 0);
    if (
      cNetR < bestNetR ||
      (cNetR === bestNetR && current.length > bestStreak.length)
    ) {
      bestStreak = current;
    }
  }
  return bestStreak;
}

/**
 * Build a single failure card object from a matched trade slice.
 */
function buildFailureCard(name, matchingTrades, totalCount) {
  const count = matchingTrades.length;
  const pct   = totalCount > 0 ? Number(((count / totalCount) * 100).toFixed(1)) : 0;
  const netR  = Number(matchingTrades.reduce((s, t) => s + getR(t), 0).toFixed(2));
  const spark = buildSparkline(matchingTrades);
  return { name, count, pct, netR, spark };
}

/**
 * Normalize a cancel_reason string to ALL_CAPS_UNDERSCORE for comparison.
 */
function normReason(raw) {
  return String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/**
 * Build failure analytics for the FailureAnalysis tab.
 * Returns null for empty input.
 *
 * @param {object[]} sessionTrades - pre-filtered to one session
 * @returns {object|null}
 */
export function buildFailureAnalysisData(sessionTrades) {
  if (!Array.isArray(sessionTrades) || sessionTrades.length === 0) return null;

  const total      = sessionTrades.length;
  const lossTrades = sessionTrades.filter(isLoss);

  const hasWidthData = sessionTrades.some((t) => t.obWidthPips != null || t.ob_width_pips != null);
  const hasNewsData  = sessionTrades.some((t) => t.obCreatedDuringNews != null || t.ob_origin_news_window != null);
  const hasMinsExit  = sessionTrades.some((t) => t.minutes_to_exit != null || t.minutesToExit != null);

  // ── Failure cards ────────────────────────────────────────────────────────────
  const failureCards = [];

  // 1. Fast Stopouts — losses under 30 minutes (only when field available)
  if (hasMinsExit) {
    const fast = lossTrades.filter((t) => {
      const m = t.minutes_to_exit ?? t.minutesToExit ?? null;
      return m != null && Number(m) < 30;
    });
    if (fast.length > 0) {
      failureCards.push(buildFailureCard("Fast Stopouts", fast, total));
    }
  }

  // 2. First Failed Tag — tapped before trigger or first_failed_tag cancel reason
  const firstFailed = sessionTrades.filter((t) => {
    if (t.tappedBeforeTrigger === true || t.tapped_before_trigger === true) return true;
    const r = normReason(t.cancel_reason || t.cancelReason);
    return r === "FIRST_FAILED_TAG";
  });
  if (firstFailed.length > 0) {
    failureCards.push(buildFailureCard("First Failed Tag", firstFailed, total));
  }

  // 3. OB Too Wide — losses where width >= 15 pips (only when field available)
  if (hasWidthData) {
    const wide = lossTrades.filter((t) => Number(t.obWidthPips ?? t.ob_width_pips) >= 15);
    if (wide.length > 0) {
      failureCards.push(buildFailureCard("OB Too Wide", wide, total));
    }
  }

  // 4. News-Origin OB — losses on news-created OBs (only when field available)
  if (hasNewsData) {
    const newsLosses = lossTrades.filter(
      (t) => t.obCreatedDuringNews === true || t.ob_created_during_news === true || t.ob_origin_news_window === true,
    );
    if (newsLosses.length > 0) {
      failureCards.push(buildFailureCard("News-Origin OB", newsLosses, total));
    }
  }

  // 5. Cancelled Pre-Entry — always shown (zero count is meaningful)
  const cancelled = sessionTrades.filter((t) => classifyTrade(t) === "INVALID_CANCELLED");
  failureCards.push(buildFailureCard("Cancelled Pre-Entry", cancelled, total));

  // 6. Session Expiry — only shown when present
  const sessionExpiry = sessionTrades.filter((t) => classifyTrade(t) === "SESSION_FILTERED");
  if (sessionExpiry.length > 0) {
    failureCards.push(buildFailureCard("Session Expiry", sessionExpiry, total));
  }

  // ── Cancellation Reasons ─────────────────────────────────────────────────────
  const excludedTrades = sessionTrades.filter((t) => EXCLUDED_CATEGORIES.has(classifyTrade(t)));
  const reasonMap = new Map();

  for (const t of excludedTrades) {
    const raw = t.cancel_reason || t.cancelReason || "";
    let label;
    if (raw) {
      label = displayCancelReason(raw);
    } else {
      const cat = classifyTrade(t);
      if (cat === "SESSION_FILTERED") label = "Session Filter Cancel";
      else if (cat === "NEWS_CANCELLED") label = "News Touch Cancel";
      else label = "Other";
    }
    if (!reasonMap.has(label)) reasonMap.set(label, []);
    reasonMap.get(label).push(t);
  }

  const cancellationReasons = Array.from(reasonMap.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, trades]) => ({
      name,
      pct:  Number(((trades.length / total) * 100).toFixed(1)),
      netR: Number(trades.reduce((s, t) => s + getR(t), 0).toFixed(2)),
    }));

  // ── Worst cluster ────────────────────────────────────────────────────────────
  const clusterTrades = findWorstCluster(sessionTrades);
  let worstCluster = null;

  if (clusterTrades.length >= 2) {
    const first    = clusterTrades[0];
    const last     = clusterTrades[clusterTrades.length - 1];
    const clusterR = Number(clusterTrades.reduce((s, t) => s + getR(t), 0).toFixed(2));

    const firstTime = parseTimeLabel(first.entry || first.fill_time || first.fillTime || "");
    const lastTime  = parseTimeLabel(last.entry  || last.fill_time  || last.fillTime  || "");
    const window    = firstTime !== "—" && lastTime !== "—" ? `${firstTime} – ${lastTime}` : "—";

    function mode(arr) {
      if (!arr.length) return null;
      const freq = {};
      for (const v of arr) freq[v] = (freq[v] || 0) + 1;
      return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    }

    const dirs    = clusterTrades.map((t) => normalizeDirection(t)).filter((v) => v !== "Unknown");
    const structs = clusterTrades.map((t) => normalizeStructure(t)).filter((v) => v !== "Unknown");
    const entries = clusterTrades
      .map((t) => t.entryModel || t.entry_model_key || t.entry_model || "")
      .filter(Boolean);

    const causeParts = [mode(dirs), mode(structs), mode(entries)].filter(Boolean);
    const cause = causeParts.length > 0 ? causeParts.join(" / ") : "—";

    worstCluster = {
      losses: clusterTrades.length,
      window,
      netR:   clusterR,
      trades: clusterTrades.length,
      cause,
      spark:  buildSparkline(clusterTrades),
    };
  }

  return { failureCards, cancellationReasons, worstCluster };
}

// ─── Phase C4: Impact On Run ──────────────────────────────────────────────────

/**
 * Compute run-level KPIs for an arbitrary trade slice.
 * Returns the flat shape expected by ImpactCard.
 */
function computeScenarioMetrics(trades) {
  if (!trades.length) return { netR: 0, trades: 0, wr: 0, pf: "—", dd: 0 };

  const wins    = trades.filter(isWin).length;
  const losses  = trades.filter(isLoss).length;
  const decided = wins + losses;
  const netR    = Number(trades.reduce((s, t) => s + getR(t), 0).toFixed(2));

  const grossWin  = trades.filter((t) => getR(t) > 0).reduce((s, t) => s + getR(t),             0);
  const grossLoss = trades.filter((t) => getR(t) < 0).reduce((s, t) => s + Math.abs(getR(t)), 0);

  let peak = 0, cum = 0, maxDD = 0;
  for (const t of trades) {
    cum += getR(t);
    if (cum > peak) peak = cum;
    const dd = cum - peak;
    if (dd < maxDD) maxDD = dd;
  }

  const wr = decided > 0 ? Number(((wins / decided) * 100).toFixed(1)) : 0;
  const pf = grossLoss > 0
    ? Number((grossWin / grossLoss).toFixed(2))
    : grossWin > 0 ? "∞" : "—";
  const dd = Number(maxDD.toFixed(2));

  return { netR, trades: trades.length, wr, pf, dd };
}

/**
 * Compute per-field deltas between a scenario and the baseline.
 * Handles "∞" / "—" PF edge cases to match ImpactCard's existing display logic.
 */
function computeImpactDeltas(scenario, baseline) {
  const netR   = Number((scenario.netR - baseline.netR).toFixed(1));
  const trades = scenario.trades - baseline.trades;
  const wr     = Number((scenario.wr   - baseline.wr).toFixed(1));
  const dd     = Number((scenario.dd   - baseline.dd).toFixed(2));

  let pf;
  if (typeof scenario.pf !== "number") {
    // scenario.pf is "∞" or "—"
    pf = scenario.pf === "∞" ? "+∞" : "—";
  } else if (typeof baseline.pf !== "number") {
    // baseline is "∞" or "—" — indeterminate
    pf = "—";
  } else {
    pf = Number((scenario.pf - baseline.pf).toFixed(2));
  }

  return { netR, trades, wr, pf, dd };
}

/**
 * Build three what-if impact scenarios for the selected session.
 * Denominator: allRunTrades (unfiltered primary result view).
 *
 * @param {string}   canonicalSessionKey  e.g. "London", "New York"
 * @param {object[]} allRunTrades         full primary result view trade array
 * @returns {object[]|null}
 */
export function buildImpactOnRunData(canonicalSessionKey, allRunTrades) {
  if (!canonicalSessionKey || !Array.isArray(allRunTrades) || allRunTrades.length === 0) {
    return null;
  }

  const sessionName  = canonicalSessionKey.toUpperCase();
  const baseline     = computeScenarioMetrics(allRunTrades);
  const notInSession = (t) => resolveSession(t) !== canonicalSessionKey;

  const SCENARIOS = [
    {
      label:  `IF ${sessionName} IS DISABLED`,
      filter: (t) => notInSession(t),
    },
    {
      label:  `IF ONLY LONGS ARE USED (IN ${sessionName})`,
      filter: (t) => notInSession(t) || normalizeDirection(t) === "Long",
    },
    {
      label:  `IF ONLY BOS IS USED (IN ${sessionName})`,
      filter: (t) => notInSession(t) || normalizeStructure(t) === "BOS",
    },
  ];

  return SCENARIOS.map(({ label, filter }) => {
    const filtered = allRunTrades.filter(filter);
    const metrics  = computeScenarioMetrics(filtered);
    const deltas   = computeImpactDeltas(metrics, baseline);
    return { scenario: label, metrics, deltas };
  });
}

// ─── Phase C5: Session-scoped Visual Summary ──────────────────────────────────

/**
 * Build direction/structure/entry-model chart data scoped to the selected session.
 *
 * @param {object[]} selectedSessionTrades  trades belonging to the selected session
 * @returns {{ tradesByDirection, tradesByStructure, topEntryModel }}
 */
export function buildSessionVisualData(selectedSessionTrades) {
  if (!Array.isArray(selectedSessionTrades) || selectedSessionTrades.length === 0) {
    return { tradesByDirection: [], tradesByStructure: [], topEntryModel: [] };
  }

  const tradesByDirection = [
    {
      name:  "Long",
      value: selectedSessionTrades.filter((t) => normalizeDirection(t) === "Long").length,
      color: "#22C55E",
    },
    {
      name:  "Short",
      value: selectedSessionTrades.filter((t) => normalizeDirection(t) === "Short").length,
      color: "#EF4444",
    },
  ];

  const tradesByStructure = [
    {
      name:  "BOS",
      value: selectedSessionTrades.filter((t) => normalizeStructure(t) === "BOS").length,
      color: "#3B82F6",
    },
    {
      name:  "CHoCH",
      value: selectedSessionTrades.filter((t) => normalizeStructure(t) === "CHoCH").length,
      color: "#A855F7",
    },
  ];

  const modelMap = new Map();
  for (const t of selectedSessionTrades) {
    const label = entryModelDef ? entryModelDef.getLabel(t) : "Baseline";
    modelMap.set(label, (modelMap.get(label) ?? 0) + getR(t));
  }

  const topEntryModel = [...modelMap.entries()]
    .map(([name, netR]) => ({ name, netR: Number(netR.toFixed(2)) }))
    .sort((a, b) => b.netR - a.netR)
    .slice(0, 8);

  return { tradesByDirection, tradesByStructure, topEntryModel };
}

// ─── Phase C8: Streaks Lab ────────────────────────────────────────────────────

/** Format a Date as "HH:MM UTC". */
function formatUTCTime(date) {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m} UTC`;
}

/** Determine exit label for a trade. */
function getExitLabel(t) {
  if (isWin(t)) return "Target Hit";
  const mins = t.minutes_to_exit ?? t.minutesToExit ?? null;
  if (isLoss(t) && mins != null && Number(mins) < 30) return "Fast Stopout (<30m)";
  if (isLoss(t)) return "Stop Loss";
  return "Other";
}

/**
 * Build a list of consecutive streak runs from a decided sequence.
 * Returns [{ outcome, length, netR, trades }]
 */
function buildRuns(decidedSeq) {
  if (!decidedSeq.length) return [];
  const runs = [];
  let cur = { outcome: decidedSeq[0].outcome, length: 1, netR: decidedSeq[0].r, trades: [decidedSeq[0].trade] };
  for (let i = 1; i < decidedSeq.length; i++) {
    const s = decidedSeq[i];
    if (s.outcome === cur.outcome) {
      cur.length++;
      cur.netR += s.r;
      cur.trades.push(s.trade);
    } else {
      runs.push(cur);
      cur = { outcome: s.outcome, length: 1, netR: s.r, trades: [s.trade] };
    }
  }
  runs.push(cur);
  return runs;
}

/**
 * Build StreaksLab-shaped data for the selected session.
 *
 * @param {object[]} sessionTrades — pre-filtered to one session
 * @returns {{ wlSequence, streakSummary, streakDistribution, mode: "real" }}
 */
export function buildStreaksData(sessionTrades) {
  const empty = { wlSequence: [], streakSummary: null, streakDistribution: [], mode: "real" };
  if (!Array.isArray(sessionTrades) || sessionTrades.length === 0) return empty;

  // ── wlSequence — all trades in order ─────────────────────────────────────
  const wlSequence = sessionTrades.map((t, idx) => {
    const date = getTradeDate(t);
    return {
      id:        `Trade #${idx + 1}`,
      result:    getR(t),
      session:   resolveSession(t),
      direction: normalizeDirection(t),
      structure: normalizeStructure(t),
      entry:     getEntryModelDisplayName(getRawEntryModelKey(t)),
      delay:     getDelayBucket(t),
      exitLabel: getExitLabel(t),
      time:      date ? formatUTCTime(date) : "—",
    };
  });

  // ── Decided sequence (W/L only) ───────────────────────────────────────────
  const decidedSeq = sessionTrades
    .filter((t) => isWin(t) || isLoss(t))
    .map((t) => ({ outcome: isWin(t) ? "W" : "L", r: getR(t), trade: t }));

  if (decidedSeq.length === 0) {
    return { wlSequence, streakSummary: null, streakDistribution: [], mode: "real" };
  }

  const runs = buildRuns(decidedSeq);
  const wRuns = runs.filter((r) => r.outcome === "W");
  const lRuns = runs.filter((r) => r.outcome === "L");

  // ── Longest streaks ───────────────────────────────────────────────────────
  const maxWLen = wRuns.length > 0 ? Math.max(...wRuns.map((r) => r.length)) : 0;
  const maxLLen = lRuns.length > 0 ? Math.max(...lRuns.map((r) => r.length)) : 0;

  // Ties: W tie → highest netR; L tie → lowest netR
  const longestWRun = wRuns.filter((r) => r.length === maxWLen)
    .sort((a, b) => b.netR - a.netR)[0] ?? null;
  const longestLRun = lRuns.filter((r) => r.length === maxLLen)
    .sort((a, b) => a.netR - b.netR)[0] ?? null;

  // avgWin = average W run length (1dp)
  const avgWin = wRuns.length > 0
    ? Number((wRuns.reduce((s, r) => s + r.length, 0) / wRuns.length).toFixed(1))
    : 0;

  // maxLossR = most negative netR among L runs
  const maxLossR = lRuns.length > 0
    ? Number(Math.min(...lRuns.map((r) => r.netR)).toFixed(2))
    : 0;

  // ── Runs test (Wald-Wolfowitz) ────────────────────────────────────────────
  const n  = decidedSeq.length;
  const n1 = wRuns.reduce((s, r) => s + r.length, 0);   // total wins
  const n2 = lRuns.reduce((s, r) => s + r.length, 0);   // total losses
  const R  = runs.length;

  let zScore = 0;
  let pValue = 1;
  let verdict = "INSUFFICIENT";

  if (n1 > 0 && n2 > 0 && n >= 2) {
    const E        = (2 * n1 * n2 / n) + 1;
    const variance = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
    const sigma    = Math.sqrt(Math.max(variance, 0));
    const z        = sigma > 0 ? (R - E) / sigma : 0;
    const absZ     = Math.abs(z);

    zScore = Number(z.toFixed(2));
    pValue = absZ < 1.0  ? 0.32
           : absZ < 1.28 ? 0.20
           : absZ < 1.44 ? 0.15
           : absZ < 1.65 ? 0.10
           : absZ < 1.96 ? 0.05
           :               0.01;
    verdict = absZ > 1.96 ? "NOT RANDOM" : "RANDOM";
  }

  // ── Streak distribution ───────────────────────────────────────────────────
  const BUCKETS = [1, 2, 3, 4];
  const distMap  = { 1: { w: 0, l: 0 }, 2: { w: 0, l: 0 }, 3: { w: 0, l: 0 }, 4: { w: 0, l: 0 }, "5+": { w: 0, l: 0 } };
  for (const run of runs) {
    const key = run.length >= 5 ? "5+" : run.length;
    if (run.outcome === "W") distMap[key].w++;
    else                     distMap[key].l++;
  }

  const hasFivePlus = distMap["5+"].w > 0 || distMap["5+"].l > 0;
  const streakDistribution = [
    ...BUCKETS.map((len) => ({ len, wins: distMap[len].w, losses: distMap[len].l })),
    ...(hasFivePlus ? [{ len: "5+", wins: distMap["5+"].w, losses: distMap["5+"].l }] : []),
  ];

  const streakSummary = {
    longestWin:  maxWLen,
    longestLoss: maxLLen,
    avgWin,
    maxLossR,
    netRWin:  longestWRun ? Number(longestWRun.netR.toFixed(2)) : 0,
    netRLoss: longestLRun ? Number(longestLRun.netR.toFixed(2)) : 0,
    zScore,
    pValue,
    verdict,
  };

  return { wlSequence, streakSummary, streakDistribution, mode: "real" };
}
