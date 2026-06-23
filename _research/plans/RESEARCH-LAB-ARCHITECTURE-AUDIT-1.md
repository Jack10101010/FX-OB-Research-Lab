# Research Lab — Architecture Audit (AUDIT ONLY)

A design audit for a new **Research Lab**: the universal cohort → research-module workbench. **No code changed. No commits.** The thesis: the platform has *already* built the engines this needs (a dimension registry, a what-if/discovery truth layer, and a set of cohort-keyed research modules) — but they live in three different workstreams and are partly duplicated. Research Lab's job is to **converge them behind one cohort abstraction and one module contract**, not to invent new analytics.

Files read (minimum): `pages/RunDetail.jsx` (tab registry), `components/lab/Sidebar.jsx` (top-level nav), `data/timingAnalytics.js`, `components/lab/failures/shared/filterSimulator.js`, `components/lab/failures/shared/failuresDimensions.js`, `components/lab/failures/excursion/FailureExplorer.jsx`, `data/sessionResults.js` (TP/BE/Risk-Reduction modules), `components/masterControls/tradeFilter.js` + `previewComposer.js` (preview/filter overlay).

---

## 0. What already exists (the honest starting point)

| Capability | Where it lives | Shape |
|---|---|---|
| **Dimension registry** (trade → categorical value) | `failuresDimensions.js` | `{key,label,tier,accessor,numeric}` + `resolveDimension`/`dimensionAvailable`/`availableDimensions`. Has session/direction/structure/weekday/hour/archetype/severity/obwidth/penetration/entryModel/ghost/fft |
| **Metrics core** | `filterSimulator.metricsOf`, `sessionResults.statsFor`, `timingAnalytics.timingBucketMetrics` | **Three near-identical implementations** of trades/W/L/netR/PF/WR(/exp) |
| **What-if removal truth layer** | `filterSimulator.simulateRemoval` **and** `timingAnalytics.simulateTimingRemoval` | **Two identical-semantics implementations** |
| **Discovery (rank cohorts by Δ)** | `filterSimulator.buildFilterDiscovery` **and** `timingAnalytics.buildTimingDiscovery` | **Two** |
| **Cohort explorer UI** (pick 1–2 dims + metric + floor) | `FailureExplorer.jsx` | Prop-driven, explicitly "promotable to a standalone tab" |
| **Research modules** (cohort-keyed pure fns) | `sessionResults.js` | `cohortTargetEconomics` (TP, **EXACT**), `cohortBESuitability` (**BOUND**), `cohortRiskReduction` (**BOUND**), `cohortExcursionSnapshot`, `cohortManagementRead`, `cohortResearchVerdict` |
| **Timing modules** | `timingAnalytics.js` | month/session/hour/weekday/direction/year breakdowns + stability + confidence + matrix + drilldown |
| **Filter/preview overlay** (recompute on a trade subset, read-time) | `masterControls/tradeFilter.js` + `previewComposer.composePreviewBundle` + `previewLens` | Filters population by session/structure/direction, recomputes equity/W/L through ONE preview pipeline, overlaid without touching store/importer/backend |
| **Read-only headline router** | `pages/ResearchCockpit.jsx` (`/cockpit`) | Ranks insights from existing analytics; "what to look at" |

**The key realization:** the Session Results → **Management tab** (TP/BE/Risk-Reduction suitability) and the **Timing & Regime tab** are *already* two instances of "pick a cohort → run research modules on it." Research Lab is the **generalization**: the same modules, but the cohort comes from a unified registry (any session/month/hour/weekday/direction/cross), not just a session-results row or a calendar bucket.

---

## 1. Research Lab vision

**Research Lab = the interactive cohort workbench.** A user selects *any* trade subset (a cohort) and runs a stack of research modules (TP, BE, Risk-Reduction, Calendar, Discovery, …) on it, each carrying its honesty grade and confidence. It sits beside the existing labs as the **general-purpose** surface; the specialized labs remain for deep, domain-specific work.

Recommended placement: a **top-level page** (`/research-lab`) bound to the active run's trade universe (like Failures/Protection/News Lab, which read `getActiveBundle()`), with a run/scenario context header. *Not* a Run Detail tab — it's cross-cutting and benefits from full-width real estate and its own route (deep-linkable from Cockpit).

Relationship to existing surfaces, and what should move vs stay:

- **Research Cockpit** (`/cockpit`) — *complementary, keep separate.* Cockpit is the read-only "headlines + what to investigate" router. Research Lab is where you *go investigate*. Wire Cockpit cards to deep-link into Research Lab with a pre-selected cohort. No overlap if Cockpit stays read-only-ranking and Research Lab stays interactive-modules.
- **Session Results → Management tab** — *modules should be shared, the surface stays.* The TP/BE/Risk-Reduction panels there are cohort-keyed pure functions already. Extract the **panel components** into a shared `research/modules/*` set so both the Management tab and Research Lab render the same modules. Keep the Session Results 6×4 cohort *grid* (it's a navigation/overview surface); it simply becomes one way to launch a cohort into the module stack.
- **Timing & Regime tab** — *its analytics become the "Calendar Research" + "Discovery" modules.* The month/session/hour/weekday/year breakdowns, the matrix, and the drilldown are timing-flavoured cohort views. Long-term they're a Calendar module in Research Lab; the dedicated Timing tab can remain as a curated calendar-first entry point or be retired once parity is reached (Phase decision, not forced).
- **Failures Lab** — *stays separate (deep dive); shares the engine.* Failures Lab is a specialized loss-diagnostics workspace (excursion, confirmed-false-losers, failure clusters, BE-opportunity, FailureExplorer). It should **remain** — but its `FailureExplorer` + `filterSimulator` discovery are exactly the shared cohort/what-if engine Research Lab also consumes. A lightweight **"Failure Research" module** in Research Lab gives a cohort-scoped failure read; the full lab stays for depth.
- **Protection Lab / Breakeven** — *stays separate (exact replay); Research Lab carries the bounded version.* Protection Lab owns selective-BE, **exact BE replay**, and the BE Trade Explorer (replay-based, heavy, exact). Research Lab's BE module is the **bounded** `cohortBESuitability` (path-order BOUND, no replay). Do **not** duplicate replay into Research Lab — the BE module's job is triage ("worth a backend BE sim?"), and it links out to Protection Lab for the exact run.
- **News Lab** — *stays separate; future "News Research" module* gives a cohort-scoped news-impact view once a news dimension is registered.
- **Hypothesis Lab / Walk-Forward / Sweep / Monte Carlo** — *downstream validators.* Research Lab is in-sample discovery; it should **route candidates out** to these for OOS/robustness (the "Stage Backend Test" affordance already stubbed in the Management tab is the seed of this hand-off).

**One-line product map:** Cockpit (what to look at) → **Research Lab (investigate any cohort)** → Walk-Forward/Hypothesis/Sweep (validate). Specialized labs (Failures, Protection, News) remain for deep domain work and share Research Lab's engine.

---

## 2. Cohort model

A **Cohort** is the universal unit. The abstraction already half-exists in `cohortMatcher`/`failuresDimensions`; formalize it:

```
Cohort = {
  id,                         // stable string, e.g. "session:New York|month:2"
  label,                      // "New York × Mar"
  dims: [{ dim, value }],     // provenance: which registry dims + values define it
  predicate: (trade) => bool, // membership test (built from dims via registry accessors)
  trades: Trade[]             // resolved, memoized subset of the active universe
}
```

**Unified dimension registry (the one real new piece of infra).** Merge today's two registries into one cohort-dimension registry:
- From `failuresDimensions`: session, direction, structure, weekday, hour, archetype, severity, obwidth, penetration, entryModel, ghost, fft.
- From `timingAnalytics`: month, year (and the hour-derived session, which must reconcile with the failures `session` accessor — pick one canonical session definition).
- Future: news (impact/window), OB characteristics, failure-cohort tags, structure-direction.

Each entry keeps the proven contract: `{key, label, tier, accessor(trade)→value|null, numeric?, available(trades)}`. Crosses are expressed as a list of `{dim,value}` — single, pair, or (capped) triple, mirroring the existing "no free-form N-way mining" decision.

**Filtering architecture.** One pure resolver:
```
resolveCohort(allTrades, selection) → Cohort
selection = { dims:[{dim,value}], base?:"valid"|"all" }
```
`predicate` is the AND of per-dim accessor equality (reusing `cohortMatcher`'s string-compare semantics). `trades` is `allTrades.filter(predicate)`, memoized. The **base universe** is the timestamped/`isPerformanceTrade` valid set (the same gate Timing's `timestampedTrades` and FilterDiscovery's `isPerformanceTrade` already apply) so every module shares one denominator.

**Data contracts.** Modules never see raw selection — only a resolved `Cohort` (label + trades + dims) and a read-only `RunContext` (run meta, currentTarget label, available dimensions). This keeps modules pure and cohort-source-agnostic: the same TP module works whether the cohort came from the registry, a Session Results row, a Timing drilldown, or a Cockpit deep-link.

**Two complementary cohort-entry modes** (both feed `resolveCohort`):
1. **Builder** — pick dimension(s) + value(s) from the registry (FailureExplorer's model, generalized).
2. **Discovery-driven** — click a ranked discovery candidate (it already carries `{dim,value}` provenance) to load it as the active cohort. This is the magic loop: discover → investigate → validate.

---

## 3. Research module architecture

A **module** is a pure compute + a renderer, registered in an array. This is exactly the shape the Management tab already uses informally — formalize it:

```
ResearchModule = {
  key, title,
  grade: "EXACT" | "BOUND" | "SPECULATIVE",   // honesty grade, shown in the header
  available: (cohort, ctx) => bool,           // data-availability gate (mfe? mae-to-exit? variants?)
  compute:   (cohort, ctx) => result,         // PURE — lives in the owning data/* file
  Panel:     ({ result, cohort, ctx }) => JSX // renderer
}
```

**Module → existing compute mapping (almost all reuse):**

| Module | Grade | Reuses |
|---|---|---|
| **Cohort Summary** (always on) | EXACT | `metricsOf`/`statsFor` + `stabilityOf` + confidence + header counts |
| **TP Research** | EXACT | `sessionResults.cohortTargetEconomics` (exact re-targeting from MFE) |
| **BE Research** | BOUND | `sessionResults.cohortBESuitability` |
| **Risk-Reduction Research** | BOUND | `sessionResults.cohortRiskReduction` |
| **Calendar Research** | EXACT (descriptive) | `timingAnalytics` breakdowns + year + matrix + drilldown |
| **Discovery / What-If** | EXACT (in-sample) | `simulateRemoval` + `buildFilterDiscovery` (the canonical, post-convergence engine) |
| *Future:* News Research | TBD | new news dimension + cohort-scoped news view |
| *Future:* Structure Research | EXACT | structure/obwidth/penetration dims (already in registry) |
| *Future:* Failure Research | mixed | `FailureExplorer` + excursion analytics (lightweight) |
| *Future:* Protection Research | EXACT (links out) | links to Protection Lab's exact BE replay |

**Shared interfaces / contracts:**
- **Honesty grade is mandatory** and rendered in every module header (EXACT / ESTIMATE-BOUND / NEEDS-BACKEND), continuing the established convention.
- **Availability gating** hides modules whose data isn't exported for this run (e.g. Risk-Reduction needs `mae_r_to_original_exit`; Discovery needs ≥1 dimension available) — reuse `dimensionAvailable` + field-presence checks.
- **Compute stays in the owning pure file** (`sessionResults.js`, `timingAnalytics.js`, `filterSimulator.js`); Research Lab imports them read-only through a thin module-registry adapter. No reaching into any lab's render state (the FailureExplorer isolation rule, generalized).

**Data flow:** `activeRun → validUniverse → resolveCohort(selection) → cohort.trades → for each available module: compute(cohort,ctx) → Panel`. What-if/Discovery take `cohort` as the candidate against the full universe (remove-this) or treat `cohort.trades` as the population (refine-within).

---

## 4. Reuse analysis

| Asset | Reuse directly? | Verdict |
|---|---|---|
| **`timingAnalytics.js`** | Yes (as the Calendar module's compute) | **Reuse directly.** Pure, self-contained, validated. Its `simulateTimingRemoval`/`buildTimingDiscovery` are duplicates of filterSimulator — fold into the shared engine over time, but no urgency. |
| **`filterSimulator.js`** | Yes (`metricsOf`, `simulateRemoval`, `cohortMatcher`, `buildFilterDiscovery`, `recommendFilter`) | **Promote to the canonical shared engine.** It's already pure and dimension-registry-driven. Needs **extraction** out of `components/lab/failures/shared/` into a neutral `data/` location so non-Failures consumers don't import across a component/workstream boundary. |
| **`failuresDimensions.js`** | Yes (the dimension abstraction) | **Extract + unify.** Move to a neutral `data/cohortDimensions.js`, merge timing's month/year, reconcile the session definition. This is the single most important extraction. |
| **`failuresAggregation` / `FailureExplorer`** | Partly | **Reuse the explorer UI pattern** (prop-driven, promotable). `buildExplorer` (winners-inclusive lift) is reusable for the Discovery module. Keep the deep failure-specific bits in Failures Lab. |
| **`cohortBESuitability` / `cohortRiskReduction` / `cohortTargetEconomics`** | Yes | **Reuse directly** as module computes. They're already cohort-keyed pure functions taking `executedTrades`. Zero change needed. |
| **`masterControls/tradeFilter.js` + `composePreviewBundle` + `previewLens`** | Selectively | **Remain isolated; borrow the pattern.** This is the *apply-and-recompute-at-read-time* overlay tied to scenario/config draft state and the store. Research Lab's cohort filtering is lighter (pure subset + recompute, no store overlay). Reuse `metricsOf`/`equityFromTrades` math; do **not** couple Research Lab to MasterControlsContext/draft state. The one place to integrate is the **hand-off**: "promote this cohort/target to a Master Controls preview / Stage Backend Test." |

**Net:** ~80–90% reuse. The genuinely new work is (a) one unified cohort/dimension registry + resolver, (b) one module registry + shell, (c) module *panel* extraction so Session Results and Research Lab share renderers. The biggest *latent* win is collapsing the two what-if engines and two dimension registries into one — do it as an extraction, not a rewrite, so Timing/Failures keep working untouched and migrate opportunistically.

---

## 5. UX / page layout

**Recommended: a persistent workbench — left cohort rail + right module stack (collapsible accordion within one scrolling page).** Not tabs-per-module (too much clicking to compare modules for one cohort), not one monolithic page (too long without collapse).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Research Lab            Run: EURUSD M15 · CHoCH · 2 Jan 20→19 Jun 26      │
├───────────────┬──────────────────────────────────────────────────────────┤
│ COHORT        │  COHORT SUMMARY                                           │
│ ▸ Builder     │  New York × Mar · 26T · 18W/8L · +2.4R · PF 1.27 · WR 69% │
│   Session ▾   │  Stability: 4/7 yrs + · Confidence: Medium  [EXACT]       │
│   Month  ▾    │──────────────────────────────────────────────────────────│
│   Hour   ▾    │  ▾ TP Research            [EXACT]                         │
│   Direction ▾ │     (cohortTargetEconomics table + recommendation)        │
│   + add dim   │  ▸ BE Research            [BOUND]                         │
│               │  ▸ Risk-Reduction         [BOUND]                         │
│ ▸ Discovery   │  ▸ Calendar Research      [EXACT]                         │
│   (ranked     │  ▸ Discovery / What-If    [EXACT · in-sample]            │
│    candidates,│  (unavailable modules hidden / greyed with reason)        │
│    click→load)│                                                           │
└───────────────┴──────────────────────────────────────────────────────────┘
```

- **Cohort rail (left):** Builder (registry-driven dimension pickers, 1–3 dims) + a live Discovery list whose rows load as the active cohort on click. Sticky.
- **Cohort summary (top-right):** the always-on EXACT header — counts, W/L, Net R, PF, WR, expectancy, stability, confidence — orienting the user before any module.
- **Module stack (right):** collapsible panels, each with its honesty-grade chip; **lazy compute on expand** (only the open module runs); unavailable modules collapse to a one-line "needs `mae_r_to_original_exit` / run the entry sweep" note.
- **Per-module actions:** "Stage backend test", "Open in Protection Lab" (BE), "Validate in Walk-Forward", "Save finding" (reuse `addProjectFinding`).

Why this wins long-term: adding a module is appending to the registry (no nav surgery), comparing modules for one cohort is a single scroll, and the cohort context persists across modules. It mirrors the proven Management-tab stack, just with a swappable cohort source.

---

## 6. Implementation phases

- **Phase 0 — Extraction (enabling refactor, additive).** Move `filterSimulator` + `failuresDimensions` to neutral `data/` modules (re-export from old paths for back-compat so Failures Lab is untouched). Define the unified `cohortDimensions` registry (merge timing month/year, reconcile session). Define `ResearchModule` + `resolveCohort` contracts. *No UI yet.* Validator-backed.
- **Phase 1 — Research Lab shell + Cohort Explorer.** New `/research-lab` page reading the active run's valid universe; cohort rail (Builder) + Cohort Summary (reuse metrics/stability/confidence). Ship with **one** module — Discovery/What-If (reuse `buildFilterDiscovery`) — to prove the contract end-to-end and give immediate value.
- **Phase 2 — Calendar Research module.** Wrap `timingAnalytics` breakdowns/year/matrix/drilldown as a module. (Timing tab stays; this proves a heavy module slots into the stack.)
- **Phase 3 — TP Research module.** `cohortTargetEconomics` (EXACT). Extract the Management-tab Target panel into a shared component used by both surfaces.
- **Phase 4 — BE Research module.** `cohortBESuitability` (BOUND) + "Open in Protection Lab" hand-off.
- **Phase 5 — Risk-Reduction Research module.** `cohortRiskReduction` (BOUND).
- **Phase 6 — Discovery convergence + cross-links.** Make `simulateRemoval` the single what-if core; migrate `timingAnalytics.simulateTimingRemoval` to call it; wire Cockpit → Research Lab deep-links and Research Lab → Walk-Forward/Hypothesis hand-offs.
- **Future — News / Structure / Failure / Protection modules** as their dimensions/exports land.

Each phase is additive, frontend-only, validator-covered, and leaves the existing labs working.

---

## 7. Risks & mitigation

- **Duplication (highest risk).** Three metrics impls + two what-if engines + two dimension registries *already* exist; a naive Research Lab would add a third of each. **Mitigate:** Phase 0 extraction first — one registry, one metrics core, one what-if engine — and consume them; migrate Timing/Failures opportunistically, never forcing a big-bang rewrite.
- **Coupling / workstream contamination.** TP/BE/Risk computes are owned by the Session Results stream; timing by the Timing stream; filterSimulator by Failures. **Mitigate:** Research Lab imports *pure compute functions read-only* via the module registry; module *panels* are extracted to a shared `research/modules/*` dir that both the owning tab and Research Lab import. No reaching into render state (FailureExplorer's isolation rule). Per `AGENTS.md`, additive registries — don't mutate the Failures registry in place.
- **Performance.** Discovery enumerates many cohorts × O(n); a cohort may run several modules. **Mitigate:** memoize `cohort.trades`; lazy-compute modules on expand only; reuse the single valid-universe filter; cap discovery candidates (existing pattern); the matrix/drilldown are already O(n)-per-cell and acceptable at current run sizes (hundreds–thousands).
- **Overfit (the existential risk).** A universal in-sample optimization workbench multiplies false-discovery surface enormously. **Mitigate:** the honesty grade (EXACT/BOUND/SPECULATIVE) + confidence/stability are **mandatory** on every module and the cohort summary; hard sample floors; single-year veto already in place; "confirm in backend / OOS" labels; and *structurally* route candidates to Walk-Forward/Hypothesis/Sweep so discovery never reads as a result. Research Lab must feel like a hypothesis generator, not a strategy approver.
- **UI complexity.** A do-everything page can overwhelm. **Mitigate:** progressive disclosure (collapsible, lazy modules), availability-gating hides irrelevant modules, an always-on cohort summary orients first, a sensible default cohort (whole valid run), and consistent per-module honesty headers. Keep the specialized deep labs separate so Research Lab stays a *triage/exploration* surface, not a kitchen sink.

---

## Output summary

- **Recommended architecture:** one **Cohort** abstraction (unified dimension registry + pure `resolveCohort`), one **ResearchModule** contract (grade + available + compute + Panel) over a module registry, consuming **shared** metrics + what-if + discovery engines extracted from today's duplicated copies. Research Lab is a generalization of the Management/Timing tabs, not new analytics.
- **Recommended page structure:** top-level `/research-lab` page bound to the active run; persistent left cohort rail (Builder + Discovery) + right module stack (collapsible, lazy, honesty-graded), with hand-offs to Protection Lab / Walk-Forward / backend staging.
- **Recommended data architecture:** valid universe → `resolveCohort(selection)` → `cohort.trades` → available modules' pure `compute` → panels; all read-only over the active run, no store/importer/backend changes; modules' compute stays in their owning pure files.
- **Implementation phases:** 0 extraction → 1 shell + cohort explorer + Discovery → 2 Calendar → 3 TP → 4 BE → 5 Risk-Reduction → 6 convergence + cross-links → future News/Structure/Failure/Protection.
- **Overarching principle:** **converge, don't fork.** The engines exist; Research Lab's value is unifying them behind one honest cohort→module workbench and routing every in-sample finding toward out-of-sample validation.
