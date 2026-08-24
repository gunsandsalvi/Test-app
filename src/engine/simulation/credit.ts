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

/**
 * Create initial Game State
 */
