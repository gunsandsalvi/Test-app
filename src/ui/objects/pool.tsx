import { RegionId } from '../../domain/geography';
import { poolCashOf } from '../../engine/ledger/accounts';
import { ensureV2 } from '../../engine2/world';
/** AU · object: pool — a region's small-business tier in one industry: the firms too small to name, as one book. */

import { SmePool } from '../../domain/region-macro';
import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { money, pctLevel, count } from '../format';
import { World, regionOf, tapeSeries } from '../world';
import { REGION_IDS } from '../../domain/geography';
import { INDUSTRY_REGISTRY } from '../../domain/industry-registry';
import { ObjectHeader, ChangeSub, FunctionTiles, AllRow, RegionLink, taped, words } from './common';
import { marketId } from './market';

export type Pool = { region: string; pool: SmePool };
export const poolId = (region: string, industry: string): string => `${region}:${industry}`;

function poolOf(world: World, id: string): Pool | undefined {
  const i = id.indexOf(':');
  const region = id.slice(0, i); const industry = id.slice(i + 1);
  const p = regionOf(world, region)?.smePools?.find((x) => x.industry === industry);
  return p ? { region, pool: p } : undefined;
}

export const pool = defineObject<Pool>({
  type: 'pool',
  words: ['pool', 'pools'],
  searchable: true,
  find: poolOf,
  list: (world) => REGION_IDS.flatMap((r) => (world.state.regions[r]?.smePools ?? []).map((p) => ({ id: poolId(r, p.industry), obj: { region: r, pool: p } }))),
  label: (_w, _id, p) => ({ ticker: `${p.region} ${words(p.pool.industry)} pool`, name: `${words(p.pool.industry)} small businesses, ${p.region}`, kind: 'small-business pool', region: p.region }),
  keywords: (_w, _id, p) => [p.region.toLowerCase(), words(p.pool.industry), 'sme', 'small business'],
  parse: (world, phrase) => {
    const p = phrase.trim().toLowerCase().replace(/\s+pool$/, '');
    for (const r of REGION_IDS) {
      const rl = r.toLowerCase();
      if (!p.startsWith(rl + ' ')) continue;
      const rest = p.slice(rl.length + 1);
      const pools = world.state.regions[r]?.smePools ?? [];
      const hit = pools.find((x) => words(x.industry) === rest || x.industry.toLowerCase() === rest) ?? (pools.filter((x) => words(x.industry).endsWith(' ' + rest) || words(x.industry).startsWith(rest + ' ')).length === 1 ? pools.find((x) => words(x.industry).endsWith(' ' + rest) || words(x.industry).startsWith(rest + ' ')) : undefined);
      if (hit) return poolId(r, hit.industry);
    }
    return undefined;
  },
  headline: (_w, _id, p) => ({ value: pctLevel(p.pool.marginPct), sub: 'margin', neg: p.pool.marginPct < 0 }),
  series: (world, id) => [
    taped(world, `pool:${id}:revenue`, 'revenue', 'USD, annualised', (v) => money(v)),
    taped(world, `pool:${id}:margin`, 'margin', 'share of revenue', (v) => pctLevel(v)),
    taped(world, `pool:${id}:employment`, 'employment', 'people', (v) => count(Math.round(v))),
    taped(world, `pool:${id}:default rate`, 'default rate', 'annual', (v) => pctLevel(v, 2)),
    taped(world, `pool:${id}:cash`, 'cash', 'USD', (v) => money(v)),
  ],
  peers: {
    groups: (world, _id, p) => [
      { name: `${p.region} pools`, ids: (world.state.regions[p.region as 'USA']?.smePools ?? []).map((x) => poolId(p.region, x.industry)) },
      { name: `${words(p.pool.industry)} everywhere`, ids: REGION_IDS.filter((r) => world.state.regions[r]?.smePools?.some((x) => x.industry === p.pool.industry)).map((r) => poolId(r, p.pool.industry)) },
    ],
    defaultSort: 'revenue',
    columns: [
      { key: 'name', label: 'pool', width: 1.7, render: (r, _w, nav) => <Link to={{ type: 'pool', id: r.id }} nav={nav}>{words(r.obj.pool.industry)}</Link>, value: (r) => r.obj.pool.industry },
      { key: 'region', label: 'reg', width: 0.55, render: (r) => r.obj.region, value: (r) => r.obj.region },
      { key: 'revenue', label: 'revenue', render: (r) => money(r.obj.pool.annualRevenueLocal), value: (r) => r.obj.pool.annualRevenueLocal },
      { key: 'margin', label: 'margin', render: (r) => pctLevel(r.obj.pool.marginPct, 0), value: (r) => r.obj.pool.marginPct },
      { key: 'people', label: 'people', render: (r) => count(Math.round(r.obj.pool.employment)), value: (r) => r.obj.pool.employment },
      { key: 'pd', label: 'pd', render: (r) => pctLevel(r.obj.pool.defaultRateAnnualPct, 1), value: (r) => r.obj.pool.defaultRateAnnualPct },
    ],
  },
  overview({ world, ref, obj: p, nav }) {
    const s = p.pool;
    const rev = tapeSeries(world, `pool:${ref.id}:revenue`).values;
    const subUnits = INDUSTRY_REGISTRY[s.industry as keyof typeof INDUSTRY_REGISTRY]?.subUnits ?? [];
    const sales = s.salesDerivedAnnualRevenueUSDBySubUnit ?? {};
    const named = world.state.companies.filter((c) => c.region === p.region && c.listingStatus === 'PRIVATE' && c.smePoolIndustry === s.industry && !c.isDefaulted);
    return (
      <>
        <ObjectHeader name={`${words(s.industry)} small businesses`} sub={<><RegionLink id={p.region} nav={nav} /> · the firms too small to name, as one book · {count(Math.round(s.employment))} people</>} />
        <StatGrid>
          <Stat label="revenue" value={money(s.annualRevenueLocal)} sub={<ChangeSub series={rev} />} />
          <Stat label="margin" value={pctLevel(s.marginPct)} sub="measured on receipts" neg={s.marginPct < 0} />
          <Stat label="default rate" value={pctLevel(s.defaultRateAnnualPct, 1)} sub={`${pctLevel(s.distressedFirmShare ?? 0, 0)} distressed`} neg={(s.defaultRateAnnualPct ?? 0) > 0.05} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="debt" hint={`${((s.blendedMarginBps ?? 0)).toFixed(0)}bp over policy`} v={money(s.debtLocal)} />
          <KV k="cash" v={money(poolCashOf(ensureV2(world.state), p.region as RegionId, s.industry))} />
          <KV k="investment" hint="annualised" v={money(s.capexLocal)} />
          <KV k="tax accrued" v={money(s.accruedTaxLocal)} />
          <KV k="named firms carved out" v={count(named.length)} />
        </Card>
        <Card style={{ padding: '2px 0' }}>
          {subUnits.map((su) => (
            <KV key={su.unitId} k={<Link to={{ type: 'market', id: marketId(p.region, su.unitId) }} nav={nav}>{words(su.unitId)}</Link>} hint="sells into" v={money(sales[su.unitId])} />
          ))}
        </Card>
        <FunctionTiles nav={nav} tiles={[
          { fn: 'chart', sub: 'revenue · margin · employment · default rate' },
          { fn: 'peers', sub: `the ${p.region} pools` },
          { fn: 'news', sub: 'entrants carved from this pool' },
        ]} />
        <AllRow fields={Object.keys(s).length} nav={nav} />
      </>
    );
  },
});
