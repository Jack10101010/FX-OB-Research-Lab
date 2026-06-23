# SESSION-STRATEGY-PROFILES-ARCHITECTURE-AUDIT-1

> **Mode: AUDIT / DESIGN ONLY — no implementation, no refactor, no file edits.**
> Goal: design a future architecture where each session can carry its own
> strategy profile (London / London Lull / New York / Asia / Outside), with
> per-cell rules by direction × structure × entry model × target × BE × protection,
> **without** running a separate full backtest per session/profile.
>
> Branch: `codex-dev` · Date: 2026-06-16 · Author: Claude (architect/audit)

---

## 0. Pre-implementation governance report (required by AGENTS.md)

**1 — Current project status.** Major workstream per `docs/ai/PROJECT_STATUS.md` is
**Failures Lab V5 decision-layer + Research Cockpit** (read-only insight surfaces over
existing analytics). The platform is a React research lab over order-block backtests;
the Python engine (`Lux-OB-Backtester`) is a **separate repo, not mounted here**.

**2 — Current active workstream.** `CURRENT_WORKSTREAM.md` (last updated 2026-06-13)
says focus is "research interpretation / decision-layer," with next-focus unconfirmed.
**This session-profiles task is a new, larger architecture initiative** and does not
match any open stream — it should become its own workstream.

**3 — Recently completed.** Research Cockpit Phase 1 + V2.0A, OB Lab Insights, Distance-at-arm
consumption (D-014), Triggered-edge entry-universe expansion to C0–C6 (D-013), OB-Retest v2.1,
Failures Lab Loser Run-Up, Storage durable mirror (D-012), Selective BE / BE Explorer (D-011).

**4 — Active dirty files and owning workstreams** (`git status --short`, 15 files, all frontend):

| Dirty file | Owning workstream |
|---|---|
| `components/lab/ResearchContextBanner.jsx`, `ResearchResultViewBanner.jsx`, `ResearchRunHeader.jsx`, `researchBanner/BannerRunIdentity.jsx`, `CurrentResultViewPanel.jsx`, `ResearchBannerShell.jsx`, `bannerRun.js` | Research Banner / Phase 14 Wave 2 |
| `components/lab/entries/EntriesWorkspace.jsx`, `entries/shared/EntryWorkspaceHeader.jsx` | Entry / FFT / Paired Runs |
| `data/sidecarClient.js`, `pages/Runs.jsx` | Large-run import / run-naming (recent `2f8b174`, `ca25eb5`) |
| `pages/ClusterExplorer.jsx`, `pages/ResearchCockpit.jsx` | Research Cockpit |
| `pages/StrategyBuilder.jsx` | **Shared hotspot** — Entry/FFT + Master Controls (will be central to this work; coordinate) |
| `pages/RunDetail.jsx` | **Shared hotspot, ambiguous owner** — attribute to Banner or Entries before anyone stages it |

**None of these are touched by this audit.** This audit adds exactly one new file
(this document).

**5 — Documentation drift (material).**
- **`docs/ai` claims `codex-dev` is "15 commits ahead of origin/codex-dev, NOT pushed."
  Live git shows `0 0` — fully synced.** The push happened; the docs are stale. Correct
  before trusting any "push is gated" note.
- `CURRENT_WORKSTREAM.md` / `PROJECT_STATUS.md` last synced 2026-06-13, but root docs dated
  06-14 → 06-16 (`LIVE-BOT-*`, `LIVE-TOWER-*`, `LARGE-RUN-IMPORT-*`, `MARKET-DATA-UPDATER-*`,
  `MASTER-CONTROLS-AND-CALC-TRUST-AUDIT`) and commits (`live-tower`, lazy large-run import,
  TE C0–C6) post-date the sync. A `/sync` is overdue.

**6 — Active parallel workstreams.** Research Banner/Phase 14 W2, Entry/FFT, Large-run import,
Research Cockpit, Master Controls, Protection Lab/BE, Strategy Map, OB-Retest, Session Lab,
Live Tower/Bot (new). Session profiles will **touch StrategyBuilder + configTranslator +
configRegistry + tradeUniverse + importer** — all shared with Entry/FFT and Master Controls.
Heavy coordination required.

**7 — Recommended next task.** Phase 1 below (per-session × structure × direction **enable
matrix**, resolved client-side as a tier-1 mask over the existing trade universe) — it reuses
two already-shipped composite arrays and needs **zero backtests**.

**8 — Commit boundaries (for this audit).** Audit is read-only → single additive artifact.
Commit this doc alone: `docs(session-profiles): add architecture audit`. Do **not** stage any
of the 15 dirty files. An optional `/sync` to fix the origin-state drift (item 5) is a separate,
docs-only commit.

---

## 1. Current architecture summary

### 1.1 Two-tier system: backtest export → frontend resolution

The platform is **not** "configure → run → read results." It is:

1. **Backend (`Lux-OB-Backtester`, separate repo)** detects OBs and candles **once**, then
   simulates a **grid of pre-computed trade universes**, exported as CSVs per
   `executionMode × entryModel × threshold × arm` (and a `protection/` matrix of
   `… × protectionMode × paramKey`). Confirmed via `STRUCTURE-DIRECTION-FILTERS-1.md`,
   `PROTECTION-MATRIX-SCALABILITY-AUDIT.md`, `BE-BACKEND-EXACT-REPLAY-*`.
2. **Frontend (`frontend/src/data/*`)** imports that grid (`importer.js`, 1963 LOC) and exposes
   a **resolution layer** — `resolveTradeUniverse()` (`tradeUniverse.js`) answers "given a run
   bundle + active scenario, which trades am I looking at?" and `applyProtectionLayers()` folds
   BE/gates over the selected universe to produce a `protected_result` universe with the **same
   contract** every page reads.

This is the "major speed improvement work" referenced in the request: **the expensive,
shareable work (detect once, simulate the grid) is done once; exploration is frontend
selection/replay over the grid, not re-runs.**

### 1.2 Per-trade metadata already present (the dimensions the request needs)

Every imported trade row already carries (from `importer.js`):

| Dimension | Field(s) | Status |
|---|---|---|
| **Session** | `fillSession` / `fill_session` / `session` (+ `obOriginSession`, `obDetectionSession`) | ✅ exported. Values: Asia, London Killzone, London Lull, New York, NY PM, Outside |
| **Direction** | `direction` → normalized "Long"/"Short" | ✅ exported |
| **Structure** | `structure` → normalized "BOS"/"CHoCH" (from `structure_tag`) | ✅ exported |
| **Entry model / arm** | `entry_model_key` (e.g. `entry_triggered_edge_25p0_d2`), `fill_delay_candles` | ✅ exported per-CSV |
| **Target (RR)** | `rr_config` per trade; `rr_multiple` config default **3.3** | ✅ but **global, single value** |
| **BE / protection** | `protection_mode`; `protection/` matrix cells; client `beReplay.js` | ✅ matrix + replay |

So the **classification inputs for a session profile already exist per trade**. The system also
already supports **direction-asymmetric configs** at the file level —
`trades_one_per_direction__dir_long_te25_d2__short_te25_next.csv` (long and short carrying
*different* entry configs in one export, parsed by `directionalTradeFileInfo()` in `importer.js`).
This is the strongest existing precedent for what the request asks.

### 1.3 The config tier model (the key to the performance answer)

`configRegistry.js` tags every config field with a **tier**:

- **Tier 1 — frontend-only filter** (no rerun): selection/masking dimensions.
- **Tier 2 — rescore candidate**: changes outcomes but can be recomputed from existing data.
- **Tier 3 — full rerun required**: changes the trade path/candidate set.

Mapping the request's profile dimensions onto the live tiers:

| Profile dimension | Existing config | Class | Tier | Cost to vary per session |
|---|---|---|---|---|
| Session selection | `allowed_sessions` (london/lull/newYork/asia/outside) | gate/mask | **1** | **Free** (frontend) |
| Structure (BOS/CHoCH) | `allowed_structure_directions` | gate/mask | **1** | **Free** (frontend) |
| Direction (long/short) | `allowed_structure_directions` | gate/mask | **1** | **Free** (frontend) |
| Entry model / arms | `selected_entry_model`, TE thresholds, C0–C6 | selection over pre-exported universes | **3** to *generate*, **1** to *select* | **Free if the variant was exported**; rerun only to add a new variant |
| Target horizon / rule | `rr_multiple` (=3.3) | path-dependent outcome modifier | **2** | Cheap **if** outcomes are pre-cubed or replayed; else rerun |
| Break-even criteria | BE matrix + `beReplay.js` | path-dependent outcome modifier | matrix | Cheap **if** cell pre-generated or replayed |
| Protection criteria | `protectionLayers.js` (outcome-modifiers **vs** gates) | mixed | matrix **or** 1 | Gates free; outcome-modifiers as BE |

**This table is the whole performance story.** Three of the request's dimensions (session,
structure, direction) are *already tier-1 frontend masks*. Entry-model selection is free as long
as the variant exists in the export. Only **target/BE/protection are path-dependent**, and the
matrix audit already prescribes the lever that keeps them cheap (§4.2).

### 1.4 Where each rule is applied today

- **Session / structure / direction filtering**: today applied as **global** pre-filters —
  `allowed_sessions` and `allowed_structure_directions` are flat composite arrays built in
  `buildBacktesterConfig()` (StrategyBuilder) and enforced backend-side before the entry loop
  (`STRUCTURE-DIRECTION-FILTERS-1.md` §A). Frontend analytics (`buildDirStructMatrix`,
  SessionLab `StructureLab`/`DirectionLab`) already group trades by these fields.
- **Entry model**: chosen globally (`selected_entry_model` + thresholds/arms); the backtester
  exports one CSV per variant; the frontend selects among them in `tradeUniverse.selectTrades()`.
- **Target (RR)**: **one global `rr_multiple`** baked into the simulation. There is **no per-cohort
  target axis** today, and no per-trade multi-target outcome cube. (`r_if_no_target*` and the
  `post_stop_* / fixed_horizon` fields hint at horizon-style outcomes but are loss-diagnostic, not
  a first-class selectable target set.)
- **BE / protection**: resolved per entry variant via the matrix (`beResolve.findBeScenario`, EXACT
  variant match, no baseline fallback) or client-replayed (`beReplay.js`, "research-grade,
  candle-resolution, spread not modelled"). `protectionLayers.js` already separates
  **outcome-modifiers** (re-simulate per variant) from **gates/annotators** (client masks).

### 1.5 Is target / BE / protection logic "one global config" today?

**Yes for target** (single `rr_multiple`). **No for BE/protection** — those are already
*variant-scoped* (a cell per entry variant). The new requirement is to make all three
**cohort-scoped** (session × structure × direction), which the variant-scoping precedent and the
matrix architecture already accommodate; target is the one genuinely missing axis.

---

## 2. Can session profiles be resolved in a single pass? (the central question)

**Yes — as a frontend per-trade resolution layer over the existing grid, not N backtests.**

The natural design is a **profile resolver** that generalizes the two patterns the codebase
already has (`resolveTradeUniverse` + `applyProtectionLayers`) from *global* to *cohort-aware*.
For each trade in the run's universe:

```
1. Classify cohort = (session, structure, direction)      ← already on the trade row, O(1)
2. Look up profile = profiles[session][structure_direction] ← O(1) hash lookup (cheap rule lookup)
3. If profile.disabled → drop trade (mask)                 ← cheap
4. Resolve entry model/arm → pick the trade's row from the
   matching pre-exported entry universe                    ← cheap IF variant exported
5. Resolve target → pick the trade's outcome under that
   target                                                  ← cheap IF outcomes pre-cubed/replayed
6. Resolve BE/protection → pick matrix cell or client-replay ← cheap IF pre-generated/replayed
7. Stamp attribution fields, accumulate into result set
```

Steps 1–4 are **pure selection** and cost a single O(n) pass over trades with O(1) lookups — the
same complexity as today's resolver. Steps 5–6 are the only ones that can require recomputation,
and they're bounded by **data availability**, not by run count:

- **Cheap-rule-lookup parts**: cohort classification, enable/disable, entry-model/arm selection,
  and target/BE/protection **selection when the cell already exists**. All O(1) per trade.
- **Expensive-recomputation parts**: producing a target/BE/protection outcome that was **not**
  pre-computed. Two escape hatches already exist — client **replay** from `candles.csv`
  (`beReplay.js`, research-grade) or a **matrix sub-job** that attaches to the run and reuses its
  OBs/candles (no re-detect, no re-load).

**Trade candidates are generated once, then resolved against profile rules** — exactly the request's
preferred model. The session-profile layer is a *consumer* of the existing universe/matrix, not a
new generator.

### 2.1 Does this multiply run count or stay single-pass?

**Single-pass.** Session profiles add **zero** runs for the selection dimensions. They never
multiply the scenario cube — they **read cells from it per cohort**. The cube needs **one additive
axis** (target) only if per-session targets are required and not already present, and that axis is
generated by the **"one candle-walk → all targets"** lever (§4.2), which is additive to a single
run, not multiplicative across runs.

### 2.2 Scenario-cube impact

The "scenario cube" = `executionMode × entryModel × arm × protection × (target)`. Session profiles
do **not** enlarge it; they sit **above** it as a resolution/selection layer. The only cube change
is the optional **target axis**: emit each trade's exit-R for a small set of target models from one
walk (e.g. RR 1/2/3.3 and/or time horizons), so per-session target choice becomes a lookup. This is
the same shape as "one walk → all BE arm levels."

### 2.3 Caching / indexing needed

- **Cohort index**: pre-bucket the universe once per run into `Map<"session|structure|direction", Trade[]>`
  so profile resolution is per-bucket, not a full re-scan per edit.
- **Profile resolution memo**: key the resolved result set by `(runId, universeKey, profileHash)`;
  recompute only when the profile or active universe changes (mirrors `previewLens` / Master Controls
  memoization).
- **Matrix manifest** (already recommended in `PROTECTION-MATRIX-SCALABILITY-AUDIT.md` §4): a
  first-class list of which (variant × protection × target) cells exist, so the resolver can say
  "lookup" vs "replay" vs "generate" declaratively instead of probing.
- **Multi-target column block** (new): per-trade `exit_r_by_target` map if the target axis is cubed.

---

## 3. Required backend changes (`Lux-OB-Backtester`, spec only — repo not mounted)

The backend is a separate repo; per existing project convention these are **implementation prompts**,
not edits here. In dependency order:

1. **Per-session structure-direction allow-lists (gate).** Extend the already-recommended
   `allowed_structure_directions` with `session_structure_direction_overrides` (the exact Phase-2
   shape from `STRUCTURE-DIRECTION-FILTERS-1.md` §F):
   `effective = overrides.get(fill_session, global_allowed)`. Pure gating, before the entry loop.
   **Optional** — Phase 1 can do this entirely frontend-side (see §4.1); backend gating only saves
   simulating trades that the frontend would mask anyway.
2. **Multi-target outcome emission (the one real new export).** From the **single** candle walk per
   trade, emit exit-R for a small configured set of target models (`target_models: ["rr_3p3",
   "rr_1p0", "time_1h", "time_3p3h", …]`) as a per-trade column block `exit_r_by_target` (+ exit time/
   bar per target). This is lever #1 generalized from BE arms to targets — **additive to one run, no
   run multiplication.** Requires confirming what "target horizon" means (see Blocker B-1).
3. **Generalize `be_results` → `protection_results[mode][entryVariant][protKey]`** and add
   `protection_manifest.json` (already specced in the matrix audit §4). Keep `be_results` alias.
4. **Attribution passthrough**: if the backend (rather than the frontend) resolves profiles, stamp
   `active_session_profile`, `active_rule_profile`, `target_profile`, `be_profile`,
   `protection_profile` per trade and `*_skipped` counters in `summary.json`. **Recommended: keep
   resolution frontend-side** (§4) and have the backend only ensure the *cells exist*; attribution is
   then stamped by the resolver.

**Net backend ask:** only #2 (multi-target) is genuinely new data; #1/#3/#4 are extensions of
patterns already designed. Everything else is frontend.

---

## 4. Required frontend changes

### 4.1 Data layer (the core)

- **New `data/sessionProfiles.js`** — the profile schema, validation, defaulting/inheritance, and a
  pure `resolveSessionProfileUniverse({ bundle, baseUniverse, profiles })` that performs the §2
  per-trade resolution and returns the **same TradeUniverse contract** (`universeType:
  "profiled_result"`, `trades`, `stats`, `warnings`, plus `baseEntryTrades`/`baseEntryStats` for
  Δ-vs-global). This sits beside, and composes with, `applyProtectionLayers`.
- **Generalize `tradeUniverse.js`** — let `resolveTradeUniverse` optionally accept a `profiles`
  object and route through the new resolver after the protection fold. Keep the no-profile path
  byte-identical (back-compat: old scenarios resolve unchanged).
- **Generalize `beResolve.js` → protection/target cell lookup** — manifest-aware
  `resolveCell({ entryVariant, protMode, paramKey, targetModel })` returning
  `{ status: present|missing|replay|generate, trades|null, reason }`.
- **`importer.js`** — map the new `exit_r_by_target` block and `protection_manifest.json`; map any
  per-cohort skip counters. (Hotspot — stage deliberately; shared with Entry/FFT.)
- **Cohort index + memo** (§2.3).

### 4.2 The performance lever, restated for implementers

For target/BE/protection, **never re-run; derive many outcomes from one walk**:
- BE: one walk per (variant, trigger) → all arm levels (matrix audit lever #1, ~9× fewer passes).
- Target: one walk per trade → exit-R for every target model in the set.
- Gates (EMA/liquidity/quality/session/structure/direction): per-trade masks, composed client-side
  for free — they never enter the cube.

### 4.3 Strategy Builder UI

The request's example is fundamentally a **matrix**: 5 sessions × 4 structure-direction cells, each
cell holding a rule profile. Recommended UX (consistent with AGENTS research-preservation rules —
**additive, do not remove the existing global controls**):

- **Keep the existing global controls as the default layer.** The current 2×2 structure-direction
  grid + session-filter chips become the **"Global / default profile."** Everything inherits from it.
- **Add a Session Profile Matrix editor** (new panel/tab in Strategy Builder): rows = sessions
  (London, London Lull, New York, Asia, Outside), each row expandable into the 4 cells
  (BOS-Long, BOS-Short, CHoCH-Long, CHoCH-Short). Each cell is **"Inherit"** by default; clicking it
  opens a compact popover to set `{ enabled, entry_model/arm, target_model, be_profile,
  protection_profile }`.
- **Tame complexity via inheritance + progressive disclosure.** Up to 5×4×5 ≈ 100 settings is
  unusable if flat. Default every cell to "inherit from global," show an **override badge** only on
  cells that differ, and offer **row-level** ("apply to all 4 cells in this session") and
  **column-level** ("apply to this structure-direction across all sessions") quick-set. A collapsed
  matrix should read at a glance: green = enabled/inherit, amber = overridden, grey = disabled.
- **Reuse existing primitives**: profile dropdowns reference **named** `be_profile` /
  `protection_profile` / `target_profile` presets (so cells stay terse and profiles are editable in
  one place), echoing the existing presets/Master Controls pattern. Don't inline raw BE params per
  cell.
- **Config Scope Ribbon**: extend with a "Session profiles: N overrides" chip.

This **preserves** all current explorers and the global flow; it is an additive matrix overlay, not a
replacement (satisfies "Existing Explorer Protection").

### 4.4 Analytics / explorers

`SessionLab`, `buildDirStructMatrix`, Failures/Direction explorers already group by
session/structure/direction. They consume the resolved universe automatically. **Add** a
profile-attribution grouping (results by session × structure × direction × entry-model × target) and
an Original→Profiled→Difference framing (mirrors Selective-BE's D-011 framing) so users see what each
session profile *did* to the edge.

---

## 5. Output / export implications

Per-trade resolved attribution fields (stamped by the resolver, or backend if it resolves):
`active_session_profile`, `active_rule_profile` (e.g. `asia.choch_long`), `profile_enabled`,
`resolved_entry_model`, `target_profile`, `be_profile`, `protection_profile`, and the chosen
`exit_r_by_target` value used. Plus run-level breakdowns by **session + BOS/CHoCH + direction +
entry model (+ target/BE/protection)** — most of the grouping infra exists; the new part is keying it
by the resolved profile. CSV/JSON export of the profile config itself (round-trippable through
`configTranslator.js`, like the TE threshold-set round-trip in D-013).

---

## 6. Performance risks

- **R-1 Target axis is the only true new compute.** If "per-session targets" is in scope and targets
  aren't cubed, the resolver must either replay (research-grade, not authoritative — no spread/
  slippage; `beReplay.js` caveats) or trigger a matrix sub-job. **Mitigation:** one-walk-all-targets
  export; cap the target set; lazy-generate exotic targets.
- **R-2 Replay fidelity.** Client replay is candle-resolution and explicitly "research-grade." Per-
  session results built on replay must be **labelled as estimates**, not authoritative, exactly as BE
  REPLAY is today. Don't silently present replayed per-session P&L as truth.
- **R-3 Position-conflict correctness.** `one_per_direction` / `allow_multi_position` accounting is
  decided **at simulation time**. If a profile disables some cohorts, post-hoc masking may not equal a
  true re-sim of position conflicts (a disabled trade might have blocked/allowed another). This is the
  same class of caveat as BE replay — **document it**; for authoritative numbers on conflict-sensitive
  variants, a real run is still required.
- **R-4 Combinatorial UI, not compute.** The blow-up risk is *configuration* complexity, not CPU.
  Inheritance/defaults (§4.3) are the mitigation.
- **R-5 Cube growth if targets are mis-modeled as runs.** If someone implements per-session targets by
  launching a run per target, the single-pass property is lost. The design must route targets through
  the cube axis, never the run loop.
- **R-6 Memoization invalidation.** Profile edits must invalidate the resolution memo precisely
  (`profileHash`) or stale per-session stats will show. Mirror existing `previewLens` invalidation.

---

## 7. Recommended data / config shape

Anchored on the request's example and the already-chosen `allowed_*` array conventions. **Named
profiles** keep cells terse; the matrix references them.

```jsonc
{
  "session_profiles_enabled": true,

  // Reusable, named building blocks (edited once, referenced by cells):
  "target_profiles":     { "target_3_3h": { "type": "rr",   "value": 3.3 },
                           "target_1h":   { "type": "time", "hours": 1.0 } },
  "be_profiles":         { "be_wick_1R":  { "trigger": "wick",  "armR": 1.0 } },
  "protection_profiles": { "none": {},     "trail_atr": { "mode": "trailing_stop", "atr": 1.5 } },
  "entry_profiles":      { "te25_d2": { "model": "triggered_edge", "threshold": 25, "arm": "d2" },
                           "te25_c1": { "model": "triggered_edge", "threshold": 25, "arm": "next" } },

  // Global default — the existing controls; every cell inherits unless overridden:
  "default_profile": {
    "enabled": true, "entry_profile": "te25_d2",
    "target_profile": "target_3_3h", "be_profile": "be_wick_1R", "protection_profile": "none"
  },

  // Per session → per structure_direction cell. Omit a cell to inherit default_profile.
  "session_profiles": {
    "london": {                       // all London cells inherit except where set
      "_session_default": { "target_profile": "target_3_3h", "entry_profile": "te25_d2",
                            "be_profile": "be_wick_1R" }
    },
    "asia": {
      "choch_long": { "enabled": true,  "target_profile": "target_1h",  "entry_profile": "te25_c1",
                      "be_profile": "be_wick_1R", "protection_profile": "none" },
      "bos_short":  { "enabled": true,  "target_profile": "target_3_3h","entry_profile": "te25_d2",
                      "be_profile": "be_wick_1R", "protection_profile": "trail_atr" },
      "bos_long":   { "enabled": false },
      "choch_short":{ "enabled": false }
    }
    // london_lull, new_york, outside …
  }
}
```

**Resolution rule:** `cell ⟶ session._session_default ⟶ default_profile` (first defined wins per
field). Back-compat: when `session_profiles_enabled` is absent/false, behavior is exactly today's
global `allowed_sessions` + `allowed_structure_directions` + global `rr_multiple`/BE. Sessions use the
exported `fill_session` taxonomy (Asia / London Killzone / London Lull / New York / NY PM / Outside —
note NY PM exists in data; decide whether to surface it as a 6th row).

---

## 8. Suggested phased implementation plan

Each phase is independently shippable and ordered so the cheapest, highest-confidence value lands
first and nothing is built before it's needed.

- **Phase 0 — Decisions & manifest.** Resolve Blockers §9 (esp. target semantics B-1). Add the
  `protection_manifest` (per matrix audit) so availability is declarative. *No user-visible change.*
- **Phase 1 — Per-session enable matrix (selection only, frontend-only, ZERO backtests).** Extend the
  shipped tier-1 masks to `session × structure × direction` enable/disable, resolved client-side over
  the existing universe. This alone delivers "different sessions, different structure-direction rules"
  with no backend. *Highest ROI, lowest risk.*
- **Phase 2 — Per-cell entry model/arm selection.** Resolve each enabled cell's trades from the
  already-exported entry universes. Free where the variant exists; surface "not exported · generate"
  where it doesn't. Still no new run for existing variants.
- **Phase 3 — Per-cell BE & protection.** Route cells through the manifest-aware resolver →
  matrix-cell lookup, else labelled REPLAY, else generate sub-job. Reuse `protectionLayers` /
  `beReplay`. Original→Profiled→Difference analytics.
- **Phase 4 — Per-cell target.** Implement the one-walk-all-targets export + `exit_r_by_target`
  mapping; per-session target becomes a lookup. (Backend dependency — the only new export.)
- **Phase 5 — UI polish & attribution.** Full matrix editor with inheritance/quick-set, scope ribbon,
  export of attribution fields, profiled breakdowns across labs.

Phases 1–2 require **no backend work** and prove the architecture end-to-end on existing runs.

---

## 9. Blockers & risky assumptions

- **B-1 (must clarify) — "target horizon, e.g. 1h, 3.3h" meaning.** Is `3.3` a **3.3R** target
  (matches the existing global `rr_multiple` default of 3.3) or a **3.3-hour time horizon**? The
  current engine uses RR targets; time-horizon outcomes exist only as loss-diagnostic
  `post_stop_*/fixed_horizon` fields, not a selectable target set. This determines whether Phase 4 is
  "cube the RR axis" (small) or "build a time-horizon exit model + cube it" (larger). **Recommend
  asking the user before scoping Phase 4.**
- **B-2 — Backtester repo not in this workspace.** All §3 claims rest on prior audit docs
  (`STRUCTURE-DIRECTION-FILTERS-1`, `PROTECTION-MATRIX-SCALABILITY-AUDIT`, `BE-BACKEND-EXACT-REPLAY-*`),
  not direct inspection. Verify against the live `Lux-OB-Backtester` before backend implementation.
- **B-3 — Variant availability per run.** A profile cell can only be *resolved by selection* if its
  entry/target/protection variant is present in that run's export. Profiles must degrade gracefully
  (show "not generated · generate") rather than silently fabricate.
- **B-4 — Replay is research-grade.** Per-session numbers built on client replay are estimates
  (no spread/slippage, candle resolution). Must be labelled, never presented as authoritative.
- **B-5 — Position-conflict semantics (R-3).** Post-hoc masking ≠ true re-sim for conflict-sensitive
  position modes. Document; require a real run for authoritative conflict-sensitive results.
- **B-6 — Doc drift / coordination.** `docs/ai` origin-state is stale (says unpushed; git is synced),
  and StrategyBuilder/configTranslator/importer/tradeUniverse are shared hotspots with Entry/FFT and
  Master Controls. `/sync` first; coordinate staging.
- **A-1 (assumption) — NY PM.** Data carries "NY PM" distinct from "New York." Assumed the profile
  matrix should expose it (or fold it into New York) — **confirm** which.
- **A-2 (assumption) — Named profiles over inline params.** Assumed cells reference named
  target/BE/protection/entry profiles (terser, editable once). Confirm vs fully-inline per-cell config.

---

*End of SESSION-STRATEGY-PROFILES-ARCHITECTURE-AUDIT-1 — audit only; no files changed besides this document.*
