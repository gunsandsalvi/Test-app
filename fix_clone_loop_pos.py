import re

with open('src/engine/companyGenerator.ts', 'r') as f:
    content = f.read()

# Remove the clone loop from its current wrong position
bad_block_pattern = r"    // Scale up templates to exactly 200 per region.*?companies\.push\(newCompany\);\n    \}"
bad_block_match = re.search(bad_block_pattern, content, re.DOTALL)
if bad_block_match:
    content = content[:bad_block_match.start()] + content[bad_block_match.end():]

# Insert the clone loop at the correct position, after templates are pushed to companies
correct_position_marker = """      const earningsWeekModulo = (companies.length % 13) + 1;

      companies.push({
        id: rawTmpl.ticker,
        ticker: rawTmpl.ticker,
        name: rawTmpl.name,
        region,
        sector: rawTmpl.sector as any,
        annualRevenue: tmpl.revBase,
        baselineAnnualRevenue: tmpl.revBase,
        ebitda,
        netIncome,
        eps,
        cash: tmpl.cashBase,
        totalDebt: tmpl.debtBase,
        debtTranches: [
          {
            id: `${rawTmpl.ticker}-BOND-1`,
            principalUSD: tmpl.debtBase,
            interestRate: 0.045,
            maturityWeek: 13,
            rateType: 'FIXED'
          }
        ],
        sharesOutstanding: tmpl.shares,
        stockPrice,
        marketCap,
        employeeCount,
        productLines,
        isDefaulted: false,
        creditRating: tmpl.initialRating as any,
        recoveryRate: 0.40,
        beta: tmpl.beta,
        historicalPrices,
        institutionalRole: tmpl.institutionalRole as any,
        institutionalMarketShare: tmpl.institutionalMarketShare,
        bankMarketShare: tmpl.bankMarketShare,
        capex: tmpl.revBase * 0.05,
        maintenanceCapex: tmpl.revBase * 0.02,
        growthCapex: tmpl.revBase * 0.03,
        leverage,
        interestCoverage,
        oasSpreadBps,
        cdsSpreadBps,
        quotedMarginBps,
        discountMarginBps,
        historicalFundamentals,
        loanRef,
        earningsWeekModulo,
        producedCommodityId: tmpl.producedCommodityId,
      });
    });"""

clone_logic_to_insert = """
    // Scale up templates to exactly 200 per region
    const targetCount = 200;
    const baseCompanies = companies.filter(c => c.region === region);
    const existingTickers = new Set(companies.map(c => c.ticker));
    const existingNames = new Set(companies.map(c => c.name));
    while (companies.filter(c => c.region === region).length < targetCount) {
      const parent = baseCompanies[Math.floor(Math.random() * baseCompanies.length)];
      
      const newTicker = generateUniqueTicker(existingTickers);
      const newName = generateUniqueName(parent.name, parent.sector, existingNames);
      
      const newEmployeeCount = Math.max(10, Math.floor(parent.employeeCount * (0.3 + Math.random() * 1.4)));
      const revenueScale = newEmployeeCount / Math.max(1, parent.employeeCount);

      const newCompany = {
        ...parent,
        id: parent.id + "-" + Math.random().toString(36).substring(2, 9),
        ticker: newTicker,
        name: newName,
        annualRevenue: parent.annualRevenue * revenueScale,
        baselineAnnualRevenue: parent.baselineAnnualRevenue * revenueScale,
        totalDebt: parent.totalDebt * revenueScale,
        cash: parent.cash * revenueScale,
        marketCap: parent.marketCap * revenueScale,
        employeeCount: newEmployeeCount,
        productLines: (parent.productLines || []).map((l: any) => ({ ...l, categoryMarketShare: l.categoryMarketShare * revenueScale })),
        historicalPrices: [...parent.historicalPrices],
        historicalFundamentals: [...parent.historicalFundamentals]
      };
      companies.push(newCompany as any);
    }
"""

content = content.replace(correct_position_marker, correct_position_marker + "\n" + clone_logic_to_insert)

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(content)
