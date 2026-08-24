import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import { GameState } from '../src/types';

console.log('=== Starting Production Economics Probe ===\n');

let state = createInitialGameState();

const initialSupplierFirms = state.companies.filter(c => 
  (c.productLines || []).some(l => l.category === 'CorporateIndustrial')
);

console.log(`Found ${initialSupplierFirms.length} supplier firms in CorporateIndustrial at week 0:`);
initialSupplierFirms.forEach(c => {
  const line = c.productLines.find(l => l.category === 'CorporateIndustrial');
  console.log(`  - ${c.ticker} (${c.region}, ${c.sector}): Rev=$${c.annualRevenue.toFixed(1)}M, LineShare=${(line?.revenueShare ?? 0) * 100}%, FGInventory=$${c.finishedGoodsInventoryUSD}M`);
});

let throttledCount = 0;
let totalSupplierProductionUSD = 0;
let maxInventoryHeldUSD = 0;
let maxInventoryRatio = 0;

for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);

  const supplierFirms = state.companies.filter(c => 
    (c.productLines || []).some(l => l.category === 'CorporateIndustrial')
  );

  supplierFirms.forEach(c => {
    const inv = c.finishedGoodsInventoryUSD ?? 0;
    const rev = Math.max(1, c.annualRevenue);
    const ratio = inv / rev;
    if (inv > maxInventoryHeldUSD) maxInventoryHeldUSD = inv;
    if (ratio > maxInventoryRatio) maxInventoryRatio = ratio;
    if (inv > rev * 0.15) throttledCount++;
    totalSupplierProductionUSD += (c._targetProductionUSD ?? 0);
  });

  if (w % 104 === 0 || w === 52 || w === 1) {
    const usaIndustrial = state.regions.USA.categoryDemand.CorporateIndustrial as any;
    console.log(`\n--- Week ${w} Snapshot ---`);
    console.log(`CorporateIndustrial (USA): ClearedPriceIndex=${usaIndustrial?.clearedInputPriceIndex?.toFixed(4)}, CategoryInventoryLevel=$${(usaIndustrial?.inventoryLevelUSD ?? 0).toFixed(2)}M, Demand=$${(usaIndustrial?.demandLevelUSD ?? 0).toFixed(2)}M`);
    
    supplierFirms.slice(0, 3).forEach(c => {
      const line = c.productLines.find(l => l.category === 'CorporateIndustrial');
      console.log(`  Firm ${c.ticker}: Rev=$${c.annualRevenue.toFixed(1)}M, Cash=$${c.cash.toFixed(1)}M, FGInv=$${(c.finishedGoodsInventoryUSD ?? 0).toFixed(2)}M, WhCap=$${(c.annualRevenue * 0.15).toFixed(2)}M, Defaulted=${c.isDefaulted}`);
    });
  }
}

console.log('\n=== Production Economics Summary (520 Weeks) ===');
console.log(`Total supplier cumulative target production: $${totalSupplierProductionUSD.toFixed(1)}M`);
console.log(`Peak finished goods inventory held by any firm: $${maxInventoryHeldUSD.toFixed(2)}M`);
console.log(`Peak inventory/revenue ratio: ${(maxInventoryRatio * 100).toFixed(2)}%`);
console.log(`Throttled firm-weeks observed: ${throttledCount}`);

// Integrity checks
let errors = 0;
state.companies.forEach(c => {
  if (isNaN(c.finishedGoodsInventoryUSD)) {
    console.error(`ERROR: Company ${c.ticker} has NaN finishedGoodsInventoryUSD`);
    errors++;
  }
  if (c.finishedGoodsInventoryUSD < -0.01) {
    console.error(`ERROR: Company ${c.ticker} has negative finishedGoodsInventoryUSD: ${c.finishedGoodsInventoryUSD}`);
    errors++;
  }
});

if (errors === 0) {
  console.log('\nPROBE PASSED — Production economics and finished goods inventory functioning smoothly with no NaNs.');
  process.exit(0);
} else {
  console.error(`\nPROBE FAILED with ${errors} error(s).`);
  process.exit(1);
}
