"""
Tests for BarStore — durable storage of validated md.bar.v1 Bars.

Market-data only. No execution, broker, bot loop, UI, or order/trade tables.
Runs against whichever backend is active (parquet if available, else jsonl) and
also forces the jsonl backend explicitly so the fallback is always covered.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.marketdata.contracts import Bar, BarSource, Domain, Timeframe
from app.marketdata.storage.bar_store import BarStore, BarStoreError, _parquet_available


def _ts(day, hour=0, minute=0):
    return datetime(2025, 5, day, hour, minute, tzinfo=timezone.utc)


def _bar(ts, close=1.15, symbol="EURUSD", tf=Timeframe.M15, vol=10.0):
    return Bar(symbol, Domain.FX, tf, ts, 1.10, 1.20, 1.05, close, vol, True, BarSource.FILE)


# Cover both the active backend and the JSONL fallback explicitly.
_BACKENDS = ["jsonl"] + (["parquet"] if _parquet_available() else [])


@pytest.fixture(params=_BACKENDS)
def store(tmp_path, request):
    return BarStore(tmp_path, backend=request.param)


# 1. write/read valid bars
def test_write_then_read_roundtrip(store):
    bars = [_bar(_ts(18, 21, 0), close=1.11758), _bar(_ts(18, 21, 15), close=1.11813)]
    assert store.write_bars(bars) == 2
    got = store.read_bars("EURUSD", Timeframe.M15, _ts(18), _ts(19))
    assert len(got) == 2
    # contract round-trip preserved
    assert got[0].to_contract()["close"] == 1.11758
    assert got[0].source == BarSource.FILE and got[0].is_closed is True
    assert got[0].to_contract()["schema"] == "md.bar.v1"


# 2. read range filtering [start, end)
def test_range_filtering_half_open(store):
    store.write_bars([_bar(_ts(18, 9)), _bar(_ts(18, 10)), _bar(_ts(18, 11))])
    got = store.read_bars("EURUSD", Timeframe.M15, _ts(18, 10), _ts(18, 11))
    assert [b.ts.hour for b in got] == [10]  # start inclusive, end exclusive


# 3. bars returned sorted by ts (write out of order)
def test_read_sorted(store):
    store.write_bars([_bar(_ts(18, 12)), _bar(_ts(18, 9)), _bar(_ts(18, 15))])
    got = store.read_bars("EURUSD", Timeframe.M15, _ts(18), _ts(19))
    assert [b.ts.hour for b in got] == [9, 12, 15]


# 4. duplicate imports do not duplicate rows
def test_idempotent_reimport(store):
    bars = [_bar(_ts(18, 9)), _bar(_ts(18, 10))]
    store.write_bars(bars)
    store.write_bars(bars)  # same bars again
    got = store.read_bars("EURUSD", Timeframe.M15, _ts(18), _ts(19))
    assert len(got) == 2


# 5. overlapping new bars merge correctly (existing ts updated, new ts added)
def test_overlapping_merge(store):
    store.write_bars([_bar(_ts(18, 9), close=1.10), _bar(_ts(18, 10), close=1.11)])
    store.write_bars([_bar(_ts(18, 10), close=1.18), _bar(_ts(18, 11), close=1.12)])
    got = store.read_bars("EURUSD", Timeframe.M15, _ts(18), _ts(19))
    assert [b.ts.hour for b in got] == [9, 10, 11]          # 3 distinct, not 4
    assert {b.ts.hour: b.close for b in got}[10] == 1.18     # last writer wins (valid OHLC)


# 6. wrong symbol/timeframe read returns nothing
def test_wrong_symbol_or_timeframe_returns_empty(store):
    store.write_bars([_bar(_ts(18, 9))])
    assert store.read_bars("GBPUSD", Timeframe.M15, _ts(18), _ts(19)) == []
    assert store.read_bars("EURUSD", Timeframe.H1, _ts(18), _ts(19)) == []


# 7. invalid (non-Bar) object is rejected
def test_invalid_object_rejected(store):
    bad = {"symbol": "EURUSD", "ts": "2025-05-18T09:00:00Z", "open": 1.1}
    with pytest.raises(BarStoreError):
        store.write_bars([bad])  # type: ignore[list-item]


# 8. partition path is correct
def test_partition_path(store, tmp_path):
    store.write_bars([_bar(_ts(18, 9))])
    expected_dir = (
        tmp_path / "data" / "market"
        / "domain=FX" / "symbol=EURUSD" / "timeframe=M15"
        / "year=2025" / "month=05"
    )
    assert store.partition_dir(Domain.FX, "EURUSD", Timeframe.M15, 2025, 5) == expected_dir
    assert store.partition_file(Domain.FX, "EURUSD", Timeframe.M15, 2025, 5).exists()


# 9. cross-month range spans partitions
def test_cross_month_range(store):
    store.write_bars([
        _bar(datetime(2025, 5, 31, 23, 0, tzinfo=timezone.utc)),
        _bar(datetime(2025, 6, 1, 0, 0, tzinfo=timezone.utc)),
    ])
    got = store.read_bars(
        "EURUSD", Timeframe.M15,
        datetime(2025, 5, 31, tzinfo=timezone.utc),
        datetime(2025, 6, 2, tzinfo=timezone.utc),
    )
    assert len(got) == 2


# 10. naive read window is rejected (no silent coercion)
def test_naive_window_rejected(store):
    store.write_bars([_bar(_ts(18, 9))])
    with pytest.raises(BarStoreError):
        store.read_bars("EURUSD", Timeframe.M15, datetime(2025, 5, 18), datetime(2025, 5, 19))
