# Threshold → Arm Matrix + Entry-Model Ideas

**Run:** `540c4dd5…_20260621_105146` (EURUSD M15→M1, CHoCH **bullish/longs only**, Triggered Edge, **no BE**,
cancel protections off, 2020-01-02 → 2026-06-19, 304 sim OBs). **Analysis only — no code changed.**
Counts use the UI definition: **Valid = WIN + LOSS + NEWS_FLATTEN**. Every scenario file = **300 rows**.
PF/Net R/WR/MaxDD computed over WIN+LOSS only. AAE = `armed_after_ob_exit`, EBA = `exited_ob_before_arm`.

> **Headline up front:** every threshold→arm cell is **unprofitable (PF < 1.0 everywhere)**. The only
> structure in the data is a clean, consistent "deeper delay loses less" gradient that **peaks at
> C35–C45**, best at **TE 10% · C40 (PF 0.88, −9.3R, 120 valid)**. It is a real *structural* pattern but
> an **un-tradeable** one — "least bad," not "good."

---

## PART 1 — Threshold → Arm matrix

Columns: Vd=Valid · WR · PF · NetR · DD=MaxDD · INV=INVALID · AAE · EBA. (Rows=300, UNFILLED≈13–15,
NEWS_FLATTEN≈10–17 in every cell.)

### Triggered Edge 1%
| arm | Vd | WR | PF | NetR | DD | INV | AAE | EBA |
|---|---|---|---|---|---|---|---|---|
| C1 | 245 | 28.1 | 0.70 | −53.6 | −56 | 40 | 0 | 0 |
| C2 | 236 | 26.2 | 0.64 | −64.0 | −64 | 46 | 59 | 59 |
| C5 | 204 | 27.2 | 0.67 | −49.1 | −52 | 75 | 136 | 137 |
| C10 | 181 | 26.3 | 0.64 | −46.9 | −52 | 97 | 157 | 172 |
| C20 | 153 | 28.2 | 0.71 | −31.7 | −35 | 127 | 158 | 188 |
| C30 | 142 | 28.2 | 0.71 | −28.8 | −35 | 138 | 153 | 196 |
| C35 | 134 | 30.1 | 0.78 | −20.3 | −29 | 146 | 146 | 196 |
| **C40** | 128 | 31.6 | **0.84** | **−13.9** | −24 | 152 | 142 | 197 |
| C45 | 123 | 31.2 | 0.82 | −14.4 | −25 | 157 | 134 | 199 |
| **C50** | 118 | 31.8 | **0.85** | **−12.1** | −21 | 162 | 127 | 199 |
- **Best PF / Net R:** C50 (0.85 / −12.1). **Worst:** C3 (0.61 / −65.7). **Deeper improves? Yes**, smooth
  C1 0.70 → C50 0.85. **Meaningful?** Reasonably (118–245 valid); but all sub-1.0. **INVALID driving the
  collapse? Yes** — Valid 245→118 as INV 40→162.

### Triggered Edge 5%
| arm | Vd | WR | PF | NetR | INV |
|---|---|---|---|---|---|
| C1 | 240 | 27.8 | 0.69 | −54.2 | 45 |
| C2 | 230 | 25.2 | 0.60 | −68.4 | 52 |
| C10 | 178 | 25.2 | 0.61 | −51.6 | 100 |
| C20 | 151 | 26.6 | 0.66 | −37.5 | 129 |
| C30 | 138 | 28.3 | 0.72 | −27.5 | 142 |
| **C40** | 124 | 31.9 | **0.85** | **−12.5** | 156 |
| C50 | 115 | 29.8 | 0.77 | −17.8 | 165 |
- **Best:** C40 (0.85 / −12.5). **Worst:** C3/C6 (0.59). Deeper improves, **peaks C40**, rolls off by C50.

### Triggered Edge 10%  ← best peak
| arm | Vd | WR | PF | NetR | INV |
|---|---|---|---|---|---|
| C1 | 232 | 27.6 | 0.68 | −53.4 | 54 |
| C2 | 218 | 25.7 | 0.62 | −61.4 | 64 |
| C10 | 168 | 26.6 | 0.65 | −42.0 | 111 |
| C20 | 145 | 27.6 | 0.69 | −32.1 | 136 |
| C30 | 134 | 29.0 | 0.74 | −24.3 | 147 |
| C35 | 126 | 31.0 | 0.82 | −15.7 | 155 |
| **C40** | 120 | 32.7 | **0.88** | **−9.3** | 161 |
| C50 | 111 | 30.7 | 0.80 | −14.6 | 170 |
- **Best PF / Net R in the whole run:** **C40 (0.88 / −9.3, 120 valid).** Worst C6 (0.59). Clean monotonic
  rise C1→C40, roll-off C45/C50. **Best-supported "least-bad" cell anywhere.**

### Triggered Edge 25%
| arm | Vd | WR | PF | NetR | INV |
|---|---|---|---|---|---|
| C1 | 192 | 28.2 | 0.70 | −41.0 | 94 |
| C2 | 181 | 25.3 | 0.61 | −52.9 | 102 |
| C10 | 140 | 26.0 | 0.63 | −37.2 | 140 |
| C20 | 121 | 28.8 | 0.73 | −22.7 | 160 |
| C30 | 109 | 29.3 | 0.75 | −18.7 | 173 |
| **C40** | 100 | 31.1 | **0.82** | **−12.0** | 182 |
| C50 | 93 | 28.9 | 0.74 | −16.5 | 189 |
- **Best:** C40 (0.82 / −12.0). **Worst:** C2 (0.61). Same shape; thinner (Valid 93–192). INV already 94 at C1.

### Triggered Edge 50%
| arm | Vd | WR | PF | NetR | INV |
|---|---|---|---|---|---|
| C1 | 131 | 26.0 | 0.63 | −36.8 | 151 |
| C2 | 126 | 23.7 | 0.56 | −43.3 | 154 |
| C10 | 97 | 27.5 | 0.68 | −22.6 | 183 |
| C20 | 82 | 27.3 | 0.68 | −19.1 | 199 |
| C30 | 71 | 28.8 | 0.73 | −13.3 | 210 |
| **C40** | 61 | 32.1 | **0.86** | **−5.6** | 220 |
| C50 | 60 | 29.6 | 0.77 | −9.4 | 222 |
- **Best:** C40 (0.86 / **−5.6**, the smallest loss anywhere). **Worst:** C2 (0.56). But only **61 valid** —
  thin. Over half of all rows are INVALID even at C1 (151/300).

### Triggered Edge 75%  ← noise floor
| arm | Vd | WR | PF | NetR | INV |
|---|---|---|---|---|---|
| C1 | 68 | 24.6 | 0.58 | −22.0 | 214 |
| C10 | 53 | 26.9 | 0.66 | −13.7 | 228 |
| C20 | 45 | 27.3 | 0.68 | −10.8 | 237 |
| C35 | 39 | 27.0 | 0.68 | −9.2 | 244 |
| C40 | 36 | 26.5 | 0.66 | −9.1 | 247 |
| C50 | 34 | 25.0 | 0.61 | −10.0 | 249 |
- **Best:** C35/C40 (0.66–0.68 / ≈−9). **Worst:** C2 (0.55). **34–68 valid → noise.** ~75–83 % of rows are
  INVALID. Not usable.

---

## PART 2 — Threshold-level interpretation

- **TE 1%** — *Useful but shallow/noisy floor.* Cleanest read: the full delay gradient is visible with the
  most trades (Valid 118–245). C40/C50 (PF ~0.85) are the only arms worth a second look. Too shallow to be
  selective (everything triggers), so it's the best place to *study the delay effect*, not to deploy.
- **TE 5%** — *Essentially a noisier 1%.* Same shape, slightly worse floors (C2/C6 ~0.59). C40 worth a look;
  nothing new vs 1 %/10 %.
- **TE 10%** — *The most useful threshold.* Best peak in the run (C40 PF 0.88, −9.3R) on a healthy 120-valid
  sample, with a clean monotonic C1→C40 rise. If any cell deserves visual inspection, it's **10% · C40**
  (and C35).
- **TE 25%** — *Transitional.* Still C40-peaked (0.82) but thinner and INVALID now dominates (>50% of rows
  by mid-arms). Marginal research value beyond confirming the pattern holds.
- **TE 50%** — *Thin but interesting tail.* C40 posts the smallest absolute loss anywhere (−5.6R, PF 0.86) —
  but on **61 valid trades**, so it's suggestive, not reliable. Worth a *confirmatory* deeper run, not a
  conclusion.
- **TE 75%** — *Too shallow a sample to read.* 34–68 valid, ~80% INVALID, PF ~0.6. **Discard** for now.

---

## PART 3 — Cross-threshold insight (SECONDARY)

1. **Least-bad threshold:** **10%** — best peak (C40, PF 0.88) on the best-supported sample; **50%** has the
   smallest absolute loss (C40 −5.6R) but too few trades to trust.
2. **Worst threshold:** **75%** (everything thin, PF ~0.6, INVALID ~80%); 5% is the worst of the *usable*
   thresholds (lowest floors).
3. **Only cells worth deeper research:** the **C35–C45 band at 5–25% thresholds**, headed by **10% · C40**,
   then **10% · C35**, **1% · C50**, **25% · C40**, **50% · C40**.
4. **What drives the (weak) improvement?** **Delay is the dominant lever for PF** — within every threshold,
   PF climbs ~0.68 → ~0.85 from C1 to C40. **Threshold mainly controls trade count / INVALID**, not PF
   quality (10% is the sweet spot; higher thresholds just thin the sample). The best combo is a
   **threshold × delay interaction**: *mid threshold (5–10%) × deep delay (C35–C45)*.
5. **INVALID explosion — both, threshold-dominant.** Holding delay at C1: INV 40 (1%) → 214 (75%) ≈ **5.3×
   from threshold**. Holding threshold at 1%: INV 40 (C1) → 162 (C50) ≈ **4× from delay**. They compound,
   but threshold sets the floor (even C1 at 75% is 214 INVALID). **Yes — INVALID, not failed fills, is what
   collapses the trade count** as you go deeper/higher: the OB simply breaks before the delayed order can
   fill.

---

## PART 4 — Cancel-before-arm context (from the prior A/B)

`armed_after_ob_exit` (AAE) and `exited_ob_before_arm` (EBA) rise steeply with delay (C1 = 0 → C40/C50 EBA
≈ 190–199 at low thresholds). The A/B test showed **cancelling the exit-before-arm cohort makes the deep
arms worse** and nothing profitable — so:

- **Cells where armed-after-exit trades CARRY performance (do not cancel):** the deep arms **C35–C50 at
  1–25%** — their PF ~0.82–0.88 is the revisit cohort; remove it and they collapse to ~0% WR. These are
  exactly the "least-bad" cells.
- **Cells where stayed-in-OB trades are worse (cancel HELPS, but stays unprofitable):** the **mid arms
  C10–C20** — their exit-before-arm cohort is net-losing, so cancelling trims losses (e.g. C10 −55→−24R
  blended) but never reaches profit.
- **Recommendation stands:** do **not** enable cancel-if-exits-before-arm as a default — it deletes the only
  trades keeping the deep arms near breakeven. Keep it as a *diagnostic lens* that cleanly splits
  "stayed-in-OB" (losers) from "left-and-returned" (the weak edge).

---

## PART 5 — Entry-model / variant ideas (grounded in the findings)

The data says: (a) plain delayed TE is unprofitable everywhere; (b) the only positive signal is the
**"price left the OB and returned"** cohort (deep arms); (c) **stayed-in-OB fills lose**; (d) **INVALID
dominates** — most OBs break before entry. So the highest-value ideas add a **confirmation on the revisit**
and/or **filter out OBs that are breaking**.

1. **Confirmed Revisit (close-back-inside).** *Rule:* after trigger + delay, only fill when price returns to
   the OB edge **and** an M1 candle **closes back inside** the OB (rejection of the move-away), not on a bare
   touch. *Why:* directly upgrades the revisit cohort (the one thing that works) by requiring the return to
   be a rejection, not a pass-through — should drop the stayed-in/continuation losers. *Fields:* OB
   top/bottom, candle OHLC at/after arm, `exited_ob_before_arm`. *Complexity:* **Low.** *Value:* **High.**
   *Falsified if:* confirmed revisits don't lift PF above the bare-revisit baseline (i.e. the rejection
   carries no information).

2. **Momentum/Displacement Revisit.** *Rule:* after the arm, require an M1 **displacement candle**
   (range/body ≥ k × ATR, in the trade direction) before entering. *Why:* stayed-in-OB (no momentum) are
   losers; demanding fresh momentum on the return should keep winners. *Fields:* M1 OHLC, ATR/range.
   *Complexity:* **Medium.** *Value:* **High.** *Falsified if:* momentum-confirmed fills underperform
   unconfirmed (momentum at the edge = exhaustion, not continuation).

3. **Micro-CHoCH Trigger (M1 structure shift).** *Rule:* after price taps the M15 OB, wait for an **M1
   CHoCH** in the trade direction, then enter at the edge. *Why:* the OB is an M15-CHoCH zone; an M1
   structure shift is a natural "the reversal has begun" confirmation that filters dead taps (the big
   INVALID bucket). *Fields:* M1 swing structure (needs an M1 CHoCH detector). *Complexity:* **High.**
   *Value:* **High.** *Falsified if:* M1-CHoCH-gated entries don't beat plain delayed entries net of the
   trades they skip.

4. **Second-Touch Only.** *Rule:* ignore the **first** revisit; arm/fill only on the **second** return to
   the edge. *Why:* first revisits frequently continue through (loss); second touches are often the cleaner
   accumulation. Cheap to test on top of the delay machinery. *Fields:* touch counter per OB, OB edges.
   *Complexity:* **Low–Medium.** *Value:* **Medium.** *Falsified if:* second-touch WR/PF ≤ first-touch.

5. **Survival Filter (invalidation-aware).** *Rule:* skip OBs that show early weakness during the delay
   (e.g. close beyond the far side, or penetration past X% before arm); only enter "clean" OBs. *Why:*
   INVALID dominates — pre-filtering breaking OBs should raise the win rate of what remains and cut wasted
   setups. *Fields:* `exited_ob_before_arm`, max penetration, close-vs-OB. *Complexity:* **Medium.**
   *Value:* **Medium.** *Falsified if:* "clean" OBs don't outperform the unfiltered pool.

6. **Wick-Rejection Entry.** *Rule:* enter on a **wick rejection** at the OB edge (long lower wick ≥ k×body
   for bullish) instead of a level touch. *Why:* classic rejection signal; targets the same revisit cohort
   with a sharper trigger. *Fields:* M1 OHLC (wick/body). *Complexity:* **Low.** *Value:* **Medium.**
   *Falsified if:* wick-rejection fills don't beat plain touches.

7. **Hybrid: Cancel-on-stale + Re-arm-on-confirmation.** *Rule:* cancel if price exits before arm (the A/B
   option), but **allow a fresh entry** only if it returns with confirmation #1 or #2. *Why:* combines the
   loss-trimming of cancel-before-arm (helps mid arms) with a quality re-entry (keeps good revisits).
   *Fields:* the cancel flag + a confirmation detector. *Complexity:* **Medium–High.** *Value:* **Medium.**
   *Falsified if:* the re-armed entries are no better than the original delayed fills.

---

## PART 6 — Recommendations

**1. Top 5 threshold/arm cells to inspect visually (intrabar inspector):**
`10% · C40` (best, 120 valid) → `10% · C35` → `1% · C50` → `25% · C40` → `50% · C40` (smallest loss, but
verify the 61-trade sample). Eyeball whether the wins are genuine left-and-returned rejections vs lucky
revisits.

**2. Top 3 backend experiments next:**
(a) **Add BE** to the C35–C45 / 5–10% band — the single biggest untested lever; entry-only is half the
system. (b) **Confirmed-Revisit (close-back-inside) A/B** vs plain delayed — directly tests idea #1, the
most promising. (c) **Full 6.4-year A/B of cancel-before-arm** with proper per-threshold→arm counts, to
settle the mixed signal on robust samples (mechanic already built, default-off).

**3. Top 3 entry models to prototype:** **Confirmed Revisit (close-back-inside)** [Low complexity, High
value] → **Momentum/Displacement Revisit** [Medium/High] → **Survival Filter** [Medium/Medium].

**4. What NOT to waste time on yet:** the **75% threshold** (noise floor), **fine-grained delay search
beyond C35–C45** (the peak is already located), **enabling cancel-before-arm by default** (hurts the only
near-breakeven arms), and any **profitability claim from single-year or <100-trade cells**.

**5. Plain-English conclusion:** On the first clean dataset, **delayed Triggered Edge longs are unprofitable
at every threshold and arm** — there is no deployable cell. The one robust pattern is a **delay gradient
peaking at C35–C45**, best at **10% · C40 (PF 0.88)**, and that "edge" is entirely the **left-the-OB-and-
returned** cohort; the **stayed-in-OB** fills lose, and **INVALID (OBs breaking before entry) is what
collapses the deeper/higher cells**. The productive path forward is **not** more plain-TE tuning — it is
(i) adding **BE**, and (ii) adding a **revisit confirmation** (close-back-inside / displacement / micro-
CHoCH) that keeps the good returns and discards the dead taps. Treat C40-ish cells as *study targets*, not
*trade candidates*.

*No code changed. Analysis only.*
