from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class LoanWaterfall:
    """Loss split for one defaulted loan dollar after collateral sale."""

    collateral_loss_rate: float
    bank_first_loss_rate: float
    insurer_claim_rate: float
    bank_excess_loss_rate: float


@dataclass(frozen=True)
class BucketYearResult:
    year: int
    bucket_id: str
    label: str
    exposure_nzd: float
    starting_lvr: float
    default_rate: float
    collateral_loss_rate: float
    bank_first_loss_rate: float
    insurer_claim_rate: float
    bank_excess_loss_rate: float
    premium_nzd: float
    bank_first_loss_nzd: float
    insurer_claim_nzd: float
    bank_excess_loss_nzd: float


@dataclass(frozen=True)
class InsurerYearResult:
    year: int
    insured_exposure_nzd: float
    premiums_nzd: float
    operating_cost_nzd: float
    investment_income_nzd: float
    gross_claims_nzd: float
    reinsurance_recovery_nzd: float
    net_claims_nzd: float
    opening_reserve_nzd: float
    closing_reserve_nzd: float
    crown_draw_nzd: float
    crown_debt_opening_nzd: float
    crown_interest_nzd: float
    crown_repayment_nzd: float
    crown_debt_closing_nzd: float
    bank_first_loss_nzd: float
    bank_excess_loss_nzd: float


@dataclass(frozen=True)
class PolicyComparison:
    policy: str
    total_bank_losses_nzd: float
    peak_bank_capital_hit_nzd: float
    total_premiums_nzd: float
    total_insurer_claims_nzd: float
    total_reinsurance_recovery_nzd: float
    peak_crown_liquidity_nzd: float
    crown_debt_remaining_nzd: float
    reserve_after_10y_nzd: float
    warnings: list[str]


@dataclass(frozen=True)
class StressResult:
    scenario: str
    design: str
    years: int
    bucket_years: list[BucketYearResult]
    insurer_years: list[InsurerYearResult]
    comparison: list[PolicyComparison]
    warnings: list[str]


def _require(mapping: dict[str, Any], key: str) -> Any:
    if key not in mapping:
        raise KeyError(f"Missing required key: {key}")
    return mapping[key]


def collateral_loss_rate(starting_lvr: float, house_price_fall: float, forced_sale_haircut: float) -> float:
    if not 0 < starting_lvr <= 1.5:
        raise ValueError("starting_lvr must be in (0, 1.5]")
    if not 0 <= house_price_fall < 1:
        raise ValueError("house_price_fall must be in [0, 1)")
    if not 0 <= forced_sale_haircut < 1:
        raise ValueError("forced_sale_haircut must be in [0, 1)")

    sale_proceeds_per_loan_dollar = (1 - house_price_fall) * (1 - forced_sale_haircut) / starting_lvr
    return max(0.0, 1.0 - sale_proceeds_per_loan_dollar)


def stressed_default_rate(
    base_default_rate: float,
    unemployment_shock_pp: float,
    unemployment_sensitivity: float,
    mortgage_rate_shock_pp: float,
    rate_sensitivity: float,
    risk_multiplier: float,
) -> float:
    raw = (
        base_default_rate
        + unemployment_shock_pp * unemployment_sensitivity
        + mortgage_rate_shock_pp * rate_sensitivity
    )
    return min(max(raw * risk_multiplier, 0.0), 1.0)


def loan_level_waterfall(
    collateral_loss: float,
    bank_attachment: float,
    insured_layer_limit: float,
) -> LoanWaterfall:
    if not 0 <= collateral_loss <= 1:
        raise ValueError("collateral_loss must be in [0, 1]")
    if not 0 <= bank_attachment <= 1:
        raise ValueError("bank_attachment must be in [0, 1]")
    if not 0 <= insured_layer_limit <= 1:
        raise ValueError("insured_layer_limit must be in [0, 1]")

    bank_first_loss = min(collateral_loss, bank_attachment)
    insurer_claim = min(max(collateral_loss - bank_attachment, 0.0), insured_layer_limit)
    bank_excess_loss = max(collateral_loss - bank_attachment - insured_layer_limit, 0.0)
    return LoanWaterfall(
        collateral_loss_rate=collateral_loss,
        bank_first_loss_rate=bank_first_loss,
        insurer_claim_rate=insurer_claim,
        bank_excess_loss_rate=bank_excess_loss,
    )


def aggregate_reinsurance_recovery(
    gross_claims_nzd: float,
    attachment_nzd: float,
    limit_nzd: float,
    share: float,
) -> float:
    """Aggregate stop-loss/XoL style recovery on annual insurer claims."""

    if gross_claims_nzd < 0:
        raise ValueError("gross_claims_nzd must be non-negative")
    if attachment_nzd < 0 or limit_nzd < 0:
        raise ValueError("attachment_nzd and limit_nzd must be non-negative")
    if not 0 <= share <= 1:
        raise ValueError("share must be in [0, 1]")

    covered_band = min(max(gross_claims_nzd - attachment_nzd, 0.0), limit_nzd)
    return covered_band * share


def _scenario_for_year(scenario: dict[str, Any], year: int) -> dict[str, float]:
    crisis_start = int(_require(scenario, "crisis_start_year"))
    crisis_years = int(_require(scenario, "crisis_duration_years"))
    phase = "crisis" if crisis_start <= year < crisis_start + crisis_years else "normal"
    values = _require(scenario, phase)
    return {
        "house_price_fall": float(_require(values, "house_price_fall")),
        "unemployment_shock_pp": float(_require(values, "unemployment_shock_pp")),
        "mortgage_rate_shock_pp": float(_require(values, "mortgage_rate_shock_pp")),
        "forced_sale_haircut": float(_require(values, "forced_sale_haircut")),
    }


def _programme_exposure(total_book_nzd: float, migration_rate: float, year: int) -> float:
    return total_book_nzd * min(1.0, migration_rate * year)


def run_stress(assumptions: dict[str, Any], scenario_name: str, design_name: str) -> StressResult:
    scenarios = _require(assumptions, "scenarios")
    designs = _require(assumptions, "designs")
    if scenario_name not in scenarios:
        raise KeyError(f"Unknown scenario: {scenario_name}")
    if design_name not in designs:
        raise KeyError(f"Unknown design: {design_name}")

    scenario = scenarios[scenario_name]
    design = designs[design_name]
    years = int(_require(assumptions, "years"))
    mortgage_book_nzd = float(_require(assumptions, "mortgage_book_nzd"))
    migration_rate = float(_require(design, "annual_programme_migration_rate"))
    bank_attachment = float(_require(design, "bank_first_loss_rate"))
    bucket_terms = _require(design, "bucket_terms")
    funding = _require(design, "insurer_funding")
    reinsurance = _require(design, "aggregate_reinsurance")

    reserve = float(_require(funding, "starting_reserve_nzd"))
    crown_debt = 0.0
    bucket_years: list[BucketYearResult] = []
    insurer_years: list[InsurerYearResult] = []
    warnings: list[str] = []

    for year in range(1, years + 1):
        annual_macro = _scenario_for_year(scenario, year)
        insured_exposure = _programme_exposure(mortgage_book_nzd, migration_rate, year)
        opening_reserve = reserve
        crown_opening = crown_debt
        premiums = 0.0
        bank_first_loss = 0.0
        bank_excess_loss = 0.0
        gross_claims = 0.0

        for bucket in _require(assumptions, "lvr_buckets"):
            bucket_id = str(_require(bucket, "id"))
            terms = _require(bucket_terms, bucket_id)
            exposure = insured_exposure * float(_require(bucket, "exposure_share"))
            loss_rate = collateral_loss_rate(
                float(_require(bucket, "starting_lvr")),
                annual_macro["house_price_fall"],
                annual_macro["forced_sale_haircut"],
            )
            default_rate = stressed_default_rate(
                float(_require(assumptions, "base_default_rate")),
                annual_macro["unemployment_shock_pp"],
                float(_require(assumptions, "unemployment_sensitivity")),
                annual_macro["mortgage_rate_shock_pp"],
                float(_require(assumptions, "rate_sensitivity")),
                float(_require(bucket, "risk_multiplier")),
            )
            waterfall = loan_level_waterfall(
                loss_rate,
                bank_attachment,
                float(_require(terms, "insured_layer_rate")),
            )

            premium = exposure * float(_require(terms, "premium_rate"))
            bucket_bank_first = exposure * default_rate * waterfall.bank_first_loss_rate
            bucket_claim = exposure * default_rate * waterfall.insurer_claim_rate
            bucket_bank_excess = exposure * default_rate * waterfall.bank_excess_loss_rate

            premiums += premium
            bank_first_loss += bucket_bank_first
            gross_claims += bucket_claim
            bank_excess_loss += bucket_bank_excess
            bucket_years.append(
                BucketYearResult(
                    year=year,
                    bucket_id=bucket_id,
                    label=str(_require(bucket, "label")),
                    exposure_nzd=exposure,
                    starting_lvr=float(_require(bucket, "starting_lvr")),
                    default_rate=default_rate,
                    collateral_loss_rate=waterfall.collateral_loss_rate,
                    bank_first_loss_rate=waterfall.bank_first_loss_rate,
                    insurer_claim_rate=waterfall.insurer_claim_rate,
                    bank_excess_loss_rate=waterfall.bank_excess_loss_rate,
                    premium_nzd=premium,
                    bank_first_loss_nzd=bucket_bank_first,
                    insurer_claim_nzd=bucket_claim,
                    bank_excess_loss_nzd=bucket_bank_excess,
                )
            )

        recovery = aggregate_reinsurance_recovery(
            gross_claims,
            float(_require(reinsurance, "attachment_nzd")),
            float(_require(reinsurance, "limit_nzd")),
            float(_require(reinsurance, "share")),
        )
        net_claims = gross_claims - recovery
        operating_cost = float(_require(funding, "annual_operating_cost_nzd"))
        investment_income = max(reserve, 0.0) * float(_require(funding, "reserve_yield_rate"))
        crown_interest = crown_debt * float(_require(funding, "crown_facility_interest_rate"))
        pre_facility_reserve = reserve + premiums + investment_income - net_claims - operating_cost - crown_interest
        crown_draw = max(0.0, -pre_facility_reserve)
        reserve = max(0.0, pre_facility_reserve)
        crown_debt += crown_draw

        surplus_repayment_share = float(_require(funding, "surplus_repayment_share"))
        required_capital = insured_exposure * float(_require(funding, "required_capital_rate"))
        repayment_surplus = max(reserve - required_capital, 0.0)
        crown_repayment = min(crown_debt, repayment_surplus * surplus_repayment_share)
        if crown_repayment:
            reserve -= crown_repayment
            crown_debt -= crown_repayment

        insurer_years.append(
            InsurerYearResult(
                year=year,
                insured_exposure_nzd=insured_exposure,
                premiums_nzd=premiums,
                operating_cost_nzd=operating_cost,
                investment_income_nzd=investment_income,
                gross_claims_nzd=gross_claims,
                reinsurance_recovery_nzd=recovery,
                net_claims_nzd=net_claims,
                opening_reserve_nzd=opening_reserve,
                closing_reserve_nzd=reserve,
                crown_draw_nzd=crown_draw,
                crown_debt_opening_nzd=crown_opening,
                crown_interest_nzd=crown_interest,
                crown_repayment_nzd=crown_repayment,
                crown_debt_closing_nzd=crown_debt,
                bank_first_loss_nzd=bank_first_loss,
                bank_excess_loss_nzd=bank_excess_loss,
            )
        )

    if float(_require(funding, "starting_reserve_nzd")) == 0:
        warnings.append("zero_start_is_crown_contingent_liability_until_reserve_builds")
    if any(year.crown_draw_nzd > 0 for year in insurer_years):
        warnings.append("crown_liquidity_facility_used")

    comparison = _build_policy_comparison(assumptions, design_name, insurer_years, warnings)
    return StressResult(
        scenario=scenario_name,
        design=design_name,
        years=years,
        bucket_years=bucket_years,
        insurer_years=insurer_years,
        comparison=comparison,
        warnings=warnings,
    )


def _build_policy_comparison(
    assumptions: dict[str, Any],
    design_name: str,
    insurer_years: list[InsurerYearResult],
    design_warnings: list[str],
) -> list[PolicyComparison]:
    bank_losses = [year.bank_first_loss_nzd + year.bank_excess_loss_nzd for year in insurer_years]
    national_insurance = PolicyComparison(
        policy=f"national_insurance:{design_name}",
        total_bank_losses_nzd=sum(bank_losses),
        peak_bank_capital_hit_nzd=max(bank_losses, default=0.0),
        total_premiums_nzd=sum(year.premiums_nzd for year in insurer_years),
        total_insurer_claims_nzd=sum(year.gross_claims_nzd for year in insurer_years),
        total_reinsurance_recovery_nzd=sum(year.reinsurance_recovery_nzd for year in insurer_years),
        peak_crown_liquidity_nzd=max((year.crown_debt_closing_nzd for year in insurer_years), default=0.0),
        crown_debt_remaining_nzd=insurer_years[-1].crown_debt_closing_nzd if insurer_years else 0.0,
        reserve_after_10y_nzd=insurer_years[-1].closing_reserve_nzd if insurer_years else 0.0,
        warnings=list(design_warnings),
    )

    baselines = _require(assumptions, "baselines")
    current = _baseline_policy("current_system", baselines, insurer_years)
    higher_capital = _baseline_policy("higher_bank_capital", baselines, insurer_years)
    return [current, higher_capital, national_insurance]


def _baseline_policy(
    name: str,
    baselines: dict[str, Any],
    insurer_years: list[InsurerYearResult],
) -> PolicyComparison:
    baseline = _require(baselines, name)
    retained_share = float(_require(baseline, "bank_loss_retention_share"))
    capital_buffer = float(_require(baseline, "extra_bank_capital_buffer_nzd"))
    system_losses = [
        (year.bank_first_loss_nzd + year.gross_claims_nzd + year.bank_excess_loss_nzd) * retained_share
        for year in insurer_years
    ]
    peak_loss = max(system_losses, default=0.0)
    warnings = []
    if peak_loss > capital_buffer:
        warnings.append("bank_losses_exceed_extra_capital_buffer")
    return PolicyComparison(
        policy=name,
        total_bank_losses_nzd=sum(system_losses),
        peak_bank_capital_hit_nzd=peak_loss,
        total_premiums_nzd=0.0,
        total_insurer_claims_nzd=0.0,
        total_reinsurance_recovery_nzd=0.0,
        peak_crown_liquidity_nzd=0.0,
        crown_debt_remaining_nzd=0.0,
        reserve_after_10y_nzd=0.0,
        warnings=warnings,
    )
