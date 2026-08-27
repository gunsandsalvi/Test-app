/**
 * WS8 — the settlement half of a primary offering, shared by the clearing adapters
 * (07b bonds, 07d loans, 07e equity).
 *
 * Money, conserved across named books — BEST-EFFORTS placement until G3 exists:
 *   - participants paid for the new paper they took through their ordinary cash legs
 *     (the engine's netCashDelta covers fills against the enlarged float);
 *   - the ISSUER receives what the market actually took, minus the fee (stage 08 posts it
 *     through the S5 ledger and creates the tranche at the CLEARED terms);
 *   - the LEAD BANK receives the fee, cash and equity together;
 *   - the unsold residual sits on the region dealer book UNFUNDED — the same §7.19 gap every
 *     dealer-inventory acquisition has today. Firm-commitment underwriting (the lead paying
 *     real cash for the residual) requires the desk to BE a named bank's balance sheet, which
 *     is exactly G3; wiring the cash leg before the asset had a ledger to sit on broke the
 *     per-bank identity invariant by the residual amount in its first harness run.
 *   Sum per settlement: buyers −(take), issuer +(take − fee), lead +fee = 0 exactly.
 *
 * A WITHDRAWN offering settles nothing: no fee, no residual, no proceeds — the deal never
 * happened, and stage 08's purpose-specific fallback (the revolver, for a refinancing) is the
 * issuer's problem, exactly as it is in reality.
 */

import { Company, RegionId } from '../../../types';
import { PrimaryOffering, UNDERWRITING_FEE_BPS } from '../../../domain/primary-market';
import { WeeklyStepContext } from './context';
import { ClearingResult } from './financial-clearing-engine';

/**
 * Settle every offering the given book priced this week. `statToProceeds` converts the cleared
 * statistic into gross proceeds for the issuer (par for credit — the stat is a spread;
 * shares × cleared price for equity).
 */
export function settlePricedOfferings(
  regionId: RegionId,
  instrumentType: PrimaryOffering['instrumentType'],
  offeringsByIssuerId: Map<string, PrimaryOffering>,
  result: ClearingResult,
  ctx: WeeklyStepContext,
  statToGrossProceedsUSD: (offering: PrimaryOffering, clearedStat: number) => number
): void {
  if (offeringsByIssuerId.size === 0) return;
  const settledOfferingIds = new Set<string>();

  offeringsByIssuerId.forEach((offering, issuerId) => {
    const outcome = result.primaryOutcomeById.get(issuerId);
    if (!outcome) return; // issuer not in this week's book — offering stays queued
    settledOfferingIds.add(offering.id);

    if (outcome.withdrawn) {
      ctx.primarySettlements.set(offering.id, {
        offering, clearedStat: outcome.clearedStat, withdrawn: true, marketTakeUSD: 0, proceedsUSD: 0,
      });
      return;
    }

    // Proceeds on the MARKET TAKE (grossed at the cleared level for equity, par for credit).
    const takeShare = Math.min(1, outcome.marketTakeUSD / Math.max(1, offering.sizeUSD));
    const grossUSD = statToGrossProceedsUSD(offering, outcome.clearedStat) * takeShare;
    const feeUSD = grossUSD * (UNDERWRITING_FEE_BPS[instrumentType] / 10000);

    // Lead bank: the fee, cash and equity together (both legs — an equity-only credit breaks
    // the identity invariant).
    const lead = ctx.updatedCompanies.find((c: Company) => c.ticker === offering.leadBankTicker && c.bankBalanceSheet)
      ?? ctx.prevActiveFirms.find((c: Company) => c.ticker === offering.leadBankTicker && c.bankBalanceSheet);
    if (lead && feeUSD > 0) {
      const existingSheet = ctx.companyUpdates[lead.ticker]?.bankBalanceSheet ?? lead.bankBalanceSheet!;
      if (!ctx.companyUpdates[lead.ticker]) ctx.companyUpdates[lead.ticker] = {};
      ctx.companyUpdates[lead.ticker].bankBalanceSheet = {
        ...existingSheet,
        cashReservesUSD: existingSheet.cashReservesUSD + feeUSD,
        bankEquityUSD: existingSheet.bankEquityUSD + feeUSD,
      };
    }

    ctx.primarySettlements.set(offering.id, {
      offering,
      clearedStat: outcome.clearedStat,
      withdrawn: false,
      marketTakeUSD: outcome.marketTakeUSD,
      proceedsUSD: Number((grossUSD - feeUSD).toFixed(0)),
    });
  });

  ctx.primaryOfferingsWorking = ctx.primaryOfferingsWorking.filter((o) => !settledOfferingIds.has(o.id));
}
