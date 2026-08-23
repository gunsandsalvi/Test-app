import sys

# Fix formatCurrency in PortfolioRiskTab.tsx
with open('src/components/PortfolioRiskTab.tsx', 'r') as f:
    text = f.read()
if "formatCurrency" not in text:
    text = text.replace("formatUSD", "formatCurrency")
    text = text.replace("import { formatPercent }", "import { formatCurrency, formatPercent }")
    with open('src/components/PortfolioRiskTab.tsx', 'w') as f:
        f.write(text)

# Fix YieldCurveChart in Charts.tsx
with open('src/components/charts/Charts.tsx', 'r') as f:
    text = f.read()

text = text.replace("params.map", "[params.tenor3M, params.tenor2Y, params.tenor5Y, params.tenor10Y, params.tenor30Y].map")
text = text.replace("export const CapitalStructureBar: React.FC<{ tranches: any[], currentWeek: number }> =", "export const CapitalStructureBar: React.FC<{ tranches: DebtTranche[], currentWeek: number }> =")
with open('src/components/charts/Charts.tsx', 'w') as f:
    f.write(text)

