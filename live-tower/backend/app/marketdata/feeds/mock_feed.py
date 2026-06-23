"""
mock_feed.py — MockFeed (STUB).

The data-side twin of the MockBroker: a deterministic, dependency-free source
of bars (and optional synthetic ticks) so dev and tests run with no network,
no credentials, and no vendor account. This is the DEFAULT feed
(MARKET_DATA_SOURCE=mock) — a fresh checkout can never accidentally hit a live
source.

STATUS: stub. Method bodies raise NotImplementedError or return trivial
placeholders. Signatures and contracts are final; logic lands in Phase 1.

Determinism contract: given the same (seed, symbols, start, params), MockFeed
emits an identical bar/tick stream every run. No wall-clock, no randomness
without the seed.

Scope: market data only. No execution, no UI.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterator, Optional

from app.marketdata.contracts import Bar, Domain, Timeframe
from app.marketdata.feeds.base import (
    BaseFeed,
    FeedCapabilities,
    FeedHealth,
    Subscription,
    SubscriptionHandle,
)


@dataclass(frozen=True, slots=True)
class MockFeedConfig:
    symbols: tuple[str, ...] = ("EURUSD",)
    timeframe: Timeframe = Timeframe.M15
    domain: Domain = Domain.FX
    seed: int = 1
    start_ts: Optional[datetime] = None       # UTC; defaults to a fixed epoch for determinism
    start_price: float = 1.10000
    bar_volatility: float = 0.0005             # synthetic price walk amplitude
    provide_ticks: bool = False                # bar-only by default
    speed: float = 1.0                         # 1x realtime; higher = faster generation


class _MockSubscription:
    """SubscriptionHandle stub."""

    def __init__(self) -> None:
        self._open = True

    def close(self) -> None:
        self._open = False


class MockFeed(BaseFeed):
    name = "mock"

    def __init__(self, config: MockFeedConfig | None = None) -> None:
        super().__init__()
        self.config = config or MockFeedConfig()

    # ── capabilities / lifecycle ──────────────────────────────────────────
    def capabilities(self) -> FeedCapabilities:
        return FeedCapabilities(
            provides_ticks=self.config.provide_ticks,
            provides_bars=True,
            timeframes=(self.config.timeframe,),
            symbols=self.config.symbols,
            historical_depth="P0D",          # generated on demand; unbounded backward
            supports_streaming=True,
            supports_history=True,
        )

    def connect(self) -> None:
        # TODO(phase1): arm the deterministic generator (seed the RNG / price walk).
        self._health = FeedHealth.CONNECTED

    def disconnect(self) -> None:
        self._health = FeedHealth.DISCONNECTED

    # ── streaming ─────────────────────────────────────────────────────────
    def subscribe(self, sub: Subscription) -> SubscriptionHandle:
        # TODO(phase1): on each generated interval, build a deterministic Bar
        # (validated by the Bar dataclass), set is_closed=True at interval roll,
        # and invoke sub.on_bar(bar). If provide_ticks, emit synthetic ticks
        # (synthetic=True) along an O->H->L->C path before the close.
        raise NotImplementedError("MockFeed.subscribe — Phase 1")

    # ── history / backfill ────────────────────────────────────────────────
    def get_history(
        self,
        symbol: str,
        timeframe: Timeframe,
        start: datetime,
        end: datetime,
    ) -> Iterator[Bar]:
        # TODO(phase1): deterministically generate closed bars across [start, end)
        # using the seeded walk so history matches what subscribe() would have
        # produced for the same window (live/historical convergence property).
        raise NotImplementedError("MockFeed.get_history — Phase 1")

    # ── test/control surface (drives scenarios deterministically) ─────────
    def step(self, n: int = 1) -> None:
        """Advance the generator by n intervals (test hook). Phase 1."""
        raise NotImplementedError("MockFeed.step — Phase 1")

    def inject_bar(self, bar: Bar) -> None:
        """Push a specific bar into the stream (scenario hook). Phase 1."""
        raise NotImplementedError("MockFeed.inject_bar — Phase 1")
