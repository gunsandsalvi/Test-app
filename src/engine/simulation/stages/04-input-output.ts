
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


export function runStage_04_input_output(ctx: PipelineContext): PipelineContext {
    let prevActiveFirms = ctx.prevActiveFirms;

  Object.keys(ctx.updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = ctx.updatedRegions[regionId];
    const hs = reg.householdState;
    // We will extract variables from ctx
        // (We will let typescript complain and manually fix it, or just use any)
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

    // --- PROJ-19: Generalized Real Unit-Based Clearing, Bidding & Contract Market System ---
  });
        ctx.prevActiveFirms = prevActiveFirms;
    return ctx;
}
