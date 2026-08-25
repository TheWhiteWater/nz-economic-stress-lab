export type Inputs = {
  market: number;
  migration: number;
  premium: number;
  normalLoss: number;
  investmentYield: number;
  operatingCost: number;
  reinsuranceCost: number;
  initialCapital: number;
  crisisYear: number;
  crisisYears: number;
  crisisLoss: number;
  bankFirstLoss: number;
  reinsuranceShare: number;
};

export type AnnualRow = {
  year: number;
  pool: number;
  premium: number;
  reinsurancePremium: number;
  grossCollateralLoss: number;
  bankFirstLoss: number;
  bankExcessLoss: number;
  insurerGrossClaims: number;
  reinsurance: number;
  insurerNetClaims: number;
  reserve: number;
  crownDraw: number;
  crownDebt: number;
  isCrisis: boolean;
};

export type ModelResult = {
  rows: AnnualRow[];
  reserve: number;
  crownDraw: number;
  crownDebtRemaining: number;
  totalPremium: number;
  totalInsurerClaims: number;
  totalBankFirstLoss: number;
  totalBankExcessLoss: number;
  totalReinsurance: number;
  currentSystemPeakBankHit: number;
  higherCapitalBuffer: number;
};

export const initial: Inputs = {
  market: 400,
  migration: 10,
  premium: 0.2025,
  normalLoss: 0.02,
  investmentYield: 4.5,
  operatingCost: 8,
  reinsuranceCost: 0.025,
  initialCapital: 300,
  crisisYear: 5,
  crisisYears: 1,
  crisisLoss: 2,
  bankFirstLoss: 25,
  reinsuranceShare: 50,
};

const LVR_BUCKETS = [
  { id: "lvr_le_60", share: 0.42, insuredLayerShare: 0.10, pdMultiplier: 0.45 },
  { id: "lvr_60_70", share: 0.22, insuredLayerShare: 0.20, pdMultiplier: 0.75 },
  { id: "lvr_70_80", share: 0.24, insuredLayerShare: 0.35, pdMultiplier: 1.25 },
  { id: "lvr_gt_80", share: 0.12, insuredLayerShare: 0.55, pdMultiplier: 2.25 },
] as const;

const BASE_DEFAULT_RATE = 0.003;
const HIGHER_BANK_CAPITAL_BUFFER_M = 8_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loanWaterfall(collateralLoss: number, bankAttachment: number, insuredLayer: number) {
  const bankFirstLoss = Math.min(collateralLoss, bankAttachment);
  const insurerClaim = Math.min(Math.max(collateralLoss - bankAttachment, 0), insuredLayer);
  const bankExcessLoss = Math.max(collateralLoss - bankAttachment - insuredLayer, 0);

  return { bankFirstLoss, insurerClaim, bankExcessLoss };
}

function aggregateReinsurance(grossClaimsM: number, share: number) {
  const attachmentM = 1_000;
  const limitM = 3_000;
  const coveredBand = Math.min(Math.max(grossClaimsM - attachmentM, 0), limitM);

  return coveredBand * share;
}

export function calculateStress(v: Inputs): ModelResult {
  let reserve = v.initialCapital;
  let crownDebt = 0;
  let totalPremium = 0;
  let totalInsurerClaims = 0;
  let totalBankFirstLoss = 0;
  let totalBankExcessLoss = 0;
  let totalReinsurance = 0;
  let currentSystemPeakBankHit = 0;
  const rows: AnnualRow[] = [];

  for (let year = 1; year <= 10; year += 1) {
    const pool = Math.min(v.market, v.market * (v.migration / 100) * year);
    const isCrisis = year >= v.crisisYear && year < v.crisisYear + v.crisisYears;
    const grossLossRate = (isCrisis ? v.crisisLoss : v.normalLoss) / 100;
    const premium = pool * 1000 * (v.premium / 100);
    const reinsurancePremium = pool * 1000 * (v.reinsuranceCost / 100);
    const investment = Math.max(0, reserve) * (v.investmentYield / 100);
    const bankAttachment = v.bankFirstLoss / 100;
    const aggregateReinsuranceShare = v.reinsuranceShare / 100;

    let bankFirstLoss = 0;
    let bankExcessLoss = 0;
    let insurerGrossClaims = 0;
    let grossCollateralLoss = 0;

    for (const bucket of LVR_BUCKETS) {
      const exposure = pool * 1000 * bucket.share;
      const defaultRate = clamp(BASE_DEFAULT_RATE * bucket.pdMultiplier * (isCrisis ? 4 : 1), 0, 1);
      const collateralLoss = exposure * defaultRate * grossLossRate;
      const waterfall = loanWaterfall(
        grossLossRate,
        bankAttachment,
        grossLossRate * bucket.insuredLayerShare,
      );

      grossCollateralLoss += collateralLoss;
      bankFirstLoss += exposure * defaultRate * waterfall.bankFirstLoss;
      insurerGrossClaims += exposure * defaultRate * waterfall.insurerClaim;
      bankExcessLoss += exposure * defaultRate * waterfall.bankExcessLoss;
    }

    const reinsurance = aggregateReinsurance(insurerGrossClaims, aggregateReinsuranceShare);
    const insurerNetClaims = insurerGrossClaims - reinsurance;
    const crownInterest = crownDebt * 0.04;
    let closingReserve =
      reserve +
      premium +
      investment -
      insurerNetClaims -
      reinsurancePremium -
      v.operatingCost -
      crownInterest;
    const crownDraw = Math.max(0, -closingReserve);

    if (crownDraw > 0) {
      crownDebt += crownDraw;
      closingReserve = 0;
    }

    const crownRepayment = Math.min(crownDebt, Math.max(0, closingReserve) * 0.35);
    crownDebt -= crownRepayment;
    reserve = closingReserve - crownRepayment;

    const currentSystemBankHit = bankFirstLoss + insurerGrossClaims + bankExcessLoss;
    currentSystemPeakBankHit = Math.max(currentSystemPeakBankHit, currentSystemBankHit);
    totalPremium += premium;
    totalInsurerClaims += insurerGrossClaims;
    totalBankFirstLoss += bankFirstLoss;
    totalBankExcessLoss += bankExcessLoss;
    totalReinsurance += reinsurance;

    rows.push({
      year,
      pool,
      premium,
      reinsurancePremium,
      grossCollateralLoss,
      bankFirstLoss,
      bankExcessLoss,
      insurerGrossClaims,
      reinsurance,
      insurerNetClaims,
      reserve,
      crownDraw,
      crownDebt,
      isCrisis,
    });
  }

  return {
    rows,
    reserve,
    crownDraw: rows.reduce((sum, row) => sum + row.crownDraw, 0),
    crownDebtRemaining: crownDebt,
    totalPremium,
    totalInsurerClaims,
    totalBankFirstLoss,
    totalBankExcessLoss,
    totalReinsurance,
    currentSystemPeakBankHit,
    higherCapitalBuffer: HIGHER_BANK_CAPITAL_BUFFER_M,
  };
}

