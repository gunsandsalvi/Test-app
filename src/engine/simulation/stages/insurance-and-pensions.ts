/**
 * HH1c — the liability FLOWS. Somebody pays the premiums, somebody receives the claims, somebody
 * contributes to the pensions and somebody draws them.
 *
 * HH1a gave the institutions' liabilities a holder. But the flows that build and drain those
 * liabilities were still one-sided: insurers wrote **48.0B of premiums a year that nobody paid**
 * and settled **37.3B of claims that nobody received**, and pension funds held 136.9B contributed
 * by nobody. An insurer's income statement described a business no counterparty was in.
 *
 * Runs after stage 08, so companies' financials are final and the insurers' own P&L for the week
 * is struck; it moves the cash that P&L implies. Every leg nets:
 *
 *   companies + households pay premiums  →  insurers receive them
 *   insurers pay claims                  →  companies + households receive them
 *   insurers pay their operating costs   →  households receive them as wages
 *   households contribute                →  pension funds receive it
 *   pension funds pay benefits           →  households receive them
 *
 * **Who pays what is derived, not assigned.** The premium pool splits between the two sectors by
 * their real INSURABLE BASE — a company's plant and its revenue, a household's net worth and its
 * income — so the commercial/personal split is an outcome of what each sector has to lose rather
 * than a number chosen to look right. Within the corporate sector each firm pays its own share of
 * that base.
 *
 * **What this does NOT yet do:** claims are allocated in proportion to premiums, which is right in
 * aggregate and wrong in the way that matters most — real claims are LUMPY, and the whole economic
 * point of insurance is that the loss lands on one firm and the pool absorbs it. Making a claim a
 * real event against a real loss needs a loss model (G5's estates and the weather anomalies are the
 * natural hooks). Until then this stage moves real money on a real schedule but does not yet
 * transfer real risk.
 */

import { GameState, Company } from '../../../types';
import { WeeklyStepContext } from './context';
import { pay } from './settlement';
import { isActiveCompany } from '../../../domain/company';
import { remainingLifeExpectancyYears, RETIREMENT_AGE_YEARS } from '../../bootstrap/population';
import { REGION_IDS, currencyOf } from '../../../domain/geography';

/**
 * RULE 19 — `PENSION_CONTRIBUTION_RATE = 0.09` is GONE (COH2). Its own comment carried the exit
 * condition — *"it becomes an outcome in HH4, where cohorts have ages and a contribution is
 * something a working cohort does"* and DEM's age structure met it.
 *
 * A contribution is not a share of income a country sets; it is the LIFE-CYCLE half of the saving
 * a household already decides to do. The cohort build has computed exactly that number since
 * `disposable x the retired share of the population`, the rate at which the working
 * population must set aside income to support the population that is not working — and it was
 * being accumulated into the household's own liquid stock while a flat 9% of the sector's income
 * went into the pension funds beside it. **Two representations of one motive** (rule 4), and the
 * stated one was the larger.
 *
 * The stage now collects the measured flow. A cohort squeezed out of saving contributes nothing,
 * which is what a contribution holiday is; an ageing population contributes more, because the
 * retired share IS the rate.
 */
/**
 * RULE 19 — `PENSION_BENEFIT_RATE_ANNUAL = 0.05` is GONE. It asserted a twenty-year
 * retirement as a flat drawdown rate and could not respond to an ageing population. The rate is
 * now `1 / remainingLifeExpectancyYears(RETIREMENT_AGE_YEARS)` — derived from the hazard.
 */

/** What a firm has to lose, and therefore insures: its plant and the revenue that runs through it. */
const corporateInsurableBaseUSD = (c: Company) => Math.max(0, c.grossPPELocal ?? 0) + Math.max(0, c.annualRevenue);

export function runInsuranceAndPensionsStage(state: GameState, ctx: WeeklyStepContext): void {
  // This stage moved every one of its flows by DIRECT balance mutation — `comp.cash`,
  // entity `cashLocal`, household deposits — with zero payment instructions in the file, so no bank
  // ever saw the deposits move and 02b's reconcile invented the reserves behind them. Every leg
  // below is now a `pay` instruction settled by the close pass, exactly like every other
  // post-08 flow. The two liability-STOCK updates (beneficiaryLiabilityUSD and the two annual
  // stat annotations) are not money movements and stay.
  const underwritingByEntityId = new Map<string, number>();
  const benefitsByEntityId = new Map<string, number>();

  REGION_IDS.forEach((region) => {
    const reg = ctx.updatedRegions[region];
    const hs = reg?.householdState;
    if (!hs) return;

    // ---- The week's premium pool, from the insurers' own already-struck P&L. ----
    const insurers = ctx.updatedCompanies.filter(
      (c) => c.region === region && c.institutionalEntityType === 'INSURER' && isActiveCompany(c)
    );
    const weeklyPremiumsUSD = insurers.reduce((a, c) => a + (c.insurancePremiumsWrittenUSD ?? 0) / 52, 0);
    const weeklyClaimsUSD = insurers.reduce((a, c) => a + (c.insuranceClaimsPaidUSD ?? 0) / 52, 0);
    // IND19/IND-R4 — THE EXPENSE RATIO IS GONE, AND ITS ABSENCE HERE IS THE POINT.
    //
    // This line used to subtract `premiums x INSURER_EXPENSE_RATIO`, and its own comment gave the
    // reason: "the P&L already charges an expense ratio against premiums". deleted that
    // charge — an insurer's operating cost is now its REAL wage bill and its real input basket,
    // charged by the profile caller like every other firm's — and this cash leg was left behind.
    // So the same expense was taken twice: once as real staff and premises, once as a flat fifth
    // of premiums (rule 4). What an insurer spends running itself leaves through the payments
    // that actually pay for it.

    // ---- Split the pool by what each sector has to lose. ----
    const operating = ctx.updatedCompanies.filter(
      (c) => c.region === region && isActiveCompany(c) && !c.isBankEntity && !c.isInstitutionalEntity
    );
    const corporateBaseUSD = operating.reduce((a, c) => a + corporateInsurableBaseUSD(c), 0);
    const householdBaseUSD = Math.max(0, hs.netWorthUSD) + Math.max(0, reg.estimatedHouseholdIncomeUSD);
    const totalBaseUSD = corporateBaseUSD + householdBaseUSD;
    if (!(totalBaseUSD > 0) || !(weeklyPremiumsUSD > 0)) return;

    const corporateShare = corporateBaseUSD / totalBaseUSD;
    const corporatePremiumsUSD = weeklyPremiumsUSD * corporateShare;
    const householdPremiumsUSD = weeklyPremiumsUSD - corporatePremiumsUSD;
    const claimRecoveryRate = weeklyPremiumsUSD > 0 ? weeklyClaimsUSD / weeklyPremiumsUSD : 0;

    // ---- The insurers that carry the pool, pro-rata by their capital. ----
    const insurerEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === region && e.entityType === 'INSURER' && !e.isDefaulted
    );
    const insurerCapitalUSD = insurerEntities.reduce((a, e) => a + Math.max(0, e.equityCapitalUSD), 0) || 1;
    const insurerShares = insurerEntities.map((e) => ({
      id: e.id, share: Math.max(0, e.equityCapitalUSD) / insurerCapitalUSD,
    }));
    if (insurerShares.length === 0) return;

    // ---- Companies: a real operating expense, and the claims that come back against it. ----
    operating.forEach((comp) => {
      const share = corporateInsurableBaseUSD(comp) / Math.max(1, corporateBaseUSD);
      const premiumUSD = corporatePremiumsUSD * share;
      if (!(premiumUSD > 0)) return;
      const claimUSD = premiumUSD * claimRecoveryRate;
      insurerShares.forEach(({ id, share: insurerShare }) => {
        pay(ctx, {
          payer: { kind: 'COMPANY', ticker: comp.ticker },
          payee: { kind: 'INSTITUTION', id },
          amount: premiumUSD * insurerShare,
          currency: currencyOf(comp.region),
          reason: 'insurance premium',
        });
        pay(ctx, {
          payer: { kind: 'INSTITUTION', id },
          payee: { kind: 'COMPANY', ticker: comp.ticker },
          amount: claimUSD * insurerShare,
          currency: currencyOf(comp.region),
          reason: 'insurance claim',
        });
      });
    });

    // ---- Insurers: record what the float cost them (a stat, not a cash move — the cash
    //      arrived through the premium/claim legs above). ----
    const underwritingResultUSD = weeklyPremiumsUSD - weeklyClaimsUSD;
    insurerShares.forEach(({ id, share }) => {
      // Recorded for `entityRequiredReturn`: what the float COST this insurer, which is what
      // decides how hard its assets have to work.
      underwritingByEntityId.set(id, underwritingResultUSD * share * 52);
    });

    // ---- Households: their premium and claim legs, against the same insurers. ----
    insurerShares.forEach(({ id, share }) => {
      pay(ctx, {
        payer: { kind: 'HOUSEHOLD', region },
        payee: { kind: 'INSTITUTION', id },
        amount: householdPremiumsUSD * share,
        currency: currencyOf(region),
        reason: 'insurance premium',
      });
      pay(ctx, {
        payer: { kind: 'INSTITUTION', id },
        payee: { kind: 'HOUSEHOLD', region },
        amount: householdPremiumsUSD * claimRecoveryRate * share,
        currency: currencyOf(region),
        reason: 'insurance claim',
      });
    });

    // ---- Pensions: contributions out of wages, benefits back to the people who earned them. ----
    // CONTRIBUTIONS COME FROM THE PEOPLE WHO ARE WORKING, and benefits go to the people
    // who are not. A cohort has an age via DEM now, so the split is real: applying the
    // contribution rate to the whole sector's income charged retirees a pension contribution.
    // The contribution IS the life-cycle saving the cohorts decided on — measured, squeezed
    // by each cohort's own budget, and already excluding retirees because it is a share of the
    // WORKING population's disposable income (household-cohorts.ts).
    const weeklyContributionsUSD = Math.max(0, reg.householdState?.lifeCycleSavingAnnualUSD ?? 0) / 52;
    const pensionEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === region && e.entityType === 'PENSION_FUND' && !e.isDefaulted
    );
    const entitlementsUSD = pensionEntities.reduce((a, e) => a + (e.beneficiaryLiabilityUSD ?? 0), 0);
    // AND THE DRAWDOWN IS THE RETIREE'S OWN REMAINING LIFE, not a stated 5%.
    //
    // `PENSION_BENEFIT_RATE_ANNUAL = 0.05` asserted a twenty-year retirement and could not change
    // when the population aged — the exact shape rule 2 forbids. A fund pays its entitlement out
    // over the years its members actually have, which the Gompertz hazard now says.
    const drawdownYears = remainingLifeExpectancyYears(RETIREMENT_AGE_YEARS);
    const weeklyBenefitsUSD = (entitlementsUSD / drawdownYears) / 52;
    if (pensionEntities.length > 0 && entitlementsUSD > 0) {
      pensionEntities.forEach((e) => {
        const share = (e.beneficiaryLiabilityUSD ?? 0) / entitlementsUSD;
        pay(ctx, {
          payer: { kind: 'HOUSEHOLD', region },
          payee: { kind: 'INSTITUTION', id: e.id },
          amount: weeklyContributionsUSD * share,
          currency: currencyOf(region),
          reason: 'pension contribution',
        });
        pay(ctx, {
          payer: { kind: 'INSTITUTION', id: e.id },
          payee: { kind: 'HOUSEHOLD', region },
          amount: weeklyBenefitsUSD * share,
          currency: currencyOf(region),
          reason: 'pension benefit',
        });
        // THE ENTITLEMENT IS A STOCK ACCUMULATED FROM REAL FLOWS, not a plug.
        //
        // It used to be `totalAssets − equityCapital`, with equity fixed at 12% of assets at the
        // seed and NEVER UPDATED — so a fund's obligation to households was whatever kept that
        // ratio true forever, and households' claims were an accounting residual of the fund's own
        // asset growth (rule 2). What a pension fund owes is what was paid in, less what was paid
        // out, plus what the money earned on the way.
        // Contributions in, benefits out. What the money EARNS on the way is credited in one
        // place for every kind whose beneficiaries are households (the household sheet), so a
        // pension is not the only one whose members own their fund's return.
        e.beneficiaryLiabilityUSD = Math.max(0, (e.beneficiaryLiabilityUSD ?? 0)
          + (weeklyContributionsUSD - weeklyBenefitsUSD) * share);
        benefitsByEntityId.set(e.id, weeklyBenefitsUSD * share * 52);
      });
    }

    // The household side of every leg above now travels through the same instructions — the
    // insurer's payroll reaches households through the wage bill the profile caller charges it,
    // and premiums, claims, contributions and benefits settle like every other payment. No
    // direct write to `depositsLocal` or `pendingBankSettlementUSD` survives here: settlement's
    // HOUSEHOLD case maintains both, which is the invariant the hand-kept version could break.
  });

  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    const underwritingUSD = underwritingByEntityId.get(e.id);
    const benefitsUSD = benefitsByEntityId.get(e.id);
    if (underwritingUSD === undefined && benefitsUSD === undefined) return e;
    return {
      ...e,
      ...(underwritingUSD !== undefined ? { lastAnnualUnderwritingResultUSD: underwritingUSD } : {}),
      ...(benefitsUSD !== undefined ? { lastAnnualBenefitOutflowUSD: benefitsUSD } : {}),
    };
  });
}
