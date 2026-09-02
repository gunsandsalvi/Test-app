/**
 * DRV — the one derivative layer, pinned at the profile: every class's legs are stated by the
 * profile alone, so a test here IS the contract's whole behaviour. The rules protected: a mark
 * leg telescopes to (final − strike) in cash (the defect the futures book carried its whole life),
 * a close-out never disagrees with the carry it replaces, one capacity budget spans every class,
 * and the standing-cover index nets exactly the live cover of one side of one party.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DerivativeContract, standingCoverUSD, standingCoverUnits, derivativePartyKey }
  from '../src/domain/derivatives/contract';
import { DerivativeMarketView } from '../src/domain/derivatives/profile';
import { DERIVATIVE_CLASSES, deskNotionalCapacityUSD, standingPfeChargeUSD, DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM }
  from '../src/domain/derivatives/registry';
import { hedgeConcessionPerUnit, hedgeToleranceBps } from '../src/domain/derivatives/hedging';
import { StandingBook } from '../src/domain/derivatives/standing-book';

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

const base = (over: Partial<DerivativeContract>): DerivativeContract => ({
  id: 'c', classId: 'IRS', regionId: 'USA',
  a: { kind: 'BANK', ticker: 'AAA' }, b: { kind: 'INSTITUTION', id: 'INS1' },
  notionalUSD: 1_000_000, strike: 0.05, referenceId: '', termKey: 's5',
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
  const c = base({ classId: 'CDS', strike: 200, referenceId: 'ISSUER', termKey: '' });
  const prem = DERIVATIVE_CLASSES.CDS.periodicLegUSDToB(c, view())!;
  assert.ok(Math.abs(prem.usdToB - (1_000_000 * 0.02) / 52) < 1e-9);
  assert.equal(DERIVATIVE_CLASSES.CDS.eventTermination(c, view()), null);
  const ev = DERIVATIVE_CLASSES.CDS.eventTermination(c, view({ isIssuerDefaulted: () => true }))!;
  assert.ok(Math.abs(ev.usdToB - -(1_000_000 * 0.6)) < 1e-9, 'seller pays the buyer (negative to B)');
});

test('CDS: close-out is the spread move over the remaining life, owed to the buyer when spreads widened', () => {
  const c = base({ classId: 'CDS', strike: 100, referenceId: 'ISSUER', maturityWeek: 62 });
  const toB = DERIVATIVE_CLASSES.CDS.closeOutUSDToB(c, view({ week: 10, cdsSpreadBps: () => 300 }));
  assert.ok(Math.abs(toB - -(0.02 * 1_000_000 * 1)) < 1e-6);
});

test('futures: the mark telescopes — settling every weekly delta sums to (delivery spot − strike) × units', () => {
  const p = DERIVATIVE_CLASSES.COMMODITY_FUTURE;
  const c = base({ classId: 'COMMODITY_FUTURE', strike: 100, units: 10, referenceId: 'OIL', termKey: '3M', maturityWeek: 13, settledMarkUSD: 0 });
  const prints = [104, 98, 120];
  let paidToA = 0;
  prints.forEach((px, i) => {
    const mark = p.markToMarketUSDToA(c, view({ week: 10 + i, commodityPrint: () => px }))!;
    paidToA += mark - (c.settledMarkUSD ?? 0);
    c.settledMarkUSD = mark;
  });
  const final = p.markToMarketUSDToA(c, view({ week: 13, commoditySpot: () => 115 }))!;
  paidToA += final - (c.settledMarkUSD ?? 0);
  assert.ok(Math.abs(paidToA - (115 - 100) * 10) < 1e-9);
  assert.equal(p.markToMarketUSDToA(c, view({ week: 11, commodityPrint: () => Number.NaN })), null, 'no print, no mark');
});

test('FX forward: the holder short the foreign currency gains when it falls; the dealer mirrors it', () => {
  const c = base({ classId: 'FX_FORWARD', strike: 1.0, referenceId: 'EUR', termKey: '', settledMarkUSD: 0 });
  const mark = DERIVATIVE_CLASSES.FX_FORWARD.markToMarketUSDToA(c, view({ fxToUsd: () => 0.9 }))!;
  assert.ok(Math.abs(mark - 1_000_000 * 0.1) < 1e-6);
  assert.ok(DERIVATIVE_CLASSES.FX_FORWARD.markToMarketUSDToA(c, view({ fxToUsd: () => 1.1 }))! < 0);
});

test('one capacity budget across every class: what the CDS desk wrote consumes what the FX desk can write', () => {
  const book: DerivativeContract[] = [
    base({ classId: 'CDS', a: { kind: 'BANK', ticker: 'HEDGER' }, b: { kind: 'BANK', ticker: 'DESK' }, notionalUSD: 100 }),
    base({ classId: 'FX_FORWARD', a: { kind: 'INSTITUTION', id: 'X' }, b: { kind: 'BANK', ticker: 'DESK' }, notionalUSD: 500 }),
    base({ classId: 'IRS', a: { kind: 'BANK', ticker: 'DESK' }, notionalUSD: 1000, maturityWeek: 5 }), // matured: no charge
  ];
  const charged = standingPfeChargeUSD(book, 'BANK:DESK', 10);
  assert.ok(Math.abs(charged - (100 * 0.10 + 500 * 0.02)) < 1e-9);
  const headroom = 1000;
  const fxCap = deskNotionalCapacityUSD(headroom, charged, 'FX_FORWARD');
  assert.ok(Math.abs(fxCap - (headroom * DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM - charged) / 0.02) < 1e-9);
  assert.equal(deskNotionalCapacityUSD(headroom, 10_000, 'CDS'), 0, 'a spent budget writes nothing');
});

test('standing cover nets exactly one side of one party, live contracts only, by reference and tenor', () => {
  const me = { kind: 'COMPANY', ticker: 'ME' } as const;
  const book: DerivativeContract[] = [
    base({ classId: 'IRS', a: me, termKey: 's5', notionalUSD: 10 }),
    base({ classId: 'IRS', a: me, termKey: 's10', notionalUSD: 20 }),
    base({ classId: 'IRS', b: me, termKey: 's5', notionalUSD: 40 }),
    base({ classId: 'IRS', a: me, termKey: 's5', notionalUSD: 80, maturityWeek: 10 }), // matures this week
    base({ classId: 'COMMODITY_FUTURE', b: me, referenceId: 'OIL', termKey: '3M', units: 7, notionalUSD: 700 }),
  ];
  assert.equal(standingCoverUSD(book, 'IRS', 'a', derivativePartyKey(me), 10, undefined, 's5'), 10);
  assert.equal(standingCoverUSD(book, 'IRS', 'a', derivativePartyKey(me), 10), 30);
  assert.equal(standingCoverUSD(book, 'IRS', 'b', derivativePartyKey(me), 10), 40);
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
    const marks = p.markToMarketUSDToA(base({ classId: p.id, units: 1, referenceId: 'X', settledMarkUSD: 0 }), view()) !== null;
    const periodic = p.periodicLegUSDToB(base({ classId: p.id }), view()) !== null;
    assert.ok(marks !== periodic, `${p.id}: exactly one leg family`);
    if (marks) assert.ok(p.markReasonLive && p.markReasonFinal, `${p.id}: a mark class labels its legs`);
  }
});

test('the standing-book index answers exactly what the per-participant walks answered, and follows a strike', () => {
  const me = { kind: 'BANK', ticker: 'ME' } as const;
  const you = { kind: 'INSTITUTION', id: 'YOU' } as const;
  const book: DerivativeContract[] = [
    base({ id: '1', a: me, b: you, notionalUSD: 10, termKey: 's5' }),
    base({ id: '2', a: me, b: you, notionalUSD: 20, termKey: 's10' }),
    base({ id: '3', a: you, b: me, notionalUSD: 40, termKey: 's2' }),
    base({ id: '4', classId: 'CDS', a: me, b: you, notionalUSD: 100, referenceId: 'IG-NAME', termKey: '' }),
    base({ id: '5', classId: 'CDS', a: you, b: me, notionalUSD: 200, referenceId: 'HY-NAME', termKey: '' }),
    base({ id: '6', classId: 'COMMODITY_FUTURE', a: you, b: me, notionalUSD: 700, units: 7, referenceId: 'OIL', termKey: '3M' }),
    base({ id: '7', classId: 'COMMODITY_FUTURE', a: me, b: you, notionalUSD: 300, units: 3, referenceId: 'OIL', termKey: '3M' }),
    base({ id: 'matured', a: me, b: you, notionalUSD: 999, maturityWeek: 10 }),
    base({ id: 'self', classId: 'FX_FORWARD', a: me, b: me, notionalUSD: 50, referenceId: 'EUR', termKey: '' }),
  ];
  const isIG = (ref: string) => ref === 'IG-NAME';
  const index = new StandingBook(10, isIG);
  index.extend(book);
  const meKey = derivativePartyKey(me);
  const youKey = derivativePartyKey(you);
  for (const [party, key] of [[me, meKey], [you, youKey]] as const) {
    for (const side of ['a', 'b'] as const) {
      for (const classId of ['IRS', 'CDS', 'COMMODITY_FUTURE', 'FX_FORWARD'] as const) {
        assert.equal(index.coverUSD(classId, side, key), standingCoverUSD(book, classId, side, key, 10), `${classId} ${side} ${key}`);
        for (const term of ['s2', 's5', 's10', '3M', '']) {
          assert.equal(index.coverUSD(classId, side, key, undefined, term), standingCoverUSD(book, classId, side, key, 10, undefined, term));
        }
        for (const ref of ['IG-NAME', 'HY-NAME', 'OIL', 'EUR', '']) {
          assert.equal(index.coverUSD(classId, side, key, ref), standingCoverUSD(book, classId, side, key, 10, ref));
          assert.equal(index.coverUnits(classId, side, key, ref, '3M'), standingCoverUnits(book, classId, side, key, 10, ref, '3M'));
        }
      }
    }
    assert.equal(index.pfeChargeUSD(key), standingPfeChargeUSD(book, key, 10, isIG), `graded charge ${key}`);
    void party;
  }
  // A strike appends; the index folds the tail and stays the book's.
  book.push(base({ id: '8', a: me, b: you, notionalUSD: 5, termKey: 's5' }));
  index.extend(book);
  assert.equal(index.coverUSD('IRS', 'a', meKey, undefined, 's5'), 15);
  assert.equal(index.pfeChargeUSD(meKey), standingPfeChargeUSD(book, meKey, 10, isIG));
  assert.equal(index.indexed, book.length);
});
