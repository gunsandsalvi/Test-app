/**
 * Stage 12: Composite Indices & Portfolio Mark-to-Market
 *
 * Recomputes composite benchmark indices, then marks every open position to
 * market (equities, corp/sov bonds, leveraged loans, IRS/CDS/TRS/XCS/options/FX/
 * commodities), accruing carry, financing cost, realized cash from maturities and
 * defaults, margin requirements, greeks, and P&L attribution.
 */

import { GameState, Position } from '../../../types';
import { ringFill, rowOf, ensureV2 } from '../../../engine2/world';
import { ladderRowsOf, TR_FLOATING } from '../../../engine2/tranches';
import { isActiveCompany } from '../../../domain/company';
import { assertNever } from '../../../domain/defect';
import { calculateBlackScholesGreeks } from '../../blackScholes';
import { calculateExpectedCarry } from '../../carryCalculator';
import { priceSovereignBond } from '../../nelsonSiegel';
import { priceCorporateBond, priceInterestRateSwap, priceCreditDefaultSwap, priceCrossCurrencyBasisSwap } from '../../pricing';
import { getUnifiedInitialMarginRate } from '../../dealers';
import { calculateCompositeIndices } from '../../macro/indices';
import { WeeklyStepContext } from './context';
import { rowSpreadBps } from '../../credit-price';
import { clearedPriceOf } from '../../../engine2/prices';
import { zeroRateAt } from '../../../domain/pricing';
import { realizedAnnualVol } from '../../../domain/volatility';
import { regionIndexOf } from '../../macro/indices';

const priceScratch12: number[] = [];

export function runPortfolioAndPositionsStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2 = ensureV2(state);
  const TS = v2.tranches;
  const { updatedRegions, updatedCompanies, updatedCommodities, updatedFxPairs, nextWeek } = ctx;

  ctx.updatedCompositeIndices = calculateCompositeIndices(
    updatedCompanies,
    updatedRegions,
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
    let gamma = 0;
    let vega = 0;
    let theta = 0;
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
            if (v2.internedStrings[TS.idRef[r]] === pos.trancheId) { trRow = r; break; }
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
          const adjustedOasSpreadBps = rowSpreadBps(v2, updatedRegions[pos.region], trRow, nextWeek)
            ?? ((Number.isNaN(TS.couponRate[trRow]) ? 0.05 : TS.couponRate[trRow])
              - zeroRateAt(updatedRegions[pos.region].zeroRates, remainingTenorYears)) * 10000;

          if (!(TS.flags[trRow] & TR_FLOATING)) {
            const bondPriced = priceCorporateBond(
              remainingTenorYears,
              Number.isNaN(TS.couponRate[trRow]) ? 0.05 : TS.couponRate[trRow],
              sovParams,
              adjustedOasSpreadBps,
              comp.isDefaulted,
              comp.recoveryRate
            );
            currentPrice = bondPriced.price;
            const posValueLocal = pos.quantity * (currentPrice / 100) * fxRateToUsd;
            const entryValueLocal = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
            unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;
            dv01 = (pos.quantity / 100) * bondPriced.dv01 * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);

            const carryEst = calculateExpectedCarry('CORP_BOND', pos.direction, posValueLocal, {
              policyRate: updatedRegions[pos.region].policyRate,
              couponRate: Number.isNaN(TS.couponRate[trRow]) ? 0.05 : TS.couponRate[trRow],
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
            currentPrice = (clearedPriceOf(v2, v2.internedStrings[TS.idRef[trRow]]) ?? 1) * 100;
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

      case 'SOV_BOND': {
        const maturityWeek = pos.maturityWeek || (pos.openedWeek ? pos.openedWeek + Math.round((pos.tenorYears || 10) * 52) : (pos.tenorYears ? nextWeek + Math.round(pos.tenorYears * 52) : nextWeek + 520));
        const remainingTenorYears = Math.max(0.01, (maturityWeek - nextWeek) / 52);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        const bondPriced = priceSovereignBond(remainingTenorYears, pos.fixedRate || 0.04, sovParams);
        currentPrice = bondPriced.price;
        const posValueLocal = pos.quantity * (currentPrice / 100) * fxRateToUsd;
        const entryValueLocal = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;

        unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;
        dv01 = (pos.quantity / 100) * bondPriced.dv01 * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);

        const carryEst = calculateExpectedCarry('SOV_BOND', pos.direction, posValueLocal, {
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

      case 'IRS': {
        const maturityWeek = pos.maturityWeek || (pos.openedWeek ? pos.openedWeek + Math.round((pos.tenorYears || 5) * 52) : (pos.tenorYears ? nextWeek + Math.round(pos.tenorYears * 52) : nextWeek + 260));
        const remainingTenorYears = Math.max(0.01, (maturityWeek - nextWeek) / 52);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        const irsPricing = priceInterestRateSwap(
          pos.notional,
          pos.fixedRate || 0.04,
          remainingTenorYears,
          pos.direction as 'PAY_FIXED' | 'RECEIVE_FIXED',
          sovParams
        );
        currentPrice = irsPricing.currentParRate;
        unrealizedPnL = irsPricing.npv * fxRateToUsd;
        dv01 = irsPricing.dv01 * fxRateToUsd;

        const carryEst = calculateExpectedCarry('IRS', pos.direction, pos.notional * fxRateToUsd, {
          policyRate: updatedRegions[pos.region].policyRate,
          fixedRate: pos.fixedRate || 0.04,
          floatingRate: updatedRegions[pos.region].policyRate
        });
        weeklyFinancing = carryEst.components.financingCostLocal;
        ctx.attributionCarry += carryEst.weeklyCarryLocal;

        const pnlMove = unrealizedPnL - prevPnL;
        ctx.attributionMacroRates += pnlMove;

        // Check IRS maturity
        if (nextWeek >= maturityWeek) {
          pos.isClosed = true;
          ctx.weeklyRealizedPnL += unrealizedPnL;
          ctx.newsItems.push({
            id: `irs-matured-${pos.id}-${nextWeek}`,
            week: nextWeek,
            title: `IRS Expired at Maturity: ${pos.name}`,
            description: `Your interest rate swap terminated at its scheduled maturity date.`,
            category: 'MACRO',
            impactBadge: '[EXPIRY]',
            impactRegion: pos.region,
            urgent: false,
          });
        } else {
          marginReq = pos.notional * fxRateToUsd * marginRate;
          maintMargin = marginReq * 0.6;
        }
        break;
      }

      case 'CDS': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        if (comp) {
          const maturityWeek = pos.maturityWeek || (pos.openedWeek ? pos.openedWeek + Math.round((pos.tenorYears || 5) * 52) : (pos.tenorYears ? nextWeek + Math.round(pos.tenorYears * 52) : nextWeek + 260));
          const remainingTenorYears = Math.max(0.01, (maturityWeek - nextWeek) / 52);
          const cdsPricing = priceCreditDefaultSwap(
            pos.notional,
            pos.entryPrice,
            comp.cdsSpreadBps,
            remainingTenorYears,
            pos.direction as 'BUY_PROTECTION' | 'SELL_PROTECTION',
            sovParams,
            comp.recoveryRate,
            comp.isDefaulted
          );
          currentPrice = cdsPricing.currentCdsSpreadBps;
          unrealizedPnL = cdsPricing.npv * fxRateToUsd;

          const carryEst = calculateExpectedCarry('CDS', pos.direction, pos.notional * fxRateToUsd, {
            policyRate: updatedRegions[pos.region].policyRate,
            cdsSpreadBps: pos.entryPrice
          });
          weeklyFinancing = carryEst.components.financingCostLocal;
          ctx.attributionCarry += carryEst.weeklyCarryLocal;

          const pnlMove = unrealizedPnL - prevPnL;
          ctx.attributionCreditSpread += pnlMove;

          // Check CDS maturity or default settlement
          if (!isActiveCompany(comp)) {
            pos.isClosed = true;
            ctx.weeklyRealizedPnL += unrealizedPnL;
          } else if (nextWeek >= maturityWeek) {
            pos.isClosed = true;
            ctx.weeklyRealizedPnL += unrealizedPnL;
            ctx.newsItems.push({
              id: `cds-expired-${pos.id}-${nextWeek}`,
              week: nextWeek,
              title: `CDS Protection Expired: ${pos.name}`,
              description: `Credit Default Swap contract expired with no default credit trigger.`,
              category: 'CREDIT',
              impactBadge: '[EXPIRY]',
              impactRegion: pos.region,
              urgent: false,
            });
          } else {
            marginReq = pos.notional * fxRateToUsd * marginRate;
            maintMargin = marginReq * 0.6;
          }
        }
        break;
      }

      case 'TRS': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        if (comp) {
          const assetReturn = (comp.stockPrice - pos.entryPrice) / pos.entryPrice;
          const regPolicyRate = updatedRegions[pos.region].policyRate;

          const notional = pos.notional * fxRateToUsd;
          const priceReturnLocal = notional * assetReturn;

          const carryEst = calculateExpectedCarry('TRS', pos.direction, notional, {
            policyRate: regPolicyRate,
            dividendYield: comp.dividendYield || 0.02
          });
          weeklyFinancing = carryEst.components.financingCostLocal;
          ctx.attributionCarry += carryEst.weeklyCarryLocal;

          unrealizedPnL = pos.direction === 'LONG' ? priceReturnLocal : -priceReturnLocal;
          delta = pos.direction === 'LONG' ? notional : -notional;
          const pnlMove = unrealizedPnL - prevPnL;
          ctx.attributionEquityDelta += pnlMove;

          marginReq = notional * marginRate;
          maintMargin = marginReq * 0.65;
        }
        break;
      }

      case 'COMMODITY': {
        const comm = updatedCommodities.find((c) => c.symbol === pos.symbol || c.id === pos.symbol);
        if (comm) {
          currentPrice = comm.spotPrice;
          const posValueLocal = pos.quantity * currentPrice;
          const entryValueLocal = pos.quantity * pos.entryPrice;

          unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;
          delta = pos.direction === 'LONG' ? posValueLocal : -posValueLocal;

          const carryEst = calculateExpectedCarry('COMMODITY', pos.direction, posValueLocal, {
            policyRate: updatedRegions.USA.policyRate,
            convenienceYield: comm.convenienceYield
          });
          weeklyFinancing = carryEst.components.financingCostLocal;
          ctx.attributionCarry += carryEst.weeklyCarryLocal;

          const pnlMove = unrealizedPnL - prevPnL;
          ctx.attributionEquityDelta += pnlMove;

          marginReq = posValueLocal * marginRate;
          maintMargin = marginReq * 0.65;
        }
        break;
      }

      case 'OPTION': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        const underlyingPrice = comp ? comp.stockPrice : pos.underlyingPrice || 100;
        const strike = pos.strike || underlyingPrice;
        const remainingWeeks = Math.max(0.1, (pos.expiryWeek || nextWeek + 4) - nextWeek);
        const tYears = remainingWeeks / 52;
        // DER — THE OPTION IS REPRICED AT THE NAME'S OWN VOLATILITY. `pos.impliedVol || 0.3` put a
        // stated 30% on every option whose row did not carry one, so a Black-Scholes price
        // computed from it was a stated price (rule 3) and no name could be riskier than another.
        // Until there is an options BOOK to imply a vol from, the honest input is the one the
        // model measures: this underlying's own realised vol. A name too new to estimate one
        // falls back to its region's index, which is estimable — no constant anywhere in the
        // chain. `marketVolComponent` rides on top, as the market-wide premium it always was.
        const nameVol = comp ? realizedAnnualVol(ringFill(v2.priceRing, rowOf(v2, comp.id), priceScratch12), 26) : undefined;
        const indexVol = realizedAnnualVol(
          regionIndexOf(state.compositeIndices, pos.region).historical, 26);
        const vol = (pos.impliedVol ?? nameVol ?? indexVol ?? 0) + ctx.marketVolComponent;
        const r = updatedRegions[pos.region].policyRate;

        const greeks = calculateBlackScholesGreeks(
          underlyingPrice,
          strike,
          tYears,
          r,
          vol,
          pos.optionType || 'CALL'
        );

        currentPrice = greeks.price;
        const contracts = pos.quantity;
        const posValueLocal = contracts * currentPrice * fxRateToUsd;
        const entryValueLocal = contracts * pos.entryPrice * fxRateToUsd;

        unrealizedPnL = pos.direction === 'LONG' ? posValueLocal - entryValueLocal : entryValueLocal - posValueLocal;

        const mult = pos.direction === 'LONG' ? 1 : -1;
        delta = mult * greeks.delta * contracts * underlyingPrice * fxRateToUsd;
        gamma = mult * greeks.gamma * contracts * underlyingPrice * fxRateToUsd;
        vega = mult * greeks.vega * contracts * fxRateToUsd;
        theta = mult * greeks.theta * contracts * fxRateToUsd;

        const carryEst = calculateExpectedCarry('OPTION', pos.direction, posValueLocal, {
          policyRate: r,
          thetaPerContractLocal: greeks.theta * fxRateToUsd,
          quantity: contracts
        });
        weeklyFinancing = carryEst.components.financingCostLocal;
        ctx.attributionCarry += carryEst.weeklyCarryLocal;

        const pnlMove = unrealizedPnL - prevPnL;
        ctx.attributionVolTheta += pnlMove * 0.4;
        ctx.attributionEquityDelta += pnlMove * 0.6;

        if (pos.direction === 'LONG') {
          marginReq = posValueLocal;
          maintMargin = posValueLocal * 0.5;
        } else {
          marginReq = (pos.notional || contracts * underlyingPrice) * 0.20 * fxRateToUsd;
          maintMargin = marginReq * 0.75;
        }
        break;
      }

      case 'XCS': {
        const fxPair = updatedFxPairs.find((p) => p.pair === pos.symbol);
        if (fxPair) {
          const maturityWeek = pos.maturityWeek || (pos.openedWeek ? pos.openedWeek + Math.round((pos.tenorYears || 5) * 52) : (pos.tenorYears ? nextWeek + Math.round(pos.tenorYears * 52) : nextWeek + 260));
          const remainingTenorYears = Math.max(0.01, (maturityWeek - nextWeek) / 52);
          const xcsPricing = priceCrossCurrencyBasisSwap(
            pos.notional,
            fxPair.rate,
            pos.entryPrice,
            fxPair.basisSpreadBps,
            remainingTenorYears,
            pos.direction as 'LONG' | 'SHORT'
          );
          currentPrice = fxPair.basisSpreadBps;
          unrealizedPnL = xcsPricing.npvLocal;
          dv01 = xcsPricing.dv01Local;

          const pnlMove = unrealizedPnL - prevPnL;
          ctx.attributionMacroRates += pnlMove;

          const carryEst = calculateExpectedCarry('XCS', pos.direction, pos.notional * fxPair.rate, {
            policyRate: updatedRegions[pos.region].policyRate,
            basisSpreadBps: fxPair.basisSpreadBps
          });
          weeklyFinancing = carryEst.components.financingCostLocal;
          ctx.attributionCarry += carryEst.weeklyCarryLocal;

          if (nextWeek >= maturityWeek) {
            pos.isClosed = true;
            ctx.weeklyRealizedPnL += unrealizedPnL;
            ctx.newsItems.push({
              id: `xcs-matured-${pos.id}-${nextWeek}`,
              week: nextWeek,
              title: `Basis Swap Matured: ${pos.name}`,
              description: `Cross-currency basis swap terminated at scheduled maturity.`,
              category: 'MACRO',
              impactBadge: '[MATURITY]',
              impactRegion: pos.region,
              urgent: false,
            });
          } else {
            marginReq = pos.notional * fxPair.rate * marginRate;
            maintMargin = marginReq * 0.6;
          }
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
    ctx.netGammaLocal += gamma;
    ctx.netVegaLocal += vega;
    ctx.netDV01Local += dv01;

    return {
      ...pos,
      currentPrice,
      unrealizedPnL,
      marginRequirement: marginReq,
      maintenanceMargin: maintMargin,
      weeklyFinancingCost: weeklyFinancing,
      delta,
      gamma,
      vega,
      theta,
      dv01
    } as Position;
  });
}
