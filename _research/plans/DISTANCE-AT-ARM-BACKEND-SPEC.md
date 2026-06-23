# DISTANCE-AT-ARM-BACKEND-SPEC

**Target repo:** FX-OB-Backtester (Python backend / exporter)
**Consumer:** FX-OB-Research-Lab (frontend research platform)
**Status:** specification / handoff — **not yet implemented**
**Audits behind this:** DISTANCE-AT-ARM-RESEARCH-1, DISTANCE-AT-ARM-EXPORT-1, this design pass.

> This document is a self-contained engineering spec for adding **two signed arm-offset
> fields** to the per-trade export. It does not change any frontend or backtester code; it
> defines the contract the backtester must satisfy so the frontend can build the
> Distance / Occupation-Depth research surface.

---

## Overview

**Why the metric exists.** The frontend's fill-state taxonomy already distinguishes **Occupied
At Arm** (price still inside the order block when the limit armed, ~+0.08R) from **OB Vacant At
Arm** (price had left the block, ~+0.89R — the primary edge). Today that distinction is **binary**
(`ob_occupied_at_arm`). The natural next question — *how far* — has no data behind it.

**F-004 context.** Backend analysis found that **very small vacancy distances (< ~2 pips) are weak
or negative**, suggesting the Vacant edge is not uniform: barely-vacant fills behave more like the
weak Occupied baseline. This is currently the single most promising follow-up because it may
explain **why** the Vacant edge exists — but it **cannot be reproduced inside the platform**.

**Why the frontend cannot currently derive it.** The export carries only arm-time *booleans /
indices / timestamps* (`ob_occupied_at_arm`, `armed_after_ob_exit`, `arm_candle_index`, `armed_at`,
`exited_ob_before_arm`). There is **no price snapshot at arm and no OB-edge price at arm** in the
bundle, so a distance cannot be computed client-side. A repo-wide search confirms no
`price_distance_from_ob_at_arm*` / `arm_distance` field exists anywhere in the frontend.

**Why a signed arm offset (not separate vacancy + occupation metrics).** Vacancy distance and
occupation depth are **the two signs of one quantity** — the price's offset from the order block's
entry-side edge at arm. One **signed** number yields:
- **vacancy distance** = the positive side,
- **occupation depth** = the negative side (its magnitude),
- the existing **binary** = its sign (`ob_occupied_at_arm` ⟺ `offset ≤ 0`).

Exporting separate fields would be redundant and risks the three numbers disagreeing. **One signed
field per unit (pips and %) is the canonical, minimal, drift-proof representation.**

---

## Field Specification

Two additive per-trade fields. Everything else (absolute distance, vacancy distance, occupation
depth) is **derived in the frontend** and must NOT be exported separately.

### `price_distance_from_ob_at_arm_pips`
- **Type:** signed float (nullable).
- **Units:** pips (instrument pip size; e.g. 0.0001 for EURUSD).
- **Sign convention:** **+ = vacant/outside the entry edge · − = occupied/inside · 0 = on the edge** (see *Sign Convention*).
- **Definition:** the perpendicular, direction-aware distance from the **entry-side OB edge** to the
  **price at the arm event**, positive in the pre-entry ("away from block") direction.
- **Examples:** see *Sign Convention*.
- **Edge cases:**
  - Price beyond the **far** edge (blown through the block) → a negative magnitude **greater than the
    OB width**. Export the true value (do **not** clamp); flag in docs that `|offset|` can exceed OB
    width on the occupied side.
  - OB width = 0 / undefined → still export pips (pips don't depend on width).
- **Null behavior:** `null` when no arm occurred — baseline / non-TE trades, never-triggered setups,
  and any trade cancelled/invalidated **before** arming. (Frontend reads via `numOrNull` → safe.)

### `price_distance_from_ob_at_arm_pct`
- **Type:** signed float (nullable).
- **Units:** percent of OB width (e.g. `20.0` = 20% of the block height).
- **Sign convention:** identical to the pips field.
- **Definition:** `price_distance_from_ob_at_arm_pips / ob_width_pips × 100`, carrying the same sign.
- **Examples:** see *Sign Convention*.
- **Edge cases:** OB width = 0 / missing → **export `null`** for pct (never divide by zero); pips still
  exports. Beyond far edge → magnitude > 100%.
- **Null behavior:** `null` when there is no arm **or** OB width is unavailable.

---

## Sign Convention

Let **entry edge** = the proximal edge the price must reach to fill (the *trigger/fill* side):
- **Bullish / demand OB (long setup):** entry edge = **top** of the block. Vacant = price **above** top.
  `offset = armPrice − topEdge`.
- **Bearish / supply OB (short setup):** entry edge = **bottom** of the block. Vacant = price **below** bottom.
  `offset = bottomEdge − armPrice`.

In both cases: **positive = price is on the pre-entry / away-from-block side (vacant), negative =
inside the block (occupied), zero = on the edge.** `pips = offset / pipSize`.

**Hard invariant (must hold):**
`ob_occupied_at_arm == (price_distance_from_ob_at_arm_pips <= 0)`
— the new field must be computed from the **same price snapshot** as the existing occupancy boolean,
so the sign and the boolean never disagree.

### Worked examples (pip size 0.0001)

| Setup | OB top / bottom | Price at arm | pips | pct | Meaning |
|---|---|---|---|---|---|
| Bull (long) | 1.1050 / 1.1040 (10p) | 1.1052 | **+2.0** | **+20%** | vacant 2 pips above top |
| Bull (long) | 1.1050 / 1.1040 | 1.1050 | **0.0** | **0%** | on the entry edge |
| Bull (long) | 1.1050 / 1.1040 | 1.1045 | **−5.0** | **−50%** | occupied, 5 pips inside |
| Bull (long) | 1.1050 / 1.1040 | 1.1038 | **−12.0** | **−120%** | beyond far edge (blown through) |
| Bear (short) | 1.1050 / 1.1040 | 1.1038 | **+2.0** | **+20%** | vacant 2 pips below bottom |
| Bear (short) | 1.1050 / 1.1040 | 1.1045 | **−5.0** | **−50%** | occupied, 5 pips inside |

---

## Edge Selection

Three candidate references:

- **Entry-side edge (RECOMMENDED, canonical).** The proximal edge that defines triggering/filling.
  *Pros:* it is the edge the strategy actually interacts with; "vacant" (left through the entry side)
  and "occupied" are defined relative to it; it makes the sign invariant against `ob_occupied_at_arm`
  trivially true; it matches the AAE concept (exit through the entry side). *Cons:* "beyond the far
  edge" maps to a large negative (price actually passed the block) — a documented edge case, not a
  problem for the research question.
- **Nearest edge.** *Pros:* always small magnitude. *Cons:* changes which edge is referenced
  depending on where price sits → sign/semantics become ambiguous (a deep-occupied price near the far
  edge would read as "close to an edge"); breaks the occupancy invariant. **Reject.**
- **Far edge.** *Pros:* measures penetration depth toward the opposite side. *Cons:* not the
  entry-relevant edge; redundant with existing `max_ob_penetration_*`. **Reject as the canonical.**

**Decision:** **entry-side edge is canonical.** Fix and document it in the exporter; do not make it
configurable per-export (that would make cross-run comparison meaningless). The far-edge depth is
already covered by `max_ob_penetration_pips` if needed.

---

## Calculation Timing

- **When:** at the **arm event** — the moment the limit order becomes live/eligible (the candle at
  `arm_candle_index`, time `armed_at`). Use the **same price snapshot** the backend already uses to
  evaluate `ob_occupied_at_arm` (e.g. the arm candle's open, or the prior candle's close — whichever
  the existing boolean uses). **Consistency with that snapshot is mandatory** (see the invariant).
- **Arm candle behavior:** one offset per trade, captured once, at arm. Not at trigger, not at fill.
- **Delayed-entry behavior:** the arm candle is `trigger_candle + delay`. The offset is measured at
  **that** candle, so a trade that takes 3 candles to arm is measured 3 candles after trigger.
- **TE C0 / C1 / C2 / C3 behavior:** each delay variant arms on a different candle
  (C0 = trigger candle / delay 0; C1 = +1; C2 = +2; C3 = +3) and is already exported as its **own**
  trade row / CSV, so each variant carries its **own** arm-offset measured at its own arm candle. No
  conflict, no shared value. (This is exactly what makes "Distance × C0–C3" researchable.)

---

## Export Contract

| Surface | Names |
|---|---|
| **CSV columns** | `price_distance_from_ob_at_arm_pips`, `price_distance_from_ob_at_arm_pct` |
| **JSON keys** | same snake_case |
| **camelCase aliases** (frontend importer reads both) | `priceDistanceFromObAtArmPips`, `priceDistanceFromObAtArmPct` |

- **Additive only.** Append the columns; do not reorder/rename existing ones. The frontend importer
  resolves fields by **name** (`pick(...)`), so column order is irrelevant.
- **Backward compatibility:** old bundles lack the columns → the frontend reads `null` (`numOrNull`)
  and **degrades gracefully** (the Distance/Occupation surface hides; fill-state taxonomy and all
  existing analytics are unchanged). No schema version bump required, no migration.
- **Null encoding:** empty cell / absent key → `null`. Do not emit `0` for "no arm" (0 means *on the
  edge*, a real value).

---

## Validation Requirements (backend, before release)

1. **Occupancy invariant:** for every armed trade, `ob_occupied_at_arm == (pips <= 0)`. (The single
   most important test — a failure means the snapshot/edge differ from the boolean's.)
2. **Direction correctness:** bull and bear worked examples above produce the listed signs.
3. **Pct identity:** `pct ≈ pips / ob_width_pips × 100` within float tolerance; `pct == null` when
   `ob_width_pips` is 0/missing.
4. **On-edge:** price exactly on the entry edge → `pips == 0`, `pct == 0`.
5. **Beyond far edge:** price past the far edge → `pips` negative with `|pips| > ob_width_pips`
   (not clamped).
6. **Null on no-arm:** baseline/non-TE, never-triggered, cancelled-before-arm → both fields `null`.
7. **Instrument scaling:** pip size applied correctly across instruments (e.g. JPY pairs).
8. **Per-variant timing:** C0–C3 of the same setup yield offsets measured at their own arm candles
   (not a shared value).

---

## Future Research Enabled (once the two fields exist)

- **Distance Band** — a new *orthogonal* frontend dimension (signed, symmetric, config-driven bands
  spanning Deep-Occupied → **Edge Zone (|offset| < ~2p)** → Deep-Vacant); **not** folded into the
  `fill_state` enum.
- **Occupation Depth** — the negative side of the same field; "does deeper occupation help or hurt?"
  is free once the field exists.
- **Distance × AAE** — does AAE only pay off beyond a minimum vacancy?
- **Distance × Session** — is the Outside-session danger partly a small-vacancy confound?
- **Distance × Entry Model (C0–C3)** — is the delay edge really a *distance* edge?
- **Distance × FFT** — relate to `fft_move_away_pips_at_cancel` (same displacement family).
- **Research Signals integration** — distance bands plug into the existing signals engine as another
  candidate dimension (zero engine change) → auto **"Edge-Zone danger"** flag, validated against F-004.

---

## Future Optional Metrics (evaluate — do NOT require for Phase 1)

These would deepen the research but are **not** needed for the core Distance/Occupation work. Listed
so the backtester team can weigh them while the arm-snapshot code is open:

- **Distance Persistence** — did the vacancy hold, or was it a one-bar spike? (needs the arm-window
  price path, not a single snapshot).
- **Time Vacant Before Fill** — candles/minutes price spent outside the entry edge before filling.
- **Time Occupied Before Arm** — how long price sat inside before the order armed.
- **Displacement Metrics Family** — unify `price_distance_from_ob_at_arm`, `fft_move_away_pips_at_cancel`,
  and `max_distance_away_before_fill_pips` under one normalized (pips **and** %-of-OB-width) treatment,
  even though they fire at different events (arm / cancel / pre-fill excursion).
- **Edge-Zone Research** — the |offset| < ~2p danger band is a *frontend banding* of the Phase-1 field;
  it needs **no** new export.

---

## Recommendation

**Phase 1 — minimal required export (ship this):**
1. `price_distance_from_ob_at_arm_pips` (signed, entry-edge reference).
2. `price_distance_from_ob_at_arm_pct` (signed, % of OB width).
3. Plus the **occupancy invariant** test (`ob_occupied_at_arm == (pips <= 0)`).

That is the **complete** dependency for the entire Distance / Occupation-Depth research family,
including Distance Band, Occupation Depth, the A–H crosses, and the Research-Signals Edge-Zone flag.
Everything else in *Future Optional Metrics* is genuinely optional and can follow later without
reworking Phase 1.

**Frontend follow-up (separate, already specced):** importer maps both fields (~2 lines), a
`deriveDistanceBand` dimension + registry/glossary + validation, and a gated Classification-tab
section — none of which blocks the backend.

---

*Generated: 2026-06-08 · Basis: DISTANCE-AT-ARM-RESEARCH-1 / -EXPORT-1 + research-architecture pass.*
*Handoff target: FX-OB-Backtester. Frontend remains unchanged until these fields ship.*
