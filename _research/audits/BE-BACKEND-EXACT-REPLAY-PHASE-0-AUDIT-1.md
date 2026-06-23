# BE-BACKEND-EXACT-REPLAY-PHASE-0-AUDIT-1.md

**Mode:** AUDIT ONLY — no code written, no files changed.
**Date:** 2026-06-10 · **Branch:** `codex-dev`
**Goal:** Find the exact place in the Lux-OB-Backtester to add backend exact BE replay
using 1-minute (or highest available) candle execution.

**Important constraint:** Lux-OB-Backtester repo is NOT accessible in the sandbox.
All findings are derived from prior audit documents in FX-OB-Research-Lab.
Anything not verifiable from those docs is explicitly flagged as **NOT CONFIRMED**.

---

## 1. Files Read

### Prior audit documents:

| Document | Relevant content |
|---|---|
| `AUTO-PAIR-CONTROL-RUNS-2-BACKEND-AUDIT.md` | Exact `run_backtest.py` line numbers; `build_scenario_plan` (lines 855–904); sequential loop (lines 2673–2718); parallel path (`execute_scenario_job` lines 1701–1738); `run_summary` init (lines 2400–2412); `save_summary` call (line 2853) |
| `BE-REPLAY-PROTECTION-ARCHITECTURE-AUDIT-1.md` | Two-phase architecture spec; protection field patterns; Option C backend exact design; BE candle-walk algorithm; same-candle ambiguity handling |
| `BE-REPLAY-PHASE-0-EXPORT-FIELD-AUDIT-1.md` | 58 trade columns confirmed; absolute `fill_candle_index` finding; time-based lookup verified; candle walk Python simulation results |
| `BE-REPLAY-V1-RESEARCH-VALIDATION-1.md` | Frontend REPLAY results; arm-level sweep data; defines EXACT tier as "tick/1-min" backend target |
| `DIRECTIONAL-ENTRY-1-audit.md` / `DIRECTIONAL-ENTRY-3-audit.md` | `simulate_trades()` full signature; `_direction_allowed()`; `_can_fill_trade()`; `entry_model` parameter routing |
| `FULL-PIPELINE-INTEGRITY-AUDIT-1.md` | Config propagation; sidecar architecture; `protection_results` field in `run_summary` |
| `DISTANCE-AT-ARM-BACKEND-SPEC.md` | `BacktestConfig` frozen dataclass pattern; confirmed no runtime field mutation |
| `test_import_bundle/trades_single_position.csv` | 58-column schema; existing protection fields; absolute candle index values (e.g. 11636, 369232) |

### Backtester source files (NOT directly accessible — knowledge from audit docs only):

| File | Confirmed role |
|---|---|
| `scripts/run_backtest.py` | Primary orchestrator — scenario plan, execution loops, CSV export, summary |
| `src/execution.py` | `simulate_trades()`, `TRADE_COLUMNS`, `_apply_delay_validity_fields()` |
| `src/config.py` | Frozen `BacktestConfig` dataclass — all run parameters |
| `src/run_outputs.py` | `save_summary()` — writes `summary.json` |

---

## 2. Execution Flow Summary

The full scenario execution pipeline in `run_backtest.py`:

```
build_scenario_plan(config)
  └── for execution_mode in config.execution_modes:
        for scenario in protection_scenarios(config):   # → baseline + penetration variants
            append plan item (kind="protection")
        for scenario in entry_scenarios(config):        # → TE/standard entry variants
            append plan item (kind="entry")

─── sequential path (when parallel=False) ───────────────────────────────────────────
  for scenario in protection_scenarios(config):
      trades = simulate_trades(candles, order_blocks, protection_mode=..., protection_threshold_pct=..., ...)
      mode_summary = summarize_trades(order_blocks, trades)
      trades.to_csv(output_file, index=False)          # ← no column filtering; new columns auto-export
      run_summary["protection_results"][key] = mode_summary

  for scenario in entry_scenarios(config):
      trades = simulate_trades(candles, order_blocks, entry_model=..., ...)
      ...
      trades.to_csv(output_file, index=False)
      run_summary["entry_results"][key] = mode_summary

  save_summary(run_summary, run_output_dir)            # line 2853 → writes summary.json

─── parallel path ────────────────────────────────────────────────────────────────────
  execute_scenario_job() called per job in ProcessPoolExecutor
  Results integrated by kind: "protection" → run_summary["protection_results"]
                               "entry"     → run_summary["entry_results"]
```

### Key structural observations:

**Protection scenarios call `simulate_trades()` directly.** Each `protection_scenarios(config)` item produces a fresh simulation pass with `protection_mode` and `protection_threshold_pct` injected as kwargs. Protection logic (stop/cancel rules) is implemented *inside* `simulate_trades()` / `execution.py` during the candle walk — it is NOT post-simulation processing.

**This means BE exact replay must also be integrated inside `simulate_trades()`.** BE is a stop-management rule (move stop to entry after arm level reached) — it activates and resolves during the intra-trade candle walk. It cannot be applied post-hoc to a completed trade DataFrame without re-running the walk.

**Export is unconditional.** `trades.to_csv(output_file, index=False)` writes all columns. Any new fields added to trade rows by `simulate_trades()` or `execution.py` will appear in the output CSV automatically.

**`run_summary["protection_results"]` is the receiving dict.** BE scenario summaries should write here (or a new `be_results` sibling key), following the same structure as protection summaries.

---

## 3. Exact Insertion Point

### Primary file: `scripts/run_backtest.py`

**Insertion point A — `protection_scenarios(config)` function**

This function (exact line numbers NOT CONFIRMED from docs) generates the list of scenario dicts for baseline + penetration scenarios. BE scenarios should be added here as additional items when BE is configured.

Proposed addition to `protection_scenarios(config)`:
```python
# After yielding existing protection items:
if getattr(config, "be_enabled", False):
    for arm_level_r in config.be_arm_levels:         # e.g. [0.25, 0.5, 0.75, 1.0]
        for trigger_basis in config.be_trigger_bases: # e.g. ["wick", "close"]
            key = f"be_{trigger_basis}_{str(arm_level_r).replace('.', 'p')}R"
            yield {
                "mode":               "be_replay",
                "key":                key,
                "protection_mode":    "be_replay",
                "be_arm_level_r":     arm_level_r,
                "be_trigger_basis":   trigger_basis,
                "output_file":        f"trades_{{execution_mode}}__{key}.csv",
            }
```

**Insertion point B — `src/execution.py` → `simulate_trades()`**

The exact location within `simulate_trades()` where the per-trade candle walk exits (SL/TP check loop) is **NOT CONFIRMED from docs**. The existing protection check (`protection_mode`, `protection_threshold_pct`) presumably sits inside or adjacent to this exit loop.

BE stop management must be added at the same level: after the trade fills, for each subsequent candle, check whether BE arm has triggered and whether the BE stop has been hit.

Structural position (inferred):
```
simulate_trades() outer loop:
  for each order_block:
    → fill logic (_can_fill_trade)
    → for each candle after fill:
        → [EXISTING] check protection_threshold_pct penetration → cancel/exit
        → [NEW] if protection_mode == "be_replay":
                    check arm level → if reached, mark be_armed = True
                    if be_armed: check be_stop_price → if hit, exit here (be_triggered)
        → check SL → exit
        → check TP → exit
```

**Insertion point C — `src/config.py` → `BacktestConfig`**

Add new config fields (frozen dataclass — requires thaw or new fields at definition):
```python
be_enabled:       bool = False
be_arm_levels:    tuple = (0.5,)          # R multiples
be_trigger_bases: tuple = ("wick",)        # "wick" | "close"
be_stop_buffer_r: float = 0.0             # buffer above entry (0 = exact entry)
```

**NOT CONFIRMED:** Whether `BacktestConfig` uses `@dataclass(frozen=True)` or a mutable pattern. Prior docs confirm it is a frozen dataclass — new fields must be added at definition, not patched at runtime.

**Insertion point D — `scripts/run_backtest.py` → `run_summary` init (lines 2400–2412)**

Add `"be_results": {}` to the `run_summary` dict literal, parallel to `"protection_results"`.

---

## 4. BE Scenario Design

### Scenario parameter space

| Parameter | Values | Notes |
|---|---|---|
| `be_arm_level_r` | 0.25, 0.5, 0.75, 1.0, custom | R multiple above entry for longs; below for shorts |
| `be_trigger_basis` | `"wick"` / `"close"` | Wick: candle H/L touches arm. Close: candle close crosses arm |
| `be_stop_buffer_r` | 0.0 (default) | 0 = exact entry; >0 = entry + buffer |
| `be_stop_level` | derived from entry + buffer | `be_stop = entry − (be_stop_buffer_r × stop_distance)` for longs |

### Arm price derivation (same as frontend engine)

```python
stop_distance = abs(entry_price - sl_price)
arm_price_long  = entry_price + (be_arm_level_r * stop_distance)
arm_price_short = entry_price - (be_arm_level_r * stop_distance)
be_stop_long    = entry_price - (be_stop_buffer_r * stop_distance)
be_stop_short   = entry_price + (be_stop_buffer_r * stop_distance)
```

### Per-trade candle-walk logic (backend version)

```python
be_armed = False
be_arm_candle_index = None
be_arm_time = None

for candle in candles_after_fill:
    # Check arm trigger
    if not be_armed:
        if trigger_basis == "wick":
            armed = (direction == "long"  and candle.high >= arm_price) or
                    (direction == "short" and candle.low  <= arm_price)
        else:  # "close"
            armed = (direction == "long"  and candle.close >= arm_price) or
                    (direction == "short" and candle.close <= arm_price)
        if armed:
            be_armed = True
            be_arm_candle_index = candle.index
            be_arm_time = candle.time

    # If armed, check BE stop
    if be_armed:
        be_stopped = (direction == "long"  and candle.low  <= be_stop_price) or
                     (direction == "short" and candle.high >= be_stop_price)
        if be_stopped:
            # Exit at BE stop — same-candle handling:
            # If arm and stop hit on the same candle: check TP too
            tp_hit = (direction == "long" and candle.high >= tp) or
                     (direction == "short" and candle.low <= tp)
            if tp_hit and be_arm_candle_index == candle.index:
                # Same-candle ambiguity — conservative: BE stop wins
                # (this matches frontend engine behaviour)
                pass  # fall through to BE stop exit below
            elif tp_hit:
                break  # TP hit before BE stop; original winner stands
            # BE exit
            be_triggered = True
            be_exit_price = be_stop_price
            be_exit_time = candle.time
            be_exit_candle_index = candle.index
            break

    # Normal SL/TP checks (unchanged)
    ...
```

### Per-trade outcome classification

| Outcome key | Condition |
|---|---|
| `"never_armed"` | Price never reached arm level |
| `"armed_not_triggered"` | Armed but original SL/TP resolved before retrace to BE stop |
| `"loss_saved"` | Was a loser; BE stop triggered → exit ~0R instead of −1R |
| `"winner_cut"` | Was a winner; BE stop triggered before TP → cut from +NR to ~0R |
| `"original_winner"` | Winner; BE armed but TP hit before retrace (or never armed) |

---

## 5. Export Field Design

12 new per-trade fields, mirroring the existing `protection_*` field naming convention:

| Field | Type | Description | Parallel protection field |
|---|---|---|---|
| `be_scenario_key` | string | e.g. `"be_wick_0p5R"` | `protection_mode` |
| `be_arm_level_r` | float | Arm level in R (e.g. `0.5`) | `protection_threshold_pct` |
| `be_trigger_basis` | string | `"wick"` or `"close"` | — |
| `be_armed` | bool | True if price reached arm level | — |
| `be_arm_candle_index` | int/null | Candle index when BE armed | — |
| `be_arm_time` | timestamp/null | Timestamp when BE armed | `protection_trigger_time` |
| `be_triggered` | bool | True if BE stop actually executed | — |
| `be_exit_reason` | string/null | `"be_stop"` / `"armed_not_triggered"` / `"never_armed"` | `protection_exit_reason` |
| `be_exit_r` | float/null | Realized R at BE exit (≈0 for entry mode) | — |
| `be_exit_price` | float/null | Exact price at BE exit | `protection_exit_price` |
| `be_exit_time` | timestamp/null | Timestamp of BE exit | — |
| `be_exit_candle_index` | int/null | Candle index at BE exit | — |

### Null rules

- `be_arm_candle_index`, `be_arm_time` → null when `be_armed = False`
- `be_exit_r`, `be_exit_price`, `be_exit_time`, `be_exit_candle_index` → null when `be_triggered = False`
- `be_exit_reason` → one of the 5 outcome keys above; null only for unfilled trades

### Summary fields for `run_summary["be_results"][key]`

Following the `protection_results` summary pattern:

| Summary field | Definition |
|---|---|
| `net_r` | Sum of per-trade BE-adjusted R |
| `delta_net_r` | `net_r − baseline_net_r` |
| `be_exit_count` | Trades where `be_triggered = True` |
| `losses_saved` | Trades with `be_exit_reason = "loss_saved"` |
| `winners_cut` | Trades with `be_exit_reason = "winner_cut"` |
| `armed_not_triggered` | Trades with `be_exit_reason = "armed_not_triggered"` |
| `never_armed` | Trades where `be_armed = False` |
| `arm_rate_pct` | `(losses_saved + winners_cut + armed_not_triggered) / filled_trades * 100` |
| `efficiency_ratio` | `loser_r_saved / winner_r_cost` (>1 = worthwhile) |
| `max_drawdown` | Max equity drawdown under BE scenario (R) |
| `delta_max_drawdown` | `max_drawdown − baseline_max_drawdown` |
| `same_candle_ambiguous_count` | Trades where arm and stop hit same candle (conservative: stop wins) |

---

## 6. Risks

### CRITICAL — 1-minute candle availability is NOT CONFIRMED

**The single most important open question of this audit.**

The user spec states "1-minute candle execution." The exported `candles.csv` is confirmed as 15-minute bars. The `simulate_trades(candles, order_blocks, ...)` parameter receives whatever candle series the backtester loads. Whether the backtester loads 1-min data internally (separately from the 15-min export) is **unknown from docs alone**.

**Implications by case:**

| If backtester uses... | Then backend EXACT tier gives... | Uplift vs frontend REPLAY |
|---|---|---|
| 15-min bars only | Same candle resolution as frontend | Better spread modelling, news flattening — no resolution improvement |
| 1-min bars internally | True 1-min exact execution | Significant uplift: arm/stop ordering within the 15-min window resolved |
| Tick data | Tick-exact | Full fidelity |

**Required action before implementation:** Read `scripts/run_backtest.py` to find where candle data is loaded (likely `load_candles()` or similar), check the data source path, confirm interval. This requires direct backtester repo access.

---

### HIGH — `simulate_trades()` internals must be read before modifying

The exact structure of the candle walk loop inside `simulate_trades()` in `src/execution.py` is NOT confirmed from docs. The docs confirm the function signature and that it accepts protection kwargs, but the internal per-candle state machine is unread. Incorrectly inserting BE logic at the wrong point in the execution order could:
- Apply BE checks before position conflicts are resolved (multi-position mode)
- Apply BE before news blackout flattening (exit at news time rather than BE stop)
- Misorder BE stop vs SL in the same candle

**Required action:** Read `src/execution.py` `simulate_trades()` fully before writing any code.

---

### HIGH — `BacktestConfig` is a frozen dataclass

`BacktestConfig` in `src/config.py` is confirmed frozen. New config fields (`be_enabled`, `be_arm_levels`, `be_trigger_bases`, `be_stop_buffer_r`) must be added to the dataclass definition with default values. They cannot be set at runtime outside the constructor.

Additionally: the sidecar serialization path (`StrategyBuilder.jsx` → `sidecarClient.js` → `server.py` → `BacktestConfig`) must be extended to pass the new fields. If the field is added to `BacktestConfig` but not serialized from the frontend, it will silently use the default (likely `be_enabled=False`) and generate no BE scenarios.

---

### MEDIUM — Protection scenarios called per execution_mode

`build_scenario_plan` wraps `protection_scenarios(config)` inside `for execution_mode in config.execution_modes`. This means BE scenarios will run for EACH execution mode (`single_position`, `allow_multi_position`, `one_per_direction`). For 4 arm levels × 2 trigger bases × 3 execution modes = **24 additional simulation passes** per run. This is acceptable but the user should be able to gate BE generation (the `be_enabled` flag handles this).

---

### MEDIUM — Frontend importer needs `be_*` field mapping

The frontend `importer.js` currently has no mappings for `be_scenario_key`, `be_arm_level_r`, `be_triggered`, etc. The trade CSV will contain these columns once the backend exports them, but they will be silently dropped on import until importer.js is updated.

This is a deferred frontend task (Phase 2 of the roadmap). The backend can be implemented first; the frontend upgrade is independent.

---

### MEDIUM — Same output filename pattern conflict risk

Protection scenarios use `trades_{execution_mode}__penetration_{N}p{D}.csv`. BE scenarios would use `trades_{execution_mode}__be_{trigger}_{N}p{D}R.csv`. Both match the `is_bundle_artifact` filter in `sidecar/server.py`. The frontend `detectFileKind` in `importer.js` must be updated to recognize `__be_` prefix files and route them to `beTradesByMode`, NOT to `protectionTradesByMode` or the primary trades set.

---

### LOW — Same-candle arm + stop ambiguity

At 15-min resolution (and even at 1-min), a single candle can have its high above the arm level AND its low at/below the BE stop price. The ordering within the candle is unknown.

**Design decision:** Use conservative assumption (same as frontend engine) — if arm and stop both occur on the same candle, treat BE stop as triggered. This slightly underestimates benefits (some winners counted as cut when they may have run to TP first) but is directionally safe.

**This must match the frontend REPLAY engine assumption** so that frontend vs backend delta comparisons are valid.

---

### LOW — `be_exit_r` precision at entry stop level

For `be_stop_buffer_r = 0.0` (exact entry), `be_exit_r = 0.0`. In practice, this is the theoretical exit; actual exit includes spread and slippage (not modelled at 15-min resolution even in the backend). The field should record the theoretical exit R, with a note that spread and slippage are not included unless the backtester has explicit spread modelling.

---

## 7. Implementation Plan

### Phase 0 (this doc — COMPLETE)

Audit completed. Insertion points identified. Export schema designed. Open questions documented.

---

### Phase 1 — Backtester repo access + pre-read (REQUIRED BEFORE ANY CODE)

**Owner:** Codex (requires direct backtester repo access)
**Files to read:**

1. `scripts/run_backtest.py` lines around `protection_scenarios()` function — exact line numbers, yield structure, what fields each dict contains
2. `src/execution.py` `simulate_trades()` — full function, focus on: candle loading source, per-candle exit loop, existing `protection_mode` branch structure, `_can_fill_trade()` → fill → exit state machine
3. `src/config.py` `BacktestConfig` — confirm frozen dataclass, existing protection fields, whether there's a `from_dict()` constructor that would need updating
4. Data loading path in `run_backtest.py` — how `candles` is loaded (look for `load_candles`, `read_csv`, `pd.read_parquet`, etc.) and what file/interval is used

**Deliverables:**
- Confirmed candle resolution (15-min / 1-min / tick)
- Exact line numbers for `protection_scenarios()` and BE injection point
- Exact structure of the per-candle exit loop in `simulate_trades()`
- Confirmation of how `protection_mode` is currently branched in execution

---

### Phase 2 — `src/config.py` changes

Add 4 new fields to `BacktestConfig`:
```python
be_enabled:       bool  = False
be_arm_levels:    tuple = (0.5,)
be_trigger_bases: tuple = ("wick",)
be_stop_buffer_r: float = 0.0
```

No behaviour change when `be_enabled = False` (all defaults). All existing runs unaffected.

---

### Phase 3 — `src/execution.py` — BE stop logic in `simulate_trades()`

Add BE stop-management inside the per-candle exit loop, gated on `protection_mode == "be_replay"`. Specifically:
- After fill: derive `arm_price` and `be_stop_price` from `entry`, `sl`, `be_arm_level_r`, `be_stop_buffer_r`, `direction`
- On each candle: check arm trigger (wick or close), then check BE stop
- On BE exit: set `be_armed = True`, `be_triggered = True`, `be_exit_*` fields; break candle loop
- Append all 12 `be_*` fields to each trade row (null for unfilled trades)

**Constraint:** Must NOT change existing baseline or protection scenario behaviour. Gate every BE code path behind `protection_mode == "be_replay"`. Existing `protection_mode` checks must remain unchanged.

---

### Phase 4 — `scripts/run_backtest.py` — scenario injection + export

**4a.** Add BE scenario generation to `protection_scenarios(config)` — yield BE dicts when `config.be_enabled`.

**4b.** Add `"be_results": {}` to `run_summary` init (lines 2400–2412).

**4c.** In the sequential protection loop: add a BE-specific summary write to `run_summary["be_results"][key]` including the 13 summary fields above.

**4d.** In the parallel results integrator: handle `result["kind"] == "be"` → write to `run_summary["be_results"]`.

**No changes to:** `save_summary()`, `trades.to_csv()` — both are unconditional and will auto-include new fields.

---

### Phase 5 — Frontend integration (deferred)

**5a.** `importer.js` — map all 12 `be_*` fields per trade; add `"be_results"` parsing from `summary.json`; add `detectFileKind` branch for `__be_` files before generic protection check.

**5b.** `ProtectionLab.jsx` / `BreakevenTab.jsx` — when backend BE result files are detected, upgrade confidence tier from REPLAY → EXACT for those arm levels; render exact verdict; show delta vs REPLAY figure.

**5c.** `sidecarClient.js` / `StrategyBuilder.jsx` — serialize `be_enabled`, `be_arm_levels`, `be_trigger_bases`, `be_stop_buffer_r` to the sidecar config JSON.

---

### Validation checklist (post-Phase 4, before Phase 5)

- [ ] Run baseline scenario — confirm 0 new `be_*` columns in output (feature disabled)
- [ ] Enable `be_enabled=True`, single arm level, wick trigger — confirm new CSV file generated
- [ ] Check 12 `be_*` fields present in output CSV for all filled trades
- [ ] `be_armed = True` count matches trades where MFE > arm level in price terms (spot-check 5 trades manually)
- [ ] `be_triggered = True` subset: confirm `be_exit_r ≈ 0` for `be_stop_buffer_r=0`
- [ ] Sum: `losses_saved + winners_cut + armed_not_triggered + never_armed = filled_trade_count`
- [ ] `run_summary["be_results"]` present in `summary.json` for each BE scenario key
- [ ] Existing baseline and protection scenario outputs unchanged (byte-level diff against pre-change run)

---

## Open Questions (requires direct backtester repo access to resolve)

| # | Question | Impact if unresolved |
|---|---|---|
| **OQ-1** | What candle interval does the backtester load internally? Is 1-min data available? | Determines whether "EXACT" tier is genuinely higher resolution than REPLAY, or just better spread/news handling |
| **OQ-2** | Exact line numbers and structure of `protection_scenarios()` in `run_backtest.py` | Implementation cannot begin without this |
| **OQ-3** | Exact per-candle exit loop structure in `simulate_trades()` (which checks run in which order) | BE insertion point within the loop depends on this |
| **OQ-4** | Does `BacktestConfig` use `@dataclass(frozen=True)` or a mutable pattern? Is there a `from_dict()` deserializer? | Determines how to add new fields and where to update the constructor |
| **OQ-5** | Does the existing `protection_mode` branch affect *entry* (whether to fill) or *exit* (when to stop)? | Confirms whether BE and penetration-protection share the same hook point or need separate hooks |

---

## Summary

The backtester is structured to support BE exact replay via a **new protection mode injected into `simulate_trades()`**. The insertion points are:

1. `src/config.py` — 4 new `BacktestConfig` fields
2. `src/execution.py` → `simulate_trades()` — BE arm/stop logic in the per-candle exit loop, gated on `protection_mode == "be_replay"`
3. `scripts/run_backtest.py` → `protection_scenarios(config)` — yield BE scenario dicts when `be_enabled`
4. `scripts/run_backtest.py` → `run_summary` init — add `"be_results": {}`
5. `scripts/run_backtest.py` → sequential/parallel results integrators — write BE summaries to `run_summary["be_results"]`

Export is automatic — `trades.to_csv()` and `save_summary()` require no changes.

**Critical blocker:** Whether the backtester has access to 1-min candle data is **NOT CONFIRMED** from docs. If it operates on 15-min only, the "exact" improvement over the frontend REPLAY tier comes from spread modelling, news flattening, and conflict resolution — not from resolution. Phase 1 of implementation must confirm this before any code is written.

---

*Audit completed: 2026-06-10. No code written. No files changed other than this document.*
*Next step: Phase 1 — Obtain backtester repo access; read `simulate_trades()` in `src/execution.py` and candle loading path in `run_backtest.py`.*
