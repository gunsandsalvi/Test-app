/**
 * §3.17b-iii — THE OPTIONS MARKET: index puts, per region. Who needs the cover is the equity
 * holders — every institution with an equity book, sized by the one hedging arithmetic every
 * other market uses (`corporate-financing.ts:exposureToHedgeLocal`): the book's move over the
 * option's tenor beyond what the holder's own surplus can absorb, at its own risk aversion, less
 * the cover it already holds. Who writes it is the banks' desks — sized by the one derivative
 * budget (registry.ts) — and the hedge funds whose strategy sells volatility, each at a
 * RESERVATION VOLATILITY: the volatility it expects to realise plus the premium that pays its
 * required return on the capital the position consumes (`option.ts:writerReservationVol`). The
 * book clears an IMPLIED VOLATILITY (the stat, in vol points) from those schedules against the
 * float, the region publishes it (`Region.indexImpliedVol`, what the class then prices at), and
 * the fills strike as at-the-money puts on the index at the listed tenor, through the house like
 * every class: admitted against each member's limit, then struck, then posting margin. The
 * premium fires in this settle (the class settles AFTER its market).
 */

import type { DerivativeMarket, DerivativeMarketRun } from '../derivatives';
import { REGION_IDS, currencyOf } from '../../../../domain/geography';
import { DerivativeContract, DerivativeParty, bankPartyKey, institutionPartyKey } from '../../../../domain/derivatives/contract';
import { OPTION_PROFILE, OPTION_TENOR_WEEKS, writerReservationVol } from '../../../../domain/derivatives/classes/option';
import { deskNotionalCapacityLocal, initialMarginRateOf } from '../../../../domain/derivatives/registry';
import { hedgeFundStrategyProfile } from '../../../../domain/institution-profiles';
import { riskAversionOf } from '../../../../domain/preferences';
import { isEquityClass } from '../../../../domain/assets';
import { bankParty, bankPartyOf } from '../../../../domain/party';
import { isActiveCompany } from '../../../../domain/company';
import { indexOptionInstrumentId } from '../../../../domain/instrument-keys';
import { asEntityId, asTicker, type InstrumentId } from '../../../../domain/ids';
import { exposureToHedgeLocal } from '../corporate-financing';
import { entityRequiredReturn } from '../asset-allocation';
import { bankRequiredReturnAnnual } from '../bank-lending';
import { institutionBookLocal, institutionTotalAssetsLocal } from '../institutional-balance-sheet';
import { BASEL_MIN_LEVERAGE_RATIO, leverageHeadroomLocal } from '../../../macro/banking';
import { bankReservesOf } from '../../../ledger/accounts';
import { bankBookAssetsLocal } from '../../../desk-register';
import { facilityBookOf } from '../../../../engine2/tranches';
import { buildEntityIndex } from '../../../ledger/entity-index';
import { registerBook } from '../../../ledger/instrument-ledger';
import { strikeDerivatives } from '../../../ledger/contract-ledger';
import { clearFinancialAsset, type ClearingInstrument, type ClearingParticipant } from '../financial-clearing-engine';
import { postInitialMargin, withInitialMargin, admitToHouse, openMemberCapacity, memberNotionalCapacityLocal, reserveMemberCapacity } from '../derivative-lifecycle';

/** A desk's seat in the book, in the participant-id space the engine keys fills by. */
const DESK_SEAT = 'OPTDESK-';

function runOptionMarket({ ctx, week, standing, view }: DerivativeMarketRun): void {
  const index = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const capacity = openMemberCapacity();
  const tenorYears = OPTION_TENOR_WEEKS / 52;
  // The capital a written option consumes per unit of notional: its PFE add-on against the
  // leverage floor — the same charge the desk budget spends.
  const capitalChargeRate = OPTION_PROFILE.pfeAddOnRate * BASEL_MIN_LEVERAGE_RATIO;
  let seq = 0;

  REGION_IDS.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const level = view.indexLevel(regionId);
    const realisedVol = view.indexAnnualVol(regionId);
    if (!reg || !(level > 0) || realisedVol === undefined || !(realisedVol > 0)) return;
    const money = currencyOf(regionId);
    const marginRate = initialMarginRateOf({ classId: 'OPTION', regionId, reference: { kind: 'INDEX', regionId }, termKey: 'PUT', maturityWeek: week + OPTION_TENOR_WEEKS }, view);
    const oneSigma = realisedVol * Math.sqrt(tenorYears);

    // ---- 1. WHO NEEDS COVER, and how much: the equity holders, each to what its surplus cannot
    // absorb of a one-sigma fall over the tenor, less the puts it already holds, and no more than
    // it can margin at the house. ----
    const demands: { party: DerivativeParty; usd: number }[] = [];
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.region !== regionId || e.isDefaulted) return;
      const equityBookLocal = institutionBookLocal(ctx.v2, e.id, isEquityClass);
      if (!(equityBookLocal > 0)) return;
      const party: DerivativeParty = { kind: 'INSTITUTION', id: e.id };
      const wantLocal = exposureToHedgeLocal({
        exposureLocal: equityBookLocal,
        ebitAnnualLocal: Math.max(0, e.equityCapitalLocal),
        interestAnnualLocal: 0,
        oneSigma,
        riskAversion: riskAversionOf(e.management),
      }) - standing.coverLocal('OPTION', 'a', institutionPartyKey(e.id), regionId);
      const usd = Math.min(wantLocal, memberNotionalCapacityLocal(ctx, capacity, party, money, marginRate));
      if (usd <= 1e6) return;
      reserveMemberCapacity(ctx, capacity, party, money, usd * marginRate);
      demands.push({ party, usd });
    });
    if (demands.length === 0) return;
    const floatLocal = demands.reduce((a, d) => a + d.usd, 0);

    // ---- 2. THE BOOK: at-the-money puts on the index at the listed tenor, quoted in vol points. ----
    const instrumentId: InstrumentId = indexOptionInstrumentId(regionId, 'PUT');
    registerBook(ctx.v2, instrumentId, 'OPTION', money);
    const instrument: ClearingInstrument = {
      id: instrumentId,
      outstandingLocal: floatLocal,
      tradableFloatLocal: floatLocal,
      currentStat: (reg.indexImpliedVol ?? realisedVol) * 100,
      statKind: 'YIELD_LIKE',
      durationYears: tenorYears,
    };

    // ---- 3. THE WRITERS, each at its reservation volatility. ----
    const participants: ClearingParticipant[] = [];
    const schedule = (holderKey: string, party: DerivativeParty, requiredReturnAnnual: number, maxLocal: number) => {
      const capLocal = Math.min(maxLocal, memberNotionalCapacityLocal(ctx, capacity, party, money, marginRate));
      if (!(capLocal > 0)) return;
      const reservationVol = writerReservationVol({ realisedVol, capitalChargeRate, requiredReturnAnnual, tenorYears });
      participants.push({
        id: holderKey,
        currentHoldingsByInstrumentId: new Map(),
        demandByInstrumentId: new Map([[instrumentId, {
          reservationStat: reservationVol * 100,
          maxHoldingLocal: capLocal,
          // Full size once the volatility clears a whole premium above what it expects — the
          // same distance that sets the reservation, so the schedule has one scale.
          fullSizeStatRange: Math.max(0.5, (reservationVol - realisedVol) * 100),
        }]]),
      });
    };
    ctx.updatedCompanies.forEach((bank) => {
      if (bank.region !== regionId || !bank.isBankEntity || !bank.bankBalanceSheet || !isActiveCompany(bank)) return;
      const sheet = bank.bankBalanceSheet;
      const deskLocal = deskNotionalCapacityLocal(
        leverageHeadroomLocal(sheet, bankReservesOf(ctx.v2, bank.id), facilityBookOf(ctx.v2, bank.id), bankBookAssetsLocal(ctx.v2, bank.id)), standing.pfeChargeLocal(bankPartyKey(bank.id)), 'OPTION');
      schedule(`${DESK_SEAT}${bank.ticker}`, bankParty(bank), bankRequiredReturnAnnual(bank, reg), deskLocal);
    });
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.region !== regionId || e.isDefaulted || !(hedgeFundStrategyProfile(e)?.sellsVolatility ?? false)) return;
      schedule(e.id, { kind: 'INSTITUTION', id: e.id }, entityRequiredReturn(e, institutionTotalAssetsLocal(ctx, e)), Math.max(0, e.equityCapitalLocal));
    });
    if (participants.length === 0) return;

    const result = clearFinancialAsset([instrument], participants, { dealerSpreadBps: 0 });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `option:${id}`));
    const clearedVolPct = result.newStatById.get(instrumentId);
    if (clearedVolPct === undefined) return;
    const impliedVol = Number((clearedVolPct / 100).toFixed(4));
    // Published: the class prices every option on this index at it from here on.
    reg.indexImpliedVol = impliedVol;

    // ---- 4. STRIKE. Each holder's cover draws from each writer in proportion to what it wrote. ----
    const writtenBySeat = new Map<string, number>();
    let totalWrittenLocal = 0;
    result.newParticipantHoldings.forEach((byInstrument, seat) => {
      const usd = byInstrument.get(instrumentId) ?? 0;
      if (usd <= 1) return;
      writtenBySeat.set(seat, usd);
      totalWrittenLocal += usd;
    });
    if (totalWrittenLocal <= 0) return;
    const filledShare = Math.min(1, totalWrittenLocal / Math.max(1, floatLocal));
    const struck: DerivativeContract[] = [];
    demands.forEach((d) => {
      const coveredLocal = d.usd * filledShare;
      if (coveredLocal <= 1) return;
      writtenBySeat.forEach((writtenLocal, seat) => {
        const notional = coveredLocal * (writtenLocal / totalWrittenLocal);
        if (notional <= 1) return;
        const deskBankId = seat.startsWith(DESK_SEAT) ? index.companyByTicker.get(asTicker(seat.slice(DESK_SEAT.length)))?.id : undefined;
        const writer: DerivativeParty = deskBankId !== undefined ? bankPartyOf(deskBankId) : { kind: 'INSTITUTION', id: asEntityId(seat) };
        struck.push(withInitialMargin({
          id: `${regionId}-OPT-PUT-${week}-${seq++}`,
          classId: 'OPTION',
          regionId,
          a: d.party,
          b: writer,
          notional: Math.round(notional),
          strike: level,
          units: notional / level,
          reference: { kind: 'INDEX', regionId },
          termKey: 'PUT',
          currency: money,
          settledMarkLocal: 0,
          struckWeek: week,
          maturityWeek: week + OPTION_TENOR_WEEKS,
        }, view));
      });
    });
    const admitted = admitToHouse(ctx, struck);
    strikeDerivatives(ctx, admitted);
    admitted.forEach((c) => postInitialMargin(ctx, c));
  });
}

export const OPTION_MARKET: DerivativeMarket = {
  classId: 'OPTION',
  phase: 'POST_SETTLEMENT',
  settles: 'AFTER_MARKET',
  run: runOptionMarket,
};
