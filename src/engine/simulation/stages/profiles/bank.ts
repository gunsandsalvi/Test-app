/** A bank's P&L: the region's banking sector scaled to this bank's own market share (moved verbatim from stage 08, BP1c). */

import { random } from '../../../rng';

import { ProfileInput, ProfilePnl } from './types';

export const bankProfile: (input: ProfileInput) => ProfilePnl = (input) => {
  const { comp, reg, state, ctx, entityById, annualInterest, taxRate, perShare } = input;
  let newRevenue = 0, newEbitdaMargin = 0, newEbitda = 0, newEbit = 0, newNetIncome = 0, newEps = 0;

  const bs = reg.bankingSector;
  const share = comp.bankMarketShare ?? 0.25;
  const totalAssets = bs.businessLoanBookUSD + bs.consumerLoanBookUSD + bs.sovereignBondHoldingsUSD;
  const weeklyNim = bs.netInterestMarginPct / 52;
  const impliedNimRev = totalAssets * weeklyNim * share;
  const loanLosses = random() * 0.05 * totalAssets * share / 52;
  // Smooth against last week's OWN revenue for noise damping (85/15, same order as other
  // week-to-week smoothing in this file) rather than a 98/2 blend anchored on this
  // company's original generation-time seed — that seed comes from the same small-scale
  // Pareto firm curve every company uses and has no relation to the region's actual
  // banking-sector balance sheet, so anchoring on it made bank revenue climb for years
  // before converging on its true (much larger) NIM-implied scale, blowing through the
  // revenue-growth-ceiling invariant on the way.
  newRevenue = Math.max(10, comp.annualRevenue * 0.85 + (impliedNimRev * 52) * 0.15);
  newEbitdaMargin = 0.40;
  newEbitda = newRevenue * newEbitdaMargin - (loanLosses * 52);
  newEbit = Math.max(1, newEbitda);
  newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
  newEps = perShare(newNetIncome);
  comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];

  return { newRevenue, newEbitdaMargin, newEbitda, newEbit, newNetIncome, newEps };
};
