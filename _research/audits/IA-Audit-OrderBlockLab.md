# IA Audit — Order Block Lab Page

**Scope:** `frontend/src/pages/OrderBlockLab.jsx` and components rendered directly by it.
**Out of scope:** `RunDetail.jsx`, Run Workspace, selected-run review pages.
**Constraint:** Audit and architecture plan only. No code, no file modifications.

---

## PHASE 1 — Section Inventory

### 1.1 Complete Section Inventory

Every visible section rendered by `OrderBlockLab.jsx`, in DOM order:

| # | Section | Component | Collapsible | Default | Conditional |
|---|---------|-----------|-------------|---------|-------------|
| 1 | Page header | `LabRunHero` | — | Always | — |
| 2 | Run config strip | `RunConfigStrip` | Yes (own toggle) | Collapsed | — |
| 3 | Universe badge | `TradeUniverseBadge` | — | Always | — |
| 4 | KPI chips (×6) | `MetricChip` ×6 | — | Always | — |
| 5 | Insight callouts | `InsightCallouts` | — | Visible | Only if `insights.length > 0` |
| 6 | Filter bar | `FilterBar` | — | Always | — |
| 7 | Research safety warning | `NeonPanel` | — | Visible | Only if `lowSampleBuckets > 0` |
| 8a | Structural Quality — BOS/CHoCH | `TableCompareShell` | — | Always | — |
| 8b | Structural Quality — Long/Short | `TableCompareShell` | — | Always | — |
| 8c | Structural Quality — Origin Session | `TableCompareShell` | — | Always | — |
| 9 | OB Creation Hour Performance | `CanonicalBucketTable` | — | Always | — |
| 10 | News OB Trades | `NewsCreatedObPanel` | Yes | **Expanded** | — |
| 11 | News OB Population | `NewsCreatedObPopulationPanel` | Yes | **Expanded** | — |
| 12 | OB Width Analysis | `TableCompareShell` | — | Always | — |
| 13 | OB Age / Time-to-Fill | `TableCompareShell` (compact) | — | Always | — |
| 14 | Penetration Depth Analysis | `TableCompareShell` (compact) | — | Always | — |
| 15 | Day of Week Performance | `TableCompareShell` | — | Always | — |
| 16a | Catastrophic Breach | `CatastrophicBreachPanel` | Yes | **Expanded** | — |
| 16b | Fast Stopout Analysis | `TableCompareShell` (compact) | — | Always | — |
| 16c | Distance Before Fill | `TableCompareShell` (compact) | — | Always | — |
| 17 | Session Matrix | `SessionMatrix` | Yes | **Expanded** | — |
| 18 | Temporal Analytics | `TemporalAnalytics` | Yes | Collapsed | — |
| 19 | Failure Lab | `FailureLab` | Yes | **Expanded** | — |
| 20 | Field Completeness | `FieldCompletenessPanel` | Yes | Collapsed | — |
| 21 | Research Backlog | `ResearchBacklog` | Yes | Collapsed | — |

**Overlays (not scroll-path sections):**
- `EdgeExplorerPanel` — drill-through drawer, appears on row click
- `ReportModal` — full-screen modal, appears on "Generate Report" click

**Dominant pattern:** `TableCompareShell` appears 9 times — it is the structural backbone of the page.

---

### 1.2 Section Purpose Summary

**Page header (#1):** Run identity, variant selection, report generation trigger.

**Run config strip (#2):** Compact reference to the parameters that produced this run. Already collapses to just core chips (sym · tf · rr · struct · dir) — well-designed but easy to miss.

**Universe badge (#3):** Data provenance. Identifies the model, source file, row count, and any fill-mode warnings. Critical for interpreting all numbers on the page.

**KPI chips (#4):** Six headline numbers: Linked Trades, Unlinked Trades, Best Bucket, Worst Bucket, Variant, Active Run. These are orientation numbers — "what am I looking at?"

**Insight callouts (#5):** System-generated qualitative flags surfaced from `buildOrderBlockAnalytics`. Only rendered if the engine generates insights.

**Filter bar (#6):** Segment controls for Structure (BOS/CHoCH/All), Direction (Long/Short/Both), OB Origin session. Filters propagate to every table on the page.

**Safety warning (#7):** Warns when any bucket has fewer than 30 trades. Conditional on `lowSampleBuckets > 0`.

**Structural 3-col grid (#8a–c):** The most important analytical block. Three slices of the same data: by structure type, by direction, by origin session. This is where most "what works" conclusions are formed.

**OB Creation Hour (#9):** 24-bucket hour-of-day breakdown. Answers: "which hours produce the best OBs?"

**News OB Trades (#10):** Performance breakdown for OBs created during high-impact news events. Includes its own lifecycle strip and mini-metrics.

**News OB Population (#11):** Population-level summary of news-adjacent OBs. Companion to #10 — shows how many exist, size distributions, fill rates.

**OB Width Analysis (#12):** Performance bucketed by OB width in pips.

**OB Age / Time-to-Fill (#13):** Performance bucketed by how long an OB lived before being filled.

**Penetration Depth Analysis (#14):** Performance bucketed by how deeply price penetrated the OB before reversing.

**Day of Week (#15):** Performance bucketed by the day the OB was created.

**Catastrophic Breach (#16a):** Identifies the worst-outcome fills — large losses that breached the OB significantly. Uses its own internal breakdown logic.

**Fast Stopout Analysis (#16b):** Trades that hit stop-loss quickly after fill. Signals poor entry timing or oversized stops.

**Distance Before Fill (#16c):** How far price was from the OB before returning to fill it.

**Session Matrix (#17):** Origin session × Fill session cross-tab heatmap. Answers: "do OBs created in London fill better during NY?" etc. High-information, high-cognitive-load.

**Temporal Analytics (#18):** Equity curve and rolling expectancy charts over the backtest period. Default-collapsed — this is a periodic sanity check, not a per-run first look.

**Failure Lab (#19):** Ranked list of worst losses and best wins with full trade detail. Used for case-by-case review of tail events.

**Field Completeness (#20):** Data quality report — shows which OB fields are populated vs missing. Default-collapsed.

**Research Backlog (#21):** Static list of 6 future features to be built. Default-collapsed.

---

### 1.3 Workflow Classification

**Core workflow** — consulted on every analysis session:
- Universe badge (#3) — always confirm data before reading results
- Filter bar (#6) — scope setting before any analysis
- Structural 3-col grid (#8a–c) — primary "what works" signal
- OB Creation Hour (#9) — timing complement to structural analysis
- Day of Week (#15) — timing companion
- Session Matrix (#17) — cross-tab context for structural + session findings
- KPI chips (#4) — orientation numbers

**Secondary workflow** — consulted after core analysis, depth-dependent:
- Config strip (#2) — reference when results are unexpected
- OB Width Analysis (#12) — geometry refinement
- OB Age / Time-to-Fill (#13) — geometry refinement
- Penetration Depth (#14) — geometry refinement
- Failure Lab (#19) — tail event review
- Catastrophic Breach (#16a) — risk review
- Temporal Analytics (#18) — stability check

**Rarely used / reference:**
- News OB Trades (#10) — only relevant if news filtering is active in this run
- News OB Population (#11) — same
- Fast Stopout (#16b) — deep-dive only
- Distance Before Fill (#16c) — deep-dive only
- Insight callouts (#5) — system-generated, passive
- Safety warning (#7) — conditional, passive
- Field Completeness (#20) — data QA, rarely needed mid-session
- Research Backlog (#21) — roadmap reference, not analytical

---

### 1.4 Cognitive Overload Sources

**OL-1 — No progressive disclosure on 9 TableCompareShell instances.**
Every table renders at full height simultaneously. A researcher sees all 9 tables rendered regardless of which question they're asking. There is no way to surface "just structure" or "just geometry" without scrolling past the others.

**OL-2 — News OB panels expand by default.**
Sections #10 and #11 are large and data-dense, yet they default to expanded. For any run that doesn't specifically test news-adjacent OBs, this is ~400px of content the researcher has to scroll past to reach Width/Age/Penetration analysis. Most runs will not need these panels at all on first load.

**OL-3 — Mixed conceptual levels in adjacent positions.**
The 3-col grid in row #16 groups three conceptually different things: Catastrophic Breach (risk characterisation), Fast Stopout (entry quality), and Distance Before Fill (approach geometry). These belong in different analytical contexts but are presented as siblings in the same grid.

**OL-4 — Failure Lab placed after Temporal Analytics.**
A researcher doing stress testing (Failure Lab) would naturally want it available before drilling into time-series stability (Temporal Analytics). The current order reverses this.

**OL-5 — No visible page structure.**
With 21 sections in a single scroll, there is no way to navigate directly to, say, "geometry analysis" without knowing exactly where it is in the scroll order. A researcher new to the page — or returning after a gap — has no map.

**OL-6 — Session Matrix defaults to expanded.**
Session Matrix (#17) is a large heatmap component. It is high-value but also high-visual-weight. Placing it expanded between Day of Week and Temporal Analytics creates a block of visual density mid-page.

**OL-7 — KPI chips decontextualised.**
"Best Bucket" and "Worst Bucket" chips in the KPI strip (#4) show a bucket name without the table they refer to being immediately adjacent. Meaning is deferred until the researcher reaches the structural tables further down.

---

### 1.5 Natural Groupings

The 21 sections cluster into five natural analytical groups plus a persistent header region:

**Header (always-visible):** #1, #2, #3, #4, #5, #6, #7
— Everything needed to orient and scope before analysis begins.

**Group A — Structural Analysis:** #8a, #8b, #8c, #9, #15
— "When and what type of OB performs best?" BOS vs CHoCH, direction, session, hour, day. All share the same question: "which structural slice wins?"

**Group B — OB Geometry:** #12, #13, #14, #17
— "What does the OB itself look like?" Width, age, penetration, and session cross-tab (where it filled relative to where it formed). All characterise the OB's shape and fill context.

**Group C — Market Context / Risk:** #10, #11, #16a, #16b, #16c
— "How does this strategy behave under stress?" News events, catastrophic fills, fast stopouts, far-approach fills. All answer questions about edge cases and adverse conditions.

**Group D — Performance Over Time / Failure Review:** #18, #19
— "Is this edge stable and what went wrong?" Temporal analytics + failure lab.

**Group E — Data Quality / Admin:** #20, #21
— Field completeness and research backlog. Not analytical. Reference only.

---

## PHASE 2 — Ideal Researcher Workflow

A researcher working with OB Lab follows a natural analytical funnel. The steps are:

**Step 1 — Orientation (10 sec):**
What run is this? What universe/model/source? How many rows?
→ Header + Universe badge + KPI chips

**Step 2 — Scope setting (15 sec):**
Apply filters: structure type, direction, session.
→ FilterBar

**Step 3 — Structural quick-read (30–60 sec):**
Are BOS or CHoCH setups better in this run? Long or Short? Which origin session?
→ Structural 3-col grid (BOS/CHoCH · L/S · Origin Session)

**Step 4 — Timing deep-dive (60 sec):**
Which hours of day produced the best OBs? Which days of week?
→ OB Creation Hour table, Day of Week table

**Step 5 — Geometry analysis (90 sec):**
What OB shape profile performs best? Narrow vs wide? Young vs old? Shallow vs deep fill?
→ Width, Age/Time-to-Fill, Penetration Depth

**Step 6 — Session cross-tab (60 sec):**
Where does the OB form vs where does it fill? Any strong origin→fill session combos?
→ Session Matrix

**Step 7 — Stress testing (60–120 sec):**
What caused the worst outcomes? Are catastrophic fills identifiable? Any fast-stopout pattern?
→ Failure Lab, Catastrophic Breach, Fast Stopout, Distance Before Fill

**Step 8 — News sensitivity (conditional, 60 sec):**
If this run uses news filtering: how do news-adjacent OBs behave?
→ News OB Trades, News OB Population

**Step 9 — Stability check (occasional, 30 sec):**
Is equity curve healthy? Is rolling expectancy stable over the backtest period?
→ Temporal Analytics

**Step 10 — Admin / QA (rarely, 30 sec):**
Are OB fields fully populated? Any data completeness issues?
→ Field Completeness

**Mismatch with current page order:**
The current page diverges from this workflow in three places:
1. News OB panels (#10, #11) appear between Hour and Geometry, interrupting step 4→5. A researcher in the middle of geometry analysis has to scroll past two large expanded panels.
2. Failure Lab (#19) comes *after* Temporal Analytics (#18). Stress testing (step 7) naturally precedes stability review (step 9).
3. The 3-col grid at row #16 mixes geometry (Distance Before Fill) with risk (Catastrophic Breach, Fast Stopout). A researcher drilling into geometry has to visually separate these.

---

## PHASE 3 — Tab / Page Organisation Plan

### 3.1 Proposed Structure

**Persistent header band** (above all tabs, never hidden):
- `LabRunHero` — run identity + report button
- `RunConfigStrip` — collapsible config chips
- `TradeUniverseBadge` — universe/model/rows/warnings
- KPI chips (×6)
- `InsightCallouts` (conditional)
- `FilterBar` — applies globally across all tabs
- Research Safety warning (conditional)

**Tab 1 — Structure** *(default landing tab)*
- Structural Quality 3-col grid: BOS/CHoCH · Long/Short · Origin Session
- OB Creation Hour Performance (full-width)
- Day of Week Performance

*Rationale:* This is what every researcher looks at first. Landing here means the highest-signal content is immediately visible without any scrolling.

**Tab 2 — Geometry**
- OB Width Analysis
- OB Age / Time-to-Fill
- Penetration Depth Analysis
- Session Matrix (moved from its current buried mid-page position)

*Rationale:* All four characterise how the OB is shaped and how it gets filled. Session Matrix belongs here rather than after Temporal Analytics — it answers "where was the OB filled?" which is a geometry question.

**Tab 3 — Market Context**
- News OB Trades (default-collapsed within tab)
- News OB Population (default-collapsed within tab)
- Catastrophic Breach
- Fast Stopout Analysis
- Distance Before Fill (moved from the 3-col geometry/risk grid)
- Failure Lab (moved from after Temporal Analytics)

*Rationale:* Groups all risk, stress, and market-sensitivity analysis. News panels default-collapsed since they're irrelevant for most runs. Failure Lab moves here because it's stress testing, not stability testing.

**Tab 4 — Performance & Admin**
- Temporal Analytics (equity curves + rolling expectancy) — default-collapsed
- Field Completeness — default-collapsed
- Research Backlog — default-collapsed

*Rationale:* These are review/validation sections that don't affect primary analysis decisions. Grouping them together keeps the main tabs clean.

### 3.2 Tab Label Options

| Tab | Option A (short) | Option B (descriptive) |
|-----|-----------------|----------------------|
| 1 | Structure | Structure & Timing |
| 2 | Geometry | OB Shape |
| 3 | Context | Risk & Context |
| 4 | Performance | Performance & Admin |

Recommendation: Option A. Short labels fit the existing chip/tab aesthetic.

### 3.3 What Stays, What Moves, What Collapses

| Section | Current location | Proposed tab | Collapse default |
|---------|-----------------|--------------|-----------------|
| Structural 3-col grid | Row 8 | Tab 1 (Structure) | Unchanged (expanded) |
| OB Creation Hour | Row 9 | Tab 1 (Structure) | Unchanged (expanded) |
| Day of Week | Row 15 | Tab 1 (Structure) | Unchanged (expanded) |
| OB Width | Row 12 | Tab 2 (Geometry) | Unchanged (expanded) |
| OB Age / TTF | Row 13 | Tab 2 (Geometry) | Unchanged (expanded) |
| Penetration Depth | Row 14 | Tab 2 (Geometry) | Unchanged (expanded) |
| Session Matrix | Row 17 | Tab 2 (Geometry) | Unchanged (expanded) |
| News OB Trades | Row 10 | Tab 3 (Context) | **Change to collapsed** |
| News OB Population | Row 11 | Tab 3 (Context) | **Change to collapsed** |
| Catastrophic Breach | Row 16a | Tab 3 (Context) | Unchanged (expanded) |
| Fast Stopout | Row 16b | Tab 3 (Context) | Unchanged (expanded) |
| Distance Before Fill | Row 16c | Tab 3 (Context) | Unchanged (expanded) |
| Failure Lab | Row 19 | Tab 3 (Context) | Unchanged (expanded) |
| Temporal Analytics | Row 18 | Tab 4 (Performance) | Unchanged (collapsed) |
| Field Completeness | Row 20 | Tab 4 (Performance) | Unchanged (collapsed) |
| Research Backlog | Row 21 | Tab 4 (Performance) | Unchanged (collapsed) |

---

## PHASE 4 — Implementation Plan

### 4.1 Files to Modify

| File | Change | Complexity |
|------|--------|------------|
| `frontend/src/pages/OrderBlockLab.jsx` | Add tab state; reorganise render output into 4 tab content areas; reorder sections; update 2 collapse defaults | Medium |
| `frontend/src/components/lab/OBLabTabShell.jsx` | **New file.** Tab navigation shell with persistent header region and 4 content areas | Low–Medium |

No existing component files outside `OrderBlockLab.jsx` need modification. `TableCompareShell`, `NeonPanel`, and all sub-components are already correctly implemented.

### 4.2 New Component: OBLabTabShell.jsx

A lightweight tab shell that renders:
1. A sticky-ish header region (the persistent band — Badge, KPI, FilterBar, etc.)
2. A tab navigation row (4 tabs)
3. The active tab's content area

Props:
```
tabs          Array<{ key, label, content: ReactNode }>
header        ReactNode   (the persistent band)
activeTab     string
onTabChange   (key) => void
```

The tab nav row should use the existing chip/segment aesthetic already present in `FilterBar` to stay visually consistent. Approximately 80–120 lines.

### 4.3 Changes to OrderBlockLab.jsx

**Tab state** (add near existing filter state):
```js
const [activeTab, setActiveTab] = useState(
  () => localStorage.getItem("oblab-active-tab-v1") || "structure"
);
// persist on change
useEffect(() => {
  localStorage.setItem("oblab-active-tab-v1", activeTab);
}, [activeTab]);
```

**Persistent header** — extract the current pre-table block into a named `headerContent` variable:
- `LabRunHero`
- `RunConfigStrip`
- `TradeUniverseBadge`
- KPI chips
- `InsightCallouts`
- `FilterBar`
- Safety warning NeonPanel

**Tab 1 content** — move from current render positions:
- Structural 3-col grid (rows 8a–c) → no position change in JSX, only rehoused inside tab
- `CanonicalBucketTable` for OB Creation Hour (#9) → tab 1
- Day of Week `TableCompareShell` (#15) → move up from its current position after Penetration Depth

**Tab 2 content:**
- OB Width (#12), OB Age (#13), Penetration Depth (#14) → no reorder needed within tab
- `SessionMatrix` (#17) → move up from after Temporal Analytics

**Tab 3 content:**
- `NewsCreatedObPanel` (#10), `NewsCreatedObPopulationPanel` (#11) → update `defaultCollapsed` to `true`
- `CatastrophicBreachPanel` (#16a) → move out of 3-col grid into sequential layout
- Fast Stopout `TableCompareShell` (#16b) → move out of 3-col grid
- Distance Before Fill `TableCompareShell` (#16c) → move out of 3-col grid
- `FailureLab` (#19) → move from after Temporal Analytics to here

**Tab 4 content:**
- `TemporalAnalytics` (#18) — no change
- `FieldCompletenessPanel` (#20) — no change
- `ResearchBacklog` (#21) — no change

**Remove the 3-col grid at row #16** — its three children are redistributed: Catastrophic Breach and Fast Stopout move to Tab 3 (sequential layout), Distance Before Fill also moves to Tab 3.

### 4.4 Default Collapse Changes

Two changes only (both in Tab 3):
- `NewsCreatedObPanel` → `defaultCollapsed={true}` (currently: expanded)
- `NewsCreatedObPopulationPanel` → `defaultCollapsed={true}` (currently: expanded)

All other collapse defaults are preserved as-is.

### 4.5 State and Data Architecture — No Changes

- `filters` state (`structure`, `direction`, `session`) — FilterBar remains in the persistent header band, so filter state continues to flow down to all `TableCompareShell` and `CanonicalBucketTable` instances via existing props. No change needed.
- `compareProps(defKey)` helper — called once per table, returns comparison props from `getTradeUniverse()`. Tab navigation does not affect this; runs are computed before render. No change needed.
- `buildOrderBlockAnalytics(filteredTrades)` — single computation call in `useMemo`. Unchanged. All analytics results flow to all tabs via the same destructuring pattern already in use.
- `edgeDrill` state — `EdgeExplorerPanel` is rendered at the page root (not inside any tab), so clicking a table row on any tab opens the drawer correctly. No change needed.
- `reportOpen` state — `ReportModal` is also page-root level. No change needed.

### 4.6 Risks and Mitigations

**Risk: Tab change resets scroll position.**
A researcher might be mid-scroll in Tab 2, switch to Tab 3 to check news OBs, then return to Tab 2 and lose their scroll position. Mitigation: use `display: none` / `visibility: hidden` tab switching (keep all tab content mounted) rather than unmounting tabs on change. This is the standard approach for analysis tool tab shells.

**Risk: Filter bar now appears once at top rather than contextually before each table.**
Current page has FilterBar at the top and tables below — this is already the existing layout. Moving FilterBar to the persistent header band does not change its logical relationship to the tables. No new confusion.

**Risk: OB Lab localStorage key collision.**
Existing keys: `"oblab-filters"`, `"fxob_run_config_strip_open_v1"`. New key: `"oblab-active-tab-v1"`. No collision.

**Risk: Session Matrix moved to Tab 2 may break researchers' existing mental model.**
Session Matrix is currently mid-page in Tab 1 territory (after Day of Week). Moving it to Tab 2 changes where an experienced user will look for it. Mitigation: label Tab 2 clearly (e.g. "Geometry") and ensure the tab label is intuitive enough that the Matrix is discoverable.

### 4.7 Estimated Scope

| Item | Estimated LOC delta |
|------|-------------------|
| `OBLabTabShell.jsx` (new file) | +100–120 lines |
| `OrderBlockLab.jsx` — tab state + persistence | +10 lines |
| `OrderBlockLab.jsx` — header extraction | ±0 lines (refactor) |
| `OrderBlockLab.jsx` — section rehousing into 4 tabs | +30 lines (wrappers), −20 lines (3-col grid removal) |
| Default collapse changes (2 props) | +2 characters each |
| **Total** | **~+130–150 net new lines** |

This is a low-risk refactor. No new data dependencies, no new analytics computation, no component API changes. The visual output of each individual panel is identical — only the navigation shell changes.

---

## PHASE 5 — STOP

Audit complete. No code has been written. No files have been modified.

The above is a read-only architecture plan. Implementation begins only when explicitly approved.
