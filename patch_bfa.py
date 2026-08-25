import re

with open('src/engine/simulation/core.ts', 'r') as f:
    content = f.read()

# 1. Update Household Aggregate Bid
old_hh_bid = """
      // Household Aggregate Bid
      if (subUnitId === 'food_beverage' || subUnitId === 'refined_products' || subUnitId === 'pharmaceuticals' || subUnitId === 'passenger_vehicles') {
        const hhShare = subUnitId === 'food_beverage' ? 0.95 : subUnitId === 'passenger_vehicles' ? 0.80 : subUnitId === 'refined_products' ? 0.60 : 0.40;
        const hhWeeklyDemandUSD = (demandState.demandLevelUSD * hhShare) / 52;
        const hhDemandUnits = hhWeeklyDemandUSD / currentUnitPrice;

        if (hhDemandUnits > 0.001) {
"""

new_hh_bid = """
      // Household Aggregate Bid
      if (subUnitId === 'food_beverage' || subUnitId === 'refined_products' || subUnitId === 'pharmaceuticals' || subUnitId === 'passenger_vehicles') {
        const hhShare = subUnitId === 'food_beverage' ? 0.95 : subUnitId === 'passenger_vehicles' ? 0.80 : subUnitId === 'refined_products' ? 0.60 : 0.40;
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
"""
content = content.replace(old_hh_bid.strip(), new_hh_bid.strip())

# 2. Add fulfilled household demand to stock
old_match = """
          if (bid.companyId) {
            if (!openPurchases[bid.companyId]) openPurchases[bid.companyId] = { units: 0, amount: 0 };
            openPurchases[bid.companyId].units += transactQty;
            openPurchases[bid.companyId].amount += transactQty * matchPrice;
          }
"""

new_match = """
          if (bid.companyId) {
            if (!openPurchases[bid.companyId]) openPurchases[bid.companyId] = { units: 0, amount: 0 };
            openPurchases[bid.companyId].units += transactQty;
            openPurchases[bid.companyId].amount += transactQty * matchPrice;
          }
          if (bid.isHouseholdAggregate && subUnitId === 'passenger_vehicles') {
            targetReg.householdState.durableGoodsStockUnits = (targetReg.householdState.durableGoodsStockUnits ?? 0) + transactQty;
          }
"""
content = content.replace(old_match.strip(), new_match.strip())

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(content)

