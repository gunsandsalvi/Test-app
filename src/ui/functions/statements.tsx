import { RegionId, currencyOf } from '../../domain/geography';
import { plantGrossLocal, plantAccumulatedDepreciationLocal } from '../../domain/plant';
import { bankSovereignBookLocal } from '../../engine/sovereign-register';
/**
 * AU · statements — a firm's P&L, balance sheet and cash flow (the latest filed quarter beside
 * the one before), a bank's sheet, an institution's assets and liabilities, a region's national
 * accounts and treasury. Statement style: a units line, indented items, ruled subtotals,
 * parenthesised negatives, a change column.
 */

import { Company, InstitutionalEntity, Region } from '../../types';

import { loanBooksOf, businessLoanBookOf, consumerLoanBookOf, regionLoanBooksLocal, addDepositLines, ZERO_DEPOSIT_LINES, depositsOf, swapLineDrawnLocal } from '../../domain/banking';
import { FunctionModule } from '../fn';
import { Card, Hint, KV, Tabs, T, mono } from '../ui';
import { statementLocal, pct, pctLevel, ratio, changePct, money } from '../format';
import { formatDate, quarterLabel } from '../calendar';
import { World, companyOf, institutionOf, regionOf, bookOf, unpaidTaxesOf } from '../world';
import { bookBasisLocal, bookUnrealisedLocal, bookRealisedOf, bookAccruedLocal } from '../../engine2/holdings';
import { bankRwaLocal } from '../../domain/bank-pricing';

import { cashOf, householdDepositsOf, bankReservesOf, stateDepositLines, treasuryAccountOf } from '../../engine/ledger/accounts';
import { ensureV2 } from '../../engine2/world';
import { deskGrossLocal } from '../../engine/desk-register';
import { bankAtHouseLocal } from '../../engine/ledger/contract-ledger';
import { entityCashOf } from '../../engine/ledger/accounts';
import { facilityBookOf, ladderTotalLocal } from '../../engine2/tranches';

interface Line { label: string; usd?: number; prior?: number; total?: boolean; text?: string }

function Statement({ units, asOf, lines }: { units: string; asOf: string; lines: Line[] }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}><Hint>{units}</Hint><Hint style={mono}>{asOf}</Hint></div>
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr) minmax(0, 0.8fr)', gap: 6, height: 34, alignItems: 'center', padding: '0 12px', background: '#161c25', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.muted, fontWeight: 700 }}>
          <span></span><span style={{ textAlign: 'right' }}>latest</span><span style={{ textAlign: 'right' }}>change</span>
        </div>
        {lines.map((l, i) => {
          const ch = changePct(l.usd, l.prior);
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr) minmax(0, 0.8fr)', gap: 6, minHeight: 38, alignItems: 'center', padding: '0 12px', borderTop: l.total ? `1px solid ${T.border}` : undefined, borderBottom: `1px solid ${T.rule}` }}>
              <span style={{ color: l.total ? T.text : T.muted, paddingLeft: l.total ? 0 : 10, fontWeight: l.total ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</span>
              <span style={{ ...mono, textAlign: 'right' }}>{l.text ?? statementLocal(l.usd)}</span>
              <span style={{ ...mono, textAlign: 'right', fontSize: 12, color: ch === undefined ? T.hint : ch < 0 ? T.neg : T.hint }}>{ch !== undefined ? pct(ch) : ''}</span>
            </div>
          );
        })}
      </Card>
    </>
  );
}

function CompanyStatements({ world, c, tab, nav }: { world: World; c: Company; tab: string; nav: import('../ui').Nav }) {
  const hist = c.historicalFundamentals ?? [];
  const latest = hist.at(-1);
  const prior = hist.at(-2);
  const asOf = latest ? `${quarterLabel(latest.week)} · filed ${formatDate(latest.week)}` : formatDate(world.state.currentWeek);
  const bank = c.bankBalanceSheet;
  const tabs = bank ? ['bank sheet', 'income'] : ['income', 'balance sheet', 'cash flow', 'tax'];
  const active = tabs.includes(tab) ? tab : tabs[0];
  let body: React.ReactNode;
  if (active === 'bank sheet' && bank) {
    const sov = bankSovereignBookLocal(ensureV2(world.state), c.id);
    const lines = stateDepositLines(world.state, c);
    const deposits = depositsOf(bank, lines);
    const desks = deskGrossLocal(ensureV2(world.state), c.id); // §3.13-BOOK d3d: register rows
    const marginAtHouse = bankAtHouseLocal(ensureV2(world.state), c.id); // §3.17-iv-b
    const reservesLocal = bankReservesOf(ensureV2(world.state), c.id);
    const facilityBookLocal = facilityBookOf(ensureV2(world.state), c.id);
    const assets = loanBooksOf(bank, facilityBookLocal) + sov + reservesLocal + (bank.repoLentLocal ?? 0) + (bank.sovereignAccruedCouponLocal ?? 0) + desks + (bank.primeBrokerageLoansLocal ?? 0) + marginAtHouse;
    const swapLine = swapLineDrawnLocal(bank, currencyOf(c.region), ensureV2(world.state).fx); // §3.17b-v
    const liabilities = deposits + (bank.centralBankLoanLocal ?? 0) + (bank.repoBorrowedLocal ?? 0) + (bank.srfBorrowingLocal ?? 0) + swapLine;
    body = (<>
      <Statement units="USD millions · the live sheet" asOf={formatDate(world.state.currentWeek)} lines={[
        { label: 'Business loans', usd: businessLoanBookOf(bank, facilityBookLocal) },
        { label: 'Household loans', usd: consumerLoanBookOf(bank) },
        { label: 'Sovereign bonds', usd: sov },
        { label: 'Reserves at the central bank', usd: reservesLocal },
        { label: 'Repo lent', usd: bank.repoLentLocal ?? 0 },
        { label: 'Desk inventory, gross', usd: desks },
        { label: 'Prime brokerage loans', usd: bank.primeBrokerageLoansLocal ?? 0 },
        { label: 'At the clearing house · margin and fund', usd: marginAtHouse },
        { label: 'Accrued sovereign coupon', usd: bank.sovereignAccruedCouponLocal ?? 0 },
        { label: 'Total assets', usd: assets, total: true },
        { label: 'Household deposits', usd: lines.householdLocal },
        { label: 'Corporate deposits', usd: lines.corporateLocal },
        { label: 'Institutional deposits', usd: lines.institutionalLocal },
        { label: 'Small-business deposits', usd: lines.smeLocal },
        { label: 'Clearing-house deposits', usd: lines.ccpLocal },
        { label: 'Central bank loan', usd: bank.centralBankLoanLocal ?? 0 },
        { label: 'Swap-line draws · foreign money', usd: swapLine },
        { label: 'Repo borrowed · facility', usd: (bank.repoBorrowedLocal ?? 0) + (bank.srfBorrowingLocal ?? 0) },
        { label: 'Total liabilities', usd: liabilities, total: true },
        { label: 'Equity', usd: bank.bankEquityLocal, total: true },
        { label: 'Identity residual', usd: liabilities + bank.bankEquityLocal - assets },
      ]} />
      <Card style={{ padding: '2px 0' }}>
        <KV k="capital ratio" hint={`rwa ${money(bankRwaLocal(bank, facilityBookLocal))} · floor 8% · closed at 2%`} v={pctLevel(bank.bankCapitalRatio, 2)} />
        <KV k="net interest margin" v={pctLevel(bank.netInterestMarginPct, 2)} />
        <KV k="loan loss rate" hint="annual, own book" v={pctLevel(bank.loanLossProvisionRateAnnualPct, 2)} />
        <KV k="deposit rate paid" v={pctLevel(bank.depositRateAnnual, 2)} />
        <KV k="market share" hint="of the region's deposits" v={pctLevel(c.bankMarketShare)} />
      </Card>
    </>);
  } else if (active === 'income') {
    const is = latest?.incomeStatement; const ps = prior?.incomeStatement;
    body = is ? (<>
      <Statement units="USD millions · the quarter" asOf={asOf} lines={[
        { label: 'Revenue', usd: is.revenue, prior: ps?.revenue, total: true },
        { label: 'Cost of goods sold', usd: -is.cogs, prior: ps ? -ps.cogs : undefined },
        { label: 'Gross profit', usd: is.grossProfit, prior: ps?.grossProfit, total: true },
        { label: 'Operating expenses', usd: -is.sgaExpense, prior: ps ? -ps.sgaExpense : undefined },
        { label: 'EBITDA', usd: is.ebitda, prior: ps?.ebitda, total: true },
        { label: 'Depreciation & amortisation', usd: -is.depreciationAmortization, prior: ps ? -ps.depreciationAmortization : undefined },
        { label: 'EBIT', usd: is.ebit, prior: ps?.ebit, total: true },
        { label: 'Interest expense', usd: -is.interestExpense, prior: ps ? -ps.interestExpense : undefined },
        { label: 'Pre-tax income', usd: is.pretaxIncome, prior: ps?.pretaxIncome, total: true },
        { label: 'Income tax', usd: -is.taxExpense, prior: ps ? -ps.taxExpense : undefined },
        { label: 'Net income', usd: is.netIncome, prior: ps?.netIncome, total: true },
      ]} />
      <Card style={{ padding: '2px 0' }}>
        <KV k="ebitda margin" v={is.revenue > 0 ? pctLevel(is.ebitda / is.revenue) : '—'} />
        <KV k="interest coverage" v={ratio(latest.interestCoverage)} />
        <KV k="effective tax rate" v={is.pretaxIncome > 0 ? pctLevel(is.taxExpense / is.pretaxIncome) : '—'} />
        <KV k="eps" v={is.eps.toFixed(2)} />
      </Card>
    </>) : (<>
      <Statement units="USD millions · trailing twelve months, the live book (no quarter filed yet)" asOf={asOf} lines={[
        { label: 'Revenue', usd: c.annualRevenue, total: true },
        { label: 'EBITDA', usd: c.ebitda, total: true },
        { label: 'Depreciation & amortisation', usd: -(c.ebitda - c.ebit) },
        { label: 'EBIT', usd: c.ebit, total: true },
        { label: 'Net income', usd: c.netIncome, total: true },
      ]} />
    </>);
  } else if (active === 'balance sheet') {
    const bs = latest?.balanceSheet; const pb = prior?.balanceSheet;
    body = bs ? (
      <Statement units="USD millions · quarter end" asOf={asOf} lines={[
        { label: 'Cash', usd: bs.cash, prior: pb?.cash },
        { label: 'Treasury holdings', usd: bs.treasuryHoldingsLocal, prior: pb?.treasuryHoldingsLocal },
        { label: 'Receivables', usd: bs.accountsReceivable, prior: pb?.accountsReceivable },
        { label: 'Inventory, finished · raw', usd: bs.finishedGoodsInventoryLocal + bs.rawMaterialsInventoryLocal, prior: pb ? pb.finishedGoodsInventoryLocal + pb.rawMaterialsInventoryLocal : undefined },
        { label: 'Net plant', usd: bs.netPPE, prior: pb?.netPPE },
        { label: 'Total assets', usd: bs.totalAssets, prior: pb?.totalAssets, total: true },
        { label: 'Payables', usd: bs.accountsPayable, prior: pb?.accountsPayable },
        { label: 'Short-term debt', usd: bs.shortTermDebt, prior: pb?.shortTermDebt },
        { label: 'Long-term debt', usd: bs.longTermDebt, prior: pb?.longTermDebt },
        { label: 'Total liabilities', usd: bs.totalLiabilities, prior: pb?.totalLiabilities, total: true },
        { label: "Shareholders' equity", usd: bs.shareholdersEquity, prior: pb?.shareholdersEquity, total: true },
      ]} />
    ) : (
      <Statement units="USD millions · the live book (no quarter filed yet)" asOf={asOf} lines={[
        { label: 'Cash', usd: cashOf(ensureV2(world.state), c) },
        { label: 'Gross plant', usd: plantGrossLocal(c.plant, world.state.currentWeek) },
        { label: 'Accumulated depreciation', usd: -plantAccumulatedDepreciationLocal(c.plant, world.state.currentWeek) },
        { label: 'Total debt', usd: ladderTotalLocal(ensureV2(world.state), c.id), total: true },
      ]} />
    );
  } else if (active === 'cash flow') {
    const cf = latest?.cashFlowStatement; const pc = prior?.cashFlowStatement;
    body = cf ? (
      <Statement units="USD millions · the quarter" asOf={asOf} lines={[
        { label: 'Net income', usd: cf.netIncome, prior: pc?.netIncome },
        { label: 'D&A added back', usd: cf.daAddback, prior: pc?.daAddback },
        { label: 'Working capital', usd: cf.changeInWorkingCapital, prior: pc?.changeInWorkingCapital },
        { label: 'Cash from operations', usd: cf.cashFromOperations, prior: pc?.cashFromOperations, total: true },
        { label: 'Maintenance capex', usd: -cf.maintenanceCapex, prior: pc ? -pc.maintenanceCapex : undefined },
        { label: 'Growth capex', usd: -cf.growthCapex, prior: pc ? -pc.growthCapex : undefined },
        { label: 'Cash from investing', usd: cf.cashFromInvesting, prior: pc?.cashFromInvesting, total: true },
        { label: 'Debt issued', usd: cf.debtIssuance, prior: pc?.debtIssuance },
        { label: 'Debt repaid', usd: -cf.debtRepayment, prior: pc ? -pc.debtRepayment : undefined },
        { label: 'Dividends', usd: -cf.dividendsPaid, prior: pc ? -pc.dividendsPaid : undefined },
        { label: 'Buybacks', usd: -cf.buybacks, prior: pc ? -pc.buybacks : undefined },
        { label: 'Cash from financing', usd: cf.cashFromFinancing, prior: pc?.cashFromFinancing, total: true },
        { label: 'Net change in cash', usd: cf.netChangeInCash, prior: pc?.netChangeInCash, total: true },
      ]} />
    ) : <Card style={{ padding: 14, color: T.muted }}>no quarter filed yet — the first cash-flow statement arrives with the first earnings report.</Card>;
  } else {
    body = (
      <Card style={{ padding: '2px 0' }}>
        <KV k="tax accrued, unpaid" hint="the dated wires to the treasury" v={money(unpaidTaxesOf(world, c))} />
        <KV k="loss carryforward" v={money(c.taxLossCarryforwardLocal)} />
        <KV k="tax basis of plant" hint="double-declining" v={money(c.taxBasisPpeLocal)} />
        <KV k="deferred tax liability" v={money(c.deferredTaxLiabilityLocal)} />
        <KV k="statutory rate" hint={c.region} v={pctLevel(regionOf(world, c.region)?.effectiveTaxRate)} />
      </Card>
    );
  }
  return (<>
    <Tabs items={tabs} active={active} onPick={(t) => nav.go('statements', { tab: t })} />
    {body}
  </>);
}

function InstitutionStatements({ world, e }: { world: World; e: InstitutionalEntity }) {
  const book = bookOf(world, e.id);
  const byType = new Map<string, number>();
  book.forEach((r) => byType.set(r.instrumentType, (byType.get(r.instrumentType) ?? 0) + r.usd));
  const holdings = book.reduce((a, r) => a + r.usd, 0);
  const eCashLocal = entityCashOf(ensureV2(world.state), e);
  // §3.13f: the coupon accrued on the book and not yet paid — a receivable, on the sheet like a bank's.
  const accruedLocal = bookAccruedLocal(ensureV2(world.state), e.id);
  const assets = holdings + accruedLocal + eCashLocal;
  const lines: Line[] = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, usd]) => ({ label: t.toLowerCase().replace(/_/g, ' '), usd }));
  // §3.13-BOOK f2b: the book's cost and its two results, read off the register's lots.
  const v2 = ensureV2(world.state);
  let realised = 0; bookRealisedOf(v2, e.id).forEach((usd) => { realised += usd; });
  return (
    <Statement units="USD millions · the live book" asOf={formatDate(world.state.currentWeek)} lines={[
      ...lines,
      { label: 'Accrued coupon', usd: accruedLocal },
      { label: 'Cash at the house bank', usd: eCashLocal },
      { label: 'Total assets', usd: assets, total: true },
      { label: 'The book at cost', usd: bookBasisLocal(v2, e.id) },
      { label: 'Unrealised on the book', usd: bookUnrealisedLocal(v2, e.id) },
      { label: 'Realised since the seed', usd: realised },
      { label: 'Owed to beneficiaries', usd: e.beneficiaryLiabilityLocal ?? 0 },
      { label: 'Equity capital', usd: e.equityCapitalLocal, total: true },
    ]} />
  );
}

function RegionStatements({ world, r, tab, nav }: { world: World; r: Region; tab: string; nav: import('../ui').Nav }) {
  const tabs = ['national accounts', 'treasury', 'banks', 'households'];
  const active = tabs.includes(tab) ? tab : tabs[0];
  const asOf = formatDate(world.state.currentWeek);
  const bs = r.bankingSector; const hs = r.householdState;
  let body: React.ReactNode;
  if (active === 'national accounts') {
    const gdp = r.derivedNominalGdpLocal ?? r.estimatedNominalGdpLocal;
    body = <Statement units="USD millions · annualised from the week" asOf={asOf} lines={[
      { label: 'Consumption', usd: r.consumptionComponentLocal },
      { label: 'Investment', usd: r.investmentComponentLocal },
      { label: 'Government', usd: (r.governmentOutlaysLocal ?? r.governmentSpendingWeeklyLocal) * 52 },
      { label: 'Exports', usd: r.exportsLocal },
      { label: 'Imports', usd: -r.importsLocal },
      { label: 'GDP', usd: gdp, total: true },
      { label: 'Unemployment', text: pctLevel(r.unemploymentRate) },
      { label: 'Inflation · core', text: `${pctLevel(r.inflation)} · ${pctLevel(r.coreInflation)}` },
      // §3.15-iii: the trade balance is the external read that exists; a current account is 37-BOP's.
      { label: 'Trade balance, share of GDP', text: gdp > 0 ? pct(r.tradeBalance / gdp, 1) : '—' },
    ]} />;
  } else if (active === 'treasury') {
    body = <Statement units="USD millions · weekly flows" asOf={asOf} lines={[
      { label: 'Revenue', usd: r.governmentRevenueLocal, total: true },
      { label: 'Corporate tax', usd: r.taxCollectedCorporateLocal },
      { label: 'Payroll tax', usd: r.taxCollectedPayrollLocal },
      { label: 'Consumption tax', usd: r.taxCollectedConsumptionLocal },
      { label: 'Household tax', usd: r.taxCollectedHouseholdLocal },
      { label: 'Outlays', usd: r.governmentOutlaysLocal ?? r.governmentSpendingWeeklyLocal, total: true },
      { label: 'Payroll', usd: r.governmentPayrollWeeklyLocal },
      { label: 'Transfers', usd: r.governmentTransfersWeeklyLocal },
      { label: 'Interest', usd: r.governmentInterestWeeklyLocal },
      { label: 'Treasury account', usd: treasuryAccountOf(ensureV2(world.state), r.id as RegionId), total: true },
      { label: 'Sovereign rating', text: r.sovereignRating },
      { label: 'Fiscal stance', text: r.fiscalStanceScore.toFixed(2) },
    ]} />;
  } else if (active === 'banks') {
    const sov = world.state.companies.reduce((a, b) => a + (b.region === r.id && b.isBankEntity && !b.isDefaulted && b.bankBalanceSheet ? bankSovereignBookLocal(ensureV2(world.state), b.id) : 0), 0);
    const books = regionLoanBooksLocal(world.state.companies.filter((c) => c.region === r.id && c.isBankEntity && !c.isDefaulted), (b) => facilityBookOf(ensureV2(world.state), b.id));
    const regionLines = world.state.companies.reduce((a, c) => (c.region === r.id && c.isBankEntity && !c.isDefaulted && c.bankBalanceSheet ? addDepositLines(a, stateDepositLines(world.state, c)) : a), ZERO_DEPOSIT_LINES);
    body = <Statement units="USD millions · the region's banks, summed" asOf={asOf} lines={[
      { label: 'Business loans', usd: books.businessLoanLocal },
      { label: 'Household loans', usd: books.consumerLoanLocal },
      { label: 'Sovereign bonds', usd: sov },
      { label: 'Reserves', usd: world.state.companies.reduce((a, c) => a + (c.region === r.id && c.isBankEntity && !c.isDefaulted && c.bankBalanceSheet ? bankReservesOf(ensureV2(world.state), c.id) : 0), 0) },
      { label: 'Household deposits', usd: regionLines.householdLocal, total: true },
      { label: 'Corporate deposits', usd: regionLines.corporateLocal },
      { label: 'Institutional deposits', usd: regionLines.institutionalLocal },
      { label: 'Central bank loans', usd: bs?.centralBankLoanLocal },
      { label: 'Equity', usd: bs?.bankEquityLocal, total: true },
      { label: 'Capital ratio', text: pctLevel(bs?.bankCapitalRatio, 2) },
      { label: 'Net interest margin', text: pctLevel(bs?.netInterestMarginPct, 2) },
      { label: 'Overnight repo rate', text: pctLevel(r.repoRateAnnual, 2) },
    ]} />;
  } else {
    body = <Statement units="USD millions · the household sector" asOf={asOf} lines={[
      { label: 'Deposits', usd: householdDepositsOf(ensureV2(world.state), r.id as RegionId) },
      { label: 'Money fund shares', usd: hs?.mmfSharesLocal },
      { label: 'Direct equity', usd: hs?.directEquityLocal },
      { label: 'ETF holdings', usd: hs?.etfHoldingsLocal },
      { label: 'Housing', usd: hs?.housingStockLocal },
      { label: 'Net worth', usd: hs?.netWorthLocal, total: true },
      { label: 'Mortgages', usd: hs?.mortgageDebtLocal },
      { label: 'Cards · consumer loans', usd: (hs?.creditCardDebtLocal ?? 0) + (hs?.otherConsumerLoanDebtLocal ?? 0) },
      { label: 'Debt to income', text: ratio(hs?.householdDebtToIncomeRatio, 2) },
      { label: 'Savings rate', text: pctLevel(hs?.savingsRate) },
    ]} />;
  }
  return (<>
    <Tabs items={tabs} active={active} onPick={(t) => nav.go('statements', { tab: t })} />
    {body}
  </>);
}

export const statements: FunctionModule = {
  name: 'statements',
  appliesTo: ['company', 'institution', 'region', 'centralbank'],
  blurb: 'P&L · balance sheet · cash flow',
  argKey: 'tab',
  render({ world, ref, args, nav }) {
    if (ref.type === 'company') { const c = companyOf(world, ref.id); return c ? <CompanyStatements world={world} c={c} tab={args.tab ?? ''} nav={nav} /> : null; }
    if (ref.type === 'institution') { const e = institutionOf(world, ref.id); return e ? <InstitutionStatements world={world} e={e} /> : null; }
    const r = regionOf(world, ref.id); return r ? <RegionStatements world={world} r={r} tab={ref.type === 'centralbank' && !args.tab ? 'treasury' : args.tab ?? ''} nav={nav} /> : null;
  },
};

