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
 * amount and the caller issues it — one writer per fact (§1.3).
 */

export interface CapitalProgrammeInputs {
  /** The plant, as a stock. */
  grossPPEUSD: number;
  accumulatedDepreciationUSD: number;
  usefulLifeYears: number;
  /** What the firm earns and holds this week. */
  weeklyEbitdaUSD: number;
  weeklyInterestUSD: number;
  cashUSD: number;
  currentLiabilitiesUSD: number;
  annualRevenueUSD: number;
  newRevenueUSD: number;
  /** Last week's programme, which this one moves smoothly away from. */
  priorMaintenanceCapexUSD: number;
  priorGrowthCapexUSD: number;
  priorMaintenanceShortfallStreak: number;
  baselineGrowthCapexToRevenueRatio: number;
  /** Whether it can borrow to cover upkeep at all. */
  isInvestmentGrade: boolean;
  /** What the firm's own markets are doing: how fast they grow, and how short they are. */
  addressableGrowthAnnual: number;
  categoryShortfall: number;
  capacityCatchupShareAnnual: number;
  /** Financial conditions and the firm's standing. */
  effectiveDebtRate: number;
  marketCapUSD: number;
  totalDebtUSD: number;
  avgCompetitiveness: number;
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
export function maintenanceTargetUSD(grossPPEUSD: number, usefulLifeYears: number): number {
  return grossPPEUSD / Math.max(1, usefulLifeYears);
}

/** What a firm can put behind upkeep this week: operating cash, a small draw, and — only if it is
 *  investment grade — a bridge. A distressed company cannot borrow its way out of deferred upkeep. */
export function maintenanceFundingCapacityUSD(i: CapitalProgrammeInputs): number {
  const weeklyOperatingCashFlow = i.weeklyEbitdaUSD - i.weeklyInterestUSD;
  const weeklyDesired = maintenanceTargetUSD(i.grossPPEUSD, i.usefulLifeYears) / 52;
  const borrowing = i.isInvestmentGrade ? weeklyDesired * 0.5 : 0;
  return Math.max(0, weeklyOperatingCashFlow) + Math.max(0, i.cashUSD) * 0.05 + borrowing;
}

export function planCapitalProgramme(i: CapitalProgrammeInputs): CapitalProgramme {
  const targetMaintenanceCapexUSD = maintenanceTargetUSD(i.grossPPEUSD, i.usefulLifeYears);
  const weeklyDesiredMaintenance = targetMaintenanceCapexUSD / 52;
  const weeklyOperatingCashFlow = i.weeklyEbitdaUSD - i.weeklyInterestUSD;
  const borrowingCapacity = i.isInvestmentGrade ? weeklyDesiredMaintenance * 0.5 : 0;
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
  const productiveReinvestmentEnvelope = i.newRevenueUSD * Math.max(0.01, i.addressableGrowthAnnual) * 1.5;
  const fcfBeforeGrowthCapex = Math.max(0, weeklyOperatingCashFlow * 52 - maintenanceCapexUSD);
  const excessCashGeneration = Math.max(0, fcfBeforeGrowthCapex - productiveReinvestmentEnvelope);
  const payoutPressure = fcfBeforeGrowthCapex > 0 ? Math.min(1, excessCashGeneration / fcfBeforeGrowthCapex) : 0;

  const rateDrag = Math.max(0, i.effectiveDebtRate - 0.04) * 2.0;
  const cashHealthFactor = i.cashUSD < 0 ? 0.05 : (i.cashUSD < i.currentLiabilitiesUSD * 0.25 ? 0.4 : 1.0);
  const safeMarketCap = Math.max(0, isFinite(i.marketCapUSD) ? i.marketCapUSD : 0);
  const safeTotalDebt = Math.max(0, isFinite(i.totalDebtUSD) ? i.totalDebtUSD : 0);
  const safeRev = Math.max(1, isFinite(i.annualRevenueUSD) ? i.annualRevenueUSD : 1);
  const tobinsQ = Math.max(0.1, Math.min(10.0, safeMarketCap / Math.max(1, safeTotalDebt + safeRev * 1.5)));
  const qCapexEffect = (tobinsQ - 1) * 0.2;
  const competitivenessCapexEffect = i.avgCompetitiveness * 0.15;
  // A firm under real payout pressure DOES cut growth investment to zero. Investment cannot be
  // negative; that is the only bound (rule 2).
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
  // Maintenance has had a funding capacity since §7.167; growth gets the SAME convention:
  // free cash flow after maintenance, levered half again for an investment-grade name (the
  // identical 0.5 bridge share upkeep uses). A firm that wants more than that raises real
  // money first — the financing decision, which is a different function.
  const growthFundingCapUSD = fcfBeforeGrowthCapex * (i.isInvestmentGrade ? 1.5 : 1.0);
  const targetGrowthCapex = Math.min(desiredGrowthCapex, growthFundingCapUSD);
  const growthCapexUSD = Math.max(0, i.priorGrowthCapexUSD * 0.90 + targetGrowthCapex * 0.10);

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
    weeklyDepreciationUSD: i.grossPPEUSD / (Math.max(1, i.usefulLifeYears) * 52),
  };
}

/** IND13 — the plant grows by what was COMMISSIONED, not what was ordered or delivered. That lag
 *  is the capacity cycle. */
export function commissionCapital(
  underConstruction: { valueUSD: number; entersServiceWeek: number }[],
  week: number
): { commissionedUSD: number; stillUnderConstruction: { valueUSD: number; entersServiceWeek: number }[] } {
  let commissionedUSD = 0;
  const stillUnderConstruction: { valueUSD: number; entersServiceWeek: number }[] = [];
  for (const lot of underConstruction) {
    if (lot.entersServiceWeek <= week) commissionedUSD += lot.valueUSD;
    else stillUnderConstruction.push(lot);
  }
  return { commissionedUSD, stillUnderConstruction };
}
