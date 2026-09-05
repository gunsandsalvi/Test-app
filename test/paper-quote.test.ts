/**
 * §3.15-ii — the quote a fixed-income view shows: the cleared price and, off it, a corporate
 * spread or a sovereign yield. One read of the one price store.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureV2 } from '../src/engine2/world';
import { setActiveWireWorld, setActiveWireJournal, newWireJournal } from '../src/engine/ledger/wire';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { seedLadder } from '../src/engine/ledger/tranche-ledger';
import { governmentIssuer } from '../src/domain/entity-keys';
import { asEntityId, asInstrumentId, asTicker } from '../src/domain/ids';
import { setClearedPrice } from '../src/engine2/prices';
import { paperQuoteOf } from '../src/engine/credit-price';
import { priceFromSpreadBps, priceFromYield, COUPON_PERIOD_WEEKS } from '../src/domain/pricing';

const rates = { zeroRates: { tenor3M: 0.04, tenor2Y: 0.04, tenor5Y: 0.04, tenor10Y: 0.04, tenor30Y: 0.04 }, policyRate: 0.04 };

test('a corporate bond quotes its price and the OAS the price implies; unprinted paper quotes nothing', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const krln = { id: asEntityId('KRLN'), ticker: asTicker('KRLN'), region: 'USA' as const };
  const bond = asInstrumentId('KRLN-T1');
  setActiveWireJournal(newWireJournal(1, 3));
  setActiveWireWorld(wireWorldOf(v2, [{ id: krln.id, ticker: krln.ticker, region: 'USA' }] as never, []));
  try {
    seedLadder(v2, krln, [{ id: bond, principalLocal: 1e6, rateType: 'FIXED', couponRate: 0.06, originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR' }]);
    assert.equal(paperQuoteOf(v2, bond, rates, 10), undefined, 'no market has printed it');
    const px = priceFromSpreadBps({ annualCouponRate: 0.06, periodWeeks: COUPON_PERIOD_WEEKS, weeksToMaturity: 250 }, rates.zeroRates, 250);
    setClearedPrice(v2, bond, px);
    const q = paperQuoteOf(v2, bond, rates, 10);
    assert.ok(q && Math.abs(q.pricePerFace - px) < 1e-12);
    assert.ok(q.spreadBps !== undefined && Math.abs(q.spreadBps - 250) < 0.01, 'the spread comes back off the price');
    assert.equal(q.yieldAnnual, undefined);
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});

test('a sovereign quotes its price and the yield it implies — a bond off its schedule, a bill off its discount', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const bond = asInstrumentId('USA-GOV-5Y-1'), bill = asInstrumentId('USA-GOV-3M-1');
  setActiveWireJournal(newWireJournal(1, 3));
  setActiveWireWorld(wireWorldOf(v2, [], []));
  try {
    seedLadder(v2, governmentIssuer('USA'), [
      { id: bond, principalLocal: 1e6, rateType: 'FIXED', couponRate: 0.04, originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR' },
      { id: bill, principalLocal: 1e6, rateType: 'FIXED', couponRate: 0.05, originationWeek: 0, maturityWeek: 13, seniority: 'SENIOR' },
    ]);
    setClearedPrice(v2, bond, priceFromYield({ annualCouponRate: 0.04, periodWeeks: COUPON_PERIOD_WEEKS, weeksToMaturity: 250 }, 0.045));
    setClearedPrice(v2, bill, 1 / (1 + 0.05 * (13 / 52)));
    const qb = paperQuoteOf(v2, bond, rates, 10);
    assert.ok(qb && qb.yieldAnnual !== undefined && Math.abs(qb.yieldAnnual - 0.045) < 1e-6, 'the yield comes back off the price');
    assert.equal(qb.spreadBps, undefined, 'a sovereign has no credit spread here');
    const ql = paperQuoteOf(v2, bill, rates, 0);
    assert.ok(ql && ql.yieldAnnual !== undefined && Math.abs(ql.yieldAnnual - 0.05) < 1e-9, 'a bill yields its discount over its life');
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});
