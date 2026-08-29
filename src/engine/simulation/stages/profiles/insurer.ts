/** An insurer's P&L: premiums limited by capital, claims stochastic, investment income its own portfolio's (moved verbatim from stage 08, BP1c). */

import { random } from '../../../rng';
import { PREMIUM_TO_SURPLUS_RATIO, INSURER_EXPENSE_RATIO } from '../../../../domain/institutions';
import { ProfileInput, ProfilePnl } from './types';

export const insurerProfile: (input: ProfileInput) => ProfilePnl = (input) => {
  const { comp, reg, state, ctx, entityById, annualInterest, taxRate, perShare } = input;
  let newRevenue = 0, newEbitdaMargin = 0, newEbitda = 0, newEbit = 0, newNetIncome = 0, newEps = 0;

  // HH1b — ONE INSURER, NOT TWO. This branch used to refuse the entity behind it, on the
  // reasoning that `instEnt.totalAssetsUSD` was "a macro-level slice meant for
  // portfolio-composition bookkeeping, not a per-firm P&L input". That was true when it was
  // written and stopped being true at S11, which made `totalAssetsUSD` a real per-firm book
  // recomputed weekly from real cash and real holdings — the ASSET_MANAGER branch below reads
  // it and says so. The refusal outlived its reason, and what it produced was a second insurer:
  // a shell reporting 0.05B of revenue and 0.10B of market cap beside an entity holding 241.4B,
  // with `technicalReservesUSD` printing 0.2B against a 221.9B beneficiary liability — the
  // same obligations represented twice, three orders of magnitude apart (§7.49).
  const instEnt = entityById.get(comp.id);
  const floatAssets = instEnt ? instEnt.totalAssetsUSD : comp.annualRevenue * 5;
  // The reserves ARE the beneficiary liability HH1a records on the entity. One number.
  comp.technicalReservesUSD = instEnt?.beneficiaryLiabilityUSD ?? floatAssets * 0.85;

  // What an insurer writes is limited by its CAPITAL, not by what it wrote last week: the
  // premium-to-surplus ratio is the real constraint every regulator supervises, and reading
  // it off real equity replaces a self-referential premium that grew from its own prior value
  // at GDP plus a random draw, anchored to nothing.
  const surplusUSD = instEnt ? Math.max(0, instEnt.equityCapitalUSD) : comp.annualRevenue;
  const weeklyPremiums = Math.max(10, (surplusUSD * PREMIUM_TO_SURPLUS_RATIO) / 52);
  comp.insurancePremiumsWrittenUSD = weeklyPremiums * 52;

  // Claims stay stochastic because claims ARE stochastic — that is the business.
  const lossRatio = 0.70 + (random() - 0.5) * 0.20;
  comp.insuranceClaimsPaidUSD = weeklyPremiums * lossRatio * 52;

  const underwritingIncome = weeklyPremiums * (1 - lossRatio - INSURER_EXPENSE_RATIO);
  // The income its OWN portfolio actually earned this week, recorded by
  // `accrueInstitutionalIncome` when it credited the cash — not a second yield assumption
  // applied to a different asset base.
  const investmentIncome = instEnt?.lastWeeklyInvestmentIncomeUSD ?? floatAssets * 0.04 / 52;

  newRevenue = comp.insurancePremiumsWrittenUSD;
  comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];
  newEbitdaMargin = 0.15;
  newEbitda = (underwritingIncome + investmentIncome) * 52;
  newEbit = Math.max(1, newEbitda);
  newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
  newEps = perShare(newNetIncome);

  return { newRevenue, newEbitdaMargin, newEbitda, newEbit, newNetIncome, newEps };
};
