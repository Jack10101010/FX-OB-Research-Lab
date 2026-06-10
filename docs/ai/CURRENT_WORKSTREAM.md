# CURRENT_WORKSTREAM.md

> The single active focus. Update this first when focus changes. Source for `/status`.

*Last updated: 2026-06-10.*

## Focus

**Failures Lab V4 → final integration cleanup (then pause).**

> Note: this file previously still described Classification Tab V2 Phase 2 as active —
> that was stale. Classification Phase 2 (engine + UI) shipped and is **paused**; its
> remaining polish items live in `BACKLOG.md` / `ROADMAP.md`.

## Where we are

Failures Lab V4 is **feature-complete** per `FAILURES-LAB-V4-ARCHITECTURE-AUDIT-1.md`
(which explicitly recommended against the remaining flashy items). Main completed surface
is the **Distance to Stop (Excursion) tab**:

- **Loser MFE Reach** table (how far losers travelled before failing).
- **BE Opportunity** by arm level (cumulative + exclusive ranges; optimistic-upper-bound framing).
- **Winner MAE / Stop Pressure** (to-original-exit with stop-anchored fallback + provenance warnings).
- **MAE by Dimension** (Structure × MAE / Session × MAE, winner-based).
- **MFE by Dimension** (Structure × MFE / Session × MFE).
- **Penetration dimension** in the failures dimension registry.
- **Failure Explorer** (3 scopes, 2-dim cap, refine-by-dimension, persisted prefs) with
  **verdict action chips** (Test disable / Watchlist via `bucketRowAction`).
- Insights command center, raw-R bucket drilldown, drivers + curated pairs, shared
  aggregation engine (`failuresAggregation.js`), data-quality alias detection.

**This cleanup phase (implemented, commit pending — host commits):**
1. Excursion tab **wiring** (tab key + workspace render) — was uncommitted; HEAD had the tab unreachable.
2. Untracked deps **`SectionRoadmap.jsx` / `roadmapStore.js`** added (committed `FailureExplorer` imports them — HEAD didn't build standalone).
3. **MFE/MAE alias detection** (`maeR`/`mae_r`/`mae`, `mfeR`/`mfe_r`/`mfe`, `maeRToOriginalExit`/`mae_r_to_original_exit`, `rIfNoTarget`/`r_if_no_target`) — kills false "missing field" banner warnings.
4. **Binary-diff fix** — literal NUL separator in `failuresAggregation.js` replaced with the `\u001F` escape (no behaviour change; git now diffs the file as text after commit).
5. **Verdict chips surfaced** in the Explorer bucket table (Action column; engine was already validated, UI was missing).

## Blockers / open questions

- None for the cleanup itself. BE replay / winner-cost modelling stays future work
  (see roadmap seeds in `roadmapStore.js` and the BE-REPLAY-* audits).
- Parallel dirty files from **OB-Retest** (`obRetest.js`) and **Protection/BE-Replay**
  (`ProtectionLab.jsx`, `beReplay.js`, `BreakevenTab.jsx`) belong to other streams — do not stage with this one.

## Definition of done (cleanup)

Excursion tab reachable from HEAD; fresh checkout builds; no false MFE/MAE warnings;
verdict chips render; aggregation file diffs as text; docs synced; scoped commits handed
to the user. **Then pause Failures Lab** and pivot (Master Controls / Protection next-focus
decision).
