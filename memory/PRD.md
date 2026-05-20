# FX-OB Research Lab — PRD

## Problem Statement
Build a premium React + Tailwind cyberpunk/quant dashboard called **FX-OB Research Lab** — a local research dashboard for a Forex order-block backtesting engine. **Research only**: no broker controls, no live execution, no order placement, no kill switches. Pure frontend mock app architected to later be wired to Python CSV/JSON outputs.

## User Personas
- **Quant Researcher / Operator** ("QuantOperator"): runs backtests, parameter sweeps, comparisons, and Pine↔Python parity validation locally. Needs dense, premium, sci-fi quant terminal aesthetics.

## Core Requirements (Static)
- React (CRA) + Tailwind + JS, shadcn/ui pre-installed
- Recharts for standard charts; **custom SVG candlestick** for Strategy Map / Trade Inspector (replaceable abstraction)
- 5 themes, live-switching: Cyberpunk Violet (default), Matrix Emerald, Tactical Amber, Ice Blue, Blood Red
- Persistent theme via `localStorage.fxob_theme`
- 11 pages with sidebar navigation
- Beveled/octagonal KPI chips as core design primitive
- Realistic mock data densities (24 runs, 137 trades, full sweep grids)

## Architecture
```
/app/frontend/src/
  index.css                     # 5-theme tokens + clip-path utilities
  App.js                        # ThemeProvider + BrowserRouter + AppShell
  context/ThemeContext.jsx
  data/mock.js                  # All mock data (replaceable later)
  components/lab/
    AppShell.jsx, Sidebar.jsx, TopBar.jsx
    MetricChip.jsx              # beveled/octagonal KPI primitive
    NeonPanel.jsx               # dark glass panel + corner accents
    DataTable.jsx, EquityCurve.jsx, CandleChart.jsx, controls.jsx
  pages/                        # 11 page components
    Overview, StrategyBuilder, Runs, RunDetail, StrategyMap,
    TradeInspector, SweepLab, ComparisonLab, ParityDebugger,
    MonteCarlo, Settings
```

## What's Been Implemented (2026-02-20)
- ✅ 5-theme system with live switching (CSS variables on `<html data-theme>`)
- ✅ Custom typography: Space Grotesk + JetBrains Mono
- ✅ Sidebar with active-route neon border, theme quick-picker, active config card, profile placeholder
- ✅ TopBar: workspace name, Data Source · Local Data, timezone, Load Config, New Backtest
- ✅ Beveled/octagonal MetricChip primitive used across all pages
- ✅ Custom SVG CandleChart with OB rectangles, entry markers, TP/SL lines, win/loss markers
- ✅ All 11 pages polished:
  - Overview, StrategyBuilder, Runs, RunDetail, StrategyMap (core 7 fully polished)
  - SweepLab (7 tabs, leaderboard, trophy/skull cards, heatmap)
  - ParityDebugger (8 KPI chips, mismatch tab, preview chart, side-by-side diff)
  - ComparisonLab, TradeInspector, MonteCarlo, Settings
- ✅ Rich mock data: 24 runs, 137 trades, sweep grids (RR, SB, EB, VT, TF, Pair, Session), 31 parity mismatches, MC drawdown distribution + confidence bands
- ✅ Research-only boundary: no live-trading UI anywhere; explicit disclaimer in Strategy Builder + Settings safety notes
- ✅ Testing agent: 58/58 checks passed, 100% frontend pass rate

## Prioritized Backlog
### P1 (next iteration)
- Wire `CandleChart` to lightweight-charts when Python engine outputs are available
- File-system data adapter to read `outputs/runs/*.json` and `outputs/sweeps/*.csv` directly (Electron/Tauri or local bridge)
- CSV/JSON import in Strategy Builder ("Load Config")

### P2
- Persist Strategy Builder configs locally (named presets)
- Multi-run Comparison (3+ runs)
- Real Monte Carlo engine integration with percentile bands
- Annotation/notes layer per trade (Trade Inspector "Notes" tab)
- Export Strategy Map screenshot

## Out of Scope (Hard Boundary)
- Live broker connection
- Order placement / cancellation
- Kill switches / live trading controls
- Account balance / equity from broker
- Real-time price feed

## Next Tasks (for follow-up sessions)
1. Hook real Python engine JSON output to `data/mock.js` adapter
2. Replace SVG candle chart with lightweight-charts (preserve component API)
3. Add config save/load via local file
