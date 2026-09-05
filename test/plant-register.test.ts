/**
 * §3.13-BOOK g-ii — THE PLANT ROWS: a firm's plant is rows on its own register book, a row per
 * capital good and life in units of cost, its lots the vintages at the week each entered service.
 * `writePlantRows` relinks the rows to a vintage list and `plantVintagesOf` reads them back: after
 * every writer `domain/plant.ts` has, the two agree exactly, and nothing else on the book moves.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureV2 } from '../src/engine2/world';
import { bookRowsOf, rowLotsOf, rowLotUnits, rowUnits, openKindRow } from '../src/engine2/holdings';
import { writePlantRows, plantVintagesOf, plantInstrumentId } from '../src/engine/ledger/plant-ledger';
import { seedPlantVintages, commissionVintage, scrapPlantShare, slicePlant, mergePlant, retireWornPlant, plantGrossLocal, type PlantVintage } from '../src/domain/plant';
import { asEntityId } from '../src/domain/ids';

const a = asEntityId('CO-A'), b = asEntityId('CO-B');
const canonical = (v: readonly PlantVintage[]) => mergePlant(v, []);

test('the rows are the vintages: every writer of a plant round-trips through the register exactly', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  // Something else on the same book, which must survive every rewrite of the plant rows.
  const goodRow = openKindRow(v2, a, 'GOOD', 'steel', 'USA');
  let plant = seedPlantVintages(1_000_000, 100, [{ kind: 'heavy_equipment', weight: 0.7, usefulLifeYears: 10 }, { kind: 'premises', weight: 0.3, usefulLifeYears: 25 }]);
  const check = (label: string) => {
    writePlantRows(v2, a, 'USA', plant);
    assert.deepEqual(plantVintagesOf(v2, a), canonical(plant), label);
    for (const r of bookRowsOf(v2, a)) if (r !== goodRow) assert.equal(rowLotUnits(v2, r), rowUnits(v2.holdings, r), `${label}: a row is its lots' sum`);
    assert.ok(bookRowsOf(v2, a).includes(goodRow), `${label}: the good's row is untouched`);
  };
  check('the seed: one vintage a year per kind, each at its own life');
  assert.equal(bookRowsOf(v2, a).length, 3, 'the good, and one row per (kind, life)');
  plant = commissionVintage(plant, 50_000, 104, 10, 'heavy_equipment');
  plant = commissionVintage(plant, 20_000, 104, 10, 'heavy_equipment');
  check('two commissionings in one week fold into one lot');
  const eq = bookRowsOf(v2, a).find((r) => rowLotsOf(v2, r).some((l) => l.week === 104))!;
  assert.deepEqual(rowLotsOf(v2, eq).filter((l) => l.week === 104), [{ units: 70_000, priceLocal: 1, week: 104 }], 'a vintage is a lot at cost, price 1, at its service week');
  plant = scrapPlantShare(plant, 0.1, 110).plant;
  check('a scrap takes the oldest first');
  const split = slicePlant(plant, 0.25);
  plant = split.kept;
  check('a spin-off slices every vintage');
  writePlantRows(v2, b, 'USA', split.taken);
  assert.deepEqual(plantVintagesOf(v2, b), canonical(split.taken), 'the taken quarter is the other firm\'s rows, service weeks kept');
  plant = mergePlant(plant, plantVintagesOf(v2, b));
  writePlantRows(v2, b, 'USA', []);
  check('a merger concatenates');
  assert.deepEqual(bookRowsOf(v2, b), [], 'the target\'s plant rows are gone');
  const worn = retireWornPlant(plant, 100 + 10 * 52 + 1);
  plant = worn.plant;
  check('fully worn vintages leave');
  assert.ok(worn.retiredCostLocal > 0);
  assert.equal(plantGrossLocal(plantVintagesOf(v2, a), 700), plantGrossLocal(plant, 700));
  assert.equal(plantInstrumentId('premises', 25), 'PLANT:premises:25');
});
