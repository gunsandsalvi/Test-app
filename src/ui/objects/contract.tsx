/** AU · object: contract — one derivative contract on the one book: a swap, a CDS, a future, a forward. Reached from a party or a class. */

import { DerivativeContract, DerivativeParty } from '../../domain/derivatives/contract';
import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { money, pctLevel, num } from '../format';
import { formatDate, formatSpan } from '../calendar';
import { World, displayWeek } from '../world';
import { ObjectRef } from '../types';
import { ObjectHeader, FunctionTiles, AllRow, RegionLink, words } from './common';

export function partyRef(world: World, p: DerivativeParty): ObjectRef | undefined {
  if (p.kind === 'INSTITUTION') return { type: 'institution', id: p.id };
  const c = world.state.companies.find((x) => x.ticker === p.ticker);
  return c ? { type: 'company', id: c.id } : undefined;
}
export const partyTicker = (p: DerivativeParty): string => (p.kind === 'INSTITUTION' ? p.id : p.ticker);
/** The party's handle as the world shows it: a fund's ticker, a firm's ticker. */
export function partyName(world: World, p: DerivativeParty): string {
  if (p.kind === 'INSTITUTION') return world.state.institutionalEntities.find((e) => e.id === p.id)?.ticker ?? p.id;
  return p.ticker;
}

const CLASS_WORDS: Record<string, string> = { IRS: 'interest-rate swap', CDS: 'credit default swap', COMMODITY_FUTURE: 'commodity future', FX_FORWARD: 'fx forward' };
export const classWord = (id: string): string => CLASS_WORDS[id] ?? words(id);

export const contract = defineObject<DerivativeContract>({
  type: 'contract',
  words: ['contract', 'contracts'],
  searchable: false,
  find: (world, id) => (world.state.derivativesBook ?? []).find((k) => k.id === id),
  list: () => [],
  label: (world, _id, k) => ({ ticker: `${classWord(k.classId)} · ${partyName(world, k.a)} × ${partyName(world, k.b)}`, name: `${money(k.notional)} ${classWord(k.classId)} between ${partyName(world, k.a)} and ${partyName(world, k.b)}`, kind: classWord(k.classId), region: k.regionId }),
  headline: (_w, _id, k) => ({ value: money(k.notional), sub: classWord(k.classId) }),
  overview({ world, obj: k, nav }) {
    const a = partyRef(world, k.a); const b = partyRef(world, k.b);
    const left = k.maturityWeek - world.state.currentWeek;
    const ref = k.referenceId ? (world.state.commodities.find((c) => c.id === k.referenceId) ? { type: 'commodity' as const, id: k.referenceId } : world.state.companies.find((c) => c.id === k.referenceId) ? { type: 'company' as const, id: k.referenceId } : undefined) : undefined;
    return (
      <>
        <ObjectHeader name={`${classWord(k.classId)}, ${partyName(world, k.a)} × ${partyName(world, k.b)}`} sub={<><RegionLink id={k.regionId} nav={nav} />{k.termKey ? ` · ${k.termKey}` : ''} · {k.id}</>} />
        <StatGrid>
          <Stat label="notional" value={money(k.notional)} sub={k.units !== undefined ? `${num(k.units, 0)} units` : ''} />
          <Stat label={k.classId === 'IRS' ? 'fixed rate' : k.classId === 'CDS' ? 'spread' : 'strike'} value={k.classId === 'IRS' || k.classId === 'CDS' ? pctLevel(k.strike, k.classId === 'CDS' ? 2 : 3) : num(k.strike, 4)} sub="struck at" />
          <Stat label="matures" value={formatDate(displayWeek(world.state, k.maturityWeek))} sub={left > 0 ? `in ${formatSpan(left)}` : 'due'} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="party a" hint={k.classId === 'IRS' ? 'pays fixed' : k.classId === 'CDS' ? 'buys protection' : 'long'} v={a ? <Link to={a} nav={nav}>{partyName(world, k.a)}</Link> : partyName(world, k.a)} />
          <KV k="party b" hint={k.classId === 'IRS' ? 'receives fixed' : k.classId === 'CDS' ? 'sells protection' : 'short'} v={b ? <Link to={b} nav={nav}>{partyName(world, k.b)}</Link> : partyName(world, k.b)} />
          {k.referenceId ? <KV k="reference" v={ref ? <Link to={ref} nav={nav}>{k.referenceId}</Link> : k.referenceId} /> : null}
          <KV k="struck" v={formatDate(displayWeek(world.state, k.struckWeek))} />
          {k.settledMarkLocal !== undefined ? <KV k="settled mark" v={money(k.settledMarkLocal)} /> : null}
        </Card>
        <FunctionTiles nav={nav} tiles={[{ fn: 'all', sub: 'the stored record' }]} />
        <AllRow fields={Object.keys(k).length} nav={nav} />
      </>
    );
  },
});
