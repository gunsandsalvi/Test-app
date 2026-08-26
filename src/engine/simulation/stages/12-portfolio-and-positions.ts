
import { isActiveCompany } from '../../../domain/company';
import { CreditRating, NewsItem, Portfolio, ReturnAttribution, DebtTranche, GovDebtTranche, SupplyRelationship } from '../../../types';
import { SECTOR_BENCHMARKS, priceEquity, priceCorporateBond, priceInterestRateSwap, priceCreditDefaultSwap, priceLeveragedLoan, priceCrossCurrencyBasisSwap } from '../../pricing';
import { calculateNelsonSiegelZeroRate, priceSovereignBond } from '../../nelsonSiegel';
import { EarningsReportEvent, generateWeeklyNews } from '../../newsGenerator';
import { formatCurrency, formatQuarterFilingDate, formatSimulationDate } from '../../formatters';
import { getUnifiedInitialMarginRate } from '../../dealers';
import { calculateBlackScholesGreeks } from '../../blackScholes';
import { calculateExpectedCarry } from '../../carryCalculator';
import { CORPORATE_DEMAND_INTENSITY } from "../../domain/industry";
import { GameState, Company, Region, RegionId, Position, FxPair, CATEGORY_TRADABILITY, OccupationType, OccupationPool, SECTOR_OCCUPATION_MIX, PRIVATE_SEGMENT_OCCUPATION_MIX, PrivateSectorSegment, CATEGORY_INPUT_REQUIREMENTS, AssetOwnershipShares, ItemizedHolding, INDUSTRY_SUBUNITS, Industry, UnitBid, UnitOffer, SupplyContract, SegmentFinancial } from '../../../types';
import { determineCreditRating } from '../credit';
import { checkForIPO } from '../ipo';
import { checkForMerger } from '../merger';
import { SECTOR_PRICING_POWER, SECTOR_WAGE_SENSITIVITY } from '../constants';
import { evolveRegionMacro, evolveFxPair, evolveCommodity, calculateCompositeIndices } from '../../macroEngine';
import { FIXED_SHARE_BY_RATING, buildQuarterlyFundamentalSnapshot } from '../../companyGenerator';
import { PipelineContext } from '../pipeline';


export function runStage_12_portfolio_and_positions(ctx: PipelineContext): PipelineContext {
    
    let updatedCompanies = ctx.updatedCompanies;
    let updatedRegions = ctx.updatedRegions;
    let updatedCommodities = ctx.updatedCommodities;
    let workingPositions = ctx.workingPositions;
    let getFxToUsd = ctx.getFxToUsd;
    let newsItems = ctx.newsItems;
    let nextWeek = ctx.nextWeek;
    let computeSupplyDemandPremium = ctx.computeSupplyDemandPremium;
    let marketVolComponent = ctx.marketVolComponent;
    let updatedFxPairs = ctx.updatedFxPairs;

    // We will extract variables from ctx
        // (We will let typescript complain and manually fix it, or just use any)
      // 7. Calculate Updated Composite Benchmark Indices
  const updatedCompositeIndices = calculateCompositeIndices(
    updatedCompanies,
    updatedRegions,
    updatedCommodities,
    ctx.state.compositeIndices
  );

  // 8. Portfolio Mark-to-Market, Accruals, Attribution, and Margin Engine
  let weeklyInterestIncomeUSD = 0;
  let weeklyFinancingCostUSD = 0;
  let weeklyRealizedCashUSD = 0;
  let weeklyRealizedPnL = 0;
  let closedCount = 0;
  let totalRequiredMarginUSD = 0;
  let maintenanceMarginUSD = 0;
  let netDeltaUSD = 0;
  let netGammaUSD = 0;
  let netVegaUSD = 0;
  let netDV01USD = 0;

  let attributionCarry = 0;
  let attributionMacroRates = 0;
  let attributionCreditSpread = 0;
  let attributionEquityDelta = 0;
  let attributionVolTheta = 0;

  const usdPolicyRate = updatedRegions.USA.policyRate;
  weeklyInterestIncomeUSD = Math.max(0, ctx.state.portfolio.cashUSD) * (usdPolicyRate / 52);
  attributionCarry += weeklyInterestIncomeUSD;

  const updatedPositions: Position[] = workingPositions.map((pos) => {
    const fxRateToUsd = getFxToUsd(pos.region);
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
          const posValueUSD = pos.quantity * currentPrice * fxRateToUsd;
          const entryValueUSD = pos.quantity * pos.entryPrice * fxRateToUsd;

          unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
          delta = pos.direction === 'LONG' ? posValueUSD : -posValueUSD;

          const carryEst = calculateExpectedCarry('EQUITY', pos.direction, posValueUSD, {
            policyRate: updatedRegions[pos.region].policyRate,
            dividendYield: comp.dividendYield || 0.018
          });
          
          weeklyFinancing = carryEst.components.financingCostUSD;
          attributionCarry += carryEst.weeklyCarryUSD;

          marginReq = posValueUSD * marginRate;
          maintMargin = marginReq * 0.65;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionEquityDelta += pnlMove;
        }
        break;
      }

      case 'LEVERAGED_LOAN':
      case 'CORP_BOND': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        if (comp) {
          const tranche = comp.debtTranches.find(t => t.id === pos.trancheId);
          if (!tranche) {
            currentPrice = comp.isDefaulted ? (comp.recoveryRate * 100) : 100;
            const posValueUSD = pos.quantity * (currentPrice / 100) * fxRateToUsd;
            const entryValueUSD = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
            unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
            
            if (pos.direction === 'LONG') {
              weeklyRealizedCashUSD += posValueUSD; 
            } else {
              weeklyRealizedCashUSD -= posValueUSD;
            }
            weeklyRealizedPnL += unrealizedPnL;
            pos.isClosed = true;
            closedCount++;
            
            newsItems.push({
              id: `redemption-${pos.id}-${nextWeek}`,
              week: nextWeek,
              title: `Tranche Matured: ${pos.name}`,
              description: `Your position in ${pos.symbol} has been redeemed at ${currentPrice.toFixed(1)} points of par.`,
              category: 'CREDIT',
              impactBadge: '[REDEMPTION]',
              impactRegion: pos.region,
              sentimentDelta: 0,
              affectedTicker: comp.ticker,
              urgent: true
            });
            break;
          }

          const remainingTenorYears = Math.max(0.01, (tranche.maturityWeek - nextWeek) / 52);
          const totalCorpBondPrincipalOutstanding = updatedCompanies.filter(c => c.region === pos.region).reduce((s, c) => s + c.totalDebt, 0);
          const corpBondPremium = computeSupplyDemandPremium(
            updatedRegions[pos.region].corpBondOwnership,
            { bank: updatedRegions[pos.region].bankingSector.bankEquityUSD, institutional: updatedRegions[pos.region].institutionalSector.sectorEquityUSD },
            totalCorpBondPrincipalOutstanding
          );
          const adjustedOasSpreadBps = comp.oasSpreadBps * (1 - corpBondPremium);

          if (tranche.rateType === 'FIXED') {
            const bondPriced = priceCorporateBond(
              remainingTenorYears,
              tranche.couponRate ?? 0.05,
              sovParams,
              adjustedOasSpreadBps,
              comp.isDefaulted,
              comp.recoveryRate
            );
            currentPrice = bondPriced.price;
            const posValueUSD = pos.quantity * (currentPrice / 100) * fxRateToUsd;
            const entryValueUSD = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
            unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
            dv01 = (pos.quantity / 100) * bondPriced.dv01 * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);

            const carryEst = calculateExpectedCarry('CORP_BOND', pos.direction, posValueUSD, {
              policyRate: updatedRegions[pos.region].policyRate,
              couponRate: tranche.couponRate ?? 0.05,
              cdsSpreadBps: comp.oasSpreadBps
            });
            weeklyFinancing = carryEst.components.financingCostUSD;
            attributionCarry += carryEst.weeklyCarryUSD;
            const pnlMove = unrealizedPnL - prevPnL;
            attributionCreditSpread += pnlMove * 0.7;
            attributionMacroRates += pnlMove * 0.3;
            marginReq = pos.notional * fxRateToUsd * marginRate;
            maintMargin = marginReq * 0.65;
          } else {
            const loanPricing = priceLeveragedLoan(
              tranche.floatingMarginBps ?? 200,
              adjustedOasSpreadBps,
              remainingTenorYears,
              comp.isDefaulted,
              comp.recoveryRate
            );
            currentPrice = loanPricing.pricePar;
            const posValueUSD = pos.quantity * (currentPrice / 100) * fxRateToUsd;
            const entryValueUSD = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
            unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
            const carryEst = calculateExpectedCarry('LEVERAGED_LOAN', pos.direction, posValueUSD, {
              policyRate: updatedRegions[pos.region].policyRate,
              cdsSpreadBps: tranche.floatingMarginBps ?? 200
            });
            weeklyFinancing = carryEst.components.financingCostUSD;
            attributionCarry += carryEst.weeklyCarryUSD;
            const pnlMove = unrealizedPnL - prevPnL;
            attributionCreditSpread += pnlMove * 0.8;
            attributionMacroRates += pnlMove * 0.2;
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
        const posValueUSD = pos.quantity * (currentPrice / 100) * fxRateToUsd;
        const entryValueUSD = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;

        unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
        dv01 = (pos.quantity / 100) * bondPriced.dv01 * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);

        const carryEst = calculateExpectedCarry('SOV_BOND', pos.direction, posValueUSD, {
          policyRate: updatedRegions[pos.region].policyRate,
          couponRate: pos.fixedRate || 0.04
        });
        weeklyFinancing = carryEst.components.financingCostUSD;
        attributionCarry += carryEst.weeklyCarryUSD;

        const pnlMove = unrealizedPnL - prevPnL;
        attributionMacroRates += pnlMove;

        // Check sovereign bond maturity
        if (nextWeek >= maturityWeek) {
          pos.isClosed = true;
          closedCount++;
          const redemptionCash = pos.quantity * 1.0 * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);
          weeklyRealizedCashUSD += redemptionCash;
          weeklyRealizedPnL += unrealizedPnL;
          newsItems.push({
            id: `sov-matured-${pos.id}-${nextWeek}`,
            week: nextWeek,
            title: `Sovereign Bond Matured: ${pos.name}`,
            description: `Your ${pos.region} bond position matured at week ${nextWeek} and was redeemed at par (100).`,
            category: 'MACRO',
            impactBadge: '[MATURITY]',
            impactRegion: pos.region,
            sentimentDelta: 0,
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
          pos.direction as any,
          sovParams
        );
        currentPrice = irsPricing.currentParRate;
        unrealizedPnL = irsPricing.npv * fxRateToUsd;
        dv01 = irsPricing.dv01 * fxRateToUsd;

        const carryEst = calculateExpectedCarry('IRS', pos.direction as any, pos.notional * fxRateToUsd, {
          policyRate: updatedRegions[pos.region].policyRate,
          fixedRate: pos.fixedRate || 0.04,
          floatingRate: updatedRegions[pos.region].policyRate
        });
        weeklyFinancing = carryEst.components.financingCostUSD;
        attributionCarry += carryEst.weeklyCarryUSD;

        const pnlMove = unrealizedPnL - prevPnL;
        attributionMacroRates += pnlMove;

        // Check IRS maturity
        if (nextWeek >= maturityWeek) {
          pos.isClosed = true;
          closedCount++;
          weeklyRealizedPnL += unrealizedPnL;
          weeklyRealizedCashUSD += unrealizedPnL;
          newsItems.push({
            id: `irs-matured-${pos.id}-${nextWeek}`,
            week: nextWeek,
            title: `IRS Expired at Maturity: ${pos.name}`,
            description: `Your interest rate swap terminated at its scheduled maturity date.`,
            category: 'MACRO',
            impactBadge: '[EXPIRY]',
            impactRegion: pos.region,
            sentimentDelta: 0,
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
            comp.oasSpreadBps,
            remainingTenorYears,
            pos.direction as any,
            sovParams,
            comp.recoveryRate,
            comp.isDefaulted
          );
          currentPrice = cdsPricing.currentCdsSpreadBps;
          unrealizedPnL = cdsPricing.npv * fxRateToUsd;

          const carryEst = calculateExpectedCarry('CDS', pos.direction as any, pos.notional * fxRateToUsd, {
            policyRate: updatedRegions[pos.region].policyRate,
            cdsSpreadBps: pos.entryPrice
          });
          weeklyFinancing = carryEst.components.financingCostUSD;
          attributionCarry += carryEst.weeklyCarryUSD;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionCreditSpread += pnlMove;

          // Check CDS maturity or default settlement
          if (!isActiveCompany(comp)) {
            pos.isClosed = true;
            closedCount++;
            weeklyRealizedPnL += unrealizedPnL;
            weeklyRealizedCashUSD += unrealizedPnL;
          } else if (nextWeek >= maturityWeek) {
            pos.isClosed = true;
            closedCount++;
            weeklyRealizedPnL += unrealizedPnL;
            weeklyRealizedCashUSD += unrealizedPnL;
            newsItems.push({
              id: `cds-expired-${pos.id}-${nextWeek}`,
              week: nextWeek,
              title: `CDS Protection Expired: ${pos.name}`,
              description: `Credit Default Swap contract expired with no default credit trigger.`,
              category: 'CREDIT',
              impactBadge: '[EXPIRY]',
              impactRegion: pos.region,
              sentimentDelta: 0,
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

          const notionalUSD = pos.notional * fxRateToUsd;
          const priceReturnUSD = notionalUSD * assetReturn;

          const carryEst = calculateExpectedCarry('TRS', pos.direction, notionalUSD, {
            policyRate: regPolicyRate,
            dividendYield: comp.dividendYield || 0.02
          });
          weeklyFinancing = carryEst.components.financingCostUSD;
          attributionCarry += carryEst.weeklyCarryUSD;

          unrealizedPnL = pos.direction === 'LONG' ? priceReturnUSD : -priceReturnUSD;
          delta = pos.direction === 'LONG' ? notionalUSD : -notionalUSD;
          const pnlMove = unrealizedPnL - prevPnL;
          attributionEquityDelta += pnlMove;

          marginReq = notionalUSD * marginRate;
          maintMargin = marginReq * 0.65;
        }
        break;
      }

      case 'COMMODITY': {
        const comm = updatedCommodities.find((c) => c.symbol === pos.symbol || c.id === pos.symbol);
        if (comm) {
          currentPrice = comm.spotPrice;
          const posValueUSD = pos.quantity * currentPrice;
          const entryValueUSD = pos.quantity * pos.entryPrice;

          unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
          delta = pos.direction === 'LONG' ? posValueUSD : -posValueUSD;

          const carryEst = calculateExpectedCarry('COMMODITY', pos.direction, posValueUSD, {
            policyRate: updatedRegions.USA.policyRate,
            convenienceYield: comm.convenienceYield
          });
          weeklyFinancing = carryEst.components.financingCostUSD;
          attributionCarry += carryEst.weeklyCarryUSD;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionEquityDelta += pnlMove;

          marginReq = posValueUSD * marginRate;
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
        const vol = (pos.impliedVol || 0.3) + marketVolComponent;
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
        const posValueUSD = contracts * currentPrice * fxRateToUsd;
        const entryValueUSD = contracts * pos.entryPrice * fxRateToUsd;

        unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;

        const mult = pos.direction === 'LONG' ? 1 : -1;
        delta = mult * greeks.delta * contracts * underlyingPrice * fxRateToUsd;
        gamma = mult * greeks.gamma * contracts * underlyingPrice * fxRateToUsd;
        vega = mult * greeks.vega * contracts * fxRateToUsd;
        theta = mult * greeks.theta * contracts * fxRateToUsd;

        const carryEst = calculateExpectedCarry('OPTION', pos.direction, posValueUSD, {
          policyRate: r,
          thetaPerContractUSD: greeks.theta * fxRateToUsd,
          quantity: contracts
        });
        weeklyFinancing = carryEst.components.financingCostUSD;
        attributionCarry += carryEst.weeklyCarryUSD;

        const pnlMove = unrealizedPnL - prevPnL;
        attributionVolTheta += pnlMove * 0.4;
        attributionEquityDelta += pnlMove * 0.6;

        if (pos.direction === 'LONG') {
          marginReq = posValueUSD;
          maintMargin = posValueUSD * 0.5;
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
            pos.direction as any
          );
          currentPrice = fxPair.basisSpreadBps;
          unrealizedPnL = xcsPricing.npvUSD;
          dv01 = xcsPricing.dv01USD;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionMacroRates += pnlMove;

          const carryEst = calculateExpectedCarry('XCS', pos.direction, pos.notional * fxPair.rate, {
            policyRate: updatedRegions[pos.region].policyRate,
            basisSpreadBps: fxPair.basisSpreadBps
          });
          weeklyFinancing = carryEst.components.financingCostUSD;
          attributionCarry += carryEst.weeklyCarryUSD;

          if (nextWeek >= maturityWeek) {
            pos.isClosed = true;
            closedCount++;
            weeklyRealizedPnL += unrealizedPnL;
            weeklyRealizedCashUSD += unrealizedPnL;
            newsItems.push({
              id: `xcs-matured-${pos.id}-${nextWeek}`,
              week: nextWeek,
              title: `Basis Swap Matured: ${pos.name}`,
              description: `Cross-currency basis swap terminated at scheduled maturity.`,
              category: 'MACRO',
              impactBadge: '[MATURITY]',
              impactRegion: pos.region,
              sentimentDelta: 0,
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
          attributionMacroRates += pnlMove;
        }
        break;
      }
    }

    weeklyFinancingCostUSD += weeklyFinancing;
    totalRequiredMarginUSD += marginReq;
    maintenanceMarginUSD += maintMargin;
    netDeltaUSD += delta;
    netGammaUSD += gamma;
    netVegaUSD += vega;
    netDV01USD += dv01;

  });
        ctx.updatedCompanies = updatedCompanies;
    ctx.updatedRegions = updatedRegions;
    ctx.updatedCommodities = updatedCommodities;
    ctx.workingPositions = workingPositions;
    ctx.getFxToUsd = getFxToUsd;
    ctx.newsItems = newsItems;
    ctx.nextWeek = nextWeek;
    ctx.computeSupplyDemandPremium = computeSupplyDemandPremium;
    ctx.marketVolComponent = marketVolComponent;
    ctx.updatedFxPairs = updatedFxPairs;
    return ctx;
}
