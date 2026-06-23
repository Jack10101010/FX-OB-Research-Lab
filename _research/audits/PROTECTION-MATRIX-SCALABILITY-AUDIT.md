# PROTECTION-MATRIX-SCALABILITY-AUDIT

> Mode: **AUDIT / DESIGN ONLY**. No implementation. Goal: a scalable
> protection-matrix architecture so protection data can be generated, stored,
> imported, and resolved per entry universe — built for BE today and future
> protection/qualification modes.

---

## 1. Why exact BE is entry-variant-specific (verified)

In the backend, an exact BE result is produced by **re-running the full trade
simulation** for that entry variant, then walking the candle path with the BE
arm/trigger:

```
# scripts/run_backtest.py
candles  = load_candles(...)                       # once
order_blocks = detect_order_blocks(...)            # once
simulation_order_blocks = prepare_order_blocks_for_simulation(order_blocks)  # once
...
for entry_variant in resolve_be_entry_variants(config):     # baseline / TE+2 / …
    for scenario in be_scenarios(config):                   # arm × trigger
        trades = simulate_trades(candles, simulation_order_blocks,
                                 **be_entry_sim_kwargs(entry_variant),  # entry price/fill/stop
                                 be_arm_level_r=..., be_trigger_basis=...)
```

Each entry variant changes the **entry price, fill time, stop distance, and the
resulting trade path**. BE arms at a price derived from the entry+stop, and
triggers when the candle path returns to that price. Because Triggered Edge +2
fills at a different price/time with a different stop than baseline, its arm
price and the candle at which BE is hit are different — so the BE exit R is
different. **Baseline BE is therefore not reusable for TE+2** (or any other
variant): it would attribute the wrong entry/stop/path. This is correct, not a
bug — and the resolver already refuses the substitution (`beResolve.findBeScenario`
does EXACT entry-variant match with no baseline fallback).

---

## 2. Current architecture limitations

- **Generation is all-or-nothing per run.** BE passes are baked into the single
  `run_backtest.py` job (`be_variants` + `be_arm_levels` + `be_trigger_bases`).
  To get BE for a variant you didn't pre-select, you must **re-run the whole
  backtest** — even though candles + OB detection are unchanged.
- **No coverage manifest.** The frontend infers availability by probing
  `beTradesByMode[mode][entryVariant][beKey]`. There is no first-class list of
  "which protection cells exist / are missing / are stale," so the UI can only
  say EXACT-vs-REPLAY after the fact.
- **No on-demand generation.** Missing cells silently fall back to REPLAY
  (client candle-walk) or "unavailable." There's no UI path to request the exact
  cell.
- **One protection type.** The schema (`be_results`, `trades_*__be_*.csv`) is
  BE-shaped. Partial/trailing/dynamic-stop/gates have no home.
- **Combinatorial cost is linear in arms.** `be_scenarios` re-simulates once per
  (arm × trigger), even though all arm levels for a given (variant, trigger)
  share one trade path (see §7).

What already works in our favour: candles + OB detection + news tagging are
computed **once** and every pass reuses `candles` + `simulation_order_blocks`.
The expensive, shareable work is already shared; only the per-cell candle-walk is
per-(variant × protection).

---

## 3. Recommended long-term protection-matrix architecture

**Model protection as a matrix attached to an existing run, generated lazily,
described by a manifest, resolved per entry universe.**

Axes of the matrix:
```
cell = (executionMode) × (entryVariant) × (protectionMode) × (paramKey)
```

Split protection modes into **two classes** — this is the core scalability idea:

1. **Path-dependent outcome modifiers** — `break_even`, `partial_risk_reduction`,
   `trailing_stop`, `dynamic_stop_tightening`. These change the trade's exit, so
   they **must be re-simulated per entry variant** (path differs). They are the
   expensive, combinatorial part → the "matrix" proper.
2. **Gates / qualifiers / annotators** — `ema_filter`, `liquidity_filter`,
   `ob_quality_gate`, `liquidity_score`, `regime_score`. These **do not change
   trade paths**; they include/exclude/score trades. They can be computed **once
   per entry variant as per-trade annotations** (or even once from candles/OBs)
   and applied **client-side as masks** on top of any universe — including a
   protected one. They are *not* part of the expensive matrix and compose freely
   without regeneration.

So the durable architecture is:
- A **Protection Matrix generator** = a sidecar sub-job that attaches to an
  existing run, **reuses its detected OBs + candles** (no re-detection, no
  re-load), and runs only the missing path-dependent cells via the existing
  `simulate_trades(candles, simulation_order_blocks, …)` call.
- A **protection manifest** enumerating every cell's status (present / missing /
  stale / generating) so the frontend is declarative.
- **Gates/annotators** generated as cheap per-trade columns (or computed
  entirely client-side from candles where possible) and applied as the existing
  `protectionLayers` "gate" adapters — no matrix entry needed.

This maps cleanly onto the frontend we already have: `protectionLayers.js`
already distinguishes outcome-modifiers from gates/annotators in its contract;
`tradeUniverse` already yields `protected_result`. The missing piece is a
**manifest + lazy generation**, not a rewrite.

---

## 4. Output schema recommendation

Keep the existing trade CSVs, add a dedicated manifest. Per run folder:

```
runs/<run_id>/
  candles/ … , order_blocks.*               # detected once (reused)
  trades_<mode>.csv                          # baseline entry
  trades_<mode>__<entryVariant>.csv          # entry variants
  protection/
    trades_<mode>__<entryVariant>__<protKey>.csv     # one file per cell
    protection_manifest.json
  summary.json                               # entry_results + protection_results
  manifest.json, progress.json
```

`protKey` generalizes the current `be_*` key:
`be_wick_1p00R`, `partial_50pct_at_1R`, `trail_atr_1p5`, … (mode prefix + param token).

`protection_manifest.json` (the frontend's source of truth):
```jsonc
{
  "schema_version": 1,
  "base_run_id": "...", "config_hash": "...",
  "axes": {
    "executionModes": ["single_position"],
    "entryVariants": ["baseline", "entry_triggered_edge_25p0_d2"],
    "protectionModes": {
      "break_even": { "params": { "armLevels": [0.25,0.5,1,2,3,3.5], "triggers": ["wick","close"] } }
    }
  },
  "cells": [
    { "executionMode":"single_position", "entryVariant":"entry_triggered_edge_25p0_d2",
      "protectionMode":"break_even", "paramKey":"be_wick_1p00R",
      "status":"present", "file":"protection/trades_single_position__entry_triggered_edge_25p0_d2__be_wick_1p00R.csv",
      "counts": { "trades": 99, "beExits": 27 }, "generatedAt":"…", "configHash":"…" }
  ],
  "gates": [ { "mode":"ema_filter", "params":{"period":50}, "status":"present", "column":"above_ema_50" } ]
}
```

`summary.json` keeps `entry_results[mode][entryVariant]` and generalizes
`be_results` → `protection_results[mode][entryVariant][protKey]` (keep `be_results`
as a back-compat alias so existing imports don't break). `status` enum:
`present | missing | stale (configHash mismatch) | generating | failed`.

---

## 5. Frontend resolver / import changes needed (design only)

- **importer.js** — read `protection/protection_manifest.json` into the bundle as
  `bundle.protectionMatrix` (cells + gates + status). Continue building
  `beTradesByMode[mode][entryVariant][beKey]` from the CSVs (back-compat), but
  source the *availability* list from the manifest rather than inferring it.
- **beResolve.js → protectionResolve.js (generalize)** — keep `findBeScenario`'s
  EXACT, variant-aware, no-baseline-fallback rule; add a manifest-aware
  `resolveProtectionCell({ mode, entryVariant, protMode, paramKey })` that returns
  `{ status, trades|null, summary|null, reason }` where `reason` distinguishes
  `missing` (can be generated) from `no_data` (no matrix at all). This lets the UI
  offer "Generate" instead of silently REPLAYing.
- **protectionLayers.js** — already the right abstraction. Add gate adapters
  (`ema_filter`, etc.) that read per-trade annotation columns/masks; outcome
  adapters keep using resolved matrix cells. No architectural change.
- **tradeUniverse.js** — unchanged contract (`protected_result`); it just resolves
  cells through the manifest-aware resolver.
- **store / sidecarClient** — add a "generate protection cells" action (POST a
  matrix sub-job for a run + list of cells) and surface `protectionMatrix` +
  per-cell `status` to consumers.

---

## 6. Generation UX recommendation

- **Coverage view in Protection Lab**: a compact matrix grid (entryVariant ×
  protectionMode/param) with each cell coloured present / missing / stale /
  generating. This is the "premium, not manual" surface.
- **Missing-cell display**: where BE currently falls back to REPLAY, show an
  explicit chip — "Exact not generated · Generate" — instead of a silent REPLAY.
  Keep REPLAY available but labelled as the estimate, not the truth.
- **Trigger generation**: a "Generate exact protection" button (per cell, per
  row, or "fill all missing") that POSTs a **matrix sub-job attached to the run**
  (reuses its OBs/candles). Progress streams through the existing
  `progress.json` / sidecar stdout channel; cells flip to `present` on completion
  and the bundle re-imports.
- **Strategy Builder** stays the place to choose the *default* matrix to generate
  up front; the Lab is where you *fill gaps* on demand.

---

## 7. Performance / combinatorial-explosion strategy

Cost = `E (entryVariants) × M (protectionModes) × P (params per mode) × T (triggers)`
candle-walk passes. With E=10, BE arms A=9, T=2 → 180 BE passes/mode; adding
partial/trailing multiplies further. Controls, in priority order:

1. **One walk → all arm levels (biggest lever).** For a given (entryVariant,
   trigger), every BE arm level shares the *same trade path*; the BE exit for
   each arm is derivable from one MFE/“did price return to arm price” walk.
   Emitting all arm levels from a **single** simulation collapses `A` (9 → 1) —
   ~9× fewer BE passes. Recommend the matrix generator compute per-trade
   arm-crossing + return events once and derive each arm-level cell analytically.
2. **Reuse detection/candles (already true).** Matrix jobs attach to a run and
   never re-detect OBs or re-load candles.
3. **Gates/annotators are masks, not sims.** EMA/liquidity/OB-quality cost one
   pass over candles/trades to annotate, then compose client-side for free — they
   do **not** enter the E×M×P explosion.
4. **Lazy generation.** Generate the standard ladder by default; everything else
   on demand per requested cell. The manifest makes "what's missing" cheap.
5. **Dedupe by config hash.** Skip regeneration when a cell's `configHash`
   matches; mark `stale` only when inputs change.
6. **Cap defaults.** Default matrix = standard arm ladder × both triggers ×
   active entry variants; exotic params are opt-in.

---

## 8. Immediate recommendation for today

**Hybrid: brute-force-regenerate the current active run now to unblock research,
then build the lazy matrix generator as the durable layer.** Brute force today is
acceptable because the per-run reuse already exists; the matrix generator is what
prevents this from being manual forever.

### Option A — run all current entry variants now (brute force, unblocks today)
Re-run the active run's config with BE across all variants + the full arm ladder.
Config additions (Strategy Builder already serializes these):
```jsonc
{
  "be_enabled": true,
  "be_variants": "all",                                  // every active entry variant
  "be_arm_levels": [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5],
  "be_trigger_bases": ["wick", "close"],
  "be_stop_buffer_r": 0,
  "be_delay_candles": 0
}
```
Run (from `Lux-OB-Backtester/`, reusing the existing run's symbol/timeframe/date config):
```
python scripts/run_backtest.py --config <path-to-active-run-config>.json
```
(or trigger the same config through the sidecar/Strategy Builder "Run" action).
Cost with current per-arm sim ≈ E × 9 × 2 BE passes; acceptable for one symbol,
heavy if E is large — which is exactly why Option B follows.

### Option B — build the matrix generator first (durable, recommended next)
Minimal viable matrix generator, in order:
1. **Backend**: a `generate_protection_matrix(run_dir, cells)` entry point that
   loads the run's candles + cached `order_blocks`, runs only the requested cells
   via `simulate_trades`, writes `protection/trades_*.csv` + `protection_manifest.json`,
   and (lever #1) emits all arm levels per (variant, trigger) from one walk.
2. **Sidecar**: a `POST /runs/{id}/protection` endpoint that launches the
   generator as an attached sub-job with `progress.json` streaming.
3. **Frontend**: import `protection_manifest.json`; manifest-aware resolver;
   coverage grid + "Generate missing" trigger; REPLAY relabelled as estimate.

**Recommendation:** do **Option A today** for the one active EURUSD run so
research isn't blocked, and schedule **Option B** as the next implementation
phase (start with lever #1, the single-walk-all-arms generator, since it both
adds the matrix and cuts BE cost ~9×). Do not expand to partial/trailing/gates
until the BE matrix + manifest + coverage UI are proven.

---

### Appendix — files audited
Backend: `scripts/run_backtest.py` (`be_scenarios`, `resolve_be_entry_variants`,
`be_output_filename`, `be_entry_sim_kwargs`, `entry_scenarios`, the
detect-once/simulate-many loop, `summary.json` `entry_results`/`be_results`
nesting, `progress.json`/`manifest.json`), `sidecar/server.py` (subprocess launch,
progress extraction, run index). Frontend: `importer.js`, `beResolve.js`,
`protectionLayers.js`, `tradeUniverse.js`, `StrategyBuilder.jsx`,
`ProtectionLab`/`BreakevenTab.jsx`, store/sidecar wiring.
