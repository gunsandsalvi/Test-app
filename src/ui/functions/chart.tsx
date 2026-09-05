/**
 * AU · chart — history for any series the object carries: the engine's rings where it keeps
 * them, the UI's tape where it does not. One SVG line, month labels, a date scrubber; the
 * change windows are month on month and year on year (§1.8), level where history is short.
 */

import { useState } from 'react';
import { FunctionModule } from '../fn';
import { Card, Hint, Num, Tabs, Th, T, mono, Nav } from '../ui';
import { changePct, pct } from '../format';
import { WEEKS_PER_MONTH, WEEKS_PER_YEAR, formatDate, formatMonthShort } from '../calendar';
import { World, displayWeek } from '../world';
import { ObjectRef, Series } from '../types';
import { moduleOf, OBJECTS, OBJECT_TYPES } from '../objects';

function seriesFor(world: World, ref: ObjectRef): Series[] {
  const m = moduleOf(ref.type);
  const obj = m.find(world, ref.id);
  return obj === undefined || !m.series ? [] : m.series(world, ref.id, obj);
}

function LineChart({ s, at, world }: { s: Series; at: number; world: World }) {
  const W = 364, H = 230, L = 12, R = 318, TOP = 24, BOT = 222;
  const vals = s.values.map((v) => (Number.isFinite(v) ? v : NaN));
  const finite = vals.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return <Card style={{ padding: 14, color: T.muted }}>{finite.length === 1 ? 'one point of history — a line needs two' : 'no history yet — step the world'}</Card>;
  let lo = Math.min(...finite), hi = Math.max(...finite);
  if (hi === lo) { hi += Math.abs(hi) * 0.05 || 1; lo -= Math.abs(lo) * 0.05 || 1; }
  const x = (i: number) => L + (i / (vals.length - 1)) * (R - L);
  const y = (v: number) => BOT - ((v - lo) / (hi - lo)) * (BOT - TOP);
  const pts = vals.map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : '')).filter(Boolean).join(' ');
  const gridYs = [0, 1, 2, 3].map((k) => TOP + (k / 3) * (BOT - TOP));
  const labelIdx = [0, Math.floor(vals.length / 2), vals.length - 1];
  return (
    <Card style={{ padding: '6px 0 0 0' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <g stroke={T.border} strokeWidth="1">{gridYs.map((gy) => <line key={gy} x1={L} y1={gy} x2={R} y2={gy} />)}</g>
        <polyline fill="none" stroke={T.accent} strokeWidth="2" strokeLinejoin="round" points={pts} />
        {Number.isFinite(vals[at]) ? (<>
          <line x1={x(at)} y1={TOP} x2={x(at)} y2={BOT} stroke={T.muted} strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={x(at)} cy={y(vals[at])} r="4" fill={T.accent} />
        </>) : null}
        {gridYs.map((gy, k) => <text key={k} x={R + 8} y={gy + 4} fontSize="11" fill={T.muted} fontFamily="JetBrains Mono, monospace">{s.fmt(hi - (k / 3) * (hi - lo))}</text>)}
        {labelIdx.map((i) => <text key={i} x={x(i) - (i === vals.length - 1 ? 20 : 0)} y={H - 2} fontSize="11" fill={T.muted} fontFamily="JetBrains Mono, monospace">{formatMonthShort(displayWeek(world.state, s.weeks[i] ?? 0))}</text>)}
      </svg>
    </Card>
  );
}

export const chart: FunctionModule = {
  name: 'chart',
  appliesTo: OBJECT_TYPES.filter((t) => !!OBJECTS[t].series),
  blurb: 'history of any series',
  argKey: 'series',
  render({ world, ref, args, nav }) {
    return <ChartView world={world} refv={ref} args={args} nav={nav} />;
  },
};

function ChartView({ world, refv, args, nav }: { world: World; refv: ObjectRef; args: Record<string, string>; nav: Nav }) {
  const all = seriesFor(world, refv);
  const names = all.map((s) => s.name);
  const wanted = (args.series).toLowerCase();
  const active = names.includes(wanted) ? wanted : names.find((n) => n.startsWith(wanted)) ?? names[0];
  const s = all.find((x) => x.name === active);
  const [scrub, setScrub] = useState<number | undefined>(undefined);
  if (!s) return <Card style={{ padding: 14, color: T.muted }}>no series on this object.</Card>;
  const n = s.values.length;
  const at = scrub === undefined || scrub >= n ? n - 1 : scrub;
  const now = s.values[n - 1];
  const mom = changePct(now, s.values[n - 1 - WEEKS_PER_MONTH]);
  const yoy = changePct(now, s.values[n - 1 - WEEKS_PER_YEAR]);
  const first = s.values.find((v) => Number.isFinite(v));
  const sinceStart = changePct(now, first);
  const date = (i: number) => formatDate(displayWeek(world.state, s.weeks[i] ?? world.state.currentWeek));
  return (
    <>
      <Tabs items={names} active={active} onPick={(t) => { setScrub(undefined); nav.go('chart', { series: t }); }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <Num style={{ fontSize: 22 }}>{n > 0 && Number.isFinite(s.values[at]) ? s.fmt(s.values[at]) : '—'}</Num>
          <Hint style={mono}>{n > 0 ? date(at) : ''} · {s.unit}</Hint>
        </span>
        {n > 1 ? <Hint style={mono}>{date(0)}: {Number.isFinite(s.values[0]) ? s.fmt(s.values[0]) : '—'}</Hint> : null}
      </div>
      <LineChart s={s} at={at} world={world} />
      <Card style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', padding: '10px 12px', gap: 8 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><Th>m/m</Th><Num neg={(mom ?? 0) < 0}>{s.level ? '—' : mom !== undefined ? pct(mom) : 'short'}</Num></span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><Th>y/y</Th><Num neg={(yoy ?? 0) < 0}>{s.level ? '—' : yoy !== undefined ? pct(yoy) : 'short'}</Num></span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><Th>since {n > 0 ? formatMonthShort(displayWeek(world.state, s.weeks[0])) : 'start'}</Th><Num neg={(sinceStart ?? 0) < 0}>{s.level ? '—' : sinceStart !== undefined ? pct(sinceStart) : 'short'}</Num></span>
      </Card>
      {n > 1 ? (
        <Card style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Th>date</Th>
          <input type="range" min={0} max={n - 1} value={at} onChange={(e) => setScrub(Number(e.target.value))} style={{ flexGrow: 1, accentColor: T.accent }} />
          <Hint style={mono}>{date(at)}</Hint>
        </Card>
      ) : null}
      <Hint style={{ padding: '0 4px' }}>{n} weekly points{n < WEEKS_PER_YEAR ? ' — a year on year reads once a year of history exists' : ''}. Type <span style={mono}>chart {names[Math.min(1, names.length - 1)]}</span> to jump to a series.</Hint>
    </>
  );
}
