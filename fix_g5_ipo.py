import sys

with open('src/engine/companyGenerator.ts', 'r') as f:
    text = f.read()

insert = """
const USED_NAMES = new Set<string>();

export function generateUniqueCompanyName(region: string, category: string): { ticker: string, name: string } {
  const prefixes = ['Global', 'Quantum', 'Nexus', 'Aero', 'Stratos', 'Nova', 'Titan', 'Zenith', 'Horizon', 'Apex', 'Pearl', 'Obsidian', 'Astral', 'Galactic', 'Orion', 'Meridian', 'Crown', 'Heritage'];
  const suffixes = ['Industries', 'Tech', 'Systems', 'Holdings', 'Group', 'Networks', 'Dynamics', 'Logistics', 'Stores', 'Brands'];
  
  let attempts = 0;
  while (attempts < 100) {
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    const name = `${p} ${s}`;
    const ticker = (p.substring(0,2) + s.substring(0,2)).toUpperCase();
    
    if (!USED_NAMES.has(name) && !USED_NAMES.has(ticker)) {
      USED_NAMES.add(name);
      USED_NAMES.add(ticker);
      return { ticker, name };
    }
    attempts++;
  }
  
  const fbName = `NewEntrant ${Math.floor(Math.random()*1000)}`;
  const fbTicker = `NEW${Math.floor(Math.random()*1000)}`;
  USED_NAMES.add(fbName);
  USED_NAMES.add(fbTicker);
  return { ticker: fbTicker, name: fbName };
}

export function generateIPOCompany(regionId: RegionId, category: string, categoryDemandUSD: number, week: number): Company {
  const revBase = categoryDemandUSD * (0.02 + Math.random() * 0.03); 
  const ebitdaMargin = 0.15 + Math.random() * 0.15;
  const shares = Math.floor(revBase * 10);
  const { ticker, name } = generateUniqueCompanyName(regionId, category);
  
  const sectorMap: Record<string, Sector> = {
    'CorporateTech': 'Tech',
    'StandardHousehold': 'Consumer',
    'StapleHousehold': 'Consumer',
    'LuxuryHousehold': 'Consumer',
    'CorporateIndustrial': 'Industrials',
    'GovernmentInfrastructure': 'Industrials',
    'GovernmentDefense': 'Industrials',
    'GovernmentHealthcare': 'Healthcare'
  };
  
  const sector = sectorMap[category] ?? 'Tech';
  const initialRating: CreditRating = Math.random() > 0.5 ? 'BB' : 'B';
  const debtBase = revBase * 1.5;
  
  const ebitda = revBase * ebitdaMargin;
  const da = revBase * 0.05;
  const ebit = Math.max(10, ebitda - da);
  const employeeCount = Math.max(100, Math.round(revBase / 500_000));
  const debtTranches = generateDebtTranches(ticker, debtBase, initialRating);
  
  return {
    id: `comp_${ticker}_${Date.now()}_${week}`,
    ticker, name, region: regionId, sector,
    baselineAnnualRevenue: revBase, annualRevenue: revBase,
    previousEmployeeCount: employeeCount, employeeCount,
    ebitda, ebit, netIncome: ebitda * 0.5, eps: 1.0,
    sharesOutstanding: shares, currentLiabilities: Math.round(debtBase * 0.25 + revBase * 0.08),
    totalDebt: debtBase, cashAndEquivalents: revBase * 0.5, capex: Math.round(revBase * 0.06),
    creditRating: initialRating, isDefaulted: false, oasSpreadBps: 300, cdsSpreadBps: 300,
    seniorBondYield: 0.08, stockPrice: 20, historicalPrices: Array(52).fill(20), forwardPE: 15,
    marketCap: shares * 20, dividendYield: 0, baselineDividendYield: 0, beta: 1.2, recoveryRate: 0.40,
    baselineRecoveryRate: 0.40, debtTranches,
    productLines: [{ category: category as any, revenueShare: 1.0, competitiveness: 0.3, categoryMarketShare: 0.02 }]
  };
}
"""

text = text + "\n" + insert

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(text)

print("Added G5 generator functions")
