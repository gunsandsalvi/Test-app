/**
 * AU · curves — the sovereign curve's shape today against a month and a year ago, the rates it
 * hangs off (policy, repo, neutral, the rule), the swap spreads where the region quotes them.
 */

import { FunctionModule } from '../fn';
import { Card, Hint, KV, Table, T, mono } from '../ui';
import { pctLevel, pct, bps } from '../format';
import { WEEKS_PER_MONTH, WEEKS_PER_YEAR } from '../calendar';
import { regionOf, tapeSeries } from '../world';
import { TENORS, tenorRate } from '../objects/curve';
import { SectionLabel } from '../objects/common';

const TENOR_YEARS: Record<string, number> = { '3M': 0.25, '2Y': 2, '5Y': 5, '10Y': 10, '30Y': 30 };

function Shape({ curves }: { curves: { name: string; points: { t: string; v: number }[]; dim?: boolean }[] }) {
  const W = 364, H = 200, L = 12, R = 318, TOP = 20, BOT = 178;
  const all = curves.flatMap((c) => c.points.map((p) => p.v)).filter(Number.isFinite);
  if (all.length < 2) return <Card style={{ padding: 14, color: T.muted }}>no curve yet.</Card>;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi === lo) { hi += 0.005; lo -= 0.005; }
  const xs = (t: string) => L + (Math.log(TENOR_YEARS[t] * 4) / Math.log(120)) * (R - L);
  const y = (v: number) => BOT - ((v - lo) / (hi - lo)) * (BOT - TOP);
  const gridYs = [0, 1, 2, 3].map((k) => TOP + (k / 3) * (BOT - TOP));
  return (
    <Card style={{ padding: '6px 0 0 0' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <g stroke={T.border} strokeWidth="1">{gridYs.map((gy) => <line key={gy} x1={L} y1={gy} x2={R} y2={gy} />)}</g>
        {curves.map((c) => (
          <polyline key={c.name} fill="none" stroke={c.dim ? T.hint : T.accent} strokeWidth={c.dim ? 1 : 2} strokeDasharray={c.dim ? '4 3' : undefined} strokeLinejoin="round"
            points={c.points.filter((p) => Number.isFinite(p.v)).map((p) => `${xs(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} />
        ))}
        {curves[0].points.map((p) => <circle key={p.t} cx={xs(p.t)} cy={y(p.v)} r="3" fill={T.accent} />)}
        {gridYs.map((gy, k) => <text key={k} x={R + 8} y={gy + 4} fontSize="11" fill={T.muted} fontFamily="JetBrains Mono, monospace">{pctLevel(hi - (k / 3) * (hi - lo), 2)}</text>)}
        {TENORS.map((t) => <text key={t} x={xs(t) - 8} y={H - 4} fontSize="11" fill={T.muted} fontFamily="JetBrains Mono, monospace">{t.toLowerCase()}</text>)}
      </svg>
    </Card>
  );
}

export const curves: FunctionModule = {
  name: 'curves',
  appliesTo: ['region', 'curve', 'centralbank'],
  blurb: 'the shape, every tenor',
  render({ world, ref }) {
    const r = regionOf(world, ref.id);
    if (!r) return null;
    const back = (t: string, weeks: number) => { const s = tapeSeries(world, `curve:${r.id}:${t}`).values; return s[s.length - 1 - weeks]; };
    const today = TENORS.map((t) => ({ t, v: tenorRate(r, t) ?? NaN }));
    const month = TENORS.map((t) => ({ t, v: back(t, WEEKS_PER_MONTH) }));
    const year = TENORS.map((t) => ({ t, v: back(t, WEEKS_PER_YEAR) }));
    const shapes = [{ name: 'today', points: today }];
    if (month.some((p) => Number.isFinite(p.v))) shapes.push({ name: 'a month ago', points: month, dim: true } as never);
    if (year.some((p) => Number.isFinite(p.v))) shapes.push({ name: 'a year ago', points: year, dim: true } as never);
    const slope = (r.zeroRates.tenor10Y) - (r.zeroRates.tenor2Y);
    const swaps: Partial<Record<string, number>> = r.swapSpreadBpsByTenor ?? {}; // per tenor the swap book has printed
    return (<>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
        <Hint>solid: today · dashed: a month, a year ago</Hint>
        <Hint style={mono}>2s10s {pct(slope, 2)} · {slope < 0 ? 'inverted' : 'upward'}</Hint>
      </div>
      <Shape curves={shapes} />
      <Table rows={TENORS.map((t) => ({ t }))} keyOf={(x) => x.t} columns={[
        { key: 't', label: 'tenor', render: (x) => x.t.toLowerCase() },
        { key: 'now', label: 'today', render: (x) => pctLevel(tenorRate(r, x.t), 2) },
        { key: 'w', label: '1w', render: (x) => { const p = back(x.t, 1); return Number.isFinite(p) ? `${bps(((tenorRate(r, x.t) ?? 0) - p) * 10_000)}bp` : '—'; } },
        { key: 'm', label: '1m', render: (x) => { const p = back(x.t, WEEKS_PER_MONTH); return Number.isFinite(p) ? `${bps(((tenorRate(r, x.t) ?? 0) - p) * 10_000)}bp` : '—'; } },
        { key: 'swap', label: 'swap sprd', render: (x) => { const s = swaps[x.t] ?? swaps[x.t.toLowerCase()] ?? swaps[`s${parseInt(x.t)}`]; return s !== undefined ? `${bps(s)}bp` : '—'; } },
      ]} />
      <SectionLabel>what it hangs off</SectionLabel>
      <Card style={{ padding: '2px 0' }}>
        <KV k="policy rate" hint={r.centralBank} v={pctLevel(r.policyRate, 2)} />
        <KV k="the rule says" hint="Taylor" v={pctLevel(r.taylorTargetRate, 2)} />
        <KV k="neutral" v={pctLevel(r.neutralRate, 2)} />
        <KV k="overnight repo" v={pctLevel(r.repoRateAnnual, 2)} />
        <KV k="expected inflation" hint="the market's" v={pctLevel(r.expectedInflation, 2)} />
        <KV k="dot plot" hint="1y · 2y" v={`${pctLevel(r.dotPlot1Y, 2)} · ${pctLevel(r.dotPlot2Y, 2)}`} />
        <KV k="sovereign rating" v={r.sovereignRating} />
      </Card>
    </>);
  },
};
