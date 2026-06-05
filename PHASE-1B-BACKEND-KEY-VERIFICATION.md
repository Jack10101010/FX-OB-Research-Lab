# MASTER-CONTROLS-PHASE-1B — Backend Key Verification Audit

**Date:** 2026-06-05
**Mode:** AUDIT ONLY — no files modified
**Scope:** 5 unconfirmed cfg fields from Phase 1 configRegistry.js

---

## Audit Method

The FX-OB-Backtester Python repo is not on the local filesystem and is not publicly accessible on GitHub. Direct backend code inspection (config.py, run_backtest.py, sidecar/server.py) was therefore not possible.

Evidence sources used instead:

| Source | Path |
|--------|------|
| Frontend importer | `frontend/src/data/importer.js` |
| Frontend store | `frontend/src/data/store.js` |
| Frontend pages | `MonteCarlo.jsx`, `StrategyBuilder.jsx` |
| Design documents | `DESIGN_CONFIG_OB_STATS_V2.md`, `DESIGN_CONFIG_OB_STATS_V3.md` |
| Audit documents | `PRETRIGGER-CANCEL-1.md`, `PRETRIGGER-CANCEL-2-LAB-IA.md`, `FULL-PIPELINE-INTEGRITY-AUDIT-1.md` |
| Test run bundles | `test_import_bundle/config.json`, `test_import_bundle/order_blocks.csv`, `test_import_bundle/trades_*.csv` |
| Sample run bundle | `sample_run_bundle/config.json` |

Neither test bundle config.json was produced by a real sidecar run — both are hand-crafted test fixtures. No sidecar-generated config.json is available for inspection.

---

## Per-Field Findings

---

### 1. `conflict` — Position Conflict Mode

| | |
|---|---|
| **Frontend cfg key** | `conflict` |
| **Frontend default** | `"Allow Auto Reversal"` |
| **Candidate backend keys searched** | `position_conflict`, `conflict`, `conflict_mode`, `allow_auto_reversal` |

**Evidence:**

- `DESIGN_CONFIG_OB_STATS_V2.md` line 85: Explicitly lists `position_conflict / cancel_action` as fields **currently missing** from the Run Detail config panel, meaning they are not present in current run bundles.
- `DESIGN_CONFIG_OB_STATS_V2.md` line 171: Proposes reading `runData?.config?.position_conflict ?? runData?.config?.conflict ?? "—"` — written as a future design, not as reading something that currently exists.
- `DESIGN_CONFIG_OB_STATS_V2.md` line 410: States these fields are "present in raw config" — this appears to be the same design doc author describing a desired state, contradicted by line 85's explicit "currently missing" statement.
- `importer.js`: Has NO reference to `position_conflict` or `cancel_action` anywhere. If the backend emitted these fields in config.json, the importer would need to read them for round-trip support — it does not.
- `store.js` configSummary: Does NOT include these fields.
- `test_import_bundle/config.json`: Does NOT contain `position_conflict` or `cancel_action`.
- Trade CSV: Does contain `reverse_conflict` / `reverse_cancel` as a **trade-level output column** (per `importer.js` line 342). This is a per-trade field indicating whether a specific trade was cancelled due to position reversal — it is NOT a config key.
- `buildRunConfigLoadReport()`: IS prepared to read `position_conflict` from config if present — written defensively for when the backend eventually outputs it.

**Assessment:** The backend execution engine almost certainly handles position conflicts internally with default logic. It does not currently accept `position_conflict` as a config parameter (no importer support, not in test bundles, not emitted by frontend). The design doc explicitly lists this as a missing field.

| | |
|---|---|
| **Backend support status** | ❌ NOT CONFIRMED |
| **Exact accepted key** | Unknown (backend code inaccessible) |
| **Accepted value shape** | Unknown |
| **Execution usage location** | Internal engine default (not configurable via sidecar input) |
| **Safe to emit now** | **NO** |
| **Recommendation** | Do not emit. Requires backend implementation to accept `position_conflict` as a config parameter. Once implemented, the correct key is likely `position_conflict` (first in `applyFirstPresent` list, consistent with design doc usage). |

---

### 2. `cancelAction` — Cancelled-by-Conflict Action

| | |
|---|---|
| **Frontend cfg key** | `cancelAction` |
| **Frontend default** | `"Kill OB"` |
| **Candidate backend keys searched** | `cancel_action`, `cancelled_by_conflict`, `canceled_by_conflict`, `conflict_cancel_action` |

**Evidence:** Identical pattern to `conflict`. Same design doc mentions, same absence from importer.js, same absence from test bundle config.json. The two fields are logically linked — `position_conflict` defines whether to allow reversal; `cancel_action` defines what happens to the conflicting OB when reversal occurs.

- `DESIGN_CONFIG_OB_STATS_V2.md` line 172: Proposes reading `runData?.config?.cancel_action ?? "—"` as future design.
- `DESIGN_CONFIG_OB_STATS_V3.md` line 446: Same proposed config path.
- `importer.js`: Zero references to `cancel_action` or any alias.

| | |
|---|---|
| **Backend support status** | ❌ NOT CONFIRMED |
| **Exact accepted key** | Unknown |
| **Accepted value shape** | Unknown |
| **Execution usage location** | Internal engine default (same conflict-handling subsystem as `position_conflict`) |
| **Safe to emit now** | **NO** |
| **Recommendation** | Do not emit. Implement alongside `position_conflict` — they are a pair. Likely backend key: `cancel_action`. |

---

### 3. `originSession` — OB Origin Session Filter

| | |
|---|---|
| **Frontend cfg key** | `originSession` |
| **Frontend default** | `"Any"` |
| **Candidate backend keys searched** | `origin_session`, `ob_origin_session`, `originSession` |

**Evidence — critical distinction:**

`ob_origin_session` exists in this codebase in TWO distinct roles that must not be confused:

**Role A — OUTPUT METADATA (confirmed, exists today):**
- `importer.js` line 228 (`parseOrderBlocksCSV`): Reads `ob_origin_session` as a **per-OB column** from order_blocks.csv. Each detected OB carries metadata about what trading session it was formed in.
- `importer.js` line 592: Same field promoted to trade level.
- `PRETRIGGER-CANCEL-1.md` line 207: Describes `ob_origin_session`, `ob_detection_session`, `fill_session` as "existing session infrastructure" — referring to these output metadata tags.
- These are fields the backend PRODUCES in its CSV output. They are not config INPUT parameters.

**Role B — CONFIG FILTER PARAMETER (intended, not yet implemented):**
- The frontend cfg field `originSession` / `detectionSession` would be an INPUT filter: "only process OBs that were formed/detected in session X."
- This is a different concept — an upstream filter on which OBs the engine considers.
- `DESIGN_CONFIG_OB_STATS_V2.md` line 449: Explicitly states that using `ob_origin_session` for per-session OB counts "would require `ob_origin_session` in the OB CSV, which is **currently only on trades**" — confirming the field is NOT even on OBs yet, let alone as a config filter.
- `test_import_bundle/order_blocks.csv`: Does NOT contain `ob_origin_session` column.
- `test_import_bundle/trades_*.csv`: Does NOT contain `ob_origin_session` column.
- `buildRunConfigLoadReport()`: IS prepared to read `origin_session`/`ob_origin_session` from config — written defensively.

**Assessment:** The backend outputs per-OB session metadata fields (Role A) but does NOT accept session origin/detection FILTER parameters via config (Role B). The `originSession` / `detectionSession` cfg fields are config FILTER parameters — Role B — which has no backend implementation.

| | |
|---|---|
| **Backend support status** | ❌ NOT CONFIRMED (as config input filter) |
| **Exact accepted key** | Unknown for filter role |
| **Accepted value shape** | Unknown (presumably `"London"`, `"New York"`, `"Asia"`, `"London Lull"`, `"Any"`) |
| **Execution usage location** | N/A — Role B does not exist in backend yet |
| **Safe to emit now** | **NO** |
| **Recommendation** | Do not emit. This is a backend feature gap. The backend produces `ob_origin_session` as output metadata on OBs/trades, but does not accept it as an input filter. Requires new backend implementation. Note: `ob_origin_session` is not yet produced on the OB CSV either (only on trades, and even that is absent from current test bundles — may be newer than the test fixtures). |

---

### 4. `detectionSession` — OB Detection Session Filter

Identical status to `originSession`. The backend has the concept of `ob_detection_session` as output metadata (same infrastructure as `ob_origin_session`), but does not accept it as a config filter parameter.

| | |
|---|---|
| **Backend support status** | ❌ NOT CONFIRMED (as config input filter) |
| **Exact accepted key** | Unknown for filter role |
| **Accepted value shape** | Same as originSession |
| **Execution usage location** | N/A — Role B does not exist in backend yet |
| **Safe to emit now** | **NO** |
| **Recommendation** | Do not emit. Implement as a pair with `originSession`. Likely backend key when implemented: `origin_session` / `detection_session` (first in `applyFirstPresent` lists). |

---

### 5. `monteCarlo` — Monte Carlo Simulation Mode

| | |
|---|---|
| **Frontend cfg key** | `monteCarlo` |
| **Frontend default** | `false` |
| **Candidate backend keys searched** | `monte_carlo`, `monteCarlo`, `monte_carlo_enabled` |

**Evidence — definitive:**

- `MonteCarlo.jsx` line 22–23 (the dedicated Monte Carlo page): **"Placeholder mock until engine integration"** and **"simulator not yet wired — controls render UI state only; values shown are mock outputs"**
- `StrategyBuilder.jsx` line 1197–1200: Has a toggle for `monteCarlo` but `buildBacktesterConfig()` does NOT emit it anywhere in the sidecarConfig object.
- **Zero references** to `monte_carlo`, `monteCarlo`, or `Monte Carlo` in `importer.js`, `store.js`, any test bundle, or any design doc.
- The `LOAD_FIELD_LABELS` entry and `buildRunConfigLoadReport` entry for `monteCarlo` appear to be pre-wiring for a future integration, not evidence of current backend support.

**Assessment:** The Monte Carlo feature is explicitly a frontend placeholder. The execution engine has no Monte Carlo mode. The toggle exists in StrategyBuilder's UI but has no effect on any run.

| | |
|---|---|
| **Backend support status** | ❌ NOT IMPLEMENTED (explicitly placeholder) |
| **Exact accepted key** | None — not implemented |
| **Accepted value shape** | N/A |
| **Execution usage location** | N/A |
| **Safe to emit now** | **NO** |
| **Recommendation** | Do not emit. Remove the toggle from StrategyBuilder UI or clearly label it "Coming soon" to avoid user confusion. Backend must be built from scratch before this field can be used. |

---

## Summary Table

| Frontend key | Candidate backend key | Backend status | In test config.json | In importer.js | Safe to emit | Action |
|---|---|---|---|---|---|---|
| `conflict` | `position_conflict` | ❌ Not confirmed | No | No | **NO** | Backend implementation required |
| `cancelAction` | `cancel_action` | ❌ Not confirmed | No | No | **NO** | Backend implementation required (pair with conflict) |
| `originSession` | `origin_session` | ❌ Not confirmed (as filter) | No | No (as filter) | **NO** | Backend filter feature required; output metadata exists as different concept |
| `detectionSession` | `detection_session` | ❌ Not confirmed (as filter) | No | No (as filter) | **NO** | Same as originSession |
| `monteCarlo` | `monte_carlo` | ❌ Explicitly not implemented | No | No | **NO** | Full backend feature required; UI should be labeled placeholder |

**All 5 fields remain `emitted: false` in configRegistry.js. No changes to StrategyBuilder.jsx are warranted.**

---

## Audit Limitation

The FX-OB-Backtester Python source (config.py, run_backtest.py, sidecar/server.py) was not accessible. All findings are based on frontend code evidence and design documentation. To definitively close this audit, the following search should be run against the backtester source when accessible:

```bash
grep -rn "position_conflict\|cancel_action\|origin_session\|detection_session\|monte_carlo" \
  src/ scripts/ sidecar/ --include="*.py"
```

If any of these keys appear in a config schema, Pydantic model, or config dict in run_backtest.py, the corresponding field is safe to emit. Update configRegistry.js `emitted: true` and `backendKey` accordingly, then add the emission to `buildBacktesterConfig()` in StrategyBuilder.jsx.

---

## configRegistry.js — No Changes Required

Phase 1 registry correctly has all 5 fields as `emitted: false, backendKey: ""`. This audit confirms that designation. No updates to configRegistry.js or StrategyBuilder.jsx.
