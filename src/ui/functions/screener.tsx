/**
 * AU — the one SCREENER: a set of ids of one kind, the kind's own columns, any column sortable.
 * `peers`, `markets`, `pools`, `labour`, `banks`, `firms`, `funds`, `books` are all this table.
 */

import { useState } from 'react';
import { Card, Hint, Table, T, Nav } from '../ui';
import { World } from '../world';
import { ObjectType } from '../types';
import { moduleOf } from '../objects';
import { PeerColumn } from '../objects/registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyColumn = PeerColumn<any>;

/** The kind's screener columns for an anchor object (or the kind's plain set when there is none). */
export function columnsFor(world: World, type: ObjectType, anchorId?: string): AnyColumn[] {
  const m = moduleOf(type);
  if (!m.peers) return [];
  if (typeof m.peers.columns === 'function') {
    const id = anchorId ?? m.list(world)[0]?.id;
    const obj = id !== undefined ? m.find(world, id) : undefined;
    return obj !== undefined ? m.peers.columns(world, id!, obj) : [];
  }
  return m.peers.columns;
}

export function Screener({ world, nav, type, ids, columns, sort: initialSort, subtitle, limit = 400, noun, hide }: {
  world: World; nav: Nav; type: ObjectType; ids: string[]; columns?: AnyColumn[]; sort?: string; subtitle?: string; limit?: number; noun?: [string, string]; hide?: string[];
}) {
  const m = moduleOf(type);
  const cols = (columns ?? columnsFor(world, type)).filter((c) => !hide?.includes(c.key));
  const [sort, setSort] = useState(initialSort ?? m.peers?.defaultSort ?? cols[1]?.key ?? 'name');
  const [asc, setAsc] = useState(false);
  const rows = ids.map((id) => ({ id, obj: m.find(world, id) })).filter((r) => r.obj !== undefined) as { id: string; obj: unknown }[];
  const col = cols.find((c) => c.key === sort) ?? cols[1] ?? cols[0];
  if (!col) return <Card style={{ padding: 14, color: T.muted }}>this kind has no screener.</Card>;
  const sorted = [...rows].sort((a, b) => {
    const va = col.value(a, world), vb = col.value(b, world);
    const d = typeof va === 'number' && typeof vb === 'number' ? vb - va : String(va).localeCompare(String(vb));
    return asc ? -d : d;
  });
  const pick = (k: string) => { if (k === sort) setAsc((x) => !x); else { setSort(k); setAsc(false); } };
  return (<>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px', gap: 8 }}>
      <Hint>{rows.length} {rows.length === 1 ? (noun ?? m.words)[0] : (noun ?? m.words)[1]} · by {col.label}{asc ? ', ascending' : ''}</Hint>
      {subtitle ? <Hint style={{ textAlign: 'right' }}>{subtitle}</Hint> : null}
    </div>
    {rows.length === 0 ? <Card style={{ padding: 14, color: T.muted }}>nothing in this set this week.</Card> : (
      <Table rows={sorted.slice(0, limit)} keyOf={(r) => r.id} sortKey={sort} onSort={pick}
        columns={cols.map((c) => ({ key: c.key, label: c.label, sortable: true, width: c.width, render: (r: { id: string; obj: unknown }) => c.render(r, world, nav) }))} />
    )}
    {sorted.length > limit ? <Hint style={{ padding: '0 4px' }}>the first {limit} of {sorted.length} — sort to bring others up.</Hint> : null}
  </>);
}
