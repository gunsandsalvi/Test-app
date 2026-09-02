/** AU · object: central bank — a region's monetary authority: its sheet, its rate, its operations. */

import { ReactNode } from 'react';
import { Region } from '../../types';
import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { money, pctLevel } from '../format';
import { regionOf, tapeSeries } from '../world';
import { REGION_IDS } from '../../domain/geography';
import { isActiveCompany } from '../../domain/company';
import { ObjectHeader, ChangeSub, FunctionTiles, AllRow, RegionLink, taped } from './common';

export const centralbank = defineObject<Region>({
  type: 'centralbank',
  words: ['central bank', 'central banks'],
  searchable: true,
  find: regionOf,
  list: (world) => REGION_IDS.map((r) => ({ id: r, obj: world.state.regions[r] })).filter((x) => !!x.obj),
  label: (_w, id, r) => ({ ticker: `${id} cb`, name: r.centralBank, kind: 'central bank', region: id }),
  keywords: (_w, id, r) => [id.toLowerCase(), r.centralBank.toLowerCase(), 'central bank', 'cb', 'monetary'],
  parse: (world, phrase) => { const p = phrase.trim().toLowerCase(); const m = p.match(/^([a-z]+) (cb|central bank)$/); return m && world.state.regions[m[1].toUpperCase() as 'USA'] ? m[1].toUpperCase() : undefined; },
  headline: (_w, _id, r) => ({ value: pctLevel(r.policyRate, 2), sub: 'policy rate' }),
  series: (world, id) => [
    taped(world, `region:${id}:policy`, 'policy rate', 'rate', (v) => pctLevel(v, 2)),
    taped(world, `centralbank:${id}:sovereign book`, 'sovereign book', 'USD', (v) => money(v)),
    taped(world, `centralbank:${id}:reserves`, 'bank reserves', 'USD', (v) => money(v)),
    taped(world, `centralbank:${id}:treasury account`, 'treasury account', 'USD', (v) => money(v)),
    taped(world, `centralbank:${id}:currency`, 'currency in circulation', 'USD', (v) => money(v)),
    taped(world, `region:${id}:inflation`, 'inflation', 'annualised', (v) => pctLevel(v)),
  ],
  peers: {
    groups: () => [{ name: 'the central banks', ids: [...REGION_IDS] }],
    defaultSort: 'policy',
    columns: [
      { key: 'name', label: 'bank', render: (r, _w, nav) => <Link to={{ type: 'centralbank', id: r.id }} nav={nav}>{r.obj.centralBank}</Link>, value: (r) => r.id },
      { key: 'policy', label: 'policy', render: (r) => pctLevel(r.obj.policyRate, 2), value: (r) => r.obj.policyRate },
      { key: 'target', label: 'taylor', render: (r) => pctLevel(r.obj.taylorTargetRate, 2), value: (r) => r.obj.taylorTargetRate },
      { key: 'infl', label: 'inflation', render: (r) => pctLevel(r.obj.inflation), value: (r) => r.obj.inflation },
      { key: 'book', label: 'sov book', render: (r) => money(Object.values(r.obj.centralBankSheet?.sovereignHoldingsByTenor ?? {}).reduce((a, v) => a + (Number(v) || 0), 0)), value: (r) => Object.values(r.obj.centralBankSheet?.sovereignHoldingsByTenor ?? {}).reduce((a, v) => a + (Number(v) || 0), 0) },
    ],
  },
  overview({ world, ref, obj: r, nav }) {
    const cb = r.centralBankSheet;
    const book = Object.values(cb?.sovereignHoldingsByTenor ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);
    const policy = tapeSeries(world, `region:${ref.id}:policy`).values;
    const banks = world.state.companies.filter((c) => c.region === ref.id && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet);
    const atWindow = banks.filter((b) => (b.bankBalanceSheet!.srfBorrowingUSD ?? 0) > 1e6);
    const reserves = r.bankingSector?.centralBankReservesUSD ?? 0;
    return (
      <>
        <ObjectHeader name={r.centralBank} sub={<>central bank of <RegionLink id={ref.id} nav={nav} /> · target inflation {pctLevel(r.targetInflation)} · {r.currency}</>} />
        <StatGrid>
          <Stat label="policy rate" value={pctLevel(r.policyRate, 2)} sub={<ChangeSub series={policy} />} />
          <Stat label="rule says" value={pctLevel(r.taylorTargetRate, 2)} sub={`neutral ${pctLevel(r.neutralRate, 2)}`} />
          <Stat label="inflation" value={pctLevel(r.inflation)} sub={`target ${pctLevel(r.targetInflation)} · expected ${pctLevel(r.expectedInflation)}`} neg={r.inflation > r.targetInflation * 2} />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="sovereign book" hint="by tenor" v={money(book)} onTap={() => nav.go('all', { path: 'centralBankSheet.sovereignHoldingsByTenor' })} />
          <KV k="bank reserves" hint="the banks' deposits here" v={money(reserves)} />
          <KV k="treasury account" v={money(cb?.treasuryAccountUSD)} />
          <KV k="currency in circulation" v={money(cb?.currencyInCirculationUSD)} />
          <KV k="fx reserves" v={money(r.fxReservesUSD)} />
          <KV k="last open-market purchase" v={money(cb?.lastOpenMarketPurchasesUSD)} />
          <KV k="last remittance to the treasury" v={money(cb?.lastRemittanceUSD)} />
          <KV k="banks at the window" v={atWindow.length ? atWindow.map((b) => <Link key={b.id} to={{ type: 'company', id: b.id }} nav={nav}>{b.ticker}</Link>).reduce<ReactNode[]>((acc, x, i) => (i ? [...acc, ' ', x] : [x]), []) : 'none'} />
        </Card>
        <FunctionTiles nav={nav} tiles={[
          { fn: 'chart', sub: 'policy · book · reserves' },
          { fn: 'curves', sub: 'the curve it steers' },
          { fn: 'peers', sub: 'the four central banks' },
          { fn: 'news', sub: 'decisions and windows' },
        ]} />
        <AllRow fields={Object.keys(cb ?? {}).length} nav={nav} />
      </>
    );
  },
});
