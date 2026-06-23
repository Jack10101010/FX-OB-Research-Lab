# BE Replay — original purpose & EXACT-only architecture (audit)

**Repo:** FX-OB-Research-Lab. **Audit only — no code.** Grounding: `beReplay.js` header, `BreakevenTab.jsx`
header, `beResolve.resolveBeScenarioSource`, and the BE-REPLAY / BE-BACKEND-EXACT-REPLAY phase docs (both
~2026-06-10).

## 1. Why does BE replay exist?
It is the **Phase 1 "REPLAY" confidence tier** — a *client-side, candle-resolution estimate* of what
break-even would have done, computed in the browser from `candles.csv` (`beReplay.js` header:
"Break-even Replay Engine (Phase 1 · REPLAY tier) … research-grade, not authoritative. … Spread/slippage NOT
modelled … same-candle ambiguity handled conservatively"). It was built **before** the backend could produce
authoritative BE, so researchers could explore "what if BE at arm X / trigger Y" across arm levels without
re-running the backtest. Its confidence tier sits **between EXACT and ESTIMATE**.

## 2. Which workflows depend on it today?
- The **Breakeven tab arm-level table** — the 9-row sweep (0.25 … 3.5R × trigger) that shows a BE outcome per
  arm. EXACT cells come from the backend; **REPLAY fills the cells the backend did not export.**
- That's essentially it for *active* dependence. The richer surfaces — Selective BE (cohort attribution),
  the BE Trade Explorer, the comparison cards — all key off `selectedBeScenario`, which **prefers EXACT**
  (`resolveBeScenarioSource`) and only shows REPLAY as a labelled fallback. So replay's real job today is
  **populating the un-exported cells of the arm sweep**.

## 3. Is replay intended only as a fallback when no EXACT exists?
**Yes.** `resolveBeScenarioSource` returns `source:"EXACT"` whenever a matching exported scenario exists and
`source:"REPLAY"` otherwise (reasons: `no_be_data`, `no_matching_variant`, `no_matching_scenario`). The
module headers call it the REPLAY *tier* and label all output "research-grade, not authoritative." So by
design EXACT is authoritative and REPLAY is the gap-filler.

## 4. Why are we replaying all non-EXACT arms when the run already has EXACT?
Not by intent — by **side effect of rendering the full arm-sweep table**. The builder maps over all 9
`ARM_LEVELS`; the run exported EXACT for only some (e.g. 0.25R), so the resolver returns REPLAY for the other
8, and the builder candle-walks them so the table isn't blank. This made sense in Phase 1 (no backend EXACT
at all). **Now that the backend produces authoritative EXACT BE (and a `beScenarioIndex` of exactly which
scenarios were generated), replaying 8 arms over the full candle set is mostly wasted, research-grade compute
sitting next to authoritative data — and it is the crash source.**

## 5. Could Protection Lab run EXACT-only?
**Yes — cleanly, with no new data.** The information needed to do this already exists:
- `hasAnyExactBe` / `beResults` / `beTradesByMode` → which scenarios have EXACT data resident.
- `beScenarioIndex` / `beExactCoverage` (`{triggers, armsByTrigger, hasAny}`) → exactly which (arm, trigger,
  variant) scenarios the run **generated**, even before rows load.
So the arm-sweep table can render every cell as:
- **EXACT** — exported + resolved → show normally; or
- **"Not Exported"** — generated-but-not-this-cell / never generated → a muted marker, **no replay**.
No `replayBeScenario`, no candle load in Protection Lab → the entire freeze/crash class disappears, memory use
drops to table-rendering only, and the displayed numbers are all authoritative.

---

## Recommended architecture (simplest; preserves research value)

**Default: EXACT-only Protection Lab.**
1. Render the arm/trigger table from EXACT data; for any cell without an exported scenario show
   **"Not Exported"** (drive it from `beExactCoverage`/`beScenarioIndex`, which already exist). No replay, no
   candle load.
2. **Delete the auto-replay path** from the Breakeven view (the `ARM_LEVELS.map → replayBeScenario` builder,
   the candle-load effect that feeds it, and the `console.info` diagnostic). This removes causes #1–#5 of the
   crash audit at the root, not with another guard.

**Preserve the research value of replay as an explicit, bounded opt-in (only if still wanted):**
3. Keep `beReplay.js` (it's pure and validated) but expose replay as a **per-cell, single-scenario,
   on-demand action** — e.g. a "Estimate via replay" button on a "Not Exported" cell that replays **that one
   (arm, trigger)** only, building the candle index **once**, gated on candle count, clearly labelled
   "REPLAY · research-grade." Never auto-run, never all-arms, never in a background idle callback.

**For full arm-level sweeps, point users at the authoritative path that now exists:** re-run the **backend BE
matrix (multiarm)**, which produces EXACT for every arm. That is strictly better than client replay and is
why the replay tier is largely obsolete.

### Why this is the simplest good answer
- **Complexity ↓** — Protection Lab becomes a pure renderer of backend results + a coverage map; no
  candle-walk engine in the hot path.
- **Memory ↓** — no `buildReplayCandleIndex` Maps over the candle set, no large candle array held for
  Protection Lab, no retained console objects.
- **Freezes → 0** — there is no synchronous candle walk to hang on; the no-BE guard and the large/lazy guard
  become unnecessary for this surface (they were patches over the replay-in-render design).
- **Research value preserved** — exported BE shows authoritatively; un-exported is honestly marked; optional
  single-shot replay still available for ad-hoc estimates; full sweeps come from the backend matrix.

**Net recommendation:** make **EXACT-only the default and remove auto-replay**; demote candle-walk replay to
an explicit, single-cell, labelled opt-in (or drop it entirely if the backend BE matrix already covers the
"compare arms" workflow). This is less code than the current guard stack, not more.

*Audit only. No code changed, nothing staged/committed/pushed.*
