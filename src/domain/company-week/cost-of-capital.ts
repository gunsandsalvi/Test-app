/**
 * §3.26-d — ONE OWNER OF WHAT A FIRM'S CAPITAL REQUIRES.
 *
 * The return a firm's plant must earn was stated in four places, three ways: the labour stage's
 * `10Y + β × premium × risk aversion`, the freight and commodity books' `10Y + β × premium`, and
 * the goods auction's seller floor at a bare `0.05 + pd × 0.60` — a stated hurdle and a stated
 * loss-given-default beside the cost of capital the same firm was already charged with elsewhere
 * (rule 4, and rule 2's bare constant). It is one read now: the region's own long rate, plus the
 * equity premium on the firm's own beta, weighted by what THIS management requires of its plant —
 * a risk-averse board wants more for the same beta (`domain/preferences.ts`).
 */
import { plantNetLocal, type PlantVintage } from '../plant';
import { Preferences, riskAversionOf } from '../preferences';

/** Compensation for equity's residual risk, over the holder's own cost of capital. Stated once. */
export const EQUITY_RISK_PREMIUM = 0.035;

/** The rate capital is measured against in a region: its own ten-year point, the policy rate
 *  before a curve exists. */
export function riskFreeRateOf(reg: { zeroRates?: { tenor10Y: number }; policyRate: number }): number {
  return reg.zeroRates?.tenor10Y ?? reg.policyRate;
}

/** What this firm's capital requires, annual: the risk-free rate plus the premium on its own
 *  beta at its own management's risk aversion. Never negative. */
export function costOfCapitalOf(firm: { beta?: number; management?: Preferences }, riskFreeRate: number): number {
  return Math.max(0, riskFreeRate + (firm.beta ?? 1) * EQUITY_RISK_PREMIUM * riskAversionOf(firm.management));
}

/** The weekly charge the firm's net plant carries at that rate — the cost of holding it a week.
 *  §3.26-f-ii: the net plant is a read of the register at `week`. */
export function weeklyCapitalChargeLocal(
  firm: { beta?: number; management?: Preferences; plant: readonly PlantVintage[] },
  riskFreeRate: number,
  week: number
): number {
  return (plantNetLocal(firm.plant, week) * costOfCapitalOf(firm, riskFreeRate)) / 52;
}
