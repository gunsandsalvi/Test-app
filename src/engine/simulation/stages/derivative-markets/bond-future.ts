/**
 * §3.17e-i — THE GOVERNMENT BOND FUTURES MARKET. One line per region: the front contract on the
 * region's benchmark sovereign bond, the deliverable named at the strike (the rung nearest ten
 * years from the next quarterly delivery), cleared PRICE-LIKE per unit of face.
 *
 * WHO IS ON THE LINE. The duration mandates — an insurer or pension fund whose assets are shorter
 * than its claims (the swap book's own gap read, net of what its swaps and its futures already
 * cover) goes LONG for the gap, buying below the carry price, because the bond financed would
 * cost it more; a holder whose sovereign book exceeds its target SHORTS for the excess above
 * carry. And the banks' desks, two-way at carry, sized by their derivative budget. The print
 * joins the line's history (what the class marks at), and the NET BASIS — the print against the
 * cash bond carried forward at the repo rate less its coupon — is published on the region as a
 * measured number: the relationship the basis trader (§3 step 17f's first comparable) arbitrages.
 *
 * Runs in the CLEARING phase with the other books and settles AFTER the market, once the week's
 * print exists to mark against.
 */

import { REGION_IDS, currencyOf } from '../../../../domain/geography';
import { isActiveCompany } from '../../../../domain/company';
import { buildEntityIndex } from '../../../ledger/entity-index';
import { asEntityId, asTicker, type Ticker } from '../../../../domain/ids';
import { strikeDerivatives } from '../../../ledger/contract-ledger';
import { registerBook } from '../../../ledger/instrument-ledger';
import { bondFutureInstrumentId } from '../../../../domain/instrument-keys';
import {
  BOND_FUTURE_TERM_KEY, nextDeliveryWeek, deliverableOf, bondDurationYears, bondFuturesCarryPrice, bondFuturesNetBasis,
  bondFutureHolderQuote, twoWayPriceQuote, bondFutureWeeklyMoveOf,
} from '../../../../domain/derivatives/classes/bond-future';
import { DerivativeContract, DerivativeParty, bankPartyKey, derivativePartyKey, institutionPartyKey } from '../../../../domain/derivatives/contract';
import { deskNotionalCapacityLocal, initialMarginRateOf } from '../../../../domain/derivatives/registry';
import { bankParty, bankPartyOf } from '../../../../domain/party';
import { institutionProfile, allocationTargetFor } from '../../../../domain/institution-profiles';
import { carriesRateDuration } from '../../../../domain/assets';
import { MEASURE_WINDOW_WEEKS } from '../../../../domain/volatility';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, takePrint } from '../financial-clearing-engine';
import { leverageHeadroomLocal } from '../../../macro/banking';
import { bankReservesOf } from '../../../ledger/accounts';
import { bankBookAssetsLocal } from '../../../desk-register';
import { facilityBookOf, materializeGovLadder } from '../../../../engine2/tranches';
import { trancheClearedPricePerFace } from '../../../credit-price';
import { institutionTotalAssetsLocal, institutionBookLocal } from '../institutional-balance-sheet';
import { sovereignBookLocalOf } from '../../../sovereign-register';
import { postInitialMargin, withInitialMargin, admitToHouse, openMemberCapacity, memberNotionalCapacityLocal } from '../derivative-lifecycle';
import type { DerivativeMarket, DerivativeMarketRun } from '../derivatives';

function runBondFuturesMarket({ ctx, week, view, standing }: DerivativeMarketRun): void {
  const index = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const bankIdOfTicker = (t: Ticker) => index.companyByTicker.get(t)?.id;
  const capacity = openMemberCapacity();
  REGION_IDS.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    // ---- 1. THE DELIVERABLE, and its carry. ----
    const deliveryWeek = nextDeliveryWeek(week);
    const bond = deliverableOf(materializeGovLadder(ctx.v2, regionId), deliveryWeek);
    if (!bond) return;
    const cashPrice = trancheClearedPricePerFace(ctx.v2, bond.id);
    if (!(cashPrice !== undefined && cashPrice > 0)) return;
    const money = currencyOf(regionId);
    const repoRateAnnual = view.overnightRateAnnual(regionId);
    const yearsToDelivery = (deliveryWeek - week) / 52;
    const carryPrice = bondFuturesCarryPrice({ cashPrice, couponRate: bond.couponRate, repoRateAnnual, yearsToDelivery });
    const durationYears = bondDurationYears(repoRateAnnual, (bond.maturityWeek - deliveryWeek) / 52);
    // The move the line can make in a session, per unit of face: what a quote scales in over.
    const rangePrice = Math.max(1e-4, bondFutureWeeklyMoveOf(view, regionId, durationYears) ?? cashPrice * 0.01);
    const instrumentId = bondFutureInstrumentId(regionId, deliveryWeek);
    const reference: DerivativeContract['reference'] = { kind: 'SOVEREIGN', regionId, bondId: bond.id };
    const marginRate = initialMarginRateOf({ classId: 'BOND_FUTURE', regionId, reference, termKey: BOND_FUTURE_TERM_KEY, maturityWeek: deliveryWeek }, view);
    const history = reg.bondFuturesPriceHistory ?? (reg.bondFuturesPriceHistory = {});
    const lastPrint = history[instrumentId][history[instrumentId].length - 1];

    // ---- 2. THE QUOTES. ----
    const participants: ClearingParticipant[] = [];
    const openingByParticipant = new Map<string, number>();
    const partyBySeat = new Map<string, DerivativeParty>();
    let floatLocal = 0;
    const seat = (id: string, party: DerivativeParty, q: { reservationStat: number; fullSizeStatRange: number; maxHoldingLocal: number; currentHoldingLocal: number }) => {
      if (!(q.maxHoldingLocal > 0)) return;
      participants.push({ id, currentHoldingsByInstrumentId: new Map([[instrumentId, q.currentHoldingLocal]]), demandByInstrumentId: new Map([[instrumentId, { reservationStat: q.reservationStat, maxHoldingLocal: q.maxHoldingLocal, fullSizeStatRange: q.fullSizeStatRange }]]) });
      openingByParticipant.set(id, q.currentHoldingLocal);
      partyBySeat.set(id, party);
      floatLocal += q.currentHoldingLocal;
    };
    const partyOfSeat = (seatId: string): DerivativeParty => {
      const known = partyBySeat.get(seatId);
      if (known) return known;
      const deskBankId = seatId.startsWith('BFDESK-') ? bankIdOfTicker(asTicker(seatId.slice('BFDESK-'.length))) : undefined;
      return deskBankId !== undefined ? bankPartyOf(deskBankId) : { kind: 'INSTITUTION', id: asEntityId(seatId) };
    };

    // The banks' desks: two-way at carry, sized by the one derivative budget through this
    // class's add-on and by what they can margin at the house.
    ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c)).forEach((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      const party = bankParty(bank);
      const capacityLocal = deskNotionalCapacityLocal(
        leverageHeadroomLocal(sheet, bankReservesOf(ctx.v2, bank.id), facilityBookOf(ctx.v2, bank.id), bankBookAssetsLocal(ctx.v2, bank.id)),
        standing.pfeChargeLocal(bankPartyKey(bank.id)), 'BOND_FUTURE');
      seat(`BFDESK-${bank.ticker}`, party, twoWayPriceQuote({ carryPrice, rangePrice, sizeLocal: Math.min(capacityLocal, memberNotionalCapacityLocal(ctx, capacity, party, money, marginRate)) }));
    });

    // §3.17e-ii-a: the relative-value books' FUTURE legs — short the line against the deliverable
    // they are long — at the price that keeps the pair's edge. A book on the line by its legs is
    // not also a duration mandate here.
    const rvLegs = ctx.relativeValueLegs.filter((l) => l.market === 'BOND_FUTURE' && l.regionId === regionId && l.instrumentId === instrumentId);
    const onByLegs = new Set(rvLegs.map((l) => l.entityId));
    rvLegs.forEach((leg) => {
      const party: DerivativeParty = { kind: 'INSTITUTION', id: leg.entityId };
      const houseLocal = memberNotionalCapacityLocal(ctx, capacity, party, money, marginRate);
      // §3.17e-ii-b: a buy-back (a positive leg against its short) is a long at the leg's price; a
      // CUT is a long at any price the line clears — the reservation is put out of reach.
      const price = leg.forced && leg.faceLocal > 0 ? leg.reservationPrice * 2 : leg.reservationPrice;
      seat(leg.entityId, party, bondFutureHolderQuote({ carryPrice: price, rangePrice: leg.fullSizePriceRange, gapLocal: Math.max(-houseLocal, Math.min(houseLocal, leg.faceLocal)) }));
    });

    // The duration mandates, and the holders over their sovereign target.
    ctx.updatedInstitutionalEntities.filter((e) => e.region === regionId && !e.isDefaulted && !onByLegs.has(e.id) && institutionProfile(e.entityType).sovereignDurationMandate).forEach((entity) => {
      const party: DerivativeParty = { kind: 'INSTITUTION', id: entity.id };
      const totalAssetsLocal = institutionTotalAssetsLocal(ctx, entity);
      // The swap book's own gap read: assets beyond the paper that carries duration, net of the
      // duration its swaps receive and its futures already carry.
      const bondBookLocal = institutionBookLocal(ctx.v2, entity.id, carriesRateDuration);
      const coveredLocal = standing.coverLocal('IRS', 'b', institutionPartyKey(entity.id)) + standing.coverLocal('BOND_FUTURE', 'a', institutionPartyKey(entity.id));
      const durationGapLocal = totalAssetsLocal - bondBookLocal - coveredLocal;
      const target = allocationTargetFor(entity.entityType, entity.hedgeFundStrategy);
      const sovereignExcessLocal = sovereignBookLocalOf(ctx.v2, entity.id) - target.govBondPct * totalAssetsLocal - standing.coverLocal('BOND_FUTURE', 'b', institutionPartyKey(entity.id));
      const gapLocal = durationGapLocal > 0 ? durationGapLocal : sovereignExcessLocal > 0 ? -sovereignExcessLocal : 0;
      const houseLocal = memberNotionalCapacityLocal(ctx, capacity, party, money, marginRate);
      seat(entity.id, party, bondFutureHolderQuote({ carryPrice, rangePrice, gapLocal: Math.max(-houseLocal, Math.min(houseLocal, gapLocal)) }));
    });
    if (participants.length === 0 || !(floatLocal > 0)) return;

    // ---- 3. THE LINE. ----
    registerBook(ctx.v2, instrumentId, 'BOND_FUTURE', money);
    const instrument: ClearingInstrument = {
      id: instrumentId,
      outstandingLocal: floatLocal,
      tradableFloatLocal: floatLocal,
      // Opens at its own last print; before one, at carry — the level the cash bond financed to
      // delivery implies, which is what every quote here is written against.
      currentStat: Math.max(1e-6, lastPrint),
      statKind: 'PRICE_LIKE',
      durationYears,
    };
    const result = clearFinancialAsset([instrument], participants, {});
    const cleared = takePrint(ctx, result, instrumentId, 'bond future');
    if (cleared === undefined) return;

    // ---- 4. THE PRINT, and the basis against the bond it delivers. ----
    const print = Number(cleared.toFixed(6));
    history[instrumentId] = [...(history[instrumentId] ?? []).slice(-(MEASURE_WINDOW_WEEKS - 1)), print];
    reg.bondFuturesDeliverableId = bond.id;
    reg.bondFuturesBasis = bondFuturesNetBasis(print, carryPrice);

    // ---- 5. Strike. What a seat holds against its opening is what it did: long above zero,
    // short below. At one print the shorts are fungible; each long draws pro rata. ----
    const shortBySeat = new Map<string, number>();
    const longs: { party: DerivativeParty; face: number }[] = [];
    let totalShortLocal = 0;
    result.newParticipantHoldings.forEach((byInstrument, seatId) => {
      const net = (byInstrument.get(instrumentId) ?? 0) - (openingByParticipant.get(seatId) ?? 0);
      if (net > 1) longs.push({ party: partyOfSeat(seatId), face: net });
      else if (net < -1) { shortBySeat.set(seatId, -net); totalShortLocal += -net; }
    });
    if (totalShortLocal <= 0 || longs.length === 0) return;
    const totalLongLocal = longs.reduce((a, d) => a + d.face, 0);
    const filledShare = Math.min(1, totalShortLocal / Math.max(1, totalLongLocal));
    const struck: DerivativeContract[] = [];
    let seq = 0;
    longs.forEach((d) => {
      const takenLocal = d.face * filledShare;
      if (takenLocal <= 1) return;
      shortBySeat.forEach((shortLocal, seatId) => {
        const face = takenLocal * (shortLocal / totalShortLocal);
        if (face <= 1) return;
        const short = partyOfSeat(seatId);
        if (derivativePartyKey(short) === derivativePartyKey(d.party)) return;
        struck.push(withInitialMargin({
          id: `${instrumentId}-${week}-${seq++}`,
          classId: 'BOND_FUTURE',
          regionId,
          a: d.party,
          b: short,
          notional: Math.round(face),
          units: Math.round(face),
          strike: print,
          reference,
          termKey: BOND_FUTURE_TERM_KEY,
          currency: money,
          settledMarkLocal: 0,
          struckWeek: week,
          maturityWeek: deliveryWeek,
        }, view));
      });
    });
    const admitted = admitToHouse(ctx, struck, view);
    strikeDerivatives(ctx, admitted);
    admitted.forEach((c) => postInitialMargin(ctx, c));
  });
}

export const BOND_FUTURE_MARKET: DerivativeMarket = {
  classId: 'BOND_FUTURE',
  phase: 'CLEARING',
  settles: 'AFTER_MARKET',
  run: runBondFuturesMarket,
};
