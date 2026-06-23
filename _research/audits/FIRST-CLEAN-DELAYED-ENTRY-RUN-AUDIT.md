# Post-Run Audit — First Clean Delayed-Entry Dataset

**Mode:** Audit only. No code changed.
**Run:** `540c4dd5…_20260621_105146_EURUSD_15min_RR3.3_SB1` (EURUSD M15, RR 3.3, 2020-01-02 → 2026-06-19).

---

## PART 1 — Run validation

**The run is clean and complete.** `progress.json` → `status: completed`, `failed: 0`, `error: ""`,
109/109 passes. `summary.json` carries full `entry_results`. The config has the right shape for a
"baseline, no-BE" entry study:

- **Thresholds generated:** 1, 5, 10, 25, 50, 75 % — all six present.
- **Arm delays generated:** 1–10, 15, 20, 25, 30, 35, 40, 45, 50 (18 delays) + same/next (C0/C1) — all present.
- **6 thresholds × 18 delays = 108 entry variants + 1 baseline = 109 passes.** Every variant produced a CSV.
- **No BE** this run (`be_arm_levels: []`) — pure entry study.
- **Cancel protections OFF** (`triggered_edge_cancel_on_retrace: false`, pips/pct = 0) — deliberate baseline.

**The delayed-entry fix is present and active in this data.** The decisive check: across **13,232
filled trades**, **0** have a fill price outside the fill candle's range (`entry < fill_candle_low` or
`> fill_candle_high`). That is the exact signature the bug used to produce (~70 % in the old corrupt
runs); it is now zero. The engine HEAD is `dba2bb8 "fix(execution): require true post-arm touch for
delayed entries"`, and the run timestamp (2026-06-21) is after it.

**Timing:**
- **Total passes:** 109 (1 baseline + 108 entry).
- **Total runtime:** ~**52.6 min** (`elapsed_seconds` 3,221s; sum of pass timings 3,154s).
- **Average pass:** **28.9 s** (entry passes 29.1 s; baseline 14.9 s).
- **Fastest pass:** 14.9 s (baseline). Fastest entry: ~26.6 s.
- **Slowest pass:** 32.9 s.
- **By family:** baseline 1 pass / 14.9 s; entry 108 passes / 3,139 s (96 % of runtime). There is no BE
  family this run.

---

## PART 2 — Explaining the runtime

**Why it feels slower than before:** the old "fast" runs had huge pass counts that were mostly **cheap
BE derivations**, not full simulations. Under the Perf-G single-walk design, one natural entry walk is
simulated and dozens/hundreds of BE arms are *derived* from it for near-free. So an old run reporting
e.g. 550 "passes" was really ~28 full entry simulations + ~520 cheap BE derivations.

**This run is the opposite:** **108 of its 109 passes are full, independent entry simulations** (18
delays × 6 thresholds), with **zero** BE derivations. Each full entry pass walks the entire 6.4-year,
~2.4 M-candle history against 304 simulation OBs. At **~29 s per full pass × 108 = ~52 min**, the cost
is entirely expected — there is simply no BE shortcut diluting the average this time.

- **Full entry simulations performed:** **108** (+1 baseline).
- **BE-derived passes this run:** **0** (no BE configured).
- **Equivalent in an old BE run:** the bulk of the pass count would have been BE derivations (often
  hundreds), each a fraction of a full pass — which is what made those runs *look* faster per pass.

**Did the delayed-entry fix affect runtime?** **No.** The fix changed one comparison
(`low ≤ entry ≤ high`); it adds no measurable cost. Proof: average pass time is essentially **flat
across delay depth** — C1 ≈ 28.7 s, C50 ≈ 29.1 s, every delay in between ~28.5–29.7 s. Deeper delays do
**not** cost more, so the delay-window logic and the fix are runtime-neutral.

**Why average pass time drifts up slightly as the run progresses (27.6 s → 31.0 s):** it tracks the
**threshold**, not the delay. Passes run threshold-ascending, and the late high-threshold passes are
slower: 1 %→27.4 s, 5 %→28.5 s, 10 %→28.4 s, 25 %→27.9 s, **50 %→31.6 s, 75 %→30.7 s**. Higher trigger
thresholds require deeper OB penetration, so pending orders are tracked across more candles before they
trigger/resolve → ~10 % more per-candle work. It is a mild, explained, threshold-correlated effect — not
a leak or regression.

**Obvious performance regressions:** none. ~29 s for a full 6.4-year × 304-OB entry walk is consistent
with the Perf A–J optimized engine.

> **Verdict: A) Expected runtime.** 108 genuine full entry simulations with no BE shortcut, ~29 s each,
> ~52 min total. The "slower than before" impression is an artifact of comparing against runs whose
> pass counts were dominated by near-free BE derivations.

---

## PART 3 — First clean delayed-entry findings

Per arm, all six thresholds combined (filled WIN/LOSS trades only):

| arm | trades | WR % | PF | Net R |
|---|---|---|---|---|
| C1 | 1,030 | 27.5 | 0.68 | −260.9 |
| C2 | 985 | 25.3 | 0.61 | −313.8 |
| C3 | 932 | 25.3 | 0.61 | −294.1 |
| C4 | 888 | 26.2 | 0.64 | −255.1 |
| C5 | 856 | 26.6 | 0.65 | −234.9 |
| C6 | 832 | 25.4 | 0.61 | −259.2 |
| C8 | 781 | 26.4 | 0.65 | −218.9 |
| C10 | 754 | 26.3 | 0.64 | −214.0 |
| C15 | 701 | 26.5 | 0.65 | −192.8 |
| C20 | 647 | 27.7 | 0.69 | −153.9 |
| C25 | 615 | 27.5 | 0.69 | −149.5 |
| C30 | 587 | 28.4 | 0.72 | −125.0 |
| C35 | 553 | 30.0 | 0.78 | −91.6 |
| **C40** | 520 | **31.5** | **0.84** | **−62.4** |
| C45 | 498 | 30.5 | 0.80 | −74.6 |
| C50 | 481 | 29.9 | 0.78 | −80.4 |

(C0/same had no separate WIN/LOSS file in this layout; C1=`_next`.)

**Rankings**
- **By Net R / PF / WR (best→worst):** **C40 > C45 ≈ C50 > C35 > C30 > … > C2 ≈ C3 ≈ C6 (worst).**
- **By trade count (most→least):** C1 (1,030) → C50 (481), strictly decreasing.

**Strongest arms:** C40 (PF 0.84, WR 31.5 %, −62R), then C45/C50/C35. **Weakest:** C2, C3, C6 (PF ≈
0.61, −294 to −314R).

**The blunt headline: every arm is unprofitable.** PF ranges 0.61–0.84 — **not a single arm reaches
PF 1.0.** With cancel protections off and costs included, plain delayed triggered-edge entries on EURUSD
M15 at RR 3.3 **lose money at every delay.** The "deeper outperforms" finding from the corrupt runs has
collapsed into "deeper **loses less**," not "deeper wins."

**Does deeper still outperform?** Directionally yes — there is a clean, monotonic improvement from C1
(PF 0.68) up to ~C40 (PF 0.84), then a slight roll-off at C45/C50. But it is improvement *within the
losing zone*.

**Trade count collapses with depth:** C1 → C50 is a **53 % drop** (1,030 → 481), strictly monotonic.
Deeper delays fill roughly half as many trades.

**Statistically meaningful?** The sample sizes are healthy (480–1,030 trades/arm), so the gradient (WR
27 %→31.5 %, PF 0.68→0.84) is probably a *real pattern* — but it is **small and entirely sub-breakeven**,
so it is not a tradeable edge. The right read is "an interesting structural tendency," not "a signal."

**Selection bias?** **Strong signs, yes.** As the delay deepens, trade count halves *and* WR/PF rise in
lockstep. That is the textbook selection pattern: deeper arms only fill the OBs where price genuinely
returned to the edge after a long wait — a self-selected, smaller, marginally-better-behaved subset —
rather than a causal performance edge from waiting. The improvement should be treated as **survivorship
until proven otherwise**.

---

## PART 4 — Next research priorities (ranked by expected value)

1. **Cancel-if-price-leaves-OB-before-arm (highest value).** ~93 % of deep-delay fills armed *after*
   price had already exited the OB (the `armed_after_ob_exit` cohort). These are the trades the strategy
   should arguably never take. Re-running with `triggered_edge_cancel_on_retrace` (or a dedicated
   "cancel if exited before arm") on, vs off, directly tests whether the deep-delay tendency survives
   once the armed-after-exit trades are removed — and whether *any* configuration turns profitable. This
   is the single most decisive next experiment and disambiguates real edge from selection bias.
2. **Delay + threshold interaction study.** This run only gives per-delay and per-threshold marginals;
   the cross-tab (which delay works best at which threshold) is where a usable pocket, if any, would
   hide. High value, and the data is already there to slice before re-running.
3. **Threshold optimization.** PF varies with threshold (timing showed 50/75 % behave differently); a
   focused WR/PF-by-threshold pass, ideally crossed with delay, is cheap insight.
4. **Delay optimization.** Largely answered by this run (C40 is the marginal sweet spot); narrow it to
   C35–C45 with finer steps only after #1 confirms there's anything worth optimizing.
5. **Session-specific delay studies (lowest priority now).** Potentially interesting, but premature
   while the whole family is sub-breakeven — do this only after #1 establishes a profitable regime to
   condition on.

**Ranking:** **1 (cancel-before-arm) ≫ 2 (delay×threshold) > 3 (threshold) > 4 (delay) > 5 (session).**

---

## PART 5 — Trustworthiness

**Can this dataset be used for delayed-entry research? Yes, with appropriate framing.**

- **Confidence: high on execution integrity, medium on conclusions.** The mechanics are now physically
  correct: 0/13,232 fills fall outside the candle range, the run completed with no failures, and all
  expected thresholds/delays are present. The data faithfully represents what the (now-correct) engine
  did. This is a sound baseline for entry-only research.
- **Remaining risks:**
  - **Selection bias** in the deep-delay gradient (trade count halves as PF rises) — do not interpret
    "deeper is better" as causal yet.
  - **No BE** here — these numbers are entry-only; the eventual BE run may shift outcomes materially.
  - **Single instrument / single RR** (EURUSD M15, RR 3.3) — no generalization yet.
  - **`armed_after_ob_exit` population** (~93 % of deep fills) is included; until the cancel experiment
    runs, the deep-arm stats are dominated by trades that armed on a vacated OB.
- **Sanity checks worth doing before any large-scale conclusion:**
  1. Re-confirm 0 out-of-candle fills on the *full* dataset (done here at the aggregate level — keep it
     as a standing CI check on every run).
  2. Split each arm's results by the `armed_after_ob_exit` / `retraced_out_before_arm` flags — quantify
     how much of each arm's performance comes from the "armed after exit" cohort.
  3. Verify win-R distribution (avg win is ≈ +2.0R, not the full +3.3R — confirm that's costs/early
     exits and not an exit-side artifact before trusting expectancy numbers).
  4. Spot-check 10–20 deep-delay (C40–C50) wins in the intrabar inspector (now fixed) to eyeball that
     ARM ACTIVE → genuine revisit → fill is real.

**Bottom line:** trustworthy as a *clean execution baseline*; treat the deep-delay "edge" as an
unproven, sub-breakeven, likely-selection-driven tendency until the cancel-before-arm experiment
settles it.

*No code was changed. Audit only.*
