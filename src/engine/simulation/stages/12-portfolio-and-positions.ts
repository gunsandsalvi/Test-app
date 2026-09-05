/**
 * Stage 12: Composite Indices & Portfolio Mark-to-Market
 *
 * Recomputes composite benchmark indices, then marks every open position to
 * market (equities, corp/sov bonds, leveraged loans, FX spot), accruing carry, financing cost,
 * realized cash from maturities and defaults, margin requirements, delta and DV01, and P&L
 * attribution. §3.17b-ii: the six derivative kinds that were marked here by formula against
 * nobody are gone — a derivative is a contract on the one book (derivative-lifecycle.ts).
 */

import { GameState, Position } from '../../../types';
import { marketCapAt } from '../../../engine2/instruments';
import { ensureV2 } from '../../../engine2/world';
import { trancheIdOf, ladderRowsOf, TR_FLOATING } from '../../../engine2/tranches';
import { assertNever } from '../../../domain/defect';
import { calculateExpectedCarry } from '../../carryCalculator';
import { priceSovereignBond } from '../../nelsonSiegel';
import { priceCorporateBond } from '../../pricing';
import { getUnifiedInitialMarginRate } from '../../dealers';
import { calculateCompositeIndices } from '../../macro/indices';
import { WeeklyStepContext } from './context';
import { rowSpreadBps } from '../../credit-price';
import { clearedPriceOf } from '../../../engine2/prices';
import { zeroRateAt } from '../../../domain/pricing';


export function runPortfolioAndPositionsStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2 = ensureV2(state);
  const TS = v2.tranches;
  const { updatedRegions, updatedCompanies, updatedCommodities, updatedFxPairs, nextWeek } = ctx;

  ctx.updatedCompositeIndices = calculateCompositeIndices(
    updatedCompanies,
    updatedRegions,
    (c) => marketCapAt(v2, c),
    updatedCommodities,
    state.compositeIndices,
    v2,
    nextWeek
  );


  const usdPolicyRate = updatedRegions.USA.policyRate;
  ctx.weeklyInterestIncomeLocal = Math.max(0, state.portfolio.cashLocal) * (usdPolicyRate / 52);
  ctx.attributionCarry += ctx.weeklyInterestIncomeLocal;

  ctx.updatedPositions = ctx.workingPositions.map((pos) => {
    const fxRateToUsd = ctx.getFxToUsd(pos.region);
    let currentPrice = pos.currentPrice;
    let unrealizedPnL = 0;
    let delta = 0;
    let dv01 = 0;
    let weeklyFinancing = 0;

    const marginRate = getUnifiedInitialMarginRate(pos.assetType);
    let marginReq = pos.notional * fxRateToUsd * marginRate;
    let maintMargin = marginReq * 0.65;

    const prevPnL = pos.unrealizedPnL;

    switch (pos.assetType) {
      case 'EQUITY': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        if (comp) {
          currentPrice = comp.stockPrice;
          const posValueLocal = pos.quantity * currentPrice * fxRateToUsd;
          const entryValueLocal = pos.quantity * pos.entryPrice * fxRateToUsd;

          unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;
          delta = pos.direction === 'LONG' ? posValueLocal : -posValueLocal;

          const carryEst = calculateExpectedCarry('EQUITY', pos.direction, posValueLocal, {
            policyRate: updatedRegions[pos.region].policyRate,
            dividendYield: comp.dividendYield || 0.018
          });

          weeklyFinancing = carryEst.components.financingCostLocal;
          ctx.attributionCarry += carryEst.weeklyCarryLocal;

          marginReq = posValueLocal * marginRate;
          maintMargin = marginReq * 0.65;

          const pnlMove = unrealizedPnL - prevPnL;
          ctx.attributionEquityDelta += pnlMove;
        }
        break;
      }

      case 'LEVERAGED_LOAN':
      case 'CORP_BOND': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        if (comp) {
          // The ladder find on rows (the id is interned; a short walk per position).
          let trRow = -1;
          for (const r of ladderRowsOf(v2, comp.id)) {
            if (trancheIdOf(v2, r) === pos.trancheId) { trRow = r; break; }
          }
          if (trRow < 0) {
            currentPrice = comp.isDefaulted ? (comp.recoveryRate * 100) : 100;
            const posValueLocal = pos.quantity * (currentPrice / 100) * fxRateToUsd;
            const entryValueLocal = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
            unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;

            // A matured position realizes its P&L, not its face value. This book is
            // margin-financed — opening a position commits margin and pays the spread, never the
            // notional — so crediting the full redemption here would hand the player principal
            // they never paid, and stage 13 adds the P&L on top of it (it sums realized cash AND
            // realized P&L into the week's cash). Money from nowhere, twice over. The
            // contractual payout is still what sets the price (par, or recovery on default);
            // what settles to cash is the gain or loss against entry. Every maturity in this
            // stage writes ONE of the two lines, for the same reason.
            ctx.weeklyRealizedPnL += unrealizedPnL;
            pos.isClosed = true;

            ctx.newsItems.push({
              id: `redemption-${pos.id}-${nextWeek}`,
              week: nextWeek,
              title: `Tranche Matured: ${pos.name}`,
              description: `Your position in ${pos.symbol} has been redeemed at ${currentPrice.toFixed(1)} points of par.`,
              category: 'CREDIT',
              impactBadge: '[REDEMPTION]',
              impactRegion: pos.region,
              affectedTicker: comp.ticker,
              urgent: true
            });
            break;
          }

          const remainingTenorYears = Math.max(0.01, (TS.maturityWeek[trRow] - nextWeek) / 52);
          // S6: the position marks off the CLEARED stat, full stop. The deleted block here
          // re-adjusted the already-cleared OAS by an ownership-derived premium — a second
          // price-setter duplicating (and disagreeing with) the real auction in 07b.
          // §3.13: and the stat is THIS TRANCHE's, off the price its own book printed. Paper the
          // book has not printed carries no view, and its own coupon is the fair rate.
          const couponRate = Number.isNaN(TS.couponRate[trRow]) ? 0.05 : TS.couponRate[trRow];
          const adjustedOasSpreadBps = rowSpreadBps(v2, updatedRegions[pos.region], trRow, nextWeek)
            ?? (couponRate - zeroRateAt(updatedRegions[pos.region].zeroRates, remainingTenorYears)) * 10000;

          if (!(TS.flags[trRow] & TR_FLOATING)) {
            // §3.13-READ A8 — THE POSITION MARKS AT THE PRINT, and the analytic is kept for the
            // SENSITIVITY only. This used to round-trip: `rowSpreadBps` is `spreadBpsFromPrice` of
            // the tranche's own cleared price, and feeding that straight back into
            // `priceCorporateBond` asks two functions that are not each other's inverse to agree.
            // They did not have to, so the same tranche was worth one number on the register (the
            // print) and another in the player's book. The floating branch below already read the
            // print; this is the fixed side of the same rule. `dv01` is a derivative of the price
            // curve rather than a point on it, so it still comes from the analytic — struck at the
            // print's OWN spread, which is what makes it the sensitivity of the printed mark.
            const bondPriced = priceCorporateBond(
              remainingTenorYears, couponRate, sovParams,
              adjustedOasSpreadBps, comp.isDefaulted, comp.recoveryRate
            );
            // Paper the book has not printed carries no view, and its own coupon is the fair rate
            // — which is exactly what the analytic at the coupon-implied spread says.
            const printed = clearedPriceOf(v2, trancheIdOf(v2, trRow));
            currentPrice = printed !== undefined && printed > 0 ? printed * 100 : bondPriced.price;
            const posValueLocal = pos.quantity * (currentPrice / 100) * fxRateToUsd;
            const entryValueLocal = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
            unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;
            dv01 = (pos.quantity / 100) * bondPriced.dv01 * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);

            const carryEst = calculateExpectedCarry('CORP_BOND', pos.direction, posValueLocal, {
              policyRate: updatedRegions[pos.region].policyRate,
              couponRate,
              cdsSpreadBps: comp.cdsSpreadBps
            });
            weeklyFinancing = carryEst.components.financingCostLocal;
            ctx.attributionCarry += carryEst.weeklyCarryLocal;
            const pnlMove = unrealizedPnL - prevPnL;
            ctx.attributionCreditSpread += pnlMove * 0.7;
            ctx.attributionMacroRates += pnlMove * 0.3;
            marginReq = pos.notional * fxRateToUsd * marginRate;
            maintMargin = marginReq * 0.65;
          } else {
            // §3.13 row 3: marked at the price THIS LOAN cleared at (07d), not at a price
            // linearised out of a cleared margin — `bond.md` N7.b's forbidden direction, which is
            // what `priceLeveragedLoan` was and why it is deleted with this read. Paper the book
            // has not printed keeps par, which is what a loan struck at its own margin is worth.
            currentPrice = (clearedPriceOf(v2, trancheIdOf(v2, trRow)) ?? 1) * 100;
            const posValueLocal = pos.quantity * (currentPrice / 100) * fxRateToUsd;
            const entryValueLocal = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
            unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;
            const carryEst = calculateExpectedCarry('LEVERAGED_LOAN', pos.direction, posValueLocal, {
              policyRate: updatedRegions[pos.region].policyRate,
              cdsSpreadBps: Number.isNaN(TS.floatingMarginBps[trRow]) ? 200 : TS.floatingMarginBps[trRow]
            });
            weeklyFinancing = carryEst.components.financingCostLocal;
            ctx.attributionCarry += carryEst.weeklyCarryLocal;
            const pnlMove = unrealizedPnL - prevPnL;
            ctx.attributionCreditSpread += pnlMove * 0.8;
            ctx.attributionMacroRates += pnlMove * 0.2;
            marginReq = pos.notional * fxRateToUsd * marginRate;
            maintMargin = marginReq * 0.65;
          }
        }
        break;
      }

      case 'GOV_BOND': {
        const maturityWeek = pos.maturityWeek || (pos.openedWeek ? pos.openedWeek + Math.round((pos.tenorYears || 10) * 52) : (pos.tenorYears ? nextWeek + Math.round(pos.tenorYears * 52) : nextWeek + 520));
        const remainingTenorYears = Math.max(0.01, (maturityWeek - nextWeek) / 52);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        const bondPriced = priceSovereignBond(remainingTenorYears, pos.fixedRate || 0.04, sovParams);
        currentPrice = bondPriced.price;
        const posValueLocal = pos.quantity * (currentPrice / 100) * fxRateToUsd;
        const entryValueLocal = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;

        unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;
        dv01 = (pos.quantity / 100) * bondPriced.dv01 * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);

        const carryEst = calculateExpectedCarry('GOV_BOND', pos.direction, posValueLocal, {
          policyRate: updatedRegions[pos.region].policyRate,
          couponRate: pos.fixedRate || 0.04
        });
        weeklyFinancing = carryEst.components.financingCostLocal;
        ctx.attributionCarry += carryEst.weeklyCarryLocal;

        const pnlMove = unrealizedPnL - prevPnL;
        ctx.attributionMacroRates += pnlMove;

        // Check sovereign bond maturity
        if (nextWeek >= maturityWeek) {
          pos.isClosed = true;
          // S9: same margin-book rule as the corporate maturity above — the redemption pays par
          // contractually, but what settles to the player's cash is the P&L against entry, not
          // face value they never funded (and which stage 13 would then double by also adding
          // the P&L).
          ctx.weeklyRealizedPnL += unrealizedPnL;
          ctx.newsItems.push({
            id: `sov-matured-${pos.id}-${nextWeek}`,
            week: nextWeek,
            title: `Sovereign Bond Matured: ${pos.name}`,
            description: `Your ${pos.region} bond position matured at week ${nextWeek} and was redeemed at par (100).`,
            category: 'MACRO',
            impactBadge: '[MATURITY]',
            impactRegion: pos.region,
            urgent: true,
          });
        } else {
          marginReq = pos.notional * fxRateToUsd * marginRate;
          maintMargin = marginReq * 0.6;
        }
        break;
      }

      case 'FX_SPOT': {
        const fxPair = updatedFxPairs.find((p) => p.pair === pos.symbol);
        if (fxPair) {
          currentPrice = fxPair.rate;
          const priceDiff = pos.direction === 'LONG' ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice);
          unrealizedPnL = priceDiff * pos.notional;
          marginReq = pos.notional * currentPrice * 0.05;
          maintMargin = marginReq * 0.75;
          const pnlMove = unrealizedPnL - prevPnL;
          ctx.attributionMacroRates += pnlMove;
        }
        break;
      }
      default:
        // Without this, a position in a new asset type was never re-marked — frozen at
        // entry price with zero P&L forever. A new AssetType member now fails to COMPILE here.
        assertNever(pos.assetType, 'position weekly mark (12-portfolio-and-positions)');
    }

    ctx.weeklyFinancingCostLocal += weeklyFinancing;
    ctx.totalRequiredMarginLocal += marginReq;
    ctx.maintenanceMarginLocal += maintMargin;
    ctx.netDeltaLocal += delta;
    ctx.netDV01Local += dv01;

    return {
      ...pos,
      currentPrice,
      unrealizedPnL,
      marginRequirement: marginReq,
      maintenanceMargin: maintMargin,
      weeklyFinancingCost: weeklyFinancing,
      delta,
      dv01
    } as Position;
  });
}
