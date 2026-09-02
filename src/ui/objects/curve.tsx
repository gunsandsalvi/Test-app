/** AU · object: curve — a region's sovereign zero curve, with the policy and repo rates it hangs off. */

import { Region } from '../../types';
import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { pctLevel, pct } from '../format';
import { regionOf, tapeSeries } from '../world';
import { REGION_IDS } from '../../domain/geography';
import { ObjectHeader, FunctionTiles, AllRow, RegionLink, taped } from './common';

export const TENORS = ['3M', '2Y', '5Y', '10Y', '30Y'] as const;
export const tenorRate = (r: Region, t: string): number | undefined => r.zeroRates?.[`tenor${t}` as keyof Region['zeroRates']];

export const curve = defineObject<Region>({
  type: 'curve',
  words: ['curve', 'curves'],
  searchable: true,
  find: regionOf,
  list: (world) => REGION_IDS.map((r) => ({ id: r, obj: world.state.regions[r] })).filter((x) => !!x.obj),
  label: (_w, id) => ({ ticker: `${id} curve`, name: `${id} sovereign curve`, kind: 'sovereign curve', region: id }),
  keywords: (_w, id) => [id.toLowerCase(), 'curve', 'yields', 'rates', 'sovereign'],
  parse: (world, phrase) => { const p = phrase.trim().toLowerCase(); const m = p.match(/^([a-z]+) (curve|yields|rates)$/); return m && world.state.regions[m[1].toUpperCase() as 'USA'] ? m[1].toUpperCase() : undefined; },
  headline: (_w, _id, r) => ({ value: pctLevel(r.zeroRates?.tenor10Y, 2), sub: '10y' }),
  series: (world, id) => [
    ...TENORS.map((t) => taped(world, `curve:${id}:${t}`, t.toLowerCase(), 'zero yield', (v) => pctLevel(v, 2))),
    taped(world, `region:${id}:policy`, 'policy', 'rate', (v) => pctLevel(v, 2)),
    taped(world, `region:${id}:repo`, 'repo', 'overnight', (v) => pctLevel(v, 2)),
  ],
  peers: {
    groups: () => [{ name: 'the curves', ids: [...REGION_IDS] }],
    defaultSort: '10y',
    columns: [
      { key: 'name', label: 'curve', width: 0.8, render: (r, _w, nav) => <Link to={{ type: 'curve', id: r.id }} nav={nav}>{r.id}</Link>, value: (r) => r.id },
      { key: 'policy', label: 'policy', render: (r) => pctLevel(r.obj.policyRate, 2), value: (r) => r.obj.policyRate },
      { key: '2y', label: '2y', render: (r) => pctLevel(r.obj.zeroRates?.tenor2Y, 2), value: (r) => r.obj.zeroRates?.tenor2Y ?? 0 },
      { key: '10y', label: '10y', render: (r) => pctLevel(r.obj.zeroRates?.tenor10Y, 2), value: (r) => r.obj.zeroRates?.tenor10Y ?? 0 },
      { key: '30y', label: '30y', render: (r) => pctLevel(r.obj.zeroRates?.tenor30Y, 2), value: (r) => r.obj.zeroRates?.tenor30Y ?? 0 },
      { key: 'slope', label: '2s10s', render: (r) => `${Math.round(((r.obj.zeroRates?.tenor10Y ?? 0) - (r.obj.zeroRates?.tenor2Y ?? 0)) * 10_000)}bp`, value: (r) => (r.obj.zeroRates?.tenor10Y ?? 0) - (r.obj.zeroRates?.tenor2Y ?? 0) },
    ],
  },
  overview({ world, ref, obj: r, nav }) {
    const slope = (r.zeroRates?.tenor10Y ?? 0) - (r.zeroRates?.tenor2Y ?? 0);
    const ten = tapeSeries(world, `curve:${ref.id}:10Y`).values;
    const prev = ten[ten.length - 2];
    return (
      <>
        <ObjectHeader name={`${r.name} sovereign curve`} sub={<><RegionLink id={ref.id} nav={nav} /> · {r.centralBank} · sovereign {r.sovereignRating} · {slope < 0 ? 'inverted' : 'upward sloping'}</>} />
        <StatGrid>
          <Stat label="policy" value={pctLevel(r.policyRate, 2)} sub={`neutral ${pctLevel(r.neutralRate, 2)}`} />
          <Stat label="10y" value={pctLevel(r.zeroRates?.tenor10Y, 2)} sub={Number.isFinite(prev) ? `${pct((r.zeroRates?.tenor10Y ?? 0) - prev, 2)} this week` : ''} />
          <Stat label="2s10s" value={pct(slope, 2)} sub="slope" neg={slope < 0} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          {TENORS.map((t) => <KV key={t} k={t.toLowerCase()} v={pctLevel(tenorRate(r, t), 2)} />)}
          <KV k="overnight repo" v={pctLevel(r.repoRateAnnual, 2)} />
          <KV k="expected inflation" hint="the market's, annual" v={pctLevel(r.expectedInflation, 2)} />
          <KV k="dot plot" hint="1y · 2y" v={`${pctLevel(r.dotPlot1Y, 2)} · ${pctLevel(r.dotPlot2Y, 2)}`} />
        </Card>
        <FunctionTiles nav={nav} tiles={[
          { fn: 'curves', sub: 'the shape, every tenor' },
          { fn: 'chart', sub: 'each tenor over time' },
          { fn: 'holders', sub: 'who holds the paper' },
          { fn: 'ladder', sub: 'the sovereign tranches' },
          { fn: 'peers', sub: 'the four curves' },
        ]} />
        <AllRow fields={Object.keys(r.zeroRates ?? {}).length + 3} nav={nav} />
      </>
    );
  },
});
