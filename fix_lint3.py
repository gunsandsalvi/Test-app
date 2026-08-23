import sys

# Charts.tsx
with open('src/components/charts/Charts.tsx', 'r') as f:
    text = f.read()

text = text.replace("import { calculateNelsonSiegelZeroRate } from '../../engine/nelsonSiegel';", "import { calculateNelsonSiegelZeroRate, NelsonSiegelParams } from '../../engine/nelsonSiegel';\nimport { DebtTranche } from '../../types';")

with open('src/components/charts/Charts.tsx', 'w') as f:
    f.write(text)

# macroEngine.ts
with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

add_indices = """
    techIndex: makeIndexMetric('Global Tech Composite', 'TECH', 1000, prevIndices?.techIndex),
    financialsIndex: makeIndexMetric('Global Financials Composite', 'FIN', 1000, prevIndices?.financialsIndex),
    energyIndex: makeIndexMetric('Global Energy Composite', 'NRG', 1000, prevIndices?.energyIndex),
    industrialsIndex: makeIndexMetric('Global Industrials Composite', 'IND', 1000, prevIndices?.industrialsIndex),
    globalCreditComposite: makeIndexMetric('Global Credit Index', 'GCI', 100, prevIndices?.globalCreditComposite),
    marketBreadth: makeIndexMetric('Market Breadth', 'BREADTH', 50, prevIndices?.marketBreadth),
"""

text = text.replace("    gsciCommodity: makeIndexMetric('S&P GSCI Commodity Index', 'GSCI Index', newGsci, prevIndices?.gsciCommodity, 'pts'),", "    gsciCommodity: makeIndexMetric('S&P GSCI Commodity Index', 'GSCI Index', newGsci, prevIndices?.gsciCommodity, 'pts'),\n" + add_indices)

with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)

