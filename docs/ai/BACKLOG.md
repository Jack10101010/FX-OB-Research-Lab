# BACKLOG.md — prioritized, not yet scheduled

Groomed by ChatGPT. Priority: P1 (next up) · P2 (soon) · P3 (later).

> **BACKLOG vs ROADMAP:** this is the **unscheduled queue**. When an item is committed to a
> sequence it moves to `ROADMAP.md` (use `/promote`); not-yet-ready thoughts live in
> `IDEA_CAPTURE.md`. Don't list the same item as "active" in both backlog and roadmap.

*Last updated: 2026-06-12.*

## P1

> *(DONE / removed from queue — **Distance-at-arm importer mapping + breakdown**: shipped
> `449dc58` (D-014). `importer.js` maps `price_distance_from_ob_at_arm_pips`; RunDetail renders the
> signed distance breakdown (occupied=0 / edge / 2–5 / 5–10 / 10+ pips, TE-only gated). This **enables
> in-app F-004 validation**; F-004 remains **provisional** until confirmed on a run. Frontend
> consumption only — no backend work.)*

> *(DONE / removed from queue — **Confirmed false losers**: backend export shipped (`post_stop_mfe_r`,
> `post_stop_reached_original_tp`, `post_stop_bars_to_1r`, `post_stop_lookahead_bars`, `post_stop_model`),
> importer maps them, and the panel is **live end-to-end** (Failures Lab Overview: "6 confirmed of 32
> losses · model fixed_horizon · horizon 50"). It was NOT blocked. Remaining work is research
> interpretation, not export/import — see PROJECT_STATUS. Research Signals engine + Confidence — committed `b3a200e`.)*

> *(Shipped, removed from queue: Research Signals engine + Confidence layer — committed
> `b3a200e`; was stale-listed here as "active next build".)*

## P2

- **Phase 14 Wave 2 — residual terminology sweep** *(Owner: Claude · follows D-010 / Wave 1
  commit `e9d03aa`)* — **mostly done.** Six page files swept and committed (ScenarioSelector "Variant"→
  Position Mode, ProtectionLab "selected Result View"→View, StrategyBuilder, RunImpactSummary, NewsLab
  "Match Active Run"→Match Run, StrategyMap "Variant"→Position Mode). **Remaining residual:** the
  `BreakevenTab.jsx` "Result View" cluster strings (ride with the Protection-BE commit), plus a few
  comment-only references. Display-only; no identifier or persisted-key changes (per D-010 scope).
  Deferred to Wave 3 (do not touch here): Scenario/Baseline strings, "Run Preview" / Master Controls
  labels, model-grid "Variant".

- **Distance & Occupation-Depth Research** *(Priority: Medium · Owner: Codex (backend export +
  importer) → Claude (classification + UI) · likely its OWN workstream once unblocked)* — research
  family that may explain **why** the Vacant edge exists. **Key design insight:** vacancy distance
  and occupation depth are **one signed metric** — the price's offset from the OB **entry-side edge
  at arm** (**+ = vacant/outside, − = occupied/inside, 0 = on edge**). The existing
  `ob_occupied_at_arm` is just its **sign**; this is the **magnitude**.
  - **Core field EXPORTED + CONSUMED** — `price_distance_from_ob_at_arm_pips` is a real column in the
    backtester CSVs and is now mapped + surfaced as the flat distance breakdown (`449dc58`, D-014). The
    **open** work here is the deeper **signed `distance_band` dimension** (below), not the basic
    breakdown. Still pending export: the optional `price_distance_from_ob_at_arm_pct` (% of OB width).
  - **Final export spec (recommended):** `price_distance_from_ob_at_arm_pips` (signed, entry-edge ref ·
    **exported**) **+** `price_distance_from_ob_at_arm_pct` (signed, % of OB width · **pending**).
    Everything else — absolute, vacancy distance, occupation depth — is **derived in-frontend**.
  - **Architecture:** a new **orthogonal `distance_band` dimension** (NOT folded into `fill_state`),
    derived like `deriveFillState`, with **signed, symmetric, config-driven bands** spanning
    occupied→edge→vacant. Make the **Edge Zone (|offset| < ~2 pips) an explicit band** — hypothesis:
    the danger is *edge-proximity regardless of side*, generalizing **F-004**. Crosses freely with
    fill-state × session × entry-model × AAE; plugs into **Research Signals** as another candidate
    dimension (zero engine change) → auto "Edge-Zone danger" flag.
  - **Home:** Classification Tab (Distance/Occupation breakdown, gated on availability); Entries Lab
    for deep entry-mechanics + the FFT-displacement family later; dedicated surface only if it grows.
  - **Validate** against F-004; supersedes the old "Distance breakdown section" item.
- **Occupation-Depth angle** *(same data dependency as above)* — the **negative side** of the signed
  arm-offset: does *deeper* occupation make the (weak ~+0.08R) Occupied cohort better or worse, and
  does "barely occupied" ≈ "barely vacant" (the Edge-Zone straddle)? Free once the signed field
  exists — it's the same `distance_band` dimension viewed on the occupied side.
- **`sumR2` in accumulators** — enables true effect-SE confidence (upgrades the heuristic).
- **TE variant naming cleanup** — consistent naming for TE Same/Next/D2/D3 across UI + glossary.
- **Confirm "Outside" session availability** — verify backend emits it, or derive from fill hour
  (reuse SessionLab `SESSION_DEFINITIONS`).
- **UI Explainability Pass** *(Priority: Medium · Owner: Claude)* — audit all major screens and add
  missing tooltips, descriptions, and plain-English explanations for: metrics · table headers ·
  signals · scores · badges · filters · strategy settings · technical terminology. Follow the
  **Tooltip & Explainability Philosophy** and **Tooltip Visual Style** in `CLAUDE.md` (one shared
  dark tooltip style — improve the existing `TermTip` primitive, don't fork per-component styles).
- **Terminology Consistency Pass** *(Priority: Medium · Owner: Claude)* — audit the whole app so the
  same concept is always referred to by the same name across label, tooltip, glossary entry, badge
  text, filter text, table header, and docs wording. Watch for: Triggered Edge vs TE vs Triggered
  Entry · Vacant vs OB Vacant vs Vacant At Arm · Occupied vs Occupied At Arm · Research Signals
  naming · Confidence terminology · Protection terminology · Promotion terminology · Session
  terminology · Failure terminology · Directional terminology.
  **Deliverables:** canonical term list · alias list · inconsistency report · recommended standard
  naming. **Goal:** a user should never wonder whether two different labels mean the same concept.

- **Research Cockpit — future phases** *(Owner: Claude · follows D-015; Phase 1 `b500e36` + V2.0A
  `fe71537` shipped)* — additive, read-only, restructure-safe. In order:
  - **V2.0B** — remaining single-run categories (Entry Model via `researchSignals` entry-model rows;
    Order Blocks via `buildObBreakdown`/penetration; Protection BE-opportunity + FFT-when-paired; TP
    *capture profile* via MFE raw-R, upper-bound framed only — never an "optimal TP" claim).
  - **V2.1 — Cluster Map** — a 2-D edge/danger matrix reusing `buildExplorer` (real lift) + curated
    pairs + progressive refine; summarised in the cockpit, full interaction in Failures Lab. **Not** an
    N-way matrix (overfit/sparse).
  - **V2.2 — Deep links + Save-Findings reuse** — `source.params` open the exact lab drawer/tab (work
    owned by each lab's stream); wire "Save" to the existing `addProjectFinding` with additive
    `source: "research_cockpit"`. Do not build a parallel save path or touch `/insights`.
  - **V3 (after BE-matrix parity)** — backend-dependent: true RR-sweep "optimal TP" from `SWEEP_*`;
    BE-matrix-cube cards once the new export lands; cross-run insight stability + history (persistence).

## P3

- **Model family comparison** — TE delays vs penetration vs baseline, side by side.
- **Save findings / research library** — persist named findings, revisit/compare over runs.
- **Confidence column in breakdown tables** (Phase 2b) — needs a re-grid.
- **Click-a-signal-card-to-filter** the ledger/sections.
- **Low-n indicator** on noisy breakdown rows.

## Master Controls

> From Phase 7A live browser QA (2026-06-07, run `imported_1780733962068`). The cost-rescore
> feature PASSed; these are the open issues it surfaced. Owner: Claude (UI) / Codex (data).

- **(RESOLVED 2026-06-07) Sidecar preview import "hang"** — diagnosed via timing logs as a
  **self-cancelling import effect**, not a perf issue (total import ~117 ms: fetch ~24 / ingest
  ~85). The effect was keyed on `preview.status`; its `completed → importing` write re-ran the
  effect and tripped the old `cancelled` cleanup before the async import resolved, skipping the
  `status:"done"` transition. Fixed in `MasterControlsContext.jsx` with a job-id ref guard
  (`importJobRef`). Live QA passed (preview reaches "Preview ready"; Results + compare render;
  Save As Run + Clear work). Fix is implemented, commit pending.
- **(P2) Investigate cost-rescore Active baseline mismatch** *(still open)* — the panel's Active column
  (~+9.8R / 33.3% / 35 trades) ≠ the page Trade Sanity (~+8.44R / 38%); likely a variant/basis
  mismatch (`extractPreviewMetrics` uses `primaryVariant` + raw R). Internally consistent, but
  reconcile so the panel's "Active" matches the rest of the run view.
- **(P3) Decide whether full-backtest-tier (T3) fields stay read-only in Master Controls** —
  symbol / detection tf / dates can't be edited from the drawer, so the "Run Full Backtest"
  affordance is unreachable there. Likely acceptable; confirm intent.

## Notes

- Anything UI/UX/research → Claude. Anything data/importer/test/refactor → Codex.
- Keep each item shippable in a single scoped commit where possible.
