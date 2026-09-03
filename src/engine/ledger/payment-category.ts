/**
 * §7.276 — THE REASON-CATEGORY ENUM BESIDE `pay()`'s FREE TEXT (Tier-2, §5-STRUCT).
 *
 * Every payment names its reason as free text — good for tracing a dollar, useless for asking
 * "how much of this week's flow is debt service?" and unable to catch a typo'd or orphaned
 * label. This module is the closed set the free text rolls up to: an ordered rule table maps
 * every reason the engine writes to one of nine flow categories. A reason no rule matches
 * classifies as UNCLASSIFIED, and the harness asserts there are none — so a new payment reason
 * must land a rule here (usually one prefix) before a run is green. The free text stays the
 * ledger key; the category is the aggregate view beside it.
 */

export const PAYMENT_CATEGORIES = [
  /** Real goods and services changing hands: auctions, contracts, freight, opex. */
  'GOODS_AND_SERVICES',
  /** Compensation of employees, public and private. */
  'LABOR',
  /** Taxes and government transfers — flows that redistribute, not exchange. */
  'TAX_AND_TRANSFER',
  /** Insurance and pension flows: premiums in, claims and benefits out. */
  'INSURANCE_AND_PENSION',
  /** Interest, coupons, principal repayment and redemption — servicing existing debt. */
  'DEBT_SERVICE',
  /** New credit being drawn: originations, revolver/overdraft/repo/PB draws, trade credit. */
  'CREDIT_CREATION',
  /** Securities changing hands: clearing legs, primary issuance, fund flows, derivatives legs. */
  'SECURITIES',
  /** Equity distributions and corporate events: dividends, buybacks, mergers, estates, births. */
  'CORPORATE_ACTION',
  /** Intermediation charged for itself: dealer/underwriting/management/borrow fees. */
  'FINANCIAL_FEES',
  /** No rule matched. The harness asserts this set is EMPTY every run. */
  'UNCLASSIFIED',
] as const;

export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number];

/** Ordered: first match wins, so put the specific (fees) before the general (securities). */
const RULES: ReadonlyArray<readonly [RegExp, PaymentCategory]> = [
  // -- Fees before the books they ride on --
  [/dealer fee|underwriting|management fee|expense ratio|borrow fee|distribution margin|conversion spread|drawn from the vehicle|borne by the vehicle/, 'FINANCIAL_FEES'],
  // §3.13c-FX: buying and selling a currency is one asset exchanged for another at a market
  // price, which is this list's SECURITIES. The pip charged on it is priced into the two legs,
  // so it needs no separate row — `fx conversion spread` above is stage 05's own, separate charge.
  [/fx conversion: /, 'SECURITIES'],

  // -- Labor --
  [/wages|payroll/, 'LABOR'],

  // -- Taxes and transfers --
  [/tax|government transfers|central bank remittance|covers the central bank's loss/, 'TAX_AND_TRANSFER'],

  // -- Insurance and pension --
  [/insurance|pension/, 'INSURANCE_AND_PENSION'],

  // -- Fund-share and derivatives legs whose labels would otherwise read as debt service --
  [/etf |money fund|swap settlement/, 'SECURITIES'],

  // -- Debt service: interest, coupons, principal coming home --
  [/interest|coupon|redeem|redemption|redeemed|commercial paper matured|principal (repaid|retired|paydown)|paydown to holders|debt prepayment|deleveraging|facility prepaid|term-out|call premium|funding repaid|loan repaid/, 'DEBT_SERVICE'],

  // -- Credit creation: new money being drawn --
  [/revolver|overdraft|loan origination|trade credit|prime brokerage|repo (drawdown|maturity|collateral)|maintenance funding|facility draw|funding raised|central bank loan drawn/, 'CREDIT_CREATION'],

  // -- Corporate actions and equity distributions --
  [/dividend|buyback|merger|estate|resolution:|firm birth|divestiture|sponsor-to-sponsor|dividend recap|capital call|fund distribution|FDI: subsidiary|repatriated/, 'CORPORATE_ACTION'],

  // -- Securities: clearing legs, primary, funds, collateral, derivatives; §5-WIRES W2 the asset
  // wires share the reason table (desk fills, the paying agent's pro-rata actions) --
  [/clearing|primary|proceeds|placement|desk fill|commercial paper placed|paper (placed|retired) pro rata|shares (placed|retired) by the issuer|shares (cancelled|issued)|security payment|holder of record|etf |shares created|money fund|dealer inventory|stock loan|collateral|variation margin|initial margin|close-out|derivative settled|futures|CDS|cash slice|tender|ISSUE_CHEAP_DEBT|DELEVER_EXPENSIVE_DEBT|accretive call|seed: (ladder|book) opened|stock loan: shares delivered/, 'SECURITIES'],

  // -- Goods, services, and the operating boundary --
  [/goods|contract|freight|procurement|invoice|opex|operating receipts|carrying cost|delivery|consign|damages|settled (purchases|sales)|household purchase|inventory/, 'GOODS_AND_SERVICES'],

  // -- Named legacy/edge labels that fit no phrase family --
  [/^NONE$|opening balance|cash absorbed|net income accrual|liquidity shortfall|withdrawn refinancing/, 'CORPORATE_ACTION'],
];

export function categoryOfReason(reason: string): PaymentCategory {
  for (const [re, cat] of RULES) if (re.test(reason)) return cat;
  return 'UNCLASSIFIED';
}
