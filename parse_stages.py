import re

with open('src/engine/simulation/core.ts', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if line.strip().startswith('// 1. Calculate Micro -> Macro Feedback'): print(f"01: {i+1}")
    elif line.strip().startswith('// 2. Evolve Multi-Region Macro States'): print(f"02: {i+1}")
    elif line.strip().startswith('// 3. Evolve FX Pairs'): print(f"06: {i+1}")
    elif line.strip().startswith('// 4. Evolve Commodities'): print(f"07: {i+1}")
    elif line.strip().startswith('// 5. Evolve 200 Company'): print(f"08: {i+1}")
    elif 'Check for M&A Consolidation' in line: print(f"10: {i+1}")
    elif 'Calculate Updated Composite' in line: print(f"indices (not 12): {i+1}")
    elif 'Portfolio Mark-to-Market' in line: print(f"12: {i+1}")
    elif 'Generate Weekly Breaking News' in line: print(f"13: {i+1}")
    elif 'Excess unfunded-deficit float' in line: print(f"11 (maybe?): {i+1}")
    elif 'Systemic C+I+G Top-Down Aggregate Demand' in line: print(f"03 (maybe?): {i+1}")
    elif 'Input-Output Cross-Sector Supply Constraints' in line: print(f"04: {i+1}")
    elif 'executeSubUnitBiddingMarket(' in line: print(f"05 (maybe?): {i+1}")
    elif 'function advanceWeeklyStep' in line: print(f"start: {i+1}")

