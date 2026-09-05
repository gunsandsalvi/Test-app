/** AU · object: index — a market index: what it is made of, and the funds that track it. */

import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid, Table } from '../ui';
import { pctLevel, count } from '../format';
import { World } from '../world';
import { ObjectHeader, FunctionTiles, words } from './common';
import { instrumentRef, instrumentName } from './book';

export interface MarketIndex { id: string; constituents: { instrumentId: string; weight: number }[] }

function indexesOf(world: World): MarketIndex[] {
  const raw = world.state.marketIndexes;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : Object.values(raw)) as MarketIndex[];
}

export const index = defineObject<MarketIndex>({
  type: 'index',
  words: ['index', 'indices'],
  searchable: true,
  find: (world, id) => indexesOf(world).find((x) => x.id === id),
  list: (world) => indexesOf(world).map((x) => ({ id: x.id, obj: x })),
  label: (_w, id) => ({ ticker: id, name: words(id), kind: 'market index', region: id.split('_')[0] }),
  keywords: (_w, id) => [words(id), 'index', 'benchmark', id.split('_')[0].toLowerCase()],
  headline: (_w, _id, x) => ({ value: count(x.constituents.length), sub: 'names' }),
  peers: {
    groups: (world) => [{ name: 'all indices', ids: indexesOf(world).map((x) => x.id) }],
    defaultSort: 'names',
    columns: [
      { key: 'name', label: 'index', render: (r, _w, nav) => <Link to={{ type: 'index', id: r.id }} nav={nav}>{r.id}</Link>, value: (r) => r.id },
      { key: 'names', label: 'names', render: (r) => count(r.obj.constituents.length), value: (r) => r.obj.constituents.length },
      { key: 'top', label: 'top weight', render: (r) => pctLevel(Math.max(0, ...r.obj.constituents.map((c) => c.weight)), 1), value: (r) => Math.max(0, ...r.obj.constituents.map((c) => c.weight)) },
    ],
  },
  overview({ world, obj: x, nav }) {
    const trackers = world.state.institutionalEntities.filter((e) => e.etf?.indexId === x.id && !e.isDefaulted);
    const rows = [...x.constituents].sort((a, b) => b.weight - a.weight);
    return (
      <>
        <ObjectHeader name={words(x.id)} sub={<>market index · {count(x.constituents.length)} names · tracked by {trackers.length ? trackers.map((e, i) => <span key={e.id}>{i ? ', ' : ''}<Link to={{ type: 'institution', id: e.id }} nav={nav}>{e.ticker ?? e.id}</Link></span>) : 'no fund'}</>} />
        <StatGrid>
          <Stat label="names" value={count(x.constituents.length)} sub="constituents" />
          <Stat label="top weight" value={pctLevel(rows[0]?.weight ?? 0, 1)} sub={rows[0] ? instrumentName(world, rows[0].instrumentId) : ''} />
          <Stat label="top 10" value={pctLevel(rows.slice(0, 10).reduce((a, c) => a + c.weight, 0), 0)} sub="of the index" />
        </StatGrid>
        <Table rows={rows} keyOf={(r) => r.instrumentId} columns={[
          { key: 'name', label: 'name', render: (r) => { const ref = instrumentRef(world, r.instrumentId); return ref ? <Link to={ref} nav={nav}>{instrumentName(world, r.instrumentId)}</Link> : r.instrumentId; } },
          { key: 'w', label: 'weight', render: (r) => pctLevel(r.weight, 2) },
        ]} />
        <Card style={{ padding: '2px 0' }}>{trackers.map((e) => <KV key={e.id} k={<Link to={{ type: 'institution', id: e.id }} nav={nav}>{e.name}</Link>} hint="tracks this" v={pctLevel(e.etf?.expenseRatioAnnual, 2)} />)}</Card>
        <FunctionTiles nav={nav} tiles={[{ fn: 'peers', sub: 'all indices' }, { fn: 'all', sub: 'the stored record' }]} />
      </>
    );
  },
});
