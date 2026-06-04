/**
 * sessionLabV1Adapter.js — Pure adapter layer for Session Lab V1.
 *
 * Converts real app trade data into the same shapes used by mockData.js so
 * that V1 prototype components need zero internal changes.
 *
 * All three functions are side-effect-free and safe inside useMemo.
 *
 * DO NOT add React imports or side effects here.
 */

import {
  computeSessionMetrics,
  buildSessionProfiles,
  buildSessionEquityCurve,
  buildCardSnapshot,
  resolveSession,
  normalizeDirection,
  normalizeStructure,
  getR,
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
