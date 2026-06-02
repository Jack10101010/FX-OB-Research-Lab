# FX-OB Research Lab — Architecture & Workflow Audit

**Mode:** Read-only. No code modified.  
**Date:** 2026-06-02  
**Scope:** Overall user workflow, Projects, Run Workspace, Insights, Edge Explorer, storage architecture, research process.  
**Files read:** App.js, Sidebar.jsx, TopBar.jsx, AppShell.jsx, store.js, Overview.jsx, Projects.jsx, ProjectDetail.jsx, Runs.jsx, RunDetail.jsx, EntriesLab/Workspace, StrategMap.jsx, StrategyBuilder.jsx, Insights.jsx, EdgeExplorerPanel.jsx, data/{store,tradeUniverse,resultsBasis,projectWorkflow,artifactStore,sidecarClient,drillContract,importer}.js, lib/tableCompare.js, backend/server.py, memory/PRD.md, all design/audit MDs in root.

---

## 1. Overall Architecture

### Stack summary
- **Frontend:** React (CRA) + Tailwind + Recharts + lightweight-charts v4. No framework backend — fully client-side.
- **Store:** Single module-level `state` object in `data/store.js` (~2,235 lines). All reads go through `useDataset()` / `buildDerived()`. Mutations are explicit setter functions (`setActiveRunId`, `setScenario`, etc.).
- **Persistence:** Three tiers — localStorage (run index + project metadata + scenario + settings), IndexedDB (`fxob_artifacts` DB, two stores: `candles` and `runs`), and in-memory (full run bundles during a session).
- **Sidecar:** Python backtester exposes a local REST API at `http://127.0.0.1:8787`. The frontend calls it via `data/sidecarClient.js` to launch runs, poll status, and reload full bundles. The sidecar code is **not** in this repo.
- **Backend (`backend/server.py`):** A FastAPI + MongoDB server. It has no API endpoints used by the frontend (its routes are `/api/` + `/api/status`). This appears to be an unrelated scaffolding artifact or dead legacy code.

### Two analytical axes (the architectural spine)
The codebase has articulated two orthogonal dimensions that every number is a function of:

| Axis | Question | Module | Status |
|---|---|---|---|
| **Trade Universe** | *Which trades?* | `data/tradeUniverse.js` → `state.scenario` | Built and adopted on Overview, Strategy Map, EntriesLab |
| **Results Basis** | *How measured?* | `data/resultsBasis.js` → `state.resultsBasis` + `state.accountSettings` | Infrastructure complete; almost no page reads it yet |

This is a sound design. The gap is that Results Basis is still inert in most pages.

---

## 2. What Is Working Well

### 2.1 Store architecture
The module-level singleton + `notify()` fan-out + `useDataset()` hook is clean, predictable, and fast to reason about. There is one source of truth. Setter functions are explicit and consistent. The persistence strategy (index in localStorage, full bundles in IndexedDB) is well-suited to the data sizes involved.

### 2.2 Sidebar navigation grouping
The sidebar now has five named sections — Workspace, Build & Run, Analyze, Compare & Validate, Utilities — which directly mirrors the intended research flow. The previous flat-21-item list has been restructured. TopBar already has the Project and Run switchers. These were the two biggest overwhelm problems identified in APP_WORKFLOW_AND_PROJECTS_AUDIT.md, and both are now addressed.

### 2.3 Trade Universe resolver
`data/tradeUniverse.js` cleanly separates "which trades am I looking at?" from everything else. `resolveTradeUniverse({ bundle, scenario, fallbackVariant })` returns a fully-resolved `TradeUniverse` object with `trades`, `stats`, `warnings`, and `canCompareToBaseline`. Overview and EntriesLab already consume it. This is the right abstraction.

### 2.4 Results Basis infrastructure
`data/resultsBasis.js` is thorough and pure: `summarizeTrades`, `summarizeBuckets`, `buildCurve`, `toCanonicalBucketRow`, `toCanonicalSummaryRow`, `bucketDisplaySchema`, `summaryDisplaySchema`, `accountConfigHash`, `comparisonCellKey`. These are all the primitives needed to wire every analytics surface to a single calculation layer. The work is done — it just hasn't been wired yet.

### 2.5 Three-tier storage
IndexedDB hydration on boot (`hydrateRunsFromIndexedDB`) is non-blocking and handles the common case — run bundles persist across browser refreshes without needing the sidecar. Candles are stored separately in the `candles` object store. The auto-reload logic (`autoReloadIndexedRunsFromSidecar`) is a solid fallback when IndexedDB misses.

### 2.6 ProjectDetail richness
ProjectDetail is genuinely the most feature-rich page: 8-item checklist, `getNextStep` guided workflow, findings log with source classification, experiment timeline, run role assignment (baseline/candidate/final), and sidecar sweep launching. The concept is correct and the implementation is deep.

### 2.7 Insights page
Insights aggregates findings across all projects in one view with source filter (manual / run_workspace / table_compare), project filter, and grouping modes (flat / by project / by source). INS-3 grouping is implemented. This is a good read-only research log surface.

### 2.8 EntriesWorkspace and FailuresWorkspace
Both have rich tab structures. EntriesWorkspace covers Model Analysis, Experiment Compare, Hypothesis Lab, Robustness Lab, and Promotion Desk. FailuresWorkspace covers Overview, Direction, Session, Streaks, Temporal, Archetypes, Prevention, and Drilldown. The depth here is substantial.

### 2.9 Drill contract
`data/drillContract.js` defines a single `{ runId, universeKey, basis, account, bucketKey, label, tradeRefs }` payload shape that any surface can emit and the Edge Explorer can consume. This is the right seam.

### 2.10 Table Compare delta engine
`lib/tableCompare.js` is pure and comprehensive: row matching by stable key, delta computation, metric registry, formatting. Ready to be the inner kernel for Edge Explorer.

---

## 3. What Is Confusing

### 3.1 The `/runs/active` sidebar link
The sidebar "Run Workspace" item navigates to `to: "/runs/active"`. The route table in `App.js` defines `/runs/:runId` (renders `RunDetail`). So `runId` will be the string `"active"`. RunDetail then looks up `state.runs["active"]` — which doesn't exist. The page will render an empty/error state unless RunDetail has special handling for this string. **This is a broken nav link or an unintended hack.** The intent was presumably to always open the active run, but no route resolves to that. The correct approach would be a redirect from `/runs/active` to `/runs/${activeRunId}`, or a dedicated route that reads the active run from the store.

### 3.2 Hardcoded sidebar Active Config mini-card
The sidebar footer mini-card always shows "EURUSD · M15 / RR 3.3 / +39.3R" — these are literals, not read from the store. The TopBar Run switcher already shows the actual active run name. The sidebar card is therefore permanently stale and potentially misleading.

### 3.3 `backend/server.py` is dead code
The file is a FastAPI server with MongoDB that the frontend never calls. It does not correspond to the sidecar (which runs at `:8787`, not this server's port). It is likely scaffolding from a template or an earlier phase. It creates confusion about the actual backend architecture.

### 3.4 Strategy Map `useResolvedScenario` vs global `state.scenario`
`pages/strategyMap/useResolvedScenario.js` resolves the active scenario locally using its own logic. `data/tradeUniverse.js` was explicitly designed to replace this (the comment says "Phase 2A integration: the hook should import these helpers and stop carrying private copies"). The migration appears incomplete — both systems coexist, and it's unclear which is authoritative for Strategy Map.

### 3.5 Results Basis phase tracking is scattered in comments
Comments like "Phase RB-1", "Phase RB-8a/8b", "no page reads these yet" appear throughout the code. These are useful for development history but make it hard to know the current state at a glance. The roadmap in `RESULTS_BASIS_IMPLEMENTATION_ROADMAP.md` is the source of truth, but a new reader of the code can't easily tell what is live vs planned.

### 3.6 "New Backtest" TopBar button has no action
The TopBar `<button data-testid="topbar-new-backtest">New Backtest</button>` has no `onClick` handler. It's a dead button. The intent is presumably to navigate to Strategy Builder.

### 3.7 SweepLab data is explicitly not persisted
`buildDerived()` hardcodes `SWEEP_RR: []` with the comment "sweep data is not stored in bundles; SweepLab owns its own state." This means Overview's "Top Sweep (RR)" panel will always show "No sweep data" unless the user has SweepLab open in the same session. There is no path from a sweep result to the Overview summary.

### 3.8 Insights is read-only but the capture path isn't obvious
Findings enter Insights from Run Workspace (`addProjectFinding`) or Table Compare. But there is no "add finding" affordance visible on Insights itself, nor a prominent reminder in the labs that findings can be captured. Users who don't know to look for the "Save Finding" button in RunDetail or the Table Compare output will have an empty Insights page forever.

---

## 4. Duplicated Concepts

### 4.1 Equity curve computation (three implementations)
1. `store.js: computeEquityCurve(trades)` — used to build `equityCurveByVariant` on run bundles.
2. `Overview.jsx` — inline `useMemo` that recomputes from `universe.trades`, explicitly mirroring store's pure `computeEquityCurve`.
3. `entries/analytics/equityCurveAnalytics.js` — its own curve builder.

These should converge on `data/resultsBasis.buildCurve()`, which already exists and delegates to the same `buildAccountEquityCurve` engine. The inline copies were created because the unified module wasn't ready yet; it is now.

### 4.2 `useResolvedScenario` vs `useTradeUniverse` / `getTradeUniverse`
Two separate hooks that answer "which trades for the current scenario?" — one in `pages/strategyMap/` scoped to Strategy Map, and one in `data/useTradeUniverse.js` used by Overview. The design intent is for `useResolvedScenario` to be refactored to use `tradeUniverse.js` helpers internally. Until that happens, the logic for resolving `triggered_edge`, `penetration`, and `fillMode` scenarios is duplicated.

### 4.3 Max drawdown (two approaches, one page each)
- RunDetail computes max drawdown from the equity curve using `computeMaxDrawdown` from `lib/metrics.js`.
- `resultsBasis.js` exports both `maxDrawdownFromCurve` (curve-based) and `summarizeTrades().maxDrawdownR` (trade-based). These can produce different numbers from the same data.
- The comment in `resultsBasis.js` explicitly acknowledges this: "intentionally CURVE-based … NOT the trades-based … which can differ."
A page that shows both could confuse users.

### 4.4 Sidebar Active Config mini-card vs TopBar Run switcher
Both surfaces communicate "what run is active." The sidebar card is decorative and stale; the TopBar switcher is functional and accurate. The sidebar card adds visual weight without value.

### 4.5 Workspace hook pattern repeated per-lab
`useEntryWorkspace`, `useFailuresWorkspace`, and by implication similar hooks in ProtectionLab — each lab re-invents the same pattern of tab state + filter state + column visibility. There is no shared `useWorkspace` base hook. Not a critical duplication, but it creates maintenance surface.

### 4.6 Project run-role labeling appears in multiple places
`ROLE_ORDER = ["baseline","variant","sweep_result","candidate","final","imported"]` in ProjectDetail.jsx. `runRole` on run bundles in the store. `buildRunIndexEntry` propagates `runRole`. There is no single canonical enum module for these labels — they're string literals scattered across pages.

---

## 5. Missing Workflow Links

### 5.1 No post-import navigation
After importing a run (via ImportZone, StrategyBuilder sidecar, or sidecar auto-reload), the app does not route the user anywhere. They must manually navigate to Run Workspace. This is the most critical missing link — every research session starts with an import and should land somewhere actionable.

### 5.2 No "Open in Run Workspace" from Insights findings
Insights shows `sourceRunId` for each finding, but there is no "Go to Run" button. A finding about a specific run is unactionable from Insights — you have to manually switch the active run and navigate.

### 5.3 Failures Lab has no "Save finding" surface
EntriesLab has a Promotion Desk. RunDetail has `addProjectFinding`. But FailuresLab has no "this failure pattern is notable" → project findings path. Failure patterns discovered there are lost unless the user manually notes them elsewhere.

### 5.4 Walk-Forward, Monte Carlo, HypothesisLab have no "save result" path
These three validation tools produce results (HypothesisLab has a dedicated component, WalkForward and MonteCarlo are stubs), but there is no mechanism to record their conclusions in project findings. They are analytical dead-ends — you see a result, you close the tab, it's gone.

### 5.5 `getNextStep` is only surfaced in ProjectDetail
The `getNextStep(project, checklist)` engine correctly tells the user what to do next based on the project's research state. It is imported in `projectWorkflow.js` for sharing, and RunDetail imports it, but it is not surfaced on Overview or in any persistent top-of-screen prompt. Users who don't open ProjectDetail miss the guidance entirely.

### 5.6 No "assign to project" shortcut from Runs page
Runs.jsx lists all imported runs. There is no inline "assign to project" or "set role" control from the list. You must navigate to ProjectDetail and find the run there. The assignment path is ProjectDetail → click a run's role dropdown — but only if that run is already in the project's `runIds`.

### 5.7 TopBar "New Backtest" is wired to nothing
The button exists, is prominent, and is correctly labeled — but has no `onClick`. A user clicking it gets no feedback and no navigation. Should navigate to `/strategy`.

---

## 6. Biggest UX Bottlenecks

### 6.1 `/runs/active` is a broken route (critical)
The sidebar "Run Workspace" link will either 404-redirect (if RunDetail handles a missing runId gracefully) or display an empty page. This is the primary entry point to the most-used page in the sidebar. Its brokenness undermines the entire Analyze section.

**Severity:** Critical. Blocks the core daily workflow.

### 6.2 Results Basis is built but inert (major capability gap)
The `state.resultsBasis` and `state.accountSettings` are persisted, settable, and exposed in `buildDerived()`. But every analytics page still computes Raw R independently. The basis toggle in RunDetail's account panel is isolated to that page. Users cannot set "measure everything in Current Equity with $10k / 1%" and have that apply globally. The infrastructure is complete; the wiring is not.

**Severity:** High for users who care about dollar-denominated analysis.

### 6.3 Sweep results don't flow anywhere
SweepLab owns its own ephemeral state. A sweep over 20 RR values produces results visible only while SweepLab is open. The Overview "Top Sweep" panel is permanently empty. ProjectDetail can launch sweeps but their results only land back in the store if auto-imported via the sidecar. There is no "save sweep summary to project" path.

**Severity:** High for parameter optimization workflows.

### 6.4 Insight capture is passive / easy to miss
The research workflow depends on capturing findings: what worked, what didn't, what to test next. The only affordances are a "Save Finding" button in RunDetail and Table Compare. There is no in-lab capture in FailuresLab, OrderBlockLab, ProtectionLab, or NewsLab. Most of the daily analysis happens in those labs — findings from them are not captured.

**Severity:** Medium-high. Insights becomes a sparse log rather than the research memory it's designed to be.

### 6.5 "Active run" change requires navigating away (moderate)
Switching the active run requires opening the TopBar Run switcher — which is now present and functional — or navigating to Runs/Projects and clicking "Set Active." The TopBar switcher is good. But switching runs in the middle of EntriesLab or FailuresLab (e.g., to compare a variant) resets the entire lab's context without warning. There is no "compare this run to another within the same lab" — you have to use Comparison Lab.

**Severity:** Moderate. The TopBar switcher helps but lacks a compare-in-place mode.

---

## 7. Storage Architecture Assessment

### What exists
```
localStorage
  fxob_runs_index_v1   → lightweight run index (headlineSummary per run)
  fxob_projects        → full project objects (small, text only)
  fxob_active_run_id   → active run ID
  fxob_active_project_id
  fxob_scenario_v1     → { runId, family, positionVariant, threshold, fillMode }
  fxob_results_basis_v1
  fxob_account_settings_v1
  fxob_sidebar_collapsed_v1
  fxob_strategy_map_ui_v1
  + various page-level prefs (overview scope, runs sort, etc.)

IndexedDB: fxob_artifacts (DB v2)
  candles store  → { runId, candles[], meta }
  runs store     → { runId, bundle (no candles) }
```

### What works well
- The index-only localStorage approach avoids the 5 MB localStorage quota problem that caused the legacy `fxob_runs` blob to fail.
- IndexedDB hydration on boot (`hydrateRunsFromIndexedDB`) is non-blocking — the app renders immediately from index stubs, then enriches as full bundles load.
- Candles are stored separately (can be large) with a graceful fallback to `candlesStorage: "session"` if IndexedDB write fails.
- `getStorageDiagnostics()` and `getIndexedDbDiagnostics()` provide introspection without side effects.
- Backup/restore (`getRunsBackupPayload` / `importRunsBackup`) is well-designed for portability.

### Gaps
1. **Sweep results have no storage tier.** They exist only in `SweepLab` component state. There is no `sweepResults` slice in the store, no IndexedDB store for them, and no export.
2. **No per-run annotation storage.** Run-level notes in RunDetail are entered via `addProjectFinding` which stores on the *project*, not the *run*. If a run is not assigned to a project, annotations are lost.
3. **`backend/server.py` (MongoDB)** is not integrated with any of the above. If this server is intended to be the persistence layer in some future mode, it is architecturally disconnected.

---

## 8. Research Process Assessment

### The intended process (from WorkflowGuide + ProjectDetail getNextStep)
Project → Baseline Run → Inspect → Experiment → Compare → Candidate → Validate → Export Config

### What the code actually supports well
- **Project creation and metadata** — solid.
- **Run import and ingestion** — solid, supports multi-variant bundles.
- **Single-run analysis** — Strategy Map, Trade Inspector, OB Lab, Entries Lab, Failures Lab, Protection Lab are all capable.
- **Comparison** — Comparison Lab + Table Compare drawer are both functional.
- **Step guidance** — `getNextStep` is correct and available.
- **Findings capture** — available from RunDetail and Table Compare but not prominent enough.

### What the code partially supports
- **Session-to-session continuity** — IndexedDB hydration is good but sweep results and lab-level annotations don't persist.
- **Experiment tracking** — ProjectDetail's experiment timeline and findings log are the right shape, but capturing to them requires deliberate action.
- **Promotion path** — EntriesLab has a Promotion Desk; other labs don't.

### What the code doesn't support yet
- **Results Basis app-wide** — all analytics still default to Raw R regardless of the global basis setting.
- **Edge robustness scoring** — Edge Explorer exists as a trade-list drill panel, but the cube (`buildEdgeCube`) that evaluates an edge across multiple universes/runs/facets is not yet implemented. The design is complete (`EDGE_EXPLORER_LAYER3_DESIGN.md`).
- **Walk-Forward and Monte Carlo** — pages exist but are stubs (no computation engine). These are the final validation gates in the research process.

---

## 9. Recommended Implementation Order

Ordered by impact-per-effort, least risk first:

### Tier 1 — Quick fixes (hours each, no design needed)

1. **Fix `/runs/active` routing.** Either add a `<Route path="/runs/active">` that reads `state.activeRunId` and redirects to `/runs/:id`, or change the sidebar link to a dynamic path based on `activeRunId`. Without this, the primary Analyze hub is broken.

2. **Wire TopBar "New Backtest" button.** Add `onClick={() => navigate("/strategy")}`. One line.

3. **Fix sidebar Active Config mini-card.** Read `ACTIVE_RUN` from the store and render its `symbol`, `detectionTf`, `rr`, `netR` dynamically, or remove the card entirely (the TopBar Run switcher already surfaces this information).

4. **Add `onClick` navigation to Runs page "Open in Run Workspace."** When a user clicks a run row, it should set that run active and navigate to `/runs/${run.id}`.

### Tier 2 — Workflow continuity (1–2 days each)

5. **Post-import navigation.** After `addRunBundle()` succeeds (in `ImportZone`, `StrategyBuilder`, or sidecar auto-import), navigate to `/runs/${newRunId}`. This makes import a one-step action with an immediate result.

6. **Surface `getNextStep` on Run Workspace.** The logic is already imported in RunDetail. Render it as a prominent "Next step" callout at the top. This turns every post-run landing into a guided prompt.

7. **Add "Save Finding" to FailuresLab.** Reuse the existing `addProjectFinding` pattern from RunDetail. One panel or button in FailuresWorkspace's header. Findings from failure analysis are the most research-valuable of all.

8. **"Go to Run" link on Insights finding rows.** `sourceRunId` is already stored on each finding. Add a button that sets that run active and navigates to `/runs/${finding.sourceRunId}`.

### Tier 3 — Architecture convergence (3–5 days each)

9. **Migrate `useResolvedScenario` to consume `tradeUniverse.js` helpers.** Eliminates the duplicate scenario-resolution logic and ensures Strategy Map's trade selection is consistent with every other page. The target API (`resolveTradeUniverse`) already exists.

10. **Wire Results Basis globally.** `state.resultsBasis` and `state.accountSettings` are persisted and exposed. The remaining work is making each analytics page read `RESULTS_BASIS` from `useDataset()` and pass it to `summarizeTrades` / `buildCurve` instead of hard-coding `"raw_r"`. Start with Overview and EntriesLab (which already import `useTradeUniverse`).

11. **Converge equity curve computation onto `resultsBasis.buildCurve`.** Remove the inline `computeEquityCurve` in Overview and the duplicate in `equityCurveAnalytics.js`. All callers route through the single implementation.

### Tier 4 — New capability (1–2 weeks each)

12. **Sweep result persistence.** Add a `sweepResults` slice to the store (or a dedicated IndexedDB store). SweepLab writes results there on completion. Overview "Top Sweep" panel reads from the store. ProjectDetail can link to a saved sweep. This closes the biggest gap in the parameter optimization workflow.

13. **Edge Explorer cube (`buildEdgeCube`).** The design is fully specified in `EDGE_EXPLORER_LAYER3_DESIGN.md`. The prerequisite modules — `tradeUniverse`, `resultsBasis`, `tableCompare`, `drillContract`, `EdgeExplorerPanel` — are all in place. This is the highest-leverage analytical feature remaining.

14. **Walk-Forward and Monte Carlo engines.** These are the final validation gates. Both pages are stubs. Monte Carlo can run in a Web Worker; Walk-Forward needs a rolling-window split of the trade timeline.

---

## 10. Summary Table

| Area | State | Priority gap |
|---|---|---|
| Store architecture | ✅ Solid | — |
| Sidebar grouping | ✅ Done | — |
| TopBar switchers | ✅ Done | "New Backtest" onClick missing |
| `/runs/active` routing | ❌ Broken | Fix immediately |
| Post-import navigation | ❌ Missing | High — daily friction |
| Results Basis wiring | ⚠️ Built, inert | Wire to analytics pages |
| Trade Universe | ✅ Adopted on most pages | Finish Strategy Map migration |
| Projects / Checklist | ✅ Rich | Lighten sweep-launching burden |
| Insights | ✅ Working | Add "Go to Run" links |
| Findings capture (labs) | ⚠️ Partial | Add to Failures, Protection, OB labs |
| Edge Explorer | ⚠️ Trade-list only | Cube not yet built |
| Sweep persistence | ❌ Ephemeral | High — results disappear |
| Walk-Forward / Monte Carlo | ❌ Stubs | Long-term validation gap |
| Storage (IndexedDB) | ✅ Solid | Sweep results have no tier |
| `backend/server.py` | ❓ Unused | Clarify or remove |
