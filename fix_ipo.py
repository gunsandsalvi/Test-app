import sys

with open('src/engine/companyGenerator.ts', 'r') as f:
    text = f.read()

target = """    productLines: [{ category: category as any, revenueShare: 1.0, competitiveness: 0.3, categoryMarketShare: 0.02 }]
  };"""

replacement = """    productLines: [{ category: category as any, revenueShare: 1.0, competitiveness: 0.3, categoryMarketShare: 0.02 }],
    leverage: debtBase / Math.max(1, ebitda),
    interestCoverage: ebit / Math.max(0.5, debtBase * 0.06),
    earningsWeekModulo: week % 13,
    lastEarningsReportWeek: week,
    reportedThisWeek: false,
    historicalFundamentals: [],
    baselineEmployeeCount: employeeCount,
    dealerConsensus: {
      alpha: { eps: 1.0, revenue: revBase },
      beta: { eps: 1.0, revenue: revBase },
      gamma: { eps: 1.0, revenue: revBase },
      consensusEps: 1.0,
      consensusRevenue: revBase,
    },
    lastEarningsSurprisePct: 0,
    lastManagementCommentary: 'Newly public company; management outlined initial growth strategy at IPO.',
    leveragedLoan: {
      quotedMarginBps: 300,
      referenceBenchmark: 'SOFR',
      pricePar: 99.0,
      discountMarginBps: 300,
      tenorYears: 5,
      seniority: 'Senior Secured First Lien',
      recoveryRate: 0.40,
    },
    ratingHistory: [initialRating],
    sentiment: 0.0,
  };"""

if target in text:
    text = text.replace(target, replacement)
    with open('src/engine/companyGenerator.ts', 'w') as f:
        f.write(text)
    print("Patched generateIPOCompany")
else:
    print("Could not find target block")

