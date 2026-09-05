/**
 * §3.17e-ii-a — the registry of comparables: a read, an edge, a size, and two legs at the prices
 * that keep the edge.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bondBasisRead, bondBasisLegs, edgeBps, arbSizeShare, arbCapacityLocal, pairPnLLocal, stoppedOut } from '../src/domain/relative-value';
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
