# RUN INSIGHTS / RESEARCH COCKPIT — DESIGN AUDIT 1

**MODE:** AUDIT ONLY — no code changes, no commits, no backend, no replay/simulation work.
**DATE:** 2026-06-13
**SCOPE:** Design a high-level page that sits *above* existing labs and reuses their already-computed analytics. Read-only consumer. No new metrics, no backend restructure dependency.

---

## 0. Key finding before answering: most of this already half-exists

This is not a greenfield design. The audit of the live tree shows three pre-existing pillars the cockpit must *reuse*, not reinvent:

| Pillar | Where it lives | What it already does |
|---|---|---|
| **Per-run insight engine (text)** | `RunDetail.jsx` `autoInsights` useMemo (≈ lines 934–991) | Emits up to 3 plain-text insight strings (full-stop concentration, top win bucket, payoff, directional dominance). Documented as "scope 0" in `RI-1_RUN_WORKSPACE_INSIGHTS_AUDIT.md`. |
| **Signal ranking engine** | `data/researchSignals.js` `buildResearchSignals()` | Mature pure engine: ranks positive edges / negative risks by **effect-size × confidence**, with Wilson intervals, sample saturation, parent/child dedup, `Very Low→High` confidence levels. This is the canonical "don't overclaim" machinery — the cockpit should borrow its scoring, not duplicate it. |
| **Findings / Save-Finding workflow** | `data/store.js` `addProjectFinding()`, `data/projectWorkflow.js` (`buildResearchFindingPayload`, `classifyFindingSource`, `resolveRunReference`, `buildRunDelta`), `components/lab/ResearchStrip.jsx` (COCKPIT-1: NextStep · WhatChanged · SaveFinding · RecentFindings), `pages/Insights.jsx` (global findings aggregator at `/insights`). | Save Findings is **done and shipping.** The `/insights` route is already taken by the global findings list. |

There is also a prior audit, `RI-1_RUN_WORKSPACE_INSIGHTS_AUDIT.md` (2026-06-02), that designed an *in-strip* per-run insight engine (`runInsights.js` + `GeneratedInsightsCard`). **This new request is the page-level superset of RI-1** — same data sources, one level up. The cockpit should be positioned as RI-1's "Phase 2 surface," reusing its proposed `runInsights.js` helper rather than competing with it.

**Two hard constraints fall out of this immediately:**

1. The name **must not be "Insights"** — `/insights` already exists and means *saved findings across projects*. Reusing that word will confuse two different concepts.
2. **Save Findings is a dependency, not a sibling.** Build the cockpit to deep-link *into* the existing finding flow; do not build a parallel save path.

---

## 1. Recommended page name

**Recommend: `Research Cockpit`** (route `/cockpit`).

Reasoning against the candidates:

| Candidate | Verdict |
|---|---|
| Run Insights | **Avoid.** Collides conceptually with the existing `autoInsights`/RI-1 per-run insight strip *and* with the `/insights` findings page. Two "insights" surfaces will be read as the same thing. |
| Research Summary | Weak. "Summary" undersells it and overlaps the Overview page (`/`). |
| Decision Dashboard | Acceptable but generic; "dashboard" implies live KPIs, which invites scope creep toward metrics this page shouldn't own. |
| **Research Cockpit** | **Best fit.** The codebase already uses "cockpit" vocabulary (`ResearchStrip` is literally labelled *COCKPIT-1, "shared research-workflow cockpit"*). Naming continuity, distinct from Overview/Insights, signals "control surface above the labs." |
| Edge Overview | Second choice. Clean, but "Overview" is taken by `/` and "Edge" narrows it to positive edges, undercutting the loss-diagnostics half. |

Sidebar placement: top of the **Workspace** group, above Overview, or as its own first item. It is the highest-altitude read surface, so it belongs first.

---

## 2. Recommended sections

Keep it to **five** sections for MVP. The seven-section menu collapses naturally — "Loss Diagnostics" and "Management/Protection Verdicts" are both *What's Hurting* refinements, and "Next Best Questions" is a per-card field, not a section.

Recommended order (top = most decision-relevant):

1. **Executive Summary** — 2–4 sentence auto-generated readout + headline counts (net R, expectancy, PF, decided n, confidence floor). Plain restatement of existing run KPIs; no new computation.
2. **What's Working** — top positive cohorts/edges (from Research Signals + Loser Run-Up TP side).
3. **What's Hurting** — worst negative cohorts, highest loss-R pockets, strongest BE warnings, context sinkholes. This absorbs *Loss Diagnostics* and *Protection Verdicts* as card subtypes.
4. **Research Opportunities** — highest-lift loss cohorts, strongest filter candidates, unresolved Distance-at-Arm / Retest monetization threads. ("Investigate," not "validated.")
5. **Warnings / Caveats** — low-sample gates, single-direction-run flags, reference-mismatch flags, "this-run-only" banner. **Rendered first visually** even though listed last, so it frames everything else.

Defer **Next Best Questions** to a per-card field (`suggestedQuestion`) rather than a standalone section — it's more useful attached to the evidence than pooled.

---

## 3. Data sources — insight card → source map

Every source below is an **existing pure helper or computed memo.** No source requires new computation, backend, or replay. (Paths are `frontend/src/…`.)

| Surface (user's label) | Backing module / function | Cockpit card(s) it feeds |
|---|---|---|
| **Loss Triage** | `data/lossTriage.js` → `buildLossTriage()` (2×2 recovery × run-up axes; `TRIAGE_LOW_SAMPLE_N=15`) | What's Hurting — loss-type mix |
| **Context Sinkholes** | `data/lossTriage.js` → `buildContextSinkholes()` | What's Hurting — worst context pockets |
| **BE Verdict** | `data/lossTriage.js` → `buildBeVerdict()` (REFUTES naive global-BE) | Protection verdict card (in What's Hurting) |
| **Confirmed False Losers** | `components/lab/failures/shared/failuresAnalytics.js` (`FALSE_LOSER_CONFIRM_R`/`_CANDIDATE_R`); panel `failures/overview/ConfirmedFalseLosersPanel.jsx` | Opportunity — recoverable-loss pocket |
| **Loser Run-Up** | `data/loserRunUp.js` → `buildLoserRunUp()` (`R_REACH_THRESHOLDS`, stop-anchored `mfe_r`) | What's Working (TP side) + Hurting (give-back) |
| **Distance-at-Arm** | `data/distanceBreakdown.js` → `buildDistanceAtArmBreakdown()` (Classification tab) | Opportunity — unresolved vacancy thread |
| **Research Signals** | `data/researchSignals.js` → `buildResearchSignals()` (effect×confidence) | What's Working + What's Hurting (primary ranking engine) |
| **OB-Retest monetization** | `data/obRetest.js` → `deriveRetests()`, `summarizeRetestEvents()`; `components/lab/retest/useRetestData.js` | Opportunity — retest tradeability |
| **Session Lab** | `components/lab/session/analytics/*`, `SessionLabWorkspace.jsx` | Best/worst sessions, session×direction pockets |
| **Failure Explorer** | `components/lab/failures/shared/excursionAnalytics.js` → `buildExplorer()`, `buildFailureDrivers()`, `buildBucketDrilldown()`, `EXPLORER_LIFT_HIGHLIGHT=1.5` | Highest-lift loss cohorts; cohort drilldown deep-link |
| **What-Changed (reference run)** | `data/projectWorkflow.js` → `buildRunDelta()`, `resolveRunReference()` | Executive Summary delta line |

Sample-floor constants already shipping (the cockpit must inherit, not redefine): `LOW_SAMPLE_N=10` (OrderBlockLab), `TRIAGE_LOW_SAMPLE_N=15`, `SAMPLE_FLOOR=10` / `DRILL_SAMPLE_FLOOR=8` (excursion), `minDecidedForSignal=10` (research signals).

---

## 4. What should be ranked

All ranking reuses existing scorers — **the cockpit picks top-N, it does not compute new scores.**

| Ranking | Source of the score | Notes |
|---|---|---|
| Top positive cohorts / edges | `buildResearchSignals()` positive list (effect×confidence) | already capped at `maxPositive: 3` |
| Worst negative cohorts / risks | `buildResearchSignals()` negative list | `maxNegative: 3` |
| Highest-lift loss cohorts | `buildExplorer()` / `buildFailureDrivers()` lift, gate `EXPLORER_LIFT_HIGHLIGHT=1.5` | for Opportunities |
| Highest loss-R pockets | `buildContextSinkholes()` / `buildBucketDrilldown()` Σ-loss-R | dollar-weighted damage |
| Strongest BE warnings | `buildBeVerdict()` | must carry the "refuted global BE" caveat |
| Strongest filter candidates | `failures/discovery/FilterDiscovery` + `filterSimulator.js` | "candidate," never "apply" |
| Best / worst sessions | Session Lab analytics | |
| Best/worst session × direction pockets | `buildExplorer({dimA:'session', dimB:'direction'})` | already a supported 2-dim call |

Ranking rule: **sort by confidence-weighted effect, then suppress anything below the source module's own sample floor.** Never rank raw effect size alone — that's exactly what `researchSignals.js` was built to prevent.

---

## 5. What the page should NOT do yet

Explicit non-goals (all of these are real risks given the existing surfaces):

- **Do not auto-create validated findings.** It surfaces candidates; the human still clicks Save Finding. (Save flow already exists — see §8.)
- **Do not overclaim from one run.** Inherit the `lossTriage.js` framing verbatim: *"this-run-only; nothing here is a validated rule."* Post-stop MFE is a **peak/upper bound, not realized profit** — carry that wording.
- **Do not replace Research Signals.** It *consumes* `buildResearchSignals()`; the Classification-tab signal surface stays.
- **Do not replace Save Findings / the `/insights` page.** Deep-link into them.
- **Do not invent new metrics.** Zero new analytics math — only selection, ranking, and templating over existing outputs.
- **Do not depend on the backend restructure.** No fields that only exist after the BE exact-replay / candle-data work lands (see §10).
- **No replay/simulation, no exporter changes, no `backend/` touches.**

---

## 6. MVP

Smallest useful version = **one page, 6–8 static cards, read-only, no persistence.**

Card descriptor (matches RI-1 §5 shape so `runInsights.js` can be the shared producer):

```
{
  id, category,            // 'working' | 'hurting' | 'opportunity' | 'warning'
  headline,                // "Short trades bleeding −3.1R"
  evidence,                // "−3.1R net over 16 decided · WR 31%"
  severity,                // tone + magnitude, or 'opportunity'
  confidence,              // reuse researchSignals levels: Very Low→High
  source: { label, route, params },   // deep-link target (see §7)
  caveat,                  // "this-run-only; peak not path"
  suggestedQuestion        // "Does the short leak persist in London only?"
}
```

Recommended 6-card MVP set (each maps to one existing producer, ordered warning → hurting → working → opportunity):

1. **Low-sample / single-direction gate** (warning) — `runReference` + decided-n; renders first.
2. **Top negative leak** (hurting) — `buildResearchSignals()` worst risk.
3. **Highest loss-R sinkhole** (hurting) — `buildContextSinkholes()`.
4. **BE verdict** (hurting/verdict) — `buildBeVerdict()`, carrying the refutation caveat.
5. **Top positive edge** (working) — `buildResearchSignals()` best edge.
6. **Highest-lift loss cohort to investigate** (opportunity) — `buildExplorer()`/`buildFailureDrivers()`.

Optional cards 7–8 if cheap: best/worst session, Confirmed False Losers pocket.

---

## 7. How source links should work

Use **route + query params**, not bespoke modal plumbing, so the cockpit stays a thin consumer and doesn't couple to lab internals.

Each card's `source` carries `{ route, params }`. Clicking navigates to the owning lab and the lab opens itself to that cohort/tab via URL/query params (or a lightweight nav-state object the lab already understands).

| Card | Target |
|---|---|
| "Outside Short sinkhole" | `/failures-lab` → cohort drilldown drawer (`FailureDrilldown`), prefiltered to the cohort |
| "Global BE hurts" | `/failures-lab` Loss Triage / BE Verdict panel (or `/protection-lab` BreakevenTab) |
| "Distance-at-arm unresolved" | `/runs/:id` → Classification tab, Distance-at-Arm breakdown |
| "OB-Retest monetization" | `/order-block-lab` → Retest Lab tab (`tabRetestLab`) |
| "Top edge / risk" | `/runs/:id` Classification tab → Research Signals |
| "Session pocket" | `/session-lab` → session×direction view |

**Implementation note for Phase 2:** several of these labs currently open their drawers via internal state, not URL params (e.g. Failures cohort drawer, OB Retest tab). Deep-linking will need each target lab to accept an *opening* param. Keep that work **inside each lab's own workstream** — the cockpit only emits the intent; it must not reach into lab internals. For MVP (Phase 1), links can navigate to the lab page without auto-opening the exact drawer (graceful degradation).

---

## 8. Data model

**Recommend: a single pure `buildRunInsights(inputs)` aggregator that calls existing per-lab pure helpers and emits card descriptors.** Not separate new adapters per lab — the adapters already exist as the lab helpers in §3.

```
buildRunInsights({
  trades, obStats, runReference, deltaRows,   // already on RunDetail
  // results of existing pure helpers, passed in (no recompute):
  researchSignals, lossTriage, beVerdict, contextSinkholes,
  loserRunUp, distanceBreakdown, failureDrivers, sessionStats, retestSummary,
}) -> InsightCard[]
```

Properties:
- **Pure, React-free, node-testable** — mirror `researchSignals.js` / `lossTriage.js`. Ships with a `__validation__/runInsights.validate.mjs` harness like its siblings.
- **Host page computes nothing new.** The cockpit page memo-calls the same helpers RunDetail already calls and threads their outputs in (exactly how `ResearchStrip` receives `nextStep`/`deltaRows` today).
- **Card descriptors,** not rendered JSX, so the same producer feeds both the page and (later) RI-1's in-strip `GeneratedInsightsCard`.
- **Confidence comes from `researchSignals.js`,** reused — do not define a second confidence scale.

This is the lowest-conflict shape: it is a *selector/ranker over existing outputs*, touching no analytics math and no backend.

---

## 9. Implementation phases

Aligns with the user's three-phase sketch, refined against what already exists:

**Phase 1 — Static cockpit (no persistence, no deep-open).**
New: `pages/ResearchCockpit.jsx`, `data/runInsights.js` (pure + validation harness), one route `/cockpit`, one Sidebar entry. Cards render from existing helper outputs. Links navigate to lab pages (no auto-drawer). No store changes. This is fully isolated from backend and from every lab's internals → near-zero conflict surface.

**Phase 2 — Deep links + reuse Save Findings.**
Add `source.params` deep-open support *in each target lab's own workstream* (cockpit just emits intent). Wire each card's "Save" to the **existing** `addProjectFinding()` with `source: "research_cockpit"` (add that one value to `FINDING_SOURCE_FILTERS` / `classifyFindingSource` — the only store-side change, and it's additive). Add a dedup guard before save (RI-1 §9g). No "Promote to Hypothesis" rebuild — route to the existing Hypothesis Lab.

**Phase 3 — Cross-run stability & history.**
Insight stability across runs, insight history, automated ranking trends. This is the only phase that *might* want new persistence; defer until Phase 1/2 prove the card set is right. Explicitly out of scope until the candle-data/backtest restructure has settled (so cross-run keys are stable).

---

## 10. Safest path vs the candle-data / backtest restructure

The in-flight restructure is the **BE exact-replay / candle-data / protection-matrix backend work** (`BE-BACKEND-EXACT-REPLAY-*`, `BE-MATRIX-V2-*`, `PROTECTION-MATRIX-GENERATOR-*`, `OB-RETEST-SURVIVAL-*`). It changes how trades/candles/BE outcomes are *produced and exported*, not how the frontend *reads already-loaded run analytics*.

Safe-path rules:

1. **Consume only post-normalization frontend memos/helpers** (`resultsBasis.js`, `tradeClassification.js`, the §3 modules) — never raw export fields, the exporter, or `backend/`. Those helpers already absorb export-shape changes, so the cockpit is insulated.
2. **No dependency on fields that only exist after exact-replay lands** (e.g. new BE-matrix per-arm fields). If a card needs a field that's currently null on older runs, gate it with the module's own availability check (e.g. Distance-at-Arm already has an "unknown/unavailable" bucket — reuse that pattern).
3. **Phase 1 is pure frontend, additive files only** (one page, one pure module, one route, one nav line). It touches zero shared lab files and zero backend files → it cannot conflict with the restructure or any active lab workstream.
4. **Register a workstream entry** in `WORKSTREAMS.md` per the repo's startup template before any code, declaring expected files (`pages/ResearchCockpit.jsx`, `data/runInsights.js`, `data/__validation__/runInsights.validate.mjs`, `App.js` route line, `Sidebar.jsx` nav line) and "do not touch: `backend/`, exporters, BE-matrix, any lab internals."

---

## Output summary

- **Page name:** **Research Cockpit** (`/cockpit`). Avoid "Insights" (route + concept already taken). Edge Overview is the fallback.
- **Sections (5):** Executive Summary · What's Working · What's Hurting (absorbs Loss Diagnostics + Protection Verdicts) · Research Opportunities · Warnings/Caveats (render first). "Next Best Questions" → per-card field, not a section.
- **Data sources:** all existing pure helpers — `researchSignals`, `lossTriage` (triage/sinkholes/BE), `loserRunUp`, `distanceBreakdown`, `obRetest`, failures `excursionAnalytics`, session analytics, `projectWorkflow` deltas. **Zero new computation, zero backend.**
- **Top MVP cards (6):** low-sample/single-direction gate · top negative leak · highest loss-R sinkhole · BE verdict · top positive edge · highest-lift loss cohort to investigate.
- **Anti-overclaim guardrails:** inherit every existing sample floor; reuse `researchSignals` confidence (Very Low→High); carry "this-run-only / peak-not-path / global-BE-refuted" caveats verbatim; never rank raw effect; surface candidates only — human saves.
- **Phases:** (1) static isolated cockpit, (2) deep-links + reuse existing Save Findings, (3) cross-run stability/history (defer past restructure).
- **Build before or after Save Findings?** **After / on top of it.** Save Findings already ships (`addProjectFinding`, ResearchStrip, `/insights`). The cockpit is a *consumer* of that flow — Phase 2 adds one additive `source` value, nothing more. Do not build a parallel save path.
- **Conflict safety:** Phase 1 is additive-only frontend files reading post-normalization helpers → cannot collide with the candle-data/BE-matrix restructure or active lab workstreams.

### Exact next implementation prompt (Phase 1 only — when ready to build)

> **COCKPIT-1 — Research Cockpit page, Phase 1 (static, read-only).**
> **Goal:** Add a page-level Research Cockpit that surfaces 6 ranked insight cards by reusing existing pure analytics. No backend, no replay, no new metrics, no persistence.
> **New files only:**
> - `frontend/src/data/runInsights.js` — pure `buildRunInsights(inputs)` → `InsightCard[]`, React-free, node-testable. Reuses `buildResearchSignals`, `buildLossTriage`, `buildBeVerdict`, `buildContextSinkholes`, `buildExplorer`/`buildFailureDrivers`, `buildRunDelta`/`resolveRunReference`. Applies a global low-sample gate first; ranks by confidence-weighted effect; caps at 8; orders warning → hurting → working → opportunity. Inherits each source module's own sample floor — defines no new threshold.
> - `frontend/src/data/__validation__/runInsights.validate.mjs` — harness mirroring `researchSignals.validate.mjs`.
> - `frontend/src/pages/ResearchCockpit.jsx` — memo-calls the same helpers RunDetail already calls, threads outputs into `buildRunInsights`, renders cards in 5 sections (Warnings first). Each card: headline · evidence · confidence chip · caveat · `<Link to={source.route}>` (navigate only, no auto-drawer) · suggested question.
> **Touch (additive lines only):** `App.js` (one `/cockpit` route), `components/lab/Sidebar.jsx` (one nav entry, top of Workspace group).
> **Do NOT:** modify any lab file, any analytics/data helper, the exporter, `backend/`, the store, or `/insights`; add persistence; auto-open lab drawers; use any LLM/async; define any new metric or threshold.
> **Before coding:** add a workstream entry to `WORKSTREAMS.md` per the startup template, declaring the files above and "do not touch: backend, exporters, BE-matrix, lab internals."

---

**STATUS: AUDIT COMPLETE — no code changed, no commits made.**
