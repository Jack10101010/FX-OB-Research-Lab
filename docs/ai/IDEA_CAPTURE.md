# IDEA_CAPTURE.md — freeform ideas

Low-friction capture. Anything goes; groom later into `BACKLOG.md`. Date entries.
Not commitments — a parking lot for research directions and UX thoughts.

*Last updated: 2026-06-07.*

---

## Research directions

- **Effect-significance, not just precision.** Track `sumR2` so confidence can test whether avgR
  is reliably ≠ 0 (t-style), instead of only how tightly WR is estimated. (2026-06-07)
- **Multi-run consistency as a confidence input.** A finding that holds across runs/periods is
  more trustworthy than one strong run. Could feed a future `stabilityScore` term. (2026-06-07)
- **Vacant-No-AAE deep dive.** Is the rest of the Vacant cohort (beyond AAE) even stronger? Split
  by how it became vacant (gap vs drift). (2026-06-07)
- **Distance × fill-state interaction.** Once distance is imported, cross distance bands with
  Vacant/AAE — is the <2 pip danger concentrated in a fill state? (2026-06-07)
- **Distance-at-Arm as an orthogonal classification dimension.** Don't fold pip-bands into the
  `fill_state` enum (combinatorial blowup: vacant_0_2 × aae/no-aae …). Add a separate `distance_band`
  dimension (null unless Vacant / unless the field exists), derived like `deriveFillState`, so it
  crosses freely with fill-state × session × model and plugs into Research Signals as just another
  candidate dimension. Export **signed pips** (direction matters: outside vs inside) **+ pct-of-OB-
  width** (normalizes across OB sizes); absolute = `abs(signed)`. Distance is the magnitude version
  of the binary `ob_occupied_at_arm` we already have. (2026-06-08)
- **Unify vacancy distance + occupation depth into ONE signed arm-offset.** They're the two signs of
  the same quantity (offset from the entry-side OB edge at arm: + vacant / − occupied). One signed
  field = vacancy distance (positive), occupation depth (−value), AND the binary (sign) — no
  redundant fields, no inconsistency risk. Band it **signed & symmetric** with an explicit **Edge
  Zone (|offset| < ~2 pips)**; the live hypothesis is the danger is *being near the edge on either
  side*, generalizing F-004 beyond "vacant < 2 pips". (2026-06-08)
- **% vs pips for arm-offset.** % of OB width is more comparable across OB sizes (2 pips on a 5-pip OB
  ≠ 2 pips on a 50-pip OB) → probably the better default for the *edge structure*; pips matter for
  the *danger threshold* (it's spread/slippage-relative). Export both; let research toggle. (2026-06-08)
- **A–H cross-study program (Distance × …).** Vacancy-quality curve · occupation-depth curve · % vs
  pips · vacancy × occupation matrix · Distance × AAE (does AAE need a min vacancy?) · Distance ×
  Session (is Outside-danger a small-vacancy confound?) · Distance × C0–C3 (is the delay edge really
  a distance edge?) · Distance × FFT. Big enough to be its own workstream once the export lands. (2026-06-08)
- **Displacement-metrics family.** `fft_move_away_pips_at_cancel`, `max_distance_away_before_fill_pips`,
  and the new arm-offset are all "price-vs-OB displacement at event X" — could share one normalized
  treatment (pips + % of OB width) and one glossary family, even though they fire at different events
  (cancel / pre-fill excursion / arm). (2026-06-08)
- **Time-based companions to arm-offset (from the backend spec's "Future Optional Metrics").** The
  signed arm-offset is a *snapshot at arm*; three time-dimension siblings could explain the same edge
  from a duration angle and would be cheap once the snapshot infra exists: **(a) Distance Persistence** —
  how long the OB stayed vacant/occupied around arm (is a fleeting vacancy different from a durable one?);
  **(b) Time Vacant Before Fill** — minutes the entry-side edge was vacant before the fill (pairs with
  AAE's "fills land ~4 min after OB exit"); **(c) Time Occupied Before Arm** — dwell time on the occupied
  side before arming (does *long* occupation predict the weak ~+0.08R Occupied cohort better than depth?).
  All three are deferred / Phase-2+; logged so they aren't re-derived. (2026-06-08)
- **Session × fill-state interaction.** Does Vacant's edge survive Outside session, or is Outside
  uniformly bad regardless of fill state? (2026-06-07)

## UX ideas

- **Research Signals as the tab's headline** — a plain-English "what the data says" banner with
  confidence, above the cards. (designed → Phase 2) (2026-06-07)
- **Saved findings / research library** — pin a signal with its run + filters; compare later. (2026-06-07)
- **Confidence-aware coloring** — dim low-confidence rows/cards so the eye trusts the strong ones. (2026-06-07)
- **"Why this signal?" expander** — show the sample, WR interval, and the rule that fired. (2026-06-07)

## Platform / workflow

- Consider a tiny `/why` command: explain how a surfaced signal/confidence was computed. (2026-06-07)
- Automate `/sync` proposals at end of each implementation task. (2026-06-07)
