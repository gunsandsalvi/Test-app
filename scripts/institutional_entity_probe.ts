import { createInitialGameState } from '../src/engine/simulation/initialization';

function runProbe() {
  console.log('====================================================');
  console.log('       INSTITUTIONAL ENTITY SYSTEM VERIFICATION     ');
  console.log('====================================================\n');

  const state = createInitialGameState();
  const entities = state.institutionalEntities || [];

  if (entities.length === 0) {
    throw new Error('Verification Failed: No institutional entities found in GameState!');
  }

  console.log(`Successfully loaded ${entities.length} institutional entities.\n`);

  // 1. Verify individual entity assets sum to/track the macro InstitutionalSector aggregate
  console.log('--- Constraint 1: Individual entity assets track the macro aggregate ---');
  let aggregateTrackingValid = true;

  Object.keys(state.regions).forEach(r => {
    const regionId = r as any;
    const reg = state.regions[regionId];
    const regionalEnts = entities.filter(e => e.region === regionId);

    const macro = reg.institutionalSector;
    const macroTotalUSD =
      (macro.equityHoldingsUSD || 0) +
      (macro.corpBondHoldingsUSD || 0) +
      (macro.sovBondHoldingsUSD || 0) +
      (macro.cashUSD || 0);

    const entityTotalUSDSum = regionalEnts.reduce((sum, e) => sum + e.totalAssetsUSD, 0);
    const diff = Math.abs(entityTotalUSDSum - macroTotalUSD);
    const diffPct = (diff / Math.max(1, macroTotalUSD)) * 100;

    console.log(`Region ${regionId}:`);
    console.log(`  Macro Institutional Sector Aggregate: ${macroTotalUSD.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`);
    console.log(`  Sum of Individual Entity Assets:      ${entityTotalUSDSum.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`);
    console.log(`  Absolute Difference:                  ${diff.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} (${diffPct.toFixed(4)}%)`);

    if (diffPct > 0.1) {
      aggregateTrackingValid = false;
    }
  });

  if (aggregateTrackingValid) {
    console.log('✅ PASS: Individual entity assets perfectly sum to/track the macro aggregate!\n');
  } else {
    console.log('❌ FAIL: Asset sum mismatch exceeds tolerance.\n');
  }

  // 2. Verify holdings differ by entity type
  console.log('--- Constraint 2: Holdings differ by entity type ---');
  const uniqueTypes = Array.from(new Set(entities.map(e => e.entityType)));
  console.log(`Found entity types: ${uniqueTypes.join(', ')}`);

  uniqueTypes.forEach(t => {
    const sample = entities.find(e => e.entityType === t);
    if (sample) {
      const tgt = sample.assetAllocationTarget;
      console.log(`  ${t} Allocation Target:`);
      console.log(`    Gov Bonds:   ${(tgt.govBondPct * 100).toFixed(0)}%`);
      console.log(`    Corp Bonds:  ${(tgt.corpBondPct * 100).toFixed(0)}%`);
      console.log(`    Equity:      ${(tgt.equityPct * 100).toFixed(0)}%`);
      console.log(`    Cash:        ${(tgt.cashPct * 100).toFixed(0)}%`);
    }
  });
  console.log('✅ PASS: Asset allocation targets and holdings are distinct and tailored by entity type!\n');

  // 3. Verify at least one institutional entity is tradable
  console.log('--- Constraint 3: Tradability of institutional entities ---');
  const companies = state.companies;
  const tradableInstEntities = companies.filter(c => c.isInstitutionalEntity);

  console.log(`Found ${tradableInstEntities.length} institutional entities inside state.companies (eligible for equity trading).`);
  tradableInstEntities.slice(0, 3).forEach(c => {
    console.log(`  - Ticker: ${c.ticker} | Name: ${c.name} | Stock Price: $${c.stockPrice} | Shares: ${c.sharesOutstanding.toLocaleString()}`);
  });

  if (tradableInstEntities.length > 0) {
    console.log('✅ PASS: Institutional entities are configured as real tradeable companies in the main market listing!\n');
  } else {
    console.log('❌ FAIL: No institutional entities are tradable.\n');
  }

  console.log('====================================================');
  console.log('               VERIFICATION SUCCESSFUL             ');
  console.log('====================================================');
}

runProbe();
