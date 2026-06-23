# Large-Run Import / Open Regression — Audit

**Repo:** FX-OB-Research-Lab (+ Lux-OB-Backtester sidecar). **Audit only — no fixes.**

## Root cause in one line
The lazy/index-only large-run import path still exists but is **globally disabled**
(`ENABLE_LAZY_IMPORT = false`, `importer.js:1177`), and the **post-completion import handlers have no
413→lazy fallback**. So a run whose bundle exceeds the sidecar's **25 MB** cap either (a) **413s on open →
"import manually"**, or (b) when imported manually, is **eager-parsed in full on the main thread → "Page
Unresponsive."** Both reported symptoms are the same regression.

---

## A) Run-completion workflow — intended vs current

**Intended:** completed run → fetch `/bundle` → if too large, fall back to the **manifest-based lazy import**
→ run opens directly (rows/candles load on demand), regardless of size.

**Current:** `StrategyBuilder.onImportCompletedRun` (`StrategyBuilder.jsx:681-776`) calls
`getSidecarRunBundle(runJob.job_id)` (`:687`). The sidecar `/bundle` endpoint **raises 413** when the summed
artifact bytes exceed `MAX_BUNDLE_BYTES = 25 MB` (`Lux-OB-Backtester/sidecar/server.py:34`, enforced in
`read_run_bundle_files` `:693-696`, detail *"Run bundle too large for V1 auto-import; import manually."*).
The handler's `catch` (`StrategyBuilder.jsx:772-773`) just `setImportError(...)` — **no lazy fallback**. Same
shape in `MasterControlsContext.jsx:534-538` and the `ProjectDetail.jsx` sweep loops (`:240-285`, `:322-360`,
catch → `results.push({status:"failed"})`). Only **`reloadFullRunFromSidecar`** (`store.js:2690-2718`) routes
413 → `reloadLazyRunFromManifest`. The **open/import-on-completion paths do not**, so large runs now dead-end
at "import manually" (Settings → Import reads **local files directly**, bypassing the 25 MB server cap — which
is why that still works).

---

## B) Expensive synchronous work during import

Once a large bundle reaches `ingestRunBundle(files)` (`importer.js:1347`) with **lazy off**:
- `assessBundleSize` → `autoLazy = ENABLE_LAZY_IMPORT && sizeInfo.isLarge` → **always false** (`:1353-1357`),
  so `lazy=false` and the **"index heavy artifacts, never read their bytes"** branch is skipped.
- Every artifact is then **read + parsed synchronously**: `candles.csv` (~**153 MB / 2.4 M rows** for the
  6.4 y run) plus **100+ trade/BE/variant CSVs** are `await f.text()` + CSV/JSON parsed on the main thread.
- Downstream: `addRunBundle` → metadata generation, run indexing, `tradeDataToken`, equity/marker builders.
- `JSON.parse` of large payloads also occurs server-bundle-side (`getSidecarRunBundle` returns file contents
  as one JSON payload — `sidecarClient` request `JSON.parse`, `:14`) before the 413 cap, and on the candle
  path (`store.loadCandlesForRun` → `getRunCandlesByRunId`, uncapped, `store.js:2900-2943`).

Strategy Map / Protection Lab "preparation" then compounds it by pulling full candles (Strategy Map now uses
`displayCandles`; Protection Lab's BreakevenTab is now guarded), but the **import-time eager parse is the
primary freeze.**

---

## C) Recent regression candidates (commits)
`1ef050d feat(import): run-identity safety + lazy large-run import (OFF by default)`,
`845b365 fix(import): support guarded lazy loading for large sidecar runs`,
`2f8b174 feat(sidecar-client): run naming + lazy large-run fetch endpoints`,
`41b2608 fix(runs): reconcile stale run identity from sidecar`. The `LAZY-DISABLE` comment
(`importer.js:1170-1177`) states the lazy path was turned **off** because "cube-scale lazy imports caused
repeated run/data-identity regressions" — i.e. the optimization was disabled rather than fixed.

---

## D) Determinations
1. **What executes on import of a large run (e.g. 540c4dd5):** `getSidecarRunBundle(jobId)` → **413** (bundle
   > 25 MB) → handler errors ("import manually"). If imported via Settings → `ingestRunBundle` with
   `lazy=false` → **full eager parse** of candles.csv + all CSVs → freeze → `addRunBundle`.
2. **Are imports using the optimized path?** **No.** `ENABLE_LAZY_IMPORT=false` forces `autoLazy=false`; every
   normal import is eager.
3. **Is a previously-implemented optimization bypassed?** **Yes** — the LARGE-RUN-IMPORT Phase 1 lazy/
   index-only importer (and its candle/BE deferral) is bypassed by the `ENABLE_LAZY_IMPORT` flag.
4. **Did the direct post-run open regress?** **Yes** — the completion-import handlers 413 above 25 MB with no
   lazy fallback, so large runs can no longer be opened directly; manual import is required (and then freezes).

---

## Ranked top 5 regression suspects

**#1 — `ENABLE_LAZY_IMPORT = false` disables the lazy/index-only import.**
File: `frontend/src/data/importer.js:1177` (flag) + `:1353-1357` (`autoLazy` gate).
What changed: the large-bundle → lazy import was switched OFF by default (LAZY-DISABLE).
Why it breaks: large imports now eager-parse candles + all CSVs synchronously → "Page Unresponsive"; and the
"open a large run directly" capability is gone. **This is the core regression.**

**#2 — Completion/open handlers have no 413→lazy fallback.**
Files: `StrategyBuilder.jsx:681-776` (catch `:772`), `MasterControlsContext.jsx:534-538`,
`ProjectDetail.jsx:240-285` & `:322-360`. Only `store.js:2690-2718` (`reloadFullRunFromSidecar`) handles 413.
What changed: the 25 MB cap + 413 path was added, but only the *reload* route learned the fallback.
Why it breaks: a completed >25 MB run 413s on open and surfaces "import manually" instead of opening lazily.

**#3 — Sidecar `MAX_BUNDLE_BYTES = 25 MB` cap.**
File: `Lux-OB-Backtester/sidecar/server.py:34`, enforced `:693-696` (`/bundle` 413). Also job-bundle endpoint
`sidecarClient.js:63`.
What changed: a 25 MB bundle ceiling on non-candle artifacts (trades/BE CSVs sum) was introduced.
Why it breaks: it's the boundary that pushes large runs into the broken #1/#2 paths. (Correct as a guard, but
fatal without a working lazy fallback.)

**#4 — Eager `ingestRunBundle` parses candles.csv + all CSVs on the main thread.**
File: `frontend/src/data/importer.js:1347` onward (eager branch when `lazy=false`).
What changed: with #1 off, this branch runs for large bundles instead of the index-only branch.
Why it freezes: synchronous `await f.text()` + CSV/JSON parse of ~153 MB candles + 100+ trade/BE files blocks
the main thread (right-click dies, "Page Unresponsive").

**#5 — Uncapped full candle load post-import (`loadCandlesForRun`).**
File: `frontend/src/data/store.js:2900-2943` (default path, no cap). Triggered by Strategy Map / Protection
Lab / OB Retest for eager large runs.
What changed: large runs that DO import eagerly carry full `run.candles`; consumers load/parse them.
Why it compounds: a second multi-million-row parse/walk after import. (Strategy Map mitigated via
`displayCandles`; Protection Lab BreakevenTab now guarded — but the import-time parse #4 is upstream of both.)

---

## Suggested fix direction (NOT done here)
Re-enable a *hardened* lazy/index-only import for >cap bundles (fixing the identity bugs that caused
`ENABLE_LAZY_IMPORT=false`), **and** add the 413→`reloadLazyRunFromManifest` fallback to the completion/open
handlers (mirror `reloadFullRunFromSidecar`), so large runs open directly and lightly. Until then, the manual
Settings → Import of a large folder will still eager-parse and freeze.

*Audit only. No code changed, nothing staged/committed/pushed.*
