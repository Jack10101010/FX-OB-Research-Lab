# Management Tab — Research-Discovery Redesign (AUDIT ONLY)
Run Detail → Session Results → cohort drilldown → **Management** tab.
Scope of this doc: audit current implementation, design a research-discovery redesign, give formulas, required data, and a prioritised plan. **No implementation, no backend/simulator changes, no commits.** The guiding constraint is **statistical honesty** — every estimate must be labelled by how exact it is.

---

## 0. The honesty spine (read first)
Everything below is graded by how trustworthy the estimate is from *existing single-run artifacts*:
- **EXACT** — reconstructable to the cent from per-trade fields without assumptions (validated elsewhere: re-targeting via stop-anchored `mfe_r` reproduces candidate net R 85/85).
- **BOUND** — computable but path-dependent; only a worst-case / best-case bound, not a point estimate.
- **SPECULATIVE** — cannot be derived from a single-entry run; needs a backend run. Must not be shown as a number that looks like a result.

This grade must be visible to the user (badge/footnote), or the tab becomes a misleading-results machine.

---

## 1. Current implementation (code audit)
Files: `frontend/src/components/lab/sessionProfiles/SessionResults.jsx` (UI) + `frontend/src/data/sessionResults.js` (helpers). Cohort objects are built by `buildSessionResults` and carry: `executedTrades`/`executed` (WIN/LOSS/NF), `disabledOpportunities`, `cancelledOrMissedOpportunities`, `summary` (`statsFor`: count/wins/losses/be/netR/avgR/winRate), `tpLabel`/`beLabel`/`entryLabel` (from the cohort rule).

**Cohort header** — card shows `${executedCount} trades`; drilldown KV grid shows Executed / Disabled / W·L·BE / Net R / Avg R / Win rate. (`cohortHeaderCounts(c)` already exists and returns `{trades, won, lost, newsFlat, invalidated}`.)

**Target Suitability** — `cohortTargetSuitability(rows, levels=TARGET_SUITABILITY_LEVELS)`. Pure MFE reach-rate: per level, `reachedPct` / `winnersReachedPct` / `losersReachedPct` (denominators = valid-MFE counts) + coverage line. Reached = `mfe_r >= level`. **No P&L, no decision support.**

**BE Suitability** — `cohortBESuitability(rows, levels=[0.5,1,1.5,2])`. Per level: `losersReachedPct`, `winnersReachedPct`, `netBenefitScore = losersReachedPct − (100 − winnersReachedPct)`, `signal` (Strong/Mixed/Weak). **Reach-rate only; "signal" is a heuristic, no R impact.**

**Limitations.** All three are *reach-rate descriptions*. None answers "what should I test next and what would it plausibly do to net R?" The biggest missed opportunity: the run exports `mfe_r` (stop-anchored, TP-ignored) and `total_cost_r` per trade — enough to reconstruct **exact** net R at *any* target, which the table does not use.

**Data availability (importer passes through, both camel+snake):** `mfe_r`, `mae_r`, `mae_r_to_original_exit`, `r_if_no_target`, `net_r/gross_r/total_cost_r`, `max_ob_penetration_pct`, `fill_penetration_pct`, `max_distance_away_before_fill_*`, `post_stop_mfe_r`. So target/BE/risk-reduction estimates are computable client-side; entry-threshold counterfactuals are not (see §8).

---

## 2. Cohort header
**Audit:** the proposed `42T | 31W | 11L | 0NF | 0INV` is **fully available today** — `cohortHeaderCounts(c)` already returns exactly these (W=WIN, L=LOSS, NF=NEWS_FLATTEN_*, INV=INVALID_CANCELLED from the cancelled bucket). NF and INV are present for every cohort; older bundles without a cancelled bucket gracefully yield INV 0. Disabled stays in its own bucket (never counted as L).

**Additional header stats — recommended (all EXACT, already in `summary` or one line away):**
- **Net R** (`summary.netR`) — yes, primary.
- **Win rate** (`summary.winRate`, WIN/(WIN+LOSS)) — yes.
- **Expectancy** (`netR/count`) — yes (add; trivial).
- **Avg R** (`summary.avgR`) — already exists.
- **PF** — *not currently computed*; add `sum(+R)/|sum(−R)|` in `statsFor` (one accumulation). High value, EXACT.

**Safest implementation:** header line = `42T · 31W · 11L · 0NF · 0INV` then a second muted line `Net +12.3R · PF 2.04 · Exp +0.29R · WR 74%`. Tint INV danger when >0. No new data; only `statsFor` gains `pf`.

---

## 3. Target Suitability → decision-support (the flagship upgrade)
**Key feasibility result:** with entry/stop fixed, the outcome at any target T is **EXACT**: a trade wins iff `mfe_r ≥ T` (price reached +T before the −1R stop on the stop-anchored path), so `netR(T) = Σ[(T if mfe_r≥T else −1) − total_cost_r]`. News-flatten rows can't be retargeted → hold at actual (handful). This reproduces the live result exactly (validated). So the following columns are **EXACT**, not speculative:

| Column | Grade | Formula |
|---|---|---|
| Target | — | level |
| Reach % / Reach Count | EXACT | `mfe_r ≥ T` over valid-MFE |
| Winner / Loser Reach % | EXACT | as today |
| **Estimated Wins / Losses** | **EXACT** | `#(mfe_r≥T)` / `#(mfe_r<T)` |
| **Estimated Net R** | **EXACT** | `Σ[(T if mfe_r≥T else −1) − cost]` |
| **Δ vs Current Target** | **EXACT** | `netR(T) − netR(T_current)` (T_current from `tpLabel`/rule) |
| Confidence | heuristic | §6 |
| Opportunity Score | heuristic | §7 |

**Why this is safe:** changing the target does **not** change the fill set, entry, or stop — only where you take profit — so the MFE path fully determines it. The only assumptions: (a) NF trades excluded from retarget, (b) same-candle stop-vs-target tie resolves stop-first (matches engine). Label the table "**Estimated from realised MFE paths — exact for this fill set; confirm in backend.**" (It is not a *new* simulation, but it is exact for the existing trades.)

---

## 4. Best-candidate highlighting
Compute over the target rows (all EXACT net R):
- **Best Overall** = max `Estimated Net R` among rows with Confidence ≥ Medium (avoids tiny-sample spikes).
- **Conservative** = among rows with Δ ≥ 0, the highest-PF / smallest-maxDD (PF from the reconstructed wins/losses). Favours stability over headline R.
- **Aggressive** = max `Estimated Net R` ignoring confidence (clearly badged "low-confidence / high-variance").

**Risk of misleading:** users may read "Best Overall +28R" as a backtest. Mitigation: (1) always render the "estimated, confirm in backend" badge; (2) never auto-apply; (3) show Δ and confidence beside it; (4) cap claims when sample < threshold. Highlight = a chip on the row (`★ Best`, `◆ Conservative`, `▲ Aggressive`), not a banner.

---

## 5. Dynamic insight summary (above the table)
**Driven by:** the EXACT target reconstruction (Δ vs current, reach at the candidate) + confidence. Rules:
- Emit a "recommend backend validation of T" line **only if** `Δ(T) > +cost_floor` AND Confidence ≥ Medium AND `decided ≥ 12`. Phrase with the reach trade-off ("0.75R keeps 55% reach while raising reward").
- Else emit "Current target appears near-optimal — no higher-R candidate clears the confidence bar."
- **Small-sample guard:** if `decided < 8`, suppress recommendations entirely → "Sample too small (n) for target guidance." (mirrors the existing `cohortManagementRead` "Small sample (5–9)" caveat.)
This keeps it from generating nonsense on 4-trade cohorts.

---

## 6. Confidence system (practical)
Badge from the *decision-relevant* counts, not total trades:
- **High** — `winnersWithMFE ≥ 20 AND losersWithMFE ≥ 10` (or `decided ≥ 40`).
- **Medium** — `decided ≥ 15`.
- **Low** — `decided < 15` (and force Low if the level's reach count < 5 — a % off 3 trades is noise).
Inputs already available (`winnersWithMFE`, `losersWithMFE`, per-level reach counts). Keep it deterministic and visible; don't dress noise as signal. (Most session cohorts here are 16–37 trades → mostly Medium/Low — be honest about that.)

## 7. Opportunity Score (ranking aid, NOT predictive)
`score = clamp(Δ_netR_per_trade, 0, …) × confidenceWeight × reachWeight`, where confidenceWeight ∈ {Low .4, Med .7, High 1.0} and reachWeight dampens ultra-thin reach. Display 0–100, **labelled "prioritisation aid, not a prediction."** Used only to sort which target to test first. Never summed, never shown as expected profit.

---

## 8. Entry Threshold Suitability (highest-value — but mostly NOT reconstructable)
**Brutally honest verdict:** you **cannot** estimate a different entry threshold's net R from a single-entry cohort. A deeper entry changes the **fill set** (which OBs trigger/fill), the **entry price**, the **stop distance**, and therefore the **R denominator** of every metric. `mfe_r`/`mae_r` are measured relative to the *current* entry/stop and do not transform to a different entry. So:
- **SPECULATIVE (do NOT compute from one cohort):** Estimated Win %, Estimated Net R, Opportunity Score at other thresholds. Showing these would be the entry-side equivalent of the look-ahead retest filter — misleading.
- **Weakly estimable (BOUND, label clearly):** *fill/reach probability* — from `max_ob_penetration_pct` on filled trades you can say "X% of filled OBs penetrated ≥ 50%", but it's conditional on having filled at 25% (selection-biased), so it under-counts OBs that a deeper entry would have caught and over-counts those it wouldn't.
- **The correct data source already exists:** the run emits **entry-threshold variants** (`entry_triggered_edge_{1,25,50,75}p0_*` trade files / `entryResults.tradesByMode`). The Entry Threshold Suitability table should be a **cross-variant comparison** (net R / PF / WR / trade count per threshold from the *actual* variant runs), exactly analogous to how scenario_results compares scenarios — **not** an MFE reconstruction. Design it to read `entryResults`/variant files when present, and show "run the entry sweep to populate" when absent.

So: build the table, but **source it from real entry-variant results**, mark single-cohort estimation as unavailable, and make "run entry sweep" the call-to-action. This keeps it as useful as Target Suitability *and* honest.

---

## 9. BE Suitability redesign
Proposed columns and their grades:
| Column | Grade | Notes |
|---|---|---|
| Level | — | |
| Losers / Winners Reached | EXACT | as today (`mfe_r ≥ level`) |
| **Potential Saved R** | **BOUND** | losers reaching level, capped at the BE stop — *upper bound* (assumes the milestone was hit before the adverse move; path order unknown) |
| **Potential Lost R** | **BOUND** | winners whose in-trade adverse (`mae_r_to_original_exit`) ≤ BE level **and** `mfe_r ≥ level` — *worst-case* threatened winners |
| **Net Impact Estimate** | **BOUND (lower bound)** | Saved − Lost; honest as a *pessimistic* bound only |
| Signal | heuristic | keep, but drive off the bounded net impact |

**Safe vs unsafe:** reach counts EXACT; Saved/Lost/Net Impact are **bounds, not point estimates**, because BE outcome depends on whether the milestone was reached *before* the dip — which the per-trade peak/trough fields cannot order. **Label every R column "exploratory bound — requires backend BE simulation for true P&L."** Prior research showed BE generally hurts here (cuts the winner tail); the redesigned table should make that visible (large "Potential Lost R") rather than implying BE is free.

## 10. Risk-Reduction Suitability (NEW section, separate from BE)
Rules like `after 0.25R → stop −0.75R`. Same machinery/grade as BE (BOUND):
- **Potential Saved R** = losers with `mfe_r ≥ M`, loss capped at −L (upper bound).
- **Potential Threatened Winners** = winners with `mfe_r ≥ M` AND `mae_r_to_original_exit ≤ −L` (worst-case).
- **Net Impact (bound)** + **Opportunity rank**.
This was repeatedly more useful than BE in prior research, *but* the same path-ordering caveat applies — present as bounds + "confirm in backend." Feasible from existing fields (`mfe_r`, `mae_r_to_original_exit`, `total_cost_r`).

---

## 11. Recommended research workflow (UX)
```
Cohort Header        42T · 31W · 11L · 0NF · 0INV   | Net +12.3R · PF 2.04 · Exp +0.29R · WR 74%
   ↓
Insight Summary      1–2 lines, gated by confidence + sample (§5)
   ↓
Target Suitability   EXACT net-R table + Δ + Best/Conservative/Aggressive chips + confidence
   ↓
Entry Threshold      cross-variant (real) table OR "run entry sweep" CTA  (§8)
   ↓
BE Suitability       reach + BOUNDED saved/lost/net-impact + signal
   ↓
Risk Reduction       reach + BOUNDED saved/threatened + opportunity rank
```
Each section header carries its honesty grade (EXACT / ESTIMATE-BOUND / NEEDS-BACKEND). A user opens a cohort and reads, top-to-bottom: counts → one-line verdict → which target to test (exact) → which entry to test (from real variants) → whether BE/risk-reduction is worth a sim.

---

## 12. Deliverable summary
**1. Current audit** — three reach-rate tables; rich per-trade fields already imported but unused for P&L; `cohortHeaderCounts` exists; `statsFor` lacks PF.
**2. UX redesign** — header counts+stats line; gated insight summary; decision-support Target table with candidate chips; new Entry-Threshold (variant-sourced) and Risk-Reduction sections; confidence badges everywhere.
**3. Formulas** — Target net R/Δ **EXACT** via `mfe_r`+`total_cost_r`; BE & Risk-Reduction **BOUNDS** via `mfe_r`+`mae_r_to_original_exit`; PF/expectancy from sums; opportunity score = Δ×confidence×reach (ranking only).
**4. Required backend data** — none new for Target/BE/Risk-Reduction/Header (all in current export). Entry-Threshold needs the **entry-variant results** (already produced by the run when the entry sweep is on); cohort-level entry estimation is **not** possible without a backend run.
**5. Safe vs unsafe** — EXACT: target net R/Δ, header counts/PF/expectancy. BOUND (label as such): BE & risk-reduction R impacts. SPECULATIVE (do not fabricate): per-cohort entry-threshold net R/win% — source from real variants instead.
**6. Prioritised implementation order:**
   1. **Header counts + stats line** (data exists; add PF to `statsFor`) — trivial, high daily value.
   2. **Target Suitability EXACT net-R + Δ columns + confidence** — the flagship, exact, decision-grade.
   3. **Insight summary + candidate chips** (built on #2) — gated by confidence/sample.
   4. **Risk-Reduction section (bounds)** — higher prior value than BE.
   5. **BE redesign (bounds)** — make the winner-tail cost visible.
   6. **Entry-Threshold table from entry-variant results** — highest value but most build (cross-variant wiring) and must avoid single-cohort speculation.
   7. **Opportunity score / sorting** — last; pure prioritisation polish.

**Overarching caution:** most session cohorts here are 16–37 trades (per-level reach counts often <10), so confidence will frequently be Low/Medium — the redesign's main job is to make that uncertainty *loud*, surface the few EXACT, decision-grade numbers (target net R/Δ), and route everything else to "confirm in backend." Done right it accelerates research; done loosely it manufactures false precision.
