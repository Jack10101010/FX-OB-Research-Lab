# DIRECTIONAL-ENTRY-3 Audit — Backend True Mixed Long/Short Entry Simulation

**Mode**: Audit only. No file changes.  
**Date**: 2026-06-04  
**Scope**: Lux-OB-Backtester + FX-OB-Research-Lab importer/frontend impact  
**Status of prior phases**:
- Phase 1 complete: Session Lab Asymmetric Preview (`SessionLabWorkspace.jsx`)
- Phase 2 complete: Strategy Builder directional entry config fields emitted

---

## 1. Current Backend Architecture Summary

### BacktestConfig (`src/config.py`)

`BacktestConfig` is a `frozen=True` dataclass. The **only** direction-related field is:

```python
trade_direction: str = "both"
```

This is a **global OB pre-filter** — not a per-model or per-entry dispatch. All other entry fields are symmetric:
- `entry_models: list[str]` — list of model names, same for longs and shorts
- `triggered_edge_trigger_thresholds`, `triggered_edge_candle_delays`, etc. — all global

**Phase 2 fields will be rejected.** `load_config_overrides` in `run_backtest.py` does:

```python
allowed_fields = {field.name for field in fields(BacktestConfig)}
unknown = sorted(set(data) - allowed_fields)
if unknown:
    raise ValueError(f"Unknown config keys: {unknown}")
```

All eight Phase 2 fields (`directional_entry_mode`, `directional_entry_config`, `long_entry_models`, `short_entry_models`, `long_triggered_edge_delays`, `short_triggered_edge_delays`, `long_entry_penetration_thresholds`, `short_entry_penetration_thresholds`) will raise on first run from the sidecar. They must be added to `BacktestConfig` OR suppressed/ignored before Phase 3 runs.

### Scenario Generation (`run_backtest.py` — `entry_scenarios`)

```python
def entry_scenarios(config):
    scenarios = [{"mode": "baseline", "threshold_pct": None, "key": "baseline"}]
    if "entry_penetration" in entry_models:
        for threshold_pct in config.entry_penetration_thresholds:
            ...
    if "triggered_edge" in entry_models:
        for threshold_pct in ...:
            for delay in normalize_triggered_edge_delays(config):
                ...
```

Generates one scenario dict per `(model, threshold, delay)` combination. **Direction is never a dimension.** All OBs (bullish and bearish) use the same entry model within a scenario pass.

Output keys:
- `baseline`
- `entry_penetration_25p0`
- `entry_triggered_edge_25p0_same` / `_next` / `_d2` / `_d3`

Output files:
- `trades_{variant}.csv` (baseline)
- `trades_{variant}__{key}.csv` (non-baseline)

### `simulate_trades()` (`src/execution.py`)

Signature: `simulate_trades(candles, order_blocks, ..., trade_direction="both", entry_model="baseline", entry_threshold_pct=None, triggered_edge_delay_candles=None, ...)`

Key flow:
1. For each OB, `_direction_allowed(ob["direction"], trade_direction)` gates whether the OB enters `pending`
2. Once in `pending`, **all OBs use the same `entry_model`, `entry_threshold_pct`, `triggered_edge_delay_candles`** — no per-direction branching
3. `_can_fill_trade(execution_mode, active_trades, direction)` controls fill:
   - `allow_multi_position` → always True
   - `one_per_direction` → True if no same-direction active trade
   - `single_position` → True if no active trades at all
4. `_has_reverse_conflict(active_trades, direction)` → marks `reverse_paused` if opposite-direction trade is active (for **all** execution modes)

**There is no per-OB or per-direction entry model dispatch anywhere in the engine.**

---

## 2. Current Frontend Config Summary (Phase 2 Output)

Strategy Builder emits these extra fields when `directionalEntryMode === "asymmetric"`:

```json
{
  "directional_entry_mode": "asymmetric",
  "directional_entry_config": {
    "long": {
      "enabled": true,
      "entry_model": "triggered_edge",
      "penetration_pct": 25,
      "triggered_edge_threshold": 25,
      "triggered_edge_delays": [2]
    },
    "short": {
      "enabled": true,
      "entry_model": "triggered_edge",
      "penetration_pct": 25,
      "triggered_edge_threshold": 25,
      "triggered_edge_delays": [1]
    }
  },
  "long_entry_models": ["triggered_edge"],
  "short_entry_models": ["triggered_edge"],
  "long_triggered_edge_delays": [2],
  "short_triggered_edge_delays": [1],
  "long_entry_penetration_thresholds": [],
  "short_entry_penetration_thresholds": []
}
```

**Assessment of field names**:
- `directional_entry_mode` ✓ — clean, matches pattern
- `directional_entry_config` ✓ — nested object, explicit
- `long_entry_models` / `short_entry_models` — these are arrays, which matches the `entry_models: list[str]` pattern in BacktestConfig. Acceptable. Consider whether they should be `long_entry_model: str` instead (single model per direction is the Phase 3 intent, not a batch). Recommend changing to singular `long_entry_model` / `short_entry_model` to avoid ambiguity about whether both are active simultaneously.
- `long_triggered_edge_delays` / `short_triggered_edge_delays` ✓ — array of int delays, consistent with existing `triggered_edge_candle_delays`
- `long_entry_penetration_thresholds` / `short_entry_penetration_thresholds` — array form. Fine for future expansion, but Phase 3 will only support a single threshold per direction. Recommend keeping array for forward-compat.
- The nested `directional_entry_config` and the flat fields are **redundant** — backend should prefer the nested form (richer and self-documenting) but accept flat as fallback for older configs.

**Missing fields** (should be added to Phase 2 and emitted for completeness):
- `long_triggered_edge_threshold` — currently in `directional_entry_config.long.triggered_edge_threshold` but not as a flat field
- `short_triggered_edge_threshold` — same
- These are not critical for Phase 3 since the nested config carries them, but importer recall would benefit from flat fields.

---

## 3. Option A / Option B Comparison

### Option A — Split-Pass Merge

**Mechanism**: For each directional scenario pair `(long_config, short_config)`:
1. Run `simulate_trades(..., trade_direction="long", entry_model=long_model, ...)` → `long_trades`
2. Run `simulate_trades(..., trade_direction="short", entry_model=short_model, ...)` → `short_trades`
3. Concatenate and sort by `detection_time` → export one merged CSV

**Complexity**: Low. Requires:
- `config.py`: ~10 new fields
- `run_backtest.py`: new `directional_entry_scenarios()`, new scenario kind, merge utility
- `execution.py`: zero changes
- Two `simulate_trades()` calls per directional pair per execution mode

**Correctness by mode**:

| Mode | Correctness | Reason |
|------|-------------|--------|
| `one_per_direction` | Near-exact | Each direction isolated; only gap: reverse-touch-cancel interactions not modelled (rare) |
| `allow_multi_position` | Near-exact | No position-slot blocking; only gap: reverse-touch-cancel interactions |
| `single_position` | **Incorrect** | Long and short don't compete; merged N is inflated; equity wrong |

**`_has_reverse_conflict` gap**: This function fires for ALL execution modes when an opposite-direction trade is active. In split-pass, each pass has no opposite-direction trades, so no `REVERSE_TOUCH_CANCEL` events are generated that would otherwise exist in a combined single-pass. This causes:
- Slightly higher fill count in split-pass vs combined pass
- Rare effect in `one_per_direction` and `allow_multi_position`
- Significant effect in `single_position` (combined with the slot-blocking issue)

**Impact on execution modes**:
- `single_position`: fills that would be blocked appear in merged output; equity curve wrong
- `allow_multi_position`: small overcount of fills vs true combined sim; acceptable for research
- `one_per_direction`: small overcount of fills vs true combined sim; acceptable for research

**Required file changes**:
- `src/config.py`: 7–10 new optional fields
- `scripts/run_backtest.py`: ~150–200 lines (scenarios, plan, loop, merge, output)
- `src/execution.py`: zero
- Frontend: importer.js, tradeUniverse.js regex/parsing

**Risk of incorrect drawdown/equity**: HIGH for `single_position`. LOW for `one_per_direction` and `allow_multi_position` (reverse-conflict gap is small).

---

### Option B — True Single-Pass Directional Engine

**Mechanism**: Modify `simulate_trades()` to accept a `directional_entry_config` dict. At the point where an OB enters `pending`, assign it the appropriate entry model, threshold, and delay based on `ob["direction"]`. Each pending item carries its own entry plan.

**Complexity**: High. Requires:
- `src/execution.py`: modify the main simulation loop
  - `_planned_trade()` must accept per-OB entry params
  - `analytics_config` must support per-OB variation (currently a single shared dict for the whole pass)
  - `_base_trade_row()` / `_apply_fill_metrics()` must work with per-OB entry config
  - Triggered-edge delay, threshold, cancel-on-retrace all become per-OB state
- `run_backtest.py`: pass `directional_entry_config` into `simulation_kwargs`
- Affects: `execute_scenario_job`, `simulation_kwargs`, `run_parallel_jobs`, batch path

**Correctness by mode**: Fully correct for all modes. `_has_reverse_conflict`, `_can_fill_trade`, and all execution-mode logic work exactly as-is because both directions are in the same `active_trades` and `pending` lists.

**Required file changes**:
- `src/config.py`: 7–10 new fields (same as Option A)
- `src/execution.py`: ~100–200 line surgery in the hot path (risky)
- `scripts/run_backtest.py`: scenario dispatch changes (~80 lines)
- Frontend: same as Option A

**Risk of incorrect drawdown/equity**: Low if implemented correctly. High implementation risk — the hot path is performance-critical and already has a profiling hook.

---

## 4. Correctness Verdict

**For `one_per_direction`**:
Split-pass is **acceptable for Phase 3 research use**. By definition, this mode allows at most one long and one short simultaneously, and running them in separate passes produces nearly identical trade lists. The only gap is reverse-touch-cancel events (a long active at time T causes a bearish OB touching at T to get `REVERSE_TOUCH_CANCEL` in a combined run but not in split-pass). This effect is minor and is the same approximation the existing Session Lab preview already makes.

**For `allow_multi_position`**:
Split-pass is **acceptable for Phase 3 research use**. Position slots are never blocked, so long and short fills are fully independent. The reverse-touch-cancel gap exists but is smaller in practice than in `single_position`. Equity per trade is correct; the combined equity sequence is accurate.

**For `single_position`**:
Split-pass is **not acceptable for `single_position`**. Long and short trades compete for the single position slot. In split-pass, both sides generate trades unblocked. Merged N will be inflated (possibly by 30–60% in typical datasets). Win rate, equity, and drawdown are all incorrect. Split-pass for `single_position` must be explicitly disabled or flagged as unsupported.

**Final verdict**:
- `one_per_direction` + `allow_multi_position`: **split-pass is acceptable for Phase 3**
- `single_position`: **split-pass must be blocked or clearly marked invalid**
- True single-pass (Option B) is the only correct solution for `single_position` — defer to Phase 4

---

## 5. Recommended Backend Design

**Recommendation: Option A — Split-Pass for Phase 3, restricted to `one_per_direction` and `allow_multi_position`**

**Rationale**:
- `one_per_direction` is the primary research-target mode for directional entry analysis (the frontend preview was already designed around it)
- `allow_multi_position` is also safe
- Excluding `single_position` avoids publishing incorrect results while keeping Phase 3 deliverable
- Option B (single-pass) is a Phase 4 item requiring execution engine surgery with performance implications

**Phase 3 design**:

```
For each directional scenario pair (long_cfg, short_cfg):
  For each execution_mode in ["one_per_direction", "allow_multi_position"]:
    pass_long  = simulate_trades(..., trade_direction="long",  entry_model=long_model,  ...)
    pass_short = simulate_trades(..., trade_direction="short", entry_model=short_model, ...)
    merged     = sort_by_detection_time(concat(pass_long, pass_short))
    add metadata columns: directional_assignment_mode="split_pass", long_entry_model_key, short_entry_model_key
    export merged → trades_{execution_mode}__dir_long_{long_key}__short_{short_key}.csv
```

**If `single_position` is requested**: Log a warning, emit a note to `summary.json`, skip directional scenarios for that execution mode (or include a `directional_note` field marking results as unsupported).

**Not required in Phase 3**:
- No changes to `simulate_trades()` (execution.py untouched)
- No batch/parallel path changes for directional scenarios
- No changes to protection scenario logic

---

## 6. Recommended CSV Naming

**Proposed pattern**:
```
trades_{variant}__dir_long_{long_key}__short_{short_key}.csv
```

Where `{long_key}` and `{short_key}` use the same key format as existing entry scenario keys:
- `entry_baseline`
- `entry_penetration_25p0`
- `entry_triggered_edge_25p0_next`
- `entry_triggered_edge_25p0_d2`
- `entry_none` (direction disabled)

**Examples**:
```
trades_one_per_direction__dir_long_entry_triggered_edge_25p0_d2__short_entry_triggered_edge_25p0_next.csv
trades_allow_multi_position__dir_long_entry_baseline__short_entry_triggered_edge_25p0_next.csv
trades_one_per_direction__dir_long_entry_penetration_25p0__short_entry_baseline.csv
trades_one_per_direction__dir_long_entry_none__short_entry_triggered_edge_25p0_next.csv
```

**Key for disabled direction**: Use `entry_none` rather than `disabled` to stay within the `entry_` prefix convention. This simplifies importer parsing — `entry_none` is a valid key pattern that signals "direction not traded."

**Scenario key (for summary, plan, progress)**:
```
dir_long_{long_key}__short_{short_key}
```
e.g. `dir_long_entry_triggered_edge_25p0_d2__short_entry_triggered_edge_25p0_next`

**Importer regex assessment**:

Current `entryTradeFileInfo` regex:
```js
const m = file.match(/^trades_(single_position|allow_multi_position|one_per_direction)__(entry_.+)\.csv$/);
```

This will NOT match directional files because `dir_long_` ≠ `entry_`. A separate parser is needed:

```js
function directionalTradeFileInfo(name) {
    const file = String(name || "").split(/[\\/]/).pop().toLowerCase();
    const m = file.match(
        /^trades_(single_position|allow_multi_position|one_per_direction)__dir_long_(entry_[^_]+(?:_[^_]+)*)__short_(entry_[^_]+(?:_[^_]+)*)\.csv$/
    );
    if (!m) return null;
    return { baseVariant: m[1], longKey: m[2], shortKey: m[3] };
}
```

The scenario key stored in `entryTradesByMode` would be:
```
`${baseVariant}__dir_long_${longKey}__short_${shortKey}`
```

e.g. `one_per_direction__dir_long_entry_triggered_edge_25p0_d2__short_entry_triggered_edge_25p0_next`

These keys would be parseable by `AsymmetricEntryPreview` in Session Lab, which already strips the `${activeVariant}__` prefix and works with the remaining model key.

**Potential regex greedy-match issue**: The long key like `entry_triggered_edge_25p0_d2` contains underscores, and `__` (double underscore) is the separator between long and short segments. The pattern above works as long as `__short_` never appears within a key name — which it won't since single underscores are used within keys.

---

## 7. Required Trade Row Fields

Each row in a directional scenario CSV should include these additional metadata columns:

| Field | Type | Value | Notes |
|-------|------|-------|-------|
| `directional_assignment_mode` | str | `"split_pass"` | Always this for Phase 3; will be `"single_pass"` in Phase 4 |
| `long_entry_model_key` | str | e.g. `"entry_triggered_edge_25p0_d2"` | The key used for longs in this scenario |
| `short_entry_model_key` | str | e.g. `"entry_triggered_edge_25p0_next"` | The key used for shorts |
| `direction_entry_model_key` | str | The entry model key applied to THIS row | Per-row: either `long_entry_model_key` or `short_entry_model_key` based on `direction` |

**Already present fields that remain valid**:
- `direction` — `"bullish"` / `"bearish"` — identifies which half of the pair the row belongs to
- `entry_model_key` — will carry the per-row entry key (same as `direction_entry_model_key`)
- `entry_model` — the model type (`"baseline"`, `"entry_penetration"`, `"triggered_edge"`)

**Not required** (but useful for Phase 4 validation):
- `directional_scenario_key` — the full scenario key string (can be derived from filename)

**Minimum set for Phase 3**: Add `directional_assignment_mode`, `long_entry_model_key`, `short_entry_model_key`. The per-row `direction_entry_model_key` can be derived from `direction` + the scenario metadata.

---

## 8. Required Summary Fields

`summary.json` should include a new `directional_entry_results` key at the top level (parallel to `entry_results`):

```json
{
  "directional_entry_mode": "asymmetric",
  "directional_entry_config": { ... },
  "directional_entry_results": {
    "one_per_direction": {
      "dir_long_entry_triggered_edge_25p0_d2__short_entry_triggered_edge_25p0_next": {
        "long_entry_model_key": "entry_triggered_edge_25p0_d2",
        "short_entry_model_key": "entry_triggered_edge_25p0_next",
        "directional_assignment_mode": "split_pass",
        "long_n": 42,
        "short_n": 38,
        "total_n": 80,
        "net_r": 12.4,
        "win_rate": 0.53,
        "expectancy_r": 0.155,
        "max_drawdown_r": -3.2,
        "delta_net_r_vs_baseline": 2.1,
        "supported": true
      }
    },
    "single_position": {
      "_note": "single_position directional entry not supported in split_pass mode; use one_per_direction"
    }
  },
  "directional_scenario_count": 2
}
```

**Key fields**:
- `directional_entry_mode` — `"symmetric"` or `"asymmetric"` — mirrors the config field
- `directional_entry_results[execution_mode][scenario_key]` — per-mode, per-scenario stats
- `long_n`, `short_n` — filled trade counts by direction
- `supported` — bool, false for `single_position` in Phase 3
- `directional_scenario_count` — total directional scenario pairs generated

**Minimal required**: `long_entry_model_key`, `short_entry_model_key`, `directional_assignment_mode`, `net_r`, `win_rate`, `filled_trades`, `long_n`, `short_n`.

---

## 9. Frontend Import/Display Impact

### importer.js

**Required changes**:
1. Add `directionalTradeFileInfo(name)` parser (see §6)
2. Update `classifyFileName`: add check before the `entryTradeFileInfo` check:
   ```js
   if (directionalTradeFileInfo(name)) return "trades_directional";
   ```
3. Add `directionalTradesByMode: {}` and `directionalSourceFiles: []` to `collected`
4. Handle `"trades_directional"` case in the file-type switch:
   ```js
   case "trades_directional": {
       const info = directionalTradeFileInfo(f.name);
       const t = parseTradesCSV(text);
       const key = `${info.baseVariant}__dir_long_${info.longKey}__short_${info.shortKey}`;
       collected.directionalTradesByMode[key] = t;
       // Also push into entryTradesByMode so Session Lab AsymmetricPreview picks them up
       collected.entryTradesByMode[key] = t;
       collected.directionalSourceFiles.push({ ... });
   }
   ```
5. Store directional result files in the bundle's `entryResults.tradesByMode` so `AsymmetricEntryPreview` can find them via `entryTradesByMode(bundle)`
6. Propagate `directionalSourceFiles` into the bundle

**`entryTradesByMode` key storage**: Directional keys should be stored as `${variant}__dir_long_X__short_Y`. `AsymmetricEntryPreview` strips `${activeVariant}__` from all keys — after stripping, the key becomes `dir_long_X__short_Y`. The two `<select>` dropdowns in the panel currently choose from individual `entry_*` model keys. They would need a new mode where the whole pair is one selection — or they could just display both halves as separate non-editable labels. See §9 Session Lab section.

### tradeUniverse.js

`entryTradesByMode(bundle)` reads from `bundle.entryResults.tradesByMode` — no changes needed if directional trades are stored there. The keys `dir_long_X__short_Y` will appear as additional entries in the keyset.

### Session Lab (`SessionLabWorkspace.jsx`)

Current `AsymmetricEntryPreview` uses `entryTradesByMode(bundle)` to get all available model keys, then presents two independent dropdowns (Long model selector, Short model selector). After Phase 3D, directional scenario keys (`dir_long_X__short_Y`) will appear in the keyset alongside individual model keys.

**Two options**:

Option 1 — Do nothing: The existing preview still works — users choose from individual model keys for the approximate preview. The directional backend keys will appear as additional key choices in the dropdowns (with odd-looking names like `dir_long_entry_triggered_edge_25p0_d2__short_entry_triggered_edge_25p0_next`). These won't work with the current pair-selection UI, so they should be filtered out of the dropdown.

Option 2 (recommended for Phase 3E) — Add a "Directional Scenarios" subsection that shows if `dir_long_*__short_*` keys are present. Since a directional backend CSV contains BOTH directions merged, it can be displayed as a single pre-merged result with full accuracy metrics (no `lowN` warning, no "Approximate" label).

### Entries Lab

`selectedModelKey` in `useEntryWorkspace.js` — directional scenario keys from `entryTradesByMode` would appear as selectable rows. The `ModelAnalysis` component renders based on `tradesByMode` keys. A `dir_long_X__short_Y` key would produce a valid KPI strip and equity curve. No changes required in Phase 3; Entries Lab would just pick up the directional scenarios naturally.

The `ExactResultsPanel` and `SensitivityPanel` may show odd labels (key names). A Phase 3E label formatter for `dir_*` keys should be added to `formatEntryModelKey` (currently in `SessionLabWorkspace.jsx`).

---

## 10. Implementation Phases

### Phase 3A — Config (`config.py` + validation only)

**Files**: `src/config.py`, `scripts/run_backtest.py`

**Changes**:
1. Add to `BacktestConfig`:
   ```python
   directional_entry_mode: str = "symmetric"
   long_entry_model: str = "triggered_edge"
   short_entry_model: str = "triggered_edge"
   long_triggered_edge_threshold: float = 25.0
   short_triggered_edge_threshold: float = 25.0
   long_triggered_edge_delays: list[int] = field(default_factory=lambda: [0, 1])
   short_triggered_edge_delays: list[int] = field(default_factory=lambda: [0, 1])
   long_entry_penetration_thresholds: list[float] = field(default_factory=list)
   short_entry_penetration_thresholds: list[float] = field(default_factory=list)
   ```
2. Add `validate_directional_entry_config(config)` in `run_backtest.py`:
   - Validates `directional_entry_mode` ∈ `{"symmetric", "asymmetric"}`
   - Validates `long_entry_model` / `short_entry_model` ∈ `{"baseline", "entry_penetration", "triggered_edge"}`
   - Validates thresholds > 0 and < 100
   - Validates delays ∈ `{0, 1, 2, 3}`
3. Call `validate_directional_entry_config(config)` in `main()` after existing validators
4. In `init_manifest`, include `directional_entry_mode` in `execution_config_hash` fields

**Backward compatibility**: All new fields default to values that produce symmetric behavior. No existing config is affected.

---

### Phase 3B — Scenario Generation + Output Naming

**Files**: `scripts/run_backtest.py`

**Changes**:
1. Add `directional_entry_scenarios(config)` — generates directional pairs when `directional_entry_mode == "asymmetric"`:
   ```python
   def directional_entry_scenarios(config):
       if config.directional_entry_mode != "asymmetric":
           return []
       long_key = resolve_directional_entry_key("long", config)
       short_key = resolve_directional_entry_key("short", config)
       return [{"long_key": long_key, "short_key": short_key, "key": f"dir_long_{long_key}__short_{short_key}"}]
   ```
2. Add `resolve_directional_entry_key(side, config)` — maps model/threshold/delay to key string
3. Update `build_scenario_plan(config)` to include directional entries as kind `"directional_entry"`
4. Skip directional scenarios for `single_position` execution mode with a logged warning
5. Update `scenario_plan_summary` to count directional passes

**Key format** (from `resolve_directional_entry_key`):
- `entry_baseline` for baseline model
- `entry_penetration_{threshold}p0` for penetration (using first threshold)
- `entry_triggered_edge_{threshold}p0_{delay_mode}` for triggered edge (using first delay)
- `entry_none` if direction disabled

---

### Phase 3C — Execution (Split-Pass + Merge)

**Files**: `scripts/run_backtest.py`

**Changes**:
1. Add `run_directional_entry_pass(config, execution_mode, side, ...)` — wraps `simulate_trades()` with `trade_direction=side` and appropriate entry params
2. Add `merge_directional_passes(long_trades, short_trades)` — concat + sort by `detection_time`, add metadata columns
3. Integrate directional entries into the main simulation loop under `if config.directional_entry_mode == "asymmetric":`
4. Summary accumulation: populate `run_summary["directional_entry_results"]`
5. Progress tracking: include directional passes in `scenario_plan` and progress counts

---

### Phase 3D — Importer + tradeUniverse

**Files**: `frontend/src/data/importer.js`

**Changes** (see §9):
1. `directionalTradeFileInfo(name)` parser
2. `classifyFileName` update
3. `ingestRunBundle` case for `"trades_directional"`
4. Bundle `entryResults.tradesByMode` population

No changes to `tradeUniverse.js` required.

---

### Phase 3E — Session Lab / Entries Lab Labels + UI

**Files**: `frontend/src/components/lab/session/SessionLabWorkspace.jsx`, optional Entries Lab label helpers

**Changes**:
1. Update `formatEntryModelKey` to handle `dir_long_X__short_Y` keys → human-readable label like `"Long TE 25% d2 / Short TE 25% Next"`
2. In `AsymmetricEntryPreview`: filter out `dir_*` keys from the individual model dropdowns (they are full directional scenarios, not half-pair inputs)
3. Add a "Directional Backend Scenarios" section below the existing Asymmetric Preview: renders any `dir_*` keys from `tradesByMode` with direct stats (no "Approximate" label since these ARE true backend scenarios)
4. Add `directional_entry_mode` indicator to session card if bundle was run with asymmetric config

---

## 11. Testing Plan

### Smoke tests (run manually after each phase)

| Test | Expected |
|------|----------|
| Symmetric config with `directional_entry_mode: "symmetric"` | Identical output to pre-Phase-3 run; no directional files emitted |
| Existing scenario batch (TE d2 + TE next) symmetric | Same output as before; no regression |
| Asymmetric config: long TE d2 / short TE next, `one_per_direction` | New CSV emitted; long trades all `direction=bullish`; short trades all `direction=bearish`; N(long) + N(short) = total rows |
| Asymmetric config: long TE d2 / short TE next, `allow_multi_position` | Same as above, different position stats |
| Asymmetric config: long TE d2 / short TE next, `single_position` | Warning logged; no directional CSV emitted (or clearly marked as unsupported) |
| `long_entry_model="entry_none"` or direction disabled | Only short trades in CSV; long N = 0 |
| `short_entry_model="entry_none"` | Only long trades in CSV; short N = 0 |
| Directional CSV filename parser | `directionalTradeFileInfo("trades_one_per_direction__dir_long_entry_triggered_edge_25p0_d2__short_entry_triggered_edge_25p0_next.csv")` → `{ baseVariant: "one_per_direction", longKey: "entry_triggered_edge_25p0_d2", shortKey: "entry_triggered_edge_25p0_next" }` |
| Importer picks up directional CSV | `bundle.entryResults.tradesByMode["one_per_direction__dir_long_entry_triggered_edge_25p0_d2__short_entry_triggered_edge_25p0_next"]` is populated |
| Old bundle (no directional fields) imports cleanly | No errors; no new fields populated |
| TE d2/d3 delays still work (symmetric) | Same as before |
| First-failed-tag cancel still works (symmetric) | Same as before |

### Validation run for `one_per_direction` exactness

To validate split-pass approximation accuracy:
1. Run symmetric config with `trade_direction="both"`, `entry_model="triggered_edge"`, `delays=[2]` on `one_per_direction`
2. Run directional config: long TE d2, short TE d2 on `one_per_direction` (same model for both)
3. Compare N, win_rate, net_R — should be nearly identical (differences only from reverse-touch-cancel events)
4. Measure discrepancy: count `REVERSE_TOUCH_CANCEL` rows in symmetric run — this is the N gap

---

## 12. Exact First IMPLEMENT Prompt

**DIRECTIONAL-ENTRY-3-PHASE-3A**

```
MODE: IMPLEMENT
TASK: DIRECTIONAL-ENTRY-3-PHASE-3A — Config + Validation

Add directional entry config fields to BacktestConfig and validation to run_backtest.py.
No scenario generation, no simulation changes, no output changes.

FILES TO MODIFY:
- Lux-OB-Backtester/src/config.py
- Lux-OB-Backtester/scripts/run_backtest.py

DO NOT MODIFY:
- src/execution.py
- Any frontend files
- Any other backend files

CHANGES TO config.py:
Add these optional fields to BacktestConfig dataclass (after commission_r_per_trade):
  directional_entry_mode: str = "symmetric"
  long_entry_model: str = "triggered_edge"
  short_entry_model: str = "triggered_edge"
  long_triggered_edge_threshold: float = 25.0
  short_triggered_edge_threshold: float = 25.0
  long_triggered_edge_delays: list[int] = field(default_factory=lambda: [0, 1])
  short_triggered_edge_delays: list[int] = field(default_factory=lambda: [0, 1])
  long_entry_penetration_thresholds: list[float] = field(default_factory=list)
  short_entry_penetration_thresholds: list[float] = field(default_factory=list)

CHANGES TO run_backtest.py:
1. Add VALID_DIRECTIONAL_ENTRY_MODES = {"symmetric", "asymmetric"}
2. Add VALID_DIRECTIONAL_ENTRY_MODELS = {"baseline", "entry_penetration", "triggered_edge"}
3. Add validate_directional_entry_config(config) function:
   - Validates directional_entry_mode in VALID_DIRECTIONAL_ENTRY_MODES
   - Validates long_entry_model and short_entry_model in VALID_DIRECTIONAL_ENTRY_MODELS
   - Validates long_triggered_edge_threshold and short_triggered_edge_threshold (0 < x < 100)
   - Validates long_triggered_edge_delays and short_triggered_edge_delays items in VALID_TRIGGERED_EDGE_CANDLE_DELAYS
   - Validates long_entry_penetration_thresholds and short_entry_penetration_thresholds (each item 0 < x < 100)
   - Returns validated/normalized config (using replace() if values changed)
4. Call validate_directional_entry_config(config) in main() after validate_parallel_config(config)
5. Add directional fields to execution_config_hash in init_manifest:
   "directional_entry_mode", "long_entry_model", "short_entry_model",
   "long_triggered_edge_threshold", "short_triggered_edge_threshold",
   "long_triggered_edge_delays", "short_triggered_edge_delays",
   "long_entry_penetration_thresholds", "short_entry_penetration_thresholds"

BACKWARD COMPATIBILITY:
All new fields have defaults that reproduce symmetric behavior.
Existing configs without directional fields must continue to work unchanged.

TEST:
Run python scripts/run_backtest.py --plan-only with a config that includes
directional_entry_mode="asymmetric", long_entry_model="triggered_edge" etc.
Confirm no crash and plan prints normally.
Run with an existing symmetric config — confirm no change in output.
```

---

## Summary

| Item | Recommendation |
|------|---------------|
| Backend approach | Option A (split-pass), restricted to `one_per_direction` + `allow_multi_position` |
| Phase 3 correctness | Exact for `one_per_direction`/`allow_multi_position` (minor reverse-conflict gap); incorrect for `single_position` |
| `single_position` directional | Block with warning in Phase 3; true single-pass in Phase 4 |
| CSV naming | `trades_{variant}__dir_long_{long_key}__short_{short_key}.csv` |
| Disabled direction key | `entry_none` |
| Importer regex | New `directionalTradeFileInfo` parser; store in `entryTradesByMode` with `dir_` prefix |
| Trade row additions | `directional_assignment_mode`, `long_entry_model_key`, `short_entry_model_key` |
| Summary additions | `directional_entry_results` dict, `directional_scenario_count` |
| Phase sequence | 3A config → 3B scenario gen → 3C execution → 3D importer → 3E labels |
| Phase 3 entry point | Phase 3A only: `config.py` + `validate_directional_entry_config` |
