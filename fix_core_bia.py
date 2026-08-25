import re
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

# I need to match the bank check
bank_check = r"    if \(comp\.sector === 'Banks'\) \{.*?    \} else \{"
match = re.search(bank_check, c, re.DOTALL)
if match:
    new_logic = """
    if (comp.financialStatementProfile === 'BANK' || comp.sector === 'Banks') {
      const bs = reg.bankingSector;
      const share = comp.bankMarketShare ?? 0.25;
      const totalAssets = bs.businessLoanBookUSD + bs.consumerLoanBookUSD + bs.sovereignBondHoldingsUSD;
      const weeklyNim = bs.netInterestMarginPct / 52;
      const impliedNimRev = totalAssets * weeklyNim * share;
      const loanLosses = Math.random() * 0.05 * totalAssets * share / 52;
      newRevenue = Math.max(10, comp.annualRevenue * 0.98 + (impliedNimRev * 52) * 0.02);
      newEbitdaMargin = 0.40;
      newEbitda = newRevenue * newEbitdaMargin - (loanLosses * 52);
      newEbit = Math.max(1, newEbitda);
      newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
      newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));
      comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];
    } else if (comp.financialStatementProfile === 'INSURER') {
      const instEnt = state.institutionalEntities.find(e => e.id === comp.id);
      const floatAssets = instEnt?.totalAssetsUSD ?? (comp.annualRevenue * 5);
      comp.technicalReservesUSD = floatAssets * 0.85;
      
      const premiumGrowth = reg.gdpGrowth / 52 + (Math.random() - 0.5) * 0.02;
      const prevPremiums = (comp.insurancePremiumsWrittenUSD || comp.annualRevenue) / 52;
      const weeklyPremiums = Math.max(10, prevPremiums * (1 + premiumGrowth));
      comp.insurancePremiumsWrittenUSD = weeklyPremiums * 52;
      
      const lossRatio = 0.70 + (Math.random() - 0.5) * 0.20;
      comp.insuranceClaimsPaidUSD = weeklyPremiums * lossRatio * 52;
      
      const underwritingIncome = weeklyPremiums * (1 - lossRatio - 0.20); 
      const investmentIncome = floatAssets * 0.04 / 52;
      
      newRevenue = comp.insurancePremiumsWrittenUSD;
      comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];
      newEbitdaMargin = 0.15;
      newEbitda = (underwritingIncome + investmentIncome) * 52;
      newEbit = Math.max(1, newEbitda);
      newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
      newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));
    } else if (comp.financialStatementProfile === 'ASSET_MANAGER') {
      const instEnt = state.institutionalEntities.find(e => e.id === comp.id);
      const marketGrowth = state.compositeIndices.globalEquity.level / Math.max(1, state.compositeIndices.globalEquity.previousLevel);
      const flows = (Math.random() - 0.4) * 0.01;
      comp.aumUSD = (comp.aumUSD ?? (instEnt?.totalAssetsUSD ?? comp.annualRevenue * 50)) * marketGrowth * (1 + flows);
      comp.managementFeeRate = comp.managementFeeRate ?? (0.005 + Math.random() * 0.005);
      
      const weeklyFees = comp.aumUSD * comp.managementFeeRate / 52;
      newRevenue = Math.max(10, weeklyFees * 52);
      comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];
      newEbitdaMargin = 0.35;
      newEbitda = newRevenue * newEbitdaMargin;
      newEbit = Math.max(1, newEbitda);
      newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
      newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));
    } else {"""
    c = c[:match.start()] + new_logic + c[match.end():]
    with open('src/engine/simulation/core.ts', 'w') as f:
        f.write(c)
    print("Replaced successfully")
else:
    print("Not found")

