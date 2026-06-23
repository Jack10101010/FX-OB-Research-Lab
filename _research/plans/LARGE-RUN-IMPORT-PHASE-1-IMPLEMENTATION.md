# LARGE-RUN-IMPORT — Phase 1 (Guardrail + Lazy BE) — Implementation Report

> Stops the browser OOM on cube-scale runs and makes the 798 MB / 561-file run
> importable. No BE math, strategy, or backtester logic changed. No parser row
> shape changed. Small-bundle import is unchanged. Nothing staged or committed.

## 1. Files read (precheck)
`frontend/src/components/lab/ImportZone.jsx`, `frontend/src/data/importer.js`,
`frontend/src/data/store.js`, `frontend/src/data/sidecarClient.js`,
`frontend/src/pages/Runs.jsx`, `frontend/src/components/masterControls/bundleWalk.js`,
`Lux-OB-Backtester/sidecar/server.py` (the actual port-8787 sidecar; `backend/server.py` is only the projects API), plus the existing `/runs/{id}/bundle` + `/runs/{id}/candles` endpoints and the real cube run folder.

Repo identity verified (`Jack10101010/FX-OB-Research-Lab`, branch `codex-dev`); 9 pre-existing dirty files, none overlapping these changes; **not staged, not committed.**

## 2. Files changed
- `frontend/src/data/importer.js` (+124) — `assessBundleSize`, `LARGE_BUNDLE_THRESHOLDS`, lazy import branch, lazy metadata on the bundle, `enrichBeTradeRowsLazy`.
- `frontend/src/data/store.js` (+92) — lazy file-handle registry, `ensureBeScenarioTrades`, `registerLazyRunFiles`/`getLazyRunFileNames`, IDB skip for lazy bundles.
- `frontend/src/data/sidecarClient.js` (+13) — `getRunManifestByRunId`, `getRunFileByRunId`.
- `frontend/src/components/lab/ImportZone.jsx` (+24) — register deferred handles + "Large run detected" banner.
- `Lux-OB-Backtester/sidecar/server.py` (+163) — `GET /runs/{id}/manifest`, `GET /runs/{id}/file`, plus `build_run_manifest`, `parse_be_filename`, `count_csv_data_rows`, `resolve_run_file` (path-traversal safe).
- `frontend/src/data/__validation__/largeRunImport.validate.mjs` (new) — 28-assertion harness.

## 3. Existing import architecture (confirmed)
Folder picker → `ImportZone.handleFiles(allFiles)` → `ingestRunBundle` reads **every** file with `f.text()` and parses every row → one giant in-memory `bundle` → `addRunBundle` (memory + index-only localStorage) + `persistRunBundleToIdb` (full structured clone). The 8787 sidecar can serve `/runs/{id}/bundle` (all files at once, 413s above 25 MB) and `/runs/{id}/candles` (already windowed). 2.37 M-row candles + 522 BE files = multi-GB heap = the crash.

## 4. Exact implementation summary
**Detection (`assessBundleSize`)** flags a bundle large from file metadata alone (no reads): `file count > 50`, `total > 150 MB`, `BE files > 50`, or `candles > 25 MB`. `ingestRunBundle(files, { forceLazy, forceEager })` lets tests/callers pin the path.

**Lazy import shape.** On the large path the file loop, for any kind NOT in `LAZY_EAGER_KINDS` (`config`, `summary`, `order_blocks`, base `trades_<mode>`), **does not call `f.text()`** — it records `{name, kind, size}` (and parsed BE filename metadata into `beScenarioIndex`), stashes the raw File handle for later, and `continue`s. So only ~5 small files are parsed; candles + 522 BE + 29 entry variants are indexed, never read. The bundle gains `lazy`, `largeRunMeta`, `beScenarioIndex`, `candlesMeta`, `candlesLazy`, `provenance` (be_multiarm_enabled, reverse_touch_cancel_enabled, execution_modes); `beTradesByMode` stays `{}` and `candles` stays `null`. `beResults` (the BE **summaries** from summary.json) is still populated, so BE summary cards keep resolving EXACT.

**Sidecar.** `/runs/{id}/manifest` returns a compact index (no rows): provenance flags, config summary, BE matrix (522 scenarios parsed from filenames), available variants, primary trade files, candles meta, per-file sizes + cheap row counts (skipped above 8 MB). `/runs/{id}/file?name=` returns one file's text, guarded by `resolve_run_file` (bare filenames only; rejects `/`, `\`, `..`, non-`.csv/.json`, anything outside the folder), rejects `candles.csv` (→ use `/candles`) and files > 30 MB.

**Lazy loading + store/IDB safety.** `registerLazyRunFiles(runId, handles)` keeps File handles in a session-only Map (never persisted — they can't be cloned to IDB). `ensureBeScenarioTrades(runId, fileName)` loads ONE BE CSV on demand (File handle first, sidecar `/file` fallback after refresh), parses with the existing `parseTradesCSV` + OB enrichment, merges it into `beTradesByMode`, and de-dupes concurrent calls. `persistRunBundleToIdb` early-returns for `bundle.lazy` (no giant structured clone); `saveCandles` is naturally skipped (no candles). localStorage stays index-only.

**UI.** ImportZone shows "Large run detected — indexing metadata only" with file count / size / BE-scenarios-load-on-demand.

## 5. How large-run import avoids OOM
The two OOM sources are never materialised at import: candles.csv (2.37 M rows) is not read, and the 522 BE + 29 entry CSVs are not read or parsed — they're indexed by filename + size only. Peak heap is now ~5 small files (config, summary, order_blocks, one primary trades CSV) instead of multi-GB. The IDB full-clone is skipped for lazy runs, removing the second multi-GB copy.

## 6. How lazy BE loading works
On BE-scenario selection a consumer calls `ensureBeScenarioTrades(runId, fileName)` (filename from `beScenarioIndex`). It returns cached rows if present; otherwise reads the one CSV (session File handle → else sidecar `/file`), parses+enriches it identically to the eager path, and merges it under `beTradesByMode[mode][variant][scenarioKey]` with a single `notify()`. Empty `beTradesByMode` is already tolerated everywhere (old-bundle behaviour → REPLAY/no-data), so nothing crashes before a scenario is loaded.

## 7. What remains for Phase 2
- **Wire `ensureBeScenarioTrades` into the BE consumers** (BreakevenTab / BeTradeExplorer) with an explicit loading spinner on selection. Infra is ready; this is a small per-view call. (Left out here to honour "do not rewrite every Lab page.")
- **Frontend manifest path**: import directly from `getRunManifestByRunId` (no folder picker) so a lazy run can be created from the sidecar alone and survive refresh without File handles.
- **Lazy candles for Strategy Map** via the existing `/runs/{id}/candles` window (documented; not parsed at import today).
- **Lazy entry variants** (Entries Lab) and a bounded LRU eviction across loaded BE scenarios.
- **`bundleWalk.js`/Master Controls** guarding on cube bundles (second-order amplifier).

## 8. Validation commands/results
- Sidecar compiles: `python3 -m py_compile sidecar/server.py` → OK.
- Sidecar manifest + path safety against the **real cube** folder: file_count 561, BE scenarios **522**, provenance `{be_multiarm_enabled:true, reverse_touch_cancel_enabled:false}`, candles meta 151 MB (rows null, over cap), traversal `../config.json` / `../../etc/passwd` / `sub/dir.csv` / `foo.txt` / `..` all **blocked (400)**, valid BE file resolves, candles > 30 MB ⇒ `/file` 413s.
- Frontend harness: `node src/data/__validation__/largeRunImport.validate.mjs` → **28 passed, 0 failed** (thresholds, BE filename parse, lazy shape incl. candles-not-parsed + empty beTradesByMode + handles returned, small-bundle parity incl. eager candles + BE parse, enrichBeTradeRowsLazy).
- Regression: `beReplay` ✓, `beIntegration` ✓ (exit 0), `beConfigSerialization` ✓. `node --check` clean on importer.js / store.js / sidecarClient.js.

## 9. Git diff stat (NOT staged, NOT committed)
```
FX-OB-Research-Lab (branch codex-dev):
 frontend/src/components/lab/ImportZone.jsx |  24 +++-
 frontend/src/data/importer.js              | 124 ++++++++++++++++++-
 frontend/src/data/sidecarClient.js         |  13 ++
 frontend/src/data/store.js                 |  92 +++++++++++++-
 + frontend/src/data/__validation__/largeRunImport.validate.mjs (new, untracked)

Lux-OB-Backtester:
 sidecar/server.py | 163 +++++++++++++++++++++++++++++++++
```
(Repo has `status.showUntrackedFiles=no`, so new files appear only under `git status -uall`.)

## 10. Risks / unresolved questions
- **Consumers not yet wired to the loader.** Until Phase 2 wires `ensureBeScenarioTrades`, BE views on a lazy run show no EXACT trades (REPLAY/no-data) rather than lazily-loaded rows — correct, not a crash, but not yet the full lazy UX.
- **Refresh drops File handles.** After a reload, lazy BE loads need the sidecar `/file` endpoint (handles are session-only). If the sidecar is down, those loads fail with a clear error — acceptable for Phase 1.
- **`primaryVariant` selection.** The lazy path parses base `trades_<mode>` variants only; entry/protected/directional/control variants are deferred. Pages reading those collections see empty (no crash) until Phase 2 lazy-loads them.
- **Threshold tuning.** 50 files / 150 MB / 50 BE / 25 MB candles are conservative defaults; a mid-size legit run (~60 files) now takes the lazy path. Safe (still correct, just lazier), but tune if it surprises users.
- **Manifest row-count cap (8 MB).** Files above it report `rows:null` (candles always; large BE files never exceed it here). Cosmetic only.
- **Env note:** `fastapi` was pip-installed in the sandbox solely to exercise the sidecar helpers; no repo dependency added.
- **Did not** retry importing the 798 MB cube through the live UI (per constraint); validation used the real folder via the sidecar helpers + synthetic fixtures.
