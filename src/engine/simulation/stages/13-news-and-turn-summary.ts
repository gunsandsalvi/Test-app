
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


export function runStage_13_news_and_turn_summary(ctx: PipelineContext): PipelineContext {
    
    let updatedRegions = ctx.updatedRegions;
    let nextWeek = ctx.nextWeek;
    let updatedCompanies = ctx.updatedCompanies;
    let recentIPOs = ctx.recentIPOs;
    let diagnosticLogs = ctx.diagnosticLogs;

    // We will extract variables from ctx
        // (We will let typescript complain and manually fix it, or just use any)
      // 6. Generate Weekly Breaking News & Sentiment Shifts
  (Object.keys(updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = updatedRegions[regionId];
    const ipo = checkForIPO(regionId, reg, ctx.state.companies, nextWeek);
    if (ipo) {
      const underwritingFeePct = 0.02;
      const proceedsUSDReal = ipo.sharesOutstanding * ipo.stockPrice;
      const underwritingFeeUSD = proceedsUSDReal * underwritingFeePct;
      reg.bankingSector.bankEquityUSD += underwritingFeeUSD;
      if (!reg.bankingSector.itemizedHoldings) reg.bankingSector.itemizedHoldings = [];
      reg.bankingSector.itemizedHoldings.push({
        instrumentId: ipo.id,
        instrumentType: 'EQUITY',
        issuerRegion: regionId,
        quantityOrNotionalUSD: proceedsUSDReal * 0.05
      });
      updatedCompanies.push(ipo);
      recentIPOs.push({ ticker: ipo.ticker, name: ipo.name, category: ipo.productLines?.[0]?.industry || 'Unknown', week: nextWeek });
      if (recentIPOs.length > 20) recentIPOs.shift();
      diagnosticLogs.push({ 
        week: nextWeek,
        timestamp: new Date().toISOString(),
        category: 'MACRO',
        message: `New IPO: ${ipo.name} enters ${ipo.productLines?.[0]?.industry} amid strong demand growth`,
        deltaText: '',
        data: { regionId }
      });
    }
  });

  let workingPositions = [...ctx.state.portfolio.positions];
  
        ctx.updatedRegions = updatedRegions;
    ctx.nextWeek = nextWeek;
    ctx.updatedCompanies = updatedCompanies;
    ctx.recentIPOs = recentIPOs;
    ctx.diagnosticLogs = diagnosticLogs;
    return ctx;
}
