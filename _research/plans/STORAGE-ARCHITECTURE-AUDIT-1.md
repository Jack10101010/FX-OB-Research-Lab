# Durable Backend Storage — Architecture Audit & Design (STORAGE-1)

**MODE:** AUDIT + DESIGN ONLY — no implementation, no behavior changes.
**DATE:** 2026-06-11
**GOAL:** Move important research data off browser-only storage onto a durable, local-first backend that survives browser-data clears, browser changes, reloads, desktop packaging, and scale-up.

---

## 0. Current persistence layers (the lay of the land)

The app currently spreads state across **four** layers, only one of which is durable outside the browser:

| Layer | Scope | Durable outside browser? | What lives here |
|---|---|---|---|
| **localStorage** | per-origin, per-browser | ❌ lost on clear / new browser | projects, findings, playbook, hypotheses, roadmaps, configs, settings, run index, **+ all UI prefs** |
| **IndexedDB** (`artifactStore.js`, DB `fxob`, stores `runs` + `candles`) | per-origin, per-browser | ❌ lost on clear / new browser | full run bundles (trades/variants/OBs) and candle arrays |
| **Sidecar @ 127.0.0.1:8787** | local compute service (source NOT in this repo) | ⚠️ partial — re-derives run data | runs the backtester; serves run bundles/candles/outputs. Compute, not a user-data store |
| **FastAPI @ 127.0.0.1:8000** (`backend/server.py`) | local service, in repo | ✅ `backend/data/projects.json` | **only** projects/findings, just added (STORAGE-0). Mongo is optional/unused |

The core problem: everything a researcher *creates* (decisions, insights, hypotheses, roadmaps, saved configs) is in localStorage or IndexedDB — both wiped by clearing site data or switching browsers, and neither survives desktop repackaging.

---

## 1. Current localStorage inventory

Every key found in `frontend/src` (grouped). Versioned suffixes (`_v1`, `_v2`) preserved.

### Research data the user creates (durable-critical)
| Key | Owner file | Contents |
|---|---|---|
| `fxob_projects` | `data/store.js` | Projects + **findings/insights** (per-project array) |
| `fxob_playbook_v1` | `data/playbookStore.js` | Per-run Run Analysis Playbook checklist + decision outcome |
| `fxob_entry_hypotheses_v1` | `EntryHypothesisLab` / failures bridge | Saved entry hypotheses |
| `fxob_entry_promotion_v1` | `entries/promotion/PromotionDesk.jsx` | Promotion-desk decisions |
| `fxob_section_roadmaps_v1` | `data/roadmapStore.js` | Per-section research roadmap / future-idea status |
| `fxob_configs` | `data/presets.js` | Saved Strategy Builder config presets |
| `fxob_session_lab_rules_v1` | `session/SessionLabWorkspace.jsx` | Saved session-filter rules |
| `fxob_failures_saved_views_v1` / `fxob_failures_views_v1` (legacy) | `failures/workspace/ViewManager.jsx` | Saved forensic views |
| `fxob_entries_workspace_family_groups_v1` | `entries/model/ExactResultsPanel.jsx` | User-defined model family groupings |

### Run data (durable-critical, currently browser-only)
| Key / store | Owner | Contents |
|---|---|---|
| `fxob_runs_index_v1` | `data/store.js` | Lightweight run **index** (metadata stubs) |
| `fxob_run_v1:<id>` | `data/store.js` | Legacy per-run blobs (migrated to index) |
| `fxob_runs` (legacy `LS_KEY`) | `data/store.js` | Legacy full-runs blob (deprecated) |
| IndexedDB `runs` store | `artifactStore.js` | Full run bundles |
| IndexedDB `candles` store | `artifactStore.js` | Candle arrays (heavy) |

### Workspace / draft state (semi-durable — “nice to keep”)
| Key | Contents |
|---|---|
| `fxob_active_run_id` | Last active run |
| `fxob_active_project_id` | Last active project |
| `fxob_scenario_v1` | Active scenario / selected result-view per run |
| `fxob_results_basis_v1` | Results basis (Raw R etc.) |
| `fxob_strategy_builder_last_config` / `fxob_strategy_builder_last_run` | Last builder draft |

### User settings (durable, small)
| Key | Contents |
|---|---|
| `fxob_account_settings_v1` (+ legacy `fxob_account_view_settings_v1`) | Account/equity settings |
| `fxob_funding_challenge_settings_v1` | Funding-challenge parameters |
| `fxob_theme` | Light/dark theme |

### Pure UI / view preferences (keep in localStorage)
`fxob_sidebar_collapsed_v1`, `fxob_mc_docked_v1`, `fxob_playbook_docked_v1`, `fxob_run_config_strip_open_v1`, `fxob_run_research_strip_open_v1`, `fxob_run_detail_session_split_open_v1`, `fxob_runs_sort_v1`, `fxob_overview_scope_v1`, `fxob_bucket_col_vis_v2`, `fxob_strategy_map_ui_v1`, `fxob_strategy_map_inspector_pos_v1`, `fxob_strategy_map_inspector_view_v1`, `fxob_failures_drilldown_ui_v1`, `fxob_failures_workspace_ui_v1`, `fxob_failures_workspace_filters_v1`, `fxob_entries_workspace_tab_state_v1`, `fxob_entries_workspace_filters_v1`, `fxob_entries_workspace_model_selection_v1`, `fxob_entries_workspace_exact_columns_v1`, `fxob_entries_workspace_exact_sort_v1`, `fxob_session_lab_direction_v1`, `oblab-active-tab-v1`, `oblab-filters`, `fxob.failures.distanceToStop.explorer.v1`, per-component `PERSIST_PREFIX + testId` strip toggles.

> Note: `triggeredEdgeCancelOnFirstFailedTag` / `rr` are **config draft keys**, not localStorage keys (Master Controls in-memory drafts) — excluded.

---

## 2. Data classification

| Class | Definition | Keys | Migration target |
|---|---|---|---|
| **A. Critical durable** | User-authored research data; loss = real work lost | `fxob_projects`, `fxob_playbook_v1`, `fxob_entry_hypotheses_v1`, `fxob_entry_promotion_v1`, `fxob_section_roadmaps_v1`, `fxob_configs`, `fxob_session_lab_rules_v1`, `fxob_failures_saved_views_v1`, `fxob_entries_workspace_family_groups_v1` | **Backend (system of record)** |
| **A′. Critical durable (run data)** | Imported/backtested results; expensive to recreate | `fxob_runs_index_v1`, IndexedDB `runs` + `candles` | **Backend metadata index + artifact files** (candles can stay re-derivable via sidecar) |
| **B. User settings** | Small durable preferences that should follow the user | `fxob_account_settings_v1`, `fxob_funding_challenge_settings_v1`, `fxob_theme` | **Backend** (low priority) |
| **C. Workspace/session state** | Convenience continuity; tolerable to lose | `fxob_active_run_id`, `fxob_active_project_id`, `fxob_scenario_v1`, `fxob_results_basis_v1`, `fxob_strategy_builder_last_*` | Backend optional; **localStorage fine** |
| **D. UI preference / view state** | Cosmetic; per-device by nature | all keys in §1 “Pure UI” | **Stay in localStorage** |
| **E. Cache / re-derivable** | Can be rebuilt from source | IndexedDB `candles`, full bundles re-fetchable from sidecar | **Cache only** (file-cache acceptable) |

---

## 3. What should move to the backend first

Priority by *value-at-risk × frequency-of-creation × low-migration-risk*:

1. **Projects + findings/insights** — already half-migrated (STORAGE-0). Finish hardening it as the reference pattern.
2. **Playbook reviews** (`fxob_playbook_v1`) — per-run research decisions; directly tied to insights.
3. **Saved hypotheses + promotions** — explicit research artifacts.
4. **Roadmap state** — explicitly named in the requirement.
5. **Saved configs/presets** (`fxob_configs`) — user-built strategy configs.
6. **Run metadata index** — so the run list survives without the sidecar/browser.
7. **User settings** — account, funding challenge, results basis.

Everything in classes **C/D/E** stays in localStorage/IndexedDB for now.

---

## 4. What can safely remain in localStorage

All **class D** UI preferences (sidebar, dock, tab/filter/sort/column state, inspector positions, strip toggles, theme-as-cosmetic), all **class C** workspace continuity keys, and **class E** caches (IndexedDB candles + full-bundle cache). These are per-device by nature, cheap to lose, and moving them adds latency/complexity with no durability benefit.

---

## 5. Existing backend options — assessment

| Option | What it is | Verdict for durable storage |
|---|---|---|
| **Sidecar @ 8787** | External compute service (backtester). Source not in this repo. Stateless w.r.t. user data; produces run outputs | **Keep as compute only.** Don’t make it own durable user state — it’s heavy, external, and not editable here |
| **FastAPI @ 8000 (`backend/server.py`)** | In-repo, editable, now serves `projects.json`, Mongo-optional, CORS-ready | **Best home for the unified storage service.** Already the foothold |
| **`backend/server.py`** | Currently: `/api/projects` (file) + legacy `/api/status` (Mongo, unused) | Extend into the Research Store API |
| **Mongo scaffolding** | `motor` client, no schema/routes, no data, requires a running Mongo | **Drop for local-first.** A server dependency conflicts with “simple, inspectable, desktop-packageable” |
| **`backend/data/`** | Holds `projects.json` (gitignored) | The data root for the unified store |

**Two-backend reality:** the current split is *compute (8787)* vs *storage (8000)*. That split is actually healthy and should be the **intended end-state** — but the storage side must be promoted from “one JSON file” to a real, single, domain-owning service. Do **not** assume today’s thin 8000 is final; do assume 8787 stays the backtester.

---

## 6. Recommended unified storage architecture

**One local “Research Store” service (FastAPI on 8000) owns all durable state. The 8787 sidecar remains the stateless backtester and hands its results to the Research Store.**

```
┌────────────┐    start run / fetch bundle    ┌──────────────────┐
│  Frontend  │ ─────────────────────────────► │  Sidecar  :8787  │  (compute only)
│  (React)   │ ◄───────────────────────────── │  backtester       │
│            │        run bundle/candles       └──────────────────┘
│  store.js  │
│            │    durable read/write (REST)   ┌──────────────────┐
│            │ ─────────────────────────────► │ Research Store    │  (system of record)
│ localStorage│◄────────────────────────────  │  FastAPI :8000    │
│  = cache    │                                │  SQLite + files   │
└────────────┘                                └──────────────────┘
```

**Storage engine — Hybrid (recommended):**
- **SQLite** (single file `research.sqlite`) as the **system of record** for structured, queryable entities: projects, findings, playbook reviews, hypotheses, promotions, roadmaps, configs, run-metadata index, settings.
- **Flat files** for **large artifacts**: run bundles + candles under `runs/<id>/…` (BLOBs don’t belong in the DB; keeps the DB small and fast to back up).
- **JSON export endpoint** for **inspectability + backup** (`/api/export` → one snapshot file), so the “simple/inspectable/backup-friendly” requirement is met without storing everything as loose JSON.

This satisfies every constraint: single-file backup (copy `research.sqlite`), ACID (low corruption risk), queryable (insights/runs analytics later), desktop-friendly (SQLite embeds with zero server deps), and inspectable (DB browsers + JSON export).

**Local-first guarantee:** the frontend always writes localStorage first (instant) and mirrors to the backend; on boot it union-merges backend ← localStorage. The backend is *authoritative when present* but *never required* to run.

---

## 7. Proposed API endpoints

REST under `/api`, all on the Research Store (8000). Each domain: list/get/upsert/delete + bulk replace (for migration parity with the current full-map writes).

```
GET    /api/health                      → { ok, engine, version }
GET    /api/export                      → full snapshot (JSON) for backup
POST   /api/import                      → restore from a snapshot (guarded)

# Projects + findings (findings nested under project)
GET    /api/projects                    → { projects }            (exists)
PUT    /api/projects                    → replace full map        (exists; keep for migration)
GET    /api/projects/{id}
PATCH  /api/projects/{id}
DELETE /api/projects/{id}
POST   /api/projects/{id}/findings      → append finding
DELETE /api/projects/{id}/findings/{fid}

# Playbook reviews (per run)
GET    /api/playbook                    → all runs’ playbook state
GET    /api/playbook/{runId}
PUT    /api/playbook/{runId}            → { checklist, decision }

# Hypotheses / promotions / roadmaps / configs / settings (same CRUD shape)
GET|PUT /api/hypotheses
GET|PUT /api/promotions
GET|PUT /api/roadmaps
GET|PUT /api/configs
GET|PUT /api/settings                   → account, funding-challenge, results-basis

# Run metadata index + artifacts
GET    /api/runs                        → run index (metadata only)
PUT    /api/runs                        → replace run index
GET    /api/runs/{id}                   → metadata
PUT    /api/runs/{id}/bundle            → store bundle artifact (file)
GET    /api/runs/{id}/bundle
PUT    /api/runs/{id}/candles           → store candle artifact (file)
GET    /api/runs/{id}/candles
```

Every write is atomic (DB transaction or temp-file + `os.replace`). Every domain payload carries a `version` for forward migration.

---

## 8. Proposed on-disk structure

```
backend/
  server.py                 # Research Store API
  data/                     # gitignored (runtime data)
    research.sqlite         # system of record (Phase 2+)
    projects.json           # Phase-1 stepping stone (already exists)
    runs/
      <runId>/
        bundle.json         # full run bundle artifact
        candles.parquet     # or .bin/.json — heavy candle array
        meta.json           # quick index/debug
    exports/
      backup-<ISO8601>.json # /api/export snapshots
```

Phase 1 keeps per-domain JSON (`projects.json`, `playbook.json`, …) for the lowest-risk start; Phase 2 folds them into `research.sqlite` while keeping `exports/` JSON for backup/inspection. Big artifacts always live as files, never in the DB.

---

## 9. Backward-compatible migration plan from localStorage

Reuse the **proven projects pattern** (STORAGE-0) for every domain:

1. **localStorage stays the cache + offline fallback.** Frontend writes it first, synchronously, exactly as today.
2. **Mirror on write** — debounced background `PUT` to the backend; failures are swallowed (backend optional).
3. **Hydrate + union-merge on boot** — fetch backend, merge with localStorage (union by id; never let an empty backend wipe local; newer `updatedAt` wins scalar fields), then push the converged map back so offline-created data lands on disk.
4. **One-time import** — on first contact with a populated-capable backend, seed it from localStorage if its domain is empty.
5. **Versioned payloads** — each domain has a `version`; the backend migrates old shapes forward.
6. **No destructive cutover** — localStorage is **only** retired per-domain after that domain has demonstrably round-tripped through the backend (telemetry/flag), and even then a read-through cache remains.

This is incremental and reversible: any domain can fall back to localStorage at any time.

---

## 10. Risks / blockers

- **Multi-tab / concurrent writes** — two tabs PUT-ing full maps can clobber. *Mitigation:* per-entity PATCH endpoints (not just full-map PUT), `updatedAt`/version checks, last-writer-wins by timestamp, eventually a `BroadcastChannel` to sync tabs.
- **Deletions don’t propagate in union-merge** (today’s projects behavior). *Mitigation:* tombstones or per-entity DELETE endpoints in Phase 2.
- **Backend-not-running** — durable persistence silently doesn’t happen. *Mitigation:* keep fallback (already the design); surface a quiet “syncing to backend: off” status.
- **Migration data loss** — a buggy merge could drop entries. *Mitigation:* `/api/export` backup before any cutover; union-merge with tests (already proven for projects).
- **Large candle arrays** — heavy in IndexedDB and as files. *Mitigation:* keep candles re-derivable via sidecar; store as files (parquet/bin), not in the DB; treat as cache.
- **SQLite corruption on hard crash** — low but nonzero. *Mitigation:* WAL mode, periodic JSON export, single-writer service.
- **Desktop packaging path** — `backend/data/` location must move to an app-data dir when packaged. *Mitigation:* `FXOB_DATA_DIR` env already supported; resolve to OS app-data on package.
- **Port/process management** — users must run a second service. *Mitigation:* desktop build supervises it; dev provides a one-command launcher.
- **Mongo scaffolding rot** — leaving unused `motor`/Mongo code invites confusion. *Mitigation:* remove or clearly quarantine it when SQLite lands.

---

## 11. Implementation phases

| Phase | Scope | Risk | Outcome |
|---|---|---|---|
| **0 (done)** | Projects/findings → `projects.json` via 8000, localStorage fallback + union-merge | low | Reference pattern proven |
| **1** | Generalize the sync pattern into a reusable `backendDomain(name)` helper; migrate **playbook, hypotheses, promotions, roadmaps, configs** as per-domain JSON files; add `/api/export` | low | All class-A research data durable on disk |
| **2** | Introduce **SQLite** as system of record behind the same API; per-entity GET/PATCH/DELETE; tombstones; WAL; keep JSON export | medium | Queryable, robust, multi-tab-safe |
| **3** | Migrate **run metadata index** + artifact files (bundle/candles) to the Research Store; sidecar writes results to it | medium | Runs survive browser/data clears |
| **4** | **User settings** to backend; quarantine/remove Mongo; desktop app-data path via `FXOB_DATA_DIR` | low | Single durable store, packaging-ready |
| **5** | Per-domain localStorage retirement (read-through cache only) once proven | low | localStorage = UI prefs + cache only |

UI preferences (class D) are never migrated.

---

## 12. Recommendation — JSON vs SQLite vs Hybrid

Scored against the requested criteria (✅ strong / ⚠️ ok / ❌ weak):

| Criterion | A. JSON per domain | B. SQLite | C. Hybrid (SQLite + files + JSON export) | D. Mongo | E. extend 8787 | F. FastAPI 8000 |
|---|---|---|---|---|---|---|
| Simplicity | ✅ | ⚠️ | ⚠️ | ❌ | ❌ (not in repo) | ✅ |
| Durability | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Migration risk | ✅ low | ⚠️ schema | ⚠️ phased | ❌ | ❌ | ✅ |
| Desktop compat | ✅ | ✅ embeds | ✅ | ❌ server dep | ❌ | ✅ |
| Backup/export | ✅ copy files | ✅ copy 1 file | ✅ + JSON export | ⚠️ dump | ⚠️ | n/a |
| Queryability | ❌ scan files | ✅ SQL | ✅ SQL | ✅ | ⚠️ | n/a |
| Corruption risk | ⚠️ partial writes | ✅ ACID/WAL | ✅ ACID + JSON safety net | ✅ | ⚠️ | n/a |
| Impl. complexity | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | — |

**Recommendation: C — Hybrid, reached in two steps.**
- **Now (Phase 1):** **JSON-files-per-domain** — lowest risk, already started, fully inspectable, trivial backup. Gets *all* critical research data durable fast.
- **Then (Phase 2):** promote the system of record to **SQLite** (single file, ACID/WAL, queryable, desktop-embeddable) behind the *same* REST API, keeping **large artifacts as files** and a **JSON export** for backup/inspection.

Reject **Mongo** (server dependency fights local-first/desktop/simplicity) and reject making the **8787 sidecar** own durable state (external, compute-focused). The durable owner is the **FastAPI service on 8000**, evolving JSON → SQLite under a stable API, with the sidecar staying the stateless backtester.

---

### Constraint check
- ✅ No current behavior changed (audit only).
- ✅ localStorage fallback retained until backend proven (Phase 5 gated).
- ✅ Analytics calculations untouched.
- ✅ Importer/backtester untouched (sidecar stays compute; only *receives* a write target in Phase 3).
- ✅ Local-first preserved (backend optional, localStorage authoritative when backend down).
- ✅ Simple, inspectable, backup-friendly (JSON now; SQLite + JSON export later).
