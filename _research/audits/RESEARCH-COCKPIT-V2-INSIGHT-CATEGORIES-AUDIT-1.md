# RESEARCH COCKPIT V2 — INSIGHT CATEGORIES AUDIT 1

**MODE:** AUDIT ONLY — no code changes, no commits, no backend, no replay/sweep work.
**DATE:** 2026-06-13
**SCOPE:** Evaluate the user's 8 priority insight categories against existing frontend analytics; design Research Cockpit V2 (category coverage + a future cluster map) as a read-only consumer that sits above the labs and does not conflict with the in-flight candle-data / BE-matrix restructure.

---

## 0. Where Phase 1 stands, and why it feels thin

Phase 1 (`data/runInsights.js`) wires only ~6 card producers and, by its own comment, passes `[]` for entry-model signals. It reads `researchSignals` (fill-state + session only), `contextSinkholes`, `beVerdict`, `failureDrivers` (one lift card), `lossTriage` (false-loser), `distanceBreakdown`. So most of the analytics the app already computes never reaches the cockpit.

**The key realization: the gap is wiring, not new computation.** The repo already contains pure helpers for almost every priority category. V2 is mostly *consuming more of what exists*, organized by category, plus one genuinely new surface (the cluster map) that itself reuses an existing engine. Almost none of V2 needs backend work — and the parts that do are exactly the parts entangled with the restructure, so they're deferred regardless.

---

## 1–3. Category-by-category feasibility

Legend — **Now**: derivable from a single run's already-loaded data (trades / orderBlocks / candles in the bundle), pure frontend, safe to wire today. **Conditional**: frontend-complete but needs an optional data slice that only some runs carry (BE replay set, FFT control, retest candles). **Backend**: requires new export/sweep/simulation — defer.

| # | Priority category | Backing analytics (frontend) | Status | Restructure-safe now? |
|---|---|---|---|---|
| 1 | **Order blocks** | `obStats` (RunDetail), `buildObBreakdown` / `buildPenetrationSweep` (`protectionAnalytics.js`), `obwidth` + `penetration` dims (`failuresDimensions.js`), OB Retest (`obRetest.js`, `obRetestMonetization.js`) | **Now** (retest needs candles, which ship in the bundle) | ✅ yes — reads run bundle, not the BE cube |
| 2 | **Entry model** | `classificationBreakdown.entry_model` (RunDetail-local), `entryModel` dim, `researchSignals` entry-model candidates (computed, **not yet wired into cockpit**), triggered-edge funnel (`entryAnalytics.js`) | **Now** | ✅ yes |
| 3a | **Protection — BE** | `buildBeVerdict` (paired BE set), `buildBeOpportunity` (MFE upper-bound, `excursionAnalytics.js`), selective BE (`ProtectionLab`) | **Conditional** — *verdict* needs `beTradesByMode`; *opportunity* is always available | ⚠️ verdict depends on the **BE export the restructure is rewriting** — consume-if-present, never assume the new cube shape |
| 3b | **Protection — FFT** | `computeFftAnalytics` + `compareFftToBaseline` (`data/fftAnalytics.js`), width breakdown (`fftDisplay.js`), `fft` dim | **Conditional** — needs FFT-ON/OFF paired control trades | ✅ yes (FFT control is independent of the BE/candle restructure) |
| 4 | **Sessions / timing** | `buildSessionBreakdown` (`fillStateBreakdown.js`), `buildContextSinkholes` (session×direction), Session Lab analytics, `session` + `hour` + `weekday` dims | **Now** | ✅ yes |
| 5 | **Direction performance** | `directionalOutcomeStats` (RunDetail), `buildExplorer(dimA:"direction")`, `direction` dim, sinkholes | **Now** | ✅ yes |
| 6 | **Structure performance** | `structure` dim, `buildExplorer(dimA:"structure")`, `buildLoserRunUp` structure×direction groups | **Now** | ✅ yes |
| 7 | **Common loss clusters** | `buildFailureDrivers`, `buildPairDrivers` (curated pairs), `buildExplorer` (2-D), `buildLossTriage` cells, `archetype`/`severity` dims | **Now** | ✅ yes |
| 8 | **Optimal TP / best R** | *Proxy only*: `buildMfeDistribution` / `buildLoserMfeReachTable` / `mfePctOfTarget` (upper bound), `deriveSuggestedTargetAndBE` (retest cohorts). *True optimum*: RR Sweep (`SweepLab`, reads `SWEEP_RR`) | **Now = upper-bound proxy; true sweep = Backend** | proxy ✅ ; true sweep ❌ needs multi-run backend sweep |

### Which categories need backend / export changes
- **True optimal-TP / R-target per scenario** — requires a real RR sweep (re-running the backtest at each target). `SweepLab` already does this but reads `SWEEP_*` sweep outputs that "are not stored in bundles." A single run can only give an *upper-bound proxy*, never the realized optimum.
- **BE at scale / the BE-matrix cube** — this is precisely the in-flight `BE-MATRIX-V2` restructure (`backend/execution.py`, `run_backtest.py`, per-arm reverse-conflict forward pass). Parity is **not yet confirmed** and the flag is unpromoted, so the BE-cube data contract is *in motion*. Do not build cockpit cards that assume the new cube shape until parity lands.
- **Cross-run insight stability / history** — needs persistence (deferred since the Phase-1 audit).

### What is safe to add right now (no restructure conflict)
Everything marked **Now** above, plus FFT-when-paired. All of it reads post-normalization frontend helpers over the active run's already-loaded data, touches no `backend/`, no exporter, no BE cube. This mirrors the Phase-1 safety contract exactly.

---

## 4. What Research Cockpit V2 should show

A **read-only research command centre**, organized by the user's mental model (the 8 categories), with a cross-cutting priority layer on top:

1. **Action Queue (top strip)** — the single most decision-relevant items across *all* categories, ranked by confidence-weighted severity/opportunity. Answers "what do I look at first?" Each row is a one-line insight + jump link. (Selection/ranking only — reuses the existing scorers.)
2. **Executive Summary** — current KPIs + reference delta (already in Phase 1).
3. **Category sections** — one collapsible section per priority category (Order Blocks · Entry Model · Protection (BE/FFT) · Sessions · Direction · Structure · Loss Clusters · TP Profile). Each holds 1–N ranked cards from that category's existing helper, or a single "needs data" gate card when the slice is absent (FFT control / BE set missing).
4. **Cluster Map panel** (V2.1) — a 2-D edge/danger matrix over existing dimensions, with a "top clusters" readout and a link into the Failures Lab Explorer for full interaction.
5. **Warnings / Caveats** — low-sample, single-direction, upper-bound-proxy flags (rendered first, as in Phase 1).

Each card keeps the Phase-1 contract: headline · evidence · confidence/severity · caveat · suggested question · source link. The cockpit **surfaces and routes**; it never becomes the place you *do* the analysis.

---

## 5. What stays deeper in the specialist labs

Per the AGENTS.md Research-UI principle ("do not convert exploratory tools into fixed reports"), the cockpit must not absorb the labs' interactivity. Stays in labs:

- Full multi-dimension **explorers, pivots, drilldowns, refine-by-3rd-dim** → Failures Lab.
- **Parameter sweeps** (RR/stop/entry/verify/TF) → Sweep Lab.
- **Selective BE application, BE trade explorer, penetration tuning** → Protection Lab.
- **FFT width tuning, criteria, control-strip** → FFT tabs.
- **Retest tradeability tuning, monetization curves** → Retest Lab.
- **Walk-forward, Monte Carlo, comparison/table-compare** → their own labs.

The cockpit shows the *headline verdict* for each and a deep link. The "why" and "what-if" live where the controls are.

---

## 6. Best structure

**Hybrid: Action Queue + Category Sections as the spine; Cluster Map as one panel.** Not a single mega-matrix.

- **Category sections** map directly to how the user thinks ("what's working / hurting per area") and let each existing helper own its cards. This is the backbone.
- **Insight cards** stay the atomic unit (already validated in Phase 1).
- **Action Queue** is the cross-category ranking the user asked for implicitly ("what should be avoided / where to use BE / what's hurting"). It's a *view* over the same cards, sorted globally — cheap, high value.
- **Cluster Map** is a distinct panel, deliberately **2-D**, because the FailuresDimensions engine is explicitly capped at two dimensions ("no N-way / waterfall mining") to prevent overfitting. It belongs as a panel, not the page's organizing principle.

Recommended priority: Action Queue + Category Sections first (V2.0); Cluster Map second (V2.1). A "ranked action queue" alone (without category grouping) would lose the per-area mental model the user explicitly wants; category sections alone would bury the "what first?" answer — so do both, queue on top.

---

## 7. Smallest useful V2 (MVP = V2.0)

Broaden `buildRunInsights` from ~6 producers to **category-organized producers covering all 8 categories**, then group output by category and add the Action Queue. All additive, pure, single-run, no backend.

Concretely, V2.0 adds these card producers (each from an existing helper, each gating on its source's own sample floor):

- **Order Blocks:** best/worst OB-width or penetration cohort (`buildObBreakdown` / `penetration` dim); retest monetization headline when retest data present.
- **Entry Model:** wire the *already-computed* entry-model signals into `researchSignals` (stop passing `[]`); top entry-model edge + leak.
- **Protection:** BE verdict (when paired set present) + BE-opportunity upper-bound card (always); FFT verdict card (when control present, else a gate card).
- **Sessions:** best session, worst session, worst session×direction (sinkhole already wired — add the positive side).
- **Direction:** stronger/weaker side from `directionalOutcomeStats`.
- **Structure:** best/worst structure cohort via `buildExplorer(dimA:"structure")`.
- **Loss Clusters:** keep `buildFailureDrivers`; add the top `buildPairDrivers` curated-pair cluster.
- **TP Profile:** an MFE-based "capture profile" card — strictly upper-bound framed (see §8).

Then: group cards into category sections, compute the Action Queue as a global sort, keep Warnings first. Cap per-section and globally to avoid wall-of-cards. **No cluster map, no deep-link plumbing, no persistence in V2.0.**

The V2.0 engine stays a pure selector over passed-in helper outputs (extend the Phase-1 contract), so it remains node-testable with synthetic inputs — extend `runInsights.validate.mjs` with the new producers and the per-category grouping/ordering.

---

## 8. "Optimal TP" without overclaiming

Single-run data **cannot** yield an optimal TP — only a *capture profile*. Rules:

- Use **MFE raw-R reach** only (`MFE_RAW_BUCKETS`, `buildLoserMfeReachTable`, `mfePctOfTarget`). Frame as: *"N% of trades reached ≥X R before exit (peak, not path)."*
- Carry the **peak-not-path / upper-bound** caveat verbatim (the same wording `lossTriage.js` already mandates). MFE is what price *touched*, not what a different TP would have *realized* — a lower TP changes nothing about already-captured trades but a higher TP is not guaranteed by a peak.
- **Never** emit "optimal TP = X" or "raise your target." Emit a *candidate band to test*, and name the validation path: an RR Sweep in Sweep Lab (backend). The cockpit card's suggested-question is literally "Sweep targets around X R to confirm?"
- For retest cohorts, `deriveSuggestedTargetAndBE` already exists and is OB-grain — surface its output as a *suggestion with capture floors*, not a verdict.

Net: the TP section is a **profile + a pointer to the sweep**, not a recommendation engine.

---

## 9. BE / FFT management without hindsight bias

The discipline is: **prefer counterfactuals that come from an actual alternative simulation over excursion-based "could-have" reconstructions, and label the latter as upper bounds.**

- **BE verdict (no hindsight):** `buildBeVerdict` compares the run's real BE-replay trade set against baseline net R. That's a genuine alternative simulation, not hindsight — surface it as a verdict where `beTradesByMode` exists. **But** the BE export is exactly what `BE-MATRIX-V2` is rewriting and parity is unconfirmed, so: consume-if-present, gate cleanly when absent, and **do not assume the new cube shape**. Keep `buildBeVerdict`'s own caveat ("global-only — selective BE remains untested").
- **BE opportunity (hindsight-prone):** `buildBeOpportunity` is MFE-derived — an *upper bound* on what BE could have saved. Surface strictly as a "could-have," never as "use BE here." Distinguish it visually from the verdict.
- **Never** prescribe "use BE aggressively in cohort C" from MFE alone. The honest path to "where should BE be aggressive" is selective-BE simulation in Protection Lab, which the cockpit links to — it does not compute the prescription itself.
- **FFT (no hindsight):** `computeFftAnalytics` vs baseline uses FFT-ON/OFF **paired control** runs — a real counterfactual. Surface the verdict only when control trades exist; gate otherwise. Do not infer FFT value from a non-paired run.
- **General guard:** every management insight states whether it's a *realized counterfactual* (BE replay / FFT control / retest) or an *excursion upper bound* (MFE). The user must always be able to tell which.

---

## 10. Implementation phases

- **V2.0 — Category command centre (MVP, pure/additive, no backend).** Broaden producers to all 8 categories from existing single-run helpers; wire entry-model signals; group by category; add Action Queue; gate BE/FFT cleanly. Extend the validator. Same zero-conflict footprint as Phase 1. **Build first.**
- **V2.1 — Cluster Map panel.** A 2-D edge/danger matrix reusing `buildExplorer` (winners-inclusive, sample-floored, lift-highlighted), with a "top clusters" readout and a link into Failures Lab. Curated pairs + guided 2-D selector + progressive refine — **no free N-way mining.**
- **V2.2 — Deep links + Save-Finding reuse.** Make each card's `source.params` open the exact lab drawer/tab (work owned by each lab's stream); wire "Save" to the existing `addProjectFinding` with an additive `source: "research_cockpit"`. (This is the Phase-2 item from the original cockpit audit.)
- **V3 — Backend-dependent (after restructure parity).** True RR-sweep "optimal TP" cards from `SWEEP_*`; BE-matrix-cube cards once the new export lands and parity is confirmed; cross-run insight stability + history (persistence).

---

## What NOT to build yet

- **A 6-way Session×Direction×Structure×EntryModel×Protection×TP matrix.** It is the headline ask but it is an overfitting trap: cells go sparse fast and the engine deliberately forbids N-way mining. Deliver "clusters of conditions" via 2-D + curated pairs + progressive refine instead.
- **Any "optimal TP = X" recommendation** from a single run. Profile + sweep pointer only.
- **Any "use BE here" / "leave trades alone here" prescription** derived from MFE excursions. Verdicts come from real simulations (BE replay, FFT control, selective-BE in the lab).
- **Anything depending on the new BE-matrix cube shape** until `BE-MATRIX-V2` parity is confirmed and the flag promoted.
- **Backend sweeps, exporter changes, candle-pipeline touches** — out of scope entirely.
- **Auto-saved findings / auto-validated conclusions / cross-run history** — V2.2 / V3.
- **Persisting cluster selections or page state** beyond a localStorage UI preference — not in V2.0.

---

## Output summary

- **Feasibility:** 6 of 8 categories (OB, entry, sessions, direction, structure, loss clusters) are **buildable now**, pure frontend, restructure-safe. Protection is **conditional** (BE verdict gated on the in-flux BE export; BE-opportunity + FFT-when-paired available now). Optimal-TP is a **single-run upper-bound proxy now; true optimum is backend**.
- **V2 layout:** Action Queue (top) → Executive Summary → 8 category sections of insight cards → Cluster Map panel (V2.1) → Warnings first.
- **Cluster map:** 2-D edge/danger matrix over existing dims reusing `buildExplorer` + curated pairs + progressive refine; summarized in the cockpit, fully interactive in Failures Lab. Explicitly **not** an N-way matrix.
- **MVP (V2.0):** broaden `buildRunInsights` to category-organized producers from existing helpers + Action Queue; wire entry-model signals; gate BE/FFT; extend the validator. Additive, pure, no backend.
- **Anti-overclaim:** TP = capture profile + sweep pointer; BE/FFT = realized counterfactual vs upper-bound, always labeled; inherit every sample floor and the peak-not-path caveat.
- **Phases:** V2.0 categories → V2.1 cluster map → V2.2 deep links + Save-Finding → V3 backend (RR sweep, BE cube, history) after restructure parity.
- **Build order vs restructure:** V2.0/V2.1/V2.2 are independent of the candle-data/BE-matrix work and can proceed now; only V3 waits on parity.

### Exact next implementation prompt (V2.0 — when ready to build)

> **COCKPIT-2 — Research Cockpit V2.0 (category command centre, static, read-only).**
> **Goal:** Broaden the cockpit to cover all 8 priority categories by consuming existing pure analytics, organized into category sections with a cross-category Action Queue. No backend, no replay, no sweep, no new metric, no persistence, no dependency on the BE-matrix cube shape.
> **Extend (additive):**
> - `frontend/src/data/runInsights.js` — add category-tagged producers: Order Blocks (`buildObBreakdown`/penetration), Entry Model (wire `researchSignals` entry-model rows — stop passing `[]`), Protection (BE verdict gated on `beTradesByMode`; BE-opportunity upper-bound; FFT verdict gated on control via `computeFftAnalytics`), Sessions (best/worst + session×direction), Direction (`directionalOutcomeStats`), Structure (`buildExplorer(dimA:"structure")`), Loss Clusters (`buildPairDrivers`), TP Profile (MFE raw-R capture, upper-bound framed). Add `category` grouping + a global `actionQueue` ranking (confidence-weighted). Inherit each source's sample floor; define no new threshold.
> - `frontend/src/data/__validation__/runInsights.validate.mjs` — cover each new producer, per-category grouping, action-queue ordering, BE/FFT gating, TP upper-bound wording, and empty-slice safety.
> - `frontend/src/pages/ResearchCockpit.jsx` — render the Action Queue strip + collapsible category sections + per-section "needs data" gate cards; reuse the Phase-1 card component. The page memo-calls the existing helpers over the active run's trades and threads outputs into `buildRunInsights` (the page produces `classificationBreakdown.entry_model` via a small local reuse, or a shared extraction, so entry-model signals flow).
> **Do NOT:** touch `backend/`, exporters, the BE-matrix cube, the candle pipeline, any lab internals, `pages/Insights.jsx`, the store, or persistence; add a cluster map (V2.1); add deep-link plumbing (V2.2); emit any optimal-TP or "use BE here" prescription; assume the new BE export shape.
> **Validate:** runInsights validator green · Babel parse touched files · `craco build` (to a writable path in-sandbox) · SSR/live render of `/cockpit` across populated, BE-absent, FFT-absent, and no-run states.
> **Workstream:** update the COCKPIT-1 entry in `docs/ai/WORKSTREAMS.md` to V2.0 scope before coding.

---

**STATUS: AUDIT COMPLETE — no code changed, no commits made.**
