# CLASSIFICATION-TAB-AAE-V2-PLAN
**Repo: FX-OB-Research-Lab**
**Mode: AUDIT / IMPLEMENTATION PLAN ONLY — no implementation**
**Basis: AAE-DEEP-ANALYSIS-2 findings**

---

## 1. Current State (V1 Classification Tab)

**Location:** `RunDetail.jsx` lines 2858–2929 — single `NeonPanel`, title "Classification Performance"

**What it shows:**
- Two dimension tables rendered side by side (Entry Model + Entry Context)
- Columns: Tag (ClassificationBadge), Trades, Win Rate, Net R, Avg R
- Data source: `buildClassificationBreakdown(displayTrades)` (pure helper at line 4637)
- `classificationBreakdown` memo at line 872 — recomputed whenever `displayTrades` changes

**V1 gaps:**
- No headline insight cards — the AAE edge vs clean contrast (7:1 avg R) is invisible
- No session breakdown for AAE/vacant trades — the Outside session wipeout (0% WR) is invisible
- No distance breakdown — the 0–2 pip loss zone is invisible
- No explicit OB Occupied vs OB Vacant superset rows — Entry Context tags only
- No danger highlighting — no visual signal for Outside or <2 pip conditions

---

## 2. Data Availability Audit

### Fields available in importer.js (confirmed)

| Field (trade object key)              | Source CSV column                | Type       | Notes |
|---------------------------------------|----------------------------------|------------|-------|
| `armedAfterObExit` / `armed_after_ob_exit` | `armed_after_ob_exit`       | bool\|null | null for baseline, delay=0 |
| `obOccupiedAtArm` / `ob_occupied_at_arm` | `ob_occupied_at_arm`          | bool\|null | null for baseline, delay=0 |
| `fillSession` / `fill_session`        | `fill_session`                   | string     | "New York" / "London" / "London Lull" / "Asia" / "Outside" / "" |
| `ob_exit_time` / `obExitTime`         | `ob_exit_time`                   | string     | empty string for same-candle |
| `armCandleIndex` / `arm_candle_index` | `arm_candle_index`               | num\|null  | |
| `entry_model_key`                     | `entry_model_key`                | string     | used for TE variant detection |

### CRITICAL GAP: `price_distance_from_ob_at_arm_pips` is NOT in importer.js

`classificationRegistry.js` lists `priceDistanceFromObAtArmPips` as a `supportingField` for `aae` and `ob_not_occupied`, but the field is **never mapped in importer.js**. The backend exports `price_distance_from_ob_at_arm_pips` in the CSV (confirmed in AAE-FULL-HISTORY-RUN-1), but the frontend will see `undefined` on every trade object.

**Importer.js edit is required before the distance breakdown can function.**

### Fields that do NOT need changes

- `armedAfterObExit` — already mapped (line 440–441)
- `obOccupiedAtArm` — already mapped (line 438–439)
- `fillSession` — already mapped (line 230, 315–317)
- Classification tags `aae`, `ob_not_occupied` — already in registry and correctly derived by `tradeClassificationDims.js`

---

## 3. Derived Groups (exact logic)

All groups apply only to performance trades (`isPerformanceTrade(trade) === true`).

### Fill State Groups

| Group Label        | Filter predicate |
|--------------------|-----------------|
| All Filled         | `isPerformanceTrade(t)` — all rows in the breakdown population |
| OB Occupied        | `t.obOccupiedAtArm === true` |
| OB Vacant          | `t.obOccupiedAtArm === false` |
| → AAE              | `t.armedAfterObExit === true` (subset of OB Vacant) |
| → Vacant (no-AAE)  | `t.obOccupiedAtArm === false && t.armedAfterObExit !== true` |

**Null safety:**
- Trades where `obOccupiedAtArm === null` (baseline, same-candle same, non-TE) are excluded from the fill state table entirely. They still appear in the existing generic Entry Model / Entry Context tables below.
- "All Filled" row counts all performance trades regardless of null — it is the reference denominator.

**Hierarchy note:** OB Vacant = AAE + Vacant-no-AAE. These sum correctly. Show the indented `→` rows as children of OB Vacant.

### Session Groups (OB Vacant only)

Filter population: `t.obOccupiedAtArm === false` (AAE + Vacant-no-AAE combined).
Group by: `t.fillSession.trim()` — bucket empty string as "Unknown".

Session order: New York → London Lull → London → Asia → Outside → Unknown.

**Danger rule:** if a session row has `avgR < 0 && count >= 5`, highlight with `tone="danger"`.

### Distance Band Groups (OB Vacant only)

Filter population: `t.obOccupiedAtArm === false && t.priceDistanceFromObAtArmPips != null`.
Group by pip band:

| Band label | Predicate |
|------------|-----------|
| 0–2 pips   | `dist >= 0 && dist < 2` |
| 2–5 pips   | `dist >= 2 && dist < 5` |
| 5–10 pips  | `dist >= 5 && dist < 10` |
| 10+ pips   | `dist >= 10` |

**Warning rule:** if `avgR < 0.1 && count >= 5`, highlight with `tone="warning"` (matches the near-zero 0–2 pip band).

**Empty state:** if 0 trades have a non-null distance value (importer gap not yet fixed, or old bundle), show: "Distance data not available — re-import a run with AAE fields."

---

## 4. Proposed Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLASSIFICATION PERFORMANCE                              [tab panel] │
├─────────────────────────────────────────────────────────────────────┤
│  INSIGHT CARDS  (5 compact MetricChip, single row)                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ...           │
│  │ Best Signal  │ │  AAE Edge    │ │ Vacant Edge  │ ⚠Outside ⚠Dist│
│  └──────────────┘ └──────────────┘ └──────────────┘               │
├─────────────────────────────────────────────────────────────────────┤
│  TE FILL STATE BREAKDOWN                                            │
│  Tag              n     WR      Net R    Avg R                      │
│  All Filled       ===   ===     ===      ===                        │
│  OB Occupied      ...                                               │
│  OB Vacant        ...                                               │
│    → AAE          ...   [warning badge]                             │
│    → Vacant(noAAE)...                                               │
├─────────────────────────────────────────────────────────────────────┤
│  AAE / OB VACANT — BY SESSION  (only shown if any vacant trades)    │
│  Session      n    WR      Net R    Avg R                           │
│  New York     ...                                                   │
│  London Lull  ...                                                   │
│  London       ...                                                   │
│  Asia         ...                                                   │
│  Outside      ...   [danger row if avg R < 0]                       │
├─────────────────────────────────────────────────────────────────────┤
│  DISTANCE BAND (OB Vacant only)  (only shown if distance data avail)│
│  Band         n    WR      Net R    Avg R                           │
│  0–2 pips     ...   [warning row if near-zero]                      │
│  2–5 pips     ...                                                   │
│  5–10 pips    ...                                                   │
│  10+ pips     ...                                                   │
├─────────────────────────────────────────────────────────────────────┤
│  ── ENTRY MODEL / ENTRY CONTEXT  (existing V1 tables, kept below) ──│
│  Entry Model  [te_same] [te_next] [te_d2] [te_d3] [baseline] rows  │
│  Entry Context [clean] [aae] [ob_not_occupied] rows                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Decision on existing Entry Model / Entry Context tables

**Keep them, positioned below the new research panels.** Rationale:

- The Entry Model table (per TE delay variant) is important reference data not duplicated elsewhere.
- The Entry Context table (clean / AAE / ob_not_occupied) is a useful top-level summary that complements (not duplicates) the fill state breakdown. The fill state table adds OB Occupied vs OB Vacant superset rows and the Vacant-no-AAE split.
- Collapsing into an accordion adds interaction friction for minimal benefit in a research tool.
- A visual section divider line between the new panels and the existing tables is sufficient.

Do NOT replace the existing tables. Do NOT collapse them.

---

## 5. Headline Insight Cards (Section 1)

Five compact MetricChips in a responsive row (`grid-cols-2 md:grid-cols-5`).

| # | Label | Value | Sub | Tone | Derivation |
|---|-------|-------|-----|------|-----------|
| 1 | Best Signal | Group label | `+X.XXR avg` | success | Row from fillState with highest `avgR` (excludes "All Filled" and "OB Vacant" superset rows) |
| 2 | AAE Edge | `+X.XXR` | vs `+X.XXR clean` | warning | `aae.avgR` displayed; sub shows `clean.avgR` for comparison |
| 3 | OB Vacant Edge | `+X.XXR` | vs `+X.XXR occupied` | warning | `vacant.avgR` vs `occupied.avgR` |
| 4 | ⚠ Outside Session | `X% WR` | `X trades` | danger (if avgR<0) or muted | `sessionBreakdown["Outside"]?.winRate` |
| 5 | ⚠ 0–2 pip Zone | `X.XXR avg` | `X trades` | warning (if avgR<0.1) or muted | `distanceBand["0-2"]?.avgR` |

Cards 4 and 5 show as `tone="muted"` with a neutral label when the condition does not apply (Outside session not negative, or distance data absent). This prevents "no data" blank cards.

If no AAE or vacant trades exist in the current `displayTrades` view (e.g. user has filtered to baseline-only), all cards degrade gracefully to `"—"` values with `tone="muted"`.

---

## 6. Helper Functions Needed

All pure functions — no React, no side effects. Place at the bottom of `RunDetail.jsx` alongside `buildClassificationBreakdown`.

### `buildFillStateBreakdown(trades)`
```
Input:  trade[] (displayTrades, already performance-filtered upstream if desired)
Output: {
  allFilled:   { count, wins, losses, sumR, winRate, netR, avgR },
  obOccupied:  { ... },
  obVacant:    { ... },
  aae:         { ... },
  vacantNoAae: { ... },
  hasVacantData: boolean,  // true if any trade has obOccupiedAtArm !== null
}
```
Logic: single pass over trades calling `isPerformanceTrade(t)`. Accumulate into 5 buckets using the predicates from Section 3. `hasVacantData` = any trade with `obOccupiedAtArm !== null`.

### `buildVacantSessionBreakdown(trades)`
```
Input:  trade[]
Output: Map<sessionLabel, { count, wins, losses, sumR, winRate, netR, avgR }>
```
Filter: `isPerformanceTrade(t) && t.obOccupiedAtArm === false`.
Group by `(t.fillSession || "").trim() || "Unknown"`.
Sort: predefined session order (New York, London Lull, London, Asia, Outside, Unknown).

### `buildDistanceBandBreakdown(trades)`
```
Input:  trade[]
Output: {
  bands: Array<{ label, min, max, count, wins, losses, sumR, winRate, netR, avgR }>,
  hasDistanceData: boolean,
}
```
Filter: `isPerformanceTrade(t) && t.obOccupiedAtArm === false && t.priceDistanceFromObAtArmPips != null`.
`hasDistanceData` = any trade passes the filter.
Bands: `[{label:"0–2 pips",min:0,max:2}, {label:"2–5 pips",min:2,max:5}, {label:"5–10 pips",min:5,max:10}, {label:"10+ pips",min:10,max:Infinity}]`.

### `buildClassificationV2Memos(fillState, sessionMap, distanceBands)`
Not a separate function — derive the 5 insight card payloads inline within a single `React.useMemo` that receives the three breakdown objects.

---

## 7. New React.useMemo Hooks in RunDetail.jsx

Add three new memos alongside the existing `classificationBreakdown` memo (line 872):

```js
const fillStateBreakdown = React.useMemo(
    () => buildFillStateBreakdown(displayTrades),
    [displayTrades],
);

const vacantSessionBreakdown = React.useMemo(
    () => buildVacantSessionBreakdown(displayTrades),
    [displayTrades],
);

const distanceBandBreakdown = React.useMemo(
    () => buildDistanceBandBreakdown(displayTrades),
    [displayTrades],
);

// Insight card payloads — derived from the three breakdowns above
const classificationInsightCards = React.useMemo(
    () => deriveInsightCards(fillStateBreakdown, vacantSessionBreakdown, distanceBandBreakdown),
    [fillStateBreakdown, vacantSessionBreakdown, distanceBandBreakdown],
);
```

`deriveInsightCards` is a pure helper function (bottom of RunDetail.jsx).

---

## 8. Table Row Rendering Pattern

Reuse the existing row pattern from V1 (lines 2900–2921). The grid template is already correct:
```
gridTemplateColumns: "minmax(96px,auto) repeat(4,minmax(52px,1fr))"
```

For the fill state table, the "Tag" cell should use a text label (not a ClassificationBadge) since the rows are analytical groups, not registry tags. Exception: the `→ AAE` and `→ Vacant (no-AAE)` rows can optionally render `<ClassificationBadge tag="aae" />` / `<ClassificationBadge tag="ob_not_occupied" />` for visual consistency.

For danger/warning rows: swap `bg-[hsl(var(--panel-2)/0.35)]` for `bg-[hsl(var(--danger)/0.08)]` (danger) or `bg-[hsl(var(--warning)/0.08)]` (warning) on the row container.

For indented rows (→ AAE, → Vacant-no-AAE): add `pl-6` left padding on the tag cell.

---

## 9. Files to Edit

| File | Change | Scope |
|------|--------|-------|
| `frontend/src/data/importer.js` | Add `price_distance_from_ob_at_arm_pips` / `priceDistanceFromObAtArmPips` mapping | **REQUIRED first** — ~2 lines |
| `frontend/src/pages/RunDetail.jsx` | Add 3 memos + 4 pure helper functions + replace Classification tab JSX section | Main work — ~200 lines new |
| `frontend/src/data/classificationRegistry.js` | No changes needed | — |
| `frontend/src/data/tradeClassificationDims.js` | No changes needed | — |
| `frontend/src/data/importer.js` | No other changes | — |
| Any test file | Node assertion tests for `buildFillStateBreakdown`, `buildVacantSessionBreakdown`, `buildDistanceBandBreakdown` | Recommended |

---

## 10. Implementation Phases

### Phase V2-0: Importer gap fix (prerequisite)
- Edit `importer.js`: add `price_distance_from_ob_at_arm_pips` → `priceDistanceFromObAtArmPips` mapping using existing `numOrNull` + `pick` pattern.
- Verify by importing AAE full-history run and checking `trade.priceDistanceFromObAtArmPips` is non-null on TE trades.

### Phase V2-1: Helper functions + tests
- Add `buildFillStateBreakdown`, `buildVacantSessionBreakdown`, `buildDistanceBandBreakdown`, `deriveInsightCards` to bottom of `RunDetail.jsx`.
- Write node assertion tests against known fixture data (can use the AAE analysis CSV rows as fixtures).
- Do NOT change any JSX yet — memo hooks and helpers only.

### Phase V2-2: Fill State table
- Add `fillStateBreakdown`, `vacantSessionBreakdown`, `distanceBandBreakdown`, `classificationInsightCards` memos to the RunDetail component body (after line 872 cluster).
- Replace the Classification tab NeonPanel content (lines 2858–2929) with the new multi-section layout.
- Render only the TE Fill State table first; leave insight cards + session + distance as `{/* TODO V2-2 */}` stubs.
- Regression check: existing Entry Model / Entry Context tables still render correctly.

### Phase V2-3: Session + Distance tables
- Wire up `vacantSessionBreakdown` and `distanceBandBreakdown` into the Classification tab.
- Add danger/warning row highlighting.
- Add empty-state messages (no vacant data, no distance data).

### Phase V2-4: Insight cards
- Implement `deriveInsightCards` + render 5 compact MetricChips at top of tab.
- Handle all edge cases: no data → `"—"` values, all-baseline run → all cards muted.

---

## 11. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `priceDistanceFromObAtArmPips` undefined on all trades (importer not fixed) | Certain until Phase V2-0 runs | Distance section shows "Distance data not available" empty state — does not break other sections |
| Old run bundles (pre-AAE instrumentation) have all null for AAE fields | High | `hasVacantData === false` → Fill State table shows "No OB state data in this run — re-import a run with AAE fields" |
| `fillSession` empty string on some TE trades | Medium | Bucket as "Unknown" — clearly visible in session table |
| Fill state counts don't reconcile with existing Entry Context table | Low | Document that fill state excludes null-field (non-TE) trades; Entry Context includes all performance trades |
| Session breakdown applied to mixed TE delay variants | By design | User should filter to TE-only runs via existing entry model filter chips before reading session/distance sections. Add a note in the section header if baseline trades are present |
| Indented row styling conflicts with existing table grid | Low | Single row template reused — indentation is padding-only |

---

## 12. Validation Steps

1. **Unit tests** (Phase V2-1): `buildFillStateBreakdown` with a 10-trade fixture → assert group counts sum correctly, AAE ⊆ OB Vacant.
2. **Old bundle smoke test** (Phase V2-2): import a pre-AAE run bundle → all new sections show empty-state messages, existing Entry Model/Context tables unaffected.
3. **AAE full-history run** (Phase V2-2): import `20260605_163857_EURUSD_15min_RR4_SB0` → assert:
   - Fill State > OB Vacant row count matches `n=223` (d2+d3 `ob_not_occ` total from analysis)
   - Fill State > AAE count = `150` (d2:47 + d3:103)
   - Session > Outside row exists and shows `0% WR` → danger row highlighted
4. **Distance data presence** (Phase V2-0 + V2-3): after importer fix, import AAE run → distance breakdown shows 4 bands, 0–2 pip row has WR ≈ 20% and is warning-highlighted.
5. **Filter interaction** (Phase V2-3): apply entry model filter chip `te_d3` → all four new sections recompute correctly from filtered `displayTrades`.
6. **No React errors**: confirm Classification tab renders without errors in all states (no data, baseline-only, mixed TE, pure TE).
7. **Full-history match**: verify AAE count (n=150) and OB Vacant session totals match AAE-DEEP-ANALYSIS-2 Section 4 session breakdown.

---

## 13. What This Does NOT Cover

- No backtester changes.
- No CSV format changes.
- No new classification tags (AAE and ob_not_occupied are already in the registry).
- No backend/API changes.
- No time-based expiry UI (timing data shows all AAE fills within 4 minutes — expiry is low priority).
- No direction breakdown panel (bearish/bullish asymmetry is a Phase V2-5 candidate after full-history validation).
- No interactive filter builder (filter by AAE+session+distance is a Phase V2-6 candidate).

---

## 14. Terminology & Tooltips (UX requirement)

**Requirement:** every abbreviation, signal, filter, classification, and statistic shown in the
Classification tab must expose (1) a friendly name, (2) a plain-language tooltip definition, and
(3) a "why it matters" line. This section is the design for that. It was missing from V1 and from
sections 1–13 above; it is the highest-priority UX deliverable.

### 14.1 Tooltip mechanism (reuse, don't reinvent)

A Radix tooltip primitive already exists: `frontend/src/components/ui/tooltip.jsx`
(exports `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`). Its `TooltipContent`
is styled single-line (`text-xs`, `px-3 py-1.5`) — fine for one-liners, too cramped for a
definition + "why it matters" pair. Design:

1. **Glossary registry — `frontend/src/data/researchGlossary.js` (NEW).**
   Single source of truth, same pattern as `classificationRegistry.js` (data only, no logic):
   ```js
   export const GLOSSARY = {
     aae: {
       term: "AAE",
       friendlyName: "Armed After OB Exit",
       definition: "Price left the order block through the entry side during the delay window, then came back and filled the limit after it armed.",
       whyItMatters: "AAE fills average ~+0.59R vs ~+0.08R for clean fills — leaving and returning is a strength signal, not a bug.",
     },
     // ...one entry per term below
   };
   export function getGlossary(key) {
     return GLOSSARY[key] ?? null;
   }
   ```

2. **`<TermTip>` wrapper — `frontend/src/components/lab/TermTip.jsx` (NEW).**
   Renders an inline info affordance (a small `ⓘ` glyph, or wraps the label text in a dotted
   underline) as the `TooltipTrigger`, and a **multi-line** `TooltipContent` variant:
   ```
   <TermTip termKey="aae" />            // standalone ⓘ dot
   <TermTip termKey="aae">AAE</TermTip> // wraps a label, adds dotted underline + ⓘ
   ```
   Content layout (3 stacked blocks):
   - **Friendly name** — bold, e.g. "Armed After OB Exit"
   - **Definition** — normal weight
   - **Why it matters** — muted/italic, prefixed "Why it matters:"
   Add a wider/auto-height content class (e.g. `max-w-xs whitespace-normal leading-snug`) so the
   three blocks wrap. Wrap the tab once in a single `<TooltipProvider delayDuration={200}>` (at the
   NeonPanel root) rather than per-tooltip.

3. **Attachment rule.** Every column header, group label, insight-card label, badge, session name,
   and distance-band label that has a glossary entry renders its text through `<TermTip>`. No raw
   term appears in the tab without a tooltip. Statistic column headers (n / WR / Net R / Avg R) get
   a `ⓘ` next to the header text.

4. **Reuse beyond this tab.** `getGlossary()` + `<TermTip>` are generic; later phases (StrategyMap,
   ledger column headers) can reuse the same registry. `ClassificationBadge` descriptions in
   `classificationRegistry.js` already overlap several of these terms — `researchGlossary.js` should
   be the richer superset; keep the badge `description` strings as-is (no edit), but ensure wording
   is consistent.

### 14.2 Glossary content — every term in the tab

Friendly name + tooltip definition + why it matters for each. `key` = `researchGlossary.js` key.

**A. Order-block fill-state concepts**

| key | UI label | Friendly name | Definition (tooltip) | Why it matters |
|-----|----------|---------------|----------------------|----------------|
| `ob` | OB | Order Block | The supply/demand zone the strategy places its limit order against. | Every entry references the OB; "occupied vs vacant" is measured against its price range. |
| `occupied_at_arm` | OB Occupied | OB Occupied At Arm | Price was still inside the OB range at the moment the limit order armed. | The textbook fill. Weakest cohort (~+0.08R avg) — being still in the block is *not* the edge. |
| `vacant_at_arm` | OB Vacant | OB Vacant At Arm | Price had already left the OB range when the order armed (the superset of AAE + Vacant-no-AAE). | The strongest signal (~+0.89R avg). This — not AAE alone — is the primary edge. |
| `aae` | AAE | Armed After OB Exit | Price exited the OB through the entry side during the delay window, then returned and filled after the limit armed. | ~+0.59R avg; a high-conviction *subtype* of OB Vacant. 100% of AAE fills occur within 4 min of OB exit. |
| `vacant_no_aae` | Vacant (no-AAE) | Vacant, non-AAE | OB was vacant at arm but the exit was not flagged AAE (e.g. vacant from origin, no clean exit-and-return). | Isolates the rest of the OB-Vacant cohort so AAE's contribution to the +0.89R is visible. |
| `clean` | Clean | Clean Fill | No special entry context — effectively the OB-Occupied / textbook case. | Baseline comparison point. Weak expectancy; the contrast that makes AAE/Vacant look strong. |
| `arm` | Arm / Armed | Order Arm | The candle on which the delayed limit order becomes live and eligible to fill. | "Occupied/vacant" and "distance" are all measured *at arm*, so arm timing defines the signal. |
| `arm_candle_index` | Arm Idx | Arm Candle Index | Index of the candle (relative to trigger) on which the order armed. | Distinguishes same/next/D2/D3 delay behaviour per trade. |

**B. Triggered Edge & entry models**

| key | UI label | Friendly name | Definition (tooltip) | Why it matters |
|-----|----------|---------------|----------------------|----------------|
| `te` | TE | Triggered Edge | Entry family where the limit only arms after price triggers the OB edge, optionally after a delay. | The entire AAE/vacant research only exists for TE entries; baseline trades have no arm step. |
| `te_same` | TE Same | TE — Same Candle | Limit arms and can fill on the same candle as the trigger (delay = 0). | Shortest delay; least chance for price to vacate the OB before arming. |
| `te_next` | TE Next | TE — Next Candle | Limit arms on the candle immediately after the trigger (delay = 1). | First delay tier where AAE/vacant behaviour starts to appear. |
| `te_d2` | TE D2 | TE — 2-Candle Delay | Limit arms after a 2-candle delay window. | Longer delay → more vacate-and-return opportunity → more AAE. |
| `te_d3` | TE D3 | TE — 3-Candle Delay | Limit arms after a 3-candle delay window. | Highest AAE share in the full-history run; richest cohort for the signal. |
| `delay` | Delay | Delay Window | The candles between trigger and arm during which price may leave/re-enter the OB. | The window that *creates* the vacant/AAE condition; longer windows shift the fill-state mix. |
| `threshold` | 25% | Triggered-Edge Threshold | OB-depth fraction price must reach to trigger the edge (current research setting: 25%). | Defines what counts as a trigger; all current findings are at the 25% threshold. |
| `baseline` | Baseline | Baseline Entry | Standard OB limit with no TE/penetration variant and no arm step. | Control group; excluded from fill-state/session/distance tables (no arm data). |
| `ep_25` … `ep_100` | EP 25–100% | Entry Penetration | Limit placed at N% depth into the OB (25/50/75/100%). | A separate entry family; shown in the Entry Model table for reference, not part of the AAE signal. |

**C. Sessions (fill session of the trade)**

| key | UI label | Friendly name | Definition (tooltip) | Why it matters |
|-----|----------|---------------|----------------------|----------------|
| `sess_ny` | New York | New York Session | Trade filled during the New York session window. | Primary in-session cohort for vacant/AAE performance. |
| `sess_london` | London | London Session | Trade filled during the London session window. | Core liquidity session; compare expectancy vs NY. |
| `sess_london_lull` | London Lull | London Lull | The mid-session lull between London and NY overlap. | Lower-liquidity sub-window; expectancy can diverge from London proper. |
| `sess_asia` | Asia | Asia Session | Trade filled during the Asia session window. | Thinner liquidity; sanity-check sample size before trusting the row. |
| `sess_outside` | Outside | Outside Session | Trade filled outside all defined session windows. | **Danger condition:** ~0% WR, ~−1R avg in the full-history run. The single hardest filter to apply. |

**D. Statistics (column headers & card values)**

| key | UI label | Friendly name | Definition (tooltip) | Why it matters |
|-----|----------|---------------|----------------------|----------------|
| `stat_n` | n / Trades | Trade Count | Number of performance trades in the group. | Small n (e.g. < 5–10) makes WR/avg-R unreliable; always read alongside the rates. |
| `stat_wr` | WR | Win Rate | Wins ÷ (wins + losses). Breakevens are excluded from the denominator. | Shows hit-rate without breakeven dilution; pair with Avg R since high WR can still be low expectancy. |
| `stat_netr` | Net R | Net R | Sum of R-multiples across all trades in the group. | Total contribution of the cohort; scales with n, so compare cohorts of similar size carefully. |
| `stat_avgr` | Avg R | Average R (Expectancy) | Net R ÷ trade count (breakevens *included* in the denominator). | The headline expectancy number; the +0.08 / +0.59 / +0.89R comparison is all Avg R. |
| `stat_r` | R | R-Multiple | Trade result expressed in multiples of the initial risk (1R = the stop distance). | Risk-normalised P&L; lets trades of different pip sizes be compared and averaged. |

**E. Insight-card metrics (section 1)**

| key | UI label | Friendly name | Definition (tooltip) | Why it matters |
|-----|----------|---------------|----------------------|----------------|
| `card_best_signal` | Best Signal | Best Fill-State Signal | The fill-state group with the highest Avg R (excludes the All-Filled and OB-Vacant superset rows). | One-glance answer to "which condition should I trade?" |
| `card_aae_edge` | AAE Edge | AAE Edge vs Clean | AAE Avg R shown against Clean Avg R. | Quantifies the core finding (~+0.59R vs ~+0.08R) in one card. |
| `card_vacant_edge` | Vacant Edge | OB-Vacant Edge vs Occupied | OB-Vacant Avg R shown against OB-Occupied Avg R. | Shows the *broader* signal beats AAE alone (~+0.89R vs ~+0.08R). |
| `card_outside_warn` | ⚠ Outside | Outside-Session Warning | WR / trade count for Outside-session fills; turns danger-toned when Avg R < 0. | Surfaces the hard danger filter even when the user hasn't opened the session table. |
| `card_dist_warn` | ⚠ 0–2 pip | Near-Zone Warning | Avg R / count for the 0–2 pip distance band; warning-toned when Avg R < 0.1. | Surfaces the distance danger zone (depends on the importer fix in Phase V2-0). |

**F. Distance bands (distance-from-OB-at-arm)**

| key | UI label | Friendly name | Definition (tooltip) | Why it matters |
|-----|----------|---------------|----------------------|----------------|
| `dist` | Distance | Distance From OB At Arm | How far (pips) price sat from the OB edge when the order armed. **Field not yet imported — see Phase V2-0.** | The axis of the second danger condition; the whole distance table is blind until the importer maps it. |
| `dist_0_2` | 0–2 pips | Near Zone | Price < 2 pips from the OB at arm. | **Danger condition:** weak/negative expectancy — too close to be a meaningful vacate. |
| `dist_2_5` | 2–5 pips | Mid-Near | 2–5 pips from the OB at arm. | First band where expectancy recovers; the practical lower cutoff candidate. |
| `dist_5_10` | 5–10 pips | Mid | 5–10 pips from the OB at arm. | Healthy-distance cohort; reference for where the edge concentrates. |
| `dist_10p` | 10+ pips | Far | ≥ 10 pips from the OB at arm. | Largest vacate; check sample size before over-weighting. |

**G. Filters (ledger / tab controls)**

| key | UI label | Friendly name | Definition (tooltip) | Why it matters |
|-----|----------|---------------|----------------------|----------------|
| `filter_entry_model` | Model filter | Entry-Model Filter | Limits the view to one or more entry models (baseline / TE Same…D3 / EP). | Isolate a single TE delay before reading session/distance, since those tables mix delays by default. |
| `filter_entry_context` | Context filter | Entry-Context Filter | Limits to context tags (clean / AAE / OB Not Occupied). | Quickly compare cohorts without leaving the ledger. |
| `filter_session` | Session filter | Session Filter | Limits to one fill session (incl. "Unassigned"). | Re-run the whole tab against a single session to confirm a session-specific edge. |
| `filter_direction` | Direction filter | Direction Filter | Limits to bullish or bearish trades. | Checks long/short asymmetry (a Phase V2-5 candidate). |
| `filter_result` | Result filter | Result Filter | Limits by outcome bucket (wins / losses / breakeven / special-missed). | Drill into the losing side of a cohort to find what breaks. |

**H. Exit types (already in `classificationRegistry.js`; mirror wording into the glossary)**

TP Hit, SL Hit, Breakeven, News Flatten, News Cancel, Protection Exit, Session Cancel,
Reverse Cancel, Invalid, Unfilled, Unknown Exit. Their definitions already live in
`CLASSIFICATION_TAGS` (registry lines 141–206). For consistency, `researchGlossary.js` should
re-export those `description` strings rather than duplicate them, and add a one-line
"why it matters" per exit type (e.g. News Flatten → "early close by news rule — not a clean SL/TP,
so it dilutes Avg R; worth filtering when reading expectancy").

### 14.3 Additions to earlier sections

- **§9 Files to Edit:** add `frontend/src/data/researchGlossary.js` (NEW, data-only) and
  `frontend/src/components/lab/TermTip.jsx` (NEW). No edits to `classificationRegistry.js`.
- **§10 Phases:** insert **Phase V2-1b — Glossary + TermTip** between V2-1 and V2-2: build
  `researchGlossary.js` + `<TermTip>`, render against a throwaway label to verify multi-line content
  and hover/focus a11y, *before* wiring terms into the real tables. Then in V2-2…V2-4 wrap each new
  label/header/badge in `<TermTip>` as it is added.
- **§12 Validation:** add — (a) every column header, group label, badge, session name, distance band,
  and insight-card label in the tab has a resolvable glossary entry (no `getGlossary()` returning
  `null` for a rendered term); (b) tooltips open on hover *and* keyboard focus (Radix gives focus for
  free — confirm the trigger is focusable); (c) `<TooltipProvider>` wraps the tab exactly once.
- **§11 Risks:** add — glossary drifts out of sync with `classificationRegistry.js` wording
  (mitigation: exit-type and tag descriptions are re-exported from the registry, not retyped);
  tooltip content overflow on long "why it matters" lines (mitigation: `max-w-xs whitespace-normal`).

---

*Generated: 2026-06-05 | Basis: AAE-DEEP-ANALYSIS-2 | Task: CLASSIFICATION-TAB-AAE-V2-PLAN*
*Updated: 2026-06-05 — added §14 Terminology & Tooltips (glossary + TermTip design).*
