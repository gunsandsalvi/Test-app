import sys

def replace_file(filepath, old_str, new_str):
    with open(filepath, 'r') as f:
        text = f.read()
    if old_str in text:
        with open(filepath, 'w') as f:
            f.write(text.replace(old_str, new_str))
        print(f"Replaced in {filepath}")
    else:
        print(f"Not found in {filepath}: {old_str.strip()[:30]}")

# BF1
replace_file('src/types.ts', """  couponRate?: number;         // FIXED only — locked annual rate, paid on principalUSD, never changes until maturity
    trancheId?: string;
    rateType?: "FIXED" | "FLOATING";
    fixedRate?: number;
    floatingMarginBps?: number;
  floatingMarginBps?: number;""", """  couponRate?: number;         // FIXED only — locked annual rate, paid on principalUSD, never changes until maturity
  floatingMarginBps?: number;""")

# BF2
replace_file('src/engine/macroEngine.ts', "if (newZeroRates['2Y'] > newZeroRates['10Y']) {", "if (newZeroRates.tenor2Y > newZeroRates.tenor10Y) {")

# BF3
replace_file('src/engine/simulation.ts', "const curveSlope = (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.['10Y'] ?? 0) - (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.['2Y'] ?? 0);", "const curveSlope = (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.tenor10Y ?? 0) - (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.tenor2Y ?? 0);")

# FD3 (Part 1 - types)
replace_file('src/types.ts', "potentialGdpGrowth: number; // y* (e.g. 0.020)", "potentialGdpGrowth: number; // y* (e.g. 0.020)\n  nairu: number;")

# FD3 (Part 2 - initial values)
replace_file('src/engine/macroEngine.ts', "potentialGdpGrowth: 0.0210,", "potentialGdpGrowth: 0.0210,\n      nairu: 0.045,")
replace_file('src/engine/macroEngine.ts', "potentialGdpGrowth: 0.0150,", "potentialGdpGrowth: 0.0150,\n      nairu: 0.050,")
replace_file('src/engine/macroEngine.ts', "potentialGdpGrowth: 0.0050,", "potentialGdpGrowth: 0.0050,\n      nairu: 0.028,")
replace_file('src/engine/macroEngine.ts', "potentialGdpGrowth: 0.0120,", "potentialGdpGrowth: 0.0120,\n      nairu: 0.070,")

