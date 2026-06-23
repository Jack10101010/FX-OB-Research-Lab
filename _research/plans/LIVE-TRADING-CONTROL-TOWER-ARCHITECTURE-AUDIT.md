# Live Trading Control Tower — Architecture Audit & Design

**Status:** Audit / design only. No implementation, no code, no file changes beyond this report.
**Date:** 2026-06-16
**Scope:** Foundation architecture for a live execution system that consumes profitable strategy configs discovered in FX-OB-Research-Lab.
**Companion system:** FX-OB-Research-Lab (discovery/validation/export). This document treats the Lab as an upstream producer and keeps the two systems deliberately separate.

---

## 0. How to read this document

This is a foundation audit, not a build ticket. It is organised around the 14 deliverables requested. Wherever a decision is genuinely yours to make (broker, persistence engine, hosting), it is flagged in **§13 Open Decisions** rather than silently assumed. Wherever the spec was ambiguous, the ambiguity is named.

Two principles run through every section:

1. **The Lab discovers truth; the Bot executes it under constraint.** They must never share a process, a database write path, or a deploy. The Bot *reads* exported configs and *reports* live results back as data. Nothing the Bot does should ever be able to corrupt research.
2. **A live execution system is a safety system first and a trading system second.** Every feature is designed so the safe failure mode (no order, flat, locked) is the default, and the risky action (place, modify, override) is the explicit, logged, guarded exception.

---

## 1. Executive Summary

You are not building a "bot page." You are building a **Live Trading Control Tower**: a backend that owns canonical truth about every bot, order, trade, account and rule; a real-time event spine the UI subscribes to; a broker-adapter layer that hides venue differences; and a cockpit UI (likely wired in Emergent) that is a *thin, dumb view over server-authoritative state*. The hard problems here are not UI — they are state reconciliation, idempotent order handling, funded-account rule enforcement, config versioning, and explainability. Get those right and the cockpit is straightforward.

The existing FX-OB-Research-Lab gives us three gifts we should exploit rather than reinvent:

- A **ghost-tracking engine concept already exists** (`ghost_tracker.py`) — observational, non-equity-affecting simulation of "what would have happened." Ghost trading in the live bot is the same idea pointed at *live* market data instead of historical candles. Ghost should be lifted to a shared, first-class simulation core.
- A **file-first, atomic-write, allowlisted storage pattern** already exists in `backend/server.py` (`STORAGE_DOMAINS` already contains `configs`). This is a sane, durable, local-first persistence pattern we can mirror — though the live bot needs a real transactional store (SQLite at minimum) because it has concurrent writers and money on the line, which the research store does not.
- An established **domain vocabulary** (OB / BOS / CHoCH, sessions Asia/London/London Lull/New York/Outside, TE % entries, FFT/BE/protection, retest survival, reverse cancels). The live bot's rule model should speak exactly this language so configs map 1:1 and explainability reads naturally.

**Top-level recommendation:** Build the Bot as a **separate repository / separate service** from the Research Lab, sharing only a versioned **Config Contract** (a JSON schema + a small shared Python package) and a one-directional promotion path. Architect it as **nine cooperating engines behind one API gateway**, with a single **append-only event log as the source of truth for "why,"** and a **server-authoritative state store as the source of truth for "what."** FX is the first and only concrete implementation; Futures is reserved as a sibling top-level domain that reuses the core but never shares FX-specific execution logic.

**The single most important architectural rule:** the bot's internal state must always be *reconciled against and subordinate to* the broker's actual state. The broker is reality. Anytime internal state and broker state disagree, the bot must lock, surface the discrepancy, and refuse to trade until reconciled. Most live-bot disasters are state-divergence disasters, not strategy disasters.

---

## 2. Recommended Top-Level Architecture

### 2.1 The nine engines

The spec's nine layers map cleanly onto nine modules. They are presented here as logical engines (bounded contexts), not necessarily separate processes — see §3 for the deployment view.

| # | Engine | One-line responsibility | Owns (writes) | Reads |
|---|--------|------------------------|---------------|-------|
| 1 | **Strategy Brain** | Turns market data + active config rules into *intents* ("I want to place this resting order because…"). Pure decision logic, no broker side-effects. | Signals, Intents, StructureEvents | MarketData, ConfigVersion, RiskState |
| 2 | **Execution Engine** | Turns approved intents into broker orders; manages order/trade lifecycle; the *only* component allowed to call the broker for state changes. | Orders, Trades, fills | Intents, BrokerConnection, RiskState |
| 3 | **Control UI / Cockpit** | Thin real-time view + command sender. Renders state; never computes it. | (nothing canonical) | everything via API/WS |
| 4 | **Funded Account Protection Engine** | The veto layer. Evaluates every intent and live position against funded rules; can force-flatten and lock. | RiskState, lockouts, FundedAccountRuleSet evaluations | Trades, Account, NewsEvents |
| 5 | **Ghost/Demo/Live Trade Engine** | Routes every intent to one of three execution targets; runs parallel ghost models off the same signal. | GhostTrades; execution-mode routing | Signals, MarketData |
| 6 | **Performance + Analytics Engine** | Aggregates closed trades into metrics; compares live vs research expectation; detects edge decay. | PerformanceSnapshots, decay alerts | Trades, GhostTrades, ConfigVersion stats |
| 7 | **Event / Audit Log Engine** | Append-only, immutable record of every decision, action, override and reason. The system's memory and explainability backbone. | BotEvents (append-only) | (subscribes to all) |
| 8 | **Broker / API Integration Layer** | Adapter abstraction over each venue; normalises orders, fills, account state, reconciliation, disconnect handling. | BrokerConnection state, raw broker echoes | broker APIs |
| 9 | **Config Import / Versioning Layer** | Imports/validates/promotes configs from the Research Lab; pins every trade to an immutable ConfigVersion. | StrategyConfig, ConfigVersion, ConfigPromotion | Lab exports |

### 2.2 Control and data flow

```
                         FX-OB-Research-Lab  (separate system)
                                   │  exports config bundle (read-only)
                                   ▼
                    ┌────────────────────────────┐
                    │ (9) Config Import/Versioning│  validate → pin ConfigVersion
                    └──────────────┬─────────────┘
                                   ▼
   MarketData ─► (1) Strategy Brain ─► Intent
                                   │
                                   ▼
                    ┌────────────────────────────┐
                    │ (4) Funded Protection Engine│  VETO / ALLOW / DOWNSIZE  ◄── RiskState
                    └──────────────┬─────────────┘
                          allow    │   (every decision → Event Log)
                                   ▼
                    ┌────────────────────────────┐
                    │ (5) Ghost/Demo/Live router  │
                    └───┬───────────┬────────────┘
              ghost │       demo/live │
                    ▼                 ▼
        GhostTradeEngine     (2) Execution Engine ─► (8) Broker Adapter ─► venue
                    │                 │  fills/echoes        │
                    └──────┬──────────┘◄─────reconcile───────┘
                           ▼
                 (6) Performance/Analytics  +  (7) Event/Audit Log (append-only)
                           ▼
                 (3) Cockpit UI  ◄── REST (commands/snapshots) + WebSocket (live stream)
```

**Critical invariant:** the Strategy Brain *proposes*, the Protection Engine *disposes*, the Execution Engine *acts*, the Event Log *remembers*. No engine skips the chain. The Brain can never place an order directly; the Execution Engine can never place an order the Protection Engine has not cleared.

### 2.3 Three "sources of truth," cleanly separated

A recurring failure in trading systems is conflating these. Keep them distinct:

- **Source of truth for "what is real" → the broker**, mirrored into the local `Order`/`Trade` tables and continuously reconciled. Never trust internal state over a broker echo.
- **Source of truth for "what we decided and why" → the append-only Event Log.** Immutable, never updated in place.
- **Source of truth for "what rules apply" → the pinned ConfigVersion**, immutable once promoted.

---

## 3. Proposed Backend / Service Architecture

### 3.1 Shape: a modular monolith now, service-extractable later

Do **not** start with microservices. Start with a **single Python service (FastAPI)** — consistent with the Lab's existing stack — organised internally as the nine engines with hard module boundaries and an internal event bus. This gives you transactional simplicity (one DB, one process, easy reconciliation) while preserving the seams to split later (the Broker Adapter and the Strategy Brain are the natural first extractions).

One process is *also safer*: order placement, risk veto, and state reconciliation all sharing one transactional context removes whole classes of distributed-consistency bugs that are catastrophic when money is involved.

```
live-bot/                         # SEPARATE REPO from FX-OB-Research-Lab
  app/
    api/            # FastAPI routers: REST + WS gateway (thin)
    brain/          # (1) Strategy Brain — pure functions, no I/O
    execution/      # (2) Execution Engine — order/trade lifecycle state machine
    protection/     # (4) Funded Account Protection Engine — veto rules
    sim/            # (5) Ghost/Demo/Live router + ghost simulation core
    analytics/      # (6) Performance + edge-decay
    events/         # (7) append-only event log writer + replayer
    brokers/        # (8) adapter interface + per-venue implementations
    config/         # (9) import/validate/version/promote
    domain/         # shared entities, enums, the Config Contract models
    state/          # persistence layer (repositories), reconciliation loop
    bus/            # in-process pub/sub event bus + WS fan-out
    runtime/        # the per-bot tick loop / scheduler / supervisor
  contracts/        # versioned JSON schemas (shared with Lab via package or submodule)
  tests/
```

### 3.2 The runtime: one supervised loop per BotInstance

Each `BotInstance` (one pair × one account × one config) runs as a **supervised async task** with an explicit state machine: `Armed / Waiting / InTrade / Paused / Locked / Error`. A central **Supervisor** owns the lifecycle (start, pause, kill, restart-after-crash) and guarantees that a crashed bot task comes back in a *safe* state (Locked, pending reconciliation) — never auto-resumes trading blind.

The loop is **event-driven, not polling-driven** where possible: market data ticks and broker events drive it. Each iteration is: ingest → Brain evaluates → Protection vetoes → route → act → log → emit state delta. Every iteration is wrapped so an exception transitions the bot to `Error`, never to silent continuation.

### 3.3 State persistence model

- **Engine:** **SQLite (WAL mode) for v1**, with the repository pattern so a later move to Postgres is a config change, not a rewrite. SQLite is local-first (matching your Emergent/local dev posture), transactional, and more than fast enough for human-speed FX rule trading. Do **not** use the Lab's flat-JSON pattern for live state — it has no transactions and concurrent writers will corrupt it. (Flat JSON is fine for *config snapshots*, not for *live order state*.)
- **Append-only Event Log:** a single `bot_events` table, insert-only, never updated. This table can be replayed to rebuild derived state and is the audit record. Consider also mirroring events to a plain newline-delimited JSON file for tamper-evident, grep-able backup (cheap insurance).
- **Reconciliation snapshots:** on every reconciliation cycle, store the broker's reported positions/orders so divergences are diffable after the fact.
- **Idempotency:** every outbound order carries a **client-generated idempotency key** (`clientOrderId`) persisted *before* the broker call. On restart or retry, the bot looks up the key rather than re-sending.

### 3.4 Broker adapter abstraction

A single Python `Protocol`/ABC — `BrokerAdapter` — defines the contract. Each venue implements it. The rest of the system speaks only to the interface.

```
BrokerAdapter (interface)
  connect() / disconnect() / health()
  place_order(NormalizedOrder) -> BrokerOrderRef          # idempotent on clientOrderId
  modify_order(ref, changes) -> BrokerOrderRef
  cancel_order(ref) -> ack
  get_open_orders() / get_open_positions() / get_account() # for reconciliation
  subscribe_fills(callback)        # or poll if venue has no stream
  stream_prices(symbols, callback) # market data, if venue provides it
  normalize_symbol(internal) <-> venue_symbol
  capabilities() -> {supports_trailing_stop, min_lot, ...}
```

Implementations to plan for (decide which in §13): a **MockBroker** (deterministic, for dev/CI — *the first thing you build*), a **DemoBroker** (real broker's demo/paper endpoint), and one or more **LiveBroker** venues (e.g. OANDA / a MetaTrader bridge / a prop-firm-approved broker). FX-specific concepts (pips, swap, weekend gap) live in FX adapters; never leak them into the core.

### 3.5 Real-time event streaming model

- **Inbound to UI:** one **WebSocket** per UI session, server pushes typed events: `bot.state`, `order.update`, `trade.update`, `ghost.update`, `risk.update`, `event.log`, `alert`. Each carries a monotonically increasing `seq` so the client can detect gaps and request a resync.
- **Snapshot + delta:** on WS connect, the client first calls a REST `GET /snapshot` for full current state, then applies WS deltas. This avoids the "first event is meaningless without context" problem and makes reconnection trivial.
- **Internal bus:** an in-process async pub/sub. Engines publish facts; the WS gateway, the event-log writer, and the analytics engine all subscribe. This decouples the engines and means "log everything" and "stream everything" are automatic, not per-feature wiring.

### 3.6 Protecting against accidental live actions during development

This deserves explicit architecture, not discipline:

- A process-level **`EXECUTION_MODE` env** (`mock` | `demo` | `live`) that the Broker Adapter factory reads. `live` requires a **second, separate** signal (e.g. `LIVE_TRADING_ARMED=true` plus a per-bot `live_enabled` flag in the DB). Two independent switches must agree before any real order is possible.
- The MockBroker is the default. You cannot accidentally hit a live venue from a fresh checkout.
- A loud, persistent **mode banner** in both API responses (`X-Execution-Mode` header) and the UI.
- Live broker credentials live only in a separate secrets store/env that dev machines don't have.

---

## 4. Proposed Data Model

All 24 entities from the spec are accommodated below, grouped by concern. Types are indicative; this is the schema audit, not the migration.

### 4.1 Identity & configuration

**StrategyConfig** — the logical strategy (stable id, name, owner, FX/Futures domain, source Lab project ref). Mutable metadata only.

**ConfigVersion** — **immutable** snapshot of all rules for one version of a StrategyConfig. This is the unit every trade pins to. Fields: `config_id`, `version` (monotonic), `content_hash`, `created_at`, `promoted_from` (research run id), `research_stats` (embedded expected metrics: net R, win rate, expectancy, sample size, date range, validation %), `rule_set` (the full nested rule tree — see §4.4), `status` (`draft/forward_test/demo/small_live/full_live/disabled`), `lifecycle` (the promotion stage). Once written, never edited — a change creates version N+1.

**ConfigPromotion** — a record of a config moving along the promotion ladder (research → forward → demo → small live → full live, or a demotion/disable). Fields: `config_id`, `from_version`, `to_version`, `from_stage`, `to_stage`, `reason`, `actor` (human/system), `gate_results` (which validation gates passed), `timestamp`. Append-only.

### 4.2 Accounts & instruments

**Account** — a tradeable account (broker, login, base currency, timezone, type: demo/live/funded). Links to a BrokerConnection.

**FundedAccountRuleSet** — the prop-firm rule envelope attached to an Account: `account_size`, `daily_loss_limit`, `max_drawdown`, `dd_type` (`static/trailing`), `trailing_anchor` (`balance/equity/highwater`), `profit_target`, `min_trading_days`, `consistency_rule` (optional, with params), `news_restrictions`, `weekend_holding_allowed`, `max_lot`, `max_risk_exposure`, `account_timezone`, `daily_reset_time`. Versioned (prop firms change rules).

**Instrument** — a tradeable symbol's *static* properties: `symbol`, `domain` (FX/Futures), `pip_size`/`tick_size`, `contract_size`, `min_lot`, `lot_step`, `margin`, `trading_hours`, `venue_symbol_map`. (Distinct from **Pair**.)

**Pair** — an FX-specific instrument view (base/quote currency, correlation group, typical spread, session activity profile). Futures will have its own `Contract`/`ContractSeries` rather than reusing Pair — see §10.

**BrokerConnection** — a live link's state: `adapter_type`, `status` (`connected/degraded/disconnected`), `last_heartbeat`, `last_reconcile_at`, `credentials_ref`, `capabilities`.

### 4.3 Runtime entities

**BotInstance** — one running bot = `pair` × `account` × `config_version`. Fields: `status` (Armed/Waiting/InTrade/Paused/Locked/Error), `execution_mode` (ghost/demo/live), `risk_state_ref`, `active_config_version`, `live_enabled` (the per-bot live switch), health flags, `last_action`. This is the object the Overview card renders.

**RiskState** — *the* live risk ledger per bot/account, recomputed continuously: `realized_pl_today`, `floating_pl`, `dd_used`, `dd_buffer_remaining`, `risk_deployed_today`, `open_risk`, `trades_today`, `lockout` (bool + reason), `danger_zone` (bool), `daily_anchor` (the equity/balance the daily limit is measured from), `reset_at`. The Protection Engine reads and writes this.

### 4.4 The rule tree (granular control surface)

This is the heart of "maximum granular control." The spec's §B controls form a **nested, addressable rule tree** inside each ConfigVersion. Every node is individually enable/disable-able and individually addressed (so the UI and the explainability log can reference exactly one rule).

```
ConfigVersion.rule_set
  └─ SessionRule           (per session: Asia/London/London Lull/NY/Outside; enabled; time windows; news/session restrictions)
      └─ DirectionRule      (Long / Short; enabled)
          └─ StructureRule  (structure_type: BOS/CHoCH/…; OB context: bullish/bearish OB; enabled)
              └─ EntryModelRule  (entry model: TE 25% / OB edge / confirmation / penetration; max_penetration; entry/stop buffers)
                  ├─ RiskRule        (risk %; SL model; TP model in R; BE trigger in R; max risk money)
                  ├─ ProtectionRule  (FFT/protection enabled; BE-to-1R; protection exits; per the Protection Lab models)
                  └─ CancelRule      (cancel after X candles/minutes; cancel if structure flips; cancel if price exits/invalidates OB; spread/slippage limits; news blackout)
  plus per-node: manual_override_permission, config_version_lock
```

Modelling note: store this as a **typed nested document** on the immutable ConfigVersion (JSON column), *and* index the leaf rules into queryable tables (`session_rule`, `entry_model_rule`, `risk_rule`, `protection_rule`, `cancel_rule`) so the UI and analytics can filter/aggregate by rule dimension. The document is canonical truth; the tables are a derived read model.

### 4.5 Decisions & market context

**Signal** — a Brain-generated trade idea before it becomes an order: `bot_id`, `config_version`, `pair`, `direction`, `structure_event_ref`, `entry_model`, proposed `entry/sl/tp/risk`, `created_at`, the **full rule path** that produced it (for explainability), and `decision_trace` (why this, why now).

**StructureEvent** — a detected market-structure fact: `type` (BOS/CHoCH/OB-formed/OB-invalidated/retest), `pair`, `timeframe`, `price_levels`, `ob_id`, `timestamp`. Mirrors the Lab's structure vocabulary.

**NewsEvent** — `currency`, `impact`, `scheduled_time`, `blackout_window`, `source`. Drives news blackout enforcement and "next news blackout" on the card.

### 4.6 Orders, trades, ghosts

**Order** — a resting/pending/working broker order: `clientOrderId` (idempotency key), `broker_ref`, `bot_id`, `signal_ref`, `config_version`, `ob_id`/source structure id, `direction`, `session`, `entry`, `sl`, `tp`, `risk_money`, `risk_pct`, `size`, `state` (`pending/working/filled/cancelled/rejected`), `created_at`, `expected_cancel_conditions`, `news_exposure`, `spread_status`. Drives the §C panel.

**Trade** — a filled position: entry/sl/tp, `current_r`, `floating_pl`, `be_eligible`, `protection_status`, `time_in_trade`, `session_entered`, `original_plan` (frozen at fill), `current_deviation` (live vs plan), `config_version`, `auto_management_enabled`, close info. Drives §D.

**GhostTrade** — a hypothetical trade tracked off live market data, **no broker order**. Same shape as Trade plus `ghost_model_id` (which alternative ruleset), `source_signal_ref` (the live signal it shadows), `divergence_from_live`. Mirrors `ghost_tracker.py` fields (`ghost_outcome`, `ghost_r`, `ghost_mae`, `ghost_mfe`, `ghost_fill_delay`, etc.) so research ghosts and live ghosts share a schema.

### 4.7 Audit & analytics

**ManualAction** — every human intervention: `actor`, `action_type` (cancel/move-entry/move-sl/move-tp/reduce/close/disable-automgmt/override), `target` (order/trade/bot id), `before_state`, `after_state`, `reason` (required for overrides), `timestamp`. Before/after capture is mandatory per spec §D.

**BotEvent** — the append-only universal event: `seq`, `bot_id`, `category` (decision/order/trade/risk/manual/system/error), `code`, `human_explanation`, `structured_payload`, `caused_by` (ref to signal/intent/rule), `timestamp`. This is what makes the bot "always explain its actions."

**PerformanceSnapshot** — periodic + per-close rollups: equity point, daily/weekly/monthly P/L, drawdown, win rate, profit factor, avg R, expectancy, plus dimensional breakdowns (long/short, session, pair, structure, entry model, TP model, BE/protection on-vs-off) and `live_vs_research_delta`. Always tagged with `config_version`.

### 4.8 The one non-negotiable rule

**Every Order, Trade and GhostTrade carries the immutable `config_version` (and its `content_hash`) that produced it.** This is what makes live-vs-research comparison and edge-decay detection possible, and what makes a post-mortem answerable. Enforce it at the schema level (non-null FK), not by convention.

---

## 5. Proposed API / WebSocket Contract

Designed to be **wired from Emergent quickly**: predictable REST resources for reads/commands, one WebSocket for the live stream, snapshot-then-delta so the UI is trivial to (re)hydrate.

### 5.1 Conventions

- Base path `/api/v1`. Versioned from day one.
- Every response includes `X-Execution-Mode` (`mock/demo/live`) and the server `seq` high-water mark.
- All **state-changing commands are POST**, carry an **`Idempotency-Key` header**, and return the resulting event(s), not just `200 OK`. Commands are *requests to the server*, which validates against Protection rules before acting — the UI never assumes a command succeeded; it waits for the confirming event.
- Reads are cheap and cacheable; commands are guarded and logged.

### 5.2 REST surface (representative, not exhaustive)

```
# Snapshots / reads
GET  /snapshot                          # full current state for UI hydration
GET  /bots                              # overview cards (§A)
GET  /bots/{id}                         # detailed control panel
GET  /bots/{id}/orders                  # resting/pending orders (§C)
GET  /bots/{id}/trades                  # active trades (§D)
GET  /bots/{id}/ghosts                  # ghost trades (§E)
GET  /bots/{id}/events?since=seq        # audit log tail (§7)
GET  /accounts/{id}/risk                # RiskState + funded rules (§F)
GET  /analytics/performance?config_version=…&dim=session|pair|structure|entry|tp
GET  /configs / GET /configs/{id}/versions

# Bot lifecycle commands  (all POST, idempotent, logged)
POST /bots/{id}/pause
POST /bots/{id}/arm
POST /bots/{id}/lock
POST /bots/{id}/kill-orders             # cancel all working orders for this bot
POST /bots/{id}/flatten                 # close all positions for this bot
POST /bots/{id}/reduce-risk             # scale risk profile down
POST /bots/{id}/execution-mode          # ghost|demo|live (live double-guarded)

# Order-level manual actions (§C)
POST /orders/{id}/cancel | move-entry | move-sl | move-tp | reduce | to-ghost

# Trade-level manual actions (§D)  — each captures before/after, override needs reason
POST /trades/{id}/sl-to-be | sl | tp | reduce | close | auto-mgmt:off | auto-mgmt:on

# Config promotion (§H)
POST /configs/import                    # validate + stage a Lab export
POST /configs/{id}/versions/{v}/promote # advance stage (gated)
POST /configs/{id}/versions/{v}/disable # kill switch for a config

# Global safety (§I)
POST /safety/global-kill                # stop the world: cancel all, flatten all, lock all
POST /safety/manual-only                # no autonomous actions, manual commands only
POST /safety/no-trade                   # observe only
```

### 5.3 WebSocket contract

```
WS /stream
  → on connect: client sends {auth, subscriptions:[bot ids | "all"], last_seq}
  ← server replays any missed events since last_seq (or tells client to re-snapshot if gap too large)
  ← then live frames, each: { seq, type, bot_id, ts, payload }

  types: bot.state | order.update | trade.update | ghost.update |
         risk.update | event.log | alert | broker.health | reconcile.diff
```

The UI keeps a local store keyed by entity id, applies deltas by `seq`, and re-snapshots on any detected gap. No business logic in the client.

### 5.4 Safety of commands

- The server **re-validates every command against current Protection state at execution time** — a command that was safe when the button rendered may be unsafe now. The UI's job is to *request*; the server's job is to *decide*.
- Override commands (anything that bypasses a protection rule) require an explicit `override_reason` and produce a distinct `ManualAction` + `BotEvent` with `category=manual, override=true`.
- Destructive commands (`flatten`, `global-kill`) are idempotent and safe to retry — re-issuing does not double-act because they converge on a target state ("be flat"), not a delta ("sell 1 lot").

---

## 6. Research Lab Integration Plan

This is the seam between the two systems. Keep it **one-directional and contract-based.**

### 6.1 What stays separate vs shared

- **Separate:** processes, databases, deploys, repos. The Bot must never write to the Lab's stores. The Lab must never call the Bot's order paths.
- **Shared:** exactly one thing — a **versioned Config Contract** (`contracts/config.schema.json` + a small `fxob-config` Python package with Pydantic models). Both sides depend on the package; neither side reaches into the other's internals. This is the only coupling, and it is explicit and versioned.

### 6.2 Config schema (the contract)

The Lab's current export (`config.json`: `symbol, detection_tf, execution_tf, rr, stop_buffer, entry_buffer, verify_ticks, execution_mode`) is **too thin** to drive live execution — it describes a backtest, not a live rule tree. The contract must be **a superset**: it carries the existing fields *plus* the full §4.4 rule tree *plus* the embedded research stats. Proposed top-level shape:

```jsonc
{
  "contract_version": "1.0.0",
  "config_id": "EURUSD_London_BOS_TE25",
  "version": 7,
  "content_hash": "sha256:…",          // computed over rule_set, immutable
  "domain": "FX",
  "instrument": "EURUSD",
  "source": {                           // provenance back to the Lab
    "lab_project": "…", "research_run_id": "…",
    "exported_at": "…", "lab_commit": "…"
  },
  "research_stats": {                   // expected performance, frozen
    "net_r": 2.6, "win_rate": 33.3, "expectancy": 0.43,
    "trades": 6, "validation": 98.7,
    "date_from": "2025-05-18", "date_to": "2026-05-18",
    "sample_warning": "low_sample"      // surfaced, not hidden
  },
  "rule_set": { … nested SessionRule→…→Cancel tree from §4.4 … },
  "defaults": { "detection_tf": "M15", "execution_tf": "1m" }
}
```

### 6.3 Promotion workflow (the ladder)

```
Research config (validated in Lab)
   │  export bundle (contract JSON + research_stats)
   ▼
[1] FORWARD TEST   → imported as ConfigVersion(status=forward_test); runs in GHOST mode only,
   │                  off live market data. No broker contact. Compare ghost vs research_stats.
   ▼ gate: N forward trades, live-vs-research delta within tolerance
[2] DEMO           → status=demo; executes on DemoBroker. Real fills, fake money.
   │ gate: demo expectancy ≥ floor, no rule breaches, broker reconciliation clean
[3] SMALL LIVE     → status=small_live; live broker, hard-capped tiny risk (e.g. 0.1%).
   │ gate: live-vs-research delta within tolerance over M trades, zero safety incidents
[4] FULL LIVE      → status=full_live; configured risk, full funded-rule protection.
```

Each transition is a **`ConfigPromotion`** record with gate results and an actor. **Promotion is never automatic by default** — a human approves each step, but the system computes and presents the gate evidence. (Auto-promotion is an opt-in §13 decision.)

### 6.4 Validation before activation

Before any ConfigVersion can be armed: schema validation against the contract; `content_hash` recomputation and match; instrument supported by the target broker adapter; risk numbers within the account's FundedAccountRuleSet; no rule node referencing a structure/entry model the live Brain doesn't implement; sample-size sanity (warn loudly on thin research like the 6-trade sample above). A config failing any check is **import-blocked**, not silently downgraded.

### 6.5 Live → research feedback (closing the loop)

Live and ghost results are **exported back to the Lab as read-only data** (a results bundle the Lab can import as just another dataset), never by writing into Lab state directly. This lets the Lab compare *realised* performance against its predictions and refine discovery. The Bot owns live truth; the Lab consumes it.

### 6.6 Edge decay detection & auto-disable

The Analytics Engine continuously compares each config's **live distribution vs its frozen `research_stats`** (expectancy, win rate, avg R) using a rolling window. Decay is flagged when the live metric drifts beyond a configurable band for a sustained period, *accounting for sample size* (don't cry decay on 5 trades). On breach: raise a `decay` alert → optionally auto-demote the config one rung (e.g. full_live → small_live) or `disable` it, per policy. Every such action is a `ConfigPromotion` + `BotEvent` with the statistical evidence attached.

---

## 7. Ghost / Demo / Live Trading Model

Ghost is **first-class**, reusing the proven `ghost_tracker.py` philosophy (observational, never touches equity, additive fields). The three modes are one routing decision, not three code paths.

### 7.1 The router

Every Signal that survives Protection is routed by the **execution mode of its BotInstance** *and* fanned out to any attached ghost models:

```
Signal (approved)
  ├─ primary route → LIVE  (real broker order)  ── or ── DEMO (demo broker order)
  └─ ghost fan-out → 0..N GhostModels, each simulated off live ticks, no broker
```

- **Live:** real broker execution, full protection, real money.
- **Demo:** identical code path, demo broker endpoint. Same fills/reconciliation machinery — this is what de-risks the live path before it's live.
- **Ghost:** no broker contact. A `GhostTrade` is born from the same signal and walked forward on live market data using a **GhostModel** (an alternative ruleset). Outcome computed exactly like the research ghost tracker (`ghost_trigger_reached → ghost_fill → ghost_outcome/ghost_r/mae/mfe`).

### 7.2 Multiple ghost models per signal

The spec's example (live takes TE 25%; ghosts track OB edge, TE 50%, confirmation entry, no-BE, deeper penetration) maps to: one `Signal` → a set of `GhostModel` definitions, each a *rule overlay* on the live config. Each produces an independent `GhostTrade` tagged with `ghost_model_id`. This makes the live system a **continuous forward-testing lab**: every live decision spawns counterfactuals you can compare.

### 7.3 Why this matters architecturally

Because ghost runs off the **same live tick feed and the same simulation core** as demo/live's fill logic, ghost results are directly comparable to live — no "the backtest used different data" excuse. The fill/SL/TP/BE/protection walk logic must therefore be a **single shared module** (`sim/walk.py`) used by ghost simulation *and* by the live trade-management reconciler's expectations. Build it once.

### 7.4 Guardrails

- Ghost and demo can **never** emit a broker order — enforced at the router and again at the adapter (a GhostBroker that physically has no `place_order`). Defence in depth.
- Ghost volume can balloon (N models × every signal). Cap ghost models per bot and age out completed ghosts to keep the live store lean; archive to the analytics store.

---

## 8. Funded Account / Risk Protection Model

This is the veto layer and the most safety-critical engine. It sits **between every intent and every execution**, and it also runs a **continuous monitor** independent of new signals (because drawdown can breach from floating P/L with no new orders).

### 8.1 Two enforcement points

1. **Pre-trade veto:** every Signal is evaluated → `ALLOW / DOWNSIZE / VETO` with a reason. Vetoes and downsizes are logged with the exact rule that fired.
2. **Continuous monitor:** a loop recomputes `RiskState` on every tick/fill and can **force-flatten and lock** mid-trade if a breach is imminent.

### 8.2 Rules enforced (per FundedAccountRuleSet)

Daily loss limit, max drawdown (static and trailing — with explicit `trailing_anchor` semantics, the #1 prop-rule footgun), profit target, minimum trading days, optional consistency rule, news restrictions, weekend-holding restriction, max lot / max risk exposure. Plus **timezone-correct daily reset** (the account's timezone, not the server's — another classic bug) and a correct **daily anchor** (what the day's loss is measured *from*).

### 8.3 Protective behaviours

- **Auto-lockout before breach,** not after. Maintain a configurable **buffer** (e.g. stop new trades when the drawdown buffer drops below X% of the daily limit) so normal slippage can't tip you over.
- **Danger-zone warning** state surfaced on the card before lockout.
- **No new trades if the remaining buffer can't absorb the proposed trade's worst-case loss** (size the check on the SL distance, not on hope).
- **Force-close before news** when the rule requires it; refuse to open positions that would still be open into a blackout.
- **Prevent rule-breaking trades outright** — a trade that *could* breach is vetoed even if it's "probably fine."
- **Override logging:** if the human overrides any protection, it executes only with an explicit reason and a prominent `override=true` audit record. The system never silently allows a breach.

### 8.4 Design stances

- Protection rules are **declarative and account-versioned** (prop firms change rules; you must be able to reproduce which rules applied on a given day).
- The monitor is **fail-safe**: if it can't compute RiskState (missing price, broker silent), it **locks** rather than assuming safety.
- Trailing-drawdown math is notoriously firm-specific. Treat each firm's trailing rule as a small strategy object with its own tested implementation, not a single global formula.

---

## 9. UI / Cockpit Module Map

The cockpit is a **thin, server-authoritative view** (Emergent-friendly). Modules map directly onto the REST/WS contract in §5. No module computes trading state locally; each renders server state and sends guarded commands.

| Cockpit module | Spec | Data source | Key actions |
|---|---|---|---|
| **Fleet Overview** | §A | `GET /bots` + `bot.state`/`risk.update` WS | per-card: pause, kill-orders, flatten, reduce-risk, open panel |
| **Bot Control Panel** | §B | `GET /bots/{id}` (rule tree) | enable/disable any rule node; edit risk/SL/TP/BE/protection/cancel; version lock |
| **Resting Orders** | §C | `GET /bots/{id}/orders` + `order.update` | cancel, move entry/SL/TP, reduce, convert-to-ghost, pause source strategy |
| **Active Trades** | §D | `GET /bots/{id}/trades` + `trade.update` | SL→BE, SL custom, move TP, partial close, close, auto-mgmt on/off |
| **Ghost Lab** | §E | `GET /bots/{id}/ghosts` + `ghost.update` | add/remove ghost models, compare ghost vs live |
| **Account & Protection** | §F | `GET /accounts/{id}/risk` + `risk.update` | view funded rules, buffers, lockouts; override (reason-gated) |
| **Performance** | §G | `GET /analytics/performance` | filter by config_version/session/pair/structure/entry/TP; live-vs-research overlay |
| **Audit / Event Log** | §7 | `GET /bots/{id}/events` + `event.log` | the "why" feed; filter by category; export |
| **Config & Promotion** | §H | `GET /configs…` | import, view promotion ladder, promote/disable (gated) |
| **Safety Bar** (global, always visible) | §I | WS `broker.health`/`alert` | global kill, manual-only, no-trade, mode banner |

UX stances: the **mode banner (mock/demo/live) is always visible and colour-coded**; destructive actions confirm and show the resulting target state; every manual action shows its before/after and lands in the audit feed; "armed/locked" status is unmissable. The card statuses (`Armed/Waiting/InTrade/Paused/Locked/Error`) are driven entirely by server `bot.state`.

---

## 10. FX vs Futures Separation Plan

FX is the only concrete implementation now. Futures is reserved as a **sibling top-level domain**, not a retrofit. The rule: **share the orchestration core; never share instrument-specific execution semantics.**

**Shared core (domain-agnostic):** the nine engines' *orchestration* — Strategy Brain framework, intent→veto→route→act pipeline, Event Log, Ghost/Demo/Live router, the simulation walk core, Performance engine, Config Import/Versioning, the API/WS gateway, the BrokerAdapter *interface*, RiskState plumbing, the Supervisor/runtime.

**FX-specific:** pip/point math, spread modelling, swap/rollover, weekend gap handling, FX session map (Asia/London/NY), `Pair`/correlation groups, FX broker adapters, FX news mapping (currency-based).

**Futures-specific (future):** tick value & contract multipliers, margin/SPAN, contract expiry & roll, exchange session calendars, `Contract`/`ContractSeries` entities, futures broker/exchange adapters, futures news mapping (instrument-based).

**How to avoid painting into a corner:**
- Put a **`domain` discriminator** on every domain entity (`FX`/`Futures`) from day one — even though only FX exists.
- Express instrument-specific math behind an **`InstrumentSpec` interface** (`price_to_pl`, `risk_to_size`, `round_price`, `session_for`), with an `FxInstrumentSpec` implementation now and a `FuturesInstrumentSpec` later. The Brain and Execution Engine call the interface, never FX math directly.
- Keep FX and Futures as **separate top-level UI sections** sharing component primitives but not screens.
- **Don't build Futures abstractions speculatively.** Build FX concretely behind clean interfaces; add the second implementation only when Futures is real. The corner-avoidance is the *interface seam* (`InstrumentSpec`, `BrokerAdapter`, `domain` field), not premature generality.

---

## 11. Implementation Phases

Each phase is independently shippable and leaves the system in a safe state. Estimates omitted by design — sequence and gates matter more.

### Phase 0 — Architecture, data model, contracts (no behaviour)
- **Goal:** lock the Config Contract, the data model, and the API/WS contract before any logic.
- **Modules:** `contracts/`, `domain/`, schema migrations, OpenAPI/WS spec doc.
- **Deliverable:** versioned `config.schema.json`, ER diagram, API/WS contract doc, the nine-engine module skeleton with empty interfaces.
- **Validation:** schema validates the existing Lab `config.json` (as a subset) and a full rule-tree example; contract reviewed against §4/§5.
- **Risks:** over-modelling Futures now; thin config schema leaking through. Mitigate by freezing the FX contract and gating Futures behind the `domain` field.

### Phase 1 — Backend skeleton + MockBroker
- **Goal:** a running service with the supervised bot loop driving a deterministic MockBroker; full event/audit log; reconciliation loop; SQLite state.
- **Modules:** `runtime/`, `state/`, `events/`, `brokers/mock`, `bus/`, `api/` (snapshot + WS).
- **Deliverable:** a bot you can arm/pause/lock/kill via API that places mock orders and logs every decision with a reason.
- **Validation:** crash a bot mid-trade → it restarts Locked and reconciles; idempotency keys prevent duplicate mock orders; replay the event log to rebuild state.
- **Risks:** state divergence logic is the hard part — build reconciliation *first*, not last.

### Phase 2 — Cockpit with mock data
- **Goal:** Emergent UI wired to the live WS/REST against mock bots.
- **Modules:** all §9 cockpit modules; snapshot-then-delta client store.
- **Deliverable:** full cockpit operating a fleet of mock bots; manual actions round-trip with before/after audit.
- **Validation:** kill WS → client re-snapshots cleanly; every button maps to a guarded command; mode banner reads `mock`.
- **Risks:** UI computing state locally — forbid it in review.

### Phase 3 — Config import from Research Lab
- **Goal:** import/validate/version/promote configs; pin ConfigVersion to every order.
- **Modules:** `config/`, the shared `fxob-config` package, promotion ladder, validation gates.
- **Deliverable:** a Lab export becomes an immutable, armed ConfigVersion in forward-test (ghost) status.
- **Validation:** content-hash immutability; thin-sample warning fires on the 6-trade example; invalid config is import-blocked.
- **Risks:** contract drift between Lab and Bot — versioned package + CI check on both sides.

### Phase 4 — Ghost trading engine
- **Goal:** first-class ghosting off live market data; multiple ghost models per signal; shared walk core.
- **Modules:** `sim/walk.py`, `sim/ghost`, GhostBroker, ghost analytics.
- **Deliverable:** live signals spawn ghost counterfactuals; ghost-vs-live comparison in the Ghost Lab.
- **Validation:** ghost results reproduce `ghost_tracker.py` semantics on a known case; ghosts can never reach a broker.
- **Risks:** ghost volume blow-up — cap and archive.

### Phase 5 — Demo broker integration
- **Goal:** real fills, fake money; exercise the whole order lifecycle and reconciliation against a real venue.
- **Modules:** `brokers/demo/<venue>`, fill stream, reconciliation hardening.
- **Deliverable:** configs in `demo` stage trading a demo account end-to-end.
- **Validation:** broker reconciliation diff is always empty in steady state; disconnect → bot Locks and recovers; partial fills handled.
- **Risks:** venue quirks (symbol mapping, partial fills, rejects) — this is where the adapter earns its keep.

### Phase 6 — Funded-account / risk protection
- **Goal:** the veto layer + continuous monitor + funded rule sets, enforced on demo first.
- **Modules:** `protection/`, RiskState ledger, trailing-DD implementations, news/session enforcement.
- **Deliverable:** demo configs respect daily loss, drawdown (static+trailing), buffers, news, weekend, lockouts; overrides logged.
- **Validation:** simulate a drawdown approach → auto-lockout before breach; timezone reset correct; force-close-before-news works.
- **Risks:** trailing-DD math per firm; clock/timezone bugs. Test each firm rule in isolation.

### Phase 7 — Live execution with hard safety rails
- **Goal:** real money, smallest possible, behind double-armed switches and full protection.
- **Modules:** `brokers/live/<venue>`, the `live_enabled` + `LIVE_TRADING_ARMED` double guard, small-live risk cap.
- **Deliverable:** a single config at `small_live` (e.g. 0.1% risk) trading real, fully protected and audited.
- **Validation:** global kill flattens and locks the world; live-vs-research delta tracked; zero unreconciled states tolerated.
- **Risks:** this is the dangerous phase — gate entry on a written go-live checklist (§12).

### Phase 8 — Analytics & live-vs-research edge monitoring
- **Goal:** full performance breakdowns; edge-decay detection; auto-demote/disable policy.
- **Modules:** `analytics/`, decay detector, ConfigPromotion automation hooks.
- **Deliverable:** dashboards per config_version with live-vs-research overlay; decay alerts that can demote/disable.
- **Validation:** decay detector respects sample size; an injected degraded config triggers demotion with statistical evidence.
- **Risks:** false-positive decay on small samples — bake sample-size gating into every comparison.

---

## 12. Key Risks & Safeguards

**State divergence (the #1 killer).** Internal state and broker state drift → phantom or duplicate positions. *Safeguard:* continuous reconciliation; broker is always truth; any diff → lock + alert; idempotency keys on every order; reconciliation built in Phase 1, not bolted on.

**Duplicate / runaway orders.** Retries, restarts, or a hot loop fire the same order twice. *Safeguard:* persisted `clientOrderId` before sending; adapter idempotency; max-orders-per-pair and max-simultaneous-trades caps; a circuit breaker that locks a bot exceeding an order-rate threshold.

**Broker disconnect mid-trade.** *Safeguard:* health heartbeat; on disconnect → bot Locks, no new orders, surfaces state; on reconnect → reconcile before resuming; never assume "no news is good news."

**Crash / restart.** *Safeguard:* event-log replay + reconciliation rebuild state; bots return Locked, never auto-trading; the Supervisor owns recovery.

**Funded-rule breach.** *Safeguard:* the entire §8 model — pre-trade veto + continuous monitor + buffers + fail-safe-locks. Treat a breach as a catastrophic, never-acceptable outcome.

**Config / research mismatch.** A live config that no longer matches what research validated. *Safeguard:* immutable content-hashed ConfigVersion on every trade; validation gates; live-vs-research decay monitoring.

**Accidental live action in dev.** *Safeguard:* double-armed switch (`EXECUTION_MODE=live` *and* `LIVE_TRADING_ARMED` *and* per-bot `live_enabled`); MockBroker default; separated live secrets; always-visible mode banner.

**Clock & timezone errors.** Daily reset, news windows, session boundaries all timezone-sensitive. *Safeguard:* store everything UTC; account-timezone for funded resets; explicit session boundary constants (mirror the Lab's) tested at DST edges.

**Thin-sample over-confidence.** Promoting a config validated on 6 trades. *Safeguard:* sample-size warnings at import and in every live-vs-research comparison; promotion gates require minimum live samples.

**Data integrity of the audit log.** *Safeguard:* append-only, never-update; monotonic `seq`; optional file mirror; before/after capture mandatory on manual actions.

---

## 13. Open Decisions / Questions Before Coding

These are genuinely yours and should be settled before Phase 1. They are not assumed in this audit.

1. **Broker(s).** Which FX broker/venue for demo and live? (OANDA REST, a MetaTrader 4/5 bridge, cTrader, or a specific prop-firm-approved broker?) This drives the first real adapter and the order/fill model. *Recommend deciding demo + live venue together so the adapter is built once.*
2. **Prop firm(s) & exact funded rules.** Which firm(s), and their precise trailing-drawdown semantics, consistency rules, and reset times? Trailing-DD math is firm-specific and must be implemented per firm.
3. **Persistence engine.** SQLite (recommended for v1, local-first) vs Postgres from the start (if you expect multi-machine/hosted soon). The repository pattern keeps this swappable, but pick a default.
4. **Hosting / runtime location.** Local-first on your machine (matches the Emergent/Lab posture) vs a always-on VPS (required for true 24/5 FX automation — a laptop that sleeps can't manage a live trade). This materially affects the disconnect/recovery design.
5. **Market data source.** Broker feed vs a separate data provider? Ghost/live comparison depends on a single trusted tick source.
6. **Promotion automation.** Human-approved at every rung (recommended default) vs auto-promote when gates pass? And the exact gate thresholds (sample sizes, delta tolerances).
7. **Config Contract ownership.** Does the Lab adopt the richer contract and export the full rule tree, or does the Bot infer/translate the thin config into a rule tree at import? *Recommend the Lab exports the full contract* so there's one source of rule truth.
8. **How rules are edited live.** Can the cockpit edit a config's rule tree directly (creating a new ConfigVersion), or is the Lab the only place rules are authored and the Bot is read-only on rules? This is a philosophical fork worth settling early.
9. **Multi-user / auth.** Single operator (you) vs multiple, and what authz the command endpoints need.
10. **News data source** for blackout enforcement (which calendar/API, and its reliability SLA).

---

## 14. Claude's Own Improvement Suggestions

**Things missing from the spec worth adding:**

- **A "shadow/dry-run validation" of every live decision.** Before live trading a config, run it in ghost mode *in parallel with* nothing executing, and confirm the Brain's intents match what research expects. Cheap insurance that the live Brain implements the config faithfully.
- **A reconciliation engine as a named, first-class component** (the spec lists "broker reconciliation" as a feature; it deserves to be an *engine*, because it's the safety keystone).
- **A "global heartbeat / dead-man's switch."** If the bot process stops heartbeating, an independent watchdog should be able to flatten and lock via the broker. A bot that silently dies holding a position is the worst case. (Requires a venue that supports server-side protective stops — verify in §13.1.)
- **Server-side protective stops always attached.** Never rely on the bot being alive to manage risk — every live order should carry a broker-side SL so a crashed bot still can't blow the account. The bot *manages* the stop; the broker *holds* it.
- **A "config diff" view.** When promoting version N→N+1, show exactly which rule nodes changed. Operators need to see what they're approving.
- **Replay/simulation harness from the event log.** Because the log is append-only and complete, you can replay any incident deterministically. Build the replayer early; it pays for itself the first time something goes wrong.
- **Explicit partial-fill and slippage modelling** in the Trade entity — the spec mentions slippage filters but the data model needs to *record* realised slippage to compare live vs research honestly.
- **A "config kill switch" distinct from the bot kill switch** — disable a *strategy* across all bots instantly (you have per-bot and global; add per-config).

**Hidden risks / architecture traps:**

- **Treating the Lab's flat-JSON storage as good enough for live state.** It isn't — no transactions, concurrent writers corrupt it. Use a transactional store for live state; keep JSON for config snapshots only.
- **Letting the UI hold authoritative state.** Emergent makes it tempting to compute in the client. Don't — the server is authoritative, the UI is a view. State computed twice will diverge.
- **Building Futures abstractions before Futures exists.** Premature generality will slow FX and probably guess wrong. Seam, don't generalise.
- **A single shared "trade walk" implementation drifting between ghost and live.** If ghost and live compute fills/BE/protection differently, every comparison is a lie. Build it *once* and share it (Phase 4).
- **Time as a footgun.** DST, broker timezone vs firm timezone vs server timezone, weekend gaps. Centralise all time logic; test the edges.

**Backend mistakes to avoid:** non-idempotent commands; deltas without sequence numbers; updating the event log in place; reconciliation as an afterthought; coupling the Bot's DB to the Lab's; secrets in the repo; live as a default mode anywhere.

**UI/UX mistakes to avoid:** ambiguous mode (mock vs live) — make it unmissable; destructive actions without confirm + target-state preview; manual actions that don't show before/after; a card that can't explain *why* it's Locked.

**Trading safety issues:** no server-side stop; no dead-man's switch; assuming the laptop stays awake; overriding protection without a forced reason; promoting on thin samples.

**Data integrity issues:** any trade without a pinned ConfigVersion; mutable "history"; losing the link between a fill and the intent/signal/rule that caused it.

**Broker integration risks:** symbol-mapping mistakes; mishandled partial fills/rejects; assuming all venues support trailing stops or the same order types; rate limits; silent disconnects. The adapter `capabilities()` method is how you keep the core honest about what a venue can actually do.

**What to decide before implementation:** everything in §13 — but at minimum, the broker(s), the prop rules, where it runs (laptop vs always-on), and who owns the Config Contract. These four shape Phase 0.

---

## Appendix A — Grounding in the existing FX-OB-Research-Lab

Observed during this audit (informs the integration plan):

- **Backend:** single FastAPI `backend/server.py`; durable persistence is a file-first pattern — atomic temp-file-then-replace writes, an allowlisted `STORAGE_DOMAINS` set that *already includes* `configs`, optional Mongo only for legacy demo routes. Good pattern for config snapshots; **not** suitable for live order state (no transactions).
- **Config export today** (`sample_run_bundle/config.json`): `{id, symbol, detection_tf, execution_tf, date_from/to, rr, stop_buffer, entry_buffer, verify_ticks, execution_mode}` — a *backtest descriptor*, materially thinner than the live rule tree the Bot needs. The Config Contract (§6.2) is a superset.
- **Summary stats** (`summary.json`): `trades, wins, losses, win_rate, net_r, validation, reverse_cancels, completed_at` — these become the frozen `research_stats` attached to each ConfigVersion (§6.2) and the baseline for edge-decay (§6.6). Note the sample run has **6 trades** — exactly the thin-sample case the import warning must catch.
- **Ghost tracking already exists** (`ghost_tracker.py`): observational, non-equity-affecting, additive fields (`ghost_outcome/ghost_r/ghost_mae/ghost_mfe/ghost_fill_delay/ghost_fill_session`), session classifier (Asia/London/London Lull/New York/Outside). The live Ghost Engine (§7) should reuse this exact semantics and field set so research and live ghosts are comparable.
- **Domain vocabulary** to mirror in the live rule model: OB / BOS / CHoCH, TE % entries, FFT/BE/protection, retest survival, reverse cancels, the named session boundaries. Configs map 1:1 and the explainability log reads naturally.
- **Frontend:** React (craco/Tailwind/shadcn), Emergent project present (`.emergent/`, `emergentintegrations`). The cockpit can follow the same stack, wired to the Bot's API/WS.

**Separation reminder:** the Bot reads exported config bundles and writes results bundles the Lab can import. Beyond the shared, versioned Config Contract, the two systems share no process, store, or deploy.
