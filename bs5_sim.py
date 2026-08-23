import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

old_block = """    // Consumer Revenue Beta
    const creditTighteningPenalty = Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.015;
    const effectiveConsumptionGrowth = reg.householdState.realConsumptionGrowth - creditTighteningPenalty;
    let consumerRevBoost = 0;
    if (comp.sector === 'Consumer') consumerRevBoost = effectiveConsumptionGrowth * 1.6;
    else if (comp.sector === 'Tech') consumerRevBoost = effectiveConsumptionGrowth * 1.1;
    else consumerRevBoost = effectiveConsumptionGrowth * 0.4;

    // Weekly revenue transition
    const noise = (Math.random() - 0.5) * 0.015;
    const baseRev = comp.baselineAnnualRevenue || comp.annualRevenue;
    const sectorGdpBeta = comp.beta;
    
    const SECTOR_REGIME_TILT: Record<string, Partial<Record<'Expansion' | 'Slowdown' | 'Recession' | 'Recovery', number>>> = {
      Industrials: { Expansion: 0.0015, Recovery: 0.002, Recession: -0.0015 },
      Energy:      { Expansion: 0.0012, Recovery: 0.0018, Recession: -0.001 },
      Tech:        { Expansion: 0.0015, Recovery: 0.0025, Recession: -0.002 },
      Consumer:    { Recession: 0.0008, Slowdown: 0.0005 }, // defensive tailwind
      Healthcare:  { Recession: 0.0008, Slowdown: 0.0005 }, // defensive tailwind
      Utilities:   { Recession: 0.0006, Slowdown: 0.0004 },
    };

    const curveSlope = (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.tenor10Y ?? 0) - (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.tenor2Y ?? 0);
    const financialsTilt = comp.sector === 'Financials' ? Math.max(-0.001, Math.min(0.001, curveSlope * 0.02)) : 0;
    const regimeTilt = SECTOR_REGIME_TILT[comp.sector]?.[reg.cycleRegime] ?? 0;

    // Re-anchor target annual revenue to baseline capacity adjusted for regional GDP and consumer momentum
    const pricingPowerBeta = SECTOR_PRICING_POWER[comp.sector] ?? 0.65;
    const targetAnnualRevenue = baseRev * (1 + (reg.gdpGrowth * sectorGdpBeta) + consumerRevBoost + noise + reg.inflation * pricingPowerBeta + regimeTilt + financialsTilt);
    
    // Smooth transition to target revenue (no exponential weekly compounding)
    const newRevenue = Math.max(10, (comp.annualRevenue * 0.90) + (targetAnnualRevenue * 0.10));

    // Operating margins update (Wage-Push compression)
    const wageSensitivity = SECTOR_WAGE_SENSITIVITY[comp.sector] ?? 1.0;
    const wageCompression = Math.max(0, reg.householdState.wageGrowth - 0.025) * 0.15 * wageSensitivity;
    const baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
    const newEbitdaMargin = Math.min(0.65, Math.max(0.02, baseEbitdaMargin + (Math.random() - 0.5) * 0.004 - (wageCompression / 52)));
    const newEbitda = newRevenue * newEbitdaMargin;
    const da = newRevenue * 0.05;
    const newEbit = Math.max(1, newEbitda - da);

    // Interest Expense
    const nonMaturingTranches = comp.debtTranches.filter(t => t.maturityWeek !== nextWeek);
    const annualInterest = nonMaturingTranches.reduce((sum, t) => {
      if (t.rateType === 'FIXED') return sum + t.principalUSD * (t.couponRate ?? 0.05);
      return sum + t.principalUSD * (reg.policyRate + (t.floatingMarginBps ?? 200) / 10000);
    }, 0);
    const weeklyInterest = annualInterest / 52;
    const effectiveDebtRate = annualInterest / Math.max(1, comp.totalDebt);
    const taxRate = 0.21;
    const newNetIncome = Math.max(-50, (newEbit - annualInterest) * (1 - taxRate));
    let newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));"""

new_block = """    // Interest Expense (computed early so Banks can skip or use it if they had standard debt, but they mostly rely on BankingSector)
    const nonMaturingTranches = comp.debtTranches.filter(t => t.maturityWeek !== nextWeek);
    const annualInterest = nonMaturingTranches.reduce((sum, t) => {
      if (t.rateType === 'FIXED') return sum + t.principalUSD * (t.couponRate ?? 0.05);
      return sum + t.principalUSD * (reg.policyRate + (t.floatingMarginBps ?? 200) / 10000);
    }, 0);
    const weeklyInterest = annualInterest / 52;
    const effectiveDebtRate = annualInterest / Math.max(1, comp.totalDebt);
    const taxRate = 0.21;

    let newRevenue = 0;
    let newEbitdaMargin = 0;
    let newEbitda = 0;
    let newEbit = 0;
    let newNetIncome = 0;
    let newEps = 0;

    if (comp.sector === 'Banks') {
      const bs = reg.bankingSector;
      const share = comp.bankMarketShare ?? 0.25;
      const totalAssets = bs.businessLoanBookUSD + bs.consumerLoanBookUSD + bs.sovereignBondHoldingsUSD;
      const annualizedNetIncome = (bs.netInterestMarginPct * totalAssets - bs.businessLoanBookUSD * bs.loanLossProvisionRateAnnualPct) * share;
      const impliedRevenue = bs.netInterestMarginPct * totalAssets * share * 2.2;
      const impliedEbitda = annualizedNetIncome * 1.3;
      
      newRevenue = Math.max(10, (comp.annualRevenue * 0.90) + (impliedRevenue * 0.10));
      newEbitda = Math.max(5, (comp.ebitda * 0.90) + (impliedEbitda * 0.10));
      newEbitdaMargin = newEbitda / Math.max(1, newRevenue);
      const da = newRevenue * 0.05;
      newEbit = Math.max(1, newEbitda - da);
      newNetIncome = annualizedNetIncome;
      newEps = Number((annualizedNetIncome / Math.max(1, comp.sharesOutstanding)).toFixed(2));
    } else {
      // Consumer Revenue Beta
      const creditTighteningPenalty = Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.015;
      const effectiveConsumptionGrowth = reg.householdState.realConsumptionGrowth - creditTighteningPenalty;
      let consumerRevBoost = 0;
      if (comp.sector === 'Consumer') consumerRevBoost = effectiveConsumptionGrowth * 1.6;
      else if (comp.sector === 'Tech') consumerRevBoost = effectiveConsumptionGrowth * 1.1;
      else consumerRevBoost = effectiveConsumptionGrowth * 0.4;

      // Weekly revenue transition
      const noise = (Math.random() - 0.5) * 0.015;
      const baseRev = comp.baselineAnnualRevenue || comp.annualRevenue;
      const sectorGdpBeta = comp.beta;
      
      const SECTOR_REGIME_TILT: Record<string, Partial<Record<'Expansion' | 'Slowdown' | 'Recession' | 'Recovery', number>>> = {
        Industrials: { Expansion: 0.0015, Recovery: 0.002, Recession: -0.0015 },
        Energy:      { Expansion: 0.0012, Recovery: 0.0018, Recession: -0.001 },
        Tech:        { Expansion: 0.0015, Recovery: 0.0025, Recession: -0.002 },
        Consumer:    { Recession: 0.0008, Slowdown: 0.0005 }, // defensive tailwind
        Healthcare:  { Recession: 0.0008, Slowdown: 0.0005 }, // defensive tailwind
        Utilities:   { Recession: 0.0006, Slowdown: 0.0004 },
      };

      const curveSlope = (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.tenor10Y ?? 0) - (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.tenor2Y ?? 0);
      const financialsTilt = comp.sector === 'Financials' ? Math.max(-0.001, Math.min(0.001, curveSlope * 0.02)) : 0;
      const regimeTilt = SECTOR_REGIME_TILT[comp.sector]?.[reg.cycleRegime] ?? 0;

      // Re-anchor target annual revenue to baseline capacity adjusted for regional GDP and consumer momentum
      const pricingPowerBeta = SECTOR_PRICING_POWER[comp.sector] ?? 0.65;
      const targetAnnualRevenue = baseRev * (1 + (reg.gdpGrowth * sectorGdpBeta) + consumerRevBoost + noise + reg.inflation * pricingPowerBeta + regimeTilt + financialsTilt);
      
      // Smooth transition to target revenue (no exponential weekly compounding)
      newRevenue = Math.max(10, (comp.annualRevenue * 0.90) + (targetAnnualRevenue * 0.10));

      // Operating margins update (Wage-Push compression)
      const wageSensitivity = SECTOR_WAGE_SENSITIVITY[comp.sector] ?? 1.0;
      const wageCompression = Math.max(0, reg.householdState.wageGrowth - 0.025) * 0.15 * wageSensitivity;
      const baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
      newEbitdaMargin = Math.min(0.65, Math.max(0.02, baseEbitdaMargin + (Math.random() - 0.5) * 0.004 - (wageCompression / 52)));
      newEbitda = newRevenue * newEbitdaMargin;
      const da = newRevenue * 0.05;
      newEbit = Math.max(1, newEbitda - da);

      newNetIncome = Math.max(-50, (newEbit - annualInterest) * (1 - taxRate));
      newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));
    }"""

if old_block in text:
    text = text.replace(old_block, new_block)
    with open('src/engine/simulation.ts', 'w') as f:
        f.write(text)
    print("Replaced simulation logic")
else:
    print("Not found block")
    
