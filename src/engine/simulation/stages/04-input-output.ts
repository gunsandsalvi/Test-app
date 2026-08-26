/**
 * Stage 4: Inter-Industry Input-Output
 *
 * Clears each region's input-category supply against downstream demander requirements
 * (CATEGORY_INPUT_REQUIREMENTS), updating the supplying sub-unit's cleared input price
 * index and each demander's input-cost pressure / fulfillment ratio.
 */

import { GameState, RegionId, Industry } from '../../../types';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../domain/market-microstructure';
import { getOutputInventoryUSD } from '../../../domain/company';
import { WeeklyStepContext } from './context';

export function runInputOutputStage(state: GameState, ctx: WeeklyStepContext): void {
  Object.keys(ctx.updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = ctx.updatedRegions[regionId];

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
        const currentGlutSeverity = Math.max(0, 1.0 - (supplier.upstreamScarcityIndex ?? 1.0)); // how far below fair value the price currently sits
        const inventoryHoldingDecayRate = (0.015 + currentGlutSeverity * 0.35) / 52; // decay accelerates sharply the more oversupplied the market genuinely is — real obsolescence pressure, not a flat constant
        const decayedInventory = lastWeekInventory * (1 - inventoryHoldingDecayRate);
        const weatherDecay = Math.pow(0.55, Math.max(0, (reg.weather?.weeksActive ?? 1) - 1));
        const weatherSupplyPenalty = (reg.weather && reg.weather.severity !== 'Normal' && inputCat === 'heavy_equipment')
          ? Math.max(0.80, 1.0 - Math.abs(reg.weather.gdpImpactPct ?? 0.002) * 5 * weatherDecay)
          : 1.0;
        const supplierFirms = ctx.prevActiveFirms.filter(c => c.region === regionId && (c.productLines || []).some(l => l.subUnitId === inputCat));
        let weeklyProduction = supplierFirms.reduce((s, c) => {
          const line = (c.productLines || []).find(l => l.subUnitId === inputCat);
          const warehouseCap = c.annualRevenue * 0.15;
          // Smooth, not a hard on/off switch — see the same fix (and its rationale) in
          // 05-unit-bidding.ts's supplier-offer construction. Also scoped to this specific
          // sub-unit's own inventory, not the company's whole (multi-line) inventory.
          const invToCapRatio = getOutputInventoryUSD(c, inputCat) / Math.max(1, warehouseCap);
          const throttle = Math.max(0.3, Math.min(1.0, 1.0 - (invToCapRatio - 1.0) * 0.7));
          const priceSignal = (supplier.upstreamScarcityIndex ?? 1.0) - 1.0;
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
        const newPriceIndex = (supplier.upstreamScarcityIndex ?? 1.0) * 0.85 + targetPriceIndex * 0.15;

        const quantityFulfilled = Math.min(bidQuantity, totalAvailableSupply);
        const fulfillmentRatio = bidQuantity > 0 ? quantityFulfilled / bidQuantity : 1;

        supplier.upstreamScarcityIndex = Number(newPriceIndex.toFixed(4));
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
  });
}
