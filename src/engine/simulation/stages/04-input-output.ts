/**
 * Stage 4: Inter-Industry Input-Output
 *
 * Clears each region's input-category supply against downstream demander requirements
 * (CATEGORY_INPUT_REQUIREMENTS), updating the supplying sub-unit's cleared input price
 * index and each demander's input-cost pressure / fulfillment ratio.
 *
 * CHAIN-D: both sides of this are now SUB-UNITS. The demander used to be an industry, which
 * meant one recipe per sector and one shortage shared by every product in it.
 */

import { GameState, RegionId, COMMODITY_CATEGORY_LINKAGE } from '../../../types';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../domain/market-microstructure';
import { WeeklyStepContext } from './context';

export function runInputOutputStage(state: GameState, ctx: WeeklyStepContext): void {
  // 1$ is 1$: an input category (e.g. specialty_metals) is genuinely shared by MULTIPLE demander
  // industries at once (TechHardwareSemis, AutomotiveTransport, AerospaceDefense, and
  // IndustrialsMachinery all draw on the same regional specialty_metals pool). The old structure
  // looped per DEMANDER industry and, for each one, independently recomputed and OVERWROTE the
  // shared supplier's inventoryLevelLocal/upstreamScarcityIndex as if that industry were the only
  // consumer that week — so the persisted state simply reflected whichever industry's pass ran
  // last, silently discarding every other industry's simultaneous draw on the exact same stock.
  // Confirmed by direct instrumentation: specialty_metals inventory drained monotonically to
  // near-zero over ~45 weeks (each industry pass under-counted true aggregate demand against it),
  // and every industry needing it collapsed in lockstep the moment it hit zero — the real
  // identity of the long-tracked task #18/#49 "residual" mass-cohort collapse. Fixed by pooling
  // every demander industry's bid against the ONE real supply figure for a shared input category
  // before clearing, the way a real, undifferentiated commodity stock actually works.
  //
  // CHAIN-D: the demander is a PRODUCT, not an industry. It used to be an industry, which cost
  // two approximations at once — a recipe had to describe every product of a sector at the same
  // time (so it could only name what they had in common, which is overhead), and the result had
  // to be fanned back onto every sub-unit of that industry whether or not it needed the input.
  // Semiconductors and consumer devices are one industry and draw on completely different
  // things; each now bids for its own inputs and wears its own shortage.
  const demandersByInputCat: Record<string, { demanderSubUnit: string; intensity: number }[]> = {};
  Object.entries(CATEGORY_INPUT_REQUIREMENTS).forEach(([demanderSubUnit, requirements]) => {
    if (!requirements) return;
    Object.entries(requirements).forEach(([inputCat, intensity]) => {
      if (!demandersByInputCat[inputCat]) demandersByInputCat[inputCat] = [];
      demandersByInputCat[inputCat].push({ demanderSubUnit, intensity: intensity ?? 0 });
    });
  });

  // 1$ is 1$: an input category's real weekly supply now comes from the actual modeled
  // commodities linked to it (see COMMODITY_CATEGORY_LINKAGE and companyGenerator.ts, which
  // gives every producedCommodityId-tagged company the matching real productLines entry) rather
  // than an independently invented formula. Previously stage04 derived "weeklyProduction" from a
  // generic industrialProductionRate/throttle/price-response formula applied to whichever
  // companies happened to carry this subUnitId as a product line — completely disconnected from
  // the real commodity's own price/supply-demand clearing the trading desk already computes
  // every week (evolution.ts's computeCommodityClearingRatio). Worse, for specialty_metals this
  // company set was EMPTY (no company anywhere had it as an output line before the company-
  // generation fix), so its real weekly production was always zero regardless of any formula —
  // the true root cause of that category's guaranteed depletion to zero. Grouping commodities by
  // linked subUnitId here makes every category's real supply the sum of its real commodities'
  // own weeklySupplyUnits (last week's cleared figure — commodities evolve later this same week,
  // in stage07, so this is a one-week lag, the same convention used elsewhere in this pipeline).
  const commoditiesByInputCat: Record<string, { spotPrice: number; weeklySupplyUnits?: number }[]> = {};
  state.commodities.forEach(comm => {
    const linkage = COMMODITY_CATEGORY_LINKAGE[comm.id] || COMMODITY_CATEGORY_LINKAGE[comm.symbol];
    if (!linkage) return;
    if (!commoditiesByInputCat[linkage.subUnitId]) commoditiesByInputCat[linkage.subUnitId] = [];
    commoditiesByInputCat[linkage.subUnitId].push({ spotPrice: comm.spotPrice, weeklySupplyUnits: comm.weeklySupplyUnits });
  });
  const globalWeeklyProductionByInputCat: Record<string, number> = {};
  Object.entries(commoditiesByInputCat).forEach(([inputCat, commodities]) => {
    globalWeeklyProductionByInputCat[inputCat] = commodities.reduce((s, c) => s + (c.weeklySupplyUnits ?? 0) * c.spotPrice, 0);
  });

  const regionIds = Object.keys(ctx.updatedRegions) as RegionId[];

  // A real commodity (gold, copper, crude oil...) trades in ONE global market, not four separate
  // regional ones — computeCommodityClearingRatio already sums real producers across every
  // region into a single weeklySupplyUnits. Crediting that SAME global figure in full to every
  // region independently would quadruple-count the same physical supply. Instead, each region's
  // real demand share of the GLOBAL total determines its real share of that global supply — the
  // same "ration proportionally to who actually wants it" principle already used for pro-rata
  // auction allocation elsewhere in this pipeline, not an arbitrary per-region split.
  const bidQuantitiesByRegionAndInputCat: Record<RegionId, Record<string, { demanderSubUnit: string; bidQuantity: number }[]>> = {} as Record<RegionId, Record<string, { demanderSubUnit: string; bidQuantity: number }[]>>;
  regionIds.forEach(regionId => {
    const reg = ctx.updatedRegions[regionId];
    bidQuantitiesByRegionAndInputCat[regionId] = {};
    Object.entries(demandersByInputCat).forEach(([inputCat, demanders]) => {
      bidQuantitiesByRegionAndInputCat[regionId][inputCat] = demanders.map(d => {
        const demanderDemandLevel = reg.categoryDemand[d.demanderSubUnit]?.demandLevelAnnualLocal ?? 0;
        return { demanderSubUnit: d.demanderSubUnit, bidQuantity: demanderDemandLevel * d.intensity / 52 };
      });
    });
  });
  const globalBidQuantityByInputCat: Record<string, number> = {};
  Object.keys(demandersByInputCat).forEach(inputCat => {
    globalBidQuantityByInputCat[inputCat] = regionIds.reduce(
      (s, r) => s + bidQuantitiesByRegionAndInputCat[r][inputCat].reduce((s2, d) => s2 + d.bidQuantity, 0),
      0
    );
  });

  regionIds.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];

    // A demander that needs MULTIPLE input categories (passenger vehicles need both specialty
    // metals and semiconductors) used to have its inputCostPressure/_fulfillmentRatio silently
    // overwritten by whichever input category happened to be processed last — the same
    // single-shared-field collision, just on the demander side. Accumulated here instead:
    // fulfillment takes the WORST (min) input as the real bottleneck (can't ship a product
    // missing either of two required inputs), cost pressure SUMS across inputs (each scarce
    // input adds its own real cost pressure).
    const perDemanderSubUnit: Record<string, { minFulfillment: number; sumCostPressure: number }> = {};

    Object.entries(demandersByInputCat).forEach(([inputCat, demanders]) => {
      const supplier = reg.categoryDemand[inputCat];
      if (!supplier) return;

      const lastWeekInventory = supplier.lastWeekInventoryLevelLocal ?? supplier.inventoryLevelLocal ?? 0;
      const currentGlutSeverity = Math.max(0, 1.0 - (supplier.upstreamScarcityIndex ?? 1.0)); // how far below fair value the price currently sits
      const inventoryHoldingDecayRate = (0.015 + currentGlutSeverity * 0.35) / 52; // decay accelerates sharply the more oversupplied the market genuinely is — real obsolescence pressure, not a flat constant
      const decayedInventory = lastWeekInventory * (1 - inventoryHoldingDecayRate);

      const demanderBidQuantities = bidQuantitiesByRegionAndInputCat[regionId][inputCat];
      const totalBidQuantity = demanderBidQuantities.reduce((s, d) => s + d.bidQuantity, 0);
      const globalBidQuantity = globalBidQuantityByInputCat[inputCat] ?? 0;
      const regionShareOfGlobalDemand = globalBidQuantity > 0.001 ? totalBidQuantity / globalBidQuantity : 1 / regionIds.length;
      const weeklyProduction = (globalWeeklyProductionByInputCat[inputCat] ?? 0) * regionShareOfGlobalDemand;
      const totalAvailableSupply = decayedInventory + weeklyProduction;

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
      supplier.inventoryLevelLocal = Math.max(0, totalAvailableSupply - quantityFulfilled);
      supplier._fulfillmentRatio = totalAvailableSupply > 0 ? quantityFulfilled / totalAvailableSupply : 1;

      demanderBidQuantities.forEach(({ demanderSubUnit }) => {
        const existing = perDemanderSubUnit[demanderSubUnit] ?? { minFulfillment: 1, sumCostPressure: 0 };
        perDemanderSubUnit[demanderSubUnit] = {
          minFulfillment: Math.min(existing.minFulfillment, overallFulfillmentRatio),
          sumCostPressure: existing.sumCostPressure + Math.max(0, newPriceIndex - 1.0),
        };
      });
    });

    Object.entries(perDemanderSubUnit).forEach(([demanderSubUnit, result]) => {
      const demanderEntry = reg.categoryDemand[demanderSubUnit];
      if (demanderEntry) {
        demanderEntry.inputCostPressure = Number(result.sumCostPressure.toFixed(4));
        demanderEntry._fulfillmentRatio = Number(result.minFulfillment.toFixed(4));
      }
    });

    // after the loop, snapshot this week's inventory as next week's lag anchor:
    Object.keys(reg.categoryDemand).forEach(cat => {
      const entry = reg.categoryDemand[cat];
      entry.lastWeekInventoryLevelLocal = entry.inventoryLevelLocal ?? 0;
    });
  });
}
