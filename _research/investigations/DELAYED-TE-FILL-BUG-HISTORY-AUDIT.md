# History of the Delayed Triggered-Edge Phantom-Fill Bug

**Repo:** Lux-OB-Backtester. **Mode:** Audit only — no code changed.

## Introducing commit

| | |
|---|---|
| **Commit** | **`0e575ec`** |
| **Subject** | `feat(triggered-edge): add candle delays and first-failed-tag cancel` |
| **Author** | Jack |
| **Date** | **Wed Jun 3 19:20:59 2026 +0000** |

The bug was **born with the feature itself** — the commit that first added candle delays to
triggered-edge entries. Its parent (`0e575ec^`) contains **zero** occurrences of
`triggered_edge_armed` / `trigger_delay_candles`, so the delayed-entry capability and the inverted
fill condition were introduced together.

The original fill-confirm helper (which later became `_is_fill_confirmed`) shipped inverted from day
one:
```python
# Price must bounce back to OB edge from the trigger side
if ob["direction"] == "bullish":
    return candle["high"] >= plan["entry"]   # ← inverted: a bullish limit must be low <= entry
return candle["low"]  <= plan["entry"]       # ← inverted: a bearish limit must be high >= entry
```
The comment — *"Price must bounce back to OB edge from the trigger side"* — reveals the conceptual
error: the author modelled the armed entry as a **momentum edge-cross** (fill when price is on the
far side of the edge) rather than a **limit touch** (fill when price trades back *to* the edge). At
delay 0 the two are indistinguishable; with a real delay they diverge.

## Was it caused by the performance/speed work? **No — the perf work only carried it forward.**

Tracing the exact lines after `0e575ec`:
- **`7fb6838` perf(execution): inline fill-decision helpers** — inlined `_is_fill_confirmed` into the
  hot loop. The inverted logic was **preserved verbatim** (helper deleted, same expression inlined).
- **`146c037` perf(execution): hoist hot-loop dict lookups** — renamed `plan["entry"]` → `_pm_entry`,
  `ob["direction"]` → `_pm_dir` (cosmetic hoisting). Logic unchanged. *(A `git log -S` on the
  `_pm_entry`-form string points here only because the variable names first appear here — not the
  logic.)*
- All other perf commits (`5c286cb`, `0a64e37`, `8f96b17`, `a83d4e6`, `d3d1e6c`, news precompute,
  etc.) never touched the comparison.
- **`dba2bb8` fix(execution): require true post-arm touch for delayed entries** — the fix (now HEAD).

So the speed work **neither introduced nor exposed** the bug. It predates and is independent of all
of it.

## What *exposed* it: deep delays

The defect is **latent at shallow delays** and only becomes material as the delay grows — because at
small delays the arm candle is still near the OB edge, so `high >= entry` and `low <= entry` mostly
coincide. Measured invalid-fill rate (entry outside the fill candle's range) by arm, from the actual
run datasets:

| arm | invalid fills | arm | invalid fills |
|---|---|---|---|
| **C0** | **0 %** (arm=trigger candle straddles the edge) | C20 | 63 % |
| C1 | 7 % | C25 | 65 % |
| C2 | 19 % | C30 | 66 % |
| C3 | 22 % | C35 | 74 % |
| C4 | 29 % | C40 | 73 % |
| C5 | 34 % | C45 | 73 % |
| C6 | 37 % | C50 | 79 % |

*(Shallow column from run 22cdd55d (C0–C6); deep column from run 86c11cdc (C20–C50).)*

- **C0 runs: completely unaffected** (0 %) — the only fully-safe arm.
- **C1: minimal (7 %)**; **C2–C6: moderate and rising (19 → 37 %)**.
- **C20–C50: dominant (63 → 79 %)** — this is where the bug fabricated the apparent edge.

The historical default delays were shallow (`long/short_triggered_edge_delays = [0, 1]` ⇒ C0/C1), so
the bug stayed effectively invisible in routine runs. It was **exposed by the deep-delay research
runs (C20–C50)** introduced later, which is exactly when the phantom fills and inflated edge surfaced.

## Affected scenario types

- **Affected:** delayed (Cn>0) **triggered-edge** entries only, both directions. Severity scales
  monotonically with delay depth (0 % at C0 → ~79 % at C50).
- **Not affected:** Baseline and Penetration entries, and **pre-armed** triggered-edge tap detection —
  all use the correct `_is_filled` (`low<=entry` bullish / `high>=entry` bearish). C0 triggered-edge
  is also effectively safe (straddle).

## Summary
The phantom-fill bug originated in **`0e575ec` (3 Jun 2026)**, the feature commit that added
triggered-edge candle delays — an inverted limit-touch test written into the fill-confirm helper from
the start. The later performance/inlining work carried it forward unchanged but did **not** cause or
expose it. It remained dormant under shallow default delays (C0/C1) and was surfaced only by the
deep-delay (C20–C50) runs, where it corrupted 63–79 % of fills. Fixed in `dba2bb8`.

*No code was changed. Audit only.*
