# OB-RETEST-SURVIVAL-DEFINITION-AUDIT-2 — Continuous Invalidation Engine Plan

Audit/design only — no code changed. Date: 2026-06-10 · Branch: `codex-dev`
(Phase 1 rename landed as `cc28efe`). Author: Claude.

## 1. Files read

`OB-RETEST-SURVIVAL-DEFINITION-AUDIT-1.md` · `frontend/src/data/obRetest.js` ·
`frontend/src/data/obRetestResearch.js` ·
`frontend/src/data/__validation__/obRetest.logictest.cjs` ·
`frontend/src/data/__validation__/obRetestResearch.logictest.cjs` ·
`retest_tracker.py` · `retest_tracker_test.py` (both at this repo's root — the
**staged drop-in copies** for Lux-OB-Backtester; the Lux-OB-Backtester repo itself is
**not mounted** in this session, so `src/retest_tracker.py` there and the
`export_ob_retests.py` / `run_backtest` wiring are covered by this plan as port
targets, not as audited files).

---

## 2. Current bug path — exact state-machine explanation

### Where breaches are checked today

**`obRetest.js`** — exactly two places:

1. First-touch seek loop: `if (isBreach(i)) { perRow.invalidatedOnRetestIndex = 0; }`
   — evaluated **only on the first-touch candle itself**.
2. Reaction-window loop: `if (isBreach(w)) { breachAt = w; break; }` for
   `w ∈ [retestIndex, retestIndex + N]`.

**`retest_tracker.py`** — the same two places (line-by-line port):
`if is_breach(i): rec["invalidated_on_retest_index"] = 0` in the first-touch seek,
and `if is_breach(w): breach_at = w; break` in the window loop.

Nowhere else. The post-first-touch scanner has two sub-states and **neither calls
the breach predicate**:

- `INSIDE` (after first touch, or after a held window): only evaluates
  `hasLeft(j)` (penetration ≤ exit threshold) and advances.
- `ARMED` (debounced exit complete, waiting for re-entry): only evaluates
  `reentered = intersects(j) && penPct(j) ≥ entryThreshold` and advances.

### States that can miss a close-breach (bull OB, distal = bottom; bear mirrors)

| State | Candle shape | What happens today |
|---|---|---|
| `INSIDE` | Intersects the zone but **closes beyond the distal edge** (h ≥ bot, close < bot − buf) | `hasLeft` sees penetration > exitThr → stays INSIDE. **Breach invisible.** |
| `INSIDE` | Entirely beyond the zone (h < bot) | `hasLeft` true → transitions to ARMED. **Breach invisible.** |
| `ARMED` | Entirely beyond the zone (no intersect) — e.g. a gap through | `reentered` false → `j++`. **Breach invisible.** |
| `ARMED` | Intersects AND closes beyond | Counted as a retest entry; window loop checks the entry candle → caught as an **instant failed event** (`candlesToFailure 0`). Not a miss — must be preserved. |
| In-window | Any breach | Caught (event `failed`). Correct. |
| First-touch candle | Breach | Caught (`invalidatedOnRetestIndex = 0`). Correct. |

### Q4 — Can an OB be invalidated after a held window but before the next re-entry?

Yes. After a survived window the scan resumes at `j = windowEnd + 1` in `INSIDE`.
Any close-breach from there until the next qualifying re-entry hits the first three
rows of the table above and is silently skipped. The same applies between the first
touch and the first retest (state machine starts in `INSIDE` at `firstTouchIndex+1`).

### Q5 — Can a re-entry into an already-invalid OB count as a retest?

Yes — the **zombie retest**. After a missed breach the engine reaches `ARMED`; a
later return into the dead zone satisfies `reentered`, opens a fresh window, and —
because price re-entering from the breached side typically closes back *inside* the
zone — frequently resolves **survived**. Zombies also pollute `maxPenetrationPct`
(full-depth entries from the far side), the `full (100%)` bucket,
`failureBehavior=survived_deep`, and every research dimension.

### Q6 — Do `final_outcome` / `invalidated_on_retest_index` inherit the blind spot?

Yes, both:

- `final_outcome` (Python per-OB) is simply **the outcome of the last observed
  retest event**. An OB whose last retest held and which then breached between
  windows keeps `final_outcome = "survived"` — and zombie events can overwrite it
  further. The frontend `perRow` has no finalOutcome at all.
- `invalidated_on_retest_index` is only set on an in-window failure (or `0` on
  first touch). Between-window invalidations never set it, and a zombie failure can
  set it to a **wrong, too-high index**.
- `time_to_invalidation_minutes` (Python) is only written on in-window failures —
  same blind spot.

---

## 3. Proposed canonical state machine (both engines, identical)

```
SEEK_FIRST_TOUCH
  candle intersects?            → first touch
      breach on that candle?    → TERMINAL: invalidated_on_first_touch
      else                      → TRACKING/INSIDE
  (no touch by data end)        → TERMINAL: never_touched

TRACKING — for EVERY candle j after first touch, in priority order:
  INSIDE:
    1. isBreach(j)?             → TERMINAL: invalidated_between_windows   [NEW]
    2. hasLeft(j)?              → ARMED
    3. advance
  ARMED:
    1. reentered(j)?            → open reaction window (retest k)          [unchanged
                                   — entry-candle breach stays an instant failed EVENT]
    2. isBreach(j)?             → TERMINAL: invalidated_between_windows   [NEW]
    3. advance
  IN_WINDOW (w = entry … entry+N):
    breach                      → event failed → TERMINAL: invalidated_in_window
    window passes data end      → event open   → TERMINAL: alive_at_data_end
    window completes            → event survived → INSIDE (j = windowEnd + 1)

  retestCount == maxRetestsPerOB → TERMINAL: capped
  data end                       → TERMINAL: alive_at_data_end
```

Ordering rationale: in `ARMED`, re-entry is evaluated **before** breach so the
"intersects and closes beyond" candle keeps producing a genuine failed retest event
(`candlesToFailure 0`) exactly as today — no behavior change for that case, and no
fake events are ever created (a between-window breach produces **no event**).

`isBreach` uses the **same configured predicate** as windows (`close_beyond_ob`
default / `wick_beyond_ob`, with `failureBufferPips`) so one definition of
"invalidated" exists per run.

### Q7/Q8 — What between-window invalidation produces

**An OB-level terminal record only — no event.** Events are retests; a
between-window breach is not a retest. A synthetic event would corrupt the
event-weighted rates, every dimension grouping, and the invariant
`survived + failed + open === totalRetests`. Previously resolved events are
preserved untouched. Delayed-failure statistics are derived from the per-OB
terminal fields, not from events.

### Per-OB terminal fields (new; camelCase frontend / snake_case backend)

| Field | Meaning |
|---|---|
| `finalOutcome` | `invalidated_on_first_touch` · `invalidated_in_window` · `invalidated_between_windows` · `alive_at_data_end` · `capped` · `never_touched` |
| `invalidatedAtTime` | epoch sec of the breach candle (null if alive) |
| `invalidatedAtCandleIndex` | candle array index of the breach |
| `invalidationMode` | `close_breach` / `wick_breach` (mirrors config) |
| `invalidatedAfterRetestIndex` | # of resolved retests before death (0 = before any retest; for `invalidated_in_window` equals the failing k) |
| `timeToInvalidationMinutes` | breach time − first touch time (all invalidation modes, not just in-window) |

`invalidatedOnRetestIndex` (JS) / `invalidated_on_retest_index` (py) are kept
as-is for compatibility.

**Backend `final_outcome` value-domain change:** the existing summary-CSV column
currently holds the *last event outcome* (`survived/failed/open`). Recommendation:
repurpose it to the terminal enum above (one concept, one column — `first_retest_outcome`
already covers event history). This is a **v2 value-domain change** and is what the
versioning plan below exists for. (Alternative — add a parallel `final_status`
column and freeze `final_outcome` — costs a permanently confusing near-duplicate;
not recommended. No current consumer reads `final_outcome`: the frontend importer
ignores it.)

---

## 4. Frontend implementation plan (`obRetest.js` + consumers)

1. **`deriveRetests`** — restructure the post-first-touch loop per §3:
   breach check first in `INSIDE`; breach check after the re-entry check in
   `ARMED`; on between-window breach set terminal fields, `obTerminated = true`,
   stop scanning (no event). First-touch breach → `finalOutcome =
   "invalidated_on_first_touch"`. In-window failure → `"invalidated_in_window"` +
   `invalidatedAfterRetestIndex = k` + `timeToInvalidationMinutes`. Loop exit
   without terminal → `"alive_at_data_end"`; cap → `"capped"`; no touch →
   `"never_touched"`. Add all six fields to `perRow`.
2. **`summarizeRetestEvents`** — accept per-OB terminal data when present and emit
   an OB-level block (null when `perOB` rows lack `finalOutcome`, e.g. old backend
   artifacts or `synthPerOBFromEvents`):
   `obsInvalidated`, `obsInvalidatedBetweenWindows`, `obsInvalidatedInWindow`,
   `obsInvalidatedOnFirstTouch`, `obsAliveAtDataEnd`,
   `eventualFailureRate = obsInvalidated / obsRetested` (censored count shown
   beside it, never silently dropped),
   `delayedFailureShare = betweenWindows / obsInvalidated`,
   `medianTimeToInvalidationMinutes` (via the existing `medianOf`).
3. **`meta`** — add `engineVersion: 2`, `semantics: "continuous_invalidation"`.
4. **`useRetestData`** — pass through OB-level block; detect backend artifact
   version (§7) and expose `artifactVersion` for the banner.
5. **`obRetestResearch.js`** — no changes required (event shape unchanged); zombie
   removal automatically cleans the penetration/failure-behavior dimensions.
6. **UI (separate small commit)** — Eventual Failure %, Delayed Failure share,
   Median Time to Invalidation cards (glossary keys `retest_eventual_failure` /
   `retest_delayed_failure` already exist from Phase 1 — flip wording from
   "planned" to live); BasisBanner version label + v1-artifact caveat.

## 5. Backend implementation plan (`retest_tracker.py`, staged copy → port)

1. Mirror the §3 restructure line-for-line (same ordering, same predicate reuse).
2. `rec` additions (snake_case): `final_outcome` (terminal enum),
   `invalidated_at_time`, `invalidated_at_candle_index`, `invalidation_mode`,
   `invalidated_after_retest_index`; extend `time_to_invalidation_minutes` to all
   invalidation modes. Remove the per-event `final_outcome` overwrite.
3. `OB_RETEST_SUMMARY_COLUMNS` += the four new columns (additive; header-named
   parsing keeps old consumers safe). `OB_RETESTS_COLUMNS` **unchanged**.
4. `_build_summary` / `summary_fields` += `retest_eventual_failure_rate`,
   `retest_delayed_failure_count`, `retest_obs_alive_at_data_end`,
   `retest_engine_version: 2`.
5. `meta` += `engine_version: 2`, `semantics: "continuous_invalidation"`.
6. After the staged copy passes tests, drop into `Lux-OB-Backtester/src/` next to
   `ghost_tracker.py` and re-run the exporter wiring (`export_ob_retests.py` /
   `run_backtest` `emit_ob_retests` flag — not auditable from this session;
   exporter must forward the new summary keys into `summary.json`).

## 6. Tests to add

**JS (`obRetest.logictest.cjs`)** — all existing scenarios must pass **unchanged**
(they contain no between-window breaches; identical events = regression proof). New:

1. INSIDE between-window breach after a held window (short `reactionWindowCandles`):
   1 survived event preserved; `finalOutcome = invalidated_between_windows`;
   `invalidatedAfterRetestIndex = 1`; correct `invalidatedAtTime/CandleIndex/Mode`;
   later re-entry candles present → `totalRetests` stays 1 (**zombie prevention**).
2. INSIDE breach on an *intersecting* candle (closes beyond while still overlapping)
   → terminal, no event.
3. ARMED gap-breach (candle entirely beyond zone, never intersects) → terminal;
   later re-entry not counted.
4. ARMED re-entry candle that breaches → **still** a failed event with
   `candlesToFailure 0`, `finalOutcome = invalidated_in_window` (ordering guard).
5. Breach between first touch and first retest → terminal with
   `invalidatedAfterRetestIndex = 0`, zero events.
6. First-touch breach → `invalidated_on_first_touch` + legacy
   `invalidatedOnRetestIndex === 0`.
7. Held-to-data-end and open-event OBs → `alive_at_data_end`.
8. `timeToInvalidationMinutes` arithmetic; summary OB-level block values
   (eventualFailureRate, delayedFailureShare, censored counts); OB-level block is
   `null` when perOB rows lack `finalOutcome` (synth/back-compat path).
9. Bear mirrors of 1–4. Wick-threshold variant of 1 (`wick_beyond_ob` catches an
   intra-candle wick between windows).

**Python (`retest_tracker_test.py`)** — port scenarios 1–9 with identical candle
fixtures (the suites already share fixtures — keep them byte-identical for parity),
plus: summary CSV header contains the four new columns; `summary_fields` exposes
the new keys and `retest_engine_version == 2`; `final_outcome` column carries the
terminal enum.

## 7. Schema / versioning plan

- **`ob_retests.csv`: columns unchanged** → event consumers fully compatible. The
  *population* changes (zombie events disappear), which is a semantic, not
  structural, break.
- **`ob_retest_summary.csv`: additive columns** + `final_outcome` value-domain
  change (§3). Old artifacts lack `invalidation_mode` — that header's **presence is
  the v2 fingerprint**.
- **Version surfaces:** `meta.engine_version = 2` (both engines),
  `retest_engine_version: 2` in `summary_fields` → `summary.json`, and importer
  header-sniff: `parseObRetestSummaryCSV` tags the parsed artifact
  `retestArtifactVersion: invalidation_mode in headers ? 2 : 1`.
- **UI disclosure:** BasisBanner shows "Backend Computed · engine v1" for old
  artifacts with a tooltip: *v1 artifacts may include zombie retests and slightly
  inflated hold rates; re-export to upgrade*. Frontend-derived results are always
  v2 after the fix → a v1 backend artifact and a v2 frontend derivation of the same
  run will legitimately disagree; the banner is the explanation.
- Re-export runs where verified retest conclusions matter; keep one v1 artifact as
  a fixture for the importer's version-detection test.

## 8. Expected impact on current metrics

| Metric | Definition change? | Expected value shift |
|---|---|---|
| Window Hold % | No | Slight ↓ — zombie events (mostly spurious "survived", often deep/full-pen) leave the population; `totalRetests` ↓ |
| Reaction Success % | No | Small shift either way; cleaner population (zombies with bounce-back reactions removed) |
| Weak Hold % | No | Slight shift with the population |
| Failure Rate % | No | Slight ↑ (complement of hold) |
| Median Candles to Failure | No | Marginal |
| Penetration / Failure-Behaviour dims | No | `full (100%)` and `survived_deep` buckets shrink — these were zombie magnets |
| Eventual Failure % | **Becomes computable** | New: `obsInvalidated / obsRetested`, censored (`alive_at_data_end`) reported beside it |
| Delayed Failure % | **Becomes computable** | New: between-windows share of invalidations |
| Min-N gating | No | Fewer events → some research rows may drop below n ≥ 20 |

## 9. Risks / edge cases

1. **ARMED ordering regression** — re-entry must be evaluated before breach or
   today's instant-fail events silently become between-window terminals (test 4 guards).
2. **Pre-first-touch breach** (gap beyond the zone before any touch) — out of scope
   per requirements (scan starts at first touch); the OB stays `never_touched`/alive
   until touched. Documented; candidate `invalidated_before_touch` in a v2.1.
3. **Wick-mode amplification** — `wick_beyond_ob` between-window scanning is much
   stricter; correct but expect markedly lower hold rates under that config.
4. **`capped` vs `alive_at_data_end`** — without an explicit `capped` status,
   50-retest OBs would masquerade as censored.
5. **Event-only backend artifacts** (no summary sidecar) — `synthPerOBFromEvents`
   cannot synthesize terminals → OB-level block must gate to null, UI hides the
   eventual-failure cards rather than showing zeros.
6. **Parity drift** — two engines, one semantic change: keep candle fixtures
   byte-identical across the JS and Python suites; land both in the same commit.
7. **Event weighting critique remains** — multi-retest OBs still dominate event
   rates; the OB-level block is the answer, not a change to event rates.
8. Performance: one O(1) predicate per candle — negligible.
9. The deployed `Lux-OB-Backtester` copy may already have drifted from the staged
   copy — diff before porting.

## 10. Recommendation — implement now, version the artifacts (not the behavior)

Implement v2 directly in both engines, **without** a runtime behavior flag:

- The tracker is a pure post-processor — it cannot alter backtest results, so the
  blast radius is the Retest Lab only.
- Phase 1 already reframed the UI language; shipping the engine fix completes the
  story the glossary now tells ("delayed failures not yet detected" → detected).
- A behavior flag would double the parity matrix (2 engines × 2 modes × 2 suites)
  for no analytical benefit — nobody should opt into zombie retests.
- Versioning belongs on the **artifacts** (header fingerprint + `engine_version`
  meta + banner disclosure), which this plan provides.

Sequencing: (a) JS engine + tests → (b) Python staged copy + tests (same commit) →
(c) importer version sniff + `useRetestData` + UI cards/banner → (d) port to
Lux-OB-Backtester + exporter `summary.json` keys + re-export reference runs →
(e) `docs/ai` sync (DECISIONS entry for the v2 semantics; FINDINGS caveat on any
pre-v2 retest conclusions).
