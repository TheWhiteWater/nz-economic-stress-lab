# Data source map

Status: first RBNZ ingestion slice implemented.

Official sources to wire into the engine:

- RBNZ mortgage lending and LVR/DTI series for new lending and flow constraints.
- RBNZ banking statistics and financial stability indicators for bank balance-sheet context.
- Stats NZ labour market, CPI, population, construction and household data.
- Treasury economic and fiscal forecasts for macro and Crown debt baselines.
- MBIE tenancy/market-rent data where affordability and rental stress are needed.

Important caveat: RBNZ C30 is new mortgage commitments by LVR, not the whole outstanding mortgage book. It must not be used as a direct outstanding-book LVR distribution without an explicit transformation.

## First implemented source slice

Source registry:

```text
engine/data/rbnz_sources.json
```

Fetcher:

```text
engine/scripts/fetch_rbnz_sources.py
```

Command:

```bash
npm run data:rbnz
```

The first slice covers:

- `C35` — residential mortgage loan reconciliation;
- `C30` — new residential mortgage lending by LVR;
- `B20` — new residential mortgage standard interest rates;
- `B21` — new residential mortgage special interest rates;
- `B30` — new residential mortgage weighted average interest rates.

The fetcher stores downloaded XLSX files and converted CSV sheets in ignored directories and writes an ingestion manifest with hashes and sheet counts. These files are operational data artifacts, not source code.
