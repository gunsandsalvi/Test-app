/** AU · sellers — a market's named sellers by share, with the pool that sells the rest. */

import { FunctionModule } from '../fn';
import { Card, Hint, KV, Link, Table, T } from '../ui';
import { money, pctLevel, count, num } from '../format';
import { regionOf } from '../world';
import { splitMarketId, sellersOf, subUnitLabel } from '../objects/market';
import { poolId } from '../objects/pool';
import { industryOfSubUnit } from '../../domain/industry-registry';
import { words } from '../objects/common';

export const sellers: FunctionModule = {
  name: 'sellers',
  appliesTo: ['market'],
  blurb: 'who sells here, by share',
  render({ world, ref, nav }) {
    const { region, subUnitId } = splitMarketId(ref.id);
    const rows = sellersOf(world, region, subUnitId);
    const named = rows.reduce((a, r) => a + (r.line.categoryMarketShare), 0);
    const ind = industryOfSubUnit(subUnitId);
    const pool = ind ? regionOf(world, region)?.smePools.find((p) => p.industry === ind) : undefined;
    const poolSales = pool?.salesDerivedAnnualRevenueUSDBySubUnit?.[subUnitId];
    const foreign = world.state.companies.filter((c) => c.region !== region && !c.isDefaulted && (c.productLines ?? []).some((l) => l.subUnitId === subUnitId)).length;
    return (<>
      <Card style={{ padding: '2px 0' }}>
        <KV k="named sellers" hint={`${pctLevel(named, 0)} of the market`} v={count(rows.length)} />
        {pool ? <KV k={<Link to={{ type: 'pool', id: poolId(region, pool.industry) }} nav={nav}>the pool</Link>} hint={`${words(pool.industry)} · small firms, unnamed`} v={poolSales !== undefined ? `${money(poolSales)} a year` : '—'} /> : null}
        <KV k="sellers abroad with a line" hint="ship in when the price pays" v={count(foreign)} />
      </Card>
      {rows.length === 0 ? <Card style={{ padding: 14, color: T.muted }}>no named firm sells {subUnitLabel(subUnitId)} in {region} — the pool and imports serve it.</Card> : (
        <Table rows={rows} keyOf={(r) => r.c.id} columns={[
          { key: 'name', label: 'seller', render: (r) => <Link to={{ type: 'company', id: r.c.id }} nav={nav}>{r.c.ticker}</Link> },
          { key: 'share', label: 'share', render: (r) => pctLevel(r.line.categoryMarketShare, 1) },
          { key: 'cap', label: 'cap', render: (r) => (r.line.weeklyCapacityUnits !== undefined ? count(Math.round(r.line.weeklyCapacityUnits)) : '—') },
          { key: 'sold', label: 'sold', render: (r) => { const s = r.c.lastWeekSalesUnitsBySubUnit?.[subUnitId]; return s !== undefined ? count(Math.round(s)) : '—'; } },
          { key: 'comp', label: 'edge', render: (r) => num(r.line.competitiveness, 2) },
          { key: 'rating', label: 'rating', render: (r) => r.c.creditRating },
        ]} />
      )}
      <Hint style={{ padding: '0 4px' }}>share is of the region's cleared demand; a seller's capacity is units a week its plant can make.</Hint>
    </>);
  },
};
