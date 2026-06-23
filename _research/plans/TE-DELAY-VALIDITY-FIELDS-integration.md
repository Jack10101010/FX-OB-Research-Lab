# TE-DELAY-VALIDITY-FIELDS — Backend Instrumentation Guide
_Date: 2026-06-04 · Status: Ready to implement · Task ID: TE-DELAY-VALIDITY-FIELDS-GUIDE-1_

---

## 1. Purpose

Add observational-only instrumentation fields to the triggered-edge (TE) delay simulation loop in Lux-OB-Backtester. These fields record what price was doing relative to the OB during the delay window — between the trigger fire and the moment the limit order arms.

No trade behaviour changes. No order cancellation. No fills altered. No R affected. Append-only CSV columns and optional summary counts.

---

## 2. Why This Matters

When triggered-edge delay is configured (delay=1, 2, or 3 candles), the trigger fires on candle C but the limit order does not arm until candle C+N. During those N candles, price can:

- **Remain inside the OB** (Scenario A — intended, no issue)
- **Exit the OB through the entry side and never return** (Scenario B — order never fills, harmless)
- **Exit the OB through the entry side, then return and fill** (Scenario C — the bug candidate)
- **Exit through the far side, triggering `ob_fully_breached`** (Scenario D — already protected)

Scenario C is the research validity concern. The engine's pre-trigger cancel rules (including `triggered_edge_cancel_on_retrace`) stop when the trigger fires. The far-side breach (`ob_fully_breached`) does not fire when price exits through the entry side. This means Scenario C fills currently pass through as valid trades, indistinguishable from Scenario A fills.

For delay=1 (already live), the exposure window is one candle. For delay=2/3 (proposed), the window is two or three candles. The longer the window, the higher the probability of a Scenario C fill — a limit order filling into an OB that price already vacated and potentially consumed.

These instrumentation fields allow post-hoc identification and analysis of Scenario C fills without altering any existing behaviour.

---

## 3. Lifecycle Stage Where Instrumentation Belongs

```
[Trigger fires — Stage 4 in lifecycle]
  trigger_candle_index = C
  trigger_time         = T
  *** Pre-trigger cancel rules deactivate here ***

  [INSTRUMENTATION STARTS HERE]
  Initialize per-OB delay window tracker:
    - delay_tracker.start(ob, trigger_candle_index, delay_candles_configured)

[Delay window — Stage 5, candles C+1 through C+(N-1)]
  For each candle in delay window:
    - delay_tracker.tick(candle)   ← observational only, no order effects

[Arm candle — candle C+N]
  - delay_tracker.finalize(arm_candle, arm_candle_index)
  - All fields now available for CSV export

[Fill / exit — Stages 6–7]
  No instrumentation needed here.
  All delay-window observation is complete at arm time.
```

The tracker observes the window between trigger and arm. It does not participate in order logic.

---

## 4. Required CSV Fields

These five fields must be added to every triggered-edge trade row.

| Field | Type | Description |
|---|---|---|
| `delay_candles_configured` | int | The configured TE delay integer (0, 1, 2, 3). 0 = same-candle/no delay. Always set. |
| `arm_candle_index` | int or null | Candle index where the limit order becomes active (eligible to fill). For delay=0, equals `trigger_candle_index` when armed immediately. Null if OB is cancelled before arming (e.g. `ob_fully_breached` during delay window). |
| `exited_ob_before_arm` | bool or null | True if price fully exited the OB on the entry side at any point between trigger fire and arm candle (exclusive of arm candle itself). See §8 for exact exit definition. Null for non-triggered rows. |
| `ob_occupied_at_arm` | bool or null | True if the arm candle intersects the OB range. False if the arm candle is fully outside the OB. Null for non-triggered or cancelled rows. |
| `armed_after_ob_exit` | bool or null | True if `exited_ob_before_arm = True` AND the limit still armed. This is the Scenario C flag — the key research signal. Null or False for all other rows. |

---

## 5. Optional CSV Fields

Add these if they are cheap to compute at the tracking point. If any require significant refactoring to produce, skip and document why.

| Field | Type | Description |
|---|---|---|
| `ob_exit_candle_index` | int or null | Candle index of the first entry-side OB exit during the delay window. Null if no exit occurred. |
| `ob_exit_time` | timestamp or null | Timestamp of the first entry-side OB exit during the delay window. |
| `price_distance_from_ob_at_arm_pips` | float or null | Distance from nearest OB edge at arm time, expressed in pips. Use arm candle close or open, whichever the existing arming logic evaluates. Positive = price is outside OB, 0 = price is at edge, negative = price is inside OB. |
| `delay_window_min_price` | float or null | Lowest price (candle low) across all candles in the delay window (C+1 through C+N-1). For bullish OBs this shows deepest penetration; for bearish OBs this shows how far below OB price went. |
| `delay_window_max_price` | float or null | Highest price (candle high) across all candles in the delay window. For bullish OBs this shows how far above OB top price went. |
| `retraced_out_before_arm` | bool or null | True when `exited_ob_before_arm = True`. Alias for readability — indicates the retrace-cancel condition was met but could not fire (because it is a pre-trigger-only rule). Useful as a filter column in research queries. |

---

## 6. Summary Fields

Add to `summary.json` after calling the existing summary export. Skip any field that requires joining trade-level data that is not already aggregated at summary time — document which were skipped and why.

```json
{
  "delay_exited_ob_before_arm_count":   int,
  "delay_armed_after_ob_exit_count":    int,
  "delay_ob_occupied_at_arm_count":     int,
  "delay_armed_after_ob_exit_win_rate": float,
  "delay_armed_after_ob_exit_net_r":    float,
  "delay_occupied_at_arm_win_rate":     float,
  "delay_occupied_at_arm_net_r":        float
}
```

These allow a single-line comparison in research output:

```
armed_after_ob_exit:   N trades, WR=X%, net_R=Y
occupied_at_arm:       M trades, WR=A%, net_R=B
```

If computing `win_rate` and `net_r` splits requires iterating over the trade list at summary time and that pattern does not already exist, add only the counts and skip the rate/R fields, noting the gap.

---

## 7. Exact Field Definitions

### `delay_candles_configured`

The integer value of the TE delay setting for this run.

```python
# Read from config at run start:
delay_candles_configured = int(
    config.get("te_delay_candles") or
    config.get("triggered_edge_delay_candles") or
    0
)
```

Set this on the trade row at the same point you set `trigger_candle_index`. It is a run-level constant — same value for all trades in a run. Setting it per-trade (rather than only in summary) allows per-trade filtering.

---

### `arm_candle_index`

The candle index at which the limit order becomes eligible to fill.

```python
# For delay=0 (same-candle arm):
arm_candle_index = trigger_candle_index   # if same_candle_entry_allowed and armed immediately
                                          # else trigger_candle_index + 1 depending on impl

# For delay=N (N >= 1):
arm_candle_index = trigger_candle_index + N

# If the OB is cancelled before arming (ob_fully_breached, news_blackout, etc.):
arm_candle_index = None
```

This field is conceptually distinct from `armed_at` (which is a timestamp placed when the order is PLACED) and from `trigger_candle_index` (the candle the threshold was reached). For delay>0 they will differ.

---

### `exited_ob_before_arm`

Tracks whether price fully vacated the OB through the entry side at any point during the delay window. Evaluated over candles strictly between the trigger candle and the arm candle (inclusive of the trigger candle's remaining bars if applicable, exclusive of the arm candle itself).

See §8 for exact per-direction logic.

```python
exited_ob_before_arm = any(
    _is_full_candle_exit(candle, ob)
    for candle in delay_window_candles
)
```

Set to `False` (not `None`) for triggered rows where no exit occurred. Set to `None` for rows where the trigger was never reached.

---

### `ob_occupied_at_arm`

Whether price is intersecting the OB range at the arm candle.

```python
def _ob_occupied_at_arm(arm_candle, ob):
    """True if arm candle intersects OB range [bottom, top]."""
    return (arm_candle["high"] >= ob["bottom"] and
            arm_candle["low"]  <= ob["top"])
```

This is True as long as any part of the arm candle's range overlaps the OB. A candle that opens outside but wicks back into the OB counts as occupied. A candle that is entirely above OB top (bullish exit) or entirely below OB bottom (bearish exit) returns False.

Set to `None` for non-triggered or cancelled rows.

---

### `armed_after_ob_exit`

The Scenario C flag.

```python
armed_after_ob_exit = (
    exited_ob_before_arm is True and
    arm_candle_index is not None  # i.e., the limit still armed
)
```

This is True only when BOTH conditions hold: price left the OB entry-side during the delay window AND the limit order still armed afterward. False for all rows where either condition does not hold. Null for non-triggered rows.

---

## 8. Bullish vs Bearish OB Exit Logic

### Bullish OB

```
OB layout:
  top    = upper boundary (entry side — price approaches from above, entering from top)
  bottom = lower boundary (far side — structural breach if price closes below this)

Entry-side exit (price rallies out through top after trigger):
  Strict full-candle rule:    candle.low  > ob.top
  Close-based fallback:       candle.close > ob.top
  → Use strict rule if the engine has candle-level OHLC at the delay evaluation point.
  → Document which rule was used.

Far-side breach (already handled by ob_fully_breached):
  candle.close < ob.bottom    ← NOT this instrumentation's concern
```

### Bearish OB

```
OB layout:
  top    = upper boundary (far side — structural breach if price closes above this)
  bottom = lower boundary (entry side — price approaches from below, entering from bottom)

Entry-side exit (price drops out through bottom after trigger):
  Strict full-candle rule:    candle.high  < ob.bottom
  Close-based fallback:       candle.close < ob.bottom
  → Use strict rule if OHLC is available.
  → Document which rule was used.

Far-side breach (already handled by ob_fully_breached):
  candle.close > ob.top       ← NOT this instrumentation's concern
```

### Reference implementation

```python
def _is_full_candle_exit(candle, ob, direction):
    """
    Returns True if this candle represents a full entry-side OB exit.
    Uses strict full-candle rule (candle is entirely outside OB entry-side).
    Falls back to close-based rule only if OHLC is unavailable.
    """
    c_high  = candle.get("high",  candle.get("h"))
    c_low   = candle.get("low",   candle.get("l"))
    c_close = candle.get("close", candle.get("c"))
    ob_top    = ob["top"]
    ob_bottom = ob.get("bottom", ob.get("bot"))

    if _is_bullish(direction):
        if c_low is not None:
            return c_low > ob_top          # strict: entire candle above OB top
        return c_close > ob_top            # fallback: close above OB top

    else:  # bearish
        if c_high is not None:
            return c_high < ob_bottom      # strict: entire candle below OB bottom
        return c_close < ob_bottom         # fallback: close below OB bottom


def _ob_occupied_at_arm(arm_candle, ob):
    """
    Returns True if arm candle intersects OB range [bottom, top].
    A candle that wicks into the OB even slightly counts as occupied.
    """
    c_high = arm_candle.get("high",  arm_candle.get("h"))
    c_low  = arm_candle.get("low",   arm_candle.get("l"))
    ob_top    = ob["top"]
    ob_bottom = ob.get("bottom", ob.get("bot"))

    if c_high is None or c_low is None:
        # OHLC unavailable — fall back to close-based check
        c_close = arm_candle.get("close", arm_candle.get("c"))
        return ob_bottom <= c_close <= ob_top

    return c_high >= ob_bottom and c_low <= ob_top
```

---

## 9. Delay-Window State Tracking Pseudocode

```python
class DelayWindowTracker:
    """
    Observational tracker for one OB's delay window.
    Instantiated when trigger fires. Ticked on each candle in the delay window.
    Finalized at the arm candle.

    Does not affect order logic. Read-only observer.
    """

    def __init__(self, ob, trigger_candle_index, delay_candles_configured):
        self.ob                       = ob
        self.trigger_candle_index     = trigger_candle_index
        self.delay_candles_configured = delay_candles_configured
        self.arm_candle_index         = trigger_candle_index + delay_candles_configured
                                        # For delay=0, arm = trigger (same candle)

        # Observation state
        self.exited_ob_before_arm     = False
        self.ob_exit_candle_index     = None
        self.ob_exit_time             = None
        self.delay_window_min_price   = None
        self.delay_window_max_price   = None

        # Arm-candle state (populated in finalize())
        self.ob_occupied_at_arm       = None
        self.armed_after_ob_exit      = None
        self.price_distance_from_ob_at_arm_pips = None

        self.finalized = False

    def tick(self, candle, candle_index):
        """
        Called for each candle in the delay window:
          candles strictly after trigger (trigger_candle_index + 1)
          up to but NOT including arm_candle_index.

        For delay=0 (same-candle arm), tick() is never called — the window is zero candles.
        For delay=1, tick() is called once (candle at trigger_candle_index + 1 only if
          this candle is before arm — but for delay=1, arm_candle_index = trigger + 1,
          so tick range is empty; check your engine's definition of "arm candle" carefully).

        Implementor note: determine whether the arm candle is included in tick() or
        only in finalize(). The safest pattern: tick() covers window_start to window_end
        exclusive; finalize() handles the arm candle specifically.
        """
        if self.finalized:
            return
        if candle_index >= self.arm_candle_index:
            return  # arm candle handled in finalize()

        c_high  = candle.get("high",  candle.get("h"))
        c_low   = candle.get("low",   candle.get("l"))

        # Track price extremes across delay window
        if c_low is not None:
            self.delay_window_min_price = (
                min(self.delay_window_min_price, c_low)
                if self.delay_window_min_price is not None
                else c_low
            )
        if c_high is not None:
            self.delay_window_max_price = (
                max(self.delay_window_max_price, c_high)
                if self.delay_window_max_price is not None
                else c_high
            )

        # Check for first entry-side OB exit
        if not self.exited_ob_before_arm:
            if _is_full_candle_exit(candle, self.ob, self.ob["direction"]):
                self.exited_ob_before_arm   = True
                self.ob_exit_candle_index   = candle_index
                self.ob_exit_time           = candle.get("time", candle.get("t"))

    def finalize(self, arm_candle, arm_candle_index, pip_size=0.0001, cancelled=False):
        """
        Called once, at the arm candle (or at cancellation before arm).

        cancelled=True: OB was cancelled before arming (ob_fully_breached, news_blackout, etc.)
          → set arm_candle_index = None, ob_occupied_at_arm = None, armed_after_ob_exit = None
        """
        self.finalized = True

        if cancelled:
            self.arm_candle_index         = None
            self.ob_occupied_at_arm       = None
            self.armed_after_ob_exit      = None
            self.price_distance_from_ob_at_arm_pips = None
            return

        self.arm_candle_index = arm_candle_index
        self.ob_occupied_at_arm = _ob_occupied_at_arm(arm_candle, self.ob)

        self.armed_after_ob_exit = (
            self.exited_ob_before_arm and
            arm_candle_index is not None
        )

        # price_distance_from_ob_at_arm_pips
        ob_top    = self.ob["top"]
        ob_bottom = self.ob.get("bottom", self.ob.get("bot"))
        arm_close = arm_candle.get("close", arm_candle.get("c"))
        if arm_close is not None and pip_size > 0:
            if arm_close > ob_top:
                dist_price = arm_close - ob_top
            elif arm_close < ob_bottom:
                dist_price = ob_bottom - arm_close
            else:
                dist_price = 0.0
            self.price_distance_from_ob_at_arm_pips = round(dist_price / pip_size, 1)

    def to_fields(self):
        """
        Returns the dict of all delay-window fields for the CSV row.
        Call after finalize().
        """
        return {
            "delay_candles_configured":             self.delay_candles_configured,
            "arm_candle_index":                     self.arm_candle_index,
            "exited_ob_before_arm":                 self.exited_ob_before_arm,
            "ob_occupied_at_arm":                   self.ob_occupied_at_arm,
            "armed_after_ob_exit":                  self.armed_after_ob_exit,
            # Optional fields:
            "ob_exit_candle_index":                 self.ob_exit_candle_index,
            "ob_exit_time":                         self.ob_exit_time,
            "price_distance_from_ob_at_arm_pips":   self.price_distance_from_ob_at_arm_pips,
            "delay_window_min_price":               self.delay_window_min_price,
            "delay_window_max_price":               self.delay_window_max_price,
            "retraced_out_before_arm":              self.exited_ob_before_arm,  # alias
        }
```

### Empty fields (non-triggered OB rows)

```python
EMPTY_DELAY_FIELDS = {
    "delay_candles_configured":             None,
    "arm_candle_index":                     None,
    "exited_ob_before_arm":                 None,
    "ob_occupied_at_arm":                   None,
    "armed_after_ob_exit":                  None,
    "ob_exit_candle_index":                 None,
    "ob_exit_time":                         None,
    "price_distance_from_ob_at_arm_pips":   None,
    "delay_window_min_price":               None,
    "delay_window_max_price":               None,
    "retraced_out_before_arm":              None,
}
```

For rows where the trigger was never reached (NEVER_TRIGGERED, INVALIDATED before trigger, session cancel before trigger), emit `EMPTY_DELAY_FIELDS`. The `delay_candles_configured` field may optionally still be set (as a run-level constant) even on non-triggered rows for schema consistency — document the choice.

---

## 10. Integration Call Sites

These are the five locations the backtester team must wire. Location names are pseudocode — match them to actual function and variable names in the backtester source.

### Call site 1 — Read config (once per run)

```python
# In run_backtest.py or wherever config is consumed:
DELAY_CANDLES = int(
    config.get("te_delay_candles") or
    config.get("triggered_edge_delay_candles") or
    0
)
PIP_SIZE = float(config.get("pip_size", 0.0001))
```

### Call site 2 — Instantiate tracker when trigger fires

In the triggered-edge candle loop, immediately after writing `trigger_candle_index` and `trigger_time` to the OB record:

```python
# Existing code (do not change):
ob["trigger_candle_index"] = candle_index
ob["trigger_time"]         = candle["time"]
# ...

# ADD — instantiate delay window tracker:
ob["_delay_tracker"] = DelayWindowTracker(
    ob=ob,
    trigger_candle_index=candle_index,
    delay_candles_configured=DELAY_CANDLES,
)
```

### Call site 3 — Tick tracker on every candle after trigger

In the innermost candle loop, after trigger has fired but before arm, add:

```python
# For each triggered OB that has not yet armed:
if ob.get("_delay_tracker") and not ob["_delay_tracker"].finalized:
    ob["_delay_tracker"].tick(candle, candle_index)
```

This is O(n_active_delayed_obs) per candle. Overhead is negligible for typical run sizes.

### Call site 4a — Finalize at arm candle (normal arm)

At the point where the limit order becomes active/eligible-to-fill:

```python
# Existing arming logic (do not change):
ob["armed_at"] = arm_time
# ...

# ADD — finalize delay tracker:
if ob.get("_delay_tracker"):
    ob["_delay_tracker"].finalize(
        arm_candle=current_candle,
        arm_candle_index=candle_index,
        pip_size=PIP_SIZE,
        cancelled=False,
    )
```

### Call site 4b — Finalize at cancellation before arm

At every point where an OB is cancelled/removed before arming (ob_fully_breached, news_blackout, session_cancel, conflict_cancel, etc.):

```python
# Existing cancel logic (do not change):
ob["cancelled_before_entry"] = True
# ...

# ADD — finalize delay tracker as cancelled:
if ob.get("_delay_tracker") and not ob["_delay_tracker"].finalized:
    ob["_delay_tracker"].finalize(
        arm_candle=None,
        arm_candle_index=None,
        pip_size=PIP_SIZE,
        cancelled=True,
    )
```

### Call site 5 — Emit fields to CSV row

When building the trade CSV row, append delay fields after all existing columns:

```python
row = {
    # ... all existing fields (unchanged) ...
}

if ob.get("_delay_tracker") and ob["_delay_tracker"].finalized:
    row.update(ob["_delay_tracker"].to_fields())
else:
    row.update(EMPTY_DELAY_FIELDS)
    # For non-triggered rows: optionally still set delay_candles_configured
    row["delay_candles_configured"] = DELAY_CANDLES
```

### Call site 6 — Summary fields (optional)

In `run_backtest.py`, after all trades have been finalized:

```python
all_rows = [...]  # list of all trade row dicts

def _delay_summary(rows, pip_size):
    triggered_rows = [r for r in rows if r.get("delay_candles_configured") is not None]
    exited  = [r for r in triggered_rows if r.get("exited_ob_before_arm") is True]
    armed_after = [r for r in triggered_rows if r.get("armed_after_ob_exit") is True]
    occupied    = [r for r in triggered_rows if r.get("ob_occupied_at_arm") is True]

    def _wr(subset):
        wins = [r for r in subset if r.get("outcome") == "win"]
        return round(len(wins) / len(subset) * 100, 1) if subset else None

    def _net_r(subset):
        return round(sum(r.get("r", 0) or 0 for r in subset), 2) if subset else None

    return {
        "delay_exited_ob_before_arm_count":   len(exited),
        "delay_armed_after_ob_exit_count":    len(armed_after),
        "delay_ob_occupied_at_arm_count":     len(occupied),
        "delay_armed_after_ob_exit_win_rate": _wr(armed_after),
        "delay_armed_after_ob_exit_net_r":    _net_r(armed_after),
        "delay_occupied_at_arm_win_rate":     _wr(occupied),
        "delay_occupied_at_arm_net_r":        _net_r(occupied),
    }

summary.update(_delay_summary(all_rows, PIP_SIZE))
```

If iterating over completed trade rows at summary time is not a supported pattern in the existing backtester, skip the rate/R summary fields and add only:

```json
{
  "delay_exited_ob_before_arm_count":  int,
  "delay_armed_after_ob_exit_count":   int,
  "delay_ob_occupied_at_arm_count":    int
}
```

---

## 11. Verification Checklist

### Before running (code review)
- [ ] `DelayWindowTracker` is instantiated ONLY after trigger fires, not earlier
- [ ] `tick()` is NOT called on the trigger candle itself (it is not part of the delay window)
- [ ] `tick()` is NOT called on the arm candle (handled by `finalize()`)
- [ ] `finalize(cancelled=True)` is called at ALL pre-arm cancellation paths
- [ ] No existing field values are overwritten (only new fields appended)
- [ ] `_delay_tracker` key is cleaned up after CSV export (no state leak between runs)

### Delay=0 run (same-candle mode)
- [ ] `delay_candles_configured = 0` on all rows
- [ ] `arm_candle_index = trigger_candle_index` (or trigger + 0)
- [ ] `exited_ob_before_arm = False` on all triggered rows (window is zero candles)
- [ ] `ob_occupied_at_arm = True` on triggered rows (arm happens on trigger candle, price is in OB)
- [ ] `armed_after_ob_exit = False` on all rows
- [ ] `delay_window_min_price = None`, `delay_window_max_price = None` (no window candles)
- [ ] Trade count, outcomes, R values unchanged vs baseline run

### Delay=1 run (next-candle mode)
- [ ] `delay_candles_configured = 1` on all rows
- [ ] `arm_candle_index = trigger_candle_index + 1` on triggered rows
- [ ] `exited_ob_before_arm` populated on all triggered rows (True or False)
- [ ] At least some rows have `ob_occupied_at_arm = False` if market was moving
- [ ] `armed_after_ob_exit = True` on any row where price exited entry-side between trigger and arm
- [ ] Trade count, outcomes, R values unchanged vs baseline run

### Delay=2 run (if available)
- [ ] `delay_candles_configured = 2` on all rows
- [ ] `arm_candle_index = trigger_candle_index + 2`
- [ ] `armed_after_ob_exit = True` rows should be more numerous than delay=1 equivalent run
- [ ] Trade count, outcomes, R values unchanged vs baseline run

### Real trade integrity check
Run the same config twice (with and without instrumentation) and confirm:
- [ ] Trade count identical
- [ ] All `outcome` values identical
- [ ] All `r` values identical
- [ ] All `fill_time` / `trigger_time` values identical
- [ ] All existing CSV columns byte-identical
- [ ] New columns appear only after all existing columns

### Research validity signal
After verifying field correctness, run the smallest manual check (see TE-DELAY-VALIDITY-1.md §10):
- [ ] Filter `armed_on_trigger_candle = true AND filled_on_trigger_candle = false` (delay=1 fills)
- [ ] Check `armed_after_ob_exit` on this subset
- [ ] Compare `r` and `outcome` for `armed_after_ob_exit = True` vs `False`
- [ ] Report count and performance split — this is the Scenario C evidence

---

## 12. Explicit Non-Goals

This instrumentation deliberately does NOT:

- **Cancel orders** when `exited_ob_before_arm = True` — fields are observational only
- **Change fills** — no fill price, fill time, or fill logic is altered
- **Change R, outcome, or equity** — all trade results are identical before and after
- **Implement `arm_validity` or post-trigger retrace cancel** — that is a separate future decision, dependent on the data this instrumentation produces
- **Implement first-failed-tag cancellation** — separate feature
- **Integrate ghost tracking** — separate feature (ghost_tracker.py is already ready)
- **Modify frontend** — no CSV column changes affect existing frontend parsing (columns are appended)
- **Claim implementation complete** — this guide documents what to add; the actual implementation requires the Lux-OB-Backtester source files

---

## Required CSV Column Ordering

Append all delay validity columns AFTER all existing triggered-edge columns:

```python
DELAY_VALIDITY_COLUMNS = [
    # Required:
    "delay_candles_configured",
    "arm_candle_index",
    "exited_ob_before_arm",
    "ob_occupied_at_arm",
    "armed_after_ob_exit",
    # Optional:
    "ob_exit_candle_index",
    "ob_exit_time",
    "price_distance_from_ob_at_arm_pips",
    "delay_window_min_price",
    "delay_window_max_price",
    "retraced_out_before_arm",
]
```

Appending after existing columns ensures downstream CSV parsers are not broken by column index shifts — same pattern as the ghost tracking columns in `LUX-GHOST-PHASE-1-integration.md`.

---

## Status

**Real backend integration: BLOCKED.**

The Lux-OB-Backtester repo (`execution.py`, `run_backtest.py`, triggered-edge simulation loop) is not present in the connected folder. Only `FX-OB-Research-Lab` (frontend + thin FastAPI wrapper) is mounted.

When the backtester repo is available:
- This guide provides complete implementation specifications
- The `DelayWindowTracker` pseudocode in §9 can be ported directly
- Wire the 6 call sites in §10
- Run the verification checklist in §11

No files were modified except this guide. No source code was changed.

---

## Future Research Backlog

Items deferred until after TE validity instrumentation is live, ghost tracking is integrated, and initial delay validity analysis is complete.

### `delay_exit_duration_candles`

**Definition:** Number of candles spent outside the OB between the first entry-side exit and the first re-entry, within the delay window.

```
Trigger fires
↓
Price exits OB entry-side  (exited_ob_before_arm = True)
↓
Price remains outside OB   ← count these candles
↓
Price re-enters OB
↓
Fill occurs

delay_exit_duration_candles = candles spent outside OB in that gap
```

**Why it matters:** `armed_after_ob_exit = True` currently collapses two meaningfully different cases:

- Price exits for 1 candle, immediately returns → brief wick-out, OB possibly still intact
- Price exits for 10+ candles, eventually returns → sustained move away, OB likely consumed

Hypothesis: longer exit durations correlate with higher probability of OB consumption, lower win rate, and lower R expectancy than short-duration exits. If confirmed, `delay_exit_duration_candles` becomes a filter for excluding the highest-distortion Scenario C fills from delay comparisons.

**Prerequisite before implementing:** `exited_ob_before_arm`, `ob_exit_candle_index`, and `armed_after_ob_exit` must be live and validated in at least one full delay=1 or delay=2 run. The exit duration field is only meaningful once the base exit detection is confirmed correct.

**Implementation note (when the time comes):** Add `ob_reentry_candle_index` (the first candle after OB exit where price re-enters the OB range) alongside `delay_exit_duration_candles`. The duration is simply `ob_reentry_candle_index - ob_exit_candle_index`. Both fields can be computed inside `DelayWindowTracker.tick()` with a state flag tracking whether the OB is currently unoccupied post-exit.

---

_End of TE-DELAY-VALIDITY-FIELDS integration guide._
