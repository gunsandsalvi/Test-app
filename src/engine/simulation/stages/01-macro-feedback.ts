
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


export function runStage_01_macro_feedback(ctx: PipelineContext): PipelineContext {
    // We will extract variables from ctx
    
    // (We will let typescript complain and manually fix it, or just use any)
      // 1. Calculate Micro -> Macro Feedback metrics from previous corporate ctx.state
  const prevActiveFirms = ctx.state.companies.filter((c) => isActiveCompany(c));
  
  const regionFloatingPrincipal: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  prevActiveFirms.forEach(f => {
    const floatingSum = (f.debtTranches || []).filter(t => t.rateType === 'FLOATING').reduce((s, t) => s + t.principalUSD, 0);
    regionFloatingPrincipal[f.region] += floatingSum;
  });

  const regionTrackedHealthSignal: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  (['USA','EUR','UK','JPN'] as RegionId[]).forEach(rid => {
    const firms = prevActiveFirms.filter(f => f.region === rid);
    if (firms.length === 0) return;
    regionTrackedHealthSignal[rid] = firms.reduce((s, f) => s + (f.annualRevenue - f.baselineAnnualRevenue) / Math.max(1, f.baselineAnnualRevenue), 0) / firms.length;
  });

  const regionPublicCompanyEmployment: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  (['USA','EUR','UK','JPN'] as RegionId[]).forEach(rid => {
    regionPublicCompanyEmployment[rid] = prevActiveFirms.filter(f => f.region === rid).reduce((s, f) => s + f.employeeCount, 0);
  });

  const avgMargin = prevActiveFirms.reduce((sum, c) => sum + (c.ebitda / Math.max(1, c.annualRevenue)), 0) / Math.max(1, prevActiveFirms.length);
  const marginCompression = avgMargin < 0.22 ? 0.22 - avgMargin : 0.0;
  const recentDefaultsCount = ctx.state.companies.filter((c) => c.isDefaulted || c.creditRating === 'CCC').length;
  const creditContagionBps = recentDefaultsCount * 12;
  const systemicStressFactorGlobal = Math.min(0.3, creditContagionBps / 500);

    return ctx;
}
