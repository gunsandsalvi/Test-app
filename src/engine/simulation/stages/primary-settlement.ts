/**
 * WS8 — the settlement half of a primary offering, shared by the clearing adapters
 * (07b bonds, 07d loans, 07e equity).
 *
 * Money, conserved across named books — FIRM COMMITMENT since G3 gave the desks owners:
 *   - participants paid for the new paper they took through their ordinary cash legs
 *     (the engine's netCashDelta covers fills against the enlarged float);
 *   - the ISSUER receives the WHOLE deal, minus the fee — that is what a guarantee is (stage 08
 *     posts it through the S5 ledger and creates the tranche at the CLEARED terms);
 *   - the LEAD BANK receives the fee, cash and equity together, and pays real reserves for the
 *     residual it is left holding, which lands in its own desk inventory. The §7.19 gap this
 *     used to carry is closed: the residual has a payer, because the desk is a balance sheet.
 *   Sum per settlement: buyers −(take), issuer +(gross − fee), lead +fee −(gross − take) = 0.
 *
 * A WITHDRAWN offering settles nothing: no fee, no residual, no proceeds — the deal never
 * happened, and stage 08's purpose-specific fallback (the revolver, for a refinancing) is the
 * issuer's problem, exactly as it is in reality.
 */

import { Company, RegionId } from '../../../types';
import { PrimaryOffering, UNDERWRITING_FEE_BPS } from '../../../domain/primary-market';
import { DealerDeskInventory } from '../../../domain/dealer-desk';
import { WeeklyStepContext } from './context';
import { ClearingResult } from './financial-clearing-engine';
import { pay } from './settlement';

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
  statToGrossProceedsUSD: (offering: PrimaryOffering, clearedStat: number) => number,
  /** G3c: what the lead quoted for THIS deal — the book's own spread plus what it can lose on
   *  the residual. Omitted only where a book has not been given its own quote yet. */
  feeBpsOf?: (offering: PrimaryOffering, clearedStat: number) => number,
  /** G3e: the desk book the lead's firm commitment lands in ('corporate bond', 'equity', ...).
   *  Omitted leaves the residual unfunded, which is what every book did before the desks
   *  had owners. */
  deskBook?: string
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

    // G3e: FIRM COMMITMENT. The lead guaranteed the price, so the issuer is paid on the whole
    // deal and the lead owns whatever the book did not take, at the cleared level, in its own
    // desk inventory — which is the business the fee below is the price of. Before the desks
    // had owners the residual sat on a region with no payer and the issuer was paid only on
    // the market take, which is best-efforts placement wearing a firm commitment's name.
    const takeShare = Math.min(1, outcome.marketTakeUSD / Math.max(1, offering.sizeUSD));
    const fullGrossUSD = statToGrossProceedsUSD(offering, outcome.clearedStat);
    const lead = ctx.updatedCompanies.find((c: Company) => c.ticker === offering.leadBankTicker && c.bankBalanceSheet)
      ?? ctx.prevActiveFirms.find((c: Company) => c.ticker === offering.leadBankTicker && c.bankBalanceSheet);
    const firmCommitment = !!(lead && deskBook);
    const grossUSD = firmCommitment ? fullGrossUSD : fullGrossUSD * takeShare;
    const residualUSD = firmCommitment ? Math.max(0, fullGrossUSD - fullGrossUSD * takeShare) : 0;
    const feeBps = feeBpsOf ? feeBpsOf(offering, outcome.clearedStat) : UNDERWRITING_FEE_BPS[instrumentType];
    const feeUSD = grossUSD * (feeBps / 10000);

    // Lead bank: the fee and the residual, both as REAL PAYMENTS between it and the issuer.
    //
    // They used to be a direct write on the lead's reserves (`cashReservesUSD + feeUSD -
    // residualUSD`) while the issuer's proceeds were posted against the UNMODELED boundary on
    // stage 08's cash walk — one transaction, two books, and neither leg pointed at the other.
    // The issuer is paid on the whole deal (firm commitment): the CCP pays it for what the book
    // took (book-settlement.ts), the lead pays it for the residual it is left holding, and it
    // pays the lead the fee that is the price of that guarantee.
    //
    // The residual moves the lead's reserves only (BANK_SECURITIES: one asset became another —
    // the security is the other leg, written below). The fee moves reserves AND equity (BANK: it
    // is income), which is what an equity-only credit would have broken.
    const issuerCompany = ctx.updatedCompanies.find((c: Company) => c.id === issuerId)
      ?? ctx.prevActiveFirms.find((c: Company) => c.id === issuerId)
      ?? ctx.prevActivePrivateFirms.find((c: Company) => c.id === issuerId);
    if (lead && issuerCompany) {
      if (residualUSD > 0) {
        pay(ctx, {
          payer: { kind: 'BANK_SECURITIES', ticker: lead.ticker },
          payee: { kind: 'COMPANY', ticker: issuerCompany.ticker },
          amountUSD: residualUSD,
          reason: 'underwriting residual taken by the lead',
        });
      }
      if (feeUSD > 0) {
        pay(ctx, {
          payer: { kind: 'COMPANY', ticker: issuerCompany.ticker },
          payee: { kind: 'BANK', ticker: lead.ticker },
          amountUSD: feeUSD,
          reason: 'underwriting fee',
        });
      }
    }
    if (lead && deskBook && residualUSD > 0) {
      const existingSheet = ctx.companyUpdates[lead.ticker]?.bankBalanceSheet ?? lead.bankBalanceSheet!;
      const inventory: DealerDeskInventory = { ...(existingSheet.dealerDeskInventory ?? {}) };
      const rows = [...(inventory[deskBook] ?? [])];
      const at = rows.findIndex((r) => r.instrumentId === issuerId);
      if (at >= 0) rows[at] = { instrumentId: issuerId, inventoryUSD: rows[at].inventoryUSD + residualUSD };
      else rows.push({ instrumentId: issuerId, inventoryUSD: residualUSD });
      inventory[deskBook] = rows;
      if (!ctx.companyUpdates[lead.ticker]) ctx.companyUpdates[lead.ticker] = {};
      ctx.companyUpdates[lead.ticker].bankBalanceSheet = { ...existingSheet, dealerDeskInventory: inventory };
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
