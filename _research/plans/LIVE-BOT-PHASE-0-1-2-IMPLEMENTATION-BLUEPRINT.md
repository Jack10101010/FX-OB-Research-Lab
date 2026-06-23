# Live Trading Control Tower — Phase 0/1/2 Implementation Blueprint

**Status:** Build blueprint. The architecture audit (`LIVE-TRADING-CONTROL-TOWER-ARCHITECTURE-AUDIT.md`) is the source of truth and is not re-opened here. This document converts the approved architecture into the fastest practical path to a working backend skeleton + UI prototype.
**Scope:** Phase 0 (contracts/schema), Phase 1 (backend skeleton + mock broker), Phase 2 (cockpit on mock data). Live trading is explicitly out of scope here.
**Repo:** new, separate from FX-OB-Research-Lab. Working name `live-tower`.
**Stack:** Python 3.11 / FastAPI / SQLite (WAL) / Pydantic v2 on the backend; React (Emergent-compatible) on the frontend. Chosen to match the Lab's stack so people and tooling carry over.

---

## 0. Guiding constraints for Phases 0–2

Three rules keep the fast path from becoming throwaway:

1. **Mock-only.** No broker SDK, no live credentials, no real money anywhere in Phases 0–2. The only execution target is the `MockBroker`. Live is a later phase behind double-arm guards.
2. **Server-authoritative.** The UI computes nothing about trading state. It renders snapshots + deltas. This is enforced from day one so Emergent convenience never leaks state logic into the client.
3. **Reconciliation and the event log are built first, not last.** They are the spine. Everything else hangs off them. (Section 6 + Section 8.)

If a thing isn't needed to demonstrate "a bot places mock orders, manages them, survives a restart, and the cockpit shows it live with full audit," it is deferred. Deferred items are listed explicitly in Section 10.

---

## 1. Repository Structure

A **monorepo** for Phases 0–2 (backend + frontend + contracts in one place) — fastest iteration, one PR touches contract + server + UI together. The contract lives in its own top-level folder so it can later be extracted to a shared package without moving code.

```
live-tower/
├─ README.md
├─ docker-compose.yml                 # backend + (optional) static frontend, one command up
├─ .env.example                       # EXECUTION_MODE=mock by default; no live keys ever committed
│
├─ contracts/                         # THE shared boundary. Versioned. Lab will consume this too.
│  ├─ config/
│  │  ├─ config_contract.schema.json  # JSON Schema for Config Contract v1 (Section 2)
│  │  ├─ examples/
│  │  │  ├─ eurusd_london_bos_te25.json
│  │  │  └─ minimal_valid.json
│  │  └─ CHANGELOG.md                 # contract is versioned independently of the app
│  ├─ api/
│  │  └─ openapi.draft.yaml           # REST + WS event catalogue (Section 3), hand-kept in P0
│  └─ events/
│     └─ event_catalogue.md           # canonical list of BotEvent codes + WS frame types
│
├─ backend/
│  ├─ pyproject.toml
│  ├─ app/
│  │  ├─ main.py                      # FastAPI app factory, CORS, mode banner middleware
│  │  ├─ settings.py                  # env: EXECUTION_MODE, DB_PATH, LIVE_TRADING_ARMED(false)
│  │  │
│  │  ├─ domain/                      # pure types — no I/O. Mirrors audit §4 (only P1 entities).
│  │  │  ├─ enums.py                  # BotStatus, OrderState, TradeState, ExecutionMode, EventCategory
│  │  │  ├─ models.py                 # Pydantic: BotInstance, Order, Trade, RiskState, Signal...
│  │  │  └─ config_contract.py        # Pydantic mirror of the JSON Schema; load+validate+hash
│  │  │
│  │  ├─ state/                       # persistence + the source of "what is"
│  │  │  ├─ db.py                     # SQLite connection (WAL), migration runner
│  │  │  ├─ migrations/
│  │  │  │  └─ 0001_init.sql          # Section 5 schema
│  │  │  ├─ repositories.py           # bots/orders/trades/configs/events repos (the only SQL)
│  │  │  └─ reconciler.py             # Section 6 — diff internal vs broker, lock on divergence
│  │  │
│  │  ├─ events/                      # the source of "why" — append only
│  │  │  ├─ log.py                    # append(event) -> seq ; never updates
│  │  │  └─ replay.py                 # rebuild derived state from the log (restart recovery)
│  │  │
│  │  ├─ bus/                         # in-process async pub/sub + WS fan-out
│  │  │  └─ bus.py                    # publish(topic, frame); subscribe(); seq counter
│  │  │
│  │  ├─ brokers/                     # adapter interface + the only implementation in P1
│  │  │  ├─ base.py                   # BrokerAdapter Protocol (audit §3.4)
│  │  │  └─ mock/
│  │  │     ├─ mock_broker.py         # Section 4 — deterministic, tick-driven sim
│  │  │     └─ price_feed.py          # synthetic/replayed candle+tick generator
│  │  │
│  │  ├─ runtime/                     # the per-bot loop + supervisor
│  │  │  ├─ supervisor.py             # start/pause/lock/kill/restart; safe-recovery
│  │  │  └─ bot_loop.py               # tick → (brain stub) → protection stub → route → act → log
│  │  │
│  │  ├─ brain/                       # P1 = stub that emits scripted/random intents; real logic later
│  │  │  └─ stub_brain.py
│  │  ├─ protection/                  # P1 = pass-through veto stub (always ALLOW) + caps only
│  │  │  └─ stub_protection.py
│  │  ├─ sim/                         # the shared trade-walk core (used by mock fills + future ghost)
│  │  │  └─ walk.py
│  │  │
│  │  ├─ config/                      # import/validate/version configs (Config Import Layer)
│  │  │  └─ importer.py               # load contract JSON → validate → hash → persist ConfigVersion
│  │  │
│  │  └─ api/                         # thin gateway only. No business logic here.
│  │     ├─ rest.py                   # routers (Section 3)
│  │     ├─ ws.py                     # /stream: snapshot-then-delta (Section 3.3)
│  │     ├─ schemas.py                # request/response DTOs (separate from domain models)
│  │     └─ commands.py               # command handlers: validate → act → return resulting events
│  │
│  └─ tests/
│     ├─ test_mock_broker.py
│     ├─ test_reconciler.py           # the most important test file in Phase 1
│     ├─ test_event_replay.py
│     └─ test_api_snapshot.py
│
├─ frontend/                          # Emergent-compatible React app
│  ├─ package.json
│  ├─ src/
│  │  ├─ api/
│  │  │  ├─ client.ts                 # REST wrapper; injects Idempotency-Key
│  │  │  └─ socket.ts                 # WS: connect → snapshot → apply deltas by seq → resync on gap
│  │  ├─ store/
│  │  │  └─ liveStore.ts              # entity-keyed store; applies deltas; NO trading logic
│  │  ├─ types/
│  │  │  └─ generated.ts              # types generated from contracts/api (single source)
│  │  ├─ pages/
│  │  │  ├─ FleetOverview.tsx         # the first page
│  │  │  └─ BotDetail.tsx
│  │  ├─ components/
│  │  │  ├─ BotCard.tsx               # the first card (audit §A)
│  │  │  ├─ OrdersPanel.tsx
│  │  │  ├─ TradesPanel.tsx
│  │  │  ├─ EventLogFeed.tsx
│  │  │  ├─ SafetyBar.tsx             # global kill / mode banner, always visible
│  │  │  └─ ModeBanner.tsx            # mock/demo/live — unmissable
│  │  └─ App.tsx
│  └─ .env.example                    # REACT_APP_API_BASE
│
└─ scripts/
   ├─ seed_demo_fleet.py             # spin up N mock bots with example configs for the UI demo
   └─ inject_fill.py                 # CLI to push a manual fill into the mock broker (Section 4)
```

**Why this shape:** `contracts/` is the only thing both repos depend on — extract-ready. `domain/` is pure (testable without a DB or a broker). `api/` is thin (swap REST/WS without touching logic). `brokers/base.py` is the seam that keeps the mock and future live brokers interchangeable. `sim/walk.py` is built once and shared by mock fills now and ghost later (audit §7.3) — this avoids the single worst drift trap.

---

## 2. Config Contract v1

Minimum viable, but shaped so the full promotion ladder works without redesign. Two layers: a small **envelope** (identity, versioning, provenance, status, stats) that the Bot fully understands now, and a **`rule_set`** that is structured but treated as a versioned, hashable payload the Brain grows into. The envelope is frozen; `rule_set` can gain fields under the same contract major version.

### 2.1 Structure

```jsonc
{
  "contract_version": "1.0.0",          // semver of THIS schema, not the strategy
  "config_id": "EURUSD_London_BOS_TE25",// stable logical id (slug)
  "version": 1,                         // monotonic int per config_id; immutable once promoted
  "content_hash": "sha256:7f3a…",       // see 2.3 — hash of canonical(rule_set + envelope-minus-hash)
  "created_at": "2026-06-16T09:00:00Z",

  "domain": "FX",                       // FX | FUTURES (only FX used now; discriminator from day 1)
  "instrument": "EURUSD",

  "status": {                           // promotion ladder state (2.4)
    "stage": "forward_test",            // research | forward_test | demo | small_live | full_live | disabled
    "enabled": true,
    "live_risk_cap_pct": 0.0            // hard ceiling enforced regardless of rule_set; 0 in ghost/forward
  },

  "source": {                           // provenance back to the Lab (required for promotion)
    "lab_project": "fx-ob-research-lab",
    "research_run_id": "EURUSD_M15_RR3.3_real",
    "lab_commit": "abc123",
    "exported_at": "2026-06-15T18:00:00Z"
  },

  "research_stats": {                   // frozen expectation — baseline for edge-decay (audit §6.6)
    "trades": 6, "win_rate": 33.3, "net_r": 2.6, "expectancy": 0.43,
    "validation": 98.7,
    "date_from": "2025-05-18", "date_to": "2026-05-18",
    "sample_warning": "low_sample"      // importer sets this when trades < threshold
  },

  "defaults": { "detection_tf": "M15", "execution_tf": "1m" },

  "rule_set": {                         // the granular control tree (audit §4.4); grows over versions
    "sessions": [
      {
        "session": "London", "enabled": true,
        "directions": [
          {
            "direction": "long", "enabled": true,
            "structures": [
              {
                "structure_type": "BOS", "ob_context": "bullish_ob", "enabled": true,
                "entry_model": { "type": "TE", "te_pct": 25, "max_penetration_pct": 50,
                                 "entry_buffer": 0.0, "stop_buffer": 1.0 },
                "risk":       { "risk_pct": 0.5, "sl_model": "structure", "tp_model": "rr",
                                "rr": 3.3, "be_trigger_r": 1.0, "max_risk_money": null },
                "protection": { "fft_enabled": true, "be_to_1r": true },
                "cancel":     { "after_minutes": null, "after_candles": 8,
                                "on_structure_flip": true, "on_ob_invalidation": true },
                "manual_override_permission": true
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### 2.2 Required vs optional

**Required (import is blocked without them):** `contract_version`, `config_id`, `version`, `content_hash`, `created_at`, `domain`, `instrument`, `status.stage`, `status.enabled`, `source.research_run_id`, `research_stats` (at least `trades`, `net_r`, `win_rate`, `date_from/to`), and a `rule_set` with ≥1 enabled leaf. **Optional:** `defaults`, `status.live_risk_cap_pct` (defaults 0), `research_stats.sample_warning`, `max_risk_money`, the time-based cancel fields. Unknown extra fields are **rejected** under a major version (strict schema) — drift is caught early.

### 2.3 Versioning & content hash

- **Two independent version numbers:** `contract_version` (the schema/shape) and `version` (the strategy revision per `config_id`). Bumping a rule creates `version: N+1`; it never edits N.
- **Immutability:** a promoted ConfigVersion row is never updated. Status transitions are *separate ConfigPromotion records*, not edits to the version.
- **Content hash:** `sha256` over the **canonical JSON** of the document with `content_hash` removed and keys sorted, whitespace-normalised (RFC 8785-style canonicalisation, or a documented local canonicaliser). Computed at import, re-verified before every arm. If a stored config's recomputed hash ≠ stored hash → **reject and lock** (tamper/corruption). This is the integrity anchor the audit requires (every trade pins this hash).

### 2.4 Promotion status

`status.stage` is the ladder: `research → forward_test → demo → small_live → full_live`, with `disabled` reachable from any stage. The Bot enforces `live_risk_cap_pct` as a hard ceiling per stage (e.g. 0 in forward_test, 0.1 in small_live) *regardless* of what `rule_set.risk.risk_pct` says — belt and braces. Each transition writes a `config_promotion` row (Section 5) with gate evidence; **no auto-promotion in Phases 0–2.**

---

## 3. Backend API Contract v1

Designed for fast Emergent wiring: predictable REST resources, one WebSocket, snapshot-then-delta so the UI hydrates in two calls.

### 3.1 Conventions

- Base `/api/v1`. JSON everywhere. Times ISO-8601 UTC.
- Every response carries headers `X-Execution-Mode: mock` and `X-Seq: <high-water>`.
- **Reads = GET**, idempotent, cacheable. **Commands = POST**, require `Idempotency-Key` header, return the **resulting event(s)** not a bare 200. The server validates each command at execution time.
- Resource naming: plural nouns (`/bots`, `/orders`, `/trades`), verbs only for commands as sub-resources (`/bots/{id}/pause`).

### 3.2 REST endpoints (Phase 1/2 set)

```
# Hydration
GET  /api/v1/snapshot                 # full UI state in one call (3.4)
GET  /api/v1/health                   # service + broker health + mode

# Reads
GET  /api/v1/bots                      # overview cards
GET  /api/v1/bots/{id}                 # detail (incl. resolved rule_set)
GET  /api/v1/bots/{id}/orders
GET  /api/v1/bots/{id}/trades
GET  /api/v1/bots/{id}/events?since={seq}
GET  /api/v1/configs                   # imported config versions
GET  /api/v1/accounts/{id}/risk        # RiskState (stub values fine in P1)

# Bot commands (POST, idempotent, logged)
POST /api/v1/bots/{id}/pause | arm | lock | kill-orders | flatten
POST /api/v1/bots/{id}/execution-mode  { "mode": "mock" }   # only mock allowed in P0-2

# Order / trade manual actions (audit §C/§D) — each logs before/after
POST /api/v1/orders/{id}/cancel
POST /api/v1/orders/{id}/move          { "entry"?, "sl"?, "tp"? }
POST /api/v1/trades/{id}/sl-to-be
POST /api/v1/trades/{id}/close
POST /api/v1/trades/{id}/auto-mgmt     { "enabled": false }

# Config
POST /api/v1/configs/import            # body = Config Contract JSON; validates + hashes + stores

# Global safety (always present, even in mock)
POST /api/v1/safety/global-kill
POST /api/v1/safety/no-trade

# Mock-broker test hooks (P1 only; behind a dev flag)
POST /api/v1/_mock/inject-fill         { "order_id", "price" }
POST /api/v1/_mock/set-price           { "symbol", "price" }
POST /api/v1/_mock/disconnect          { "seconds" }   # reconnect/reconciliation testing
```

### 3.3 Request/response examples

**Bot card (GET /bots):**
```json
[{
  "id": "bot_eurusd_1", "pair": "EURUSD", "status": "WAITING",
  "execution_mode": "mock",
  "config": { "config_id": "EURUSD_London_BOS_TE25", "version": 1, "content_hash": "sha256:7f3a…" },
  "account_id": "acc_demo_1",
  "risk": { "daily_pl": -12.4, "floating_pl": 3.1, "risk_today_pct": 0.5,
            "dd_buffer_pct": 78.0, "open_orders": 1, "open_trades": 0 },
  "session": "London", "next_news_blackout": null,
  "last_action": "Placed resting BUY LIMIT @1.08450 (BOS/bullish OB, TE25)",
  "warnings": [], "seq": 10432
}]
```

**Command (POST /trades/{id}/sl-to-be):** request body optional; headers carry `Idempotency-Key`. Response:
```json
{ "ok": true,
  "events": [{
     "seq": 10455, "category": "manual", "code": "TRADE_SL_MOVED",
     "bot_id": "bot_eurusd_1", "trade_id": "trd_88",
     "human_explanation": "Manual: SL moved to break-even (1.08450) by operator.",
     "before": { "sl": 1.08300 }, "after": { "sl": 1.08450 },
     "ts": "2026-06-16T09:14:22Z"
  }]}
```

**Command rejected by validation:**
```json
{ "ok": false, "reason_code": "TRADE_NOT_OPEN",
  "message": "Trade trd_88 is already closed; SL move ignored.",
  "events": [] }
```

### 3.4 Snapshot strategy

`GET /snapshot` returns everything the cockpit needs to render cold, plus the current `seq`:
```json
{ "seq": 10432, "execution_mode": "mock",
  "bots": [ … ], "orders": [ … ], "trades": [ … ],
  "accounts": [ … ], "recent_events": [ … last 100 … ] }
```
The client renders from this, remembers `seq`, then opens the WS and applies frames with `seq > 10432`.

### 3.5 WebSocket — `/api/v1/stream`

- **Connect handshake:** client sends `{ "last_seq": 10432, "subscribe": ["all"] }`.
- **Server replay:** if `last_seq` is recent, server replays missed frames; if the gap is too large (or unknown), server responds `{ "type": "resync" }` → client re-calls `/snapshot`.
- **Frame shape** (every frame identical envelope):
```json
{ "seq": 10433, "type": "trade.update", "bot_id": "bot_eurusd_1",
  "ts": "2026-06-16T09:14:23Z", "payload": { …entity delta… } }
```
- **Frame types (v1):** `bot.state`, `order.update`, `trade.update`, `risk.update`, `event.log`, `alert`, `broker.health`, `reconcile.diff`, `resync`.

### 3.6 Delta strategy

Frames are **last-writer-wins entity deltas keyed by id**, not field-patches. `order.update` carries the full current Order object; the client replaces its copy. Simpler than JSON-patch, gap-tolerant (a replaced entity is self-healing), and trivial in Emergent. `seq` is the single global ordering token; the client drops any frame with `seq` ≤ its high-water mark.

---

## 4. Mock Broker Design

The first execution engine. Deterministic, tick-driven, and built to exercise every hard path (pending → fill, SL/TP, manual injection, disconnect, reconciliation) **without** a real venue. It implements the same `BrokerAdapter` interface the live broker will, so swapping it later changes one factory line.

### 4.1 Data model (internal to the mock)

```
MockOrder      { client_order_id, broker_order_id, symbol, side, type(LIMIT/MARKET),
                 entry, sl, tp, size, state(PENDING/WORKING/FILLED/CANCELLED/REJECTED),
                 created_at, filled_at, fill_price }
MockPosition   { broker_position_id, from_order, symbol, side, size, entry_price,
                 sl, tp, opened_at, floating_pl, state(OPEN/CLOSED), close_price, closed_at }
MockAccount    { account_id, balance, equity, currency }
MockClock      { now, tick_seq }          # advances on each price tick; deterministic
PriceBook      { symbol -> current_bid/ask }   # driven by price_feed.py
ConnectionState{ connected: bool, dropped_until }   # for disconnect testing
```

### 4.2 Lifecycle

```
place_order(NormalizedOrder)            # idempotent on client_order_id
   ├─ MARKET → fill immediately at current ask/bid → emit FILL → open MockPosition
   └─ LIMIT  → state=WORKING, rests in book

on each price tick (MockClock advances):
   ├─ WORKING limit: if price crosses entry → state=FILLED, open position, emit FILL
   ├─ OPEN position: if price hits SL → close@SL emit FILL(close); if hits TP → close@TP
   └─ recompute floating_pl for open positions → emit position update

modify_order(ref, {entry|sl|tp})        # updates working order or open position protective levels
cancel_order(ref)                       # WORKING → CANCELLED
get_open_orders()/get_open_positions()/get_account()   # the reconciliation surface (truth)
```

Fill model for v1 is **deterministic touch-to-fill** (price trades through the level → filled, no partials, configurable fixed slippage = 0). Partial fills and slippage are a later toggle — the *fields* exist now so adding them isn't a schema change.

### 4.3 Test/control surface (what makes it a test rig)

- `inject_fill(order_id, price)` — force a fill at a chosen price (drive scenarios without waiting for the feed). Exposed via `POST /_mock/inject-fill`.
- `set_price(symbol, price)` / `step_ticks(n)` — drive the clock deterministically.
- `disconnect(seconds)` — simulate a broker outage: rejects calls, then on reconnect the bot must reconcile (Section 6). Exposed via `POST /_mock/disconnect`.
- `reset()` / `snapshot()` — wipe or dump full mock state for restart/reconciliation tests.

### 4.4 Why it matters

The MockBroker is where reconciliation, idempotency, disconnect recovery, and restart safety are *proven* before a real venue is ever touched. If `test_reconciler.py` is green against a mock that can drop connections and diverge on command, the live adapter inherits a tested spine.

---

## 5. Database Design (SQLite, Phase 1)

WAL mode, one file (`DB_PATH`). Only tables Phase 1 actually needs. Immutable tables are written once; append-only tables are insert-only.

```sql
-- ── CONFIG (immutable once written) ───────────────────────────────
CREATE TABLE config_version (        -- IMMUTABLE
  id            TEXT PRIMARY KEY,     -- config_id + ':' + version
  config_id     TEXT NOT NULL,
  version       INTEGER NOT NULL,
  content_hash  TEXT NOT NULL,
  domain        TEXT NOT NULL,        -- FX | FUTURES
  instrument    TEXT NOT NULL,
  stage         TEXT NOT NULL,        -- research|forward_test|demo|small_live|full_live|disabled
  live_risk_cap_pct REAL NOT NULL DEFAULT 0,
  research_stats_json TEXT NOT NULL,
  rule_set_json TEXT NOT NULL,
  source_json   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  UNIQUE(config_id, version)
);

CREATE TABLE config_promotion (      -- APPEND-ONLY
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id   TEXT NOT NULL,
  from_version INTEGER, to_version INTEGER,
  from_stage  TEXT, to_stage TEXT,
  reason      TEXT, actor TEXT NOT NULL,
  gate_results_json TEXT,
  ts          TEXT NOT NULL
);

-- ── ACCOUNTS / BOTS (mutable runtime) ─────────────────────────────
CREATE TABLE account (
  id TEXT PRIMARY KEY, broker TEXT NOT NULL, type TEXT NOT NULL,  -- mock|demo|live|funded
  base_currency TEXT NOT NULL, timezone TEXT NOT NULL,
  balance REAL, equity REAL, funded_rules_json TEXT
);

CREATE TABLE bot_instance (
  id TEXT PRIMARY KEY,
  pair TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES account(id),
  config_version_id TEXT NOT NULL REFERENCES config_version(id),
  status TEXT NOT NULL,             -- ARMED|WAITING|IN_TRADE|PAUSED|LOCKED|ERROR
  execution_mode TEXT NOT NULL,     -- mock (only, in P1)
  live_enabled INTEGER NOT NULL DEFAULT 0,
  last_action TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX ix_bot_account ON bot_instance(account_id);

-- ── ORDERS / TRADES (mutable, mirror of broker truth) ─────────────
CREATE TABLE "order" (
  id TEXT PRIMARY KEY,                 -- internal id
  client_order_id TEXT NOT NULL UNIQUE,-- idempotency key
  broker_order_id TEXT,                -- set after broker ack
  bot_id TEXT NOT NULL REFERENCES bot_instance(id),
  config_version_id TEXT NOT NULL REFERENCES config_version(id),
  signal_id TEXT,
  side TEXT NOT NULL, type TEXT NOT NULL,
  entry REAL, sl REAL, tp REAL, size REAL,
  risk_money REAL, risk_pct REAL,
  ob_id TEXT, session TEXT,
  state TEXT NOT NULL,                 -- PENDING|WORKING|FILLED|CANCELLED|REJECTED
  expected_cancel_json TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX ix_order_bot_state ON "order"(bot_id, state);

CREATE TABLE trade (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES "order"(id),
  broker_position_id TEXT,
  bot_id TEXT NOT NULL REFERENCES bot_instance(id),
  config_version_id TEXT NOT NULL REFERENCES config_version(id),
  entry REAL, sl REAL, tp REAL, size REAL,
  original_plan_json TEXT NOT NULL,   -- frozen at fill
  current_r REAL, floating_pl REAL,
  state TEXT NOT NULL,                -- OPEN|CLOSED
  auto_mgmt_enabled INTEGER NOT NULL DEFAULT 1,
  session_entered TEXT,
  opened_at TEXT NOT NULL, closed_at TEXT, close_price REAL, realized_r REAL
);
CREATE INDEX ix_trade_bot_state ON trade(bot_id, state);

-- ── EVENT LOG (APPEND-ONLY — the spine) ───────────────────────────
CREATE TABLE bot_event (             -- APPEND-ONLY, never UPDATE/DELETE
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id TEXT, category TEXT NOT NULL,        -- decision|order|trade|risk|manual|system|error
  code TEXT NOT NULL,
  human_explanation TEXT NOT NULL,
  payload_json TEXT, caused_by TEXT,
  ts TEXT NOT NULL
);
CREATE INDEX ix_event_bot_seq ON bot_event(bot_id, seq);

-- ── MANUAL ACTIONS (APPEND-ONLY, before/after) ───────────────────
CREATE TABLE manual_action (         -- APPEND-ONLY
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL, action_type TEXT NOT NULL,
  target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
  before_json TEXT, after_json TEXT,
  reason TEXT, override INTEGER NOT NULL DEFAULT 0,
  ts TEXT NOT NULL
);

-- ── RECONCILIATION SNAPSHOTS (append-only audit of broker truth) ──
CREATE TABLE reconcile_snapshot (    -- APPEND-ONLY
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id TEXT, broker_orders_json TEXT, broker_positions_json TEXT,
  diff_json TEXT, clean INTEGER NOT NULL, ts TEXT NOT NULL
);
```

**Notes.** `config_version` and the append-only tables (`bot_event`, `manual_action`, `config_promotion`, `reconcile_snapshot`) are write-once by policy — enforce in the repository layer (no UPDATE methods exist for them). `seq` from `bot_event` is the same monotonic token the WS uses. Deliberately **omitted** from Phase 1 (audit entities not yet needed): `GhostTrade`, `PerformanceSnapshot`, `StructureEvent`, `NewsEvent`, `Pair`/`Instrument` static tables, `BrokerConnection` (a row in `account` + in-memory health suffices). They slot in later without touching what's above.

---

## 6. State Management Strategy

Highest-priority section. Four state layers, one rule: **the broker is reality; everything else is a hypothesis that must be continuously reconciled to it.**

### 6.1 The four layers

| Layer | Where | Role | Mutability |
|---|---|---|---|
| **Authoritative app state** | SQLite `order`/`trade`/`bot_instance` | the bot's *belief* about the world | mutable, but only changed via reconcile or confirmed broker action |
| **Broker state** | the MockBroker (later: real venue) | **the truth** about orders/positions/account | external; we mirror it, never override it |
| **Local/UI state** | frontend store | a *render cache* of app state | derived; never authoritative |
| **Event-log state** | SQLite `bot_event` (append-only) | the immutable record of *why* + the rebuild source | write-once |

### 6.2 The golden flow for any state change

```
1. Decide (brain) → 2. Veto (protection) → 3. Persist intent + client_order_id (DB)
→ 4. Call broker → 5. On ack/fill: update app state to MATCH broker echo
→ 6. Append event(s) → 7. Emit WS delta
```
State is **never** advanced on hope. An order is `WORKING` because the broker said so, not because we sent it. If step 4 returns nothing (timeout/disconnect), the order stays `PENDING` and the reconciler resolves it — we do **not** assume success or failure.

### 6.3 Reconciliation loop (the keystone)

Runs (a) on a timer every few seconds, (b) after every broker reconnect, and (c) on startup before any bot is allowed to leave `LOCKED`.

```
reconcile(bot):
  broker = { open_orders, open_positions, account }   # truth, via adapter
  app    = repo.open_orders_and_trades(bot)
  diff   = compare(app, broker)        # match on broker_order_id / broker_position_id / client_order_id

  if diff.empty:
      record reconcile_snapshot(clean=true); ensure bot not locked-for-divergence
  else:
      for each discrepancy classify:
        - APP_HAS_BROKER_DOESNT  (phantom)      → app order/trade marked, bot → LOCKED
        - BROKER_HAS_APP_DOESNT  (orphan)       → ingest as 'unmanaged', bot → LOCKED
        - FIELD_MISMATCH (sl/tp/size/state)     → adopt broker value, log, bot → LOCKED if material
      record reconcile_snapshot(clean=false, diff)
      append bot_event(category=system, code=RECONCILE_DIVERGENCE, payload=diff)
      emit reconcile.diff
```

**Divergence policy is conservative by design:** any unexplained discrepancy → the bot **LOCKS** (no new orders, no auto-management) and surfaces the diff. A human (or a later auto-resolver) clears it. The bot never "guesses" its way back to trading. This single rule prevents the entire class of phantom/duplicate-position disasters.

### 6.4 Restart recovery

On boot: load app state from SQLite → replay is unnecessary for *values* (they're persisted) but the **event log is replayed to rebuild any in-memory derived state** (e.g. risk counters) → every bot starts `LOCKED` → reconcile against broker → only a clean reconcile permits transition to `ARMED/WAITING`. A crash therefore can never resume trading on stale assumptions.

### 6.5 Idempotency

`client_order_id` is generated and persisted **before** the broker call. On retry/restart, the bot looks up the key: if the broker already knows it, adopt the broker's record; never send twice. The mock broker honours the same key, so this is testable end-to-end.

---

## 7. UI Development Plan

Goal: a visually impressive, real-feeling cockpit fast, with zero architectural debt. Everything renders **server state** (snapshot + WS deltas); nothing is computed client-side. "Mock" here means *mock broker data*, not fake UI data — the UI is always wired to the real backend, which happens to be running mock bots.

### 7.1 First pages (in build order)

1. **Fleet Overview** — grid of `BotCard`s + a persistent `SafetyBar`/`ModeBanner`. This alone demos the whole spine (live cards updating from the mock fleet).
2. **Bot Detail** — one bot: `OrdersPanel`, `TradesPanel`, `EventLogFeed`, and the manual-action buttons.

That's the Phase 2 target. Config import, performance, ghost lab are later pages with placeholders now.

### 7.2 First cards / components

- `BotCard` (audit §A): pair, config name+version, status pill (`ARMED/WAITING/IN_TRADE/PAUSED/LOCKED/ERROR`), daily/floating P/L, DD buffer bar, open orders/trades, session, last action, quick actions (pause, kill-orders, flatten).
- `OrdersPanel` (§C): resting orders table + cancel/move actions.
- `TradesPanel` (§D): open trades + SL→BE, close, auto-mgmt toggle; shows plan vs current.
- `EventLogFeed` (§7): the live "why" stream — this is what makes the cockpit feel intelligent.
- `SafetyBar` + `ModeBanner`: global-kill button and an unmissable `MOCK` banner.

### 7.3 Real vs mocked

| Concern | Phase 2 |
|---|---|
| Backend connection | **Real** — UI always talks to the FastAPI service |
| Bots / orders / trades / events | **Real objects**, produced by **mock broker** activity |
| Brain decisions | **Stubbed** (scripted/random intents) but flow through the real pipeline + event log |
| Risk numbers | Real plumbing, **stub values** (full funded math is Phase 6) |
| Config import page | **Placeholder** (configs seeded via `scripts/seed_demo_fleet.py`) |
| Performance/Ghost pages | **Not built** (nav placeholders) |

### 7.4 Snapshot vs WebSocket data

- **From `GET /snapshot` (once, on load + on resync):** the full initial fleet, orders, trades, recent events — everything to render cold.
- **From WebSocket (continuously):** `bot.state` (card status/P&L), `order.update`, `trade.update`, `risk.update`, `event.log` (feed), `alert`, `reconcile.diff`. The store applies deltas by `seq`; on any gap → re-snapshot.

The "impressive" factor comes free: with the mock feed running and `seed_demo_fleet.py` spinning several pairs, the cockpit shows cards flickering between WAITING/IN_TRADE, orders filling, P&L moving, and a scrolling explainable event feed — all real backend behaviour.

---

## 8. Recommended Build Sequence

Exact order, chosen to minimise rework (each step is testable before the next depends on it):

1. **Repo + settings + `domain/` types** — Pydantic models, enums, the Config Contract model. Pure, no I/O. Write the contract JSON Schema + examples here.
2. **SQLite schema + `db.py` + migration `0001`** — the tables from Section 5; repositories with **no UPDATE on append-only/immutable tables**.
3. **Event log (`events/log.py`) + bus (`bus/bus.py`)** — append→seq, publish. Everything downstream emits through these. (Spine first.)
4. **Config importer (`config/importer.py`)** — load contract JSON → validate → hash → persist `config_version`. Unblocks seeding real bots.
5. **MockBroker + price feed (`brokers/`)** — implement `BrokerAdapter`; deterministic fills, SL/TP, inject-fill, disconnect. Unit-test in isolation.
6. **Reconciler (`state/reconciler.py`)** — diff app vs mock broker; lock on divergence; `test_reconciler.py` green (drop connection → diverge → lock). **Do this before the bot loop.**
7. **Bot loop + supervisor (`runtime/`)** — tick → stub brain → stub protection → route to mock → persist via golden flow → event → restart-safe recovery (boot LOCKED → reconcile → ARM).
8. **WebSocket layer (`api/ws.py`)** — `/stream`: handshake, replay/resync, frame fan-out from the bus.
9. **REST snapshot + reads (`api/rest.py`)** — `GET /snapshot`, `/bots`, `/bots/{id}/orders|trades|events`. Now the backend is fully demonstrable headless.
10. **Command handlers (`api/commands.py`)** — pause/lock/kill/flatten + order/trade manual actions, each logging before/after. Wire the `_mock/*` test hooks.
11. **`seed_demo_fleet.py`** — several mock bots from example configs, so there's something alive to look at.
12. **Frontend skeleton** — `socket.ts` (snapshot→deltas→resync), `liveStore.ts`, `App.tsx`, `ModeBanner`/`SafetyBar`.
13. **Fleet Overview page + `BotCard`** — the first visible win; cards live-updating off the mock fleet.
14. **Bot Detail page** — `OrdersPanel`, `TradesPanel`, `EventLogFeed`, manual-action buttons wired to commands.
15. **Harden** — restart the backend mid-fleet and confirm the UI resyncs and bots come back LOCKED→reconciled; run the disconnect hook and watch a `reconcile.diff` surface in the feed.

Steps 1–11 are Phase 0/1 (headless backend, fully testable). Steps 12–15 are Phase 2 (cockpit). Reconciliation (6) lands before the loop (7) on purpose.

---

## 9. Architecture Stress Test

Challenging the audit where it's worth challenging — not to redesign, but to de-risk the build.

**Weak spots / things to nail early:**
- **Reconciliation correctness is the whole ballgame** and it's subtle (matching keys across app/broker, classifying diffs, deciding what's "material"). Risk: under-testing it. Mitigation: it's step 6, gated by a dedicated test file with an adversarial mock that can be told to diverge.
- **The `rule_set` is structured but the Brain that consumes it doesn't exist in P1.** Risk: over-specifying `rule_set` now and finding the real Brain wants a different shape. Mitigation: treat `rule_set` as a hashable opaque-ish payload in P1 (validate shape, don't deeply interpret); only the envelope is load-bearing until the real Brain phase.
- **WS replay/resync** is easy to get subtly wrong (gap detection, replay window). Mitigation: keep it dumb — small replay window, otherwise force full `/snapshot`. Don't build a clever event-sourcing replay for the client.

**Unnecessary complexity to cut for Phases 0–2:**
- **In-process bus is plenty; do not add Redis/Kafka/a message broker.** One process, one event loop. Re-evaluate only if/when the Broker Adapter is extracted.
- **Don't build `PerformanceSnapshot`, ghost, news, or structure tables yet** — the schema in Section 5 deliberately omits them. Adding them later is additive.
- **Don't generalise `BrokerAdapter` for Futures yet.** The `domain` discriminator field is enough insurance; a second implementation is premature.
- **JSON-patch deltas are over-engineering.** Whole-entity, last-writer-wins by `seq` (Section 3.6) is simpler and gap-tolerant.
- **Don't stand up Postgres.** SQLite WAL is correct for a single-operator, human-speed FX bot and keeps local-first dev frictionless. The repository pattern makes the later swap cheap *if ever needed*.

**Areas likely to cause future rewrites if done wrong now (so do them right now):**
- **Skipping idempotency keys "for the mock."** If `client_order_id` isn't threaded through from day one, retrofitting it after the loop exists is painful. Build it in step 2/7.
- **Letting the UI compute state** because Emergent makes it easy. This is the rewrite trap. Enforce server-authoritative in code review from the first card.
- **Mutable history.** If any append-only table grows an UPDATE path, auditability is gone. Enforce via repositories that physically lack update methods.
- **Coupling to the Lab's storage.** Keep the contract the *only* shared surface; never import Lab modules or read its DB.

**Things that can be simplified without losing capability:**
- Protection and Brain are **stubs** in P1 — the pipeline shape is real, the logic is deferred. This lets the whole spine ship and be demoed without the hardest domain logic.
- Risk numbers can be **plumbed but faked** until Phase 6 — the card renders them, the math comes later.
- A single `account` row can stand in for `BrokerConnection` (health lives in memory). One fewer table, zero capability lost now.

**One assumption worth flagging (not blocking):** the audit's "one supervised loop per BotInstance" is right, but in P1 keep them as cooperative async tasks in one event loop, not threads/processes — simpler, deterministic, and the mock clock can drive them all. Revisit only if a real venue needs true concurrency.

---

## 10. Final Recommendation

If I owned this and wanted a safe live-trading *prototype* fast without poisoning the long-term architecture:

**Build first (the irreducible spine — steps 1–11):** the event log, the SQLite schema, the MockBroker, and — above all — **the reconciler, before the bot loop.** Then the WS snapshot/delta gateway and the command handlers. Get a **headless backend that runs a fleet of mock bots, places and fills mock orders, survives a restart by coming back LOCKED and reconciling, and logs every action with a human reason.** That backend *is* the professional-grade foundation; everything else is a view on it. Then build exactly two UI pages (Fleet Overview + Bot Detail) so it's visibly alive and demo-ready.

**Delay (real but not now):** the real Strategy Brain (P1 uses a stub that emits intents through the real pipeline), full funded-account risk math (plumb the numbers, fake the values), the ghost engine (the *shared `sim/walk.py`* is built now, but multi-model ghosting is later), demo and live broker adapters, performance analytics, and config promotion automation. None of these block a credible prototype, and each slots into seams already in place.

**Avoid completely for now:** any real broker SDK or credentials; live or even demo execution; Postgres/Redis/Kafka; microservices; Futures abstractions beyond the `domain` field; JSON-patch deltas; client-side trading logic; and auto-promotion of configs. Each adds risk or rework with zero benefit to the Phase 0–2 goal.

**The one line that matters most:** make the broker the only source of truth and make divergence *lock the bot*, from the very first commit. A prototype that is honest about state — that would rather stop than guess — is already a professional-grade foundation. A prototype that looks polished but trusts its own optimistic state is a liability no UI can fix. Build the cautious spine first; the impressive cockpit is two pages on top of it.
