# Master Roadmap — Reality Audit

*Read-only. Cross-referenced docs (`CURRENT_WORKSTREAM`, `PROJECT_STATUS`, `WORKSTREAMS`, `DECISIONS`, `BACKLOG`) against the last 30 frontend commits AND the now-accessible Lux-OB-Backtester. Opinionated and prioritized. Where reality and docs disagree, reality wins.*

---

## 🔴 The headline: the two "highest-value blocked" items are NOT blocked. They're built.

The docs (PROJECT_STATUS, CURRENT_WORKSTREAM, BACKLOG P1) all describe **Confirmed False Losers** and **Distance-at-arm** as *"blocked on the Lux-OB-Backtester export (separate repo, not connected)."* With the backtester now visible, that's **false**:

| Capability | Backend export | Frontend importer | Frontend surface | Real status |
|---|---|---|---|---|
| **Confirmed False Losers** (`post_stop_*`) | ✅ shipped — `src/execution.py` emits all 5 fields; real CSV columns (150–154); backtester commit `b33e83f` | ✅ **already mapped** (`importer.js` L473–480, dual-keyed) | ✅ `buildConfirmedFalseLosers` → `ConfirmedFalseLosersPanel` / `FailuresOverview` (live) | **End-to-end COMPLETE. Just needs a post-stop run imported to flip from the candidates-fallback to live.** Effectively a data refresh, not a code task. |
| **Distance-at-arm** (`price_distance_from_ob_at_arm_pips`) | ✅ shipped — real CSV column (140) | ❌ **NOT mapped** in `importer.js` | ❌ no breakdown yet (Phase 3) | **Unblocked. ~2-line importer map + a breakdown section is the whole job.** |

**This single fact reorders the roadmap.** The #1 documented "blocker" (false losers) is essentially done; the #2 (distance) is a tiny frontend task. Everything the docs frame as "waiting on the backtester" is actually waiting on **frontend consumption of fields the backend already exports.**

Bonus reality: the backtester exports far more than the frontend consumes — `max_distance_away_before_fill_*`, `close_breach_distance_*`, `retrace_cancel_distance_pips`, MAE-to-original-exit, OB-retest death-quality/monetization (`ef7335b`), FFT width gate. **The backend has raced ahead of the frontend.**

---

## A) Current Project State

**Active (and over-invested):** **Protection Lab / BE** — ~13 of the last 30 commits (selective BE, affected-trade map, BE Trade Explorer, higher arm levels, exact scenario generation, variant verification, lifecycle-label polish, UX quick-wins). This is where energy has actually gone.

**Done / committed:** Master Controls **Phase 13** (single composer preview, `27365ad`); **Storage** durable mirror + insights JSON backend (`ccb240e`, `57e3e51`); **Phase 14 Wave 1 + Wave 2** terminology (`e9d03aa`, `45a8483`).

**Mislabeled as blocked — actually ~complete:** **Failures Lab V5 — Confirmed False Losers.** Documented as "current focus, blocked." Reality: dormant in the commit log *and* fully wired end-to-end. It's done; nobody noticed the backend caught up.

**Unblocked but untouched:** **Distance / Occupation-Depth research** (Phase 3). Backend field exists; frontend never mapped it.

**Parked (correctly):** Session Lab (no momentum); Phase 14 structural Wave 3 + **Phase 15 TradingView mode** (parked after terminology — never started); Comparison Lab; Model Family Comparison.

**Partial:** OB Retest (backend exporter shipped incl. monetization; frontend Phase 2 mid-stream).

**Doc drift:** `CURRENT_WORKSTREAM`/`PROJECT_STATUS`/`BACKLOG` still name **Failures Lab V5 as focus and "blocked"** — both wrong. Actual focus = Protection-BE. Actual blocker = nonexistent.

---

## B) Recommended Next Milestone (push this before touching anything else)

### "Light up the research decision layer from already-exported fields."

Two moves, both tiny, both high-value, both currently dark:
1. **Verify + ship Confirmed False Losers** — import (or re-run) a backtest CSV carrying `post_stop_*`, confirm the panel flips from candidates-fallback to live, sanity-check the confirmed/candidate/genuine split. Likely **hours, not days** — the pipeline already exists.
2. **Map distance-at-arm + Phase 3 breakdown** — add the `price_distance_from_ob_at_arm_pips` importer line, build the 0–2 / 2–5 / 5–10 / 10+ pip breakdown, **validate against F-004** (distance < 2 pips weak/negative).

**Why this milestone:** it converts shipped-but-invisible backend research into actual product at near-zero cost. It's the single best ROI on the board, and it's the *research* the lab exists to surface — far more than another Protection-BE refinement.

---

## C) Recommended Next 3 Milestones

1. **(above) False Losers live + Distance breakdown.** Closes the backend→frontend consumption gap on the two top research fields.
2. **Occupation-Depth / signed `distance_band` dimension** (BACKLOG P2). The same backend data now exists; this is the research that could explain *why* the Vacant edge works (the Edge-Zone hypothesis generalizing F-004). Plugs into Research Signals with zero engine change. High research payoff.
3. **Backend-export consumption sweep** — a deliberate audit of what the backtester exports vs. what `importer.js` maps (MAE-to-exit, close-breach/retrace distances, OB-retest monetization). Map the high-value unconsumed fields. This stops the backend/frontend gap from silently re-opening.

---

## D) Things To Ignore For Now

- **Phase 14 Wave 3 (structural)** — "View as a grouped control", Run Preview→Rerun rename. Wave 1/2 already captured ~all the user-facing clarity. Low marginal ROI; defer.
- **The Scenario/Baseline terminology split** — genuine rabbit hole (overloaded 3 ways, tied to persisted state). Don't open it without a forcing function.
- **Protection Trade Explorer "adapter" model** (from the BE UX audit's future-proofing) — speculative generalization for FFT/Pretrigger/Delayed before those layers even need a table. Classic premature abstraction. Skip until a second layer actually demands it.
- **Session Lab / Comparison Lab / Model Family Comparison** — keep parked; no current pull.
- **`sumR2` effect-SE confidence, Signal-Card chips** — nice-to-have polish on an already-shipped engine.

---

## E) Things At Risk Of Becoming Endless Polish

- **Protection-BE / BE Trade Explorer.** It's past the steep part of the value curve: selective BE → affected map → Trade Explorer → higher arms → quick-wins UX → (proposed) adapter. Each step returns less. **Pause after the current quick-wins commit.** The next BE increment should be *research output* (does BE actually help, by cohort?), not more table chrome.
- **Phase 14 terminology** — three waves of string renames. Wave 3 is where it tips into diminishing returns. Stop at Wave 2 + the BreakevenTab residual.
- **Master Controls** — Phase 13 was a real win; resist re-opening preview internals. Phase 15 (TradingView mode) is the *legitimate* big next step there, but it's a major project — don't dabble; schedule it deliberately or leave parked.

---

## Next-10 by ROI

| # | Item | Impact | Effort | Risk | Dependencies | Why now |
|---|---|---|---|---|---|---|
| 1 | **Confirmed False Losers — verify & go live** | **Very high** (core research decision layer) | **Tiny** (data refresh; code exists) | Low | A post-stop run CSV (backend already emits) | The "blocker" is gone; it's sitting dark, fully wired |
| 2 | **Distance-at-arm importer map + Phase 3 breakdown** | High (validates/extends F-004) | Small (~2-line map + 1 section) | Low | Field already exported | Unblocked; cheapest high-value research win |
| 3 | **Occupation-depth / signed `distance_band`** | High (explains *why* Vacant edge) | Medium | Low–Med | #2's importer field | Data now exists; auto-feeds Research Signals |
| 4 | **Backend-export consumption audit + map** | Med–High (unlocks MAE-to-exit, breach/retrace, monetization) | Medium | Low | Backtester (now visible) | Backend raced ahead; close the gap systematically |
| 5 | **Protection-BE: cohort BE *research output*** (does BE pay, where?) | High (turns the BE machinery into a finding) | Medium | Low | False losers + BE explorer (done) | Converts BE build effort into actual research |
| 6 | **OB-Retest frontend Phase 2** (consume monetization/death-quality export) | Medium | Medium | Med | Backend exporter shipped (`ef7335b`) | Export exists; frontend mid-stream |
| 7 | **Save findings / research library** | Medium (compounding research value) | Medium | Low | Storage mirror (done, D-012) | Storage backend now exists to persist to |
| 8 | **Master Controls Phase 15 — TradingView mode** | **Very high** (product north star) | **Large** | Med–High | Phase 13 (done) | The big bet; schedule deliberately, don't dabble |
| 9 | **Phase 14 Wave 3 (structural)** | Low–Med | Medium | Med (Scenario/Baseline) | Wave 1/2 (done) | Only after research items; mostly captured already |
| 10 | **UI Explainability / `sumR2` polish** | Low | Low–Med | Low | — | Genuine polish; do in gaps, not as a focus |

---

## Direct answers

- **Drifted from Master Controls / Phase 14?** Yes — into Protection-BE + Storage + terminology. But the moves were *mostly* legitimate: Phase 13 was a real prerequisite, Storage is real infra, selective BE is real capability. The drift problem isn't illegitimacy — it's that **Protection-BE kept going past the point of diminishing returns while a fully-built, higher-value research surface (false losers) sat dark because the docs said it was blocked.**
- **Critical path:** frontend consumption of already-exported backend research fields. Start with false-losers (verify-live) and distance (map).
- **Most product value (unfinished):** Failures Lab V5 false losers (≈done, just dark) + Distance/Occupation research. The product is a *research lab* — research surfaces beat tool chrome.
- **Pause:** Protection-BE table/adapter polish; Phase 14 Wave 3; Session/Comparison Lab.
- **As product lead, next milestone:** ship the two dark research surfaces (false losers live + distance) before any new build. It's the highest ROI on the board and it's nearly free.

*Reality vs docs, bluntly: update `BACKLOG.md`/`CURRENT_WORKSTREAM.md` — the false-losers and distance "backend blockers" are resolved; the real open work is small frontend consumption, not a backtester dependency.*
