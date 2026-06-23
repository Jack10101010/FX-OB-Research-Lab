# CLASSIFICATION-TAB-V2 — AUDIT / IMPLEMENTATION PLAN
**Repo: FX-OB-Research-Lab**
**Mode: AUDIT / IMPLEMENTATION PLAN ONLY — no code, no commits, no build**
**Basis: Trade Classification Phase 2 foundation (2A/2B/2C) complete.**

> Research findings driving this design:
> - Occupied At Arm ≈ +0.08R (weak baseline)
> - **OB Vacant At Arm ≈ +0.89R — the PRIMARY signal**
> - AAE ≈ +0.59R (a child of Vacant, NOT the primary signal)
> - Outside Session ≈ -1.0R (danger)
> - Distance < 2 pips ≈ weak edge (field not imported — out of scope)

---

## Files read (current, post-2B/2C state)

`RunDetail.jsx` (classification panel 2858–2929, memos 855–875, `buildClassificationBreakdown`
4637–4701), `researchGlossary.js`, `classificationRegistry.js`, `tradeClassificationDims.js`,
`ClassificationBadge.jsx`, plus `MetricChip.jsx` and `importer.js` (distance gap).

### Grounding facts
- `deriveEntryContext()` now returns the single canonical fill-state leaf, so **`entry_context`
  IS the fill-state leaf** → the existing "Entry Context" breakdown table is redundant.
- `MetricChip.jsx` exists and is the canonical KPI card (`label, value, sub, tone, size, onClick,
  selected`); label renders as a node, so it can host a tooltip without modifying the component.
- **`TermTip` does NOT exist.** It must be built over the Radix primitive at
  `frontend/src/components/ui/tooltip.jsx` (`Tooltip / TooltipTrigger / TooltipContent /
  TooltipProvider`).
- `researchGlossary.js` already contains every key V2 needs: `occupied_at_arm`, `vacant_at_arm`,
  `aae`, `vacant_no_aae`, `unknown_at_arm`, `stat_n/stat_wr/stat_net_r/stat_avg_r`, and
  `session_new_york/london/london_lull/asia/outside`. **No glossary edit required.**
- `priceDistanceFromObAtArmPips` is still NOT mapped in `importer.js` → distance breakdown remains
  blocked and is correctly excluded from V2.

---

## Answers to the 8 determinations

### 1. Minimal files
- **NEW** `frontend/src/components/lab/TermTip.jsx` — glossary tooltip wrapper over the Radix primitive.
- **NEW** `frontend/src/data/fillStateBreakdown.js` — pure aggregators: `buildFillStateBreakdown`,
  `buildSessionBreakdown`, `buildSignalCards`.
- **NEW** `frontend/src/data/__validation__/fillStateBreakdown.validate.mjs` — assertions (same
  convention as `fillState.validate.mjs`).
- **EDIT** `frontend/src/pages/RunDetail.jsx` — 3 memos + replace the Classification panel body.
- **No edits** to `classificationRegistry.js`, `researchGlossary.js`, `tradeClassificationDims.js`,
  `ClassificationBadge.jsx`, or `MetricChip.jsx`.

### 2. Exact UI structure
One `NeonPanel` "Classification Performance", wrapped once in `<TooltipProvider delayDuration={200}>`,
four stacked sections:

```
┌──────────────────────────────────────────────────────────────┐
│ CLASSIFICATION PERFORMANCE                                    │
├──────────────────────────────────────────────────────────────┤
│ SIGNAL CARDS   (MetricChip compact, grid-cols-2 md:grid-cols-4)│
│ ┌────────────┐┌────────────┐┌────────────┐┌────────────┐      │
│ │ OB Vacant  ││    AAE      ││ Occupied   ││ ⚠ Outside  │      │
│ │ +0.89R     ││  +0.59R     ││  +0.08R    ││  -1.0R     │      │
│ │ WR·n·NetR  ││  WR·n·NetR  ││  WR·n·NetR ││  WR·n·NetR │      │
│ │ success    ││  warning    ││  muted     ││  danger    │      │
│ └────────────┘└────────────┘└────────────┘└────────────┘      │
├──────────────────────────────────────────────────────────────┤
│ FILL STATE BREAKDOWN        Tag   Trades  WR   Net R  Avg R   │
│   Occupied At Arm           ...                  (muted)      │
│   OB Vacant At Arm          ...           (PARENT, highlighted)│
│     ├─ AAE                  ...           (indented)          │
│     └─ Vacant — No AAE      ...           (indented)          │
│   Unknown At Arm            footnote: "uninstrumented · n=…"  │
├──────────────────────────────────────────────────────────────┤
│ SESSION BREAKDOWN           Session Trades WR Net R Avg R     │
│   New York / London / London Lull / Asia / Outside(danger)   │
├──────────────────────────────────────────────────────────────┤
│ ENTRY MODEL BREAKDOWN  (existing table, classificationBreakdown│
│   te_same / te_next / te_d2 / te_d3 / baseline / ep_* )       │
└──────────────────────────────────────────────────────────────┘
```

- Tables reuse the existing grid `gridTemplateColumns: "minmax(96px,auto) repeat(4,minmax(52px,1fr))"`.
- Signal cards: face = **Avg R**; sub = `WR · n · Net R`. Each card label wrapped in `TermTip`.

### 3. Glossary tooltip wiring
Build `TermTip({ termKey, children })`:
- Looks up `getGlossary(termKey)`.
- Renders `TooltipTrigger` (children, or a small `ⓘ` when no children) + a multi-line
  `TooltipContent`: friendlyName (bold) / definition / "Why it matters:" (muted-italic).
- If `getGlossary` returns null → render children plain (no tooltip), never crash.
- Content class `max-w-xs whitespace-normal leading-snug` so the three blocks wrap.
Wire it on: section headers, column headers (`stat_n`, `stat_wr`, `stat_net_r`, `stat_avg_r`),
every fill-state row label, every signal-card label, every session row (`session_*`), and the
entry-model rows. Exactly one `TooltipProvider` at the panel root. Card labels passed as nodes
(`label={<TermTip termKey="vacant_at_arm">OB Vacant At Arm</TermTip>}`) so `MetricChip` is untouched.

### 4. Fill State vs Entry Context — REPLACE
Since `deriveEntryContext` now returns the single fill-state leaf, the "Entry Context" breakdown is
the same data minus the parent rollup and the occupied baseline. **Remove the Entry Context table
from the tab; the Fill State Breakdown supersedes it.** The `entry_context` field and its badges
(ledger, StrategyMap, TradeInspector) remain untouched — only the tab's redundant table is removed.

### 5. Parent/child structure — the indented tree, extended
```
Occupied At Arm            (baseline, muted)
OB Vacant At Arm           (PRIMARY — parent row, highlighted)
   ├─ AAE                  (child, indented)
   └─ Vacant — No AAE      (child, indented)
Unknown At Arm             (de-emphasized footnote: "uninstrumented · n=…")
```
Parent is the headline (primary signal ≈ +0.89R); children sum into it; Occupied is the comparison
baseline; Unknown is shown small and excluded from "signal" emphasis.

### 6. Exact metrics per section (identical four everywhere)
Reuse the definitions already in `buildClassificationBreakdown`:
- **Trades** = count.
- **WR** = wins / (wins + losses) — breakevens excluded from the denominator.
- **Net R** = Σ r.
- **Avg R** = Σ r / count — breakevens included in the denominator.
Signal cards show Avg R on the face; the other three in the sub-line.

### 7. Prevent double counting
- Leaves are mutually exclusive (one `fill_state` per trade) → no double count.
- Compute the **parent `vacant_at_arm` by summing its two child accumulators**, never by bucketing a
  trade into both the parent and a leaf in the same pass.
- Session and Entry Model are single-valued per trade → no intra-section double count.
- The same trade legitimately appears across Fill State + Session + Entry Model (different
  dimensions) — never sum across sections.
- Signal cards read the **same** aggregation objects, not an independent recompute.

### 8. Terminology consistency
- Labels always from `getTagMeta(key).label` (registry); tooltip text always from `getGlossary(key)`
  (glossary). Never hardcode display strings.
- Canonical keys (`occupied_at_arm`, `vacant_at_arm`, `aae`, `vacant_no_aae`, `unknown_at_arm`,
  `session_*`, `stat_*`) are the single vocabulary across cards, tables, badges, tooltips.
- Add one `SESSION_KEY` map (session display label → `session_*` glossary key) so session rows
  tooltip consistently.

---

## File-by-file implementation plan

### `frontend/src/data/fillStateBreakdown.js` (NEW — pure, no React)
- `buildFillStateBreakdown(trades)` → `{ occupied, vacant, aae, vacant_no_aae, unknown,
  hasInstrumentation }`, where `vacant` (parent) = sum of `aae` + `vacant_no_aae` accumulators.
- `buildSessionBreakdown(trades)` → ordered rows keyed by session (NY, London, London Lull, Asia,
  Outside, Unknown).
- `buildSignalCards(fillState, session)` → the 4 card payloads (label key, avgR, wr, n, netR, tone).
- Shared `{count, wins, losses, sumR}` accumulator + one `toStats()` producing `{count, winRate,
  netR, avgR}`. Reuse `isPerformanceTrade` / win-loss semantics consistent with
  `buildClassificationBreakdown`.

### `frontend/src/components/lab/TermTip.jsx` (NEW)
Radix wrapper as described in #3.

### `frontend/src/data/__validation__/fillStateBreakdown.validate.mjs` (NEW)
Assert: children sum to parent (`aae + vacant_no_aae === vacant`), leaf mutual exclusivity, session
bucketing + ordering, card values match the aggregation, `hasInstrumentation` false on all-null runs.

### `frontend/src/pages/RunDetail.jsx` (EDIT)
- Add `fillStateBreakdown`, `sessionBreakdown`, `signalCards` memos beside `classificationBreakdown`
  (all keyed on `displayTrades`).
- Replace the Classification panel body: Signal Cards → Fill State → Session → Entry Model.
- Delete the Entry Context table block.
- Wrap the panel in `<TooltipProvider>`.
- Keep `buildClassificationBreakdown` for the Entry Model table.

### `frontend/src/components/lab/MetricChip.jsx`
**No change** — pass node labels.

---

## Risks
- **Session "Outside" availability** — `displaySession` returns the raw session field; it does NOT
  derive "Outside" from fill hour. If the backend doesn't label "Outside," the Outside row/card is
  empty. Mitigation: reuse SessionLab's `SESSION_DEFINITIONS` / hour-derivation, or confirm the
  export, before building the session section.
- **Parent double-count** — the single most likely bug; enforce "sum children, don't re-bucket."
- **Unknown-dominant runs** — old / baseline runs are almost entirely `unknown_at_arm`; cards must
  not imply a signal where there is no instrumentation (`hasInstrumentation` guard → "no fill-state
  data" empty state).
- **TermTip a11y / provider** — exactly one `TooltipProvider`; trigger focusable; content
  `max-w-xs whitespace-normal`.
- **`displayTrades` consistency** — cards and all tables must read the same filtered source so the
  entry-model filter chips recompute every section coherently.
- **Small n** — rows/cards with n < ~10 are noisy; consider a subtle low-n indicator (optional).

---

## Migration concerns
- Removing the Entry Context table is presentation-only (no data loss; `entry_context` field/badges
  untouched). Record it in PROJECT_STATUS.
- Zero registry/derivation/glossary churn → no cross-workstream risk; only `RunDetail.jsx` (a Trade
  Classification–owned file) plus two new files. `RunDetail.jsx` is frequently dirty from other
  chats — stage deliberately at commit time.
- `TermTip` is reusable; keep V2 scope to this tab and adopt elsewhere later.
- Distance breakdown deliberately excluded (field not imported) — deferred until the importer maps
  `price_distance_from_ob_at_arm_pips`.

---

## Recommended final UX
One panel, four stacked sections in order: **Signal Cards** (OB Vacant primary / AAE / Occupied
baseline / Outside danger — Avg R on the face) → **Fill State Breakdown** (the indented Occupied /
Vacant→AAE+No-AAE / Unknown tree, parent highlighted) → **Session Breakdown** (Outside flagged
danger) → **Entry Model Breakdown** (existing). Every header, column, label, and card carries a
glossary tooltip; all four sections share one metric set and one source aggregation. This puts the
real finding — **OB Vacant At Arm is the primary edge; AAE and Vacant-No-AAE are its children** —
front and center, with AAE demoted from headline to child.

### Optional enhancements (not core V2)
- Click a Signal Card to filter the ledger/sections to that fill state (`MetricChip` already supports
  `onClick` + `selected`; would set `ledgerContextFilters`).
- Low-n badge on noisy rows.

---

## Suggested implementation order (when approved)
1. `fillStateBreakdown.js` + its `.validate.mjs` (pure, testable, no UI).
2. `TermTip.jsx` (verify multi-line content + hover/focus a11y standalone).
3. `RunDetail.jsx` — memos, then Fill State table, then Session, then Signal Cards, then remove Entry
   Context. Regression-check the Entry Model table throughout.

---

*Generated: 2026-06-07 | Basis: Phase 2 foundation (2A/2B/2C) | Task: CLASSIFICATION-TAB-V2 audit*
