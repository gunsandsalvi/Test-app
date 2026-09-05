import { entityCashOf, bankReservesOf } from '../../ledger/accounts';
import { primeBrokerageBookOf, publishPrimeBrokerageBook } from '../../ledger/contract-ledger';
import { bankBookAssetsLocal } from '../../desk-register';
import type { EntityId } from '../../../domain/ids';
import { buildEntityIndex } from '../../ledger/entity-index';
import { bankPartyOf, bankSecuritiesParty, bankSecuritiesPartyOf } from '../../../domain/party';
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
import { measuredWeeklyMove, medianOf } from '../../../domain/volatility';
import { ringFill, rowOf, typeOf } from '../../../engine2/world';
import { bookHeadOf } from '../../../engine2/holdings';
import { computeSovereignRepoHaircuts } from './repo-clearing';
import { PrimeBrokerageLine, maxDrawnLocal, drawnByFund, lentByBroker } from '../../../domain/prime-brokerage';
import { issuerSpreadAtOnCurve } from '../../credit-price';
import { WeeklyStepContext, updateBankSheet } from './context';
import { pay, institutionUnsettledLessCollateralLocal } from './settlement';
import { leverageHeadroomLocal } from '../../macro/banking';
import { bankRequiredReturnAnnual, quoteLoanMarginBps } from './bank-lending';
import { WHOLESALE_FUNDING_SPREAD_BPS } from '../../../domain/banking';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';
import { trancheIdOf, facilityBookOf, ladderRowsOf } from '../../../engine2/tranches';
import { weeklyPriceMoveOf } from '../../../engine2/prices';
import { materializeGovLadder } from '../../../engine2/tranches';
import { sovereignTenorResolver } from '../../../domain/government';

/**
 * The haircut a broker takes on each kind of collateral: the move that market has been measured
 * to make in one week. It is the same reasoning the repo desk's sovereign haircuts use — the
 * repricing a lender must assume before it could sell — read off the market rather than posted,
 * so a broker's protection is tied to the market it would have to sell into.
 * Sovereign paper is the exception: it is the collateral the repo book already prices, and its
 * haircut is derived there from that bucket's own observed volatility.
 */
/**
 * §5-CLOSE (user, 2026-09-02): THERE IS NO CAP TO READ A HAIRCUT OFF. A broker protects itself by
 * the move it has MEASURED the collateral make: equity, twice the region's median realised
 * weekly price move (the price ring); credit, twice the median realised weekly PRICE move of the
 * region's own bonds; sovereigns, the repo desk's blended protection. A collateral class with no
 * history yet has no measured move, and the broker lends against it unprotected — which is what a
 * broker with no history does, and what week 1 is.
 *
 * §3.13: the credit leg used to be a SPREAD move times a five-year duration plus the sovereign
 * haircut for the rate leg — three steps to reach a number the bonds themselves now print. A
 * bond's cleared price already contains its rate leg and its own duration, so the move it made is
 * the protection the broker needs, with no assumed duration and no add-on.
 */
function measuredHaircutsFor(ctx: WeeklyStepContext, regionId: RegionId, reg: Region): Record<string, number> {
  const v2 = ctx.v2;
  const scratch: number[] = [];
  const names = ctx.updatedCompanies.filter((c) => c.region === regionId && !c.isDefaulted && !c.isBankEntity);
  const priceMoves = names.filter((c) => c.listingStatus !== 'PRIVATE')
    .map((c) => measuredWeeklyMove(ringFill(v2.priceRing, rowOf(v2, c.id), scratch))).filter((v): v is number => v !== undefined);
  // Every bond of every name in the region, at the move its own price made last week.
  const creditPriceMoves: number[] = [];
  names.forEach((c) => {
    for (const r of ladderRowsOf(v2, c.id)) {
      if (!(v2.tranches.principalLocal[r] > 0)) continue;
      const move = weeklyPriceMoveOf(v2, trancheIdOf(v2, r));
      if (move !== undefined) creditPriceMoves.push(move);
    }
  });
  // §3.13-SOV row 3: the broker's SCHEDULE is per asset class, so it needs one sovereign number
  // — the face-weighted haircut of the region's actual ladder, rather than the average of four
  // bucket labels or the five-year one standing in for the class.
  const sovLadder = materializeGovLadder(v2, regionId);
  const sovHaircutOf = computeSovereignRepoHaircuts(reg, sovereignTenorResolver(sovLadder, ctx.nextWeek));
  let sovFaceLocal = 0, sovWeightedLocal = 0;
  sovLadder.forEach((t) => {
    const h = sovHaircutOf(t.id);
    if (h === undefined || !(t.principalLocal > 0)) return;
    sovFaceLocal += t.principalLocal; sovWeightedLocal += t.principalLocal * h;
  });
  const sovBlended = sovFaceLocal > 0 ? sovWeightedLocal / sovFaceLocal : 0;
  const equity = 2 * (medianOf(priceMoves) ?? 0);
  const credit = 2 * (medianOf(creditPriceMoves) ?? 0);
  return { EQUITY: equity, CORP_BOND: credit, LEVERAGED_LOAN: credit, GOV_BOND: sovBlended, DEFAULT: Math.max(equity, credit, sovBlended) };
}

export function runPrimeBrokerageStage(state: GameState, ctx: WeeklyStepContext): void {
  // §3.13-BOOK (c-then-3b): `homeBankId` names the broker in the ENTITY space, so it is a lookup.
  const { companyById } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  void state;
  const v2 = ctx.v2;
  const H = v2.holdings;
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    // §3.13-BOOK d4c-iv: the store's rows.
    const priorBook: PrimeBrokerageLine[] = primeBrokerageBookOf(ctx.v2, regionId);
    const haircuts = measuredHaircutsFor(ctx, regionId, reg);

    // ---- Last week's financing, paid. Real money from the fund to the broker that lent it. ----
    priorBook.forEach((line) => {
      const interestLocal = (line.drawnLocal * line.rateAnnual) / 52;
      if (!(interestLocal > 0)) return;
      pay(ctx, {
        payer: { kind: 'INSTITUTION', id: line.fundId },
        payee: bankPartyOf(line.brokerId),
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
      // §3.13-BOOK (c-then-3b): the broker is a LOOKUP on `homeBankId`, not a full scan of every
      // company per fund. The `bankBalanceSheet` test stays at the site: an index is a lookup and
      // a filter is a claim, and here the claim is that a broker must have a book to lend from.
      const brokerCandidate = fund.homeBankId ? companyById.get(fund.homeBankId) : undefined;
      const broker = brokerCandidate?.bankBalanceSheet ? brokerCandidate : undefined;
      const brokerId = broker?.ticker;
      const drawnLocal = drawnByFund(priorBook, fund.id);
      if (!broker || !brokerId) {
        // No broker, no leverage. The fund has to repay what it has drawn.
        if (drawnLocal > 0) {
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: fund.id },
            payee: bankSecuritiesPartyOf(priorBook.find((l) => l.fundId === fund.id)!.brokerId),
            amount: drawnLocal,
            currency: currencyOf(fund.region),
            reason: 'prime brokerage repayment',
          });
        }
        return;
      }
      const sheet = ctx.companyUpdates[brokerId]?.bankBalanceSheet ?? broker.bankBalanceSheet!;

      // The haircut on THIS fund's book: its own asset mix at each market's own one-week move,
      // widened by how concentrated the book is. A concentrated position is not just riskier, it
      // is slower to sell, and the broker is the one who would have to sell it.
      let bookLocal = 0;
      let weightedHaircutLocal = 0;
      let largestLocal = 0;
      // §3.13-BOOK d1: THE ROWS — the fund's register, read at the source (this pass runs before
      // the clearing store opens, so it is the week's opening book either way).
      for (let r = bookHeadOf(v2, fund.id); r >= 0; r = H.next[r]) {
        const usd = Math.max(0, H.qtyLocal[r]);
        if (usd <= 0) continue;
        bookLocal += usd;
        weightedHaircutLocal += usd * (haircuts[typeOf(v2, H.typeRef[r])] ?? haircuts.DEFAULT);
        if (usd > largestLocal) largestLocal = usd;
      }
      const baseHaircut = bookLocal > 0 ? weightedHaircutLocal / bookLocal : haircuts.DEFAULT;
      const concentration = bookLocal > 0 ? largestLocal / bookLocal : 1;
      const haircutRate = Math.min(1, baseHaircut * (1 + concentration));

      // What the fund's OWN capital supports at that haircut, and what the broker can carry.
      const fundEquityLocal = Math.max(0, institutionTotalAssetsLocal(ctx, fund) - drawnLocal);
      const brokerRoomLocal = Math.max(0, leverageHeadroomLocal(sheet, bankReservesOf(ctx.v2, broker.id), facilityBookOf(ctx.v2, broker.id), bankBookAssetsLocal(ctx.v2, broker.id))) + lentByBroker(priorBook, broker.id);
      const lineLocal = Math.min(maxDrawnLocal(fundEquityLocal, haircutRate), brokerRoomLocal);

      // The price: what the broker's own money costs it, plus the return it needs on the capital
      // the exposure consumes. The uncollateralised sliver IS the haircut, so that is the weight.
      // §3.13: the front of the broker's OWN credit curve — a margin line is financed on the
      // shortest money the broker itself can raise.
      const brokerSpreadBps = issuerSpreadAtOnCurve(ctx.v2, reg, broker.id, ctx.nextWeek, 1 / 52)?.spreadBps
        ?? WHOLESALE_FUNDING_SPREAD_BPS;
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
      const sleeveTargetLocal = Math.max(0, fund.assetAllocationTarget?.cashPct ?? 0) * Math.max(0, institutionTotalAssetsLocal(ctx, fund));
      const cashGapLocal = sleeveTargetLocal - Math.max(0, entityCashOf(ctx.v2, fund));
      const targetDrawnLocal = Math.max(0, Math.min(lineLocal, drawnLocal + cashGapLocal));
      const deltaLocal = targetDrawnLocal - drawnLocal;
      if (Math.abs(deltaLocal) > 1) {
        if (deltaLocal > 0) {
          pay(ctx, {
            payer: bankSecuritiesParty(broker),
            payee: { kind: 'INSTITUTION', id: fund.id },
            amount: deltaLocal,
            currency: currencyOf(fund.region),
            reason: 'prime brokerage drawdown',
          });
        } else {
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: fund.id },
            payee: bankSecuritiesParty(broker),
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
        e.id === fund.id ? { ...e, primeBrokerageAvailableLocal: Math.max(0, lineLocal - targetDrawnLocal) } : e
      );
      if (targetDrawnLocal > 1) {
        nextBook.push({
          id: `${regionId}-PB-${fund.id}`,
          regionId,
          brokerId: broker.id,
          fundId: fund.id,
          drawnLocal: Math.round(targetDrawnLocal),
          haircutRate: Number(haircutRate.toFixed(4)),
          rateAnnual: Number(rateAnnual.toFixed(6)),
          struckWeek: ctx.nextWeek,
        });
      }
    });

    publishPrimeBrokerageBook(ctx.v2, regionId, nextBook); // §3.13-BOOK d4b: the contract ledger's door

    // The brokers' asset line, derived from the book — one writer, the G2 pattern.
    const brokerIds = new Set(nextBook.map((l) => l.brokerId));
    priorBook.forEach((l) => brokerIds.add(l.brokerId));
    brokerIds.forEach((bankId) => {
      // §3.13-BOOK (c-then-3b): a line names its broker by ENTITY id; a lookup, not a scan.
      const company = companyById.get(bankId);
      if (!company?.bankBalanceSheet) return;
      const ticker = company.ticker;
      const sheet = ctx.companyUpdates[ticker]?.bankBalanceSheet ?? company.bankBalanceSheet;
      updateBankSheet(ctx, ticker, {
        ...sheet,
        primeBrokerageLoansLocal: Math.round(lentByBroker(nextBook, bankId)),
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
  // §3.13-BOOK (c-then-3b): `homeBankId` names the broker in the ENTITY space, so it is a lookup.
  const { companyById } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    // §3.13-BOOK d4c-iv: the lines are the store's; the sweep moves a COPY and publishes it back.
    const book: PrimeBrokerageLine[] = primeBrokerageBookOf(ctx.v2, regionId).map((l) => ({ ...l }));
    const drawnByBroker = new Map<EntityId, number>();
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((fund) => {
      if (fund.region !== regionId || fund.entityType !== 'HEDGE_FUND' || fund.isDefaulted) return fund;
      const broker = fund.homeBankId ? companyById.get(fund.homeBankId) : undefined;
      if (!broker) return fund;
      const brokerBankId = broker.id;
      // §1.19: the SIGNED figure, because this is an overdraft test and the clamped
      // `institutionSpendableLocal` would report every fund as solvent. The collateral it is only
      // holding is netted here for the first time: a fund sitting on stock-loan collateral looked
      // funded by exactly that much, so its draw was short by the same amount.
      const cashPlusPendingLocal = entityCashOf(ctx.v2, fund)
        + institutionUnsettledLessCollateralLocal(ctx, fund.id);
      if (cashPlusPendingLocal >= -1) return fund;
      const drawLocal = Math.min(fund.primeBrokerageAvailableLocal ?? 0, -cashPlusPendingLocal);
      if (drawLocal <= 1) return fund;
      pay(ctx, {
        payer: bankSecuritiesParty(broker),
        payee: { kind: 'INSTITUTION', id: fund.id },
        amount: drawLocal,
        currency: currencyOf(fund.region),
        reason: 'prime brokerage drawdown',
      });
      const line = book.find((l) => l.fundId === fund.id);
      if (line) {
        line.drawnLocal = Math.round(line.drawnLocal + drawLocal);
      } else {
        book.push({
          id: `${regionId}-PB-${fund.id}`,
          regionId,
          brokerId: broker.id,
          fundId: fund.id,
          drawnLocal: Math.round(drawLocal),
          // An emergency draw on a line the morning struck at zero balance carries the standing
          // terms for one week; the next morning's re-strike prices the whole balance properly.
          haircutRate: measuredHaircutsFor(ctx, regionId, reg).DEFAULT,
          rateAnnual: Number((reg.policyRate + WHOLESALE_FUNDING_SPREAD_BPS / 10000).toFixed(6)),
          struckWeek: ctx.nextWeek,
        });
      }
      drawnByBroker.set(brokerBankId, (drawnByBroker.get(brokerBankId) ?? 0) + drawLocal);
      return { ...fund, primeBrokerageAvailableLocal: Math.max(0, (fund.primeBrokerageAvailableLocal ?? 0) - drawLocal) };
    });
    publishPrimeBrokerageBook(ctx.v2, regionId, book);
    if (drawnByBroker.size > 0) {
      // Post-08: the live sheet is the only bank-sheet write that survives (§7.250).
      ctx.updatedCompanies = ctx.updatedCompanies.map((c) => {
        const drawnLocal = drawnByBroker.get(c.id);
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
