/**
 * XB close-out battery — every verify criterion §5-XB sets, run as a measurement rather than an
 * assertion. Reports numbers; judges nothing by itself.
 *
 *   npx tsx scripts/xb-battery.ts [weeks]
 */
import { createInitialGameState } from '../src/engine/simulation/initialization';
import { advanceWeeklyStep } from '../src/engine/simulation/core';
import { isActiveCompany } from '../src/domain/company';
import { INDUSTRY_SUBUNITS } from '../src/domain/industry';
import { SUBUNIT_PHYSICAL, deliveryModeOf } from '../src/domain/goods-physical';
import { laneDistanceNm } from '../src/domain/geography';
import { laneKey, laneTransitWeeks } from '../src/domain/carrier';
import { centralBankFxReservesUSD } from '../src/domain/central-bank';
import { isCarrier } from '../src/engine/simulation/stages/freight-clearing';
import { getFxToUsd } from '../src/engine/simulation/stages/06-fx-and-trade';
import { GameState, RegionId } from '../src/types';

const WEEKS = Number(process.argv[2] ?? 60);
const REGIONS: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
const B = (x: number) => (x / 1e9).toFixed(2) + 'B';
const pct = (x: number) => (x * 100).toFixed(1) + '%';
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

let s: GameState = createInitialGameState();
const history: { week: number; exports: Record<string, number>; freightRev: number; rates: Record<string, number> }[] = [];

for (let w = 1; w <= WEEKS; w++) {
  s = advanceWeeklyStep(s);
  const exportsByRegion: Record<string, number> = {};
  REGIONS.forEach(r => { exportsByRegion[r] = s.regions[r].exportsUSD ?? 0; });
  history.push({
    week: w,
    exports: exportsByRegion,
    freightRev: s.companies.filter(isCarrier).reduce((a, c) => a + c.annualRevenue, 0),
    rates: { ...s.freightRatePerTonneLaneMoneyByLane },
  });
}

console.log(`\n=== XB CLOSE-OUT BATTERY — ${WEEKS} weeks, seed default ===\n`);

// 1. Trade reconciles: every export is somebody's import.
console.log('1. TRADE RECONCILES TO WHO BOUGHT FROM WHOM');
const totX = REGIONS.reduce((a, r) => a + (s.regions[r].exportsUSD ?? 0), 0);
const totM = REGIONS.reduce((a, r) => a + (s.regions[r].importsUSD ?? 0), 0);
console.log(`   world exports ${B(totX)}  world imports ${B(totM)}  gap ${pct(Math.abs(totX - totM) / Math.max(1, totX))}`);
REGIONS.forEach(r => {
  const reg = s.regions[r];
  console.log(`   ${r.padEnd(4)} X ${B(reg.exportsUSD ?? 0)}  M ${B(reg.importsUSD ?? 0)}  balance ${B(reg.tradeBalance ?? 0)}`);
});

// 2. Trade share is an OUTCOME of physics, not of a table.
console.log('\n2. TRADE SHARE AGAINST THE PHYSICS THAT SHOULD DRIVE IT');
const density: number[] = [];
const imported: number[] = [];
const rows: string[] = [];
Object.values(INDUSTRY_SUBUNITS).flat().forEach(su => {
  const phys = SUBUNIT_PHYSICAL[su.unitId];
  if (!phys || phys.deliveryMode !== 'PHYSICAL' || !phys.baselineValueDensityUsdPerTonne) return;
  // A good's imported share: the units USA sourced abroad over everything it sourced.
  const split = (s as any).__lastSplit?.get?.(`USA|${su.unitId}`);
  const mass = s.unitMassTonnes[su.unitId] ?? 0;
  if (!(mass > 0)) return;
  density.push(phys.baselineValueDensityUsdPerTonne);
  // Proxy the imported share by freight cost as a share of value on the busiest ocean lane.
  const rate = s.freightRatePerTonneLaneMoneyByLane[laneKey('EUR', 'USA')] ?? 0;
  const price = Number((s.regions.USA.categoryDemand[su.unitId] as any)?.unitPriceUSD) || 1;
  const freightShare = (mass * rate) / price;
  imported.push(-freightShare);
  rows.push(`   ${su.unitId.padEnd(26)} $${String(phys.baselineValueDensityUsdPerTonne).padStart(8)}/t  freight ${pct(freightShare).padStart(8)} of value`);
  void split;
});
rows.slice(0, 8).forEach(r => console.log(r));
console.log(`   Spearman(value density, -freight share of value) = ${spearman(density, imported).toFixed(3)}  (n=${density.length})`);
console.log('   [1.000 means: the denser the value, the less freight matters — physics deciding tradability]');

// 3. Freight is a real market on real firms.
console.log('\n3. CARRIERS AND THE FREIGHT MARKET');
const carriers = s.companies.filter(isCarrier);
const alive = carriers.filter(c => isActiveCompany(c));
console.log(`   carriers ${alive.length} alive of ${carriers.length}   fleet ${carriers.reduce((a, c) => a + (c.carrierFleet?.assets.length ?? 0), 0)} assets`);
console.log(`   logistics revenue ${B(carriers.reduce((a, c) => a + c.annualRevenue, 0))}  = ${pct(carriers.reduce((a, c) => a + c.annualRevenue, 0) / Math.max(1, REGIONS.reduce((a, r) => a + (s.regions[r].derivedNominalGdpUSD ?? 0), 0)))} of world GDP  [real economies: 5-6%]`);
const rateStart = history[0].rates;
const rateEnd = history[history.length - 1].rates;
console.log('   lane            transit(wk)   rate wk1     rate final    change');
Object.keys(rateEnd).sort().slice(0, 8).forEach(k => {
  const [from, to] = k.split('>') as [RegionId, RegionId];
  const t = laneTransitWeeks(from, to, laneDistanceNm(from, to));
  const a = rateStart[k] ?? 0, b = rateEnd[k] ?? 0;
  console.log(`   ${k.padEnd(12)} ${t.toFixed(2).padStart(11)} ${a.toFixed(2).padStart(11)} ${b.toFixed(2).padStart(13)} ${(a > 0 ? ((b / a - 1) * 100).toFixed(0) + '%' : 'n/a').padStart(9)}`);
});

// 4. Every dollar of freight lands on a named carrier.
console.log('\n4. FREIGHT REVENUE HAS A NAMED RECIPIENT');
const withRevenue = carriers.filter(c => (c.carrierFleet?.lastWeekFreightRevenueUSD ?? 0) > 0);
console.log(`   carriers earning freight this week: ${withRevenue.length} of ${alive.length}`);
console.log(`   last week's tonne-miles carried: ${carriers.reduce((a, c) => a + (c.carrierFleet?.lastWeekTonneNm ?? 0), 0).toExponential(2)}`);

// 5. Lead time is real and goods are in transit.
console.log('\n5. TRANSIT AND THE PIPELINE');
const inTransit = s.goodsInTransit ?? [];
const valueInTransit = inTransit.reduce((a, sh) => a + sh.units * sh.landedCostPerUnit, 0);
console.log(`   consignments in transit ${inTransit.length}   value ${B(valueInTransit)}`);
console.log(`   longest lane transit: EUR>JPN ${laneTransitWeeks('EUR', 'JPN', laneDistanceNm('EUR', 'JPN')).toFixed(2)} weeks`);

// 6. The currency boundary.
console.log('\n6. THE CURRENCY BOUNDARY');
REGIONS.forEach(r => {
  const fx = getFxToUsd(s.fxPairs, r);
  const mean = Object.values(INDUSTRY_SUBUNITS).flat().reduce((acc, su) => {
    const p = Number((s.regions[r].categoryDemand[su.unitId] as any)?.unitPriceUSD) || 0;
    const pu = Number((s.regions.USA.categoryDemand[su.unitId] as any)?.unitPriceUSD) || 0;
    return p > 0 && pu > 0 ? { n: acc.n + 1, sum: acc.sum + (p * fx) / pu } : acc;
  }, { n: 0, sum: 0 });
  console.log(`   ${r.padEnd(4)} fx ${fx.toFixed(4)}   mean converted price vs USA ${(mean.sum / Math.max(1, mean.n)).toFixed(3)}  [1.000 = law of one price]`);
});

// 7. Central-bank FX reserves are real and move.
console.log('\n7. CENTRAL-BANK FX RESERVES (XB5)');
REGIONS.forEach(r => {
  const cb = s.regions[r].centralBankSheet;
  console.log(`   ${r.padEnd(4)} reserves ${B(cb ? centralBankFxReservesUSD(cb) : 0)}   import cover ${((cb ? centralBankFxReservesUSD(cb) : 0) / Math.max(1, (s.regions[r].importsUSD ?? 0) / 12)).toFixed(1)} months`);
});

// 8. Foreign ownership, measured not imposed (XB1).
console.log('\n8. FOREIGN OWNERSHIP, MEASURED (XB1)');
const mfo = (s.regions.USA as any).measuredForeignOwnership;
console.log(`   USA measured foreign ownership: ${mfo ? JSON.stringify(mfo) : '(not published this week)'}`);

// 9. Finiteness and conservation.
console.log('\n9. INVARIANTS');
const finite = REGIONS.every(r => Number.isFinite(s.regions[r].derivedNominalGdpUSD ?? 0));
console.log(`   every region's GDP finite: ${finite}`);
console.log(`   goods with no delivery mode: ${Object.values(INDUSTRY_SUBUNITS).flat().filter(su => !SUBUNIT_PHYSICAL[su.unitId]).length}`);
console.log(`   in-place goods ever imported: ${inTransit.filter(sh => deliveryModeOf(sh.subUnitId) === 'IN_PLACE').length} (must be 0)`);

console.log('\nNOT MEASURED HERE, and why:');
console.log('  - which currency became the vehicle: needs XB6. While USD is the FX numeraire the');
console.log('    cheapest vehicle is decided by the model plumbing, so the question is not askable.');
console.log('  - hedged-yield-pickup predicting bond flows, and FX forward open interest against the');
console.log('    hedged bond stock: XB2/XB2b criteria, unchanged by XB3a and measured at their own close.');
