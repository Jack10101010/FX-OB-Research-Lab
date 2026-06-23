# Market-data backend (FileFeed import)

Market data only — no execution, no broker, no UI.

## Importing an existing Lab `candles.csv`

`FileFeed.import_bars()` turns an FX-OB-Research-Lab / backtester candle CSV
(`time,open,high,low,close,volume`) into validated `md.bar.v1` `Bar` objects.

```python
from app.marketdata.contracts import Domain, Timeframe
from app.marketdata.feeds.file_feed import FileFeed, FileFeedConfig, CandleImportError

feed = FileFeed(FileFeedConfig(
    candles_path="test_import_bundle/candles.csv",  # path to candles.csv
    symbol="EURUSD",                                # canonical symbol
    domain=Domain.FX,                               # FX (FUTURES later)
    timeframe=Timeframe.M15,                         # detection timeframe
))

try:
    bars = feed.import_bars()        # -> List[Bar], file order
except CandleImportError as err:
    print(f"import failed at row {err.row_no}: {err.message}")
    raise

first = bars[0]
print(first.to_contract())
# {'schema': 'md.bar.v1', 'symbol': 'EURUSD', 'domain': 'FX', 'timeframe': 'M15',
#  'ts': '2025-05-18T21:00:00Z', 'open': ..., 'high': ..., 'low': ..., 'close': ...,
#  'volume': ..., 'is_closed': True, 'source': 'file', 'session': 'Outside'}
```

Each imported bar is stamped `is_closed=True`, `source=file`, and the configured
`symbol`/`domain`/`timeframe`; `session` is derived from the timestamp.

### What is accepted / rejected

Accepts both observed timestamp shapes: `2025-05-18 21:00:00+00:00` and
`2025-05-18T21:00:00Z`.

Rejects (raises `CandleImportError` with the 1-based row number — never coerced):
missing required columns, naive timestamps, non-UTC offsets, non-numeric OHLCV,
and impossible OHLC (e.g. `high < open`). The first bad row stops the import.

## Durable storage: `BarStore`

`BarStore` persists validated `Bar` objects to disk, partitioned by
`domain/symbol/timeframe/year/month`, and reads them back by time window.

Backend is chosen automatically: **Parquet** when `pyarrow` is importable
(`bars.parquet` per partition), otherwise a **JSONL fallback** (`bars.jsonl`).
The class name `BarStore` is stable, so the backend can change later without
touching callers.

### End-to-end: import → write → read

```python
from datetime import datetime, timezone
from app.marketdata.contracts import Domain, Timeframe
from app.marketdata.feeds.file_feed import FileFeed, FileFeedConfig
from app.marketdata.storage.bar_store import BarStore

# 1. candles.csv -> validated md.bar.v1 Bars
bars = FileFeed(FileFeedConfig(
    candles_path="test_import_bundle/candles.csv",
    symbol="EURUSD", domain=Domain.FX, timeframe=Timeframe.M15,
)).import_bars()

# 2. write to the durable store (idempotent; re-running won't duplicate)
store = BarStore("live-tower/backend")        # backend="auto" (parquet|jsonl)
store.write_bars(bars)

# 3. read back a window  [start, end)  UTC, ascending by ts
window = store.read_bars(
    "EURUSD", Timeframe.M15,
    datetime(2025, 5, 18, tzinfo=timezone.utc),
    datetime(2025, 5, 19, tzinfo=timezone.utc),
)
print(len(window), window[0].to_contract())
```

Partition layout written:

```
<root>/data/market/domain=FX/symbol=EURUSD/timeframe=M15/year=2025/month=05/bars.{parquet|jsonl}
```

Semantics: dedup key is `(symbol, timeframe, ts)`; re-importing the same bars is
idempotent; a re-written `ts` replaces the prior record (last writer wins);
`read_bars` is half-open `[start, end)` and always returns bars sorted by `ts`.
Writing a non-`Bar` object raises `BarStoreError`. Atomic temp-write-then-replace
on every partition.

### Tests

```bash
cd live-tower/backend
python -m pytest -q                         # FileFeed import + BarStore
```
