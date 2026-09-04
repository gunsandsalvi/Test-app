import { entityCashOf, bankReservesOf } from '../../ledger/accounts';
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

import { GameState, RegionId, Region } from '../../../types';
import { currencyOf } from '../../../domain/geography';
import { measuredWeeklyMove, measuredWeeklyBpsMove, medianOf } from '../../../domain/volatility';
import { ringFill, rowOf } from '../../../engine2/world';
import { computeSovereignRepoHaircuts } from './repo-clearing';
import { PrimeBrokerageLine, maxDrawnUSD, drawnByFund, lentByBroker } from '../../../domain/prime-brokerage';
import { WeeklyStepContext, updateBankSheet } from './context';
import { pay, pendingSettlementUSD } from './settlement';
import { leverageHeadroomLocal } from '../../macro/banking';
import { bankRequiredReturnAnnual, quoteLoanMarginBps } from './bank-lending';
import { WHOLESALE_FUNDING_SPREAD_BPS } from '../../../domain/banking';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';
import { facilityBookOf } from '../../../engine2/tranches';
import { materializeGovLadder } from '../../../engine2/tranches';
import { sovereignTenorResolver } from '../../../domain/government';

/**
 * The haircut a broker takes on each kind of collateral: the most that market's own clearing
 * engine will let the level move in one week. It is the same reasoning the repo desk's sovereign
 * haircuts use — the repricing a lender must assume before it could sell — read off the damper
 * rather than posted, so a broker's protection is tied to the market it would have to sell into.
 * Sovereign paper is the exception: it is the collateral the repo book already prices, and its
 * haircut is derived there from that bucket's own observed volatility.
 */
/**
 * §5-CLOSE (user, 2026-09-02): THERE IS NO CAP TO READ A HAIRCUT OFF. A broker protects itself by
 * the move it has MEASURED the collateral make: equity, twice the region's median realised
 * weekly price move (the price ring); credit, twice the median realised weekly spread move in
 * bps over a five-year duration (the OAS ring) plus the repo desk's own five-year sovereign
 * haircut for the rate leg; sovereigns, the repo desk's blended protection. A collateral class
 * with no history yet has no measured move, and the broker lends against it unprotected —
 * which is what a broker with no history does, and what week 1 is.
 */
const CREDIT_COLLATERAL_DURATION_YEARS = 5;
function measuredHaircutsFor(ctx: WeeklyStepContext, regionId: RegionId, reg: Region): Record<string, number> {
  const v2 = ctx.v2;
  const scratch: number[] = [];
  const names = ctx.updatedCompanies.filter((c) => c.region === regionId && !c.isDefaulted && !c.isBankEntity);
  const priceMoves = names.filter((c) => c.listingStatus !== 'PRIVATE')
    .map((c) => measuredWeeklyMove(ringFill(v2.priceRing, rowOf(v2, c.id), scratch))).filter((v): v is number => v !== undefined);
  const spreadMovesBps = names
    .map((c) => measuredWeeklyBpsMove(ringFill(v2.oasRing, rowOf(v2, c.id), scratch))).filter((v): v is number => v !== undefined);
  // §3.13-SOV row 3: the broker's SCHEDULE is per asset class, so it needs one sovereign number
  // — the face-weighted haircut of the region's actual ladder, rather than the average of four
  // bucket labels or the five-year one standing in for the class.
  const sovLadder = materializeGovLadder(v2, regionId);
  const sovHaircutOf = computeSovereignRepoHaircuts(reg, sovereignTenorResolver(sovLadder, ctx.nextWeek));
  let sovFaceUSD = 0, sovWeightedUSD = 0;
  sovLadder.forEach((t) => {
    const h = sovHaircutOf(t.id);
    if (h === undefined || !(t.principalLocal > 0)) return;
    sovFaceUSD += t.principalLocal; sovWeightedUSD += t.principalLocal * h;
  });
  const sovBlended = sovFaceUSD > 0 ? sovWeightedUSD / sovFaceUSD : 0;
  const equity = 2 * (medianOf(priceMoves) ?? 0);
  const credit = 2 * ((medianOf(spreadMovesBps) ?? 0) / 10000) * CREDIT_COLLATERAL_DURATION_YEARS + sovBlended;
  return { EQUITY: equity, CORP_BOND: credit, LEVERAGED_LOAN: credit, GOV_BOND: sovBlended, DEFAULT: Math.max(equity, credit, sovBlended) };
}

export function runPrimeBrokerageStage(state: GameState, ctx: WeeklyStepContext): void {
  void state;
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const priorBook: PrimeBrokerageLine[] = reg.primeBrokerageBook ?? [];
    const haircuts = measuredHaircutsFor(ctx, regionId, reg);

    // ---- Last week's financing, paid. Real money from the fund to the broker that lent it. ----
    priorBook.forEach((line) => {
      const interestLocal = (line.drawnLocal * line.rateAnnual) / 52;
      if (!(interestLocal > 0)) return;
      pay(ctx, {
        payer: { kind: 'INSTITUTION', id: line.fundId },
        payee: { kind: 'BANK', ticker: line.brokerTicker },
        amount: interestLocal,
        currency: currencyOf(line.regionId),
        reason: 'prime brokerage financing',
      });
    });

    // ---- Re-strike every line against what the book is worth NOW. ----
    const nextBook: PrimeBrokerageLine[] = [];
    // §5-CLOSE M5: EVERY fund with a line is re-struck, not only the hedge funds. The close sweep
    // (M4) lends to a fund of any kind that spent money it did not have; the morning pass used
    // to rebuild the book from the hedge funds alone, so every other fund's line VANISHED the
    // next morning — the broker's asset fell by the draw (M5: eleven sheets not closing), and
    // the fund kept the money for nothing (a creator). A line is a line: it is re-struck, repaid
    // from cash above the sleeve, and priced, whoever the borrower is.
    const withLine = new Set(priorBook.map((l) => l.fundId));
    const funds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && !e.isDefaulted && (e.entityType === 'HEDGE_FUND' || withLine.has(e.id))
    );
    funds.forEach((fund) => {
      const brokerTicker = fund.homeBankTicker;
      const broker = brokerTicker
        ? ctx.updatedCompanies.find((c) => c.ticker === brokerTicker && c.bankBalanceSheet)
        : undefined;
      const drawnLocal = drawnByFund(priorBook, fund.id);
      if (!broker || !brokerTicker) {
        // No broker, no leverage. The fund has to repay what it has drawn.
        if (drawnLocal > 0) {
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: fund.id },
            payee: { kind: 'BANK_SECURITIES', ticker: priorBook.find((l) => l.fundId === fund.id)!.brokerTicker },
            amount: drawnLocal,
            currency: currencyOf(fund.region),
            reason: 'prime brokerage repayment',
          });
        }
        return;
      }
      const sheet = ctx.companyUpdates[brokerTicker]?.bankBalanceSheet ?? broker.bankBalanceSheet!;

      // The haircut on THIS fund's book: its own asset mix at each market's own one-week move,
      // widened by how concentrated the book is. A concentrated position is not just riskier, it
      // is slower to sell, and the broker is the one who would have to sell it.
      let bookLocal = 0;
      let weightedHaircutUSD = 0;
      let largestUSD = 0;
      (fund.itemizedHoldings || []).forEach((h) => {
        const usd = Math.max(0, h.quantityOrNotionalLocal ?? 0);
        if (usd <= 0) return;
        bookLocal += usd;
        weightedHaircutUSD += usd * (haircuts[h.instrumentType] ?? haircuts.DEFAULT);
        if (usd > largestUSD) largestUSD = usd;
      });
      const baseHaircut = bookLocal > 0 ? weightedHaircutUSD / bookLocal : haircuts.DEFAULT;
      const concentration = bookLocal > 0 ? largestUSD / bookLocal : 1;
      const haircutRate = Math.min(1, baseHaircut * (1 + concentration));

      // What the fund's OWN capital supports at that haircut, and what the broker can carry.
      const fundEquityUSD = Math.max(0, institutionTotalAssetsLocal(ctx, fund) - drawnLocal);
      const brokerRoomUSD = Math.max(0, leverageHeadroomLocal(sheet, bankReservesOf(ctx.v2, brokerTicker), facilityBookOf(ctx.v2, brokerTicker))) + lentByBroker(priorBook, brokerTicker);
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
      const sleeveTargetUSD = Math.max(0, fund.assetAllocationTarget?.cashPct ?? 0) * Math.max(0, institutionTotalAssetsLocal(ctx, fund));
      const cashGapUSD = sleeveTargetUSD - Math.max(0, entityCashOf(ctx.v2, fund));
      const targetDrawnUSD = Math.max(0, Math.min(lineUSD, drawnLocal + cashGapUSD));
      const deltaLocal = targetDrawnUSD - drawnLocal;
      if (Math.abs(deltaLocal) > 1) {
        if (deltaLocal > 0) {
          pay(ctx, {
            payer: { kind: 'BANK_SECURITIES', ticker: brokerTicker },
            payee: { kind: 'INSTITUTION', id: fund.id },
            amount: deltaLocal,
            currency: currencyOf(fund.region),
            reason: 'prime brokerage drawdown',
          });
        } else {
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: fund.id },
            payee: { kind: 'BANK_SECURITIES', ticker: brokerTicker },
            amount: -deltaLocal,
            currency: currencyOf(fund.region),
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
          drawnLocal: Math.round(targetDrawnUSD),
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
      updateBankSheet(ctx, ticker, {
        ...sheet,
        primeBrokerageLoansLocal: Math.round(lentByBroker(nextBook, ticker)),
      });
    });
  });
}

/**
 * §4.0 Tier 1 item 6 — THE CLOSE-CYCLE SWEEP. A margin account finances its debit the day it
 * appears, not a week later. The morning pass above deliberately sweeps LAST week's spend; a
 * fund that levered into this week's auctions then sat with a naked negative balance until the
 * next morning — the harness's whole 'fund spending money it does not have' family for the
 * leveraged funds (measured: ABBG bought 7.5B of loans on 5.1B cash the week its line
 * re-struck, closed at −4.6B, and the drawdown arrived the following week). This pass runs
 * before the settlement close: a fund whose cash-plus-pending is negative draws the shortfall
 * against its remaining line, on the standing terms the morning pass struck (the next morning
 * re-prices the whole balance), and the broker's asset line moves on the live sheet.
 */
export function runPrimeBrokerageCloseSweep(ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const book: PrimeBrokerageLine[] = reg.primeBrokerageBook ?? [];
    const drawnByBroker = new Map<string, number>();
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((fund) => {
      if (fund.region !== regionId || fund.entityType !== 'HEDGE_FUND' || fund.isDefaulted) return fund;
      const brokerTicker = fund.homeBankTicker;
      if (!brokerTicker) return fund;
      const cashPlusPendingUSD = entityCashOf(ctx.v2, fund)
        + pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: fund.id });
      if (cashPlusPendingUSD >= -1) return fund;
      const drawUSD = Math.min(fund.primeBrokerageAvailableUSD ?? 0, -cashPlusPendingUSD);
      if (drawUSD <= 1) return fund;
      pay(ctx, {
        payer: { kind: 'BANK_SECURITIES', ticker: brokerTicker },
        payee: { kind: 'INSTITUTION', id: fund.id },
        amount: drawUSD,
        currency: currencyOf(fund.region),
        reason: 'prime brokerage drawdown',
      });
      const line = book.find((l) => l.fundId === fund.id);
      if (line) {
        line.drawnLocal = Math.round(line.drawnLocal + drawUSD);
      } else {
        book.push({
          id: `${regionId}-PB-${fund.id}`,
          regionId,
          brokerTicker,
          fundId: fund.id,
          drawnLocal: Math.round(drawUSD),
          // An emergency draw on a line the morning struck at zero balance carries the standing
          // terms for one week; the next morning's re-strike prices the whole balance properly.
          haircutRate: measuredHaircutsFor(ctx, regionId, reg).DEFAULT,
          rateAnnual: Number((reg.policyRate + WHOLESALE_FUNDING_SPREAD_BPS / 10000).toFixed(6)),
          struckWeek: ctx.nextWeek,
        });
      }
      drawnByBroker.set(brokerTicker, (drawnByBroker.get(brokerTicker) ?? 0) + drawUSD);
      return { ...fund, primeBrokerageAvailableUSD: Math.max(0, (fund.primeBrokerageAvailableUSD ?? 0) - drawUSD) };
    });
    reg.primeBrokerageBook = book;
    if (drawnByBroker.size > 0) {
      // Post-08: the live sheet is the only bank-sheet write that survives (§7.250).
      ctx.updatedCompanies = ctx.updatedCompanies.map((c) => {
        const drawnLocal = drawnByBroker.get(c.ticker);
        if (!drawnLocal || !c.bankBalanceSheet) return c;
        return {
          ...c,
          bankBalanceSheet: {
            ...c.bankBalanceSheet,
            primeBrokerageLoansLocal: Math.round((c.bankBalanceSheet.primeBrokerageLoansLocal ?? 0) + drawnLocal),
          },
        };
      });
    }
  });
}
