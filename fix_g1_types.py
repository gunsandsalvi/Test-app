import sys
import re

with open('src/types.ts', 'r') as f:
    text = f.read()

# Add new types at the top
new_types = """
export type NecessityTier = 'Staple' | 'Standard' | 'Luxury';
export type ProductCategory =
  | 'StapleHousehold' | 'StandardHousehold' | 'LuxuryHousehold'
  | 'CorporateIndustrial' | 'CorporateTech'
  | 'GovernmentDefense' | 'GovernmentInfrastructure' | 'GovernmentHealthcare';

export interface ProductLine {
  category: ProductCategory;
  revenueShare: number;
  categoryMarketShare: number;
  competitiveness: number;
}

export interface CategoryDemandState {
  demandLevelUSD: number;
  demandGrowthAnnual: number;
}
"""
text = text.replace("export type RegionId = 'USA' | 'UK' | 'JPN' | 'EUR';", "export type RegionId = 'USA' | 'UK' | 'JPN' | 'EUR';" + new_types)

# Add to Company
text = text.replace(
    "  annualRevenue: number; // in millions\n  employeeCount: number;",
    "  annualRevenue: number; // in millions\n  productLines?: ProductLine[];\n  employeeCount: number;"
)

# Add to Region
text = text.replace(
    "export interface Region {\n  id: RegionId;\n  name: string;",
    "export interface Region {\n  id: RegionId;\n  name: string;\n  categoryDemand: Record<string, CategoryDemandState>;"
)

# Add to HouseholdState
text = text.replace(
    "  householdDebtToIncomeRatio: number;\n}",
    "  householdDebtToIncomeRatio: number;\n  stapleSpendShare: number;\n  standardSpendShare: number;\n  luxurySpendShare: number;\n}"
)

with open('src/types.ts', 'w') as f:
    f.write(text)

print("Updated types.ts for G1")
