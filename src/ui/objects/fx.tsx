/** AU · object: fx — a currency pair: the rate, its history, the basis. */

import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { pctLevel, pct, num, bps } from '../format';
import { ObjectHeader, ChangeSub, FunctionTiles, AllRow, RegionLink, ringed } from './common';

type FxPair = import('../../types').GameState['fxPairs'][number];

/** §3.17b-iv-b: the two bases a pair carries, both cleared — the FUNDING basis the quote region's
 *  banks pay to borrow the base money for a term (`Region.xcsBasisBps`), and the FORWARD basis a
 *  quote-region holder pays to hedge it, the funding basis plus the desks' charge
 *  (`Region.crossCurrencyBasisBps`). Undefined until a book has printed. */
const fundingBasisOf = (world: import('../world').World, p: FxPair): number | undefined => world.state.regions[p.quote as 'USA']?.xcsBasisBps?.[p.base];
const forwardBasisOf = (world: import('../world').World, p: FxPair): number | undefined => world.state.regions[p.quote as 'USA']?.crossCurrencyBasisBps?.[p.base];

/** §3.15-iii: `change1W` is an ABSOLUTE move in the rate; the move shown is that over the prior rate. */
const weeklyMove = (p: FxPair): number | undefined => { const prior = p.rate - p.change1W; return prior > 0 ? p.change1W / prior : undefined; };

export const fx = defineObject<FxPair>({
  type: 'fx',
  words: ['pair', 'pairs'],
  searchable: true,
  find: (world, id) => world.state.fxPairs.find((p) => p.pair === id),
  list: (world) => world.state.fxPairs.map((p) => ({ id: p.pair, obj: p })),
  label: (_w, _id, p) => ({ ticker: p.pair, name: `${p.base} against ${p.quote}`, kind: 'currency pair' }),
  keywords: (_w, _id, p) => [p.pair.toLowerCase(), p.pair.toLowerCase().replace('/', ''), p.pair.toLowerCase().replace('/', ' '), 'fx', 'currency'],
  parse: (world, phrase) => { const p = phrase.trim().toLowerCase().replace(/[\s/]+/g, ''); return world.state.fxPairs.find((x) => x.pair.toLowerCase().replace('/', '') === p)?.pair; },
  headline: (_w, _id, p) => ({ value: num(p.rate, 4), sub: p.pair }),
  series: (world, _id, p) => [ringed(world, p.historicalRates ?? [], 'rate', `${p.quote} per ${p.base}`, (v) => num(v, 4))],
  peers: {
    groups: (world) => [{ name: 'all pairs', ids: world.state.fxPairs.map((p) => p.pair) }],
    defaultSort: 'move',
    columns: [
      { key: 'name', label: 'pair', render: (r, _w, nav) => <Link to={{ type: 'fx', id: r.id }} nav={nav}>{r.obj.pair}</Link>, value: (r) => r.obj.pair },
      { key: 'rate', label: 'rate', render: (r) => num(r.obj.rate, 4), value: (r) => r.obj.rate },
      { key: 'move', label: '1w', render: (r) => pct(weeklyMove(r.obj), 2), value: (r) => weeklyMove(r.obj) ?? 0 },
      { key: 'basis', label: 'funding basis bp', render: (r, w) => bps(fundingBasisOf(w, r.obj)), value: (r, w) => fundingBasisOf(w, r.obj) ?? 0 },
    ],
  },
  overview({ world, obj: p, nav }) {
    const ill = world.state.fxPairIlliquidity[p.pair];
    return (
      <>
        <ObjectHeader name={p.pair} sub={<>currency pair · <RegionLink id={p.base} nav={nav} /> against <RegionLink id={p.quote} nav={nav} /></>} />
        <StatGrid>
          <Stat label="rate" value={num(p.rate, 4)} sub={<ChangeSub series={p.historicalRates ?? []} />} />
          <Stat label="1 week" value={pct(weeklyMove(p), 2)} sub={`move · ${num(p.change1W, 4)} in the rate`} neg={p.change1W < 0} />
          <Stat label="funding basis" value={`${bps(fundingBasisOf(world, p))}bp`} sub={`${p.quote} banks borrowing ${p.base} money`} />
          <Stat label="forward basis" value={`${bps(forwardBasisOf(world, p))}bp`} sub={`a ${p.quote} holder hedging ${p.base}`} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="illiquidity" hint="the dealer's measure" v={ill !== undefined ? num(ill, 3) : '—'} />
          <KV k="policy rates" hint={`${p.base} · ${p.quote}`} v={`${pctLevel(world.state.regions[p.base as 'USA']?.policyRate, 2)} · ${pctLevel(world.state.regions[p.quote as 'USA']?.policyRate, 2)}`} />
        </Card>
        <FunctionTiles nav={nav} tiles={[
          { fn: 'chart', sub: 'the rate' },
          { fn: 'contracts', sub: 'forwards on it' },
          { fn: 'peers', sub: 'all pairs' },
        ]} />
        <AllRow fields={Object.keys(p).length} nav={nav} />
      </>
    );
  },
});
