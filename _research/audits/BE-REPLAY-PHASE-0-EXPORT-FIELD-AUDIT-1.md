# BE-REPLAY-PHASE-0-EXPORT-FIELD-AUDIT-1.md

**Mode:** AUDIT ONLY — no code written, no files changed.
**Date:** 2026-06-10 · **Branch:** `codex-dev`
**Prereq:** `BE-REPLAY-PROTECTION-ARCHITECTURE-AUDIT-1.md`

**Files read:**
- `BE-REPLAY-PROTECTION-ARCHITECTURE-AUDIT-1.md` — Phase 1 required fields
- `frontend/src/data/importer.js` — all field mappings + candle ingestion logic
- `test_import_bundle/trades_single_position.csv` — base trade file (150 rows, 58 cols)
- `test_import_bundle/trades_single_position__penetration_75p0.csv` — protection variant (150 rows)
- `test_import_bundle/candles.csv` — candle array (24,909 rows)
- `sample_run_bundle/trades_single_position.csv` — older format trade file (12 cols)

---

## Phase A — Required Fields From Spec

From `BE-REPLAY-PROTECTION-ARCHITECTURE-AUDIT-1.md` Phase C, the candle-walk algorithm requires:

| Field | Purpose |
|---|---|
| `fill_candle_index` | Start of candle slice (fill candle) |
| `exit_candle_index` | End of candle slice (exit candle) |
| `entry` / `entryPrice` | Entry price (arm price derivation) |
| `stop` / `sl` | Stop-loss price (stop distance calculation) |
| `tp` | Take-profit price (TP detection during walk) |
| `direction` | Long vs short (arm/stop comparisons) |
| `pnl_r` / `netR` | Original R (unchanged-trade baseline) |
| candles.csv | OHLC array to walk between fill and exit |

Secondary fields (enrichment, not blocking):
`mfe_r`, `mae_r`, `rr_config`, `fill_candle_open/h/l/c`, `same_candle_exit`, `fill_time`, `exit_time`

---

## Phase B — Importer Mapping Findings

### B.1 candles.csv ingestion

```
importer.js:178  parseCandlesCSV(text)   → maps time·o·h·l·c; row index = sequential (0-based)
importer.js:735  buildCandleIndex(candles) → Map<time → row_i>, ordered array, toleranceSec
importer.js:755  timeToCandleIndex(time, idx) → nearest-prior binary search with tolerance
importer.js:1034  case "candles": collected.candles = parseCandlesCSV(text)
importer.js:1244  const hasCandles = !!collected.candles?.length
importer.js:1245  const candleIdx = hasCandles ? buildCandleIndex(collected.candles) : null
```

`candles.csv` is **optional** — `hasCandles` is a boolean gate; no candles → `candleIdx = null`.
If absent, `computeTradeMarkers` falls back to evenly-spaced indices for the CandleChart only.
No other subsystem currently uses the candle array at runtime.

### B.2 fill_candle_index / exit_candle_index

```
importer.js:423   fill_candle_index: numOrNull(pick(r, "fill_candle_index"))
importer.js:424   exit_candle_index: numOrNull(pick(r, "exit_candle_index"))
```

Both mapped via `numOrNull` → `null` when absent (no error, clean degradation). No alias
variants registered (single key only).

### B.3 entry / stop / tp / direction / netR

```
importer.js:384   entryPrice: Number(pick(r, "entry", "entry_price", "entryprice") ?? 0)
importer.js:385   stop:       Number(pick(r, "stop", "stop_loss", "sl") ?? 0)
importer.js:386   tp:         Number(pick(r, "tp", "take_profit") ?? 0)
importer.js:387   direction:  derived from "side"/"direction" → "bull"/"bear"
importer.js:~530  netR:       Number(pick(r, "pnl_r", "net_r", "r", "pnl") ?? 0)
```

All present. CSV field names: `entry`, `stop`, `tp`, `direction`, `pnl_r` — all map cleanly.

### B.4 mfe_r / mae_r

```
importer.js:402   mfeR: numOrNull(pick(r, "mfe_r", "mfeR"))
importer.js:404   maeR: numOrNull(pick(r, "mae_r", "maeR"))
```

Mapped but `numOrNull` — silently `null` when absent. No error.

### B.5 arm_candle_index

```
importer.js:510   arm_candle_index: numOrNull(pick(r, "arm_candle_index", "armCandleIndex"))
```

Mapped. Not required for basic BE replay (BE arm level is derived from entry + stop, not from
the OB arm event). Useful for future "arm after OB arm" variants only.

### B.6 Old export degradation

Old format (e.g. `sample_run_bundle/trades_single_position.csv`) has only 12 columns:
`id · direction · structure · session · entry · exit · entry_price · stop · tp · r · outcome · ob_width`

No candle indices. No `fill_time` / `exit_time`. No `fill_candle_*`. `numOrNull` returns `null`
for all missing fields — no crash, but BE replay is **structurally impossible** without
candle indices or timestamps.

---

## Phase C — Real Sample Coverage Findings

### C.1 Bundle: `test_import_bundle` (58-column format)

**Trades file: `trades_single_position.csv`**

| Metric | Count | % |
|---|---|---|
| Total rows | 150 | — |
| Filled trades (WIN + LOSS) | 137 | 91% |
| Unfilled / cancelled | 13 | 9% |
| fill_candle_index present | 137 / 150 | 91% |
| exit_candle_index present | 139 / 150 | 93% |
| Both present | 137 / 150 | 91% |
| **Filled trades with both** | **137 / 137** | **100%** |
| entry + stop + tp populated | 137 / 137 | 100% |
| pnl_r populated | 137 / 137 | 100% |
| mfe_r present | 0 / 137 | 0% |
| mae_r present | 0 / 137 | 0% |
| arm_candle_index present | 0 / 137 | 0% |
| candles.csv present in bundle | YES | — |
| candles.csv row count | 24,909 | — |
| candles.csv period covered | 2025-05-18 → 2026-05-18 | 1 year |
| candles.csv interval | 15 minutes | — |

**The 13 missing-index trades are all unfilled/cancelled:**
All 13 have `missed_trade=True` and outcome `UNFILLED` or `REVERSE_TOUCH_CANCEL`. They never
filled → no fill candle → no candle indices. This is **structurally correct**: BE replay only
applies to filled trades, so effective coverage for replay purposes is **100%**.

### C.2 Bundle: `sample_run_bundle` (12-column format)

| Metric | Status |
|---|---|
| fill_candle_index | ABSENT |
| exit_candle_index | ABSENT |
| fill_time / exit_time | ABSENT |
| candles.csv | ABSENT |
| Replay coverage | 0% — impossible |

This older format cannot support frontend BE replay without re-export.

### C.3 Critical architectural finding: candle indices are ABSOLUTE, not relative

**The single most important finding of this audit.**

The `fill_candle_index` values in trade rows (e.g. 11636, 17841, 369232) are **absolute
global indices from the backtester's full historical candle dataset**. The `candles.csv`
exported in the bundle has only 24,909 rows. The max `fill_candle_index` observed is 369,232
— 14× larger than the candle array.

**Consequence:** The architecture spec's proposed slice `candles[fill_candle_index ..
exit_candle_index]` is **WRONG**. It would immediately throw an out-of-bounds or silently
return `undefined` for nearly every trade.

**Correct approach: time-based lookup**

`importer.js` already implements the correct pattern in `timeToCandleIndex` / `buildCandleIndex`:
- Build a `Map<epoch_seconds → row_index>` from candles.csv timestamps
- For each trade, align `fill_time` to nearest prior 15-minute bar boundary: `(fill_time // 900) * 900`
- Look up that aligned timestamp → row index N
- Same for `exit_time` → row index M
- Walk `candles[N .. M]`

**Verified:** time-based lookup succeeded for 137/137 filled trades in the test bundle.

### C.4 fill_candle_OHLC source mismatch

The `fill_candle_open/h/l/c` fields on trade rows do NOT always match the nearest-prior candle
in candles.csv. Exact matches occur only when `fill_time` falls exactly on a 15-minute boundary
(~17% of trades). For intra-bar fills (e.g. fill at 23:20 within the 23:15 bar), the trade row
stores the backtester's internal OHLC for that bar, which may differ slightly from the
candles.csv export.

**Impact on BE replay:** The walk uses candles.csv OHLC to detect arm level / retrace events.
The fill_candle_* fields are used only to characterise the entry candle itself (not the walk).
The mismatch does not block replay, but means the fill candle's OHLC should come from the trade
row (authoritative), while subsequent candles (N+1 onward) come from candles.csv.

**Note:** The delta between fill_candle_open on the trade row vs the candles.csv bar is
typically < 5–10 pips on EURUSD 15m data — within normal intra-bar variation. Not a data
quality issue; just two representations of the same bar from possibly different aggregation paths.

### C.5 Candle walk simulation: live proof of concept

A Python simulation of the candle walk algorithm (arm at +0.5R, entry BE stop, wick trigger)
was run against the 137 filled trades in `trades_single_position.csv`:

**Baseline validation:** Net R = 39.30R (confirmed: 41 wins × 3.3R − 96 losses × 1.0R = 39.30R ✓)

**Walk completion:** 137/137 trades successfully walked. 0 failures. 1 same-candle ambiguity.

**SL verification:** 10 random losers checked — in all 10 cases the exit candle's wick
crossed the stop-loss level in the correct direction. ✓

**Arm level sweep results:**

| Arm level | Net R | ΔNet R | Losses saved | Winners cut |
|---|---|---|---|---|
| Baseline | 39.30R | — | — | — |
| +0.25R | 37.20R | −2.10R | 54 | 17 |
| +0.50R | 34.50R | −4.80R | 48 | 16 |
| +0.75R | 28.10R | −11.20R | 35 | 14 |
| +1.00R | 20.40R | −18.90R | 24 | 13 |

BE hurts this test dataset because the RR is 3.3R per winner — cutting even one winner from
3.3R to 0R costs more than saving one full-stop loss (−1.0R). This is a realistic and expected
result for a high-RR strategy. The simulation is working correctly.

### C.6 mfe_r / mae_r absence — impact assessment

`mfe_r` and `mae_r` are absent from both bundles. They are:
- **Required** by `buildBeOpportunity` / `buildMfeDistribution` in `excursionAnalytics.js`
  (Distance To Stop module). Those features gate on `isModuleAvailable("excursion", trades)`
  which checks for `mfeR != null`. If absent → Distance To Stop shows "data unavailable."
- **NOT required** for BE Replay. The candle walk computes MFE naturally by finding the highest
  (long) or lowest (short) candle high/low between fill and exit. `mfe_r` on the trade row is
  irrelevant to the walk.

No additional backend work is needed for Phase 1 BE replay due to missing mfe_r/mae_r.

---

## Phase D — Readiness Verdict

### PARTIAL

**For bundles in the current 58-column format with candles.csv:**
Frontend BE candle-walk replay is **ready to build**, with one mandatory architecture correction
(time-based lookup, not index-based slice).

**For bundles in the old 12-column format:**
Replay is **impossible**. These bundles must be re-exported before BE replay is available.

**Detailed breakdown:**

| Condition | Status | Notes |
|---|---|---|
| candles.csv present | CONDITIONAL | Present in test_import_bundle; absent in old format. User must include it. |
| fill_candle_index mapped | ✓ | 100% of filled WIN/LOSS trades in modern format |
| exit_candle_index mapped | ✓ | 100% of filled WIN/LOSS trades in modern format |
| entry / stop / tp present | ✓ | 100% |
| direction present | ✓ | 100% |
| pnl_r (netR) present | ✓ | 100% |
| mfe_r / mae_r | ✗ | Absent — not needed for walk, needed for Distance To Stop |
| arm_candle_index | ✗ | Absent — not needed for basic BE replay |
| Index-based candle slice | ✗ WRONG | Indices are absolute global; must use time-based lookup |
| Time-based candle lookup | ✓ | 137/137 trades matched; algorithm proven in simulation |
| Candle walk simulation | ✓ PROVEN | Correct baseline, correct SL verification, 0 walk failures |
| Protection variant files usable | ✗ | Must use BASE trade file, not `__penetration_*` variants |

---

## Phase E — Required UI Gates and Error States

### E.1 Gate: candles.csv absent

- **Detection:** `!run.candles?.length` (already tracked in the import result as `collected.candles`)
- **UI state:** "Break-even replay requires candle data. Re-import your bundle with a `candles.csv` file."
- **Fallback behaviour:** Disable the Break-even tab entirely. Distance To Stop (MFE upper bound) still functions independently.
- **Copy note:** Must not say "candle path data" without explaining *how* to add it. The export button / guide should be linked.

### E.2 Gate: missing candle indices (old bundle format)

- **Detection:** `coverage_pct = trades.filter(t => t.fill_candle_index != null && t.exit_candle_index != null && outcome is filled).length / filledTrades.length`
- **Thresholds:**
  - `coverage_pct >= 0.90` → proceed (warn for the gap in a tooltip)
  - `0.50 <= coverage_pct < 0.90` → show degraded-data warning banner: "Coverage incomplete — replay results based on X% of trades. Re-export for full coverage."
  - `coverage_pct < 0.50` → show "Needs data" state: "This export bundle is missing candle index fields. Please re-run your backtest with an updated exporter."
  - `coverage_pct == 0` → disable tab, show "Old export format detected."
- **Unfilled trades are excluded from coverage_pct** (they structurally cannot have candle indices).

### E.3 Gate: protection variant file used as base

- **Detection:** check if the file is named `trades_*__<mode>*.csv` or if > 80% of filled outcomes are `PROTECTION_EXIT`. In the importer, these files are already routed to `protectionTradesByMode`, not to the primary trade set.
- **Risk:** A user who accidentally imports only protection files and no base file would see an empty or near-empty trade set for BE replay. The importer already handles this correctly — protection files go into `protectionResults.tradesByMode`, not into the primary `trades` array that BE replay would consume.
- **No special gate needed** — the importer routing is already correct. Document in `beReplay.js` that it operates on `run.trades` (the primary set), never on `run.protectionResults.tradesByMode`.

### E.4 Gate: same-candle ambiguity

- **Detection:** during the walk, when arm level and BE stop are both hit on the same candle.
- **UI note:** shown as a small count in a tooltip: "N trades had same-candle ambiguity (conservative: BE stop assumed to trigger first)."
- **No gate needed** — just disclosure.

### E.5 Gate: candles.csv period doesn't fully cover trade dates

- **Detection:** check `min(fill_time) >= candles[0].time` and `max(exit_time) <= candles[last].time`.
- **If failing:** "Some trades fall outside the candle range. Affected trades will use original exit."
- **Severity:** Warning banner, not a block. Trades outside the window get `outcome: "original_unchanged"` (same as arm-never-triggered). Count them and display.

### E.6 Error state copy

```
Tab disabled states:
  "No candle data"     → "Include candles.csv in your export bundle to enable Break-even replay."
  "Old export format"  → "Re-run your backtest to generate candle index fields (fill_candle_index / exit_candle_index)."
  "Coverage < 50%"     → "Most trades in this bundle are missing candle index data. Re-export for full replay."

Warning banners (tab enabled, reduced confidence):
  "Coverage 50–90%"    → "Replay coverage: X% of trades (Y trades missing candle path data — treated as unchanged)."
  "Period gap"         → "N trades fall outside the candle range and use original exit results."

Hover tooltip on REPLAY chip:
  "Candle-resolution replay (15-min bars). Spread not modelled. Same-candle events
   treated conservatively (BE stop assumed to trigger before TP). Results are research-
   grade, not tick-accurate."
```

---

## Summary Deliverables

### 1. Files read

`BE-REPLAY-PROTECTION-ARCHITECTURE-AUDIT-1.md` · `importer.js` · `test_import_bundle/trades_single_position.csv` · `test_import_bundle/trades_single_position__penetration_75p0.csv` · `test_import_bundle/candles.csv` · `sample_run_bundle/trades_single_position.csv`

### 2. Required fields from spec — confirmed present

`fill_candle_index` ✓ · `exit_candle_index` ✓ · `entry` ✓ · `stop` ✓ · `tp` ✓ · `direction` ✓ · `pnl_r` ✓ · candles.csv ✓ (conditional)

### 3. Importer mapping findings

All required fields are mapped via `numOrNull` (silent null when absent). Old 12-column format degrades silently but is replay-incompatible. `parseCandlesCSV` + `buildCandleIndex` + `timeToCandleIndex` already implement the time-based lookup pattern needed.

### 4. Real/sample coverage findings

Modern format (58-col): **100% coverage** for filled WIN/LOSS trades. Old format: **0% coverage**.
`mfe_r` / `mae_r` absent from both bundles — not a blocker for BE replay.
Candle walk simulation: **proven working** with correct baseline validation and SL verification.

### 5. Readiness verdict

**PARTIAL.** Modern 58-column exports with candles.csv are ready to build against. Old format requires re-export. One **mandatory architecture correction** vs the spec: use time-based candle lookup (not index-based slice).

### 6. Recommended next implementation step

**`beReplay.js` Phase 1 implementation**, with the following spec correction applied:

> **Replace in BE-REPLAY-PROTECTION-ARCHITECTURE-AUDIT-1.md Phase C:**
> ~~"candle_slice = candles[fill_candle_index .. exit_candle_index]"~~
>
> **Corrected:**
> ```
> fill_row = nearest_prior_candle_by_time(fill_time, candleIdx)  // uses buildCandleIndex
> exit_row = nearest_prior_candle_by_time(exit_time, candleIdx)
> candle_slice = candles[fill_row .. exit_row + 1]
> ```
> The first element of the slice (fill candle) should use `fill_candle_open/h/l/c` from the
> trade row (authoritative) rather than `candles[fill_row]` (may differ for intra-bar fills).
> Subsequent candles in the slice use candles.csv directly.

Owner: Codex (engine `beReplay.js` + validation suite). Claude (Protection Lab tab UI).

### 7. Risks and guards

| Risk | Severity | Guard |
|---|---|---|
| candles.csv absent | HIGH | Disable tab; explain how to include |
| Old format (no candle indices) | HIGH | Detect via coverage_pct; show "Needs data" |
| Index-based slice (wrong architecture) | HIGH — FIXED | Use time-based lookup; document in beReplay.js |
| fill_candle_OHLC mismatch | LOW | Use trade row for fill candle; candles.csv for rest |
| mfe_r absent | NONE for replay | Distance To Stop is independently gated |
| Protection variant file as input | NONE | Importer routing already separates base vs protection |
| Same-candle ambiguity | LOW | Conservative assumption; disclosed as count in tooltip |
| Candles.csv period gap | MEDIUM | Warn + treat out-of-range trades as unchanged |

---

*Audit completed: 2026-06-10. No code written. No files changed other than this document.*
*Candle walk simulation run in Python against test_import_bundle data — results in Phase C.5.*
*Architecture correction in Section 6 supersedes the index-based slice in BE-REPLAY-PROTECTION-ARCHITECTURE-AUDIT-1.md Phase C.*
