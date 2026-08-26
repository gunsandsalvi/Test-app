
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


export function runStage_06_fx_and_trade(ctx: PipelineContext): PipelineContext {
    let updatedRegions = ctx.updatedRegions;

    // We will extract variables from ctx
        // (We will let typescript complain and manually fix it, or just use any)
      // 3. Evolve FX Pairs
  const updatedFxPairs = ctx.state.fxPairs.map((fx) => evolveFxPair(fx, updatedRegions));

  const getFxToUsd = (regionId: RegionId): number => {
    if (regionId === 'USA') return 1.0;
    if (regionId === 'EUR') {
      const eurUsd = updatedFxPairs.find((p) => p.pair === 'EUR/USD');
      return eurUsd ? eurUsd.rate : 1.08;
    }
    if (regionId === 'UK') {
      const gbpUsd = updatedFxPairs.find((p) => p.pair === 'GBP/USD');
      return gbpUsd ? gbpUsd.rate : 1.29;
    }
    if (regionId === 'JPN') {
      const usdjpy = updatedFxPairs.find((p) => p.pair === 'USD/JPY');
      return usdjpy ? 1 / usdjpy.rate : 1 / 154;
    }
    return 1.0;
  };

  // Trade Dynamics (Phase 3: T1)
  function computeRegionalCompetitiveness(companies: Company[], regionId: RegionId, category: string): number {
    const firms = companies.filter(c => c.region === regionId && isActiveCompany(c) && (c.productLines || []).some(l => l.industry === category));
    if (firms.length === 0) return 0;
    return firms.reduce((s, f) => {
      const line = f.productLines.find(l => l.industry === category)!;
      return s + line.competitiveness * line.categoryMarketShare;
    }, 0) / firms.length;
  }

  function getFxCompetitivenessAdjustment(exporter: RegionId, importer: RegionId, fxPairs: FxPair[]): number {
    const pair = fxPairs.find(f => (f.base === exporter && f.quote === importer) || (f.base === importer && f.quote === exporter));
    if (!pair || !isFinite(pair.rate) || pair.rate <= 0 || !isFinite(pair.change1W)) return 0;
    const direction = pair.base === exporter ? -1 : 1; // if exporter is the base currency, a RISING rate means exporter is depreciating (rate = quote-per-base) — cheaper exports, so flip sign
    const ratio = pair.change1W / pair.rate;
    if (!isFinite(ratio)) return 0;
    return Math.max(-0.5, Math.min(0.5, (ratio * direction * 5)));
  }

  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
  const regionExports: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  const regionImports: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  const regionCategoryExports: Record<RegionId, Record<string, number>> = {
    USA: {},
    EUR: {},
    UK: {},
    JPN: {},
  };

  regionIds.forEach(exporter => {
    regionIds.filter(r => r !== exporter).forEach(importer => {
      Object.keys(CATEGORY_TRADABILITY).forEach(cat => {
        const tradability = CATEGORY_TRADABILITY[cat];
        if (tradability < 0.1) return; // not worth computing for near-untradable categories
        const subUnits = INDUSTRY_SUBUNITS[cat as any] || [];
        const importerDemand = subUnits.reduce((s, su) => {
          const dem = updatedRegions[importer].categoryDemand[su.unitId];
          const val = dem?.demandLevelUSD;
          return s + (typeof val === 'number' && Number.isFinite(val) ? val : 0);
        }, 0);
        const exporterCompetitiveness = computeRegionalCompetitiveness(ctx.state.companies, exporter, cat);
        const fxCompetitiveness = getFxCompetitivenessAdjustment(exporter, importer, updatedFxPairs);
        const exportShareCapture = Math.max(0.05, Math.min(0.80, (0.25 + exporterCompetitiveness * 0.2 + fxCompetitiveness * 0.2)));
        if (!Number.isFinite(exportShareCapture)) throw new Error(`exportShareCapture is ${exportShareCapture}! exporterCompetitiveness=${exporterCompetitiveness}, fxCompetitiveness=${fxCompetitiveness}`);
        if (isNaN(importerDemand)) throw new Error(`importerDemand is NaN!`);
        const flow = importerDemand * tradability * (exportShareCapture / (regionIds.length - 1)); // divided among competitors
        regionExports[exporter] += flow;
        regionImports[importer] += flow;
        regionCategoryExports[exporter][cat] = (regionCategoryExports[exporter][cat] ?? 0) + flow;
      });
    });
  });

  regionIds.forEach(r => {
    updatedRegions[r].exportsUSD = regionExports[r];
    updatedRegions[r].importsUSD = regionImports[r];
    updatedRegions[r].tradeBalance = regionExports[r] - regionImports[r];
  });

        ctx.updatedRegions = updatedRegions;
    return ctx;
}
