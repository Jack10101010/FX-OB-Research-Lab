# FX-OB Research Lab — PRD

## Problem Statement
Premium React + Tailwind cyberpunk research dashboard for Forex order-block backtesting. **Research only**, no broker/live-trading controls. Pure frontend with mock data, architected to ingest local Python CSV/JSON outputs.

## Tech Stack
- React (CRA) + Tailwind + JS + shadcn/ui
- Recharts (all standard charts)
- **lightweight-charts v4.2.3** (Strategy Map / Trade Inspector candle chart)
- react-router-dom v7, lucide-react, sonner

## Architecture
```
/app/frontend/src/
  index.css                    # 5-theme tokens + clip-path utilities
  App.js                       # ThemeProvider + Router + AppShell
  context/ThemeContext.jsx     # 5 themes, live data-theme on <html>
  data/
    mock.js                    # Default dataset
    store.js                   # useDataset() hook + setDataset/resetDataset
    importer.js                # CSV/JSON parsers (trades, OB, sweep, mismatches, summary)
    presets.js                 # usePresets() — localStorage('fxob_configs')
  components/lab/
    AppShell, Sidebar, TopBar, PageHeader
    MetricChip                 # beveled/octagonal KPI primitive
    NeonPanel, DataTable
    CandleChart                # LWC v4 backed; props API unchanged
    EquityCurve, ImportZone
    controls (Segment, NeonInput, NeonSelect, NeonToggle, NeonButton, Field)
  pages/                       # 11 page components (all consume useDataset)
```

## Implemented
### Iteration 1 (2026-02-20) — MVP
- All 11 pages polished: Overview, StrategyBuilder, Runs, RunDetail, StrategyMap, TradeInspector, SweepLab, ComparisonLab, ParityDebugger, MonteCarlo, Settings
- 5 themes (Cyberpunk Violet default, Matrix Emerald, Tactical Amber, Ice Blue, Blood Red), live-switching, persisted to localStorage
- Custom SVG candle chart for Strategy Map / Trade Inspector
- Rich mock data (24 runs, 137 trades, full sweep grids, 31 parity mismatches)
- 58/58 testing-agent checks passed

### Iteration 2 (2026-02-20) — Engine upgrades
- ✅ **Lightweight-charts v4 wiring** — CandleChart internals replaced; props API stable. Candles via candlestick series, trade markers via setMarkers, TP/SL via createPriceLine, OB rectangles via positioned overlay layer driven by `timeToCoordinate` + `priceToCoordinate`. HSL→RGB conversion + `localization.locale: 'en-US'` to avoid LWC color/locale issues.
- ✅ **In-browser file importer** (`/settings → Data Sources · Import`) — drag-drop & file-picker, ingests `summary.json`, `config.json`, `trades.csv`, `order_blocks.csv`, `rr_sweep.csv`, `mismatches.csv`. Per-file detection + status display. Reset-to-mock button. Live updates via `useDataset()`.
- ✅ **Save/Load Config presets** in Strategy Builder — Save/Load/Duplicate/Delete + preset picker. Persists to `localStorage('fxob_configs')` with success flashes.
- ✅ **Multi-run Comparison Lab** — 2–5 runs, baseline crown, add/remove, KPI matrix with color-coded deltas, equity overlay (N lines), monthly bars per run, drawdown comparison placeholder, winner badge.
- ✅ Fixed SweepLab sub-component scoping regression caught by testing agent.

## Backlog
### P2
- Replace remaining placeholders (Profit Factor, Max Drawdown) with real calculations once Python engine ships
- Real Monte Carlo simulator (currently mock-only)
- Annotations / notes layer per trade
- Export Strategy Map screenshot
- Optional sidecar (Electron/Tauri/Node) for folder watching & one-click Python re-run

## Hard Boundary (Out of Scope)
- Live broker connection
- Order placement / cancellation / kill switches
- Real-time price feed
- Account balance from broker

## localStorage Keys
- `fxob_theme` — active theme id
- `fxob_configs` — `{ [presetName]: configObject }`
