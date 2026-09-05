/**
 * §3.17e-ii-a — the registry of comparables: a read, an edge, a size, and two legs at the prices
 * that keep the edge.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bondBasisRead, bondBasisMirrorRead, bondBasisLegs, cdsBasisRead, cdsBasisLegs, indexArbRead, indexArbLegs, swapSpreadRead, swapSpreadLegs, mergeLegs, edgeBps, arbSizeShare, arbTargetShare, arbCapacityLocal, pairPnLLocal, stoppedOut } from '../src/domain/relative-value';
import { bondFuturesCarryPrice } from '../src/domain/derivatives/classes/bond-future';
import { asInstrumentId } from '../src/domain/ids';

test('bond basis: the read annualises the net basis on the cash price and charges financing above repo plus the margin', () => {
  const r = bondBasisRead({ netBasis: 0.005, cashPrice: 1, yearsToDelivery: 0.25, financingRateAnnual: 0.06, repoRateAnnual: 0.05, marginRate: 0.02, requiredReturnAnnual: 0.10 });
  assert.ok(Math.abs(r.deviationBps - 200) < 1e-9, 'half a point over a quarter is 200bp a year');
  assert.ok(Math.abs(r.carryBps - (100 + 20)) < 1e-9);
  assert.ok(Math.abs(edgeBps(r) - 80) < 1e-9);
  assert.equal(edgeBps(bondBasisRead({ netBasis: -0.005, cashPrice: 1, yearsToDelivery: 0.25, financingRateAnnual: 0.05, repoRateAnnual: 0.05, marginRate: 0, requiredReturnAnnual: 0.1 })), -200);
});

test('the book scales in over the relationship\'s weekly move and carries what its cash and its line allow', () => {
  assert.equal(arbSizeShare(0, 50), 0);
  assert.equal(arbSizeShare(-10, 50), 0);
  assert.equal(arbSizeShare(25, 50), 0.5);
  assert.equal(arbSizeShare(500, 50), 1);
  assert.equal(arbCapacityLocal(100, 300), 400);
  assert.equal(arbCapacityLocal(-5, undefined), 0);
});

test('bond basis legs: the cash leg buys up to where the future still pays the carry, the future leg sells down to carry plus it', () => {
  const carry = bondFuturesCarryPrice({ cashPrice: 0.98, couponRate: 0.04, repoRateAnnual: 0.05, yearsToDelivery: 0.25 });
  const legs = bondBasisLegs({ regionId: 'USA', bondId: asInstrumentId('B'), futureId: asInstrumentId('F'), faceLocal: 1000, cashPrice: 0.98, futurePrice: carry + 0.004, couponRate: 0.04, repoRateAnnual: 0.05, yearsToDelivery: 0.25, carryBps: 100, weeklyPriceMove: 0.006, budgetLocal: 900 });
  assert.equal(legs.cash.market, 'SOVEREIGN_CASH');
  assert.equal(legs.cash.faceLocal, 1000);
  assert.equal(legs.cash.budgetLocal, 900);
  assert.equal(legs.future.market, 'BOND_FUTURE');
  assert.equal(legs.future.faceLocal, -1000);
  const carryCost = (100 / 10000) * 0.25 * 0.98;
  assert.ok(Math.abs(legs.future.reservationPrice - (carry + carryCost)) < 1e-12);
  // At the cash leg's reservation the future exactly pays carry plus the cost: carrying that
  // price forward at repo less the coupon, plus the cost, is the future's print.
  const impliedFuture = bondFuturesCarryPrice({ cashPrice: legs.cash.reservationPrice, couponRate: 0.04, repoRateAnnual: 0.05, yearsToDelivery: 0.25 }) + carryCost;
  assert.ok(Math.abs(impliedFuture - (carry + 0.004)) < 1e-9);
  assert.ok(legs.cash.reservationPrice > 0.98, 'the future is rich, so it will pay above the cash print');
  assert.equal(legs.cash.fullSizePriceRange, 0.006);
});

// §3.17e-ii-b — the pair can lose, and it is cut when it has lost what it was margined for.
test('the pair\'s P&L is the cash mark over basis plus what the short has settled, and the stop is the margin posted', () => {
  assert.equal(pairPnLLocal({ cashValueLocal: 1010, cashBasisLocal: 1000, futuresSettledToFundLocal: -4 }), 6);
  assert.equal(stoppedOut(-50, 40), true, 'lost more than the margin: cut');
  assert.equal(stoppedOut(-30, 40), false);
  assert.equal(stoppedOut(-50, 0), false, 'nothing margined, nothing to measure the loss against');
  // A reduction states a negative cash face and a positive future face.
  const legs = bondBasisLegs({ regionId: 'USA', bondId: asInstrumentId('B'), futureId: asInstrumentId('F'), faceLocal: -400, cashPrice: 0.98, futurePrice: 0.99, couponRate: 0.04, repoRateAnnual: 0.05, yearsToDelivery: 0.25, carryBps: 100, weeklyPriceMove: 0.006, budgetLocal: 0 });
  assert.equal(legs.cash.faceLocal, -400);
  assert.equal(legs.future.faceLocal, 400);
});

// §3.17e-iii-a — the pair has two directions, each with its own carry, and the book takes the one
// whose edge is there.
test('the mirror read turns the disagreement and charges the borrow fee; the target is signed by which edge pays', () => {
  const m = bondBasisMirrorRead({ netBasis: -0.005, cashPrice: 1, yearsToDelivery: 0.25, borrowFeeBps: 30, marginRate: 0.02, requiredReturnAnnual: 0.10 });
  assert.ok(Math.abs(m.deviationBps - 200) < 1e-9, 'a cheap future is a rich mirror');
  assert.ok(Math.abs(m.carryBps - 50) < 1e-9);
  assert.equal(arbTargetShare(80, -300, 40), 1);
  assert.equal(arbTargetShare(20, -300, 40), 0.5);
  assert.equal(arbTargetShare(-300, 150, 40), -1);
  assert.equal(arbTargetShare(-300, 20, 40), -0.5);
  assert.equal(arbTargetShare(-10, -10, 40), 0);
});

// §3.17f-i — the second comparable: protection on a name against the name's own rung.
test('CDS basis: the read is the rung\'s spread less the protection\'s, and the legs buy the rung down to cover-plus-carry and cover up to the rung less carry', () => {
  const r = cdsBasisRead({ cashSpreadBps: 250, cdsSpreadBps: 180, financingRateAnnual: 0.06, repoRateAnnual: 0.05, marginRate: 0.03, requiredReturnAnnual: 0.10 });
  assert.equal(r.deviationBps, 70);
  assert.ok(Math.abs(r.carryBps - 130) < 1e-9);
  assert.ok(Math.abs(edgeBps(r) + 60) < 1e-9, 'the bond pays 70 more than the cover costs, and carrying the pair costs 130: no trade');
  const priceAtSpread = (bps: number) => 1 - bps / 10000;
  const legs = cdsBasisLegs({ regionId: 'USA', bondId: asInstrumentId('B'), cdsInstrumentId: asInstrumentId('USA-CDS-X-c5'), faceLocal: 500, cashSpreadBps: 250, cdsSpreadBps: 180, carryBps: 30, weeklyMoveBps: 12, priceAtSpread, budgetLocal: 400 });
  assert.equal(legs.cash.market, 'CORP_BOND_CASH');
  assert.ok(Math.abs(legs.cash.reservationPrice - priceAtSpread(210)) < 1e-12, 'buys the rung while it pays the cover plus the carry');
  assert.ok(Math.abs(legs.cash.fullSizePriceRange - 12 / 10000) < 1e-12);
  assert.equal(legs.protection.market, 'CDS_PROTECTION');
  assert.equal(legs.protection.faceLocal, -500, 'cover bought is the credit sold');
  assert.equal(legs.protection.reservationPrice, 220, 'buys cover while the rung pays it plus the carry');
});

// §3.17f-ii — the index against its names: both legs protection, both margined, both directions.
test('index arb: the read is the print against the names\' mean with the margin on both legs as carry; the legs split the names equally', () => {
  const r = indexArbRead({ indexPrintBps: 130, namesMeanBps: 100, indexMarginRate: 0.02, namesMarginRate: 0.03, requiredReturnAnnual: 0.10 });
  assert.equal(r.long.deviationBps, 30);
  assert.ok(Math.abs(r.long.carryBps - 50) < 1e-9);
  assert.equal(r.mirror.deviationBps, -30);
  const names = [{ instrumentId: asInstrumentId('USA-CDS-A-c5'), printBps: 90 }, { instrumentId: asInstrumentId('USA-CDS-B-c5'), printBps: 110 }];
  const rich = indexArbLegs({ regionId: 'USA', indexInstrumentId: asInstrumentId('USA-CDX-1'), names, faceLocal: 1000, indexPrintBps: 160, namesMeanBps: 100, carryBps: 20, weeklyMoveBps: 8 });
  assert.equal(rich.index.faceLocal, 1000, 'a rich index is written');
  assert.equal(rich.index.reservationPrice, 120, 'down to the names plus the carry');
  assert.deepEqual(rich.names.map((l) => [l.faceLocal, l.reservationPrice]), [[-500, 130], [-500, 150]], 'each name bought up to its print plus the spare 40');
  const cheap = indexArbLegs({ regionId: 'USA', indexInstrumentId: asInstrumentId('USA-CDX-1'), names, faceLocal: -1000, indexPrintBps: 60, namesMeanBps: 100, carryBps: 20, weeklyMoveBps: 8 });
  assert.equal(cheap.index.reservationPrice, 80, 'a cheap index is bought up to the names less the carry');
  assert.deepEqual(cheap.names.map((l) => [l.faceLocal, l.reservationPrice]), [[500, 70], [500, 90]], 'each name written down to its print less the spare');
});

// §3.17f-iii — the swap spread: received against the rung shorted, paid against the rung bought.
test('swap spread: the read carries the borrow when received and the financing when paid; the legs are the swap and the rung with opposite faces', () => {
  const r = swapSpreadRead({ swapSpreadBps: 25, borrowFeeBps: 10, financingRateAnnual: 0.06, repoRateAnnual: 0.05, marginRate: 0.02, requiredReturnAnnual: 0.10 });
  assert.equal(r.long.deviationBps, 25);
  assert.ok(Math.abs(r.long.carryBps - 30) < 1e-9);
  assert.equal(r.mirror.deviationBps, -25);
  assert.ok(Math.abs(r.mirror.carryBps - 120) < 1e-9);
  const priceAtYieldBps = (y: number) => 1 - (y - 400) / 10000;
  const recv = swapSpreadLegs({ regionId: 'USA', swapInstrumentId: asInstrumentId('USA-IRS-s10'), bondId: asInstrumentId('G10'), faceLocal: 1000, govYieldBps: 400, parBps: 425, carryBps: 30, weeklyMoveBps: 12, priceAtYieldBps, cashPrice: 1, budgetLocal: 0 });
  assert.equal(recv.swap.market, 'IRS_FIXED');
  assert.equal(recv.swap.faceLocal, 1000, 'received');
  assert.equal(recv.swap.reservationPrice, 430, 'down to the yield plus the carry');
  assert.equal(recv.bond.market, 'SOVEREIGN_CASH');
  assert.equal(recv.bond.faceLocal, -1000, 'the rung shorted');
  const pay = swapSpreadLegs({ regionId: 'USA', swapInstrumentId: asInstrumentId('USA-IRS-s10'), bondId: asInstrumentId('G10'), faceLocal: -1000, govYieldBps: 400, parBps: 370, carryBps: 30, weeklyMoveBps: 12, priceAtYieldBps, cashPrice: 1, budgetLocal: 900 });
  assert.equal(pay.swap.reservationPrice, 370, 'paid up to the yield less the carry');
  assert.equal(pay.bond.faceLocal, 1000, 'the rung bought');
  assert.ok(Math.abs(pay.bond.reservationPrice - priceAtYieldBps(340)) < 1e-12, 'up to the price the par less the carry implies');
  // Two legs of one book on one rung are one leg.
  const merged = mergeLegs([{ ...recv.bond, entityId: 'F' }, { ...pay.bond, entityId: 'F', faceLocal: 400 }, { ...recv.swap, entityId: 'F' }]);
  assert.deepEqual(merged.map((l) => [l.market, l.faceLocal]), [['SOVEREIGN_CASH', -600], ['IRS_FIXED', 1000]]);
});
