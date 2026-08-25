import assumptions from "../engine/data/assumptions.v0.json" with { type: "json" };

export { assumptions };

export const defaultScenario = "severe";
export const defaultDesign = "crown_seed_tiered";

const NZD_PER_M = 1_000_000;
const NZD_PER_B = 1_000_000_000;

function requireKey(mapping, key) {
  if (!(key in mapping)) {
    throw new Error(`Missing required key: ${key}`);
  }
  return mapping[key];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function collateralLossRate(startingLvr, housePriceFall, forcedSaleHaircut) {
  const saleProceedsPerLoanDollar = (1 - housePriceFall) * (1 - forcedSaleHaircut) / startingLvr;
  return Math.max(0, 1 - saleProceedsPerLoanDollar);
}

export function stressedDefaultRate(
  baseDefaultRate,
  unemploymentShockPp,
  unemploymentSensitivity,
  mortgageRateShockPp,
  rateSensitivity,
  riskMultiplier,
) {
  const raw = baseDefaultRate + unemploymentShockPp * unemploymentSensitivity + mortgageRateShockPp * rateSensitivity;
  return clamp(raw * riskMultiplier, 0, 1);
}

export function loanLevelWaterfall(collateralLoss, bankAttachment, insuredLayerLimit) {
  const bankFirstLoss = Math.min(collateralLoss, bankAttachment);
  const insurerClaim = Math.min(Math.max(collateralLoss - bankAttachment, 0), insuredLayerLimit);
  const bankExcessLoss = Math.max(collateralLoss - bankAttachment - insuredLayerLimit, 0);

  return { collateralLoss, bankFirstLoss, insurerClaim, bankExcessLoss };
}

export function aggregateReinsuranceRecovery(grossClaimsNzd, attachmentNzd, limitNzd, share) {
  const coveredBand = Math.min(Math.max(grossClaimsNzd - attachmentNzd, 0), limitNzd);
  return coveredBand * share;
}

function scenarioForYear(scenario, year) {
  const crisisStart = Number(requireKey(scenario, "crisis_start_year"));
  const crisisYears = Number(requireKey(scenario, "crisis_duration_years"));
  const phase = crisisStart <= year && year < crisisStart + crisisYears ? "crisis" : "normal";
  const values = requireKey(scenario, phase);

  return {
    house_price_fall: Number(requireKey(values, "house_price_fall")),
    unemployment_shock_pp: Number(requireKey(values, "unemployment_shock_pp")),
    mortgage_rate_shock_pp: Number(requireKey(values, "mortgage_rate_shock_pp")),
    forced_sale_haircut: Number(requireKey(values, "forced_sale_haircut")),
  };
}

function programmeExposure(totalBookNzd, migrationRate, year) {
  return totalBookNzd * Math.min(1, migrationRate * year);
}

function baselinePolicy(name, baselines, insurerYears) {
  const baseline = requireKey(baselines, name);
  const retainedShare = Number(requireKey(baseline, "bank_loss_retention_share"));
  const capitalBuffer = Number(requireKey(baseline, "extra_bank_capital_buffer_nzd"));
  const systemLosses = insurerYears.map(
    (year) => (year.bank_first_loss_nzd + year.gross_claims_nzd + year.bank_excess_loss_nzd) * retainedShare,
  );
  const peakLoss = Math.max(...systemLosses, 0);

  return {
    policy: name,
    total_bank_losses_nzd: systemLosses.reduce((sum, value) => sum + value, 0),
    peak_bank_capital_hit_nzd: peakLoss,
    total_premiums_nzd: 0,
    total_insurer_claims_nzd: 0,
    total_reinsurance_recovery_nzd: 0,
    peak_crown_liquidity_nzd: 0,
    crown_debt_remaining_nzd: 0,
    reserve_after_10y_nzd: 0,
    warnings: peakLoss > capitalBuffer ? ["bank_losses_exceed_extra_capital_buffer"] : [],
  };
}

function buildPolicyComparison(modelAssumptions, designName, insurerYears, warnings) {
  const bankLosses = insurerYears.map((year) => year.bank_first_loss_nzd + year.bank_excess_loss_nzd);
  const nationalInsurance = {
    policy: `national_insurance:${designName}`,
    total_bank_losses_nzd: bankLosses.reduce((sum, value) => sum + value, 0),
    peak_bank_capital_hit_nzd: Math.max(...bankLosses, 0),
    total_premiums_nzd: insurerYears.reduce((sum, year) => sum + year.premiums_nzd, 0),
    total_insurer_claims_nzd: insurerYears.reduce((sum, year) => sum + year.gross_claims_nzd, 0),
    total_reinsurance_recovery_nzd: insurerYears.reduce((sum, year) => sum + year.reinsurance_recovery_nzd, 0),
    peak_crown_liquidity_nzd: Math.max(...insurerYears.map((year) => year.crown_debt_closing_nzd), 0),
    crown_debt_remaining_nzd: insurerYears.at(-1)?.crown_debt_closing_nzd ?? 0,
    reserve_after_10y_nzd: insurerYears.at(-1)?.closing_reserve_nzd ?? 0,
    warnings: [...warnings],
  };

  return [
    baselinePolicy("current_system", modelAssumptions.baselines, insurerYears),
    baselinePolicy("higher_bank_capital", modelAssumptions.baselines, insurerYears),
    nationalInsurance,
  ];
}

export function runAssumptionStress(modelAssumptions, scenarioName, designName) {
  const scenario = requireKey(modelAssumptions.scenarios, scenarioName);
  const design = requireKey(modelAssumptions.designs, designName);
  const years = Number(requireKey(modelAssumptions, "years"));
  const mortgageBookNzd = Number(requireKey(modelAssumptions, "mortgage_book_nzd"));
  const migrationRate = Number(requireKey(design, "annual_programme_migration_rate"));
  const bankAttachment = Number(requireKey(design, "bank_first_loss_rate"));
  const bucketTerms = requireKey(design, "bucket_terms");
  const funding = requireKey(design, "insurer_funding");
  const reinsurance = requireKey(design, "aggregate_reinsurance");

  let reserve = Number(requireKey(funding, "starting_reserve_nzd"));
  let crownDebt = 0;
  const bucketYears = [];
  const insurerYears = [];
  const warnings = [];

  for (let year = 1; year <= years; year += 1) {
    const annualMacro = scenarioForYear(scenario, year);
    const insuredExposure = programmeExposure(mortgageBookNzd, migrationRate, year);
    const openingReserve = reserve;
    const crownOpening = crownDebt;
    let premiums = 0;
    let bankFirstLoss = 0;
    let bankExcessLoss = 0;
    let grossClaims = 0;

    for (const bucket of modelAssumptions.lvr_buckets) {
      const bucketId = String(requireKey(bucket, "id"));
      const terms = requireKey(bucketTerms, bucketId);
      const exposure = insuredExposure * Number(requireKey(bucket, "exposure_share"));
      const lossRate = collateralLossRate(
        Number(requireKey(bucket, "starting_lvr")),
        annualMacro.house_price_fall,
        annualMacro.forced_sale_haircut,
      );
      const defaultRate = stressedDefaultRate(
        Number(requireKey(modelAssumptions, "base_default_rate")),
        annualMacro.unemployment_shock_pp,
        Number(requireKey(modelAssumptions, "unemployment_sensitivity")),
        annualMacro.mortgage_rate_shock_pp,
        Number(requireKey(modelAssumptions, "rate_sensitivity")),
        Number(requireKey(bucket, "risk_multiplier")),
      );
      const waterfall = loanLevelWaterfall(lossRate, bankAttachment, Number(requireKey(terms, "insured_layer_rate")));
      const premium = exposure * Number(requireKey(terms, "premium_rate"));
      const bucketBankFirst = exposure * defaultRate * waterfall.bankFirstLoss;
      const bucketClaim = exposure * defaultRate * waterfall.insurerClaim;
      const bucketBankExcess = exposure * defaultRate * waterfall.bankExcessLoss;

      premiums += premium;
      bankFirstLoss += bucketBankFirst;
      grossClaims += bucketClaim;
      bankExcessLoss += bucketBankExcess;
      bucketYears.push({
        year,
        bucket_id: bucketId,
        label: String(requireKey(bucket, "label")),
        exposure_nzd: exposure,
        starting_lvr: Number(requireKey(bucket, "starting_lvr")),
        default_rate: defaultRate,
        collateral_loss_rate: waterfall.collateralLoss,
        bank_first_loss_rate: waterfall.bankFirstLoss,
        insurer_claim_rate: waterfall.insurerClaim,
        bank_excess_loss_rate: waterfall.bankExcessLoss,
        premium_nzd: premium,
        bank_first_loss_nzd: bucketBankFirst,
        insurer_claim_nzd: bucketClaim,
        bank_excess_loss_nzd: bucketBankExcess,
      });
    }

    const recovery = aggregateReinsuranceRecovery(
      grossClaims,
      Number(requireKey(reinsurance, "attachment_nzd")),
      Number(requireKey(reinsurance, "limit_nzd")),
      Number(requireKey(reinsurance, "share")),
    );
    const netClaims = grossClaims - recovery;
    const operatingCost = Number(requireKey(funding, "annual_operating_cost_nzd"));
    const investmentIncome = Math.max(reserve, 0) * Number(requireKey(funding, "reserve_yield_rate"));
    const crownInterest = crownDebt * Number(requireKey(funding, "crown_facility_interest_rate"));
    const preFacilityReserve = reserve + premiums + investmentIncome - netClaims - operatingCost - crownInterest;
    const crownDraw = Math.max(0, -preFacilityReserve);
    reserve = Math.max(0, preFacilityReserve);
    crownDebt += crownDraw;

    const requiredCapital = insuredExposure * Number(requireKey(funding, "required_capital_rate"));
    const repaymentSurplus = Math.max(reserve - requiredCapital, 0);
    const crownRepayment = Math.min(crownDebt, repaymentSurplus * Number(requireKey(funding, "surplus_repayment_share")));
    reserve -= crownRepayment;
    crownDebt -= crownRepayment;

    insurerYears.push({
      year,
      insured_exposure_nzd: insuredExposure,
      premiums_nzd: premiums,
      operating_cost_nzd: operatingCost,
      investment_income_nzd: investmentIncome,
      gross_claims_nzd: grossClaims,
      reinsurance_recovery_nzd: recovery,
      net_claims_nzd: netClaims,
      opening_reserve_nzd: openingReserve,
      closing_reserve_nzd: reserve,
      crown_draw_nzd: crownDraw,
      crown_debt_opening_nzd: crownOpening,
      crown_interest_nzd: crownInterest,
      crown_repayment_nzd: crownRepayment,
      crown_debt_closing_nzd: crownDebt,
      bank_first_loss_nzd: bankFirstLoss,
      bank_excess_loss_nzd: bankExcessLoss,
    });
  }

  if (Number(requireKey(funding, "starting_reserve_nzd")) === 0) {
    warnings.push("zero_start_is_crown_contingent_liability_until_reserve_builds");
  }
  if (insurerYears.some((year) => year.crown_draw_nzd > 0)) {
    warnings.push("crown_liquidity_facility_used");
  }

  return {
    scenario: scenarioName,
    design: designName,
    years,
    bucket_years: bucketYears,
    insurer_years: insurerYears,
    comparison: buildPolicyComparison(modelAssumptions, designName, insurerYears, warnings),
    warnings,
  };
}

export function buildAssumptionsFromInputs(v) {
  const cloned = structuredClone(assumptions);
  const scenario = cloned.scenarios[v.scenarioName];
  const design = cloned.designs[v.designName];
  const funding = design.insurer_funding;
  const reinsurance = design.aggregate_reinsurance;

  cloned.mortgage_book_nzd = v.marketBn * NZD_PER_B;
  design.annual_programme_migration_rate = v.migrationPct / 100;
  design.bank_first_loss_rate = v.bankFirstLossPct / 100;
  funding.starting_reserve_nzd = v.initialReserveM * NZD_PER_M;
  funding.annual_operating_cost_nzd = v.operatingCostM * NZD_PER_M;
  funding.reserve_yield_rate = v.reserveYieldPct / 100;
  funding.crown_facility_interest_rate = v.crownInterestPct / 100;
  funding.required_capital_rate = v.requiredCapitalPct / 100;
  reinsurance.attachment_nzd = v.reinsuranceAttachmentM * NZD_PER_M;
  reinsurance.limit_nzd = v.reinsuranceLimitM * NZD_PER_M;
  reinsurance.share = v.reinsuranceSharePct / 100;
  scenario.crisis_start_year = v.crisisYear;
  scenario.crisis_duration_years = v.crisisYears;
  scenario.crisis.house_price_fall = v.housePriceFallPct / 100;
  scenario.crisis.unemployment_shock_pp = v.unemploymentShockPp;
  scenario.crisis.mortgage_rate_shock_pp = v.mortgageRateShockPp;
  scenario.crisis.forced_sale_haircut = v.forcedSaleHaircutPct / 100;

  for (const terms of Object.values(design.bucket_terms)) {
    terms.premium_rate *= v.premiumMultiplier;
  }

  return cloned;
}

export function makeInitialInputs(scenarioName = defaultScenario, designName = defaultDesign) {
  const scenario = assumptions.scenarios[scenarioName];
  const design = assumptions.designs[designName];
  const funding = design.insurer_funding;
  const reinsurance = design.aggregate_reinsurance;

  return {
    scenarioName,
    designName,
    marketBn: assumptions.mortgage_book_nzd / NZD_PER_B,
    migrationPct: design.annual_programme_migration_rate * 100,
    premiumMultiplier: 1,
    initialReserveM: funding.starting_reserve_nzd / NZD_PER_M,
    operatingCostM: funding.annual_operating_cost_nzd / NZD_PER_M,
    reserveYieldPct: funding.reserve_yield_rate * 100,
    crownInterestPct: funding.crown_facility_interest_rate * 100,
    requiredCapitalPct: funding.required_capital_rate * 100,
    crisisYear: scenario.crisis_start_year,
    crisisYears: scenario.crisis_duration_years,
    housePriceFallPct: scenario.crisis.house_price_fall * 100,
    unemploymentShockPp: scenario.crisis.unemployment_shock_pp,
    mortgageRateShockPp: scenario.crisis.mortgage_rate_shock_pp,
    forcedSaleHaircutPct: scenario.crisis.forced_sale_haircut * 100,
    bankFirstLossPct: design.bank_first_loss_rate * 100,
    reinsuranceAttachmentM: reinsurance.attachment_nzd / NZD_PER_M,
    reinsuranceLimitM: reinsurance.limit_nzd / NZD_PER_M,
    reinsuranceSharePct: reinsurance.share * 100,
  };
}

export const initial = makeInitialInputs();

export function calculateStress(v) {
  const modelAssumptions = buildAssumptionsFromInputs(v);
  const result = runAssumptionStress(modelAssumptions, v.scenarioName, v.designName);
  const nationalInsurance = result.comparison.find((row) => row.policy.startsWith("national_insurance:"));
  const currentSystem = result.comparison.find((row) => row.policy === "current_system");

  return {
    engineResult: result,
    rows: result.insurer_years.map((year) => ({
      year: year.year,
      pool: year.insured_exposure_nzd / NZD_PER_B,
      premium: year.premiums_nzd / NZD_PER_M,
      grossCollateralLoss: (year.bank_first_loss_nzd + year.gross_claims_nzd + year.bank_excess_loss_nzd) / NZD_PER_M,
      bankFirstLoss: year.bank_first_loss_nzd / NZD_PER_M,
      bankExcessLoss: year.bank_excess_loss_nzd / NZD_PER_M,
      insurerGrossClaims: year.gross_claims_nzd / NZD_PER_M,
      reinsurance: year.reinsurance_recovery_nzd / NZD_PER_M,
      insurerNetClaims: year.net_claims_nzd / NZD_PER_M,
      reserve: year.closing_reserve_nzd / NZD_PER_M,
      crownDraw: year.crown_draw_nzd / NZD_PER_M,
      crownDebt: year.crown_debt_closing_nzd / NZD_PER_M,
      isCrisis: v.crisisYear <= year.year && year.year < v.crisisYear + v.crisisYears,
    })),
    reserve: (nationalInsurance?.reserve_after_10y_nzd ?? 0) / NZD_PER_M,
    crownDraw: result.insurer_years.reduce((sum, year) => sum + year.crown_draw_nzd, 0) / NZD_PER_M,
    crownDebtRemaining: (nationalInsurance?.crown_debt_remaining_nzd ?? 0) / NZD_PER_M,
    totalPremium: (nationalInsurance?.total_premiums_nzd ?? 0) / NZD_PER_M,
    totalInsurerClaims: (nationalInsurance?.total_insurer_claims_nzd ?? 0) / NZD_PER_M,
    totalBankFirstLoss: result.insurer_years.reduce((sum, year) => sum + year.bank_first_loss_nzd, 0) / NZD_PER_M,
    totalBankExcessLoss: result.insurer_years.reduce((sum, year) => sum + year.bank_excess_loss_nzd, 0) / NZD_PER_M,
    totalReinsurance: (nationalInsurance?.total_reinsurance_recovery_nzd ?? 0) / NZD_PER_M,
    currentSystemPeakBankHit: (currentSystem?.peak_bank_capital_hit_nzd ?? 0) / NZD_PER_M,
    higherCapitalBuffer: modelAssumptions.baselines.higher_bank_capital.extra_bank_capital_buffer_nzd / NZD_PER_M,
  };
}
