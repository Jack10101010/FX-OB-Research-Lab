# TRADE-CLASSIFICATION-PHASE-1-PLAN

**Mode:** Implementation Plan Only — no code written  
**Date:** 2026-06-05  
**Architecture source:** TRADE-CLASSIFICATION-SYSTEM-1.md  
**Codebase read:** TradeInspector.jsx, tradeClassification.js, importer.js, DataTable.jsx, index.css, controls.jsx

---

## 1. Files to Read Before Writing Any Code

These must be read in full before implementation begins. They contain APIs that Phase 1 depends on.

| File | Why |
|------|-----|
| `frontend/src/data/tradeClassification.js` | Exports `classifyTrade()` — naming collision with the new system. Must read the full function body (lines 166–230) to understand existing category strings and ensure no breakage. Also confirms `categoryPillTone()` and `displayOutcomeLabel()` APIs. |
| `frontend/src/pages/TradeInspector.jsx` | Lines 370–395: the detail panel `<Row>` pattern. Exact insertion point for classification rows. Lines 235–260: trade list row structure for optional badge addition. |
| `frontend/src/components/lab/DataTable.jsx` | Confirm `Pill` tone values and props interface. Verify `Pill` accepts `className` if micro-spacing is needed. |
| `frontend/src/data/importer.js` | Lines 383–445: confirm all AAE field names. Confirmed: both snake_case (`armed_after_ob_exit`) and camelCase (`armedAfterObExit`) exist on every trade object. Lines 756–774: `normalizeEntryModeKey()` — understand canonical key format for entry_model derivation. |
| `frontend/src/data/store.js` | Confirm there is no existing `classification` field on the trade object that could collide. Confirm `useTradeUniverse()` is the right hook to use in tests. |
| `frontend/src/index.css` | Confirm the exact CSS token names for amber/violet/teal that map to warning/secondary/info — needed for registry color assignments. |

---

## 2. Files to Create

### `frontend/src/data/classificationRegistry.js`

Single source of truth for all classification metadata. **No logic, only data.**

Contains:
- `CLASSIFICATION_DIMENSIONS` — ordered dimension definitions
- `CLASSIFICATION_TAGS` — tag metadata: `{ dim, label, tone, supportingFields, description }`

**Critical:** `tone` values must map to existing `Pill` tones (`success`, `danger`, `warning`, `muted`, `primary`, `secondary`, `info`). No new colors, no hex codes.

Planned tag set for Phase 1:

```
Dim: entry_model
  "baseline"    → tone: "muted"
  "te_same"     → tone: "info"
  "te_next"     → tone: "info"
  "te_d2"       → tone: "info"
  "te_d3"       → tone: "info"
  "ep_25"       → tone: "primary"
  "ep_50"       → tone: "primary"
  "ep_75"       → tone: "primary"
  "ep_100"      → tone: "primary"
  "unknown_model" → tone: "muted"

Dim: entry_context
  "clean"           → tone: "muted"    (not rendered in Phase 1, default state)
  "aae"             → tone: "warning"   supportingFields: [armedAfterObExit, obOccupiedAtArm,
                                          priceDistanceFromObAtArmPips, armCandleIndex, ob_exit_time]
  "ob_not_occupied" → tone: "warning"   supportingFields: [obOccupiedAtArm,
                                          priceDistanceFromObAtArmPips]

Dim: exit_type
  "tp_hit"           → tone: "success"
  "sl_hit"           → tone: "danger"
  "breakeven"        → tone: "muted"
  "news_flatten"     → tone: "warning"
  "news_cancel"      → tone: "warning"
  "protection_exit"  → tone: "secondary"
  "session_cancel"   → tone: "muted"
  "reverse_cancel"   → tone: "muted"
  "invalid"          → tone: "muted"
  "unfilled"         → tone: "muted"
  "unknown_exit"     → tone: "muted"
```

`protection_mode` dimension is registered in the file but no tags beyond `"baseline"` are implemented in Phase 1 (deferred, see §5).

---

### `frontend/src/data/tradeClassificationDims.js`

**Name chosen deliberately to avoid collision** with existing `tradeClassification.js` which exports `classifyTrade()`. This new file exports `buildTradeClassification()`.

A pure function with no side effects, no imports from store or React.

```js
// import { CLASSIFICATION_TAGS } from "./classificationRegistry.js";

export function buildTradeClassification(trade) {
  return {
    entry_model:     deriveEntryModel(trade),
    entry_context:   deriveEntryContext(trade),   // string[]
    exit_type:       deriveExitType(trade),
    protection_mode: deriveProtectionMode(trade),
    key: /* composite string */,
  };
}
```

**Derivation rules for entry_model** (based on `trade.entry_model_key`):

```
contains "_next"           → "te_next"
contains "_d2"             → "te_d2"
contains "_d3"             → "te_d3"
contains "_same"           → "te_same"
contains "triggered_edge"  → "te_same"   (fallback, no suffix)
matches /penetration_(\d+)/→ "ep_N"      (extract N from key)
=== "baseline" OR empty    → "baseline"
else                       → "unknown_model"
```

**Derivation rules for entry_context** (evaluated in order; multiple can apply):

```
trade.armedAfterObExit === true
  → push "aae"

trade.obOccupiedAtArm === false AND trade.armedAfterObExit !== true
  → push "ob_not_occupied"

if context array is still empty
  → push "clean"
```

Note on null safety: all boolean fields from the importer return `true | false | null`. The condition `=== true` is intentional — null/undefined do not qualify.

**Derivation rules for exit_type** (uses existing normalized outcome, not raw):

```
trade.outcome === "Win" (case-insensitive)              → "tp_hit"
trade.outcome === "Loss"                                 → "sl_hit"
trade.outcome contains "news_flatten" (case-insensitive)→ "news_flatten"
protection_exit_reason is non-empty                      → "protection_exit"
outcome contains "cancel"/"cancelled"                    → "news_cancel" | "session_cancel" | "reverse_cancel"
outcome contains "invalid"/"invalidated"                 → "invalid"
entry_model_filled === false OR outcome "unfilled"       → "unfilled"
else                                                     → "unknown_exit"
```

**Derivation rules for protection_mode** (Phase 1 only):

```
if no protection columns or protection_mode === "baseline"  → "baseline"
```

Full protection tag logic deferred to Phase 2.

**Backwards compatibility:** every rule starts with a null/undefined guard. A trade with no AAE columns classifies as `entry_context: ["clean"]` — this is the correct default.

---

### `frontend/src/components/lab/ClassificationBadge.jsx`

Single reusable component. Renders one or more classification tags as `<Pill>` elements.

```jsx
// <ClassificationBadge tag="aae" />
//   → one pill: [AAE]

// <ClassificationBadge tags={["aae", "ob_not_occupied"]} />
//   → two pills side by side

// <ClassificationBadge tag="clean" />
//   → renders nothing (clean is the absence of tags)
```

Internal logic:
- Looks up tag in `CLASSIFICATION_TAGS`
- Uses `tone` from registry → passes to `<Pill>`
- If tag not found in registry → renders muted pill with raw tag string (safe fallback)
- Does not import from store, context, or router — pure presentational

**No new CSS.** Uses only existing `Pill` tones from DataTable.jsx.

---

## 3. Files to Edit

### `frontend/src/pages/TradeInspector.jsx`

**One targeted insertion block only.** Add classification rows to the trade detail panel (right side), after the existing "Outcome" row (approximately line 387).

No changes to:
- Trade list items (left panel) — deferred
- Filter bar — deferred
- Any imports outside the new files
- Chart or verifier sections

**Import additions (2 lines at top of file):**
```js
import { buildTradeClassification } from "@/data/tradeClassificationDims";
import { ClassificationBadge } from "@/components/lab/ClassificationBadge";
```

**Insertion in detail panel** (inside the `trade &&` block, after existing Outcome row):
```jsx
{/* Trade Classification — Phase 1 */}
{(() => {
  const cls = buildTradeClassification(trade);
  return (
    <>
      <div className="divider-glow my-2" />
      <Row k="Entry Model" v={<ClassificationBadge tag={cls.entry_model} />} />
      {cls.entry_context.some(t => t !== "clean") && (
        <Row k="Entry Context" v={
          <div className="flex gap-1 flex-wrap">
            {cls.entry_context
              .filter(t => t !== "clean")
              .map(t => <ClassificationBadge key={t} tag={t} />)
            }
          </div>
        } />
      )}
      <Row k="Exit Type" v={<ClassificationBadge tag={cls.exit_type} />} />
    </>
  );
})()}
```

**Why an IIFE:** avoids adding a new state variable or derived value at the top of the component (which is already large at 932 lines). An inline call is surgical and contained. If the component is later refactored, it's easy to extract.

**Why "Entry Context" row is conditional:** clean is the default state and adds no signal. Showing it would add a row saying "Clean" on every baseline trade — visual noise.

**What this does NOT touch:**
- `getTradeStatus()` — not modified
- Existing `Pill` usage for Outcome/Status/Mapping — not modified
- Filter state or `filtered` useMemo — not modified
- Any other page (RunDetail, StrategyMap, etc.) — not modified

---

## 4. Exact Phase 1 Scope

```
classificationRegistry.js
  ├── CLASSIFICATION_DIMENSIONS        (4 dims, ordered)
  ├── CLASSIFICATION_TAGS              (all tags listed in §2, ~20 tags)
  └── getTagMeta(tag)                  (safe lookup with muted fallback)

tradeClassificationDims.js
  ├── buildTradeClassification(trade)  (main export)
  ├── deriveEntryModel(trade)          (internal)
  ├── deriveEntryContext(trade)        (internal, multi-value)
  ├── deriveExitType(trade)            (internal)
  └── deriveProtectionMode(trade)      (internal, baseline-only stub)

ClassificationBadge.jsx
  ├── ClassificationBadge({ tag })     (single tag)
  └── (multi-tag via props.tags)       (optional convenience)

TradeInspector.jsx
  ├── +import buildTradeClassification
  ├── +import ClassificationBadge
  └── +3 Row elements in detail panel  (Entry Model, Entry Context, Exit Type)
```

**Total new code:** ~180–220 lines across 3 new files + ~12 lines edited in TradeInspector.jsx.

---

## 5. Explicit Deferrals

| Item | Deferred To | Reason |
|------|------------|--------|
| `applyClassificationFilter.js` | Phase 2 | Filtering logic not needed until filter UI exists |
| Filter UI in TradeInspector (dropdown/toggle) | Phase 2 | Sorting out filter state model first |
| Classification badges in trade list items (left panel) | Phase 2 | Visual density risk; needs design review |
| `protection_mode` full tag set | Phase 2 | Requires reading protection-specific columns more carefully |
| `ClassificationSummaryPanel` (Run Detail analytics) | Phase 3 | Depends on filter working end-to-end first |
| `ClassificationPerfTable` analytics | Phase 3 | Same |
| Strategy Map integration | Phase 4 | Separate surface, separate PR |
| Heatmap / bar chart components | Phase 4+ | Requires statistical significance validation |
| `rearmed`, `high_fill_delay`, `news_paused_entry` context tags | Phase 2 | Low priority until there's data to show them |
| Trade list item context badge (left panel sidebar) | Phase 2 | Design review needed — noise risk on clean trades |
| URL-persisted filter state | Phase 2 | Overkill without filter UI |
| Classification composite key analytics | Phase 3 | Not useful until analytics panel exists |

---

## 6. Risks and Compatibility Concerns

### Risk 1 — Name collision with existing `classifyTrade`
`tradeClassification.js` already exports `classifyTrade(trade)` (returns a category string). The new file is deliberately named `tradeClassificationDims.js` and exports `buildTradeClassification(trade)`. These are different functions with different return types. However, auto-import tools in VS Code might suggest the wrong one. **Mitigation:** Name both clearly and add a JSDoc comment at the top of each: `// This is the OUTCOME classifier (WIN/LOSS/etc.) — not the dimension classifier`.

### Risk 2 — Field name uncertainty on older bundles
AAE fields (`armed_after_ob_exit`, `ob_occupied_at_arm`) were added to the importer recently (confirmed in importer.js lines 436–441). Bundles imported before that version will have these fields as `undefined` on trade objects, not `false`. **Mitigation:** All derivation rules use `=== true` (strict equality), so `undefined` and `null` evaluate as false correctly. Test explicitly with an old bundle.

### Risk 3 — `entry_model_key` empty on baseline trades
In baseline CSVs, `entry_model_key` may be `""` or `null` (the row describes a baseline trade with no entry model variant). **Mitigation:** `deriveEntryModel()` treats empty string / null / undefined → `"baseline"`. Confirmed from importer line 386: `String(pick(r, "entry_model_key", "entryModelKey") || "")` — empty string is the fallback.

### Risk 4 — TradeInspector IIFE in JSX
Some linters warn on IIFEs inside JSX render. If the project uses ESLint with `no-restricted-syntax`, the IIFE may need to be extracted to a local variable or a helper component. **Mitigation:** Check ESLint config before writing the insertion. If needed, replace with `const cls = buildTradeClassification(trade)` outside the return statement instead.

### Risk 5 — `Pill` tone exhaustion
The Pill component supports: `muted`, `primary`, `secondary`, `info`, `success`, `danger`, `warning`. The tag set uses all of these. If a future tag needs a new visual tone, that requires either reusing an existing one (acceptable) or extending Pill (out of Phase 1 scope). **Mitigation:** The registry maps tones; if a mapping feels wrong it can be changed in one place.

---

## 7. Validation Checklist

### After creating the three new files (before touching TradeInspector):

```bash
# From frontend/
node -e "
const { buildTradeClassification } = require('./src/data/tradeClassificationDims');

// Test 1: TE d2 with AAE
const t1 = { entry_model_key: 'entry_triggered_edge_25p0_d2', armedAfterObExit: true, obOccupiedAtArm: false, outcome: 'Win' };
const c1 = buildTradeClassification(t1);
console.assert(c1.entry_model === 'te_d2', 'entry_model');
console.assert(c1.entry_context.includes('aae'), 'aae context');
console.assert(c1.exit_type === 'tp_hit', 'exit type');

// Test 2: Baseline clean loss
const t2 = { entry_model_key: '', outcome: 'Loss' };
const c2 = buildTradeClassification(t2);
console.assert(c2.entry_model === 'baseline', 'baseline model');
console.assert(c2.entry_context.includes('clean'), 'clean context');
console.assert(c2.exit_type === 'sl_hit', 'sl exit type');

// Test 3: Old bundle trade (no AAE fields)
const t3 = { entry_model_key: 'entry_triggered_edge_25p0_next', outcome: 'Win' };
const c3 = buildTradeClassification(t3);
console.assert(c3.entry_context.includes('clean'), 'old bundle defaults to clean');

console.log('All assertions passed');
"
```

### After editing TradeInspector.jsx:

```bash
# Dev server
cd frontend && npm start

# Check 1: Load any run bundle → Trade Detail shows "Entry Model", "Exit Type" rows
# Check 2: Load TE d2/d3 bundle with AAE trade → "Entry Context" row appears with [AAE] pill
# Check 3: Load TE d2/d3 bundle with clean trade → "Entry Context" row is absent (not showing "Clean")
# Check 4: Load old pre-AAE bundle → no errors, rows show with baseline/clean/tp_hit defaults
# Check 5: Switch theme (violet → amber) → badge colors update correctly via CSS tokens
# Check 6: Open browser console → zero errors, zero prop-type warnings on new components
# Check 7: Navigate to RunDetail, StrategyMap → no changes, no regressions
```

### Regression check:
```bash
# Ensure existing tradeClassification.js is untouched
git diff frontend/src/data/tradeClassification.js
# Expected: no diff

# Ensure store.js is untouched
git diff frontend/src/data/store.js
# Expected: no diff
```

---

## 8. Implementation Order

Execute in this order to keep the app in a valid state at every step:

```
Step 1  Create classificationRegistry.js          (no deps — can be created first)
Step 2  Create tradeClassificationDims.js          (depends on classificationRegistry)
Step 3  Run node assertion tests (§7 first block)  (validate logic before any UI)
Step 4  Create ClassificationBadge.jsx             (depends on registry)
Step 5  Edit TradeInspector.jsx                    (last — depends on steps 1-4)
Step 6  Run full validation checklist (§7)
```

Do not skip step 3. The derivation logic is the load-bearing part of Phase 1. A silent wrong classification is worse than a visible error.

---

*Next phase after Phase 1 validates: add classification filter UI to TradeInspector, then port the summary panel to RunDetail.*
