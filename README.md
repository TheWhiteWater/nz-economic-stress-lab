# NZ Economic Stress Lab

An interactive scenario model for testing how mortgage losses could be divided among New Zealand lenders, a national mortgage insurer, international reinsurers, and the Crown.

This is the canonical repository for the work. It has two layers:

- `app/` — the current Next.js web interface;
- `engine/` — the canonical Python calculation engine.

The web app should become a view over the engine assumptions/results, not an independent economic model.

The current web model covers 2026–2036 and allows the user to change:

- mortgage-market size and programme migration;
- insurance premium and starting capital;
- normal-year loss and operating costs;
- reserve investment return and reinsurance price;
- crisis timing, duration, and gross mortgage loss;
- lender first-loss and reinsurance shares.

It reports the annual insurance reserve, loss allocation, and any Crown liquidity required when the reserve is exhausted.

## Important limitation

This is a scenario calculator, not an actuarial forecast. Public RBNZ, Stats NZ, and Treasury data can supply macroeconomic and aggregate banking inputs, but probability of default, loss given default, insurance attachment points, and reinsurance pricing remain assumptions until independently calibrated.

## Engine contract

Version `v0.2` separates two waterfalls that must not be mixed:

```text
Loan-level mortgage loss:
collateral / borrower equity
→ bank first-loss
→ insured mortgage layer
→ bank excess loss
```

```text
Aggregate insurer funding:
premiums
→ reserve
→ aggregate reinsurance recovery
→ Crown liquidity facility as debt
→ recapitalisation / fiscal loss
```

The core kill test is:

> Under the same macro shock, what is cheaper and more resilient for New Zealand: the current system, higher bank capital requirements, or national mortgage insurance with reserve and reinsurance?

## Development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Production build:

```bash
npm run build
```

Engine tests:

```bash
npm run test:engine
```

Cross-language parity test:

```bash
npm run fixtures:engine
npm run test:parity
```

`engine/fixtures/golden.v0.json` is generated from the Python engine. The browser runtime model must match it before the site can be described as engine-aligned.

## Data sources planned

- Reserve Bank of New Zealand statistical series
- Stats NZ Aotearoa Data Explorer API
- New Zealand Treasury economic and fiscal forecasts

## Status

Working prototype.

- Web interface: v0.1.
- Python engine: v0.2 prototype with explicit loan-level and aggregate insurer waterfalls.
- Browser runtime: engine-parity guarded by Python-generated golden fixtures.
- RBNZ snapshot mode: market size and rate context can be anchored to the committed 2026-06-30 RBNZ derived snapshot.
