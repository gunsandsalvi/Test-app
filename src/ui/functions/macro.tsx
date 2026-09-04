import { RegionId } from '../../domain/geography';
import { ensureV2 } from '../../engine2/world';
import { materializeGovLadder } from '../../engine2/tranches';
import { householdDepositsOf, treasuryAccountOf } from '../../engine/ledger/accounts';
/**
 * AU · macro — the region's dashboard: activity, prices, labour, money, the external account,
 * households, banks, the treasury — each line the number and its month-on-month where the tape
 * has it. The `all` of a region for a reader who wants it in order.
 */

import { FunctionModule } from '../fn';
import { regionLoanBooksLocal } from '../../domain/banking';
import { Card, KV, Link } from '../ui';
import { money, pctLevel, num, count, ratio, pct } from '../format';
import { regionOf, tapeSeries } from '../world';
import { ChangeSub, SectionLabel, words } from '../objects/common';
import { WEEKS_PER_MONTH } from '../calendar';
import { facilityBookOf } from '../../engine2/tranches';

export const macro: FunctionModule = {
  name: 'macro',
  appliesTo: ['region'],
  blurb: 'the dashboard',
  render({ world, ref, nav }) {
    const r = regionOf(world, ref.id);
    if (!r) return null;
    const tape = (k: string) => tapeSeries(world, `region:${r.id}:${k}`).values;
    const sub = (k: string) => { const s = tape(k); return s.filter(Number.isFinite).length > WEEKS_PER_MONTH ? <ChangeSub series={s} /> : undefined; };
    const hs = r.householdState; const bs = r.bankingSector; const hm = r.housingMarket;
    const books = regionLoanBooksLocal(world.state.companies.filter((c) => c.region === r.id && c.isBankEntity && !c.isDefaulted), (b) => facilityBookOf(ensureV2(world.state), b.ticker));
    const gdp = r.derivedNominalGdpLocal ?? r.estimatedNominalGdpLocal ?? 0;
    return (<>
      <SectionLabel>activity</SectionLabel>
      <Card style={{ padding: '2px 0' }}>
        <KV k="gdp, annualised" hint={sub('gdp')} v={money(gdp)} />
        <KV k="potential growth" v={pctLevel(r.potentialGdpGrowth)} />
        <KV k="cycle" v={words(r.cycleRegime)} />
        <KV k="consumption · investment" hint="of gdp" v={gdp > 0 ? `${pctLevel(r.consumptionComponentLocal / gdp, 0)} · ${pctLevel(r.investmentComponentLocal / gdp, 0)}` : '—'} />
        <KV k="consumer confidence" v={num(hs?.consumerConfidence, 0)} />
      </Card>
      <SectionLabel>prices</SectionLabel>
      <Card style={{ padding: '2px 0' }}>
        <KV k="inflation" hint={`core ${pctLevel(r.coreInflation)}`} v={pctLevel(r.inflation)} />
        <KV k="price level" hint="seed = 100" v={num(r.consumerPriceIndex, 1)} />
        <KV k="target" hint={r.centralBank} v={pctLevel(r.targetInflation)} />
        <KV k="expected" hint="the market's" v={pctLevel(r.expectedInflation)} />
        <KV k="house prices" hint={`index ${num(hm?.priceIndex, 2)}`} v={money(hm?.medianHomePriceLocal, 2)} />
      </Card>
      <SectionLabel>labour</SectionLabel>
      <Card style={{ padding: '2px 0' }}>
        <KV k="unemployment" hint={sub('unemployment') ?? `nairu ${pctLevel(r.nairu)}`} v={pctLevel(r.unemploymentRate)} />
        <KV k="participation" v={pctLevel(r.laborForceParticipation, 0)} />
        <KV k="tightness" hint="vacancies per seeker" v={num(r.laborMarketTightness, 2)} />
        <KV k="wage growth" hint={sub('wage growth')} v={pctLevel(r.wageGrowth)} />
        <KV k="the market" v={<Link to={ref} fn="labour" nav={nav}>occupations · cohorts</Link>} />
      </Card>
      <SectionLabel>money</SectionLabel>
      <Card style={{ padding: '2px 0' }}>
        <KV k="policy rate" hint={sub('policy')} v={pctLevel(r.policyRate, 2)} />
        <KV k="2y · 10y" hint={`2s10s ${pct((r.zeroRates?.tenor10Y ?? 0) - (r.zeroRates?.tenor2Y ?? 0), 2)}`} v={`${pctLevel(r.zeroRates?.tenor2Y, 2)} · ${pctLevel(r.zeroRates?.tenor10Y, 2)}`} />
        <KV k="overnight repo" v={pctLevel(r.repoRateAnnual, 2)} />
        <KV k="m2" v={money(bs?.moneySupplyM2Local)} />
        <KV k="credit conditions" hint="−1 loose · +1 tight" v={num(bs?.creditConditionsIndex, 2)} />
        <KV k="the curve" v={<Link to={{ type: 'curve', id: r.id }} nav={nav}>{r.id} curve</Link>} />
      </Card>
      <SectionLabel>external</SectionLabel>
      <Card style={{ padding: '2px 0' }}>
        <KV k="exports · imports" hint="annualised" v={`${money(r.exportsLocal)} · ${money(r.importsLocal)}`} />
        <KV k="trade balance" v={money(r.tradeBalance)} />
        <KV k="current account" hint="of gdp" v={pctLevel(r.currentAccountPctGdp)} />
        <KV k="fx reserves" v={money(r.fxReservesLocal)} />
        <KV k="the currency" v={world.state.fxPairs.filter((p) => p.pair.includes(r.currency)).slice(0, 3).map((p, i) => <span key={p.pair}>{i ? ' · ' : ''}<Link to={{ type: 'fx', id: p.pair }} nav={nav}>{p.pair}</Link></span>)} />
      </Card>
      <SectionLabel>households</SectionLabel>
      <Card style={{ padding: '2px 0' }}>
        <KV k="deposits" hint={sub('household deposits')} v={money(householdDepositsOf(ensureV2(world.state), ref.id as RegionId))} />
        <KV k="net worth" hint={sub('household net worth')} v={money(hs?.netWorthLocal)} />
        <KV k="debt to income" v={ratio(hs?.householdDebtToIncomeRatio, 2)} />
        <KV k="savings rate" v={pctLevel(hs?.savingsRate)} />
        <KV k="home ownership" v={pctLevel((hm?.ownershipRatePct ?? 0) / 100, 0)} />
      </Card>
      <SectionLabel>banks</SectionLabel>
      <Card style={{ padding: '2px 0' }}>
        <KV k="capital ratio" hint={sub('bank capital')} v={pctLevel(bs?.bankCapitalRatio, 2)} />
        <KV k="net interest margin" hint={sub('bank nim')} v={pctLevel(bs?.netInterestMarginPct, 2)} />
        <KV k="loans" hint="business · household" v={`${money(books.businessLoanLocal)} · ${money(books.consumerLoanLocal)}`} />
        <KV k="reserves at the central bank" v={money(bs?.centralBankReservesLocal)} />
        <KV k="at the window" v={money(bs?.srfBorrowingLocal)} />
        <KV k="the banks" v={<Link to={ref} fn="banks" nav={nav}>{count(world.state.companies.filter((c) => c.region === r.id && c.isBankEntity && !c.isDefaulted).length)} banks</Link>} />
      </Card>
      <SectionLabel>treasury</SectionLabel>
      <Card style={{ padding: '2px 0' }}>
        <KV k="revenue · outlays" hint="weekly" v={`${money(r.governmentRevenueLocal)} · ${money(r.governmentOutlaysLocal ?? r.governmentSpendingWeeklyLocal)}`} />
        <KV k="debt" hint="of gdp" v={gdp > 0 ? pctLevel(materializeGovLadder(ensureV2(world.state), r.id).reduce((a, t) => a + t.principalLocal, 0) / gdp, 0) : '—'} />
        <KV k="treasury account" v={money(treasuryAccountOf(ensureV2(world.state), r.id as RegionId))} />
        <KV k="sovereign rating" hint={`fiscal stance ${r.fiscalStanceScore.toFixed(2)}`} v={r.sovereignRating} />
        <KV k="the ladder" v={<Link to={ref} fn="ladder" nav={nav}>{count(materializeGovLadder(ensureV2(world.state), r.id).length)} tranches</Link>} />
      </Card>
    </>);
  },
};
