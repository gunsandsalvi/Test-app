/** AU · object: offering — a primary-market deal in the pipeline: who is raising what, through whom, with what walk-away. */

import { PrimaryOffering } from '../../domain/primary-market';
import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { money, bps } from '../format';
import { formatDate } from '../calendar';
import { displayWeek } from '../world';
import { ObjectHeader, FunctionTiles, AllRow, RegionLink, words } from './common';

export const offering = defineObject<PrimaryOffering>({
  type: 'offering',
  words: ['offering', 'offerings'],
  searchable: false,
  find: (world, id) => (world.state.primaryOfferings ?? []).find((o) => o.id === id),
  list: (world) => (world.state.primaryOfferings ?? []).map((o) => ({ id: o.id, obj: o })),
  label: (_w, id, o) => ({ ticker: id, name: `${o.issuerTicker} ${words(o.instrumentType)} · ${money(o.sizeUSD)}`, kind: 'primary offering', region: o.region }),
  headline: (_w, _id, o) => ({ value: money(o.sizeUSD), sub: words(o.instrumentType) }),
  peers: {
    groups: (world, _id, o) => [
      { name: `${o.region} pipeline`, ids: (world.state.primaryOfferings ?? []).filter((x) => x.region === o.region).map((x) => x.id) },
      { name: 'the whole pipeline', ids: (world.state.primaryOfferings ?? []).map((x) => x.id) },
    ],
    defaultSort: 'size',
    columns: [
      { key: 'issuer', label: 'issuer', render: (r, world, nav) => { const c = world.state.companies.find((x) => x.id === r.obj.issuerId); return c ? <Link to={{ type: 'company', id: c.id }} nav={nav}>{r.obj.issuerTicker}</Link> : r.obj.issuerTicker; }, value: (r) => r.obj.issuerTicker },
      { key: 'type', label: 'paper', render: (r) => words(r.obj.instrumentType), value: (r) => r.obj.instrumentType },
      { key: 'size', label: 'size', render: (r) => money(r.obj.sizeUSD), value: (r) => r.obj.sizeUSD },
      { key: 'walk', label: 'walk-away', render: (r) => bps(r.obj.walkAwayStat), value: (r) => r.obj.walkAwayStat },
      { key: 'lead', label: 'lead', render: (r, world, nav) => { const b = world.state.companies.find((x) => x.ticker === r.obj.leadBankTicker); return b ? <Link to={{ type: 'company', id: b.id }} nav={nav}>{r.obj.leadBankTicker}</Link> : r.obj.leadBankTicker ?? '—'; }, value: (r) => r.obj.leadBankTicker ?? '' },
    ],
  },
  overview({ world, obj: o, nav }) {
    const issuer = world.state.companies.find((c) => c.id === o.issuerId);
    const lead = world.state.companies.find((c) => c.ticker === o.leadBankTicker);
    return (
      <>
        <ObjectHeader name={`${o.issuerTicker} ${words(o.instrumentType)}`} sub={<>primary offering · {words(o.purpose)} · <RegionLink id={o.region} nav={nav} /> · announced {formatDate(displayWeek(world.state, o.announcedWeek))}</>} />
        <StatGrid>
          <Stat label="size" value={money(o.sizeUSD)} sub={words(o.rateType ?? '')} />
          <Stat label="walk-away" value={`${bps(o.walkAwayStat)}bp`} sub="the issuer's own arithmetic" />
          <Stat label="lead bank" value={lead ? lead.ticker : o.leadBankTicker ?? '—'} sub="underwrites" />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="issuer" v={issuer ? <Link to={{ type: 'company', id: issuer.id }} nav={nav}>{issuer.name}</Link> : o.issuerTicker} />
          {lead ? <KV k="lead" v={<Link to={{ type: 'company', id: lead.id }} nav={nav}>{lead.name}</Link>} /> : null}
          <KV k="purpose" v={words(o.purpose)} />
        </Card>
        <FunctionTiles nav={nav} tiles={[{ fn: 'peers', sub: 'the pipeline' }, { fn: 'all', sub: 'the stored record' }]} />
        <AllRow fields={Object.keys(o).length} nav={nav} />
      </>
    );
  },
});
