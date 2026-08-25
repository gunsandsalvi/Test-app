import React, { useState } from 'react';
import { GameState, Company } from '../../types';
import { formatCurrency, formatPercent, formatBondName } from '../../engine/formatters';
import { TapToChart } from '../shared/TapToChart';
import { priceCorporateBond, priceLeveragedLoan } from '../../engine/pricing';

type DeepDiveTab = 'performance' | 'financials' | 'exposure' | 'supplychain' | 'credit' | 'management';

export const CompanyDeepDive: React.FC<{ company: Company; state: GameState; onOpenTrade: (i: any) => void }> = ({ company, state, onOpenTrade }) => {
  const [tab, setTab] = useState<DeepDiveTab>('performance');
  const [finSubTab, setFinSubTab] = useState<'income' | 'balance' | 'cashflow'>('income');
  const reg = state.regions[company.region];

  const generateStatusLine = (c: Company): string => {
    const parts: string[] = [];
    const primaryLine = c.productLines?.[0];
    if (primaryLine) {
      const displayName = primaryLine.subUnitId.replace(/_/g, ' ');
      if (primaryLine.competitiveness > 0.1) parts.push(`Gaining share in ${displayName}`);
      else if (primaryLine.competitiveness < -0.1) parts.push(`Losing share in ${displayName}`);
      const catDemand = reg.categoryDemand[primaryLine.subUnitId as any] as any;
      if (catDemand?.crowdingIntensity > 0.5) parts.push('facing heavy competitive crowding');
    }
    if (c.executionQuality > 1.1) parts.push('execution trending strong');
    else if (c.executionQuality < 0.9) parts.push('execution trending weak');
    if (c.maintenanceShortfallStreak > 5) parts.push('deferred maintenance risk building');
    return parts.length > 0 ? parts.join(', ') : 'No notable signals this week';
  };

  const latestFund = company.historicalFundamentals?.[company.historicalFundamentals.length - 1];

  return (
    <div className="pb-20">
      <div className="p-3 border-b border-[var(--border-hairline)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-[var(--text-primary)]">{company.ticker}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">{company.name} · {company.sector} · {company.region}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-[var(--font-numeric)] font-bold">{formatCurrency(company.stockPrice, { compact: false })}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">{company.creditRating}</div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-[var(--text-secondary)] italic">{generateStatusLine(company)}</div>
      </div>

      <div className="flex overflow-x-auto no-scrollbar border-b border-[var(--border-hairline)]">
        {(['performance', 'financials', 'exposure', 'supplychain', 'credit', 'management'] as DeepDiveTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-[11px] font-bold uppercase whitespace-nowrap ${tab === t ? 'text-[var(--text-primary)] border-b-2 border-[var(--region-usa)]' : 'text-[var(--text-tertiary)]'}`}>
            {t === 'supplychain' ? 'Supply Chain' : t}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3">
        {tab === 'performance' && (
          <>
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] mb-2">
              <div className="flex-1 min-w-0 pr-4">
                <TapToChart label="Stock Price" value={formatCurrency(company.stockPrice, { compact: false })} history={company.historicalPrices} />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTrade({
                    assetType: 'EQUITY',
                    id: company.id,
                    symbol: company.ticker,
                    name: `${company.name} (Equity)`,
                    region: company.region,
                    price: company.stockPrice,
                    quoteUnit: 'USD',
                    details: { rating: company.creditRating, sector: company.sector }
                  });
                }}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-xs uppercase tracking-wide transition-all shrink-0 cursor-pointer"
              >
                Trade
              </button>
            </div>
            <TapToChart label="EPS (quarterly)" value={formatCurrency(company.eps, { compact: false })} history={(company.historicalFundamentals || []).map(f => f.eps ?? 0)} />
            <TapToChart label="Revenue (quarterly)" value={formatCurrency(company.annualRevenue / 4, { compact: true })} history={(company.historicalFundamentals || []).map(f => (f.incomeStatement?.revenue ?? (f.annualRevenue ?? 0) / 4))} />
            <TapToChart label="EBITDA Margin" value={formatPercent(company.ebitda / Math.max(1, company.annualRevenue), { isDecimal: true })} history={(company.historicalFundamentals || []).map(f => (f.ebitda ?? 0) / Math.max(1, f.annualRevenue ?? 1))} />
            <div className="pt-2 border-t border-[var(--border-hairline)]">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold mb-1">Last Earnings</div>
              <div className={`text-xs font-bold ${company.lastEarningsSurprisePct >= 0 ? 'text-[var(--signal-positive)]' : 'text-[var(--signal-negative)]'}`}>
                {formatPercent(company.lastEarningsSurprisePct, { isDecimal: true, showSign: true })} surprise
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] italic mt-1">"{company.lastManagementCommentary}"</div>
            </div>
          </>
        )}

        {tab === 'financials' && (
          <>
            <div className="flex space-x-2 border-b border-[var(--border-hairline)] pb-2 mb-2">
              {[
                ['income', 'Income Statement'],
                ['balance', 'Balance Sheet'],
                ['cashflow', 'Cash Flow'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFinSubTab(key as any)}
                  className={`px-2 py-1 text-[11px] font-bold rounded ${finSubTab === key ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)]' : 'text-[var(--text-tertiary)]'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {finSubTab === 'income' && latestFund?.incomeStatement && (
              <>
                <TapToChart label="Quarterly Revenue" value={formatCurrency(latestFund.incomeStatement.revenue, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.incomeStatement?.revenue ?? 0)} />
                <TapToChart label="Gross Profit" value={formatCurrency(latestFund.incomeStatement.grossProfit, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.incomeStatement?.grossProfit ?? 0)} />
                <TapToChart label="EBITDA" value={formatCurrency(latestFund.incomeStatement.ebitda, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.incomeStatement?.ebitda ?? 0)} />
                <TapToChart label="Net Income" value={formatCurrency(latestFund.incomeStatement.netIncome, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.incomeStatement?.netIncome ?? 0)} />
                <div className="space-y-1 pt-2 border-t border-[var(--border-hairline)]">
                  {[
                    ['Revenue', latestFund.incomeStatement.revenue],
                    ['Cost of Goods Sold (COGS)', -latestFund.incomeStatement.cogs],
                    ['Gross Profit', latestFund.incomeStatement.grossProfit],
                    ['SG&A Expense', -latestFund.incomeStatement.sgaExpense],
                    ['EBITDA', latestFund.incomeStatement.ebitda],
                    ['Depreciation & Amortization', -latestFund.incomeStatement.depreciationAmortization],
                    ['EBIT', latestFund.incomeStatement.ebit],
                    ['Interest Expense', -latestFund.incomeStatement.interestExpense],
                    ['Pretax Income', latestFund.incomeStatement.pretaxIncome],
                    ['Tax Expense', -latestFund.incomeStatement.taxExpense],
                    ['Net Income', latestFund.incomeStatement.netIncome],
                    ['EPS', latestFund.incomeStatement.eps],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-secondary)]">{label}</span>
                      <span className="font-[var(--font-numeric)] font-bold">{typeof val === 'number' && label !== 'EPS' ? formatCurrency(val, { compact: true }) : val}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {finSubTab === 'balance' && latestFund?.balanceSheet && (
              <>
                {company.isBankEntity && (
                  <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl mb-3 space-y-1 text-[var(--text-primary)]">
                    <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold border-b border-[var(--border-hairline)] pb-1 mb-2">
                      Prorated Bank Balance Sheet & Capital Metrics
                    </div>
                    <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-secondary)]">Total Loan Book</span>
                      <span className="font-[var(--font-numeric)] font-bold">{formatCurrency((reg.bankingSector.businessLoanBookUSD + reg.bankingSector.consumerLoanBookUSD) * (company.bankMarketShare ?? 0.25), { compact: true })}</span>
                    </div>
                    <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-secondary)]">  · Business Loans</span>
                      <span className="font-[var(--font-numeric)] text-[var(--text-secondary)]">{formatCurrency(reg.bankingSector.businessLoanBookUSD * (company.bankMarketShare ?? 0.25), { compact: true })}</span>
                    </div>
                    <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-secondary)]">  · Consumer Loans</span>
                      <span className="font-[var(--font-numeric)] text-[var(--text-secondary)]">{formatCurrency(reg.bankingSector.consumerLoanBookUSD * (company.bankMarketShare ?? 0.25), { compact: true })}</span>
                    </div>
                    <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-secondary)]">Customer Deposits</span>
                      <span className="font-[var(--font-numeric)] font-bold">{formatCurrency(reg.bankingSector.depositsUSD * (company.bankMarketShare ?? 0.25), { compact: true })}</span>
                    </div>
                    <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-secondary)]">Sovereign Bond Holdings</span>
                      <span className="font-[var(--font-numeric)] font-bold">{formatCurrency(reg.bankingSector.sovereignBondHoldingsUSD * (company.bankMarketShare ?? 0.25), { compact: true })}</span>
                    </div>
                    <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                      <span className="text-[var(--text-secondary)]">Capital Adequacy Ratio (Tier 1)</span>
                      <span className="font-bold">{(reg.bankingSector.bankCapitalRatio * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between text-xs py-1">
                      <span className="text-[var(--text-secondary)]">Net Interest Margin (NIM)</span>
                      <span className="font-bold">{(reg.bankingSector.netInterestMarginPct * 100).toFixed(2)}%</span>
                    </div>
                  </div>
                )}
                <TapToChart label="Total Assets" value={formatCurrency(latestFund.balanceSheet.totalAssets, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.balanceSheet?.totalAssets ?? 0)} />
                <TapToChart label="Total Debt" value={formatCurrency(latestFund.balanceSheet.shortTermDebt + latestFund.balanceSheet.longTermDebt, { compact: true })} history={(company.historicalFundamentals || []).map(f => (f.balanceSheet?.shortTermDebt ?? 0) + (f.balanceSheet?.longTermDebt ?? 0))} />
                <TapToChart label="Cash & Equivalents" value={formatCurrency(latestFund.balanceSheet.cash, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.balanceSheet?.cash ?? 0)} />
                <TapToChart label="Shareholders' Equity" value={formatCurrency(latestFund.balanceSheet.shareholdersEquity, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.balanceSheet?.shareholdersEquity ?? 0)} />
                <div className="space-y-1 pt-2 border-t border-[var(--border-hairline)]">
                  {[
                    ['Cash', latestFund.balanceSheet.cash],
                    ['Treasury Holdings', latestFund.balanceSheet.treasuryHoldingsUSD],
                    ['Accounts Receivable', latestFund.balanceSheet.accountsReceivable],
                    ['Finished Goods Inventory', latestFund.balanceSheet.finishedGoodsInventoryUSD],
                    ['Net PPE', latestFund.balanceSheet.netPPE],
                    ['Total Assets', latestFund.balanceSheet.totalAssets],
                    ['Accounts Payable', latestFund.balanceSheet.accountsPayable],
                    ['Short-Term Debt', latestFund.balanceSheet.shortTermDebt],
                    ['Long-Term Debt', latestFund.balanceSheet.longTermDebt],
                    ['Total Liabilities', latestFund.balanceSheet.totalLiabilities],
                    ["Shareholders' Equity", latestFund.balanceSheet.shareholdersEquity],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                      <span className={`text-[var(--text-secondary)] ${label === 'Total Assets' || label === 'Total Liabilities' || label === "Shareholders' Equity" ? 'font-bold text-[var(--text-primary)]' : ''}`}>{label}</span>
                      <span className="font-[var(--font-numeric)] font-bold">{formatCurrency(val as number, { compact: true })}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {finSubTab === 'cashflow' && latestFund?.cashFlowStatement && (
              <>
                <TapToChart label="Cash from Operations" value={formatCurrency(latestFund.cashFlowStatement.cashFromOperations, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.cashFlowStatement?.cashFromOperations ?? 0)} />
                <TapToChart label="Cash from Investing" value={formatCurrency(latestFund.cashFlowStatement.cashFromInvesting, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.cashFlowStatement?.cashFromInvesting ?? 0)} />
                <TapToChart label="Cash from Financing" value={formatCurrency(latestFund.cashFlowStatement.cashFromFinancing, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.cashFlowStatement?.cashFromFinancing ?? 0)} />
                <TapToChart label="Net Change in Cash" value={formatCurrency(latestFund.cashFlowStatement.netChangeInCash, { compact: true })} history={(company.historicalFundamentals || []).map(f => f.cashFlowStatement?.netChangeInCash ?? 0)} />
                <div className="space-y-1 pt-2 border-t border-[var(--border-hairline)]">
                  {[
                    ['Net Income', latestFund.cashFlowStatement.netIncome],
                    ['D&A Addback', latestFund.cashFlowStatement.daAddback],
                    ['Working Capital Change', latestFund.cashFlowStatement.changeInWorkingCapital],
                    ['Cash from Operations', latestFund.cashFlowStatement.cashFromOperations],
                    ['Maintenance CapEx', latestFund.cashFlowStatement.maintenanceCapex],
                    ['Growth CapEx', latestFund.cashFlowStatement.growthCapex],
                    ['Treasury Purchases', latestFund.cashFlowStatement.treasuryPurchases],
                    ['Cash from Investing', latestFund.cashFlowStatement.cashFromInvesting],
                    ['Debt Issuance', latestFund.cashFlowStatement.debtIssuance],
                    ['Debt Repayment', latestFund.cashFlowStatement.debtRepayment],
                    ['Dividends Paid', latestFund.cashFlowStatement.dividendsPaid],
                    ['Share Buybacks', latestFund.cashFlowStatement.buybacks],
                    ['Cash from Financing', latestFund.cashFlowStatement.cashFromFinancing],
                    ['Net Change in Cash', latestFund.cashFlowStatement.netChangeInCash],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                      <span className={`text-[var(--text-secondary)] ${(label as string).startsWith('Cash from') || label === 'Net Change in Cash' ? 'font-bold text-[var(--text-primary)]' : ''}`}>{label}</span>
                      <span className="font-[var(--font-numeric)] font-bold">{formatCurrency(val as number, { compact: true })}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'exposure' && (
          <>
            {(company.productLines || []).map(line => {
              const catDemand = reg.categoryDemand[line.subUnitId as any] as any;
              return (
                <div key={line.subUnitId} className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold">{line.subUnitId.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] text-[var(--text-tertiary)]">{formatPercent(line.revenueShare, { isDecimal: true })} of revenue</span>
                  </div>
                  <div className="flex justify-between text-[11px] mt-1">
                    <span className="text-[var(--text-secondary)]">Category share</span>
                    <span className={`font-bold ${line.competitiveness > 0 ? 'text-[var(--signal-positive)]' : line.competitiveness < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                      {formatPercent(line.categoryMarketShare, { isDecimal: true })} {line.competitiveness > 0 ? '▲' : line.competitiveness < 0 ? '▼' : ''}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--text-secondary)]">Category demand growth</span>
                    <span className={catDemand?.demandGrowthAnnual >= 0 ? 'text-[var(--signal-positive)]' : 'text-[var(--signal-negative)]'}>
                      {formatPercent(catDemand?.demandGrowthAnnual ?? 0, { isDecimal: true })}
                    </span>
                  </div>
                  {catDemand?.crowdingIntensity !== undefined && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[var(--text-secondary)]">Crowding intensity</span>
                      <span className={catDemand.crowdingIntensity > 0.5 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}>
                        {isNaN(catDemand.crowdingIntensity) ? '—' : catDemand.crowdingIntensity.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === 'supplychain' && (
          <>
            <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-secondary)]">Finished Goods Inventory</span>
              <span className="font-[var(--font-numeric)] font-bold">{formatCurrency(company.finishedGoodsInventoryUSD ?? 0, { compact: true })}</span>
            </div>
            <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-secondary)]">Input Supply Constraint</span>
              <span className={(company.inputSupplyConstraintFactor ?? 1) < 1 ? 'text-[var(--signal-negative)] font-bold' : 'text-[var(--text-tertiary)]'}>
                {(company.inputSupplyConstraintFactor ?? 1) < 1 ? `Constrained (${(((company.inputSupplyConstraintFactor ?? 1)) * 100).toFixed(0)}% capacity)` : 'Unconstrained'}
              </span>
            </div>

            <div className="pt-3 mt-3 border-t border-[var(--border-hairline)] space-y-3">
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold border-b border-[var(--border-hairline)] pb-1 mb-2">Key Supply Relationships</div>
            {(() => {
              const rels = (reg as any).supplyRelationships || [];
              const asSupplier = rels.filter((r: any) => r.supplierCompanyId === company.id);
              const asCustomer = rels.filter((r: any) => r.customerCompanyId === company.id);
              
              if (asSupplier.length === 0 && asCustomer.length === 0) {
                 return <div className="text-[11px] text-[var(--text-tertiary)] italic">No explicit major bilateral supply contracts found. Operates primarily via spot markets.</div>;
              }

              return (
                <div className="space-y-4">
                  {asSupplier.length > 0 && (
                    <div className="space-y-1">
                       <div className="text-[9px] text-[var(--text-secondary)] font-bold mb-1">MAJOR CUSTOMERS (Downstream)</div>
                       {asSupplier.map((r: any, i: number) => {
                          const cst = state.companies.find(c => c.id === r.customerCompanyId);
                          return (
                            <div key={i} className="flex justify-between items-center p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                               <div>
                                 <div className="text-[11px] font-bold">{cst?.name || r.customerCompanyId}</div>
                                 <div className="text-[9px] text-[var(--text-tertiary)]">Contract Strength: {(r.relationshipStrength * 100).toFixed(0)}%</div>
                               </div>
                               <div className="text-right">
                                 <div className="text-[11px] font-[var(--font-numeric)]">{formatCurrency(r.weeklyVolumeUSD, { compact: true })}/wk</div>
                               </div>
                            </div>
                          );
                       })}
                    </div>
                  )}
                  {asCustomer.length > 0 && (
                    <div className="space-y-1">
                       <div className="text-[9px] text-[var(--text-secondary)] font-bold mb-1">MAJOR SUPPLIERS (Upstream)</div>
                       {asCustomer.map((r: any, i: number) => {
                          const sup = state.companies.find(c => c.id === r.supplierCompanyId);
                          return (
                            <div key={i} className="flex justify-between items-center p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                               <div>
                                 <div className="text-[11px] font-bold">{sup?.name || r.supplierCompanyId}</div>
                                 <div className="text-[9px] text-[var(--text-tertiary)]">Contract Strength: {(r.relationshipStrength * 100).toFixed(0)}%</div>
                               </div>
                               <div className="text-right">
                                 <div className="text-[11px] font-[var(--font-numeric)]">{formatCurrency(r.weeklyVolumeUSD, { compact: true })}/wk</div>
                               </div>
                            </div>
                          );
                       })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

            <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-secondary)]">Maintenance Shortfall Streak</span>
              <span className={(company.maintenanceShortfallStreak ?? 0) > 5 ? 'text-[var(--signal-negative)] font-bold' : 'text-[var(--text-tertiary)]'}>
                {company.maintenanceShortfallStreak ?? 0} weeks
              </span>
            </div>
          </>
        )}

        {tab === 'credit' && (
          <>
            <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-secondary)]">Credit Rating</span>
              <span className="font-bold">{company.creditRating} {(company.ratingHistory?.length ?? 0) > 1 && `(was ${company.ratingHistory[company.ratingHistory.length - 2]})`}</span>
            </div>
            <TapToChart label="Leverage (Debt/EBITDA)" value={isNaN(company.leverage) ? '—' : `${company.leverage.toFixed(2)}x`} history={(company.historicalFundamentals || []).map(f => f.leverage ?? 0)} />
            <TapToChart label="Interest Coverage" value={isNaN(company.interestCoverage) ? '—' : `${company.interestCoverage.toFixed(1)}x`} history={(company.historicalFundamentals || []).map(f => f.interestCoverage ?? 0)} />
            <div className="pt-2 border-t border-[var(--border-hairline)]">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold mb-1">Debt Tranches</div>
              {(company.debtTranches || []).map(t => {
                const isFixed = t.rateType === 'FIXED';
                const remainingTenorYears = Math.max(0.01, (t.maturityWeek - state.currentWeek) / 52);
                const totalCorpBondPrincipalOutstanding = state.companies.filter(c => c.region === company.region).reduce((s, c) => s + c.totalDebt, 0) * 1_000_000;
                const impliedBankDemandUSD = reg.corpBondOwnership.bankShare * reg.bankingSector.bankEquityUSD;
                const impliedInstitutionalDemandUSD = reg.corpBondOwnership.institutionalShare * reg.institutionalSector.sectorEquityUSD;
                const demandToSupplyRatio = totalCorpBondPrincipalOutstanding > 0 ? (impliedBankDemandUSD + impliedInstitutionalDemandUSD) / totalCorpBondPrincipalOutstanding : 1.0;
                const corpBondPremium = Math.max(-0.15, Math.min(0.15, (demandToSupplyRatio - 1.0) * 0.3));
                const adjustedOasSpreadBps = company.oasSpreadBps * (1 - corpBondPremium);
                const pricing = isFixed
                  ? priceCorporateBond(remainingTenorYears, t.couponRate ?? 0.05, reg.yieldCurveParams, adjustedOasSpreadBps, company.isDefaulted, company.recoveryRate)
                  : priceLeveragedLoan(t.floatingMarginBps ?? 200, adjustedOasSpreadBps, remainingTenorYears, company.isDefaulted, company.recoveryRate);
                const price = isFixed ? (pricing as any).price : (pricing as any).pricePar;
                const bondName = formatBondName(company.ticker, t.couponRate, t.maturityWeek, state.currentWeek, t.rateType);
                return (
                  <div key={t.id} onClick={() => onOpenTrade({
                    assetType: isFixed ? 'CORP_BOND' : 'LEV_LOAN', id: t.id, symbol: t.id,
                    name: bondName,
                    region: company.region, price, quoteUnit: isFixed ? '% Par' : 'pts of par',
                    details: { trancheId: t.id, tenorYears: remainingTenorYears, fixedRate: t.couponRate ?? 0, rateType: t.rateType, oasSpreadBps: company.oasSpreadBps, rating: company.creditRating, sector: company.sector },
                  })} className="flex justify-between items-center p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)] mb-1 cursor-pointer hover:border-[var(--text-tertiary)] transition-colors">
                    <span className="text-[11px]">{bondName}</span>
                    <span className="text-[11px] font-[var(--font-numeric)] font-bold">{isNaN(price) ? '—' : price.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs py-2 border-t border-[var(--border-hairline)]">
              <span className="text-[var(--text-secondary)]">Bond-implied spread (OAS)</span>
              <span className="font-bold">{isNaN(company.oasSpreadBps) ? '—' : `${company.oasSpreadBps.toFixed(0)}bps`}</span>
            </div>

            {/* PART ME: Debt Tranche & Corporate Ownership Breakdown */}
            <div className="pt-3 border-t border-[var(--border-hairline)] space-y-2">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Ownership Breakdown</div>
              {(() => {
                const cb = reg.corpBondOwnership;
                const foreignSum = (Object.values(cb.foreignShare) as number[]).reduce((a, b) => a + b, 0);
                const hhShare = Math.max(0, 1 - cb.bankShare - cb.institutionalShare - foreignSum);
                const bankPct = (cb.bankShare * 100).toFixed(0);
                const instPct = (cb.institutionalShare * 100).toFixed(0);
                const hhPct = (hhShare * 100).toFixed(0);
                const forPct = (foreignSum * 100).toFixed(0);

                const trancheIds = new Set((company.debtTranches || []).map(t => t.id));
                const bankHoldings = (reg.bankingSector.itemizedHoldings || [])
                  .filter(h => h.instrumentId === company.id || trancheIds.has(h.instrumentId))
                  .map(h => ({ id: h.instrumentId + '-bank', holderName: h.instrumentId === company.id ? 'Banking Sector (Equity)' : 'Banking Sector (Debt)', amountUSD: h.quantityOrNotionalUSD }));
                const instHoldings = (reg.institutionalSector.itemizedHoldings || [])
                  .filter(h => h.instrumentId === company.id || trancheIds.has(h.instrumentId))
                  .map(h => ({ id: h.instrumentId + '-inst', holderName: h.instrumentId === company.id ? 'Institutional Sector (Equity)' : 'Institutional Sector (Debt)', amountUSD: h.quantityOrNotionalUSD }));
                const companyHoldings = [...bankHoldings, ...instHoldings];

                return (
                  <>
                    <div className="h-2 rounded overflow-hidden flex bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                      <div style={{ width: `${cb.bankShare * 100}%` }} className="bg-blue-500" title={`Bank: ${bankPct}%`} />
                      <div style={{ width: `${cb.institutionalShare * 100}%` }} className="bg-purple-500" title={`Institutional: ${instPct}%`} />
                      <div style={{ width: `${hhShare * 100}%` }} className="bg-emerald-500" title={`Household: ${hhPct}%`} />
                      <div style={{ width: `${foreignSum * 100}%` }} className="bg-amber-500" title={`Foreign: ${forPct}%`} />
                    </div>
                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] font-mono">
                      <span className="text-blue-400">Bank {bankPct}%</span>
                      <span className="text-purple-400">Inst {instPct}%</span>
                      <span className="text-emerald-400">Household {hhPct}%</span>
                      <span className="text-amber-400">Foreign {forPct}%</span>
                    </div>

                    {companyHoldings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase">Itemized Asset Holders</div>
                        {companyHoldings.slice(0, 5).map(h => (
                          <div key={h.id} className="flex justify-between text-[11px] py-0.5 border-b border-[var(--border-hairline)]">
                            <span className="text-[var(--text-secondary)]">{h.holderName}</span>
                            <span className="font-[var(--font-numeric)] font-bold">{formatCurrency(h.amountUSD, { compact: true })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </>
        )}

        {tab === 'management' && (
          <>
            <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-secondary)]">Execution Quality</span>
              <span className="font-bold font-[var(--font-numeric)]">{isNaN(company.executionQuality) ? '—' : company.executionQuality.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-secondary)]">Dividend Yield</span>
              <span className="font-bold">{formatPercent(company.dividendYield, { isDecimal: true })}</span>
            </div>
            {(state.recentMergers || []).filter(m => m.acquirerTicker === company.ticker || m.targetTicker === company.ticker).map((m, i) => (
              <div key={i} className="text-[11px] text-[var(--text-secondary)] p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                {m.acquirerTicker === company.ticker ? `Acquired ${m.targetTicker}` : `Acquired by ${m.acquirerTicker}`} in week {m.week}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
