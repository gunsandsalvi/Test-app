/**
 * Regional Macroeconomy Domain Model
 *
 * Models regional macroeconomic aggregates, labor markets, wealth & income tiers, demographic life cycles,
 * housing markets, government debt, fiscal stance, central banking dot plots, and weather anomalies.
 * Written and updated by macro evolution, labor, and fiscal/monetary policy simulation stages.
 */

import { RegionId } from './geography';
import { CentralBank } from './central-bank';
import { BankingSector, AssetOwnershipShares } from './banking';
import { InstitutionalSector } from './institutions';
import { SupplyContract, CategoryDemandState, SupplyRelationship } from './market-microstructure';

export type WealthTier = 'BOTTOM_50' | 'NEXT_40' | 'TOP_9' | 'TOP_1';

export interface WealthTierData {
  shareOfHouseholds: number;
  shareOfIncomeUSD: number;
  shareOfNetWorthUSD: number;
  /** HH4c — last week's marked net worth, so the tier wealth effect reads a real CHANGE. */
  priorNetWorthUSD?: number;
  savingsRate: number;
  equityExposureShare: number;
  homeEquityUSD?: number;
}

/**
 * HH4 — one household cohort: an occupation x wealth-tier cell. ~20 per region. Every dollar
 * figure is an ANNUAL flow (rule 9). The cohorts are the SOURCE for the household cross-section:
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
  wageIncomeUSD: number;
  unemploymentBenefitsUSD: number;
  /** Means-tested government transfers beyond unemployment benefits. */
  transferIncomeUSD: number;
  /** Still the aggregate constant share allocated by tier equity exposure — real dividend and
   * interest receipts are HH4b's, with the S1 seed identity re-derived when they land. */
  capitalIncomeUSD: number;
  grossIncomeUSD: number;
  taxUSD: number;
  disposableIncomeUSD: number;
  /** This cohort's share of the real HH3 debt service — recorded burden, not yet a budget
   * debit (see the interface comment). */
  debtServiceUSD: number;
  savingsUSD: number;
  /** PUB1c — the consumption tax inside this cohort's budget, remitted by merchants. */
  consumptionTaxUSD: number;
  consumptionBudgetUSD: number;
}

export type LifeCycleStage = 'EARLY_CAREER' | 'PEAK_EARNING' | 'PRE_RETIREMENT' | 'RETIRED';

export interface LifeCycleStageData {
  shareOfPopulation: number;
  savingsRate: number;
  consumptionMultiplier: number;
}

/**
 * People per household. A demographic primitive with one owner, used to turn a population into a
 * count of dwellings; it becomes an outcome in HH4, where cohorts are real and a household is
 * something that forms rather than a divisor.
 */
export const AVERAGE_HOUSEHOLD_SIZE = 2.5;

export interface HousingMarket {
  regionId: RegionId;
  medianHomePriceUSD: number;
  baselineHomePriceUSD: number;
  priceIndex: number;
  historicalPrices: number[];
  ownershipRatePct: number;
  mortgageOriginationVolumeUSD: number;
}

export interface WeatherAnomaly {
  region: RegionId;
  title: string;
  type: 'Drought' | 'Heatwave' | 'Polar Vortex' | 'Monsoon' | 'Normal';
  severity: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  tempDeltaC: number;
  economicImpact: string;
  affectedCommodityId?: string;
  commodityImpactPct: number;
  gdpImpactPct: number;
  inflationImpactPct: number;
  weeksActive: number;
  minDurationWeeks?: number;
}

export type CreditTier = 'SUPER_PRIME' | 'PRIME' | 'NEAR_PRIME' | 'SUBPRIME';

export interface CreditTierBook {
  tier: CreditTier;
  shareOfHouseholds: number;
  debtBalanceUSD: number;
  avgInterestRate: number;
  delinquencyRatePct: number;
}

export interface HouseholdState {
  consumerConfidence: number;
  creditTierBooks: CreditTierBook[];
  wageGrowth: number;
  savingsRate: number;
  realConsumptionGrowth: number;
  householdDebtToIncomeRatio: number;
  stapleSpendShare: number;
  standardSpendShare: number;
  luxurySpendShare: number;
  netWorthUSD: number;
  durableGoodsStockUnits?: number;
  depositsUSD: number;
  /**
   * MS1 — household equity wealth, now a DERIVED SUM of the four lines below rather than a stock
   * that appreciates by a formula return. It was seeded as `income x 1.5` and multiplied weekly
   * by a market-return index: owned in no share register, cleared in no book, no cash ever moving
   * for it, while feeding net worth, the wealth effect and consumption. Measured at 2,224B against
   * a total real market capitalisation of 1,052B (§7.45).
   */
  equityHoldingsUSD: number;
  /** Listed shares households really hold — the float institutions do not, marked at 07e's prices. */
  directEquityUSD: number;
  /** Index-fund shares, created through the real AP mechanism and marked at the fund's NAV. */
  etfShares: { fundId: string; shares: number }[];
  /** Marked value of the above, carried so net worth does not have to reach into the fund list. */
  etfHoldingsUSD: number;
  /**
   * Founder stakes in the private tier. Households own the unlisted economy — HC gave every
   * private firm an `ownership.founderPct`, and this is what that block is worth at the same
   * cleared multiple the sponsors mark at. The single largest real component, and it was invisible.
   */
  privateBusinessEquityUSD: number;
  /**
   * HH2 — the housing stock households own, at this week's median price. Households carried
   * 1,061B of mortgage debt and owned no house: a balance sheet with the liability and not the
   * asset, which biases net worth down by the largest thing most households own.
   *
   * Built from physical units — owning households times the median price — rather than backed out
   * of the debt, so a move in home prices moves household wealth, which is the transmission the
   * omission was suppressing.
   */
  housingStockUSD: number;
  /** The owners' share of it, after the mortgages secured on it. A derived view, carried for the UI. */
  homeEquityUSD: number;
  /**
   * Last week's fully-marked net worth, carried so the wealth effect can be driven by the CHANGE
   * in wealth rather than by its level. See the note in `evolution.ts`: a level in a growth rate
   * is a units error, and it was invisible until HH2 put the house on the balance sheet and moved
   * the ratio from 1.5x to 4.6x.
   */
  priorNetWorthUSD: number;
  /**
   * HH1 — claims on institutions: insurance reserves, pension entitlements and fund shares, held
   * per institution so a claim can be marked against the balance sheet that owes it. When an
   * insurer's bond book falls, household wealth falls with it — the transmission that could not
   * exist while these claims were nobody's.
   */
  institutionalClaims: { entityId: string; valueUSD: number }[];
  /** Marked total of the above. */
  institutionalClaimsUSD: number;
  /**
   * The part of household financial wealth the model's asset universe cannot yet back.
   *
   * Real households hold roughly 1.5x income in financial assets and the seed says so; the assets
   * that exist here add to about a third of that, because the universe is 6x short of the money
   * pointed at it (§7.18's want/have). Marking households down to what exists would import that
   * shortfall straight into consumption and the wealth effect — fixing a local inconsistency by
   * making the macro worse. So the gap is NAMED instead of hidden: it earns nothing, moves with
   * nothing, and shrinks as a share of wealth as the universe grows. §6 owns it.
   */
  unmodeledFinancialAssetsUSD: number;
  /**
   * HH3 — DERIVED SUMS of the itemized household loan pools on the region's named banks
   * (BankingSector.householdLoans), written by the bank-diversification stage each week. The
   * banks own the books; these lines are the household sector's view of the same loans, never
   * a second stock evolved by its own formula.
   */
  mortgageDebtUSD: number;
  creditCardDebtUSD: number;
  otherConsumerLoanDebtUSD: number;
  /** HH4 — the ~20 occupation x wealth-tier cohorts this aggregate decomposes into. Built by
   * `macro/household-cohorts.ts` each week; their sums ARE the aggregates (asserted). */
  cohorts?: HouseholdCohort[];
  /** HH4d — the households' money-fund share stock: the savings the WS7 gate diverted from
   * deposits, now a real asset line instead of money that vanished from the household view. */
  mmfSharesUSD?: number;
  /** HH4d — the SIGNED net household deposit flow that later-in-the-week stages have already
   * applied to this state but the banks have not yet posted (T+1 settlement): ETF purchases
   * (negative), insurance premiums net of benefits, PE capital calls and distributions. Any
   * stage that moves `depositsUSD` after the bank pass MUST add its flow here; the bank pass
   * posts the total next week and clears it. The invariant `hs − pending == Σ bank lines`
   * keeps the discipline honest. */
  pendingBankSettlementUSD?: number;
  /** HH4b — this week's annual capital receipts recycling into the consumption budget:
   * deposit interest + direct-equity dividends + the named residual share x income. */
  capitalReceiptsAnnualUSD?: number;
  /** HH4b — the seed-derived share of income covering receipts the model cannot yet attribute
   * (bank retained earnings and institutional dividend passthrough reaching households through
   * unbuilt channels). Derived ONCE at the HH3 seed migration as (debt service − real
   * receipts) / income, so the seed budget nets to zero; §6 owns watching it decay. */
  unmodeledCapitalReceiptShareOfIncome?: number;
  /** Last week's mortgage book, so demand signals can read a real change (set with the sums). */
  priorMortgageDebtUSD?: number;
  /** HH3 — last week's real flows off the itemized books, written by the lending pass:
   * NET mortgage credit (origination minus the sellers' loans the sale proceeds retired —
   * the household sector's deposit gain), gross card/term origination (spent into
   * consumption), and the debt service the books require: interest plus annuity-scheduled
   * principal plus card minimums. */
  weeklyMortgageOriginationUSD?: number;
  weeklyNewConsumerCreditUSD?: number;
  weeklyDebtServiceUSD?: number;
}

export interface GovDebtTranche {
  id: string;
  principalUSD: number;
  couponRate: number;
  originationWeek: number;
  maturityWeek: number;
  tenorAtIssuanceYears: number;
}

export const CATEGORY_TRADABILITY: Record<string, number> = {
  Energy: 0.80,
  MaterialsChemicals: 0.70,
  IndustrialsMachinery: 0.50,
  AerospaceDefense: 0.60,
  AutomotiveTransport: 0.55,
  TechHardwareSemis: 0.75,
  SoftwareDigitalServices: 0.85,
  Telecommunications: 0.20,
  HealthcarePharma: 0.30,
  ConsumerStaples: 0.05,
  ConsumerDiscretionaryRetail: 0.15,
  LuxuryGoods: 0.40,
  MediaEntertainment: 0.50,
  RealEstateConstruction: 0.02,
};

export type PrivateSegmentType = 'MANUFACTURING' | 'PROFESSIONAL_SERVICES' | 'RETAIL_TRADE' | 'CONSTRUCTION_REALESTATE' | 'HEALTHCARE_SERVICES';

export interface PrivateSectorSegment {
  segmentType: PrivateSegmentType;
  debtUSD: number;
  defaultRateAnnualPct: number;
  capexUSD: number;
  employment: number;
  /** HH5 — the segment pool's recent annual-revenue prints, so its hiring can read its own
   * real output growth the way a named firm reads its revenue history. */
  revenueHistoryUSD?: number[];
  annualRevenueUSD: number;
  marginPct: number;
  producedCommodityIds?: string[];
  commoditySupplyShareUSD?: Record<string, number>;
  // This week's real capex-derived contribution to annualRevenueUSD, keyed by capex sub-unit
  // category (see 05-unit-bidding.ts) — tracked per category, not one shared scalar, because
  // several capex categories can route to the SAME segment (e.g. heavy_equipment,
  // industrial_automation, and commercial_fleet all fall to MANUFACTURING); a single shared
  // field meant each category's weekly update wrongly subtracted a DIFFERENT category's
  // just-written contribution as if it were its own prior week's value, corrupting
  // annualRevenueUSD every week multiple categories touched the same segment. Each category
  // subtracts only its own prior entry and writes only its own new one, so contributions from
  // different categories to the same segment add up instead of clobbering each other.
  capexDerivedAnnualRevenueUSDBySubUnit?: Record<string, number>;
  // 1$ is 1$ Phase 3: this week's real annualized contribution from acting as a named seller in
  // 05-unit-bidding.ts's auction (e.g. specialty_metals, which can otherwise have zero real
  // public-company suppliers in a region), keyed by sub-unit category for the identical
  // multiple-categories-one-segment reason as capexDerivedAnnualRevenueUSDBySubUnit above.
  realSupplySalesDerivedAnnualRevenueUSDBySubUnit?: Record<string, number>;
}

export type OccupationType = 'GENERAL' | 'SKILLED_TRADES' | 'TECHNICAL_ENGINEERING' | 'SPECIALIZED_PROFESSIONAL' | 'MANAGERIAL_FINANCIAL';

// Base annual wage by occupation is generated per-region from productivity — see
// engine/bootstrap/labor-and-wages.ts's getBaseAnnualWageUSD(regionId).

export interface OccupationPool {
  employed: number;
  wageIndex: number;
  wageGrowthAnnual: number;
  /** HH5 — open positions employers are actually trying to fill in this occupation, carried
   * week to week: an unfilled vacancy stays open, which is what makes hiring take TIME. */
  vacancies?: number;
  /** HH5 — hires and separations this week, the real gross flows behind the net change. */
  hiresThisWeek?: number;
  separationsThisWeek?: number;
}

/** Trend labor-productivity growth: the same real force that lets output per worker rise over
 * time. A structural primitive; IND/BP make it firm-specific once industries differ. */
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
export const SEPARATION_RATE_MONTHLY = 0.034;
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
 * HH6 — how a firm sets the wage it OFFERS, relative to the going rate for its occupation mix.
 *
 * The mechanism the model was missing: a firm that cannot fill its openings raises its offer,
 * and that is wage-push. Before this, the occupation wage index moved on a region-level
 * tightness formula while a company's payroll appeared nowhere except as a margin nudge — two
 * representations of one wage, and neither was anybody's decision.
 *
 * Bargaining is two-sided, so both sides are here: an unfilled vacancy pushes the offer UP,
 * and a margin below the firm's own baseline pushes it DOWN (a firm losing money does not give
 * raises). The occupation index then becomes the employment-weighted average of what firms
 * actually pay — derived, one representation.
 */
export const WAGE_PUSH_PER_UNFILLED_SHARE_ANNUAL = 0.10;
/**
 * How much of the cost of living a workforce actually recovers in its wage. Bargaining is over
 * REAL wages — a workforce facing 10% inflation asks for something close to 10% just to stand
 * still, and a firm that refuses loses people. Without this term nominal wages ignored prices
 * completely and real wages collapsed at the rate of inflation (the defect §5-HH6 names: −2.5%
 * nominal against 10% inflation).
 *
 * It is deliberately INCOMPLETE. Full indexation would make the real wage a constant and hand
 * the model a mechanical wage-price spiral; partial pass-through is also what the data show —
 * real wages do fall during inflation surges, which is precisely the observation that this
 * number is below one.
 */
export const COST_OF_LIVING_PASS_THROUGH = 0.6;
/** How hard a squeezed margin pulls the offer back — the employer's side of the bargain. */
export const WAGE_PULL_PER_MARGIN_SHORTFALL_ANNUAL = 0.45;
/**
 * How fast the GOING RATE absorbs the premium firms are collectively offering over it. A firm's
 * `offeredWageIndex` is its wage RELATIVE to the going rate, so if the average firm is bidding
 * 2% above, the market rate must rise toward that — and the relative premium must then decay,
 * or the same 2% would be counted again every week (compounding a 2% premium weekly is 180% a
 * year, which is what the first version did). The market closes ~15% of the gap each week, a
 * five-week half-life: wages are sticky but not frozen.
 */
export const MARKET_WAGE_CATCHUP_SPEED_WEEKLY = 0.15;
/** Bounds on the annual pace at which one firm re-rates its own offer. */
export const MAX_FIRM_WAGE_CHANGE_ANNUAL = 0.25;
export const MIN_FIRM_WAGE_CHANGE_ANNUAL = -0.15;
/** Bounds on how far one firm's offer can drift from its occupations' going rate. */
export const MIN_FIRM_WAGE_INDEX = 0.75;
export const MAX_FIRM_WAGE_INDEX = 1.60;
/**
 * How much a firm's relative pay changes its quit rate. A firm paying 10% below market loses
 * people faster; one paying above keeps them. This is what makes a raise DO something, and it
 * is the reallocation channel: workers move toward the firms that are short of them.
 */
export const QUIT_ELASTICITY_TO_RELATIVE_WAGE = 1.8;
/** Execution quality also retains people — a well-run firm loses fewer of them. */
export const QUIT_ELASTICITY_TO_EXECUTION = 0.35;
/** Open positions as a share of employment at a neutral market (the JOLTS openings rate). */
export const NEUTRAL_VACANCY_SHARE_OF_EMPLOYMENT = 0.045;
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
  const hires = employed * BASELINE_QUIT_RATE_WEEKLY;
  return Math.pow(hires / (MATCHING_EFFICIENCY * Math.sqrt(seekers)), 2);
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

export const PRIVATE_SEGMENT_OCCUPATION_MIX: Record<PrivateSegmentType, Partial<Record<OccupationType, number>>> = {
  MANUFACTURING: { SKILLED_TRADES: 0.45, TECHNICAL_ENGINEERING: 0.15, GENERAL: 0.40 },
  PROFESSIONAL_SERVICES: { TECHNICAL_ENGINEERING: 0.30, SPECIALIZED_PROFESSIONAL: 0.25, MANAGERIAL_FINANCIAL: 0.15, GENERAL: 0.30 },
  RETAIL_TRADE: { GENERAL: 0.92, MANAGERIAL_FINANCIAL: 0.08 },
  CONSTRUCTION_REALESTATE: { SKILLED_TRADES: 0.65, GENERAL: 0.35 },
  HEALTHCARE_SERVICES: { SPECIALIZED_PROFESSIONAL: 0.55, GENERAL: 0.45 },
};

export interface Region {
  id: RegionId;
  name: string;
  categoryDemand: Record<string, CategoryDemandState>;
  activeContracts: SupplyContract[];
  currency: string;
  symbol: string;
  centralBank: string;
  cycleRegime: 'Expansion' | 'Slowdown' | 'Recession' | 'Recovery';
  inversionWeeksCount: number;
  recessionShockQueue: { week: number; shock: number }[];
  bankingSector: BankingSector;
  equityOwnership: AssetOwnershipShares;
  corpBondOwnership: AssetOwnershipShares;
  sovBondOwnership: AssetOwnershipShares;
  /** WS9/XB2d: what the FX market cleared this week, and what it could not clear. A large
   * persistent residual means the elastic side is too thin — a real signal, not noise. */
  fxClearedMovePct?: number;
  fxUnclearedResidualUSD?: number;
  fxGrossDemandUSD?: number;
  /** XB2c: net spot FX the dealers had to execute this week delta-hedging their forward book.
   * Negative = selling pressure on this region's currency. */
  fxHedgeSpotFlowUSD?: number;
  /** XB1: foreign ownership MEASURED from real holdings each week — an outcome, not an input. */
  measuredForeignOwnership?: { equity: number; corpBond: number; sovBond: number };
  institutionalSector: InstitutionalSector;
  laggedCorporateDemandBase: number;
  estimatedHouseholdIncomeUSD: number;
  
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
  neutralRate: number;
  /**
   * PUB2b: what the Taylor rule wanted BEFORE the floor clamped it. The gap between this and the
   * effective lower bound is the easing the rate tool cannot deliver — which is the central
   * bank's own trigger for reaching for the balance sheet instead.
   */
  taylorTargetRate: number;
  inflation: number;
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
  exportsUSD: number;
  importsUSD: number;
  currentAccountPctGdp: number;
  fxReservesUSD: number;
  structuralDeficitPctGdp: number;
  cyclicalDeficitComponent?: number;
  govEmploymentGrowthRate?: number;
  fiscalDeficitPctGdp: number;
  debtToGdpPct: number;
  fiscalStanceScore: number;
  sovereignRating: 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';
  laggedPolicyRateEMA: number;
  laborForceParticipation: number;
  inflationDeviationStreak: number;
  smoothedSlackGap?: number;
  policyRateLagBuffer: number[];
  wageGrowthLagBuffer: number[];
  demandShockLagBuffer: number[];

  // Population & Labor Force Accounting
  totalPopulation: number;
  birthRateAnnual: number;
  deathRateAnnual: number;
  netMigrationRateAnnual: number;
  nonEmployablePct: number;
  governmentEmployment: number;
  privateSectorSegments: PrivateSectorSegment[];
  supplyRelationships?: SupplyRelationship[];
  occupationPools: Record<OccupationType, OccupationPool>;
  occupationLaborForceShare: Record<OccupationType, number>;
  /** HH5 — real vacancies over real seekers, the market's tightness. Drives the quit rate and
   * the wage response; the raw material of a Beveridge curve. */
  laborMarketTightness?: number;
  /** HH5 — open vacancies as a share of the labor force. */
  vacancyRate?: number;

  // Government & Nominal GDP
  estimatedNominalGdpUSD: number;
  derivedNominalGdpUSD: number;
  gdpGrowthBottomUp: number;
  smoothedWeeklyGrowthRate: number;
  lastWeekNominalGdpUSD: number;
  nominalGdpHistory: number[];
  consumptionComponentUSD: number;
  investmentComponentUSD: number;
  effectiveTaxRate: number;
  governmentRevenueUSD: number;
  governmentSpendingUSD: number;
  /** PUB1 — real weekly interest on the debt stack, paid to holders. Comes off the top of
   * spending, so procurement and transfers get the primary budget only. */
  /** Cash-basis coupon expense: BONDS only, since bills pay no coupon (PUB3d). */
  governmentInterestWeeklyUSD?: number;
  /** PUB3d: the discount accruing on the bill stack — the accrual-basis half of the interest
   * burden, reported so the cash-basis line above cannot silently understate it. */
  governmentBillDiscountAccrualUSD?: number;
  /**
   * PUB3: what the government owes its own staff this week — real headcount at the pools' real
   * wages. Computed once and read by everything, so the budget line and the jobs that produce it
   * cannot disagree.
   */
  governmentPayrollWeeklyUSD?: number;
  /**
   * PUB1e: the ONE per-category procurement budget. Stage 03 derives it from the treasury's real
   * primary budget; stage 05 bids exactly it. Before this the two disagreed — the demand stage
   * allocated G by buyer mix while the auction re-derived a government slice off a smoothed
   * demand level, and the treasury's account was debited by neither.
   */
  governmentProcurementBudgetByCategory?: Record<string, number>;
  /** What those bids actually filled last week, at cleared prices. The real G. */
  governmentProcurementSpentUSD?: number;
  /** Budget the goods market could not supply. Named, not assumed spent. */
  unspentProcurementBudgetUSD?: number;
  /** What actually left the account: interest + payroll + transfers + realized procurement. */
  governmentOutlaysUSD?: number;
  /** PUB3c: extra bill issuance this week purely to bridge the treasury's cash position. */
  cashBridgeBillIssuanceUSD?: number;
  /** PUB2 — the central bank's real balance sheet (`centralBank` above is just its name). The
   * treasury's account lives on it as a liability, which is what makes TGA flows move reserves. */
  centralBankSheet?: CentralBank;
  /**
   * PUB1b — tax actually collected this week from real payers: corporate (quarterly, off accrued
   * liability), SME pools, and households. `governmentRevenueUSD` is these plus
   * `unmodeledTaxRevenueUSD`, which covers the bases this model has no instrument for —
   * consumption and payroll taxes, roughly half of a real government's take. Named rather than
   * closed by shrinking the state, which would model a different economy.
   */
  taxCollectedCorporateUSD?: number;
  taxCollectedPayrollUSD?: number;
  taxCollectedConsumptionUSD?: number;
  /** PUB1c — the employer payroll tax accruing weekly out of the wage bill. */
  employerPayrollTaxWeeklyUSD?: number;
  taxCollectedSmeUSD?: number;
  taxCollectedHouseholdUSD?: number;
  unmodeledTaxRevenueUSD?: number;
  /** PUB1c — tax accrued but not yet remitted, per stream and per calendar. */
  accruedSmeTaxUSD?: number;
  accruedHouseholdTaxUSD?: number;
  accruedConsumptionTaxUSD?: number;
  accruedPayrollTaxUSD?: number;
  /** PUB2 — this week's gross issuance proceeds and principal redeemed, so the TGA has the
   * financing leg that funds the deficit it is debited by. Written by stage 11. */
  lastIssuanceProceedsUSD?: number;
  lastRedemptionPaidUSD?: number;
  /**
   * PUB1 — the slice of the interest bill paid to holders that do not exist yet: the central
   * bank (15% of the stock, and in reality remitted straight back — PUB2) and foreign holders
   * (24%, which really does leave — XB). The government debits the full bill because the burden
   * is real; this line is what has no recipient. Watch it fall as PUB2 and XB land.
   */
  governmentInterestToUnmodeledHoldersUSD?: number;
  govDebtTranches: GovDebtTranche[];
  pendingUnfundedDeficitUSD?: number;
  debtToGdpPctBottomUp: number;

  householdState: HouseholdState;

  // Wealth, Demographics & Housing
  wealthDistribution: Record<WealthTier, WealthTierData>;
  housingMarket: HousingMarket;
  lifeCycleDistribution: Record<LifeCycleStage, LifeCycleStageData>;

  // Central Banking Dot Plot Projections
  dotPlot1Y: number;
  dotPlot2Y: number;

  // Historical tracks
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
  historicalZeroCurves: {
    week: number;
    tenor3M: number;
    tenor2Y: number;
    tenor5Y: number;
    tenor10Y: number;
    tenor30Y: number;
  }[];
}
