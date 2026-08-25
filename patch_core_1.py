import re
import os

with open("src/engine/simulation/core.ts", "r") as f:
    content = f.read()

# Add formSupplyRelationships at the top
supply_rel_fn = """
export function formSupplyRelationships(regionId: RegionId, companies: Company[]): SupplyRelationship[] {
  const suppliers = companies.filter(c => c.region === regionId && (c.productLines||[]).some(l => l.category === 'CorporateIndustrial') && !c.isDefaulted);
  const customers = companies.filter(c => c.region === regionId && (c.productLines||[]).some(l => ['CorporateTech','StandardHousehold','LuxuryHousehold'].includes(l.category)) && !c.isDefaulted);
  const relationships: SupplyRelationship[] = [];
  customers.forEach(customer => {
    const sortedSuppliers = [...suppliers].sort((a, b) => (b.productLines.find(l=>l.category==='CorporateIndustrial')?.categoryMarketShare ?? 0) - (a.productLines.find(l=>l.category==='CorporateIndustrial')?.categoryMarketShare ?? 0));
    const primarySupplier = sortedSuppliers[0];
    if (primarySupplier) {
      relationships.push({
        supplierCompanyId: primarySupplier.id, customerCompanyId: customer.id,
        category: 'CorporateIndustrial', weeklyVolumeUSD: customer.annualRevenue * 0.08 / 52,
        relationshipStrength: 0.6 + Math.random() * 0.3,
      });
    }
  });
  return relationships;
}
"""

if "function formSupplyRelationships" not in content:
    content = content.replace("export function getBlendedWageGrowth", supply_rel_fn + "\nexport function getBlendedWageGrowth")
    
# In advanceWeeklyStep, near Stage 4 (line ~336)
stage_4_marker = "// Stage 4: Input-Output Map + Weekly Clearing Bidding"
stage_4_new = """// Supply Relationships (PROJ-10)
    if (state.currentWeek % 13 === 0 || !(reg as any).supplyRelationships || (reg as any).supplyRelationships.length === 0) {
      (reg as any).supplyRelationships = formSupplyRelationships(regionId, prevActiveFirms);
    }
    
    // Stage 4: Input-Output Map + Weekly Clearing Bidding"""
content = content.replace(stage_4_marker, stage_4_new)

# In Stage 4, add manufacturing private sector
weekly_prod_old = """const supplierFirms = prevActiveFirms.filter(c => c.region === regionId && (c.productLines || []).some(l => l.category === inputCat));
        const weeklyProduction = supplierFirms.reduce((s, c) => {
          const line = (c.productLines || []).find(l => l.category === inputCat);
          const warehouseCap = c.annualRevenue * 0.15;
          const throttle = (c.finishedGoodsInventoryUSD ?? 0) > warehouseCap ? 0.3 : 1.0;
          const priceSignal = (supplier.clearedInputPriceIndex ?? 1.0) - 1.0;
          const responsiveFactor = (1.0 + priceSignal * 1.5);
          return s + (c.annualRevenue * industrialProductionRate / 52) * (line?.revenueShare ?? 0) * throttle * responsiveFactor;
        }, 0) * weatherSupplyPenalty;"""
        
weekly_prod_new = """const supplierFirms = prevActiveFirms.filter(c => c.region === regionId && (c.productLines || []).some(l => l.category === inputCat));
        let weeklyProduction = supplierFirms.reduce((s, c) => {
          const line = (c.productLines || []).find(l => l.category === inputCat);
          const warehouseCap = c.annualRevenue * 0.15;
          const throttle = (c.finishedGoodsInventoryUSD ?? 0) > warehouseCap ? 0.3 : 1.0;
          const priceSignal = (supplier.clearedInputPriceIndex ?? 1.0) - 1.0;
          const responsiveFactor = (1.0 + priceSignal * 1.5);
          return s + (c.annualRevenue * industrialProductionRate / 52) * (line?.revenueShare ?? 0) * throttle * responsiveFactor;
        }, 0) * weatherSupplyPenalty;
        
        if (inputCat === 'CorporateIndustrial') {
           const manufacturingSegment = reg.privateSectorSegments?.find(s => s.segmentType === 'MANUFACTURING');
           if (manufacturingSegment) {
               weeklyProduction += (manufacturingSegment.annualRevenueUSD * 0.02 / 52) * weatherSupplyPenalty;
           }
        }"""
content = content.replace(weekly_prod_old, weekly_prod_new)

# In the company evolution loop, find where inputSupplyConstraintFactor is calculated
input_constraint_old = """newInputSupplyConstraintFactor = ((comp.inputSupplyConstraintFactor ?? 1.0) * 0.7 + relevantFulfillment * 0.3);"""
input_constraint_new = """newInputSupplyConstraintFactor = ((comp.inputSupplyConstraintFactor ?? 1.0) * 0.7 + relevantFulfillment * 0.3);
      
      // PROJ-10: Supply relationship shocks
      const region = updatedRegions[comp.region];
      const rels = (region as any).supplyRelationships?.filter((r: any) => r.customerCompanyId === comp.id) || [];
      rels.forEach((rel: any) => {
          const supplier = prevActiveFirms.find(c => c.id === rel.supplierCompanyId);
          if (supplier && (supplier.finishedGoodsInventoryUSD ?? 0) > supplier.annualRevenue * 0.15) {
              const distress = (supplier.finishedGoodsInventoryUSD! / (supplier.annualRevenue * 0.15)) - 1;
              newInputSupplyConstraintFactor *= (1 - Math.min(0.2, distress * rel.relationshipStrength * 0.1));
          }
      });
"""
content = content.replace(input_constraint_old, input_constraint_new)

# Update R&D (PROJ-18)
capex_old = """const estNewGrowthCapex = Math.max(0, (comp.growthCapex ?? (comp.capex * 0.4)) * 0.90 + estTargetGrowthCapex * 0.10);"""
capex_new = """const estNewGrowthCapex = Math.max(0, (comp.growthCapex ?? (comp.capex * 0.4)) * 0.90 + estTargetGrowthCapex * 0.10);
      let newRndExpense = comp.rndExpense ?? 0;
      let finalGrowthCapex = estNewGrowthCapex;
      if ((comp.productLines || []).some(l => l.category === 'CorporateTech')) {
          newRndExpense = estNewGrowthCapex * 0.4;
          finalGrowthCapex = estNewGrowthCapex * 0.6;
      }"""
content = content.replace(capex_old, capex_new)

# And in competitiveness updates, let's find `baselineComp = l.competitiveness` and adjust
comp_old = """const marginInvestmentSignal = (comp.ebitdaMargin > 0.15 && comp.cash > 0) ? 0.05 : -0.05;"""
comp_new = """const rndSignal = newRndExpense > 0 ? (newRndExpense / Math.max(1, comp.annualRevenue)) * 2 : 0;
          const marginInvestmentSignal = ((comp.ebitdaMargin > 0.15 && comp.cash > 0) ? 0.05 : -0.05) + rndSignal;"""
content = content.replace(comp_old, comp_new)

# Re-assign variables for comp returned
comp_return_old = """growthCapex: estNewGrowthCapex,
      maintenanceCapex: estNewMaintCapex,"""
comp_return_new = """growthCapex: finalGrowthCapex,
      rndExpense: newRndExpense,
      maintenanceCapex: estNewMaintCapex,"""
content = content.replace(comp_return_old, comp_return_new)


with open("src/engine/simulation/core.ts", "w") as f:
    f.write(content)

