import sys

with open('src/engine/pricing.ts', 'r') as f:
    text = f.read()

old_str = "  Utilities:   { basePE: 16.0, growthRate: 0.04, vol: 0.15 },"
new_str = "  Utilities:   { basePE: 16.0, growthRate: 0.04, vol: 0.15 },\n  Banks:       { basePE: 10.0, growthRate: 0.03, vol: 0.24 },"

if old_str in text:
    text = text.replace(old_str, new_str)
    with open('src/engine/pricing.ts', 'w') as f:
        f.write(text)
    print("Replaced in src/engine/pricing.ts")
else:
    print("Not found")

