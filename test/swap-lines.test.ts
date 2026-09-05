/** §3.17b-v — the swap lines: drawn when the basis clears past the line's price, capped at it,
 *  priced at overnight plus the spread, and on both central banks' books. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SWAP_LINE_SPREAD_BPS, swapLineDrawLocal, cappedBasisBps, swapLineInterestLocal } from '../src/domain/swap-lines';
import { swapLineDrawnLocal } from '../src/domain/banking';
import { centralBankAssetsLocal, centralBankLiabilitiesLocal, swapLineLentLocal, type CentralBank } from '../src/domain/central-bank';
import { PARITY_FX } from '../src/domain/currency';

test('the line lends what the market left unfilled once the basis clears past its price, and nothing while the market is cheaper', () => {
  assert.equal(swapLineDrawLocal({ unfilledLocal: 5e9, clearedBasisBps: SWAP_LINE_SPREAD_BPS + 10 }), 5e9);
  assert.equal(swapLineDrawLocal({ unfilledLocal: 5e9, clearedBasisBps: SWAP_LINE_SPREAD_BPS - 5 }), 0, 'the market is cheaper than the line');
  assert.equal(swapLineDrawLocal({ unfilledLocal: 5e9, clearedBasisBps: undefined }), 5e9, 'nobody lent: the line is the lender');
  assert.equal(swapLineDrawLocal({ unfilledLocal: 0, clearedBasisBps: 100 }), 0, 'nothing unfilled');
  assert.equal(cappedBasisBps(80), SWAP_LINE_SPREAD_BPS, 'no basis clears above the line while it stands');
  assert.equal(cappedBasisBps(12), 12);
  assert.equal(cappedBasisBps(undefined), SWAP_LINE_SPREAD_BPS);
  assert.ok(Math.abs(swapLineInterestLocal(1e6, 0.03) - 1e6 * (0.03 + 0.0025) / 52) < 1e-9, 'overnight plus the spread, weekly');
});

test('the draw sits on both books: the bank owes the foreign money, the central bank on-lent it and owes the home money it gave', () => {
  const fx = { ...PARITY_FX, EUR: 1.25 } as typeof PARITY_FX;
  const sheet = { swapLineDrawnByRegion: { EUR: 1_000_000 } };
  assert.ok(Math.abs(swapLineDrawnLocal(sheet, 'USD', fx) - 1_250_000) < 1e-6, 'a million euros, in dollars at today\'s rate');
  assert.equal(swapLineDrawnLocal({}, 'USD', fx), 0);
  const cb = { region: 'USA', loansToBanksLocal: 0, foreignOfficialClaimsUSD: 0, standingFacilityLentLocal: 0, reverseRepoBorrowedLocal: 0, currencyInCirculationLocal: 0, swapLineLentByRegion: { EUR: 1_000_000 }, swapLineDepositsLocal: 1_100_000 } as unknown as CentralBank;
  assert.ok(Math.abs(swapLineLentLocal(cb, 'USD', fx) - 1_250_000) < 1e-6);
  const assets = centralBankAssetsLocal(0, cb, 0, 'USD', fx);
  const liabilities = centralBankLiabilitiesLocal(cb, 0, 0);
  assert.ok(Math.abs(assets - 1_250_000) < 1e-6, 'the on-lent euros are its asset, at today\'s rate');
  assert.ok(Math.abs(liabilities - 1_100_000) < 1e-6, 'the dollars it gave at the draw\'s rate are its liability');
});

test('§3.20-LLR-b: the three lines are reads of the book of draws', async () => {
  const { swapLineDrawnByRegionOf, swapLineLentByRegionOf, swapLineDepositsOf } = await import('../src/domain/swap-lines');
  const book = [
    { id: 'a', homeRegion: 'USA', counterpartyRegion: 'EUR', bankId: 'B1', foreignLocal: 100, homeLocal: 125, homeUSD: 125, drawnWeek: 1, maturityWeek: 14 },
    { id: 'b', homeRegion: 'USA', counterpartyRegion: 'EUR', bankId: 'B2', foreignLocal: 50, homeLocal: 60, homeUSD: 60, drawnWeek: 2, maturityWeek: 15 },
    { id: 'c', homeRegion: 'USA', counterpartyRegion: 'JPN', bankId: 'B1', foreignLocal: 7, homeLocal: 5, homeUSD: 5, drawnWeek: 2, maturityWeek: 15 },
  ] as never[];
  assert.deepEqual(swapLineDrawnByRegionOf(book, 'B1' as never), { EUR: 100, JPN: 7 });
  assert.deepEqual(swapLineLentByRegionOf(book), { EUR: 150, JPN: 7 });
  assert.equal(swapLineDepositsOf(book), 190);
});
