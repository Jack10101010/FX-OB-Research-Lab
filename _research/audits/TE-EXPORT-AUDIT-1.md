# TE-EXPORT-AUDIT-1 — Triggered-Edge Export Pipeline Audit

**MODE: AUDIT ONLY — no files modified, no engine changes, no implementation**  
**Date:** 2026-06-05  
**Auditor:** Claude (Cowork)  
**Prerequisites:** TE-DELAY-VALIDITY-1.md, TE-DELAY-VALIDITY-2.md  
**Repos audited:** Lux-OB-Backtester (`src/execution.py`, `src/run_outputs.py`, `scripts/run_backtest.py`)

---

## 1. Scope

Before generating any new TE validation runs, this audit answers four questions:

1. Are the 8 required TE fields currently exported to trade CSVs?
2. If not exported: are they computed internally, where, and under what variable names?
3. Which fields (if any) would need to be added to run the TE-DELAY-VALIDITY-2 validation script?
4. If a TE `_next` run is generated right now, will the output data be sufficient for validation?

The 8 required fields (from TE-DELAY-VALIDITY-2):

| # | Field |
|---|-------|
| 1 | `trigger_time` |
| 2 | `edge_revisit_time` |
| 3 | `trigger_candle_index` |
| 4 | `armed_at` |
| 5 | `armed_on_trigger_candle` |
| 6 | `filled_on_trigger_candle` |
| 7 | `trigger_penetration_pct` |
| 8 | `entry_model_filled` |

---

## 2. Files Audited

| File | Lines | Role |
|------|-------|------|
| `src/execution.py` | 2199 | Core simulation engine. Defines `TRADE_COLUMNS`, builds and exports the trades DataFrame |
| `src/run_outputs.py` | 41 | Thin utility: `make_run_id()`, `create_run_output_dir()`, `save_config()`, `save_summary()`. **No CSV writing here.** |
| `scripts/run_backtest.py` | 2866 | Orchestrator. Calls `simulate_trades()`, writes CSV via `trades.to_csv()` |

---

## 3. CSV Write Pipeline

The export path is straightforward and has no intermediate filtering:

```
simulate_trades()                           [execution.py line 1780]
  → pd.DataFrame(trades, columns=TRADE_COLUMNS)
  → returned as `trades` DataFrame

run_backtest.py main() / execute_scenario_job()
  → trades.to_csv(output_file, index=False)  [lines 2505–2506, 2736–2737, 2571–2572]
  → trades.to_csv(run_output_file, index=False)
```

**Key implication:** `TRADE_COLUMNS` is the authoritative and complete column list. Any field present in `TRADE_COLUMNS` and assigned a value anywhere in `simulate_trades()` will appear in the output CSV. There is no post-simulation column filtering, no allowlist pruning, no column drop step between DataFrame construction and `to_csv()`.

Output file naming for a TE `_next` run:  
`trades_{execution_mode}__entry_triggered_edge_{threshold_key}_next.csv`

The `triggered_edge_delay_candles` parameter is passed from config through `execute_scenario_job()` (line 1713) and the sequential path (line 2698) directly into `simulate_trades()`.

---

## 4. TRADE_COLUMNS — All 8 Required Fields

`TRADE_COLUMNS` is defined at lines 11–167 of `execution.py`. All 8 required TE validation fields are present:

| Field | In TRADE_COLUMNS | Computed In | Variable / Assignment |
|-------|:----------------:|-------------|----------------------|
| `trigger_time` | ✅ | `simulate_trades()` hot path | `item["trigger_time"] = candle["time"]` (line ~1572) |
| `edge_revisit_time` | ✅ | `_apply_triggered_edge_metadata()` | `row["edge_revisit_time"] = row["fill_time"]` (line ~880) |
| `trigger_candle_index` | ✅ | `simulate_trades()` hot path | `item["trigger_candle_index"] = candle_index` (line ~1573) |
| `armed_at` | ✅ | `simulate_trades()` hot path | `item["armed_at"] = candle["time"]` (line ~1574) |
| `armed_on_trigger_candle` | ✅ | `simulate_trades()` hot path | `item["armed_on_trigger_candle"] = True` (line ~1575) |
| `filled_on_trigger_candle` | ✅ | `_apply_triggered_edge_metadata()` | `row["fill_candle_index"] == item["trigger_candle_index"]` (line ~872) |
| `trigger_penetration_pct` | ✅ | `_apply_triggered_edge_metadata()` | from `plan["threshold_pct"]` (line ~866) |
| `entry_model_filled` | ✅ | `_apply_triggered_edge_metadata()` | set from fill outcome (line ~887) |

**All 8 fields are exported. None require implementation.**

### Trigger Arming — Exact Code (execution.py lines 1568–1582)

```python
if plan.get("entry_model") == "triggered_edge" and not item.get("triggered_edge_armed", False):
    if _triggered_edge_touched(ob, plan, candle):
        item["triggered_edge_armed"] = True
        item["trigger_time"] = candle["time"]
        item["trigger_candle_index"] = candle_index
        item["armed_at"] = candle["time"]
        item["armed_on_trigger_candle"] = True
        item["armed_same_candle"] = True
        _delay_window_init(item)

if plan.get("entry_model") == "triggered_edge" and item.get("triggered_edge_armed", False):
    _delay_window_update(item, ob, candle, candle_index, pip_size)
```

---

## 5. Bonus Finding — Delay Validity Fields Already Implemented

The TE-DELAY-VALIDITY-1 audit recommended 14 instrumentation fields to track the armed-after-ob-exit scenario. **All of these are already implemented in production code.** This was not anticipated.

### _dw State Dictionary — Initialized by `_delay_window_init()` (lines 665–684)

```python
item["_dw"] = {
    "finalized": False,
    "exited": False,
    "exit_candle_index": None,
    "exit_time": None,
    "window_min": None,
    "window_max": None,
    "arm_candle_index": None,
    "ob_occupied_at_arm": None,
    "armed_after_ob_exit": None,
    "price_distance_from_ob_at_arm_pips": None,
}
```

### `_dw_entry_side_exit()` (lines 641–653)

Checks whether a candle fully exits the OB through the entry side — the exact condition identified as unguarded in TE-DELAY-VALIDITY-1:

```python
# Bullish OB: entry side = top. Exit = candle.low > ob.top
# Bearish OB: entry side = bottom. Exit = candle.high < ob.bottom
```

### `_delay_window_update()` (lines 687–741)

Called every candle while `triggered_edge_armed` is True. Tracks OHLC range of the delay window, detects entry-side exit, records `exit_candle_index` and `exit_time`, and finalizes on the arm candle.

### `_apply_delay_validity_fields()` (lines 744–813)

Writes the `_dw` state to the export row. The following columns are in `TRADE_COLUMNS` and will appear in the output CSV:

| Column | Description |
|--------|-------------|
| `armed_after_ob_exit` | True if price exited OB through entry side before order armed |
| `exited_ob_before_arm` | True if any entry-side exit occurred in the delay window |
| `ob_occupied_at_arm` | True if price was inside OB when arm candle started |
| `price_distance_from_ob_at_arm_pips` | Distance from OB entry edge at arm candle |
| `delay_window_exit_candle_index` | Candle index of entry-side exit event |
| `delay_window_exit_time` | Timestamp of entry-side exit |
| `delay_window_arm_candle_index` | Candle index when order armed |
| `delay_window_min` | Candle range low of delay window |
| `delay_window_max` | Candle range high of delay window |

The critical flag `armed_after_ob_exit` — the exact variable needed to identify TE-DELAY-VALIDITY-1's "Likely Bug" scenario — **is already being computed and exported.**

---

## 6. Field Export Status — Complete Summary

### 8 Required TE Validation Fields

| Field | Exported | Notes |
|-------|:--------:|-------|
| `trigger_time` | ✅ | Set at trigger detection candle |
| `edge_revisit_time` | ✅ | Aliased to `fill_time` at export |
| `trigger_candle_index` | ✅ | 15-min detection TF index (aligned to candles.csv) |
| `armed_at` | ✅ | Same as `trigger_time` for delay=0; delay>0 semantics TBD |
| `armed_on_trigger_candle` | ✅ | True when order arms on same candle as trigger |
| `filled_on_trigger_candle` | ✅ | True when fill_candle_index == trigger_candle_index |
| `trigger_penetration_pct` | ✅ | From scenario threshold config |
| `entry_model_filled` | ✅ | Marks TE fills vs. cancelled/missed |

### Delay Validity Fields (Recommended in TE-DELAY-VALIDITY-1, Pre-implemented)

| Field | Exported | Notes |
|-------|:--------:|-------|
| `armed_after_ob_exit` | ✅ | **The key bug-detection flag** |
| `exited_ob_before_arm` | ✅ | Entry-side exit detected in delay window |
| `ob_occupied_at_arm` | ✅ | OB price presence at arm moment |
| `price_distance_from_ob_at_arm_pips` | ✅ | Numeric displacement at arm |
| `delay_window_exit_candle_index` | ✅ | Entry-side exit candle |
| `delay_window_exit_time` | ✅ | Entry-side exit timestamp |
| `delay_window_arm_candle_index` | ✅ | Arm event candle |
| `delay_window_min` / `delay_window_max` | ✅ | Full OHLC range of delay window |

### Fields Absent from Current Existing Bundles (Not a New Export Gap)

The following fields are absent from existing run bundles (e.g., `test_import_bundle/trades_single_position.csv`) because those were generated before the TE entry model was added. They will be present in any new TE run:

- All 8 required fields above
- All delay validity fields above

There are **no missing exports** for a new TE run.

---

## 7. Note on `armed_at` Semantics for delay > 0

For `delay=0`, `armed_at` is set on the trigger candle: `item["armed_at"] = candle["time"]` (same candle as `trigger_time`).

For `delay >= 1`, the arm event occurs on a later candle. The `_delay_window_update()` function sets `_dw["arm_candle_index"]` when the delay window finalizes. However, the top-level `item["armed_at"]` may retain the trigger-candle timestamp. The `delay_window_arm_candle_index` field in `_dw` is the authoritative arm-candle reference for delay > 0.

**Action item (not blocking GO):** When running the TE-DELAY-VALIDITY-2 validation script, use `delay_window_arm_candle_index` rather than `trigger_candle_index` as the upper bound of the delay window scan for delay >= 1 runs.

---

## 8. GO / NO-GO Verdict

**VERDICT: GO**

All 8 required fields for the TE-DELAY-VALIDITY-2 validation script are exported in every TE run. Additionally, the armed-after-ob-exit detection logic (the core subject of TE-DELAY-VALIDITY-1) is already fully implemented: `armed_after_ob_exit`, `exited_ob_before_arm`, `ob_occupied_at_arm`, and all supporting delay-window fields will appear in the output CSV without any engine changes.

A TE `_next` run can be generated immediately. The output CSV will contain everything required to:

1. Run the TE-DELAY-VALIDITY-2 validation query
2. Directly read `armed_after_ob_exit` to identify trades that filled on a structurally exited OB
3. Cross-reference with candles.csv (timestamp-based join, confirmed feasible in TE-DELAY-VALIDITY-2)

**No engine changes, no export changes, and no additional instrumentation are required before generating the run.**

---

## 9. Recommended First Query Post-Run

Once the TE `_next` CSV exists, the minimum validation query is:

```python
import pandas as pd

trades = pd.read_csv("trades_single_position__entry_triggered_edge_25_next.csv")

te_filled = trades[trades["entry_model_filled"] == True]
print(f"Total TE filled trades: {len(te_filled)}")

armed_after_exit = te_filled[te_filled["armed_after_ob_exit"] == True]
print(f"Trades armed after OB exit: {len(armed_after_exit)}")
print(f"Rate: {len(armed_after_exit)/len(te_filled)*100:.1f}%")

# Outcome breakdown
print(armed_after_exit["outcome"].value_counts())
print(f"Net R (armed_after_exit): {armed_after_exit['pnl_r'].sum():.2f}")
print(f"Net R (clean): {te_filled[te_filled['armed_after_ob_exit'] != True]['pnl_r'].sum():.2f}")
```

This will immediately quantify whether the TE-DELAY-VALIDITY-1 "Likely Bug" scenario is degrading performance in practice.

---

*End of TE-EXPORT-AUDIT-1. No files were modified. Next step: generate TE `_next` run.*
