import sys

try:
    with open('src/components/PortfolioKpiStrip.tsx', 'r') as f:
        text = f.read()

    text = text.replace("import { formatUSD, formatPercent } from '../utils/formatters';", "import { formatCurrency, formatPercent } from '../engine/formatters';")
    text = text.replace("formatUSD(", "formatCurrency(")

    with open('src/components/PortfolioKpiStrip.tsx', 'w') as f:
        f.write(text)
except FileNotFoundError:
    pass

try:
    with open('src/components/TopStatusBar.tsx', 'r') as f:
        text = f.read()
    
    text = text.replace("import { formatUSD, formatPercent } from '../utils/formatters';", "import { formatCurrency, formatPercent } from '../engine/formatters';")
    text = text.replace("formatUSD(", "formatCurrency(")

    with open('src/components/TopStatusBar.tsx', 'w') as f:
        f.write(text)
except FileNotFoundError:
    pass

