/**
 * §3.17b-iv — THE FX FUNDING MARKET: a term book per borrower-region/foreign-region pair where
 * a bank short a currency borrows it against its own for a year (`fx-forwards-and-xcs.md` B4,
 * C, D3). WHO BORROWS: a home-region bank whose desk ended the last close SHORT the foreign
 * money — its securities account's foreign row below zero, the unsquared spot book that the
 * `fx-funding.ts` purchase cannot fix because a bank's nostro is a position, not a shortfall —
 * less the swaps it already has on, no more than it can margin at the house. WHO LENDS: the
 * foreign region's banks, from their own reserves, on the one derivative budget, each at a
 * RESERVATION BASIS that pays its required return on the capital the swap consumes
 * (`xcs.ts:lenderReservationBps`). The book clears the BASIS in bps (the stat) from the
 * lenders' schedules against the borrowers' float; the borrower region publishes it
 * (`Region.xcsBasisBps`, the funding basis — the forward book's `crossCurrencyBasisBps` is the
 * other one until 17b-iv-b), and the fills strike as cross-currency swaps through the house
 * like every class: admitted against each member's limit, struck, margined. The class settles
 * AFTER the market, so the strike week's settle exchanges the notionals.
 */

import type { DerivativeMarket, DerivativeMarketRun } from '../derivatives';
import { drawSwapLine, serviceSwapLines } from '../swap-lines';
import { swapLineDrawLocal, cappedBasisBps } from '../../../../domain/swap-lines';
import type { Company } from '../../../../domain/company';
import { REGION_IDS, currencyOf } from '../../../../domain/geography';
import { DerivativeContract, DerivativeParty, bankPartyKey } from '../../../../domain/derivatives/contract';
import { XCS_PROFILE, XCS_TENOR_WEEKS, lenderReservationBps } from '../../../../domain/derivatives/classes/xcs';
import { deskNotionalCapacityLocal, initialMarginRateOf } from '../../../../domain/derivatives/registry';
import { bankParty, bankSecuritiesParty } from '../../../../domain/party';
import { isActiveCompany } from '../../../../domain/company';
import { convert } from '../../../../domain/currency';
import { xcsFundingInstrumentId } from '../../../../domain/instrument-keys';
import { asTicker, type InstrumentId } from '../../../../domain/ids';
import { bankRequiredReturnAnnual } from '../bank-lending';
import { BASEL_MIN_LEVERAGE_RATIO, leverageHeadroomLocal } from '../../../macro/banking';
import { balanceOf, bankReservesOf } from '../../../ledger/accounts';
import { bankBookAssetsLocal } from '../../../desk-register';
import { facilityBookOf } from '../../../../engine2/tranches';
import { buildEntityIndex } from '../../../ledger/entity-index';
import { registerBook } from '../../../ledger/instrument-ledger';
import { strikeDerivatives } from '../../../ledger/contract-ledger';
import { clearFinancialAsset, type ClearingInstrument, type ClearingParticipant } from '../financial-clearing-engine';
import { postInitialMargin, withInitialMargin, admitToHouse, openMemberCapacity, memberNotionalCapacityLocal, reserveMemberCapacity } from '../derivative-lifecycle';

/** A lender's seat in the book, in the participant-id space the engine keys fills by. */
const LENDER_SEAT = 'XCSLEND-';

function runXcsMarket({ ctx, week, standing, view }: DerivativeMarketRun): void {
  const index = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const capacity = openMemberCapacity();
  const capitalChargeRate = XCS_PROFILE.pfeAddOnRate * BASEL_MIN_LEVERAGE_RATIO;
  const banks = ctx.updatedCompanies.filter((c) => c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c));
  let seq = 0;
  // §3.17b-v: last quarter's swap-line draws pay their interest and, at term, unwind — before
  // this week's book, so a bank whose draw just matured is short again and comes to the market.
  serviceSwapLines(ctx, week, view);

  REGION_IDS.forEach((home) => {
    const reg = ctx.updatedRegions[home];
    if (!reg) return;
    const published: Record<string, number> = { ...(reg.xcsBasisBps ?? {}) };
    REGION_IDS.forEach((foreign) => {
      if (foreign === home) return;
      const foreignMoney = currencyOf(foreign);
      const marginRate = initialMarginRateOf({ classId: 'XCS', regionId: home, reference: { kind: 'REGION', regionId: foreign }, termKey: '', maturityWeek: week + XCS_TENOR_WEEKS }, view);

      // ---- 1. WHO BORROWS: the home banks whose desks are short the foreign money. ----
      const demands: { party: DerivativeParty; usd: number }[] = [];
      banks.forEach((bank) => {
        if (bank.region !== home) return;
        const shortLocal = -balanceOf(ctx.v2, bankSecuritiesParty(bank), foreignMoney);
        const wantLocal = shortLocal - standing.coverLocal('XCS', 'a', bankPartyKey(bank.id), foreign);
        const usd = Math.min(wantLocal, memberNotionalCapacityLocal(ctx, capacity, bankParty(bank), foreignMoney, marginRate));
        if (usd <= 1e6) return;
        reserveMemberCapacity(ctx, capacity, bankParty(bank), foreignMoney, usd * marginRate);
        demands.push({ party: bankParty(bank), usd });
      });
      if (demands.length === 0) return;
      const floatLocal = demands.reduce((a, d) => a + d.usd, 0);

      // ---- 2. THE BOOK: a year's funding of the foreign money, quoted as a basis. ----
      const instrumentId: InstrumentId = xcsFundingInstrumentId(home, foreign);
      registerBook(ctx.v2, instrumentId, 'XCS', foreignMoney);
      const instrument: ClearingInstrument = {
        id: instrumentId,
        outstandingLocal: floatLocal,
        tradableFloatLocal: floatLocal,
        currentStat: Math.max(1, reg.xcsBasisBps?.[foreign] ?? reg.crossCurrencyBasisBps?.[foreign] ?? 10),
        statKind: 'YIELD_LIKE',
        durationYears: XCS_TENOR_WEEKS / 52,
      };

      // ---- 3. WHO LENDS: the foreign region's banks, from their reserves, at their reservation. ----
      const participants: ClearingParticipant[] = [];
      banks.forEach((lender) => {
        if (lender.region !== foreign) return;
        const sheet = lender.bankBalanceSheet!;
        const budgetLocal = deskNotionalCapacityLocal(
          leverageHeadroomLocal(sheet, bankReservesOf(ctx.v2, lender.id), facilityBookOf(ctx.v2, lender.id), bankBookAssetsLocal(ctx.v2, lender.id)), standing.pfeChargeLocal(bankPartyKey(lender.id)), 'XCS');
        const capLocal = Math.min(budgetLocal, Math.max(0, bankReservesOf(ctx.v2, lender.id)), memberNotionalCapacityLocal(ctx, capacity, bankParty(lender), foreignMoney, marginRate));
        if (!(capLocal > 0)) return;
        const reservationBps = lenderReservationBps({ capitalChargeRate, requiredReturnAnnual: bankRequiredReturnAnnual(lender, ctx.updatedRegions[foreign]) });
        participants.push({
          id: `${LENDER_SEAT}${lender.ticker}`,
          currentHoldingsByInstrumentId: new Map(),
          demandByInstrumentId: new Map([[instrumentId, {
            reservationStat: reservationBps,
            maxHoldingLocal: capLocal,
            // Full size a whole reservation past it: one scale for the schedule.
            fullSizeStatRange: Math.max(1, reservationBps),
          }]]),
        });
      });
      /** §3.17b-v — THE BACKSTOP: what the market left unfilled, once the basis has cleared past
       *  the line's price (or nobody lent), the borrowing central bank draws on its swap line and
       *  on-lends, pro rata to each borrower's unfilled need; the published basis is capped at
       *  the line's price while the line stands. */
      const backstop = (clearedBps: number | undefined, filledByBorrower: ReadonlyMap<string, number>) => {
        let unfilledLocal = 0;
        const unfilledBy: { bank: Company; usd: number }[] = [];
        demands.forEach((d) => {
          const bank = index.companyById.get(d.party.id);
          const left = d.usd - (filledByBorrower.get(d.party.id) ?? 0);
          if (bank && left > 1e6) { unfilledBy.push({ bank, usd: left }); unfilledLocal += left; }
        });
        const drawLocal = swapLineDrawLocal({ unfilledLocal, clearedBasisBps: clearedBps });
        if (drawLocal > 0) {
          unfilledBy.forEach(({ bank, usd }) => drawSwapLine(ctx, home, foreign, bank, drawLocal * (usd / unfilledLocal), week));
          published[foreign] = Number(cappedBasisBps(clearedBps).toFixed(1));
        } else if (clearedBps !== undefined) published[foreign] = Number(clearedBps.toFixed(1));
      };
      if (participants.length === 0) { backstop(undefined, new Map()); return; }

      const result = clearFinancialAsset([instrument], participants, { dealerSpreadBps: 0 });
      ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `xcs:${id}`));
      const clearedBps = result.newStatById.get(instrumentId);
      if (clearedBps === undefined) { backstop(undefined, new Map()); return; }

      // ---- 4. STRIKE: each borrower draws from each lender in proportion to what it lent. ----
      const lentBySeat = new Map<string, number>();
      let totalLentLocal = 0;
      result.newParticipantHoldings.forEach((byInstrument, seat) => {
        const usd = byInstrument.get(instrumentId) ?? 0;
        if (usd <= 1) return;
        lentBySeat.set(seat, usd);
        totalLentLocal += usd;
      });
      const filledShare = Math.min(1, totalLentLocal / Math.max(1, floatLocal));
      const filledByBorrower = new Map<string, number>();
      demands.forEach((d) => filledByBorrower.set(d.party.id, d.usd * filledShare));
      backstop(clearedBps, filledByBorrower);
      if (totalLentLocal <= 0) return;
      const struck: DerivativeContract[] = [];
      demands.forEach((d) => {
        const fundedLocal = d.usd * filledShare;
        if (fundedLocal <= 1) return;
        lentBySeat.forEach((lentLocal, seat) => {
          const notional = fundedLocal * (lentLocal / totalLentLocal);
          if (notional <= 1) return;
          const lenderId = index.companyByTicker.get(asTicker(seat.slice(LENDER_SEAT.length)))?.id;
          if (lenderId === undefined) return;
          struck.push(withInitialMargin({
            id: `${home}-XCS-${foreign}-${week}-${seq++}`,
            classId: 'XCS',
            regionId: home,
            a: d.party,
            b: bankParty({ id: lenderId }),
            notional: Math.round(notional),
            // The home notional at today's rate: what the borrower pays now and gets back at the end.
            units: convert(notional, foreignMoney, currencyOf(home), ctx.fx),
            strike: Number(clearedBps.toFixed(1)),
            reference: { kind: 'REGION', regionId: foreign },
            termKey: '',
            currency: foreignMoney,
            settledMarkLocal: 0,
            struckWeek: week,
            maturityWeek: week + XCS_TENOR_WEEKS,
          }, view));
        });
      });
      const admitted = admitToHouse(ctx, struck);
      strikeDerivatives(ctx, admitted);
      admitted.forEach((c) => postInitialMargin(ctx, c));
    });
    reg.xcsBasisBps = published;
  });
}

export const XCS_MARKET: DerivativeMarket = {
  classId: 'XCS',
  phase: 'POST_SETTLEMENT',
  settles: 'AFTER_MARKET',
  run: runXcsMarket,
};
