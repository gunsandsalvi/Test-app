/**
 * The settlement half of a primary offering, shared by the clearing adapters (07b bonds,
 * 07d loans, 07e equity).
 *
 * Money, conserved across named books, on a FIRM COMMITMENT:
 *   - participants paid for the new paper they took through their ordinary cash legs
 *     (the engine's netCashDelta covers fills against the enlarged float);
 *   - the ISSUER receives the WHOLE deal, minus the fee — that is what a guarantee is (stage 08
 *     posts it through the S5 ledger and creates the tranche at the CLEARED terms);
 *   - the LEAD BANK receives the fee, cash and equity together, and pays real reserves for the
 *     residual it is left holding, which lands in its own desk inventory — the residual has a
 *     payer, because the desk is a balance sheet.
 *   Sum per settlement: buyers −(take), issuer +(gross − fee), lead +fee −(gross − take) = 0.
 *
 * A WITHDRAWN offering settles nothing: no fee, no residual, no proceeds — the deal never
 * happened, and stage 08's purpose-specific fallback (the revolver, for a refinancing) is the
 * issuer's problem, exactly as it is in reality.
 */

import { Company, RegionId } from '../../../types';
import { PrimaryOffering, UNDERWRITING_FEE_BPS } from '../../../domain/primary-market';
import { DealerDeskInventory } from '../../../domain/dealer-desk';
import { WeeklyStepContext, updateBankSheet } from './context';
import { ClearingResult } from './financial-clearing-engine';
import { pay } from './settlement';
import { transferHolding, issueHolding, HoldingSpec } from '../../ledger/holdings-ledger';
import { PartyRef } from '../../ledger/party';
import { heldInShares } from '../../../domain/assets';

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
  /** What the lead quoted for THIS deal — the book's own spread plus what it can lose on the
   *  residual. Omitted only where a book has not been given its own quote yet. */
  feeBpsOf?: (offering: PrimaryOffering, clearedStat: number) => number,
  /** The desk book the lead's firm commitment lands in ('corporate bond', 'equity', ...).
   *  Omitting it leaves the residual unfunded. */
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
        offering, clearedStat: outcome.clearedStat, withdrawn: true, marketTakeUSD: 0, issuedUSD: 0, proceedsUSD: 0,
      });
      return;
    }

    // FIRM COMMITMENT. The lead guaranteed the price, so the issuer is paid on the whole deal
    // and the lead owns whatever the book did not take, at the cleared level, in its own desk
    // inventory — which is the business the fee below is the price of. Paying the issuer on the
    // market take alone would be best-efforts placement wearing a firm commitment's name.
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
      // The position carries its UNITS. An equity book clears in shares, so a residual stored
      // as dollars alone is read back as a share count by every units-aware consumer (desk
      // build, fee mark) — inventoryUSD-as-units at a $40 price is a 40x phantom position.
      // Credit clears in dollars, where units and money are the same number.
      const residualUnits = instrumentType === 'EQUITY'
        ? residualUSD / Math.max(1e-9, outcome.clearedStat)
        : residualUSD;
      if (at >= 0) {
        const prevUnits = rows[at].units
          ?? (instrumentType === 'EQUITY'
            ? rows[at].inventoryUSD / Math.max(1e-9, outcome.clearedStat)
            : rows[at].inventoryUSD);
        rows[at] = {
          instrumentId: issuerId,
          inventoryUSD: rows[at].inventoryUSD + residualUSD,
          units: prevUnits + residualUnits,
        };
      } else {
        rows.push({ instrumentId: issuerId, inventoryUSD: residualUSD, units: residualUnits });
      }
      inventory[deskBook] = rows;
      updateBankSheet(ctx, lead.ticker, { ...existingSheet, dealerDeskInventory: inventory });
      // The residual is paper that MOVED, and it moves ONCE. For the credit books the issuer
      // delivered the whole deal to the clearing house when its tranche was issued and the
      // book's fills took the market's share, so the lead takes the rest from the house; for
      // equity the issuer's new shares are created onto the lead, because the CCP leg carried
      // only the take. Wiring it a second time off the house — which this did, unconditionally
      // and with the same spec — debited the house twice for one delivery, and on the equity
      // side attributed one movement to two different senders.
      const leadDesk: PartyRef = { kind: 'BANK_SECURITIES', ticker: lead.ticker };
      const spec: HoldingSpec = heldInShares(instrumentType)
        ? { instrumentType, instrumentId: issuerId, issuerRegion: regionId, valueUSD: residualUSD, shares: residualUnits }
        : { instrumentType, instrumentId: issuerId, issuerRegion: regionId, valueUSD: residualUSD };
      if (heldInShares(instrumentType)) issueHolding(ctx.v2, { kind: 'COMPANY', ticker: issuerCompany!.ticker }, leadDesk, spec, 'underwriting residual taken by the lead');
      else transferHolding(ctx.v2, { kind: 'CLEARING_HOUSE', region: regionId }, leadDesk, spec, 'underwriting residual taken by the lead');
    }

    ctx.primarySettlements.set(offering.id, {
      offering,
      clearedStat: outcome.clearedStat,
      withdrawn: false,
      marketTakeUSD: outcome.marketTakeUSD,
      // Firm commitment issues the WHOLE deal — the lead owns what the book did not take, and
      // that paper has to exist for the lead to own it. Creating the tranche at the market take
      // instead had the lead's desk holding a claim on nothing.
      issuedUSD: firmCommitment ? offering.sizeUSD : outcome.marketTakeUSD,
      proceedsUSD: Math.round((grossUSD - feeUSD)),
    });
  });

  ctx.primaryOfferingsWorking = ctx.primaryOfferingsWorking.filter((o) => !settledOfferingIds.has(o.id));
}
