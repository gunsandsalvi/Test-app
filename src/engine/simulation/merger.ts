import { Company } from '../../types';
import { isActiveCompany } from '../../domain/company';
import { formatCurrency } from '../formatters';

export interface MergerCandidate {
  acquirerTicker: string;
  targetTicker: string;
  title: string;
  description: string;
}

export function checkForMerger(
  activeCompanies: Company[],
  week: number
): MergerCandidate | null {
  if (week % 13 !== 0) return null; // evaluated quarterly

  const igRatings = ['AAA', 'AA', 'A', 'BBB'];
  const distressedRatings = ['BB', 'B', 'CCC'];

  for (const acquirer of activeCompanies) {
    if (!isActiveCompany(acquirer) || !igRatings.includes(acquirer.creditRating)) continue;
    if (acquirer.cash < 2 * Math.max(1, acquirer.totalDebt) && acquirer.totalDebt > 0) continue;
    if (acquirer.cash < 500) continue; // must have sufficient liquid balance sheet

    for (const target of activeCompanies) {
      if (target.ticker === acquirer.ticker || !isActiveCompany(target)) continue;
      if (target.sector !== acquirer.sector || target.region !== acquirer.region) continue;
      if (acquirer.marketCap < 3 * Math.max(1, target.marketCap)) continue;

      const isDistressed = distressedRatings.includes(target.creditRating) || target.leverage > 4.5 || target.interestCoverage < 1.2;
      const isUndervalued = target.marketCap < (target.annualRevenue * 0.4);
      if (!isDistressed && !isUndervalued) continue;

      // Probabilistic execution trigger: 20% when an eligible match is found
      if (Math.random() < 0.20) {
        const valStr = formatCurrency(target.marketCap * 1.15, { compact: true, precision: 1 });
        return {
          acquirerTicker: acquirer.ticker,
          targetTicker: target.ticker,
          title: `M&A: ${acquirer.name} Acquires ${target.name}`,
          description: `${acquirer.name} (${acquirer.ticker}) has agreed to acquire ${target.name} (${target.ticker}) in a 50% cash and 50% stock consolidation valued at ${valStr}.`,
        };
      }
    }
  }

  return null;
}
