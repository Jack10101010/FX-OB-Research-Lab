# AUTO-PAIR-CONTROL-RUNS-2-BACKEND-AUDIT
## Backend Implementation Audit: FFT-OFF Control Scenario Generation

> **Audit only — no files modified.**

---

## Files Read

- `scripts/run_backtest.py` (multiple sections — full picture assembled)
- `src/run_outputs.py` (lines 1-41 — save_summary)
- `sidecar/server.py` (lines 301-344, 689-704 — bundle artifact detection, get_run_bundle)

---

## 1. Exact Scenario Plan Creation

### `build_scenario_plan(config)` — lines 855–904

```
run_backtest.py:855  def build_scenario_plan(config):
run_backtest.py:856      items = []
run_backtest.py:857      for execution_mode in config.execution_modes:
run_backtest.py:858          for scenario in protection_scenarios(config):   # ← baseline + protection
run_backtest.py:879          for scenario in entry_scenarios(config):        # ← entry (all modes)
run_backtest.py:880              if scenario["mode"] == "baseline":
run_backtest.py:881                  continue
run_backtest.py:882              items.append({
run_backtest.py:883                  "execution_mode": execution_mode,
run_backtest.py:885                  "kind": "entry",
run_backtest.py:886                  "label": scenario["key"],         # e.g. "entry_triggered_edge_25p0_d3"
run_backtest.py:896                  "output_file": f"trades_{execution_mode}__{scenario['key']}.csv",
run_backtest.py:897              })
run_backtest.py:900      total = len(items)
run_backtest.py:901      for index, item in enumerate(items, start=1):
run_backtest.py:902          item["index"] = index
run_backtest.py:903          item["total"] = total
run_backtest.py:904      return items
```

**Injection point A** (PRIMARY): Lines 882–898. Control items should be appended inside this same `for scenario in entry_scenarios(config)` loop, immediately after the `items.append({...})` for an entry item when `scenario["mode"] == "triggered_edge" and config.triggered_edge_cancel_on_first_failed_tag`.

---

## 2. Entry Scenario Keys (next / d2 / d3)

### `entry_scenarios(config)` — lines 539–573

Triggered-edge keys are built at lines 553–572:
```python
key = f"entry_triggered_edge_{threshold_key}_{mode_key}"
```
Where `mode_key`:
- delay == 0  → `"same"`
- delay == 1  → `"next"`
- delay >= 2  → `f"d{delay}"`  (so d2, d3, d4 ...)

Full example outputs for threshold=25.0:
```
entry_triggered_edge_25p0_same
entry_triggered_edge_25p0_next
entry_triggered_edge_25p0_d2
entry_triggered_edge_25p0_d3
```

Control label would be `"{key}__control"`:
```
entry_triggered_edge_25p0_d3__control
```

---

## 3. Output Filename Assignment

Three separate places. All must produce consistent `__control` filenames.

### A. `build_scenario_plan` — line 896
```python
"output_file": f"trades_{execution_mode}__{scenario['key']}.csv",
# Control: f"trades_{execution_mode}__{scenario['key']}__control.csv"
```

### B. Sequential execution loop — lines 2673–2674
```python
output_file     = OUTPUTS_DIR     / f"trades_{execution_mode}__{scenario['key']}.csv"
run_output_file = run_output_dir  / f"trades_{execution_mode}__{scenario['key']}.csv"
# Control: append __control before .csv in both
```

### C. `execute_scenario_job` (parallel path) — line 1734
```python
"output_file": f"trades_{execution_mode}__{scenario['key']}.csv",
# Control job would need: f"trades_{execution_mode}__{scenario['key']}__control.csv"
```

---

## 4. `simulate_trades` Call Sites

### A. Sequential entry loop — lines 2682–2718

**Does NOT use `simulation_kwargs()`**. Constructs all kwargs from `config.*` individually. FFT params are at lines 2710–2712:
```python
triggered_edge_cancel_on_first_failed_tag=config.triggered_edge_cancel_on_first_failed_tag,
triggered_edge_fft_move_away_pips=config.triggered_edge_fft_move_away_pips,
triggered_edge_fft_move_away_ob_multiple=config.triggered_edge_fft_move_away_ob_multiple,
```

For control runs in the sequential path: replace these three with hardcoded overrides:
```python
triggered_edge_cancel_on_first_failed_tag=False,
triggered_edge_fft_move_away_pips=0.0,
triggered_edge_fft_move_away_ob_multiple=0.0,
```
All other params (`entry_model`, `entry_model_key`, `entry_threshold_pct`, `triggered_edge_delay_candles`, `entry_level_pct`, etc.) remain IDENTICAL to the parent scenario.

**Critical:** `entry_model_key=scenario["key"]` at line 2695 must stay as the PARENT key (e.g. `"entry_triggered_edge_25p0_d3"`) NOT `"entry_triggered_edge_25p0_d3__control"`. The `__control` suffix lives only in the output filename and plan label — never in the trade column. This is required for `fftPairingAnalytics.js` matching to work.

### B. `execute_scenario_job` (parallel path) — lines 1701–1738

Uses `simulation_kwargs(config, ...)` at line 1668, then passes `**kwargs` into `simulate_trades` at line 1707. FFT params come from `simulation_kwargs()` at lines 1646–1648.

For control jobs, override the three FFT kwargs after calling `simulation_kwargs`:
```python
kwargs = simulation_kwargs(config, execution_mode, simulation_news_events, stop_buffer)
if job.get("kind") == "control":
    kwargs["triggered_edge_cancel_on_first_failed_tag"] = False
    kwargs["triggered_edge_fft_move_away_pips"] = 0.0
    kwargs["triggered_edge_fft_move_away_ob_multiple"] = 0.0
```

---

## 5. `summary.json` Writing

### `save_summary` — `src/run_outputs.py` lines 38–40
```python
def save_summary(summary_dict, output_dir):
    with (output_dir / "summary.json").open("w", encoding="utf-8") as file:
        json.dump(summary_dict, file, indent=2)
```
Writes the entire `run_summary` dict verbatim. No filtering. **`control_pairs` will be included automatically once added to `run_summary`.**

### `run_summary` initialization — lines 2400–2412
```python
run_summary = {
    "config": config.__dict__,
    "ob_count": ...,
    ...
    "execution_modes": {},
    "protection_results": {},
    "entry_results": {},
    "directional_results": {},
}
```
**Injection point B**: Add `"control_pairs": {}` here.

### `save_summary` called at line 2853
```python
write_scenario_reports(run_output_dir, scenario_records)
save_summary(run_summary, run_output_dir)   ← line 2853
```
No changes needed to this call.

---

## 6. Progress / Scenario Plan Emission

### Plan built at line 2220
```python
scenario_plan = build_scenario_plan(config)
```
Control items in `build_scenario_plan` are automatically included here.

### `init_progress` at line 2240
```python
progress = init_progress(progress_path, run_id, scenario_plan)
```
Embeds `scenario_plan` verbatim into `progress.json` (lines 1158–1161). Control items appear in the plan automatically if added in `build_scenario_plan`.

### `scenario_plan_summary` — lines 907–922
Counts items by `kind`. `kind="control"` will accumulate in `summary["control"]`. It won't map to the `baseline_passes`/`protection_passes`/`entry_passes` aliases, but those are just convenience aliases and will continue to be accurate for their respective kinds. `print_scenario_plan` will print control items correctly via the generic loop at lines 948–958.

### `scenario_items_by_key` lookup — line 2254
```python
scenario_items_by_key = {plan_lookup_key(item): item for item in scenario_plan}
```
`plan_lookup_key` returns `(execution_mode, kind, label)` (line 962). Control items would be keyed as:
```python
("single_position", "control", "entry_triggered_edge_25p0_d3__control")
```
Used in `mark_progress_start` / `mark_progress_done` calls.

---

## 7. Minimal Injection Points (Summary)

**Five total modification sites, all in `scripts/run_backtest.py` only:**

| # | Location | Lines | Change |
|---|----------|-------|--------|
| 1 | `build_scenario_plan` | 879–898 | After each triggered-edge entry `items.append`, inject a control item when FFT=True |
| 2 | `run_summary` init | 2400–2412 | Add `"control_pairs": {}` to dict literal |
| 3 | Sequential entry loop | after 2757 | New loop: run control scenarios, write files, populate `run_summary["control_pairs"]` |
| 4 | `build_parallel_jobs` | 1817–1826 | After each triggered-edge job append, inject a control job when FFT=True |
| 5 | `execute_scenario_job` | 1664–1783 | Add `elif job["kind"] == "control":` branch (reuse entry branch with FFT override) |

No changes to: `src/config.py`, `src/execution.py`, `src/run_outputs.py`, `sidecar/server.py`.

---

## 8. Duplicate Control Avoidance

### If FFT is OFF:
Guard at injection point 1 and 3/4: `if config.triggered_edge_cancel_on_first_failed_tag:`. No control items injected, no control loop runs. Zero impact on FFT-OFF runs.

### If scenario is already control:
Control items are NEW plan items with a distinct `label` (`"...__control"`) and `kind="control"`. The injection loops in `build_scenario_plan` iterate over `entry_scenarios(config)` which only yields genuine entry scenarios (no `kind="control"` items). There is no recursion risk.

### If config already includes a manual FFT-OFF run:
Not applicable — control generation operates within a single run. A separately imported manual FFT-OFF run uses the `PairedRunSelector` path, which is independent of `controlTradesByScenario`. Both mechanisms coexist safely; the auto-pair priority chain in `extractOffTrades` resolves priority-0 (auto) before falling back to priority-1 (manual).

---

## 9. Control Scenario Labelling

Proposed scenario dict for a control item in `build_scenario_plan`:
```python
{
    "execution_mode": execution_mode,
    "kind": "control",
    "label": f"{scenario['key']}__control",          # e.g. "entry_triggered_edge_25p0_d3__control"
    "protection_mode": None,
    "protection_threshold_pct": None,
    "protection_buffer_pips": None,
    "entry_model_key": scenario["key"],              # PARENT key — NOT __control
    "entry_model": scenario["mode"],                 # "triggered_edge"
    "threshold_pct": scenario["threshold_pct"],
    "trigger_penetration_pct": scenario["threshold_pct"],
    "triggered_edge_entry_level_pct": scenario.get("entry_level_pct"),
    "triggered_edge_delay_candles": scenario.get("triggered_edge_delay_candles"),
    "output_file": f"trades_{execution_mode}__{scenario['key']}__control.csv",
    "control_for": scenario["key"],                  # parent scenario key
    "control_type": "fft_off",
}
```

Proposed `control_pairs` entry for `run_summary`:
```python
run_summary["control_pairs"][f"{execution_mode}:{scenario['key']}"] = {
    "scenario_key":    scenario["key"],
    "execution_mode":  execution_mode,
    "output_file":     run_output_file.name,    # e.g. "trades_single_position__entry_triggered_edge_25p0_d3__control.csv"
    "fft_was_on":      True,
    "control_fft":     False,
    "filled_trades":   int(mode_summary.get("filled_trades", 0)),
}
```

---

## 10. Frontend Importer Identification

The sidecar `is_bundle_artifact` (lines 301–314) accepts any `.csv` file that is not candles. `trades_*__control.csv` files match this filter. They will be included in `read_run_bundle_files` output with priority 4 in `bundle_sort_key` (same as all other `trades*` files).

The frontend `detectFileKind` (importer.js line 784) maps filenames to kinds via substring matching. Currently:
- `n.includes("trades_single_position")` → `"trades_single_position"` → variantKey: `"single_position"`

A filename like `trades_single_position__entry_triggered_edge_25p0_d3__control.csv` contains `"trades_single_position"`, so it would currently be caught by the `trades_single_position` branch and end up in `tradesByVariant["single_position"]` — **overwriting the primary trades for that variant**. This is the main importer risk.

**Required importer fix:** The `__control` check MUST be placed BEFORE the generic `trades_single_position`/`trades_allow_multi_position` checks:
```js
// In detectFileKind, FIRST check:
if (n.includes("__control")) return "trades_control";   // handled separately
```

Then in the `case "trades_control":` handler, parse the execution mode and scenario key from the filename:
```
trades_{execution_mode}__{scenario_key}__control.csv
→ execution_mode: everything between "trades_" and the first "__"
→ scenario_key:   everything between the first "__" and "__control"
```

---

## 11. Risks and Edge Cases

### Entry model key must remain parent key
`entry_model_key` in the control trade CSV must equal the parent scenario key (e.g. `"entry_triggered_edge_25p0_d3"`), not the control label. `fftPairingAnalytics.js` matches FFT-cancelled rows against control rows by `ob_id|direction|entry_model_key` — both sides must share the same key. **Verified:** sequential path line 2695 sets `entry_model_key=scenario["key"]`; we retain this in the control loop.

### Parallel path needs consistent output_file naming
`execute_scenario_job` returns `result["output_file"]` which is used by the parallel results integrator at line 2569 to determine where to write. For control jobs this must be `f"trades_{execution_mode}__{scenario['key']}__control.csv"` (not the parent key without suffix).

### `scenario_records` + `scenario_results.csv`
`scenario_record()` function (lines 1830–1846) copies `kind` verbatim. `kind="control"` will appear as a new row kind in `scenario_results.csv`. This is additive and won't break any existing consumers that filter on `kind="entry"` or `kind="protection"`.

### `print_scenario_plan` count display
`scenario_plan_summary` will show `"control": N` in its dict, but the print function (line 945–947) only prints `Baseline:`, `Protection:`, and `Entry:` counts. Control items will appear in the per-item list (line 948–958) but won't have a summary line. This is a minor cosmetic gap — can be fixed when implementing.

### parallel + control ordering
In `build_parallel_jobs`, control jobs are appended AFTER their parent entry job. With `ProcessPoolExecutor`, both may run simultaneously. This is safe — they write different output files. For wall-clock efficiency, this is desirable (no sequential dependency).

### `run_summary["control_pairs"]` in parallel path
The parallel results integrator (lines 2553–2583) currently handles `kind in {"protection", "entry"}`. A new `elif result["kind"] == "control":` branch is needed to write to `run_summary["control_pairs"]` instead of `run_summary["entry_results"]`.

---

## 12. Implementation Prompt (Backend Phase 1)

```
Task: AUTO-PAIR-CONTROL-RUNS-BACKEND-1
File: scripts/run_backtest.py only
Do not modify: src/config.py, src/execution.py, src/run_outputs.py, sidecar/server.py

Change 1 — build_scenario_plan (lines 882–898):
After items.append({...}) for each entry scenario inside the
`for scenario in entry_scenarios(config):` loop, add:

    if (scenario["mode"] == "triggered_edge"
            and getattr(config, "triggered_edge_cancel_on_first_failed_tag", False)):
        control_label = f"{scenario['key']}__control"
        items.append({
            "execution_mode": execution_mode,
            "kind": "control",
            "label": control_label,
            "protection_mode": None,
            "protection_threshold_pct": None,
            "protection_buffer_pips": None,
            "entry_model_key": scenario["key"],
            "entry_model": scenario["mode"],
            "threshold_pct": scenario["threshold_pct"],
            "trigger_penetration_pct": scenario["threshold_pct"],
            "triggered_edge_entry_level_pct": scenario.get("entry_level_pct"),
            "triggered_edge_delay_candles": scenario.get("triggered_edge_delay_candles"),
            "output_file": f"trades_{execution_mode}__{control_label}.csv",
            "control_for": scenario["key"],
            "control_type": "fft_off",
        })

Change 2 — run_summary init (lines 2400–2412):
Add "control_pairs": {} to the run_summary dict literal.

Change 3 — Sequential control loop (after line 2757, before directional scenarios):
After the `for entry_index, scenario in enumerate(sequential_entry_scenarios, start=1):` loop,
add a new loop that runs control scenarios.

The loop iterates over:
    [s for s in entry_run_scenarios if s["mode"] == "triggered_edge"]
only when:
    getattr(config, "triggered_edge_cancel_on_first_failed_tag", False)

Inside the loop:
- control_label = f"{scenario['key']}__control"
- output_file = OUTPUTS_DIR / f"trades_{execution_mode}__{control_label}.csv"
- run_output_file = run_output_dir / f"trades_{execution_mode}__{control_label}.csv"
- plan_item = scenario_items_by_key[(execution_mode, "control", control_label)]
- mark_progress_start(progress, progress_path, plan_item, run_started_monotonic)
- pass_started = monotonic()
- Call simulate_trades(...) with ALL the same params as the parent entry scenario EXCEPT:
    triggered_edge_cancel_on_first_failed_tag=False
    triggered_edge_fft_move_away_pips=0.0
    triggered_edge_fft_move_away_ob_multiple=0.0
  Retain: entry_model_key=scenario["key"] (NOT control_label)
- mode_summary = summarize_trades(order_blocks, trades)
- Omit add_entry_delta_stats (control runs are compared against parent, not baseline)
- trades.to_csv(output_file, index=False)
- trades.to_csv(run_output_file, index=False)
- run_summary["control_pairs"][f"{execution_mode}:{scenario['key']}"] = {
      "scenario_key": scenario["key"],
      "execution_mode": execution_mode,
      "output_file": run_output_file.name,
      "fft_was_on": True,
      "control_fft": False,
      "filled_trades": int(mode_summary.get("filled_trades", 0)),
  }
- scenario_records.append(scenario_record({
      "execution_mode": execution_mode,
      "kind": "control",
      "label": control_label,
      "output_file": run_output_file.name,
      "seconds": 0.0,
      "summary": mode_summary,
  }))
- pass_duration = monotonic() - pass_started
- scenario_records[-1]["seconds"] = round(pass_duration, 3)
- timings["simulation_seconds_total"] += pass_duration
- update_manifest_timings(timings)
- mark_progress_done(progress, progress_path, plan_item, run_started_monotonic, pass_duration)

Change 4 — build_parallel_jobs (lines 1817–1826):
After each triggered-edge entry job is appended to jobs, add:

    if (scenario.get("mode") == "triggered_edge"
            and getattr(config, "triggered_edge_cancel_on_first_failed_tag", False)):
        control_label = f"{scenario['key']}__control"
        jobs.append({
            "job_id": f"{execution_mode}:control:{control_label}",
            "kind": "control",
            "execution_mode": execution_mode,
            "label": control_label,
            "scenario": scenario,
            "control_for": scenario["key"],
        })

Change 5 — execute_scenario_job (lines 1701–1738):
After the `elif job["kind"] == "entry":` block (lines 1701–1738), add:

    elif job["kind"] == "control":
        scenario = job["scenario"]
        is_triggered_edge = True   # controls are always triggered_edge
        control_label = job["label"]   # e.g. "entry_triggered_edge_25p0_d3__control"
        # Override FFT kwargs
        kwargs["triggered_edge_cancel_on_first_failed_tag"] = False
        kwargs["triggered_edge_fft_move_away_pips"] = 0.0
        kwargs["triggered_edge_fft_move_away_ob_multiple"] = 0.0
        trades = simulate_trades(
            candles,
            simulation_order_blocks,
            **kwargs,
            entry_model=scenario["mode"],
            entry_threshold_pct=scenario["threshold_pct"],
            entry_model_key=scenario["key"],   # PARENT key, not control_label
            entry_family="triggered_edge",
            triggered_edge_entry_level_pct=scenario.get("entry_level_pct", 0.0),
            triggered_edge_delay_candles=int(scenario.get("triggered_edge_delay_candles", 0)),
        )
        summary = summarize_trades(order_blocks, trades)
        attach_hot_path_profile(summary, trades, f"{execution_mode}/{control_label}")
        summary.update({
            "mode": control_label,
            "entry_model": scenario["mode"],
            "threshold": scenario["threshold_pct"],
            "entry_threshold_pct": scenario["threshold_pct"],
            "trigger_penetration_pct": scenario["threshold_pct"],
            "triggered_edge_entry_level_pct": scenario.get("entry_level_pct", ""),
            "triggered_edge_delay_candles": scenario.get("triggered_edge_delay_candles", ""),
        })
        results.append({
            "kind": "control",
            "scenario": scenario,
            "execution_mode": execution_mode,
            "label": control_label,
            "output_file": f"trades_{execution_mode}__{control_label}.csv",
            "trades": trades,
            "summary": summary,
        })

Change 6 — Parallel results integrator (lines 2553–2583):
After the `elif result["kind"] == "entry":` branch (lines 2564–2567), add:

        elif result["kind"] == "control":
            parent_key = job.get("control_for") or result["label"].replace("__control", "")
            run_summary["control_pairs"][f"{execution_mode}:{parent_key}"] = {
                "scenario_key":   parent_key,
                "execution_mode": execution_mode,
                "output_file":    result["output_file"],
                "fft_was_on":     True,
                "control_fft":    False,
                "filled_trades":  int(result["summary"].get("filled_trades", 0)),
            }
```

---

*End of AUTO-PAIR-CONTROL-RUNS-2-BACKEND-AUDIT.*
