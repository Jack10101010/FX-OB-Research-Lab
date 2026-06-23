# FFT-WIDTH-2-ROBUSTNESS-AUDIT

**Goal:** Validate whether the FFT width effect from Run 17 is robust enough to become a protection-filter candidate.

**Status:** Audit only. No code changed, no filters implemented. All numbers were produced read-only from the live run data; each run's totals reconcile to its own Run Detail FFT Effect verdict.

**Verdict up front:** The *direction* of the effect (FFT hurts small OBs, helps medium OBs) reproduces in every run that has control data — but there is effectively **one independent sample (Run 17)**. The other two runs are tiny (7–10 cancels) and their date windows sit **entirely inside** Run 17's window, so they are overlapping sub-samples, not independent replications. **Not yet ready** for Master Controls; it is a strong hypothesis that needs genuine out-of-sample data.

---

## Task 1 — Compatible runs (FFT ON + auto-control)

Of **25** imported runs, only **3** carry auto-control (`controlTradesByScenario`) data. The other 22 have no FFT-OFF counterpart and cannot be paired.

| Run | Symbol / TF | Period | Length | Control scenarios | Sample size |
|---|---|---|---|---|---|
| **17** `…942201555` | EURUSD M15 RR3.3 | 2024-05-18 → 2026-05-18 | **24 mo** | next, same (≈330 ea.) | **103 cancels** |
| **16** `…901338798` | EURUSD M15 RR3.3 | 2026-02-18 → 2026-05-18 | 3 mo | next, same, d2, d3 (35 ea.) | 7 cancels (next) |
| **15** `…733962068` | EURUSD M15 RR3.3 | 2026-02-18 → 2026-05-18 | 3 mo | next, same (35 ea.) | 10 cancels (next) |

Two structural problems are visible already:

1. **Overlap, not independence.** Runs 15 & 16 share an identical period (2026-02-18 → 2026-05-18) that is a **subset of Run 17's** 24-month window, on the **same symbol and timeframe**. Their baseline KPIs are also identical to each other ($9,686 net, 30 trades, 33.3% WR), i.e. they are re-exports of essentially the same 3-month backtest. They re-measure the tail of Run 17 rather than testing it on new data.
2. **No diversity.** Every run with control data is EURUSD M15 RR3.3. There is no second symbol, timeframe, or RR to test cross-market robustness.

---

## Task 2 & 4 — Width breakdown per run (Triggered Edge 25% · Next)

All buckets use the canonical `obSizeBucket` cutoffs; "impact" = high-confidence attributed impact (Σ −pairedOffR over HIGH pairs); "strat Δ" = ON−control net R by width.

### Run 17 — 24 mo (reference; reconciles to −18.58R / −21.2R)

| Width | Cancels | HIGH | Win rem | Loss avo | Impact (R) | Strat Δ (R) |
|---|--:|--:|--:|--:|--:|--:|
| Small <10p | 72 | 31 | 12 | 19 | **−21.36** | −19.4 |
| Medium 10–20p | 30 | 10 | 1 | 9 | **+1.75** | −2.8 |
| Large >20p | 1 | 1 | 0 | 1 | +1.03 | +1.1 |
| **Total** | **103** | **42** | **13** | **29** | **−18.58** | **−21.2** |

### Run 15 — 3 mo (reconciles to −3.56R; strat Δ −2.5R)

| Width | Cancels | HIGH | Win rem | Loss avo | Impact (R) | Strat Δ (R) |
|---|--:|--:|--:|--:|--:|--:|
| Small <10p | 6 | 4 | 2 | 2 | **−5.65** | −5.6 |
| Medium 10–20p | 4 | 2 | 0 | 2 | **+2.09** | +3.1 |
| Large >20p | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **10** | **6** | **2** | **4** | **−3.56** | **−2.5** |

Width range: 4.0 – 17.0p (median 9.1).

### Run 16 — 3 mo (reconciles to −4.29R; strat Δ −4.3R)

| Width | Cancels | HIGH | Win rem | Loss avo | Impact (R) | Strat Δ (R) |
|---|--:|--:|--:|--:|--:|--:|
| Small <10p | 5 | 3 | 2 | 1 | **−5.34** | −5.3 |
| Medium 10–20p | 2 | 1 | 0 | 1 | **+1.05** | +1.0 |
| Large >20p | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **7** | **4** | **2** | **2** | **−4.29** | **−4.3** |

Width range: 4.0 – 11.8p (median 7.3).

**Fine buckets:** not meaningful for Runs 15/16 — with 7–10 cancels there is at most a handful per fine band, so only the canonical small/medium split is reportable. Fine resolution (the ~12p crossover) is only visible in Run 17.

---

## Task 3 — Does the pattern hold?

| Question | Run 17 | Run 15 | Run 16 | Holds? |
|---|---|---|---|---|
| <10p remains **negative**? | −21.36R | −5.65R | −5.34R | **Yes, all three** |
| 10–20p remains **neutral/positive**? | +1.75R | +2.09R | +1.05R | **Yes, all three** |
| Sign flips around 10–12p? | Yes (+4.70R at 12–15p) | Direction only | Direction only | Direction yes; crossover only resolvable in Run 17 |

The sign of the effect is **unanimous** across every run with control data: small OBs lose, medium OBs gain. That consistency is encouraging. But it must be read against the sample/independence problems: the small/medium HIGH-pair counts in Runs 15/16 are 3–4 / 1–2 — far below the audit's own min-sample guard (≥10 cancels and ≥5 HIGH per bucket), and those rows are a subset of Run 17's own rows. So this is **one strong observation reconfirmed on a slice of itself**, not three independent confirmations.

---

## Task 7 — Cleanest experimental run to settle it

The design the task describes — **FFT OFF below ~10–12p, FFT ON above** — is the right A/B. To make it clean:

- **Same symbol / TF / RR** (EURUSD M15 RR3.3) for comparability with Run 17, but on an **out-of-sample, non-overlapping period** — e.g. **2022-05 → 2024-05** (the two years immediately *before* Run 17's window). This is the single most important change: it removes the in-sample overlap.
- **Three arms, identical config otherwise:**
  - A. FFT ON for all OBs (status quo).
  - B. FFT OFF for all OBs (the existing control).
  - C. **Width-gated FFT** — FFT ON only for OB width ≥ threshold (run it at both **10p** and **12p**).
- **Adequacy target:** ≥ ~50–100 cancels total, with ≥10 cancels / ≥5 HIGH pairs in each of the small and medium buckets, so each bucket clears the guard.
- **Cross-market (stretch):** repeat on at least one other symbol and/or timeframe to test that ~10–12p isn't an EURUSD-M15 artefact (pip-width thresholds are unlikely to transfer unscaled across instruments).

**In-sample sanity estimate (not evidence):** applying a "<10p → FFT OFF" gate to Run 17's *existing* paired data would remove the −21.36R small-bucket cost, moving high-conf attributed impact from **−18.58R → ≈ +2.78R** (medium +1.75 + large +1.03). That is exactly the kind of flip we'd hope to see — but it is computed on the same data that generated the hypothesis, so it only motivates the experiment; it cannot confirm it.

---

## Task 8 — Ready for Master Controls?

**No — keep it as a research candidate, do not promote yet.**

What's solid: a clear, mechanistically sensible, directionally unanimous effect (FFT destroys value on sub-10p OBs because it cancels setups whose removed winners outweigh the losses avoided; on 10–20p OBs it is mildly protective).

What's missing before it becomes a shipping protection filter:
1. **Independent out-of-sample confirmation** — at least one run on a non-overlapping period (Task 7). Today there is effectively one sample.
2. **Adequate per-bucket N** — Runs 15/16 fail the min-sample guard; only Run 17 clears it.
3. **Cross-market check** — all evidence is EURUSD M15; a pip-denominated threshold needs at least one other instrument/TF before being trusted as a control.

Recommended next step: run the Task 7 experiment (out-of-sample EURUSD M15, arms A/B/C at 10p and 12p). If the gated arm beats both full-ON and full-OFF out-of-sample with bucket N clearing the guard, **then** promote "FFT min OB width" to a Master Controls candidate filter.
