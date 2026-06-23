"""
contracts.py — in-process typed mirrors of the market-data JSON contracts.

These dataclasses are the Python view of the versioned JSON Schemas in
`contracts/market_data/` (md.bar.v1, md.tick.v1, md.news.v1). They are the
ONLY shapes that cross the market-data boundary inside the backend.

Scope: market data only. No execution, no orders, no UI. Nothing here knows
about strategies, accounts, or trades.

Design rules enforced here (see LIVE-TOWER-MARKET-DATA-V1.md):
  * UTC only — all timestamps are timezone-aware UTC datetimes.
  * Canonical symbols only — venue spellings are mapped at the feed edge.
  * Derived fields (session, mid, spread) are conveniences, recomputable.
  * `is_closed` is law — consumers act on closed bars only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


# ── Enumerations (mirror the JSON Schema enums) ──────────────────────────────

class Domain(str, Enum):
    FX = "FX"
    FUTURES = "FUTURES"


class Timeframe(str, Enum):
    M1 = "1m"
    M5 = "M5"
    M15 = "M15"
    M30 = "M30"
    H1 = "H1"
    H4 = "H4"
    D1 = "D1"
    W1 = "W1"


class BarSource(str, Enum):
    MOCK = "mock"
    FILE = "file"
    BACKFILL = "backfill"
    REPLAY = "replay"
    LIVE = "live"


class TickSource(str, Enum):
    MOCK = "mock"
    REPLAY = "replay"
    LIVE = "live"


class NewsSource(str, Enum):
    CALENDAR = "calendar"
    LIVE = "live"
    MANUAL = "manual"


class Session(str, Enum):
    ASIA = "Asia"
    LONDON = "London"
    LONDON_LULL = "London Lull"
    NEW_YORK = "New York"
    OUTSIDE = "Outside"


# ── Session derivation (pure function of UTC ts; matches ghost_tracker.py) ────

_SESSION_BOUNDARIES = [
    (0, 3, Session.ASIA),
    (3, 8, Session.LONDON),
    (8, 10, Session.LONDON_LULL),
    (10, 17, Session.NEW_YORK),
    (17, 24, Session.OUTSIDE),
]


def session_of(ts: datetime) -> Session:
    """Return the session label for a UTC timestamp. Derived, never stored."""
    h = _ensure_utc(ts).hour
    for start, end, label in _SESSION_BOUNDARIES:
        if start <= h < end:
            return label
    return Session.OUTSIDE


def _ensure_utc(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        raise ValueError("timestamps must be timezone-aware UTC")
    return ts.astimezone(timezone.utc)


# ── Bar (md.bar.v1) ──────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class Bar:
    """Canonical OHLCV bar. Stamped at OPEN time. Immutable once created."""

    symbol: str
    domain: Domain
    timeframe: Timeframe
    ts: datetime               # bar OPEN time, UTC
    open: float
    high: float
    low: float
    close: float
    volume: float
    is_closed: bool
    source: BarSource
    schema: str = "md.bar.v1"

    def __post_init__(self) -> None:
        _ensure_utc(self.ts)
        if self.high < max(self.open, self.close, self.low):
            raise ValueError(f"high < max(o,c,l) for {self.symbol}@{self.ts}")
        if self.low > min(self.open, self.close, self.high):
            raise ValueError(f"low > min(o,c,h) for {self.symbol}@{self.ts}")
        if self.volume < 0:
            raise ValueError("volume must be >= 0")

    @property
    def session(self) -> Session:
        return session_of(self.ts)

    def to_contract(self) -> dict:
        """Serialize to the md.bar.v1 wire shape (UTC 'Z' timestamps)."""
        return {
            "schema": self.schema,
            "symbol": self.symbol,
            "domain": self.domain.value,
            "timeframe": self.timeframe.value,
            "ts": _iso_z(self.ts),
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "is_closed": self.is_closed,
            "source": self.source.value,
            "session": self.session.value,
        }


# ── Tick (md.tick.v1) ────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class Tick:
    """Canonical bid/ask tick. mid/spread are derived."""

    symbol: str
    domain: Domain
    ts: datetime               # UTC, ms precision
    bid: float
    ask: float
    source: TickSource
    synthetic: bool = False
    schema: str = "md.tick.v1"

    def __post_init__(self) -> None:
        _ensure_utc(self.ts)
        if not self.synthetic and self.ask < self.bid:
            raise ValueError(f"ask < bid for real tick {self.symbol}@{self.ts}")

    @property
    def mid(self) -> float:
        return (self.bid + self.ask) / 2.0

    @property
    def spread(self) -> float:
        return self.ask - self.bid

    def to_contract(self) -> dict:
        return {
            "schema": self.schema,
            "symbol": self.symbol,
            "domain": self.domain.value,
            "ts": _iso_z(self.ts, ms=True),
            "bid": self.bid,
            "ask": self.ask,
            "mid": self.mid,
            "spread": self.spread,
            "source": self.source.value,
            "synthetic": self.synthetic,
        }


# ── NewsEvent (md.news.v1) ───────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class NewsEvent:
    """Economic-calendar event, market-data view. Carries the blackout window
    only as DATA; expresses no execution policy."""

    currency: str              # ISO-4217, e.g. "USD"
    impact: str                # high | medium | low | holiday
    ts: datetime               # scheduled time, UTC
    event: str
    source: NewsSource
    blackout_before_s: int = 0
    blackout_after_s: int = 0
    schema: str = "md.news.v1"

    def __post_init__(self) -> None:
        _ensure_utc(self.ts)

    def to_contract(self) -> dict:
        return {
            "schema": self.schema,
            "currency": self.currency,
            "impact": self.impact,
            "ts": _iso_z(self.ts),
            "event": self.event,
            "blackout_before_s": self.blackout_before_s,
            "blackout_after_s": self.blackout_after_s,
            "source": self.source.value,
        }


# ── helpers ──────────────────────────────────────────────────────────────────

def _iso_z(ts: datetime, ms: bool = False) -> str:
    ts = _ensure_utc(ts)
    if ms:
        return ts.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ts.microsecond // 1000:03d}Z"
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")
