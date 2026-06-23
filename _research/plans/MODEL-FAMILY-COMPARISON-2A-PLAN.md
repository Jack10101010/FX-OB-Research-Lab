# MODEL-FAMILY-COMPARISON-2A-PLAN

**Type:** implementation plan / task breakdown (PLAN ONLY — no implementation, no source changes)
**Owner:** Claude (data layer + UI)
**Branch verified:** `codex-dev` · HEAD `f0e9f4f`
**Parent design:** `MODEL-FAMILY-COMPARISON-1.md` → this is **Phase 4b-1** only.

> Staged, pure-adapter-first plan. Scope is **one run bundle, all families, no new
> page, no backend, no cross-run, no Sharpe / funded-account / promotion**. Every
> metric routes through existing canonical calculators so Model Family rows can never
> diverge from the rest of the app.

---

## 1. Phase 4b-1 Scope

**In scope**
- A new **pure** data adapter `frontend/src/data/modelFamily.js` that flattens a single
  run bundle into ranked, comparable **model-variant rows** spanning five families
  (baseline · entry-model · directional · protection · FFT control).
- A node-ESM validation script with fixtures (mirrors `enabledVariantBreakdown.validate.mjs`).
- One **small shared refactor**: extract `computeExplainableWinner` out of
  `ComparisonLab.jsx` into `data/compareWinner.js` (behavior-preserving) so V1 and
  ComparisonLab share one winner implementation. *(Optional for the data milestone;
  required before the UI milestone — see §10.)*
- A later, separately-committed **UI upgrade** of the RunDetail "Enabled Variant
  Comparison" section to render the all-family table (data layer ships first and
  standalone).

**Explicitly out of scope (this phase)** — see §Defer List:
- No new `pages/ModelLab.jsx`, no route, no Sidebar entry.
- No cross-run / multi-bundle collection.
- No Sharpe / risk-adjusted metric, no per-period return series.
- No funded-account pass/fail, no promotion recommendation.
- No backend / importer / exporter changes.
- No change to Research Signals — they stay **selected-scenario, single-run** as today.

**Success definition:** `buildModelFamilyComparison(bundle)` returns correct, deduped,
canonically-ordered rows for every family present in a real imported bundle; all
metrics match the existing Enabled Variant table byte-for-byte where they overlap;
validation assertions + Babel transpile pass; zero changes to shipped behavior until
the UI commit lands.

---

## 2. Model-Family Taxonomy

A `MODEL_FAMILIES` constant defines the five axes, their bundle source, and their key
shape. `familyKey` is stable and machine-usable; `label` is display text.

| `familyKey` | Label | Bundle source | Native key shape | Per-variant equity curve? |
|---|---|---|---|---|
| `baseline` | Baseline | `bundle.trades` / `tradesByVariant[primaryVariant]` | `primaryVariant` | `bundle.equityCurve` ✅ |
| `entry_model` | Entry Model | `entryResults.tradesByMode` | `entry_*` / `<pos>__<mode>` | `entryResults.equityCurveByMode` ✅ |
| `directional` | Directional | `directionalResults.tradesByScenario` | directional storageKey | `directionalResults.equityCurveByScenario` ✅ |
| `protection` | Protection | `protectionResults.tradesByMode` | protection mode key | `protectionResults.equityCurveByMode` ✅ |
| `fft_control` | FFT Control (OFF) | `controlTradesByScenario` | `${executionMode}:${scenarioKey}` | ❌ → rebuild from trades |

Notes:
- **Baseline** is treated as a single-variant family so it always anchors the table
  (and is the natural comparison reference for deltas later).
- **FFT control** has no `equityCurveByMode`; the adapter rebuilds a cumulative-R curve
  from the control trade list (same approach ComparisonLab uses via `rebuildEquityCurve`)
  so Max DD is still available. Tag this curve `synthetic: true` for transparency.
- Taxonomy is **data-driven**: adding a future family = one `MODEL_FAMILIES` entry + a
  collector branch, no UI rewrite.

---

## 3. Row Contract returned by `data/modelFamily.js`

`buildModelFamilyComparison(bundle, opts?)` →
`{ rows: ModelVariantRow[], families: FamilyMeta[], comparability: ComparabilityReport }`.

**`ModelVariantRow`** (one row per canonical variant):

```
{
  // identity
  familyKey:   string,   // "baseline" | "entry_model" | "directional" | "protection" | "fft_control"
  familyLabel: string,   // "Entry Model"
  variantKey:  string,   // canonical key within the family (post-dedup) e.g. "te_d3"
  label:       string,   // display label (canonical via getTagMeta when applicable)
  tooltipKey:  string|null, // glossary key for TermTip (tag for entry-models; null otherwise)
  sourceKeys:  string[], // every raw bundle key that collapsed into this row (provenance)

  // sample
  count:    number,      // performance-trade count (isPerformanceTrade)
  wins:     number,
  losses:   number,

  // metrics (see §7 for exact source of each)
  winRate:  number|null, // wins/(wins+losses)*100 ; null when decided===0
  netR:     number,      // Σ r over performance trades  (headline convention)
  avgR:     number,      // Σ r / count                  (breakevens included)
  maxDdR:   number|null, // maxDrawdownFromCurve(curve) ; ≤0 ; null when no curve
  profitFactor: number|null, // grossProfit/grossLoss ; null = no losses (∞ display)
  confidence: {          // computeConfidence({count,wins,losses,avgR})
    level: "Very Low"|"Low"|"Medium"|"High",
    score: number,
    parts: { sampleScore, stabilityScore, decided, count }
  },

  // flags
  hasOwnData: boolean,   // true when this variant has its own performance trades
  syntheticCurve: boolean // true when maxDd came from a rebuilt curve (fft_control)
}
```

**`FamilyMeta`**: `{ familyKey, label, variantCount, present: boolean }` — lets the UI
render section headers and hide empty families.

**`ComparabilityReport`** (single-run is mostly trivially comparable — see §6):
`{ comparable: boolean, key: string, warnings: Warning[] }`,
`Warning = { code, message, severity: "info"|"warn" }`.

Contract invariants (asserted in validation):
- Pure: never mutates `bundle` or any nested array (snapshot-equality check).
- Deterministic order (see §5).
- Variants with `count === 0` are dropped (consistent with `buildVariantRows`).
- Node-ESM-loadable (no `tradeUniverse` import — see §10/§11).

---

## 4. Variant Collection Rules (per family)

A single `collectModelVariants(bundle)` returns a flat
`{ familyKey, variantKey, label, tooltipKey, trades, curve, syntheticCurve, sourceKeys }[]`
that `buildModelFamilyComparison` then reduces to rows. Per source:

**4.1 Baseline / primary**
- Trades: `bundle.trades` (fallback `tradesByVariant[primaryVariant]`).
- Curve: `bundle.equityCurve`.
- `variantKey: "baseline"`, label "Baseline". Always emitted (even if other families
  empty) so the table has an anchor; dropped only if it has zero performance trades.

**4.2 `entryResults.tradesByMode`**
- **Reuse the proven logic** in `enabledVariantBreakdown.js` (`readEntryTradesByMode`
  flattens nested objects; `canonicalEntryKey` strips `<pos>__` and maps `entry_baseline
  → baseline`). Import `buildVariantRows` *or* lift its key-handling into a shared
  internal — do **not** re-derive (see §11 dedup-source-of-truth risk).
- Curves from `entryResults.equityCurveByMode` via the same canonicalization.
- **Collision rule:** if entry-model collection yields a `baseline` variant, it is the
  same baseline as 4.1 — keep the 4.1 baseline (it owns the run headline curve) and drop
  the entry-model duplicate. (Assert this in validation.)

**4.3 `protectionResults.tradesByMode`**
- Same flatten pattern as entry trades; keys are protection-mode strings.
- Curves from `protectionResults.equityCurveByMode`.
- Labels: protection modes are **not** entry-model tags — do **not** route through
  `deriveEntryModel` (would mislabel as `unknown_model`). Use a protection label map
  (or the raw mode prettified) and `tooltipKey: null` for V1.

**4.4 `directionalResults.tradesByScenario`**
- Keys are directional storageKeys; trades per scenario.
- Curves from `directionalResults.equityCurveByScenario`; if absent for a key, rebuild.
- Label via `formatDirectionalScenarioLabel(scenarioId)` where `scenarioId =
  scenarioMeta[storageKey]?.scenarioId ?? storageKey.replace(/^[^_]+__/, "")` — mirror
  ComparisonLab's directional-options logic exactly. `tooltipKey: null` for V1.

**4.5 FFT ON/OFF control**
- Keys `${executionMode}:${scenarioKey}` in `controlTradesByScenario`.
- **Reuse** `getAutoControlInfo` / `resolveAutoControlTrades` from
  `fftPairingResolver.js` to enumerate and pull control trade lists — do not re-parse the
  key format.
- No stored curve → **rebuild** cumulative-R curve from the control trades; set
  `syntheticCurve: true`.
- Label e.g. "FFT OFF · <scenario>"; `tooltipKey: null` for V1. (FFT ON is the run's own
  entry/baseline data already represented by other rows; V1 surfaces the OFF control as a
  comparison row, not a separate ON synthesis.)

---

## 5. Dedup / Canonical-Key Rules

- **Entry-model dual-key:** delegate to the existing `canonicalEntryKey`
  (`<pos>__<mode>` prefix strip + `entry_baseline → baseline`). Bare key wins; never
  concatenate (the shipped double-count fix).
- **Cross-family namespacing:** `variantKey` is unique only **within** a family. The
  table's stable row id is the pair `${familyKey}:${variantKey}` (used as React key and
  finding id). This prevents a protection mode and an entry mode that happen to share a
  string from colliding.
- **Baseline single-instance rule (§4.2):** baseline may appear from both primary and
  entry-model collection; keep exactly one (primary's), drop the rest.
- **FFT control de-dup:** when exactly one populated control scenario exists for the
  active variant, `resolveAutoControlTrades` already collapses it; for multiple, emit one
  row per `${executionMode}:${scenarioKey}` and label by scenario.
- **Empty drop:** any variant whose performance-trade count is 0 is removed after
  accumulation (matches `buildVariantRows`).

**Ordering:** primary sort by family order
`[baseline, entry_model, directional, protection, fft_control]`; within entry-model reuse
the existing `TAG_ORDER` (baseline→C0→C1→C2→C3→EP…); within other families sort by
`netR` desc then label. Deterministic and stable.

---

## 6. Comparability Guard Rules

Single-run scope means **most** apples-to-oranges risk is absent (one symbol / TF /
date-range / RR / cost by construction). The guard for 4b-1 is therefore **light but
present**, and structured so the cross-run V2 can extend it without a rewrite:

- `evaluateComparability(variants, bundle)` returns
  `{ comparable: true, key, warnings }` where `key` is the run's fingerprint
  (`symbol|detectionTf|dateRange|rr|stopBuffer`) from `bundle.summary`.
- **Warnings emitted (info/warn, never block):**
  - `SYNTHETIC_CURVE` (info) — one or more rows (FFT control) use a rebuilt curve, so
    their Max DD is reconstructed, not backend-emitted.
  - `LOW_SAMPLE` (info) — any displayed variant has `decided < minDecidedForSignal`
    (reuse the researchSignals constant) → confidence already reflects this; the banner
    just makes it explicit.
  - `MIXED_EXECUTION_MODE` (warn) — FFT control's `executionMode` differs from the run's
    primary execution mode (the one genuine within-run mismatch worth flagging).
- **Deferred to V2:** symbol/TF/date/RR/stop-buffer cross-run mismatch detection (the key
  is computed now so V2 only adds the *comparison* of keys across bundles).

Guard **discloses, never blocks** — the app's established pattern (TableCompareShell,
ComparisonLab coverage banner).

---

## 7. Metrics — exact source of each

To guarantee parity with the shipped Enabled Variant table and the run headline, V1 splits
metric sourcing deliberately:

| Metric | Source | Rationale |
|---|---|---|
| **Trades** | direct count of `isPerformanceTrade(t)` | matches `buildVariantRows` exactly |
| **WR** | `wins/(wins+losses)*100` via `isWinTrade`/`isLossTrade` | canonical; breakevens excluded |
| **Net R** | `Σ Number(t.r)` over performance trades (= `sumR`) | **headline convention**; avoids `toCanonicalSummaryRow.netR` (= `netRPerformance`) which the design doc flagged can diverge from the equity curve / headline |
| **Avg R** | `sumR / count` (breakevens included) | matches `buildVariantRows` |
| **Max DD** | `maxDrawdownFromCurve(curve)` | curve from family source, or rebuilt for FFT control |
| **Profit Factor** | grossProfit / grossLoss over performance trades | **new column**; inline calc (see §11 import decision) |
| **Confidence** | `computeConfidence({ count, wins, losses, avgR })` | reuse researchSignals engine unchanged |

Net R / WR / Avg R / Trades are derived by the **same direct accumulation** the existing
variant table uses (lift the accumulation loop), so the two tables agree to the last
decimal. PF and Confidence are the genuinely additive columns.

**`rStdErr` is intentionally not supplied** → `computeConfidence` uses the Wilson
WR-precision path (the current behavior everywhere). The effect-SE path stays a
future `sumR2` upgrade (out of scope, consistent with Phase 2b).

---

## 8. Validation Fixtures & Tests

New file `frontend/src/data/__validation__/modelFamily.validate.mjs` (Node 22 ESM, run
with `node`), mirroring `enabledVariantBreakdown.validate.mjs`. Plus the Babel transpile
check (env + react presets) for the consuming component later.

**Fixtures (hand-built, minimal, no real bundle needed):**
1. **F-entry** — `entryResults.tradesByMode` with the **dual-key** structure
   (`single_position__entry_baseline` + `entry_te_..._d3` + bare aliases) → assert dedup,
   baseline relabel, canonical order. (Port the existing dual-key regression fixture.)
2. **F-protection** — two protection modes → assert labels are NOT `unknown_model` and
   curves wire to Max DD.
3. **F-directional** — `tradesByScenario` + `scenarioMeta` (one with `scenarioId`, one
   without) → assert label resolution + storageKey fallback.
4. **F-fft** — `controlTradesByScenario` with `${mode}:${scenario}` keys → assert FFT
   rows emitted, `syntheticCurve: true`, Max DD computed from rebuilt curve.
5. **F-baseline-collision** — baseline present in both `bundle.trades` and entry
   `tradesByMode` → assert exactly one baseline row, sourced from primary.
6. **F-empty** — empty bundle / families absent → assert `[]` rows, `families[].present
   === false`, no throw.

**Assertions:**
- Row contract shape (all keys present; types correct).
- Metric parity: for a shared variant, `modelFamily` row `{count,wins,losses,winRate,
  netR,avgR,maxDdR}` deep-equals the `buildVariantRows` row → **lock parity with the
  shipped table**.
- PF correctness on a fixture with known gross profit/loss (and `null` when no losses).
- Confidence: level monotonic with sample (large decided → not "Very Low"; tiny → "Very
  Low").
- **No mutation:** `JSON.stringify(bundle)` unchanged before/after (snapshot equality).
- Determinism: two calls → identical output ordering.
- Comparability warnings fire on the synthetic-curve and mixed-execution-mode fixtures.

**Run command (handed to user / CI):**
`node frontend/src/data/__validation__/modelFamily.validate.mjs`
plus the existing Babel transpile smoke check used for prior data-layer work.
(Full `craco build` is **not** required for the data milestone and times out in-sandbox.)

---

## 9. UI Integration Plan

**Later commit, after the data layer is green. Single-run only.**

**What gets upgraded**
- `RunDetail.jsx` Classification tab → the **Enabled Variant Comparison** section becomes
  **"Model Family Comparison"**: grouped by family (section sub-headers from `FamilyMeta`),
  rendering the same `ClassBreakdownTable` with **two added columns** — Profit Factor and
  a `ConfidenceChip` — alongside the existing Trades / WR / Net R / Avg R / Max DD.
- The shared **winner** badge (from extracted `compareWinner.js`) highlights the
  strongest family/variant by the existing 5-metric scheme.
- A comparability banner (from §6) renders above the table when warnings exist.
- **Save as finding** wired via `buildResearchFindingPayload({ source: "model_family", … })`
  → `addProjectFinding` (reuses existing plumbing; no store change).

**What stays unchanged**
- `fillStateBreakdown` / Session / Entry Model breakdown sections — untouched.
- **Research Signals** — remains selected-scenario, single-run; **no** cross-family
  signal logic in 4b-1.
- `ConfidenceChip.jsx`, `TermTip.jsx`, `ClassBreakdownTable` primitives — reused as-is
  (the `extraCol` pattern already supports the Max DD column; PF + Confidence extend it).
- The KPI strip, equity curve, and every other RunDetail panel.
- ComparisonLab — only the *extraction* of `computeExplainableWinner` (behavior-identical).

**What gets deferred (UI)**
- Per-variant equity **overlay** chart in this section (data supports it; ship the table
  first, overlay as a fast-follow if wanted).
- Insights `model_family` **source filter** entry — add when the first model_family
  finding can be produced (tiny `Insights.jsx` + `projectWorkflow` constant edit; can ride
  the UI commit or follow it).

---

## 10. File-by-File Implementation Order

Strict order; each numbered step is independently reviewable. Steps 1–3 are the
**data milestone** (shippable alone, zero UI risk); steps 4–6 are the **UI milestone**.

1. **NEW** `frontend/src/data/modelFamily.js`
   - `MODEL_FAMILIES` taxonomy; `collectModelVariants(bundle)`;
     `buildModelFamilyComparison(bundle, opts)`; `evaluateComparability(...)`.
   - Imports: `isPerformanceTrade`/`isWinTrade`/`isLossTrade` + `buildTradeClassification`
     (`tradeClassification*.js`), `getTagMeta` (`classificationRegistry.js`),
     `computeConfidence` (`researchSignals.js`), `formatDirectionalScenarioLabel`
     (entry formatters), `getAutoControlInfo`/`resolveAutoControlTrades`
     (`fftPairingResolver.js`), and the entry-model key/curve helpers from
     `enabledVariantBreakdown.js`. **Do NOT import `tradeUniverse.js`** (extensionless
     import breaks raw-node ESM). Max DD: see §11 import decision.
2. **NEW** `frontend/src/data/__validation__/modelFamily.validate.mjs` — §8 fixtures + assertions.
3. **RUN** validation (+ Babel transpile smoke). Data milestone commit candidate.
4. **NEW** `frontend/src/data/compareWinner.js` — lift `computeExplainableWinner` +
   `WINNER_METRICS` verbatim from `ComparisonLab.jsx`; **EDIT** `ComparisonLab.jsx` to
   import it (behavior-preserving). Add a tiny `compareWinner.validate.mjs` snapshot if
   cheap. *(This is the only edit to a file owned by another workstream — stage alone,
   coordinate.)*
5. **EDIT** `frontend/src/pages/RunDetail.jsx` — swap the Enabled Variant section for the
   Model Family table (consume `buildModelFamilyComparison(runData)`), add PF +
   ConfidenceChip columns, winner badge, comparability banner, Save-as-finding. Coordinate
   (RunDetail is large/frequently-dirty — stage only this file's hunks).
6. **EDIT (optional, small)** `frontend/src/pages/Insights.jsx` +
   `frontend/src/data/projectWorkflow.js` — add `model_family` to `FINDING_SOURCE_FILTERS`
   / source-group labels so model-family findings classify in the library.

Glossary: confirm `profit_factor` / `confidence` keys exist in `researchGlossary.js`
(they do); add a `model_family` term if the section header wants a TermTip — additive.

---

## 11. Risks & Blockers

- **Dedup-source-of-truth drift (high).** Re-implementing entry-model dedup would risk
  re-introducing the dual-key double-count / "Unknown Model" bugs. **Mitigation:** reuse
  `canonicalEntryKey` / `buildVariantRows` from `enabledVariantBreakdown.js`; assert
  per-variant metric parity in validation (§8).
- **`toCanonicalSummaryRow.netR` ≠ headline Net R (high if misused).** It returns
  `netRPerformance`. **Mitigation:** Net R / Avg R come from direct `Σ r` accumulation;
  `toCanonicalSummaryRow` is used (if at all) only for PF (§7).
- **Node-ESM import decision (medium) — the one open technical choice.**
  `resultsBasis.js` is extension-ful and ships its own `resultsBasis.validate.mjs`, so it
  *should* import cleanly under raw Node (via `summarizeTrades`/`accountEquity.js`).
  **Plan:** *probe first* — in step 1, try importing `maxDrawdownFromCurve` (and optionally
  PF via `toCanonicalSummaryRow`) from `resultsBasis.js`; run the .mjs.
  - If it loads → import them (no duplicate math).
  - If it fails to load under Node → **inline** `maxDrawdownFromCurve` (byte-for-byte, as
    `enabledVariantBreakdown.js` already does) and inline a 4-line Profit Factor
    (`grossProfit/grossLoss`), with a validation assertion pinning the inlined PF to a
    known fixture value. Either way the module stays node-testable.
- **Protection/directional mislabeling (medium).** Routing non-entry keys through
  `deriveEntryModel` would yield `unknown_model`. **Mitigation:** family-specific label
  resolution (§4.3/§4.4); validation asserts labels are not `unknown_model`.
- **FFT control curve absence (low).** No stored curve → rebuilt. **Mitigation:**
  `syntheticCurve` flag + `SYNTHETIC_CURVE` comparability info; Max DD still derived.
- **RunDetail merge risk (process).** Large, multi-owner file. **Mitigation:** data layer
  ships first and standalone; UI edit is a separate scoped commit; never `git add .`.
- **Shared-winner extraction touches ComparisonLab (process).** Another workstream's file.
  **Mitigation:** behavior-preserving lift, separate commit, coordinate before staging.
- **No hard blockers.** All inputs already land in the bundle; no backend dependency.

---

## 12. Recommended Commit Sequence

Each commit is independently green and scoped (host-side commits per the sandbox lock note):

1. `feat(data): add modelFamily single-run all-family comparison adapter`
   → `data/modelFamily.js` + `data/__validation__/modelFamily.validate.mjs`.
   *(Data milestone — no UI, no behavior change. Safe to ship alone.)*
2. `refactor(comparison): extract computeExplainableWinner to data/compareWinner.js`
   → `data/compareWinner.js` + `ComparisonLab.jsx` import swap (+ optional validate).
   *(Behavior-preserving; coordinate — touches another workstream's file.)*
3. `feat(run-detail): upgrade Enabled Variant section to Model Family Comparison`
   → `RunDetail.jsx` (table + PF + ConfidenceChip + winner + comparability + save-finding).
4. `feat(insights): classify model_family findings` *(optional, small)*
   → `Insights.jsx` + `projectWorkflow.js` source-filter constants.

Commit 1 is the foundation every later phase (V2 cross-run Model Lab, V3 agent batches)
reuses; commits 2–4 are the V1 user-facing slice. Ship 1 first; 2–4 can follow once the
adapter is validated.

---

## Deliverables recap

- **Phase 4b-1 scope** → §1 (+ defer list embedded and in §Defer below).
- **Data contract** → §3 row contract, §2 taxonomy, §4 collection, §5 dedup, §6 guard, §7 metrics.
- **File-by-file plan** → §10.
- **Validation plan** → §8.
- **UI integration plan** → §9.
- **Defer list** → cross-run Model Lab · new page/route/Sidebar · Sharpe / per-period
  returns · funded-account pass/fail · promotion recommendation · cross-family Research
  Signals · backend/importer/exporter work · multi-bundle collection · equity-overlay
  chart (fast-follow) · `sumR2` effect-SE confidence.
- **Final recommendation** → Build **commit 1 only first** (`data/modelFamily.js` +
  validation): it is unblocked, frontend-only, pure, and supersedes the narrower Enabled
  Variant logic without touching any shipped UI. Probe the `resultsBasis` import in step 1
  to settle the one open technical choice (import vs inline). Land the UI (commits 2–4)
  after the adapter is green. Research Signals stay single-run/selected-scenario; no
  cross-run, Sharpe, funded-account, or promotion work in this phase.
