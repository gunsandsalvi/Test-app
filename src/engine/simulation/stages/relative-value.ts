/**
 * §3.17e-ii-a — THE RELATIVE-VALUE BOOK'S WEEK. Before any book opens, each `RELATIVE_VALUE`
 * fund reads the registry of comparables (`domain/relative-value.ts`) off last week's prints,
 * sizes each pair by its edge net of carry against what its cash and its broker's line carry,
 * and states BOTH legs on the context: the market that clears each leg reads it there (07c for a
 * sovereign cash leg, the bond futures line for the future leg) and the fund bids or offers in
 * that book like any other participant — at the leg's price, in the leg's size. The book's
 * position is never stored here: it is the fund's rows in the sovereign register and its cover
 * in the standing derivatives book (rule 19), and each week's legs are what moves those to the
 * target. The first comparable is the bond basis; the cut and the mirror trade are 17e-ii-b/iii.
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
import { bondBasisRead, bondBasisLegs, edgeBps, arbSizeShare, arbCapacityLocal } from '../../../domain/relative-value';
import { asInstrumentId } from '../../../domain/ids';
import { trancheClearedPricePerFace } from '../../credit-price';
import { sovereignRowsOf } from '../../sovereign-register';
import { primeBrokerageBookOf } from '../../ledger/contract-ledger';
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
      if (!(share > 0)) return;
      const capacityLocal = arbCapacityLocal(entityCashOf(ctx.v2, fund), fund.primeBrokerageAvailableLocal);
      const targetFace = share * capacityLocal / cashPrice;
      // The position it has: the deliverable on its register, the line it is short in the book.
      const heldFace = sovereignRowsOf(ctx.v2, fund.id).filter((r) => r.bondId === bondId).reduce((a, r) => a + r.faceLocal, 0);
      const shortFace = standing.coverLocal('BOND_FUTURE', 'b', institutionPartyKey(fund.id), bondId);
      const cashDelta = targetFace - heldFace;
      const futureDelta = targetFace - shortFace;
      const legs = bondBasisLegs({
        regionId, bondId, futureId, faceLocal: Math.max(cashDelta, futureDelta),
        cashPrice, futurePrice, couponRate: terms.couponRate, repoRateAnnual, yearsToDelivery,
        carryBps: read.carryBps, weeklyPriceMove, budgetLocal: Math.min(Math.max(0, cashDelta) * cashPrice, capacityLocal),
      });
      // Each leg moves its own side to the target; a reduction is 17e-ii-b's.
      if (cashDelta > 1) ctx.relativeValueLegs.push({ ...legs.cash, entityId: fund.id, faceLocal: cashDelta });
      if (futureDelta > 1) ctx.relativeValueLegs.push({ ...legs.future, entityId: fund.id, faceLocal: -futureDelta });
    });
  });
}
