import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

old1 = """  const creditContagionBps = recentDefaultsCount * 12;
  const avgCreditConditions = Object.values(state.regions).reduce((sum, reg) => sum + reg.bankingSector.creditConditionsIndex, 0) / Math.max(1, Object.keys(state.regions).length);
  const systemicStressFactor = Math.min(0.3, creditContagionBps / 500) + Math.max(0, avgCreditConditions) * 0.3;"""

new1 = """  const creditContagionBps = recentDefaultsCount * 12;
  const systemicStressFactorGlobal = Math.min(0.3, creditContagionBps / 500);"""

text = text.replace(old1, new1)

old2 = """    const newBaselineRecoveryRate = Number(((comp.baselineRecoveryRate ?? 0.40) * 0.998 + comp.recoveryRate * 0.002).toFixed(4));
    const effectiveRecoveryRate = Math.max(0.10, newBaselineRecoveryRate * (1 - systemicStressFactor));"""

new2 = """    const systemicStressFactor = systemicStressFactorGlobal + Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.3;
    const newBaselineRecoveryRate = Number(((comp.baselineRecoveryRate ?? 0.40) * 0.998 + comp.recoveryRate * 0.002).toFixed(4));
    const effectiveRecoveryRate = Math.max(0.10, newBaselineRecoveryRate * (1 - systemicStressFactor));"""

text = text.replace(old2, new2)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)

