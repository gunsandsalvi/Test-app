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

import { GameState, RegionId, Company, InstitutionalEntity } from '../../../types';
import { WeeklyStepContext } from './context';
import { isActiveCompany } from '../../../domain/company';

/**
 * The share of household income paid into pension schemes. A real policy parameter — every country
 * sets one — stated here with a single owner and read by nothing else. It becomes an outcome in
 * HH4, where cohorts have ages and a contribution is something a working cohort does.
 */
export const PENSION_CONTRIBUTION_RATE = 0.09;
/**
 * The share of accumulated entitlements paid out as benefits each year. A mature scheme pays out
 * roughly what it earns; the same HH4 caveat applies — with real cohorts this becomes the retired
 * share drawing down, not a rate.
 */
export const PENSION_BENEFIT_RATE_ANNUAL = 0.05;

/** What a firm has to lose, and therefore insures: its plant and the revenue that runs through it. */
const corporateInsurableBaseUSD = (c: Company) => Math.max(0, c.grossPPEUSD ?? 0) + Math.max(0, c.annualRevenue);

export function runInsuranceAndPensionsStage(state: GameState, ctx: WeeklyStepContext): void {
  const cashDeltaByEntityId = new Map<string, number>();
  const underwritingByEntityId = new Map<string, number>();
  const benefitsByEntityId = new Map<string, number>();
  const addEntityCash = (id: string, usd: number) =>
    cashDeltaByEntityId.set(id, (cashDeltaByEntityId.get(id) ?? 0) + usd);

  (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach((region) => {
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
    // reason: "the P&L already charges an expense ratio against premiums". §7.125 deleted that
    // charge — an insurer's operating cost is now its REAL wage bill and its real input basket,
    // charged by the profile caller like every other firm's — and this cash leg was left behind.
    // So the same expense was taken twice: once as real staff and premises, once as a flat fifth
    // of premiums (rule 3). What an insurer spends running itself leaves through the payments
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

    // ---- Companies: a real operating expense, and the claims that come back against it. ----
    operating.forEach((comp) => {
      const share = corporateInsurableBaseUSD(comp) / Math.max(1, corporateBaseUSD);
      const premiumUSD = corporatePremiumsUSD * share;
      if (!(premiumUSD > 0)) return;
      const claimUSD = premiumUSD * claimRecoveryRate;
      const netUSD = claimUSD - premiumUSD;
      comp.cash = (comp.cash ?? 0) + netUSD;
      comp.lastCashLedger = [
        ...(comp.lastCashLedger ?? []),
        { label: 'insurance premiums paid', amountUSD: -premiumUSD },
        ...(claimUSD > 0 ? [{ label: 'insurance claims received', amountUSD: claimUSD }] : []),
      ];
    });

    // ---- Insurers: the cash their underwriting actually produced. ----
    const insurerEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === region && e.entityType === 'INSURER' && !e.isDefaulted
    );
    const insurerCapitalUSD = insurerEntities.reduce((a, e) => a + Math.max(0, e.equityCapitalUSD), 0) || 1;
    const underwritingResultUSD = weeklyPremiumsUSD - weeklyClaimsUSD;
    insurerEntities.forEach((e) => {
      const share = Math.max(0, e.equityCapitalUSD) / insurerCapitalUSD;
      addEntityCash(e.id, underwritingResultUSD * share);
      // Recorded for `entityRequiredReturn`: what the float COST this insurer, which is what
      // decides how hard its assets have to work.
      underwritingByEntityId.set(e.id, underwritingResultUSD * share * 52);
    });

    // ---- Pensions: contributions out of wages, benefits back to the people who earned them. ----
    const weeklyContributionsUSD =
      (Math.max(0, reg.estimatedHouseholdIncomeUSD) * PENSION_CONTRIBUTION_RATE) / 52;
    const pensionEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === region && e.entityType === 'PENSION_FUND' && !e.isDefaulted
    );
    const entitlementsUSD = pensionEntities.reduce((a, e) => a + (e.beneficiaryLiabilityUSD ?? 0), 0);
    const weeklyBenefitsUSD = (entitlementsUSD * PENSION_BENEFIT_RATE_ANNUAL) / 52;
    if (pensionEntities.length > 0 && entitlementsUSD > 0) {
      pensionEntities.forEach((e) => {
        const share = (e.beneficiaryLiabilityUSD ?? 0) / entitlementsUSD;
        addEntityCash(e.id, (weeklyContributionsUSD - weeklyBenefitsUSD) * share);
        // COH2 — THE ENTITLEMENT IS A STOCK ACCUMULATED FROM REAL FLOWS, not a plug.
        //
        // It used to be `totalAssets − equityCapital`, with equity fixed at 12% of assets at the
        // seed and NEVER UPDATED — so a fund's obligation to households was whatever kept that
        // ratio true forever, and households' claims were an accounting residual of the fund's own
        // asset growth (rule 13). What a pension fund owes is what was paid in, less what was paid
        // out, plus what the money earned on the way.
        e.beneficiaryLiabilityUSD = Math.max(0, (e.beneficiaryLiabilityUSD ?? 0)
          + (weeklyContributionsUSD - weeklyBenefitsUSD) * share
          + Math.max(0, e.lastWeeklyInvestmentIncomeUSD ?? 0));
        benefitsByEntityId.set(e.id, weeklyBenefitsUSD * share * 52);
      });
    }

    // ---- Households: the other side of every leg above. ----
    const householdNetUSD =
      // The insurer's own operating spend used to arrive here as household income, as the other
      // side of the expense ratio above. It leaves with it: an insurer's payroll now reaches
      // households the way every other firm's does, through the wage bill the profile caller
      // charges it — one representation of one insurer's staff cost (rule 3).
      -householdPremiumsUSD + householdPremiumsUSD * claimRecoveryRate
      - (pensionEntities.length > 0 ? weeklyContributionsUSD : 0)
      + weeklyBenefitsUSD;
    reg.householdState = {
      ...hs,
      depositsUSD: Math.max(0, (hs.depositsUSD ?? 0) + householdNetUSD),
      // HH4d: the banks post this flow next week (T+1) — see pendingBankSettlementUSD's doc.
      pendingBankSettlementUSD: Number(((hs.pendingBankSettlementUSD ?? 0) + householdNetUSD).toFixed(0)),
    };
  });

  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    const deltaUSD = cashDeltaByEntityId.get(e.id);
    const underwritingUSD = underwritingByEntityId.get(e.id);
    const benefitsUSD = benefitsByEntityId.get(e.id);
    if (deltaUSD === undefined && underwritingUSD === undefined && benefitsUSD === undefined) return e;
    return {
      ...e,
      cashUSD: (e.cashUSD ?? 0) + (deltaUSD ?? 0),
      ...(underwritingUSD !== undefined ? { lastAnnualUnderwritingResultUSD: underwritingUSD } : {}),
      ...(benefitsUSD !== undefined ? { lastAnnualBenefitOutflowUSD: benefitsUSD } : {}),
    };
  });
}
