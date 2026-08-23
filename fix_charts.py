import sys

with open('src/components/charts/Charts.tsx', 'r') as f:
    text = f.read()

text = text.replace("calculateTenorZeroRates(params);", "tenors.map(t => calculateNelsonSiegelZeroRate(t, params));")
text = text.replace("import { calculateTenorZeroRates }", "import { calculateNelsonSiegelZeroRate }")

with open('src/components/charts/Charts.tsx', 'w') as f:
    f.write(text)

