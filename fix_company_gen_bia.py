import re
with open('src/engine/companyGenerator.ts', 'r') as f:
    c = f.read()

# I will find the company creation point and add financialStatementProfile
c = c.replace("const company: Company = {", """
      let financialStatementProfile: any = 'STANDARD_OPERATING';
      if (tmpl.sector === 'Banks') financialStatementProfile = 'BANK';
      else if (tmpl.institutionalRole === 'INSURER') financialStatementProfile = 'INSURER';
      else if (tmpl.institutionalRole === 'ASSET_MANAGER' || tmpl.institutionalRole === 'PENSION_FUND') financialStatementProfile = 'ASSET_MANAGER';
      
      const company: Company = {
        financialStatementProfile,""")

c = c.replace("const newCompany = {", """
      const newCompany = {
        financialStatementProfile: parent.financialStatementProfile,
        technicalReservesUSD: parent.technicalReservesUSD,
        aumUSD: parent.aumUSD,
        managementFeeRate: parent.managementFeeRate,
        insurancePremiumsWrittenUSD: parent.insurancePremiumsWrittenUSD,
        insuranceClaimsPaidUSD: parent.insuranceClaimsPaidUSD,
""")

# Also in initialization.ts, push financialStatementProfile to InstitutionalEntity
with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(c)

