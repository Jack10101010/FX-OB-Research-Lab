# BE-BACKEND-EXACT-REPLAY-PHASE-2-IMPLEMENT-1.md

**Mode:** IMPLEMENTED + VALIDATED  
**Date:** 2026-06-10  
**Branch:** `main` (Lux-OB-Backtester)  
**Prereqs:** `BE-BACKEND-EXACT-REPLAY-PHASE-0-AUDIT-1.md`, `BE-BACKEND-EXACT-REPLAY-PHASE-1-BACKTESTER-PRE-READ-1.md`

---

## 1. Files Read

| File | Purpose |
|---|---|
| `src/config.py` | BacktestConfig dataclass, field insertion point |
| `src/execution.py` | TRADE_COLUMNS, `_base_trade_row`, `simulate_trades`, active-trade loop, fill-candle path |
| `scripts/run_backtest.py` | `protection_scenarios`, `build_scenario_plan`, run_summary, simulation loop |
| `tests/test_fft_width_gate.py` | Test pattern reference |
| `tests/test_stop_anchored_excursions.py` | Test pattern reference |

---

## 2. Files Changed

| File | Change type | Lines added |
|---|---|---|
| `src/config.py` | Add 5 BE fields to `BacktestConfig` | +11 |
| `src/execution.py` | TRADE_COLUMNS, `_base_trade_row`, `simulate_trades` params, BE logic | +178 |
| `scripts/run_backtest.py` | `be_scenarios()`, `add_be_summary_stats()`, `build_scenario_plan`, run_summary, simulation loop | +150 |
| `tests/test_be_replay.py` | New test file — 12 test cases | +350 |

`src/retest_tracker.py` and `src/retest_tracker_test.py` had pre-existing uncommitted changes unrelated to this work. Not touched.

---

## 3. Config Changes (`src/config.py`)

Added 5 fields to `BacktestConfig` after `retest_failure_threshold` (line 93):

```python
# ── Backend Break-even Exact Replay (Phase 2) ────────────────────────────────
be_enabled: bool = False
be_arm_levels: list[float] = field(default_factory=list)
be_trigger_bases: list[str] = field(default_factory=lambda: ["wick"])
be_stop_buffer_r: float = 0.0
be_delay_candles: int = 0
```

- `be_enabled=False` default → zero new passes when not set
- `be_arm_levels=[]` default → no scenarios generated even if `be_enabled=True` without arm levels
- All fields flow through `load_config_overrides` → `replace(ACTIVE_CONFIG, **overrides)` automatically — no other config changes needed

**Frontend JSON example:**
```json
{
  "be_enabled": true,
  "be_arm_levels": [0.5, 1.0],
  "be_trigger_bases": ["wick", "close"],
  "be_stop_buffer_r": 0.0,
  "be_delay_candles": 0
}
```

---

## 4. Execution Insertion Point

### New fields added to `TRADE_COLUMNS` (end of list, `src/execution.py` line ~196):
```python
"be_scenario_key", "be_arm_level_r", "be_trigger_basis",
"be_armed", "be_arm_candle_index", "be_arm_time",
"be_triggered", "be_exit_reason", "be_exit_r",
"be_exit_price", "be_exit_time", "be_exit_candle_index"
```

### `_base_trade_row` defaults (after ghost fields, `src/execution.py` line ~558):
All 12 fields initialized — string fields `""`, bools `False`. `be_scenario_key`, `be_arm_level_r`, `be_trigger_basis` populated from `analytics_config` for BE runs, blank for non-BE.

### `simulate_trades()` signature (after `commission_r_per_trade`):
```python
be_arm_level_r=None,    # None = disabled
be_trigger_basis="wick",
be_stop_buffer_r=0.0,
be_delay_candles=0,
be_scenario_key="",
```

### Active-trade loop insertion (between protection exit block and `_exit_outcome`):

```
for active_trade in active_trades:
    _update_active_metrics(...)
    if news_flatten: → exit, continue
    if _protection_trigger(): → exit, continue

    ← [BE ARM + STOP CHECK INSERTED HERE] ←

    outcome = _exit_outcome(...)
    if outcome: → exit
    else: keep watching
```

**BE arm logic:**
```python
if _be_enabled and active_trade.get("_be_arm_price") is not None:
    if not row.get("be_armed"):
        armed = (wick: high>=arm for long / low<=arm for short) or (close: same)
        if armed:
            row["be_armed"] = True
            row["be_arm_candle_index"] = candle_index
            active_trade["_be_stop_active_from"] = candle_index + int(be_delay_candles)

    if row.get("be_armed") and candle_index >= active_trade["_be_stop_active_from"]:
        be_stopped = (long: low<=be_stop_price) or (short: high>=be_stop_price)
        if be_stopped:
            → BE_EXIT, continue  # does not fall through to _exit_outcome
```

**Fill-candle path (same-bar arm+stop):** Identical logic also inserted between fill-candle protection check and fill-candle `_exit_outcome`.

**Post-loop annotation:** After `enrich_trades_with_stop_anchored_excursions`, before `pd.DataFrame(trades, columns=TRADE_COLUMNS)`:
```python
if _be_enabled:
    for row in trades:
        if row.get("be_triggered"): continue
        if row.get("fill_time", "") == "": continue
        row["be_exit_reason"] = "armed_not_triggered" if row.get("be_armed") else "never_armed"
```

---

## 5. BE Logic Summary

| Concept | Implementation |
|---|---|
| **Arm price (long)** | `entry + arm_level_r * stop_distance` |
| **Arm price (short)** | `entry - arm_level_r * stop_distance` |
| **BE stop price (long)** | `entry - be_stop_buffer_r * stop_distance` (0 = exact entry) |
| **BE stop price (short)** | `entry + be_stop_buffer_r * stop_distance` |
| **Wick trigger** | long: `candle.high >= arm_price`; short: `candle.low <= arm_price` |
| **Close trigger** | long: `candle.close >= arm_price`; short: `candle.close <= arm_price` |
| **Delay** | `_be_stop_active_from = arm_candle_index + be_delay_candles`; stop check only when `candle_index >= _be_stop_active_from` |
| **Same-candle rule** | Arm and stop on same candle → conservative: BE triggered (matches `_exit_outcome` stop-wins semantics) |
| **BE exit R** | `(be_stop_price - entry) / risk` (long) or `(entry - be_stop_price) / risk` (short). With buffer=0, this is ≈ 0. |
| **Outcome** | `"BE_EXIT"` — distinct from `"WIN"` / `"LOSS"` / `"PROTECTION_EXIT"` |
| **Gate** | `be_arm_level_r=None` → `_be_enabled=False` → zero overhead, zero behavior change |

**Price computation is per-trade at fill.** Arm/stop prices are derived from each trade's individual `entry` and `stop`. They are stored on the `active_trade` dict (`_be_arm_price`, `_be_stop_price`, `_be_stop_active_from`) and never mutate the row until BE fires.

---

## 6. Export / Summary Behavior

### CSV output
- `trades_{execution_mode}__be_wick_0p50R.csv` — one file per scenario
- 12 `be_*` columns present in every row (blank/False for non-filled, non-BE-exit rows)
- `be_exit_reason` annotated for all filled trades: `"be_stop"` | `"armed_not_triggered"` | `"never_armed"`
- Unfilled / cancelled rows: all `be_*` fields blank/False (no annotation)

### `summary.json`
```json
{
  "be_results": {
    "single_position": {
      "be_wick_0p50R": {
        "be_scenario_key": "be_wick_0p50R",
        "be_arm_level_r": 0.5,
        "be_trigger_basis": "wick",
        "be_stop_buffer_r": 0.0,
        "be_delay_candles": 0,
        "be_exit_count": 5,
        "losses_saved": 3,
        "winners_cut": 2,
        "armed_not_triggered": 0,
        "never_armed": 4,
        "loser_r_saved": ...,
        "winner_r_cost": ...,
        "efficiency_ratio": ...,
        "delta_net_r": ...,
        "filled_trades": 9,
        "net_r": ...,
        ...all standard summarize_trades fields...
      }
    }
  }
}
```

- `be_results` is top-level, not inside `protection_results`
- `protection_results` is completely unchanged

---

## 7. Tests Added

**File:** `tests/test_be_replay.py` — 12 test cases, 50 assertions

| # | Test | Assertion |
|---|---|---|
| 1 | Baseline unchanged (be_arm_level_r=None) | outcomes identical, be_* blank/false |
| 2 | Long loser saved by wick-trigger BE | BE_EXIT, be_triggered, pnl_r≈0, baseline was LOSS |
| 3 | Short loser saved by wick-trigger BE | BE_EXIT, be_triggered, pnl_r≈0 |
| 4 | Winner cut by BE | baseline WIN → BE_EXIT |
| 5 | Armed but not triggered | WIN preserved, be_armed=True, be_triggered=False, be_exit_reason=armed_not_triggered |
| 6 | Never armed | LOSS, be_armed=False, be_exit_reason=never_armed |
| 7 | Wick vs close trigger | wick: armed, close: not armed on same candle data |
| 8 | Delay candles | arm at candle 2, exit at candle 3 (delay=1) |
| 9 | Same-candle arm + stop | BE triggered (conservative stop-wins) |
| 10 | All 12 be_* fields in TRADE_COLUMNS and DataFrame | Column presence check for BE and non-BE runs |
| 11 | Summary counts consistent | be_exit_count + armed_not_triggered + never_armed == filled_count |
| 12 | Protection mode unaffected | PROTECTION_EXIT outcomes unchanged when be_arm_level_r=None |

---

## 8. Validation Results

### Unit tests
```
test_be_replay.py:               50 passed, 0 failed
test_stop_anchored_excursions.py: 29 passed, 0 failed
test_fft_width_gate.py:           6 passed, 0 failed
```

### Real backtest smoke test

Config: `start_date=2025-01-01`, `end_date=2025-02-01`, `be_enabled=True`, `be_arm_levels=[0.5, 1.0]`, `be_trigger_bases=["wick", "close"]`, `execution_modes=["single_position"]`.

**4 BE CSV files generated:**
- `trades_single_position__be_wick_0p50R.csv`
- `trades_single_position__be_close_0p50R.csv`
- `trades_single_position__be_wick_1p00R.csv`
- `trades_single_position__be_close_1p00R.csv`

**`be_wick_0p50R` sample results (9 filled trades):**
- `be_exit_count: 5` — 5 trades exited via BE stop
- `losses_saved: 3` — 3 baseline LOSS trades converted to BE_EXIT at ≈0R
- `winners_cut: 2` — 2 baseline WIN trades cut early by BE stop
- `never_armed: 4` — 4 trades stopped out before reaching arm level
- `armed_not_triggered: 0` — 0 armed trades survived to WIN without BE stop
- `delta_net_r: -3.6` — for this small window, cutting 2 winners outweighed saving 3 losers

**Baseline unchanged:** Baseline CSV `be_triggered=False` for all rows, `be_scenario_key` all null. Confirmed baseline outputs identical before and after this implementation.

**12 be_* columns present** in all BE CSV outputs. ✓  
**`be_results` present in `summary.json`** with correct structure. ✓

---

## 9. Known Limitations

### `"BE_EXIT"` is a new outcome value
Frontend code filtering `outcome == "WIN"` or `outcome == "LOSS"` will NOT count BE exits. This is correct semantics. The frontend importer must be updated to map `"BE_EXIT"` to its own outcome category. This is a deferred frontend task.

### BE and protection cannot be combined yet
BE scenarios always use `protection_mode="baseline"`. The interaction (should OB penetration exit fire before BE arms?) is not modelled. Combining BE + penetration protection is a Phase 3 question.

### be_exit_reason is blank for unfilled/cancelled rows
`NEWS_TOUCH_CANCEL`, `UNFILLED`, `NEWS_BLACKOUT`, `INVALID` etc. all leave `be_exit_reason` as an empty string. This is intentional — BE state is only meaningful for filled trades.

### `be_exit_r` shows as NaN in pandas for unfilled rows
CSV stores `""` for be_exit_r on non-BE-exit rows. When read back with pandas, numeric-leaning columns with mixed `""` and float will show `NaN`. This is standard pandas behavior. Values are correct.

### No parallel execution for BE scenarios yet
`parallel_scenarios=True` is not wired up for BE scenarios. They always run serially. Given BE scenarios are fast (same candle data, minimal extra overhead), this is low priority.

---

## 10. Next Frontend Integration Step

The BE backend is now complete. To surface results in the UI:

1. **`sidecarClient.js`**: Add `be_enabled`, `be_arm_levels`, `be_trigger_bases`, `be_stop_buffer_r`, `be_delay_candles` to the config serialization sent to the sidecar. These already flow through `load_config_overrides` → `replace(ACTIVE_CONFIG)` without any server-side changes.

2. **Bundle importer**: Add `be_results` parsing alongside `protectionTradesByMode`. Route `trades_*__be_*.csv` files to `beTradesByMode`. Handle `"BE_EXIT"` as a new outcome category.

3. **`BreakevenTab.jsx`**: Wire the `beTradesByMode` data into the existing UI instead of computing results from raw trades. The backend `be_exit_reason` field (`be_stop` | `armed_not_triggered` | `never_armed`) replaces the frontend's per-trade recomputation.

4. **Outcome mapping**: Map `"BE_EXIT"` → display category. Options: (a) show as its own outcome `"BE_EXIT"` distinct from WIN/LOSS, or (b) map `pnl_r > 0` → WIN, `pnl_r == 0` → BREAKEVEN, `pnl_r < 0` → LOSS — then the `be_triggered=True` flag distinguishes them from original exits.

The backend EXACT tier now produces: 1-min candle precision, spread/news/conflict modelling, and per-trade arm/stop state — all unavailable in the frontend REPLAY tier.

---

*Implementation completed: 2026-06-10. Tests: 85/85 passing.*
