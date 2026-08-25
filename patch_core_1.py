import re

with open('src/engine/simulation/core.ts', 'r') as f:
    content = f.read()

# 1. In executeSubUnitBiddingMarket, when calculating targetProductionUSD, save it to companyUpdates.
# There are two places: when evaluating suppliers for offers (line ~550), and when saving matching results (line ~708)
# Actually, targetProductionUSD is only "executed" when saving matching results.
# Wait, suppliers who don't sell anything still produce! 

old_save_match_block = """
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
"""
new_save_match_block = """
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
"""
content = content.replace(old_save_match_block, new_save_match_block)

# Also in step 1 of executeSubUnitBiddingMarket, where contract sales occur:
# Wait, contracts are fulfilled OUT OF INVENTORY, but production for the week is ALSO added in step 3.
# So `targetProductionUSD` is added in step 3. 
# But wait, does step 1 also need `targetProductionUSD`? No, it just takes from inventory (or assumes inventory is big enough).

# 2. Fix the company evolution logic for ALL generalized markets
old_evolution_logic = """
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

          targetProductionUSD = (newRevenue * 0.02 / 52) * industrialLine.revenueShare * productionResponseFactor * productionThrottle;
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

          targetProductionUSD = (newRevenue * 0.02 / 52) * industrialLine.revenueShare * productionResponseFactor * productionThrottle;
          productionCostUSD = targetProductionUSD * (1 - newEbitdaMargin);

          const soldThisWeekUSD = targetProductionUSD * categoryFulfillmentRatio;
          unsoldThisWeekUSD = targetProductionUSD - soldThisWeekUSD;

          newFinishedGoodsInventoryUSD = Math.max(0, (comp.finishedGoodsInventoryUSD ?? 0) + unsoldThisWeekUSD - carryingCostUSD);
        }
      }

      const revenueAdjustmentForUnsold = -unsoldThisWeekUSD * 0.5;
      newRevenue = Math.max(10, newRevenue + revenueAdjustmentForUnsold);
"""

new_evolution_logic = """
      let unsoldThisWeekUSD = 0;
      const update = companyUpdates[comp.ticker];
      
      const isGeneralizedMarket = (comp.productLines || []).some(l => ['industrial_automation','refined_products','food_beverage','pharmaceuticals','passenger_vehicles','semiconductors','defense_systems'].includes(l.subUnitId));
      
      if (isGeneralizedMarket) {
          const salesUSD = update?.salesUSD ?? 0;
          targetProductionUSD = update?._targetProductionUSD ?? 0;
          productionCostUSD = targetProductionUSD * (1 - newEbitdaMargin);
          unsoldThisWeekUSD = Math.max(0, targetProductionUSD - salesUSD);
          newFinishedGoodsInventoryUSD = update?.finishedGoodsInventoryUSD ?? (Math.max(0, (comp.finishedGoodsInventoryUSD ?? 0) - carryingCostUSD));
          newRecentFulfillmentEMA = (comp.recentFulfillmentEMA ?? 1.0) * 0.85 + (salesUSD > 0 ? 1.0 : 0.0) * 0.15;
          
          const revenueAdjustmentForUnsold = -unsoldThisWeekUSD * 0.5;
          newRevenue = Math.max(10, newRevenue + revenueAdjustmentForUnsold);
      } else {
          const industrialLine = (comp.productLines || []).find(l => l.subUnitId === 'heavy_equipment' || l.subUnitId === 'industrial_chemicals');
          if (industrialLine && industrialLine.revenueShare > 0) {
              const warehouseCapacityUSD = comp.annualRevenue * 0.15;
              const productionThrottle = (comp.finishedGoodsInventoryUSD ?? 0) > warehouseCapacityUSD ? 0.3 : 1.0;
              const categoryFulfillmentRatio = (reg.categoryDemand[industrialLine.subUnitId] as any)?._fulfillmentRatio ?? 1;
              newRecentFulfillmentEMA = (comp.recentFulfillmentEMA ?? 1.0) * 0.85 + categoryFulfillmentRatio * 0.15;

              const supplierClearedPrice = (reg.categoryDemand[industrialLine.subUnitId] as any)?.clearedInputPriceIndex ?? 1.0;
              const priceSignal = supplierClearedPrice - 1.0;
              const productionResponseFactor = (1.0 + priceSignal * 1.5);

              targetProductionUSD = (newRevenue * 0.02 / 52) * industrialLine.revenueShare * productionResponseFactor * productionThrottle;
              productionCostUSD = targetProductionUSD * (1 - newEbitdaMargin);

              const soldThisWeekUSD = targetProductionUSD * categoryFulfillmentRatio;
              unsoldThisWeekUSD = targetProductionUSD - soldThisWeekUSD;

              newFinishedGoodsInventoryUSD = Math.max(0, (comp.finishedGoodsInventoryUSD ?? 0) + unsoldThisWeekUSD - carryingCostUSD);
          }
          const revenueAdjustmentForUnsold = -unsoldThisWeekUSD * 0.5;
          newRevenue = Math.max(10, newRevenue + revenueAdjustmentForUnsold);
      }
"""
content = content.replace(old_evolution_logic, new_evolution_logic)

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(content)

