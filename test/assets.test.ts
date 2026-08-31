/**
 * §7.230 found FOUR taxonomies for "what kind of instrument is this", two of them anonymous inline
 * unions, disagreeing about whether a government bond is SOV_BOND or GOV_BOND. The registry
 * reconciles them; these assertions are what stop them drifting apart again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_REGISTRY, assetClassOf, holdingClassOf, isIntraSectorClaim } from '../src/domain/assets';

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

test('the two names for a government bond land in the same class', () => {
  // The disagreement that made the four taxonomies dangerous rather than merely redundant.
  assert.equal(holdingClassOf('SOV_BOND'), 'SOVEREIGN');
  assert.equal(holdingClassOf('GOV_BOND'), 'SOVEREIGN');
  assert.equal(assetClassOf('SOV_BOND'), 'SOVEREIGN');
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
