# Model contract v0.2

This repository now treats the Python engine as the canonical model and the web app as the interface.

The key rule is that mortgage loss allocation and insurer funding are separate waterfalls.

## 1. Loan-level mortgage loss waterfall

For each defaulted loan bucket:

```text
collateral sale / borrower equity
→ bank first-loss / deductible
→ insured mortgage layer
→ bank excess loss
```

The model must conserve loss:

```text
collateral_loss_rate
  = bank_first_loss_rate
  + insurer_claim_rate
  + bank_excess_loss_rate
```

If collateral LGD exceeds the bank deductible plus insured layer, the excess stays with the bank by default. Crown support is not automatically inserted into this loan-level waterfall.

## 2. Aggregate insurer funding waterfall

The national insurer then funds its annual aggregate claims:

```text
current premiums
→ reserve
→ aggregate reinsurance recovery
→ Crown liquidity facility as debt
→ recapitalisation / fiscal loss if debt cannot be repaid
```

Reinsurance is applied to aggregate annual insurer claims, not to each individual mortgage loss. For example:

```text
50% of annual claims between $1bn and $4bn
```

## 3. Kill test

The model should compare three policy designs under the same macro shock:

```text
current banking system
vs higher bank capital requirements
vs national mortgage insurance with reserve and reinsurance
```

If higher bank capital gives the same resilience more cheaply and with less fiscal tail risk, the national insurance proposal fails.

