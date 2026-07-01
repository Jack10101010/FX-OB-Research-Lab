# CURRENT_WORKSTREAM.md

> The single active focus. Update this first when focus changes. Source for `/status`.

*Last updated: 2026-07-01 (post-`e6e9fbb` overlay commit + doc-reality sync).*

## Focus (2026-07-01 — Market State backend port + Portfolio/Deployment pivot)

**Strategic direction has shifted.** Per-trade feature mining is considered **exhausted**
(Failure Lab + Market Story Engine — see `FINDINGS.md` F-006/F-007). The active strategic
programme is now the **Portfolio / Deployment framework** (Phase 1 Portfolio Manager → Phase 5
Execution Layer — see `ROADMAP.md`). The **Market State / Regime Gate** work is now **complete
and committed on both sides** — client (frontend) and the canonical Python engine (Lux `3de2b2a`);
the remaining regime work (Phase 3c per-trade emission → Phase 4 filter → Phase 5 sweep) is
deferred. Next active build effort is the **Portfolio / Deployment framework**.

**Client / frontend Market State — COMPLETE (committed).**
- **Phase 0 foundation** (`9856023`) — pure `frontend/src/data/marketState.js` (leakage-safe daily
  EMA200 / BBW / Wilder-ADX + 6-state classifier, `.shift(1)`), `regime` `CONFIG_REGISTRY` group
  (default off, tier `instant_filter`), `buildRegimeConfig` (byte-identical when off),
  `MARKET_STATE_COLORS`, `marketState.validate.mjs`. Golden parity vs `rich_features.pkl` exact
  over 2015→2026 (state 3566/3566). See D-017.
- **Phase 1 UI exposure** (`03c0bc9` inspector UI; `fae2135` Strategy Builder V2 + market-state
  gate) — `useMarketState.js`, `MarketStateControls.jsx`, `MarketStateCard.jsx`; wired into
  Strategy Builder V2 (Section 4) + TradeInspector. Presentation-only.
- **Phase 2 Strategy Map overlays — COMPLETE** (`e6e9fbb` `feat(strategy-map): execution markers
  and Market State overlays`). `ribbonSegmentsFromPanel` / `emaLinePointsFromPanel` overlay
  helpers in `marketState.js`, new `executionMarkers.js`, frozen parity fixture
  `marketState.fixture.json`, ribbon + EMA-200 line + audit execution markers in
  `StrategyMap.jsx` / `CandleChart.jsx`. All overlays default-off; runs byte-identical when off.
  Validators: `marketState.validate.mjs` 70/70, `executionMarkers.validate.mjs` 30/30, Babel OK.

**Backend Market State — Lux Phase 3a + Phase 3b COMPLETE (committed).**
- **Phase 3a** (Lux-OB-Backtester `main` `f6740c6` `feat(config): accept regime_* keys (Phase 3a,
  no behaviour change)`) — the backtester config layer now *accepts* `regime_*` keys (defaults off:
  `regime_gate_enabled=False`, `regime_gate_mode="label"`) with zero behavioural change.
- **Phase 3b COMPLETE** (Lux-OB-Backtester `main` `3de2b2a` `feat(regime): add canonical
  market-state engine`, 2026-07-01) — **canonical Python engine `src/regime.py`** (318 lines):
  faithful compute-only port of the JS engine (`ewm_adjust_false`, BBW ddof=1, Wilder ADX,
  shift-by-1 leakage guard, confirmation, `SOURCE="engine"`, `VERSION="regime-1.0.0"`; documents
  but does **not** emit the Phase-3c `CANONICAL_COLUMNS`). Ships with the frozen fixture
  `tests/regime/marketState.fixture.json` (**byte-identical to the frontend fixture — same
  SHA256**) and `tests/test_regime_parity.py`. **Verified this session:** parity test 4/4 pass
  (numeric ≤1e-9; exact state/knownAt/confirmed; determinism; truncation-invariance leakage proof);
  `grep` confirms **nothing in `src/` imports `regime`** (compute-only). Was already committed
  before this session — the earlier "Phase 3b not started" note here was stale handoff context.
- **Untracked in Lux** (not part of 3de2b2a): `tests/regime/fixture_gen.py` (fixture generator —
  worth tracking for reproducibility) and `tests/regime/regime_parity.py` (a **stale Phase-1
  scaffold** superseded by the committed `tests/test_regime_parity.py`).

> **⚠ Git reality (2026-07-01, authoritative):**
> - **FX-OB-Research-Lab** `codex-dev` HEAD = **`e6e9fbb`** code + **`e6b64c3`** docs sync,
>   **6 commits ahead** of `origin/codex-dev` (`20d31ae`, fetched 2026-06-26); **not pushed**.
> - **Lux-OB-Backtester** `main` HEAD = **`3de2b2a`** (Phase 3b engine), on top of `f6740c6`
>   (Phase 3a); **2 commits ahead of `origin/main`**, **not pushed** (push gated). Repo now
>   connected to the Cowork session.
> - The "15 commits ahead at `fe71537` / Research Cockpit" wording in the older blocks below is
>   **stale** — those commits are not in current history. Blocks below are retained as history only.

## Focus (2026-06-13 — needs confirmation)

**Research Cockpit work is committed locally; the next focus needs confirmation.** Since the last
sync, a read-only **Research Cockpit** (`/cockpit`) was built above the labs and committed:
- **Phase 1** (`b500e36`) — static ranked insight cards from existing analytics.
- **V2.0A** (`fe71537`) — category command-centre: Action Queue + topic sections (Sessions/Timing ·
  Direction · Structure · Loss Clusters) + an "Other signals" catch-all. See `D-015`,
  `_research/plans/RUN-INSIGHTS-COCKPIT-DESIGN-AUDIT-1.md`, `_research/audits/RESEARCH-COCKPIT-V2-INSIGHT-CATEGORIES-AUDIT-1.md`.
- **OB Lab Insights synthesis layer** (`abc5be5`) also landed in this window (separate stream).

**Git reality:** `codex-dev` is **15 commits ahead of `origin/codex-dev`** (NOT pushed) — the earlier
"shipped/pushed, HEAD `96fc733`" wording below is stale. Unpushed range includes the Failures-Lab V5
loss-triage drilldown series, `abc5be5`, and the two cockpit commits. **Push is gated — get approval.**

**Candidate next focus (confirm before starting):**
1. Research Cockpit refinement — V2.1 cluster map, or V2.0B (more safe categories), or wire deep links.
2. The documented research-interpretation thread below (decision-layer on the new metrics).
Do not start new infrastructure unless explicitly requested.

**Active parallel streams (other chats — do not touch their dirty files):** Research Banner /
Phase 14 Wave 2 terminology (`ResearchContextBanner.jsx`, `ResearchRunHeader.jsx`, `researchBanner/*`);
Entry / FFT / Paired Runs (`entries/*`); plus a dirty `RunDetail.jsx` (−8 lines) whose ownership is
**ambiguous** — attribute it to the banner or entries stream before anyone stages it.

---

## Focus (2026-06-12 — research interpretation, still valid)

**Next focus: research interpretation / decision-layer work on the newly surfaced metrics — not more
plumbing.** As of 2026-06-12 the data plumbing the docs kept pointing at is shipped (locally; see the
2026-06-13 note above re: origin gap — earlier text claimed HEAD `96fc733` pushed). The Distance-at-arm consumption, OB-Retest v2.1 monetization, and
Loser Run-Up surfaces are all live; the open question is no longer "wire the export" but "what do these
cohorts mean and what rule do they justify." Do not start new infrastructure unless explicitly requested.

**Recently landed (committed + pushed this session):**
- **Distance-at-arm — frontend consumption** (`449dc58`; D-014). Importer maps
  `price_distance_from_ob_at_arm_pips`; RunDetail renders the signed distance breakdown
  (occupied=0 / edge / 2–5 / 5–10 / 10+ pips, TE-only gated). This **enables in-app F-004 validation**;
  F-004 stays **provisional** until confirmed on a run.
- **Triggered-edge entry-universe expansion** (`6a69ab4`; D-013). Trigger thresholds are now a
  sorted/deduped SET (presets 10/25/50/75 + custom, single-value back-compat); arm delays C0–C3 → C0–C6.
  Pairs with the backend C0–C6 candle-delay change.
- **OB-Retest v2.1 monetization insights** (`287dfe3`). RR-capture curve, time-to-impact buckets,
  decay-by-retest + run insight card in RetestLabTab; also repaired a dangling `obRetestMonetization.js`
  import. Reward shown for OB-grain cohorts only (event-grain hides reward by design).
- **Failures Lab — Loser Run-Up breakdown** (`2004d28`). Whether losers offered profit before failing
  (loser MFE / max-R-reached + ≥0.5/1/1.5/2R reach counts across cohorts); gated when no loser carries `mfe_r`.
- **Build-integrity fixes** (`7eeb596`, `96fc733`). Committed `BeVerificationPanel.jsx` /
  `BannerRunIdentity.jsx` — referenced by tracked imports but never tracked (built locally, broke clean clone).

**Earlier landed (committed):**
- **Phase 14 Wave 1 — research run terminology** (`e9d03aa`; D-010). Wave 2 residual sweep is mostly
  done — see `BACKLOG.md`.
- **Storage — durable backend mirror** (`ccb240e`; D-012).
- **Protection Lab — selective BE + BE Trade Explorer** (`a6b1c09`; D-011).
- **Master Controls Phase 13** — single composer-driven preview (D-009), committed.

**Failures Lab V5 — confirmed false losers: LIVE end-to-end (verified 2026-06-12).** Phase 1 shipped;
Phase 2 + 2B built/validated. The backend post-stop export (`post_stop_mfe_r`,
`post_stop_reached_original_tp`, `post_stop_bars_to_1r`, `post_stop_lookahead_bars`, `post_stop_model`)
is shipped, the importer maps it, and the panel renders the confirmed/candidate/genuine breakdown on
real data (Failures Lab Overview: "6 confirmed of 32 losses · model `fixed_horizon` · horizon 50").
**Not blocked.** Remaining work is research interpretation, not export/import.

## Where we are

- **V4 final integration cleanup — committed** (`371a60d` code, `542ad8c` docs). Excursion
  tab wired, roadmap deps tracked, MFE/MAE alias detection, text-diffable separator,
  verdict chips surfaced.
- **V5 Phase 1 — Filter Discovery simulator — committed** (`a980e8b`).
  `shared/filterSimulator.js` (truth layer: actual trade removal → recompute Net R/WR/PF;
  no lift/share estimates) + `discovery/FilterDiscovery.jsx` tab (quick cards + sortable
  table ranked by Net R improvement, Strong Disable / Test Disable / Watchlist / Neutral)
  + `filterSimulator.validate.mjs` (all 8 spec cases + thresholds + discovery, ALL PASS).
  Execution-path audit confirmed pure trade-removal simulation end to end.
- **V5 Phase 2 — confirmed false losers — BACKTESTER AUDIT COMPLETE** (run in the
  Lux-OB-Backtester chat, 2026-06-10). Conclusions adopted here:
  - No existing export answers post-stop continuation (`mfe_r`/`mae_r`/`r_if_no_target`/
    `mae_r_to_original_exit` all bounded by first stop touch; `ghost_*` = cancelled OBs).
  - **Agreed schema (5 core fields, loser-only):** `post_stop_mfe_r` (headline — max
    favorable R after the stop candle, from ORIGINAL entry),
    `post_stop_reached_original_tp`, `post_stop_bars_to_1r`,
    `post_stop_lookahead_bars`, `post_stop_model`.
  - **Horizon:** finite, single, configurable — default **50 bars**; end-of-data lookahead
    rejected (overstates false losers). Multi-horizon `_NN` suffixes are a Tier-2 extension.
  - **Implementation:** additive post-pass inside `enrich_trades_with_stop_anchored_excursions`
    (reuses candle arrays + `exit_candle_index`); no live-sim changes; LOSS rows only.
  - **Caveat:** `post_stop_mfe_r` is a peak ("reached"), not a path — it cannot prove a
    BE/trail would have held. One export serves false-loser confirmation, exact BE-replay
    validation, and trailing-stop research.

## V5 Phase 2 — confirmed false losers (frontend) — BUILT + VALIDATED

- Canonical `post_stop_mfe_r` adopted; `failuresDataQuality.js` FIELD_DEPS aliases
  `postStopMfeR` / `post_stop_mfe_r` / legacy `post_stop_continuation_r`.
- `importer.js` maps the 5 fields dual-keyed (`numOrNull`/`boolOrNull`; absent → null/"").
- `failuresAnalytics.buildConfirmedFalseLosers` classifies losers
  **confirmed / candidate / genuine** (reached ≥1R or hit original TP / ≥0.5R / never),
  with cohort breakdowns (session, direction, structure, archetype), horizon + model.
  `failuresFalseLosers.validate.mjs` 30/30 PASS. Analytics + validate committed on host;
  `importer.js` change rides in the shared dirty file.

## V5 Phase 2B — Overview IA — BUILT + VALIDATED, COMMIT PENDING

Move false-loser research onto the Overview decision surface. Five UI files:

- `overview/ConfirmedFalseLosersPanel.jsx` (new) — confirmed/candidate/genuine tiles +
  cohort breakdowns + candidates fallback, extracted out of `ViewManager`.
- `overview/FailuresOverview.jsx` — renders that panel after the Command Center, plus a
  bucket-less **Global Failure Explorer** (whole-run, valid-universe gated via
  `isPerformanceTrade`).
- `excursion/FailureExplorer.jsx` — parametrised `title`/`prefsKey`/`roadmapKey`/`intro`
  so one component serves both explorers without sharing persisted UI state.
- `excursion/ExcursionAnalysis.jsx` — Distance-to-Stop instance relabelled **MFE Bucket
  Explorer** (bucket-scoped logic unchanged).
- `workspace/ViewManager.jsx` — Views & Export trimmed to CSV export + saved views + a
  lightweight pointer to Overview.

No Protection Lab / OB-Retest / Master Controls / `roadmapStore.js` / `SectionRoadmap.jsx`
changes (Overview explorer passes `roadmapKey={null}`). Scoped commit = these 5 files only.

## Blockers / open questions

- **Phase 2 false losers — NOT blocked (correction).** Earlier docs said this waited on the
  Lux-OB-Backtester export; the export shipped, the importer maps it, and the surface is live
  (verified 2026-06-12). No backend/import dependency remains.
- Parallel streams: OB-Retest (active, own stream); Hypothesis Lab fixes landing from host.
  Master Controls Phase 13, Protection-BE (selective BE / BE Explorer), Storage mirror, and Phase 14
  Wave 1 are now **committed** (see Focus — recently landed) — no longer in-flight dirty work.

## Remaining

Frontend (Phase 2 + 2B) is built, validated, and **live** — the active imported run carries the
`post_stop_*` fields and the panel renders the real confirmed/candidate/genuine breakdown (the
candidates-only fallback is the *no-data* path, not the current state). The field-gating still
correctly degrades to the fallback for older runs imported before the export existed.

**Remaining work is research interpretation / decision-layer**, not export/import/build. Open questions
now answerable on live data: what the confirmed/candidate/genuine false-loser cohorts and the loser
run-up (loser-MFE) distributions mean, whether they justify BE/partial-management rules, and what the
distance-at-arm breakdown says about F-004. Capture conclusions in `FINDINGS.md` (do not pre-promote).

**Preserved open items (not this focus — pick up only if requested):**
- **Signed occupation-depth / distance-band research** (`BACKLOG.md` P2) — the orthogonal signed
  `distance_band` dimension; natural follow-on now that distance-at-arm is consumed.
- **Repo hygiene:** root audit-doc cleanup, a CI/fresh-checkout build gate (would have caught the
  dangling imports above), and root `package.json`/`package-lock.json` clutter removal.
