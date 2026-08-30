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
  GameState, Company, DebtTranche, NewsItem, SegmentFinancial, RegionId,
} from '../../../types';
import { isActiveCompany, isPubliclyListed, getOutputInventoryUSD, InputLot, ANTITRUST_SHARE_THRESHOLD, peakCategoryShare, tranchePaymentDue } from '../../../domain/company';
import { callProtectionForIssue, callPricePerDollar } from '../../../domain/call-protection';
import { isInvestmentGrade } from './asset-allocation';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { SECTOR_OCCUPATION_MIX } from '../../../domain/region-macro';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../domain/market-microstructure';
import { recurringRevenueShare, SUBSCRIPTION_WEEKLY_CHURN } from '../../../domain/industry-registry';
import { industryOfSubUnit, firmInputIntensities, financingProfileOf } from '../../../domain/industry-registry';
import { calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { SECTOR_BENCHMARKS } from '../../pricing';
import { formatCurrency, formatQuarterFilingDate, formatSimulationDate } from '../../formatters';
import { getBlendedWageGrowth } from '../../macro/evolution';
import { determineCreditRating } from '../credit';
import { SECTOR_PRICING_POWER, SECTOR_WAGE_SENSITIVITY, SECTOR_PPE_USEFUL_LIFE_YEARS, SECTOR_PPE_INTENSITY } from '../constants';
import { FIXED_SHARE_BY_RATING, buildQuarterlyFundamentalSnapshot, CogsCostDrivers } from '../../companyGenerator';
import { getRatingBucket, settleCorporateActionOnHolders, applyPendingCorporateActionSettlements, applyHolderInterestAccruals, payHoldersCash, DEFAULT_COVERAGE_FLOOR, creditRecoveryRate, accrueHoldersInterest, payHoldersAccruedInterest } from './shared-helpers';
import { openCorporateSweepBooks, corporateSweepDecision, settleCorporateSweepBooks, findRegionMmf } from './money-market-fund';
import { decideCorporateFinancing } from './corporate-financing';
import { PrimaryOffering, chooseLeadBank } from '../../../domain/primary-market';
import { leadBankAllocator } from './dealer-desks';
import { REVOLVER_MARGIN_BPS } from './07f-short-debt-clearing';
import { WeeklyStepContext } from './context';
import { PROFILE_REGISTRY, profileKeyOf } from './profiles';
import { measureBeta, regionIndexOf } from '../../macro/indices';
import { pay, PartyRef } from './settlement';
import { weeklyWageBillUSD, getBaseAnnualWageUSD } from '../../bootstrap/labor-and-wages';
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

/**
 * LAB — the wage pools at their reference level. A firm's BASELINE payroll is its baseline
 * headcount at the wage table's own level, with no market premium and no firm premium: the wage
 * bill already sitting inside its baseline margin. Only the deviation from it is a new cost.
 */
const BASELINE_WAGE_POOLS = {
  GENERAL: { wageIndex: 1 }, SKILLED_TRADES: { wageIndex: 1 },
  TECHNICAL_ENGINEERING: { wageIndex: 1 }, SPECIALIZED_PROFESSIONAL: { wageIndex: 1 },
  MANAGERIAL_FINANCIAL: { wageIndex: 1 },
} as Record<import('../../../types').OccupationType, { wageIndex: number }>;

/**
 * IND4 — a firm's payout discipline is its INDUSTRY's, from the registry. This was one number,
 * 0.6, for every firm in the model: a mature network operator and a growth software firm had
 * identical payout policy, which is the clearest single thing that is not alike across
 * industries. The fallback is for a firm with no product line — a bank or a fund manager, whose
 * own posture is its profile's to state when IND4's financial half lands.
 */
const DEFAULT_MAX_DIVIDEND_PAYOUT_RATIO = 0.6;
function fixedShareOf(comp: Company): number {
  const base = FIXED_SHARE_BY_RATING[comp.creditRating] ?? 0.5;
  const primary = (comp.productLines || [])[0];
  const industry = primary ? industryOfSubUnit(primary.subUnitId) : undefined;
  return industry ? base * financingProfileOf(industry).fixedRateTilt : base;
}
function maxDividendPayoutRatioOf(comp: Company): number {
  const primary = (comp.productLines || [])[0];
  const industry = primary ? industryOfSubUnit(primary.subUnitId) : undefined;
  return industry ? financingProfileOf(industry).maxPayoutRatio : DEFAULT_MAX_DIVIDEND_PAYOUT_RATIO;
}

/**
 * CAP — the share of a measured capacity shortfall a firm tries to close in a year. A behavioural
 * primitive of the same kind as `WEEKLY_ISSUANCE_TAKEUP_RATE`: real capacity arrives in lumps
 * after a build, so a firm short by a third does not order a third more plant this week. What it
 * can fund is bounded by its own cash and cost of debt, not by a number here.
 */
const CAPACITY_CATCHUP_SHARE_ANNUAL = 0.35;

export function runCompanyFundamentalsStage(state: GameState, ctx: WeeklyStepContext): void {
  const { nextWeek, currentWeekMod13, companyUpdates, prevActiveFirms, updatedRegions, updatedCommodities, systemicStressFactorGlobal } = ctx;
  const refinanceNews: NewsItem[] = [];

  // Per-week indices, built once (see the plan's optimization rule: memoize per-week derived
  // values at the top of a stage, never inside a per-company loop). Each of these was a full
  // scan of a multi-thousand-element array executed once per company.
  const entityById = new Map(state.institutionalEntities.map(e => [e.id, e]));
  const firmById = new Map(prevActiveFirms.map(c => [c.id, c]));
  // CRD-R1 — the median issuer's revenue, so SCALE in the rating is relative to the firms a
  // credit is actually rated against rather than a stated size (§7.184).
  const regionMedianRevenueUSD = (() => {
    const revs = prevActiveFirms.map(c => c.annualRevenue).filter(r => r > 0).sort((a, b) => a - b);
    return revs.length > 0 ? revs[Math.floor(revs.length / 2)] : 1;
  })();
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
  // G3c: mandates go to the bank that carries the issuer's credit, and — with no incumbent —
  // to the desk that can still underwrite. Both are measured here, per region, once a week.
  const leadAllocatorByRegion = new Map<string, ReturnType<typeof leadBankAllocator>>();
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
    leadAllocatorByRegion.set(r, leadBankAllocator(
      ctx, ctx.prevActiveFirms.filter((c) => c.isBankEntity && c.region === r && c.bankBalanceSheet), 'corporate bond'
    ));
  });
  /** Who leads this issuer's deal — re-asked every time, so the mandate can be lost. */
  const leadBankFor = (comp: Company, sizeUSD: number): string => {
    const alloc = leadAllocatorByRegion.get(comp.region);
    if (!alloc) return comp.homeBankTicker ?? '';
    const ticker = chooseLeadBank(comp.id, alloc.candidatesFor(comp.id));
    if (ticker) alloc.award(ticker, sizeUSD);
    return ticker || (comp.homeBankTicker ?? '');
  };
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

    const reg = updatedRegions[comp.region];
    // IND-R1 / IND-R6: EVERY firm's payroll, computed here — before BOTH forks, because a firm
    // with staff owes them whatever kind of firm it is. It used to live inside the OPERATING
    // branch, so a bank's headcount was hired and fired by the labor market, counted in
    // unemployment, and cost nothing and paid nobody: headcount with no wage leg (rule 14).
    // IND-R1 moved it above the PROFILE dispatch and fixed that for banks; it was still below
    // the LISTING branch, so 1,712 private firms employing 8.20M people paid no wages either —
    // 67% of the USA's named wage bill never reaching a household (§7.115).
    //
    // What this is: the firm's real headcount, in the occupations its sector employs, at the wage
    // those occupations clear at, times the wage this firm itself offers (`offeredWageIndex`,
    // which moves with its own hiring success). One payroll, one owner, one representation —
    // which is also what retires the carrier profile's separate `crewCount x wage` line.
    const weeklyPayrollUSD = weeklyWageBillUSD(
      comp.employeeCount,
      SECTOR_OCCUPATION_MIX[comp.sector] ?? { GENERAL: 1.0 },
      getBaseAnnualWageUSD(comp.region),
      reg.occupationPools,
      comp.offeredWageIndex ?? 1.0
    );
    const baselineWeeklyPayrollUSD = weeklyWageBillUSD(
      comp.baselineEmployeeCount ?? comp.employeeCount,
      SECTOR_OCCUPATION_MIX[comp.sector] ?? { GENERAL: 1.0 },
      getBaseAnnualWageUSD(comp.region),
      BASELINE_WAGE_POOLS,
      1.0
    );
    // Only the DEVIATION from baseline payroll adjusts a stated margin, because a stated margin
    // already contains a baseline wage bill; charging the whole payroll again would count it
    // twice. A profile with no stated margin (the carrier) charges the payroll in full instead —
    // that is the cost-shape choice a profile exists to make.
    const payrollAboveBaselineAnnualUSD = (weeklyPayrollUSD - baselineWeeklyPayrollUSD) * 52;

    // IND-R6 — THE LISTING BRANCH IS GONE. There is one operating model and every firm runs it.
    //
    // What stood here: `if (!isPubliclyListed(comp)) { ...abbreviated rebuild...; return; }` — not
    // a different model, a SHORTENED COPY of this one, and it skipped payroll, capex, PP&E,
    // inventory, input consumption, cost drivers, the debt lifecycle and offerings. Only a few of
    // those are genuinely public-only, and those are now guarded individually below, which is what
    // 'listed is a profile that ADDS public-market behaviour' actually means.
    //
    // What the fork cost, all measured (§7.115, §7.119): three fields silently dropped by its
    // fixed rebuild list because anything not named there died weekly (§7.41); 1,712 private firms
    // employing 8.20M people paying no wages, so 67% of the USA's named wage bill never reached a
    // household; 2.91B a week of cash moving by direct mutation outside the settlement layer; and
    // a headcount rule that drifted out of agreement with the listed tier's because a fix could
    // land in one path and miss the other. A second path does not stay a copy.

    const sec = SECTOR_BENCHMARKS[comp.sector];

    // SETL2b: drawing a bank facility is not a payment FROM anyone — the bank writes the loan and
    // the borrower's balance appears against it, in the same statement (settlement.ts). Naming
    // the house bank's CREDIT is what tells settlement no reserve should move.
    const bankCredit: PartyRef | undefined = comp.homeBankTicker
      ? { kind: 'BANK_CREDIT', ticker: comp.homeBankTicker }
      : undefined;
    const recordCredit = (trancheId: string, principalUSD: number, marginBps: number, termWeeks: number, retire: boolean) => {
      if (!comp.homeBankTicker || !(principalUSD > 0)) return;
      ctx.creditEventsThisWeek.push({
        bankTicker: comp.homeBankTicker, companyId: comp.id, trancheId,
        principalUSD, marginBps, originationWeek: nextWeek, termWeeks, retire,
      });
    };


    // Interest Expense (computed early so Banks can skip or use it if they had standard debt, but they mostly rely on BankingSector)
    const nonMaturingTranches = comp.debtTranches.filter(t => t.maturityWeek !== nextWeek);
    const annualInterest = nonMaturingTranches.reduce((sum, t) => {
      if (t.rateType === 'FIXED') return sum + t.principalUSD * (t.couponRate ?? 0.05);
      return sum + t.principalUSD * (reg.policyRate + (t.floatingMarginBps ?? 200) / 10000);
    }, 0);
    const weeklyInterest = annualInterest / 52;
    // SETL4: interest goes to whoever actually lent. A bank FACILITY is paid to the house bank
    // that wrote it; market paper is paid to the REGISTER, which knows who holds it. Splitting
    // the two here is what lets each leg have a real payee instead of one aggregate leaving for
    // the boundary while the lenders were credited independently (rule 3's double derivation).
    // CAL — INTEREST ACCRUES WEEKLY; CASH MOVES ON THE INSTRUMENT'S OWN DATES. `annualInterest`
    // above is the accrual, and the income statement uses it every week, which is what an income
    // statement is for. What LEAVES this week is only what is actually due: a bond pays its
    // half-year on its own coupon date, a floating loan its quarter on its own reset, commercial
    // paper nothing until it matures. The smooth 1/52 cash flow this replaces conserved dollars
    // and erased the lumpiness that is the entire reason a treasurer's quarter-end is a thing.
    const dueCashUSD = (t: DebtTranche): number => {
      const { due, weeksCovered } = tranchePaymentDue(t, nextWeek);
      if (!due) return 0;
      const annualUSD = t.rateType === 'FIXED'
        ? t.principalUSD * (t.couponRate ?? 0.05)
        : t.principalUSD * (reg.policyRate + (t.floatingMarginBps ?? 200) / 10000);
      return (annualUSD * weeksCovered) / 52;
    };
    const facilityInterestWeeklyUSD = nonMaturingTranches
      .filter(t => t.isBankFacility)
      .reduce((sum, t) => sum + dueCashUSD(t), 0);
    // Market paper accrues to the REGISTER every week and is paid on its own coupon dates. The
    // accrual is what each holder earned while it held the paper; the payout hands each of them
    // exactly that, whether or not it still holds on the date (shared-helpers.ts).
    const weeklyAccrualUSD = (t: DebtTranche): number =>
      (t.rateType === 'FIXED'
        ? t.principalUSD * (t.couponRate ?? 0.05)
        : t.principalUSD * (reg.policyRate + (t.floatingMarginBps ?? 200) / 10000)) / 52;
    const marketBondAccrualUSD = nonMaturingTranches
      .filter(t => !t.isBankFacility && t.rateType === 'FIXED')
      .reduce((sum, t) => sum + weeklyAccrualUSD(t), 0);
    const marketLoanAccrualUSD = nonMaturingTranches
      .filter(t => !t.isBankFacility && t.rateType !== 'FIXED')
      .reduce((sum, t) => sum + weeklyAccrualUSD(t), 0);
    const bondCouponDue = nonMaturingTranches.some(t => !t.isBankFacility && t.rateType === 'FIXED' && tranchePaymentDue(t, nextWeek).due);
    const loanCouponDue = nonMaturingTranches.some(t => !t.isBankFacility && t.rateType !== 'FIXED' && tranchePaymentDue(t, nextWeek).due);
    // What actually leaves the issuer's account for market paper this week: the accrued balances
    // its coupon dates are clearing. Zero in the weeks between.
    const marketFixedInterestWeeklyUSD = nonMaturingTranches
      .filter(t => !t.isBankFacility && t.rateType === 'FIXED')
      .reduce((sum, t) => sum + dueCashUSD(t), 0);
    const marketFloatingInterestWeeklyUSD = nonMaturingTranches
      .filter(t => !t.isBankFacility && t.rateType !== 'FIXED')
      .reduce((sum, t) => sum + dueCashUSD(t), 0);
    const effectiveDebtRate = annualInterest / Math.max(1, comp.totalDebt);
    // RULE 3, OPEN: the CORPORATE tax rate is a bare literal here, and it is the only one the
    // model has — `region.effectiveTaxRate` (which the fiscal stance drifts weekly) and
    // `HOUSEHOLD_EFFECTIVE_TAX_RATE` govern the other two bases, and neither reaches this. So the
    // government's own tax policy cannot touch corporate taxation at all, while stage 11 collects
    // the proceeds as `taxCollectedCorporateUSD` and counts them in revenue. Owner: TAXR.
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
    /** IND2 — the contracted base a subscription seller carries into next week. */
    let newRecurringBaseUSD = comp.recurringRevenueBaseUSD;
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
    const profileKey = profileKeyOf(comp);
    const profileModule = PROFILE_REGISTRY[profileKey];
    if (profileModule) {
      // §7.122 step 3 — EBITDA IS COMPUTED HERE, FOR EVERY KIND OF FIRM, and a profile has no
      // say in it. A profile returns how it EARNS and the costs no other kind of firm has; the
      // costs every firm has — its people and what it consumes — are charged in one place.
      // Three of the four used to return a stated margin (bank 0.40, manager 0.35, insurer 0.15),
      // so what a margin MEANT depended on which arm of the dispatch a firm went down.
      //
      // §7.122 step 4 — and a firm that sells no product still BUYS: a bank's premises, software
      // and professional services come from its profile's input basket at the same cleared prices
      // a manufacturer pays for steel. Without it a bank's operating cost had nowhere to come
      // from except the stated margin this deletes.
      const profileInputRate = Object.values(firmInputIntensities(comp.productLines, profileKey))
        .reduce((a, b) => a + b, 0);
      const pnl = profileModule({ comp, reg, state, ctx, entityById, annualInterest, taxRate, perShare,
        weeklyPayrollUSD, inputCostAnnualUSD: comp.annualRevenue * profileInputRate });
      newRevenue = pnl.newRevenue;
      const profileInputCostUSD = newRevenue * profileInputRate;
      newEbitda = newRevenue + (pnl.otherIncomeAnnualUSD ?? 0)
        - profileInputCostUSD - weeklyPayrollUSD * 52 - pnl.profileCostsAnnualUSD;
      newEbitdaMargin = newRevenue > 0 ? newEbitda / newRevenue : 0;
      newEbit = newEbitda - (comp.grossPPEUSD ?? 0) / 20;
      newNetIncome = (newEbit - annualInterest) * (newEbit > 0 ? (1 - taxRate) : 1);
      newEps = perShare(newNetIncome);
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
      // LAB: the wage no longer compresses the margin here. It is a real payroll line against
      // EBITDA below, so docking the margin for wage growth as well would charge it twice.
      // `wageSensitivity` survives as the sector's own labor intensity, which is what decides
      // how much a wage move actually costs a firm — expressed through its headcount, not a
      // margin haircut.
      const wageCompression = 0;
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
      const linesNeedingInputs = (comp.productLines || []).filter(l => CATEGORY_INPUT_REQUIREMENTS[l.subUnitId]);
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
        const reqs = CATEGORY_INPUT_REQUIREMENTS[l.subUnitId];
        if (!reqs) return;
        const lineProductionUSD = (comp.annualRevenue / 52) * (l.revenueShare ?? 1.0);
        Object.entries(reqs).forEach(([inputSubUnit, intensity]) => {
          const neededUSD = lineProductionUSD * (intensity ?? 0);
          if (neededUSD <= 0) return;
          // A private-segment offer (05-unit-bidding.ts's PRIVATE_SEGMENT_SUPPLY_CATEGORIES) is
          // just as real a supply source as a public company's product line.
          const hasRealSupply = (suppliedSubUnitsByRegion.get(comp.region)?.has(inputSubUnit) ?? false)
            || industryOfSubUnit(inputSubUnit) !== undefined;
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

      // IND3 + CAP0 — THE MARGIN IS AN OUTCOME OF REAL COSTS, AND THE CLAMP IS GONE.
      //
      // What this replaces: a stated `baselineEbitdaMargin` walked 96/4 toward a target nudged by
      // four coefficient terms, then held inside [2%, 65%] — so no firm could report a loss at
      // the EBITDA line (rule 2, and the clamp CAP0 exists to remove), and the REAL dollar cost
      // of the lots the firm actually consumed reached only the display COGS breakdown while an
      // INDEX (`inputPriceDrag * 0.03`) stood in for it in the P&L. Two representations of one
      // cost, the measured one unused beside the formula (rule 3, §7.117's closing finding).
      //
      // Now: EBITDA is revenue less what the firm actually spent — the real input lots it drew
      // down at the prices it paid, its real wage bill at its real headcount, and everything else
      // it spends. That last term is the only one not directly observed, so it is DERIVED from
      // the firm's own opening books rather than stated: whatever share of revenue is left after
      // the baseline margin, baseline inputs and baseline payroll. §7.4's discipline — seed by
      // the engine's own code — which also means opening EBITDA is unchanged at week 0 and every
      // later move is a real cost moving.
      //
      // Payroll now enters IN FULL, not as a deviation from baseline: a deviation was only ever
      // needed because the margin it adjusted already contained a wage bill. Nothing here
      // contains anything.
      const baselineInputRate = Object.values(firmInputIntensities(comp.productLines, profileKey))
        .reduce((a, b) => a + b, 0);
      const baselinePayrollRate = (baselineWeeklyPayrollUSD * 52) / Math.max(1, comp.baselineAnnualRevenue || comp.annualRevenue);
      const otherOpexRate = 1 - baselineMargin - baselineInputRate - baselinePayrollRate;

      // §7.133 — TRIED AND REVERTED: overhead as a per-head dollar cost instead of
      // `otherOpexRate x revenue`. The hypothesis was that a revenue-proportional overhead keeps
      // the price ratchet alive (§7.132). It does, but this is not the fix: headcount is itself
      // collapsing in the runs where the ratchet bites, so overhead collapsed with it, the floor
      // fell anyway, deflation went −18.8% → −28.2% at week 10 and the harness went red. Tying a
      // cost to a falling quantity is no better than tying it to a falling price.
      const inputCostAnnualUSD = realInputConsumptionCostUSD * 52;
      const payrollAnnualUSD = weeklyPayrollUSD * 52;
      const otherOpexAnnualUSD = otherOpexRate * comp.annualRevenue;
      newEbitdaMargin = 1 - (inputCostAnnualUSD + payrollAnnualUSD + otherOpexAnnualUSD) / Math.max(1, comp.annualRevenue);

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

      // IND2 — REVENUE RECOGNITION IS A PROPERTY OF WHAT IS SOLD.
      //
      // A unit sale is recognised on delivery, so production that did not sell is not revenue:
      // that is the line below and it was every good in the model, whatever it was.
      //
      // A SUBSCRIPTION is not a unit. The sale bought a contract, so it keeps paying until it
      // churns, and a week the seller could not ship does not cost it the contract. The
      // contracted share of the firm is therefore carried as a real base: it survives on its own
      // and is topped up by what this week actually cleared. **This is the whole difference
      // between a software company and a steel mill, and the model could not express it** — the
      // verify criterion is that a subscription business's revenue survives a quarter with no
      // new sales while a unit seller's does not.
      const recurringShare = recurringRevenueShare(comp.productLines || []);
      const unitShare = 1 - recurringShare;
      // Unsold production only costs the UNIT half its revenue.
      const revenueAdjustmentForUnsold = -unsoldThisWeekUSD * 0.5 * unitShare;
      newRevenue = Math.max(10, newRevenue + revenueAdjustmentForUnsold);
      if (recurringShare > 0) {
        // The base decays at its own churn and is renewed by the contracted share of what
        // cleared. Seeded from the firm's own opening revenue the first time it is read.
        const priorBaseUSD = comp.recurringRevenueBaseUSD ?? comp.annualRevenue * recurringShare;
        newRecurringBaseUSD = priorBaseUSD * (1 - SUBSCRIPTION_WEEKLY_CHURN)
          + salesUSD * recurringShare * 52 * SUBSCRIPTION_WEEKLY_CHURN;
        // The firm's revenue is its contracted base plus whatever its unit lines sold.
        newRevenue = Math.max(10, newRecurringBaseUSD + newRevenue * unitShare);
      }
      comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];

      // LAB: PAYROLL IS A REAL COST. `newEbitdaMargin` carries the firm's non-labor cost
      // structure — input prices, competition, capacity — and the wage bill is now its own line
      // on top, measured from the firm's real headcount at the wage it really offers. Only the
      // DEVIATION from its baseline payroll adjusts EBITDA, because the baseline margin already
      // contains a baseline wage bill; charging the whole payroll again would count it twice.
      //
      // This is what makes a wage a price rather than a charge. Before it, the going rate could
      // move and no firm's earnings noticed, so labor demand had nothing to respond to and the
      // entire adjustment fell on cash exhaustion (measured: a 30-50% unemployment cascade).
      // IND3: the margin above already carries the full wage bill, so there is no deviation to
      // add here — `payrollAboveBaselineAnnualUSD` exists only for profiles that still state a
      // margin (the carrier charges its payroll in full instead; see profiles/).
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

    // CAP — MAINTENANCE CAPEX IS DEPRECIATION. That is what maintenance capex IS: the spend that
    // keeps the capital stock whole as it wears out.
    //
    // It used to be `newRevenue x (comp.maintenanceCapex / comp.annualRevenue)` — **the target
    // derived from its own current value**, an EMA of itself with no anchor to the thing it is
    // for. Whatever it was seeded at is what it stayed. IND13's construction stock measured the
    // consequence (§6.1, §7.151): capital ARRIVING at ~0.5% of the capital stock a year against a
    // straight-line depreciation of ~8%, so the plant was being consumed several times faster
    // than it was replaced, invisibly, because a shrinking net PP&E also shrinks the capital
    // charge the labour rule sheds against.
    //
    // The anchor is the firm's OWN books: its gross plant over its OWN sector's useful life,
    // which is the same arithmetic the depreciation line below already runs. No new number.
    const usefulLifeYearsForCapex = SECTOR_PPE_USEFUL_LIFE_YEARS[comp.sector] ?? 12;
    const grossPPEForCapex = comp.grossPPEUSD ?? (comp.annualRevenue * (SECTOR_PPE_INTENSITY[comp.sector] ?? 0.5));
    const targetMaintenanceCapex = grossPPEForCapex / usefulLifeYearsForCapex;
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
      recordCredit(maintenanceFundingTranches[0].id, weeklyDebtFundedPortion,
        maintenanceFundingTranches[0].floatingMarginBps ?? 0, STANDARD_CORP_TENOR_YEARS * 52, false);
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
    // CAP — THE 0.4 FLOOR IS GONE, and its own comment had already convicted it: "a floor
    // justified as realistic is the shape rule 2 exists to catch." A firm under real payout
    // pressure DOES cut growth investment to zero, and the maintenance half is separately funded
    // and separately anchored to depreciation (§7.167), so nothing here needs protecting from a
    // firm choosing not to expand. Investment cannot be negative; that is all that is left.
    const growthCapexAllocationShare = Math.max(0, 1 - payoutPressure * 0.75);

    // CAP — A FIRM EXPANDS WHEN THE MARKET IT SELLS INTO CANNOT BE MET.
    //
    // Every term above is about the firm's FINANCES — cost of debt, cash, Tobin's Q, payout
    // pressure — and none is about whether it can fill the orders in front of it. So a firm that
    // stocked out every week invested exactly like one sitting on a full warehouse, and a market
    // in permanent shortage had no mechanism that could ever supply it. That is why §7.127's
    // supply famine persists after both of its other links were fixed: upstream extraction ran
    // demand at 1.6x supply with zero inventory from week 8 and its producers' capex never
    // noticed.
    //
    // The signal is the measured shortfall in the firm's OWN categories — demand the auction
    // could not fill — not a regime label. A firm short by a third wants a third more plant and
    // closes some share of that gap a year. What it can actually fund is already bounded by the
    // cash and rate terms above, so nothing here needs a cap (rule 2).
    const categoryShortfall = (comp.productLines || []).reduce((acc, l) => {
      const cd = reg.categoryDemand[l.subUnitId] as any;
      const supplied = cd?.totalUnitsSuppliedThisWeek ?? 0;
      const demanded = cd?.totalUnitsDemandedThisWeek ?? 0;
      if (!(supplied > 0) || !(demanded > 0)) return acc;
      return acc + Math.max(0, demanded / supplied - 1) * (l.revenueShare ?? 1);
    }, 0);
    const shortageCapexMultiple = 1 + categoryShortfall * CAPACITY_CATCHUP_SHARE_ANNUAL;

    const targetGrowthCapex = newRevenue * growthCapexToRevenueRatio * (1 - rateDrag) * cashHealthFactor * (1 + qCapexEffect + competitivenessCapexEffect) * growthCapexAllocationShare * shortageCapexMultiple;
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
    // IND13 — CONSTRUCTION IN PROGRESS. What arrived this week joins the assets under
    // construction, each lot carrying the week it enters service. The plant grows by what was
    // COMMISSIONED, not by what was delivered — so PP&E, and the capacity that grows off it,
    // arrive after the demand that justified them. That lag is the capacity cycle.
    const underConstruction = [
      ...(comp.assetsUnderConstruction ?? []),
      ...(companyUpdates[comp.ticker]?.capexUnderConstruction ?? []),
    ];
    let capexCommissionedThisWeekUSD = 0;
    const stillUnderConstruction: { valueUSD: number; entersServiceWeek: number }[] = [];
    underConstruction.forEach((lot) => {
      if (lot.entersServiceWeek <= nextWeek) capexCommissionedThisWeekUSD += lot.valueUSD;
      else stillUnderConstruction.push(lot);
    });
    const newGrossPPEUSD = priorGrossPPE + capexCommissionedThisWeekUSD;
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
    const post = (label: string, amountUSD: number, counterparty?: PartyRef, settle = true) => {
      if (!isFinite(amountUSD) || amountUSD === 0) return;
      cashLedger.push({ label, amountUSD: Number(amountUSD.toFixed(0)) });
      newCash += amountUSD;
      // `settle: false` = the line is REPORTED here but the money moves elsewhere, itemised. A
      // dividend is the case: the issuer owes the register, and the register pays each holder by
      // name — so the payment instructions come from the settlement of that register, and posting
      // one here as well would move the same money twice.
      if (!settle) return;
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
      // IND-R1: and its staff. A bank paying wages settles like any other payer — reserves out,
      // households' deposits in — and because a bank's payment is on its OWN account the other
      // leg is its equity, which is where a real bank's wage bill lands.
      post('wages paid to households', -weeklyPayrollUSD, { kind: 'HOUSEHOLD', region: comp.region });
    } else {
      const settledSalesUSD = update?.salesUSD ?? 0;
      const settledPurchasesUSD = update?.purchasesUSD ?? 0;
      post('settled sales (real auction receipts)', settledSalesUSD, undefined, false);
      post('settled purchases (real auction: inputs + capex)', -settledPurchasesUSD, undefined, false);
      // XB3a-5: a cross-border sale is delivered and INVOICED, not collected. Revenue is
      // recognised in full at delivery above; the cash is backed out here and posted when the
      // invoice falls due, at whatever the invoice currency is then worth. The gap between the
      // two is the transaction FX exposure, and it lands as real cash rather than a statistic.
      post('sales invoiced, not yet collected', -(update?.tradeReceivableBookedUSD ?? 0));
      post('cross-border invoices collected', update?.tradeReceivableCollectedUSD ?? 0);
      post('purchases invoiced, not yet paid', update?.tradePayableBookedUSD ?? 0);
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
      // SETL-B: wages are paid to HOUSEHOLDS, who exist and hold deposits. The rest of the line
      // is services and inputs bought outside the modelled auction, which keeps the boundary
      // until those sellers exist. The split is the company's own wage bill against its other
      // operating costs — not a chosen ratio.
      const opexOutflowUSD = Math.max(0, accruedOutflowsWeekly - Math.max(0, settledPurchasesUSD - capexSettledUSD));
      // HH: THE FIRM'S OWN PAYROLL — its headcount, in the occupations its sector employs, at
      // the wage those occupations clear at, times the wage this firm itself offers
      // (`offeredWageIndex`, which moves with its own hiring success in the labor market).
      //
      // What this replaces: `employeeCount x (estimatedHouseholdIncomeUSD / regionEmployed)`, a
      // per-capita INCOME figure standing in for a wage. Every employer in a region paid the same
      // average regardless of who it employed or what it offered, and once household income
      // became the sum of what employers pay, the number would have depended on itself.
      //
      // A firm pays its staff in full. What is left of the week's operating outflow is the rest
      // of running the business; it cannot be negative, and a payroll larger than the accrued
      // operating cost is a firm whose cash falls faster than its P&L — which is what that is.
      // The same payroll the P&L above was charged — one number, computed once (rule 3).
      const wagesPaidUSD = weeklyPayrollUSD;
      post('wages paid to households', -wagesPaidUSD, { kind: 'HOUSEHOLD', region: comp.region });
      // SVC: services are a real market now — professional, facilities and repair sub-units sit
      // in the registry, this firm's recipe includes them, and it BIDS for them in stage 05
      // against real sellers like any other input. What remains on this line is the operating
      // cost that is neither wages nor a purchase the auction covers.
      //
      // The supplier used to be picked here, by a size-weighted hash over the SME pools. That was
      // an allocation standing in for a purchasing decision — the thing rule 13 forbids — and it
      // is deleted rather than tuned.
      post('other opex beyond auction settlements', -Math.max(0, opexOutflowUSD - wagesPaidUSD));
      post('inventory carrying cost', -carryingCostUSD);
      // SETL4: reported here, paid itemised below — the house bank for its facilities, the
      // register for market paper. One aggregate line on the cash walk, three real payees.
      post('interest paid', -weeklyInterest, undefined, false);
      if (facilityInterestWeeklyUSD > 0 && comp.homeBankTicker) {
        pay(ctx, {
          payer: { kind: 'COMPANY', ticker: comp.ticker },
          payee: { kind: 'BANK', ticker: comp.homeBankTicker },
          amountUSD: facilityInterestWeeklyUSD,
          reason: 'facility interest to the lending bank',
        });
      }
      // CAL: accrue to whoever holds it this week; pay it out on the coupon date. The cash that
      // leaves on that date IS the sum of the accruals, so the issuer's ledger and the holders'
      // receivables clear against each other exactly.
      accrueHoldersInterest(ctx, comp.id, 'CORP_BOND', marketBondAccrualUSD);
      accrueHoldersInterest(ctx, comp.id, 'LEVERAGED_LOAN', marketLoanAccrualUSD);
      if (bondCouponDue) payHoldersAccruedInterest(ctx, comp.id, 'CORP_BOND');
      if (loanCouponDue) payHoldersAccruedInterest(ctx, comp.id, 'LEVERAGED_LOAN');
      void marketFixedInterestWeeklyUSD; void marketFloatingInterestWeeklyUSD;
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
      const maxSustainableWeekly = Math.max(0, newNetIncome) * maxDividendPayoutRatioOf(comp) / 52;
      // SETL3: a dividend is paid to the REGISTER. It used to leave the payer and arrive nowhere
      // — the one-sided flow §6 half-knew about, listing "institutional dividend passthrough" as
      // an unbuilt receipt channel. The paying-agent path already exists for call premiums and
      // takeouts: the issuer says what the holders of its equity are owed, and the settlement
      // pass distributes it pro rata to whoever the register says holds it. The issuer does not
      // need to know its holders, which is exactly why real issuers appoint an agent.
      // CAL: a board declares QUARTERLY and pays on a date, and the company's own reporting
      // quarter is that date — the same thirteen-week clock stage 08 already runs its earnings
      // on. Thirteen weeks of dividend leave in one week and nothing in the other twelve, which
      // is what a shareholder's cash actually looks like and what a fund reinvesting it feels.
      const dividendAccrualWeeklyUSD = Math.min(declaredDividendWeekly, maxSustainableWeekly);
      const dividendWeeklyUSD = currentWeekMod13 === 13 ? dividendAccrualWeeklyUSD * 13 : 0;
      post('dividends paid', -dividendWeeklyUSD, undefined, false);
      payHoldersCash(ctx, comp.id, 'EQUITY', dividendWeeklyUSD);
      post('maintenance funding draw (new tranche proceeds)', weeklyDebtFundedPortion, bankCredit);
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
      // CRD-R1 — the rating reads everything the model already measures about this issuer, not
      // just two ratios (§7.184). Every argument is a measurement taken elsewhere for another
      // purpose; nothing here is a new stated weight.
      const wallUSD = comp.debtTranches
        .filter((t) => (t.maturityWeek ?? Infinity) - nextWeek <= 52)
        .reduce((a, t) => a + t.principalUSD, 0);
      const ladderUSD = Math.max(1, comp.debtTranches.reduce((a, t) => a + t.principalUSD, 0));
      const revHist = comp.revenueHistory ?? [];
      const revMean = revHist.length > 2 ? revHist.reduce((a, x) => a + x, 0) / revHist.length : 0;
      const revVol = revMean > 0
        ? Math.sqrt(revHist.reduce((a, x) => a + (x - revMean) ** 2, 0) / revHist.length) / revMean
        : 0;
      const calculatedRating = determineCreditRating(newLeverage, newCoverage, {
        annualRevenueUSD: newRevenue,
        peerMedianRevenueUSD: regionMedianRevenueUSD,
        customerConcentration: comp.customerConcentration,
        supplierConcentration: comp.supplierConcentration,
        maturityWallShare: wallUSD / ladderUSD,
        liquidityToDebt: Math.max(0, newCash) / ladderUSD,
        revenueVolatility: revVol,
      });
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
      // IND4: rating decides an issuer's ACCESS to the bond market; the industry tilts it by
      // what the money is buying. Long-lived assets are funded long, asset-light ones float.
      const refinanceAsFixed = fixedShareOf(comp) >= 0.5;
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
        leadBankTicker: leadBankFor(comp, tranche.principalUSD),
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
        const retiredTranches = updatedTranches.filter(t => retire.has(t.id));
        const retiredUSD = retiredTranches.reduce((a, t) => a + t.principalUSD, 0);
        retiredTranches.forEach(t => recordCredit(t.id, t.principalUSD, 0, 0, true));
        updatedTranches = updatedTranches.filter(t => !retire.has(t.id));
        debtRepaymentThisWeek += retiredUSD;
        post('term-out: maintenance bridges retired', -retiredUSD, bankCredit);
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
      recordCredit(revolverTranche.id, revolverTranche.principalUSD, REVOLVER_MARGIN_BPS,
        Math.max(1, revolverTranche.maturityWeek - nextWeek), false);
      post('revolver draw: withdrawn refinancing', revolverTranche.principalUSD, bankCredit);
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
        const asFixed = fixedShareOf(comp) >= 0.5;  // IND4: rating's access, industry's tilt
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
          leadBankTicker: leadBankFor(comp, bridgeUSD),
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
        leadBankTicker: leadBankFor(comp, dealSizeUSD),
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

    // IND-R6: public-only. Sell-side consensus and an earnings surprise need a firm that
    // REPORTS — real private firms publish none of this. One of the few things the deleted
    // branch was right to skip, now guarded where it happens instead of forking the whole model.
    if (isReportingThisWeek && isPubliclyListed(comp)) {
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
    // IDX / rule 15: no floor. `comp.stockPrice` arrives here as 07e's CLEARED price, and a
    // company whose equity the market has decided is worthless approaches zero — the endgame is
    // delisting and default, not a ten-cent bound that then feeds market cap, index levels and
    // the take-private arithmetic. Only the non-negativity remains, which is arithmetic.
    let newStockPrice = isDefaulted ? 0.0 : Math.max(0, Number(comp.stockPrice.toFixed(2)));
    // IND7: the antitrust clock. It counts UP while this firm is dominant in some category it
    // sells into and resets when it is not, so the consequence attaches to a sustained position
    // rather than one good quarter.
    const newAntitrustWeeks = peakCategoryShare({ productLines: updatedProductLines }) >= ANTITRUST_SHARE_THRESHOLD
      ? (comp.antitrustWeeksAboveThreshold ?? 0) + 1
      : 0;

    // IDX: beta is measured off this name's own cleared returns against its region's index —
    // both series this model publishes every week — instead of being read from its sector label.
    const newBeta = isPubliclyListed(comp)
      ? measureBeta(comp.historicalPrices, regionIndexOf(state.compositeIndices, comp.region).historical, comp.beta ?? 1)
      : (comp.beta ?? 1);
    const newForwardPE = newEps > 0 ? Number((newStockPrice / newEps).toFixed(2)) : comp.forwardPE;
    // The book-value x cycle-P/B branch that used to price banks and institutions here is GONE.
    // It was the last formula price setter for a listed cohort: a multiple looked up from the
    // cycle regime, applied to a book value, dividing into a share count — everything WS4 removed
    // from every other name. They clear in 07e now, on their own real earnings and their own real
    // balance-sheet equity, so this stage reads their price exactly as it reads everyone else's.
    const hist = [...comp.historicalPrices.slice(-51), newStockPrice];

    // CASH — the corporate treasury book. It is not decided here any more.
    //
    // What this replaces: the block that stood here compared a target sleeve to the current book
    // and closed the gap by MINTING the paper — `treasuryHoldings.push(...)` against an UNMODELED
    // payer — or by scaling every row down and taking cash from the same nowhere. It was a
    // holding decided by a formula and a purchase with no seller, which is rule 13 and rule 1 in
    // one block. 07f runs the treasurer's bid through the bill auction against real sellers
    // (domain/company.ts owns the sleeve arithmetic), and this stage now simply carries what
    // that auction filled.
    const newTreasuryHoldings = ctx.companyUpdates[comp.ticker]?.treasuryHoldings ?? comp.treasuryHoldings ?? [];

    // Buyback Execution (Part AH)
    let updatedSharesOutstanding = comp.sharesOutstanding;
    const targetCashBuffer = Math.max(10, comp.currentLiabilities * 1.5);
    const excessCash = Math.max(0, newCash - targetCashBuffer);
    const debtToEquity = newTotalDebt / Math.max(1, (newStockPrice * comp.sharesOutstanding));
    // IND-R6: public-only — retiring shares into the market needs a market to retire them into.
    // A private firm's distributions to its owners are HC's sponsor machinery, not a buyback.
    if (isPubliclyListed(comp) && excessCash > 5 && debtToEquity < 0.6 && comp.sharesOutstanding > 10 && !isDefaulted && newStockPrice > 0) {
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
    // G5: the baseline drifts toward what this REGION's workouts have actually recovered, not
    // toward a prior nobody measured. And the 0.10 floor is gone with the mechanism that
    // justified it — recovery is what selling real assets against real claims produces, and if
    // that is near zero for an issuer with nothing to sell, that is the answer (rule 2).
    const regionRecovery = creditRecoveryRate(reg);
    const newBaselineRecoveryRate = Number(((comp.baselineRecoveryRate ?? regionRecovery) * 0.998 + regionRecovery * 0.002).toFixed(4));
    const effectiveRecoveryRate = Math.max(0, newBaselineRecoveryRate * (1 - systemicStressFactor));
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
        // The counterparty is a named fund that exists — routing it to the boundary would have
        // the fund credited by its own stage AND the money appear at the boundary, which creates
        // it (measured: 64B over 12 weeks; the bank identity could not see it because the
        // institutional sector is not in the settlement layer yet).
        const sweepFund = findRegionMmf(ctx.updatedInstitutionalEntities, comp.region);
        post(sweep.cashDeltaUSD < 0 ? 'treasury sweep into money fund shares' : 'money fund share redemption',
          sweep.cashDeltaUSD,
          sweepFund ? { kind: 'INSTITUTION', id: sweepFund.id } : undefined);
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
      // IND13 — the plant grew by what entered service. Both lines are named on the rebuild
      // because a fixed field list drops what it does not name (§7.41), and a dropped
      // construction queue is capital that arrives and then never exists.
      capexCommissionedLastWeekUSD: Number(capexCommissionedThisWeekUSD.toFixed(1)),
      assetsUnderConstruction: stillUnderConstruction,
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
      // IND10 — the production pipeline stage 05 advanced. Named here because a rebuild from a
      // fixed field list silently drops whatever it does not name (§7.41), and a dropped
      // pipeline is a firm whose half-built output vanishes every week.
      wipBySubUnit: update?.wipBySubUnit ?? comp.wipBySubUnit,
      recentFulfillmentEMA: Number(newRecentFulfillmentEMA.toFixed(4)),
      // IND14 — the delivery record, smoothed slowly onto the firm. A week in which this
      // supplier owed nothing tells us nothing, so it leaves the record where it was.
      deliveryReliability: Number((() => {
        const owed = (update as any)?._contractOwedUnits ?? 0;
        const prior = comp.deliveryReliability ?? 1;
        if (!(owed > 0)) return prior;
        const shipped = (update as any)?._contractDeliveredUnits ?? 0;
        return prior * 0.9 + Math.max(0, Math.min(1, shipped / owed)) * 0.1;
      })().toFixed(4)),
      recurringRevenueBaseUSD: newRecurringBaseUSD === undefined
        ? undefined : Number(newRecurringBaseUSD.toFixed(0)),
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
      beta: newBeta,
      antitrustWeeksAboveThreshold: newAntitrustWeeks,
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
    // CAL: the week's interest accruals onto the register, and the coupon dates that clear them.
    applyHolderInterestAccruals(ctx, (regionId) => ({ kind: 'GOVERNMENT', region: regionId as RegionId }));

  ctx.newsItems.push(...refinanceNews);
}
