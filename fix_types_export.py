import re
with open('src/types.ts', 'r') as f:
    c = f.read()

c = "export type FinancialStatementProfile = 'STANDARD_OPERATING' | 'INSURER' | 'ASSET_MANAGER' | 'BANK' | 'REIT';\n" + c
with open('src/types.ts', 'w') as f:
    f.write(c)
