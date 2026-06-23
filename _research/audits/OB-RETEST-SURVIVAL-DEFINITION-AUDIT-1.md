# OB-RETEST-SURVIVAL-DEFINITION-AUDIT-1

Audit only — no code, docs, or config were changed. One new file (this report).
Date: 2026-06-10 · Branch: `codex-dev` (up to date with origin) · Auditor: Claude.

Files read end-to-end: `frontend/src/data/obRetest.js`, `obRetestResearch.js`,
`components/lab/retest/useRetestData.js`, `RetestLabTab.jsx`, `importer.js` (retest
sections), `store.js` (retest sections), `retest_tracker.py`, `retest_tracker_test.py`,
`__validation__/obRetest.logictest.cjs` (skimmed), `researchGlossary.js` (retest keys),
`docs/ai/AGENTS.md`, `CURRENT_WORKSTREAM.md`, `PROJECT_STATUS.md`, `WORKSTREAMS.md`.

**Scope limitation:** the `Lux-OB-Backtester` repo is not mounted in this session.
`scripts/export_ob_retests.py` and the `run_backtest` wiring could not be audited.
The staged standalone port `retest_tracker.py` (tracked in this repo, per its STAGING
NOTE) was audited as the backend engine. Findings about engine semantics apply to it;
exporter wiring claims are inferred from its docstrings and the importer contract.

---

## Part 0 — Repo state vs docs (verification)

### 0.1 Current status (verified against git)

- Branch `codex-dev`, in sync with `origin/codex-dev`.
- **All OB-retest files are clean and committed.** The retest stack on disk is exactly
  what the last `feat(ob-retest)` commits produced (`77b3c79` → `a19d64b`).
- Working tree is dirty with **unrelated** work: 6 modified `docs/ai/*` files and 9
  modified Failures-Lab files (`components/lab/failures/*`, `failuresAggregation.validate.mjs`,
  `researchGlossary.js`, ~+278/−38). Plus ~70 untracked audit/plan `.md` files,
  `ghost_tracker*.py`, `beReplay.js`, `roadmapStore.js`, `components/lab/roadmap/`,
  root `package.json`/`package-lock.json`.

### 0.2 Current workstream

- **Per docs** (`CURRENT_WORKSTREAM.md`, last updated 2026-06-07): Classification Tab V2,
  Phase 2 polish.
- **Per git**: the last ~20 commits are dominated by **Failures Lab** (explorer, aggregation
  engine, break-even analysis), Master Controls preview lenses, Protection/FFT. The dirty
  files continue the Failures-Lab thread. OB-retest commits (`08ece26`, `721018d`,
  `6da1939`, `ff9cb24`, `c8154e4`, `a19d64b`) are real but ~40+ commits back.

### 0.3 Detected drift (docs vs repo)

1. **`WORKSTREAMS.md` OB Retest entry is stale.** It says "now at Phase 2 exporter audit";
   reality: Phase 2.4 (backend-preferred), C1 (Edge Discovery), C1.5/C1.6 (Intelligence/IA),
   and C2 (origin candle dimensions) are all shipped and committed. Its "Owns" list also
   omits `obRetestResearch.js`, `retest_tracker.py`, and the importer/store retest hooks.
2. **`CURRENT_WORKSTREAM.md` / `PROJECT_STATUS.md` don't reflect the Failures Lab V2 work**
   that dominates recent commits and the dirty tree. The uncommitted `docs/ai` edits
   (visible in `git diff`) partially address this but are not committed.
3. `docs/ai/AGENTS.md` references `ROADMAP.md` at root for git coordination; only the
   `docs/ai/` copy exists (root has `PROJECT_STATUS.md`/`WORKSTREAMS.md` but no `ROADMAP.md`).
4. Minor: the task brief's "recent commits include feat(ob-retest)…" is itself stale
   relative to HEAD — those are not the most recent commits.

### 0.4 Active parallel workstreams to respect

Failures Lab (active, **dirty files in flight — do not stage**), Master Controls,
Protection/FFT, Session Lab, Strategy Map, Ghost backend research (`ghost_tracker*.py`,
untracked). Any future retest commit must stage only retest files (rule: never `git add .`).

### 0.5 Uncommitted work affecting planning

The modified `researchGlossary.js` belongs to the Failures-Lab thread. A retest metric
rename would *also* touch `researchGlossary.js` — coordinate staging carefully or wait
for the Failures-Lab edits to land first.

### 0.6 Next recommended task

This audit (done). After it: decide the rename + the invalidation-scan fix (§3.8),
spec it, and sync `docs/ai` (WORKSTREAMS retest entry + a DECISIONS entry).

---

## Part 1 — Implementation audit

### 1.1 Current architecture

Data flow (backend-preferred with frontend fallback, Phase 2.4):

```
Lux-OB-Backtester (not mounted)            FX-OB-Research-Lab
  retest_tracker.py (port, staged here) ──▶ ob_retests.csv + ob_retest_summary.csv
                                                  │ importer.parseObRetestsCSV /
                                                  │ parseObRetestSummaryCSV (snake→camel)
                                                  ▼
                              store.js: run.obRetests / run.obRetestSummary (or null)
                                                  ▼
useRetestData.js: hasBackend = Array.isArray(activeRun.obRetests)
  ├─ backend mode: events used verbatim → summarizeRetestEvents (shared summarizer)
  └─ frontend mode: lazy candle load → deriveRetests(obRetest.js)
                                                  ▼
obRetestResearch.js: enrichRetestEvents (join to orderBlocks) →
  buildRetestEdgeBreakdowns / buildSessionMatrix / buildBestWorstRetestConditions /
  buildRetestFindings
                                                  ▼
RetestLabTab.jsx: gates → BasisBanner (Backend Verified / Frontend Derived) →
  ConfigBar → RetestIntelligence → SummaryCards → SessionMatrix →
  EdgeDiscoveryTabs → EventTable
```

Engine (identical in `obRetest.js` and `retest_tracker.py`): per OB, seek first touch
from detection; immediate breach on the first-touch candle ⇒ invalidated, no retests.
Otherwise a state machine INSIDE → (debounced exit) → ARMED → (re-entry ≥ entry
threshold) opens a **reaction window** of the entry candle + `reactionWindowCandles`
(default 10). Within the window: breach (default = candle **close** beyond the distal
edge + buffer) ⇒ `failed`; window extends past last candle ⇒ `open` (right-censored);
otherwise ⇒ `survived`. Survived ⇒ scanning resumes at `windowEnd + 1` for further
retests. Failed/open ⇒ OB tracking terminates. Cap 50 retests/OB.

### 1.2 Current outcome taxonomy

- Event outcome: `survived | failed | open` — exact partition, invariant
  `survived + failed + open === totalRetests` (tested).
- `reactionMet` (≥ `reactionMinPips` favorable from the proximal edge within window)
  is a **separate quality flag**, never gates the outcome.
- `retestType`: `close_inside | full_penetration_no_invalidation | wick_only | clean | deep`.
- `failureMode`: `none | close_breach | wick_breach` (mirrors the configured threshold).
- Research layer adds `failureBehavior`: `survived_shallow | survived_deep |
  failed_shallow | failed_deep | open` (deep = max penetration ≥ 66%).
- Backend per-OB sidecar additionally carries `first_retest_outcome`, `final_outcome`,
  `invalidated_on_retest_index`, `time_to_invalidation_minutes` — **none of these are
  surfaced in the UI**; the frontend `perOB` shape lacks `final_outcome` entirely.

### 1.3 Current dimensions (Edge Discovery)

Sessions: origin / retest / same-vs-cross session, Session Matrix (origin × retest).
Structure: OB size bucket, BOS/CHoCH, direction, structure × direction.
Origin (C2): body dominance, wick dominance, dominant wick side, origin range bucket,
impulse proxy (|break level − origin close|).
Penetration: entry and max penetration buckets (clean/mid/deep/full).
Timing: retest number (R1/R2/R3+), time since detection / first touch / previous retest.
Behavior: first-touch outcome, failure behaviour, reaction quality (met/missed).

### 1.4 Intelligence / findings capabilities

Deterministic only (no scoring/AI): best/worst conditions ranked by **survival rate**
(min n ≥ 20), session matrix, and `buildRetestFindings` — hardcoded best-vs-worst and
pairwise comparisons (R2 vs R1, same vs cross session, reaction met vs missed, full
penetration vs shallower) gated by min-N and a ≥10pp (some ≥5pp) delta, top 6 by |Δ|.

### 1.5 Current limitations

1. Every research ranking keys off `survivalRate` — the metric questioned in Part 2.
2. No OB-level eventual-outcome view; everything is event-weighted.
3. Backend mode loses config provenance: the artifacts don't carry exporter params, so
   the ConfigBar is a read-only notice and `meta.config` is null. No way to confirm the
   backend window/threshold matched the frontend defaults.
4. `synthPerOBFromEvents` (when the summary sidecar is absent) seeds `touchCount: 1` then
   increments per event — touch counts are approximations; `obsWithFirstTouch` then only
   counts OBs that retested, quietly changing the Retest Rate denominator vs derived mode.
5. Min-N gating treats events as independent; retests of the same OB are serially
   correlated (one OB can contribute up to 50 events to a bucket).
6. Findings thresholds (10pp/5pp) are heuristics with no variance/CI handling.
7. `maxRetestsPerOB = 50` truncation is silent — no flag on capped OBs.

### 1.6 Technical debt / risks

- **Two engines to keep in lockstep forever** (JS + Python port). Parity is currently
  hand-maintained; any semantic fix (e.g. §3.8) must land in both plus tests plus the
  real exporter in the other repo.
- `retest_tracker.py` here is a staged copy; the deployed exporter in Lux-OB-Backtester
  can drift from it unnoticed (not auditable this session).
- Direction vocabulary mismatch: backend emits `bullish/bearish`, frontend events use
  `bull/bear`; importer normalizes, but `retest_tracker.py`'s own CSV consumers must
  remember this.
- `obPipSize()` infers pip size from OB width fields and silently falls back to 0.0001 —
  wrong for JPY pairs if width fields are absent (origin pips/impulse buckets shift).
- Session bands duplicated by design with `ghost_tracker.py` — a third copy now exists in
  `retest_tracker.py`; three places to update if bands ever change.

### 1.7 Metrics that may mislead / need renaming (preview of Part 2)

`Survival Rate` (headline — see Part 2), `Avg Reaction` (it is the average of per-retest
**max favorable excursion**, not a realized reaction), `Avg Candles to Fail` (within-window
failures only; mean of a censored, skewed distribution), `first_touch_outcome` (mixes trade
status vocabulary with "untraded"), `survivalBandClass` color thresholds (90/75/60 are
calibrated to the inflated metric).

---

## Part 2 — Survival definition audit

### 2.1 Exact current survival definition

A retest event is **survived** iff, on the candle sequence
`[retestEntry … retestEntry + reactionWindowCandles]` (default 11 candles inclusive):

1. no candle satisfies the breach predicate — default: candle **close** beyond the
   **distal** edge (below bottom for bull, above top for bear) by more than
   `failureBufferPips` (default 0); and
2. the full window exists within the available candle data (otherwise `open`).

That is all. Survived does **not** require: any favorable reaction (`reactionMet` is a
separate flag), shallow penetration (a 100% wick-through that closes back inside survives),
the price leaving the zone, or the OB remaining valid afterwards.

Headline `Survival Rate = survived / (survived + failed)` — closed events only,
event-weighted (every retest counts equally, however many came from one OB).

### 2.2 The ten questions

1. **What exactly counts as survived?** "No close beyond the distal edge within ~10
   candles of re-entry, with complete data." A *short-horizon non-invalidation* metric.

2. **Is survival only evaluated inside `reaction_window_candles`?** Yes. Both engines
   check `isBreach` only on (a) the first-touch candle and (b) candles inside a retest
   window. Nothing after `windowEnd` affects that event's outcome.

3. **What happens if an OB survives the window and fails later?**
   Two cases. (a) The later failure happens **inside a subsequent retest's window** →
   recorded as that later event's `failed`; the earlier `survived` stands (defensible for
   an event-level metric). (b) The failure happens **outside any window** — price closes
   beyond the distal edge while the engine is in INSIDE/ARMED scan states → **the breach
   is never detected at all**. No failure is recorded, the OB is still considered alive,
   and tracking continues. This is the critical gap (§2.3, §2.5).

4. **Is `reactionMet` separate from survival?** Yes — deliberately (documented in both
   engines and the plan deviation note). It never gates the outcome; it surfaces only as
   the Reaction Quality dimension and a "weak" annotation in the event table.

5. **Does survived include weak/no-reaction holds?** Yes. A retest that produces 0
   favorable pips and grinds sideways inside the zone for 10 candles without a distal
   close is `survived`. `reactionMet=false` holds are fully counted in the headline rate.

6. **Are open/right-censored retests excluded correctly?** At the **event level, yes** —
   `open` is set when `windowEnd >= candleCount`, excluded from both rates, shown as its
   own card, and the invariant holds (validated in `obRetest.logictest.cjs` /
   `retest_tracker_test.py`). Two caveats: a breach found in the *partial* window still
   counts as `failed` (correct — failure is observed), and there is **no OB-level
   censoring concept**: an OB that never failed because the data ended is
   indistinguishable from one that genuinely held.

7. **Can full penetrations that don't close-breach count as survived?** Yes. With the
   default `close_beyond_ob`, a wick trading through 100% of the zone (even beyond the
   distal edge intra-candle) survives if every close is back inside/proximal. Typed
   `full_penetration_no_invalidation`, labeled "Full pen · alive" — counted identically
   to a clean shallow hold in the headline rate. `wick_beyond_ob` exists but is not the
   default and isn't reflected in backend artifacts.

8. **Are repeated retests inflating survival statistics?** Structurally, yes:
   - Event weighting: an OB that survives 5 retests then fails the 6th contributes
     5 survived + 1 failed → 83% "survival" for an OB that *eventually died*. Every
     eventually-failed multi-retest OB still pushes the rate up.
   - Selection: only OBs that already survived previous windows generate later retests,
     so high-retest OBs are self-selected holders (up to 50 events each).
   - Within one window, re-entries are not double-counted (scan resumes at
     `windowEnd + 1`) — that part is sound.

9. **Are retests after an already-failed OB excluded correctly?** Only for failures the
   engine *sees*. Within-window failure ⇒ `obTerminated`, no further retests (correct).
   First-touch immediate breach ⇒ OB skipped (correct). But a between-window breach
   (Q3b) is invisible ⇒ the OB becomes a **zombie**: a later re-entry into the broken
   zone is counted as a fresh retest — and because the re-entry candle typically closes
   back *inside* the zone, it can even be recorded as **survived**. For a bull OB broken
   downward, price re-entering from below has full-depth penetration, so zombie events
   also pollute the `full (100%)` penetration bucket and `failureBehavior=survived_deep`.
   This contradicts the module's own stated semantics ("while the OB is not yet
   invalidated") — a genuine correctness gap, not just a naming issue.

10. **Does backend/frontend parity prove the metric is correct?** No. `retest_tracker.py`
    is a deliberate line-by-line port of `obRetest.js`; the tests assert the port matches
    the original. Both implementations share every gap above. "Backend Verified" is a
    **provenance** claim (artifact came from the exporter, not browser derivation) — the
    UI badge reads like a correctness claim. Parity ≠ validity.

### 2.3 Why survival appears inflated

In rough order of impact:

1. **Short horizon**: ~10 execution-TF candles is a low bar; most zones don't get fully
   invalidated by close within ~10 candles of any given touch.
2. **Delayed failures are invisible** (Q3b/Q9): every between-window invalidation is a
   failure that never enters the denominator's failed count — and can add fake survived
   events afterwards. Inflates the numerator and deflates failures simultaneously.
3. **Event weighting + selection** (Q8): pre-failure survived events from eventually-dead
   OBs dominate; long-surviving OBs contribute many events each.
4. **Weak holds count** (Q5): no-reaction grinds are "survived".
5. **Lenient default breach predicate** (Q7): close-only, zero buffer; full wick-throughs
   survive.
6. Minor: closed-only exclusion of `open` is correct but removes exactly the events most
   likely to be late-life (data-edge) ones.

### 2.4 Bug or metric-definition issue?

**Both, separably:**

- **Metric definition** (most of the inflation): "survival" actually measures *window
  hold*. Items 1, 3, 4, 5 in §2.3 are working-as-coded and as documented in the plan —
  the name oversells the metric.
- **Genuine bug / integrity gap**: blind between-window invalidation (item 2). The
  implementation violates its own documented invariant that retests are only counted
  while the OB is not yet invalidated. This corrupts not just the headline rate but the
  event population every research dimension is computed over.

### 2.5 Scenarios currently classified as survived

1. Price re-enters 10% of the zone, drifts sideways 10 candles, 0 pips favorable —
   survived (weak hold).
2. Wick pierces the entire zone and 5 pips beyond the distal edge; closes back inside —
   survived (`full_penetration_no_invalidation`).
3. OB survives retest #1's window, then 3 candles after the window ends closes hard
   through the distal edge — **no failure recorded anywhere**; OB stays "alive".
4. Continuation of 3: price later re-enters the broken zone from the far side, closes
   inside → counted as retest #2, **survived** (zombie retest).
5. OB survives retests #1–#4, fails on #5 → contributes 4 survived + 1 failed (80%)
   despite eventual invalidation.
6. Every close inside the zone for 10 candles while price never produces a reaction,
   then the data ends one candle after the window — survived (and the next would-be
   retest is `open`).

### 2.6 What users naturally assume "survived" means

- "The OB held **and produced a bounce/reaction**" — false (weak holds count).
- "The OB **was never invalidated**" — false (delayed failures invisible; zombies).
- "X% of retested OBs are still valid" — false (it's event-weighted, not OB-weighted).
- "Survived = tradeable" — false (`reactionMet` is the tradeable proxy and is separate).
- "90% survival = strong edge" — the green `text-glow-success` band at ≥90% actively
  endorses this reading.

The UI does include honest fine print ("Survived = held without breach inside the
reaction window", "Open … excluded", glossary entries) — but the card label, the hero
"Strongest survived segment", and the color bands carry the message, and they all say
*survival*.

---

## Part 3 — Naming / taxonomy recommendation

### 3.1 Candidate evaluation

| Candidate | Verdict | Notes |
|---|---|---|
| **Window Hold %** | ✅ Adopt (rename of current metric) | Exactly what is computed. Zero engine change. Suggest surfacing window length: "Hold Rate (10-candle)". |
| **Reaction Success %** | ✅ Adopt (new headline) | `survived ∧ reactionMet` over closed events. Both flags already exist — pure summarizer/UI addition. This is the "did the retest do what a trader wants" number. |
| **Weak Hold %** | ✅ Adopt (supporting stat) | `survived ∧ ¬reactionMet` over closed. Directly exposes the inflation; cheap. |
| **Eventual Failure %** | ✅ Adopt (OB-level, Phase 2) | Share of retested OBs eventually invalidated. **Requires the §3.8 engine fix** (continuous invalidation scan) to be honest; backend `final_outcome` exists but inherits the blind spot today. Needs OB-level censoring ("alive at data end"). |
| **Delayed Failure %** | ⚠️ Adopt only with §3.8 | Failures occurring after a held window. Currently unmeasurable — exactly the invisible class. Valuable diagnostic once the scan exists. |
| **Immediate Failure %** | ⚠️ Partial now | Within-window failures split by `candlesToFailure` (e.g. ≤2 vs 3–10) is available today; a true immediate/delayed dichotomy needs §3.8. Lower priority. |
| **Median Candles Until Failure** | ✅ Adopt (replace avg) | Median over failed events; the mean of a truncated, skewed distribution misleads. Trivial change. |

### 3.2 Recommended taxonomy (two levels)

**Event level (per retest — rename only, no semantics change):**

- Outcome: `held` (was survived) / `failed` / `open` (excluded).
- Quality split of `held`: **Strong Hold** (reaction met) vs **Weak Hold**.
- Displayed rates over closed events: **Reaction Success %** (strong holds), **Weak
  Hold %**, **Failure Rate %** — the three sum to 100% and are individually honest.
  **Window Hold %** = strong + weak, kept as a secondary stat.

**OB level (requires §3.8 — the real "survival"):**

- Eventual outcome per retested OB: `invalidated` (with retest index + time/candles to
  invalidation) vs `alive at data end` (censored, excluded or shown separately).
- Headline: **Eventual Failure %**, **Median Time to Invalidation**; natural future step
  is a Kaplan–Meier-style hold curve, which handles censoring properly.

### 3.3 UI naming approach

1. "Survival Rate" card → **"Window Hold %"**, sub "held N-candle window (closed)";
   glossary `retest_survival` rewritten to state the window explicitly and what it does
   *not* mean. Keep the word "survival" out of headline UI.
2. Promote **Reaction Success %** to the success-toned hero card; Window Hold % drops to
   neutral tone. Retest Intelligence / Best-Worst / Findings should rank by Reaction
   Success % (or show both) — today every ranking inherits the inflated metric.
3. Recalibrate `survivalBandClass` thresholds per metric (90/75/60 was tuned to the
   inflated number; Reaction Success will run lower).
4. Rename "Avg Reaction" → "Avg Max Favorable (window)"; "Avg Candles to Fail" → median.
5. Soften "Backend Verified" → "Backend Computed" (provenance, not validation), or add a
   tooltip clarifying it means source, not correctness.
6. Event table: render Weak Hold as its own pill tone rather than a tiny "weak" suffix.

### 3.4 Prerequisite engine fix (flagged, not implemented)

**Continuous invalidation scan:** evaluate the breach predicate on *every* candle after
first touch (INSIDE and ARMED states included). A breach outside any window terminates
the OB with a new OB-level terminal state (e.g. `invalidated_between_windows` /
`delayed_failure`), and no further retests are counted. This restores the documented
"while not yet invalidated" invariant, kills zombie retests, and unlocks Eventual/Delayed
Failure %. It must land in **both** engines (`obRetest.js` + `retest_tracker.py`), both
test suites, the real exporter in Lux-OB-Backtester, and bumps artifact semantics —
backend artifacts produced before the fix will disagree with frontend derivation after
it, so a schema/version note in the CSV meta is advisable.

### 3.5 Suggested sequencing (for planning, not execution)

1. **Rename pass** (frontend-only: summarizer fields kept, labels/glossary/ranking metric
   changed; add Reaction Success % + Weak Hold % + median) — immediate honesty win, no
   parity risk.
2. **Engine fix** (§3.4) in both engines + tests, then exporter sync in Lux-OB-Backtester.
3. **OB-level layer**: surface `final_outcome` / eventual failure / time-to-invalidation
   (sidecar fields already reserved); add OB-weighted views beside event-weighted ones.
4. `docs/ai` sync: WORKSTREAMS retest entry, DECISIONS entry for the taxonomy, FINDINGS
   caveat on any survival-rate-based conclusions recorded to date.
