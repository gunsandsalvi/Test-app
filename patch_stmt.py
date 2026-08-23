import sys

with open('src/components/CompanyDetailModal.tsx', 'r') as f:
    text = f.read()

text = text.replace("${f.annualRevenue.toFixed(0)}M", "${(f.annualRevenue / 4).toFixed(0)}M")
text = text.replace("${f.ebitda.toFixed(1)}M", "${(f.ebitda / 4).toFixed(1)}M")
text = text.replace("${f.netIncome.toFixed(1)}M", "${(f.netIncome / 4).toFixed(1)}M")

with open('src/components/CompanyDetailModal.tsx', 'w') as f:
    f.write(text)
