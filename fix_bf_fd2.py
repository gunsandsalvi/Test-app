import sys

def replace_file(filepath, old_str, new_str):
    with open(filepath, 'r') as f:
        text = f.read()
    if old_str in text:
        with open(filepath, 'w') as f:
            f.write(text.replace(old_str, new_str))
        print(f"Replaced in {filepath}")
    else:
        print(f"Not found in {filepath}: {old_str.strip()[:30]}")

replace_file('src/engine/macroEngine.ts', "potentialGdpGrowth: 0.0080,", "potentialGdpGrowth: 0.0080,\n      nairu: 0.028,")
replace_file('src/engine/macroEngine.ts', "potentialGdpGrowth: 0.0140,", "potentialGdpGrowth: 0.0140,\n      nairu: 0.070,")
