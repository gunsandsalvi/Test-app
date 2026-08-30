/**
 * HF1 — the prime brokerage session: a fund's leverage becomes a named bank's loan.
 *
 * The shape of it, and what it replaces, is documented once in domain/prime-brokerage.ts. This is
 * the weekly pass: last week's financing is paid, each fund's line is re-struck against what its
 * book is now worth and what its broker's balance sheet can carry, and the draw moves as real
 * money between two named parties.
 *
 * Runs after 02b (the brokers' sheets are final for the week) and before the clearing books,
 * which read the line as the fund's real purchasing capacity — so a line cut this week is a fund
 * that has to sell in this week's auctions, into the market that just moved against it.
 */

import { GameState, RegionId } from '../../../types';
import { PrimeBrokerageLine, maxDrawnUSD, drawnByFund, lentByBroker } from '../../../domain/prime-brokerage';
import { WeeklyStepContext } from './context';
import { pay } from './settlement';
import { leverageHeadroomUSD } from '../../macro/banking';
import { bankRequiredReturnAnnual, quoteLoanMarginBps } from './bank-lending';
import { WHOLESALE_FUNDING_SPREAD_BPS } from '../../../domain/banking';

/**
 * The haircut a broker takes on each kind of collateral: the most that market's own clearing
 * engine will let the level move in one week. It is the same reasoning the repo desk's sovereign
 * haircuts use — the repricing a lender must assume before it could sell — read off the damper
 * rather than posted, so a broker's protection is tied to the market it would have to sell into.
 * Sovereign paper is the exception: it is the collateral the repo book already prices, and its
 * haircut is derived there from that bucket's own observed volatility.
 */
const COLLATERAL_HAIRCUT: Record<string, number> = {
  EQUITY: 0.18,          // 07e's MAX_WEEKLY_PRICE_MOVE_PCT
  CORP_BOND: 0.25,       // 07b's MAX_WEEKLY_SPREAD_MOVE_PCT, on a book that trades on spread
  LEVERAGED_LOAN: 0.25,  // 07d's
  GOV_BOND: 0.05,        // the repo desk's own blended sovereign protection
};
const DEFAULT_HAIRCUT = 0.25;

export function runPrimeBrokerageStage(state: GameState, ctx: WeeklyStepContext): void {
  void state;
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const priorBook: PrimeBrokerageLine[] = reg.primeBrokerageBook ?? [];

    // ---- Last week's financing, paid. Real money from the fund to the broker that lent it. ----
    priorBook.forEach((line) => {
      const interestUSD = (line.drawnUSD * line.rateAnnual) / 52;
      if (!(interestUSD > 0)) return;
      pay(ctx, {
        payer: { kind: 'INSTITUTION', id: line.fundId },
        payee: { kind: 'BANK', ticker: line.brokerTicker },
        amountUSD: interestUSD,
        reason: 'prime brokerage financing',
      });
    });

    // ---- Re-strike every line against what the book is worth NOW. ----
    const nextBook: PrimeBrokerageLine[] = [];
    const funds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && e.entityType === 'HEDGE_FUND' && !e.isDefaulted
    );
    funds.forEach((fund) => {
      const brokerTicker = fund.homeBankTicker;
      const broker = brokerTicker
        ? ctx.updatedCompanies.find((c) => c.ticker === brokerTicker && c.bankBalanceSheet)
        : undefined;
      const drawnUSD = drawnByFund(priorBook, fund.id);
      if (!broker || !brokerTicker) {
        // No broker, no leverage. The fund has to repay what it has drawn.
        if (drawnUSD > 0) {
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: fund.id },
            payee: { kind: 'BANK_SECURITIES', ticker: priorBook.find((l) => l.fundId === fund.id)!.brokerTicker },
            amountUSD: drawnUSD,
            reason: 'prime brokerage repayment',
          });
        }
        return;
      }
      const sheet = ctx.companyUpdates[brokerTicker]?.bankBalanceSheet ?? broker.bankBalanceSheet!;

      // The haircut on THIS fund's book: its own asset mix at each market's own one-week move,
      // widened by how concentrated the book is. A concentrated position is not just riskier, it
      // is slower to sell, and the broker is the one who would have to sell it.
      let bookUSD = 0;
      let weightedHaircutUSD = 0;
      let largestUSD = 0;
      (fund.itemizedHoldings || []).forEach((h) => {
        const usd = Math.max(0, h.quantityOrNotionalUSD ?? 0);
        if (usd <= 0) return;
        bookUSD += usd;
        weightedHaircutUSD += usd * (COLLATERAL_HAIRCUT[h.instrumentType] ?? DEFAULT_HAIRCUT);
        if (usd > largestUSD) largestUSD = usd;
      });
      const baseHaircut = bookUSD > 0 ? weightedHaircutUSD / bookUSD : DEFAULT_HAIRCUT;
      const concentration = bookUSD > 0 ? largestUSD / bookUSD : 1;
      const haircutRate = Math.min(1, baseHaircut * (1 + concentration));

      // What the fund's OWN capital supports at that haircut, and what the broker can carry.
      const fundEquityUSD = Math.max(0, fund.totalAssetsUSD - drawnUSD);
      const brokerRoomUSD = Math.max(0, leverageHeadroomUSD(sheet)) + lentByBroker(priorBook, brokerTicker);
      const lineUSD = Math.min(maxDrawnUSD(fundEquityUSD, haircutRate), brokerRoomUSD);

      // The price: what the broker's own money costs it, plus the return it needs on the capital
      // the exposure consumes. The uncollateralised sliver IS the haircut, so that is the weight.
      const brokerSpreadBps = broker.oasSpreadBps > 0 ? broker.oasSpreadBps : WHOLESALE_FUNDING_SPREAD_BPS;
      const rateAnnual = reg.policyRate + brokerSpreadBps / 10000
        + quoteLoanMarginBps({
            annualDefaultProbability: 0,
            riskWeight: haircutRate,
            requiredReturnAnnual: bankRequiredReturnAnnual(broker, reg),
          }) / 10000;

      // What the fund actually draws is what a margin account actually finances: its DEBIT
      // BALANCE. The broker sweeps — cash below the fund's own sleeve target is financed, cash
      // above it repays — so a fund that spent its cash on securities last week draws to fund
      // them, and one sitting on cash does not borrow at all. The line is a constraint on that,
      // never a driver of it, which is what a credit line is.
      const sleeveTargetUSD = Math.max(0, fund.assetAllocationTarget?.cashPct ?? 0) * Math.max(0, fund.totalAssetsUSD);
      const cashGapUSD = sleeveTargetUSD - Math.max(0, fund.cashUSD ?? 0);
      const targetDrawnUSD = Math.max(0, Math.min(lineUSD, drawnUSD + cashGapUSD));
      const deltaUSD = targetDrawnUSD - drawnUSD;
      if (Math.abs(deltaUSD) > 1) {
        if (deltaUSD > 0) {
          pay(ctx, {
            payer: { kind: 'BANK_SECURITIES', ticker: brokerTicker },
            payee: { kind: 'INSTITUTION', id: fund.id },
            amountUSD: deltaUSD,
            reason: 'prime brokerage drawdown',
          });
        } else {
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: fund.id },
            payee: { kind: 'BANK_SECURITIES', ticker: brokerTicker },
            amountUSD: -deltaUSD,
            reason: 'prime brokerage repayment',
          });
        }
      }
      // What is left of the line is this fund's purchasing capacity above its own cash — and if
      // the line has been cut below what the sweep needs, there is none and the fund is short,
      // which the clearing books will see as real selling this week.
      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) =>
        e.id === fund.id ? { ...e, primeBrokerageAvailableUSD: Math.max(0, lineUSD - targetDrawnUSD) } : e
      );
      if (targetDrawnUSD > 1) {
        nextBook.push({
          id: `${regionId}-PB-${fund.id}`,
          regionId,
          brokerTicker,
          fundId: fund.id,
          drawnUSD: Number(targetDrawnUSD.toFixed(0)),
          haircutRate: Number(haircutRate.toFixed(4)),
          rateAnnual: Number(rateAnnual.toFixed(6)),
          struckWeek: ctx.nextWeek,
        });
      }
    });

    reg.primeBrokerageBook = nextBook;

    // The brokers' asset line, derived from the book — one writer, the G2 pattern.
    const brokerTickers = new Set(nextBook.map((l) => l.brokerTicker));
    priorBook.forEach((l) => brokerTickers.add(l.brokerTicker));
    brokerTickers.forEach((ticker) => {
      const company = ctx.updatedCompanies.find((c) => c.ticker === ticker && c.bankBalanceSheet);
      if (!company) return;
      const sheet = ctx.companyUpdates[ticker]?.bankBalanceSheet ?? company.bankBalanceSheet!;
      if (!ctx.companyUpdates[ticker]) ctx.companyUpdates[ticker] = {};
      ctx.companyUpdates[ticker].bankBalanceSheet = {
        ...sheet,
        primeBrokerageLoansUSD: Number(lentByBroker(nextBook, ticker).toFixed(0)),
      };
    });
  });
}
