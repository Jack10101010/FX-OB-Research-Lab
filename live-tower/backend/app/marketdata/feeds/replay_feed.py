"""
replay_feed.py — ReplayFeed (STUB).

ReplayFeed is the replay engine wearing the MarketDataFeed interface: it reads
the durable bar store and emits bars/ticks onto the SAME bus as a live feed, so
no consumer can tell replay from live except by the `clock` flag on the bus
envelope. This is what makes ghost/research-vs-live comparisons honest.

Core guarantees (see LIVE-TOWER-MARKET-DATA-V1.md §3):
  * Determinism — ordered reads keyed by ts + a content-hashed data catalogue.
  * No look-ahead BY CONSTRUCTION — only emits data with ts <= virtual_now.
  * Virtual clock — consumers read "now" from the injected clock, never wall-time.
  * Multi-symbol time-merge — all requested symbols merged into one ts-ordered stream.
  * Speed control — pacing only; never changes ordering or content.

STATUS: stub. Reads from a `BarStore`-like source (the Parquet/catalogue layer,
built separately). No execution, no UI.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterator, Optional, Protocol

from app.marketdata.contracts import Bar, Timeframe
from app.marketdata.feeds.base import (
    BaseFeed,
    FeedCapabilities,
    FeedHealth,
    Subscription,
    SubscriptionHandle,
)


class BarStoreReader(Protocol):
    """Minimal read surface ReplayFeed needs from the durable store.
    Implemented by the Parquet/catalogue layer (out of scope for this stub)."""

    def read_range(
        self,
        symbol: str,
        timeframe: Timeframe,
        start: datetime,
        end: datetime,
    ) -> Iterator[Bar]:
        ...

    def content_hash(self, symbol: str, timeframe: Timeframe) -> str:
        """Hash identifying exactly which stored data a replay consumed."""
        ...


class VirtualClock(Protocol):
    """The clock abstraction. Live mode wires this to wall-clock UTC; replay
    drives it forward. Everything time-sensitive reads `now()` from here."""

    def now(self) -> datetime:
        ...

    def advance_to(self, ts: datetime) -> None:
        ...


@dataclass(frozen=True, slots=True)
class ReplayConfig:
    symbols: tuple[str, ...]
    timeframe: Timeframe
    start_ts: datetime                 # UTC, inclusive
    end_ts: datetime                   # UTC, exclusive
    speed: float = 0.0                 # 0.0 = as-fast-as-possible; 1.0 = realtime; N = Nx
    emit_synthetic_ticks: bool = False  # bar-only store -> synthetic intrabar ticks


class _ReplaySubscription:
    def __init__(self) -> None:
        self._open = True

    def close(self) -> None:
        self._open = False


class ReplayFeed(BaseFeed):
    name = "replay"

    def __init__(
        self,
        store: BarStoreReader,
        clock: VirtualClock,
        config: ReplayConfig,
    ) -> None:
        super().__init__()
        self.store = store
        self.clock = clock
        self.config = config
        self._consumed_hashes: dict[str, str] = {}

    # ── capabilities / lifecycle ──────────────────────────────────────────
    def capabilities(self) -> FeedCapabilities:
        return FeedCapabilities(
            provides_ticks=self.config.emit_synthetic_ticks,
            provides_bars=True,
            timeframes=(self.config.timeframe,),
            symbols=self.config.symbols,
            historical_depth=None,
            supports_streaming=True,
            supports_history=True,
        )

    def connect(self) -> None:
        # TODO(phase1): record content hashes for each (symbol,timeframe) so the
        # replay is provably reproducible; position read cursors at start_ts.
        for sym in self.config.symbols:
            self._consumed_hashes[sym] = self.store.content_hash(sym, self.config.timeframe)
        self._health = FeedHealth.CONNECTED

    def disconnect(self) -> None:
        self._health = FeedHealth.DISCONNECTED

    # ── streaming (the replay loop) ───────────────────────────────────────
    def subscribe(self, sub: Subscription) -> SubscriptionHandle:
        # TODO(phase1): build a single ts-ordered merge across requested symbols
        # via store.read_range(...). For each bar in order:
        #   1. clock.advance_to(bar.ts)              # virtual now moves forward
        #   2. (optional) emit synthetic ticks O->H->L->C with synthetic=True
        #   3. sub.on_bar(bar)                        # only ts <= now is ever emitted
        #   4. pace according to config.speed (0.0 = no sleep)
        # Never read or emit a bar with ts > virtual_now: no look-ahead by construction.
        raise NotImplementedError("ReplayFeed.subscribe — Phase 1")

    # ── history passthrough ───────────────────────────────────────────────
    def get_history(
        self,
        symbol: str,
        timeframe: Timeframe,
        start: datetime,
        end: datetime,
    ) -> Iterator[Bar]:
        # Replay's history is just the store's range read.
        return self.store.read_range(symbol, timeframe, start, end)

    # ── provenance ────────────────────────────────────────────────────────
    def consumed_data_hashes(self) -> dict[str, str]:
        """Return the content hashes of the data this replay consumed — the
        proof of exactly which dataset produced a given run."""
        return dict(self._consumed_hashes)
