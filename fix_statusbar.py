import sys

with open('src/components/StatusBar.tsx', 'r') as f:
    text = f.read()

text = text.replace("import { formatUSD, formatPercent } from '../engine/formatters';", "import { formatCurrency, formatPercent } from '../engine/formatters';")
text = text.replace("formatUSD(", "formatCurrency(")

with open('src/components/StatusBar.tsx', 'w') as f:
    f.write(text)

