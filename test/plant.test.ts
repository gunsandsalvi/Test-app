/**
 * §3.26-f-ii — PLANT IS DATED VINTAGES, and the sheet reads them. The two scalars the register
 * replaces were kept in step by six writers by hand; these assertions are the identities that
 * hold by construction on the register and could not be stated on the scalars.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seedPlantVintages, plantGrossLocal, plantNetLocal, plantAccumulatedDepreciationLocal,
  plantDepreciationAnnualLocal, plantEffectiveNetLocal, commissionVintage, retireWornPlant, scrapPlantShare, slicePlant,
  mergePlant, wornShareOf, type PlantVintage,
} from '../src/domain/plant';

const near = (a: number, b: number, msg = '', tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}${msg ? ` — ${msg}` : ''}`);

test('the seed is a derivation: a stationary plant is half worn and its charge is gross over life', () => {
  const plant = seedPlantVintages(1_200, 100, [{ kind: 'heavy_equipment', weight: 1, usefulLifeYears: 12 }]);
  assert.equal(plant.length, 12, 'one vintage a year');
  near(plantGrossLocal(plant, 100), 1_200);
  near(plantNetLocal(plant, 100), 600, 'half worn — the 45% and 35% the seed stated were this shape asserted');
  near(plantAccumulatedDepreciationLocal(plant, 100), 600);
  near(plantDepreciationAnnualLocal(plant, 100), 100, 'gross / life');
  assert.ok(plant[0].enteredServiceWeek < plant[plant.length - 1].enteredServiceWeek, 'oldest first');
});

test('gross = net + accumulated, at every week, by construction', () => {
  const plant = seedPlantVintages(2_400, 50, [{ kind: 'heavy_equipment', weight: 3, usefulLifeYears: 7 }, { kind: 'enterprise_software', weight: 1, usefulLifeYears: 5 }]);
  for (const w of [50, 51, 120, 400, 900]) {
    near(plantGrossLocal(plant, w), plantNetLocal(plant, w) + plantAccumulatedDepreciationLocal(plant, w));
  }
});

test('a vintage wears straight-line from its own service week and leaves the register when fully worn', () => {
  const v: PlantVintage = { costLocal: 520, enteredServiceWeek: 10, usefulLifeYears: 1, kind: 'heavy_equipment' };
  assert.equal(wornShareOf(v, 10), 0);
  near(wornShareOf(v, 36), 0.5);
  assert.equal(wornShareOf(v, 62), 1);
  near(plantNetLocal([v], 36), 260);
  near(plantDepreciationAnnualLocal([v], 36), 520, 'the charge runs while it lives');
  assert.equal(plantGrossLocal([v], 62), 0, 'fully worn: out of gross before the writer runs');
  assert.equal(plantDepreciationAnnualLocal([v], 62), 0, 'and the charge stops — the scalar kept charging worn plant for ever');
  const retired = retireWornPlant([v], 62);
  assert.equal(retired.plant.length, 0);
  assert.equal(retired.retiredCostLocal, 520);
});

test('commissioning appends this week\'s vintage at the firm\'s own life, and a same-week lot folds in', () => {
  const plant = commissionVintage([], 100, 20, 10, 'heavy_equipment');
  const again = commissionVintage(plant, 50, 20, 10, 'heavy_equipment');
  assert.equal(again.length, 1, 'one vintage per commissioning week and kind');
  assert.equal(again[0].costLocal, 150);
  assert.equal(again[0].enteredServiceWeek, 20);
  const other = commissionVintage(again, 40, 20, 10, 'enterprise_software');
  assert.equal(other.length, 2, '§3.26-f-iv-a: a different kind the same week is its own vintage');
  const later = commissionVintage(other, 30, 25, 10, 'heavy_equipment');
  assert.equal(later.length, 3);
  assert.deepEqual(plant, [{ costLocal: 100, enteredServiceWeek: 20, usefulLifeYears: 10, kind: 'heavy_equipment' }], 'never mutated in place');
});

test('a scrap retires the OLDEST vintages first, exactly the share of gross', () => {
  const plant = seedPlantVintages(1_200, 100, [{ kind: 'heavy_equipment', weight: 1, usefulLifeYears: 12 }]); // twelve vintages of 100
  const { plant: left, scrappedCostLocal, scrappedNetLocal } = scrapPlantShare(plant, 0.25, 100);
  near(scrappedCostLocal, 300);
  near(plantGrossLocal(left, 100), 900);
  assert.ok(left[0].enteredServiceWeek > plant[0].enteredServiceWeek, 'the oldest went');
  assert.ok(scrappedNetLocal < 300 * 0.5, 'the oldest is the most worn: little net is written off');
});

test('a slice moves a fraction of every vintage and conserves cost and age; a merge folds registers in age order', () => {
  const a = seedPlantVintages(600, 100, [{ kind: 'commercial_fleet', weight: 1, usefulLifeYears: 3 }]);
  const { taken, kept } = slicePlant(a, 0.3);
  near(plantGrossLocal(taken, 100), 180);
  near(plantGrossLocal(kept, 100), 420);
  near(plantNetLocal(taken, 100) + plantNetLocal(kept, 100), plantNetLocal(a, 100));
  assert.deepEqual(taken.map((v) => v.enteredServiceWeek), a.map((v) => v.enteredServiceWeek), 'the machines keep their age');
  const b = commissionVintage([], 50, 90, 3, 'commercial_fleet');
  const merged = mergePlant(kept, b);
  near(plantGrossLocal(merged, 100), 470);
  for (let i = 1; i < merged.length; i++) assert.ok(merged[i].enteredServiceWeek >= merged[i - 1].enteredServiceWeek, 'oldest first');
});

test('§3.26-f-iv-a: the seed is built in a mix of kinds, and a slice or a merge keeps every kind', () => {
  const plant = seedPlantVintages(1_000, 100, [{ kind: 'heavy_equipment', weight: 3, usefulLifeYears: 5 }, { kind: 'enterprise_software', weight: 1, usefulLifeYears: 2 }]);
  assert.equal(plant.length, 7, 'yearly vintages per kind, each over its OWN life (§3.26-f-iv-b)');
  const byKind = (p: PlantVintage[]) => p.reduce((m, v) => { m[v.kind] = (m[v.kind] ?? 0) + v.costLocal; return m; }, {} as Record<string, number>);
  near(byKind(plant).heavy_equipment, 750);
  near(byKind(plant).enterprise_software, 250);
  const { taken } = slicePlant(plant, 0.2);
  near(byKind(taken).heavy_equipment, 150, 'a slice takes every kind pro rata');
  const merged = mergePlant(plant, taken);
  assert.equal(merged.length, 7, 'same week, life and kind fold; a kind never folds into another');
  near(byKind(merged).enterprise_software, 300);
});

test('§3.26-f-iv-b: each kind is half worn over its own life, so the charge is Σ cost/life per kind', () => {
  const plant = seedPlantVintages(1_000, 100, [{ kind: 'commercial_construction', weight: 1, usefulLifeYears: 40 }, { kind: 'enterprise_software', weight: 1, usefulLifeYears: 5 }]);
  near(plantNetLocal(plant, 100), 500, 'half worn whatever the lives');
  near(plantDepreciationAnnualLocal(plant, 100), 500 / 40 + 500 / 5, 'the building wears slowly, the software fast');
});

test('§3.26-f-iv-c: the plant that serves a use is its scarcest kind — a register built in the mix is worth its whole net', () => {
  const mix = { heavy_equipment: 0.75, enterprise_software: 0.25 };
  const inMix = seedPlantVintages(1_000, 100, [{ kind: 'heavy_equipment', weight: 3, usefulLifeYears: 10 }, { kind: 'enterprise_software', weight: 1, usefulLifeYears: 10 }]);
  near(plantEffectiveNetLocal(inMix, mix, 100), plantNetLocal(inMix, 100), 'in proportion: the whole net produces');
  // Buildings for a use that needs machines: nothing.
  const wrong = commissionVintage([], 1_000, 100, 40, 'commercial_construction');
  assert.equal(plantEffectiveNetLocal(wrong, mix, 100), 0, 'a kind the use does not need produces nothing for it');
  // More software than the mix can use adds nothing; the scarce kind binds.
  const lopsided = mergePlant(inMix, commissionVintage([], 1_000, 100, 10, 'enterprise_software'));
  near(plantEffectiveNetLocal(lopsided, mix, 100), plantNetLocal(inMix, 100), 'the excess kind is idle');
  // Heavy equipment merged into a firm that has none of the software it needs: the equipment binds on the software.
  const half = { heavy_equipment: 0.5, enterprise_software: 0.5 };
  near(plantEffectiveNetLocal(inMix, half, 100), plantNetLocal(inMix, 100) * 0.25 / 0.5, 'a use needing half software gets twice the software it has');
  assert.equal(plantEffectiveNetLocal(inMix, {}, 100), plantNetLocal(inMix, 100), 'a use naming no capital reads the whole net');
});
