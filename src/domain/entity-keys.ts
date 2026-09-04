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

import { asEntityId, type EntityId } from './ids';
import type { RegionId } from './geography';

/**
 * A region's TREASURY as a ladder issuer — the party a sovereign tranche is issued by and retired
 * to. See the header: this is the name that existed five times.
 */
export const governmentEntityId = (regionId: RegionId): EntityId => asEntityId(`GOV_${regionId}`);
