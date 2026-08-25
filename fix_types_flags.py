import re
with open('src/types.ts', 'r') as f:
    c = f.read()

c = c.replace("export interface Company {", "export interface Company {\n  concentrationRiskFlags?: string[];")

with open('src/types.ts', 'w') as f:
    f.write(c)

