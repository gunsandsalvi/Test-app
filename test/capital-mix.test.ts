/**
 * §3.26-f-iv-b — what an industry's plant is made of is the industry's own, and a capital good has
 * a life. The one basket every buyer shared is gone; these pin the accessor that replaced it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  capitalMixOf, sectorCapitalMix, registryCapitalMix, capitalMixOfFirms, usefulLifeYearsOfGood,
  isCapitalGood, purchaseKindOf, VIEW_CAPITAL_GOOD_IDS, INDUSTRY_REGISTRY,
} from '../src/domain/industry-registry';

const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

test('a capital good is a good with a life, and every industry\'s mix is over those goods only', () => {
  assert.deepEqual([...VIEW_CAPITAL_GOOD_IDS].sort(), ['commercial_construction', 'commercial_fleet', 'enterprise_software', 'heavy_equipment', 'industrial_automation']);
  VIEW_CAPITAL_GOOD_IDS.forEach((id) => { assert.ok(isCapitalGood(id)); assert.ok(usefulLifeYearsOfGood(id) > 0); });
  assert.ok(!isCapitalGood('food_beverage'));
  assert.equal(usefulLifeYearsOfGood('commercial_construction'), 40, 'a building outlives a server');
  assert.equal(usefulLifeYearsOfGood('enterprise_software'), 5);
  assert.throws(() => usefulLifeYearsOfGood('food_beverage'), /no capital good/);
  Object.values(INDUSTRY_REGISTRY).forEach((spec) => {
    Object.keys(spec.capitalMix).forEach((good) => assert.ok(VIEW_CAPITAL_GOOD_IDS.includes(good), `${good} is a capital good`));
  });
});

test('a firm\'s mix is its lines\' industries\' by revenue share, normalised; a profile firm has its own', () => {
  const refinery = capitalMixOf([{ subUnitId: 'upstream_extraction', revenueShare: 1 }], 'OPERATING');
  const software = capitalMixOf([{ subUnitId: 'enterprise_software', revenueShare: 1 }], 'OPERATING');
  assert.ok(Math.abs(sum(refinery) - 1) < 1e-12 && Math.abs(sum(software) - 1) < 1e-12);
  assert.ok(refinery.heavy_equipment > software.heavy_equipment, 'a refinery is heavy equipment');
  assert.ok(software.enterprise_software > refinery.enterprise_software, 'a software firm is software');
  const half = capitalMixOf([{ subUnitId: 'upstream_extraction', revenueShare: 0.5 }, { subUnitId: 'enterprise_software', revenueShare: 0.5 }], 'OPERATING');
  assert.ok(Math.abs(half.heavy_equipment - (refinery.heavy_equipment + software.heavy_equipment) / 2) < 1e-12, 'weighted by revenue share');
  const bank = capitalMixOf([], 'BANK');
  assert.ok(bank.commercial_construction > 0 && bank.enterprise_software > 0 && bank.heavy_equipment === undefined, 'premises and systems');
  assert.ok(Math.abs(sum(sectorCapitalMix('Tech')) - 1) < 1e-12);
  assert.ok(Math.abs(sum(registryCapitalMix()) - 1) < 1e-12);
});

test('a set of firms\' investment is split the way their own capex is', () => {
  const firms = [
    { capex: 300, productLines: [{ subUnitId: 'upstream_extraction', revenueShare: 1 }], profileKey: 'OPERATING' },
    { capex: 100, productLines: [{ subUnitId: 'enterprise_software', revenueShare: 1 }], profileKey: 'OPERATING' },
  ];
  const mix = capitalMixOfFirms(firms);
  const expected = 0.75 * capitalMixOf(firms[0].productLines, 'OPERATING').heavy_equipment + 0.25 * capitalMixOf(firms[1].productLines, 'OPERATING').heavy_equipment;
  assert.ok(Math.abs(mix.heavy_equipment - expected) < 1e-12);
  assert.deepEqual(capitalMixOfFirms([]), registryCapitalMix(), 'no buyer yet: the registry\'s average');
});

test('§3.26-f-iv-b: what a purchase IS is the buyer\'s question, not the good\'s', () => {
  // heavy_equipment is in some recipes; to a firm whose recipe does not consume it, it is plant.
  const consumer = Object.values(INDUSTRY_REGISTRY).flatMap((s) => s.subUnits).find((su) => (su.recipeInputs ?? {}).heavy_equipment !== undefined);
  assert.ok(consumer, 'some recipe consumes heavy equipment');
  assert.equal(purchaseKindOf('heavy_equipment', [{ subUnitId: consumer!.unitId, revenueShare: 1 }], 'OPERATING'), 'RECIPE_INPUT');
  assert.equal(purchaseKindOf('heavy_equipment', [{ subUnitId: 'enterprise_software', revenueShare: 1 }], 'OPERATING'), 'CAPITAL_GOOD', 'a software firm\'s heavy equipment is plant, not a lot it never draws');
  assert.equal(purchaseKindOf('food_beverage', [{ subUnitId: 'enterprise_software', revenueShare: 1 }], 'OPERATING'), 'OPERATING');
  assert.equal(purchaseKindOf('commercial_construction', [], 'BANK'), 'CAPITAL_GOOD', 'a bank\'s premises are plant');
});
