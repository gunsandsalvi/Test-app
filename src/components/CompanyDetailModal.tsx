import React, { useState } from 'react';
import { CapitalStructureBar } from './charts/Charts';
import {
  History,
  X,
} from 'lucide-react';
import { Company, CreditRating, GameState } from '../types';
import { priceCorporateBond, priceLeveragedLoan } from '../engine/pricing';
import {
  formatBps,
  formatCurrency,
  formatMultiple,
  formatPercent,
  formatStockPrice,
} from '../engine/formatters';
import { WhyDrilldown } from './shared/WhyDrilldown';
import { TapToChart } from './shared/TapToChart';

interface CompanyDetailModalProps {
  company: Company;
  currentWeek: number;
  state?: GameState;
  onClose: () => void;
  onOpenTrade: (instrument: any) => void;
}

export const CompanyDetailModal: React.FC<CompanyDetailModalProps> = ({
  company,
  currentWeek,
  state,
  onClose,
  onOpenTrade,
}) => {
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'CAPITAL_STRUCTURE' | 'HISTORY_STATEMENTS'
  >('OVERVIEW');

  const getRatingBadgeColor = (rating: CreditRating) => {
    switch (rating) {
      case 'AAA':
      case 'AA':
        return 'bg-[var(--signal-positive)]/20 text-[var(--signal-positive)] border-[var(--signal-positive)]/40';
      case 'A':
      case 'BBB':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'BB':
      case 'B':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'CCC':
      case 'D':
        return 'bg-[var(--signal-negative)]/20 text-[var(--signal-negative)] border-[var(--signal-negative)]/40';
    }
  };

  const fundamentals = company.historicalFundamentals || [];
  
  // Real decomposition calculations
  const grossMargin = company.annualRevenue > 0 ? (company.annualRevenue - (company.annualRevenue * 0.48)) / company.annualRevenue : 0; // Simulated cogs
  const ebitdaMargin = company.annualRevenue > 0 ? company.ebitda / company.annualRevenue : 0;
  const netMargin = company.annualRevenue > 0 ? company.netIncome / company.annualRevenue : 0;
  
  // Real signals
  const getSignal = (current: number, previous?: number): 'positive' | 'negative' | 'neutral' => {
    if (previous === undefined || previous === null) return 'neutral';
    if (current > previous * 1.001) return 'positive';
    if (current < previous * 0.999) return 'negative';
    return 'neutral';
  };

  const currentF = fundamentals[fundamentals.length - 1];
  const prevF = fundamentals.length > 1 ? fundamentals[fundamentals.length - 2] : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 animate-in fade-in">
      <div className="w-full max-w-lg bg-[var(--bg-panel)] border border-[var(--border-hairline)] rounded-2xl p-4 space-y-3.5 max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border-hairline)] pb-2.5">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-extrabold font-[var(--font-numeric)] text-lg text-[var(--text-primary)]">{company.ticker}</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getRatingBadgeColor(
                  company.creditRating
                )}`}
              >
                Rating: {company.creditRating}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-tertiary)] font-[var(--font-numeric)]">
                {company.region}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                {company.sector}
              </span>
              {company.isDefaulted && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--signal-negative)]/20 text-[var(--signal-negative)] border border-[var(--signal-negative)]/50 font-bold animate-pulse">
                  DEFAULTED (D)
                </span>
              )}
            </div>
            <div className="text-sm font-semibold text-[var(--text-secondary)] mt-0.5">{company.name}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--bg-elevated)] rounded-full text-[var(--text-tertiary)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-[var(--bg-elevated)] p-1 rounded-lg">
          {(['OVERVIEW', 'CAPITAL_STRUCTURE', 'HISTORY_STATEMENTS'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-[10px] font-bold py-1.5 rounded transition-colors ${
                activeTab === tab
                  ? 'bg-[var(--bg-panel)] text-[var(--text-primary)] shadow'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-4">
            <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs text-[var(--text-secondary)]">Stock Price</div>
                <div className="text-2xl font-bold text-[var(--text-primary)] font-[var(--font-numeric)]">
                  {formatStockPrice(company.stockPrice)}
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenTrade({
                    assetType: 'EQUITY',
                    id: company.id, symbol: company.ticker, name: company.name, region: company.region,
                    price: company.stockPrice, quoteUnit: 'USD',
                    details: { sector: company.sector, marketCap: company.marketCap, ebitda: company.ebitda }
                  });
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-xs transition-colors"
                disabled={company.isDefaulted}
              >
                Trade Equity
              </button>
            </div>

            <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Fundamentals</h3>
            <div className="grid gap-3">
              <WhyDrilldown
                headline="EBITDA Margin"
                value={formatPercent(ebitdaMargin)}
                signal={getSignal(ebitdaMargin, prevF?.ebitda / prevF?.annualRevenue)}
                contributors={[
                  { label: 'Revenue', value: formatCurrency(company.annualRevenue, { compact: true }), signal: getSignal(company.annualRevenue, prevF?.annualRevenue) },
                  { label: 'Cost of Goods', value: formatCurrency(company.annualRevenue * 0.48, { compact: true }), signal: 'neutral' },
                  { label: 'Opex', value: formatCurrency((company.annualRevenue * 0.52) - company.ebitda, { compact: true }), signal: 'neutral' }
                ]}
              />

              <WhyDrilldown
                headline="Net Income"
                value={formatCurrency(company.netIncome, { compact: true })}
                signal={getSignal(company.netIncome, prevF?.netIncome)}
                contributors={[
                  { label: 'EBITDA', value: formatCurrency(company.ebitda, { compact: true }), signal: getSignal(company.ebitda, prevF?.ebitda) },
                  { label: 'Interest Expense', value: formatCurrency(company.totalDebt * (company.seniorBondYield || 0.05), { compact: true }), signal: 'neutral' },
                  { label: 'Depreciation (D&A)', value: formatCurrency(company.capex * 0.8, { compact: true }), signal: 'neutral' }
                ]}
              />
            </div>
            
            <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Market Data</h3>
            <div className="grid grid-cols-2 gap-2">
               <div className="p-2 border border-[var(--border-hairline)] rounded-xl bg-[var(--bg-elevated)]">
                  <TapToChart
                     label="Market Cap"
                     value={<span className="text-xs font-bold text-[var(--text-primary)] font-[var(--font-numeric)]">{formatCurrency(company.marketCap, { compact: true })}</span>}
                     history={company.historicalPrices?.map(p => p * (company.marketCap / company.stockPrice))}
                  />
               </div>
               <div className="p-2 border border-[var(--border-hairline)] rounded-xl bg-[var(--bg-elevated)]">
                  <TapToChart
                     label="EV"
                     value={<span className="text-xs font-bold text-[var(--text-primary)] font-[var(--font-numeric)]">{formatCurrency(company.marketCap + company.totalDebt, { compact: true })}</span>}
                     history={undefined} /* FIXME: Gap */
                  />
               </div>
               <div className="p-2 border border-[var(--border-hairline)] rounded-xl bg-[var(--bg-elevated)]">
                  <TapToChart
                     label="P/E Ratio"
                     value={<span className="text-xs font-bold text-[var(--text-primary)] font-[var(--font-numeric)]">{formatMultiple(company.marketCap / Math.max(1, company.netIncome))}</span>}
                     history={undefined} /* FIXME: Gap */
                  />
               </div>
               <div className="p-2 border border-[var(--border-hairline)] rounded-xl bg-[var(--bg-elevated)]">
                  <TapToChart
                     label="Leverage (Debt/EBITDA)"
                     value={<span className="text-xs font-bold text-[var(--text-primary)] font-[var(--font-numeric)]">{formatMultiple(company.totalDebt / Math.max(1, company.ebitda))}</span>}
                     history={fundamentals.map(f => f.leverage)}
                  />
               </div>
            </div>
          </div>
        )}

        {/* CAPITAL STRUCTURE TAB */}
        {activeTab === 'CAPITAL_STRUCTURE' && (
          <div className="space-y-4">
            <CapitalStructureBar tranches={company.debtTranches} currentWeek={currentWeek} />
            <div className="space-y-2">
               {company.debtTranches.map(tranche => {
                 const isFixed = tranche.rateType === 'FIXED';
                 const remainingTenorYears = Math.max(0.1, (tranche.maturityWeek - currentWeek) / 52);
                 const rateDesc = isFixed
                   ? `${formatPercent(tranche.couponRate ?? 0, { precision: 2 })} Fixed`
                   : `L+${tranche.floatingMarginBps}bps Float`;

                 let livePrice = 100;
                 if (state) {
                   if (isFixed) {
                     const sovParams = state.regions[company.region].yieldCurveParams;
                     livePrice = priceCorporateBond(
                       remainingTenorYears,
                       tranche.couponRate ?? 0.05,
                       sovParams,
                       company.oasSpreadBps,
                       company.isDefaulted,
                       company.recoveryRate
                     ).price;
                   } else {
                     livePrice = priceLeveragedLoan(
                       tranche.floatingMarginBps ?? 200,
                       company.oasSpreadBps,
                       remainingTenorYears,
                       company.isDefaulted,
                       company.recoveryRate
                     ).pricePar;
                   }
                 }

                 return (
                   <div
                     key={tranche.id}
                     onClick={() => {
                       onClose();
                       onOpenTrade({
                         assetType: isFixed ? 'CORP_BOND' : 'LEVERAGED_LOAN',
                         id: tranche.id, symbol: tranche.id,
                         name: `${company.name} ${remainingTenorYears.toFixed(1)}Y ${isFixed ? 'Senior Bond' : 'Loan'}`,
                         region: company.region,
                         price: livePrice,
                         quoteUnit: isFixed ? '% Par' : 'pts of par',
                         details: { trancheId: tranche.id, tenorYears: remainingTenorYears, fixedRate: tranche.couponRate ?? 0, rateType: tranche.rateType, oasSpreadBps: company.oasSpreadBps, rating: company.creditRating, sector: company.sector },
                       });
                     }}
                     className="p-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)] border border-[var(--border-hairline)] rounded-xl cursor-pointer transition-all flex items-center justify-between"
                   >
                     <div>
                       <span className="font-bold text-xs text-[var(--text-primary)]">{remainingTenorYears.toFixed(1)}Y {rateDesc}</span>
                       <div className="text-[10px] text-[var(--text-tertiary)] font-[var(--font-numeric)]">due wk {tranche.maturityWeek}</div>
                     </div>
                     <div className="text-right">
                       <span className={`text-xs font-bold font-[var(--font-numeric)] ${isFixed ? 'text-indigo-400' : 'text-amber-400'}`}>Trade {isFixed ? 'Bond' : 'Loan'}</span>
                     </div>
                   </div>
                 );
               })}
               
               <div
                 onClick={() => {
                   onClose();
                   onOpenTrade({
                     assetType: 'CDS',
                     id: `${company.id}_CDS`,
                     symbol: `${company.ticker}-CDS`,
                     name: `${company.name} 5Y Senior CDS`,
                     region: company.region,
                     price: company.cdsSpreadBps,
                     quoteUnit: 'bps/yr',
                     details: {
                       sector: company.sector,
                       rating: company.creditRating,
                       tenorYears: 5,
                       cdsSpreadBps: company.cdsSpreadBps,
                     },
                   });
                 }}
                 className="p-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-highlight)] border border-[var(--border-hairline)] rounded-xl cursor-pointer transition-all flex items-center justify-between"
               >
                 <div>
                   <div className="flex items-center gap-1.5">
                     <span className="font-bold text-xs text-[var(--text-primary)]">5Y Credit Default Swap (CDS)</span>
                     <span className="text-[9px] px-1.5 rounded bg-[var(--signal-negative)]/20 text-[var(--signal-negative)] font-[var(--font-numeric)]">
                       {formatBps(company.cdsSpreadBps)}
                     </span>
                   </div>
                   <div className="text-[10px] text-[var(--text-tertiary)]">Buy / Sell Default Protection</div>
                 </div>
                 <div className="text-right">
                   <span className="text-xs font-bold font-[var(--font-numeric)] text-[var(--signal-negative)]">Trade CDS</span>
                 </div>
               </div>
            </div>
          </div>
        )}

        {/* HISTORY STATEMENTS TAB */}
        {activeTab === 'HISTORY_STATEMENTS' && (
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-1.5">
              <div className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Quarterly Financial Statement History
                </h4>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-[var(--font-numeric)]">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] text-[var(--text-secondary)] text-right">
                    <th className="text-left py-1 font-semibold">Metric</th>
                    {fundamentals.slice(-4).map((f, i) => (
                      <th key={i} className="py-1 font-semibold text-[var(--text-primary)]">
                        {f.filingPeriod || `Q${(i % 4) + 1} '25`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)] text-[var(--text-primary)]">
                  <tr className="hover:bg-[var(--bg-highlight)]">
                    <td className="py-1 text-[var(--text-secondary)] font-sans text-left">Revenue</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 font-bold">{formatCurrency(f.annualRevenue / 4, { compact: true })}</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-[var(--bg-highlight)]">
                    <td className="py-1 text-[var(--text-secondary)] font-sans text-left">EBITDA</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 text-[var(--signal-positive)]">{formatCurrency(f.ebitda / 4, { compact: true })}</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-[var(--bg-highlight)]">
                    <td className="py-1 text-[var(--text-secondary)] font-sans text-left">Net Income</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1">{formatCurrency(f.netIncome / 4, { compact: true })}</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-[var(--bg-highlight)]">
                    <td className="py-1 text-[var(--text-secondary)] font-sans text-left">Total Debt</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 text-amber-400">{formatCurrency(f.totalDebt, { compact: true })}</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-[var(--bg-highlight)]">
                    <td className="py-1 text-[var(--text-secondary)] font-sans text-left">Leverage</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 font-semibold">{f.leverage.toFixed(2)}x</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-[var(--bg-highlight)]">
                    <td className="py-1 text-[var(--text-secondary)] font-sans text-left">Coverage</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 text-[var(--signal-positive)]">{f.interestCoverage.toFixed(1)}x</td>
                    ))}
                  </tr>
                  <tr className="hover:bg-[var(--bg-highlight)]">
                    <td className="py-1 text-[var(--text-secondary)] font-sans text-left">Rating</td>
                    {fundamentals.slice(-4).map((f, i) => (
                      <td key={i} className="text-right py-1 font-bold">{f.creditRating}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
