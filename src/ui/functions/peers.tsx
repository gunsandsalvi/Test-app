/**
 * AU · peers — the screener over the object's own kind: the module names the cohorts (a firm's
 * sector in its region, the sector, the rating; a market's industry, the same good everywhere;
 * the four regions), the module's columns, any column sortable.
 */

import { FunctionModule } from '../fn';
import { Tabs, Card, T } from '../ui';
import { moduleOf, OBJECTS, OBJECT_TYPES, labelOf } from '../objects';
import { Screener } from './screener';

export const peers: FunctionModule = {
  name: 'peers',
  appliesTo: OBJECT_TYPES.filter((t) => !!OBJECTS[t].peers),
  blurb: 'the screener',
  argKey: 'tab',
  render({ world, ref, args, nav }) {
    const m = moduleOf(ref.type);
    const obj = m.find(world, ref.id);
    if (obj === undefined || !m.peers) return <Card style={{ padding: 14, color: T.muted }}>no peers for this kind.</Card>;
    const groups = m.peers.groups(world, ref.id, obj).filter((g) => g.ids.length > 0);
    if (groups.length === 0) return <Card style={{ padding: 14, color: T.muted }}>no cohort holds this object this week.</Card>;
    const wanted = (args.tab).toLowerCase();
    const active = groups.find((g) => g.name.toLowerCase() === wanted) ?? groups.find((g) => g.name.toLowerCase().includes(wanted) && wanted) ?? groups[0];
    const columns = typeof m.peers.columns === 'function' ? m.peers.columns(world, ref.id, obj) : m.peers.columns;
    return (<>
      {groups.length > 1 ? <Tabs items={groups.map((g) => g.name)} active={active.name} onPick={(t) => nav.go('peers', { tab: t })} /> : null}
      <Screener world={world} nav={nav} type={ref.type} ids={active.ids} columns={columns} subtitle={labelOf(world, ref).ticker} />
    </>);
  },
};
