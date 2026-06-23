# BE-FRONTEND-INTEGRATION — PHASE 0 AUDIT (1)

> Mode: **AUDIT ONLY**. No code written. Verified against the live repo, not docs.
> Date: 2026-06-10. Branch: `codex-dev`. Repo: `FX-OB-Research-Lab`.
> Prereq confirmed: backend Phase 2 (`805c760`, in `Lux-OB-Backtester`) exports
> `be_results`, `trades_*__be_*.csv`, `outcome=BE_EXIT`, and 12 `be_*` columns.

---

## PART A — Repo-state audit (verified against git)

### 1. Current status
- Branch `codex-dev`, **12 commits ahead of `origin/codex-dev`** (unpushed).
- Working tree is **dirty**: 10 modified tracked files + a large set of untracked files
  (audit `.md`s, the BE frontend files, validation scripts, scratch `.mjs`).
- Top of `git log`: `274d698 feat(lab): add read-only ResearchResultViewBanner`.
- `805c760` (the backend BE commit named in the handover) is **not in this repo's log** —
  it lives in `Lux-OB-Backtester`. The handover's "what just completed" is backend-side.

### 2. Current workstream (per docs — and the docs disagree)
- `docs/ai/CURRENT_WORKSTREAM.md` (last updated PM): **Failures Lab V5 — decision layer**;
  Phase 1 shipped, Phase 2 (confirmed false losers) audited and **blocked on a backend export**.
- `docs/ai/PROJECT_STATUS.md` + `docs/ai/WORKSTREAMS.md`: still name **Failures Lab V4 —
  final integration cleanup, then pause** as the focus. → **stale relative to CURRENT_WORKSTREAM.**

### 3. Next recommended task
The assigned task — **`BE-FRONTEND-INTEGRATION-PHASE-0-AUDIT`** — is the correct next step:
the handover explicitly defers frontend integration (its "Phase 3") and the backend is now
producing the data. This audit is that step. (Failures Lab V5 Phase 2 remains blocked on a
*different* backend export, so it cannot progress in this repo right now.)

### 4. Detected drift between docs and repo
- **Doc-vs-doc:** `CURRENT_WORKSTREAM.md` (V5) vs `PROJECT_STATUS.md`/`WORKSTREAMS.md` (V4 cleanup).
- **No BE/Protection workstream entry** in `WORKSTREAMS.md`, yet BE frontend code already exists
  on disk (`beReplay.js`, `BreakevenTab.jsx`) and `ProtectionLab.jsx` is dirty. The BE/Replay
  stream is only mentioned in passing ("`ProtectionLab.jsx` dirty — do not stage").
- **Handover scope:** handover describes the *backend* repo's completed work; the matching
  *frontend* work is unstarted, so "Phase 2 complete" is true only for `Lux-OB-Backtester`.
- Two `PROJECT_STATUS.md` files (repo-root = git coordination; `docs/ai/` = product state) —
  by design, but easy to misread.
- `.fuse_hidden*` artifacts in `docs/ai/` (open-file remnants) — harmless, ignore.

### 5. Active parallel workstreams to be aware of
Per `WORKSTREAMS.md`, all on `codex-dev`:
- **Failures Lab V4/V5** (current focus; owns `components/lab/failures/**`).
- **Master Controls / Research Control Plane** (active, Phase 7A; `components/masterControls/*`).
- **OB Retest / Retest Lab** (active; `data/obRetest.js`, `components/lab/retest/*`).
- **Entry / FFT / Paired Runs** (active; **shares `data/importer.js`** — coordinate closely).
- **Trade Classification** (paused), **Session Lab** (active), **Strategy Map** (active),
  **Ghost/Backend research** (docs).
- **BE / Protection-Replay** (de-facto active but unregistered) — the subject of this audit.

### 6. Uncommitted work that may affect planning
Modified (tracked): `data/importer.js`, `pages/ProtectionLab.jsx`, `pages/SessionLab.jsx`,
`pages/SessionLabV1/SessionLabPage.jsx`, `pages/TradeInspector.jsx`, `data/roadmapStore.js`,
`components/lab/failures/shared/failuresAnalytics.js`, `…/failures/workspace/ViewManager.jsx`,
`components/lab/retest/RetestLabTab.jsx`, `components/lab/roadmap/SectionRoadmap.jsx`.

Untracked (BE-relevant): `data/beReplay.js`, `components/lab/protection/BreakevenTab.jsx`,
`data/__validation__/beReplay.validate.mjs`, plus scratch `frontend/be_debug.mjs`,
`frontend/be_sanity.mjs`, `frontend/src/_p11c_parse.mjs` (should not be committed).

Planning impact: **`importer.js` and `ProtectionLab.jsx` are both dirty and both owned by
other streams.** Any BE ingestion change lands in shared, already-modified files — stage
deliberately, never `git add .` (sandbox also can't unlink `.git/index.lock`; commit on host).

---

## PART B — BE frontend integration Phase-0 audit

### 1. Files read
- `frontend/src/data/importer.js` (1523 ln) — bundle ingestion, file routing, trade normalization.
- `frontend/src/data/sidecarClient.js` (74 ln) — run-trigger / bundle fetch.
- `frontend/src/data/store.js` (2378 ln) — bundle persistence, `loadCandlesForRun`, defaults.
- `frontend/src/pages/ProtectionLab.jsx` (2261 ln) — consumer; mounts the BE tab.
- `frontend/src/components/lab/protection/BreakevenTab.jsx` (892 ln) — current BE surface.
- `frontend/src/data/beReplay.js` (635 ln) — client-side candle-walk replay engine.
- `frontend/src/components/lab/protection/protectionAnalytics.js` — outcome/streak classify.
- Cross-repo greps for `BE_EXIT` / `breakeven` / outcome buckets (~30 files).

### 2. Current import flow
`ingestRunBundle(fileList)` →
`detectFileKind(name)` per file (ordered checks at importer.js **L943–960**) →
`switch(kind)` (L1069–…):
- `summary.json` → `collected.summary`. `sm.protection_results` is later surfaced verbatim as
  `bundle.protectionResults.summary` (**L1472**). **`sm.be_results` is never read.**
- `trades_<variant>__<mode>.csv` → matched by `protectedTradeFileInfo` (**L828–836**, regex
  `^trades_(single_position|allow_multi_position|one_per_direction)__(.+)\.csv$` — a **catch-all**
  on the suffix) → kind `trades_protected` → case at **L1127** →
  `collected.protectionTradesByMode[normalizeProtectionModeKey(mode)] = parseTradesCSV(text)`.
- `parseTradesCSV` (**L378–477**) builds each trade; `outcome` at **L388**:
  `outcomeRaw ? cap(outcomeRaw) : (rVal>=0 ? "Win":"Loss")`, where `cap` (**L44**) =
  uppercase-first / lowercase-rest. **No `be_*` columns are parsed.**
- Enrichment (**L1326**) → `protectionEquityCurveByMode` → bundle assembly (**L1471–1477**):
  `protectionResults = { summary: sm.protection_results||{}, tradesByMode, equityCurveByMode, sourceFiles, tradesOmittedForStorage:false }`.

Consumer side: `ProtectionLab` reads `activeRun.protectionResults.tradesByMode` (**L146–150**) →
`normalizeProtectionTradesByMode` → `canonicalProtectionModeKey` (**L1610–1627**), auto-selects
the first non-baseline mode (**L153–159**), and mounts
`<BreakevenTab trades candles activeRun activeRunId/>` (**L649**) — passing only the **primary**
trades + candles. `BreakevenTab` then computes everything client-side via `beReplay.js`
(`beReplayAvailability`, `replayBeScenario`, `buildBeScenarioSummary`).

### 3. Exact insertion points
- **NEW parser** beside `protectedTradeFileInfo` (~importer.js **L836**): `beTradeFileInfo(name)`
  matching `^trades_(…)__(be_.+)\.csv$` → `{ baseVariant, scenarioKey: normalizeBeScenarioKey(...) }`.
- **`detectFileKind` ordering** (**L943–947**): add `if (beTradeFileInfo(name)) return "trades_be";`
  **before** the `protectedTradeFileInfo` check — otherwise the protection catch-all swallows BE
  files (see Risk #1).
- **`collected` init** (**L1047**): add `beTradesByMode:{}, beSourceFiles:[]`.
- **`switch` block** (after **L1137**): add `case "trades_be":` mirroring `trades_protected`,
  routing into `collected.beTradesByMode[scenarioKey]`.
- **Trade normalization** (**L463–477**, in the returned trade object): add dual-keyed `be_*`
  fields (`be_scenario_key`, `be_arm_level_r`, `be_trigger_basis`, `be_armed`, `be_arm_candle_index`,
  `be_arm_time`, `be_triggered`, `be_exit_reason`, `be_exit_r`, `be_exit_price`, `be_exit_time`,
  `be_exit_candle_index`) via `pick(...)`/`numOrNull`/`boolOrNull`, all null/`""` when absent.
- **Outcome line** (**L388**): preserve canonical `BE_EXIT` (and other ALL-CAPS tokens) instead of
  `cap()`-mangling — see §5.
- **Enrichment** (~**L1326**): add `beTradesByMode` enrich + `beEquityCurveByMode` (mirror protection).
- **Bundle assembly** (after **L1477**): add `beResults: { summary: sm.be_results||{}, tradesByMode,
  equityCurveByMode, sourceFiles, tradesOmittedForStorage:false }`.
- **store.js**: empty-bundle default (~**L476**) and any persistence/strip logic — add a `beResults`
  default identical in shape to `protectionResults`.
- **ProtectionLab.jsx**: new memo `beTradesByMode = activeRun?.beResults?.tradesByMode` and pass an
  exact-data prop into `<BreakevenTab>` (**L649**); ensure protection auto-select (**L156**) cannot
  pick up a BE scenario (it won't, once BE is routed out of `protectionTradesByMode`).

### 4. Data shape proposal (mirror `protectionResults`)
```
bundle.beResults = {
  summary:            sm.be_results,            // { [execution_mode]: { [scenario_key]: {...stats} } }
  tradesByMode:       { be_wick_0p50r: [ ...trade ], be_close_1p00r: [ ... ], ... },
  equityCurveByMode:  { be_wick_0p50r: [ ...pt ], ... },
  sourceFiles:        [ { name, kind:"trades_be", scenarioKey, baseVariant, rows } ],
  tradesOmittedForStorage: false,
}
```
- **Key normalization:** backend `be_wick_0p50R` → frontend `be_wick_0p50r` (lowercase; the
  existing `normalizeProtectionModeKey` lowercasing applies — but route through a BE-specific
  normaliser so it is *not* confused with a protection mode).
- **`beTradesByMode` SHOULD mirror `protectionTradesByMode`** (Q7: yes) — same nesting, same
  enrichment, same equity-curve treatment, same storage-omission flag. This maximises reuse of
  `DataTable`, equity-curve, and analytics primitives and keeps the two concerns structurally
  parallel without merging them (the handover mandates BE and protection stay separate).
- Per-row `be_*` fields travel on the trade objects so the EXACT path can read `be_exit_reason`
  directly without re-deriving.

### 5. Outcome mapping recommendation
- **Defect today:** backend `outcome="BE_EXIT"` hits `cap()` → **`"Be_exit"`**. That silently
  breaks every `outcome === "Win"`/`"Loss"`/`"WIN"`/`"LOSS"` guard (e.g. importer win flag,
  `protectionAnalytics`, `failuresUtils`, `FftClassificationPanel`'s `LOSS_LIKE`). BE rows would
  count as neither win nor loss and would not match the canonical token.
- **Recommendation:**
  1. In the trade builder, **preserve canonical ALL-CAPS outcome tokens** (`WIN`, `LOSS`,
     `BE_EXIT`, `PROTECTION_EXIT`, `NEWS_FLATTEN`) rather than `cap()`-folding them. Keep the
     `cap()` fallback only for unknown/legacy free-text outcomes.
  2. For WIN/LOSS/**BREAKEVEN** bucketing, map **`BE_EXIT → BREAKEVEN`** (backend `be_exit_r` ≈ 0;
     entry-priced exit, spread not modelled). A `BREAKEVEN` bucket already exists in
     `rrRescore.js`, `GhostOutcomePanel`, and `CandleChart` — reuse it; do not invent a new one.
  3. Net-R / equity aggregation should use the row's `be_exit_r` (≈0 for `be_stop`), not the
     baseline `r`. `be_exit_reason ∈ {be_stop, armed_not_triggered, never_armed}` maps to the
     tab's existing replay states: `be_stop→be_stopped_(loss_saved|winner_cut)` (by original
     outcome), `armed_not_triggered→be_armed_never_triggered`, `never_armed→original_(winner|loser)`.
  4. Add `BE_EXIT` to a single shared outcome-classification helper so all consumers agree.

### 6. EXACT vs REPLAY architecture recommendation
- Today `BreakevenTab` is **REPLAY-only**: it always candle-walks via `beReplay.js` and hard-codes
  a `REPLAY TIER` badge (BreakevenTab.jsx **L412–445**, methodology **L635–674**). It assumes the
  client computes everything; the backend is never consulted. (`beReplay.js` even documents the
  absolute-vs-local candle-index hazard it must work around — the EXACT path removes that hazard.)
- **Detection rule for the tab:**
  - **EXACT available** when `activeRun.beResults?.tradesByMode` contains a scenario whose
    `(arm_level, trigger_basis)` matches the user's selection → use backend `be_exit_reason` /
    `be_exit_r` / `be_exit_*` directly.
  - **REPLAY fallback** when `beResults` is absent/empty or the selected `(arm,trigger)` scenario
    wasn't exported → keep the current `beReplay` candle-walk.
- **Recommendation:** add a `beSource` resolver returning `"exact" | "replay" | "none"`; render an
  **EXACT TIER** badge (and drop the same-candle-ambiguity caveat) when exact, otherwise the
  existing REPLAY badge. Build an `buildExactBeSummary(beTrades, baseline)` that produces the same
  summary shape `buildBeScenarioSummary` returns, so the verdict/table/cards render unchanged.
  **Keep `beReplay.js` as the fallback engine — do not delete it.** Backend sweep is
  `arm ∈ config.be_arm_levels × trigger ∈ {wick,close}`; the tab's `ARM_LEVELS` (6 values) may
  exceed what was exported, so per-arm "exact vs replay" must be resolved cell-by-cell.

### 7. Risks
1. **HIGH — BE files misrouted into Protection.** `protectedTradeFileInfo`'s `(.+)` catch-all will
   classify `trades_single_position__be_wick_0p50R.csv` as `trades_protected`, landing it in
   `protectionTradesByMode` as a bogus mode (`be_wick_0p50r`). It would pollute the Protection
   mode list, auto-select, paired-trade math, and analytics. **Must add the BE parser ahead of the
   protection check.** This breaks *today* the moment a BE bundle is imported.
2. **HIGH — `cap("BE_EXIT") → "Be_exit"`** breaks all outcome guards (see §5). Old bundles
   unaffected (they have no BE rows).
3. **MED — storage size.** Each `(arm,trigger)` scenario is a full trade set; a sweep multiplies
   row count. Mirror `tradesOmittedForStorage` / IndexedDB handling used for protection, or the
   bundle may exceed persistence limits.
4. **MED — `BreakevenTab` prop surface.** It currently receives only primary `trades` + `candles`
   and recomputes. EXACT mode needs the per-scenario backend trades threaded in; the client
   baseline (no spread) will not exactly equal the backend baseline — label/handle the difference.
5. **MED — shared dirty files.** `importer.js` (Entry/FFT) and `ProtectionLab.jsx` are already
   modified by other streams. Coordinate; stage only BE lines.
6. **LOW — `be_exit_r = 0` semantics.** BE exits contribute ~0 to Net R and are neither win nor
   loss; equity-curve, win-rate, and PF must treat them as breakeven consistently.
7. **LOW — scratch files.** `frontend/be_debug.mjs`, `be_sanity.mjs`, `_p11c_parse.mjs` are
   untracked debug artifacts; exclude from any commit.

### 8. Implementation plan (no code now — proposed sequencing)
- **A. Importer ingestion (gated on field presence).** Add `beTradeFileInfo` + BE-specific key
  normaliser; insert the `trades_be` check before `trades_protected` in `detectFileKind`; add the
  `trades_be` switch case and `collected.be*`; parse `be_*` columns dual-keyed in the trade builder;
  pass `sm.be_results` through to `bundle.beResults`. Old bundles must be byte-for-byte unchanged.
- **B. Outcome canonicalisation.** Preserve ALL-CAPS tokens at L388; introduce one shared
  `classifyOutcome`/`outcomeBucket` helper; map `BE_EXIT→BREAKEVEN`; migrate the scattered
  string guards onto it.
- **C. Store.** Add `beResults` default + persistence/stripping mirroring `protectionResults`.
- **D. BreakevenTab EXACT path.** `beSource` resolver; `buildExactBeSummary`; EXACT badge; keep
  REPLAY fallback per-arm; thread `beResults` from `ProtectionLab`.
- **E. (optional, run-trigger side) `sidecarClient.js`/config.** Serialize `be_enabled`,
  `be_arm_levels`, `be_trigger_bases`, `be_stop_buffer_r`, `be_delay_candles` so the UI can *launch*
  exact BE runs. Not required to *consume* existing bundles, so it can trail A–D.
- **Validation & gates.** Extend the existing `data/__validation__/beReplay.validate.mjs` with a
  BE-ingestion case (routing, key normalisation, BE_EXIT bucketing, old-bundle no-op). Run the
  `AGENTS.md` UI greps (`font-mono`, `tracking-widest` → expect 0) before any commit. Stage only
  BE-scoped lines; commit on host (sandbox can't unlink `.git/index.lock`).

**Definition of done (frontend half):** BE CSVs route to `beResults.tradesByMode` (never into
Protection); `be_*` columns parsed dual-keyed; `BE_EXIT` bucketed as BREAKEVEN via a shared helper;
`BreakevenTab` shows EXACT when backend scenarios match selection and REPLAY otherwise; everything
gated on field presence so pre-Phase-2 bundles load unchanged; validation script + docs synced.
