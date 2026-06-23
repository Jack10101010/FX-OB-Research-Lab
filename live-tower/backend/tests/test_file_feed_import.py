"""
Tests for FileFeed.import_bars — candles.csv -> validated md.bar.v1 Bars.

Market-data only. No execution, no broker, no UI. Uses tiny inline fixture CSVs
written to a tmp path, covering: valid rows, invalid OHLC, missing column,
naive timestamp, and a bad numeric value.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.marketdata.contracts import BarSource, Domain, Session, Timeframe
from app.marketdata.feeds.file_feed import (
    CandleImportError,
    FileFeed,
    FileFeedConfig,
)

HEADER = "time,open,high,low,close,volume"


def _write(tmp_path: Path, body: str, name: str = "candles.csv") -> Path:
    p = tmp_path / name
    p.write_text(body, encoding="utf-8")
    return p


def _feed(path: Path, **kw) -> FileFeed:
    cfg = FileFeedConfig(
        candles_path=path,
        symbol=kw.get("symbol", "EURUSD"),
        domain=kw.get("domain", Domain.FX),
        timeframe=kw.get("timeframe", Timeframe.M15),
    )
    return FileFeed(cfg)


# ── happy path ───────────────────────────────────────────────────────────────

def test_valid_rows_both_timestamp_formats(tmp_path):
    csv = "\n".join([
        HEADER,
        "2025-05-18 21:00:00+00:00,1.11749,1.11776,1.11713,1.11758,129.285",  # space + offset
        "2025-05-18T21:15:00Z,1.11754,1.11835,1.11752,1.11813,110.25",        # T + Z
    ]) + "\n"
    bars = _feed(_write(tmp_path, csv)).import_bars()

    assert len(bars) == 2
    b0, b1 = bars
    # stamped from config
    assert b0.symbol == "EURUSD" and b0.domain == Domain.FX and b0.timeframe == Timeframe.M15
    assert b0.is_closed is True and b0.source == BarSource.FILE
    # parsed values + UTC normalization
    assert (b0.open, b0.high, b0.low, b0.close, b0.volume) == (1.11749, 1.11776, 1.11713, 1.11758, 129.285)
    assert b0.to_contract()["ts"] == "2025-05-18T21:00:00Z"
    assert b1.to_contract()["ts"] == "2025-05-18T21:15:00Z"
    # session derived from timestamp (21:00 UTC -> Outside per ghost_tracker boundaries)
    assert b0.session == Session.OUTSIDE
    assert b0.to_contract()["session"] == "Outside"


def test_blank_lines_skipped(tmp_path):
    csv = HEADER + "\n" + "2025-05-18T21:00:00Z,1.1,1.2,1.0,1.15,5\n\n   \n"
    bars = _feed(_write(tmp_path, csv)).import_bars()
    assert len(bars) == 1


def test_session_derived_for_london(tmp_path):
    csv = HEADER + "\n" + "2025-05-18T05:00:00Z,1.1,1.2,1.0,1.15,5\n"
    bars = _feed(_write(tmp_path, csv)).import_bars()
    assert bars[0].session == Session.LONDON


# ── rejection paths (no silent coercion) ─────────────────────────────────────

def test_invalid_ohlc_rejected_with_row_number(tmp_path):
    # high (1.10) < open (1.20) -> impossible OHLC, rejected by the Bar contract
    csv = HEADER + "\n" + "2025-05-18T21:00:00Z,1.20,1.10,1.00,1.05,5\n"
    with pytest.raises(CandleImportError) as ei:
        _feed(_write(tmp_path, csv)).import_bars()
    assert ei.value.row_no == 2
    assert "invalid bar" in str(ei.value)


def test_missing_column_rejected(tmp_path):
    csv = "time,open,high,close,volume\n2025-05-18T21:00:00Z,1.1,1.2,1.15,5\n"  # no 'low'
    with pytest.raises(CandleImportError) as ei:
        _feed(_write(tmp_path, csv)).import_bars()
    assert "missing required column" in str(ei.value) and "low" in str(ei.value)


def test_naive_timestamp_rejected(tmp_path):
    csv = HEADER + "\n" + "2025-05-18 21:00:00,1.1,1.2,1.0,1.15,5\n"  # no tz
    with pytest.raises(CandleImportError) as ei:
        _feed(_write(tmp_path, csv)).import_bars()
    assert ei.value.row_no == 2 and "naive timestamp" in str(ei.value)


def test_non_utc_timestamp_rejected(tmp_path):
    csv = HEADER + "\n" + "2025-05-18T21:00:00+02:00,1.1,1.2,1.0,1.15,5\n"
    with pytest.raises(CandleImportError) as ei:
        _feed(_write(tmp_path, csv)).import_bars()
    assert "non-UTC timestamp" in str(ei.value)


def test_bad_numeric_rejected(tmp_path):
    csv = HEADER + "\n" + "2025-05-18T21:00:00Z,1.1,oops,1.0,1.15,5\n"
    with pytest.raises(CandleImportError) as ei:
        _feed(_write(tmp_path, csv)).import_bars()
    assert ei.value.row_no == 2 and "invalid numeric for high" in str(ei.value)


def test_second_row_error_reports_correct_line(tmp_path):
    csv = "\n".join([
        HEADER,
        "2025-05-18T21:00:00Z,1.1,1.2,1.0,1.15,5",   # valid (row 2)
        "2025-05-18T21:15:00Z,1.1,1.2,1.0,,5",        # bad close (row 3)
    ]) + "\n"
    with pytest.raises(CandleImportError) as ei:
        _feed(_write(tmp_path, csv)).import_bars()
    assert ei.value.row_no == 3


def test_missing_file_rejected(tmp_path):
    with pytest.raises(CandleImportError) as ei:
        _feed(tmp_path / "does_not_exist.csv").import_bars()
    assert "file not found" in str(ei.value)
