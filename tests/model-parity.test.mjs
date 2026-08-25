import assert from "node:assert/strict";
import fixtures from "../engine/fixtures/golden.v0.json" with { type: "json" };
import assumptions from "../engine/data/assumptions.v0.json" with { type: "json" };
import { runAssumptionStress } from "../lib/economic-model-core.mjs";
import test from "node:test";

const tolerance = 0.01;

function assertClose(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

test("TypeScript runtime model matches Python golden fixtures", () => {
  for (const fixtureCase of fixtures.cases) {
    const actual = runAssumptionStress(
      assumptions,
      fixtureCase.scenario,
      fixtureCase.design,
    );
    const expected = fixtureCase.result;
    const label = `${fixtureCase.scenario}/${fixtureCase.design}`;

    assert.equal(actual.insurer_years.length, expected.insurer_years.length, label);
    assert.equal(actual.bucket_years.length, expected.bucket_years.length, label);
    assert.deepEqual(actual.warnings, expected.warnings, `${label} warnings`);

    for (let index = 0; index < expected.insurer_years.length; index += 1) {
      const actualYear = actual.insurer_years[index];
      const expectedYear = expected.insurer_years[index];
      assertClose(actualYear.gross_claims_nzd, expectedYear.gross_claims_nzd, `${label} Y${index + 1} gross claims`);
      assertClose(actualYear.reinsurance_recovery_nzd, expectedYear.reinsurance_recovery_nzd, `${label} Y${index + 1} reinsurance`);
      assertClose(actualYear.closing_reserve_nzd, expectedYear.closing_reserve_nzd, `${label} Y${index + 1} reserve`);
      assertClose(actualYear.crown_debt_closing_nzd, expectedYear.crown_debt_closing_nzd, `${label} Y${index + 1} Crown debt`);
      assertClose(actualYear.bank_excess_loss_nzd, expectedYear.bank_excess_loss_nzd, `${label} Y${index + 1} bank excess`);
    }

    for (let index = 0; index < expected.comparison.length; index += 1) {
      const actualComparison = actual.comparison[index];
      const expectedComparison = expected.comparison[index];
      assert.equal(actualComparison.policy, expectedComparison.policy, `${label} comparison policy`);
      assertClose(
        actualComparison.peak_bank_capital_hit_nzd,
        expectedComparison.peak_bank_capital_hit_nzd,
        `${label} comparison bank hit`,
      );
      assertClose(
        actualComparison.crown_debt_remaining_nzd,
        expectedComparison.crown_debt_remaining_nzd,
        `${label} comparison Crown debt`,
      );
    }
  }
});

