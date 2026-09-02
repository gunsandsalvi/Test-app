/** AU · object: commodity — a physical, priced in its own unit, with a curve and a stock. */

import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { pctLevel, num, count } from '../format';
import { ObjectHeader, ChangeSub, FunctionTiles, AllRow, ringed, words } from './common';

type Commodity = import('../../types').GameState['commodities'][number];

const balanceWord = (b: Commodity['supplyDemandBalance']): string => (b.startsWith('Deficit') ? 'tight' : b.startsWith('Surplus') ? 'oversupplied' : 'balanced');
const balanceRank = (b: Commodity['supplyDemandBalance']): number => (b.startsWith('Deficit') ? -1 : b.startsWith('Surplus') ? 1 : 0);

export const commodity = defineObject<Commodity>({
  type: 'commodity',
  words: ['commodity', 'commodities'],
  searchable: true,
  find: (world, id) => world.state.commodities.find((c) => c.id === id),
  list: (world) => world.state.commodities.map((c) => ({ id: c.id, obj: c })),
  label: (_w, _id, c) => ({ ticker: c.symbol, name: c.name, kind: `commodity · ${c.category.toLowerCase()}` }),
  keywords: (_w, _id, c) => [c.name.toLowerCase(), words(c.id), c.category.toLowerCase(), 'commodity'],
  parse: (world, phrase) => {
    const p = phrase.trim().toLowerCase();
    const exact = world.state.commodities.find((c) => c.name.toLowerCase() === p || words(c.id) === p || c.symbol.toLowerCase() === p);
    if (exact) return exact.id;
    const byWord = world.state.commodities.filter((c) => c.name.toLowerCase().split(/\s+/).includes(p));
    return byWord.length === 1 ? byWord[0].id : undefined;
  },
  headline: (_w, _id, c) => ({ value: num(c.spotPrice), sub: c.unit }),
  series: (world, _id, c) => [ringed(world, c.historicalPrices ?? [], 'spot', c.unit, (v) => num(v))],
  peers: {
    groups: (world) => [{ name: 'all commodities', ids: world.state.commodities.map((c) => c.id) }],
    defaultSort: 'move',
    columns: [
      { key: 'name', label: 'commodity', render: (r, _w, nav) => <Link to={{ type: 'commodity', id: r.id }} nav={nav}>{r.obj.name}</Link>, value: (r) => r.obj.name },
      { key: 'spot', label: 'spot', render: (r) => num(r.obj.spotPrice), value: (r) => r.obj.spotPrice },
      { key: 'unit', label: 'unit', render: (r) => r.obj.unit, value: (r) => r.obj.unit },
      { key: 'move', label: '1w', render: (r) => pctLevel(r.obj.change1W, 1), value: (r) => r.obj.change1W },
      { key: 'bal', label: 'balance', render: (r) => balanceWord(r.obj.supplyDemandBalance), value: (r) => balanceRank(r.obj.supplyDemandBalance) },
      { key: 'stock', label: 'stock', render: (r) => pctLevel(r.obj.inventoryLevelPct, 0), value: (r) => r.obj.inventoryLevelPct },
    ],
  },
  overview({ obj: c, nav }) {
    const hist = c.historicalPrices ?? [];
    return (
      <>
        <ObjectHeader name={c.name} sub={<>commodity · {c.category.toLowerCase()} · priced in {c.unit}</>} />
        <StatGrid>
          <Stat label="spot" value={num(c.spotPrice)} sub={<ChangeSub series={hist} />} />
          <Stat label="3m forward" value={num(c.futures3M)} sub={c.spotPrice > 0 ? `${pctLevel(c.futures3M / c.spotPrice - 1)} vs spot` : ''} />
          <Stat label="balance" value={balanceWord(c.supplyDemandBalance)} sub={`stock ${pctLevel(c.inventoryLevelPct, 0)}`} neg={balanceRank(c.supplyDemandBalance) < 0} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="curve" hint="1m · 3m · 6m" v={`${num(c.futures1M)} · ${num(c.futures3M)} · ${num(c.futures6M)}`} />
          <KV k="convenience yield" v={pctLevel(c.convenienceYield, 2)} />
          <KV k="volatility" hint="annualised" v={pctLevel(c.volatility, 0)} />
          <KV k="weekly supply · demand" hint="units" v={`${count(Math.round(c.weeklySupplyUnits ?? 0))} · ${count(Math.round(c.weeklyDemandUnits ?? 0))}`} />
          <KV k="baseline price" hint="all-time" v={num(c.allTimeBaselinePrice)} />
        </Card>
        <FunctionTiles nav={nav} tiles={[
          { fn: 'chart', sub: 'spot' },
          { fn: 'contracts', sub: 'the futures on it' },
          { fn: 'peers', sub: 'all commodities' },
        ]} />
        <AllRow fields={Object.keys(c).length} nav={nav} />
      </>
    );
  },
});
