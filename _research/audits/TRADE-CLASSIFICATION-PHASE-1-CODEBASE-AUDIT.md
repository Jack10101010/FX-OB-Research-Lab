# TRADE-CLASSIFICATION-PHASE-1-CODEBASE-AUDIT

**Repo:** FX-OB-Research-Lab  
**Scope:** `frontend/src/`  
**Mode:** Read-only audit — no files modified  
**Date:** 2026-06-05  
**Status:** Complete. Phase 1 implementation is already done and in the codebase. Sections F–I describe Phase 2+ insertion points.

---

## A. Current Trade Data Flow

### Store (store.js — 2280 lines)

- **Singleton pattern.** Module-level `state` object, `listeners` Set, `notify()` pub/sub. React components subscribe via `useDataset()`.
- **Trade storage.** `runs[runId]` bundles contain `tradesByVariant: { [variantKey]: Trade[] }`. Active variant resolved by `variantDataFor(run)`. `TRADES` in the derived view = `activeVariantData.trades`.
- **Key store exports:** `useDataset()`, `getRunData(runId)`, `getTradeUniverse(runId, scenarioOverride)`, `setActiveRunId()`, `setScenario()`, `setSelectedTradeVariant()`.
- **No `classification` field on trade objects.** No collision risk with Phase 1/2 classification system.

### Trade Universe Layer (useTradeUniverse.js + tradeUniverse.js)

- `useTradeUniverse(runId?, scenarioOverride?)` is the canonical scenario-aware hook. Returns `{ trades, stats, universeType, label, warnings, baselineTrades, baselineStats, ... }`. Wraps `getTradeUniverse()` in `useMemo([dataset, runId, scenarioOverride])`.
- All three workspace pages (FailuresWorkspace, EntriesWorkspace, StrategyMap) consume this hook as their trade source.
- `resolveTradeUniverse()` in `tradeUniverse.js` handles the full resolution chain: scenario → variant → baseline fallback.
- `buildCanonicalKey(family, threshold, fillMode)` produces keys like `entry_triggered_edge_25p0_next`.
- `fillModeFromKey(key)` extracts `"same" | "next" | "d2" | "d3" | null` from key suffix.

### Importer / AAE Fields (importer.js)

- `normalizeEntryModeKey()` produces canonical `entry_model_key` strings.
- AAE fields present as **both** camelCase and snake_case: `armedAfterObExit` / `armed_after_ob_exit`, `obOccupiedAtArm` / `ob_occupied_at_arm`. Values: `true | false | null`. Strict `=== true` / `=== false` required — `null` must not qualify.

### Existing Outcome Classification (tradeClassification.js)

- `classifyTrade(trade)` → WIN/LOSS/BREAKEVEN/CANCELLED/... outcome category string.
- `outcomeToneForTrade(trade)` → Pill tone string.
- `summarizeTradeClassifications(trades)` → per-category count map.
- `displayOutcomeLabel(trade)`, `displayCancelReason(trade)`.
- **Orthogonal to the new dimension system.** Do not modify this file.

---

## B. Trade Rendering Surfaces

### 1. RunDetail.jsx (~3900 lines) — `/runs/:runId`

The primary analytics page. Most Phase 2 classification work will land here.

- **`displayTrades`** = canonical trade array for all analytics (from `useTradeUniverse`).
- **`filteredLedgerRows`** = `displayTrades.filter(...)` using local filter state.
- **Ledger `DataTable` columns** include an outcome column: `{ key:"outcome", label:"Result", render: (r) => <Pill tone={resultTone(r)}>{formatOutcome(r)}</Pill> }`.
- **Local filter state** (not URL, not persisted):
  - `ledgerResultFilter` — "All" | "Win" | "Loss" | "Breakeven" | "Cancelled"
  - `ledgerSessionFilter` — "All" | session name
  - `ledgerDirectionFilter` — "All" | "Long" | "Short"
  - `ledgerSearch` — free-text string
- **Filter UI** uses `FilterToggle` chips from `controls.jsx`.
- **Phase 2 insertion points:** add classification column to ledger `DataTable`, add `FilterToggle` chips for entry_model / entry_context.

### 2. TradeInspector.jsx (~958 lines) — `/trade-inspector`

Per-trade detail panel. **Phase 1 rows are already inserted here.**

- Classification section added after the Outcome row, before the Mapping row using an IIFE pattern to avoid adding top-level derived state.
- Renders `Entry Model`, conditional `Entry Context` (hidden when all clean), and `Exit Type` rows.

### 3. StrategyMap.jsx — `/strategy-map`

Candlestick chart + trade list sidebar.

- **`filteredTrades`** = `filterStrategyTrades(activeTrades, { query, outcome, direction, structure })`.
- **`StrategyTradeListPanel`** renders `visibleTrades.slice(0, 80)` with a `Pill` per trade (outcome tone via `outcomeTone()`).
- **Filter state:** local `useState` for `tradeQuery`, `tradeOutcomeFilter`, `tradeDirectionFilter`, `tradeStructureFilter`. UI preferences persisted to `localStorage["fxob_strategy_map_ui_v1"]`.
- Imports `isWinTrade`, `isLossTrade`, `summarizeTradeClassifications`, `displayOutcomeLabel`, `displayCancelReason`, `outcomeToneForTrade` from `tradeClassification.js`.
- **Phase 2 insertion point:** add `ClassificationBadge` to each trade row in `StrategyTradeListPanel`.

### 4. FailuresWorkspace.jsx (failures pipeline)

Scenario-aware failure forensics workspace.

- Trade source: `useTradeUniverse()`.
- Pipeline: `filterLosers(trades)` → `classifyAll(losers, config)` → `scoreAll(classifiedLosers)` → `applyFilter(scored, filters)`.
- `classifyAll` is from `archetypeClassifier.js` — a separate failure archetype system, **not** the new dimension classifier.
- No per-trade classification tags rendered in the trade list.
- **Phase 2 insertion point:** `classifyAll` pipeline step or filter panel could incorporate entry_context tags to segment failure archetypes by AAE/ob_not_occupied context.

### 5. EntriesLab.jsx / EntriesWorkspace

Routes to `EntriesWorkspace`. Trade source: `useTradeUniverse()`. Session/direction filters via `useEntryWorkspace`. No per-trade classification tags currently rendered. Phase 2+ target.

---

## C. Badge / Chip / Pill Components

### `Pill` — `components/lab/DataTable.jsx` ✅ PRIMARY

```jsx
export function Pill({ children, tone = "muted", className }) {
    const toneClass = { muted:"row-chip-muted", primary:"row-chip-primary",
        secondary:"row-chip-secondary", info:"row-chip-info",
        success:"row-chip-success", danger:"row-chip-danger", warning:"row-chip-warning"
    }[tone] || "row-chip-muted";
    return <span className={cn("row-chip", toneClass, className)}>{children}</span>;
}
```

The correct component for all `ClassificationBadge` renders. Theme-responsive via CSS variables.

### `FilterToggle` — `components/lab/controls.jsx` ✅ FOR FILTER BARS

Toggle chip for classification filter panels in Phase 2. Props: `active`, `onClick`, `tone`, `size` (`default|compact`), `dot`. Tones: `primary|success|danger|warning|muted`.

### `HeroBadge` — `components/lab/controls.jsx` ⛔ NOT FOR CLASSIFICATION

Hero-section-only badge. `rounded-[3px]` with different sizing. Not suitable for inline trade table tags.

### `TradeUniverseBadge` — `components/lab/TradeUniverseBadge.jsx` ⛔ NOT FOR CLASSIFICATION

Scope chip showing run/scenario context (e.g. "TE D2"). Uses internal `BadgeCell` with inline CSS variables. Already used across StrategyMap, FailuresWorkspace, HypothesisLab, etc. Not a general-purpose tag component.

### `Badge` — `components/ui/badge.jsx` ⛔ DO NOT USE

shadcn `Badge` component. Variants: `default|secondary|destructive|outline`. Uses Tailwind `bg-primary` etc. — not aligned to the `row-chip` CSS variable system. Would look wrong in all 6 themes. Not used anywhere in the lab for trade tags.

### `ClassificationBadge` — `components/lab/ClassificationBadge.jsx` ✅ NEW (Phase 1)

Wraps `Pill` + `getTagMeta()`. Filters `"clean"`. Safe fallback for unknown tags. Accept `tag` (single) or `tags` (array).

---

## D. App Structure, Routing, and Theme

### Routing (App.js)

```
/runs/:runId        → RunDetail
/trade-inspector    → TradeInspector
/strategy-map       → StrategyMap
```

All routes wrapped in `<RouteErrorBoundary>` inside `<AppShell>`. `<ThemeProvider>` at root.

### Shell (AppShell.jsx)

```jsx
<MasterControlsProvider>
  <div className="min-h-screen flex bg-[#050A12]">
    <AppBlueprintBackground />
    <Sidebar />
    <div className="flex-1 flex flex-col">
      <TopBar />
      <main className="flex-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
        {children}
      </main>
    </div>
    <MasterControlsDrawer />
  </div>
</MasterControlsProvider>
```

`PageHeader` also exported — provides `eyebrow`, `title`, `subtitle`, `actions` layout. Available for classification summary panels in Phase 3.

### Theme System (ThemeContext.jsx + index.css)

- 6 themes: `violet`, `emerald`, `amber`, `ice`, `blood`, `terminal`.
- Applied as `data-theme` on `<html>`. Stored in `localStorage["fxob_theme"]`.
- All tokens are HSL values: `--success`, `--danger`, `--warning`, `--info`, `--accent-primary`, `--accent-secondary`, `--text-1/2/3`, `--panel`, `--border`.
- The `terminal` theme calms down semantic colors but uses the same variable names.
- `.row-chip` + `.row-chip-muted/primary/secondary/info/success/danger/warning` fully defined in all themes.
- `.divider-glow` class available for section separators.

### Config Registry (configRegistry.js)

`CONFIG_REGISTRY` array of StrategyBuilder config field descriptors. Unrelated to trade classification. No interference.

---

## E. CSS Token/Styling Rules for Classification Badges

All classification badge styling must use these rules:

- **Always use `Pill` from `DataTable.jsx`** — never inline styles, never shadcn `Badge`.
- **Tone mapping** (from `classificationRegistry.js`):
  - `entry_model`: `muted` (baseline), `info` (te_*), `primary` (ep_*)
  - `entry_context`: `warning` (aae, ob_not_occupied), `muted` (clean — not rendered)
  - `exit_type`: `success` (tp_hit), `danger` (sl_hit), `warning` (news_flatten, news_cancel), `secondary` (protection_exit), `muted` (everything else)
- **CSS class pattern:** `row-chip row-chip-{tone}` — handled automatically by `Pill`.
- Use `gap-1 flex-wrap` when rendering multiple context tags side by side.
- Use `.divider-glow` separator before classification section in detail panels.

---

## F. Recommended Phase 2 Insertion Points

### F1. RunDetail Ledger — Classification Column + Filter Bar

**File:** `frontend/src/pages/RunDetail.jsx`

1. Add a `Classification` column to the ledger `DataTable` columns array:
   ```jsx
   { key: "entry_model", label: "Model", render: (r) => {
       const cls = buildTradeClassification(r);
       return <div className="flex gap-1 flex-wrap">
           <ClassificationBadge tag={cls.entry_model} />
           {cls.entry_context.filter(t => t !== "clean").map(t =>
               <ClassificationBadge key={t} tag={t} />
           )}
       </div>;
   }}
   ```

2. Add filter state (`ledgerModelFilter`, `ledgerContextFilter`) alongside existing filter state.

3. Add `FilterToggle` chips for entry_model and entry_context to the ledger filter bar.

4. Add classification predicates to `filteredLedgerRows` filter chain.

### F2. StrategyMap Trade List

**File:** `frontend/src/pages/StrategyMap.jsx` — `StrategyTradeListPanel` component (~line 1667)

Add entry model badge to each trade row alongside the existing outcome `Pill`. Low insertion cost — the row already has `flex` layout.

### F3. applyClassificationFilter.js (new file)

**Path:** `frontend/src/data/applyClassificationFilter.js`

Pure filter function: `applyClassificationFilter(trades, { entryModels, entryContexts, exitTypes })`. Used by RunDetail, StrategyMap, and future pages. Avoids duplicating predicate logic across pages.

### F4. FailuresWorkspace (optional Phase 2+)

The `applyFilter` step in the failures pipeline could accept classification predicates to let users segment failure archetypes by entry context (e.g., "show only AAE losses"). Non-breaking addition to `useFailuresWorkspace` filter state.

---

## G. Files to Create / Edit in Phase 2

| Action | File | Notes |
|--------|------|-------|
| Create | `data/applyClassificationFilter.js` | Pure filter, no React |
| Edit | `pages/RunDetail.jsx` | Add column + FilterToggle chips + filter state |
| Edit | `pages/StrategyMap.jsx` | Add ClassificationBadge to StrategyTradeListPanel |
| Create | `components/lab/ClassificationFilterBar.jsx` | (optional) Reusable filter chip group |

---

## H. What to Avoid

- **Do not use `Badge` from `components/ui/badge.jsx`** for trade classification. It is a generic shadcn component with Tailwind `bg-primary` variants that do not align to the `row-chip` CSS variable theme system.
- **Do not modify `tradeClassification.js`**. It is a separate orthogonal system (`classifyTrade()` → WIN/LOSS outcome categories). Naming collision risk.
- **Do not modify `store.js` or `importer.js`** for Phase 1/2. Classification is derived at the view layer from existing fields.
- **Do not use `HeroBadge`** for inline trade table tags. It is a hero-section-only component.
- **Do not use `TradeUniverseBadge`** for trade dimension tags. It is a scope chip for run/scenario context, not per-trade metadata.
- **Do not add classification fields to `CONFIG_REGISTRY`**. That registry is for StrategyBuilder backtest config parameters.
- **Do not persist classification filter state to localStorage** in Phase 2. Match the existing RunDetail pattern (local `useState`). If persistence is desired later, use a dedicated key like `fxob_classification_filters_v1`.

---

## I. Final Recommendation

**Phase 1 is complete.** Three new files created (`classificationRegistry.js`, `tradeClassificationDims.js`, `ClassificationBadge.jsx`) and one edited (`TradeInspector.jsx`). All 7 node assertion tests passed. Zero regressions confirmed by git diff.

**Phase 2 priority order:**

1. `applyClassificationFilter.js` — write once, use everywhere. No UI, pure logic.
2. RunDetail ledger classification column — highest-visibility surface; most users start here.
3. RunDetail classification filter chips — follow immediately after the column.
4. StrategyMap trade list badge — low-cost, high value for visual chart-to-list correlation.

**Architecture note for Phase 3+ (ClassificationSummaryPanel, ClassificationPerfTable):**

These panels will consume `CLASSIFICATION_DIMENSIONS` and `CLASSIFICATION_TAGS` from `classificationRegistry.js` directly for layout/grouping — no hardcoded dimension lists anywhere. `buildTradeClassification()` will be called via `useMemo` over `displayTrades` to produce a pre-classified array, then aggregated into per-key stats. The `key` field on the classification object (`"te_d2|aae|tp_hit|baseline"`) is designed for this aggregation step.
