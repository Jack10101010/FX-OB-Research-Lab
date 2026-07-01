# Strategy Map — Market State Overlays (Phase 2 + 2B)

---
## PHASE 2B — JSX WIRING APPLIED (staged, not committed)

**Applied (client-only, visual-only; no backend, no filtering, no strategy change):**
- **Market State Ribbon** — thin 12px bottom strip, one region per contiguous daily state run, coloured via `marketStateColor(seg.state)`, clamped to the visible range (clones the `sessionOverlays` coordinate pattern), never covers candles. Toggle **off** by default.
- **EMA 200 line** — a lightweight-charts `addLineSeries` fed pre-computed `{time,value}` from `emaLinePointsFromPanel` (no EMA math in the chart); added/removed cleanly on toggle. **Off** by default.
- Both driven by ONE `useMarketStatePanel(displayCandles, regimeCfg, heroSymbol)` → memoized `ribbonSegmentsFromPanel` / `emaLinePointsFromPanel`. **No indicator recompute; no formula duplication.**
- Two new persisted layer toggles (`marketStateRibbon`, `marketStateEma`) via the existing `DEFAULT_LAYERS`/localStorage system + `<Toggle>` rows next to "Sessions".

**Deferred (documented):**
- **Trade-state badges** — CandleChart props (`tradeStateBadges`, `showTradeStateBadges`) are reserved but unrendered: the single `setMarkers` owner is delicate and DOM-chip placement can't be render-verified here. Lowest incremental value once ribbon+summary exist.
- **Summary card** — chose "OFF if safer" (per Part 3). The panel snapshot is trivial to add via `useTradeMarketState(selectedTrade, regimePanel)` + `<MarketStateCard>`, but placing a card in the complex layout can't be render-verified in this environment; `TradeInspector` already shows the full card for the selected trade.
- **Bollinger bands** — still deferred (panel emits `bbw`, not bands; would need a spec/fixture bump).

**Files changed (Phase 2B):**
- `frontend/src/components/lab/CandleChart.jsx` — import `marketStateColor`; 6 new default-off props; `emaSeriesRef` + EMA line-series effect; `marketStateRibbonOverlays` compute + bottom-strip render.
- `frontend/src/pages/StrategyMap.jsx` — imports (`useMarketStatePanel`, `regimeCfgFromRunConfig`, `ribbonSegmentsFromPanel`, `emaLinePointsFromPanel`); 2 `DEFAULT_LAYERS` keys; 2 toggle `useState`s; persist object + deps entries; regime panel + 2 memoized overlay arrays; 4 props passed to `<CandleChart>`; 2 `<Toggle>` rows.

**Validation (Phase 2B):**
- `@babel/core` transform of BOTH changed files → **OK** (syntactically valid, imports resolve).
- `node marketState.validate.mjs` → **70 passed / 0 failed** (pure layer + overlay helpers intact).
- Defensive safety by construction: empty/loading candles → empty panel → no overlays (no crash); unknown symbol ("—") → `resolveBbwThreshold` falls back to default (no crash); warmup → null-state segment rendered neutral / EMA warmup skipped.
- **Live dev-server visual smoke: NOT run — this environment has no browser/dev-server and the repo's ESLint isn't standalone-runnable.** The Part-5.3 checklist (default view unchanged, toggle on/off, no crash, markers/sessions still work, perf) must be run via `craco start` before commit.

**Safe to commit?** **Not yet** — per the standing rule, commit only after the `craco start` visual smoke passes. Code is staged, syntax- and logic-validated.

**Recommended commit message (after smoke passes):**
`feat(strategy-map): Market State ribbon + EMA200 overlays (client-only, off by default)`

---
## PHASE 2 (design + pure layer) — original notes below
# Strategy Map — Market State Overlays (Phase 2)

**Client-only, visual-only. No backend, no filtering, no strategy change. Nothing committed.**

## Validation-environment boundary (read this first)
This environment can run the Node validators but **cannot render or build JSX** (the repo uses CRA/craco's bundled ESLint — no standalone flat config — and `node --check` doesn't parse JSX). Per the standing rule *"do not commit until validation passes,"* I did **not** blind-edit the two ~1500-line chart files (`CandleChart.jsx`, `StrategyMap.jsx`) with React I can't render-verify — that would risk breaking a working Strategy Map. Instead:
- **Implemented + fully validated (Node, 70/70):** the pure, reusable **overlay-data layer** in `marketState.js` + its validation. This is the correct, tested foundation the JSX consumes.
- **Specified for application (below):** the exact, copy-ready JSX wiring, modeled line-for-line on existing working blocks, to be applied and smoke-tested in a real dev server.

## Part 1 — Audit answers
1. **Where to wire:** `StrategyMap.jsx` owns persisted layer toggles (`DEFAULT_LAYERS` + per-toggle `useState`) and passes `show*`+data-array props to `CandleChart.jsx`. Summary reuses `MarketStateCard` (already imported by `TradeInspector`).
2. **Overlay series supported?** Yes — lightweight-charts v4: `addCandlestickSeries` (main), `createPriceLine` (horizontals), and time-spanning **DOM overlays** via `timeScale().timeToCoordinate()` repainted on `subscribeVisibleTimeRangeChange`. `addLineSeries` is available for EMA. **Session highlights (`sessionOverlays`) are the exact ribbon analog.**
3. **Layer toggles?** Yes — `initialUi.layers` persisted to localStorage; new toggles slot in identically.
4. **Trade markers:** single `setMarkers` owner (currently BE-only/clear); trade glyphs + OB/ghost/TE badges are DOM overlays. Badges best added as **DOM chips**, not by touching the marker owner.
5. **Pass state without recompute:** `useMarketStatePanel(candles, regimeCfg, symbol)` builds ONE panel (TradeInspector already does this); derive memoized overlay arrays via the new pure helpers; `stateForTrade` for per-trade lookups.
6. **Perf:** panel memoized; ribbon/EMA are daily-stepped (≤ #days points); DOM overlays already repaint on range change → clamp ribbon to the visible range (as `sessionOverlays` does). No per-render recompute. **No blocker.**

## Part 2 — What was implemented (pure layer, `frontend/src/data/marketState.js`)
New pure, dependency-free helpers (read the already-shifted panel — **no EMA/BBW/ADX recompute, no formula duplication**):
- `ribbonSegmentsFromPanel(panel)` → contiguous same-state daily runs `{state,startDate,endDate,startTime,endTime,startMs,endMs,knownAt}`; end is **exclusive of the next day's boundary** so a day's region = the value known at its start.
- `emaLinePointsFromPanel(panel)` → `{time,value}` per finite-EMA day (warmup skipped), ascending.
- `shortStateLabel(state)` → `"Bull/Exp"`, `"Bear/Chp"`, …
- `tradeStateBadge(trade,panel)` → `{state,label,knownAt}` via `stateForTrade`; null if unknown.
Colours reuse the existing `lib/chartStyles.js::marketStateColor()` (6 states + neutral) — **not duplicated**.

**Bollinger bands: DEFERRED (clean, per Part 2.3).** The panel emits `bbw` but not band upper/lower (`ma ± k·sd`). Adding them would change the panel output shape → require a `regime_spec.md`/fixture version bump. Rather than duplicate the formula in chart code, defer to a small Phase-2b that extends `marketState.js` (`bandUpperFromPanel`/`bandLowerFromPanel`) with a spec+fixture bump. EMA + ribbon + summary deliver the core "see the state" value without it.

## Copy-ready JSX wiring (apply + smoke-test in a dev server)
**A. `CandleChart.jsx` — new props** (append to the destructured signature; all default off/empty so existing behaviour is byte-identical):
```js
marketStateRibbon = [],      showMarketStateRibbon = false,
emaLinePoints = [],          showEma = false,
tradeStateBadges = [],       showTradeStateBadges = false,
```
**B. EMA line series** (new `useEffect`, mirrors the `addCandlestickSeries` lifecycle):
```js
const emaSeriesRef = useRef(null);
useEffect(() => {
  const chart = chartRef.current; if (!chart) return;
  if (showEma && emaLinePoints.length) {
    if (!emaSeriesRef.current) emaSeriesRef.current = chart.addLineSeries({ color: "#8aa0c6", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    emaSeriesRef.current.setData(emaLinePoints.map(p => ({ time: normalizeChartTimestamp(p.time), value: p.value })).filter(p => p.time != null));
  } else if (emaSeriesRef.current) { chart.removeSeries(emaSeriesRef.current); emaSeriesRef.current = null; }
}, [showEma, emaLinePoints, overlayKey]);
```
**C. Ribbon** = clone the `sessionOverlays` block into `ribbonOverlays` (same `timeToCoordinate` clamp-to-visible logic), fill from `marketStateRibbon` (`startTime`/`endTime`), height = a thin strip (e.g. 10px) anchored to the **bottom** of the pane, colour = `marketStateColor(seg.state).fill` (neutral for null). Render the resulting divs alongside `{sessionOverlays.map(...)}`.
**D. Trade-state badge chips** = DOM chips at `timeToCoordinate(entryTime)` (mirror the ghost/OB badge chips), text `badge.label`, bg `marketStateColor(badge.state).fill`, border `.stroke`. Gate on `showTradeStateBadges`.

**E. `StrategyMap.jsx` wiring:**
```js
// DEFAULT_LAYERS additions:
marketStateRibbon: false, marketStateEma: false, marketStateBadges: false, marketStateSummary: true,
// hooks (reuse TradeInspector's pattern):
const regimeCfg = useMemo(() => regimeCfgFromRunConfig(bundle?.config), [bundle]);
const regimePanel = useMarketStatePanel(CANDLES, regimeCfg, runSymbol);
const ribbon = useMemo(() => ribbonSegmentsFromPanel(regimePanel), [regimePanel]);
const emaPts = useMemo(() => emaLinePointsFromPanel(regimePanel), [regimePanel]);
const badges = useMemo(() => (showMarketStateBadges ? trades.map(t => ({ tradeId: t.trade_id, entryTime: t.fill_time, ...tradeStateBadge(t, regimePanel) })).filter(b => b.state) : []), [trades, regimePanel, showMarketStateBadges]);
// pass to <CandleChart ... marketStateRibbon={showMarketStateRibbon?ribbon:[]} showMarketStateRibbon={showMarketStateRibbon} emaLinePoints={emaPts} showEma={showMarketStateEma} tradeStateBadges={badges} showTradeStateBadges={showMarketStateBadges} />
```
**F. Summary card** = render `<MarketStateCard snapshot={useTradeMarketState(selectedTrade, regimePanel)} />` in the existing right-rail when `showMarketStateSummary && selectedTrade` — **reuses the component, no duplicate UI logic.**

## Part 3 — Toggles (recommended defaults)
`Ribbon` OFF · `EMA` OFF · `Bollinger` (deferred) · `Badges` OFF · `Summary` ON (for selected trade, when a regime panel exists). All persisted via the existing `layers` localStorage path.

## Part 4/5 — Data flow & no look-ahead
One `useMarketStatePanel` → memoized overlay arrays → props. **No calc in chart components.** All overlays read the **shifted** panel: a ribbon region for day D = the value known at **start of D** (`knownAt`, `shifted_days=1`, `source=client`), surfaced in the tooltip/summary. Validation asserts ribbon-end exclusivity and EMA warmup-skip — no same-day future close is shown.

## Part 6 — Styling
Reuses the frozen 6-state palette (green/red × expand-saturated/compress-muted/chop-grey), readable dark/light. Thin bottom **ribbon** (not full-pane tint), **muted** EMA line, compact chips, collapsible **summary card**. No Christmas tree.

## Part 7 — Validation results
- `node marketState.validate.mjs` → **70 passed, 0 failed** (incl. 13 new Phase-2 overlay-helper assertions: ribbon contiguity/coverage/no-look-ahead, EMA count/ascending/warmup-skip, short labels, badge lookups).
- JSX render (overlays hidden when off, no-crash on missing/warmup/unknown-symbol, summary matches `MarketStateCard`) → **pending a real dev server** (cannot render/build here). Manual smoke checklist is the wiring spec above; each overlay is default-off and null-safe by construction.

## Final answers
1. **Implemented:** the pure, validated overlay-data layer (ribbon segments, EMA points, badge/labels) + palette reuse + 13 new tests. JSX wiring specified copy-ready (not applied — un-renderable here).
2. **Wiring:** StrategyMap builds one memoized panel → derives overlay arrays → passes `show*`+arrays to CandleChart (ribbon DOM strip, EMA line series, badge chips) + reuses `MarketStateCard` for the summary.
3. **Files changed:** `frontend/src/data/marketState.js` (helpers), `frontend/src/data/__validation__/marketState.validate.mjs` (tests). *(To apply: `CandleChart.jsx`, `StrategyMap.jsx` per the spec.)*
4. **Formulas duplicated?** **No** — helpers read the panel; colours reuse `chartStyles`. Bollinger deferred specifically to avoid chart-side formula duplication.
5. **Look-ahead avoided:** overlays read the shifted panel; ribbon region = value known at start-of-day; tooltip/summary show `known_at`/`shifted_days=1`/`source`. Tested.
6. **Validation:** pure layer 70/70 PASS; JSX render pending dev server (environment limit).
7. **UX compromises:** Bollinger bands deferred (needs panel extension + spec bump); per-trade badges specified but not applied (highest DOM risk, lowest incremental value once ribbon+summary exist).
8. **Phase 3:** Master Controls **filter lens** (client, no rerun) using `tradePassesRegime` — still no backend.
9. **Must NOT happen yet:** backend `regime.py`/engine emission, engine filtering, Cohort Intelligence / Portfolio Manager / Decision Engine, any strategy-behaviour change, and applying the JSX without a dev-server smoke pass.
