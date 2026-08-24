import React, { useState } from 'react';
import { GameState, Company } from '../../types';
import { formatCurrency, formatPercent } from '../../engine/formatters';
import { TapToChart } from '../shared/TapToChart';
import { priceCorporateBond, priceLeveragedLoan } from '../../engine/pricing';

type DeepDiveTab = 'performance' | 'financials' | 'exposure' | 'supplychain' | 'credit' | 'management';

export const CompanyDeepDive: React.FC<{ company: Company; state: GameState; onOpenTrade: (i: any) => void }> = ({ company, state, onOpenTrade }) => {
  const [tab, setTab] = useState<DeepDiveTab>('performance');
  const reg = state.regions[company.region];

  const generateStatusLine = (c: Company): string => {
    const parts: string[] = [];
    const primaryLine = c.productLines?.[0];
    if (primaryLine) {
      if (primaryLine.competitiveness > 0.1) parts.push(`Gaining share in ${primaryLine.category}`);
      else if (primaryLine.competitiveness < -0.1) parts.push(`Losing share in ${primaryLine.category}`);
      const catDemand = reg.categoryDemand[primaryLine.category as any] as any;
      if (catDemand?.crowdingIntensity > 0.5) parts.push('facing heavy competitive crowding');
    }
    if (c.executionQuality > 1.1) parts.push('execution trending strong');
    else if (c.executionQuality < 0.9) parts.push('execution trending weak');
    if (c.maintenanceShortfallStreak > 5) parts.push('deferred maintenance risk building');
    return parts.length > 0 ? parts.join(', ') : 'No notable signals this week';
  };

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
            <TapToChart label="Stock Price" value={formatCurrency(company.stockPrice, { compact: false })} history={company.historicalPrices} />
            <TapToChart label="EPS (quarterly)" value={formatCurrency(company.eps, { compact: false })} history={(company.historicalFundamentals || []).map(f => f.eps ?? 0)} />
            <TapToChart label="Revenue (quarterly)" value={formatCurrency(company.annualRevenue / 4, { compact: true })} history={(company.historicalFundamentals || []).map(f => (f.annualRevenue ?? 0) / 4)} />
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
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Income Statement (Annualized)</div>
            {[
              ['Revenue', company.annualRevenue],
              ['EBITDA', company.ebitda],
              ['EBIT', company.ebit],
              ['Net Income', company.netIncome],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                <span className="text-[var(--text-secondary)]">{label}</span>
                <span className="font-[var(--font-numeric)] font-bold">{formatCurrency(val as number, { compact: true })}</span>
              </div>
            ))}
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold pt-3">Balance Sheet</div>
            {[
              ['Cash', company.cash],
              ['Finished Goods Inventory', company.finishedGoodsInventoryUSD ?? 0],
              ['Total Debt', company.totalDebt],
              ['Maintenance CapEx', company.maintenanceCapex ?? 0],
              ['Growth CapEx', company.growthCapex ?? 0],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between text-xs py-1 border-b border-[var(--border-hairline)]">
                <span className="text-[var(--text-secondary)]">{label}</span>
                <span className="font-[var(--font-numeric)] font-bold">{formatCurrency(val as number, { compact: true })}</span>
              </div>
            ))}
          </>
        )}

        {tab === 'exposure' && (
          <>
            {(company.productLines || []).map(line => {
              const catDemand = reg.categoryDemand[line.category as any] as any;
              return (
                <div key={line.category} className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold">{line.category}</span>
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
                const pricing = isFixed
                  ? priceCorporateBond(remainingTenorYears, t.couponRate ?? 0.05, reg.yieldCurveParams, company.oasSpreadBps, company.isDefaulted, company.recoveryRate)
                  : priceLeveragedLoan(t.floatingMarginBps ?? 200, company.oasSpreadBps, remainingTenorYears, company.isDefaulted, company.recoveryRate);
                const price = isFixed ? (pricing as any).price : (pricing as any).pricePar;
                return (
                  <div key={t.id} onClick={() => onOpenTrade({
                    assetType: isFixed ? 'CORP_BOND' : 'LEV_LOAN', id: t.id, symbol: t.id,
                    name: `${company.name} ${isNaN(remainingTenorYears) ? '0' : remainingTenorYears.toFixed(1)}Y ${isFixed ? 'Bond' : 'Loan'}`,
                    region: company.region, price, quoteUnit: isFixed ? '% Par' : 'pts of par',
                    details: { trancheId: t.id, tenorYears: remainingTenorYears, fixedRate: t.couponRate ?? 0, rateType: t.rateType, oasSpreadBps: company.oasSpreadBps, rating: company.creditRating, sector: company.sector },
                  })} className="flex justify-between items-center p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)] mb-1 cursor-pointer hover:border-[var(--text-tertiary)] transition-colors">
                    <span className="text-[11px]">{isNaN(remainingTenorYears) ? '0' : remainingTenorYears.toFixed(1)}Y {isFixed ? `${((t.couponRate ?? 0) * 100).toFixed(1)}% Fixed` : `+${t.floatingMarginBps}bps Float`}</span>
                    <span className="text-[11px] font-[var(--font-numeric)] font-bold">{isNaN(price) ? '—' : price.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs py-2 border-t border-[var(--border-hairline)]">
              <span className="text-[var(--text-secondary)]">Bond-implied spread (OAS)</span>
              <span className="font-bold">{isNaN(company.oasSpreadBps) ? '—' : `${company.oasSpreadBps.toFixed(0)}bps`}</span>
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
