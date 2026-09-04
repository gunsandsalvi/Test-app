/** AU · object: estate — a defaulted firm's workout: what it had, who is owed, what has been paid. */

import { Estate, estateAssetsUSD } from '../../domain/estate';
import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid, Table } from '../ui';
import { money, pctLevel } from '../format';
import { formatDate } from '../calendar';
import { displayWeek } from '../world';
import { ObjectHeader, FunctionTiles, AllRow, RegionLink, words } from './common';

export const estate = defineObject<Estate>({
  type: 'estate',
  words: ['estate', 'estates'],
  searchable: true,
  find: (world, id) => (world.state.estates ?? []).find((e) => e.companyId === id || e.ticker === id),
  list: (world) => (world.state.estates ?? []).map((e) => ({ id: e.companyId, obj: e })),
  label: (_w, _id, e) => ({ ticker: `${e.ticker} estate`, name: `the estate of ${e.ticker}`, kind: e.closedWeek !== undefined ? 'estate, closed' : 'estate, in workout', region: e.regionId }),
  keywords: (_w, _id, e) => [e.ticker.toLowerCase(), 'estate', 'workout', 'bankruptcy', e.regionId.toLowerCase()],
  parse: (world, phrase) => { const m = phrase.trim().toLowerCase().match(/^([a-z0-9_]+) estate$/); return m ? (world.state.estates ?? []).find((e) => e.ticker.toLowerCase() === m[1])?.companyId : undefined; },
  headline: (_w, _id, e) => ({ value: money(e.distributedUSD), sub: 'distributed' }),
  peers: {
    groups: (world) => [{ name: 'all estates', ids: (world.state.estates ?? []).map((e) => e.companyId) }],
    defaultSort: 'owed',
    columns: [
      { key: 'name', label: 'estate', render: (r, _w, nav) => <Link to={{ type: 'estate', id: r.id }} nav={nav}>{r.obj.ticker}</Link>, value: (r) => r.obj.ticker },
      { key: 'region', label: 'region', render: (r) => r.obj.regionId, value: (r) => r.obj.regionId },
      { key: 'owed', label: 'claims', render: (r) => money(r.obj.claims.reduce((a, c) => a + c.principalLocal, 0)), value: (r) => r.obj.claims.reduce((a, c) => a + c.principalLocal, 0) },
      { key: 'paid', label: 'paid', render: (r) => money(r.obj.distributedUSD), value: (r) => r.obj.distributedUSD },
      { key: 'state', label: 'state', render: (r) => (r.obj.closedWeek !== undefined ? 'closed' : 'open'), value: (r) => (r.obj.closedWeek !== undefined ? 1 : 0) },
    ],
  },
  overview({ world, obj: e, nav }) {
    const owed = e.claims.reduce((a, c) => a + c.principalLocal, 0);
    const recovered = e.claims.reduce((a, c) => a + c.recoveredUSD, 0);
    const company = world.state.companies.find((c) => c.id === e.companyId);
    return (
      <>
        <ObjectHeader name={`the estate of ${company?.name ?? e.ticker}`} sub={<><Link to={{ type: 'company', id: e.companyId }} nav={nav}>{e.ticker}</Link> · <RegionLink id={e.regionId} nav={nav} /> · opened {formatDate(displayWeek(world.state, e.openedWeek))}{e.closedWeek !== undefined ? ` · closed ${formatDate(displayWeek(world.state, e.closedWeek))}` : ' · in workout'}</>} />
        <StatGrid>
          <Stat label="assets" value={money(estateAssetsUSD(e.assets))} sub="cash · receivables · stock · plant" />
          <Stat label="claims" value={money(owed)} sub={`${e.claims.length} claimants`} />
          <Stat label="recovered" value={owed > 0 ? pctLevel(recovered / owed, 0) : '—'} sub={`${money(e.distributedUSD)} distributed`} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="cash" v={money(e.assets.cashLocal)} />
          <KV k="receivables" v={money(e.assets.receivablesUSD)} />
          <KV k="inventory" v={money(e.assets.inventoryLocal)} />
          <KV k="plant" v={money(e.assets.ppeUSD)} />
        </Card>
        <Table rows={[...e.claims].sort((a, b) => b.principalLocal - a.principalLocal)} keyOf={(c) => `${JSON.stringify(c.holder)}:${c.principalLocal}`} columns={[
          { key: 'holder', label: 'claimant', render: (c) => { const h = c.holder as { kind: string; ticker?: string; id?: string; region?: string }; const key = h.ticker ?? h.id ?? h.region ?? h.kind; const ref = h.kind === 'INSTITUTION' && h.id ? { type: 'institution' as const, id: h.id } : world.state.companies.find((x) => x.ticker === h.ticker) ? { type: 'company' as const, id: world.state.companies.find((x) => x.ticker === h.ticker)!.id } : undefined; return ref ? <Link to={ref} nav={nav}>{key}</Link> : `${words(h.kind)} ${key}`; } },
          { key: 'kind', label: 'paper', render: (c) => words(String((c as { instrumentType?: string }).instrumentType ?? '')) },
          { key: 'owed', label: 'owed', render: (c) => money(c.principalLocal) },
          { key: 'got', label: 'got', render: (c) => money(c.recoveredUSD) },
        ]} />
        <FunctionTiles nav={nav} tiles={[{ fn: 'news', sub: 'the default and the workout' }, { fn: 'peers', sub: 'all estates' }]} />
        <AllRow fields={Object.keys(e).length} nav={nav} />
      </>
    );
  },
});
