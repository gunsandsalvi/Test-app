import { random } from '../../../rng';
import { ensureV2, rowOf, revHistPush } from '../../../../engine2/world';
import { managedEntityIdsOf } from '../../../../domain/company';
import { openInsuranceBook, corporateInsurableBaseLocal, householdInsurableBaseLocal } from '../../../../domain/institutions';
import { isActiveCompany } from '../../../../domain/company';
import { ProfileInput, ProfilePnl } from './types';
import { institutionTotalAssetsLocal } from '../institutional-balance-sheet';

/** 31b's — the seed's loss ratio, the one number the stochastic claims still draw around. */
const SEED_LOSS_RATIO = 0.70;
const LOSS_NOISE = 0.20;

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

  // §3.16b-i — WHAT AN INSURER WRITES IS ITS BOOK AT ITS PRICE. The book is the cover it carries
  // (opened the first week at what the seed stated: the region's cover split by capital, at the
  // one rate its insurers' capital let them write — `openInsuranceBook`), the price is the rate it
  // quoted last week off its own losses and its own capital (`insurance-and-pensions.ts`), and
  // the claims are its OWN book's: cover × its own loss experience, drawn around — claims are
  // stochastic because claims ARE stochastic, that is the business. The premium a capital ratio
  // let it write is gone as a sizing; capital caps what it can carry (16b-ii), it does not price.
  if (instEnt && !instEnt.insurance) {
    const region = comp.region;
    const operating = input.ctx.updatedCompanies.filter((c) => c.region === region && isActiveCompany(c) && !c.isBankEntity && !c.isInstitutionalEntity);
    const regionBaseLocal = operating.reduce((a, c) => a + corporateInsurableBaseLocal(c, input.ctx.nextWeek), 0)
      + householdInsurableBaseLocal(input.reg.householdState?.netWorthLocal ?? 0, input.reg.estimatedHouseholdIncomeLocal ?? 0);
    let regionSurplusLocal = 0;
    entityById.forEach((e) => { if (e.region === region && e.entityType === 'INSURER' && !e.isDefaulted) regionSurplusLocal += Math.max(0, e.equityCapitalLocal); });
    instEnt.insurance = openInsuranceBook({ regionBaseLocal, ownSurplusLocal: instEnt.equityCapitalLocal, regionSurplusLocal, seedLossRatio: SEED_LOSS_RATIO });
  }
  const book = instEnt?.insurance;
  const weeklyPremiums = book ? Math.max(10, (book.coverLocal * book.rateAnnual) / 52) : Math.max(10, comp.annualRevenue / 52);
  comp.insurancePremiumsWrittenLocal = weeklyPremiums * 52;
  const lossDraw = (SEED_LOSS_RATIO + (random() - 0.5) * LOSS_NOISE) / SEED_LOSS_RATIO;
  comp.insuranceClaimsPaidLocal = book
    ? book.coverLocal * book.lossPerCoverAnnual * lossDraw
    : weeklyPremiums * 52 * SEED_LOSS_RATIO * lossDraw;

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
