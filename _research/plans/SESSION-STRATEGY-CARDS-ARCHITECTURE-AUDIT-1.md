# SESSION-STRATEGY-CARDS-ARCHITECTURE-AUDIT-1

> **Mode: AUDIT / DESIGN ONLY — no implementation, no refactor, no file edits.**
> Goal: design "Session Strategy Cards" — one configurable strategy section per
> session (London / London Lull / New York / Asia / Outside, possibly NY PM), each
> with a *default settings* area plus optional per-cohort overrides
> (BOS Long / BOS Short / CHoCH Long / CHoCH Short), spanning entry setup, buffers,
> entry model + TE threshold + delay/arm, BE, protection (later), and RR target
> (later, **RR-based only — no time-horizon targets**).
>
> Builds on the shipped Phase 1 enable matrix (`data/sessionProfiles.js`).
> Branch: `codex-dev` · Date: 2026-06-16 · Author: Claude (architect/audit).

---

## 0. Core question, answered first

**"Can each session card resolve different entry / buffer / BE settings by
selecting from already-exported universes, without creating new backend runs?"**

**Partly — and the split is clean:**

- **YES, frontend-only, no new runs:** session enable, structure×direction
  enable/disable, **entry model**, **TE threshold**, **delay/arm (C0–C6)**,
  **penetration threshold**, and **break-even cell** — *provided that variant was
  included in the active run's export*. These already exist as separate, addressable
  universes (`entry_model_key` CSVs) and matrix cells (`beTradesByMode[mode][entryVariant][beKey]`).
  A session card resolves them by selecting *each cohort's* trades from the matching
  pre-exported universe instead of selecting one universe globally. This is a direct
  generalization of the existing `tradeUniverse.selectTrades()` + BE resolver from
  *global* to *per-cohort*.
- **NO from today's exports (needs backend):** **entry buffer**, **OB entry depth**,
  and TE **protection** (cancel-on-retrace / FFT) change the *fill eligibility and
  trade path*, so they are not represented by any exported axis — exact per-session
  values need a rerun or a new export axis. **Stop buffer** and **per-cohort RR
  target** are *replayable* (research-grade) or need a new export axis.

So a genuinely useful Session Card — enable/disable + entry model + threshold + arm
+ BE — is achievable **frontend-only now**; buffers, protection, and per-session RR
target are the backend-dependent tail. The architecture should let the card surface
both, clearly labelling which settings are live-resolvable vs "requires a run."

---

## 1. Current field classification table

Source: `data/configRegistry.js` (tier + backendKey are quoted from the registry).
Registry tier legend: **1** = frontend-only filter · **2** = "future rescore
candidate" (NOT yet frontend-resolvable) · **3** = full rerun required.

The **Resolution class** column is the operative one for Session Cards:
`MASK` (frontend-only) · `SELECT` (pick a pre-exported universe; free if exported) ·
`REPLAY` (client candle-walk, research-grade) · `RERUN` (needs a backtest) ·
`NEW-AXIS` (needs a new pre-computed export dimension to be cheap).

| Card setting | Registry key (tier) | backendKey | Resolution class | Per-session now? |
|---|---|---|---|---|
| Session enable/disable | `sessionFilter`/`london`…`outside` (1) | `allowed_sessions` | **MASK** | ✅ now (Phase 1) |
| BOS/CHoCH × Long/Short enable | `bosLong`…`chochShort` (1) | `allowed_structure_directions` | **MASK** | ✅ now (Phase 1) |
| Direction scope | `direction` (1) | `trade_direction` | **MASK** | ✅ now |
| Entry model (baseline/penetration/TE) | `selectedEntryModel` (3*) | — (selects CSV) | **SELECT** | ✅ if exported |
| TE threshold | `singleTriggeredEdgeThreshold` / `triggeredEdgeThresholds` (3) | `triggered_edge_trigger_thresholds` | **SELECT** | ✅ if exported |
| TE delay / arm (C0–C6) | `triggeredEdgeDelays` / `triggeredEdgeSameCandleMode` (3) | `triggered_edge_candle_delays` | **SELECT** | ✅ if exported |
| Penetration threshold | `entryPenetrationThresholds` (3) | `entry_penetration_thresholds` | **SELECT** | ✅ if exported |
| Entry thresholds (set) | `triggeredEdgeThresholds` (3) | `triggered_edge_trigger_thresholds` | **SELECT** | ✅ if exported |
| Break-even (arm × trigger) | (protection matrix) | `beTradesByMode[…][beKey]` | **SELECT**, else **REPLAY** | ✅ if exported; else estimate |
| Stop buffer | `stopBuffer` (2) | `stop_buffer_pips` | **REPLAY** or **NEW-AXIS** | ⚠ estimate, or backend |
| RR target | `rr` (2) | `rr_multiple` | **NEW-AXIS** (or **REPLAY**) | ⚠ needs target axis |
| Entry buffer | `entryBuffer` (2) | `entry_buffer_pips` | **RERUN** / **NEW-AXIS** | ❌ backend |
| OB entry depth % | `obEntryDepthPct` (2) | `ob_entry_depth_pct` | **RERUN** / **NEW-AXIS** | ❌ backend |
| Verify limit ticks | `verifyTicks` (2) | `verify_limit_ticks` | **RERUN** | ❌ backend |
| TE protection: cancel-on-retrace | `triggeredEdgeCancelOnRetrace` (3) | `triggered_edge_cancel_on_retrace` | **RERUN** / **NEW-AXIS** | ❌ backend |
| TE protection: FFT move-away | `triggeredEdgeFftMoveAwayPips` (3) | `triggered_edge_fft_move_away_pips` | **RERUN** (FFT control pairs exist) | ❌ backend |
| Cost (spread/slippage/commission) | `spread`/`slippage`/`commission` (2) | `spread_pips`… | **REPLAY/RESCORE** (global lens exists) | ⚠ via Master Controls lens |
| Core (symbol/TF/dates/swing/OB size/exec mode) | (3) | — | **RERUN** | ❌ never per-session |

\* `selectedEntryModel` is tagged tier 3 because *generating* the variant needs a
run; but once generated, *selecting* it is free. That generate-vs-select duality is
the crux of the whole design.

**Reading the table:** the MASK + SELECT rows are the frontend-only Session-Card
surface available today. REPLAY rows are research-grade estimates. RERUN/NEW-AXIS
rows are the backend tail.

---

## 2. Field classification by the five requested buckets

- **Frontend-only selection/mask (live now):** session enable; BOS/CHoCH×L/S enable;
  direction scope.
- **Selectable if already exported (frontend, no rerun):** entry model; TE threshold;
  TE delay/arm; penetration threshold; entry-threshold set; BE arm×trigger cell.
- **Replayable / rescorable (research-grade, label as estimate):** BE (when the exact
  cell is missing → `beReplay.js`); stop buffer (recompute R from candle path);
  RR target (re-derive exit from candle/MFE path); cost (existing preview lens).
- **Requires backend rerun:** entry buffer; OB entry depth; verify ticks; TE
  protection (cancel-on-retrace, FFT); all core fields.
- **Requires a new backend export axis (to be cheap & exact, not replay):**
  per-cohort **RR target** (`exit_r_by_target` from one walk — the prior audit's
  lever #1); **entry/stop buffer** as pre-computed variant axes; **per-session
  protection** variants.

---

## 3. Which settings can safely be session-specific *now*

A Session Card can, **today, frontend-only, with zero new runs**, vary per session
(and per BOS/CHoCH×L/S cohort):

1. Enable / disable (Phase 1 — shipped).
2. Entry model + TE threshold + delay/arm + penetration threshold — by **selecting
   each cohort's trades from the matching `entry_model_key` universe**.
3. Break-even arm × trigger — by selecting the matching matrix cell
   (`beTradesByMode[mode][entryVariant][beKey]`), falling back to labelled REPLAY.

The hard precondition: **the active run's export must contain every entry/BE variant
any card references.** This is the same export the user already chooses in Strategy
Builder; Session Cards *consume* it per cohort, they do not enlarge it. If a card
references a variant the run didn't export, that cohort is "not resolvable —
generate / re-run," never silently faked.

---

## 4. Which settings require backend support

- **Entry buffer, OB entry depth, verify ticks** — change fill price/eligibility →
  not in any exported axis → **rerun** (or a new pre-computed buffer axis).
- **TE protection (cancel-on-retrace, FFT move-away/width)** — simulation-time path
  changes → **rerun** (FFT already has auto-pair control exports, but per-session FFT
  is not an existing axis).
- **Per-cohort RR target (exact)** — single global `rr_multiple` today → **new
  multi-target export axis** (`exit_r_by_target`, one walk → all targets) to be cheap
  & exact; otherwise REPLAY (estimate). **RR-based only, per the directive.**
- **Stop buffer (exact)** — REPLAY gives a research-grade estimate now; exact needs a
  stop-buffer export axis.

---

## 5. Config shape — `session → session default → cohort overrides` (recommended)

Yes. This three-level shape is correct and is a clean superset of the shipped Phase 1
`cells` map. It also matches the existing global→default precedent in the codebase.

```jsonc
{
  "session_cards_enabled": true,

  // Reusable named building blocks (edited once; referenced by cards) —
  // entry/be/target profiles resolve to pre-exported universes / matrix cells.
  "entry_profiles":  { "te25_d2": { "model": "triggered_edge", "threshold": 25, "arm": "d2" },
                       "baseline": { "model": "baseline" } },
  "be_profiles":     { "none": null, "be_wick_1R": { "trigger": "wick", "armR": 1.0 } },
  "target_profiles": { "rr_3p3": { "type": "rr", "value": 3.3 } },   // RR only

  // Global default — the existing Strategy Builder controls; everything inherits this.
  "global_default": {
    "entry_profile": "te25_d2", "be_profile": "be_wick_1R", "target_profile": "rr_3p3",
    "stop_buffer_pips": 1.0   // resolvable only via REPLAY / new axis; shown as such
  },

  // One card per session.
  "session_cards": {
    "asia": {
      "enabled": true,
      // Card-level default → overrides global_default for this whole session:
      "default": { "entry_profile": "baseline", "target_profile": "rr_3p3" },
      // Optional per-cohort overrides → override the card default:
      "overrides": {
        "choch_long": { "enabled": true, "entry_profile": "te25_d2", "be_profile": "be_wick_1R" },
        "bos_short":  { "enabled": true, "entry_profile": "baseline" },
        "bos_long":   { "enabled": false },
        "choch_short":{ "enabled": false }
      }
    },
    "london": { "enabled": true, "default": { "entry_profile": "te25_d2" }, "overrides": {} }
    // london_lull, new_york, outside …
  }
}
```

**Resolution precedence (per trade):** `cohort override ⟶ card default ⟶ global default`
(first defined field wins). Phase 1's flat `cells[session][cell] = "enabled"|"disabled"`
maps onto `overrides[cohort].enabled`, so **no migration loss** — the shipped slice is
forward-compatible (normalize old shape into `overrides`).

**NY PM:** the data carries it distinctly from New York. Recommend exposing it as an
optional 6th card *only* if the user wants it; Phase 1's resolver already treats NY PM
as a non-row cohort (never masked), so adding a card is additive and safe. **Confirm
intent** (own card vs folded into New York).

---

## 6. Phase 1 matrix — replace, hide, or evolve?

**Evolve, don't replace.** The Phase 1 enable matrix is a strict subset of Session
Cards (enable/disable per cohort). Concretely:

- **Keep** `data/sessionProfiles.js` as the resolver foundation. Generalize
  `applySessionProfiles` from *mask-only* to *mask + per-cohort universe select*
  (it already returns the TradeUniverse contract and is byte-identical when inactive).
- **Keep** the persisted store slice; widen its schema from `cells` to
  `session_cards` (with a back-compat normalizer that reads the old `cells`).
- **Demote** the matrix UI (`SessionProfileMatrix.jsx`) to a **compact overview /
  summary** (a glanceable 5×4 status grid) and make **Session Cards the primary
  editing surface**. The matrix stays useful as the "see everything at once" view;
  cards are where you configure. This satisfies AGENTS "Existing Explorer Protection"
  (additive; nothing removed).

So: evolve the data model + resolver, retain the matrix as a secondary view, add cards
as the main UI.

---

## 7. Simplest architecture that avoids slowing backtests

The whole feature stays on the **"detect once → simulate the exported grid → resolve
in the frontend"** model. Session Cards are a **per-cohort resolution layer**, never a
generator:

```
For each trade in the active run's universe:
  cohort  = (canonicalSession, structure_direction)          ← already on the row
  profile = override[cohort] ?? card.default ?? global_default  ← O(1) precedence
  if profile.disabled        → drop (MASK)
  else select the trade's row from the entry_model_key universe named by
       profile.entry_profile, then the BE cell named by profile.be_profile
       (SELECT; REPLAY only where a cell is missing)
  stamp attribution, accumulate
```

One O(n) pass with O(1) lookups, partitioned by cohort — same complexity class as
today's global resolver. The only "expensive" operations are REPLAY (bounded, opt-in,
labelled) and any **backend** generation of missing variants (explicit user action).

**Caching/indexing:** pre-bucket the universe into `Map<cohortKey, Trade[]>` once per
run; memoize the resolved result on `(runId, baseUniverseKey, cardsHash)`; source
variant availability from a **manifest** (per the protection-matrix audit) so the card
can show "selectable / missing / replay" per setting declaratively.

---

## 8. Performance risk analysis (esp. cube-size multipliers)

- **R-1 — Session Cards do NOT multiply runs or the cube.** They select from one
  run's existing export. The cube's breadth is governed by *which entry/BE variants
  you export*, which is the existing Strategy Builder decision — unchanged by cards.
- **R-2 — Indirect export-breadth pressure (the real risk).** To satisfy many cards
  referencing many distinct variants, users will be tempted to export a *wider* grid
  (more `entry_model × threshold × arm × BE` cells) in one run. That grows one run's
  output and BE-matrix passes, not the run count. Mitigate with the matrix audit's
  levers (one-walk-all-arms, lazy cell generation, dedupe by config hash) and by
  showing per-card "variants referenced vs available."
- **R-3 — Don't implement cards as N backtests.** If a future "run each session card"
  feature spawns a backtest per card, the single-pass property is lost. Keep
  resolution frontend-side; cards configure selection, not jobs.
- **R-4 — REPLAY honesty.** Stop-buffer / RR-via-replay / missing-BE results are
  research-grade (candle resolution, no spread/slippage). Must be labelled estimates,
  exactly like BE REPLAY today.
- **R-5 — Position-conflict correctness.** Selecting *different entry universes per
  cohort* and unioning them is not identical to a single simulation where cohorts
  interact for `one_per_direction` / `allow_multi_position` conflict resolution.
  Post-hoc union is an approximation for conflict-sensitive variants — document it;
  authoritative conflict-sensitive numbers need a real run.
- **R-6 — Recompute scope.** Mixing universes per cohort means stats + baseline must
  recompute; memoize on `cardsHash` to avoid churn (mirror `previewLens`).
- **R-7 — Config complexity, not CPU.** 5–6 sessions × 5 cohorts × ~8 settings is a
  large surface; the blow-up is UX, addressed in §9.

---

## 9. UI structure — Session Cards without overwhelming Strategy Builder

- **Dedicated surface, not crammed into existing panels.** Add a **"Session Strategy"
  tab/section** (or a route) rather than stacking cards inside the current Filters/Entry
  panels. The global Strategy Builder controls remain the **global default** the cards
  inherit from.
- **One collapsible card per session.** Collapsed state shows only: enable toggle,
  a one-line summary ("TE 25 · C2 · BE 1R wick"), override count, and a verdict/health
  chip. Expanding reveals the editor.
- **Inside each card:** a **"Default session settings"** sub-panel first (entry model,
  TE threshold, delay/arm, penetration, BE, stop buffer, RR), then **four collapsible
  override rows** — BOS Long / BOS Short / CHoCH Long / CHoCH Short — each defaulting
  to **"Inherit session default."** Only show an override row's controls when the user
  opts in (progressive disclosure).
- **Reuse the existing builder field components** (NeonSelect/Segment/threshold
  chips/BE controls) so cards are not a parallel UI to maintain.
- **Resolvability cues.** Each control is badged: live-resolvable (SELECT/MASK),
  "estimate" (REPLAY), or "requires a run" (RERUN/NEW-AXIS). Settings that need a
  backend variant the active run lacks render with a clear "not in this run · generate"
  state instead of silently doing nothing.
- **Keep the Phase 1 matrix** as a compact "all sessions at a glance" overview at the
  top of the section (read-only or quick-toggle), linking into each card.

---

## 10. Recommended phased implementation (2A / 2B / 2C)

- **Phase 2A — Frontend-only Session Cards (no backend).**
  1. Evolve the store slice + `sessionProfiles.js` from `cells` (mask) to
     `session_cards` (`session → default → cohort overrides`) with a back-compat
     normalizer (Phase 1 configs keep working).
  2. Generalize the resolver from *mask* to *mask + per-cohort universe SELECT*
     (entry model / TE threshold / delay-arm / penetration) and per-cohort **BE cell
     SELECT** (REPLAY fallback, labelled).
  3. Build the Session Card UI shell (collapsible cards, default + 4 override rows,
     reusing builder controls); demote the matrix to a compact overview.
  4. Backend-dependent settings (buffers, protection, RR) render as **read-only
     "requires a run / not in this export"** placeholders.
  5. Validation: byte-identical when disabled; per-cohort SELECT picks the right
     universe; missing-variant degrades gracefully; precedence (override→default→global)
     correct; no new runs.

- **Phase 2B — Backend export axes (still single-pass, one run per config).**
  1. Multi-target **RR axis** (`exit_r_by_target`, one walk → all RR targets) → per-card
     RR target becomes a lookup (RR only).
  2. Protection-matrix **manifest** + completeness so per-card BE/protection
     availability is declarative and exact-vs-replay is explicit.
  3. Optional **stop-buffer** as a small export axis (or keep REPLAY, labelled).
  4. Card controls flip from "requires a run" to live SELECT as axes land.

- **Phase 2C — Full per-session entry mechanics & protection (heaviest).**
  1. **Entry buffer / OB depth** per session: either a new pre-computed buffer export
     axis or accept a dedicated run; gate behind explicit generation.
  2. **TE protection** (cancel-on-retrace / FFT) per session via export variants or
     dedicated runs.
  3. Polish: card verdicts, Original→Carded **Difference** analytics (mirrors D-011
     Selective-BE framing), attribution export
     (`active_session_card`, `resolved_entry_model`, `be_profile`, `target_profile`).

Phase 2A ships real per-session entry-model + BE differentiation with **zero backend
work**, proving the card model end-to-end on existing runs; 2B/2C add exactness and the
backend-only settings.

---

## 11. Blockers & assumptions

- **B-1 — Export breadth precondition.** Per-cohort SELECT only works if the run
  exported the referenced variants. Cards must surface availability and never fake
  missing cells. (Not a blocker for 2A — degrade gracefully.)
- **B-2 — Backtester repo not mounted.** Buffer/protection/target axis claims rest on
  prior audit docs; verify against `Lux-OB-Backtester` before any backend phase.
- **B-3 — Position-conflict approximation (R-5).** Cross-cohort union ≠ true single sim
  for conflict-sensitive position modes; authoritative numbers need a run.
- **B-4 — REPLAY = estimate** (stop buffer, RR-via-replay, missing BE). Label clearly.
- **A-1 — NY PM card.** Assumed optional 6th card; confirm own-card vs fold-into-NY.
- **A-2 — Named profiles.** Assumed cards reference named entry/be/target profiles
  (terser, single edit point); confirm vs fully-inline per-cohort config.
- **A-3 — RR-only targets.** Per directive, no time-horizon targets anywhere in 2A–2C.

---

*End of SESSION-STRATEGY-CARDS-ARCHITECTURE-AUDIT-1 — audit only; no files changed besides this document.*
