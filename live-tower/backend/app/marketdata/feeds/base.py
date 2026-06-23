"""
base.py — the MarketDataFeed interface and supporting types.

A MarketDataFeed is the abstraction over any source of market data: a mock
generator, a replay of the durable store, a CSV importer, or (later) a live
vendor. The rest of the system speaks ONLY to this interface, so swapping the
source is a factory change, not a rewrite.

This interface is deliberately SEPARATE from the execution-side BrokerAdapter
(a venue may provide data, execution, both, or neither). Keep them independent
so they compose.

Scope: market data only. No order placement, no execution, no UI. A feed
ingests/normalizes/serves bars, ticks and news — nothing else.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Iterable, Iterator, Optional, Protocol, runtime_checkable

from app.marketdata.contracts import Bar, NewsEvent, Tick, Timeframe


# ── Capabilities (what a feed can actually do) ───────────────────────────────

@dataclass(frozen=True, slots=True)
class FeedCapabilities:
    """Honest declaration of what a feed provides, so consumers degrade
    gracefully (e.g. a bar-only feed -> synthetic ticks for replay)."""

    provides_ticks: bool
    provides_bars: bool
    timeframes: tuple[Timeframe, ...]
    symbols: tuple[str, ...]                 # canonical symbols this feed can serve
    historical_depth: Optional[str] = None   # e.g. "2020-01-01" or "P2Y"; None = unknown
    supports_streaming: bool = True
    supports_history: bool = True


class FeedHealth(str):
    """Lightweight health states (not an Enum to stay trivially serializable)."""
    CONNECTED = "connected"
    DEGRADED = "degraded"
    DISCONNECTED = "disconnected"


# Callback signatures for streaming subscriptions.
OnTick = Callable[[Tick], None]
OnBar = Callable[[Bar], None]


@dataclass(frozen=True, slots=True)
class Subscription:
    """A consumer's declared interest. The feed fans matching data to the
    provided callbacks. Closing the subscription stops delivery."""

    symbols: tuple[str, ...]
    timeframes: tuple[Timeframe, ...]
    on_bar: Optional[OnBar] = None
    on_tick: Optional[OnTick] = None


# ── The interface ────────────────────────────────────────────────────────────

@runtime_checkable
class MarketDataFeed(Protocol):
    """Every market-data source implements this. Implementations: MockFeed,
    ReplayFeed, FileFeed, and (later) a live vendor feed."""

    name: str

    def capabilities(self) -> FeedCapabilities:
        """Describe what this feed can serve. Callers must respect it."""
        ...

    def connect(self) -> None:
        """Establish the source (open files / connect vendor / arm generator)."""
        ...

    def disconnect(self) -> None:
        """Tear down cleanly. Idempotent."""
        ...

    def health(self) -> str:
        """Return one of FeedHealth.* — used by the staleness/health monitor."""
        ...

    def subscribe(self, sub: Subscription) -> "SubscriptionHandle":
        """Begin streaming the requested (symbol, timeframe) set to callbacks.
        Closed bars are delivered via on_bar; ticks via on_tick (if available)."""
        ...

    def get_history(
        self,
        symbol: str,
        timeframe: Timeframe,
        start: datetime,
        end: datetime,
    ) -> Iterator[Bar]:
        """Yield closed bars in ascending ts order for a [start, end) UTC window.
        Used for backfill, replay seeding, and gap-fill. Must be deterministic."""
        ...

    def normalize_symbol(self, venue_symbol: str) -> str:
        """Map a venue spelling to the canonical symbol (e.g. 'EUR_USD' -> 'EURUSD')."""
        ...

    def to_venue_symbol(self, canonical: str) -> str:
        """Inverse of normalize_symbol."""
        ...


@runtime_checkable
class SubscriptionHandle(Protocol):
    """Returned by subscribe(); lets a consumer stop delivery."""

    def close(self) -> None:
        ...


# ── Shared base to remove boilerplate from concrete feeds ────────────────────

class BaseFeed:
    """Optional convenience base. Concrete feeds may inherit to get default
    symbol mapping and health plumbing. Pure data; no execution logic."""

    name: str = "base"

    def __init__(self) -> None:
        self._health: str = FeedHealth.DISCONNECTED

    def health(self) -> str:
        return self._health

    # Default 1:1 mapping; override per venue.
    def normalize_symbol(self, venue_symbol: str) -> str:
        return venue_symbol.replace("_", "").replace("/", "").upper()

    def to_venue_symbol(self, canonical: str) -> str:
        return canonical

    # The following must be implemented by subclasses.
    def capabilities(self) -> FeedCapabilities:  # pragma: no cover - abstract
        raise NotImplementedError

    def connect(self) -> None:  # pragma: no cover - abstract
        raise NotImplementedError

    def disconnect(self) -> None:  # pragma: no cover - abstract
        raise NotImplementedError

    def subscribe(self, sub: Subscription) -> SubscriptionHandle:  # pragma: no cover
        raise NotImplementedError

    def get_history(self, symbol, timeframe, start, end):  # pragma: no cover
        raise NotImplementedError
