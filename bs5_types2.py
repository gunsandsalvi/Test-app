import sys

with open('src/types.ts', 'r') as f:
    text = f.read()

old_str = "  baselineDividendYield: number;"
new_str = "  baselineDividendYield: number;\n  bankMarketShare?: number;"

if old_str in text:
    text = text.replace(old_str, new_str)
    with open('src/types.ts', 'w') as f:
        f.write(text)
    print("Replaced in src/types.ts")
else:
    print("Not found")

