import re

with open('src/engine/simulation/core.ts', 'r') as f:
    text = f.read()

# 2a. Delete duplicate government bid block
pattern = r"// Government Aggregate Bid \(PART AYA: pharmaceuticals 45%, passenger_vehicles 5%\).*?bids\.push\(\{ isGovernmentAggregate: true[^}]+\}\);\n\s*\}"
text = re.sub(pattern, "", text, flags=re.DOTALL)

# 2b. Generalize the corporate-customer side
# First we need to update src/domain/industry.ts to add CORPORATE_DEMAND_INTENSITY
with open('src/domain/industry.ts', 'r') as f2:
    ind_text = f2.read()

if 'CORPORATE_DEMAND_INTENSITY' not in ind_text:
    new_ind = """
export const CORPORATE_DEMAND_INTENSITY: Record<string, number> = {
  industrial_automation: 0.10, // derived from (realCapexUSD/52)*0.35 equivalent
  refined_products: 0.025,
  food_beverage: 0.01,
  pharmaceuticals: 0.008,
  passenger_vehicles: 0.015,
  semiconductors: 0.02,
  defense_systems: 0.03, // estimate
};
"""
    # populate default for remaining 20
    # The prompt says: "use 0.01 * buyerMix.CORPORATE / 0.5 as the default formula"
    ind_text += new_ind
    with open('src/domain/industry.ts', 'w') as f2:
        f2.write(ind_text)

# We will let a Node script handle the actual modification of core.ts to be safe, because of the complex if/else chain.
