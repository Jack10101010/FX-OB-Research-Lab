# MODEL-FAMILY-COMPARISON-1

**Type:** architecture audit + design (AUDIT ONLY — no implementation, no source changes)
**Owner:** Claude (product architect / research lead)
**Branch verified:** `codex-dev` · HEAD `5864e41` (ahead of `origin/codex-dev` by 6)
**Scope:** design a future *Model Family Comparison* system that compares model
families across runs, scenarios, variants, and (eventually) agent-generated batches.

> This document only reads the codebase and proposes architecture. It changes no
> frontend, backtester, or AI-OS docs. It is the design behind ROADMAP Phase 4 line
> "Model Family Comparison (full: cross-run, per-variant equity/Sharpe, variant→signal)
> — deferred".

---

## Current Comparison Infrastructure

The app already has **three distinct comparison surfaces plus two paired-run engines**.
The key insight for this design: comparison is *not* a greenfield — it is a
**convergence** problem. We have the pieces; they are scattered across different
axes and bundle sub-structures.

**1. ComparisonLab** (`pages/ComparisonLab.jsx`, route `/comparison`) — the cross-run surface.
- Compares **2–5 imported runs** side by side; Run A is the baseline.
- **Global scenario selector** applies one scenario to every slot: baseline,
  penetration, triggered-edge (entry-model path via `getTradeUniverse`), and
  **directional** (separate path reading `bundle.directionalResults`).
- **KPI Matrix:** Net R, Win Rate, Trades, Profit Factor, Max Drawdown, Reverse
  Cancels, Validation — with per-row Δ vs Run A and pos/neg coloring.
- **Explainable winner** (COCKPIT-2A, `computeExplainableWinner`): scores runs across
  Net R / Win Rate / PF / Max DD / Validation; overall winner = most metric wins,
  tie-broken by Net R; small-sample warning when winner < 50% of max trade count.
- **Pareto frontier** (Net R vs |Max DD|) with an efficient-set leaderboard.
- **Equity overlay** + **monthly bars** from each slot's `analysisCurve` / `analysisTrades`.
- **Scenario-coverage discipline:** slots whose resolved universe falls back to
  baseline are **excluded** from verdict/deltas so a comparison never mixes scenario
  numbers against baseline-fallback numbers. This is the single most important
  precedent for the new system's apples-to-oranges guard.
- **Save verdict as project finding** (COCKPIT-2B) via `addProjectFinding`.
- Constraints: **Raw R only** (Current-Equity cross-run is explicitly deferred);
  comparison is **per scenario**, not "all families at once".

**2. TableCompareShell** (`components/lab/TableCompareShell.jsx`) — the inline per-table surface.
- Wraps a `CanonicalBucketTable` and adds a corner control: `None · Previous Run · Select Run…`.
- Expands into **Side-B table + Δ summary** (stacked) or **inline Δ columns**.
- Caller-supplied `resolveCompared(runId)` and `buildRows(trades)` keep page concerns
  out of the shell; Side B is resolved **under the same scenario + filters** as Side A.
- **Explicit universe guards** — never compares silently: shows A/B universe labels,
  warns on `scenarioMismatch` (different `sourceKey`), `dataUnavailable` (run not
  hydrated), and Current-Equity suppression.
- Per-row **Save as Finding** (WF-7); per-table **localStorage persistence** (TC-4).
- Metrics from `lib/tableCompare.js`: count, winRate, netR, expectancy, profitFactor.
- Currently wired in OrderBlockLab (Structure Quality pilot) and EntriesLab.

**3. Enabled Variant Comparison** (in `RunDetail.jsx` Classification tab; data layer
`data/enabledVariantBreakdown.js`) — the in-run variant surface.
- `buildEnabledVariantBreakdown(runData)` reads `entryResults.tradesByMode`
  (+ `equityCurveByMode` for the Max DD column), **within one run bundle**.
- `canonicalEntryKey` strips the dual-key position prefix and maps `entry_baseline →
  baseline`, deduping rows and fixing the old "Unknown Model" label.
- Columns: label · Trades · WR · Net R · Avg R · **Max DD**. Read-only; independent of
  the selected scenario.
- **Limitation:** entry-models only (no FFT/protection/directional/cost variants), one
  run only, no equity overlay, no PF/expectancy/confidence, no winner/promotion.

**Paired-run / control engines (not general comparison, but adjacent):**

**4. FFT auto-pair / control runs** — `data/fftPairingResolver.js`
(`extractOffTrades`, `resolveAutoControlTrades`, `getAutoControlInfo`,
`getPairableRunOptions`) + `data/fftPairingAnalytics.js` (`computePairedFftAnalytics`).
Backend-generated FFT-OFF control trades ship inside the bundle as
`controlTradesByScenario` keyed `${executionMode}:${scenarioKey}`; a manually-selected
FFT-OFF run is the fallback. This is a **purpose-built ON-vs-OFF family comparison**
already in production — the model family system should treat FFT ON/OFF as one family
axis and reuse this resolver rather than re-deriving control pairing.

**5. Shared compare guard** — `data/useCompareGuard.js` (`evaluateCompare`). Encodes
basis/account compatibility from `TABLE_COMPARE_BASIS_AUDIT.md`: `MISMATCHED_BASIS`
(cannot compare), `CONFIG_DIFFERS` / `BALANCE_DIFFERS` (CE currency suppression),
`SEQUENCE_DEPENDENT`, `PF_UNDEFINED`. Already shared by Table Compare and ComparisonLab.

**6. Findings library** — `pages/Insights.jsx` (route `/insights`, INS-2/INS-3). A
read-only global aggregation of every project's findings, with source filters
(`manual · run_workspace · table_compare · edge_explorer · comparison`) and grouping
(flat / by project / by source). This **is** the research library the new system
should write into, not a new store.

**Adjacent, different axis (not run-bundle comparison):** `SweepLab` (`/sweep`) varies
strategy parameters across re-runs from its own `SWEEP_*` outputs; `WalkForwardLab`
(`/walk-forward`) does OOS fold validation. Both are parameter/time axes, useful
later but **not** the model-family axis.

---

## Existing Data Structures

Everything the comparison system needs already lands in the run bundle
(`data/importer.js`, assembled ~L1317–1364). The families are present — they are just
stored in **four different sub-structures**:

| Family axis | Where it lives in the bundle | Keyed by |
|---|---|---|
| Baseline / primary | `trades`, `equityCurve`, `tradesByVariant[primaryVariant]` | `primaryVariant` |
| Entry models (TE C0–C3, penetration, baseline) | `entryResults.tradesByMode` + `entryResults.equityCurveByMode` | entry-model key (`entry_triggered_edge_25p0_d3`, …) |
| Directional | `directionalResults.tradesByScenario` + `equityCurveByScenario` + `scenarioMeta` | directional storageKey |
| Protection | `protectionResults.tradesByMode` + `equityCurveByMode` | protection mode key |
| FFT ON/OFF control | `controlTradesByScenario`, `controlPairs` | `${executionMode}:${scenarioKey}` |

**Run summary** (`runSummary`, importer L1252): `netR`, `winRate`, `trades`, `wins`,
`losses`, `validation`, `rr`, `stopBuffer`, `entryBuffer`, `verifyTicks`,
`reverseCancels`, `symbol`, `detectionTf`, `executionTf`, `dateRange`,
`executionMode`, plus news/ghost aggregates. This is the per-run "comparability
fingerprint" (symbol/TF/date/RR/buffers) needed for the apples-to-oranges guard.

**Scenario key discovery:** `collectAllEntryKeys(bundle, trades)` +
`buildAvailableOptions(keys)` (`data/tradeUniverse.js`) already build the **union of
available families/thresholds/fill-modes** across runs — ComparisonLab uses this for
its selector. `directionalResults.scenarioMeta` enumerates directional scenarios.

**Canonical metric calculators** (single source of truth, `data/resultsBasis.js`):
`toCanonicalSummaryRow(tradesOrRun, { basis })` → `{ netR, winRate, profitFactor,
expectancy, … }`; `maxDrawdownFromCurve(curve)`; `normalizeBasis`, `accountConfigHash`,
`BASIS`. The Enabled Variant layer already inlines `maxDrawdownFromCurve` for parity.

**Confidence:** `data/researchSignals.js` `computeConfidence(stats, config)` →
Very Low / Low / Medium / High (Wilson interval on WR, low-sample suppression). Pure,
validated. `buildResearchSignals(fillStateBreakdown, sessionBreakdown, entryModelRows)`
runs **within one run/tab** today.

**Findings + promotion structure** (`data/store.js`, `data/projectWorkflow.js`):
- `project.findings[]` entries: `{ id, type, title, note, source, runId, sourceRunId,
  tag, comparedRunId, table, bucket, meta }` via `addProjectFinding`.
- `buildResearchFindingPayload({ source, title, note, comparedRunId, table, metaExtra })`
  — the shared, store-safe payload builder (programmatically writable → agent-friendly).
- Project already models a promotion pipeline: `baselineRunId` → `candidateRunId` →
  `finalRunId`, with `checklist` and `getNextStep()` (baseline → entry sweep →
  candidate → validate → export). `resolveRunReference()` resolves the comparison
  reference (project baseline → previous-in-project → previous imported run).
  `buildRunDelta()` produces per-metric deltas.

---

## Gaps

What is missing for *true* Model Family Comparison:

1. **No "model family" as a first-class concept.** Families are scattered across
   `entryResults` / `directionalResults` / `protectionResults` / `controlTradesByScenario`.
   There is no taxonomy and no single adapter that flattens a bundle (or set of bundles)
   into `[{ familyKey, variantKey, label, runId, trades, equityCurve }]`.

2. **No unified variant metric builder across families.** `enabledVariantBreakdown.js`
   covers entry-models only, one run, and lacks PF / expectancy / confidence / equity.
   ComparisonLab covers runs (one scenario at a time), not all families at once.

3. **No cross-run × cross-family matrix.** You cannot put "Run-1 TE C3" next to
   "Run-2 FFT-OFF baseline" next to "Run-3 directional long" in one ranked table with a
   shared equity overlay.

4. **No risk-adjusted / Sharpe metric.** Needs a per-period (e.g. daily/weekly) return
   series; only cumulative `equityCurve` (`{ i, date, label, netR }`) exists today.

5. **No funded-account pass/fail in comparison.** Account-equity simulation exists under
   `components/lab/account/*` but is not run per-variant nor surfaced as a verdict.

6. **No promotion-recommendation engine.** Promotion is a manual checklist + the
   ComparisonLab winner heuristic; there is no "promote candidate over baseline because…"
   rule that combines effect size, confidence, drawdown, and sample.

7. **Research Signals are within-run only.** No "which family maximizes this edge"
   cross-family signal view.

8. **No research-batch entity.** Nothing groups N agent-generated runs/variants into a
   labelled batch for one-shot comparison. Sweep is parameter-axis and mock-driven.

9. **Comparability guard is partial.** `useCompareGuard` covers basis/account;
   TableCompareShell covers universe `sourceKey`. **Nothing guards symbol / timeframe /
   date-range / RR / stop-buffer mismatch** across families — the most dangerous
   apples-to-oranges axis when comparing across runs.

---

## Recommended Product Location

**Decision: a pure data layer now, a staged UI that ends in a dedicated Model Lab.**

Evaluating the options against the existing surfaces:

- **Comparison Lab** — already cross-run, already has equity/winner/Pareto/findings. Best
  host for the **cross-run** half, but adding a full family matrix risks overloading an
  already-dense page.
- **Entries Lab** — natural for entry-model mechanics, wrong scope for protection/FFT/directional.
- **RunDetail sub-tab** — best host for the **single-run, all-family** V1 (the Enabled
  Variant Comparison already lives here and is the obvious thing to upgrade).
- **Research Cockpit / Findings Library** — `Insights` already exists as the library;
  it should remain the *findings* home, not the comparison workbench.
- **New Model Lab** — the right **eventual** home for the full cross-run × cross-family
  matrix, but premature as a V1 (would become a 4th bespoke comparison surface).

**Recommendation:** build a single pure adapter `data/modelFamily.js` that *all*
surfaces consume, then phase the UI:
- **V1** upgrades the in-run Enabled Variant Comparison (RunDetail) into a full
  all-family table — unblocked, frontend-only, immediately useful.
- **V2** promotes to a dedicated **Model Lab** page (`/model-lab`) for the cross-run ×
  cross-family matrix, reusing ComparisonLab's chart components.
- Findings always flow into **Insights** (add a `model_family` source).

This keeps **one** comparison engine and avoids a fourth divergent surface.

---

## Recommended V1

**Keep it practical and unblocked: "All-Family Comparison" for the current run bundle.**

- Compares **every family/variant present in one run bundle** — baseline, TE C0–C3,
  penetration variants, FFT ON vs auto-control OFF, protection modes, directional
  scenarios — in one ranked table.
- Powered by a new pure `data/modelFamily.js` (`collectModelVariants(bundle)` +
  `buildModelFamilyRows(variants, { basis: "raw_r" })`), reusing `resultsBasis`
  calculators, `maxDrawdownFromCurve`, and `computeConfidence`.
- Reuses the **explainable winner** logic (extract `computeExplainableWinner` from
  ComparisonLab into a shared helper) and an **equity overlay** (reuse the
  ComparisonLab AreaChart) keyed by variant instead of run.
- **Save as finding** via the existing payload builder (`source: "model_family"`).

Why this V1 (not "compare selected runs" or "compare batches" first):
- It is **frontend-only and unblocked** — all data already lands in the bundle.
- It directly supersedes a shipped, narrower feature users already use.
- It validates the taxonomy + pure adapter that V2 (cross-run) and V3 (batches) build on.

The "compare selected runs" need is **already served** by ComparisonLab; the gap there
is *families*, addressed in V2. "Compare saved research batches" and "baseline vs
promoted candidate" depend on the batch entity / promotion engine and are deferred.

---

## Metrics

| Metric | V1 source | Status |
|---|---|---|
| Trades | variant trade count | ✅ now |
| Win Rate | `toCanonicalSummaryRow(trades).winRate` (wins/(wins+losses)) | ✅ now |
| Net R | Σ R over variant trades (authoritative headline convention) | ✅ now |
| Avg R | Σ R / count (breakevens included) | ✅ now |
| Max DD | `maxDrawdownFromCurve(equityCurveByMode[variant])` | ✅ now |
| Profit Factor | `toCanonicalSummaryRow(trades).profitFactor` (null = no losses) | ✅ now |
| Expectancy | `toCanonicalSummaryRow(trades).expectancy` | ✅ now |
| Confidence | `computeConfidence(stats)` → Very Low…High | ✅ now |
| Equity curve | `equityCurveByMode[variant]` overlay | ✅ now |
| Drawdown curve | derived from the equity curve (running peak − value) | ✅ small add |
| **Sharpe / risk-adjusted** | needs per-period return series (not just cumulative) | ⛔ deferred |
| **Funded-account pass/fail** | per-variant account sim via `components/lab/account/*` | ⛔ deferred (V2) |
| **Promotion recommendation** | rule over effect/confidence/DD/sample | ⛔ deferred (V2) |

Display discipline (anti-overload): V1 table shows **Trades · WR · Net R · Avg R ·
Max DD · PF · Confidence**; Expectancy and the equity/drawdown overlays are
expander/secondary. Sharpe, funded pass/fail, and promotion are V2 columns.

All metrics route through `resultsBasis` so Model Lab can never diverge from the rest of
the app — the same lesson the Enabled Variant Max-DD work already applied.

---

## Agent Workflow Possibilities

The findings + payload plumbing is **already programmatically writable**, which makes
agent automation a natural extension rather than new infrastructure:

- **Batch run (backend dependency).** Agents cannot run the backtester from the
  frontend; a batch is N backend runs imported as bundles. Define a **`batchId` tag
  convention** (stamped onto each run's summary/finding `meta`) so a batch is just a
  filterable set of runs — no new store.
- **Auto-compare.** Given a `batchId`, an agent calls `collectModelVariants` across the
  batch's bundles → `buildModelFamilyRows` → the shared winner helper, entirely with
  pure functions (no UI, Node-testable).
- **Emit findings.** Agents write results through `buildResearchFindingPayload({ source:
  "model_family", … })` → `addProjectFinding`, and they surface in **Insights**
  immediately (add `model_family` to the source filter list).
- **Promotion proposal.** Once the promotion-recommendation rule exists (V2), an agent
  can propose `candidateRunId` for a project — but **proposing, not setting**, per the
  AGENTS.md "propose, don't act" rule.

Net: agents reuse the same pure layer the UI uses. No agent-specific comparison code.

---

## Risks

1. **Mixing scenarios incorrectly.** The single biggest correctness risk. **Mitigation:**
   reuse ComparisonLab's proven discipline — a variant that falls back to baseline (no
   real scenario data) is excluded from the verdict, never silently substituted. The
   pure adapter must tag each variant with `hasOwnData` so the UI can exclude fallbacks.

2. **Apples-to-oranges across runs.** Comparing variants from runs with different
   symbol / timeframe / date-range / RR / stop-buffer is misleading. **Mitigation:** add
   `evaluateComparability(variants)` to the adapter (generalizing `useCompareGuard` +
   TableCompareShell's universe-mismatch banner) that emits an explicit warning band and
   a "comparability key" — never blocks, always discloses (the app's established pattern).

3. **Stale baseline/control pairing.** `controlPairs` / `resolveRunReference` can point
   at a control or baseline that no longer matches the current config. **Mitigation:**
   surface pairing provenance (which control key, which baseline run) and re-validate the
   pairing fingerprint at compare time; warn when the control's config drifts from the
   active run.

4. **Overloaded UI.** A 12-column cross-run × cross-family matrix is unreadable.
   **Mitigation:** phase it (V1 single-run, ≤7 visible columns; overlays in expanders);
   only build the dedicated Model Lab when the in-run table proves the model.

5. **Duplicate comparison surfaces.** There are already three (ComparisonLab,
   TableCompareShell, Enabled Variant). A bespoke fourth would fragment the math.
   **Mitigation:** **one pure adapter** (`data/modelFamily.js`) feeds every surface;
   extract the shared winner helper out of ComparisonLab so it is not re-implemented.

6. **Metric divergence.** Bespoke metric math drifts from the rest of the app.
   **Mitigation:** all metrics via `resultsBasis` + `maxDrawdownFromCurve` (mandatory),
   exactly as Enabled Variant Max-DD did.

---

## File-by-file Future Implementation Plan

> Sequencing only — **no code in this audit**. Owners per AGENTS.md: Claude (UI/research/
> data-layer), Codex (backend export / tests / refactors).

**V1 — single-run, all-family (frontend-only, unblocked)**
- **NEW** `frontend/src/data/modelFamily.js` (pure):
  - `MODEL_FAMILIES` taxonomy (baseline · entry-model · directional · protection · fft_control).
  - `collectModelVariants(bundle)` → flat `[{ familyKey, variantKey, label, runId,
    trades, equityCurve, hasOwnData }]`, reading the four bundle sub-structures +
    `resolveAutoControlTrades` for the FFT-OFF control.
  - `buildModelFamilyRows(variants, { basis })` → metric rows via `toCanonicalSummaryRow`,
    `maxDrawdownFromCurve`, `computeConfidence`. Must not mutate inputs; Node-ESM-safe
    (inline helpers, no extensionless imports — same constraint as `enabledVariantBreakdown`).
  - `evaluateComparability(variants)` → comparability key + warnings (symbol/tf/date/rr/sb).
- **NEW** `frontend/src/data/__validation__/modelFamily.validate.mjs` (assertions + the
  no-mutation + back-compat checks, run under Node 22; Babel transpile check).
- **REFACTOR (small, shared)** extract `computeExplainableWinner` from
  `pages/ComparisonLab.jsx` into `frontend/src/data/compareWinner.js` so V1 and
  ComparisonLab share one winner implementation (no behavior change to ComparisonLab).
- **NEW** `frontend/src/components/lab/ModelFamilyTable.jsx` (or extend
  `ClassBreakdownTable` with PF / Expectancy / Confidence columns + the `extraCol`
  pattern already in RunDetail).
- **EDIT** `pages/RunDetail.jsx` — upgrade the Enabled Variant Comparison
  section to render the all-family table + equity overlay + Save-as-finding. (Coordinate:
  RunDetail is large and frequently dirty — stage deliberately.)
- **EDIT** `data/researchGlossary.js` — confirm/add keys (PF, expectancy, confidence
  exist; add `sharpe`, `model_family`, `comparability` as needed).

**V2 — cross-run Model Lab + risk-adjusted + verdict**
- **NEW** `pages/ModelLab.jsx` + route in `App.js` + Sidebar entry. Cross-run ×
  cross-family matrix; reuse ComparisonLab's AreaChart / Pareto components.
- **EXTEND** `data/modelFamily.js` — `collectModelVariants(bundles[])` (multi-run),
  Sharpe (needs a per-period return series — see backend note), funded-account pass/fail
  via `components/lab/account/*`.
- **NEW** `data/modelPromotion.js` — promotion-recommendation rule (effect × confidence ×
  DD × sample) feeding `project.candidateRunId` *proposals*.
- **EDIT** `pages/Insights.jsx` — add `model_family` to `FINDING_SOURCE_FILTERS` /
  source groups.

**V3 — agent batches (backend-dependent)**
- **Backend (Codex / backtester):** batch run orchestration + a per-period return series
  in the export (unblocks Sharpe). The arm-offset spec (`DISTANCE-AT-ARM-BACKEND-SPEC.md`)
  is the template for a clean export handoff.
- **Frontend:** `batchId` tag convention on import; batch filter in Model Lab + Insights;
  agent compare = `collectModelVariants` + `buildModelFamilyRows` + `compareWinner` +
  `buildResearchFindingPayload` (all already pure).

---

## Recommended Roadmap Placement

Split the existing **Phase 4** deferred line into three checkable items:

- **Phase 4b-1 — Model Family Comparison V1 (single-run, all families).** Frontend-only,
  **unblocked**, supersedes Enabled Variant Comparison. Can run next (after or parallel
  to the Distance importer mapping) — it shares no files with the distance work.
  Owner: Claude (data layer + UI), with the shared-winner refactor.
- **Phase 4b-2 — Model Lab (cross-run × cross-family) + risk-adjusted + funded pass/fail
  + promotion proposal.** Depends on 4b-1's adapter; new page; partially blocked on a
  per-period return series for Sharpe (backend).
- **Phase 4b-3 — Agent research batches.** Blocked on backend batch orchestration +
  return-series export; frontend reuses the pure layer.

"Save findings / research library" (current Phase 4) is **already partially shipped** as
`Insights`; Model Family findings extend it rather than replacing it.

**One-line /next recommendation:** start **Phase 4b-1** — build `data/modelFamily.js` +
its validation + the shared `compareWinner.js` extraction, then upgrade the RunDetail
Enabled Variant section. It is unblocked, removes a narrower duplicate, and lays the
pure foundation every later phase (and every agent) reuses.

---

## Appendix — files read for this audit

`pages/ComparisonLab.jsx` · `components/lab/TableCompareShell.jsx` ·
`data/useCompareGuard.js` · `data/enabledVariantBreakdown.js` · `data/importer.js`
(bundle assembly) · `data/store.js` (projects / findings / getRunData / getTradeUniverse) ·
`data/projectWorkflow.js` · `data/fftPairingResolver.js` · `data/researchSignals.js`
(signature) · `pages/Insights.jsx` · `pages/EntriesLab.jsx` · `pages/SweepLab.jsx` ·
`pages/WalkForwardLab.jsx` · `App.js` (routes) · `docs/ai/{AGENTS,WORKSTREAMS,ROADMAP,
BACKLOG,IDEA_CAPTURE,PROJECT_STATUS,CURRENT_WORKSTREAM}.md`. Live git verified:
branch `codex-dev`, HEAD `5864e41`.
