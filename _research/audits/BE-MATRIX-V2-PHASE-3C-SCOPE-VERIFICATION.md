# BE-MATRIX-V2 — Phase 3C Scope Verification (read-only audit)

> Verify, before building, exactly what diverges between a no-BE walk and a
> per-arm BE walk, what causes it, and whether eliminating the wick fallback
> byte-identically truly requires a parallel per-arm engine. **No engine code
> changed** — only read-only diagnostics added.

Diagnostics: `scripts/diag_be_tradeset_attribution.py` (classifies every base-vs-BE
trade-set difference by mediating gate), plus `diag_be_fillcandle_divergence.py`
and `audit_be_fillcandle_fallback.py` from the prior steps. Sample: `test_control_run`
(EURUSD 15m), 40k candles, 302 base order-blocks, both entry variants, wick+close,
arms 0.25 / 1.0 / 3.0R.

---

## 1. Exact lifecycle of the cross-trade coupling
BE is the only difference between the two walks. Mechanism:
1. Trade **A** (say bullish) arms and hits its BE stop → `BE_EXIT` at candle **K**. In the no-BE walk A instead runs to its natural SL/TP at candle **M > K** (BE can only *shorten* an active span, never lengthen it).
2. A is removed from `active_trades` at K instead of M.
3. At some candle **K ≤ j < M**, a pending **bearish** order **B** is touched. The cancel/fill decision runs `_has_reverse_conflict(active_trades, "bearish")` (execution.py:1405) → true iff a bullish trade is currently active.
4. **No-BE:** A is still active at j → conflict → B latches `reverse_paused` and, on confirmation, resolves `REVERSE_TOUCH_CANCEL` (unfilled). **With-BE:** A already exited at K → no conflict → B **fills**, then runs its own fill→BE→exit logic.
5. B, now filled, is itself a new active trade and can change the conflict set for a *later* order C (potential cascade in either direction).

The coupling is **purely** through `_has_reverse_conflict` reading live `active_trades`. `_can_fill_trade` for `allow_multi_position` returns `True` unconditionally (execution.py:1385) — **no capacity coupling**. News-flatten reads `active_trades` only to flatten what's there; it can't create or cancel a *different* trade.

---

## 2. Trade-set differences by cause (per arm, across all four cells)
Every difference falls in exactly one bucket. `be_truncation` = same trade, base WIN/LOSS → `BE_EXIT` (an expected BE shortening, **not** a set difference, and already byte-derivable). Set differences only:

| variant · trigger | 0.25R | 1.0R | 3.0R | cause of every set diff |
|---|---:|---:|---:|---|
| baseline · wick  | 7 | 4 | 0 | `reverse_coupling` (new_fill) |
| baseline · close | 7 | 1 | 0 | `reverse_coupling` (new_fill) |
| TE25(C3) · wick  | 1 | 0 | 0 | `reverse_coupling` (new_fill) |
| TE25(C3) · close | 1 | 0 | 0 | `reverse_coupling` (new_fill) |

Counts by cause, summed over the run:
- **reverse-conflict coupling: 100%** of set differences.
- **same-candle / fill-candle BE: 0** set differences (it's `be_truncation`, fully derivable — per-trade divergence proven 0 in the prior step).
- **news: 0 · FFT: 0 · protection: 0 · invalidation/session: 0 · other: 0.**
- **lost_fill (cascade reverse direction, base-filled → BE-cancels): 0 observed** (possible in principle; see §4 risk).

So the entire correctness gap is one mechanism. Nothing flows through news/FFT/protection.

---

## 3. Where it appears
- **baseline:** yes — the main locus (267/302 filled → many BE_EXITs → many span-shortenings).
- **TE25 (triggered-edge C3):** yes but rare — only 113/302 fill, so far fewer BE_EXITs; 1 coupled trade at 0.25R, 0 elsewhere. (Variant available was C3; C2 expected to behave the same — coupling tracks fill/BE-exit count, not the delay value.)
- **wick:** yes. **close:** yes — close has fewer BE_EXITs so slightly fewer couplings (baseline 1.0R: 4 wick vs 1 close), but the mechanism and bucket are identical.
- **low vs high arms:** strongly arm-dependent. Peak at **0.25R**; falls monotonically; **0 at 3.0R in every cell.** High arms rarely BE_EXIT, so they rarely shorten a span, so they rarely free a conflict.

Scale: at the worst cell (baseline 0.25R), 7 coupled trades = ~2.3% of 302 rows, but 7/35 = **20% of the orders that were cancelled in the base walk** flip to fills. Small in absolute count, but outcome-changing for those trades.

---

## 4. Is a parallel per-arm pending/active simulation required?
**For byte-identical output: yes, a per-arm re-resolution of the reverse-conflict gate is required** — a derive/repair patch over base rows cannot be guaranteed correct because freed fills can cascade (a new fill creates a conflict that flips another order). The observed `lost_fill = 0` shows the cascade didn't bite in this sample, but it's reachable and "not observed in 40k candles" ≠ provably safe — and the standing requirement is no approximate parity.

**But it does NOT require duplicating the whole simulator N times.** The only per-arm-dependent gate is `_has_reverse_conflict`, which needs just one fact per arm: *which opposite-direction trades are active right now*. That set is fully determined by each trade's per-arm exit candle = `min(natural_exit, be_exit(arm))`, which the existing derive already computes cheaply. Everything else — OB detection, pending spawn, fill geometry (`_is_fill_confirmed`/`_is_filled`), news/FFT/session/invalidation cancels, metrics, BE prices — is arm-independent and computed once. So the required addition is a **lightweight per-arm forward pass** that re-runs only the reverse-conflict state machine (the `reverse_paused` latch, execution.py:1959-1990) against per-arm active intervals, filling any freed order via the existing helpers.

---

## 5. Estimated complexity of 3C′
**Moderate, not a 600-line rewrite.** Reuses all existing decision/metric helpers.
- New experimental function (~150–250 lines): base walk once → per-arm derive (already built) → per-arm forward pass that maintains active intervals (direction + per-arm exit candle) and re-resolves the reverse-conflict latch in candle order, materialising fills for freed orders and iterating to a fixpoint for cascades.
- Faithfully reproducing the `reverse_paused` latch + `_triggered_edge_can_fill`/`_is_fill_confirmed` ordering is the main correctness risk; covered by targeted parity tests + the real-data gate.
- Legacy path untouched; flag stays OFF; gated on byte-parity before any cutover. Fits the incremental, reviewable model.

---

## 6. Does 3C′ still deliver the speedup, or collapse to per-arm legacy?
**It retains most of the speedup — it does not collapse.** The expensive shared work (OB detection, the full candle walk, fill geometry, metrics) is done **once**; the per-arm forward pass only touches the reverse-conflict resolution, which is cheap and only diverges on the rare coupled orders (0–7 per arm, 0 at high arms). The cost scales with *coupled* orders, not *all* orders, so the ~9× single-walk target (504→56 passes) is substantially preserved. A full parallel duplication (re-running fill geometry + metrics per arm) is the version that would approach per-arm-legacy cost — and §4 shows that's unnecessary.

---

## 7. Recommended implementation path
**Build 3C′ as a lightweight per-arm reverse-conflict resolver on top of the existing derive — not a full parallel engine.**
1. Keep the derive (byte-exact for `be_truncation` + all filled trades; proven).
2. Add a per-arm forward pass over pending orders that re-resolves `REVERSE_TOUCH_CANCEL` vs fill using per-arm active intervals (`min(natural, be_exit(arm))`), iterating to fixpoint for cascades, materialising freed fills through the existing fill→BE→exit helpers.
3. Targeted parity tests for: base-unfilled→fill flip, the lost_fill cascade, arm-then-stop on a freed order, delay, wick (close deferred to 3D).
4. Gate on the real-data harness (baseline + TE25, wick) byte-identical before the flag flips (3E). Legacy stays default until then.

Recommend proceeding to implement 3C′ on this basis. No production wiring, no frontend, flag OFF, close trigger still deferred.
