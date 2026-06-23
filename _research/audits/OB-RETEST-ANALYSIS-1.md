# OB Retest Analysis — Audit & Design (OB-RETEST-1)

**Status:** Design only — no implementation.
**Scope:** Audit current data availability + design a new "OB Retest Analysis" feature for Order Block Lab.
**Question being answered:** When an order block is retested *after* its first interaction (touch/fill), how often does it survive, fail, or produce a meaningful reaction? Old OBs sometimes flip into support/resistance — we want quantitative analytics on that, not visual hand-waving.

---

## 1. Files read

Targeted read set (no unnecessary scanning):

| File | Why it mattered |
|---|---|
| `backend/server.py` | Confirm what the FastAPI "backend" actually does. |
| `sample_run_bundle/{config,summary}.json`, `order_blocks.csv`, `trades_single_position.csv` | Minimal canonical export shape. |
| `test_import_bundle/order_blocks.csv` | Real OB export schema (20 columns). |
| `test_import_bundle/trades_*.csv` (header) | Real trade export schema (58 columns, incl. `ob_id`). |
| `test_import_bundle/candles.csv` | Confirms execution-TF OHLC is shipped in full bundles (24.9k rows). |
| `test_import_bundle/summary.json`, `config.json` | Run-level aggregate + config shape. |
| `ghost_tracker.py` | The existing per-candle OB replay state machine. |
| `frontend/src/data/obLifecycle.js` | Current per-OB lifecycle derivation (frontend). |
| `frontend/src/data/importer.js` | OB / trade / candle parsing + OB↔trade join + candle-index infra. |
| `frontend/src/data/artifactStore.js` | Candles persisted to IndexedDB per run. |
| `frontend/src/pages/OrderBlockLab.jsx` | Tab IA, research backlog, existing "First Touch vs Re-test" stub. |
| `frontend/src/components/lab/OBLabTabShell.jsx` | Tab-shell contract for adding a 6th tab. |

---

## 2. Architecture reality check (important)

There are **two "backends"** and only one of them produces data:

1. **`backend/server.py`** — a FastAPI stub. It only serves `/api/status` Mongo health checks. **It does not produce, store, or compute any run/OB/trade data.** Ignore it for this feature except as a future API host.
2. **The external backtester ("Lux-OB-Backtester")** — produces the **run bundle** that the lab imports. This is the real "backend run output." `ghost_tracker.py` is a module written *for that backtester* (its docstring references `LUX-GHOST-PHASE-1-integration.md` and the backtester's candle loop), not for `server.py`.

So "backend run output" throughout this doc = **the run bundle** (`order_blocks.csv`, `trades_*.csv`, `summary.json`, `candles.csv`, `config.json`). The Order Block Lab page is a **pure consumer**: it imports a bundle, parses it (`importer.js`), persists it (`artifactStore.js` → IndexedDB), and derives analytics (`obLifecycle.js`, bucket tables).

**Data flow:** `bundle CSV/JSON → importer.js (parse + OB↔trade join via ob_id) → store.js / artifactStore.js (IndexedDB) → useDataset()/useTradeUniverse() → OrderBlockLab.jsx tabs → bucket tables / lifecycle strips / chart overlays.`

---

## 3. Current data availability

### 3.1 OB metadata — `order_blocks.csv` (real schema)

```
ob_id, direction, structure_tag, origin_time, detection_time, pivot_time,
pivot_index, origin_index, detection_index, top, bottom, break_level,
swing_length, ob_filter, origin_open, origin_high, origin_low, origin_close,
parsed_high, parsed_low
```

Gives us, per OB: identity, **direction** (bullish/bearish), **structure** (BOS/CHoCH), **detection time/index**, **price bounds** (top/bottom), break level, origin candle. `importer.js::parseOrderBlocksCSV` *also tolerates* a richer optional lifecycle schema if present (`ob_final_status`, `fill_time`, `exit_time`, `cancel_time`, `invalidation_time`, `*_session`, news-window fields) — but the canonical exporter does **not** currently emit those, and **none of them are retest-related.**

### 3.2 Trades — `trades_*.csv` (real schema, 58 cols, multiple exit-policy variants)

Linked to OBs via **`ob_id`** (`importer.js::enrichTradesWithOrderBlocks`). Relevant columns:

```
trade_id, ob_id, direction, structure_tag, detection_time, fill_time, exit_time,
outcome, entry, stop, tp, rr_multiple, pnl_r, fill_candle_index, exit_candle_index,
bars_to_exit, max_ob_penetration_price/pct/pips, ob_fully_breached,
fill_penetration_pct/pips, entry_depth_pct, close_confirmed_ob_breach,
close_breach_time/price/distance_pips/session/hour, entry_model, missed_trade,
missed_reason, bars_to_fill, minutes_to_fill, ...
```

This captures the **first interaction only** (one trade row per OB), and **only for OBs that produced a setup**. It already gives us a strong notion of *first-touch outcome*, *first breach*, and *first-fill penetration* — but the record **ends at the first trade's exit/breach.** Nothing tracks what price does to that OB zone afterwards.

### 3.3 Candles — `candles.csv`

Full execution-TF OHLC (1-min, ~24.9k rows in the test bundle). **Parsed (`parseCandlesCSV`) and persisted to IndexedDB** (`artifactStore.js` candles store, keyed by `runId`; `loadCandles`/`hasCandles`). `importer.js` also has time→candle-index infra (`computeTradeMarkers`, candle index lookup). **This is the key enabler:** with candle data + OB bounds, retests are *reconstructable* without re-running the backtester — **when the bundle includes candles** (note: `sample_run_bundle` omits `candles.csv`; it is optional/large).

### 3.4 Existing OB lifecycle modeling — `obLifecycle.js`

`deriveOBLifecycle(ob, trade, lastCandleTime)` joins each OB to its **first** trade and produces a single-interaction lifecycle: a `status` (win/loss/be/invalidated/protection_exit/unfilled/no_trade/…), a `fillTime`, `exitTime`, `invalidationTime`, and a single `rightTime` (where the OB "ends" on the chart). **It models one touch and one resolution per OB. There is no concept of a later return.**

### 3.5 Existing replay machinery — `ghost_tracker.py`

A per-candle state machine that replays execution-TF candles against one OB's geometry: computes **penetration %**, detects **fill**, detects **invalidation** (`close` beyond the distal edge — bull: `close < bottom`, bear: `close > top`), tracks **MAE/MFE in R**, and resolves TP/SL/protection. It is exactly the right primitive to reuse — **but it `finalize`s at the first resolution and stops ticking.** It does not continue past first exit to find retests.

### 3.6 The feature is already on the roadmap (unbuilt)

- `OrderBlockLab.jsx` → `RESEARCH_BACKLOG_ITEMS`: **"First Touch vs Re-test Performance" — status "Requires OB visit count" — "Requires an `ob_touch_count` or equivalent field from the exporter."**
- `ghost_tracker.py` header: **`ob_touch_count — deferred to Phase 4`.**

So this design formalizes a known gap rather than inventing one.

### 3.7 Availability summary

| Lifecycle fact | Available today? | Source |
|---|---|---|
| OB created/detected time | ✅ Yes | `order_blocks.csv: detection_time/origin_time` |
| OB price bounds | ✅ Yes | `order_blocks.csv: top/bottom` |
| Direction (bull/bear) | ✅ Yes | `order_blocks.csv: direction` |
| Structure (BOS/CHoCH) | ✅ Yes | `order_blocks.csv: structure_tag` |
| First touch / fill time | ⚠️ Partial | `trades_*.csv: fill_time` — **traded OBs only**; raw "touch" (untraded) not emitted |
| Whether a trade was placed | ✅ Derivable | `ob_id` present in `trades_*.csv` |
| First-touch outcome | ✅ Yes (traded) | `trades_*.csv: outcome/pnl_r` |
| First invalidation/breach | ✅ Yes (traded) | `trades_*.csv: ob_fully_breached, close_confirmed_ob_breach` |
| **Later retests after first touch** | ❌ **No** | not in any export |
| **Reactions after retest** | ❌ **No** | not in any export |
| **OB touch count** | ❌ **No** | explicitly deferred (`ob_touch_count`) |
| Raw candles for reconstruction | ✅ Yes* | `candles.csv` (*when bundle includes it) |

**Bottom line:** Everything needed to *define* a retest exists as geometry (OB bounds + candles), but **no retest events, counts, reactions, or survival outcomes are currently produced or stored.** The first-touch half is well covered by the trades export; the **retest half is entirely missing.**

---

## 4. Where this belongs: backend, frontend, or both?

**Both — phased, with the authoritative computation eventually in the backtester.**

| Option | Pros | Cons |
|---|---|---|
| **Frontend-derived** (replay candles in JS) | Ships against existing bundles; no backtester change; fast research iteration; candles already in IndexedDB; reuses time-index infra | Only works when `candles.csv` is in the bundle; recomputes per session; must mirror backtester geometry exactly or results diverge; heavier client compute (151 OB × ~25k candles) |
| **Backend run output** (backtester emits retest events) | Authoritative, tick-accurate, computed once; reuses `ghost_tracker` geometry + existing candle loop; works without shipping candles to client; consistent with `ob_fully_breached`/`close_confirmed_ob_breach` definitions | Requires backtester change + re-runs; slower to iterate; schema/version management |

**Recommendation:** Phase 1 = **frontend-derived MVP** (research velocity, no backtester dependency, gated on candles-present). Phase 2 = **promote to backend** as the source of truth, with the frontend preferring the backend artifact when present and falling back to derived. Cross-validate the two (a parity check, like the existing `ParityDebugger`). This mirrors how **ghost tracking** was rolled out (additive, backward-compatible, null-defaulted on absence).

---

## 5. Proposed analytics model

### 5.1 Geometry & terms (formalized so they are computable)

- **Proximal edge** = the edge price reaches first on a return. Bull OB → `top`; Bear OB → `bottom`.
- **Distal edge** = the far edge. Bull OB → `bottom`; Bear OB → `top`.
- **Penetration %** = depth into the zone ÷ OB height × 100 (identical to `ghost_tracker._penetration_pct`). 0% = touched proximal edge; 100% = reached distal edge.
- **Reaction (favorable)** = distance price travels *away* from the proximal edge in the OB's expected direction after a retest (bull = up, bear = down), measured in **pips and ATR multiples**.

### 5.2 Lifecycle states

```
DETECTED ──first entry──▶ FIRST_TOUCH ──resolves──▶ (first-touch outcome from trades or derived)
                                   │
                                   ├── price leaves zone (debounce) ──▶ eligible for RETEST
                                   │
        RETEST_k ◀───── price re-enters zone (penetration ≥ retest_entry_threshold), OB not yet invalidated
            │
            ├── within reaction_window: no breach + reaction ≥ reaction_min ──▶ SURVIVED_k
            ├── within reaction_window: breach per failure_threshold ─────────▶ FAILED_k  (terminal)
            └── window ends, still inside, no clear reaction ─────────────────▶ INCONCLUSIVE_k
```

### 5.3 Definitions (precise)

| Term | Definition |
|---|---|
| **First touch** | First candle after `detection_time` where price enters `[bottom, top]` by ≥ `touch_epsilon`. For **traded** OBs this aligns with `fill_time`; for **untraded** OBs it is derived from candles. (We expose both `first_touch_time` and `first_fill_time` because they can differ — passive limit fill ≠ raw wick touch.) |
| **Retest** | Any return to the OB (penetration ≥ `retest_entry_threshold` of the proximal edge) that occurs **after** the first touch has resolved **and** while the OB is **not yet invalidated**. Retests are indexed `1..N`. |
| **Debounce / "leaving the zone"** | Between two counted retests price must exit the zone — penetration must drop below `retest_exit_threshold` **or** move ≥ `reaction_min` away — otherwise it is the *same* visit, not a new retest. Prevents one slow grind from counting as 20 retests. |
| **Survived retest** | Within `reaction_window` candles of retest entry, the OB is **not** invalidated (per `failure_threshold`) **and** price produces a reaction ≥ `reaction_min`. |
| **Failed retest** | Within `reaction_window`, price invalidates the OB per `failure_threshold`. Terminal for that OB. |
| **Reaction** | `max` favorable excursion (pips + ATR) from proximal edge between retest entry and the earlier of {failure, window end, next retest}. |
| **Reclaim / SR-flip** *(optional, Phase 3)* | Price approaches the OB from the **opposite** side to its origin and reacts — e.g., a former bullish demand OB now rejecting price from above as resistance. Flagged when `approach_side = opposite`. |

### 5.4 Configurable criteria (single config object, with defaults)

```jsonc
{
  "reaction_window_candles": 10,          // 5 | 10 | 20 (execution-TF candles after retest)
  "reaction_min": { "mode": "pips", "pips": 8, "atr_mult": 0.5 },  // mode: "pips" | "atr"
  "failure_threshold": "close_beyond_ob", // "wick_beyond_ob" | "close_beyond_ob" | "full_ob_breach" | "pct_penetration"
  "failure_penetration_pct": 100,         // used when failure_threshold = "pct_penetration"
  "failure_buffer_pips": 0.0,             // mirrors trades close_breach_buffers_pips
  "retest_entry_threshold_pct": 0,        // penetration % that counts as "re-entered" (0 = proximal wick touch)
  "retest_exit_threshold_pct": 0,         // must drop below this to re-arm (debounce)
  "touch_epsilon_pips": 0.0,              // tolerance for first-touch detection
  "atr_period": 14,                       // ATR basis for reaction_min/atr buckets
  "count_first_touch_as_retest": false    // first touch is touch #0, retests start at #1
}
```

Plus the **slice/filter dimensions** the user asked for (these are *cuts*, not thresholds — they bucket the same events):

- **Retest type:** `clean` · `deep` · `wick_only` · `close_inside` · `full_penetration_no_invalidation`
- **First-touch state:** `traded` · `no_trade` · `skipped_by_filter` (origin/detection filter) · `news_blackout` · `session_cancel` · `reverse_touch_cancel`
- **First-touch session validity:** allowed session vs outside-session vs news-blackout (reuse OB `*_session` + news-window fields already parsed in `importer.js`)
- **Same-session vs cross-session retest** (reuse `ghost_tracker._SESSION_BOUNDARIES`)
- **Time elapsed** first touch → retest (minutes + candles + same/next session)
- **# retests before final failure**
- **Direction** (bull/bear) · **Structure** (BOS/CHoCH) · **Session** of detection / first touch / retest

### 5.5 Retest-type classification (deterministic)

| Type | Rule |
|---|---|
| `wick_only` | Wick enters zone, candle **closes** outside the proximal edge. |
| `clean` | Penetration ≤ ~33%, closes back outside or near proximal edge. |
| `deep` | Penetration between ~33% and < 100%. |
| `close_inside` | Candle **closes** inside `[bottom, top]`. |
| `full_penetration_no_invalidation` | Penetration reaches 100% (touches distal) but **no** close-beyond breach → still alive. |

(Thresholds configurable; defaults shown.)

---

## 6. Output design

### 6.1 Backend fields/events required (Phase 2 — additive, backward-compatible)

**(a) New artifact `ob_retests.csv` — one row per retest event:**

```
ob_id, retest_index, retest_time, retest_candle_index, approach_side,
retest_type, entry_penetration_pct, entry_penetration_pips,
max_penetration_pct, max_penetration_pips, reaction_max_pips, reaction_max_atr,
candles_to_reaction_peak, atr_at_retest, outcome, failure_mode,
candles_to_failure, reaction_window_used, session, same_session_as_first_touch,
minutes_since_first_touch, minutes_since_prev_retest, sr_flip
```
- `approach_side` ∈ {`proximal`, `distal`, `opposite`}
- `outcome` ∈ {`survived`, `failed`, `inconclusive`, `open`} (`open` = right-censored at data end)
- `failure_mode` ∈ {`none`, `wick_breach`, `close_breach`, `pct_breach`, `full_breach`}

**(b) New per-OB aggregate columns** (append to `order_blocks.csv`, or a join file keyed by `ob_id`):

```
ob_touch_count, retest_count, retests_survived, retests_failed,
first_retest_outcome, final_outcome, invalidated_on_retest_index,
max_reaction_pips_any_retest, time_to_invalidation_minutes,
first_touch_time, first_touch_was_traded, first_touch_outcome, first_touch_state
```

**(c) New `summary.json` aggregates** (mirrors the `ghost_*` summary pattern):

```
ob_retest_total, ob_with_retest_count, retest_rate,
retest_survival_rate, retest_failure_rate, avg_reaction_pips_on_retest,
avg_reaction_atr_on_retest, avg_candles_to_failure,
retest_breakdown_by_session{}, _by_structure{}, _by_direction{},
_by_first_touch_outcome{}, _by_reaction_bucket{}
```

**Compatibility rule (same as ghost tracking):** every field optional; the importer must default null/empty when absent so pre-feature runs still load.

### 6.2 Backend events (computation, Phase 2)

Reuse the `ghost_tracker` geometry but with a **post-first-touch retest observer** that does **not** finalize at first exit:
1. After an OB's first touch resolves, keep an observer alive while the OB is un-invalidated.
2. Per execution-TF candle: track zone entry/exit (with debounce), classify retest type, run a `reaction_window` look-forward to measure reaction + detect failure.
3. Emit one `ob_retests.csv` row per counted retest; roll up per-OB and per-run aggregates.

### 6.3 Frontend analytics cards needed

Summary cards (top of the Retest Lab tab):

1. **Total OBs retested** (count + % of all OBs)
2. **Retest rate %** — OBs with ≥1 retest ÷ OBs that had a first touch
3. **Survival rate %** — survived retests ÷ total retests
4. **Failure rate %** — failed retests ÷ total retests
5. **Avg reaction after retest** (pips, with ATR-mult secondary)
6. **Avg candles until failure**
7. **Best retest conditions** (highest-survival slice, e.g., "Bearish CHoCH, London, cross-session")
8. **Worst retest conditions** (lowest-survival slice)

### 6.4 Breakdown panels (reuse `CanonicalBucketTable` / `TableCompareShell`)

By **session** (detection / first-touch / retest) · by **BOS vs CHoCH** · by **bull vs bear** · by **first-touch outcome** (win/loss/be/no-trade) · by **first-touch state** (traded / no-trade / skipped-by-filter) · by **reaction-distance bucket** (pips or ATR) · by **time-elapsed-before-retest bucket** · by **retest index** (1st vs 2nd vs 3rd+) · by **retest type**.

### 6.5 Table columns (drill-through, reuse `DataTable` / Edge Explorer drill)

```
OB id · Direction · Structure · Detection time · First-touch time ·
First-touch outcome · Retest # · Retest time · Retest type · Max penetration % ·
Max reaction (pips / ATR) · Outcome (survived/failed/open) · Candles to failure ·
Session · Same/Cross session · Min since first touch · Notes/classification
```

### 6.6 Chart overlay ideas (OB Lab chart)

- **Retest markers** on the OB zone at each retest time, color-coded survived (green) / failed (red) / open (grey), numbered `R1, R2, …`.
- **Reaction vector** — a short arrow/segment from proximal edge showing reaction magnitude per retest.
- **Invalidation marker** at the breach candle (reuse existing `close_breach_time` styling).
- **OB lifespan bar** extended past first exit to the final retest/invalidation (today `obLifecycle.js` stops the zone at first `rightTime` — retest mode extends it).
- **SR-flip badge** when `approach_side = opposite`.
- Overlays should consume **emitted retest events** (Phase 2) rather than recompute, to stay in sync.

### 6.7 Tooltip / glossary text (every abbreviation + edge term)

| Term | Tooltip |
|---|---|
| **OB** | Order Block — a zone (price range) where institutional orders are presumed to rest. |
| **BOS** | Break of Structure — continuation: price breaks a prior swing in the trend direction. |
| **CHoCH** | Change of Character — first counter-trend structure break; potential reversal. |
| **SMC** | Smart Money Concepts — the methodology this lab researches. |
| **Bullish / Bearish OB** | Demand zone (expected to push price up) / supply zone (expected to push price down). |
| **Proximal edge** | The OB edge price reaches first on a return (bull = top, bear = bottom). |
| **Distal edge** | The far OB edge (bull = bottom, bear = top). |
| **Penetration %** | How deep into the OB price went: 0% = touched near edge, 100% = reached far edge. |
| **First touch** | First time price returns into the OB after it was detected. |
| **First fill** | First time price reaches the planned entry level (traded OBs); may differ from first touch. |
| **Retest** | A later return into the OB after the first touch has resolved and before invalidation. |
| **Survived retest** | Price re-entered the OB but did not breach it and reacted away within the window. |
| **Failed retest** | Price re-entered and then breached/invalidated the OB within the window. |
| **Invalidation / breach** | Price violates the OB beyond the configured threshold (wick / close / % / full). |
| **Reaction** | How far price moved away from the OB after a retest, in pips or ATR multiples. |
| **Reaction window** | The number of candles after a retest in which we judge survival vs failure. |
| **ATR** | Average True Range — a volatility yardstick; lets reactions be compared across regimes. |
| **R** | Risk multiple — profit/loss expressed in units of initial risk (1R = the stop distance). |
| **MAE / MFE** | Max Adverse / Favorable Excursion — worst/best unrealized move during a position. |
| **pip** | Smallest standard FX increment (0.0001 for EURUSD). |
| **Wick-only retest** | Wick entered the OB but the candle closed back outside the proximal edge. |
| **Clean retest** | Shallow tap (≤~33% penetration) that holds. |
| **Deep retest** | Penetration ~33–100% without a close-beyond breach. |
| **Close-inside retest** | A candle closed inside the OB range. |
| **Full penetration, no invalidation** | Price reached the far edge (100%) but never closed beyond it — OB still alive. |
| **SR-flip / Reclaim** | A former demand OB acting as resistance (or supply as support) — approached from the opposite side. |
| **Same / Cross session** | Whether the retest happened in the same trading session as the first touch or a later one. |
| **Open (right-censored)** | A retest whose window extended past the end of the data — outcome unknown, excluded from rates. |

---

## 7. Proposed UI structure

Add a **6th tab** to Order Block Lab named **"Retest Lab"** via the existing `OBLabTabShell` `TABS` array (`OrderBlockLab.jsx`, currently: Model Analysis · Edge Discovery · Failure Lab · Robustness · Promotion Desk). Inherits the shared `FilterBar`, persists under `oblab-active-tab-v1`, no new routing.

```
Retest Lab tab
├── Banner: data-basis chip ("Derived — frontend" | "Backend — authoritative") + candles-present gate
├── Config bar: reaction_window · reaction_min (pips/ATR) · failure_threshold · retest type filter
├── Summary cards (§6.3) — 8 KPI cards
├── Breakdown panels (§6.4) — CanonicalBucketTable / TableCompareShell, collapsible
├── Retest event table (§6.5) — DataTable with drill-through to Trade Inspector / chart
└── Chart overlays (§6.6) — wired into the existing OB Lab chart
```

If `candles.csv` is absent **and** no backend retest artifact exists, the tab renders an empty-state explaining the run needs candles or a re-run with retest export enabled (don't show misleading partial numbers).

---

## 8. Recommended implementation phases

| Phase | Deliverable | Depends on |
|---|---|---|
| **0 — Spec freeze (this doc)** | Lock definitions, config schema, glossary, field names. | — |
| **1 — Frontend-derived MVP** | `frontend/src/data/obRetest.js` (port `ghost_tracker` replay to JS, extended past first exit) replaying IndexedDB candles vs OB bounds; new **Retest Lab** tab; summary cards + event table + basic overlays. Basis labeled "Derived (frontend)". Gated on candles-present. | candles in bundle; `obLifecycle.js`, `artifactStore.js` |
| **2 — Backend authoritative** | Backtester emits `ob_retests.csv` + per-OB aggregates + `summary.json` retest fields (reusing `ghost_tracker` geometry). Importer parses them (default-null on absence). Frontend prefers backend artifact, falls back to derived. | backtester change + re-run |
| **2b — Parity check** | Cross-validate derived vs backend retests (pattern: `ParityDebugger`); reconcile invalidation definition with `ob_fully_breached` / `close_confirmed_ob_breach`. | Phases 1 + 2 |
| **3 — Depth** | SR-flip/reclaim classification, ATR reaction buckets, time-elapsed analytics, multi-run delta, Results-Basis / canonical-bucket integration. | Phase 2 |
| **4 — Promotion** | Feed retest survival stats into the Promotion Desk gating criteria. | Phase 3 |

---

## 9. Risks / edge cases

1. **Double-counting retests.** A slow grind can register many "entries." → require debounce (`retest_exit_threshold` / `reaction_min` exit) before a new retest counts.
2. **Defining "leaving the zone."** Sensitive to `retest_exit_threshold`; document the default and expose it.
3. **First touch ≠ first fill.** Passive-limit fill (`fill_time`) can lag/diverge from raw wick touch; expose both, never silently conflate.
4. **Right-censoring.** Retests near data end have truncated windows → mark `open`, exclude from survival/failure rates (report separately).
5. **Same-candle ambiguity.** Within one candle, did it react or breach first? Match the existing convention (`ghost_tracker` assumes TP-first on ambiguous candles); document and keep consistent so derived/backend agree.
6. **Invalidation-definition drift.** Three places define "breach" (`ob_fully_breached`, `close_confirmed_ob_breach`, retest `failure_threshold`). They must agree or analytics contradict the Failure Lab. Reuse the same buffer semantics (`close_breach_buffers_pips`).
7. **Candles optional in bundles.** Phase 1 silently fails without `candles.csv`. → explicit candles-present gate + empty state.
8. **Detection-TF vs execution-TF.** OB bounds are detection-TF (15min); retest replay runs on execution-TF (1min). Penetration math must use raw price, not bar index, to stay TF-agnostic.
9. **Performance.** ~151 OB × ~25k candles ≈ 3.8M checks per run in JS. Fine with windowing (only tick candles after each OB's first touch, stop at invalidation), but avoid naive O(OB×candles) full scans; consider a Web Worker.
10. **Overlapping / nested OBs.** A single candle can retest several OBs at once; attribute events per-OB independently (no global mutex).
11. **Already-invalidated-at-first-touch OBs.** No retest is possible → `retest_count = 0`, not null; keep them in denominators correctly.
12. **Reaction sign per direction.** Favorable = up for bull, down for bear; a sign error silently inverts every reaction. Unit-test both directions.
13. **Session boundaries.** Reuse `ghost_tracker._SESSION_BOUNDARIES` so retest sessions match the rest of the app; don't introduce a second definition.
14. **SR-flip detection is genuinely harder** (requires opposite-side approach + reaction); keep it optional/Phase 3 and clearly labeled experimental so it doesn't pollute core survival rates.
15. **Survivorship / selection bias.** "Best/worst conditions" cards over thin slices can overfit; show sample sizes and suppress slices below a min-N.

---

*End of OB-RETEST-1. Design only — no code changed.*
