# Session Lab Decision Cockpit — Frontend Prototype

## Problem Statement
Frontend-only design prototype for FX-OB Research Lab's Session Lab Decision Cockpit page. Premium dark quant-research aesthetic, mounted at `/session-lab`. No backend, no APIs, no database — purely visual with placeholder data so another developer can later wire it to the real backend.

## Architecture
- Single page at `/session-lab` (with `/` redirect)
- Route: React Router v7
- Charts: recharts
- Styling: Tailwind + custom CSS (IBM Plex Sans/Mono + Outfit)
- Icons: lucide-react
- All state local to page (no global store)

## Sections Implemented
1. Header (title + UTC chip + Direction toggle + Preview toggle + 5 action buttons)
2. Run Impact Summary (Baseline → Preview → Delta comparison, hero metrics)
3. Session Control Center (6 session cards: Asia/London/Lull/NY/NY PM/Outside with toggles)
4. Visual Summary Strip (Net R bar, Trades Direction donut, Trades Structure donut, Top Entry Model)
5. Session Deep Dive — 8 switchable tabs:
   - Overview (metrics + equity curve + breakdown snapshot + mini cards)
   - Direction Lab (Long vs Short cards, comparison bars, per-direction entry model dropdowns)
   - Structure Lab (BOS vs CHoCH, donut, line, 2x2 matrix)
   - Entry Model Lab (Long/Short split table, include checkboxes, bar chart, snapshot)
   - Time Analysis (hourly bars + WR heatmap + day of week + hourly summary table)
   - Order Block Lab (origin/detection bars, news vs clean donut, width/age tables, success rate)
   - Failure Analysis (failure cards with red sparklines, cancellation reasons, worst cluster)
   - Streaks (W/L sequence strip with hover tooltip, summary, runs test, distribution)
6. Quick Controls (sticky right panel — direction/structure/entry-model/trigger-delay toggles + 3 action buttons)
7. Impact of This Session (what-if scenarios — disable London / Longs only / BOS only)
8. Help / Legend / Usage Notes

## Mock Data
All data is illustrative placeholder data in `/app/frontend/src/pages/SessionLab/mockData.js`.

## What is NOT Implemented (by design)
- No backend, no MongoDB, no APIs
- No authentication
- No state persistence
- No real analytics computation
- Toggles, dropdowns, and tabs are stateful UI but do not affect actual data — they demonstrate the interaction model only

## Next Action Items
- Wire to real backtest data when integration phase begins
- Implement filter logic to actually re-compute preview metrics
- Persist saved views to backend
- Implement export/share functionality
