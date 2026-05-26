# Failures Lab — Phase 0 + Phase 1 Implementation Plan
**Date:** May 2026  
**Mode:** Implementation planning only — NO coding  
**Source of truth:** `FAILURES_LAB_FULL_PLATFORM_DESIGN.md`  
**Architecture reference:** `components/lab/entries/` (EntriesWorkspace pattern)

---

## 0. Grounding: What Was Read

Before writing this plan, the following files were reviewed in full:

- `FAILURES_LAB_FULL_PLATFORM_DESIGN.md` — full design spec
- `frontend/src/pages/EntriesLab.jsx` — 3-line page shell, the exact pattern to clone
- `frontend/src/components/lab/entries/EntriesWorkspace.jsx` — workspace coordinator pattern
- `frontend/src/components/lab/entries/shared/useEntryWorkspace.js` — state hook pattern (useSearchParams for tab, localStorage for filters)
- `frontend/src/components/lab/entries/shared/WorkspaceTabBar.jsx` — sticky tab bar
- `frontend/src/components/lab/entries/analytics/entryFormatters.js` — reusable utilities to import, NOT duplicate
- `frontend/src/components/lab/entries/analytics/entryRegistry.js` — `sampleConfidence(n)` to import, NOT duplicate
- `frontend/src/components/lab/entries/analytics/entryAnalytics.js` — pure analytics pattern to follow
- `frontend/src/data/store.js` — `useDataset()`, localStorage budget, `fxob_*` key convention
- `frontend/src/App.js` — route registration, `withRouteBoundary` pattern
- `frontend/src/components/lab/Sidebar.jsx` — flat `NAV` array, lucide icons

**Critical findings that shape the plan:**

1. `EntriesLab.jsx` is literally 3 lines. `FailuresLab.jsx` must be identical in pattern.
2. Tab state uses `useSearchParams` (URL-based), not component state. This means the active tab survives navigation and is shareable.
3. `entryFormatters.js` already exports `sessionOf`, `parseDate`, `dayIndex`, `WEEKDAYS`, `SESSIONS`, and all R-formatting helpers. **Import these directly — do not reduplicate.**
4. `entryRegistry.js` already exports `sampleConfidence(n)`. **Import and reuse.**
5. The 4 MB localStorage budget is enforced by `store.js`. All new `fxob_failures_*` keys must be designed to be small (no trade data, only IDs and config).
6. `WorkspaceTabBar` imports `TABS` directly from `useEntryWorkspace`. It needs a **1-line change** (accept `tabs` prop) to be reusable. This is a prerequisite.
7. Existing `ACTIVE_TRADE_VARIANT`, `TRADES`, `ACTIVE_RUN` from `useDataset()` — `TRADES` is the full trade array. All analysis runs off this.

---

## 1. Files to Create

### Phase 0 — Foundation (28 new files)

```
frontend/src/pages/
  FailuresLab.jsx                                  [NEW — 3 lines, mirrors EntriesLab.jsx]

frontend/src/components/lab/failures/
  FailuresWorkspace.jsx                            [NEW — workspace coordinator, ~150 lines]

  shared/
    useFailuresWorkspace.js                        [NEW — state hook: tab, filter, persistence]
    failuresUtils.js                               [NEW — loser filtering, field normalisation]
    failuresRegistry.js                            [NEW — archetype taxonomy, tier definitions]
    failuresFormatters.js                          [NEW — display helpers, archetype tokens]
    failuresAnalytics.js                           [NEW — pure analytics (Tier 0 functions only)]
    archetypeClassifier.js                         [NEW — pure classify(trade) function]
    severityScorer.js                              [NEW — pure scoreSeverity(trade, allTrades)]
    failuresDataQuality.js                         [NEW — field coverage maps, degraded mode flags]

  global/
    FailuresCohortFilter.jsx                       [NEW — persistent cohort filter bar]
    FailuresDataQualityBanner.jsx                  [NEW — per-module field coverage warnings]

  [Phase 0 module placeholder shells — each is a single NeonPanel with "Coming in Phase 1" or real content marker]
  overview/     FailuresOverview.jsx               [NEW — Phase 0: placeholder shell]
  archetypes/   FailureDNA.jsx                     [NEW — Phase 0: placeholder shell]
  temporal/     FailuresTemporal.jsx               [NEW — Phase 0: placeholder shell]
  direction/    DirectionalAsymmetry.jsx           [NEW — Phase 0: placeholder shell]
  sessions/     SessionFailures.jsx                [NEW — Phase 0: placeholder shell]
  streaks/      StreakAnalysis.jsx                 [NEW — Phase 0: placeholder shell]
  prevention/   PreventionEngine.jsx               [NEW — Phase 0: placeholder shell]
  drilldown/    FailureDrilldown.jsx               [NEW — Phase 0: placeholder shell]
  workspace/    SavedForensicViews.jsx             [NEW — Phase 0: placeholder shell]
```

### Phase 1 — Tier 0 Intelligence (35 additional new files)

```
frontend/src/components/lab/failures/

  overview/
    FailureKPIStrip.jsx                            [NEW — 8 headline KPI chips]
    ArchetypeDistributionSummary.jsx               [NEW — treemap or donut view]
    FailureEquityImpact.jsx                        [NEW — EquityCurveV2 + archetype dots]

  archetypes/
    FailureDNACard.jsx                             [NEW — rich single archetype card]
    ArchetypeMatrix.jsx                            [NEW — archetype × dimension heatmap]
    ClassificationConfidencePanel.jsx              [NEW — confidence distribution per archetype]
    FingerprintRadar.jsx                           [NEW — Recharts RadarChart per archetype]

  temporal/
    TemporalHeatmap.jsx                            [NEW — weekday × hour failure rate grid]
    SeasonalPatterns.jsx                           [NEW — monthly / quarterly bar charts]
    WinFailureDelta.jsx                            [NEW — failure vs win rate delta by time]

  direction/
    DirectionMetricsCompare.jsx                    [NEW — paired diverging bar chart]
    DirectionArchetypeBreakdown.jsx                [NEW — side-by-side archetype distributions]
    TailRiskByDirection.jsx                        [NEW — worst-N, CVaR per direction]

  sessions/
    SessionFailureRates.jsx                        [NEW — bar chart per session]
    OriginFillSessionMatrix.jsx                    [NEW — 2D origin × fill grid]
    SessionArchetypeBreakdown.jsx                  [NEW — stacked bar per session]

  streaks/
    ConsecutiveLossPanel.jsx                       [NEW — streak histogram + dot-strip]
    RunsTestPanel.jsx                              [NEW — Wald-Wolfowitz pure statistics]
    SequenceDependency.jsx                         [NEW — P(loss|prior loss) matrix]
    StreakEquityOverlay.jsx                        [NEW — equity curve + streak bands]

  prevention/
    FilterRecommendations.jsx                      [NEW — ranked exclusion rule cards]
    WouldThisHaveHelped.jsx                        [NEW — cohort → filter catch rate table]
    PreventionHypothesisExport.jsx                 [NEW — → HypothesisLab bridge]

  drilldown/
    FailureTradeTable.jsx                          [NEW — sortable/filterable loser DataTable]
    FailureTradeDetail.jsx                         [NEW — right-drawer trade forensic panel]
    ManualTagPanel.jsx                             [NEW — archetype override + note storage]

  workspace/
    ExportSystem.jsx                               [NEW — CSV export + named presets]
    ViewManager.jsx                                [NEW — saved view CRUD UI]
```

---

## 2. Files to Modify

### Phase 0 (required before anything renders)

| File | Change | Risk |
|---|---|---|
| `frontend/src/App.js` | Add 2 lines: `import FailuresLab` + `<Route path="/failures-lab">` | Trivial |
| `frontend/src/components/lab/Sidebar.jsx` | Add 1 entry to `NAV` array | Trivial |
| `frontend/src/components/lab/entries/shared/WorkspaceTabBar.jsx` | Add `tabs` prop with fallback to imported `TABS` constant (1-line change) | Very low |

### Phase 0 — `App.js` change detail

```js
// Add import:
import FailuresLab from "@/pages/FailuresLab";

// Add route (after /hypothesis-lab entry, before /parity):
<Route path="/failures-lab" element={withRouteBoundary(<FailuresLab />)} />
```

### Phase 0 — `Sidebar.jsx` change detail

```js
// Add to NAV array, after HypothesisLab entry:
{ to: "/failures-lab", label: "Failures Lab", icon: Microscope }
// Icon: import Microscope from lucide-react (already installed)
// Alternative icons if Microscope not available: AlertOctagon, Bug, SearchCode, FlaskConical
```

### Phase 0 — `WorkspaceTabBar.jsx` change detail

```js
// Current signature: ({ activeTab, onTabChange, hasActiveFilters })
// New signature:     ({ activeTab, onTabChange, hasActiveFilters, tabs })
// Change: replace TABS reference in JSX with (tabs || TABS)
// This is 1 line change in the map call and keeps backward compatibility.
```

---

## 3. Component Architecture

### 3.1 The Three-Layer Pattern (mirrors EntriesLab exactly)

```
Layer 1: Page Shell
  FailuresLab.jsx (page)
    └── renders <FailuresWorkspace />

Layer 2: Workspace Coordinator
  FailuresWorkspace.jsx
    ├── useDataset()             — trade data from store
    ├── useFailuresWorkspace()   — tab, filter, persistence state
    ├── useMemo: losers          — filtered loser set
    ├── useMemo: classified      — losers + archetype + confidence
    ├── useMemo: severity        — classified + severity scores
    ├── useMemo: cohortFiltered  — severity set filtered by cohort
    ├── FailuresDataQualityBanner
    ├── WorkspaceTabBar (modified, accepts tabs prop)
    ├── FailuresCohortFilter
    └── tab render switch → Module components

Layer 3: Module Components
  Each module receives sharedProps and owns its own internal state.
  No module reaches up to the workspace coordinator.
  No module reaches sideways to another module.
```

### 3.2 `sharedProps` Contract

The workspace coordinator builds `sharedProps` and passes it to every tab component. This is the exact same pattern as `EntriesWorkspace.jsx`.

```js
const sharedProps = {
  // Raw data
  trades,           // all trades (wins + losses)
  losers,           // losses only, unfiltered
  cohortLosers,     // losses filtered by active cohort filter
  classified,       // losers with { archetype, confidence, severity } attached
  cohortClassified, // classified losers filtered by active cohort filter

  // Run context
  activeRun,        // from useDataset()
  activeVariant,    // from useDataset()

  // Filter state (read-only in modules)
  filters,          // cohort filter state

  // Data quality
  dataQuality,      // field coverage object from failuresDataQuality.js
};
```

### 3.3 Data Flow: Losers → Classified → Cohort-Filtered

```
useDataset().TRADES
    ↓ failuresUtils.filterLosers(trades)
losers[]
    ↓ archetypeClassifier.classifyAll(losers, config)
classified[] = losers with { archetype, classificationConfidence }
    ↓ severityScorer.scoreAll(classified)
withSeverity[] = classified with { severity, severityComponents }
    ↓ cohortEngine.applyFilter(withSeverity, filters)
cohortFiltered[]
    ↓ passed as sharedProps.cohortClassified to all modules
```

Each step is a pure function call inside `useMemo`. The entire pipeline re-runs only when `TRADES` or `filters` change. Heavy computation stays out of JSX.

---

## 4. Route and Sidebar Plan

### 4.1 Route

- Path: `/failures-lab`
- Component: `FailuresLab`
- Wrapped with `withRouteBoundary` (consistent with all other routes)
- Tab state persists via URL query param: `/failures-lab?tab=temporal`

### 4.2 Sidebar Entry

- Label: `"Failures Lab"`
- Icon: `Microscope` (lucide-react) — if not available, `Bug` or `AlertOctagon`
- Position: After `HypothesisLab` in the NAV array. Rationale: Failures Lab is positioned as a complement/upstream of HypothesisLab, and the research tools group benefits from adjacency.
- No locked/disabled state — lab is live from Phase 0.

### 4.3 Tab Definition (Phase 0 + Phase 1)

Defined in `useFailuresWorkspace.js` as `FAILURES_TABS`:

```js
export const FAILURES_TABS = [
  // INTELLIGENCE group
  { key: "overview",    label: "Overview",        short: "Overview",  group: "Intelligence" },
  { key: "archetypes",  label: "DNA & Archetypes", short: "DNA",      group: "Intelligence" },
  // ANALYSIS group
  { key: "temporal",    label: "Temporal",         short: "Timing",   group: "Analysis" },
  { key: "direction",   label: "Directional",      short: "Direction",group: "Analysis" },
  { key: "sessions",    label: "Sessions",         short: "Sessions", group: "Analysis" },
  // RESEARCH group
  { key: "streaks",     label: "Streaks",          short: "Streaks",  group: "Research" },
  { key: "prevention",  label: "Prevention",       short: "Prevent",  group: "Research" },
  // WORKSPACE group
  { key: "drilldown",   label: "Drilldown",        short: "Inspect",  group: "Workspace" },
  { key: "views",       label: "Views & Export",   short: "Export",   group: "Workspace" },
];
```

Tabs `archetypes`, `temporal`, `direction`, `sessions`, `streaks`, `prevention`, `drilldown`, `views` are all Phase 0 placeholder shells. Phase 1 fills them.

Phase 2+ tabs (deferred — NOT registered in Phase 0/1):
`false-losers`, `cohort`, `excursion`, `news`, `replay`, `cross-run`, `pre-forensics`

---

## 5. Shared Analytics Structure

### 5.1 File Responsibilities

All files in `shared/` are pure JavaScript — no React, no imports from components, no side effects.

#### `failuresUtils.js`
Single responsibility: filtering and field normalisation. Nothing else.

```
Functions:
  filterLosers(trades)              → Trade[] — outcome = Loss
  filterWinners(trades)             → Trade[] — outcome = Win
  rOf(trade)                        → number — safe R accessor
  directionOf(trade)                → "long" | "short" | "unknown"
  structureOf(trade)                → "bos" | "choch" | "unknown"
  obWidthOf(trade)                  → number | null
  durationMinutes(trade)            → number | null — (exit - entry) / 60000
  entryHour(trade)                  → 0–23 | null
  entryWeekday(trade)               → 0–4 (Mon–Fri) | null
  entryMonth(trade)                 → 0–11 | null
  entryQuarter(trade)               → 1–4 | null
  isFullBreach(trade)               → boolean
  isCloseBreach(trade)              → boolean
  costRatio(trade, config)          → number | null — (spread+slip)/ob_width

Note: sessionOf() and parseDate() are imported from
entryFormatters.js — NOT reduplicated here.
```

#### `failuresRegistry.js`
Single responsibility: the archetype taxonomy and display tokens.

```
Exports:
  ARCHETYPES[]                      — full archetype definitions (see structure below)
  ARCHETYPE_MAP                     — keyed by archetype id for O(1) lookup
  ARCHETYPE_TONES                   — { id → CSS variable tone name }
  ARCHETYPE_COLOURS                 — { id → hsl(var(--X)) token }
  getArchetype(id)                  → archetype definition
  archetypeLabel(id)                → display string

Note: sampleConfidence(n) is imported from
entryRegistry.js — NOT reduplicated here.

Archetype definition structure:
  {
    id:                string,        // "hard_invalidation"
    label:             string,        // "Hard Invalidation"
    description:       string,        // one-sentence description
    tier:              1 | 2 | 3,     // data tier required
    colour:            string,        // "hsl(var(--danger))"
    tone:              string,        // "danger" | "warning" | etc.
    iconName:          string,        // lucide icon name
    criteria:          Criterion[],   // classification rules
    requiredFields:    string[],      // fields needed for classification
    severityWeight:    number,        // multiplier on base severity
    suggestedHypotheses: string[],    // hypothesis card templates
    radarProfile: {                   // default fingerprint shape
      timingRisk:      0–1,
      newsRisk:        0–1,
      directionalBias: 0–1,
      sessionRisk:     0–1,
      obQuality:       0–1,
      preEntryRisk:    0–1,
    }
  }

Tier 1 archetypes (Phase 1 — all Tier 0 data):
  hard_invalidation         — ob_fully_breached OR max_ob_penetration_pct >= 100
  close_confirmed           — close_confirmed_ob_breach = true
  fast_stopout              — durationMinutes < 30 (derivable from entry/exit)
  slow_bleed                — durationMinutes > 240 AND outcome = Loss
  standard_loss             — catch-all for classified losses (residual)

Tier 2 archetypes (Phase 2 — require mae/mfe):
  hope_trap                 — mfe >= 1.0 AND outcome = Loss
  (defer to Phase 2)

Tier 3 archetypes (Phase 3+):
  stop_raid, news_nuke, aged_ob_failure, thin_ob_failure, htf_counter
  (defer until relevant exporter fields land)
```

#### `failuresFormatters.js`
Single responsibility: display formatting for failure-specific values. Imports from `entryFormatters.js`.

```
Imports from entryFormatters.js:
  fmtR, fmtPct, fmtMaybeR, fmtMaybePct, round1, round2

Additional exports:
  fmtDuration(mins)                 → "4h 32m" | "28m" | "—"
  fmtSeverity(score)                → "7.2" | "—"
  severityLabel(score)              → "CRITICAL" | "HIGH" | "MODERATE" | "LOW"
  severityTone(score)               → "danger" | "warning" | "secondary" | "muted"
  confidenceLabel(conf)             → "HIGH" | "MEDIUM" | "LOW" | "BORDERLINE" | "UNCLASSIFIED"
  confidenceTone(conf)              → CSS tone string
  archetypeColour(id)               → CSS variable string (delegates to registry)
  archetypePillProps(id)            → { label, tone, colour } for Pill component
```

#### `archetypeClassifier.js`
Single responsibility: classify a single trade into an archetype with confidence score.

```
Imports: failuresRegistry.js, failuresUtils.js

Key functions:
  classify(trade, config?)
    → { archetype: string, confidence: "HIGH"|"MEDIUM"|"LOW"|"BORDERLINE"|"UNCLASSIFIED",
        matchedCriteria: string[], totalCriteria: number, matchCount: number }

  classifyAll(trades, config?)
    → Array of trades with classification attached

Classification algorithm (Phase 1, rule-based):
  1. Try archetypes in priority order: hard_invalidation → close_confirmed →
     fast_stopout → slow_bleed → standard_loss
  2. For each archetype, evaluate all criteria. Count matches.
  3. Assign to first archetype where matchCount / totalCriteria >= 0.6 (HIGH confidence)
     or >= 0.4 (MEDIUM confidence)
  4. If no archetype reaches 0.4, assign "standard_loss" with BORDERLINE confidence
  5. Confidence mapping: 5/5 = HIGH, 4/5 = HIGH, 3/5 = MEDIUM, 2/5 = LOW, <2 = BORDERLINE

Fast-stopout TF adjustment:
  The 30-minute threshold for fast_stopout must be adjusted by execution TF.
  config?.executionTf is read from the active run config.
  Default: 30 minutes. For H1 runs: 120 minutes. For M5 runs: 10 minutes.
  If config is not available, use 30 minutes.

Note: When ML clustering is available (Phase 7), this file's classify()
function is replaced. The API contract (input/output shape) must not change.
```

#### `severityScorer.js`
Single responsibility: compute severity score per trade.

```
Functions:
  scoreSeverity(trade, context)
    context = { allTrades, streakMap, maxDrawdownR }
    → { score: number (0–10), components: { magnitude, streak, drawdown, structural } }

  scoreAll(classifiedTrades)
    → trades with { severity, severityComponents } attached

  precomputeContext(trades)
    → context object (call once, pass to scoreSeverity in bulk)

  buildStreakMap(trades)
    → Map<tradeId, streakLength> — how many consecutive losses this trade is part of
    (computed by scanning ordered trades for W/L runs)

Severity formula (Phase 1):
  magnitude:  min(4, Math.log1p(Math.abs(r)) * 2.5)   → 0–4 pts
  streak:     (streakLength >= 5 ? 2 : streakLength >= 3 ? 1 : 0)
  drawdown:   (|r| / maxDrawdownR > 0.25 ? 2 : |r| / maxDrawdownR > 0.1 ? 1 : 0)
  structural: (archetype === "hard_invalidation" ? 1 : 0) +
              (confidence === "HIGH" ? 1 : 0)
  score:      magnitude + streak + drawdown + structural (clamped 0–10)
```

#### `failuresAnalytics.js`
Single responsibility: all pure computation needed by Phase 1 modules.

```
Imports: failuresUtils.js, failuresFormatters.js
Also imports sessionOf, dayIndex, WEEKDAYS, SESSIONS from entryFormatters.js

Section 1 — KPI computations:
  computeFailureKPIs(trades, classified)
    → { totalLosses, lossRate, avgLossR, worstLossR, longestStreak,
        topArchetype, topArchetypePct, severityWeightedLossRate }

Section 2 — Archetype analytics:
  computeArchetypeStats(classified)
    → Map<archetypeId, ArchetypeStats>
  computeArchetypeDNAStats(classified, archetypeId)
    → { count, pct, avgR, worstR, avgSeverity, longPct, shortPct,
        sessionConcentration, structureSplit, avgObWidth,
        sampleConfidence, classificationConfidenceDist }

Section 3 — Temporal analytics:
  computeHourlyFailureRate(trades, losers)
    → Map<weekday×hour, { lossRate, lossCount, totalCount }>
  computeMonthlyFailureRate(trades, losers)
    → Array<{ month, lossCount, lossRate, totalCount }>
  computeQuarterlyStats(trades, losers)
    → Array<{ quarter, lossCount, lossRate, totalCount }>
  computeWinFailureDeltaByHour(trades, losers)
    → Map<hour, { lossRate, winRate, delta }>

Section 4 — Directional analytics:
  computeDirectionalStats(trades, losers)
    → { long: DirectionStats, short: DirectionStats }
  DirectionStats = { count, pct, lossRate, avgR, expectancy, profitFactor,
                     avgObWidth, topArchetype, archDist, tailRiskCVaR, worst5 }
  computeCVaR(lossesForDirection, pct = 0.1)
    → number — avg R of worst pct% of trades

Section 5 — Session analytics:
  computeSessionFailureRates(trades, losers)
    → Map<session, { lossRate, lossCount, totalCount, avgSeverity, topArchetype }>
  computeOriginFillMatrix(losers)
    → Map<originSession×fillSession, { count, pct, lossRate }>
    Note: origin session = OB origin session if available, else "Unknown"
    Note: fill session derived from sessionOf(trade.entry)

Section 6 — Streak analytics:
  computeStreakStats(trades)
    → { maxStreak, streakDistribution, runsTestResult }
  buildRunsTest(trades)
    → { runs: number, n1: number, n2: number, expectedRuns: number,
        variance: number, zStat: number, pValue: number,
        interpretation: "clustered" | "random" | "dispersed",
        verdict: string }
    Note: pValue approximated via standard normal CDF (no external library)
  computeSequenceDependency(trades)
    → { pLossAfterLoss: number, pLossAfterWin: number, ratio: number,
        sampleN: number, interpretation: string }

Section 7 — Prevention analytics:
  computePreventionRules(trades, losers)
    → RuleResult[] sorted by abs(netRDelta)
  buildPreventionRule(label, filter, trades, losers)
    → { label, filter, losersCaught, losersCaughtPct, winnersRemoved,
        winnersRemovedPct, netRDelta, falsePosWarning, sampleN, confidence }
  PREVENTION_RULES (static definition array — see Section 5.4 below)

Note: All functions that accept arrays are null-safe and return sensible
empty/zero values when called with empty arrays.
```

#### `failuresDataQuality.js`
Single responsibility: detect field coverage and expose degraded-mode flags.

```
FIELD_DEPENDENCIES map — defines which module/feature needs which fields:
  { fieldName: { requiredBy: string[], tier: 1|2|3|4, description: string } }

Functions:
  scanFieldCoverage(trades)
    → Map<fieldName, { coverage: 0–1, sampleN: number, status: "ok"|"partial"|"absent" }>
  
  getModuleQuality(moduleName, trades)
    → { available: string[], degraded: string[], unavailable: string[] }

  isFieldAvailable(fieldName, trades, threshold = 0.8)
    → boolean

Phase 1 field checks:
  always_available: ["outcome", "r", "direction", "session", "structure", "ob_width", "entry", "exit"]
  tier_1_checks:    ["mae", "mfe", "minutes_to_exit", "post_stop_continuation_r"]
  (All tier 1 checks expected to return absent for Phase 1 — graceful degraded mode)
```

#### `failuresExporter.js`
Single responsibility: build exportable data structures.

```
Functions:
  buildCSVRows(classified, selectedFields)
    → string (CSV text ready for download)
  
  downloadCSV(filename, csvText)
    → void (triggers browser download)
    Note: mirrors existing downloadCsv() pattern from entryAnalytics.js exactly

  CSV_FIELD_PRESETS
    → { "Full forensic export": string[], "Archetype summary": string[], ... }

  buildHypothesisCard(label, rationale, filterExpression)
    → hypothesis object matching fxob_entry_hypotheses_v1 schema
  
  writeHypothesisToStorage(card)
    → boolean (success/fail)
    Reads existing array from localStorage("fxob_entry_hypotheses_v1"),
    appends the new card, writes back.
    Never throws — silently fails if storage is unavailable.
```

---

## 6. localStorage Strategy

### 6.1 Key Definitions

All new keys follow the `fxob_failures_*` prefix convention.

| Key | Contents | Size estimate | Persistence |
|---|---|---|---|
| `fxob_failures_filter` | Cohort filter state (sessions[], directions[], archetypes[], dateRange, etc.) | < 1 KB | Persistent |
| `fxob_failures_manual_tags` | `{ [tradeId]: { archetype, note, updatedAt } }` | < 50 KB for 5000 trades | Persistent |
| `fxob_failures_saved_views` | Array of max 20 view objects `{ id, name, filter, tab, notes, createdAt }` | < 10 KB | Persistent |
| `fxob_failures_panel_states` | `{ [panelId]: boolean }` collapsed states | < 2 KB | Persistent |
| `fxob_failures_export_presets` | User's named CSV export column selections | < 2 KB | Persistent |

**Not stored in localStorage** (session state only, lost on navigation):
- Comparison cohort B state
- Replay progress
- Prevention engine sort state

### 6.2 Size Budget

New keys total estimated worst case: ~65 KB for 5,000 trades. Well within the 4 MB budget. The manual tags key is the only one that scales with trade count. At 10,000 trades (extreme case) it remains ~100 KB.

### 6.3 Key Access Pattern

All localStorage access is isolated in `useFailuresWorkspace.js` and the individual analytics utility files. Module components never access localStorage directly — they receive state via props from the workspace coordinator.

`fxob_entry_hypotheses_v1` is the **one exception**: `failuresExporter.js#writeHypothesisToStorage()` writes to this key to feed HypothesisLab. This is the only intentional cross-lab localStorage coupling.

### 6.4 Migration / Versioning

Keys that may need future schema changes should be named with a version suffix (e.g. `fxob_failures_filter_v1`). Phase 0 establishes `_v1` for all keys. If a breaking schema change is required in a future phase, bump to `_v2` and include a migration shim in the hook.

---

## 7. Phase 0 Exact Deliverables

Phase 0 is complete when the Failures Lab workspace renders in the browser with correct routing, a working tab rail, a working cohort filter bar, and empty but correctly structured module placeholder shells. No analytics yet. No charts.

**Checklist:**

- [ ] `FailuresLab.jsx` exists, imports `FailuresWorkspace`, renders it — matches `EntriesLab.jsx` pattern exactly
- [ ] `App.js` route `/failures-lab` registered with `withRouteBoundary`
- [ ] `Sidebar.jsx` NAV entry added, `Microscope` (or `Bug`) icon, correct `to` path
- [ ] `/failures-lab` navigates without crash
- [ ] Tab rail renders all 9 Phase 1 tabs (overview through views)
- [ ] Active tab state persists via URL query param (`?tab=sessions` works on page refresh)
- [ ] `FailuresCohortFilter` renders below tab bar with direction/session toggles
- [ ] Cohort filter state persists across navigation (localStorage round-trip works)
- [ ] `FailuresDataQualityBanner` renders, scans current trade data, shows field coverage
- [ ] All 9 tab slots render their placeholder shell (NeonPanel with module name + "Phase 1" label)
- [ ] `failuresRegistry.js` exports all 5 Tier 1 archetypes
- [ ] `failuresUtils.js` exports `filterLosers`, `durationMinutes`, `rOf`, `directionOf` etc.
- [ ] `archetypeClassifier.js` exports `classify()` and `classifyAll()` (even if Tier 2+ archetypes return UNCLASSIFIED)
- [ ] `severityScorer.js` exports `scoreAll()` and `precomputeContext()`
- [ ] `failuresAnalytics.js` exists (may have stub implementations for Phase 0)
- [ ] `WorkspaceTabBar.jsx` accepts `tabs` prop (backward-compatible, EntriesLab unaffected)
- [ ] No console errors on load
- [ ] No regressions in existing routes (EntriesLab, HypothesisLab, ProtectionLab still work)

---

## 8. Phase 1 Exact Deliverables

Phase 1 is complete when all 9 tabs contain real analytics using Tier 0 data only. Each tab must render real content when trades are loaded, gracefully degrade when no data is loaded, and show correct data quality indicators for any fields it requires beyond Tier 0.

### Tab 1: Overview

- [ ] `FailureKPIStrip` — 8 chips: total losses, loss rate, avg loss R, worst loss R, longest streak, top archetype, top archetype %, severity-weighted loss rate
- [ ] `ArchetypeDistributionSummary` — donut view (Recharts `PieChart`). Treemap deferred to Phase 2.
- [ ] `FailureEquityImpact` — `EquityCurveV2` wired to full trade set, losing trades rendered as coloured dots (coloured by archetype). Uses existing `EquityCurveV2` component, adds a `failureDots` prop.
- [ ] All KPIs show `—` gracefully when no trades loaded
- [ ] KPI chips match existing `MetricChip` styling

### Tab 2: DNA & Archetypes

- [ ] `FailureDNA` — renders a DNA card for each archetype that has at least 1 classified trade
- [ ] `FailureDNACard` — all Tier 0 fields: count, %, avg R, worst R, severity, long/short skew bar, session concentration pills, structure split, avg OB width, suggested hypotheses with "→ Add to HypothesisLab" button, sample confidence badge, classification confidence distribution
- [ ] `FingerprintRadar` — Recharts `RadarChart` with 6 axes using Tier 0 data. Axes requiring missing fields show 0 with a tooltip explaining the gap.
- [ ] `ArchetypeMatrix` — direction × session × structure dimensions. Cell = failure rate for that archetype/dimension intersection.
- [ ] `ClassificationConfidencePanel` — HIGH/MEDIUM/LOW/BORDERLINE distribution per archetype as a stacked bar
- [ ] Archetypes with `INSUFFICIENT` sample N show a greyed pill, not a full card
- [ ] "→ Add to HypothesisLab" button correctly writes to `fxob_entry_hypotheses_v1`

### Tab 3: Temporal

- [ ] `TemporalHeatmap` — 5-row (Mon–Fri) × 24-col (UTC hours) failure RATE heatmap. CSS grid with background-opacity shading. Hover tooltip shows `lossRate`, `lossCount`, `totalCount`.
- [ ] `WinFailureDelta` — failure rate minus win rate by UTC hour, rendered as diverging bar chart (Recharts `BarChart`). Red where failure exceeds win, green where win exceeds failure.
- [ ] `SeasonalPatterns` — monthly bar chart (Jan–Dec) + quarterly summary. Month labels visible. Annotated with "Summer (Jun–Aug)" and "Christmas (Dec)" bands.
- [ ] All temporal components degrade correctly with < 10 trades (show `INSUFFICIENT N` panel)

### Tab 4: Directional

- [ ] `DirectionMetricsCompare` — paired diverging horizontal bars. Metrics: loss rate, avg R, expectancy, PF, avg OB width, top archetype label.
- [ ] `DirectionArchetypeBreakdown` — two stacked bars side-by-side (Long vs Short), segments by archetype.
- [ ] `TailRiskByDirection` — table: worst 5 trades per direction + CVaR (worst 10%). Marked as `MODERATE N` or better required.

### Tab 5: Sessions

- [ ] `SessionFailureRates` — bar chart: one bar per session (Asia, London, London Lull, New York, Outside). Shows failure RATE, not count. Secondary bar for severity-weighted rate.
- [ ] `OriginFillSessionMatrix` — 5×5 grid. Rows = origin session (from `session` field or "Unknown"), cols = fill session (derived from `sessionOf(entry)`). Cell = failure rate. Heatmap-coloured.
- [ ] `SessionArchetypeBreakdown` — stacked bar: one bar per session, archetype segments.

### Tab 6: Streaks

- [ ] `ConsecutiveLossPanel` — max consecutive losses chip, run-length distribution histogram (Recharts `BarChart`, x = streak length 1/2/3/4/5+, y = count), W/L dot-strip timeline (inline SVG, W = teal dot, L = red dot, grouped into runs).
- [ ] `RunsTestPanel` — displays: observed runs count, expected runs (formula), Z-statistic, p-value (approximated), plain-language verdict ("random" / "clustered" / "dispersed"), minimum N warning if < 30 trades.
- [ ] `SequenceDependency` — 2×2 conditional probability table (P(L|prior W), P(L|prior L), P(W|prior W), P(W|prior L)) + interpretation string.
- [ ] `StreakEquityOverlay` — equity curve with streak bands. Uses `EquityCurveV2` or a Recharts `LineChart` with reference areas for streak zones.

### Tab 7: Prevention

- [ ] `FilterRecommendations` — tests all `PREVENTION_RULES` (see Section 8.5 below), renders as ranked cards sorted by `|netRDelta|`. Each card shows: label, losers caught (N + %), winners removed (N + %), estimated net R delta, false positive warning if `winnersRemovedPct > 15%`, sample confidence badge, "→ Add to HypothesisLab" button.
- [ ] `WouldThisHaveHelped` — scoped to active cohort. Same rules tested against cohort-only trade set. Renders as compact table ranked by loser catch rate for the specific cohort.
- [ ] `PreventionHypothesisExport` — "Generate Hypothesis Batch" button. Takes all starred rules, writes batch of hypothesis cards to `fxob_entry_hypotheses_v1`.
- [ ] Rules with `winnersRemovedPct > 15%` show a red danger badge.
- [ ] Rules with `sampleN < 10` (INSUFFICIENT) show greyed, non-interactive state.

### Tab 8: Drilldown

- [ ] `FailureTradeTable` — sortable `DataTable` with heatmap mode. Columns: ID, date, direction, session, structure, archetype (coloured pill), confidence (pill), severity (coloured chip), R (red), OB width, manual tag badge if overridden.
- [ ] Click any row → opens `FailureTradeDetail` as a right-side sliding panel (not a new route)
- [ ] `FailureTradeDetail` — shows: all field values, archetype classification breakdown (which criteria matched/missed), severity component breakdown, cross-links ("→ Trade Inspector" to existing `/trade-inspector?id=X` route).
- [ ] `ManualTagPanel` — inline in trade detail. Archetype picker (select from ARCHETYPES), free-text note, "Save override". Override stored in `fxob_failures_manual_tags`. Override badge visible in table row after save.
- [ ] Table supports filtering by archetype, confidence level, severity bucket, manual-tag status.

### Tab 9: Views & Export

- [ ] `ExportSystem` — CSV export button with column selector. At minimum: id, entry, direction, session, structure, r, archetype, confidence, severity, ob_width, manual_tag. Named preset saves to `fxob_failures_export_presets`.
- [ ] `SavedForensicViews` — view list with name, module, date, notes preview. "Save current view" button captures active tab + cohort filter state. "Load view" restores them. "Delete view" with confirmation. 20-view cap enforced.
- [ ] `ViewManager` — duplicate view, rename view. Export all views as JSON. Import views from JSON paste/file.

---

### 8.5 Prevention Rules Definition (`PREVENTION_RULES`)

Defined as a static array in `failuresAnalytics.js`. All Tier 0 derivable. These mirror the `SIM_FILTERS` in `HypothesisLab.jsx` — they test the same conditions on the loss-filtered cohort.

```
Session rules:
  "Exclude Asia losses"
  "Exclude London losses"
  "Exclude London Lull losses"
  "Exclude New York losses"
  "Exclude Outside losses"

Day rules:
  "Exclude Monday"  "Exclude Tuesday"  "Exclude Wednesday"
  "Exclude Thursday"  "Exclude Friday"

Direction rules:
  "Exclude Long losses"
  "Exclude Short losses"

Structure rules:
  "Exclude BOS losses"
  "Exclude CHoCH losses"

Archetype rules (Tier 1 only in Phase 1):
  "Exclude Hard Invalidation losses"
  "Exclude Close-Confirmed losses"
  "Exclude Fast Stopout losses"   (requires durationMinutes)
  "Exclude Slow Bleed losses"     (requires durationMinutes)

OB quality rules:
  "Exclude narrow OB losses (width < 5 pips)"
  "Exclude wide OB losses (width > 10 pips)"

Hour rules (most toxic window heuristics):
  "Exclude losses at 12:00–13:00 UTC"  (London/NY overlap open)
  "Exclude losses at 20:00–22:00 UTC"  (Outside session end)
```

---

## 9. Deferred Features (Phase 2+)

These are explicitly out of scope for Phase 0 and Phase 1. They are listed here to prevent scope creep during implementation.

| Feature | Deferred to | Reason |
|---|---|---|
| MAE/MFE scatter | Phase 2 | Requires `mae`, `mfe` exporter fields |
| Hope Trap archetype (confirmed) | Phase 2 | Requires `mfe` |
| Slow Bleed archetype (MAE-confirmed) | Phase 2 | Requires `mae` |
| Post-stop continuation histogram | Phase 3 | Requires `post_stop_continuation_r` |
| False Loser module | Phase 3 | Requires `post_stop_continuation_r` |
| Failure timeline lifecycle | Phase 3 | Requires `mfe`, `mae`, `minutes_to_exit` |
| Pre-Entry Forensics tab | Phase 4 | Requires `htf_context`, `sweep_present`, `ob_age_candles` |
| OB survival curve | Phase 4 | Requires `ob_age_candles` |
| News Failures tab | Phase 6 | Requires `news_minutes_offset` |
| Replay Mode | Phase 2 | Requires `mfe`/`mae` for replay card richness |
| Cohort Comparison Engine | Phase 5 | MAE/MFE overlap needs Phase 2 first |
| Cross-Run Comparison | Phase 5 | Best after archetypes are mature |
| Regime Monitor "What Changed" | Phase 5 | Requires archetype history (Phase 1 must build data) |
| AI clustering | Phase 7 | Requires multiple exporter upgrades |
| Full Fingerprint Radar (all 6 axes) | Phase 4 | Pre-entry axes need exporter fields |
| FingerprintRadar.jsx (partial, 4 axes) | Phase 1 | newsRisk + preEntryRisk show 0 with tooltip |
| `EquityCurveV2` `failureDots` prop | Phase 1 | Small addition to existing component |

---

## 10. Risks

### Risk 1: EquityCurveV2 Prop Extension
**Impact:** Medium. Adding `failureDots` prop to the existing `EquityCurveV2` component could affect ProtectionLab if the component is used there.
**Mitigation:** Check all usages of `EquityCurveV2` before modifying. Add the prop with a default of `[]` so existing usage is unaffected. Do not change the component's render output when `failureDots` is empty.

### Risk 2: `WorkspaceTabBar` Backward Compatibility
**Impact:** Low. The one-line change to accept a `tabs` prop must not break `EntriesWorkspace.jsx`.
**Mitigation:** Use `const resolvedTabs = tabs || TABS;` — strict fallback. EntriesLab calls `WorkspaceTabBar` without a `tabs` prop, so it falls back to the imported `TABS` constant, unchanged behaviour.

### Risk 3: Prevention Engine Double-Counting Recommendations
**Impact:** Medium. If two rules catch the same trades (e.g. "Exclude Monday" and "Exclude Hard Invalidation"), showing both independently may mislead the researcher about total avoidable losses.
**Mitigation:** Each recommendation is standalone and shows its own catch count. A disclaimer: "Rules are independent — combining may produce diminishing returns. See Prevention Engine for combined analysis." The combined analysis tool is Phase 5 but the disclaimer ships Phase 1.

### Risk 4: Archetype Classifier Over-Classification
**Impact:** Medium. Without `mfe`/`mae`, the classifier has weak signals. Many trades will be classified as `standard_loss` with LOW confidence.
**Mitigation:** `standard_loss` is explicitly a valid Tier 1 archetype — it is not a failure state. The `ClassificationConfidencePanel` will show the HIGH proportion of LOW/BORDERLINE confidences, which is accurate and honest. This is a research finding in itself.

### Risk 5: Wald-Wolfowitz p-value Approximation
**Impact:** Low. The Z → p-value conversion uses a standard normal approximation via a polynomial CDF approximation. This is accurate to 4 decimal places for |Z| < 4, which covers all practical cases.
**Mitigation:** The approximation formula is well-established (Abramowitz and Stegun). Document the approximation in a code comment. For |Z| > 4, return `p < 0.0001` rather than a specific value. This is statistically honest and practically equivalent.

### Risk 6: localStorage Budget on Large Manual Tag Sets
**Impact:** Low. For very large trade sets (> 5,000 trades) where a researcher manually tags most trades, the `fxob_failures_manual_tags` key could approach 50–100 KB.
**Mitigation:** Phase 1 implementation of `ManualTagPanel` should include a lightweight budget check before writing: if `fxob_failures_manual_tags` + existing total localStorage > 3.5 MB, warn the researcher before writing.

### Risk 7: HypothesisLab Storage Schema Drift
**Impact:** Medium. The "→ Add to HypothesisLab" bridge writes to `fxob_entry_hypotheses_v1` using a schema defined in `EntryHypothesisLab.jsx`. If that schema changes in a future iteration, the bridge breaks silently.
**Mitigation:** `failuresExporter.js#buildHypothesisCard()` must match the schema exactly as seen in `EntryHypothesisLab.jsx` at time of implementation. Add a comment: `// Schema must match EntryHypothesisLab.jsx#loadHypotheses format`. If HypothesisLab schema ever changes, the bridge function is the single place to update.

---

## 11. Implementation Order

This is the exact sequence in which files should be created or modified. Each step should be verified before the next begins.

### Step 1 — Shared Foundation (no visual output yet)
1. `failuresRegistry.js` — archetype definitions, 5 Tier 1 archetypes, display tokens
2. `failuresUtils.js` — loser filter, field helpers, duration derivation
3. `failuresFormatters.js` — display formatters (import from entryFormatters.js)
4. `failuresDataQuality.js` — field coverage scanner
5. `archetypeClassifier.js` — classify() + classifyAll()
6. `severityScorer.js` — scoreSeverity() + scoreAll()
7. `failuresAnalytics.js` — all Section 1–7 functions (stubs initially, fill during module build)
8. `failuresExporter.js` — CSV builder, HypothesisLab bridge

**Verify:** Each file can be imported in isolation without errors. Pure functions can be called with empty arrays without throwing.

### Step 2 — Workspace Shell (Phase 0 complete after this step)
9. Modify `WorkspaceTabBar.jsx` — add `tabs` prop (1-line change, run EntriesLab to verify)
10. `useFailuresWorkspace.js` — tab (URL-based), filter state, localStorage persistence
11. `FailuresCohortFilter.jsx` — filter bar with direction/session toggles, active filter pills
12. `FailuresDataQualityBanner.jsx` — field coverage warnings, module-specific messages
13. Placeholder shells for all 9 module paths (each ~20 lines, one `NeonPanel` with module label)
14. `FailuresWorkspace.jsx` — coordinator: data pipeline, sharedProps build, tab switch render
15. `FailuresLab.jsx` — 3-line page shell
16. Modify `App.js` — add route
17. Modify `Sidebar.jsx` — add nav entry

**Verify Phase 0:** Navigate to `/failures-lab`. Tab rail works. Filter bar persists. All 9 tabs render placeholder shells. No console errors. EntriesLab still works.

### Step 3 — Module 01: Overview
18. `FailureKPIStrip.jsx` + wire `computeFailureKPIs` in `failuresAnalytics.js`
19. `ArchetypeDistributionSummary.jsx` (Recharts PieChart)
20. `FailureEquityImpact.jsx` (extend EquityCurveV2 with failureDots prop first)

### Step 4 — Module 02: DNA & Archetypes
21. `FingerprintRadar.jsx` (Recharts RadarChart, 4 data axes + 2 zero-with-tooltip)
22. `ClassificationConfidencePanel.jsx`
23. `FailureDNACard.jsx`
24. `ArchetypeMatrix.jsx`
25. `FailureDNA.jsx` — assemble from above

### Step 5 — Module 03: Temporal
26. `TemporalHeatmap.jsx` — weekday×hour grid, CSS heatmap
27. `WinFailureDelta.jsx`
28. `SeasonalPatterns.jsx`
29. `FailuresTemporal.jsx` — assemble

### Step 6 — Modules 04 + 05: Direction + Sessions
30. `DirectionMetricsCompare.jsx` + `DirectionArchetypeBreakdown.jsx` + `TailRiskByDirection.jsx`
31. `DirectionalAsymmetry.jsx` — assemble
32. `SessionFailureRates.jsx` + `OriginFillSessionMatrix.jsx` + `SessionArchetypeBreakdown.jsx`
33. `SessionFailures.jsx` — assemble

### Step 7 — Module 06: Streaks
34. `buildRunsTest()` in `failuresAnalytics.js` — Wald-Wolfowitz
35. `computeSequenceDependency()` in `failuresAnalytics.js`
36. `ConsecutiveLossPanel.jsx` + `RunsTestPanel.jsx` + `SequenceDependency.jsx` + `StreakEquityOverlay.jsx`
37. `StreakAnalysis.jsx` — assemble

### Step 8 — Module 07: Prevention
38. `PREVENTION_RULES` + `computePreventionRules()` in `failuresAnalytics.js`
39. `FilterRecommendations.jsx` + `WouldThisHaveHelped.jsx`
40. `PreventionHypothesisExport.jsx` (HypothesisLab bridge, uses failuresExporter.js)
41. `PreventionEngine.jsx` — assemble

### Step 9 — Modules 08 + 09: Drilldown + Views
42. `FailureTradeTable.jsx` + `FailureTradeDetail.jsx` + `ManualTagPanel.jsx`
43. `FailureDrilldown.jsx` — assemble
44. `ExportSystem.jsx` (CSV builder using failuresExporter.js)
45. `SavedForensicViews.jsx` + `ViewManager.jsx`
46. `SavedForensicViews.jsx` (workspace tab) — assemble

---

## 12. Validation Checklist

### Phase 0 Validation

- [ ] `/failures-lab` loads without error
- [ ] Sidebar shows "Failures Lab" entry with correct icon, active state on that route
- [ ] Tab rail shows 9 tabs, active state correct
- [ ] Navigating to `/failures-lab?tab=sessions` loads the sessions tab directly
- [ ] Refreshing the page preserves the active tab
- [ ] Cohort filter: toggling "Long" removes short trades from the count displayed in filter bar
- [ ] Cohort filter state persists after navigating away and back
- [ ] Data quality banner shows correct field coverage for a loaded run
- [ ] Data quality banner shows "No data loaded" state correctly when no run is active
- [ ] All placeholder module shells render their NeonPanel without crash
- [ ] `EntriesLab.jsx` still works unchanged after `WorkspaceTabBar` modification
- [ ] `HypothesisLab.jsx` still works unchanged
- [ ] `ProtectionLab.jsx` still works unchanged
- [ ] No new console warnings introduced

### Phase 1 Validation

**Overview:**
- [ ] All 8 KPI chips render with real data when trades loaded
- [ ] KPI chips show `—` when no trades loaded
- [ ] Archetype distribution donut renders correctly with 5 archetype segments
- [ ] Equity impact chart shows coloured dots for each losing trade
- [ ] Equity impact dots are coloured by archetype (matches archetype colour tokens)

**DNA & Archetypes:**
- [ ] At least 1 archetype card renders with a real trade set
- [ ] DNA card shows correct count, %, avg R
- [ ] Sample confidence badge correct (INSUFFICIENT if < 10, etc.)
- [ ] Classification confidence bar chart renders
- [ ] "→ Add to HypothesisLab" button: after clicking, navigate to `/hypothesis-lab` and verify the hypothesis card appears in the list
- [ ] Archetypes with 0 trades are not shown (not even a placeholder card)
- [ ] INSUFFICIENT N archetypes show greyed pill only

**Temporal:**
- [ ] Heatmap renders 5×24 grid with colour intensity proportional to failure rate
- [ ] Heatmap hover tooltip shows lossRate, lossCount, totalCount
- [ ] Monthly chart shows all 12 months (empty months show 0 bar)
- [ ] Win/Failure delta chart shows both positive and negative values

**Directional:**
- [ ] Both Long and Short bars visible in compare chart
- [ ] "—" shown for metrics with insufficient trades in one direction
- [ ] Tail risk table: worst 5 trades each direction show correct IDs and R values

**Sessions:**
- [ ] All 5 sessions visible in failure rate bar chart
- [ ] Origin×Fill matrix: cells show "—" where no trades exist for that combination
- [ ] Session with 0 trades still shows in the grid

**Streaks:**
- [ ] Runs test: verify manually that observed runs count is correct for a known trade sequence
- [ ] Runs test verdict renders in plain language (not just numbers)
- [ ] Minimum N warning shows if < 30 trades
- [ ] Sequence dependency: P(L|prior L) and P(L|prior W) show correct values
- [ ] Streak equity overlay: streak bands visible and correctly positioned

**Prevention:**
- [ ] At least 10 rules shown in recommendations
- [ ] Rules sorted by net R delta (highest absolute delta first)
- [ ] False positive warning badge visible for any rule removing > 15% of winners
- [ ] INSUFFICIENT N rules shown as greyed/non-interactive
- [ ] "→ Add to HypothesisLab" works and card appears in HypothesisLab
- [ ] "Generate Hypothesis Batch" correctly writes multiple cards
- [ ] WouldThisHaveHelped: results change when cohort filter changes

**Drilldown:**
- [ ] Table shows all losing trades by default
- [ ] Sorting by R, severity, archetype all work correctly
- [ ] Click a row → detail panel opens on the right
- [ ] Detail panel shows archetype classification breakdown (matched/unmatched criteria)
- [ ] Manual tag: save an override, verify the trade shows override badge in the table
- [ ] Manual tag persists after navigating away and returning
- [ ] "→ Trade Inspector" link navigates to correct route

**Views & Export:**
- [ ] CSV export downloads a valid CSV file with expected columns
- [ ] Save view: current tab + filter captured, appears in view list
- [ ] Load view: restores correct tab and filter state
- [ ] Delete view with confirmation dialog works
- [ ] 20-view cap: 21st save shows an "oldest archived" notice

---

*End of Phase 0 + Phase 1 Implementation Plan.*  
*All architecture decisions are locked. Implementation may begin with Step 1.*
