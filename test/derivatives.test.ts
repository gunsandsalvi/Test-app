/**
 * DRV — the one derivative layer, pinned at the profile: every class's legs are stated by the
 * profile alone, so a test here IS the contract's whole behaviour. The rules protected: a mark
 * leg telescopes to (final − strike) in cash (the defect the futures book carried its whole life),
 * a close-out never disagrees with the carry it replaces, one capacity budget spans every class,
 * and the standing-cover index nets exactly the live cover of one side of one party.
 */
import { test } from 'node:test';
import { bankPartyOf, companyPartyOf } from '../src/domain/party';
import assert from 'node:assert/strict';
import { DerivativeContract, DerivativeReference, standingCoverLocal, standingCoverUnits, derivativePartyKey }
  from '../src/domain/derivatives/contract';
import { DerivativeMarketView } from '../src/domain/derivatives/profile';
import { DERIVATIVE_CLASSES, deskNotionalCapacityLocal, standingPfeChargeLocal, DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM }
  from '../src/domain/derivatives/registry';
import { hedgeConcessionPerUnit, hedgeToleranceBps } from '../src/domain/derivatives/hedging';
import { StandingBook } from '../src/domain/derivatives/standing-book';
import { asEntityId } from '../src/domain/ids';

const view = (over: Partial<DerivativeMarketView> = {}): DerivativeMarketView => ({
  week: 10,
  isIssuerDefaulted: () => false,
  overnightRateAnnual: () => 0.03,
  parRateAnnual: () => 0.04,
  cdsSpreadBps: () => 150,
  isInvestmentGrade: () => false,
  recoveryRate: () => 0.4,
  commodityPrint: () => 110,
  commoditySpot: () => 105,
  fxToUsd: () => 1.1,
  ...over,
});

/** §3.13-BOOK dIIb: each class states its own reference; a generic fixture picks the class's. */
const referenceFor = (classId: DerivativeContract['classId']): DerivativeReference =>
  classId === 'CDS' ? { kind: 'ISSUER', issuerId: asEntityId('X') }
    : classId === 'COMMODITY_FUTURE' ? { kind: 'COMMODITY', commodityId: 'X' }
      : classId === 'FX_FORWARD' ? { kind: 'REGION', regionId: 'EUR' } : { kind: 'RATE' };

const base = (over: Partial<DerivativeContract>): DerivativeContract => ({
  id: 'c', classId: 'IRS', regionId: 'USA', currency: 'USD',
  a: bankPartyOf(asEntityId('AAA')), b: { kind: 'INSTITUTION', id: asEntityId('INS1') },
  notional: 1_000_000, strike: 0.05, reference: { kind: 'RATE' }, termKey: 's5',
  struckWeek: 0, maturityWeek: 260, ...over,
});

test('IRS: the periodic leg is fixed-minus-overnight on the notional, weekly, to the receiver', () => {
  const leg = DERIVATIVE_CLASSES.IRS.periodicLegUSDToB(base({}), view())!;
  assert.ok(Math.abs(leg.usdToB - (1_000_000 * (0.05 - 0.03)) / 52) < 1e-9);
  assert.equal(leg.reason, 'swap settlement');
});

test('IRS: close-out equals the remaining weekly nets at today\'s par — carry and close-out agree', () => {
  const c = base({ strike: 0.05, maturityWeek: 62 });
  const m = view({ week: 10, parRateAnnual: () => 0.04, overnightRateAnnual: () => 0.04 });
  const closeOut = DERIVATIVE_CLASSES.IRS.closeOutUSDToB(c, m);
  const weeklyAtPar = DERIVATIVE_CLASSES.IRS.periodicLegUSDToB(c, m)!.usdToB;
  assert.ok(Math.abs(closeOut - weeklyAtPar * 52) < 1e-6);
  assert.equal(DERIVATIVE_CLASSES.IRS.closeOutUSDToB(c, view({ parRateAnnual: () => Number.NaN })), 0);
});

test('CDS: premium weekly to the seller; a reference default pays par less recovery to the buyer', () => {
  const c = base({ classId: 'CDS', strike: 200, reference: { kind: 'ISSUER', issuerId: asEntityId('ISSUER') }, termKey: '' });
  const prem = DERIVATIVE_CLASSES.CDS.periodicLegUSDToB(c, view())!;
  assert.ok(Math.abs(prem.usdToB - (1_000_000 * 0.02) / 52) < 1e-9);
  assert.equal(DERIVATIVE_CLASSES.CDS.eventTermination(c, view()), null);
  const ev = DERIVATIVE_CLASSES.CDS.eventTermination(c, view({ isIssuerDefaulted: () => true }))!;
  assert.ok(Math.abs(ev.usdToB - -(1_000_000 * 0.6)) < 1e-9, 'seller pays the buyer (negative to B)');
});

test('CDS: close-out is the spread move over the remaining life, owed to the buyer when spreads widened', () => {
  const c = base({ classId: 'CDS', strike: 100, reference: { kind: 'ISSUER', issuerId: asEntityId('ISSUER') }, maturityWeek: 62 });
  const toB = DERIVATIVE_CLASSES.CDS.closeOutUSDToB(c, view({ week: 10, cdsSpreadBps: () => 300 }));
  assert.ok(Math.abs(toB - -(0.02 * 1_000_000 * 1)) < 1e-6);
});

test('futures: the mark telescopes — settling every weekly delta sums to (delivery spot − strike) × units', () => {
  const p = DERIVATIVE_CLASSES.COMMODITY_FUTURE;
  const c = base({ classId: 'COMMODITY_FUTURE', strike: 100, units: 10, reference: { kind: 'COMMODITY', commodityId: 'OIL' }, termKey: '3M', maturityWeek: 13, settledMarkLocal: 0 });
  const prints = [104, 98, 120];
  let paidToA = 0;
  prints.forEach((px, i) => {
    const mark = p.markToMarketUSDToA(c, view({ week: 10 + i, commodityPrint: () => px }))!;
    paidToA += mark - (c.settledMarkLocal ?? 0);
    c.settledMarkLocal = mark;
  });
  const final = p.markToMarketUSDToA(c, view({ week: 13, commoditySpot: () => 115 }))!;
  paidToA += final - (c.settledMarkLocal ?? 0);
  assert.ok(Math.abs(paidToA - (115 - 100) * 10) < 1e-9);
  assert.equal(p.markToMarketUSDToA(c, view({ week: 11, commodityPrint: () => Number.NaN })), null, 'no print, no mark');
});

test('FX forward: the holder short the foreign currency gains when it falls; the dealer mirrors it', () => {
  const c = base({ classId: 'FX_FORWARD', strike: 1.0, reference: { kind: 'REGION', regionId: 'EUR' }, termKey: '', settledMarkLocal: 0 });
  const mark = DERIVATIVE_CLASSES.FX_FORWARD.markToMarketUSDToA(c, view({ fxToUsd: () => 0.9 }))!;
  assert.ok(Math.abs(mark - 1_000_000 * 0.1) < 1e-6);
  assert.ok(DERIVATIVE_CLASSES.FX_FORWARD.markToMarketUSDToA(c, view({ fxToUsd: () => 1.1 }))! < 0);
});

test('one capacity budget across every class: what the CDS desk wrote consumes what the FX desk can write', () => {
  const book: DerivativeContract[] = [
    base({ classId: 'CDS', a: bankPartyOf(asEntityId('HEDGER')), b: bankPartyOf(asEntityId('DESK')), notional: 100 }),
    base({ classId: 'FX_FORWARD', a: { kind: 'INSTITUTION', id: asEntityId('X') }, b: bankPartyOf(asEntityId('DESK')), notional: 500 }),
    base({ classId: 'IRS', a: bankPartyOf(asEntityId('DESK')), notional: 1000, maturityWeek: 5 }), // matured: no charge
  ];
  const charged = standingPfeChargeLocal(book, 'BANK:DESK', 10);
  assert.ok(Math.abs(charged - (100 * 0.10 + 500 * 0.02)) < 1e-9);
  const headroom = 1000;
  const fxCap = deskNotionalCapacityLocal(headroom, charged, 'FX_FORWARD');
  assert.ok(Math.abs(fxCap - (headroom * DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM - charged) / 0.02) < 1e-9);
  assert.equal(deskNotionalCapacityLocal(headroom, 10_000, 'CDS'), 0, 'a spent budget writes nothing');
});

test('standing cover nets exactly one side of one party, live contracts only, by reference and tenor', () => {
  const me = companyPartyOf(asEntityId('ME'));
  const book: DerivativeContract[] = [
    base({ classId: 'IRS', a: me, termKey: 's5', notional: 10 }),
    base({ classId: 'IRS', a: me, termKey: 's10', notional: 20 }),
    base({ classId: 'IRS', b: me, termKey: 's5', notional: 40 }),
    base({ classId: 'IRS', a: me, termKey: 's5', notional: 80, maturityWeek: 10 }), // matures this week
    base({ classId: 'COMMODITY_FUTURE', b: me, reference: { kind: 'COMMODITY', commodityId: 'OIL' }, termKey: '3M', units: 7, notional: 700 }),
  ];
  assert.equal(standingCoverLocal(book, 'IRS', 'a', derivativePartyKey(me), 10, undefined, 's5'), 10);
  assert.equal(standingCoverLocal(book, 'IRS', 'a', derivativePartyKey(me), 10), 30);
  assert.equal(standingCoverLocal(book, 'IRS', 'b', derivativePartyKey(me), 10), 40);
  assert.equal(standingCoverUnits(book, 'COMMODITY_FUTURE', 'b', derivativePartyKey(me), 10, 'OIL', '3M'), 7);
  assert.equal(standingCoverUnits(book, 'COMMODITY_FUTURE', 'b', derivativePartyKey(me), 10, 'OIL', '1M'), 0);
});

test('the walk-away is one arithmetic: a full-mandate hedger pays a sigma, a non-hedger nothing', () => {
  assert.equal(hedgeToleranceBps(0.10, 1), 1000);
  assert.equal(hedgeToleranceBps(0.10, 0), 0);
  assert.equal(hedgeToleranceBps(0.10, 0.35), 350);
  assert.ok(Math.abs(hedgeConcessionPerUnit({ spotPrice: 100, annualVol: 0.2, costOfCapital: 0.1, tenorYears: 0.25 }) - 100 * 0.1 * 0.1) < 1e-9);
});

test('every registered class states both roles and admissible facts — the completeness a new class must meet', () => {
  for (const p of Object.values(DERIVATIVE_CLASSES)) {
    assert.ok(p.roleA && p.roleB);
    assert.ok(p.pfeAddOnRate > 0 && p.pfeAddOnRate < 1);
    assert.ok(p.initialMarginRate >= 0 && p.initialMarginRate < 1);
    const marks = p.markToMarketUSDToA(base({ classId: p.id, units: 1, reference: referenceFor(p.id), settledMarkLocal: 0 }), view()) !== null;
    const periodic = p.periodicLegUSDToB(base({ classId: p.id }), view()) !== null;
    assert.ok(marks !== periodic, `${p.id}: exactly one leg family`);
    if (marks) assert.ok(p.markReasonLive && p.markReasonFinal, `${p.id}: a mark class labels its legs`);
  }
});

test('the standing-book index answers exactly what the per-participant walks answered, and follows a strike', () => {
  const me = bankPartyOf(asEntityId('ME'));
  const you = { kind: 'INSTITUTION' as const, id: asEntityId('YOU') };
  const book: DerivativeContract[] = [
    base({ id: '1', a: me, b: you, notional: 10, termKey: 's5' }),
    base({ id: '2', a: me, b: you, notional: 20, termKey: 's10' }),
    base({ id: '3', a: you, b: me, notional: 40, termKey: 's2' }),
    base({ id: '4', classId: 'CDS', a: me, b: you, notional: 100, reference: { kind: 'ISSUER', issuerId: asEntityId('IG-NAME') }, termKey: '' }),
    base({ id: '5', classId: 'CDS', a: you, b: me, notional: 200, reference: { kind: 'ISSUER', issuerId: asEntityId('HY-NAME') }, termKey: '' }),
    base({ id: '6', classId: 'COMMODITY_FUTURE', a: you, b: me, notional: 700, units: 7, reference: { kind: 'COMMODITY', commodityId: 'OIL' }, termKey: '3M' }),
    base({ id: '7', classId: 'COMMODITY_FUTURE', a: me, b: you, notional: 300, units: 3, reference: { kind: 'COMMODITY', commodityId: 'OIL' }, termKey: '3M' }),
    base({ id: 'matured', a: me, b: you, notional: 999, maturityWeek: 10 }),
    base({ id: 'self', classId: 'FX_FORWARD', a: me, b: me, notional: 50, reference: { kind: 'REGION', regionId: 'EUR' }, termKey: '' }),
  ];
  const isIG = (issuerId: string) => issuerId === 'IG-NAME';
  const index = new StandingBook(10, isIG);
  index.extend(book);
  const meKey = derivativePartyKey(me);
  const youKey = derivativePartyKey(you);
  for (const [party, key] of [[me, meKey], [you, youKey]] as const) {
    for (const side of ['a', 'b'] as const) {
      for (const classId of ['IRS', 'CDS', 'COMMODITY_FUTURE', 'FX_FORWARD'] as const) {
        assert.equal(index.coverLocal(classId, side, key), standingCoverLocal(book, classId, side, key, 10), `${classId} ${side} ${key}`);
        for (const term of ['s2', 's5', 's10', '3M', '']) {
          assert.equal(index.coverLocal(classId, side, key, undefined, term), standingCoverLocal(book, classId, side, key, 10, undefined, term));
        }
        for (const ref of ['IG-NAME', 'HY-NAME', 'OIL', 'EUR', '']) {
          assert.equal(index.coverLocal(classId, side, key, ref), standingCoverLocal(book, classId, side, key, 10, ref));
          assert.equal(index.coverUnits(classId, side, key, ref, '3M'), standingCoverUnits(book, classId, side, key, 10, ref, '3M'));
        }
      }
    }
    assert.equal(index.pfeChargeLocal(key), standingPfeChargeLocal(book, key, 10, isIG), `graded charge ${key}`);
    void party;
  }
  // A strike appends; the index folds the tail and stays the book's.
  book.push(base({ id: '8', a: me, b: you, notional: 5, termKey: 's5' }));
  index.extend(book);
  assert.equal(index.coverLocal('IRS', 'a', meKey, undefined, 's5'), 15);
  assert.equal(index.pfeChargeLocal(meKey), standingPfeChargeLocal(book, meKey, 10, isIG));
  assert.equal(index.indexed, book.length);
});
