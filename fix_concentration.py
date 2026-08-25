import re
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

concentration_logic = """
  // Concentration Risk Flagging
  state.companies.forEach(comp => {
    comp.concentrationRiskFlags = [];
    const compContracts = state.marketState.activeContracts.filter(c => c.supplierCompanyId === comp.ticker || c.customerCompanyId === comp.ticker);
    
    // Supplier concentration
    const supplierMap: Record<string, number> = {};
    let totalPurchases = 0;
    compContracts.filter(c => c.customerCompanyId === comp.ticker).forEach(c => {
      supplierMap[c.supplierCompanyId] = (supplierMap[c.supplierCompanyId] || 0) + c.priceUSD * c.quantityUnitsPerWeek;
      totalPurchases += c.priceUSD * c.quantityUnitsPerWeek;
    });
    
    if (totalPurchases > 0) {
      for (const [sup, amt] of Object.entries(supplierMap)) {
        if (amt / totalPurchases > 0.40) {
          comp.concentrationRiskFlags.push(`Supplier Concentration Risk: >40% of supply volume sourced from ${sup}`);
        }
      }
    }
    
    // Customer concentration
    const customerMap: Record<string, number> = {};
    let totalSales = 0;
    compContracts.filter(c => c.supplierCompanyId === comp.ticker).forEach(c => {
      customerMap[c.customerCompanyId] = (customerMap[c.customerCompanyId] || 0) + c.priceUSD * c.quantityUnitsPerWeek;
      totalSales += c.priceUSD * c.quantityUnitsPerWeek;
    });
    
    if (totalSales > 0) {
      for (const [cust, amt] of Object.entries(customerMap)) {
        if (amt / totalSales > 0.40) {
          comp.concentrationRiskFlags.push(`Customer Concentration Risk: >40% of contract revenue tied to ${cust}`);
        }
      }
    }
  });

  return state;
"""

c = c.replace("  return state;\n}", concentration_logic + "\n}")

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(c)

