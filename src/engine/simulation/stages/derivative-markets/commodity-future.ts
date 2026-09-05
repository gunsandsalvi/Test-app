/**
 * DER4 — the commodity futures MARKET. The contract itself — the mark, delivery, close-out — is
 * the futures profile under domain/derivatives/classes/commodity-future.ts, run by the one
 * lifecycle AFTER this market, once the week's prints exist to mark against. This market keeps
 * what is the market's: who must hedge, who will take the other side, and the curve.
 *
 * The float is the production the PRODUCERS need to hedge — measured off their own books against
 * the coverage covenant, exactly as the swap market measures which corporates have to pay fixed —
 * and the participants are the longs: the firms whose recipes draw the commodity and have the
 * mirror problem, plus the desks that will carry the physical whenever the paper is dear enough
 * to make carrying it free money. Three tenors, the same three the curve has always quoted.
 *
 * Opens in the CLEARING phase after 07-commodities (this week's spot is the number every schedule
 * prices against) and with the other derivative books, so the week's variation margin moves real
 * money before the settlement pass.
 */

import { bankReservesOf } from '../../../ledger/accounts';
import { bankBookAssetsLocal } from '../../../desk-register';
import type { Ticker } from '../../../../domain/ids';
import { buildEntityIndex } from '../../../ledger/entity-index';
import { bankParty, companyParty, companyPartyOf } from '../../../../domain/party';
import { NUMERAIRE } from '../../../../domain/geography';
import { hedgeFundStrategyProfile } from '../../../../domain/institution-profiles';
import { riskAversionOf } from '../../../../domain/preferences';
import { Company } from '../../../../types';
import {
  FUTURES_TENOR_MONTHS, PHYSICAL_STORAGE_COST_ANNUAL, costOfCarryPrice, impliedConvenienceYield,
  futuresTermKey,
} from '../../../../domain/derivatives/classes/commodity-future';
import { hedgeConcessionPerUnit } from '../../../../domain/derivatives/hedging';
import { DerivativeContract, DerivativeParty, bankPartyKey, companyPartyKey } from '../../../../domain/derivatives/contract';
import { deskNotionalCapacityLocal, initialMarginRateOf } from '../../../../domain/derivatives/registry';
import { COMMODITY_CATEGORY_LINKAGE } from '../../../../domain/instruments';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../../domain/market-microstructure';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, takePrint } from '../financial-clearing-engine';
import { isActiveCompany, banksOf } from '../../../../domain/company';
import { exposureToHedgeLocal } from '../corporate-financing';
import { leverageHeadroomLocal } from '../../../macro/banking';
import { costOfCapitalOf, riskFreeRateOf } from '../../../../domain/company-week/cost-of-capital';
import { strikeDerivatives } from '../../../ledger/contract-ledger';
import { postInitialMargin, withInitialMargin, admitToHouse, openMemberCapacity, memberNotionalCapacityLocal, reserveMemberCapacity } from '../derivative-lifecycle';
import type { DerivativeMarket, DerivativeMarketRun } from '../derivatives';
import { facilityBookOf } from '../../../../engine2/tranches';


import { commodityFutureInstrumentId } from '../../../../domain/instrument-keys';
import { registerBook } from '../../../ledger/instrument-ledger';
import type { InstrumentId } from '../../../../domain/ids';
import type { EntityId } from '../../../../domain/ids';
import { asEntityId } from '../../../../domain/ids';
import { asTicker } from '../../../../domain/ids';
/** A firm's annual interest bill, from the coverage ratio its own statements already carry. */
function annualInterestOf(c: Company): number {
  const coverage = c.interestCoverage;
  if (!(coverage > 0) || !isFinite(coverage)) return 0;
  return Math.max(0, c.ebit) / coverage;
}

function runCommodityFuturesMarket({ state, ctx, week, standing, view }: DerivativeMarketRun): void {
  // §3.17-v-iii: one capacity read for the market — every member sized to its limit at the house.
  const capacity = openMemberCapacity();
  const firms = ctx.prevActiveFirms.filter(isActiveCompany);
  // §3.13-BOOK (c-then-3b): a `CONS-` seat embeds the consumer's TICKER; a party is its entity id.
  const consumerIdOfTicker = (t: Ticker) => buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities).companyByTicker.get(t)?.id;
  const firmById = new Map(firms.map((c) => [c.id, c]));
  // The USA short rate finances a carry position; it is the one this model quotes globally.
  const financingRateAnnual = ctx.updatedRegions.USA?.zeroRates?.tenor3M ?? 0.03;
  const riskFreeRate = riskFreeRateOf(ctx.updatedRegions.USA);

  // ---- 1. WHO HAS TO HEDGE, on each side, measured off real books, net of what each already
  // carries on the one book (§7.241). ----
  const struck: DerivativeContract[] = [];
  let seq = 0;

  ctx.updatedCommodities.forEach((comm) => {
    const linkage = COMMODITY_CATEGORY_LINKAGE[comm.id] || COMMODITY_CATEGORY_LINKAGE[comm.symbol];
    const spot = comm.spotPrice;
    if (!(spot > 0)) return;
    const storageCostAnnual = PHYSICAL_STORAGE_COST_ANNUAL[comm.category];

    // The natural SHORT: firms that will have this commodity to sell.
    const producers = firms.filter((c) => c.producedCommodityId === comm.id);
    // The natural LONG: firms whose recipes draw the sub-unit this commodity is a share of. Its
    // exposure is what it will actually spend on the input, off its own product mix.
    const consumerExposureLocal = new Map<EntityId, number>();
    if (linkage) {
      firms.forEach((c) => {
        const spendLocal = (c.productLines || []).reduce((a, line) => {
          const intensity = CATEGORY_INPUT_REQUIREMENTS[line.subUnitId]?.[linkage.subUnitId] ?? 0;
          return a + c.annualRevenue * (line.revenueShare ?? 0) * intensity * linkage.intensityShare;
        }, 0);
        if (spendLocal > 0) consumerExposureLocal.set(c.id, spendLocal);
      });
    }
    if (producers.length === 0 && consumerExposureLocal.size === 0) return;

    FUTURES_TENOR_MONTHS.forEach((tenorMonths) => {
      const tenorYears = tenorMonths / 12;
      const oneSigma = Math.max(0, comm.volatility) * Math.sqrt(tenorYears);
      if (!(oneSigma > 0)) return;
      const id = commodityFutureInstrumentId(comm.id, tenorMonths);
      const termKey = futuresTermKey(tenorMonths);
      // §3.13-BOOK dII: the contract is declared on the instrument index where it is built; a
      // commodity is quoted in the numéraire (`contract.ts:currency`).
      registerBook(ctx.v2, id, 'COMMODITY_FUTURE', NUMERAIRE);
      // §3.17-v-iii: every member sized to its limit at the house, at this contract's margin rate.
      const marginRate = initialMarginRateOf({ classId: 'COMMODITY_FUTURE', regionId: 'USA', reference: { kind: 'COMMODITY', commodityId: comm.id }, termKey, maturityWeek: week + Math.round(tenorMonths * (52 / 12)) }, view);
      const unitsToLimit = (party: DerivativeParty, wantUnits: number): number =>
        Math.min(wantUnits, memberNotionalCapacityLocal(ctx, capacity, party, NUMERAIRE, marginRate) / Math.max(0.01, spot));

      // How much the producers between them need to lay off, in UNITS: the revenue exposure their
      // covenant headroom cannot absorb, less what they have already sold forward.
      const sellers: { party: DerivativeParty; units: number }[] = [];
      producers.forEach((c) => {
        const forwardRevenueLocal = c.annualRevenue * tenorYears;
        const hedgeLocal = exposureToHedgeLocal({
          exposureLocal: forwardRevenueLocal,
          ebitAnnualLocal: c.ebit,
          interestAnnualLocal: annualInterestOf(c),
          oneSigma,
          riskAversion: riskAversionOf(c.management),
        });
        const units = unitsToLimit(companyParty(c), hedgeLocal / spot
          - standing.coverUnits('COMMODITY_FUTURE', 'b', companyPartyKey(c.id), comm.id, termKey));
        if (units > 0.0001) { reserveMemberCapacity(ctx, capacity, companyParty(c), NUMERAIRE, units * spot * marginRate); sellers.push({ party: companyParty(c), units }); }
      });
      const hedgeFloatUnits = sellers.reduce((a, s) => a + s.units, 0);

      // THE ARBITRAGE. A print above spot-plus-carry is free money to anyone who can hold the
      // physical, so the desks bring supply into it — sized by what their derivative budget can
      // still carry (DRV: one budget across every class, registry.ts), and present only while the
      // bound is actually breached on the print they can see. That is what holds the curve's top:
      // a participant's price, not a bracket (rule 6).
      const carryBound = costOfCarryPrice({ spotPrice: spot, financingRateAnnual, storageCostAnnual, tenorYears });
      // The print this contract last cleared at is the published curve point; spot before one.
      const published = tenorMonths === 1 ? comm.futures1M : tenorMonths === 3 ? comm.futures3M : comm.futures6M;
      const priorPrint = published > 0 ? published : spot;
      const banks = banksOf(firms);
      let arbUnits = 0;
      if (priorPrint > carryBound) {
        banks.forEach((bank) => {
          const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
          const capacityLocal = deskNotionalCapacityLocal(
            leverageHeadroomLocal(sheet, bankReservesOf(ctx.v2, bank.id), facilityBookOf(ctx.v2, bank.id), bankBookAssetsLocal(ctx.v2, bank.id)), standing.pfeChargeLocal(bankPartyKey(bank.id)), 'COMMODITY_FUTURE');
          const units = unitsToLimit(bankParty(bank), capacityLocal / Math.max(0.01, spot)) / FUTURES_TENOR_MONTHS.length;
          if (units > 0.0001) {
            sellers.push({ party: bankParty(bank), units });
            arbUnits += units;
          }
        });
      }
      const floatUnits = hedgeFloatUnits + arbUnits;
      if (!(floatUnits > 0.0001)) return;

      const instruments: ClearingInstrument[] = [{
        id,
        outstandingLocal: floatUnits,
        tradableFloatLocal: floatUnits,
        currentStat: priorPrint,
        statKind: 'PRICE_LIKE',
        durationYears: tenorYears,
      }];

      // ---- 2. THE LONGS. A consumer pays over expected spot to remove the swing, up to what the
      // unhedged exposure costs it — the mirror of the producer's own concession, one arithmetic
      // with two signs (domain/derivatives/hedging.ts). ----
      const participants: ClearingParticipant[] = [];
      consumerExposureLocal.forEach((spendAnnualLocal, companyId) => {
        const c = firmById.get(companyId);
        if (!c) return;
        const forwardSpendLocal = spendAnnualLocal * tenorYears;
        const hedgeLocal = exposureToHedgeLocal({
          exposureLocal: forwardSpendLocal,
          ebitAnnualLocal: c.ebit,
          interestAnnualLocal: annualInterestOf(c),
          oneSigma,
          riskAversion: riskAversionOf(c.management),
        });
        if (!(hedgeLocal > 0)) return;
        // Its own cost of capital — one owner (§3.26-d, `domain/company-week/cost-of-capital.ts`).
        const costOfCapital = costOfCapitalOf(c, riskFreeRate);
        const reservation = spot + hedgeConcessionPerUnit({
          spotPrice: spot, annualVol: comm.volatility, costOfCapital, tenorYears,
        });
        const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>([[id, {
          reservationStat: reservation,
          // §3.17-v-iii: no more than it can margin at the house.
          maxHoldingLocal: unitsToLimit(companyParty(c), hedgeLocal / spot),
          // Full size once the price is a whole concession below what it would pay — the same
          // distance that sets the reservation, so the schedule has one scale, not two.
          fullSizeStatRange: Math.max(0.01, reservation - spot),
        }]]);
        participants.push({
          id: `CONS-${c.ticker}`,
          currentHoldingsByInstrumentId: new Map([[id,
            standing.coverUnits('COMMODITY_FUTURE', 'a', companyPartyKey(c.id), comm.id, termKey)]]),
          demandByInstrumentId,
        });
      });

      // The speculators: the macro funds and the banks' own desks, whose reservation is the carry
      // bound — above it they would rather own the physical, which is the same statement the
      // arbitrage makes from the other side.
      const macroFunds = ctx.updatedInstitutionalEntities.filter(
        (e) => !e.isDefaulted && (hedgeFundStrategyProfile(e)?.tradesCommodityFutures ?? false)
      );
      macroFunds.forEach((fund) => {
        const capacityLocal = Math.max(0, fund.equityCapitalLocal) / FUTURES_TENOR_MONTHS.length;
        if (!(capacityLocal > 0)) return;
        participants.push({
          id: fund.id,
          currentHoldingsByInstrumentId: new Map(),
          demandByInstrumentId: new Map([[id, {
            reservationStat: carryBound,
            maxHoldingLocal: unitsToLimit({ kind: 'INSTITUTION', id: fund.id }, capacityLocal / Math.max(0.01, spot)),
            fullSizeStatRange: Math.max(0.01, carryBound - spot),
          }]]),
        });
      });

      if (participants.length === 0) return;

      const result = clearFinancialAsset(instruments, participants, {
        // Bilateral between named hedgers, desks and funds; nobody stands between them yet.
      });
      const clearedPrice = takePrint(ctx, result, id, 'commodity future');
      if (clearedPrice === undefined || !(clearedPrice > 0)) return;

      // ---- 3. THE PRICE, and what it implies. `futures1M/3M/6M` were spot times a constant; they
      // are what this book cleared at, and the convenience yield is now INFERRED from the curve
      // rather than the number the curve was drawn from. ----
      if (tenorMonths === 1) comm.futures1M = Number(clearedPrice.toFixed(2));
      if (tenorMonths === 3) comm.futures3M = Number(clearedPrice.toFixed(2));
      if (tenorMonths === 6) {
        comm.futures6M = Number(clearedPrice.toFixed(2));
        comm.convenienceYield = Number(impliedConvenienceYield({
          spotPrice: spot, futuresPrice: clearedPrice, financingRateAnnual, storageCostAnnual, tenorYears,
        }).toFixed(4));
      }

      // ---- 4. Strike the week's contracts: each new long draws from each seller in proportion to
      // what that seller brought, the same fungible-supply allocation the CDS book uses. ----
      // The participant by id (the first of a name, as the linear search it replaces found it).
      const participantById = new Map<string, ClearingParticipant>();
      for (const p of participants) if (!participantById.has(p.id)) participantById.set(p.id, p);
      const boughtByParticipant = new Map<string, number>();
      let totalBoughtUnits = 0;
      result.newParticipantHoldings.forEach((byInstrument, participantId) => {
        const prior = participantById.get(participantId)?.currentHoldingsByInstrumentId.get(id) ?? 0;
        const delta = (byInstrument.get(id) ?? 0) - prior;
        if (delta <= 0.0001) return;
        boughtByParticipant.set(participantId, delta);
        totalBoughtUnits += delta;
      });
      if (totalBoughtUnits <= 0.0001) return;
      const fillShare = Math.min(1, totalBoughtUnits / Math.max(1e-9, floatUnits));
      const strike = Number(clearedPrice.toFixed(2));

      boughtByParticipant.forEach((units, participantId) => {
        // §3.13-BOOK (c2b): see cds.ts — a participant id is its own space.
        const consumerId = participantId.startsWith('CONS-')
          ? consumerIdOfTicker(asTicker(participantId.slice('CONS-'.length))) : undefined;
        const longParty: DerivativeParty = consumerId !== undefined
          ? companyPartyOf(consumerId)
          : { kind: 'INSTITUTION', id: asEntityId(participantId) };
        sellers.forEach((s) => {
          const size = units * ((s.units * fillShare) / Math.max(1e-9, totalBoughtUnits));
          if (size <= 0.0001) return;
          const sizeUnits = Number(size.toFixed(4));
          struck.push(withInitialMargin({
            id: `${id}-${week}-${seq++}`,
            classId: 'COMMODITY_FUTURE',
            regionId: 'USA',
            a: longParty,
            b: s.party,
            notional: sizeUnits * strike,
            strike,
            reference: { kind: 'COMMODITY', commodityId: comm.id },
            termKey,
            units: sizeUnits,
            settledMarkLocal: 0,
            // §3.13c: commodities are quoted in the numeraire, which is what `regionId: 'USA'` was standing in for.
            currency: NUMERAIRE,
            struckWeek: week,
            maturityWeek: week + Math.round(tenorMonths * (52 / 12)),
          }, view));
        });
      });
    });
  });

  // §3.17-v-i: the house admits what each member can margin, then the contracts stand and post.
  const admitted = admitToHouse(ctx, struck, view);
    strikeDerivatives(ctx, admitted);
    admitted.forEach((c) => postInitialMargin(ctx, c));
  // The standing book then marks at the week's fresh prints (the stage settles this class AFTER
  // the market): every open position's move settles in cash between its two named parties, a
  // contract in its delivery week settles to spot and closes, a dead counterparty closes out.
}

export const COMMODITY_FUTURE_MARKET: DerivativeMarket = {
  classId: 'COMMODITY_FUTURE',
  phase: 'CLEARING',
  settles: 'AFTER_MARKET',
  run: runCommodityFuturesMarket,
};
