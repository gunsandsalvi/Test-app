/** The non-bank institutions — insurers, managers, pension funds, hedge funds, PE, money funds,
 *  ETFs — their mandates, their real books and the claims their beneficiaries hold on them. */

import { RegionId } from './geography';
import { FxForward } from './fx-hedging';
import { ItemizedHolding } from './banking';
import { FinancialStatementProfile } from './company';

export interface InstitutionalSector {
  corpBondHoldingsUSD: number;
  sovBondHoldingsUSD: number;
  equityHoldingsUSD: number;
  cashUSD: number;
  sectorEquityUSD: number;
  investmentIncomeMarginPct: number;
  itemizedHoldings: ItemizedHolding[];
}

/**
 * How much premium an insurer writes per dollar of its own capital — the premium-to-surplus ratio
 * every insurance regulator supervises, and the real limit on how fast an insurer can grow. Lives
 * here because the SEED and the weekly engine must read the same number: when they disagreed, the
 * bootstrap opened an insurer as an operating company and week 1 replaced its revenue with the
 * real premium base, which the harness reported as a 480x revenue runaway (§7.4's cold start,
 * §7.51). A structural primitive with one owner; it becomes an outcome in IND.
 */
export const PREMIUM_TO_SURPLUS_RATIO = 1.2;

export type InstitutionalEntityType = 'INSURER' | 'ASSET_MANAGER' | 'PENSION_FUND' | 'HEDGE_FUND' | 'PRIVATE_EQUITY' | 'MONEY_MARKET_FUND' | 'ETF';

/**
 * HF1 — what kind of hedge fund. One `HEDGE_FUND` type did every strategy at once: the same fund
 * was the entire elastic side of the FX market AND the distressed bid in corporate credit AND a
 * loan buyer, which is not a fund, it is four businesses on one balance sheet. An equity
 * long-short fund has no view on the yen. Real strategies are different books with different
 * counterparties and different ways of failing, so they get to be different entities.
 */
export type HedgeFundStrategy =
  /** Directional rates and FX — the elastic side of the FX market, and the only fund in it. */
  | 'GLOBAL_MACRO'
  /** Paired longs and shorts in equity. Needs a real short (borrow, locate, recall) to be whole. */
  | 'LONG_SHORT_EQUITY'
  /** The same in bonds and loans: the natural buyer of what the dealer desks cannot carry. */
  | 'LONG_SHORT_CREDIT'
  /** The marginal buyer at the wides, pricing off expected recovery rather than expected loss. */
  | 'DISTRESSED';

export interface AssetAllocationTarget {
  equityPct: number;
  corpBondPct: number;
  govBondPct: number;
  cashPct: number;
  // Real leveraged-loan allocation, carved out of the entity's total corporate-credit appetite
  // (corpBondPct + loanPct together represent that total) — loans and bonds of the same issuer
  // trade in genuinely different real markets with different investor bases (CLOs/loan funds vs
  // bond funds), so they get their own real clearing engine
  // (07d-leveraged-loan-clearing.ts) rather than being a byproduct of the bond one.
  loanPct: number;
}

export interface InstitutionalEntity {
  financialStatementProfile?: FinancialStatementProfile;
  id: string;
  name: string;
  ticker: string;
  region: RegionId;
  /** SETL5 — the bank this entity's cash sits at. An institution's balance is a bank's liability
   * like anyone else's; without this its money lived outside the banking system, which is the
   * blind spot that hid a 64B double-count (§7.90). */
  homeBankTicker?: string;
  entityType: InstitutionalEntityType;
  /** HF1 — set on HEDGE_FUND entities only; decides which markets this fund is actually in. */
  hedgeFundStrategy?: HedgeFundStrategy;
  /** HF1 — what this fund's prime broker will still lend it beyond what it has already drawn.
   *  Its purchasing capacity above its own cash, and the replacement for a leverage ALLOWANCE
   *  that no one granted and no one could withdraw. Written by the prime-brokerage stage. */
  primeBrokerageAvailableUSD?: number;
  totalAssetsUSD: number;
  equityCapitalUSD: number;
  /**
   * HH1 — what this institution owes its ultimate BENEFICIARIES: policyholder reserves, pension
   * entitlements, fund shares. A derived residual, `totalAssetsUSD - equityCapitalUSD`, carried
   * here so both sides of the claim are visible on the books that hold them.
   *
   * THE DIRECTION IS BACKWARDS, and it is load-bearing (§6.1, OWN6). In reality an institution's
   * assets exist BECAUSE it owes somebody: a pension fund is as big as its entitlements. Deriving
   * the liability from the assets means the sector's SIZE has no bottom-up anchor, which is why
   * `INSTITUTIONAL_OPENING_BOOK_SHARE` cannot yet be removed from the seed. Reverse it — build
   * the claim from the household side and size the entity from it — and that seed share goes.
   *
   * It was implicit and therefore owned by nobody. Measured at 740B across insurers, pension
   * funds and asset managers (§7.48): the asset existed on this sheet and the matching claim
   * existed nowhere, which is the same real thing represented once instead of twice. The holder
   * is the household sector (`householdState.institutionalClaims`), because in reality every
   * dollar of a reserve or an entitlement belongs to a person.
   *
   * Absent on the entity types whose liabilities already have named holders: money funds (WS7's
   * shareholders), ETFs (MS1's), and private equity (HC4's LP commitments).
   */
  beneficiaryLiabilityUSD?: number;
  /**
   * HH1b — what this entity's real book earned this week (`accrueInstitutionalIncome`). Recorded
   * so the listed shell's income statement can REPORT the income its own portfolio produced,
   * rather than computing a second, formula version of it from a different asset base.
   */
  lastWeeklyInvestmentIncomeUSD?: number;
  /**
   * HH1c — INSURER: premiums less claims less expenses over the last year. The sign is the whole
   * point: positive means the float is free and this insurer can accept a lower return on its
   * assets than anyone else. Read by `entityRequiredReturn`.
   */
  lastAnnualUnderwritingResultUSD?: number;
  /** HH1c — PENSION_FUND: benefits paid out over the last year, against the promises it holds. */
  lastAnnualBenefitOutflowUSD?: number;
  sharesOutstanding: number;
  stockPrice: number;
  itemizedHoldings: ItemizedHolding[];
  /**
   * Real, per-entity cash. Every fill this entity takes in a clearing stage settles against it,
   * so its securities and its money move together. Before this existed the entity's holdings
   * changed each week with nothing on the other side of the trade — a market on one side of the
   * ledger only.
   */
  cashUSD: number;
  /**
   * WS6 — cash this entity lent overnight in the general-collateral repo market this week
   * (stages/repo-clearing.ts). It matures back into cashUSD with interest at the start of the
   * next week's money-market session. Part of the entity's book (markInstitutionalBooks and
   * the S4 conservation check count it), NOT part of its weekly purchase capacity — the cash
   * is genuinely out the door for the week, and counting it twice would let the entity buy
   * securities with money it had already lent.
   */
  repoLentUSD?: number;
  /**
   * XB2 — the FX forwards hedging this entity's cross-border book. Real contracts with a named
   * bank on the other side, marked every week, not a discount applied to a yield.
   */
  fxForwards?: FxForward[];
  /** WS9/XB2d: last week's foreign holdings by issuer region, so this week's CHANGE is the real
   * cross-border settlement flow that has to buy or sell currency. */
  priorForeignHoldingsByRegion?: Record<string, number>;
  /**
   * MONEY_MARKET_FUND only (WS7): the fund's share liabilities at its fixed $1 NAV — every
   * dollar of shares is a dollar some real holder (a corporate treasury's `mmfSharesUSD`, the
   * household boundary) put in. Assets (cash + bills + repo/RRP claims) exceed shares by the
   * fund's own retained fee income; the yield PAID to holders is the real asset yield minus
   * the fee.
   */
  mmfSharesOutstandingUSD?: number;
  /** MONEY_MARKET_FUND only: last week's realised annualised yield net of fee — the number
   * deposits compete against. Rule 9: annualised decimal. */
  mmfNetYieldAnnual?: number;
  assetAllocationTarget: AssetAllocationTarget;
  /**
   * PRIVATE_EQUITY only (HC4): the fund's real portfolio and the real LPs behind it. Portfolio
   * companies are private firms whose ownership block names this fund as sponsor; the stakes'
   * value is marked from those firms' real EBITDA and debt. Committed-but-undrawn capital is a
   * real claim on the named LPs — HC6's deal flow draws it, debiting LP cash through the same
   * budget machinery as any other real payment.
   */
  peFund?: {
    portfolioCompanyIds: string[];
    lpCommitments: { lpEntityId: string; committedUSD: number; drawnUSD: number }[];
  };
  /**
   * ETF only: the fund's index, its sponsor, its share count and the residual the authorised
   * participants could not arbitrage away this week. An ETF holds its basket for real in
   * `itemizedHoldings`, so it is an ordinary holder in every clearing book — not a wrapper
   * around one.
   */
  etf?: import('./etf').EtfFund;
  isDefaulted: boolean;
  historicalPrices: number[];
  revenueHistory?: number[];
}
