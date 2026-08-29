/**
 * A bank's P&L, off its OWN balance sheet.
 *
 * OWN5: it used to be the REGION's banking aggregate scaled by `bankMarketShare` — the sector's
 * loan book, sovereign holdings and NIM, times a share fixed at seed. A bank whose own book had
 * grown or shrunk earned the sector's average anyway, and the one thing this stage is supposed
 * to distinguish (which bank is doing well) could not vary except through that constant.
 * Every input below is now on `comp.bankBalanceSheet`, which 02b evolves per bank from real
 * flows; the aggregate is only the fallback for a bank that somehow carries no sheet.
 */

import { random } from '../../../rng';

import { ProfileInput, ProfilePnl } from './types';

export const bankProfile: (input: ProfileInput) => ProfilePnl = (input) => {
  const { comp, reg, state, ctx, entityById, annualInterest, taxRate, perShare } = input;
  let newRevenue = 0, newEbitdaMargin = 0, newEbitda = 0, newEbit = 0, newNetIncome = 0, newEps = 0;

  const share = comp.bankMarketShare ?? 0.25;
  const own = comp.bankBalanceSheet;
  const bs = own ?? reg.bankingSector;
  const sovUSD = own
    ? Object.values(own.sovereignBondHoldingsByTenor || {}).reduce((a, v) => a + (Number(v) || 0), 0)
    : reg.bankingSector.sovereignBondHoldingsUSD * share;
  const totalAssets = own
    ? own.businessLoanBookUSD + own.consumerLoanBookUSD + sovUSD
    : (bs.businessLoanBookUSD + bs.consumerLoanBookUSD) * share + sovUSD;
  const weeklyNim = bs.netInterestMarginPct / 52;
  const impliedNimRev = totalAssets * weeklyNim;
  const loanLosses = random() * 0.05 * totalAssets / 52;
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
