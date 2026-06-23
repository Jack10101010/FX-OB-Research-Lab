# LUX-GHOST-PHASE-1 — Backtester Integration Guide
_Date: 2026-06-04 · Status: Ready to implement_

---

## What this adds

For every OB cancelled by an existing pre-trigger rule, `ghost_tracker.py` runs a
parallel observational simulation to determine what would have happened if the
cancellation had not occurred.

**Zero behaviour change.** Real trade results, fills, equity, and all existing
CSV fields are byte-identical before and after this integration.

**Output:** 10 new columns appended to every trades CSV row, and 9 new fields
in `summary.json`.

---

## Prerequisites

Copy `ghost_tracker.py` into the backtester repo (same directory as
`execution.py` / `run_backtest.py`).

```
lux-ob-backtester/
├── execution.py         ← main integration target
├── run_backtest.py      ← secondary integration target (summary export)
├── ghost_tracker.py     ← DROP THIS FILE HERE
└── ...
```

Python standard library only — no additional pip installs.

---

## Integration — Step-by-step

### Step 1 — Import

At the top of `execution.py` (or whichever file runs the triggered-edge
simulation loop):

```python
from ghost_tracker import GhostTracker
```

---

### Step 2 — Instantiate

Once per run, BEFORE the OB candidate loop begins.  `config` is your existing
run config dict — pass the whole thing; `GhostTracker` only reads the keys it
needs and ignores the rest.

```python
ghost_tracker = GhostTracker(config)
```

If you run multiple execution modes (single_position, allow_multi_position,
one_per_direction) in separate loops, create ONE tracker per mode — ghost state
is mode-specific.

---

### Step 3 — Register cancelled OBs

Find every location in the code where a pre-trigger cancellation fires.
For Phase 1, the targets are:

#### 3a. Retrace cancel (primary target)

This is the cancel rule that fires when price entered the OB but moved away
by `retrace_pips` / `retrace_ob_pct` before reaching the trigger threshold.
The backtester currently sets `retrace_cancel_time` and `cancelled_before_entry = True`.

Find the code block that looks like (pseudocode):

```python
# existing logic:
ob['retrace_cancel_time'] = current_candle_time
ob['retrace_cancel_distance_pips'] = distance_pips
ob['cancelled_before_entry'] = True
remove_ob_from_active_pool(ob)
```

INSERT immediately BEFORE `remove_ob_from_active_pool`:

```python
ghost_tracker.add_candidate(ob, "retrace_cancel")
```

The ob dict at this point must already have `entry`, `stop`, `tp` set.
If those aren't set yet at cancel time, pass them explicitly:

```python
ghost_tracker.add_candidate({
    **ob,
    "entry": planned_entry_price,
    "stop":  stop_price,
    "tp":    tp_price,
    "trigger_threshold_pct": config.get("triggered_edge_trigger_thresholds", 25.0),
}, "retrace_cancel")
```

#### 3b. News blackout cancel (if applicable)

Same pattern, wherever `news_blackout = True` causes an OB to be dropped
before a fill:

```python
ghost_tracker.add_candidate(ob, "news_blackout")
```

#### 3c. Session cancel (if applicable)

```python
ghost_tracker.add_candidate(ob, "session_cancel")
```

#### 3d. Other pre-trigger cancels

Any other cancel path that sets `cancelled_before_entry = True` can use
`ghost_tracker.add_candidate(ob, "your_cancel_reason_string")`.

---

### Step 4 — Tick on every candle

In the innermost execution-timeframe candle loop (the loop that checks
real OB fills), add ONE call to `tick_all` at either the start or end of
each iteration.

```python
for i, candle in enumerate(execution_candles):
    # ... existing real simulation logic (unchanged) ...
    
    # ADD THIS LINE (order within iteration doesn't matter):
    ghost_tracker.tick_all(candle, i)
```

`tick_all` is O(n_active_ghosts) per candle. For a typical run with <50
retrace-cancelled OBs the overhead is negligible.

**Important:** continue calling `tick_all` even after all real OBs have
resolved — ghost observers may still be tracking.

---

### Step 5 — Finalize at end of loop

After the candle loop exits:

```python
ghost_tracker.finalize_all()
```

This resolves any ghost observers still open (marks them NEVER_TRIGGERED,
UNFILLED, etc.).

---

### Step 6 — Add ghost fields to CSV export

Wherever you build the dict/row for each trade CSV row, add the ghost fields.

**For ghost (cancelled) OB rows:**
```python
row = {
    # ... all existing fields (unchanged) ...
}
row.update(ghost_tracker.get_fields(ob["ob_id"]))
```

**For real (filled) OB rows:**
```python
row = {
    # ... all existing fields (unchanged) ...
}
row.update(ghost_tracker.get_fields(ob["ob_id"]))
# Returns EMPTY_GHOST_FIELDS (False/None/"") for non-candidates
```

Using the same call for both cases keeps the code simple and ensures
the CSV column schema is consistent across all rows.

**CSV column ordering:** Append the 10 ghost columns AFTER all existing
columns so that any existing downstream CSV parsers are not broken by
column index shifts.

```python
GHOST_COLUMNS = [
    "ghost_candidate",
    "cancel_reason",
    "ghost_trigger_reached",
    "ghost_fill",
    "ghost_outcome",
    "ghost_r",
    "ghost_mae",
    "ghost_mfe",
    "ghost_fill_delay_candles",
    "ghost_fill_session",
]
```

---

### Step 7 — Add ghost aggregates to summary.json

In `run_backtest.py` (or wherever `summary.json` is built), after calling
`ghost_tracker.finalize_all()`:

```python
summary = {
    # ... all existing summary fields (unchanged) ...
}
summary.update(ghost_tracker.summary_fields())
```

The 9 ghost summary fields:
- `ghost_candidates_total`
- `ghost_wins`
- `ghost_losses`
- `ghost_breakevens`
- `ghost_protection_exits`
- `ghost_unfilled`
- `ghost_never_triggered`
- `ghost_net_r`
- `ghost_avg_r`

---

## Required fields on the `ob` dict at cancel time

`GhostState.__init__` reads these from the `ob` dict you pass.
All have reasonable defaults if absent.

| Field | Type | Notes |
|---|---|---|
| `direction` | str | `"bullish"` or `"bearish"` (or `"long"` / `"bear"` etc.) |
| `top` | float | OB top price |
| `bottom` or `bot` | float | OB bottom price |
| `entry` | float | Planned limit-order price |
| `stop` | float | Stop-loss price |
| `tp` | float | Take-profit price |
| `trigger_threshold_pct` | float | Defaults to `config["triggered_edge_trigger_thresholds"]` or 25.0 |
| `ob_id` or `id` | str/int | Used as dict key in tracker; falls back to `id(ob)` |

The `config` dict is passed as-is. Relevant keys read by `GhostTracker`:

| Key | Default |
|---|---|
| `pip_size` | 0.0001 |
| `triggered_edge_trigger_thresholds` | 25.0 |
| `te_delay_candles` or `triggered_edge_delay_candles` | 0 |
| `same_candle_fill` or `same_candle_entry_allowed` | True |
| `protection_mode` | `"baseline"` |
| `protection_threshold_pct` | None (no protection) |

---

## Candle dict format

`tick_all(candle, i)` accepts OHLCT dicts in either format:

```python
# Long-form keys (standard pandas/dict format)
{"time": "2025-06-01 09:15:00+00:00", "open": 1.08210, "high": 1.08250,
 "low": 1.08190, "close": 1.08230}

# Short-form keys (lightweight format)
{"t": 1748785200, "o": 1.08210, "h": 1.08250, "l": 1.08190, "c": 1.08230}
```

Time can be a datetime object, ISO string, or Unix timestamp.

---

## What the ghost simulation does

For each cancelled OB the module replays the price series from the cancel
point forward, checking:

1. **Trigger** — would price have reached the trigger threshold?
2. **Delay** — if TE delay > 0, wait N candles after trigger before arming.
3. **Fill** — would the limit order have filled?
4. **Outcome** — WIN / LOSS / BE / PROTECTION_EXIT from TP/SL/protection logic.
5. **Excursion** — MAE and MFE in R from the fill price.
6. **Invalidation** — if price closes beyond the OB far side, ghost = INVALIDATED.
7. **Run end** — any ghost still tracking = NEVER_TRIGGERED or UNFILLED.

The simulation uses the same geometric rules as the real triggered-edge pass
(penetration%, fill-at-limit, TP/SL hit), keeping ghost outcomes directly
comparable to real outcomes.

---

## Verification checklist

After integrating, run the same config twice and confirm:

### ✅ Real trade results unchanged
- Trade count identical
- All outcomes (WIN/LOSS/BE/...) identical
- All R values identical
- All fill timestamps identical
- All existing CSV columns byte-identical

### ✅ Ghost fields present
- `ghost_candidate = True` for every retrace-cancelled OB row
- `ghost_candidate = False` for all filled trade rows
- `ghost_outcome` is one of: WIN | LOSS | BE | PROTECTION_EXIT | UNFILLED | NEVER_TRIGGERED | INVALIDATED
- `cancel_reason = "retrace_cancel"` on retrace-cancelled rows

### ✅ Summary fields present
- `ghost_candidates_total >= 0`
- `ghost_wins + ghost_losses + ghost_breakevens + ghost_protection_exits + ghost_unfilled + ghost_never_triggered == ghost_candidates_total`

### ✅ Frontend activation
- Import the run into FX-OB-Research-Lab
- RunDetail → ghost KPI strip should appear when `ghost_candidates_total > 0`
- Entries Lab → Model Analysis → Trigger Behavior tier should show GhostOutcomePanel
- Strategy Map → ghost layer toggles should activate (when `ghost_candidate = True` rows exist)

---

## Troubleshooting

**Ghost candidates count is 0**
→ `add_candidate` is not being called. Add a `print(f"Ghost: registered {ob['ob_id']}")` in the cancel block to confirm.

**All ghosts show NEVER_TRIGGERED**
→ `tick_all` is not being called, OR `ob.top` / `ob.bottom` are zero (geometry not set on the ob dict at cancel time).

**Ghost outcomes differ from expected**
→ Check that `entry`, `stop`, `tp` on the ob dict are the same values used for real fills. If stop is set after the cancel point, pass them explicitly.

**Frontend shows no ghost data**
→ Verify `ghost_candidate` column exists in the CSV headers and has lowercase `true` / `false` values (the frontend `boolOrNull()` parser handles case).

---

## Phase 2 extensions (not in scope now)

When first-failed-tag cancel is added to the backtester:

```python
ghost_tracker.add_candidate(ob, "first_failed_tag")
```

When TE delay arm validity is added (Phase 3), `GhostState` will need a new
`arm_validity` field — no changes to the core tick() loop, just an extra field
on `to_fields()`.

---

_End of LUX-GHOST-PHASE-1 integration guide._
