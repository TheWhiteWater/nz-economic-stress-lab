import json
import math
import unittest
from pathlib import Path

from nzmi_stress_lab.model import (
    aggregate_reinsurance_recovery,
    collateral_loss_rate,
    loan_level_waterfall,
    run_stress,
)


ROOT = Path(__file__).resolve().parents[1]


class ModelV02Tests(unittest.TestCase):
    def setUp(self):
        self.assumptions = json.loads((ROOT / "data" / "assumptions.v0.json").read_text())

    def test_collateral_loss_zero_when_equity_survives_shock(self):
        self.assertEqual(collateral_loss_rate(0.55, 0.05, 0.05), 0.0)

    def test_loan_waterfall_conserves_loss_and_keeps_excess_at_bank(self):
        result = loan_level_waterfall(collateral_loss=0.30, bank_attachment=0.05, insured_layer_limit=0.15)
        self.assertAlmostEqual(result.bank_first_loss_rate, 0.05)
        self.assertAlmostEqual(result.insurer_claim_rate, 0.15)
        self.assertAlmostEqual(result.bank_excess_loss_rate, 0.10)
        self.assertAlmostEqual(
            result.collateral_loss_rate,
            result.bank_first_loss_rate + result.insurer_claim_rate + result.bank_excess_loss_rate,
        )

    def test_reinsurance_is_aggregate_not_loan_level(self):
        recovery = aggregate_reinsurance_recovery(
            gross_claims_nzd=5_000_000_000,
            attachment_nzd=1_000_000_000,
            limit_nzd=3_000_000_000,
            share=0.5,
        )
        self.assertEqual(recovery, 1_500_000_000)

    def test_severe_crown_seed_returns_ten_year_balance_and_comparison(self):
        result = run_stress(self.assumptions, "severe", "crown_seed_tiered")
        self.assertEqual(result.years, 10)
        self.assertEqual(len(result.insurer_years), 10)
        self.assertEqual(len(result.bucket_years), 40)
        self.assertEqual([row.policy for row in result.comparison], [
            "current_system",
            "higher_bank_capital",
            "national_insurance:crown_seed_tiered",
        ])

    def test_zero_start_is_marked_as_contingent_crown_exposure(self):
        result = run_stress(self.assumptions, "crisis", "zero_start_tiered")
        self.assertIn("zero_start_is_crown_contingent_liability_until_reserve_builds", result.warnings)

    def test_crown_interest_is_cash_paid_not_double_counted_into_debt(self):
        result = run_stress(self.assumptions, "crisis", "zero_start_tiered")
        year_with_opening_debt = next(year for year in result.insurer_years if year.crown_debt_opening_nzd > 0)
        expected_closing = (
            year_with_opening_debt.crown_debt_opening_nzd
            + year_with_opening_debt.crown_draw_nzd
            - year_with_opening_debt.crown_repayment_nzd
        )
        self.assertAlmostEqual(year_with_opening_debt.crown_debt_closing_nzd, expected_closing)

    def test_crown_repayment_only_uses_surplus_above_required_capital(self):
        result = run_stress(self.assumptions, "crisis", "zero_start_tiered")
        funding = self.assumptions["designs"]["zero_start_tiered"]["insurer_funding"]
        required_capital_rate = funding["required_capital_rate"]
        repayment_share = funding["surplus_repayment_share"]
        for year in result.insurer_years:
            surplus = max(year.closing_reserve_nzd + year.crown_repayment_nzd - year.insured_exposure_nzd * required_capital_rate, 0)
            self.assertLessEqual(year.crown_repayment_nzd, surplus * repayment_share + 0.01)

    def test_crisis_is_worse_than_base_for_same_design(self):
        base = run_stress(self.assumptions, "base", "crown_seed_tiered")
        crisis = run_stress(self.assumptions, "crisis", "crown_seed_tiered")
        self.assertGreater(
            sum(year.gross_claims_nzd for year in crisis.insurer_years),
            sum(year.gross_claims_nzd for year in base.insurer_years),
        )
        self.assertTrue(math.isfinite(crisis.comparison[-1].peak_crown_liquidity_nzd))


if __name__ == "__main__":
    unittest.main()
