/** AU · object: institution — an insurer, a pension, an asset manager, a hedge fund, a PE fund, a money fund, an ETF. */

import { InstitutionalEntity } from '../../types';
import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { money, pctLevel, num } from '../format';
import { formatSpan } from '../calendar';
import { institutionOf, bookOf, tapeSeries, contractsOf } from '../world';
import { ObjectHeader, ChangeSub, FunctionTiles, AllRow, RegionLink, taped, words } from './common';
import { hedgeFundStrategyProfile } from '../../domain/institution-profiles';
import { institutionTotalAssetsFromState } from '../../engine/simulation/stages/institutional-balance-sheet';
import { entityCashOf } from '../../engine/ledger/accounts';
import { ensureV2 } from '../../engine2/world';

export const institution = defineObject<InstitutionalEntity>({
  type: 'institution',
  words: ['fund', 'funds'],
  searchable: true,
  find: institutionOf,
  list: (world) => world.state.institutionalEntities.map((e) => ({ id: e.id, obj: e })),
  label: (_w, id, e) => ({ ticker: e.ticker ?? id, name: e.name, kind: words(e.entityType) + (e.hedgeFundStrategy ? ` · ${words(e.hedgeFundStrategy)}` : ''), region: e.region }),
  keywords: (_w, _id, e) => [words(e.entityType), e.region.toLowerCase(), ...(e.hedgeFundStrategy ? [words(e.hedgeFundStrategy)] : [])],
  headline: (w, _id, e) => ({ value: money(institutionTotalAssetsFromState(w.state, e)), sub: 'assets', neg: entityCashOf(ensureV2(w.state), e) < 0 }),
  series: (world, id) => [
    taped(world, `institution:${id}:assets`, 'assets', 'USD', (v) => money(v)),
    taped(world, `institution:${id}:cash`, 'cash', 'USD', (v) => money(v)),
    taped(world, `institution:${id}:equity`, 'equity', 'USD', (v) => money(v)),
    taped(world, `institution:${id}:price`, 'price', 'USD per share', (v) => num(v)),
  ],
  peers: {
    groups: (world, _id, e) => {
      const live = world.state.institutionalEntities.filter((x) => !x.isDefaulted);
      return [
        { name: `${words(e.entityType)} · ${e.region}`, ids: live.filter((x) => x.entityType === e.entityType && x.region === e.region).map((x) => x.id) },
        { name: words(e.entityType), ids: live.filter((x) => x.entityType === e.entityType).map((x) => x.id) },
        { name: `all · ${e.region}`, ids: live.filter((x) => x.region === e.region).map((x) => x.id) },
        { name: 'all funds', ids: live.map((x) => x.id) },
      ];
    },
    defaultSort: 'assets',
    columns: [
      { key: 'name', label: 'name', render: (r, _w, nav) => <Link to={{ type: 'institution', id: r.id }} nav={nav}>{r.obj.ticker ?? r.id}</Link>, value: (r) => r.obj.ticker ?? r.id },
      { key: 'kind', label: 'kind', width: 1.3, render: (r) => words(r.obj.entityType), value: (r) => r.obj.entityType },
      { key: 'assets', label: 'assets', render: (r, w) => money(institutionTotalAssetsFromState(w.state, r.obj)), value: (r, w) => institutionTotalAssetsFromState(w.state, r.obj) },
      { key: 'cash', label: 'cash', render: (r, w) => { const t = institutionTotalAssetsFromState(w.state, r.obj); return t > 0 ? pctLevel(entityCashOf(ensureV2(w.state), r.obj) / t, 0) : '—'; }, value: (r, w) => { const t = institutionTotalAssetsFromState(w.state, r.obj); return t > 0 ? entityCashOf(ensureV2(w.state), r.obj) / t : 0; } },
      { key: 'equity', label: 'equity', render: (r, w) => { const t = institutionTotalAssetsFromState(w.state, r.obj); return t > 0 ? pctLevel(r.obj.equityCapitalLocal / t, 0) : '—'; }, value: (r, w) => { const t = institutionTotalAssetsFromState(w.state, r.obj); return t > 0 ? r.obj.equityCapitalLocal / t : 0; } },
      { key: 'region', label: 'reg', width: 0.6, render: (r, _w, nav) => <Link to={{ type: 'region', id: r.obj.region }} nav={nav}>{r.obj.region}</Link>, value: (r) => r.obj.region },
    ],
  },
  overview({ world, obj: e, nav }) {
    const book = bookOf(world, e.id);
    const holdingsLocal = book.reduce((a, r) => a + r.usd, 0);
    const assets = tapeSeries(world, `institution:${e.id}:assets`).values;
    const manager = world.state.companies.find((c) => c.id === e.id || (c.managesEntityIds ?? []).includes(e.id));
    const bank = e.homeBankTicker ? world.state.companies.find((b) => b.ticker === e.homeBankTicker) : undefined;
    const byType = new Map<string, number>();
    book.forEach((r) => byType.set(r.instrumentType, (byType.get(r.instrumentType) ?? 0) + r.usd));
    const contracts = contractsOf(world, { kind: 'INSTITUTION', key: e.id });
    const strategy = hedgeFundStrategyProfile(e);
    const t = e.assetAllocationTarget;
    const totalAssetsLocal = institutionTotalAssetsFromState(world.state, e);
    const eCashLocal = entityCashOf(ensureV2(world.state), e);
    return (
      <>
        <ObjectHeader
          name={e.name}
          sub={<>{words(e.entityType)}{e.hedgeFundStrategy ? ` · ${words(e.hedgeFundStrategy)}` : ''} · <RegionLink id={e.region} nav={nav} />
            {manager && manager.id !== e.id ? <> · run by <Link to={{ type: 'company', id: manager.id }} nav={nav}>{manager.ticker}</Link></> : null}
            {bank ? <> · banks at <Link to={{ type: 'company', id: bank.id }} nav={nav}>{bank.ticker}</Link></> : null}
            {e.management ? <> · board: {e.management.riskAversion > 1.25 ? 'cautious' : e.management.riskAversion < 0.8 ? 'risk-taking' : 'even-handed'}</> : null}</>}
          flag={e.isDefaulted ? 'in default' : undefined}
        />
        <StatGrid>
          <Stat label="assets" value={money(totalAssetsLocal)} sub={<ChangeSub series={assets} />} />
          <Stat label="cash" value={money(eCashLocal)} sub={totalAssetsLocal > 0 ? `${pctLevel(eCashLocal / totalAssetsLocal, 0)} of assets` : ''} neg={eCashLocal < 0} />
          <Stat label="equity" value={money(e.equityCapitalLocal)} sub={totalAssetsLocal > 0 ? `${pctLevel(e.equityCapitalLocal / totalAssetsLocal, 0)} of assets` : ''} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="holdings" hint={`${book.length} positions`} v={money(holdingsLocal)} onTap={() => nav.go('holdings')} />
          {[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([ty, usd]) => <KV key={ty} k={words(ty)} v={money(usd)} />)}
          {e.beneficiaryLiabilityLocal !== undefined ? <KV k="owed to beneficiaries" v={money(e.beneficiaryLiabilityLocal)} /> : null}
          {e.stockPrice > 0 ? <KV k="price per share" v={num(e.stockPrice)} /> : null}
          {e.primeBrokerageAvailableLocal !== undefined ? <KV k="prime brokerage line" v={money(e.primeBrokerageAvailableLocal)} /> : null}
          {e.etf ? <KV k="tracks" v={<Link to={{ type: 'index', id: e.etf.indexId }} nav={nav}>{e.etf.indexId}</Link>} /> : null}
          {e.peFund ? <KV k="portfolio companies" v={count(e.peFund.portfolioCompanyIds?.length ?? 0)} onTap={() => nav.go('links')} /> : null}
        </Card>
        {t ? (
          <Card style={{ padding: '2px 0' }}>
            <KV k="mandate" hint={strategy ? 'the strategy\'s book' : 'policy allocation'} v={`gov ${pctLevel(t.govBondPct, 0)} · credit ${pctLevel(t.corpBondPct + t.loanPct, 0)} · equity ${pctLevel(t.equityPct, 0)} · cash ${pctLevel(t.cashPct, 0)}`} />
          </Card>
        ) : null}
        <FunctionTiles nav={nav} tiles={[
          { fn: 'holdings', sub: `${book.length} positions` },
          { fn: 'news', sub: 'what happened, and why' },
          { fn: 'chart', sub: `assets · ${assets.filter(Number.isFinite).length > 1 ? formatSpan(assets.length) : 'no history yet'}` },
          { fn: 'statements', sub: 'assets · liabilities' },
          { fn: 'links', sub: `${contracts.length} contracts · manager · bank` },
          { fn: 'peers', sub: words(e.entityType) },
        ]} />
        <AllRow fields={Object.keys(e).length} nav={nav} />
      </>
    );
  },
});

function count(n: number): string { return n.toLocaleString('en-US'); }
