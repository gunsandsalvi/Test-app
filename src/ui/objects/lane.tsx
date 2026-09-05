/** AU · object: lane — a freight lane between two regions: what it costs to move a tonne, what is on it. */

import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { num, count, money } from '../format';
import { World } from '../world';
import { ObjectHeader, FunctionTiles, RegionLink } from './common';
import { ensureV2 } from '../../engine2/world';
import { tradeInvoicesOf } from '../../engine/ledger/contract-ledger';

export interface Lane { from: string; to: string; ratePerTonne: number; inTransitUnits: number; shipments: number; invoicesLocal: number }

function lanesOf(world: World): Map<string, Lane> {
  const out = new Map<string, Lane>();
  Object.entries(world.state.freightRatePerTonneLaneMoneyByLane ?? {}).forEach(([key, rate]) => {
    const [from, to] = key.split('>');
    out.set(key, { from, to, ratePerTonne: Number(rate) || 0, inTransitUnits: 0, shipments: 0, invoicesLocal: 0 });
  });
  const region = new Map<string, string>();
  world.state.companies.forEach((c) => region.set(c.ticker, c.region));
  (world.state.goodsInTransit ?? []).forEach((g) => {
    const from = region.get(String(g.sellerKey).replace(/^.*:/, '')) ?? String(g.sellerKey).slice(0, 3);
    const to = region.get(g.buyerId) ?? '?';
    const l = out.get(`${from}>${to}`);
    if (l) { l.inTransitUnits += g.units; l.shipments++; }
  });
  tradeInvoicesOf(ensureV2(world.state)).forEach((inv) => { const l = out.get(`${inv.sellerRegion}>${inv.buyerRegion}`); if (l) l.invoicesLocal += inv.amountCurrency * (inv.bookedUsdPerCurrency ?? 1); });
  return out;
}

export const lane = defineObject<Lane>({
  type: 'lane',
  words: ['lane', 'lanes'],
  searchable: true,
  find: (world, id) => lanesOf(world).get(id),
  list: (world) => [...lanesOf(world).entries()].map(([id, obj]) => ({ id, obj })),
  label: (_w, id, l) => ({ ticker: id, name: `${l.from} to ${l.to}`, kind: l.from === l.to ? 'domestic freight' : 'trade lane', region: l.from }),
  keywords: (_w, _id, l) => [l.from.toLowerCase(), l.to.toLowerCase(), 'lane', 'freight', 'trade', `${l.from.toLowerCase()} ${l.to.toLowerCase()}`],
  parse: (world, phrase) => { const m = phrase.trim().toLowerCase().match(/^([a-z]+)\s*(?:>|to)\s*([a-z]+)$/); if (!m) return undefined; const id = `${m[1].toUpperCase()}>${m[2].toUpperCase()}`; return lanesOf(world).has(id) ? id : undefined; },
  headline: (_w, _id, l) => ({ value: num(l.ratePerTonne), sub: 'per tonne' }),
  peers: {
    groups: (world, _id, l) => [
      { name: `from ${l.from}`, ids: [...lanesOf(world).keys()].filter((k) => k.startsWith(l.from + '>')) },
      { name: 'all lanes', ids: [...lanesOf(world).keys()] },
    ],
    defaultSort: 'invoices',
    columns: [
      { key: 'name', label: 'lane', render: (r, _w, nav) => <Link to={{ type: 'lane', id: r.id }} nav={nav}>{r.id}</Link>, value: (r) => r.id },
      { key: 'rate', label: 'per tonne', render: (r) => num(r.obj.ratePerTonne), value: (r) => r.obj.ratePerTonne },
      { key: 'transit', label: 'shipments', render: (r) => count(r.obj.shipments), value: (r) => r.obj.shipments },
      { key: 'invoices', label: 'invoiced', render: (r) => money(r.obj.invoicesLocal), value: (r) => r.obj.invoicesLocal },
    ],
  },
  overview({ obj: l, nav }) {
    return (
      <>
        <ObjectHeader name={`${l.from} → ${l.to}`} sub={<>{l.from === l.to ? 'domestic freight' : 'trade lane'} · <RegionLink id={l.from} nav={nav} /> to <RegionLink id={l.to} nav={nav} /></>} />
        <StatGrid>
          <Stat label="freight rate" value={num(l.ratePerTonne)} sub="money per tonne, cleared" />
          <Stat label="in transit" value={count(l.shipments)} sub={`${count(Math.round(l.inTransitUnits))} units`} />
          <Stat label="open invoices" value={money(l.invoicesLocal)} sub="booked on this lane" />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}><KV k="what moves a tonne here" hint="the carriers' clearing" v={num(l.ratePerTonne)} /></Card>
        <FunctionTiles nav={nav} tiles={[{ fn: 'peers', sub: 'every lane' }]} />
      </>
    );
  },
});
