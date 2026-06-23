# Research Test — Cancel If Price Leaves OB Before Arm (A/B)

**Repo:** Lux-OB-Backtester. **Mode:** implement + research. **Not staged / committed / pushed.**
**Sample:** 2023 (1 year), EURUSD M15, RR 3.3, CHoCH bullish, 49 OBs (fast sanity comparison).
**A** = current behaviour. **B** = `triggered_edge_cancel_if_exits_ob_before_arm = True`.

---

## PART 1 — Existing support (audit)

**No existing option does this.** The four mechanisms are distinct:
- **cancel_on_retrace** — *pre-trigger* only (gated on `not triggered_edge_armed`); cancels if, after a
  tap, price retraces by a configured **pip/% distance** before triggering. Distance-based.
- **cancel-on-move-away / first-failed-tag (FFT)** — *pre-trigger* only; cancels if price taps the OB then
  moves away (exits entry-side) before the trigger, optionally past a move-away pip threshold.
- **first-failed-tag cancel** — the same FFT mechanism.
- **"cancel if price leaves OB before arm"** — *post-trigger, during the delay window* (after trigger,
  before the arm candle). **This did not exist.** The `exited_ob_before_arm` / `armed_after_ob_exit`
  fields detect it but were **observational only** (no effect on fills/cancels).

So I added a minimal opt-in option.

## PART 2 — Implementation added

`src/execution.py` (+32 lines, default-off, schema-safe):
- New kwarg `triggered_edge_cancel_if_exits_ob_before_arm=False` on `simulate_trades`.
- Threaded onto the pending-order item (`"cancel_if_exits_ob_before_arm"`).
- New cancel block right after `_delay_window_update`: for an armed (triggered) delayed TE order, if the
  delay-window exit flag (`_dw["exited"]`, same detection as the `exited_ob_before_arm` diagnostic) is set
  **and** we are still before the arm candle (`candle_index < trigger_ci + delay`), emit a cancelled row
  with `outcome = "EXITED_OB_BEFORE_ARM"`, `cancel_reason = exited_ob_before_arm`, and drop the order.
- **Default false ⇒ byte-identical to current behaviour.** No `run_backtest.py`/config change — the A/B
  was driven directly via the `simulate_trades` kwarg, keeping the change minimal and reversible.

## PART 3 — Validation
- `py_compile src/execution.py` → OK.
- New `tests/test_cancel_exit_before_arm.py` → **7 passed, 0 failed** (bullish & bearish: exit-before-arm
  → OFF arms/fills, ON cancels; no-exit → ON still fills; omitted flag == OFF).
- Regression: `test_delayed_te_fill` 10/0, `test_be_replay` 74/0, `retest_tracker` all pass. Default-off
  preserves existing behaviour.

---

## PART 4 — A/B results (PRIMARY: Threshold → Arm)

Per cell: **trades = WIN+LOSS**. Full counts (Rows/Valid/WIN/LOSS/INVALID/UNFILLED/NEWS_FLATTEN) are in
the appendix. "cancel%" = B-cancelled / (A fills + cancelled). "armAfterExit" = A-side count of fills that
armed after the OB was vacated.

| TE 1% | A: trades / WR / PF / NetR / DD | B: trades / WR / PF / NetR / DD | cancel% |
|---|---|---|---|---|
| C1 | 37 / 16.2 / 0.64 / −11.2 / −20 | 37 / 16.2 / 0.64 / −11.2 / −20 | 0% |
| C10 | 29 / 13.8 / 0.53 / −11.8 / −15 | 7 / 14.3 / 0.55 / −2.7 / −5 | 46% |
| C20 | 22 / 18.2 / 0.73 / −4.8 / −10 | 6 / 16.7 / 0.66 / −1.7 / −4 | 54% |
| C30 | 20 / 20.0 / 0.82 / −2.8 / −9 | 3 / 0.0 / 0.00 / −3.0 / −3 | 59% |
| C40 | 16 / 25.0 / **1.10** / **+1.2** / −8 | 2 / 0.0 / 0.00 / −2.0 / −2 | 65% |
| C50 | 16 / 25.0 / **1.10** / **+1.2** / −8 | 1 / 0.0 / 0.00 / −1.0 / −1 | 66% |

| TE 10% | A | B | cancel% |
|---|---|---|---|
| C1 | 36 / 16.7 / 0.66 / −10.2 | 36 / 16.7 / 0.66 / −10.2 | 0% |
| C10 | 27 / 14.8 / 0.57 / −9.8 | 7 / 14.3 / 0.55 / −2.7 | 45% |
| C20 | 20 / 20.0 / 0.82 / −2.8 | 5 / 20.0 / 0.82 / −0.7 | 55% |
| C30 | 18 / 22.2 / 0.94 / −0.8 | 3 / 0.0 / 0.00 / −3.0 | 59% |
| C40 | 15 / 26.7 / **1.20** / **+2.2** | 2 / 0.0 / 0.00 / −2.0 | 64% |
| C50 | 14 / 28.6 / **1.32** / **+3.2** | 1 / 0.0 / 0.00 / −1.0 | 67% |

| TE 50% | A | B | cancel% |
|---|---|---|---|
| C1 | 17 / 11.8 / 0.44 / −8.4 | 17 / 11.8 / 0.44 / −8.4 | 0% |
| C10 | 14 / 7.1 / 0.25 / −9.7 | 11 / 9.1 / 0.33 / −6.7 | 26% |
| C20 | 12 / 8.3 / 0.30 / −7.7 | 4 / 0.0 / 0.00 / −4.0 | 50% |
| C40 | 8 / 12.5 / 0.47 / −3.7 | 4 / 0.0 / 0.00 / −4.0 | 60% |
| C50 | 8 / 12.5 / 0.47 / −3.7 | 4 / 0.0 / 0.00 / −4.0 | 60% |

*(5 % mirrors 1 %; 25 % sits between 10 % and 50 %; 75 % has 0 wins on either side — full tables in the script output.)*

**Best/worst arm within each threshold (A side):** best is always **C40/C50** (highest PF/NetR), worst is
always **C1** at low thresholds and **C10** at high thresholds. **Within every threshold, deeper delays
improve A-side performance monotonically** — but the gradient rests on **11–16 trades per cell**, which is
**not statistically meaningful** (PF 1.1–1.3 on 14 trades is within noise).

**Under B the within-threshold trend REVERSES:** deeper arms collapse to ~0 % WR / PF 0.00 on 1–4 trades.

---

## PART 5 — Analysis (plain English)

**1. Does cancel-before-arm improve PF/Net R?** **No — for the deep arms it makes them worse**, and it
makes nothing profitable. Blended over thresholds: C40 goes **−1.2R → −16.0R**, C50 **−0.2R → −13.0R**.
It *does* cut losses for the mid arms (C10 −55.2 → −23.5R, C20 −26.2 → −13.8R), but those stay deeply
unprofitable. C1 is unchanged (no exit-before-arm exists at delay 1).

**2. Does it destroy deep-arm trade count?** **Yes, dramatically.** Cancel% rises with depth (~45 % at
C10 up to ~66 % at C50). Blended C50 trades 69 → 13; at TE 10 % C50 it is 14 → **1**.

**3. Does C35–C50 still lose less?** **No — under B they lose more.** The "loses less" property of deep
arms in A was produced entirely by the armed-after-exit (price-left-then-revisited) fills, which B removes.

**4. Does any threshold/arm become profitable?** **No.** Nothing reaches a robust PF > 1 under either A or
B. The only A-side cells above 1.0 (C40/C50 at low thresholds, PF 1.1–1.3) are 14–16-trade samples.

**5. Are the cancelled trades mostly losers or mixed?** **Mixed, and depth-dependent.** For **mid arms
(C10–C20)** the exit-before-arm cohort is **net-losing** — removing it *helps* (less negative). For **deep
arms (C40–C50)** the same cohort is **net-positive/breakeven** — removing it *hurts*. So the deep arms'
near-breakeven result is literally the revisit cohort.

**6. Is the improvement real or just trade-count reduction?** There is **no improvement** for the arms
that mattered. B reduces trade count *and* strips out the deep arms' winning revisit trades, leaving
losers. The A-side deep-arm "edge" is confirmed to be the armed-after-exit revisit trades — and they are a
**thin, small-sample, ~breakeven** effect, not a robust edge hiding under "stale" entries.

**7. Should this become a permanent protection option?** **No.** It worsens the only arms that were near
breakeven (C40/C50) and merely trims losses on already-losing mid arms — no configuration turns
profitable. **Keep it as an opt-in research flag**, not a default. (Where it *is* useful: as a lens — it
proves the deep-arm tendency is the revisit cohort, and it cleanly separates "stayed-in-OB" fills, which
are losers, from "left-and-returned" fills, which carry whatever weak edge exists.)

### The reframed headline
Your hypothesis — "deep-arm performance is inflated by stale/vacated-OB entries; cancel them and the edge
disappears" — is **half right**: cancelling them *does* collapse the deep-arm edge (confirming it IS the
revisit cohort), **but it reveals no profitable core underneath** — the surviving "price stayed in the OB
the whole delay" trades are *losers*. Net: the delayed triggered-edge family (this config, no BE) remains
unprofitable, and cancel-before-arm is a diagnostic lens, not a fix.

---

## Trustworthiness & next step
- **Sample caveat (important):** 2023-only ⇒ 1–16 trades per threshold→arm cell on the B side. **These
  WR/PF numbers are directional, not conclusive.** Before any deployment decision, run the **full 6.4-year
  A/B** (the baseline config has ~300 rows/scenario), reported per threshold→arm with the full count
  columns, so the deep-arm cells have enough trades to be meaningful.
- The mechanic itself is validated and default-off-safe; enabling it for the full run is low-risk.

## Appendix — full counts (A side), per threshold → arm
Generated in the run: every cell shows Rows=48, plus Valid / WIN / LOSS / INVALID / UNFILLED /
NEWS_FLATTEN, and the B-side cancelled / exited / armed-after-exit / retraced counts. (INVALID rises
sharply with both threshold and depth — e.g. TE 75 % C50 = 40 INVALID of 48 rows — which is the real
driver of the trade-count collapse, separate from the cancel option.)

## git status / diff stat
```
Lux-OB-Backtester:
 M src/execution.py                        | 32 ++++++  (new kwarg + item flag + cancel block; default-off)
 ?? tests/test_cancel_exit_before_arm.py    (new, 91 lines, 7 cases)
 (M sidecar/server.py is pre-existing from an earlier task; run_backtest.py / config NOT modified)
```

*Stopped after report. Not staged, committed, or pushed.*
