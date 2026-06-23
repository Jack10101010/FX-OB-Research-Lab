# Final Delayed-Entry Sanity Audit — Pre 6-Year Rerun

**Repo:** Lux-OB-Backtester. **Mode:** Audit only — no code changed, no 6-year rerun.
**Engine:** fixed (`dba2bb8`, in-range touch). **Sample:** run 86c11cdc, **2023 (1 year)**, 371,105
1m candles, 49 OBs, 10% threshold, arms **C0, C1, C2, C5, C10, C20, C30, C40, C50** → **238 fills**.

## VERDICT: **PASS — Safe for full rerun (Option A).**
Every execution-correctness invariant holds across the entire arm spectrum. No remaining engine
anomalies. The prior C50 fake-edge dominance is gone. The only open item is a *research* question
(small residual "deeper ranks higher"), not an engine defect.

## 1. Invariant checks (all 9 arms, 238 fills)

| arm | fills | entry<low | entry>high | outside range | before arm | arm==trig+delay | impossible TP | ordering t≤a≤f≤x | same-candle |
|---|---|---|---|---|---|---|---|---|---|
| C0 | 44 | 0 | 0 | 0 | 0 | 44/44 | 0 | 44/44 | 3 |
| C1 | 36 | 0 | 0 | 0 | 0 | 36/36 | 0 | 36/36 | 0 |
| C2 | 34 | 0 | 0 | 0 | 0 | 34/34 | 0 | 34/34 | 0 |
| C5 | 30 | 0 | 0 | 0 | 0 | 30/30 | 0 | 30/30 | 0 |
| C10 | 27 | 0 | 0 | 0 | 0 | 27/27 | 0 | 27/27 | 2 |
| C20 | 20 | 0 | 0 | 0 | 0 | 20/20 | 0 | 20/20 | 1 |
| C30 | 18 | 0 | 0 | 0 | 0 | 18/18 | 0 | 18/18 | 0 |
| C40 | 15 | 0 | 0 | 0 | 0 | 15/15 | 0 | 15/15 | 0 |
| C50 | 14 | 0 | 0 | 0 | 0 | 14/14 | 0 | 14/14 | 0 |
| **ALL** | **238** | **0** | **0** | **0** | **0** | **238/238** | **0** | **238/238** | **6** |

- **fill_candle contains entry:** ✅ 238/238 (0 outside the candle range, either side).
- **fill at/after arm:** ✅ 0 before-arm; `arm_ci == trigger_ci + delay` on all 238.
- **trigger ≤ arm ≤ fill ≤ exit:** ✅ 238/238.
- **impossible TP/SL geometry:** ✅ 0 (no fill candle sits beyond its own TP; TP>entry, stop<entry on all).
- **same-candle fill+exit:** 6 total (vs **483** in the broken run) — and **0 violate execution logic**
  (every one has entry inside the candle *and* the TP/SL genuinely reachable on that candle: a real
  same-minute stop/target, not a phantom).

**No remaining execution anomalies.**

## 2. Performance by arm (FIXED engine)

| arm | fills | W/L | WR % | PF | Net R |
|---|---|---|---|---|---|
| C0 | 44 | 6/38 | 13.6 | 0.52 | −18.2 |
| C1 | 36 | 6/30 | 16.7 | 0.66 | −10.2 |
| C2 | 34 | 6/28 | 17.6 | 0.71 | −8.2 |
| C5 | 30 | 5/25 | 16.7 | 0.66 | −8.5 |
| C10 | 27 | 4/23 | 14.8 | 0.57 | −9.8 |
| C20 | 20 | 4/16 | 20.0 | 0.82 | −2.8 |
| C30 | 18 | 4/14 | 22.2 | 0.94 | −0.8 |
| C40 | 15 | 4/11 | 26.7 | 1.20 | +2.2 |
| C50 | 14 | 4/10 | 28.6 | 1.32 | +3.2 |

Net-R ranking (best→worst): **C50 > C40 > C30 > C20 > C2 > C5 > C10 > C1 > C0**.

## 3. Does deeper still outperform / does C50 dominance persist?

**A weak gradient persists, but the dominance does NOT.**
- **Before (broken):** C50 ≈ **PF 2.53**, the apparent edge grew explosively with depth (the phantom
  artifact). ~63–79 % of deep fills were invalid.
- **After (fixed):** C50 ≈ **PF 1.32 / +3.2R**; **most arms are now net-negative**; only C40/C50 are
  marginally positive on this 1-year, single-threshold slice. The catastrophic fake edge is gone.

Deeper arms still *rank* higher, but this is now physically-valid and small, and is plausibly a
**selection effect**: deeper delays fill far fewer trades (C50: 14 vs C0: 44) — only setups where
price genuinely returned to the OB edge after a long wait — a different, smaller sub-population.
**This is no longer a correctness signal; it is a research/statistics question.** On 14–44 fills per
arm over one year, the per-arm PF/WR are **not statistically robust** and the ranking is within noise.

## 4. Remaining anomalies / risks
- **None at the engine level.** All fills are physically valid.
- **Statistical, not structural:** the residual "deeper ranks higher" needs significance testing on
  the full 6-year sample (sample size, threshold sensitivity, regime) — but it is *not* an execution
  bug. Treat any surviving deep-delay edge with appropriate skepticism, not as a green light.

## 5. Recommendation

**→ A) Safe for full rerun.** The delayed-entry engine is correct: fills require a genuine in-range
post-arm touch, arm timing is exact, ordering and TP/SL geometry are sound, and zero fills fall
outside the candle across C0–C50. (Not B — no further engine issue found. Not C — this was a real
engine fix, now verified clean.)

**Caveats for interpreting the rerun (not blockers):**
1. The deep-delay "edge" is now small and likely a low-N selection effect — evaluate it
   statistically, don't assume it's real.
2. Re-generate **all** arms/thresholds fresh; do not compare against the pre-fix C20–C50 outputs
   (those are corrupt by construction).
3. Expect deep-delay variants to fill **far fewer** trades than before — that's the fix working.

*No code was changed. Final correctness audit only.*
