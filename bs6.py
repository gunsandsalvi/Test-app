import sys

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

old1 = "const newCashReserves = Math.max(0, newDeposits * 0.10) + Math.max(0, -balanceSheetStance) * totalAssetsProxy * 0.01;"
new1 = "const newCashReserves = Math.max(0, newDeposits * 0.10 + Math.max(0, -balanceSheetStance) * totalAssetsProxy * 0.01);"

if old1 in text:
    text = text.replace(old1, new1)
    with open('src/engine/macroEngine.ts', 'w') as f:
        f.write(text)
    print("Fixed newCashReserves in macroEngine.ts")

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

old2 = "const systemicStressFactor = Math.min(0.3, creditContagionBps / 500);"
new2 = """  const avgCreditConditions = Object.values(state.regions).reduce((sum, reg) => sum + reg.bankingSector.creditConditionsIndex, 0) / Math.max(1, Object.keys(state.regions).length);
  const systemicStressFactor = Math.min(0.3, creditContagionBps / 500) + Math.max(0, avgCreditConditions) * 0.3;"""

if old2 in text:
    text = text.replace(old2, new2)
    with open('src/engine/simulation.ts', 'w') as f:
        f.write(text)
    print("Fixed systemicStressFactor in simulation.ts")

