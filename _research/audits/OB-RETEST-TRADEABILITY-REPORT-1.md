# OB Retest Tradeability Report

**Question:** When retested order blocks "work," how should they be traded?

**Data:** Backend-computed v2.1 run `20260606_084116_EURUSD_15min_RR5_SB0`
(EURUSD, 15-min detection, RR5). 209 order blocks · 614 retest events · monetization
available · tradeability available. Numbers below come from the live Retest Lab
modules (research + monetization + tradeability), not estimates.

**How to read the two key rates (this matters for every verdict below):**

- **Reaction Success %** = of *closed* retests, the share that held the reaction
  window *and* produced the configured minimum favourable move. It is a per-event,
  in-the-window, "did it pop promptly" measure. It is sensitive to the run's reaction
  settings.
- **Median MFE / R-capture** = per *order block*, how far price eventually ran in
  your favour (from the near edge) before the zone died, in R where **1R = the OB's
  own width**. This is idealized opportunity (perfect fills, no spread/slippage) — an
  **upper bound**, not realized PnL.

These two tell different stories here, and the gap between them is the headline.

---

## 1. Executive summary

**Three facts dominate this run:**

1. **Zones almost always die.** Eventual failure is **97.9%** run-wide (and 95–100%
   in every cohort). Retested OBs are not "hold forever" levels — trading them is a
   race to capture R before the zone is invalidated.

2. **High window hold, low reaction success = weak holds, not clean edges.** Every
   cohort holds the reaction window 85–95% of the time but posts **reaction success
   of only 7–19%**. By the rulebook, that is a *weak hold*, not a reaction edge. The
   immediate, in-window pop rarely clears the minimum-move bar.

3. **Yet the eventual opportunity is real and large.** Despite weak immediate
   reactions, **65–91% of zones eventually reach 1R** and the **median MFE before
   death is ~1.5R–2.8R** (and 4.2R for one standout cohort). 

Put together: **the R is there, but it does not come cleanly or immediately.** This
is the classic "good MFE, poor reaction success" pattern — it points to an **entry-
timing / management problem, not a target problem.** Naive market entries on the
retest get chopped first; the favourable run tends to arrive to a patient, well-
managed position. Read every capture number below as "available to good management,"
not "easy money."

**The single best-paying cohort is BOS · Bearish** (median MFE 4.2R; 54% reach 3R;
44% reach 5R). The weakest upside is **CHoCH · Bullish** (median MFE ~2.0R; 2R reached
under half the time).

---

## 2. Best tradeable cohorts

Ranked by eventual opportunity (median MFE + how far the capture curve extends),
with the reaction caveat applied.

1. **BOS · Bearish** — median MFE **4.21R**; 1R 82% · 2R 67% · 3R 54% · 5R 44%.
   The only cohort that genuinely supports **3R+ runners**. Sample: 39 OBs (moderate).
2. **London-origin OBs** — 1R **91%** (highest hit rate in the run) · 2R 61%; median
   MFE 2.66R. Zones born in London reach 1R the most reliably. 33 OBs.
3. **BOS (all)** — median MFE 2.77R; 1R 80% · 2R 62% · 3R 48%. Solid 2R workhorse with
   runner potential. 69 OBs.
4. **Bearish (all)** — median MFE 2.69R; 2R 60% · 3R 47%. Bearish beats bullish on
   depth across the board. 77 OBs.

Note: "best" here means best *opportunity to capture*. Reaction success is still only
~10–13% in all four — so the edge is in patient management, not the immediate bounce.

---

## 3. Worst / avoid cohorts

Nothing here is a clean "avoid the zone entirely" — the issue across the run is *how*
they are entered, not that the zones are worthless. But these are the weakest:

- **By-retest-number, R2 and R3+ (immediate-reaction trading).** R2 reaction 9%,
  R3+ reaction 8% — the worst prompt-reaction in the run, and R3+ has the highest
  window hold (95%), which is the textbook *weak hold* trap (looks safe, rarely pays
  promptly). If you are trading the immediate reaction, **second/third+ retests are
  effectively "don't bother."**
- **CHoCH · Bullish** — weakest upside of the four structure×direction cohorts:
  median MFE ~1.98R, 2R only 49%. Treat as a **1R–1.5R** zone, not a runner.
- **New York-origin OBs** — lowest 1R hit rate (66%) of the well-sampled sessions;
  even 1R is missed by a third. Don't assume BE-at-1R here (see §5).

There is **no "Avoid" verdict** in the strict sense for any cohort — but R2/R3+ as an
*immediate-reaction trade* is the closest thing to it.

---

## 4. Target recommendations by cohort

Verdicts use the report scale: *Avoid · Scalp only · 1R target · 1.5R–2R target ·
Can consider 3R+ · Needs more sample.* "Suggested Target" is the model's own pick
(largest R reached by ≥50% of the cohort); "≈" would mark a median fallback (none
occurred here). All targets are idealized opportunity, not guaranteed fills.

| Cohort | OB sample | Median MFE | 1R / 2R / 3R / 5R | Model target | Verdict |
|---|---|---|---|---|---|
| **Structure** | | | | | |
| BOS | 69 | 2.77R | 80 / 62 / 48 / 36% | 2.5R | **1.5R–2R target** (runners to 2.5R) |
| CHoCH | 75 | 2.03R | 73 / 51 / 39 / 32% | 2R | **1.5R–2R target** |
| **Direction** | | | | | |
| Bearish | 77 | 2.69R | 75 / 60 / 47 / 38% | 2.5R | **1.5R–2R target** (lean 2R+) |
| Bullish | 67 | 2.27R | 78 / 52 / 39 / 30% | 2R | **1.5R–2R target** |
| **Structure × Direction** | | | | | |
| BOS · Bearish | 39 | **4.21R** | 82 / 67 / 54 / 44% | 4R | **Can consider 3R+** |
| BOS · Bullish | 30 | 2.41R | 77 / 57 / 40 / 27% | 2.5R | **1.5R–2R target** |
| CHoCH · Bearish | 38 | 2.09R | 68 / 53 / 39 / 32% | 2R | **1.5R–2R target** |
| CHoCH · Bullish | 37 | 1.98R | 78 / 49 / 38 / 32% | 1.5R | **1R–1.5R target** |
| **Origin Session** | | | | | |
| London | 33 | 2.66R | 91 / 61 / 45 / 42% | 2.5R | **1.5R–2R target** (best 1R reliability) |
| New York | 50 | 2.46R | 66 / 54 / 44 / 28% | 2.5R | **1.5R–2R target** (manage; 1R only 66%) |
| Outside | 22 | 2.38R | 82 / 55 / 45 / 41% | 2.5R | **1.5R–2R target** (moderate sample) |
| Asia | 25 | 2.21R | 72 / 56 / 40 / 36% | 2R | **1.5R–2R target** (moderate sample) |
| London Lull | 14 | 2.34R | 79 / 57 / 36 / 21% | 2R | **Needs more sample** (14 OBs) |
| **Retest Number** (1R/2R capture only — see note) | | | | | |
| R1 (first retest) | 144 | 1.68R | 65 / 45% | 1R | **1R target** · best reaction (19%) |
| R2 | 97 | 1.45R | 64 / 46% | 1R | **1R target / scalp** (weakest MFE) |
| R3+ | 72 | 1.60R | 65 / 47% | 1R | **1R target** (weak hold; slow) |

**Retest-session and same-vs-cross-session:** these are *event-grain* dimensions, so
the lab correctly **withholds monetization** (an OB's single MFE-before-death can't be
pinned to one retest's session). Reaction/hold only:
- *Retest session:* New York react 11% / hold 90% · London react 9% / **hold 96%** ·
  Asia 9% / 94% · Outside 11% / 88% · London Lull 12% / 90%. All weak holds; London's
  96% hold with 9% reaction is the strongest weak-hold trap.
- *Same vs cross session:* same react 12% / hold 88% · cross react 10% / **hold 94%**.
  Cross-session retests hold the window better but react slightly less — again, a hold
  difference, not a reaction edge.

> **Note on retest-number targets:** the per-retest MFE anchors only expose 1R and 2R
> capture (not 3R/5R), so the model caps the suggested target at 1R there. "1R target"
> for R1/R2/R3+ means *1R is the only level a majority reached measured from that
> retest's entry* — not that the zone can't run further overall.

---

## 5. BE (break-even) management notes

The model's **Suggested BE Trigger** is conservative: the smallest R that **≥70%** of
the cohort reached. It is a *hypothesis about where protection is cheap*, **not a
validated break-even rule** — treat it as something to test, not deploy.

- **BE at 1R is defensible** for cohorts where ≥70% reach 1R: BOS, CHoCH, Bearish,
  Bullish, BOS·Bearish, BOS·Bullish, CHoCH·Bullish, and London / Asia / Outside /
  London Lull origins. For these, moving to break-even around +1R would not have
  pre-empted the majority of the eventual run.
- **Do NOT auto-BE at 1R** for **CHoCH · Bearish** (1R reached by only 68%),
  **New York-origin** (66%), and **all retest-number cohorts** (1R reached by
  64–65% from the retest anchor). The model returns **no BE suggestion** for these —
  fewer than 70% get to 1R, so a 1R break-even would stop out a meaningful slice
  *before* the favourable move arrives. If you want protection here, test a *lower*
  trigger or accept wider risk.
- **Bigger picture:** because reaction success is low (~10%), positions frequently sit
  underwater early. An over-eager BE will convert many eventual winners into scratches.
  The data argues for **patient BE (1R at the earliest, and only where 1R hit-rate is
  high), not tight BE.**

---

## 6. What needs more sample

- **London Lull origin (14 OBs)** — below the n≥20 reliability bar for monetization.
  Reaction/hold (event n=63) is usable; the capture/target numbers are **indicative
  only**. Don't trade off them yet.
- **Moderate samples (20–39 OBs):** Outside origin (22), Asia origin (25), and the
  four structure×direction cohorts (30–39). Above the bar but thin enough that the
  capture percentages can move with a handful of zones — treat 3R/5R figures here as
  directional, not precise. BOS·Bearish's standout 4.2R median is exciting but rests
  on 39 OBs; **confirm on ≥2 more runs before sizing up on it.**
- Everything else (event n ≥ 41, OB n ≥ 33) is reliable for the rates shown, with the
  standing caveat that all R numbers are idealized opportunity.

---

## 7. Next research questions

1. **Is the low reaction success an entry-timing artifact?** Re-run the reaction
   window/min-pip settings (the run-fixed reaction config drives the 7–19% figures).
   If a looser or delayed entry lifts reaction success while preserving the 1R+ capture,
   it confirms the "entry timing, not target" thesis.
2. **Does BOS·Bearish hold up?** Reproduce the 4.2R median / 54% 3R on ≥2 more runs and
   other pairs. If it survives, it's the cohort to build a runner playbook around.
3. **Why does London-origin reach 1R 91% of the time?** Isolate what's different about
   London-born zones (width, impulse, time-of-day) — it's the most reliable 1R cohort.
4. **First-retest premium:** R1 has the best reaction (19%) but the lowest window hold
   (85%). Is there an exploitable "trade only the first retest, manage tight" edge?
5. **Cross- vs same-session holds:** cross-session retests hold the window better (94%
   vs 88%). Does that translate to better realized capture once an OB-level attribution
   method exists, or is it purely a hold-rate artifact?
6. **Cost sensitivity:** every number here is spread/slippage-free. Re-run the target
   recommendations with realistic costs to see which 1.5R–2R verdicts survive.

---

*All figures are idealized opportunity (1R = OB width; perfect fills; no spread or
slippage) and describe a single EURUSD RR5 run. Treat them as upper bounds and a
starting hypothesis for live testing, not as expected trade results.*
