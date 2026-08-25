import re
import os

with open("src/types.ts", "r") as f:
    content = f.read()

# Add physical units to Commodity
content = content.replace("dailyConsumptionUnits: number;", "weeklySupplyUnits?: number;\n  weeklyDemandUnits?: number;")

# Add COMMODITY_QUANTITY_UNIT and COMMODITY_CATEGORY_LINKAGE
add_units = """
export type CommodityQuantityUnit = 'BARREL' | 'MMBTU' | 'TROY_OZ' | 'TONNE';
export const COMMODITY_QUANTITY_UNIT: Record<string, CommodityQuantityUnit> = {
  WTI: 'BARREL', BRENT: 'BARREL', NATGAS: 'MMBTU',
  GOLD: 'TROY_OZ', SILVER: 'TROY_OZ',
  COPPER: 'TONNE', WHEAT: 'TONNE', CORN: 'TONNE', SOYBEANS: 'TONNE',
};
export const COMMODITY_CATEGORY_LINKAGE: Record<string, { category: string; intensityShare: number }> = {
  WTI: { category: 'CorporateIndustrial', intensityShare: 0.35 },
  BRENT: { category: 'CorporateIndustrial', intensityShare: 0.30 },
  NATGAS: { category: 'CorporateIndustrial', intensityShare: 0.20 },
  GOLD: { category: 'CorporateTech', intensityShare: 0.05 },
  SILVER: { category: 'CorporateTech', intensityShare: 0.08 },
  COPPER: { category: 'CorporateIndustrial', intensityShare: 0.15 },
  WHEAT: { category: 'StapleHousehold', intensityShare: 0.04 },
  CORN: { category: 'StapleHousehold', intensityShare: 0.04 },
  SOYBEANS: { category: 'StapleHousehold', intensityShare: 0.03 },
};

"""
content = content.replace("export interface Commodity {", add_units + "export interface Commodity {")

# Add SupplyRelationship
add_supply = """
export interface SupplyRelationship {
  supplierCompanyId: string;
  customerCompanyId: string;
  category: string;
  weeklyVolumeUSD: number;
  relationshipStrength: number;
}
"""
content = content.replace("export interface Region {", add_supply + "\nexport interface Region {")
content = content.replace("privateSectorSegments: PrivateSectorSegment[];", "privateSectorSegments: PrivateSectorSegment[];\n  supplyRelationships?: SupplyRelationship[];")

# Add rndExpense to Company
content = content.replace("growthCapex: number;", "growthCapex: number;\n  rndExpense?: number;")

# Add private sector fields
content = content.replace("segmentType: PrivateSegmentType;", "segmentType: PrivateSegmentType;\n  debtUSD: number;\n  defaultRateAnnualPct: number;\n  capexUSD: number;")

with open("src/types.ts", "w") as f:
    f.write(content)

