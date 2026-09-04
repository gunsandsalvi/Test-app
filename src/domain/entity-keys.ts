/**
 * §3.13-BOOK slice (c) — THE ENTITY KEY GRAMMAR, IN ONE PLACE.
 *
 * The instrument side got this in slice (a) (`instrument-keys.ts`) and the argument is the same:
 * an entity that is not a row in a store still needs an id, and every one of those ids was a
 * template literal inside whichever file happened to create the entity. Nothing could enumerate
 * the shapes, and nothing could notice when one of them was written down twice.
 *
 * Which is what this file was opened for. The TREASURY's id — the ladder issuer every sovereign
 * tranche hangs off — was written in FIVE places: a private `govIssuerId` in the seed, a bare
 * template inside `materializeGovLadder`, and three identical `govIssuer` object literals in the
 * three stages that retire sovereign paper. Five statements of one identity, none of which could
 * fail if another changed.
 *
 * **The ids are unchanged.** Each function reproduces its site's template byte for byte: these
 * strings key the register, the account store and the party table, so a changed key would be a
 * silent data migration rather than a rename.
 */

import { asEntityId, asTicker, type EntityId, type Ticker } from './ids';
import type { RegionId } from './geography';

/**
 * A region's TREASURY as a ladder issuer — the party a sovereign tranche is issued by and retired
 * to. See the header: this is the name that existed five times.
 */
export const governmentEntityId = (regionId: RegionId): EntityId => asEntityId(`GOV_${regionId}`);

/**
 * §3.13-READ D10 — THE TREASURY AS A LADDER ISSUER, as an OBJECT. Slice (c1) extracted the id and
 * left the object around it written four times: the same `{ id, ticker, region, kind }` literal,
 * with `governmentEntityId(regionId)` called TWICE inside each one, in the three stages that
 * retire sovereign paper and in the seed. The constructor was extracted, the thing it constructs
 * was not — which is what a "constructor" that only makes half the value gets you.
 */
export const governmentIssuer = (regionId: RegionId): {
  id: EntityId; ticker: Ticker; region: RegionId; kind: 'GOVERNMENT';
} => {
  const id = governmentEntityId(regionId);
  // §3.13-BOOK slice (c2c): the treasury has no TICKER — it is not listed and nothing quotes it —
  // so its entity id stands in both fields, and this is the one place that says so out loud.
  return { id, ticker: asTicker(id), region: regionId, kind: 'GOVERNMENT' };
};

/**
 * §3.13-READ D11 — THE ENTITY ID TEMPLATES THAT WERE STILL INLINE. A named firm, a carve-out
 * private firm, a region's money fund, an index's tracking fund, and a carrier. Each was one
 * template literal in whichever file created the entity, and each is a key into the register, the
 * accounts and the party table — the same reason the treasury's was worth naming.
 */
export const companyEntityId = (region: RegionId, ticker: Ticker): EntityId =>
  asEntityId(`${region}_${ticker}`);
export const privateCompanyEntityId = (region: RegionId, ticker: Ticker): EntityId =>
  asEntityId(`${region}_PRV_${ticker}`);
export const carrierEntityId = (region: RegionId, ticker: Ticker): EntityId =>
  asEntityId(`${region}_CAR_${ticker}`);
/** One money fund per region, numbered from 1 — WS7 opens exactly one and nothing has needed a second. */
export const moneyFundEntityId = (regionId: RegionId, index = 1): EntityId =>
  asEntityId(`${regionId}_MMF_${index}`);
/** The fund that tracks one index; the index's own id is the stem, so the pair is readable. */
export const indexFundEntityId = (indexId: string): EntityId => asEntityId(`${indexId}_ETF`);

/** A carve-out spun out of a parent this week — the parent's id is the stem, so the lineage is
 *  readable and two spins in different weeks are two firms. */
export const spinOffEntityId = (parentId: EntityId, week: number): EntityId =>
  asEntityId(`${parentId}-SPIN-${week}`);

/**
 * §3.13-BOOK slice (c2b) — A PE FUND, AS AN ENTITY. Its id was minted by
 * `instrument-keys.ts:peFundInterestId` and then used as the fund's own entity id — the
 * constructor for the INSTRUMENT standing in for the constructor of the thing that issues it.
 * That is the same crossing equity and ETF shares have, but here it was avoidable: a fund is an
 * entity first, and the LP interest is keyed BY it.
 */
export const peFundEntityId = (regionId: RegionId, fundIndex: number): EntityId =>
  asEntityId(`${regionId}_PEFUND_${fundIndex}`);
