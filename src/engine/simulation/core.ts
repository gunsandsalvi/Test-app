import { GameState, Company, Region, Position, FxPair, AssetOwnershipShares, ItemizedHolding, PrivateSectorSegment, SupplyContract, SegmentFinancial, NewsItem, DebtTranche, GovDebtTranche, Portfolio } from '../../types';
import { RegionId, OccupationType, OccupationPool, Sector } from '../../types';
import { Industry, INDUSTRY_SUBUNITS, CORPORATE_DEMAND_INTENSITY } from '../../domain/industry';
import { CATEGORY_TRADABILITY, PRIVATE_SEGMENT_OCCUPATION_MIX, SECTOR_OCCUPATION_MIX } from '../../domain/region-macro';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../domain/market-microstructure';
import { UnitBid, UnitOffer } from '../../types';
import { PrivateSegmentType } from '../../types';
import { calculateBlackScholesGreeks } from '../blackScholes';
import { calculateExpectedCarry } from '../carryCalculator';
import { calculateNelsonSiegelZeroRate, priceSovereignBond } from '../nelsonSiegel';
import { priceCorporateBond, SECTOR_BENCHMARKS, priceEquity, priceLeveragedLoan, priceInterestRateSwap, priceCreditDefaultSwap, priceCrossCurrencyBasisSwap } from '../pricing';
import { getUnifiedInitialMarginRate } from '../dealers';
import { formatCurrency, formatQuarterFilingDate, formatSimulationDate } from '../formatters';
import { evolveRegionMacro, evolveFxPair, evolveCommodity, getBlendedWageGrowth } from '../macro/evolution';
import { determineCreditRating } from './credit';
import { checkForIPO } from './ipo';
import { checkForMerger } from './merger';
import { isActiveCompany } from '../../domain/company';
import { getSimulationDate } from '../formatters';
import { SECTOR_PRICING_POWER, SECTOR_WAGE_SENSITIVITY } from './constants';
import { FIXED_SHARE_BY_RATING, buildQuarterlyFundamentalSnapshot } from '../companyGenerator';
import { generateWeeklyNews } from '../newsGenerator';
import { calculateCompositeIndices } from '../macro/indices';

export function computeExpectedLossSpreadBps(comp: Company): number {
  const interestExpense = comp.debtTranches?.reduce((sum, t) => {
    const rate = t.rateType === 'FIXED' 
      ? (t.couponRate ?? 0.05) 
      : (0.05 + (t.floatingMarginBps ?? 200) / 10000);
    return sum + t.principalUSD * rate;
  }, 0) || 1;
  const coverage = comp.ebitda / interestExpense;
  const leverage = comp.totalDebt / (comp.ebitda || 1);
  const score = leverage - coverage;
  const pd = 1 / (1 + Math.exp(-score));
  const recoveryRate = 0.4;
  return pd * (1 - recoveryRate) * 10000;
}

export function getRatingBucket(rating: string): 'IG' | 'HY' {
  return ['AAA', 'AA', 'A', 'BBB'].includes(rating) ? 'IG' : 'HY';
}

export function computeBucketDemandPremiumBps(bucket: 'IG' | 'HY', reg: Region, allCompaniesInBucket: Company[]): number {
  const demand = reg.laggedCorporateDemandBase ?? 100; // Use lagged corporate demand as proxy for corporate bond demand
  const supply = allCompaniesInBucket.reduce((sum, c) => sum + (c.totalDebt ?? 0), 0) || 100;
  const ratio = demand / supply;
  return (1 - ratio) * 200;
}

export function computeOccupationDemand(companies: Company[], privateSegments: PrivateSectorSegment[], regionId: string, governmentEmployment?: number): Record<string, number> {
  return {};
}

export function formSupplyRelationships(regionId: RegionId, companies: Company[]): Company[] {
  return companies;
}

export function computeTargetOwnershipShares(assetClass: string, regionId: string, region: Region, allRegions: Record<string, Region>): any {
  return { bankShare: 0.25, institutionalShare: 0.25, householdShare: 0.25, foreignShare: 0.25 };
}

export function computeSupplyDemandPremium(
  shares: any,
  capacities: { bank: number, institutional: number },
  totalOutstanding: number
): number {
  const demand = (capacities.bank * (shares.bankShare ?? 0.25)) + (capacities.institutional * (shares.institutionalShare ?? 0.25));
  const supply = totalOutstanding || 1;
  const ratio = demand / supply;
  return (1 - ratio) * 200;
}

export function attributeItemizedHoldings(entities: any, portfolio: any): any[] { return []; 
}

export const STANDARD_CORP_TENOR_YEARS = 5;

export function advanceWeeklyStep(state: GameState): GameState {

  const nextWeek = state.currentWeek + 1;
  const currentWeekMod13 = ((nextWeek - 1) % 13) + 1;
  const companyUpdates: Record<string, any> = {};
  const prevActiveFirms = state.companies.filter(isActiveCompany);
  const recentIPOs: any[] = [];
  const recentMergers: any[] = [];
  const diagnosticLogs: any[] = [];
  const newsItems: any[] = [];
  const rateChanges: any[] = [];
  const ratingChanges: any[] = [];
  const earningsReportedThisTurn: any[] = [];
  const defaultedTickers: any[] = [];
  const mergerNews: any[] = [];
  let updatedRegions = { ...state.regions };
  let updatedFxPairs = [...state.fxPairs];
  let updatedCompanies = [...state.companies];
  const updatedInstitutionalEntities = [...state.institutionalEntities];
  let updatedCommodities = [...state.commodities];
  let updatedCompositeIndices = { ...state.compositeIndices };
  let marketVolPremium = state.marketVolPremium || 0;
  let workingPositions = [...state.portfolio.positions];

    // === STAGE 01-macro-feedback.ts ===

    
    
    
      // 1. Calculate Micro -> Macro Feedback metrics from previous corporate state

  
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
  const recentDefaultsCount = state.companies.filter((c) => c.isDefaulted || c.creditRating === 'CCC').length;
  const creditContagionBps = recentDefaultsCount * 12;
  const systemicStressFactorGlobal = Math.min(0.3, creditContagionBps / 500);

    
    // === STAGE 02-region-macro.ts ===

    
    
    
    
    
    
    

    
        
      // 2. Evolve Multi-Region Macro States
  const globalInflationShock = (Math.random() - 0.5) * 0.0008;
  const globalGdpShock = (Math.random() - 0.5) * 0.001;

  
  
  updatedRegions = { ...state.regions };

  (Object.keys(state.regions) as RegionId[]).forEach((regionId) => {
    let equityRet = 0;
    if (regionId === 'USA') equityRet = (state.compositeIndices.us500.change1W / Math.max(1, state.compositeIndices.us500.value)) || 0;
    if (regionId === 'EUR') equityRet = (state.compositeIndices.euStoxx.change1W / Math.max(1, state.compositeIndices.euStoxx.value)) || 0;
    if (regionId === 'UK') equityRet = (state.compositeIndices.uk100.change1W / Math.max(1, state.compositeIndices.uk100.value)) || 0;
    if (regionId === 'JPN') equityRet = (state.compositeIndices.jp225.change1W / Math.max(1, state.compositeIndices.jp225.value)) || 0;

    const REGIONAL_BASE_GDP: Record<string, number> = {
      USA: 28_000_000_000_000,
      EUR: 18_000_000_000_000,
      UK: 3_400_000_000_000,
      JPN: 4_200_000_000_000
    };
    const regionFirms = prevActiveFirms.filter(f => f.region === regionId);
    
    const regionEmployment = regionFirms.reduce((sum, f) => sum + f.employeeCount, 0);
    const regionEmploymentLastWeek = state.companies.filter(f => f.region === regionId).reduce((sum, f) => sum + (f.previousEmployeeCount || f.employeeCount), 0);
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
      state.regions[regionId].privateSectorSegments,
      regionId,
      state.regions[regionId].governmentEmployment
    );

    const maturedTranchesPrev = (state.regions[regionId].govDebtTranches || []).filter(t => t.maturityWeek <= nextWeek);
    const maturedPrincipalUSDPrev = maturedTranchesPrev.reduce((s, t) => s + t.principalUSD, 0);
    const weeklyDeficitUSDPrev = Math.max(0, state.regions[regionId].governmentSpendingUSD - state.regions[regionId].governmentRevenueUSD) + maturedPrincipalUSDPrev;
    const monetizationSharePrev = ((state.regions[regionId].balanceSheetStance ?? 0) * 0.5);
    const monetizedAmountUSD = weeklyDeficitUSDPrev * monetizationSharePrev;

    const { updatedRegion, rateChanged: _rateChanged, rateDeltaBps, isMeeting, diagnosticString } = evolveRegionMacro(
      state.regions[regionId],
      { gdpShock: globalGdpShock, inflationShock: globalInflationShock },
      {
        capexGdpContribution: boundedGdpContribution,
        bottomUpUnemploymentDelta,
        businessLoanBookInputUSD: regionFloatingPrincipal[regionId],
        trackedHealthSignal: regionTrackedHealthSignal[regionId],
        publicCompanyEmployment: regionPublicCompanyEmployment[regionId],
        occupationDemand: regionOccDemand,
        monetizedAmountUSD, marginCompression: 0, creditContagionBps: 0,
      },
      nextWeek,
      equityRet,
      state.commodities
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
      const target = computeTargetOwnershipShares(assetClass, regionId, updatedRegion, state.regions);
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

  

        
    
    
    
    
    
    
    
    // === STAGE 03-category-demand.ts ===

    
    
    
    

  Object.keys(updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;
    
        
        const categorySupplyGrowth: Record<string, number> = {};
    (Object.keys(reg.categoryDemand) as string[]).forEach(cat => {
      const firmsInCat = prevActiveFirms.filter(f => f.region === regionId && (f.productLines || []).some(l => l.subUnitId === cat));
      if (firmsInCat.length === 0) { categorySupplyGrowth[cat] = 0; return; }
      categorySupplyGrowth[cat] = firmsInCat.reduce((s, f) => {
        const line = f.productLines.find(l => l.subUnitId === cat)!;
        return s + (f.growthCapex / Math.max(1, f.annualRevenue)) * line.revenueShare;
      }, 0) / firmsInCat.length;
    });

    // Compute active GDP components for bottom-up demand targets
    const C = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const G = reg.governmentSpendingUSD * 52 * 0.35 * (1 + reg.fiscalStanceScore * 0.25);
    const rawCorporateDemandBase = prevActiveFirms.filter(f => f.region === regionId).reduce((s, f) => s + f.capex, 0);
    const newLaggedCorporateDemandBase = reg.laggedCorporateDemandBase * 0.95 + rawCorporateDemandBase * 0.05;
    reg.laggedCorporateDemandBase = newLaggedCorporateDemandBase;
    const I = newLaggedCorporateDemandBase;

    let totalHhWeight = 0;
    let totalGovWeight = 0;
    let totalCorpWeight = 0;

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        totalHhWeight += su.buyerMix.HOUSEHOLD;
        totalGovWeight += su.buyerMix.GOVERNMENT;
        totalCorpWeight += su.buyerMix.CORPORATE;
      });
    });

    const allTargets: Record<string, number> = {};
    const smoothingByCategory: Record<string, number> = {};

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        const suHhDemand = totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0;
        const suGovDemand = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
        const suCorpDemand = totalCorpWeight > 0 ? (su.buyerMix.CORPORATE / totalCorpWeight) * I : 0;
        allTargets[su.unitId] = suHhDemand + suGovDemand + suCorpDemand;
        
        if (su.buyerMix.HOUSEHOLD > 0.5) smoothingByCategory[su.unitId] = 0.1;
        else if (su.buyerMix.GOVERNMENT > 0.5) smoothingByCategory[su.unitId] = 0.05;
        else smoothingByCategory[su.unitId] = 0.08;
      });
    });

    Object.keys(allTargets).forEach((cat) => {
      const target = allTargets[cat]!;
      if (isNaN(target)) {
        diagnosticLogs.push({
          week: nextWeek,
          level: 'ERROR',
          message: `NaN target demand for category ${cat} in region ${regionId}. C=${C}, G=${G}, I=${I}`,
        });
      }
      const smoothing = smoothingByCategory[cat] ?? 0.1;
      const existingEntry = reg.categoryDemand[cat as keyof typeof reg.categoryDemand];
      const hasPriorDemand = Boolean(existingEntry && existingEntry.demandLevelUSD > 0);
      const prevLevel = hasPriorDemand ? existingEntry.demandLevelUSD : target;
      const newLevel = hasPriorDemand ? prevLevel * (1 - smoothing) + target * smoothing : target;
      const isStartupTransition = (state.currentWeek <= 1) || prevLevel < newLevel * 0.2 || newLevel < prevLevel * 0.2;
      const rawGrowthAnnual = hasPriorDemand && prevLevel > 0 && !isStartupTransition ? ((newLevel / prevLevel) - 1) * 52 : 0;
      const growthAnnual = Number.isFinite(rawGrowthAnnual) ? rawGrowthAnnual : 0;
      const prevHistory = existingEntry?.demandHistory ?? [];
      const crowdingIntensity = Math.max(0, Math.min(1, (categorySupplyGrowth[cat] ?? 0) * 8 - (target ? growthAnnual : 0)));
      (reg.categoryDemand as any)[cat] = {
        demandLevelUSD: newLevel,
        demandGrowthAnnual: growthAnnual,
        demandHistory: [...prevHistory.slice(-25), newLevel],
        crowdingIntensity,
        inventoryLevelUSD: existingEntry?.inventoryLevelUSD ?? (newLevel * 0.10),
        inputCostPressure: existingEntry?.inputCostPressure ?? 0,
        clearedInputPriceIndex: existingEntry?.clearedInputPriceIndex ?? 1.0,
        lastWeekInventoryLevelUSD: existingEntry?.lastWeekInventoryLevelUSD ?? existingEntry?.inventoryLevelUSD ?? (newLevel * 0.10),
      };
    });

    // Supply Relationships
    if (state.currentWeek % 13 === 0 || !(reg as any).supplyRelationships || (reg as any).supplyRelationships.length === 0) {
      (reg as any).supplyRelationships = formSupplyRelationships(regionId, prevActiveFirms);
    }
    
  });
        
    
    
    
    
    // === STAGE 04-input-output.ts ===

    

  Object.keys(updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;
    
        
        // Stage 4: Input-Output Map + Weekly Clearing Bidding
    Object.keys(CATEGORY_INPUT_REQUIREMENTS).forEach(cat => {
      const requirements = CATEGORY_INPUT_REQUIREMENTS[cat];
      if (!requirements) return;
      Object.entries(requirements).forEach(([inputCat, intensity]) => {
        const supplier = reg.categoryDemand[inputCat as any] as any;
        const subUnitsForDemander = INDUSTRY_SUBUNITS[cat as Industry] || [];
        const demanderDemandLevel = subUnitsForDemander.reduce((s, su) => s + (reg.categoryDemand[su.unitId]?.demandLevelUSD ?? 0), 0);
        if (!supplier) return;

        const regionCapacityUtilization = (reg.categoryDemand['heavy_equipment'] as any)?.clearedInputPriceIndex ?? 1.0;
        const industrialProductionRate = (0.02 * (0.5 + regionCapacityUtilization * 0.5));

        const lastWeekInventory = supplier.lastWeekInventoryLevelUSD ?? supplier.inventoryLevelUSD ?? 0;
        const currentGlutSeverity = Math.max(0, 1.0 - (supplier.clearedInputPriceIndex ?? 1.0)); // how far below fair value the price currently sits
        const inventoryHoldingDecayRate = (0.015 + currentGlutSeverity * 0.35) / 52; // decay accelerates sharply the more oversupplied the market genuinely is — real obsolescence pressure, not a flat constant
        const decayedInventory = lastWeekInventory * (1 - inventoryHoldingDecayRate);
        const weatherDecay = Math.pow(0.55, Math.max(0, (reg.weather?.weeksActive ?? 1) - 1));
        const weatherSupplyPenalty = (reg.weather && reg.weather.severity !== 'Normal' && inputCat === 'heavy_equipment')
          ? Math.max(0.80, 1.0 - Math.abs(reg.weather.gdpImpactPct ?? 0.002) * 5 * weatherDecay)
          : 1.0;
        const supplierFirms = prevActiveFirms.filter(c => c.region === regionId && (c.productLines || []).some(l => l.subUnitId === inputCat));
        let weeklyProduction = supplierFirms.reduce((s, c) => {
          const line = (c.productLines || []).find(l => l.subUnitId === inputCat);
          const warehouseCap = c.annualRevenue * 0.15;
          const throttle = (c.finishedGoodsInventoryUSD ?? 0) > warehouseCap ? 0.3 : 1.0;
          const priceSignal = (supplier.clearedInputPriceIndex ?? 1.0) - 1.0;
          const responsiveFactor = (1.0 + priceSignal * 1.5);
          return s + (c.annualRevenue * industrialProductionRate / 52) * (line?.revenueShare ?? 0) * throttle * responsiveFactor;
        }, 0) * weatherSupplyPenalty;
        
        if (inputCat === 'heavy_equipment') {
           const manufacturingSegment = reg.privateSectorSegments?.find(s => s.segmentType === 'MANUFACTURING');
           if (manufacturingSegment) {
               weeklyProduction += (manufacturingSegment.annualRevenueUSD * 0.02 / 52) * weatherSupplyPenalty;
           }
        }
        const totalAvailableSupply = decayedInventory + weeklyProduction;

        const bidQuantity = demanderDemandLevel * (intensity ?? 0) / 52;
        const clearingRatio = totalAvailableSupply > 0 ? bidQuantity / totalAvailableSupply : 1;

        const targetPriceIndex = Math.max(0, 1.0 + (clearingRatio - 1.0) * 0.4); // 0 floor only — a price index cannot go negative
        const newPriceIndex = (supplier.clearedInputPriceIndex ?? 1.0) * 0.85 + targetPriceIndex * 0.15;

        const quantityFulfilled = Math.min(bidQuantity, totalAvailableSupply);
        const fulfillmentRatio = bidQuantity > 0 ? quantityFulfilled / bidQuantity : 1;

        supplier.clearedInputPriceIndex = Number(newPriceIndex.toFixed(4));
        supplier.inventoryLevelUSD = Math.max(0, totalAvailableSupply - quantityFulfilled);
        supplier._fulfillmentRatio = totalAvailableSupply > 0 ? quantityFulfilled / totalAvailableSupply : 1;
        subUnitsForDemander.forEach(su => {
          const demanderEntry = reg.categoryDemand[su.unitId as any] as any;
          if (demanderEntry) {
            demanderEntry.inputCostPressure = Number(Math.max(0, newPriceIndex - 1.0).toFixed(4));
            demanderEntry._fulfillmentRatio = fulfillmentRatio;
          }
        });
      });
    });
    // after the loop, snapshot this week's inventory as next week's lag anchor:
    Object.keys(reg.categoryDemand).forEach(cat => {
      const entry = reg.categoryDemand[cat as any] as any;
      entry.lastWeekInventoryLevelUSD = entry.inventoryLevelUSD ?? 0;
    });

    // --- Generalized Real Unit-Based Clearing, Bidding & Contract Market System ---
  });
        
    
    // === STAGE 05-unit-bidding.ts ===

    
    
    
    
    

  Object.keys(updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;
    
        
        function executeSubUnitBiddingMarket(
      subUnitId: string,
      baseUnitPrice: number,
      targetReg: Region,
      targetRegionId: RegionId
    ) {
      const demandState = targetReg.categoryDemand[subUnitId] as any;
      if (!demandState) return;

      if (!demandState.unitPriceUSD || demandState.unitPriceUSD <= 0) {
        demandState.unitPriceUSD = baseUnitPrice;
      }
      const currentUnitPrice = demandState.unitPriceUSD;

      // 1. Process active contracts
      if (!targetReg.activeContracts) targetReg.activeContracts = [];
      const remainingContracts: SupplyContract[] = [];

      targetReg.activeContracts.forEach(contract => {
        if (contract.subUnitId !== subUnitId) {
          remainingContracts.push(contract);
          return;
        }

        const supplier = prevActiveFirms.find(c => c.ticker === contract.supplierCompanyId || c.id === contract.supplierCompanyId);
        const customer = prevActiveFirms.find(c => c.ticker === contract.customerCompanyId || c.id === contract.customerCompanyId);

        if (supplier && customer) {
          if (!isActiveCompany(supplier)) {
            // Supplier default shock propagates directly to named contract counterparties first
            if (!companyUpdates[customer.ticker]) companyUpdates[customer.ticker] = {};
            const custUp = companyUpdates[customer.ticker];
            custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, 0.70);
          } else if (isActiveCompany(customer)) {
            contract.weeksRemaining -= 1;
            if (contract.weeksRemaining >= 0) {
              // Execute weekly contract transaction
              const supplierUnits = supplier.finishedGoodsUnits ?? ((supplier.finishedGoodsInventoryUSD ?? 0) / currentUnitPrice);
              const actualTransacted = Math.min(contract.quantityUnitsPerWeek, supplierUnits);
              const paymentUSD = actualTransacted * contract.priceUSD;
              const fillRate = contract.quantityUnitsPerWeek > 0 ? actualTransacted / contract.quantityUnitsPerWeek : 1.0;

              if (!companyUpdates[supplier.ticker]) companyUpdates[supplier.ticker] = {};
              if (!companyUpdates[customer.ticker]) companyUpdates[customer.ticker] = {};

              const supUp = companyUpdates[supplier.ticker];
              supUp.finishedGoodsUnits = Math.max(0, supplierUnits - actualTransacted);
              supUp.finishedGoodsInventoryUSD = supUp.finishedGoodsUnits * currentUnitPrice;
              supUp.cashChange = (supUp.cashChange ?? 0) + paymentUSD;
              supUp.salesUnits = (supUp.salesUnits ?? 0) + actualTransacted;
              supUp.salesUSD = (supUp.salesUSD ?? 0) + paymentUSD;

              const custUp = companyUpdates[customer.ticker];
              custUp.cashChange = (custUp.cashChange ?? 0) - paymentUSD;
              custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + actualTransacted;
              custUp.purchasesUSD = (custUp.purchasesUSD ?? 0) + paymentUSD;

              if (fillRate < 0.95) {
                // Named shock propagation: reduced fill rate constrains customer capacity directly
                custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, Math.max(0.3, fillRate));
              }

              remainingContracts.push(contract);
            }
          }
        }
      });
      targetReg.activeContracts = remainingContracts;

      // 2. Open Bidding & Matching
      const bids: UnitBid[] = [];
      const offers: UnitOffer[] = [];

      const regionActiveFirms = prevActiveFirms.filter(c => c.region === targetRegionId && isActiveCompany(c));
      const suppliers = regionActiveFirms.filter(c => (c.productLines || []).some(l => l.subUnitId === subUnitId));

      const customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === subUnitId) && (CORPORATE_DEMAND_INTENSITY[subUnitId] ?? 0) > 0);
      // Suppliers submit unit offers
      suppliers.forEach(comp => {
        const line = (comp.productLines || []).find(l => l.subUnitId === subUnitId)!;
        const warehouseCapacityUSD = comp.annualRevenue * 0.15;
        const currentInvUSD = comp.finishedGoodsInventoryUSD ?? 0;
        const productionThrottle = currentInvUSD > warehouseCapacityUSD ? 0.3 : 1.0;
        const priceSignal = (currentUnitPrice / baseUnitPrice) - 1.0;
        const productionResponseFactor = Math.max(0.5, Math.min(2.0, 1.0 + priceSignal * 1.5));
        const targetProductionUSD = (comp.annualRevenue / 52) * (line?.revenueShare ?? 1.0) * productionResponseFactor * productionThrottle;
        const targetProductionUnits = targetProductionUSD / currentUnitPrice;

        const currentUnits = comp.finishedGoodsUnits ?? (currentInvUSD / currentUnitPrice);
        const contractSales = remainingContracts
          .filter(c => (c.supplierCompanyId === comp.ticker || c.supplierCompanyId === comp.id) && c.subUnitId === subUnitId)
          .reduce((s, c) => s + c.quantityUnitsPerWeek, 0);

        const openOfferUnits = Math.max(0, targetProductionUnits + currentUnits - contractSales);

        if (openOfferUnits > 0.001) {
          const baseMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
          const costRate = Math.max(0.40, Math.min(0.98, 1 - baseMargin));
          const ratingPdMap: Record<string, number> = {
            'AAA': 0.0002, 'AA': 0.001, 'A': 0.003, 'BBB': 0.01, 'BB': 0.03, 'B': 0.08, 'CCC': 0.20
          };
          const pd = ratingPdMap[comp.creditRating] ?? 0.03;
          const expectedLoss = pd * 0.60;
          const costOfCapital = 0.05 + expectedLoss;
          const marginPremium = costOfCapital * 1.5;
          const minPriceUSD = currentUnitPrice * costRate * (1 + marginPremium);

          offers.push({
            companyId: comp.ticker,
            quantityUnits: openOfferUnits,
            minPriceUSD,
          });
        }
      });

      // Corporate Customers submit bids
      customers.forEach(comp => {
        let demandUSD = 0;
        if (subUnitId === 'industrial_automation') {
          const realCapexUSD = (comp.maintenanceCapex ?? 0) + (comp.growthCapex ?? 0);
          demandUSD = (realCapexUSD / 52) * 0.35;
        } else {
          demandUSD = (comp.annualRevenue * (CORPORATE_DEMAND_INTENSITY[subUnitId] ?? 0)) / 52;
        }
        const demandUnits = demandUSD / currentUnitPrice;

        const contractPurchases = remainingContracts
          .filter(c => (c.customerCompanyId === comp.ticker || c.customerCompanyId === comp.id) && c.subUnitId === subUnitId)
          .reduce((s, c) => s + c.quantityUnitsPerWeek, 0);

        const openBidUnits = Math.max(0, demandUnits - contractPurchases);

        if (openBidUnits > 0.001) {
          const cashRatio = comp.cash / Math.max(1, comp.annualRevenue);
          const cashModifier = cashRatio < 0.02 ? 0.85 : cashRatio > 0.15 ? 1.15 : 1.0;
          const maxPriceUSD = currentUnitPrice * (0.95 + Math.random() * 0.1) * cashModifier;

          bids.push({
            companyId: comp.ticker,
            quantityUnits: openBidUnits,
            maxPriceUSD,
          });
        }
      });

      // Look up buyer mix for this subUnit
      const allSubUnits = Object.values(INDUSTRY_SUBUNITS).flat();
      const subUnitDef = allSubUnits.find(su => su.unitId === subUnitId);
      const govShare = subUnitDef?.buyerMix.GOVERNMENT ?? 0;
      const hhShare = subUnitDef?.buyerMix.HOUSEHOLD ?? 0;

      // Government Aggregate Bid
      if (govShare > 0) {
        const govWeeklyDemandUSD = (demandState.demandLevelUSD * govShare) / 52;
        const govDemandUnits = govWeeklyDemandUSD / currentUnitPrice;
        if (govDemandUnits > 0.001) {
          bids.push({
            isGovernmentAggregate: true,
            quantityUnits: govDemandUnits,
            maxPriceUSD: currentUnitPrice * 1.10
          });
        }
      }

      // Household Aggregate Bid
      if (hhShare > 0) {
        const hhWeeklyDemandUSD = (demandState.demandLevelUSD * hhShare) / 52;
        let hhDemandUnits = hhWeeklyDemandUSD / currentUnitPrice;
        
        if (subUnitId === 'passenger_vehicles') {
           const initialStock = targetReg.householdState.durableGoodsStockUnits ?? ((demandState.demandLevelUSD * hhShare / currentUnitPrice) * 3.5);
           const scrappageRate = 0.12 / 52; 
           const replacementDemandUnits = initialStock * scrappageRate;
           const targetStock = (targetReg.estimatedHouseholdIncomeUSD * (1 - targetReg.householdState.savingsRate) * 0.10) / currentUnitPrice; 
           const expansionDemandUnits = Math.max(0, (targetStock - initialStock) * 0.05); 
           hhDemandUnits = replacementDemandUnits + expansionDemandUnits;
           targetReg.householdState.durableGoodsStockUnits = initialStock - (initialStock * scrappageRate);
        }

        if (hhDemandUnits > 0.001) {
          const priceElasticityPremium = Math.tanh(0.05) * 0.15;
          const hhMaxPriceUSD = currentUnitPrice * (1.0 + priceElasticityPremium);

          bids.push({
            isHouseholdAggregate: true,
            quantityUnits: hhDemandUnits,
            maxPriceUSD: hhMaxPriceUSD,
          });
        }
      }

      // Sort bids desc, offers asc
      bids.sort((a, b) => b.maxPriceUSD - a.maxPriceUSD);
      offers.sort((a, b) => a.minPriceUSD - b.minPriceUSD);

      let clearedPriceUSD = currentUnitPrice;
      let openUnitsCleared = 0;
      let bidIdx = 0;
      let offerIdx = 0;

      const openSales: Record<string, { units: number; amount: number }> = {};
      const openPurchases: Record<string, { units: number; amount: number }> = {};

            let loopCounter = 0;
      while (bidIdx < bids.length && offerIdx < offers.length) {
        if (loopCounter++ > 10000) break;
        
        const bid = bids[bidIdx];
        const offer = offers[offerIdx];

        if (bid.maxPriceUSD >= offer.minPriceUSD) {
          let transactQty = Math.min(bid.quantityUnits, offer.quantityUnits);
          if (!isFinite(transactQty) || isNaN(transactQty) || transactQty <= 0) {
            bidIdx++;
            offerIdx++;
            continue;
          }
          const matchPrice = (bid.maxPriceUSD + offer.minPriceUSD) / 2;
          clearedPriceUSD = matchPrice;
          openUnitsCleared += transactQty;

          if (!openSales[offer.companyId]) openSales[offer.companyId] = { units: 0, amount: 0 };
          openSales[offer.companyId].units += transactQty;
          openSales[offer.companyId].amount += transactQty * matchPrice;

          if (bid.companyId) {
            if (!openPurchases[bid.companyId]) openPurchases[bid.companyId] = { units: 0, amount: 0 };
            openPurchases[bid.companyId].units += transactQty;
            openPurchases[bid.companyId].amount += transactQty * matchPrice;
          }
          if (bid.isHouseholdAggregate && subUnitId === 'passenger_vehicles') {
            targetReg.householdState.durableGoodsStockUnits = (targetReg.householdState.durableGoodsStockUnits ?? 0) + transactQty;
          }

          bid.quantityUnits -= transactQty;
          offer.quantityUnits -= transactQty;

          if (bid.quantityUnits <= 0.0001 || !isFinite(bid.quantityUnits)) bidIdx++;
          if (offer.quantityUnits <= 0.0001 || !isFinite(offer.quantityUnits)) offerIdx++;
        } else {
          break;
        }
      }

      // 3. Save matching results to updates
      suppliers.forEach(comp => {
        const sale = openSales[comp.ticker];
        if (!companyUpdates[comp.ticker]) companyUpdates[comp.ticker] = {};
        const supUp = companyUpdates[comp.ticker];
        const initialUnits = comp.finishedGoodsUnits ?? ((comp.finishedGoodsInventoryUSD ?? 0) / currentUnitPrice);

        const line = (comp.productLines || []).find(l => l.subUnitId === subUnitId)!;
        const warehouseCapacityUSD = comp.annualRevenue * 0.15;
        const currentInvUSD = comp.finishedGoodsInventoryUSD ?? 0;
        const productionThrottle = currentInvUSD > warehouseCapacityUSD ? 0.3 : 1.0;
        const priceSignal = (currentUnitPrice / baseUnitPrice) - 1.0;
        const productionResponseFactor = Math.max(0.5, Math.min(2.0, 1.0 + priceSignal * 1.5));
        const targetProductionUSD = (comp.annualRevenue / 52) * (line?.revenueShare ?? 1.0) * productionResponseFactor * productionThrottle;
        const targetProductionUnits = targetProductionUSD / currentUnitPrice;

        if (sale) {
          supUp.finishedGoodsUnits = Math.max(0, initialUnits + targetProductionUnits - (supUp.salesUnits ?? 0) - sale.units);
          supUp.finishedGoodsInventoryUSD = supUp.finishedGoodsUnits * clearedPriceUSD;
          supUp.cashChange = (supUp.cashChange ?? 0) + sale.amount;
          supUp.salesUnits = (supUp.salesUnits ?? 0) + sale.units;
          supUp.salesUSD = (supUp.salesUSD ?? 0) + sale.amount;
        } else {
          supUp.finishedGoodsUnits = Math.max(0, initialUnits + targetProductionUnits - (supUp.salesUnits ?? 0));
          supUp.finishedGoodsInventoryUSD = supUp.finishedGoodsUnits * clearedPriceUSD;
        }
        supUp._targetProductionUSD = (supUp._targetProductionUSD ?? 0) + targetProductionUSD;
      });

      customers.forEach(comp => {
        const purchase = openPurchases[comp.ticker];
        if (purchase) {
          if (!companyUpdates[comp.ticker]) companyUpdates[comp.ticker] = {};
          const custUp = companyUpdates[comp.ticker];
          custUp.cashChange = (custUp.cashChange ?? 0) - purchase.amount;
          custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + purchase.units;
          custUp.purchasesUSD = (custUp.purchasesUSD ?? 0) + purchase.amount;
        }
      });

      // 4. Contract Formation (B2B corporate matching only)
      const matchedBids = bids.filter(b => b.companyId && b.quantityUnits < 0.01);
      const matchedOffers = offers.filter(o => o.quantityUnits < 0.01);

      matchedBids.forEach(bid => {
        matchedOffers.forEach(offer => {
          if (Math.random() < 0.15 && bid.companyId) {
            const supplierComp = suppliers.find(s => s.ticker === offer.companyId);
            const customerComp = customers.find(c => c.ticker === bid.companyId);

            if (supplierComp && customerComp) {
              const totalSuppliersRevenue = suppliers.reduce((s, c) => s + c.annualRevenue, 0);
              const supplierMarketShare = supplierComp.annualRevenue / Math.max(1, totalSuppliersRevenue);
              const relativeSize = customerComp.annualRevenue / Math.max(1, supplierComp.annualRevenue);
              const supplierPowerFactor = 0.5 + (supplierMarketShare - 0.25) * 0.5;
              const customerBargainingPower = (relativeSize > 1.0 ? 0.6 : 0.4) * (1.0 - supplierPowerFactor);
              let contractPrice = clearedPriceUSD * (1.0 - (customerBargainingPower - 0.3) * 0.05);
              let duration = 12 + Math.floor(Math.random() * 40);
              
              // Hedging for revenue volatility
              const revHist = customerComp.revenueHistory || [];
              let revVol = 0;
              if (revHist.length > 3) {
                 const meanRev = revHist.reduce((s, v) => s + v, 0) / revHist.length;
                 const varRev = revHist.reduce((s, v) => s + Math.pow(v - meanRev, 2), 0) / revHist.length;
                 revVol = Math.sqrt(varRev) / meanRev;
              }
              if (revVol > 0.05) {
                 duration = 52 + Math.floor(Math.random() * 52); // Seek longer contracts
                 const impliedPd = Math.max(0, Math.min(1, 1 / (1 + Math.exp(customerComp.interestCoverage * 0.8 - customerComp.leverage * 0.4))));
                 const costOfCapital = 0.05 + (impliedPd * 0.60);
                 const hedgingPremium = costOfCapital * 0.20; // Modest price premium
                 contractPrice *= (1.0 + hedgingPremium);
              }

              const baseContractUnits = subUnitId === 'industrial_automation'
                ? (Math.random() * 2 + 0.5)
                : subUnitId === 'passenger_vehicles'
                ? (Math.random() * 15 + 3)
                : subUnitId === 'pharmaceuticals'
                ? (Math.random() * 800 + 200)
                : subUnitId === 'refined_products'
                ? (Math.random() * 5000 + 1000)
                : (Math.random() * 10000 + 2000);

              const newContract: SupplyContract = {
                supplierCompanyId: offer.companyId,
                customerCompanyId: bid.companyId,
                subUnitId,
                priceUSD: Number(contractPrice.toFixed(2)),
                quantityUnitsPerWeek: Number(baseContractUnits.toFixed(2)),
                weeksRemaining: duration,
              };
              remainingContracts.push(newContract);
            }
          }
        });
      });

      targetReg.activeContracts = remainingContracts;

      // 5. Save Category Demand state metrics
      const activeSubUnitContracts = remainingContracts.filter(c => c.subUnitId === subUnitId);
      demandState.unitPriceUSD = Number(clearedPriceUSD.toFixed(2));
      demandState.totalUnitsSuppliedThisWeek = openUnitsCleared + activeSubUnitContracts.reduce((s, c) => s + c.quantityUnitsPerWeek, 0);
      demandState.totalUnitsDemandedThisWeek = bids.reduce((s, b) => s + b.quantityUnits, 0) + openUnitsCleared + activeSubUnitContracts.reduce((s, c) => s + c.quantityUnitsPerWeek, 0);
      demandState.clearedInputPriceIndex = Number((clearedPriceUSD / baseUnitPrice).toFixed(4));
    }

    // Execute generalized bidding markets for sub-units in scope
    Object.values(INDUSTRY_SUBUNITS).flat().forEach(subUnit => {
      const seed = reg.categoryDemand[subUnit.unitId]?.unitPriceUSD;
      executeSubUnitBiddingMarket(subUnit.unitId, Math.max(1, seed || 1), reg, regionId);
    });
  });

  function computeRealizedVol(historicalValues: number[], window: number): number {
    const recent = historicalValues.slice(-window);
    if (recent.length < 2) return 0.15;
    const returns = recent.slice(1).map((v, i) => Math.log(v / recent[i]));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance * 52);
  }
  const realizedIndexVol = computeRealizedVol(state.compositeIndices.us500.historical ?? [], 13);
  const baselineVol = 0.16;
  const usaRegime = updatedRegions.USA.cycleRegime;
  const regimeVolPremium = usaRegime === 'Recession' ? 0.08 : usaRegime === 'Slowdown' ? 0.03 : 0;
  const marketVolComponent = Math.max(0, realizedIndexVol - baselineVol) * 0.5 + regimeVolPremium;

        
    
    state = state;
    
    
    // === STAGE 06-fx-and-trade.ts ===

    

    
        
      // 3. Evolve FX Pairs
  updatedFxPairs = state.fxPairs.map((fx) => evolveFxPair(fx, updatedRegions));

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
    const score = firms.reduce((s, f) => {
      const line = f.productLines.find(l => l.industry === category);
      const compVal = line?.competitiveness ?? 1.0;
      const shareVal = line?.categoryMarketShare ?? 0;
      return s + (Number.isFinite(compVal) ? compVal : 1.0) * (Number.isFinite(shareVal) ? shareVal : 0);
    }, 0) / firms.length;
    return Number.isFinite(score) ? score : 0;
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
        const exporterCompetitiveness = computeRegionalCompetitiveness(state.companies, exporter, cat);
        const fxCompetitiveness = getFxCompetitivenessAdjustment(exporter, importer, updatedFxPairs);
        const exportShareCapture = Math.max(0.05, Math.min(0.80, (0.25 + exporterCompetitiveness * 0.2 + fxCompetitiveness * 0.2)));
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

        
    
    // === STAGE 07-commodities.ts ===

    

    
        
      // 4. Evolve Commodities (Part QB - Dynamic Feedback Loop)
  updatedCommodities = state.commodities.map((comm) => {
    return evolveCommodity(comm, updatedRegions.USA.gdpGrowth, updatedRegions.USA.zeroRates.tenor3M, updatedRegions, state.companies);
  });

        
    
    // === STAGE 08-company-fundamentals.ts ===

    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
        
      // 5. Evolve 200 Company Fundamentals + Asynchronous Earnings + Debt Prepayment + M&A
  
  const refinanceNews: NewsItem[] = [];
  
  
  

  updatedCompanies = state.companies.map((comp) => {
    if (!isActiveCompany(comp)) {
      return { ...comp, previousEmployeeCount: 0, employeeCount: 0 };
    }

    const reg = updatedRegions[comp.region];
    const sec = SECTOR_BENCHMARKS[comp.sector];

    // Interest Expense (computed early so Banks can skip or use it if they had standard debt, but they mostly rely on BankingSector)
    const nonMaturingTranches = comp.debtTranches.filter(t => t.maturityWeek !== nextWeek);
    const annualInterest = nonMaturingTranches.reduce((sum, t) => {
      if (t.rateType === 'FIXED') return sum + t.principalUSD * (t.couponRate ?? 0.05);
      return sum + t.principalUSD * (reg.policyRate + (t.floatingMarginBps ?? 200) / 10000);
    }, 0);
    const weeklyInterest = annualInterest / 52;
    const effectiveDebtRate = annualInterest / Math.max(1, comp.totalDebt);
    const taxRate = 0.21;

    let updatedProductLines = comp.productLines || []; let newRevenue = 0;
    let baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
    let newEbitdaMargin = 0;
    let newEbitda = 0;
    let newEbit = 0;
    let newNetIncome = 0;
    let newEps = 0;
    let newInputSupplyConstraintFactor = comp.inputSupplyConstraintFactor ?? 1.0;
    let newRecentFulfillmentEMA = comp.recentFulfillmentEMA ?? 1.0;
    let targetProductionUSD = 0;
    let productionCostUSD = 0;
    let carryingCostUSD = (comp.finishedGoodsInventoryUSD ?? 0) * (comp.inventoryCarryingCostRate ?? 0.02) / 52;
    let newFinishedGoodsInventoryUSD = Math.max(0, (comp.finishedGoodsInventoryUSD ?? 0) - carryingCostUSD);

    const executionNoise = (Math.random() - 0.5) * 0.3;
    const newExecutionQuality = ((comp.executionQuality ?? 1.0) * 0.92 + 1.0 * 0.08 + executionNoise * 0.08);


    if (comp.financialStatementProfile === 'BANK' || comp.sector === 'Banks') {
      const bs = reg.bankingSector;
      const share = comp.bankMarketShare ?? 0.25;
      const totalAssets = bs.businessLoanBookUSD + bs.consumerLoanBookUSD + bs.sovereignBondHoldingsUSD;
      const weeklyNim = bs.netInterestMarginPct / 52;
      const impliedNimRev = totalAssets * weeklyNim * share;
      const loanLosses = Math.random() * 0.05 * totalAssets * share / 52;
      newRevenue = Math.max(10, comp.annualRevenue * 0.98 + (impliedNimRev * 52) * 0.02);
      newEbitdaMargin = 0.40;
      newEbitda = newRevenue * newEbitdaMargin - (loanLosses * 52);
      newEbit = Math.max(1, newEbitda);
      newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
      newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));
      comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];
    } else if (comp.financialStatementProfile === 'INSURER') {
      const instEnt = state.institutionalEntities.find(e => e.id === comp.id);
      const floatAssets = instEnt?.totalAssetsUSD ?? (comp.annualRevenue * 5);
      comp.technicalReservesUSD = floatAssets * 0.85;
      
      const premiumGrowth = reg.gdpGrowth / 52 + (Math.random() - 0.5) * 0.02;
      const prevPremiums = (comp.insurancePremiumsWrittenUSD || comp.annualRevenue) / 52;
      const weeklyPremiums = Math.max(10, prevPremiums * (1 + premiumGrowth));
      comp.insurancePremiumsWrittenUSD = weeklyPremiums * 52;
      
      const lossRatio = 0.70 + (Math.random() - 0.5) * 0.20;
      comp.insuranceClaimsPaidUSD = weeklyPremiums * lossRatio * 52;
      
      const underwritingIncome = weeklyPremiums * (1 - lossRatio - 0.20); 
      const investmentIncome = floatAssets * 0.04 / 52;
      
      newRevenue = comp.insurancePremiumsWrittenUSD;
      comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];
      newEbitdaMargin = 0.15;
      newEbitda = (underwritingIncome + investmentIncome) * 52;
      newEbit = Math.max(1, newEbitda);
      newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
      newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));
    } else if (comp.financialStatementProfile === 'ASSET_MANAGER') {
      const instEnt = state.institutionalEntities.find(e => e.id === comp.id);
      const equityIndex = comp.region === 'USA' ? state.compositeIndices.us500 : comp.region === 'EUR' ? state.compositeIndices.euStoxx : comp.region === 'UK' ? state.compositeIndices.uk100 : state.compositeIndices.jp225;
      const marketGrowth = equityIndex.value / Math.max(1, equityIndex.historical[equityIndex.historical.length - 2] ?? equityIndex.value);
      const flows = (Math.random() - 0.4) * 0.01;
      comp.aumUSD = (comp.aumUSD ?? (instEnt?.totalAssetsUSD ?? comp.annualRevenue * 50)) * marketGrowth * (1 + flows);
      comp.managementFeeRate = comp.managementFeeRate ?? (0.005 + Math.random() * 0.005);
      
      const weeklyFees = comp.aumUSD * comp.managementFeeRate / 52;
      newRevenue = Math.max(10, weeklyFees * 52);
      comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];
      newEbitdaMargin = 0.35;
      newEbitda = newRevenue * newEbitdaMargin;
      newEbit = Math.max(1, newEbitda);
      newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
      newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));
    } else {
      // Consumer Revenue Beta
      const creditTighteningPenalty = Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.015;
      
      // Weekly revenue transition
      const noise = (Math.random() - 0.5) * 0.015;
      const baseRev = comp.baselineAnnualRevenue || comp.annualRevenue;

      // Re-anchor target annual revenue to baseline capacity adjusted for regional GDP and consumer momentum
      const pricingPowerBeta = SECTOR_PRICING_POWER[comp.sector] ?? 0.65;
      // Operating margins update (Wage-Push compression, capacity decay, and competitive crowding)
      const capacityDecayPenalty = Math.min(0.08, (comp.maintenanceShortfallStreak ?? 0) * 0.003); // up to 8% margin erosion after ~27 consecutive underfunded weeks
      const wageSensitivity = SECTOR_WAGE_SENSITIVITY[comp.sector] ?? 1.0;
      const compOccMix = SECTOR_OCCUPATION_MIX[comp.sector] ?? { GENERAL: 1.0 };
      const compWageGrowth = getBlendedWageGrowth(compOccMix, reg.occupationPools);
      const wageCompression = Math.max(0, compWageGrowth - 0.025) * 0.15 * wageSensitivity;
      const avgCrowdingIntensity = (comp.productLines || []).reduce((s, l) => {
        const catDemand = reg.categoryDemand[l.subUnitId as any];
        return s + (catDemand?.crowdingIntensity ?? 0) * l.revenueShare;
      }, 0);

      const compInputCategories: string[] = [];
      (comp.productLines || []).forEach(l => {
        const reqs = CATEGORY_INPUT_REQUIREMENTS[l.industry];
        if (reqs) {
          Object.keys(reqs).forEach(inputSubUnit => {
            if (!compInputCategories.includes(inputSubUnit)) {
              compInputCategories.push(inputSubUnit);
            }
          });
        }
      });
      const relevantFulfillment = compInputCategories.length > 0
        ? compInputCategories.reduce((min, c) => Math.min(min, (reg.categoryDemand[c as any] as any)?._fulfillmentRatio ?? 1), 1)
        : 1;
      newInputSupplyConstraintFactor = ((comp.inputSupplyConstraintFactor ?? 1.0) * 0.7 + relevantFulfillment * 0.3);
      
      // Supply relationship shocks
      const region = updatedRegions[comp.region];
      const rels = (region as any).supplyRelationships?.filter((r: any) => r.customerCompanyId === comp.id) || [];
      rels.forEach((rel: any) => {
          const supplier = prevActiveFirms.find(c => c.id === rel.supplierCompanyId);
          if (supplier && (supplier.finishedGoodsInventoryUSD ?? 0) > supplier.annualRevenue * 0.15) {
              const distress = (supplier.finishedGoodsInventoryUSD! / (supplier.annualRevenue * 0.15)) - 1;
              newInputSupplyConstraintFactor *= (1 - Math.min(0.2, distress * rel.relationshipStrength * 0.1));
          }
      });


      const inputPriceDrag = compInputCategories.length > 0
        ? compInputCategories.reduce((s, c) => s + ((reg.categoryDemand[c as any] as any)?.inputCostPressure ?? 0), 0) / compInputCategories.length
        : 0;

      baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
      const baselineMargin = comp.baselineEbitdaMargin ?? (comp.ebitda / Math.max(1, comp.annualRevenue));
      const targetMargin = Math.min(0.65, Math.max(0.04, baselineMargin - wageCompression - capacityDecayPenalty - avgCrowdingIntensity * 0.08 - inputPriceDrag * 0.03));
      newEbitdaMargin = Math.min(0.65, Math.max(0.02, baseEbitdaMargin * 0.96 + targetMargin * 0.04 + (Math.random() - 0.5) * 0.004));

      const growthCapexToRev = comp.baselineGrowthCapexToRevenueRatio ?? ((comp.growthCapex ?? (comp.capex * 0.4)) / Math.max(1, comp.annualRevenue));
      const estRateDrag = Math.max(0, effectiveDebtRate - 0.04) * 2.0;
      const estCashHealth = comp.cash < 0 ? 0.05 : (comp.cash < comp.currentLiabilities * 0.25 ? 0.4 : 1.0);
      const estTobinsQ = Math.max(0.1, Math.min(10.0, comp.marketCap / Math.max(1, comp.totalDebt + comp.annualRevenue * 1.5)));
      const estQCapexEffect = ((estTobinsQ - 1) * 0.2);
      const estAvgComp = (comp.productLines || []).reduce((s, l) => s + l.competitiveness, 0) / Math.max(1, (comp.productLines || []).length);
      const estCompEffect = (estAvgComp * 0.15);
      const estTargetGrowthCapex = baseRev * growthCapexToRev * (1 - estRateDrag) * estCashHealth * (1 + estQCapexEffect + estCompEffect);
      const estNewGrowthCapex = Math.max(0, (comp.growthCapex ?? (comp.capex * 0.4)) * 0.90 + estTargetGrowthCapex * 0.10);
      
      const growthInvestmentSignal = (((estNewGrowthCapex - (comp.growthCapex ?? (comp.capex * 0.4))) / Math.max(1, (comp.growthCapex ?? (comp.capex * 0.4)))) * newExecutionQuality);

      let categoryDrivenGrowth = 0;
      updatedProductLines = (comp.productLines || []).map((line) => {
        const catDemand = reg.categoryDemand[line.subUnitId];
        if (!catDemand) {
          throw new Error(`subUnitId ${line.subUnitId} does not exist in reg.categoryDemand for region ${reg.id}. Available: ${Object.keys(reg.categoryDemand).join(', ')}`);
        }
        const isHouseholdFacing = (INDUSTRY_SUBUNITS[line.industry]?.find(su => su.unitId === line.subUnitId)?.buyerMix.HOUSEHOLD ?? 0) > 0.5;
        const baseDemandGrowth = catDemand.demandGrowthAnnual ?? reg.gdpGrowth;
        const categoryGrowth = (isFinite(baseDemandGrowth) ? baseDemandGrowth : reg.gdpGrowth) - (isHouseholdFacing ? creditTighteningPenalty : 0);
        const marginEdge = (newEbitdaMargin - baseEbitdaMargin) * 2;
        const dominanceDrag = line.categoryMarketShare > 0.30 ? (line.categoryMarketShare - 0.30) * 0.5 : 0;
        const targetCompetitiveness = 2.0 * Math.tanh((marginEdge * 16 + growthInvestmentSignal * 0.5) / 2.0);
        const newCompetitiveness = Number((line.competitiveness * 0.98 + targetCompetitiveness * 0.02).toFixed(3));
        const shareGainRate = (newCompetitiveness * 0.035 - dominanceDrag);
        const newCategoryMarketShare = Math.max(0, line.categoryMarketShare * (1 + shareGainRate / 52)); // 0 floor only — a market share literally cannot go negative, this is a math guard not a behavioral clamp
        
        const lineGrowth = categoryGrowth + shareGainRate;
        
        categoryDrivenGrowth += (isFinite(lineGrowth) ? lineGrowth : 0) * (isFinite(line.revenueShare) ? line.revenueShare : 1);
        const shouldSnapshot = nextWeek % 13 === 0;
        return {
          ...line,
          previousCategoryMarketShare: line.categoryMarketShare,
          categoryMarketShare13WeeksAgo: shouldSnapshot ? line.categoryMarketShare : (line.categoryMarketShare13WeeksAgo ?? line.categoryMarketShare),
          competitiveness: newCompetitiveness,
          categoryMarketShare: newCategoryMarketShare,
        };
      });
        
        let commodityPriceGrowthAdjustment = 0;
        if ((comp as any).producedCommodityId) {
          const ownCommodity = updatedCommodities.find((c: any) => c.id === (comp as any).producedCommodityId || c.symbol === (comp as any).producedCommodityId);
          const baselinePrice = (ownCommodity as any)?.allTimeBaselinePrice ?? ownCommodity?.historicalPrices?.[0];
          if (ownCommodity && baselinePrice > 0) {
            const priceRatioVsBaseline = ownCommodity.spotPrice / baselinePrice;
            commodityPriceGrowthAdjustment = 0.5 * Math.tanh((priceRatioVsBaseline - 1) * 1.5);
          }
        }
        categoryDrivenGrowth += commodityPriceGrowthAdjustment;

        const buffer = comp.demandShockLagBuffer || [];
        const updatedBuffer = [...buffer, categoryDrivenGrowth].slice(-8);
        const laggedCategoryGrowth = updatedBuffer.length > 2 ? updatedBuffer[updatedBuffer.length - 1 - 2] : updatedBuffer[0] ?? categoryDrivenGrowth;
        comp.demandShockLagBuffer = updatedBuffer;

        const exportRevenueBoost = (comp.productLines || []).reduce((s, line) => {
          const tradability = CATEGORY_TRADABILITY[line.industry] ?? 0;
          if (tradability < 0.1) return s;
          const regionExportsInCat = regionCategoryExports[comp.region]?.[line.industry] ?? 0;
          const safeRev = Math.max(1, Number.isFinite(comp.annualRevenue) ? comp.annualRevenue : (comp.baselineAnnualRevenue || 1));
          const exportShareOfRev = (regionExportsInCat * (line.categoryMarketShare || 0) * (line.revenueShare || 0)) / safeRev;
          return s + Math.max(-0.02, Math.min(0.02, (exportShareOfRev || 0) * (reg.gdpGrowth / 52)));
        }, 0);
        const distressPenalty = comp.isDefaulted ? 0.50 : 1.0;
        const annualGrowthRate = laggedCategoryGrowth + noise + reg.inflation * pricingPowerBeta;
        
        const weeklyGrowthRate = Math.max(-0.05, Math.min(0.05, (annualGrowthRate / 52) + exportRevenueBoost));
        const targetAnnualRevenue = baseRev * (1 + weeklyGrowthRate) * distressPenalty * newInputSupplyConstraintFactor;
      
      // Smooth transition to target revenue (no exponential weekly compounding)
      newRevenue = Math.max(10, (comp.annualRevenue * 0.90) + (targetAnnualRevenue * 0.10));

      const industrialLine = (comp.productLines || []).find(l => l.subUnitId === 'heavy_equipment' || l.subUnitId === 'industrial_automation' || l.subUnitId === 'industrial_chemicals');
      let unsoldThisWeekUSD = 0;

      if (industrialLine && industrialLine.revenueShare > 0) {
        if (industrialLine.subUnitId === 'industrial_automation') {
          const update = companyUpdates[comp.ticker];
          const salesUSD = update?.salesUSD ?? 0;
          const currentIAUnitPrice = (reg.categoryDemand['industrial_automation'] as any)?.unitPriceUSD ?? 80000.0;
          const priceSignal = (currentIAUnitPrice / 80000.0) - 1.0;
          const productionResponseFactor = (1.0 + priceSignal * 1.5);
          const warehouseCapacityUSD = comp.annualRevenue * 0.15;
          const currentInvUSD = comp.finishedGoodsInventoryUSD ?? 0;
          const productionThrottle = currentInvUSD > warehouseCapacityUSD ? 0.3 : 1.0;

          targetProductionUSD = (newRevenue / 52) * industrialLine.revenueShare * productionResponseFactor * productionThrottle;
          productionCostUSD = targetProductionUSD * (1 - newEbitdaMargin);

          unsoldThisWeekUSD = Math.max(0, targetProductionUSD - salesUSD);
          newFinishedGoodsInventoryUSD = update?.finishedGoodsInventoryUSD ?? 0;
          newRecentFulfillmentEMA = (comp.recentFulfillmentEMA ?? 1.0) * 0.85 + (salesUSD > 0 ? 1.0 : 0.0) * 0.15;
        } else {
          const warehouseCapacityUSD = comp.annualRevenue * 0.15;
          const productionThrottle = (comp.finishedGoodsInventoryUSD ?? 0) > warehouseCapacityUSD ? 0.3 : 1.0;

          const categoryFulfillmentRatio = (reg.categoryDemand[industrialLine.subUnitId] as any)?._fulfillmentRatio ?? 1;
          newRecentFulfillmentEMA = (comp.recentFulfillmentEMA ?? 1.0) * 0.85 + categoryFulfillmentRatio * 0.15;
          const supplierClearedPrice = (reg.categoryDemand[industrialLine.subUnitId] as any)?.clearedInputPriceIndex ?? 1.0;
          const priceSignal = supplierClearedPrice - 1.0;
          const productionResponseFactor = (1.0 + priceSignal * 1.5);

          targetProductionUSD = (newRevenue / 52) * industrialLine.revenueShare * productionResponseFactor * productionThrottle;
          productionCostUSD = targetProductionUSD * (1 - newEbitdaMargin);

          const soldThisWeekUSD = targetProductionUSD * categoryFulfillmentRatio;
          unsoldThisWeekUSD = targetProductionUSD - soldThisWeekUSD;

          newFinishedGoodsInventoryUSD = Math.max(0, (comp.finishedGoodsInventoryUSD ?? 0) + unsoldThisWeekUSD - carryingCostUSD);
        }
      }

      const revenueAdjustmentForUnsold = -unsoldThisWeekUSD * 0.5;
      newRevenue = Math.max(10, newRevenue + revenueAdjustmentForUnsold);
      comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];

      newEbitda = newRevenue * newEbitdaMargin;
      const da = newRevenue * 0.05;
      newEbit = Math.max(1, newEbitda - da);

      newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
      newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));
    }

    // Maintenance — funded, not assumed:
    // 1. What maintenance WOULD cost if fully funded (capacity-based target)
    const maintenanceCapexToRevenueRatio = (comp.maintenanceCapex ?? (comp.capex * 0.6)) / Math.max(1, comp.annualRevenue);
    const targetMaintenanceCapex = newRevenue * maintenanceCapexToRevenueRatio;
    const weeklyDesiredMaintenanceCapex = targetMaintenanceCapex / 52;

    // 2. What the company can actually fund this week — operating cash + a small cash draw + limited new borrowing (IG only), never unlimited
    const weeklyOperatingCashFlow = newEbitda / 52 - weeklyInterest;
    const isInvestmentGrade = ['AAA', 'AA', 'A', 'BBB'].includes(comp.creditRating);
    const maintenanceBorrowingCapacity = isInvestmentGrade ? weeklyDesiredMaintenanceCapex * 0.5 : 0; // a distressed company cannot borrow its way out of deferred upkeep
    const availableFundingForMaintenance = Math.max(0, weeklyOperatingCashFlow) + Math.max(0, comp.cash) * 0.05 + maintenanceBorrowingCapacity;

    // 3. Fund what's affordable, defer the rest
    const weeklyFundedMaintenance = Math.min(weeklyDesiredMaintenanceCapex, availableFundingForMaintenance);
    const fundedMaintenanceCapex = weeklyFundedMaintenance * 52;
    const maintenanceShortfallThisWeek = Math.max(0, targetMaintenanceCapex - fundedMaintenanceCapex);
    const weeklyDebtFundedPortion = Math.max(0, Math.min(weeklyFundedMaintenance, maintenanceBorrowingCapacity) - Math.max(0, weeklyOperatingCashFlow));
    const newMaintenanceCapex = Math.max(0, (comp.maintenanceCapex ?? (comp.capex * 0.6)) * 0.95 + fundedMaintenanceCapex * 0.05);

    // 4. Debt-funded maintenance becomes a real new floating tranche — genuinely raises leverage and next week's interest, not a free lunch
    let maintenanceFundingTranches: DebtTranche[] = [];
    if (weeklyDebtFundedPortion > 1000) {
      const currentBaseSpreadBps = comp.oasSpreadBps;
      const newTrancheMaturityWeek = nextWeek + STANDARD_CORP_TENOR_YEARS * 52;
      maintenanceFundingTranches = [{
        id: `${comp.ticker}-MAINT-${nextWeek}`,
        principalUSD: weeklyDebtFundedPortion,
        rateType: 'FLOATING',
        floatingMarginBps: Math.round(currentBaseSpreadBps * 1.1), // priced wide — bridge/revolver-style, not term financing
        originationWeek: nextWeek,
        maturityWeek: newTrancheMaturityWeek,
        seniority: 'SENIOR',
      }];
    }

    // 5. Deferred maintenance compounds into real operational decay
    const newMaintenanceShortfallStreak = maintenanceShortfallThisWeek > 0
      ? (comp.maintenanceShortfallStreak ?? 0) + 1
      : Math.max(0, (comp.maintenanceShortfallStreak ?? 0) - 2); // recovers twice as fast as it accumulates

    // Growth — fully discretionary, now disciplined by addressable opportunity:
    // Genuine reinvestment opportunity — bounded by how fast this company's actual addressable categories are growing, not by ambition
    const avgCategoryOpportunity = (comp.productLines || []).reduce((s, l) => {
      const catDemand = reg.categoryDemand[l.subUnitId];
      return s + Math.max(0, catDemand?.demandGrowthAnnual ?? 0) * l.revenueShare;
    }, 0);
    const productiveReinvestmentEnvelope = newRevenue * Math.max(0.01, avgCategoryOpportunity) * 1.5; // generous multiple of addressable growth, not arbitrary

    const fcfBeforeGrowthCapex = Math.max(0, weeklyOperatingCashFlow * 52 - newMaintenanceCapex);
    const excessCashGeneration = Math.max(0, fcfBeforeGrowthCapex - productiveReinvestmentEnvelope);
    const payoutPressure = fcfBeforeGrowthCapex > 0 ? Math.min(1, excessCashGeneration / fcfBeforeGrowthCapex) : 0;

    const growthCapexToRevenueRatio = comp.baselineGrowthCapexToRevenueRatio ?? ((comp.growthCapex ?? (comp.capex * 0.4)) / Math.max(1, comp.annualRevenue));
    const rateDrag = Math.max(0, effectiveDebtRate - 0.04) * 2.0;
    const cashHealthFactor = comp.cash < 0 ? 0.05 : (comp.cash < comp.currentLiabilities * 0.25 ? 0.4 : 1.0);
    const safeMarketCap = Math.max(0, isFinite(comp.marketCap) ? comp.marketCap : 0);
    const safeTotalDebt = Math.max(0, isFinite(comp.totalDebt) ? comp.totalDebt : 0);
    const safeRev = Math.max(1, isFinite(comp.annualRevenue) ? comp.annualRevenue : 1);
    const tobinsQ = Math.max(0.1, Math.min(10.0, safeMarketCap / Math.max(1, safeTotalDebt + safeRev * 1.5)));
    const qCapexEffect = ((tobinsQ - 1) * 0.2);
    const avgCompetitiveness = (comp.productLines || []).reduce((s, l) => s + l.competitiveness, 0) / Math.max(1, (comp.productLines || []).length);
    const competitivenessCapexEffect = (avgCompetitiveness * 0.15);
    const growthCapexAllocationShare = Math.max(0.4, 1 - payoutPressure * 0.75); // even at max payout pressure, still reinvests at least 40% — realistic, not zero
    const targetGrowthCapex = newRevenue * growthCapexToRevenueRatio * (1 - rateDrag) * cashHealthFactor * (1 + qCapexEffect + competitivenessCapexEffect) * growthCapexAllocationShare;
    let newGrowthCapex = Math.max(0, (comp.growthCapex ?? (comp.capex * 0.4)) * 0.90 + targetGrowthCapex * 0.10);
    let newRndExpense = comp.rndExpense ?? 0;
    if ((comp.productLines || []).some(l => l.industry === 'TechHardwareSemis' || l.industry === 'SoftwareDigitalServices')) {
        newRndExpense = newGrowthCapex * 0.4;
        newGrowthCapex = newGrowthCapex * 0.6;
    }

    const growthCapexIntensity = (newGrowthCapex - (comp.growthCapex ?? 0)) / Math.max(1, comp.growthCapex ?? 1);
    const isAutomating = growthCapexIntensity > 0.05 && newExecutionQuality > 1.0;
    const newOccupationMixDrift = { ...(comp.occupationMixDrift || {}) };
    if (isAutomating) {
      newOccupationMixDrift.TECHNICAL_ENGINEERING = Math.min(0.15, (newOccupationMixDrift.TECHNICAL_ENGINEERING ?? 0) + 0.001);
      newOccupationMixDrift.GENERAL = Math.max(-0.15, (newOccupationMixDrift.GENERAL ?? 0) - 0.001);
    }

    const newCapex = comp.sector === 'Banks' ? 0 : (newMaintenanceCapex + newGrowthCapex);

    // Weekly Cash flow and debt amortization / prepayment
    const weeklyFreeCashFlow = comp.sector === 'Banks'
      ? (newNetIncome / 52)
      : (newEbitda / 52 - newCapex / 52 - weeklyInterest + weeklyDebtFundedPortion - (productionCostUSD + carryingCostUSD));
    let newCash = comp.cash + weeklyFreeCashFlow;
    const update = companyUpdates[comp.ticker];
    if (update && update.cashChange !== undefined) {
      newCash += update.cashChange;
    }
    let newTotalDebt = comp.totalDebt;

    const newBaselineDividendYield = Number((comp.baselineDividendYield * 0.998 + comp.dividendYield * 0.002).toFixed(4));
    const targetDivYield = newBaselineDividendYield * (newCash < 0 ? 0.4 : (newCash > 2 * comp.currentLiabilities ? 1.2 : 1.0)) * (1 + payoutPressure * 2.5);
    const newDividendYield = Math.max(0, comp.dividendYield * 0.9 + targetDivYield * 0.1);

    const headcountPressure = newCash < 0 ? -0.015 : (newEbitdaMargin < baseEbitdaMargin - 0.01 ? -0.002 : (reg.cycleRegime === 'Expansion' ? 0.001 : (reg.cycleRegime === 'Recession' ? -0.002 : 0)));
    const newEmployeeCount = Math.max(10, Math.round(comp.employeeCount * (1 + headcountPressure)));

    // Debt Prepayment Rule: When Cash > 2.5x Current Liabilities, retire debt principal
    if (newCash > 2.5 * comp.currentLiabilities && newTotalDebt > 50) {
      const prepayment = Math.min(newTotalDebt * 0.05, (newCash - 2.5 * comp.currentLiabilities) * 0.25);
      newCash -= prepayment;
      newTotalDebt -= prepayment;
    }

    // Credit metrics
    const rawLeverage = comp.sector === 'Banks'
      ? (newTotalDebt / Math.max(1, newRevenue * 0.4))
      : (newTotalDebt / Math.max(1, newEbitda));
    const newLeverage = isFinite(rawLeverage) ? Number(Math.max(0, Math.min(100, rawLeverage)).toFixed(2)) : 5.0;

    const rawCoverage = comp.sector === 'Banks'
      ? (reg.bankingSector.bankCapitalRatio < 0.05 ? 0.4 : 3.0)
      : (newEbit / Math.max(0.5, annualInterest));
    const newCoverage = isFinite(rawCoverage) ? Number(Math.max(-50, Math.min(50, rawCoverage)).toFixed(2)) : 1.5;

    // Default trigger: Cash < 0 and Coverage < 0.8x (or previously defaulted, provided not merger-acquired)
    let isDefaulted = !comp.mergerAcquired && (comp.isDefaulted || (newCash < 0 && newCoverage < 0.8));
    let newRating = comp.creditRating;

    if (isDefaulted) {
      newRating = 'D';
      if (!comp.isDefaulted) {
        defaultedTickers.push(comp.ticker);
        newRevenue = Number((newRevenue * 0.4).toFixed(1));
        newEbitda = 0;
        newEbit = 0;
      }
    } else {
      const calculatedRating = determineCreditRating(newLeverage, newCoverage);
      if (calculatedRating !== comp.creditRating && Math.random() < 0.25) {
        ratingChanges.push({
          ticker: comp.ticker,
          from: comp.creditRating,
          to: calculatedRating,
          name: comp.name,
        });
        newRating = calculatedRating;
      }
    }

    // Dynamic OAS credit spread & Leveraged Loan pricing
    const bucket = getRatingBucket(newRating);
    const bucketPeers = state.companies.filter(c => c.region === comp.region && getRatingBucket(c.creditRating) === bucket);
    const targetOasBps = computeExpectedLossSpreadBps(comp) + computeBucketDemandPremiumBps(bucket, reg, bucketPeers);
    const rawOas = comp.oasSpreadBps + (targetOasBps - comp.oasSpreadBps) * 0.35;
    comp.oasSpreadBps = isFinite(rawOas) ? Number(Math.max(10, Math.min(5000, rawOas)).toFixed(2)) : 150;

    // Pre-refinancing trigger roughly one year before maturity
    let companyTranches = comp.debtTranches.map(t => ({ ...t }));

    // Corporate debt lifecycle: prepayment/call when genuinely accretive
    companyTranches.forEach(tranche => {
      if (tranche.rateType !== 'FIXED') return;
      const currentFairRate = calculateNelsonSiegelZeroRate(Math.max(0.5, (tranche.maturityWeek - state.currentWeek) / 52), reg.yieldCurveParams) + comp.oasSpreadBps / 10000;
      const rateSavingsIfRefinanced = tranche.couponRate - currentFairRate;
      const excessCashAvailable = newCash > comp.annualRevenue * 0.15;
      if (rateSavingsIfRefinanced > 0.01 && excessCashAvailable && newRating !== 'CCC' && newRating !== 'D') {
        const prepayAmountUSD = Math.min(tranche.principalUSD, newCash - comp.annualRevenue * 0.15);
        tranche.principalUSD -= prepayAmountUSD;
        newCash -= prepayAmountUSD;
      }
    });
    // Remove any tranche whose principalUSD reaches zero
    companyTranches = companyTranches.filter(t => t.principalUSD > 0.01);

    const tranchesToRefinance = companyTranches.filter(tranche => {
      const weeksToMaturity = tranche.maturityWeek - state.currentWeek;
      return weeksToMaturity <= 52 && weeksToMaturity > 45 && !tranche._refinanceInitiated;
    });

    tranchesToRefinance.forEach(tranche => {
      const originalTranche = companyTranches.find(t => t.id === tranche.id);
      if (originalTranche) {
        originalTranche._refinanceInitiated = true;
      }
      const fiveYearSovRateForRefi = calculateNelsonSiegelZeroRate(5, updatedRegions[comp.region].yieldCurveParams);
      const currentBaseSpreadBpsForRefi = comp.oasSpreadBps;
      const currentFairCouponRate = fiveYearSovRateForRefi + currentBaseSpreadBpsForRefi / 10000;
      const currentFloatingMarginBps = Math.round(currentBaseSpreadBpsForRefi * 0.85);

      const refinanceTranche: DebtTranche = tranche.rateType === 'FIXED'
        ? {
            id: `${comp.id}-REFI-${state.currentWeek}`,
            principalUSD: tranche.principalUSD,
            rateType: 'FIXED',
            couponRate: currentFairCouponRate,
            originationWeek: state.currentWeek,
            maturityWeek: state.currentWeek + STANDARD_CORP_TENOR_YEARS * 52,
            seniority: 'SENIOR',
          }
        : {
            id: `${comp.id}-REFI-${state.currentWeek}`,
            principalUSD: tranche.principalUSD,
            rateType: 'FLOATING',
            floatingMarginBps: currentFloatingMarginBps,
            originationWeek: state.currentWeek,
            maturityWeek: state.currentWeek + STANDARD_CORP_TENOR_YEARS * 52,
            seniority: 'SENIOR',
          };
      companyTranches.push(refinanceTranche);
    });

    const maturingTranche = companyTranches.find(t => t.maturityWeek === nextWeek);
    let updatedTranches = companyTranches.filter(t => t.maturityWeek !== nextWeek);
    let refinancingNewsItem: NewsItem | null = null;
    let refinancingSpreadShockBps = 0; // Kept to 0, or calculated if needed, but we rely on new interest calc now
    let debtIssuanceThisWeek = 0;
    let debtRepaymentThisWeek = 0;
    let buybacksThisWeek = 0;

    if (maturingTranche) {
      debtRepaymentThisWeek = maturingTranche.principalUSD;

      if (maturingTranche._refinanceInitiated) {
        // Already pre-refinanced a year ago. Just repay the maturing principal without issuing a new tranche now.
        debtIssuanceThisWeek = 0;
      } else {
        // Fallback: standard refinancing at maturity
        const currentFixedShare = FIXED_SHARE_BY_RATING[comp.creditRating] ?? 0.5; // re-evaluated at CURRENT rating
        const refinanceAsFixed = Math.random() < currentFixedShare;
        const currentBaseSpreadBps = comp.oasSpreadBps;
        const fiveYearSovRateAtMaturity = calculateNelsonSiegelZeroRate(5, updatedRegions[comp.region].yieldCurveParams);

        debtIssuanceThisWeek = maturingTranche.principalUSD;

        const newTranche: DebtTranche = refinanceAsFixed
          ? {
              id: `${comp.ticker}-T${nextWeek}`,
              principalUSD: maturingTranche.principalUSD,
              rateType: 'FIXED',
              couponRate: fiveYearSovRateAtMaturity + currentBaseSpreadBps / 10000,
              originationWeek: nextWeek,
              maturityWeek: nextWeek + STANDARD_CORP_TENOR_YEARS * 52,
              seniority: 'SENIOR',
            }
          : {
              id: `${comp.ticker}-T${nextWeek}`,
              principalUSD: maturingTranche.principalUSD,
              rateType: 'FLOATING',
              floatingMarginBps: Math.round(currentBaseSpreadBps * 0.85),
              originationWeek: nextWeek,
              maturityWeek: nextWeek + STANDARD_CORP_TENOR_YEARS * 52,
              seniority: 'SENIOR',
            };
        updatedTranches = [...updatedTranches, newTranche];

        const oldRateDescription = maturingTranche.rateType === 'FIXED' ? `${((maturingTranche.couponRate ?? 0) * 100).toFixed(1)}% fixed` : `policy+${maturingTranche.floatingMarginBps}bps floating`;
        const newRateDescription = newTranche.rateType === 'FIXED' ? `${((newTranche.couponRate ?? 0) * 100).toFixed(1)}% fixed` : `policy+${newTranche.floatingMarginBps}bps floating`;
        refinancingNewsItem = {
          id: `refinance-${comp.ticker}-${nextWeek}`,
          week: nextWeek,
          title: `${comp.ticker} Refinances Maturing Tranche`,
          description: `${comp.name} refinanced a maturing ${formatCurrency(maturingTranche.principalUSD, { compact: true })} tranche (was ${oldRateDescription}) into a new ${newRateDescription} tranche.`,
          category: 'CREDIT',
          impactBadge: newTranche.rateType === 'FLOATING' && maturingTranche.rateType === 'FIXED' ? '[REFINANCING SQUEEZE]' : '[REFINANCING]',
          impactRegion: comp.region,
          impactSector: comp.sector,
          sentimentDelta: newTranche.rateType === 'FLOATING' && maturingTranche.rateType === 'FIXED' ? -0.05 : 0,
          affectedTicker: comp.ticker,
          urgent: true,
        };
        refinanceNews.push(refinancingNewsItem);
      }
    }

    if (maintenanceFundingTranches.length > 0) {
      updatedTranches = [...updatedTranches, ...maintenanceFundingTranches];
      debtIssuanceThisWeek += maintenanceFundingTranches.reduce((s, t) => s + t.principalUSD, 0);
    }

    const rawNewOas = comp.oasSpreadBps + (targetOasBps - comp.oasSpreadBps) * 0.35 + refinancingSpreadShockBps + (Math.random() - 0.5) * 5;
    const newOasBps = isFinite(rawNewOas) ? Math.round(Math.max(10, Math.min(5000, rawNewOas))) : 150;
    const rawNewCds = newOasBps + Math.floor(Math.random() * 8 - 4);
    const newCdsSpreadBps = isFinite(rawNewCds) ? Math.round(Math.max(10, Math.min(5000, rawNewCds))) : 150;

    const loanPricing = priceLeveragedLoan(
      comp.leveragedLoan.quotedMarginBps,
      newOasBps,
      comp.leveragedLoan.tenorYears,
      isDefaulted,
      0.65
    );

    // Asynchronous Quarterly Earnings cycle
    const isReportingThisWeek = !isDefaulted && comp.earningsWeekModulo === currentWeekMod13;
    let lastEarningsSurprisePct = comp.lastEarningsSurprisePct;
    let lastManagementCommentary = comp.lastManagementCommentary;
    let sentimentDelta = 0;

    let updatedConsensus = comp.dealerConsensus;

    if (isReportingThisWeek) {
      // Mean of Dealer Alpha, Beta, and Gamma estimates
      const alphaEps = comp.dealerConsensus?.alpha?.eps ?? comp.eps;
      const betaEps = comp.dealerConsensus?.beta?.eps ?? comp.eps;
      const gammaEps = comp.dealerConsensus?.gamma?.eps ?? comp.eps;
      const consensusEps = Number(((alphaEps + betaEps + gammaEps) / 3).toFixed(2));
      const actualEps = newEps;
      const epsDiff = actualEps - consensusEps;
      const rawSurprise = epsDiff / Math.max(Math.abs(consensusEps), Math.abs(actualEps), 1.0);
      lastEarningsSurprisePct = Number((rawSurprise).toFixed(3));

      // Management commentary & guidance snippet generation
      let guidanceSnippet = '';
      if (lastEarningsSurprisePct > 0.05) {
        guidanceSnippet = 'Management raises FY CapEx and operating margin guidance on strong forward demand.';
        lastManagementCommentary = `CEO affirmed record operational throughput and upgraded full-year EPS guidance (+${(lastEarningsSurprisePct * 100).toFixed(1)}% surprise).`;
        sentimentDelta = Math.min(0.35, lastEarningsSurprisePct * 2.0);
      } else if (lastEarningsSurprisePct < -0.05) {
        guidanceSnippet = 'Management moderates full-year revenue outlook and tightens working capital due to input cost pressures.';
        lastManagementCommentary = `Management cited sector supply headwinds and moderated CapEx plans (${(lastEarningsSurprisePct * 100).toFixed(1)}% miss).`;
        sentimentDelta = Math.max(-0.40, lastEarningsSurprisePct * 2.5);
      } else {
        guidanceSnippet = 'Management reaffirms FY baseline guidance with stable unit economics and operating backlog.';
        lastManagementCommentary = `In-line quarterly results with steady gross margins and stable backlog demand.`;
        sentimentDelta = (Math.random() - 0.5) * 0.05;
      }

      earningsReportedThisTurn.push({
        ticker: comp.ticker,
        name: comp.name,
        actualEps,
        consensusEps,
        surprisePct: lastEarningsSurprisePct,
        guidanceSnippet,
        sector: comp.sector,
        region: comp.region,
      });

      // Update next quarter 3-dealer forecasts
      const nextQuarterBaseEps = actualEps * (1 + sec.growthRate / 4);
      const nextAlphaEps = Number((nextQuarterBaseEps * 0.96).toFixed(2));
      const nextBetaEps = Number((nextQuarterBaseEps * (1 + reg.gdpGrowth)).toFixed(2));
      const nextGammaEps = Number((nextQuarterBaseEps * 1.08).toFixed(2));
      const newConsensusEps = Number(((nextAlphaEps + nextBetaEps + nextGammaEps) / 3).toFixed(2));

      const nextQuarterBaseRev = newRevenue * (1 + sec.growthRate / 4);
      const alphaRev = Number((nextQuarterBaseRev * 0.98).toFixed(1));
      const betaRev = Number((nextQuarterBaseRev * 1.02).toFixed(1));
      const gammaRev = Number((nextQuarterBaseRev * 1.06).toFixed(1));
      const newConsensusRev = Number(((alphaRev + betaRev + gammaRev) / 3).toFixed(1));

      updatedConsensus = {
        alpha: { eps: nextAlphaEps, revenue: alphaRev },
        beta: { eps: nextBetaEps, revenue: betaRev },
        gamma: { eps: nextGammaEps, revenue: gammaRev },
        consensusEps: newConsensusEps,
        consensusRevenue: newConsensusRev,
      };
    }

    const sectorPE = SECTOR_BENCHMARKS[comp.sector]?.basePE ?? 15;
    const realRate = reg.policyRate - reg.inflation;
    const rateEffect = -(realRate - reg.neutralRate) * 8;
    const growthEffect = (reg.gdpGrowth - reg.potentialGdpGrowth) * 4;
    const targetPE = sectorPE * (1 + (rateEffect + growthEffect));
    const newForwardPE = Number((comp.forwardPE * 0.97 + Math.max(sectorPE * 0.5, Math.min(sectorPE * 1.6, targetPE)) * 0.03).toFixed(2));

    const newSentiment = (comp.sentiment * 0.85 + sentimentDelta);
    const unadjustedStockPrice = isDefaulted ? 0.0 : Number(priceEquity(newEps, newForwardPE, newSentiment, false).toFixed(2));

    const totalRegionEquityCapUSD = state.companies.filter(c => c.region === comp.region).reduce((s, c) => s + c.marketCap, 0);
    const equityPremium = computeSupplyDemandPremium(
      reg.equityOwnership,
      { bank: reg.bankingSector.bankEquityUSD, institutional: reg.institutionalSector.sectorEquityUSD },
      totalRegionEquityCapUSD
    );
    let newStockPrice = isDefaulted ? 0.0 : Math.max(0.10, Number((unadjustedStockPrice * (1 + Math.max(-0.5, Math.min(0.5, equityPremium)) * 0.1)).toFixed(2)));
    if (comp.isBankEntity) {
      const bankBookValue = Math.max(10, reg.bankingSector.bankEquityUSD * (comp.bankMarketShare ?? 0.25));
      const cycle = reg.cycleRegime;
      let pbMultiple = 1.0;
      if ((cycle as string) === 'Boom') pbMultiple = 1.1;
      else if (cycle === 'Expansion') pbMultiple = 1.0;
      else if (cycle === 'Slowdown') pbMultiple = 0.8;
      else if (cycle === 'Recession') pbMultiple = 0.6;
      
      const bankMarketCap = bankBookValue * pbMultiple;
      const safeShares = Math.max(1, comp.sharesOutstanding || 1);
      newStockPrice = isDefaulted ? 0.0 : Math.max(0.10, Number((bankMarketCap / safeShares).toFixed(2)));
    } else if (comp.isInstitutionalEntity) {
      const instBookValue = Math.max(10, reg.institutionalSector.sectorEquityUSD * (comp.institutionalMarketShare ?? 0.33));
      const cycle = reg.cycleRegime;
      let pbMultiple = 1.0;
      if ((cycle as string) === 'Boom') pbMultiple = 1.15;
      else if (cycle === 'Expansion') pbMultiple = 1.05;
      else if (cycle === 'Slowdown') pbMultiple = 0.85;
      else if (cycle === 'Recession') pbMultiple = 0.65;
      
      const instMarketCap = instBookValue * pbMultiple;
      const safeShares = Math.max(1, comp.sharesOutstanding || 1);
      newStockPrice = isDefaulted ? 0.0 : Math.max(0.10, Number((instMarketCap / safeShares).toFixed(2)));
    }
    const hist = [...comp.historicalPrices.slice(-51), newStockPrice];

    // Company Treasury Holdings (Part MF) - Fixed Cash Leak & Liquidations
    const investableCashUSD = Math.max(0, newCash - newRevenue * 0.05);
    const targetTreasuryUSD = investableCashUSD * 0.6;
    const currentTreasuryUSD = (comp.treasuryHoldings || []).reduce((s, h) => s + h.quantityOrNotionalUSD, 0);
    let newTreasuryHoldings = [...(comp.treasuryHoldings || [])];
    if (targetTreasuryUSD > currentTreasuryUSD) {
      const nearestGovTranche = reg.govDebtTranches.find(t => t.tenorAtIssuanceYears <= 2);
      if (nearestGovTranche) {
        const purchaseAmountUSD = targetTreasuryUSD - currentTreasuryUSD;
        newTreasuryHoldings.push({
          instrumentId: nearestGovTranche.id,
          instrumentType: 'GOV_BOND',
          issuerRegion: comp.region,
          quantityOrNotionalUSD: purchaseAmountUSD
        });
        newCash -= purchaseAmountUSD; // debit the cash
      }
    } else if (targetTreasuryUSD < currentTreasuryUSD) {
      const sellAmountUSD = currentTreasuryUSD - targetTreasuryUSD;
      if (currentTreasuryUSD > 0) {
        const scale = targetTreasuryUSD / currentTreasuryUSD;
        newTreasuryHoldings = newTreasuryHoldings.map(h => ({
          ...h,
          quantityOrNotionalUSD: h.quantityOrNotionalUSD * scale
        })).filter(h => h.quantityOrNotionalUSD > 0.01);
        newCash += sellAmountUSD; // credit the cash
      }
    }

    // Buyback Execution (Part AH)
    let updatedSharesOutstanding = comp.sharesOutstanding;
    const targetCashBuffer = Math.max(10, comp.currentLiabilities * 1.5);
    const excessCash = Math.max(0, newCash - targetCashBuffer);
    const debtToEquity = newTotalDebt / Math.max(1, (newStockPrice * comp.sharesOutstanding));
    if (excessCash > 5 && debtToEquity < 0.6 && comp.sharesOutstanding > 10 && !isDefaulted && newStockPrice > 0) {
      const estimatedBookValuePerShare = Math.max(0.5, (newCash + newRevenue * 0.8 - newTotalDebt) / comp.sharesOutstanding);
      const isCheap = newStockPrice < estimatedBookValuePerShare || newForwardPE < (sectorPE * 0.95);
      const buybackShare = isCheap ? 0.60 : 0.25;
      const buybackSpendM = (excessCash * 0.05 / 52) * buybackShare;
      const sharesToRetire = Math.min(comp.sharesOutstanding * 0.005, buybackSpendM / Math.max(0.1, newStockPrice));
      if (sharesToRetire > 0.001) {
        updatedSharesOutstanding = Math.max(1.0, comp.sharesOutstanding - sharesToRetire);
        buybacksThisWeek = sharesToRetire * newStockPrice;
        newCash -= buybacksThisWeek;
      }
    }
    const newMarketCap = Number((newStockPrice * updatedSharesOutstanding).toFixed(0));
    const newSeniorBondYield = reg.zeroRates.tenor5Y + newOasBps / 10000;

    const quarterIdx = Math.floor((nextWeek - 1) / 13) + 4;
    const prevSnapshot = comp.historicalFundamentals ? comp.historicalFundamentals[comp.historicalFundamentals.length - 1] : undefined;
    const currentTreasuryHoldingsUSD = (newTreasuryHoldings || []).reduce((s, h) => s + h.quantityOrNotionalUSD, 0);

    const currentSnapshot = buildQuarterlyFundamentalSnapshot(
      nextWeek,
      formatQuarterFilingDate(quarterIdx),
      formatSimulationDate(nextWeek),
      newRevenue,
      newEbitda,
      newNetIncome,
      newEps,
      newCash,
      newTotalDebt,
      currentTreasuryHoldingsUSD,
      newFinishedGoodsInventoryUSD,
      newMaintenanceCapex,
      newGrowthCapex,
      newOasBps,
      newDividendYield,
      newMarketCap,
      prevSnapshot,
      debtIssuanceThisWeek,
      debtRepaymentThisWeek,
      buybacksThisWeek
    );
    const histFundamentals = isReportingThisWeek
      ? [...(comp.historicalFundamentals || []).slice(-3), currentSnapshot]
      : comp.historicalFundamentals || [];

    const systemicStressFactor = systemicStressFactorGlobal + Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.3;
    const newBaselineRecoveryRate = Number(((comp.baselineRecoveryRate ?? 0.40) * 0.998 + comp.recoveryRate * 0.002).toFixed(4));
    const effectiveRecoveryRate = Math.max(0.10, newBaselineRecoveryRate * (1 - systemicStressFactor));
    const trendWeeklyGrowth = (reg.potentialGdpGrowth + reg.targetInflation) / 52;
    const newBaselineAnnualRevenue = isDefaulted
      ? Number((comp.baselineAnnualRevenue * 0.995).toFixed(1))
      : Number((comp.baselineAnnualRevenue * (1 + trendWeeklyGrowth)).toFixed(1));

    const revHist = comp.revenueHistory || [newRevenue];
    let calculatedRevVol = 0;
    if (revHist.length > 2) {
      const meanRev = revHist.reduce((s, v) => s + v, 0) / revHist.length;
      if (meanRev > 0) {
        const varRev = revHist.reduce((s, v) => s + Math.pow(v - meanRev, 2), 0) / revHist.length;
        calculatedRevVol = Math.sqrt(varRev) / meanRev;
      }
    }
    const calculatedSegmentFinancials: SegmentFinancial[] = (updatedProductLines || []).map(line => {
      const share = line.revenueShare || 1.0;
      return {
        subUnitId: line.subUnitId,
        revenueUSD: Number((newRevenue * share).toFixed(0)),
        ebitdaUSD: Number((newEbitda * share).toFixed(0)),
        capexUSD: Number((newCapex * share).toFixed(0)),
      };
    });

    return {
      ...comp,
      revenueVolatility: Number(calculatedRevVol.toFixed(4)),
      segmentFinancials: calculatedSegmentFinancials,
      forwardPE: newForwardPE,
      baselineRecoveryRate: newBaselineRecoveryRate,
      baselineDividendYield: newBaselineDividendYield,
      previousEmployeeCount: comp.employeeCount,
      previousCapex: comp.capex,
      maintenanceCapex: Number(newMaintenanceCapex.toFixed(1)),
      growthCapex: Number(newGrowthCapex.toFixed(1)),
      rndExpense: Number(newRndExpense.toFixed(1)),
      maintenanceShortfallStreak: newMaintenanceShortfallStreak,
      executionQuality: Number(newExecutionQuality.toFixed(3)),
      occupationMixDrift: newOccupationMixDrift,
      inputSupplyConstraintFactor: Number(newInputSupplyConstraintFactor.toFixed(4)),
      _targetProductionUSD: (companyUpdates[comp.ticker]?._targetProductionUSD ?? targetProductionUSD),
      finishedGoodsInventoryUSD: Number(newFinishedGoodsInventoryUSD.toFixed(2)),
      finishedGoodsUnits: (update && update.finishedGoodsUnits !== undefined)
        ? update.finishedGoodsUnits
        : (comp.finishedGoodsUnits ?? ((comp.finishedGoodsInventoryUSD ?? 0) / ((reg.categoryDemand['industrial_automation'] as any)?.unitPriceUSD ?? 80000.0))),
      inventoryCarryingCostRate: comp.inventoryCarryingCostRate ?? 0.02,
      recentFulfillmentEMA: Number(newRecentFulfillmentEMA.toFixed(4)),
      employeeCount: isDefaulted ? 0 : newEmployeeCount,
      recoveryRate: Number(effectiveRecoveryRate.toFixed(3)),
      debtTranches: updatedTranches,
      productLines: updatedProductLines,
      totalDebt: updatedTranches.reduce((s, t) => s + t.principalUSD, 0),
      dividendYield: Number(newDividendYield.toFixed(4)),
      capex: Number(newCapex.toFixed(1)),
      annualRevenue: Number(newRevenue.toFixed(1)),
      baselineAnnualRevenue: newBaselineAnnualRevenue,
      ebitda: Number(newEbitda.toFixed(1)),
      ebit: Number(newEbit.toFixed(1)),
      netIncome: Number(newNetIncome.toFixed(1)),
      eps: newEps,
      sharesOutstanding: Number(updatedSharesOutstanding.toFixed(3)),
      technicalReservesUSD: comp.technicalReservesUSD,
      aumUSD: comp.aumUSD,
      managementFeeRate: comp.managementFeeRate,
      insurancePremiumsWrittenUSD: comp.insurancePremiumsWrittenUSD,
      insuranceClaimsPaidUSD: comp.insuranceClaimsPaidUSD,
      cash: Number(newCash.toFixed(1)),
      leverage: newLeverage,
      interestCoverage: newCoverage,
      creditRating: newRating,
      ratingHistory: [...comp.ratingHistory.slice(-15), newRating],
      historicalFundamentals: histFundamentals,
      isDefaulted,
      stockPrice: newStockPrice,
      historicalPrices: hist,
      marketCap: newMarketCap,
      oasSpreadBps: newOasBps,
      cdsSpreadBps: newCdsSpreadBps,
      seniorBondYield: newSeniorBondYield,
      sentiment: newSentiment,
      reportedThisWeek: isReportingThisWeek,
      lastEarningsReportWeek: isReportingThisWeek ? nextWeek : comp.lastEarningsReportWeek,
      dealerConsensus: updatedConsensus,
      lastEarningsSurprisePct,
      lastManagementCommentary,
      leveragedLoan: {
        ...comp.leveragedLoan,
        pricePar: loanPricing.pricePar,
        discountMarginBps: loanPricing.discountMarginBps,
      },
      treasuryHoldings: newTreasuryHoldings,
    };
  });

        
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    // === STAGE 09-concentration-risk.ts ===

    
    

    
        
      // Compute concentration risk flags (>40% threshold) from real activeContracts
  updatedCompanies.forEach(comp => {
    const flags: string[] = [];
    const reg = updatedRegions[comp.region];
    const contracts = reg?.activeContracts || [];
    
    // Supplier concentration
    const asSupplier = contracts.filter(c => c.supplierCompanyId === comp.ticker || c.supplierCompanyId === comp.id);
    const totalSupplierVal = asSupplier.reduce((s, c) => s + c.quantityUnitsPerWeek * c.priceUSD * 52, 0);
    if (totalSupplierVal > 0) {
      const custTotals: Record<string, number> = {};
      asSupplier.forEach(c => {
        custTotals[c.customerCompanyId] = (custTotals[c.customerCompanyId] || 0) + (c.quantityUnitsPerWeek * c.priceUSD * 52);
      });
      Object.entries(custTotals).forEach(([custTicker, val]) => {
        const share = val / totalSupplierVal;
        if (share > 0.40) {
          const custComp = updatedCompanies.find(x => x.ticker === custTicker || x.id === custTicker);
          const custName = custComp?.name || custTicker;
          flags.push(`High Customer Concentration: ${custName} (${(share * 100).toFixed(0)}% of contract revenue)`);
        }
      });
    }

    // Customer concentration
    const asCustomer = contracts.filter(c => c.customerCompanyId === comp.ticker || c.customerCompanyId === comp.id);
    const totalCustomerVal = asCustomer.reduce((s, c) => s + c.quantityUnitsPerWeek * c.priceUSD * 52, 0);
    if (totalCustomerVal > 0) {
      const supTotals: Record<string, number> = {};
      asCustomer.forEach(c => {
        supTotals[c.supplierCompanyId] = (supTotals[c.supplierCompanyId] || 0) + (c.quantityUnitsPerWeek * c.priceUSD * 52);
      });
      Object.entries(supTotals).forEach(([supTicker, val]) => {
        const share = val / totalCustomerVal;
        if (share > 0.40) {
          const supComp = updatedCompanies.find(x => x.ticker === supTicker || x.id === supTicker);
          const supName = supComp?.name || supTicker;
          flags.push(`High Supplier Concentration: ${supName} (${(share * 100).toFixed(0)}% of input supply)`);
        }
      });
    }

    comp.concentrationRiskFlags = flags;
  });

        
    
    
    // === STAGE 10-ipo-and-ma.ts ===

    
    
    
    
    
    

    
        
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

        
    
    
    
    
    
    
    // === STAGE 11-fiscal-and-sovereign-debt.ts ===

    
    
    
    
    
    
    
    
    

    
        
      // Part ME: Itemized holdings attribution
  (Object.keys(updatedRegions) as RegionId[]).forEach(regionId => {
    const reg = updatedRegions[regionId];
    const regionCompanies = updatedCompanies.filter(c => c.region === regionId && isActiveCompany(c));
    
    const corpCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = [];
    const equityCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = [];
    
    regionCompanies.forEach(c => {
      equityCandidates.push({ id: c.id, type: 'EQUITY', region: regionId, outstandingUSD: c.marketCap });
      (c.debtTranches || []).forEach(t => {
        corpCandidates.push({
          id: t.id,
          type: t.rateType === 'FIXED' ? 'CORP_BOND' : 'LEVERAGED_LOAN',
          region: regionId,
          outstandingUSD: t.principalUSD
        });
      });
    });
    
    const sovCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = (reg.govDebtTranches || []).map(gt => ({
      id: gt.id,
      type: 'GOV_BOND',
      region: regionId,
      outstandingUSD: gt.principalUSD
    }));
    
    const totalCorpUSD = corpCandidates.reduce((s, c) => s + c.outstandingUSD, 0);
    const totalSovUSD = sovCandidates.reduce((s, c) => s + c.outstandingUSD, 0);
    const totalEquityUSD = equityCandidates.reduce((s, c) => s + c.outstandingUSD, 0);
    
    // Banking Sector
    const bankCorpShareUSD = reg.corpBondOwnership.bankShare * totalCorpUSD;
    const bankSovShareUSD = reg.sovBondOwnership.bankShare * totalSovUSD;
    const bankEquityShareUSD = reg.equityOwnership.bankShare * totalEquityUSD;
    
    reg.bankingSector.itemizedHoldings = [
      ...attributeItemizedHoldings(bankCorpShareUSD, corpCandidates),
      ...attributeItemizedHoldings(bankSovShareUSD, sovCandidates),
      ...attributeItemizedHoldings(bankEquityShareUSD, equityCandidates),
    ];
    
    // Institutional Sector
    const instCorpShareUSD = reg.corpBondOwnership.institutionalShare * totalCorpUSD;
    const instSovShareUSD = reg.sovBondOwnership.institutionalShare * totalSovUSD;
    const instEquityShareUSD = reg.equityOwnership.institutionalShare * totalEquityUSD;
    
    reg.institutionalSector.itemizedHoldings = [
      ...attributeItemizedHoldings(instCorpShareUSD, corpCandidates),
      ...attributeItemizedHoldings(instSovShareUSD, sovCandidates),
      ...attributeItemizedHoldings(instEquityShareUSD, equityCandidates),
    ];
  });

  // Phase 4a: Derived nominal GDP parallel diagnostic
  regionIds.forEach((regionId) => {
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;

    // C — household consumption, already-established convention
    const consumptionComponentUSD = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);

    // I — tracked company investment, scaled up to represent the whole private sector via Phase 1's employment split
    const trackedFirms = updatedCompanies.filter(f => f.region === regionId && isActiveCompany(f));
    const trackedInvestmentUSD = trackedFirms.reduce((s, f) => s + f.maintenanceCapex + f.growthCapex, 0);
    const trackedEmployment = trackedFirms.reduce((s, f) => s + f.employeeCount, 0);
    const totalPrivateEmployment = (reg.privateSectorSegments || []).reduce((s, seg) => s + seg.employment, 0);
    const investmentScaleFactor = trackedEmployment > 0 ? (trackedEmployment + totalPrivateEmployment) / trackedEmployment : 1;
    const investmentComponentUSD = trackedInvestmentUSD * investmentScaleFactor;

    // G — government spending, already established in Phase 2 (weekly flow, annualize)
    const governmentComponentUSD = reg.governmentSpendingUSD * 52;

    // NX — net exports, already established in Phase 3 (already annualized-scale)
    const netExportsComponentUSD = reg.exportsUSD - reg.importsUSD;

    const rawGdpUSD = consumptionComponentUSD + investmentComponentUSD + governmentComponentUSD + netExportsComponentUSD;
    const newDerivedNominalGdpUSD = Math.max(1e11, isFinite(rawGdpUSD) ? rawGdpUSD : 1e12);
    const gdpLevelLastWeek = (reg as any).lastWeekNominalGdpUSD > 0 ? (reg as any).lastWeekNominalGdpUSD : newDerivedNominalGdpUSD;
    const isStartupTransition = gdpLevelLastWeek < newDerivedNominalGdpUSD * 0.2;
    const rawWeeklyRealGrowthRate = (!isStartupTransition && gdpLevelLastWeek > 0 && isFinite(newDerivedNominalGdpUSD) && isFinite(gdpLevelLastWeek))
      ? Math.max(-0.04, Math.min(0.04, (newDerivedNominalGdpUSD / gdpLevelLastWeek - 1) - (reg.inflation / 52)))
      : 0;
    const prevSmoothedWeeklyRate = (reg as any).smoothedWeeklyGrowthRate ?? rawWeeklyRealGrowthRate;
    const smoothedWeeklyRate = prevSmoothedWeeklyRate * 0.85 + rawWeeklyRealGrowthRate * 0.15; // real EMA smoothing — a single week's noise no longer dominates
    const gdpGrowthBottomUp = Math.pow(1 + smoothedWeeklyRate, 52) - 1;

    if (!isFinite(gdpGrowthBottomUp)) {
      throw new Error(`gdpGrowthBottomUp is non-finite for region ${regionId} at week ${nextWeek}: ${gdpGrowthBottomUp}. This must be fixed at its real source, not papered over with an assumed growth rate.`);
    }
    const finalGdpGrowth = gdpGrowthBottomUp;

    // Government Debt Tranches: roll-off and new issuance
    const maturedTranches = (reg.govDebtTranches || []).filter(t => t.maturityWeek <= nextWeek);
    const liveTranches = (reg.govDebtTranches || []).filter(t => t.maturityWeek > nextWeek);
    const maturedPrincipalUSD = maturedTranches.reduce((s, t) => s + t.principalUSD, 0);

    const weeklyDeficitUSD = Math.max(0, reg.governmentSpendingUSD - reg.governmentRevenueUSD) + maturedPrincipalUSD;
    const monetizationShare = (reg.balanceSheetStance * 0.5);
    const monetizedAmountUSD = weeklyDeficitUSD * monetizationShare;
    const marketFundedDeficitUSD = weeklyDeficitUSD - monetizedAmountUSD;

    // Sovereign debt issued in large, infrequent blocks
    const currentUnfundedDeficitUSD = (reg.pendingUnfundedDeficitUSD ?? 0) + marketFundedDeficitUSD;
    const issuanceCalendarWeek = nextWeek % 13 === 0; // large blocks roughly quarterly, not every week
    
    let quarterlyFundingNeedUSD = 0;
    let nextPendingUnfundedDeficitUSD = currentUnfundedDeficitUSD;
    const newTranches: GovDebtTranche[] = [];

    // Curve-smart tenor allocation: read the actual yield curve shape already computed for this region.
    const curveSteepness = reg.zeroRates.tenor30Y - reg.zeroRates.tenor2Y;
    const baseWeights = { t2: 0.30, t5: 0.30, t10: 0.25, t30: 0.15 };
    const steepnessAdjustment = (curveSteepness * 3);
    const tenorWeights = {
      t2: Math.max(0.10, baseWeights.t2 + steepnessAdjustment * 0.5),
      t5: baseWeights.t5,
      t10: Math.max(0.10, baseWeights.t10 - steepnessAdjustment * 0.3),
      t30: Math.max(0.05, baseWeights.t30 - steepnessAdjustment * 0.2),
    };
    const weightSum = tenorWeights.t2 + tenorWeights.t5 + tenorWeights.t10 + tenorWeights.t30;

    if (issuanceCalendarWeek) {
      quarterlyFundingNeedUSD = currentUnfundedDeficitUSD; // roll up 13 weeks of accumulated need into one real issuance event
      nextPendingUnfundedDeficitUSD = 0;

      if (quarterlyFundingNeedUSD > 1000) {
        ([['t2', 2, 104], ['t5', 5, 260], ['t10', 10, 520], ['t30', 30, 1560]] as const).forEach(([key, tenorYears, tenorWeeks]) => {
          const principal = quarterlyFundingNeedUSD * (tenorWeights[key] / weightSum);
          if (principal < 100) return;
          newTranches.push({
            id: `${regionId}-GOV-${tenorYears}Y-${nextWeek}`,
            principalUSD: principal,
            couponRate: calculateNelsonSiegelZeroRate(tenorYears, reg.yieldCurveParams), // priced off the region's own real curve
            originationWeek: nextWeek,
            maturityWeek: nextWeek + tenorWeeks,
            tenorAtIssuanceYears: tenorYears,
          });
        });
      }
    }

    const updatedBankingSector = { ...reg.bankingSector };
    const updatedInstitutionalSector = { ...reg.institutionalSector };

    // Market-funded deficit routes to bond holdings (institutional + bank)
    if (issuanceCalendarWeek) {
      updatedBankingSector.sovereignBondHoldingsUSD += quarterlyFundingNeedUSD * 0.40;
      updatedInstitutionalSector.sovBondHoldingsUSD += quarterlyFundingNeedUSD * 0.60;
    } else {
      updatedBankingSector.sovereignBondHoldingsUSD += marketFundedDeficitUSD * 0.40;
      updatedInstitutionalSector.sovBondHoldingsUSD += marketFundedDeficitUSD * 0.60;
    }

    if (updatedBankingSector.centralBankReservesUSD < 0) throw new Error("Invariant Violation: centralBankReservesUSD cannot be negative");
    updatedBankingSector.centralBankReservesUSD = Number(updatedBankingSector.centralBankReservesUSD.toFixed(0));

    const totalGovDebtUSD = [...liveTranches, ...newTranches].reduce((s, t) => s + t.principalUSD, 0);
    const debtToGdpPctBottomUp = newDerivedNominalGdpUSD > 0 ? totalGovDebtUSD / newDerivedNominalGdpUSD : (reg.debtToGdpPctBottomUp || 0);

    updatedRegions[regionId] = {
      ...reg,
      gdpGrowth: finalGdpGrowth,
      estimatedNominalGdpUSD: newDerivedNominalGdpUSD,
      derivedNominalGdpUSD: newDerivedNominalGdpUSD,
      gdpGrowthBottomUp: Number(gdpGrowthBottomUp.toFixed(4)),
      smoothedWeeklyGrowthRate: smoothedWeeklyRate,
      lastWeekNominalGdpUSD: newDerivedNominalGdpUSD,
      nominalGdpHistory: reg.nominalGdpHistory || [],
      consumptionComponentUSD,
      investmentComponentUSD,
      govDebtTranches: [...liveTranches, ...newTranches],
      debtToGdpPctBottomUp,
      pendingUnfundedDeficitUSD: nextPendingUnfundedDeficitUSD,
      bankingSector: updatedBankingSector,
      institutionalSector: updatedInstitutionalSector,
    };
  });

  const generatedNews = generateWeeklyNews(
    nextWeek,
    updatedRegions,
    updatedCompanies,
    rateChanges,
    ratingChanges,
    defaultedTickers,
    earningsReportedThisTurn
  );
  newsItems.push(...generatedNews.newsItems);
  const _sectorSentimentShocks = generatedNews.sectorSentimentShocks;

        
    
    
    
    
    
    
    
    
    
    // === STAGE 12-portfolio-and-positions.ts ===

    
    
    
    
    
    
    
    
    
    
    

    
        
      // 7. Calculate Updated Composite Benchmark Indices
  updatedCompositeIndices = calculateCompositeIndices(
    updatedCompanies,
    updatedRegions,
    updatedCommodities,
    state.compositeIndices
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
  weeklyInterestIncomeUSD = Math.max(0, state.portfolio.cashUSD) * (usdPolicyRate / 52);
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
    };
  });
        
    
    
    
    
    
    
    
    
    
    
    // === STAGE 13-news-and-turn-summary.ts ===

    
    
    
    
    
    

    
        
      // 6. Generate Weekly Breaking News & Sentiment Shifts
  (Object.keys(updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = updatedRegions[regionId];
    const ipo = checkForIPO(regionId, reg, state.companies, nextWeek);
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

  const cashAfterWeek = state.portfolio.cashUSD + weeklyRealizedPnL + weeklyRealizedCashUSD - weeklyFinancingCostUSD;
  const navUSD = cashAfterWeek + updatedPositions.reduce((s, p) => s + p.unrealizedPnL, 0);
  const updatedPortfolio: Portfolio = {
    ...state.portfolio,
    cashUSD: cashAfterWeek,
    positions: updatedPositions,
    navUSD,
    totalRequiredMarginUSD,
    maintenanceMarginUSD,
    marginUtilizationPct: navUSD > 0 ? Math.round((totalRequiredMarginUSD / navUSD) * 100) : 100,
    isMarginCall: navUSD < maintenanceMarginUSD,
  };
  const updatedNewsFeed = [...state.newsFeed, ...newsItems].slice(-100);
  const updatedDiagnosticsLogs = [...state.diagnosticsLogs, ...diagnosticLogs].slice(-100);
  const year = state.year + (currentWeekMod13 === 13 && nextWeek % 52 === 0 ? 1 : 0);

  const pnlDeltaUSD = navUSD - state.portfolio.navUSD;
  const turnSummary: GameState['turnSummary'] = {
    week: nextWeek,
    pnlDeltaUSD,
    pnlDeltaPct: state.portfolio.navUSD > 0 ? Number(((pnlDeltaUSD / state.portfolio.navUSD) * 100).toFixed(2)) : 0,
    interestIncomeUSD: weeklyInterestIncomeUSD,
    financingCostUSD: weeklyFinancingCostUSD,
    defaultedCompanies: defaultedTickers,
    ratingsChanges: ratingChanges,
    earningsReported: earningsReportedThisTurn,
    marginAlert: updatedPortfolio.isMarginCall ? 'ACCOUNT IN MARGIN CALL: required maintenance margin exceeds NAV.' : null,
    attribution: {
      carryUSD: attributionCarry,
      macroRatesUSD: attributionMacroRates,
      creditSpreadUSD: attributionCreditSpread,
      equityDeltaUSD: attributionEquityDelta,
      volThetaUSD: attributionVolTheta,
    },
  };
  const isGameOver = navUSD <= 0;
  const gameOverReason = isGameOver ? 'Portfolio wiped out — NAV reached zero or below.' : null;

  return { 
    ...state, 
    currentWeek: nextWeek, 
    year, 
    regions: updatedRegions, 
    fxPairs: updatedFxPairs, 
    companies: updatedCompanies, 
    institutionalEntities: updatedInstitutionalEntities, 
    commodities: updatedCommodities, 
    compositeIndices: updatedCompositeIndices, 
    recentIPOs, 
    recentMergers, 
    marketVolPremium, 
    portfolio: updatedPortfolio, 
    newsFeed: updatedNewsFeed, 
    diagnosticsLogs: updatedDiagnosticsLogs, 
    turnSummary, 
    isGameOver, 
    gameOverReason 
  };
}
