# AAE-DEEP-ANALYSIS-1

**Scope:** Armed-After-OB-Exit (AAE) and OB-Not-Occupied deep analysis — audit and implementation plan  
**Mode:** Audit / Implementation plan only — no code modified  
**Date:** 2026-06-05  
**Status:** Complete  

---

## 1. Background

The trade classification system (Phase 1) introduced two `entry_context` tags:

- `aae` — trade was armed after the OB had already been exited by price during the delay window
- `ob_not_occupied` — trade was armed while price was outside the OB (and not due to AAE)

Both tags are derived in `tradeClassificationDims.js` from `armedAfterObExit` and `obOccupiedAtArm`. Phase 1 shipped but these tags were null on all loaded runs because the backtester did not yet export the source fields.

This document records the full audit of the backtester source, CSV export pipeline, data availability, derivable metrics, timing bucket definitions, BOS/CHoCH feasibility verdict, and the UI placement plan for a dedicated AAE analysis layer.

---

## 2. AAE Fields: Current Export Status

### 2.1 Backtester Source (`execution.py`)

The four core AAE fields are computed in `_apply_delay_validity_fields()` (lines ~744–814), which is called for every triggered-edge trade. They are part of `TRADE_COLUMNS` (lines 144–155).

| Field | Computation | Condition |
|---|---|---|
| `arm_candle_index` | `trigger_candle_index + delay` | Always set when trigger fired |
| `exited_ob_before_arm` | `bool(dw["exited"])` | True if price closed outside OB during delay window |
| `ob_occupied_at_arm` | `_dw_ob_occupied(ob, candle)` at arm candle | Checks if close is inside OB zone at arm time |
| `armed_after_ob_exit` | `bool(dw["exited"])` AND `dw["finalized"]` | True only when both exit occurred AND arm was reached |
| `ob_exit_candle_index` | `dw["exit_candle_index"]` | Candle when price first exited OB |
| `ob_exit_time` | `dw["exit_time"]` | Timestamp when price exited OB |
| `price_distance_from_ob_at_arm_pips` | `abs(close - OB edge) / pip_size` at arm candle | Distance from OB boundary at arm time |

**Behaviour by delay value:**
- `delay = 0` (same): no delay window → `armed_after_ob_exit = False`, `exited_ob_before_arm = False`, exit fields blank. AAE structurally impossible.
- `delay = 1` (next): 1-candle delay window → either exited (→ AAE) or not. No sub-bucketing possible.
- `delay ≥ 2` (d2, d3): multi-candle delay window → full AAE timing data populated.

### 2.2 Export Pipeline

`run_backtest.py` writes trades as `trades.to_csv(output_file, index=False)` with no column filtering — the full TRADE_COLUMNS schema is always written. **No serialization step was filtering these fields.**

### 2.3 Root Cause of Missing Fields in Older Runs

Fields were absent from runs before `20260604_174841`. All runs from `20260604_174841` onward contain the full set. The `20260604_143658` run (930-row, full-history) just predates the addition by a few hours. The fix to generate a new full-history run is the highest-priority data task.

### 2.4 Fields Confirmed Present in New-Format Runs

Verified via `trades_allow_multi_position__entry_triggered_edge_25p0_d2.csv` from `20260605_104047`:

```
col 133: delay_candles_configured
col 134: arm_candle_index
col 135: exited_ob_before_arm
col 136: ob_occupied_at_arm
col 137: armed_after_ob_exit
col 138: ob_exit_candle_index
col 139: ob_exit_time
col 140: price_distance_from_ob_at_arm_pips
```

---

## 3. Available Fields (Full Inventory)

### 3.1 AAE / Delay-Validity Fields (New — present in runs from 2026-06-04+)

| Field | Type | Notes |
|---|---|---|
| `delay_candles_configured` | int | Configured delay (0, 1, 2, 3) |
| `arm_candle_index` | int | Absolute candle index when armed |
| `exited_ob_before_arm` | bool | Price closed outside OB at any point during delay window |
| `ob_occupied_at_arm` | bool | Price was inside OB zone at the arm candle |
| `armed_after_ob_exit` | bool | Armed despite OB exit — the core AAE flag |
| `ob_exit_candle_index` | int | Candle when price first exited OB during delay window |
| `ob_exit_time` | timestamp | Time when price exited OB |
| `price_distance_from_ob_at_arm_pips` | float | Distance from OB boundary at arm time (0 if inside) |

### 3.2 Timing Fields Already Present (All Runs)

| Field | Type | Notes |
|---|---|---|
| `detection_time` | timestamp | OB detected |
| `trigger_time` | timestamp | TE trigger fired |
| `trigger_candle_index` | int | Absolute candle index of trigger |
| `armed_at` | timestamp | When order was armed |
| `trigger_to_entry_minutes` | float | Time from trigger to fill |
| `edge_revisit_time` | timestamp | When price revisited OB edge post-trigger |
| `fill_time` | timestamp | When trade was filled |
| `fill_candle_index` | int | Absolute candle index of fill |
| `fill_session` | string | Session at fill time |
| `bars_to_fill` | int | Candles from detection to fill |
| `minutes_to_fill` | float | Minutes from detection to fill |

### 3.3 Structural / Classification Fields Already Present (All Runs)

| Field | Type | Notes |
|---|---|---|
| `structure_tag` | string | `"BOS"` or `"CHoCH"` — directly in trade CSV |
| `direction` | string | `"bullish"` or `"bearish"` |
| `ob_id` | string | Links to `order_blocks.csv` for OB geometry join |
| `outcome` | string | WIN / LOSS / BREAKEVEN / … |
| `pnl_r` | float | Net R result |
| `fill_session` | string | Asia / London / New York / … |

### 3.4 OB Geometry (Joinable via `ob_id`)

`order_blocks.csv` contains `top`, `bottom`, `ob_size_pips`, `origin_time`, `detection_time`, `structure_tag`, `direction`. Join key: `ob_id` ↔ `ob_id` in trades CSV.

---

## 4. Derived Metrics

These are computable at analysis time from existing fields without any new backtester changes:

| Metric | Formula | Meaning |
|---|---|---|
| `trigger_to_arm_candles` | `arm_candle_index - trigger_candle_index` | = `delay_candles_configured` (sanity check) |
| `arm_to_fill_candles` | `fill_candle_index - arm_candle_index` | How long after arming did fill occur |
| `ob_exit_lag_candles` | `arm_candle_index - ob_exit_candle_index` | How many candles before arm did OB exit |
| `ob_exit_lag_pct` | `ob_exit_lag_candles / delay_candles_configured` | Exit position as fraction of delay window (0 = just before arm, 1 = immediately after trigger) |
| `ob_reentry_at_fill` | `fill_penetration_pct > 0` | Whether fill was inside OB despite earlier exit |
| `aae_distance_band` | bucket of `price_distance_from_ob_at_arm_pips` | 0–2 / 2–5 / 5–10 / 10+ pips |

---

## 5. AAE Timing Bucket Definitions

Applicable only to trades with `armed_after_ob_exit = True` and `delay ≥ 2`.

### By delay-window exit position (`ob_exit_lag_pct`)

| Bucket | Condition | Interpretation |
|---|---|---|
| `aae_immediate_exit` | `ob_exit_lag_candles == 1` (exit on candle just before arm) | OB exited at the last possible moment |
| `aae_late_exit` | `ob_exit_lag_pct < 0.5` | OB exit in second half of delay window |
| `aae_early_exit` | `ob_exit_lag_pct ≥ 0.5` | OB exit in first half of delay window |

### By price distance from OB at arm (`price_distance_from_ob_at_arm_pips`)

| Bucket | Range | Interpretation |
|---|---|---|
| `shallow_aae` | 0–3 pips | Price barely cleared OB — structurally borderline |
| `moderate_aae` | 3–7 pips | Meaningful clearance |
| `deep_aae` | 7+ pips | Price was significantly beyond OB at arm |

### For `ob_not_occupied` (no AAE, but not inside OB at arm)

Bucket by `price_distance_from_ob_at_arm_pips` using same 0–3 / 3–7 / 7+ bands.  
Sub-segment by `delay_candles_configured` (0 = structurally impossible, 1 = possible but no window data, 2+ = full data).

---

## 6. BOS/CHoCH Feasibility

**Verdict: Fully feasible, no backtester changes needed.**

`structure_tag` is a first-class column in all TE trade CSVs — confirmed in both old-format runs (`20260604_143658`, 930 rows) and new-format runs with AAE fields. Values are `"BOS"` and `"CHoCH"`.

Distribution example (930-row run, `_next` variant):
- BOS: 437 trades (47%)
- CHoCH: 493 trades (53%)

**BOS/CHoCH segmentation is available for any dimension cross-tab** including:
- BOS vs CHoCH × entry_model
- BOS vs CHoCH × AAE status
- BOS vs CHoCH × exit type
- BOS vs CHoCH × fill session

The `structure_tag` is already parsed by `importer.js` at:
```js
structure_tag: String(pick(r, "structure_tag", "structureTag") || "")
```
And present on all trade objects.

---

## 7. Data Size Constraint

The most important finding for prioritization:

| Run | Date Range | Rows (TE 25p0 next) | Has AAE Fields |
|---|---|---|---|
| `20260602_173734` | Unknown | 150 | No |
| `20260604_143658` | 2021-01-01 → 2026-05-18 | 930 | **No** |
| `20260604_174841` | 2026-03-04 → 2026-05-15 | 30 | Yes |
| `20260605_104047` | ~same | 36 | Yes |

**The only full-history run (930 rows, 5+ years) predates the AAE field addition by hours.** All runs with AAE fields cover ~2.5 months, yielding ~30–36 filled TE trades — insufficient for statistically robust AAE sub-group analysis (AAE incidence in d2/d3 is currently 0–1 per run).

**Action required:** Re-run the backtester with the existing config (or the full-history config from `20260604_143658`) to generate a new full-history CSV with all AAE fields. This is a prerequisite for Phase 1 of the AAE analysis UI.

---

## 8. UI Placement Plan

### 8.1 TradeInspector — AAE Detail Rows (Phase 1 — already shipped in Phase 1 classification)

Already done: `ClassificationBadge` renders `aae` and `ob_not_occupied` tags in the detail panel. When `armedAfterObExit === true`, the `aae` badge appears. The `supportingFields` metadata in `classificationRegistry.js` already lists the relevant fields.

**Enhancement needed (Phase AAE-1):** When the `aae` or `ob_not_occupied` badge is rendered, expand the detail panel to show the raw supporting values:
- `armed_after_ob_exit` (bool)
- `ob_occupied_at_arm` (bool)  
- `price_distance_from_ob_at_arm_pips` (float)
- `ob_exit_time` (timestamp relative to arm time)
- `arm_candle_index` (int)

### 8.2 RunDetail — Classification Performance Tab (already shipped as Phase 3A)

The Phase 3A "Classification" tab already shows per-tag counts, WR, Net R, and Avg R for `entry_context` including `aae` and `ob_not_occupied`. These will auto-populate once a full-history run with AAE fields is loaded.

**Enhancement needed (Phase AAE-2):** Add a dedicated "AAE Analysis" sub-section within the Classification tab (or as a new tab) showing:
- AAE incidence rate (% of TE trades)
- AAE vs non-AAE performance comparison table (side-by-side)
- Per-delay breakdown: for each delay variant, AAE% and performance delta

### 8.3 RunDetail — AAE Timing Panel (Phase AAE-3)

A new `NeonPanel` in the Classification tab, below the entry_context performance table, showing:
- **Delay window exit position chart** (if d2/d3 data available): bar chart of `ob_exit_lag_pct` buckets, coloured by outcome
- **Price distance at arm** histogram: `price_distance_from_ob_at_arm_pips` distribution, split AAE vs ob_not_occupied
- Table: `aae_distance_band × outcome` cross-tab

UI components: `buildTradeClassification()` already identifies AAE trades. The timing panel calls `buildAAEBreakdown(displayTrades)` — a pure aggregation function following the same pattern as `buildClassificationBreakdown()`.

### 8.4 FailuresWorkspace — AAE Failure Segmentation (Phase AAE-4, optional)

The existing archetype classifier pipeline can accept classification predicates (Phase 2 audit noted this). Adding an AAE filter chip to the `FailuresWorkspace` filter panel would let the user isolate whether failure archetypes (e.g., "invalidated before fill") co-vary with AAE context.

---

## 9. Implementation Phases

### Phase AAE-0: Data — Re-run Full History (Prerequisite)

**Action:** Run backtester with full-history config and `triggered_edge_candle_delays: [0, 1, 2, 3]`.  
**Expected output:** ~930+ TE trades per variant with all AAE fields populated.  
**Blocker:** Until this data exists, AAE sub-analysis has near-zero trade count.

### Phase AAE-1: TradeInspector AAE Detail Expansion

**Files:** `frontend/src/pages/TradeInspector.jsx`  
**Scope:** When `armedAfterObExit === true` or `obOccupiedAtArm === false`, expand the existing Entry Context row to show supporting field values inline.  
**Effort:** Small — add conditional field rows within the existing IIFE classification block.

### Phase AAE-2: RunDetail — AAE Incidence + Performance Table

**Files:** `frontend/src/pages/RunDetail.jsx`  
**Scope:** In the Classification tab's entry_context section, add an AAE incidence panel showing:
  - Per-delay AAE% and ob_not_occupied%
  - AAE vs clean performance delta (WR delta, Net R delta)  
**New helper:** `buildAAEDelayBreakdown(displayTrades)` — pure function, no React.  
**Effort:** Medium — follows `buildClassificationBreakdown()` pattern exactly.

### Phase AAE-3: RunDetail — AAE Timing Panel

**Files:** `frontend/src/pages/RunDetail.jsx` (new sub-section in Classification tab)  
**Scope:** Price distance histogram + exit position table for AAE trades.  
**Prerequisite:** Phase AAE-0 data (need d2/d3 AAE sample ≥ 20 trades to render meaningfully).  
**Effort:** Medium-large — requires bucketing logic + table/chart rendering.

### Phase AAE-4: FailuresWorkspace Integration (Optional)

**Files:** `frontend/src/pages/FailuresWorkspace.jsx`, `frontend/src/hooks/useFailuresWorkspace.js`  
**Scope:** Add `entryContextFilter` to the failures pipeline filter state.  
**Effort:** Small — non-breaking addition to existing filter state.

---

## 10. Files to Read / Edit

### Backtester (Lux-OB-Backtester)

| File | Purpose | Status |
|---|---|---|
| `src/execution.py` | AAE field computation in `_apply_delay_validity_fields()` | Read ✅ |
| `scripts/run_backtest.py` | CSV export pipeline — `trades.to_csv()` with no column filter | Read ✅ |
| `src/run_outputs.py` | Run directory creation only — no field selection | Read ✅ |

No backtester changes needed. Fields are already computed and exported.

### Frontend (FX-OB-Research-Lab)

| File | Purpose | Phase |
|---|---|---|
| `src/data/classificationRegistry.js` | Add `aae_distance_band` sub-tags if bucketing is desired | AAE-3 |
| `src/data/tradeClassificationDims.js` | AAE context detection already complete | — |
| `src/pages/TradeInspector.jsx` | Expand AAE detail rows | AAE-1 |
| `src/pages/RunDetail.jsx` | Add AAE analysis panels to Classification tab | AAE-2, AAE-3 |
| `src/pages/FailuresWorkspace.jsx` | Add AAE filter chip | AAE-4 |
| `src/hooks/useFailuresWorkspace.js` | Add entryContextFilter to filter state | AAE-4 |

---

## 11. Summary

| Question | Answer |
|---|---|
| Are AAE fields computed in the backtester? | **Yes** — `_apply_delay_validity_fields()` in `execution.py` |
| Are they exported to CSV? | **Yes** — `trades.to_csv()` writes all TRADE_COLUMNS, no filter |
| Why were they missing in older runs? | Fields added to TRADE_COLUMNS between 2026-06-04 08:30 and 17:48 |
| Is a fresh backtester run needed? | **Yes** — full-history run needed; current AAE runs cover only ~2.5 months |
| Is structure_tag (BOS/CHoCH) available? | **Yes** — directly in trade CSVs, no join needed |
| Is importer.js ready? | **Yes** — all 4 AAE fields have camelCase + snake_case aliases |
| Is tradeClassificationDims.js ready? | **Yes** — `aae` and `ob_not_occupied` detection already shipping |
| What is the highest-priority action? | Re-run backtester (full history) to generate AAE-field CSV data |
