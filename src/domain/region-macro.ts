/** A region: its macro aggregates, its households (cohorts, balance sheet, credit), its labor
 *  market, its housing stock, its government's debt, its banks and institutions, and its weather. */

import { RegionId } from './geography';

import { Industry } from './industry';
import { CentralBank } from './central-bank';
import { BankingSectorView, AssetOwnershipShares } from './banking';
import { InstitutionalSector } from './institutions';
import { CategoryDemandState, SupplyRelationship } from './market-microstructure';
import type { DebtTranche } from './company';
import type { EntityId } from './ids';

export type WealthTier = 'BOTTOM_50' | 'NEXT_40' | 'TOP_9' | 'TOP_1';

export interface WealthTierData {
  shareOfHouseholds: number;
  shareOfIncomeLocal: number;
  shareOfNetWorthLocal: number;
  /** HH4c — last week's marked net worth, so the tier wealth effect reads a real CHANGE. */
  priorNetWorthLocal?: number;
  savingsRate: number;
  /**
   * DIST/COH — this tier's CUMULATIVE saving, the stock its deposit share is derived from.
   *
   * "Who holds deposits is whose savings accumulated" is §5-COH's own sentence, and it was not
   * true: the deposit split was a stated weight applied to the aggregate every week, so a tier
   * that saved more never got richer and the wealth distribution could not respond to the one
   * thing that produces it (rule 2). This accumulates the per-tier saving the cohorts already
   * measure, and the share is its outcome.
   */
  accumulatedSavingsLocal?: number;
  /**
   * COH1 — WHAT IS SPENDABLE NOW, AND WHAT IS ACCUMULATED. Two stocks, because they are two
   * things, and one number was doing both jobs.
   *
   * `accumulatedSavingsLocal` above drove the DEPOSIT split, the equity-like split, the private-
   * business split and the institutional-claims split — every asset class at once, off one stock
   * that only ever tracked the saving FLOW and never where the saving went. A tier that put
   * everything into a house and a pension therefore looked as liquid as one that held cash.
   *
   * The saving is allocated as it arrives, by the tier's own measured appetite for risky illiquid
   * ownership: what it does not put at risk stays LIQUID, the rest is INVESTED. Dissaving runs
   * the other way and draws the liquid stock FIRST — a household spends its buffer before it
   * sells anything, which is what makes forced selling (§7.166) a thing that happens at the end
   * of a squeeze rather than at the start of one.
   *
   * This is what the buffer rule needs to have something to be a buffer OF, and it makes the
   * wealthy-hand-to-mouth middle causal: house-rich and pension-rich is a large INVESTED stock
   * and a small LIQUID one, so the tier sits below its buffer and saves out of income like a poor
   * household. `accumulatedSavingsLocal` remains their sum.
   */
  liquidSavingsLocal?: number;
  investedSavingsLocal?: number;
  /**
   * RULE 19 — this tier's MEASURED debt and institutional claims, so the cohort build can weight
   * by them instead of by a stated table.
   *
   * `TIER_DEBT_SERVICE_WEIGHT` and `TIER_RESIDUAL_RECEIPT_WEIGHT` were four numbers each, and the
   * debt one carried its own exit condition: *"a stated primitive until HH4c gives cohorts their
   * own balance sheets and the split derives."* §7.145 gave them balance sheets. These are the
   * split, measured where the balance sheets are built.
   */
  debtLocal?: number;
  institutionalClaimsLocal?: number;
  equityExposureShare: number;
  homeEquityLocal?: number;
}

/**
 * HH4 — one household cohort: an occupation x wealth-tier cell. ~20 per region. Every dollar
 * figure is an ANNUAL flow (rule 8). The cohorts are the SOURCE for the household cross-section:
 * tier income shares, the savings cross-section, the spend-mix shares and the per-cohort
 * debt-service burden are all derived sums over them, replacing the drift formulas that used to
 * evolve those numbers beside the aggregates they claimed to decompose.
 *
 * What they do NOT yet do (HH4b): pay debt service out of the consumption budget (needs the
 * dividend/interest recycle to households to be real first, or it is a one-sided demand leak —
 * the HH1c lesson), bid per-cohort in stage 05, or hold per-cohort balance sheets.
 */
export interface HouseholdCohort {
  occupation: OccupationType;
  tier: WealthTier;
  /** Earners (employed + unemployed), not persons — one earner per labor-force member. */
  earnerCount: number;
  employedCount: number;
  wageIncomeLocal: number;
  unemploymentBenefitsLocal: number;
  /** Means-tested government transfers beyond unemployment benefits. */
  transferIncomeLocal: number;
  /** Still the aggregate constant share allocated by tier equity exposure — real dividend and
   * interest receipts are HH4b's, with the S1 seed identity re-derived when they land. */
  capitalIncomeLocal: number;
  grossIncomeLocal: number;
  taxLocal: number;
  disposableIncomeLocal: number;
  /** This cohort's share of the real HH3 debt service — recorded burden, not yet a budget
   * debit (see the interface comment). */
  debtServiceLocal: number;
  savingsLocal: number;
  /** PUB1c — the consumption tax inside this cohort's budget, remitted by merchants. */
  consumptionTaxLocal: number;
  consumptionBudgetLocal: number;
}

export type LifeCycleStage = 'EARLY_CAREER' | 'PEAK_EARNING' | 'PRE_RETIREMENT' | 'RETIRED';

/**
 * RULE 19 — `savingsRate` and `consumptionMultiplier` are GONE from this type.
 *
 * Eight stated numbers describing how much each age saves and consumes, read by NOTHING (§7.169):
 * only `RETIRED.shareOfPopulation` was ever used, and only to set a death rate. They were SHAPE
 * parameters — a claim about the answer — and wiring them in would have put back one level down
 * exactly what §7.165 removed at the aggregate.
 *
 * The life-cycle saving rate is DERIVED instead, and it has no free parameter: a household saves
 * to fund the years it will not earn, so with `w` of adult life working and `r` retired and smooth
 * consumption, the working-life saving rate is `r/(w+r)` — and since `w + r = 1` across the
 * population, **it IS the retired share**, which this type already carries and which the model
 * already evolves from real births and deaths.
 */
export interface LifeCycleStageData {
  shareOfPopulation: number;
}

/**
 * People per household. A demographic primitive with one owner, used to turn a population into a
 * count of dwellings; it becomes an outcome in HH4, where cohorts are real and a household is
 * something that forms rather than a divisor.
 */
export const AVERAGE_HOUSEHOLD_SIZE = 2.5;

export interface HousingMarket {
  regionId: RegionId;
  medianHomePriceLocal: number;
  baselineHomePriceLocal: number;
  priceIndex: number;
  historicalPrices: number[];
  /**
   * §3.26b-i — THE DWELLING REGISTER: the household sector's owner-occupied dwellings, in UNITS.
   * Seeded once as the seed's opening share of households (`createHousingMarket`) and moved
   * only by what changes hands — a household's purchase of a new dwelling at the goods auction
   * (`05-unit-bidding.ts`, a HOUSE wire), later a foreclosure and an estate's sale. The ownership
   * rate and the stock's value are READS of it (`domain/housing.ts`); the rate was a constant
   * written once, so the stock moved only with the population and construction never entered it.
   */
  ownerOccupiedUnits: number;
  mortgageOriginationVolumeLocal: number;
  /**
   * HSG — the BEST mortgage quote in this region last week, annual.
   *
   * A borrower shops, so the going rate is the keenest quote it can find, and the quotes now
   * differ: each bank prices its own book's measured loss rate at its own cost of equity
   * (`bank-lending.ts`). This is what the affordability walk that sets the house price reads, and
   * it is a MEASUREMENT of the lending market rather than a spread stated over the 10Y.
   * Undefined before the first bank pass, where the seed spread stands in (§7.4).
   */
  bestMortgageRateAnnual?: number;
  /**
   * HSG — the share of the owner-occupied stock that traded last year, MEASURED.
   *
   * One sale per tenure because every owner sells once, plus the owners whose income at the
   * current quote now supports more than they borrowed — a real share of the mortgage vintage
   * cross-section (`housingTurnoverAnnual`). Undefined before the first bank pass, where the seed
   * rate stands in (§7.4).
   */
  turnoverRateAnnual?: number;
  /**
   * §3.26b-ii — what the owners must fetch: the payoff per dwelling of every mortgage vintage on
   * the region's books (`domain/housing-clearing.ts:sellerPayoffLadderOf`), measured by the bank
   * pass for next week's book. An owner cannot sell below it. Undefined before the first bank
   * pass has run, where every owner is treated as outright (§7.4).
   */
  sellerPayoffLadder?: { units: number; payoffLocal: number }[];
  /** §3.26b-ii — the book's week: the dwellings offered, and the dwellings that changed hands at
   *  the price struck (`evolution.ts`). The mortgage origination reads the second. */
  unitsOfferedThisWeek?: number;
  unitsClearedThisWeek?: number;
}

export interface WeatherAnomaly {
  region: RegionId;
  title: string;
  type: 'Drought' | 'Heatwave' | 'Polar Vortex' | 'Monsoon' | 'Normal';
  severity: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  tempDeltaC: number;
  economicImpact: string;
  affectedCommodityId?: string;
  /**
   * NAT3 — WHAT AN EVENT DOES: it cuts the affected commodity's YIELD, as a fraction of the
   * region's supply of it. The commodity book then prices the shortage, input costs rise through
   * the recipes, and the measured index reports it — the chain `evolution.ts` already names as
   * the real one.
   *
   * This replaces `commodityImpactPct`, which stated a PRICE impact and was added to the spot's
   * drift: an event deciding the answer instead of moving a quantity (rule 3). Its two siblings,
   * `gdpImpactPct` and `inflationImpactPct`, were written at 14 sites and read at none — rule 2
   * in its purest form, a weather event stating its own GDP and inflation outcome — and are gone.
   */
  yieldImpactPct: number;
  weeksActive: number;
  minDurationWeeks?: number;
}

type CreditTier = 'SUPER_PRIME' | 'PRIME' | 'NEAR_PRIME' | 'SUBPRIME';

export interface CreditTierBook {
  tier: CreditTier;
  shareOfHouseholds: number;
  debtBalanceLocal: number;
  avgInterestRate: number;
  delinquencyRatePct: number;
}

export interface HouseholdState {
  creditTierBooks: CreditTierBook[];
  wageGrowth: number;
  savingsRate: number;
  realConsumptionGrowth: number;
  householdDebtToIncomeRatio: number;
  /** COH4 — the share of the week's household saving that stayed LIQUID, i.e. arrived at a bank
   * as a deposit rather than leaving as a pension contribution. Measured from the motive split
   * the cohorts already make (`evolution.ts`); the seed share stands in until the first pass. */
  liquidSavingShare?: number;
  stapleSpendShare: number;
  standardSpendShare: number;
  luxurySpendShare: number;
  netWorthLocal: number;
  durableGoodsStockUnits?: number;
  // §5-WIRES A3.4: the sector's deposits are its rows at the region's banks (`householdDepositsOf`).
  /**
   * MS1 — household equity wealth, now a DERIVED SUM of the four lines below rather than a stock
   * that appreciates by a formula return. It was seeded as `income x 1.5` and multiplied weekly
   * by a market-return index: owned in no share register, cleared in no book, no cash ever moving
   * for it, while feeding net worth, the wealth effect and consumption. Measured at 2,224B against
   * a total real market capitalisation of 1,052B (§7.45).
   */
  equityHoldingsLocal: number;
  /** Listed shares households really hold — the float institutions do not, marked at 07e's prices. */
  directEquityLocal: number;
  /** Index-fund shares, created through the real AP mechanism and marked at the fund's NAV. */
  /** §3.13-BOOK (c2b): the fund is an entity; its SHARES are an instrument keyed by it. */
  etfShares: { fundId: EntityId; shares: number }[];
  /**
   * §7.281 — THE DIRECT-EQUITY SELL CHANNEL's announcement. The liquidity ladder's next rung
   * after deposits and fund shares: the slice of a household shortfall neither could cover,
   * announced here by etf-flows (the ladder's owner) and EXECUTED by the next week's 07e
   * session, which puts that value of the households' own residual shares into the float and
   * pays the HOUSEHOLD party the cleared proceeds. The announce-then-price week is the same
   * rhythm every ETF flow already follows. Zero (or absent) = nothing to sell.
   */
  pendingDirectEquitySaleLocal?: number;
  /** Marked value of the above, carried so net worth does not have to reach into the fund list. */
  etfHoldingsLocal: number;
  /**
   * Founder stakes in the private tier. Households own the unlisted economy — HC gave every
   * private firm an `ownership.founderPct`, and this is what that block is worth at the same
   * cleared multiple the sponsors mark at. The single largest real component, and it was invisible.
   */
  privateBusinessEquityLocal: number;
  /**
   * HH2 — the housing stock households own, at this week's median price. Households carried
   * 1,061B of mortgage debt and owned no house: a balance sheet with the liability and not the
   * asset, which biases net worth down by the largest thing most households own.
   *
   * §3.26b-i: the sheet's line is a READ of the dwelling register at this week's price
   * (`domain/housing.ts:housingStockValueLocal`), carried here as the week's mark — never backed
   * out of the debt, so a move in home prices moves household wealth.
   */
  housingStockLocal: number;
  /** The owners' share of it, after the mortgages secured on it. A derived view, carried for the UI. */
  homeEquityLocal: number;
  /**
   * Last week's fully-marked net worth, carried so the wealth effect can be driven by the CHANGE
   * in wealth rather than by its level. See the note in `evolution.ts`: a level in a growth rate
   * is a units error, and it was invisible until HH2 put the house on the balance sheet and moved
   * the ratio from 1.5x to 4.6x.
   */
  priorNetWorthLocal: number;
  /**
   * HH1 — claims on institutions: insurance reserves, pension entitlements and fund shares, held
   * per institution so a claim can be marked against the balance sheet that owes it. When an
   * insurer's bond book falls, household wealth falls with it — the transmission that could not
   * exist while these claims were nobody's.
   */
  institutionalClaims: { entityId: string; valueLocal: number }[];
  /** Marked total of the above. */
  institutionalClaimsLocal: number;
  /**
   * HH3 — DERIVED SUMS of the itemized household loan pools on the region's named banks
   * (BankingSector.householdLoans), written by the bank-diversification stage each week. The
   * banks own the books; these lines are the household sector's view of the same loans, never
   * a second stock evolved by its own formula.
   */
  mortgageDebtLocal: number;
  creditCardDebtLocal: number;
  otherConsumerLoanDebtLocal: number;
  /** HH4 — the ~20 occupation x wealth-tier cohorts this aggregate decomposes into. Built by
   * `macro/household-cohorts.ts` each week; their sums ARE the aggregates (asserted). */
  cohorts?: HouseholdCohort[];
  /**
   * COH2 — the LIFE-CYCLE half of this week's saving flow, annual USD.
   *
   * A household saves for two different reasons and the two go to different places: the BUFFER
   * half stays in its own liquid stock, and this half — what it sets aside to fund the years it
   * will not earn — is a PENSION CONTRIBUTION. It is measured in the cohort build, where the
   * motive lives, so that `insurance-and-pensions.ts` collects a real flow instead of applying a
   * flat rate to the whole sector's income.
   */
  lifeCycleSavingAnnualLocal?: number;
  /** HH4d — the households' money-fund share stock: the savings the WS7 gate diverted from
   * deposits, now a real asset line instead of money that vanished from the household view. */
  mmfSharesLocal?: number;
  // §5-WIRES A2: the household sector's money lands on its banks at settlement; nothing is in transit.
  /** HH4b/§5-CLOSE C5 — this week's annual capital receipts recycling into the consumption
   * budget: deposit interest the banks paid plus the dividends the public float was paid. Both
   * are payments; there is no residual. */
  capitalReceiptsAnnualLocal?: number;
  /** Last week's mortgage book, so demand signals can read a real change (set with the sums). */
  priorMortgageDebtLocal?: number;
  /** HH3 — last week's real flows off the itemized books, written by the lending pass:
   * NET mortgage credit (origination minus the sellers' loans the sale proceeds retired —
   * the household sector's deposit gain), gross card/term origination (spent into
   * consumption), and the debt service the books require: interest plus annuity-scheduled
   * principal plus card minimums. */
  weeklyMortgageOriginationLocal?: number;
  weeklyNewConsumerCreditLocal?: number;
  weeklyDebtServiceLocal?: number;
}

/**
 * §3.13-SOV — A SOVEREIGN BOND IS A BOND (user, 2026-09-03: *"the sovereign needs to be completely
 * converted. it should have the same construction of a normal bond, they are a normal bond with
 * some different characteristics."*).
 *
 * This was a STANDALONE interface whose every field was also a `DebtTranche` field — a strict
 * subset, declared separately. It carried no characteristic a corporate bond lacks; it only
 * LACKED ones, and for that non-difference the sovereign got five parallel structures (its own
 * type, its own store, a holdings BUCKET with no instrument in it, a YIELD clearing, and its own
 * curve). `docs/instruments/bond.md` is the fourteen characteristics any bond must have, and the
 * sovereign answers N5, N11, N12 and N13 differently — not fewer of them.
 *
 * It is now a `DebtTranche` with the one field a sovereign genuinely adds. The remaining four
 * parallel structures are the rest of 13-SOV.
 *
 * `tenorAtIssuanceYears` is DERIVED, never stored: `tranches.ts:materializeGovLadder` computes it
 * as `(maturityWeek − originationWeek) / 52` on every read. It used to be written beside the dates
 * too, and the two DISAGREED on 20 of 260 rungs because the seed rounded the origination and
 * maturity ends separately and made a 13-week bill span 14 (rule 4). The span is rounded once and
 * the field has one source.
 */
export type GovDebtTranche = DebtTranche & {
  /** FIXED on every sovereign today: the coupon is locked at issue (bond.md N5.a). Bills carry
   *  zero and return the discount (N5.c), which `isDiscountBill` reads off the tenor. */
  couponRate: number;
};

/** What a READER gets off the ladder: the rung, plus the tenor derived from its own dates. The
 *  two types are what make "derived, never stated" a fact the compiler enforces — an issuer
 *  cannot state a tenor because the type it issues has no field for one. */
export type GovDebtTrancheView = GovDebtTranche & { tenorAtIssuanceYears: number };

/**
 * SEG — the SME tier of ONE registry industry in one region: the mass of firms too small to
 * name. A pool is a firm without a name — it holds real books, buys its industry's real recipe
 * inputs and sells its industry's real sub-units into the same auctions, under the same buyer
 * mixes, as the named firms above it.
 *
 * It replaces `SmePool`, five hardcoded buckets (MANUFACTURING, RETAIL_TRADE, …)
 * that were a parallel taxonomy beside `INDUSTRY_REGISTRY`: they were seeded from three
 * constants each, sold into 7 of 36 sub-units, bought in exactly one place, and could never
 * cover a product line added to the registry — rule 15 failing outright (§5-SEG).
 */
/**
 * DIST — one stratum of an SME pool: a weighted macro-agent, in the particle-in-cell sense.
 *
 * A pool used to be a scalar, so every decision about it was a function of its MEAN. That is
 * exact for a linear decision and wrong for a threshold, and every decision that matters here is
 * a threshold: `Math.max(0, 1 - coverage)` on the pool average gave a pool with mean coverage 1.2
 * exactly ZERO coverage-driven defaults, however many of its firms sat below 1. `E[f(x)]` is not
 * `f(E[x])`, and a mean-preserving spread could not cause a single default — which is the
 * mechanism of a credit cycle.
 *
 * Measured in the named tier, which is the same population one resolution finer: leverage runs
 * p10 1.50 / p50 3.12 / p90 5.92, and **11.2% of firms sit within 10% of the covenant threshold**.
 * That is the mass a scalar throws away.
 *
 * The pool's own aggregates stay, and are DERIVED from these (rule 4) — nothing reads a node and
 * a parallel scalar for the same quantity.
 */
interface SmePoolStratum {
  /** Share of the pool's firms this stratum stands for. Weights sum to 1. */
  weight: number;
  /** Debt to annual earnings for the firms in it — the dimension that gates default. */
  leverageMultiple: number;
}

export interface SmePool {
  /** The registry industry this pool is the small-firm tier of. One pool per region x industry. */
  industry: Industry;
  /** SEG-C — the pool's own money: the summed deposit balances of the small firms in it. Held
   * at the region's banks pro-rata by market share (a mass of small firms banks everywhere,
   * unlike a corporate with a house bank) as `smeDepositsLocal`, and moved ONLY by the settlement
   * layer — the pool is a party (`SEGMENT` PartyRef) like everyone else. */
  // §5-WIRES A3.3: the pool's cash is its rows at the region's banks (`poolCashOf`, engine/ledger/accounts.ts).
  /** SEG-C — tax accrued weekly on the pool's earnings and REMITTED quarterly as a real
   * SEGMENT to GOVERNMENT payment (stage 11), replacing the payer-less revenue statistic. */
  accruedTaxLocal?: number;
  /** The DERIVED SUM of the SME_POOL loans the region's banks hold against this pool — one
   * representation (rule 4); bank-lending.ts and 02b own it. */
  debtLocal: number;
  /** §7.241 — the principal-weighted margin (bps over policy) of those SAME loans, derived
   * beside `debtLocal` by 02b from the banks' real quoted margins. The pool's debt service used to
   * be priced at an invented `policyRate + 0.03` inline, so a credit tightening widened every
   * quoted margin and moved measured pool distress by ZERO — the transmission loop was open
   * exactly where its comment claimed it closed. One writer (02b), read by sme-pools. */
  blendedMarginBps?: number;
  defaultRateAnnualPct: number;
  capexLocal: number;
  employment: number;
  /** The pool's recent annual-revenue prints, so its hiring reads its own real output growth
   * the way a named firm reads its revenue history. */
  revenueHistoryLocal?: number[];
  annualRevenueLocal: number;
  marginPct: number;
  /** SEG-B — this week's real annualized receipts per sub-unit sold, from the pool's own
   * participation in stage 05's auctions. One book: a pool sells every sub-unit its industry
   * produces through one mechanism, so the old capex-derived / supply-derived pair (two routes,
   * two books, each able to clobber the other) collapses to this. */
  salesDerivedAnnualRevenueUSDBySubUnit?: Record<string, number>;
  /** DIST — the pool's leverage cross-section. Absent = not yet seeded; every decision that is
   *  nonlinear in leverage integrates over this instead of reading the pool's mean. */
  strata?: SmePoolStratum[];
  /**
   * DIST — THE SHARE OF THIS POOL'S FIRMS THAT CANNOT SERVICE WHAT THEY OWE, integrated over the
   * strata rather than read off the pool's mean.
   *
   * Measured in `sme-pools.ts`, where the strata and the distress function already live, and
   * read by `labor-market.ts` — one representation of one number (rule 4). It exists because the
   * SAME distress rule was being applied at two different resolutions: `cash < 0 → shed staff`
   * ran PER FIRM for the named tier and against the pool's TOTAL for segments, so either every
   * firm in a pool had distress layoffs or none did.
   */
  distressedFirmShare?: number;
}

export type OccupationType = 'GENERAL' | 'SKILLED_TRADES' | 'TECHNICAL_ENGINEERING' | 'SPECIALIZED_PROFESSIONAL' | 'MANAGERIAL_FINANCIAL';

/**
 * The one iteration list (§7.241): three hand-kept copies of this array meant a new occupation
 * could exist with a base wage and zero vacancies forever — present in every table, skipped by
 * the matching loop. Complete by construction: a new OccupationType member fails to compile here
 * until this list names it, and every consumer then includes it.
 */
export const OCCUPATION_TYPES = [
  'GENERAL', 'SKILLED_TRADES', 'TECHNICAL_ENGINEERING', 'SPECIALIZED_PROFESSIONAL', 'MANAGERIAL_FINANCIAL',
] as const;
type MissingOccupation = Exclude<OccupationType, (typeof OCCUPATION_TYPES)[number]>;
const _occupationsComplete: MissingOccupation extends never ? true : never = true;
void _occupationsComplete;

// Base annual wage by occupation is generated per-region from productivity — see
// engine/bootstrap/labor-and-wages.ts's getBaseAnnualWageLocal(regionId).

/**
 * DIST 1(b) — ONE TENURE COHORT INSIDE AN OCCUPATION.
 *
 * Every worker in an occupation earned exactly the same wage, so a tier split of them was
 * degenerate and `TIER_WAGE_MULTIPLIER` had to STATE a 32.5x spread that nothing produced
 * (§7.172-173). Rent-sharing gave firms a real premium — 1.23x at equilibrium — and measuring it
 * showed that is not what the stated number stands in for: workers differ from each other, not
 * just their employers.
 *
 * What differs is EXPERIENCE, and the model already simulates what produces its distribution —
 * hiring, quits and layoffs. A new hire enters at tenure zero, survivors age, separations remove
 * weight. So the wage cross-section becomes an OUTCOME of labour turnover, on exactly the
 * machinery DIST already proved on SME leverage strata (§7.140-143): weights, an integral, an
 * absorbing barrier and reinjection.
 */
export interface TenureStratum {
  /** Share of the occupation's workers in this cohort. Weights sum to 1. */
  weight: number;
  /** Years of experience the cohort carries — what its productivity premium is measured on. */
  tenureYears: number;
}

/**
 * DIST 1(b) — what a year of experience adds to a worker's productivity, and therefore its wage.
 *
 * A TECHNOLOGY primitive (rule 2): how fast a person gets better at a job is a fact about the
 * job, not an outcome of anything else the model runs. One number, and the entire wage
 * cross-section within an occupation is derived from it plus real turnover.
 */
export const RETURN_TO_EXPERIENCE_ANNUAL = 0.02;

/**
 * DIST 1(b) — how finely the experience cross-section is cut, and how long a working life runs.
 *
 * `TENURE_COHORTS` is a RESOLUTION parameter (rule 2): it says how the distribution is
 * discretised and the answer must not depend on it (verified §7.175).
 *
 * `WORKING_LIFE_YEARS` is GONE: it was a placeholder for the span the cold start spreads tenure
 * over, owed to DEM because the old mortality proxy implied a 133-year working life (§7.169).
 * DEM has a real age structure now, so the span is what it actually is — the years between
 * entering the workforce and retiring, both POLICY primitives (§7.181).
 */
export const TENURE_COHORTS = 20;

export interface OccupationPool {
  employed: number;
  /**
   * DIST 1(b) — the occupation's EXPERIENCE cross-section. `wageIndex` below is its first moment
   * and stays the number every existing reader wants (rule 4); this is what it is the mean OF.
   */
  tenureStrata?: TenureStratum[];
  wageIndex: number;
  wageGrowthAnnual: number;
  /** HH5 — open positions employers are actually trying to fill in this occupation, carried
   * week to week: an unfilled vacancy stays open, which is what makes hiring take TIME. */
  vacancies?: number;
  /** HH5 — hires and separations this week, the real gross flows behind the net change. */
  hiresThisWeek?: number;
  separationsThisWeek?: number;
  /** §3.24-i — the price this occupation printed this week: the marginal bid that took the last
   *  match, relative to the going rate it was bid against (`domain/labour-clearing.ts`).
   *  Undefined when nothing filled. */
  clearedWageIndex?: number;
}

/** Trend labor-productivity growth: the same real force that lets output per worker rise over
 * time. A structural primitive; IND/BP make it firm-specific once industries differ. */
/** §5-PROD retired this as the FIRMS' drift — each firm nets out its OWN Wright's-law learning
 *  rate now (domain/company-week/learning.ts). It survives as the SME pools' convention (a pool
 *  has no experience curve until DIST gives it one) and inside the learning seed anchor. */
export const LABOR_PRODUCTIVITY_GROWTH_ANNUAL = 0.012;

/**
 * HH5 — the matching function: `M = A x V^a x U^(1-a)`, Cobb-Douglas with a = 0.5, the standard
 * symmetric elasticity.
 *
 * A is DERIVED, not chosen, from two observable labor-market facts (JOLTS-shaped): total
 * separations run ~3.4% of employment a month, and the stock of open positions sits at ~4.5% of
 * employment with roughly one vacancy per seeker. At that rest point matching must exactly
 * replace separations, which pins A — and pins the average time to fill a vacancy at about six
 * weeks, which is the real number.
 *
 * Picking A directly is how this went wrong the first time: 0.62 was a guess, it implied a
 * resting vacancy stock of 12.8k against a realistic 520k, and every opening filled inside a
 * single week. A labor market with no search friction is not a labor market.
 */
const SEPARATION_RATE_MONTHLY = 0.034;
export const BASELINE_QUIT_RATE_WEEKLY = SEPARATION_RATE_MONTHLY / (52 / 12);
/**
 * The share of an unfilled vacancy stock that is WITHDRAWN each week. Firms give up on
 * postings they cannot fill — they redesign the role, automate it, or do without — and without
 * that the stock of a hard-to-fill occupation grows forever: measured at week 40, SKILLED_TRADES
 * carried 186k open positions against ONE job seeker, a "tightness" of 186,000 that pinned wage
 * growth at its cap and is not a market at all, just an unbounded accumulator.
 */
export const VACANCY_WITHDRAWAL_RATE_WEEKLY = 0.10;

/**
 * §3.24-i — HOW A FIRM SETS THE WAGE IT OFFERS: it bids. Its postings in each occupation are a bid
 * at its own `offeredWageIndex`, the week's matches go to the highest bids
 * (`domain/labour-clearing.ts`), and a firm the market rationed bids the price it saw print, at
 * its own management's horizon. The two speeds that stood here — `WAGE_PUSH_PER_UNFILLED_SHARE_ANNUAL`
 * (0.10 a year per share unfilled) and `WAGE_PULL_PER_MARGIN_SHORTFALL_ANNUAL` (0.45) — were the wage
 * moving AFTER an allocation it could not affect, and `MARKET_WAGE_CATCHUP_SPEED_WEEKLY` (0.15)
 * walked the going rate toward what was paid instead of reading it. All three are gone.
 */
/**
 * How much a firm's relative pay changes its quit rate. A firm paying 10% below market loses
 * people faster; one paying above keeps them. This is what makes a raise DO something, and it
 * is the reallocation channel: workers move toward the firms that are short of them.
 */
export const QUIT_ELASTICITY_TO_RELATIVE_WAGE = 1.8;

/**
 * RENT-SHARING — the share of a firm's surplus per worker that reaches the worker's wage.
 *
 * **A BARGAINING primitive** (rule 2's PREFERENCE/POLICY category): how a surplus is split
 * between the firm and the people who made it is not derivable from anything else in the model —
 * it is what a wage negotiation IS. One number, and it retires eighteen.
 *
 * **Why it has to exist.** Measured across 2,512 employers (§7.172), `offeredWageIndex` ran
 * p10 0.988 to p99 1.002 — **a 1.01x spread**, because the wage rule's only firm-specific terms
 * (its own unfilled vacancies, its own margin shortfall) both mean-revert. So every worker in an
 * occupation earned the same, and `TIER_WAGE_MULTIPLIER`'s stated 32.5x was carrying the entire
 * within-occupation income distribution — over half of the top tier's income.
 *
 * A more productive firm pays more. That is where within-occupation wage dispersion comes from,
 * and the model had the ingredient (revenue per worker varies) and no channel from it to pay.
 */
export const RENT_SHARE_TO_LABOUR = 0.12;
/** Execution quality also retains people — a well-run firm loses fewer of them. */
export const QUIT_ELASTICITY_TO_EXECUTION = 0.35;
/** Open positions as a share of employment at a neutral market (the JOLTS openings rate). */
const NEUTRAL_VACANCY_SHARE_OF_EMPLOYMENT = 0.045;
/** Vacancies per seeker at that same neutral market — the tightness wages are indexed to. */
export const NEUTRAL_LABOR_TIGHTNESS = 0.95;
export const MATCHING_ELASTICITY = 0.5;
/** Derived from the rest point above: `A x V^0.5 x U^0.5 = E x q` at `V = 0.045 E`, `U = V/0.95`. */
export const MATCHING_EFFICIENCY = BASELINE_QUIT_RATE_WEEKLY
  / Math.sqrt(NEUTRAL_VACANCY_SHARE_OF_EMPLOYMENT * (NEUTRAL_VACANCY_SHARE_OF_EMPLOYMENT / NEUTRAL_LABOR_TIGHTNESS));

/**
 * The vacancy stock at which matching replaces this week's separations exactly — the market's
 * rest point, inverted out of the same matching function. The SEED opens here (§7.4): opening
 * at zero vacancies made the stock climb from nothing for forty weeks while unemployment rose
 * too, so the two moved TOGETHER and the Beveridge relation printed +0.94 — a cold-start
 * artifact that looked exactly like a broken labor market.
 */
export function restingVacancies(employed: number, seekers: number): number {
  if (!(employed > 0) || !(seekers > 0)) return 0;
  // §4.0 Tier 1 item 15 — THE INVERSION SATURATES AT THE SEEKERS THAT EXIST. Replacement hiring
  // can never exceed the seeker pool, so the rest point is inverted from min(separations,
  // seekers): uncapped, a tight occupation (seekers → 1, the seed's floor) demanded a vacancy
  // stock that grows as 1/seekers — measured, the seed planted 4.07M GENERAL vacancies in a
  // 5.6M labor force, and the §7.244 world printed a 2.0e9% vacancy rate from the same shape.
  // Also one owner for the elasticity: this used to hardcode √· beside MATCHING_ELASTICITY.
  const hires = Math.min(employed * BASELINE_QUIT_RATE_WEEKLY, seekers);
  return Math.pow(
    hires / (MATCHING_EFFICIENCY * Math.pow(seekers, 1 - MATCHING_ELASTICITY)),
    1 / MATCHING_ELASTICITY
  );
}
/**
 * How much of the desired weekly headcount change a firm actually acts on. Hiring runs ahead of
 * the need (you post before you are short); firing lags it, because severance, notice periods
 * and the reluctance to destroy trained capacity are real frictions. That asymmetry is why
 * employment falls slowly into a downturn and climbs slowly out of one.
 */
export const HIRING_ADJUSTMENT_SPEED_MULTIPLE = 1.1;
export const LAYOFF_SPEED_MULTIPLE = 0.6;
/** A firm in real cash distress sheds staff regardless of the friction above. */
export const DISTRESS_LAYOFF_SPEED = 0.10;

/**
 * PUB3: what a government employs. The 60/40 split was a repeated literal in three places
 * (the labor-market stage twice, shared-helpers once) — hoisted so the headcount that fills
 * those jobs and the payroll that pays for them read the same mix.
 */
export const GOVERNMENT_OCCUPATION_MIX: Partial<Record<OccupationType, number>> = {
  GENERAL: 0.6,
  MANAGERIAL_FINANCIAL: 0.4,
};

export const SECTOR_OCCUPATION_MIX: Record<string, Partial<Record<OccupationType, number>>> = {
  Tech: { TECHNICAL_ENGINEERING: 0.55, MANAGERIAL_FINANCIAL: 0.15, GENERAL: 0.30 },
  Energy: { SKILLED_TRADES: 0.45, TECHNICAL_ENGINEERING: 0.25, GENERAL: 0.30 },
  Financials: { MANAGERIAL_FINANCIAL: 0.60, GENERAL: 0.40 },
  Banks: { MANAGERIAL_FINANCIAL: 0.55, GENERAL: 0.45 },
  Industrials: { SKILLED_TRADES: 0.40, TECHNICAL_ENGINEERING: 0.20, GENERAL: 0.40 },
  Consumer: { GENERAL: 0.85, MANAGERIAL_FINANCIAL: 0.15 },
  Healthcare: { SPECIALIZED_PROFESSIONAL: 0.50, GENERAL: 0.50 },
  Utilities: { SKILLED_TRADES: 0.40, TECHNICAL_ENGINEERING: 0.20, GENERAL: 0.40 },
};


export interface Region {
  id: RegionId;
  name: string;
  categoryDemand: Record<string, CategoryDemandState>;
  currency: string;
  symbol: string;
  centralBank: string;
  cycleRegime: 'Expansion' | 'Slowdown' | 'Recession' | 'Recovery';
  inversionWeeksCount: number;
  recessionShockQueue: { week: number; shock: number }[];
  bankingSector: BankingSectorView;
  equityOwnership: AssetOwnershipShares;
  corpBondOwnership: AssetOwnershipShares;
  sovBondOwnership: AssetOwnershipShares;
  /** WS9/XB2d: what the FX market cleared this week, and what it could not clear. A large
   * persistent residual means the elastic side is too thin — a real signal, not noise. */
  fxClearedMovePct?: number;
  fxUnclearedResidualLocal?: number;
  fxGrossDemandLocal?: number;
  /** XB1: foreign ownership MEASURED from real holdings each week — an outcome, not an input. */
  measuredForeignOwnership?: { equity: number; corpBond: number; sovBond: number };
  institutionalSector: InstitutionalSector;
  laggedCorporateDemandBase: number;
  estimatedHouseholdIncomeLocal: number;
  
  // Macro fundamentals
  policyRate: number;
  /**
   * WS6 — the cleared overnight general-collateral repo rate, an ANNUALISED decimal (same
   * convention as policyRate; the weekly accrual is this over 52). A market print solved each
   * week in stages/repo-clearing.ts from real bank funding needs against real lender cash,
   * with the administered facilities as the participants' own outside options — which is why
   * it lives inside the corridor without a clamp anywhere. One owner, region level; the banks'
   * sheets carry positions, never a second copy of the rate.
   */
  repoRateAnnual: number;
  /** §3.20b — what the interbank unsecured book struck at the last close, principal-weighted;
   *  undefined until a loan has cleared. A read of the book, never an input to it. */
  interbankRateAnnual?: number;
  /**
   * REPO1 — this region's live secured-funding book: every open contract, with its lender, its
   * borrower, the rate it was struck at, when it matures and the specific paper pledged. Stored
   * ONCE with both parties named, which is what makes the position two-sided (rule 5) without
   * being two copies of one thing (rule 4). The sheets' `repoLentLocal`, `repoBorrowedLocal`,
   * `srfBorrowingLocal` and encumbrance are all derived from it (domain/repo.ts).
   */
  // §3.13-BOOK d4c-ii: the repo book is rows of the world's contract store (`engine2/obligations.ts`),
  // read through `contract-ledger.ts:repoBookOf`; not a field.
  // §3.13-BOOK d4c-iv: the prime-brokerage lines are rows of the world's contract store, read
  // through `contract-ledger.ts:primeBrokerageBookOf`; not a field.
  // DRV — the swap and CDS books moved to the ONE derivative book (GameState.derivativesBook).
  /** HF — the stock loans outstanding in this region: who lent what to whom, at what fee. The
   * short interest in every name is a measurement of this book. */
  // §3.13-BOOK d4c-iii: the stock-loan book is rows of the world's contract store, read through
  // `contract-ledger.ts:securityLoanBookOf`; not a field.
  /** HF — the last cleared borrow fee per name, in annual bps; this book's own prior print. */
  borrowFeeBpsByCompanyId?: Record<string, number>;
  /** DER1 — the cleared par swap rate per tenor (annualised decimal). */
  swapParRateByTenor?: Record<string, number>;
  /** §3.17-ii — each reference issuer's cleared protection spread, PER TENOR (§3.17d-iii: the
   *  curve's store), the last `MEASURE_WINDOW_WEEKS` prints: what a contract marks at and sizes
   *  its initial margin from. Written by the CDS book when it clears a name; a name's key here is
   *  what makes it one the market makes. */
  cdsSpreadHistoryByIssuer?: Record<string, Record<string, number[]>>;
  /** §3.17d-i — the region's credit index SERIES, by id: the basket's names fixed at the roll and
   *  its events settled once for the line. Rolled and written by `derivative-markets/cds-index.ts`;
   *  a series stays while a contract names it. */
  creditIndexSeries?: Record<string, import('./derivatives/classes/cds-index').CreditIndexSeries>;
  /** The series currently on the run, and the number the next roll takes. */
  creditIndexSeriesId?: string;
  creditIndexNextSeriesNo?: number;
  /** §3.17d-i — each series' cleared spread, the last `MEASURE_WINDOW_WEEKS` prints: what an index
   *  contract marks at and sizes its margin from. Written by the index book when it clears. */
  creditIndexSpreadHistoryBySeries?: Record<string, number[]>;
  /** §3.17d-ii — the index-versus-single-name basis the line last cleared: its print against the
   *  constituents' average print, bps. A measured number (`cds-index.ts:indexBasisBps`). */
  creditIndexBasisBps?: number;
  /** §3.17e-i — the bond futures line's cleared price per unit of face, per delivery line, the
   *  last `MEASURE_WINDOW_WEEKS` prints: what the class marks at. Written by
   *  `derivative-markets/bond-future.ts`. */
  bondFuturesPriceHistory?: Record<string, number[]>;
  /** The deliverable the front contract was last struck on, and the NET BASIS it cleared at:
   *  the print against the cash bond carried at the repo rate less its coupon, per unit of face.
   *  A measured number (`bond-future.ts:bondFuturesNetBasis`). */
  bondFuturesDeliverableId?: string;
  bondFuturesBasis?: number;
  /**
   * CAL/DER — the SECURED OVERNIGHT INDEX: the cleared GC repo rate compounded week by week, the
   * way a published overnight benchmark actually is. It is a level, not a rate: the ratio of two
   * of its readings over a period IS the realised compounded rate for that period, which is what
   * a floating leg references and what makes an OIS an OIS.
   */
  securedOvernightIndex?: number;
  /**
   * The SECURED CURVE, annualised decimals: this model's overnight benchmark and the term
   * structure built on it. Overnight and 13-week are the repo market's own two cleared prints;
   * 2/5/10Y are the par rates of swaps that pay the compounded overnight index against fixed.
   * Every point is a price something actually traded at, which is what distinguishes a benchmark
   * curve from a bootstrapped one.
   */
  securedCurve?: { on?: number; w13?: number; y2?: number; y5?: number; y10?: number };
  /** DER1 — the par rate less this region's own cleared sovereign zero, in bps: the SWAP SPREAD.
   *  The first cross-market basis this model produces, and the test that two of its markets
   *  agree with each other. */
  swapSpreadBpsByTenor?: Record<string, number>;
  /** DER — the CLEARED cross-currency basis this region's hedgers pay per foreign currency, in
   *  bps. What a hedge costs, where hedger demand meets what the desks can carry — no longer a
   *  formula with an observed crisis-era ceiling. */
  crossCurrencyBasisBps?: Record<string, number>;
  /** G5 — what workouts in this region ACTUALLY recovered, most recent last. The rolling mean
   *  displaces `CREDIT_RECOVERY_RATE`, so the loss the market prices is the loss it has seen. */
  realisedRecoveryRates?: number[];
  /** REPO3 — the cleared TERM secured rate (annualised decimal), when the term book traded.
   *  A bank funding a long book at overnight and being caught by it is the mechanism a funding
   *  squeeze actually is, and it needs two prices to exist. */
  repoTermRateAnnual?: number;
  /** GUARD — the repo session's own volume diagnostic (see RepoSessionResult). */
  repoFundableNeedLocal?: number;
  repoClearedVolumeLocal?: number;
  /** §3.20-LLR-ii — what each bank (by entity id) was still short of its buffer after the close's
   *  market and window: the state a bank that could not fund ends the week in. Written fresh every
   *  close by `bank-funding-close.ts:recordFundingShortfalls`; empty on a clean close. */
  bankFundingShortfallsLocal?: Record<string, number>;
  /** §3.20-LLR-iii — consecutive closes each bank (by entity id) has ended short; 0 or absent on a
   *  clean close. What its uninsured depositors read against their own horizons. */
  bankFundingShortStreakWeeks?: Record<string, number>;
  /** §3.20-LLR-iii — what left each bank (by entity id) this week when its uninsured depositors
   *  moved to a sounder one: the run, measured. Written fresh each week by `depositor-flight.ts`. */
  depositorFlightLocal?: Record<string, number>;
  neutralRate: number;
  /**
   * PUB2b: what the Taylor rule wanted BEFORE the floor clamped it. The gap between this and the
   * effective lower bound is the easing the rate tool cannot deliver — which is the central
   * bank's own trigger for reaching for the balance sheet instead.
   */
  taylorTargetRate: number;
  inflation: number;
  /** True once fifty-three real weeks of index exist and `inflation` is a measured
   *  year-over-year change. Until then it is the opening assumption, and what is REPORTED is the
   *  level — a displayed change where no history exists is a lie. */
  inflationIsMeasured?: boolean;
  coreInflation: number;
  /**
   * Real measured price level and its trailing year, produced by the CPI basket in
   * simulation/stages/price-index.ts from the prices stage 05's auction actually clears.
   * `inflation` and `coreInflation` above are the 52-week changes in these, not free parameters.
   */
  consumerPriceIndex: number;
  coreConsumerPriceIndex: number;
  cpiHistory: number[];
  coreCpiHistory: number[];
  cpiBasket: import('../engine/simulation/stages/price-index').CpiBasket;
  expectedInflation: number;
  centralBankBalanceSheet: number;
  creditConditionsSpilloverAdjustment?: number;
  targetInflation: number;
  gdpGrowth: number;
  potentialGdpGrowth: number;
  nairu: number;
  weeksAboveNairu: number;
  unemploymentRate: number;
  wageGrowth: number;
  tradeBalance: number;
  exportsLocal: number;
  importsLocal: number;
  // §3.15-iii: `currentAccountPctGdp` is DELETED — seeded 0, written by nothing, shown on two
  // screens as a fact. The trade balance above is the read that exists; a current account is
  // §3.37-BOP's to build, and it will be a read of the transactions, never a stored field.
  fxReservesLocal: number;
  govEmploymentGrowthRate?: number;
  fiscalStanceScore: number;
  sovereignRating: 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';
  laggedPolicyRateEMA: number;
  laborForceParticipation: number;
  inflationDeviationStreak: number;
  smoothedSlackGap?: number;
  policyRateLagBuffer: number[];
  demandShockLagBuffer: number[];

  // Population & Labor Force Accounting
  totalPopulation: number;
  birthRateAnnual: number;
  deathRateAnnual: number;
  netMigrationRateAnnual: number;
  nonEmployablePct: number;
  governmentEmployment: number;
  /** SEG — the SME tier, one pool per registry industry. Was `smePools`: five
   * hardcoded buckets that no product line added to the registry could ever join. */
  smePools: SmePool[];
  supplyRelationships?: SupplyRelationship[];
  occupationPools: Record<OccupationType, OccupationPool>;
  occupationLaborForceShare: Record<OccupationType, number>;
  /** HH5 — real vacancies over real seekers, the market's tightness. Drives the quit rate and
   * the wage response; the raw material of a Beveridge curve. */
  laborMarketTightness?: number;
  /** HH5 — open vacancies as a share of the labor force. */
  vacancyRate?: number;

  // Government & Nominal GDP
  estimatedNominalGdpLocal: number;
  derivedNominalGdpLocal: number;
  gdpGrowthBottomUp: number;
  smoothedWeeklyGrowthRate: number;
  lastWeekNominalGdpLocal: number;
  nominalGdpHistory: number[];
  consumptionComponentLocal: number;
  investmentComponentLocal: number;
  effectiveTaxRate: number;
  governmentRevenueLocal: number;
  governmentSpendingWeeklyLocal: number;
  /** PUB1 — real weekly interest on the debt stack, paid to holders. Comes off the top of
   * spending, so procurement and transfers get the primary budget only. */
  /** Cash-basis coupon expense: BONDS only, since bills pay no coupon (PUB3d). */
  governmentInterestWeeklyLocal?: number;
  /** PUB3d: the discount accruing on the bill stack — the accrual-basis half of the interest
   * burden, reported so the cash-basis line above cannot silently understate it. */
  governmentBillDiscountAccrualLocal?: number;
  /**
   * PUB3: what the government owes its own staff this week — real headcount at the pools' real
   * wages. Computed once and read by everything, so the budget line and the jobs that produce it
   * cannot disagree.
   */
  governmentPayrollWeeklyLocal?: number;
  /** PUB3b — the government's real transfer obligation this week, paid to households as a real
   *  payment in stage 03 (it used to reach household INCOME without ever reaching their cash). */
  governmentTransfersWeeklyLocal?: number;
  /** HH — interest the region's banks actually paid on household deposits this week, summed from
   *  their own deposit rates. Part of measured household income; not re-derived anywhere. */
  householdDepositInterestWeeklyLocal?: number;
  /**
   * PUB1e: the ONE per-category procurement budget. Stage 03 derives it from the treasury's real
   * primary budget; stage 05 bids exactly it. Before this the two disagreed — the demand stage
   * allocated G by buyer mix while the auction re-derived a government slice off a smoothed
   * demand level, and the treasury's account was debited by neither.
   */
  governmentProcurementBudgetByCategory?: Record<string, number>;
  /** What those bids actually filled last week, at cleared prices. The real G. */
  governmentProcurementSpentLocal?: number;
  /** Budget the goods market could not supply. Named, not assumed spent. */
  unspentProcurementBudgetLocal?: number;
  /** What actually left the account: interest + payroll + transfers + realized procurement. */
  governmentOutlaysLocal?: number;
  /** PUB3c: extra bill issuance this week purely to bridge the treasury's cash position. */
  cashBridgeBillIssuanceLocal?: number;
  /** PUB2 — the central bank's real balance sheet (`centralBank` above is just its name). The
   * treasury's account lives on it as a liability, which is what makes TGA flows move reserves. */
  /** §5-CLOSE M6 — the deposits the household loan books wrote this week (origination less
   *  discharge, amortization and interest), the banks' second money creator. Written by 02b. */
  householdBookDepositFlowWeeklyLocal?: number;
  centralBankSheet?: CentralBank;
  /**
   * PUB1b/§5-CLOSE C5 — tax actually collected this week from real payers: corporate (quarterly,
   * off accrued liability), SME pools, households, payroll and consumption. `governmentRevenueLocal`
   * is exactly their sum — the treasury's revenue is what its payers remitted.
   */
  taxCollectedCorporateLocal?: number;
  taxCollectedPayrollLocal?: number;
  taxCollectedConsumptionLocal?: number;
  /** PUB1c — the employer payroll tax accruing weekly out of the wage bill. */
  employerPayrollTaxWeeklyLocal?: number;
  taxCollectedSmeLocal?: number;
  taxCollectedHouseholdLocal?: number;
  /** PUB1c — tax accrued but not yet remitted, per stream and per calendar. */
  accruedSmeTaxLocal?: number;
  accruedHouseholdTaxLocal?: number;
  accruedConsumptionTaxLocal?: number;
  /** PUB2 — this week's gross issuance proceeds and principal redeemed, so the TGA has the
   * financing leg that funds the deficit it is debited by. Written by stage 11. */
  lastIssuanceProceedsLocal?: number;
  /** §3.15b-ii — the latest week's auction, rung by rung: offered, placed, withdrawn. Written by
   *  07c (bonds) and 07f (bills) through `government.ts:recordPrimaryOffering`. */
  lastAuction?: import('./government').AuctionRecord;
  /** §3.16b-ii — cover nobody could write this week: what there was to insure beyond every
   *  insurer's capacity at its own price. Written by `insurance-and-pensions.ts`. */
  insuranceUnplacedCoverLocal?: number;
  /** §3.17-iv-c-ii — the clearing house's latest waterfall round: who defaulted, what it owed,
   *  what each line of the stack paid. Written by `derivative-lifecycle.ts:resolveMemberDefault`. */
  lastWaterfall?: import('./clearing-house').WaterfallRound;
  /** §3.17-v-i — notional the clearing house cut from this week's strikes: what members wanted
   *  beyond the margin they could carry (`derivative-lifecycle.ts:admitContract`). A measure. */
  ccpRefusedNotionalLocal?: number;
  /** §3.17b-iii — the implied volatility the region's index option book last cleared, annual. The
   *  option class prices at it while it stands; the realised one before. Written by
   *  `derivative-markets/option.ts`. */
  indexImpliedVol?: number;
  /** §3.17b-iv — the FUNDING basis the cross-currency swap book cleared, per foreign region, in
   *  bps per year. The forward book's `crossCurrencyBasisBps` is the other basis; 17b-iv-b makes
   *  them one. Written by `derivative-markets/xcs.ts`. */
  xcsBasisBps?: Record<string, number>;
  /** PUB: matured paper that no named book ever bought — the front-of-ladder undersubscription
   *  the treasury auction leaves behind. It is not a payment; nobody was owed it. */
  lastUnsoldMaturedLocal?: number;
  lastRedemptionPaidLocal?: number;
  /** CAL — sovereign interest ACCRUED to named holders and not yet paid: the treasury's payable,
   *  the same balance its holders carry as a receivable. Written only by sovereign-calendar.ts. */
  sovereignCouponPayableLocal?: number;
  /** CAL — what this week's coupon dates actually turned into cash. The treasury's expense stays
   *  smooth (`governmentInterestWeeklyLocal`); its ACCOUNT moves by this (stages/central-bank.ts). */
  sovereignCouponPaidLocal?: number;
  debtToGdpPctBottomUp: number;

  householdState: HouseholdState;

  // Wealth, Demographics & Housing
  wealthDistribution: Record<WealthTier, WealthTierData>;
  housingMarket: HousingMarket;
  /**
   * DEM — THE AGE STRUCTURE: population share by single year of age, index = age in years.
   *
   * `lifeCycleDistribution` below is now a VIEW of this — its four stage shares are age bands —
   * so there is one representation of who is how old (rule 4). It replaces four shares walked by
   * drift constants and renormalised, which implied a 33-year retirement and a 133-year working
   * life (§7.169) and could therefore carry no life-cycle at all.
   */
  ageDistribution?: number[];
  lifeCycleDistribution: Record<LifeCycleStage, LifeCycleStageData>;

  // Central Banking Dot Plot Projections
  dotPlot1Y: number;
  dotPlot2Y: number;

  // Historical tracks.
  // P1: every historical track (and historicalZeroCurves below) is appended by the macro
  // evolution AFTER the measurement stages run, so a same-week reader sees history through
  // LAST week — a one-week lag, consistent everywhere, documented here once rather than at
  // each of the read sites.
  historicalPolicyRates: number[];
  historicalInflation: number[];
  historicalCoreInflation: number[];
  historicalGdpGrowth: number[];
  historicalWageGrowth: number[];
  historicalDebtToGdp: number[];

  // Weather
  weather: WeatherAnomaly;

  // Sovereign Yield Curve
  yieldCurveParams: {
    beta0: number;
    beta1: number;
    beta2: number;
    lambda: number;
  };
  zeroRates: {
    tenor3M: number;
    tenor2Y: number;
    tenor5Y: number;
    tenor10Y: number;
    tenor30Y: number;
  };
  /** §3.25 — what the standing fit was made through: the week, and the tenors that cleared in
   *  it. A point read off the curve says from this whether it is a trade or the fit's opinion
   *  (`nelsonSiegel.ts:curvePointAt`). The seed's curve has traded nothing. */
  sovereignCurve: { fittedWeek: number; tradedTenorsYears: number[] };
  historicalZeroCurves: {
    week: number;
    tenor3M: number;
    tenor2Y: number;
    tenor5Y: number;
    tenor10Y: number;
    tenor30Y: number;
  }[];
}

/**
 * THE labour force: the people who can work and are in the market for it. One owner — it was
 * computed inline twice in the labor-market stage (§6.1's "one quantity, many authors" row).
 */
export function laborForceCount(reg: { totalPopulation: number; nonEmployablePct?: number; laborForceParticipation: number }): number {
  return reg.totalPopulation * (1 - (reg.nonEmployablePct ?? 0.35)) * reg.laborForceParticipation;
}
