/**
 * AU — THE OBJECT REGISTRY: one line per kind of thing. The resolver, the search and the labels
 * are built on it; the shell and the functions ask it and never switch on a type themselves.
 */

import { NewsItem } from '../../domain/events';
import { ObjectLabel, ObjectRef, ObjectType } from '../types';
import { World } from '../world';
import { ObjectModule } from './registry';
import { company } from './company';
import { institution } from './institution';
import { region } from './region';
import { market } from './market';
import { pool } from './pool';
import { cohort } from './cohort';
import { occupation } from './occupation';
import { commodity } from './commodity';
import { fx } from './fx';
import { curve } from './curve';
import { centralbank } from './centralbank';
import { tranche } from './tranche';
import { contract } from './contract';
import { offering } from './offering';
import { estate } from './estate';
import { book } from './book';
import { lane } from './lane';
import { index } from './index-object';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const OBJECTS: Record<ObjectType, ObjectModule<any>> = {
  company, institution, region, market, pool, cohort, occupation, commodity, fx, curve, centralbank, tranche, contract, offering, estate, book, lane, index,
};
export const OBJECT_TYPES = Object.keys(OBJECTS) as ObjectType[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const moduleOf = (type: ObjectType): ObjectModule<any> => OBJECTS[type];

export function objectOf(world: World, ref: ObjectRef): unknown {
  return OBJECTS[ref.type]?.find(world, ref.id);
}

export function labelOf(world: World, ref: ObjectRef): ObjectLabel {
  const m = OBJECTS[ref.type];
  const o = m?.find(world, ref.id);
  if (!m || o === undefined) return { ticker: ref.id, name: 'gone', kind: ref.type };
  return m.label(world, ref.id, o);
}

export function headlineOf(world: World, ref: ObjectRef): { value: string; sub?: string; neg?: boolean } | undefined {
  const m = OBJECTS[ref.type];
  const o = m?.find(world, ref.id);
  return m && o !== undefined ? m.headline?.(world, ref.id, o) : undefined;
}

/**
 * A typed phrase resolves to exactly one object, or nothing: `type:id`, a region, a ticker or
 * id of a company or fund, then every module's own parse ("usa apparel", "eur/usd", "oil",
 * "usa curve", "usa cb", "usa industry pool", "usa>eur").
 */
export function refOfIdentifier(world: World, s: string | undefined | null): ObjectRef | undefined {
  if (!s) return undefined;
  const q = s.trim();
  if (!q) return undefined;
  const typed = q.match(/^([a-z]+):(.+)$/);
  if (typed && (OBJECTS as Record<string, unknown>)[typed[1]]) {
    const type = typed[1] as ObjectType;
    if (OBJECTS[type].find(world, typed[2]) !== undefined) return { type, id: typed[2] };
  }
  // A kind's own phrase first ("usa apparel", "crude oil", "eur/usd", "usa curve"): these are
  // exact forms, and a commodity's name outranks a firm that happens to carry it as a ticker.
  for (const type of OBJECT_TYPES) {
    const m = OBJECTS[type];
    if (!m.parse) continue;
    const id = m.parse(world, q);
    if (id !== undefined) return { type, id };
  }
  const upper = q.toUpperCase();
  if (world.state.regions[upper as 'USA']) return { type: 'region', id: upper };
  const c = world.state.companies.find((x) => x.id === q) ?? world.state.companies.find((x) => x.ticker === upper);
  if (c) return { type: 'company', id: c.id };
  const e = world.state.institutionalEntities.find((x) => x.id === q) ?? world.state.institutionalEntities.find((x) => x.ticker === upper);
  if (e) return { type: 'institution', id: e.id };
  for (const type of ['commodity', 'fx', 'estate', 'book', 'lane', 'index'] as ObjectType[]) {
    if (OBJECTS[type].find(world, q) !== undefined) return { type, id: q };
  }
  return undefined;
}

/** A kind's word alone ("estates", "books", "central banks") names the screener over every one of that kind. */
export function kindOfWord(world: World, phrase: string): { type: ObjectType; ref?: ObjectRef; tab?: string } | undefined {
  const p = phrase.trim().toLowerCase();
  for (const type of OBJECT_TYPES) {
    const m = OBJECTS[type];
    // §3.15-i: a class word ("bonds", "bills") is the kind's screener opened on that class.
    const classTab = m.kindWords?.[p];
    if (classTab !== undefined) {
      const first = m.list(world)[0];
      return first ? { type, ref: { type, id: first.id }, tab: classTab } : { type };
    }
    if (m.words[0] !== p && m.words[1] !== p && !(type === 'company' && (p === 'firms' || p === 'firm')) && !(type === 'institution' && (p === 'institutions' || p === 'institution')) && !(type === 'index' && p === 'indexes') && !(type === 'fx' && (p === 'fx' || p === 'currencies'))) continue;
    const first = m.list(world)[0];
    if (!first) return { type };
    const groups = m.peers?.groups(world, first.id, first.obj) ?? [];
    return { type, ref: { type, id: first.id }, tab: groups.length ? groups[groups.length - 1].name : undefined };
  }
  return undefined;
}

export interface SearchHit { ref: ObjectRef; label: ObjectLabel; score: number }

/** The command bar's matches across every searchable kind: exact handle first, then handle
 *  prefix, then a word of the name or a keyword. Limited per kind so firms do not drown markets. */
export function searchObjects(world: World, query: string, limit = 12): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const qWords = q.split(/\s+/);
  const hits: SearchHit[] = [];
  for (const type of OBJECT_TYPES) {
    const m = OBJECTS[type];
    if (!m.searchable) continue;
    const kindHits: SearchHit[] = [];
    for (const { id, obj } of m.list(world)) {
      const label = m.label(world, id, obj);
      const t = label.ticker.toLowerCase(); const n = label.name.toLowerCase();
      const kws = m.keywords?.(world, id, obj) ?? [];
      let score = 0;
      if (t === q || n === q) score = 100;
      else if (t.startsWith(q)) score = 80 - (t.length - q.length);
      else if (n.startsWith(q)) score = 60;
      else if (qWords.every((w) => t.includes(w) || n.includes(w) || kws.some((k) => k.includes(w)))) score = 45 - qWords.length;
      else if (n.split(/\s+/).some((w) => w.startsWith(q))) score = 40;
      if (score === 0) continue;
      if ((obj as { isDefaulted?: boolean }).isDefaulted) score -= 30;
      kindHits.push({ ref: { type, id }, label, score });
    }
    kindHits.sort((a, b) => b.score - a.score || a.label.ticker.localeCompare(b.label.ticker));
    // §3.15-i: a tranche is searched by issuer and class, so a query that names them wants more than four.
    hits.push(...kindHits.slice(0, type === 'company' || type === 'institution' || type === 'tranche' ? limit : 4));
  }
  return hits.sort((a, b) => b.score - a.score || a.label.ticker.localeCompare(b.label.ticker)).slice(0, limit);
}

/** Does a story concern this object? Its refs, its region, its handle in the text, or the module's own test. */
export function storyMentions(world: World, ref: ObjectRef, item: NewsItem): boolean {
  if (item.refs?.some((r) => r.type === ref.type && r.id === ref.id)) return true;
  const m = OBJECTS[ref.type];
  const o = m.find(world, ref.id);
  if (o === undefined) return false;
  if (m.mentions?.(world, ref.id, o, item)) return true;
  const label = m.label(world, ref.id, o);
  if (ref.type === 'region' || ref.type === 'centralbank' || ref.type === 'curve') return item.impactRegion === ref.id && (ref.type !== 'centralbank' || item.category === 'CENTRAL_BANK' || /window|central bank|policy rate/i.test(item.title));
  if (ref.type === 'market') { const { region, subUnitId } = { region: ref.id.split(':')[0], subUnitId: ref.id.slice(ref.id.indexOf(':') + 1) }; return item.impactRegion === region && new RegExp(subUnitId.replace(/_/g, ' '), 'i').test(item.description); }
  if (ref.type === 'pool') { const [region, industry] = ref.id.split(':'); return item.impactRegion === region && item.description.includes(`${industry} pool`); }
  if (ref.type === 'estate') return item.affectedTicker !== undefined && label.ticker.startsWith(item.affectedTicker);
  if (item.affectedTicker && item.affectedTicker === label.ticker) return true;
  const handle = label.ticker.split(' ')[0];
  return handle.length >= 3 && new RegExp(`\\b${handle}\\b`).test(item.title + ' ' + item.description);
}
