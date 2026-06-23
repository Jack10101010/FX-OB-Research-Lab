# RUN-VARIANT-HEADER-AUDIT-1

**Type:** audit + plan (AUDIT ONLY — no implementation, no source changes)
**Owner:** Claude (UI/UX + system audit)
**Branch verified:** `codex-dev` · HEAD `c30486c` · clean tree NOT assumed (dirty — see §0.6)
**Date:** 2026-06-10
**Scope:** Plan a clean, premium "active-lens" header for switching variants *within the
current backtest/run* across Research Lab pages. Audit only. No edits made to any source file.

---

## §0 — Session-start verification (docs vs live git)

Read `docs/ai/{AGENTS,CURRENT_WORKSTREAM,PROJECT_STATUS,WORKSTREAMS}.md` and root `AGENTS.md`,
then verified against `git status` / `git log --oneline -20`. Findings below are reconciled
against the repo — docs were **not** trusted blind.

### 0.1 Current status
- Branch `codex-dev`, up to date with `origin/codex-dev`. HEAD = `c30486c feat(failures): add MAE by dimension analysis`.
- Project is healthy and mid-stream on **Failures Lab V4 final integration cleanup**. That
  cleanup is **implemented in the working tree but not committed** (matches the docs' "commit pending").
- No merge in progress, no detached HEAD. `main` and `session-lab-emergent` exist remotely; work is on `codex-dev`.

### 0.2 Current workstream
**Failures Lab V4 → final integration cleanup, then pause** (`docs/ai/CURRENT_WORKSTREAM.md`,
updated 2026-06-10). Remaining items per the doc — Excursion tab wiring, untracked roadmap deps,
MFE/MAE alias detection, NUL→`` separator fix, verdict-chip UI — are all reflected as dirty/untracked
files in the tree, so the doc is accurate.

### 0.3 Next recommended task (per the plan of record, before this new ask)
Hand the Failures Lab V4 cleanup to the host as **scoped commits** (the sandbox can't unlink
`.git/index.lock`), then **pause Failures Lab** and take the Master-Controls-vs-Protection pivot
decision. The new variant-header task below is a **fresh parallel workstream** and should be
registered in `WORKSTREAMS.md` before any implementation.

### 0.4 Detected drift between docs and repo
| Drift | Evidence | Severity |
|---|---|---|
| `MODEL-FAMILY-COMPARISON-2E-RUNDETAIL-UI-PLAN.md` is labelled **"PLAN ONLY — no implementation"** but the plan is **shipped**. | `RunDetail.jsx` imports `buildModelFamilyComparison` (L57), memoises it (L938-942), renders the "Model Family Comparison" section (L2996) and defines `ModelFamilyTable` (L4865-4924). `buildEnabledVariantBreakdown` is no longer the active path. | Low (stale plan doc; code is correct) — note when next `/sync`. |
| `docs/ai/CURRENT_WORKSTREAM.md` previously named Classification Tab V2 as active; PROJECT_STATUS notes it was corrected. | Both docs now agree Classification is paused/shipped. | Resolved — informational. |
| Root vs `docs/ai/` copies of `PROJECT_STATUS.md`/`WORKSTREAMS.md` intentionally differ (git-coordination vs AI-memory). | `AGENTS.md` documents this split. | Not drift — by design. |
| Two `docs/ai/.fuse_hidden…` files + a `.fuse_hidden…` under `failures/shared/` are untracked. | `git status`. | Cosmetic — FUSE mount artifacts; do not commit. |

Overall doc accuracy is **high**; the only real drift is the 2E plan's status label.

### 0.5 Active parallel workstreams to be aware of
From `WORKSTREAMS.md`, reconciled with dirty files in `git status`:
- **Failures Lab V4** (current focus) — owns `components/lab/failures/**`, `roadmap/*`, `roadmapStore.js`. Dirty.
- **OB-Retest** (Phase 2 exporter audit) — owns `data/obRetest.js`, `components/lab/retest/*`, `retest_tracker*.py`. **Dirty** (`RetestLabTab.jsx`, `useRetestData.js`, `obRetest.js`, `retest_tracker*.py`).
- **Protection / BE-Replay** — owns `pages/ProtectionLab.jsx`, `data/beReplay.js`, `protection/BreakevenTab.jsx`. **Dirty** (`ProtectionLab.jsx`; untracked `beReplay.js`, `BreakevenTab.jsx`).
- **Master Controls** (Phase 7A complete, stable) — owns `components/masterControls/*`, `configRegistry.js`, `configTranslator.js`. Do not touch.
- **Entry / FFT / Paired Runs** — owns `components/lab/entries/*`, shares `data/importer.js` + `StrategyBuilder.jsx`. `importer.js` is **dirty**.
- **Strategy Map**, **Session Lab**, **Ghost/Backend** — parallel, currently quiet.

**Implication for this task:** the variant-header work touches `RunDetail.jsx`, `tradeUniverse.js`,
`store.js`, and potentially `StrategyMap.jsx`/`HypothesisLab.jsx`/`ProtectionLab.jsx` — all of which
are **shared, multi-owner, frequently-dirty** files. Coordination and scoped commits are mandatory.

### 0.6 Uncommitted work that may affect planning
The tree is **dirty across four streams simultaneously** (Failures, OB-Retest, Protection, plus the
seven `docs/ai/*` files and `importer.js`). Concretely relevant to *this* task:
- `frontend/src/data/importer.js` — **modified** (Entry/FFT auto-control ingestion). The variant
  header depends on importer-shaped fields (`tradesByMode`, `entryResults`, `directionalResults`).
  Pull the latest importer contract before finalising the data contract in §5.
- `pages/ProtectionLab.jsx` — **modified** by the Protection stream; if the header is later added there, rebase on their work first.
- Nothing in `RunDetail.jsx`, `tradeUniverse.js`, `store.js`, or `useTradeUniverse.js` is currently
  dirty — those four are clean at HEAD, so the audit below reflects committed reality.

---

## §1 — Current state (variant switching today)

### 1.1 The two "variant" axes (a terminology collision that must be fixed)
The codebase has **two unrelated concepts both called "variant"** in places:

1. **Position variant** — the exported position-sizing/exit slices in `bundle.tradesByVariant`.
   State: `state.selectedTradeVariant` in `store.js`; selector `ACTIVE_TRADE_VARIANT`; mutator
   `setSelectedTradeVariant`; UI is the small `VariantSelector` dropdown (`RunDetail.jsx` L3985-3993)
   and the "Variant" scope chip (L1808-1810). This is *which exported run-file* you're reading.

2. **Result View / Scenario / "the lens"** — *which entry-model interpretation* of the same run you
   view: `baseline`, `triggered_edge`, `penetration`, `directional` (and the `entry_model` family in
   the comparison table). State: structured `scenario` `{ runId, family, threshold, fillMode, positionVariant }`
   in `store.js`; selector `SCENARIO`; mutator `setScenario`. In `RunDetail.jsx` this is mirrored into a
   **local** `resultView` state.

The user's request ("switch variants belonging to the current backtest/run", "triggered-edge/penetration
variant", "Arm C0/C1 double-count") is about axis **2 (Result View)**, with axis 1 (position variant)
shown as supporting context. **These must be named distinctly** (see §7).

### 1.2 Where the logic lives (data flow)
```
importer.js ──► bundle { trades, tradesByVariant, tradesByMode/entryResults,
                          directionalResults, config, primaryVariant }
                          │
store.js  ──► activeRunId · selectedTradeVariant · scenario{runId,family,threshold,fillMode}
              (persisted: LS_ACTIVE, LS_SCENARIO="fxob_scenario_v1")
              mutators: setActiveRunId / setSelectedTradeVariant / setScenario
              selectors (useDataset): SCENARIO, ACTIVE_TRADE_VARIANT, activeRunId, getRunData
                          │
tradeUniverse.js (PURE)  ──► resolveTradeUniverse({bundle,scenario,fallbackVariant,hint})
              · resolveHierarchy / buildAvailableOptions / selectTrades / buildCanonicalKey
              · describeUniverseLabel  (Arm C0/C1/C2/C3 + "Both" labels)
              · derivePrimaryResultView(bundle)  ← config-intent-aware default (AVOIDS baseline)
              · warnings: FILL_MODE_COERCED, BOTH_UNAVAILABLE_NO_COMBINED (the double-count one),
                          NO_TRADES_FOR_SCENARIO, NO_BUNDLE
                          │
useTradeUniverse.js  ──► useTradeUniverse(runId, scenarioOverride)  → memoised universe
useFftAnalysis.js    ──► useFftAnalysis(runId, resultView)
                          │
RunDetail.jsx        ──► local resultView state → universe → ALL analytics
useResolvedScenario  ──► StrategyMap reads store SCENARIO (no override)
HypothesisLab        ──► useTradeUniverse()  (no override → store SCENARIO)
```

The **pure resolver layer (`tradeUniverse.js`) is already excellent shared infrastructure** and is
re-used by both the store selector (`getTradeUniverse`) and `useResolvedScenario` (byte-for-byte same
functions). The double-count guard lives there (`tradeUniverse.js` L573-579), so it is *consistent and
centralised at the data layer*. The fragmentation is entirely at the **state-ownership and presentation**
layers.

### 1.3 The Run Detail header today ("RW-13 Entry Model Card", `RunDetail.jsx` L1541-1936)
This is already a strong research-cockpit header and is the template to extract from:
- **Left column "Entry Model":** model pills (Baseline / Penetration / Triggered Edge), conditional
  Threshold row (10/25/50/75), conditional Fill-Mode row (Both / Same / Next / Delay +2/+3 — only for
  triggered_edge), Directional Scenarios row, then scope chips (Variant / Basis / Account).
- **Right column "Current Result View":** dominant 20px label (e.g. "Triggered Edge 50% · Next Candle"),
  inline Trades / Analytics / Status stats, baseline-count reference line, and the warning strip that
  surfaces `FILL_MODE_COERCED` and `BOTH_UNAVAILABLE_NO_COMBINED` (the Arm C0/C1 double-count message).
- Availability gating: every option pill is greyed (`btnDim`) when there's no data for it; unavailable
  scenarios flip the card border to `--warning` and the status to "Unavailable".
- ~190 lines of option/group memo logic (L263-490) + ~390 lines of inline JSX, **all embedded in
  `RunDetail.jsx`** and not reusable elsewhere.

### 1.4 The core defects
1. **Dual source of truth.** `RunDetail.jsx` seeds a *local* `resultView` from the store `SCENARIO`
   **only on run-switch** (effect L286-292) and **never writes back** (`setScenario` is imported but
   not called for result-view changes — only `setActiveRunId` L612 and `setSelectedTradeVariant` L3992
   fire). So switching the lens in Run Detail does **not** propagate to Strategy Map / Hypothesis Lab,
   and a scenario picked on Strategy Map only reaches Run Detail on the next run-switch. → **stale/
   divergent lens across pages.**
2. **Inconsistent baseline default.** `derivePrimaryResultView()` is config-intent-aware and *correctly
   avoids* defaulting to baseline when the run was actually a triggered_edge/penetration run — but it is
   only used by Run Detail's local seed. `store.js` `DEFAULT_SCENARIO` and `HypothesisLab` (`selectedEntry`
   default `"baseline"`, L113) still hard-default to baseline. → requirement #5 is solved in one place and
   violated in others.
3. **Duplicated Arm-label logic.** `describeUniverseLabel()` (tradeUniverse) already maps fillMode→
   "Arm C0/C1/C2/C3", yet `StrategyMap.jsx` (L1187-1189) and `strategyMap/ScenarioSelector.jsx` (L86-90)
   each re-implement the same mapping. → drift risk on labels.
4. **Non-reusable header.** The premium header exists only inside `RunDetail.jsx`; other Research Lab
   pages either roll their own selector (Strategy Map's `ScenarioSelector`) or have none (Hypothesis Lab
   silently defaults to baseline).

---

## §2 — Pages affected

| Page | Renders single-run analytics keyed to a lens? | Header verdict |
|---|---|---|
| **Run Detail** (`pages/RunDetail.jsx`) | Yes — the cockpit | **Source of the pattern.** Extract its header into the shared component; behaviour unchanged. |
| **Strategy Map** (`pages/StrategyMap.jsx` + `strategyMap/ScenarioSelector.jsx`) | Yes — already scenario-driven via `useResolvedScenario` | **Adopt** the shared header; retire the bespoke `ScenarioSelector` Arm-label duplication. |
| **Hypothesis Lab** (`pages/HypothesisLab.jsx`) | Yes — `useTradeUniverse()` but defaults to baseline | **Adopt** — biggest correctness win (fixes the baseline-default bug). |
| **Protection Lab** (`pages/ProtectionLab.jsx`) | Yes — single-run, `tradesByMode`/`entryResults` | **Adopt (compact mode)** after the Protection stream lands; protection is its own sub-lens. Coordinate. |
| **Failures Lab** (`pages/FailuresLab.jsx` → `failures/**`) | Yes — operates on the active run | **Adopt (compact mode)** — confirm run+lens context; currently uses its own workspace header. |
| **Session Lab V1** (`pages/SessionLabV1/*`) | Yes — consumes `resultView` | **Adopt (compact mode).** |
| Order Block Lab (`pages/OrderBlockLab.jsx`) | No — it's the run navigator/shell | **No header** (it's the index that launches runs). |
| Comparison Lab (`pages/ComparisonLab.jsx`) | Cross-run / multi-run by design | **No** — it deliberately compares many runs; a single-run lens would be wrong. |
| Runs / Projects / ProjectDetail / Overview / Insights / MonteCarlo / WalkForward / Sweep / NewsLab / TradeInspector | No / not lens-scoped | **No header** — avoid noise (per UX requirement). |

**Answer to Q1 (which pages need it):** **Run Detail (full), Strategy Map, Hypothesis Lab** as the
primary three; **Protection Lab, Failures Lab, Session Lab V1** as compact-mode adopters in a later phase.
Everything else stays clean.

---

## §3 — Recommended architecture (the safest shared abstraction)

### 3.1 Single source of truth = the store `scenario`
Promote the store's existing `scenario` to be **the** owner of the active lens for the active run, and
make every page (including Run Detail) a *consumer* of it rather than holding a local fork. This is the
smallest correct change because the store already persists and normalises `scenario`, and `tradeUniverse.js`
already resolves from it. Concretely:
- Add a thin hook **`useRunVariant(runId)`** (new file `data/useRunVariant.js`) wrapping the existing
  store: returns `{ scenario, setScenario, options, activeOption, universe, warnings, label }` by composing
  `useDataset()` + `buildAvailableOptions` + `derivePrimaryResultView` + `useTradeUniverse`. No new global
  state — it's a selector/derivation hook over what already exists.
- Run Detail's local `resultView` is **replaced** by `useRunVariant(runId).scenario`, so its switches now
  call `setScenario` and propagate everywhere. (Keep the run-switch reset semantics by routing the default
  through `derivePrimaryResultView` inside the hook.)

### 3.2 Presentation = one reusable component (Q4: yes)
Extract the RW-13 card into **`<ResearchRunHeader/>`** (recommended name; see §7) in
`components/lab/ResearchRunHeader.jsx`, **presentational + controlled** (props in, callbacks out — no store
imports inside it, so it stays testable and reusable). Run Detail keeps the *option-building memos* (or they
move into `useRunVariant`) and passes them down. A `variant="full" | "compact"` prop covers the
cockpit vs. the secondary-page density.

### 3.3 Why not a React context?
A context provider is tempting but unnecessary: the store + `useDataset` already is the global layer, and
each page mounts independently. A context would add a second indirection over the store. **Recommendation:
hook + controlled component over the existing store.** (Q3 answer.)

---

## §4 — Recommended UX

A compact, premium, two-zone band that reads as *"same backtest, switch the lens"* — never as *"load a
different run"*. Target height ≈ 56–72px (full) / ≈ 40px (compact). Reuses existing tokens
(`clip-bevel-sm`, `--accent-primary`, `--warning`, `font-ui`/`font-num`) so the dark theme is untouched.

```
┌ RESEARCH RUN ────────────────────────────────────────────────────────────────────┐
│ ◀ EURUSD Initial Test        Run #a1d14ae · 5m · 2024-01→2025-06 · 208 trades      │  ← run identity (muted, fixed)
│ ──────────────────────────────────────────────────────────────────────────────── │
│ RESULT VIEW  [ Baseline ] [ Penetration ] [ Triggered Edge ▸ 50% ▸ Next ]  ⌄ more │  ← active view (accent = non-baseline)
│ Now viewing:  Triggered Edge 50% · Next Candle   ·  Scenario trades · 142   ✓ live │  ← explicit "current view" line
│ ⚠ Arm C0 and Arm C1 were exported separately — merging would double-count each OB. │  ← contextual warning (only when present)
└────────────────────────────────────────────────────────────────────────────────────┘
```

Principles, mapped to the stated UX requirements:
- **Run identity always visible** (top line, muted) so the lens switch never feels like a navigation
  change. (req 1 & the "active lens not a new run" feel.)
- **Lens row uses progressive disclosure**: model → threshold → fill-mode as inline breadcrumb chips, with
  a `⌄ more` popover for the long fill-mode/directional list — keeps it *not visually huge* and avoids
  noisy three-row stacks on secondary pages. (req: not huge / no noisy controls.)
- **"Now viewing" line is explicit** and accent-coloured when non-baseline, so the user is never fooled
  into thinking they're on baseline when they're on a penetration/triggered-edge variant. (req 5.)
- **Unavailable lens** → border + label flip to `--warning`, status "Unavailable", as today. (preserve.)
- **Contextual explainability:** the double-count warning and a `TermTip` on "Lens" / "Arm C0/C1"
  ("Same-candle fill vs next-candle fill — exported as separate CSVs; we never merge them") — reuse the
  existing `TermTip`/glossary primitive; **no new tooltip style** (per `AGENTS.md` rule 7). (req: tooltips.)
- **Compact mode** for secondary pages: collapses to one row — `EURUSD · Triggered Edge 50% · Next` with a
  single `⌄` to open the same popover — so Protection/Failures/Session get the context without the cockpit.

Typography must follow root `AGENTS.md`: lens chips are interactive → `font-ui`, sentence case,
`text-[10.5px]`–`text-[11px]`, `tracking-[0–0.04em]`; the "RESEARCH RUN" / "LENS" eyebrows may be
uppercase at `text-[9.5px]`, `tracking-[0.08em]` max; numeric counts use `font-num tabular-nums`.
**No `font-mono`, no `tracking-widest`** in the new JSX.

---

## §5 — Data contract the header expects (Q5)

A single controlled props object — everything the component needs, nothing about the store:

```ts
ResearchRunHeaderProps = {
  run: {                      // run identity (top line)
    id: string,
    displayName: string,
    symbol?: string, timeframe?: string, dateRange?: string,
    tradeCount?: number,
  },
  lens: {                     // = store scenario, the active Result View
    family: "baseline" | "triggered_edge" | "penetration" | "directional",
    threshold: number | null,
    fillMode: "same" | "next" | "d2" | "d3" | null,   // null = "Both"
    directionalStorageKey?: string | null,
  },
  options: ResultViewOption[],          // from buildAvailableOptions / resultViewOptions
  activeOption: ResultViewOption | null,// from activeResultViewOption
  universe: {                           // from useTradeUniverse(runId, lens)
    label: string,                      // describeUniverseLabel — single source for "Arm C0/C1" text
    universeType: "baseline" | "scenario",
    stats: { total, wins, losses, netR, ... },
    warnings: { code, message }[],      // FILL_MODE_COERCED, BOTH_UNAVAILABLE_NO_COMBINED, NO_TRADES_FOR_SCENARIO
    hasTrades: boolean,
  },
  positionVariant?: { value: string|null, options: string[] }, // axis-1 context (scope chip), optional
  onLensChange: (next: lens) => void,   // → setScenario
  onPositionVariantChange?: (v) => void,// → setSelectedTradeVariant
  variant?: "full" | "compact",
}
```

Note: `label` and all Arm-Cn strings come **only** from `universe.label` / `activeOption.label` so the
duplicated mappings in StrategyMap/ScenarioSelector can be deleted (defect §1.4-3).

---

## §6 — What must refresh when the lens changes (Q6)

Everything downstream of `universe.trades` already recomputes from `useTradeUniverse(runId, lens)` — so if
the lens becomes the single store value, the refresh is automatic via React memo deps. The surfaces that
must (and already do) track it on Run Detail, and must on the adopting pages:
- KPI summary cards (trade count, Net R, WR, expectancy, PF, max DD).
- Equity curve + drawdown overlay.
- Trade ledger / positions table + all ledger filters (session/direction/model/context).
- Every breakdown (session, OB DNA, fill-state, entry-model, day-of-week, penetration, failures).
- FFT overview (`useFftAnalysis(runId, lens)`), Model Family Comparison, confidence/research signals.
- The header's own "Now viewing", Trades count, Status, and warning strip.

**Risk to design around:** the *position variant* and *account/cost basis* are orthogonal — they must
**not** reset when the lens changes (and vice-versa). Keep them as separate store fields (they already are).

---

## §7 — Terminology recommendations (Q7)

> **DECISION (2026-06-10, Jack): user-facing term is "Result View".** Code keeps `scenario`
> (store) / `resultView` (component) identifiers. Axis-1 still renamed to "Position Variant".

| Concept | Today (inconsistent) | **User-facing standard** | Code identifier |
|---|---|---|---|
| Which entry-model interpretation of the run | "Result View" / "Scenario" / "Entry Model" / "variant" | **"Result View"** (established term — locked) | `scenario` (store) / `resultView` (props) |
| `baseline` family | "Baseline" / "Baseline Reference" | **"Baseline"** | `family:"baseline"` |
| `triggered_edge` / `penetration` | mixed | **"Triggered Edge"**, **"Penetration"** | unchanged |
| fillMode same/next/d2/d3 | "Arm C0/C1/C2/C3" + "Same/Next/Delay" | **"Same Candle (Arm C0)" / "Next Candle (Arm C1)" / "Delay +2 (Arm C2)"** — pair the human label with the arm code once, in `describeUniverseLabel` | `fillMode` |
| `tradesByVariant` slice | "Variant" | **"Position Variant"** (or "Run File") — rename the scope chip so it never collides with the lens | `selectedTradeVariant` |
| "Scenario trades" vs "Baseline fallback" | analytics chip | keep **"Scenario trades"** / **"Baseline trades"** / **"Baseline fallback"** | unchanged |

**Decided:** user-facing **"Result View"** (keeps continuity with the existing code/docs and the
current header). Code keeps `scenario`/`resultView`. **Rename axis-1 "Variant" → "Position Variant"**
to kill the collision. (The "active lens for the same backtest" feel is delivered by the UX in §4,
not by renaming the control.)

---

## §8 — What existing Run Detail logic can be reused (Q8)

Reuse, don't rewrite:
- `derivePrimaryResultView(bundle)` — the correct non-baseline default. Route **all** defaults through it.
- `resultViewOptions` / `resultViewGroups` / `activeResultViewOption` memos (L299-489) — move into
  `useRunVariant` (or pass as props); logic unchanged.
- `buildAvailableOptions` / `resolveHierarchy` / `selectTrades` / `buildCanonicalKey` / `describeUniverseLabel`
  — already shared pure fns in `tradeUniverse.js`. The header consumes their output only.
- The RW-13 JSX (L1663-1931) — lift verbatim into `<ResearchRunHeader variant="full">`, replacing
  `resultView`/`setResultView` with `lens`/`onLensChange`.
- The warning-filter block (L1905-1927) and availability greying (`btnDim`) — keep as-is.
- `useTradeUniverse` / `useFftAnalysis` — unchanged hooks.

---

## §9 — Risks / blockers

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Double-counting** (the Arm C0/C1 concern). | Already guarded in `tradeUniverse.js` (`BOTH_UNAVAILABLE_NO_COMBINED`, `selectTrades` prefers `_next`/`_same` over unioning). Header must **surface** the warning, never silence it, and must not add a "merge" affordance. Keep the guard as the single authority. |
| R2 | **Stale data across pages** from the current local-fork pattern. | Collapse to the single store `scenario`; remove Run Detail's local `resultView`. This is the central fix. |
| R3 | **Baseline mis-default** (req 5). | Route every default through `derivePrimaryResultView`; fix `DEFAULT_SCENARIO` + Hypothesis Lab's `"baseline"` literal. |
| R4 | **`RunDetail.jsx` is 5,068 lines, shared & sometimes dirty.** | Extract surgically; stage only the header hunks; never `git add .`. Do it while RunDetail is clean at HEAD (it is now). |
| R5 | **Multi-owner shared files** (`store.js`, `tradeUniverse.js`, `importer.js`, `ProtectionLab.jsx`). | Phase the rollout (§10); register a `WORKSTREAMS.md` entry; coordinate with Protection/Entry streams; rebase on `importer.js` before relying on its contract. |
| R6 | **Performance** of re-resolving the universe on each switch. | `useTradeUniverse` is already memoised on `(runId, scenario)`; switching only re-runs the resolver, not the importer. Watch the trade ledger on huge runs — keep heavy tables behind `React.useMemo` on `universe.trades` (already the case). Persisting `scenario` to localStorage on every click is cheap. No new perf risk introduced; one *improvement* — dedupe StrategyMap's parallel memo forest via the shared hook. |
| R7 | **Position-variant vs lens reset coupling.** | Keep them independent store fields; never reset one when the other changes (§6). |
| R8 | **Directional family bypasses the universe** (warnings hidden, different data path). | Preserve the existing `isDirectionalView` branch (header already special-cases it); don't force it through the entry-model warning path. |

**Blockers:** none hard. Soft: finish/commit the Failures cleanup first so the tree is calmer; get the §7
terminology decision; coordinate Protection/Entry before Phase 3.

---

## §10 — Minimal implementation plan (recommended order — DO NOT implement yet)

**Phase 0 — Decisions & registration (no code).** Confirm §7 terminology ("Lens" vs "Result View";
"Position Variant" rename). Add a `WORKSTREAMS.md` entry "Research Run Header / Active Lens" owned by Claude.

**Phase 1 — Single source of truth (store, behaviour-preserving).**
Add `data/useRunVariant.js` (composes existing store + `tradeUniverse` + `useTradeUniverse`; defaults via
`derivePrimaryResultView`). No UI change yet. Validate with a `.mjs` assertion suite for the hook's pure parts.

**Phase 2 — Extract the component (Run Detail only, visual no-op).**
Create `components/lab/ResearchRunHeader.jsx` (controlled, `variant="full"`). Replace RunDetail's local
`resultView`/RW-13 JSX with `useRunVariant` + `<ResearchRunHeader/>`. Wire `onLensChange → setScenario`
(this is the one *behaviour* change — switches now persist/propagate). Pixel-diff against current header.

**Phase 3 — Adopt on Strategy Map + Hypothesis Lab.**
Strategy Map: render `<ResearchRunHeader/>`, delete `ScenarioSelector`'s duplicated Arm-label code, keep
`useResolvedScenario`. Hypothesis Lab: replace the `"baseline"` default with `derivePrimaryResultView`;
add the header (full or compact). This delivers cross-page lens consistency.

**Phase 4 — Compact mode on Protection / Failures / Session Lab V1.**
Add `variant="compact"` instances after coordinating with the Protection/Entry streams. Lowest priority;
ship only if those pages currently confuse run vs lens.

**Phase 5 — Cleanup.** Remove dead `buildEnabledVariantBreakdown` import if still lingering; update the
2E plan doc status; `/sync` the docs.

Each phase is independently shippable and reversible. Phases 1–2 are the high-value core.

---

## §11 — Files likely to be changed (by phase)

| Phase | File | Change |
|---|---|---|
| 1 | `frontend/src/data/useRunVariant.js` *(new)* | Lens hook over store + tradeUniverse. |
| 1 | `frontend/src/data/__validation__/useRunVariant.validate.mjs` *(new)* | Pure-logic assertions. |
| 1 | `frontend/src/data/store.js` | Route `DEFAULT_SCENARIO` default through `derivePrimaryResultView` (small). |
| 2 | `frontend/src/components/lab/ResearchRunHeader.jsx` *(new)* | Extracted premium header (full+compact). |
| 2 | `frontend/src/pages/RunDetail.jsx` | Replace local `resultView` + RW-13 JSX with hook + component. |
| 3 | `frontend/src/pages/StrategyMap.jsx` + `pages/strategyMap/ScenarioSelector.jsx` | Adopt header; delete duplicated Arm-label mapping. |
| 3 | `frontend/src/pages/HypothesisLab.jsx` | Fix baseline default; add header. |
| 4 | `frontend/src/pages/ProtectionLab.jsx`, `pages/FailuresLab.jsx` (+`failures/**`), `pages/SessionLabV1/*` | Compact-mode header (coordinate). |
| 5 | `MODEL-FAMILY-COMPARISON-2E-…md`, `docs/ai/*` | Status/`/sync` updates. |

`tradeUniverse.js` is **read-only** for this work (consume, don't change) unless §7 adds a paired
human+arm label string to `describeUniverseLabel` (a tiny, well-isolated edit).

---

## §12 — Validation checklist (for the eventual implementation)

- [ ] `grep -R "font-mono" frontend/src --include="*.jsx" --include="*.tsx" -n` → 0 lines.
- [ ] `grep -R "tracking-widest" frontend/src --include="*.jsx" --include="*.tsx" -n` → 0 lines.
- [ ] New lens chips: `font-ui`, sentence case, `text-[10.5–11px]`, `tracking-[0–0.04em]`; eyebrows ≤ `0.08em`.
- [ ] Babel transpile smoke-check of every edited file (`@babel/core` env+react presets) — no full `craco build` (times out in-sandbox).
- [ ] `node …/useRunVariant.validate.mjs` green; existing `tradeUniverse`/`modelFamily` validators still green.
- [ ] **Phase-2 pixel parity:** RunDetail header visually identical pre/post extraction (host screenshot).
- [ ] **Propagation:** switch lens on Run Detail → Strategy Map + Hypothesis Lab reflect the same lens (and survive reload via `LS_SCENARIO`).
- [ ] **Baseline-default fix:** open a triggered_edge/penetration run cold → header shows the triggered/penetration lens, **not** Baseline, on every page.
- [ ] **Double-count guard:** a run with separate Arm C0/C1 CSVs and no combined pool → warning shows; no "merge" path exists; counts never sum the two.
- [ ] **Independence:** changing lens does not reset position variant / account basis, and vice-versa.
- [ ] **Unavailable lens:** greyed pills + `--warning` border + "Unavailable" status preserved.
- [ ] **Directional:** directional scenarios still resolve via their own path; no spurious entry-model warnings.
- [ ] **Perf:** lens switch on the largest available run stays responsive; ledger re-memoises, importer does not re-run.
- [ ] Dark theme unchanged; no horizontal overflow at standard panel width; tooltips work on hover + focus.
- [ ] Diff review: only the files in §11 changed; scoped commits, no `git add .`.

---

## Answers to the 10 questions (index)
1. **Pages needing the header** → §2 (primary: Run Detail, Strategy Map, Hypothesis Lab; later: Protection, Failures, Session Lab V1).
2. **Files owning run/variant state** → `store.js` (`activeRunId`, `selectedTradeVariant`, `scenario`); `RunDetail.jsx` (local `resultView` fork — to be removed); `useResolvedScenario.js` (Strategy Map). §1.2.
3. **Safest shared abstraction** → hook (`useRunVariant`) over the **existing store `scenario`** + controlled component; no new context. §3.
4. **Reusable component?** → **Yes** — `<ResearchRunHeader/>` (recommended name), controlled, `full`/`compact`. §3.2, §7.
5. **Data contract** → §5.
6. **What refreshes on lens change** → KPIs, equity, ledger+filters, all breakdowns, FFT, model-family, header status/warnings; position-variant & account basis stay put. §6.
7. **User-facing terminology** → **"Result View"** (locked); rename axis-1 to "Position Variant"; pair human label + Arm Cn. §7.
8. **Reusable Run Detail logic** → `derivePrimaryResultView`, the option/group memos, `tradeUniverse` pure fns, the RW-13 JSX, warning + availability blocks. §8.
9. **Double-count / stale-data risks** → §1.4 + §9 (R1, R2, R3).
10. **Implementation order** → §10 (Phase 0 decisions → 1 store SoT → 2 extract on Run Detail → 3 Strategy/Hypothesis → 4 compact adopters → 5 cleanup).

*End — RUN-VARIANT-HEADER-AUDIT-1. Audit only; no source files were edited.*
