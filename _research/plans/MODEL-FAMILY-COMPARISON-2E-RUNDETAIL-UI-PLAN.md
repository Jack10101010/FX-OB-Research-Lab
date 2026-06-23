# MODEL-FAMILY-COMPARISON-2E-RUNDETAIL-UI-PLAN

**Type:** implementation plan (PLAN ONLY — no implementation, no source changes)
**Owner:** Claude (UI)
**Branch verified:** `codex-dev` · HEAD `f0e9f4f`
**Parent:** `MODEL-FAMILY-COMPARISON-2A-PLAN.md` → this is **Commit 3** (the UI milestone).
**Depends on (done & green):** `data/modelFamily.js` (`buildModelFamilyComparison`),
`data/compareWinner.js` (`computeExplainableWinner`).

> Plan to replace the RunDetail Classification tab's **Enabled Variant Comparison** section
> with a compact **Model Family Comparison** section. Read-only, single-run, presentational
> only. No store writes, no Research-Signals change, no ComparisonLab, no new page.

---

## Answers to the 12 questions (decisions)

**1. Rename/replace, or add below?** → **Replace.** Model Family Comparison is a strict
superset of Enabled Variant Comparison: the entry-model variants become the `entry_model`
family, and baseline / directional / protection / fft_control are added. Keeping both would
render the entry-model rows twice. Replace section "E" in place; keep the same render gate
spirit (`rows.length >= 2`).

**2. Default rows?** → All non-empty rows from `buildModelFamilyComparison(runData).rows`.
The adapter already drops zero-trade variants and sorts family-ordered (baseline → entry_model
→ directional → protection → fft_control; entry-models in TAG_ORDER). No artificial cap in V1.
For a typical run that's baseline + 1–4 entry models; richer bundles add the other families.

**3. Group by family?** → **Light grouping, conditional.** Insert a thin family eyebrow label
above each family group **only when ≥2 families are present** (`families.filter(f => f.present)
.length >= 2`). Single-family runs render flat (no redundant headers). Rows already arrive
family-ordered, so grouping is just a label inserted at each family boundary.

**4. Visible columns (V1)?** → Label · **Trades · WR · Net R · Avg R · Max DD · Profit Factor**,
with **Confidence rendered as a chip inside the label cell** (not its own column). That is
`label + 6 numeric columns` — exactly one more column than today's Enabled Variant table
(which is `label + 5`), and the confidence chip adds no column width. Mapping:

| Column | Row field | Format |
|---|---|---|
| Trades | `count` | int |
| WR | `winRate` (fraction) | `Math.round(winRate*100)%` |
| Net R | `netR` | `formatSignedR` |
| Avg R | `avgR` | `formatSignedR(…,2)` |
| Max DD | `maxDdR` | `formatSignedR`; danger tone when `< 0`; `—` when null |
| Profit Factor | `profitFactor` | 2-dp; `∞` when `null` (no losses) |
| Confidence (chip) | `confidence.level` | `<ConfidenceChip level=…/>` |

**5. Expectancy hidden/deferred?** → **Deferred (and not even computed).** The adapter
returns PF, not expectancy, by design. No expectancy column in V1.

**6. Winner badge?** → Map each row to the winner's metric shape and call
`computeExplainableWinner`:
`{ netR, winRate, pf: row.profitFactor, maxDd: row.maxDdR, validation: undefined, trades: row.count }`.
`validation` is absent → the winner helper skips it (it already skips non-finite/null), so the
winner is decided over the 4 available metrics (Net R, WR, PF, Max DD). Display:
- a small `Crown`/"Best" marker on the winning row (leading the label cell), and
- a single compact line under the section header: *"Best: <label> — leads N/4 (Net R, …)"*,
  with the `smallSample` caveat appended when `winnerInfo.smallSample` is true.
- Only when `rows.length >= 2`.

Caveat to document inline: the winner ranks **across** families (incl. the FFT-OFF control and
directional rows, which are different configs). It is a **directional hint, not a verdict** —
the comparability warnings (Q7) carry the caveat. This mirrors ComparisonLab's winner exactly
(same helper), just scoped to one run's families.

**7. Comparability warnings?** → Render `result.comparability.warnings` as a **compact banner
strip** directly under the section header, above the table, **only when `warnings.length > 0`**.
One line per warning; `severity: "warn"` uses `hsl(var(--warning)…)`, `"info"` uses the muted
token. Reuse the existing bordered-strip + `AlertTriangle` visual already used by the
ComparisonLab partial-coverage banner / TableCompareShell `GuardBanner` (inline JSX, semantic
tokens only — no new component required).

**8. Save-as-finding — include or defer?** → **Defer (constraint-forced).** It requires
`addProjectFinding` (`store.js`) + `buildResearchFindingPayload` (`projectWorkflow.js`), both in
this task's do-not-touch list. Commit 3 stays purely read-only. Save-as-finding ships in a later
commit alongside the Insights `model_family` source filter (the 2A plan's Commit 4).

**9. Equity overlay — defer?** → **Defer.** Adds a chart + meaningful width/height; the curve
data already exists on the rows for a fast-follow. Not needed for the table V1.

**10. Tooltips / glossary?** → **No glossary changes needed.** Every key already exists:
`stat_n` (Trades), `stat_wr` (WR), `stat_net_r` (Net R), `stat_avg_r` (Avg R), `max_drawdown`
(Max DD), **`stat_pf` (Profit Factor)**, and `confidence_*` (ConfidenceChip self-wires). Column
headers use `TermTip` with those keys; the variant label uses `TermTip termKey={row.tooltipKey}`
(the entry-model `tag` for entry rows; `null` for the others → TermTip renders plain text). An
optional `model_family` section-header tooltip is **not** added (would touch the glossary) —
skip for V1.

**11. Exact components/functions touched?** → **`frontend/src/pages/RunDetail.jsx` only.**
- Imports: add `buildModelFamilyComparison` from `@/data/modelFamily`; add
  `computeExplainableWinner` from `@/data/compareWinner`. (`ConfidenceChip` already imported,
  line 57.) Remove the now-unused `buildEnabledVariantBreakdown` import (line 58) — it is used
  only by the replaced memo (verify with a grep before removing).
- Memo: replace the `enabledVariantBreakdown` memo (line 1048) with
  `const modelFamily = React.useMemo(() => buildModelFamilyComparison(runData), [runData]);`
  and a derived `const modelFamilyWinner = React.useMemo(() => computeExplainableWinner(
  modelFamily.rows.map(toWinnerRow)), [modelFamily]);`.
- Section: replace section "E" (lines 3234–3256) with the new Model Family Comparison block
  (banner + winner line + grouped table).
- **New local presentational component** `ModelFamilyTable` (defined in RunDetail.jsx near
  `ClassBreakdownTable`, ~line 5121) — see Q4/Q12. The shared `ClassBreakdownTable` is **not**
  modified (risk isolation — it backs 4 other tables).

**12. Avoid too wide / cluttered?** →
- Confidence as a chip in the label cell, not a column (saves a column).
- 7 grid columns total; numeric columns at `minmax(48–52px,1fr)`, `font-num tabular-nums`,
  `text-[11px]` — identical density to the existing tables.
- Family eyebrows only when ≥2 families; winner = one line; warnings banner only when present.
- Defer equity overlay, expectancy, and save-finding.
- **Width contingency:** if the panel is too narrow for `label + 6`, the first column to
  collapse is **Profit Factor** (move it into the row's hover/tooltip), keeping Trades/WR/Net R/
  Avg R/Max DD + the confidence chip. Decide during host QA.

---

## Recommended UI structure

```
┌ Model Family Comparison ───────────────────────────────────────────────┐
│ [⚠ comparability banner — only if warnings]                            │
│ Best: TE C2 (+2 Delay) — leads 3/4 (Net R, WR, PF) · ⚠ small sample    │   ← one compact line
│                                                                         │
│  (family eyebrow: Baseline)         Trades  WR   Net R  Avg R  MaxDD PF │   ← header row
│  ⌁ Baseline            [Medium]        42  57%  +6.1R  +0.15  -3.2R 1.4 │
│  (family eyebrow: Entry Model)                                          │
│  ⌁ TE C0 (Same Candle) [Low]           18  50%  +1.2R  +0.07  -2.0R 1.1 │
│  ⌁ TE C2 (+2 Delay) 👑 [High]          51  61%  +9.4R  +0.28  -2.1R 1.8 │   ← winner marker
│  (family eyebrow: FFT Control)                                          │
│  ⌁ FFT OFF · …         [Very Low]       9  44%  -0.8R  -0.09  -2.6R 0.6 │
└─────────────────────────────────────────────────────────────────────────┘
```

The chip after each label is the `ConfidenceChip`. The crown marks the winner row. Family
eyebrows are thin uppercase labels shown only when ≥2 families are present.

---

## Exact implementation plan (RunDetail.jsx)

1. **Imports** (top of file): `+ import { buildModelFamilyComparison } from "@/data/modelFamily";`
   `+ import { computeExplainableWinner } from "@/data/compareWinner";` and the `Crown` lucide
   icon if not already imported. Remove the `buildEnabledVariantBreakdown` import (grep-verify
   it has no other consumer in the file first).
2. **Memos** (replace the `enabledVariantBreakdown` memo at ~1048):
   - `modelFamily = useMemo(() => buildModelFamilyComparison(runData), [runData])`.
   - `toWinnerRow(r)` pure local helper → `{ netR, winRate, pf, maxDd, validation, trades }`.
   - `modelFamilyWinner = useMemo(() => computeExplainableWinner(modelFamily.rows.map(toWinnerRow)), [modelFamily])`.
3. **Section render** (replace lines 3234–3256): gate on `modelFamily.rows.length >= 2`. Render:
   `ClassSectionHeader label="Model Family Comparison"` → comparability banner (conditional) →
   winner line (conditional) → `<ModelFamilyTable rows={modelFamily.rows} families={modelFamily.families}
   winnerRowId={modelFamily.rows[modelFamilyWinner.winnerIdx]?.rowId} />`.
4. **New local `ModelFamilyTable` component** (near `ClassBreakdownTable`): a compact grid that
   reuses the same tokens/typography as `ClassBreakdownRow`, adds the PF column, folds the
   `ConfidenceChip` into the label cell, draws the crown on `winnerRowId`, and inserts family
   eyebrow rows when `families.filter(f=>f.present).length >= 2`. Reuses `formatSignedR`,
   `TermTip`, `ConfidenceChip` (all already in scope). PF formatter: `pf == null ? "∞" : pf.toFixed(2)`.
5. No other section, memo, or component is touched.

---

## Tooltip / glossary plan

- **No glossary edits.** Reuse existing keys via `TermTip` on the header cells:
  `stat_n · stat_wr · stat_net_r · stat_avg_r · max_drawdown · stat_pf`.
- Variant label tooltip: `TermTip termKey={row.tooltipKey}` (entry-model `tag` for entry rows;
  `null` elsewhere → plain text, which `TermTip` already handles).
- Confidence: `ConfidenceChip` self-wires `confidence_*` tooltips (needs the panel's existing
  `TooltipProvider` ancestor — already present at the Classification panel root, line ~3161).
- One shared dark tooltip style throughout (the `TermTip`/`GlossaryCard` primitive) — no
  per-component tooltip styles, per CLAUDE.md.

---

## Validation plan

UI-only change → no new pure-logic module, so no new `.mjs`. Validate by:
1. **Re-run the data contracts the UI consumes** (already green; confirms nothing drifted):
   `node src/data/__validation__/modelFamily.validate.mjs` and `…/compareWinner.validate.mjs`.
2. **Babel transpile smoke check** of the edited file via `@babel/core` (env + react presets) —
   catches JSX/syntax errors without the full `craco build` (which times out in-sandbox):
   `transformSync(RunDetail.jsx)` must succeed.
3. **Host browser QA checklist** (computer-use is off; hand to user):
   - Open a run with multiple families → section renders, columns aligned, dark theme unchanged.
   - Winner crown + summary line match the strongest row; small-sample caveat appears when expected.
   - Comparability banner appears only when warnings exist; info vs warn tones correct.
   - Header tooltips (incl. Profit Factor → `stat_pf`) and ConfidenceChip tooltips work on hover + focus.
   - A run with only entry models renders flat (no family eyebrows); a no/low-variant run hides the section.
   - No console errors; no horizontal overflow on the standard panel width.
4. **Diff review** — confirm only RunDetail.jsx changed; the shared `ClassBreakdownTable` and the
   other three tables are byte-unchanged.

---

## Risks / Defer list

**Risks (with mitigations)**
- *Shared-component regression* — avoided by adding a dedicated local `ModelFamilyTable` instead
  of generalizing `ClassBreakdownTable`'s `extraCol`. (Alternative: `extraCols[]` array on the
  shared table — lower duplication but touches 4 tables; only if a reviewer prefers it, with a
  visual snapshot of the other three.)
- *Panel width* — 7 columns; mitigated by confidence-as-chip and the PF-collapses-first contingency.
- *Cross-family winner mixes different configs* (FFT-OFF/directional) — mitigated by the
  comparability warnings + the "directional hint, not a verdict" inline note. Behavior matches
  ComparisonLab's shared winner.
- *RunDetail.jsx is large & multi-owner* — stage only the imports/memo/section/new-component
  hunks; never `git add .`; commit in isolation.
- *Winner key remap* — `validation` is absent on model-family rows; confirmed the helper skips
  non-finite/missing metrics, so it ranks over the 4 present metrics. Documented in `toWinnerRow`.

**Deferred (not in Commit 3)**
- Save-as-finding (needs `store` + `projectWorkflow` — forbidden here) → later commit.
- Insights `model_family` source filter (2A Commit 4).
- Per-variant equity / drawdown overlay chart.
- Expectancy column (and any risk-adjusted/Sharpe metric).
- Cross-run Model Lab, promotion recommendation, funded-account pass/fail (later phases).
- Click-a-row-to-filter the ledger.

---

## Recommended commit message

```
feat(run-detail): replace Enabled Variant section with Model Family Comparison
```

Single scoped commit, `frontend/src/pages/RunDetail.jsx` only. No glossary, store, projectWorkflow,
ComparisonLab, modelFamily, or route changes.
