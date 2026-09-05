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
import { getUnifiedInitialMarginRate } from '../../dealers';
import { calculateCompositeIndices } from '../../macro/indices';
import { WeeklyStepContext } from './context';
import { rowSpreadBps, trancheTerms } from '../../credit-price';
import { clearedPriceOf } from '../../../engine2/prices';
import { dv01PerUnitFace, priceFromSpreadBps, type PaperTerms } from '../../../domain/pricing';
import { SOVEREIGN_PAYMENTS_PER_YEAR } from '../../../domain/government';
import { asInstrumentId } from '../../../domain/ids';
import { defect } from '../../../domain/defect';


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

          // §3.26-a: THE MARK IS THE PRINT. The tranche's own book printed a price this week or
          // carried its last one (§3.21); the position is worth that. Paper the book has never
          // printed keeps the mark it had — a round trip through a fitted curve cannot return a
          // price nobody struck, and `priceCorporateBond` is gone with that reading.
          const reg = updatedRegions[pos.region];
          const terms = trancheTerms(v2, trRow, nextWeek, reg.policyRate);
          const printed = clearedPriceOf(v2, trancheIdOf(v2, trRow));
          currentPrice = printed !== undefined && printed > 0 ? printed * 100 : pos.currentPrice;
          const posValueLocal = pos.quantity * (currentPrice / 100) * fxRateToUsd;
          const entryValueLocal = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
          unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;
          const dir = pos.direction === 'LONG' ? 1 : -1;
          const pnlMove = unrealizedPnL - prevPnL;
          // The spread this mark implies over this week's curve (undefined for a floater, which
          // prices off its margin, and for paper with no print).
          const spreadNow = rowSpreadBps(v2, reg, trRow, nextWeek);
          if (!(TS.flags[trRow] & TR_FLOATING)) {
            // The sensitivity is the paper's own schedule at the print's own yield — a derivative
            // of the mark, not a point on a curve.
            dv01 = pos.quantity * dv01PerUnitFace(terms, currentPrice / 100) * fxRateToUsd * dir;
            const carryEst = calculateExpectedCarry('CORP_BOND', pos.direction, posValueLocal, {
              policyRate: reg.policyRate,
              couponRate: terms.annualCouponRate,
              cdsSpreadBps: comp.cdsSpreadBps
            });
            weeklyFinancing = carryEst.components.financingCostLocal;
            ctx.attributionCarry += carryEst.weeklyCarryLocal;
            // §3.26-a: the move is split by MEASUREMENT, not by a 70/30 that was written down. What
            // the tranche's own spread change explains at this week's curve is credit; the rest is
            // the curve's. With no prior spread to measure against the move is the paper's own,
            // which for a credit is its spread.
            const creditMove = spreadNow !== undefined && pos.markedSpreadBps !== undefined
              ? pos.quantity * (priceFromSpreadBps(terms, reg.zeroRates, spreadNow) - priceFromSpreadBps(terms, reg.zeroRates, pos.markedSpreadBps)) * fxRateToUsd * dir
              : pnlMove;
            ctx.attributionCreditSpread += creditMove;
            ctx.attributionMacroRates += pnlMove - creditMove;
            marginReq = pos.notional * fxRateToUsd * marginRate;
            maintMargin = marginReq * 0.65;
          } else {
            // §3.13 row 3: marked at the price THIS LOAN cleared at (07d), never a price
            // linearised out of a cleared margin — `bond.md` N7.b's forbidden direction.
            const carryEst = calculateExpectedCarry('LEVERAGED_LOAN', pos.direction, posValueLocal, {
              policyRate: reg.policyRate,
              cdsSpreadBps: Number.isNaN(TS.floatingMarginBps[trRow]) ? 200 : TS.floatingMarginBps[trRow]
            });
            weeklyFinancing = carryEst.components.financingCostLocal;
            ctx.attributionCarry += carryEst.weeklyCarryLocal;
            // §3.26-a: a floater has no rate leg — its price moves with its margin, and its
            // coupon moves with the rate. The whole move is credit; the 80/20 is gone.
            ctx.attributionCreditSpread += pnlMove;
            marginReq = pos.notional * fxRateToUsd * marginRate;
            maintMargin = marginReq * 0.65;
          }
          pos.markedSpreadBps = spreadNow;
        }
        break;
      }

      case 'GOV_BOND': {
        const maturityWeek = pos.maturityWeek || (pos.openedWeek ? pos.openedWeek + Math.round((pos.tenorYears || 10) * 52) : (pos.tenorYears ? nextWeek + Math.round(pos.tenorYears * 52) : nextWeek + 520));
        // §3.26-a: THE MARK IS THE TRANCHE'S PRINT — the price its own auction struck or carried
        // (07c), never the fitted curve at the position's tenor, which is what `priceSovereignBond`
        // was. A position that names no tranche, or whose tranche has never printed, keeps the
        // mark it had. Its terms are its own: the coupon it was struck with, on the sovereign's
        // own schedule.
        const printed = pos.trancheId ? clearedPriceOf(v2, asInstrumentId(pos.trancheId)) : undefined;
        currentPrice = printed !== undefined && printed > 0 ? printed * 100 : pos.currentPrice;
        const fixedRate = pos.fixedRate ?? defect(`sovereign position ${pos.id} carries no coupon`);
        const terms: PaperTerms = {
          annualCouponRate: fixedRate,
          periodWeeks: Math.round(52 / SOVEREIGN_PAYMENTS_PER_YEAR),
          weeksToMaturity: maturityWeek - nextWeek,
        };
        const posValueLocal = pos.quantity * (currentPrice / 100) * fxRateToUsd;
        const entryValueLocal = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;

        unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;
        dv01 = pos.quantity * dv01PerUnitFace(terms, currentPrice / 100) * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);

        const carryEst = calculateExpectedCarry('GOV_BOND', pos.direction, posValueLocal, {
          policyRate: updatedRegions[pos.region].policyRate,
          couponRate: fixedRate
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
