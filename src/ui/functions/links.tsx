/**
 * AU · links — everything this object is tied to, each a link: a firm's bank and lines, parent
 * and subsidiaries, the funds it manages, its estate and offerings; a fund's manager, bank,
 * index, portfolio; a region's central bank, curve, banks, funds, lanes, books.
 */

import { stateDepositLines } from '../../engine/ledger/accounts';
import { ReactNode } from 'react';
import { FunctionModule } from '../fn';
import { Card, KV, Link, Table, T, Nav } from '../ui';
import { money, bps, count } from '../format';
import { formatMonthYear } from '../calendar';
import { World, companyOf, institutionOf, regionOf, bankLinesTo, contractsOf, displayWeek } from '../world';
import { ObjectRef } from '../types';
import { labelOf } from '../objects';
import { SectionLabel, words } from '../objects/common';
import { isActiveCompany } from '../../domain/company';
import { ensureV2 } from '../../engine2/world';
import { facilityRowsOf } from '../../engine2/tranches';

function Refs({ title, refs, world, nav, empty }: { title: string; refs: { ref: ObjectRef; hint?: ReactNode; v?: ReactNode }[]; world: World; nav: Nav; empty?: string }) {
  return (<>
    <SectionLabel>{title}</SectionLabel>
    {refs.length === 0 ? <Card style={{ padding: '10px 14px', color: T.hint, fontSize: 12 }}>{empty ?? 'none'}</Card> : (
      <Card style={{ padding: '2px 0' }}>
        {refs.map((x, i) => { const l = labelOf(world, x.ref); return <KV key={i} k={<Link to={x.ref} nav={nav}>{l.ticker}</Link>} hint={x.hint ?? l.kind} v={x.v ?? l.name} />; })}
      </Card>
    )}
  </>);
}

export const links: FunctionModule = {
  name: 'links',
  appliesTo: ['company', 'institution', 'region'],
  blurb: 'what it is tied to',
  render({ world, ref, nav }) {
    const byTicker = (t: string | undefined): ObjectRef | undefined => { const c = t ? world.state.companies.find((x) => x.ticker === t) : undefined; return c ? { type: 'company', id: c.id } : undefined; };
    if (ref.type === 'company') {
      const c = companyOf(world, ref.id);
      if (!c) return null;
      const bank = byTicker(c.homeBankTicker); const parent = byTicker(c.parentTicker);
      const subs = world.state.companies.filter((x) => x.parentTicker === c.ticker && isActiveCompany(x)).map((x) => ({ ref: { type: 'company' as const, id: x.id } }));
      const managed = (c.managesEntityIds ?? []).filter((id) => institutionOf(world, id)).map((id) => ({ ref: { type: 'institution' as const, id } }));
      const lines = bankLinesTo(world, c.id);
      const contracts = contractsOf(world, { kind: c.isBankEntity ? 'BANK' : 'COMPANY', key: c.ticker });
      const estate = (world.state.estates ?? []).find((e) => e.companyId === c.id);
      const offerings = (world.state.primaryOfferings ?? []).filter((o) => o.issuerId === c.id || o.leadBankTicker === c.ticker);
      const clients = c.isBankEntity ? world.state.companies.filter((x) => x.homeBankTicker === c.ticker && isActiveCompany(x)) : [];
      const fundClients = c.isBankEntity ? world.state.institutionalEntities.filter((e) => e.homeBankTicker === c.ticker && !e.isDefaulted) : [];
      return (<>
        <Refs title="where it stands" world={world} nav={nav} refs={[
          { ref: { type: 'region', id: c.region }, hint: 'home region' },
          ...(bank ? [{ ref: bank, hint: 'house bank' }] : []),
          ...(parent ? [{ ref: parent, hint: 'parent' }] : []),
          ...(estate ? [{ ref: { type: 'estate' as const, id: c.id }, hint: 'the estate' }] : []),
        ]} />
        {subs.length ? <Refs title="subsidiaries" world={world} nav={nav} refs={subs} /> : null}
        {managed.length ? <Refs title="funds it runs" world={world} nav={nav} refs={managed} /> : null}
        <SectionLabel>bank lines</SectionLabel>
        {lines.length === 0 ? <Card style={{ padding: '10px 14px', color: T.hint, fontSize: 12 }}>no facility drawn at any bank.</Card> : (
          <Table rows={lines} keyOf={(l) => `${l.bankId}:${l.maturityWeek}:${l.principalUSD}`} columns={[
            { key: 'bank', label: 'bank', render: (l) => <Link to={{ type: 'company', id: l.bankId }} nav={nav}>{labelOf(world, { type: 'company', id: l.bankId }).ticker}</Link> },
            { key: 'usd', label: 'drawn', render: (l) => money(l.principalUSD) },
            { key: 'margin', label: 'margin', render: (l) => `${bps(l.marginBps)}bp` },
            { key: 'due', label: 'due', render: (l) => formatMonthYear(displayWeek(world.state, l.maturityWeek)) },
            { key: 'status', label: 'status', width: 1.2, render: (l) => (l.status === 'PERFORMING' ? 'paying' : words(l.status)) },
          ]} />
        )}
        {c.isBankEntity ? (<>
          <SectionLabel>clients</SectionLabel>
          <Card style={{ padding: '2px 0' }}>
            <KV k="firms banking here" v={count(clients.length)} onTap={() => nav.go('peers')} />
            <KV k="funds banking here" v={count(fundClients.length)} />
            <KV k="facilities on the book" hint="rows on the borrowers' ladders" v={count(facilityRowsOf(ensureV2(world.state), c.ticker).length)} />
          </Card>
          {clients.length ? <Card style={{ padding: '2px 0' }}>{clients.slice(0, 40).map((x) => <KV key={x.id} k={<Link to={{ type: 'company', id: x.id }} nav={nav}>{x.ticker}</Link>} hint={x.sector} v={money(x.annualRevenue)} />)}</Card> : null}
        </>) : null}
        <Refs title="offerings" world={world} nav={nav} refs={offerings.map((o) => ({ ref: { type: 'offering' as const, id: o.id }, hint: o.issuerId === c.id ? 'raising' : 'leading', v: money(o.sizeUSD) }))} empty="nothing in the pipeline" />
        <Card style={{ padding: '2px 0' }}><KV k="derivative contracts" v={count(contracts.length)} onTap={() => nav.go('contracts')} /></Card>
      </>);
    }
    if (ref.type === 'institution') {
      const e = institutionOf(world, ref.id);
      if (!e) return null;
      const manager = world.state.companies.find((x) => x.id === e.id || (x.managesEntityIds ?? []).includes(e.id));
      const bank = byTicker(e.homeBankTicker);
      const portfolio = (e.peFund?.portfolioCompanyIds ?? []).filter((id) => companyOf(world, id)).map((id) => ({ ref: { type: 'company' as const, id } }));
      const contracts = contractsOf(world, { kind: 'INSTITUTION', key: e.id });
      return (<>
        <Refs title="where it stands" world={world} nav={nav} refs={[
          { ref: { type: 'region', id: e.region }, hint: 'home region' },
          ...(manager && manager.id !== e.id ? [{ ref: { type: 'company' as const, id: manager.id }, hint: 'manager' }] : []),
          ...(bank ? [{ ref: bank, hint: 'house bank' }] : []),
          ...(e.etf ? [{ ref: { type: 'index' as const, id: e.etf.indexId }, hint: 'tracks' }] : []),
        ]} />
        {portfolio.length ? <Refs title="portfolio companies" world={world} nav={nav} refs={portfolio} /> : null}
        <Card style={{ padding: '2px 0' }}>
          <KV k="the book" hint="position by position" v="holdings" onTap={() => nav.go('holdings')} />
          <KV k="derivative contracts" v={count(contracts.length)} onTap={() => nav.go('contracts')} />
        </Card>
      </>);
    }
    const r = regionOf(world, ref.id);
    if (!r) return null;
    const banks = world.state.companies.filter((c) => c.region === r.id && c.isBankEntity && isActiveCompany(c)).map((c) => ({ ref: { type: 'company' as const, id: c.id }, v: money(c.bankBalanceSheet ? stateDepositLines(world.state, c.ticker).householdUSD : undefined) }));
    const lanes = Object.keys(world.state.freightRatePerTonneLaneMoneyByLane ?? {}).filter((k) => k.startsWith(r.id + '>') || k.endsWith('>' + r.id)).map((k) => ({ ref: { type: 'lane' as const, id: k } }));
    const pairs = world.state.fxPairs.filter((p) => p.pair.includes(r.currency)).map((p) => ({ ref: { type: 'fx' as const, id: p.pair } }));
    const indexes = (world.state.marketIndexes ?? []).filter((x) => x.id.startsWith(r.id)).map((x) => ({ ref: { type: 'index' as const, id: x.id } }));
    return (<>
      <Refs title="the institutions" world={world} nav={nav} refs={[
        { ref: { type: 'centralbank', id: r.id }, hint: 'central bank' },
        { ref: { type: 'curve', id: r.id }, hint: 'sovereign curve' },
      ]} />
      <Refs title="banks" world={world} nav={nav} refs={banks} />
      <Refs title="currency" world={world} nav={nav} refs={pairs} />
      {indexes.length ? <Refs title="indices" world={world} nav={nav} refs={indexes} /> : null}
      <Refs title="lanes" world={world} nav={nav} refs={lanes} />
      <Card style={{ padding: '2px 0' }}>
        <KV k="funds" v={count(world.state.institutionalEntities.filter((e) => e.region === r.id && !e.isDefaulted).length)} onTap={() => nav.go('funds')} />
        <KV k="firms" v={count(world.state.companies.filter((c) => c.region === r.id && !c.isBankEntity && isActiveCompany(c)).length)} onTap={() => nav.go('firms')} />
        <KV k="markets" v={count(Object.keys(r.categoryDemand).length)} onTap={() => nav.go('markets')} />
        <KV k="estates" v={count((world.state.estates ?? []).filter((e) => e.regionId === r.id).length)} />
      </Card>
    </>);
  },
};
