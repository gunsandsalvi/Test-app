/**
 * AU · lines — a firm's product lines: each a market (a link), with its share, its capacity,
 * what it sold last week against what management expects, what sits in the warehouse.
 */

import { FunctionModule } from '../fn';
import { Card, Hint, KV, Link, Table, T } from '../ui';
import { money, pctLevel, count, num } from '../format';
import { companyOf, regionOf } from '../world';
import { marketId, subUnitLabel, fillOf } from '../objects/market';
import { words, SectionLabel } from '../objects/common';

export const lines: FunctionModule = {
  name: 'lines',
  appliesTo: ['company'],
  blurb: 'the product lines, each a market',
  render({ world, ref, nav }) {
    const c = companyOf(world, ref.id);
    if (!c) return null;
    const ls = c.productLines ?? [];
    if (ls.length === 0) return <Card style={{ padding: 14, color: T.muted }}>{c.ticker} sells nothing by the unit — {c.isBankEntity ? 'a bank earns a margin, not a price' : 'no product line is on record'}.</Card>;
    const reg = regionOf(world, c.region);
    const sales = c.lastWeekSalesUnitsBySubUnit ?? {};
    const expected = c.expectedSalesUnitsBySubUnit ?? {};
    const inv = c.outputInventoryBySubUnit ?? {};
    const rows = [...ls].sort((a, b) => b.revenueShare - a.revenueShare);
    const stockUSD = Object.values(inv).reduce((a, v) => a + v.valueUSD, 0);
    return (<>
      <Card style={{ padding: '2px 0' }}>
        <KV k="lines" hint={rows.map((l) => words(l.industry)).filter((v, i, a) => a.indexOf(v) === i).join(' · ')} v={count(rows.length)} />
        <KV k="finished goods in stock" v={money(stockUSD)} />
        <KV k="plant mothballed" v={pctLevel(c.mothballedPpeShare ?? 0, 0)} />
        <KV k="input supply constraint" hint="1 = unconstrained" v={num(c.inputSupplyConstraintFactor, 2)} />
      </Card>
      <SectionLabel>the lines</SectionLabel>
      <Table rows={rows} keyOf={(l) => l.subUnitId} columns={[
        { key: 'line', label: 'line', width: 1.7, render: (l) => <Link to={{ type: 'market', id: marketId(c.region, l.subUnitId) }} nav={nav}>{subUnitLabel(l.subUnitId)}</Link> },
        { key: 'rev', label: 'of rev', render: (l) => pctLevel(l.revenueShare, 0) },
        { key: 'share', label: 'share', render: (l) => pctLevel(l.categoryMarketShare, 1) },
        { key: 'edge', label: 'edge', render: (l) => num(l.competitiveness, 2) },
        { key: 'move', label: '13w', render: (l) => (l.categoryMarketShare13WeeksAgo !== undefined ? `${((l.categoryMarketShare - l.categoryMarketShare13WeeksAgo) * 100).toFixed(1)}pt` : '—') },
      ]} />
      <SectionLabel>units a week</SectionLabel>
      <Table rows={rows} keyOf={(l) => l.subUnitId} columns={[
        { key: 'line', label: 'line', width: 1.5, render: (l) => <Link to={{ type: 'market', id: marketId(c.region, l.subUnitId) }} nav={nav}>{subUnitLabel(l.subUnitId)}</Link> },
        { key: 'cap', label: 'makes', render: (l) => (l.weeklyCapacityUnits !== undefined ? count(Math.round(l.weeklyCapacityUnits)) : '—') },
        { key: 'sold', label: 'sold', render: (l) => (sales[l.subUnitId] !== undefined ? count(Math.round(sales[l.subUnitId])) : '—') },
        { key: 'exp', label: 'expects', render: (l) => (expected[l.subUnitId] !== undefined ? count(Math.round(expected[l.subUnitId])) : '—') },
        { key: 'stock', label: 'stock', render: (l) => (inv[l.subUnitId] ? count(Math.round(inv[l.subUnitId].unitsHeld)) : '—') },
      ]} />
      <SectionLabel>the markets</SectionLabel>
      <Table rows={rows} keyOf={(l) => l.subUnitId} columns={[
        { key: 'line', label: 'market', width: 2, render: (l) => <Link to={{ type: 'market', id: marketId(c.region, l.subUnitId) }} nav={nav}>{subUnitLabel(l.subUnitId)}</Link> },
        { key: 'price', label: 'price', render: (l) => num(reg?.categoryDemand[l.subUnitId as keyof typeof reg.categoryDemand]?.unitPriceUSD) },
        { key: 'fill', label: 'fill', render: (l) => { const d = reg?.categoryDemand[l.subUnitId as keyof typeof reg.categoryDemand]; const f = d ? fillOf(d) : undefined; return f !== undefined ? pctLevel(f, 0) : '—'; } },
        { key: 'mine', label: 'my share', render: (l) => pctLevel(l.categoryMarketShare, 1) },
      ]} />
      <Hint style={{ padding: '0 4px' }}>tap a line to open its market: every seller, the price history, who buys.</Hint>
    </>);
  },
};
