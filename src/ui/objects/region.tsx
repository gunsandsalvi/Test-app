import { RegionId } from '../../domain/geography';
import { ensureV2 } from '../../engine2/world';
import { materializeGovLadder } from '../../engine2/tranches';
import { householdDepositsOf } from '../../engine/ledger/accounts';
/** AU · object: region — an economy: its people, prices, banks, treasury, central bank and markets. */

import { Region } from '../../types';
import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { money, pctLevel, num, count } from '../format';
import { regionOf, tapeSeries } from '../world';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { ObjectHeader, ChangeSub, FunctionTiles, AllRow, taped, ringed, words } from './common';

export const region = defineObject<Region>({
  type: 'region',
  words: ['region', 'regions'],
  searchable: true,
  find: regionOf,
  list: (world) => REGION_IDS.map((r) => ({ id: r, obj: world.state.regions[r] })).filter((x) => !!x.obj),
  label: (_w, id, r) => ({ ticker: id, name: r.name, kind: 'region' }),
  keywords: (_w, _id, r) => [r.name.toLowerCase(), r.currency.toLowerCase(), 'economy'],
  headline: (_w, _id, r) => ({ value: pctLevel(r.unemploymentRate), sub: 'unemployment', neg: r.unemploymentRate > r.nairu }),
  series: (world, id, r) => [
    taped(world, `region:${id}:unemployment`, 'unemployment', 'share of the labour force', (v) => pctLevel(v)),
    ringed(world, r.cpiHistory ?? [], 'cpi', 'index, seed = 100', (v) => num(v, 1)),
    taped(world, `region:${id}:inflation`, 'inflation', 'annualised', (v) => pctLevel(v)),
    taped(world, `region:${id}:gdp`, 'gdp', 'USD, annualised', (v) => money(v)),
    taped(world, `region:${id}:policy`, 'policy rate', 'rate', (v) => pctLevel(v, 2)),
    taped(world, `region:${id}:10y`, '10y', 'yield', (v) => pctLevel(v, 2)),
    taped(world, `region:${id}:2y`, '2y', 'yield', (v) => pctLevel(v, 2)),
    taped(world, `region:${id}:repo`, 'repo', 'overnight', (v) => pctLevel(v, 2)),
    taped(world, `region:${id}:wage growth`, 'wage growth', 'annualised', (v) => pctLevel(v)),
    taped(world, `region:${id}:tightness`, 'tightness', 'vacancies per seeker', (v) => num(v, 2)),
    taped(world, `region:${id}:household deposits`, 'household deposits', 'USD', (v) => money(v)),
    taped(world, `region:${id}:household net worth`, 'household net worth', 'USD', (v) => money(v)),
    taped(world, `region:${id}:bank nim`, 'bank nim', 'annual', (v) => pctLevel(v, 2)),
    taped(world, `region:${id}:bank capital`, 'bank capital', 'ratio', (v) => pctLevel(v)),
    taped(world, `region:${id}:government revenue`, 'government revenue', 'USD per week', (v) => money(v)),
    taped(world, `region:${id}:government outlays`, 'government outlays', 'USD per week', (v) => money(v)),
  ],
  peers: {
    groups: () => [{ name: 'the regions', ids: [...REGION_IDS] }],
    defaultSort: 'u',
    columns: [
      { key: 'name', label: 'region', render: (r, _w, nav) => <Link to={{ type: 'region', id: r.id }} nav={nav}>{r.id}</Link>, value: (r) => r.id },
      { key: 'u', label: 'u', render: (r) => pctLevel(r.obj.unemploymentRate), value: (r) => r.obj.unemploymentRate },
      { key: 'infl', label: 'inflation', render: (r) => pctLevel(r.obj.inflation), value: (r) => r.obj.inflation },
      { key: 'policy', label: 'policy', render: (r) => pctLevel(r.obj.policyRate, 2), value: (r) => r.obj.policyRate },
      { key: '10y', label: '10y', render: (r) => pctLevel(r.obj.zeroRates?.tenor10Y, 2), value: (r) => r.obj.zeroRates?.tenor10Y ?? 0 },
      { key: 'gdp', label: 'gdp', render: (r) => money(r.obj.derivedNominalGdpLocal ?? r.obj.estimatedNominalGdpLocal), value: (r) => r.obj.derivedNominalGdpLocal ?? r.obj.estimatedNominalGdpLocal ?? 0 },
    ],
  },
  overview({ world, obj: r, nav }) {
    const u = tapeSeries(world, `region:${r.id}:unemployment`).values;
    const cpi = r.cpiHistory ?? [];
    const gdp = tapeSeries(world, `region:${r.id}:gdp`).values;
    const banks = world.state.companies.filter((c) => c.region === r.id && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet);
    const firms = world.state.companies.filter((c) => c.region === r.id && isActiveCompany(c) && !c.isBankEntity);
    const funds = world.state.institutionalEntities.filter((e) => e.region === r.id && !e.isDefaulted);
    const markets = Object.keys(r.categoryDemand).length;
    const pools = (r.smePools ?? []).length;
    const cohorts = (r.householdState?.cohorts ?? []).length;
    const weather = r.weather && r.weather.severity !== 'Normal' ? `${r.weather.type.toLowerCase()}, ${r.weather.severity.toLowerCase()}` : undefined;
    return (
      <>
        <ObjectHeader name={r.name} sub={<>{r.currency} · {r.centralBank} · {words(r.cycleRegime)} · sovereign {r.sovereignRating}{weather ? ` · ${weather}` : ''}</>} />
        <StatGrid>
          <Stat label="unemployment" value={pctLevel(r.unemploymentRate)} sub={u.length > 1 ? <ChangeSub series={u} /> : `nairu ${pctLevel(r.nairu)}`} neg={r.unemploymentRate > r.nairu} />
          <Stat label="inflation" value={pctLevel(r.inflation)} sub={`core ${pctLevel(r.coreInflation)}`} neg={r.inflation > 0.1} />
          <Stat label="policy rate" value={pctLevel(r.policyRate, 2)} sub={`10y ${pctLevel(r.zeroRates?.tenor10Y, 2)} · 2y ${pctLevel(r.zeroRates?.tenor2Y, 2)}`} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="gdp, annualised" hint={gdp.filter(Number.isFinite).length > 1 ? <ChangeSub series={gdp} /> : undefined} v={money(r.derivedNominalGdpLocal ?? r.estimatedNominalGdpLocal)} />
          <KV k="price level" hint={cpi.length > 1 ? <ChangeSub series={cpi} /> : 'seed = 100'} v={num(r.consumerPriceIndex, 1)} />
          <KV k="labour market" hint="tightness · wage growth" v={`${num(r.laborMarketTightness, 2)} · ${pctLevel(r.wageGrowth)}`} />
          <KV k="banks" hint="capital · margin" v={`${pctLevel(r.bankingSector?.bankCapitalRatio, 1)} · ${pctLevel(r.bankingSector?.netInterestMarginPct, 2)}`} onTap={() => nav.go('banks')} />
          <KV k="households" hint="deposits · net worth" v={`${money(householdDepositsOf(ensureV2(world.state), r.id as RegionId))} · ${money(r.householdState?.netWorthLocal)}`} onTap={() => nav.go('statements', { tab: 'households' })} />
          <KV k="treasury" hint="revenue · outlays, weekly" v={`${money(r.governmentRevenueLocal)} · ${money(r.governmentOutlaysLocal ?? r.governmentSpendingWeeklyLocal)}`} onTap={() => nav.go('statements', { tab: 'treasury' })} />
          <KV k="population" v={count(Math.round(r.totalPopulation))} />
        </Card>
        <FunctionTiles nav={nav} tiles={[
          { fn: 'news', sub: 'what happened here, and why' },
          { fn: 'macro', sub: 'the dashboard' },
          { fn: 'chart', sub: 'unemployment · prices · rates' },
          { fn: 'markets', sub: `${markets} goods markets` },
          { fn: 'curves', sub: 'sovereign · policy · repo' },
          { fn: 'statements', sub: 'national accounts · treasury' },
          { fn: 'ladder', sub: `${materializeGovLadder(ensureV2(world.state), r.id).length} sovereign tranches` },
          { fn: 'holders', sub: 'who holds the sovereign' },
          { fn: 'labour', sub: `${cohorts} cohorts · ${Object.keys(r.occupationPools ?? {}).length} occupations` },
          { fn: 'pools', sub: `${pools} small-business pools` },
          { fn: 'banks', sub: `${banks.length} banks` },
          { fn: 'firms', sub: `${firms.length} firms` },
          { fn: 'funds', sub: `${funds.length} funds` },
          { fn: 'books', sub: 'the clearing books' },
          { fn: 'contracts', sub: 'the derivatives cleared here' },
          { fn: 'peers', sub: 'the four regions' },
          { fn: 'diag', sub: 'the instruments' },
          { fn: 'links', sub: 'central bank · banks · lanes' },
        ]} />
        <AllRow fields={Object.keys(r).length} nav={nav} />
      </>
    );
  },
});
