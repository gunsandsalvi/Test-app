/**
 * AU · peers — the screener: the object's cohort as a sortable table, any column. Companies by
 * sector·region, sector, or rating; a region's banks or firms; institutions by type; the four
 * regions side by side.
 */

import { useState } from 'react';
import { FunctionModule } from '../fn';
import { Hint, Link, Table, Tabs, T, Card } from '../ui';
import { money, pctLevel, ratio, num, bps } from '../format';
import { World, ObjectRef, companyOf, institutionOf, regionOf, labelOf } from '../world';
import { isActiveCompany } from '../../domain/company';
import { REGION_IDS } from '../../domain/geography';
import { Company, InstitutionalEntity } from '../../types';

type Col<R> = { key: string; label: string; render: (r: R) => React.ReactNode; value: (r: R) => number | string; sortable?: boolean };

function Screener<R>({ rows, cols, keyOf, initialSort, subtitle }: { rows: R[]; cols: Col<R>[]; keyOf: (r: R) => string; initialSort: string; subtitle: string }) {
  const [sort, setSort] = useState(initialSort);
  const col = cols.find((c) => c.key === sort) ?? cols[1];
  const sorted = [...rows].sort((a, b) => { const va = col.value(a), vb = col.value(b); return typeof va === 'number' && typeof vb === 'number' ? vb - va : String(va).localeCompare(String(vb)); });
  return (<>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}><Hint>{rows.length} names · sorted by {col.label}</Hint><Hint>{subtitle}</Hint></div>
    {rows.length === 0 ? <Card style={{ padding: 14, color: T.muted }}>no peers in this set.</Card> : (
      <Table rows={sorted} keyOf={keyOf} sortKey={sort} onSort={setSort} columns={cols.map((c) => ({ key: c.key, label: c.label, render: c.render, sortable: c.sortable ?? true }))} />
    )}
  </>);
}

function CompanyPeers({ world, c, tab, set, nav }: { world: World; c: Company; tab: string; set: string; nav: import('../ui').Nav }) {
  const tabs = [`${c.sector} · ${c.region}`, c.sector, c.creditRating, 'all'];
  const active = tabs.includes(tab) ? tab : tabs[0];
  const live = world.state.companies.filter((x) => isActiveCompany(x) && x.listingStatus !== 'PRIVATE');
  const rows = active === tabs[0] ? live.filter((x) => x.sector === c.sector && x.region === c.region)
    : active === c.sector ? live.filter((x) => x.sector === c.sector)
      : active === c.creditRating ? live.filter((x) => x.creditRating === c.creditRating)
        : live;
  const bankSet = set === 'banks' || c.isBankEntity;
  const cols: Col<Company>[] = bankSet ? [
    { key: 'name', label: 'name', render: (r) => <Link to={{ type: 'company', id: r.id }} nav={nav}>{r.ticker}</Link>, value: (r) => r.ticker },
    { key: 'cap', label: 'capital %', render: (r) => pctLevel(r.bankBalanceSheet?.bankCapitalRatio, 1), value: (r) => r.bankBalanceSheet?.bankCapitalRatio ?? -1 },
    { key: 'nim', label: 'nim %', render: (r) => pctLevel(r.bankBalanceSheet?.netInterestMarginPct, 2), value: (r) => r.bankBalanceSheet?.netInterestMarginPct ?? -1 },
    { key: 'dep', label: 'deposits', render: (r) => money(r.bankBalanceSheet ? r.bankBalanceSheet.depositsUSD + (r.bankBalanceSheet.corporateDepositsUSD ?? 0) + (r.bankBalanceSheet.institutionalDepositsUSD ?? 0) : undefined), value: (r) => r.bankBalanceSheet?.depositsUSD ?? 0 },
    { key: 'oas', label: 'oas bp', render: (r) => bps(r.oasSpreadBps), value: (r) => r.oasSpreadBps },
  ] : [
    { key: 'name', label: 'name', render: (r) => <Link to={{ type: 'company', id: r.id }} nav={nav}>{r.ticker}</Link>, value: (r) => r.ticker },
    { key: 'pe', label: 'p/e', render: (r) => num(r.forwardPE, 1), value: (r) => r.forwardPE },
    { key: 'oas', label: 'oas bp', render: (r) => bps(r.oasSpreadBps), value: (r) => r.oasSpreadBps },
    { key: 'lev', label: 'lev ×', render: (r) => ratio(r.leverage), value: (r) => r.leverage },
    { key: 'mcap', label: 'mkt cap', render: (r) => money(r.marketCap, 1), value: (r) => r.marketCap },
  ];
  return (<>
    <Tabs items={tabs} active={active} onPick={(t) => nav.go('peers', { tab: t })} />
    <Screener rows={rows} cols={cols} keyOf={(r) => r.id} initialSort="oas" subtitle={c.ticker} />
  </>);
}

function InstitutionPeers({ world, e, tab, nav }: { world: World; e: InstitutionalEntity; tab: string; nav: import('../ui').Nav }) {
  const kind = e.entityType.toLowerCase().replace(/_/g, ' ');
  const tabs = [`${kind} · ${e.region}`, kind, 'all'];
  const active = tabs.includes(tab) ? tab : tabs[0];
  const live = world.state.institutionalEntities.filter((x) => !x.isDefaulted);
  const rows = active === tabs[0] ? live.filter((x) => x.entityType === e.entityType && x.region === e.region)
    : active === kind ? live.filter((x) => x.entityType === e.entityType) : live;
  const cols: Col<InstitutionalEntity>[] = [
    { key: 'name', label: 'name', render: (r) => <Link to={{ type: 'institution', id: r.id }} nav={nav}>{labelOf(world, { type: 'institution', id: r.id }).ticker}</Link>, value: (r) => r.ticker ?? r.id },
    { key: 'assets', label: 'assets', render: (r) => money(r.totalAssetsUSD), value: (r) => r.totalAssetsUSD },
    { key: 'cash', label: 'cash %', render: (r) => (r.totalAssetsUSD > 0 ? pctLevel((r.cashUSD ?? 0) / r.totalAssetsUSD, 0) : '—'), value: (r) => (r.totalAssetsUSD > 0 ? (r.cashUSD ?? 0) / r.totalAssetsUSD : 0) },
    { key: 'equity', label: 'equity %', render: (r) => (r.totalAssetsUSD > 0 ? pctLevel(r.equityCapitalUSD / r.totalAssetsUSD, 0) : '—'), value: (r) => (r.totalAssetsUSD > 0 ? r.equityCapitalUSD / r.totalAssetsUSD : 0) },
    { key: 'region', label: 'region', render: (r) => <Link to={{ type: 'region', id: r.region }} nav={nav}>{r.region}</Link>, value: (r) => r.region },
  ];
  return (<>
    <Tabs items={tabs} active={active} onPick={(t) => nav.go('peers', { tab: t })} />
    <Screener rows={rows} cols={cols} keyOf={(r) => r.id} initialSort="assets" subtitle={labelOf(world, { type: 'institution', id: e.id }).ticker} />
  </>);
}

function RegionPeers({ world, id, set, nav }: { world: World; id: string; set: string; nav: import('../ui').Nav }) {
  const tabs = ['regions', 'banks', 'firms', 'institutions'];
  const active = tabs.includes(set) ? set : 'regions';
  if (active === 'regions') {
    const rows = REGION_IDS.map((r) => regionOf(world, r)!).filter(Boolean);
    return (<>
      <Tabs items={tabs} active={active} onPick={(t) => nav.go('peers', { set: t })} />
      <Screener rows={rows} keyOf={(r) => r.id} initialSort="u" subtitle={id} cols={[
        { key: 'name', label: 'region', render: (r) => <Link to={{ type: 'region', id: r.id }} nav={nav}>{r.id}</Link>, value: (r) => r.id },
        { key: 'u', label: 'u %', render: (r) => pctLevel(r.unemploymentRate), value: (r) => r.unemploymentRate },
        { key: 'infl', label: 'infl %', render: (r) => pctLevel(r.inflation), value: (r) => r.inflation },
        { key: 'policy', label: 'policy', render: (r) => pctLevel(r.policyRate, 2), value: (r) => r.policyRate },
        { key: '10y', label: '10y', render: (r) => pctLevel(r.zeroRates?.tenor10Y, 2), value: (r) => r.zeroRates?.tenor10Y ?? 0 },
      ]} />
    </>);
  }
  if (active === 'institutions') {
    const rows = world.state.institutionalEntities.filter((e) => e.region === id && !e.isDefaulted);
    return (<>
      <Tabs items={tabs} active={active} onPick={(t) => nav.go('peers', { set: t })} />
      <Screener rows={rows} keyOf={(r) => r.id} initialSort="assets" subtitle={id} cols={[
        { key: 'name', label: 'name', render: (r) => <Link to={{ type: 'institution', id: r.id }} nav={nav}>{labelOf(world, { type: 'institution', id: r.id }).ticker}</Link>, value: (r) => r.ticker ?? r.id },
        { key: 'assets', label: 'assets', render: (r) => money(r.totalAssetsUSD), value: (r) => r.totalAssetsUSD },
        { key: 'type', label: 'type', render: (r) => r.entityType.toLowerCase().replace(/_/g, ' '), value: (r) => r.entityType },
      ]} />
    </>);
  }
  const live = world.state.companies.filter((c) => c.region === id && isActiveCompany(c));
  const rows = active === 'banks' ? live.filter((c) => c.isBankEntity && c.bankBalanceSheet) : live.filter((c) => !c.isBankEntity && c.listingStatus !== 'PRIVATE');
  const cols: Col<Company>[] = active === 'banks' ? [
    { key: 'name', label: 'name', render: (r) => <Link to={{ type: 'company', id: r.id }} nav={nav}>{r.ticker}</Link>, value: (r) => r.ticker },
    { key: 'cap', label: 'capital %', render: (r) => pctLevel(r.bankBalanceSheet?.bankCapitalRatio, 1), value: (r) => r.bankBalanceSheet?.bankCapitalRatio ?? -1 },
    { key: 'nim', label: 'nim %', render: (r) => pctLevel(r.bankBalanceSheet?.netInterestMarginPct, 2), value: (r) => r.bankBalanceSheet?.netInterestMarginPct ?? -1 },
    { key: 'share', label: 'share %', render: (r) => pctLevel(r.bankMarketShare, 0), value: (r) => r.bankMarketShare ?? 0 },
    { key: 'whol', label: 'wholesale', render: (r) => money(r.bankBalanceSheet?.wholesaleFundingUSD), value: (r) => r.bankBalanceSheet?.wholesaleFundingUSD ?? 0 },
  ] : [
    { key: 'name', label: 'name', render: (r) => <Link to={{ type: 'company', id: r.id }} nav={nav}>{r.ticker}</Link>, value: (r) => r.ticker },
    { key: 'sector', label: 'sector', render: (r) => r.sector, value: (r) => r.sector },
    { key: 'mcap', label: 'mkt cap', render: (r) => money(r.marketCap, 1), value: (r) => r.marketCap },
    { key: 'rating', label: 'rating', render: (r) => r.creditRating, value: (r) => r.creditRating },
    { key: 'oas', label: 'oas bp', render: (r) => bps(r.oasSpreadBps), value: (r) => r.oasSpreadBps },
  ];
  return (<>
    <Tabs items={tabs} active={active} onPick={(t) => nav.go('peers', { set: t })} />
    <Screener rows={rows} cols={cols} keyOf={(r) => r.id} initialSort={active === 'banks' ? 'cap' : 'mcap'} subtitle={id} />
  </>);
}

export const peers: FunctionModule = {
  name: 'peers',
  appliesTo: ['company', 'institution', 'region'],
  blurb: 'the screener',
  render({ world, ref, args, nav }) {
    if (ref.type === 'company') { const c = companyOf(world, ref.id); return c ? <CompanyPeers world={world} c={c} tab={args.tab ?? ''} set={args.set ?? ''} nav={nav} /> : null; }
    if (ref.type === 'institution') { const e = institutionOf(world, ref.id); return e ? <InstitutionPeers world={world} e={e} tab={args.tab ?? ''} nav={nav} /> : null; }
    return <RegionPeers world={world} id={ref.id} set={args.set ?? ''} nav={nav} />;
  },
};

export type { ObjectRef };
