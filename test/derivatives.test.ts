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
import { DERIVATIVE_CLASSES, deskNotionalCapacityLocal, standingPfeChargeLocal, DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM, initialMarginAtStrike }
  from '../src/domain/derivatives/registry';
import { hedgeConcessionPerUnit, hedgeToleranceBps } from '../src/domain/derivatives/hedging';
import { StandingBook } from '../src/domain/derivatives/standing-book';
import { asEntityId } from '../src/domain/ids';
import { writerReservationVol, ATM_PRICE_PER_VOL_SQRT_T } from '../src/domain/derivatives/classes/option';
import { calculateBlackScholesGreeks } from '../src/engine/blackScholes';
import { realisedUnsecuredRecoveryRate, CLAIM_SENIORITY, type Estate } from '../src/domain/estate';
import { partyKey } from '../src/engine/ledger/party';

const view = (over: Partial<DerivativeMarketView> = {}): DerivativeMarketView => ({
  week: 10,
  isIssuerDefaulted: () => false,
  overnightRateAnnual: () => 0.03,
  parRateAnnual: () => 0.04,
  cdsSpreadBps: () => 150,
  isInvestmentGrade: () => false,
  recoveryRate: () => 0.4,
  issuerWorkout: () => undefined,
  commodityPrint: () => 110,
  commoditySpot: () => 105,
  fxToUsd: () => 1.1,
  commodityWeeklyMove: () => 0.04,
  fxWeeklyMove: () => 0.015,
  rateWeeklyMoveBps: () => 12,
  cdsSpreadWeeklyMoveBps: () => 20,
  equityPrice: () => 100,
  equityAnnualVol: () => 0.3,
  equityWeeklyMove: () => 0.05,
  indexLevel: () => 4000,
  indexAnnualVol: () => 0.2,
  indexWeeklyMove: () => 0.03,
  ...over,
});

/** §3.13-BOOK dIIb: each class states its own reference; a generic fixture picks the class's. */
const referenceFor = (classId: DerivativeContract['classId']): DerivativeReference =>
  classId === 'CDS' ? { kind: 'ISSUER', issuerId: asEntityId('X') }
    : classId === 'OPTION' ? { kind: 'SHARES', issuerId: asEntityId('X') }
    : classId === 'COMMODITY_FUTURE' ? { kind: 'COMMODITY', commodityId: 'X' }
      : classId === 'FX_FORWARD' ? { kind: 'REGION', regionId: 'EUR' } : { kind: 'RATE' };

const base = (over: Partial<DerivativeContract>): DerivativeContract => ({
  id: 'c', classId: 'IRS', regionId: 'USA', currency: 'USD',
  a: bankPartyOf(asEntityId('AAA')), b: { kind: 'INSTITUTION', id: asEntityId('INS1') },
  notional: 1_000_000, strike: 0.05, reference: { kind: 'RATE' }, termKey: 's5',
  initialMarginLocal: 0, struckWeek: 0, maturityWeek: 260, ...over,
});

test('IRS: the periodic leg is fixed-minus-overnight on the notional, weekly, to the receiver', () => {
  const leg = DERIVATIVE_CLASSES.IRS.periodicLegUSDToB(base({}), view())!;
  assert.ok(Math.abs(leg.usdToB - (1_000_000 * (0.05 - 0.03)) / 52) < 1e-9);
  assert.equal(leg.reason, 'swap settlement');
});

test('§3.17-iii IRS: the mark is the remaining fixed-leg difference at today\'s par, discounted; it is zero at maturity and null without a print', () => {
  const c = base({ strike: 0.05, maturityWeek: 62 });
  const m = view({ week: 10, parRateAnnual: () => 0.04, overnightRateAnnual: () => 0.04 });
  const mark = DERIVATIVE_CLASSES.IRS.markToMarketUSDToA(c, m)!;
  // Paying 5% against a 4% par is a loss to the payer: 52 weeks of −1% on 1M, discounted at 4%.
  const weekly = 1_000_000 * (0.04 - 0.05) / 52;
  const annuity = (1 - Math.pow(1 + 0.04 / 52, -52)) / (0.04 / 52);
  assert.ok(Math.abs(mark - weekly * annuity) < 1e-6);
  assert.ok(mark < 0 && mark > weekly * 52, 'discounted, so smaller in size than the undiscounted sum');
  assert.equal(DERIVATIVE_CLASSES.IRS.markToMarketUSDToA(c, view({ week: 62, parRateAnnual: () => 0.04 })), 0, 'nothing left to value at maturity');
  assert.equal(DERIVATIVE_CLASSES.IRS.markToMarketUSDToA(c, view({ parRateAnnual: () => Number.NaN })), null);
  assert.equal(DERIVATIVE_CLASSES.IRS.closeOutUSDToB(c, m), 0, 'a mark class closes out at the mark');
});

test('CDS: premium weekly to the seller; a reference default pays par less recovery to the buyer', () => {
  const c = base({ classId: 'CDS', strike: 200, reference: { kind: 'ISSUER', issuerId: asEntityId('ISSUER') }, termKey: '' });
  const prem = DERIVATIVE_CLASSES.CDS.periodicLegUSDToB(c, view())!;
  assert.ok(Math.abs(prem.usdToB - (1_000_000 * 0.02) / 52) < 1e-9);
  assert.equal(DERIVATIVE_CLASSES.CDS.eventTermination(c, view()), null);
  const ev = DERIVATIVE_CLASSES.CDS.eventTermination(c, view({ isIssuerDefaulted: () => true }))!;
  assert.ok(Math.abs(ev.usdToB - -(1_000_000 * 0.6)) < 1e-9, 'seller pays the buyer (negative to B)');
  // §3.17-iii: what variation margin already paid the buyer on the way is netted from the payout.
  const evAfterVm = DERIVATIVE_CLASSES.CDS.eventTermination(base({ ...c, settledMarkLocal: 100_000 }), view({ isIssuerDefaulted: () => true }))!;
  assert.ok(Math.abs(evAfterVm.usdToB - -(1_000_000 * 0.6 - 100_000)) < 1e-9);
});

test('§3.17-vi CDS: the credit event settles at the issuer\'s OWN workout — it waits while the estate is open, marks at the expectation meanwhile, and pays no premium', () => {
  const c = base({ classId: 'CDS', strike: 200, reference: { kind: 'ISSUER', issuerId: asEntityId('ISSUER') }, termKey: '', maturityWeek: 10 });
  const open = view({ isIssuerDefaulted: () => true, issuerWorkout: () => ({ state: 'OPEN' }) });
  assert.equal(DERIVATIVE_CLASSES.CDS.eventTermination(c, open), null, 'the payoff waits for the auction');
  assert.equal(DERIVATIVE_CLASSES.CDS.holdsPastMaturity!(c, open), true, 'and the contract outlives its maturity for it');
  assert.equal(DERIVATIVE_CLASSES.CDS.periodicLegUSDToB(c, open), null, 'no premium on a triggered contract');
  assert.ok(Math.abs(DERIVATIVE_CLASSES.CDS.markToMarketUSDToA(c, open)! - 1_000_000 * 0.6) < 1e-9, 'marked at the expected payoff, the region\'s average, while open');
  const closed = view({ isIssuerDefaulted: () => true, issuerWorkout: () => ({ state: 'CLOSED', recovery: 0.1 }) });
  assert.equal(DERIVATIVE_CLASSES.CDS.holdsPastMaturity!(c, closed), false);
  assert.ok(Math.abs(DERIVATIVE_CLASSES.CDS.markToMarketUSDToA(c, closed)! - 1_000_000 * 0.9) < 1e-9);
  const ev = DERIVATIVE_CLASSES.CDS.eventTermination(base({ ...c, settledMarkLocal: 600_000 }), closed)!;
  assert.ok(Math.abs(ev.usdToB - -(1_000_000 * 0.9 - 600_000)) < 1e-9, 'the settlement is the true-up from the expectation to what the unsecured class got back');
  assert.equal(DERIVATIVE_CLASSES.CDS.holdsPastMaturity!(c, view()), false, 'a live reference: maturity is final');
  const est = { companyId: asEntityId('ISSUER'), ticker: 'ISS', regionId: 'USA', openedWeek: 1, assets: { cashLocal: 0, receivablesLocal: 0, inventoryLocal: 0, ppeLocal: 0 }, distributedLocal: 0, claims: [
    { holder: { kind: 'INSTITUTION', id: asEntityId('F1') }, instrumentType: 'CORP_BOND', seniority: CLAIM_SENIORITY.UNSECURED, principalLocal: 300, recoveredLocal: 30 },
    { holder: { kind: 'INSTITUTION', id: asEntityId('F2') }, instrumentType: 'COMMERCIAL_PAPER', seniority: CLAIM_SENIORITY.UNSECURED, principalLocal: 100, recoveredLocal: 30 },
    { holder: { kind: 'BANK', id: asEntityId('B1') }, instrumentType: 'BANK_FACILITY', seniority: CLAIM_SENIORITY.SECURED, principalLocal: 1000, recoveredLocal: 900 },
  ] } as unknown as Estate;
  assert.equal(realisedUnsecuredRecoveryRate(est), 0.15, 'the unsecured class alone: bonds and paper, not the secured lender');
});

test('§3.17-iii CDS: the mark is the spread move over the remaining life on a risky annuity — to the buyer when spreads widened', () => {
  const c = base({ classId: 'CDS', strike: 100, reference: { kind: 'ISSUER', issuerId: asEntityId('ISSUER') }, maturityWeek: 62 });
  const mark = DERIVATIVE_CLASSES.CDS.markToMarketUSDToA(c, view({ week: 10, cdsSpreadBps: () => 300, overnightRateAnnual: () => 0.03, recoveryRate: () => 0.4 }))!;
  const undiscounted = 0.02 * 1_000_000;
  assert.ok(mark > 0 && mark < undiscounted, 'positive to the buyer, and less than the undiscounted move');
  const hazard = (0.03 / 0.6) / 52, r = 0.03 / 52;
  const annuity = (1 - Math.pow(1 + r + hazard, -52)) / (r + hazard);
  assert.ok(Math.abs(mark - (undiscounted / 52) * annuity) < 1e-6);
  assert.equal(DERIVATIVE_CLASSES.CDS.markToMarketUSDToA(c, view({ cdsSpreadBps: () => Number.NaN })), null, 'no print, no mark');
  assert.equal(DERIVATIVE_CLASSES.CDS.closeOutUSDToB(c, view()), 0);
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
    const termKey = p.id === 'OPTION' ? 'CALL' : 's5';
    const move = p.closeOutMoveOf(base({ classId: p.id, reference: referenceFor(p.id), termKey }), view());
    assert.ok(move !== undefined && move > 0 && move < 1, `${p.id}: the reference's move sizes its margin`);
    const marks = p.markToMarketUSDToA(base({ classId: p.id, units: 1, reference: referenceFor(p.id), termKey, settledMarkLocal: 0 }), view()) !== null;
    // §3.17-iii: every class marks; a periodic leg is the cash a rate contract exchanges beside it.
    assert.ok(marks, `${p.id}: every class carries a mark`);
    assert.ok(p.markReasonLive && p.markReasonFinal, `${p.id}: a mark class labels its legs`);
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
      for (const classId of ['IRS', 'CDS', 'COMMODITY_FUTURE', 'FX_FORWARD', 'OPTION'] as const) {
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

test('§3.13-BOOK d4a: a contract party is keyed the way the ledger keys every party', () => {
  const bank = bankPartyOf(asEntityId('USA_BANK1'));
  const inst = { kind: 'INSTITUTION' as const, id: asEntityId('INST-1') };
  const comp = companyPartyOf(asEntityId('USA_ACME'));
  assert.equal(derivativePartyKey(bank), partyKey(bank));
  assert.equal(derivativePartyKey(inst), partyKey(inst));
  assert.equal(derivativePartyKey(comp), partyKey(comp));
});

test('§3.17-ii: initial margin is the reference\'s own move over a session, on the notional — and rises with it', () => {
  const swap = base({ classId: 'IRS', struckWeek: 10, maturityWeek: 10 + 5 * 52 });
  // 12bp a week on five years of remaining life, on 1M.
  assert.ok(Math.abs(initialMarginAtStrike(swap, view()) - 1_000_000 * (12 / 10000) * 5) < 1e-6);
  const cds = base({ classId: 'CDS', reference: referenceFor('CDS'), struckWeek: 10, maturityWeek: 10 + 5 * 52 });
  assert.ok(Math.abs(initialMarginAtStrike(cds, view()) - 1_000_000 * (20 / 10000) * 5) < 1e-6);
  const fut = base({ classId: 'COMMODITY_FUTURE', reference: referenceFor('COMMODITY_FUTURE'), units: 1 });
  assert.ok(Math.abs(initialMarginAtStrike(fut, view()) - 1_000_000 * 0.04) < 1e-6);
  const fwd = base({ classId: 'FX_FORWARD', reference: referenceFor('FX_FORWARD') });
  assert.ok(Math.abs(initialMarginAtStrike(fwd, view()) - 1_000_000 * 0.015) < 1e-6);
  assert.ok(initialMarginAtStrike(fwd, view({ fxWeeklyMove: () => 0.03 })) > initialMarginAtStrike(fwd, view()), 'D5: margin rises when the move rises');
  assert.equal(initialMarginAtStrike(fwd, view({ fxWeeklyMove: () => undefined })), 0, 'a first print has no move to measure, and posts nothing');
});

test('§3.17b-i OPTION: the premium is paid once in the strike week, the mark is the option\'s value, and expiry exercises at intrinsic', () => {
  const call = base({ classId: 'OPTION', reference: { kind: 'SHARES', issuerId: asEntityId('X') }, termKey: 'CALL', strike: 100, units: 1000, notional: 100_000, struckWeek: 10, maturityWeek: 36 });
  const atStrike = view({ week: 10, equityPrice: () => 100, equityAnnualVol: () => 0.3, overnightRateAnnual: () => 0.03 });
  const prem = DERIVATIVE_CLASSES.OPTION.periodicLegUSDToB(call, atStrike)!;
  assert.ok(prem.usdToB > 0 && prem.reason === 'option premium', 'the holder pays the writer once');
  assert.ok(Math.abs(prem.usdToB - DERIVATIVE_CLASSES.OPTION.markToMarketUSDToA(call, atStrike)!) < 1e-9, 'and it is the option\'s value that week');
  assert.equal(DERIVATIVE_CLASSES.OPTION.periodicLegUSDToB(call, view({ week: 11 })), null, 'never again');
  assert.equal(DERIVATIVE_CLASSES.OPTION.eventTermination(call, atStrike), null, 'no exercise before expiry');
  const up = DERIVATIVE_CLASSES.OPTION.markToMarketUSDToA(call, view({ week: 20, equityPrice: () => 120 }))!;
  assert.ok(up > 20_000, 'in the money: worth its intrinsic and more');
  assert.equal(DERIVATIVE_CLASSES.OPTION.markToMarketUSDToA(call, view({ equityAnnualVol: () => undefined })), null, 'nothing to price at: no mark');
  const exercised = DERIVATIVE_CLASSES.OPTION.eventTermination(base({ ...call, settledMarkLocal: 15_000 }), view({ week: 36, equityPrice: () => 120 }))!;
  assert.ok(Math.abs(exercised.usdToB - -(20_000 - 15_000)) < 1e-9, 'the writer pays intrinsic beyond what the mark already paid');
  assert.equal(exercised.reason, 'option exercised');
  const expired = DERIVATIVE_CLASSES.OPTION.eventTermination(base({ ...call, settledMarkLocal: 3_000 }), view({ week: 36, equityPrice: () => 90 }))!;
  assert.ok(Math.abs(expired.usdToB - 3_000) < 1e-9, 'worthless: the holder gives back what the mark had paid it');
  assert.equal(expired.reason, 'option expired');
  const put = base({ ...call, termKey: 'PUT' });
  const putExercised = DERIVATIVE_CLASSES.OPTION.eventTermination(put, view({ week: 36, equityPrice: () => 90 }))!;
  assert.ok(Math.abs(putExercised.usdToB - -10_000) < 1e-9, 'a put pays the fall through the strike');
  assert.equal(DERIVATIVE_CLASSES.OPTION.closeOutMoveOf(call, view()), 0.05, 'margin on the shares\' own move');
});

test('§3.17b-iii OPTION on an index: the put is on the region\'s composite, and a writer\'s reservation is a volatility', () => {
  const put = base({ classId: 'OPTION', reference: { kind: 'INDEX', regionId: 'USA' }, termKey: 'PUT', strike: 4000, units: 25, notional: 100_000, struckWeek: 10, maturityWeek: 23 });
  const v = view({ week: 10, indexLevel: () => 4000, indexAnnualVol: () => 0.2 });
  const prem = DERIVATIVE_CLASSES.OPTION.periodicLegUSDToB(put, v)!;
  assert.ok(prem.usdToB > 0, 'the holder pays a premium at strike');
  assert.equal(DERIVATIVE_CLASSES.OPTION.closeOutMoveOf(put, v), 0.03, 'margin on the index\'s own move');
  const fell = DERIVATIVE_CLASSES.OPTION.eventTermination(put, view({ week: 23, indexLevel: () => 3600 }))!;
  assert.ok(Math.abs(fell.usdToB - -(400 * 25)) < 1e-9, 'a 10% fall pays the fall on the units');
  // The reservation: realised vol plus the premium that pays the return on the capital consumed.
  const r0 = writerReservationVol({ realisedVol: 0.2, capitalChargeRate: 0, requiredReturnAnnual: 0.1, tenorYears: 0.25 });
  assert.equal(r0, 0.2, 'no capital consumed: the writer asks for what it expects to realise');
  const r1 = writerReservationVol({ realisedVol: 0.2, capitalChargeRate: 0.003, requiredReturnAnnual: 0.1, tenorYears: 0.25 });
  assert.ok(r1 > 0.2, 'capital consumed: a premium in vol points');
  // The approximation the reservation rests on: an at-the-money price is ~0.4 · S · σ · √T.
  const S = 100, T = 0.25, vol = 0.2;
  const bs = calculateBlackScholesGreeks(S, S, T, 0, vol, 'PUT').price;
  assert.ok(Math.abs(bs / S - ATM_PRICE_PER_VOL_SQRT_T * vol * Math.sqrt(T)) < 0.002, `ATM price ${bs} against the approximation`);
});
