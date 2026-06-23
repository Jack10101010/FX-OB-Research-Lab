# BE-MATRIX-V2 — Phase 3C: Divergence Characterization (scope-defining finding)

> Before building 3C I measured **what actually diverges** on real data. The
> result overturns the working assumption: the Phase-2 failure class is **not**
> fill-candle same-candle BE — it is **cross-trade reverse-conflict coupling**.
> That changes what 3C must be.

## Method
`scripts/diag_be_fillcandle_divergence.py` — for each arm, legacy per-arm walk vs
a Phase-2-style derive over the **filled-trade window `[fi..xi]`** (the fill
candle IS included, so fill-candle arming/stopping is fully exercised). Any
mismatch is therefore not a fill-candle issue. Each divergent trade is classified
by whether it was filled or unfilled in the base (no-BE) walk.

## Result (test_control_run, baseline, wick, 40k candles, 302 base rows)
```
arm 0.25R: divergent=7  cross-trade(base-unfilled)=7  per-trade(base-filled)=0
arm 1.00R: divergent=4  cross-trade(base-unfilled)=4  per-trade(base-filled)=0
TOTAL: cross-trade=11  per-trade=0
```
Every divergent trade: legacy `BE_EXIT`/`LOSS` vs derived `REVERSE_TOUCH_CANCEL`, and **base-unfilled** in all 11 cases (ob 40/56/79/126/141/215/228 …).

## Interpretation
1. **Per-trade fill-candle BE is already 100% derivable** (`per-trade == 0`). BE_EXIT-vs-LOSS, arm-then-stop, and delay on the fill candle are reproduced exactly by the existing derive. There is **no fill-candle same-candle bug to fix.**
2. **The entire residual divergence is cross-trade coupling.** `_has_reverse_conflict(active_trades, dir)` (execution.py:1405, unconditional — no config gate) gates `REVERSE_TOUCH_CANCEL`. BE only ever *shortens* an active span, so a `BE_EXIT` can remove an opposite-direction trade from `active_trades` sooner, dissolving the conflict that would have cancelled a pending order — so that order **fills** under BE while it **cancels** in the base walk. A derive-from-base walk has no fill record for those orders and cannot reconstruct them.
3. **It cascades.** A freed order that fills becomes a *new* active trade, which can create a conflict that cancels a different order that was filled in the base walk. Divergence therefore propagates in both directions — a localized "repair pass" over reverse-cancelled rows is not closed under the dynamics and cannot guarantee byte-parity.

## Consequence for Phase 3C scope
- The 3C prompt ("add fill-candle same-candle BE handling") targets a class that is already correct. Implementing only that would **not** eliminate the wick fallback, because the fallback exists to cover the cross-trade trades — not the fill-candle ones.
- Eliminating the fallback **byte-identically** requires the reverse-conflict gate to be evaluated against **each arm's own active set**. Because of the cascade, that means running the genuine pending→fill→active→exit interaction **per arm** — i.e. a true parallel in-loop multi-arm engine, not a post-hoc derive.
- This is larger than a "fill-candle slice." It is the real in-loop engine the project has been building toward — and it should still be done **incrementally and parity-gated** (legacy untouched, flag OFF).

## Recommendation
Pivot Phase 3C to **3C′: parallel per-arm in-loop** in a new experimental function:
one candle walk, N independent `(pending, active, trades)` states (one per arm),
sharing OB spawn / news / fill-geometry, with the BE arm/stop decision and the
reverse-conflict gate evaluated per arm. Byte-correct *by construction* (it runs
the real branch logic), so it subsumes both the fill-candle case and the
cross-trade case. Build it in reviewable steps, gate on the real-data parity
harness (3E) before the flag flips.

No engine change in this step; flag still OFF. Added read-only diagnostics:
`scripts/diag_be_fillcandle_divergence.py`, `scripts/audit_be_fillcandle_fallback.py`.
