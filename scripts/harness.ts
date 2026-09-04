/**
 * THE HARNESS — the one test script (§1.11). One simulation run; every check, battery and
 * profile reads it. Prints one line per week so a run can be watched live.
 *
 *   npm run verify                    # hygiene + this, 60 weeks (~1 min)
 *   WEEKS=10 SHOCKS=0 npm run verify  # quick wiring probe
 *   WEEKS=260 npm run verify          # section close — ASK FIRST (§1.11)
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
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { businessLoanBookOf, consumerLoanBookOf } from '../src/domain/banking';
import { cashOf, entityCashOf, poolCashOf, householdDepositsOf, householdDepositsAt, resetAccount, adjustBankReserves, bankReservesOf, stateDepositLines, treasuryAccountOf, waysAndMeansOf } from '../src/engine/ledger/accounts';
import { createHash } from 'node:crypto';
import { createInitialGameState } from '../src/engine/simulation/initialization';
import { DEFAULT_SIMULATION_SEED, setRngState, getRngState } from '../src/engine/rng';
import { facilityBookOf, facilityRowsOf, materializeGovLadder } from '../src/engine2/tranches';

// Same seed, same world. Pass SEED=<n> to check a result against a genuinely different economy
// rather than against the noise an unseeded run used to produce.
const SEED = Number(process.env.SEED ?? DEFAULT_SIMULATION_SEED);

// How long to run. 60 weeks is the working default — every real finding in this project has come
// from the first sixty, and a change can be checked in a minute instead of half an hour. The full
// 260-week run belongs at the close of a section: WEEKS=260 npm run verify (ask first, §1.11).
const WEEKS = Number(process.env.WEEKS ?? 60);
/** A/B mechanism tests (extra simulations). On by default; SHOCKS=0 for fast iteration. */
const SHOCKS = process.env.SHOCKS !== '0';
/** PROFILE=1: per-stage timings on the same run, reported at the end. */
const PROFILE = process.env.PROFILE === '1';
/** VERBOSE=1: dump every violation at the end (they also print live, capped per week). */
const VERBOSE = process.env.VERBOSE === '1';
/** §5-STRUCT step 5: record what each stage reads and writes, and report the orderings that are
 *  load-bearing. Off by default; the proxy is built only when this is on. */
const STAGE_TRACE = process.env.STAGE_TRACE === '1';
let lastStageTrace: import('../src/engine/simulation/stage-deps').StageDependencyTrace | undefined;
/** §5-STRUCT step 6: the seed's own reading of the §7.4 quantities, taken before week 1. */
let seededProbe: Record<string, number> | undefined;

// ---------------------------------------------------------------------------------------------
// §7.307 THE VERIFICATION KIT — two utility modes that run NO world and exit before week 1.
//
// DIFF_STATE=a.json,b.json — the identity instrument. Field-by-field differ over two state
//   dumps (produce them with `STATE_DUMP=<file> STATE_DUMP_WEEK=<n> WEEKS=<n>`). Prints
//   IDENTICAL, or every differing path (first 40) plus a per-field-family histogram — the
//   histogram is what localizes a drift (§7.307's wage ULP: cash-adjacent families, clean logs
//   → payroll). Pair with the stripped log diff:
//     diff <(sed 's/| *[0-9]*ms$//' a.log | grep -v " ms") <(same for b.log)
//
// TIMING_REPORT=label=prefix,label=prefix — per-log total and mean ms/week (parsed from the
//   weekly "| NNNms" line endings) and the per-group median over <prefix>-1.log, -2.log, …
//   Protocol: batteries STRICTLY SERIAL, interleaved A/B/A/B, medians of 3; the box's ±12–25%
//   noise floor makes sub-5% differences unresolvable — report that, never a claim.
// ---------------------------------------------------------------------------------------------
if (process.env.DIFF_STATE) {
  const [pa, pb] = process.env.DIFF_STATE.split(',');
  const A = JSON.parse(readFileSync(pa, 'utf8'));
  const B = JSON.parse(readFileSync(pb, 'utf8'));
  let diffs = 0;
  const families = new Map<string, number>();
  const record = (path: string, msg: string): void => {
    diffs++;
    const stripped = path.replace(/[0-9]/g, '');
    const segs = stripped.split('.');
    const fam = segs.length > 1 ? segs.slice(-2).join('.') : stripped;
    families.set(fam, (families.get(fam) ?? 0) + 1);
    if (diffs <= 40) console.log(`${path}: ${msg}`);
  };
  const walk = (x: unknown, y: unknown, path: string): void => {
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) record(path, `LEN ${x.length} vs ${y.length}`);
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) walk(x[i], y[i], `${path}[${i}]`);
    } else if (x !== null && y !== null && typeof x === 'object' && typeof y === 'object') {
      const xo = x as Record<string, unknown>, yo = y as Record<string, unknown>;
      for (const k of new Set([...Object.keys(xo), ...Object.keys(yo)])) {
        if (!(k in xo)) record(`${path}.${k}`, 'MISSING-IN-A');
        else if (!(k in yo)) record(`${path}.${k}`, 'MISSING-IN-B');
        else walk(xo[k], yo[k], `${path}.${k}`);
      }
    } else if (x !== y) {
      record(path, `${JSON.stringify(x)} vs ${JSON.stringify(y)}`);
    }
  };
  walk(A, B, '');
  if (diffs === 0) console.log('IDENTICAL');
  else {
    console.log(`\n${diffs} diffs across ${families.size} field families:`);
    for (const [f, n] of [...families].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(6)}  ${f}`);
    }
  }
  process.exit(diffs === 0 ? 0 : 2);
}

if (process.env.TIMING_REPORT) {
  for (const arg of process.env.TIMING_REPORT.split(',')) {
    const [label, prefix] = arg.split('=');
    const totals: number[] = [], means: number[] = [];
    for (let i = 1; i <= 9; i++) {
      const p = `${prefix}-${i}.log`;
      if (!existsSync(p)) continue;
      const ms = [...readFileSync(p, 'utf8').matchAll(/\|\s*(\d+)ms$/gm)].map((m) => Number(m[1]));
      if (!ms.length) { console.log(`${label} ${p}: NO TIMING LINES`); continue; }
      const total = ms.reduce((a, b) => a + b, 0);
      totals.push(total); means.push(total / ms.length);
      console.log(`${label} ${p}: ${ms.length} wk, total ${total}ms, mean ${(total / ms.length).toFixed(0)}ms/wk`);
    }
    const median = (v: number[]): number => [...v].sort((a, b) => a - b)[v.length >> 1];
    if (totals.length) console.log(`${label} MEDIAN: total ${median(totals).toFixed(0)}ms, mean ${median(means).toFixed(0)}ms/wk\n`);
  }
  process.exit(0);
}

import { advanceWeeklyStep, advanceWeeklyStepProfiled } from '../src/engine/simulation/core';
import { GameState, RegionId, Position, Company, InstitutionalEntity, DebtTranche, OccupationType, ItemizedHolding } from '../src/types';
import { GovDebtTranche, OccupationPool } from '../src/domain/region-macro';
import { ProductLine } from '../src/domain/company';
import { HouseholdLoanPool, MortgageVintage } from '../src/domain/banking';
import { executeTrade } from "../src/engine/simulation/trade";
import { isPubliclyListed, isActiveCompany } from '../src/domain/company';
import { ensureV2 } from '../src/engine2/world';
import { forEachContract } from '../src/engine2/contracts';
import { sovereignCouponByBond, weeklyInterestExpenseUSD, decomposeGovernmentSpending } from '../src/domain/government';
import { governmentOf } from '../src/domain/government-entity';
import { probeSteadyState, compareToSettled } from '../src/engine/simulation/burn-in';
import { overPledgedByBond, PLEDGE_ROUNDING_TOLERANCE_USD } from '../src/domain/collateral';
import { RepoContract } from '../src/domain/repo';
// §7.246: the instrument reads the engine's own definitions instead of re-hardcoding them.
import { mortgageSeverityAtLtv, vintageCurrentLtv, householdBookRwaUSD } from '../src/domain/banking';
import { SRF_SPREAD_BPS, ON_RRP_SPREAD_BPS } from '../src/engine/macro/banking';
import { CAPEX_SUPPLIER_WEIGHTS } from '../src/domain/market-microstructure';
import { centralBankAssetsUSD, centralBankFxReservesUSD } from '../src/domain/central-bank';
import { GOV_PROCUREMENT_SHARE_OF_SPENDING } from '../src/engine/bootstrap/national-accounts';
import { unclassifiedReasons } from '../src/engine/simulation/stages/settlement';
import { INDUSTRY_SUBUNITS } from '../src/domain/industry';
import { productionLeadWeeksOf, seasonalFactor } from '../src/domain/industry-registry';
import { SUBUNIT_PHYSICAL, deliveryModeOf } from '../src/domain/goods-physical';
import { laneDistanceNm, REGION_IDS, REGION_IDS_SEED_ORDER, currencyOf } from '../src/domain/geography';
import { laneKey, laneTransitWeeks } from '../src/domain/carrier';
import { isCarrier } from '../src/engine/simulation/stages/freight-clearing';
import { getFxToUsd } from '../src/engine/simulation/stages/06-fx-and-trade';
import { DERIVATIVE_CLASSES } from '../src/domain/derivatives/registry';
import { auditWeek, auditSeed, auditSummary, AuditFinding } from '../src/engine/audit';

interface Violation {
  week: number;
  message: string;
}

const violations: Violation[] = [];
/** §5-CLOSE — the audit's findings, kept apart so the scoreboard can be printed whole. */
const auditFindings: AuditFinding[] = [];
let damperBindStreak = new Map<string, number>();
const damperPersistentBinds = new Set<string>();
let damperWorstStreak = 0;
let prevBooksForBookCheck: Map<RegionId, number> | null = null;

// ---- shared helpers (used by checks, modules and the live line) ----
const REGIONS = REGION_IDS;
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
/**
 * Nobody can hold more of an instrument than exists — the ledger-minting test.
 *
 * OWN7 step 1: this compared the wrong two numbers for as long as XB1 has existed. It filtered
 * holders on the HOLDER's region and then counted every position they held regardless of the
 * ISSUER's, so a JPN insurer's USA bonds were scored against JPN outstanding. And it left three
 * real holders off the held side entirely — the central bank's sovereign book, corporate
 * treasuries, and the banks' own `businessLoans` (which ARE floating corporate debt) — so the
 * test was understated by exactly those, on top of being mis-keyed.
 *
 * Both sides are keyed to the ISSUER's region now, the same way `measuredOwnershipAllRegions`
 * keys the ownership register. It stays a ONE-SIDED test: households and other unnamed holders
 * are the residual and are not itemised anywhere, so `held` is legitimately below `outstanding`
 * — only exceeding it is a defect.
 */
function checkHoldingsLedgerConservation(state: GameState, week: number): Violation[] {
  const out: Violation[] = [];
  const regionIds = REGION_IDS;
  type Book = { corp: number; loan: number; sov: number; cp: number };
  const held: Record<string, Book> = {};
  const outstanding: Record<string, Book> = {};
  regionIds.forEach((r) => {
    held[r] = { corp: 0, loan: 0, sov: 0, cp: 0 };
    outstanding[r] = { corp: 0, loan: 0, sov: 0, cp: 0 };
  });

  const companyRegionById = new Map<string, string>();
  state.companies.forEach((c: Company) => {
    companyRegionById.set(c.id, c.region);
    // A DEFAULTED issuer's paper is still a claim. Its estate has not distributed yet, so its
    // holders' rows are still on their books — and excluding its ladder here scored a workout in
    // progress as a ledger minting claims (measured: a steady 6.5% "over" in the USA from the
    // week defaults began). A MERGED one is different: 10-mergers reassigns the paper to the
    // acquirer, whose ladder is counted, so counting it here as well would double it.
    if (c.mergerAcquired) return;
    const o = outstanding[c.region];
    if (!o) return;
    (c.debtTranches || []).forEach((t: DebtTranche) => {
      // CP has its own book (07f) and its own holders; counting it as a corporate BOND was the
      // same conflation that had its coupon paid to the bondholders.
      if (t.isCommercialPaper) o.cp += t.principalLocal;
      else if (t.rateType === 'FIXED') o.corp += t.principalLocal;
      else o.loan += t.principalLocal;
    });
  });
  regionIds.forEach((r) => {
    outstanding[r].sov = materializeGovLadder(ensureV2(state), r).reduce((a: number, t: GovDebtTranche) => a + t.principalLocal, 0);
  });

  const addHolding = (h: ItemizedHolding) => {
    const b = held[h.issuerRegion];
    if (!b) return;
    const v = h.quantityOrNotionalUSD ?? 0;
    if (h.instrumentType === 'CORP_BOND') b.corp += v;
    else if (h.instrumentType === 'LEVERAGED_LOAN') b.loan += v;
    else if (h.instrumentType === 'GOV_BOND') b.sov += v;
    else if (h.instrumentType === 'COMMERCIAL_PAPER') b.cp += v;
  };
  state.institutionalEntities.forEach((e: InstitutionalEntity) => {
    if (e.isDefaulted) return;
    e.itemizedHoldings.forEach(addHolding);
  });
  state.companies.forEach((c: Company) => {
    if (c.mergerAcquired) return;
    // A corporate treasury parks cash in its own government's paper (07f).
    (c.treasuryHoldings || []).forEach(addHolding);
    if (c.isDefaulted) return;
    const bs = c.bankBalanceSheet;
    if (!bs) return;
    // A bank's liquidity buffer is its OWN sovereign — 07c/07f give it no foreign bucket, and
    // the buckets are keyed by bare tenor, so the bank's region IS the issuer's.
    const b = held[c.region];
    if (b) {
      b.sov += (Object.values(bs.sovereignBondHoldingsByBond || {}) as number[])
        .reduce((a: number, v: number) => a + (Number(v) || 0), 0);
    }
    // A drawn facility is floating corporate debt on the BORROWER's region, which is not
    // necessarily the lender's. Pool loans are excluded: an SME pool's debt is a scalar on the
    // pool (`seg.debtUSD`), not a tranche on any company, so it has no outstanding to score
    // against and counting it here reported 41% over from week 1. §5-FINALIZATION step 10: the
    // bank's facilities are the borrowers' ladder rows, read from the lender's side.
    facilityRowsOf(ensureV2(state), c.ticker).forEach((l) => {
      const region = companyRegionById.get(l.borrowerId);
      if (!region) return;
      const lb = held[region];
      // §7.246: unclamped — a negative principal is a defect this sum exists to EXPOSE (§7.46 L7:
      // a measurement that clamps is a measurement that lies).
      if (lb) lb.loan += l.principalLocal;
    });
  });
  regionIds.forEach((r) => {
    const reg = state.regions[r];
    (reg.bankingSector.corpBondDealerInventory || []).forEach((p: { inventoryLocal: number }) => { held[r].corp += p.inventoryLocal; });
    // The CP desks' book lives only on the named banks (no regional array — G3a's doctrine).
    state.companies.forEach((c: Company) => {
      if (c.region !== r || !c.bankBalanceSheet) return;
      (c.bankBalanceSheet.dealerDeskInventory?.['commercial paper'] || [])
        .forEach((p: { inventoryLocal: number }) => { held[r].cp += p.inventoryLocal; });
    });
    (reg.bankingSector.loanDealerInventory || []).forEach((p: { inventoryLocal: number }) => { held[r].loan += p.inventoryLocal; });
    (reg.bankingSector.sovBondDealerInventory || []).forEach((p: { inventoryLocal: number }) => { held[r].sov += p.inventoryLocal; });
    Object.values(reg.centralBankSheet?.sovereignHoldingsByBond || {}).forEach((usd: number) => {
      held[r].sov += Number(usd) || 0; // §7.246: unclamped (§7.46 L7)
    });
  });

  // MINT_TRACE=1 — per-issuer decomposition of a minting class: who carries the excess, and is
  // the issuer live, dead, or a bank (the §7.286 paydown exclusion). Read-only.
  if (process.env.MINT_TRACE === '1') {
    // Keyed by (issuer, CLASS): every debt class shares the company id as its instrumentId, so
    // a by-id-only sum mixed bonds, loans and CP against a one-class outstanding and reported
    // phantom "excess" that was simply the OTHER classes' real holdings (§7.292 — this
    // instrument's own first version did exactly that; §7.221's lesson, self-inflicted).
    const heldByIssuer = new Map<string, { usd: number; cls: string }>();
    const addTrace = (h: { instrumentType: string; instrumentId: string; quantityOrNotionalUSD?: number }) => {
      if (h.instrumentType !== 'LEVERAGED_LOAN' && h.instrumentType !== 'CORP_BOND'
        && h.instrumentType !== 'COMMERCIAL_PAPER') return;
      const key = `${h.instrumentId}|${h.instrumentType}`;
      const cur = heldByIssuer.get(key) ?? { usd: 0, cls: h.instrumentType };
      cur.usd += h.quantityOrNotionalUSD ?? 0;
      heldByIssuer.set(key, cur);
    };
    state.institutionalEntities.forEach((e) => { if (!e.isDefaulted) e.itemizedHoldings.forEach(addTrace); });
    const byId = new Map(state.companies.map((c) => [c.id, c]));
    const rows: string[] = [];
    heldByIssuer.forEach((v, key) => {
      const id = key.split('|')[0];
      const c = byId.get(id);
      const outUSD = c ? (c.debtTranches || []).reduce((a: number, t) => {
        const cls = t.isCommercialPaper ? 'COMMERCIAL_PAPER' : t.rateType === 'FIXED' ? 'CORP_BOND' : 'LEVERAGED_LOAN';
        return a + (cls === v.cls ? t.principalLocal : 0);
      }, 0) : 0;
      const excess = v.usd - outUSD;
      if (excess > 50e6) {
        const flag = !c ? 'GONE' : c.isBankEntity ? 'BANK' : c.isDefaulted ? 'DEAD' : c.mergerAcquired ? 'MERGED' : 'live';
        rows.push(`${(excess / 1e6).toFixed(0)}M ${v.cls} ${c?.ticker ?? id} [${flag}]`
          + ` out ${(outUSD / 1e6).toFixed(0)}M cash ${((c ? cashOf(ensureV2(state), c) : 0) / 1e6).toFixed(0)}M`);
      }
    });
    if (rows.length > 0) console.log(`  [mint] w${week} excess>50M: ${rows.sort((a, b) => parseFloat(b) - parseFloat(a)).slice(0, 12).join(' | ')}`);
    // The top excess name's holders, so the unswept path names itself.
    let topId = ''; let topExcess = 0;
    heldByIssuer.forEach((v, key) => {
      const id = key.split('|')[0];
      const c = byId.get(id);
      const outUSD = c ? (c.debtTranches || []).reduce((a: number, t) => {
        const cls = t.isCommercialPaper ? 'COMMERCIAL_PAPER' : t.rateType === 'FIXED' ? 'CORP_BOND' : 'LEVERAGED_LOAN';
        return a + (cls === v.cls ? t.principalLocal : 0);
      }, 0) : 0;
      if (v.usd - outUSD > topExcess) { topExcess = v.usd - outUSD; topId = id; }
    });
    if (topId) {
      const holders: string[] = [];
      state.institutionalEntities.forEach((e) => {
        if (e.isDefaulted) return;
        const usd = e.itemizedHoldings.reduce((a: number, h) =>
          a + (h.instrumentId === topId ? (h.quantityOrNotionalUSD ?? 0) : 0), 0);
        if (usd > 100e6) holders.push(`${e.id}:${(usd / 1e6).toFixed(0)}M[${e.entityType}${e.region === byId.get(topId)?.region ? '' : '/x-border'}]`);
      });
      console.log(`  [mint-top] ${byId.get(topId)?.ticker}: ${holders.sort((a, b) => parseFloat(b.split(':')[1]) - parseFloat(a.split(':')[1])).slice(0, 6).join(' ')}`);
    }
  }

  // OWN_TRACE=1 — the COVERAGE, both sides: what the register and every named desk hold of each
  // kind against the ladders' face (the battery below reports only the "over" side).
  if (process.env.OWN_TRACE === '1') {
    const deskUSD: Record<string, { corp: number; loan: number; cp: number }> = {};
    regionIds.forEach((r) => { deskUSD[r] = { corp: 0, loan: 0, cp: 0 }; });
    state.companies.forEach((c) => {
      const inv = c.bankBalanceSheet?.dealerDeskInventory; if (!inv || !deskUSD[c.region]) return;
      (inv['corporate bond'] ?? []).forEach((p) => { deskUSD[c.region].corp += p.inventoryLocal; });
      (inv['leveraged loan'] ?? []).forEach((p) => { deskUSD[c.region].loan += p.inventoryLocal; });
    });
    // `held` already folds the desks in through the region's desk view; the named desks are shown inside it.
    console.log(`  [own-trace] w${week}: ` + regionIds.map((r) => `${r} corp ${(held[r].corp / 1e9).toFixed(2)} (desks ${(deskUSD[r].corp / 1e9).toFixed(2)}) of ${(outstanding[r].corp / 1e9).toFixed(2)}B | loan ${(held[r].loan / 1e9).toFixed(2)} (desks ${(deskUSD[r].loan / 1e9).toFixed(2)}) of ${(outstanding[r].loan / 1e9).toFixed(2)}B | cp ${(held[r].cp / 1e9).toFixed(2)} of ${(outstanding[r].cp / 1e9).toFixed(2)}B`).join(' || '));
  }
  regionIds.forEach((r) => {
    const cases: [string, number, number][] = [
      ['corporate bonds', held[r].corp, outstanding[r].corp],
      ['leveraged loans', held[r].loan, outstanding[r].loan],
      ['sovereign bonds', held[r].sov, outstanding[r].sov],
      ['commercial paper', held[r].cp, outstanding[r].cp],
    ];
    cases.forEach(([label, h, o]) => {
      if (o <= 0) return;
      if (h > o * 1.02) {
        out.push({
          week,
          message: `${r} ${label}: real books hold ${(h / 1e9).toFixed(1)}B against ${(o / 1e9).toFixed(1)}B outstanding (${((h / o - 1) * 100).toFixed(1)}% over) — a ledger is minting claims`
        });
      }
    });
  });
  return out;
}

/** A region's institutional book — cash (the account, §5-WIRES A3.2), repo lent, the rows. */
const institutionalBookOf = (s: GameState, region: RegionId) =>
  (s.institutionalEntities || [])
    .filter((e) => e.region === region && !e.isDefaulted
      && e.entityType !== 'MONEY_MARKET_FUND' && e.entityType !== 'ETF')
    .reduce(
      (sum, e) =>
        sum + entityCashOf(ensureV2(s), e) + ((e as { repoLentLocal?: number }).repoLentLocal ?? 0) + ((e as { rrpLentUSD?: number }).rrpLentUSD ?? 0)
          + e.itemizedHoldings.reduce((x, h) => x + h.quantityOrNotionalUSD, 0),
      0
    );
/** Read at the close of each week, never off the previous state object: the persistent
 *  account store is one object shared by every week's state (§7.354's lesson, again). */
const institutionalBooksOf = (s: GameState) => new Map(REGION_IDS_SEED_ORDER.map((r) => [r, institutionalBookOf(s, r)]));

function checkInstitutionalBookConservation(prevBooks: Map<RegionId, number>, state: GameState, week: number) {
  // The 5% band asserts a CLOSED book: securities and cash trade against each other, so the
  // total moves only by marks and small boundary flows. MMFs and ETFs are excluded because
  // their books are externally funded BY DESIGN — a subscription grows assets and the share
  // liability together (HH3 made this bind: AP capacity runs off real bank equity, so the
  // funds fill at the real pipe's speed) — and for the money fund the sharper identity is
  // asserted below instead: a $1-NAV book equals its shares outstanding.
  REGION_IDS_SEED_ORDER.forEach((region) => {
    const before = prevBooks.get(region) ?? 0;
    const after = institutionalBookOf(state, region);
    if (!(before > 0)) return;
    const changePct = Math.abs(after - before) / before;
    // §7.341: 10%, not 5% — the book is MARKED, and since the damper adapts (§7.338, a name
    // bound k weeks gets a (1+k)× cap) a region's institutional book can legitimately re-mark
    // by more than 5% in one week (JPN +6.7% at week 22, no leg missing). A missing cash leg
    // is tens of per cent; the check keeps that purpose.
    if (changePct > 0.10) {
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
        const bookUSD = entityCashOf(ensureV2(state), mmf) + ((mmf as { repoLentLocal?: number }).repoLentLocal ?? 0)
          + ((mmf as { rrpLentUSD?: number }).rrpLentUSD ?? 0)
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
/**
 * SETL1/SETL6 — the settlement layer's own two proofs, asserted rather than assumed.
 *
 *  - `unresolvedUSD` is money that found no account: a party that does not exist, or a holder
 *    with no bank. Non-zero means dollars left the system, which is the §7.86 defect's shape.
 *  - `clearingHouseResidualUSD` is what the cleared books' central counterparty was left
 *    holding. A CCP is on both sides of every trade, so it is flat by construction; a residual
 *    means a book settled one side of a session and not the other.
 *  - `centralBankResidualUSD` is bank reserves plus the treasury account net of what the
 *    central bank issued: its liabilities move between buckets, and new ones come from one
 *    place only.
 *
 * The layer computed these from the day it existed and nothing ever read them.
 */
function checkSettlementClosed(state: GameState, week: number) {
  const s = state.lastSettlement;
  if (!s) return;
  if (Math.abs(s.unresolvedUSD ?? 0) > 1e6) {
    violations.push({
      week,
      message: `settlement left ${((s.unresolvedUSD ?? 0) / 1e9).toFixed(3)}B unresolved — a payment found no account`,
    });
  }
  if (Math.abs(s.clearingHouseResidualUSD ?? 0) > 1e6) {
    violations.push({
      week,
      message: `clearing house left holding ${((s.clearingHouseResidualUSD ?? 0) / 1e9).toFixed(3)}B — a cleared book settled one side only`,
    });
  }
  if (Math.abs(s.centralBankResidualUSD ?? 0) > 1e6) {
    violations.push({
      week,
      message: `central bank liabilities moved by ${((s.centralBankResidualUSD ?? 0) / 1e9).toFixed(3)}B outside its own issuance — reserves and the treasury account did not net`,
    });
  }
}

/**
 * GUARD — the three invariants that would each have caught a defect this project's review found
 * by hand. They are cheap and they are about SHAPE, not level: a share that does not sum to one,
 * a market that transacts nothing, a ceiling that cannot be exceeded.
 */
function checkGuards(state: GameState, week: number) {
  // 1. A category's shares sum to one. The 646% enterprise-software category — 40 financial
  //    firms registered as suppliers into the goods auction — went unseen for the model's whole
  //    life, and this is the line that sees it the week it appears.
  const shareBySubUnit = new Map<string, number>();
  state.companies.forEach((c: Company) => {
    if (c.isDefaulted || c.mergerAcquired) return;
    (c.productLines || []).forEach((pl: ProductLine) => {
      const key = `${c.region}:${pl.subUnitId}`;
      shareBySubUnit.set(key, (shareBySubUnit.get(key) ?? 0) + (pl.categoryMarketShare ?? 0));
    });
  });
  shareBySubUnit.forEach((share, key) => {
    if (share > 1.02 || share < 0.5) {
      violations.push({
        week,
        message: `${key}: supplier market shares sum to ${(share * 100).toFixed(0)}% — a category cannot be more (or much less) than fully supplied`,
      });
    }
  });

  // 2. A market with willing parties on both sides that transacts nothing is a defect, not a
  //    quiet pass. The repo market ran at ZERO volume in all four regions for ten weeks while
  //    the corridor assertion below passed VACUOUSLY: with no borrower the session returns the
  //    ON RRP floor as a literal, and a literal is trivially inside the corridor (§7.102).
  REGION_IDS.forEach((regionId) => {
    const reg = state.regions[regionId];
    // Measured BY THE SESSION, not reconstructed from end-of-week sheets: a bank short of its
    // buffer at the close was not necessarily short when the session ran, and a bank short of
    // its buffer with no unencumbered collateral cannot borrow at any price — a real constraint,
    // not a dead market. `fundableNeedUSD` is what a borrower could actually fund.
    const needUSD = reg?.repoFundableNeedUSD ?? 0;
    const clearedUSD = reg?.repoClearedVolumeUSD ?? 0;
    if (needUSD > 0 && !(clearedUSD > 0)) {
      violations.push({
        week,
        message: `${regionId} repo: ${(needUSD / 1e9).toFixed(2)}B of fundable borrowing need and the session cleared ZERO volume — the printed rate is the early-return default, not a market`,
      });
    }
  });

  // 3. A holding CEILING may not equal the position it bounds. `investableSurplusUSD` was the
  //    balance-sheet identity rearranged, so every bank's `maxHoldingUSD` came out at exactly
  //    its own book and no bank could buy a bond — a constraint that binds identically on
  //    everyone, every week, is an identity wearing a constraint's name (§7.102).
  (state.lastWeekDeadCeilingBooks ?? []).forEach((book: string) => {
    violations.push({
      week,
      message: `${book} book: no participant's holding ceiling exceeds its own position — the ceiling is an identity, and this market cannot trade at any price`,
    });
  });
}

function checkCentralBankIdentity(state: GameState, week: number) {
  REGION_IDS_SEED_ORDER.forEach((region) => {
    const cb = state.regions[region]?.centralBankSheet;
    if (!cb) return;
    const reserves = state.companies
      .filter((c) => c.region === region && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet)
      .reduce((a, c) => a + bankReservesOf(ensureV2(state), c.ticker), 0);
    // XB5: the asset side is the sovereign book PLUS the FX reserves. Leaving the reserves out
    // here while the engine counts them made the identity fail by exactly their size — 231 of
    // 273 violations at the XB close, and a harness bug rather than an engine one.
    const sovereignBook = Object.values(cb.sovereignHoldingsByBond || {}).reduce((a, v) => a + (Number(v) || 0), 0);
    const fxBook: Record<string, number> = cb.fxReservesByRegion ?? {};
    const fxReserves = Object.keys(fxBook).reduce((a, k) => a + (Number(fxBook[k]) || 0), 0);
    const assets = sovereignBook + fxReserves;
    // §5-CLOSE: the identity itself is the audit's M1 (scripts/audit/money.ts), asserted to the
    // dollar with no unbacked term; what stays here are the central bank's own operating rules.
    void assets; void reserves;
    // A3.5: the treasury cannot overdraw — the negative side of its account row is the advance.
    // PUB2b: the book may only move by redemption and by fills against an order it actually
    // placed. A week whose fill exceeds the order is the auction handing the central bank paper
    // it never bid for — the forced-placement failure mode, in the other direction.
    const orderedUSD = cb.lastOrderPlacedUSD ?? 0;
    const filledUSD = cb.lastOpenMarketPurchasesUSD ?? 0;
    // §7.246: the `orderedUSD > 0` arm made this VACUOUS in exactly the failure it exists for —
    // a fill against NO order is the purest forced placement, and the guard skipped it.
    if (filledUSD > 0 && filledUSD > orderedUSD * 1.01 + 1e6) {
      violations.push({
        week,
        message: `${region} central bank filled ${(filledUSD / 1e9).toFixed(2)}B against an order of ${(orderedUSD / 1e9).toFixed(2)}B`,
      });
    }
    if (Object.values(cb.sovereignHoldingsByBond || {}).some((v) => (Number(v) || 0) < -1)) {
      violations.push({ week, message: `${region} central bank holds a negative position` });
    }
    // PUB1e: the government cannot buy more than it appropriated, and what left the account is
    // exactly interest + transfers + what it actually bought.
    const reg = state.regions[region];
    const outlays = reg.governmentOutlaysUSD;
    if (outlays !== undefined) {
      const spent = reg.governmentProcurementSpentUSD ?? 0;
      const unspent = reg.unspentProcurementBudgetUSD ?? 0;
      // §5-STRUCT step 3 — ASK THE GOVERNMENT, and this is why the §6.1 row never closed. The
      // check used to read `outlays > governmentSpendingWeeklyUSD * 1.5`: a stated 50% tolerance against
      // a number that is NOT the budget. The budget is the decomposition — contractual interest
      // and payroll off the top, the discretionary remainder scaled by the fiscal stance — and it
      // was computed inside a stage with no name anyone could read from here. Both sides now come
      // off `Government`, so the check and the engine cannot disagree, and the message says which
      // half overran because contractual lines never can.
      const gov = governmentOf(region, reg, materializeGovLadder(ensureV2(state), region));
      const { overrunUSD, contractualUSD, discretionaryUSD } = gov.overrun();
      if (spent > 0 && overrunUSD > 1e6) {
        violations.push({
          week,
          message: `${region} government outlays ${(outlays / 1e9).toFixed(2)}B exceed its budget ${((outlays - overrunUSD) / 1e9).toFixed(2)}B by ${(overrunUSD / 1e9).toFixed(2)}B — contractual ${(contractualUSD / 1e9).toFixed(2)}B, discretionary ${(discretionaryUSD / 1e9).toFixed(2)}B`,
        });
      }
      if (spent < 0 || unspent < 0) {
        violations.push({ week, message: `${region} government procurement is negative` });
      }
    }
  });
}

function checkLaborMarketIdentity(state: GameState, week: number) {
  REGION_IDS_SEED_ORDER.forEach((region) => {
    const reg = state.regions[region];
    if (!reg?.occupationPools) return;
    const employerHeadcount = state.companies
      .filter((c) => c.region === region && isActiveCompany(c))
      .reduce((a, c) => a + c.employeeCount, 0) // §7.246: unclamped (§7.46 L7)
      + (reg.smePools || []).reduce((a, s) => a + s.employment, 0)
      + reg.governmentEmployment;
    const poolEmployed = Object.values(reg.occupationPools).reduce((a: number, p: OccupationPool) => a + (p.employed ?? 0), 0);
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
  REGION_IDS_SEED_ORDER.forEach((region) => {
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
    // THE IDENTITY NOW RUNS THE OTHER WAY. It used to assert that cohort savings hit the
    // aggregate rate's target — a check that the λ-normalisation had forced the parts to match
    // an imposed whole, and it carried `Math.max(0, savingsRate)` because a rate that could not
    // be negative was the point. Since the rate is DERIVED from the cohorts' own budgets it is
    // signed, and what must hold is that the published rate is exactly what they add up to.
    const impliedRate = agg > 0 ? sumSavings / agg : 0;
    if (agg > 0 && Math.abs(impliedRate - (hs.savingsRate ?? 0)) > 1e-3) {
      violations.push({
        week,
        message: `${region}: cohort savings imply a rate of ${(impliedRate * 100).toFixed(2)}% but the sector publishes ${(((hs.savingsRate ?? 0)) * 100).toFixed(2)}% — the savings rate is not the cohorts' own measurement`,
      });
    }
    // HH4d: ONE household deposit stock. The household state's line plus the in-flight ETF
    // settlement must equal the named banks' summed household-deposit lines — the 418B drift
    // between two formula-fed representations is the defect this check keeps dead.
    const bankDepositsUSD = state.companies
      .filter((c) => c.region === region && c.isBankEntity && !c.isDefaulted && !c.mergerAcquired && c.bankBalanceSheet)
      .reduce((a, c) => a + householdDepositsAt(ensureV2(state), c.ticker, currencyOf(c.region)), 0);
    if (bankDepositsUSD > 0) {
      const hsView = householdDepositsOf(ensureV2(state), region);
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
      const tierSum = Object.values(wd).reduce((a: number, t: { shareOfNetWorthUSD?: number }) => a + (t.shareOfNetWorthUSD ?? 0), 0);
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
    .reduce((sum, e) => sum + ((e as { beneficiaryLiabilityUSD?: number }).beneficiaryLiabilityUSD ?? 0), 0);
  const heldLocal = REGION_IDS_SEED_ORDER
    .reduce((sum, r) => sum + (state.regions[r]?.householdState?.institutionalClaimsUSD ?? 0), 0);
  if (owedUSD <= 0 && heldLocal <= 0) return;
  const gapUSD = Math.abs(owedUSD - heldLocal);
  if (gapUSD / Math.max(1, owedUSD) > 0.001) {
    violations.push({
      week,
      message:
        `Beneficiary claims do not reconcile: institutions owe ${(owedUSD / 1e9).toFixed(1)}B, ` +
        `households hold ${(heldLocal / 1e9).toFixed(1)}B (gap ${(gapUSD / 1e9).toFixed(1)}B). ` +
        `A reserve or entitlement is an asset on one book and a liability on another, never one alone.`,
    });
  }
}

/**
 * IND10 — a production pipeline is exactly as long as the good's production lead.
 *
 * The identity, not the behaviour: a queue whose index i completes in i weeks has `lead` slots,
 * always. A shorter one is a pipeline that got dropped and rebuilt from nothing somewhere (the
 * §7.41 trap), a longer one is one being advanced twice in a week.
 */
function checkProductionPipelines(state: GameState, week: number) {
  state.companies.forEach(c => {
    const wip = c.wipBySubUnit as unknown as Record<string, { units: number }[]> | undefined;
    if (!wip) return;
    Object.entries(wip).forEach(([subUnitId, queue]) => {
      const lead = productionLeadWeeksOf(subUnitId);
      if (queue.length !== lead) {
        violations.push({
          week,
          message: `${c.ticker}: ${subUnitId} pipeline holds ${queue.length} weeks against a ${lead}-week production lead`,
        });
      }
      if (queue.some(l => isNaN(l.units) || !isFinite(l.units))) {
        violations.push({ week, message: `${c.ticker}: NaN in the ${subUnitId} production pipeline` });
      }
    });
  });
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

  const idx = state.compositeIndices;
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
      // OWN1: every share here is measured off the register, which attributes a holding to its
      // ISSUER's region — so a foreign fund's paper is already INSIDE `institutionalShare` and
      // there is nothing separate to add. (This comment used to say foreign ownership was "not
      // part of this conservation sum"; that was true before OWN1 and has been wrong since.)
      // The three named holders plus the household residual are the whole of it, so a sum above
      // one is holders owning more than exists — a real defect, never a keying artifact.
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
  // §7.246: the engine's own NAV (13-news-and-turn-summary) is UNCLAMPED — cash plus unrealized
  // P&L, negative included (negative is how the game ends). Clamping here checked a different
  // definition than the one stored.
  const expectedNav = state.portfolio.cashLocal + totalUnrealizedPnL;
  const diff = Math.abs(state.portfolio.navUSD - expectedNav);
  if (diff > 0.01) {
    violations.push({
      week,
      message: `NAV identity mismatch: portfolio.navUSD=${state.portfolio.navUSD}, expected=${expectedNav} (cash=${state.portfolio.cashLocal}, unrealized=${totalUnrealizedPnL})`
    });
  }
}


function checkMarkToMarketUnfreezesPortfolio(): Violation | null {
  const seedState = createInitialGameState(SEED);
  const company = seedState.companies[0];
  const posData: Parameters<typeof executeTrade>[1] = {
    assetType: 'EQUITY',
    symbol: company.ticker,
    name: company.name,
    region: company.region,
    dealerId: 'invariants-test-dealer',
    direction: 'LONG',
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
  // (bankEquityLocal / sectorEquityUSD) that the clearing engine stopped reading when sovereign
  // demand became per-bank reserve arbitrage (S2) and per-entity budgets (S11) — so baseline and
  // shocked runs were identical to 8 decimal places and the check was testing nothing. An
  // under-subscribed auction is buyers with no money: drain every USA bank's real reserves (the
  // funding for their bond bids) and every USA institution's real cash (their budgets).
  shocked.companies.forEach(c => {
    if (c.region === 'USA' && c.bankBalanceSheet) {
      const beforeUSD = bankReservesOf(ensureV2(shocked), c.ticker);
      adjustBankReserves(ensureV2(shocked), c.ticker, beforeUSD * 0.01 - beforeUSD); // the drain: the account keeps 1%
      // WS6 taught the check the same lesson S6 did, one field later: with a repo market, a
      // bank with drained CASH still bids — it funds the purchase secured against its
      // collateral, which is exactly why real sovereign auctions rarely fail. "Buyers with no
      // money" now means no cash AND no unencumbered collateral to borrow against.
      const sovUSD = Object.values((c.bankBalanceSheet.sovereignBondHoldingsByBond || {}) as Record<string, number>)
        .reduce((a, v) => a + (Number(v) || 0), 0);
      c.bankBalanceSheet.repoEncumberedCollateralUSD = sovUSD;
    }
  });
  // XB1: foreign institutions bid in this auction too, so starving only the DOMESTIC ones no
  // longer under-subscribes it — foreign demand absorbs the paper, which is the mechanism
  // working. A genuinely under-subscribed auction now means every eligible bidder is out of money.
  { const sv2 = ensureV2(shocked); shocked.institutionalEntities.forEach(e => { resetAccount(sv2, { kind: 'INSTITUTION', id: e.id }, currencyOf(e.region), 0); }); }

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

// §7.246 — the trade-fee "conservation" check is DELETED, per §7.234's precedent for a check
// that asserts against a world that no longer exists. It executed a fake trade against
// `dealerId: 'alpha'` (no such bank since G3b deleted the invented dealer system), read the
// REGIONAL AGGREGATE bankEquityLocal that `executeTrade` never touches, and asserted an identity
// that is itself non-conserving (bank credited spread + fee while the user is debited spread
// alone). It fired as a pre-run violation on every run since G3. A player-trade fee check worth
// having reads the named dealer bank's own book — a new check to design deliberately, not this
// one revived.

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
  const series: Record<string, number[]> = { u: [], v: [], wage: [], tight: [], netWorth: [], consumption: [], infl: [] };
  return {
    name: 'HH battery',
    week(_prev, s) {
      const reg = s.regions.USA; const hs = reg.householdState;
      const pools = reg.occupationPools;
      series.u.push(reg.unemploymentRate);
      series.v.push(reg.vacancyRate ?? 0);
      series.tight.push(reg.laborMarketTightness ?? 0);
      series.wage.push(Object.values(pools).reduce((a: number, p: OccupationPool) => a + p.wageGrowthAnnual, 0) / 5);
      series.netWorth.push(hs.netWorthUSD ?? 0);
      series.infl.push(reg.inflation);
      series.consumption.push((hs.cohorts ?? []).reduce((a, c) => a + c.consumptionBudgetUSD, 0));
    },
    report(s, weeks) {
      const out: string[] = [];
      out.push('--- claims reconcile (both directions) ---');
      REGIONS.forEach(r => {
        const reg = s.regions[r]; const hs = reg.householdState;
        const instLiab = s.institutionalEntities.filter(e => e.region === r && !e.isDefaulted)
          .reduce((a, e) => a + (e.beneficiaryLiabilityUSD ?? 0), 0);
        const held = hs.institutionalClaimsUSD ?? 0;
        const gap = Math.abs(instLiab - held) / Math.max(1, instLiab);
        const nwParts = householdDepositsOf(ensureV2(s), r) + (hs.mmfSharesUSD ?? 0) + (hs.equityHoldingsUSD ?? 0)
          + (hs.housingStockUSD ?? 0)
          - ((hs.mortgageDebtUSD ?? 0) + (hs.creditCardDebtUSD ?? 0) + (hs.otherConsumerLoanDebtUSD ?? 0));
        const nwGap = Math.abs(nwParts - (hs.netWorthUSD ?? 0)) / Math.max(1, Math.abs(hs.netWorthUSD ?? 1));
        const tierSum = Object.values(reg.wealthDistribution).reduce((a: number, t: { shareOfNetWorthUSD: number }) => a + t.shareOfNetWorthUSD, 0);
        const tierGap = Math.abs(tierSum - (hs.netWorthUSD ?? 0)) / Math.max(1, Math.abs(hs.netWorthUSD ?? 1));
        const bankDeposits = s.companies
          .filter(c => c.region === r && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet)
          .reduce((a, c) => a + householdDepositsAt(ensureV2(s), c.ticker, currencyOf(c.region)), 0);
        const depGap = Math.abs(householdDepositsOf(ensureV2(s), r) - bankDeposits) / Math.max(1, bankDeposits);
        out.push(`  ${r}: instLiab=${B(instLiab)} held=${B(held)} (gap ${pct(gap)}) | netWorth parts gap ${pct(nwGap)} | tier-sum gap ${pct(tierGap)} | deposits-vs-banks gap ${pct(depGap)}`);
      });
      out.push('--- household liquidity: how many weeks of committed outflow the cash covers ---');
      REGIONS.forEach(r => {
        const h = s.regions[r].householdState;
        const hDepositsUSD = householdDepositsOf(ensureV2(s), r);
        const dep = Math.max(0, hDepositsUSD + (h.mmfSharesUSD ?? 0));
        const ds = Math.max(0, h.weeklyDebtServiceUSD ?? 0);
        const cons = Math.max(0, s.regions[r].estimatedHouseholdIncomeUSD) * (1 - (h.savingsRate ?? 0)) / 52;
        const committed = ds + cons;
        // Any forced-selling or buffer rule is a THRESHOLD on this number. If the cash covers
        // hundreds of weeks of outflow, no such threshold can ever be crossed and a rule built on
        // one would be a mechanism that binds on nothing (§7.146, §7.149, §7.159).
        out.push(`  ${r}: liquid ${B(dep)} vs committed ${B(committed)}/wk = ${(committed > 0 ? dep / committed : 0).toFixed(1)} weeks of cover | savings rate ${pct(h.savingsRate ?? 0)} | income ${B(s.regions[r].estimatedHouseholdIncomeUSD)}`);
        // HOW FAR IS THE FORCED-SALE THRESHOLD? A household sells only what its deposits above
        // the buffer cannot cover, so the distance is the headroom divided by the weekly gap.
        // Printing it keeps "not firing" an observation about CONDITIONS rather than a mechanism
        // that binds on nothing — the failure mode this project keeps finding (§7.146, §7.159).
        const incomeUSD = Math.max(0, s.regions[r].estimatedHouseholdIncomeUSD);
        const floorUSD = (incomeUSD / 52) * 12;
        const headroomUSD = Math.max(0, hDepositsUSD - floorUSD);
        const gapUSD = Math.max(0, -(incomeUSD * (h.savingsRate ?? 0)) / 52);
        // What a forced sale could actually REACH. Only fund shares are sellable: household
        // direct equity and private business have no trading channel, so they are wealth the
        // household cannot turn into cash however badly it needs to.
        const etfRows = h.etfShares ?? [];
        const sellableUSD = etfRows.reduce((a: number, x) => {
          const f = s.institutionalEntities?.find((e: InstitutionalEntity) => e.id === x.fundId);
          const sh = f?.etf?.sharesOutstanding ?? 0;
          const nav = sh > 0 && f ? ((f.itemizedHoldings ?? []).reduce((b: number, hh: ItemizedHolding) => b + (hh.quantityOrNotionalUSD ?? 0), 0) + Math.max(0, f ? entityCashOf(ensureV2(s), f) : 0)) / sh : 0;
          return a + (x.shares ?? 0) * nav;
        }, 0);
        out.push(`      deposit headroom over the buffer ${B(headroomUSD)} vs a ${B(gapUSD)}/wk gap = ${gapUSD > 0 ? (headroomUSD / gapUSD).toFixed(0) : '∞'} weeks before forced selling starts`);
        out.push(`      sellable (fund shares) ${B(sellableUSD)} of ${B(h.equityHoldingsUSD ?? 0)} total household equity — the rest has no trading channel`);
      });
      out.push('--- the mortgage book as a CROSS-SECTION: E[f(LTV)] against f(E[LTV]) ---');
      REGIONS.forEach(r => {
        const price = Math.max(0, s.regions[r].housingMarket?.medianHomePriceUSD ?? 0);
        const vs: MortgageVintage[] = [];
        s.companies.forEach(c => {
          if (c.region !== r || !c.bankBalanceSheet) return;
          (c.bankBalanceSheet!.householdLoans ?? []).forEach((pl: HouseholdLoanPool) => {
            if (pl.kind === 'MORTGAGE') (pl.vintages ?? []).forEach((v) => vs.push(v));
          });
        });
        if (vs.length === 0) { out.push(`  ${r}: no vintages`); return; }
        const book = vs.reduce((a, v) => a + v.principalLocal, 0);
        const ltvOf = (v: MortgageVintage) => vintageCurrentLtv(v, price);
        const sev = mortgageSeverityAtLtv;
        // E[f(LTV)] — principal-weighted over the real cross-section, which is what the engine
        // now charges. f(E[LTV]) — the single average the engine used to charge. The ratio is
        // the size of the Jensen gap that was being thrown away.
        const eOfF = vs.reduce((a, v) => a + v.principalLocal * sev(ltvOf(v)), 0) / Math.max(1, book);
        const meanLtv = vs.reduce((a, v) => a + v.principalLocal * ltvOf(v), 0) / Math.max(1, book);
        const fOfE = sev(meanLtv);
        const sorted = vs.map(ltvOf).sort((a, b) => a - b);
        const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
        const underwaterUSD = vs.filter(v => ltvOf(v) > 0.75).reduce((a, v) => a + v.principalLocal, 0);
        out.push(`  ${r}: ${vs.length} vintages, ${B(book)} | LTV p10 ${q(0.1).toFixed(2)} p50 ${q(0.5).toFixed(2)} p90 ${q(0.9).toFixed(2)} (mean ${meanLtv.toFixed(3)})`);
        out.push(`      E[f(LTV)] ${eOfF.toFixed(4)}  vs  f(E[LTV]) ${fOfE.toFixed(4)}  = ${(eOfF / Math.max(1e-9, fOfE)).toFixed(2)}x  | above the kink: ${pct(book > 0 ? underwaterUSD / book : 0)} of the book`);
        // CAN THIS BOOK HAVE A CREDIT EVENT? An analytic stress on the CURRENT cross-section —
        // not a simulation, just the same severity curve at marked-down collateral — against
        // what the old single-average LTV would have said at the same price fall. The old book
        // divided total mortgage debt by the WHOLE housing stock (outright-owned homes included)
        // and got 0.34, so no fall short of ~55% moved it off the floor at all.
        const oldStyleLtv = (() => {
          const h = s.regions[r].householdState;
          const stock = Math.max(0, h.housingStockUSD ?? 0);
          return stock > 0 ? Math.max(0, h.mortgageDebtUSD ?? 0) / stock : 0;
        })();
        // HSG — does the RATE reach a borrower? Two things it must do: shrink what a household
        // can borrow (affordability), and reach households who already borrowed (resets).
        const reg2 = s.regions[r];
        const hh = Math.max(1, (reg2.totalPopulation ?? 0) / 2.5);
        const wkInc = Math.max(0, reg2.estimatedHouseholdIncomeUSD) / 52 / hh;
        const mortRate = Math.max(0.005, (reg2.zeroRates?.tenor10Y ?? reg2.policyRate) + 0.017);
        const afford = (rate: number) => {
          const rw = Math.max(0.00001, rate / 52);
          const af = rw / (1 - Math.pow(1 + rw, -30 * 52));
          return (wkInc * 0.35) / af;
        };
        // Affordability is a constraint WITH SLACK, not a dead one: report where it starts to
        // bind, so "it is not binding" is a statement about house prices rather than about the
        // mechanism. A DSTI limit is supposed to have slack in a cheap market and bite in an
        // expensive one — that is what caps a housing boom.
        const priceToIncome = price / Math.max(1, wkInc * 52);
        const bindsAbove = (afford(mortRate) / Math.max(1, wkInc * 52)) / 0.80;
        out.push(`      rate ${pct(mortRate)}: affordable LTV ${(afford(mortRate) / Math.max(1, price)).toFixed(2)} (cap 0.80) | at +300bps ${(afford(mortRate + 0.03) / Math.max(1, price)).toFixed(2)}`);
        out.push(`      house price ${priceToIncome.toFixed(1)}x income; the DSTI limit starts binding above ${bindsAbove.toFixed(1)}x — slack, not inert`);
        const resettingUSD = vs.filter((v) => v.fixedForWeeks <= 52).reduce((a, v) => a + v.principalLocal, 0);
        const coupons = vs.map((v) => v.rateAnnual).sort((a, b) => a - b);
        out.push(`      coupons p10 ${pct(coupons[Math.floor(coupons.length * 0.1)])} p90 ${pct(coupons[Math.floor(coupons.length * 0.9)])} | resetting within a year: ${pct(book > 0 ? resettingUSD / book : 0)} of the book`);
        [0.20, 0.35].forEach(fall => {
          const k = 1 / (1 - fall);
          const stressed = vs.reduce((a, v) => a + v.principalLocal * sev(ltvOf(v) * k), 0) / Math.max(1, book);
          const oldStressed = sev(oldStyleLtv * k);
          out.push(`      −${(fall * 100).toFixed(0)}% homes: severity ${stressed.toFixed(4)} (${(stressed / Math.max(1e-9, eOfF)).toFixed(1)}x today)   [one-average book would say ${oldStressed.toFixed(4)}, ${(oldStressed / 0.05).toFixed(1)}x its floor]`);
        });
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
  const reg = s.regions[region];
  const cb = sovereignCouponByBond(materializeGovLadder(ensureV2(s), region));
  const rate = (id: string) => cb[id] ?? 0;
  const banks = s.companies
    .filter((c: Company) => c.region === region && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet)
    .reduce((a: number, c: Company) => a + Object.entries(c.bankBalanceSheet!.sovereignBondHoldingsByBond || {})
      .reduce((x: number, [k, v]) => x + ((Number(v) || 0) * (cb[k] ?? 0)) / 52, 0), 0);
  const insts = s.institutionalEntities
    .filter((e: InstitutionalEntity) => e.region === region && !e.isDefaulted)
    .reduce((a: number, e: InstitutionalEntity) => a + (e.itemizedHoldings || [])
      .filter((h: ItemizedHolding) => h.instrumentType === 'GOV_BOND' && h.issuerRegion === region)
      .reduce((x: number, h: ItemizedHolding) => x + ((h.quantityOrNotionalUSD ?? 0) * rate(h.instrumentId)) / 52, 0), 0);
  const central = Object.entries(reg.centralBankSheet?.sovereignHoldingsByBond || {})
    .reduce((a: number, [k, v]: [string, unknown]) => a + ((Number(v) || 0) * (cb[k] ?? 0)) / 52, 0);
  const paid = weeklyInterestExpenseUSD(materializeGovLadder(ensureV2(s), region));
  return { paid, banks, insts, central };
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
      const reg = s.regions.USA;
      const cb = reg.centralBankSheet;
      const dec = decomposeGovernmentSpending(reg.governmentSpendingWeeklyUSD, reg.governmentInterestWeeklyUSD ?? 0,
        GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore);
      series.interestShare.push(dec.interestUSD / Math.max(1, reg.governmentSpendingWeeklyUSD));
      series.procShare.push(dec.procurementBudgetUSD / Math.max(1, reg.governmentSpendingWeeklyUSD));
      series.procSpent.push(reg.governmentProcurementSpentUSD ?? 0);
      series.unspentProc.push(reg.unspentProcurementBudgetUSD ?? 0);
      series.stance.push(reg.fiscalStanceScore);
      series.tga.push(treasuryAccountOf(ensureV2(s), 'USA'));
      series.cbBook.push((cb ? centralBankAssetsUSD(cb, waysAndMeansOf(ensureV2(s), 'USA')) : 0));
      series.reinvest.push(cb?.reinvestmentShare ?? 1);
      series.remit.push(cb?.lastRemittanceUSD ?? 0);
      series.policy.push(reg.policyRate);
      series.revenue.push(reg.governmentRevenueUSD);
      series.outlays.push(reg.governmentOutlaysUSD ?? 0);
      series.cmb.push(reg.cashBridgeBillIssuanceUSD ?? 0);
      series.debtGdp.push(reg.debtToGdpPctBottomUp ?? 0);
      const cbCoupon = couponReceipts(s, 'USA').central * 52;
      series.portYield.push((cb ? centralBankAssetsUSD(cb, waysAndMeansOf(ensureV2(s), 'USA')) : 0) > 0 ? cbCoupon / (cb ? centralBankAssetsUSD(cb, waysAndMeansOf(ensureV2(s), 'USA')) : 0) : 0);
      REGIONS.forEach(r => {
        const rr = s.regions[r];
        if (waysAndMeansOf(ensureV2(s), r) > 0) negativeTga++;
        if (rr.zeroRates.tenor2Y < 0 || rr.zeroRates.tenor10Y < 0) negativeYield++;
      });
    },
    report(s, weeks) {
      const out: string[] = [];
      out.push('--- the coupon reaches a holder, and the government pays it ---');
      REGIONS.forEach(r => {
        const c = couponReceipts(s, r);
        const attributed = c.banks + c.insts + c.central;
        out.push(`  ${r}: paid ${B(c.paid)}/wk = banks ${B(c.banks)} + institutions ${B(c.insts)} + CB ${B(c.central)} = ${B(attributed)} (${pct(attributed / Math.max(1, c.paid))}) [residual ${B(c.paid - attributed)}]`);
      });
      out.push('--- the named gaps (each must fall, none may be assumed away) ---');
      const at = (a: number[], w: number) => (w >= 1 && w <= a.length ? B(a[w - 1]) : 'n/a');
      const marks = [13, 52, weeks].filter((w, i, arr) => w <= weeks && arr.indexOf(w) === i);
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
      out.push(`  TGA range ${B(Math.min(...series.tga))}..${B(Math.max(...series.tga))}; the ways-and-means advance drawn in ${negativeTga} region-weeks; negative nominal yields in ${negativeYield} region-weeks`);
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
        const reg = s.regions[r]; const cb = reg.centralBankSheet;
        const bad: string[] = [];
        const chk = (n: string, v: number | undefined) => { if (v === undefined || !isFinite(v)) bad.push(n); };
        chk('revenue', reg.governmentRevenueUSD); chk('outlays', reg.governmentOutlaysUSD);
        chk('interest', reg.governmentInterestWeeklyUSD); chk('tga', treasuryAccountOf(ensureV2(s), r));
        chk('cbBook', (cb ? centralBankAssetsUSD(cb, waysAndMeansOf(ensureV2(s), r)) : 0)); chk('2Y', reg.zeroRates.tenor2Y); chk('10Y', reg.zeroRates.tenor10Y);
        out.push(`  ${r}: rev ${B(reg.governmentRevenueUSD)} outlays ${B(reg.governmentOutlaysUSD ?? 0)} interest ${B(reg.governmentInterestWeeklyUSD ?? 0)} tga ${B(treasuryAccountOf(ensureV2(s), r))} 2Y ${pct(reg.zeroRates.tenor2Y)} 10Y ${pct(reg.zeroRates.tenor10Y)} ${bad.length ? 'NON-FINITE: ' + bad.join(',') : 'all finite'}`);
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
          materializeGovLadder(ensureV2(x), 'USA').forEach((t: GovDebtTranche) => { t.couponRate = (t.couponRate ?? 0) * 4 + 0.04; });
        }
        const o = { interest: [] as number[], proc: [] as number[], transfers: [] as number[], debt: [] as number[] };
        for (let i = 0; i < horizon; i++) {
          x = advanceWeeklyStep(x);
          const reg = x.regions.USA;
          const dec = decomposeGovernmentSpending(reg.governmentSpendingWeeklyUSD, reg.governmentInterestWeeklyUSD ?? 0,
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
        const price = Number((s.regions.USA.categoryDemand[su.unitId])?.unitPriceUSD) || 1;
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
      out.push('--- MNC: subsidiaries and intra-firm trade (§5-MNC) ---');
      const subs = s.companies.filter((c) => c.parentTicker && isActiveCompany(c));
      out.push(`  subsidiaries ${subs.length}${subs.length > 0
        ? ` (${subs.slice(0, 6).map((c) => `${c.parentTicker}->${c.ticker}@${c.region}`).join(' ')})` : ''}`);
      const groupOf = new Map<string, string>();
      s.companies.forEach((c) => { groupOf.set(c.ticker, c.parentTicker ?? c.ticker); });
      let intraUSD = 0; let crossUSD = 0;
      (s.tradeInvoices ?? []).forEach((inv) => {
        if (inv.sellerRegion === inv.buyerRegion) return;
        const usd = Math.max(0, inv.amountCurrency * inv.bookedUsdPerCurrency);
        crossUSD += usd;
        if (groupOf.get(inv.sellerTicker) !== undefined
          && groupOf.get(inv.sellerTicker) === groupOf.get(inv.buyerTicker)) intraUSD += usd;
      });
      out.push(`  intra-firm share of cross-border invoices: ${crossUSD > 0 ? pct(intraUSD / crossUSD) : 'n/a (no cross-border book)'} [real: ~one third; EMERGES from who owns whom]`);
      out.push('--- transit, the currency boundary, reserves ---');
  // CASH — §5-WIRES A3.6c: the deposit lines ARE the holders' accounts, so 02b's reconcile
  // meter (money moved on a book with no instruction behind it) has nothing left to measure and
  // is gone. What remains is the overdraft count it also kept.
  {
    const overdraftUSD = Number(s.lastCashOverdraftUSD ?? 0);
    if (overdraftUSD > 0) out.push(`  institutions overdrawn (money spent that was not there): ${B(overdraftUSD)}`);
  }

      const inTransit = s.goodsInTransit ?? [];
      out.push(`  consignments in transit ${inTransit.length}  value ${B(inTransit.reduce((a, sh) => a + sh.units * sh.landedCostPerUnit, 0))}; in-place goods ever imported: ${inTransit.filter(sh => deliveryModeOf(sh.subUnitId) === 'IN_PLACE').length} (must be 0)`);
      REGIONS.forEach(r => {
        const fx = getFxToUsd(s.fxPairs, r);
        const mean = Object.values(INDUSTRY_SUBUNITS).flat().reduce((acc, su) => {
          const p = Number((s.regions[r].categoryDemand[su.unitId])?.unitPriceUSD) || 0;
          const pu = Number((s.regions.USA.categoryDemand[su.unitId])?.unitPriceUSD) || 0;
          return p > 0 && pu > 0 ? { n: acc.n + 1, sum: acc.sum + (p * fx) / pu } : acc;
        }, { n: 0, sum: 0 });
        const cb = s.regions[r].centralBankSheet;
        out.push(`  ${r.padEnd(4)} fx ${fx.toFixed(4)}  mean converted price vs USA ${(mean.sum / Math.max(1, mean.n)).toFixed(3)} [1.000 = law of one price]  fxReserves ${B(cb ? centralBankFxReservesUSD(cb) : 0)}`);
      });
      const mfo = s.regions.USA.measuredForeignOwnership;
      out.push(`  USA measured foreign ownership: ${mfo ? JSON.stringify(mfo) : '(not published)'}`);
      return out;
    },
  };
})();

/**
 * IND battery — the industry operating model's own measured numbers.
 *
 * §5-IND's verify list, run on the shared state: production time as a real stock, and whatever
 * later IND slices add. It judges nothing; the numbers are for reading.
 */
const indModule: HarnessModule = (() => {
  // ENGINE V2 (§7.304) — the contract book is columnar; these diagnostics read the table.
  const allContracts = (s: GameState) => {
    const v2 = ensureV2(s);
    const CT = v2.contracts;
    const out = new Map<string, {
      supplierCompanyId: string; customerCompanyId: string; subUnitId: string;
      quantityUnitsPerWeek: number; priceUSD: number; backlogUnits: number; shortWeeks: number;
      weeksRemaining: number; escalationBaseUSD: number; prepaidUSD: number;
    }>();
    REGIONS.forEach(r => forEachContract(v2, r, (row, supplierKey, customerKey, subUnitId) => {
      out.set(`${supplierKey}|${customerKey}|${subUnitId}`, {
        supplierCompanyId: supplierKey, customerCompanyId: customerKey, subUnitId,
        quantityUnitsPerWeek: CT.qtyPerWeek[row], priceUSD: CT.priceUSD[row],
        backlogUnits: CT.backlogUnits[row], shortWeeks: CT.shortWeeks[row],
        weeksRemaining: CT.weeksRemaining[row], escalationBaseUSD: CT.escalationBaseUSD[row],
        prepaidUSD: CT.prepaidUSD[row],
      });
    }));
    return out;
  };
  // §7.270: the BACKLOG check aggregates per key, never last-wins. Two live contracts can
  // share a (supplier, customer, subUnit) key — a quarterly re-form beside a running tenor —
  // and a last-wins map compared week N's contract A against week N+1's contract B: phantom
  // backlog growth, the singles this check printed. The conservation claim is about the
  // PAIR's total obligation, so the sums are what it must bound.
  const backlogByKey = (s: GameState) => {
    const v2 = ensureV2(s);
    const CT = v2.contracts;
    const out = new Map<string, { backlogUnits: number; quantityUnitsPerWeek: number }>();
    REGIONS.forEach(r => forEachContract(v2, r, (row, supplierKey, customerKey, subUnitId) => {
      const k = `${supplierKey}|${customerKey}|${subUnitId}`;
      const agg = out.get(k) ?? { backlogUnits: 0, quantityUnitsPerWeek: 0 };
      agg.backlogUnits += Number(CT.backlogUnits[row]) || 0;
      agg.quantityUnitsPerWeek += Number(CT.qtyPerWeek[row]) || 0;
      if (isNaN(CT.backlogUnits[row])) agg.backlogUnits = NaN;
      out.set(k, agg);
    }));
    return out;
  };
  return {
  name: 'IND battery',
  /**
   * IND11 — BACKLOG CONSERVATION. A contract's backlog is orders minus deliveries minus
   * cancellations, so in one week it can grow by AT MOST one week's obligation: the seller can
   * fail to ship everything it owed, and it cannot fail to ship more than that. Anything above
   * the bound is an obligation being counted twice.
   */
  week(prev, s, w) {
    const before = backlogByKey(prev);
    backlogByKey(s).forEach((c, k) => {
      const p = before.get(k);
      if (!p) return;
      const grew = c.backlogUnits - p.backlogUnits;
      if (grew > p.quantityUnitsPerWeek + 0.01) {
        violations.push({
          week: w,
          message: `contract ${k}: backlog grew ${grew.toFixed(2)} units in a week against a ${p.quantityUnitsPerWeek.toFixed(2)}-unit weekly obligation`,
        });
      }
      if (isNaN(c.backlogUnits)) violations.push({ week: w, message: `contract ${k}: NaN backlog` });
    });
  },
  report(s) {
    const out: string[] = [];
    out.push('--- IND10: production time is a stock (WIP = lead x weekly throughput) ---');
    // Group every firm's pipeline by the good's production lead, and compare the WIP it holds
    // against one week of what that pipeline delivers. The ratio IS the lead if the mechanism is
    // real: a 26-week build carries 26 weeks of work, a service carries none.
    const byLead = new Map<number, { wipUnits: number; weeklyUnits: number; lines: number }>();
    s.companies.forEach(c => {
      const wip = c.wipBySubUnit as unknown as Record<string, { units: number }[]> | undefined;
      if (!wip || !isActiveCompany(c)) return;
      Object.entries(wip).forEach(([subUnitId, queue]) => {
        const lead = productionLeadWeeksOf(subUnitId);
        const held = queue.reduce((a, l) => a + l.units, 0);
        // One week of throughput is the lot at the front of the queue: what this line delivers.
        const weekly = queue.length > 0 ? queue[0].units : 0;
        const e = byLead.get(lead) ?? { wipUnits: 0, weeklyUnits: 0, lines: 0 };
        e.wipUnits += held; e.weeklyUnits += weekly; e.lines += 1;
        byLead.set(lead, e);
      });
    });
    [...byLead.entries()].sort((a, b) => a[0] - b[0]).forEach(([lead, e]) => {
      const weeksHeld = e.weeklyUnits > 0 ? e.wipUnits / e.weeklyUnits : 0;
      out.push(`  lead ${String(lead).padStart(2)}wk: ${String(e.lines).padStart(4)} lines  WIP ${weeksHeld.toFixed(2)} weeks of throughput [should be ${lead}]`);
    });
    const totalWipUSD = s.companies.reduce((a, c) => {
      const wip = c.wipBySubUnit as unknown as Record<string, { valueUSD: number }[]> | undefined;
      if (!wip) return a;
      return a + Object.values(wip).reduce((b, q) => b + q.reduce((x, l) => x + l.valueUSD, 0), 0);
    }, 0);
    out.push(`  work in progress carried across every firm: ${B(totalWipUSD)}`);

    out.push('--- DIST 1(b): is there enough real wage dispersion to DERIVE the tier split? ---');
    // TIER_WAGE_MULTIPLIER states 0.40x/1.05x/3.4x/13.0x within an occupation. The only real
    // source of within-occupation dispersion in the model is that firms pay differently
    // (`offeredWageIndex`, HH6). If that spread is narrow, the stated 13x is standing in for a
    // mechanism that does not exist — and deleting it would flatten the income distribution
    // rather than derive it (rule 2's caveat).
    {
      const wi = s.companies.filter(c => isActiveCompany(c) && (c.employeeCount ?? 0) > 0)
        .map(c => c.offeredWageIndex ?? 1).sort((a, b) => a - b);
      if (wi.length > 2) {
        const q = (f: number) => wi[Math.min(wi.length - 1, Math.floor(f * wi.length))];
        out.push(`  offeredWageIndex across ${wi.length} employers: p10 ${q(0.1).toFixed(3)}  p50 ${q(0.5).toFixed(3)}  p90 ${q(0.9).toFixed(3)}  p99 ${q(0.99).toFixed(3)}`);
        out.push(`      p99/p10 = ${(q(0.1) > 0 ? q(0.99) / q(0.1) : 0).toFixed(2)}x  against the 13.0x/0.40x = 32.5x the stated table asserts`);
        // Where rent-sharing is HEADING: the equilibrium premium each firm's own surplus implies,
        // which is what the slow pull converges to. If the targets are flat the mechanism cannot
        // produce dispersion however long it runs; if they are wide, only the speed is at issue.
        const tgt = s.companies.filter(c => isActiveCompany(c) && (c.employeeCount ?? 0) > 0 && c.annualRevenue > 0)
          .map(c => 1 + 0.12 * ((c.annualRevenue - Math.max(0, c.annualRevenue - c.ebitda)) / Math.max(1, c.employeeCount) / Math.max(1, (c.annualRevenue * 0.3) / Math.max(1, c.employeeCount)) - 1))
          .sort((a, b) => a - b);
        if (tgt.length > 2) {
          const tq = (f: number) => tgt[Math.min(tgt.length - 1, Math.floor(f * tgt.length))];
          out.push(`      rent-share TARGETS: p10 ${tq(0.1).toFixed(3)}  p50 ${tq(0.5).toFixed(3)}  p90 ${tq(0.9).toFixed(3)}  p99 ${tq(0.99).toFixed(3)}  (p99/p10 ${(tq(0.1) !== 0 ? tq(0.99) / tq(0.1) : 0).toFixed(2)}x)`);
        }
      }
      // And where the top tier's income actually comes from: if it is capital rather than wages,
      // the 13x wage multiplier is standing in for concentration that belongs elsewhere.
      REGIONS.slice(0, 1).forEach(r => {
        const co = s.regions[r].householdState?.cohorts ?? [];
        if (co.length === 0) return;
        (['BOTTOM_50', 'NEXT_40', 'TOP_9', 'TOP_1'] as const).forEach(t => {
          const rows = co.filter(c => c.tier === t);
          const wage = rows.reduce((a, c) => a + (c.wageIncomeUSD ?? 0), 0);
          const cap = rows.reduce((a, c) => a + (c.capitalIncomeUSD ?? 0), 0);
          const tr = rows.reduce((a, c) => a + (c.transferIncomeUSD ?? 0) + (c.unemploymentBenefitsUSD ?? 0), 0);
          const tot = wage + cap + tr;
          if (tot <= 0) return;
          out.push(`  ${r} ${t.padEnd(10)}: wages ${pct(wage / tot)}  capital ${pct(cap / tot)}  transfers ${pct(tr / tot)}`);
        });
      });
    }

    out.push('--- DIST 1(c): CUT-POINT INVARIANCE — do the resolution parameters do any work? ---');
    // Rule 19 splits numbers into SHAPE (a claim about the answer) and RESOLUTION (a numerical
    // choice). A resolution parameter is only legitimate if the answer does not depend on it, and
    // this is the test: recompute each integral on a COARSENED cross-section (adjacent cells
    // merged, K -> K/2) and report the gap. A converged discretisation barely moves; a gap means K
    // is too coarse and the number is secretly doing work.
    {
      const coarsen = <T extends { weight: number }>(xs: T[], mid: (a: T, b: T) => T): T[] => {
        const out2: T[] = [];
        for (let k = 0; k + 1 < xs.length; k += 2) out2.push(mid(xs[k], xs[k + 1]));
        if (xs.length % 2 === 1) out2.push(xs[xs.length - 1]);
        return out2;
      };
      // (1) SME pool leverage — the default integral, which is NONLINEAR (a coverage threshold).
      const pools = s.regions.USA.smePools ?? [];
      let fine = 0, coarse = 0, n = 0;
      pools.forEach(p2 => {
        const st = p2.strata ?? [];
        if (st.length < 4) return;
        const f = (lev: number) => Math.max(0, 1 - 1 / Math.max(0.05, lev));
        const wsum = st.reduce((a, x) => a + x.weight, 0) || 1;
        fine += st.reduce((a, x) => a + (x.weight / wsum) * f(x.leverageMultiple), 0);
        const c = coarsen(st, (a, b) => ({ weight: a.weight + b.weight,
          leverageMultiple: (a.weight * a.leverageMultiple + b.weight * b.leverageMultiple) / Math.max(1e-9, a.weight + b.weight) }));
        const cw = c.reduce((a, x) => a + x.weight, 0) || 1;
        coarse += c.reduce((a, x) => a + (x.weight / cw) * f(x.leverageMultiple), 0);
        n++;
      });
      if (n > 0) out.push(`  SME leverage (K=20 -> 10), NONLINEAR: ${(fine / n).toFixed(5)} vs ${(coarse / n).toFixed(5)}  gap ${(Math.abs(fine - coarse) / Math.max(1e-9, fine) * 100).toFixed(2)}%`);
      // (2) Tenure — the experience premium is AFFINE in tenure, so E[f(x)] = f(E[x]) EXACTLY and
      // coarsening must change nothing. A control: it shows the test can detect the difference.
      const st2 = s.regions.USA.occupationPools?.GENERAL?.tenureStrata ?? [];
      if (st2.length >= 4) {
        const g = (t: number) => 1 + 0.02 * t;
        const w2 = st2.reduce((a, x) => a + x.weight, 0) || 1;
        const f2 = st2.reduce((a, x) => a + (x.weight / w2) * g(x.tenureYears), 0);
        const c2 = coarsen(st2, (a, b) => ({ weight: a.weight + b.weight,
          tenureYears: (a.weight * a.tenureYears + b.weight * b.tenureYears) / Math.max(1e-9, a.weight + b.weight) }));
        const cw2 = c2.reduce((a, x) => a + x.weight, 0) || 1;
        const cc2 = c2.reduce((a, x) => a + (x.weight / cw2) * g(x.tenureYears), 0);
        out.push(`  tenure (K=20 -> 10), AFFINE control: ${f2.toFixed(5)} vs ${cc2.toFixed(5)}  gap ${(Math.abs(f2 - cc2) / Math.max(1e-9, f2) * 100).toFixed(4)}% [must be ~0]`);
      }
      // (3) Mortgage vintages — severity, NONLINEAR (a kink at LTV 0.75).
      const vs2: MortgageVintage[] = [];
      s.companies.forEach(c => {
        if (c.region !== 'USA' || !c.bankBalanceSheet) return;
        (c.bankBalanceSheet!.householdLoans ?? []).forEach((pl: HouseholdLoanPool) => {
          if (pl.kind === 'MORTGAGE') (pl.vintages ?? []).forEach((v) => vs2.push(v));
        });
      });
      if (vs2.length >= 4) {
        const price = Math.max(1, s.regions.USA.housingMarket?.medianHomePriceUSD ?? 1);
        const ltv = (v: MortgageVintage) => vintageCurrentLtv(v, price);
        const sev = mortgageSeverityAtLtv;
        const sorted = vs2.slice().sort((a, b) => ltv(a) - ltv(b));
        const bk = sorted.reduce((a, v) => a + v.principalLocal, 0) || 1;
        const fineS = sorted.reduce((a, v) => a + (v.principalLocal / bk) * sev(ltv(v)), 0);
        let coarseS = 0;
        for (let k = 0; k + 1 < sorted.length; k += 2) {
          const w = sorted[k].principalLocal + sorted[k + 1].principalLocal;
          const l = (sorted[k].principalLocal * ltv(sorted[k]) + sorted[k + 1].principalLocal * ltv(sorted[k + 1])) / Math.max(1e-9, w);
          coarseS += (w / bk) * sev(l);
        }
        out.push(`  mortgage vintages (merged pairwise), NONLINEAR: ${fineS.toFixed(5)} vs ${coarseS.toFixed(5)}  gap ${(Math.abs(fineS - coarseS) / Math.max(1e-9, fineS) * 100).toFixed(2)}%`);
      }
    }

    out.push('--- DIST 1(b): the EXPERIENCE cross-section, and the wage spread it produces ---');
    {
      const reg = s.regions.USA;
      const occs = Object.keys(reg.occupationPools ?? {}) as OccupationType[];
      // The combined within-occupation spread: a worker's wage is its firm's premium times its
      // own experience premium. Both are outcomes now; neither existed a session ago.
      const allW: number[] = [];
      occs.forEach(o => {
        const st = reg.occupationPools[o]?.tenureStrata ?? [];
        if (st.length === 0) return;
        st.forEach(x => { for (let n = 0; n < Math.round(x.weight * 1000); n++) allW.push(1 + 0.02 * x.tenureYears); });
      });
      if (allW.length > 2) {
        allW.sort((a, b) => a - b);
        const q = (f: number) => allW[Math.min(allW.length - 1, Math.floor(f * allW.length))];
        out.push(`  experience premium across the workforce: p10 ${q(0.1).toFixed(3)}  p50 ${q(0.5).toFixed(3)}  p90 ${q(0.9).toFixed(3)}  p99 ${q(0.99).toFixed(3)} (p99/p10 ${(q(0.99) / Math.max(0.001, q(0.1))).toFixed(2)}x)`);
        const st0 = reg.occupationPools[occs[0]]?.tenureStrata ?? [];
        const wsum = st0.reduce((a, x) => a + x.weight, 0);
        const meanTen = st0.reduce((a, x) => a + x.weight * x.tenureYears, 0) / Math.max(1e-9, wsum);
        out.push(`  ${occs[0]}: ${st0.length} tenure cohorts, weights sum ${wsum.toFixed(4)} [must be 1], mean tenure ${meanTen.toFixed(1)}y`);
      }
    }

    out.push('--- DIST/CRD: the credit tiers, and whether they can move BOTH ways ---');
    REGIONS.forEach(r => {
      const books = s.regions[r].householdState.creditTierBooks ?? [];
      if (books.length === 0) return;
      const row = (t: string) => books.find(b => b.tier === t);
      const f = (t: string) => (row(t)?.shareOfHouseholds ?? 0);
      const d = (t: string) => (row(t)?.delinquencyRatePct ?? 0);
      const rate = (t: string) => (row(t)?.avgInterestRate ?? 0);
      out.push(`  ${r}: shares SP ${pct(f('SUPER_PRIME'))} P ${pct(f('PRIME'))} NP ${pct(f('NEAR_PRIME'))} SUB ${pct(f('SUBPRIME'))} (sum ${pct(f('SUPER_PRIME') + f('PRIME') + f('NEAR_PRIME') + f('SUBPRIME'))})`);
      out.push(`      delinquency SP ${pct(d('SUPER_PRIME'))} P ${pct(d('PRIME'))} NP ${pct(d('NEAR_PRIME'))} SUB ${pct(d('SUBPRIME'))} | rates SP ${pct(rate('SUPER_PRIME'))} SUB ${pct(rate('SUBPRIME'))}`);
    });

    out.push('--- DIST: the SME pools, and what share of each cannot service its debt ---');
    REGIONS.forEach(r => {
      const pools = s.regions[r].smePools ?? [];
      if (pools.length === 0) return;
      const shares = pools.map(p => p.distressedFirmShare ?? 0).sort((a, b) => a - b);
      // §5-WIRES A3.3: a pool's cash is its rows at the region's banks, not a field on the pool.
      // This read `p.cashLocal`, deleted with that change, so it counted zero negatives for ever.
      const poolCash = (p: { industry: string }) => poolCashOf(ensureV2(s), r, p.industry);
      const cashNeg = pools.filter(p => poolCash(p) < 0).length;
      const q = (f: number) => shares[Math.min(shares.length - 1, Math.floor(f * shares.length))];
      // The point of the integral: pools whose AGGREGATE cash is fine but whose levered strata
      // are not. On the mean those sheds never happened.
      const hidden = pools.filter(p => poolCash(p) >= 0 && (p.distressedFirmShare ?? 0) > 0.01).length;
      out.push(`  ${r}: ${pools.length} pools | distressed share p10 ${q(0.1).toFixed(3)} p50 ${q(0.5).toFixed(3)} p90 ${q(0.9).toFixed(3)} | pool cash negative: ${cashNeg} | solvent pools with distressed strata: ${hidden}`);
    });

    out.push('--- IND: the cost structure every firm sheds against ---');
    // §5-EMP/§5-CHAIN's diagnosis, measured rather than restated: the labour rule sheds on
    // `capitalCharge - ebitda`, so what matters is where the distribution of firms sits against
    // that line, and how much of revenue is payroll rather than bought-in inputs.
    REGIONS.forEach(r => {
      const firms = s.companies.filter(c => c.region === r && isActiveCompany(c) && c.annualRevenue > 0 && !c.bankBalanceSheet);
      if (firms.length === 0) return;
      const rev = firms.reduce((a, c) => a + c.annualRevenue, 0);
      const ebitda = firms.reduce((a, c) => a + c.ebitda, 0);
      const inputs = firms.reduce((a, c) => a + (c.lastWeekPurchasesUSD ?? 0) * 52, 0);
      const netPpe = firms.reduce((a, c) => a + Math.max(0, (c.grossPPELocal ?? 0) - (c.accumulatedDepreciationLocal ?? 0)), 0);
      const coc = Math.max(0, (s.regions[r].zeroRates?.tenor10Y ?? s.regions[r].policyRate));
      const below = firms.filter(c => {
        const np = Math.max(0, (c.grossPPELocal ?? 0) - (c.accumulatedDepreciationLocal ?? 0));
        return c.ebitda < np * (coc + (c.beta ?? 1) * 0.05);
      }).length;
      // CAP — DOES CAPEX COVER DEPRECIATION? The number IND13's stock exposed, measured at the
      // FLOW so it is not hidden behind the commissioning lead and the maintenance EMA.
      const dep = firms.reduce((a, c) => {
        const gross = c.grossPPELocal ?? 0;
        return a + gross / 12;
      }, 0);
      const capexA = firms.reduce((a, c) => a + (c.capex ?? 0), 0);
      out.push(`  ${r}: capex ${B(capexA)}/yr vs depreciation ${B(dep)}/yr = ${(dep > 0 ? capexA / dep : 0).toFixed(2)}x [1.0x replaces the stock]`);
      // CAP — WHERE THE CAPEX BIDS DIE. The five capex weights sum to 1, so the bids ARE the
      // capex figure; if deliveries are a fraction of it, the capital-goods sector cannot make
      // what the economy is asking for. Per category, so it is visible whether it is one
      // industry or all five.
      if (r === 'USA') {
        // TWO REPRESENTATIONS OF INVESTMENT? The seed sizes each capex industry from the demand
        // solve; the firms bid their OWN capex figure. If those disagree the sector was built to
        // supply one number and asked for another (rule 4).
        const capexCats = Object.keys(CAPEX_SUPPLIER_WEIGHTS); // §7.246: the registry's list, not a copy
        const seededUSD = capexCats.reduce((a, su) => a + ((s.regions[r].categoryDemand?.[su]?.demandLevelAnnualUSD) ?? 0), 0);
        out.push(`      capex industries sized for ${B(seededUSD)}/yr of demand; firms bid ${B(capexA)}/yr = ${(seededUSD > 0 ? capexA / seededUSD : 0).toFixed(2)}x what was built`);
        capexCats.forEach(su => {
          const cd = s.regions[r].categoryDemand?.[su];
          if (!cd) return;
          const d = cd.totalUnitsDemandedThisWeek ?? 0;
          const sup = cd.totalUnitsSuppliedThisWeek ?? 0;
          out.push(`      ${su.padEnd(24)} supplied/demanded ${(d > 0 ? sup / d : 0).toFixed(2)}x  (px ${(cd.unitPriceUSD ?? 0).toFixed(0)} vs base ${(cd.baseUnitPriceUSD ?? 0).toFixed(0)})`);
        });
      }
      out.push(`  ${r}: EBITDA/rev ${pct(ebitda / rev)}  inputs/rev ${pct(inputs / rev)}  netPPE/rev ${(netPpe / rev).toFixed(2)}x  |  below cost of capital: ${below}/${firms.length} (${pct(below / firms.length)})`);
    });

    out.push('--- IND14: reliability is a supplier attribute, and it is priced ---');
    const suppliers = s.companies.filter(c => isActiveCompany(c) && c.deliveryReliability !== undefined);
    if (suppliers.length > 0) {
      const rel = suppliers.map(c => c.deliveryReliability as number).sort((a, b) => a - b);
      const q = (f: number) => rel[Math.min(rel.length - 1, Math.floor(f * rel.length))];
      out.push(`  ${rel.length} suppliers with a delivery record: p10 ${q(0.1).toFixed(3)}  p50 ${q(0.5).toFixed(3)}  p90 ${q(0.9).toFixed(3)}`);
      // The dispersion IS the attribute: a flat record would mean reliability distinguishes
      // nobody and pricing it changes nothing.
      out.push(`  spread p90/p10: ${(q(0.1) > 0 ? q(0.9) / q(0.1) : 0).toFixed(2)}x  |  below 0.5: ${suppliers.filter(c => (c.deliveryReliability ?? 1) < 0.5).length}`);
    }

    out.push('--- IND18: the calendar (a 10-week probe samples ONE season) ---');
    const seasonalIds = Object.values(INDUSTRY_SUBUNITS).flat().map((su) => su.unitId)
      .filter(su => seasonalFactor(su, 0, 'production') !== 1 || seasonalFactor(su, 0, 'demand') !== 1);
    seasonalIds.forEach(su => {
      const pNow = seasonalFactor(su, s.currentWeek, 'production');
      const dNow = seasonalFactor(su, s.currentWeek, 'demand');
      // The year's average must be exactly 1 on both sides: seasonality moves output and demand
      // around the calendar, it does not create any.
      let pAvg = 0, dAvg = 0;
      for (let w = 0; w < 52; w++) { pAvg += seasonalFactor(su, w, 'production'); dAvg += seasonalFactor(su, w, 'demand'); }
      out.push(`  ${su.padEnd(26)} wk${String(s.currentWeek).padStart(3)}: production x${pNow.toFixed(2)}  demand x${dNow.toFixed(2)}  [annual mean ${(pAvg / 52).toFixed(3)} / ${(dAvg / 52).toFixed(3)}]`);
    });

    out.push('--- IND17: negative working capital, and who gets to have it ---');
    const prepaidBySupplier = new Map<string, number>();
    let prepaidTotalUSD = 0;
    [...allContracts(s).values()].forEach(c => {
      const v = c.prepaidUSD ?? 0;
      if (!(v > 0)) return;
      prepaidTotalUSD += v;
      prepaidBySupplier.set(c.supplierCompanyId, (prepaidBySupplier.get(c.supplierCompanyId) ?? 0) + v);
    });
    out.push(`  customer deposits held: ${B(prepaidTotalUSD)} across ${prepaidBySupplier.size} suppliers`);
    // It should accrue to the long-cycle producers and to nobody else: a good made on demand has
    // no work in progress for a customer to fund.
    [{ lo: 0, hi: 0.5, label: 'lead 0wk   ' }, { lo: 0.5, hi: 6, label: 'lead 1-5wk ' }, { lo: 6, hi: 1e9, label: 'lead 6+wk  ' }].forEach(b => {
      const firms = s.companies.filter(c => {
        if (!isActiveCompany(c) || !(c.annualRevenue > 0)) return false;
        const lines = c.productLines ?? [];
        const w = lines.reduce((a: number, l: ProductLine) => a + (l.revenueShare ?? 0), 0);
        const lead = w > 0 ? lines.reduce((a: number, l: ProductLine) => a + (l.revenueShare ?? 0) * productionLeadWeeksOf(l.subUnitId), 0) / w : 0;
        return lead >= b.lo && lead < b.hi;
      });
      if (firms.length === 0) return;
      const rev = firms.reduce((a, c) => a + c.annualRevenue, 0) / 52;
      const dep = firms.reduce((a, c) => a + (prepaidBySupplier.get(c.ticker) ?? 0), 0);
      out.push(`  ${b.label}: deposits held ${(rev > 0 ? dep / rev : 0).toFixed(2)} weeks of sales`);
    });

    out.push('--- §5-TAXR: the tax base against the book ---');
    {
      const firms = s.companies.filter(isActiveCompany);
      const carryFirms = firms.filter(c => (c.taxLossCarryforwardUSD ?? 0) > 0);
      const carryUSD = carryFirms.reduce((a, c) => a + (c.taxLossCarryforwardUSD ?? 0), 0);
      const deferredUSD = firms.reduce((a, c) => a + (c.deferredTaxLiabilityUSD ?? 0), 0);
      const basisUSD = firms.reduce((a, c) => a + (c.taxBasisPpeUSD ?? 0), 0);
      const netBookUSD = firms.reduce((a, c) =>
        a + Math.max(0, (c.grossPPELocal ?? 0) - (c.accumulatedDepreciationLocal ?? 0)), 0);
      out.push(`  ${carryFirms.length} of ${firms.length} firms carry a loss carryforward, ${B(carryUSD)} in total`);
      out.push(`  tax basis ${B(basisUSD)} vs book net PP&E ${B(netBookUSD)} — deferred tax liability ${B(deferredUSD)}`);
    }

    out.push('--- DRV: the one derivative book (§5-DRV) ---');
    {
      const book = s.derivativesBook ?? [];
      const wk = s.currentWeek;
      const byClass = new Map<string, { n: number; notional: number; settledMarkUSD: number; banks: number; firms: number; institutions: number }>();
      let pfeUSD = 0;
      for (const c of book) {
        const row = byClass.get(c.classId) ?? { n: 0, notional: 0, settledMarkUSD: 0, banks: 0, firms: 0, institutions: 0 };
        row.n++; row.notional += c.notional; row.settledMarkUSD += c.settledMarkUSD ?? 0;
        for (const p of [c.a, c.b]) {
          if (p.kind === 'BANK') row.banks++; else if (p.kind === 'COMPANY') row.firms++; else row.institutions++;
          if (p.kind === 'BANK') pfeUSD += c.notional * DERIVATIVE_CLASSES[c.classId].pfeAddOnRate;
        }
        byClass.set(c.classId, row);
      }
      out.push(`  ${book.length} live contracts across ${byClass.size} classes at week ${wk}; PFE charged to bank desks ${B(pfeUSD)} (one budget, every class)`);
      byClass.forEach((r, id) => {
        const live = book.filter(c => c.classId === id && c.maturityWeek > wk).length;
        out.push(`  ${id.padEnd(16)} n=${String(r.n).padStart(5)} (${live} live) notional ${B(r.notional)} | sides: banks ${r.banks} firms ${r.firms} institutions ${r.institutions}`
          + (r.settledMarkUSD !== 0 ? ` | mark settled to A ${B(r.settledMarkUSD)}` : ''));
      });
    }

    out.push('--- IND13: capital that has arrived and is not yet plant ---');
    const aucFirms = s.companies.filter(c => isActiveCompany(c) && (c.assetsUnderConstruction ?? []).length > 0);
    const aucUSD = aucFirms.reduce((a, c) => a + (c.assetsUnderConstruction!).reduce((b, l) => b + l.valueUSD, 0), 0);
    const grossPpeUSD = s.companies.filter(isActiveCompany).reduce((a, c) => a + (c.grossPPELocal ?? 0), 0);
    const commissionedUSD = s.companies.reduce((a, c) => a + (c.capexCommissionedLastWeekUSD ?? 0), 0);
    out.push(`  ${aucFirms.length} firms carrying construction in progress, ${B(aucUSD)} against ${B(grossPpeUSD)} of gross PP&E (${pct(grossPpeUSD ? aucUSD / grossPpeUSD : 0)})`);
    out.push(`  entered service this week: ${B(commissionedUSD)}`);
    // The lag itself: how long the queue's oldest waiting lot has left, against the leads the
    // registry states. A queue that empties instantly means the mechanism is not binding.
    const waits = aucFirms.flatMap(c => (c.assetsUnderConstruction!).map(l => l.entersServiceWeek - s.currentWeek));
    if (waits.length > 0) {
      waits.sort((a, b) => a - b);
      out.push(`  weeks still to wait: p50 ${waits[Math.floor(waits.length / 2)]}, max ${waits[waits.length - 1]} (registry leads run 2-13)`);
    }

    out.push('--- IND12: trade credit, and who carries it ---');
    const invoices = s.tradeInvoices ?? [];
    let domesticUSD = 0, crossUSD = 0, termSum = 0;
    const receivableByTicker = new Map<string, number>();
    const payableByTicker = new Map<string, number>();
    invoices.forEach(iv => {
      const usd = iv.amountCurrency * iv.bookedUsdPerCurrency;
      if (iv.sellerRegion === iv.buyerRegion) domesticUSD += usd; else crossUSD += usd;
      termSum += iv.weekDue - iv.weekBooked;
      receivableByTicker.set(iv.sellerTicker, (receivableByTicker.get(iv.sellerTicker) ?? 0) + usd);
      payableByTicker.set(iv.buyerTicker, (payableByTicker.get(iv.buyerTicker) ?? 0) + usd);
    });
    const totalUSD = domesticUSD + crossUSD;
    const receivables = [...receivableByTicker.values()].reduce((a, x) => a + x, 0);
    const payables = [...payableByTicker.values()].reduce((a, x) => a + x, 0);
    out.push(`  ${invoices.length} invoices outstanding, ${B(totalUSD)} — domestic ${B(domesticUSD)} (${pct(totalUSD ? domesticUSD / totalUSD : 0)}), cross-border ${B(crossUSD)}`);
    out.push(`  receivables ${B(receivables)} vs payables ${B(payables)} [must be equal: every invoice is two-sided]`);
    out.push(`  mean terms ${(invoices.length ? termSum / invoices.length : 0).toFixed(1)} weeks`);
    // The design's third check: a long-cycle firm ties up more working capital, so it should
    // carry visibly more trade credit against its own sales.
    const leadOf = (c: Company) => {
      const lines = c.productLines ?? [];
      const w = lines.reduce((a: number, l: ProductLine) => a + (l.revenueShare ?? 0), 0);
      return w > 0 ? lines.reduce((a: number, l: ProductLine) => a + (l.revenueShare ?? 0) * productionLeadWeeksOf(l.subUnitId), 0) / w : 0;
    };
    const buckets: { label: string; test: (n: number) => boolean }[] = [
      { label: 'lead 0wk   ', test: n => n < 0.5 },
      { label: 'lead 1-5wk ', test: n => n >= 0.5 && n < 6 },
      { label: 'lead 6+wk  ', test: n => n >= 6 },
    ];
    buckets.forEach(b => {
      const firms = s.companies.filter(c => isActiveCompany(c) && c.annualRevenue > 0 && b.test(leadOf(c)));
      if (firms.length === 0) return;
      const rev = firms.reduce((a, c) => a + c.annualRevenue, 0) / 52;
      const rec = firms.reduce((a, c) => a + (receivableByTicker.get(c.ticker) ?? 0), 0);
      out.push(`  ${b.label}: ${String(firms.length).padStart(4)} firms, receivables ${(rev > 0 ? rec / rev : 0).toFixed(2)} weeks of sales`);
    });

    out.push('--- IND11: the backlog is a stock, and it is two-sided ---');
    const contracts = [...allContracts(s).values()];
    const owed = contracts.filter(c => (c.backlogUnits ?? 0) > 0.0001);
    const weeklyObligation = contracts.reduce((a, c) => a + (c.quantityUnitsPerWeek ?? 0), 0);
    const backlogUnits = contracts.reduce((a, c) => a + (c.backlogUnits ?? 0), 0);
    const backlogUSD = contracts.reduce((a, c) => a + (c.backlogUnits ?? 0) * (c.priceUSD ?? 0), 0);
    const indexed = contracts.filter(c => (c.escalationBaseUSD ?? 0) > 0).length;
    const short = contracts.filter(c => (c.shortWeeks ?? 0) > 0);
    out.push(`  ${contracts.length} live contracts, ${owed.length} of them owing units (${pct(contracts.length ? owed.length / contracts.length : 0)})`);
    out.push(`  backlog outstanding ${backlogUnits.toFixed(0)} units / ${B(backlogUSD)}`);
    // IND10's remaining verify: quoted delivery IS the backlog divided by the rate that works it
    // off, so it lengthens exactly when a seller falls behind.
    out.push(`  implied quoted delivery across every contract: ${(weeklyObligation > 0 ? backlogUnits / weeklyObligation : 0).toFixed(2)} weeks of obligation`);
    out.push(`  under-delivering: ${short.length} contracts on the non-performance clock, worst streak ${short.reduce((a, c) => Math.max(a, c.shortWeeks ?? 0), 0)} weeks`);
    out.push(`  indexed to the market: ${indexed} of ${contracts.length} (${pct(contracts.length ? indexed / contracts.length : 0)})`);
    return out;
  },
  };
})();

/**
 * §5-STRUCT step 2 — THE FINGERPRINT INSTRUMENT, rebuilt as the plan specifies (the original
 * driver was session-scratch and is gone). `FP=1 WEEKS=3 npx tsx scripts/harness.ts` prints a
 * deep canonical sha256 of the WHOLE GameState after each of weeks 1–3: every field, sorted
 * object keys, arrays and Maps in their own order, TypedArrays as raw bytes, floats at full
 * 8-byte precision — order sensitivity is the point, an extraction that reorders float
 * arithmetic must fail it. Strike a FRESH baseline on the pre-extraction commit immediately
 * before each extraction; never inherit hashes across a behaviour-changing commit.
 */
const FP = process.env.FP === '1';
function canonicalFingerprint(state: GameState): string {
  const h = createHash('sha256');
  const onPath = new Set<object>();
  const f64 = new Float64Array(1);
  const f64b = new Uint8Array(f64.buffer);
  const num = (n: number) => { f64[0] = n; h.update(f64b); };
  const visit = (v: unknown): void => {
    if (v === null) { h.update('n'); return; }
    if (v === undefined) { h.update('u'); return; }
    const t = typeof v;
    if (t === 'number') { h.update('d'); num(v as number); return; }
    if (t === 'string') { h.update('s'); h.update(v as string); h.update('\0'); return; }
    if (t === 'boolean') { h.update(v ? 'T' : 'F'); return; }
    if (t === 'bigint') { h.update('B'); h.update((v as bigint).toString()); return; }
    if (t === 'function' || t === 'symbol') { h.update('x'); return; }
    const o = v as object;
    // Shared references (a DAG) hash where they appear; only a true cycle is refused, loudly.
    if (onPath.has(o)) throw new Error('FP: cycle in GameState — the fingerprint cannot terminate');
    onPath.add(o);
    if (ArrayBuffer.isView(o)) {
      h.update('t');
      h.update(new Uint8Array((o as ArrayBufferView).buffer, (o as ArrayBufferView).byteOffset, (o as ArrayBufferView).byteLength));
    } else if (Array.isArray(o)) {
      h.update('a'); num(o.length); o.forEach(visit);
    } else if (o instanceof Map) {
      h.update('m'); num(o.size); o.forEach((val, k) => { visit(k); visit(val); });
    } else if (o instanceof Set) {
      h.update('e'); num(o.size); o.forEach(visit);
    } else {
      const keys = Object.keys(o).sort();
      h.update('o'); num(keys.length);
      keys.forEach((k) => { h.update(k); h.update('\0'); visit((o as Record<string, unknown>)[k]); });
    }
    onPath.delete(o);
  };
  visit(state);
  return h.digest('hex');
}
/** FP_WEEKS=n widens the window past the default 3 — a change on a quarterly or annual clock
 *  (mergers, retirement, FDI) needs a fingerprint that crosses its firing week. */
const FP_WEEKS = Number(process.env.FP_WEEKS) > 0 ? Number(process.env.FP_WEEKS) : 3;
const fpModule: HarnessModule = {
  name: 'FP fingerprint',
  week(_prev, state, w) {
    // REGISTER_DUMP=<file> (at STATE_DUMP_WEEK): every institution's register, one line per
    // (entity, type, instrument) with notional and shares — the diff instrument for a ledger
    // change (§5-WIRES W2: two trees, first row that differs, then the stage).
    if (process.env.REGISTER_DUMP && w === (Number(process.env.STATE_DUMP_WEEK) || 1)) {
      const lines: string[] = [];
      (state.institutionalEntities ?? []).forEach((e) => {
        const agg = new Map<string, [number, number]>();
        e.itemizedHoldings.forEach((h) => {
          const k = `${e.id}\t${h.instrumentType}\t${h.instrumentId}`;
          const cur = agg.get(k) ?? [0, 0];
          cur[0] += h.quantityOrNotionalUSD ?? 0; cur[1] += h.quantityShares ?? 0;
          agg.set(k, cur);
        });
        agg.forEach((v, k) => lines.push(`${k}\t${v[0].toFixed(2)}\t${v[1].toFixed(4)}`));
      });
      writeFileSync(process.env.REGISTER_DUMP, lines.sort().join('\n'));
    }
    if (process.env.STATE_DUMP && w === (Number(process.env.STATE_DUMP_WEEK) || 1)) {
      // §5-WIRES A3.1/A3.6: a firm's cash and a bank's reserves are accounts, not fields — the
      // dump carries them as columns read off the ledger so the differ still sees every balance.
      const dumpV2 = ensureV2(state);
      writeFileSync(process.env.STATE_DUMP,
        JSON.stringify(state.companies.map((c) => ({ ...c, cash: cashOf(dumpV2, c), ...(c.bankBalanceSheet ? { reserves: bankReservesOf(dumpV2, c.ticker), lines: stateDepositLines(state, c.ticker) } : {}) })),
          (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(15)) : v)));
    }
    if (!FP || w > FP_WEEKS) return;
    console.log(`  [FP] w${w} ${canonicalFingerprint(state)}`);
  },
};

/** §7.276: every payment reason must roll up to a category — an orphaned label is a violation
 *  the week it is first written, so a new pay() reason lands a rule in payment-category.ts
 *  before a run is green. */
const reasonCategoryModule: HarnessModule = (() => {
  const reported = new Set<string>();
  return {
    name: 'payment reason categories',
    week(_prev, _state, week) {
      unclassifiedReasons().forEach((reason) => {
        if (reported.has(reason)) return;
        reported.add(reason);
        violations.push({
          week,
          message: `payment reason '${reason}' matches no category rule — register it in payment-category.ts`,
        });
      });
    },
  };
})();

/**
 * BOOKTRACE — the institutional-book exponential, decomposed (§6.1 UK-book row; §7.251).
 * `BOOKTRACE=1` prints, per region-week, the non-MMF/non-ETF institutional book's delta split
 * into cash / repo / each instrument class, plus the CREDIT holdings-to-outstanding ratio the
 * corpBondOwnership check divides. The question it answers: WHICH line compounds, from which
 * week, and whether the mint is on the holdings side or the outstanding side of the ratio.
 */
const BOOKTRACE = process.env.BOOKTRACE === '1';
const bookTraceModule: HarnessModule = {
  name: 'institutional book decomposition',
  week(prev, state, w) {
    if (!BOOKTRACE) return;
    REGION_IDS_SEED_ORDER.forEach((region) => {
      const decompose = (s: GameState) => {
        const parts = { cashLocal: 0, repoLentLocal: 0 } as Record<string, number>;
        (s.institutionalEntities || []).forEach((e) => {
          if (e.region !== region || e.isDefaulted
            || e.entityType === 'MONEY_MARKET_FUND' || e.entityType === 'ETF') return;
          parts.cashLocal += entityCashOf(ensureV2(s), e);
          parts.repoLentLocal += e.repoLentLocal ?? 0;
          e.itemizedHoldings.forEach((h) => {
            parts[h.instrumentType] = (parts[h.instrumentType] ?? 0) + h.quantityOrNotionalUSD;
          });
        });
        return parts;
      };
      const before = decompose(prev);
      const after = decompose(state);
      const total = (p: Record<string, number>) => Object.values(p).reduce((a, v) => a + v, 0);
      const deltas = Object.keys({ ...before, ...after })
        .map((k) => ({ k, d: (after[k] ?? 0) - (before[k] ?? 0) }))
        .filter(({ d }) => Math.abs(d) > 1e8)
        .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
        .map(({ k, d }) => `${k} ${(d / 1e9).toFixed(2)}B`)
        .join(' | ');
      // The corpBondOwnership ratio's two sides, measured the same way the check measures them —
      // plus the held paper SPLIT BY ISSUER ALIVENESS: the outstanding denominator skips
      // defaulted issuers (holdings-view.ts isActiveCompany filter) while holders keep their
      // claims until the estate extinguishes them, so the estate-window slice is exactly how far
      // the ratio can sit above what active issuers owe without any claim being minted.
      let creditHeldUSD = 0;
      let heldOnDeadIssuerUSD = 0;
      const issuerAliveById = new Map<string, boolean>();
      state.companies.forEach((c) => { if (c.region === region) issuerAliveById.set(c.id, isActiveCompany(c)); });
      (state.institutionalEntities || []).forEach((e) => {
        if (e.isDefaulted) return;
        e.itemizedHoldings.forEach((h) => {
          if (h.issuerRegion !== region) return;
          if (h.instrumentType === 'CORP_BOND' || h.instrumentType === 'LEVERAGED_LOAN' || h.instrumentType === 'COMMERCIAL_PAPER') {
            const usd = h.quantityOrNotionalUSD ?? 0;
            creditHeldUSD += usd;
            // instrumentId IS the issuer's company.id for the credit classes (domain/banking.ts).
            if (issuerAliveById.get(h.instrumentId) === false) heldOnDeadIssuerUSD += usd;
          }
        });
      });
      const creditOutstandingUSD = state.companies
        .filter((c) => c.region === region && isActiveCompany(c))
        .reduce((s2: number, c) => s2 + (c.debtTranches || []).reduce((x: number, t) => x + Math.max(0, t.principalLocal), 0), 0);
      console.log(`  [book] w${w} ${region} ${(total(before) / 1e9).toFixed(1)}B -> ${(total(after) / 1e9).toFixed(1)}B`
        + ` | credit held/outstanding ${(creditHeldUSD / 1e9).toFixed(1)}/${(creditOutstandingUSD / 1e9).toFixed(1)}`
        + ` = ${(creditOutstandingUSD > 0 ? creditHeldUSD / creditOutstandingUSD : 0).toFixed(3)}`
        + ` (on dead issuers ${(heldOnDeadIssuerUSD / 1e9).toFixed(1)}B)`
        + (deltas ? ` | ${deltas}` : ''));
    });
  },
};

/**
 * SPIRAL=1 — the one-region-runaway differential (§7.256's EUR fiscal-labour spiral). Prints
 * each region's feedback terms weekly so the region that departs can be diffed against the
 * three that cohere AT the departure week: which term was an outlier BEFORE the break is the
 * driver, everything after is consequence.
 */
const SPIRAL = process.env.SPIRAL === '1';
/** SPIRAL_PRICES=1 — per region, the top category price movers week-over-week (landed
 *  unitPriceUSD), to localize WHICH goods run when one region's inflation departs. */
const SPIRAL_PRICES = process.env.SPIRAL_PRICES === '1';
const spiralPrevPriceByKey = new Map<string, number>();
const spiralModule: HarnessModule = {
  name: 'one-region spiral differential',
  week(_prev, state, w) {
    if (SPIRAL_PRICES) {
      const focus = process.env.PX_FOCUS;
      if (focus) {
        REGION_IDS_SEED_ORDER.forEach((region) => {
          const sup = state.companies.filter((c) => c.region === region && isActiveCompany(c)
            && (c.productLines || []).some((l) => l.subUnitId === focus));
          const cap = sup.reduce((a, c) => {
            const l = (c.productLines || []).find((x) => x.subUnitId === focus);
            return a + (l?.weeklyCapacityUnits ?? 0);
          }, 0);
          const staffed = sup.reduce((a, c) => a + ((c.baselineEmployeeCount ?? 0) > 0
            ? Math.min(1, (c.employeeCount ?? 0) / c.baselineEmployeeCount!) : 1), 0);
          const cd = state.regions[region].categoryDemand[focus];
          console.log(`  [pxf] w${w} ${region} ${focus} sup${sup.length}`
            + ` cap${(cap / 1e6).toFixed(2)}M staffedAvg${sup.length ? (staffed / sup.length).toFixed(2) : '-'}`
            + ` s${((cd?.totalUnitsSuppliedThisWeek ?? 0) / 1e6).toFixed(2)}M`
            + ` d${((cd?.totalUnitsDemandedThisWeek ?? 0) / 1e6).toFixed(2)}M`
            + ` p${(cd?.unitPriceUSD ?? 0).toFixed(0)}`
            + ` dLvl${((cd?.demandLevelAnnualUSD ?? 0) / 1e9).toFixed(2)}B`);
        });
      }
      REGION_IDS_SEED_ORDER.forEach((region) => {
        const r = state.regions[region];
        const movers: { id: string; ratio: number; p: number; idx: number; inv: number; short: number }[] = [];
        Object.entries(r.categoryDemand).forEach(([id, cd]) => {
          const p = cd.unitPriceUSD ?? 0;
          const key = `${region}:${id}`;
          const prev = spiralPrevPriceByKey.get(key);
          if (prev !== undefined && prev > 0 && p > 0) {
            const supplied = cd.totalUnitsSuppliedThisWeek ?? 0;
            const demanded = cd.totalUnitsDemandedThisWeek ?? 0;
            movers.push({
              id, ratio: p / prev, p, idx: cd.clearedInputPriceIndex,
              inv: cd.inventoryLevelUSD,
              short: demanded > 0 ? supplied / demanded : 1,
            });
          }
          spiralPrevPriceByKey.set(key, p);
        });
        movers.sort((a, b) => b.ratio - a.ratio);
        const line = movers.slice(0, 5)
          .map((m) => `${m.id} x${m.ratio.toFixed(2)} p${m.p.toFixed(0)} idx${m.idx.toFixed(1)} s/d${m.short.toFixed(2)} inv${(m.inv / 1e9).toFixed(1)}B`)
          .join(' | ');
        console.log(`  [px] w${w} ${region} ${line}`);
      });
    }
    // CARRIER=1 — the carrier cohort weekly: who is alive, what each earns and holds, so the
    // first death week and the drain that caused it are readable off one run.
    if (process.env.CARRIER === '1') {
      const carriers = state.companies.filter((c) => c.financialStatementProfile === 'CARRIER');
      const alive = carriers.filter((c) => isActiveCompany(c));
      const line = carriers.slice(0, 12).map((c) => {
        const flag = isActiveCompany(c) ? '' : '✝';
        return `${c.ticker}${flag} cash${(cashOf(ensureV2(state), c) / 1e6).toFixed(0)}M rev${((c.annualRevenue ?? 0) / 1e6).toFixed(0)}M ni${((c.netIncome ?? 0) / 1e6).toFixed(1)}M`;
      }).join(' | ');
      console.log(`  [car] w${w} alive ${alive.length}/${carriers.length} :: ${line}`);
      const ledgerTicker = process.env.CARRIER_LEDGER;
      if (ledgerTicker) {
        const c = carriers.find((x) => x.ticker === ledgerTicker);
        const rows = ((c as unknown as { lastCashLedger?: { label: string; amountUSD: number }[] })?.lastCashLedger ?? [])
          .filter((r) => Math.abs(r.amountUSD) > 1e6)
          .map((r) => `${r.label} ${(r.amountUSD / 1e6).toFixed(1)}M`);
        console.log(`  [car-ledger] w${w} ${ledgerTicker} :: ${rows.join(' | ')}`);
      }
    }
    // BANKCAP=1 — per-bank capital decomposition: whose equity drains, whose RWA grows, and
    // where each cohort's ratio sits against the [0.05, 0.35] band, weekly.
    if (process.env.BANKCAP === '1') {
      REGION_IDS_SEED_ORDER.forEach((region) => {
        state.companies
          .filter((c) => c.region === region && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet)
          .forEach((c) => {
            const bs = c.bankBalanceSheet!;
            const facilityBookLocal = facilityBookOf(ensureV2(state), c.ticker);
            const rwa = businessLoanBookOf(bs, facilityBookLocal) * 1.0 + householdBookRwaUSD(bs.householdLoans);
            const deskUSD = Object.values(bs.dealerDeskInventory ?? {})
              .reduce((a, rows) => a + rows.reduce((b, r) => b + Math.abs(r.inventoryLocal), 0), 0);
            console.log(`  [cap] w${w} ${region}:${c.ticker}`
              + ` eq ${(bs.bankEquityLocal / 1e9).toFixed(2)}B rwa ${(rwa / 1e9).toFixed(2)}B`
              + ` ratio ${(rwa > 0 ? bs.bankEquityLocal / rwa : 0).toFixed(4)}`
              + ` | biz ${(businessLoanBookOf(bs, facilityBookLocal) / 1e9).toFixed(2)}B hh ${(consumerLoanBookOf(bs) / 1e9).toFixed(2)}B`
              + ` cash ${(bankReservesOf(ensureV2(state), c.ticker) / 1e9).toFixed(2)}B cbloan ${((bs.centralBankLoanLocal ?? 0) / 1e9).toFixed(2)}B`
              + ` desk ${(deskUSD / 1e9).toFixed(2)}B`
              + ` oas ${(c.oasSpreadBps ?? 0).toFixed(0)}bps rating ${c.creditRating}`);
          });
      });
    }
    if (!SPIRAL) return;
    REGION_IDS_SEED_ORDER.forEach((region) => {
      const r = state.regions[region];
      const smeEmployment = (r.smePools || []).reduce((a, s) => a + (s.employment ?? 0), 0);
      const poolCashNeg = (r.smePools || []).filter((s) => poolCashOf(ensureV2(state), region, s.industry) < 0).length;
      const gov = governmentOf(region, r, materializeGovLadder(ensureV2(state), region));
      const { overrunUSD } = gov.overrun();
      console.log(`  [spiral] w${w} ${region}`
        + ` u ${(r.unemploymentRate * 100).toFixed(1)}`
        + ` pi ${(r.inflation * 100).toFixed(0)}`
        + ` pol ${(r.policyRate * 100).toFixed(1)}`
        + ` wageIdxG ${(r.occupationPools?.GENERAL?.wageIndex ?? 0).toFixed(3)}`
        + ` | outlays ${((r.governmentOutlaysUSD ?? 0) / 1e9).toFixed(2)}B`
        + ` overrun ${(overrunUSD / 1e9).toFixed(2)}B`
        + ` transfers ${((r.governmentTransfersWeeklyUSD ?? 0) / 1e9).toFixed(2)}B`
        + ` payrollGov ${((r.governmentPayrollWeeklyUSD ?? 0) / 1e9).toFixed(2)}B`
        + ` tga ${(treasuryAccountOf(ensureV2(state), r.id as RegionId) / 1e9).toFixed(1)}B`
        + ` | smeEmp ${(smeEmployment / 1e6).toFixed(2)}M poolNeg ${poolCashNeg}`
        + ` govEmp ${((r.governmentEmployment ?? 0) / 1e6).toFixed(2)}M`
        + ` | fx ${(state.fxPairs.find((p) => p.base === region && p.quote === 'USA')?.rate ?? 1).toFixed(3)}`);
    });
  },
};

// ---- ADD NEW MODULES HERE, and nowhere else. ----
const MODULES: HarnessModule[] = [hhModule, pubModule, xbModule, indModule, fpModule, reasonCategoryModule, bookTraceModule, spiralModule];

// =============================================================================================
// THE RUN
// =============================================================================================
function weekLine(s: GameState, w: number, newViol: number, totalViol: number, ms: number): string {
  const r = s.regions;
  const u = (id: RegionId) => ((r[id]?.unemploymentRate ?? 0) * 100).toFixed(1);
  const bound = (s.lastWeekDamperBoundIds ?? []).length;
  const gdp = r.USA.derivedNominalGdpUSD ?? 0;
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
  seededProbe = probeSteadyState(state);
  const initialRevenueByTicker = new Map(state.companies.map(c => [c.ticker, c.annualRevenue]));
  const knownTickers = new Set(state.companies.map(c => c.ticker));
  MODULES.forEach(m => { try { m.init?.(state); } catch (e) { violations.push({ week: 0, message: `[harness:${m.name}] init threw: ${e}` }); } });

  // §3.37-SEED — THE SEED IS AUDITED, AND IT NEVER WAS. `docs/systems/the-seed.md` A2.
  //
  // `auditWeek` ran only inside the week loop below, so no invariant family had ever seen the
  // OPENING state. Every week-1 finding was therefore ambiguous between a bad seed and a bad
  // mechanism, and that ambiguity costs a search that cannot succeed: there is no stage to find a
  // seed defect in. `auditSeed` asks the stock questions the opening world can answer, takes no
  // previous week and does not become one — so week 1's proof of the seed's WIRES against the
  // empty world is untouched. Read-only by contract (`docs/systems/the-audit.md` C4), so it runs
  // before the pre-run mechanism tests and does not move the RNG stream they depend on.
  {
    const found = auditSeed(state);
    auditFindings.push(...found);
    found.forEach((f) => violations.push({ week: 0, message: `[audit ${f.check}] ${f.message}` }));
    if (found.length) {
      console.log(`  ! [week 0 · the seed] ${found.length} audit finding(s) — the opening world, not a mechanism`);
      found.slice(0, VERBOSE ? found.length : 8).forEach((f) => console.log(`     ! [${f.check}] ${f.message}`));
      if (!VERBOSE && found.length > 8) console.log(`     ! ...+${found.length - 8} more at week 0`);
    }
  }

  if (SHOCKS) {
    // Pre-run mechanism tests (each builds its own world; violations land in the same pool).
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
        assetType: 'EQUITY' as Position['assetType'],
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

    const preState = state;
    const t0 = Date.now();
    if (PROFILE || STAGE_TRACE) {
      const { state: next, timings, stageTrace } = advanceWeeklyStepProfiled(state, { profile: PROFILE });
      state = next;
      if (stageTrace) lastStageTrace = stageTrace;
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

    // §7.234 — WHAT `noImplicitAny` FOUND HERE, AND WHY A CHECK WAS DELETED RATHER THAN FIXED.
    //
    // This loop ran over `['USA', 'EUR', 'ASIA']`. **'ASIA' is not a RegionId and never has been** —
    // the regions are USA/EUR/UK/JPN — so a third of every iteration read `undefined`, and the two
    // checks below covered two regions of four while appearing to cover three.
    //
    // The first check, "sovereign debt absorption mismatch", is GONE. It computed an expected
    // issuance from `region.nominalGdpUSD` and `region.governmentDeficitPct`, **neither of which
    // exists on `Region`**, so `weeklyDeficit` was always 0, `accExpected` was always 0, and its
    // own guard `if (accExpected > 0)` meant **it had never fired once in the life of this file.**
    // It was not a failing check; it was not a check. Its expectation was also two magic constants
    // (a 15% central-bank money target, a 1% adjustment speed) over fields that do not exist, so
    // there was nothing to revive — reviving it would have been writing a new model and calling it
    // a repair. The real deficit now has an owner (`Government.deficitWeeklyUSD`, §5-STRUCT step 3);
    // a sovereign-absorption check built on it would be a new check, deliberately designed.
    //
    // The second check is real, and now runs over all four regions.
    (REGIONS as readonly RegionId[]).forEach(rId => {
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
    checkProductionPipelines(state, w);

    // 3. Disjoint set: isDefaulted and mergerAcquired
    state.companies.forEach(c => {
      if (c.isDefaulted && c.mergerAcquired) {
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
    if (prevBooksForBookCheck) checkInstitutionalBookConservation(prevBooksForBookCheck, state, w);
    checkHouseholdCohortIdentity(state, w);
    checkLaborMarketIdentity(state, w);
    checkCentralBankIdentity(state, w);
    violations.push(...checkHoldingsLedgerConservation(state, w));
    checkBeneficiaryClaimsHaveHolders(state, w);
    checkSettlementClosed(state, w);
    checkGuards(state, w);
    // §5-CLOSE — the audit runs on every week; its findings are violations too.
    {
      const found = auditWeek(state, w);
      auditFindings.push(...found);
      found.forEach((f) => violations.push({ week: w, message: `[audit ${f.check}] ${f.message}` }));
    }
    prevBooksForBookCheck = institutionalBooksOf(state);

    // 5b. The bank balance-sheet identity, per named bank, every week. Cash moves only by
    // named flows and every flow posts to both sides, so deposits + equity + secured funding
    // must equal loans + securities + cash to the dollar (small tolerance for per-field
    // rounding). Before the flow ledger this identity was broken by -138.9B (USA, week 0) and
    // a Math.max plug hid it; if this drifts again, some flow is missing a leg — find it,
    // never plug it.
    state.companies.forEach((c: Company) => {
      if (!c.isBankEntity || !c.bankBalanceSheet || c.isDefaulted || c.mergerAcquired) return;
      const bs = c.bankBalanceSheet;
      const reservesUSD = bankReservesOf(ensureV2(state), c.ticker);
      const lines = stateDepositLines(state, c.ticker);
      const sovUSD = Object.values((bs.sovereignBondHoldingsByBond || {}) as Record<string, number>).reduce((a, v) => a + (Number(v) || 0), 0);
      // §5-WIRES D: the loan books are READS of the sheet's rows. This check subtracted
      // `bs.businessLoanBookLocal` and `bs.consumerLoanBookLocal`, two fields that stopped existing
      // when the rows became the truth — so the residual was `number - undefined` = NaN,
      // `Math.abs(NaN) > 5e6` is false, and THIS CHECK PASSED EVERY BANK EVERY WEEK. A `bs as any`
      // in the same expression is what let it compile. `audit/money.ts:m5` is the live one.
      const facilityBookLocal = facilityBookOf(ensureV2(state), c.ticker);
      const residualUSD: number =
        // SETL2: `corporateDepositsLocal` IS a liability now. Company payments settle through bank
        // books (stages/settlement.ts), so the line has real reserves behind it and excluding it
        // would leave the ASSET unmatched — the mirror of the error this comment used to record.
        // HH4d: wholesale funding is a real liability line split out of the deposit label.
        lines.householdLocal + lines.corporateLocal + lines.institutionalLocal + (bs.clientMarginLocal ?? 0) + lines.smeLocal + (bs.centralBankLoanLocal ?? 0) + bs.bankEquityLocal + (bs.srfBorrowingLocal ?? 0) + (bs.repoBorrowedLocal ?? 0)
        - businessLoanBookOf(bs, facilityBookLocal) - consumerLoanBookOf(bs) - sovUSD - reservesUSD
        - (bs.repoLentLocal ?? 0) - (bs.onRrpLendingLocal ?? 0)
        // CAL: a sovereign coupon earned and not yet paid is this bank's asset against the
        // treasury, and the treasury carries the same balance as its payable.
        - (bs.sovereignAccruedCouponLocal ?? 0)
        // G3a: the desks' own inventory is this bank's asset, bought with its own reserves.
        - Object.values((bs.dealerDeskInventory || {}) as Record<string, { inventoryLocal: number }[]>)
            .reduce((a, rows) => a + rows.reduce((b, r) => b + Math.abs(r.inventoryLocal), 0), 0)
        // HF1: margin loans to hedge funds are this bank's asset too.
        - (bs.primeBrokerageLoansLocal ?? 0);
      const idTraced = (process.env.BANK_ID_TRACE ?? '').split(',').includes(c.ticker);
      if (Math.abs(residualUSD) > 5e6 || idTraced) {
        // §7.302 — the composition, printed when it breaks: a 66B one-week residual during the
        // first bank resolution was undiagnosable from the total alone. BANK_ID_TRACE=<ticker>
        // prints one bank's composition every week so the jumping line can be diffed.
        // §3.13c: read the SHEET, not a string-keyed cast of it. A cast like this is a field
        // name the compiler cannot check, which is what the `…USD` rename has to be safe from.
        const gb = (v: number | undefined) => ((v ?? 0) / 1e9).toFixed(1);
        console.log(`  [bank-identity] w${w} ${c.ticker} resid ${(residualUSD / 1e9).toFixed(2)}B: hhDep ${gb(lines.householdLocal)}B`
          + ` corp ${gb(lines.corporateLocal)}B inst ${gb(lines.institutionalLocal)}B`
          + ` sme ${gb(lines.smeLocal)}B margin ${gb(bs.clientMarginLocal)}B`
          + ` cbloan ${gb(bs.centralBankLoanLocal)}B eq ${gb(bs.bankEquityLocal)}B`
          + ` srf ${gb(bs.srfBorrowingLocal)}B repoB ${gb(bs.repoBorrowedLocal)}B`
          + ` || bizL ${gb(businessLoanBookOf(bs, facilityBookLocal))}B consL ${gb(consumerLoanBookOf(bs))}B`
          + ` sov ${gb(sovUSD)}B cash ${gb(reservesUSD)}B`
          + ` repoL ${gb(bs.repoLentLocal)}B rrp ${gb(bs.onRrpLendingLocal)}B`);
      }
      if (Math.abs(residualUSD) > 5e6) {
        violations.push({
          week: w,
          message: `Bank ${c.ticker} balance-sheet identity broken by ${(residualUSD / 1e6).toFixed(1)}M — a flow is missing a leg`
        });
      }
      // §7.340: a bank's reserve account cannot close the week negative — nothing in the model
      // lends a bank an unsecured overdraft at the central bank. It went unwatched while three
      // banks ran −0.4 to −1.1B (§6.1); the wholesale raise is what funds the shortfall now.
      if (reservesUSD < -1e6) {
        violations.push({
          week: w,
          message: `Bank ${c.ticker} overdrawn at the central bank by ${(-reservesUSD / 1e6).toFixed(1)}M — a shortfall nothing funded`
        });
      }
    });

    // 5b-ii. CAL: the sovereign receivable and the sovereign payable are ONE balance seen from
    // two books, so the treasury's payable can never be less than what its bank holders are
    // carrying against it. If this ever trips, the calendar has two writers again — find the
    // second one, never reconcile the difference.
    REGION_IDS.forEach((regionId) => {
      const reg = state.regions?.[regionId];
      if (!reg) return;
      const bankHeldUSD = state.companies.reduce((a: number, c: Company) => (
        c.isBankEntity && c.bankBalanceSheet && c.region === regionId && !c.isDefaulted && !c.mergerAcquired
          ? a + (c.bankBalanceSheet.sovereignAccruedCouponLocal ?? 0) : a), 0);
      if (bankHeldUSD - (reg.sovereignCouponPayableUSD ?? 0) > 5e6) {
        violations.push({
          week: w,
          message: `${regionId} sovereign receivables exceed the treasury's payable by `
            + `${((bankHeldUSD - (reg.sovereignCouponPayableUSD ?? 0)) / 1e6).toFixed(1)}M — `
            + `the coupon accrual has a second writer`
        });
      }
    });

    // 5c. WS6: the overnight repo rate must print inside the administered corridor in every
    // region every week — not because anything clamps it, but because every lender's
    // reservation is its own posted floor and the SRF sits in the book as an elastic seat at
    // the ceiling. A print outside the corridor means a schedule is wrong or the damper bound.
    // And pledged collateral can never exceed the pledger's holdings.
    REGION_IDS.forEach(regionId => {
      const reg = state.regions[regionId];
      if (typeof reg.repoRateAnnual !== 'number') return;
      const floorAnnual = Math.max(0, reg.policyRate - ON_RRP_SPREAD_BPS / 10000);
      const ceilAnnual = reg.policyRate + SRF_SPREAD_BPS / 10000;
      if (reg.repoRateAnnual < floorAnnual - 1e-6 || reg.repoRateAnnual > ceilAnnual + 1e-6) {
        violations.push({
          week: w,
          message: `${regionId} repo rate ${(reg.repoRateAnnual * 100).toFixed(3)}% outside corridor [${(floorAnnual * 100).toFixed(3)}%, ${(ceilAnnual * 100).toFixed(3)}%]`
        });
      }
    });
    // 5c-1. CASH: a FUND CANNOT BE OVERDRAWN. An institution's cash is a bank deposit; nothing
    // in this model lends it an unsecured overdraft, and the one entity type that can borrow
    // (a hedge fund, through HF1's prime broker) receives that borrowing AS CASH. So a negative
    // balance is a holder spending money it does not have.
    //
    // It was invisible because the deposit reconciliation clamps the line at zero
    // (`Math.max(0, cashLocal)`), which keeps the BANK's identity intact and re-plugs the same gap
    // every week — the defect paying for its own cover. Found by the settlement sweep.
    state.institutionalEntities.forEach((e: InstitutionalEntity) => {
      if (e.isDefaulted) return;
      const cashLocal = entityCashOf(ensureV2(state), e);
      if (cashLocal < -1e6) {
        violations.push({
          week: w,
          message: `${e.ticker ?? e.id} is overdrawn by ${(-cashLocal / 1e9).toFixed(2)}B — a fund spending money it does not have [id ${e.id} ${e.entityType} ${e.region}]`,
        });
      }
    });

    // 5c-2. REPO1/REPO2: the region's repo book is the register, and every scalar is derived
    // from it. Three things must hold, and none of them could even be ASKED while a position was
    // a scalar with no counterparty: what a bank borrows equals the contracts naming it as
    // borrower; what a lender lends equals the contracts naming it as lender; and no BUCKET is
    // pledged beyond what the pledger holds of that bucket (the blended-share version could hide
    // a thirty-year over-pledge behind a large two-year book).
    REGION_IDS.forEach(regionId => {
      const reg = state.regions[regionId];
      const book: RepoContract[] = reg.repoBook ?? [];
      if (book.length === 0) return;
      const borrowedBy = new Map<string, number>();
      const pledgedBy = new Map<string, Map<string, number>>();
      book.forEach((c) => {
        borrowedBy.set(c.borrowerTicker, (borrowedBy.get(c.borrowerTicker) ?? 0) + c.principalLocal);
        const byBond = pledgedBy.get(c.borrowerTicker) ?? new Map<string, number>();
        (c.collateral ?? []).forEach((p) => byBond.set(p.bondId, (byBond.get(p.bondId) ?? 0) + p.faceLocal));
        pledgedBy.set(c.borrowerTicker, byBond);
        if (!(c.principalLocal >= 0) || !(c.maturityWeek > c.struckWeek)) {
          violations.push({ week: w, message: `${regionId} repo contract ${c.id} is malformed (principal ${c.principalLocal}, ${c.struckWeek}->${c.maturityWeek})` });
        }
      });
      state.companies.forEach((c: Company) => {
        if (!c.isBankEntity || c.region !== regionId || !c.bankBalanceSheet) return;
        const bs = c.bankBalanceSheet;
        const derivedUSD = borrowedBy.get(c.ticker) ?? 0;
        const sheetUSD = (bs.repoBorrowedLocal ?? 0) + (bs.srfBorrowingLocal ?? 0);
        if (Math.abs(derivedUSD - sheetUSD) > 5e6) {
          violations.push({ week: w, message: `Bank ${c.ticker} secured borrowing ${(sheetUSD / 1e9).toFixed(2)}B disagrees with its ${(derivedUSD / 1e9).toFixed(2)}B of repo contracts` });
        }
        // §5-STRUCT step 3 — the same definition the engine reconciles against
        // (domain/collateral.ts). This check used a 1e6 tolerance against the reconcile's 1, so it
        // could fail a bank the engine had just declared clean.
        overPledgedByBond({
          pledgedByBond: (pledgedBy.get(c.ticker) ?? new Map()) as Map<string, number>,
          heldByBond: new Map(Object.entries(bs.sovereignBondHoldingsByBond ?? {})
            .map(([k, v]) => [k, Number(v) || 0])),
        }).forEach((excessUSD: number, bondId: string) => {
          const faceLocal = (pledgedBy.get(c.ticker) as Map<string, number>).get(bondId) ?? 0;
          const heldLocal = Number(bs.sovereignBondHoldingsByBond?.[bondId] ?? 0);
          if (excessUSD > 0) {
            violations.push({ week: w, message: `Bank ${c.ticker} pledged ${(faceLocal / 1e9).toFixed(2)}B of ${bondId} against ${(heldLocal / 1e9).toFixed(2)}B held of it` });
          }
        });
      });
    });

    state.companies.forEach((c: Company) => {
      if (!c.isBankEntity || !c.bankBalanceSheet || c.isDefaulted || c.mergerAcquired) return;
      const bs = c.bankBalanceSheet;
      const sovUSD = Object.values((bs.sovereignBondHoldingsByBond || {}) as Record<string, number>).reduce((a, v) => a + (Number(v) || 0), 0);
      // §7.246: the ONE pledge tolerance (domain/collateral.ts, $1) — this line sat at 1e6 one
      // screen below the unified per-bucket check, the §7.230 split-tolerance shape surviving in
      // the aggregate.
      if ((bs.repoEncumberedCollateralUSD ?? 0) > sovUSD + PLEDGE_ROUNDING_TOLERANCE_USD) {
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
      const boundThisWeek = new Set<string>(state.lastWeekDamperBoundIds ?? []);
      const next = new Map<string, number>();
      boundThisWeek.forEach(id => next.set(id, (damperBindStreak.get(id) ?? 0) + 1));
      next.forEach((streak, id) => {
        if (streak >= 3) damperPersistentBinds.add(id);
        damperWorstStreak = Math.max(damperWorstStreak, streak);
      });
      damperBindStreak = next;
    }

    // 6. Bank capital ratio & NIM bands — every region (§4.0 Tier 1 item 17: only the USA was
    // banded, so EUR banks printed negative margins for the model's whole life unwatched).
    REGION_IDS_SEED_ORDER.forEach((rid) => {
      const bank = state.regions[rid].bankingSector;
      if (bank.bankCapitalRatio < 0.05 || bank.bankCapitalRatio > 0.35) {
        violations.push({
          week: w,
          message: `${rid} Bank capital ratio out of band [0.05, 0.35]: ${bank.bankCapitalRatio.toFixed(4)}`
        });
      }
      if (bank.netInterestMarginPct < 0.01 || bank.netInterestMarginPct > 0.08) {
        violations.push({
          week: w,
          message: `${rid} Bank NIM out of band [0.01, 0.08]: ${bank.netInterestMarginPct.toFixed(4)}`
        });
      }
    });

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
    // VERBOSE=1 prints every line — the capped view hides the families the scoreboard rolls up.
    newViols.slice(0, VERBOSE ? newViols.length : 6).forEach(v => console.log(`     ! ${v.message}`));
    if (!VERBOSE && newViols.length > 6) console.log(`     ! ...+${newViols.length - 6} more this week`);
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

  // ---- §5-STRUCT step 6: how far the SEED is from where the ENGINE goes ----
  // Every §7.4 defect this project has recorded — the drained production pipeline, the CPI basket
  // on the wrong price concept, the register at a third of steady state, 36 of 37 categories short
  // of their own demand — is the same bug: the opening world is built by assertion and the engine
  // then produces something else. This is that gap, measured in one pass rather than discovered one
  // row at a time. A ratio far from 1.00 is a quantity the seed asserts and the engine disagrees
  // with; it is a defect list, and it is meant to flatten.
  if (seededProbe) {
    console.log('--- §5-STRUCT step 6: the seed against the settled world (1.00 = the seed was right) ---');
    compareToSettled(seededProbe, probeSteadyState(state)).forEach((p) => {
      console.log(`  ${p.name.padEnd(26)} seed ${p.seeded.toPrecision(6).padStart(12)} -> settled ${p.settled.toPrecision(6).padStart(12)}  x${p.ratio.toFixed(3)}`);
    });
  }

  // ---- §5-STRUCT step 5: the stage ordering surface (STAGE_TRACE=1) ----
  // Which orderings in core.ts are load-bearing, MEASURED rather than asserted. §7.226 moved one
  // stage on a correct diagnosis and broke the bank identity; nothing anywhere said that stage's
  // side effects depended on being inside the settlement window. This is that list.
  if (lastStageTrace) {
    lastStageTrace.report().forEach((line) => console.log(line));
    // §7.278: the ratchet — every measured backward edge runs over an annotated pipeline field;
    // an edge over an unannotated field is a NEW ordering hazard and fails the run.
    lastStageTrace.undeclaredEdges().forEach((e) => {
      violations.push({
        week: WEEKS,
        message: `stage '${e.reader}' reads '${e.field}' which later stage '${e.writer}' writes — an unannotated backward edge (annotate in stage-deps.ts DELIBERATE_PIPELINE_FIELDS or fix the order)`,
      });
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
  // §7.288 — the decomposition the number always needed: WHICH BOOK pins its instruments.
  // Every push site tags its ids `book:id`, so this is a read, not a guess.
  {
    const byBook = new Map<string, { n: number; up: number; down: number }>();
    damperPersistentBinds.forEach((id) => {
      const book = id.includes(':') ? id.slice(0, id.indexOf(':')) : 'untagged';
      const row = byBook.get(book) ?? { n: 0, up: 0, down: 0 };
      row.n++;
      if (id.endsWith('+')) row.up++; else if (id.endsWith('-')) row.down++;
      byBook.set(book, row);
    });
    // `+` = the market wanted the stat HIGHER than the damper printed, `-` = lower.
    const rows = [...byBook.entries()].sort((a, b) => b[1].n - a[1].n)
      .map(([k, r]) => `${k} ${r.n} (${r.up}+/${r.down}-)`).join(' | ');
    console.log(`  [damper-by-book] persistent binds :: ${rows}`);
  }

  auditSummary(auditFindings, WEEKS).forEach((line) => console.log(line));
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
