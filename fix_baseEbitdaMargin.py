import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

old1 = """    let newRevenue = 0;
    let newEbitdaMargin = 0;
    let newEbitda = 0;
    let newEbit = 0;
    let newNetIncome = 0;
    let newEps = 0;

    if (comp.sector === 'Banks') {"""

new1 = """    let newRevenue = 0;
    let baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
    let newEbitdaMargin = 0;
    let newEbitda = 0;
    let newEbit = 0;
    let newNetIncome = 0;
    let newEps = 0;

    if (comp.sector === 'Banks') {"""

text = text.replace(old1, new1)

old2 = "const baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);"
new2 = "baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);"

text = text.replace(old2, new2)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)

print("Fixed baseEbitdaMargin reference error")
