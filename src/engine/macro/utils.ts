import { random } from '../rng';
export function generate52WeekHistory(currentVal: number, volatility: number = 0.02, minVal: number = 0.001): number[] {
  const result: number[] = new Array(52);
  let val = currentVal;
  result[51] = val;
  for (let i = 50; i >= 0; i--) {
    const change = (random() - 0.5) * volatility;
    val = Math.max(minVal, val * (1 + change));
    result[i] = val;
  }
  return result;
}

/**
 * Initial Multi-Region Macro Setup
 */
