/** §3.22 — a commodity's spot is a read of the goods auction; a weather loss is a loss of units. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldPrintOf, markCommodityToAuction, goodsUnitsPerCommodityUnitOf } from '../src/domain/commodity-spot';
import { weatherYieldLossShareOf, subUnitYieldLossShareOf } from '../src/engine/macro/weather';
import { COMMODITY_CATEGORY_LINKAGE, Commodity, Region, RegionId, WeatherAnomaly } from '../src/types';

const SUB = COMMODITY_CATEGORY_LINKAGE.CRUDE_OIL!.subUnitId;
const fx = (r: RegionId) => (r === 'EUR' ? 2 : 1);

function regionsWith(cd: Partial<Record<RegionId, { supplied: number; demanded: number; exWorks: number }>>): Record<RegionId, Region> {
  const out = {} as Record<RegionId, Region>;
  (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach((r) => {
    const c = cd[r];
    out[r] = { categoryDemand: c ? { [SUB]: { totalUnitsSuppliedThisWeek: c.supplied, totalUnitsDemandedThisWeek: c.demanded, exWorksUnitPriceLocal: c.exWorks } } : {} } as unknown as Region;
  });
  return out;
}

const comm = (over: Partial<Commodity> = {}): Commodity => ({
  id: 'CRUDE_OIL', name: 'Crude Oil', symbol: 'CRUDE_OIL', category: 'Energy', unit: '$/bbl',
  goodsUnitsPerUnit: 0.5, spotPrice: 40, historicalPrices: [39, 40], convenienceYield: 0.03,
  futures1M: 0, futures3M: 41, futures6M: 0, change1W: 1, volatility: 0.3,
  supplyDemandBalance: 'Balanced', inventoryLevelPct: 48, ...over,
});

test('the world print is every origin\'s gate price in the numéraire, weighted by what it supplied', () => {
  // USA: 100 units at $10; EUR: 300 units at 5 local = $10 each at fx 2. Weighted USD price $10.
  const print = worldPrintOf(SUB, regionsWith({ USA: { supplied: 100, demanded: 150, exWorks: 10 }, EUR: { supplied: 300, demanded: 100, exWorks: 5 } }), fx);
  assert.equal(print.suppliedUnits, 400);
  assert.equal(print.demandedUnits, 250);
  assert.ok(Math.abs((print.priceUsdPerUnit ?? 0) - 10) < 1e-9);
});

test('spot is the world print in the commodity\'s own unit; the quantities are the auction\'s, in its share', () => {
  const regions = regionsWith({ USA: { supplied: 100, demanded: 150, exWorks: 10 }, EUR: { supplied: 300, demanded: 100, exWorks: 5 } });
  const share = COMMODITY_CATEGORY_LINKAGE.CRUDE_OIL!.intensityShare;
  const marked = markCommodityToAuction(comm(), regions, fx);
  assert.equal(marked.spotPrice, 5);                       // $10 per sub-unit unit × 0.5 units per barrel
  assert.equal(marked.change1W, -35);
  assert.deepEqual(marked.historicalPrices, [39, 40, 5]);
  assert.ok(Math.abs(marked.weeklySupplyUnits! - (400 * share) / 0.5) < 1e-9);
  assert.ok(Math.abs(marked.weeklyDemandUnits! - (250 * share) / 0.5) < 1e-9);
  assert.equal(marked.supplyDemandBalance, 'Surplus (Oversupplied)');
  assert.equal(marked.futures3M, 41);                      // a cleared tenor is kept
  assert.equal(marked.futures1M, 5);                       // a tenor that never printed opens on spot
});

test('no origin supplied a unit: no print, the last one carries', () => {
  const marked = markCommodityToAuction(comm(), regionsWith({ USA: { supplied: 0, demanded: 150, exWorks: 10 } }), fx);
  assert.equal(marked.spotPrice, 40);
  assert.equal(marked.change1W, 0);
  assert.equal(marked.weeklySupplyUnits, 0);
  assert.equal(marked.supplyDemandBalance, 'Deficit (Tight Supply)');
});

test('the commodity\'s unit is fixed where the seed level meets the sub-unit\'s seed print, and the seed prints at its level', () => {
  const regions = regionsWith({ USA: { supplied: 100, demanded: 100, exWorks: 8 } });
  const g = goodsUnitsPerCommodityUnitOf(30.01, SUB, regions, fx);
  const seeded = markCommodityToAuction(comm({ goodsUnitsPerUnit: g, spotPrice: 30.01 }), regions, fx);
  assert.equal(seeded.spotPrice, 30.01);
  assert.equal(seeded.change1W, 0);
});

test('a weather event destroys its stated share of the commodity it names, decaying as it ages, at most all of it', () => {
  const drought = (weeksActive: number, yieldImpactPct = 0.4): WeatherAnomaly => ({
    region: 'USA', title: 't', type: 'Drought', severity: 'Severe', tempDeltaC: 3, economicImpact: '',
    affectedCommodityId: 'WHEAT', yieldImpactPct, weeksActive,
  });
  assert.equal(weatherYieldLossShareOf(drought(1), 'WHEAT'), 0.4);
  assert.ok(Math.abs(weatherYieldLossShareOf(drought(2), 'WHEAT') - 0.4 * 0.55) < 1e-12);
  assert.equal(weatherYieldLossShareOf(drought(1), 'CORN'), 0);
  assert.equal(weatherYieldLossShareOf(drought(1, 1.7), 'WHEAT'), 1);
  // The sub-unit loses wheat's value share of the loss, and nothing of a sub-unit wheat is no part of.
  const wheatSub = COMMODITY_CATEGORY_LINKAGE.WHEAT!;
  assert.ok(Math.abs(subUnitYieldLossShareOf(drought(1), wheatSub.subUnitId) - wheatSub.intensityShare * 0.4) < 1e-12);
  assert.equal(subUnitYieldLossShareOf(drought(1), SUB), 0);
});
