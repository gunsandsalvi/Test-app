import re
with open('src/types.ts', 'r') as f:
    c = f.read()

profile_enum = """
export type FinancialStatementProfile = 'STANDARD_OPERATING' | 'INSURER' | 'ASSET_MANAGER' | 'BANK' | 'REIT';
"""
c = c.replace("export type Sector = 'Tech' | 'Consumer' | 'Healthcare' | 'Financials' | 'Industrials' | 'Energy' | 'Utilities' | 'Banks';", profile_enum + "\nexport type Sector = 'Tech' | 'Consumer' | 'Healthcare' | 'Financials' | 'Industrials' | 'Energy' | 'Utilities' | 'Banks';")

c = c.replace("export interface Company {", "export interface Company {\n  financialStatementProfile?: FinancialStatementProfile;\n  technicalReservesUSD?: number;\n  aumUSD?: number;\n  managementFeeRate?: number;\n  insurancePremiumsWrittenUSD?: number;\n  insuranceClaimsPaidUSD?: number;")

c = c.replace("export interface InstitutionalEntity {", "export interface InstitutionalEntity {\n  financialStatementProfile?: FinancialStatementProfile;")

with open('src/types.ts', 'w') as f:
    f.write(c)

