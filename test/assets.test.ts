/**
 * §7.230 found FOUR taxonomies for "what kind of instrument is this", two of them anonymous inline
 * unions, disagreeing about whether a government bond is SOV_BOND or GOV_BOND. The registry
 * reconciles them; these assertions are what stop them drifting apart again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_REGISTRY, assetClassOf, holdingClassOf, isIntraSectorClaim, isTrancheKind, heldInShares, isVehicleClaim } from '../src/domain/assets';

test('every asset type has a complete registry entry', () => {
  // The property a string tag cannot have: adding a member without answering every question is a
  // compile error, and adding a QUESTION forces an answer for every existing member.
  for (const [type, m] of Object.entries(ASSET_REGISTRY)) {
    assert.ok(m.assetClass, `${type} has no asset class`);
    assert.equal(typeof m.carriesCoupon, 'boolean', type);
    assert.equal(typeof m.lendable, 'boolean', type);
    assert.equal(typeof m.hasCreditRisk, 'boolean', type);
    assert.ok(['PRICE', 'YIELD_LIKE', 'SPREAD_LIKE'].includes(m.quotedAs), type);
  }
});

test('a government bond has ONE name, and the old second one is no kind at all', () => {
  // §3.13-BOOK (e): the disagreement that made the four taxonomies dangerous is gone with them —
  // every union is a view of `InstrumentKind`, and a name outside it does not resolve.
  assert.equal(holdingClassOf('GOV_BOND'), 'SOVEREIGN');
  assert.equal(assetClassOf('GOV_BOND'), 'SOVEREIGN');
  assert.equal(holdingClassOf('SOV_BOND'), undefined);
  assert.equal(holdingClassOf('COMMODITY'), undefined);
  assert.equal(holdingClassOf('COMMODITY_FUTURE'), 'COMMODITY');
});

test('every kind answers every question, the folded predicates included', () => {
  for (const [type, m] of Object.entries(ASSET_REGISTRY)) {
    for (const k of ['ladderPaper', 'vehicleClaim', 'hedgedAsFixedIncome', 'carriesRateDuration'] as const) assert.equal(typeof m[k], 'boolean', `${type}.${k}`);
  }
  assert.equal(isTrancheKind('BANK_FACILITY'), true);
  assert.equal(isTrancheKind('GOV_BOND'), false, 'the sovereign ladder is its own store');
  assert.equal(heldInShares('MMF_SHARE'), true);
  assert.equal(heldInShares('CORP_BOND'), false);
  assert.equal(isVehicleClaim('ETF_SHARE'), true);
  assert.equal(isVehicleClaim('EQUITY'), false);
});

test('short corporate paper is corporate credit, whatever book prices it', () => {
  assert.equal(holdingClassOf('COMMERCIAL_PAPER'), holdingClassOf('CORP_BOND'));
});

test('an intra-sector ownership claim is flagged so a sector sum cannot double-count it', () => {
  assert.equal(isIntraSectorClaim('PE_FUND_INTEREST'), true);
  assert.equal(isIntraSectorClaim('EQUITY'), false);
});

test('an unknown instrument returns undefined rather than a silent class', () => {
  assert.equal(holdingClassOf('NOT_A_REAL_INSTRUMENT'), undefined);
});
