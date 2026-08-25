# Data source map

Status: source map, not completed data integration.

Official sources to wire into the engine:

- RBNZ mortgage lending and LVR/DTI series for new lending and flow constraints.
- RBNZ banking statistics and financial stability indicators for bank balance-sheet context.
- Stats NZ labour market, CPI, population, construction and household data.
- Treasury economic and fiscal forecasts for macro and Crown debt baselines.
- MBIE tenancy/market-rent data where affordability and rental stress are needed.

Important caveat: RBNZ C30 is new mortgage commitments by LVR, not the whole outstanding mortgage book. It must not be used as a direct outstanding-book LVR distribution without an explicit transformation.

