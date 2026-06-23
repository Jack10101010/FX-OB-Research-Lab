# UI Explainability Audit — FX-OB Research Lab

**Mode:** AUDIT ONLY — no files changed, nothing implemented.
**Branch:** `codex-dev` · **Date:** 2026-06-08
**Scope:** `frontend/src` — pages, lab components, glossary/tooltip infrastructure.

---

## 0. Audit context verification (docs vs. repo)

Required reading completed: `AGENTS.md` (root typography rules), `docs/ai/AGENTS.md`,
`docs/ai/CURRENT_WORKSTREAM.md`, `docs/ai/PROJECT_STATUS.md`, `docs/ai/WORKSTREAMS.md`,
plus `docs/ai/GLOSSARY.md`. Verified against `git status` and `git log --oneline -20`.

**1. Current status.** Classification Tab V2 is shipped/committed. Phase 2 (Research
Signals engine + Confidence layer + UI) is shipped/committed. Working tree is dirty
(see item 6). Branch is up to date with `origin/codex-dev`.

**2. Current workstream.** Trade Classification → Classification Tab V2 → Phase 2
(Research Signals + Confidence). Lead: Claude (design/UX/frontend); Codex for data/test.

**3. Next recommended task (per docs).** Phase-2 polish: (optional) confidence chips on
Signal Cards; Phase 2b — add `sumR2` to accumulators for true effect-SE confidence
(replacing the WR-precision proxy). Distance breakdown remains blocked on the
`price_distance_from_ob_at_arm_pips` importer mapping (Codex).

**4. Detected drift between docs and repo.**
- `CURRENT_WORKSTREAM.md` / `PROJECT_STATUS.md` name `b3a200e` as the latest classification
  commit. Git shows **five newer commits** the docs never mention:
  `c779618`, `b6fdb28` (signals config hardening), `b681868` (C0–C3 label clarification),
  `85cd34f` (**Enabled Variant Comparison** section), `cd4f96e` / `de03eb5` (master-controls
  preview-import hang fix). The "Enabled Variant Comparison" section is live in
  `RunDetail.jsx` but absent from the memory docs.
- `CURRENT_WORKSTREAM.md` lists "engine + validation have uncommitted hardening edits" as
  remaining — those appear to have landed in `b6fdb28`, so that bullet is stale.
- The "Save As Run / promote" and "Instant Cost Rescore" master-controls milestones are in
  `WORKSTREAMS.md` but the rerun-tier / promotion vocabulary has no glossary coverage.

**5. Active parallel workstreams to be aware of.** Master Controls / Research Control Plane
(Phase 7A, owns `components/masterControls/*`), Session Lab (`pages/SessionLabV1/*`),
Entry / FFT / Paired Runs (`components/lab/entries/*`, `data/importer.js`), Strategy Map
(`pages/StrategyMap.jsx`), OB Retest (`data/obRetest.js`, `components/lab/retest/*`),
Ghost / Backend Research (`ghost_tracker*.py`). `pages/RunDetail.jsx` and
`data/tradeUniverse.js` are shared/frequently-dirty — stage deliberately.

**6. Uncommitted work that may affect planning.** Modified (unstaged):
`docs/ai/{BACKLOG,CLAUDE,CURRENT_WORKSTREAM,PROJECT_STATUS,ROADMAP}.md`,
`frontend/src/components/lab/TradeSanityStrip.jsx`,
`frontend/src/data/enabledVariantBreakdown.js` + its `__validation__` file,
`frontend/src/pages/SessionLabV1/data/sessionLabV1Adapter.js`. Plus many untracked
root-level `*-audit.md` / plan docs, `ghost_tracker*.py`, and `package*.json`. The dirty
`enabledVariantBreakdown.js` overlaps the new Enabled Variant Comparison section — relevant
if that section is touched. No commits made by this audit.

---

## Key structural finding (drives everything below)

The lab already has a **first-class glossary + tooltip system**:
`data/researchGlossary.js` (meaning), `components/lab/TermTip.jsx` (glossary-backed hover
tooltip + standalone ⓘ dot), and `components/lab/ConfidenceChip.jsx`. It is excellent —
definition + "why it matters" copy, graceful degradation, keyboard focus.

**It is wired into exactly one place.** `grep -rl TermTip` returns only `TermTip.jsx` and
`pages/RunDetail.jsx`; ConfidenceChip likewise. So the entire explainability investment
lives inside the Classification Performance panel of one page. Every other page — Order
Block Lab, Protection Lab, Entries Lab, Strategy Map, Comparison Lab, Session Lab,
Walk-Forward, Monte Carlo, Failures, Hypothesis Lab, Master Controls — renders dense
quant terminology with **no tooltips at all**.

The highest-leverage move is therefore not inventing new infrastructure — it is
**extending TermTip + a handful of new glossary keys to the rest of the app**, and closing
the remaining gaps inside Classification.

---

## 1. Top 20 highest-value tooltip additions

> Format per request — Page / Element / Problem / Recommended Tooltip / Priority.
> Recommended copy is illustrative (definition + why-it-matters), to live in
> `researchGlossary.js` so TermTip stays single-source.

### 1. FFT (abbreviation never expanded — anywhere)
- **Page:** Entries Lab, Strategy Map, Run Detail, Candle Chart overlay
- **Element:** "FFT Protection" panel title, "FFT cancels", "FFT-OFF run", chart `FFT:` label
  (`FftProtectionPanel.jsx`, `EntriesWorkspace.jsx`, `CandleChart.jsx:1235`, `ScenarioSelector.jsx`)
- **Problem:** `grep` confirms FFT is **never spelled out in code, `researchGlossary.js`, or
  `docs/ai/GLOSSARY.md`**. A new user (and the project's own glossary) cannot say what it means.
- **Recommended Tooltip:** *FFT — the move-away cancel filter. A triggered-edge order is
  cancelled if price runs past the OB edge by a set pip / OB-multiple distance before filling.
  Why it matters: it trades fill-rate for fewer fakeout entries — the core protection lever.*
- **Priority:** High

### 2. "Ghost" trade metrics
- **Page:** Entries Lab → FFT Protection
- **Element:** "Ghost outcome distribution", "Ghost tracked / wins / losses / unfilled / win
  rate / net R / accuracy", the `G` column (`title="Ghost agrees with OFF?"`) — `FftProtectionPanel.jsx`
- **Problem:** "Ghost" is unexplained jargon. User can't tell that a ghost is the *simulated*
  outcome of a trade FFT cancelled, nor how it differs from the paired FFT-OFF "authoritative" run.
- **Recommended Tooltip:** *Ghost — the hypothetical result of a trade FFT cancelled, simulated
  as if it had been allowed to run. Ghosts are estimates; the paired FFT-OFF run is the
  authoritative comparison. Why it matters: ghosts show whether FFT is cancelling winners or losers.*
- **Priority:** High

### 3. Results Basis / Lens (global control that rescales every number)
- **Page:** Global (Run Detail, Comparison, Session, etc.)
- **Element:** "Results Basis" toggle — "Raw R" vs "Current Equity" (`ResultsLensControl.jsx`,
  `data/resultsBasis.js`)
- **Problem:** Changing this silently re-expresses every metric on the page (R-multiples vs
  account currency). Nothing explains the modes or that the choice is global and sticky.
- **Recommended Tooltip:** *Results Basis — how every figure on the page is measured. "Raw R" =
  multiples of initial risk (account-independent). "Current Equity" = currency P&L compounded on
  your configured starting balance and risk %. Why it matters: it changes the scale of every
  number — compare like-for-like.*
- **Priority:** High

### 4. Bucket / summary table column headers (N · WR · Exp · PF · Net R · Contrib %)
- **Page:** Everywhere a canonical table renders (`CanonicalBucketTable.jsx`, schemas in
  `data/resultsBasis.js`, Comparison/Session/Protection tables)
- **Element:** Terse headers `N`, `WR`, `Exp`, `PF`, `Net R`, `Contribution`, `Contrib %`
- **Problem:** Glossary keys exist (`stat_n`, `stat_wr`, `stat_net_r`, `stat_avg_r`) but these
  tables don't use TermTip — only the Classification breakdown table does. Abbreviations are bare.
- **Recommended Tooltip:** Reuse existing `stat_*` keys; add `stat_pf` (Profit Factor = Σ wins ÷
  |Σ losses|; >1 is profitable) and `stat_exp` (Expectancy = Avg R). Wire TermTip into the shared
  table header renderer so every consumer inherits it.
- **Priority:** High

### 5. RR — risk:reward (ubiquitous, undefined)
- **Page:** ~17 files — Sweep Lab, Protection Lab, Strategy Map, Comparison, Run Detail, Runs,
  Walk-Forward, News Lab, Settings, Overview, Strategy Builder…
- **Element:** "RR", "Win Rate vs RR", "Trades vs RR", "RR Sweep Leaderboard", "RR × Stop Buffer"
- **Problem:** Risk:reward ratio is assumed knowledge and has **no glossary entry**. New users
  won't know whether "RR 2" means 1:2, the target multiple, or something else.
- **Recommended Tooltip:** *RR — reward-to-risk ratio: the take-profit distance expressed in
  multiples of the stop (1R). RR 2 = target is 2× the risk. Why it matters: RR and win rate
  jointly determine expectancy — a low win rate can still profit at high RR.*
- **Priority:** High (also a quick win — one key, many surfaces)

### 6. Robustness Scores · Sample Adequacy · Half-Split Consistency
- **Page:** Entries Lab / Robustness (`components/lab/entries/robustness/ConfidencePanel.jsx`)
- **Element:** Panel titles + cryptic action pills "N THRESHOLDS", "FIRST vs SECOND HALF"
- **Problem:** These are decision-driving statistical panels with zero plain-language framing.
  "Robustness Scores" gives a number with no stated scale or pass/fail meaning; "Sample
  Adequacy" and "Half-Split Consistency" assume the user knows the test.
- **Recommended Tooltip(s):** *Sample Adequacy — whether you have enough trades at each
  threshold for the stats to be trustworthy. Half-Split Consistency — does the edge hold when the
  history is split into first vs second half (out-of-sample sanity check)? Robustness Score —
  composite 0–100 of how stable the edge is across samples/splits.*
- **Priority:** High

### 7. Classification section headers (no tooltip on the headers themselves)
- **Page:** Run Detail → Classification Performance
- **Element:** `ClassSectionHeader` labels — "Research Signals", "Signal Cards", "Fill State
  Breakdown", "Session Breakdown", "Entry Model Breakdown", "Enabled Variant Comparison"
  (`RunDetail.jsx:2964–3046, 4829`)
- **Problem:** Row labels have TermTip, but the section headers don't — even though a
  `research_signals` glossary key already exists. "Enabled Variant Comparison" and "Signal Cards"
  have no key at all.
- **Recommended Tooltip:** Wrap each header in TermTip; add keys for `signal_cards`
  (*at-a-glance summary of each cohort's expectancy*) and `enabled_variant_comparison`
  (*all entry-model variants enabled in this bundle, compared head-to-head, independent of the
  selected scenario*).
- **Priority:** Medium

### 8. Research Signals row — unlabeled inline stat cluster
- **Page:** Run Detail → Classification → Research Signals
- **Element:** `+0.59R · n=23 · 65% · +13.5R` trailing each signal (`RunDetail.jsx:4894–4898`)
- **Problem:** Four numbers run together with one mid-dot separator and no labels; the leading
  value is "Effect" but is never named here. Only the cohort label is tooltipped.
- **Recommended Tooltip:** Add a TermTip on the stat block (or per-token) → *Effect (Avg R) ·
  trade count (n) · win rate · Net R.* Reuse `effect`, `stat_n`, `stat_wr`, `stat_net_r`.
- **Priority:** Medium

### 9. EP — Entry Penetration (25 / 50 / 75 / 100%)
- **Page:** Strategy Builder, Strategy Map, Entry model selectors
- **Element:** Entry-model variant labels referencing penetration %
- **Problem:** `GLOSSARY.md` defines "EP — Entry Penetration (limit placed N% into the OB)" but
  there is **no `researchGlossary.js` key** and no tooltip — so the in-app surface is silent.
- **Recommended Tooltip:** *EP — Entry Penetration: the limit is placed N% into the order block
  (25/50/75/100%). Deeper penetration = better price but lower fill odds. Why it matters: trades
  off fill-rate against entry quality.*
- **Priority:** Medium

### 10. Profit Factor outside Run Detail
- **Page:** Protection Lab, Comparison Lab, Session Lab, any "PF" column
- **Element:** "Profit Factor" / "PF"
- **Problem:** Run Detail explains PF via a rich KPI modal, but every *other* surface shows the
  raw number with no help. Inconsistent — users learn it in one place, lose it elsewhere.
- **Recommended Tooltip:** *Profit Factor — gross wins ÷ gross losses. 1.0 = breakeven; higher is
  better. Why it matters: a quick profitability ratio that's independent of trade count.*
- **Priority:** Medium

### 11. Entry Toxicity Map
- **Page:** Entries Lab / Model Analysis (`HeatmapPanels.jsx`, `ModelAnalysis.jsx`)
- **Element:** "Entry Toxicity Map (Losing Trades Only)"
- **Problem:** "Toxicity" is undefined metaphor. A user can't tell it maps where *losing* trades
  concentrate by time/condition, nor how to read the heat.
- **Recommended Tooltip:** *Entry Toxicity — concentration of losing trades by entry condition
  (e.g. weekday × hour). Hotter cells = more/larger losses entered there. Why it matters: surfaces
  conditions to avoid entering.*
- **Priority:** Medium

### 12. Archetype / DNA & Archetype Fingerprints
- **Page:** Failures Lab (`FailureDNA.jsx`, `ArchetypeRadarPanel.jsx`, `FailuresWorkspace.jsx`)
- **Element:** "DNA & Archetypes", "Archetype Fingerprints", "Dominant Archetype per Session"
- **Problem:** Heavy metaphor with no definition of what an archetype is, how trades are assigned
  to one, or what a "fingerprint" axis represents.
- **Recommended Tooltip:** *Archetype — a recurring failure pattern trades are clustered into
  (e.g. "stopped then reversed"). The fingerprint/radar shows how strongly a cohort matches each
  archetype. Why it matters: groups losses into fixable patterns instead of one-offs.*
- **Priority:** Medium

### 13. Pareto Frontier · Net R vs Drawdown
- **Page:** Comparison Lab, Model Analysis (`ParetoPanel.jsx`)
- **Element:** "Pareto Frontier", "Pareto Frontier · Net R vs Drawdown"
- **Problem:** Optimization concept assumed. User won't know the frontier = configs not beaten on
  both return and risk simultaneously.
- **Recommended Tooltip:** *Pareto Frontier — the set of configurations where you can't improve
  return without worsening drawdown (or vice-versa). Points on the line are the efficient choices.
  Why it matters: narrows many configs to the genuinely best risk/return trade-offs.*
- **Priority:** Medium

### 14. Wald-Wolfowitz Runs Test · Sequential Dependency
- **Page:** Streak Analysis (`StreakAnalysis.jsx`)
- **Element:** "Wald-Wolfowitz Runs Test", "Sequential Dependency"
- **Problem:** Named statistical test with no plain-language meaning or how to read the result.
- **Recommended Tooltip:** *Runs Test (Wald-Wolfowitz) — checks whether wins and losses cluster
  more than random chance would predict. Sequential Dependency — whether one trade's outcome
  predicts the next. Why it matters: real streakiness changes position-sizing and risk-of-ruin.*
- **Priority:** Medium

### 15. 95% CI (confidence interval) column
- **Page:** Bucket tables (`data/resultsBasis.js:422`, `CanonicalBucketTable.jsx`)
- **Element:** "95% CI" column
- **Problem:** Interval shown as a range with no explanation of what it bounds (win rate? avg R?)
  or how to read width.
- **Recommended Tooltip:** *95% CI — the range the true value is likely to fall in 95% of the
  time, given this sample. Wider = less certain. Why it matters: an edge whose CI crosses zero
  isn't reliably positive.*
- **Priority:** Medium

### 16. "Outside" session danger not surfaced outside Classification
- **Page:** Session Lab (`SessionLabWorkspace.jsx`, `SessionDrilldown.jsx`, `SessionCard.jsx`)
- **Element:** Session rows incl. "Outside"
- **Problem:** The Classification tab flags Outside as a danger cohort (glossary `session_outside`,
  ~0% WR / ~−1R), but Session Lab — the page literally about sessions — has no TermTip, so the
  warning context is lost where it matters most.
- **Recommended Tooltip:** Reuse `session_outside` and the other `session_*` keys via TermTip in
  Session Lab tables/cards.
- **Priority:** Medium

### 17. Master Controls — preview → run → promote workflow & rerun tiers
- **Page:** Master Controls drawer (`MasterControlsDrawer.jsx`)
- **Element:** "Save As Run" / "Compare & promote" ("Diff draft against live run, promote best
  config to project"), rerun-tier classification, "Instant Cost Rescore"
- **Problem:** The preview-vs-active-vs-promoted-run mental model is assumed. A new user won't know
  a "preview" is a throwaway draft, what gets promoted, or what a rerun "tier" means.
- **Recommended Tooltip:** *Preview — a draft run you can tweak without saving. Promote — save the
  preview as a permanent run in the project. Rerun tier — how much changed since the last run
  (cost-only rescore vs full re-backtest). Cost Rescore — re-prices the existing trades under new
  spread/commission without re-running the strategy.*
- **Priority:** Medium

### 18. Promotion Desk — decision states & "Fill %"
- **Page:** Order Block Lab → Promotion Desk (`PromotionDesk.jsx`)
- **Element:** Decision filter chips (approved / …), sort keys "Exp", "Fill %"
- **Problem:** The panel has a good intro paragraph (positive!), but the decision states and
  "Fill %" sort key aren't defined. Fill % especially is ambiguous (filled orders ÷ triggered?).
- **Recommended Tooltip:** *Fill % — share of triggered setups that actually filled. Decision
  states — your manual verdict (approved / rejected / watch) used to build the shortlist.*
- **Priority:** Low

### 19. "Tag" header + Signal Card subtext abbreviations
- **Page:** Run Detail → Classification
- **Element:** "Tag" column header (`RunDetail.jsx:4917`); Signal Card sub "X% WR · n=Y · +Zr"
  (`RunDetail.jsx:2982`)
- **Problem:** "Tag" is internal jargon for the classification label; the card subtext repeats
  WR/n abbreviations that are only tooltipped on the title.
- **Recommended Tooltip:** Rename header to "Cohort"/"Class" (or TermTip it); apply `stat_wr` /
  `stat_n` to the card subtext.
- **Priority:** Low

### 20. KPI "ⓘ" / modal discoverability
- **Page:** Run Detail KPI strip (`MetricChip.jsx`, modals at `RunDetail.jsx:3496+`)
- **Element:** The clickable KPI chips (Net, Win Rate, Trades, Expectancy, Profit Factor, Max
  Drawdown) each open a detailed breakdown modal.
- **Problem:** Excellent content, poor discoverability — the affordance is a 14px ⓘ at 50% opacity
  that only brightens on hover. Many users won't realise the deep-dive exists.
- **Recommended Tooltip/Fix:** Add a hover tooltip "Click for breakdown" on the ⓘ, and replicate
  this modal pattern (rather than bare numbers) on the secondary KPI strips at
  `RunDetail.jsx:4564, 4693`.
- **Priority:** Medium

---

## 2. Quick wins (low effort, high coverage)

These reuse the *existing* TermTip + glossary and need little or no new copy:

1. **Wire TermTip into the shared bucket/summary table header renderer** (`CanonicalBucketTable.jsx`
   / `resultsBasis.js` schemas). One change → N/WR/Net R/Avg R inherit tooltips on every page that
   uses canonical tables. (Findings 4, 10, 15.)
2. **Add one `rr` glossary key** → instantly covers ~17 files (finding 5).
3. **TermTip the 6 Classification section headers**; add `signal_cards` + `enabled_variant_comparison`
   keys (finding 7). Pure additive, inside an existing TooltipProvider.
4. **Reuse `session_*` keys in Session Lab** tables/cards (finding 16). No new copy needed.
5. **Add `stat_pf` and `stat_exp` keys** and point existing "PF"/"Exp" columns at them (finding 10).
6. **Add a "Click for breakdown" tooltip** to the KPI ⓘ dot in `MetricChip.jsx` (finding 20) — one
   `title`/TermTip, big discoverability gain.
7. **`fft` and `ep` glossary keys** — both are already defined in `docs/ai/GLOSSARY.md`; just port
   the copy into `researchGlossary.js` and wrap the labels (findings 1, 9).

Each of the above is a small, scoped edit consistent with the typography rules in root `AGENTS.md`
(use `font-ui`, no `tracking-widest`, no `font-mono`).

## 3. Premium UX opportunities (higher effort, signature polish)

1. **"Explain this panel" affordance.** Many statistical panels (Robustness, Pareto, Runs Test,
   Archetypes, Toxicity) need more than a one-line tooltip. Add a small ⓘ in each `NeonPanel`
   header that opens a short "how to read this" popover — extend the `TermTip` content shape to
   support an optional `howToRead` paragraph + a tiny annotated example.
2. **Replicate the KPI-modal pattern as the house style for any headline number.** The Run Detail
   KPI modals are the best explainer in the app; promote that into a reusable `<MetricExplainer>`
   so secondary KPI strips, Protection, and Comparison get the same drill-down instead of bare
   chips (findings 10, 20).
3. **First-run guided overlay / glossary index page.** A dismissible coachmark tour for a new
   user's first Run Detail visit, plus a single "Glossary" route rendering `researchGlossary.js`
   so users can self-serve every term in one place (today there is no in-app glossary surface).
4. **Severity/confidence colour legend.** Danger/emphasis framing (e.g. red "Outside" row,
   ConfidenceChip tones) is meaningful but unlabeled — add a compact legend so colour isn't the
   only channel carrying meaning (also an accessibility win).
5. **Inline "what changed" on Master Controls promote/rescore.** A diff-style summary popover when
   promoting a preview or rescoring (finding 17), so the preview→run mental model is taught in
   context rather than assumed.

## 4. Recommended implementation order

1. **Glossary keys first (data-only, zero-risk):** add `rr`, `fft`, `ghost`, `ep`, `stat_pf`,
   `stat_exp`, `signal_cards`, `enabled_variant_comparison`, `results_basis`, `ci_95`,
   `robustness`, `sample_adequacy`, `half_split` to `researchGlossary.js`. Validate with the
   existing `researchGlossary.validate.mjs`.
2. **Close Classification gaps (in-place, lowest risk):** section headers, Research Signals stat
   cluster, Signal Card subtext, "Tag" header (findings 7, 8, 19). Already inside a TooltipProvider.
3. **Shared table headers:** wire TermTip into `CanonicalBucketTable` / canonical schema renderer →
   broad coverage in one edit (findings 4, 5, 10, 15).
4. **Global controls:** Results Basis tooltip + KPI ⓘ discoverability (findings 3, 20).
5. **Per-page labels:** Session Lab session keys, Entry/FFT/Ghost, EP, Protection PF (findings
   1, 2, 9, 11, 16).
6. **Statistical panels:** Robustness/Sample Adequacy/Half-Split, Pareto, Runs Test, Archetypes,
   Toxicity (findings 6, 12, 13, 14) — these are the natural home for the premium "how to read this"
   popover from §3.
7. **Master Controls workflow explainers** (finding 17) — coordinate with that workstream; it owns
   `components/masterControls/*`.

Rationale: order maximises coverage per unit risk — data-only first, then the page already proven
safe (Classification), then shared renderers (multiplier effect), then page-by-page. Each step is a
scoped commit; never `git add .` (per `docs/ai/AGENTS.md`), and respect root `AGENTS.md` typography
rules + the validation greps before finishing any chip/label work.

## 5. Estimated impact on usability

- **Coverage today:** glossary tooltips reach ~1 of ~25 pages (Classification tab only). The
  infrastructure is built but ~96% unused.
- **After quick wins (§2):** a handful of data-only keys + the shared-table-header wiring would lift
  the most-used numeric tables (N/WR/Net R/Avg R/PF/RR/CI) across the majority of analytics pages —
  the single biggest jump in "I understand what I'm looking at," for very low risk.
- **After full order (§4):** a new user could read Run Detail, Session Lab, Entries/FFT, and the
  core comparison tables without leaving the page or asking what an abbreviation means — directly
  addressing the brief's "places where a user must leave the page to understand something."
- **Highest-severity gaps** (act first): **FFT** and **Ghost** (undefined even in the project's own
  glossary), **Results Basis** (silently rescales every figure), and the **bare statistical panels**
  (Robustness / Sample Adequacy / Pareto / Runs Test) where users may misread decision-grade output.
- **Strategic note:** because copy is centralised in `researchGlossary.js`, the marginal cost of each
  new explained term keeps falling — the first investment (extending TermTip beyond Classification)
  is what unlocks cheap, consistent explainability everywhere after.

---

*Audit only. No application files were modified and nothing was implemented. This document is the
sole deliverable.*
