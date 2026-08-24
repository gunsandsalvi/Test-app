export function generate52WeekHistory(currentVal: number, _volatility: number = 0.02, _minVal: number = 0.001): number[] {
  // Fix: In the initial state (Turn 1), historical data arrays start with only ONE realized data point.
  // Do NOT generate synthetic historical curves for past periods that never occurred in-game.
  return [currentVal];
}

/**
 * Initial Multi-Region Macro Setup
 */
