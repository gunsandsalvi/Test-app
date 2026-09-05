/**
 * AU · the region's LISTS — `markets`, `pools`, `labour`, `banks`, `firms`, `funds`, `books`:
 * each the one screener over one kind, scoped to the region. A list function is four lines.
 */

import { FunctionModule } from '../fn';
import {Tabs, Card, KV } from '../ui';
import { pctLevel, num, count } from '../format';
import { regionOf } from '../world';
import { isActiveCompany, banksOf } from '../../domain/company';
import { moduleOf } from '../objects';
import { companyColumns } from '../objects/company';
import { Screener } from './screener';
import { SectionLabel } from '../objects/common';
import { asRegionId } from '../../domain/geography';

const inRegion = (type: 'market' | 'pool' | 'cohort' | 'occupation' | 'institution', world: import('../world').World, region: string): string[] =>
  moduleOf(type).list(world).filter((x) => (moduleOf(type).label(world, x.id, x.obj).region ?? '') === region).map((x) => x.id);

export const markets: FunctionModule = {
  name: 'markets', appliesTo: ['region'], blurb: 'every goods market here',
  render: ({ world, ref, nav }) => <Screener world={world} nav={nav} type="market" ids={inRegion('market', world, ref.id)} subtitle={ref.id} hide={['region']} />,
};

export const pools: FunctionModule = {
  name: 'pools', appliesTo: ['region'], blurb: 'the small-business pools',
  render: ({ world, ref, nav }) => <Screener world={world} nav={nav} type="pool" ids={inRegion('pool', world, ref.id)} subtitle={ref.id} hide={['region']} />,
};

export const banks: FunctionModule = {
  name: 'banks', appliesTo: ['region'], blurb: 'the banks here',
  render: ({ world, ref, nav }) => <Screener world={world} nav={nav} type="company" columns={companyColumns(true)} sort="cap" noun={['bank', 'banks']} hide={['region']}
    ids={banksOf(world.state.companies, asRegionId(ref.id)).map((c) => c.id)} subtitle={`${ref.id} banks`} />,
};

export const firms: FunctionModule = {
  name: 'firms', appliesTo: ['region'], blurb: 'the firms here', argKey: 'tab',
  render: ({ world, ref, args, nav }) => {
    const tabs = ['listed', 'private', 'defaulted'];
    const active = tabs.includes(args.tab) ? args.tab! : 'listed';
    const all = world.state.companies.filter((c) => c.region === ref.id && !c.isBankEntity);
    const ids = (active === 'listed' ? all.filter((c) => isActiveCompany(c) && c.listingStatus !== 'PRIVATE')
      : active === 'private' ? all.filter((c) => isActiveCompany(c) && c.listingStatus === 'PRIVATE')
        : all.filter((c) => c.isDefaulted)).map((c) => c.id);
    return (<>
      <Tabs items={tabs} active={active} onPick={(t) => nav.go('firms', { tab: t })} />
      <Screener world={world} nav={nav} type="company" columns={companyColumns(false)} sort={active === 'listed' ? 'mcap' : 'revenue'} ids={ids} subtitle={`${ref.id} · ${active}`} noun={['firm', 'firms']} hide={['region']} />
    </>);
  },
};

export const funds: FunctionModule = {
  name: 'funds', appliesTo: ['region'], blurb: 'the funds here', argKey: 'tab',
  render: ({ world, ref, args, nav }) => {
    const live = world.state.institutionalEntities.filter((e) => e.region === ref.id && !e.isDefaulted);
    const kinds = [...new Set(live.map((e) => e.entityType))].sort();
    const tabs = ['all', ...kinds.map((k) => k.toLowerCase().replace(/_/g, ' '))];
    const active = tabs.includes(args.tab) ? args.tab! : 'all';
    const ids = live.filter((e) => active === 'all' || e.entityType.toLowerCase().replace(/_/g, ' ') === active).map((e) => e.id);
    return (<>
      <Tabs items={tabs} active={active} onPick={(t) => nav.go('funds', { tab: t })} />
      <Screener world={world} nav={nav} type="institution" ids={ids} subtitle={`${ref.id} · ${active}`} hide={['region']} />
    </>);
  },
};

export const labour: FunctionModule = {
  name: 'labour', appliesTo: ['region'], blurb: 'occupations · cohorts', argKey: 'tab',
  render: ({ world, ref, args, nav }) => {
    const r = regionOf(world, ref.id);
    if (!r) return null;
    const tabs = ['occupations', 'cohorts'];
    const active = tabs.includes(args.tab) ? args.tab! : 'occupations';
    return (<>
      <Card style={{ padding: '2px 0' }}>
        <KV k="unemployment" hint={`nairu ${pctLevel(r.nairu)} · ${r.weeksAboveNairu > 0 ? `above it ${r.weeksAboveNairu} weeks` : 'at or under it'}`} v={pctLevel(r.unemploymentRate)} />
        <KV k="participation" v={pctLevel(r.laborForceParticipation, 0)} />
        <KV k="tightness" hint="vacancies per seeker" v={num(r.laborMarketTightness, 2)} />
        <KV k="vacancy rate" v={pctLevel(r.vacancyRate)} />
        <KV k="wage growth" hint="annualised" v={pctLevel(r.wageGrowthAnnual)} />
        <KV k="net migration" hint="annual, share of population" v={pctLevel(r.netMigrationRateAnnual, 2)} />
        <KV k="population" v={count(Math.round(r.totalPopulation))} />
      </Card>
      <SectionLabel>by {active === 'occupations' ? 'occupation' : 'cohort'}</SectionLabel>
      <Tabs items={tabs} active={active} onPick={(t) => nav.go('labour', { tab: t })} />
      {active === 'occupations'
        ? <Screener world={world} nav={nav} type="occupation" ids={inRegion('occupation', world, ref.id)} subtitle={ref.id} hide={['region']} />
        : <Screener world={world} nav={nav} type="cohort" ids={inRegion('cohort', world, ref.id)} subtitle={ref.id} hide={['region']} />}
    </>);
  },
};
