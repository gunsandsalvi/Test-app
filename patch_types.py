import re

with open('src/types.ts', 'r') as f:
    content = f.read()

# Add durableGoodsStockUnits to HouseholdState
content = content.replace("netWorthUSD: number;", "netWorthUSD: number;\n  durableGoodsStockUnits?: number;")

# Add the new properties to UnitBid
old_unit_bid = """
export interface UnitBid {
  companyId?: string;
  isHouseholdAggregate?: boolean;
  quantityUnits: number;
  maxPriceUSD: number;
}
"""
new_unit_bid = """
export interface UnitBid {
  companyId?: string;
  isHouseholdAggregate?: boolean;
  isGovernmentAggregate?: boolean;
  quantityUnits: number;
  maxPriceUSD: number;
}
"""
content = content.replace(old_unit_bid.strip(), new_unit_bid.strip())

with open('src/types.ts', 'w') as f:
    f.write(content)
