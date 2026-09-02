/** AU · overview — the object at a glance, with a tile for every function that applies. */

import { Company, InstitutionalEntity, Region } from '../../types';
import { FunctionModule } from '../fn';
import { Card, KV, Link, Hint, Muted, Stat, StatGrid, Tile, serif, T } from '../ui';
import { changePct, money, pct, pctLevel, ratio, num, bps, count } from '../format';
import { WEEKS_PER_MONTH, WEEKS_PER_YEAR, formatMonth } from '../calendar';
import { companyOf, institutionOf, regionOf, refOfIdentifier, companyPriceHistory, holdersOf, bookOf, tapeSeries, ObjectRef, World } from '../world';
import { materializeLadder } from '../../engine2/tranches';
import { isActiveCompany } from '../../domain/company';

function ChangeSub({ series }: { series: number[] }) {
  const now = series[series.length - 1];
  const mom = changePct(now, series[series.length - 1 - WEEKS_PER_MONTH]);
  const yoy = changePct(now, series[series.length - 1 - WEEKS_PER_YEAR]);
  if (mom === undefined) return <>{series.length > 1 ? `${series.length - 1} weeks of history` : 'no history yet'}</>;
  return <span style={{ color: mom < 0 ? T.neg : T.accent }}>{pct(mom)} m/m{yoy !== undefined ? ` · ${pct(yoy)} y/y` : ''}</span>;
}

function CompanyOverview({ world, c, nav, ref }: { world: World; c: Company; nav: FnPropsNav; ref: ObjectRef }) {
  const prices = companyPriceHistory(world, c.id);
  const bank = c.homeBankTicker ? refOfIdentifier(world, c.homeBankTicker) : undefined;
  const ladder = materializeLadder(world.v2, c.id);
  const nextMaturity = ladder.length ? Math.min(...ladder.map((t) => t.maturityWeek)) : undefined;
  const equityHolders = holdersOf(world, c.id).filter((h) => h.instrumentType === 'EQUITY');
  const heldUSD = equityHolders.reduce((a, h) => a + h.usd, 0);
  const floatShare = c.marketCap > 0 ? heldUSD / c.marketCap : undefined;
  const netDebt = (c.totalDebt ?? 0) - (c.cash ?? 0);
  const sheet = c.bankBalanceSheet;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
        <div style={{ ...serif, fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{c.name}</div>
        <Muted style={{ fontSize: 13 }}>
          {c.sector} · <Link to={{ type: 'region', id: c.region }} nav={nav}>{c.region}</Link> · {c.listingStatus === 'PRIVATE' ? 'private' : 'public'} · {c.creditRating}
          {bank ? <> · house bank <Link to={bank} nav={nav}>{c.homeBankTicker}</Link></> : null}
          {!isActiveCompany(c) ? <> · <span style={{ color: T.neg }}>{c.isDefaulted ? (c.bankResolvedWeek !== undefined ? 'resolved' : 'in default') : 'acquired'}</span></> : null}
        </Muted>
      </div>
      <StatGrid>
        <Stat label="price" value={num(c.stockPrice)} sub={<ChangeSub series={prices} />} />
        <Stat label="mkt cap" value={money(c.marketCap)} sub={floatShare !== undefined ? `inst. ${pctLevel(floatShare, 0)}` : 'unlisted'} />
        <Stat label="rating" value={c.creditRating} sub={`oas ${bps(c.oasSpreadBps)} · cds ${bps(c.cdsSpreadBps)}`} />
      </StatGrid>
      {sheet ? (
        <Card style={{ padding: '2px 0' }}>
          <KV k="capital ratio" hint="floor 8%" v={pctLevel(sheet.bankCapitalRatio, 2)} />
          <KV k="net interest margin" v={pctLevel(sheet.netInterestMarginPct, 2)} />
          <KV k="deposits" hint="all classes" v={money(sheet.depositsUSD + (sheet.corporateDepositsUSD ?? 0) + (sheet.institutionalDepositsUSD ?? 0) + (sheet.smeDepositsUSD ?? 0) + (sheet.unmodeledDepositsUSD ?? 0))} />
          <KV k="loans" hint="business · household" v={`${money(sheet.businessLoanBookUSD)} · ${money(sheet.consumerLoanBookUSD)}`} />
          <KV k="reserves" v={money(sheet.cashReservesUSD)} />
          <KV k="wholesale funding" v={money(sheet.wholesaleFundingUSD)} />
        </Card>
      ) : (
        <Card style={{ padding: '2px 0' }}>
          <KV k="revenue, ttm" v={money(c.annualRevenue)} />
          <KV k="ebitda margin" v={c.annualRevenue > 0 ? pctLevel(c.ebitda / c.annualRevenue) : '—'} />
          <KV k="net debt / ebitda" hint={`leverage ${ratio(c.leverage)}`} v={c.ebitda > 0 ? ratio(netDebt / c.ebitda) : '—'} />
          <KV k="interest coverage" v={ratio(c.interestCoverage)} />
          <KV k="employees" v={count(c.employeeCount)} />
        </Card>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Tile name="statements" sub={sheet ? 'bank sheet · P&L' : 'P&L · BS · cash flow'} onTap={() => nav.go('statements')} />
        <Tile name="chart" sub={`price · ${prices.length > 1 ? `${prices.length} weeks` : 'no history yet'}`} onTap={() => nav.go('chart')} />
        <Tile name="holders" sub={`${equityHolders.length} inst. · ${floatShare !== undefined ? pctLevel(floatShare, 0) + ' of cap' : '—'}`} onTap={() => nav.go('holders')} />
        <Tile name="peers" sub={`${c.sector} · ${c.region}`} onTap={() => nav.go('peers')} />
        <Tile name="ladder" sub={ladder.length ? `${ladder.length} tranches · next ${nextMaturity !== undefined ? formatMonth(nextMaturity) : '—'}` : 'no debt'} onTap={() => nav.go('all', { path: 'debtTranches' })} />
        <Tile name="lines" sub={`${c.productLines?.length ?? 0} product lines`} onTap={() => nav.go('all', { path: 'productLines' })} />
      </div>
      <Card style={{ padding: '0 12px', height: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <span onClick={() => nav.go('all')} style={{ color: T.accent, fontWeight: 700 }}>all</span>
        <Hint style={{ fontFamily: 'inherit' }}>{Object.keys(c).length} fields</Hint>
      </Card>
      <div style={{ padding: '0 4px' }}><Hint>{ref.id}</Hint></div>
    </>
  );
}

type FnPropsNav = import('../ui').Nav;

function InstitutionOverview({ world, e, nav }: { world: World; e: InstitutionalEntity; nav: FnPropsNav }) {
  const book = bookOf(world, e.id);
  const holdingsUSD = book.reduce((a, r) => a + r.usd, 0);
  const assets = tapeSeries(world, `institution:${e.id}:assets`).values;
  const bank = e.homeBankTicker ? refOfIdentifier(world, e.homeBankTicker) : undefined;
  const byType = new Map<string, number>();
  book.forEach((r) => byType.set(r.instrumentType, (byType.get(r.instrumentType) ?? 0) + r.usd));
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
        <div style={{ ...serif, fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{e.name}</div>
        <Muted style={{ fontSize: 13 }}>
          {e.entityType.toLowerCase().replace(/_/g, ' ')} · <Link to={{ type: 'region', id: e.region }} nav={nav}>{e.region}</Link>
          {bank ? <> · house bank <Link to={bank} nav={nav}>{e.homeBankTicker}</Link></> : null}
          {e.isDefaulted ? <> · <span style={{ color: T.neg }}>in default</span></> : null}
        </Muted>
      </div>
      <StatGrid>
        <Stat label="assets" value={money(e.totalAssetsUSD)} sub={<ChangeSub series={assets} />} />
        <Stat label="cash" value={money(e.cashUSD)} sub={e.cashUSD !== undefined && e.totalAssetsUSD > 0 ? `${pctLevel(e.cashUSD / e.totalAssetsUSD, 0)} of assets` : ''} neg={(e.cashUSD ?? 0) < 0} />
        <Stat label="equity" value={money(e.equityCapitalUSD)} sub={e.totalAssetsUSD > 0 ? `${pctLevel(e.equityCapitalUSD / e.totalAssetsUSD, 0)} of assets` : ''} />
      </StatGrid>
      <Card style={{ padding: '2px 0' }}>
        <KV k="holdings" hint={`${book.length} rows`} v={money(holdingsUSD)} onTap={() => nav.go('holders')} />
        {[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, usd]) => (
          <KV key={t} k={t.toLowerCase().replace(/_/g, ' ')} v={money(usd)} />
        ))}
        {e.beneficiaryLiabilityUSD !== undefined ? <KV k="owed to beneficiaries" v={money(e.beneficiaryLiabilityUSD)} /> : null}
        {e.stockPrice > 0 ? <KV k="price per share" v={num(e.stockPrice)} /> : null}
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Tile name="holdings" sub={`${book.length} positions`} onTap={() => nav.go('holders')} />
        <Tile name="chart" sub={`assets · ${assets.length > 1 ? `${assets.length} weeks` : 'no history yet'}`} onTap={() => nav.go('chart')} />
        <Tile name="statements" sub="assets · liabilities" onTap={() => nav.go('statements')} />
        <Tile name="peers" sub={e.entityType.toLowerCase().replace(/_/g, ' ')} onTap={() => nav.go('peers')} />
      </div>
      <Card style={{ padding: '0 12px', height: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <span onClick={() => nav.go('all')} style={{ color: T.accent, fontWeight: 700 }}>all</span>
        <Hint>{Object.keys(e).length} fields</Hint>
      </Card>
    </>
  );
}

function RegionOverview({ world, r, nav }: { world: World; r: Region; nav: FnPropsNav }) {
  const u = tapeSeries(world, `region:${r.id}:unemployment`).values;
  const cpi = r.cpiHistory ?? [];
  const gdp = r.nominalGdpHistory ?? [];
  const banks = world.state.companies.filter((c) => c.region === r.id && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet);
  const firms = world.state.companies.filter((c) => c.region === r.id && isActiveCompany(c) && !c.isBankEntity);
  const funds = world.state.institutionalEntities.filter((e) => e.region === r.id && !e.isDefaulted);
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
        <div style={{ ...serif, fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{r.name}</div>
        <Muted style={{ fontSize: 13 }}>{r.currency} · {r.centralBank} · {r.cycleRegime.toLowerCase()} · sovereign {r.sovereignRating}</Muted>
      </div>
      <StatGrid>
        <Stat label="unemployment" value={pctLevel(r.unemploymentRate)} sub={u.length > 1 ? <ChangeSub series={u} /> : 'no history yet'} neg={r.unemploymentRate > r.nairu} />
        <Stat label="inflation" value={pctLevel(r.inflation)} sub={`core ${pctLevel(r.coreInflation)}`} />
        <Stat label="policy rate" value={pctLevel(r.policyRate, 2)} sub={`10y ${pctLevel(r.zeroRates?.tenor10Y, 2)}`} />
      </StatGrid>
      <Card style={{ padding: '2px 0' }}>
        <KV k="gdp, annualised" hint={gdp.length > 1 ? <ChangeSub series={gdp} /> : undefined} v={money(r.derivedNominalGdpUSD ?? r.estimatedNominalGdpUSD)} />
        <KV k="cpi" hint={cpi.length > 1 ? <ChangeSub series={cpi} /> : undefined} v={num(r.consumerPriceIndex, 1)} />
        <KV k="bank capital · nim" v={`${pctLevel(r.bankingSector?.bankCapitalRatio, 1)} · ${pctLevel(r.bankingSector?.netInterestMarginPct, 2)}`} />
        <KV k="household deposits" v={money(r.householdState?.depositsUSD)} />
        <KV k="government revenue · outlays" hint="weekly" v={`${money(r.governmentRevenueUSD)} · ${money(r.governmentOutlaysUSD ?? r.governmentSpendingWeeklyUSD)}`} />
        <KV k="population" v={count(Math.round(r.totalPopulation))} />
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Tile name="chart" sub="unemployment · cpi · rates" onTap={() => nav.go('chart')} />
        <Tile name="statements" sub="national accounts · treasury" onTap={() => nav.go('statements')} />
        <Tile name="holders" sub="who holds the sovereign" onTap={() => nav.go('holders')} />
        <Tile name="peers" sub="the four regions" onTap={() => nav.go('peers')} />
        <Tile name="banks" sub={`${banks.length} banks`} onTap={() => nav.go('peers', { set: 'banks' })} />
        <Tile name="firms" sub={`${firms.length} firms · ${funds.length} institutions`} onTap={() => nav.go('peers', { set: 'firms' })} />
      </div>
      <Card style={{ padding: '0 12px', height: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <span onClick={() => nav.go('all')} style={{ color: T.accent, fontWeight: 700 }}>all</span>
        <Hint>{Object.keys(r).length} fields</Hint>
      </Card>
    </>
  );
}

export const overview: FunctionModule = {
  name: 'overview',
  appliesTo: ['company', 'institution', 'region'],
  blurb: 'at a glance',
  render({ world, ref, nav }) {
    if (ref.type === 'company') { const c = companyOf(world, ref.id); return c ? <CompanyOverview world={world} c={c} nav={nav} ref={ref} /> : null; }
    if (ref.type === 'institution') { const e = institutionOf(world, ref.id); return e ? <InstitutionOverview world={world} e={e} nav={nav} /> : null; }
    const r = regionOf(world, ref.id); return r ? <RegionOverview world={world} r={r} nav={nav} /> : null;
  },
};
