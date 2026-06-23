# OB-LIFECYCLE-MONETIZATION-AUDIT-1 — Lifecycle Audit · Monetization Research Design · Roadmap UX

Audit + design only — no implementation. Date: 2026-06-10 · Author: Claude.
Evidence run: `Lux-OB-Backtester/outputs/runs/20260606_084116_EURUSD_15min_RR5_SB0`
(209 OBs · 190 touched · 508,440 one-minute candles ≈ 12 months EURUSD; engine v2
artifacts). All numbers below were recomputed independently from raw candles +
order_blocks.csv by a standalone analysis script (not the engine), so they double
as an engine cross-check. Sources also read: `src/execution.py` (`_is_invalidated`),
`lux_style_swing_ob_backtester_v1.pine` (mitigation input), v2 engine + artifacts.

---

# Phase 1 — OB Lifecycle & Monetization Audit

## 1.1 Is eventual invalidation measured correctly? — YES (mechanically)

An independent rescan of all 190 touched OBs reproduces the engine exactly:
186/190 killed (97.9%), median TTI 66 minutes. The v2 engine has no measurement
bug. The questions below are all about the *definition*, not the arithmetic.

## 1.2 Does the definition match the intended trading model? — THERE ARE THREE MODELS

| Definition | Where | Rule |
|---|---|---|
| **Tracker v2** | `retest_tracker` / `obRetest.js` | 1-min **close** beyond distal edge, buffer 0 |
| **Trading sim** | `execution.py::_is_invalidated` | 1-min **wick** beyond (low < bottom / high > top) — *stricter* |
| **Pine reference** | `obMitigationInput` | **15-min (chart TF)** high/low *or* close beyond — *more lenient* |

The tracker sits between the two. So "does it match the intended model?" has no
single answer: for **tradeability death** (when the sim stops taking the zone) the
relevant rule is the sim's wick rule; for **structural death** (what a human sees
on the 15-min chart) it's the Pine chart-TF rule. The current Eventual Failure %
measures neither precisely — it measures "first 1-minute noise close beyond".

## 1.3 Is eventual failure overstating structural death? — TTI yes, the % itself no

Evidence from the 186 kills:

- **Kill margins are spread-sized.** Median kill margin = **1.0 pip** beyond the
  edge; 51% of all deaths are ≤1 pip; 66% ≤2 pips.
- **One third of deaths never happen on the chart TF.** Only **63.4%** of kills
  are confirmed by the containing 15-min close. 36.6% are 1-minute noise the
  Pine model would not call a mitigation.
- **Most "dead" zones immediately re-hold.** **79.6%** of killed OBs print a
  1-min close back *inside* the zone within 60 minutes of "death".
- **Buffer sensitivity** (close-beyond by > b pips):

  | buffer | eventual failure | median TTI |
  |---|---|---|
  | 0 pips | 97.9% | 66 m |
  | 1 pip | 97.4% | 100 m |
  | 2 pips | 97.4% | 124 m |
  | 3 pips | 97.4% | 162 m |
  | 5 pips | 96.3% | **229 m** |

**Conclusions:** (a) the headline ~98% Eventual Failure is *robust* — over ~12
months essentially every zone eventually dies under any buffer, which is itself a
real finding ("OBs are short-lived reaction zones, not durable structures") and a
data-span artifact in equal measure; (b) the **"median 66 minutes" is NOT robust**
— it is an artifact of the 0-buffer 1-min close rule (3.5× longer at a 5-pip
buffer), and the TTI distribution is extremely skewed anyway (p25 = 16 m, median =
66 m, p75 = **19 h**, p90 = **6 days**). Medians alone mislead here; the
distribution is the finding.

## 1.4 Should an OB re-qualify after invalidation? — No; fix the death definition instead

The 79.6% re-hold rate looks like an argument for re-qualification, but
re-qualifying the same `ob_id` would break the terminal-state invariants, zombie
prevention, and both artifact schemas. The honest interpretation is that many of
these were **never structurally dead** — the kill rule was too twitchy. Recommend:

- **Two-tier death** instead of re-qualification: `soft` kill (current 1-min
  close-beyond) and `confirmed` kill (chart-TF close beyond, e.g. 15-min — new
  optional `confirm_timeframe` in config, or a per-OB `kill_confirmed_15m` flag
  computed in the same scan). Both engines, additive fields (v2.1).
- Default `failure_buffer_pips` should move off 0 (e.g. 1–2 pips or
  spread-scaled) for *research* runs; keep 0 available for the strict view.
- New zones already get new ids from the detector — that is the only
  "re-qualification" that should exist.

## 1.5 Real-example audit (25 of the 190 touched OBs, programmatic chart proxy)

Per-OB table computed from raw candles (full table reproducible via the audit
script; columns: TTI, kill margin, 15-min-confirmed, re-held ≤ 60 m, MFE before
death in R where 1R = zone width with stop at distal edge):

```
ob | dir  | width_p | tti_min | margin_p | 15m? | reheld? | MFE_R
 1 | bull |   4.0   |      0  |   2.7    | yes  |  yes    |  3.20
 2 | bear |  11.7   |   1677  |   0.8    | no   |  yes    |  6.89
 8 | bull |   9.2   |    184  |   0.2    | yes  |  yes    |  1.07
14 | bear |  13.1   |  18663  |   0.6    | no   |  yes    | 16.69
15 | bull |  10.8   |  alive  |    —     |  —   |   —     | 166.23
22 | bull |   5.4   |   4259  |   0.1    | yes  |  no     | 13.72
... (19 more in script output)
```

Reading: OB 22 was "killed" by a close **0.1 pips** beyond the edge after having
offered 13.7R; OB 14 died 0.6 pips beyond, unconfirmed on 15-min, after 13 days
and 16.7R. Visually these are working zones whose death stamp is a technicality.
Conversely OBs 3/6/7/11 (margins ≥0.5p, TTI ≤ 14 m, MFE ≤ 0.2R) are genuine
instant deaths. Both populations are real; the current single rule cannot tell
them apart — the two-tier death + kill-margin field can.

## 1.6 Phase-1 recommendations

1. Keep Eventual Failure % as-is (it is correct and honest) but **always render it
   with the TTI distribution**, never the median alone.
2. **Engine v2.1 (additive):** per-OB `kill_margin_pips`, `kill_confirmed_15m`
   (or generic `confirm_timeframe`), `reheld_after_kill` — three cheap fields, all
   computable in the existing scan; plus a non-zero default research buffer.
3. Add a glossary caveat to `retest_eventual_failure`: "death = first exec-TF
   close beyond; ~⅓ of deaths are not confirmed on the 15-min chart."
4. Record the headline result as a FINDINGS candidate only **after** the two-tier
   numbers exist (the 66-minute median should not enter FINDINGS.md as stated).

---

# Phase 2 — Monetization Research Design ("value before death")

## 2.1 Why this layer matters — measured opportunity

From the evidence run (1R = zone width, entry at proximal edge, ideal fills, no
spread — an upper bound):

- **Median MFE before death = 1.46R.** p75 = 5.3R, p90 = 12.4R.
- **RR capture before death:** 0.25R → 92% · 0.5R → 81% · **1R → 63%** ·
  2R → 46% · 3R → 34% · 5R → 26%.
- **After R1 the curve is unchanged** (n=138: 1R → 63%, 2R → 44%, 5R → 25%) —
  first evidence that the *retest itself* does not consume the zone's payout.

The product story writes itself: zones almost always die, but **most pay ≥1R
first**. The lab's job shifts from "which zones survive" to "how much can be
harvested before death, and which cohorts pay best".

## 2.2 Recommended metrics (canonical names)

| Metric | Level | Definition |
|---|---|---|
| `mfeBeforeDeathPips` / `mfeBeforeDeathR` | OB | max favorable excursion from proximal edge, first touch → death (or data end; censored flag) |
| `mfeAfterR1R` / `R2` / `R3plus` | OB | same, measured from each retest entry → death |
| `rrCaptureCurve` | run/cohort | share of touched OBs reaching ≥ xR before death; x ∈ {0.25, 0.5, 1, 1.5, 2, 3, 5} |
| `ttiDistribution` | run/cohort | log-bucketed: <15m, 15–60m, 1–4h, 4–24h, 1–7d, >7d + censored |
| `lifecycleCurve` | run/cohort | Kaplan–Meier zone-survival over time since first touch (censoring-correct — alive OBs no longer have to be dropped) |
| `edgeDecayByRetest` | cohort | reaction success % and median window MFE by retest number (R1/R2/R3+) — extends the existing dimension with the decay framing |
| `killMarginPips`, `killConfirmed15m`, `reheldAfterKill` | OB | Phase-1 fields; double as research dimensions (true death vs technical death cohorts) |

R-unit definition must be pinned in the glossary: 1R = zone width (entry proximal,
stop distal), idealized; it is an opportunity ceiling, not realized PnL.

## 2.3 Research questions → views

1. *How much opportunity before death?* → **Monetization Curve** (RR capture, with
   per-cohort overlays) — the hero chart of the new layer.
2. *Realistic RR targets?* → capture table with the marginal trade-off explicit
   (e.g. 1R hits 63% of zones; 2R halves to 46%).
3. *Does edge decay by retest count?* → decay table R1 vs R2 vs R3+ on reaction
   success + MFE-to-death (first evidence says: no decay — worth confirming
   across runs before it becomes a finding).
4. *Which cohorts pay best?* → reuse the entire existing enrichment (session,
   structure, size, origin candle dims) with `mfeBeforeDeathR` as the ranked
   metric — zero new dimension code, one new metric column.

## 2.4 Architecture

**Backend (authoritative):** extend the v2 scan in `retest_tracker.py` — it already
walks every candle from first touch to death, so MFE tracking is one `max()` per
candle and per-retest anchors are already known. Additive per-OB columns
(summary CSV v2.1): `mfe_before_death_pips`, `mfe_after_r1_pips`,
`mfe_after_r2_pips`, `mfe_after_r3_pips`, `kill_margin_pips`,
`kill_confirmed_15m`, `reheld_after_kill`. `summary_fields()` adds the capture
curve + TTI buckets. Same fingerprint pattern as v2 (new column = v2.1 sniff).

**Frontend:** mirror in `obRetest.js` (derivation path already holds candles);
new pure module `obRetestMonetization.js` (curves: rrCaptureCurve, ttiBuckets,
kaplanMeier, decayByRetest — all consuming perOB rows + enriched events, nothing
recomputed in components); importer maps the new columns behind the v2.1 sniff;
v1/v2 artifacts simply hide the panels (same null-gating pattern as `obLevel`).

**UI:** one new "Monetization" section in the Retest Lab between OB Outcomes and
the Session Matrix: Monetization Curve, TTI histogram, decay table, and a
"best-paying conditions" list (the existing Best/Worst component re-ranked by
`mfeBeforeDeathR`). Parity/tests follow the established two-engine pattern.

---

# Phase 3 — Retest Lab Roadmap (UX proposal)

**Trigger:** a small ghost button in the Retest Lab header row, right-aligned next
to the basis banner — `Map` (or `FlaskConical`) icon + "Roadmap" + a count badge
("2 active"). Costs ~28px of header; invisible until wanted.

**Surface:** right-side drawer (not a modal — keeps the lab visible and scrollable
behind it; matches the app's drilldown idiom), Radix Dialog with a slide-in panel,
dark-lab styling, closable by overlay/esc.

**Content sections:**

1. **Shipped** — one row per module (Phase 1 Lab, 2.4 Backend-preferred, C1 Edge
   Discovery, C2 Origin dims, Hold-rename, v2 Continuous Invalidation): title,
   date/commit, one-line outcome.
2. **Active** — current investigations with status notes.
3. **Planned** — prioritized queue (Phase-1 fixes, Monetization layer, KM curve…).
4. **Key Findings** — the F-### style stat lines (e.g. "98% of touched zones
   eventually die; 63% pay ≥1R first"), each with the run id it came from.

**Data model:** static, versioned module `frontend/src/data/retestRoadmap.js` —
`{ id, lab: "retest", title, status: "shipped"|"active"|"planned", date, summary,
findings?: [{stat, runId}], links?: [] }`. No backend, no store; updating the
roadmap is a one-file PR that doubles as documentation. The `lab` key makes the
schema reusable for other labs later (Failures, Protection).

**Coordination note:** an untracked `components/lab/roadmap/` + `data/roadmapStore.js`
already exist in the working tree from a parallel stream — before building,
check whether that generic roadmap primitive is landing; if so, implement this as
its first consumer rather than a parallel one-off.

---

# Prioritized implementation order

| # | Item | Why first | Size |
|---|---|---|---|
| P0 | **Death-definition fix (engine v2.1):** kill margin, 15-min confirmation flag, re-held flag, non-zero default research buffer — both engines + tests | Every downstream metric inherits its credibility from the death stamp; ⅓ of current deaths are unconfirmed noise | M |
| P1 | **Monetization fields** (MFE before death / after R1–R3) in both engines + importer sniff | The scan is already walking the candles; the data is free | M |
| P1 | **Monetization UI:** RR capture curve, TTI histogram, decay table | Turns the 63%-pay-1R result into the lab's centerpiece | M |
| P2 | **Kaplan–Meier lifecycle curve** | Best-practice view of TTI + censoring, after the simple histogram proves demand | S–M |
| P2 | **Roadmap drawer** | Independent of everything; cheap; do whenever | S |
| P3 | **Cohort re-ranking by MFE** + cross-run confirmation of "no decay by retest #" | Needs P1 data on ≥2–3 runs before claiming findings | S |

Nothing above changes trade simulation; all of it is post-processor + lab surface,
same blast-radius profile as v2.
