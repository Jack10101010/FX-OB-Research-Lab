# TRIGGERED-EDGE-ENTRY-UNIVERSE-EXPANSION-AUDIT

> Mode: **AUDIT ONLY**. No implementation. Design the Triggered Edge entry-universe
> expansion (threshold presets + delays to Arm C6) before generating a large
> protection matrix.

---

## 1. Files read
**Backend (`Lux-OB-Backtester`):** `scripts/run_backtest.py` — `VALID_TRIGGERED_EDGE_CANDLE_DELAYS` (l.39), `entry_scenarios` TE block (l.656-676), `normalize_triggered_edge_delays` (l.624-639), threshold validation (l.227-260), directional delay validation (l.377-383), `be_scenarios` / `be_output_filename`; `src/config.py` (TE fields).
**Frontend (`FX-OB-Research-Lab`):** `data/configTranslator.js` (TE serialization l.558-674), `pages/StrategyBuilder.jsx` (delay chips l.1021, threshold input l.997, defaults l.100-129), `data/tradeUniverse.js` (`fillModeFromKey`/`extractThreshold`/`buildCanonicalKey`/`FILL_ORDER`), `data/beResolve.js`, `data/importer.js`, `pages/strategyMap/ScenarioSelector.jsx` + `useResolvedScenario.js` (delay labels).

---

## 2. Current backend support (answers Q1–Q3, Q6)
- **Thresholds (Q1, Q6):** `triggered_edge_trigger_thresholds` is an **array**, validated only as `0 < t < 100` (l.227-230). **Arbitrary thresholds (10/25/50/75) already work** — no backend change.
- **Delays beyond 3 (Q2):** **NOT supported.** `VALID_TRIGGERED_EDGE_CANDLE_DELAYS = {0, 1, 2, 3}` (l.39). `normalize_triggered_edge_delays` filters out anything not in this set (l.633), and directional validation *raises* on out-of-set delays (l.379-383). **C4–C6 require lifting this cap.**
- **Delay key generation (Q3):** **generic.** `entry_scenarios` builds the key as `entry_triggered_edge_{threshold:.1f→p}_{mode_key}` where `mode_key` = `same`(0) / `next`(1) / `d{delay}`(≥2). So `d4`/`d5`/`d6` keys generate automatically the moment the cap is lifted — no key-format change.

Entry-key format confirmed: `entry_triggered_edge_25p0_d2`, `entry_triggered_edge_50p0_d6`, `entry_triggered_edge_75p0_same`, etc.

---

## 3. Current frontend limitations (answers Q4, Q5, Q7)
- **C0–C3 hardcoded (Q4):** `StrategyBuilder.jsx` l.1021 — `[{d:0},{d:1},{d:2},{d:3}]`. This is the only hard delay cap in the UI. `tradeUniverse.FILL_ORDER` (l.283) lists up to `d4` — **cosmetic only** (d5/d6 still resolve; they just sort to the front). All other delay handling is generic.
- **Key parsing is generic (Q5):** `fillModeFromKey` uses `/_d(\d+)$/`, `extractThreshold` parses any `NNpN`, `buildCanonicalKey` emits any `d{n}`, `beResolve.findBeScenario` passes `entryVariantKey` through verbatim, and the importer keys CSVs by filename. **`entry_triggered_edge_25p0_d4` and `entry_triggered_edge_50p0_d6` already resolve end-to-end with no resolver change.** Display labels (`Arm C{n}`) are generic too.
- **Threshold serialization (Q7):** single-model UI uses one number (`singleTriggeredEdgeThreshold`, default 25) → serialized as a 1-element `triggered_edge_trigger_thresholds` array (configTranslator l.558). The research path uses a comma string → `normalizeEntryThresholds` → array (l.600). `triggered_edge_candle_delays` is passed through unclamped (l.566/610) — so the UI chip set is the only frontend gate on delays.

Net: the frontend is **already key-compatible** with the expanded universe. The only frontend changes needed are **UI affordances** (threshold presets + C4–C6 chips) and a cosmetic `FILL_ORDER` extension.

---

## 4. Recommended threshold presets (Q8)
Add **10% / 25% / 50% / 75%** as quick-select chips that populate the threshold set, keeping the custom number input for arbitrary values. Backend already supports these. Recommend the single-model control become **multi-select** (chips + custom) so a research universe can include several thresholds without the comma-string path.

## 5. Recommended delay range (Q9)
Extend selectable delays to **Arm C0–C6**. This **requires** first lifting the backend cap `VALID_TRIGGERED_EDGE_CANDLE_DELAYS` to `{0,1,2,3,4,5,6}` (and the directional validation message). Shipping C4–C6 chips UI-only would silently drop them (non-directional) or raise (directional) — broken UX. Treat the cap lift + UI chips as one atomic change.

## 6. Entry-key naming confirmation (Q5)
Confirmed stable and matrix-ready: `entry_triggered_edge_{pct}p{frac}_{same|next|d{n}}`. Examples that already resolve: `entry_triggered_edge_10p0_same`, `entry_triggered_edge_50p0_d4`, `entry_triggered_edge_75p0_d6`. These are the exact keys the protection matrix would index on (`beTradesByMode[mode][entryVariant][beKey]`).

## 7. FFT / retrace / first-failed-tag cancel (Q10)
These are **run-level config toggles applied within the simulation**, recorded as per-trade `cancel_reason` flags — they do **not** create new entry-universe keys. The entry key stays `entry_triggered_edge_{pct}_{delay}` regardless of whether FFT/retrace are on. Implication: they are *modifiers*, not a key axis; comparing on/off requires separate runs, not extra matrix cells. **Recommendation: keep them out of the entry-universe key axis** (and out of the matrix axis) to avoid multiplying the space; treat them like gates (a future client-side or run-level comparison), not universe keys.

---

## 8. Matrix size estimate (Q11, Q12)
Entry universes from the preset set = thresholds × delays (per execution mode):

| Preset scope | Universes | × BE arms (9) × triggers (2) = **BE cells** | With single-walk (all arms per variant×trigger) |
|---|---|---|---|
| 4 thresholds × 7 delays (C0–C6) | **28** | **504** | 28 × 2 = **56 walks** |
| 4 thresholds × 4 delays (C0–C3) | 16 | 288 | 32 walks |
| 4 thresholds × 4 delays + baseline | 17 | 306 | 34 walks |

(Plus one entry-only pass per universe, and ×N if `be_variants:"all"` runs every execution mode.) **504 BE simulate_trades passes** for the full 4×7 preset **without** the single-walk optimization — that is the blow-up. The single-walk optimization (one path walk per variant×trigger emits all 9 arms) collapses it to **56 walks**, ~9× cheaper. This is the dominant reason to build the generator/optimization before generating the full matrix.

---

## 9. Implementation plan (proposed; not yet built)
**Backend (small):**
1. `VALID_TRIGGERED_EDGE_CANDLE_DELAYS = {0,1,2,3,4,5,6}` + update the directional validation message. (No generation-logic change — keys already generic.)
2. (Later, with the matrix generator) single-walk-all-arms BE so the larger universe is affordable.

**Frontend (small, key-compatible already):**
3. StrategyBuilder: threshold preset chips (10/25/50/75) + multi-select; delay chips extended to C0–C6 with the same generic handler.
4. `tradeUniverse.FILL_ORDER` → add `d5`,`d6` (cosmetic ordering).
5. Strategy Builder copy/help for C4–C6 (the help text currently enumerates C0–C3).

**No change needed:** importer, beResolve, tradeUniverse resolver logic, BreakevenTab arm handling, protection layers — all already generic over thresholds/delays.

---

## 10. Recommendation: implement before generating the full BE matrix? (Q13)
**Yes — implement the entry-universe expansion first, but decouple it from BE generation.** Rationale:
- The expansion is **low-risk and key-compatible**: thresholds need zero backend change; delays need only a one-line cap lift; the frontend resolvers already handle the keys. Doing it first lets you *define* the universes you'll later generate protection for.
- **The danger is not the entry expansion itself — it's letting `be_variants:"all"` auto-multiply** BE across all 28 universes on the next run (→ 504 passes). So:
  - Ship the entry-universe expansion (presets + C0–C6 + cap lift) now.
  - **Do NOT default BE to "all universes."** Keep BE generation **scoped/lazy** — explicit `be_variants` selection, or (preferably) gate the heavy BE generation behind the **protection-matrix generator** (with the single-walk optimization) from the previous audit.
- Concretely: entry-universe UI expansion → then matrix generator (single-walk) → then generate BE per selected universe on demand. Generating the full 504-cell matrix brute-force *before* the single-walk optimization is the one path to avoid.

**Net:** safe and recommended to expand the Triggered Edge entry universe now; just keep BE matrix generation explicit/lazy and build the single-walk generator before any full-matrix run.
