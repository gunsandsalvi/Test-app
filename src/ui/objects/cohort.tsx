/** AU · object: cohort — the households of one occupation in one wealth tier of one region. */

import { HouseholdCohort } from '../../domain/region-macro';
import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { money, pctLevel, count } from '../format';
import { World, regionOf, tapeSeries } from '../world';
import { REGION_IDS } from '../../domain/geography';
import { ObjectHeader, ChangeSub, FunctionTiles, AllRow, RegionLink, taped, words } from './common';

export type Cohort = { region: string; c: HouseholdCohort };
export const cohortId = (region: string, occ: string, tier: string): string => `${region}:${occ}:${tier}`;
const TIER_WORDS: Record<string, string> = { BOTTOM_50: 'the bottom half', NEXT_40: 'the next 40%', TOP_9: 'the top 10%', TOP_1: 'the top 1%' };

function cohortOf(world: World, id: string): Cohort | undefined {
  const [region, occ, tier] = id.split(':');
  const c = regionOf(world, region)?.householdState.cohorts?.find((x) => x.occupation === occ && x.tier === tier);
  return c ? { region, c } : undefined;
}

export const cohort = defineObject<Cohort>({
  type: 'cohort',
  words: ['cohort', 'cohorts'],
  searchable: true,
  find: cohortOf,
  list: (world) => REGION_IDS.flatMap((r) => (world.state.regions[r].householdState.cohorts ?? []).map((c) => ({ id: cohortId(r, c.occupation, c.tier), obj: { region: r, c } }))),
  label: (_w, _id, x) => ({ ticker: `${x.region} ${words(x.c.occupation)} · ${TIER_WORDS[x.c.tier] ?? words(x.c.tier)}`, name: `${words(x.c.occupation)} households in ${TIER_WORDS[x.c.tier] ?? words(x.c.tier)}, ${x.region}`, kind: 'household cohort', region: x.region }),
  keywords: (_w, _id, x) => [x.region.toLowerCase(), words(x.c.occupation), words(x.c.tier), 'household', 'households'],
  headline: (_w, _id, x) => ({ value: pctLevel(x.c.earnerCount > 0 ? 1 - x.c.employedCount / x.c.earnerCount : 0), sub: 'out of work' }),
  series: (world, id) => [
    taped(world, `cohort:${id}:budget`, 'consumption budget', 'USD per week', (v) => money(v)),
    taped(world, `cohort:${id}:disposable income`, 'disposable income', 'USD per week', (v) => money(v)),
    taped(world, `cohort:${id}:employed`, 'employed', 'people', (v) => count(Math.round(v))),
    taped(world, `cohort:${id}:savings`, 'saving', 'USD per week', (v) => money(v)),
  ],
  peers: {
    groups: (world, _id, x) => [
      { name: `${x.region} cohorts`, ids: (world.state.regions[x.region as 'USA'].householdState.cohorts ?? []).map((c) => cohortId(x.region, c.occupation, c.tier)) },
      { name: `${words(x.c.occupation)} everywhere`, ids: REGION_IDS.flatMap((r) => (world.state.regions[r].householdState.cohorts ?? []).filter((c) => c.occupation === x.c.occupation).map((c) => cohortId(r, c.occupation, c.tier))) },
    ],
    defaultSort: 'earners',
    columns: [
      { key: 'name', label: 'cohort', width: 2, render: (r, _w, nav) => <Link to={{ type: 'cohort', id: r.id }} nav={nav}>{words(r.obj.c.occupation)} · {TIER_WORDS[r.obj.c.tier] ?? r.obj.c.tier}</Link>, value: (r) => r.obj.c.occupation },
      { key: 'earners', label: 'earners', render: (r) => count(Math.round(r.obj.c.earnerCount)), value: (r) => r.obj.c.earnerCount },
      { key: 'u', label: 'idle', render: (r) => pctLevel(r.obj.c.earnerCount > 0 ? 1 - r.obj.c.employedCount / r.obj.c.earnerCount : 0), value: (r) => (r.obj.c.earnerCount > 0 ? 1 - r.obj.c.employedCount / r.obj.c.earnerCount : 0) },
      { key: 'income', label: 'income', render: (r) => money(r.obj.c.disposableIncomeLocal), value: (r) => r.obj.c.disposableIncomeLocal },
      { key: 'budget', label: 'spend', render: (r) => money(r.obj.c.consumptionBudgetLocal), value: (r) => r.obj.c.consumptionBudgetLocal },
    ],
  },
  overview({ world, ref, obj: x, nav }) {
    const c = x.c;
    const budget = tapeSeries(world, `cohort:${ref.id}:budget`).values;
    const perHead = (usd: number) => (c.earnerCount > 0 ? money(usd * 52 / c.earnerCount, 0) : '—');
    return (
      <>
        <ObjectHeader name={`${words(c.occupation)} households, ${TIER_WORDS[c.tier] ?? words(c.tier)}`} sub={<><RegionLink id={x.region} nav={nav} /> · {count(Math.round(c.earnerCount))} earners · occupation <Link to={{ type: 'occupation', id: `${x.region}:${c.occupation}` }} nav={nav}>{words(c.occupation)}</Link></>} />
        <StatGrid>
          <Stat label="out of work" value={pctLevel(c.earnerCount > 0 ? 1 - c.employedCount / c.earnerCount : 0)} sub={`${count(Math.round(c.employedCount))} employed`} neg={c.earnerCount > 0 && 1 - c.employedCount / c.earnerCount > 0.1} />
          <Stat label="spend" value={money(c.consumptionBudgetLocal)} sub={<ChangeSub series={budget} />} />
          <Stat label="saving" value={c.disposableIncomeLocal > 0 ? pctLevel(c.savingsLocal / c.disposableIncomeLocal, 0) : '—'} sub="of disposable income" neg={c.savingsLocal < 0} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="wages" hint={`${perHead(c.wageIncomeLocal)} a year per earner`} v={money(c.wageIncomeLocal)} />
          <KV k="benefits" v={money(c.unemploymentBenefitsLocal)} />
          <KV k="transfers" v={money(c.transferIncomeLocal)} />
          <KV k="capital income" v={money(c.capitalIncomeLocal)} />
          <KV k="tax" v={money(c.taxLocal)} />
          <KV k="disposable income" hint="weekly" v={money(c.disposableIncomeLocal)} />
          <KV k="debt service" v={money(c.debtServiceLocal)} />
          <KV k="consumption tax paid" v={money(c.consumptionTaxLocal)} />
        </Card>
        <FunctionTiles nav={nav} tiles={[
          { fn: 'chart', sub: 'budget · income · employment · saving' },
          { fn: 'peers', sub: `the ${x.region} cohorts` },
        ]} />
        <AllRow fields={Object.keys(c).length} nav={nav} />
      </>
    );
  },
});
