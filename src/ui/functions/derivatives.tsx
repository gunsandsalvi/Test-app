/**
 * AU · derivatives — §3.17-v-ii: the region's clearing house and its market. The house's sheet,
 * open interest by class, and every member with the margin and fund it has at the house and its
 * gross and net position per class (`contract-ledger.ts:houseViewOf`). The "stats on the
 * derivative markets overall".
 */

import { FunctionModule } from '../fn';
import { houseViewOf, HouseMemberView } from '../../engine/ledger/contract-ledger';
import { ccpOwnCapitalLocal } from '../../domain/clearing-house';
import { DERIVATIVE_CLASS_IDS } from '../../domain/derivatives/registry';
import { DerivativeClassId } from '../../domain/derivatives/contract';
import { Card, Hint, KV, Link, Table, T } from '../ui';
import { money, count } from '../format';
import { regionOf } from '../world';
import { partyRef, partyName, classWord } from '../objects/contract';

export const derivatives: FunctionModule = {
  name: 'derivatives',
  appliesTo: ['region'],
  blurb: 'the clearing house and its members',
  render({ world, ref, nav }) {
    const r = regionOf(world, ref.id);
    if (!r) return null;
    const view = houseViewOf(world.v2, r.id);
    const classes = DERIVATIVE_CLASS_IDS.filter((c) => view.openInterest[c]);
    const totalContracts = classes.reduce((a, c) => a + view.openInterest[c]!.contracts, 0);
    const totalNotional = classes.reduce((a, c) => a + view.openInterest[c]!.notionalLocal, 0);
    const refused = r.ccpRefusedNotionalLocal ?? 0;
    const cell = (m: HouseMemberView, c: DerivativeClassId): string => {
      const k = m.byClass[c];
      return k ? `${money(k.netLocal)} / ${money(k.grossLocal)}` : '—';
    };
    return (<>
      <Card style={{ padding: '2px 0' }}>
        <KV k="cash held" hint="at the region's banks" v={money(view.sheet.cashLocal)} />
        <KV k="margin held" hint="both members of every contract" v={money(view.sheet.marginHeldLocal)} />
        <KV k="default fund" hint="cover-one, trued up weekly" v={money(view.sheet.defaultFundLocal)} />
        <KV k="own capital" hint="cash beyond the members' money" v={money(ccpOwnCapitalLocal(view.sheet))} />
        {refused > 0 ? <KV k="refused this week" hint="struck beyond what members could margin" v={money(refused)} /> : null}
        {r.lastWaterfall ? <KV k="latest waterfall" hint={`week ${r.lastWaterfall.week}`} v={`${partyName(world, r.lastWaterfall.member)} · loss ${money(r.lastWaterfall.lossLocal)} · unfunded ${money(r.lastWaterfall.unfundedLocal)}`} /> : null}
      </Card>
      {classes.length === 0 ? <Card style={{ padding: 14, color: T.muted }}>nothing clears here.</Card> : (<>
        <Card style={{ padding: '2px 0' }}>
          <KV k="open interest" v={`${count(totalContracts)} · ${money(totalNotional)}`} />
          {classes.map((c) => <KV key={c} k={classWord(c)} v={`${count(view.openInterest[c]!.contracts)} · ${money(view.openInterest[c]!.notionalLocal)}`} />)}
        </Card>
        <Table rows={view.members} keyOf={(m) => `${m.member.kind}:${m.member.id}`} columns={[
          { key: 'member', label: 'member', width: 1.4, render: (m) => { const to = partyRef(world, m.member); return to ? <Link to={to} nav={nav}>{partyName(world, m.member)}</Link> : partyName(world, m.member); } },
          { key: 'margin', label: 'margin', render: (m) => money(m.marginLocal) },
          { key: 'fund', label: 'fund', render: (m) => money(m.fundLocal) },
          ...classes.map((c) => ({ key: c, label: `${classWord(c)} net / gross`, render: (m: HouseMemberView) => cell(m, c) })),
        ]} />
        <Hint style={{ padding: '0 4px' }}>net counts the class's first role long — pays fixed, buys protection, long the future, hedger — and the other side short.</Hint>
      </>)}
    </>);
  },
};
