/**
 * §3.26-f-ii — PLANT IS DATED VINTAGES, and the sheet reads them. The two scalars the register
 * replaces were kept in step by six writers by hand; these assertions are the identities that
 * hold by construction on the register and could not be stated on the scalars.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seedPlantVintages, plantGrossLocal, plantNetLocal, plantAccumulatedDepreciationLocal,
  plantDepreciationAnnualLocal, commissionVintage, retireWornPlant, scrapPlantShare, slicePlant,
  mergePlant, wornShareOf, type PlantVintage,
} from '../src/domain/plant';

const near = (a: number, b: number, msg = '', tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}${msg ? ` — ${msg}` : ''}`);

test('the seed is a derivation: a stationary plant is half worn and its charge is gross over life', () => {
  const plant = seedPlantVintages(1_200, 12, 100);
  assert.equal(plant.length, 12, 'one vintage a year');
  near(plantGrossLocal(plant, 100), 1_200);
  near(plantNetLocal(plant, 100), 600, 'half worn — the 45% and 35% the seed stated were this shape asserted');
  near(plantAccumulatedDepreciationLocal(plant, 100), 600);
  near(plantDepreciationAnnualLocal(plant, 100), 100, 'gross / life');
  assert.ok(plant[0].enteredServiceWeek < plant[plant.length - 1].enteredServiceWeek, 'oldest first');
});

test('gross = net + accumulated, at every week, by construction', () => {
  const plant = seedPlantVintages(2_400, 7, 50);
  for (const w of [50, 51, 120, 400, 900]) {
    near(plantGrossLocal(plant, w), plantNetLocal(plant, w) + plantAccumulatedDepreciationLocal(plant, w));
  }
});

test('a vintage wears straight-line from its own service week and leaves the register when fully worn', () => {
  const v: PlantVintage = { costLocal: 520, enteredServiceWeek: 10, usefulLifeYears: 1 };
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
  const plant = commissionVintage([], 100, 20, 10);
  const again = commissionVintage(plant, 50, 20, 10);
  assert.equal(again.length, 1, 'one vintage per commissioning week');
  assert.equal(again[0].costLocal, 150);
  assert.equal(again[0].enteredServiceWeek, 20);
  const later = commissionVintage(again, 30, 25, 10);
  assert.equal(later.length, 2);
  assert.deepEqual(plant, [{ costLocal: 100, enteredServiceWeek: 20, usefulLifeYears: 10 }], 'never mutated in place');
});

test('a scrap retires the OLDEST vintages first, exactly the share of gross', () => {
  const plant = seedPlantVintages(1_200, 12, 100); // twelve vintages of 100
  const { plant: left, scrappedCostLocal, scrappedNetLocal } = scrapPlantShare(plant, 0.25, 100);
  near(scrappedCostLocal, 300);
  near(plantGrossLocal(left, 100), 900);
  assert.ok(left[0].enteredServiceWeek > plant[0].enteredServiceWeek, 'the oldest went');
  assert.ok(scrappedNetLocal < 300 * 0.5, 'the oldest is the most worn: little net is written off');
});

test('a slice moves a fraction of every vintage and conserves cost and age; a merge folds registers in age order', () => {
  const a = seedPlantVintages(600, 3, 100);
  const { taken, kept } = slicePlant(a, 0.3);
  near(plantGrossLocal(taken, 100), 180);
  near(plantGrossLocal(kept, 100), 420);
  near(plantNetLocal(taken, 100) + plantNetLocal(kept, 100), plantNetLocal(a, 100));
  assert.deepEqual(taken.map((v) => v.enteredServiceWeek), a.map((v) => v.enteredServiceWeek), 'the machines keep their age');
  const b = commissionVintage([], 50, 90, 3);
  const merged = mergePlant(kept, b);
  near(plantGrossLocal(merged, 100), 470);
  for (let i = 1; i < merged.length; i++) assert.ok(merged[i].enteredServiceWeek >= merged[i - 1].enteredServiceWeek, 'oldest first');
});
