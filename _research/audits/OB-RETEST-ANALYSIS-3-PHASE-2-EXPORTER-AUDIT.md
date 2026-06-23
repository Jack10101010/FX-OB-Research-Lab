# OB Retest Analysis — Phase 2 Exporter Audit (OB-RETEST-3)

**Status:** Audit only — no implementation, no frontend changes, no backend changes.
**Source of truth:** `OB-RETEST-ANALYSIS-1.md` (model), `OB-RETEST-ANALYSIS-2-PHASE-1-PLAN.md` (Phase 1 frontend MVP), `LUX-GHOST-PHASE-1-integration.md` (backtester structure).
**Goal:** Determine the smallest, safest way to make the **backtester emit authoritative retest artifacts** (`ob_retests.csv`, optional per-OB aggregates, `summary.json` stats) so the frontend can later prefer backend data over the Phase 1 derived fallback.

---

## 0. Headline finding (read this first)

**The authoritative exporter does not live in this repository.** The only Python here is `backend/server.py` (a FastAPI status stub), `ghost_tracker.py` + `ghost_tracker_test.py` (a drop-in module *for* the backtester, plus its test), and `tests/__init__.py`. **None of them emit `order_blocks.csv`, `trades_*.csv`, or `summary.json`.**

The real producer is a **separate repo — `lux-ob-backtester`** (a.k.a. FX-OB-Backtester), confirmed by:
- `LUX-GHOST-PHASE-1-integration.md` → "Copy `ghost_tracker.py` into the backtester repo (same directory as `execution.py` / `run_backtest.py`)".
- `ghost_tracker.py` docstring → "Phase 1 Ghost Tracking for **Lux-OB-Backtester**".
- `PROJECT_STATUS.md` → warns "Do NOT run frontend git commands from `FX-OB-Backtester`" (a sibling folder/repo, not mounted in this workspace).

**Consequence:** Phase 2 code lands primarily in the **backtester repo**, which is not available to read here. This audit is therefore anchored on (a) the integration guide, which authoritatively documents the backtester's structure and the proven additive-export pattern, and (b) the run-bundle schemas already established in Phase 0/1. Anything that depends on backtester internals I could not read is explicitly flagged **[VERIFY in backtester repo]**.

The good news: the **ghost-tracking integration is a complete, proven template** for exactly this kind of additive export, and retest export is *structurally simpler and safer* than ghost (it needs no live simulation state).

---

## 1. Files read

| File | Why |
|---|---|
| `ghost_tracker.py` | The per-candle OB replay state machine + additive-export contract (the template). |
| `ghost_tracker_test.py` | The established stdlib test/verification pattern (bull/bear/never/invalidated/unfilled + summary arithmetic + "real rows untouched"). |
| `LUX-GHOST-PHASE-1-integration.md` | Authoritative map of the backtester: `execution.py` (candle loop), `run_backtest.py` (summary export), and the additive integration steps. |
| `backend/server.py` | Confirmed: stub, not a producer. |
| (re-used from Phase 0/1) `test_import_bundle/` schemas, `frontend/src/data/obRetest.js`, `importer.js` | Bundle schema + the already-validated Phase 1 retest definitions to port. |
| Search: all `*.py`, grep for `order_blocks|to_csv|summary.json|detection_time` | Proved no exporter source is present in this repo. |

---

## 2. Current export flow (reconstructed)

The backtester (`lux-ob-backtester`, **not in this repo**) produces a run bundle:

```
config.json          run config (symbol, TFs, swing_length, rr, execution_modes, …)
candles.csv          execution-TF OHLC (time,open,high,low,close,volume) — the full price series
order_blocks.csv     ob_id, direction, structure_tag, origin_time, detection_time, pivot_*,
                     origin_index, detection_index, top, bottom, break_level, swing_length, ob_filter, …
trades_<mode>[__variant].csv   one row per OB setup, keyed by ob_id: detection_time, fill_time,
                     exit_time, outcome, pnl_r, max_ob_penetration_*, ob_fully_breached,
                     close_confirmed_ob_breach, missed_trade, bars_to_fill, …
summary.json         { config, ob_count, bullish/bearish/bos/choch counts, execution_modes{…}, … }
```

From the integration guide, the producing code is split as:
- **`execution.py`** — runs the OB candidate loop and the innermost execution-TF candle loop that checks real OB fills; builds each trade CSV row. **[VERIFY: exact row-build function]**
- **`run_backtest.py`** — orchestrates the run and builds `summary.json`. **[VERIFY: where order_blocks.csv is written]**

The ghost integration appends 10 columns to trade rows and 9 fields to `summary.json` — "byte-identical" existing output, columns appended **after** existing ones. This is the additive contract Phase 2 must follow.

---

## 3. Current OB lifecycle / replay flow

Two replay mechanisms exist today; **neither tracks retests**:

**(a) `ghost_tracker.py` (Python, in this repo, integrated into the backtester).**
A per-candle state machine over one OB's geometry: `add_candidate(ob, reason)` → `tick_all(candle, i)` in the live loop → `finalize_all()` → `get_fields(ob_id)` / `summary_fields()`. It computes penetration %, fill at limit, TP/SL/protection, MAE/MFE, and **invalidation = close beyond the OB far side** (`_check_invalidation`: bull `close < bottom`, bear `close > top`). Crucially it **only tracks cancelled OBs** (a subset) and **`finalize`s at the first resolution** (`self.finalized = True` → stops ticking). It never looks for a later return.

**(b) `frontend/src/data/obRetest.js` (Phase 1, JS, already shipped).**
The retest engine: replays candles against every OB's bounds, **continues past first touch**, debounces re-entries, and classifies each retest survived/failed/open with a reaction window. This is the logic Phase 2 must make authoritative on the backend.

So the gap is unchanged from Phase 1: the backend has the *geometry primitives* (ghost) and the *candle data*, but emits **no retest events, counts, reactions, or survival outcomes**. Phase 1 fills this in the browser; Phase 2 moves it to the producer.

---

## 4. Exact modification points

All in the **`lux-ob-backtester` repo** (not this one). Mirrors the ghost integration so the diff is small and proven-shaped.

**M1 — New module: `lux-ob-backtester/retest_tracker.py`** *(authored/staged in THIS repo first, like ghost_tracker.py, then dropped in).*
Self-contained, stdlib-only. A Python port of the validated `obRetest.js` engine. Public API mirrors ghost for familiarity but is a **post-processor**, not a live ticker:
```python
exporter = RetestExporter(config, order_blocks, candles, trades_by_ob_id)
result   = exporter.compute()          # -> {events: [...], per_ob: {...}, summary: {...}}
exporter.write_csv(out_dir)            # writes ob_retests.csv (+ optional ob_retest_summary.csv)
summary.update(exporter.summary_fields())
```

**M2 — `run_backtest.py` export step (the ONLY integration site).**
After `order_blocks.csv`, the trades CSVs, and `summary.json` content are built, and while candles are available:
```python
if config.get("emit_ob_retests"):                       # opt-in flag — default OFF
    from retest_tracker import RetestExporter
    rex = RetestExporter(config, order_blocks, candles, trades_by_ob)
    rex.compute()
    rex.write_csv(run_output_dir)                        # NEW file(s)
    summary.update(rex.summary_fields())                 # additive keys only
```
**[VERIFY: candles retained in memory at summary-build time; if not, RetestExporter re-reads the just-written `candles.csv`.]**

**M3 — `execution.py`: NO CHANGE.** The trade simulation loop is untouched. This is the core safety guarantee — retest export cannot alter any trade result because it runs *after*, reading outputs.

**M4 — Config: one additive key** `emit_ob_retests: bool` (default `false`) + reuse/echo the Phase 1 criteria so backend and frontend agree: `retest_reaction_window_candles`, `retest_reaction_min_pips`, `retest_failure_threshold`. When the flag is off, **every existing output is byte-identical to today.**

**M5 — Frontend (LATER, explicitly out of scope here):** `importer.js` gains an optional `ob_retests.csv` parser; Retest Lab prefers the backend artifact when present and falls back to the Phase 1 derived engine; add a derived-vs-backend parity check. Not part of Phase 2 backend work.

---

## 5. Proposed `ob_retests.csv` schema (primary new artifact)

One row per detected retest event. Direct serialization of the Phase 1 `RetestEvent` model (§2 of plan), so backend == frontend semantics.

```
ob_id, direction, structure, detection_time,
first_touch_time, first_fill_time, first_touch_outcome, first_touch_was_traded,
retest_index, retest_time, retest_candle_index, retest_type,
entry_penetration_pct, max_penetration_pct,
reaction_max_pips, reaction_met,
outcome, failure_mode, candles_to_failure,
session, minutes_since_first_touch
```

- `direction` ∈ {bullish, bearish} · `structure` ∈ {BOS, CHoCH, ""}
- `retest_type` ∈ {wick_only, clean, deep, close_inside, full_penetration_no_invalidation}
- `outcome` ∈ {survived, failed, open} — **survived = completed window, no breach; failed = breach in window; open = right-censored** (excluded from rates)
- `failure_mode` ∈ {none, wick_breach, close_breach}
- `first_touch_time` = raw candle touch (canonical); `first_fill_time` = from the trade (annotation, never conflated)

Backward-compat: a brand-new file. Runs without retest export simply omit it; the frontend importer treats it as optional.

---

## 6. Proposed per-OB aggregate fields

**Recommended: a separate sidecar `ob_retest_summary.csv`, keyed by `ob_id`** (zero risk to `order_blocks.csv`):
```
ob_id, ob_touch_count, retest_count, retests_survived, retests_failed, retests_open,
first_retest_outcome, final_outcome, invalidated_on_retest_index,
max_reaction_pips_any_retest, time_to_invalidation_minutes
```

*Alternative* (if you prefer one file): append these same columns to `order_blocks.csv` **after** all existing columns (the ghost-pattern rule — no column-index shift). The sidecar is the safer default because it leaves `order_blocks.csv` byte-identical; the frontend can join on `ob_id` exactly as it joins trades today.

---

## 7. Proposed `summary.json` fields (additive, mirrors `ghost_*`)

```
ob_retest_total                  int
ob_with_retest_count             int
retest_rate                      float   # ob_with_retest_count / obs_with_first_touch
retest_survival_rate             float   # survived / (survived + failed)  [closed only]
retest_failure_rate              float
retest_open_count                int     # right-censored, excluded from rates
avg_reaction_pips_on_retest      float
avg_candles_to_failure           float
retest_breakdown_by_session      {session: {n, survived, failed, open}}
retest_breakdown_by_structure    {BOS|CHoCH: {...}}
retest_breakdown_by_direction    {bullish|bearish: {...}}
```
Invariant to assert in tests (matches ghost's sum-check): `survived + failed + open == ob_retest_total`.

---

## 8. Implementation phases

| Phase | Deliverable | Lands in |
|---|---|---|
| **2.0 — This audit** | Confirm exporter location, schemas, safe path. | this repo (doc) |
| **2.1 — `retest_tracker.py` + test** | Port `obRetest.js` to stdlib Python; `retest_tracker_test.py` mirroring `ghost_tracker_test.py` (bull/bear × survived/failed/open/debounce + summary sum-check). Author in THIS repo (like ghost), no integration yet. | this repo → drop into backtester |
| **2.2 — Backtester wiring** | Add `emit_ob_retests` flag + the M2 export-step call in `run_backtest.py`. Write `ob_retests.csv` (+ sidecar) + summary keys. Verify existing outputs byte-identical when flag off. | `lux-ob-backtester` |
| **2.3 — Parity validation** | Run a bundle with the flag on; compare backend `ob_retests.csv` against the frontend Phase 1 derived events on the same run/config; reconcile any divergence. | both repos |
| **2.4 — Frontend prefer-backend** | `importer.js` optional parser; Retest Lab prefers backend artifact, derived fallback; basis badge flips "Derived → Backend". | this repo (separate task) |

---

## 9. Risks / edge cases

1. **Definition parity (highest risk).** Backend and frontend must share identical criteria (`reaction_window`, `reaction_min_pips`, `failure_threshold`) and identical tie-break conventions (same-candle reaction-vs-breach; close-vs-wick breach). Port `obRetest.js` verbatim and cross-validate (Phase 2.3) — divergence would make the two bases contradict each other.
2. **Invalidation-definition consistency.** Three notions of "breach" already exist (`ob_fully_breached`, `close_confirmed_ob_breach` in trades, and the retest `failure_threshold`). They must agree or the Retest Lab will contradict the Failure Lab. Reuse the same close-beyond semantics and buffer.
3. **Candles required.** Post-processing needs `candles.csv`. If a run omits candles, skip retest export (write nothing) and let the frontend keep its "no candles" gate — never emit a half-populated file.
4. **Config flag default OFF.** Guarantees current backtest results/outputs are byte-identical until retest export is explicitly enabled (the "passive/opt-in" constraint).
5. **Right-censoring.** Open retests (window past data end) must be excluded from rates and reported separately — identical to Phase 1.
6. **Reaction sign per direction.** Bull favorable = up, bear = down; a sign flip silently inverts everything. Unit-test both (the ghost test already models bull+bear — mirror it).
7. **Detection-TF vs execution-TF.** Compare raw prices to `[bottom, top]`, never bar indices (OB bounds are detection-TF; candles are execution-TF).
8. **Performance.** A second pass over ~25k candles × ~150 OBs in Python is sub-second with windowed early-stop; negligible vs a full backtest. Not a reason to integrate live.
9. **Column ordering** (only if appending to `order_blocks.csv` instead of the sidecar): append after all existing columns so downstream index-based parsers don't break.
10. **ob_id join integrity.** `ob_retests.csv` and the sidecar key on `ob_id`; ensure the backtester's `ob_id` formatting matches what `order_blocks.csv` / trades use (the frontend importer already normalizes numeric ob_id keys).
11. **First touch ≠ first fill.** Keep both fields distinct in the export (Phase 1 lesson); the backend has `fill_time` in trades for the fill annotation.

---

## 10. Post-processing vs live candle loop — recommendation

**Recommendation: POST-PROCESSING PASS. Do not integrate into the live candle loop.**

| | Post-processing (recommended) | Live-loop (ghost-style) |
|---|---|---|
| Touches `execution.py` trade loop | **No** — reads outputs only | Yes — edits the hot loop |
| Can alter backtest results | **Impossible** | Possible if mis-wired |
| Needs live simulation state | **No** (OB bounds + candles + first-touch outcome are all post-hoc) | n/a |
| Backward-compat guarantee | **Strongest** (new file; flag-gated) | Strong but riskier |
| Cost | One extra candle pass (<1s) | Folded into existing pass |
| Integration sites | **1** (`run_backtest.py` export step) | Many (register + tick + finalize + row-build) |

The decisive reason: **retest detection requires no live trade state.** Ghost integrates live *only* because it needs entry/stop/tp captured at the cancel instant, which isn't otherwise exported. Retests need only geometry that already exists in the finished bundle (`order_blocks.csv` bounds + `candles.csv` + `trades_*.csv` first-touch outcome via `ob_id`). Computing them after the run, behind an `emit_ob_retests` flag, makes it **physically impossible to disturb existing trade results or outputs** — exactly the constraint set. The only thing a live integration would buy is avoiding a second candle pass, which is sub-second and not worth the risk surface.

A further benefit: the post-processor is a near-direct Python port of the already-shipped, already-tested `obRetest.js`, so frontend↔backend parity (Phase 2.3) is a straightforward equality check rather than a reconciliation of two independently-written engines.

---

*End of OB-RETEST-3. Audit only — no code changed, no backend touched, no frontend touched. Backtester-repo modification points flagged [VERIFY] where source was not readable from this workspace.*
