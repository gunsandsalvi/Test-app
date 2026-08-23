import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

text = text.replace(
    "    let newEps = 0;\n    let newEmployeeCount = 0;",
    "    let updatedProductLines = comp.productLines || [];\n    let newEps = 0;\n    let newEmployeeCount = 0;"
)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)
