/** AU · object: book — a clearing book: which of its names the damper bound this week, in which direction, and for how long. */

import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid, Table, Hint } from '../ui';
import { count, pctLevel } from '../format';
import { World } from '../world';
import { REGION_IDS } from '../../domain/geography';
import { ObjectHeader, FunctionTiles, RegionLink, taped } from './common';
import { ObjectRef } from '../types';
import { ensureV2 } from '../../engine2/world';
import { instrumentNameOf } from '../../engine/instrument-name';
import { yearOfWeek } from '../calendar';
import { displayWeek } from '../world';

export interface Book { name: string; region: string; bound: { id: string; dir: string; streak: number }[]; streaks: number }

/** The damper keys are `book:instrumentId±`; an instrument id starts with its region. */
function parseKey(key: string): { book: string; id: string; dir: string } {
  const i = key.indexOf(':');
  const rest = key.slice(i + 1);
  const dir = rest.endsWith('+') ? 'up' : rest.endsWith('-') ? 'down' : '';
  return { book: key.slice(0, i), id: dir ? rest.slice(0, -1) : rest, dir };
}
export const regionOfInstrument = (id: string): string => { const m = id.match(/^([A-Z]+)[_:-]/); return m ? m[1] : 'ALL'; };
export const bookId = (name: string, region: string): string => `${name}:${region}`;

function booksOf(world: World): Map<string, Book> {
  const out = new Map<string, Book>();
  const get = (name: string, region: string) => { const k = bookId(name, region); let b = out.get(k); if (!b) { b = { name, region, bound: [], streaks: 0 }; out.set(k, b); } return b; };
  const streaks = world.state.damperBindStreakById ?? {};
  (world.state.lastWeekDamperBoundIds ?? []).forEach((key) => {
    const { book, id, dir } = parseKey(key);
    get(book, regionOfInstrument(id)).bound.push({ id, dir, streak: streaks[`${book}:${id}`] ?? 1 });
  });
  Object.keys(streaks).forEach((key) => { const { book, id } = parseKey(key); if ((streaks[key] ?? 0) >= 3) get(book, regionOfInstrument(id)).streaks++; });
  return out;
}

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

export const book = defineObject<Book>({
  type: 'book',
  words: ['book', 'books'],
  searchable: true,
  find: (world, id) => booksOf(world).get(id),
  list: (world) => [...booksOf(world).entries()].map(([id, obj]) => ({ id, obj })),
  label: (_w, _id, b) => ({ ticker: `${b.region} ${b.name} book`, name: `the ${b.name} book, ${b.region}`, kind: 'clearing book', region: b.region }),
  keywords: (_w, _id, b) => [b.name, b.region.toLowerCase(), 'book', 'damper', 'clearing'],
  parse: (world, phrase) => { const p = phrase.trim().toLowerCase().replace(/\s+book$/, ''); const hit = [...booksOf(world).values()].find((b) => `${b.region.toLowerCase()} ${b.name}` === p || `${b.name} ${b.region.toLowerCase()}` === p); return hit ? bookId(hit.name, hit.region) : undefined; },
  headline: (_w, _id, b) => ({ value: count(b.bound.length), sub: 'names bound', neg: b.bound.length > 0 }),
  series: (world, _id, b) => [taped(world, `book:${b.name}:bound`, 'names bound', 'per week, all regions', (v) => count(Math.round(v)))],
  peers: {
    groups: (world, _id, b) => [
      { name: `${b.region} books`, ids: [...booksOf(world).values()].filter((x) => x.region === b.region).map((x) => bookId(x.name, x.region)) },
      { name: 'all books', ids: [...booksOf(world).keys()] },
    ],
    defaultSort: 'bound',
    columns: [
      { key: 'name', label: 'book', render: (r, _w, nav) => <Link to={{ type: 'book', id: r.id }} nav={nav}>{r.obj.name}</Link>, value: (r) => r.obj.name },
      { key: 'region', label: 'region', render: (r) => r.obj.region, value: (r) => r.obj.region },
      { key: 'bound', label: 'bound', render: (r) => count(r.obj.bound.length), value: (r) => r.obj.bound.length },
      { key: 'up', label: 'up · down', render: (r) => `${r.obj.bound.filter((x) => x.dir === 'up').length} · ${r.obj.bound.filter((x) => x.dir === 'down').length}`, value: (r) => r.obj.bound.filter((x) => x.dir === 'up').length },
      { key: 'streaks', label: '3+ weeks', render: (r) => count(r.obj.streaks), value: (r) => r.obj.streaks },
    ],
  },
  overview({ world, obj: b, nav }) {
    const up = b.bound.filter((x) => x.dir === 'up').length;
    const rows = [...b.bound].sort((x, y) => y.streak - x.streak);
    return (
      <>
        <ObjectHeader name={`the ${b.name} book, ${b.region}`} sub={<>clearing book · <RegionLink id={b.region} nav={nav} /> · the damper bounds a print's weekly move; a name bound k weeks running gets a cap (1+k)× wider, up to 4×</>} />
        <StatGrid>
          <Stat label="bound this week" value={count(b.bound.length)} sub={`${up} wanted higher · ${b.bound.length - up} lower`} neg={b.bound.length > 0} />
          <Stat label="persistent" value={count(b.streaks)} sub="3+ weeks running" neg={b.streaks > 0} />
          <Stat label="share" value={b.bound.length > 0 ? pctLevel(up / b.bound.length, 0) : '—'} sub="pinned upward" />
        </StatGrid>
        {rows.length === 0 ? <Card style={{ padding: 14, color: '#8d97a6' }}>no name in this book hit its damper this week — every print cleared inside the cap.</Card> : (
          <Table rows={rows} keyOf={(r) => r.id} columns={[
            { key: 'name', label: 'name', render: (r) => { const ref = instrumentRef(world, r.id); return ref ? <Link to={ref} nav={nav}>{instrumentName(world, r.id)}</Link> : r.id; } },
            { key: 'dir', label: 'wanted', render: (r) => r.dir },
            { key: 'streak', label: 'weeks', render: (r) => count(r.streak) },
          ]} />
        )}
        {rows.length > 60 ? <Hint style={{ padding: '0 4px' }}>{rows.length - 60} more in `all`.</Hint> : null}
        <FunctionTiles nav={nav} tiles={[{ fn: 'chart', sub: 'names bound, by week' }, { fn: 'peers', sub: 'every book' }, { fn: 'diag', sub: 'the instruments' }]} />
        <Card style={{ padding: '2px 0' }}><KV k="dead ceilings this week" hint="books whose cap no bid reached" v={count((world.state.lastWeekDeadCeilingBooks ?? []).length)} /></Card>
      </>
    );
  },
});
