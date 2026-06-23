# BE-REPLAY-PHASE-1.5-SANITY-AUDIT-AND-UI-PLAN-1.md

**Mode:** AUDIT / PLAN ONLY — no implementation, no files changed.  
**Date:** 2026-06-10 · **Branch:** `codex-dev`  
**Prereqs read:**
- `frontend/src/data/beReplay.js` — Phase 1 engine
- `frontend/src/data/__validation__/beReplay.validate.mjs` — 18-section, 57-assertion suite
- `BE-REPLAY-PROTECTION-ARCHITECTURE-AUDIT-1.md` — architecture spec
- `BE-REPLAY-PHASE-0-EXPORT-FIELD-AUDIT-1.md` — export field coverage audit
- `frontend/src/pages/ProtectionLab.jsx` — full file (2251 lines)
- `frontend/src/components/lab/protection/protectionAnalytics.js` — analytics module
- `frontend/src/components/lab/fft/FftProtectionTab.jsx` — architectural model for new tabs
- `frontend/src/data/store.js` — `useDataset`, `CANDLES` derivation
- `test_import_bundle/trades_single_position.csv` — 150 rows, 58 columns
- `test_import_bundle/candles.csv` — 24,909 rows, 15-min bars

---

## PHASE A — Engine State Confirmation

### A.1 Engine exists
`frontend/src/data/beReplay.js` — 631 lines. Pure functions, no React, no external imports.

### A.2 Not wired to UI
No imports of `beReplay.js` anywhere in `src/pages/`, `src/components/`, or `src/data/store.js`.
Zero callers outside the validation suite. The file is production-ready but dark.

### A.3 Time-based candle lookup confirmed
- `buildReplayCandleIndex` builds `Map<epochSec→rowIndex>` from candle timestamps.
- `resolveTradeCandleWindow` calls `findNearestPrior` (binary search, nearest-prior) for both fill and exit.
- `fill_candle_index` / `exit_candle_index` are never used as array positions — only stored on trade objects and ignored by the engine.
- Phase K of the validation suite specifically proves this with `fill_candle_index=999999`.

### A.4 Validation passes
All 57 assertions pass across 18 sections (A–S). Run confirmed this session:
```
  ✓ ALL ASSERTIONS PASSED
```

### A.5 Scenario summary data exposed
`buildBeScenarioSummary` returns a complete metrics object including all required UI fields:
- `netR`, `deltaNetR`, `profitFactor`, `maxDrawdown`, `worstLossStreak`
- `tradeCount`, `replayedCount`, `coveragePct`, `missingPathCount`, `outOfRangeCount`
- `lossesSaved`, `winnersCut`, `winnerRCost`, `loserRSaved`, `efficiencyRatio`
- `beExitCount`, `sameCandleAmbiguousCount`
- `equityCurve` — `[{i, netR}]` array suitable for sparkline / chart overlay

---

## PHASE B — Real-Run Sanity Audit

### B.1 Test bundle
- **Trades:** `test_import_bundle/trades_single_position.csv` — 150 rows; 41 WIN, 96 LOSS, 11 UNFILLED, 2 REVERSE_TOUCH_CANCEL
- **Active for replay:** 137 WIN+LOSS rows with full price and time data
- **Candles:** 24,909 rows, 15-min bars, 2025-05-18 → 2026-05-18
- **Settings:** stopMode=entry · triggerBasis=wick · delayCandles=0 · bufferR=0R

### B.2 Baseline
| Metric | Value |
|---|---|
| N | 137 |
| Wins / Losses | 41 / 96 |
| Win Rate | 30.0% |
| Net R | +39.30 |
| Profit Factor | 1.409 |
| Max Drawdown | -12.70 |
| Worst Loss Streak | 9 |
| Avg winner R | ~3.30 |
| Avg loser R | ~1.00 |

This is a high-RR strategy: winners average ~3.3R. This framing is important for interpreting BE results.

### B.3 Sanity table (6 arm levels)

| Arm | Net R | Δ Net R | PF | Max DD | WStrk | Saved | Cut | WR Cost | LR Saved | Eff Ratio | BE Exits | Same-Candle | Cov% |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.25R | 7.50 | **-31.80** | 1.18 | -14.40 | 4 | 54 | 26 | 85.80 | 54.00 | 0.63 | 80 | **64** | 77.4% |
| 0.5R | 8.10 | **-31.20** | 1.17 | -15.40 | 4 | 48 | 24 | 79.20 | 48.00 | 0.61 | 72 | **49** | 77.4% |
| 0.75R | 1.70 | **-37.60** | 1.03 | -19.40 | 6 | 35 | 22 | 72.60 | 35.00 | 0.48 | 57 | 27 | 77.4% |
| 1R | -2.70 | **-42.00** | 0.96 | -20.80 | 7 | 24 | 20 | 66.00 | 24.00 | 0.36 | 44 | 16 | 77.4% |
| 1.5R | 13.40 | **-25.90** | 1.17 | -16.40 | 7 | 17 | 13 | 42.90 | 17.00 | 0.40 | 30 | 9 | 77.4% |
| 2R | 22.90 | **-16.40** | 1.27 | -11.10 | 7 | 10 | 8 | 26.40 | 10.00 | 0.38 | 18 | 7 | 77.4% |

### B.4 Outcome breakdown

| Arm | original_loser | be_stopped_loss_saved | original_winner | be_stopped_winner_cut | unchanged_missing_path |
|---|---|---|---|---|---|
| 0.25R | 17 | 54 | 9 | 26 | 31 |
| 0.5R | 23 | 48 | 11 | 24 | 31 |
| 0.75R | 36 | 35 | 13 | 22 | 31 |
| 1R | 47 | 24 | 15 | 20 | 31 |
| 1.5R | 54 | 17 | 22 | 13 | 31 |
| 2R | 61 | 10 | 27 | 8 | 31 |

*Note: `be_armed_never_triggered` is absent from all scenarios. When an arm fires on this dataset, the trade always resolves to either BE stop or TP within the candle window.*

### B.5 Missing path analysis
All 31 `unchanged_missing_path` trades are `zero_length` (fill and exit resolve to the same 15-min candle bar). This is a structural condition: trades that filled and exited intra-bar. All are within the candle date range. They have not missing timestamps — their window is simply too short for a candle walk. Coverage 77.4% = 106/137 is clean and explainable.

### B.6 Sanity check results

**Check: tighter arm saves more losers, cuts more winners**  
✅ PASS — strict monotonic decrease in both lossesSaved (54→48→35→24→17→10) and winnersCut (26→24→22→20→13→8) as arm tightens.

**Check: BE exits decrease as arm is tightened**  
✅ PASS — 80→72→57→44→30→18, smooth decay.

**Check: coverage is consistent**  
✅ PASS — 77.4% at all 6 levels (as expected: missing-path is resolution-dependent, not arm-level-dependent).

**Check: no suspicious "everything improves" result**  
✅ PASS — delta is NEGATIVE at all 6 levels. BE protection hurts this particular run. This is the correct research finding for a high-RR strategy where average winners (3.3R) significantly outweigh average losers (1.0R). The efficiency ratio never exceeds 0.63 — for every R spent on winner cuts, less than 0.63R is recovered from saved losers.

**Check: no obvious discontinuities**  
✅ PASS with one note. The NetR is not fully monotonic (0.25R=7.50, 0.5R=8.10, then valley at 1R=-2.70, then recovery at 1.5R/2R). This U-shape is explainable:
- 0.25R → 0.5R: slight NetR increase because 0.25R arms too easily; for 6 extra BE exits, 6 more losers saved but only 2 more winners cut. Net slightly better.
- 0.75R–1R valley: the arm level falls in a zone where enough losers reach it to trigger BE costs on winners (winners tend to push well past 1R before TP), without saving enough losers to compensate.
- 1.5R–2R recovery: arm fires rarely; when it does, it fires on trades that went deep positive, so most are winners that ran to TP first (fewer cuts), and the few losers that reached 1.5–2R are genuinely saved.
This is NOT an engine bug — it is strategy-specific behavior consistent with a 3.3R average winner.

**Check: same-candle ambiguity handling**  
⚠️ HIGH RATE at tight arm levels. At 0.25R, 64/80 BE exits (80%) are same-candle ambiguous. At 0.5R, 49/72 (68%). This is correct and expected: with a tight arm, the arm price and BE stop (entry) can both be hit within a single 15-min bar. The engine conservatively assigns BE stop as triggered first. **The UI must prominently disclose this.**

**Overall sanity verdict:** Results are internally consistent, directionally plausible, and match the expected profile of a high-RR strategy. No suspicious outputs. The engine is working correctly.

---

## PHASE C — Protection Lab UI Architecture Findings

### C.1 Current tab structure
```
ProtectionLab.jsx  →  PROT_TABS = [
    { key: "overview",  label: "Overview",       hint: "Decision" },
    { key: "deepdive",  label: "Deep dive",       hint: "Analysis" },
    { key: "research",  label: "Research",        hint: "Experimentation" },
    { key: "fft",       label: "FFT Protection",  hint: "Cancel impact" },
]
```
Tab rendering pattern: `{protTab === "xxx" && (<>...</>)}` conditional blocks.  
Tab state: `const [protTab, setProtTab] = React.useState(initialProtTab)` with deep-link support via `searchParams.get("tab")`.

### C.2 Where the Break-even tab is added
- Add `{ key: "breakeven", label: "Break-even", hint: "Candle replay" }` to `PROT_TABS`.
- Add `"breakeven"` to `PROT_TAB_KEYS`.
- Add rendering block: `{protTab === "breakeven" && <BeReplayTab trades={trades} candles={candles} />}`.
- No deep-link handling needed for V1 (can be added later like the `?tab=fft` pattern).

### C.3 Data access for Break-even tab
**Currently destructured from `useDataset()` in ProtectionLab** (line 89):
```js
const { ACTIVE_PROJECT, ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, activeRunId, runs } = useDataset();
```
**Change needed:** add `CANDLES` to this destructure.  
`CANDLES` is already computed in the store (line 973 of store.js):
```js
CANDLES: active?.candles?.length ? active.candles : [],
```
So: `const { ..., CANDLES } = useDataset()` gives immediate access to the parsed candles array.

**Derived `candles` variable** (to pass to the tab):
```js
const candles = React.useMemo(() => (Array.isArray(CANDLES) ? CANDLES : []), [CANDLES]);
```
This mirrors the `trades` memo already at line 90.

### C.4 Gate on missing candles / old exports
The store already has `activeRun.hasCandles` (boolean). Two-layer gate:
1. `activeRun?.hasCandles` — the importer set this flag when candles.csv was present in the bundle
2. `candles.length > 0` — confirms actual data was loaded
3. `beReplayAvailability(trades, candles)` — engine-level gate checks fill/exit times, returns `{ available, reason, coveragePct }`

Gate logic should be inside `BeReplayTab` (not in ProtectionLab), to keep the parent clean.

### C.5 Reusable components
From ProtectionLab.jsx, available for reuse:
- `NeonPanel` — primary panel wrapper  
- `MetricChip` — KPI tiles  
- `DataTable` + `ColoredR` + `Pill` — tables with colored R values  
- `ConfidenceTag` — EXACT / RESEARCH ESTIMATE / DATA REQUIRED badges  
- `Note` — warning / muted footnotes  
- `Desc` — icon + description row  
- `ProtectionSectionDivider` — zone header dividers  
- All CSS variable tokens (--success, --danger, --warning, --accent-primary, etc.)

### C.6 Computation location
**In `BeReplayTab` child component** (not in ProtectionLab). Reasoning:
- Computation is expensive (6 × `replayBeScenario` across 137 trades × 24,909 candles). Should only run when the tab is rendered (not on every ProtectionLab render).
- Follows the FftProtectionTab model: `FftProtectionTab` receives `runId`, calls `getRunData` internally, and handles its own state.
- `BeReplayTab` will receive `trades` and `candles` as props. It uses `useMemo` to run scenarios once when props change.

### C.7 FftProtectionTab architectural model
`FftProtectionTab` receives `{ runId }` → calls `getRunData(runId)` internally → owns all scenario state. This is a clean separation.

For `BeReplayTab`, the equivalent is: receives `{ trades, candles }` → owns `armLevelR` selector state → runs engine internally → renders results.

---

## PHASE D — Break-even Tab Implementation Plan

### D.1 Files to create
```
frontend/src/components/lab/protection/BreakevenTab.jsx   — new, main component
```
*(Optional but recommended)*
```
frontend/src/data/useBeReplayScenarios.js                 — custom hook for 6-scenario memoized compute
```

### D.2 Files to edit
```
frontend/src/pages/ProtectionLab.jsx                      — 4 targeted changes only
```

### D.3 ProtectionLab.jsx changes (scoped)

**Change 1 — import** (after FftProtectionTab import, line 22):
```js
import { BreakevenTab } from "@/components/lab/protection/BreakevenTab";
```

**Change 2 — destructure CANDLES** (line 89):
```js
const { ACTIVE_PROJECT, ACTIVE_RUN, TRADES, ACTIVE_TRADE_VARIANT, activeRunId, runs, CANDLES } = useDataset();
```

**Change 3 — candles memo** (after `trades` memo, line 90):
```js
const candles = React.useMemo(() => (Array.isArray(CANDLES) ? CANDLES : []), [CANDLES]);
```

**Change 4 — PROT_TABS + rendering** (lines 664–669 for tab array, and ~line 637 for rendering):
```js
const PROT_TABS = [
    { key: "overview",  label: "Overview",    hint: "Decision" },
    { key: "deepdive",  label: "Deep dive",   hint: "Analysis" },
    { key: "research",  label: "Research",    hint: "Experimentation" },
    { key: "fft",       label: "FFT Protection", hint: "Cancel impact" },
    { key: "breakeven", label: "Break-even",  hint: "Candle replay" },   // ADD
];
```
```js
{/* ════════════════ BREAK-EVEN REPLAY ════════════════ */}
{protTab === "breakeven" && (
    <div className="px-6">
        <BreakevenTab trades={trades} candles={candles} />
    </div>
)}
```

### D.4 BreakevenTab.jsx — V1 layout spec

#### Section 0 — Data gate
When `candles.length === 0` or `beReplayAvailability(trades, candles).available === false`:
```
NeonPanel: "Break-even Replay · Candle Data Required"
  ConfidenceTag level="requires"
  
  Large gate message:
  - If no candles: "candles.csv not found in this bundle. 
    Re-export with candles to enable Break-even Replay."
  - If low coverage (<50%): "Candle coverage too low (N%). 
    {X} of {Y} trades cannot be resolved. Re-export with updated candles."
  
  Small print: "Break-even Replay requires 15-min or finer OHLC candles 
  aligned to trade fill and exit timestamps."
```
When gate passes: render the full tab.

#### Section 1 — Confidence banner
```
Inline banner (border accent-secondary/0.4):
  "REPLAY  ·  candle-resolution  ·  spread not modelled  ·  same-candle conservative"
  Pill "REPLAY TIER"
  
  3 footnotes:
  - "Candle-resolution replay: arm/exit detection uses 15-min OHLC wicks."
  - "Same-candle conservative rule: when arm and BE stop are hit on the same bar, 
    BE stop is assumed to have triggered first. Tick data required for certainty."
  - "Spread and slippage not modelled. BE exit R = 0R (entry price, no cost)."
```

#### Section 2 — Scenario controls
```
ARM LEVEL selector — inline pill buttons:
  [0.25R] [0.5R] [0.75R] [1R]★ [1.5R] [2R]
  Default: 0.5R
  Shows "(N BE exits)" sub-label when scenario computed.
  
V1 locked settings (no controls, just text):
  Stop mode: Entry (0R)  ·  Trigger: Wick  ·  Delay: 0 bars
```

#### Section 3 — Scenario comparison table
```
NeonPanel: "Scenario Comparison · All Arm Levels"
  ConfidenceTag "REPLAY"
  
  DataTable columns:
  - Arm Level (pill, selected = highlight)
  - Net R (ColoredR)
  - Δ Net R vs Baseline (ColoredR signed)  ← KEY METRIC
  - Profit Factor
  - Max DD
  - Worst Streak
  - Losses Saved
  - Winners Cut
  - BE Exits
  - Efficiency Ratio
  - Coverage %
  
  Selected row highlighted; clicking row selects it.
  Bottom note: "All scenarios use entry stop, wick trigger, 0 delay."
```

#### Section 4 — Verdict hero (for selected arm level)
```
NeonPanel: "BE Replay Verdict · {armLevelR}R Arm"
  
  Verdict logic:
    If coverage < 50%:          "NEEDS DATA"         muted tone
    If deltaNetR >= 0:          "LIKELY HELPFUL"     success tone
    If deltaNetR >= -5:         "MIXED"              warning tone
    If deltaNetR < -5 &&
       efficiencyRatio >= 0.5:  "MIXED"              warning tone
    Else:                       "UNLIKELY TO HELP"   danger tone
  
  Never say: "Use this" / "Confirmed edge" / "Exact result"
  
  Sub-text:
    "LIKELY HELPFUL": "BE protection improves net R at this arm level. Validate 
     with an exact backtest before applying."
    "MIXED": "Winner cost and loser savings are close. Small arm-level changes 
     significantly alter the trade-off."
    "UNLIKELY TO HELP": "Winner cost outweighs loser savings at this arm level. 
     Consider a wider arm or a different protection strategy."
    "NEEDS DATA": "Candle coverage is insufficient for a reliable verdict."
  
  Big number: Δ Net R (signed)
  Sub-label: "delta vs unprotected baseline"
```

#### Section 5 — Detail cards for selected scenario
```
4-card row (MetricChip grid):
  1. "Losses Saved"          value=N  sub="+{loserRSaved}R recovered"  tone=success
  2. "Winners Cut"           value=N  sub="-{winnerRCost}R cost"       tone=danger
  3. "Efficiency Ratio"      value=X  sub="R recovered per R cost"     tone=(ratio>1?success:ratio>0.5?warning:danger)
  4. "Same-Candle Ambiguous" value=N  sub="conservative rule applied"  tone=warning

NeonPanel: "Coverage & Missing Paths"
  2 chips:
  - "Replayed" value=N  sub="{coveragePct}% of trades"
  - "Missing Path" value=N  sub="sub-bar exits · original R used"
  Note: "Missing-path trades use the original realized R. 
  Zero-length windows (fill and exit in same 15-min bar) cannot be walked."
```

#### Section 6 — Disclosure footer
```
NeonPanel (collapsible, defaultCollapsed): "Research Methodology · Break-even Replay"
  
  - Confidence tier: REPLAY (between EXACT and ESTIMATE)
  - What this is: "Candle-walk simulation of a break-even stop rule using 
    imported OHLC bars. Arm and stop detection uses wick high/low."
  - What this is NOT: "Tick-level simulation. Spread/slippage model. 
    Confirmation of which event happened first on the same candle."
  - Same-candle rule: "When arm level and entry price are both touched on 
    the same OHLC bar, BE stop is conservatively assumed to have triggered first. 
    This understates wins and overstates BE rescues."
  - Relationship to Distance To Stop: "Break-even Replay and Distance To Stop 
    are complementary, not comparable. Distance To Stop is a fast MFE upper-bound 
    hypothesis generator (no candles required). Break-even Replay is candle-level 
    validation. Their numbers will differ — this is expected."
```

### D.5 useBeReplayScenarios hook (optional but recommended)

```js
// frontend/src/data/useBeReplayScenarios.js
import { useMemo } from "react";
import { replayBeScenario, buildBeScenarioSummary, beReplayAvailability } from "./beReplay";

const ARM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];
const PARAMS = { stopMode: "entry", triggerBasis: "wick", delayCandles: 0, bufferR: 0 };

export function useBeReplayScenarios(trades, candles) {
    return useMemo(() => {
        const availability = beReplayAvailability(trades, candles);
        if (!availability.available) return { availability, scenarios: [], baseline: null };

        const baselineNetR = trades.reduce((s, t) => s + (Number(t.r) || 0), 0);
        // ... compute baseline PF, maxDD, worstStreak from trades
        const baseline = { netR, profitFactor, maxDrawdown, worstLossStreak };

        const scenarios = ARM_LEVELS.map((armLevelR) => {
            const results = replayBeScenario(trades, candles, { ...PARAMS, armLevelR });
            const summary = buildBeScenarioSummary(results, baseline);
            return { armLevelR, summary };
        });
        return { availability, scenarios, baseline };
    }, [trades, candles]);
}
```

Benefits: separates compute from rendering, testable in isolation, `trades`/`candles` dep-array ensures recompute only on data change.

### D.6 Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Compute time for 6 scenarios × 137 trades × 24k candles | Medium | `useMemo` + only renders when tab is active |
| Very high same-candle count at tight arm levels (80%) | Low (display) | Prominent banner + per-scenario count in table |
| BE hurts every scenario on this dataset | None (correct) | Verdict hero says "UNLIKELY TO HELP" — this is the honest answer |
| Missing-path count (31/137 = 23%) | Low (display) | Coverage card + clear explanation |
| React key / render warnings | Low | Use `armLevelR` as key throughout |
| Future: equity curve overlay | Deferred | Engine already returns `equityCurve: [{i, netR}]`; overlay is addable post-V1 |

---

## PHASE E — Readiness Verdict

### **READY FOR UI**

All three conditions met:

**Sanity audit passes.**  
Engine produces internally consistent, monotonically behaved metrics across 6 arm levels on a real 137-trade dataset. 77.4% coverage with 31 zero-length missing paths (all explainable and correct). No suspicious outputs. The finding that BE protection hurts this high-RR run is valid research, not a bug.

**Data contract is clear.**  
`trades` already in scope in ProtectionLab. `CANDLES` one destructure away in `useDataset()`. `beReplayAvailability` handles the gate. No new store changes or importer changes needed.

**UI plan is low-risk.**  
Four targeted line-changes to ProtectionLab.jsx (import, destructure, memo, tab entry). All new code in a single new file (`BreakevenTab.jsx`). No existing components modified. Follows the FftProtectionTab architectural pattern exactly.

---

## Next Implementation Prompt

```
BE-REPLAY-PHASE-2-BREAKEVEN-TAB-UI
Repo: FX-OB-Research-Lab
Mode: IMPLEMENT

Context:
Phase 1 engine (beReplay.js) and Phase 1.5 sanity audit are complete.
The audit document is BE-REPLAY-PHASE-1-5-SANITY-AUDIT-AND-UI-PLAN-1.md.
Read the UI plan section (Phase D) in that document before writing any code.

Scope:
1. Create frontend/src/components/lab/protection/BreakevenTab.jsx
   - Implement exactly the layout described in Phase D.4 of the audit doc
   - Use useBeReplayScenarios hook (implement inline or as separate file)
   - ARM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0]; default selected = 0.5
   - Reuse NeonPanel, MetricChip, DataTable, ColoredR, Pill, ConfidenceTag, Note from
     ProtectionLab.jsx (already available in the component)
   - DO NOT build equity curve overlay in V1

2. Edit frontend/src/pages/ProtectionLab.jsx — 4 changes only:
   a. Import BreakevenTab
   b. Add CANDLES to useDataset() destructure
   c. Add candles useMemo after trades memo
   d. Add "breakeven" tab entry to PROT_TABS + conditional render block

Constraints:
- Do not modify any other files
- Do not touch the engine (beReplay.js) or validator
- Do not change any existing tab's content
- AGENTS.md universal rules apply (scoped commit, no unrelated changes)

Validation:
- Yarn dev / Vite build must not error
- Tab must render with real data when candles.csv bundle is loaded
- Tab must show gate panel when no candles are present
- Existing tabs (overview, deepdive, research, fft) must be unaffected
```

---

## Cleanup Note
Two test files were created during the sanity audit and are untracked:
- `frontend/be_sanity.mjs`
- `frontend/be_debug.mjs`

Delete before committing: `git clean -f frontend/be_sanity.mjs frontend/be_debug.mjs`
