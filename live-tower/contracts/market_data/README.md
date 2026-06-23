# Market Data Contracts (v1)

Canonical, versioned market-data contracts shared by **FX-OB-Research-Lab** and the **Live Trading Control Tower**. These schemas are the *only* coupling surface between the two systems for market data — neither imports the other's code.

See `LIVE-TOWER-MARKET-DATA-V1.md` for the full architecture rationale.

## Contracts

| File | Schema id | Purpose |
|---|---|---|
| `md.bar.v1.schema.json` | `md.bar.v1` | Canonical OHLCV bar (system of record). Strict superset of the Lab `candles.csv` columns. |
| `md.tick.v1.schema.json` | `md.tick.v1` | Canonical bid/ask tick (optional high-resolution substrate). |
| `md.news.v1.schema.json` | `md.news.v1` | Economic-calendar / news event (market-data view). |

`examples/` holds one valid instance of each, used by contract tests.

## Rules

- **UTC only.** No local times cross a contract boundary, ever. Session labels are derived on read.
- **Canonical symbols only.** Venue spellings are mapped at the feed edge.
- **Versioned, additive.** New optional fields stay on `vN`; shape-breaking changes create `vN+1` and run side-by-side during migration.
- **`is_closed` is law.** Consumers act on closed bars only (look-ahead prevention).
- **Derived fields** (`session`, `mid`, `spread`) are conveniences, always recomputable, never authoritative.

## Bus envelope (informative)

Market-data bus frames wrap one payload above. The envelope itself is not a stored contract; it is the in-process delivery shape, identical for live and replay so consumers cannot tell them apart:

```jsonc
{
  "type": "md.bar.closed" | "md.tick" | "md.news" | "md.gap" | "md.stale",
  "seq": 998123,
  "emitted_at": "2026-06-16T12:30:00.001Z",
  "clock": "live" | "replay",
  "payload": { /* one of md.bar.v1 / md.tick.v1 / md.news.v1, or a gap/stale notice */ }
}
```

## Validation

```bash
# any JSON Schema 2020-12 validator; example with python-jsonschema
python -m jsonschema -i examples/bar.example.json  md.bar.v1.schema.json
python -m jsonschema -i examples/tick.example.json md.tick.v1.schema.json
python -m jsonschema -i examples/news.example.json md.news.v1.schema.json
```
