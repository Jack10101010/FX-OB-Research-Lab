# Rolled-back stash inventory — `stash@{0}` (frontend-runstate-wip-20260621)

**Repo:** FX-OB-Research-Lab. **Audit only — nothing edited/staged/committed/pushed.**

Stash scope: 6 files, **+815 / −137**. **Verified: NONE of the stashed symbols exist in the current working
tree or at HEAD** — so everything below is genuinely absent from the codebase (it lives only in the stash),
except where a later, *different* implementation superseded it (called out explicitly).

One important dependency: the candle/window work in the stash consumes a sidecar transport layer
(`getRunCandlesByRunId` with `aggregate`/`bucket`/`start`/`end`/`max_points`). That transport **exists in the
working tree** (`frontend/src/data/sidecarClient.js`, uncommitted — one of the "unrelated dirty" files) but is
**not at HEAD** and currently has **no consumers** (its consumers are all in this stash). So sidecarClient is an
orphaned half of the same rolled-back feature.

---

## 1–2. Change-by-change inventory (classified)

### `frontend/src/data/store.js` (+258) — 6 clusters

| # | Feature/fix | Type | User-visible impact | Complete? | Likely tied to the instability? |
|---|---|---|---|---|---|
| S1 | **Lazy-shell run-state classifiers** — `isLazyRun`, `hasResidentLazyIndexes`, `hasResidentTradeRows`, `isUnhydratedLazyShell` | New fn + run-state classification | None directly; gates other behaviour | Complete | **Yes** — run-state reclassification was central to the hydration-divergence regressions |
| S2 | **`runHasPopulatedData` lazy guard** — a lazy run counts as populated only once indexes/rows resident | Bug fix / classification | Un-hydrated shell no longer shows "Available / 0 rows" | Complete | **Yes** |
| S3 | **`reloadLazyRunFromManifest`: `indexOnly: true → false`** + `lazyWarnings` preserved | Run-state classification fix | Lazy run no longer swept into index-only/metadata-only UI | Complete | **Yes** (flip directly changes auto-reload eligibility) |
| S4 | **Background `order_blocks` loader** (`loadLazyOrderBlocksInBackground`, `LAZY_OB_INFLIGHT`) — OBs load async instead of blocking import | New fn + perf | Lazy run interactive immediately; OB-dependent fields fill in after | Complete | Partially — changes import timing/ordering |
| S5 | **`autoReloadIndexedRunsFromSidecar`: include un-hydrated lazy shell once, skip hydrated** | Auto-reload change | Shell rehydrates automatically; hydrated runs no longer re-fetched every Runs-mount | Complete | **Yes** — auto-reload loop was a suspected re-fetch/notify storm source |
| S6a | **`loadCandlesForRun` DISPLAY path** (`purpose:"display"`/`aggregate` → `displayCandles`/`displayCandlesMeta` cache) | New functionality (candle window) | Strategy Map overview uses aggregated OHLC, never poisons full-res `candles` | Complete | No — additive cache slot |
| S6b | **`loadInspectorWindowCandles`** (1m window, `intrabarCandlesByWindow` cache, inflight de-dup) | New functionality (inspector) | Intrabar magnifier fetches a small full-res window on demand | Complete | No |
| S6c | **`loadM15WindowCandles`** (bounded 15m window, `m15Windows` cache) | New functionality (strategy map) | "M15 Window" detection-TF view | Complete | No |

### `frontend/src/pages/RunDetail.jsx` (+11)
| Feature/fix | Type | Impact | Complete? | Instability? |
|---|---|---|---|---|
| **Auto-reload un-hydrated lazy shell** (`isLazyShellNeedingReload` → `shouldAutoReloadRun`) + import `isUnhydratedLazyShell` | Bug fix / auto-reload | A restored lazy shell rehydrates instead of showing metadata with **0 valid rows / empty KPIs** | Complete | **Yes** (coupled to S1/S3/S5) |

> **RunDetail "KPI fix" note:** there is **no direct KPI formula change** in the stash. The only RunDetail change
> is the auto-reload trigger — KPIs that previously rendered as 0/empty on a lazy shell populate *because* the run
> rehydrates. So "RunDetail KPI fix" = a side effect of the rehydration cluster, not a standalone fix.

### `frontend/src/components/lab/entries/EntriesWorkspace.jsx` (+27)
| Feature/fix | Type | Impact | Complete? | Instability? |
|---|---|---|---|---|
| **Rehydrating-shell banner** (`rehydratingShell`, `shellVariantKeys`, `showRehydrating`) — shows "Loading N entry-model variants… (rehydrating large run)" with the known variant names instead of "Baseline only" | UX | Truthful loading state for a lazy shell in Entries Lab | Complete | No — **but SUPERSEDED** (see §3B) |

### `frontend/src/pages/StrategyMap.jsx` (+294) — 4 clusters
| # | Feature/fix | Type | Impact | Complete? | Instability? |
|---|---|---|---|---|---|
| M1 | **Display-candle consumption** — render `displayCandles` (aggregated), bucket-aware TF options, rewritten "Aggregated to 6h" downsample pill driven by backend meta | New fn + UX | Multi-million-row runs render continuous bars, not specks/striding; honest TF label | Complete | No |
| M2 | **Intrabar inspector 1m-window fetch** — `inspectorStart/End` (primitive, capped 24h), padding state, fetch effect, props to inspector | New functionality | M1 magnifier works on aggregated-overview runs | Complete | No |
| M3 | **M15 Window mode** — Overview/M15 segment, presets (6M/9M/1Y/around-trade), Prev/Next, bounded fetch | New functionality (candle window) | Detection-TF trust-checking on large runs without loading full history | Complete | No |
| M4 | **Deep-delay lifecycle labels** in `LifecycleDetailPanel` — real "Arm C50 · Filled +51", "Left OB before arm" / "Armed after OB exit" flag chips + narrative | New fn + bug fix (diagnostic) | C20–C50 entries read correctly instead of collapsing to "Fill C1" | Complete | No |

### `frontend/src/components/lab/IntrabarInspector.jsx` (+351) — 5 clusters
| # | Feature/fix | Type | Impact | Complete? | Instability? |
|---|---|---|---|---|---|
| I1 | **`React.memo(MiniChart)` + `useMemo(computeOverlays)`** | **Bug fix / perf** | Dragging/repositioning the inspector no longer recomputes overlays every mousemove (main-thread freeze fixed) | Complete | No (it *fixes* a freeze) |
| I2 | **Lifecycle count strip** (Trig→Arm / Arm→Fill / Fill→Exit / Trig→Fill) | New fn / diagnostic | Candle-count diagnostics from real row indices; "—" when missing | Complete | No |
| I3 | **Past/Future padding presets** (`PadButtons`, `Footer` rewrite, window-driven) | New fn + UX | 1h/2h/4h/8h context control of the fetched window | Complete | No |
| I4 | **Window fetch states** (loading / error props + render) | UX | "Loading 1m candles…" / error instead of generic "1m unavailable" | Complete | No |
| I5 | **Arm-eligible marker + deep-delay labels** — "ARM ACTIVE C50", emphasis (dashed/thick), label de-collision row-stacking, axis-clear | New fn + bug fix | Arm marker unmistakable; clustered labels (ARM/ENTRY/EXIT) readable; legacy `armedAt` replaced by real arm-eligible time | Complete | No |

### `frontend/src/pages/strategyMap/useResolvedScenario.js` (+11)
| Feature/fix | Type | Impact | Complete? | Instability? |
|---|---|---|---|---|
| **Expose deep-delay row fields** — `fillCandleIndex`, `exitCandleIndex`, `delayCandlesConfigured`, `fillDelayCandles`, `retracedOutBeforeArm`, `armedAtTime`, `fillTime`, `exitTime` | New fn / data plumbing | Feeds I2/I5 + M4 (without these, the diagnostics render "—") | Complete | No |

---

## 3. A / B / C / D buckets

**A. Definitely lost and currently missing (absent from HEAD + working tree):**
Everything in the stash. Verified by symbol grep — zero occurrences anywhere. The self-contained, high-value
losses are: the candle **display aggregation** (S6a+M1), **inspector 1m window** (S6b+M2+I*), **M15 window**
(S6c+M3), **deep-delay diagnostics** (M4+I5+resolver), and the **inspector perf fix** (I1).

**B. Probably lost but superseded elsewhere:**
- **EntriesWorkspace rehydrating banner** — superseded by the later **Phase 1/2 Entries Lab rewrite**
  (variant selector, `discoveredModelKeys`, `appliedVariantKeys`, `useLazyEntryVariants`). Phase 2 solves the
  "baseline only" problem differently (pinned variants + per-variant lazy load), and the stash's banner patches a
  code region that no longer exists. **Do not restore as-is — it would conflict.**
- **Lazy variant *loading* intent** — Phase 2's `useLazyEntryVariants` partially covers "load variant rows on
  demand," but it does NOT cover *run-level rehydration of a persisted shell* (S1–S5). Those remain genuinely lost.

**C. Experimental / likely the instability — keep rolled back unless re-validated:**
The **lazy-shell hydration + auto-reload cluster**: S1, S2, S3 (`indexOnly` flip), S5 (auto-reload includes
shells), and the RunDetail auto-reload trigger. This is the run-state-classification + auto-reload surface that
the stabilization audit implicated (re-fetch/notify storms, hydration divergence between RunDetail and Entries
Lab). S4 (background OB loader) is adjacent and changes import timing. Reintroduce only behind careful re-testing,
ideally *after* Phase 2, and as its own isolated change.

**D. Valuable — should likely be reintroduced (independently of C):**
- **I1 inspector perf fix** — pure bug fix, smallest risk, near-standalone.
- **M4 + I5 + resolver deep-delay diagnostics** — high research value for C20–C50 ("Arm C50", left-OB/armed-after-exit
  flags). Mostly self-contained (resolver fields + presentational).
- **Candle display aggregation + M15 + inspector window (S6a/b/c + M1/M2/M3 + I2/I3/I4)** — major UX for large
  runs; coupled to store + sidecarClient + backend (see §4).

---

## 4. Per-file: removed summary, risk, coupling

**`store.js`** — *Removed:* lazy-shell classifiers (S1/S2), reloadLazyRunFromManifest reclassification + background
OB loader (S3/S4), auto-reload shell inclusion (S5), and three candle-window loaders (S6a/b/c).
*Risk if reintroduced:* **High for S1–S5** (run-state/auto-reload — the implicated surface); **Low–Med for S6a/b/c**
(additive cache slots, no existing-path change). *Coupling:* S1 is imported by **RunDetail** + **EntriesWorkspace**;
S6a/b/c are called by **StrategyMap**; all candle loaders require **sidecarClient** aggregate/range params (present
in WT, uncommitted) + the **backend** range/aggregate endpoint. Can split: S6a/b/c are separable from S1–S5.

**`RunDetail.jsx`** — *Removed:* auto-reload-on-lazy-shell trigger. *Risk:* **High** (auto-reload behaviour).
*Coupling:* hard-depends on `store.isUnhydratedLazyShell` (S1). Cannot be reintroduced without the C cluster.

**`EntriesWorkspace.jsx`** — *Removed:* rehydrating-shell banner. *Risk:* **High to reintroduce as-is** (conflicts
with Phase 2). *Coupling:* depends on S1 + the pre-Phase-2 banner code. **Recommend: drop; re-derive a "rehydrating"
state inside the Phase 2 banner if still desired.**

**`StrategyMap.jsx`** — *Removed:* display-candle rendering + bucket TF (M1), inspector window fetch (M2), M15 mode
(M3), deep-delay lifecycle labels (M4). *Risk:* **Low–Med** (mostly additive UI + new fetch effects with primitive
deps; no run-state change). *Coupling:* M1/M2/M3 need `store` loaders (S6a/b/c) + sidecarClient + backend; M2 passes
props consumed by **IntrabarInspector**; M4 needs the **resolver** deep-delay fields. M4 is independently
reintroducible (only needs resolver fields). M1/M2/M3 come as a set with store+sidecar.

**`IntrabarInspector.jsx`** — *Removed:* perf memoization (I1), count strip (I2), padding (I3), fetch states (I4),
arm-eligible marker + label stacking (I5). *Risk:* **Low** (presentational + memo). *Coupling:* I1 is standalone;
I2/I5 need resolver deep-delay fields; I3/I4 need the StrategyMap window props (M2). I1 can ship alone.

**`useResolvedScenario.js`** — *Removed:* 8 deep-delay field exposures. *Risk:* **Very low** (pure additive field
mapping). *Coupling:* none inbound; it *enables* M4/I2/I5. Safe to reintroduce first as a foundation.

---

## 5. Final table

| Feature / Fix | File(s) | Lost? | Worth restoring? | Risk |
|---|---|---|---|---|
| Lazy-shell classifiers (`isUnhydratedLazyShell` etc.) | store.js | Yes | Maybe (after Phase 2, re-validated) | **High** |
| `runHasPopulatedData` lazy guard | store.js | Yes | Maybe | **High** |
| `reloadLazyRunFromManifest` `indexOnly:false` + warnings | store.js | Yes | Maybe | **High** |
| Background `order_blocks` loader | store.js | Yes | Likely (perf) | Med |
| Auto-reload includes un-hydrated shell | store.js | Yes | Maybe | **High** |
| RunDetail auto-reload lazy shell (empty-KPI fix) | RunDetail.jsx | Yes | Maybe (with cluster) | **High** |
| Entries Lab rehydrating banner | EntriesWorkspace.jsx | Yes | **No (superseded by Phase 2)** | High (conflict) |
| Display-candle aggregation + bucket TF + pill | store.js, StrategyMap.jsx | Yes | **Yes** | Low–Med |
| Inspector 1m-window fetch | store.js, StrategyMap.jsx, IntrabarInspector.jsx | Yes | **Yes** | Low–Med |
| M15 Window mode | store.js, StrategyMap.jsx | Yes | **Yes** | Low–Med |
| Inspector perf (memo/useMemo) | IntrabarInspector.jsx | Yes | **Yes (clear bug fix)** | **Low** |
| Lifecycle count strip | IntrabarInspector.jsx | Yes | Yes | Low |
| Past/Future padding controls | IntrabarInspector.jsx | Yes | Yes | Low |
| Window fetch loading/error states | IntrabarInspector.jsx | Yes | Yes | Low |
| Arm-eligible marker + deep-delay labels | IntrabarInspector.jsx, StrategyMap.jsx | Yes | **Yes (research value)** | Low |
| Deep-delay resolver fields | useResolvedScenario.js | Yes | **Yes (foundation)** | **Very low** |
| Sidecar aggregate/range transport | sidecarClient.js (WT, uncommitted) | *Orphaned* | Yes (with consumers) | Low |

---

## 6. Highlights for the specific areas asked

- **Lazy-run rehydration:** S1–S5 (store) + RunDetail auto-reload + EntriesWorkspace banner. This is the **bucket-C**
  cluster — the most likely instability source; isolate and re-validate before reuse.
- **RunDetail KPI fixes:** no standalone KPI change — empty KPIs were a *symptom* fixed by rehydrating the shell
  (RunDetail auto-reload + store S1/S3).
- **Entries Lab variant discovery/loading:** stash = the rehydrating banner only, now **superseded by Phase 2**.
- **Strategy Map candle window:** display aggregation (M1+S6a), M15 window (M3+S6c) — valuable, coupled to
  store+sidecar+backend.
- **Intrabar Inspector:** perf fix (I1), count strip (I2), padding (I3), fetch states (I4), arm marker + deep-delay
  labels (I5) — mostly valuable + low risk; I1 ships alone.
- **Run-state classification changes:** `isLazyRun`/`isUnhydratedLazyShell`/`runHasPopulatedData`/`indexOnly:true→false`
  (bucket C).
- **Auto-reload changes:** `autoReloadIndexedRunsFromSidecar` shell inclusion + RunDetail `shouldAutoReloadRun`
  (bucket C).
- **Large-run/lazy-run handling:** background OB loader, `lazyWarnings`, display-candle cache, all three bounded
  window loaders — the **performance/large-run** half (mostly bucket D, separable from the risky C cluster).

**Suggested reintroduction order (low→high risk, when ready):** (1) resolver deep-delay fields →
(2) IntrabarInspector I1 perf fix → (3) M4/I5 deep-delay diagnostics → (4) sidecarClient transport + candle
window set (S6+M1/M2/M3+I2/I3/I4) → (5) **separately and last**, the lazy-shell/auto-reload cluster (C), re-validated.

*Audit only. No edits, nothing staged/committed/pushed. Stash `stash@{0}` is intact and untouched.*
