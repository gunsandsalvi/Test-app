/**
 * AU · holders / holdings — both off the register. A company's holders are the institutions
 * with a row against its paper (and the banks with a facility to it); an institution's holdings
 * are its own book; a region's holders are whoever holds its sovereign paper. Every name a link.
 */

import { useState } from 'react';
import { FunctionModule } from '../fn';
import { Card, Hint, Link, Table, Tabs, T } from '../ui';
import { money, pctLevel, count } from '../format';
import { World, companyOf, institutionOf, regionOf, holdersOf, bookOf, sovereignHoldersOf } from '../world';
import { refOfIdentifier, labelOf } from '../objects';
import { instrumentName } from '../objects/book';
import { isActiveCompany } from '../../domain/company';
import { marketCapOf, totalDebtOf } from '../../domain/company';
import { institutionTotalAssetsFromState } from '../../engine/simulation/stages/institutional-balance-sheet';

/** A sovereign instrument id's tenor, read aloud: `…-t10` → "10y", `…-b13` → "13w bill". */
function tenorWord(id: string): string {
  const tail = id.replace(/^[A-Z]+[_-](?:[A-Z]+[_-])?(?:GOV[_-]?)?/i, '');
  const t = tail.match(/^t(\d+)$/i); if (t) return `${t[1]}y`;
  const b = tail.match(/^b(\d+)$/i); if (b) return `${b[1]}w bill`;
  return tail.replace(/_/g, ' ').toLowerCase();
}

function typeWord(t: string): string {
  return ({ EQUITY: 'equity', CORP_BOND: 'bond', LEVERAGED_LOAN: 'loan', COMMERCIAL_PAPER: 'cp', GOV_BOND: 'sovereign', ETF_SHARE: 'etf', PE_FUND_INTEREST: 'pe interest', BANK_FACILITY: 'facility' } as Record<string, string>)[t] ?? t.toLowerCase();
}

function CompanyHolders({ world, id, nav, tab }: { world: World; id: string; nav: import('../ui').Nav; tab: string }) {
  const c = companyOf(world, id);
  if (!c) return null;
  const rows = holdersOf(world, id);
  const facilities = world.state.companies
    .filter((b) => b.isBankEntity && b.bankBalanceSheet && isActiveCompany(b))
    .flatMap((b) => (b.bankBalanceSheet!.businessLoans || []).filter((l) => l.borrowerId === id).map((l) => ({ holderId: b.id, instrumentType: 'BANK_FACILITY', usd: l.principalUSD, shares: NaN })));
  const kinds = ['equity', 'debt'];
  const active = kinds.includes(tab) ? tab : 'equity';
  const [sort, setSort] = useState('usd');
  const list = active === 'equity'
    ? rows.filter((r) => r.instrumentType === 'EQUITY').map((r) => ({ holderId: r.holderId, kind: 'equity', usd: r.usd, shares: r.shares }))
    : [...rows.filter((r) => r.instrumentType !== 'EQUITY').map((r) => ({ holderId: r.holderId, kind: typeWord(r.instrumentType), usd: r.usd, shares: NaN })), ...facilities.map((f) => ({ holderId: f.holderId, kind: 'facility', usd: f.usd, shares: NaN }))];
  const total = list.reduce((a, r) => a + r.usd, 0);
  const denom = active === 'equity' ? marketCapOf(c) : totalDebtOf(c);
  const sorted = [...list].sort((a, b) => (sort === 'holder' ? a.holderId.localeCompare(b.holderId) : b.usd - a.usd));
  return (<>
    <Tabs items={kinds} active={active} onPick={(t) => nav.go('holders', { tab: t })} />
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
      <Hint>{list.length} holders · {money(total)} of {money(denom)}{denom > 0 ? ` · ${pctLevel(total / denom, 0)}` : ''}</Hint>
      <Hint>{active === 'equity' ? 'households and the float hold the rest' : 'the ladder is the whole'}</Hint>
    </div>
    {sorted.length === 0 ? <Card style={{ padding: 14, color: T.muted }}>no register row names this paper — {active === 'equity' ? 'the float is with households' : 'no traded debt or bank line'}.</Card> : (
      <Table
        rows={sorted} keyOf={(r) => `${r.holderId}:${r.kind}`} sortKey={sort} onSort={setSort}
        columns={[
          { key: 'holder', label: 'holder', sortable: true, render: (r) => { const ref = refOfIdentifier(world, r.holderId); return ref ? <Link to={ref} nav={nav}>{labelOf(world, ref).ticker}</Link> : r.holderId; } },
          { key: 'usd', label: 'value', sortable: true, render: (r) => money(r.usd) },
          { key: 'share', label: active === 'equity' ? '% cap' : '% debt', render: (r) => (denom > 0 ? (100 * r.usd / denom).toFixed(1) : '—') },
          { key: 'kind', label: active === 'equity' ? 'shares' : 'type', render: (r) => (active === 'equity' ? (Number.isFinite(r.shares) ? money(r.shares, 1) : '—') : r.kind) },
        ]}
      />
    )}
  </>);
}

function InstitutionHoldings({ world, id, nav }: { world: World; id: string; nav: import('../ui').Nav }) {
  const e = institutionOf(world, id);
  if (!e) return null;
  const rows = bookOf(world, id);
  const [sort, setSort] = useState('usd');
  const total = rows.reduce((a, r) => a + r.usd, 0);
  const nav_ = institutionTotalAssetsFromState(world.state, e);
  const sorted = [...rows].sort((a, b) => (sort === 'name' ? a.instrumentId.localeCompare(b.instrumentId) : sort === 'type' ? a.instrumentType.localeCompare(b.instrumentType) : b.usd - a.usd));
  return (<>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
      <Hint>{count(rows.length)} positions · {money(total)}</Hint>
      <Hint>cash {money(e.cashUSD)} · assets {money(nav_)}</Hint>
    </div>
    {rows.length === 0 ? <Card style={{ padding: 14, color: T.muted }}>an empty book — everything is in cash.</Card> : (
      <Table
        rows={sorted} keyOf={(r) => `${r.instrumentId}:${r.instrumentType}:${r.region}`} sortKey={sort} onSort={setSort}
        columns={[
          { key: 'name', label: 'name', sortable: true, width: 1.7, render: (r) => { const ref = refOfIdentifier(world, r.instrumentId) ?? (r.instrumentType === 'GOV_BOND' ? refOfIdentifier(world, r.region) : undefined); return ref ? <Link to={ref} nav={nav}>{ref.type === 'region' ? `${r.region} ${tenorWord(r.instrumentId)}` : instrumentName(world, r.instrumentId)}</Link> : r.instrumentId; } },
          { key: 'usd', label: 'value', sortable: true, width: 0.9, render: (r) => money(r.usd) },
          { key: 'nav', label: '% of', width: 0.7, render: (r) => (nav_ > 0 ? (100 * r.usd / nav_).toFixed(1) : '—') },
          { key: 'type', label: 'type', sortable: true, width: 1.1, render: (r) => typeWord(r.instrumentType) },
        ]}
      />
    )}
  </>);
}

function RegionHolders({ world, id, nav }: { world: World; id: string; nav: import('../ui').Nav }) {
  const r = regionOf(world, id);
  if (!r) return null;
  const inst = sovereignHoldersOf(world, id);
  const banks = world.state.companies.filter((c) => c.region === id && c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c))
    .map((c) => ({ holderId: c.id, usd: Object.values(c.bankBalanceSheet!.sovereignBondHoldingsByTenor || {}).reduce((a, v) => a + (Number(v) || 0), 0) }));
  const cb = r.centralBankSheet ? Object.values(r.centralBankSheet.sovereignHoldingsByTenor || {}).reduce((a, v) => a + (Number(v) || 0), 0) : 0;
  const rows = [...inst.map((h) => ({ ...h, kind: 'institution' })), ...banks.map((h) => ({ ...h, kind: 'bank' })), ...(cb > 0 ? [{ holderId: r.centralBank, usd: cb, kind: 'central bank' }] : [])].sort((a, b) => b.usd - a.usd);
  const total = rows.reduce((a, h) => a + h.usd, 0);
  const outstanding = (r.govDebtTranches ?? []).reduce((a, t) => a + t.principalUSD, 0);
  return (<>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
      <Hint>{rows.length} holders of the sovereign · {money(total)}</Hint>
      <Hint>outstanding {money(outstanding)}</Hint>
    </div>
    <Table rows={rows} keyOf={(h) => h.holderId} columns={[
      { key: 'holder', label: 'holder', render: (h) => { const ref = refOfIdentifier(world, h.holderId); return ref ? <Link to={ref} nav={nav}>{labelOf(world, ref).ticker}</Link> : h.holderId; } },
      { key: 'usd', label: 'value', render: (h) => money(h.usd) },
      { key: 'share', label: '% held', render: (h) => (total > 0 ? (100 * h.usd / total).toFixed(1) : '—') },
      { key: 'kind', label: 'type', render: (h) => h.kind },
    ]} />
    <Hint style={{ padding: '0 4px' }}>the rest of the stock sits with foreign and unmodeled holders.</Hint>
  </>);
}

export const holders: FunctionModule = {
  name: 'holders',
  appliesTo: ['company', 'region', 'curve'],
  blurb: 'who holds it',
  argKey: 'tab',
  render({ world, ref, args, nav }) {
    if (ref.type === 'company') return <CompanyHolders world={world} id={ref.id} nav={nav} tab={args.tab ?? ''} />;
    if (ref.type === 'institution') return <InstitutionHoldings world={world} id={ref.id} nav={nav} />;
    return <RegionHolders world={world} id={ref.id} nav={nav} />;
  },
};

export const holdings: FunctionModule = { ...holders, name: 'holdings', appliesTo: ['institution'], blurb: 'the book, position by position' };

