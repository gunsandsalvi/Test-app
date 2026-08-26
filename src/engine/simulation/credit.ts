import { CreditRating } from '../../types';

/**
 * Credit rating cutoffs are a geometric progression anchored on two structural constants
 * already used elsewhere in the simulation's own default logic: LEVERAGE_CEILING (the
 * debt/EBITDA multiple beyond which a firm cannot service its debt) and COVERAGE_FLOOR
 * (the interest-coverage level below which default is triggered — see the newCoverage < 0.8
 * default check in simulation/core.ts). Each notch up the rating scale requires a constant
 * proportional step of extra leverage headroom / coverage cushion (DECAY_RATIO), rather than
 * thresholds copied from any real rating agency's published scale.
 */
const LEVERAGE_CEILING = 9.0; // leverage at the CCC/default boundary
const COVERAGE_FLOOR = 0.8; // coverage at the CCC/default boundary
const DECAY_RATIO = 0.7; // proportional safety-margin step between adjacent rating notches

function leverageCutoff(notch: number): number {
  return LEVERAGE_CEILING * Math.pow(DECAY_RATIO, notch);
}
function coverageCutoff(notch: number): number {
  return COVERAGE_FLOOR / Math.pow(DECAY_RATIO, notch);
}

export function determineCreditRating(leverage: number, interestCoverage: number): CreditRating {
  if (interestCoverage < COVERAGE_FLOOR || leverage > LEVERAGE_CEILING) return 'CCC';
  if (interestCoverage < coverageCutoff(1) || leverage > leverageCutoff(1)) return 'B';
  if (interestCoverage < coverageCutoff(2) || leverage > leverageCutoff(2)) return 'BB';
  if (interestCoverage < coverageCutoff(3) || leverage > leverageCutoff(3)) return 'BBB';
  if (interestCoverage < coverageCutoff(4) || leverage > leverageCutoff(4)) return 'A';
  if (interestCoverage < coverageCutoff(5) || leverage > leverageCutoff(5)) return 'AA';
  return 'AAA';
}
