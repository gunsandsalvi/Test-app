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

import { ProfileInput, ProfilePnl } from './types';
import { bankSovereignBookLocal } from '../../../sovereign-register';
import { ensureV2, rowOf, revHistPush } from '../../../../engine2/world';
import { loanBooksOf } from '../../../../domain/banking';
import { facilityBookOf } from '../../../../engine2/tranches';

export const bankProfile: (input: ProfileInput) => ProfilePnl = (input) => {
  const { comp, reg } = input;

  const own = comp.bankBalanceSheet;
  const bs = own ?? reg.bankingSector;
  // §3.13-BOOK d3b: the bank's own book is its register rows; a bank with no sheet holds none.
  const sovLocal = own ? bankSovereignBookLocal(ensureV2(input.state), comp.id) : 0;
  // §5-WIRES D: the credit books are the sheet's rows; a bank with no sheet holds no rows.
  const creditBookLocal = own ? loanBooksOf(own, facilityBookOf(ensureV2(input.state), comp.id)) : 0;
  const totalAssets = creditBookLocal + sovLocal;
  const weeklyNim = bs.netInterestMarginPct / 52;
  const impliedNimRev = totalAssets * weeklyNim;
  // IND-R4: the bank's OWN measured loss experience. `loanLossProvisionRateAnnualPct` is what
  // bank-lending.ts computed from this bank's real borrowers at their real default
  // probabilities, and 02b writes it onto the sheet every week.
  //
  // What it replaces: `random() * 0.05 * totalAssets / 52` — a random draw, on a denominator
  // that includes SOVEREIGN BONDS, which carry no credit loss. Five per cent of total assets a
  // year is a rate no bank survives, and it drove every bank's EBITDA deeply negative from week
  // 1: measured, all four USA banks tripped the labor market's cost-of-capital test in their
  // first week and shed their entire workforce to the one-employee floor by week 3 (§7.108).
  // Credit loss belongs to the books that carry credit, at the rate this bank actually
  // experienced. (Removing the `random()` draw relabels the RNG stream — declared.)
  const loanLosses = (creditBookLocal * (bs.loanLossProvisionRateAnnualPct)) / 52;
  // Smooth against last week's OWN revenue for noise damping (85/15, same order as other
  // week-to-week smoothing in this file) rather than a 98/2 blend anchored on this
  // company's original generation-time seed — that seed comes from the same small-scale
  // Pareto firm curve every company uses and has no relation to the region's actual
  // banking-sector balance sheet, so anchoring on it made bank revenue climb for years
  // before converging on its true (much larger) NIM-implied scale, blowing through the
  // revenue-growth-ceiling invariant on the way.
  const newRevenue = Math.max(10, comp.annualRevenue * 0.85 + (impliedNimRev * 52) * 0.15);
  { const v2r = ensureV2(input.state); revHistPush(v2r, rowOf(v2r, comp.id), newRevenue); }

  // §7.122 step 3 — IND-R4's last stated margin is gone. It was `newEbitdaMargin = 0.40`,
  // a number a bank earned regardless of what its book made or what its staff and premises cost.
  // A bank's cost base is credit losses (below, its own measured experience), its people
  // (payroll, common) and its premises and technology (its profile input basket, common). All
  // three are real now, so the margin is what is left — an outcome, like every other firm's.
  return { newRevenue, profileCostsAnnualLocal: loanLosses * 52 };
};
