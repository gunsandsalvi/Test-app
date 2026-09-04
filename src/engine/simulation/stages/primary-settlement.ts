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
import { bankParty, bankSecuritiesParty, companyParty } from '../../../domain/party';
import { currencyOf } from '../../../domain/geography';
import { PrimaryOffering, UNDERWRITING_FEE_BPS } from '../../../domain/primary-market';
import { DealerDeskInventory } from '../../../domain/dealer-desk';
import { WeeklyStepContext, updateBankSheet } from './context';
import { ClearingResult } from './financial-clearing-engine';
import { pay } from './settlement';
import { transferHolding, issueHolding, HoldingSpec } from '../../ledger/holdings-ledger';
import { PartyRef } from '../../ledger/party';
import { heldInShares } from '../../../domain/assets';
import { equityInstrumentId } from '../../../domain/instrument-keys';
import type { InstrumentId } from '../../../domain/ids';

/**
 * §3.13 — WHAT THE BOOK PRICED, AND WHAT IT CALLED IT. A book that clears per ISSUER names its
 * primary outcome by the issuer; 07b clears per TRANCHE, so the deal is its own instrument and
 * the outcome is under the id of the paper that is about to exist. These options are what tells
 * the two apart, and they carry back the terms that instrument was struck on so stage 08 issues
 * the paper the market actually priced.
 */
export interface PricedOfferingOptions {
  /** The instrument the auction listed this offering as. Default: the issuer's own id. */
  instrumentIdOf?: (offering: PrimaryOffering) => InstrumentId;
  /** What one UNIT of the cleared statistic buys — the price, where the book clears one. Default
   *  1, which is what a par book's units and money have always been. */
  unitPriceOfStat?: (clearedStat: number) => number;
  /** The terms the book STRUCK the new paper on, for the stage that issues it. */
  termsOf?: (offering: PrimaryOffering) => { couponRate: number; maturityWeek: number } | undefined;
}

/**
 * Settle every offering the given book priced this week. `statToProceeds` converts the cleared
 * statistic into gross proceeds for the issuer (price × face where the book clears a price;
 * shares × cleared price for equity).
 */
export function settlePricedOfferings(
  regionId: RegionId,
  instrumentType: PrimaryOffering['instrumentType'],
  offeringsByIssuerId: Map<string, PrimaryOffering>,
  result: ClearingResult,
  ctx: WeeklyStepContext,
  statToGrossProceedsLocal: (offering: PrimaryOffering, clearedStat: number) => number,
  /** What the lead quoted for THIS deal — the book's own spread plus what it can lose on the
   *  residual. Omitted only where a book has not been given its own quote yet. */
  feeBpsOf?: (offering: PrimaryOffering, clearedStat: number) => number,
  /** The desk book the lead's firm commitment lands in ('corporate bond', 'equity', ...).
   *  Omitting it leaves the residual unfunded. */
  deskBook?: string,
  options: PricedOfferingOptions = {}
): void {
  if (offeringsByIssuerId.size === 0) return;
  const settledOfferingIds = new Set<string>();
  // §3.13-BOOK slice (a): with no override, the offering lists under its ISSUER's id — the
  // equity crossing named in `instrument-keys.ts`, which is what an equity deal really is.
  const instrumentIdOf = options.instrumentIdOf ?? ((o: PrimaryOffering) => equityInstrumentId(o.issuerId));

  offeringsByIssuerId.forEach((offering, issuerId) => {
    const instrumentId = instrumentIdOf(offering);
    const outcome = result.primaryOutcomeById.get(instrumentId);
    if (!outcome) return; // issuer not in this week's book — offering stays queued
    settledOfferingIds.add(offering.id);

    if (outcome.withdrawn) {
      ctx.primarySettlements.set(offering.id, {
        offering, clearedStat: outcome.clearedStat, withdrawn: true, marketTakeLocal: 0, issuedLocal: 0, proceedsLocal: 0,
      });
      return;
    }

    // FIRM COMMITMENT. The lead guaranteed the price, so the issuer is paid on the whole deal
    // and the lead owns whatever the book did not take, at the cleared level, in its own desk
    // inventory — which is the business the fee below is the price of. Paying the issuer on the
    // market take alone would be best-efforts placement wearing a firm commitment's name.
    const takeShare = Math.min(1, outcome.marketTakeLocal / Math.max(1, offering.sizeLocal));
    const fullGrossLocal = statToGrossProceedsLocal(offering, outcome.clearedStat);
    const lead = ctx.updatedCompanies.find((c: Company) => c.ticker === offering.leadBankTicker && c.bankBalanceSheet)
      ?? ctx.prevActiveFirms.find((c: Company) => c.ticker === offering.leadBankTicker && c.bankBalanceSheet);
    const firmCommitment = !!(lead && deskBook);
    const grossLocal = firmCommitment ? fullGrossLocal : fullGrossLocal * takeShare;
    const residualLocal = firmCommitment ? Math.max(0, fullGrossLocal - fullGrossLocal * takeShare) : 0;
    const feeBps = feeBpsOf ? feeBpsOf(offering, outcome.clearedStat) : UNDERWRITING_FEE_BPS[instrumentType];
    const feeLocal = grossLocal * (feeBps / 10000);

    // Lead bank: the fee and the residual, both as REAL PAYMENTS between it and the issuer.
    //
    // They used to be a direct write on the lead's reserves (`cashReservesLocal + feeLocal -
    // residualLocal`) while the issuer's proceeds were posted against the UNMODELED boundary on
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
      if (residualLocal > 0) {
        pay(ctx, {
          payer: bankSecuritiesParty(lead),
          payee: companyParty(issuerCompany),
          amount: residualLocal,
          currency: currencyOf(issuerCompany.region),
          reason: 'underwriting residual taken by the lead',
        });
      }
      if (feeLocal > 0) {
        pay(ctx, {
          payer: companyParty(issuerCompany),
          payee: bankParty(lead),
          amount: feeLocal,
          currency: currencyOf(issuerCompany.region),
          reason: 'underwriting fee',
        });
      }
    }
    if (lead && deskBook && residualLocal > 0) {
      const existingSheet = ctx.companyUpdates[lead.ticker]?.bankBalanceSheet ?? lead.bankBalanceSheet!;
      const inventory: DealerDeskInventory = { ...(existingSheet.dealerDeskInventory ?? {}) };
      const rows = [...(inventory[deskBook] ?? [])];
      const at = rows.findIndex((r) => r.instrumentId === instrumentId);
      // The position carries its UNITS. An equity book clears in shares, so a residual stored
      // as dollars alone is read back as a share count by every units-aware consumer (desk
      // build, fee mark) — inventoryLocal-as-units at a $40 price is a 40x phantom position.
      // Credit clears in dollars, where units and money are the same number.
      // §3.13: a book that clears a PRICE says what a unit costs, so the residual's units are its
      // money over that price for credit exactly as they always were for equity.
      const unitPrice = Math.max(1e-9, options.unitPriceOfStat
        ? options.unitPriceOfStat(outcome.clearedStat)
        : (instrumentType === 'EQUITY' ? outcome.clearedStat : 1));
      const residualUnits = residualLocal / unitPrice;
      if (at >= 0) {
        const prevUnits = rows[at].units ?? rows[at].inventoryLocal / unitPrice;
        rows[at] = {
          instrumentId,
          inventoryLocal: rows[at].inventoryLocal + residualLocal,
          units: prevUnits + residualUnits,
        };
      } else {
        rows.push({ instrumentId, inventoryLocal: residualLocal, units: residualUnits });
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
      const leadDesk: PartyRef = bankSecuritiesParty(lead);
      const spec: HoldingSpec = heldInShares(instrumentType)
        ? { instrumentType, instrumentId, issuerRegion: regionId, valueLocal: residualLocal, shares: residualUnits }
        : { instrumentType, instrumentId, issuerRegion: regionId, valueLocal: residualLocal };
      if (heldInShares(instrumentType)) issueHolding(ctx.v2, companyParty(issuerCompany!), leadDesk, spec, 'underwriting residual taken by the lead');
      else transferHolding(ctx.v2, { kind: 'CLEARING_HOUSE', region: regionId }, leadDesk, spec, 'underwriting residual taken by the lead');
    }

    ctx.primarySettlements.set(offering.id, {
      offering,
      clearedStat: outcome.clearedStat,
      // §3.13: the paper the market priced is the paper that gets issued. The book that struck
      // the coupon hands it over rather than leaving stage 08 to re-derive one off a curve the
      // same session has already moved past.
      struckTerms: options.termsOf?.(offering),
      withdrawn: false,
      marketTakeLocal: outcome.marketTakeLocal,
      // Firm commitment issues the WHOLE deal — the lead owns what the book did not take, and
      // that paper has to exist for the lead to own it. Creating the tranche at the market take
      // instead had the lead's desk holding a claim on nothing.
      issuedLocal: firmCommitment ? offering.sizeLocal : outcome.marketTakeLocal,
      proceedsLocal: Math.round((grossLocal - feeLocal)),
    });
  });

  ctx.primaryOfferingsWorking = ctx.primaryOfferingsWorking.filter((o) => !settledOfferingIds.has(o.id));
}
