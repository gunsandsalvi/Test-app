import { createInitialGameState } from '../src/engine/simulation';
import * as fs from 'fs';

const state = createInitialGameState();
const copperProducers = state.companies.filter(c => (c as any).producedCommodityId === 'COPPER' && !c.isDefaulted);
const dump = {
  copperProducerCount: copperProducers.length,
  copperProducers: copperProducers.map(c => ({ ticker: c.ticker, region: c.region, annualRevenue: c.annualRevenue, ebitda: c.ebitda })),
  specialtyMetalsDemandByRegion: (['USA','EUR','UK','JPN'] as const).map(r => ({ region: r, demandLevelUSD: (state.regions[r].categoryDemand as any).specialty_metals?.demandLevelUSD })),
};
fs.writeFileSync('scripts/copper_calibration_dump_output.json', JSON.stringify(dump, null, 2));
console.log(JSON.stringify(dump, null, 2));
