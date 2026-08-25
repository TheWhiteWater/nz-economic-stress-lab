// Runtime formulas live in economic-model-core.mjs so the browser and Node
// parity tests import the same implementation without a TypeScript runner.
// @ts-expect-error TypeScript has no declaration file for the local MJS module.
import { applySnapshotToInputs, calculateStress, initial, rbnzSnapshot } from "./economic-model-core.mjs";

export type Inputs = {
  sourceMode: string;
  sourceNote: string;
  scenarioName: string;
  designName: string;
  marketBn: number;
  migrationPct: number;
  premiumMultiplier: number;
  initialReserveM: number;
  operatingCostM: number;
  reserveYieldPct: number;
  crownInterestPct: number;
  requiredCapitalPct: number;
  crisisYear: number;
  crisisYears: number;
  housePriceFallPct: number;
  unemploymentShockPp: number;
  mortgageRateShockPp: number;
  forcedSaleHaircutPct: number;
  bankFirstLossPct: number;
  reinsuranceAttachmentM: number;
  reinsuranceLimitM: number;
  reinsuranceSharePct: number;
};

export { applySnapshotToInputs, calculateStress, initial, rbnzSnapshot };
