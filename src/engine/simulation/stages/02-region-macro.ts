
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


export function runStage_02_region_macro(ctx: PipelineContext): PipelineContext {
    let prevActiveFirms = ctx.prevActiveFirms;
    let computeOccupationDemand = ctx.computeOccupationDemand;
    let nextWeek = ctx.nextWeek;
    let regionFloatingPrincipal = ctx.regionFloatingPrincipal;
    let regionTrackedHealthSignal = ctx.regionTrackedHealthSignal;
    let regionPublicCompanyEmployment = ctx.regionPublicCompanyEmployment;
    let computeTargetOwnershipShares = ctx.computeTargetOwnershipShares;

    // We will extract variables from ctx
        // (We will let typescript complain and manually fix it, or just use any)
      // 2. Evolve Multi-Region Macro States
  const globalInflationShock = (Math.random() - 0.5) * 0.0008;
  const globalGdpShock = (Math.random() - 0.5) * 0.001;

  const rateChanges: { region: RegionId; deltaBps: number }[] = [];
  const diagnosticLogs: any[] = [];
  const updatedRegions: Record<RegionId, any> = { ...ctx.state.regions };

  (Object.keys(ctx.state.regions) as RegionId[]).forEach((regionId) => {
    let equityRet = 0;
    if (regionId === 'USA') equityRet = (ctx.state.compositeIndices.us500.change1W / Math.max(1, ctx.state.compositeIndices.us500.value)) || 0;
    if (regionId === 'EUR') equityRet = (ctx.state.compositeIndices.euStoxx.change1W / Math.max(1, ctx.state.compositeIndices.euStoxx.value)) || 0;
    if (regionId === 'UK') equityRet = (ctx.state.compositeIndices.uk100.change1W / Math.max(1, ctx.state.compositeIndices.uk100.value)) || 0;
    if (regionId === 'JPN') equityRet = (ctx.state.compositeIndices.jp225.change1W / Math.max(1, ctx.state.compositeIndices.jp225.value)) || 0;

    const REGIONAL_BASE_GDP: Record<string, number> = {
      USA: 28_000_000_000_000,
      EUR: 18_000_000_000_000,
      UK: 3_400_000_000_000,
      JPN: 4_200_000_000_000
    };
    const regionFirms = prevActiveFirms.filter(f => f.region === regionId);
    
    const regionEmployment = regionFirms.reduce((sum, f) => sum + f.employeeCount, 0);
    const regionEmploymentLastWeek = ctx.state.companies.filter(f => f.region === regionId).reduce((sum, f) => sum + (f.previousEmployeeCount || f.employeeCount), 0);
    const employmentChangePct = (regionEmployment - regionEmploymentLastWeek) / Math.max(1, regionEmploymentLastWeek);
    const bottomUpUnemploymentDelta = -employmentChangePct * 0.1;
    
    const totalRegionalCapEx = regionFirms.reduce((sum, f) => sum + (f.capex || 0), 0);
    const baseGdp = REGIONAL_BASE_GDP[regionId] || 10_000_000_000_000;
    const baselineExpectedCapEx = (baseGdp * 0.03) / 52;
    const capexDeltaDollars = totalRegionalCapEx - baselineExpectedCapEx;
    const capexGdpImpactWeekly = capexDeltaDollars / baseGdp;
    const boundedGdpContribution = (capexGdpImpactWeekly * 52);

    const regionOccDemand = computeOccupationDemand(
      prevActiveFirms,
      ctx.state.regions[regionId].privateSectorSegments,
      regionId,
      ctx.state.regions[regionId].governmentEmployment
    );

    const maturedTranchesPrev = (ctx.state.regions[regionId].govDebtTranches || []).filter(t => t.maturityWeek <= nextWeek);
    const maturedPrincipalUSDPrev = maturedTranchesPrev.reduce((s, t) => s + t.principalUSD, 0);
    const weeklyDeficitUSDPrev = Math.max(0, ctx.state.regions[regionId].governmentSpendingUSD - ctx.state.regions[regionId].governmentRevenueUSD) + maturedPrincipalUSDPrev;
    const monetizationSharePrev = ((ctx.state.regions[regionId].balanceSheetStance ?? 0) * 0.5);
    const monetizedAmountUSD = weeklyDeficitUSDPrev * monetizationSharePrev;

    const { updatedRegion, rateChanged: _rateChanged, rateDeltaBps, isMeeting, diagnosticString } = evolveRegionMacro(
      ctx.state.regions[regionId],
      { gdpShock: globalGdpShock, inflationShock: globalInflationShock },
      {
        capexGdpContribution: boundedGdpContribution,
        bottomUpUnemploymentDelta,
        businessLoanBookInputUSD: regionFloatingPrincipal[regionId],
        trackedHealthSignal: regionTrackedHealthSignal[regionId],
        publicCompanyEmployment: regionPublicCompanyEmployment[regionId],
        occupationDemand: regionOccDemand,
        monetizedAmountUSD,
      },
      nextWeek,
      equityRet,
      ctx.state.commodities
    );
    updatedRegions[regionId] = updatedRegion;

    if (updatedRegion.institutionalSector) {
      const macroSector = updatedRegion.institutionalSector;
      const investmentIncomeUSD =
        ((macroSector.equityHoldingsUSD || 0) +
         (macroSector.corpBondHoldingsUSD || 0) +
         (macroSector.sovBondHoldingsUSD || 0)) *
        ((macroSector.investmentIncomeMarginPct || 0.03) / 52);

      macroSector.cashUSD = (macroSector.cashUSD || 0) + investmentIncomeUSD;
      macroSector.sectorEquityUSD = (macroSector.sectorEquityUSD || 0) + investmentIncomeUSD;
    }

    (['equity', 'corpBond', 'sovBond'] as const).forEach(assetClass => {
      const fieldName = `${assetClass}Ownership` as 'equityOwnership' | 'corpBondOwnership' | 'sovBondOwnership';
      const target = computeTargetOwnershipShares(assetClass, regionId, updatedRegion, ctx.state.regions);
      const current = updatedRegion[fieldName];
      const updatedShares = {
        bankShare: current.bankShare + (target.bankShare - current.bankShare) * 0.05,
        institutionalShare: current.institutionalShare + (target.institutionalShare - current.institutionalShare) * 0.05,
        foreignShare: Object.fromEntries((['USA','EUR','UK','JPN'] as RegionId[]).map(r => [r, current.foreignShare[r] + ((target.foreignShare[r] ?? 0) - current.foreignShare[r]) * 0.05])) as Record<RegionId, number>,
        centralBankShare: current.centralBankShare + (target.centralBankShare - current.centralBankShare) * 0.05,
      };
      const totalSharesSum = updatedShares.bankShare + updatedShares.institutionalShare + Object.values(updatedShares.foreignShare).reduce((a, b) => a + b, 0) + updatedShares.centralBankShare;
      if (totalSharesSum > 0) {
        updatedShares.bankShare /= totalSharesSum;
        updatedShares.institutionalShare /= totalSharesSum;
        Object.keys(updatedShares.foreignShare).forEach(r => {
          updatedShares.foreignShare[r as RegionId] /= totalSharesSum;
        });
        updatedShares.centralBankShare /= totalSharesSum;
      }
      updatedRegion[fieldName] = updatedShares;
    });
    if (isMeeting) {
      rateChanges.push({ region: regionId, deltaBps: rateDeltaBps });
    }
    
    // Add Macro Diagnostic Telemetry to Log
    diagnosticLogs.push({
      week: nextWeek,
      timestamp: new Date().toISOString(),
      category: 'MACRO',
      message: `[MACRO] ${regionId} GDP Breakdown:`,
      deltaText: diagnosticString,
      data: { regionId, isMeeting, rateDeltaBps }
    });
  });

  // V7: Cross-border reserve / balance-sheet stance spillover effect
  const allRegionIds = Object.keys(updatedRegions) as RegionId[];
  const globalStanceAvg = allRegionIds.reduce((s, r) => s + (updatedRegions[r].balanceSheetStance ?? 0), 0) / Math.max(1, allRegionIds.length);
  allRegionIds.forEach(r => {
    const spilloverEffect = (globalStanceAvg - (updatedRegions[r].balanceSheetStance ?? 0)) * 0.05; // pulled gently toward the global average
    updatedRegions[r].creditConditionsSpilloverAdjustment = spilloverEffect;
  });

  

        ctx.prevActiveFirms = prevActiveFirms;
    ctx.computeOccupationDemand = computeOccupationDemand;
    ctx.nextWeek = nextWeek;
    ctx.regionFloatingPrincipal = regionFloatingPrincipal;
    ctx.regionTrackedHealthSignal = regionTrackedHealthSignal;
    ctx.regionPublicCompanyEmployment = regionPublicCompanyEmployment;
    ctx.computeTargetOwnershipShares = computeTargetOwnershipShares;
    return ctx;
}
