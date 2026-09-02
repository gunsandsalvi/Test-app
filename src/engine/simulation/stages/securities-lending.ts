/**
 * HF — the securities-lending session, and the week in the life of an equity SHORT. The shape of
 * the market, and what it replaces, is documented once in domain/securities-lending.ts.
 *
 * Runs immediately BEFORE 07e, because everything a short does happens through the equity book:
 * the shares this stage borrows are in the borrower's hands when that auction opens, so it sells
 * them there into a real bid at a real cleared price, and a recalled borrower's buy-in is a
 * mandated purchase in the same session. The two facts 07e needs — how much of each lender's
 * exposure is now a loan receivable rather than a deliverable share, and who owes a delivery —
 * are handed over on the context.
 *
 * The order within the stage is the order the obligations actually fall due: last week's fees and
 * returns first, then who recalled, then who wants to borrow, then the auction that decides which
 * of them gets to.
 */

import { hedgeFundStrategyProfile } from '../../../domain/institution-profiles';
import { GameState, RegionId, Company } from '../../../types';
import { ensureV2, ringFill, rowOf } from '../../../engine2/world';
import {
  SecurityLoan, loanWeeklyFeeUSD, loanOneWeekGap, lendingReservationFeeBps, shortSizeShares,
  stockLoanNetUSD,
} from '../../../domain/securities-lending';
import { WeeklyStepContext } from './context';
import { pay, institutionSpendableUSD } from './settlement';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { entityRequiredReturn, maxOverweightMultipleOf, fullSizeSpreadRangeBpsOf } from './asset-allocation';
import { fairValuePerShare, companyBookEquityUSD, companyNetInvestmentRate } from '../../equity-valuation';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import { realizedAnnualVol } from '../../../domain/volatility';
import { FULL_SIZE_PRICE_DISCOUNT } from './07e-equity-clearing';
import { medianOf } from '../../../domain/volatility';
import { REGION_IDS } from '../../../domain/geography';
import { marketCapOf } from '../../../domain/company';
import { institutionTotalAssetsUSD } from './institutional-balance-sheet';
import { cashOf } from '../../ledger/accounts';

const sblInstrumentId = (regionId: RegionId, companyId: string) => `${regionId}-SBL-${companyId}`;
export const positionKey = (entityId: string, companyId: string) => `${entityId}|${companyId}`;


const priceScratchSl: number[] = [];

export function runSecuritiesLendingStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2sl = ensureV2(state);
  void state;
  const regionIds = REGION_IDS;
  const store = ctx.holdingsStore!;
  if (!store) return;

  regionIds.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const priorBook: SecurityLoan[] = reg.securityLoanBook ?? [];
    const lastFee: Record<string, number> = reg.borrowFeeBpsByCompanyId ?? {};

    const listed = ctx.prevActiveFirms.filter(
      (c) => c.region === regionId && isActiveCompany(c) && isPubliclyListed(c)
        && c.sharesOutstanding > 0 && c.stockPrice > 0
    );
    const companyById = new Map<string, Company>(listed.map((c) => [c.id, c]));
    // A company that has left the register entirely still has to be found, to close the loans
    // written against it.
    const anyCompanyById = new Map<string, Company>(
      [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].map((c) => [c.id, c])
    );

    // What every entity can DELIVER today, swept ONCE. The store is walked per entity, not per
    // (entity, name) pair — the same discipline 07e keeps, and the difference between one pass
    // over the rows and one pass per name in the book.
    const sharesByEntity = new Map<string, Map<string, number>>();
    ctx.updatedInstitutionalEntities.forEach((e) => {
      const byName = new Map<string, number>();
      store.scan(e.id, 'EQUITY', (h) => {
        const comp = companyById.get(h.instrumentId);
        if (!comp) return false;
        const shares = h.quantityShares ?? h.quantityOrNotionalUSD / Math.max(0.01, comp.stockPrice);
        byName.set(h.instrumentId, (byName.get(h.instrumentId) ?? 0) + shares);
        return false; // read-only: 07e claims these rows, not this stage
      });
      sharesByEntity.set(e.id, byName);
    });
    const deliverable = (entityId: string, companyId: string): number =>
      sharesByEntity.get(entityId)?.get(companyId) ?? 0;
    /** Move shares on the ledger AND in this stage's view of it, so both stay one fact. */
    const deliver = (fromId: string, toId: string, companyId: string, shares: number, price: number) => {
      store.addShares(fromId, 'EQUITY', companyId, regionId, -shares, price);
      store.addShares(toId, 'EQUITY', companyId, regionId, shares, price);
      const from = sharesByEntity.get(fromId);
      if (from) from.set(companyId, (from.get(companyId) ?? 0) - shares);
      const to = sharesByEntity.get(toId);
      if (to) to.set(companyId, (to.get(companyId) ?? 0) + shares);
    };

    // ---- 1. THE STANDING BOOK. Fees fall due, returns settle, and a lender that has sold every
    // share it could still deliver has, by that act, recalled what it lent: it wants none of the
    // name, and the only exposure it has left is the loan. ----
    const carried: SecurityLoan[] = [];
    /** Loans that survived this week's fee and return pass, before recalls are decided. */
    const live: SecurityLoan[] = [];

    priorBook.forEach((loan) => {
      const comp = companyById.get(loan.instrumentId);
      const issuer = comp ?? anyCompanyById.get(loan.instrumentId);
      // The name is gone or defaulted. The lender was long it the whole time — that is what
      // lending means — so it takes the loss, the collateral goes back, and the shares the
      // borrower owes are worth nothing to return.
      if (!comp || !issuer || issuer.isDefaulted) {
        if (loan.collateralUSD > 0) {
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: loan.lender.id },
            payee: { kind: 'INSTITUTION', id: loan.borrower.id },
            amountUSD: loan.collateralUSD,
            reason: 'stock loan closed on credit event',
          });
        }
        return;
      }

      const feeUSD = loanWeeklyFeeUSD(loan, comp.stockPrice);
      if (feeUSD > 0) {
        pay(ctx, {
          payer: { kind: 'INSTITUTION', id: loan.borrower.id },
          payee: { kind: 'INSTITUTION', id: loan.lender.id },
          amountUSD: feeUSD,
          reason: 'stock borrow fee',
        });
      }

      // A recalled borrower that has managed to buy the shares back delivers them and is out.
      if (loan.recalledWeek !== undefined) {
        const have = deliverable(loan.borrower.id, loan.instrumentId);
        if (have >= loan.shares - 0.0001) {
          // It delivers what it HOLDS. The test above accepts a borrower a whisker short so a
          // loan does not hang on a fraction of a share, but handing over the loan's full size
          // out of a position that does not cover it moves shares that are not there.
          deliver(loan.borrower.id, loan.lender.id, loan.instrumentId, Math.min(loan.shares, have), comp.stockPrice);
          if (loan.collateralUSD > 0) {
            pay(ctx, {
              payer: { kind: 'INSTITUTION', id: loan.lender.id },
              payee: { kind: 'INSTITUTION', id: loan.borrower.id },
              amountUSD: loan.collateralUSD,
              reason: 'stock loan collateral returned',
            });
          }
          return;
        }
        // Still short of the shares: the obligation stands, and it is a purchase at any price.
        const k = positionKey(loan.borrower.id, loan.instrumentId);
        ctx.buyInSharesByBorrower.set(k, (ctx.buyInSharesByBorrower.get(k) ?? 0) + loan.shares);
        live.push(loan);
        return;
      }

      live.push(loan);
    });

    // RECALL. Lending does not shrink a lender's position — the shares leave, the exposure does
    // not — so a position BELOW what it was when the loan was struck is the lender selling out
    // from under it, and that much has to come back. Oldest loan first, split where the sale only
    // reaches part of one.
    // Both of these read the whole live book for ONE (lender, name) pair, and both were
    // called once per loan — two O(loans^2) scans a week. The book is summarised in a single pass
    // instead: shares still out on loan, and the largest position any of that pair's loans was
    // struck against. Same numbers, same order of accumulation, one walk.
    const lentByPair = new Map<string, number>();
    const strikeByPair = new Map<string, number>();
    live.forEach((l) => {
      const k = positionKey(l.lender.id, l.instrumentId);
      lentByPair.set(k, (lentByPair.get(k) ?? 0) + l.shares);
      strikeByPair.set(k, Math.max(strikeByPair.get(k) ?? 0, l.lenderPositionAtStrike));
    });
    const soldByLender = new Map<string, number>();
    live.forEach((l) => {
      const k = positionKey(l.lender.id, l.instrumentId);
      if (soldByLender.has(k)) return;
      const positionNow = deliverable(l.lender.id, l.instrumentId) + (lentByPair.get(k) ?? 0);
      soldByLender.set(k, Math.max(0, (strikeByPair.get(k) ?? 0) - positionNow));
    });
    live.forEach((loan) => {
      if (loan.recalledWeek !== undefined) { carried.push(loan); return; }
      const k = positionKey(loan.lender.id, loan.instrumentId);
      const deficit = soldByLender.get(k) ?? 0;
      if (deficit <= 0.0001) { carried.push(loan); return; }
      const recalledShares = Math.min(loan.shares, deficit);
      soldByLender.set(k, deficit - recalledShares);
      const bk = positionKey(loan.borrower.id, loan.instrumentId);
      ctx.buyInSharesByBorrower.set(bk, (ctx.buyInSharesByBorrower.get(bk) ?? 0) + recalledShares);
      const share = recalledShares / loan.shares;
      carried.push({
        ...loan,
        id: `${loan.id}-R`,
        shares: recalledShares,
        collateralUSD: loan.collateralUSD * share,
        recalledWeek: ctx.nextWeek,
      });
      if (loan.shares - recalledShares > 0.0001) {
        carried.push({
          ...loan,
          shares: loan.shares - recalledShares,
          collateralUSD: loan.collateralUSD * (1 - share),
        });
      }
    });

    const priceOf = (companyId: string) => companyById.get(companyId)?.stockPrice ?? 0;
    if (listed.length === 0) {
      publishBook(ctx, reg, carried, lastFee, priceOf);
      return;
    }

    // ---- 2. WHO WANTS TO BE SHORT. The mirror of the long schedule the same funds already run:
    // a fund takes full short size at the same distance ABOVE its own fair value that it takes
    // full long size below it. The disagreement about value that gives the equity book its slope
    // is the whole of it — read from the other end. ----
    const mcapByRegion: Record<string, number> = {};
    (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
      mcapByRegion[r] = ctx.prevActiveFirms
        .filter((c) => c.region === r).reduce((a, c) => a + Math.max(0, marketCapOf(c) ?? 0), 0);
    });
    const floatValueById = new Map(listed.map((c) => [c.id, c.sharesOutstanding * c.stockPrice]));
    const totalFloatValueUSD = listed.reduce((s, c) => s + (floatValueById.get(c.id) ?? 0), 0) || 1;
    const bookEquityById = new Map(listed.map((c) => [c.id, companyBookEquityUSD(c, cashOf(ctx.v2, c))]));
    const netInvestmentRateById = new Map(listed.map((c) => [c.id, companyNetInvestmentRate(c)]));
    const riskFreeRate = reg.zeroRates?.tenor10Y ?? 0.04;

    const shortFunds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && !e.isDefaulted
        && (hedgeFundStrategyProfile(e)?.shortsEquity ?? false)
    );
    const borrowDemandByCompany = new Map<string, { fundId: string; shares: number }[]>();
    shortFunds.forEach((fund) => {
      const mandate = mandateWeightForIssuer(fund.entityType, fund.region, regionId, mcapByRegion);
      if (!(mandate > 0)) return;
      const poolUSD = institutionTotalAssetsUSD(ctx, fund) * fund.assetAllocationTarget.equityPct * mandate;
      if (!(poolUSD > 0)) return;
      const requiredReturn = entityRequiredReturn(fund, institutionTotalAssetsUSD(ctx, fund));
      // A short is collateralised at the market value on the day it is struck, so a fund cannot
      // put on more of one than it can fund — its own cash, what this week's settlement already
      // owes it, and whatever its prime broker still has open to it.
      let fundableUSD = institutionSpendableUSD(ctx, fund) + Math.max(0, fund.primeBrokerageAvailableUSD ?? 0);
      const wants: { companyId: string; shares: number }[] = [];
      listed.forEach((c) => {
        const fair = c.isDefaulted ? 0 : fairValuePerShare({
          annualEarningsUSD: c.netIncome,
          sharesOutstanding: c.sharesOutstanding,
          bookEquityUSD: bookEquityById.get(c.id) ?? 0,
          netInvestmentRate: netInvestmentRateById.get(c.id) ?? 0,
          riskFreeRate,
          beta: c.beta ?? 1,
          holderRequiredReturn: requiredReturn,
        });
        const structuralShares = (poolUSD * ((floatValueById.get(c.id) ?? 0) / totalFloatValueUSD))
          / Math.max(0.01, c.stockPrice);
        const wantShares = shortSizeShares({
          pricePerShare: c.stockPrice,
          fairValuePerShare: fair,
          structuralShares,
          maxOverweightMultiple: maxOverweightMultipleOf(fund),
          fullSizeDiscount: FULL_SIZE_PRICE_DISCOUNT,
        });
        // What it is already short stays short; this is the INCREMENT it wants on top.
        const already = carried.reduce((a, l) => (
          l.instrumentId === c.id && l.borrower.id === fund.id ? a + l.shares : a), 0);
        const incremental = wantShares - already;
        if (incremental > 0) wants.push({ companyId: c.id, shares: incremental });
      });
      // Dearest conviction first, until the collateral runs out — the same money can only
      // collateralise one of them.
      wants.sort((a, b) => (b.shares * (companyById.get(b.companyId)?.stockPrice ?? 0))
        - (a.shares * (companyById.get(a.companyId)?.stockPrice ?? 0)));
      wants.forEach((w) => {
        const price = companyById.get(w.companyId)!.stockPrice;
        const affordableShares = Math.min(w.shares, fundableUSD / Math.max(0.01, price));
        if (!(affordableShares > 0)) return;
        fundableUSD -= affordableShares * price;
        const list = borrowDemandByCompany.get(w.companyId) ?? [];
        list.push({ fundId: fund.id, shares: affordableShares });
        borrowDemandByCompany.set(w.companyId, list);
      });
    });

    // ---- 3. THE AUCTION. The float is the borrow demand; the participants are the holders who
    // will lend, and their position in this book is what they have out on loan. Priced in SHARES,
    // like the equity book it sits beside. ----
    const borrowNames = listed.filter((c) => (borrowDemandByCompany.get(c.id)?.length ?? 0) > 0);
    if (borrowNames.length === 0) {
      publishBook(ctx, reg, carried, lastFee, priceOf);
      return;
    }

    // The book's measured median weekly move stands in for a name with no history.
    const volById = new Map(borrowNames.map((c) => [c.id, realizedAnnualVol(ringFill(v2sl.priceRing, rowOf(v2sl, c.id), priceScratchSl), 26)]));
    const bookWeeklyMove = (medianOf(Array.from(volById.values()).filter((v): v is number => v !== undefined)) ?? 0) / Math.sqrt(52);
    const gapByCompanyId = new Map(borrowNames.map((c) => [c.id, loanOneWeekGap({
      annualVol: volById.get(c.id),
      bookWeeklyMove,
    })]));

    const instruments: ClearingInstrument[] = borrowNames.map((c) => {
      const demandShares = (borrowDemandByCompany.get(c.id) ?? []).reduce((a, d) => a + d.shares, 0);
      return {
        id: sblInstrumentId(regionId, c.id),
        outstandingUSD: demandShares,
        tradableFloatUSD: demandShares,
        currentStat: Math.max(1, lastFee[c.id] ?? 0) || 1,
        statKind: 'YIELD_LIKE',
        durationYears: 1 / 52,
      };
    });
    // A name with no prior print opens at what the cheapest possible lender would need — the
    // book's own arithmetic, not a stated general-collateral rate.
    instruments.forEach((inst, i) => {
      if (lastFee[borrowNames[i].id] === undefined) {
        inst.currentStat = Math.max(1, lendingReservationFeeBps({
          requiredReturn: riskFreeRate,
          oneWeekGap: gapByCompanyId.get(borrowNames[i].id) ?? bookWeeklyMove,
        }));
      }
    });

    const lentAlreadyByEntity = new Map<string, Map<string, number>>();
    carried.forEach((l) => {
      const byName = lentAlreadyByEntity.get(l.lender.id) ?? new Map<string, number>();
      byName.set(l.instrumentId, (byName.get(l.instrumentId) ?? 0) + l.shares);
      lentAlreadyByEntity.set(l.lender.id, byName);
    });

    const participants: ClearingParticipant[] = [];
    ctx.updatedInstitutionalEntities.forEach((entity) => {
      if (entity.isDefaulted) return;
      const requiredReturn = entityRequiredReturn(entity, institutionTotalAssetsUSD(ctx, entity));
      const alreadyLent = lentAlreadyByEntity.get(entity.id) ?? new Map<string, number>();
      const current = new Map<string, number>();
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      borrowNames.forEach((c) => {
        const held = deliverable(entity.id, c.id);
        const lent = alreadyLent.get(c.id) ?? 0;
        if (held <= 0.0001 && lent <= 0.0001) return;
        const instrumentId = sblInstrumentId(regionId, c.id);
        if (lent > 0) current.set(instrumentId, lent);
        demandByInstrumentId.set(instrumentId, {
          // What the loan costs it to carry: the capital the one-week gap consumes, at its own
          // required return. A volatile name is dearer to borrow without anyone saying so.
          reservationStat: lendingReservationFeeBps({
            requiredReturn,
            oneWeekGap: gapByCompanyId.get(c.id) ?? bookWeeklyMove,
          }),
          // Its whole inventory is lendable — the shares it can deliver plus what it has out.
          maxHoldingUSD: held + lent,
          fullSizeStatRange: fullSizeSpreadRangeBpsOf(entity),
        });
      });
      if (demandByInstrumentId.size === 0) return;
      participants.push({ id: entity.id, currentHoldingsByInstrumentId: current, demandByInstrumentId });
    });

    if (participants.length === 0) {
      publishBook(ctx, reg, carried, lastFee, priceOf);
      return;
    }

    const result = clearFinancialAsset(instruments, participants, new Map(), {
      // Bilateral between named holders and named funds; no dealer stands between them.
      dealerSpreadBps: 0,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `stock loan:${id}`));

    // ---- 4. STRIKE. At one cleared fee the lenders are fungible, so each borrower draws from
    // each of them in proportion to what that lender put up. A borrow the auction does not fill is
    // a LOCATE that failed — the short simply does not happen, which is what makes a hard-to-
    // borrow name hard to be short of. ----
    const struck: SecurityLoan[] = [];
    let seq = 0;
    borrowNames.forEach((c) => {
      const instrumentId = sblInstrumentId(regionId, c.id);
      const clearedBps = result.newStatById.get(instrumentId);
      if (clearedBps === undefined) return;
      lastFee[c.id] = Number(clearedBps.toFixed(1));

      const newLendingByLender = new Map<string, number>();
      let totalNewShares = 0;
      result.newParticipantHoldings.forEach((byInstrument, lenderId) => {
        const nowLent = byInstrument.get(instrumentId) ?? 0;
        const wasLent = lentAlreadyByEntity.get(lenderId)?.get(c.id) ?? 0;
        const delta = nowLent - wasLent;
        if (delta <= 0.0001) return;
        // It can only lend what it can still deliver.
        const capped = Math.min(delta, deliverable(lenderId, c.id));
        if (capped <= 0.0001) return;
        newLendingByLender.set(lenderId, capped);
        totalNewShares += capped;
      });
      if (totalNewShares <= 0.0001) return;
      // The lender's whole position in the name BEFORE any of this week's deliveries, captured
      // once: lending it out again must not look like a sale next week.
      const positionAtStrike = new Map<string, number>();
      newLendingByLender.forEach((_shares, lenderId) => {
        positionAtStrike.set(lenderId,
          deliverable(lenderId, c.id) + (lentAlreadyByEntity.get(lenderId)?.get(c.id) ?? 0));
      });

      const demands = borrowDemandByCompany.get(c.id) ?? [];
      const totalWantedShares = demands.reduce((a, d) => a + d.shares, 0);
      const fillShare = Math.min(1, totalNewShares / Math.max(1e-9, totalWantedShares));
      demands.forEach((d) => {
        const borrowedShares = d.shares * fillShare;
        if (borrowedShares <= 0.0001) return;
        newLendingByLender.forEach((lenderShares, lenderId) => {
          const shares = borrowedShares * (lenderShares / totalNewShares);
          if (shares <= 0.0001) return;
          const collateralUSD = shares * c.stockPrice;
          // The delivery leg: the lender's shares are now in the borrower's hands, and it will
          // sell them in this week's equity auction. The register total is unchanged.
          deliver(lenderId, d.fundId, c.id, shares, c.stockPrice);
          // ...and the money leg: cash collateral at the market value, which comes back when the
          // shares do. Without it a lender would simply be handing its assets away.
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: d.fundId },
            payee: { kind: 'INSTITUTION', id: lenderId },
            amountUSD: collateralUSD,
            reason: 'stock loan collateral posted',
          });
          struck.push({
            id: `${regionId}-SBL-${c.id}-${ctx.nextWeek}-${seq++}`,
            regionId,
            instrumentId: c.id,
            lender: { kind: 'INSTITUTION', id: lenderId },
            borrower: { kind: 'INSTITUTION', id: d.fundId },
            shares,
            feeBps: Number(clearedBps.toFixed(1)),
            collateralUSD,
            lenderPositionAtStrike: positionAtStrike.get(lenderId) ?? shares,
            struckWeek: ctx.nextWeek,
          });
        });
      });
    });

    const nextBook = [...carried, ...struck];
    publishBook(ctx, reg, nextBook, lastFee, priceOf);
    // Short interest, as a measurement of the book rather than a number anyone stated.
    borrowNames.forEach((c) => {
      const onLoan = nextBook.reduce((a, l) => (l.instrumentId === c.id ? a + l.shares : a), 0);
      c.shortInterestShares = Number(onLoan.toFixed(2));
    });
  });
}

/**
 * The week's book, written where every reader of it looks: the region carries the contracts, 07e
 * gets the two facts it needs from them, each party carries its own netted position, and short
 * interest per name is a measurement of the same book.
 */
function publishBook(
  ctx: WeeklyStepContext,
  reg: { securityLoanBook?: SecurityLoan[]; borrowFeeBpsByCompanyId?: Record<string, number> },
  book: SecurityLoan[],
  fees: Record<string, number>,
  priceOf: (instrumentId: string) => number
): void {
  reg.securityLoanBook = book;
  reg.borrowFeeBpsByCompanyId = fees;
  publishLent(ctx, book);
  const parties = new Set<string>();
  book.forEach((l) => { parties.add(l.lender.id); parties.add(l.borrower.id); });
  ctx.updatedInstitutionalEntities.forEach((e) => {
    if (!parties.has(e.id)) return;
    e.stockLoanNetUSD = Math.round(stockLoanNetUSD(book, e.id, priceOf));
  });
}

/**
 * What each lender still has out on loan, handed to 07e: exposure it holds through a receivable
 * rather than a deliverable share, so its holding ceiling there comes down by it instead of
 * sending it out to buy back what it has just lent.
 */
function publishLent(ctx: WeeklyStepContext, book: SecurityLoan[]): void {
  book.forEach((l) => {
    const k = positionKey(l.lender.id, l.instrumentId);
    ctx.lentSharesByLender.set(k, (ctx.lentSharesByLender.get(k) ?? 0) + l.shares);
  });
}
