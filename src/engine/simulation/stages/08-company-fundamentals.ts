
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


export function runStage_08_company_fundamentals(ctx: PipelineContext): PipelineContext {
    let updatedRegions = ctx.updatedRegions;
    let nextWeek = ctx.nextWeek;
    let getBlendedWageGrowth = ctx.getBlendedWageGrowth;
    let prevActiveFirms = ctx.prevActiveFirms;
    let updatedCommodities = ctx.updatedCommodities;
    let regionCategoryExports = ctx.regionCategoryExports;
    let companyUpdates = ctx.companyUpdates;
    let STANDARD_CORP_TENOR_YEARS = ctx.STANDARD_CORP_TENOR_YEARS;
    let getRatingBucket = ctx.getRatingBucket;
    let computeExpectedLossSpreadBps = ctx.computeExpectedLossSpreadBps;
    let computeBucketDemandPremiumBps = ctx.computeBucketDemandPremiumBps;
    let currentWeekMod13 = ctx.currentWeekMod13;
    let computeSupplyDemandPremium = ctx.computeSupplyDemandPremium;
    let systemicStressFactorGlobal = ctx.systemicStressFactorGlobal;

    // We will extract variables from ctx
        // (We will let typescript complain and manually fix it, or just use any)
      // 5. Evolve 200 Company Fundamentals + Asynchronous Earnings + Debt Prepayment + M&A
  const ratingChanges: { ticker: string; from: CreditRating; to: CreditRating; name: string }[] = [];
  const refinanceNews: NewsItem[] = [];
  const mergerNews: NewsItem[] = [];
  const defaultedTickers: string[] = [];
  const earningsReportedThisTurn: EarningsReportEvent[] = [];

  const updatedCompanies: Company[] = ctx.state.companies.map((comp) => {
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
      const instEnt = ctx.state.institutionalEntities.find(e => e.id === comp.id);
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
      const instEnt = ctx.state.institutionalEntities.find(e => e.id === comp.id);
      const equityIndex = comp.region === 'USA' ? ctx.state.compositeIndices.us500 : comp.region === 'EUR' ? ctx.state.compositeIndices.euStoxx : comp.region === 'UK' ? ctx.state.compositeIndices.uk100 : ctx.state.compositeIndices.jp225;
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
      
      // PROJ-10: Supply relationship shocks
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
          const exportShareOfRev = (regionExportsInCat * line.categoryMarketShare * line.revenueShare) / Math.max(baseRev, comp.annualRevenue);
          const nextS = s + Math.max(-0.02, Math.min(0.02, exportShareOfRev * (reg.gdpGrowth / 52))); if (isNaN(nextS)) throw new Error(`NaN in reduce! regionExportsInCat=${regionExportsInCat}, categoryMarketShare=${line.categoryMarketShare}, revenueShare=${line.revenueShare}, annualRevenue=${comp.annualRevenue}, gdpGrowth=${reg.gdpGrowth}`); return nextS;
        }, 0);
        const distressPenalty = comp.isDefaulted ? 0.50 : 1.0;
        const annualGrowthRate = laggedCategoryGrowth + noise + reg.inflation * pricingPowerBeta;
        
        const weeklyGrowthRate = Math.max(-0.05, Math.min(0.05, (annualGrowthRate / 52) + exportRevenueBoost));
        if (isNaN(weeklyGrowthRate)) throw new Error(`weeklyGrowthRate is NaN, laggedCategoryGrowth=${laggedCategoryGrowth}, noise=${noise}, reg.inflation=${reg.inflation}, pricingPowerBeta=${pricingPowerBeta}`);
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
    const bucketPeers = ctx.state.companies.filter(c => c.region === comp.region && getRatingBucket(c.creditRating) === bucket);
    const targetOasBps = computeExpectedLossSpreadBps(comp) + computeBucketDemandPremiumBps(bucket, reg, bucketPeers);
    const rawOas = comp.oasSpreadBps + (targetOasBps - comp.oasSpreadBps) * 0.35;
    comp.oasSpreadBps = isFinite(rawOas) ? Number(Math.max(10, Math.min(5000, rawOas)).toFixed(2)) : 150;

    // PART OF: Pre-refinancing trigger roughly one year before maturity
    let companyTranches = comp.debtTranches.map(t => ({ ...t }));

    // PART RB: Corporate debt lifecycle: prepayment/call when genuinely accretive
    companyTranches.forEach(tranche => {
      if (tranche.rateType !== 'FIXED') return;
      const currentFairRate = calculateNelsonSiegelZeroRate(Math.max(0.5, (tranche.maturityWeek - ctx.state.currentWeek) / 52), reg.yieldCurveParams) + comp.oasSpreadBps / 10000;
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
      const weeksToMaturity = tranche.maturityWeek - ctx.state.currentWeek;
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
            id: `${comp.id}-REFI-${ctx.state.currentWeek}`,
            principalUSD: tranche.principalUSD,
            rateType: 'FIXED',
            couponRate: currentFairCouponRate,
            originationWeek: ctx.state.currentWeek,
            maturityWeek: ctx.state.currentWeek + STANDARD_CORP_TENOR_YEARS * 52,
            seniority: 'SENIOR',
          }
        : {
            id: `${comp.id}-REFI-${ctx.state.currentWeek}`,
            principalUSD: tranche.principalUSD,
            rateType: 'FLOATING',
            floatingMarginBps: currentFloatingMarginBps,
            originationWeek: ctx.state.currentWeek,
            maturityWeek: ctx.state.currentWeek + STANDARD_CORP_TENOR_YEARS * 52,
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

    const totalRegionEquityCapUSD = ctx.state.companies.filter(c => c.region === comp.region).reduce((s, c) => s + c.marketCap, 0);
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
      if (cycle === 'Boom') pbMultiple = 1.1;
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
      if (cycle === 'Boom') pbMultiple = 1.15;
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

        ctx.updatedRegions = updatedRegions;
    ctx.nextWeek = nextWeek;
    ctx.getBlendedWageGrowth = getBlendedWageGrowth;
    ctx.prevActiveFirms = prevActiveFirms;
    ctx.updatedCommodities = updatedCommodities;
    ctx.regionCategoryExports = regionCategoryExports;
    ctx.companyUpdates = companyUpdates;
    ctx.STANDARD_CORP_TENOR_YEARS = STANDARD_CORP_TENOR_YEARS;
    ctx.getRatingBucket = getRatingBucket;
    ctx.computeExpectedLossSpreadBps = computeExpectedLossSpreadBps;
    ctx.computeBucketDemandPremiumBps = computeBucketDemandPremiumBps;
    ctx.currentWeekMod13 = currentWeekMod13;
    ctx.computeSupplyDemandPremium = computeSupplyDemandPremium;
    ctx.systemicStressFactorGlobal = systemicStressFactorGlobal;
    return ctx;
}
