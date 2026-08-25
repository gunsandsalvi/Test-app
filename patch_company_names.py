import re

with open('src/engine/companyGenerator.ts', 'r') as f:
    content = f.read()

# Replace the clone generation logic
word_bank = """
const NAME_PREFIXES = ['Apex', 'Meridian', 'Quantum', 'Summit', 'Pinnacle', 'Vanguard', 'Stellar', 'Nexus', 'Horizon', 'Nova', 'Echo', 'Strata', 'Zenith', 'Aegis', 'Omni'];
const NAME_SUFFIXES = ['Systems', 'Technologies', 'Group', 'Holdings', 'Dynamics', 'Solutions', 'Corp', 'Enterprises', 'Innovations', 'Global', 'Industries', 'Partners', 'Capital', 'Ventures', 'Networks'];

function generateUniqueName(baseName: string, sector: string, existingNames: Set<string>): string {
  let attempt = 0;
  while (attempt < 50) {
    const p = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
    const s = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
    const name = `${p} ${s}`;
    if (!existingNames.has(name)) {
      existingNames.add(name);
      return name;
    }
    attempt++;
  }
  return `${baseName} ${Math.floor(Math.random()*10000)} Corp`;
}

function generateUniqueTicker(existingTickers: Set<string>): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let attempt = 0;
  while (attempt < 100) {
    let t = '';
    for(let i=0; i<4; i++) t += chars.charAt(Math.floor(Math.random()*chars.length));
    if (!existingTickers.has(t)) {
      existingTickers.add(t);
      return t;
    }
    attempt++;
  }
  return 'XXXX';
}
"""

# Insert the word bank at the top or near the function
if "NAME_PREFIXES" not in content:
    content = content.replace("export function buildQuarterlyFundamentalSnapshot(", word_bank + "\nexport function buildQuarterlyFundamentalSnapshot(")

old_clone_logic = """
    let cloneIndex = 1;
    while (companies.length < targetCount) {
      const parent = baseCompanies[Math.floor(Math.random() * baseCompanies.length)];
      
      let newTicker = parent.ticker;
      while (existingTickers.has(newTicker)) {
        if (newTicker.length > 3) {
          newTicker = newTicker.substring(0, 3) + cloneIndex;
        } else {
          newTicker = newTicker + cloneIndex;
        }
        if (existingTickers.has(newTicker)) {
          cloneIndex++;
          newTicker = parent.ticker.substring(0, 3) + cloneIndex;
        }
      }
      existingTickers.add(newTicker);
      
      const newEmployeeCount = Math.floor(parent.employeeCount * (0.5 + Math.random()));
      const revenueScale = newEmployeeCount / parent.employeeCount;

      const newCompany: Company = {
        ...parent,
        id: generateId(),
        ticker: newTicker,
        name: `${parent.name} clone ${cloneIndex}`,
        annualRevenue: parent.annualRevenue * revenueScale,
        baselineAnnualRevenue: parent.baselineAnnualRevenue * revenueScale,
        totalDebt: parent.totalDebt * revenueScale,
        cash: parent.cash * revenueScale,
        marketCap: parent.marketCap * revenueScale,
        employeeCount: newEmployeeCount,
        productLines: (parent.productLines || []).map((l: any) => ({ ...l, categoryMarketShare: l.categoryMarketShare * revenueScale }))
      };
      companies.push(newCompany);
      cloneIndex++;
    }
"""

new_clone_logic = """
    const existingNames = new Set(companies.map(c => c.name));
    while (companies.length < targetCount) {
      const parent = baseCompanies[Math.floor(Math.random() * baseCompanies.length)];
      
      const newTicker = generateUniqueTicker(existingTickers);
      const newName = generateUniqueName(parent.name, parent.sector, existingNames);
      
      const newEmployeeCount = Math.max(10, Math.floor(parent.employeeCount * (0.3 + Math.random() * 1.4)));
      const revenueScale = newEmployeeCount / Math.max(1, parent.employeeCount);

      const newCompany: Company = {
        ...parent,
        id: generateId(),
        ticker: newTicker,
        name: newName,
        annualRevenue: parent.annualRevenue * revenueScale,
        baselineAnnualRevenue: parent.baselineAnnualRevenue * revenueScale,
        totalDebt: parent.totalDebt * revenueScale,
        cash: parent.cash * revenueScale,
        marketCap: parent.marketCap * revenueScale,
        employeeCount: newEmployeeCount,
        productLines: (parent.productLines || []).map((l: any) => ({ ...l, categoryMarketShare: l.categoryMarketShare * revenueScale }))
      };
      companies.push(newCompany);
    }
"""
content = content.replace(old_clone_logic, new_clone_logic)

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(content)
