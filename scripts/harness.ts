/**
 * THE HARNESS — the one test script (§1.10). One simulation run; every check, battery and
 * profile reads it. Prints one line per week so a run can be watched live.
 *
 *   npm run verify                    # hygiene + this, 60 weeks (~1 min)
 *   WEEKS=10 SHOCKS=0 npm run verify  # quick wiring probe
 *   WEEKS=260 npm run verify          # section close — ASK FIRST (§1.10)
 *   npm run profile                   # same run with per-stage timings (PROFILE=1)
 *   VERBOSE=1 npm run verify          # full violation dump at the end, not just the summary
 *
 * HOW TO ADD A CHECK OR A MEASUREMENT: add one entry to MODULES below — `week()` for a per-week
 * invariant (push into `violations`), `report()` for end-of-run measured numbers (the battery
 * pattern: report, judge nothing), `shock()` for an A/B test against the mid-run snapshot.
 * Do not add a second script; scripts/check-hygiene.sh fails the build if one appears.
 *
 * Violations print inline the week they happen (capped per week), and the end prints a grouped
 * summary. Exit code 1 on any violation.
 */
import { createInitialGameState } from '../src/engine/simulation/initialization';
import { DEFAULT_SIMULATION_SEED, setRngState, getRngState } from '../src/engine/rng';

// Same seed, same world. Pass SEED=<n> to check a result against a genuinely different economy
// rather than against the noise an unseeded run used to produce.
const SEED = Number(process.env.SEED ?? DEFAULT_SIMULATION_SEED);

// How long to run. 60 weeks is the working default — every real finding in this project has come
// from the first sixty, and a change can be checked in a minute instead of half an hour. The full
// 260-week run belongs at the close of a section: WEEKS=260 npm run verify (ask first, §1.10).
const WEEKS = Number(process.env.WEEKS ?? 60);
/** A/B mechanism tests (extra simulations). On by default; SHOCKS=0 for fast iteration. */
const SHOCKS = process.env.SHOCKS !== '0';
/** PROFILE=1: per-stage timings on the same run, reported at the end. */
const PROFILE = process.env.PROFILE === '1';
/** VERBOSE=1: dump every violation at the end (they also print live, capped per week). */
const VERBOSE = process.env.VERBOSE === '1';

import { advanceWeeklyStep, advanceWeeklyStepProfiled } from '../src/engine/simulation/core';
import { GameState, RegionId, Position } from '../src/types';
import { executeTrade } from "../src/engine/simulation/trade";
import { isPubliclyListed, isActiveCompany } from '../src/domain/company';
import { sovereignCouponByBucket, weeklyInterestExpenseUSD, decomposeGovernmentSpending } from '../src/domain/government';
import { centralBankAssetsUSD, centralBankFxReservesUSD } from '../src/domain/central-bank';
import { GOV_PROCUREMENT_SHARE_OF_SPENDING } from '../src/engine/bootstrap/national-accounts';
import { sovBucketKey } from '../src/engine/simulation/stages/shared-helpers';
import { INDUSTRY_SUBUNITS } from '../src/domain/industry';
import { SUBUNIT_PHYSICAL, deliveryModeOf } from '../src/domain/goods-physical';
import { laneDistanceNm } from '../src/domain/geography';
import { laneKey, laneTransitWeeks } from '../src/domain/carrier';
import { isCarrier } from '../src/engine/simulation/stages/freight-clearing';
import { getFxToUsd } from '../src/engine/simulation/stages/06-fx-and-trade';

interface Violation {
  week: number;
  message: string;
}

const violations: Violation[] = [];
let damperBindStreak = new Map<string, number>();
const damperPersistentBinds = new Set<string>();
let damperWorstStreak = 0;
let prevStateForBookCheck: GameState | null = null;

// ---- shared helpers (used by checks, modules and the live line) ----
const REGIONS: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
const B = (x: number) => (x / 1e9).toFixed(1) + 'B';
const pct = (x: number) => (x * 100).toFixed(2) + '%';
const corr = (a: number[], b: number[]) => {
  const n = Math.min(a.length, b.length);
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let s = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; da += x * x; db += y * y; }
  return s / Math.sqrt(Math.max(1e-12, da * db));
};
const spearman = (a: number[], b: number[]) => {
  const rank = (arr: number[]) => {
    const idx = arr.map((v, i) => [v, i] as [number, number]).sort((x, y) => x[0] - y[0]);
    const out = new Array(arr.length);
    idx.forEach(([, i], k) => { out[i] = k; });
    return out;
  };
  const ra = rank(a), rb = rank(b), n = a.length;
  if (n < 3) return NaN;
  const d2 = ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
};
const clone = (s: GameState): GameState => structuredClone(s);

/**
 * Securities do not change hands for free. Every fill in a clearing stage has a cash leg, so an
 * institution's book — its cash plus the market value of what it holds — can only change by the
 * bid/ask it paid the dealer and by whatever real income or redemption it received. It cannot
 * simply grow because the clearing engine handed it more securities.
 *
 * This is the check that keeps the cash settlement honest: before it existed, holdings changed
 * every week with nothing on the other side of the trade, and no test would have noticed.
 * The tolerance is per-week and generous enough to cover real dealer spread and coupon/redemption
 * flows while still catching a leg that is missing entirely.
 */
/**
 * S7: the one-ledger conservation check. Every dollar of an instrument is held by exactly one of
 * the real books, or sits with the passive share the model does not yet name as holders
 * (households, foreign, central bank — the complement of the tradable share, which retires when
 * MS and WS9 land). Overshoot is the failure that matters: if the real books together claim MORE
 * than the instrument's outstanding, some formula is minting claims.
 */
function checkHoldingsLedgerConservation(state: GameState, week: number): Violation[] {
  const out: Violation[] = [];
  (['USA', 'EUR', 'UK', 'JPN'] as const).forEach(regionId => {
    const reg: any = (state as any).regions[regionId];
    const cos = state.companies.filter((c: any) => c.region === regionId && !c.isDefaulted && !c.mergerAcquired);
    const fixedOutstanding = cos.reduce((a: number, c: any) =>
      a + (c.debtTranches || []).filter((t: any) => t.rateType === 'FIXED').reduce((x: number, t: any) => x + t.principalUSD, 0), 0);
    const floatOutstanding = cos.reduce((a: number, c: any) =>
      a + (c.debtTranches || []).filter((t: any) => t.rateType === 'FLOATING').reduce((x: number, t: any) => x + t.principalUSD, 0), 0);
    const sovOutstanding = (reg.govDebtTranches || []).reduce((a: number, t: any) => a + t.principalUSD, 0);

    let heldCorp = 0, heldLoan = 0, heldSov = 0;
    state.institutionalEntities.forEach((e: any) => {
      if (e.region !== regionId) return;
      e.itemizedHoldings.forEach((h: any) => {
        const v = h.quantityOrNotionalUSD ?? 0;
        if (h.instrumentType === 'CORP_BOND') heldCorp += v;
        else if (h.instrumentType === 'LEVERAGED_LOAN') heldLoan += v;
        else if (h.instrumentType === 'GOV_BOND') heldSov += v;
      });
    });
    state.companies.forEach((c: any) => {
      if (c.region !== regionId || !c.bankBalanceSheet) return;
      heldSov += (Object.values(c.bankBalanceSheet.sovereignBondHoldingsByTenor || {}) as any[])
        .reduce((a: number, v: any) => a + (Number(v) || 0), 0);
    });
    (reg.bankingSector.corpBondDealerInventory || []).forEach((p: any) => { heldCorp += p.inventoryUSD; });
    (reg.bankingSector.loanDealerInventory || []).forEach((p: any) => { heldLoan += p.inventoryUSD; });

    const cases: [string, number, number][] = [
      ['corporate bonds', heldCorp, fixedOutstanding],
      ['leveraged loans', heldLoan, floatOutstanding],
      ['sovereign bonds', heldSov, sovOutstanding],
    ];
    cases.forEach(([label, held, outstanding]) => {
      if (outstanding <= 0) return;
      if (held > outstanding * 1.02) {
        out.push({
          week,
          message: `${regionId} ${label}: real books hold ${(held / 1e9).toFixed(1)}B against ${(outstanding / 1e9).toFixed(1)}B outstanding (${((held / outstanding - 1) * 100).toFixed(1)}% over) — a ledger is minting claims`
        });
      }
    });
  });
  return out;
}

function checkInstitutionalBookConservation(prev: GameState, state: GameState, week: number) {
  // The 5% band asserts a CLOSED book: securities and cash trade against each other, so the
  // total moves only by marks and small boundary flows. MMFs and ETFs are excluded because
  // their books are externally funded BY DESIGN — a subscription grows assets and the share
  // liability together (HH3 made this bind: AP capacity runs off real bank equity, so the
  // funds fill at the real pipe's speed) — and for the money fund the sharper identity is
  // asserted below instead: a $1-NAV book equals its shares outstanding.
  const bookOf = (s: GameState, region: RegionId) =>
    (s.institutionalEntities || [])
      .filter((e) => e.region === region && !e.isDefaulted
        && e.entityType !== 'MONEY_MARKET_FUND' && e.entityType !== 'ETF')
      .reduce(
        (sum, e) =>
          sum + (e.cashUSD ?? 0) + ((e as any).repoLentUSD ?? 0) + e.itemizedHoldings.reduce((x, h) => x + h.quantityOrNotionalUSD, 0),
        0
      );

  (['USA', 'UK', 'JPN', 'EUR'] as RegionId[]).forEach((region) => {
    const before = bookOf(prev, region);
    const after = bookOf(state, region);
    if (!(before > 0)) return;
    const changePct = Math.abs(after - before) / before;
    if (changePct > 0.05) {
      violations.push({
        week,
        message:
          `Institutional book in ${region} moved ${(changePct * 100).toFixed(1)}% in one week ` +
          `(${(before / 1e9).toFixed(1)}B -> ${(after / 1e9).toFixed(1)}B). Securities and cash ` +
          `must move together — check that every clearing stage applies netCashDeltaByParticipantId.`,
      });
    }
    // The money fund's own conservation: everything it holds is owed to its shareholders at
    // the stable $1 NAV, so book and shares may drift apart only by the week's accruals.
    (state.institutionalEntities || [])
      .filter((e) => e.region === region && !e.isDefaulted && e.entityType === 'MONEY_MARKET_FUND')
      .forEach((mmf) => {
        const bookUSD = (mmf.cashUSD ?? 0) + ((mmf as any).repoLentUSD ?? 0)
          + mmf.itemizedHoldings.reduce((x, h) => x + h.quantityOrNotionalUSD, 0);
        const sharesUSD = mmf.mmfSharesOutstandingUSD ?? 0;
        if (sharesUSD > 1e9 && Math.abs(bookUSD - sharesUSD) / sharesUSD > 0.02) {
          violations.push({
            week,
            message: `${region} money fund book ${(bookUSD / 1e9).toFixed(1)}B departs its $1-NAV share liability ${(sharesUSD / 1e9).toFixed(1)}B by more than 2% — a subscription or redemption moved only one side`,
          });
        }
      });
  });
}

/**
 * HH1: every institutional liability to a beneficiary is somebody's asset, and every household
 * claim is somebody's liability. Insurers' reserves, pension entitlements and fund shares were
 * 740B of assets with no holder before this — the same real thing represented once instead of
 * twice (§7.48) — so the two sides are now checked against each other every week.
 */
/**
 * HH4: the household cohorts are a DECOMPOSITION, not a second household sector. Their summed
 * disposable income must equal the region's aggregate to floating precision (the builder
 * constructs the identity; this catches any edit that breaks the construction), their summed
 * savings must sit on the aggregate behavioural rate (loose band — the per-cohort 90% cap can
 * bind in stressed worlds), and the derived spend shares must be a partition.
 */
/**
 * HH5: employment has ONE representation — the sum of what real employers carry on their books.
 * The occupation pools are a view of that sum and must agree with it, and the unemployment rate
 * must be the reading of the same stock. Before HH5 there were three disagreeing numbers (a
 * GDP-gap formula at 4.5%, a dead bottom-up field at 37%, and pool-implied 8-17%).
 */
/** PUB2: the central bank's balance sheet must close — assets = reserves + TGA + currency,
 * with the named unbacked residual. And the TGA is a real account: it may not go negative. */
function checkCentralBankIdentity(state: GameState, week: number) {
  (['USA', 'UK', 'JPN', 'EUR'] as RegionId[]).forEach((region) => {
    const cb = state.regions[region]?.centralBankSheet;
    if (!cb) return;
    const reserves = state.companies
      .filter((c) => c.region === region && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet)
      .reduce((a, c) => a + c.bankBalanceSheet!.cashReservesUSD, 0);
    // XB5: the asset side is the sovereign book PLUS the FX reserves. Leaving the reserves out
    // here while the engine counts them made the identity fail by exactly their size — 231 of
    // 273 violations at the XB close, and a harness bug rather than an engine one.
    const sovereignBook = Object.values(cb.sovereignHoldingsByTenor || {}).reduce((a, v) => a + (Number(v) || 0), 0);
    const fxBook: Record<string, number> = (cb as any).fxReservesByRegion ?? {};
    const fxReserves = Object.keys(fxBook).reduce((a, k) => a + (Number(fxBook[k]) || 0), 0);
    const assets = sovereignBook + fxReserves;
    const residual = assets - (reserves + cb.treasuryAccountUSD + cb.currencyInCirculationUSD) + cb.unbackedBankCashUSD;
    if (assets > 0 && Math.abs(residual) / assets > 1e-3) {
      violations.push({
        week,
        message: `${region} central bank balance sheet does not close: ${(residual / 1e9).toFixed(2)}B against ${(assets / 1e9).toFixed(1)}B of assets`,
      });
    }
    if (cb.treasuryAccountUSD < 0) {
      violations.push({
        week,
        message: `${region} treasury account is negative (${(cb.treasuryAccountUSD / 1e9).toFixed(2)}B) — the government spent money it had not financed`,
      });
    }
    // PUB2b: the book may only move by redemption and by fills against an order it actually
    // placed. A week whose fill exceeds the order is the auction handing the central bank paper
    // it never bid for — the forced-placement failure mode, in the other direction.
    const orderedUSD = cb.lastOrderPlacedUSD ?? 0;
    const filledUSD = cb.lastOpenMarketPurchasesUSD ?? 0;
    if (filledUSD > 0 && orderedUSD > 0 && filledUSD > orderedUSD * 1.01 + 1e6) {
      violations.push({
        week,
        message: `${region} central bank filled ${(filledUSD / 1e9).toFixed(2)}B against an order of ${(orderedUSD / 1e9).toFixed(2)}B`,
      });
    }
    if (Object.values(cb.sovereignHoldingsByTenor || {}).some((v) => (Number(v) || 0) < -1)) {
      violations.push({ week, message: `${region} central bank holds a negative position` });
    }
    // PUB1e: the government cannot buy more than it appropriated, and what left the account is
    // exactly interest + transfers + what it actually bought.
    const reg = state.regions[region] as any;
    const outlays = reg.governmentOutlaysUSD;
    if (outlays !== undefined) {
      const spent = reg.governmentProcurementSpentUSD ?? 0;
      const unspent = reg.unspentProcurementBudgetUSD ?? 0;
      if (spent > 0 && outlays > reg.governmentSpendingUSD * 1.5) {
        violations.push({
          week,
          message: `${region} government outlays ${(outlays / 1e9).toFixed(2)}B exceed its budget ${(reg.governmentSpendingUSD / 1e9).toFixed(2)}B by more than the stance allows`,
        });
      }
      if (spent < 0 || unspent < 0) {
        violations.push({ week, message: `${region} government procurement is negative` });
      }
    }
  });
}

function checkLaborMarketIdentity(state: GameState, week: number) {
  (['USA', 'UK', 'JPN', 'EUR'] as RegionId[]).forEach((region) => {
    const reg = state.regions[region];
    if (!reg?.occupationPools) return;
    const employerHeadcount = state.companies
      .filter((c) => c.region === region && isActiveCompany(c))
      .reduce((a, c) => a + Math.max(0, c.employeeCount), 0)
      + (reg.smePools || []).reduce((a, s) => a + Math.max(0, s.employment), 0)
      + reg.governmentEmployment;
    const poolEmployed = Object.values(reg.occupationPools).reduce((a: number, p: any) => a + (p.employed ?? 0), 0);
    // Tight band (0.2%): the pools are DERIVED from this exact sum by the end-of-week
    // reconciliation, so only integer rounding across five occupations should separate them.
    // Anything wider means they have started evolving as a second stock again.
    if (employerHeadcount > 0 && Math.abs(poolEmployed - employerHeadcount) / employerHeadcount > 0.002) {
      violations.push({
        week,
        message: `${region}: occupation pools hold ${(poolEmployed / 1e6).toFixed(2)}M against employers' ${(employerHeadcount / 1e6).toFixed(2)}M — employment is being kept in two places`,
      });
    }
    const laborForce = reg.totalPopulation * (1 - (reg.nonEmployablePct ?? 0.35)) * reg.laborForceParticipation;
    const impliedU = laborForce > 0 ? (laborForce - poolEmployed) / laborForce : 0;
    if (Math.abs(impliedU - reg.unemploymentRate) > 0.005) {
      violations.push({
        week,
        message: `${region}: reported unemployment ${(reg.unemploymentRate * 100).toFixed(2)}% is not the reading of its own employment stock (${(impliedU * 100).toFixed(2)}%)`,
      });
    }
    if (reg.unemploymentRate < 0.005 || reg.unemploymentRate > 0.30) {
      violations.push({
        week,
        message: `${region}: unemployment ${(reg.unemploymentRate * 100).toFixed(2)}% out of band [0.5%, 30%] — the matching function or the seed reconciliation is broken`,
      });
    }
  });
}

function checkHouseholdCohortIdentity(state: GameState, week: number) {
  (['USA', 'UK', 'JPN', 'EUR'] as RegionId[]).forEach((region) => {
    const reg = state.regions[region];
    const hs = reg?.householdState;
    const cohorts = hs?.cohorts;
    if (!hs || !cohorts || cohorts.length === 0) {
      violations.push({ week, message: `${region}: household cohorts missing — HH4's decomposition is not being built` });
      return;
    }
    const sumDisposable = cohorts.reduce((a, c) => a + c.disposableIncomeUSD, 0);
    const agg = reg.estimatedHouseholdIncomeUSD;
    if (agg > 0 && Math.abs(sumDisposable - agg) / agg > 1e-4) {
      violations.push({
        week,
        message: `${region}: cohort disposable income sums to ${(sumDisposable / 1e9).toFixed(2)}B against an aggregate of ${(agg / 1e9).toFixed(2)}B — the decomposition identity is broken`,
      });
    }
    const sumSavings = cohorts.reduce((a, c) => a + c.savingsUSD, 0);
    const targetSavings = Math.max(0, hs.savingsRate) * agg;
    // 1% band: cohorts squeezed by debt service dissave below the λ target — real behavior,
    // bounded; a wider gap means the normalization itself broke.
    if (agg > 0 && Math.abs(sumSavings - targetSavings) / agg > 1e-2) {
      violations.push({
        week,
        message: `${region}: cohort savings ${(sumSavings / 1e9).toFixed(2)}B vs aggregate rate x income ${(targetSavings / 1e9).toFixed(2)}B — the λ-normalization is off`,
      });
    }
    // HH4d: ONE household deposit stock. The household state's line plus the in-flight ETF
    // settlement must equal the named banks' summed household-deposit lines — the 418B drift
    // between two formula-fed representations is the defect this check keeps dead.
    const bankDepositsUSD = state.companies
      .filter((c) => c.region === region && c.isBankEntity && !c.isDefaulted && !c.mergerAcquired && c.bankBalanceSheet)
      .reduce((a, c) => a + c.bankBalanceSheet!.depositsUSD, 0);
    if (bankDepositsUSD > 0) {
      const hsView = (hs.depositsUSD ?? 0) - (hs.pendingBankSettlementUSD ?? 0);
      if (Math.abs(hsView - bankDepositsUSD) / bankDepositsUSD > 1e-3) {
        violations.push({
          week,
          message: `${region}: household deposits ${(hsView / 1e9).toFixed(1)}B (incl. in-flight) vs banks' household-deposit lines ${(bankDepositsUSD / 1e9).toFixed(1)}B — the two representations are drifting again`,
        });
      }
    }
    // HH4c: tier net worths are splits of the same marked components — they must sum to the
    // aggregate exactly (loose band only for rounding).
    const wd = reg.wealthDistribution;
    if (wd && (hs.netWorthUSD ?? 0) !== 0) {
      const tierSum = Object.values(wd).reduce((a: number, t: any) => a + (t.shareOfNetWorthUSD ?? 0), 0);
      if (Math.abs(tierSum - (hs.netWorthUSD ?? 0)) / Math.max(1, Math.abs(hs.netWorthUSD ?? 1)) > 1e-3) {
        violations.push({
          week,
          message: `${region}: tier net worths sum to ${(tierSum / 1e9).toFixed(1)}B against an aggregate of ${((hs.netWorthUSD ?? 0) / 1e9).toFixed(1)}B — the tier split is not a partition of the real book`,
        });
      }
    }
    const shares = hs.stapleSpendShare + hs.standardSpendShare + hs.luxurySpendShare;
    if (Math.abs(shares - 1) > 1e-3) {
      violations.push({ week, message: `${region}: spend shares sum to ${shares.toFixed(4)} — not a partition` });
    }
    // HH4b: the budget identity — consumption budgets are disposable less savings less real
    // debt service plus the recycle, summed (loose band: the per-cohort zero floor can bind).
    const sumBudgets = cohorts.reduce((a, c) => a + c.consumptionBudgetUSD, 0);
    // Expected against the debt service the cohorts actually PAY (their recorded burden) —
    // the allocated-but-unpayable slice is arrears, priced bank-side as delinquency.
    const sumEffectiveDs = cohorts.reduce((a, c) => a + c.debtServiceUSD, 0);
    // PUB1c: consumption tax is a wedge inside the budget — the money is in the identity, the
    // purchases are not, so add it back before comparing.
    const sumConsumptionTax = cohorts.reduce((a, c) => a + (c.consumptionTaxUSD ?? 0), 0);
    const expectedBudgets = sumDisposable - sumSavings
      - sumEffectiveDs + (hs.capitalReceiptsAnnualUSD ?? 0) - sumConsumptionTax;
    if (agg > 0 && Math.abs(sumBudgets - expectedBudgets) / agg > 5e-3) {
      violations.push({
        week,
        message: `${region}: cohort budgets sum to ${(sumBudgets / 1e9).toFixed(2)}B against the identity's ${(expectedBudgets / 1e9).toFixed(2)}B — the debit/recycle wiring is off`,
      });
    }
  });
}

function checkBeneficiaryClaimsHaveHolders(state: GameState, week: number) {
  const owedUSD = (state.institutionalEntities || [])
    .reduce((sum, e) => sum + ((e as any).beneficiaryLiabilityUSD ?? 0), 0);
  const heldUSD = (['USA', 'UK', 'JPN', 'EUR'] as RegionId[])
    .reduce((sum, r) => sum + (state.regions[r]?.householdState?.institutionalClaimsUSD ?? 0), 0);
  if (owedUSD <= 0 && heldUSD <= 0) return;
  const gapUSD = Math.abs(owedUSD - heldUSD);
  if (gapUSD / Math.max(1, owedUSD) > 0.001) {
    violations.push({
      week,
      message:
        `Beneficiary claims do not reconcile: institutions owe ${(owedUSD / 1e9).toFixed(1)}B, ` +
        `households hold ${(heldUSD / 1e9).toFixed(1)}B (gap ${(gapUSD / 1e9).toFixed(1)}B). ` +
        `A reserve or entitlement is an asset on one book and a liability on another, never one alone.`,
    });
  }
}

function checkNaNAndPurity(state: GameState, week: number) {
  state.companies.forEach(c => {
    if (isNaN(c.annualRevenue) || !isFinite(c.annualRevenue) ||
        isNaN(c.ebitda) || !isFinite(c.ebitda) ||
        isNaN(c.stockPrice) || !isFinite(c.stockPrice) ||
        isNaN(c.eps) || !isFinite(c.eps)) {
      violations.push({ week, message: `NaN/Infinity detected in company ${c.ticker}` });
    }
    (c.productLines || []).forEach(l => {
      if (isNaN(l.categoryMarketShare) || isNaN(l.competitiveness)) {
        violations.push({ week, message: `NaN in company ${c.ticker} productLine ${l.subUnitId || l.category}` });
      }
    });
  });

  (Object.keys(state.regions) as RegionId[]).forEach(id => {
    const r = state.regions[id];
    if (isNaN(r.gdpGrowth) || !isFinite(r.gdpGrowth) ||
        isNaN(r.inflation) || !isFinite(r.inflation) ||
        isNaN(r.unemploymentRate) || !isFinite(r.unemploymentRate) ||
        isNaN(r.policyRate) || !isFinite(r.policyRate)) {
      violations.push({ week, message: `NaN/Infinity in region ${id} macro` });
    }
    if (isNaN(r.bankingSector.bankCapitalRatio) || !isFinite(r.bankingSector.bankCapitalRatio) ||
        isNaN(r.bankingSector.netInterestMarginPct) || !isFinite(r.bankingSector.netInterestMarginPct)) {
      violations.push({ week, message: `NaN/Infinity in region ${id} banking` });
    }
  });

  const idx: any = state.compositeIndices;
  if (isNaN(idx.marketBreadth) || isNaN(idx.globalCreditComposite?.value)) {
    violations.push({ week, message: 'NaN/Infinity in composite indices' });
  }
}

function checkOwnershipConservation(state: GameState, week: number) {
  (Object.keys(state.regions) as RegionId[]).forEach(id => {
    const reg = state.regions[id];
    (['equityOwnership', 'corpBondOwnership', 'sovBondOwnership'] as const).forEach(key => {
      const o = reg[key];
      if (!o) return;
      // XB1: foreign ownership is no longer a share in this object — it is measured from real
      // holdings (measuredForeignOwnership), so it is not part of this conservation sum.
      const totalShareAccounted = o.bankShare + o.institutionalShare + o.centralBankShare;
      const impliedHousehold = 1 - totalShareAccounted;
      if (totalShareAccounted < -0.001 || totalShareAccounted > 1.001 || impliedHousehold < -0.001 || impliedHousehold > 1.001) {
        violations.push({
          week,
          message: `Ownership conservation violated in region ${id} (${key}): accounted=${totalShareAccounted.toFixed(4)}, impliedHousehold=${impliedHousehold.toFixed(4)}`
        });
      }
    });
  });
}

function checkNavIdentity(state: GameState, week: number) {
  const activePositions = state.portfolio.positions.filter(p => !p.isClosed);
  const totalUnrealizedPnL = activePositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const expectedNav = Math.max(0, state.portfolio.cashUSD + totalUnrealizedPnL);
  const diff = Math.abs(state.portfolio.navUSD - expectedNav);
  if (diff > 0.01) {
    violations.push({
      week,
      message: `NAV identity mismatch: portfolio.navUSD=${state.portfolio.navUSD}, expected=${expectedNav} (cash=${state.portfolio.cashUSD}, unrealized=${totalUnrealizedPnL})`
    });
  }
}


function checkMarkToMarketUnfreezesPortfolio(): Violation | null {
  let seedState = createInitialGameState(SEED);
  const company = seedState.companies[0];
  const posData = {
    assetType: 'EQUITY' as any,
    symbol: company.ticker,
    name: company.name,
    region: company.region,
    dealerId: 'invariants-test-dealer',
    direction: 'LONG' as any,
    quantity: 1000,
    entryPrice: company.stockPrice,
    currentPrice: company.stockPrice,
    notional: company.stockPrice * 1000,
    marginRequirement: company.stockPrice * 1000 * 0.2,
    expectedWeeklyCarryUSD: 0,
  };
  let state = executeTrade(seedState, posData);
  const preNav = state.portfolio.navUSD;
  state = advanceWeeklyStep(state);
  const postNav = state.portfolio.navUSD;
  const postPosition = state.portfolio.positions[0];
  const postCompany = state.companies.find(c => c.ticker === company.ticker);

  if (postCompany && postCompany.stockPrice !== company.stockPrice && postNav === preNav) {
    return { week: state.currentWeek, message: `Portfolio NAV frozen: navUSD unchanged after weekly advance despite ${company.ticker} price moving ${company.stockPrice} -> ${postCompany.stockPrice} (nav=${preNav})` };
  }
  if (postCompany && postCompany.stockPrice !== company.stockPrice && postPosition.unrealizedPnL === 0) {
    return { week: state.currentWeek, message: `Position unrealizedPnL still zero for ${postPosition.symbol} after ${company.ticker} price moved ${company.stockPrice} -> ${postCompany.stockPrice}` };
  }
  return null;
}

/**
 * Does sustained institutional demand actually move an equity price?
 *
 * Measured against a CONTROL WORLD rather than against the company's own EPS. The earlier version
 * divided the price move by the EPS move and asked whether anything was left over, which made the
 * test unreliable in exactly the case it most needed to be trusted: `eps` is stored to two
 * decimals, so at an EPS near 0.08 the rounding band is about +/-6% while the test's tolerance was
 * 2%, and a name whose earnings had collapsed 60% could trip it on rounding alone. It also used a
 * company with collapsing fundamentals as its control, which is no control at all.
 *
 * Two worlds from the same seed, identical but for the ownership shock, compared on the SAME
 * company: any difference in price is the flow and nothing else.
 */
function checkSustainedEquityDemandMovesPriceBeyondEps(): Violation | null {
  const ticker = createInitialGameState(SEED).companies
    .find(c => c.region === 'USA' && !c.isBankEntity && !c.isInstitutionalEntity)?.ticker;
  if (!ticker) return null;

  const advance = (shocked: boolean) => {
    let state = createInitialGameState(SEED);
    // Force a large institutional under-allocation so the holder-class rebalancing flow produces
    // a sustained multi-week inflow into USA equities.
    // XB1: the driver moved. Equity demand is each entity's OWN book (assets x equityPct x
    // mandate), not a region-level ownership share, so shocking `institutionalShare` is inert.
    // Shock what actually sizes the bid.
    if (shocked) {
      state.institutionalEntities.forEach((e) => {
        if (e.region !== 'USA' || e.entityType === 'ETF') return;
        e.assetAllocationTarget = { ...e.assetAllocationTarget, equityPct: Math.min(0.95, e.assetAllocationTarget.equityPct * 3) };
      });
    }
    for (let w = 0; w < 20; w++) state = advanceWeeklyStep(state);
    return state.companies.find(c => c.ticker === ticker);
  };

  const control = advance(false);
  const shocked = advance(true);
  if (!control || !shocked || control.isDefaulted || shocked.isDefaulted) return null; // left the sample
  // Also left the sample: a name pinned at the price floor in BOTH worlds, or one that was taken
  // private in one of them. There is no price left for flow to move, so this says nothing about
  // the mechanism.
  const controlPrice = control.stockPrice;
  const shockedPrice = shocked.stockPrice;
  if (!(controlPrice > 0.01) || !(shockedPrice > 0.01)) return null;
  const flowEffect = Math.abs(shockedPrice - controlPrice) / controlPrice;
  if (flowEffect < 0.01) {
    return {
      week: 20,
      message:
        `Sustained institutional equity demand did not move ${ticker}'s price against an ` +
        `otherwise identical control world (control ${controlPrice.toFixed(2)} vs shocked ` +
        `${shockedPrice.toFixed(2)}, ${(flowEffect * 100).toFixed(2)}% apart)`
    };
  }
  return null;
}

function checkUndersubscribedSovereignAuctionRaisesYield(): Violation | null {
  const baseline = createInitialGameState(SEED);
  const shocked = createInitialGameState(SEED);
  // S6: shock the fields the market ACTUALLY reads. The old version shrank two macro scalars
  // (bankEquityUSD / sectorEquityUSD) that the clearing engine stopped reading when sovereign
  // demand became per-bank reserve arbitrage (S2) and per-entity budgets (S11) — so baseline and
  // shocked runs were identical to 8 decimal places and the check was testing nothing. An
  // under-subscribed auction is buyers with no money: drain every USA bank's real reserves (the
  // funding for their bond bids) and every USA institution's real cash (their budgets).
  shocked.companies.forEach(c => {
    if (c.region === 'USA' && c.bankBalanceSheet) {
      c.bankBalanceSheet.cashReservesUSD *= 0.01;
      // WS6 taught the check the same lesson S6 did, one field later: with a repo market, a
      // bank with drained CASH still bids — it funds the purchase secured against its
      // collateral, which is exactly why real sovereign auctions rarely fail. "Buyers with no
      // money" now means no cash AND no unencumbered collateral to borrow against.
      const sovUSD = Object.values((c.bankBalanceSheet.sovereignBondHoldingsByTenor || {}) as Record<string, number>)
        .reduce((a, v) => a + (Number(v) || 0), 0);
      c.bankBalanceSheet.repoEncumberedCollateralUSD = sovUSD;
    }
  });
  // XB1: foreign institutions bid in this auction too, so starving only the DOMESTIC ones no
  // longer under-subscribes it — foreign demand absorbs the paper, which is the mechanism
  // working. A genuinely under-subscribed auction now means every eligible bidder is out of money.
  shocked.institutionalEntities.forEach(e => { e.cashUSD = 0; });

  const baselineNext = advanceWeeklyStep(baseline);
  const shockedNext = advanceWeeklyStep(shocked);

  if (shockedNext.regions.USA.zeroRates.tenor10Y <= baselineNext.regions.USA.zeroRates.tenor10Y) {
    return {
      week: shockedNext.currentWeek,
      message: `Under-subscribed sovereign auction did not raise USA's 10Y yield the following week (baseline=${baselineNext.regions.USA.zeroRates.tenor10Y}, shocked=${shockedNext.regions.USA.zeroRates.tenor10Y})`
    };
  }
  return null;
}

// NEW: Trade Fee Conservation Check
function checkTradeFeeConservation(state: GameState): Violation | null {
  
  // Take a snapshot of pre-trade balances
  const preCash = state.portfolio.cashUSD;
  const preBankEquity = state.regions['USA']?.bankingSector.bankEquityUSD || 0;

  // Let's create a fake position
  const posData = {
    assetType: 'EQUITY' as any,
    symbol: 'TEST',
    name: 'Test Equity',
    region: 'USA' as RegionId,
    dealerId: 'alpha',
    direction: 'LONG' as any,
    quantity: 1000,
    entryPrice: 100,
    currentPrice: 100,
    notional: 100000,
    marginRequirement: 20000,
    expectedWeeklyCarryUSD: 0
  };

  const executionDetails = {
    fillPrice: 100.15,
    counterpartyFeeUSD: 150,
    sourcedFrom: 'Bank intermediated (sourced externally)',
    spreadCostUSD: 150
  };

  const postState = executeTrade(state, posData, executionDetails);

  const postCash = postState.portfolio.cashUSD;
  const postBankEquity = postState.regions['USA']?.bankingSector.bankEquityUSD || 0;

  const userDebit = preCash - postCash;
  const bankCredit = postBankEquity - preBankEquity;

  if (Math.abs(userDebit - executionDetails.spreadCostUSD) > 0.01) {
    return { week: state.currentWeek, message: `Trade Fee mismatch: user debited ${userDebit} but spreadCostUSD was ${executionDetails.spreadCostUSD}` };
  }
  
  const expectedBankCredit = executionDetails.spreadCostUSD + executionDetails.counterpartyFeeUSD;
  if (Math.abs(bankCredit - expectedBankCredit) > 0.01) {
    return { week: state.currentWeek, message: `Trade Fee mismatch: bank credited ${bankCredit} but expected ${expectedBankCredit}` };
  }
  
  return null;
}

// =============================================================================================
// MODULES — the one place to add a check or a measurement. Everything below runs off the SAME
// single simulation pass the core checks run off; nothing spawns its own world except `shock`
// tests, which A/B from the shared mid-run snapshot.
// =============================================================================================
interface HarnessModule {
  name: string;
  /** Once, on the seed state, before week 1. */
  init?(state0: GameState): void;
  /** Every week after the step and the core checks. Sample freely; push violations. */
  week?(prev: GameState, state: GameState, w: number): void;
  /** End of run: measured numbers in the battery pattern — report, judge nothing. */
  report?(final: GameState, weeks: number): string[];
  /** A/B mechanism test from the shared mid-run snapshot. Skipped when SHOCKS=0. */
  shock?(snapshot: GameState, rngState: number, shockWeek: number, weeks: number): string[];
}

/** HH close-out battery (§7.60), as a module on the shared run. */
const hhModule: HarnessModule = (() => {
  const series: Record<string, number[]> = { u: [], v: [], wage: [], tight: [], unmodeled: [], netWorth: [], consumption: [], infl: [] };
  let seedUnmodeledUSD = 0;
  return {
    name: 'HH battery',
    init(s0) { seedUnmodeledUSD = s0.regions.USA.householdState.unmodeledFinancialAssetsUSD ?? 0; },
    week(_prev, s) {
      const reg = s.regions.USA; const hs = reg.householdState;
      const pools: any = reg.occupationPools;
      series.u.push(reg.unemploymentRate);
      series.v.push(reg.vacancyRate ?? 0);
      series.tight.push(reg.laborMarketTightness ?? 0);
      series.wage.push((Object.values(pools) as any[]).reduce((a: number, p: any) => a + p.wageGrowthAnnual, 0) / 5);
      series.unmodeled.push(hs.unmodeledFinancialAssetsUSD ?? 0);
      series.netWorth.push(hs.netWorthUSD ?? 0);
      series.infl.push(reg.inflation);
      series.consumption.push((hs.cohorts ?? []).reduce((a, c) => a + c.consumptionBudgetUSD, 0));
    },
    report(s, weeks) {
      const out: string[] = [];
      out.push('--- scoreboard: unmodeled financial assets (must fall, never rise) ---');
      out.push(`  seed: ${B(seedUnmodeledUSD)}`);
      [1, 10, 40, Math.floor(weeks / 2), weeks].forEach(w => {
        const idx = w - 1;
        if (idx >= 0 && idx < series.unmodeled.length) out.push(`  w${String(w).padStart(3)}: ${B(series.unmodeled[idx])}`);
      });
      let rose = 0;
      for (let i = 1; i < series.unmodeled.length; i++) if (series.unmodeled[i] > series.unmodeled[i - 1] + 1) rose++;
      out.push(`  weeks it ROSE: ${rose} (must be 0 — a placeholder only shrinks)`);
      const hsU = s.regions.USA.householdState;
      out.push(`  final share of household financial assets: ${pct((hsU.unmodeledFinancialAssetsUSD ?? 0) / Math.max(1, hsU.equityHoldingsUSD ?? 1))}`);
      out.push(`  residual capital-receipt share of income: ${pct(hsU.unmodeledCapitalReceiptShareOfIncome ?? 0)}`);
      out.push('--- claims reconcile (both directions) ---');
      REGIONS.forEach(r => {
        const reg = s.regions[r]; const hs = reg.householdState;
        const instLiab = s.institutionalEntities.filter(e => e.region === r && !e.isDefaulted)
          .reduce((a, e) => a + (e.beneficiaryLiabilityUSD ?? 0), 0);
        const held = hs.institutionalClaimsUSD ?? 0;
        const gap = Math.abs(instLiab - held) / Math.max(1, instLiab);
        const nwParts = (hs.depositsUSD ?? 0) + (hs.mmfSharesUSD ?? 0) + (hs.equityHoldingsUSD ?? 0)
          + (hs.housingStockUSD ?? 0)
          - ((hs.mortgageDebtUSD ?? 0) + (hs.creditCardDebtUSD ?? 0) + (hs.otherConsumerLoanDebtUSD ?? 0));
        const nwGap = Math.abs(nwParts - (hs.netWorthUSD ?? 0)) / Math.max(1, Math.abs(hs.netWorthUSD ?? 1));
        const tierSum = Object.values(reg.wealthDistribution).reduce((a: number, t: any) => a + t.shareOfNetWorthUSD, 0);
        const tierGap = Math.abs(tierSum - (hs.netWorthUSD ?? 0)) / Math.max(1, Math.abs(hs.netWorthUSD ?? 1));
        const bankDeposits = s.companies
          .filter(c => c.region === r && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet)
          .reduce((a, c) => a + c.bankBalanceSheet!.depositsUSD, 0);
        const depGap = Math.abs(((hs.depositsUSD ?? 0) - (hs.pendingBankSettlementUSD ?? 0)) - bankDeposits) / Math.max(1, bankDeposits);
        out.push(`  ${r}: instLiab=${B(instLiab)} held=${B(held)} (gap ${pct(gap)}) | netWorth parts gap ${pct(nwGap)} | tier-sum gap ${pct(tierGap)} | deposits-vs-banks gap ${pct(depGap)}`);
      });
      out.push('--- labor market relations ---');
      const du = series.u.slice(1).map((x, i) => x - series.u[i]);
      const dv = series.v.slice(1).map((x, i) => x - series.v[i]);
      out.push(`  Beveridge (u vs v): levels=${corr(series.u, series.v).toFixed(3)}  changes=${corr(du, dv).toFixed(3)}`);
      out.push(`  wage growth vs tightness: ${corr(series.wage, series.tight).toFixed(3)}`);
      out.push(`  u range ${pct(Math.min(...series.u))}-${pct(Math.max(...series.u))}   v range ${pct(Math.min(...series.v))}-${pct(Math.max(...series.v))}`);
      const realWage = series.wage.map((x, i) => x - series.infl[i]);
      out.push(`  mean nominal wage growth ${pct(series.wage.reduce((a, x) => a + x, 0) / series.wage.length)}, mean real ${pct(realWage.reduce((a, x) => a + x, 0) / realWage.length)}`);
      out.push(`  net worth / income (USA): ${((s.regions.USA.householdState.netWorthUSD ?? 0) / s.regions.USA.estimatedHouseholdIncomeUSD).toFixed(2)}x`);
      return out;
    },
    shock(snapshot, rngState, shockWeek, weeks) {
      const out: string[] = [];
      const horizon = Math.min(30, weeks - shockWeek);
      if (horizon < 4) return out;
      const run = (st: GameState, kill: boolean) => {
        setRngState(rngState);
        let x = clone(st);
        let killedName = '', killedJobs = 0;
        if (kill) {
          const target = x.companies
            .filter(c => c.region === 'USA' && isActiveCompany(c))
            .sort((a, b) => b.employeeCount - a.employeeCount)[0];
          if (target) {
            killedName = `${target.ticker} (${target.sector})`;
            killedJobs = target.employeeCount;
            target.isDefaulted = true; target.employeeCount = 0; target.stockPrice = 0;
          }
        }
        const o: { u: number[]; c: number[]; inc: number[] } = { u: [], c: [], inc: [] };
        for (let i = 0; i < horizon; i++) {
          x = advanceWeeklyStep(x);
          const reg = x.regions.USA;
          o.u.push(reg.unemploymentRate);
          o.c.push((reg.householdState.cohorts ?? []).reduce((a, ch) => a + ch.consumptionBudgetUSD, 0));
          o.inc.push(reg.estimatedHouseholdIncomeUSD);
        }
        return { o, killedName, killedJobs };
      };
      const ctl = run(snapshot, false);
      const trt = run(snapshot, true);
      const lf = snapshot.regions.USA.totalPopulation * (1 - snapshot.regions.USA.nonEmployablePct) * snapshot.regions.USA.laborForceParticipation;
      out.push(`recession transmission — killed at week ${shockWeek}: ${trt.killedName}, ${(trt.killedJobs / 1e3).toFixed(1)}k jobs (${pct(trt.killedJobs / lf)} of the labor force)`);
      out.push(`  wk | unemployment (ctl -> shock)      | consumption budget (ctl -> shock)   | household income`);
      [1, 2, 4, 8, 16, horizon].filter((x, i, a) => x <= horizon && a.indexOf(x) === i).forEach(k => {
        const i = k - 1;
        out.push(`  +${String(k).padStart(2)} | ${pct(ctl.o.u[i])} -> ${pct(trt.o.u[i])}  (${((trt.o.u[i] - ctl.o.u[i]) * 100).toFixed(2)}pp) | ${B(ctl.o.c[i])} -> ${B(trt.o.c[i])} (${(((trt.o.c[i] / ctl.o.c[i]) - 1) * 100).toFixed(2)}%) | ${(((trt.o.inc[i] / ctl.o.inc[i]) - 1) * 100).toFixed(2)}%`);
      });
      return out;
    },
  };
})();

/** PUB close-out battery (§7.68), as a module on the shared run. */
function couponReceipts(s: GameState, region: RegionId) {
  const reg: any = s.regions[region];
  const cb = sovereignCouponByBucket(reg.govDebtTranches, sovBucketKey);
  const rate = (id: string) => cb[id.replace(`${region}-GOV-`, '')] ?? 0;
  const banks = s.companies
    .filter((c: any) => c.region === region && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet)
    .reduce((a: number, c: any) => a + Object.entries(c.bankBalanceSheet.sovereignBondHoldingsByTenor || {})
      .reduce((x: number, [k, v]: any) => x + ((Number(v) || 0) * (cb[k] ?? 0)) / 52, 0), 0);
  const insts = s.institutionalEntities
    .filter((e: any) => e.region === region && !e.isDefaulted)
    .reduce((a: number, e: any) => a + (e.itemizedHoldings || [])
      .filter((h: any) => h.instrumentType === 'GOV_BOND' && h.issuerRegion === region)
      .reduce((x: number, h: any) => x + ((h.quantityOrNotionalUSD ?? 0) * rate(h.instrumentId)) / 52, 0), 0);
  const central = Object.entries(reg.centralBankSheet?.sovereignHoldingsByTenor || {})
    .reduce((a: number, [k, v]: any) => a + ((Number(v) || 0) * (cb[k] ?? 0)) / 52, 0);
  const paid = weeklyInterestExpenseUSD(reg.govDebtTranches);
  return { paid, banks, insts, central, unmodeled: reg.governmentInterestToUnmodeledHoldersUSD ?? 0 };
}

const pubModule: HarnessModule = (() => {
  const series: Record<string, number[]> = {
    interestShare: [], procShare: [], procSpent: [], unspentProc: [], stance: [],
    tga: [], cbBook: [], reinvest: [], remit: [], policy: [], portYield: [],
    unbacked: [], unmodeledTax: [], revenue: [], outlays: [], debtGdp: [], cmb: [],
  };
  let negativeTga = 0, negativeYield = 0;
  return {
    name: 'PUB battery',
    week(_prev, s) {
      const reg: any = s.regions.USA;
      const cb = reg.centralBankSheet;
      const dec = decomposeGovernmentSpending(reg.governmentSpendingUSD, reg.governmentInterestWeeklyUSD ?? 0,
        GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore);
      series.interestShare.push(dec.interestUSD / Math.max(1, reg.governmentSpendingUSD));
      series.procShare.push(dec.procurementBudgetUSD / Math.max(1, reg.governmentSpendingUSD));
      series.procSpent.push(reg.governmentProcurementSpentUSD ?? 0);
      series.unspentProc.push(reg.unspentProcurementBudgetUSD ?? 0);
      series.stance.push(reg.fiscalStanceScore);
      series.tga.push(cb?.treasuryAccountUSD ?? 0);
      series.cbBook.push(centralBankAssetsUSD(cb));
      series.reinvest.push(cb?.reinvestmentShare ?? 1);
      series.remit.push(cb?.lastRemittanceUSD ?? 0);
      series.policy.push(reg.policyRate);
      series.unbacked.push(cb?.unbackedBankCashUSD ?? 0);
      series.unmodeledTax.push(reg.unmodeledTaxRevenueUSD ?? 0);
      series.revenue.push(reg.governmentRevenueUSD);
      series.outlays.push(reg.governmentOutlaysUSD ?? 0);
      series.cmb.push(reg.cashBridgeBillIssuanceUSD ?? 0);
      series.debtGdp.push(reg.debtToGdpPctBottomUp ?? 0);
      const cbCoupon = couponReceipts(s, 'USA').central * 52;
      series.portYield.push(centralBankAssetsUSD(cb) > 0 ? cbCoupon / centralBankAssetsUSD(cb) : 0);
      REGIONS.forEach(r => {
        const rr: any = s.regions[r];
        if ((rr.centralBankSheet?.treasuryAccountUSD ?? 0) < 0) negativeTga++;
        if (rr.zeroRates.tenor2Y < 0 || rr.zeroRates.tenor10Y < 0) negativeYield++;
      });
    },
    report(s, weeks) {
      const out: string[] = [];
      out.push('--- the coupon reaches a holder, and the government pays it ---');
      REGIONS.forEach(r => {
        const c = couponReceipts(s, r);
        const attributed = c.banks + c.insts + c.central;
        out.push(`  ${r}: paid ${B(c.paid)}/wk = banks ${B(c.banks)} + institutions ${B(c.insts)} + CB ${B(c.central)} = ${B(attributed)} (${pct(attributed / Math.max(1, c.paid))}), unmodeled (foreign) ${B(c.unmodeled)} [residual ${B(c.paid - attributed - c.unmodeled)}]`);
      });
      out.push('--- the named gaps (each must fall, none may be assumed away) ---');
      const at = (a: number[], w: number) => (w >= 1 && w <= a.length ? B(a[w - 1]) : 'n/a');
      const marks = [13, 52, weeks].filter((w, i, arr) => w <= weeks && arr.indexOf(w) === i);
      out.push(`  unmodeledTaxRevenueUSD:   w1 ${at(series.unmodeledTax, 1)} -> w${weeks} ${at(series.unmodeledTax, weeks)}`);
      out.push(`  unbackedBankCashUSD:      ${marks.map(w => `w${w} ${at(series.unbacked, w)}`).join('  ')}`);
      out.push(`  unspentProcurementBudget: ${marks.map(w => `w${w} ${at(series.unspentProc, w)}/wk`).join('  ')}`);
      const fill = series.procSpent.map((v, i) => v / Math.max(1, v + series.unspentProc[i]));
      out.push(`  procurement fill ratio:   mean ${pct(fill.reduce((a, x) => a + x, 0) / fill.length)}, range ${pct(Math.min(...fill))}-${pct(Math.max(...fill))}`);
      out.push('--- crowding out ---');
      const stanceFlat = series.stance.every(v => Math.abs(v - series.stance[0]) < 1e-9);
      out.push(`  corr(interest share, procurement share) = ${corr(series.interestShare, series.procShare).toFixed(3)}${stanceFlat ? '  [ARITHMETIC, not evidence: flat stance]' : ''}`);
      out.push(`  corr(interest share, REALIZED procurement) = ${corr(series.interestShare, series.procSpent).toFixed(3)}`);
      out.push(`  interest share range ${pct(Math.min(...series.interestShare))}-${pct(Math.max(...series.interestShare))}, debt/GDP ${pct(Math.min(...series.debtGdp))}-${pct(Math.max(...series.debtGdp))}`);
      out.push('--- central bank: remittances, regimes, the book ---');
      const excess = series.policy.map((p, i) => p - series.portYield[i]);
      const dd = (a: number[]) => a.slice(1).map((x, i) => x - a[i]);
      out.push(`  corr(policy, remittance): levels ${corr(series.policy, series.remit).toFixed(3)} changes ${corr(dd(series.policy), dd(series.remit)).toFixed(3)}`);
      out.push(`  corr(policy - portfolio yield, remittance): levels ${corr(excess, series.remit).toFixed(3)} changes ${corr(dd(excess), dd(series.remit)).toFixed(3)} (negative = the real post-hiking phenomenon)`);
      out.push(`  remittance negative in ${series.remit.filter(v => v < 0).length}/${weeks} weeks; CB book ${B(series.cbBook[0])} -> ${B(series.cbBook[series.cbBook.length - 1])}; QT weeks ${series.reinvest.filter(v => v < 0.999).length}/${weeks}`);
      out.push('--- the treasury account ---');
      out.push(`  TGA range ${B(Math.min(...series.tga))}..${B(Math.max(...series.tga))}; negative in ${negativeTga} region-weeks (must be 0); negative nominal yields in ${negativeYield} region-weeks`);
      const rev = series.revenue;
      const meanDeficit = series.outlays.reduce((a, v, i) => a + (v - rev[i]), 0) / series.outlays.length;
      out.push(`  mean weekly deficit ${B(meanDeficit)}; dry weeks (<0.1B collected) ${rev.filter(v => v < 1e8).length}/${weeks}, peak ${B(Math.max(...rev))} — the swing a TGA exists to absorb`);
      if (weeks >= 104) {
        const trail = (a: number[], end: number, n = 52) => a.slice(Math.max(0, end - n), end).reduce((x, y) => x + y, 0);
        const half = Math.floor(weeks / 2);
        const rg = trail(rev, weeks) / Math.max(1, trail(rev, half));
        const og = trail(series.outlays, weeks) / Math.max(1, trail(series.outlays, half));
        out.push(`  trailing-52wk revenue ${B(trail(rev, weeks))} vs outlays ${B(trail(series.outlays, weeks))} = ${(trail(rev, weeks) / Math.max(1, trail(series.outlays, weeks))).toFixed(2)}x; growth x${rg.toFixed(1)} vs x${og.toFixed(1)}`);
        out.push(`  bridge bills: ${B(series.cmb.reduce((a, v) => a + v, 0))} total, ${series.cmb.filter(v => v > 0).length}/${weeks} weeks (PUB3c)`);
      }
      out.push('--- stability at horizon ---');
      REGIONS.forEach(r => {
        const reg: any = s.regions[r]; const cb = reg.centralBankSheet;
        const bad: string[] = [];
        const chk = (n: string, v: number | undefined) => { if (v === undefined || !isFinite(v)) bad.push(n); };
        chk('revenue', reg.governmentRevenueUSD); chk('outlays', reg.governmentOutlaysUSD);
        chk('interest', reg.governmentInterestWeeklyUSD); chk('tga', cb?.treasuryAccountUSD);
        chk('cbBook', centralBankAssetsUSD(cb)); chk('2Y', reg.zeroRates.tenor2Y); chk('10Y', reg.zeroRates.tenor10Y);
        out.push(`  ${r}: rev ${B(reg.governmentRevenueUSD)} outlays ${B(reg.governmentOutlaysUSD ?? 0)} interest ${B(reg.governmentInterestWeeklyUSD ?? 0)} tga ${B(cb?.treasuryAccountUSD ?? 0)} 2Y ${pct(reg.zeroRates.tenor2Y)} 10Y ${pct(reg.zeroRates.tenor10Y)} ${bad.length ? 'NON-FINITE: ' + bad.join(',') : 'all finite'}`);
      });
      return out;
    },
    shock(snapshot, rngState, shockWeek, weeks) {
      const out: string[] = [];
      const horizon = Math.min(40, weeks - shockWeek);
      if (horizon < 4) return out;
      const run = (st: GameState, shocked: boolean) => {
        setRngState(rngState);
        let x = clone(st);
        if (shocked) {
          const reg: any = x.regions.USA;
          (reg.govDebtTranches || []).forEach((t: any) => { t.couponRate = (t.couponRate ?? 0) * 4 + 0.04; });
        }
        const o = { interest: [] as number[], proc: [] as number[], transfers: [] as number[], debt: [] as number[] };
        for (let i = 0; i < horizon; i++) {
          x = advanceWeeklyStep(x);
          const reg: any = x.regions.USA;
          const dec = decomposeGovernmentSpending(reg.governmentSpendingUSD, reg.governmentInterestWeeklyUSD ?? 0,
            GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore);
          o.interest.push(dec.interestUSD); o.transfers.push(dec.transfersUSD);
          o.proc.push(reg.governmentProcurementSpentUSD ?? 0);
          o.debt.push(reg.debtToGdpPctBottomUp ?? 0);
        }
        return o;
      };
      const ctl = run(snapshot, false);
      const trt = run(snapshot, true);
      out.push(`debt spiral — coupon quadrupled on the whole USA stack at week ${shockWeek}. wk | interest/wk (ctl -> shock) | REAL procurement | transfers | debt/GDP`);
      [1, 4, 8, 16, horizon].filter((x, i, a) => x <= horizon && a.indexOf(x) === i).forEach(k => {
        const i = k - 1;
        out.push(`  +${String(k).padStart(2)} | ${B(ctl.interest[i])} -> ${B(trt.interest[i])} | ${B(ctl.proc[i])} -> ${B(trt.proc[i])} (${(((trt.proc[i] / Math.max(1, ctl.proc[i])) - 1) * 100).toFixed(1)}%) | ${B(ctl.transfers[i])} -> ${B(trt.transfers[i])} | ${pct(ctl.debt[i])} -> ${pct(trt.debt[i])}`);
      });
      return out;
    },
  };
})();

/** XB close-out battery (§7.72-77), as a module on the shared run. */
const xbModule: HarnessModule = (() => {
  const history: { week: number; rates: Record<string, number> }[] = [];
  return {
    name: 'XB battery',
    week(_prev, s, w) {
      history.push({ week: w, rates: { ...s.freightRatePerTonneLaneMoneyByLane } });
    },
    report(s) {
      const out: string[] = [];
      out.push('--- trade reconciles to who bought from whom ---');
      const totX = REGIONS.reduce((a, r) => a + (s.regions[r].exportsUSD ?? 0), 0);
      const totM = REGIONS.reduce((a, r) => a + (s.regions[r].importsUSD ?? 0), 0);
      out.push(`  world exports ${B(totX)}  imports ${B(totM)}  gap ${pct(Math.abs(totX - totM) / Math.max(1, totX))}`);
      REGIONS.forEach(r => {
        const reg = s.regions[r];
        out.push(`  ${r.padEnd(4)} X ${B(reg.exportsUSD ?? 0)}  M ${B(reg.importsUSD ?? 0)}  balance ${B(reg.tradeBalance ?? 0)}`);
      });
      out.push('--- trade share against the physics that should drive it ---');
      const density: number[] = []; const imported: number[] = [];
      Object.values(INDUSTRY_SUBUNITS).flat().forEach(su => {
        const phys = SUBUNIT_PHYSICAL[su.unitId];
        if (!phys || phys.deliveryMode !== 'PHYSICAL' || !phys.baselineValueDensityUsdPerTonne) return;
        const mass = s.unitMassTonnes[su.unitId] ?? 0;
        if (!(mass > 0)) return;
        const rate = s.freightRatePerTonneLaneMoneyByLane[laneKey('EUR', 'USA')] ?? 0;
        const price = Number((s.regions.USA.categoryDemand[su.unitId] as any)?.unitPriceUSD) || 1;
        density.push(phys.baselineValueDensityUsdPerTonne);
        imported.push(-(mass * rate) / price);
      });
      out.push(`  Spearman(value density, -freight share of value) = ${spearman(density, imported).toFixed(3)}  (n=${density.length}) [1.000 = physics deciding tradability]`);
      out.push('--- carriers and the freight market ---');
      const carriers = s.companies.filter(isCarrier);
      const alive = carriers.filter(c => isActiveCompany(c));
      out.push(`  carriers ${alive.length} alive of ${carriers.length}   fleet ${carriers.reduce((a, c) => a + (c.carrierFleet?.assets.length ?? 0), 0)} assets`);
      out.push(`  logistics revenue ${B(carriers.reduce((a, c) => a + c.annualRevenue, 0))} = ${pct(carriers.reduce((a, c) => a + c.annualRevenue, 0) / Math.max(1, REGIONS.reduce((a, r) => a + (s.regions[r].derivedNominalGdpUSD ?? 0), 0)))} of world GDP [real: 5-6%]`);
      const rateStart = history[0]?.rates ?? {}; const rateEnd = history[history.length - 1]?.rates ?? {};
      Object.keys(rateEnd).sort().slice(0, 8).forEach(k => {
        const [from, to] = k.split('>') as [RegionId, RegionId];
        const t = laneTransitWeeks(from, to, laneDistanceNm(from, to));
        const a = rateStart[k] ?? 0, b = rateEnd[k] ?? 0;
        out.push(`  ${k.padEnd(12)} transit ${t.toFixed(2)}wk  rate w1 ${a.toFixed(2)} -> ${b.toFixed(2)} (${a > 0 ? ((b / a - 1) * 100).toFixed(0) + '%' : 'n/a'})`);
      });
      const withRevenue = carriers.filter(c => (c.carrierFleet?.lastWeekFreightRevenueUSD ?? 0) > 0);
      out.push(`  carriers earning freight this week: ${withRevenue.length} of ${alive.length}; tonne-miles ${carriers.reduce((a, c) => a + (c.carrierFleet?.lastWeekTonneNm ?? 0), 0).toExponential(2)}`);
      out.push('--- transit, the currency boundary, reserves ---');
      const inTransit = s.goodsInTransit ?? [];
      out.push(`  consignments in transit ${inTransit.length}  value ${B(inTransit.reduce((a, sh) => a + sh.units * sh.landedCostPerUnit, 0))}; in-place goods ever imported: ${inTransit.filter(sh => deliveryModeOf(sh.subUnitId) === 'IN_PLACE').length} (must be 0)`);
      REGIONS.forEach(r => {
        const fx = getFxToUsd(s.fxPairs, r);
        const mean = Object.values(INDUSTRY_SUBUNITS).flat().reduce((acc, su) => {
          const p = Number((s.regions[r].categoryDemand[su.unitId] as any)?.unitPriceUSD) || 0;
          const pu = Number((s.regions.USA.categoryDemand[su.unitId] as any)?.unitPriceUSD) || 0;
          return p > 0 && pu > 0 ? { n: acc.n + 1, sum: acc.sum + (p * fx) / pu } : acc;
        }, { n: 0, sum: 0 });
        const cb = s.regions[r].centralBankSheet;
        out.push(`  ${r.padEnd(4)} fx ${fx.toFixed(4)}  mean converted price vs USA ${(mean.sum / Math.max(1, mean.n)).toFixed(3)} [1.000 = law of one price]  fxReserves ${B(cb ? centralBankFxReservesUSD(cb) : 0)}`);
      });
      const mfo = (s.regions.USA as any).measuredForeignOwnership;
      out.push(`  USA measured foreign ownership: ${mfo ? JSON.stringify(mfo) : '(not published)'}`);
      return out;
    },
  };
})();

// ---- ADD NEW MODULES HERE, and nowhere else. ----
const MODULES: HarnessModule[] = [hhModule, pubModule, xbModule];

// =============================================================================================
// THE RUN
// =============================================================================================
function weekLine(s: GameState, w: number, newViol: number, totalViol: number, ms: number): string {
  const r = s.regions;
  const u = (id: RegionId) => ((r[id]?.unemploymentRate ?? 0) * 100).toFixed(1);
  const bound = ((s as any).lastWeekDamperBoundIds ?? []).length;
  const gdp = (r.USA as any).derivedNominalGdpUSD ?? 0;
  return `w${String(w).padStart(3)} | viol +${String(newViol).padStart(2)} S${String(totalViol).padStart(4)}`
    + ` | u ${u('USA')}/${u('EUR')}/${u('UK')}/${u('JPN')}`
    + ` | pi ${((r.USA.inflation ?? 0) * 100).toFixed(2)}`
    + ` | GDP ${(gdp / 1e12).toFixed(2)}T`
    + ` | 10Y ${((r.USA.zeroRates?.tenor10Y ?? 0) * 100).toFixed(2)}`
    + ` | bound ${String(bound).padStart(4)}`
    + ` | ${String(ms).padStart(4)}ms`;
}

function runHarness() {
  console.log(`=== THE HARNESS — ${WEEKS} weeks, seed ${SEED}, shocks ${SHOCKS ? 'on' : 'off'}${PROFILE ? ', profiling' : ''} ===`);
  let state = createInitialGameState(SEED);
  const initialRevenueByTicker = new Map(state.companies.map(c => [c.ticker, c.annualRevenue]));
  let knownTickers = new Set(state.companies.map(c => c.ticker));
  MODULES.forEach(m => { try { m.init?.(state); } catch (e) { violations.push({ week: 0, message: `[harness:${m.name}] init threw: ${e}` }); } });

  if (SHOCKS) {
    // Pre-run mechanism tests (each builds its own world; violations land in the same pool).
    const tradeFeeViolation = checkTradeFeeConservation(state);
    if (tradeFeeViolation) violations.push(tradeFeeViolation);
    const frozenPortfolioViolation = checkMarkToMarketUnfreezesPortfolio();
    if (frozenPortfolioViolation) violations.push(frozenPortfolioViolation);
    const equityFlowViolation = checkSustainedEquityDemandMovesPriceBeyondEps();
    if (equityFlowViolation) violations.push(equityFlowViolation);
    const auctionViolation = checkUndersubscribedSovereignAuctionRaisesYield();
    if (auctionViolation) violations.push(auctionViolation);
    if (violations.length) violations.forEach(v => console.log(`  ! [pre-run] ${v.message}`));
    // NOTE deliberately NOT re-seeding here: the old harness ran these tests (each of which
    // creates and advances its own worlds, moving the global RNG) and then advanced the main
    // state from wherever the stream landed. Preserved exactly, so violation counts stay
    // comparable across the rewrite. SHOCKS=0 therefore runs a DIFFERENT (clean-stream) world.
  }

  const SHOCK_WEEK = Math.min(40, Math.floor(WEEKS / 3));
  let shockSnapshot: GameState | null = null;
  let shockRng = 0;

  // PROFILE accumulators (same method as the old scripts/profile.ts: warm-up discarded).
  const WARMUP_WEEKS = 3;
  const totalMsByStage = new Map<string, number>();
  const worstMsByStage = new Map<string, number>();
  let profiledWeeks = 0, profiledMs = 0;

  for (let w = 1; w <= WEEKS; w++) {
    const violBefore = violations.length;
    // Inject scripted trades at week 5 to test NAV with IRS, CDS, and leveraged positions
    if (w === 5) {
      const testIrs: Position = {
        id: 'test-irs-1',
        symbol: 'USD_5Y_IRS',
        name: 'USD 5Y IRS',
        assetType: 'IRS',
        direction: 'PAY_FIXED',
        region: 'USA',
        dealerId: 'USA_BANK',
        quantity: 1,
        entryPrice: 0.04,
        currentPrice: 0.04,
        notional: 10_000_000,
        unrealizedPnL: 0,
        realizedPnL: 0,
        marginRequirement: 100_000,
        maintenanceMargin: 80_000,
        weeklyFinancingCost: 0,
        openedWeek: 5,
        isClosed: false,
      };
      const testCds: Position = {
        id: 'test-cds-1',
        symbol: 'US_IG_CDS',
        name: 'US IG CDS',
        assetType: 'CDS',
        direction: 'BUY_PROTECTION',
        region: 'USA',
        dealerId: 'USA_BANK',
        quantity: 1,
        entryPrice: 100,
        currentPrice: 100,
        notional: 5_000_000,
        unrealizedPnL: 0,
        realizedPnL: 0,
        marginRequirement: 50_000,
        maintenanceMargin: 40_000,
        weeklyFinancingCost: 0,
        openedWeek: 5,
        isClosed: false,
      };
      const testLeveraged: Position = {
        id: 'test-lev-1',
        symbol: state.companies[0].ticker,
        name: state.companies[0].name,
        assetType: 'EQUITY',
        direction: 'LONG',
        region: 'USA',
        dealerId: 'USA_BANK',
        quantity: 1000,
        entryPrice: state.companies[0].stockPrice,
        currentPrice: state.companies[0].stockPrice,
        notional: 2_000_000,
        unrealizedPnL: 0,
        realizedPnL: 0,
        marginRequirement: 200_000,
        maintenanceMargin: 150_000,
        weeklyFinancingCost: 500,
        openedWeek: 5,
        isClosed: false,
      };
      state = {
        ...state,
        portfolio: {
          ...state.portfolio,
          positions: [...state.portfolio.positions, testIrs, testCds, testLeveraged],
        },
      };
    }

    let preState = state;
    const t0 = Date.now();
    if (PROFILE) {
      const { state: next, timings } = advanceWeeklyStepProfiled(state, { profile: true });
      state = next;
      if (w > WARMUP_WEEKS) {
        profiledWeeks++;
        timings.forEach(({ stage, ms }) => {
          totalMsByStage.set(stage, (totalMsByStage.get(stage) ?? 0) + ms);
          worstMsByStage.set(stage, Math.max(worstMsByStage.get(stage) ?? 0, ms));
          profiledMs += ms;
        });
      }
    } else {
      state = advanceWeeklyStep(state);
    }
    const stepMs = Date.now() - t0;

    // Track Sovereign Debt Issuance
    ['USA', 'EUR', 'ASIA'].forEach(rId => {
       const preBankSov = preState.regions[rId]?.bankingSector.sovereignBondHoldingsUSD || 0;
       const preInstSov = preState.regions[rId]?.institutionalSector.sovBondHoldingsUSD || 0;
       
       const postBankSov = state.regions[rId]?.bankingSector.sovereignBondHoldingsUSD || 0;
       const postInstSov = state.regions[rId]?.institutionalSector.sovBondHoldingsUSD || 0;
       
       const actualGrowth = (postBankSov - preBankSov) + (postInstSov - preInstSov);
       
       const gdp = preState.regions[rId]?.nominalGdpUSD || 0;
       const deficitPct = preState.regions[rId]?.governmentDeficitPct || 0;
       const weeklyDeficit = (gdp * deficitPct) / 52;
       
       const centralBankHoldings = preState.regions[rId]?.centralBankReservesUSD || 0;
       const targetCBMoney = gdp * 0.15;
       const qe = Math.max(0, targetCBMoney - centralBankHoldings) * 0.01;
       const monetizedAmount = Math.min(weeklyDeficit, qe);
       
       const marketFundedAmount = Math.max(0, weeklyDeficit - monetizedAmount);
       
       // Accumulate
       if (!(global as any).sovAccumulator) (global as any).sovAccumulator = {};
       if (!(global as any).sovAccumulator[rId]) (global as any).sovAccumulator[rId] = { growth: 0, expected: 0 };
       
       (global as any).sovAccumulator[rId].growth += actualGrowth;
       (global as any).sovAccumulator[rId].expected += marketFundedAmount;
       
       if (w % 13 === 0) {
          const accGrowth = (global as any).sovAccumulator[rId].growth;
          const accExpected = (global as any).sovAccumulator[rId].expected;
          if (accExpected > 0 && Math.abs(accGrowth - accExpected) / accExpected > 0.05) {
             violations.push({ week: w, message: `Sovereign debt absorption mismatch in ${rId} over 13 weeks: expected=${accExpected.toFixed(2)} actualGrowth=${accGrowth.toFixed(2)}` });
          }
          (global as any).sovAccumulator[rId].growth = 0;
          (global as any).sovAccumulator[rId].expected = 0;
       }

       // advanceWeeklyStep gates meetings on nextWeek (= w + 1, since state.currentWeek === w
       // going into this call), not on the harness's own loop index w.
       if ((w + 1) % 13 !== 0 && w > 1) {
         if (preState.regions[rId as RegionId]?.policyRate !== state.regions[rId as RegionId]?.policyRate) {
           violations.push({
             week: w,
             message: `Policy rate changed on non-meeting week ${w} for region ${rId}: ${preState.regions[rId as RegionId]?.policyRate} -> ${state.regions[rId as RegionId]?.policyRate}`
           });
         }
       }
    });
    checkNaNAndPurity(state, w);

    // 3. Disjoint set: isDefaulted and mergerAcquired
    state.companies.forEach(c => {
      if (c.isDefaulted && (c as any).mergerAcquired) {
        violations.push({
          week: w,
          message: `Company ${c.ticker} is both defaulted and mergerAcquired!`
        });
      }
    });

    // 4. Ownership conservation
    checkOwnershipConservation(state, w);

    // 5. NAV identity
    checkNavIdentity(state, w);
    if (prevStateForBookCheck) checkInstitutionalBookConservation(prevStateForBookCheck, state, w);
    checkHouseholdCohortIdentity(state, w);
    checkLaborMarketIdentity(state, w);
    checkCentralBankIdentity(state, w);
    violations.push(...checkHoldingsLedgerConservation(state, w));
    checkBeneficiaryClaimsHaveHolders(state, w);
    prevStateForBookCheck = state;

    // 5b. The bank balance-sheet identity, per named bank, every week. Cash moves only by
    // named flows and every flow posts to both sides, so deposits + equity + secured funding
    // must equal loans + securities + cash to the dollar (small tolerance for per-field
    // rounding). Before the flow ledger this identity was broken by -138.9B (USA, week 0) and
    // a Math.max plug hid it; if this drifts again, some flow is missing a leg — find it,
    // never plug it.
    state.companies.forEach((c: any) => {
      if (!c.isBankEntity || !c.bankBalanceSheet || c.isDefaulted || c.mergerAcquired) return;
      const bs = c.bankBalanceSheet;
      const sovUSD = Object.values((bs.sovereignBondHoldingsByTenor || {}) as Record<string, number>).reduce((a, v) => a + (Number(v) || 0), 0);
      const residualUSD: number =
        // SETL2: `corporateDepositsUSD` IS a liability now. Company payments settle through bank
        // books (stages/settlement.ts), so the line has real reserves behind it and excluding it
        // would leave the ASSET unmatched — the mirror of the error this comment used to record.
        // HH4d: wholesale funding is a real liability line split out of the deposit label.
        bs.depositsUSD + (bs.corporateDepositsUSD ?? 0) + ((bs as any).institutionalDepositsUSD ?? 0) + ((bs as any).unmodeledDepositsUSD ?? 0) + ((bs as any).smeDepositsUSD ?? 0) + (bs.wholesaleFundingUSD ?? 0) + bs.bankEquityUSD + (bs.srfBorrowingUSD ?? 0) + ((bs as any).repoBorrowedUSD ?? 0)
        - bs.businessLoanBookUSD - bs.consumerLoanBookUSD - sovUSD - bs.cashReservesUSD
        - ((bs as any).repoLentUSD ?? 0) - (bs.onRrpLendingUSD ?? 0);
      if (Math.abs(residualUSD) > 5e6) {
        violations.push({
          week: w,
          message: `Bank ${c.ticker} balance-sheet identity broken by ${(residualUSD / 1e6).toFixed(1)}M — a flow is missing a leg`
        });
      }
    });

    // 5c. WS6: the overnight repo rate must print inside the administered corridor in every
    // region every week — not because anything clamps it, but because every lender's
    // reservation is its own posted floor and the SRF sits in the book as an elastic seat at
    // the ceiling. A print outside the corridor means a schedule is wrong or the damper bound.
    // And pledged collateral can never exceed the pledger's holdings.
    (['USA', 'EUR', 'UK', 'JPN'] as const).forEach(regionId => {
      const reg: any = (state as any).regions[regionId];
      if (typeof reg.repoRateAnnual !== 'number') return;
      const floorAnnual = Math.max(0, reg.policyRate - 20 / 10000);
      const ceilAnnual = reg.policyRate + 25 / 10000;
      if (reg.repoRateAnnual < floorAnnual - 1e-6 || reg.repoRateAnnual > ceilAnnual + 1e-6) {
        violations.push({
          week: w,
          message: `${regionId} repo rate ${(reg.repoRateAnnual * 100).toFixed(3)}% outside corridor [${(floorAnnual * 100).toFixed(3)}%, ${(ceilAnnual * 100).toFixed(3)}%]`
        });
      }
    });
    state.companies.forEach((c: any) => {
      if (!c.isBankEntity || !c.bankBalanceSheet || c.isDefaulted || c.mergerAcquired) return;
      const bs = c.bankBalanceSheet;
      const sovUSD = Object.values((bs.sovereignBondHoldingsByTenor || {}) as Record<string, number>).reduce((a, v) => a + (Number(v) || 0), 0);
      if ((bs.repoEncumberedCollateralUSD ?? 0) > sovUSD + 1e6) {
        violations.push({
          week: w,
          message: `Bank ${c.ticker} pledged ${(bs.repoEncumberedCollateralUSD / 1e9).toFixed(2)}B of collateral against ${(sovUSD / 1e9).toFixed(2)}B held`
        });
      }
    });

    // 5d. §6 damper diagnostic: the weekly damper is legitimate discrete-time smoothing, but a
    // name held away from its solve for 3+ CONSECUTIVE weeks means the print is the damper,
    // not the market. First run of this metric measured the condition as ENDEMIC — 3,450
    // streak events across ~1,600 corp tranches, ~900 equity/loan names and 28 sovereign
    // bucket-streaks in 60 weeks (the §7.21 HY saturation cohort and the §7.31 small-cap
    // equity tail, mostly) — so it reports as an end-of-run measurement rather than
    // per-instrument violations that would drown the harness. The number to watch DOWN as
    // G6/HC-resolution give the wides a real buyer base.
    {
      const boundThisWeek = new Set<string>((state as any).lastWeekDamperBoundIds ?? []);
      const next = new Map<string, number>();
      boundThisWeek.forEach(id => next.set(id, (damperBindStreak.get(id) ?? 0) + 1));
      next.forEach((streak, id) => {
        if (streak >= 3) damperPersistentBinds.add(id);
        damperWorstStreak = Math.max(damperWorstStreak, streak);
      });
      damperBindStreak = next;
    }

    // 6. Bank capital ratio & NIM bands for USA
    const usaBank = state.regions.USA.bankingSector;
    if (usaBank.bankCapitalRatio < 0.05 || usaBank.bankCapitalRatio > 0.35) {
      violations.push({
        week: w,
        message: `USA Bank capital ratio out of band [0.05, 0.35]: ${usaBank.bankCapitalRatio.toFixed(4)}`
      });
    }
    if (usaBank.netInterestMarginPct < 0.01 || usaBank.netInterestMarginPct > 0.08) {
      violations.push({
        week: w,
        message: `USA Bank NIM out of band [0.01, 0.08]: ${usaBank.netInterestMarginPct.toFixed(4)}`
      });
    }

    // 7. EPS accuracy on a company that enters the world LISTED.
    // Scoped to listed names because EPS is a per-SHARE quantity and a private firm has no
    // traded share register. HC Wave 2 made births real — a new firm is carved out of an SME
    // pool and is private — and this check, written when `generateIPOCompany` conjured listed
    // companies out of demand growth, flagged all twelve of them for an EPS its shares were
    // never meant to divide.
    state.companies.forEach(c => {
      if (!knownTickers.has(c.ticker)) {
        knownTickers.add(c.ticker);
        if (isPubliclyListed(c) && c.sharesOutstanding && c.sharesOutstanding > 0) {
          const calcEps = c.netIncome / c.sharesOutstanding;
          const diffPct = Math.abs(calcEps - c.eps) / Math.max(0.001, Math.abs(c.eps));
          if (diffPct > 0.15) {
            violations.push({
              week: w,
              message: `Newly listed company ${c.ticker} EPS mismatch: stored=${c.eps}, calc=${calcEps.toFixed(4)} (diff=${(diffPct*100).toFixed(1)}%)`
            });
          }
        }
      }
    });

    // Module hooks — one shared run, every module reads it.
    MODULES.forEach(m => {
      try { m.week?.(preState, state, w); }
      catch (e) { violations.push({ week: w, message: `[harness:${m.name}] week() threw: ${e}` }); }
    });
    if (SHOCKS && w === SHOCK_WEEK) { shockSnapshot = clone(state); shockRng = getRngState(); }

    // The live line, one per week, plus this week's new violations (capped).
    const newViols = violations.slice(violBefore);
    console.log(weekLine(state, w, newViols.length, violations.length, stepMs));
    newViols.slice(0, 6).forEach(v => console.log(`     ! ${v.message}`));
    if (newViols.length > 6) console.log(`     ! ...+${newViols.length - 6} more this week`);
  }

  // 2. Revenue > 20x baseline check. Growth BY ACQUISITION is not organic growth: an acquirer
  // absorbs the target's revenue and (for banks) its whole balance sheet in one week, so its
  // baseline steps up by the targets' own baselines rather than the acquirer being flagged for
  // running a bigger real book (the JLXP case: a small bank legitimately doubled at a merger).
  const acquiredBaselineByAcquirer = new Map<string, number>();
  state.companies.forEach(c => {
    if (c.mergerAcquired && c.acquiredByTicker) {
      const targetInit = initialRevenueByTicker.get(c.ticker) ?? 0;
      acquiredBaselineByAcquirer.set(
        c.acquiredByTicker,
        (acquiredBaselineByAcquirer.get(c.acquiredByTicker) ?? 0) + targetInit
      );
    }
  });
  state.companies.forEach(c => {
    const initRev = (initialRevenueByTicker.get(c.ticker) ?? 0) + (acquiredBaselineByAcquirer.get(c.ticker) ?? 0);
    if (initRev && c.annualRevenue > initRev * 20) {
      violations.push({
        week: WEEKS,
        message: `Company ${c.ticker} revenue grew >20x initial baseline (${initRev} -> ${c.annualRevenue})`
      });
    }
  });

  // ---- module reports: measured numbers, judged by nobody (the battery pattern) ----
  MODULES.forEach(m => {
    try {
      const lines = m.report?.(state, WEEKS);
      if (lines && lines.length) {
        console.log(`\n=== ${m.name} ===`);
        lines.forEach(l => console.log(l));
      }
    } catch (e) { console.log(`\n=== ${m.name} === report threw: ${e}`); }
  });

  // ---- module A/B shocks off the shared mid-run snapshot ----
  if (SHOCKS && shockSnapshot) {
    MODULES.forEach(m => {
      try {
        const lines = m.shock?.(shockSnapshot!, shockRng, SHOCK_WEEK, WEEKS);
        if (lines && lines.length) {
          console.log(`\n=== ${m.name} — A/B shock ===`);
          lines.forEach(l => console.log(l));
        }
      } catch (e) { console.log(`\n=== ${m.name} — A/B shock === threw: ${e}`); }
    });
  }

  // ---- per-stage profile (PROFILE=1) ----
  if (PROFILE && profiledWeeks > 0) {
    const rows = Array.from(totalMsByStage.entries())
      .map(([stage, totalMs]) => ({ stage, meanMs: totalMs / profiledWeeks, worstMs: worstMsByStage.get(stage) ?? 0, sharePct: (totalMs / profiledMs) * 100 }))
      .sort((a, b) => b.meanMs - a.meanMs);
    console.log(`\n=== profile — ${profiledWeeks} measured weeks (first ${WARMUP_WEEKS} discarded as warm-up) ===`);
    console.log(`${'stage'.padEnd(30)}${'mean ms'.padStart(9)}${'worst ms'.padStart(10)}${'share'.padStart(8)}`);
    rows.forEach(r => console.log(`${r.stage.padEnd(30)}${r.meanMs.toFixed(1).padStart(9)}${r.worstMs.toFixed(1).padStart(10)}${r.sharePct.toFixed(1).padStart(7)}%`));
    console.log(`per-week mean: ${(profiledMs / profiledWeeks).toFixed(0)} ms`);
  }

  console.log(`\n[damper] instruments persistently bound (3+ consecutive weeks): ${damperPersistentBinds.size}; worst streak ${damperWorstStreak} weeks — §6.1's promoted defect; watch it DOWN`);

  // ---- verdict: grouped summary (violations already printed live, week by week) ----
  if (violations.length === 0) {
    console.log(`\nOK - HARNESS PASSED — ${WEEKS} weeks, all assertions satisfied`);
    process.exit(0);
  }
  const familyOf = (m: string) => m.replace(/[-+]?\d[\d,.]*/g, '#').slice(0, 110);
  const families = new Map<string, number>();
  violations.forEach(v => families.set(familyOf(v.message), (families.get(familyOf(v.message)) ?? 0) + 1));
  console.error(`\nFAIL - HARNESS FAILED — ${violations.length} violation(s) in ${families.size} families:`);
  Array.from(families.entries()).sort((a, b) => b[1] - a[1])
    .forEach(([f, n]) => console.error(`  ${String(n).padStart(5)}x  ${f}`));
  if (VERBOSE) {
    console.error(`\nfull list (VERBOSE=1):`);
    violations.forEach(v => console.error(`  [Week ${v.week}] ${v.message}`));
  } else {
    console.error(`\n(each violation printed live in its week above; VERBOSE=1 for the full list here)`);
  }
  process.exit(1);
}

runHarness();
