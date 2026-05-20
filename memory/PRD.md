# FX-OB Research Lab — PRD

## Problem Statement
Premium React + Tailwind cyberpunk research dashboard for Forex order-block backtesting. **Research only**, no broker/live-trading controls. Real client-side ingestion of FX-OB-Backtester run bundles (config + summary + order_blocks + trades CSVs). Fully reactive — no backend.

## Tech Stack
- React (CRA) + Tailwind + JS + shadcn/ui
- Recharts (standard charts)
- **lightweight-charts v4.2.3** (Strategy Map / Trade Inspector candle chart)
- react-router-dom v7, lucide-react, sonner

## Architecture
```
/app/frontend/src/
  index.css                    # 5-theme tokens + clip-path utilities
  App.js                       # ThemeProvider + Router + AppShell
  context/ThemeContext.jsx
  lib/metrics.js               # Pure: computeProfitFactor, computeMaxDrawdown, computeExpectancy, computeAvgWinLoss
  data/
    mock.js                    # Default fallback dataset
    store.js                   # Reactive store: runs map + activeRunId + derived TRADES/CANDLES/OB_BOXES/EQUITY_CURVE; localStorage persistence with candle-drop-on-overflow
    importer.js                # ingestRunBundle(files) — parses config/summary/order_blocks/trades, builds bundle, maps timestamps → candle indices
    presets.js                 # usePresets() — localStorage('fxob_configs')
  components/lab/
    AppShell, Sidebar (+ ROADMAP / Research Workstation placeholder), TopBar, PageHeader
    MetricChip, NeonPanel, DataTable
    CandleChart                # LWC v4 backed; props API stable
    EquityCurve, ImportZone
    controls (Segment, NeonInput, NeonSelect, NeonToggle, NeonButton, Field)
  pages/                       # 11 pages, all consume useDataset()
```

## Implemented
### Iteration 1 — MVP
All 11 pages polished, 5 themes, custom SVG candle chart, 24-run mock + 137 trades. 58/58 pass.

### Iteration 2 — Engine upgrades
- Lightweight-charts v4 wiring (CandleChart props API stable)
- In-browser file importer
- Save/Load Config presets
- Multi-run Comparison Lab (2–5 runs)
- Caught + fixed SweepLab scoping regression

### Iteration 3 — Real metrics + Roadmap surface
- `lib/metrics.js` pure calculators; null on insufficient data
- Real PF/MaxDD/Expectancy in Run Detail, Overview Active Config, Comparison Lab
- Monte Carlo banner: "Visualization preview · simulator not yet wired"
- Sidebar ROADMAP section with disabled "Research Workstation · Coming Soon" + hover tooltip

### Iteration 4 — Phase 2: Real client-side run ingestion
- ✅ **Run bundle ingestion**: drop config.json + summary.json + order_blocks.csv + trades_*.csv (+ optional candles.csv) → ingestRunBundle parses + validates + builds bundle
- ✅ **Multiple trades variants** supported: single_position (primary), allow_multi_position, one_per_direction
- ✅ **localStorage persistence**: `fxob_runs`, `fxob_active_run_id`, `fxob_hide_mocks`. 4 MB safety budget — candles dropped first if exceeded, with `candlesDroppedForStorage` metadata and UI warning
- ✅ **Time→candle-index mapping**: timestamps preferred when candles imported, synthetic indices fallback
- ✅ **Reactive flow**: imported runs immediately drive Overview KPIs, Run Detail, Strategy Map, Trade Inspector, Comparison Lab
- ✅ **No-candles banners** on Strategy Map + Trade Inspector when current run has no candle data
- ✅ **Runs page** — imported-first ordering partition preserved across sort columns; MOCK/REAL pills; Hide-Mock-Runs toggle
- ✅ **Comparison Lab** — per-run getRunData lookup; real PF/MaxDD per run when data exists, "Limited Data" otherwise
- ✅ Testing agent: iter-4 caught 3 regressions (StrategyMap hasCandles, TradeInspector AlertTriangle import, Runs ordering); iter-5 retest **4/4 PASS · 100%**
- ✅ Bonus: fixed sparkline NaN for ≤1-point series

## Hard Boundary (Out of Scope)
- Live broker connection
- Order placement / kill switches
- Real-time price feed
- Broker account balance

## localStorage Keys
- `fxob_theme` — active theme id
- `fxob_configs` — Strategy Builder presets
- `fxob_runs` — imported run bundles
- `fxob_active_run_id` — currently active run
- `fxob_hide_mocks` — Runs page mock toggle

## Backlog
- Real Monte Carlo simulator (Web Worker or sidecar)
- Error boundary per route (caught by testing agent retroactively)
- Optional Electron/Tauri sidecar (Research Workstation roadmap)
- Suppress Recharts width(-1) warnings on initial mount
- Per-run trade variant switcher in Trade Inspector

## Sample Test Fixture
`/app/sample_run_bundle/{config.json, summary.json, order_blocks.csv, trades_single_position.csv}` — minimal 6-trade bundle. Computed truth: PF=1.50, MaxDD=-2.0R, NetR=+2.6R, WR=33.3%.
