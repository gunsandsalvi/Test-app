import sys

with open('src/types.ts', 'r') as f:
    text = f.read()

old1 = """
  centralBankBalanceSheet: number;
  targetInflation: number; // pi* (e.g. 0.020)
"""
new1 = """
  centralBankBalanceSheet: number;
  balanceSheetStance: number;
  targetInflation: number; // pi* (e.g. 0.020)
"""
if old1.strip() in text:
    text = text.replace(old1.strip(), new1.strip())
    with open('src/types.ts', 'w') as f:
        f.write(text)
    print("Done Types")
else:
    print("Not found Types")

