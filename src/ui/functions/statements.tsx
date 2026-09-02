import { RegionId } from '../../domain/geography';
/**
 * AU · statements — a firm's P&L, balance sheet and cash flow (the latest filed quarter beside
 * the one before), a bank's sheet, an institution's assets and liabilities, a region's national
 * accounts and treasury. Statement style: a units line, indented items, ruled subtotals,
 * parenthesised negatives, a change column.
 */

import { Company, InstitutionalEntity, Region } from '../../types';
import { undueOwedByPayerUSD, partyId, internReason, CORPORATE_TAX_REASON } from '../../engine/simulation/stages/settlement';
import { loanBooksOf, businessLoanBookOf, consumerLoanBookOf, regionLoanBooksUSD, addDepositLines, ZERO_DEPOSIT_LINES } from '../../domain/banking';
import { FunctionModule } from '../fn';
import { Card, Hint, KV, Tabs, T, mono } from '../ui';
import { statementUSD, pct, pctLevel, ratio, changePct, money } from '../format';
import { formatDate, quarterLabel } from '../calendar';
import { World, companyOf, institutionOf, regionOf, bookOf } from '../world';
import { bankRwaUSD } from '../../domain/bank-pricing';
import { totalDebtOf } from '../../domain/company';
import { cashOf, householdDepositsOf, bankReservesOf, stateDepositLines, treasuryAccountOf } from '../../engine/ledger/accounts';
import { ensureV2 } from '../../engine2/world';
import { entityCashOf } from '../../engine/ledger/accounts';
import { facilityBookOf } from '../../engine2/tranches';

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
              <span style={{ ...mono, textAlign: 'right' }}>{l.text ?? statementUSD(l.usd)}</span>
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
  const latest = hist[hist.length - 1];
  const prior = hist[hist.length - 2];
  const asOf = latest ? `${quarterLabel(latest.week)} · filed ${formatDate(latest.week)}` : formatDate(world.state.currentWeek);
  const bank = c.bankBalanceSheet;
  const tabs = bank ? ['bank sheet', 'income'] : ['income', 'balance sheet', 'cash flow', 'tax'];
  const active = tabs.includes(tab) ? tab : tabs[0];
  let body: React.ReactNode;
  if (active === 'bank sheet' && bank) {
    const sov = Object.values(bank.sovereignBondHoldingsByTenor || {}).reduce((a, v) => a + (Number(v) || 0), 0);
    const lines = stateDepositLines(world.state, c.ticker);
    const deposits = lines.householdUSD + lines.corporateUSD + lines.institutionalUSD + lines.smeUSD;
    const desks = Object.values(bank.dealerDeskInventory ?? {}).reduce((a, rows) => a + rows.reduce((b, r) => b + Math.abs(r.inventoryUSD), 0), 0);
    const reservesUSD = bankReservesOf(ensureV2(world.state), c.ticker);
    const facilityBookUSD = facilityBookOf(ensureV2(world.state), c.ticker);
    const assets = loanBooksOf(bank, facilityBookUSD) + sov + reservesUSD + (bank.repoLentUSD ?? 0) + (bank.sovereignAccruedCouponUSD ?? 0) + desks + (bank.primeBrokerageLoansUSD ?? 0);
    const liabilities = deposits + (bank.clientMarginUSD ?? 0) + (bank.centralBankLoanUSD ?? 0) + (bank.repoBorrowedUSD ?? 0) + (bank.srfBorrowingUSD ?? 0);
    body = (<>
      <Statement units="USD millions · the live sheet" asOf={formatDate(world.state.currentWeek)} lines={[
        { label: 'Business loans', usd: businessLoanBookOf(bank, facilityBookUSD) },
        { label: 'Household loans', usd: consumerLoanBookOf(bank) },
        { label: 'Sovereign bonds', usd: sov },
        { label: 'Reserves at the central bank', usd: reservesUSD },
        { label: 'Repo lent', usd: bank.repoLentUSD ?? 0 },
        { label: 'Desk inventory, gross', usd: desks },
        { label: 'Prime brokerage loans', usd: bank.primeBrokerageLoansUSD ?? 0 },
        { label: 'Accrued sovereign coupon', usd: bank.sovereignAccruedCouponUSD ?? 0 },
        { label: 'Total assets', usd: assets, total: true },
        { label: 'Household deposits', usd: lines.householdUSD },
        { label: 'Corporate deposits', usd: lines.corporateUSD },
        { label: 'Institutional deposits', usd: lines.institutionalUSD },
        { label: 'Small-business deposits', usd: lines.smeUSD },
        { label: 'Client margin held', usd: bank.clientMarginUSD ?? 0 },
        { label: 'Central bank loan', usd: bank.centralBankLoanUSD ?? 0 },
        { label: 'Repo borrowed · facility', usd: (bank.repoBorrowedUSD ?? 0) + (bank.srfBorrowingUSD ?? 0) },
        { label: 'Total liabilities', usd: liabilities, total: true },
        { label: 'Equity', usd: bank.bankEquityUSD, total: true },
        { label: 'Identity residual', usd: liabilities + bank.bankEquityUSD - assets },
      ]} />
      <Card style={{ padding: '2px 0' }}>
        <KV k="capital ratio" hint={`rwa ${money(bankRwaUSD(bank, facilityBookUSD))} · floor 8% · closed at 2%`} v={pctLevel(bank.bankCapitalRatio, 2)} />
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
        { label: 'Treasury holdings', usd: bs.treasuryHoldingsUSD, prior: pb?.treasuryHoldingsUSD },
        { label: 'Receivables', usd: bs.accountsReceivable, prior: pb?.accountsReceivable },
        { label: 'Inventory, finished · raw', usd: bs.finishedGoodsInventoryUSD + bs.rawMaterialsInventoryUSD, prior: pb ? pb.finishedGoodsInventoryUSD + pb.rawMaterialsInventoryUSD : undefined },
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
        { label: 'Gross plant', usd: c.grossPPEUSD },
        { label: 'Accumulated depreciation', usd: -(c.accumulatedDepreciationUSD ?? 0) },
        { label: 'Total debt', usd: totalDebtOf(c), total: true },
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
        <KV k="tax accrued, unpaid" hint="the dated wires to the treasury" v={money(world.state.pendingPaymentJournal ? undueOwedByPayerUSD(world.state.pendingPaymentJournal, partyId({ kind: 'COMPANY', ticker: c.ticker }), internReason(CORPORATE_TAX_REASON), world.state.currentWeek) : 0)} />
        <KV k="loss carryforward" v={money(c.taxLossCarryforwardUSD)} />
        <KV k="tax basis of plant" hint="double-declining" v={money(c.taxBasisPpeUSD)} />
        <KV k="deferred tax liability" v={money(c.deferredTaxLiabilityUSD)} />
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
  const eCashUSD = entityCashOf(ensureV2(world.state), e);
  const assets = holdings + eCashUSD;
  const lines: Line[] = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, usd]) => ({ label: t.toLowerCase().replace(/_/g, ' '), usd }));
  return (
    <Statement units="USD millions · the live book" asOf={formatDate(world.state.currentWeek)} lines={[
      ...lines,
      { label: 'Cash at the house bank', usd: eCashUSD },
      { label: 'Total assets', usd: assets, total: true },
      { label: 'Owed to beneficiaries', usd: e.beneficiaryLiabilityUSD ?? 0 },
      { label: 'Equity capital', usd: e.equityCapitalUSD, total: true },
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
    const gdp = r.derivedNominalGdpUSD ?? r.estimatedNominalGdpUSD;
    body = <Statement units="USD millions · annualised from the week" asOf={asOf} lines={[
      { label: 'Consumption', usd: r.consumptionComponentUSD },
      { label: 'Investment', usd: r.investmentComponentUSD },
      { label: 'Government', usd: (r.governmentOutlaysUSD ?? r.governmentSpendingWeeklyUSD) * 52 },
      { label: 'Exports', usd: r.exportsUSD },
      { label: 'Imports', usd: -r.importsUSD },
      { label: 'GDP', usd: gdp, total: true },
      { label: 'Unemployment', text: pctLevel(r.unemploymentRate) },
      { label: 'Inflation · core', text: `${pctLevel(r.inflation)} · ${pctLevel(r.coreInflation)}` },
      { label: 'Current account, share of GDP', text: pctLevel(r.currentAccountPctGdp) },
    ]} />;
  } else if (active === 'treasury') {
    body = <Statement units="USD millions · weekly flows" asOf={asOf} lines={[
      { label: 'Revenue', usd: r.governmentRevenueUSD, total: true },
      { label: 'Corporate tax', usd: r.taxCollectedCorporateUSD },
      { label: 'Payroll tax', usd: r.taxCollectedPayrollUSD },
      { label: 'Consumption tax', usd: r.taxCollectedConsumptionUSD },
      { label: 'Household tax', usd: r.taxCollectedHouseholdUSD },
      { label: 'Outlays', usd: r.governmentOutlaysUSD ?? r.governmentSpendingWeeklyUSD, total: true },
      { label: 'Payroll', usd: r.governmentPayrollWeeklyUSD },
      { label: 'Transfers', usd: r.governmentTransfersWeeklyUSD },
      { label: 'Interest', usd: r.governmentInterestWeeklyUSD },
      { label: 'Treasury account', usd: treasuryAccountOf(ensureV2(world.state), r.id as RegionId), total: true },
      { label: 'Sovereign rating', text: r.sovereignRating },
      { label: 'Fiscal stance', text: r.fiscalStanceScore.toFixed(2) },
    ]} />;
  } else if (active === 'banks') {
    const sov = bs?.sovereignBondHoldingsUSD ?? 0;
    const books = regionLoanBooksUSD(world.state.companies.filter((c) => c.region === r.id && c.isBankEntity && !c.isDefaulted), (b) => facilityBookOf(ensureV2(world.state), b.ticker));
    const regionLines = world.state.companies.reduce((a, c) => (c.region === r.id && c.isBankEntity && !c.isDefaulted && c.bankBalanceSheet ? addDepositLines(a, stateDepositLines(world.state, c.ticker)) : a), ZERO_DEPOSIT_LINES);
    body = <Statement units="USD millions · the region's banks, summed" asOf={asOf} lines={[
      { label: 'Business loans', usd: books.businessLoanUSD },
      { label: 'Household loans', usd: books.consumerLoanUSD },
      { label: 'Sovereign bonds', usd: sov },
      { label: 'Reserves', usd: world.state.companies.reduce((a, c) => a + (c.region === r.id && c.isBankEntity && !c.isDefaulted && c.bankBalanceSheet ? bankReservesOf(ensureV2(world.state), c.ticker) : 0), 0) },
      { label: 'Household deposits', usd: regionLines.householdUSD, total: true },
      { label: 'Corporate deposits', usd: regionLines.corporateUSD },
      { label: 'Institutional deposits', usd: regionLines.institutionalUSD },
      { label: 'Central bank loans', usd: bs?.centralBankLoanUSD },
      { label: 'Equity', usd: bs?.bankEquityUSD, total: true },
      { label: 'Capital ratio', text: pctLevel(bs?.bankCapitalRatio, 2) },
      { label: 'Net interest margin', text: pctLevel(bs?.netInterestMarginPct, 2) },
      { label: 'Overnight repo rate', text: pctLevel(r.repoRateAnnual, 2) },
    ]} />;
  } else {
    body = <Statement units="USD millions · the household sector" asOf={asOf} lines={[
      { label: 'Deposits', usd: householdDepositsOf(ensureV2(world.state), r.id as RegionId) },
      { label: 'Money fund shares', usd: hs?.mmfSharesUSD },
      { label: 'Direct equity', usd: hs?.directEquityUSD },
      { label: 'ETF holdings', usd: hs?.etfHoldingsUSD },
      { label: 'Housing', usd: hs?.housingStockUSD },
      { label: 'Net worth', usd: hs?.netWorthUSD, total: true },
      { label: 'Mortgages', usd: hs?.mortgageDebtUSD },
      { label: 'Cards · consumer loans', usd: (hs?.creditCardDebtUSD ?? 0) + (hs?.otherConsumerLoanDebtUSD ?? 0) },
      { label: 'Debt to income', text: ratio(hs?.householdDebtToIncomeRatio, 2) },
      { label: 'Savings rate', text: pctLevel(hs?.savingsRate) },
      { label: 'Consumer confidence', text: (hs?.consumerConfidence ?? 0).toFixed(0) },
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

