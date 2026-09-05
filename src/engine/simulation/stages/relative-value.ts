/**
 * §3.17e-ii-a — THE RELATIVE-VALUE BOOK'S WEEK. Before any book opens, each `RELATIVE_VALUE`
 * fund reads the registry of comparables (`domain/relative-value.ts`) off last week's prints,
 * sizes each pair by its edge net of carry against what its cash and its broker's line carry,
 * and states BOTH legs on the context: the market that clears each leg reads it there (07c for a
 * sovereign cash leg, the bond futures line for the future leg) and the fund bids or offers in
 * that book like any other participant — at the leg's price, in the leg's size. The book's
 * position is never stored here: it is the fund's rows in the sovereign register and its cover
* in the standing derivatives book (rule 19), and each week's legs are what moves those to the
 * target — up when the edge is there, DOWN when it has gone (§3.17e-ii-b): a reduction sells the
 * deliverable and buys the line back to target at what the books clear; a pair the line no
 * longer carries, or that has lost what its future leg was margined for, is cut whole at any
 * price. That is the limit to arbitrage, and why a basis can persist. The first comparable is
 * the bond basis, in BOTH directions (§3.17e-iii-a): a cheap future is long the line and short
 * the cash, and a cash leg below what the book holds sells what it has and states the rest as a
 * borrow need for the lending book. The second comparable (§3.17f-i) is the CDS–cash basis: the
 * name's own rung against protection on it, the bond long on the line and the cover bought.
 *
 * Runs after prime-brokerage (the line the cash leg is financed on is struck) and before 07b.
 */

import { GameState, RegionId } from '../../../types';
import type { InstitutionalEntity } from '../../../domain/institutions';
import type { DerivativeContract } from '../../../domain/derivatives/contract';
import type { StandingBook } from '../../../domain/derivatives/standing-book';
import type { DerivativeLifecycleView } from './derivative-lifecycle';
import { WeeklyStepContext } from './context';
import { REGION_IDS } from '../../../domain/geography';
import { institutionPartyKey } from '../../../domain/derivatives/contract';
import { initialMarginRateOf } from '../../../domain/derivatives/registry';
import { BOND_FUTURE_TERM_KEY, nextDeliveryWeek, bondDurationYears, bondFutureWeeklyMoveOf } from '../../../domain/derivatives/classes/bond-future';
import { bondFutureInstrumentId } from '../../../domain/instrument-keys';
import { bondBasisRead, bondBasisMirrorRead, bondBasisLegs, cdsBasisRead, cdsBasisLegs, edgeBps, arbTargetShare, arbSizeShare, arbCapacityLocal, pairPnLLocal, stoppedOut } from '../../../domain/relative-value';
import { asInstrumentId } from '../../../domain/ids';
import { trancheClearedPricePerFace, trancheTerms, rowSpreadBps, priceAtSpreadOnTranche, IS_BOND_ROW } from '../../credit-price';
import { ladderRowsOf, trancheIdOf } from '../../../engine2/tranches';
import { bookRowsOf, instrumentIdAt, rowUnits, rowBasisLocal as rowBasisOf } from '../../../engine2/holdings';
import { CDS_BENCHMARK_TENOR, CDS_TENOR_YEARS, cdsTenorWeeksOf } from '../../../domain/derivatives/classes/cds';
import { cdsInstrumentId } from '../../../domain/instrument-keys';
import { isActiveCompany } from '../../../domain/company';
import { sovereignRowsOf } from '../../sovereign-register';
import { primeBrokerageBookOf, derivativesBookOf, securityLoanBookOf } from '../../ledger/contract-ledger';
import { sharesOnLoan, stockLoanNetLocal } from '../../../domain/securities-lending';
import { rowBasisLocal } from '../../../engine2/holdings';
import { entityCashOf } from '../../ledger/accounts';
import { buildDerivativeMarketView, standingBookOf } from './derivative-lifecycle';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';
import { entityRequiredReturn } from './asset-allocation';

export function runRelativeValueStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.relativeValueLegs = [];
  ctx.borrowNeeds = [];
  const funds = ctx.updatedInstitutionalEntities.filter((e) => e.entityType === 'HEDGE_FUND' && e.hedgeFundStrategy === 'RELATIVE_VALUE' && !e.isDefaulted);
  if (funds.length === 0) return;
  const view = buildDerivativeMarketView(ctx);
  const standing = standingBookOf(ctx, state);
  const book = derivativesBookOf(ctx);
  const week = ctx.nextWeek;
  readBondBasis(ctx, funds, view, standing, book, week);
  readCdsBasis(ctx, funds, view, standing, book, week);
}

/** §3.17f-i — THE CDS–CASH BASIS: every name in the fund's region with a protection print and a
 *  cash rung near the benchmark tenor. Future-rich only in its cash direction: the bond long is
 *  financed on the line; the mirror needs a corporate bond borrow (§3 step 17f-v). */
function readCdsBasis(ctx: WeeklyStepContext, funds: InstitutionalEntity[], view: DerivativeLifecycleView, standing: StandingBook, book: DerivativeContract[], week: number): void {
  REGION_IDS.forEach((regionId: RegionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const regionFunds = funds.filter((f) => f.region === regionId);
    if (regionFunds.length === 0) return;
    const pbBook = primeBrokerageBookOf(ctx.v2, regionId);
    const repoRateAnnual = view.overnightRateAnnual(regionId);
    const tenorYears = CDS_TENOR_YEARS[CDS_BENCHMARK_TENOR];
    ctx.updatedCompanies.forEach((issuer) => {
      if (issuer.region !== regionId || !isActiveCompany(issuer) || issuer.isBankEntity || !(issuer.cdsSpreadBps > 0)) return;
      // THE RUNG: the issuer's own bond nearest the benchmark tenor, with a print and a spread.
      let rung: number | undefined; let gap = Number.POSITIVE_INFINITY;
      ladderRowsOf(ctx.v2, issuer.id).forEach((r) => {
        if (!IS_BOND_ROW(ctx.v2.tranches.flags[r]) || !(ctx.v2.tranches.principalLocal[r] > 0)) return;
        const g = Math.abs((ctx.v2.tranches.maturityWeek[r] - week) / 52 - tenorYears);
        if (g < gap) { gap = g; rung = r; }
      });
      if (rung === undefined) return;
      const bondId = trancheIdOf(ctx.v2, rung);
      const cashPrice = trancheClearedPricePerFace(ctx.v2, bondId);
      const cashSpreadBps = rowSpreadBps(ctx.v2, reg, rung, week);
      if (!(cashPrice !== undefined && cashPrice > 0) || cashSpreadBps === undefined) return;
      const terms = trancheTerms(ctx.v2, rung, week, reg.policyRate);
      const priceAtSpread = (bps: number) => priceAtSpreadOnTranche(terms, reg.zeroRates, bps);
      const cdsId = cdsInstrumentId(regionId, issuer.id, CDS_BENCHMARK_TENOR);
      const marginRate = initialMarginRateOf({ classId: 'CDS', regionId, reference: { kind: 'ISSUER', issuerId: issuer.id }, termKey: CDS_BENCHMARK_TENOR, maturityWeek: week + cdsTenorWeeksOf(CDS_BENCHMARK_TENOR) }, view);
      const weeklyMoveBps = Math.max(1, view.cdsSpreadWeeklyMoveBps(issuer.id, CDS_BENCHMARK_TENOR) ?? 1);
      regionFunds.forEach((fund) => {
        const line = pbBook.find((l) => l.fundId === fund.id);
        const read = cdsBasisRead({ cashSpreadBps, cdsSpreadBps: issuer.cdsSpreadBps, financingRateAnnual: line?.rateAnnual ?? repoRateAnnual, repoRateAnnual, marginRate, requiredReturnAnnual: entityRequiredReturn(fund, institutionTotalAssetsLocal(ctx, fund)) });
        const share = arbSizeShare(edgeBps(read), weeklyMoveBps);
        // The position: the rung on its register, the protection it holds on the name.
        const rows = bookRowsOf(ctx.v2, fund.id).filter((r) => instrumentIdAt(ctx.v2, r) === bondId);
        const heldFace = rows.reduce((a, r) => a + rowUnits(ctx.v2.holdings, r), 0);
        const key = institutionPartyKey(fund.id);
        const coverFace = standing.coverLocal('CDS', 'a', key, issuer.id) - standing.coverLocal('CDS', 'b', key, issuer.id);
        if (!(share > 0) && heldFace <= 1 && Math.abs(coverFace) <= 1) return;
        const capacityLocal = arbCapacityLocal(entityCashOf(ctx.v2, fund), fund.primeBrokerageAvailableLocal);
        const lines = book.filter((c) => c.classId === 'CDS' && c.reference.kind === 'ISSUER' && c.reference.issuerId === issuer.id
          && ((c.a.kind === 'INSTITUTION' && c.a.id === fund.id) || (c.b.kind === 'INSTITUTION' && c.b.id === fund.id)));
        const pnlLocal = pairPnLLocal({
          cashValueLocal: rows.reduce((a, r) => a + ctx.v2.holdings.qtyLocal[r], 0),
          cashBasisLocal: rows.reduce((a, r) => a + rowBasisOf(ctx.v2, r), 0),
          futuresSettledToFundLocal: lines.reduce((a, c) => a + (c.a.kind === 'INSTITUTION' && c.a.id === fund.id ? 1 : -1) * (c.settledMarkLocal ?? 0), 0),
        });
        const stopped = stoppedOut(pnlLocal, lines.reduce((a, c) => a + c.initialMarginLocal, 0));
        const carriedFace = capacityLocal / cashPrice;
        const exposureFace = Math.max(heldFace, Math.abs(coverFace));
        const targetFace = stopped ? 0 : exposureFace > carriedFace ? carriedFace : share * carriedFace;
        const forced = stopped || exposureFace > carriedFace;
        const cashDelta = targetFace - heldFace;
        const coverDelta = targetFace - coverFace;
        const legs = cdsBasisLegs({
          regionId, bondId, cdsInstrumentId: cdsId, faceLocal: Math.max(cashDelta, coverDelta), cashSpreadBps, cdsSpreadBps: issuer.cdsSpreadBps,
          carryBps: read.carryBps, weeklyMoveBps, priceAtSpread, budgetLocal: Math.min(Math.max(0, cashDelta) * cashPrice, capacityLocal),
        });
        if (Math.abs(cashDelta) > 1) ctx.relativeValueLegs.push({ ...legs.cash, entityId: fund.id, faceLocal: cashDelta, forced });
        if (Math.abs(coverDelta) > 1) ctx.relativeValueLegs.push({ ...legs.protection, entityId: fund.id, faceLocal: -coverDelta, forced });
      });
    });
  });
}

/** §3.17e-ii — THE BOND BASIS, in both directions. */
function readBondBasis(ctx: WeeklyStepContext, funds: InstitutionalEntity[], view: DerivativeLifecycleView, standing: StandingBook, book: DerivativeContract[], week: number): void {
  REGION_IDS.forEach((regionId: RegionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg || reg.bondFuturesBasis === undefined || reg.bondFuturesDeliverableId === undefined) return;
    // ---- THE BOND BASIS, as the line last printed it. A roll since the print leaves nothing to
    // read: the basis belongs to a delivery that has passed. ----
    const deliveryWeek = nextDeliveryWeek(week);
    const futureId = bondFutureInstrumentId(regionId, deliveryWeek);
    const hist = reg.bondFuturesPriceHistory?.[futureId];
    const futurePrice = hist?.[hist.length - 1];
    if (!(futurePrice !== undefined && futurePrice > 0)) return;
    const bondId = asInstrumentId(reg.bondFuturesDeliverableId);
    const cashPrice = trancheClearedPricePerFace(ctx.v2, bondId);
    const terms = view.sovereignBondTerms(regionId, bondId);
    if (!(cashPrice !== undefined && cashPrice > 0) || !terms) return;
    const repoRateAnnual = view.overnightRateAnnual(regionId);
    const yearsToDelivery = (deliveryWeek - week) / 52;
    const marginRate = initialMarginRateOf({ classId: 'BOND_FUTURE', regionId, reference: { kind: 'SOVEREIGN', regionId, bondId }, termKey: BOND_FUTURE_TERM_KEY, maturityWeek: deliveryWeek }, view);
    const weeklyPriceMove = Math.max(1e-4, bondFutureWeeklyMoveOf(view, regionId, bondDurationYears(repoRateAnnual, (terms.maturityWeek - deliveryWeek) / 52)) ?? cashPrice * 0.01);
    const pbBook = primeBrokerageBookOf(ctx.v2, regionId);
    const loanBook = securityLoanBookOf(ctx.v2, regionId).filter((l) => l.instrumentId === bondId);
    // §3.17e-iii-a: the mirror's carry is the paper's borrow fee, at the lending book's last print
    // — none yet is an unpriced borrow, which the lending book prices the week it is asked.
    const borrowFeeBps = reg.borrowFeeBpsByCompanyId?.[bondId] ?? 0;

    funds.filter((f) => f.region === regionId).forEach((fund) => {
      const line = pbBook.find((l) => l.fundId === fund.id);
      const read = bondBasisRead({
        netBasis: reg.bondFuturesBasis!, cashPrice, yearsToDelivery,
        // No line, no leverage: the fund finances itself at what its cash costs it, the repo rate.
        financingRateAnnual: line?.rateAnnual ?? repoRateAnnual, repoRateAnnual, marginRate,
        requiredReturnAnnual: entityRequiredReturn(fund, institutionTotalAssetsLocal(ctx, fund)),
      });
      const requiredReturnAnnual = entityRequiredReturn(fund, institutionTotalAssetsLocal(ctx, fund));
      const mirror = bondBasisMirrorRead({ netBasis: reg.bondFuturesBasis!, cashPrice, yearsToDelivery, borrowFeeBps, marginRate, requiredReturnAnnual });
      // §3.17e-iii-a: signed — + long the cash on the line and short the future, − its mirror.
      const share = arbTargetShare(edgeBps(read), edgeBps(mirror), (weeklyPriceMove / cashPrice) * 10000);
      const capacityLocal = arbCapacityLocal(entityCashOf(ctx.v2, fund), fund.primeBrokerageAvailableLocal);
      // The position it has: the deliverable on its register less what it has borrowed of it,
      // and its net line — long less short — in the standing book.
      const rows = sovereignRowsOf(ctx.v2, fund.id).filter((r) => r.bondId === bondId);
      const heldFace = rows.reduce((a, r) => a + r.faceLocal, 0);
      const borrowedFace = sharesOnLoan(loanBook, 'borrower', fund.id, bondId);
      const netFace = heldFace - borrowedFace;
      const key = institutionPartyKey(fund.id);
      const shortFace = standing.coverLocal('BOND_FUTURE', 'b', key, bondId);
      const longFace = standing.coverLocal('BOND_FUTURE', 'a', key, bondId);
      const netFuture = longFace - shortFace;
      if (share === 0 && Math.abs(netFace) <= 1 && Math.abs(netFuture) <= 1 && heldFace <= 1) return;
      // §3.17e-ii-b — THE STOP and THE LINE. What the pair has made: the deliverable's mark over
      // its lots' basis, the borrow's net (collateral against the paper owed), and what its lines
      // have settled to it. It is cut whole past the margin its future leg posted; it is cut to
      // what the line carries when the line no longer carries it.
      const lines = book.filter((c) => c.classId === 'BOND_FUTURE' && c.reference.kind === 'SOVEREIGN' && c.reference.bondId === bondId
        && ((c.b.kind === 'INSTITUTION' && c.b.id === fund.id) || (c.a.kind === 'INSTITUTION' && c.a.id === fund.id)));
      const pnlLocal = pairPnLLocal({
        cashValueLocal: rows.reduce((a, r) => a + r.valueLocal, 0) + stockLoanNetLocal(loanBook, fund.id, () => cashPrice),
        cashBasisLocal: rows.reduce((a, r) => a + rowBasisLocal(ctx.v2, r.row), 0),
        futuresSettledToFundLocal: lines.reduce((a, c) => a + (c.a.kind === 'INSTITUTION' && c.a.id === fund.id ? 1 : -1) * (c.settledMarkLocal ?? 0), 0),
      });
      const stopped = stoppedOut(pnlLocal, lines.reduce((a, c) => a + c.initialMarginLocal, 0));
      const carriedFace = capacityLocal / cashPrice;
      const exposureFace = Math.max(Math.abs(netFace), Math.abs(netFuture));
      const targetFace = stopped ? 0 : exposureFace > carriedFace ? Math.sign(share || netFace) * carriedFace : share * carriedFace;
      const forced = stopped || exposureFace > carriedFace;
      const cashDelta = targetFace - netFace;
      const futureLegFace = -targetFace - netFuture;
      const legs = bondBasisLegs({
        regionId, bondId, futureId, faceLocal: Math.max(cashDelta, -futureLegFace),
        cashPrice, futurePrice, couponRate: terms.couponRate, repoRateAnnual, yearsToDelivery,
        carryBps: read.carryBps, weeklyPriceMove, budgetLocal: Math.min(Math.max(0, cashDelta) * cashPrice, capacityLocal),
      });
      // Each leg moves its own side to the target: added when the edge is there, taken off when
      // it has gone, and at any price when the pair is cut. A cash leg below what the book holds
      // sells what it has and BORROWS the rest (§3.17e-iii-a): the lending book clears the need.
      if (cashDelta > 1) ctx.relativeValueLegs.push({ ...legs.cash, entityId: fund.id, faceLocal: cashDelta, forced });
      else if (cashDelta < -1) {
        const sellFace = Math.min(-cashDelta, heldFace);
        if (sellFace > 1) ctx.relativeValueLegs.push({ ...legs.cash, entityId: fund.id, faceLocal: -sellFace, forced });
        const borrowFace = -cashDelta - sellFace;
        if (borrowFace > 1) ctx.borrowNeeds.push({ entityId: fund.id, regionId, instrumentId: bondId, units: borrowFace });
      }
      if (Math.abs(futureLegFace) > 1) ctx.relativeValueLegs.push({ ...legs.future, entityId: fund.id, faceLocal: futureLegFace, forced });
    });
  });
}
