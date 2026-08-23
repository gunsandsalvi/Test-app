import sys
import re

with open('src/components/BondsCdsTab.tsx', 'r') as f:
    text = f.read()

# Replace types
text = text.replace("'CDS' | 'CORP_BONDS' | 'LEVERAGED_LOANS'", "'CDS' | 'CASH_DEBT'")
text = text.replace("setViewMode('CORP_BONDS')", "setViewMode('CASH_DEBT')")
text = text.replace("viewMode === 'CORP_BONDS'", "viewMode === 'CASH_DEBT'")

with open('src/components/BondsCdsTab.tsx', 'w') as f:
    f.write(text)
