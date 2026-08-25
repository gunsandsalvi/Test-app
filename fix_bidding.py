import re
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

c = c.replace(
    "executeSubUnitBiddingMarket('passenger_vehicles', 35000.0, reg, regionId);",
    "executeSubUnitBiddingMarket('passenger_vehicles', 35000.0, reg, regionId);\n    executeSubUnitBiddingMarket('semiconductors', 10.00, reg, regionId);\n    executeSubUnitBiddingMarket('defense_systems', 2000000.0, reg, regionId);"
)

gov_bid_code = """
      // Household Aggregate Bid
"""
gov_bid_new = """
      // Government Aggregate Bid (Defense Systems)
      if (subUnitId === 'defense_systems') {
        const govShare = 0.90;
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
"""
c = c.replace(gov_bid_code, gov_bid_new)

# Add defense_systems to customers filter
cust_code = """
      } else if (subUnitId === 'passenger_vehicles') {
        customers = regionActiveFirms.filter(c => (c.sector === 'Industrials' || c.sector === 'Consumer' || c.sector === 'Tech') && !(c.productLines || []).some(l => l.subUnitId === subUnitId));
      }
"""
cust_new = """
      } else if (subUnitId === 'passenger_vehicles') {
        customers = regionActiveFirms.filter(c => (c.sector === 'Industrials' || c.sector === 'Consumer' || c.sector === 'Tech') && !(c.productLines || []).some(l => l.subUnitId === subUnitId));
      } else if (subUnitId === 'semiconductors') {
        customers = regionActiveFirms.filter(c => (c.sector === 'Tech' || c.sector === 'Industrials') && !(c.productLines || []).some(l => l.subUnitId === subUnitId));
      } else if (subUnitId === 'defense_systems') {
        customers = regionActiveFirms.filter(c => (c.sector === 'Industrials' || c.sector === 'Tech') && !(c.productLines || []).some(l => l.subUnitId === subUnitId));
      }
"""
c = c.replace(cust_code, cust_new)

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(c)

