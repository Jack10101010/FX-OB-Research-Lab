"""
bar_store.py — durable storage for validated md.bar.v1 Bar objects.

The first durable market-data layer:  candles.csv -> FileFeed.import_bars ->
validated Bar objects -> BarStore.write_bars (disk) -> BarStore.read_bars
(-> ReplayFeed later).

Scope: market data only. NO execution, NO broker, NO bot loop, NO UI, NO
WebSocket, NO order/trade tables.

Storage backends
----------------
* Parquet  (preferred) — used automatically when `pyarrow` is importable. One
  file per partition: `bars.parquet`.
* JSONL    (fallback)  — used when Parquet deps are absent. One file per
  partition: `bars.jsonl` (one md.bar.v1 record per line).

The public class is always `BarStore`, so the backend can change later without
touching callers. Both backends use the SAME partition layout and atomic
temp-write-then-replace, and preserve all md.bar.v1 contract fields.

Partition layout (under <root>/data/market/):
    domain=FX/symbol=EURUSD/timeframe=M15/year=2025/month=05/bars.{parquet|jsonl}

Semantics
---------
* Dedup key:           (symbol, timeframe, ts).  Partitioning already isolates
                       symbol+timeframe, so within a file ts is the key.
* Idempotent re-import: writing the same bars twice does not duplicate rows.
* Overlapping merge:    a re-written ts replaces the prior record (last writer
                        wins); new ts values are added.
* read_bars window:     half-open [start, end)  (UTC), matching ReplayFeed.
* Read ordering:        ascending by ts, always.
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from app.marketdata.contracts import Bar, BarSource, Domain, Timeframe


class BarStoreError(Exception):
    """Raised on storage-layer misuse (e.g. writing a non-Bar object)."""


def _parquet_available() -> bool:
    try:
        import pyarrow  # noqa: F401
        import pandas  # noqa: F401
        return True
    except Exception:
        return False


# ── timestamp helpers ────────────────────────────────────────────────────────

def _parse_iso_utc(value: str) -> datetime:
    s = value.strip()
    if s and s[-1] in ("Z", "z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        raise BarStoreError(f"stored ts is naive: {value!r}")
    return dt.astimezone(timezone.utc)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise BarStoreError("read window timestamps must be timezone-aware UTC")
    return dt.astimezone(timezone.utc)


# ── record <-> Bar ───────────────────────────────────────────────────────────

def _bar_to_record(bar: Bar) -> dict:
    # Full md.bar.v1 contract dict (preserves all fields, incl. derived session).
    return bar.to_contract()


def _bar_from_record(rec: dict) -> Bar:
    # Reconstruct through the Bar contract so every read is re-validated.
    return Bar(
        symbol=rec["symbol"],
        domain=Domain(rec["domain"]),
        timeframe=Timeframe(rec["timeframe"]),
        ts=_parse_iso_utc(rec["ts"]),
        open=float(rec["open"]),
        high=float(rec["high"]),
        low=float(rec["low"]),
        close=float(rec["close"]),
        volume=float(rec["volume"]),
        is_closed=bool(rec["is_closed"]),
        source=BarSource(rec["source"]),
    )


# ── month iteration ──────────────────────────────────────────────────────────

def _months_in_range(start: datetime, end: datetime) -> List[Tuple[int, int]]:
    """Inclusive list of (year, month) partitions overlapping [start, end]."""
    y, m = start.year, start.month
    last = (end.year, end.month)
    out: List[Tuple[int, int]] = []
    # Guard against pathological inputs; ranges here are small (months).
    while (y, m) <= last:
        out.append((y, m))
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


# ── the store ────────────────────────────────────────────────────────────────

class BarStore:
    """Durable, partitioned store for validated Bar objects."""

    def __init__(self, root: Path | str, backend: str = "auto") -> None:
        self.root = Path(root)
        if backend == "auto":
            backend = "parquet" if _parquet_available() else "jsonl"
        if backend not in ("parquet", "jsonl"):
            raise BarStoreError(f"unknown backend: {backend!r}")
        if backend == "parquet" and not _parquet_available():
            raise BarStoreError("parquet backend requested but pyarrow/pandas unavailable")
        self.backend = backend
        self._filename = "bars.parquet" if backend == "parquet" else "bars.jsonl"

    # ── path helpers (public: tests assert on partition layout) ───────────
    def partition_dir(self, domain: Domain, symbol: str, timeframe: Timeframe,
                      year: int, month: int) -> Path:
        return (
            self.root / "data" / "market"
            / f"domain={domain.value}"
            / f"symbol={symbol}"
            / f"timeframe={timeframe.value}"
            / f"year={year:04d}"
            / f"month={month:02d}"
        )

    def partition_file(self, domain: Domain, symbol: str, timeframe: Timeframe,
                       year: int, month: int) -> Path:
        return self.partition_dir(domain, symbol, timeframe, year, month) / self._filename

    # ── write ─────────────────────────────────────────────────────────────
    def write_bars(self, bars: Iterable[Bar]) -> int:
        """Write validated Bars to disk, merging idempotently into partitions.

        Returns the number of distinct bars written across all touched
        partitions (post-merge count for those partitions). Rejects any object
        that is not a validated `Bar`.
        """
        # Group incoming bars by partition; reject non-Bars up front.
        grouped: Dict[Tuple[str, str, str, int, int], Dict[str, dict]] = {}
        for item in bars:
            if not isinstance(item, Bar):
                raise BarStoreError(
                    f"write_bars only accepts validated Bar objects, got {type(item).__name__}"
                )
            key = (item.domain.value, item.symbol, item.timeframe.value,
                   item.ts.year, item.ts.month)
            rec = _bar_to_record(item)
            grouped.setdefault(key, {})[rec["ts"]] = rec  # dedup by ts within partition

        written = 0
        for (domain_v, symbol, tf_v, year, month), new_by_ts in grouped.items():
            domain, timeframe = Domain(domain_v), Timeframe(tf_v)
            file = self.partition_file(domain, symbol, timeframe, year, month)

            merged: Dict[str, dict] = {}
            for rec in self._read_partition_records(file):
                merged[rec["ts"]] = rec
            merged.update(new_by_ts)  # last writer wins on (symbol,timeframe,ts)

            ordered = [merged[ts] for ts in sorted(merged.keys())]
            self._atomic_write(file, ordered)
            written += len(new_by_ts)
        return written

    # ── read ──────────────────────────────────────────────────────────────
    def read_bars(self, symbol: str, timeframe: Timeframe,
                  start: datetime, end: datetime,
                  domain: Domain = Domain.FX) -> List[Bar]:
        """Return validated Bars for [start, end) (UTC), ascending by ts.

        A wrong symbol/timeframe/domain simply matches no partitions and returns
        an empty list.
        """
        start, end = _ensure_utc(start), _ensure_utc(end)
        out: List[Bar] = []
        for year, month in _months_in_range(start, end):
            file = self.partition_file(domain, symbol, timeframe, year, month)
            for rec in self._read_partition_records(file):
                ts = _parse_iso_utc(rec["ts"])
                if start <= ts < end:
                    out.append(_bar_from_record(rec))
        out.sort(key=lambda b: b.ts)
        return out

    # ── backend I/O ────────────────────────────────────────────────────────
    def _read_partition_records(self, file: Path) -> List[dict]:
        if not file.exists():
            return []
        if self.backend == "parquet":
            import pandas as pd
            df = pd.read_parquet(file)
            return df.to_dict("records")
        records: List[dict] = []
        with file.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
        return records

    def _atomic_write(self, file: Path, records: List[dict]) -> None:
        file.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(file.parent), prefix=".bars-", suffix=".tmp")
        try:
            if self.backend == "parquet":
                os.close(fd)
                import pandas as pd
                pd.DataFrame(records).to_parquet(tmp, index=False, engine="pyarrow")
            else:
                with os.fdopen(fd, "w", encoding="utf-8") as fh:
                    for rec in records:
                        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            os.replace(tmp, file)
        finally:
            if os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass
