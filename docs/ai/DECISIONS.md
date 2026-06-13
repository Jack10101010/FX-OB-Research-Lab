# DECISIONS.md — decision log

Append-only. Newest at top. Each entry: what we decided, why, and the consequence.

> **DECISIONS vs FINDINGS:** this file records **build/design choices** (how we build).
> Validated **research conclusions** (what the data says) live in `FINDINGS.md`. Decisions cite
> findings — e.g. D-003 is the *decision* to lead with Vacant, justified by F-001/F-002.

*Last updated: 2026-06-13.*

---

### D-015 · Research Cockpit is a read-only command centre that selects over existing analytics
A new page at **`/cockpit`** (distinct from `/insights`, which is the saved-findings library) sits
**above** the labs and surfaces ranked insight cards. It is a **pure selector/ranker/templater over
already-computed analytics outputs** — it computes **no new metric**, defines **no new threshold**
(it mirrors `TRIAGE_LOW_SAMPLE_N` / `EXPLORER_LIFT_HIGHLIGHT`), runs **no backend/replay/sweep**, and
**persists nothing**. **Phase 1** (`b500e36`) ships static cards; **V2.0A** (`fe71537`) adds category
sections (Sessions/Timing · Direction · Structure · Loss Clusters) + a cross-category **Action Queue** +
an "Other signals" catch-all that preserves Phase-1 cards. Engine = `data/runInsights.js`
(`buildRunInsights` flat list + pure view fns `buildActionQueue` / `groupByTopic`); page consumes
existing pure helpers (`researchSignals`, `lossTriage`, `buildSessionBreakdown`, `buildLoserRunUp`,
`buildExplorer`, `distanceBreakdown`). **Why:** give the user a top-level "what's working / hurting /
to-investigate" surface without forking analytics or converting exploratory labs into a fixed report —
source links route into the owning lab, the lab keeps the interactivity. **Lift correction:**
loss-cluster lift cards must use **`buildExplorer`** (or full-universe context), **not** the
baseline-less loser-only `buildFailureDrivers`/`buildPairDrivers`, which return `lift=1` for every cell
and left the Phase-1 lift card dormant. **Consequence:** the cockpit is an **additive frontend layer**,
**safe relative to the candle-data / BE-matrix restructure** (it reads post-normalization frontend
helpers, never `backend/`, the exporter, the BE cube, the candle pipeline, lab internals, `/insights`,
or the store). Deferred (separate phases, see BACKLOG): BE/FFT/TP/Entry/OB sections, the 2-D cluster
map (V2.1), deep-link plumbing + Save-Findings reuse (V2.2), and backend-dependent RR-sweep / BE-cube /
cross-run work (V3, after restructure parity). **Evidence:** `b500e36`, `fe71537`; design refs
`RUN-INSIGHTS-COCKPIT-DESIGN-AUDIT-1.md`, `RESEARCH-COCKPIT-V2-INSIGHT-CATEGORIES-AUDIT-1.md`.

### D-014 · Distance-at-arm is a signed magnitude with an explicit Edge Zone, surfaced TE-only
The frontend consumes `price_distance_from_ob_at_arm_pips` as a **signed** value: **0 = price still
inside the OB at arm (occupied)**, positive = vacated by N pips. The breakdown buckets are
occupied (0) / edge / 2–5 / 5–10 / 10+ pips with the **edge zone** (|offset| < ~2 pips) explicit, and
the section is **gated to triggered-edge runs only** (baseline / penetration carry no arm-distance).
No `%`-of-OB-width field is consumed (not exported). **Why:** the basic distance breakdown is the
cheapest way to put F-004 (distance < 2 pips weak/negative) in front of users without inventing a new
dimension. **Consequence:** this **enables in-app F-004 validation but does not promote it** — F-004
remains provisional until confirmed on a run; the deeper signed `distance_band` / occupation-depth
dimension stays a separate research item (`BACKLOG.md` P2). **Evidence:** `449dc58`.

### D-013 · Triggered-edge entry universe = a threshold SET plus arm delays C0–C6
Trigger thresholds are serialized as a **sorted, deduped set** built from preset chips (10/25/50/75)
plus a custom value, with a **single-value back-compat** path (legacy `singleTriggeredEdgeThreshold`
→ `[v]`); values are cleaned to numeric `> 0` and `< 100`, empty → default `[25]`. Arm delays expand
from C0–C3 to **C0–C6** (`tradeUniverse` fill-order gains d5/d6). The expansion does **not** force
`be_variants: "all"`. **Why:** widen the entry research grid (more thresholds × more arm levels) without
breaking saved configs or silently inflating BE passes. **Consequence:** config schema gains
`singleTriggeredEdgeThresholds` (array) alongside the single value for the custom-input buffer; round-trip
on run load restores the set; pairs with the backend C0–C6 candle-delay change. Validated by
`beConfigSerialization` (+6 TE cases). **Evidence:** `6a69ab4`.

### D-012 · Research state uses a durable backend mirror with localStorage as the instant cache
Research domains now mirror to a durable backend via `/storage/{domain}` GET/PUT (domains:
**playbook, section roadmaps, configs/presets, hypotheses, promotion**). **localStorage stays the
instant UI cache**; the backend is **optional** — if it's down, behavior is localStorage-only and
unchanged. On boot each domain **merges** local + remote with domain-specific rules (union of
checked/`true` flags, or newer-`updatedAt`/`addedAt`/`_savedAt`-wins on a key conflict).
**Why:** make per-run research state (playbook progress, roadmap overrides, saved configs,
hypotheses, promotions) survive a browser/profile change without giving up instant local UX.
**Consequence:** no persisted-key or identifier renames; failures degrade to local-only. **Evidence:** `ccb240e`.

### D-011 · Selective BE and BE Trade Explorer are derived research views, not new protection modes
**Selective BE** applies break-even to a **filtered cohort** of trades (the rest stay as originally
traded) and surfaces it under an **Original → Selective → Difference** framing, with **Global BE as a
fixed reference**. The **BE Trade Explorer** gives a one-row-per-trade drilldown across original vs
BE result. **Why:** answer "what would applying BE to *this cohort* do to the full run?" as exploratory
research without inventing a protection mode. **Consequence:** these are **derived views** — they do
**not** change BE calculations, replay logic, protection-layer architecture, or the base trade universe.
**Evidence:** `a6b1c09`.

### D-010 · Phase 14 Wave 1 — research run terminology
Display-only terminology alignment with the Phase 14 conceptual model. **Decided renames:**
Active Run → **Run**; Result View → **Model** (when used as the dimension label); Current Result
View → **Current View** (panel/header); Result View → **View** (when used as the umbrella/grouping);
Position Variant → **Position Mode**. **View** is the umbrella over **Model + Position Mode**.
**Why:** after D-009 made Preview singular, this reduces run/model terminology friction and aligns
the UI vocabulary with the Phase 14 model (Run · View · Preview · Comparison · Project), while keeping
all data identifiers unchanged. **Scope:** display strings only — no persisted-key changes, no internal
identifier changes (`resultView` / `positionVariant` / `scenario` / `BASELINE_VIEW` untouched), no
ScenarioSelector change, no Baseline rename. **Evidence:** commit `e9d03aa`; live smoke test PASS
(TopBar Run/No Run; banners Current View / View / Model / Position Mode; TradeUniverseBadge Model /
Position Mode; Playbook "Confirm the Model" / "Confirm the Position Mode" with saved state intact,
proving step IDs unchanged). **Consequence:** Phase 14 is NOT complete — this is Wave 1 only.
**Deferred to Wave 2:** Strategy Map ScenarioSelector "VARIANT" badge; `ProtectionLab.jsx` "selected
Result View" sentence; the "Baseline" overload; Scenario naming / making **View** a grouped control.

### D-009 · Phase 13 — one composer-driven preview (five lenses collapsed)
Master Controls' five parallel preview paths (cost / filter / FFT / RR + the composed lens) are replaced
by a single path: `composePreviewBundle` is the sole preview builder, driven by ONE preview state machine,
ONE Apply path, and ONE drawer preview card. The four single-kind build effects / signatures / suppress
refs / apply callbacks / sync effects were removed; the composer build effect now serves any instant
dirty-set (1–4 stage kinds) by dropping the former "≥2 kinds" gate. One additive metadata field
(`stages.filter.filters`) preserves the filter-detail readout, and a parity validator
(`components/masterControls/__validation__/previewComposer.parity.mjs`, 25/25) guards the
composer→drawer contract.
**Why:** the four single-kind lenses duplicated orchestration around the *same* transforms; the read side
was already unified through `previewLens`, so only the build/state/UI layer needed consolidating.
**Consequence:** `previewLens` remains the single app-wide read overlay and the transform math is
unchanged; future preview work extends one engine, not five. Verified in the live app
(cost / filter / RR / FFT-unavailable / multi-stage / run-switch / apply-exit / cross-page).
Phase 14 (run-concept naming) and TradingView Mode remain **open** — not addressed here.
(Scoped commit pending on host.)

### D-008 · Confidence = sample + stability; effect-SE deferred
Confidence (Very Low/Low/Medium/High) is computed from sample size + win-rate Wilson interval
now, with an optional `rStdErr` hook for a true effect-SE test later (needs `sumR2`).
**Why:** current accumulators carry count/wins/losses but not R variance; ship useful confidence
now, upgrade rigor later. **Consequence:** confidence is a heuristic, not a p-value, until `sumR2`.

### D-007 · Research Signals rank by `|effect| × confidence`, suppress low sample
Auto-surfaced signals rank by `|avgR| × levelWeight` and require `decided ≥ 10`.
**Why:** prevents a +3R/n=2 fluke from outranking a +0.89R/n=200 finding. **Consequence:** low-n
findings are hidden from the Signals panel (still visible in tables).

### D-006 · Fill State replaces Entry Context in the tab
Since `deriveEntryContext` now returns the single fill-state leaf, the Entry Context breakdown is
redundant. Removed it from the Classification tab; the `entry_context` field + badges remain.
**Consequence:** one canonical fill-state view; no duplicate tables.

### D-005 · Badge suppression via `muteAsBadge`, not hardcoded `"clean"`
Default/non-signal states (`occupied_at_arm`, `unknown_at_arm`, legacy `clean`) carry
`muteAsBadge`; `ClassificationBadge` and all consumers filter on the flag.
**Why:** removes scattered `t !== "clean"` literals; one source of truth. 

### D-004 · Rename `ob_not_occupied → vacant_no_aae` with aliases
The old "OB Not Occupied" label described the *parent* but the derivation produced the *non-AAE
leaf*. Renamed to `vacant_no_aae`; added `getTagMeta` aliases (`ob_not_occupied`, `clean`) for
back-compat. **Consequence:** old bundles/filters still resolve.

### D-003 · Lead the UI with OB Vacant At Arm; AAE is a child
Decision to make Vacant the headline fill-state signal and present AAE / Vacant-No-AAE as its
children. **Justified by research:** see `FINDINGS.md` F-001 (Vacant primary) + F-002 (AAE child)
— Vacant ≈ +0.89R > AAE ≈ +0.59R > Occupied ≈ +0.08R; Vacant = AAE + Vacant-No-AAE.
**Consequence:** UI leads with Vacant; AAE demoted from headline to child.

### D-002 · Three sources of truth: registry / glossary / derivation
`classificationRegistry.js` = presentation (label/tone/flags); `researchGlossary.js` = meaning;
`tradeClassificationDims.js` = logic. UI never hardcodes labels or definitions.

### D-001 · `obOccupiedAtArm` authoritative for fill-state parent
`deriveFillState`: `obOccupiedAtArm === false` → Vacant (parent); `armedAfterObExit` only
subdivides Vacant into AAE vs Vacant-No-AAE; `null` → Unknown (uninstrumented, not "clean").
**Consequence:** children always sum to the parent; no double counting.
