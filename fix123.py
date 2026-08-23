import sys
import re

with open('src/types.ts', 'r') as f:
    text = f.read()

if 'laggedCorporateDemandBase: number;' not in text:
    text = text.replace('bankingSector: BankingSector;', 'bankingSector: BankingSector;\n  laggedCorporateDemandBase: number;')
    with open('src/types.ts', 'w') as f:
        f.write(text)

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

if 'laggedCorporateDemandBase: 0' not in text:
    text = text.replace("cycleRegime: 'Expansion',", "cycleRegime: 'Expansion',\n      laggedCorporateDemandBase: 0,")
    text = text.replace("cycleRegime: 'Slowdown',", "cycleRegime: 'Slowdown',\n      laggedCorporateDemandBase: 0,")
    text = text.replace("cycleRegime: 'Recovery',", "cycleRegime: 'Recovery',\n      laggedCorporateDemandBase: 0,")
    
    # FIX3
    text = text.replace(
        "const businessLossRateAnnual = Math.min(0.08, (creditContagionBps / 10000) * 1.2);",
        "const businessLossRateAnnual = Math.min(0.12, (creditContagionBps / 10000) * 1.8);"
    )
    text = text.replace(
        "const consumerLossRateAnnual = Math.min(0.06, Math.max(0, unemploymentRate - 0.045) * 0.8);",
        "const consumerLossRateAnnual = Math.min(0.09, Math.max(0, unemploymentRate - 0.045) * 1.4);"
    )
    
    with open('src/engine/macroEngine.ts', 'w') as f:
        f.write(text)

