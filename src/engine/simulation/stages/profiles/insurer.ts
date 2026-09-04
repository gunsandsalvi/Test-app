import { random } from '../../../rng';
import { ensureV2, rowOf, revHistPush } from '../../../../engine2/world';
import { managedEntityIdsOf } from '../../../../domain/company';
import { PREMIUM_TO_SURPLUS_RATIO } from '../../../../domain/institutions';
import { ProfileInput, ProfilePnl } from './types';
import { institutionTotalAssetsLocal } from '../institutional-balance-sheet';

export const insurerProfile: (input: ProfileInput) => ProfilePnl = (input) => {
  const { comp, entityById } = input;

  // HH1b — ONE INSURER, NOT TWO. This branch used to refuse the entity behind it, on the
  // reasoning that `institutionTotalAssetsLocal(input.ctx, instEnt)` was "a macro-level slice meant for
  // portfolio-composition bookkeeping, not a per-firm P&L input". That was true when it was
  // written and stopped being true at S11, which made `totalAssetsLocal` a real per-firm book
  // recomputed weekly from real cash and real holdings — the ASSET_MANAGER branch below reads
  // it and says so. The refusal outlived its reason, and what it produced was a second insurer:
  // a shell reporting 0.05B of revenue and 0.10B of market cap beside an entity holding 241.4B,
  // with `technicalReservesLocal` printing 0.2B against a 221.9B beneficiary liability — the
  // same obligations represented twice, three orders of magnitude apart (§7.49).
  const instEnt = entityById.get(managedEntityIdsOf(comp)[0]);
  const floatAssets = instEnt ? institutionTotalAssetsLocal(input.ctx, instEnt) : comp.annualRevenue * 5;
  // The reserves ARE the beneficiary liability HH1a records on the entity. One number.
  comp.technicalReservesLocal = instEnt?.beneficiaryLiabilityLocal ?? floatAssets * 0.85;

  // What an insurer writes is limited by its CAPITAL, not by what it wrote last week: the
  // premium-to-surplus ratio is the real constraint every regulator supervises, and reading
  // it off real equity replaces a self-referential premium that grew from its own prior value
  // at GDP plus a random draw, anchored to nothing.
  const surplusLocal = instEnt ? Math.max(0, instEnt.equityCapitalLocal) : comp.annualRevenue;
  const weeklyPremiums = Math.max(10, (surplusLocal * PREMIUM_TO_SURPLUS_RATIO) / 52);
  comp.insurancePremiumsWrittenLocal = weeklyPremiums * 52;

  // Claims stay stochastic because claims ARE stochastic — that is the business.
  const lossRatio = 0.70 + (random() - 0.5) * 0.20;
  comp.insuranceClaimsPaidLocal = weeklyPremiums * lossRatio * 52;

  // IND-R4: `INSURER_EXPENSE_RATIO = 0.20` is gone. It was every insurer's operating cost as a
  // flat share of premiums, so no insurer could be run better than another — and it was
  // double-counting besides, because the expenses it stood for ARE this firm's staff and
  // premises, which the caller now charges from the real wage bill and the real input basket.
  // What remains here is what only an insurer has: the claims it pays.
  // The income its OWN portfolio actually earned this week, recorded by
  // `accrueInstitutionalIncome` when it credited the cash — not a second yield assumption
  // applied to a different asset base.
  const investmentIncome = instEnt?.lastWeeklyInvestmentIncomeLocal ?? floatAssets * 0.04 / 52;

  const newRevenue = comp.insurancePremiumsWrittenLocal;
  { const v2r = ensureV2(input.state); revHistPush(v2r, rowOf(v2r, comp.id), newRevenue); }

  return {
    newRevenue,
    profileCostsAnnualLocal: comp.insuranceClaimsPaidLocal,
    otherIncomeAnnualLocal: investmentIncome * 52,
  };
};
