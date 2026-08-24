import { Company } from '../../types';

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
    if (acquirer.isDefaulted || !igRatings.includes(acquirer.creditRating)) continue;
    if (acquirer.cash < 2 * Math.max(1, acquirer.totalDebt) && acquirer.totalDebt > 0) continue;
    if (acquirer.cash < 500) continue; // must have sufficient liquid balance sheet

    for (const target of activeCompanies) {
      if (target.ticker === acquirer.ticker || target.isDefaulted) continue;
      if (target.sector !== acquirer.sector || target.region !== acquirer.region) continue;
      if (acquirer.marketCap < 3 * Math.max(1, target.marketCap)) continue;

      const isDistressed = distressedRatings.includes(target.creditRating) || target.leverage > 4.5 || target.interestCoverage < 1.2;
      const isUndervalued = target.marketCap < (target.annualRevenue * 0.4);
      if (!isDistressed && !isUndervalued) continue;

      // Probabilistic execution trigger: 20% when an eligible match is found
      if (Math.random() < 0.20) {
        const valM = target.marketCap > 1e6 ? target.marketCap / 1e6 : target.marketCap;
        const valStr = valM >= 1000 ? `$${(valM * 1.15 / 1000).toFixed(1)}B` : `$${(valM * 1.15).toFixed(0)}M`;
        return {
          acquirerTicker: acquirer.ticker,
          targetTicker: target.ticker,
          title: `M&A: ${acquirer.name} Acquires ${target.name}`,
          description: `${acquirer.name} (${acquirer.ticker}) has agreed to acquire ${target.name} (${target.ticker}) in a cash-and-stock consolidation valued at ${valStr}.`,
        };
      }
    }
  }

  return null;
}
