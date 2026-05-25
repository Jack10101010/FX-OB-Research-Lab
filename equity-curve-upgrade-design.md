# Equity Curve Upgrade — Audit & Design Plan

> **Mode: AUDIT / DESIGN ONLY — no code has been changed.**
> Files read: `EquityCurve.jsx`, `RunDetail.jsx`, `importer.js`, `store.js`

---

## 1. Current Chart & Data Architecture

### The EquityCurve component (`components/lab/EquityCurve.jsx`)

A thin Recharts wrapper — 46 lines total.

- **Chart type:** `AreaChart` with a single `Area` for `netR`
- **Data shape it receives:** `{ i, date, label, netR }[]` — one point per trade, cumulative R only
- **X-axis:** `label` field (e.g. `"May '25"`) — monthly resolution, `interval = floor(n/8)` ticks shown
- **Y-axis:** `netR` in R units, tickFormatter adds "R" suffix
- **Tooltip:** shows only `netR` value and the `label` string — no trade identity, no session, nothing else
- **Optional secondary overlay:** accepts a `secondary` prop that renders a second `Area` on `netRB` (no component currently passes this)
- **No per-trade bars**, no drawdown strip, no mode selector, no toggles
- `MiniLine` is a separate sparkline export used elsewhere (MetricChip sparklines)

### How RunDetail.jsx uses it

```jsx
<EquityCurve data={equityForRun || EQUITY_CURVE} height={300} />
```

- Only the equity curve array is passed — **trade data is not passed** to the chart at all
- Panel is `xl:col-span-2` (two-thirds width), sitting beside a `xl:col-span-1` Configuration panel
- No filters, no mode selector, no variant/session controls inside the chart panel
- Metric chips above (6 across) do show Net R, Win Rate, Trades, Expectancy, Profit Factor, Max Drawdown

### How the equity curve data is produced (`importer.js → computeEquityCurve`)

```js
{ i, date, label, netR }
// i      — trade index (0-based, sequential)
// date   — ISO YYYY-MM-DD from trade.entry timestamp
// label  — "May '25" style, from toLocaleString
// netR   — running cumulative R, rounded to 2dp
```

**Critical gap:** per-trade R value, outcome, direction, session, drawdown depth, and all news/protection fields are **not included** in the equity curve points. They exist on the parallel `trades[]` array but are never joined onto chart data.

The equity curve is **trade-index-sequential** — not time-sequential. If trades cluster in one month the points bunch up; a quiet month has no points at all. The x-axis label is a monthly string derived from the entry timestamp, but the actual x-axis position is just the integer index `i`.

### Store (`store.js`)

- Equity curve is computed at import time in `importer.js` and stored in the bundle as `equityCurve` (primary variant) and `equityCurveByVariant` (per variant)
- `store.js` also has its own `computeEquityCurve` for re-deriving on variant switch
- `TRADES` and `EQUITY_CURVE` are both exposed by `useDataset()` and available in `RunDetail` as `tradesForRun` and `equityForRun`
- No drawdown is pre-computed anywhere in either file — `computeMaxDrawdown` lives in `lib/metrics.js` (scalar only, not point-by-point)

---

## 2. Available Trade Fields

Everything below is confirmed present in the `parseTradesCSV` output and therefore available on every `trade` object in `tradesForRun`.

### Identity & display
| Field | Source CSV column(s) |
|-------|----------------------|
| `id` | `trade_id`, `id`, `trade_index` |
| `displayTradeId` | derived from ob_id or trade_id |
| `obId` / `displayObId` | `ob_id`, `order_block_id` |
| `num` | sequential index |

### Timing
| Field | Source |
|-------|--------|
| `entry` | `fill_time`, `entry_time` |
| `exit` | `exit_time`, `exit` |
| `obOrigin` | `ob_origin`, `origin_time` |
| `detected` | `detected`, `detection_time` |

### Trade properties
| Field | Notes |
|-------|-------|
| `r` | pnl_r / r / r_result |
| `outcome` | "Win" / "Loss" / special strings |
| `direction` | "Long" / "Short" |
| `structure` | "BOS" / "CHoCH" |
| `session` / `fillSession` / `trade_session` / `entry_session` | fill session with fallback chain |
| `entryPrice` / `stop` / `tp` | prices |
| `rr_config` | configured RR |
| `reverseConflict` | boolean |

### News fields
| Field | Notes |
|-------|-------|
| `news_action` | e.g. `"NEWS_FLATTEN"`, `"NEWS_TOUCH_CANCEL"`, `"NEWS_BLACKOUT_SKIP"` |
| `news_blackout` | boolean — was trade in a blackout window |
| `news_blackout_event` | event name |
| `news_blackout_impact` | impact level |
| `news_blackout_currency` | affected currency |
| `news_flatten_r` | R achieved at flatten |
| `news_flatten_time` | when flatten occurred |
| `news_flatten_late` | boolean |
| `news_blackout_minutes_from_event` | proximity to event |

### Session filter / missed trade fields
| Field | Notes |
|-------|-------|
| `missed_trade` | boolean |
| `missed_reason` | why trade was missed |
| `missed_session` / `blocked_session` / `session_filtered_session` | which session caused filter |

### Protection fields
| Field | Notes |
|-------|-------|
| `protection_mode` | mode string |
| `protection_exit_reason` | reason string |
| `protection_exit_price` | numeric |
| `protection_trigger_time` | timestamp |
| `protection_threshold` / `protection_threshold_pct` | thresholds |

### Trade mechanics
`bars_to_exit`, `minutes_to_exit`, `bars_to_fill`, `minutes_to_fill`, `same_candle_exit`, `obWidthPips`, `max_ob_penetration_pct`, `ob_fully_breached`, `fill_penetration_pct`, `entry_depth_pct`, `close_confirmed_ob_breach`, `close_breach_session`, `close_breach_hour`, `stop_buffer`, `stop_buffer_pips`

### OB enrichment (added post-import)
`obTop`, `obBottom`, `obDirection`, `obOriginTime`, `obDetectionTime`, `obWidthPips`

### Fields that are NOT in the current trade schema
- `obOriginSession` — attempted by `originSessionForTrade()` in RunDetail but not imported; falls back to direction field as a proxy (incorrect)
- `balance` / `account_size` — no concept yet; needed for balance simulation mode
- `risk_pct` — not imported; needed for % balance simulation
- `mae` / `mfe` (max adverse/favourable excursion) — not present; would be useful for R optimisation views
- `trade_notes` / `tags` — no annotation support yet

---

## 3. Recommended V1 Equity Chart Design

### Layout (within the existing NeonPanel)

```
┌──────────────────────────────────────────────────────────────────┐
│  [Cumulative R ▾]  [■ Trade Bars]  [■ Drawdown]  [■ News]       │  ← toggle row
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│   Cumulative R line + gradient fill          ~200px              │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│   Per-trade R bars (win/loss/amber)           ~70px              │
├──────────────────────────────────────────────────────────────────┤
│   Drawdown depth strip                        ~28px              │
└──────────────────────────────────────────────────────────────────┘
```

The three visual areas share the same x-axis (trade index `i`). Total height ~300px matching current allocation.

### Data preparation — join trades onto equity curve points

In `RunDetail.jsx` (or a `useMemo` hook), produce an augmented `chartData` array by zipping `equityForRun` with `tradesForRun`. Since both are trade-indexed and aligned (`equityForRun[i].i === i` and `tradesForRun[i]` are the same trade), this is a direct zip:

```
chartData[i] = {
  // from equity curve
  i, date, label, netR,
  // from trade
  tradeR:      trade.r,
  outcome:     trade.outcome,
  direction:   trade.direction,
  structure:   trade.structure,
  session:     trade.fillSession || trade.session,
  news_action: trade.news_action,
  missed_reason: trade.missed_reason,
  displayTradeId: trade.displayTradeId,
  entryTime:   trade.entry,
  // computed
  drawdown:    0,   // see below
  isAtHigh:    false,
}
```

Drawdown is computed in the same pass:

```js
let peak = -Infinity;
chartData.forEach(p => {
  if (p.netR > peak) peak = p.netR;
  p.drawdown = p.netR - peak;          // 0 at equity highs, negative in drawdown
  p.isAtHigh = p.drawdown >= 0;
});
```

This is O(n) and requires no store changes.

### Chart implementation — Recharts ComposedChart

Use a single `ComposedChart` for the equity line and trade bars, with a second small `AreaChart` below for the drawdown strip. Both receive the same `chartData` array.

**Main chart (equity + bars):**
- `Line` — `dataKey="netR"`, type="monotone", strokeWidth=2, no dots, gradient fill via SVG `defs`
- `Bar` — `dataKey="tradeR"`, `yAxisId="bars"`, coloured per outcome (see colouring rules below), `maxBarSize=6`
- `ReferenceLine` at y=0 on the primary axis
- Custom `<Tooltip content={<TradeTooltip />} />`
- Two Y-axes: primary for `netR` (left, ticks in R), secondary `yAxisId="bars"` for trade R (hidden or very subtle)

**Drawdown strip (separate thin chart):**
- `AreaChart` — `dataKey="drawdown"`, height 28px, no axes, no grid
- Fill colour mapped to depth (see Section 4)
- Synchronized via same `chartData` index — same x-position alignment is natural since both use `i`

### Bar colouring rules

| Condition | Colour |
|-----------|--------|
| `outcome === "Win"` | `hsl(var(--accent-primary))` — green/teal |
| `outcome === "Loss"` | `hsl(var(--bear) / 0.8)` — red |
| `news_action` truthy (NEWS_FLATTEN, NEWS_TOUCH_CANCEL, NEWS_BLACKOUT_SKIP) | `hsl(var(--warning))` — amber |
| `outcome` contains SESSION_FILTERED or missed_trade === true | `hsl(var(--warning) / 0.6)` — muted amber |
| `Math.abs(tradeR) < 0.01` (near-zero R) | `hsl(var(--muted))` — grey |

Implement via Recharts `<Cell>` map across bar data — already used in RunDetail for the monthly bar chart.

### Mode selector

A small `NeonSelect` or pill-group above the chart offers:
1. **Cumulative R** (default) — equity line showing running total
2. **Net R per trade** — flat line at 0 with only the bars visible (removes the curve, makes bar distribution clearer)
3. **Balance simulation** — greyed out / disabled until account size is added (V2)

---

## 4. Drawdown Strip Design

A 28px `AreaChart` panel below the main chart, sharing the same `chartData` array. Plots the `drawdown` field (negative values) as a filled area.

### Depth-based fill colour

Use a `linearGradient` with stops keyed to drawdown depth, or use a `Cell`-mapped `Bar` of height 1 for pixel-perfect cell colouring. The simpler approach is a gradient-filled `Area`:

| Drawdown depth | Suggested colour |
|----------------|-----------------|
| 0R (at high) | `var(--accent-primary) / 0.10` — near-invisible green wash |
| −0.01R to −1R | `var(--bear) / 0.20` — very light red |
| −1R to −3R | `var(--bear) / 0.45` — medium red |
| −3R to −5R | `var(--bear) / 0.65` — strong red |
| below −5R | `hsl(0 72% 40% / 0.85)` — deep crimson |

Since Recharts `Area` uses a single fill colour (not per-cell), the cleanest V1 approach is a **separate thin `BarChart`** with `maxBarSize` equal to the strip height and `<Cell>` per bar — the same Cell pattern already used throughout RunDetail. Each cell colour is computed from `p.drawdown` against the thresholds above. This gives precise per-trade colouring with no extra dependencies.

### Hover behaviour on the drawdown strip

On hover (via the shared `Tooltip`), the tooltip (described in Section 5) should show:

- Drawdown at that point: `−2.4R`
- Whether the point is at a new equity high
- Duration of current drawdown period (count trades since `isAtHigh` was last true)
- Max drawdown within the current drawdown run

---

## 5. Tooltip Design

A custom Recharts tooltip component (`TradeTooltip`) replaces the default popup. Receives the full `chartData[i]` payload via Recharts `formatter` / `content` prop.

```
╔═══════════════════════════════════════╗
║  T-042  ·  Long  ·  BOS               ║
║  18 Nov 2025, 09:30 UTC               ║
║  Session: London                      ║
╠═══════════════════════════════════════╣
║  R Result    │  +2.00R                ║
║  Cumul. R    │  +18.50R               ║
╠═══════════════════════════════════════╣
║  Drawdown    │  −0.00R  (new high)    ║
╠═══════════════════════════════════════╣
║  ⚡ NEWS_FLATTEN → +0.80R             ║  shown only when news_action truthy
║  ⛔ SESSION_FILTERED · London Lull    ║  shown only when missed_trade
╚═══════════════════════════════════════╝
```

**Fields shown:**
- Header row: `displayTradeId` · `direction` · `structure`
- Timestamp: formatted `entryTime` as `DD Mon YYYY, HH:MM UTC`
- Session: `fillSession` (normalised)
- R result: `tradeR` with sign and R suffix, coloured green/red
- Cumulative R: `netR` with sign and R suffix
- Drawdown: `drawdown` — show "(new high ✓)" when `isAtHigh === true`
- News block (conditional): icon + `news_action` + `news_flatten_r` if flatten
- Session filter block (conditional): `missed_reason` or `session_filtered_session`
- Protection block (conditional): `protection_exit_reason` if present

**Styling:** `background: hsl(var(--panel-2))`, `border: 1px solid hsl(var(--accent-primary) / 0.4)`, `borderRadius: 2`, `fontFamily: JetBrains Mono`, `fontSize: 11` — matching existing tooltip styles already in the file.

---

## 6. Useful Future Toggles & Views

### V1 toggles (toggle row above chart, boolean on/off)

| Toggle | Default | What it controls |
|--------|---------|-----------------|
| Trade bars | ON | show/hide per-trade R bar chart |
| Drawdown strip | ON | show/hide bottom drawdown bar |
| News markers | ON | amber highlight on news-affected bars |
| Session colours | OFF | tint bars by session (Asia=blue, London=green, NY=yellow) |

### V1 mode selector (dropdown)

- Cumulative R — standard equity curve
- Net R per trade — remove the line, show bars only (distribution focus)

### V2 filter overlays (session / direction / structure)

- Show only a selected session (dropdown: All / Asia / London / New York / London Lull)
- Show only Long or Short trades
- Show only BOS or CHoCH structure trades
- Exclude news-affected trades (toggle)
- Exclude session-filtered trades (toggle)

All of these are purely a `useMemo` filter on `tradesForRun` before the chart data join — no store changes needed.

### V2 rolling metrics overlays (additional `Line` series on same chart)

- Rolling expectancy — rolling N-trade average R (N configurable, default 20)
- Rolling win rate — rolling N-trade win % as a second Y-axis line
- Cumulative win / loss count — bar or area below main chart

### V2 split-by views (separate `<EquityCurveV2>` instances or multi-line)

- Equity by session — four lines (Asia, London, NY, Lull), each showing session-only cumulative R
- Equity by direction — two lines: Long cumulative R vs Short cumulative R
- Equity by structure — BOS line vs CHoCH line
- Equity excluding news-affected trades vs including (comparison overlay)

### V2 performance bands

- Month/week coloured background bands (alternating `ReferenceArea` blocks in Recharts)
- Recovery time annotations — arrows or brackets showing trough→recovery duration

### V3 advanced

- Streak visualisation — background highlight for win/loss streaks ≥ N
- R distribution mini-histogram alongside equity chart (right panel, 80px wide)
- MAE/MFE scatter overlay (requires new CSV fields)
- Balance simulation mode (requires account size input)
- Drawdown recovery duration annotation on drawdown strip hover

---

## 7. Implementation Phases

### Phase 0 — Data join (no visual changes, ~30 min)

In `RunDetail.jsx`, add a `useMemo` that zips `tradesForRun` and `equityForRun` into an augmented `chartData` array including `tradeR`, `outcome`, `direction`, `structure`, `session`, `news_action`, and the computed `drawdown` / `isAtHigh` fields.

No store changes. No importer changes. The existing `EquityCurve` component continues to work on `equityForRun` directly.

**Deliverable:** `chartData` array ready to pass to new component.

---

### Phase 1 — EquityCurveV2 component (~2–3 hours)

Create `frontend/src/components/lab/EquityCurveV2.jsx`.

Props:
```js
{
  data,         // augmented chartData[]
  height,       // default 300
  showBars,     // boolean toggle
  showDrawdown, // boolean toggle
  showNews,     // boolean toggle
  mode,         // "cumulative_r" | "per_trade"
}
```

Internals:
- `ComposedChart` for equity line + trade bars
- Thin `BarChart` for drawdown strip (or a `Cell`-mapped bar of height 28)
- `TradeTooltip` custom tooltip component (same file)
- Recharts only — no new library needed

**Deliverable:** new component rendering all three panels, toggle-controlled.

---

### Phase 2 — RunDetail layout update (~1 hour)

- Change equity panel to `xl:col-span-3` (full width)
- Move Configuration panel below equity curve or make it collapsible (accordion pattern already used elsewhere in the app?)
- Add toggle row above chart with `showBars`, `showDrawdown`, `showNews` state
- Add mode dropdown
- Replace `<EquityCurve>` with `<EquityCurveV2>` and pass `chartData`

**Deliverable:** RunDetail page shows the new full-width equity chart with toggles.

---

### Phase 3 — Session & direction filters (~1–2 hours)

Add filter controls:
- Session filter dropdown (multi-select)
- Direction filter (All / Long / Short)
- Structure filter (All / BOS / CHoCH)
- Exclude news / Exclude session-filtered checkboxes

These all operate as `useMemo` filters on `tradesForRun` that produce a filtered `chartData`.

**Deliverable:** equity curve recomputes when filters change, showing equity for sub-sets.

---

### Phase 4 — Rolling metrics overlays (~2 hours)

Add rolling expectancy and rolling win rate overlays as additional `Line` series. Add N-period selector (10 / 20 / 50 trades).

**Deliverable:** optional overlay lines on main equity chart.

---

### Phase 5 — Split-by views (~3 hours)

Add a separate "Split by" panel below the main chart (collapsible), rendering 2–4 smaller `EquityCurveV2` instances filtered to each session / direction / structure. Or implement as a multi-line mode within the main chart.

**Deliverable:** side-by-side or stacked equity sub-charts for research comparison.

---

## 8. Files Likely Needing Changes

| File | Change type | What changes |
|------|-------------|--------------|
| `frontend/src/components/lab/EquityCurve.jsx` | Add / extend | Add `EquityCurveV2` export (keep existing `EquityCurve` and `MiniLine` untouched for backward compat) |
| `frontend/src/pages/RunDetail.jsx` | Modify | Add `chartData` useMemo, add toggle state, replace chart component in equity panel, expand layout to full width |
| `frontend/src/data/importer.js` | Optional | Optionally enrich `computeEquityCurve` to include `tradeR`, `outcome`, `session`, `direction`, `drawdown` directly — avoids the join in RunDetail but couples the curve to trade fields |
| `frontend/src/data/store.js` | Optional | Mirror any `computeEquityCurve` enrichment changes if chosen above |
| `frontend/src/lib/metrics.js` | Optional | Extract point-by-point drawdown computation as a shared util (`computeDrawdownSeries`) reusable by chart and by future comparison views |

**Not touched by V1:**
- `DataTable`, `NeonPanel`, `MetricChip`, `controls` — no changes needed
- `obLifecycle.js`, `artifactStore.js` — no changes needed
- Any other page — equity chart is self-contained to RunDetail

---

## Technical Recommendation: Recharts ComposedChart

The stack is already fully Recharts — `AreaChart`, `BarChart`, `PieChart`, `LineChart`, `ComposedChart`, `Bar`, `Cell`, `Tooltip`, `ReferenceLine`, `CartesianGrid`, `XAxis`, `YAxis` are all imported and used across the codebase.

**Use Recharts `ComposedChart`** for the combined equity line + trade bars. This is already proven in the app and requires zero new dependencies.

Do **not** use `lightweight-charts` (TradingView's library). It uses an imperative DOM-attachment model that doesn't fit the React declarative component pattern, requires a `useRef`+`useEffect` setup, and adds a significant bundle weight for a tool that primarily needs bar + line + tooltip — all of which Recharts handles cleanly.

Do **not** use custom SVG/canvas for V1. High implementation cost, manual hit-testing for tooltips, and harder to maintain alongside Recharts-based panels.

The one Recharts limitation to be aware of: synchronising the thin drawdown strip with the main chart requires either (a) using a single `ComposedChart` with a third y-axis clamped to the strip height, or (b) using two separate `ResponsiveContainer` instances and ensuring they use the same left margin so their x-axes align visually. Option (b) is simpler — the existing margin `{ left: -16 }` can be replicated on both. The x-positions won't be pixel-perfect but will be visually coherent since both charts are 100% width and share the same number of data points.

For pixel-perfect alignment, option (a) — a single `ComposedChart` with three y-axes and `allowDataOverflow` on the bar axes — is cleaner but requires more careful domain/range management.

---

*Design document produced: 2026-05-24. All observations based on source code as-read; no modifications made.*
