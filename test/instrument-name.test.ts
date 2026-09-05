/**
 * §3.14 — THE NAME A MARKET WOULD USE. One grammar for every tranche, sovereign or corporate:
 * issuer + coupon + maturity, issuer + margin + maturity, issuer + tenor for a bill.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instrumentDisplayName, tenorLabel, couponLabel } from '../src/domain/instruments';

const year = (week: number) => 2027 + Math.floor(week / 52);

test('a bond is issuer + coupon + maturity; a loan issuer + margin + maturity', () => {
  assert.equal(instrumentDisplayName('KRLN', { rateType: 'FIXED', couponRate: 0.0475, originationWeek: 10, maturityWeek: 4 * 52 + 10 }, year), 'KRLN 4.75% 2031');
  assert.equal(instrumentDisplayName('KRLN', { rateType: 'FIXED', couponRate: 0.045, originationWeek: 0, maturityWeek: 52 }, year), 'KRLN 4.5% 2028');
  assert.equal(instrumentDisplayName('KRLN', { rateType: 'FLOATING', floatingMarginBps: 350, originationWeek: 0, maturityWeek: 2 * 52 }, year), 'KRLN L+350 2029');
  // A bank facility is a loan and is named as one.
  assert.equal(instrumentDisplayName('KRLN', { rateType: 'FLOATING', floatingMarginBps: 275.4, originationWeek: 0, maturityWeek: 52 }, year), 'KRLN L+275 2028');
});

test('short paper is issuer + tenor: a sovereign bill, commercial paper', () => {
  assert.equal(instrumentDisplayName('USA', { rateType: 'FIXED', couponRate: 0.04, originationWeek: 5, maturityWeek: 18, isBill: true }, year), 'USA 3M bill');
  assert.equal(instrumentDisplayName('KRLN', { rateType: 'FIXED', couponRate: 0.05, originationWeek: 5, maturityWeek: 18, isCommercialPaper: true }, year), 'KRLN 3M CP');
  assert.equal(instrumentDisplayName('USA', { rateType: 'FIXED', couponRate: 0.04, originationWeek: 0, maturityWeek: 52 * 10 }, year), 'USA 4% 2037');
});

test('tenors and coupons print as a market prints them', () => {
  assert.equal(tenorLabel(13), '3M');
  assert.equal(tenorLabel(26), '6M');
  assert.equal(tenorLabel(52), '1Y');
  assert.equal(tenorLabel(78), '1.5Y');
  assert.equal(tenorLabel(520), '10Y');
  assert.equal(couponLabel(0.05), '5%');
  assert.equal(couponLabel(0.04125), '4.13%');
});
