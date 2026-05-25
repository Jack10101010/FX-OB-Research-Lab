# Design Plan — Configuration & Order Block Stats Panels
**Scope:** RunDetail.jsx · Configuration section · Order Block Stats section  
**Mode:** Audit / Design only — no implementation changes  
**Date:** 2026-05-25

---

## 1. Current Data Availability

### 1.1 Configuration fields — what is actually available today

The panel at RunDetail.jsx:559-582 renders 13 hardcoded key/value rows from the
`run` summary object. The actual fields populated by the importer and available
on `run` / `runData.summary` / `runData.config` are:

| Field | Source object | Available in summary? | Notes |
|---|---|---|---|
| `symbol` | summary / config | ✅ | |
| `detectionTf` | summary (`detection_tf`) | ✅ | |
| `executionTf` | summary (`execution_tf`) | ✅ | |
| `dateRange` | summary (`date_from` + `date_to`) | ✅ | |
| `rr` | summary (`rr_multiple`) | ✅ | |
| `stopBuffer` | summary (`stop_buffer`) | ✅ | |
| `entryBuffer` | summary (`entry_buffer`) | ✅ | |
| `verifyTicks` | summary (`verify_ticks`) | ✅ | |
| `executionMode` / `primaryVariant` | summary | ✅ | |
| `reverseCancels` | summary | ✅ | |
| `news_blackout_enabled` | summary + config | ✅ | Already in runSummary |
| `news_events_matched` | summary | ✅ | |
| `news_windows_created` | summary | ✅ | |
| `news_blackout_skipped` | summary | ✅ | |
| `news_pending_paused` | summary | ✅ | |
| `news_touch_cancelled` | summary | ✅ | |
| `news_fills_blocked` | summary | ✅ | |
| `news_active_trades_flattened` | summary | ✅ | |
| `news_flattened_r` | summary | ✅ | |
| `news_flatten_late_count` | summary | ✅ | |
| `trade_direction` | raw `config` only | ⚠️ Raw config only | `runData.config.trade_direction` |
| `session_filter_enabled` | raw `config` only | ⚠️ Raw config only | `runData.config.session_filter_enabled` |
| `allowed_sessions` | raw `config` only | ⚠️ Raw config only | `runData.config.allowed_sessions` (array) |
| `ob_entry_depth_pct` (config-level) | raw `config` only | ⚠️ Raw config only | Per-trade field exists on trades; config param is separate |
| `news_blackout_before_minutes` | raw `config` only | ⚠️ Raw config only | |
| `news_blackout_after_minutes` | raw `config` only | ⚠️ Raw config only | |
| `news_blackout_impacts` | raw `config` only | ⚠️ Raw config only | |
| `news_blackout_currencies` | raw `config` only | ⚠️ Raw config only | |
| `news_pause_pending` | raw `config` only | ⚠️ Raw config only | |
| `news_cancel_if_touched` | raw `config` only | ⚠️ Raw config only | |
| `news_flatten_active_trades` | raw `config` only | ⚠️ Raw config only | |
| `news_flatten_minutes_before` | raw `config` only | ⚠️ Raw config only | |
| `pip_size` | summary + config | ✅ | Used internally by enrichment |

**Key finding:** `runData.config` (the raw JSON object) is already accessible in
RunDetail via `runData?.config`. All ⚠️ fields above exist in that raw object — they
just need to be read directly from it. No backend changes are required to surface
them in the UI. They were simply never forwarded into `runSummary` by the importer
(which only pulls a narrow subset into the normalised summary).

The panel currently also hardcodes `"Structure: Both"` and `"Direction: Both"` —
these should be replaced with actual values from `runData.config.structure_type`
and `runData.config.trade_direction`.

---

### 1.2 Order Block fields — what is available today

**From `parseOrderBlocksCSV` (importer.js:192-219) — per OB record:**

| Field | CSV column(s) | Notes |
|---|---|---|
| `id` | `id`, `ob_id` | |
| `top` / `bot` | `top`/`high`, `bot`/`bottom`/`low` | Price levels; width computable |
| `side` | `side`, `direction`, `type` | "bull" / "bear" |
| `originTime` | `origin_time`, `start_time` | |
| `endTime` | `end_time`, `detection_time` | |
| `obFinalStatus` | `ob_final_status` | **Lifecycle status code** — key field |
| `obFinalStatusLabel` | `ob_final_status_label` | Human-readable status |
| `linkedTradeId` | `linked_trade_id` | Direct OB→trade link |
| `fillTime` | `fill_time` | |
| `exitTime` | `exit_time` | |
| `cancelTime` | `cancel_time` | |
| `invalidationTime` | `invalidation_time` | |
| `sessionCancelTime` | `session_cancel_time` | Session filter cancel timestamp |
| `newsBlackoutTriggerTime` | `news_blackout_trigger_time` | |
| `reverseTouchTime` | `reverse_touch_time` | |
| `protectionTriggerTime` | `protection_trigger_time` | |
| `lifecycleReason` | `lifecycle_reason` | |

**From `enrichTradesWithOrderBlocks` — enriched onto trade records:**

| Field | Notes |
|---|---|
| `obId` | OB linked to this trade |
| `obTop` / `obBottom` | OB price levels |
| `obWidthPips` | Computed from top−bot / pipSize |
| `obDirection` | "Bullish" / "Bearish" |
| `obEntryDepthPct` | Entry depth into OB (%) |
| `fill_penetration_pct` / `fill_penetration_pips` | |
| `max_ob_penetration_pct` / `max_ob_penetration_pips` | |
| `ob_fully_breached` | Boolean |
| `reverseConflict` | Boolean — reverse cancel |
| `news_blackout` / `news_action` | News events on this trade |
| `missed_trade` / `missed_reason` | Missed/session-filtered |
| `blocked_session` / `session_filtered_session` | |

**From `store.js` `buildDerived` — enriched OB lifecycle (active run only):**

The store calls `deriveOBLifecycle(ob, linkedTrade, lastCandleTime)` for the active
run and exposes the result as `OB_BOXES_ENRICHED`. RunDetail does **not** currently
use this — it reads `runData?.orderBlocks` (the raw stored OBs) instead, missing
all lifecycle enrichment for the displayed run.

For non-active runs this enrichment would need to be replicated locally using
`runData.orderBlocks` + `runData.trades`.

---

## 2. Configuration Panel — Redesign Proposal

### 2.1 Current problems

- Flat 2-column mono key/value grid — 13 rows, hard to scan
- No visual grouping by meaning
- "Structure" and "Direction" are hardcoded to "Both"
- All newer strategy fields absent (trade_direction, session filter, news settings)
- No visual hierarchy: RR looks identical to Verify Ticks in weight
- No conditional sections — news protection block appears even for runs where news
  is disabled

### 2.2 Proposed layout: grouped compact cards

Replace the single grid with four stacked sub-sections, each a light-bordered card
with a section label and a compact chip row.

---

#### Group 1 — Market / Timeframe

```
[ MARKET / TIMEFRAME ]
Symbol           EURUSD
Detection TF     H1
Execution TF     M1
Date Range       18 May '25 → 18 May '26
Candle Source    Imported  (or —)
```

Fields:
- `run.symbol`
- `compactTimeframe(run.detectionTf)`
- `run.executionTf || "1m"`
- `formatRunDateRange(run.dateRange)`
- `runData?.hasCandles ? "Imported" : "—"`  (candle source)

---

#### Group 2 — Entry / Risk

Render as a 2-column chip grid with values prominently styled.

```
[ ENTRY / RISK ]
RR              3.3×
Entry Depth %   15%     (ob_entry_depth_pct from config, or median from trades)
Entry Buffer    0 pip
Stop Buffer     1.0 pip
Verify Ticks    3
Execution       Single position
Position Conflict  —    (if available from config)
```

Fields:
- `run.rr`
- `runData?.config?.ob_entry_depth_pct` (config setting) — fallback: compute median
  of `trade.ob_entry_depth_pct` across trades if config field absent
- `run.entryBuffer`
- `run.stopBuffer`
- `run.verifyTicks`
- `run.executionMode` (formatted via `variantLabel`)
- `runData?.config?.position_conflict_mode || "—"`

---

#### Group 3 — Filters

Only render rows that have a non-null, non-default value; show `—` otherwise.

```
[ FILTERS ]
Trade Direction    Both       (or Long / Short)
Structure Type     Both       (or BOS / CHoCH)
Session Filter     ✅ Enabled  (or ❌ Off)
Allowed Sessions   London · New York · Asia  (chips per session)
```

Fields:
- `runData?.config?.trade_direction || "Both"`
- `runData?.config?.structure_type || "Both"`
- `runData?.config?.session_filter_enabled` → boolean chip (enabled/off)
- `runData?.config?.allowed_sessions` → array of session name chips (or "—")

---

#### Group 4 — News Protection

**Conditionally rendered**: only show this group if `run.news_blackout_enabled`
is truthy OR `runData?.config?.news_blackout_enabled` is truthy. If both are
falsy, render a single dim "News protection: Off" line at the bottom of Group 3.

```
[ NEWS PROTECTION ]
Blackout Window    −30 min → +15 min
Impacts            High · Medium
Currencies         USD · EUR · GBP
Pause Pending      Yes
Cancel if Touched  Yes
Flatten Active     Yes
Flatten Lead Time  10 min before blackout

Events Matched        42
Windows Created        18
Trades Touch-Cancelled  3
Active Trades Flattened 2   (−0.4R)
Late Flattens           0
```

Fields (config-side, from `runData.config`):
- `news_blackout_before_minutes` / `news_blackout_after_minutes`
- `news_blackout_impacts` (array → chips)
- `news_blackout_currencies` (array → chips)
- `news_pause_pending`
- `news_cancel_if_touched`
- `news_flatten_active_trades`
- `news_flatten_minutes_before`

Fields (summary reporting stats, already in `runSummary`):
- `run.news_events_matched`
- `run.news_windows_created`
- `run.news_touch_cancelled`
- `run.news_active_trades_flattened`
- `run.news_flattened_r`
- `run.news_flatten_late_count`

---

### 2.3 Style guidance

- Each group: `NeonPanel`-style bordered card with a `text-[9px] uppercase tracking-wider` label
- Value chips: `bg-[hsl(var(--panel-2))] border border-[hsl(var(--border-soft))] px-2 py-0.5 font-mono text-[11px]`
- Session chips in allowed_sessions: one chip per session using `<Pill tone="muted">`
- Boolean fields: green "✓ Enabled" chip vs dim "— Off" text
- Important scalar values (RR, symbol): `text-white font-semibold text-[13px]`
- Missing / unset values: `text-muted-lab` rendering `—`
- Group 4 (News) sub-divides into config settings (top) and reporting stats (bottom), separated by a thin horizontal rule

---

## 3. Order Block Stats Panel — Redesign Proposal

### 3.1 Current problems

- Shows only 5 values in a sparse 2-column grid
- No funnel or lifecycle view — doesn't communicate OB quality
- "Reverse Cancels" sits oddly here with no context
- No per-direction breakdown
- Large empty space when no OB data exists
- No insight lines

### 3.2 Available OB data for richer stats

The following can be derived from `runData.orderBlocks` + `runData.trades` without
any backend changes:

| Metric | Derivation |
|---|---|
| Total OBs | `runData.orderBlocks.length` |
| Bullish / Bearish count | `ob.side === "bull"` / `"bear"` |
| OBs with linked trade | `ob.linkedTradeId !== ""` OR trade with matching `obId` |
| Filled OBs | `ob.fillTime != null` OR trade with valid fill |
| Unfilled | Total − Filled − Invalidated − SessionCancelled − NewsCancelled − ReverseCancelled |
| Invalidated | `ob.invalidationTime != null` OR `obFinalStatus` contains "invalidated" |
| Session cancelled | `ob.sessionCancelTime != null` |
| News cancelled | `ob.newsBlackoutTriggerTime != null` |
| Reverse cancelled | trade `reverseConflict === true` |
| Wins from filled OBs | trades with `obId` match where `outcome === "Win"` |
| Losses from filled OBs | trades with `obId` match where `outcome === "Loss"` |
| Fill conversion rate | Filled / Total |
| Win rate (filled) | Wins / (Wins + Losses) from filled OBs |
| Avg OB width (pips) | mean of `Math.abs(ob.top − ob.bot) / pipSize` |
| Median OB width | median of above |
| Avg R — Bullish | mean `trade.r` where `trade.obDirection === "Bullish"` |
| Avg R — Bearish | mean `trade.r` where `trade.obDirection === "Bearish"` |
| Best OB by R | trade with max `r`, decorated with its OB id |
| Worst OB by R | trade with min `r`, decorated with its OB id |
| News touch-cancelled | `outcomeSummary.newsTouchCancel` (already computed) |
| News flattened | `outcomeSummary.newsFlatten` (already computed) |

---

### 3.3 Proposed layout: four zones

---

#### Zone A — OB Overview row (always visible)

Five MetricChip-style cards:

```
Total OBs   Bullish   Bearish   Avg Width   Fill Rate
   147         89        58      6.4 pips     41%
```

- Total: `obStats.total`
- Bullish: `obStats.bullish` (tone: primary)
- Bearish: `obStats.bearish` (tone: secondary)
- Avg Width: derived pips
- Fill Rate: `filledCount / obStats.total * 100` → `"41%"`

---

#### Zone B — Lifecycle Funnel

Horizontal or stepped flow communicating the OB lifecycle. Can be rendered as a
simple row of decreasing counts with connector arrows or chevrons.

```
Detected → Pending → Filled → [ Win | Loss | BE | Missed ]
  147         —         61       28    18     1    14
```

Alternatively, a vertical breakdown table:

```
LIFECYCLE STATUS
Detected          147
  ├─ Filled         61   (41%)
  │    ├─ Win        28
  │    ├─ Loss       18
  │    ├─ Breakeven   1
  │    └─ No result  14   (missed / unfilled post-touch)
  ├─ Unfilled        42
  ├─ Invalidated     18
  ├─ Session filt.   12
  ├─ News cancelled   8
  └─ Reverse cancel   6
```

Implementation: compute counts from `obFinalStatus` on OBs + join with trades.
Render as a compact indented list or as a segmented horizontal bar (the total
bar split into coloured segments proportional to each status).

---

#### Zone C — Direction Split

Two-column card (Bullish vs Bearish) side by side.

```
┌─ BULLISH ──────────────┐  ┌─ BEARISH ──────────────┐
│ 89 OBs                 │  │ 58 OBs                 │
│ 36 trades linked       │  │ 25 trades linked        │
│ Win Rate   57%         │  │ Win Rate   44%          │
│ Avg R    +0.82R        │  │ Avg R    +0.21R         │
│ Net R   +29.5R         │  │ Net R    +5.3R          │
└────────────────────────┘  └────────────────────────┘
```

All derivable from `trades` grouped by `obDirection`.

---

#### Zone D — Status Breakdown chips

Small chip row showing each terminal status with count. Only render chips where count > 0.

```
[ 61 Filled ] [ 42 Unfilled ] [ 18 Invalidated ]
[ 12 Session Filt. ] [ 8 News Cancelled ] [ 6 Reverse Cancel ]
[ 2 News Flattened ] [ 3 Touch Cancelled ]
```

Colour coding:
- Filled: accent-primary
- Wins: success
- Losses: danger
- Unfilled / Invalidated: muted
- Session / News / Reverse: warning

---

#### Zone E — Insight lines

Auto-generated, rendered below the chips. Only emit if condition is clearly meaningful.

Proposed thresholds:

```
→ "Only 41% of OBs were filled — consider entry depth or detection sensitivity."
→ "Bearish OBs produced 72% of total losses."
→ "Avg OB width is 6.4 pips — relatively tight blocks."
→ "12 OBs were session-filtered before fill."
→ "8 OBs touched but cancelled by news blackout."
```

Logic:
- Fill rate < 50% → surface fill rate + suggest cause
- Bearish losses / total losses > 60% → flag bearish skew
- Avg width < 5 or > 15 pips → note it
- Session filtered count > 10% of total → note
- News cancelled count > 0 → note

---

## 4. Metrics Safely Derivable Now (no backend changes)

All of the following can be computed entirely from `runData.orderBlocks` (already
stored) + `runData.trades` (already stored):

- Total / Bullish / Bearish OB counts
- Filled count (via `ob.fillTime != null` or `ob.linkedTradeId !== ""`)
- Unfilled count (OBs with no fill, no cancel, no invalidation)
- Invalidated count (`ob.invalidationTime != null`)
- Session-cancelled count (`ob.sessionCancelTime != null`)
- News-cancelled count (`ob.newsBlackoutTriggerTime != null`)
- Reverse-cancelled count (trades: `reverseConflict === true`)
- Wins / Losses / Breakeven from filled OBs (trade join)
- Fill conversion rate
- Win rate from filled OBs
- Avg / median OB width in pips (`Math.abs(ob.top − ob.bot) / pipSize`)
- Avg R by OB direction (trades grouped by `obDirection`)
- Net R by direction (same)
- Best / worst OB by R (trade join, sort by `r`)
- Configuration fields accessible from `runData.config` (all ⚠️ items in §1.1)
- Trade direction setting (`runData.config.trade_direction`)
- Session filter enabled / allowed_sessions (`runData.config.*`)
- All news config settings (`runData.config.news_blackout_*`)

---

## 5. Metrics That Would Benefit From Backend / Export Changes

These are currently not available or not reliably derivable from front-end data alone:

| Metric | Why backend help is needed |
|---|---|
| `ob_entry_depth_pct` as a config-level setting | It's a per-trade column today; the config param name may differ. Importer should extract it into `runSummary` for display. |
| `trade_direction` in `runSummary` | Currently only in raw config; should be promoted to `runSummary` in `ingestRunBundle` so it's available without reading raw config. |
| `session_filter_enabled`, `allowed_sessions` in `runSummary` | Same — promote to summary. |
| All `news_blackout_*` config params in `runSummary` | Promote from raw config into summary (already done for reporting stats, but not for config params). |
| Median OB width | Computable locally but needs a pass over OBs — trivial addition. |
| `obFinalStatus` presence guarantee | Some backends may not export this column; if absent, lifecycle funnel degrades to trade-join-only approximation. |
| OB pending / active at end-of-run count | Requires knowing which OBs were still open at the last candle — already partially handled by `deriveOBLifecycle` in store, but only for the active run. |
| Per-session OB performance | Would need `ob_origin_session` in the OB CSV (currently only in trades via `obOriginSession`). |

---

## 6. Recommended Implementation Phases

### Phase 1 — Config panel rebuild (self-contained, no new data needed)

Files: `RunDetail.jsx` only.

1. Extract a new `<ConfigPanel runData={runData} run={run} />` component (or inline sub-section).
2. Add a helper `cfg(key, fallback)` that reads `runData?.config?.[key] ?? fallback`.
3. Render the four groups (Market, Entry/Risk, Filters, News Protection) as described.
4. Read trade_direction, session_filter_enabled, allowed_sessions, news params directly
   from `runData.config` — no importer changes needed.
5. Use `<Pill>` chips for sessions and impacts arrays.
6. Conditionally render the News Protection group based on `news_blackout_enabled`.

Estimated scope: ~100 lines of JSX replacing the current ~25-line grid.

---

### Phase 2 — OB Stats panel rebuild (requires local computation helpers)

Files: `RunDetail.jsx` only (new `obStats` memo).

1. Expand the existing `obStats` useMemo to compute the full set of lifecycle buckets.
2. Join `runData.orderBlocks` with `runData.trades` via `linkedTradeId` / `obId` for
   win/loss/direction breakdown.
3. Render Zones A–E as described above.
4. Add the insight generator (similar pattern to existing `autoInsights`).

Estimated scope: ~150 lines of JSX + ~60 lines of memo logic replacing the current ~15-line grid.

---

### Phase 3 — Importer promotion (optional quality-of-life, minimal risk)

Files: `importer.js` (`ingestRunBundle` → `runSummary` block).

Add the following fields to `runSummary` so they are available on `run` directly
(instead of requiring `runData.config` reads in the UI):

```js
trade_direction: cfg.trade_direction ?? sm.trade_direction ?? null,
structure_type: cfg.structure_type ?? sm.structure_type ?? null,
session_filter_enabled: cfg.session_filter_enabled ?? sm.session_filter_enabled ?? null,
allowed_sessions: cfg.allowed_sessions ?? sm.allowed_sessions ?? null,
ob_entry_depth_pct: cfg.ob_entry_depth_pct ?? sm.ob_entry_depth_pct ?? null,
news_blackout_before_minutes: cfg.news_blackout_before_minutes ?? null,
news_blackout_after_minutes: cfg.news_blackout_after_minutes ?? null,
news_blackout_impacts: cfg.news_blackout_impacts ?? null,
news_blackout_currencies: cfg.news_blackout_currencies ?? null,
news_pause_pending: cfg.news_pause_pending ?? null,
news_cancel_if_touched: cfg.news_cancel_if_touched ?? null,
news_flatten_active_trades: cfg.news_flatten_active_trades ?? null,
news_flatten_minutes_before: cfg.news_flatten_minutes_before ?? null,
```

This makes Phase 1 cleaner (reads from `run.*` instead of `runData.config.*`).
Not strictly required since `runData.config` is already accessible in RunDetail.

---

### Phase 4 — OB lifecycle for non-active runs (nice-to-have)

Files: `RunDetail.jsx` + possibly `store.js` or `obLifecycle.js`.

Currently `deriveOBLifecycle` is only applied to the active run in `buildDerived`.
For non-active runs viewed in RunDetail, the enriched OBs are not available.

Option A: Compute `deriveOBLifecycle` locally in RunDetail using `runData.orderBlocks`
and the `runData.trades` — this keeps the logic in one place.

Option B: Enrich OBs at import time in `ingestRunBundle` and store the enriched
status codes alongside the raw OB data — more expensive at import but removes
per-render computation.

**Recommendation:** Option A (Phase 4 deferred, only needed for lifecycle funnel
display on non-active runs).

---

## 7. Files Requiring Changes

| File | Changes | Phase |
|---|---|---|
| `frontend/src/pages/RunDetail.jsx` | Replace Configuration grid with grouped card layout; expand `obStats` memo; add OB funnel + direction split + insight zones | 1, 2 |
| `frontend/src/data/importer.js` | Promote additional config fields into `runSummary` | 3 (optional) |
| `frontend/src/data/store.js` | No changes required | — |
| `frontend/src/data/obLifecycle.js` | Possibly expose helper for lifecycle classification (already used by store) | 4 (optional) |

No new component files are strictly required — the redesign can live entirely
within the existing `RunDetail.jsx` as local sub-components and memos, consistent
with how `SessionSplit`, `SessionMatrix`, and `TimeOfDayHeatmap` are structured.

---

## Appendix — Insight Line Conditions (safe to auto-generate)

| Condition | Insight text |
|---|---|
| `fillRate < 0.45` | `"Only {n}% of OBs converted to valid trades."` |
| `fillRate > 0.70` | `"{n}% OB fill rate — high detection efficiency."` |
| `bearishLosses / totalLosses > 0.60` | `"Bearish OBs produced most losses ({n}%)."` |
| `bullishWinRate > bullishWinRate + 0.15` | `"Bullish OBs win significantly more than bearish."` |
| `avgWidthPips < 5` | `"Avg OB width is {n} pips — very tight blocks."` |
| `avgWidthPips > 15` | `"Avg OB width is {n} pips — wide, may dilute entry precision."` |
| `sessionFiltered > total * 0.10` | `"{n} OBs session-filtered before fill."` |
| `newsCancelled > 0` | `"{n} OBs cancelled by news blackout."` |
| `reverseCancelled > total * 0.05` | `"{n} reverse-conflict cancellations detected."` |

Only emit insight lines where both `n > 0` and the underlying data is confirmed
present (not derived from a null fallback chain).
