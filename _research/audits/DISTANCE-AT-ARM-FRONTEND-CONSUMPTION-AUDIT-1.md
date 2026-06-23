# Distance-at-Arm — Frontend Consumption Audit

*Read-only. No code/stage/commit. Verified backend reality in Lux-OB-Backtester + frontend importer/analytics + FINDINGS. The big finding: the field is real and unblocked, but **its actual semantics and distribution break the proposed bucket plan** — read §4 before implementing.*

---

## 1. Backend / export reality

- **`price_distance_from_ob_at_arm_pips` is exported** — present in **128 of 169** output CSVs.
- **`_pct` does NOT exist** — confirmed absent from every output CSV. (So the backlog's "+ % of OB width" half is still backend-pending.)
- **It is TRIGGERED-EDGE-ONLY.** Baseline files = all blank; penetration files = **no column at all**. It's only populated on triggered-edge rows (it measures distance *at arm*, and only triggered-edge has an arm step). Non-TE / never-triggered rows are blank by design (`execution.py` blanks them).
- **It is unsigned MAGNITUDE, and `0 = occupied/inside the OB`** — confirmed in `execution.py` L805–816:
  ```
  if   c_close > ob_top:    dist = c_close - ob_top      # vacated above
  elif c_close < ob_bottom: dist = ob_bottom - c_close   # vacated below
  else:                     dist = 0.0                   # still INSIDE the OB
  price_distance_from_ob_at_arm_pips = round(dist / pip_size, 1)
  ```
  So it captures **vacancy distance** only — it collapses *all* occupied/at-edge cases to **0** and is never negative. **It does NOT measure occupation depth** (the backlog's hoped-for signed +/- metric).
- **Distribution (active-run source, `…triggered_edge_25p0_next`, 99 rows):** 81 populated / 18 blank. **66 of 81 are exactly 0**, 0 negative, 15 positive, max 11.7. abs-buckets: **<2 = 75, 2–5 = 4, 5–10 = 1, 10+ = 1.**

---

## 2. Frontend importer audit

- **`price_distance_from_ob_at_arm_pips` is NOT mapped** in `importer.js` — confirmed (the open work).
- **Sibling distance fields ARE mapped**, establishing the convention: `max_distance_away_before_fill_*` (snake-only), `close_breach_distance_*` (snake-only), `retrace_cancel_distance_pips` (**dual-keyed** snake + camel). The `post_stop_*` and classification fields are dual-keyed.
- **Smallest required mapping (2 lines, dual-keyed for consistency):**
  ```js
  priceDistanceFromObAtArmPips:    numOrNull(pick(r, "price_distance_from_ob_at_arm_pips", "priceDistanceFromObAtArmPips")),
  price_distance_from_ob_at_arm_pips: numOrNull(pick(r, "price_distance_from_ob_at_arm_pips", "priceDistanceFromObAtArmPips")),
  ```
  **Recommended field names:** camelCase `priceDistanceFromObAtArmPips` (primary, app convention) **+** preserved snake_case `price_distance_from_ob_at_arm_pips` (matches the `post_stop_*` dual-key style so consumers can use either). `numOrNull` → blanks become `null` (so "Unknown" is cleanly detectable).

---

## 3. Where it should feed first (analytics surfaces)

This is an **at-arm vacancy** measure tied to fill-state (`ob_occupied_at_arm` is literally its sign), and **F-004 is an expectancy-by-distance finding** — so it belongs in **Classification / Distance research**, not loss-diagnostics.

| Surface | Fit | Verdict |
|---|---|---|
| **Classification Tab — Distance breakdown** (ROADMAP **Phase 3**) | Direct: expectancy by distance bucket; validates F-004; sits next to fill-state | **First target** |
| **Research Signals** | Strong: register distance as another candidate dimension → auto "edge-zone danger" flag, zero engine change | **Second** (cheap, high value) |
| **Failures Lab / false-loser cross-cut** | Secondary: "do recovered (false-loser) losses cluster at low distance?" — a *cross-tab*, not the primary home | Follow-on |
| Protection Lab / Strategy Map | No natural fit now | Skip |
| Shared helpers (`fillStateBreakdown.js`) | The breakdown helper should live here or a sibling `distanceBreakdown.js` | Implementation detail |

> ⚠ The task suggested **Failures Lab** as the first use. I'd push back: F-004 is an *expectancy* finding, and ROADMAP **Phase 3** already places "Distance breakdown (0–2 / 2–5 / 5–10 / 10+)" in Classification. Validate F-004 there first; the false-loser cross-cut is a great *second* use once the dimension exists.

---

## 4. First use case + bucket recommendation (⚠ proposed buckets are wrong for this data)

**The proposed `<2 / 2–5 / 5–10 / 10+` buckets do not discriminate** — ~92% of populated values land in `<2`, and 66/81 are *exactly 0* (occupied). A 4-bucket breakdown would be one giant bucket + three near-empty ones.

The real signal is **occupied (0) vs vacant (>0), and how far vacant**. Recommended buckets (research-aligned + distribution-aware):

| Bucket | Meaning | ~share (per run) |
|---|---|---|
| **Occupied / at edge (= 0 pips)** | price still inside the OB at arm — `occupied_at_arm` | dominant (~66/81) |
| **Edge zone (0 < d < 2)** | just vacated; F-004's "too close / weak" band | small |
| **2–5 pips** | clearly vacant | ~4 |
| **5+ pips** | deep vacant (collapse 5–10 + 10+; tail is ~2 trades) | tiny |
| **Unknown** | blank — non-TE / never-triggered | ~18% |

This directly tests **F-004**: compare expectancy of `0/edge` (should be ≈ the weak Occupied baseline, ~+0.08R per F-001) vs `2–5` / `5+` (vacant → should be stronger, toward the ~+0.89R Vacant edge per F-001). Keep the explicit `0` bucket — collapsing it into `<2` would hide the occupied↔vacant boundary that *is* the finding.

---

## 5. Does it support F-004?

- **F-004 exists** in FINDINGS.md, **Status: Provisional**, and it literally says *"`price_distance_from_ob_at_arm_pips` is not yet mapped in importer.js, so the frontend cannot yet reproduce this."*
- **This work is exactly what moves F-004 from Provisional → Validated (or challenges it).** Mapping the field + the distance breakdown lets the app reproduce the backend claim that "<2 pips at arm is weak/negative."
- **Do NOT promote F-004 yet.** The implementation *enables* validation; the finding is only upgraded *after* the in-app breakdown shows the expectancy gradient on real data (and per low-sample caveats below). No new finding without evidence.
- **Correction to the backlog's research framing:** the hoped-for **signed occupation-depth** metric (− = occupied deeper) **does not exist** — this field is magnitude-only with occupied collapsed to 0. The "Occupation-Depth angle" (P2) remains backend-blocked on a *new signed field*; only the **vacancy-distance** half is unblocked here.

---

## 6. Files likely affected

- `frontend/src/data/importer.js` — the 2-line map (only required change).
- `frontend/src/data/distanceBreakdown.js` (new) **or** extend `fillStateBreakdown.js` — pure `buildDistanceBreakdown(trades, buckets)` helper.
- `frontend/src/data/__validation__/distanceBreakdown.validate.mjs` (new) — bucketing + expectancy + unknown/blank handling + low-sample.
- Classification tab in `pages/RunDetail.jsx` — a Distance-at-arm breakdown section (gated on TE availability).
- `frontend/src/data/researchGlossary.js` — glossary keys (distance band, edge zone).
- *(Second pass)* Research Signals dimension registration; *(follow-on)* a Failures false-loser × distance cross-cut.

---

## 7. Validation plan

- **Importer:** unit-confirm `priceDistanceFromObAtArmPips` maps (number, blank→null, dual-key).
- **Helper:** `distanceBreakdown.validate.mjs` — synthetic trades across `0 / edge / 2–5 / 5+ / blank`; assert correct bucketing (esp. `0 → Occupied`, `blank → Unknown`), expectancy/WR per bucket, low-sample flag under threshold.
- **Manual:** import a **triggered-edge** run → Classification distance section renders; confirm `0`-bucket expectancy ≈ Occupied baseline and the vacant buckets trend stronger (F-004 check); confirm a **baseline/penetration** run shows the section as Unknown/unavailable (gating).
- Re-run existing suites untouched (no data-layer changes elsewhere).

---

## 8. Implementation risk

1. **Low-N vacant tail (main risk).** Only ~15 vacant trades per run; the 2–5 / 5+ buckets are thin → noisy per-run. Needs low-sample suppression (Research Signals already uses `decided ≥ 10`) and is far more reliable on **full-history runs** than a single 99-trade run. The breakdown should label thin buckets, not assert edges from n=1.
2. **Triggered-edge-only availability.** Field is blank for baseline/penetration → the section must gate on availability (reuse the existing field-gating/`FIELD_DEPS` pattern), or it will look "broken" on non-TE runs.
3. **Semantic trap.** `0 = occupied`, not "missing", and there's **no occupation-depth/sign**. Don't build UI implying a signed scale; don't conflate with the (nonexistent) signed metric.
4. **Finding discipline.** F-004 stays Provisional until the in-app gradient is observed with adequate n.

Overall risk: **Low for the import+breakdown mechanics; Medium for drawing a *conclusion*** (sample size). Ship the surface; gate the finding.

---

## 9. Exact next implementation prompt

> **DISTANCE-AT-ARM-IMPORTER-AND-BREAKDOWN**
> Scope: frontend only. Do not touch backend, BE, Master Controls, or unrelated files.
> 1. **Importer:** in `frontend/src/data/importer.js`, map `price_distance_from_ob_at_arm_pips` dual-keyed
>    (`priceDistanceFromObAtArmPips` + snake) via `numOrNull(pick(...))`; blanks → null. No other importer changes.
> 2. **Helper:** add `buildDistanceBreakdown(trades, { buckets })` (new `distanceBreakdown.js` or extend
>    `fillStateBreakdown.js`) producing per-bucket count / WR / avgR / netR, with buckets
>    **Occupied(0) · Edge(0–2) · 2–5 · 5+ · Unknown(null)** and a low-sample flag (decided < 10). Pure, no React.
> 3. **Validation:** `distanceBreakdown.validate.mjs` covering bucketing (esp. 0→Occupied, null→Unknown),
>    expectancy aggregation, low-sample, empty-input safety.
> 4. **UI:** a Distance-at-arm breakdown section in the Classification tab, **gated on availability**
>    (TE-only; show Unknown/unavailable for non-TE). Glossary keys for the bands.
> 5. **Do NOT** promote F-004; this enables validation only. **Do NOT** imply a signed/occupation-depth scale —
>    `0 = occupied`, magnitude-only, `_pct` does not exist.
> Validate: importer + new helper validation, JSX parse, plus a live check on a TE run (0-bucket ≈ Occupied
> baseline; vacant buckets trend stronger) and a non-TE run (section gated).

*Bottom line: the field is real and one importer line from consumable — but it's triggered-edge-only, magnitude-only with `0 = occupied`, and ~92% clusters in `<2`. Bucket on `0 / edge / 2–5 / 5+ / Unknown` (not the proposed scale), surface it in the Classification Distance breakdown to validate F-004, and gate the *finding* on sample size.*
