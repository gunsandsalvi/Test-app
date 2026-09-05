/**
 * §3.26-f-iii — THE PLANT WIRE, and W6. A move of plant between two parties is a numbered wire in
 * units of cost; what is not a move is a transformation on the same journal; the identity per firm
 * closes on the two, or W6 names the firm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureV2 } from '../src/engine2/world';
import { setActiveWireWorld, setActiveWireJournal, newWireJournal, summarizeWires } from '../src/engine/ledger/wire';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { movePlant, movePlantQueue, commissionPlant, retirePlant, scrapPlant, arrivePlant, bornPlant } from '../src/engine/ledger/plant-ledger';
import { plantIdentityGaps } from '../src/engine/audit/wires';
import { companyPartyOf } from '../src/domain/party';
import { asEntityId } from '../src/domain/ids';

const a = asEntityId('CO-A'), b = asEntityId('CO-B');

test('the summary nets plant wires per firm in cost and carries the flows; W6 closes on them', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const j = newWireJournal(1, 7);
  setActiveWireJournal(j);
  setActiveWireWorld(wireWorldOf(v2, [{ id: a }, { id: b }], []));
  try {
    movePlant(companyPartyOf(a), companyPartyOf(b), [{ costLocal: 400, enteredServiceWeek: 1, usefulLifeYears: 10 }], 200, 'sold');
    movePlantQueue(companyPartyOf(b), companyPartyOf(a), [{ valueLocal: 50 }], 'queue');
    commissionPlant(a, 120); retirePlant(a, 20); scrapPlant(a, 5); arrivePlant(a, 130); bornPlant(b, 9);
  } finally {
    setActiveWireWorld(undefined);
    setActiveWireJournal(undefined);
  }
  const w = summarizeWires(j);
  assert.equal(w.byKind.PLANT, 2);
  assert.deepEqual(w.plantNetCostByCompany, { [a]: -400, [b]: 400 });
  assert.deepEqual(w.queueNetCostByCompany, { [b]: -50, [a]: 50 });
  assert.equal(w.plantFlowByCompany[a].commissionedLocal, 120);
  assert.equal(w.plantFlowByCompany[b].bornLocal, 9);
  // A: plant 1000 → 1000 − 400 + 120 − 20 − 5 = 695; queue 200 → 200 + 130 − 120 + 50 = 260. B: plant 0 → 409; queue 80 → 30.
  const clean = plantIdentityGaps({ [a]: 1000 }, { [a]: 200, [b]: 80 }, { [a]: 695, [b]: 409 }, { [a]: 260, [b]: 30 },
    w.plantFlowByCompany, w.plantNetCostByCompany, w.queueNetCostByCompany);
  assert.deepEqual(clean, [], 'every change is a wire or a recorded transformation');
  // Plant that appeared on B with nothing saying so, and a queue on A that did not grow by what landed.
  const off = plantIdentityGaps({ [a]: 1000 }, { [a]: 200, [b]: 80 }, { [a]: 695, [b]: 500 }, { [a]: 200, [b]: 30 },
    w.plantFlowByCompany, w.plantNetCostByCompany, w.queueNetCostByCompany);
  assert.deepEqual(off.map((g) => [g.companyId, g.side, g.gapLocal]), [[b, 'plant', 91], [a, 'queue', -60]]);
});
