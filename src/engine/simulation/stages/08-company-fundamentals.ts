/**
 * Stage 8: Company Fundamentals
 *
 * Evolves every company's full weekly financial state: revenue (bank/insurer/asset-manager
 * specialty profiles, or the generic demand/margin/production model), maintenance and growth
 * capex, credit rating and OAS spread, debt refinancing/prepayment, quarterly earnings,
 * equity price (holder-class rebalancing flow), buybacks, and the resulting balance sheet.
 * The single largest and most interdependent stage — see ARCHITECTURE.md.
 */

import {
  GameState, Company, DebtTranche, NewsItem, SegmentFinancial,
} from '../../../types';
import { isActiveCompany, isPubliclyListed, getOutputInventoryUSD, InputLot } from '../../../domain/company';
import { callProtectionForIssue, callPricePerDollar } from '../../../domain/call-protection';
import { isInvestmentGrade } from './asset-allocation';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { SECTOR_OCCUPATION_MIX } from '../../../domain/region-macro';
import { CATEGORY_INPUT_REQUIREMENTS, PRIVATE_SEGMENT_SUPPLY_CATEGORIES } from '../../../domain/market-microstructure';
import { calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { SECTOR_BENCHMARKS } from '../../pricing';
import { formatCurrency, formatQuarterFilingDate, formatSimulationDate } from '../../formatters';
import { getBlendedWageGrowth } from '../../macro/evolution';
import { determineCreditRating } from '../credit';
import { SECTOR_PRICING_POWER, SECTOR_WAGE_SENSITIVITY, SECTOR_PPE_USEFUL_LIFE_YEARS, SECTOR_PPE_INTENSITY } from '../constants';
import { FIXED_SHARE_BY_RATING, buildQuarterlyFundamentalSnapshot, CogsCostDrivers } from '../../companyGenerator';
import { getRatingBucket, settleCorporateActionOnHolders, applyPendingCorporateActionSettlements, payHoldersCash, DEFAULT_COVERAGE_FLOOR } from './shared-helpers';
import { openCorporateSweepBooks, corporateSweepDecision, settleCorporateSweepBooks } from './money-market-fund';
import { decideCorporateFinancing } from './corporate-financing';
import { PrimaryOffering, chooseLeadBank } from '../../../domain/primary-market';
import { REVOLVER_MARGIN_BPS } from './07f-short-debt-clearing';
import { WeeklyStepContext } from './context';
import { PROFILE_REGISTRY, profileKeyOf } from './profiles';
import { pay, PartyRef } from './settlement';
import { annualCarryingCostRateOf } from '../../../domain/industry-registry';
import { companyFairValuePerShare, REPRESENTATIVE_HOLDER_REQUIRED_RETURN } from '../../equity-valuation';
import { random } from '../../rng';

const STANDARD_CORP_TENOR_YEARS = 5;

// SCALE: the fundamentals snapshot re-summed every input lot of every company every week —
// ~33 ms/week of it over arrays that mostly had not changed (a lot array is copy-on-first-touch:
// a week that touches one replaces it with a NEW array and never mutates lots in place, so array
// identity implies identical contents). Cache the sum by the array object itself; a hit returns
// the very bits the reduce would have produced.
const lotValueCache = new WeakMap<InputLot[], number>();
function lotArrayValueUSD(lots: InputLot[]): number {
  let v = lotValueCache.get(lots);
  if (v === undefined) {
    v = lots.reduce((s2, lot) => s2 + lot.unitsHeld * lot.unitPriceUSD, 0);
    lotValueCache.set(lots, v);
  }
  return v;
}
/** The most of its earnings a board will pay out as dividends — real payout discipline. */
const MAX_DIVIDEND_PAYOUT_RATIO = 0.6;

export function runCompanyFundamentalsStage(state: GameState, ctx: WeeklyStepContext): void {
  const { nextWeek, currentWeekMod13, companyUpdates, prevActiveFirms, updatedRegions, updatedCommodities, systemicStressFactorGlobal } = ctx;
  const refinanceNews: NewsItem[] = [];

  // Per-week indices, built once (see the plan's optimization rule: memoize per-week derived
  // values at the top of a stage, never inside a per-company loop). Each of these was a full
  // scan of a multi-thousand-element array executed once per company.
  const entityById = new Map(state.institutionalEntities.map(e => [e.id, e]));
  const firmById = new Map(prevActiveFirms.map(c => [c.id, c]));
  // SCALE: the one cross-company read in the loop below. Companies are now updated IN PLACE,
  // so a customer processed after its supplier would otherwise read the supplier's POST-update
  // book; snapshot the two supplier figures the relationship shock needs before anything moves,
  // which is exactly what the old rebuild-a-fresh-object week gave every reader.
  const supplierShockStats = new Map<string, { annualRevenue: number; invUSDByCategory: Map<string, number> }>();
  // Supply relationships indexed by customer. This was a full scan of the region's relationship
  // list for EVERY company — the same O(companies x list) shape that made corporate-action
  // settlement 12% of the weekly step. One grouping pass instead.
  const supplyRelsByCustomer = new Map<string, any[]>();
  (Object.keys(updatedRegions) as (keyof typeof updatedRegions)[]).forEach(rid => {
    (updatedRegions[rid]?.supplyRelationships || []).forEach((rel: any) => {
      const list = supplyRelsByCustomer.get(rel.customerCompanyId);
      if (list) list.push(rel); else supplyRelsByCustomer.set(rel.customerCompanyId, [rel]);
      const supplier = firmById.get(rel.supplierCompanyId);
      if (supplier) {
        let stats = supplierShockStats.get(rel.supplierCompanyId);
        if (!stats) {
          stats = { annualRevenue: supplier.annualRevenue, invUSDByCategory: new Map() };
          supplierShockStats.set(rel.supplierCompanyId, stats);
        }
        if (!stats.invUSDByCategory.has(rel.category)) {
          stats.invUSDByCategory.set(rel.category, getOutputInventoryUSD(supplier, rel.category));
        }
      }
    });
  });
  /** The nearest short government tranche a corporate treasury would park cash in. One lookup
   *  per region per week: the ladder now carries weekly bill issuance, so this list grows all
   *  run and was being re-scanned per company. */
  const nearestShortGovTrancheByRegion = new Map<string, any>();
  (Object.keys(updatedRegions) as (keyof typeof updatedRegions)[]).forEach(rid => {
    const found = (updatedRegions[rid]?.govDebtTranches || []).find((t: any) => t.tenorAtIssuanceYears <= 2);
    if (found) nearestShortGovTrancheByRegion.set(rid as string, found);
  });
  const suppliedSubUnitsByRegion = new Map<string, Set<string>>();
  prevActiveFirms.forEach(c => {
    let set = suppliedSubUnitsByRegion.get(c.region);
    if (!set) { set = new Set<string>(); suppliedSubUnitsByRegion.set(c.region, set); }
    (c.productLines || []).forEach(pl => set!.add(pl.subUnitId));
  });

  // WS7: per-region redemption capacity for the treasury sweeps below — the funds' real cash.
  const mmfSweepBooks = openCorporateSweepBooks(ctx);

  // WS8: this week's priced offerings, indexed by issuer, and the pending queue by issuer so a
  // company never runs two books at once. Lead banks are chosen per region from the named banks.
  const primarySettlementByIssuerId = new Map<string, { offering: PrimaryOffering; clearedStat: number; withdrawn: boolean; marketTakeUSD: number; proceedsUSD: number }>();
  ctx.primarySettlements.forEach((s) => primarySettlementByIssuerId.set(s.offering.issuerId, s));
  const pendingOfferingIssuerIds = new Set(ctx.primaryOfferingsWorking.map((o) => o.issuerId));
  const regionBanksForLeads: Record<string, { ticker: string; bankMarketShare?: number }[]> = {};
  ctx.prevActiveFirms.forEach((c) => {
    if (!c.isBankEntity) return;
    (regionBanksForLeads[c.region] ??= []).push({ ticker: c.ticker, bankMarketShare: c.bankMarketShare });
  });
  const enqueueOffering = (o: PrimaryOffering) => {
    ctx.primaryOfferingsWorking.push(o);
    pendingOfferingIssuerIds.add(o.issuerId);
  };

  ctx.updatedCompanies = state.companies.map((comp) => {
    /**
     * Earnings PER SHARE, for a company that has shares. A private firm's register is empty until
     * it lists (HC7's `postIssueSharesOutstanding` creates it), so there is nothing to divide by
     * and the honest answer is zero — not a figure produced by dividing into a fabricated share
     * count that the generator used to hand every private firm.
     */
    const perShare = (amountUSD: number): number =>
      comp.sharesOutstanding > 0 ? Number((amountUSD / comp.sharesOutstanding).toFixed(2)) : 0;

    if (!isActiveCompany(comp)) {
      return Object.assign(comp, { previousEmployeeCount: 0, employeeCount: 0 });
    }

    // HC Wave 1: a PRIVATE company runs the reduced weekly path — the real balance-sheet walk
    // (interest at its real ladder terms, cash, coverage, rating, the same default trigger as
    // everyone else) with none of the public-market machinery (no equity pricing, no consensus,
    // no earnings reporting — real private firms publish none of that). Its revenue holds at
    // baseline with real drift arriving in HC3, when it takes over its slice of the goods
    // economy from the segment aggregates.
    if (!isPubliclyListed(comp)) {
      const regP = updatedRegions[comp.region];
      const interestAnnual = comp.debtTranches.reduce((sum, t) => t.rateType === 'FIXED'
        ? sum + t.principalUSD * (t.couponRate ?? 0.05)
        : sum + t.principalUSD * (regP.policyRate + (t.floatingMarginBps ?? 200) / 10000), 0);
      // HC3: revenue anchors to the same real settled sales the public path reads — stage 05
      // has already run this firm's real auction. Unsold production hurts revenue exactly as it
      // does for a public firm; a slow drift re-anchors toward baseline capacity. What private
      // firms skip is the public-market machinery, not the real economy.
      const hasMarketPresence = (comp.productLines || []).length > 0;
      const updateP = companyUpdates[comp.ticker];
      const salesP = updateP?.salesUSD ?? 0;
      const targetProductionP = updateP?._targetProductionUSD ?? comp.annualRevenue / 52;
      // The unsold-production signal only exists for a firm that actually offers into a modeled
      // market. Until HC3b gives the hidden tier's products real categories, a private firm with
      // no product lines holds its baseline — penalising it for not selling in markets it is
      // not in was measured to collapse the whole tier.
      const unsoldP = hasMarketPresence ? Math.max(0, targetProductionP - salesP) : 0;
      const revenue = Math.max(10,
        comp.annualRevenue * 0.98 + comp.baselineAnnualRevenue * 0.02 - unsoldP * 0.5);
      const ebitda = revenue * (comp.baselineEbitdaMargin ?? 0.12);
      const da = revenue * 0.045;
      const ebit = Math.max(1, ebitda - da);
      const netIncome = (ebit - interestAnnual) * (1 - 0.21); // same flat rate the public path uses; BP5 makes it real
      // Same S5 ledger discipline as the public path — smaller book, same honesty.
      const privLedger: { label: string; amountUSD: number }[] = [
        { label: 'operating cash flow (EBITDA accrual)', amountUSD: Math.round(ebitda / 52) },
        { label: 'interest paid', amountUSD: -Math.round(interestAnnual / 52) },
        { label: 'maintenance capex', amountUSD: -Math.round(comp.maintenanceCapex / 52) },
        { label: 'cash taxes', amountUSD: -Math.round(Math.max(0, (ebit - interestAnnual)) * 0.21 / 52) },
      ];
      const cash = comp.cash + privLedger.reduce((a, e) => a + e.amountUSD, 0);
      const coverage = Number(Math.max(-50, Math.min(50, ebit / Math.max(0.5, interestAnnual))).toFixed(2));
      const leverage = comp.totalDebt / Math.max(1, ebitda);
      const defaulted = comp.isDefaulted || (cash < 0 && coverage < DEFAULT_COVERAGE_FLOOR);
      const rating = defaulted ? 'D' as const : determineCreditRating(leverage, coverage);
      // SCALE: assigned onto the live object rather than rebuilt as a fresh ~150-field snapshot
      // per company per week (the literal's values are all evaluated before the first field is
      // assigned, so every read of `comp` inside it still sees the pre-assignment value). The
      // old snapshots were 2,600 tenured allocations a week feeding the GC's 12% share.
      return Object.assign(comp, {
        annualRevenue: revenue,
        revenueHistory: [...(comp.revenueHistory || []).slice(-12), revenue],
        ebitda, ebit, netIncome: Math.round(netIncome),
        cash: Number(cash.toFixed(0)),
        lastCashLedger: privLedger,
        leverage: Number(leverage.toFixed(2)),
        interestCoverage: coverage,
        isDefaulted: defaulted,
        creditRating: rating,
        ratingHistory: comp.creditRating === rating ? comp.ratingHistory : [...(comp.ratingHistory || []).slice(-12), rating],
        // HH5/HH6: a private firm is an employer like any other — it posts vacancies, consumes
        // real matches and pays a real wage. This path rebuilds from a fixed field list too,
        // so its headcount and wage were being silently dropped: the whole hidden tier hired
        // and fired in the labor market and then reverted to its old payroll every week.
        employeeCount: defaulted ? 0 : Math.max(1, Math.round(
          companyUpdates[comp.ticker]?.employeeCount ?? comp.employeeCount
        )),
        previousEmployeeCount: comp.employeeCount,
        offeredWageIndex: companyUpdates[comp.ticker]?.offeredWageIndex ?? comp.offeredWageIndex ?? 1.0,
        unfilledVacancyShare: companyUpdates[comp.ticker]?.unfilledVacancyShare ?? comp.unfilledVacancyShare ?? 0,
      });
    }

    const reg = updatedRegions[comp.region];
    const sec = SECTOR_BENCHMARKS[comp.sector];

    // Interest Expense (computed early so Banks can skip or use it if they had standard debt, but they mostly rely on BankingSector)
    const nonMaturingTranches = comp.debtTranches.filter(t => t.maturityWeek !== nextWeek);
    const annualInterest = nonMaturingTranches.reduce((sum, t) => {
      if (t.rateType === 'FIXED') return sum + t.principalUSD * (t.couponRate ?? 0.05);
      return sum + t.principalUSD * (reg.policyRate + (t.floatingMarginBps ?? 200) / 10000);
    }, 0);
    const weeklyInterest = annualInterest / 52;
    const effectiveDebtRate = annualInterest / Math.max(1, comp.totalDebt);
    const taxRate = 0.21;

    let updatedProductLines = comp.productLines || []; let newRevenue = 0;
    let baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
    let newEbitdaMargin = 0;
    let newEbitda = 0;
    let newEbit = 0;
    let newNetIncome = 0;
    let newEps = 0;
    let newInputSupplyConstraintFactor = comp.inputSupplyConstraintFactor ?? 1.0;
    let newRecentFulfillmentEMA = comp.recentFulfillmentEMA ?? 1.0;
    let targetProductionUSD = 0;
    let productionCostUSD = 0;
    let costDriversUSD: CogsCostDrivers | undefined;
    // IND1: what it costs to hold a good is a property of THE GOOD, not of the firm — warehouse
    // space per tonne divided by its value density, plus its own spoilage. The company-level
    // `inventoryCarryingCostRate` it replaces was one flat 0.02 charging a fab and a dairy alike
    // (rule 3: one representation, and it belongs on the thing being held).
    let carryingCostUSD = 0;
    const newOutputInventoryBySubUnit: Record<string, { unitsHeld: number; valueUSD: number }> = {};
    Object.entries(comp.outputInventoryBySubUnit || {}).forEach(([su, inv]) => {
      const costThisSubUnit = inv.valueUSD * (annualCarryingCostRateOf(su) / 52);
      carryingCostUSD += costThisSubUnit;
      newOutputInventoryBySubUnit[su] = { unitsHeld: inv.unitsHeld, valueUSD: Math.max(0, inv.valueUSD - costThisSubUnit) };
    });
    // 1$ is 1$ Phase 2: this week's real input inventory baseline is last week's held stock
    // plus whatever stage05 (which runs before this stage) already credited from real
    // purchases that cleared this week — consumption below draws down from that real total.
    const newInputInventoryBySubUnit: Record<string, InputLot[]> = {};
    Object.entries(comp.inputInventoryBySubUnit || {}).forEach(([su, lots]) => {
      // Aliased, not copied: nothing below mutates a lot array in place — the drawdown sorts a
      // .slice() and REPLACES the entry — and next week's writers (stage 05, goods-arrival)
      // copy-on-first-touch before appending. The defensive copy here duplicated every lot in
      // the world every week (~55k and growing under XB3a's foreign lots), all of it garbage.
      newInputInventoryBySubUnit[su] = lots;
    });
    Object.entries(companyUpdates[comp.ticker]?.inputInventoryBySubUnit || {}).forEach(([su, lots]) => {
      newInputInventoryBySubUnit[su] = lots as InputLot[];
    });

    let accruedTaxUSD = comp.accruedTaxLiabilityUSD ?? 0;
    const executionNoise = (random() - 0.5) * 0.3;
    const newExecutionQuality = ((comp.executionQuality ?? 1.0) * 0.92 + 1.0 * 0.08 + executionNoise * 0.08);


    // BP1c (rule 17): a stage does not switch on a kind — it keys the kind once and calls the
    // profile. The four financial statement paths live in stages/profiles/; the OPERATING path
    // below stays inline until IND2/IND3 decompose it into revenue-mechanism and cost-shape
    // profiles of their own.
    const profileModule = PROFILE_REGISTRY[profileKeyOf(comp)];
    if (profileModule) {
      const pnl = profileModule({ comp, reg, state, ctx, entityById, annualInterest, taxRate, perShare });
      newRevenue = pnl.newRevenue;
      newEbitdaMargin = pnl.newEbitdaMargin;
      newEbitda = pnl.newEbitda;
      newEbit = pnl.newEbit;
      newNetIncome = pnl.newNetIncome;
      newEps = pnl.newEps;
    } else {
      // Consumer Revenue Beta
      const creditTighteningPenalty = Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.015;

      // Weekly revenue transition
      const noise = (random() - 0.5) * 0.015;
      const baseRev = comp.baselineAnnualRevenue || comp.annualRevenue;

      // Re-anchor target annual revenue to baseline capacity adjusted for regional GDP and consumer momentum
      const pricingPowerBeta = SECTOR_PRICING_POWER[comp.sector] ?? 0.65;
      // Operating margins update (Wage-Push compression, capacity decay, and competitive crowding)
      const capacityDecayPenalty = Math.min(0.08, (comp.maintenanceShortfallStreak ?? 0) * 0.003); // up to 8% margin erosion after ~27 consecutive underfunded weeks
      const wageSensitivity = SECTOR_WAGE_SENSITIVITY[comp.sector] ?? 1.0;
      const compOccMix = SECTOR_OCCUPATION_MIX[comp.sector] ?? { GENERAL: 1.0 };
      const compWageGrowth = getBlendedWageGrowth(compOccMix, reg.occupationPools);
      const wageCompression = Math.max(0, compWageGrowth - 0.025) * 0.15 * wageSensitivity;
      const avgCrowdingIntensity = (comp.productLines || []).reduce((s, l) => {
        const catDemand = reg.categoryDemand[l.subUnitId as any];
        return s + (catDemand?.crowdingIntensity ?? 0) * l.revenueShare;
      }, 0);

      // A line's own _fulfillmentRatio (set on its OWN subUnitId entry by
      // 04-input-output.ts's demanderEntry loop) is "how much of THIS line's real input demand
      // got fulfilled" — not the input category's own _fulfillmentRatio (quantityFulfilled /
      // totalAvailableSupply on the supplier side), which reads LOW exactly when there's a
      // supply glut and demand is trivially met, the opposite of a real constraint. Reading the
      // supplier-side field here meant every company touching an input category collapsed
      // toward zero from an abundant supply, not a shortage.
      const linesNeedingInputs = (comp.productLines || []).filter(l => CATEGORY_INPUT_REQUIREMENTS[l.industry]);
      const relevantFulfillment = linesNeedingInputs.length > 0
        ? linesNeedingInputs.reduce((min, l) => Math.min(min, (reg.categoryDemand[l.subUnitId as any] as any)?._fulfillmentRatio ?? 1), 1)
        : 1;

      // 1$ is 1$ Phase 2: a real physical check on top of the regional market signal above —
      // draw down this company's actual held input inventory (real units bought at a real
      // price, credited by 05-unit-bidding.ts) by what its lines genuinely need this week
      // (estimated from last week's revenue, since this week's isn't final yet). Two real-world
      // wrinkles this has to account for, both confirmed by direct instrumentation:
      // 1. Even when a region's aggregate bid/offer auction clears in full, an individual
      //    company can still be filled 0% that one week purely from where its bid landed in
      //    the matching order — a real but noisy outcome. Folding it into the SAME smoothed
      //    0.7/0.3 EMA as relevantFulfillment (rather than a separate hard multiply on top)
      //    means one unlucky week nudges the factor down, it doesn't hard-crash it — the same
      //    smoothing principle already used for prices/production elsewhere in this pipeline.
      // 2. An input category can have zero real *public-company* suppliers anywhere in the
      //    region (confirmed: specialty_metals) — Phase 3 now gives such categories a real
      //    private-segment seller (PRIVATE_SEGMENT_SUPPLY_CATEGORIES in 05-unit-bidding.ts), so
      //    hasRealSupply below checks for that too; only a category with truly no real seller of
      //    any kind is excluded from the fulfillment computation, since enforcing a physical
      //    constraint nothing in the model can ever satisfy would be penalizing a company for a
      //    modeling gap, not a real economic condition.
      let physicalFulfillment = 1.0;
      // 1$ is 1$ Phase 6: the real dollar cost of whatever was actually consumed from real lots
      // this week — feeds the quarterly COGS breakdown's inputPriceCostUSD driver below, in
      // place of the old inputPriceDrag*revenue statistical proxy, so "raw materials cost" in
      // the financials reconciles to what this company genuinely paid its real suppliers for the
      // inputs it actually used, not an invented intensity ratio.
      let realInputConsumptionCostUSD = 0;
      linesNeedingInputs.forEach(l => {
        const reqs = CATEGORY_INPUT_REQUIREMENTS[l.industry];
        if (!reqs) return;
        const lineProductionUSD = (comp.annualRevenue / 52) * (l.revenueShare ?? 1.0);
        Object.entries(reqs).forEach(([inputSubUnit, intensity]) => {
          const neededUSD = lineProductionUSD * (intensity ?? 0);
          if (neededUSD <= 0) return;
          // A private-segment offer (05-unit-bidding.ts's PRIVATE_SEGMENT_SUPPLY_CATEGORIES) is
          // just as real a supply source as a public company's product line.
          const hasRealSupply = (suppliedSubUnitsByRegion.get(comp.region)?.has(inputSubUnit) ?? false)
            || PRIVATE_SEGMENT_SUPPLY_CATEGORIES[inputSubUnit] !== undefined;
          if (!hasRealSupply) return;
          const inputUnitPrice = (reg.categoryDemand[inputSubUnit as any] as any)?.unitPriceUSD ?? 1;
          const neededUnits = neededUSD / Math.max(0.01, inputUnitPrice);
          // 1$ is 1$ Phase 6: consume the OLDEST real lot first (FIFO) — a company holding units
          // bought from three different real sellers at three different prices draws down the
          // earliest purchase first, the way physical inventory actually gets used, rather than
          // one blended average cost standing in for all of them.
          const lots = (newInputInventoryBySubUnit[inputSubUnit] ?? []).slice().sort((a, b) => a.acquiredWeek - b.acquiredWeek);
          const availableUnits = lots.reduce((s, lot) => s + lot.unitsHeld, 0);
          const lineFulfillment = neededUnits > 0 ? Math.min(1, availableUnits / neededUnits) : 1;
          physicalFulfillment = Math.min(physicalFulfillment, lineFulfillment);
          let remainingToConsume = Math.min(availableUnits, neededUnits);
          const remainingLots: InputLot[] = [];
          for (const lot of lots) {
            if (remainingToConsume <= 0.0001) { remainingLots.push(lot); continue; }
            const consumedFromLot = Math.min(lot.unitsHeld, remainingToConsume);
            remainingToConsume -= consumedFromLot;
            realInputConsumptionCostUSD += consumedFromLot * lot.unitPriceUSD;
            const unitsLeftInLot = lot.unitsHeld - consumedFromLot;
            if (unitsLeftInLot > 0.0001) remainingLots.push({ ...lot, unitsHeld: unitsLeftInLot });
          }
          newInputInventoryBySubUnit[inputSubUnit] = remainingLots;
        });
      });
      const combinedFulfillment = Math.min(relevantFulfillment, physicalFulfillment);
      newInputSupplyConstraintFactor = ((comp.inputSupplyConstraintFactor ?? 1.0) * 0.7 + combinedFulfillment * 0.3);

      // Supply relationship shocks — read from the pre-loop snapshot (companies mutate in
      // place now, and this is the loop's one cross-company read; the snapshot carries the
      // pre-update figures every reader used to see).
      const rels = supplyRelsByCustomer.get(comp.id) ?? [];
      rels.forEach((rel) => {
        const stats = supplierShockStats.get(rel.supplierCompanyId);
        if (!stats) return;
        // The relationship's own category — a supplier's OTHER lines being backed up isn't this
        // customer's problem, only a glut in the specific good it actually buys from them.
        const supplierInvUSD = stats.invUSDByCategory.get(rel.category)!;
        if (supplierInvUSD > stats.annualRevenue * 0.15) {
          const distress = (supplierInvUSD / (stats.annualRevenue * 0.15)) - 1;
          newInputSupplyConstraintFactor *= (1 - Math.min(0.2, distress * rel.relationshipStrength * 0.1));
        }
      });


      // Same correction as relevantFulfillment above — inputCostPressure is written onto each
      // line's own subUnitId entry by 04-input-output.ts's demanderEntry loop, never onto the
      // input category's own entry.
      const inputPriceDrag = linesNeedingInputs.length > 0
        ? linesNeedingInputs.reduce((s, l) => s + ((reg.categoryDemand[l.subUnitId as any] as any)?.inputCostPressure ?? 0), 0) / linesNeedingInputs.length
        : 0;

      baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
      const baselineMargin = comp.baselineEbitdaMargin ?? (comp.ebitda / Math.max(1, comp.annualRevenue));
      const targetMargin = Math.min(0.65, Math.max(0.04, baselineMargin - wageCompression - capacityDecayPenalty - avgCrowdingIntensity * 0.08 - inputPriceDrag * 0.03));
      newEbitdaMargin = Math.min(0.65, Math.max(0.02, baseEbitdaMargin * 0.96 + targetMargin * 0.04 + (random() - 0.5) * 0.004));

      const growthCapexToRev = comp.baselineGrowthCapexToRevenueRatio ?? ((comp.growthCapex ?? (comp.capex * 0.4)) / Math.max(1, comp.annualRevenue));
      const estRateDrag = Math.max(0, effectiveDebtRate - 0.04) * 2.0;
      const estCashHealth = comp.cash < 0 ? 0.05 : (comp.cash < comp.currentLiabilities * 0.25 ? 0.4 : 1.0);
      const estTobinsQ = Math.max(0.1, Math.min(10.0, comp.marketCap / Math.max(1, comp.totalDebt + comp.annualRevenue * 1.5)));
      const estQCapexEffect = ((estTobinsQ - 1) * 0.2);
      const estAvgComp = (comp.productLines || []).reduce((s, l) => s + l.competitiveness, 0) / Math.max(1, (comp.productLines || []).length);
      const estCompEffect = (estAvgComp * 0.15);
      const estTargetGrowthCapex = baseRev * growthCapexToRev * (1 - estRateDrag) * estCashHealth * (1 + estQCapexEffect + estCompEffect);
      const estNewGrowthCapex = Math.max(0, (comp.growthCapex ?? (comp.capex * 0.4)) * 0.90 + estTargetGrowthCapex * 0.10);

      const growthInvestmentSignal = (((estNewGrowthCapex - (comp.growthCapex ?? (comp.capex * 0.4))) / Math.max(1, (comp.growthCapex ?? (comp.capex * 0.4)))) * newExecutionQuality);

      let categoryDrivenGrowth = 0;
      updatedProductLines = (comp.productLines || []).map((line) => {
        const catDemand = reg.categoryDemand[line.subUnitId];
        if (!catDemand) {
          throw new Error(`subUnitId ${line.subUnitId} does not exist in reg.categoryDemand for region ${reg.id}. Available: ${Object.keys(reg.categoryDemand).join(', ')}`);
        }
        const isHouseholdFacing = (INDUSTRY_SUBUNITS[line.industry]?.find(su => su.unitId === line.subUnitId)?.buyerMix.HOUSEHOLD ?? 0) > 0.5;
        const baseDemandGrowth = catDemand.demandGrowthAnnual ?? reg.gdpGrowth;
        const categoryGrowth = (isFinite(baseDemandGrowth) ? baseDemandGrowth : reg.gdpGrowth) - (isHouseholdFacing ? creditTighteningPenalty : 0);
        const marginEdge = (newEbitdaMargin - baseEbitdaMargin) * 2;
        const dominanceDrag = line.categoryMarketShare > 0.30 ? (line.categoryMarketShare - 0.30) * 0.5 : 0;
        const targetCompetitiveness = 2.0 * Math.tanh((marginEdge * 16 + growthInvestmentSignal * 0.5) / 2.0);
        const newCompetitiveness = Number((line.competitiveness * 0.98 + targetCompetitiveness * 0.02).toFixed(3));
        const shareGainRate = (newCompetitiveness * 0.035 - dominanceDrag);
        const newCategoryMarketShare = Math.max(0, line.categoryMarketShare * (1 + shareGainRate / 52)); // 0 floor only — a market share literally cannot go negative, this is a math guard not a behavioral clamp

        const lineGrowth = categoryGrowth + shareGainRate;

        categoryDrivenGrowth += (isFinite(lineGrowth) ? lineGrowth : 0) * (isFinite(line.revenueShare) ? line.revenueShare : 1);
        const shouldSnapshot = nextWeek % 13 === 0;
        return {
          ...line,
          previousCategoryMarketShare: line.categoryMarketShare,
          categoryMarketShare13WeeksAgo: shouldSnapshot ? line.categoryMarketShare : (line.categoryMarketShare13WeeksAgo ?? line.categoryMarketShare),
          competitiveness: newCompetitiveness,
          categoryMarketShare: newCategoryMarketShare,
        };
      });

      let commodityPriceGrowthAdjustment = 0;
      if ((comp as any).producedCommodityId) {
        const ownCommodity = updatedCommodities.find((c: any) => c.id === (comp as any).producedCommodityId || c.symbol === (comp as any).producedCommodityId);
        const baselinePrice = (ownCommodity as any)?.allTimeBaselinePrice ?? ownCommodity?.historicalPrices?.[0];
        if (ownCommodity && baselinePrice > 0) {
          const priceRatioVsBaseline = ownCommodity.spotPrice / baselinePrice;
          commodityPriceGrowthAdjustment = 0.5 * Math.tanh((priceRatioVsBaseline - 1) * 1.5);
        }
      }
      categoryDrivenGrowth += commodityPriceGrowthAdjustment;

      const buffer = comp.demandShockLagBuffer || [];
      const updatedBuffer = [...buffer, categoryDrivenGrowth].slice(-8);
      const laggedCategoryGrowth = updatedBuffer.length > 2 ? updatedBuffer[updatedBuffer.length - 1 - 2] : updatedBuffer[0] ?? categoryDrivenGrowth;
      comp.demandShockLagBuffer = updatedBuffer;

      // XB3a deleted the export revenue boost that used to sit here. A firm's foreign sales are
      // not a growth adjustment applied to a formula — they are its real fills in stage 05's
      // world book, already settled into salesUSD and cash by the time this stage runs. Adding a
      // second export term on top counted the same sale twice, from two mechanisms (rule 3).
      const distressPenalty = comp.isDefaulted ? 0.50 : 1.0;
      const annualGrowthRate = laggedCategoryGrowth + noise + reg.inflation * pricingPowerBeta;

      const weeklyGrowthRate = Math.max(-0.05, Math.min(0.05, annualGrowthRate / 52));
      const targetAnnualRevenue = baseRev * (1 + weeklyGrowthRate) * distressPenalty * newInputSupplyConstraintFactor;

      // Smooth transition to target revenue (no exponential weekly compounding)
      newRevenue = Math.max(10, (comp.annualRevenue * 0.90) + (targetAnnualRevenue * 0.10));

      const industrialLine = (comp.productLines || []).find(l => l.subUnitId === 'heavy_equipment' || l.subUnitId === 'industrial_automation' || l.subUnitId === 'industrial_chemicals');
      let unsoldThisWeekUSD = 0;

      // 1$ is 1$ Phase 1: stage 05 already ran this week's real per-unit auction for every one
      // of this company's product lines (it runs before this stage) — production, sales, and
      // inventory (per sub-unit) are already fully reconciled there against real named buyers.
      // Read that real, company-wide aggregate directly instead of only doing so for the
      // industrial-goods special case: every company's revenue now feels the same real
      // shortfall/surplus signal from the actual bid/offer market, not just three sub-units.
      // (Previously the statistical revenue formula above was the sole authority for every
      // non-industrial company, with stage05's real settled sales having no effect on revenue
      // at all.) Recomputing an independent production estimate from a raw, unsmoothed price
      // signal — rather than reading stage05's own smoothed-price-based figure — is what
      // previously duplicated this model with a second, inconsistent one and caused a collapse;
      // reading stage05's own figures directly keeps one authoritative production number.
      const update = companyUpdates[comp.ticker];
      const salesUSD = update?.salesUSD ?? 0;
      targetProductionUSD = update?._targetProductionUSD ?? newRevenue / 52;
      productionCostUSD = targetProductionUSD * (1 - newEbitdaMargin);
      unsoldThisWeekUSD = Math.max(0, targetProductionUSD - salesUSD);
      newRecentFulfillmentEMA = (comp.recentFulfillmentEMA ?? 1.0) * 0.85 + (salesUSD > 0 ? 1.0 : 0.0) * 0.15;
      if (industrialLine && industrialLine.revenueShare > 0) {
        const lineSubUnitId = industrialLine.subUnitId;
        newOutputInventoryBySubUnit[lineSubUnitId] = update?.outputInventoryBySubUnit?.[lineSubUnitId]
          ?? newOutputInventoryBySubUnit[lineSubUnitId]
          ?? { unitsHeld: 0, valueUSD: 0 };
      }

      const revenueAdjustmentForUnsold = -unsoldThisWeekUSD * 0.5;
      newRevenue = Math.max(10, newRevenue + revenueAdjustmentForUnsold);
      comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];

      newEbitda = newRevenue * newEbitdaMargin;
      const da = newRevenue * 0.05;
      newEbit = Math.max(1, newEbitda - da);

      newNetIncome = (newEbit - annualInterest) * (1 - taxRate);
      newEps = perShare(newNetIncome);

      // Quarterly dollar impact of the same cost drivers that moved targetMargin above —
      // this is what backs the COGS breakdown shown in the deep financials drill-down, so it
      // reconciles to the actual weekly margin mechanics rather than an invented split.
      const revQ = newRevenue / 4;
      costDriversUSD = {
        wagePressureUSD: wageCompression * revQ,
        // 1$ is 1$ Phase 6: real dollars actually paid for real lots actually consumed this
        // week (realInputConsumptionCostUSD, above), expressed as a share of this week's real
        // production and scaled to the same quarterly-dollar convention as the other drivers —
        // not inputPriceDrag's statistical intensity guess. A company with no real recipe
        // input requirement (or no real supplier for one) correctly gets 0 here, falling to
        // baseCostUSD's residual bucket instead of an invented nonzero cost.
        inputPriceCostUSD: (realInputConsumptionCostUSD / Math.max(1, targetProductionUSD)) * revQ,
        capacityDecayCostUSD: capacityDecayPenalty * revQ,
        crowdingCostUSD: avgCrowdingIntensity * 0.08 * revQ,
      };
    }

    // Maintenance — funded, not assumed:
    // 1. What maintenance WOULD cost if fully funded (capacity-based target)
    const maintenanceCapexToRevenueRatio = (comp.maintenanceCapex ?? (comp.capex * 0.6)) / Math.max(1, comp.annualRevenue);
    const targetMaintenanceCapex = newRevenue * maintenanceCapexToRevenueRatio;
    const weeklyDesiredMaintenanceCapex = targetMaintenanceCapex / 52;

    // 2. What the company can actually fund this week — operating cash + a small cash draw + limited new borrowing (IG only), never unlimited
    const weeklyOperatingCashFlow = newEbitda / 52 - weeklyInterest;
    // Was a second inline copy of the same rating list the allocator owns (rule 3) — and it
    // shadowed the imported helper, which is how the shadowing surfaced.
    const maintenanceBorrowingCapacity = isInvestmentGrade(comp.creditRating) ? weeklyDesiredMaintenanceCapex * 0.5 : 0; // a distressed company cannot borrow its way out of deferred upkeep
    const availableFundingForMaintenance = Math.max(0, weeklyOperatingCashFlow) + Math.max(0, comp.cash) * 0.05 + maintenanceBorrowingCapacity;

    // 3. Fund what's affordable, defer the rest
    const weeklyFundedMaintenance = Math.min(weeklyDesiredMaintenanceCapex, availableFundingForMaintenance);
    const fundedMaintenanceCapex = weeklyFundedMaintenance * 52;
    const maintenanceShortfallThisWeek = Math.max(0, targetMaintenanceCapex - fundedMaintenanceCapex);
    const weeklyDebtFundedPortion = Math.max(0, Math.min(weeklyFundedMaintenance, maintenanceBorrowingCapacity) - Math.max(0, weeklyOperatingCashFlow));
    const newMaintenanceCapex = Math.max(0, (comp.maintenanceCapex ?? (comp.capex * 0.6)) * 0.95 + fundedMaintenanceCapex * 0.05);

    // 4. Debt-funded maintenance becomes a real new floating tranche — genuinely raises leverage and next week's interest, not a free lunch
    let maintenanceFundingTranches: DebtTranche[] = [];
    if (weeklyDebtFundedPortion > 1000) {
      const currentBaseSpreadBps = comp.oasSpreadBps;
      const newTrancheMaturityWeek = nextWeek + STANDARD_CORP_TENOR_YEARS * 52;
      maintenanceFundingTranches = [{
        id: `${comp.ticker}-MAINT-${nextWeek}`,
        principalUSD: weeklyDebtFundedPortion,
        rateType: 'FLOATING',
        floatingMarginBps: Math.round(currentBaseSpreadBps * 1.1), // priced wide — bridge/revolver-style, not term financing
        originationWeek: nextWeek,
        maturityWeek: newTrancheMaturityWeek,
        seniority: 'SENIOR',
        // G2: a bridge is BANK debt — it lives on the house bank's itemized book and its
        // interest is paid to that bank, not to the loan market (the §6 double-count).
        isBankFacility: true,
        facilityBankTicker: comp.homeBankTicker,
      }];
    }

    // 5. Deferred maintenance compounds into real operational decay
    const newMaintenanceShortfallStreak = maintenanceShortfallThisWeek > 0
      ? (comp.maintenanceShortfallStreak ?? 0) + 1
      : Math.max(0, (comp.maintenanceShortfallStreak ?? 0) - 2); // recovers twice as fast as it accumulates

    // Growth — fully discretionary, now disciplined by addressable opportunity:
    // Genuine reinvestment opportunity — bounded by how fast this company's actual addressable categories are growing, not by ambition
    const avgCategoryOpportunity = (comp.productLines || []).reduce((s, l) => {
      const catDemand = reg.categoryDemand[l.subUnitId];
      return s + Math.max(0, catDemand?.demandGrowthAnnual ?? 0) * l.revenueShare;
    }, 0);
    const productiveReinvestmentEnvelope = newRevenue * Math.max(0.01, avgCategoryOpportunity) * 1.5; // generous multiple of addressable growth, not arbitrary

    const fcfBeforeGrowthCapex = Math.max(0, weeklyOperatingCashFlow * 52 - newMaintenanceCapex);
    const excessCashGeneration = Math.max(0, fcfBeforeGrowthCapex - productiveReinvestmentEnvelope);
    const payoutPressure = fcfBeforeGrowthCapex > 0 ? Math.min(1, excessCashGeneration / fcfBeforeGrowthCapex) : 0;

    const growthCapexToRevenueRatio = comp.baselineGrowthCapexToRevenueRatio ?? ((comp.growthCapex ?? (comp.capex * 0.4)) / Math.max(1, comp.annualRevenue));
    const rateDrag = Math.max(0, effectiveDebtRate - 0.04) * 2.0;
    const cashHealthFactor = comp.cash < 0 ? 0.05 : (comp.cash < comp.currentLiabilities * 0.25 ? 0.4 : 1.0);
    const safeMarketCap = Math.max(0, isFinite(comp.marketCap) ? comp.marketCap : 0);
    const safeTotalDebt = Math.max(0, isFinite(comp.totalDebt) ? comp.totalDebt : 0);
    const safeRev = Math.max(1, isFinite(comp.annualRevenue) ? comp.annualRevenue : 1);
    const tobinsQ = Math.max(0.1, Math.min(10.0, safeMarketCap / Math.max(1, safeTotalDebt + safeRev * 1.5)));
    const qCapexEffect = ((tobinsQ - 1) * 0.2);
    const avgCompetitiveness = (comp.productLines || []).reduce((s, l) => s + l.competitiveness, 0) / Math.max(1, (comp.productLines || []).length);
    const competitivenessCapexEffect = (avgCompetitiveness * 0.15);
    const growthCapexAllocationShare = Math.max(0.4, 1 - payoutPressure * 0.75); // even at max payout pressure, still reinvests at least 40% — realistic, not zero
    const targetGrowthCapex = newRevenue * growthCapexToRevenueRatio * (1 - rateDrag) * cashHealthFactor * (1 + qCapexEffect + competitivenessCapexEffect) * growthCapexAllocationShare;
    let newGrowthCapex = Math.max(0, (comp.growthCapex ?? (comp.capex * 0.4)) * 0.90 + targetGrowthCapex * 0.10);
    let newRndExpense = comp.rndExpense ?? 0;
    if ((comp.productLines || []).some(l => l.industry === 'TechHardwareSemis' || l.industry === 'SoftwareDigitalServices')) {
      newRndExpense = newGrowthCapex * 0.4;
      newGrowthCapex = newGrowthCapex * 0.6;
    }

    const growthCapexIntensity = (newGrowthCapex - (comp.growthCapex ?? 0)) / Math.max(1, comp.growthCapex ?? 1);
    const isAutomating = growthCapexIntensity > 0.05 && newExecutionQuality > 1.0;
    const newOccupationMixDrift = { ...(comp.occupationMixDrift || {}) };
    if (isAutomating) {
      newOccupationMixDrift.TECHNICAL_ENGINEERING = Math.min(0.15, (newOccupationMixDrift.TECHNICAL_ENGINEERING ?? 0) + 0.001);
      newOccupationMixDrift.GENERAL = Math.max(-0.15, (newOccupationMixDrift.GENERAL ?? 0) - 0.001);
    }

    const newCapex = comp.sector === 'Banks' ? 0 : (newMaintenanceCapex + newGrowthCapex);

    // PP&E roll-forward: a genuine stock (gross cost less accumulated depreciation), not a
    // static totalDebt-derived formula — grows with actual weekly capex spend and runs down on
    // a sector-appropriate straight-line useful life, so "how is PPE being depreciated" has a
    // real, inspectable mechanism behind it.
    const priorGrossPPE = comp.grossPPEUSD ?? (comp.annualRevenue * (SECTOR_PPE_INTENSITY[comp.sector] ?? 0.5));
    const priorAccumulatedDepreciation = comp.accumulatedDepreciationUSD ?? (priorGrossPPE * 0.45);
    const usefulLifeYears = SECTOR_PPE_USEFUL_LIFE_YEARS[comp.sector] ?? 12;
    const weeklyDepreciation = priorGrossPPE / (usefulLifeYears * 52);
    // IND1: the plant grows by what was actually DELIVERED, not by what was budgeted. A machine
    // ordered is not PP&E — capex is a bid into a real market that can go unfilled or arrive
    // weeks later by ship, and investment showing up after the demand that justified it is the
    // mechanism behind every capacity cycle. (`newCapex / 52` capitalised the intention.)
    const capexDeliveredThisWeekUSD = companyUpdates[comp.ticker]?.capexDeliveredUSD ?? 0;
    const newGrossPPEUSD = priorGrossPPE + capexDeliveredThisWeekUSD;
    const newAccumulatedDepreciationUSD = Math.min(newGrossPPEUSD, priorAccumulatedDepreciation + weeklyDepreciation);

    // ---- S5: the weekly cash walk is an explicit ledger ----
    // One posting helper is the single write path to cash; every entry is a named real flow.
    // The previous walk triple-counted the operating side: an EBITDA/52 accrual PLUS stage 05's
    // real settled cashChange PLUS a separate productionCost subtraction — three overlapping
    // descriptions of one week's operations. Here each real dollar enters exactly once:
    // settled auction flows at their real amounts, and accruals ONLY for the parts of the
    // business the auction does not settle (non-auction receipts; wages and other unsettled
    // costs; capex beyond what was bought as real units). EBITDA is a reporting figure.
    const cashLedger: { label: string; amountUSD: number }[] = [];
    let newCash = comp.cash;
    // SETL2: a ledger entry IS a payment instruction. The S5 walk already named every flow and
    // its amount; what it never named was the OTHER SIDE, which is why corporate cash could move
    // without any bank knowing (§7.86). Each post now names a counterparty; where the model does
    // not have one yet it says so explicitly (`UNMODELED`), and the size of that line is the
    // honest measure of how much of the payment graph is still unnamed — a number to watch down
    // as later slices name each flow, not a plug (rule 13).
    const post = (label: string, amountUSD: number, counterparty?: PartyRef) => {
      if (!isFinite(amountUSD) || amountUSD === 0) return;
      cashLedger.push({ label, amountUSD: Number(amountUSD.toFixed(0)) });
      newCash += amountUSD;
      const other: PartyRef = counterparty ?? { kind: 'UNMODELED', region: comp.region };
      const self: PartyRef = { kind: 'COMPANY', ticker: comp.ticker };
      pay(ctx, amountUSD > 0
        ? { payer: other, payee: self, amountUSD, reason: label }
        : { payer: self, payee: other, amountUSD: -amountUSD, reason: label });
    };

    const update = companyUpdates[comp.ticker];
    if (comp.sector === 'Banks') {
      // A bank's real flows live on its named balance sheet (02b); the company-level cash line
      // carries only the accrual bridge, as before, now as one visible entry.
      post('bank net income accrual', newNetIncome / 52);
    } else {
      const settledSalesUSD = update?.salesUSD ?? 0;
      const settledPurchasesUSD = update?.purchasesUSD ?? 0;
      post('settled sales (real auction receipts)', settledSalesUSD);
      post('settled purchases (real auction: inputs + capex)', -settledPurchasesUSD);
      // XB3a-5: a cross-border sale is delivered and INVOICED, not collected. Revenue is
      // recognised in full at delivery above; the cash is backed out here and posted when the
      // invoice falls due, at whatever the invoice currency is then worth. The gap between the
      // two is the transaction FX exposure, and it lands as real cash rather than a statistic.
      post('cross-border sales invoiced, not yet collected', -(update?.tradeReceivableBookedUSD ?? 0));
      post('cross-border invoices collected', update?.tradeReceivableCollectedUSD ?? 0);
      post('cross-border purchases invoiced, not yet paid', update?.tradePayableBookedUSD ?? 0);
      post('cross-border invoices paid', -(update?.tradePayableSettledUSD ?? 0));
      // Revenue recognized beyond what cleared in the auction still collects — customers in the
      // parts of the business the modeled markets do not cover yet.
      post('non-auction operating receipts', Math.max(0, newRevenue / 52 - settledSalesUSD));
      // ...and the costs of running the whole business beyond what was bought as real units:
      // wages, services, and the unsettled share of capex. Settled purchases already left as
      // real cash above, so only the excess of total accrued outflows over them posts here.
      // IND1: capex left as REAL CASH in `settled purchases` above, so accruing it again here
      // paid for the same machine twice. What accrues is the operating side, and it nets only
      // against the operating share of what really settled.
      const accruedOutflowsWeekly = (newRevenue - newEbitda) / 52;
      const capexSettledUSD = update?.capexPurchasesUSD ?? 0;
      post('wages & other opex beyond auction settlements', -Math.max(0, accruedOutflowsWeekly - Math.max(0, settledPurchasesUSD - capexSettledUSD)));
      post('inventory carrying cost', -carryingCostUSD);
      // The lenders: bank facilities are paid to the house bank, market paper to its holders.
      // Splitting the two is SETL4's (the register decides who receives); until then the whole
      // leg names the boundary rather than paying the wrong counterparty.
      post('interest paid', -weeklyInterest);
      // PUB1b: tax ACCRUES weekly and is REMITTED quarterly, as real firms pay it. The money
      // now arrives somewhere — the treasury's account — instead of leaving the model.
      const weeklyAccrualUSD = Math.max(0, (newEbit - annualInterest)) * (reg.effectiveTaxRate ?? 0.21) / 52;
      accruedTaxUSD += weeklyAccrualUSD;
      ctx.taxAccruedByRegion[comp.region] = (ctx.taxAccruedByRegion[comp.region] ?? 0) + weeklyAccrualUSD;
      // currentWeekMod13 runs 1..13, never 0 — the quarter ends on 13.
      if (currentWeekMod13 === 13 && accruedTaxUSD > 0) {
        post('cash taxes (quarterly remittance)', -accruedTaxUSD, { kind: 'GOVERNMENT', region: comp.region });
        ctx.taxCollectedByRegion[comp.region] = (ctx.taxCollectedByRegion[comp.region] ?? 0) + accruedTaxUSD;
        accruedTaxUSD = 0;
      }
      // Dividends actually leave (they were declared and never deducted — the plan's leak #2).
      // Sized by the board's REAL constraint — earnings — not by yield x market cap: the equity
      // level is a known-inflated formula until WS4, and paying a real 2-3% yield on a fake 30B
      // cap bled 10x a real dividend out of every profitable company (measured in this ledger's
      // first week of existence: 15-25M/wk against 20M/wk of sales). A board pays out a share of
      // what the company earns; the declared yield stands only when earnings cover it.
      const declaredDividendWeekly = Math.max(0, (comp.dividendYield ?? 0) * comp.marketCap) / 52;
      const maxSustainableWeekly = Math.max(0, newNetIncome) * MAX_DIVIDEND_PAYOUT_RATIO / 52;
      post('dividends paid', -Math.min(declaredDividendWeekly, maxSustainableWeekly));
      post('maintenance funding draw (new tranche proceeds)', weeklyDebtFundedPortion);
    }
    let newTotalDebt = comp.totalDebt;

    const newBaselineDividendYield = Number((comp.baselineDividendYield * 0.998 + comp.dividendYield * 0.002).toFixed(4));
    const targetDivYield = newBaselineDividendYield * (newCash < 0 ? 0.4 : (newCash > 2 * comp.currentLiabilities ? 1.2 : 1.0)) * (1 + payoutPressure * 2.5);
    const newDividendYield = Math.max(0, comp.dividendYield * 0.9 + targetDivYield * 0.1);

    // HH5: headcount is the LABOR MARKET's, not this stage's. The drift multiplier that used
    // to sit here (cash < 0 ? -1.5% : margin/regime nudges) ran every week and silently
    // overwrote the hires and layoffs the matching stage had just settled — two representations
    // of one firm's payroll, and the newer one lost. Measured before the fix: the occupation
    // pools ran 3.9% above the employers' own books by week 43 and drifted further every week.
    // A firm's headcount now changes in exactly one place, and the real cash-distress layoffs
    // that formula was reaching for live there too.
    const newEmployeeCount = Math.max(10, Math.round(
      companyUpdates[comp.ticker]?.employeeCount ?? comp.employeeCount
    ));

    // (S5: the prepayment rule moved below, where the real tranche ladder exists to retire —
    // the old version here debited cash and decremented a scalar the ladder recomputation then
    // silently restored: cash gone, debt not. Leak #3, and likely a real default driver.)

    // Credit metrics
    const rawLeverage = comp.sector === 'Banks'
      ? (newTotalDebt / Math.max(1, newRevenue * 0.4))
      : (newTotalDebt / Math.max(1, newEbitda));
    const newLeverage = isFinite(rawLeverage) ? Number(Math.max(0, Math.min(100, rawLeverage)).toFixed(2)) : 5.0;

    const rawCoverage = comp.sector === 'Banks'
      ? (reg.bankingSector.bankCapitalRatio < 0.05 ? 0.4 : 3.0)
      : (newEbit / Math.max(0.5, annualInterest));
    const newCoverage = isFinite(rawCoverage) ? Number(Math.max(-50, Math.min(50, rawCoverage)).toFixed(2)) : 1.5;

    // Default trigger: cash exhausted AND coverage below the shared floor (or previously
    // defaulted, provided not merger-acquired). DEFAULT_COVERAGE_FLOOR is the single definition
    // of this trigger — the same object the credit market prices its hazard against
    // (computeAnnualDefaultProbability), so priced risk and realized risk are one model.
    let isDefaulted = !comp.mergerAcquired && (comp.isDefaulted || (newCash < 0 && newCoverage < DEFAULT_COVERAGE_FLOOR));

    let newRating = comp.creditRating;

    if (isDefaulted) {
      newRating = 'D';
      if (!comp.isDefaulted) {
        ctx.defaultedTickers.push(comp.ticker);
        comp.defaultedWeek = nextWeek;
        newRevenue = Number((newRevenue * 0.4).toFixed(1));
        newEbitda = 0;
        newEbit = 0;
      }
    } else {
      const calculatedRating = determineCreditRating(newLeverage, newCoverage);
      // Wall Street: rating migration is deliberately sticky (a 25%/week chance to move even one
      // notch) to mirror how real rating agencies don't instantly re-rate every week — but the
      // bond-implied spread (real institutional order flow tilted by computeExpectedLossSpreadBps
      // in 07b-corporate-bond-clearing.ts, run before this stage) reacts to this company's real
      // leverage/coverage every week with NO such lag, so a company whose fundamentals actually
      // deteriorated fast could sit at a stale investment-grade rating for dozens of weeks while
      // its own spread already prices default risk (confirmed: an A-rated company observed at
      // the 5000bps spread ceiling — CCC/distressed pricing under a rating three-plus notches
      // stale). Real rating agencies don't let this go on indefinitely either — a severe,
      // multi-notch gap (or crossing the investment-grade/high-yield line) triggers a real
      // "fallen angel" cliff downgrade, not another 25% coin flip. Force an immediate update once
      // the gap is that large; keep the stochastic lag only for ordinary single-notch drift.
      const RATING_ORDER: typeof calculatedRating[] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'];
      const notchGap = Math.abs(RATING_ORDER.indexOf(calculatedRating) - RATING_ORDER.indexOf(comp.creditRating));
      const crossesIgHyLine = getRatingBucket(calculatedRating) !== getRatingBucket(comp.creditRating);
      const forceUpdate = notchGap >= 2 || crossesIgHyLine;
      if (calculatedRating !== comp.creditRating && (forceUpdate || random() < 0.25)) {
        ctx.ratingChanges.push({
          ticker: comp.ticker,
          from: comp.creditRating,
          to: calculatedRating,
          name: comp.name,
        });
        newRating = calculatedRating;
      }
    }

    // Wall Street: comp.oasSpreadBps (07b-corporate-bond-clearing.ts) and
    // comp.leveragedLoan.discountMarginBps (07d-leveraged-loan-clearing.ts) are both now real,
    // already-cleared values, set from actual institutional-entity order flow against the bank
    // dealer desk before this stage ever runs. Nothing here computes or smooths either one.

    // Pre-refinancing trigger roughly one year before maturity
    let companyTranches = comp.debtTranches.map(t => ({ ...t }));
    // The issuer's real float BEFORE any of this week's corporate actions — the accretive call
    // below, the maturity and refinancing further down, all of it. Everything that changes the
    // amount of this issuer's paper in existence is settled against its holders once, at the end,
    // by comparing against this. Snapshotting after the call block (the first attempt) missed the
    // single largest source of change: the call can retire an entire tranche in one week, and
    // sampled issuers lost ~88% of their fixed float to it inside five weeks.
    // CP excluded on both sides: bondholders own none of it, so a CP issue or roll must not
    // scale their books (settleCorporateActionOnHolders keys off these two floats).
    // WS8: a settled primary was ALREADY placed with the holders by the auction itself — the
    // engine allocated the new float and settled the cash legs. Count its size as pre-existing
    // here, or the pro-rata action settlement below hands holders the same paper twice.
    const settlement = primarySettlementByIssuerId.get(comp.id);
    const primaryFixedAdjUSD = settlement && !settlement.withdrawn && settlement.offering.rateType === 'FIXED' ? settlement.marketTakeUSD : 0;
    const primaryFloatingAdjUSD = settlement && !settlement.withdrawn && settlement.offering.rateType === 'FLOATING' ? settlement.marketTakeUSD : 0;
    const preActionFixedUSD = companyTranches.filter(t => t.rateType === 'FIXED' && !t.isCommercialPaper).reduce((s, t) => s + t.principalUSD, 0) + primaryFixedAdjUSD;
    const preActionFloatingUSD = companyTranches.filter(t => t.rateType === 'FLOATING' && !t.isBankFacility).reduce((s, t) => s + t.principalUSD, 0) + primaryFloatingAdjUSD;

    /**
     * What retiring `amountUSD` of `tranche` early costs this issuer ON TOP of the principal —
     * the call premium (`domain/call-protection.ts`). Zero at maturity and on bank facilities;
     * real everywhere else, which is what makes a refinancing an economic decision.
     */
    const callPremiumUSD = (t: DebtTranche, amountUSD: number): number => {
      if (!(amountUSD > 0)) return 0;
      const remainingYears = Math.max(0.5, (t.maturityWeek - state.currentWeek) / 52);
      const riskFree = calculateNelsonSiegelZeroRate(remainingYears, reg.yieldCurveParams);
      return amountUSD * (callPricePerDollar(t, state.currentWeek, riskFree) - 1);
    };
    /**
     * Is retiring this paper early worth what it costs, and how does it rank against the rest of
     * the stack? The saving is the rate the tranche carries ABOVE what this issuer would pay for
     * the same money today, over the paper's remaining life; the cost is the call premium.
     *
     * This is the test a make-whole is built to fail — the premium IS the present value of the
     * saving — and that is the point: a company with surplus cash pays down its revolver and its
     * loans whose soft call has expired, and leaves its long bonds alone, which is what real
     * treasuries do. Without the test, surplus-cash prepayment make-whole'd 10-year paper at a
     * measured 15% premium and handed bondholders 854M in sixty weeks for nothing.
     */
    const retirementEconomics = (t: DebtTranche) => {
      const remainingYears = Math.max(0.5, (t.maturityWeek - state.currentWeek) / 52);
      const riskFree = calculateNelsonSiegelZeroRate(remainingYears, reg.yieldCurveParams);
      const annualRate = t.rateType === 'FIXED'
        ? (t.couponRate ?? 0)
        : reg.policyRate + (t.floatingMarginBps ?? 0) / 10000;
      const fairRateToday = t.rateType === 'FIXED'
        ? riskFree + comp.oasSpreadBps / 10000
        : reg.policyRate + comp.oasSpreadBps / 10000;
      const premiumPerDollar = callPremiumUSD(t, 1);
      const discount = Math.max(1e-6, fairRateToday);
      const savingPvPerDollar =
        (annualRate - fairRateToday) * ((1 - Math.pow(1 + discount, -remainingYears)) / discount);
      return {
        premiumPerDollar,
        // Paper that can be retired at PAR is always worth retiring with surplus cash: it costs
        // nothing and stops the interest. Only paper that charges to get out has to clear the
        // arbitrage. Gating both alike blocked the revolver paydown too and cut prepayment 97%,
        // which is not what call protection is supposed to do.
        worthRetiring: premiumPerDollar <= 1e-9 || savingPvPerDollar > premiumPerDollar,
        // Rate given up per dollar it costs to give it up — the treasurer's ranking.
        valuePerCost: annualRate / (1 + premiumPerDollar),
      };
    };

    /** Premiums owed to holders this week, by the book that owns the paper. */
    let bondCallPremiumUSD = 0;
    let loanCallPremiumUSD = 0;
    const recordPremium = (t: DebtTranche, premiumUSD: number) => {
      if (!(premiumUSD > 0)) return;
      if (t.rateType === 'FIXED') bondCallPremiumUSD += premiumUSD;
      else loanCallPremiumUSD += premiumUSD;
      post('call premium paid to holders', -premiumUSD);
    };

    // Corporate debt lifecycle: call and refinance when genuinely accretive
    const calledRefinanceTranches: DebtTranche[] = [];
    companyTranches.forEach(tranche => {
      if (tranche.rateType !== 'FIXED' || tranche.isCommercialPaper) return;
      const remainingYears = Math.max(0.5, (tranche.maturityWeek - state.currentWeek) / 52);
      const currentFairRate = calculateNelsonSiegelZeroRate(remainingYears, reg.yieldCurveParams) + comp.oasSpreadBps / 10000;
      const rateSavingsIfRefinanced = tranche.couponRate - currentFairRate;
      const excessCashAvailable = newCash > comp.annualRevenue * 0.15;
      // The real test is not "is the coupon above the market" — it is whether the saving is worth
      // what the call costs. A treasurer discounts the coupon saving over the paper's remaining
      // life and compares it to the premium; below that line the bond stays outstanding.
      //
      // Without this an issuer called at PAR for free the moment rates moved 1% its way, which is
      // an option no lender writes. It is also what a make-whole exists to neutralise: for an IG
      // bond the premium IS the present value of the saving, so a purely rate-driven call never
      // clears this test and an IG issuer calls for a real reason instead.
      const premiumPerDollar = callPricePerDollar(tranche, state.currentWeek, currentFairRate - comp.oasSpreadBps / 10000) - 1;
      const discount = Math.max(1e-6, currentFairRate);
      const savingPvPerDollar = rateSavingsIfRefinanced * ((1 - Math.pow(1 + discount, -remainingYears)) / discount);
      if (savingPvPerDollar > premiumPerDollar && rateSavingsIfRefinanced > 0.01 && excessCashAvailable && newRating !== 'CCC' && newRating !== 'D') {
        // Cash has to cover the premium too, so the callable size is smaller than the free version.
        const budgetUSD = newCash - comp.annualRevenue * 0.15;
        const calledAmountUSD = Math.min(tranche.principalUSD, budgetUSD / (1 + premiumPerDollar));
        tranche.principalUSD -= calledAmountUSD;
        post('accretive call: principal retired', -calledAmountUSD);
        recordPremium(tranche, calledAmountUSD * premiumPerDollar);
        // Calling a bond because it is expensive relative to the market is REFINANCING, not
        // deleveraging: the issuer replaces it at today's cheaper rate and keeps the money. The
        // saving is the lower coupon, which is what `rateSavingsIfRefinanced` above measures.
        //
        // This used to retire the tranche with cash and stop there, which is a different
        // transaction entirely — it shrank the issuer's debt every time rates moved in its
        // favour. Across the market that meant the corporate bond float fell by half inside six
        // months and 73 of 200 issuers had no bonds left at all: the asset class 07b exists to
        // clear was quietly disappearing, and what remained was a float small enough that ordinary
        // flow moved its spread hundreds of basis points a week.
        if (calledAmountUSD > 0.01) {
          calledRefinanceTranches.push({
            id: `${comp.id}-CALL-${state.currentWeek}-${tranche.id}`,
            principalUSD: calledAmountUSD,
            rateType: 'FIXED',
            couponRate: currentFairRate,
            originationWeek: state.currentWeek,
            maturityWeek: state.currentWeek + STANDARD_CORP_TENOR_YEARS * 52,
            seniority: 'SENIOR',
            callProtection: callProtectionForIssue({ rateType: 'FIXED', isInvestmentGrade: isInvestmentGrade(newRating) }),
          });
          post('accretive call: replacement issue proceeds', calledAmountUSD);
        }
      }
    });
    // Remove any tranche whose principalUSD reaches zero, then add the replacement issues.
    companyTranches = companyTranches.filter(t => t.principalUSD > 0.01);
    if (calledRefinanceTranches.length > 0) companyTranches = [...companyTranches, ...calledRefinanceTranches];

    // WS8: the year-early pre-refi and the at-maturity formula roll are both gone — a roll now
    // happens in the MARKET. A tranche one week from maturity is announced as a REFINANCE
    // offering (rate type per the issuer's CURRENT rating mix); next week 07b/07d price it
    // alongside the outstanding stock, and the settlement below either delivers the new
    // tranche at the CLEARED terms or — withdrawn/unpriced — the revolver catches the issuer
    // at its penalty rate, the same real funding-squeeze mechanism as a failed CP roll.
    const fiveYearSovRate = calculateNelsonSiegelZeroRate(5, updatedRegions[comp.region].yieldCurveParams);
    companyTranches.forEach((tranche) => {
      if (tranche.isCommercialPaper) return;
      if (tranche.maturityWeek !== nextWeek + 1) return;
      if (pendingOfferingIssuerIds.has(comp.id)) return; // one live book per issuer
      const refinanceAsFixed = (FIXED_SHARE_BY_RATING[comp.creditRating] ?? 0.5) >= 0.5;
      const revolverAllInAnnual = reg.policyRate + REVOLVER_MARGIN_BPS / 10000;
      enqueueOffering({
        id: `PO-${comp.id}-${nextWeek}-REFI`,
        issuerId: comp.id,
        issuerTicker: comp.ticker,
        region: comp.region,
        instrumentType: refinanceAsFixed ? 'CORP_BOND' : 'LEVERAGED_LOAN',
        purpose: 'REFINANCE',
        sizeUSD: tranche.principalUSD,
        // Need-driven: the issuer walks only where the market is worse than its revolver.
        walkAwayStat: refinanceAsFixed
          ? Math.max(50, Math.round((revolverAllInAnnual - fiveYearSovRate) * 10000))
          : REVOLVER_MARGIN_BPS,
        rateType: refinanceAsFixed ? 'FIXED' : 'FLOATING',
        leadBankTicker: comp.homeBankTicker ?? chooseLeadBank(comp.id, regionBanksForLeads[comp.region] ?? []),
        announcedWeek: nextWeek,
      });
    });

    const maturingTranche = companyTranches.find(t => t.maturityWeek === nextWeek && !t.isCommercialPaper);
    let updatedTranches = companyTranches.filter(t => t.maturityWeek !== nextWeek || t.isCommercialPaper);
    let debtIssuanceThisWeek = 0;
    let debtRepaymentThisWeek = 0;
    let buybacksThisWeek = 0;

    // WS8: consume this week's priced offering, if any (settlement snapshot taken above, where
    // the holder-settlement baseline is built).
    if (settlement && !settlement.withdrawn) {
      const o = settlement.offering;
      // Best-efforts until G3: the tranche created is what the market actually took — a
      // partially-placed deal raises less, which is real.
      const placedUSD = Math.max(0, Math.min(o.sizeUSD, (settlement as any).marketTakeUSD ?? o.sizeUSD));
      const newTranche: DebtTranche = o.rateType === 'FIXED'
        ? {
            id: `${comp.id}-${o.purpose}-${nextWeek}`,
            principalUSD: placedUSD,
            rateType: 'FIXED',
            // The CLEARED terms — the whole point of the primary market.
            couponRate: fiveYearSovRate + settlement.clearedStat / 10000,
            originationWeek: nextWeek,
            maturityWeek: nextWeek + STANDARD_CORP_TENOR_YEARS * 52,
            seniority: 'SENIOR',
            callProtection: callProtectionForIssue({ rateType: 'FIXED', isInvestmentGrade: isInvestmentGrade(newRating) }),
          }
        : {
            id: `${comp.id}-${o.purpose}-${nextWeek}`,
            principalUSD: placedUSD,
            rateType: 'FLOATING',
            floatingMarginBps: Math.round(settlement.clearedStat),
            originationWeek: nextWeek,
            maturityWeek: nextWeek + STANDARD_CORP_TENOR_YEARS * 52,
            seniority: 'SENIOR',
            callProtection: callProtectionForIssue({ rateType: 'FLOATING', isInvestmentGrade: isInvestmentGrade(newRating) }),
          };
      // A term-out retires the bridges it refinances.
      if (o.purpose === 'MAINTENANCE_TERM_OUT' && o.refinancesTrancheIds?.length) {
        const retire = new Set(o.refinancesTrancheIds);
        const retiredUSD = updatedTranches.filter(t => retire.has(t.id)).reduce((a, t) => a + t.principalUSD, 0);
        updatedTranches = updatedTranches.filter(t => !retire.has(t.id));
        debtRepaymentThisWeek += retiredUSD;
        post('term-out: maintenance bridges retired', -retiredUSD);
      }
      if (placedUSD > 1000) updatedTranches = [...updatedTranches, newTranche];
      debtIssuanceThisWeek += placedUSD;
      post(`primary ${o.purpose.toLowerCase()} proceeds (net of underwriting fee)`, settlement.proceedsUSD);
    } else if (settlement && settlement.withdrawn && settlement.offering.purpose === 'REFINANCE' && maturingTranche) {
      // The market said no and the paper still matures: the revolver catches it — real market
      // access closing when spreads gap, with a real penalty cost.
      const revolverTranche: DebtTranche = {
        id: `${comp.id}-REVOLVER-${nextWeek}`,
        principalUSD: maturingTranche.principalUSD,
        rateType: 'FLOATING',
        floatingMarginBps: REVOLVER_MARGIN_BPS,
        originationWeek: nextWeek,
        maturityWeek: nextWeek + 52,
        seniority: 'SENIOR',
        // G2: the revolver is a committed BANK line — the house bank funds it and books it.
        isBankFacility: true,
        facilityBankTicker: comp.homeBankTicker,
      };
      updatedTranches = [...updatedTranches, revolverTranche];
      debtIssuanceThisWeek += revolverTranche.principalUSD;
      post('revolver draw: withdrawn refinancing', revolverTranche.principalUSD);
      refinanceNews.push({
        id: `refi-fail-${comp.ticker}-${nextWeek}`,
        week: nextWeek,
        title: `${comp.ticker} Pulls Refinancing, Draws Revolver`,
        description: `${comp.name} withdrew a ${formatCurrency(settlement.offering.sizeUSD, { compact: true })} refinancing at its walk-away and drew its revolver at policy+${REVOLVER_MARGIN_BPS}bps.`,
        category: 'CREDIT',
        impactBadge: '[FUNDING SQUEEZE]',
        impactRegion: comp.region,
        impactSector: comp.sector,
        affectedTicker: comp.ticker,
        urgent: true,
      } as NewsItem);
    }

    if (maturingTranche) {
      debtRepaymentThisWeek += maturingTranche.principalUSD;
      // The principal leaves through the ledger; the refinancing proceeds (if the offering
      // settled) arrived above. A maturity with neither settlement nor revolver above means the
      // company simply repays from cash — deleveraging by default, which is real.
      post('maturing tranche principal repaid', -maturingTranche.principalUSD);
    }

    if (maintenanceFundingTranches.length > 0) {
      updatedTranches = [...updatedTranches, ...maintenanceFundingTranches];
      debtIssuanceThisWeek += maintenanceFundingTranches.reduce((s, t) => s + t.principalUSD, 0);
    }

    // WS8: the weekly maintenance drip stays a revolver-style bridge (it already prices wide),
    // and once the accumulated bridges reach benchmark size the treasurer TERMS THEM OUT
    // through a real offering — bridge-then-term-out, the actual corporate funding pattern.
    // IG issuers term out in the bond market, sub-IG in the loan market.
    if (!pendingOfferingIssuerIds.has(comp.id) && !primarySettlementByIssuerId.has(comp.id)) {
      const bridges = updatedTranches.filter(t => t.id.includes('-MAINT-'));
      const bridgeUSD = bridges.reduce((a, t) => a + t.principalUSD, 0);
      const totalDebtForGate = updatedTranches.reduce((a, t) => a + t.principalUSD, 0);
      if (bridgeUSD > Math.max(1e6, totalDebtForGate * 0.02)) {
        const asFixed = (FIXED_SHARE_BY_RATING[comp.creditRating] ?? 0.5) >= 0.5;
        const revolverAllInAnnual = reg.policyRate + REVOLVER_MARGIN_BPS / 10000;
        enqueueOffering({
          id: `PO-${comp.id}-${nextWeek}-MAINT`,
          issuerId: comp.id,
          issuerTicker: comp.ticker,
          region: comp.region,
          instrumentType: asFixed ? 'CORP_BOND' : 'LEVERAGED_LOAN',
          purpose: 'MAINTENANCE_TERM_OUT',
          sizeUSD: bridgeUSD,
          // Terming out only makes sense below the bridge's own cost.
          walkAwayStat: asFixed
            ? Math.max(50, Math.round((revolverAllInAnnual - fiveYearSovRate) * 10000))
            : REVOLVER_MARGIN_BPS,
          rateType: asFixed ? 'FIXED' : 'FLOATING',
          refinancesTrancheIds: bridges.map(t => t.id),
          leadBankTicker: comp.homeBankTicker ?? chooseLeadBank(comp.id, regionBanksForLeads[comp.region] ?? []),
          announcedWeek: nextWeek,
        });
      }
    }

    // The supply side of what bounds a credit spread: the issuer's own call on whether debt is
    // worth raising at the price the market is quoting it. Every other change to this stack above
    // happens TO the company — a tranche matures, maintenance needs funding — so the amount of
    // paper outstanding never responded to what it cost. That leaves a market with only one of
    // the two forces that hold a spread in place, and it is why spreads still drifted once
    // investors alone were made price-sensitive.
    //
    // Priced off this company's OWN cleared cost of debt this week, so tight spreads genuinely
    // invite the supply that widens them and wide spreads choke it off — the credit cycle, which
    // this simulation had no way to produce before.
    const costOfNewDebtAnnual =
      calculateNelsonSiegelZeroRate(STANDARD_CORP_TENOR_YEARS, reg.yieldCurveParams) + comp.oasSpreadBps / 10000;
    // S5 leak #3 fixed for real: surplus-cash prepayment retires ACTUAL tranches (nearest
    // maturity first — the paper a treasurer would take out), so cash and the ladder move
    // together and the settled reduction reaches holders via settleCorporateActionOnHolders.
    if (newCash > 2.5 * comp.currentLiabilities) {
      const ladderTotalUSD = updatedTranches.reduce((sum, t) => sum + t.principalUSD, 0);
      if (ladderTotalUSD > 50) {
        let toPrepayUSD = Math.min(ladderTotalUSD * 0.05, (newCash - 2.5 * comp.currentLiabilities) * 0.25);
        if (toPrepayUSD > 1000) {
          // Cheapest debt to be rid of first, and only paper that is actually worth retiring.
          updatedTranches = updatedTranches
            .slice()
            .sort((a, b) => retirementEconomics(b).valuePerCost - retirementEconomics(a).valuePerCost)
            .map(t => {
              if (toPrepayUSD <= 0 || t.isCommercialPaper) return t; // CP is 07f's to resize against the real gap
              const { premiumPerDollar, worthRetiring } = retirementEconomics(t);
              if (!worthRetiring) return t;
              // The budget buys principal AND the premium, so early repayment retires less per
              // dollar of surplus cash than it used to. That is the point: it is not free.
              const repaid = Math.min(t.principalUSD, toPrepayUSD / (1 + premiumPerDollar));
              toPrepayUSD -= repaid * (1 + premiumPerDollar);
              recordPremium(t, repaid * premiumPerDollar);
              return { ...t, principalUSD: t.principalUSD - repaid };
            })
            .filter(t => t.principalUSD > 0.01);
          const prepaidUSD = Math.min(ladderTotalUSD, ladderTotalUSD - updatedTranches.reduce((sum, t) => sum + t.principalUSD, 0));
          post('surplus-cash debt prepayment', -prepaidUSD);
          debtRepaymentThisWeek += prepaidUSD;
        }
      }
    }

    const financing = decideCorporateFinancing({
      comp,
      costOfDebtAnnual: costOfNewDebtAnnual,
      effectiveTaxRate: reg.effectiveTaxRate,
      ebitdaAnnual: newEbitda,
      ebitAnnual: newEbit,
      totalDebtUSD: updatedTranches.reduce((sum, t) => sum + t.principalUSD, 0),
      cashUSD: newCash,
      rating: newRating,
    });

    // A quarterly-sized deal IS a quarter's issuance: no new opportunistic book until it has
    // been digested (without this, every issuer re-announced the week its deal settled and the
    // market ran a standing conveyor at 13x the intended flow — measured 17,006 deals in 30
    // weeks with the median OAS pinned at the wides).
    const opportunisticCooldownOver = nextWeek - (comp.lastOpportunisticOfferingWeek ?? -999) >= 13
      // Launch in the issuer's own post-earnings window — real deals price off fresh numbers,
      // and the stagger stops the whole cohort announcing in one synchronized quarterly burst.
      // An issuer with no reporting calendar (a private firm) has no post-earnings window to
      // launch into, so its cooldown is the only gate.
      && (comp.earningsWeekModulo === undefined
        || (nextWeek % 13) === ((comp.earningsWeekModulo + 1) % 13));
    let newLastOpportunisticOfferingWeek = comp.lastOpportunisticOfferingWeek;
    if (financing.reason === 'ISSUE_CHEAP_DEBT' && financing.netDebtChangeUSD > 1000 && !pendingOfferingIssuerIds.has(comp.id) && opportunisticCooldownOver) {
      // WS8: the CFO ANNOUNCES a deal instead of conjuring a tranche at the current stat. Real
      // issuance is chunky — a quarter's worth of the weekly flow in one book — and it is
      // priced NEXT week alongside the outstanding stock, conceding what real demand requires.
      // The walk-away is the CFO's own indifference cost; a deal launched into a market that
      // then gaps past it is pulled, which is what a real busted bookbuild is.
      const dealSizeUSD = financing.netDebtChangeUSD * 13;
      const walkAwayOasBps = Math.max(
        comp.oasSpreadBps,
        Math.round((financing.walkAwayCostAnnual - calculateNelsonSiegelZeroRate(STANDARD_CORP_TENOR_YEARS, reg.yieldCurveParams)) * 10000)
      );
      enqueueOffering({
        id: `PO-${comp.id}-${nextWeek}-OPP`,
        issuerId: comp.id,
        issuerTicker: comp.ticker,
        region: comp.region,
        instrumentType: 'CORP_BOND',
        purpose: 'OPPORTUNISTIC',
        sizeUSD: dealSizeUSD,
        walkAwayStat: walkAwayOasBps,
        rateType: 'FIXED',
        leadBankTicker: comp.homeBankTicker ?? chooseLeadBank(comp.id, regionBanksForLeads[comp.region] ?? []),
        announcedWeek: nextWeek,
      });
      newLastOpportunisticOfferingWeek = nextWeek;
    } else if (financing.reason === 'DELEVER_EXPENSIVE_DEBT' && financing.netDebtChangeUSD < -1000) {
      // Pay down real principal out of real cash, retiring the paper that gives up the most
      // interest per dollar it costs to retire.
      //
      // This used to take the NEWEST tranche first, on the reasoning that new paper is dear.
      // Once call protection exists that is precisely backwards: the newest tranche is the most
      // protected one, so a treasurer deleveraging into it pays the largest make-whole in the
      // stack. Measured on the free-call version of this path, premiums ran 24% of principal
      // retired. Ranking by rate-saved per dollar of call cost is what a treasury actually does,
      // and it uses the same call-price arithmetic the decision above does.
      let remainingToRepayUSD = -financing.netDebtChangeUSD;
      updatedTranches = updatedTranches
        .slice()
        .sort((a, b) => retirementEconomics(b).valuePerCost - retirementEconomics(a).valuePerCost)
        .map(t => {
          if (remainingToRepayUSD <= 0) return t;
          const { premiumPerDollar, worthRetiring } = retirementEconomics(t);
          // A company that wants less leverage still will not pay a make-whole to get it: if
          // nothing in the stack is economic to retire this week, it holds the cash and waits.
          if (!worthRetiring) return t;
          const repaidUSD = Math.min(t.principalUSD, remainingToRepayUSD / (1 + premiumPerDollar));
          remainingToRepayUSD -= repaidUSD * (1 + premiumPerDollar);
          recordPremium(t, repaidUSD * premiumPerDollar);
          return { ...t, principalUSD: t.principalUSD - repaidUSD };
        })
        .filter(t => t.principalUSD > 0.01);
      const actuallyRepaidUSD = -financing.netDebtChangeUSD - remainingToRepayUSD;
      debtRepaymentThisWeek += actuallyRepaidUSD;
      post('opportunistic deleveraging: principal repaid', -actuallyRepaidUSD);
    }

    // Real, already-cleared this week (see the comment above) — not recomputed here.
    const newOasBps = comp.oasSpreadBps;
    const rawNewCds = newOasBps + Math.floor(random() * 8 - 4);
    const newCdsSpreadBps = isFinite(rawNewCds) ? Math.round(Math.max(10, Math.min(5000, rawNewCds))) : 150;

    // Real, already-cleared this week by 07d-leveraged-loan-clearing.ts — not recomputed here.

    // Asynchronous Quarterly Earnings cycle
    // Reporting is something a LISTED company does. Gating on the modulo alone kept a company
    // that had been taken private reporting quarterly to a market it had left.
    const isReportingThisWeek = !isDefaulted && isPubliclyListed(comp)
      && comp.earningsWeekModulo !== undefined && comp.earningsWeekModulo === currentWeekMod13;
    let lastEarningsSurprisePct = comp.lastEarningsSurprisePct;
    let lastManagementCommentary = comp.lastManagementCommentary;

    let updatedConsensus = comp.dealerConsensus;

    if (isReportingThisWeek) {
      // Mean of Dealer Alpha, Beta, and Gamma estimates
      const alphaEps = comp.dealerConsensus?.alpha?.eps ?? comp.eps;
      const betaEps = comp.dealerConsensus?.beta?.eps ?? comp.eps;
      const gammaEps = comp.dealerConsensus?.gamma?.eps ?? comp.eps;
      const consensusEps = Number(((alphaEps + betaEps + gammaEps) / 3).toFixed(2));
      const actualEps = newEps;
      const epsDiff = actualEps - consensusEps;
      const rawSurprise = epsDiff / Math.max(Math.abs(consensusEps), Math.abs(actualEps), 1.0);
      lastEarningsSurprisePct = Number((rawSurprise).toFixed(3));

      // Management commentary & guidance snippet generation
      let guidanceSnippet = '';
      if (lastEarningsSurprisePct > 0.05) {
        guidanceSnippet = 'Management raises FY CapEx and operating margin guidance on strong forward demand.';
        lastManagementCommentary = `CEO affirmed record operational throughput and upgraded full-year EPS guidance (+${(lastEarningsSurprisePct * 100).toFixed(1)}% surprise).`;
      } else if (lastEarningsSurprisePct < -0.05) {
        guidanceSnippet = 'Management moderates full-year revenue outlook and tightens working capital due to input cost pressures.';
        lastManagementCommentary = `Management cited sector supply headwinds and moderated CapEx plans (${(lastEarningsSurprisePct * 100).toFixed(1)}% miss).`;
      } else {
        guidanceSnippet = 'Management reaffirms FY baseline guidance with stable unit economics and operating backlog.';
        lastManagementCommentary = `In-line quarterly results with steady gross margins and stable backlog demand.`;
      }

      ctx.earningsReportedThisTurn.push({
        ticker: comp.ticker,
        name: comp.name,
        actualEps,
        consensusEps,
        surprisePct: lastEarningsSurprisePct,
        guidanceSnippet,
        sector: comp.sector,
        region: comp.region,
      });

      // Update next quarter 3-dealer forecasts
      const nextQuarterBaseEps = actualEps * (1 + sec.growthRate / 4);
      const nextAlphaEps = Number((nextQuarterBaseEps * 0.96).toFixed(2));
      const nextBetaEps = Number((nextQuarterBaseEps * (1 + reg.gdpGrowth)).toFixed(2));
      const nextGammaEps = Number((nextQuarterBaseEps * 1.08).toFixed(2));
      const newConsensusEps = Number(((nextAlphaEps + nextBetaEps + nextGammaEps) / 3).toFixed(2));

      const nextQuarterBaseRev = newRevenue * (1 + sec.growthRate / 4);
      const alphaRev = Number((nextQuarterBaseRev * 0.98).toFixed(1));
      const betaRev = Number((nextQuarterBaseRev * 1.02).toFixed(1));
      const gammaRev = Number((nextQuarterBaseRev * 1.06).toFixed(1));
      const newConsensusRev = Number(((alphaRev + betaRev + gammaRev) / 3).toFixed(1));

      updatedConsensus = {
        alpha: { eps: nextAlphaEps, revenue: alphaRev },
        beta: { eps: nextBetaEps, revenue: betaRev },
        gamma: { eps: nextGammaEps, revenue: gammaRev },
        consensusEps: newConsensusEps,
        consensusRevenue: newConsensusRev,
      };
    }

    // Equity price now moves from holder-class rebalancing flow (see computeTargetOwnershipShares
    // and the region-level equity flow computed in stage 2) rather than an eps x sectorPE formula.
    // Forward P/E becomes an output of that price, not an input to it.
    // WS4: the share price is CLEARED, in 07e-equity-clearing.ts, before this stage runs — read
    // it, never recompute it, exactly as this stage reads the cleared OAS. The old line moved
    // price by a holder-class rebalancing flow plus `comp.sentiment x 0.35`: a free parameter
    // that existed only because nothing real was setting the price.
    //
    // `sentiment` itself is now GONE. WS4 said it "survives as a narrative signal", but nothing
    // ever read it again: three sites wrote it and no site consumed it, which is a field being
    // maintained rather than used. An earnings surprise already moves the price through the
    // earnings it reports, and a downgrade through the cleared spread — the narrative is an
    // output of real mechanisms, not an input beside them.
    let newStockPrice = isDefaulted ? 0.0 : Math.max(0.10, Number(comp.stockPrice.toFixed(2)));
    const newForwardPE = newEps > 0 ? Number((newStockPrice / newEps).toFixed(2)) : comp.forwardPE;
    // The book-value x cycle-P/B branch that used to price banks and institutions here is GONE.
    // It was the last formula price setter for a listed cohort: a multiple looked up from the
    // cycle regime, applied to a book value, dividing into a share count — everything WS4 removed
    // from every other name. They clear in 07e now, on their own real earnings and their own real
    // balance-sheet equity, so this stage reads their price exactly as it reads everyone else's.
    const hist = [...comp.historicalPrices.slice(-51), newStockPrice];

    // Company Treasury Holdings (Part MF) - Fixed Cash Leak & Liquidations
    const investableCashUSD = Math.max(0, newCash - newRevenue * 0.05);
    const targetTreasuryUSD = investableCashUSD * 0.6;
    const currentTreasuryUSD = (comp.treasuryHoldings || []).reduce((s, h) => s + h.quantityOrNotionalUSD, 0);
    let newTreasuryHoldings = [...(comp.treasuryHoldings || [])];
    if (targetTreasuryUSD > currentTreasuryUSD) {
      const nearestGovTranche = nearestShortGovTrancheByRegion.get(comp.region);
      if (nearestGovTranche) {
        const purchaseAmountUSD = targetTreasuryUSD - currentTreasuryUSD;
        newTreasuryHoldings.push({
          instrumentId: nearestGovTranche.id,
          instrumentType: 'GOV_BOND',
          issuerRegion: comp.region,
          quantityOrNotionalUSD: purchaseAmountUSD
        });
        post('treasury purchase (sovereign)', -purchaseAmountUSD);
      }
    } else if (targetTreasuryUSD < currentTreasuryUSD) {
      const sellAmountUSD = currentTreasuryUSD - targetTreasuryUSD;
      if (currentTreasuryUSD > 0) {
        const scale = targetTreasuryUSD / currentTreasuryUSD;
        newTreasuryHoldings = newTreasuryHoldings.map(h => ({
          ...h,
          quantityOrNotionalUSD: h.quantityOrNotionalUSD * scale
        })).filter(h => h.quantityOrNotionalUSD > 0.01);
        post('treasury sale (sovereign)', sellAmountUSD);
      }
    }

    // Buyback Execution (Part AH)
    let updatedSharesOutstanding = comp.sharesOutstanding;
    const targetCashBuffer = Math.max(10, comp.currentLiabilities * 1.5);
    const excessCash = Math.max(0, newCash - targetCashBuffer);
    const debtToEquity = newTotalDebt / Math.max(1, (newStockPrice * comp.sharesOutstanding));
    if (excessCash > 5 && debtToEquity < 0.6 && comp.sharesOutstanding > 10 && !isDefaulted && newStockPrice > 0) {
      const estimatedBookValuePerShare = Math.max(0.5, (newCash + newRevenue * 0.8 - newTotalDebt) / comp.sharesOutstanding);
      // "Cheap" against the same arithmetic the market itself prices this company with (07e /
      // equity-valuation.ts), at the board's own cost of capital — not against a sector P/E
      // table. A board that buys back stock is taking the other side of that auction, so it has
      // to be reading the same book; comparing to a multiple the market no longer uses would be
      // two valuations of one company again.
      const boardFairValuePerShare = companyFairValuePerShare(
        { ...comp, netIncome: newNetIncome, cash: newCash, totalDebt: newTotalDebt },
        reg.zeroRates?.tenor10Y ?? reg.policyRate,
        REPRESENTATIVE_HOLDER_REQUIRED_RETURN
      );
      const isCheap = newStockPrice < estimatedBookValuePerShare || newStockPrice < boardFairValuePerShare * 0.95;
      const buybackShare = isCheap ? 0.60 : 0.25;
      const buybackSpendM = (excessCash * 0.05 / 52) * buybackShare;
      const sharesToRetire = Math.min(comp.sharesOutstanding * 0.005, buybackSpendM / Math.max(0.1, newStockPrice));
      if (sharesToRetire > 0.001) {
        updatedSharesOutstanding = Math.max(1.0, comp.sharesOutstanding - sharesToRetire);
        buybacksThisWeek = sharesToRetire * newStockPrice;
        post('share buybacks', -buybacksThisWeek);
      }
    }
    const newMarketCap = Number((newStockPrice * updatedSharesOutstanding).toFixed(0));
    const newSeniorBondYield = reg.zeroRates.tenor5Y + newOasBps / 10000;

    const quarterIdx = Math.floor((nextWeek - 1) / 13) + 4;
    const prevSnapshot = comp.historicalFundamentals ? comp.historicalFundamentals[comp.historicalFundamentals.length - 1] : undefined;
    const currentTreasuryHoldingsUSD = (newTreasuryHoldings || []).reduce((s, h) => s + h.quantityOrNotionalUSD, 0);
    // Real current-portion-of-debt: tranches actually maturing within a year, from this
    // company's own updated ladder — not a flat 15% guess.
    // Settle this week's corporate actions against the real holders of this issuer's paper. A
    // tranche that matured has left the issuer's books, so it leaves theirs; one that refinanced
    // into the other rate type has moved between the bond market and the loan market, so their
    // position moves with it. Holdings that do not track the real stock are the difference
    // between a market and a random walk — see settleCorporateActionOnHolders.
    const postActionFixedUSD = updatedTranches.filter(t => t.rateType === 'FIXED' && !t.isCommercialPaper).reduce((s, t) => s + t.principalUSD, 0);
    const postActionFloatingUSD = updatedTranches.filter(t => t.rateType === 'FLOATING' && !t.isBankFacility).reduce((s, t) => s + t.principalUSD, 0);
    settleCorporateActionOnHolders(ctx, comp.id, 'CORP_BOND', preActionFixedUSD, postActionFixedUSD);
    settleCorporateActionOnHolders(ctx, comp.id, 'LEVERAGED_LOAN', preActionFloatingUSD, postActionFloatingUSD);
    // The premium the issuer's ledger just posted out reaches the holders of record — the whole
    // reason call protection changes anything is that the money goes to the lender.
    payHoldersCash(ctx, comp.id, 'CORP_BOND', bondCallPremiumUSD);
    payHoldersCash(ctx, comp.id, 'LEVERAGED_LOAN', loanCallPremiumUSD);

    const newShortTermDebtUSD = updatedTranches.filter(t => t.maturityWeek - nextWeek <= 52).reduce((s, t) => s + t.principalUSD, 0);

    const currentSnapshot = buildQuarterlyFundamentalSnapshot(
      nextWeek,
      formatQuarterFilingDate(quarterIdx),
      formatSimulationDate(nextWeek),
      newRevenue,
      newEbitda,
      newNetIncome,
      newEps,
      newCash,
      newTotalDebt,
      currentTreasuryHoldingsUSD,
      Object.values(newOutputInventoryBySubUnit).reduce((s, inv) => s + inv.valueUSD, 0),
      newMaintenanceCapex,
      newGrowthCapex,
      newOasBps,
      newDividendYield,
      newMarketCap,
      prevSnapshot,
      debtIssuanceThisWeek,
      debtRepaymentThisWeek,
      buybacksThisWeek,
      newGrossPPEUSD,
      newAccumulatedDepreciationUSD,
      weeklyDepreciation * 13,
      costDriversUSD,
      newShortTermDebtUSD,
      annualInterest,
      Object.values(newInputInventoryBySubUnit).reduce((s, lots) => s + lotArrayValueUSD(lots), 0)
    );
    const histFundamentals = isReportingThisWeek
      ? [...(comp.historicalFundamentals || []).slice(-7), currentSnapshot]
      : comp.historicalFundamentals || [];

    const systemicStressFactor = systemicStressFactorGlobal + Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.3;
    const newBaselineRecoveryRate = Number(((comp.baselineRecoveryRate ?? 0.40) * 0.998 + comp.recoveryRate * 0.002).toFixed(4));
    const effectiveRecoveryRate = Math.max(0.10, newBaselineRecoveryRate * (1 - systemicStressFactor));
    const trendWeeklyGrowth = (reg.potentialGdpGrowth + reg.targetInflation) / 52;
    const newBaselineAnnualRevenue = isDefaulted
      ? Number((comp.baselineAnnualRevenue * 0.995).toFixed(1))
      : Number((comp.baselineAnnualRevenue * (1 + trendWeeklyGrowth)).toFixed(1));

    const revHist = comp.revenueHistory || [newRevenue];
    let calculatedRevVol = 0;
    if (revHist.length > 2) {
      const meanRev = revHist.reduce((s, v) => s + v, 0) / revHist.length;
      if (meanRev > 0) {
        const varRev = revHist.reduce((s, v) => s + Math.pow(v - meanRev, 2), 0) / revHist.length;
        calculatedRevVol = Math.sqrt(varRev) / meanRev;
      }
    }
    const calculatedSegmentFinancials: SegmentFinancial[] = (updatedProductLines || []).map(line => {
      const share = line.revenueShare || 1.0;
      return {
        subUnitId: line.subUnitId,
        revenueUSD: Number((newRevenue * share).toFixed(0)),
        ebitdaUSD: Number((newEbitda * share).toFixed(0)),
        capexUSD: Number((newCapex * share).toFixed(0)),
      };
    });

        // WS7: the treasury sweep — the week's LAST ledger entry, after every operating and
    // financing flow has posted. Cash above the company's own working-capital need buys money
    // fund shares at the $1 NAV; cash below it redeems, bounded by the fund's real available
    // cash this week. The sweep only ever moves the EXCESS, so it cannot push a company toward
    // the default trigger; a redemption arriving the week after distress began is the real
    // T+1 of a treasury pulling money home.
    let newMmfSharesUSD = comp.mmfSharesUSD ?? 0;
    if (!comp.isBankEntity && !comp.isInstitutionalEntity && !isDefaulted && comp.listingStatus !== 'PRIVATE') {
      const sweep = corporateSweepDecision(comp, newCash, mmfSweepBooks.get(comp.region));
      if (sweep.cashDeltaUSD !== 0) {
        post(sweep.cashDeltaUSD < 0 ? 'treasury sweep into money fund shares' : 'money fund share redemption', sweep.cashDeltaUSD);
        newMmfSharesUSD = Math.max(0, newMmfSharesUSD + sweep.shareDeltaUSD);
      }
    }

    // SCALE: same in-place assignment as the private path above — see that comment.
    return Object.assign(comp, {
      revenueVolatility: Number(calculatedRevVol.toFixed(4)),
      segmentFinancials: calculatedSegmentFinancials,
      forwardPE: newForwardPE,
      baselineRecoveryRate: newBaselineRecoveryRate,
      baselineDividendYield: newBaselineDividendYield,
      previousEmployeeCount: comp.employeeCount,
      accruedTaxLiabilityUSD: Number(accruedTaxUSD.toFixed(0)),
      // HH6: the wage this firm offers and the hiring difficulty behind it are the labor
      // market stage's decisions — carried through explicitly, like employeeCount above,
      // because this stage rebuilds the company from a fixed field list and anything not
      // named here is silently dropped (which is exactly what happened first time).
      offeredWageIndex: companyUpdates[comp.ticker]?.offeredWageIndex ?? comp.offeredWageIndex ?? 1.0,
      unfilledVacancyShare: companyUpdates[comp.ticker]?.unfilledVacancyShare ?? comp.unfilledVacancyShare ?? 0,
      previousCapex: comp.capex,
      maintenanceCapex: Number(newMaintenanceCapex.toFixed(1)),
      growthCapex: Number(newGrowthCapex.toFixed(1)),
      grossPPEUSD: Number(newGrossPPEUSD.toFixed(1)),
      // IND1: read by stage 05's capacity growth — real net investment is what arrived.
      capexDeliveredLastWeekUSD: Number(capexDeliveredThisWeekUSD.toFixed(1)),
      accumulatedDepreciationUSD: Number(newAccumulatedDepreciationUSD.toFixed(1)),
      rndExpense: Number(newRndExpense.toFixed(1)),
      maintenanceShortfallStreak: newMaintenanceShortfallStreak,
      executionQuality: Number(newExecutionQuality.toFixed(3)),
      occupationMixDrift: newOccupationMixDrift,
      inputSupplyConstraintFactor: Number(newInputSupplyConstraintFactor.toFixed(4)),
      _targetProductionUSD: (companyUpdates[comp.ticker]?._targetProductionUSD ?? targetProductionUSD),
      lastWeekSalesUSD: update?.salesUSD ?? 0,
      lastWeekPurchasesUSD: update?.purchasesUSD ?? 0,
      // Start from this company's carrying-cost-decayed baseline (every sub-unit it held
      // inventory for), then overlay whatever stage 05 settled fresh this week for the
      // sub-units it actually processed (it runs first and has the complete, real
      // production/sales picture for those lines).
      outputInventoryBySubUnit: { ...newOutputInventoryBySubUnit, ...(update?.outputInventoryBySubUnit || {}) },
      // Already reflects this week's real purchases (credited by stage05) minus this week's
      // real consumption (drawn down above) — no further overlay needed, unlike output
      // inventory, since this stage (not stage05) is the one authoritative writer of the
      // post-consumption balance.
      inputInventoryBySubUnit: newInputInventoryBySubUnit,
      recentFulfillmentEMA: Number(newRecentFulfillmentEMA.toFixed(4)),
      employeeCount: isDefaulted ? 0 : newEmployeeCount,
      recoveryRate: Number(effectiveRecoveryRate.toFixed(3)),
      debtTranches: updatedTranches,
      productLines: updatedProductLines,
      totalDebt: updatedTranches.reduce((s, t) => s + t.principalUSD, 0),
      dividendYield: Number(newDividendYield.toFixed(4)),
      capex: Number(newCapex.toFixed(1)),
      annualRevenue: Number(newRevenue.toFixed(1)),
      baselineAnnualRevenue: newBaselineAnnualRevenue,
      ebitda: Number(newEbitda.toFixed(1)),
      ebit: Number(newEbit.toFixed(1)),
      netIncome: Number(newNetIncome.toFixed(1)),
      eps: newEps,
      sharesOutstanding: Number(updatedSharesOutstanding.toFixed(3)),
      // Wall Street Phase 1: real per-bank balance sheet computed this week in
      // 02b-bank-diversification.ts (which runs before this stage), carried forward otherwise.
      bankBalanceSheet: companyUpdates[comp.ticker]?.bankBalanceSheet ?? comp.bankBalanceSheet,
      bankRiskFactor: comp.bankRiskFactor,
      technicalReservesUSD: comp.technicalReservesUSD,
      aumUSD: comp.aumUSD,
      managementFeeRate: comp.managementFeeRate,
      insurancePremiumsWrittenUSD: comp.insurancePremiumsWrittenUSD,
      insuranceClaimsPaidUSD: comp.insuranceClaimsPaidUSD,
      // SETL2: `cash` is NOT written here any more. Every flow above was recorded as a payment
      // instruction and the settlement stage (which runs immediately after this one) applies the
      // net to this company's balance AND to its bank's deposits and reserves. One mover.
      // `newCash` above stays the stage's own running view, which is what settlement will produce.
      mmfSharesUSD: newMmfSharesUSD,
      lastOpportunisticOfferingWeek: newLastOpportunisticOfferingWeek,
      lastCashLedger: cashLedger,
      leverage: newLeverage,
      interestCoverage: newCoverage,
      creditRating: newRating,
      ratingHistory: [...comp.ratingHistory.slice(-15), newRating],
      historicalFundamentals: histFundamentals,
      isDefaulted,
      stockPrice: newStockPrice,
      historicalPrices: hist,
      marketCap: newMarketCap,
      oasSpreadBps: newOasBps,
      cdsSpreadBps: newCdsSpreadBps,
      seniorBondYield: newSeniorBondYield,
      reportedThisWeek: isReportingThisWeek,
      lastEarningsReportWeek: isReportingThisWeek ? nextWeek : comp.lastEarningsReportWeek,
      dealerConsensus: updatedConsensus,
      lastEarningsSurprisePct,
      lastManagementCommentary,
      // Already real and already-cleared (07d-leveraged-loan-clearing.ts) — passed through as-is.
      leveragedLoan: comp.leveragedLoan,
      treasuryHoldings: newTreasuryHoldings,
    });
  });

  // Every corporate action this stage recorded reaches the real books here, in one pass.
  // WS7: the funds receive/pay the week's net corporate sweep money.
  settleCorporateSweepBooks(mmfSweepBooks, ctx);

  applyPendingCorporateActionSettlements(ctx);

  ctx.newsItems.push(...refinanceNews);
}
