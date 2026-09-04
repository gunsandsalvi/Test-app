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
  SecurityLoan, loanWeeklyFeeLocal, loanOneWeekGap, lendingReservationFeeBps, shortSizeShares,
  stockLoanNetLocal,
} from '../../../domain/securities-lending';
import { WeeklyStepContext } from './context';
import { pay, institutionSpendableLocal } from './settlement';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { entityRequiredReturn, maxOverweightMultipleOf, fullSizeSpreadRangeBpsOf } from './asset-allocation';
import { fairValuePerShare, companyBookEquityLocal, companyNetInvestmentRate } from '../../equity-valuation';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import { wireHoldingMove } from '../../ledger/holdings-ledger';
import { realizedAnnualVol } from '../../../domain/volatility';
import { FULL_SIZE_PRICE_DISCOUNT } from './07e-equity-clearing';
import { medianOf } from '../../../domain/volatility';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { marketCapOf } from '../../../domain/company';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';
import { cashOf } from '../../ledger/accounts';
import type { InstrumentId } from '../../../domain/ids';
import { sblInstrumentId, equityInstrumentId, equityIssuerId } from '../../../domain/instrument-keys';
import { ladderTotalLocal } from '../../../engine2/tranches';
import type { EntityId } from '../../../domain/ids';
import { asInstrumentId, isKnownEntity } from '../../../domain/ids';

export const positionKey = (entityId: EntityId, companyId: EntityId) => `${entityId}|${companyId}`;


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
    const companyById = new Map<EntityId, Company>(listed.map((c) => [c.id, c]));
    // A company that has left the register entirely still has to be found, to close the loans
    // written against it.
    const anyCompanyById = new Map<EntityId, Company>(
      [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].map((c) => [c.id, c])
    );

    // What every entity can DELIVER today, swept ONCE. The store is walked per entity, not per
    // (entity, name) pair — the same discipline 07e keeps, and the difference between one pass
    // over the rows and one pass per name in the book.
    const sharesByEntity = new Map<EntityId, Map<EntityId, number>>();
    ctx.updatedInstitutionalEntities.forEach((e) => {
      const byName = new Map<EntityId, number>();
      store.scan(e.id, 'EQUITY', (h) => {
        // §3.13-BOOK (c2b): an EQUITY row's instrument id is its issuer's — the crossing.
        const issuerId = equityIssuerId(h.instrumentId);
        const comp = companyById.get(issuerId);
        if (!comp) return false;
        const shares = h.quantityShares ?? h.quantityOrNotionalLocal / Math.max(0.01, comp.stockPrice);
        byName.set(issuerId, (byName.get(issuerId) ?? 0) + shares);
        return false; // read-only: 07e claims these rows, not this stage
      });
      sharesByEntity.set(e.id, byName);
    });
    const deliverable = (entityId: EntityId, companyId: EntityId): number =>
      sharesByEntity.get(entityId)?.get(companyId) ?? 0;
    /** Move shares on the ledger AND in this stage's view of it, so both stay one fact. */
    const deliver = (fromId: EntityId, toId: EntityId, companyId: EntityId, shares: number, price: number) => {
      // THE DELIVERY IS AN INSTRUCTION. Both sides used to be written straight onto the store
      // with no wire, so shares moved between two books with nothing naming the move — the last
      // path in the tree that still did. The rows are the store's to write inside its window, so
      // the wire is emitted beside them rather than through `transferHolding`, which would write
      // them a second time.
      wireHoldingMove(
        { kind: 'INSTITUTION', id: fromId }, { kind: 'INSTITUTION', id: toId },
        { instrumentType: 'EQUITY', instrumentId: equityInstrumentId(companyId), issuerRegion: regionId, valueLocal: shares * price, shares },
        'stock loan: shares delivered'
      );
      store.addShares(fromId, 'EQUITY', equityInstrumentId(companyId), regionId, -shares, price);
      store.addShares(toId, 'EQUITY', equityInstrumentId(companyId), regionId, shares, price);
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
      const loanIssuerId = equityIssuerId(loan.instrumentId);
      const comp = companyById.get(loanIssuerId);
      const issuer = comp ?? anyCompanyById.get(loanIssuerId);
      // The name is gone or defaulted. The lender was long it the whole time — that is what
      // lending means — so it takes the loss, the collateral goes back, and the shares the
      // borrower owes are worth nothing to return.
      if (!comp || !issuer || issuer.isDefaulted) {
        if (loan.collateralLocal > 0) {
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: loan.lender.id },
            payee: { kind: 'INSTITUTION', id: loan.borrower.id },
            amount: loan.collateralLocal,
            // The collateral is denominated in the money the shares were quoted in. This branch
            // is the one where the issuer is GONE — de-listed, or a name the company table no
            // longer carries. §3.13c: the loan says what it is denominated in, so there is
            // nothing to re-derive here — this read the issuer's region in the very branch whose
            // condition is that there may be no issuer, and that `!` threw in week 5.
            currency: loan.currency,
            reason: 'stock loan closed on credit event',
          });
        }
        return;
      }

      const feeLocal = loanWeeklyFeeLocal(loan, comp.stockPrice);
      if (feeLocal > 0) {
        pay(ctx, {
          payer: { kind: 'INSTITUTION', id: loan.borrower.id },
          payee: { kind: 'INSTITUTION', id: loan.lender.id },
          amount: feeLocal,
          currency: loan.currency,
          reason: 'stock borrow fee',
        });
      }

      // VARIATION MARGIN. Collateral secures shares whose price moves, so it is re-marked to the
      // shares every week and the difference is paid — the borrower tops up when the name rises,
      // the lender returns the excess when it falls. Struck once at the market value on the day
      // and never touched again, the collateral drifted away from what it secured and a squeeze
      // cost nobody anything: the lender's protection eroded exactly as the borrower's position
      // moved against it, and `stockLoanNetLocal` was an unfunded statistic.
      const markedLocal = loan.shares * comp.stockPrice;
      const marginCallLocal = markedLocal - loan.collateralLocal;
      if (Math.abs(marginCallLocal) > 1) {
        pay(ctx, marginCallLocal > 0
          ? {
            payer: { kind: 'INSTITUTION', id: loan.borrower.id },
            payee: { kind: 'INSTITUTION', id: loan.lender.id },
            amount: marginCallLocal,
            currency: loan.currency,
            reason: 'stock loan variation margin',
          }
          : {
            payer: { kind: 'INSTITUTION', id: loan.lender.id },
            payee: { kind: 'INSTITUTION', id: loan.borrower.id },
            amount: -marginCallLocal,
            currency: loan.currency,
            reason: 'stock loan variation margin returned',
          });
        loan.collateralLocal = markedLocal;
      }

      // A recalled borrower that has managed to buy the shares back delivers them and is out.
      if (loan.recalledWeek !== undefined) {
        const have = deliverable(loan.borrower.id, loanIssuerId);
        if (have >= loan.shares - 0.0001) {
          // It delivers what it HOLDS. The test above accepts a borrower a whisker short so a
          // loan does not hang on a fraction of a share, but handing over the loan's full size
          // out of a position that does not cover it moves shares that are not there.
          deliver(loan.borrower.id, loan.lender.id, loanIssuerId, Math.min(loan.shares, have), comp.stockPrice);
          if (loan.collateralLocal > 0) {
            pay(ctx, {
              payer: { kind: 'INSTITUTION', id: loan.lender.id },
              payee: { kind: 'INSTITUTION', id: loan.borrower.id },
              amount: loan.collateralLocal,
              currency: loan.currency,
              reason: 'stock loan collateral returned',
            });
          }
          return;
        }
        // Still short of the shares: the obligation stands, and it is a purchase at any price.
        const k = positionKey(loan.borrower.id, loanIssuerId);
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
      const k = positionKey(l.lender.id, equityIssuerId(l.instrumentId));
      lentByPair.set(k, (lentByPair.get(k) ?? 0) + l.shares);
      strikeByPair.set(k, Math.max(strikeByPair.get(k) ?? 0, l.lenderPositionAtStrike));
    });
    const soldByLender = new Map<string, number>();
    live.forEach((l) => {
      const k = positionKey(l.lender.id, equityIssuerId(l.instrumentId));
      if (soldByLender.has(k)) return;
      const positionNow = deliverable(l.lender.id, equityIssuerId(l.instrumentId)) + (lentByPair.get(k) ?? 0);
      soldByLender.set(k, Math.max(0, (strikeByPair.get(k) ?? 0) - positionNow));
    });
    live.forEach((loan) => {
      if (loan.recalledWeek !== undefined) { carried.push(loan); return; }
      const loanIssuerId = equityIssuerId(loan.instrumentId);
      const k = positionKey(loan.lender.id, loanIssuerId);
      const deficit = soldByLender.get(k) ?? 0;
      if (deficit <= 0.0001) { carried.push(loan); return; }
      const recalledShares = Math.min(loan.shares, deficit);
      soldByLender.set(k, deficit - recalledShares);
      const bk = positionKey(loan.borrower.id, loanIssuerId);
      ctx.buyInSharesByBorrower.set(bk, (ctx.buyInSharesByBorrower.get(bk) ?? 0) + recalledShares);
      const share = recalledShares / loan.shares;
      carried.push({
        ...loan,
        id: `${loan.id}-R`,
        shares: recalledShares,
        collateralLocal: loan.collateralLocal * share,
        recalledWeek: ctx.nextWeek,
      });
      if (loan.shares - recalledShares > 0.0001) {
        carried.push({
          ...loan,
          shares: loan.shares - recalledShares,
          collateralLocal: loan.collateralLocal * (1 - share),
        });
      }
    });

    const priceOf = (instrumentId: string) => companyById.get(equityIssuerId(asInstrumentId(instrumentId)))?.stockPrice ?? 0;
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
    const totalFloatValueLocal = listed.reduce((s, c) => s + (floatValueById.get(c.id) ?? 0), 0) || 1;
    const bookEquityById = new Map(listed.map((c) => [c.id, companyBookEquityLocal(c, cashOf(ctx.v2, c), ladderTotalLocal(ctx.v2, c.id))]));
    const netInvestmentRateById = new Map(listed.map((c) => [c.id, companyNetInvestmentRate(c)]));
    const riskFreeRate = reg.zeroRates?.tenor10Y ?? 0.04;

    const shortFunds = ctx.updatedInstitutionalEntities.filter(
      (e) => e.region === regionId && !e.isDefaulted
        && (hedgeFundStrategyProfile(e)?.shortsEquity ?? false)
    );
    const borrowDemandByCompany = new Map<EntityId, { fundId: EntityId; shares: number }[]>();
    shortFunds.forEach((fund) => {
      const mandate = mandateWeightForIssuer(fund.entityType, fund.region, regionId, mcapByRegion);
      if (!(mandate > 0)) return;
      const poolLocal = institutionTotalAssetsLocal(ctx, fund) * fund.assetAllocationTarget.equityPct * mandate;
      if (!(poolLocal > 0)) return;
      const requiredReturn = entityRequiredReturn(fund, institutionTotalAssetsLocal(ctx, fund));
      // A short is collateralised at the market value on the day it is struck, so a fund cannot
      // put on more of one than it can fund — its own cash, what this week's settlement already
      // owes it, and whatever its prime broker still has open to it.
      let fundableLocal = institutionSpendableLocal(ctx, fund) + Math.max(0, fund.primeBrokerageAvailableLocal ?? 0);
      const wants: { companyId: EntityId; shares: number }[] = [];
      listed.forEach((c) => {
        const fair = c.isDefaulted ? 0 : fairValuePerShare({
          annualEarningsLocal: c.netIncome,
          sharesOutstanding: c.sharesOutstanding,
          bookEquityLocal: bookEquityById.get(c.id) ?? 0,
          netInvestmentRate: netInvestmentRateById.get(c.id) ?? 0,
          riskFreeRate,
          beta: c.beta ?? 1,
          holderRequiredReturn: requiredReturn,
        });
        const structuralShares = (poolLocal * ((floatValueById.get(c.id) ?? 0) / totalFloatValueLocal))
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
          equityIssuerId(l.instrumentId) === c.id && l.borrower.id === fund.id ? a + l.shares : a), 0);
        const incremental = wantShares - already;
        if (incremental > 0) wants.push({ companyId: c.id, shares: incremental });
      });
      // Dearest conviction first, until the collateral runs out — the same money can only
      // collateralise one of them.
      wants.sort((a, b) => (b.shares * (companyById.get(b.companyId)?.stockPrice ?? 0))
        - (a.shares * (companyById.get(a.companyId)?.stockPrice ?? 0)));
      wants.forEach((w) => {
        const price = companyById.get(w.companyId)!.stockPrice;
        const affordableShares = Math.min(w.shares, fundableLocal / Math.max(0.01, price));
        if (!(affordableShares > 0)) return;
        fundableLocal -= affordableShares * price;
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
        outstandingLocal: demandShares,
        tradableFloatLocal: demandShares,
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

    const lentAlreadyByEntity = new Map<EntityId, Map<EntityId, number>>();
    carried.forEach((l) => {
      const byName = lentAlreadyByEntity.get(l.lender.id) ?? new Map<EntityId, number>();
      const lentIssuerId = equityIssuerId(l.instrumentId);
      byName.set(lentIssuerId, (byName.get(lentIssuerId) ?? 0) + l.shares);
      lentAlreadyByEntity.set(l.lender.id, byName);
    });

    // §3.13-BOOK (c2b): every participant in this book IS an institution, and this set is what
    // proves it when a fill comes back keyed by the clearing engine's own participant id —
    // which is a DIFFERENT space (a desk's is `<ticker>::DESK`) and stays a plain string until
    // slice (c2c) reaches the stages.
    const lenderIds = new Set(ctx.updatedInstitutionalEntities.map((e) => e.id));
    const participants: ClearingParticipant[] = [];
    ctx.updatedInstitutionalEntities.forEach((entity) => {
      if (entity.isDefaulted) return;
      const requiredReturn = entityRequiredReturn(entity, institutionTotalAssetsLocal(ctx, entity));
      const alreadyLent = lentAlreadyByEntity.get(entity.id) ?? new Map<EntityId, number>();
      const current = new Map<InstrumentId, number>();
      const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>();
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
          maxHoldingLocal: held + lent,
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

    const result = clearFinancialAsset(instruments, participants, {
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

      const newLendingByLender = new Map<EntityId, number>();
      let totalNewShares = 0;
      result.newParticipantHoldings.forEach((byInstrument, participantId) => {
        if (!isKnownEntity(lenderIds, participantId)) return;
        const lenderId = participantId;
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
      const positionAtStrike = new Map<EntityId, number>();
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
          // A FUND CANNOT BORROW ITS OWN SHARES. It already holds them, and the demand was
          // spread across every lender including the borrower itself: a self-loan posted
          // collateral to itself, paid itself a fee, and delivered shares from a book to the
          // same book. That cancelled silently until the delivery became a wire and the ledger
          // refused a move from a party to itself. Its own share of the pool is simply not
          // available to it — the borrower fills less rather than more, because re-spreading
          // that slice over the other lenders would let one of them lend what it does not have.
          if (lenderId === d.fundId) return;
          const shares = borrowedShares * (lenderShares / totalNewShares);
          if (shares <= 0.0001) return;
          const collateralLocal = shares * c.stockPrice;
          // §3.13-READ A5: THE LOAN IS MINTED FIRST, AND THE PAYMENT READS IT. The collateral
          // leg used to say `currencyOf(c.region)` while the record beside it said
          // `currencyOf(regionId)` — two spellings of one fact that agree only because `listed`
          // filters on `c.region === regionId`. The obligation states its money (§3.13c); every
          // leg of it, at strike and for the rest of its life, reads that field.
          const loan: SecurityLoan = {
            id: `${regionId}-SBL-${c.id}-${ctx.nextWeek}-${seq++}`,
            regionId,
            instrumentId: equityInstrumentId(c.id),
            lender: { kind: 'INSTITUTION', id: lenderId },
            borrower: { kind: 'INSTITUTION', id: d.fundId },
            shares,
            feeBps: Number(clearedBps.toFixed(1)),
            currency: currencyOf(regionId),
            collateralLocal,
            lenderPositionAtStrike: positionAtStrike.get(lenderId) ?? shares,
            struckWeek: ctx.nextWeek,
          };
          // The delivery leg: the lender's shares are now in the borrower's hands, and it will
          // sell them in this week's equity auction. The register total is unchanged.
          deliver(lenderId, d.fundId, c.id, shares, c.stockPrice);
          //...and the money leg: cash collateral at the market value, which comes back when the
          // shares do. Without it a lender would simply be handing its assets away.
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: d.fundId },
            payee: { kind: 'INSTITUTION', id: lenderId },
            amount: loan.collateralLocal,
            currency: loan.currency,
            reason: 'stock loan collateral posted',
          });
          struck.push(loan);
        });
      });
    });

    const nextBook = [...carried, ...struck];
    publishBook(ctx, reg, nextBook, lastFee, priceOf);
    // Short interest, as a measurement of the book rather than a number anyone stated.
    borrowNames.forEach((c) => {
      const onLoan = nextBook.reduce((a, l) => (equityIssuerId(l.instrumentId) === c.id ? a + l.shares : a), 0);
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
    e.stockLoanNetLocal = Math.round(stockLoanNetLocal(book, e.id, priceOf));
  });
}

/**
 * What each lender still has out on loan, handed to 07e: exposure it holds through a receivable
 * rather than a deliverable share, so its holding ceiling there comes down by it instead of
 * sending it out to buy back what it has just lent.
 */
function publishLent(ctx: WeeklyStepContext, book: SecurityLoan[]): void {
  book.forEach((l) => {
    const k = positionKey(l.lender.id, equityIssuerId(l.instrumentId));
    ctx.lentSharesByLender.set(k, (ctx.lentSharesByLender.get(k) ?? 0) + l.shares);
  });
}
