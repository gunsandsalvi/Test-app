/**
 * AU · holders / holdings — both off the register. A company's holders are every book with a row
 * against its paper — the institutions, the HOUSEHOLD SECTOR (§9.13-EQUITY) and the banks' desks
 * — plus the banks with a facility to it; an institution's holdings are its own book; a region's
 * holders are whoever holds its sovereign paper. Every name a link.
 */

import { useState } from 'react';
import { FunctionModule } from '../fn';
import { Card, Hint, Link, Table, Tabs, T } from '../ui';
import { money, pctLevel, count } from '../format';
import { World, companyOf, institutionOf, regionOf, holdersOf, bookOf, sovereignHoldersOf } from '../world';
import { refOfIdentifier, labelOf } from '../objects';
import { instrumentName } from '../objects/book';
import { banksOf } from '../../domain/company';
import { marketCapOf } from '../../domain/company';
import { institutionTotalAssetsFromState } from '../../engine/simulation/stages/institutional-balance-sheet';
import { entityCashOf } from '../../engine/ledger/accounts';
import { ensureV2 } from '../../engine2/world';
import { materializeGovLadder, ladderTotalLocal } from '../../engine2/tranches';
import { facilitiesOfBorrower } from '../../engine2/tranches';
import { asRegionId } from '../../domain/geography';

/** A sovereign instrument id's tenor, read aloud: `…-t10` → "10y", `…-b13` → "13w bill". */
function tenorWord(id: string): string {
  const tail = id.replace(/^[A-Z]+[_-](?:[A-Z]+[_-])?(?:GOV[_-]?)?/i, '');
  const t = tail.match(/^t(\d+)$/i); if (t) return `${t[1]}y`;
  const b = tail.match(/^b(\d+)$/i); if (b) return `${b[1]}w bill`;
  return tail.replace(/_/g, ' ').toLowerCase();
}

/**
 * A HOLDER'S NAME. §9.13-EQUITY put the household sector on the register, and its book id is the
 * one key everything else uses for it (`HOUSEHOLD-USA`) — which is a key, not a name. This reads
 * it as the sector it is and links to the region, so the largest shareholder of most companies in
 * this world appears in the list as something a reader recognises.
 */
function HolderName({ world, holderId, nav }: { world: World; holderId: string; nav: import('../ui').Nav }) {
  const hh = holderId.match(/^HOUSEHOLD-(.+)$/);
  if (hh) return <Link to={{ type: 'region', id: hh[1] }} nav={nav}>households · {hh[1].toLowerCase()}</Link>;
  const ref = refOfIdentifier(world, holderId);
  return ref ? <Link to={ref} nav={nav}>{labelOf(world, ref).ticker}</Link> : <>{holderId}</>;
}

function typeWord(t: string): string {
  return ({ EQUITY: 'equity', CORP_BOND: 'bond', LEVERAGED_LOAN: 'loan', COMMERCIAL_PAPER: 'cp', GOV_BOND: 'sovereign', ETF_SHARE: 'etf', PE_FUND_INTEREST: 'pe interest', BANK_FACILITY: 'facility' } as Record<string, string>)[t] ?? t.toLowerCase();
}

function CompanyHolders({ world, id, nav, tab }: { world: World; id: string; nav: import('../ui').Nav; tab: string }) {
  const c = companyOf(world, id);
  if (!c) return null;
  const rows = holdersOf(world, id);
  // Step 10: the lenders' claims are the facility rows on this firm's own ladder.
  const bankIdByTicker = new Map(banksOf(world.state.companies).map((b) => [b.ticker, b.id]));
  const facilities = facilitiesOfBorrower(ensureV2(world.state), id)
    .filter((f) => bankIdByTicker.has(f.bankTicker))
    .map((f) => ({ holderId: bankIdByTicker.get(f.bankTicker)!, instrumentType: 'BANK_FACILITY', usd: f.principalLocal, shares: NaN }));
  const kinds = ['equity', 'debt'];
  const active = kinds.includes(tab) ? tab : 'equity';
  const [sort, setSort] = useState('usd');
  const list = active === 'equity'
    ? rows.filter((r) => r.instrumentType === 'EQUITY').map((r) => ({ holderId: r.holderId, kind: 'equity', usd: r.usd, shares: r.shares }))
    : [...rows.filter((r) => r.instrumentType !== 'EQUITY').map((r) => ({ holderId: r.holderId, kind: typeWord(r.instrumentType), usd: r.usd, shares: NaN })), ...facilities.map((f) => ({ holderId: f.holderId, kind: 'facility', usd: f.usd, shares: NaN }))];
  const total = list.reduce((a, r) => a + r.usd, 0);
  const denom = active === 'equity' ? marketCapOf(c) : ladderTotalLocal(ensureV2(world.state), c.id);
  const sorted = [...list].sort((a, b) => (sort === 'holder' ? a.holderId.localeCompare(b.holderId) : b.usd - a.usd));
  return (<>
    <Tabs items={kinds} active={active} onPick={(t) => nav.go('holders', { tab: t })} />
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
      <Hint>{list.length} holders · {money(total)} of {money(denom)}{denom > 0 ? ` · ${pctLevel(total / denom, 0)}` : ''}</Hint>
      {/* §9.13-EQUITY: no prose about who is missing, because nobody is. The household sector is
          a register book and the desks are read off their banks, so this list IS the holders and
          the total below is the whole issue. "households and the float hold the rest" named ONE
          residual twice — the float was households, computed by subtraction. */}
      <Hint>{active === 'equity' ? 'every holder of record' : 'the ladder is the whole'}</Hint>
    </div>
    {sorted.length === 0 ? <Card style={{ padding: 14, color: T.muted }}>no register row names this paper — {active === 'equity' ? 'this issue is on nobody\u2019s book, which is a defect (O2)' : 'no traded debt or bank line'}.</Card> : (
      <Table
        rows={sorted} keyOf={(r) => `${r.holderId}:${r.kind}`} sortKey={sort} onSort={setSort}
        columns={[
          { key: 'holder', label: 'holder', sortable: true, render: (r) => <HolderName world={world} holderId={r.holderId} nav={nav} /> },
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
      <Hint>cash {money(entityCashOf(ensureV2(world.state), e))} · assets {money(nav_)}</Hint>
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
  const banks = banksOf(world.state.companies, asRegionId(id))
    .map((c) => ({ holderId: c.id, usd: Object.values(c.bankBalanceSheet!.sovereignBondHoldingsByBond || {}).reduce((a, v) => a + (Number(v) || 0), 0) }));
  const cb = r.centralBankSheet ? Object.values(r.centralBankSheet.sovereignHoldingsByBond || {}).reduce((a, v) => a + (Number(v) || 0), 0) : 0;
  const rows = [...inst.map((h) => ({ ...h, kind: 'institution' })), ...banks.map((h) => ({ ...h, kind: 'bank' })), ...(cb > 0 ? [{ holderId: r.centralBank, usd: cb, kind: 'central bank' }] : [])].sort((a, b) => b.usd - a.usd);
  const total = rows.reduce((a, h) => a + h.usd, 0);
  const outstanding = materializeGovLadder(ensureV2(world.state), r.id).reduce((a, t) => a + t.principalLocal, 0);
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

