# FFT-WIDTH-1-AUDIT

**Goal:** Determine whether FFT (First Failed Tag cancel) effectiveness varies by OB size.

**Status:** Audit + design + verified analysis. **No implementation.** No backend, importer, pairing, or analytics-formula changes were made. All numbers below were produced read-only from the live run data and validated against the existing Run Detail UI.

**Data sample:** Run 17 — `EURUSD_M15_RR3.3_17` (`imported_1780942201555`), scenario **Triggered Edge 25% · Next Candle**, variant **allow_multi_position**, with its auto-paired FFT-OFF control. 103 FFT cancels, 128 valid ON trades, 187 control trades.

---

## TL;DR

FFT effectiveness varies **strongly and monotonically** by OB size on this run. Almost all of FFT's damage is concentrated in **small order blocks**:

- **Small OBs (< 10 p)** — 72 of 103 cancels (70%). High-confidence attributed impact **−21.36 R**. FFT is net **destructive** here.
- **Medium OBs (10–20 p)** — 30 cancels. High-conf impact **+1.75 R**. Roughly **neutral / slightly positive**.
- **Large OBs (> 20 p)** — 1 cancel. Not interpretable.

Fine-grained, the impact flips sign around **~12 p**: negative below, positive at 12–15 p. The actionable hypothesis is that **FFT should be gated to larger OBs (≈ ≥ 12 p)** and likely disabled for sub-10 p blocks. (Single run, single symbol/timeframe — see caveats.)

---

## Phase A — Width-field inventory

There is one canonical OB-size field, **`obWidthPips`** (number, in pips), and it is present on every record type FFT analysis touches.

| Field | Type / unit | Lives on | Source | Notes |
|---|---|---|---|---|
| **`obWidthPips`** | number, pips | order blocks, trades, **FFT cancels**, control trades | `order_blocks.csv` col `ob_width_pips` (else computed) | **Canonical.** Verified present on 333/333 OBs, 330/330 ON rows, 330/330 control rows. |
| `obWidth` | number (raw) | trades / cancels | trade col `ob_width` / `obwidth` | Raw passthrough; becomes the "explicit width" input to `obWidthPips`. |
| `obTop`, `obBottom` | price | trades / cancels | OB `top`/`bot` via `obId` join | Lets width be recomputed if needed. |
| `top`, `bot` | price | order blocks | `order_blocks.csv` | Source for computed width. |
| `minObSizePips`, `maxObSizePips` | number, pips | run config | config registry | **Filters, not per-OB data** — defines the run's admissible size band, not a slice key. |

**How width reaches an FFT cancel.** FFT cancels are ordinary rows in the trades array (detected by `cancel_reason === "first_failed_tag"`). The importer's `enrichTradesWithOrderBlocks()` runs over **all** rows, including cancels and control rows, and sets:

```
obWidthPips = explicitWidth ?? computedWidth
  explicitWidth = trade.obWidth (> 0)                      // from CSV ob_width
  computedWidth = |ob.top − ob.bot| / pipSize  (joined by obId)
```

So a cancel is width-tagged directly. As a fallback, `cancel.obId → orderBlocks[].obWidthPips` always resolves (333/333). The pairing layer already hands callers the full cancel row: `computePairedFftAnalytics().pairs[i].cancelTrade.obWidthPips`.

**Existing bucketer.** `obSizeBucket(pips)` in `data/obRetestResearch.js` already exists and is unit-tested: `small (<10p)` / `medium (10-20p)` / `large (>20p)` / `unknown`.

**Conclusion:** No new fields, importer work, or backend work are required. Width is fully available and already joinable to cancels and to both ON and control trade arrays.

---

## Phase B — Bucket design

**Observed cancel-width distribution (Run 17):** min **1.8 p**, median **7.8 p**, max **20.1 p**. All 103 cancels carry a width (0 unknown).

Implication: the canonical `obSizeBucket` is usable but **mismatched to where FFT actually fires** — 70% of cancels land in `small`, and `large (>20p)` is effectively empty (1 borderline row). It also hides the sign-flip that happens inside 10–15 p.

**Recommended scheme (two tiers):**

1. **Canonical tier (cross-surface consistency):** keep `obSizeBucket` → `small <10p` / `medium 10–20p` / `large >20p` / `unknown`. Use this anywhere the result must line up with the OB-retest research surfaces.
2. **FFT-resolution tier (this analysis):** finer fixed edges concentrated in the populated band, e.g. **`<5 / 5–8 / 8–10 / 10–12 / 12–15 / 15–20 / ≥20`**, plus `unknown` for null width. This is what exposes the crossover.

A pragmatic **3-way actionable** collapse that maps to the finding: **`<8p` (avoid) / `8–12p` (marginal) / `≥12p` (keep)**.

**Design rules:**
- **`unknown` bucket** for null `obWidthPips` (null, not 0). Zero here, but keep it so a future dataset with missing widths is visible, not silently dropped.
- **Min-sample guard:** require **≥ ~10 cancels and ≥ 5 HIGH pairs** before interpreting a bucket. On this run, `15–20p` (4 cancels, 0 HIGH) and `>20p` (1 cancel) fail the guard — report them but mark "low N".
- **Normalization (future, multi-run):** `obWidthPips` is absolute pips, fine for one symbol/timeframe. For cross-symbol or cross-TF pooling, normalize (ATR-relative or run-median-relative) before bucketing.

---

## Phase C — FFT impact by width bucket

**Feasibility: fully computable now**, with zero changes to pairing/analytics formulas. Each requested metric is a group-by over data that already exists:

| Metric | How it's derived per bucket |
|---|---|
| **Cancels** | count of `pairs` grouped by `obSizeBucket(pair.cancelTrade.obWidthPips)` |
| **Winners removed** | `confidence === HIGH && pairedOffOutcome === WIN` |
| **Losses avoided** | `confidence === HIGH && pairedOffOutcome ∈ {LOSS, NEWS_FLATTEN, PROTECTION_EXIT}` |
| **High-conf impact (R)** | `Σ −pairedOffR` over HIGH (win+loss) — identical formula to `confirmedNetRImpact` |
| **Strategy delta (R)** | `Σ numericR(ON perf trades in bucket) − Σ numericR(control perf trades in bucket)`; both arrays carry `obWidthPips` |

**Validation — reconstruction matches the live UI exactly:** 103 cancels · 42 HIGH · 13 winners removed · 29 losses avoided · −18.58 R high-conf impact · ON +40.4 R / control +61.6 R / **strategy delta −21.2 R** / 128 ON-perf / 187 control-perf. Every figure equals what Run Detail renders, so the per-bucket splits below are authoritative (they sum back to these totals).

### Canonical buckets

| Bucket | Cancels | HIGH | Winners removed | Losses avoided | High-conf impact (R) | ON R | Ctrl R | Strategy Δ (R) |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| small (<10p) | 72 | 31 | 12 | 19 | **−21.36** | 23.8 | 43.3 | **−19.4** |
| medium (10–20p) | 30 | 10 | 1 | 9 | **+1.75** | 16.6 | 19.4 | −2.8 |
| large (>20p) | 1 | 1 | 0 | 1 | +1.03 | ~0.0 | ~−1.1 | ~+1.1 |
| unknown | 0 | 0 | 0 | 0 | 0 | — | — | — |
| **Total** | **103** | **42** | **13** | **29** | **−18.58** | **40.4** | **61.6** | **−21.2** |

### Fine-grained buckets (high-conf attributed impact)

| Width (p) | Cancels | HIGH | Winners removed | Losses avoided | High-conf impact (R) |
|---|--:|--:|--:|--:|--:|
| < 5 | 19 | 9 | 4 | 5 | **−8.20** |
| 5–8 | 33 | 12 | 5 | 7 | **−8.51** |
| 8–10 | 20 | 10 | 3 | 7 | **−4.64** |
| 10–12 | 13 | 4 | 1 | 3 | −2.96 |
| 12–15 | 13 | 6 | 0 | 6 | **+4.70** |
| 15–20 | 4 | 0 | 0 | 0 | 0 (low N) |
| > 20 | 1 | 1 | 0 | 1 | +1.03 (low N) |
| **Total** | **103** | **42** | **13** | **29** | **−18.58** |

### Interpretation (answers the goal)

Yes — effectiveness varies sharply with OB size, and the relationship is close to **monotonic in pips**:

- Below ~10 p, FFT removes winners that are larger than the losses it avoids → strongly negative (−8.2, −8.5, −4.6 R across the sub-10 p bands).
- The sign **flips around ~12 p**: at 12–15 p FFT avoided 6 losses and removed **0** winners (+4.70 R).
- The whole-strategy delta tells the same story: −19.4 R of the −21.2 R total comes from small OBs; medium is −2.8 R; large is noise.

The cleanest signal is the high-conf attributed impact, because it is a true paired counterfactual. It says: **on this run, FFT's value is entirely a small-OB problem.** Gating FFT to OBs ≥ ~12 p (or simply disabling it under ~10 p) would have removed essentially all of the −18.58 R high-conf cost while preserving the small positive contribution from larger blocks.

---

## Caveats

- **Single run, single symbol/timeframe** (EURUSD M15, RR 3.3, Triggered Edge 25% · Next). The crossover point (~12 p) is specific to this run and must not be treated as a universal threshold until reproduced across runs/symbols/scenarios.
- **Coverage:** only 42/103 cancels are HIGH-confidence paired; 61 are low-confidence (self-invalidated / timing-divergent). The per-bucket HIGH counts inherit that coverage. The low-confidence cancels are split small 41 / medium 20 / large 0 — i.e. coverage is itself size-dependent, which slightly biases bucket comparisons. Treat the HIGH-conf impact as the primary, well-attributed measure and the strategy delta as the broader (noisier) corroboration.
- **Low-N buckets** (15–20 p, >20 p) are reported for completeness but are not interpretable.
- `obWidthPips` is absolute pips; cross-symbol pooling later needs normalization (Phase B).

---

## Reproduction recipe (for a future implementation phase)

Pure, display-only; mirrors existing helpers. No formula changes.

```
const paired = computePairedFftAnalytics(allTrades /*ON, incl. cancels*/, offTrades /*control*/);
for (const p of paired.pairs) {
    const bucket = obSizeBucket(p.cancelTrade.obWidthPips);   // existing fn
    // cancels++
    if (p.confidence === "HIGH") {
        if (p.pairedOffOutcome === "WIN")                       winnersRemoved++,  impact -= p.pairedOffR;
        else if (FFT_LOSS_OUTCOMES.has(p.pairedOffOutcome))     lossesAvoided++,   impact -= p.pairedOffR;
    }
}
// strategy delta per bucket: group ON & control performance trades (isPerformanceTrade)
// by obSizeBucket(t.obWidthPips); delta = Σ numericR(ON) − Σ numericR(control).
```

Inputs already exist: `pairs[].cancelTrade.obWidthPips`, `pairs[].pairedOffR`, `pairs[].pairedOffOutcome`, `pairs[].confidence`; ON/control arrays via `extractOffTrades(...)`; bucketing via `obSizeBucket`. Note the per-scenario ON trades (with cancels) are stripped from IndexedDB (`tradesOmittedForStorage`) and live only at runtime / via the sidecar — any offline tool must source them from the live bundle, not the persisted one.
