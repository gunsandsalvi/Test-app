
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


export function runStage_10_ipo_and_ma(ctx: PipelineContext): PipelineContext {
    let nextWeek = ctx.nextWeek;
    let updatedCompanies = ctx.updatedCompanies;
    let workingPositions = ctx.workingPositions;
    let recentMergers = ctx.recentMergers;
    let mergerNews = ctx.mergerNews;
    let diagnosticLogs = ctx.diagnosticLogs;

    // We will extract variables from ctx
        // (We will let typescript complain and manually fix it, or just use any)
      // Check for M&A Consolidation (Part AH)
  if (nextWeek % 13 === 0) {
    const merger = checkForMerger(updatedCompanies, nextWeek);
    if (merger) {
      const acquirer = updatedCompanies.find(c => c.ticker === merger.acquirerTicker);
      const target = updatedCompanies.find(c => c.ticker === merger.targetTicker);
      if (acquirer && target && isActiveCompany(acquirer) && isActiveCompany(target)) {
        const purchasePrice = target.marketCap * 1.15;
        const cashPaid = purchasePrice * 0.5;
        const stockPaid = purchasePrice * 0.5;

        acquirer.cash = Math.max(10, acquirer.cash - cashPaid);
        const newShares = stockPaid / Math.max(1, acquirer.stockPrice);
        acquirer.sharesOutstanding = Number((acquirer.sharesOutstanding + newShares).toFixed(3));
        acquirer.annualRevenue = Number((acquirer.annualRevenue + target.annualRevenue * 0.85).toFixed(1));
        acquirer.employeeCount += Math.round(target.employeeCount * 0.75);

        // Merge product lines
        if (target.productLines && acquirer.productLines) {
          target.productLines.forEach(tpl => {
            const existingPl = acquirer.productLines?.find(apl => apl.subUnitId === tpl.subUnitId);
            if (existingPl) {
              existingPl.categoryMarketShare = Number((existingPl.categoryMarketShare + tpl.categoryMarketShare).toFixed(4));
            } else {
              acquirer.productLines?.push({ ...tpl });
            }
          });
        }
        target.productLines = [];

        // Transfer debt
        if (target.debtTranches) {
          target.debtTranches.forEach(t => {
            const transferredTranche = { ...t, id: `${t.id}-acq-${nextWeek}` };
            if (!acquirer.debtTranches) acquirer.debtTranches = [];
            acquirer.debtTranches.push(transferredTranche);

            // Update any portfolio positions holding this tranche
            workingPositions = workingPositions.map(p => {
              if (p.symbol === target.ticker && p.trancheId === t.id) {
                return { ...p, symbol: acquirer.ticker, trancheId: transferredTranche.id };
              }
              return p;
            });
          });
          acquirer.totalDebt = (acquirer.debtTranches || []).reduce((s, t) => s + t.principalUSD, 0);
        }
        target.debtTranches = [];
        target.totalDebt = 0;

        // Target is absorbed and exits active operations
        target.mergerAcquired = true;
        target.acquiredByTicker = acquirer.ticker;
        target.isDefaulted = false;
        target.stockPrice = 0;
        target.employeeCount = 0;
        target.annualRevenue = 0;
        target.marketCap = 0;
        target.capex = 0;
        target.maintenanceCapex = 0;
        target.growthCapex = 0;

        recentMergers.push({
          acquirerTicker: acquirer.ticker,
          acquirerName: acquirer.name,
          targetTicker: target.ticker,
          targetName: target.name,
          week: nextWeek,
          dealValueUSD: purchasePrice
        });
        if (recentMergers.length > 20) recentMergers.shift();

        mergerNews.push({
          id: `merger-${merger.acquirerTicker}-${merger.targetTicker}-${nextWeek}`,
          week: nextWeek,
          title: merger.title,
          description: merger.description,
          category: 'EARNINGS',
          impactBadge: '[M&A MERGER]',
          impactRegion: acquirer.region,
          impactSector: acquirer.sector,
          sentimentDelta: 0.10,
          affectedTicker: acquirer.ticker,
          urgent: true,
        });

        diagnosticLogs.push({
          week: nextWeek,
          timestamp: new Date().toISOString(),
          category: 'MICRO',
          message: `Merger Executed: ${acquirer.name} acquired ${target.name}`,
          deltaText: '',
          data: { acquirer: acquirer.ticker, target: target.ticker }
        });
      }
    }
  }

        ctx.nextWeek = nextWeek;
    ctx.updatedCompanies = updatedCompanies;
    ctx.workingPositions = workingPositions;
    ctx.recentMergers = recentMergers;
    ctx.mergerNews = mergerNews;
    ctx.diagnosticLogs = diagnosticLogs;
    return ctx;
}
