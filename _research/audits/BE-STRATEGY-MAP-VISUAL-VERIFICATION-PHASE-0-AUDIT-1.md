# BE-STRATEGY-MAP-VISUAL-VERIFICATION — PHASE 0 AUDIT (1)

> Mode: **AUDIT ONLY**. No implementation. Goal: a trustworthy, reusable visual
> verification layer to inspect exact Break-even behavior trade-by-trade before
> expanding the protection system (partial risk reduction, dynamic tightening).

---

## 1. Files read
- `pages/StrategyMap.jsx` (2397 ln) — page, trade selection (`selectedTradeId`/`selectedTrade`), layer toggles, builds `chartTradeMarkers`/`tpSlLines`/`rrTools`, mounts `CandleChart`, `IntrabarInspector`, `LifecycleDetailPanel`.
- `components/lab/CandleChart.jsx` (2110 ln) — lightweight-charts wrapper. Already supports `tpSlLines`, **`verificationOverlay`** (per-trade entry/stop/tp geometry), `rrTools`, OB boxes, marker rendering, and a triggered-edge **lifecycle overlay** with `onSelectOverlay`.
- `pages/strategyMap/ScenarioSelector.jsx` — result-view (family/threshold/fillMode) selector feeding `useTradeUniverse`.
- `data/useTradeUniverse.js` / `data/tradeUniverse.js` — resolves the selected result view's trade set (`universe.trades`, `sourceKey`, `label`, `variant`).
- `data/importer.js` — BE trade-row field mapping + nested `beTradesByMode` / `beResults`.
- `data/beResolve.js` — variant-aware EXACT resolver (`resolveBeScenarioSource`, `entryVariantHasExact`).
- `components/lab/entries/.../IntrabarInspector.jsx` (selected-trade detail panel, referenced).
- No standalone `OrderBlockOverlay.jsx` — OB boxes are drawn inside `CandleChart`.

## 2. Existing BE data available
Per-trade BE fields ARE parsed by the importer (dual-keyed snake_case + camelCase) onto every BE-scenario trade row:

| Field | Use for verification |
|---|---|
| `be_armed` (bool) | Did BE arm? |
| `be_arm_level_r` (num) | Arm level in R |
| `be_arm_candle_index` (num) | Arm candle (⚠ absolute backtester index — see note) |
| `be_arm_time` (string) | **When it armed (use this for chart mapping)** |
| `be_triggered` (bool) | Did the BE stop fire? |
| `be_exit_reason` ("be_stop" / "armed_not_triggered" / "never_armed") | Outcome class |
| `be_exit_r` (num) | Exit R (≈0 at buffer 0) |
| `be_exit_price` (num) | BE stop price = where the stop moved to |
| `be_exit_time` (string) | When BE exited |
| `be_exit_candle_index` (num) | Exit candle (⚠ absolute index) |
| `be_scenario_key`, `be_trigger_basis` | Scenario identity |
| `entry`/`fill_time`, `exit`/`exit_time`, `entryPrice`, `stop`, `tp` | Original geometry |
| `outcome` / `outcomeRaw` (= `BE_EXIT`) | Terminal status |

**Critical data-flow gap:** these fields live on the **BE scenario trades**
(`activeRun.beTradesByMode[mode][entryVariantKey][beKey]`). The Strategy Map
currently renders `universe.trades` (baseline/entry trades) which do **NOT** carry
`be_*`. So today the map cannot show BE events — the verification layer's first job
is to feed the matching BE scenario trade set into the map. The data exists; it is
just not routed to the chart yet.

**Index caveat (from `beReplay.js` Phase-0 finding):** `fill_candle_index` /
`be_arm_candle_index` / `be_exit_candle_index` are **absolute global backtester
indices**, NOT positions into `candles.csv`. All chart placement must map via the
**timestamps** (`fill_time`, `be_arm_time`, `be_exit_time`, `exit_time`) →
nearest-prior candle, exactly as `CandleChart`/importer already do for entries.

## 3. Existing chart capabilities (strong reuse surface)
- **`verificationOverlay`** prop already renders, for one selected trade:
  fill X, entry/stop/tp Y-lines, and risk/reward boxes (`fillTime, fillIndex,
  entry, stop, tp, exitTime, projectedExitTime`). This is the natural home for BE
  geometry — extend it with `beArmLevel`, `beStopPrice`, `beArmTime`, `beExitTime`.
  (It is defined and rendered but not currently passed by StrategyMap — a ready slot.)
- **`tpSlLines`** draws labelled dashed TP/SL price lines via `createPriceLine`.
- **Triggered-edge lifecycle overlay + `onSelectOverlay` → `LifecycleDetailPanel`** —
  an existing pattern of "click element → detail panel with an event breakdown".
  The BE event timeline can mirror this.
- **`IntrabarInspector`** — existing selected-trade detail panel (good host for the
  BE timeline, or a sibling `BeVerificationPanel`).
- Marker rendering, OB boxes, vertical event dots, price lines, time→candle snapping
  all already exist. **No new charting primitives are required.**
- The map already distinguishes WIN/LOSS via outcome + `tradeClassification`; it does
  NOT yet have a BE-aware outcome (BE_EXIT, winner-cut, loss-saved).

## 4. Recommended UX
**Option D (combination), scoped tight.** Verification, not presentation:
1. A **BE scenario picker** on the map (only visible when the active result view has
   exact BE): choose arm level + trigger (reuse `resolveBeScenarioSource` against the
   current `entryVariantKey`). Selecting it swaps the map's trade set to that BE
   scenario's trades and enables BE overlays.
2. **Click a trade → selected-trade verification**: chart overlay (entry / original
   SL / TP / BE arm line / BE stop line / arm marker / exit marker) **plus** a
   compact **BE Verification panel** (event timeline + classification). One click
   answers all seven questions.
3. Everything behind toggles, **off by default**, so normal Strategy Map use is
   unchanged.

## 5. Recommended overlay design (extend `verificationOverlay`)
For the selected BE trade, draw:
- **Entry** line (solid), **Original SL** (dashed red), **TP** (dashed green) — already done.
- **BE arm level** — dotted amber horizontal line at the price implied by
  `be_arm_level_r` (entry ± armR × risk), labelled `BE arm 0.5R`.
- **BE stop** — dotted blue line at `be_exit_price` (where the stop moved to, ≈entry),
  labelled `BE stop`.
- **Arm marker** — vertical tick / dot at `be_arm_time` (amber), only if `be_armed`.
- **BE exit marker** — vertical tick / dot at `be_exit_time` (blue), only if `be_triggered`.
- Shade the segment fill→arm vs arm→exit subtly to show "before/after armed".
- If `never_armed`: show only entry/SL/TP + a muted "never armed" tag (no BE lines).

Keep it to ≤5 lines + 2 markers on screen at once — clutter is the enemy of trust.

## 6. Recommended timeline design (BE Verification panel)
A vertical event list for the selected trade, each row: **event · time · candle ·
price · R**. Events are derived from the BE fields (no backend change):

```
never_armed:            Entry → (never armed) → SL/exit
armed_not_triggered:    Entry → BE Armed → (survived) → WIN/exit
be_stop (loss saved):   Entry → BE Armed → Stop Moved → BE Exit (loss saved)
be_stop (winner cut):   Entry → BE Armed → Stop Moved → BE Exit (winner cut)
```
Field source per row:
- **Entry**: `fill_time` / `entryPrice` / 0R.
- **BE Armed**: `be_arm_time`, arm candle (derive from time), `entry ± armR×risk`, `be_arm_level_r`.
- **Stop Moved**: same time as arm (delay 0) or `arm + be_delay_candles`; price `be_exit_price`; R ≈ `be_stop_buffer_r`. *(Stop-move timing is derivable; with delay 0 it coincides with arm.)*
- **BE Exit**: `be_exit_time`, exit candle (from time), `be_exit_price`, `be_exit_r`.
- **Terminal (WIN/SL)**: `exit_time` / `exit` price / `r`.

All values already exist except "stop-move candle" which is derived from arm time +
`be_delay_candles` (config). Mark any derived value as derived in the panel.

## 7. Winner-cut / loss-saved classification (clear + honest)
Classify each BE trade from `be_exit_reason` + the trade's own R vs its variant's
no-BE baseline R (the backend already computes `winners_cut` / `losses_saved`
aggregate; per-trade we recompute by pairing on `trade_id` with the baseline set):

| Label | Definition | Honest caveat to show |
|---|---|---|
| **Loss saved** | no-BE trade was LOSS; BE exited at ~0R | "vs this view's no-BE baseline" |
| **Winner cut** | no-BE trade was WIN; BE exited at ~0R before TP | BE cost = baselineR − beR |
| **BE exit (neutral)** | `be_stop` fired but baseline pairing unavailable | shown as BE_EXIT only |
| **Armed, not triggered** | `armed_not_triggered`; original outcome preserved | no effect on R |
| **Never armed** | `never_armed`; identical to no-BE | no effect on R |

Terminology rule: never assert "saved/cut" without the baseline pairing; otherwise
show the neutral `BE EXIT`. Pairing requires the variant's no-BE trades — see risks.

## 8. Future-proofing recommendations (build once, reuse)
Design the layer as a **generic protection-event verifier**, not BE-specific:
- A normalized event model `ProtectionEvent { type, time, candleIndex, price, r, label, derived }`
  and a pure builder `buildProtectionTimeline(trade, { kind, config, baselineTrade })`.
  BE is the first `kind`; partial-risk-reduction / dynamic-tightening / multi-stage
  add new event types (`risk_reduced`, `stop_tightened`) and emit multiple `Stop Moved`
  rows — the panel + overlay iterate events generically.
- Overlay draws a **list of stop levels over time** (step line), not a single BE stop —
  so multi-stage tightening renders for free.
- Keep the scenario picker generic (`protectionScenarioKey`), so future models slot in.

## 9. Implementation plan (proposed; for confirmation — not yet built)
**P1 — Data routing.** Surface the active view's BE scenario trades to the map:
ProtectionLab→Strategy Map handoff or a map-local BE picker that reads
`activeRun.beTradesByMode[variant][entryVariantKey]` via `resolveBeScenarioSource`.
Gate strictly on exact availability for the current `entryVariantKey` (reuse
`entryVariantHasExact`); never show baseline BE under a variant view.

**P2 — Pure layer.** `data/protectionTimeline.js`: `buildProtectionTimeline(trade,…)`
→ ordered `ProtectionEvent[]` + classification (`loss_saved`/`winner_cut`/…). Pure,
unit-tested, no React.

**P3 — Overlay.** Extend `verificationOverlay` to accept `beArmLevel`, `beStopPrice`,
`beArmTime`, `beExitTime` (+ generic `stopSteps[]`); draw lines/markers via existing
`createPriceLine` + marker code. Time-based mapping only.

**P4 — Panel.** `BeVerificationPanel` (or extend `IntrabarInspector`) rendering the
timeline + classification chip + the 7 verification answers.

**P5 — Controls (off by default).** `[ ] Show BE Events`, `[ ] BE Arm Levels`,
`[ ] BE Stops`, `[ ] Protection Timeline`, + the BE scenario picker.

**P6 — Validation.** Unit tests for `buildProtectionTimeline` per `be_exit_reason`;
fixture trades for each path; a real-bundle spot check against the variant smoke run.

## 10. Risks
1. **Data routing (HIGH):** map currently has no BE trades; this is the real work.
   Until P1, no BE field is visible regardless of overlay code.
2. **Per-trade saved/cut needs baseline pairing (MED):** requires the variant's no-BE
   trades alongside the BE set to label saved/cut per trade. Without it, show neutral
   BE_EXIT only — do not guess.
3. **Index vs time (MED):** absolute candle indices must NOT be used for placement;
   map by timestamps only (documented hazard) or markers land in the wrong place.
4. **Replay vs exact provenance (MED):** the verifier must label whether it is showing
   EXACT backend BE or REPLAY (variant without exact) — never imply exactness for a
   REPLAY view. Reuse the existing EXACT/REPLAY + "BE data: {view}" chip.
5. **Coarse display candles (LOW):** map often shows 15m; BE armed/exited on 1m — arm
   markers snap to the enclosing 15m bar. Note this in the panel (the Intrabar
   Inspector already handles fine-vs-coarse provenance — reuse that pattern).
6. **Scope creep (LOW):** keep all BE overlays behind toggles; do not alter existing
   Strategy Map behavior.

---

### Verdict
The charting primitives (`verificationOverlay`, `tpSlLines`, lifecycle panel pattern,
markers, time-snapping) already exist and are reusable — **no new chart engine work**.
The BE per-trade fields already exist on the BE scenario trades. The single real
prerequisite is **routing the BE scenario trade set into the Strategy Map**; after
that, the verifier is a pure timeline builder + an extension of the existing overlay
and a small detail panel. Designing it as a generic `ProtectionEvent` timeline makes
it reusable for partial risk reduction, dynamic tightening, and multi-stage protection
with no rework. Recommend proceeding to a Phase-1 implement once this plan is confirmed.
