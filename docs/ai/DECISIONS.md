# DECISIONS.md — decision log

Append-only. Newest at top. Each entry: what we decided, why, and the consequence.

> **DECISIONS vs FINDINGS:** this file records **build/design choices** (how we build).
> Validated **research conclusions** (what the data says) live in `FINDINGS.md`. Decisions cite
> findings — e.g. D-003 is the *decision* to lead with Vacant, justified by F-001/F-002.

*Last updated: 2026-06-11.*

---

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
