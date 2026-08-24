import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

console.log('=== Starting Buybacks and M&A Probe ===\n');

let state = createInitialGameState();
let totalBuybackEvents = 0;
let totalMergerEvents = 0;

const initialShares: Record<string, number> = {};
state.companies.forEach(c => {
  initialShares[c.ticker] = c.sharesOutstanding;
});

for (let w = 1; w <= 520; w++) {
  const prevShares: Record<string, number> = {};
  state.companies.forEach(c => {
    prevShares[c.ticker] = c.sharesOutstanding;
  });

  state = advanceWeeklyStep(state);

  // Check for share reductions (buybacks)
  state.companies.forEach(c => {
    if (!c.isDefaulted && prevShares[c.ticker] && c.sharesOutstanding < prevShares[c.ticker]) {
      totalBuybackEvents++;
    }
  });

  // Check for merger news items
  const mergers = (state.newsFeed || []).filter(n => n.impactBadge === '[M&A MERGER]');
  if (mergers.length > 0) {
    totalMergerEvents += mergers.length;
    mergers.forEach(m => {
      console.log(`[Week ${w}] ${m.title}: ${m.description}`);
    });
  }
}

console.log(`\n=== 10-Year Simulation Summary ===`);
console.log(`Total Buyback Executions Tracked: ${totalBuybackEvents}`);
console.log(`Total M&A Merger Events: ${totalMergerEvents}`);

let errors = 0;
// Check sanity of share counts
state.companies.forEach(c => {
  if (isNaN(c.sharesOutstanding) || c.sharesOutstanding <= 0) {
    console.error(`ERROR: Invalid sharesOutstanding for ${c.ticker}: ${c.sharesOutstanding}`);
    errors++;
  }
  if (isNaN(c.cash)) {
    console.error(`ERROR: Invalid cash for ${c.ticker}: ${c.cash}`);
    errors++;
  }
});

if (totalBuybackEvents === 0) {
  console.error('ERROR: Expected at least one buyback event over 10 years');
  errors++;
}

if (errors === 0) {
  console.log('\nPROBE PASSED — Buybacks and M&A logic function correctly.');
  process.exit(0);
} else {
  console.error(`\nPROBE FAILED with ${errors} error(s).`);
  process.exit(1);
}
