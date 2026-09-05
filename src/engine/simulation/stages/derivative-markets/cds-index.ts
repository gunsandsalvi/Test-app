/**
 * §3.17d — THE CREDIT INDEX MARKET. A region's basket is rolled here, on the market convention's
 * clock, from the names the single-name book makes; a constituent's credit event is settled here
 * for the series — ONCE, at what its workout paid, for every contract on the line (the index
 * auction settles a name's weight for the whole market); and the line CLEARS (17d-ii).
 *
 * WHO IS ON THE LINE. The asset class's REAL-MONEY holders: an insurer or a pension fund whose
 * corporate-credit target exceeds what its cash credit book holds WRITES index protection for the
 * gap — the asset class without funding it — and one whose book exceeds its target BUYS it for
 * the excess, each at its own reservation on the basket. And 17c's two-way quoters — the banks'
 * desks and the credit funds — at the basket's reservation, which is the equal-weighted mean of
 * the constituents' single-name reservations at that participant's own cost of capital. The
 * print joins the series' history (what the class marks at and sizes its margin from), and the
 * index-versus-single-name basis — the print against the constituents' average print — is
 * published on the region as a measured number.
 *
 * Runs in the CLEARING phase after the single-name book (registry order) and settles AFTER the
 * market: the series' events are recorded here and the lifecycle settles them the same week.
 */

import { REGION_IDS, currencyOf } from '../../../../domain/geography';
import { buildEntityIndex } from '../../../ledger/entity-index';
import { isActiveCompany, type Company } from '../../../../domain/company';
import { asEntityId, asTicker, type EntityId, type Ticker } from '../../../../domain/ids';
import { derivativesBookOf, strikeDerivatives } from '../../../ledger/contract-ledger';
import { registerBook } from '../../../ledger/instrument-ledger';
import { creditIndexInstrumentId } from '../../../../domain/instrument-keys';
import { creditIndexRollDue, rollCreditIndex, indexHolderQuote, indexBasisBps, CDS_INDEX_TENOR_WEEKS, type CreditIndexSeries } from '../../../../domain/derivatives/classes/cds-index';
import { twoWayProtectionQuote } from '../../../../domain/derivatives/classes/cds';
import { DerivativeContract, DerivativeParty, bankPartyKey, derivativePartyKey } from '../../../../domain/derivatives/contract';
import { deskNotionalCapacityLocal, initialMarginRateOf } from '../../../../domain/derivatives/registry';
import { bankParty, bankPartyOf } from '../../../../domain/party';
import { institutionProfile, allocationTargetFor } from '../../../../domain/institution-profiles';
import { isCreditClass } from '../../../../domain/assets';
import { MEASURE_WINDOW_WEEKS } from '../../../../domain/volatility';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, takePrint } from '../financial-clearing-engine';
import { computeAnnualDefaultProbability, creditRecoveryRate } from '../shared-helpers';
import { computeReservationSpreadBps, spreadRiskCapitalChargeRate, entityRequiredReturn, fullSizeSpreadRangeBpsOf } from '../asset-allocation';
import { bankRequiredReturnAnnual } from '../bank-lending';
import { leverageHeadroomLocal } from '../../../macro/banking';
import { bankReservesOf } from '../../../ledger/accounts';
import { bankBookAssetsLocal } from '../../../desk-register';
import { facilityBookOf } from '../../../../engine2/tranches';
import { institutionTotalAssetsLocal, institutionBookLocal } from '../institutional-balance-sheet';
import { postInitialMargin, withInitialMargin, admitToHouse, openMemberCapacity, memberNotionalCapacityLocal } from '../derivative-lifecycle';
import type { DerivativeMarket, DerivativeMarketRun } from '../derivatives';

function runCdsIndexMarket({ ctx, week, view, standing }: DerivativeMarketRun): void {
  const index = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const { companyById } = index;
  const bankIdOfTicker = (t: Ticker) => index.companyByTicker.get(t)?.id;
  const book = derivativesBookOf(ctx);
  const capacity = openMemberCapacity();
  REGION_IDS.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const series = reg.creditIndexSeries ?? (reg.creditIndexSeries = {});
    const current = reg.creditIndexSeriesId === undefined ? undefined : series[reg.creditIndexSeriesId];

    // ---- 1. THE ROLL. The basket is the region's made names: every active name the single-name
    // book has printed, equal-weighted, fixed until the next roll. ----
    if (creditIndexRollDue(current, week)) {
      const names = Object.keys(reg.cdsSpreadHistoryByIssuer ?? {}).map(asEntityId)
        .filter((id) => { const c = companyById.get(id); return !!c && c.region === regionId && isActiveCompany(c); });
      const n = (reg.creditIndexNextSeriesNo ?? 1);
      const rolled = rollCreditIndex(regionId, n, week, names);
      if (rolled) {
        series[rolled.seriesId] = rolled;
        reg.creditIndexSeriesId = rolled.seriesId;
        reg.creditIndexNextSeriesNo = n + 1;
      }
    }

    // ---- 2. THE EVENTS. A constituent that has failed and whose workout has closed (or that left
    // no estate to wait for) settles its weight for the series, at what the workout paid. ----
    const referenced = new Set<string>();
    book.forEach((c) => { if (c.reference.kind === 'BASKET' && c.reference.regionId === regionId) referenced.add(c.reference.seriesId); });
    Object.values(series).forEach((s: CreditIndexSeries) => {
      const settled = new Set<EntityId>(s.events.map((e) => e.issuerId));
      s.constituents.forEach((id) => {
        if (settled.has(id) || !view.isIssuerDefaulted(id)) return;
        const w = view.issuerWorkout(id);
        if (w?.state === 'OPEN') return;
        s.events.push({ issuerId: id, week, recovery: w?.state === 'CLOSED' ? w.recovery : view.recoveryRate(regionId) });
      });
      // A series no contract names and that is no longer current has nothing left to say.
      if (s.seriesId !== reg.creditIndexSeriesId && !referenced.has(s.seriesId)) delete series[s.seriesId];
    });

    // ---- 3. THE LINE. The series on the run clears as one instrument. ----
    const live = reg.creditIndexSeriesId === undefined ? undefined : series[reg.creditIndexSeriesId];
    if (!live) return;
    const names = live.constituents.map((id) => companyById.get(id)).filter((c): c is Company => !!c && isActiveCompany(c));
    if (names.length === 0) return;
    const money = currencyOf(regionId);
    const recoveryRate = creditRecoveryRate(reg);
    const creditConditionsIndex = reg.bankingSector.creditConditionsIndex ?? 0;
    const instrumentId = creditIndexInstrumentId(live.seriesId);
    const reference: DerivativeContract['reference'] = { kind: 'BASKET', regionId, seriesId: live.seriesId };
    const marginRate = initialMarginRateOf({ classId: 'CDS_INDEX', regionId, reference, termKey: '', maturityWeek: week + CDS_INDEX_TENOR_WEEKS }, view);
    const pdByName = new Map(names.map((c) => [c.id, computeAnnualDefaultProbability(ctx.v2, c)]));
    /** The basket's reservation for one participant: the mean of its single-name reservations. */
    const basketReservationBps = (entityType: Parameters<typeof computeReservationSpreadBps>[0]['entityType'], requiredReturn: number): number =>
      names.reduce((a, c) => a + computeReservationSpreadBps({
        entityType, requiredReturn,
        expectedLossBps: pdByName.get(c.id)! * (1 - recoveryRate) * 10000,
        capitalChargeRate: spreadRiskCapitalChargeRate(c.creditRating, CDS_INDEX_TENOR_WEEKS / 52),
        creditConditionsIndex,
      }), 0) / names.length;
    const singleNamePrints = names.map((c) => c.cdsSpreadBps).filter((b): b is number => b !== undefined && b > 0);
    const history = reg.creditIndexSpreadHistoryBySeries ?? (reg.creditIndexSpreadHistoryBySeries = {});
    const lastPrint = history[live.seriesId]?.[history[live.seriesId].length - 1];

    const participants: ClearingParticipant[] = [];
    const openingByParticipant = new Map<string, number>();
    const partyBySeat = new Map<string, DerivativeParty>();
    /** A seat as the party it bids for: a `CDXDESK-` seat is a bank's desk, anything else an institution. */
    const partyOfSeat = (seatId: string): DerivativeParty => {
      const known = partyBySeat.get(seatId);
      if (known) return known;
      const deskBankId = seatId.startsWith('CDXDESK-') ? bankIdOfTicker(asTicker(seatId.slice('CDXDESK-'.length))) : undefined;
      return deskBankId !== undefined ? bankPartyOf(deskBankId) : { kind: 'INSTITUTION', id: asEntityId(seatId) };
    };
    let floatLocal = 0;
    const seat = (id: string, party: DerivativeParty, q: { reservationStat: number; fullSizeStatRange: number; maxHoldingLocal: number; currentHoldingLocal: number }) => {
      if (!(q.maxHoldingLocal > 0)) return;
      participants.push({ id, currentHoldingsByInstrumentId: new Map([[instrumentId, q.currentHoldingLocal]]), demandByInstrumentId: new Map([[instrumentId, { reservationStat: q.reservationStat, maxHoldingLocal: q.maxHoldingLocal, fullSizeStatRange: q.fullSizeStatRange }]]) });
      openingByParticipant.set(id, q.currentHoldingLocal);
      partyBySeat.set(id, party);
      floatLocal += q.currentHoldingLocal;
    };

    // The banks' desks and the credit funds: 17c's two-way quote, on the basket.
    ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c)).forEach((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      const party = bankParty(bank);
      const capacityLocal = deskNotionalCapacityLocal(
        leverageHeadroomLocal(sheet, bankReservesOf(ctx.v2, bank.id), facilityBookOf(ctx.v2, bank.id), bankBookAssetsLocal(ctx.v2, bank.id)),
        standing.pfeChargeLocal(bankPartyKey(bank.id)), 'CDS_INDEX');
      const sizeLocal = Math.min(capacityLocal, memberNotionalCapacityLocal(ctx, capacity, party, money, marginRate));
      seat(`CDXDESK-${bank.ticker}`, party, twoWayProtectionQuote({ reservationBps: basketReservationBps('ASSET_MANAGER', bankRequiredReturnAnnual(bank, reg)), rangeBps: fullSizeSpreadRangeBpsOf(bank), sizeLocal }));
    });
    ctx.updatedInstitutionalEntities.filter((e) => e.region === regionId && !e.isDefaulted).forEach((entity) => {
      const party: DerivativeParty = { kind: 'INSTITUTION', id: entity.id };
      const totalAssetsLocal = institutionTotalAssetsLocal(ctx, entity);
      const requiredReturn = entityRequiredReturn(entity, totalAssetsLocal);
      const reservationBps = basketReservationBps(entity.entityType, requiredReturn);
      const rangeBps = fullSizeSpreadRangeBpsOf(entity);
      const houseLocal = memberNotionalCapacityLocal(ctx, capacity, party, money, marginRate);
      if (institutionProfile(entity.entityType).quotesCdsProtection) {
        seat(entity.id, party, twoWayProtectionQuote({ reservationBps, rangeBps, sizeLocal: Math.min(Math.max(0, entity.equityCapitalLocal), houseLocal) }));
        return;
      }
      // Real money: the asset class by its target, against what its cash credit book holds.
      const target = allocationTargetFor(entity.entityType, entity.hedgeFundStrategy);
      const targetShare = target.corpBondPct + target.loanPct;
      if (!(targetShare > 0)) return;
      const gapLocal = targetShare * totalAssetsLocal - institutionBookLocal(ctx.v2, entity.id, isCreditClass);
      seat(entity.id, party, indexHolderQuote({ reservationBps, rangeBps, gapLocal: Math.max(-houseLocal, Math.min(houseLocal, gapLocal)) }));
    });
    // §3.17f-ii: a relative-value book's leg on the line — the index written against its names
    // bought, or the mirror — is a one-sided seat at the level the pair pays.
    ctx.relativeValueLegs.filter((l) => l.market === 'CDS_INDEX_PROTECTION' && l.regionId === regionId && l.instrumentId === instrumentId).forEach((leg) => {
      const party: DerivativeParty = { kind: 'INSTITUTION', id: leg.entityId };
      const houseLocal = memberNotionalCapacityLocal(ctx, capacity, party, money, marginRate);
      seat(leg.entityId, party, indexHolderQuote({ reservationBps: leg.reservationPrice, rangeBps: leg.fullSizePriceRange, gapLocal: Math.max(-houseLocal, Math.min(houseLocal, leg.faceLocal)) }));
    });
    if (participants.length === 0 || !(floatLocal > 0)) return;

    registerBook(ctx.v2, instrumentId, 'CDS_INDEX', money);
    const instrument: ClearingInstrument = {
      id: instrumentId,
      outstandingLocal: floatLocal,
      tradableFloatLocal: floatLocal,
      // Opens at the line's last print, before that at the constituents' average single-name
      // print: the alternative a writer is pricing against.
      currentStat: Math.max(1, lastPrint ?? (singleNamePrints.length > 0 ? singleNamePrints.reduce((a, b) => a + b, 0) / singleNamePrints.length : 1)),
      statKind: 'YIELD_LIKE',
      durationYears: CDS_INDEX_TENOR_WEEKS / 52,
    };
    const result = clearFinancialAsset([instrument], participants, { dealerSpreadBps: 0 });
    const clearedBps = takePrint(ctx, result, instrumentId, 'cds index');
    if (clearedBps === undefined) return;

    // ---- 4. THE PRINT, and the basis against the names it is made of. ----
    const print = Number(clearedBps.toFixed(1));
    history[live.seriesId] = [...(history[live.seriesId] ?? []).slice(-(MEASURE_WINDOW_WEEKS - 1)), print];
    reg.creditIndexBasisBps = indexBasisBps(print, singleNamePrints);

    // ---- 5. Strike. What a seat holds against its opening is what it did: written above, bought
    // below. At one print the writers are fungible; each buyer draws pro rata. ----
    const writtenBySeat = new Map<string, number>();
    const bought: { party: DerivativeParty; usd: number }[] = [];
    let totalWrittenLocal = 0;
    result.newParticipantHoldings.forEach((byInstrument, seatId) => {
      const net = (byInstrument.get(instrumentId) ?? 0) - (openingByParticipant.get(seatId) ?? 0);
      if (net > 1) { writtenBySeat.set(seatId, net); totalWrittenLocal += net; }
      else if (net < -1) bought.push({ party: partyOfSeat(seatId), usd: -net });
    });
    if (totalWrittenLocal <= 0 || bought.length === 0) return;
    const totalBoughtLocal = bought.reduce((a, d) => a + d.usd, 0);
    const filledShare = Math.min(1, totalWrittenLocal / Math.max(1, totalBoughtLocal));
    const struck: DerivativeContract[] = [];
    let seq = 0;
    bought.forEach((d) => {
      const takenLocal = d.usd * filledShare;
      if (takenLocal <= 1) return;
      writtenBySeat.forEach((writtenLocal, seatId) => {
        const notional = takenLocal * (writtenLocal / totalWrittenLocal);
        if (notional <= 1) return;
        const seller = partyOfSeat(seatId);
        if (derivativePartyKey(seller) === derivativePartyKey(d.party)) return;
        struck.push(withInitialMargin({
          id: `${live.seriesId}-${week}-${seq++}`,
          classId: 'CDS_INDEX',
          regionId,
          a: d.party,
          b: seller,
          notional: Math.round(notional),
          strike: print,
          reference,
          termKey: '',
          currency: money,
          // A line struck today has settled every event the series has had: it is on the survivors.
          units: live.events.length,
          settledMarkLocal: 0,
          struckWeek: week,
          maturityWeek: week + CDS_INDEX_TENOR_WEEKS,
        }, view));
      });
    });
    const admitted = admitToHouse(ctx, struck, view);
    strikeDerivatives(ctx, admitted);
    admitted.forEach((c) => postInitialMargin(ctx, c));
  });
}

export const CDS_INDEX_MARKET: DerivativeMarket = {
  classId: 'CDS_INDEX',
  phase: 'CLEARING',
  settles: 'AFTER_MARKET',
  run: runCdsIndexMarket,
};
