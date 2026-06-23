"""
file_feed.py — FileFeed + the file IMPORT CONTRACT (STUB).

FileFeed ingests existing on-disk datasets (the FX-OB-Research-Lab `candles.csv`
and `master_economic_calendar_*.csv`, or Parquet) into the canonical contracts,
for backfill, Lab interop, and replay seeding. It is the bridge between what the
Lab already produces and the Live Tower's durable store.

This module's most important content is the IMPORT CONTRACT below: the exact
expected input shape and the mapping to md.bar.v1 / md.news.v1. Get this right
and existing Lab data flows in with zero loss.

STATUS: import_bars() is implemented (candle CSV -> validated md.bar.v1 Bars).
import_news() / get_history() remain Phase-1 stubs. The contract is final.
Scope: market data only. No execution, no UI.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, List, Optional

from app.marketdata.contracts import (
    Bar,
    BarSource,
    Domain,
    NewsEvent,
    NewsSource,
    Timeframe,
)
from app.marketdata.feeds.base import (
    BaseFeed,
    FeedCapabilities,
    FeedHealth,
    Subscription,
    SubscriptionHandle,
)


# ─────────────────────────────────────────────────────────────────────────────
# IMPORT CONTRACT — CANDLE CSV  (FX-OB-Research-Lab `candles.csv`)
# ─────────────────────────────────────────────────────────────────────────────
# Observed Lab format (header row required):
#
#   time,open,high,low,close,volume
#   2025-05-18 21:00:00+00:00,1.11749,1.11776,1.11713,1.11758,129.285
#
# Mapping to md.bar.v1:
#   time    -> ts        (parse as UTC; '+00:00' or 'Z' accepted; naive -> REJECT)
#   open    -> open
#   high    -> high
#   low     -> low
#   close   -> close
#   volume  -> volume    (>= 0; missing -> 0.0 allowed only if column absent entirely)
#
# Supplied by the import job (NOT in the CSV) — required to complete a Bar:
#   symbol      -> from filename or import param (canonicalized)
#   domain      -> import param (FX for these datasets)
#   timeframe   -> import param (inferred from spacing or declared; e.g. M15)
#   is_closed   -> TRUE for all imported historical rows (they are finalized)
#   source      -> BarSource.FILE
#
# Validation rules (rejecting, not silently fixing):
#   * ts strictly increasing per (symbol, timeframe); duplicates -> upsert/skip
#   * no NaN / empty OHLC; high>=max(o,c,l); low<=min(o,c,h) (Bar enforces)
#   * volume >= 0
#   * timezone-aware UTC only
CANDLE_CSV_COLUMNS = ("time", "open", "high", "low", "close", "volume")


# ─────────────────────────────────────────────────────────────────────────────
# IMPORT CONTRACT — ECONOMIC CALENDAR CSV (`master_economic_calendar_*.csv`)
# ─────────────────────────────────────────────────────────────────────────────
# The exact column names of the Lab calendar file must be confirmed on first
# import (Decision D-5). The importer maps them to md.news.v1 as:
#
#   <datetime col>  -> ts            (UTC; combine date+time if split)
#   <currency col>  -> currency      (ISO-4217, upper)
#   <impact col>    -> impact        (normalize to high|medium|low|holiday)
#   <event col>     -> event
#   (supplied)      -> source = NewsSource.CALENDAR
#   (policy/param)  -> blackout_before_s / blackout_after_s (default 0)
#
# Unknown/extra columns are ignored for md.news.v1 but preserved in a raw
# sidecar if forensic detail is wanted later.
CALENDAR_REQUIRED_FIELDS = ("ts", "currency", "impact", "event")


# ── Import errors & parse helpers ────────────────────────────────────────────

class CandleImportError(ValueError):
    """Raised on any malformed candle row. Carries the 1-based file line number
    (header = line 1) so failures point at the exact offending row. Invalid data
    is never silently coerced — it stops the import with a clear message."""

    def __init__(self, row_no: int, message: str) -> None:
        self.row_no = row_no
        self.message = message
        super().__init__(f"row {row_no}: {message}")


def _parse_utc(value: str, row_no: int) -> datetime:
    """Parse a candle timestamp as a timezone-aware UTC datetime.

    Accepts the Lab's two observed shapes:
        2025-05-18 21:00:00+00:00   (space separator, explicit offset)
        2025-05-18T21:00:00Z        (ISO 'T' separator, 'Z' = UTC)

    Rejects (does not coerce):
        * empty / unparseable timestamps
        * naive timestamps (no timezone)
        * non-UTC offsets (offset must be exactly +00:00)
    """
    raw = (value or "").strip()
    if not raw:
        raise CandleImportError(row_no, "empty timestamp")

    s = raw
    if s[-1] in ("Z", "z"):
        s = s[:-1] + "+00:00"
    # Normalize a single date/time space separator to 'T' for fromisoformat
    # compatibility across Python versions (e.g. 3.10).
    if "T" not in s and " " in s:
        s = s.replace(" ", "T", 1)

    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        raise CandleImportError(row_no, f"unparseable timestamp {raw!r}") from None

    if dt.tzinfo is None:
        raise CandleImportError(
            row_no, f"naive timestamp {raw!r} (a UTC timezone is required)"
        )
    offset = dt.utcoffset()
    if offset is None or offset.total_seconds() != 0:
        raise CandleImportError(
            row_no, f"non-UTC timestamp {raw!r} (offset must be +00:00)"
        )
    return dt.astimezone(timezone.utc)


def _parse_float(value: str, field: str, row_no: int) -> float:
    raw = (value or "").strip()
    try:
        return float(raw)
    except (ValueError, TypeError):
        raise CandleImportError(
            row_no, f"invalid numeric for {field}: {value!r}"
        ) from None


@dataclass(frozen=True, slots=True)
class FileFeedConfig:
    candles_path: Optional[Path] = None     # path to a candles.csv or .parquet
    calendar_path: Optional[Path] = None    # path to the economic calendar csv
    symbol: str = "EURUSD"                   # canonical symbol for the candle file
    domain: Domain = Domain.FX
    timeframe: Timeframe = Timeframe.M15
    has_header: bool = True


class _FileSubscription:
    def __init__(self) -> None:
        self._open = True

    def close(self) -> None:
        self._open = False


class FileFeed(BaseFeed):
    name = "file"

    def __init__(self, config: FileFeedConfig) -> None:
        super().__init__()
        self.config = config

    # ── capabilities / lifecycle ──────────────────────────────────────────
    def capabilities(self) -> FeedCapabilities:
        return FeedCapabilities(
            provides_ticks=False,            # candle files are bar-only
            provides_bars=True,
            timeframes=(self.config.timeframe,),
            symbols=(self.config.symbol,),
            historical_depth=None,           # determined by the file's date range
            supports_streaming=False,        # file is a batch source, not a live stream
            supports_history=True,
        )

    def connect(self) -> None:
        # TODO(phase1): open/validate file handles; sniff header; verify columns
        # match CANDLE_CSV_COLUMNS / calendar fields.
        self._health = FeedHealth.CONNECTED

    def disconnect(self) -> None:
        self._health = FeedHealth.DISCONNECTED

    # ── streaming not supported for a file source ─────────────────────────
    def subscribe(self, sub: Subscription) -> SubscriptionHandle:
        raise NotImplementedError(
            "FileFeed is a batch source; use get_history()/import_bars(). "
            "For streaming over file data, wrap it in ReplayFeed."
        )

    # ── history / import ──────────────────────────────────────────────────
    def get_history(
        self,
        symbol: str,
        timeframe: Timeframe,
        start: datetime,
        end: datetime,
    ) -> Iterator[Bar]:
        # TODO(phase1): stream rows from candles file, map per CANDLE CSV contract,
        # filter to [start, end), yield validated Bar objects in ts order.
        raise NotImplementedError("FileFeed.get_history — Phase 1")

    def import_bars(self) -> List[Bar]:
        """Import the configured candle file into validated md.bar.v1 Bars.

        Reads `self.config.candles_path` and stamps each row with the configured
        `symbol`, `domain`, `timeframe`, `is_closed=True`, and `source=file`.
        Every row is validated through the Bar contract (OHLC sanity, UTC-aware
        timestamp); `session` is derived by the Bar from its timestamp.

        Returns a list of Bars in file order. Raises CandleImportError (with the
        1-based row number) on the first malformed row, missing column, naive or
        non-UTC timestamp, bad numeric, or impossible OHLC. Nothing is coerced.
        """
        cfg = self.config
        if cfg.candles_path is None:
            raise CandleImportError(0, "no candles_path configured")
        path = Path(cfg.candles_path)
        if not path.exists():
            raise CandleImportError(0, f"file not found: {path}")

        bars: List[Bar] = []
        with path.open(newline="", encoding="utf-8") as fh:
            reader = csv.reader(fh)
            try:
                header = next(reader)
            except StopIteration:
                raise CandleImportError(0, "empty file") from None

            cols = [c.strip().lower() for c in header]
            missing = [c for c in CANDLE_CSV_COLUMNS if c not in cols]
            if missing:
                raise CandleImportError(
                    1, f"missing required column(s): {', '.join(missing)}"
                )
            idx = {c: cols.index(c) for c in CANDLE_CSV_COLUMNS}

            row_no = 1  # header consumed
            for raw_row in reader:
                row_no += 1
                # Skip fully-blank lines (trailing newline, etc.)
                if not raw_row or all(not (c or "").strip() for c in raw_row):
                    continue
                if len(raw_row) < len(cols):
                    raise CandleImportError(
                        row_no, f"expected {len(cols)} columns, got {len(raw_row)}"
                    )

                ts = _parse_utc(raw_row[idx["time"]], row_no)
                o = _parse_float(raw_row[idx["open"]], "open", row_no)
                h = _parse_float(raw_row[idx["high"]], "high", row_no)
                low = _parse_float(raw_row[idx["low"]], "low", row_no)
                c = _parse_float(raw_row[idx["close"]], "close", row_no)
                v = _parse_float(raw_row[idx["volume"]], "volume", row_no)

                try:
                    bar = Bar(
                        symbol=cfg.symbol,
                        domain=cfg.domain,
                        timeframe=cfg.timeframe,
                        ts=ts,
                        open=o,
                        high=h,
                        low=low,
                        close=c,
                        volume=v,
                        is_closed=True,
                        source=BarSource.FILE,
                    )
                except ValueError as exc:
                    raise CandleImportError(row_no, f"invalid bar: {exc}") from exc

                bars.append(bar)

        return bars

    def import_news(self) -> Iterator[NewsEvent]:
        """Yield NewsEvents from the configured calendar file as md.news.v1."""
        # TODO(phase1): map per CALENDAR contract; normalize impact + currency.
        raise NotImplementedError("FileFeed.import_news — Phase 1")
