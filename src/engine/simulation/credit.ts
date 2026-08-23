import { CreditRating } from '../../types';

export function determineCreditRating(leverage: number, interestCoverage: number): CreditRating {
  if (interestCoverage < 0.8 || leverage > 8.5) return 'CCC';
  if (interestCoverage < 1.4 || leverage > 6.5) return 'B';
  if (interestCoverage < 2.5 || leverage > 5.0) return 'BB';
  if (interestCoverage < 4.0 || leverage > 3.8) return 'BBB';
  if (interestCoverage < 7.0 || leverage > 2.8) return 'A';
  if (interestCoverage < 12.0 || leverage > 1.8) return 'AA';
  return 'AAA';
}

const SECTOR_PRICING_POWER: Record<string, number> = {
  Tech: 0.55,
  Financials: 0.85,
  Industrials: 0.70,
  Energy: 0.90,
  Consumer: 0.50,
  Healthcare: 0.65,
  Utilities: 0.95,
};

const SECTOR_WAGE_SENSITIVITY: Record<string, number> = {
  Tech: 0.6,
  Financials: 0.5,
  Industrials: 1.3,
  Energy: 0.9,
  Consumer: 1.4,
  Healthcare: 1.0,
  Utilities: 0.7,
};

/**
 * Create initial Game State
 */
