import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

text = text.replace(
    "    const updatedProductLines = (comp.productLines || []).map((line) => {",
    "    updatedProductLines = (comp.productLines || []).map((line) => {"
)

text = text.replace(
    "    let newEps = comp.eps;\n    let newEmployeeCount = comp.employeeCount;\n    let newCapex = comp.capex;",
    "    let newEps = comp.eps;\n    let newEmployeeCount = comp.employeeCount;\n    let newCapex = comp.capex;\n    let updatedProductLines = comp.productLines || [];"
)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)

print("Fixed updatedProductLines scope")
