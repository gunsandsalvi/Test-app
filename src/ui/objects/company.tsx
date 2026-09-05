/** AU · object: company — a firm, a bank (a company with a sheet), or a fund's manager shell. */

import { Company } from '../../types';
import { marketCapAt } from '../../engine2/instruments';
import { bankSovereignBookLocal } from '../../engine/sovereign-register';
import { loanBooksOf, businessLoanBookOf, consumerLoanBookOf } from '../../domain/banking';
import { defineObject, PeerColumn } from './registry';
import { Card, KV, Link, Stat, StatGrid, T } from '../ui';
import { money, pct, pctLevel, ratio, num, bps, count } from '../format';
import { formatMonth, formatSpan } from '../calendar';
import { companyOf, companyPriceHistory, companyRatingHistory, companyRevenueHistory, holdersOf, bankLinesTo, contractsOf, displayWeek } from '../world';
import { materializeLadder, facilityBookOf, ladderTotalLocal } from '../../engine2/tranches';
import { isActiveCompany } from '../../domain/company';
import { ObjectHeader, ChangeSub, FunctionTiles, AllRow, RegionLink, ringed, taped } from './common';
import { cashOf, bankReservesOf, stateDepositLines } from '../../engine/ledger/accounts';
import { ensureV2 } from '../../engine2/world';

const RATING_CODES = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];

function companyKind(c: Company): string {
  return c.isBankEntity ? 'bank' : c.institutionalRole ? 'fund manager' : c.listingStatus === 'PRIVATE' ? 'private company' : 'company';
}

function managementWords(c: Company): string {
  const m = c.management;
  if (!m) return '';
  const h = m.patienceWeeks < 9 ? 'a short horizon' : m.patienceWeeks > 26 ? 'a long horizon' : 'a quarterly horizon';
  const r = m.riskAversion < 0.8 ? 'risk-taking' : m.riskAversion > 1.25 ? 'cautious' : 'even-handed';
  return `management: ${h}, ${r}`;
}

/** The screener's columns: a bank reads as a bank, everything else as a firm. */
export function companyColumns(bank: boolean): PeerColumn<Company>[] {
  const name: PeerColumn<Company> = { key: 'name', label: 'name', render: (r, _w, nav) => <Link to={{ type: 'company', id: r.id }} nav={nav}>{r.obj.ticker}</Link>, value: (r) => r.obj.ticker };
  if (bank) {
    return [
      name,
      { key: 'cap', label: 'capital', render: (r) => pctLevel(r.obj.bankBalanceSheet?.bankCapitalRatio, 1), value: (r) => r.obj.bankBalanceSheet?.bankCapitalRatio ?? -1 },
      { key: 'nim', label: 'nim', render: (r) => pctLevel(r.obj.bankBalanceSheet?.netInterestMarginPct, 2), value: (r) => r.obj.bankBalanceSheet?.netInterestMarginPct ?? -1 },
      { key: 'deposits', label: 'deposits', render: (r, w) => { if (!r.obj.bankBalanceSheet) return money(undefined); const l = stateDepositLines(w.state, r.obj); return money(l.householdLocal + l.corporateLocal + l.institutionalLocal + l.smeLocal); }, value: (r, w) => (r.obj.bankBalanceSheet ? stateDepositLines(w.state, r.obj).householdLocal : 0) },
      { key: 'loans', label: 'loans', render: (r, w) => money(r.obj.bankBalanceSheet ? loanBooksOf(r.obj.bankBalanceSheet, facilityBookOf(w.v2, r.obj.id)) : undefined), value: (r, w) => (r.obj.bankBalanceSheet ? loanBooksOf(r.obj.bankBalanceSheet, facilityBookOf(w.v2, r.obj.id)) : 0) },
      { key: 'share', label: 'share', render: (r) => pctLevel(r.obj.bankMarketShare, 0), value: (r) => r.obj.bankMarketShare ?? 0 },
      { key: 'window', label: 'window', render: (r) => money(r.obj.bankBalanceSheet?.srfBorrowingLocal), value: (r) => r.obj.bankBalanceSheet?.srfBorrowingLocal ?? 0 },
      { key: 'mcap', label: 'mkt cap', render: (r, w) => money(marketCapAt(w.v2, r.obj), 1), value: (r, w) => marketCapAt(w.v2, r.obj) },
    ];
  }
  return [
    name,
    { key: 'mcap', label: 'mkt cap', render: (r, w) => (marketCapAt(w.v2, r.obj) > 0 ? money(marketCapAt(w.v2, r.obj), 1) : '—'), value: (r, w) => marketCapAt(w.v2, r.obj) },
    { key: 'revenue', label: 'revenue', render: (r) => money(r.obj.annualRevenue, 1), value: (r) => r.obj.annualRevenue },
    { key: 'margin', label: 'margin', render: (r) => (r.obj.annualRevenue > 0 ? pctLevel(r.obj.ebitda / r.obj.annualRevenue, 0) : '—'), value: (r) => (r.obj.annualRevenue > 0 ? r.obj.ebitda / r.obj.annualRevenue : -9) },
    { key: 'pe', label: 'p/e', render: (r) => (r.obj.forwardPE > 0 ? num(r.obj.forwardPE, 1) : '—'), value: (r) => r.obj.forwardPE ?? 0 },
    { key: 'lev', label: 'lev', render: (r) => ratio(r.obj.leverage), value: (r) => r.obj.leverage },
    { key: 'rating', label: 'rating', render: (r) => r.obj.creditRating, value: (r) => -RATING_CODES.indexOf(r.obj.creditRating) },
    { key: 'heads', label: 'people', render: (r) => count(r.obj.employeeCount), value: (r) => r.obj.employeeCount },
    { key: 'sector', label: 'sector', width: 1.3, render: (r) => r.obj.sector, value: (r) => r.obj.sector },
    { key: 'region', label: 'reg', width: 0.6, render: (r) => r.obj.region, value: (r) => r.obj.region },
  ];
}

export const company = defineObject<Company>({
  type: 'company',
  words: ['company', 'companies'],
  searchable: true,
  find: companyOf,
  list: (world) => world.state.companies.map((c) => ({ id: c.id, obj: c })),
  label: (_w, _id, c) => ({ ticker: c.ticker, name: c.name, kind: companyKind(c), region: c.region }),
  keywords: (_w, _id, c) => [c.sector.toLowerCase(), c.region.toLowerCase(), c.isBankEntity ? 'bank' : c.listingStatus === 'PRIVATE' ? 'private' : 'public'],
  headline: (_w, _id, c) => c.isBankEntity && c.bankBalanceSheet
    ? { value: pctLevel(c.bankBalanceSheet.bankCapitalRatio, 1), sub: 'capital ratio', neg: c.bankBalanceSheet.bankCapitalRatio < 0.08 }
    : { value: c.stockPrice > 0 ? num(c.stockPrice) : money(c.annualRevenue), sub: c.stockPrice > 0 ? 'price' : 'revenue' },
  series: (world, id, c) => {
    const out = [
      ringed(world, companyPriceHistory(world, id), 'price', 'USD per share', (v) => num(v)),
      ringed(world, companyRatingHistory(world, id), 'rating', 'notch', (v) => RATING_CODES[Math.round(v)] ?? String(v), true),
      ringed(world, companyRevenueHistory(world, id), 'revenue', 'USD, annualised', (v) => money(v)),
    ];
    if (c.isBankEntity) {
      out.push(
        taped(world, `bank:${id}:capital ratio`, 'capital ratio', 'ratio', (v) => pctLevel(v, 2)),
        taped(world, `bank:${id}:nim`, 'nim', 'annual', (v) => pctLevel(v, 2)),
        taped(world, `bank:${id}:deposits`, 'deposits', 'USD', (v) => money(v)),
        taped(world, `bank:${id}:reserves`, 'reserves', 'USD', (v) => money(v)),
        taped(world, `bank:${id}:loans`, 'loans', 'USD', (v) => money(v)),
        taped(world, `bank:${id}:central bank loan`, 'central bank loan', 'USD', (v) => money(v)),
      );
    }
    return out;
  },
  peers: {
    groups: (world, _id, c) => {
      const live = world.state.companies.filter((x) => isActiveCompany(x));
      const listed = live.filter((x) => x.listingStatus !== 'PRIVATE');
      if (c.isBankEntity) {
        return [
          { name: `banks · ${c.region}`, ids: live.filter((x) => x.isBankEntity && x.region === c.region).map((x) => x.id) },
          { name: 'all banks', ids: live.filter((x) => x.isBankEntity).map((x) => x.id) },
        ];
      }
      return [
        { name: `${c.sector} · ${c.region}`, ids: listed.filter((x) => x.sector === c.sector && x.region === c.region && !x.isBankEntity).map((x) => x.id) },
        { name: c.sector, ids: listed.filter((x) => x.sector === c.sector && !x.isBankEntity).map((x) => x.id) },
        { name: c.creditRating, ids: listed.filter((x) => x.creditRating === c.creditRating && !x.isBankEntity).map((x) => x.id) },
        { name: 'private', ids: live.filter((x) => x.listingStatus === 'PRIVATE' && x.region === c.region).map((x) => x.id) },
        { name: 'all listed', ids: listed.filter((x) => !x.isBankEntity).map((x) => x.id) },
      ];
    },
    defaultSort: 'mcap',
    columns: (_w, _id, c) => companyColumns(!!c.isBankEntity),
  },
  overview({ world, ref, obj: c, nav }) {
    const TickerLink = ({ ticker }: { ticker: string }) => { const b = world.state.companies.find((x) => x.ticker === ticker); return b ? <Link to={{ type: 'company', id: b.id }} nav={nav}>{ticker}</Link> : <>{ticker}</>; };
    const prices = companyPriceHistory(world, c.id);
    const ladder = materializeLadder(world.v2, c.id);
    const nextMaturity = ladder.length ? Math.min(...ladder.map((t) => t.maturityWeek)) : undefined;
    const equityHolders = holdersOf(world, c.id).filter((h) => h.instrumentType === 'EQUITY');
    const heldLocal = equityHolders.reduce((a, h) => a + h.usd, 0);
    const floatShare = marketCapAt(ensureV2(world.state), c) > 0 ? heldLocal / marketCapAt(ensureV2(world.state), c) : undefined;
    const cashLocal = cashOf(ensureV2(world.state), c);
    const netDebt = ladderTotalLocal(ensureV2(world.state), c.id) - cashLocal;
    const sheet = c.bankBalanceSheet;
    const lines = bankLinesTo(world, c.id);
    const contracts = contractsOf(world, { kind: c.isBankEntity ? 'BANK' : 'COMPANY', key: c.ticker });
    const flag = !isActiveCompany(c) ? (c.isDefaulted ? (c.bankResolvedWeek !== undefined ? 'resolved' : 'in default') : 'acquired') : undefined;
    const mgmt = managementWords(c);
    return (
      <>
        <ObjectHeader
          name={c.name}
          sub={<>{companyKind(c)} · {c.sector} · <RegionLink id={c.region} nav={nav} /> · {c.creditRating}
            {c.homeBankId ? <> · banks at <TickerLink ticker={c.homeBankId} /></> : null}
            {c.parentId ? <> · subsidiary of <TickerLink ticker={c.parentId} /></> : null}
            {mgmt ? <> · {mgmt}</> : null}</>}
          flag={flag}
        />
        {sheet ? (
          <StatGrid>
            <Stat label="capital ratio" value={pctLevel(sheet.bankCapitalRatio, 2)} sub="floor 8% · closed at 2%" neg={sheet.bankCapitalRatio < 0.08} />
            <Stat label="net interest margin" value={pctLevel(sheet.netInterestMarginPct, 2)} sub={`loss rate ${pctLevel(sheet.loanLossProvisionRateAnnualPct, 2)}`} neg={sheet.netInterestMarginPct < 0.01} />
            <Stat label="price" value={c.stockPrice > 0 ? num(c.stockPrice) : '—'} sub={<ChangeSub series={prices} />} />
          </StatGrid>
        ) : (
          <StatGrid>
            <Stat label="price" value={c.stockPrice > 0 ? num(c.stockPrice) : 'private'} sub={c.stockPrice > 0 ? <ChangeSub series={prices} /> : `${count(c.employeeCount)} people`} />
            <Stat label="market cap" value={marketCapAt(ensureV2(world.state), c) > 0 ? money(marketCapAt(ensureV2(world.state), c)) : '—'} sub={floatShare !== undefined ? `${pctLevel(floatShare, 0)} held by funds` : 'unlisted'} />
            <Stat label="rating" value={c.creditRating} sub={c.cdsSpreadBps !== undefined ? `cds ${bps(c.cdsSpreadBps)}bp` : 'no cds print'} neg={c.creditRating === 'CCC' || c.creditRating === 'D'} />
          </StatGrid>
        )}
        {sheet ? (
          <Card style={{ padding: '2px 0' }}>
            <KV k="deposits" hint="all classes" v={money((() => { const l = stateDepositLines(world.state, c); return l.householdLocal + l.corporateLocal + l.institutionalLocal + l.smeLocal; })())} />
            <KV k="loans" hint="business · household" v={`${money(businessLoanBookOf(sheet, facilityBookOf(ensureV2(world.state), c.id)))} · ${money(consumerLoanBookOf(sheet))}`} />
            <KV k="sovereign book" hint="register rows, marked" v={money(bankSovereignBookLocal(ensureV2(world.state), c.id))} />
            <KV k="reserves at the central bank" v={money(bankReservesOf(ensureV2(world.state), c.id))} />
            <KV k="central bank loan" hint="lender of last resort" v={money(sheet.centralBankLoanLocal ?? 0)} />
            <KV k="at the window" v={money(sheet.srfBorrowingLocal)} />
            <KV k="market share" hint="of the region's deposits" v={pctLevel(c.bankMarketShare)} />
          </Card>
        ) : (
          <Card style={{ padding: '2px 0' }}>
            <KV k="revenue" hint="trailing year" v={money(c.annualRevenue)} />
            <KV k="ebitda margin" hint={c.expectedEbitdaLocal !== undefined && c.annualRevenue > 0 ? `management expects ${pctLevel(c.expectedEbitdaLocal / c.annualRevenue)}` : undefined} v={c.annualRevenue > 0 ? pctLevel(c.ebitda / c.annualRevenue) : '—'} />
            <KV k="net debt / ebitda" hint={`leverage ${ratio(c.leverage)}`} v={c.ebitda > 0 ? ratio(netDebt / c.ebitda) : '—'} />
            <KV k="interest coverage" v={ratio(c.interestCoverage)} />
            <KV k="cash" v={money(cashLocal)} />
            <KV k="people" hint={c.previousEmployeeCount !== c.employeeCount ? `${c.employeeCount > c.previousEmployeeCount ? '+' : ''}${count(c.employeeCount - c.previousEmployeeCount)} this week` : undefined} v={count(c.employeeCount)} />
            {c.mothballedPpeShare ? <KV k="plant mothballed" v={pctLevel(c.mothballedPpeShare, 0)} /> : null}
          </Card>
        )}
        <FunctionTiles nav={nav} tiles={[
          { fn: 'news', sub: 'what happened, and why' },
          { fn: 'statements', sub: sheet ? 'the sheet · income' : 'P&L · balance sheet · cash flow' },
          { fn: 'chart', sub: `price · ${prices.length > 1 ? formatSpan(prices.length) : 'no history yet'}` },
          { fn: 'ladder', sub: ladder.length ? `${ladder.length} tranches · next due ${nextMaturity !== undefined ? formatMonth(displayWeek(world.state, nextMaturity)) : '—'}` : 'no debt' },
          { fn: 'holders', sub: `${equityHolders.length} funds · ${floatShare !== undefined ? pctLevel(floatShare, 0) + ' of the cap' : 'unlisted'}` },
          { fn: 'lines', sub: `${c.productLines?.length ?? 0} product lines` },
          { fn: 'links', sub: `${lines.length} bank lines · ${contracts.length} contracts` },
          { fn: 'peers', sub: `${c.isBankEntity ? 'banks' : c.sector} · ${c.region}` },
        ]} />
        <AllRow fields={Object.keys(c).length} nav={nav} />
        <div style={{ padding: '0 4px', fontSize: 11, color: T.hint }}>{ref.id}{c.bornWeek !== undefined ? ` · entered ${formatMonth(displayWeek(world.state, c.bornWeek))}` : ''}{c.employeeCount > 0 && c.annualRevenue > 0 ? ` · ${money(c.annualRevenue / c.employeeCount, 0)} of revenue per head` : ''}{c.baselineEbitdaMargin !== undefined ? ` · seeded at ${pct(c.baselineEbitdaMargin, 0).replace('+', '')} margin` : ''}</div>
      </>
    );
  },
});
