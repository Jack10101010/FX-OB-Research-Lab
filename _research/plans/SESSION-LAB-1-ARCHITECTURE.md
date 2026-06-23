# SESSION-LAB-1: Session Lab Architecture Design

**FX-OB Research Lab | Audit + Product Design**
**Mode: DO NOT IMPLEMENT — NO FILE CHANGES**

---

## 1. Current Data Availability

### Verdict Key

- ✅ Available now — field exists on imported trade objects post-importer.js
- 🔶 Derived — calculable from existing fields with frontend logic
- 🔸 Needs enrichment — field exists on OB objects but is NOT joined onto trades in `enrichTradesWithOrderBlocks()`
- ❌ Needs backend export — not present anywhere in current CSV output

| Desired Metric | Status | Source Field(s) | Notes |
|----------------|--------|-----------------|-------|
| Fill session | ✅ | `trade.fillSession` / `trade.fill_session` / `trade.session` | Primary — exported by backtester |
| Entry session (derived) | 🔶 | `sessionOf(trade.entry)` | Fallback only — UTC cutoffs, missing NY PM |
| OB created session | 🔸 | `ob.obOriginSession` | Parsed from OB CSV but NOT spread to trades in `enrichTradesWithOrderBlocks()` |
| OB origin session (detection) | 🔸 | `ob.obDetectionSession` | Same gap as above |
| Hour of entry | 🔶 | `new Date(trade.entry).getUTCHours()` | Already used in `entryHour()` in failuresUtils |
| Day of week | 🔶 | `new Date(trade.entry).getUTCDay()` | Already used in `entryWeekday()` |
| Direction (Long/Short) | ✅ | `trade.direction` | Already normalised to "Long" / "Short" |
| BOS vs CHoCH | ✅ | `trade.structure` | Already normalised to "BOS" / "CHoCH" |
| Entry model | ✅ | `trade.entry_model` / `trade.entry_model_key` / `trade.entryFamily` | All three present |
| Penetration % | ✅ | `trade.trigger_penetration_pct`, `trade.max_ob_penetration_pct`, `trade.entry_depth_pct` | Multiple flavours; use `trigger_penetration_pct` for triggered-edge |
| Trigger delay (candles) | ✅ | `trade.fill_delay_candles` | 0 = same candle, 1 = next, 2+ = delayed |
| R target (rr_config) | ✅ | `trade.rr_config` | Configured RR at trade time |
| Stop buffer | ✅ | `trade.stop_buffer` | As a %, e.g. 0 / 0.001 / 0.005 |
| BE / Trailing (protection mode) | ✅ | `trade.protection_mode` | "none", "trailing", "move_to_be", etc. |
| OB width (pips) | ✅ | `trade.obWidthPips` | Computed in `enrichTradesWithOrderBlocks()` from OB top/bot + pipSize |
| News-originated OB | ✅ | `trade.obCreatedDuringNews` / `trade.ob_origin_news_window` | Boolean; also `obOriginMinutesFromNews` for proximity |
| Time to exit (any) | ✅ | `trade.minutes_to_exit` / `trade.bars_to_exit` | Covers all exits, wins and losses |
| Time to stopout specifically | 🔶 | Filter `minutes_to_exit` where `outcome === "Loss"` | No separate SL/TP field — derive by outcome |
| Time to target specifically | 🔶 | Filter `minutes_to_exit` where `outcome === "Win"` | Same approach |
| Per-trade MAE | ❌ | Not exported per trade | Only present as averages in summary JSON (e.g. `entryResults.summary.avg_mae`) |
| Per-trade MFE | ❌ | Not exported per trade | Same as MAE |
| Loss streak clustering | 🔶 | `computeStreakStats()`, `buildStreakContext()` | Already fully implemented in `failuresAnalytics.js` |
| OB width bucketed | 🔶 | `trade.obWidthPips` already available | Needs bucket() wrapper (< 5 / 5–10 / 10–15 / 15+) |
| News proximity (minutes from news) | ✅ | `trade.obOriginMinutesFromNews` / `trade.ob_origin_minutes_from_news` | Full news event metadata on trade |

---

### Critical Finding 1: OB Session Fields Are Not On Trades

`ob.obOriginSession` and `ob.obDetectionSession` are parsed correctly in `parseOrderBlocksCSV()` but are **not** spread onto trades in `enrichTradesWithOrderBlocks()`. The OB Analysis tab requires these fields. Fix is 2 lines in `importer.js`:

```js
obOriginSession:    ob?.obOriginSession    || trade.obOriginSession    || "",
obDetectionSession: ob?.obDetectionSession || trade.obDetectionSession || "",
```

---

### Critical Finding 2: sessionOf() UTC Cutoffs — Missing NY PM

The existing `sessionOf()` function in `entryFormatters.js` uses hardcoded UTC cutoffs and does **not** include "NY PM" (17:00–20:00 EST ≈ 22:00–01:00 UTC). Every trade with `session = "NY PM"` exported by the Python backtester currently falls through to "Outside" if the frontend tries to derive session from timestamp.

**Session Lab must use `trade.fillSession` as its primary source**, not `sessionOf(trade.entry)`. The fallback derivation should only be used when `fillSession` is empty. This means NY PM trades will display correctly without any code change, as long as the CSV contains the `fill_session` column.

A separate SESSIONS constant update is needed (see Appendix).

---

## 2. Recommended Session Lab Information Architecture

### Mental Model

The page is a session-first performance OS. It answers:

> "What does each session actually do to my edge, and what should I do about it?"

Not: "Here is your data, filtered by session."
Yes: "Here is London Killzone's personality — what works, what doesn't, and what to do about it."

### Page Structure

```
SessionLab (/session-lab)
│
├── [Top Bar]  Direction Toggle: Both | Long Only | Short Only
│              Compare To: All Sessions dropdown (optional Phase 2)
│              Date Range chip (inherits from active run)
│
├── [Section 1] Session Overview — 6 large cards in a 3-col grid
│   ├── Asia card
│   ├── London Killzone card
│   ├── London Lull card
│   ├── New York card
│   ├── NY PM card
│   └── Outside Session card
│
├── [Section 2] Session Drilldown — inline below selected card
│   Tabs: Overview · Breakdowns · Time Analysis · OB Analysis · Failures · Streaks
│
├── [Section 3] Session Comparison Table — all sessions as rows
│
└── [Section 4] Rule Candidates — Phase 3 only
```

---

## 3. Session Card Design

Each card is a tall `NeonPanel` with full-width or 2/3-column layout.

### Header Strip

```
[Emoji/Icon] London Killzone          [Verdict: STRONG ●]
07:00–10:00 EST                       ↗ mini sparkline
```

### P0 Metric Row (always visible)

| Metric | Calculation | Source |
|--------|-------------|--------|
| Net R | `sum(t.r)` for session trades | `trade.r` |
| Win Rate | `wins / (wins + losses)` | canonical |
| Expectancy | `Net R / N` | derived |
| Profit Factor | `grossWin / abs(grossLoss)` | `computeProfitFactor()` from `metrics.js` |
| Max Drawdown | `computeMaxDrawdown(sessionEquityCurve)` | scoped equity curve |
| Trades | `N` | count |
| Longest Streak | `computeStreakStats(sessionTrades).maxStreak` | `failuresAnalytics.js` |

### P1 Metric Row (visible when card is expanded, or in "detailed" view mode)

| Metric | Source | Phase |
|--------|--------|-------|
| Avg Time To Stopout | avg `minutes_to_exit` for losing trades | Phase 1 (derive) |
| Avg Time To Target | avg `minutes_to_exit` for winning trades | Phase 1 (derive) |
| Avg MAE | per-trade field (not yet available) | Phase 2 |
| Avg MFE | per-trade field (not yet available) | Phase 2 |

### Breakdown Snapshot (3 mini-columns inside card)

```
Direction     Structure     Entry Model
Long: +21.3R  CHoCH: +12.5  TE Delay+2: +14.2
Short: +9.9R  BOS: +18.7R   Best model chip
```

These are not tables — they are compact summary chips inside the card. Full tables live in the drilldown.

### Verdict Logic

```
"Strong"    → netR > 0 AND winRate > 52 AND profitFactor > 1.5
"Selective" → (netR > 0 OR winRate > 45) AND NOT Avoid conditions
"Avoid"     → netR < 0 OR winRate < 40 OR maxDD < -8R
```

Displayed as a colour-coded pill:
- Strong → `text-success` border
- Selective → `text-warning` border
- Avoid → `text-danger` border

---

## 4. Session Drilldown Design

Clicking a card expands an inline drilldown panel immediately below the selected card's row in the grid. Alternatively this can be a detail route `/session-lab/:session`.

Tabs use the existing Tabs component pattern (matching the reference image exactly).

---

### Overview Tab

- All P0 + P1 metrics in a 4-column stat grid (same layout as Run Detail hero)
- **EquityCurve** (`EquityCurve` component): trades filtered to this session, equity computed from session trades only. Shows drawdown strip.
- **Day of Week table**: Mon–Fri, Net R / WR / Trades per day. Reuses `buildWeekdayFailureStats()` scoped to session trades.
- **Hourly Net R bar chart**: 24 hours, green/red bars by avg R. Built from `buildHourGrid()` scoped to session.

---

### Breakdowns Tab

Each sub-section is a `CanonicalBucketTable` with `bare=true` for compact inline embedding. All 6 tables shown in a 2-3 column grid.

| Table | Bucket Key | labelFn | Source Field |
|-------|-----------|---------|-------------|
| Long vs Short | direction | `t => t.direction` | `trade.direction` |
| BOS vs CHoCH | structure | `t => t.structure` | `trade.structure` |
| Entry Model | entry_model | `t => t.entry_model_key \|\| t.entry_model \|\| "Baseline"` | `trade.entry_model_key` |
| Trigger Delay | delay_candles | `t => {const d = t.fill_delay_candles; ...}` → "Same / Delay+1 / Delay+2+" | `trade.fill_delay_candles` |
| Penetration % | pct_bucket | bucket by 0–10 / 10–25 / 25–50 / 50–100% | `trade.trigger_penetration_pct` |
| Stop Buffer | stop_buffer_bucket | bucket by 0 / 0.1–0.5% / 0.5%+ | `trade.stop_buffer` |
| R Target | rr_config | `t => String(t.rr_config ?? "?") + "R"` | `trade.rr_config` |
| BE / Trailing | protection_mode | `t => t.protection_mode \|\| "None"` | `trade.protection_mode` |

Each table columns: N · Wins · Losses · Win Rate · Net R · Expectancy (all already in `CanonicalBucketTable` schema).

---

### Time Analysis Tab

**Hourly Net R bar chart** — 24 bars, colour-coded
- Data: group session trades by `entryHour(t)`, compute avg R per hour
- Reuses: `buildHourGrid()` from `entryAnalytics.js`

**Win vs Loss by Hour** line chart overlay (Win count / Loss count per hour)
- Reuses: `computeWinFailureDeltaByHour()` from `failuresAnalytics.js`

**Day of Week table** — sortable DataTable
- Columns: Day · Trades · Wins · Losses · Win Rate · Net R
- Reuses: `buildWeekdayFailureStats()` scoped to session trades

**Hour × Day heatmap** (Phase 2)
- Reuses: `computeHourlyFailureMatrix()` and the `FailuresHeatmap` component pattern

---

### OB Analysis Tab

Requires the `obOriginSession` / `obDetectionSession` enrichment fix (Section 1, Finding 1).

**OB Origin Session breakdown**
- "Which session spawned the OBs that are trading in THIS session?"
- `CanonicalBucketTable`, `labelFn = t => t.obOriginSession || "Unknown"`

**OB Detection Session breakdown**
- "Which session detected/confirmed the OBs trading here?"
- `CanonicalBucketTable`, `labelFn = t => t.obDetectionSession || "Unknown"`

**News-originated OBs**
- Side-by-side metric row: News OBs (where `obCreatedDuringNews === true`) vs Clean OBs
- Net R / WR / Count for each group
- If news OBs materially underperform, surface a warning chip on the session card

**OB Width Buckets**
- `CanonicalBucketTable`, bucket by `obWidthPips`: <5 / 5–10 / 10–15 / 15+
- Identifies if wide OBs are structural drag in this session

---

### Failure Analysis Tab

Reuses existing Failures Lab components directly — just pass `sessionTrades` instead of all trades:

| Component | Usage |
|-----------|-------|
| `SessionFailures` | Already shows failure rates, directional split, top archetype — scoped to one session |
| `StreakAnalysis` | Top 5 worst streaks with session/direction context (already session-aware) |
| `StreakDotStrip` | W/L dot strip, colour-coded by whether the loss was Long or Short |
| `DirectionalAsymmetry` | Long vs Short loss profile for this session |
| `computeFalseLosserCandidates()` | Fast-stopout candidates — show count as a warning chip |

Surface as quick-scan "failure flags" on the session card:
- Fast Stopouts: `N trades stopped < 30 min`
- News OBs: `X% of losses were news-origin OBs`
- Worst Hour: `11:00 UTC — 72% loss rate`

---

### Streaks Tab

| Panel | Reuses |
|-------|--------|
| Streak Leaderboard (top 5) | `buildStreakLeaderboard()` |
| Streak Context ("4 of 5 losses were London Longs") | `buildStreakContext()` |
| P(Loss after Loss) | `computeSequenceDependency()` |
| Wald-Wolfowitz randomness test | `buildRunsTest()` |
| Loss Burst Detection (Phase 2) | `buildBurstDetection()` |

---

## 5. Long vs Short Workflow

### Direction Toggle

Three-way segment control at the top of the page:

```
Direction:  [Both]  [Long Only]  [Short Only]
```

Persisted in localStorage: `fxob_session_lab_direction_v1`

When "Long Only" or "Short Only" is active:
- All session cards recompute metrics using direction-filtered trades
- Verdict badges recalculate
- A banner below the toggle shows: "Viewing: Longs Only — Shorts hidden from all metrics"
- Drilldown breakdowns scoped to selected direction

### Session-Specific Direction Exclusions (Phase 3)

A per-session filter chip allows: "For London Lull — exclude Shorts."
This would stack on top of the global direction toggle, letting the researcher define separate rules per session before viewing a merged result.

UI: small filter chip on the bottom of each card showing active exclusions. Clicking opens a rule builder.

### Recommended Research Workflow

```
Step 1: Set Direction = Long Only
        → Inspect each session card
        → Note: London + CHoCH + Delay+2 → strong
        → Note: Same-candle entry in London → drag

Step 2: Set Direction = Short Only
        → Compare. London Shorts may be weaker. BOS Shorts in NY may win.

Step 3: Set Direction = Both
        → See merged result
        → Note any sessions where the combined result hides asymmetry

Step 4 (Phase 3): Build session rules:
        "Disable same-candle entries in London Lull"
        "Disable Shorts in Asia"
        → Preview merged model Net R with rules applied
```

This workflow is fully supported by the direction toggle alone in Phase 1. Phase 3 adds the rule preview layer using `computePreventionRules()` and `buildMixedDirectionSimulation()` (both already in `failuresAnalytics.js` and `entryAnalytics.js`).

---

## 6. Failure Analysis — Session Diagnostics

### Fast Stopouts

- **Definition**: `trade.minutes_to_exit < 30 AND outcome === "Loss"` (or `bars_to_exit < 5`)
- Per-session: fast stopout count, % of session losses, avg R
- Already typed in the archetype system: `t.archetype === "fast_stopout"` (from FailuresLab classifier)
- Surface: warning chip on session card if fast stopouts > 25% of session losses

### Repeated Losses / Streak Clustering

- `buildStreakContext()` already enriches each streak zone with session/direction concentration
- Session Lab shows: "In your 7-trade losing streak, 5 were London Shorts at 08:30–09:00"
- `buildBurstDetection()` (Phase 2) identifies dense multi-session loss windows

### News-Origin OBs

- Source: `trade.obCreatedDuringNews === true`
- Per-session: Win Rate and Net R of news-origin vs clean OBs
- Sessions most exposed: London (BOE/ECB) and New York (NFP/FOMC/CPI)
- Surface as OB Analysis sub-panel + warning chip if news OBs underperform by > 15% WR

### OB Width Problems

- Source: `trade.obWidthPips`
- Wide OB (>15 pips) in some sessions = structural drag (stop too far, entries never fill cleanly)
- Narrow OB (<5 pips) = susceptible to spread violations and fast-invalidation
- Per-session OB Width Buckets table (OB Analysis tab) surfaces this directly

### Bad Structure / Bad Entry Model Per Session

- CanonicalBucketTable breakdowns in Breakdowns tab expose worst combo
- Session Lab adds: a "Bottom Performer" chip on the card showing the worst structure + model combination:
  e.g. `Worst: BOS + Same Candle → -4.2R`

### Poor Time Window

- Time Analysis tab surfaces worst hours within each session
- Phase 3 rule builder converts these into candidate rules:
  `"Avoid 11:00–12:00 UTC in London Lull"` → `netRDelta: +2.1R` if excluded

---

## 7. Implementation Phases

### Phase 1 — MVP Session Lab

**Data used:** All existing fields on trades post-import (no backend changes needed). Requires the 2-line `obOriginSession` enrichment in `importer.js`.

**What this ships:**

1. Direction toggle (Both / Long Only / Short Only) — global state, localStorage
2. 6 session cards with P0 metrics + Verdict badges + mini sparklines
3. Inline drilldown with 3 tabs per session: Overview / Breakdowns / Time Analysis
4. Per-session breakdown tables: Direction, Structure, Entry Model, Delay, Penetration, Stop Buffer, R Target, Protection Mode
5. Per-session equity curve (EquityCurve, session-scoped)
6. Hourly Net R chart + Day of Week table
7. Streak analysis tab (reuse StreakAnalysis + buildStreakContext)
8. Session Comparison Table at bottom (CanonicalBucketTable, all sessions as rows)
9. 2-line importer.js fix for `obOriginSession` enrichment

**Estimated new files:** `SessionLab.jsx` + `SessionLabWorkspace.jsx` + `SessionCard.jsx` + `SessionDrilldown.jsx` + `sessionAnalytics.js` + route/sidebar additions = ~6 files

---

### Phase 2 — Deeper Session Drilldowns

**Additional data required:** Per-trade `mae` and `mfe` fields from backtester export

**What this ships:**

1. P1 metrics on cards: Avg MAE, Avg MFE, Avg Time To Stopout, Avg Time To Target
2. OB Analysis tab (uses `obOriginSession` / `obDetectionSession` now on trades)
3. News-origin OB breakdown with performance split
4. OB Width bucket analysis
5. Fast Stopout analysis panel with StreakDotStrip
6. Loss Burst Detection visualisation (`buildBurstDetection()`)
7. Sequence dependency display (`computeSequenceDependency()`)
8. Session overlay equity curve (multiple sessions on one chart, optional)
9. Hour × Day heatmap (reuse `FailuresHeatmap` component)

---

### Phase 3 — Rule Builder

**What this ships:**

1. Session Filter Builder — per-session rule proposals:
   - Disable direction in session
   - Disable structure in session
   - Disable entry model in session
   - Disable hour window in session
   - Avoid news-origin OBs in session
   - Avoid trades after N losses in session
2. Rule preview: Net R impact of each candidate rule (reuses `computePreventionRules()`)
3. Long Model / Short Model separate criteria display
4. Merged Model Preview (`buildMixedDirectionSimulation()` from `entryAnalytics.js`)
5. Rule export: download session config as JSON

---

## 8. File / Component Plan

### New Route

```
/session-lab  →  frontend/src/pages/SessionLab.jsx
```

Sidebar entry: under ANALYSIS LABS, between Order Block Lab and Failures Lab. Icon: `Clock` from lucide-react.

### New Files

```
frontend/src/pages/SessionLab.jsx
  — Page wrapper. Reads bundle via useDataset(). Renders SessionLabWorkspace.
    Shows ImportZone if no active run.

frontend/src/components/lab/session/
  SessionLabWorkspace.jsx
    — Top-level layout. Direction toggle state (localStorage). Session card grid (3-col).
      Expanded drilldown panel inline below selected card row.
      Session comparison table at bottom.

  SessionCard.jsx
    — One session card. Props: { session, metrics, profile, direction, onSelect, isSelected }
      Displays P0 metrics, Verdict badge, mini sparkline, breakdown snapshot chips.
      Clickable; onSelect() triggers drilldown below.

  SessionDrilldown.jsx
    — Tabbed panel for one session. Tabs: Overview · Breakdowns · Time Analysis · OB Analysis · Failures · Streaks
      Each tab is a self-contained section. Passes sessionTrades down to sub-components.

  SessionComparisonTable.jsx
    — CanonicalBucketTable (full mode) with all sessions as rows.
      Rows built by buildSessionComparisonRows(profiles).

  SessionEquityPanel.jsx
    — Thin wrapper around EquityCurveV2. Filters trades to session, builds equity array,
      passes to EquityCurveV2 with height=240 and showDrawdown=true.

frontend/src/components/lab/session/analytics/
  sessionAnalytics.js
    — Pure analytics module. No React. No side-effects. Safe in useMemo.
      Exports:
        computeSessionMetrics(trades, session, direction) → P0 + P1 metrics + verdict
        buildSessionProfiles(trades, direction) → array of full session profiles
        buildSessionComparisonRows(profiles) → CanonicalBucketTable-compatible rows
        buildSessionBreakdowns(sessionTrades) → all bucket arrays for Breakdowns tab
        buildSessionTimeProfile(sessionTrades) → hourly + weekday data
        buildSessionOBProfile(sessionTrades) → OB origin/width/news data (Phase 2)
```

### Modified Files (Phase 1)

```
frontend/src/data/importer.js
  enrichTradesWithOrderBlocks() — add 2 fields:
    obOriginSession:    ob?.obOriginSession    || trade.obOriginSession    || "",
    obDetectionSession: ob?.obDetectionSession || trade.obDetectionSession || "",

frontend/src/components/lab/AppShell.jsx  (or Sidebar.jsx)
  — Add "Session Lab" nav link between Order Block Lab and Failures Lab

frontend/src/App.js
  — Add import + Route for /session-lab
```

### Reused Without Modification

| File | Used For |
|------|----------|
| `CanonicalBucketTable` | All breakdown tables (Direction, Structure, Model, etc.) |
| `TableCompareShell` | Optional run-to-run session comparison (Phase 2) |
| `EquityCurve` / `EquityCurveV2` | Per-session equity curves |
| `NeonPanel`, `DataTable`, `Pill`, `MetricChip` | Layout primitives |
| `StreakAnalysis`, `StreakDotStrip` | Streaks tab |
| `SessionFailures` | Failures tab (scoped to single session trades) |
| `DirectionalAsymmetry`, `DirectionDivergingBar` | Directional split panel inside Breakdowns |
| `FailuresHeatmap` | Time Analysis heatmap (Phase 2) |
| `buildDirectionSplit()` | Direction breakdown |
| `computeStreakStats()`, `buildStreakContext()`, `buildStreakLeaderboard()` | Streaks tab |
| `buildRunsTest()`, `computeSequenceDependency()` | Streaks tab statistical tests |
| `buildBurstDetection()` | Failure Analysis (Phase 2) |
| `buildWeekdayFailureStats()`, `computeHourlyFailureMatrix()` | Time Analysis tab |
| `computeSessionFailureRates()`, `computeOriginFillMatrix()` | Failure tab |
| `PREVENTION_RULES`, `computePreventionRules()` | Rule builder (Phase 3) |
| `buildMixedDirectionSimulation()` | Merged model preview (Phase 3) |
| `sessionOf()`, `SESSIONS` | Session labelling fallback |
| `summarizeBuckets()`, `toCanonicalBucketRow()` | Fed into CanonicalBucketTable |
| `computeMaxDrawdown()`, `computeProfitFactor()` | Per-session metric calculations |
| `useDataset()`, `useTradeUniverse()` | Active run + canonical trades |
| `useResultsLens()` | Results Basis (Raw R / Current Equity) respects global toggle |

---

## 9. Open Questions

**1. NY PM session in frontend constants**
The backend exports `fill_session = "NY PM"` for trades in 17:00–20:00 EST. The frontend `SESSIONS` constant and `sessionOf()` function don't know about it — they bucket everything ≥ 17:00 UTC as "Outside". Should SESSIONS be updated to include "NY PM" and should `sessionOf()` be updated with the correct UTC offset? Or is this Session Lab's problem to solve by reading `fillSession` exclusively?

**2. Session Lab as standalone page vs embedded**
Should this be top-level nav only (`/session-lab`), or also accessible as a tab inside RunDetail? The reference image shows it as a sidebar item, which is correct. But a "deep link" from RunDetail ("Open Session Lab for this run") would be useful.

**3. OB session enrichment: re-import vs runtime join**
The `obOriginSession` fix in `importer.js` only applies to newly imported bundles. Old bundles won't have it. Options:
- (a) Add runtime join: `sessionAnalytics.js` joins OBs from `bundle.orderBlocks` by `trade.obId` at query time — no re-import needed, slightly more expensive
- (b) Accept re-import requirement — document it clearly in the UI
Option (a) is safer for backwards compatibility.

**4. "Compare to: All Sessions" reference image feature**
The reference image has a "Compare to: All Sessions" dropdown at the top. This compares one session's performance against the aggregate of all sessions. Straightforward to implement (pass both session-filtered and unfiltered trades to the same metric calculator). Should this be Phase 1?

**5. Per-trade MAE/MFE timeline**
MAE/MFE are listed as P1 metrics but require a backtester CSV export change. What's the timeline? If > 3 months out, Phase 2 should use `minutes_to_exit` and `bars_to_exit` as proxies for "how quickly did the trade go against us" (fast losers = bad OB quality signal). If close, Phase 2 holds space for real MAE/MFE.

**6. Verdict calibration**
The Strong / Selective / Avoid thresholds (WR 52%, PF 1.5, MaxDD -8R) are starting points. They should be validated against real run data. Consider making them user-configurable in Session Lab settings (or derive them dynamically: `Strong = top third of sessions by expectancy`).

**7. Multi-run session comparison**
`TableCompareShell` already supports run A vs run B comparisons. Should Session Lab surface: "London performance changed from Run A (+31R) to Run B (+18R)?" This would be a natural Phase 2 addition using the existing `TableCompareShell` wrapper around `SessionComparisonTable`.

**8. Session Lab and active run scope**
Session Lab should always operate on the currently active run's trade universe (same as other labs). It should not introduce its own run selector — it inherits from the global `activeRunId`.

---

## 10. Suggested First Implementation Prompt

```
MODE: IMPLEMENT

TASK: SESSION-LAB-PHASE1 — Build Session Lab Page (MVP)

CONTEXT:
Building the Session Lab for FX-OB Research Lab. Architecture design is in
SESSION-LAB-1-ARCHITECTURE.md. Phase 1 only — do not implement Phase 2 or 3 features.
No changes to any existing lab page.

SCOPE: 6 new/modified files, ~600 lines total. All analytics pure JS.
All UI follows existing NeonPanel / CanonicalBucketTable / DataTable patterns exactly.

─────────────────────────────────────────────────────────────────────────────
FILE 1: frontend/src/components/lab/session/analytics/sessionAnalytics.js
─────────────────────────────────────────────────────────────────────────────
Pure analytics module. No React. No side-effects. Safe inside useMemo.

Session field resolution (ALWAYS in this order):
  1. trade.fillSession (primary — backend-tagged)
  2. trade.fill_session (alias)
  3. trade.session (legacy)
  4. sessionOf(trade.entry) (UTC fallback — only when all above are empty)

SESSIONS to support: ["Asia", "London", "London Lull", "New York", "NY PM", "Outside", "Unknown"]

Export:

computeSessionMetrics(trades, session, direction)
  → { netR, winRate, expectancy, profitFactor, maxDD, tradeCount, longestStreak, verdict,
      longNetR, shortNetR, avgTimeToStopout, avgTimeToTarget }

  Filter trades to session (using resolution order above).
  Apply direction filter if direction !== "both".
  Compute all metrics. Max drawdown: run a running equity sum over session trades only.
  Longest streak: reuse computeStreakStats().
  Verdict: "Strong" = netR>0 AND winRate>52 AND profitFactor>1.5;
           "Avoid"  = netR<0 OR winRate<40 OR maxDD<-8;
           else "Selective".
  avgTimeToStopout: avg minutes_to_exit for trades where outcome==="Loss" AND minutes_to_exit != null.
  avgTimeToTarget:  avg minutes_to_exit for trades where outcome==="Win" AND minutes_to_exit != null.

buildSessionProfiles(trades, direction)
  → array of profile objects, one per session in SESSIONS.
  Each profile: { session, metrics: computeSessionMetrics(...), sessionTrades: filtered trades }

buildSessionComparisonRows(profiles)
  → flat rows compatible with CanonicalBucketTable rawRows shape:
    { label: session, rows: count, wins, losses, winRate, netR, expectancy, profitFactor }
  Used to build the bottom "All Sessions" comparison table.

buildSessionBreakdowns(sessionTrades)
  → { directionBuckets, structureBuckets, entryModelBuckets, delayBuckets,
      rTargetBuckets, stopBufferBuckets, protectionBuckets }
  Each bucket is an array of { label, rows, wins, losses, winRate, netR, expectancy }
  compatible with CanonicalBucketTable rawRows.
  Use the existing bucket() helper from entryAnalytics.js.

buildSessionTimeProfile(sessionTrades)
  → { weekdayStats, hourlyStats }
  weekdayStats: reuse buildWeekdayFailureStats(sessionTrades) from failuresAnalytics.js.
  hourlyStats:  reuse buildHourGrid(sessionTrades) from entryAnalytics.js — 
                returns { cells, total, maxAbs } for hourly net R bars.

─────────────────────────────────────────────────────────────────────────────
FILE 2: frontend/src/data/importer.js  (2-line addition only)
─────────────────────────────────────────────────────────────────────────────
In enrichTradesWithOrderBlocks(), after the obDirection line, add:
  obOriginSession:    ob?.obOriginSession    || trade.obOriginSession    || "",
  obDetectionSession: ob?.obDetectionSession || trade.obDetectionSession || "",

─────────────────────────────────────────────────────────────────────────────
FILE 3: frontend/src/components/lab/session/SessionCard.jsx
─────────────────────────────────────────────────────────────────────────────
Props: { session, metrics, sessionTrades, onSelect, isSelected }

Layout: NeonPanel. clip-bevel-sm. Border highlight when isSelected.
Header: session name (font-ui uppercase tracking-wider text-accent-primary),
        time range string (const SESSION_TIME_RANGES map),
        Verdict pill (colour-coded: success/warning/danger based on metrics.verdict).
Metrics grid: Net R (ColoredR), Win Rate %, Expectancy, PF, MaxDD (ColoredR), Trades, Streak.
Direction chips: "L: {longNetR}" in success colour, "S: {shortNetR}" in bear colour.
Mini sparkline: MiniLine component, data = running cumulative R array from sessionTrades,
                height 40px, no axes.
Entire card: onClick → onSelect(session). cursor-pointer.

SESSION_TIME_RANGES:
  Asia:          "00:00–07:00 EST"
  London:        "07:00–10:00 EST"
  London Lull:   "10:00–13:00 EST"
  New York:      "13:00–17:00 EST"
  NY PM:         "17:00–20:00 EST"
  Outside:       "20:00–00:00 EST"

─────────────────────────────────────────────────────────────────────────────
FILE 4: frontend/src/components/lab/session/SessionDrilldown.jsx
─────────────────────────────────────────────────────────────────────────────
Props: { session, metrics, sessionTrades, allTrades, direction }

Tabs (use Tabs + TabsList + TabsContent from components/ui/tabs.jsx):
  Overview · Breakdowns · Time Analysis · Streaks

Overview tab:
  — 4-column metric grid: all P0 metrics + avgTimeToStopout + avgTimeToTarget
  — SessionEquityPanel (defined below): passes sessionTrades
  — Day of week DataTable: buildWeekdayFailureStats(sessionTrades) → sortable table
    Columns: Day · Trades · Wins · Losses · Win Rate · Net R

Breakdowns tab:
  — NeonPanel "Breakdowns" with 2-3 column CSS grid (gap-3)
  — Each cell: small label above + CanonicalBucketTable bare=true bareHeatmap=true
    Tables: Direction · Structure · Entry Model · Trigger Delay · Penetration % · Stop Buffer
  — All tables built from buildSessionBreakdowns(sessionTrades)

Time Analysis tab:
  — "Hourly Net R" section: 24-bar recharts BarChart
    data = hours 0–23, each bar = sum of R for trades in that hour
    Positive bars: success colour. Negative: danger colour.
  — "Day of Week" section: same DataTable as Overview tab but here full-width

Streaks tab:
  — Import StreakAnalysis from failures/streaks/StreakAnalysis.jsx
  — Pass: losers=filterLosers(sessionTrades), allLosers=filterLosers(sessionTrades),
          allTrades=sessionTrades, trades=sessionTrades
    (Reuse StreakAnalysis directly — it already handles session scoping when passed
    session-filtered trades)

─────────────────────────────────────────────────────────────────────────────
FILE 5: frontend/src/components/lab/session/SessionLabWorkspace.jsx
─────────────────────────────────────────────────────────────────────────────
Props: { trades, bundle }

State:
  direction — "both" | "long" | "short" — localStorage "fxob_session_lab_direction_v1"
  selectedSession — string | null

Compute:
  profiles = useMemo(() => buildSessionProfiles(trades, direction), [trades, direction])
  comparisonRows = useMemo(() => buildSessionComparisonRows(profiles), [profiles])

Direction toggle: Segment component (controls.jsx) with options Both/Long/Short.
Banner when not "both": muted banner below toggle saying which direction is hidden.

Session card grid: CSS grid, 3 columns desktop / 2 tablet / 1 mobile.
  Render SessionCard for each profile where profile.metrics.tradeCount > 0.
  Pass isSelected = (selectedSession === profile.session).
  onSelect: set selectedSession (toggle off if already selected).

Drilldown: if selectedSession, render SessionDrilldown immediately below the card grid row
  (not at the very bottom — inline, visually connected to the selected card).
  Wrap in a transition for smooth expansion.

Session Comparison Table:
  Heading "Session Comparison" with basis chip.
  CanonicalBucketTable (full, not bare):
    title="All Sessions"
    rawRows={comparisonRows}
    trades={trades filtered to direction}
    def={{ labelFn: t => resolveSession(t), order: SESSIONS }}

─────────────────────────────────────────────────────────────────────────────
FILE 6: frontend/src/pages/SessionLab.jsx
─────────────────────────────────────────────────────────────────────────────
Standard lab page pattern (match EntriesLab.jsx structure):

import { useDataset } from "@/data/store";
import { useTradeUniverse } from "@/data/useTradeUniverse";
import { ImportZone } from "@/components/lab/ImportZone";
import { SessionLabWorkspace } from "@/components/lab/session/SessionLabWorkspace";

Render ImportZone if no bundle loaded.
useTradeUniverse() to get canonical trades.
Pass trades + bundle to SessionLabWorkspace.

─────────────────────────────────────────────────────────────────────────────
FILES 7+8: App.js route + Sidebar nav link
─────────────────────────────────────────────────────────────────────────────
App.js: import SessionLab; add <Route path="/session-lab" element={withRouteBoundary(<SessionLab />)} />
Sidebar.jsx: Add "Session Lab" link (Clock icon) between Order Block Lab and Failures Lab.

─────────────────────────────────────────────────────────────────────────────
STYLE RULES — must match existing labs exactly
─────────────────────────────────────────────────────────────────────────────
All panels: NeonPanel with clip-bevel styling.
No inline styles — Tailwind + CSS variables only.
Metric values: font-num tabular-nums.
Session names: font-ui uppercase tracking-wider text-[hsl(var(--accent-primary))].
Verdicts: Strong = text-[hsl(var(--success))], Selective = text-[hsl(var(--warning))],
          Avoid = text-[hsl(var(--danger))].
Direction toggle: Segment from controls.jsx.
Tabs: shadcn/ui Tabs component (same as FailuresLab).
Tables: DataTable + CanonicalBucketTable (no hand-rolled tables).

─────────────────────────────────────────────────────────────────────────────
DO NOT
─────────────────────────────────────────────────────────────────────────────
- Change EntriesLab, OrderBlockLab, FailuresLab, or any other existing page
- Fabricate data or add mock data
- Add new backtester export fields (other than the 2-line importer.js enrichment)
- Implement Phase 2 or Phase 3 features
- Create a custom equity curve — reuse EquityCurve / MiniLine directly
- Create custom DataTable renderers — use ColoredR and Pill from DataTable.jsx
```

---

## Appendix: SESSIONS Constant Update

Current constant in `entryFormatters.js`:
```js
export const SESSIONS = ["Asia", "London", "London Lull", "New York", "Outside", "Unknown"];
```

Required for Session Lab (add "NY PM"):
```js
export const SESSIONS = ["Asia", "London", "London Lull", "New York", "NY PM", "Outside", "Unknown"];
```

The Session Lab's `sessionAnalytics.js` should define its own local copy of this extended constant to avoid a ripple change across all existing consumers (SessionFailures, failuresAnalytics, etc.) until those are ready.

Current `sessionOf()` UTC cutoffs:
```
0–7h  → Asia
7–10h → London
10–12 → London Lull
12–17 → New York
17+   → Outside   ← NY PM (17–20 EST = 22–01 UTC) is bucketed here incorrectly
```

Since `trade.fillSession` from the backend already tags NY PM correctly, the `sessionOf()` derivation is only a fallback for old data. Session Lab should not rely on it for NY PM detection.
