/**
 * AU · all — THE DEPTH FLOOR. Every field the engine stores on this object, typed, filterable;
 * nested objects and arrays are links to their own page (a path on the same object), and any
 * string that names an object is a link to it. Nothing an overview chose to leave out is hidden.
 */

import { useState } from 'react';
import { FunctionModule } from '../fn';
import { Card, Hint, Link, Muted, Num, T, mono } from '../ui';
import { money, num } from '../format';
import { objectOf, refOfIdentifier, OBJECT_TYPES } from '../objects';

const MONEY_KEY = /USD$|^cash$|^totalDebt$|^marketCap$|Revenue$|^ebitda$|^ebit$|^netIncome$|^capex$|Capex$|^currentLiabilities$|^rndExpense$|^treasuryHoldings$/;
// §3.15-iii: no RATE_KEY. It rendered a key that looked like a rate as a percentage when the value
// was "small enough" — a unit guessed by magnitude, which printed a 0–100 field as itself and a
// fraction over five as a bare number. The depth floor shows the number the engine stores; the
// key says the unit, and an overview that knows the unit formats it.

function walk(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined;
    if (cur instanceof Map) { cur = cur.get(seg); continue; }
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** A stored key, read aloud: `annualRevenue` → "annual revenue", `cashReservesLocal` → "cash reserves". */
function humanKey(k: string): string {
  if (/^\d+$/.test(k)) return `#${k}`;
  return k
    .replace(/USD$/, '').replace(/Pct$/, ' pct').replace(/^_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase().trim();
}

function kindOf(v: unknown): string {
  if (v === null || v === undefined) return 'empty';
  if (Array.isArray(v)) return `${v.length} rows`;
  if (v instanceof Map) return `${v.size} entries`;
  if (ArrayBuffer.isView(v)) return `${(v as unknown as { length: number }).length} values`;
  if (typeof v === 'object') return `${Object.keys(v as object).length} keys`;
  return typeof v;
}

function Scalar({ k, v, world, nav }: { k: string; v: unknown; world: import('../world').World; nav: import('../ui').Nav }) {
  if (typeof v === 'number') {
    const text = MONEY_KEY.test(k) ? money(v, 2) : num(v, Number.isInteger(v) ? 0 : 4);
    return <Num neg={v < 0}>{text}</Num>;
  }
  if (typeof v === 'string') {
    const ref = refOfIdentifier(world, v);
    if (ref) return <Link to={ref} nav={nav} style={mono}>{v}</Link>;
    return <Num style={{ color: T.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{v}</Num>;
  }
  if (typeof v === 'boolean') return <Num style={{ color: v ? T.accent : T.hint }}>{v ? 'yes' : 'no'}</Num>;
  if (v === null || v === undefined) return <Hint>—</Hint>;
  return <Num>{String(v)}</Num>;
}

export const all: FunctionModule = {
  name: 'all',
  appliesTo: OBJECT_TYPES,
  blurb: 'every stored field',
  argKey: 'path',
  render({ world, ref, args, nav }) {
    return <AllView world={world} refv={ref} args={args} nav={nav} />;
  },
};

function AllView({ world, refv, args, nav }: { world: import('../world').World; refv: import('../world').ObjectRef; args: Record<string, string>; nav: import('../ui').Nav }) {
  const [filter, setFilter] = useState('');
  const root = objectOf(world, refv);
  const path = (args.path).split('.').filter(Boolean);
  const node = walk(root, path);
  if (node === undefined || node === null) return <Card style={{ padding: 14, color: T.muted }}>nothing at <Num>{args.path || '(root)'}</Num> — the field is empty this week.</Card>;

  let entries: [string, unknown][];
  if (Array.isArray(node)) entries = node.map((v, i) => [String(i), v]);
  else if (node instanceof Map) entries = [...node.entries()].map(([k, v]) => [String(k), v]);
  else if (ArrayBuffer.isView(node)) entries = Array.from(node as unknown as ArrayLike<number>).map((v, i) => [String(i), v]);
  else if (typeof node === 'object') entries = Object.entries(node as Record<string, unknown>).filter(([, v]) => typeof v !== 'function');
  else entries = [['value', node]];
  const q = filter.trim().toLowerCase();
  const shown = q ? entries.filter(([k, v]) => k.toLowerCase().includes(q) || (typeof v === 'string' && v.toLowerCase().includes(q))) : entries;
  const scalars = shown.filter(([, v]) => v === null || v === undefined || typeof v !== 'object');
  const nested = shown.filter(([, v]) => v !== null && typeof v === 'object');

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', flexWrap: 'wrap' }}>
        <Hint style={mono}>
          <span onClick={() => nav.go('all')} style={{ color: T.accent, cursor: 'pointer' }}>root</span>
          {path.map((seg, i) => <span key={i}> › <span onClick={() => nav.go('all', { path: path.slice(0, i + 1).join('.') })} style={{ color: i === path.length - 1 ? T.text : T.accent, cursor: 'pointer' }}>{seg}</span></span>)}
        </Hint>
        <Hint>{entries.length} fields</Hint>
      </div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter fields…" style={{ height: 40, padding: '0 12px', borderRadius: 8, background: T.card, border: `1px solid ${T.border}`, color: T.text, ...mono, fontSize: 14, outline: 'none' }} />
      {nested.length > 0 ? (
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, background: '#161c25' }}>nested — each a link</div>
          {nested.map(([k, v]) => (
            <div key={k} onClick={() => nav.go('all', { path: [...path, k].join('.') })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 40, padding: '0 12px', borderBottom: `1px solid ${T.rule}`, cursor: 'pointer' }}>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><Muted style={{ fontSize: 13 }}>{humanKey(k)}</Muted>{humanKey(k) !== k ? <Hint style={mono}>{k}</Hint> : null}</span>
              <span style={{ ...mono, color: T.accent, flexShrink: 0 }}>{kindOf(v)} →</span>
            </div>
          ))}
        </Card>
      ) : null}
      {scalars.length > 0 ? (
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, background: '#161c25' }}>fields</div>
          {scalars.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, padding: '0 12px', borderBottom: `1px solid ${T.rule}`, gap: 10 }}>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}><Muted style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{humanKey(k)}</Muted>{humanKey(k) !== k ? <Hint style={{ ...mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</Hint> : null}</span>
              <Scalar k={k} v={v} world={world} nav={nav} />
            </div>
          ))}
        </Card>
      ) : null}
      {shown.length === 0 ? <Card style={{ padding: 14, color: T.muted }}>no field matches “{filter}”.</Card> : null}
    </>
  );
}
