/** AU · object: market — one good in one region: its price, what was asked for and delivered, who sells it and who buys it. */

import { defineObject } from './registry';
import { Card, KV, Link, Stat, StatGrid } from '../ui';
import { money, pctLevel, num, count } from '../format';
import { World, regionOf, tapeSeries } from '../world';
import { REGION_IDS, type RegionId } from '../../domain/geography';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../domain/market-microstructure';
import { INDUSTRY_REGISTRY, industryOfSubUnit } from '../../domain/industry-registry';
import { categoryPriceTier } from '../../domain/industry';
import { isActiveCompany } from '../../domain/company';
import { ObjectHeader, ChangeSub, FunctionTiles, AllRow, RegionLink, taped, words } from './common';

export type Market = { region: string; subUnitId: string; d: NonNullable<ReturnType<typeof stateOf>> };

function stateOf(world: World, region: string, subUnitId: string) {
  const reg = regionOf(world, region);
  return reg?.categoryDemand[subUnitId as keyof typeof reg.categoryDemand];
}

const LABELS = new Map<string, string>();
Object.values(INDUSTRY_REGISTRY).forEach((spec) => spec.subUnits.forEach((su) => LABELS.set(su.unitId, su.label)));
export const subUnitLabel = (id: string): string => LABELS.get(id) ?? words(id);

export const marketId = (region: string, subUnitId: string): string => `${region}:${subUnitId}`;
/** Units delivered over units asked for; undefined when nobody bid this week. */
export const fillOf = (d: { totalUnitsDemandedThisWeek?: number; totalUnitsSuppliedThisWeek?: number }): number | undefined =>
  (d.totalUnitsDemandedThisWeek ?? 0) > 0 ? (d.totalUnitsSuppliedThisWeek ?? 0) / (d.totalUnitsDemandedThisWeek ?? 1) : undefined;
export const splitMarketId = (id: string): { region: string; subUnitId: string } => { const i = id.indexOf(':'); return { region: id.slice(0, i), subUnitId: id.slice(i + 1) }; };

/** The firms with a line in this market, with each line's share and capacity. */
export function sellersOf(world: World, region: string, subUnitId: string) {
  return world.state.companies
    .filter((c) => c.region === region && isActiveCompany(c) && (c.productLines ?? []).some((l) => l.subUnitId === subUnitId))
    .map((c) => { const l = c.productLines!.find((x) => x.subUnitId === subUnitId)!; return { c, line: l }; })
    .sort((a, b) => (b.line.categoryMarketShare ?? 0) - (a.line.categoryMarketShare ?? 0));
}

export const market = defineObject<Market>({
  type: 'market',
  words: ['market', 'markets'],
  searchable: true,
  find: (world, id) => { const { region, subUnitId } = splitMarketId(id); const d = stateOf(world, region, subUnitId); return d ? { region, subUnitId, d } : undefined; },
  list: (world) => REGION_IDS.flatMap((r) => { const reg = world.state.regions[r]; return reg ? Object.keys(reg.categoryDemand).map((su) => ({ id: marketId(r, su), obj: { region: r, subUnitId: su, d: reg.categoryDemand[su as keyof typeof reg.categoryDemand]! } })) : []; }),
  label: (_w, _id, m) => ({ ticker: `${m.region} ${words(m.subUnitId)}`, name: `${subUnitLabel(m.subUnitId)} in ${m.region}`, kind: 'goods market', region: m.region }),
  keywords: (_w, _id, m) => [m.region.toLowerCase(), words(m.subUnitId), subUnitLabel(m.subUnitId).toLowerCase(), (industryOfSubUnit(m.subUnitId) ?? '').toLowerCase()],
  parse: (world, phrase) => {
    const p = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
    for (const r of REGION_IDS) {
      const rl = r.toLowerCase();
      if (!p.startsWith(rl + ' ')) continue;
      const rest = p.slice(rl.length + 1).replace(/ /g, '_');
      const reg = world.state.regions[r];
      if (reg && reg.categoryDemand[rest as keyof typeof reg.categoryDemand]) return marketId(r, rest);
    }
    return undefined;
  },
  headline: (_w, _id, m) => { const f = fillOf(m.d); return { value: num(m.d.unitPriceLocal), sub: f !== undefined ? `fill ${pctLevel(f, 0)}` : 'no bids', neg: f !== undefined && f < 0.8 }; },
  series: (world, id) => [
    taped(world, `market:${id}:price`, 'price', 'USD per unit', (v) => num(v)),
    taped(world, `market:${id}:supplied`, 'supplied', 'units per week', (v) => count(Math.round(v))),
    taped(world, `market:${id}:demanded`, 'demanded', 'units per week', (v) => count(Math.round(v))),
    taped(world, `market:${id}:demand usd`, 'demand', 'USD, annualised', (v) => money(v)),
  ],
  peers: {
    groups: (world, _id, m) => {
      const ind = industryOfSubUnit(m.subUnitId);
      const inRegion = Object.keys(world.state.regions[m.region as 'USA']?.categoryDemand ?? {});
      return [
        { name: `${m.region} · ${words(ind ?? '')}`, ids: inRegion.filter((su) => industryOfSubUnit(su) === ind).map((su) => marketId(m.region, su)) },
        { name: `${words(m.subUnitId)} everywhere`, ids: REGION_IDS.filter((r) => world.state.regions[r]?.categoryDemand[m.subUnitId as 'apparel_retail']).map((r) => marketId(r, m.subUnitId)) },
        { name: `all of ${m.region}`, ids: inRegion.map((su) => marketId(m.region, su)) },
      ];
    },
    defaultSort: 'fill',
    columns: [
      { key: 'name', label: 'market', width: 1.7, render: (r, _w, nav) => <Link to={{ type: 'market', id: r.id }} nav={nav}>{words(r.obj.subUnitId)}</Link>, value: (r) => r.obj.subUnitId },
      { key: 'region', label: 'reg', width: 0.55, render: (r) => r.obj.region, value: (r) => r.obj.region },
      { key: 'price', label: 'price', width: 1.1, render: (r) => num(r.obj.d.unitPriceLocal), value: (r) => r.obj.d.unitPriceLocal ?? 0 },
      { key: 'fill', label: 'fill', width: 0.7, render: (r) => { const f = fillOf(r.obj.d); return f !== undefined ? pctLevel(f, 0) : '—'; }, value: (r) => fillOf(r.obj.d) ?? -1 },
      { key: 'demand', label: 'demand', width: 1, render: (r) => money(r.obj.d.demandLevelAnnualLocal), value: (r) => r.obj.d.demandLevelAnnualLocal },
      { key: 'move', label: '1w', width: 0.7, render: (r) => { const ph = r.obj.d.priceHistory ?? []; const p0 = ph[ph.length - 2]; return p0 > 0 ? pctLevel(ph[ph.length - 1] / p0 - 1, 0) : '—'; }, value: (r) => { const ph = r.obj.d.priceHistory ?? []; const p0 = ph[ph.length - 2]; return p0 > 0 ? ph[ph.length - 1] / p0 - 1 : 0; } },
    ],
  },
  overview({ world, ref, obj: m, nav }) {
    const d = m.d;
    const price = tapeSeries(world, `market:${ref.id}:price`).values;
    const fill = fillOf(d);
    const sellers = sellersOf(world, m.region, m.subUnitId);
    const ind = industryOfSubUnit(m.subUnitId);
    const spec = ind ? INDUSTRY_REGISTRY[ind].subUnits.find((s) => s.unitId === m.subUnitId) : undefined;
    const mix = spec?.buyerMix;
    const ph = d.priceHistory ?? [];
    const wk = ph.length > 1 && ph[ph.length - 2] > 0 ? ph[ph.length - 1] / ph[ph.length - 2] - 1 : undefined;
    // §3.23: what this good's makers pay for their inputs is the inputs' own cleared prices, read
    // through the recipe — not a formula index beside the auction.
    const recipe = Object.entries(CATEGORY_INPUT_REQUIREMENTS[m.subUnitId] ?? {});
    const recipeWeight = recipe.reduce((s, [, w]) => s + (w ?? 0), 0);
    const inputPriceIndex = recipeWeight > 0
      ? recipe.reduce((s, [cat, w]) => s + (w ?? 0) * (world.state.regions[m.region as RegionId]?.categoryDemand[cat]?.clearedInputPriceIndex ?? 1), 0) / recipeWeight
      : undefined;
    const tier = categoryPriceTier(m.subUnitId);
    return (
      <>
        <ObjectHeader name={`${subUnitLabel(m.subUnitId)}, ${m.region}`} sub={<>goods market · <RegionLink id={m.region} nav={nav} /> · {words(ind ?? '')}{mix && mix.HOUSEHOLD > 0 ? ` · a ${tier.toLowerCase()} for households` : ''} · {spec?.deliveryMode === 'PHYSICAL' ? 'shipped' : 'delivered on site'}</>} />
        <StatGrid>
          <Stat label="price" value={num(d.unitPriceLocal)} sub={price.filter(Number.isFinite).length > 1 ? <ChangeSub series={price} /> : wk !== undefined ? `${pctLevel(wk, 1)} this week` : 'USD per unit'} />
          <Stat label="fill" value={fill !== undefined ? pctLevel(fill, 0) : '—'} sub={fill !== undefined ? `${count(Math.round(d.totalUnitsSuppliedThisWeek ?? 0))} of ${count(Math.round(d.totalUnitsDemandedThisWeek ?? 0))} units` : 'no bids this week'} neg={fill !== undefined && fill < 0.8} />
          <Stat label="demand" value={money(d.demandLevelAnnualLocal)} sub="USD, annualised" />
        </StatGrid>
        <Card style={{ padding: '2px 0' }}>
          <KV k="who buys" hint="hh · firms · gov" v={mix ? `${pctLevel(mix.HOUSEHOLD, 0)} · ${pctLevel(mix.CORPORATE, 0)} · ${pctLevel(mix.GOVERNMENT, 0)}` : '—'} />
          <KV k="household spend" hint="annualised" v={money(d.householdDemandLocal)} />
          <KV k="corporate spend" hint="annualised" v={money(d.corporateDemandLocal)} />
          <KV k="ex-works price" hint="before freight" v={num(d.exWorksUnitPriceLocal)} />
          <KV k="input prices" hint="vs seed, recipe-weighted" v={inputPriceIndex !== undefined ? num(inputPriceIndex, 2) : '—'} />
          <KV k="named sellers" v={count(sellers.length)} onTap={() => nav.go('sellers')} />
        </Card>
        <FunctionTiles nav={nav} tiles={[
          { fn: 'chart', sub: 'price · supplied · demanded' },
          { fn: 'sellers', sub: `${sellers.length} firms with a line here` },
          { fn: 'peers', sub: `the ${m.region} markets` },
          { fn: 'news', sub: 'when this price moved' },
        ]} />
        <AllRow fields={Object.keys(d).length} nav={nav} />
      </>
    );
  },
});
