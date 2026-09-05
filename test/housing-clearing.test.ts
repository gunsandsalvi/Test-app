/**
 * §3.26b-ii — THE HOUSE PRICE IS A BOOK: named sides in units, a uniform-price cross, sellers'
 * reservations, and a week in which nothing clears has no print.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearDwellings, dwellingOffersOf, sellerPayoffLadderOf } from '../src/domain/housing-clearing';

test('the price is the last buyer\'s bid that met a reservation, and the units are what changed hands', () => {
  const offers = [{ units: 10, reservationLocal: 300 }, { units: 10, reservationLocal: 350 }];
  const bids = [{ units: 6, maxPriceLocal: 500 }, { units: 6, maxPriceLocal: 400 }, { units: 6, maxPriceLocal: 320 }];
  const book = clearDwellings(offers, bids);
  assert.equal(book.unitsOffered, 20);
  assert.equal(book.unitsBid, 18);
  // 500 takes 6 of the 300s; 400 takes 4 of the 300s and 2 of the 350s; 320 cannot meet 350.
  assert.equal(book.unitsCleared, 12);
  assert.equal(book.priceLocal, 400, 'the marginal buyer that cleared sets the price');
});

test('volumes collapse before prices: an offer no bid reaches does not clear, and nothing cleared is no print', () => {
  const bids = [{ units: 5, maxPriceLocal: 420 }, { units: 5, maxPriceLocal: 380 }];
  const easy = clearDwellings([{ units: 10, reservationLocal: 300 }], bids);
  assert.equal(easy.unitsCleared, 10);
  assert.equal(easy.priceLocal, 380);
  const stubborn = clearDwellings([{ units: 10, reservationLocal: 400 }], bids);
  assert.equal(stubborn.unitsCleared, 5, 'only the buyer above the reservation completes');
  assert.equal(stubborn.priceLocal, 420, 'and the price is HIS, not a lower bid that cleared nothing');
  const refused = clearDwellings([{ units: 10, reservationLocal: 450 }], bids);
  assert.equal(refused.unitsCleared, 0);
  assert.equal(refused.priceLocal, undefined, 'no transaction, no print: the caller keeps last week\'s');
});

test('the owners\' reservations are their payoffs off the vintage cross-section, floored at the build cost', () => {
  const ladder = sellerPayoffLadderOf([
    { principalLocal: 800, originationCollateralLocal: 2_000, originationHomePriceLocal: 400 }, // 5 dwellings, 160 each left
    { principalLocal: 1_900, originationCollateralLocal: 2_000, originationHomePriceLocal: 400 }, // 5 dwellings, 380 each — underwater at 350
    { principalLocal: 0, originationCollateralLocal: 400, originationHomePriceLocal: 400 }, // repaid: no rung
  ]);
  assert.deepEqual(ladder, [{ units: 5, payoffLocal: 160 }, { units: 5, payoffLocal: 380 }]);
  const offers = dwellingOffersOf({ ownerOccupiedUnits: 100, turnoverShareThisWeek: 0.1, sellerPayoffLadder: ladder, buildCostLocal: 300, newUnits: 2 });
  // 10 mortgaged dwellings and 90 outright, a tenth of each moving; the completions at cost.
  assert.deepEqual(offers, [
    { units: 0.5, reservationLocal: 300 },   // payoff 160 is below what a dwelling costs to build
    { units: 0.5, reservationLocal: 380 },   // an underwater owner must fetch the loan
    { units: 9, reservationLocal: 300 },
    { units: 2, reservationLocal: 300 },
  ]);
  // Bids at 350 clear everything but the underwater rung.
  const book = clearDwellings(offers, [{ units: 20, maxPriceLocal: 350 }]);
  assert.equal(book.unitsCleared, 11.5);
  assert.equal(book.priceLocal, 350);
  // Before any bank pass has published a ladder, every owner is outright at the build cost.
  assert.deepEqual(dwellingOffersOf({ ownerOccupiedUnits: 100, turnoverShareThisWeek: 0.1, buildCostLocal: 300, newUnits: 0 }),
    [{ units: 10, reservationLocal: 300 }]);
});
