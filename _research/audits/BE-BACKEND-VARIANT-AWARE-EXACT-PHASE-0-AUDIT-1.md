# BE-BACKEND-VARIANT-AWARE-EXACT — PHASE 0 AUDIT + IMPLEMENTATION PLAN (1)

> Mode: **AUDIT → PLAN ONLY**. No production code changed. Spans both repos.
> Goal: make backend EXACT Break-even **variant-aware** (per entry model), and
> surface "which result view the BE data belongs to" in Protection Lab.
> Guiding invariant: **never mislabel baseline BE as a variant's BE.** Integrity > convenience.

---

## 1. Backend files read (`Lux-OB-Backtester`)
- `scripts/run_backtest.py` — `entry_scenarios()` (L568), `be_scenarios()` (L521), `protection_scenarios()` (L486), `build_scenario_plan()` (L885), the BE execution loop (L3112–3165), entry-pass kwargs (L1821–1846, L2887–2892), `simulation_kwargs()` (L1741).
- `src/execution.py` — `simulate_trades()` signature (L1619): already accepts **both** entry-model params (`entry_model`, `entry_threshold_pct`, `entry_model_key`, `entry_family`, `triggered_edge_entry_level_pct`, `triggered_edge_delay_candles`) **and** BE params (`be_arm_level_r`, `be_trigger_basis`, `be_stop_buffer_r`, `be_delay_candles`, `be_scenario_key`).
- `src/config.py` — BE config fields (`be_enabled`, `be_arm_levels`, `be_trigger_bases`, `be_stop_buffer_r`, `be_delay_candles`).
- `sidecar/server.py` — `/runs` writes the POST body to a config and runs `--config`; bundle endpoint returns all `.csv`/`.json` (`MAX_BUNDLE_BYTES = 25 MB`).

## 2. Frontend files read (`FX-OB-Research-Lab`)
- `data/importer.js` — `beTradeFileInfo()`, `detectFileKind()`, `trades_be` routing into `beTradesByMode[executionMode][scenarioKey]`, `be_results` → `bundle.beResults`.
- `data/beResolve.js` — `resolveBeScenarioSource()`, `findBeScenario()`, key tolerance.
- `pages/ProtectionLab.jsx` — passes `isBaselineView` + `executionMode` from `useTradeUniverse()`.
- `components/lab/protection/BreakevenTab.jsx` — EXACT/REPLAY gate + source chip + diagnostic.
- `data/tradeUniverse.js` — `universe.sourceKey` (canonical entry key, e.g. `entry_triggered_edge_25p0_next` or `baseline`), `universe.variant` (execution mode), `universe.label`, `universe.scenario.{family,threshold,fillMode}`.
- `data/useRunVariant.js` — result-view selection (family/threshold/fillMode) feeding the universe.

---

## 3. Is implementation straightforward or phased? → **Phased, but low-risk per phase.**
The engine already supports entry-model + BE in a single `simulate_trades` call, so this is a
**nested-loop + naming/summary change**, not a simulator rewrite. Two phases:

- **P1 (backend):** generate BE per entry scenario, namespaced filenames + nested `be_results`, behind a `be_variants` selector (default = baseline-only ⇒ byte-identical to today).
- **P2 (frontend):** nested import + variant-aware resolver + "BE data: …" chip.

The dominant risk is **combinatorial runtime/bundle-size blow-up** (entry scenarios × BE scenarios) — addressed by a default-narrow `be_variants` selector and the 25 MB cap. This is why it must be phased and opt-in, not on-by-default for all variants.

---

## 4. Proposed backend key / filename format

### Entry-variant key (already exists, reuse verbatim)
`entry_scenarios()` keys are the canonical variant identifiers, matching the frontend's `universe.sourceKey`:
- baseline → `baseline`
- penetration → `entry_penetration_25p0`
- triggered edge → `entry_triggered_edge_25p0_same | _next | _d2 | _d3`

### BE trade CSV filenames
```
baseline (backward-compatible — UNCHANGED):
  trades_{execution_mode}__be_{trigger}_{arm}R.csv
    e.g. trades_single_position__be_wick_0p50R.csv          → entry_variant_key = "baseline"

variant (NEW):
  trades_{execution_mode}__{entry_variant_key}__be_{trigger}_{arm}R.csv
    e.g. trades_single_position__entry_triggered_edge_25p0_d2__be_wick_0p50R.csv
```
Rationale: keeping the baseline filename unchanged preserves backward-compat with every existing
bundle and the current frontend parser; the variant form simply inserts `__{entry_variant_key}__`
before the `be_` segment. The frontend BE parser already splits on `__be_`, so the prefix between
`trades_{mode}__` and `__be_` is exactly the entry key (or empty ⇒ baseline).

### `summary.json` shape (nested, backward-compatible reader)
```jsonc
"be_results": {
  "single_position": {
    "baseline": { "be_wick_0p50R": { …summary… }, "be_close_0p50R": { … } },
    "entry_triggered_edge_25p0_d2": { "be_wick_0p50R": { … }, … }
  }
}
```
This is the Phase-B preferred shape `be_results[execution_mode][entry_variant_key][be_scenario_key]`.
**Migration note:** today's shape is `be_results[mode][be_key]` (flat, implicitly baseline). The
frontend importer must accept BOTH: if a `be_results[mode]` value is itself a map of `be_*` keys →
old flat baseline form (nest it under `"baseline"`); if its values are maps → new nested form.

---

## 5. Proposed frontend storage shape
Mirror the backend nesting one-for-one:
```
bundle.beResults      = { [executionMode]: { [entryVariantKey]: { [beScenarioKey]: summary } } }
bundle.beTradesByMode = { [executionMode]: { [entryVariantKey]: { [beScenarioKey]: Trade[] } } }
```
- Old bundles (flat `be_results[mode][be_key]`, files `…__be_*.csv` with no entry token) normalise to `entryVariantKey = "baseline"` on import — old BE bundles keep working unchanged.
- The resolver gains an `entryVariantKey` argument; it is supplied from `universe.sourceKey`
  (`"baseline"` for the baseline view). Decimal-form tolerance for `be_*` keys stays as-is.

## 6. Chip copy / design (Break-even tab)
A small `Pill` beside the EXACT/REPLAY tier chip, driven by `universe.label` / `sourceKey`:
- EXACT on baseline → **"BE data: Baseline"** (tone: success)
- EXACT on a variant → **"BE data: Triggered Edge 25% · Delay +2"** (tone: success) — label from `universe.label`
- No exact BE for the current view → **"BE data: REPLAY fallback · {result view}"** (tone: secondary)
This makes the data's provenance explicit at all times; baseline BE can never *look* like a variant's.

---

## 7. Implementation plan (smallest safe path)

### Phase P1 — Backend (behind a selector; default = current behavior)
1. **Config:** add `be_variants: list[str] | str = "baseline"` to `BacktestConfig`
   (`"baseline"` | `"all"` | explicit list of entry keys). Default `"baseline"` ⇒ zero behavior change.
2. **Planner (`build_scenario_plan`, `be_scenarios`):** for each `execution_mode`, for each entry
   scenario selected by `be_variants`, for each BE scenario → emit a plan item carrying BOTH the
   entry scenario fields and the BE fields; `output_file` uses the namespaced filename (baseline
   keeps the legacy name). Add `entry_variant_key` to each BE plan item.
3. **BE execution loop (L3112+):** build `sim_kwargs = simulation_kwargs(...)`, then apply the
   entry scenario's kwargs (`entry_model`, `entry_threshold_pct`, `entry_model_key`, `entry_family`,
   `triggered_edge_entry_level_pct`, `triggered_edge_delay_candles`) **and** the BE kwargs, then
   `simulate_trades(...)`. Compute `add_be_summary_stats` against **that entry variant's own
   baseline** (the entry scenario's no-BE trades), not the global baseline.
4. **Summary:** write `run_summary["be_results"][execution_mode][entry_variant_key][be_key] = mode_summary`; include `entry_variant_key` inside each summary object too.
5. **Tests (`tests/test_be_replay.py`):** baseline-only default unchanged (regression); `be_variants="all"` produces variant files + nested summary; per-variant baseline used for `delta_net_r`; filename/key format asserted; summary nesting asserted.

### Phase P2 — Frontend (nested + resolver + chip)
6. **Importer:** extend `beTradeFileInfo` to capture an optional `entry_variant_key` (text between `trades_{mode}__` and `__be_`; empty ⇒ `baseline`); route into nested `beTradesByMode[mode][entryKey][beKey]`; parse nested `be_results` with the **dual-shape reader** (old flat ⇒ `baseline`).
7. **`beResolve`:** add `entryVariantKey` to `resolveBeScenarioSource`/`findBeScenario`/`describeBeAvailability`; match `beResults[mode][entryKey]` then the be-key tolerance as today.
8. **ProtectionLab:** pass `entryVariantKey = universe.sourceKey` and `resultViewLabel = universe.label` to the tab. Remove the baseline-only gate **once variant BE exists for the view**; keep REPLAY fallback when the selected view has no exact BE.
9. **BreakevenTab:** resolve with `entryVariantKey`; render the "BE data: …" chip; EXACT when the current view's BE exists, REPLAY + note otherwise.
10. **Validation:** extend `beIntegration.validate.mjs` (nested resolve, variant match, baseline-not-used-for-variant, old-flat-bundle normalisation) and `beConfigSerialization` (serialize `be_variants`).

---

## 8. Risks
1. **Combinatorial blow-up (HIGH).** entry_scenarios × be_scenarios passes. A full research run
   (baseline + 4 penetration + 8 triggered-edge) × 12 BE = ~156 passes and many CSVs → slow + likely
   trips the sidecar 25 MB bundle cap. **Mitigation:** `be_variants` defaults to `"baseline"`;
   Strategy Builder exposes "Generate BE for: Baseline only / Active entry models / Custom"; consider
   raising/streaming the cap before enabling `"all"` on long runs.
2. **Per-variant baseline for deltas (MED).** `delta_net_r` / `winners_cut` / `losses_saved` must
   compare each BE pass to **that entry variant's own no-BE trades**, not the global baseline, or the
   numbers are wrong. The planner must thread the correct baseline summary into `add_be_summary_stats`.
3. **Summary shape migration (MED).** Nesting `be_results` is a breaking shape change. The
   dual-shape importer reader is mandatory so old bundles (flat) still load as `baseline`.
4. **Shared dirty files (MED).** `importer.js`, `ProtectionLab.jsx`, `run_backtest.py` are
   multi-stream. Stage narrowly; commit on host.
5. **Key drift (LOW).** Backend entry keys and frontend `universe.sourceKey` must stay identical
   (`entry_triggered_edge_25p0_d2` etc.). They match today; a validation fixture should lock it.
6. **FFT/control + directional (LOW/scoping).** FFT control passes and directional split-passes are
   separate trade sets; variant BE for those is out of scope for P1/P2 (document as P3).

## 9. Validation plan
1. Backend baseline BE unchanged with `be_variants` default (byte-parity regression).
2. `be_variants="all"` generates `trades_{mode}__{entry_key}__be_*.csv` for each entry scenario.
3. `summary.json` has nested `be_results[mode][entry_key][be_key]`.
4. Frontend imports nested files → `beTradesByMode[mode][entryKey][beKey]`; old flat bundle → `baseline`.
5. Resolver: baseline view → baseline BE EXACT; TE 25% d2 view → its matching BE EXACT.
6. Baseline BE is **never** returned for a variant view (explicit negative test).
7. Chip shows the correct view label (Baseline / Triggered Edge 25% · Delay +2 / REPLAY fallback).
8. Old BE bundles (flat, baseline-only) still load and resolve EXACT on baseline.

---

### Recommendation
Proceed **phased**. P1 (backend, behind `be_variants` default-baseline) is safe and self-contained;
P2 (frontend nested + chip) layers on without breaking old bundles. Do **not** enable `"all"`
variant generation by default until the bundle-size cap and runtime are addressed. Until P1+P2 land,
the current baseline-only gate (EXACT on baseline, REPLAY + note elsewhere) remains the correct,
integrity-preserving behavior.
