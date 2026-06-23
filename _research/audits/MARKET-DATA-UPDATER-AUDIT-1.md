# MARKET-DATA-UPDATER-AUDIT-1

**Mode:** AUDIT ONLY — no code written, no implementation, no commits.
**Date:** 2026-06-13
**Author:** Claude (system auditor)
**Scope:** Design a safe, repeatable market-data updater so the backtester dataset can be
brought from its current last candle up to the present without re-downloading/rebuilding
everything.

> **Critical scoping fact (read first).** The candle dataset, the original downloader, and
> `resample_candles()` do **not** live in this repository. They live in the **Lux-OB-Backtester /
> FX-OB-Backtester** Python repo, which is **not mounted in this session**. Only
> `FX-OB-Research-Lab` (this repo) is available. Everything below that describes the *source
> pipeline* is therefore inferred from consumption-side artifacts in this repo (run-bundle
> `config.json`, exported `candles.csv`, and the `HANDOVER-2026-06-10.md` architecture notes).
> Questions 1–10 cannot be answered authoritatively until the backtester repo is opened. The
> updater itself must be built **inside the backtester repo**, not here.

---

## PART A — Project identity & status verification

### Repository identity

| Field | Value |
|---|---|
| Repository name | **FX-OB-Research-Lab** |
| Purpose | React frontend research lab for studying order-block (OB) trading behavior via large-scale backtests. Ships with a small FastAPI backend (`backend/server.py`) that is a durable JSON/storage mirror only — **not** the backtest engine. |
| Current branch | `codex-dev` |
| Active worktree | Single worktree at the repo root (`git worktree list` → one entry, `[codex-dev]`). No parallel worktrees. |
| Remote position | `codex-dev … origin/codex-dev [ahead 15]` — 15 local commits not yet pushed. |

This **is** the FX-OB-Research-Lab trading-research frontend. Identity confirmed; proceeding.
The companion backtester repo (`Lux-OB-Backtester` / `FX-OB-Backtester`) is referenced
throughout the docs but is a separate repo and is not present here.

### 1. Current project status

Active major workstream is **Failures Lab V5 — decision layer**; per docs the remaining work
is research *interpretation*, not plumbing. The most recent commits (HEAD `fe71537`) are a
new **Research Cockpit** (`b500e36` phase 1, `fe71537` category command-centre sections) plus
an **Order Block Insights synthesis layer** (`abc5be5`) and a **V5 loss-triage decision layer**
(`1b7b17e` + follow-ups). The tree is healthy and the docs are unusually well-maintained.

### 2. Current active workstream

**Research Cockpit (COCKPIT-1 → V2.0A)** is the live focus. It is a read-only `/cockpit`
surface that aggregates existing pure analytics into ranked insight cards + category sections.
Its `WORKSTREAMS.md` charter explicitly says **"Do NOT touch: backend / exporters /
candle-data pipeline."** That matters for this audit: the market-data updater is *out of
scope* for the Cockpit stream and should be its **own new workstream**, almost certainly
owned in the backtester repo.

### 3. Recently completed workstreams (committed)

- Research Cockpit Phase 1 + category sections (`b500e36`, `fe71537`).
- Order Block Insights synthesis layer (`abc5be5`).
- Failures Lab V5 loss-triage decision layer (`1b7b17e` → `6a03912`).
- Distance-at-arm frontend consumption (`449dc58`, D-014).
- Triggered-edge entry-universe expansion → threshold sets + C0–C6 (`6a69ab4`, D-013).
- OB-Retest v2.1 monetization insights (`287dfe3`).
- Failures Lab Loser Run-Up breakdown (`2004d28`).
- Storage durable backend mirror (`ccb240e`, D-012); Selective BE + BE Trade Explorer
  (`a6b1c09`, D-011); Phase 14 Wave 1 terminology (`e9d03aa`, D-010).

### 4. Active dirty files and owning workstreams

`git status --short` (verified live; the Cockpit files that were staged earlier in the session
have since been committed on the host as `fe71537`, so the tree is now 7 unstaged files, none
staged):

| Dirty file | Likely owning workstream |
|---|---|
| `frontend/src/components/lab/ResearchContextBanner.jsx` | Research banner / Phase 14 terminology |
| `frontend/src/components/lab/ResearchRunHeader.jsx` | Research banner / Phase 14 terminology |
| `frontend/src/components/lab/researchBanner/CurrentResultViewPanel.jsx` | Research banner |
| `frontend/src/components/lab/researchBanner/ResearchBannerShell.jsx` | Research banner |
| `frontend/src/components/lab/entries/EntriesWorkspace.jsx` | Entry / FFT / Paired Runs |
| `frontend/src/components/lab/entries/shared/EntryWorkspaceHeader.jsx` (−92 lines) | Entry / FFT (header extraction/refactor) |
| `frontend/src/pages/RunDetail.jsx` (−8 lines) | **Hotspot** — shared, stage deliberately |

Net `+26 / −105` across 7 files — this looks like a banner/header consolidation (a large
deletion in `EntryWorkspaceHeader.jsx` plus small banner edits). **None of these belong to the
market-data work.** They are pre-existing dirty state from the banner/Entries streams.

### 5. Documentation drift

Low, but two points:

- `CURRENT_WORKSTREAM.md` / `PROJECT_STATUS.md` are dated **2026-06-12** and still frame the
  focus as "Failures Lab V5 interpretation." Live git shows newer work landed since:
  **Research Cockpit** (`b500e36`, `fe71537`), **OB Insights** (`abc5be5`), and the **V5
  loss-triage layer** (`1b7b17e`+). `WORKSTREAMS.md` (dated 2026-06-13) *does* capture the
  Cockpit; the two status docs trail it by a day. Minor, advisory.
- There is **no documentation anywhere in this repo of the candle data source or downloader.**
  No mention of dukascopy, histdata, or any provider. This is itself a drift/risk: a core data
  dependency is entirely undocumented on the research-lab side.

### 6. Active parallel workstreams

Per `WORKSTREAMS.md`, all parallel: Research Cockpit (active focus), Master Controls Phase 13
(committed), Protection Lab / BE, Storage mirror (committed), Session Lab, Entry / FFT / Paired
Runs, Strategy Map, OB Retest / Retest Lab, Ghost / Backend Research. **None owns market data**
— confirming the updater needs a new home.

### 7. Recommended next task

For *this request*: **open the Lux-OB-Backtester repo and run the source-pipeline audit there**
(Q1–Q10 below cannot be closed from this repo). The updater is a backend concern and per the
Cockpit charter is explicitly excluded from frontend work. Treat "Market Data Updater" as a new
workstream owned in the backtester repo, Codex-led (backend/data), with a thin Research-Lab UI
status card as a later, separate slice.

### 8. Recommended commit boundaries (for the *existing* dirty tree, not this audit)

- **Commit 1 — research-banner cluster:** `ResearchContextBanner.jsx`, `ResearchRunHeader.jsx`,
  `researchBanner/CurrentResultViewPanel.jsx`, `researchBanner/ResearchBannerShell.jsx`
  (+ the banner-related hunks of `RunDetail.jsx`, patch-staged).
- **Commit 2 — Entries header extraction:** `entries/EntriesWorkspace.jsx`,
  `entries/shared/EntryWorkspaceHeader.jsx` (+ any Entries-related hunks of `RunDetail.jsx`).
- `RunDetail.jsx` is a hotspot — **do not stage whole-file**; patch-stage per AGENTS.md §Git.
- **This audit doc** (`MARKET-DATA-UPDATER-AUDIT-1.md`) is a separate, optional docs commit; I
  have left it **uncommitted** pending your call.

*(I did not stage or commit anything — this is audit-only. The dirty files above belong to
other streams and I did not touch them.)*

---

## PART B — MARKET-DATA-UPDATER-AUDIT

### Files read for this audit

- `AGENTS.md`, `docs/ai/AGENTS.md`, `docs/ai/CURRENT_WORKSTREAM.md`,
  `docs/ai/PROJECT_STATUS.md`, `docs/ai/WORKSTREAMS.md`, `docs/ai/DECISIONS.md`,
  `docs/ai/BACKLOG.md`
- `HANDOVER-2026-06-10.md` (the only doc with concrete candle-handling notes)
- `backend/server.py`, `backend/requirements.txt`
- `test_import_bundle/config.json`, `test_import_bundle/candles.csv`,
  `test_import_bundle/summary.json` (exported run bundle — the only candle artifact present)
- `git status --short`, `git log --oneline -30`, `git worktree list`
- Repo-wide greps for `dukascopy`, `EURUSD`, `candle`, `resample`, `ohlc`, `download`, data
  providers, and CSV/parquet files.

### Existing data source — confirmation (and what cannot be confirmed)

**Confirmed from this repo:**

- The execution engine reads a master file literally named **`EURUSD_1m.csv`**
  (`HANDOVER-2026-06-10.md`: `DEFAULT_CANDLE_FILE = "EURUSD_1m.csv"`; bundle `config.json`:
  `"candle_file": "EURUSD_1m.csv"`).
- Execution timeframe is **1-minute**; OB **detection** runs on **15-minute** candles produced
  by a function called **`resample_candles()`** ("15-min detection: `resample_candles()` used
  for OB detection only; execution always 1-min").
- Symbol: **EURUSD**. Pip size `0.0001`, tick size `1e-05`.
- The candle schema (from the exported `candles.csv`) is:
  `time,open,high,low,close,volume`. Example rows:

  ```
  time,open,high,low,close,volume
  2025-05-18 21:00:00+00:00,1.11749,1.11776,1.11713,1.11758,129.285
  2026-05-18 23:00:00+00:00,1.16576,1.16581,1.16575,1.16577,27.0
  ```

  Timestamps are **ISO-8601 with an explicit `+00:00` UTC offset** (timezone-aware, UTC).
  `volume` is **fractional** (e.g. `129.285`, `27.0`) — i.e. **tick/aggregated volume, not
  integer contract volume**. This fractional-tick-volume signature is consistent with
  **Dukascopy**-style feeds, which supports (but does **not** prove**) your dukascopy/
  dukascopy-python hypothesis.

**Cannot be confirmed from this repo (must be read from Lux-OB-Backtester):**

- The actual provider/library (no `dukascopy`, `histdata`, `oanda`, `polygon`, etc. reference
  exists anywhere in this repo).
- The download script, its CLI, and how `EURUSD_1m.csv` is built.
- Where the raw 1m file and derived files physically live, and whether derived **5m/15m** files
  are persisted to disk or computed on the fly (this repo only proves a 15m *detection*
  resample exists; your "5m/15m derived" files may be a separate convention in the backtester).

> **Note on the exported `candles.csv`:** the file in `test_import_bundle/` is **15-minute**
> spacing (21:00 → 21:15 → 21:30), spans **2025-05-18 → 2026-05-18**, and is the *detection*
> resample exported alongside a single backtest run — **not** the master `EURUSD_1m.csv`. Do not
> mistake it for the source dataset.

### Existing data pipeline summary (as inferred)

```
        Lux-OB-Backtester repo  (NOT in this session)
        ┌───────────────────────────────────────────────────────┐
        │  [unknown downloader]  ──►  EURUSD_1m.csv  (master 1m)  │
        │                                   │                     │
        │                     resample_candles() (15min)          │
        │                                   │                     │
        │            OB detection (15m) + execution (1m)          │
        │                                   │                     │
        │                       backtest run  ──►  run bundle:    │
        │                       config.json / candles.csv /       │
        │                       summary.json / trades_*.csv       │
        └───────────────────────────────────────────────────────┘
                                            │  import
                                            ▼
        FX-OB-Research-Lab (this repo): importer.js ingests the bundle
```

### Data freshness status

- Most recent run bundle (`config.json`) was configured `start_date 2025-05-18` →
  `end_date 2026-05-18`, and its exported `candles.csv` last row is `2026-05-18 23:00:00+00:00`.
- Today is **2026-06-13** → the dataset is **~26 days (nearly a month) stale**, matching your
  description.
- **Caveat:** that 2026-05-18 figure is the *run's configured end_date / exported window*, not
  necessarily the true last candle in the master `EURUSD_1m.csv`. The authoritative freshness
  number must be read from the master file in the backtester (the updater's first job).

---

## Answers to the 13 questions

1. **Current candle data source?** A master CSV `EURUSD_1m.csv` (EURUSD, 1-minute, UTC,
   fractional tick-volume). The *provider* is undocumented here; the fractional-volume + UTC
   signature is **consistent with Dukascopy**, but unconfirmed. **Action: confirm in the
   backtester** (look for the download script / library import). **Do not assume dukascopy.**
2. **What originally downloaded the data?** Unknown from this repo — no downloader, no provider
   reference exists here. Must be located in the backtester (search there for `dukascopy`,
   `requests`, `download`, `fetch`, `EURUSD_1m`).
3. **Where are raw candles stored?** Not in this repo. In the backtester, alongside
   `DEFAULT_CANDLE_FILE = "EURUSD_1m.csv"` (path TBD — likely a `data/` dir).
4. **Where are derived 5m/15m candles stored?** This repo proves only a **15m detection
   resample computed in-memory** via `resample_candles()`. Whether 5m/15m are *persisted* files
   is a backtester convention to confirm. If they are recomputed each run, "derived files" may
   be a cache you are introducing, not an existing artifact.
5. **Timestamp format & timezone?** ISO-8601, **UTC, timezone-aware with explicit `+00:00`**
   (`2026-05-18 23:00:00+00:00`). Columns: `time,open,high,low,close,volume`; `volume`
   fractional.
6. **Latest candle currently available?** Inferred ~`2026-05-18 23:00 UTC` from the latest run
   bundle (≈26 days stale). **Authoritative value = tail of master `EURUSD_1m.csv`** — read it
   in the backtester before trusting this.
7. **Can the source be updated programmatically?** Almost certainly yes **if** the source is
   Dukascopy/dukascopy-python (free historical 1m bars, append-friendly). Confirm the provider
   first; if it's a one-off manual export (e.g. histdata), incremental update may need a
   different fetch path. This is the single biggest unknown gating the design.
8. **Command to update missing candles only?** Proposed (Phase 1, runs **in the backtester**):
   ```
   python3 scripts/update_market_data.py --symbol EURUSD --source existing --timeframe 1m
   ```
   Reads the master tail, fetches only `(last_candle, now)`, appends, de-dupes, gap-checks,
   regenerates derived files, updates a manifest, prints a summary.
9. **How to detect gaps/duplicates?** **Duplicates:** dedupe on the `time` key, keep last,
   assert monotonic strictly-increasing timestamps. **Gaps:** build the expected 1-minute grid
   between first and last candle, subtract **legitimate market closures** (FX weekend
   Fri ~21:00 UTC → Sun ~21:00 UTC, plus known holidays), and report only the *unexpected*
   missing minutes. Never "fill" gaps with synthetic candles — report them.
10. **How to regenerate derived 5m/15m?** Deterministically from the canonical 1m via standard
    OHLCV resampling: `open=first, high=max, low=min, close=last, volume=sum`, on **left-closed,
    left-labeled** UTC bins (`resample('5min'/'15min', label='left', closed='left')`), dropping
    incomplete trailing bins. Regenerate the full derived files (cheap) rather than appending, so
    they can never drift from the 1m source. Reuse the backtester's existing `resample_candles()`
    if its binning convention matches — **verify the convention** so detection results stay
    byte-stable.
11. **Create a dataset manifest?** **Yes.** A small JSON (e.g. `data/EURUSD_manifest.json`):
    symbol, source, source-version/library, timeframe, first_candle, last_candle, row_count,
    last_updated (UTC), sha256 of the 1m file, derived-file list + their last_candle/row_count,
    gap summary, and the partial-last-bar flag. The manifest is what makes "is it stale?"
    answerable without parsing the whole CSV.
12. **How should the Research-Lab UI know data is stale?** Read the manifest (not the CSV).
    Expose it via the existing FastAPI backend (e.g. `GET /market-data/status` returning the
    manifest), and render a status card. **Do not** make the frontend parse candle files.
    Compute `data_age = now − last_candle` and badge **fresh / stale / very stale** by threshold.
13. **Terminal-only first, UI later?** **Yes — strongly.** Phase 1 = a robust, idempotent
    terminal updater in the backtester (correctness, dedupe, gap-checks, manifest). Phase 2 =
    read-only Research-Lab status card. An "Update" button is Phase 3 at the earliest and should
    shell out to the same script — never reimplement the update logic in JS.

---

## Safe updater design

**Principles**

- **Idempotent & incremental.** Re-running with no new data is a no-op. Only `(last_candle, now)`
  is fetched.
- **Append-only to a canonical source.** The 1m master is the single source of truth; derived
  files are always *regenerated* from it, never independently appended.
- **Atomic writes.** Write to a temp file, validate, `fsync`, then atomically rename over the
  target. Never leave a half-written master.
- **Backup before mutate.** Snapshot the existing `EURUSD_1m.csv` (timestamped copy) before any
  write, so a bad fetch is trivially recoverable.
- **Exclude the partial current bar.** The in-progress current-minute (and current week's
  partial higher-TF bar) must be dropped — appending a partial candle silently corrupts research.
- **Report, never fabricate.** Gaps are surfaced in the summary + manifest; the updater never
  invents candles.
- **Timezone-pinned.** Everything in UTC, timezone-aware; reject/parse-normalize any naive
  timestamps.

**Pipeline (Phase 1 terminal command)**

1. Load manifest + tail of `EURUSD_1m.csv`; determine `last_candle` (authoritative).
2. Back up the current master (timestamped copy).
3. Fetch `(last_candle + 1min, now)` from the confirmed source.
4. Normalize to the canonical schema/UTC; **drop the partial current bar**.
5. Concatenate, **de-duplicate** on `time` (keep last), assert strictly monotonic.
6. **Gap-check** against the expected 1m grid minus FX-closure calendar.
7. Atomic-write the new master.
8. **Regenerate** derived 5m/15m from the new 1m (full rebuild) + atomic-write.
9. Recompute manifest (hashes, first/last, counts, gaps, partial flag) + atomic-write.
10. Print summary: **old last candle · new last candle · rows added · gaps found · duplicates
    removed · derived files regenerated**.

---

## Proposed file/folder structure (inside Lux-OB-Backtester)

```
Lux-OB-Backtester/
├── data/
│   ├── EURUSD_1m.csv                  # canonical 1m master (existing)
│   ├── EURUSD_5m.csv                  # derived (regenerated)
│   ├── EURUSD_15m.csv                 # derived (regenerated)
│   ├── EURUSD_manifest.json           # NEW — dataset manifest
│   └── _backups/EURUSD_1m.<ts>.csv    # NEW — pre-write snapshots
├── scripts/
│   └── update_market_data.py          # NEW — Phase 1 terminal updater (CLI)
└── src/market_data/                   # NEW — testable internals
    ├── source_existing.py             # provider adapter (e.g. dukascopy) — confirm first
    ├── resample.py                    # reuse/align with existing resample_candles()
    ├── integrity.py                   # dedupe + gap detection + FX-closure calendar
    └── manifest.py                    # read/write/verify manifest
```

*(Exact paths depend on the backtester's real layout — adjust to its conventions on first read.)*

---

## Exact implementation plan

- **Phase 0 — Source audit (backtester repo).** Locate the downloader; confirm provider/library
  (dukascopy vs other); confirm where `EURUSD_1m.csv` lives, its true last candle, and whether
  5m/15m are persisted or recomputed. **Gate: do not build until the source is confirmed.**
- **Phase 1 — Terminal updater.** Build `scripts/update_market_data.py` + `src/market_data/*`
  with the pipeline above. Backup → fetch-incremental → dedupe → gap-check → atomic append →
  regenerate derived → manifest → summary. Unit tests on synthetic candles (gap, dup,
  partial-bar, weekend-closure, no-new-data no-op).
- **Phase 2 — Read-only UI status.** Add `GET /market-data/status` to `backend/server.py`
  (serves the manifest) + a Research-Lab status card (Symbol · Source · First candle · Last
  candle · Data age · Gap status). No update trigger yet.
- **Phase 3 (later) — UI update button.** Button shells out to the same Phase-1 script via a
  backend endpoint; streams the summary back. Same logic, no JS reimplementation.

---

## Risks

- **Bad / missing candles.** A provider hiccup can return short or empty ranges. Mitigation:
  backup-before-write, atomic rename, post-write validation (monotonic, schema, row-count delta
  sane), and refuse to overwrite if the new file is shorter than the old.
- **Timezone mismatch.** Source data may arrive naive or in a non-UTC zone; mixing breaks the
  `+00:00` convention and corrupts OB detection alignment. Mitigation: force UTC tz-aware parse,
  assert all timestamps carry `+00:00`, reject naive input.
- **Source changes.** Provider schema/endpoint/library API can change (column order, volume
  semantics, rate limits). Mitigation: a thin **source adapter** (`source_existing.py`) isolates
  the provider; schema asserted on every fetch; pin the library version.
- **Partial current-day / current-bar candles.** The newest 1m bar (and the current partial
  week for 15m) is incomplete; appending it injects look-ahead/garbage into research.
  Mitigation: always drop the trailing partial bar; record a `partial_last_bar` flag in the
  manifest.
- **Broker / source differences.** Bid vs mid vs ask, and venue differences, mean a *different*
  source will not stitch seamlessly onto the existing history (price/volume discontinuity at the
  join). Mitigation: **update from the same source the history was built with**; if the source
  must change, re-download the whole series rather than splice, and flag the provenance break in
  the manifest. This is exactly why confirming the original provider (Phase 0) is mandatory.
- **Derived drift.** If 5m/15m were ever appended independently they could diverge from the 1m.
  Mitigation: always full-regenerate derived from 1m; never append to derived.
- **Resample-convention mismatch.** If the updater's resample binning differs from the
  backtester's `resample_candles()`, detection results change. Mitigation: reuse/align with the
  existing function and verify byte-stable detection on a known run.

---

## Recommended first implementation prompt

Use this **inside the Lux-OB-Backtester repo** (it is a Phase-0 audit prompt — still no code):

> **MARKET-DATA-UPDATER — PHASE 0 SOURCE AUDIT (backtester repo, AUDIT ONLY).**
> Verify repo identity (name, purpose, branch). Then locate and report the candle data
> pipeline. Search for: `dukascopy`, `EURUSD_1m`, `EURUSD_1m.csv`, `resample_candles`, any
> `download`/`fetch` script, `data/` directories, and any manifest/progress files. Answer
> authoritatively: (1) exact data source + library/provider and its version; (2) the script
> or process that originally produced `EURUSD_1m.csv`; (3) absolute path(s) where the 1m master
> and any derived 5m/15m live, and whether derived files are persisted or recomputed per run;
> (4) the true last candle timestamp (tail of the master file) and current data age vs today;
> (5) confirmed timestamp format + timezone; (6) whether the source supports incremental/
> programmatic updates and any rate limits; (7) the exact binning convention of
> `resample_candles()` (label/closed/dropna) so derived regeneration stays byte-stable.
> Deliver: files read, confirmed source, pipeline summary, freshness status, and a green/red
> go-decision on building the Phase-1 terminal updater. **Do not write or modify any code.**

---

*Audit complete. No files staged, no commits made, no implementation performed. This audit doc
is left uncommitted pending your decision on where (and whether) to record it.*
