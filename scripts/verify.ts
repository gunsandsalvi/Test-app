import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import { GameState, RegionId } from '../src/types';

interface Violation { week: number; message: string; }
const violations: Violation[] = [];
const PIN_THRESHOLD_WEEKS = 200;

function isNaNAnywhere(state: GameState): string[] {
  const bad: string[] = [];
  state.companies.forEach(c => {
    if (isNaN(c.annualRevenue) || isNaN(c.ebitda) || isNaN(c.stockPrice) || isNaN(c.eps)) bad.push(`company ${c.ticker}`);
    (c.productLines || []).forEach(l => {
      if (isNaN(l.categoryMarketShare) || isNaN(l.competitiveness)) bad.push(`company ${c.ticker} productLine ${l.category}`);
    });
  });
  (Object.keys(state.regions) as RegionId[]).forEach(id => {
    const r = state.regions[id];
    if (isNaN(r.gdpGrowth) || isNaN(r.inflation) || isNaN(r.unemploymentRate) || isNaN(r.policyRate)) bad.push(`region ${id} core macro`);
    if (isNaN(r.bankingSector.bankCapitalRatio) || isNaN(r.bankingSector.netInterestMarginPct)) bad.push(`region ${id} banking`);
  });
  const idx: any = state.compositeIndices;
  if (isNaN(idx.marketBreadth) || isNaN(idx.globalCreditComposite?.value)) bad.push('composite indices');
  return bad;
}

const initialState = createInitialGameState();
let state = initialState;
const initialRevenueByTicker = new Map(initialState.companies.map(c => [c.ticker, c.annualRevenue]));
const trackers: Record<string, { history: number[]; extract: (s: GameState) => number }> = {
  usaInflation: { history: [], extract: s => s.regions.USA.inflation },
  usaUnemployment: { history: [], extract: s => s.regions.USA.unemploymentRate },
  usaBankCapitalRatio: { history: [], extract: s => s.regions.USA.bankingSector.bankCapitalRatio },
  usaCreditConditions: { history: [], extract: s => s.regions.USA.bankingSector.creditConditionsIndex },
  usaGdpGrowthBlended: { history: [], extract: s => s.regions.USA.gdpGrowth },
};

for (let w = 1; w <= 520; w++) {
  console.log(`Advancing Week ${w}`);
  state = advanceWeeklyStep(state);
  const nan = isNaNAnywhere(state);
  if (nan.length > 0) violations.push({ week: w, message: `NaN detected: ${nan.join(', ')}` });
  const bottomUpGdp = state.regions.USA.gdpGrowthBottomUp;
  if (isNaN(bottomUpGdp) || Math.abs(bottomUpGdp) > 0.5) {
    violations.push({ week: w, message: `gdpGrowthBottomUp out of sane diagnostic range: ${bottomUpGdp}` });
  }
  Object.entries(trackers).forEach(([name, t]) => {
    t.history.push(t.extract(state));
    if (t.history.length > PIN_THRESHOLD_WEEKS) {
      const recent = t.history.slice(-PIN_THRESHOLD_WEEKS);
      const allSame = recent.every(v => Math.abs(v - recent[0]) < 1e-9);
      if (allSame) violations.push({ week: w, message: `${name} has not moved in ${PIN_THRESHOLD_WEEKS} consecutive weeks (pinned at ${recent[0]})` });
    }
  });
}

state.companies.forEach(c => {
  const initial = initialRevenueByTicker.get(c.ticker);
  if (initial && c.annualRevenue > initial * 20) {
    violations.push({ week: 520, message: `${c.ticker} revenue grew ${(c.annualRevenue/initial).toFixed(0)}x over the run — check for a circularity` });
  }
});

const revenueAtStart = new Map(initialState.companies.map(c => [c.ticker, c.annualRevenue]));
const defaultedGrowers = state.companies.filter(c => {
  if (!c.isDefaulted) return false;
  const startRev = revenueAtStart.get(c.ticker);
  return startRev && c.annualRevenue > startRev * 1.2; // defaulted while revenue was still meaningfully above its starting level
});
if (defaultedGrowers.length > 3) {
  violations.push({ week: 520, message: `${defaultedGrowers.length} companies defaulted while revenue was still elevated vs. their starting level — worth a manual check: ${defaultedGrowers.map(c=>c.ticker).join(', ')}` });
}

const finalBankCapRatio = trackers.usaBankCapitalRatio.history[trackers.usaBankCapitalRatio.history.length - 1];
if (finalBankCapRatio > 0.35 || finalBankCapRatio < 0.05) {
  violations.push({ week: 520, message: `bankCapitalRatio out of plausible band: ${finalBankCapRatio}` });
}
const finalNim = state.regions.USA.bankingSector.netInterestMarginPct;
if (finalNim > 0.08 || finalNim < 0.01) {
  violations.push({ week: 520, message: `netInterestMarginPct out of plausible band: ${finalNim}` });
}

if (violations.length === 0) {
  console.log('VERIFY PASSED — 520 weeks, no NaN, no pinned series, banking metrics in band.');
  process.exit(0);
} else {
  console.log(`VERIFY FAILED — ${violations.length} violation(s):`);
  violations.forEach(v => console.log(`  week ${v.week}: ${v.message}`));
  process.exit(1);
}
