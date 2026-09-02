/**
 * ENGINE V2 — STAGE 08's BACK HALF: the remainder of the company-week kernel (capital programme,
 * learning, capacity retirement, PP&E roll-forward, the cash walk, liquidity ladder, default and
 * rating, the debt lifecycle, earnings, buybacks, the sweep, and the 70-field write-back), moved
 * whole from 08-company-fundamentals.ts. Same statements, same order, same floats — the stage
 * builds the per-week indexes and hands them in as deps; the shard machinery and post-loop
 * settlement passes stay with the stage.
 *
 * This file is the strangler's working surface: from here the reads flip table-by-table onto
 * engine2 columns (tranches first, then lots, then the firm scalars) without touching the stage.
 */

import { PATIENCE_MEDIAN_WEEKS } from '../domain/preferences';
import { GameState, Company, DebtTranche, NewsItem, SegmentFinancial } from '../types';
import { WeeklyStepContext, CompanyWeekUpdate } from '../engine/simulation/stages/context';
import { BackLanes } from './stage08-lanes';
import {
  isActiveCompany, isPubliclyListed, ANTITRUST_SHARE_THRESHOLD, peakCategoryShare,
  managedEntityIdsOf, TREASURY_OPERATING_BUFFER_SHARE_OF_REVENUE,
} from '../domain/company';
import { callProtectionForIssue, callPricePerDollar } from '../domain/call-protection';
import { isInvestmentGrade } from '../engine/simulation/stages/asset-allocation';
import { industryOfSubUnit, firmInputIntensities, financingProfileOf } from '../domain/industry-registry';
import { calculateNelsonSiegelZeroRate } from '../engine/nelsonSiegel';
import { SECTOR_BENCHMARKS } from '../engine/pricing';
import { formatCurrency, formatQuarterFilingDate, formatSimulationDate } from '../engine/formatters';
import { determineCreditRating } from '../engine/simulation/credit';
import { SECTOR_PPE_USEFUL_LIFE_YEARS, SECTOR_PPE_INTENSITY } from '../engine/simulation/constants';
import { FIXED_SHARE_BY_RATING, buildQuarterlyFundamentalSnapshot, CogsCostDrivers } from '../engine/companyGenerator';
import {
  getRatingBucket, settleCorporateActionOnHolders, payHoldersCash, DEFAULT_COVERAGE_FLOOR,
  creditRecoveryRate, accrueHoldersInterest, payHoldersAccruedInterest,
} from '../engine/simulation/stages/shared-helpers';
import { openCorporateSweepBooks, corporateSweepDecision, findRegionMmf } from '../engine/simulation/stages/money-market-fund';
import { decideCorporateFinancing, committedLineHeadroomUSD } from '../engine/simulation/stages/corporate-financing';
import { PrimaryOffering } from '../domain/primary-market';
import { EMPLOYER_PAYROLL_TAX_RATE } from '../engine/bootstrap/national-accounts';
import { PROFILE_REGISTRY, profileKeyOf } from '../engine/simulation/stages/profiles';
import { measureBeta, regionIndexOf } from '../engine/macro/indices';
import { pay, payByIds, internReason, PartyRef } from '../engine/simulation/stages/settlement';
import { defect } from '../domain/defect';
import { partyId } from '../engine/ledger/party';
import { planCapitalProgramme, capacityRetirement } from '../domain/company-week/capital-programme';
import { learningUpdate, seedCumulativeUnits } from '../domain/company-week/learning';
import { creditMetrics, revolverDrawUSD, isInDefault, maturityWallShare } from '../domain/company-week/credit-standing';
import { callEconomics, callableAmountUSD } from '../domain/company-week/debt-ladder';
import { profileIncome } from '../domain/company-week/income-statement';
import { dividendDecision } from '../domain/company-week/distributions';
import { companyFairValuePerShare, REPRESENTATIVE_HOLDER_REQUIRED_RETURN } from '../engine/equity-valuation';
import { random } from '../engine/rng';
import { FrontPass, DUE_BOND, DUE_CP, DUE_LOAN } from './stage08-front';
import { ladderRowsOf, materializeTranche, TR_FLOATING, TR_CP, TR_FACILITY } from './tranches';
import { issueTranche, retireTranche, commitLadder } from '../engine/ledger/tranche-ledger';
import { ringFill, ringPush, ratingCodeOf, revHistLen, revHistAt, rowOf, V2World } from './world';
import { totalInputValueUSD } from './lots';

/**
 * SCALE / DECLARED RELABEL (the user's drift acceptance, 2026-09-01): decimal rounding by
 * arithmetic instead of a string round-trip. `Number(x.toFixed(n))` allocated, formatted and
 * re-parsed a string ~55k times a week across the kernel; these round the same numbers the
 * arithmetic way. Half-point and far-ULP cases can land one ULP differently than the decimal
 * string did — accepted numeric drift, no mechanism changes.
 */
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round4 = (v: number) => Math.round(v * 10000) / 10000;


export const STANDARD_CORP_TENOR_YEARS = 5;

/** IND4 — a firm's payout discipline is its INDUSTRY's, from the registry. */
const DEFAULT_MAX_DIVIDEND_PAYOUT_RATIO = 0.6;
function fixedShareOf(comp: Company): number {
  const base = FIXED_SHARE_BY_RATING[comp.creditRating] ?? 0.5;
  const primary = (comp.productLines || [])[0];
  const industry = primary ? industryOfSubUnit(primary.subUnitId) : undefined;
  return industry ? base * financingProfileOf(industry).fixedRateTilt : base;
}
// (maxDividendPayoutRatioOf moved to the seam — L.maxPayoutRatio, §7.325 W1; the 0.6 default
// lives in stage08-lanes.ts with the fill.)

/** CAP — the share of a measured capacity shortfall a firm tries to close in a year. */
const CAPACITY_CATCHUP_SHARE_ANNUAL = 0.35;

/** LEARN_TRACE=1 — per-quarter learning-state rows; the stage prints and clears at exit. */
export const learnTraceRows: { m: number; g: number }[] = [];
/** BYPASS_TRACE=1 — per (region:label) weekly sums of the walk's settle:false legs. */
export const bypassTraceByLabel = new Map<string, number>();
/** BOUNDARY_TRACE=1 — who collects 'non-auction operating receipts', per firm. */
export const boundaryTraceByFirm = new Map<string, number>();
const priceScratch: number[] = [];

export interface BackKernelDeps {
  state: GameState;
  ctx: WeeklyStepContext;
  v2: V2World;
  F: FrontPass;
  /** §7.317 — the seam lanes the back cores read (built once before the shard loop). */
  backLanes: BackLanes;
  nextWeek: number;
  currentWeekMod13: number;
  updatedRegions: WeeklyStepContext['updatedRegions'];
  companyUpdates: Record<string, CompanyWeekUpdate>;
  entityById: Map<string, GameState['institutionalEntities'][number]>;
  regionMedianRevenueUSD: number;
  systemicStressFactorGlobal: number;
  retainCashLedger: boolean;
  mmfSweepBooks: ReturnType<typeof openCorporateSweepBooks>;
  primarySettlementByIssuerId: Map<string, { offering: PrimaryOffering; clearedStat: number; withdrawn: boolean; marketTakeUSD: number; issuedUSD: number; proceedsUSD: number }>;
  pendingOfferingIssuerIds: Set<string>;
  leadBankFor: (comp: Company, sizeUSD: number) => string;
  enqueueOffering: (o: PrimaryOffering) => void;
  /** Appends to the stage's refinance-news accumulator (swapped by the shard machinery). */
  pushNews: (n: NewsItem) => void;
  /** §7.321 barrier mode: reports the post sweep's exact share delta so the merge can rebuild
   *  the region book's netInflow float sum in original firm order. */
  onSweepDelta?: (row: number, deltaUSD: number) => void;
  /** §7.325 barrier/worker capture: the cash walk's two exact tax amounts by row (NaN = no
   *  write), so the firm-major replay adds the SAME floats the serial walk added — a delta
   *  recovered by subtracting map values would be a different float (§7.324's lesson). */
  taxCapture?: { accrueUSD: Float64Array; collectUSD: Float64Array };
}

/** The back half of one company's week — same statements the stage's kernel ran, same order. */
// §7.315's method — a coarse per-firm split of the kernel's ~150 ms/wk. Free when off.
const S08K_PROF = typeof process !== 'undefined' && process.env?.S08K_PROF === '1';
export const s08k = { capital: 0, cash: 0, debt: 0, tail: 0 };

/**
 * §7.317 — THE CAPITAL BLOCK AS ONE PURE-CALL UNIT (draw-free; §7.222 order-safe: it reads only
 * this firm, its frozen region tables and its own week update). Extracted verbatim so the batch
 * pass and the profile path share ONE implementation; every side effect with a load-bearing
 * ORDER (the maintenance credit event) is returned as data for the caller to emit at the exact
 * sequence point the inline block used.
 */
interface CapitalBlockOut {
  maintenanceCapexUSD: number;
  maintenanceShortfallStreak: number;
  debtFundedMaintenanceUSD: number;
  maintenanceFundingTranches: DebtTranche[];
  growthCapexUSD: number;
  rndExpenseUSD: number;
  occupationMixDrift: NonNullable<Company['occupationMixDrift']>;
  capexUSD: number;
  grossPPEUSD: number;
  accumulatedDepreciationUSD: number;
  weeklyDepreciationUSD: number;
  payoutPressure: number;
  /** §7.317 step 1.3 — the block's comp writes, returned as data; the caller applies them at
   *  the original write points (the future post pass). All-or-none per the seeding rule. */
  learningWrites?: { cumulativeUnits: number; multiplier: number; growthAnnual: number };
  retirementWrites: { idleStreakWeeks: number; mothballedPpeShare: number; mothballedStreakWeeks: number };
  scrapWrites?: { grossPPEUSD: number; accumulatedDepreciationUSD: number };
}

function runCapitalBlock(row: number, L: BackLanes, args: {
  newEbitda: number;
  newRevenue: number;
  weeklyInterest: number;
  effectiveDebtRate: number;
  newExecutionQuality: number;
  capexCommissionedThisWeekUSD: number;
  nextWeek: number;
  priorOccupationMixDrift: Company['occupationMixDrift'];
  homeBankTicker: string | undefined;
}): CapitalBlockOut {
  const { newEbitda, newRevenue, weeklyInterest, effectiveDebtRate, newExecutionQuality,
    capexCommissionedThisWeekUSD, nextWeek, priorOccupationMixDrift, homeBankTicker } = args;
  // §7.317 step 1.3 — THE CAPITAL CORE READS LANES, NOT THE OBJECT. Every `x ?? d` the object
  // read had becomes `Number.isNaN(lane) ? d : lane` on the same value; the scrap/learning
  // read-after-write chains thread locals carrying exactly the values the object carried.
  const usefulLifeYearsForCapex = L.usefulLifeYears[row];
  const g0 = L.grossPPEUSD[row];
  const a0 = L.accumulatedDepreciationUSD[row];
  const grossPPEForCapex = Number.isNaN(g0) ? L.ppeDefaultUSD[row] : g0;
  const addressableGrowthAnnual = L.addressableGrowthAnnual[row];
  const categoryShortfall = L.categoryShortfall[row];
  const avgCompetitiveness = L.avgCompetitiveness[row];

  // §5-PROD — Wright's-law learning: fold this week's making into the firm's own curve.
  let learningWrites: CapitalBlockOut['learningWrites'];
  {
    const producedUnits = L.producedUnitsThisWeek[row];
    const capacityUnits = L.plantCapacityUnitsThisWeek[row];
    let cumulative = L.cumulativeOutputUnits[row]; // NaN = undefined
    let multiplier = L.learningMultiplier[row];    // NaN = undefined
    if (Number.isNaN(cumulative) && (capacityUnits > 0 || producedUnits > 0)) {
      cumulative = seedCumulativeUnits(Math.max(capacityUnits, producedUnits) * 52);
      if (Number.isNaN(multiplier)) multiplier = 1;
    }
    if (!Number.isNaN(cumulative)) {
      const learned = learningUpdate({
        priorCumulativeUnits: cumulative,
        producedUnitsThisWeek: producedUnits,
        priorMultiplier: Number.isNaN(multiplier) ? 1 : multiplier,
      });
      learningWrites = {
        cumulativeUnits: learned.cumulativeUnits,
        multiplier: learned.multiplier,
        growthAnnual: learned.growthAnnual,
      };
    }
    // LEARN_TRACE=1 — the learning distribution, quarterly (§7.301's seed question).
    if (process.env.LEARN_TRACE === '1' && nextWeek % 13 === 0) {
      const priorGrowth = L.lastLearningGrowthAnnual[row];
      learnTraceRows.push({
        m: learningWrites?.multiplier ?? (Number.isNaN(multiplier) ? 1 : multiplier),
        g: learningWrites?.growthAnnual ?? (Number.isNaN(priorGrowth) ? -1 : priorGrowth),
      });
    }
  }

  // §5-DYN — the capacity-retirement STOCK response (mothball / restart / scrap).
  const retirement = process.env.DYN_MOTHBALL_OFF === '1'
    ? { idleStreakWeeks: 0, mothballedShare: 0, mothballedStreakWeeks: 0, scrappedShare: 0 }
    : capacityRetirement({
      idleRevenueShareThisWeek: L.idleLineRevenueShare[row],
      // §7.345 — the plant this week's produce-to-sales decision did not need (stage 05 measures
      // it where the decision runs); sustained for the management's horizon it comes offline —
      // the exit from an oversupplied market that is not default.
      demandSlackRevenueShare: L.demandSlackRevenueShare[row],
      mothballAfterWeeks: L.mgmtPatienceWeeks[row],
      scrapAfterWeeks: 4 * L.mgmtPatienceWeeks[row],
      priorIdleStreakWeeks: Number.isNaN(L.idleStreakWeeks[row]) ? 0 : L.idleStreakWeeks[row],
      priorMothballedShare: Number.isNaN(L.mothballedPpeShare[row]) ? 0 : L.mothballedPpeShare[row],
      priorMothballedStreakWeeks: Number.isNaN(L.mothballedStreakWeeks[row]) ? 0 : L.mothballedStreakWeeks[row],
    });
  let scrapWrites: CapitalBlockOut['scrapWrites'];
  // the object chain: after a scrap both fields are DEFINED; without one they keep their
  // seam values (possibly undefined). gCur/aCur carry NaN for "still undefined".
  let gCur = g0;
  let aCur = a0;
  if (retirement.scrappedShare > 0) {
    const scrappedGrossUSD = grossPPEForCapex * retirement.scrappedShare;
    const scrappedDepUSD = (Number.isNaN(a0) ? grossPPEForCapex * 0.45 : a0) * retirement.scrappedShare;
    gCur = Math.max(0, grossPPEForCapex - scrappedGrossUSD);
    aCur = Math.max(0, (Number.isNaN(a0) ? 0 : a0) - scrappedDepUSD);
    scrapWrites = { grossPPEUSD: gCur, accumulatedDepreciationUSD: aCur };
  }

  const programme = planCapitalProgramme({
    grossPPEUSD: grossPPEForCapex,
    mothballedPpeShare: retirement.mothballedShare,
    accumulatedDepreciationUSD: Number.isNaN(aCur) ? (grossPPEForCapex * 0.45) : aCur,
    usefulLifeYears: usefulLifeYearsForCapex,
    weeklyEbitdaUSD: newEbitda / 52,
    weeklyInterestUSD: weeklyInterest,
    cashUSD: L.cashUSD[row],
    currentLiabilitiesUSD: L.currentLiabilitiesUSD[row],
    annualRevenueUSD: L.annualRevenueUSD[row],
    newRevenueUSD: newRevenue,
    priorMaintenanceCapexUSD: Number.isNaN(L.maintenanceCapexUSD[row]) ? (L.capexUSD[row] * 0.6) : L.maintenanceCapexUSD[row],
    priorGrowthCapexUSD: Number.isNaN(L.growthCapexUSD[row]) ? (L.capexUSD[row] * 0.4) : L.growthCapexUSD[row],
    priorMaintenanceShortfallStreak: Number.isNaN(L.maintenanceShortfallStreak[row]) ? 0 : L.maintenanceShortfallStreak[row],
    baselineGrowthCapexToRevenueRatio: Number.isNaN(L.baselineGrowthCapexToRevenueRatio[row])
      ? ((Number.isNaN(L.growthCapexUSD[row]) ? (L.capexUSD[row] * 0.4) : L.growthCapexUSD[row]) / Math.max(1, L.annualRevenueUSD[row]))
      : L.baselineGrowthCapexToRevenueRatio[row],
    isInvestmentGrade: L.investmentGrade[row] === 1,
    hasHouseBank: homeBankTicker !== undefined,
    addressableGrowthAnnual,
    categoryShortfall,
    capacityCatchupShareAnnual: CAPACITY_CATCHUP_SHARE_ANNUAL,
    effectiveDebtRate,
    marketCapUSD: L.marketCapUSD[row],
    totalDebtUSD: L.totalDebtUSD[row],
    avgCompetitiveness,
    patienceWeeks: L.mgmtPatienceWeeks[row],
    riskAversion: L.mgmtRiskAversion[row],
  });

  // CAPEX_TRACE=1 — the §7.272/§7.287 money-bid decomposition (string lanes, main-side).
  if (process.env.CAPEX_TRACE === '1' && programme.capexUSD > 0.5e9) {
    const ratio0 = L.baselineGrowthCapexToRevenueRatio[row];
    console.log(`  [capex] w${nextWeek} ${L.region[row]}:${L.ticker[row]} ${L.sector[row]} `
      + `capex ${(programme.capexUSD / 1e9).toFixed(2)}B/yr (maint ${(programme.maintenanceCapexUSD / 1e9).toFixed(2)} growth ${(programme.growthCapexUSD / 1e9).toFixed(2)}) `
      + `rev ${(newRevenue / 1e9).toFixed(2)}B ratio ${(Number.isNaN(ratio0) ? -1 : ratio0).toFixed(4)} `
      + `shortfall ${categoryShortfall.toFixed(3)} addrGrowth ${addressableGrowthAnnual.toFixed(3)} `
      + `ppe ${(grossPPEForCapex / 1e9).toFixed(2)}B ebitda/wk ${(newEbitda / 52 / 1e6).toFixed(1)}M`);
  }

  const newMaintenanceCapex = programme.maintenanceCapexUSD;
  const newMaintenanceShortfallStreak = programme.maintenanceShortfallStreak;
  const weeklyDebtFundedPortion = programme.debtFundedMaintenanceUSD;

  // The bridge is a REAL tranche on a real bank's book (§1.3: one writer per fact).
  let maintenanceFundingTranches: DebtTranche[] = [];
  if (weeklyDebtFundedPortion > 1000) {
    maintenanceFundingTranches = [{
      id: `${L.ticker[row]}-MAINT-${nextWeek}`,
      principalUSD: weeklyDebtFundedPortion,
      rateType: 'FLOATING',
      floatingMarginBps: Math.round(L.oasSpreadBps[row] * 1.1), // priced wide — bridge, not term
      originationWeek: nextWeek,
      maturityWeek: nextWeek + STANDARD_CORP_TENOR_YEARS * 52,
      seniority: 'SENIOR',
      // G2: a bridge is BANK debt — it lives on the house bank's itemized book.
      isBankFacility: true,
      facilityBankTicker: homeBankTicker,
    }];
  }

  let newGrowthCapex = programme.growthCapexUSD;
  let newRndExpense = Number.isNaN(L.rndExpenseUSD[row]) ? 0 : L.rndExpenseUSD[row];
  const rndShare = L.rndShareOfGrowthCapex[row];
  if (rndShare > 0) {
    newRndExpense = newGrowthCapex * rndShare;
    newGrowthCapex = newGrowthCapex * (1 - rndShare);
  }

  const priorGrowth = L.growthCapexUSD[row];
  const growthCapexIntensity = (newGrowthCapex - (Number.isNaN(priorGrowth) ? 0 : priorGrowth))
    / Math.max(1, Number.isNaN(priorGrowth) ? 1 : priorGrowth);
  const isAutomating = growthCapexIntensity > 0.05 && newExecutionQuality > 1.0;
  // SCALE — cloned only when actually written (replacement-neutral for the battery replays).
  let newOccupationMixDrift = priorOccupationMixDrift || {};
  if (isAutomating) {
    newOccupationMixDrift = { ...newOccupationMixDrift };
    newOccupationMixDrift.TECHNICAL_ENGINEERING = Math.min(0.15, (newOccupationMixDrift.TECHNICAL_ENGINEERING ?? 0) + 0.001);
    newOccupationMixDrift.GENERAL = Math.max(-0.15, (newOccupationMixDrift.GENERAL ?? 0) - 0.001);
  }

  const newCapex = L.isBanksSector[row] === 1 ? 0 : (newMaintenanceCapex + newGrowthCapex);

  // PP&E roll-forward (IND13: grows by what was COMMISSIONED; the lag is the capacity cycle).
  const priorGrossPPE = Number.isNaN(gCur) ? L.ppeDefaultUSD[row] : gCur;
  const priorAccumulatedDepreciation = Number.isNaN(aCur) ? (priorGrossPPE * 0.45) : aCur;
  // ONE owner of book depreciation: the capital programme's straight-line rule (§6.1's
  // "three depreciations in 08" row — this was the second copy of the same formula).
  const weeklyDepreciation = programme.weeklyDepreciationUSD;
  const newGrossPPEUSD = priorGrossPPE + capexCommissionedThisWeekUSD;
  const newAccumulatedDepreciationUSD = Math.min(newGrossPPEUSD, priorAccumulatedDepreciation + weeklyDepreciation);
  return {
    maintenanceCapexUSD: newMaintenanceCapex,
    maintenanceShortfallStreak: newMaintenanceShortfallStreak,
    debtFundedMaintenanceUSD: weeklyDebtFundedPortion,
    maintenanceFundingTranches,
    growthCapexUSD: newGrowthCapex,
    rndExpenseUSD: newRndExpense,
    occupationMixDrift: newOccupationMixDrift,
    capexUSD: newCapex,
    grossPPEUSD: newGrossPPEUSD,
    accumulatedDepreciationUSD: newAccumulatedDepreciationUSD,
    weeklyDepreciationUSD: weeklyDepreciation,
    payoutPressure: programme.payoutPressure,
    learningWrites,
    retirementWrites: {
      idleStreakWeeks: retirement.idleStreakWeeks,
      mothballedPpeShare: retirement.mothballedShare,
      mothballedStreakWeeks: retirement.mothballedStreakWeeks,
    },
    scrapWrites,
  };
}

/** §7.317 — the closure-wide cash primitive as a FACTORY: one mutable cash box, one ledger,
 *  one post; the walk and every later block write through the same instance, exactly as the
 *  closure binding did. */
function makeCashPoster(ticker: string, region: Company['region'], cashUSD: number, ctx: WeeklyStepContext, retainCashLedger: boolean): {
  post: (label: string, amountUSD: number, counterparty?: PartyRef, settle?: boolean) => void;
  cash: { usd: number };
  cashLedger: { label: string; amountUSD: number }[];
} {
    const cashLedger: { label: string; amountUSD: number }[] = [];
    const cash = { usd: cashUSD };
    // SETL2: a ledger entry IS a payment instruction. The S5 walk already named every flow and
    // its amount; what it never named was the OTHER SIDE, which is why corporate cash could move
    // without any bank knowing (§7.86). Each post now names a counterparty; where the model does
    // not have one yet it says so explicitly (`UNMODELED`), and the size of that line is the
    // honest measure of how much of the payment graph is still unnamed — a number to watch down
    // as later slices name each flow, not a plug (rule 13).
    // SCALE §7.303 — the walk's own party ids, interned once per company: every settled leg
    // used to re-probe two string maps (partyId x2) per post, ~40k+ legs a week.
    const selfPartyId = partyId({ kind: 'COMPANY', ticker });
    const post = (label: string, amountUSD: number, counterparty?: PartyRef, settle = true) => {
      if (!isFinite(amountUSD) || amountUSD === 0) return;
      // SCALE §7.303 — the drill-down rows are display retention with NO consumer anywhere in
      // the tree (grepped: written, never read). ~40 objects x 2,492 firms x 52 weeks of pure
      // GC food; kept only under CASH_LEDGER=1 for debugging.
      if (retainCashLedger) cashLedger.push({ label, amountUSD: Math.round(amountUSD) });
      cash.usd += amountUSD;
      // BYPASS_TRACE=1 — the settle:false legs are cash the walk moves while claiming the money
      // moves elsewhere; any label whose elsewhere-leg does not actually debit/credit this
      // company is the 02b reconcile's corporate class, attributed here by name.
      if (!settle && process.env.BYPASS_TRACE === '1') {
        const key = `${region}:${label}`;
        bypassTraceByLabel.set(key, (bypassTraceByLabel.get(key) ?? 0) + amountUSD);
      }
      // `settle: false` = the line is REPORTED here but the money moves elsewhere, itemised. A
      // dividend is the case: the issuer owes the register, and the register pays each holder by
      // name — so the payment instructions come from the settlement of that register, and posting
      // one here as well would move the same money twice.
      if (!settle) return;
      // §5-CLOSE: a settled leg with no counterparty is a defect at the site that posted it.
      const otherId = counterparty ? partyId(counterparty) : defect(`stage 08 posted '${label}' for ${ticker} (${(amountUSD / 1e6).toFixed(3)}M) with no counterparty`);
      const reasonId = internReason(label);
      if (amountUSD > 0) payByIds(ctx, otherId, selfPartyId, amountUSD, reasonId);
      else payByIds(ctx, selfPartyId, otherId, -amountUSD, reasonId);
    };
  return { post, cash, cashLedger };
}

/**
 * §7.317 — THE CASH WALK AS ONE PURE-CALL UNIT (draw-free). Every payment leg, holder accrual
 * and tax-map write happens inside, in exactly the order the inline block emitted them — the
 * caller invokes it at the same sequence point, so the journal is untouched. The §7.316
 * contended resource (the money-fund redemption) is NOT here: it stays in the closure, in firm
 * order, until it moves to the combine.
 */
function runCashWalk(args: {
  ctx: WeeklyStepContext;
  // §7.317 step 1.4 — the walk reads NO company object: identity strings and the few
  // object-derived scalars arrive resolved (from the seam lanes at the call site).
  companyId: string;
  ticker: string;
  region: string;
  isBanksSector: boolean;
  homeBankTicker: string | undefined;
  carrierFreightRevenueUSD: number;
  channelMarginRevenueUSD: number;
  declaredDividendYield: number;
  marketCapUSD: number;
  maxPayoutRatio: number;
  hasVehicle: boolean;
  boundaryTraceKey: string;
  wuSalesUSD: number;
  wuPurchasesUSD: number;
  wuTradeReceivableBookedUSD: number;
  wuTradeReceivableCollectedUSD: number;
  wuTradePayableBookedUSD: number;
  wuTradePayableSettledUSD: number;
  wuCapexPurchasesUSD: number;
  newNetIncome: number;
  weeklyPayrollUSD: number;
  newRevenue: number;
  newEbitda: number;
  carryingCostUSD: number;
  weeklyInterest: number;
  facilityInterestWeeklyUSD: number;
  marketBondAccrualUSD: number;
  marketLoanAccrualUSD: number;
  commercialPaperAccrualUSD: number;
  bondCouponDue: boolean;
  loanCouponDue: boolean;
  cpCouponDue: boolean;
  taxPaidAnnualRateUSD: number;
  accruedTaxUSD: number;
  currentWeekMod13: number;
  weeklyDebtFundedPortion: number;
  bankCredit: PartyRef | undefined;
  post: (label: string, amountUSD: number, counterparty?: PartyRef, settle?: boolean) => void;
  /** §7.325 — this firm's row and the capture columns for the walk's two tax writes. */
  row: number;
  taxCapture?: { accrueUSD: Float64Array; collectUSD: Float64Array };
}): { accruedTaxUSD: number } {
  const { ctx, companyId, ticker, region, isBanksSector, homeBankTicker,
    carrierFreightRevenueUSD, channelMarginRevenueUSD, declaredDividendYield, marketCapUSD,
    maxPayoutRatio, hasVehicle, boundaryTraceKey,
    wuSalesUSD, wuPurchasesUSD, wuTradeReceivableBookedUSD, wuTradeReceivableCollectedUSD,
    wuTradePayableBookedUSD, wuTradePayableSettledUSD, wuCapexPurchasesUSD,
    newNetIncome, weeklyPayrollUSD,
    newRevenue, newEbitda, carryingCostUSD, weeklyInterest, facilityInterestWeeklyUSD,
    marketBondAccrualUSD, marketLoanAccrualUSD, commercialPaperAccrualUSD,
    bondCouponDue, loanCouponDue, cpCouponDue, taxPaidAnnualRateUSD,
    currentWeekMod13, weeklyDebtFundedPortion, bankCredit, post, row, taxCapture } = args;
  let { accruedTaxUSD } = args;
    // ---- S5: the weekly cash walk is an explicit ledger ----
    // One posting helper is the single write path to cash; every entry is a named real flow.
    // The previous walk triple-counted the operating side: an EBITDA/52 accrual PLUS stage 05's
    // real settled cashChange PLUS a separate productionCost subtraction — three overlapping
    // descriptions of one week's operations. Here each real dollar enters exactly once:
    // settled auction flows at their real amounts, and accruals ONLY for the parts of the
    // business the auction does not settle (non-auction receipts; wages and other unsettled
    // costs; capex beyond what was bought as real units). EBITDA is a reporting figure.

      if (isBanksSector) {
      // A bank's real flows live on its named balance sheet (02b); the company-level cash line
      // carries only the accrual bridge. REPORTED, never settled: every line of a bank's P&L is
      // already booked against `bankEquityUSD` in the sector ledger (macro/banking.ts — interest
      // earned and paid, repo interest, wholesale and deposit funding, dividends), so settling
      // this bridge as well credited the same income to the same equity twice, out of a boundary
      // that does not exist. Two independent quantities for one balance is rule 3.
      post('bank net income accrual', newNetIncome / 52, undefined, false);
      // IND-R1: and its staff. A bank paying wages settles like any other payer — reserves out,
      // households' deposits in — and because a bank's payment is on its OWN account the other
      // leg is its equity, which is where a real bank's wage bill lands.
      post('wages paid to households', -weeklyPayrollUSD, { kind: 'HOUSEHOLD', region: region as Company['region'] });
      // §5-CLOSE F2: and the employer's payroll tax on it, remitted to the treasury as a payment.
      {
        const payrollTaxUSD = weeklyPayrollUSD * EMPLOYER_PAYROLL_TAX_RATE;
        post('employer payroll tax', -payrollTaxUSD, { kind: 'GOVERNMENT', region: region as Company['region'] });
        ctx.payrollTaxByRegion[region] = (ctx.payrollTaxByRegion[region] ?? 0) + payrollTaxUSD;
      }
    } else {
      // XB3a-2: a CARRIER sells no units into the goods auction, so its `salesUSD` is zero — but
      // its freight is settled, by name, by the buyers who shipped with it (stage 05). Counting
      // it here is what keeps the whole of its revenue out of `non-auction operating receipts`,
      // which would otherwise pay it a second time out of the boundary.
      // IND16: and a DISTRIBUTOR's channel margin, on the same reasoning — it sells no units into
      // the household's book, it is paid inside the shelf price by the households that bought out
      // of its stock (stage 05). Counting it here is what keeps it out of the boundary line,
      // which would otherwise pay the sector a second time.
      const settledSalesUSD = wuSalesUSD
        + carrierFreightRevenueUSD
        + channelMarginRevenueUSD;
      const settledPurchasesUSD = wuPurchasesUSD;
      post('settled sales (real auction receipts)', settledSalesUSD, undefined, false);
      post('settled purchases (real auction: inputs + capex)', -settledPurchasesUSD, undefined, false);
      // XB3a-5: a cross-border sale is delivered and INVOICED, not collected. Revenue is
      // recognised in full at delivery above; the cash is backed out here and posted when the
      // invoice falls due, at whatever the invoice currency is then worth. The gap between the
      // two is the transaction FX exposure, and it lands as real cash rather than a statistic.
      // IND12/CASH: all four are REPORTED here and settled elsewhere, by name. The credit a
      // seller extends moves seller -> buyer in stage 05; the collection moves buyer -> seller in
      // trade-settlement. Posting them here as well would move the same money twice — and
      // posting them against UNMODELED, as they were, moved it to nobody.
      post('sales invoiced, not yet collected', -wuTradeReceivableBookedUSD, undefined, false);
      post('trade invoices collected', wuTradeReceivableCollectedUSD, undefined, false);
      post('purchases invoiced, not yet paid', wuTradePayableBookedUSD, undefined, false);
      post('trade invoices paid', -wuTradePayableSettledUSD, undefined, false);
      // §7.285 — THE BOUNDARY PAIR IS CLOSED, two different ways for two different carriers.
      //
      // BOUNDARY_TRACE decomposed the 4.8B/week 'non-auction operating receipts' line: ~60% was
      // the four INSURERS' shells collecting their premium revenue from the boundary while the
      // insurance stage had already paid the same premiums to their entities as real legs — the
      // same dollar arriving twice, and a GROWTH LOOP besides (premium capacity = surplus x
      // ratio, and the double-collected cash fed the surplus: the USA insurer's line grew 988M
      // -> 1,532M in three weeks). The asset-manager shells were the same shape with no real leg
      // anywhere (fee revenue whose payer is the conflated vehicle, §7.284's finding).
      //
      // (1) A shell BACKED BY A REAL ENTITY settles its operating result against that entity —
      // the vehicle's book, which is where the real premiums/fees/income land. This is §7.284's
      // step 3 executed on the conflated object: the two party kinds (INSTITUTION vs COMPANY)
      // are two ledger accounts even while the ids are one. The entity nets to ~zero on an
      // insurer (premiums through, claims reimbursed); on a manager it pays the fee out of the
      // managed assets, which is what a real fund does.
      //
      // (2) An OPERATING firm's residual gap is the ACCRUAL LAG (the revenue EMA above/below
      // this week's settled sales), and `max(0, ...)` kept only the positive side — so the
      // boundary structurally PAID declining firms and charged nobody. The lag is a reporting
      // statement, not a flow: nobody owes it, so no cash moves for it at all. Cash binds to
      // what actually settled — the sales anchor, finally binding (§539's expectation applies:
      // prints may get uglier and that is the honest direction, §1.20).
      const nonAuctionReceiptsUSD = Math.max(0, newRevenue / 52 - settledSalesUSD);
      if (process.env.BOUNDARY_TRACE === '1' && nonAuctionReceiptsUSD > 1e6) {
        boundaryTraceByFirm.set(boundaryTraceKey, (boundaryTraceByFirm.get(boundaryTraceKey) ?? 0) + nonAuctionReceiptsUSD);
      }
      if (hasVehicle) {
        post('operating receipts drawn from the vehicle', nonAuctionReceiptsUSD, { kind: 'INSTITUTION', id: companyId });
      }
      // ...and the costs of running the whole business beyond what was bought as real units:
      // wages, services, and the unsettled share of capex. Settled purchases already left as
      // real cash above, so only the excess of total accrued outflows over them posts here.
      // IND1: capex left as REAL CASH in `settled purchases` above, so accruing it again here
      // paid for the same machine twice. What accrues is the operating side, and it nets only
      // against the operating share of what really settled.
      const accruedOutflowsWeekly = (newRevenue - newEbitda) / 52;
      const capexSettledUSD = wuCapexPurchasesUSD;
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
      post('wages paid to households', -wagesPaidUSD, { kind: 'HOUSEHOLD', region: region as Company['region'] });
      // §5-CLOSE F2: THE EMPLOYER'S PAYROLL TAX IS A PAYMENT. The treasury used to accrue it from
      // the macro wage bill and credit itself at month end with money no employer had paid — the
      // last "revenue from nobody" (F2: JPN 4.2B reported against 3.0B remitted, every month-end
      // week). Every employer remits it on its own wage bill, weekly.
      {
        const payrollTaxUSD = wagesPaidUSD * EMPLOYER_PAYROLL_TAX_RATE;
        post('employer payroll tax', -payrollTaxUSD, { kind: 'GOVERNMENT', region: region as Company['region'] });
        ctx.payrollTaxByRegion[region] = (ctx.payrollTaxByRegion[region] ?? 0) + payrollTaxUSD;
      }
      // SVC: services are a real market now — professional, facilities and repair sub-units sit
      // in the registry, this firm's recipe includes them, and it BIDS for them in stage 05
      // against real sellers like any other input. What remains on this line is the operating
      // cost that is neither wages nor a purchase the auction covers.
      //
      // The supplier used to be picked here, by a size-weighted hash over the SME pools. That was
      // an allocation standing in for a purchasing decision — the thing rule 13 forbids — and it
      // is deleted rather than tuned.
      // §7.285 (2), the cost half of the same pair — closed WITH the receipts half, as the
      // frontier's own doc demanded (both are accruals; removing one side alone makes every
      // firm bleed). An entity-backed shell's extra costs (an insurer's claims — which its
      // entity pays as real legs) are reimbursed to the vehicle; an operating firm's accrual
      // remainder moves no cash, exactly like its receipts twin.
      const opexBeyondWagesUSD = Math.max(0, opexOutflowUSD - wagesPaidUSD);
      if (hasVehicle) {
        post('operating costs borne by the vehicle', -opexBeyondWagesUSD, { kind: 'INSTITUTION', id: companyId });
      }
      // IND16: WAREHOUSING HAS A SELLER NOW. This was a declared boundary frontier — "warehousing,
      // unmodelled seller" — because nothing in the model held goods for anybody. The distribution
      // tier is that sector: the same firms that run the household channel hold a firm's stock for
      // it, and they are paid for it by name. What is left on the boundary is only a region with
      // no distribution firm at all, which is a fact about that region rather than a gap.
      if (carryingCostUSD > 0) {
        const holders = ctx.channelShareByRegion[region];
        let paidUSD = 0;
        holders?.forEach((share, holderTicker) => {
          if (holderTicker === ticker) return; // a distributor warehouses its own stock
          const amountUSD = carryingCostUSD * share;
          if (!(amountUSD > 0)) return;
          paidUSD += amountUSD;
          post('inventory carrying cost', -amountUSD, { kind: 'COMPANY', ticker: holderTicker });
        });
        // §5-CLOSE: stock nobody else warehouses is warehoused by the firm itself, at its own
        // cost already inside its operating expense — no payment leaves, and nothing is paid to
        // nobody. (The residual is a distributor's own share and rounding.)
        void paidUSD;
      }
      // SETL4: reported here, paid itemised below — the house bank for its facilities, the
      // register for market paper. One aggregate line on the cash walk, three real payees.
      post('interest paid', -weeklyInterest, undefined, false);
      if (facilityInterestWeeklyUSD > 0 && homeBankTicker) {
        pay(ctx, {
          payer: { kind: 'COMPANY', ticker },
          payee: { kind: 'BANK', ticker: homeBankTicker },
          amountUSD: facilityInterestWeeklyUSD,
          reason: 'facility interest to the lending bank',
        });
      }
      // CAL: accrue to whoever holds it this week; pay it out on the coupon date. The cash that
      // leaves on that date IS the sum of the accruals, so the issuer's ledger and the holders'
      // receivables clear against each other exactly.
      accrueHoldersInterest(ctx, companyId, 'CORP_BOND', marketBondAccrualUSD);
      accrueHoldersInterest(ctx, companyId, 'LEVERAGED_LOAN', marketLoanAccrualUSD);
      accrueHoldersInterest(ctx, companyId, 'COMMERCIAL_PAPER', commercialPaperAccrualUSD);
      if (bondCouponDue) payHoldersAccruedInterest(ctx, companyId, 'CORP_BOND');
      if (loanCouponDue) payHoldersAccruedInterest(ctx, companyId, 'LEVERAGED_LOAN');
      if (cpCouponDue) payHoldersAccruedInterest(ctx, companyId, 'COMMERCIAL_PAPER');
      // PUB1b: tax ACCRUES weekly and is REMITTED quarterly, as real firms pay it. The money
      // now arrives somewhere — the treasury's account — instead of leaving the model.
      // §5-TAXR — the accrual IS the statement's tax line (rule 14: the P&L and the payment are
      // one number). The `max(0, EBIT − interest) × rate` recomputation this replaces was the
      // old gate surviving in the cash walk: carryforwards and the accelerated schedule now
      // reach the dollars the treasury actually receives, which is the whole point of them.
      const weeklyAccrualUSD = taxPaidAnnualRateUSD / 52;
      accruedTaxUSD += weeklyAccrualUSD;
      ctx.taxAccruedByRegion[region] = (ctx.taxAccruedByRegion[region] ?? 0) + weeklyAccrualUSD;
      if (taxCapture) taxCapture.accrueUSD[row] = weeklyAccrualUSD;
      // currentWeekMod13 runs 1..13, never 0 — the quarter ends on 13.
      if (currentWeekMod13 === 13 && accruedTaxUSD > 0) {
        post('cash taxes (quarterly remittance)', -accruedTaxUSD, { kind: 'GOVERNMENT', region: region as Company['region'] });
        ctx.taxCollectedByRegion[region] = (ctx.taxCollectedByRegion[region] ?? 0) + accruedTaxUSD;
        if (taxCapture) taxCapture.collectUSD[row] = accruedTaxUSD;
        accruedTaxUSD = 0;
      }
      // Dividends actually leave (they were declared and never deducted — the plan's leak #2).
      // Sized by the board's REAL constraint — earnings — not by yield x market cap: the equity
      // level is a known-inflated formula until WS4, and paying a real 2-3% yield on a fake 30B
      // cap bled 10x a real dividend out of every profitable company (measured in this ledger's
      // first week of existence: 15-25M/wk against 20M/wk of sales). A board pays out a share of
      // what the company earns; the declared yield stands only when earnings cover it.
      // §5-STRUCT step 2 — the payout rule lives on the firm (domain/company-week/distributions.ts).
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
      const dividend = dividendDecision({
        declaredYield: declaredDividendYield,
        marketCapUSD,
        netIncomeUSD: newNetIncome,
        maxPayoutRatio,
        weekOfQuarter: currentWeekMod13,
        weeksInQuarter: 13,
      });
      const dividendWeeklyUSD = dividend.cashThisWeekUSD;
      post('dividends paid', -dividendWeeklyUSD, undefined, false);
      payHoldersCash(ctx, companyId, 'EQUITY', dividendWeeklyUSD);
      post('maintenance funding draw (new tranche proceeds)', weeklyDebtFundedPortion, bankCredit);
    }
  return { accruedTaxUSD };
}

/** §7.325 W1 — core-A's comp writes, returned as data by the capital core and applied here.
 *  Serial/barrier callers apply them inside A (the original write points); a worker A defers
 *  them, and the main thread applies each firm's writes in row order before the redemptions. */
export function applyCapCompWrites(comp: Company, cap: ReturnType<typeof runCapitalBlock>, L: BackLanes, row: number): void {
  if (cap.learningWrites) {
    comp.cumulativeOutputUnits = cap.learningWrites.cumulativeUnits;
    comp.learningMultiplier = cap.learningWrites.multiplier;
    comp.lastLearningGrowthAnnual = cap.learningWrites.growthAnnual;
  } else if (Number.isNaN(L.cumulativeOutputUnits[row])
      && (L.plantCapacityUnitsThisWeek[row] > 0 || L.producedUnitsThisWeek[row] > 0)) {
    // unreachable by construction (seeding always flows into the learned branch); stated so
    // a future edit that breaks the all-or-none rule fails loudly here.
    throw new Error('capital core: seeding without learning writes');
  }
  comp.idleStreakWeeks = cap.retirementWrites.idleStreakWeeks;
  comp.mothballedPpeShare = cap.retirementWrites.mothballedPpeShare;
  comp.mothballedStreakWeeks = cap.retirementWrites.mothballedStreakWeeks;
  if (cap.scrapWrites) {
    comp.grossPPEUSD = cap.scrapWrites.grossPPEUSD;
    comp.accumulatedDepreciationUSD = cap.scrapWrites.accumulatedDepreciationUSD;
  }
}

/** §7.325 W2 — the firm's credit-event channel, one closure shape shared by A and by the
 *  worker-result rebuild (a worker's own recordCredit captures into its shard instead). */
export function makeRecordCredit(row: number, L8: BackLanes, ctx: WeeklyStepContext, nextWeek: number) {
  return (trancheId: string, principalUSD: number, marginBps: number, termWeeks: number, retire: boolean) => {
    if (!L8.homeBankTicker[row] || !(principalUSD > 0)) return;
    ctx.creditEventsThisWeek.push({
      bankTicker: L8.homeBankTicker[row]!, companyId: L8.companyId[row], trancheId,
      principalUSD, marginBps, originationWeek: nextWeek, termWeeks, retire,
    });
  };
}

/** §7.325 W2 — the fields a worker STRIPS from its A result before postMessage (functions,
 *  the mutable cash box, and the F/benchmark pass-throughs the main thread re-attaches from
 *  its own structures), shipped instead as `cashAfterAUSD` plus the numeric/cloneable rest. */
export type ShippedBackCoreA = Omit<ReturnType<typeof runBackCoreA>,
  'post' | 'recordCredit' | 'cash' | 'cashLedger' | 'sec' | 'costDriversUSD'
  | 'newOutputInventoryBySubUnit' | 'updatedProductLines' | 'stillUnderConstruction'
  | 'newRecurringBaseUSD'> & { cashAfterAUSD: number };

/** Rebuild the full A crossing from a worker's shipped form: fresh poster continuing the
 *  worker's cash walk at its exact final value, closures re-bound to the REAL ctx, and the
 *  pass-throughs re-attached from main's own F and benchmark tables. */
export function rebuildBackCoreA(shipped: ShippedBackCoreA, row: number, d: BackKernelDeps): ReturnType<typeof runBackCoreA> {
  const L8 = d.backLanes;
  const { post, cash, cashLedger } = makeCashPoster(L8.ticker[row], L8.region[row], shipped.cashAfterAUSD, d.ctx, false);
  // In place, not a spread: the shipped object is already this firm's own fresh clone, and a
  // second ~50-field materialization per firm measured as the pool's single largest overhead.
  const a = shipped as unknown as ReturnType<typeof runBackCoreA> & { cashAfterAUSD?: number };
  a.cashAfterAUSD = undefined; // not `delete` — dictionary-mode conversion taxes every later read
  a.post = post; a.cash = cash; a.cashLedger = cashLedger;
  a.recordCredit = makeRecordCredit(row, L8, d.ctx, d.nextWeek);
  a.sec = SECTOR_BENCHMARKS[L8.sector[row]];
  a.costDriversUSD = d.F.costDrivers[row];
  a.newOutputInventoryBySubUnit = d.F.outputInv[row];
  a.updatedProductLines = d.F.updatedProductLines[row];
  a.stillUnderConstruction = d.F.stillUnderConstruction[row];
  a.newRecurringBaseUSD = d.F.newRecurringBaseUSD[row];
  return a;
}

/** §7.325 W1 — `comp: null` is the WORKER form: the profile branch (main-side by §7.318 D)
 *  must not be reached, and the capital block's comp writes are deferred to the caller via
 *  `applyCapCompWrites`. Every other read in A is lanes/F only. */
export function runBackCoreA(comp: Company | null, row: number, d: BackKernelDeps) {
  // §7.325 W2 — A's dep surface, kept to what its body actually touches: `state` and
  // `entityById` feed only the profile branch (main-side), so a worker's deps may stub them.
  const { state, ctx, F, nextWeek, currentWeekMod13, updatedRegions, entityById, retainCashLedger } = d;
    const __k0 = S08K_PROF ? performance.now() : 0;
    const L8 = d.backLanes;
    /**
     * Earnings PER SHARE, for a company that has shares. A private firm's register is empty until
     * it lists (HC7's `postIssueSharesOutstanding` creates it), so there is nothing to divide by
     * and the honest answer is zero — not a figure produced by dividing into a fabricated share
     * count that the generator used to hand every private firm.
     */
    const perShare = (amountUSD: number): number =>
      L8.sharesOutstanding[row] > 0 ? round2(amountUSD / L8.sharesOutstanding[row]) : 0;

    const reg = updatedRegions[L8.region[row]];
    // ENGINE V2 — THE FRONT HALF OF THIS KERNEL LIVES IN src/engine2/stage08-front.ts NOW:
    // payroll (IND-R1/IND-R6), the ladder interest walk, the tax attributes, carrying cost,
    // FIFO consumption, the product-line evolution, revenue recognition and the industrial
    // P&L, run for every firm before this loop started. `F` carries the outputs by row.
    const weeklyPayrollUSD = F.weeklyPayrollUSD[row];

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

    const sec = SECTOR_BENCHMARKS[L8.sector[row]];

    // SETL2b: drawing a bank facility is not a payment FROM anyone — the bank writes the loan and
    // the borrower's balance appears against it, in the same statement (settlement.ts). Naming
    // the house bank's CREDIT is what tells settlement no reserve should move.
    const bankCredit: PartyRef | undefined = L8.homeBankTicker[row]
      ? { kind: 'BANK_CREDIT', ticker: L8.homeBankTicker[row] }
      : undefined;
    const recordCredit = makeRecordCredit(row, L8, ctx, nextWeek);


    // SCALE §7.303 — ONE PASS OVER THE LADDER, now made in the front pass (same walk, same
    // array order, same floats).
    const annualInterest = F.annualInterest[row];
    const facilityInterestWeeklyUSD = F.facilityInterestWeeklyUSD[row];
    const marketBondAccrualUSD = F.marketBondAccrualUSD[row];
    const commercialPaperAccrualUSD = F.commercialPaperAccrualUSD[row];
    const marketLoanAccrualUSD = F.marketLoanAccrualUSD[row];
    const bondCouponDue = (F.couponDue[row] & DUE_BOND) !== 0;
    const cpCouponDue = (F.couponDue[row] & DUE_CP) !== 0;
    const loanCouponDue = (F.couponDue[row] & DUE_LOAN) !== 0;
    const weeklyInterest = annualInterest / 52;
    // SETL4: interest goes to whoever actually lent — a bank FACILITY to the house bank, market
    // paper to the REGISTER (which knows who holds it); CAL — interest ACCRUES weekly and cash
    // moves on the instrument's own dates (a bond's half-year on its coupon date, a floater's
    // quarter on its reset, CP nothing until maturity); CP has its own book and holders (07b's
    // float excludes it). All computed in the single ladder pass above.
    const effectiveDebtRate = F.effectiveDebtRate[row];
    // TAXR — THE CORPORATE RATE HAS AN OWNER NOW, AND IT IS THE ONE POLICY SETS.
    //
    // This was a bare `0.21` literal, and the model had THREE tax rates with no owner between
    // them: this one governed corporate NET INCOME, `region.effectiveTaxRate` (which the fiscal
    // stance drifts weekly, seeded at 0.31) governed the corporate tax ACCRUAL forty lines below
    // and the SME pools' in stage 11, and `HOUSEHOLD_EFFECTIVE_TAX_RATE` governed households. So
    // a firm reported its earnings after 21% tax and remitted cash at 31% — the P&L and the
    // payment disagreed about the same liability (rule 14) — and the government's own tax policy
    // could not touch corporate taxation at all however hard it pulled its one lever (rule 13).
    //
    // One rate, from the region that sets it. It is the same number the accrual, the SME pools
    // and the WACC already use, so the four of them stop being four opinions.
    const taxRate = reg.effectiveTaxRate;

    // §5-TAXR — the tax attributes were gathered on the week's opening stocks by the front
    // pass (the commissioning read happens there, ONCE); the PP&E roll-forward below reuses
    // the commissioned figure instead of reading the queue twice.
    const capexCommissionedThisWeekUSD = F.capexCommissionedUSD[row];
    const stillUnderConstruction = F.stillUnderConstruction[row];
    /** The statement's own tax line, year-rate — the weekly cash accrual below remits exactly
     *  this (rule 14: the P&L and the payment are one number). */
    let taxPaidAnnualRateUSD = F.taxPaidAnnualRateUSD[row];

    const updatedProductLines = F.updatedProductLines[row];
    let newRevenue = F.newRevenue[row];
    // §7.246 — persisted for stage 05's floor decomposition; stays 0 on the profile path, whose
    // firms offer no goods (IND-R2), so the floor's fallback basis serves them unchanged.
    const measuredInputConsumptionWeeklyUSD = F.measuredInputConsumptionWeeklyUSD[row];
    let newEbitda = F.newEbitda[row];
    let newEbit = F.newEbit[row];
    let newNetIncome = F.newNetIncome[row];
    let newEps = F.newEps[row];
    const newInputSupplyConstraintFactor = F.newInputSupplyConstraintFactor[row];
    const newRecentFulfillmentEMA = F.newRecentFulfillmentEMA[row];
    /** IND2 — the contracted base a subscription seller carries into next week. */
    const newRecurringBaseUSD = F.newRecurringBaseUSD[row];
    const targetProductionUSD = F.targetProductionUSD[row];
    const costDriversUSD: CogsCostDrivers | undefined = F.costDrivers[row];
    // IND1: what it costs to hold a good is a property of THE GOOD, not of the firm — warehouse
    // space per tonne divided by its value density, plus its own spoilage. The company-level
    // `inventoryCarryingCostRate` it replaces was one flat 0.02 charging a fab and a dairy alike
    // (rule 3: one representation, and it belongs on the thing being held).
    // §5-STRUCT step 2 — the warehouse charge lives on the firm's stocks
    // (domain/company-week/inventory.ts). It is REPORTED here and settled below, because the
    // charge has a payee (IND16: the distribution sector) and the stock does not.
    const carryingCostUSD = F.carryingCostUSD[row];
    const newOutputInventoryBySubUnit = F.outputInv[row];

    let accruedTaxUSD = Number.isNaN(L8.accruedTaxLiabilityUSD[row]) ? 0 : L8.accruedTaxLiabilityUSD[row];
    const newExecutionQuality = F.newExecutionQuality[row];

    // BP1c (rule 17): a stage does not switch on a kind — it keys the kind once and calls the
    // profile. The four financial statement paths live in stages/profiles/. The OPERATING path
    // is the front pass's now; only the profile dispatch still runs here, until profiles/ ports.
    if (F.isProfile[row] === 1) {
      if (!comp) throw new Error('runBackCoreA: a profile firm runs main-side with its object (§7.318 D)');
      const profileKey = profileKeyOf(comp);
      const profileModule = PROFILE_REGISTRY[profileKey]!;
      // §5-TAXR — the same opening-stock attributes the front pass derives; a profile firm's
      // tax fields are untouched by the pass, so this rebuild reads the same values.
      const openingGrossPpeUSD = Number.isNaN(L8.grossPPEUSD[row]) ? L8.ppeDefaultUSD[row] : L8.grossPPEUSD[row];
      const openingNetPpeUSD = Math.max(0,
        openingGrossPpeUSD - (Number.isNaN(L8.accumulatedDepreciationUSD[row]) ? openingGrossPpeUSD * 0.45 : L8.accumulatedDepreciationUSD[row]));
      const taxAttrs = {
        taxBasisPpeUSD: comp.taxBasisPpeUSD ?? openingNetPpeUSD,
        usefulLifeYears: SECTOR_PPE_USEFUL_LIFE_YEARS[L8.sector[row]] ?? 12,
        capexDeliveredAnnualUSD: capexCommissionedThisWeekUSD * 52,
        carryforwardUSD: comp.taxLossCarryforwardUSD ?? 0,
        bookNetPpeUSD: openingNetPpeUSD,
      };
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
        weeklyPayrollUSD, inputCostAnnualUSD: L8.annualRevenueUSD[row] * profileInputRate });
      newRevenue = pnl.newRevenue;
      const profileInputCostUSD = newRevenue * profileInputRate;
      // §5-STRUCT step 2 — the statement lives on the firm (domain/company-week/income-statement.ts).
      const profilePnl = profileIncome({
        revenueUSD: newRevenue,
        otherIncomeAnnualUSD: pnl.otherIncomeAnnualUSD ?? 0,
        inputCostAnnualUSD: profileInputCostUSD,
        payrollAnnualUSD: weeklyPayrollUSD * 52,
        profileCostsAnnualUSD: pnl.profileCostsAnnualUSD,
        grossPPEUSD: Number.isNaN(L8.grossPPEUSD[row]) ? 0 : L8.grossPPEUSD[row],
        ppeDepreciationYears: 20,
        annualInterestUSD: annualInterest,
        taxRate,
        sharesOutstanding: L8.sharesOutstanding[row],
        tax: taxAttrs,
      });
      newEbitda = profilePnl.ebitdaUSD;
      newEbit = profilePnl.ebitUSD;
      newNetIncome = profilePnl.netIncomeUSD;
      newEps = perShare(newNetIncome);
      // §5-TAXR — the statement rolled the attributes one week; the firm carries them.
      taxPaidAnnualRateUSD = profilePnl.taxPaidAnnualUSD;
      comp.taxLossCarryforwardUSD = profilePnl.taxLossCarryforwardUSD;
      comp.taxBasisPpeUSD = profilePnl.taxBasisPpeUSD;
      comp.deferredTaxLiabilityUSD = profilePnl.deferredTaxLiabilityUSD;
    }

    // §7.317 — the capital CORE runs on the seam lanes (steps 1.1-1.3); its comp writes come
    // back as data and are applied here, at the block's original write points, and the
    // maintenance credit event is emitted at its original sequence point.
    const cap = runCapitalBlock(row, d.backLanes, {
      newEbitda, newRevenue, weeklyInterest,
      effectiveDebtRate, newExecutionQuality, capexCommissionedThisWeekUSD, nextWeek,
      priorOccupationMixDrift: L8.occupationMixDrift[row],
      homeBankTicker: L8.homeBankTicker[row],
    });
    if (comp) applyCapCompWrites(comp, cap, L8, row);
    const newMaintenanceCapex = cap.maintenanceCapexUSD;
    const newMaintenanceShortfallStreak = cap.maintenanceShortfallStreak;
    const weeklyDebtFundedPortion = cap.debtFundedMaintenanceUSD;
    const maintenanceFundingTranches = cap.maintenanceFundingTranches;
    if (maintenanceFundingTranches.length > 0) {
      recordCredit(maintenanceFundingTranches[0].id, weeklyDebtFundedPortion,
        maintenanceFundingTranches[0].floatingMarginBps ?? 0, STANDARD_CORP_TENOR_YEARS * 52, false);
    }
    const newGrowthCapex = cap.growthCapexUSD;
    const newRndExpense = cap.rndExpenseUSD;
    const newOccupationMixDrift = cap.occupationMixDrift;
    const newCapex = cap.capexUSD;
    const newGrossPPEUSD = cap.grossPPEUSD;
    const newAccumulatedDepreciationUSD = cap.accumulatedDepreciationUSD;
    const weeklyDepreciation = cap.weeklyDepreciationUSD;
    const programme = { payoutPressure: cap.payoutPressure };

    const __k1 = S08K_PROF ? performance.now() : 0;
    if (S08K_PROF) s08k.capital += __k1 - __k0;
    const { post, cash, cashLedger } = makeCashPoster(L8.ticker[row], L8.region[row], L8.cashUSD[row], ctx, retainCashLedger);
    const __cw = runCashWalk({
      ctx,
      companyId: L8.companyId[row],
      ticker: d.backLanes.ticker[row],
      region: d.backLanes.region[row],
      isBanksSector: d.backLanes.isBanksSector[row] === 1,
      homeBankTicker: L8.homeBankTicker[row],
      carrierFreightRevenueUSD: L8.carrierFreightRevenueUSD[row],
      channelMarginRevenueUSD: L8.channelMarginRevenueUSD[row],
      declaredDividendYield: L8.dividendYield[row] ?? 0,
      marketCapUSD: d.backLanes.marketCapUSD[row],
      // §5-BRAINS — an impatient board pays out more of what it earns; the median pays the
      // industry's discipline exactly.
      maxPayoutRatio: Math.min(1, L8.maxPayoutRatio[row] * (PATIENCE_MEDIAN_WEEKS / L8.mgmtPatienceWeeks[row])),
      hasVehicle: L8.hasVehicle[row] === 1,
      boundaryTraceKey: L8.boundaryTraceKey[row],
      wuSalesUSD: L8.wuSalesUSD[row],
      wuPurchasesUSD: L8.wuPurchasesUSD[row],
      wuTradeReceivableBookedUSD: L8.wuTradeReceivableBookedUSD[row],
      wuTradeReceivableCollectedUSD: L8.wuTradeReceivableCollectedUSD[row],
      wuTradePayableBookedUSD: L8.wuTradePayableBookedUSD[row],
      wuTradePayableSettledUSD: L8.wuTradePayableSettledUSD[row],
      wuCapexPurchasesUSD: L8.wuCapexPurchasesUSD[row],
      newNetIncome, weeklyPayrollUSD,
      newRevenue, newEbitda, carryingCostUSD, weeklyInterest, facilityInterestWeeklyUSD,
      marketBondAccrualUSD, marketLoanAccrualUSD, commercialPaperAccrualUSD,
      bondCouponDue, loanCouponDue, cpCouponDue, taxPaidAnnualRateUSD,
      accruedTaxUSD, currentWeekMod13, weeklyDebtFundedPortion, bankCredit, post,
      row, taxCapture: d.taxCapture,
    });
    accruedTaxUSD = __cw.accruedTaxUSD;
    const newTotalDebt = L8.totalDebtUSD[row];

    const newBaselineDividendYield = round4(L8.baselineDividendYield[row] * 0.998 + L8.dividendYield[row] * 0.002);
    const targetDivYield = newBaselineDividendYield * (cash.usd < 0 ? 0.4 : (cash.usd > 2 * L8.currentLiabilitiesUSD[row] ? 1.2 : 1.0)) * (1 + programme.payoutPressure * 2.5);
    const newDividendYield = Math.max(0, L8.dividendYield[row] * 0.9 + targetDivYield * 0.1);

    // HH5: headcount is the LABOR MARKET's, not this stage's. The drift multiplier that used
    // to sit here (cash < 0 ? -1.5% : margin/regime nudges) ran every week and silently
    // overwrote the hires and layoffs the matching stage had just settled — two representations
    // of one firm's payroll, and the newer one lost. Measured before the fix: the occupation
    // pools ran 3.9% above the employers' own books by week 43 and drifted further every week.
    // A firm's headcount now changes in exactly one place, and the real cash-distress layoffs
    // that formula was reaching for live there too.
    const newEmployeeCount = Math.max(10, Math.round(
      Number.isNaN(L8.employeeCountUpdate[row]) ? L8.employeeCount[row] : L8.employeeCountUpdate[row]
    ));

    // (S5: the prepayment rule moved below, where the real tranche ladder exists to retire —
    // the old version here debited cash and decremented a scalar the ladder recomputation then
    // silently restored: cash gone, debt not. Leak #3, and likely a real default driver.)

    // Credit metrics
    // §5-STRUCT step 2 — the two ratios a rating is struck on live on the firm's credit standing
    // (domain/company-week/credit-standing.ts), unbounded and for the stated reason: a bound is not
    // a measurement (§1.15), and the clamps these used to carry destroyed the information that a
    // firm has no earnings at all.
    const { leverage: newLeverage, coverage: newCoverage } = creditMetrics({
      isBank: L8.sector[row] === 'Banks',
      totalDebtUSD: newTotalDebt,
      revenueUSD: newRevenue,
      ebitdaUSD: newEbitda,
      ebitUSD: newEbit,
      annualInterestUSD: annualInterest,
      // §7.268: the bank's OWN sheet, not the region average — a solvency rating on the
      // cohort's mean rated every bank the same and none of them on itself.
      bankCapitalRatio: Number.isNaN(L8.bankCapitalRatio[row]) ? reg.bankingSector.bankCapitalRatio : L8.bankCapitalRatio[row],
    });

    // G5 — THE COMMITTED LINE IS DRAWN BEFORE ANYTHING DEFAULTS.
    //
    // The public default rate ran at ~10%/yr against ~1-2% in reality, while the private tier with
    // real ladders showed ZERO — which §5-G5 read, correctly, as the public path's cash accounting
    // rather than a credit story. This is what was missing between a bad week and a default:
    // nothing at all. A real firm draws its revolver, and it defaults when the line is exhausted,
    // which is a different event and a far rarer one.
    //
    // The line is sized by what the firm can service inside its own coverage covenant
    // (`committedLineHeadroomUSD`), so it closes exactly when a lender really would stop lending —
    // and a firm whose earnings cannot carry another dollar of interest gets nothing, which is the
    // case the default trigger is FOR.
    // §7.267 — A TREASURER REDEEMS ITS OWN MONEY-FUND SHARES BEFORE BORROWING A CENT, and long
    // before anything defaults. The sweep/redeem decision ran at the BOTTOM of the walk, gated
    // on `!isDefaulted` — so a firm that swept its surplus one week and hit a bad settlement
    // the next was declared insolvent while holding its own liquid money: the default trigger
    // read cash and never the shares (measured: half the carrier cohort dead at week 2 with
    // 118.8M of swept shares each — the sweep dug the grave and the gate held the shovel).
    // The redemption is the FIRST rung of the liquidity ladder: shares, then the committed
    // line, and default only when both are gone. The full sweep decision at the bottom still
    // runs — by then cash is at or below the buffer, so it cannot double-redeem.
  if (S08K_PROF) s08k.cash += performance.now() - __k1;
  return { accruedTaxUSD, annualInterest, bankCredit, cap, capexCommissionedThisWeekUSD, carryingCostUSD, cash, cashLedger, costDriversUSD, effectiveDebtRate, facilityInterestWeeklyUSD, maintenanceFundingTranches, measuredInputConsumptionWeeklyUSD, newAccumulatedDepreciationUSD, newBaselineDividendYield, newCapex, newCoverage, newDividendYield, newEbit, newEbitda, newEmployeeCount, newEps, newExecutionQuality, newGrossPPEUSD, newGrowthCapex, newInputSupplyConstraintFactor, newLeverage, newMaintenanceCapex, newMaintenanceShortfallStreak, newNetIncome, newOccupationMixDrift, newOutputInventoryBySubUnit, newRecentFulfillmentEMA, newRecurringBaseUSD, newRevenue, newRndExpense, newTotalDebt, post, recordCredit, sec, stillUnderConstruction, targetProductionUSD, taxPaidAnnualRateUSD, updatedProductLines, weeklyDepreciation, weeklyInterest, weeklyPayrollUSD };
}

/** §7.321 the BARRIER: the liquidity redemption against the regional book, first-come in row
 *  order — on main, between core-A and core-B, exactly the order the inline loop had. */
export function runMmfRedemption(comp: Company, row: number, d: BackKernelDeps, a: ReturnType<typeof runBackCoreA>): number {
  const { ctx, mmfSweepBooks } = d;
  const L8 = d.backLanes;
  const { cash, post } = a;
    if (L8.wasMergerAcquired[row] !== 1 && cash.usd < 0 && (comp.mmfSharesUSD ?? 0) > 0) {
      const book = mmfSweepBooks.get(L8.region[row]);
      if (book) {
        const wantedUSD = Math.min(comp.mmfSharesUSD ?? 0, -cash.usd);
        const paidUSD = Math.min(wantedUSD, book.redeemableUSD);
        if (paidUSD > 1) {
          book.netInflowUSD -= paidUSD;
          book.redeemableUSD -= paidUSD;
          comp.mmfSharesUSD = (comp.mmfSharesUSD ?? 0) - paidUSD;
          const shortfallFund = findRegionMmf(ctx.updatedInstitutionalEntities, L8.region[row]);
          post('money fund share redemption: liquidity shortfall', paidUSD,
            shortfallFund ? { kind: 'INSTITUTION', id: shortfallFund.id } : undefined);
          return paidUSD;
        }
      }
    }
  return 0;
}

/** §7.321 core-B: liquidity decision + debt lifecycle + rating (the kernel's one draw).
 *  Parallel-safe after the barrier. */
export function runBackCoreB(comp: Company, row: number, d: BackKernelDeps, a: ReturnType<typeof runBackCoreA>) {
  const {
    state, ctx, v2, F, nextWeek, currentWeekMod13, updatedRegions, companyUpdates, entityById,
    regionMedianRevenueUSD, systemicStressFactorGlobal, retainCashLedger, mmfSweepBooks,
    primarySettlementByIssuerId, pendingOfferingIssuerIds, leadBankFor, enqueueOffering, pushNews,
  } = d;
  const L8 = d.backLanes;
  const reg = updatedRegions[L8.region[row]];
  // §5-WIRES W3: every principal move in this kernel is a wire through the tranche ledger; the
  // kernel reads the sealed store and asks the ledger to move face for this issuer.
  const issuer = { id: L8.companyId[row], ticker: L8.ticker[row], region: L8.region[row] };
  const accruedTaxUSD = a.accruedTaxUSD;
  const annualInterest = a.annualInterest;
  const bankCredit = a.bankCredit;
  const cap = a.cap;
  const capexCommissionedThisWeekUSD = a.capexCommissionedThisWeekUSD;
  const carryingCostUSD = a.carryingCostUSD;
  const cash = a.cash;
  const cashLedger = a.cashLedger;
  const costDriversUSD = a.costDriversUSD;
  const effectiveDebtRate = a.effectiveDebtRate;
  const facilityInterestWeeklyUSD = a.facilityInterestWeeklyUSD;
  const maintenanceFundingTranches = a.maintenanceFundingTranches;
  const measuredInputConsumptionWeeklyUSD = a.measuredInputConsumptionWeeklyUSD;
  const newAccumulatedDepreciationUSD = a.newAccumulatedDepreciationUSD;
  const newBaselineDividendYield = a.newBaselineDividendYield;
  const newCapex = a.newCapex;
  const newCoverage = a.newCoverage;
  const newDividendYield = a.newDividendYield;
  let newEbit = a.newEbit;
  let newEbitda = a.newEbitda;
  const newEmployeeCount = a.newEmployeeCount;
  const newEps = a.newEps;
  const newExecutionQuality = a.newExecutionQuality;
  const newGrossPPEUSD = a.newGrossPPEUSD;
  const newGrowthCapex = a.newGrowthCapex;
  const newInputSupplyConstraintFactor = a.newInputSupplyConstraintFactor;
  const newLeverage = a.newLeverage;
  const newMaintenanceCapex = a.newMaintenanceCapex;
  const newMaintenanceShortfallStreak = a.newMaintenanceShortfallStreak;
  const newNetIncome = a.newNetIncome;
  const newOccupationMixDrift = a.newOccupationMixDrift;
  const newOutputInventoryBySubUnit = a.newOutputInventoryBySubUnit;
  const newRecentFulfillmentEMA = a.newRecentFulfillmentEMA;
  const newRecurringBaseUSD = a.newRecurringBaseUSD;
  let newRevenue = a.newRevenue;
  const newRndExpense = a.newRndExpense;
  let newTotalDebt = a.newTotalDebt;
  const post = a.post;
  const recordCredit = a.recordCredit;
  const sec = a.sec;
  const stillUnderConstruction = a.stillUnderConstruction;
  const targetProductionUSD = a.targetProductionUSD;
  const taxPaidAnnualRateUSD = a.taxPaidAnnualRateUSD;
  const updatedProductLines = a.updatedProductLines;
  const weeklyDepreciation = a.weeklyDepreciation;
  const weeklyInterest = a.weeklyInterest;
  const weeklyPayrollUSD = a.weeklyPayrollUSD;

    // §7.311 WRITER FLIP — the ladder lives on the rows. The kernel works a LOCAL list of row
    // indices (order = ladder order), mutates principals in place, appends via pushLadderRow,
    // and relinks the chain once at write-back. Fold order everywhere = list order = the order
    // the object walk had.
    const TS = v2.tranches;
    const __k2 = S08K_PROF ? performance.now() : 0;
    let rowList = ladderRowsOf(v2, L8.companyId[row]);
    // Economics views are memoized per row — retirementEconomics and the call arithmetic read
    // no principal, so a view struck before a principal mutation stays valid.
    const econViews = new Map<number, DebtTranche>();
    const viewOf = (r: number): DebtTranche => {
      let vv = econViews.get(r);
      if (vv === undefined) { vv = materializeTranche(v2, r); econViews.set(r, vv); }
      return vv;
    };
    let drawnRevolverRow = -1;
    if (L8.wasDefaulted[row] !== 1 && L8.wasMergerAcquired[row] !== 1 && cash.usd < 0) {
      const revolverRateAnnual = reg.policyRate + L8.facilityMarginBps[row] / 10000;
      let alreadyDrawnUSD = 0;
      for (const r of rowList) if (TS.flags[r] & TR_FACILITY) alreadyDrawnUSD += TS.principalUSD[r];
      const headroomUSD = Math.max(0, committedLineHeadroomUSD({
        ebitAnnualUSD: newEbit,
        currentAnnualInterestUSD: annualInterest,
        revolverRateAnnual,
      }) - alreadyDrawnUSD);
      const drawUSD = revolverDrawUSD({
        cashShortfallUSD: -cash.usd, headroomUSD, alreadyDrawnUSD: 0,
      });
      if (drawUSD > 1) {
        const revolver: DebtTranche = {
          id: `${L8.companyId[row]}-REVOLVER-LIQ-${nextWeek}`,
          principalUSD: drawUSD,
          rateType: 'FLOATING',
          floatingMarginBps: L8.facilityMarginBps[row],
          originationWeek: nextWeek,
          maturityWeek: nextWeek + 52,
          seniority: 'SENIOR',
          // G2: a committed line is BANK debt on the house bank's own itemized book.
          isBankFacility: true,
          facilityBankTicker: L8.homeBankTicker[row],
        };
        drawnRevolverRow = issueTranche(v2, issuer, revolver, 'revolver drawn: liquidity shortfall');
        recordCredit(revolver.id, drawUSD, L8.facilityMarginBps[row], 52, false);
        newTotalDebt += drawUSD;
        post('revolver drawn: liquidity shortfall', drawUSD,
          L8.homeBankTicker[row] ? { kind: 'BANK_CREDIT', ticker: L8.homeBankTicker[row] } : undefined);
      }
    }

    // Default trigger: cash exhausted AND coverage below the shared floor (or previously
    // defaulted, provided not merger-acquired). DEFAULT_COVERAGE_FLOOR is the single definition
    // of this trigger — the same object the credit market prices its hazard against
    // (computeAnnualDefaultProbability), so priced risk and realized risk are one model. It is
    // reached now only AFTER the committed line above has been drawn to whatever it will bear.
    const isDefaulted = isInDefault({
      wasDefaulted: L8.wasDefaulted[row] === 1,
      mergerAcquired: L8.wasMergerAcquired[row] === 1,
      cashUSD: cash.usd,
      coverage: newCoverage,
      coverageFloor: DEFAULT_COVERAGE_FLOOR,
    });

    let newRating = L8.creditRating[row] as Company['creditRating'];

    if (isDefaulted) {
      newRating = 'D';
      if (L8.wasDefaulted[row] !== 1) {
        ctx.defaultedTickers.push(L8.ticker[row]);
        comp.defaultedWeek = nextWeek;
        // DEFAULT_TRACE=1 — who died this week and what its books looked like at the moment.
        if (process.env.DEFAULT_TRACE === '1') {
          console.log(`  [default] w${nextWeek} ${d.backLanes.region[row]}:${L8.ticker[row]} ${d.backLanes.sector[row]}`
            + ` cash ${(cash.usd / 1e6).toFixed(1)}M cov ${newCoverage.toFixed(2)} rev ${(newRevenue / 1e6).toFixed(0)}M`
            + ` ebitda ${(newEbitda / 1e6).toFixed(1)}M debt ${(L8.totalDebtUSD[row] / 1e6).toFixed(0)}M`
            + ` heads ${L8.employeeCount[row]} born ${comp.bornWeek ?? 'seed'}`);
        }
        newRevenue = round1(newRevenue * 0.4);
        newEbitda = 0;
        newEbit = 0;
      }
    } else {
      // CRD-R1 — the rating reads everything the model already measures about this issuer, not
      // just two ratios (§7.184). Every argument is a measurement taken elsewhere for another
      // purpose; nothing here is a new stated weight.
      // maturityWallShare's own arithmetic on the rows (the revolver drawn above is not in
      // rowList yet, exactly as it was not in comp.debtTranches here).
      let wallUSD = 0, ladderSumUSD = 0;
      for (const r of rowList) {
        ladderSumUSD += TS.principalUSD[r];
        if (TS.maturityWeek[r] - nextWeek <= 52) wallUSD += TS.principalUSD[r];
      }
      const maturityWallShareOfLadder = wallUSD / Math.max(1, ladderSumUSD);
      const ladderUSD = Math.max(1, ladderSumUSD);
      // §4.C II.5 — the ring, at this exact sequence point (the §7.320 mid-loop-append trap is
      // structurally gone: profiles push to the ring, this fold reads the ring).
      const rvRow = rowOf(v2, L8.companyId[row]);
      const rvLen = revHistLen(v2, rvRow);
      let rvSum = 0;
      for (let i = 0; i < rvLen; i++) rvSum += revHistAt(v2, rvRow, i);
      const revMean = rvLen > 2 ? rvSum / rvLen : 0;
      let rvVar = 0;
      for (let i = 0; i < rvLen; i++) rvVar += (revHistAt(v2, rvRow, i) - revMean) ** 2;
      const revVol = revMean > 0 ? Math.sqrt(rvVar / rvLen) / revMean : 0;
      // §7.268 — A BANK IS NOT RATED ON THE CORPORATE CONTEXT. Its company-level figures are
      // the accrual bridge, not the business: its cash lives on the bank sheet (so
      // `liquidityToDebt` read ~0), its earnings statistic swings through zero on the bridge
      // (so the rater's no-earnings branch fired CCC on solvent banks — measured: every UK
      // bank at CCC by w9 with equity RECOVERING, whereupon its wholesale repriced to
      // policy+700bps and the §7.256 NIM family followed), and its revenue print is exactly
      // the volatility the vol notch punishes. The bank's spine is creditMetrics' own bank
      // branch — its sheet's capital ratio — and the corporate measurements are simply "no
      // opinion" (absent), which is what the CreditContext contract says absence means.
      const calculatedRating = determineCreditRating(newLeverage, newCoverage,
        L8.sector[row] === 'Banks'
          ? {
            annualRevenueUSD: newRevenue,
            peerMedianRevenueUSD: regionMedianRevenueUSD,
          }
          : {
            annualRevenueUSD: newRevenue,
            peerMedianRevenueUSD: regionMedianRevenueUSD,
            customerConcentration: Number.isNaN(L8.customerConcentration[row]) ? undefined : L8.customerConcentration[row],
            supplierConcentration: Number.isNaN(L8.supplierConcentration[row]) ? undefined : L8.supplierConcentration[row],
            maturityWallShare: maturityWallShareOfLadder,
            liquidityToDebt: Math.max(0, cash.usd) / ladderUSD,
            revenueVolatility: revVol,
            // CRD: the earnings themselves, so the rater can answer the case the ratio clamps
            // were covering up rather than inheriting a bounded number that has lost it.
            ebitdaUSD: newEbitda,
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
      const notchGap = Math.abs(RATING_ORDER.indexOf(calculatedRating) - RATING_ORDER.indexOf(L8.creditRating[row] as Company['creditRating']));
      const crossesIgHyLine = getRatingBucket(calculatedRating) !== getRatingBucket(L8.creditRating[row] as Company['creditRating']);
      const forceUpdate = notchGap >= 2 || crossesIgHyLine;
      if (calculatedRating !== L8.creditRating[row] && (forceUpdate || random() < 0.25)) {
        ctx.ratingChanges.push({
          ticker: L8.ticker[row],
          from: L8.creditRating[row] as Company['creditRating'],
          to: calculatedRating,
          name: L8.name[row],
        });
        newRating = calculatedRating;
      }
    }

    // Wall Street: comp.oasSpreadBps (07b-corporate-bond-clearing.ts) and
    // comp.leveragedLoan.discountMarginBps (07d-leveraged-loan-clearing.ts) are both now real,
    // already-cleared values, set from actual institutional-entity order flow against the bank
    // dealer desk before this stage ever runs. Nothing here computes or smooths either one.

    // Pre-refinancing trigger roughly one year before maturity
    if (drawnRevolverRow >= 0) rowList.push(drawnRevolverRow);
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
    const settlement = primarySettlementByIssuerId.get(L8.companyId[row]);
    const primaryFixedAdjUSD = settlement && !settlement.withdrawn && settlement.offering.rateType === 'FIXED' ? settlement.marketTakeUSD : 0;
    const primaryFloatingAdjUSD = settlement && !settlement.withdrawn && settlement.offering.rateType === 'FLOATING' ? settlement.marketTakeUSD : 0;
    // SCALE — the two filtered reduces as one walk; each accumulator sums its subset in array
    // order and the adjustment adds last, so every float is the one the filters produced.
    let preFixedSumUSD = 0, preFloatingSumUSD = 0;
    for (const r of rowList) {
      const fl = TS.flags[r];
      if (!(fl & TR_FLOATING)) { if (!(fl & TR_CP)) preFixedSumUSD += TS.principalUSD[r]; }
      else if (!(fl & TR_FACILITY)) preFloatingSumUSD += TS.principalUSD[r];
    }
    const preActionFixedUSD = preFixedSumUSD + primaryFixedAdjUSD;
    const preActionFloatingUSD = preFloatingSumUSD + primaryFloatingAdjUSD;

    /**
     * What retiring `amountUSD` of `tranche` early costs this issuer ON TOP of the principal —
     * the call premium (`domain/call-protection.ts`). Zero at maturity and on bank facilities;
     * real everywhere else, which is what makes a refinancing an economic decision.
     */
    const callPremiumRowUSD = (r: number, amountUSD: number): number => {
      if (!(amountUSD > 0)) return 0;
      const remainingYears = Math.max(0.5, (TS.maturityWeek[r] - state.currentWeek) / 52);
      const riskFree = calculateNelsonSiegelZeroRate(remainingYears, reg.yieldCurveParams);
      return amountUSD * (callPricePerDollar(viewOf(r), state.currentWeek, riskFree) - 1);
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
    const retirementEconomics = (r: number) => {
      const remainingYears = Math.max(0.5, (TS.maturityWeek[r] - state.currentWeek) / 52);
      const riskFree = calculateNelsonSiegelZeroRate(remainingYears, reg.yieldCurveParams);
      const isFixed = !(TS.flags[r] & TR_FLOATING);
      const annualRate = isFixed
        ? (Number.isNaN(TS.couponRate[r]) ? 0 : TS.couponRate[r])
        : reg.policyRate + (Number.isNaN(TS.floatingMarginBps[r]) ? 0 : TS.floatingMarginBps[r]) / 10000;
      const fairRateToday = isFixed
        ? riskFree + L8.oasSpreadBps[row] / 10000
        : reg.policyRate + L8.oasSpreadBps[row] / 10000;
      const premiumPerDollar = callPremiumRowUSD(r, 1);
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
    const recordPremium = (r: number, premiumUSD: number) => {
      if (!(premiumUSD > 0)) return;
      if (!(TS.flags[r] & TR_FLOATING)) bondCallPremiumUSD += premiumUSD;
      else loanCallPremiumUSD += premiumUSD;
      // SETL4: reported here, PAID by the register below (`payHoldersCash`) — settling it here as
      // well debited the issuer twice, once to the holders and once to nobody.
      post('call premium paid to holders', -premiumUSD, undefined, false);
    };

    // Corporate debt lifecycle: call and refinance when genuinely accretive
    const calledRefinanceTranches: DebtTranche[] = [];
    rowList.forEach(rTr => {
      if ((TS.flags[rTr] & (TR_FLOATING | TR_CP))) return;
      const remainingYears = Math.max(0.5, (TS.maturityWeek[rTr] - state.currentWeek) / 52);
      const currentFairRate = calculateNelsonSiegelZeroRate(remainingYears, reg.yieldCurveParams) + L8.oasSpreadBps[row] / 10000;
      // A floating tranche carries a margin rather than a coupon; there is nothing to refinance
      // INTO a lower fixed rate, so its saving is zero rather than NaN.
      const excessCashAvailable = cash.usd > L8.annualRevenueUSD[row] * 0.15;
      // The real test is not "is the coupon above the market" — it is whether the saving is worth
      // what the call costs. A treasurer discounts the coupon saving over the paper's remaining
      // life and compares it to the premium; below that line the bond stays outstanding.
      //
      // Without this an issuer called at PAR for free the moment rates moved 1% its way, which is
      // an option no lender writes. It is also what a make-whole exists to neutralise: for an IG
      // bond the premium IS the present value of the saving, so a purely rate-driven call never
      // clears this test and an IG issuer calls for a real reason instead.
      // §5-STRUCT step 2 — the call test lives on the ladder (domain/company-week/debt-ladder.ts).
      const premiumPerDollar = callPricePerDollar(viewOf(rTr), state.currentWeek, currentFairRate - L8.oasSpreadBps[row] / 10000) - 1;
      const economics = callEconomics({
        couponRate: Number.isNaN(TS.couponRate[rTr]) ? undefined : TS.couponRate[rTr],
        currentFairRate,
        remainingYears,
        premiumPerDollar,
        materialSavingAnnual: 0.01,
      });
      if (economics.isAccretive && excessCashAvailable && newRating !== 'CCC' && newRating !== 'D') {
        const calledAmountUSD = callableAmountUSD({
          tranchePrincipalUSD: TS.principalUSD[rTr],
          cashUSD: cash.usd,
          cashFloorUSD: L8.annualRevenueUSD[row] * 0.15,
          premiumPerDollar,
        });
        retireTranche(v2, issuer, rTr, calledAmountUSD, 'accretive call: principal retired');
        // The ladder change below reaches the holders through the register (settleCorporateAction-
        // OnHolders), which is what pays them; this line reports it on the cash walk only.
        post('accretive call: principal retired', -calledAmountUSD, undefined, false);
        recordPremium(rTr, calledAmountUSD * premiumPerDollar);
        // Calling a bond because it is expensive relative to the market is REFINANCING, not
        // deleveraging: the issuer replaces it at today's cheaper rate and keeps the money. The
        // saving is the lower coupon, which is what `callEconomics` above measures.
        //
        // This used to retire the tranche with cash and stop there, which is a different
        // transaction entirely — it shrank the issuer's debt every time rates moved in its
        // favour. Across the market that meant the corporate bond float fell by half inside six
        // months and 73 of 200 issuers had no bonds left at all: the asset class 07b exists to
        // clear was quietly disappearing, and what remained was a float small enough that ordinary
        // flow moved its spread hundreds of basis points a week.
        if (calledAmountUSD > 0.01) {
          calledRefinanceTranches.push({
            id: `${L8.companyId[row]}-CALL-${state.currentWeek}-${v2.internedStrings[TS.idRef[rTr]]}`,
            principalUSD: calledAmountUSD,
            rateType: 'FIXED',
            couponRate: currentFairRate,
            originationWeek: state.currentWeek,
            maturityWeek: state.currentWeek + STANDARD_CORP_TENOR_YEARS * 52,
            seniority: 'SENIOR',
            callProtection: callProtectionForIssue({ rateType: 'FIXED', isInvestmentGrade: isInvestmentGrade(newRating) }),
          });
          post('accretive call: replacement issue proceeds', calledAmountUSD, undefined, false);
        }
      }
    });
    // Remove any tranche whose principalUSD reaches zero, then add the replacement issues.
    rowList = rowList.filter(r => TS.principalUSD[r] > 0.01);
    for (const t of calledRefinanceTranches) rowList.push(issueTranche(v2, issuer, t, 'accretive call: replacement issue'));

    // WS8: the year-early pre-refi and the at-maturity formula roll are both gone — a roll now
    // happens in the MARKET. A tranche one week from maturity is announced as a REFINANCE
    // offering (rate type per the issuer's CURRENT rating mix); next week 07b/07d price it
    // alongside the outstanding stock, and the settlement below either delivers the new
    // tranche at the CLEARED terms or — withdrawn/unpriced — the revolver catches the issuer
    // at its penalty rate, the same real funding-squeeze mechanism as a failed CP roll.
    const fiveYearSovRate = calculateNelsonSiegelZeroRate(5, updatedRegions[L8.region[row]].yieldCurveParams);
    rowList.forEach((rTr) => {
      if (TS.flags[rTr] & TR_CP) return;
      if (TS.maturityWeek[rTr] !== nextWeek + 1) return;
      if (pendingOfferingIssuerIds.has(L8.companyId[row])) return; // one live book per issuer
      // IND4: rating decides an issuer's ACCESS to the bond market; the industry tilts it by
      // what the money is buying. Long-lived assets are funded long, asset-light ones float.
      const refinanceAsFixed = fixedShareOf(comp) >= 0.5;
      const revolverAllInAnnual = reg.policyRate + L8.facilityMarginBps[row] / 10000;
      enqueueOffering({
        id: `PO-${L8.companyId[row]}-${nextWeek}-REFI`,
        issuerId: L8.companyId[row],
        issuerTicker: L8.ticker[row],
        region: L8.region[row],
        instrumentType: refinanceAsFixed ? 'CORP_BOND' : 'LEVERAGED_LOAN',
        purpose: 'REFINANCE',
        sizeUSD: TS.principalUSD[rTr],
        // Need-driven: the issuer walks only where the market is worse than its revolver.
        walkAwayStat: refinanceAsFixed
          ? Math.max(50, Math.round((revolverAllInAnnual - fiveYearSovRate) * 10000))
          : L8.facilityMarginBps[row],
        rateType: refinanceAsFixed ? 'FIXED' : 'FLOATING',
        leadBankTicker: leadBankFor(comp, TS.principalUSD[rTr]),
        announcedWeek: nextWeek,
      });
    });

    const maturingRow = rowList.find(r => TS.maturityWeek[r] === nextWeek && !(TS.flags[r] & TR_CP));
    const maturingPrincipalUSD = maturingRow !== undefined ? TS.principalUSD[maturingRow] : 0;
    // §5-WIRES W3: every row that matures this week hands its face back to the issuer by wire
    // (the holders are paid by the register's paying agent on the same ladder delta).
    for (const r of rowList) {
      if (TS.maturityWeek[r] === nextWeek && !(TS.flags[r] & TR_CP) && TS.principalUSD[r] > 0.01) {
        retireTranche(v2, issuer, r, TS.principalUSD[r], 'maturing tranche principal repaid');
      }
    }
    rowList = rowList.filter(r => TS.maturityWeek[r] !== nextWeek || (TS.flags[r] & TR_CP) !== 0);
    let debtIssuanceThisWeek = 0;
    let debtRepaymentThisWeek = 0;
    const buybacksThisWeek = 0;

    // WS8: consume this week's priced offering, if any (settlement snapshot taken above, where
    // the holder-settlement baseline is built).
    if (settlement && !settlement.withdrawn) {
      const o = settlement.offering;
      // Best-efforts until G3: the tranche created is what the market actually took — a
      // partially-placed deal raises less, which is real.
      // WS8: what came into EXISTENCE, not what the book bought. Under firm commitment the lead
      // holds the residual, so the tranche is the whole deal — see `issuedUSD`.
      const placedUSD = Math.max(0, Math.min(o.sizeUSD, settlement.issuedUSD ?? o.sizeUSD));
      const newTranche: DebtTranche = o.rateType === 'FIXED'
        ? {
            id: `${L8.companyId[row]}-${o.purpose}-${nextWeek}`,
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
            id: `${L8.companyId[row]}-${o.purpose}-${nextWeek}`,
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
        let retiredUSD = 0;
        for (const r of rowList) {
          if (!retire.has(v2.internedStrings[TS.idRef[r]])) continue;
          retiredUSD += TS.principalUSD[r];
          recordCredit(v2.internedStrings[TS.idRef[r]], TS.principalUSD[r], 0, 0, true);
          retireTranche(v2, issuer, r, TS.principalUSD[r], 'term-out: maintenance bridges retired');
        }
        rowList = rowList.filter(r => !retire.has(v2.internedStrings[TS.idRef[r]]));
        debtRepaymentThisWeek += retiredUSD;
        post('term-out: maintenance bridges retired', -retiredUSD, bankCredit);
      }
      if (placedUSD > 1000) rowList.push(issueTranche(v2, issuer, newTranche, `primary ${o.purpose.toLowerCase()} placed`));
      debtIssuanceThisWeek += placedUSD;
      // WS8/CASH: reported here, PAID elsewhere by name — the clearing house pays the issuer for
      // what the book took, and the lead pays it for the residual and charges it the fee
      // (book-settlement.ts, primary-settlement.ts). This line settled the whole of it against
      // the boundary while the CCP paid the boundary for the same paper.
      post(`primary ${o.purpose.toLowerCase()} proceeds (net of underwriting fee)`, settlement.proceedsUSD, undefined, false);
    } else if (settlement && settlement.withdrawn && settlement.offering.purpose === 'REFINANCE' && maturingRow !== undefined) {
      // The market said no and the paper still matures: the revolver catches it — real market
      // access closing when spreads gap, with a real penalty cost.
      const revolverTranche: DebtTranche = {
        id: `${L8.companyId[row]}-REVOLVER-${nextWeek}`,
        principalUSD: maturingPrincipalUSD,
        rateType: 'FLOATING',
        floatingMarginBps: L8.facilityMarginBps[row],
        originationWeek: nextWeek,
        maturityWeek: nextWeek + 52,
        seniority: 'SENIOR',
        // G2: the revolver is a committed BANK line — the house bank funds it and books it.
        isBankFacility: true,
        facilityBankTicker: L8.homeBankTicker[row],
      };
      rowList.push(issueTranche(v2, issuer, revolverTranche, 'revolver draw: withdrawn refinancing'));
      debtIssuanceThisWeek += revolverTranche.principalUSD;
      recordCredit(revolverTranche.id, revolverTranche.principalUSD, L8.facilityMarginBps[row],
        Math.max(1, revolverTranche.maturityWeek - nextWeek), false);
      post('revolver draw: withdrawn refinancing', revolverTranche.principalUSD, bankCredit);
      pushNews({
        id: `refi-fail-${L8.ticker[row]}-${nextWeek}`,
        week: nextWeek,
        title: `${L8.ticker[row]} Pulls Refinancing, Draws Revolver`,
        description: `${L8.name[row]} withdrew a ${formatCurrency(settlement.offering.sizeUSD, { compact: true })} refinancing at its walk-away and drew its revolver at policy+${L8.facilityMarginBps[row]}bps.`,
        category: 'CREDIT',
        impactBadge: '[FUNDING SQUEEZE]',
        impactRegion: L8.region[row],
        impactSector: L8.sector[row],
        affectedTicker: L8.ticker[row],
        urgent: true,
      } as NewsItem);
    }

    if (maturingRow !== undefined) {
      debtRepaymentThisWeek += maturingPrincipalUSD;
      // The principal leaves through the ledger; the refinancing proceeds (if the offering
      // settled) arrived above. A maturity with neither settlement nor revolver above means the
      // company simply repays from cash — deleveraging by default, which is real.
      // §7.286: this stays the internal VIEW of the payment `settleCorporateActionOnHolders`
      // below makes for real (issuer → holder of record, on the same ladder delta).
      post('maturing tranche principal repaid', -maturingPrincipalUSD, undefined, false);
    }

    if (maintenanceFundingTranches.length > 0) {
      for (const t of maintenanceFundingTranches) rowList.push(issueTranche(v2, issuer, t, 'maintenance funding bridge drawn'));
      debtIssuanceThisWeek += maintenanceFundingTranches.reduce((s, t) => s + t.principalUSD, 0);
    }

    // WS8: the weekly maintenance drip stays a revolver-style bridge (it already prices wide),
    // and once the accumulated bridges reach benchmark size the treasurer TERMS THEM OUT
    // through a real offering — bridge-then-term-out, the actual corporate funding pattern.
    // IG issuers term out in the bond market, sub-IG in the loan market.
    if (!pendingOfferingIssuerIds.has(L8.companyId[row]) && !primarySettlementByIssuerId.has(L8.companyId[row])) {
      const bridges = rowList.filter(r => v2.internedStrings[TS.idRef[r]].includes('-MAINT-'));
      let bridgeUSD = 0;
      for (const r of bridges) bridgeUSD += TS.principalUSD[r];
      let totalDebtForGate = 0;
      for (const r of rowList) totalDebtForGate += TS.principalUSD[r];
      if (bridgeUSD > Math.max(1e6, totalDebtForGate * 0.02)) {
        const asFixed = fixedShareOf(comp) >= 0.5;  // IND4: rating's access, industry's tilt
        const revolverAllInAnnual = reg.policyRate + L8.facilityMarginBps[row] / 10000;
        enqueueOffering({
          id: `PO-${L8.companyId[row]}-${nextWeek}-MAINT`,
          issuerId: L8.companyId[row],
          issuerTicker: L8.ticker[row],
          region: L8.region[row],
          instrumentType: asFixed ? 'CORP_BOND' : 'LEVERAGED_LOAN',
          purpose: 'MAINTENANCE_TERM_OUT',
          sizeUSD: bridgeUSD,
          // Terming out only makes sense below the bridge's own cost.
          walkAwayStat: asFixed
            ? Math.max(50, Math.round((revolverAllInAnnual - fiveYearSovRate) * 10000))
            : L8.facilityMarginBps[row],
          rateType: asFixed ? 'FIXED' : 'FLOATING',
          refinancesTrancheIds: bridges.map(r => v2.internedStrings[TS.idRef[r]]),
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
      calculateNelsonSiegelZeroRate(STANDARD_CORP_TENOR_YEARS, reg.yieldCurveParams) + L8.oasSpreadBps[row] / 10000;
    // S5 leak #3 fixed for real: surplus-cash prepayment retires ACTUAL tranches (nearest
    // maturity first — the paper a treasurer would take out), so cash and the ladder move
    // together and the settled reduction reaches holders via settleCorporateActionOnHolders.
    if (cash.usd > 2.5 * L8.currentLiabilitiesUSD[row]) {
      let ladderTotalUSD = 0;
      for (const r of rowList) ladderTotalUSD += TS.principalUSD[r];
      if (ladderTotalUSD > 50) {
        let toPrepayUSD = Math.min(ladderTotalUSD * 0.05, (cash.usd - 2.5 * L8.currentLiabilitiesUSD[row]) * 0.25);
        if (toPrepayUSD > 1000) {
          // §4.0 Tier 1 item 12 — a FACILITY on the prepay list must reach its LENDER: the loan
          // leaves the bank's book through the credit event and the money through a real
          // BANK_CREDIT payment (repayment is reverse origination: the deposit and the loan die
          // together). Register paper keeps its own path (settleCorporateActionOnHolders pays
          // the holders); its cash line stays report-only. Before this, a prepaid facility left
          // the ladder while the bank kept the loan and nobody received the cash.
          const facilityRepaidByBank = new Map<string, number>();
          let facilityRepaidUSD = 0;
          // Cheapest debt to be rid of first, and only paper that is actually worth retiring.
          // SCALE — the economics are computed ONCE per tranche (they read only per-dollar
          // figures, so the map's principal writes cannot change them); the comparator used to
          // re-run a Nelson-Siegel evaluation on every comparison of the sort.
          const prepayEcon = new Map<number, ReturnType<typeof retirementEconomics>>();
          for (const r of rowList) prepayEcon.set(r, retirementEconomics(r));
          rowList = rowList
            .slice()
            .sort((a, b) => prepayEcon.get(b)!.valuePerCost - prepayEcon.get(a)!.valuePerCost);
          rowList.forEach(rTr => {
              if (toPrepayUSD <= 0 || (TS.flags[rTr] & TR_CP)) return; // CP is 07f's to resize against the real gap
              const { premiumPerDollar, worthRetiring } = prepayEcon.get(rTr)!;
              if (!worthRetiring) return;
              // The budget buys principal AND the premium, so early repayment retires less per
              // dollar of surplus cash than it used to. That is the point: it is not free.
              const repaid = Math.min(TS.principalUSD[rTr], toPrepayUSD / (1 + premiumPerDollar));
              toPrepayUSD -= repaid * (1 + premiumPerDollar);
              recordPremium(rTr, repaid * premiumPerDollar);
              const remainingUSD = TS.principalUSD[rTr] - repaid;
              if ((TS.flags[rTr] & TR_FACILITY) && TS.bankRef[rTr] >= 0 && repaid > 0) {
                const bankTicker = v2.internedStrings[TS.bankRef[rTr]];
                // Pushed DIRECTLY, not via recordCredit: that helper books to homeBankTicker —
                // the facility's lender is t.facilityBankTicker, and splitting the two put the
                // deposit destruction on one bank and the loan reduction on another (measured:
                // PGNX +292.7M of prepay credit against a −4.1M loan move, identity −151.8M).
                // Its `principalUSD > 0` guard also swallowed full retirements.
                ctx.creditEventsThisWeek.push({
                  bankTicker, companyId: L8.companyId[row], trancheId: v2.internedStrings[TS.idRef[rTr]],
                  principalUSD: Math.max(0, remainingUSD), marginBps: Number.isNaN(TS.floatingMarginBps[rTr]) ? 350 : TS.floatingMarginBps[rTr],
                  originationWeek: TS.originationWeek[rTr], termWeeks: Math.max(1, TS.maturityWeek[rTr] - TS.originationWeek[rTr]),
                  retire: remainingUSD <= 0.01,
                });
                facilityRepaidByBank.set(bankTicker,
                  (facilityRepaidByBank.get(bankTicker) ?? 0) + repaid);
                facilityRepaidUSD += repaid;
              }
              retireTranche(v2, issuer, rTr, repaid, 'debt prepayment: principal retired');
            });
          rowList = rowList.filter(r => TS.principalUSD[r] > 0.01);
          let postPrepaySumUSD = 0;
          for (const r of rowList) postPrepaySumUSD += TS.principalUSD[r];
          const prepaidUSD = Math.min(ladderTotalUSD, ladderTotalUSD - postPrepaySumUSD);
          facilityRepaidByBank.forEach((repaidUSD, bankTicker) => {
            post('facility prepaid: the loan and the deposit die together', -repaidUSD,
              { kind: 'BANK_CREDIT', ticker: bankTicker });
          });
          post('surplus-cash debt prepayment', -(prepaidUSD - facilityRepaidUSD), undefined, false);
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
      totalDebtUSD: rowList.reduce((sum, r) => sum + TS.principalUSD[r], 0),
      cashUSD: cash.usd,
      rating: newRating,
    });

    // A quarterly-sized deal IS a quarter's issuance: no new opportunistic book until it has
    // been digested (without this, every issuer re-announced the week its deal settled and the
    // market ran a standing conveyor at 13x the intended flow — measured 17,006 deals in 30
    // weeks with the median OAS pinned at the wides).
    const opportunisticCooldownOver = nextWeek - (Number.isNaN(L8.lastOpportunisticOfferingWeek[row]) ? -999 : L8.lastOpportunisticOfferingWeek[row]) >= 13
      // Launch in the issuer's own post-earnings window — real deals price off fresh numbers,
      // and the stagger stops the whole cohort announcing in one synchronized quarterly burst.
      // An issuer with no reporting calendar (a private firm) has no post-earnings window to
      // launch into, so its cooldown is the only gate.
      && (Number.isNaN(L8.earningsWeekModulo[row])
        || (nextWeek % 13) === ((L8.earningsWeekModulo[row] + 1) % 13));
    let newLastOpportunisticOfferingWeek = Number.isNaN(L8.lastOpportunisticOfferingWeek[row]) ? undefined : L8.lastOpportunisticOfferingWeek[row];
    if (financing.reason === 'ISSUE_CHEAP_DEBT' && financing.netDebtChangeUSD > 1000 && !pendingOfferingIssuerIds.has(L8.companyId[row]) && opportunisticCooldownOver) {
      // WS8: the CFO ANNOUNCES a deal instead of conjuring a tranche at the current stat. Real
      // issuance is chunky — a quarter's worth of the weekly flow in one book — and it is
      // priced NEXT week alongside the outstanding stock, conceding what real demand requires.
      // The walk-away is the CFO's own indifference cost; a deal launched into a market that
      // then gaps past it is pulled, which is what a real busted bookbuild is.
      const dealSizeUSD = financing.netDebtChangeUSD * 13;
      const walkAwayOasBps = Math.max(
        L8.oasSpreadBps[row],
        Math.round((financing.walkAwayCostAnnual - calculateNelsonSiegelZeroRate(STANDARD_CORP_TENOR_YEARS, reg.yieldCurveParams)) * 10000)
      );
      enqueueOffering({
        id: `PO-${L8.companyId[row]}-${nextWeek}-OPP`,
        issuerId: L8.companyId[row],
        issuerTicker: L8.ticker[row],
        region: L8.region[row],
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
      let facilityRepaidUSD = 0;
      // SCALE — same once-per-tranche economics as the prepayment path above.
      const deleverEcon = new Map<number, ReturnType<typeof retirementEconomics>>();
      for (const r of rowList) deleverEcon.set(r, retirementEconomics(r));
      rowList = rowList
        .slice()
        .sort((a, b) => deleverEcon.get(b)!.valuePerCost - deleverEcon.get(a)!.valuePerCost);
      rowList.forEach(rTr => {
          if (remainingToRepayUSD <= 0) return;
          // CP is 07f's, exactly as the surplus-cash prepayment above already says: its size is
          // the working-capital gap and its holders are a book this stage does not settle. It was
          // NOT excluded here, and the register that repays holders on a ladder change filters CP
          // out — so paper retired on this path left its holders with a claim on nothing and no
          // cash. Measured by the ledger check on its first run: the EUR CP stock falling week
          // after week while its holders' books stood still, 109% held by week eight.
          if (TS.flags[rTr] & TR_CP) return;
          const { premiumPerDollar, worthRetiring } = deleverEcon.get(rTr)!;
          // A company that wants less leverage still will not pay a make-whole to get it: if
          // nothing in the stack is economic to retire this week, it holds the cash and waits.
          if (!worthRetiring) return;
          const repaidUSD = Math.min(TS.principalUSD[rTr], remainingToRepayUSD / (1 + premiumPerDollar));
          remainingToRepayUSD -= repaidUSD * (1 + premiumPerDollar);
          recordPremium(rTr, repaidUSD * premiumPerDollar);
          // A drawn FACILITY retired here is a KNOWN GAP, measured and left alone rather than
          // half-closed: the register below settles market paper only, so the principal leaves
          // the issuer's ladder and reaches no lender. Paying the bank is not enough on its own —
          // the facility is also an itemized loan on that bank's book (G2), and moving the cash
          // without shrinking the asset breaks the per-bank identity, which is exactly what
          // happened when this was tried. One change to both sides, together. Owner: G2.
          if (TS.flags[rTr] & TR_FACILITY) facilityRepaidUSD += repaidUSD;
          retireTranche(v2, issuer, rTr, repaidUSD, 'opportunistic deleveraging: principal repaid');
        });
      rowList = rowList.filter(r => TS.principalUSD[r] > 0.01);
      void facilityRepaidUSD;
      const actuallyRepaidUSD = -financing.netDebtChangeUSD - remainingToRepayUSD;
      debtRepaymentThisWeek += actuallyRepaidUSD;
      post('opportunistic deleveraging: principal repaid', -actuallyRepaidUSD, undefined, false);
    }

    // Real, already-cleared this week (see the comment above) — not recomputed here.
    const newOasBps = L8.oasSpreadBps[row];
    // CRD/DER2 — THE CDS SPREAD IS CLEARED NOW (07h), not decorated here.
    //
    // What stood here was `oasSpreadBps + a random draw in [-4, +4]`, bounded to [10, 5000]: a
    // decoration on another price with a clamp on each end, which is rule 1 and rule 15 in two
    // lines. Nothing traded it and nobody was on either side, so a bank could not lay off a
    // credit concentration at all — the only way to reduce one was to stop lending. The
    // protection book prices it against real hedging demand and real sellers, and the difference
    // between it and the cash OAS is the BASIS, which is an outcome worth having.
    const newCdsSpreadBps = L8.cdsSpreadBps[row] > 0 ? L8.cdsSpreadBps[row] : newOasBps;

    // Real, already-cleared this week by 07d-leveraged-loan-clearing.ts — not recomputed here.

    // Asynchronous Quarterly Earnings cycle
    // Reporting is something a LISTED company does. Gating on the modulo alone kept a company
    // that had been taken private reporting quarterly to a market it had left.
  if (S08K_PROF) s08k.debt += performance.now() - __k2;
  return { bondCallPremiumUSD, buybacksThisWeek, debtIssuanceThisWeek, debtRepaymentThisWeek, financing, isDefaulted, loanCallPremiumUSD, newCdsSpreadBps, newLastOpportunisticOfferingWeek, newOasBps, newRating, preActionFixedUSD, preActionFloatingUSD, rowList, settlement, newRevenue, newEbitda, newEbit, newTotalDebt };
}

export type BackCoreOut = ReturnType<typeof runBackCoreA> & ReturnType<typeof runBackCoreB>;

function runBackCore(comp: Company, row: number, d: BackKernelDeps) {
  const a = runBackCoreA(comp, row, d);
  runMmfRedemption(comp, row, d, a);
  const b = runBackCoreB(comp, row, d, a);
  return { ...a, ...b };
}

export function makeStage08BackKernel(d: BackKernelDeps): (comp: Company, row: number, pre?: BackCoreOut) => Company {
  const {
    state, ctx, v2, F, nextWeek, currentWeekMod13, updatedRegions, companyUpdates, entityById,
    regionMedianRevenueUSD, systemicStressFactorGlobal, retainCashLedger, mmfSweepBooks,
    primarySettlementByIssuerId, pendingOfferingIssuerIds, leadBankFor, enqueueOffering, pushNews,
  } = d;
/**
 * §7.317 steps 1.5/1.7 — THE BACK CORE, lifted whole: capital → cash walk → liquidity → debt →
 * rating, verbatim, ending where the earnings/filing/write-back POST begins. Reads lanes and v2
 * rows only, except the four §7.320 exceptions (the profile branch, mmfSharesUSD, the capital
 * write application, the revenueHistory fold). Returns the measured 50-value crossing interface
 * plus the cash poster the post zone keeps writing through.
 */
/** §7.321 core-A: capital + cash walk — no contention, no draws. Parallel-safe. */


  return (comp: Company, row: number, pre?: BackCoreOut): Company => {
    if (!isActiveCompany(comp)) {
      return Object.assign(comp, { previousEmployeeCount: 0, employeeCount: 0 });
    }
    const core = pre ?? runBackCore(comp, row, d);
    const { accruedTaxUSD, annualInterest, bondCallPremiumUSD, buybacksThisWeek: buybacksFromCore, newLeverage, newCoverage, cap, capexCommissionedThisWeekUSD, cashLedger, costDriversUSD, debtIssuanceThisWeek, debtRepaymentThisWeek, financing, isDefaulted, loanCallPremiumUSD, measuredInputConsumptionWeeklyUSD, newAccumulatedDepreciationUSD, newBaselineDividendYield, newCapex, newCdsSpreadBps, newDividendYield, newEbit, newEbitda, newEmployeeCount, newEps, newExecutionQuality, newGrossPPEUSD, newGrowthCapex, newInputSupplyConstraintFactor, newLastOpportunisticOfferingWeek, newMaintenanceCapex, newMaintenanceShortfallStreak, newNetIncome, newOasBps, newOccupationMixDrift, newOutputInventoryBySubUnit, newRating, newRecentFulfillmentEMA, newRecurringBaseUSD, newRevenue, newRndExpense, newTotalDebt, preActionFixedUSD, preActionFloatingUSD, rowList, sec, settlement, stillUnderConstruction, targetProductionUSD, updatedProductLines, weeklyDepreciation, weeklyPayrollUSD, post, cash } = core;
    const L8 = d.backLanes;
    const reg = updatedRegions[L8.region[row]];
    const weekUpdate = companyUpdates[L8.ticker[row]];
    const TS = v2.tranches;
    const update = weekUpdate;
    let buybacksThisWeek = buybacksFromCore;
    const __k3 = S08K_PROF ? performance.now() : 0;
    const isReportingThisWeek = !isDefaulted && isPubliclyListed(comp)
      && !Number.isNaN(L8.earningsWeekModulo[row]) && L8.earningsWeekModulo[row] === currentWeekMod13;
    let lastEarningsSurprisePct = comp.lastEarningsSurprisePct;
    let lastManagementCommentary = comp.lastManagementCommentary;

    let updatedConsensus = comp.dealerConsensus;

    // IND-R6: public-only. Sell-side consensus and an earnings surprise need a firm that
    // REPORTS — real private firms publish none of this. One of the few things the deleted
    // branch was right to skip, now guarded where it happens instead of forking the whole model.
    if (isReportingThisWeek && isPubliclyListed(comp)) {
      // Mean of Dealer Alpha, Beta, and Gamma estimates
      const alphaEps = comp.dealerConsensus?.alpha?.eps ?? L8.eps[row];
      const betaEps = comp.dealerConsensus?.beta?.eps ?? L8.eps[row];
      const gammaEps = comp.dealerConsensus?.gamma?.eps ?? L8.eps[row];
      const consensusEps = round2((alphaEps + betaEps + gammaEps) / 3);
      const actualEps = newEps;
      const epsDiff = actualEps - consensusEps;
      const rawSurprise = epsDiff / Math.max(Math.abs(consensusEps), Math.abs(actualEps), 1.0);
      lastEarningsSurprisePct = round3(rawSurprise);

      // Management commentary & guidance snippet generation
      let guidanceSnippet: string;
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
        ticker: L8.ticker[row],
        name: L8.name[row],
        actualEps,
        consensusEps,
        surprisePct: lastEarningsSurprisePct,
        guidanceSnippet,
        sector: L8.sector[row],
        region: L8.region[row],
      });

      // Update next quarter 3-dealer forecasts
      const nextQuarterBaseEps = actualEps * (1 + sec.growthRate / 4);
      const nextAlphaEps = round2(nextQuarterBaseEps * 0.96);
      const nextBetaEps = round2(nextQuarterBaseEps * (1 + reg.gdpGrowth));
      const nextGammaEps = round2(nextQuarterBaseEps * 1.08);
      const newConsensusEps = round2((nextAlphaEps + nextBetaEps + nextGammaEps) / 3);

      const nextQuarterBaseRev = newRevenue * (1 + sec.growthRate / 4);
      const alphaRev = round1(nextQuarterBaseRev * 0.98);
      const betaRev = round1(nextQuarterBaseRev * 1.02);
      const gammaRev = round1(nextQuarterBaseRev * 1.06);
      const newConsensusRev = round1((alphaRev + betaRev + gammaRev) / 3);

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
    const newStockPrice = isDefaulted ? 0.0 : Math.max(0, round2(L8.stockPrice[row]));
    // IND7: the antitrust clock. It counts UP while this firm is dominant in some category it
    // sells into and resets when it is not, so the consequence attaches to a sustained position
    // rather than one good quarter.
    const newAntitrustWeeks = peakCategoryShare({ productLines: updatedProductLines }) >= ANTITRUST_SHARE_THRESHOLD
      ? (comp.antitrustWeeksAboveThreshold ?? 0) + 1
      : 0;

    // IDX: beta is measured off this name's own cleared returns against its region's index —
    // both series this model publishes every week — instead of being read from its sector label.
    const newBeta = isPubliclyListed(comp)
      ? measureBeta(ringFill(v2.priceRing, rowOf(v2, L8.companyId[row]), priceScratch), regionIndexOf(state.compositeIndices, L8.region[row]).historical, Number.isNaN(L8.beta[row]) ? 1 : L8.beta[row])
      : (Number.isNaN(L8.beta[row]) ? 1 : L8.beta[row]);
    const newForwardPE = newEps > 0 ? round2(newStockPrice / newEps) : comp.forwardPE;
    // The book-value x cycle-P/B branch that used to price banks and institutions here is GONE.
    // It was the last formula price setter for a listed cohort: a multiple looked up from the
    // cycle regime, applied to a book value, dividing into a share count — everything WS4 removed
    // from every other name. They clear in 07e now, on their own real earnings and their own real
    // balance-sheet equity, so this stage reads their price exactly as it reads everyone else's.


    // CASH — the corporate treasury book. It is not decided here any more.
    //
    // What this replaces: the block that stood here compared a target sleeve to the current book
    // and closed the gap by MINTING the paper — `treasuryHoldings.push(...)` against an UNMODELED
    // payer — or by scaling every row down and taking cash from the same nowhere. It was a
    // holding decided by a formula and a purchase with no seller, which is rule 13 and rule 1 in
    // one block. 07f runs the treasurer's bid through the bill auction against real sellers
    // (domain/company.ts owns the sleeve arithmetic), and this stage now simply carries what
    // that auction filled.
    const newTreasuryHoldings = weekUpdate?.treasuryHoldings ?? comp.treasuryHoldings ?? [];

    // Buyback Execution (Part AH)
    let updatedSharesOutstanding = L8.sharesOutstanding[row];
    const targetCashBuffer = Math.max(10, L8.currentLiabilitiesUSD[row] * 1.5);
    const excessCash = Math.max(0, cash.usd - targetCashBuffer);
    const debtToEquity = newTotalDebt / Math.max(1, (newStockPrice * L8.sharesOutstanding[row]));
    // IND-R6: public-only — retiring shares into the market needs a market to retire them into.
    // A private firm's distributions to its owners are HC's sponsor machinery, not a buyback.
    if (L8.publiclyListed[row] === 1 && excessCash > 5 && debtToEquity < 0.6 && L8.sharesOutstanding[row] > 10 && !isDefaulted && newStockPrice > 0) {
      const estimatedBookValuePerShare = Math.max(0.5, (cash.usd + newRevenue * 0.8 - newTotalDebt) / L8.sharesOutstanding[row]);
      // "Cheap" against the same arithmetic the market itself prices this company with (07e /
      // equity-valuation.ts), at the board's own cost of capital — not against a sector P/E
      // table. A board that buys back stock is taking the other side of that auction, so it has
      // to be reading the same book; comparing to a multiple the market no longer uses would be
      // two valuations of one company again.
      const boardFairValuePerShare = companyFairValuePerShare(
        { ...comp, netIncome: newNetIncome, cash: cash.usd },
        reg.zeroRates?.tenor10Y ?? reg.policyRate,
        REPRESENTATIVE_HOLDER_REQUIRED_RETURN,
        newTotalDebt
      );
      const isCheap = newStockPrice < estimatedBookValuePerShare || newStockPrice < boardFairValuePerShare * 0.95;
      const buybackShare = isCheap ? 0.60 : 0.25;
      const buybackSpendM = (excessCash * 0.05 / 52) * buybackShare;
      const sharesToRetire = Math.min(L8.sharesOutstanding[row] * 0.005, buybackSpendM / Math.max(0.1, newStockPrice));
      if (sharesToRetire > 0.001) {
        updatedSharesOutstanding = Math.max(1.0, L8.sharesOutstanding[row] - sharesToRetire);
        buybacksThisWeek = sharesToRetire * newStockPrice;
        // §5-CLOSE O2: the retired shares LEAVE THE REGISTER, pro rata to every holder (the
        // float included, through the paying agent's denominator) — the issue and the register
        // move by one ratio. This call was missing: shares outstanding fell every buyback while
        // the register kept every share, and the difference was stock nobody had issued.
        settleCorporateActionOnHolders(ctx, L8.companyId[row], 'EQUITY', L8.sharesOutstanding[row], updatedSharesOutstanding);
        // The shares retire through the EQUITY register below; the money reaches the same holders
        // of record, pro rata, instead of the boundary.
        post('share buybacks', -buybacksThisWeek, undefined, false);
        payHoldersCash(ctx, L8.companyId[row], 'EQUITY', buybacksThisWeek);
      }
    }
    const newMarketCap = Math.round((newStockPrice * updatedSharesOutstanding));
    const newSeniorBondYield = reg.zeroRates.tenor5Y + newOasBps / 10000;

    const quarterIdx = Math.floor((nextWeek - 1) / 13) + 4;
    const prevSnapshot = comp.historicalFundamentals ? comp.historicalFundamentals[comp.historicalFundamentals.length - 1] : undefined;
    const currentTreasuryHoldingsUSD = (newTreasuryHoldings || [])
      .reduce((s: number, h: { quantityOrNotionalUSD: number }) => s + h.quantityOrNotionalUSD, 0);
    // Real current-portion-of-debt: tranches actually maturing within a year, from this
    // company's own updated ladder — not a flat 15% guess.
    // Settle this week's corporate actions against the real holders of this issuer's paper. A
    // tranche that matured has left the issuer's books, so it leaves theirs; one that refinanced
    // into the other rate type has moved between the bond market and the loan market, so their
    // position moves with it. Holdings that do not track the real stock are the difference
    // between a market and a random walk — see settleCorporateActionOnHolders.
    let postActionFixedUSD = 0, postActionFloatingUSD = 0, shortTermDebtSumUSD = 0;
    for (const r of rowList) {
      const fl = TS.flags[r];
      if (!(fl & TR_FLOATING)) { if (!(fl & TR_CP)) postActionFixedUSD += TS.principalUSD[r]; }
      else if (!(fl & TR_FACILITY)) postActionFloatingUSD += TS.principalUSD[r];
      if (TS.maturityWeek[r] - nextWeek <= 52) shortTermDebtSumUSD += TS.principalUSD[r];
    }
    settleCorporateActionOnHolders(ctx, L8.companyId[row], 'CORP_BOND', preActionFixedUSD, postActionFixedUSD);
    settleCorporateActionOnHolders(ctx, L8.companyId[row], 'LEVERAGED_LOAN', preActionFloatingUSD, postActionFloatingUSD);
    // The premium the issuer's ledger just posted out reaches the holders of record — the whole
    // reason call protection changes anything is that the money goes to the lender.
    payHoldersCash(ctx, L8.companyId[row], 'CORP_BOND', bondCallPremiumUSD);
    payHoldersCash(ctx, L8.companyId[row], 'LEVERAGED_LOAN', loanCallPremiumUSD);

    const newShortTermDebtUSD = shortTermDebtSumUSD;

    // SCALE — the filing is BUILT only in the week it is FILED. The builder is pure arithmetic
    // and `currentSnapshot` had exactly one consumer, the reporting-week append below; building
    // it the other twelve weeks was a ~30-field object plus two inventory walks per firm for
    // the garbage collector. Same floats on every reporting week (prevSnapshot chains only
    // through reporting weeks in both worlds).
    const histFundamentals = (() => {
      if (!isReportingThisWeek) return comp.historicalFundamentals || [];
      const currentSnapshot = buildQuarterlyFundamentalSnapshot(
        nextWeek,
        formatQuarterFilingDate(quarterIdx),
        formatSimulationDate(nextWeek),
        newRevenue,
        newEbitda,
        newNetIncome,
        newEps,
        cash.usd,
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
        totalInputValueUSD(v2, L8.companyId[row])
      );
      return [...(comp.historicalFundamentals || []).slice(-7), currentSnapshot];
    })();

    const systemicStressFactor = systemicStressFactorGlobal + Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.3;
    // G5: the baseline drifts toward what this REGION's workouts have actually recovered, not
    // toward a prior nobody measured. And the 0.10 floor is gone with the mechanism that
    // justified it — recovery is what selling real assets against real claims produces, and if
    // that is near zero for an issuer with nothing to sell, that is the answer (rule 2).
    const regionRecovery = creditRecoveryRate(reg);
    const newBaselineRecoveryRate = round4((comp.baselineRecoveryRate ?? regionRecovery) * 0.998 + regionRecovery * 0.002);
    const effectiveRecoveryRate = Math.max(0, newBaselineRecoveryRate * (1 - systemicStressFactor));
    const trendWeeklyGrowth = (reg.potentialGdpGrowth + reg.targetInflation) / 52;
    const newBaselineAnnualRevenue = isDefaulted
      ? round1(L8.baselineAnnualRevenueUSD[row] * 0.995)
      : round1(L8.baselineAnnualRevenueUSD[row] * (1 + trendWeeklyGrowth));

    // §4.C II.5 — the `|| [newRevenue]` fallback only ever produced a length-1 history, whose
    // fold is 0 exactly like an empty one: the ring length decides alone.
    const rvRow2 = rowOf(d.v2, L8.companyId[row]);
    const rvLen2 = revHistLen(d.v2, rvRow2);
    let calculatedRevVol = 0;
    if (rvLen2 > 2) {
      let sum2 = 0;
      for (let i = 0; i < rvLen2; i++) sum2 += revHistAt(d.v2, rvRow2, i);
      const meanRev = sum2 / rvLen2;
      if (meanRev > 0) {
        let var2 = 0;
        for (let i = 0; i < rvLen2; i++) var2 += Math.pow(revHistAt(d.v2, rvRow2, i) - meanRev, 2);
        calculatedRevVol = Math.sqrt(var2 / rvLen2) / meanRev;
      }
    }
    const calculatedSegmentFinancials: SegmentFinancial[] = (updatedProductLines || []).map(line => {
      const share = line.revenueShare || 1.0;
      return {
        subUnitId: line.subUnitId,
        revenueUSD: Math.round((newRevenue * share)),
        ebitdaUSD: Math.round((newEbitda * share)),
        capexUSD: Math.round((newCapex * share)),
      };
    });

        // WS7: the treasury sweep — the week's LAST ledger entry, after every operating and
    // financing flow has posted. Cash above the company's own working-capital need buys money
    // fund shares at the $1 NAV; cash below it redeems, bounded by the fund's real available
    // cash this week. The sweep only ever moves the EXCESS, so it cannot push a company toward
    // the default trigger; a redemption arriving the week after distress began is the real
    // T+1 of a treasury pulling money home.
    let newMmfSharesUSD = comp.mmfSharesUSD ?? 0;
    // §5-MNC — REPATRIATION IS THE SUBSIDIARY'S TREASURY SWEEP. A wholly-owned sub's excess
    // cash belongs to the parent, not to a money fund: the same above-the-buffer excess the
    // sweep below would move goes home instead, as a real cross-border payment through the same
    // settlement/FX path as every other. (The dividend path cannot serve here: a private sub
    // has no market cap for a declared yield to price, and its holder of record IS the parent.)
    if (comp.parentTicker && !isDefaulted) {
      const bufferUSD = L8.annualRevenueUSD[row] * TREASURY_OPERATING_BUFFER_SHARE_OF_REVENUE * L8.mgmtRiskAversion[row];
      const excessUSD = Math.max(0, cash.usd - bufferUSD);
      if (excessUSD > 1e6) {
        post('subsidiary excess cash repatriated to the parent', -excessUSD,
          { kind: 'COMPANY', ticker: comp.parentTicker });
      }
    }
    if (!comp.isBankEntity && !comp.isInstitutionalEntity && !isDefaulted && comp.listingStatus !== 'PRIVATE') {
      const sweep = corporateSweepDecision(comp, cash.usd, mmfSweepBooks.get(L8.region[row]));
      if (sweep.cashDeltaUSD !== 0) {
        // The counterparty is a named fund that exists — routing it to the boundary would have
        // the fund credited by its own stage AND the money appear at the boundary, which creates
        // it (measured: 64B over 12 weeks; the bank identity could not see it because the
        // institutional sector is not in the settlement layer yet).
        const sweepFund = findRegionMmf(ctx.updatedInstitutionalEntities, L8.region[row]);
        post(sweep.cashDeltaUSD < 0 ? 'treasury sweep into money fund shares' : 'money fund share redemption',
          sweep.cashDeltaUSD,
          sweepFund ? { kind: 'INSTITUTION', id: sweepFund.id } : undefined);
        newMmfSharesUSD = Math.max(0, newMmfSharesUSD + sweep.shareDeltaUSD);
      }
      if (sweep.shareDeltaUSD !== 0) d.onSweepDelta?.(row, sweep.shareDeltaUSD);
    }

    // SCALE: same in-place assignment as the private path above — see that comment.
    // SCALE: WRITTEN, NOT ASSIGNED. This was `Object.assign(comp, { ...72 fields })`, which
    // allocates a fresh 72-property object for every company every week and throws it away the
    // instant its contents have been copied one field at a time into `comp`. The copy is the same
    // work either way; the object is pure waste. `Object.assign` writes own enumerable properties
    // in source order, so writing them in that same order here is the identical mutation.
    comp.revenueVolatility = round4(calculatedRevVol);

    comp.segmentFinancials = calculatedSegmentFinancials;

    comp.forwardPE = newForwardPE;

    comp.baselineRecoveryRate = newBaselineRecoveryRate;

    comp.baselineDividendYield = newBaselineDividendYield;

    comp.previousEmployeeCount = L8.employeeCount[row];

    comp.accruedTaxLiabilityUSD = Math.round(accruedTaxUSD);

      // HH6: the wage this firm offers and the hiring difficulty behind it are the labor
      // market stage's decisions — carried through explicitly, like employeeCount above,
      // because this stage rebuilds the company from a fixed field list and anything not
      // named here is silently dropped (which is exactly what happened first time).
    comp.offeredWageIndex = weekUpdate?.offeredWageIndex ?? comp.offeredWageIndex ?? 1.0;
    comp.expectedEbitdaUSD = weekUpdate?.expectedEbitdaUSD ?? comp.expectedEbitdaUSD;
    // §7.345 — last week's sales by line, for next week's production decision (no update = no sales).
    comp.lastWeekSalesUnitsBySubUnit = weekUpdate?.salesUnitsBySubUnit ?? {};

    comp.unfilledVacancyShare = weekUpdate?.unfilledVacancyShare ?? comp.unfilledVacancyShare ?? 0;

    comp.previousCapex = L8.capexUSD[row];

    comp.maintenanceCapex = round1(newMaintenanceCapex);

    comp.growthCapex = round1(newGrowthCapex);

    comp.grossPPEUSD = round1(newGrossPPEUSD);

      // IND1: read by stage 05's capacity growth — real net investment is what arrived.
      // IND13 — the plant grew by what entered service. Both lines are named on the rebuild
      // because a fixed field list drops what it does not name (§7.41), and a dropped
      // construction queue is capital that arrives and then never exists.
    comp.capexCommissionedLastWeekUSD = round1(capexCommissionedThisWeekUSD);

    comp.assetsUnderConstruction = stillUnderConstruction;

    comp.accumulatedDepreciationUSD = round1(newAccumulatedDepreciationUSD);

    comp.rndExpense = round1(newRndExpense);

    comp.maintenanceShortfallStreak = newMaintenanceShortfallStreak;

    comp.executionQuality = round3(newExecutionQuality);

    comp.occupationMixDrift = newOccupationMixDrift;

    comp.inputSupplyConstraintFactor = round4(newInputSupplyConstraintFactor);

    comp._targetProductionUSD = (weekUpdate?._targetProductionUSD ?? targetProductionUSD);

    comp.lastWeekSalesUSD = update?.salesUSD ?? 0;

    comp.lastWeekPurchasesUSD = update?.purchasesUSD ?? 0;

      // Start from this company's carrying-cost-decayed baseline (every sub-unit it held
      // inventory for), then overlay whatever stage 05 settled fresh this week for the
      // sub-units it actually processed (it runs first and has the complete, real
      // production/sales picture for those lines).
    comp.outputInventoryBySubUnit = { ...newOutputInventoryBySubUnit, ...(update?.outputInventoryBySubUnit || {}) };

      // IND10 — the production pipeline stage 05 advanced. Named here because a rebuild from a
      // fixed field list silently drops whatever it does not name (§7.41), and a dropped
      // pipeline is a firm whose half-built output vanishes every week.
    comp.wipBySubUnit = update?.wipBySubUnit ?? comp.wipBySubUnit;

    comp.recentFulfillmentEMA = round4(newRecentFulfillmentEMA);

      // IND14 — the delivery record, smoothed slowly onto the firm. A week in which this
      // supplier owed nothing tells us nothing, so it leaves the record where it was.
    comp.deliveryReliability = round4((() => {
        const owed = update?._contractOwedUnits ?? 0;
        const prior = comp.deliveryReliability ?? 1;
        if (!(owed > 0)) return prior;
        const shipped = update?._contractDeliveredUnits ?? 0;
        return prior * 0.9 + Math.max(0, Math.min(1, shipped / owed)) * 0.1;
      })());

    comp.recurringRevenueBaseUSD = newRecurringBaseUSD === undefined
        ? undefined : Math.round(newRecurringBaseUSD);

    comp.employeeCount = isDefaulted ? 0 : newEmployeeCount;

    comp.recoveryRate = round3(effectiveRecoveryRate);

    commitLadder(v2, { id: L8.companyId[row], ticker: L8.ticker[row], region: L8.region[row] }, rowList);

    comp.productLines = updatedProductLines;


    comp.dividendYield = round4(newDividendYield);

    comp.capex = round1(newCapex);

    comp.annualRevenue = round1(newRevenue);

    comp.baselineAnnualRevenue = newBaselineAnnualRevenue;

    comp.ebitda = round1(newEbitda);

    // §7.246 — the week's two measured cost lines, persisted for stage 05's floor decomposition.
    comp.payrollWeeklyUSD = round1(weeklyPayrollUSD);
    comp.realInputConsumptionCostWeeklyUSD = round1(measuredInputConsumptionWeeklyUSD);

    comp.ebit = round1(newEbit);

    comp.netIncome = round1(newNetIncome);

    comp.eps = newEps;

    comp.sharesOutstanding = round3(updatedSharesOutstanding);

      // Wall Street Phase 1: real per-bank balance sheet computed this week in
      // 02b-bank-diversification.ts (which runs before this stage), carried forward otherwise.
    comp.bankBalanceSheet = weekUpdate?.bankBalanceSheet ?? comp.bankBalanceSheet;
    // §7.235: seven `comp.x = comp.x` lines were removed here. They were pass-throughs in the
    // object literal this block used to be — meaningful when building a NEW object, no-ops once
    // §7.230 converted it to direct assignment on `comp` itself. The linter found them on its first
    // run, which is the argument for having one: a mechanical refactor leaves mechanical residue,
    // and nothing else in this repo was looking.







      // SETL2: `cash` is NOT written here any more. Every flow above was recorded as a payment
      // instruction and the settlement stage (which runs immediately after this one) applies the
      // net to this company's balance AND to its bank's deposits and reserves. One mover.
      // `newCash` above stays the stage's own running view, which is what settlement will produce.
    comp.mmfSharesUSD = newMmfSharesUSD;

    comp.lastOpportunisticOfferingWeek = newLastOpportunisticOfferingWeek;

    comp.lastCashLedger = retainCashLedger ? cashLedger : undefined;

    comp.leverage = newLeverage;

    comp.interestCoverage = newCoverage;

    comp.creditRating = newRating;

    v2.ratingRing = ringPush(v2.ratingRing, rowOf(v2, L8.companyId[row]), ratingCodeOf(newRating));

    comp.historicalFundamentals = histFundamentals;

    comp.isDefaulted = isDefaulted;

    comp.stockPrice = newStockPrice;

    comp.beta = newBeta;

    comp.antitrustWeeksAboveThreshold = newAntitrustWeeks;

    v2.priceRing = ringPush(v2.priceRing, rowOf(v2, L8.companyId[row]), newStockPrice);


    comp.oasSpreadBps = newOasBps;

    comp.cdsSpreadBps = newCdsSpreadBps;

    comp.seniorBondYield = newSeniorBondYield;

    comp.reportedThisWeek = isReportingThisWeek;

    comp.lastEarningsReportWeek = isReportingThisWeek ? nextWeek : comp.lastEarningsReportWeek;

    comp.dealerConsensus = updatedConsensus;

    comp.lastEarningsSurprisePct = lastEarningsSurprisePct;

    comp.lastManagementCommentary = lastManagementCommentary;

      // Already real and already-cleared (07d-leveraged-loan-clearing.ts) — passed through as-is.

    comp.treasuryHoldings = newTreasuryHoldings;
    if (S08K_PROF) s08k.tail += performance.now() - __k3;
    return comp;
  };
}
