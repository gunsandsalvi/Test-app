/**
 * AU · contracts — the derivative contracts on the one book that name this object: a party's
 * (a firm, a bank, a fund), a reference's (a commodity's futures, a pair's forwards, a firm's
 * CDS), a region's market. Each row a contract object.
 */

import { FunctionModule } from '../fn';
import { derivativesOf } from '../../engine/ledger/contract-ledger';
import { Card, Hint, KV, Link, Table, Tabs, T } from '../ui';
import { money, pctLevel, num, count } from '../format';
import { formatMonthYear } from '../calendar';
import { companyOf, institutionOf, contractsOf, displayWeek } from '../world';
import { DerivativeContract } from '../../domain/derivatives/contract';
import { partyRef, partyName, classWord } from '../objects/contract';

export const contracts: FunctionModule = {
  name: 'contracts',
  appliesTo: ['company', 'institution', 'commodity', 'fx', 'region'],
  blurb: 'the derivatives on it',
  argKey: 'tab',
  render({ world, ref, args, nav }) {
    const book = derivativesOf(world.v2);
    let mine: DerivativeContract[];
    if (ref.type === 'company') { const c = companyOf(world, ref.id); mine = c ? [...contractsOf(world, { kind: c.isBankEntity ? 'BANK' : 'COMPANY', key: c.ticker }), ...book.filter((k) => (k.reference.kind === 'ISSUER' || k.reference.kind === 'SHARES') && k.reference.issuerId === c.id)] : []; }
    else if (ref.type === 'institution') mine = contractsOf(world, { kind: 'INSTITUTION', key: ref.id });
    else if (ref.type === 'commodity') mine = book.filter((k) => k.reference.kind === 'COMMODITY' && k.reference.commodityId === ref.id);
    else if (ref.type === 'fx') { const [base, quote] = ref.id.split('/'); mine = book.filter((k) => k.reference.kind === 'REGION' && (k.reference.regionId === base || k.reference.regionId === quote)); }
    else mine = book.filter((k) => k.regionId === ref.id);
    mine = [...new Map(mine.map((k) => [k.id, k])).values()];
    const classes = [...new Set(mine.map((k) => k.classId))];
    const tabs = ['all', ...classes.map(classWord)];
    const active = tabs.includes(args.tab ?? '') ? args.tab! : 'all';
    const shown = mine.filter((k) => active === 'all' || classWord(k.classId) === active).sort((a, b) => b.notional - a.notional);
    const notional = shown.reduce((a, k) => a + k.notional, 0);
    const settled = shown.reduce((a, k) => a + (k.settledMarkLocal ?? 0), 0);
    if (mine.length === 0) return <Card style={{ padding: 14, color: T.muted }}>no derivative contract names this {ref.type === 'fx' ? 'pair' : ref.type}.</Card>;
    return (<>
      {tabs.length > 2 ? <Tabs items={tabs} active={active} onPick={(t) => nav.go('contracts', { tab: t })} /> : null}
      <Card style={{ padding: '2px 0' }}>
        <KV k="contracts" v={count(shown.length)} />
        <KV k="notional" v={money(notional)} />
        {settled !== 0 ? <KV k="mark settled to the longs" hint="cumulative variation margin" v={money(settled)} /> : null}
        {classes.map((c) => <KV key={c} k={classWord(c)} v={`${count(mine.filter((k) => k.classId === c).length)} · ${money(mine.filter((k) => k.classId === c).reduce((a, k) => a + k.notional, 0))}`} />)}
      </Card>
      <Table rows={shown} keyOf={(k) => k.id} columns={[
        { key: 'id', label: 'contract', width: 1.6, render: (k) => <Link to={{ type: 'contract', id: k.id }} nav={nav}>{classWord(k.classId)}</Link> },
        { key: 'a', label: 'a', width: 0.8, render: (k) => { const r = partyRef(world, k.a); return r ? <Link to={r} nav={nav}>{partyName(world, k.a)}</Link> : partyName(world, k.a); } },
        { key: 'b', label: 'b', width: 0.8, render: (k) => { const r = partyRef(world, k.b); return r ? <Link to={r} nav={nav}>{partyName(world, k.b)}</Link> : partyName(world, k.b); } },
        { key: 'usd', label: 'size', render: (k) => money(k.notional) },
        { key: 'strike', label: 'strike', render: (k) => (k.classId === 'IRS' ? pctLevel(k.strike, 2) : k.classId === 'CDS' ? `${Math.round(k.strike)}bp` : num(k.strike, 2)) },
        { key: 'due', label: 'due', render: (k) => formatMonthYear(displayWeek(world.state, k.maturityWeek)) },
      ]} />
      {shown.length > 100 ? <Hint style={{ padding: '0 4px' }}>the largest 100 of {shown.length}.</Hint> : null}
      <Hint style={{ padding: '0 4px' }}>a is the class's first role — pays fixed, buys protection, long, hedger; b the other side. {institutionOf(world, ref.id) ? '' : ''}</Hint>
    </>);
  },
};
