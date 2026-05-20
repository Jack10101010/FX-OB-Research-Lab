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
- All 11 pages polished, 5 themes, mock data, custom SVG candle chart
- 58/58 testing-agent checks passed

### Iteration 2 (2026-02-20) — Engine upgrades
- Lightweight-charts v4 wiring (CandleChart props API stable)
- In-browser file importer (`/settings → Data Sources · Import`)
- Save/Load Config presets in Strategy Builder (`localStorage('fxob_configs')`)
- Multi-run Comparison Lab (2–5 runs, deltas, equity overlay)
- Caught + fixed SweepLab sub-component scoping regression

### Iteration 3 (2026-02-20) — Real metrics + Roadmap surface
- ✅ **`lib/metrics.js`** — pure functions: `computeProfitFactor`, `computeMaxDrawdown`, `computeExpectancy`, `computeAvgWinLoss`. Returns `null` on insufficient data — no fabrication.
- ✅ **Real PF / Max DD / Expectancy** wired into:
  - Run Detail KPI row (active run: real numbers · archived runs: "N/A · Limited Data")
  - Overview Active Config card (adds Profit Factor + Max Drawdown rows)
  - Comparison Lab KPI matrix (real numbers for active run, italicized "Limited Data" for non-active)
- ✅ Mock equity curve regenerated with realistic drawdown periods for a more informative demo (Max DD now ≈ -3.3R from real curve, not the old placeholder).
- ✅ **Monte Carlo banner**: "Visualization preview · simulator not yet wired" — preserves the page as a polished placeholder.
- ✅ **Research Workstation roadmap placeholder** in Sidebar — separate ROADMAP section, disabled card with dashed border + lock icon, "Coming Soon" badge, "Desktop Mode" subtitle, hover tooltip listing all 5 future capabilities (folder watching, auto-refresh, Python trigger, sweep run from UI, local FS access).
- ✅ Testing agent: **12/12 acceptance checks pass** + fixed one ComparisonLab destructure miss.

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
