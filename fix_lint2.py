import sys

# CompanyDetailModal.tsx
with open('src/components/CompanyDetailModal.tsx', 'r') as f:
    text = f.read()
if "CapitalStructureBar" not in text:
    pass # Wait, it says it cannot find it, so I should add it.
import_str = "import { CapitalStructureBar } from './charts/Charts';\n"
if "CapitalStructureBar" not in text[:500]:
    s = text.find("import React")
    e = text.find("\n", s)
    text = text[:e+1] + import_str + text[e+1:]
with open('src/components/CompanyDetailModal.tsx', 'w') as f:
    f.write(text)

# PortfolioRiskTab.tsx
with open('src/components/PortfolioRiskTab.tsx', 'r') as f:
    text = f.read()
text = text.replace("import { formatPercent } from '../engine/formatters';", "import { formatCurrency, formatPercent } from '../engine/formatters';")
with open('src/components/PortfolioRiskTab.tsx', 'w') as f:
    f.write(text)

# Charts.tsx
with open('src/components/charts/Charts.tsx', 'r') as f:
    text = f.read()
text = text.replace("import { NelsonSiegelParams, DebtTranche }", "import { DebtTranche }")
text = text.replace("import { NelsonSiegelParams }", "")
with open('src/components/charts/Charts.tsx', 'w') as f:
    f.write(text)
    
