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
 * the bond basis; the mirror trade is 17e-iii.
 *
 * Runs after prime-brokerage (the line the cash leg is financed on is struck) and before 07b.
 */

import { GameState, RegionId } from '../../../types';
import { WeeklyStepContext } from './context';
import { REGION_IDS } from '../../../domain/geography';
import { institutionPartyKey } from '../../../domain/derivatives/contract';
import { initialMarginRateOf } from '../../../domain/derivatives/registry';
import { BOND_FUTURE_TERM_KEY, nextDeliveryWeek, bondDurationYears, bondFutureWeeklyMoveOf } from '../../../domain/derivatives/classes/bond-future';
import { bondFutureInstrumentId } from '../../../domain/instrument-keys';
import { bondBasisRead, bondBasisLegs, edgeBps, arbSizeShare, arbCapacityLocal, pairPnLLocal, stoppedOut } from '../../../domain/relative-value';
import { asInstrumentId } from '../../../domain/ids';
import { trancheClearedPricePerFace } from '../../credit-price';
import { sovereignRowsOf } from '../../sovereign-register';
import { primeBrokerageBookOf, derivativesBookOf } from '../../ledger/contract-ledger';
import { rowBasisLocal } from '../../../engine2/holdings';
import { entityCashOf } from '../../ledger/accounts';
import { buildDerivativeMarketView, standingBookOf } from './derivative-lifecycle';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';
import { entityRequiredReturn } from './asset-allocation';

export function runRelativeValueStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.relativeValueLegs = [];
  const funds = ctx.updatedInstitutionalEntities.filter((e) => e.entityType === 'HEDGE_FUND' && e.hedgeFundStrategy === 'RELATIVE_VALUE' && !e.isDefaulted);
  if (funds.length === 0) return;
  const view = buildDerivativeMarketView(ctx);
  const standing = standingBookOf(ctx, state);
  const book = derivativesBookOf(ctx);
  const week = ctx.nextWeek;
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

    funds.filter((f) => f.region === regionId).forEach((fund) => {
      const line = pbBook.find((l) => l.fundId === fund.id);
      const read = bondBasisRead({
        netBasis: reg.bondFuturesBasis!, cashPrice, yearsToDelivery,
        // No line, no leverage: the fund finances itself at what its cash costs it, the repo rate.
        financingRateAnnual: line?.rateAnnual ?? repoRateAnnual, repoRateAnnual, marginRate,
        requiredReturnAnnual: entityRequiredReturn(fund, institutionTotalAssetsLocal(ctx, fund)),
      });
      const edge = edgeBps(read);
      const share = arbSizeShare(edge, (weeklyPriceMove / cashPrice) * 10000);
      const capacityLocal = arbCapacityLocal(entityCashOf(ctx.v2, fund), fund.primeBrokerageAvailableLocal);
      // The position it has: the deliverable on its register, the line it is short in the book.
      const rows = sovereignRowsOf(ctx.v2, fund.id).filter((r) => r.bondId === bondId);
      const heldFace = rows.reduce((a, r) => a + r.faceLocal, 0);
      const key = institutionPartyKey(fund.id);
      const shortFace = standing.coverLocal('BOND_FUTURE', 'b', key, bondId);
      if (!(share > 0) && heldFace <= 1 && shortFace <= 1) return;
      // §3.17e-ii-b — THE STOP and THE LINE. What the pair has made: the deliverable's mark over
      // its lots' basis, plus what its shorts have settled to it. It is cut whole past the margin
      // its future leg posted; it is cut to what the line carries when the line no longer carries it.
      const shorts = book.filter((c) => c.classId === 'BOND_FUTURE' && c.reference.kind === 'SOVEREIGN' && c.reference.bondId === bondId && c.b.kind === 'INSTITUTION' && c.b.id === fund.id);
      const pnlLocal = pairPnLLocal({
        cashValueLocal: rows.reduce((a, r) => a + r.valueLocal, 0),
        cashBasisLocal: rows.reduce((a, r) => a + rowBasisLocal(ctx.v2, r.row), 0),
        futuresSettledToFundLocal: -shorts.reduce((a, c) => a + (c.settledMarkLocal ?? 0), 0),
      });
      const stopped = stoppedOut(pnlLocal, shorts.reduce((a, c) => a + c.initialMarginLocal, 0));
      const carriedFace = capacityLocal / cashPrice;
      const targetFace = stopped ? 0 : Math.min(share * carriedFace, Math.max(heldFace, shortFace) > carriedFace ? carriedFace : Number.POSITIVE_INFINITY);
      const forced = stopped || Math.max(heldFace, shortFace) > carriedFace;
      const cashDelta = targetFace - heldFace;
      const futureDelta = targetFace - shortFace;
      const legs = bondBasisLegs({
        regionId, bondId, futureId, faceLocal: Math.max(cashDelta, futureDelta),
        cashPrice, futurePrice, couponRate: terms.couponRate, repoRateAnnual, yearsToDelivery,
        carryBps: read.carryBps, weeklyPriceMove, budgetLocal: Math.min(Math.max(0, cashDelta) * cashPrice, capacityLocal),
      });
      // Each leg moves its own side to the target: added when the edge is there, taken off when
      // it has gone, and at any price when the pair is cut.
      if (Math.abs(cashDelta) > 1) ctx.relativeValueLegs.push({ ...legs.cash, entityId: fund.id, faceLocal: cashDelta, forced });
      if (Math.abs(futureDelta) > 1) ctx.relativeValueLegs.push({ ...legs.future, entityId: fund.id, faceLocal: -futureDelta, forced });
    });
  });
}
