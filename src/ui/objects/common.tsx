/** AU — the pieces every object overview is built from, so the screens rhyme. */

import { ReactNode } from 'react';
import { Card, Hint, Link, Muted, Tile, serif, T, Nav } from '../ui';
import { ObjectRef, Series } from '../types';
import { World, tapeSeries, displayWeek } from '../world';
import { changePct, pct } from '../format';
import { WEEKS_PER_MONTH, WEEKS_PER_YEAR, formatSpan } from '../calendar';

/** The object's name, and one line of what it is — every word in it a link where it can be. */
export function ObjectHeader({ name, sub, flag }: { name: ReactNode; sub: ReactNode; flag?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
      <div style={{ ...serif, fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15 }}>{name}</div>
      <Muted style={{ fontSize: 13, lineHeight: 1.4 }}>{sub}{flag ? <> · <span style={{ color: T.neg }}>{flag}</span></> : null}</Muted>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.muted, fontWeight: 700, padding: '6px 4px 0' }}>{children}</div>;
}

/** The change line under a headline number: month on month and year on year, level where short. */
export function ChangeSub({ series }: { series: number[] }) {
  const finite = series.filter((v) => Number.isFinite(v));
  const now = series[series.length - 1];
  const mom = changePct(now, series[series.length - 1 - WEEKS_PER_MONTH]);
  const yoy = changePct(now, series[series.length - 1 - WEEKS_PER_YEAR]);
  if (mom === undefined) return <>{finite.length > 1 ? `${formatSpan(finite.length - 1)} of history` : 'no history yet'}</>;
  return <span style={{ color: mom < 0 ? T.neg : T.accent }}>{pct(mom)} m/m{yoy !== undefined ? ` · ${pct(yoy)} y/y` : ''}</span>;
}

/** The tiles at the foot of an overview: one per function that applies, each with one line. */
export function FunctionTiles({ tiles, nav }: { tiles: { fn: string; sub: ReactNode; args?: Record<string, string> }[]; nav: Nav }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
      {tiles.map((t) => <Tile key={t.fn + (t.args?.tab ?? '')} name={t.fn} sub={t.sub} onTap={() => nav.go(t.fn, t.args ?? {})} />)}
    </div>
  );
}

/** The depth floor's door: the `all` row. */
export function AllRow({ fields, nav }: { fields: number; nav: Nav }) {
  return (
    <Card style={{ padding: '0 12px', height: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
      <span onClick={() => nav.go('all')} style={{ color: T.accent, fontWeight: 700 }}>all</span>
      <Hint>{fields} stored fields</Hint>
    </Card>
  );
}

export function RegionLink({ id, nav }: { id: string; nav: Nav }) {
  return <Link to={{ type: 'region', id }} nav={nav}>{id}</Link>;
}

export function ObjLink({ to, nav, children }: { to: ObjectRef; nav: Nav; children: ReactNode }) {
  return <Link to={to} nav={nav}>{children}</Link>;
}

/** A tape series as a chart series, with the calendar weeks it was recorded on. */
export function taped(world: World, key: string, name: string, unit: string, fmt: (v: number) => string, level = false): Series {
  const t = tapeSeries(world, key);
  return { name, weeks: t.weeks, values: t.values, unit, fmt, level };
}

/** A ring the engine keeps: its last value is this week; each earlier slot is one week back. */
export function ringed(world: World, values: number[], name: string, unit: string, fmt: (v: number) => string, level = false): Series {
  const wk = world.state.currentWeek;
  return { name, weeks: values.map((_, i) => wk - (values.length - 1 - i)), values, unit, fmt, level };
}

export const dateOf = (world: World, week: number): number => displayWeek(world.state, week);

/** An identifier read aloud: `apparel_retail` → "apparel retail", `ConsumerDiscretionaryRetail` → "consumer discretionary retail". */
export const words = (s: string): string => s.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase();
