/** An asset manager's P&L: fees on the book its entity actually marks (moved verbatim from stage 08, BP1c). */

import { random } from '../../../rng';

import { ProfileInput, ProfilePnl } from './types';

export const assetManagerProfile: (input: ProfileInput) => ProfilePnl = (input) => {
  const { comp, reg, state, ctx, entityById, annualInterest, taxRate, perShare,
    payrollAboveBaselineAnnualUSD } = input;
  let newRevenue = 0, newEbitdaMargin = 0, newEbitda = 0, newEbit = 0, newNetIncome = 0, newEps = 0;

  const instEnt = entityById.get(comp.id);
  // One balance sheet, one representation (S11): where a real InstitutionalEntity backs this
  // company, its AUM IS that entity's marked book — totalAssetsUSD is recomputed weekly from
  // real cash and real holdings (institutional-balance-sheet.ts), so the drift-by-index
  // formula only survives for manager companies with no entity behind them.
  const equityIndex = comp.region === 'USA' ? state.compositeIndices.us500 : comp.region === 'EUR' ? state.compositeIndices.euStoxx : comp.region === 'UK' ? state.compositeIndices.uk100 : state.compositeIndices.jp225;
  const marketGrowth = equityIndex.value / Math.max(1, equityIndex.historical[equityIndex.historical.length - 2] ?? equityIndex.value);
  const flows = (random() - 0.4) * 0.01;
  comp.aumUSD = instEnt
    ? instEnt.totalAssetsUSD
    : (comp.aumUSD ?? comp.annualRevenue * 50) * marketGrowth * (1 + flows);
  comp.managementFeeRate = comp.managementFeeRate ?? (0.005 + random() * 0.005);

  const weeklyFees = comp.aumUSD * comp.managementFeeRate / 52;
  newRevenue = Math.max(10, weeklyFees * 52);
  comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];
  newEbitdaMargin = 0.35;
  // IND-R1: its staff, at the deviation from the baseline the stated margin already carries.
  newEbitda = newRevenue * newEbitdaMargin - payrollAboveBaselineAnnualUSD;
  newEbit = Math.max(1, newEbitda);
  newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
  newEps = perShare(newNetIncome);

  return { newRevenue, newEbitdaMargin, newEbitda, newEbit, newNetIncome, newEps };
};
