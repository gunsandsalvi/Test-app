import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

# We need to remove:
# let consumerRevBoost = 0; ...
# const sectorGdpBeta = comp.beta;
# const SECTOR_REGIME_TILT = ...
# const curveSlope = ...
# const financialsTilt = ...
# const regimeTilt = ...

remove_start = "      let consumerRevBoost = 0;"
remove_end = "      const regimeTilt = SECTOR_REGIME_TILT[comp.sector]?.[reg.cycleRegime] ?? 0;"

# But they might not be exact. Let's do a targeted replace.
text = text.replace("      let consumerRevBoost = 0;\n      if (comp.sector === 'Consumer') consumerRevBoost = effectiveConsumptionGrowth * 1.6;\n      else if (comp.sector === 'Tech') consumerRevBoost = effectiveConsumptionGrowth * 1.1;\n      else consumerRevBoost = effectiveConsumptionGrowth * 0.4;", "")
text = text.replace("      const sectorGdpBeta = comp.beta;", "")

tilt_text = """      const SECTOR_REGIME_TILT: Record<string, Partial<Record<'Expansion' | 'Slowdown' | 'Recession' | 'Recovery', number>>> = {
        Industrials: { Expansion: 0.0015, Recovery: 0.002, Recession: -0.0015 },
        Energy:      { Expansion: 0.0012, Recovery: 0.0018, Recession: -0.001 },
        Tech:        { Expansion: 0.0015, Recovery: 0.0025, Recession: -0.002 },
        Consumer:    { Recession: 0.0008, Slowdown: 0.0005 }, // defensive tailwind
        Healthcare:  { Recession: 0.0008, Slowdown: 0.0005 }, // defensive tailwind
        Utilities:   { Recession: 0.0006, Slowdown: 0.0004 },
      };
      const curveSlope = (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.tenor10Y ?? 0) - (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.tenor2Y ?? 0);
      const financialsTilt = comp.sector === 'Financials' ? Math.max(-0.001, Math.min(0.001, curveSlope * 0.02)) : 0;
      const regimeTilt = SECTOR_REGIME_TILT[comp.sector]?.[reg.cycleRegime] ?? 0;"""

text = text.replace(tilt_text, "")

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)

print("Cleaned up unused variables")
