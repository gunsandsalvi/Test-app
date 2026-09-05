/**
 * AU — the design's primitives (the approved "Slice 1" canvas): dark slate cards, segmented
 * underline tabs, ONE accent used only for links and the active tab, a serif object name,
 * tabular numerals. Every identifier rendered anywhere is a link (the depth rule).
 */

import { ReactNode, useRef, useState } from 'react';
import { ObjectRef } from './world';

export const T = {
  bg: '#12171f', card: '#1a212b', border: '#242d39', rule: '#1f2733', text: '#e9ecf1',
  muted: '#8d97a6', hint: '#6f7a8a', accent: '#b7e36a', neg: '#f08a8a', input: '#2e3947',
};

export const mono: React.CSSProperties = { fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace', fontVariantNumeric: 'tabular-nums' };
export const serif: React.CSSProperties = { fontFamily: '"Source Serif 4", Georgia, serif' };

export interface Nav {
  /** Open in this panel (pushes the back stack). */
  open(ref: ObjectRef, fn?: string, args?: Record<string, string>): void;
  /** Open in a NEW panel to the right (long-press). */
  openNew(ref: ObjectRef, fn?: string, args?: Record<string, string>): void;
  /** Change the function on the current object (same panel). */
  go(fn: string, args?: Record<string, string>): void;
}

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, ...style }}>{children}</div>;
}

export function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <span style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.muted, fontWeight: 700, textAlign: right ? 'right' : 'left' }}>{children}</span>;
}

export function Hint({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <span style={{ fontSize: 11, color: T.hint, ...style }}>{children}</span>;
}

export function Muted({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <span style={{ color: T.muted, ...style }}>{children}</span>;
}

export function Num({ children, style, neg }: { children: ReactNode; style?: React.CSSProperties; neg?: boolean }) {
  return <span style={{ ...mono, color: neg ? T.neg : undefined, ...style }}>{children}</span>;
}

/** A key/value row, 40px tall, hairline-ruled. */
export function KV({ k, v, hint, onTap }: { k: ReactNode; v: ReactNode; hint?: ReactNode; onTap?: () => void }) {
  return (
    <div onClick={onTap} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, padding: '0 14px', borderBottom: `1px solid ${T.rule}`, gap: 10, cursor: onTap ? 'pointer' : undefined }}>
      <span style={{ color: T.muted, display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>{k}{hint ? <Hint>· {hint}</Hint> : null}</span>
      <span style={{ ...mono, textAlign: 'right', flexShrink: 0 }}>{v}</span>
    </div>
  );
}

/** A link to an object: tap opens it here, long-press opens it in a new panel. */
export function Link({ to, fn, args, nav, children, style }: { to: ObjectRef; fn?: string; args?: Record<string, string>; nav: Nav; children: ReactNode; style?: React.CSSProperties }) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const start = () => { fired.current = false; timer.current = window.setTimeout(() => { fired.current = true; nav.openNew(to, fn, args); }, 500); };
  const cancel = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = undefined; };
  return (
    <span
      role="link"
      onClick={(e) => { e.stopPropagation(); if (!fired.current) nav.open(to, fn, args); }}
      onContextMenu={(e) => { e.preventDefault(); nav.openNew(to, fn, args); }}
      onTouchStart={start} onTouchEnd={cancel} onTouchMove={cancel} onMouseDown={start} onMouseUp={cancel} onMouseLeave={cancel}
      style={{ color: T.accent, cursor: 'pointer', ...style }}
    >{children}</span>
  );
}

/** Segmented underline tabs. */
export function Tabs({ items, active, onPick }: { items: string[]; active: string; onPick: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, overflowX: 'auto' }}>
      {items.map((t) => (
        <span key={t} onClick={() => onPick(t)} style={{ display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 12px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: t === active ? T.text : T.muted, borderBottom: `2px solid ${t === active ? T.accent : 'transparent'}`, marginBottom: -1, cursor: 'pointer' }}>{t}</span>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, neg }: { label: string; value: ReactNode; sub?: ReactNode; neg?: boolean }) {
  return (
    <div style={{ background: T.card, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Th>{label}</Th>
      <Num style={{ fontSize: 19 }} neg={neg}>{value}</Num>
      {sub !== undefined ? <Hint style={{ ...mono }}>{sub}</Hint> : null}
    </div>
  );
}

export function StatGrid({ children, cols = 3 }: { children: ReactNode; cols?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 1, background: T.border, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>{children}</div>;
}

/** A function tile on an overview: name + one line of what it holds. */
export function Tile({ name, sub, onTap }: { name: string; sub: ReactNode; onTap: () => void }) {
  return (
    <Card style={{ padding: '10px 12px', minHeight: 54, display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center', cursor: 'pointer' }}>
      <span onClick={onTap} style={{ color: T.accent, fontWeight: 700 }}>{name}</span>
      <Hint style={{ ...mono }}>{sub}</Hint>
    </Card>
  );
}

/** An honest empty state: a function with nothing to show says why, it never vanishes. */
export function Empty({ children }: { children: ReactNode }) {
  return <Card style={{ padding: '14px', color: T.muted, fontSize: 13 }}>{children}</Card>;
}

/** A sortable, statement-style table: first column left, the rest right-aligned numerals. */
/**
 * §3.14-SHELL — ONE CAP FOR EVERY LONG LIST. A table renders its first `TABLE_CAP` rows and says
 * so beneath them, with the control that shows the rest; the caller hands it everything it holds
 * and never slices. Three call sites used to cap on their own (400 with a hint, 60 and 40 in
 * silence) and ten rendered whole — a register of holders stalled the phone at its full length,
 * and a silent slice was a truncation the reader could neither see nor undo.
 */
const TABLE_CAP = 50;

export function Table<R>({ columns, rows, sortKey, onSort, keyOf }: {
  columns: { key: string; label: string; render: (r: R) => ReactNode; sortable?: boolean; width?: number }[];
  rows: R[]; sortKey?: string; onSort?: (k: string) => void; keyOf: (r: R) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const grid = columns.map((c, i) => `minmax(0, ${c.width ?? (i === 0 ? 1.4 : 1)}fr)`).join(' ');
  const capped = !expanded && rows.length > TABLE_CAP;
  const shown = capped ? rows.slice(0, TABLE_CAP) : rows;
  return (
    <Card style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 6, alignItems: 'center', height: 34, padding: '0 12px', background: '#161c25' }}>
        {columns.map((c, i) => (
          <span key={c.key} onClick={c.sortable && onSort ? () => onSort(c.key) : undefined} style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: sortKey === c.key ? T.text : T.muted, fontWeight: 700, textAlign: i === 0 ? 'left' : 'right', cursor: c.sortable ? 'pointer' : undefined, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {c.label}{sortKey === c.key ? ' ▼' : ''}
          </span>
        ))}
      </div>
      {shown.map((r) => (
        <div key={keyOf(r)} style={{ display: 'grid', gridTemplateColumns: grid, gap: 6, alignItems: 'center', minHeight: 40, padding: '0 12px', borderBottom: `1px solid ${T.rule}` }}>
          {columns.map((c, i) => <span key={c.key} style={{ ...(i === 0 ? {} : mono), textAlign: i === 0 ? 'left' : 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.render(r)}</span>)}
        </div>
      ))}
      {rows.length > TABLE_CAP ? (
        <div onClick={() => setExpanded((x) => !x)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 40, padding: '0 12px', cursor: 'pointer' }}>
          <Hint>{capped ? `the first ${TABLE_CAP} of ${rows.length}` : `all ${rows.length}`}</Hint>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>{capped ? 'show all' : 'show fewer'}</span>
        </div>
      ) : null}
    </Card>
  );
}
