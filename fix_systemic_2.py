import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

import re

text = re.sub(
    r"const creditContagionBps = recentDefaultsCount \* 12;\n\s+const avgCreditConditions = .*;\n\s+const systemicStressFactor = .*;",
    "const creditContagionBps = recentDefaultsCount * 12;\n  const systemicStressFactorGlobal = Math.min(0.3, creditContagionBps / 500);",
    text
)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)

print("Fixed systemic stress reference error")
