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
  // 1$ is 1$: an input category (e.g. specialty_metals) is genuinely shared by MULTIPLE demander
  // industries at once (TechHardwareSemis, AutomotiveTransport, AerospaceDefense, and
  // IndustrialsMachinery all draw on the same regional specialty_metals pool). The old structure
  // looped per DEMANDER industry and, for each one, independently recomputed and OVERWROTE the
  // shared supplier's inventoryLevelUSD/upstreamScarcityIndex as if that industry were the only
  // consumer that week — so the persisted state simply reflected whichever industry's pass ran
  // last, silently discarding every other industry's simultaneous draw on the exact same stock.
  // Confirmed by direct instrumentation: specialty_metals inventory drained monotonically to
  // near-zero over ~45 weeks (each industry pass under-counted true aggregate demand against it),
  // and every industry needing it collapsed in lockstep the moment it hit zero — the real
  // identity of the long-tracked task #18/#49 "residual" mass-cohort collapse. Fixed by pooling
  // every demander industry's bid against the ONE real supply figure for a shared input category
  // before clearing, the way a real, undifferentiated commodity stock actually works.
  const demandersByInputCat: Record<string, { demanderIndustry: string; intensity: number }[]> = {};
  Object.entries(CATEGORY_INPUT_REQUIREMENTS).forEach(([demanderIndustry, requirements]) => {
    if (!requirements) return;
    Object.entries(requirements).forEach(([inputCat, intensity]) => {
      if (!demandersByInputCat[inputCat]) demandersByInputCat[inputCat] = [];
      demandersByInputCat[inputCat].push({ demanderIndustry, intensity: intensity ?? 0 });
    });
  });

  Object.keys(ctx.updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = ctx.updatedRegions[regionId];

    // A demander industry that needs MULTIPLE input categories (e.g. TechHardwareSemis needs
    // both upstream_extraction and specialty_metals) used to have its own subUnits'
    // inputCostPressure/_fulfillmentRatio silently overwritten by whichever input category
    // happened to be processed last — the same single-shared-field collision, just on the
    // demander side. Accumulated here instead: fulfillment takes the WORST (min) input as the
    // real bottleneck (can't ship a product missing either of two required inputs), cost
    // pressure SUMS across inputs (each scarce input adds its own real cost pressure).
    const perDemanderIndustry: Record<string, { minFulfillment: number; sumCostPressure: number }> = {};

    Object.entries(demandersByInputCat).forEach(([inputCat, demanders]) => {
      const supplier = reg.categoryDemand[inputCat as any] as any;
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

      // Pool every demander industry's bid against the SAME shared supply, instead of each one
      // independently pretending it's the only consumer of this input category.
      const demanderBidQuantities = demanders.map(d => {
        const subUnitsForDemander = INDUSTRY_SUBUNITS[d.demanderIndustry as Industry] || [];
        const demanderDemandLevel = subUnitsForDemander.reduce((s, su) => s + (reg.categoryDemand[su.unitId]?.demandLevelUSD ?? 0), 0);
        return { demanderIndustry: d.demanderIndustry, bidQuantity: demanderDemandLevel * d.intensity / 52 };
      });
      const totalBidQuantity = demanderBidQuantities.reduce((s, d) => s + d.bidQuantity, 0);

      const clearingRatio = totalAvailableSupply > 0 ? totalBidQuantity / totalAvailableSupply : 1;
      const targetPriceIndex = Math.max(0, 1.0 + (clearingRatio - 1.0) * 0.4); // 0 floor only — a price index cannot go negative
      const newPriceIndex = (supplier.upstreamScarcityIndex ?? 1.0) * 0.85 + targetPriceIndex * 0.15;

      const quantityFulfilled = Math.min(totalBidQuantity, totalAvailableSupply);
      // Every demander industry shares the SAME fulfillment ratio — the resource itself is
      // undifferentiated (this region's specialty_metals doesn't know which industry a unit
      // ends up in), so a real shortage rations proportionally across every industry drawing on
      // it, not by whichever industry happened to be processed first or last.
      const overallFulfillmentRatio = totalBidQuantity > 0 ? quantityFulfilled / totalBidQuantity : 1;

      supplier.upstreamScarcityIndex = Number(newPriceIndex.toFixed(4));
      supplier.inventoryLevelUSD = Math.max(0, totalAvailableSupply - quantityFulfilled);
      supplier._fulfillmentRatio = totalAvailableSupply > 0 ? quantityFulfilled / totalAvailableSupply : 1;

      demanderBidQuantities.forEach(({ demanderIndustry }) => {
        const existing = perDemanderIndustry[demanderIndustry] ?? { minFulfillment: 1, sumCostPressure: 0 };
        perDemanderIndustry[demanderIndustry] = {
          minFulfillment: Math.min(existing.minFulfillment, overallFulfillmentRatio),
          sumCostPressure: existing.sumCostPressure + Math.max(0, newPriceIndex - 1.0),
        };
      });
    });

    Object.entries(perDemanderIndustry).forEach(([demanderIndustry, result]) => {
      const subUnitsForDemander = INDUSTRY_SUBUNITS[demanderIndustry as Industry] || [];
      subUnitsForDemander.forEach(su => {
        const demanderEntry = reg.categoryDemand[su.unitId as any] as any;
        if (demanderEntry) {
          demanderEntry.inputCostPressure = Number(result.sumCostPressure.toFixed(4));
          demanderEntry._fulfillmentRatio = Number(result.minFulfillment.toFixed(4));
        }
      });
    });

    // after the loop, snapshot this week's inventory as next week's lag anchor:
    Object.keys(reg.categoryDemand).forEach(cat => {
      const entry = reg.categoryDemand[cat as any] as any;
      entry.lastWeekInventoryLevelUSD = entry.inventoryLevelUSD ?? 0;
    });
  });
}
