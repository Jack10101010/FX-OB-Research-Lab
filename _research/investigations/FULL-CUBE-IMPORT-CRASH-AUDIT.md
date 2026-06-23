# FULL-CUBE-IMPORT-CRASH-AUDIT

> Audit only. No code edited, no import retried, no data deleted. Findings are
> grounded in the actual run folder
> `outputs/runs/20260613_162437_EURUSD_15min_RR3.3_SB1` (561 files, 798 MB).

## 1. Exact cause hypothesis
**Renderer out-of-memory during eager in-browser parse.** "Aw, Snap! Error code: 5" is Chrome's renderer-process-killed page (SIGKILL/OOM), and the sidecar evidence (health OK, `active_job_id:null`, no `lsof` handle on the folder) confirms the sidecar was uninvolved — **the crash is 100% browser-side.**

The folder picker hands **all 557 CSVs** to `ingestRunBundle()`, which reads every file with `await f.text()` and parses every row into rich JS objects held in one in-memory `collected`/`bundle`. On-disk reality:
- `candles.csv` = **145 MB / 2,372,362 rows** → `parseCandlesCSV` builds ~2.37 M objects.
- **522 BE trade CSVs** (~1.4 MB each, ≈730 MB of text), each row parsed by `parseTradesCSV` into a **~150-key, dual-keyed (snake_case + camelCase)** object.

Decoded JS heap runs ~5–10× raw text (object headers, boxed strings, doubled keys), and the pipeline copies the data several times (parse → `enrichTradesWithOrderBlocks` re-maps every array → `addRunBundle` → `persistRunBundleToIdb` structured-clones the whole bundle for IndexedDB). 798 MB of text therefore expands to **multiple GB of live heap**, exceeding Chrome's ~2–4 GB per-renderer ceiling → OOM kill. The two dominant contributors are the **2.37 M-row candles.csv** and the **522 eagerly-parsed BE files**; either alone is close to the limit, together they guarantee it.

## 2. Files read
`frontend/src/data/importer.js` (parsers + `ingestRunBundle`), `frontend/src/components/lab/ImportZone.jsx`, `frontend/src/pages/Runs.jsx`, `frontend/src/data/store.js` (`addRunBundle`, `persistRuns`, `persistRunBundleToIdb`, `reloadFullRunFromSidecar`), `frontend/src/data/sidecarClient.js`, `frontend/src/components/masterControls/bundleWalk.js`, `backend/server.py`, plus the run folder's `manifest.json` / `summary.json` / file inventory.

## 3. Existing import architecture
- **Entry:** `ImportZone` folder picker (`webkitdirectory`) → `handleFiles(allFiles)` → `ingestRunBundle(fileList)`.
- **Parse (browser):** one `for` loop, `await f.text()` per file, `detectFileKind` routes each to a parser. Everything accumulates in `collected` (candles, orderBlocks, `tradesByVariant`, nested `beTradesByMode[mode][variant][scenario]`, entry/protection/directional/control sets).
- **Assemble:** `enrichTradesWithOrderBlocks` re-maps **every** trade array; equity curves + trade markers computed for every variant; one giant `bundle` returned.
- **Store:** `addRunBundle(bundle)` → full bundle into `state.runs[id]` (memory) + auto-activate. `persistRuns()` writes an **index-only** localStorage manifest. Candles → IndexedDB `candles` store (`saveCandles`). Full bundle (candles stripped) → IndexedDB `runs` store (`persistRunBundleToIdb`, structured clone).
- **Sidecar (port 8787, separate from `backend/server.py`):** `/health`, `/runs` (list/start), `/runs/{id}`, `/runs/{id}/bundle` (returns **all file contents** as JSON), `/runs/{id}/candles?start&end&limit` (**already windowed**), `/outputs/latest`. The reload path `reloadFullRunFromSidecar` still funnels the full bundle back through `ingestRunBundle` → same blow-up.

## 4. Answers to the specific questions
1. **Where does import happen?** Parsing/assembly is **entirely in the browser**. The sidecar only optionally *serves* file contents; it does no parsing/indexing.
2. **All 557 CSVs into memory at once?** **Yes** — `ingestRunBundle` loops over the whole list, parsing each into retained objects.
3. **Parses candles.csv eagerly?** **Yes** — the folder picker includes it; `parseCandlesCSV` builds ~2.37 M objects unconditionally during import (Strategy Map not required).
4. **Parses every BE CSV eagerly?** **Yes** — all 522 routed through `parseTradesCSV` into the nested `beTradesByMode` map; none are deferred.
5. **Stores everything in IndexedDB/localStorage?** localStorage = **index-only** (small, safe). IndexedDB = **full bundle** (all trades incl. 522 BE scenarios) via `persistRunBundleToIdb`, plus candles in a separate store. This is an *additional* full structured-clone copy on top of the in-memory bundle.
6. **Renders a huge object immediately?** Not a giant list directly — but `addRunBundle` auto-activates the run and `notify()`s every subscriber; downstream Lab pages then derive over the full in-memory collections. The fatal step precedes render: it's the parse/copy peak.
7. **Sidecar capable of server-side indexing/import?** **Partially today, fully feasible.** It already enumerates runs and serves windowed candles (`/runs/{id}/candles?start&end&limit`) — the exact precedent needed. It does **not** yet emit a compact manifest or per-file lazy CSVs; `/bundle` returns everything at once. Adding a manifest + per-file endpoints is straightforward.
8. **Where is imported run metadata stored?** localStorage `LS_RUN_INDEX` (compact per-run index entries from `buildRunIndexEntry`); full data in memory + IndexedDB `runs`/`candles` stores. The backend run folder also already contains a small `manifest.json` (run_id, status, config hashes, `scenario_plan_summary`, timings) — a foundation to extend.
9. **Did the failed import leave partial state?** **Most likely none.** `addRunBundle` (the only writer of the index + IDB) runs **after** `ingestRunBundle` returns; an OOM during parse means it never executed → no localStorage index entry, no IDB record. If the crash instead landed during `persistRunBundleToIdb` (after `persistRuns`), a tiny localStorage index stub and a partial IDB record could exist — both harmless and overwritten on a clean re-import. *Non-destructive check (do not delete):* DevTools → Application → Local Storage key `LS_RUN_INDEX` for an entry with this run id, and IndexedDB `runs` store. No cleanup is required either way.
10. **Largest previously-supported bundle?** This is the **first cube-scale import**. Prior bundles were single-config or small matrices — a handful to low-tens of trade CSVs, modest candle counts (the BE smoke bundle and `test_control_run` outputs). At ~561 files / 798 MB / 2.37 M candles / 522 BE scenarios this run is ~1–2 orders of magnitude larger than anything the eager path was built for; no prior run approached it.

## 5. Where the memory blow-up happens (ranked)
1. **`parseCandlesCSV` on 2.37 M rows** — ~0.4–0.6 GB of objects, none of it needed at import time.
2. **522 BE files × ~150-key dual-keyed rows** — the largest aggregate; ~hundreds of thousands of trade objects with doubled keys.
3. **`enrichTradesWithOrderBlocks`** — re-maps every trade array (transient 2× copy of the biggest collections).
4. **`persistRunBundleToIdb` structured clone** — another full copy of all trades into IndexedDB.
5. **Secondary (post-import):** `bundleWalk.js` (Master Controls preview) copies the "canonical six" trade collections again on any lens — a cube bundle would also choke it (note: it does *not* walk `beTradesByMode`).

## 6. Proposed large-run import architecture
**Principle: the browser receives a manifest + summaries, never the raw cube. Heavy rows live server-side and are fetched lazily, per active view.**

- **Sidecar builds the index.** New `GET /runs/{id}/manifest` returns a compact JSON (no row data): run id, config summary, **provenance flags** (`reverse_touch_cancel_enabled`, `be_multiarm_enabled`, execution modes), variants available, **BE matrix metadata** (arms, triggers, entry variants, scenario keys), per-file relative paths + **row counts** (cheap line-count), and the existing `summary.json`/`manifest.json` essentials. Reuse the run folder's `manifest.json` + `summary.json` as the backbone.
- **Frontend imports the manifest only** → a **lazy run stub** in `state.runs[id]` (`lazy: true`, file-path map, scenario index). No candles, no BE rows, no per-variant trade arrays at import.
- **Lazy, on-demand loaders.** A view asks for exactly what it needs: `GET /runs/{id}/file?name=trades_…__be_wick_0p50R.csv` (one CSV), parsed by the *existing* `parseTradesCSV` and cached (LRU, bounded). Candles via the **existing** `/runs/{id}/candles?start&end&limit` — only when Strategy Map opens, windowed to the visible range. BE matrix cells fetched only for the selected mode/variant/scenario.
- **Bounded memory + eviction.** Keep only the active variant/scenario(s) resident; evict on switch. Never hold all 522 BE arrays at once.
- **Progress + guardrail.** Stream import progress (files indexed / parsed). If a dropped bundle exceeds thresholds (e.g. **> ~150 MB or > ~50 files**, or candles row-count over a cap), block the eager path and require/route the sidecar manifest path, with a clear UI explanation.
- **Compatibility.** Preserve the bundle shape consumers expect, but allow collections to start empty and fill asynchronously (loading states), so Lab pages don't need rewrites — they read the same keys, populated lazily.

## 7. Minimal Phase 1 implementation plan (stop the crash first)
Smallest change that makes the cube importable, without the full lazy refactor:
1. **Guardrail in `ImportZone`/`ingestRunBundle`:** compute `files.length` + total bytes; above threshold, **do not parse candles.csv and do not parse BE CSVs** during import. Load only the small required set — `config.json`, `summary.json`, `order_blocks.csv`, the **primary** `trades_*` variant(s) — and record the *paths/row-counts* of the skipped BE/candle files into the bundle (so the BE matrix knows what exists). Show a banner: "Large run — BE scenarios and candles load on demand."
2. **Lazy BE loader:** when a Lab view selects a BE scenario, fetch + parse that **one** CSV on demand (sidecar `/file` endpoint, or the picker's `File` handle if still in session) and cache it.
3. **Defer candles:** parse candles only when Strategy Map mounts, windowed via the existing `/runs/{id}/candles` endpoint.
4. **Progress reporting:** per-file counter during the (now small) import.
5. **Add `GET /runs/{id}/manifest` + `GET /runs/{id}/file?name=` to the 8787 sidecar** to back (1)–(3) cleanly. (Manifest can be assembled from the existing `manifest.json` + `summary.json` + a directory listing with line counts.)

Phase 1 explicitly does **not** rewrite every consumer; it caps what import pulls into memory and adds the two endpoints + lazy loaders. The full manifest-only architecture (§6) is Phase 2.

## 8. Risks
- **Consumer assumptions:** many Lab pages assume `bundle.beTradesByMode` / `candles` are fully present. Lazy loading must return loading/empty states without throwing; audit each consumer before flipping defaults.
- **Bundle-shape churn:** changing to lazy stubs risks regressions across the store hydration, IndexedDB mirror, and `reloadFullRunFromSidecar` (which also routes through `ingestRunBundle`). Keep the shape; fill lazily.
- **IndexedDB quota:** even index-only + windowed candles can be large; `persistRunBundleToIdb` must skip the heavy collections for lazy runs or it reintroduces the multi-GB clone.
- **Session-only file handles:** drag/drop `File` objects don't survive refresh; lazy reload then *requires* the sidecar — acceptable, but the UX must say so when the sidecar is down.
- **Master Controls (`bundleWalk.js`) and equity/marker precompute** remain second-order blow-ups on cube bundles even after import is fixed; gate or window them too.
- **Dual-key parse overhead** (snake+camel on ~150 fields) roughly doubles per-row memory; worth trimming for the cube path but out of Phase 1 scope.
- **Partial-state check is non-destructive** but must be done by hand in DevTools; do not auto-clear (constraint).

## 9. Recommended next implementation prompt
> **LARGE-RUN-IMPORT-PHASE-1-GUARDRAIL-AND-LAZY-BE**
> Implement the crash guardrail + lazy loading for cube-scale runs. (a) In `ImportZone`/`ingestRunBundle`, detect large bundles (files > ~50 or total > ~150 MB, or candles row-count over a cap) and, on that path, parse only `config.json`, `summary.json`, `order_blocks.csv`, and the primary `trades_*` variant; record paths + row counts of skipped candles/BE files into the bundle; show a "loads on demand" banner; add per-file import progress. (b) Add sidecar `GET /runs/{id}/manifest` (compact index incl. `reverse_touch_cancel_enabled`/`be_multiarm_enabled`, variants, BE matrix metadata, file paths, row counts) and `GET /runs/{id}/file?name=` (single CSV). (c) Lazy-load a BE scenario CSV on selection and candles (windowed) only when Strategy Map opens; cache with bounded eviction. Keep the bundle shape; make consumers tolerate empty-then-filled collections. Ensure `persistRunBundleToIdb` skips heavy collections for lazy runs. Do not change BE math or the parsers' row shape; do not regress small-bundle import. Add tests for the guardrail threshold, manifest shape, and lazy BE fetch+cache.

### Bottom line
The crash is a deterministic browser OOM from eagerly parsing a 2.37 M-row candles file plus 522 BE CSVs into one multi-GB in-memory bundle. The fix is architectural, not a tweak: index server-side, send the browser a manifest, and lazy-load candles/BE per active view. Phase 1 (guardrail + skip candles/BE at import + two sidecar endpoints + lazy loaders) stops the crash with minimal surface area; the manifest-only path is Phase 2. No partial state needs cleanup.
