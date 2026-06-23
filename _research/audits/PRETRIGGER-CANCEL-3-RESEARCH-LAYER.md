# PRETRIGGER-CANCEL-3 — Research Layer Design (Phase 0 Live)
_FX-OB-Research-Lab · Architecture Design · June 2026_

> **AUDIT ONLY — no files modified, no code, no implementation.**
>
> Prior art: PRETRIGGER-CANCEL-1.md (backend schema), PRETRIGGER-CANCEL-2-LAB-IA.md (full lab IA).
> This document designs the smallest research layer given Ghost Phase 0 is now committed.

---

## Phase 0 Baseline (what is already live)

Ghost tracking is committed and shipping:

| Field | Parsed in | Displayed in |
|-------|-----------|--------------|
| `ghost_candidate` | `importer.js` + `obLifecycle.js` | `GhostOutcomePanel`, `StrategyMap` toggles |
| `ghost_trigger_reached` | `importer.js` + `obLifecycle.js` | — (not yet surfaced) |
| `ghost_fill` | `importer.js` + `obLifecycle.js` | — (not yet surfaced) |
| `ghost_outcome` | `importer.js` + `obLifecycle.js` | `GhostOutcomePanel` bar chart |
| `ghost_r` | `importer.js` + `obLifecycle.js` | `GhostOutcomePanel` net R header |
| `ghost_fill_delay_candles` | `importer.js` + `obLifecycle.js` | `GhostOutcomePanel` avg fill delay chip |
| `ghost_fill_session` | `importer.js` + `obLifecycle.js` | `GhostOutcomePanel` top session chip |

Also already parsed (pre-Phase 0): `cancel_reason` / `cancelReason` in `importer.js`.

**The join that enables all 8 features:** `ghost_candidate === true` trades also carry `cancel_reason`. Group ghost outcomes by `cancel_reason` → answers "which cancellation rule would have saved the most R?"

---

## Ownership Map

| # | Feature | Primary Page | Location | Gate |
|---|---------|-------------|----------|------|
| 1 | Rule comparison table | **Entries Lab** | ModelAnalysis — new `CancelImpactPanel` below `CancelReasonPanel` | `hasGhostData && hasCancelData` |
| 2 | Ghost wins missed | **Entries Lab** | Inside `CancelImpactPanel` — WIN column per rule | same |
| 3 | Ghost losses avoided | **Entries Lab** | Inside `CancelImpactPanel` — LOSS column per rule | same |
| 4 | Net R saved (run-level) | **Run Workspace** | Ghost KPI strip — new "Cancel Saved" chip | `ghost_net_r != null` |
| 4 | Net R saved (model-level) | **Entries Lab** | `CancelImpactPanel` footer total row | `hasGhostData` |
| 5 | Rule-by-rule leaderboard | **Entries Lab** | `CancelImpactPanel` sorted descending by net R | same as #1 |
| 6 | Rule parameter sweeps | **OBLab** | Robustness tab | multi-run; Phase 2 only |
| 7 | Cancellation timeline | **Strategy Map** | Ghost badge label extension (add `cancel_reason` abbrev) | `hasGhostData` |
| 8 | Cancelled OB outcome distribution | **Entries Lab** | `GhostOutcomePanel` — **already live** | `ghost_candidate` present |

---

## Page Structure

### Run Workspace
**Current:** ghost KPI strip shows candidates, wins, losses, ghost net R.
**Addition:** one chip — "Cancel Saved: +X.XXR" computed as `sum(ghost_r where outcome=LOSS) - sum(ghost_r where outcome=WIN)`. Positive = cancellation was net beneficial. Uses fields already parsed by the committed `importer.js`.

---

### Entries Lab — ModelAnalysis
**Current tier order:**
1. KPI strip
2. ExactResultsPanel
3. Lifecycle tier: `TriggeredEdgeFunnelPanel` · `SameNextCandlePanel` · `CancelReasonPanel`
4. **Trigger Behavior tier:** `GhostOutcomePanel` ← Phase 0 (already live)
5. Decision Analytics tier

**Addition — insert `CancelImpactPanel` into the Trigger Behavior tier, adjacent to `GhostOutcomePanel`:**

```
[Trigger Behavior tier]
  GhostOutcomePanel         (already live — aggregate outcome distribution)
  CancelImpactPanel         (new — per-rule breakdown)
```

`CancelImpactPanel` columns: Rule name · Candidates · Ghost Wins missed · Ghost Losses avoided · Net R · Precision (% of cancels that avoided a loss). Sorted desc by net R. Total row footer. This is features 1 + 2 + 3 + 5 in a single component.

Data source: `trades.filter(t => t.ghost_candidate === true)`, grouped by `t.cancel_reason || t.cancelReason`. All fields already in the committed importer.

---

### Strategy Map
**Current (Phase 0):** ghost badge chips on chart, `showGhostCandidateMarkers` / `showGhostFillMarkers` / `showGhostWinMarkers` / `showGhostLossMarkers` toggles.

**Addition — extend ghost badge label with cancel_reason abbreviation:**
Currently: `"G:WIN +1.2R"`. With rule label: `"G:WIN +1.2R [RTRC]"` (abbreviated rule name).

Requires `cancel_reason` to be present on overlay objects in `useResolvedScenario.js` (it's already parsed by `obLifecycle.js` — needs to be added to `buildTriggeredEdgeOverlays` output). Cosmetic change to `CandleChart.jsx` badge render. No new toggles needed.

---

### OBLab — Robustness tab
**Phase 2 only.** Parameter sweep: for a given cancel rule, sweep thresholds and show ghost net R at each value. Requires multi-threshold backtester export. No frontend work until backend supports this.

---

## Recommended MVP

**Three changes. One new component. No new pages. No backend changes.**

### Change 1 — `RunDetail.jsx`
Add a "Cancel Saved" chip to the ghost KPI strip. Computed client-side from parsed ghost fields. 3 lines of JSX.

### Change 2 — `CancelImpactPanel.jsx` (new component)
Self-contained table component. Accepts `trades` prop. Groups `ghost_candidate=true` rows by `cancel_reason`. Renders per-rule rows sorted by net R. Mounted in `ModelAnalysis.jsx` inside the Trigger Behavior tier, adjacent to `GhostOutcomePanel`. Same gate: `lifecycleRow && hasGhostData`.

### Change 3 — `useResolvedScenario.js` + `CandleChart.jsx`
Add `cancel_reason` to `buildTriggeredEdgeOverlays` output. Append it to ghost badge labels in `CandleChart`.

**MVP scope covers:** features 1, 2, 3, 4, 5, 7 fully — and 8 is already live.
Feature 6 (parameter sweeps) is Phase 2. Nothing is blocked.

---

## Recommended Phase 2

| Feature | Prerequisite | Notes |
|---------|-------------|-------|
| Rule parameter sweeps | Backtester exports multi-threshold bundles | OBLab Robustness tab; full PRETRIGGER-CANCEL-2-LAB-IA.md spec |
| Failures Lab Cancellations tab | None | Full drilldown per PRETRIGGER-CANCEL-2-LAB-IA.md §B |
| Per-session cancel impact breakdown | None — `ghost_fill_session` already parsed | Extend CancelImpactPanel with session split |
| Cancel rule trade drilldown | None | Link CancelImpactPanel rows → trade list |
| Ghost equity curve overlay | None — `ghost_r` already parsed | Hypothetical equity if no cancellation was applied |
| Multi-run rule comparison | Ghost fields in comparison analytics | Compare two runs with different cancel rules |

---

## Key Observations

**The cancel_reason ↔ ghost_r join is already possible with zero backend changes.** Both fields are parsed in the committed `importer.js`, both pass through the committed `obLifecycle.js`, both are available on trade objects. The MVP requires only frontend work.

**Feature 8 is already done.** `GhostOutcomePanel` (committed in `cae43ac`) shows the aggregate outcome distribution. The MVP extends it with the per-rule dimension — it does not replace it.

**`CancelImpactPanel` and `GhostOutcomePanel` answer different questions.** `GhostOutcomePanel`: "across all ghost candidates, what was the outcome distribution?" `CancelImpactPanel`: "for each cancel rule, was the cancellation correct?" They are complementary, not duplicate.

**The PRETRIGGER-CANCEL-2-LAB-IA.md Failures Lab Cancellations tab remains the correct Phase 2 home** for the full drilldown surface (ghost fill timing, rule comparison, promotion to Hypothesis Lab). The MVP `CancelImpactPanel` in Entries Lab is a model-scoped summary; the Cancellations tab is the global, cross-model deep dive.

---

_End of PRETRIGGER-CANCEL-3 research layer design. No files modified._
