# Config Audit — Run `540c4dd5…` (the Confirmed-Revisit baseline)

**Repo:** Lux-OB-Backtester. **Audit only — no backtests, no code changes.**
Source: `outputs/runs/540c4dd5…_20260621_105146_EURUSD_15min_RR3.3_SB1/{config.json, summary.json, trades_*.csv}`.

---

## ⚠️ Headline — the run is FIXED 2R, not 3.3R

The folder name says `RR3.3` and `config.rr_multiple = 3.3`, but **the realized target on every filled
trade is exactly 2.0R**. The `session_strategy_scenario` is **enabled** and its enabled cohorts each carry
`target: {rr: 2, type: "rr"}`, which **overrode** the nominal `rr_multiple`. Verified from the trade rows:

- `(tp − entry) / (entry − stop) = 2.000` for **every** WIN/LOSS row (median = mean = min = max = 2.000).
- Sample WIN: entry 1.07790, stop 1.07655 (13.5 pips), tp 1.08060 (27.0 pips) → **2.0R**.
- WIN `pnl_r` ≈ **1.94** (= 2R minus 0.2 + 0.2 spread/slippage).
- `rr_config` column = 3.3 (nominal), but `rr_multiple` column shows both 3.3 and 2.0 — the **2.0 is the
  applied target**; 3.3 appears only as the carried-over default on rows.

**So `rr_config`/folder label 3.3 is misleading. The model ran at fixed 2R.**

> **Relevance to validation:** the prior Confirmed-Revisit A/B and the Threshold→Arm matrix study used
> `rr_multiple = 3.3` (wins ≈ +3.24R). This run — the baseline they are meant to extend — is **2R**
> (wins ≈ +1.94R). Before running the Confirmed-Revisit validation, set the **target to 2R** to match this
> baseline (or explicitly decide 3.3R is intended). PF/Net R are not comparable across the two RRs.

---

## 1. Exact configuration

| Field | Value |
|---|---|
| Symbol / data | EURUSD, `EURUSD_1m.csv` |
| Detection / execution TF | **15min detection**, **1min execution** |
| Date range | 2020-01-02 → 2026-06-19 (6y 6m) |
| Swing length / OB filter | 50 / `Atr` |
| OB size filter | min 0 / max 100 pips |
| **Entry model** | **`triggered_edge`** (delayed), `entry_level_pct = 0` (fill at OB edge), `same_candle_mode = next_candle` |
| TE trigger thresholds | **1, 5, 10, 25, 50, 75 %** |
| TE candle delays | **1,2,3,4,5,6,7,8,9,10,15,20,25,30,35,40,45,50** |
| TE cancel options | all **off** (first-failed-tag, on-retrace, fft, cancel-if-exits-before-arm) |
| **RR target** | **fixed 2R** (cohort `target rr:2`), despite `rr_multiple:3.3` / `rr_config:3.3` |
| **Stop model** | stop = **OB far side − stop_buffer**; `stop_buffer_pips = 1`, `entry_buffer_pips = 0`, `ob_entry_depth_pct = 0`, `verify_limit_ticks = 0` |
| Costs | spread 0.2, slippage 0.2, commission 0 R |
| **BE settings** | **disabled** — `be_enabled = false`, `be_arm_levels = []`, `be_delay_candles = 0`, `be_multiarm_enabled = false`; every enabled cohort `be: null` |
| Execution mode | `allow_multi_position` (single mode) |
| Protection modes | `baseline` only |
| Direction universe | `trade_direction: both` **but** `allowed_structure_directions: ["choch_long"]` + `structure_filter: choch` ⇒ **CHoCH bullish / longs only** |

### News settings (ON)
`news_blackout_enabled: true`, file `master_economic_calendar_2020_present.csv`, impacts **high**,
window **±5 min**, currencies = all. `news_block_new_fills: true`, `news_pause_pending_orders: true`,
`news_cancel_if_touched_during_blackout: true`, `news_flatten_active_trades: true`,
`news_flatten_minutes_before_blackout: 5`. ⇒ produces the `NEWS_FLATTEN` / `NEWS_TOUCH_CANCEL` outcomes.

### Session settings
`session_filter_enabled: true` with `allowed_sessions = [Asia, London, London Lull, New York, Outside]` —
i.e. **all sessions allowed → no session exclusion**. However the **session-strategy scenario is enabled**,
and it is what supplies the **2R target** (and the longs-only CHoCH cohort selection).
`reverse_touch_cancel_enabled: false`.

---

## 2. Target profile IDs & labels actually used

- **Portfolio:** `portfolio_id = pf_mqhul295_1n9dahf`, `portfolio_name = "My Portfolio"`.
- **Scenario:** `scenario_name = "EURUSD_M15_RR_3.3_2 Jan 20 → 19 Jun 26 · 6y 6m"`, `version 1`.
- **Enabled cohorts (all 6 sessions, long CHoCH, identical 2R target, no BE):**
  `london|choch_long`, `lull|choch_long`, `newYork|choch_long`, `ny_pm|choch_long`, `asia|choch_long`,
  `outside|choch_long` — each `direction: Long`, `structure: CHoCH`, `target: {rr: 2, type: "rr"}`, `be: null`.
  All BOS cohorts and all `choch_short` cohorts are **disabled**.
- **Per-scenario trade-file labels (`entry_model_key`):** `entry_baseline`, and
  `entry_triggered_edge_{threshold}p{frac}_d{delay}` — e.g. `entry_triggered_edge_10p0_d40`,
  `entry_triggered_edge_1p0_d50`. These are the per-threshold×arm scenarios in the run folder.

---

## 3. Answer — fixed / multiple / custom RR?

**Fixed 2R.** A single RR target of **2.0**, `type: "rr"`, applied uniformly to every enabled cohort. It is
**not** multiple RR targets and **not** a per-cohort custom mix — all enabled cohorts use the same `rr:2`.
The nominal `rr_multiple/rr_config = 3.3` did not take effect; the session-strategy cohort target won.

---

## 4. Summary for the upcoming Confirmed-Revisit validation

- **Entry:** delayed triggered-edge, edge fill, thresholds 1–75 %, delays 1–50, no TE cancels.
- **Exit:** **fixed 2R** target; stop at OB far side − 1 pip; spread/slippage 0.2 each; **no BE**.
- **Universe:** EURUSD M15→M1, CHoCH **longs only**, 2020-01-02 → 2026-06-19.
- **News on** (high, ±5 min, flatten); **sessions all-allowed** (no exclusion).
- **Action item:** match the validation to **2R** (not 3.3R) to be comparable to this baseline, or record an
  explicit decision to use 3.3R. The earlier A/B numbers were generated at 3.3R and are not directly
  comparable to this run.

*Audit only. No backtests run, no code modified.*
