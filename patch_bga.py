import re

with open('src/types.ts', 'r') as f:
    content = f.read()

if "revenueHistory?:" not in content:
    content = content.replace("historicalPrices: number[];", "historicalPrices: number[];\n  revenueHistory?: number[];")

with open('src/types.ts', 'w') as f:
    f.write(content)

with open('src/engine/simulation/core.ts', 'r') as f:
    core_content = f.read()

# Add to core.ts company evolution
old_rev = "newRevenue = Math.max(10, newRevenue + revenueAdjustmentForUnsold);"
new_rev = """newRevenue = Math.max(10, newRevenue + revenueAdjustmentForUnsold);
      comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];"""
core_content = core_content.replace(old_rev, new_rev)

# Add hedging decision in executeSubUnitBiddingMarket
old_contract = """
              const customerBargainingPower = (relativeSize > 1.0 ? 0.6 : 0.4) * (1.0 - supplierPowerFactor);
              const contractPrice = clearedPriceUSD * (1.0 - (customerBargainingPower - 0.3) * 0.05);
              const duration = 12 + Math.floor(Math.random() * 40);
"""

new_contract = """
              const customerBargainingPower = (relativeSize > 1.0 ? 0.6 : 0.4) * (1.0 - supplierPowerFactor);
              let contractPrice = clearedPriceUSD * (1.0 - (customerBargainingPower - 0.3) * 0.05);
              let duration = 12 + Math.floor(Math.random() * 40);
              
              // PART BGA: Hedging for revenue volatility
              const revHist = customerComp.revenueHistory || [];
              let revVol = 0;
              if (revHist.length > 3) {
                 const meanRev = revHist.reduce((s, v) => s + v, 0) / revHist.length;
                 const varRev = revHist.reduce((s, v) => s + Math.pow(v - meanRev, 2), 0) / revHist.length;
                 revVol = Math.sqrt(varRev) / meanRev;
              }
              if (revVol > 0.05) {
                 duration = 52 + Math.floor(Math.random() * 52); // Seek longer contracts
                 const impliedPd = Math.max(0, Math.min(1, 1 / (1 + Math.exp(customerComp.interestCoverage * 0.8 - customerComp.leverage * 0.4))));
                 const costOfCapital = 0.05 + (impliedPd * 0.60);
                 const hedgingPremium = costOfCapital * 0.20; // Modest price premium
                 contractPrice *= (1.0 + hedgingPremium);
              }
"""
core_content = core_content.replace(old_contract, new_contract)

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(core_content)

