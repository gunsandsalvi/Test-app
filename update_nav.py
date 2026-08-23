import sys
with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

old = """
  // Calculate updated Cash & NAV
  const netWeeklyAccruals = weeklyInterestIncomeUSD - weeklyFinancingCostUSD;
  const updatedCashUSD = state.portfolio.cashUSD + netWeeklyAccruals;
  const totalUnrealizedPnL = updatedPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const currentNavUSD = Math.max(0, updatedCashUSD + totalUnrealizedPnL);

  const pnlDeltaUSD = currentNavUSD - state.portfolio.navUSD;
  const pnlDeltaPct = state.portfolio.navUSD > 0 ? (pnlDeltaUSD / state.portfolio.navUSD) * 100 : 0;

  const totalGrossExposureUSD = updatedPositions.reduce((sum, p) => sum + p.notional, 0);
"""

new = """
  // Calculate updated Cash & NAV
  const finalPositions = updatedPositions.filter(p => !p.isClosed);
  const netWeeklyAccruals = weeklyInterestIncomeUSD - weeklyFinancingCostUSD;
  const updatedCashUSD = state.portfolio.cashUSD + netWeeklyAccruals + weeklyRealizedCashUSD;
  const totalUnrealizedPnL = finalPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const currentNavUSD = Math.max(0, updatedCashUSD + totalUnrealizedPnL);

  const pnlDeltaUSD = currentNavUSD - state.portfolio.navUSD;
  const pnlDeltaPct = state.portfolio.navUSD > 0 ? (pnlDeltaUSD / state.portfolio.navUSD) * 100 : 0;

  const totalGrossExposureUSD = finalPositions.reduce((sum, p) => sum + p.notional, 0);
"""

if old.strip() in text:
    print("Found! (with strip)")
else:
    old = old.strip()

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text.replace(old, new.strip()))
