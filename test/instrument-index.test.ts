/**
 * §3.13-BOOK (dI) — THE INSTRUMENT INDEX: one row per instrument the world has issued.
 *
 * The intern table names every id the world has ever touched; the index says which of them are
 * instruments, of what kind, by whom, in which money. These pin the three things that make it a
 * registry rather than a cache: a declaration is idempotent and a disagreeing one throws; a
 * tranche is declared as it is issued, with its issuer and its money, and `issuerIdOf` reads it;
 * and the wire resolves an equity against the index, so an undeclared equity is refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureV2 } from '../src/engine2/world';
import { isRegisteredInstrument, instrumentKindOf, instrumentIssuerOf, instrumentCurrencyOf, registeredInstrumentRefs, issuedSharesOf, etfSharesOutstandingOf, marketCapAt } from '../src/engine2/instruments';
import { registerInstrument, registerCompanyEquity, registerFundShares, registerBook, setIssuedUnits, stashSeedIssuedShares } from '../src/engine/ledger/instrument-ledger';
import { issuerIdOf } from '../src/engine2/tranches';
import { seedLadder } from '../src/engine/ledger/tranche-ledger';
import { newWireJournal, setActiveWireJournal, setActiveWireWorld } from '../src/engine/ledger/wire';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { corporateTrancheId, equityInstrumentId, swapInstrumentId, peFundInterestId } from '../src/domain/instrument-keys';
import { governmentIssuer } from '../src/domain/entity-keys';
import { asEntityId, asInstrumentId, asTicker } from '../src/domain/ids';

const world = () => ensureV2({} as Parameters<typeof ensureV2>[0]);

test('a declaration is idempotent, and a second one that disagrees throws at the site', () => {
  const v2 = world();
  const id = asInstrumentId('ACME-T1');
  const ref = registerInstrument(v2, { id, kind: 'CORP_BOND', issuer: asEntityId('USA_ACME'), currency: 'USD' });
  assert.equal(registerInstrument(v2, { id, kind: 'CORP_BOND', issuer: asEntityId('USA_ACME'), currency: 'USD' }), ref);
  assert.equal(instrumentKindOf(v2, id), 'CORP_BOND');
  assert.equal(instrumentIssuerOf(v2, id), asEntityId('USA_ACME'));
  assert.equal(instrumentCurrencyOf(v2, id), 'USD');
  assert.throws(() => registerInstrument(v2, { id, kind: 'CORP_BOND', issuer: asEntityId('USA_ACME'), currency: 'EUR' }), /declared twice/);
  assert.throws(() => registerInstrument(v2, { id, kind: 'LEVERAGED_LOAN', issuer: asEntityId('USA_ACME'), currency: 'USD' }), /declared twice/);
  // An id the world named but nobody issued is not in the index.
  assert.equal(isRegisteredInstrument(v2, asInstrumentId('NOBODY-ISSUED-THIS')), false);
  assert.equal(instrumentCurrencyOf(v2, asInstrumentId('NOBODY-ISSUED-THIS')), undefined);
  assert.deepEqual(registeredInstrumentRefs(v2), [ref]);
});

test('a ladder rung is declared as it is issued — kind, issuer and money — and issuerIdOf reads the index', () => {
  const v2 = world();
  const acme = { id: asEntityId('EUR_ACME'), ticker: asTicker('ACME'), region: 'EUR' as const };
  const gov = governmentIssuer('EUR');
  setActiveWireJournal(newWireJournal(1, 0));
  setActiveWireWorld(wireWorldOf(v2, [{ id: acme.id }], []));
  try {
    seedLadder(v2, acme, [{ id: corporateTrancheId(acme.ticker, 1), principalLocal: 5e6, rateType: 'FLOATING', floatingMarginBps: 300, originationWeek: 0, maturityWeek: 104, seniority: 'SENIOR' }]);
    seedLadder(v2, gov, [{ id: asInstrumentId('EUR-GOV-5Y-INIT'), principalLocal: 1e9, rateType: 'FIXED', couponRate: 0.02, originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR' }]);
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
  const rung = corporateTrancheId(acme.ticker, 1);
  assert.equal(instrumentKindOf(v2, rung), 'LEVERAGED_LOAN');
  assert.equal(instrumentCurrencyOf(v2, rung), 'EUR');
  assert.equal(issuerIdOf(v2, rung), acme.id);
  // A sovereign rung is GOV_BOND paper, owed by the government entity, in the region's money.
  assert.equal(instrumentKindOf(v2, asInstrumentId('EUR-GOV-5Y-INIT')), 'GOV_BOND');
  assert.equal(issuerIdOf(v2, 'EUR-GOV-5Y-INIT'), gov.id);
  assert.equal(instrumentCurrencyOf(v2, asInstrumentId('EUR-GOV-5Y-INIT')), 'EUR');
});

test('a wire resolves an equity or a fund share against the index, so an undeclared one is refused', () => {
  const v2 = world();
  const w = wireWorldOf(v2, [{ id: asEntityId('JPN_SONY') }], [{ id: asEntityId('INST-ETF-1') }]);
  assert.equal(w.instrumentExists('EQUITY', 'JPN_SONY'), false, 'in the company list is not the same as issued');
  registerCompanyEquity(v2, { id: asEntityId('JPN_SONY'), region: 'JPN' });
  assert.equal(w.instrumentExists('EQUITY', 'JPN_SONY'), true);
  assert.equal(instrumentCurrencyOf(v2, equityInstrumentId('JPN_SONY')), 'JPY');
  assert.equal(registerFundShares(v2, { id: asEntityId('INST-HF-1'), region: 'USA', entityType: 'HEDGE_FUND' }), undefined, 'a hedge fund issues no share on the register');
  assert.equal(w.instrumentExists('ETF_SHARE', 'INST-ETF-1'), false);
  registerFundShares(v2, { id: asEntityId('INST-ETF-1'), region: 'USA', entityType: 'ETF' });
  assert.equal(w.instrumentExists('ETF_SHARE', 'INST-ETF-1'), true);
  assert.equal(instrumentKindOf(v2, asInstrumentId('INST-ETF-1')), 'ETF_SHARE');
});

test('a book the adapter mints is declared with no issuer, and a fund interest with its fund', () => {
  const v2 = world();
  const swap = swapInstrumentId('UK', 's5');
  const ref = registerBook(v2, swap, 'IRS', 'GBP');
  assert.equal(registerBook(v2, swap, 'IRS', 'GBP'), ref, 'the adapter builds the book every week; the declaration is one');
  assert.equal(instrumentKindOf(v2, swap), 'IRS');
  assert.equal(instrumentIssuerOf(v2, swap), undefined, 'nobody issues a swap tenor');
  assert.equal(instrumentCurrencyOf(v2, swap), 'GBP');
  const w = wireWorldOf(v2, [], []);
  assert.equal(w.instrumentExists('CONTRACT', swap), true);
  assert.equal(w.instrumentExists('CONTRACT', 'UK-IRS-s30'), false);
  registerFundShares(v2, { id: asEntityId(peFundInterestId('UK', 1)), region: 'UK', entityType: 'PRIVATE_EQUITY' });
  assert.equal(instrumentKindOf(v2, peFundInterestId('UK', 1)), 'PE_FUND_INTEREST');
  assert.equal(instrumentIssuerOf(v2, peFundInterestId('UK', 1)), asEntityId(peFundInterestId('UK', 1)));
});

test('an id the index does not hold has no issuer to name, and a fund share names its fund', () => {
  const v2 = world();
  assert.throws(() => issuerIdOf(v2, 'NOBODY-ISSUED-THIS'), /on no instrument index/);
  registerBook(v2, swapInstrumentId('USA', 's2'), 'IRS', 'USD');
  assert.throws(() => issuerIdOf(v2, swapInstrumentId('USA', 's2')), /nobody issued/);
  registerFundShares(v2, { id: asEntityId('INST-ETF-9'), region: 'USA', entityType: 'ETF' });
  assert.equal(issuerIdOf(v2, 'INST-ETF-9'), asEntityId('INST-ETF-9'), 'the share is keyed by the fund and issued by it');
});

test('the issued amount lives on the index: declared from the seed stash, moved by the ledger, read by everyone', () => {
  const v2 = world();
  const acme = { id: asEntityId('USA_ACME'), region: 'USA' as const, stockPrice: 20 };
  assert.equal(issuedSharesOf(v2, acme.id), 0, 'no register until the equity is declared');
  stashSeedIssuedShares(acme, 1_000);
  registerCompanyEquity(v2, acme);
  assert.equal(issuedSharesOf(v2, acme.id), 1_000);
  assert.equal(marketCapAt(v2, acme), 20_000);
  setIssuedUnits(v2, equityInstrumentId(acme.id), 995); // a buyback
  assert.equal(issuedSharesOf(v2, acme.id), 995);
  assert.throws(() => setIssuedUnits(v2, equityInstrumentId('USA_NOBODY'), 5), /does not hold/);
  assert.throws(() => setIssuedUnits(v2, equityInstrumentId(acme.id), -1), /stated as/);
  registerFundShares(v2, { id: asEntityId('INST-ETF-2'), region: 'USA', entityType: 'ETF' });
  assert.equal(etfSharesOutstandingOf(v2, 'INST-ETF-2'), 0, 'a fund opens with no shares; creations mint them');
  setIssuedUnits(v2, asInstrumentId('INST-ETF-2'), 40);
  assert.equal(etfSharesOutstandingOf(v2, 'INST-ETF-2'), 40);
});
