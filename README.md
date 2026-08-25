# NZ Economic Stress Lab

An interactive scenario model for testing how mortgage losses could be divided among New Zealand lenders, a national mortgage insurer, international reinsurers, and the Crown.

The current model covers 2026–2036 and allows the user to change:

- mortgage-market size and programme migration;
- insurance premium and starting capital;
- normal-year loss and operating costs;
- reserve investment return and reinsurance price;
- crisis timing, duration, and gross mortgage loss;
- lender first-loss and reinsurance shares.

It reports the annual insurance reserve, loss allocation, and any Crown liquidity required when the reserve is exhausted.

## Important limitation

This is a scenario calculator, not an actuarial forecast. Public RBNZ, Stats NZ, and Treasury data can supply macroeconomic and aggregate banking inputs, but probability of default, loss given default, insurance attachment points, and reinsurance pricing remain assumptions until independently calibrated.

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

## Data sources planned

- Reserve Bank of New Zealand statistical series
- Stats NZ Aotearoa Data Explorer API
- New Zealand Treasury economic and fiscal forecasts

## Status

Working prototype, version 0.1.
