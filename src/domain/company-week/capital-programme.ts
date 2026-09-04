/**
 * §5-STRUCT step 2 — A FIRM'S CAPITAL PROGRAMME FOR ONE WEEK.
 *
 * Extracted from the ~1,900-line company kernel in `stages/08-company-fundamentals.ts`, which is
 * not a large function so much as fifteen absent objects (§7.229). This is the first: what a firm
 * spends to keep its plant whole, what it spends to grow it, what it defers when it cannot fund
 * either, and how the plant itself rolls forward.
 *
 * It is a PURE FUNCTION over flat inputs. That is the point of moving it: the rule can now be
 * asked a question — "does a firm short of cash defer maintenance?" — without running a world, and
 * a defect in it fails a test rather than surfacing forty weeks downstream as an inflation number.
 * It also keeps the columnar constraint (§7.228): numbers and ids in, numbers out, no object graph.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: raise the debt. A debt-funded bridge is a real tranche on a
 * real bank's book, and issuing it is the ledger's business, not this function's. It reports the
 * amount and the caller issues it — one writer per fact (§1.4).
 */

import { TREASURY_OPERATING_BUFFER_SHARE_OF_REVENUE } from '../company';
import { PATIENCE_MEDIAN_WEEKS } from '../preferences';

export interface CapitalProgrammeInputs {
  /** The plant, as a stock. */
  grossPPELocal: number;
  accumulatedDepreciationLocal: number;
  usefulLifeYears: number;
  /** What the firm earns and holds this week. */
  weeklyEbitdaUSD: number;
  weeklyInterestUSD: number;
  cashLocal: number;
  currentLiabilitiesUSD: number;
  annualRevenueLocal: number;
  newRevenueUSD: number;
  /** Last week's programme, which this one moves smoothly away from. */
  priorMaintenanceCapexUSD: number;
  priorGrowthCapexUSD: number;
  priorMaintenanceShortfallStreak: number;
  baselineGrowthCapexToRevenueRatio: number;
  /** Whether it can borrow to cover upkeep at all. */
  isInvestmentGrade: boolean;
  /** §5-WIRES W3/D: a bridge is a HOUSE BANK's credit — a firm with no house bank (a bank is its
   *  own banker) has no bridge to draw, whatever its rating. Omitted = it has one. */
  hasHouseBank?: boolean;
  /** What the firm's own markets are doing: how fast they grow, and how short they are. */
  addressableGrowthAnnual: number;
  categoryShortfall: number;
  capacityCatchupShareAnnual: number;
  /** §5-DYN — the share of the plant currently mothballed: no upkeep is spent on it. */
  mothballedPpeShare?: number;
  /** Financial conditions and the firm's standing. */
  effectiveDebtRate: number;
  marketCapUSD: number;
  totalDebtUSD: number;
  avgCompetitiveness: number;
  /** §5-BRAINS — the management's horizon (weeks) and risk weight; median = the stated rule. */
  patienceWeeks?: number;
  riskAversion?: number;
}

export interface CapitalProgramme {
  /** What upkeep costs if the plant is to stay whole: gross plant over its useful life. */
  targetMaintenanceCapexUSD: number;
  /** What was actually funded, and what was therefore deferred. */
  maintenanceCapexUSD: number;
  maintenanceShortfallThisWeekUSD: number;
  maintenanceShortfallStreak: number;
  /** What the caller must issue as a bridge, if anything. Reported, never issued here. */
  debtFundedMaintenanceUSD: number;
  /** Discretionary investment, after payout pressure, rate drag and the shortage signal. */
  growthCapexUSD: number;
  rndExpenseUSD: number;
  capexUSD: number;
  /** The plant, rolled forward on what was COMMISSIONED — not what was ordered or delivered. */
  weeklyDepreciationUSD: number;
  /** How much of this firm's free cash flow has nowhere productive to go. The dividend rule reads
   *  it, which is why it is reported rather than kept private: a firm out of reinvestment
   *  opportunity pays out, and that is one decision expressed in two places. */
  payoutPressure: number;
}

/**
 * MAINTENANCE CAPEX IS DEPRECIATION — the spend that keeps the capital stock whole as it wears out.
 * It used to be derived from its own current value (an EMA of itself with no anchor), so whatever
 * it was seeded at is what it stayed, and capital ARRIVED at ~0.5% of the stock a year against ~8%
 * straight-line depreciation. The anchor is the firm's own gross plant over its own useful life.
 */
export function maintenanceTargetUSD(grossPPELocal: number, usefulLifeYears: number): number {
  return grossPPELocal / Math.max(1, usefulLifeYears);
}

/** What a firm can put behind upkeep this week: operating cash, a small draw, and — only if it is
 *  investment grade — a bridge. A distressed company cannot borrow its way out of deferred upkeep. */
export function maintenanceFundingCapacityUSD(i: CapitalProgrammeInputs): number {
  const weeklyOperatingCashFlow = i.weeklyEbitdaUSD - i.weeklyInterestUSD;
  const activePpeUSD = i.grossPPELocal * (1 - Math.max(0, Math.min(1, i.mothballedPpeShare ?? 0)));
  const weeklyDesired = maintenanceTargetUSD(activePpeUSD, i.usefulLifeYears) / 52;
  const borrowing = bridgeCapacityUSD(i, weeklyDesired);
  return Math.max(0, weeklyOperatingCashFlow) + Math.max(0, i.cashLocal) * 0.05 + borrowing;
}

/** The weekly bridge a firm can draw against its upkeep: half the desired spend, investment grade
 *  only, and only from a house bank it actually has (measured §7.372: a BANK, banking nowhere,
 *  drew a maintenance facility from nobody — paper with no holder, interest paid to no one). */
export function bridgeCapacityUSD(i: CapitalProgrammeInputs, weeklyDesiredMaintenanceUSD: number): number {
  return i.isInvestmentGrade && i.hasHouseBank !== false ? weeklyDesiredMaintenanceUSD * 0.5 : 0;
}

export function planCapitalProgramme(i: CapitalProgrammeInputs): CapitalProgramme {
  // §5-BRAINS — every threshold below that was a constant is the constant at the MEDIAN brain,
  // scaled by this management's own two numbers: a patient board sees a larger set of projects
  // worth reinvesting in and moves its programme more slowly; a risk-averse one keeps a bigger
  // buffer, feels a dear coupon harder and rations cash sooner.
  const patience = i.patienceWeeks ?? PATIENCE_MEDIAN_WEEKS;
  const ra = i.riskAversion ?? 1;
  // §5-DYN: mothballed plant draws no upkeep — that saving is most of why a firm mothballs.
  const activePpeUSD = i.grossPPELocal * (1 - Math.max(0, Math.min(1, i.mothballedPpeShare ?? 0)));
  const targetMaintenanceCapexUSD = maintenanceTargetUSD(activePpeUSD, i.usefulLifeYears);
  const weeklyDesiredMaintenance = targetMaintenanceCapexUSD / 52;
  const weeklyOperatingCashFlow = i.weeklyEbitdaUSD - i.weeklyInterestUSD;
  const borrowingCapacity = bridgeCapacityUSD(i, weeklyDesiredMaintenance);
  const availableFunding = maintenanceFundingCapacityUSD(i);

  const weeklyFunded = Math.min(weeklyDesiredMaintenance, availableFunding);
  const fundedMaintenanceCapex = weeklyFunded * 52;
  const maintenanceShortfallThisWeekUSD = Math.max(0, targetMaintenanceCapexUSD - fundedMaintenanceCapex);
  const debtFundedMaintenanceUSD = Math.max(0,
    Math.min(weeklyFunded, borrowingCapacity) - Math.max(0, weeklyOperatingCashFlow));
  const maintenanceCapexUSD = Math.max(0, i.priorMaintenanceCapexUSD * 0.95 + fundedMaintenanceCapex * 0.05);

  // Deferred maintenance compounds; recovery is twice as fast as accumulation.
  const maintenanceShortfallStreak = maintenanceShortfallThisWeekUSD > 0
    ? i.priorMaintenanceShortfallStreak + 1
    : Math.max(0, i.priorMaintenanceShortfallStreak - 2);

  // GROWTH — discretionary, and disciplined by addressable opportunity rather than ambition.
  const productiveReinvestmentEnvelope = i.newRevenueUSD * Math.max(0.01, i.addressableGrowthAnnual) * 1.5
    * (patience / PATIENCE_MEDIAN_WEEKS);
  const fcfBeforeGrowthCapex = Math.max(0, weeklyOperatingCashFlow * 52 - maintenanceCapexUSD);
  const excessCashGeneration = Math.max(0, fcfBeforeGrowthCapex - productiveReinvestmentEnvelope);
  const payoutPressure = fcfBeforeGrowthCapex > 0 ? Math.min(1, excessCashGeneration / fcfBeforeGrowthCapex) : 0;

  const rateDrag = Math.max(0, i.effectiveDebtRate - 0.04) * 2.0 * ra;
  const cashHealthFactor = i.cashLocal < 0 ? 0.05 : (i.cashLocal < i.currentLiabilitiesUSD * 0.25 * ra ? 0.4 : 1.0);
  const safeMarketCap = Math.max(0, isFinite(i.marketCapUSD) ? i.marketCapUSD : 0);
  const safeTotalDebt = Math.max(0, isFinite(i.totalDebtUSD) ? i.totalDebtUSD : 0);
  const safeRev = Math.max(1, isFinite(i.annualRevenueLocal) ? i.annualRevenueLocal : 1);
  const tobinsQ = Math.max(0.1, Math.min(10.0, safeMarketCap / Math.max(1, safeTotalDebt + safeRev * 1.5)));
  const qCapexEffect = (tobinsQ - 1) * 0.2;
  const competitivenessCapexEffect = i.avgCompetitiveness * 0.15;
  // A firm under real payout pressure DOES cut growth investment to zero. Investment cannot be
  // negative; that is the only bound (rule 6).
  const growthCapexAllocationShare = Math.max(0, 1 - payoutPressure * 0.75);
  // A FIRM EXPANDS WHEN THE MARKET IT SELLS INTO CANNOT BE MET. Every other term here is about
  // the firm's finances and none about whether it can fill the orders in front of it.
  const shortageCapexMultiple = 1 + i.categoryShortfall * i.capacityCatchupShareAnnual;

  const desiredGrowthCapex = i.newRevenueUSD * i.baselineGrowthCapexToRevenueRatio * (1 - rateDrag)
    * cashHealthFactor * (1 + qCapexEffect + competitivenessCapexEffect)
    * growthCapexAllocationShare * shortageCapexMultiple;
  // §7.288 — A FIRM CANNOT BID CAPEX IT CANNOT FUND. Every term above is a reason to WANT
  // plant (q, competitiveness, the shortage in its own market); none was a means to PAY for
  // it, so the multiplicative stack was unbounded — measured at the §7.287 reference: EUR
  // firms bid 317B/yr of capex against 42B of depreciation (7.5x), draining the world's
  // capital-goods supply at 2x prices while USA firms below replacement couldn't fill.
  // The cap is the money the firm actually commands, from mechanisms the model already has
  // and NOTHING stated here (rule 2): the year's free cash flow after maintenance, plus the
  // cash pile above the treasurer's own operating buffer — the same buffer 07f's bill sleeve
  // is sized against, one owner. Debt- or equity-funded expansion arrives the way it really
  // does: the firm RAISES the money first (the financing decision and the primary market),
  // the proceeds land as cash, and the next week's cap has grown by exactly what was raised.
  const deployableCashUSD = Math.max(0,
    i.cashLocal - i.annualRevenueLocal * TREASURY_OPERATING_BUFFER_SHARE_OF_REVENUE * ra);
  const growthFundingCapUSD = Math.max(0, fcfBeforeGrowthCapex) + deployableCashUSD;
  const targetGrowthCapex = Math.min(desiredGrowthCapex, growthFundingCapUSD);
  // The stock-adjustment weight is the median's 0.10 at the median horizon (§7.288's convention),
  // and this board's own 1/horizon relative to it.
  const w = Math.min(1, 0.10 * (PATIENCE_MEDIAN_WEEKS / patience));
  const growthCapexUSD = Math.max(0, i.priorGrowthCapexUSD * (1 - w) + targetGrowthCapex * w);

  return {
    targetMaintenanceCapexUSD,
    maintenanceCapexUSD,
    maintenanceShortfallThisWeekUSD,
    maintenanceShortfallStreak,
    debtFundedMaintenanceUSD,
    growthCapexUSD,
    rndExpenseUSD: 0,
    capexUSD: maintenanceCapexUSD + growthCapexUSD,
    payoutPressure,
    weeklyDepreciationUSD: i.grossPPELocal / (Math.max(1, i.usefulLifeYears) * 52),
  };
}

/**
 * §5-DYN — CAPACITY LEAVES IN DOWNTURNS: mothball, restart, scrap. The §7.139 produce/idle rule
 * is the FLOW response (a plant that cannot cover unit cost does not run this week); this is the
 * STOCK response it always implied — plant idle for a sustained quarter is MOTHBALLED (no
 * maintenance draw, no staffed capacity, restartable), and plant mothballed for the §7.138
 * measured year is SCRAPPED (written off for good). §7.246 inverted the famine and left the
 * opposite watch standing: "a sector now OVERSUPPLIED against real bids will idle capacity, and
 * the model has no mothball/scrap mechanism — DYN's charter." This is that mechanism.
 *
 * No new constants: the quarter and the year are the model's own structural clocks (every
 * structural event runs on 13 weeks; a year of persistence is structural, §7.138), and the
 * mothballed share MOVES at the same 10%/week stock-adjustment weight the growth-capex EMA uses
 * (§7.288) — a plant is taken down and brought back over months, not on a Tuesday.
 */
export interface CapacityRetirementInputs {
  /** Revenue share of this firm's lines that FAILED the §7.139 cost-covering test this week —
   *  measured by stage 05, the only place the test runs. */
  idleRevenueShareThisWeek: number;
  priorIdleStreakWeeks: number;
  priorMothballedShare: number;
  priorMothballedStreakWeeks: number;
  /** §7.345 — THE DEMAND-SLACK EXIT. The avoidable-cost test above is the short-run rule (a
   *  plant runs while price covers its inputs); a plant its market does not need — the share
   *  the produce-to-sales decision left unrun — is idle in the plain sense, and idle for the
   *  management's horizon it comes offline too. Without this the only exit from an oversupplied
   *  market was default (the burn-in's EUR consumer sector: margins 19% → 1.5% in twelve weeks,
   *  seven weeks of unsold stock, 140 deaths, and nothing came offline). */
  demandSlackRevenueShare?: number;
  /** §5-BRAINS — the clocks are this management's horizon: idle for its horizon → mothball;
   *  mothballed for four horizons → scrap. The median horizon is the stated quarter/year. */
  mothballAfterWeeks?: number;
  scrapAfterWeeks?: number;
}
export interface CapacityRetirement {
  idleStreakWeeks: number;
  /** Share of the plant offline: no maintenance target, no staffed capacity, restartable. */
  mothballedShare: number;
  mothballedStreakWeeks: number;
  /** Share of GROSS plant written off THIS week (mothballed the full year): gone for good. */
  scrappedShare: number;
}
const STRUCTURAL_QUARTER_WEEKS = 13;
const STRUCTURAL_YEAR_WEEKS = 52; // §7.138's measured hold — the same year everywhere.
const STOCK_ADJUSTMENT_WEEKLY = 0.10; // §7.288's convention for how fast a stock chases a target.

export function capacityRetirement(i: CapacityRetirementInputs): CapacityRetirement {
  const idle = Math.max(0, Math.min(1, Math.max(i.idleRevenueShareThisWeek, i.demandSlackRevenueShare ?? 0)));
  const idleStreakWeeks = idle > 0 ? i.priorIdleStreakWeeks + 1 : 0;
  // The target: after a sustained quarter of idling, the persistently idle share comes offline;
  // the moment the plant covers cost again the target is zero and the same speed brings it back.
  const targetShare = idleStreakWeeks >= (i.mothballAfterWeeks ?? STRUCTURAL_QUARTER_WEEKS) ? idle : 0;
  let mothballedShare = Math.max(0, Math.min(1,
    i.priorMothballedShare * (1 - STOCK_ADJUSTMENT_WEEKLY) + targetShare * STOCK_ADJUSTMENT_WEEKLY));
  const mothballedStreakWeeks = mothballedShare > 0.01 ? i.priorMothballedStreakWeeks + 1 : 0;
  let scrappedShare = 0;
  if (mothballedStreakWeeks >= (i.scrapAfterWeeks ?? STRUCTURAL_YEAR_WEEKS)) {
    // A year mothballed is not coming back: the offline share is scrapped and the clock resets.
    scrappedShare = mothballedShare;
    mothballedShare = 0;
  }
  return { idleStreakWeeks, mothballedShare, mothballedStreakWeeks, scrappedShare };
}

/** IND13 — the plant grows by what was COMMISSIONED, not what was ordered or delivered. That lag
 *  is the capacity cycle. */
export function commissionCapital(
  underConstruction: { valueLocal: number; entersServiceWeek: number }[],
  week: number
): { commissionedUSD: number; stillUnderConstruction: { valueLocal: number; entersServiceWeek: number }[] } {
  let commissionedUSD = 0;
  const stillUnderConstruction: { valueLocal: number; entersServiceWeek: number }[] = [];
  for (const lot of underConstruction) {
    if (lot.entersServiceWeek <= week) commissionedUSD += lot.valueLocal;
    else stillUnderConstruction.push(lot);
  }
  return { commissionedUSD, stillUnderConstruction };
}
