import { Company, RegionId, Region } from '../../types';
import { generateIPOCompany } from '../companyGenerator';

export function checkForIPO(regionId: RegionId, reg: Region, companies: Company[], week: number): Company | null {
  if (week % 26 !== 0) return null;
  const categories = Object.keys(reg.categoryDemand) as string[];
  for (const cat of categories) {
    const demand = reg.categoryDemand[cat];
    if (!demand || demand.demandGrowthAnnual < 0.04) continue;
    const incumbents = companies.filter(c => c.region === regionId && !c.isDefaulted && (c.productLines || []).some(l => l.category === cat));
    const incumbentGrowthProxy = incumbents.length ? incumbents.reduce((s, c) => s + (c.annualRevenue - c.baselineAnnualRevenue) / Math.max(1, c.baselineAnnualRevenue), 0) / incumbents.length : 0;
    const supplyGap = demand.demandGrowthAnnual - incumbentGrowthProxy;
    if (supplyGap > 0.03 && Math.random() < 0.35) {
      return generateIPOCompany(regionId, cat, demand.demandLevelUSD, week);
    }
  }
  return null;
}

