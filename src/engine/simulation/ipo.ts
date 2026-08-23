import { Company, RegionId, Region } from '../../types';
import { generateIPOCompany } from '../companyGenerator';

export function checkForIPO(regionId: RegionId, reg: Region, companies: Company[], week: number): Company | null {
  if (week % 26 !== 0) return null;
  const categories = Object.keys(reg.categoryDemand) as string[];
  for (const cat of categories) {
    const demand = reg.categoryDemand[cat];
    if (!demand) continue;
    const incumbents = companies.filter(c => c.region === regionId && !c.isDefaulted && (c.productLines || []).some(l => l.category === cat));
    const incumbentGrowthProxy = incumbents.length ? incumbents.reduce((s, c) => s + (c.annualRevenue - c.baselineAnnualRevenue) / Math.max(1, c.baselineAnnualRevenue), 0) / incumbents.length : 0;
    const supplyGap = demand.demandGrowthAnnual - incumbentGrowthProxy;
    const demandTrigger = demand.demandGrowthAnnual >= 0.04 && supplyGap > 0.03;

    const maxShareInCategory = Math.max(0, ...incumbents.map(c => c.productLines?.find(l => l.category === cat)?.categoryMarketShare ?? 0));
    const concentrationTrigger = maxShareInCategory > 0.40;

    if ((demandTrigger || concentrationTrigger) && Math.random() < (concentrationTrigger ? 0.5 : 0.35)) {
      return generateIPOCompany(regionId, cat, demand.demandLevelUSD, week);
    }
  }
  return null;
}

