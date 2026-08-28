/**
 * HH close-out battery — every verify criterion the plan sets for the household project, run as
 * a measurement rather than an assertion. Reports numbers; judges nothing by itself.
 *
 *   npx tsx scripts/hh-battery.ts [weeks]
 */
import { createInitialGameState } from '../src/engine/simulation/initialization';
import { DEFAULT_SIMULATION_SEED, setRngState, getRngState } from '../src/engine/rng';
import { advanceWeeklyStep } from '../src/engine/simulation/core';
import { isActiveCompany } from '../src/domain/company';
import { GameState, RegionId } from '../src/types';

const WEEKS = Number(process.argv[2] ?? 120);
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
const clone = (s: GameState): GameState => structuredClone(s);

console.log(`=== HH CLOSE-OUT BATTERY (${WEEKS} weeks, seed ${DEFAULT_SIMULATION_SEED}) ===\n`);

// ---------------------------------------------------------------- baseline run
setRngState(DEFAULT_SIMULATION_SEED);
let s = createInitialGameState(DEFAULT_SIMULATION_SEED);
const series: Record<string, number[]> = {
  u: [], v: [], wage: [], tight: [], unmodeled: [], netWorth: [], consumption: [], infl: [],
};
let shockState: GameState | null = null; let shockRng = 0;
const SHOCK_WEEK = Math.min(40, Math.floor(WEEKS / 3));

for (let w = 1; w <= WEEKS; w++) {
  s = advanceWeeklyStep(s);
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
  if (w === SHOCK_WEEK) { shockState = clone(s); shockRng = getRngState(); }
}

// ------------------------------------------------- 1. the project's own scoreboard
console.log('--- 1. SCOREBOARD: unmodeled financial assets (must fall, never rise) ---');
{
  const hs0 = createInitialGameState(DEFAULT_SIMULATION_SEED).regions.USA.householdState;
  console.log(`  seed: ${B(hs0.unmodeledFinancialAssetsUSD ?? 0)}`);
  [1, 10, 40, Math.floor(WEEKS / 2), WEEKS].forEach(w => {
    const idx = w - 1;
    if (idx < series.unmodeled.length) {
      console.log(`  w${String(w).padStart(3)}: ${B(series.unmodeled[idx])}`);
    }
  });
  let rose = 0;
  for (let i = 1; i < series.unmodeled.length; i++) if (series.unmodeled[i] > series.unmodeled[i - 1] + 1) rose++;
  console.log(`  weeks it ROSE: ${rose} (must be 0 — a placeholder only shrinks)`);
  const hs = s.regions.USA.householdState;
  console.log(`  final share of household financial assets: ${pct((hs.unmodeledFinancialAssetsUSD ?? 0) / Math.max(1, hs.equityHoldingsUSD ?? 1))}`);
  console.log(`  residual capital-receipt share of income: ${pct(hs.unmodeledCapitalReceiptShareOfIncome ?? 0)}`);
}

// -------------------------------------- 2. every claim has a holder, every asset an issuer
console.log('\n--- 2. CLAIMS RECONCILE (both directions) ---');
REGIONS.forEach(r => {
  const reg = s.regions[r]; const hs = reg.householdState;
  const instLiab = s.institutionalEntities
    .filter(e => e.region === r && !e.isDefaulted)
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
  console.log(`  ${r}: instLiab=${B(instLiab)} held=${B(held)} (gap ${pct(gap)}) | netWorth parts gap ${pct(nwGap)} | tier-sum gap ${pct(tierGap)} | deposits-vs-banks gap ${pct(depGap)}`);
});

// -------------------------------------------------- 3. labor market relations
console.log('\n--- 3. LABOR MARKET RELATIONS ---');
{
  const du = series.u.slice(1).map((x, i) => x - series.u[i]);
  const dv = series.v.slice(1).map((x, i) => x - series.v[i]);
  console.log(`  Beveridge (u vs v): levels=${corr(series.u, series.v).toFixed(3)}  changes=${corr(du, dv).toFixed(3)}`);
  console.log(`  wage growth vs tightness: ${corr(series.wage, series.tight).toFixed(3)}`);
  console.log(`  u range ${pct(Math.min(...series.u))}-${pct(Math.max(...series.u))}   v range ${pct(Math.min(...series.v))}-${pct(Math.max(...series.v))}`);
  const realWage = series.wage.map((x, i) => x - series.infl[i]);
  console.log(`  mean nominal wage growth ${pct(series.wage.reduce((a, x) => a + x, 0) / series.wage.length)}, mean real ${pct(realWage.reduce((a, x) => a + x, 0) / realWage.length)}`);
}

// ------------------------------- 4. THE recession transmission (big employer fails)
console.log('\n--- 4. RECESSION TRANSMISSION: a big employer fails (A/B against control) ---');
if (shockState) {
  const horizon = Math.min(30, WEEKS - SHOCK_WEEK);
  const run = (st: GameState, kill: boolean) => {
    setRngState(shockRng);
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
    const out: { u: number[]; c: number[]; inc: number[] } = { u: [], c: [], inc: [] };
    for (let i = 0; i < horizon; i++) {
      x = advanceWeeklyStep(x);
      const reg = x.regions.USA;
      out.u.push(reg.unemploymentRate);
      out.c.push((reg.householdState.cohorts ?? []).reduce((a, ch) => a + ch.consumptionBudgetUSD, 0));
      out.inc.push(reg.estimatedHouseholdIncomeUSD);
    }
    return { out, killedName, killedJobs };
  };
  const ctl = run(shockState, false);
  const trt = run(shockState, true);
  const lf = s.regions.USA.totalPopulation * (1 - s.regions.USA.nonEmployablePct) * s.regions.USA.laborForceParticipation;
  console.log(`  killed at week ${SHOCK_WEEK}: ${trt.killedName}, ${(trt.killedJobs / 1e3).toFixed(1)}k jobs (${pct(trt.killedJobs / lf)} of the labor force)`);
  console.log(`  wk | unemployment (ctl -> shock)      | consumption budget (ctl -> shock)   | household income`);
  [1, 2, 4, 8, 16, horizon].filter((x, i, a) => x <= horizon && a.indexOf(x) === i).forEach(k => {
    const i = k - 1;
    console.log(`  +${String(k).padStart(2)} | ${pct(ctl.out.u[i])} -> ${pct(trt.out.u[i])}  (${((trt.out.u[i] - ctl.out.u[i]) * 100).toFixed(2)}pp) | ${B(ctl.out.c[i])} -> ${B(trt.out.c[i])} (${(((trt.out.c[i] / ctl.out.c[i]) - 1) * 100).toFixed(2)}%) | ${(((trt.out.inc[i] / ctl.out.inc[i]) - 1) * 100).toFixed(2)}%`);
  });
}

// ------------------------------------------------------- 5. stability at horizon
console.log('\n--- 5. STABILITY AT HORIZON ---');
REGIONS.forEach(r => {
  const reg = s.regions[r]; const hs = reg.householdState;
  const bad: string[] = [];
  const check = (n: string, v: number | undefined) => { if (v === undefined || !isFinite(v)) bad.push(n); };
  check('unemployment', reg.unemploymentRate); check('inflation', reg.inflation);
  check('netWorth', hs.netWorthUSD); check('income', reg.estimatedHouseholdIncomeUSD);
  check('deposits', hs.depositsUSD); check('gdp', reg.derivedNominalGdpUSD);
  console.log(`  ${r}: u=${pct(reg.unemploymentRate)} infl=${pct(reg.inflation)} netWorth=${B(hs.netWorthUSD ?? 0)} income=${B(reg.estimatedHouseholdIncomeUSD)} cohorts=${(hs.cohorts ?? []).length} ${bad.length ? 'NON-FINITE: ' + bad.join(',') : 'all finite'}`);
});
console.log(`\n  net worth / income (USA): ${(( s.regions.USA.householdState.netWorthUSD ?? 0) / s.regions.USA.estimatedHouseholdIncomeUSD).toFixed(2)}x`);
