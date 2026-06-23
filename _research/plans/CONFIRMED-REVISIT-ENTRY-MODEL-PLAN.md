# Confirmed Revisit Entry Model — Audit + Implementation Plan

**Repo:** Lux-OB-Backtester. **Mode:** audit + plan only — no code changed.
**Thesis (from the clean matrix + A/B):** plain delayed Triggered Edge is unprofitable everywhere; the
only positive signal is the **left-the-OB-and-returned** cohort; **stayed-in-OB fills lose**. So a model
that fills **only on a confirmed revisit** should keep the good cohort and drop the dead taps.

---

## 1. Exact rule options

All four reuse the existing **bullish entry edge = OB top**, **bearish entry edge = OB bottom**,
stop = far side ± buffer, tp = entry + rr·risk, and the existing post-arm fill (`low ≤ entry ≤ high`).
"Exited" / "revisit" use the same detection as the diagnostics (`_dw_entry_side_exit`): bullish exit =
candle `low > top`; bearish exit = candle `high < bottom`.

### A. Close-Back-Inside / Above Edge  *(primary candidate)*
- **Bullish:** after arm AND after the order has **exited** above the top, require a candle to **close ≥ OB
  top** (the pullback to the edge was rejected / price closed back on the bullish side). Then the existing
  limit at the top fills on the next in-range touch.
- **Bearish:** after exit below the bottom, require a candle to **close ≤ OB bottom**; then fill on the next
  in-range touch.
- **Entry price/timing:** unchanged — **limit at the OB edge**, fills when price next trades through it
  (`low ≤ entry ≤ high`). The confirmation only *gates* eligibility; it does not move the fill price.
- **Order active when:** armed (trigger+delay) **AND** exited **AND** a confirming close has printed.
- **Cancels when:** existing invalidation (OB fully breached → INVALID); optional confirmation window
  (cancel if unconfirmed within N candles) — deferred to v2.
- **Market vs limit:** **limit** (no worse fill). **RR/stop/target:** **preserved exactly** (edge entry).

### B. Wick Rejection at Edge
- **Bullish:** a candle that touches the edge (`low ≤ top`) but **closes ≥ top** with **lower wick ≥ k·body**
  (rejection). **Bearish:** touches (`high ≥ bottom`), **closes ≤ bottom**, **upper wick ≥ k·body**.
- Entry: market-on-confirmation-close, OR limit-at-edge gate (preferred). Sharper than A but adds a wick/body
  ratio parameter. RR preserved if limit-gated.

### C. Displacement After Revisit
- **Bullish:** after revisit, a candle whose body/range ≥ **k·ATR** **closes above the top** (momentum
  acceptance). **Bearish:** mirror below bottom.
- Entry: market-on-close (momentum candle) or limit-gate. **Needs ATR** (new computation). Highest selectivity,
  highest complexity; risk of entering late/extended.

### D. Close-Beyond-Trigger After Revisit
- **Bullish:** require a candle to **close above the trigger level** (`top − depth·thr%`), i.e. fully reclaim
  past the trigger, after the revisit. **Bearish:** close below the bearish trigger level.
- Stronger reclaim than A; uses `plan["trigger_penetration_pct"]` (already present). Limit-gate keeps RR.

---

## 2. Existing data reuse (audit)

| Need | Exists? | Where |
|---|---|---|
| OB top/bottom | ✅ | `ob["top"]`, `ob["bottom"]` |
| Entry edge | ✅ | `plan["entry"]` (= top bullish / bottom bearish) |
| Trigger threshold + level | ✅ | `plan["trigger_penetration_pct"]`, `_triggered_edge_touched`, `_penetration_price` |
| Exited-OB / revisit detection | ✅ | `_dw_entry_side_exit(ob, candle)`, `_dw["exited"]` (set in `_delay_window_update`) |
| OB occupancy | ✅ | `_dw_ob_occupied(ob, candle)` |
| Candle OHLC (incl. **close**) | ✅ | `candle["open/high/low/close"]` |
| Fill / stop / tp / exit logic | ✅ | post-arm in-range fill (line ~2144); `_exit_outcome`, RR math |
| Invalidation | ✅ | line ~2310 (`low < bottom` bullish) → `INVALID` |
| Per-order gate hook | ✅ | the `cancel_if_exits_ob_before_arm` block (just after `_delay_window_update`) is the exact template |
| ATR | ❌ | not present — only variant **C** needs it |

**Lowest-risk variant: A (close-back-above-edge), implemented as a fill GATE.** It needs only OHLC + OB
edges (all present), no ATR, no new price model, and reuses the entire fill/stop/tp/exit machinery — only a
per-order boolean is added. B/D are next (one extra parameter); C is highest risk (ATR + market entry).

---

## 3. Chosen first prototype

**Variant A — "Confirmed Revisit (close-back-above-edge), limit-gated."** Best because it is:
- **Simple** — a boolean gate AND-ed into the existing fill condition, mirroring the already-shipped
  `cancel_if_exits_ob_before_arm` hook.
- **Physically realistic** — entry stays at the edge (limit); you only fill after price exited and closed
  back on the trade's side, then returned to the edge.
- **Easy to validate** — pure OHLC vs OB edges; deterministic synthetic cases.
- **Directly targets the revisit cohort** — only confirmed exited-and-returned setups fill; stayed-in-OB
  fills (the losers) are dropped, which is the precise opposite of the cancel-before-arm filter that proved
  the revisit cohort carries the edge.
- **Minimal engine risk** — default-off ⇒ byte-identical to plain TE; no change to stop/tp/RR/exit.

---

## 4. Implementation plan (for later)

- **File:** `src/execution.py` only (gate next to `_delay_window_update`; AND a `item["revisit_confirmed"]`
  term into the post-arm fill condition at the 4 fill/cancel sites). No other engine files.
- **Config flag:** `triggered_edge_require_revisit_confirmation: bool = False`
  (+ later `triggered_edge_revisit_confirmation_mode: "close_back_edge" | "wick" | "displacement" | "close_beyond_trigger"`).
  Default off = plain TE unchanged.
- **Per-order item fields:** `"require_revisit_confirmation"` (from the flag), `"revisit_confirmed"` (set True
  on the confirming close), `"revisit_confirm_candle_index"`, `"revisit_confirm_time"`.
- **Gate logic:** for an armed delayed TE order, once `_dw["exited"]` is True, watch for the confirming close
  (`close ≥ top` bullish / `close ≤ bottom` bearish); set `revisit_confirmed`. The fill condition gains
  `(not require_revisit_confirmation or item["revisit_confirmed"])`. (Optionally: if `require_..._confirmation`
  and price never exits, the order never confirms → never fills — intended.)
- **Output scenario naming:**
  - *For the first A/B research test:* **drive via the `simulate_trades` kwarg** (as the cancel-before-arm
    test did) — **no file-naming change**, no importer changes, fastest to results.
  - *If promoted to a full run:* a distinct model key, e.g. `entry_triggered_edge_cr_{thr}p{frac}_{arm}`
    (`cr` = confirmed revisit), kept separate so the frontend importer's TE regex isn't disturbed (would need
    a one-line importer addition to surface it in the UI).
- **CSV fields to add (optional, diagnostics):** `revisit_confirmed` (bool), `revisit_confirm_time`,
  `revisit_confirm_candle_index`. Additive; preserves existing schema.
- **Validation tests (new `tests/test_confirmed_revisit.py`):**
  1. Bullish: exit above top → close-back-above → revisit touch → **FILL** (confirmed).
  2. Bullish: exit above top → never closes back above → revisit touch → **NO FILL**.
  3. Bullish: stayed-in-OB (never exits) → **NO FILL** under confirmation.
  4. Bearish mirrors of 1–3.
  5. Flag off / omitted → identical to plain delayed TE (regression).
  Plus `py_compile`, `test_delayed_te_fill`, `test_cancel_exit_before_arm`, `test_be_replay`, `retest_tracker`.
- **Runtime impact:** **negligible** (one boolean check per candle per pending order, like the cancel hook);
  trade count *drops* (fewer fills) so per-pass is, if anything, marginally faster.

---

## 5. First backtest grid

- **Mode:** A = plain delayed TE; B = Confirmed Revisit (variant A). Compare **per threshold → arm**.
- **Thresholds:** **5, 10, 25** (the usable mid band; skip 1 % noise-floor and 75 % junk).
- **Arms:** **C20, C30, C35, C40, C45, C50** (the peak band) + **C1** as a baseline contrast.
- **Sessions:** none initially (keep clean; add session filters only after the entry effect is established).
- **Date range:** **full 6.4 years** (confirmation thins trades, so the full range is needed to keep ≥ ~50
  valid per cell). If runtime-bound, 2020–2023 (3.5 y) as a first pass.
- **BE:** **disabled** — isolate the entry effect first (BE is the next, separate lever).
- **Benchmarks:** plain TE at the **same** threshold/arm, with explicit comparison to the strongest plain
  cells **10% · C40** and **5–10% · C35–C45**. Report Rows / Valid / WIN / LOSS / INVALID / UNFILLED /
  NEWS_FLATTEN / WR / PF / NetR / MaxDD for every cell, plus confirmed-trade count and % of plain fills kept.

---

## 6. Falsification criteria (what kills the idea)

Confirmed Revisit (variant A) is **dead** if, on the grid above:
1. **PF does not improve vs plain TE at the same threshold/arm** (confirmed PF ≤ plain PF within noise across
   the C35–C45 / 5–10 % cells) — the confirmation carries no information.
2. **Trade count collapses below useful levels** (< ~40–50 valid per target cell) so nothing is conclusive.
3. **Confirmation enters systematically late/worse** — only relevant if a *market-on-close* variant is used;
   for the limit-gated variant the entry price is unchanged, so a PF drop would instead point to (1).
4. **No cell crosses toward profitability** — even the best confirmed cell stays well below PF 1.0 with no
   improvement trend vs plain.
5. **WR rises but PF/Net R don't** — confirmation merely reshuffles the win/loss mix without net edge.

**Hard kill:** across the C35–C45 × 5–10 % cells, confirmed PF ≤ plain PF **and** valid < ~40/cell.
**Promote (to BE + session studies):** confirmed PF lifts ≥ ~0.10 over plain at matched cells **and** keeps
≥ ~50 valid trades, especially if any cell approaches PF ~1.0.

---

## Deliverable summary
- **Rules:** four variants specified (A close-back-edge, B wick, C displacement, D close-beyond-trigger).
- **First prototype:** **A — limit-gated close-back-above-edge confirmation.**
- **Why best:** simple, RR-preserving, reuses all existing fill/stop/tp/exit, needs only data already present,
  directly isolates the revisit cohort, lowest engine risk, default-off-safe.
- **Implementation risk:** **Low** — one config flag + one per-order boolean + a fill-condition AND term,
  modelled on the already-validated cancel-before-arm hook; no schema break; negligible runtime.
- **Validation plan:** 5 synthetic cases (bullish/bearish confirm vs no-confirm vs stayed-in, + regression) +
  existing suites.
- **First grid:** thresholds 5/10/25 × arms C20–C50 (+C1), full 6.4 y, BE off, A/B vs plain at matched cells.

*No code changed. Plan only.*
