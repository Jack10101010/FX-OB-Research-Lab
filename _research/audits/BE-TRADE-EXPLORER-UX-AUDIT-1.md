# BE Trade Explorer — UX + Research-Workflow Audit

*Read-only audit. No code, no edits, no commits. Files reviewed: `BeTradeExplorer.jsx`, `BreakevenTab.jsx` (wiring), `selectiveBeUniverse.js` (`buildBeTradeExplorerRows`, `deriveMaxArmReached`, `classifyBeAttributionRow`).*

---

## What's there today (ground truth)

- **Row data** carries far more than is shown: `originalR, deltaR, mfeR, maeR, maxArmReached, beApplied, beArmed, beTriggered, beExitReason, beExitR, classification, inCohort, selectiveApplied, beArmTime, beExitTime, fillTime, originalExitTime, obId, tradeId`.
- **9 classification categories** (`classifyBeAttributionRow`): `loss_saved`, `winner_cut`, `tp_kept`, `news_flat`, `same_loss`, `same_breakeven`, `other_same`, `other_changed`, `not_applied`.
- **Current columns (L→R):** BE Result · Session · Dir · Struct · Orig R · Δ R · MFE R · Max Arm · Armed · BE Hit · Trade · OB · View on Map.
- **Filters:** scope toggle (Current Cohort / All Trades) + a "Showing …" context strip + a result-class filter row (All / Loss Saved / Winner Cut / BE Hit / No BE Effect / Not Applied). Cohort dims themselves are set **in the cards above**, reflected read-only here.
- **Row click is a deliberate no-op**; only the **View on Map** chip navigates (`setFocusedBeTrade` → `/strategy-map`).
- **Footer reconciliation** (Visible / BE Applied / BE Hit / Saved / Cut / Δ Net R / ✓ matches summary) — a genuine strength; keep it.

---

## 1. Terminology clarity

| Surface term | Verdict | Recommendation |
|---|---|---|
| **Loss Saved** / **Winner Cut** | Clear, well-toned (green/red) | **Keep** — these are the headline research outcomes |
| **BE Hit** (column) vs the brief's "BE Triggered" | "BE Hit" is clearer than "Triggered" | **Keep "BE Hit"** — but it's **overloaded** (column + filter + footer stat + implied by the result chip) |
| **TP Hit** (code) vs brief's "TP Kept" | "TP Hit" is accurate but research-ambiguous | Prefer **"TP Kept"** — conveys *"BE was harmless; the winner kept its TP"*, the actual research point |
| **Armed** | Subtle vs "BE Hit"; relies on tooltip | Keep but **only as a detail** (see §4) — Armed-but-not-Hit is a niche state |
| **Same Loss / Same BE / News Flat / No BE Effect / Changed** | **Too granular** — 5 muted near-duplicates that don't scan | **Consolidate to "No Change"** chip; move the fine reason (news-flat, same-loss…) into the chip tooltip |
| **Not Applied** | Clear | **Keep** |

**Recommended canonical taxonomy (5 scannable buckets, fine reasons in tooltip):**
**Loss Saved** · **Winner Cut** · **TP Kept** · **No Change** · **Not Applied**. This matches the brief's intent and collapses the 9 internal categories without changing the data layer (the keys stay; only the *display mapping* groups them).

---

## 2 & 3. Column ordering + pinning

**Problem:** the impact column (**Δ R**) — the single most important number in BE research — sits 6th, behind three cohort-dimension columns. The result chip and its impact are visually separated.

**Recommended order (decision-first):**
1. **BE Result** *(pin left)*
2. **Δ R** *(pin left)* — impact, immediately beside the outcome
3. **Orig R** — the baseline the delta is against
4. **Max Arm** — "how far it ran" (the BE-relevant magnitude)
5. **Session · Dir · Struct** — cohort context (group together, mid-table)
6. **MFE R** — *(move right / optional)* raw version of Max Arm
7. **Armed · BE Hit** — *(move right / consolidate)* lifecycle detail
8. **Trade · OB** — IDs (already right)
9. **View on Map** — action (already right)

**Pin left:** **BE Result + Δ R** (the table is `overflow-x-auto`; pinning keeps the verdict + impact visible while scrolling context). Orig R is a candidate third pin.

---

## 4. Hide / move right

- **MFE R** — **redundant with Max Arm** (Max Arm *is* the bucketed MFE). For a trader, "Max Arm 2.5R" is more actionable than "MFE 2.73". **Move right or hide by default**, keep raw MFE in the row-detail/tooltip.
- **Armed** + **BE Hit** booleans — both are **implied by the result chip** (`loss_saved`/`winner_cut` ⇒ hit; `not_applied` ⇒ not armed). **Collapse to one "BE lifecycle" detail** (Armed → Hit → Exit reason) shown on row-expand/tooltip rather than two ✓/— columns.
- **OB / Trade IDs** — keep, but right (already are); they're cross-reference, not decision data.

---

## 5. Active-filter visibility

- The **"Showing …" context strip** (accent-bordered, e.g. *"Current Cohort · Long · CHoCH · 2.5R reached · 3R Wick"*) is **good** — it makes the active cohort legible inside the explorer.
- **Gap:** the cohort dims are controlled in the **cards above**, not here — a user scanning the table must scroll up to change them, and there are **three filter mechanisms in two places** (cohort cards · scope toggle · result-class row). The relationship "Current Cohort with no chips = All" is non-obvious (the strip helpfully says *"No cohort filters active"*, but the toggle still reads "Current Cohort").
- **Recommendation:** surface the active cohort chips **inline and clearable** in the "Showing" strip (click a chip to drop that dim), so the explorer is self-contained; and visually tie the scope toggle to the cards (e.g. "Cohort (set above)").

---

## 6. Row interaction

- **No overlap exists today** — row click is intentionally inert; View on Map is the sole action. So the stated concern ("do they overlap?") is **answered: no** — but the inert row is a **missed affordance** (users expect a click to *do* something).
- **Recommended model:** **row click → select + expand an inline detail** (full BE lifecycle: arm time, BE-exit time, exit reason, Orig/BE/Δ R, MFE/MAE, Max Arm). **View on Map stays the explicit navigation** (keep its `stopPropagation`). Clean split: *click = inspect here; chip = go to map*.

---

## 7. Research workflow

**Missing**
- **"Which arm level would have been optimal" per trade** — the core BE question. Max Arm shows how far it ran, but not the cross-tab "at 1R this winner is cut; at 2.5R it keeps TP." A **per-arm "net-R if BE here" mini-summary** (even just the existing arm levels with Δ Net R) would directly answer *"what arm should I run?"*.
- **MAE column** — `maeR` is computed but never shown. "How far against you before BE?" is decision-relevant (near-stop-outs).
- **Interactive sort** — sort is fixed (non-zero Δ, then Max Arm). Let users sort by Δ R / Orig R / Max Arm (the result chip is `sortable:false`).

**Redundant**
- MFE R vs Max Arm; Armed + BE Hit vs the result chip; "BE Hit" living in 3 places.

**Speed-ups**
- Pin BE Result + Δ R; consolidate to 5 result buckets; interactive sort; row-click detail; a small **Max-Arm distribution** strip (how many trades reached each arm) so the trader *sees where BE bites* before reading rows.

---

## 8. Future protection-layer compatibility (FFT, Pretrigger Cancel, Delayed Entry)

The **skeleton is reusable; the labels are not.** Layer-agnostic parts: one-row-per-trade, **Original → Protected → Δ R** (D-011 framing), cohort filter, context dims, View on Map, footer reconciliation. BE-specific parts: `Armed`/`BE Hit`/`Max Arm`, and the `loss_saved`/`winner_cut`/`tp_kept` taxonomy.

**Recommendation:** generalize toward a **Protection Trade Explorer** with a **layer adapter**:
- **Shared core:** Orig R · Δ R · outcome bucket · context dims · IDs · View on Map · footer Δ reconciliation.
- **Per-layer adapter supplies:** (a) the **outcome taxonomy** (BE: Loss Saved / Winner Cut / TP Kept / No Change; FFT: Cancelled-Saved / Cancelled-Cost / Kept; Delayed Entry: Filled-Later / Missed / Same), (b) **layer-specific lifecycle detail** (BE: Armed→Hit→Exit; FFT: first-failed-tag; Delay: arm offset), (c) optional **magnitude column** (BE: Max Arm; others: their own).
- Keep the result-class **filter list driven by the adapter's taxonomy**, not the hardcoded `SIMPLE_FILTERS`/`RESULT_META` BE constants.

This makes the explorer the standard surface for every protection layer with ~one adapter per layer, and it aligns with D-011's already-layer-agnostic "derived view, not a protection mode" stance.

---

## Recommendations by effort

**Quick wins (cosmetic, low risk)**
- Reorder columns: **BE Result · Δ R · Orig R · Max Arm · Session · Dir · Struct · …**; move **MFE R** right.
- Consolidate the 9 chips → **5 buckets** (Loss Saved / Winner Cut / TP Kept / No Change / Not Applied), fine reason in tooltip; rename "TP Hit" → **"TP Kept"**.
- Collapse **Armed + BE Hit** into the result-chip tooltip (or one lifecycle column).
- Make the **"Showing" cohort chips clickable-to-clear**.

**Medium improvements (interaction/data already present)**
- **Pin** BE Result + Δ R; enable **interactive column sort**.
- **Row click → inline detail drawer** (lifecycle + MAE + Max Arm), View on Map unchanged.
- Add a **MAE column** (data exists) and a small **Max-Arm distribution** strip.

**Future-proofing (architecture)**
- Refactor to a **layer-adapter** model (shared core table + per-layer taxonomy/lifecycle/magnitude) so FFT / Pretrigger Cancel / Delayed Entry reuse the same explorer.
- Parameterize the result-filter list and chip metadata from the adapter, not BE-hardcoded constants.

*No implementation performed. The data layer already supports every "quick win" and most "medium" items (MAE, sort fields, lifecycle times are all present in `buildBeTradeExplorerRows` output) — these are presentation/interaction changes, not new computation.*
