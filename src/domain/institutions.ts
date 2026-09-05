/** The non-bank institutions — insurers, managers, pension funds, hedge funds, PE, money funds,
 *  ETFs — their mandates, their real books and the claims their beneficiaries hold on them. */

import { RegionId } from './geography';
import { ItemizedHolding } from './banking';
import { FinancialStatementProfile } from './company';
import type { EntityId } from './ids';
import type { Ticker } from './ids';

export interface InstitutionalSector {
  corpBondHoldingsLocal: number;
  sovBondHoldingsLocal: number;
  equityHoldingsLocal: number;
  cashLocal: number;
  sectorEquityLocal: number;
  investmentIncomeMarginPct: number;
  itemizedHoldings: ItemizedHolding[];
}

/**
 * How much premium an insurer writes per dollar of its own capital — the premium-to-surplus ratio
 * every insurance regulator supervises, and the real limit on how fast an insurer can grow. Lives
 * here because the SEED and the weekly engine must read the same number: when they disagreed, the
 * bootstrap opened an insurer as an operating company and week 1 replaced its revenue with the
 * real premium base, which the harness reported as a 480x revenue runaway (cold start,
 * ). A structural primitive with one owner; it becomes an outcome in IND.
 */
export const PREMIUM_TO_SURPLUS_RATIO = 1.2;

/**
 * The capital a regulated institution holds against its book — a real regulatory primitive of the
 * same kind as the bank leverage floor (rule 2 allows those). It had no owner: the seed wrote
 * `totalAssets x 0.12` with the ratio inline and a `// 12% capital ratio` comment, and COH2 needs
 * it in two places now — sizing a fund from what it OWES is `liability / (1 - this)`.
 */
export const INSTITUTIONAL_CAPITAL_RATIO = 0.12;

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
  | 'DISTRESSED'
  /** §3.17e-ii-a — two prices for one risk: reads the registry of comparables and trades both legs. */
  | 'RELATIVE_VALUE';

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

/** The mandate percent for one investable class, as a LOOKUP rather than the two
 *  divergent if-chains that used to pick it (etf-flows and institutional-balance-sheet each
 *  had their own, and a new class would silently fall through to `loanPct` in one of them).
 *  A new investable class fails to compile here until its mandate line is named. */
type InvestableClass = 'EQUITY' | 'CORP_BOND' | 'GOV_BOND' | 'LEVERAGED_LOAN';
const MANDATE_FIELD: Record<InvestableClass, keyof AssetAllocationTarget> = {
  EQUITY: 'equityPct',
  CORP_BOND: 'corpBondPct',
  GOV_BOND: 'govBondPct',
  LEVERAGED_LOAN: 'loanPct',
};
export const mandatePctOf = (t: AssetAllocationTarget, cls: InvestableClass): number =>
  t[MANDATE_FIELD[cls]];

export interface InstitutionalEntity {
  /** This entity's board: the two preference primitives (domain/preferences.ts). */
  management?: import('./preferences').Preferences;
  financialStatementProfile?: FinancialStatementProfile;
  /**
   * §3.13-BOOK slice (c2b) — THE INSTITUTION'S IDENTITY, in the same space a firm's now lives in.
   * `PartyRef`'s INSTITUTION arm keys by this, and so does every register book head, so branding
   * it is what lets the compiler refuse a ticker or a participant id where a holder belongs.
   */
  id: EntityId;
  name: string;
  ticker: Ticker;
  region: RegionId;
  /** The bank this entity's cash sits at. An institution's balance is a bank's liability
   * like anyone else's; without this its money lived outside the banking system, which is the
   * blind spot that hid a 64B double-count. */
  homeBankId?: EntityId;
  entityType: InstitutionalEntityType;
  /** HF1 — set on HEDGE_FUND entities only; decides which markets this fund is actually in. */
  hedgeFundStrategy?: HedgeFundStrategy;
  /** HF1 — what this fund's prime broker will still lend it beyond what it has already drawn.
   *  Its purchasing capacity above its own cash, and the replacement for a leverage ALLOWANCE
   *  that no one granted and no one could withdraw. Written by the prime-brokerage stage. */
  primeBrokerageAvailableLocal?: number;
  // D: total assets are a READ — `institutionTotalAssetsLocal` (domain) over the book's
  // rows, cash, receivables and the sponsor's portfolio mark; never a stored mark.
  equityCapitalLocal: number;
  /**
   * What this institution owes its ultimate BENEFICIARIES: policyholder reserves, pension
   * entitlements, fund shares. A derived residual, `totalAssetsLocal - equityCapitalLocal`, carried
   * here so both sides of the claim are visible on the books that hold them.
   *
   * THE DIRECTION IS BACKWARDS, and it is load-bearing. In reality an institution's
   * assets exist BECAUSE it owes somebody: a pension fund is as big as its entitlements. Deriving
   * the liability from the assets means the sector's SIZE has no bottom-up anchor, which is why
   * `INSTITUTIONAL_OPENING_BOOK_SHARE` cannot yet be removed from the seed. Reverse it — build
   * the claim from the household side and size the entity from it — and that seed share goes.
   *
   * It was implicit and therefore owned by nobody. Measured at 740B across insurers, pension
   * funds and asset managers: the asset existed on this sheet and the matching claim
   * existed nowhere, which is the same real thing represented once instead of twice. The holder
   * is the household sector (`householdState.institutionalClaims`), because in reality every
   * dollar of a reserve or an entitlement belongs to a person.
   *
   * Absent on the entity types whose liabilities already have named holders: money funds (WS7's
   * shareholders), ETFs (MS1's), and private equity (HC4's LP commitments).
   */
  beneficiaryLiabilityLocal?: number;
  /**
   * HH1b — what this entity's real book earned this week (`accrueInstitutionalIncome`). Recorded
   * so the listed shell's income statement can REPORT the income its own portfolio produced,
   * rather than computing a second, formula version of it from a different asset base.
   */
  lastWeeklyInvestmentIncomeLocal?: number;
  /**
   * HH1c — INSURER: premiums less claims less expenses over the last year. The sign is the whole
   * point: positive means the float is free and this insurer can accept a lower return on its
   * assets than anyone else. Read by `entityRequiredReturn`.
   */
  lastAnnualUnderwritingResultLocal?: number;
  /** HH1c — PENSION_FUND: benefits paid out over the last year, against the promises it holds. */
  lastAnnualBenefitOutflowLocal?: number;
  /** §3.16b-i — INSURER: its book, its price and its own loss experience (`InsuranceBook`). Opened
   *  by its profile the first week it writes, moved by the market (16b-ii). */
  insurance?: InsuranceBook;
  // §3.13-BOOK dIV: a fund's shares in issue live on the instrument index, never here.
  stockPrice: number;
  itemizedHoldings: ItemizedHolding[];
  /**
   * Real, per-entity cash. Every fill this entity takes in a clearing stage settles against it,
   * so its securities and its money move together. Before this existed the entity's holdings
   * changed each week with nothing on the other side of the trade — a market on one side of the
   * ledger only. A3.2: the balance is the entity's ACCOUNT (`entityCashOf`,
   * engine/ledger/accounts.ts), not a field.
   */
  /**
   * Cash this entity lent overnight in the general-collateral repo market this week
   * (stages/repo-clearing.ts). It matures back into cashLocal with interest at the start of the
   * next week's money-market session. Part of the entity's book (markInstitutionalBooks and
   * the S4 conservation check count it), NOT part of its weekly purchase capacity — the cash
   * is genuinely out the door for the week, and counting it twice would let the entity buy
   * securities with money it had already lent.
   */
  repoLentLocal?: number;
  /**
   * Cash parked at the central bank's overnight reverse repo window this week, at the rate it
   * was struck at. The administered floor is a real facility, so the money genuinely leaves the
   * account: like `repoLentLocal` it is part of the entity's book and not part of its purchase
   * capacity, and it returns with interest at the start of the next money-market session.
   */
  rrpLentLocal?: number;
  rrpRateAnnual?: number;
  /** HF — this entity's stock-loan book, netted to one number the way `repoLentLocal` nets the repo
   * one. Positive for whichever side the mark has moved toward; a short's P&L lives here.
   * Derived every week from the region's loan book — never set by hand. */
  stockLoanNetLocal?: number;
  /** WS9/XB2d: last week's foreign holdings by issuer region, so this week's CHANGE is the real
   * cross-border settlement flow that has to buy or sell currency. */
  priorForeignHoldingsByRegion?: Record<string, number>;
  /**
   * MONEY_MARKET_FUND only (WS7): the fund's share liabilities at its fixed $1 NAV — every
   * dollar of shares is a dollar some real holder (a corporate treasury's `mmfSharesLocal`, the
   * household boundary) put in. Assets (cash + bills + repo/RRP claims) exceed shares by the
   * fund's own retained fee income; the yield PAID to holders is the real asset yield minus
   * the fee.
   */
  mmfSharesOutstandingLocal?: number;
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
    /** §3.13-BOOK slice (c2a): the firms this sponsor owns. */
    portfolioCompanyIds: EntityId[];
    // §3.13-BOOK d4c-vi: the LPs' commitments are rows of the world's contract store, read
    // through `contract-ledger.ts:lpCommitmentsOf`; not a field.
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

/**
 * AN INSTITUTION'S TOTAL ASSETS ARE A READ, never a stored mark: its cash, what it is owed this
 * week (the unsettled legs of its trades and receipts), its overnight cash lent to banks and to
 * the central bank's window, its stock-loan book, its securities — the register's rows — or, for
 * a sponsor, its portfolio companies at the public comparable, and (§3.13f) the coupon ACCRUED on
 * those rows and not yet paid by a date: a receivable, an asset, the same line a bank carries as
 * `sovereignAccruedCouponLocal` and read off the same ledger. Without it an institution that paid
 * a seller's accrued at settlement (13b) had the cash gone and nothing standing against it until
 * the coupon date, and every week it accrued was income on no sheet. The stored `totalAssetsLocal`
 * this replaces was a week-end mark of exactly this sum, read a week stale by every sizing pass.
 */
export function institutionTotalAssetsLocal(
  e: { repoLentLocal?: number; rrpLentLocal?: number; stockLoanNetLocal?: number; entityType: InstitutionalEntityType; peFund?: unknown },
  cashLocal: number, bookLocal: number, pendingLocal: number, portfolioLocal: number, accruedLocal: number
): number {
  return cashLocal + pendingLocal + (e.repoLentLocal ?? 0) + (e.rrpLentLocal ?? 0) + (e.stockLoanNetLocal ?? 0)
    + (e.entityType === 'PRIVATE_EQUITY' && e.peFund ? portfolioLocal : bookLocal) + accruedLocal;
}

/** The seed's read, before the register exists: cash plus the entity's own itemized rows. */
export function seedInstitutionTotalAssetsLocal(e: { itemizedHoldings: { quantityOrNotionalLocal?: number }[] }, openingCashLocal: number): number {
  return openingCashLocal + e.itemizedHoldings.reduce((a, h) => a + (h.quantityOrNotionalLocal ?? 0), 0);
}

/**
 * §3.16b — INSURANCE IS A MARKET, NOT THREE PRICE-TAKERS. An insurer carries a BOOK of cover, it
 * QUOTES a price for that cover, and the price answers its OWN losses and its OWN capital. The
 * pool it used to be handed pro rata by capital, at a premium its capital let it write, was
 * three price-takers with no price between them.
 */
export interface InsuranceBook {
  /** The cover it carries: the insurable base (a firm's plant and revenue, a household's net
   *  worth and income) its policies stand behind — the unit a policy is written on. */
  coverLocal: number;
  /** The premium rate per unit of cover it QUOTES for the coming week, annual: its price. */
  rateAnnual: number;
  /** Claims per unit of cover it has EXPERIENCED on its own book, annual, trailing over the term
   *  of a policy (`INSURANCE_POLICY_TERM_WEEKS`) — the first term of its price. */
  lossPerCoverAnnual: number;
}

/** A policy runs a year: the window an insurer's own experience is read over, and (16b-ii) the
 *  share of its book that re-shops each week. */
const INSURANCE_POLICY_TERM_WEEKS = 52;

/** What a firm has to lose, and therefore insures: its plant and the revenue that runs through it. */
export const corporateInsurableBaseLocal = (c: { grossPPELocal?: number; annualRevenue: number }): number =>
  Math.max(0, c.grossPPELocal ?? 0) + Math.max(0, c.annualRevenue);

/** What a household sector has to lose: its net worth and its income. */
export const householdInsurableBaseLocal = (netWorthLocal: number, incomeLocal: number): number =>
  Math.max(0, netWorthLocal) + Math.max(0, incomeLocal);

/**
 * THE QUOTE. A unit of cover must earn the claims it is expected to bring PLUS the return on the
 * surplus the insurer has to hold against it: it holds `1 / premiumToSurplus` of surplus per unit
 * of premium, and that surplus must earn its hurdle. So `rate = loss + hurdle × rate / PSR`, and
 * the rate solves to `loss / (1 − hurdle / PSR)`. An insurer with worse experience, or a higher
 * hurdle, quotes higher — and (16b-ii) loses the policy to the one that quotes lower.
 */
export function quoteInsuranceRate(args: { lossPerCoverAnnual: number; requiredReturnAnnual: number; premiumToSurplus: number }): number {
  const charge = args.requiredReturnAnnual / args.premiumToSurplus;
  if (!(charge < 1)) throw new Error(`insurance quote: a hurdle of ${args.requiredReturnAnnual} over a premium-to-surplus of ${args.premiumToSurplus} leaves no rate that earns it`);
  return Math.max(0, args.lossPerCoverAnnual) / (1 - charge);
}

/** The insurer's experience moves one policy-term's step toward what its book actually cost it. */
export function nextLossPerCover(trailingAnnual: number, realisedAnnual: number, termWeeks: number = INSURANCE_POLICY_TERM_WEEKS): number {
  return trailingAnnual + (realisedAnnual - trailingAnnual) / termWeeks;
}

/**
 * THE BOOK OPENS at what the seed stated: the region's cover split across its insurers by their
 * capital (what the pool did), at the one rate that makes the region's premiums what its
 * insurers' capital let them write (`PREMIUM_TO_SURPLUS_RATIO`), with the experience the seed's
 * loss ratio implies at that rate. From here every number is the insurer's own.
 */
export function openInsuranceBook(args: {
  regionBaseLocal: number;
  ownSurplusLocal: number;
  regionSurplusLocal: number;
  seedLossRatio: number;
}): InsuranceBook {
  const share = args.regionSurplusLocal > 0 ? Math.max(0, args.ownSurplusLocal) / args.regionSurplusLocal : 0;
  const regionPremiumsAnnual = Math.max(0, args.regionSurplusLocal) * PREMIUM_TO_SURPLUS_RATIO;
  const rateAnnual = args.regionBaseLocal > 0 ? regionPremiumsAnnual / args.regionBaseLocal : 0;
  return { coverLocal: args.regionBaseLocal * share, rateAnnual, lossPerCoverAnnual: rateAnnual * args.seedLossRatio };
}

/**
 * §3.16b-ii — THE MARKET. A policy moves to the insurer that prices lower. Each week the slice
 * of every book that RENEWS (a year's policies, one week's worth at a time) and the growth of
 * what there is to insure re-shop: they go to the lowest quote with CAPACITY — the cover an
 * insurer's surplus can stand behind at its own rate, `surplus × premiumToSurplus / rate`, less
 * what it keeps — and past that to the next lowest. An insurer with no surplus has no capacity
 * and loses its renewals: it loses book before it loses its licence. Cover nobody can write is
 * unplaced, and pays nobody a premium.
 */
export function placeInsuranceRenewals(
  insurers: readonly { id: string; coverLocal: number; rateAnnual: number; surplusLocal: number }[],
  regionBaseLocal: number,
  termWeeks: number = INSURANCE_POLICY_TERM_WEEKS,
  premiumToSurplus: number = PREMIUM_TO_SURPLUS_RATIO,
): { coverById: Map<string, number>; unplacedLocal: number } {
  const base = Math.max(0, regionBaseLocal);
  const retained = new Map<string, number>();
  let retainedTotal = 0;
  insurers.forEach((i) => { const keep = Math.max(0, i.coverLocal) * (1 - 1 / termWeeks); retained.set(i.id, keep); retainedTotal += keep; });
  // What there is to insure fell faster than a term's renewals: every book keeps its share of it.
  const squeeze = retainedTotal > base && retainedTotal > 0 ? base / retainedTotal : 1;
  let pool = base - retainedTotal * squeeze;
  const coverById = new Map<string, number>();
  insurers.forEach((i) => coverById.set(i.id, (retained.get(i.id) ?? 0) * squeeze));
  const byPrice = [...insurers].sort((a, b) => a.rateAnnual - b.rateAnnual || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const i of byPrice) {
    if (!(pool > 0)) break;
    // Nobody sells cover for nothing: a quote of zero (no loss experience at all) writes nothing.
    const capacity = i.rateAnnual > 0 ? Math.max(0, (Math.max(0, i.surplusLocal) * premiumToSurplus) / i.rateAnnual - (coverById.get(i.id) ?? 0)) : 0;
    const take = Math.min(pool, capacity);
    if (take > 0) { coverById.set(i.id, (coverById.get(i.id) ?? 0) + take); pool -= take; }
  }
  return { coverById, unplacedLocal: Math.max(0, pool) };
}
