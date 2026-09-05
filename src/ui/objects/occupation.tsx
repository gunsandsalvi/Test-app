/** AU · object: occupation — one occupation's labour market in one region: the going wage, who is employed, the vacancies. */

import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { pctLevel, num, count } from '../format';
import { World, regionOf, tapeSeries } from '../world';
import { REGION_IDS } from '../../domain/geography';
import { ObjectHeader, ChangeSub, FunctionTiles, AllRow, RegionLink, taped, words } from './common';
import { cohortId } from './cohort';

import { OccupationPool, OccupationType } from '../../domain/region-macro';
type OccPool = OccupationPool;
const poolsOf = (r: ReturnType<typeof regionOf>): Record<string, OccPool> => (r?.occupationPools ?? {}) as Partial<Record<OccupationType, OccPool>> as Record<string, OccPool>;
export type Occupation = { region: string; occ: string; p: OccPool };
const occupationId = (region: string, occ: string): string => `${region}:${occ}`;

function occOf(world: World, id: string): Occupation | undefined {
  const [region, occ] = id.split(':');
  const p = poolsOf(regionOf(world, region))[occ];
  return p ? { region, occ, p } : undefined;
}

export const occupation = defineObject<Occupation>({
  type: 'occupation',
  words: ['occupation', 'occupations'],
  searchable: true,
  find: occOf,
  list: (world) => REGION_IDS.flatMap((r) => Object.entries(poolsOf(world.state.regions[r])).map(([occ, p]) => ({ id: occupationId(r, occ), obj: { region: r, occ, p } }))),
  parse: (world, phrase) => { const p = phrase.trim().toLowerCase().replace(/\s+/g, ' '); for (const r of REGION_IDS) { const rl = r.toLowerCase(); if (!p.startsWith(rl + ' ')) continue; const rest = p.slice(rl.length + 1); const occ = Object.keys(poolsOf(world.state.regions[r])).find((o) => words(o) === rest || o.toLowerCase() === rest); if (occ) return occupationId(r, occ); } return undefined; },
  label: (_w, _id, o) => ({ ticker: `${o.region} ${words(o.occ)}`, name: `${words(o.occ)} labour market, ${o.region}`, kind: 'occupation', region: o.region }),
  keywords: (_w, _id, o) => [o.region.toLowerCase(), words(o.occ), 'labour', 'labor', 'wages', 'jobs'],
  headline: (_w, _id, o) => ({ value: num(o.p.wageIndex, 3), sub: 'wage index' }),
  series: (world, id) => [
    taped(world, `occupation:${id}:wage index`, 'wage index', 'going rate, seed = 1', (v) => num(v, 3)),
    taped(world, `occupation:${id}:employed`, 'employed', 'people', (v) => count(Math.round(v))),
    taped(world, `occupation:${id}:vacancies`, 'vacancies', 'open', (v) => count(Math.round(v))),
  ],
  peers: {
    groups: (world, _id, o) => [
      { name: `${o.region} occupations`, ids: Object.keys(poolsOf(world.state.regions[o.region as 'USA'])).map((occ) => occupationId(o.region, occ)) },
      { name: `${words(o.occ)} everywhere`, ids: REGION_IDS.filter((r) => poolsOf(world.state.regions[r])[o.occ]).map((r) => occupationId(r, o.occ)) },
    ],
    defaultSort: 'employed',
    columns: [
      { key: 'name', label: 'occupation', width: 1.7, render: (r, _w, nav) => <Link to={{ type: 'occupation', id: r.id }} nav={nav}>{words(r.obj.occ)}</Link>, value: (r) => r.obj.occ },
      { key: 'region', label: 'reg', width: 0.55, render: (r) => r.obj.region, value: (r) => r.obj.region },
      { key: 'wage', label: 'wage', render: (r) => num(r.obj.p.wageIndex, 3), value: (r) => r.obj.p.wageIndex },
      { key: 'growth', label: 'w y/y', render: (r) => pctLevel(r.obj.p.wageGrowthAnnual), value: (r) => r.obj.p.wageGrowthAnnual },
      { key: 'employed', label: 'jobs', render: (r) => count(Math.round(r.obj.p.employed)), value: (r) => r.obj.p.employed },
      { key: 'vac', label: 'open', render: (r) => count(Math.round(r.obj.p.vacancies ?? 0)), value: (r) => r.obj.p.vacancies ?? 0 },
    ],
  },
  overview({ world, ref, obj: o, nav }) {
    const p = o.p;
    const wage = tapeSeries(world, `occupation:${ref.id}:wage index`).values;
    const cohorts = (world.state.regions[o.region as 'USA']?.householdState?.cohorts ?? []).filter((c) => c.occupation === o.occ);
    const earners = cohorts.reduce((a, c) => a + c.earnerCount, 0);
    return (
      <>
        <ObjectHeader name={`${words(o.occ)}, ${o.region}`} sub={<>occupation · <RegionLink id={o.region} nav={nav} /> · {count(Math.round(p.employed))} employed of {count(Math.round(earners))} earners</>} />
        <StatGrid>
          <Stat label="wage index" value={num(p.wageIndex, 3)} sub={<ChangeSub series={wage} />} />
          <Stat label="wage growth" value={pctLevel(p.wageGrowthAnnual)} sub="annualised" />
          <Stat label="vacancies" value={count(Math.round(p.vacancies ?? 0))} sub={`hired ${count(Math.round(p.hiresThisWeek ?? 0))} · left ${count(Math.round(p.separationsThisWeek ?? 0))}`} />
          <Stat label="cleared bid" value={p.clearedWageIndex !== undefined ? pctLevel(p.clearedWageIndex - 1, 1) : '—'} sub={p.clearedWageIndex !== undefined ? 'vs the going rate, this week' : 'nothing filled this week'} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          {cohorts.map((c) => (
            <KV key={c.tier} k={<Link to={{ type: 'cohort', id: cohortId(o.region, c.occupation, c.tier) }} nav={nav}>{words(c.tier)}</Link>} hint={`${count(Math.round(c.earnerCount))} earners`} v={pctLevel(c.earnerCount > 0 ? 1 - c.employedCount / c.earnerCount : 0)} />
          ))}
        </Card>
        <FunctionTiles nav={nav} tiles={[
          { fn: 'chart', sub: 'wage index · employed · vacancies' },
          { fn: 'peers', sub: `the ${o.region} occupations` },
        ]} />
        <AllRow fields={Object.keys(p).length} nav={nav} />
      </>
    );
  },
});
