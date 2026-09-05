/**
 * What a share is worth to a holder — the one place that answers it.
 *
 * WS4 made the stock price a cleared price: 07e-equity-clearing.ts asks every holder for its own
 * fair value and the auction finds the level where the shares people want equal the shares
 * available. That makes this function the demand side of the entire equity market, so it lives
 * here rather than inside the clearing stage: the BOOTSTRAP has to open the market at the same
 * arithmetic the market itself uses.
 *
 * It did not, and the cost was measurable. Companies were seeded at `eps x sector basePE`, a
 * multiple table capitalising earnings at ~1.5% net of growth, while the holders in the auction
 * capitalise them at 4-10%. Week 1 therefore opened with every name roughly four times what any
 * participant would pay, and the market spent ten weeks falling at its damping limit to get back
 * — a cold-start artifact, not a market event (the plan's §7.4: seed shape must equal engine
 * shape).
 *
 * Everything below is a real primitive off the company's own statements. There is no multiple
 * looked up from a table, and deliberately nothing that depends on the share price — a valuation
 * that reads the price it is supposed to set is the circularity that broke ownership convergence
 * once already (#28).
 */

import { Company } from '../types';
import { annualDepreciationLocal, usefulLifeYearsOf } from '../domain/company-week/capital-programme';

/** §3.26-d: the premium is stated once, with the firm's cost of capital (`domain/company-week/
 *  cost-of-capital.ts`); re-exported here for the valuation's own readers. */
import { EQUITY_RISK_PREMIUM } from '../domain/company-week/cost-of-capital';
export { EQUITY_RISK_PREMIUM };
/**
 * The hurdle of a representative holder. 07e asks each entity for its OWN required return —
 * that disagreement is the market. This constant is for the two places where a valuation is
 * needed and there is no particular holder to ask: the bootstrap opening the market, and a board
 * deciding whether its own stock is cheap enough to buy back.
 */
export const REPRESENTATIVE_HOLDER_REQUIRED_RETURN = 0.10;
/** Ceiling on the growth a holder will capitalise, so no fair value runs to infinity. */
const MAX_CAPITALISED_GROWTH = 0.06;
/** The haircut a buyer really applies to the net assets of a business that is losing money. */
const LOSS_MAKER_NET_ASSET_HAIRCUT = 0.55;

interface EquityValuationInputs {
  /** Annual net income, in dollars. Real, off the income statement. */
  annualEarningsLocal: number;
  sharesOutstanding: number;
  /** Real book equity — the balance sheet's shareholders' equity where one exists. */
  bookEquityLocal: number;
  /**
   * The rate at which the business is really adding productive capacity: net investment (growth
   * capex less depreciation) over the net PP&E it already runs. This is the same primitive stage
   * 05 grows a product line's physical capacity by, so a company's valuation and its output move
   * off one number rather than two.
   *
   * Explicitly NOT a retention ratio times ROE: retention would have to come from dividends,
   * and dividends in this model are still derived from market cap — which would put the price
   * back inside its own valuation.
   */
  netInvestmentRate: number;
  /** The cleared 10-year yield: the real risk-free rate this week. */
  riskFreeRate: number;
  beta: number;
  /**
   * The return this particular holder needs on its own capital. Holders differ here and nowhere
   * else, and that disagreement is what gives the market's demand curve its slope.
   */
  holderRequiredReturn: number;
}

export function fairValuePerShare(inputs: EquityValuationInputs): number {
  const shares = Math.max(1, inputs.sharesOutstanding);
  const requiredReturn = Math.max(
    0.04,
    inputs.riskFreeRate + inputs.beta * EQUITY_RISK_PREMIUM + inputs.holderRequiredReturn * 0.25
  );

  if (!(inputs.annualEarningsLocal > 0)) {
    // No earnings to capitalise: what the equity is worth is what the business owns net of what
    // it owes, at a distress haircut. This is what retires pricing.ts's negative-EPS branch,
    // which priced a BIGGER loss HIGHER (|eps| x PE x 0.4).
    return Math.max(0, (Math.max(0, inputs.bookEquityLocal) * LOSS_MAKER_NET_ASSET_HAIRCUT) / shares);
  }

  const growth = Math.max(0, Math.min(MAX_CAPITALISED_GROWTH, inputs.netInvestmentRate));
  const discount = Math.max(0.015, requiredReturn - growth);
  return Math.max(0.01, (inputs.annualEarningsLocal / shares) / discount);
}

/**
 * The company's real growth rate: net investment (growth capex less the depreciation its own
 * asset base is running at) over the net PP&E it already operates — the same primitive stage 05
 * grows a product line's physical capacity by, so what a business is worth and what it can make
 * move off one number instead of two.
 */
export function companyNetInvestmentRate(comp: Company): number {
  const grossPPE = comp.grossPPELocal ?? 0;
  const netPPE = Math.max(1, grossPPE - (comp.accumulatedDepreciationLocal ?? 0));
  // §3.26-f-i: the one schedule, at the firm's own life.
  const depreciationAnnualLocal = annualDepreciationLocal(grossPPE, usefulLifeYearsOf(comp));
  return ((comp.growthCapex ?? 0) - depreciationAnnualLocal) / netPPE;
}

/** Real book equity: the balance sheet's own shareholders' equity where a filing exists. */
/**
 * §3.13-READ C1 — `totalDebtLocal` IS REQUIRED, and every caller names the read it made.
 *
 * It used to default to `totalDebtOf(comp)`, which sums `Company.debtTranches` — and that array
 * is materialised from the tranche store ONCE a week, at `core.ts:450`, AFTER every stage has
 * run. So mid-week it is the previous week's ladder, and three of this function's four callers
 * took the default: 07e priced every listed company's equity, `securities-lending` priced the
 * whole borrow book, and `pe-lifecycle` struck its takeout, all against a debt figure that 07b
 * and 07d had already changed ten stages earlier. A default that silently reads a stale mirror is
 * the shape rule 19 names; making the parameter required is what stops it coming back.
 */
export function companyBookEquityLocal(comp: Company, cashLocal: number, totalDebtLocal: number): number {
  // A BANK's book equity is the equity line of its own balance sheet, not a PP&E-and-cash
  // reckoning built for an operating company. Its assets are loans, securities and reserves and
  // its liabilities are deposits and borrowings; the generic formula below sees almost none of
  // that and would value a bank on its premises. The flow ledger keeps `bankEquityLocal` honest
  // (§7.36), so it is the real number and the one to read.
  if (comp.bankBalanceSheet) return comp.bankBalanceSheet.bankEquityLocal;
  const latest = comp.historicalFundamentals?.[comp.historicalFundamentals.length - 1];
  const filed = latest?.balanceSheet?.shareholdersEquity;
  if (filed !== undefined && isFinite(filed)) return filed;
  return (comp.grossPPELocal ?? 0) - (comp.accumulatedDepreciationLocal ?? 0) + cashLocal - totalDebtLocal;
}

/**
 * Convenience wrapper for callers holding a whole Company and pricing one name at a time. The
 * clearing stage does NOT use this: it prices every name against every holder, so it hoists the
 * two per-company derivations above out of its participants loop and calls fairValuePerShare
 * directly.
 */
export function companyFairValuePerShare(
  comp: Company,
  /** §5-WIRES A3.1: the firm's cash as the caller knows it — the account, or stage 08's
   *  mid-week walk. */
  cashLocal: number,
  riskFreeRate: number,
  holderRequiredReturn: number,
  /** §5-WIRES D / §3.13-READ C1: the ladder's face, read by the caller. Required — see
   *  `companyBookEquityLocal`; the default this had was last week's mirror. */
  totalDebtLocal: number,
  /** §3.13-BOOK dIV: the shares in issue, read by the caller off the instrument index. */
  sharesOutstanding: number
): number {
  if (comp.isDefaulted) return 0;
  return fairValuePerShare({
    annualEarningsLocal: comp.netIncome,
    sharesOutstanding,
    bookEquityLocal: companyBookEquityLocal(comp, cashLocal, totalDebtLocal),
    netInvestmentRate: companyNetInvestmentRate(comp),
    riskFreeRate,
    beta: comp.beta ?? 1,
    holderRequiredReturn,
  });
}
