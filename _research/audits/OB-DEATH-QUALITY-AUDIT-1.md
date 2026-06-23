# OB-DEATH-QUALITY-AUDIT-1 — Is Eventual Failure % the right death definition?

Audit only — nothing implemented, no artifacts regenerated. Date: 2026-06-10.
Evidence run: `20260606_084116_EURUSD_15min_RR5_SB0` (190 touched OBs, 508k 1-min
candles ≈ 12 months). Method: the staged **v2.1 engine** run in-memory for the
per-OB field breakdown (Part 1), plus an independent vectorized rescan for the
candidate-definition comparison (Part 2; kill candidates = *transitions* into
close-beyond, so re-kills after revivals are visible — something the terminal-only
v2 engine cannot see).

## Part 1 — Breakdown of the 186 first-kills (actual v2.1 fields)

| Group | n | % of kills | med margin (p) | med TTI (m) |
|---|---|---|---|---|
| 1. Soft kill (any) | 186 | 100 | 1.0 | 66 |
| 2. Confirmed (15m) | 118 | 63.4 | 1.1 | 76 |
| 3. Re-held ≤60m | 148 | 79.6 | 0.8 | 66 |
| 4. Confirmed AND re-held | 81 | 43.5 | 0.8 | 95 |
| 5. Confirmed, never re-held | 37 | **19.9** | **3.1** | 74 |
| 6. Soft-only (never confirmed) | 68 | 36.6 | 0.8 | 62 |

Soft Kill % of touched = 97.9%. The standout: **only 1 kill in 5 is "decisive"**
(confirmed on the 15m close AND not re-held within the hour), and that group's
median kill margin is **3×** everyone else's (3.1p vs 0.8p). Margin, confirmation,
and re-hold all point at the same minority of genuinely decisive breaks. Note
group 4: even among *confirmed* kills, a majority (81/118) re-hold within an hour
— 15m confirmation alone is not decisiveness.

## Part 2 — Candidate death definitions (independent rescan, full horizon)

Revival = any later candle whose favorable excursion beyond the proximal edge
reaches ≥ 8 pips (the lab's reaction threshold) — i.e. price came back through
the zone and reacted. Residual MFE = max favorable after declared death.

| Definition | death % of touched | med TTI | revived after death | med residual MFE | "permanently dead" % of touched |
|---|---|---|---|---|---|
| A. Any kill (current) | 97.9 | 66 m | 96.8% | 322 p | 3.2 |
| B. Confirmed kill | 96.8 | 190 m | 96.7% | 322 p | 3.2 |
| C. Confirmed + never re-held | 95.3 | **538 m** | 93.9% | 316 p | 5.8 |
| D2. Confirmed + margin > 2p | 92.1 | 1,257 m | 96.6% | 310 p | 3.2 |
| D5. Confirmed + margin > 5p | 71.1 | 24,247 m (17 d) | 96.3% | 261 p | 2.6 |
| E1. Two consecutive 15m closes beyond | 95.8 | 338 m | 95.6% | 314 p | 4.2 |
| E2. Kill + no zone re-entry for 24h | 80.0 | 8,334 m (5.8 d) | 86.2% | 304 p | 11.1 |

## The headline answer

**"What percentage of OBs appear permanently dead?" — essentially none.**
Under *every* definition tested, 86–97% of "dead" zones are later traversed with
a ≥8-pip reaction, and the median residual favorable move after death is ~300
pips (the market's subsequent range, not zone alpha — but it means price crossed
the zone again, repeatedly). Over a 12-month horizon, permanence is **3–11% of
touched zones**, and most of that is just data-end censoring in disguise.

Two honest caveats: the revival proxy is deliberately loose (any later ≥8p
traversal, unbounded horizon — a time-bounded revival would be lower), and this
is one run / one pair. But the magnitude (·9×%) is not subtle.

## What this means for the metric

1. **The binary death *rate* is the wrong lens.** Every candidate definition
   converges to ~92–98% eventual death (only D5/E2 dip, by waiting days). A
   metric that always reads ~98% carries no information. What the definitions
   actually change — by **two orders of magnitude** (66 m → 17 d) — is *when*
   death is declared. Time-to-death and pay-before-death are the real variables;
   the audit's earlier instinct ("always render the TTI distribution, never the
   rate alone") was right and should now go further: demote Eventual Failure %
   from headline to context stat.
2. **Zones are not binary alive/dead — they cycle.** 80% re-hold after their
   first kill; even confirmed kills mostly re-hold. The v2 terminal model (one
   death, stop tracking) is a deliberate simplification that the v2.1 fields now
   show is hiding the actual structure: kill → revive → re-kill sequences.
3. **Definition quality ranking** (for "decisive break" semantics): **C** is the
   best single upgrade — first kill that is 15m-confirmed and never re-held;
   it isolates the 20% decisive-break minority (3× margins), shifts median TTI
   to ~9 h (plausible for structural death on a 15-min chart), and needs no new
   tunable beyond the existing 60m re-hold window. **D** is redundant once C
   exists (the C-group already carries the high margins; D5 mostly measures
   trend departure, not zone death). **E1** ≈ a weaker C. **E2 (abandonment)**
   is the most *permanent* (86% revival vs 94–97%) but lags by days — valuable
   as a research label, unusable as a live metric.

## Recommendation — v2.2 research path ("death tiers", not a new death)

Do **not** replace Eventual Failure % with another binary. Recommend a v2.2 that
records the kill **sequence** and grades each OB's death by tier:

1. **Multi-kill tracking:** per OB, a list of kill candidates (fresh transitions
   into close-beyond) each with `margin / confirmed / reheld60` — the Part-2
   rescan proved this is cheap. Terminal fields stay for compatibility.
2. **`deathTier` per OB** (monotone, timestamped): `soft` (first kill — current
   v2 terminal) → `confirmed` (B) → `decisive` (C) → `abandoned` (E2, 24h
   parameterized). Each tier gets its own TTI; Kaplan–Meier per tier becomes the
   lifecycle view the lab plots.
3. **Reporting:** OB Outcomes panel shows the tier funnel (97.9% soft → 63%
   confirmed → 20% decisive-at-first-kill → …) instead of one 98% number;
   Eventual Failure % stays as a tooltip-level context stat with its censoring
   caveat.
4. **Monetization join (the payoff):** MFE harvested *between tiers* — e.g. what
   re-held zones pay between soft death and decisive death. Part 1 group 4
   (confirmed-but-re-held, 43.5% of kills) is exactly the cohort the current
   model writes off while it may still be paying.
5. **Time-bounded revival metrics:** revival-within-4h/24h per tier + revival
   latency distribution, replacing this audit's unbounded proxy.
6. **Validation gate:** reproduce the tier funnel on ≥2 more runs (different
   pair and/or window) before anything enters FINDINGS.md; revisit the 60m
   re-hold and 24h abandonment constants there.

Sequencing note: this slots cleanly *after* the already-planned Phase B–D
(importer/UI for v2.1) — the v2.1 fields shipped in Phase A are exactly the
inputs the tier model composes, and nothing above changes event classification
or the v2 terminal schema.
