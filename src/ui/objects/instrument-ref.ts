/** AU — an instrument id as an object the surface can open, and as the world names it. (§3.19-i:
 *  moved out of the clearing-book object, which went with the damper it displayed.) */

import { World } from '../world';
import { REGION_IDS } from '../../domain/geography';
import { ObjectRef } from '../types';
import { ensureV2 } from '../../engine2/world';
import { instrumentNameOf } from '../../engine/instrument-name';
import { yearOfWeek } from '../calendar';
import { displayWeek } from '../world';

export const bookId = (name: string, region: string): string => `${name}:${region}`;

export function instrumentRef(world: World, id: string): ObjectRef | undefined {
  if (world.state.companies.some((c) => c.id === id)) return { type: 'company', id };
  if (world.state.institutionalEntities.some((e) => e.id === id)) return { type: 'institution', id };
  const c = world.state.companies.find((x) => id.startsWith(x.id + '-') || id.startsWith(x.id + ':'));
  if (c) return { type: 'company', id: c.id };
  const r = REGION_IDS.find((x) => id === x || id.startsWith(x + '_') || id.startsWith(x + ':'));
  return r ? { type: 'region', id: r } : undefined;
}

/** An instrument id as the world names it: a tranche by the name a market would use (§3.14,
 *  `instrumentDisplayName`), the company's or fund's ticker where the id is theirs, else the id. */
export function instrumentName(world: World, id: string): string {
  const named = instrumentNameOf(ensureV2(world.state), id,
    (issuerId) => world.state.companies.find((c) => c.id === issuerId)?.ticker,
    (w) => yearOfWeek(displayWeek(world.state, w)));
  if (named !== undefined) return named;
  const ref = instrumentRef(world, id);
  if (!ref) return id;
  if (ref.type === 'company') { const c = world.state.companies.find((x) => x.id === ref.id); return c && c.id === id ? c.ticker : c ? `${c.ticker} ${id.slice(c.id.length + 1)}` : id; }
  if (ref.type === 'institution') return world.state.institutionalEntities.find((x) => x.id === id)?.ticker ?? id;
  return id;
}

