/**
 * PUB close-out battery — every verify criterion the plan sets for the public sector, run as a
 * measurement rather than an assertion. Reports numbers; judges nothing by itself.
 *
 *   npx tsx scripts/pub-battery.ts [weeks]
 */
import { createInitialGameState } from '../src/engine/simulation/initialization';
import { DEFAULT_SIMULATION_SEED, setRngState, getRngState } from '../src/engine/rng';
import { advanceWeeklyStep } from '../src/engine/simulation/core';
import { isActiveCompany } from '../src/domain/company';
import { sovereignCouponByBucket, weeklyInterestExpenseUSD, decomposeGovernmentSpending } from '../src/domain/government';
import { centralBankAssetsUSD } from '../src/domain/central-bank';
import { GOV_PROCUREMENT_SHARE_OF_SPENDING } from '../src/engine/bootstrap/national-accounts';
import { sovBucketKey } from '../src/engine/simulation/stages/shared-helpers';
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

/** Who receives the region's sovereign coupon this week, from the real books. */
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

console.log(`=== PUB CLOSE-OUT BATTERY (${WEEKS} weeks, seed ${DEFAULT_SIMULATION_SEED}) ===\n`);

setRngState(DEFAULT_SIMULATION_SEED);
let s = createInitialGameState(DEFAULT_SIMULATION_SEED);
const series: Record<string, number[]> = {
  interestShare: [], procShare: [], procSpent: [], unspentProc: [], stance: [],
  tga: [], cbBook: [], reinvest: [], remit: [], policy: [], portYield: [],
  unbacked: [], unmodeledTax: [], revenue: [], outlays: [], debtGdp: [], y2: [], y10: [], cmb: [],
};
let shockState: GameState | null = null; let shockRng = 0;
const SHOCK_WEEK = Math.min(40, Math.floor(WEEKS / 3));
let negativeTga = 0, negativeYield = 0;

for (let w = 1; w <= WEEKS; w++) {
  s = advanceWeeklyStep(s);
  const reg: any = s.regions.USA;
  const cb = reg.centralBankSheet;
  const d = decomposeGovernmentSpending(reg.governmentSpendingUSD, reg.governmentInterestWeeklyUSD ?? 0,
    GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore);
  series.interestShare.push(d.interestUSD / Math.max(1, reg.governmentSpendingUSD));
  series.procShare.push(d.procurementBudgetUSD / Math.max(1, reg.governmentSpendingUSD));
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
  series.y2.push(reg.zeroRates.tenor2Y);
  series.y10.push(reg.zeroRates.tenor10Y);
  // The CB's own portfolio yield, for the remittance criterion.
  const cbCoupon = couponReceipts(s, 'USA').central * 52;
  series.portYield.push(centralBankAssetsUSD(cb) > 0 ? cbCoupon / centralBankAssetsUSD(cb) : 0);
  REGIONS.forEach(r => {
    const rr: any = s.regions[r];
    if ((rr.centralBankSheet?.treasuryAccountUSD ?? 0) < 0) negativeTga++;
    if (rr.zeroRates.tenor2Y < 0 || rr.zeroRates.tenor10Y < 0) negativeYield++;
  });
  if (w === SHOCK_WEEK) { shockState = clone(s); shockRng = getRngState(); }
}

// ------------------------------------------- 1. every coupon reaches a real holder
console.log('--- 1. THE COUPON REACHES A HOLDER, AND THE GOVERNMENT PAYS IT ---');
REGIONS.forEach(r => {
  const c = couponReceipts(s, r);
  const attributed = c.banks + c.insts + c.central;
  console.log(`  ${r}: paid ${B(c.paid)}/wk = banks ${B(c.banks)} + institutions ${B(c.insts)} + central bank ${B(c.central)} ` +
    `= ${B(attributed)} (${pct(attributed / Math.max(1, c.paid))}), unmodeled (foreign) ${B(c.unmodeled)} ` +
    `[residual ${B(c.paid - attributed - c.unmodeled)}]`);
});

// -------------------------------------------------- 2. the named gaps, all of them
console.log('\n--- 2. THE NAMED GAPS (each must fall, none may be assumed away) ---');
{
  const at = (a: number[], w: number) => (w <= a.length ? B(a[w - 1]) : 'n/a');
  const marks = [13, 52, WEEKS].filter((w, i, arr) => w <= WEEKS && arr.indexOf(w) === i);
  console.log(`  governmentInterestToUnmodeledHolders (USA): ${B(couponReceipts(s, 'USA').unmodeled)}/wk — foreign only now that PUB2b made the CB a holder`);
  console.log(`  unmodeledTaxRevenueUSD:      w1 ${at(series.unmodeledTax, 1)} -> w${WEEKS} ${at(series.unmodeledTax, WEEKS)}`);
  console.log(`  unbackedBankCashUSD:         ${marks.map(w => `w${w} ${at(series.unbacked, w)}`).join('  ')}`);
  console.log(`  unspentProcurementBudget:    ${marks.map(w => `w${w} ${at(series.unspentProc, w)}/wk`).join('  ')}`);
  const fill = series.procSpent.map((v, i) => v / Math.max(1, v + series.unspentProc[i]));
  console.log(`  procurement fill ratio:      mean ${pct(fill.reduce((a, x) => a + x, 0) / fill.length)}, range ${pct(Math.min(...fill))}-${pct(Math.max(...fill))}`);
}

// ------------------------------------------ 3. debt service crowds out the budget
console.log('\n--- 3. CROWDING OUT: does debt service squeeze real purchases? ---');
{
  const stanceFlat = series.stance.every(v => Math.abs(v - series.stance[0]) < 1e-9);
  console.log(`  corr(interest share of budget, procurement share) = ${corr(series.interestShare, series.procShare).toFixed(3)}` +
    (stanceFlat ? '  [ARITHMETIC, not evidence: with a flat stance the budget share IS 0.35 x (1 - interest share)]' : '  [stance moves, so this is the net of two channels]'));
  console.log(`  corr(interest share, REALIZED procurement spend)  = ${corr(series.interestShare, series.procSpent).toFixed(3)}`);
  const disc = (s.regions.USA as any).governmentBillDiscountAccrualUSD ?? 0;
  const cash = (s.regions.USA as any).governmentInterestWeeklyUSD ?? 0;
  console.log(`  PUB3d: reported interest is CASH-basis (bonds only) ${B(cash)}/wk; the bill discount accruing beside it is ${B(disc)}/wk — accrual burden ${B(cash + disc)}/wk`);
  console.log(`  interest share range ${pct(Math.min(...series.interestShare))}-${pct(Math.max(...series.interestShare))}, ` +
    `debt/GDP ${pct(Math.min(...series.debtGdp))}-${pct(Math.max(...series.debtGdp))}, ` +
    `fiscal stance ${Math.min(...series.stance).toFixed(2)}..${Math.max(...series.stance).toFixed(2)} (confounds the raw correlation upward)`);
}

// ---------------------------------------------- 4. the central bank's own criteria
console.log('\n--- 4. CENTRAL BANK: remittances, regimes, and the book ---');
{
  // In LEVELS this is confounded: PUB2b grows the book, which lifts both coupon income and the
  // remittance over the run. The criterion is a RESPONSE, so measure it in changes.
  const excess = series.policy.map((p, i) => p - series.portYield[i]);
  const d = (a: number[]) => a.slice(1).map((x, i) => x - a[i]);
  console.log(`  corr(policy rate, remittance):            levels ${corr(series.policy, series.remit).toFixed(3)}  changes ${corr(d(series.policy), d(series.remit)).toFixed(3)}`);
  console.log(`  corr(policy - portfolio yield, remittance): levels ${corr(excess, series.remit).toFixed(3)}  changes ${corr(d(excess), d(series.remit)).toFixed(3)}   (negative = the real post-hiking phenomenon)`);
  const negRemitWeeks = series.remit.filter(v => v < 0).length;
  console.log(`  remittance negative in ${negRemitWeeks}/${WEEKS} weeks; range ${B(Math.min(...series.remit))}..${B(Math.max(...series.remit))}/wk`);
  const qt = series.reinvest.filter(v => v < 0.999).length;
  console.log(`  CB book ${B(series.cbBook[0])} -> ${B(series.cbBook[series.cbBook.length - 1])}; QT weeks (reinvestment < 1): ${qt}/${WEEKS}`);
  console.log(`  reinvestment share range ${Math.min(...series.reinvest).toFixed(3)}..${Math.max(...series.reinvest).toFixed(3)}`);
}

// --------------------------------------------- 5. the treasury's account behaves
console.log('\n--- 5. THE TREASURY ACCOUNT ---');
{
  console.log(`  TGA range ${B(Math.min(...series.tga))}..${B(Math.max(...series.tga))}; negative in ${negativeTga} region-weeks (must be 0)`);
  const rev = series.revenue, out = series.outlays;
  const meanDeficit = out.reduce((a, v, i) => a + (v - rev[i]), 0) / out.length;
  const dryWeeks = rev.filter(v => v < 1e8).length;
  console.log(`  mean weekly deficit (outlays - revenue) ${B(meanDeficit)}; negative nominal yields in ${negativeYield} region-weeks`);
  // Revenue is bottom-up (PUB1b/1c) and the spending PATH is still a formula, so compare their
  // growth. It MUST be a trailing ANNUAL sum: receipts are quarterly-lumpy by design, and
  // comparing short windows at two endpoints measures whether each window happened to contain a
  // collection date, not growth. Doing exactly that once reported a 25x divergence that is
  // really 1.3x — see §7.68's correction.
  const trail = (a: number[], end: number, n = 52) => a.slice(Math.max(0, end - n), end).reduce((x, y) => x + y, 0);
  if (WEEKS >= 104) {
    const half = Math.floor(WEEKS / 2);
    const rg = trail(rev, WEEKS) / Math.max(1, trail(rev, half));
    const og = trail(series.outlays, WEEKS) / Math.max(1, trail(series.outlays, half));
    console.log(`  trailing-52wk revenue ${B(trail(rev, WEEKS))} vs outlays ${B(trail(series.outlays, WEEKS))} = ${(trail(rev, WEEKS) / Math.max(1, trail(series.outlays, WEEKS))).toFixed(2)}x`);
    const lead = rg > og ? 'revenue outgrows outlays, filling the account'
      : 'outlays outgrow revenue, so the deficit is structural and must be financed';
    console.log(`  growth w${half} -> w${WEEKS}: revenue x${rg.toFixed(1)}, outlays x${og.toFixed(1)} — ${lead}`);
    const cmb = series.cmb.reduce((a, v) => a + v, 0);
    console.log(`  extra bill issuance to bridge the account: ${B(cmb)} total, ${series.cmb.filter(v => v > 0).length}/${WEEKS} weeks (PUB3c)`);
  } else {
    console.log(`  (revenue/outlays growth needs >=104 weeks: a trailing-annual window on quarterly receipts)`);
  }
  console.log(`  revenue is LUMPY by design (PUB1c calendars): ${dryWeeks}/${WEEKS} weeks collect under 0.1B, peak ${B(Math.max(...rev))} — the swing a TGA exists to absorb`);
}

// ------------------------------- 6. THE limit case: a debt spiral, forced by a shock
console.log('\n--- 6. THE DEBT SPIRAL: quadruple the coupon on the whole stack (A/B) ---');
if (shockState) {
  const horizon = Math.min(40, WEEKS - SHOCK_WEEK);
  const run = (st: GameState, shock: boolean) => {
    setRngState(shockRng);
    let x = clone(st);
    if (shock) {
      const reg: any = x.regions.USA;
      (reg.govDebtTranches || []).forEach((t: any) => { t.couponRate = (t.couponRate ?? 0) * 4 + 0.04; });
    }
    const o = { interest: [] as number[], proc: [] as number[], transfers: [] as number[], debt: [] as number[], tga: [] as number[] };
    for (let i = 0; i < horizon; i++) {
      x = advanceWeeklyStep(x);
      const reg: any = x.regions.USA;
      const d = decomposeGovernmentSpending(reg.governmentSpendingUSD, reg.governmentInterestWeeklyUSD ?? 0,
        GOV_PROCUREMENT_SHARE_OF_SPENDING, reg.fiscalStanceScore);
      o.interest.push(d.interestUSD); o.transfers.push(d.transfersUSD);
      o.proc.push(reg.governmentProcurementSpentUSD ?? 0);
      o.debt.push(reg.debtToGdpPctBottomUp ?? 0);
      o.tga.push(reg.centralBankSheet?.treasuryAccountUSD ?? 0);
    }
    return o;
  };
  const ctl = run(shockState, false);
  const trt = run(shockState, true);
  console.log(`  shocked at week ${SHOCK_WEEK}. wk | interest/wk (ctl -> shock) | REAL procurement | transfers | debt/GDP`);
  [1, 4, 8, 16, horizon].filter((x, i, a) => x <= horizon && a.indexOf(x) === i).forEach(k => {
    const i = k - 1;
    console.log(`  +${String(k).padStart(2)} | ${B(ctl.interest[i])} -> ${B(trt.interest[i])} | ${B(ctl.proc[i])} -> ${B(trt.proc[i])} (${(((trt.proc[i] / Math.max(1, ctl.proc[i])) - 1) * 100).toFixed(1)}%) | ${B(ctl.transfers[i])} -> ${B(trt.transfers[i])} | ${pct(ctl.debt[i])} -> ${pct(trt.debt[i])}`);
  });
}

// ------------------------------------------------------- 7. stability at horizon
console.log('\n--- 7. STABILITY AT HORIZON ---');
REGIONS.forEach(r => {
  const reg: any = s.regions[r]; const cb = reg.centralBankSheet;
  const bad: string[] = [];
  const check = (n: string, v: number | undefined) => { if (v === undefined || !isFinite(v)) bad.push(n); };
  check('revenue', reg.governmentRevenueUSD); check('outlays', reg.governmentOutlaysUSD);
  check('interest', reg.governmentInterestWeeklyUSD); check('tga', cb?.treasuryAccountUSD);
  check('cbBook', centralBankAssetsUSD(cb)); check('2Y', reg.zeroRates.tenor2Y); check('10Y', reg.zeroRates.tenor10Y);
  console.log(`  ${r}: rev(this wk) ${B(reg.governmentRevenueUSD)} outlays ${B(reg.governmentOutlaysUSD ?? 0)} interest ${B(reg.governmentInterestWeeklyUSD ?? 0)} ` +
    `tga ${B(cb?.treasuryAccountUSD ?? 0)} cbBook ${B(centralBankAssetsUSD(cb))} 2Y ${pct(reg.zeroRates.tenor2Y)} 10Y ${pct(reg.zeroRates.tenor10Y)} ` +
    `${bad.length ? 'NON-FINITE: ' + bad.join(',') : 'all finite'}`);
});
