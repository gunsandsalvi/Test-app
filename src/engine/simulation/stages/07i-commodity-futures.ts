/**
 * DER4 — the commodity futures session. The market's shape, and what it replaces, is documented
 * once in domain/commodity-futures.ts.
 *
 * The float is the production the PRODUCERS need to hedge — measured off their own books against
 * the coverage covenant, exactly as 07g measures which corporates have to pay fixed — and the
 * participants are the longs: the firms whose recipes draw the commodity and have the mirror
 * problem, plus the desks that will carry the physical whenever the paper is dear enough to make
 * carrying it free money. Three tenors, the same three the curve has always quoted.
 *
 * Runs after 07-commodities (this week's spot is the number every schedule prices against) and
 * with the other derivative books, so the week's variation margin moves real money before the
 * settlement pass.
 */

import { GameState, Company } from '../../../types';
import {
  FuturesPosition, FuturesParty, FUTURES_TENOR_MONTHS, FuturesTenorMonths,
  PHYSICAL_STORAGE_COST_ANNUAL, costOfCarryPrice, hedgeConcessionPerUnit,
  impliedConvenienceYield, variationMarginUSD,
} from '../../../domain/commodity-futures';
import { COMMODITY_CATEGORY_LINKAGE } from '../../../domain/instruments';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../domain/market-microstructure';
import { WeeklyStepContext } from './context';
import { pay, PartyRef } from './settlement';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { isActiveCompany } from '../../../domain/company';
import { exposureToHedgeUSD } from './corporate-financing';
import { BANK_WORKING_CAPITAL_RATIO } from './bank-lending';
import { EQUITY_RISK_PREMIUM } from '../../equity-valuation';

const contractId = (commodityId: string, tenor: number) => `FUT-${commodityId}-${tenor}M`;

/** A future on a physical is as volatile as the physical; it reprices like the spot beneath it. */
const MAX_WEEKLY_FUTURES_MOVE_PCT = 0.20;

/** A firm's annual interest bill, from the coverage ratio its own statements already carry. */
function annualInterestOf(c: Company): number {
  const coverage = c.interestCoverage;
  if (!(coverage > 0) || !isFinite(coverage)) return 0;
  return Math.max(0, c.ebit) / coverage;
}

const partyRefOf = (p: FuturesParty): PartyRef =>
  p.kind === 'INSTITUTION' ? { kind: 'INSTITUTION', id: p.id }
    : p.kind === 'BANK' ? { kind: 'BANK', ticker: p.ticker }
      : { kind: 'COMPANY', ticker: p.ticker };

export function runCommodityFuturesStage(state: GameState, ctx: WeeklyStepContext): void {
  const book: FuturesPosition[] = ctx.commodityFuturesBook ?? state.commodityFuturesBook ?? [];
  const commodityById = new Map(ctx.updatedCommodities.map((c) => [c.id, c]));
  const firms = ctx.prevActiveFirms.filter(isActiveCompany);
  const firmByTicker = new Map(firms.map((c) => [c.ticker, c]));
  const firmById = new Map(firms.map((c) => [c.id, c]));
  // The USA short rate finances a carry position; it is the one this model quotes globally.
  const financingRateAnnual = ctx.updatedRegions.USA?.zeroRates?.tenor3M ?? 0.03;
  const riskFreeRate = ctx.updatedRegions.USA?.zeroRates?.tenor10Y ?? 0.04;

  // ---- 1. THE STANDING BOOK. Every open position is marked to this week's futures print and the
  // move settles in cash between the two named parties — which is what a future IS: no principal,
  // a daily (here weekly) exchange of the mark. A contract in its delivery week settles to spot
  // and closes, which is the convergence the plan asks the run to verify. ----
  const carried: FuturesPosition[] = [];
  const priorPrints = new Map<string, number>();
  book.forEach((pos) => {
    const comm = commodityById.get(pos.commodityId);
    if (!comm) return; // the commodity is gone; nothing left to settle against
    priorPrints.set(contractId(pos.commodityId, pos.tenorMonths), pos.lastMarkPrice);
    const expiring = pos.deliveryWeek <= ctx.nextWeek;
    // At expiry the mark IS spot — that is what cash settlement means.
    const markPrice = expiring ? comm.spotPrice : pos.lastMarkPrice;
    const marginUSD = variationMarginUSD(pos, markPrice);
    if (Math.abs(marginUSD) > 1) {
      const winner = marginUSD > 0 ? pos.long : pos.short;
      const loser = marginUSD > 0 ? pos.short : pos.long;
      pay(ctx, {
        payer: partyRefOf(loser),
        payee: partyRefOf(winner),
        amountUSD: Math.abs(marginUSD),
        reason: expiring ? 'futures settled to spot' : 'futures variation margin',
      });
    }
    if (expiring) return;
    carried.push({ ...pos, lastMarkPrice: markPrice });
  });

  // ---- 2. WHO HAS TO HEDGE, on each side, measured off real books. ----
  const struck: FuturesPosition[] = [];
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
    const consumerExposureUSD = new Map<string, number>();
    if (linkage) {
      firms.forEach((c) => {
        const spendUSD = (c.productLines || []).reduce((a, line) => {
          const intensity = CATEGORY_INPUT_REQUIREMENTS[line.subUnitId]?.[linkage.subUnitId] ?? 0;
          return a + c.annualRevenue * (line.revenueShare ?? 0) * intensity * linkage.intensityShare;
        }, 0);
        if (spendUSD > 0) consumerExposureUSD.set(c.id, spendUSD);
      });
    }
    if (producers.length === 0 && consumerExposureUSD.size === 0) return;

    FUTURES_TENOR_MONTHS.forEach((tenorMonths) => {
      const tenorYears = tenorMonths / 12;
      const oneSigma = Math.max(0, comm.volatility) * Math.sqrt(tenorYears);
      if (!(oneSigma > 0)) return;
      const id = contractId(comm.id, tenorMonths);

      // How much the producers between them need to lay off, in UNITS: the revenue exposure their
      // covenant headroom cannot absorb, less what they have already sold forward.
      const alreadyShortByTicker = new Map<string, number>();
      const alreadyLongById = new Map<string, number>();
      carried.forEach((p) => {
        if (p.commodityId !== comm.id || p.tenorMonths !== tenorMonths) return;
        if (p.short.kind === 'COMPANY') alreadyShortByTicker.set(p.short.ticker, (alreadyShortByTicker.get(p.short.ticker) ?? 0) + p.units);
        if (p.long.kind === 'COMPANY') {
          const c = firmByTicker.get(p.long.ticker);
          if (c) alreadyLongById.set(c.id, (alreadyLongById.get(c.id) ?? 0) + p.units);
        }
      });

      const sellers: { party: FuturesParty; units: number }[] = [];
      producers.forEach((c) => {
        const forwardRevenueUSD = c.annualRevenue * tenorYears;
        const hedgeUSD = exposureToHedgeUSD({
          exposureUSD: forwardRevenueUSD,
          ebitAnnualUSD: c.ebit,
          interestAnnualUSD: annualInterestOf(c),
          oneSigma,
        });
        const units = hedgeUSD / spot - (alreadyShortByTicker.get(c.ticker) ?? 0);
        if (units > 0.0001) sellers.push({ party: { kind: 'COMPANY', ticker: c.ticker }, units });
      });
      const hedgeFloatUnits = sellers.reduce((a, s) => a + s.units, 0);

      // THE ARBITRAGE. A print above spot-plus-carry is free money to anyone who can hold the
      // physical, so the desks bring supply into it — sized by their own capital, and present only
      // while the bound is actually breached on the print they can see. That is what holds the
      // curve's top: a participant's price, not a bracket (rule 15).
      const carryBound = costOfCarryPrice({ spotPrice: spot, financingRateAnnual, storageCostAnnual, tenorYears });
      const priorPrint = priorPrints.get(id) ?? spot;
      const banks = firms.filter((c) => c.isBankEntity && c.bankBalanceSheet);
      let arbUnits = 0;
      if (priorPrint > carryBound) {
        banks.forEach((bank) => {
          const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
          const capacityUSD = Math.max(0, sheet.bankEquityUSD) / Math.max(0.01, BANK_WORKING_CAPITAL_RATIO);
          const units = capacityUSD / Math.max(0.01, spot) / FUTURES_TENOR_MONTHS.length;
          if (units > 0.0001) {
            sellers.push({ party: { kind: 'BANK', ticker: bank.ticker }, units });
            arbUnits += units;
          }
        });
      }
      const floatUnits = hedgeFloatUnits + arbUnits;
      if (!(floatUnits > 0.0001)) return;

      const instruments: ClearingInstrument[] = [{
        id,
        outstandingUSD: floatUnits,
        tradableFloatUSD: floatUnits,
        currentStat: priorPrint,
        statKind: 'PRICE_LIKE',
        durationYears: tenorYears,
      }];

      // ---- 3. THE LONGS. A consumer pays over expected spot to remove the swing, up to what the
      // unhedged exposure costs it — the mirror of the producer's own concession, one arithmetic
      // with two signs. ----
      const participants: ClearingParticipant[] = [];
      consumerExposureUSD.forEach((spendAnnualUSD, companyId) => {
        const c = firmById.get(companyId);
        if (!c) return;
        const forwardSpendUSD = spendAnnualUSD * tenorYears;
        const hedgeUSD = exposureToHedgeUSD({
          exposureUSD: forwardSpendUSD,
          ebitAnnualUSD: c.ebit,
          interestAnnualUSD: annualInterestOf(c),
          oneSigma,
        });
        if (!(hedgeUSD > 0)) return;
        // Its own cost of capital, the same one the equity book values it at.
        const costOfCapital = riskFreeRate + (c.beta ?? 1) * EQUITY_RISK_PREMIUM;
        const reservation = spot + hedgeConcessionPerUnit({
          spotPrice: spot, annualVol: comm.volatility, costOfCapital, tenorYears,
        });
        const demandByInstrumentId = new Map<string, ParticipantDemand>([[id, {
          reservationStat: reservation,
          maxHoldingUSD: hedgeUSD / spot,
          // Full size once the price is a whole concession below what it would pay — the same
          // distance that sets the reservation, so the schedule has one scale, not two.
          fullSizeStatRange: Math.max(0.01, reservation - spot),
        }]]);
        participants.push({
          id: `CONS-${c.ticker}`,
          currentHoldingsByInstrumentId: new Map([[id, alreadyLongById.get(c.id) ?? 0]]),
          demandByInstrumentId,
        });
      });

      // The speculators: the macro funds and the banks' own desks, whose reservation is the carry
      // bound — above it they would rather own the physical, which is the same statement the
      // arbitrage makes from the other side.
      const macroFunds = ctx.updatedInstitutionalEntities.filter(
        (e) => !e.isDefaulted && e.entityType === 'HEDGE_FUND' && e.hedgeFundStrategy === 'GLOBAL_MACRO'
      );
      macroFunds.forEach((fund) => {
        const capacityUSD = Math.max(0, fund.equityCapitalUSD) / FUTURES_TENOR_MONTHS.length;
        if (!(capacityUSD > 0)) return;
        participants.push({
          id: fund.id,
          currentHoldingsByInstrumentId: new Map(),
          demandByInstrumentId: new Map([[id, {
            reservationStat: carryBound,
            maxHoldingUSD: capacityUSD / Math.max(0.01, spot),
            fullSizeStatRange: Math.max(0.01, carryBound - spot),
          }]]),
        });
      });

      if (participants.length === 0) return;

      const result = clearFinancialAsset(instruments, participants, new Map(), {
        // Bilateral between named hedgers, desks and funds; nobody stands between them yet.
        dealerSpreadBps: 0,
        maxWeeklyStatMovePct: MAX_WEEKLY_FUTURES_MOVE_PCT,
      });
      ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `commodity:${id}`));
      const clearedPrice = result.newStatById.get(id);
      if (clearedPrice === undefined || !(clearedPrice > 0)) return;

      // ---- 4. THE PRICE, and what it implies. `futures1M/3M/6M` were spot times a constant; they
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

      // ---- 5. Strike the week's contracts: each new long draws from each seller in proportion to
      // what that seller brought, the same fungible-supply allocation the CDS book uses. ----
      const boughtByParticipant = new Map<string, number>();
      let totalBoughtUnits = 0;
      result.newParticipantHoldings.forEach((byInstrument, participantId) => {
        const prior = participants.find((p) => p.id === participantId)?.currentHoldingsByInstrumentId.get(id) ?? 0;
        const delta = (byInstrument.get(id) ?? 0) - prior;
        if (delta <= 0.0001) return;
        boughtByParticipant.set(participantId, delta);
        totalBoughtUnits += delta;
      });
      if (totalBoughtUnits <= 0.0001) return;
      const fillShare = Math.min(1, totalBoughtUnits / Math.max(1e-9, floatUnits));

      boughtByParticipant.forEach((units, participantId) => {
        const longParty: FuturesParty = participantId.startsWith('CONS-')
          ? { kind: 'COMPANY', ticker: participantId.slice('CONS-'.length) }
          : { kind: 'INSTITUTION', id: participantId };
        sellers.forEach((s) => {
          const size = units * ((s.units * fillShare) / Math.max(1e-9, totalBoughtUnits));
          if (size <= 0.0001) return;
          struck.push({
            id: `${id}-${ctx.nextWeek}-${seq++}`,
            commodityId: comm.id,
            tenorMonths: tenorMonths as FuturesTenorMonths,
            long: longParty,
            short: s.party,
            units: Number(size.toFixed(4)),
            strikePrice: Number(clearedPrice.toFixed(2)),
            lastMarkPrice: Number(clearedPrice.toFixed(2)),
            struckWeek: ctx.nextWeek,
            deliveryWeek: ctx.nextWeek + Math.round(tenorMonths * (52 / 12)),
          });
        });
      });
    });

    // Every carried position in this commodity now marks at the week's print for its own tenor.
    carried.forEach((p) => {
      if (p.commodityId !== comm.id) return;
      const px = p.tenorMonths === 1 ? comm.futures1M : p.tenorMonths === 3 ? comm.futures3M : comm.futures6M;
      if (px > 0) p.lastMarkPrice = px;
    });
  });

  ctx.commodityFuturesBook = [...carried, ...struck];
}
