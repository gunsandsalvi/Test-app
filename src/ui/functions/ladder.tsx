/**
 * AU · ladder — the debt, tranche by tranche: a firm's bonds, loans, paper and bank facilities
 * (each a tranche object), the sovereign's stock by tenor. The maturity wall by year under it.
 */

import { FunctionModule } from '../fn';
import { ensureV2 } from '../../engine2/world';
import { materializeGovLadder } from '../../engine2/tranches';
import { Card, Hint, KV, Link, Table, T, mono, Nav } from '../ui';
import { money, pctLevel, count } from '../format';
import { formatDate, formatMonthYear, WEEKS_PER_YEAR } from '../calendar';
import { World, companyOf, regionOf, displayWeek } from '../world';
import { materializeLadder } from '../../engine2/tranches';
import { trancheId } from '../objects/tranche';
import { SectionLabel } from '../objects/common';

interface Row { id: string; key: string; kind: string; principalUSD: number; rate: number; maturityWeek: number; originationWeek: number; note?: string }

function Wall({ rows, world }: { rows: Row[]; world: World }) {
  const now = world.state.currentWeek;
  const byYear = new Map<number, number>();
  rows.forEach((r) => { const y = Math.max(0, Math.floor((r.maturityWeek - now) / WEEKS_PER_YEAR)); byYear.set(y, (byYear.get(y) ?? 0) + r.principalUSD); });
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  const max = Math.max(1, ...years.map(([, v]) => v));
  return (
    <Card style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {years.map(([y, v]) => (
        <div key={y} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 72px', gap: 8, alignItems: 'center' }}>
          <Hint style={mono}>{y === 0 ? 'this year' : y === 1 ? 'next year' : `in ${y} years`}</Hint>
          <div style={{ height: 10, background: T.border, borderRadius: 3 }}><div style={{ width: `${(100 * v / max).toFixed(1)}%`, height: '100%', background: T.accent, borderRadius: 3 }} /></div>
          <span style={{ ...mono, textAlign: 'right', fontSize: 12 }}>{money(v)}</span>
        </div>
      ))}
    </Card>
  );
}

function LadderTable({ rows, world, nav }: { rows: Row[]; world: World; nav: Nav }) {
  const now = world.state.currentWeek;
  return (
    <Table rows={rows} keyOf={(r) => r.key} columns={[
      { key: 'id', label: 'tranche', width: 1.6, render: (r) => <Link to={{ type: 'tranche', id: r.key }} nav={nav}>{r.id}</Link> },
      { key: 'kind', label: 'kind', width: 0.9, render: (r) => r.kind },
      { key: 'usd', label: 'size', width: 0.9, render: (r) => money(r.principalUSD) },
      { key: 'rate', label: 'rate', width: 0.8, render: (r) => pctLevel(r.rate, 2) },
      { key: 'due', label: 'due', width: 1.1, render: (r) => (r.maturityWeek - now <= 0 ? 'now' : formatMonthYear(displayWeek(world.state, r.maturityWeek))) },
    ]} />
  );
}

export const ladder: FunctionModule = {
  name: 'ladder',
  appliesTo: ['company', 'region', 'curve'],
  blurb: 'the debt, tranche by tranche',
  render({ world, ref, nav }) {
    const now = world.state.currentWeek;
    if (ref.type === 'company') {
      const c = companyOf(world, ref.id);
      if (!c) return null;
      const policy = regionOf(world, c.region)?.policyRate ?? 0;
      const rows: Row[] = materializeLadder(world.v2, c.id).map((t) => ({
        id: t.id, key: trancheId(c.id, t.id),
        kind: t.isCommercialPaper ? 'paper' : t.isBankFacility ? `facility${t.facilityBankTicker ? ` · ${t.facilityBankTicker}` : ''}` : t.seniority === 'SUBORDINATED' ? 'sub bond' : t.rateType === 'FLOATING' ? 'loan' : 'bond',
        principalUSD: t.principalUSD, rate: t.rateType === 'FLOATING' ? policy + (t.floatingMarginBps ?? 0) / 10_000 : (t.couponRate ?? 0),
        maturityWeek: t.maturityWeek, originationWeek: t.originationWeek,
      })).sort((a, b) => a.maturityWeek - b.maturityWeek);
      const total = rows.reduce((a, r) => a + r.principalUSD, 0);
      const interest = rows.reduce((a, r) => a + r.principalUSD * r.rate, 0);
      const next = rows[0];
      if (rows.length === 0) return <Card style={{ padding: 14, color: T.muted }}>{c.ticker} carries no debt — no bond, loan, paper or facility on the ladder.</Card>;
      return (<>
        <Card style={{ padding: '2px 0' }}>
          <KV k="outstanding" hint={`${rows.length} tranches`} v={money(total)} />
          <KV k="annual interest" hint={total > 0 ? `${pctLevel(interest / total, 2)} blended` : undefined} v={money(interest)} />
          <KV k="next maturity" hint={next ? next.id : undefined} v={next ? (next.maturityWeek - now <= 0 ? 'now' : `${formatDate(displayWeek(world.state, next.maturityWeek))} · ${money(next.principalUSD)}`) : '—'} />
          <KV k="due within a year" v={money(rows.filter((r) => r.maturityWeek - now < WEEKS_PER_YEAR).reduce((a, r) => a + r.principalUSD, 0))} />
          <KV k="coverage" hint="ebitda over interest" v={interest > 0 ? `${(c.ebitda / interest).toFixed(1)}×` : '—'} />
        </Card>
        <SectionLabel>the wall</SectionLabel>
        <Wall rows={rows} world={world} />
        <SectionLabel>the tranches, soonest first</SectionLabel>
        <LadderTable rows={rows} world={world} nav={nav} />
      </>);
    }
    const r = regionOf(world, ref.id);
    if (!r) return null;
    const rows: Row[] = materializeGovLadder(ensureV2(world.state), r.id).map((t) => ({
      id: t.id, key: trancheId(r.id, t.id), kind: `${t.tenorAtIssuanceYears}y`, principalUSD: t.principalUSD, rate: t.couponRate, maturityWeek: t.maturityWeek, originationWeek: t.originationWeek,
    })).sort((a, b) => a.maturityWeek - b.maturityWeek);
    const total = rows.reduce((a, x) => a + x.principalUSD, 0);
    const interest = rows.reduce((a, x) => a + x.principalUSD * x.rate, 0);
    const gdp = r.derivedNominalGdpUSD ?? r.estimatedNominalGdpUSD ?? 0;
    const byTenor = new Map<string, number>();
    rows.forEach((x) => byTenor.set(x.kind, (byTenor.get(x.kind) ?? 0) + x.principalUSD));
    if (rows.length === 0) return <Card style={{ padding: 14, color: T.muted }}>the {r.id} treasury has no tranches outstanding.</Card>;
    return (<>
      <Card style={{ padding: '2px 0' }}>
        <KV k="outstanding" hint={`${count(rows.length)} tranches`} v={money(total)} />
        <KV k="of gdp" v={gdp > 0 ? pctLevel(total / gdp, 0) : '—'} />
        <KV k="annual interest" hint={total > 0 ? `${pctLevel(interest / total, 2)} blended` : undefined} v={money(interest)} />
        <KV k="due within a year" v={money(rows.filter((x) => x.maturityWeek - now < WEEKS_PER_YEAR).reduce((a, x) => a + x.principalUSD, 0))} />
        {[...byTenor.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([k, v]) => <KV key={k} k={`issued as ${k}`} v={money(v)} />)}
      </Card>
      <SectionLabel>the wall</SectionLabel>
      <Wall rows={rows} world={world} />
      <SectionLabel>the tranches, soonest first</SectionLabel>
      <LadderTable rows={rows.slice(0, 80)} world={world} nav={nav} />
      {rows.length > 80 ? <Hint style={{ padding: '0 4px' }}>{rows.length - 80} more, later.</Hint> : null}
    </>);
  },
};
