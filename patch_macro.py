import sys

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

# Fix the returns by adding missing indices

add_indices = """
    techIndex: makeIndexMetric('Global Tech Composite', 'TECH', 1000, prevIndices?.techIndex),
    financialsIndex: makeIndexMetric('Global Financials Composite', 'FIN', 1000, prevIndices?.financialsIndex),
    energyIndex: makeIndexMetric('Global Energy Composite', 'NRG', 1000, prevIndices?.energyIndex),
    industrialsIndex: makeIndexMetric('Global Industrials Composite', 'IND', 1000, prevIndices?.industrialsIndex),
    globalCreditComposite: makeIndexMetric('Global Credit Index', 'GCI', 100, prevIndices?.globalCreditComposite),
    marketBreadth: 50,
"""

text = text.replace("    gsciCommodity: makeIndexMetric('GSCI Commodity Index', 'GSCI', gsciLevel, prevIndices?.gsciCommodity),", "    gsciCommodity: makeIndexMetric('GSCI Commodity Index', 'GSCI', gsciLevel, prevIndices?.gsciCommodity),\n" + add_indices)

with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)

