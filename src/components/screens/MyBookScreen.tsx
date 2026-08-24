import React, { useState } from 'react';
import { GameState, ProductCategory } from '../../types';
import { formatCurrency, formatPercent } from '../../engine/formatters';

export const MyBookScreen: React.FC<{ state: GameState, prevState?: GameState | null, onNavigate?: (dest: any, payload?: any) => void }> = ({ state, onNavigate }) => {
  const portfolio = state.portfolio;
  const nav = portfolio.cashUSD + portfolio.positions.reduce((sum, p) => sum + (p.notional || (p.currentPrice * p.quantity)), 0);
  const initialCapital = 25000000;
  const returnPct = (nav - initialCapital) / initialCapital;

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('StapleHousehold');
  const categories: ProductCategory[] = [
    'StapleHousehold', 'StandardHousehold', 'LuxuryHousehold',
    'GovernmentDefense', 'GovernmentInfrastructure', 'GovernmentHealthcare',
    'CorporateIndustrial', 'CorporateTech'
  ];

  const companiesInCategory = state.companies.filter(c => !c.isDefaulted && c.productLines?.some(l => l.category === selectedCategory));
  const sortedByCategoryShare = [...companiesInCategory].sort((a, b) => {
    const shareA = (a.productLines || []).find(l => l.category === selectedCategory)?.categoryMarketShare ?? 0;
    const shareB = (b.productLines || []).find(l => l.category === selectedCategory)?.categoryMarketShare ?? 0;
    return shareB - shareA;
  });

  const biggestSurprises = [...state.companies]
    .filter(c => !c.isDefaulted && c.lastEarningsSurprisePct !== undefined)
    .sort((a, b) => Math.abs(b.lastEarningsSurprisePct || 0) - Math.abs(a.lastEarningsSurprisePct || 0))
    .slice(0, 5);

  const biggestShareMovers = [...state.companies]
    .filter(c => !c.isDefaulted && c.productLines && c.productLines.length > 0)
    .sort((a, b) => {
      const aMaxShareMove = Math.max(...(a.productLines || []).map(l => Math.abs(l.categoryMarketShare - (l.categoryMarketShare13WeeksAgo ?? l.categoryMarketShare))));
      const bMaxShareMove = Math.max(...(b.productLines || []).map(l => Math.abs(l.categoryMarketShare - (l.categoryMarketShare13WeeksAgo ?? l.categoryMarketShare))));
      return bMaxShareMove - aMaxShareMove;
    })
    .slice(0, 5);

  return (
    <div className="p-3 space-y-6 pb-20">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">My Book</h2>
        <div className="flex items-end gap-3">
          <span className="text-2xl font-[var(--font-numeric)] text-[var(--text-primary)] font-bold">
            {formatCurrency(nav, { compact: true, precision: 2 })}
          </span>
          <span className={`text-sm font-[var(--font-numeric)] font-bold pb-1 ${returnPct > 0 ? 'text-[var(--signal-positive)]' : returnPct < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
            {formatPercent(returnPct, { precision: 2, showSign: true })}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Active Positions ({portfolio.positions.length})</h3>
        {portfolio.positions.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--text-tertiary)] border border-dashed border-[var(--border-hairline)] rounded-xl">
            No active positions. Open trades from the Market screen.
          </div>
        ) : (
          <div className="space-y-2">
            {portfolio.positions.map(p => {
              const currentVal = p.notional || (p.currentPrice * p.quantity);
              const costBasis = p.entryPrice * p.quantity;
              const pnl = currentVal - costBasis;
              const pnlPct = costBasis !== 0 ? pnl / costBasis : 0;
              return (
                <div key={p.id} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex justify-between items-center">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{p.symbol}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">{p.assetType} • {p.direction}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)]">
                      {formatCurrency(currentVal, { compact: true, precision: 1 })}
                    </div>
                    <div className={`text-[10px] font-bold ${pnl > 0 ? 'text-[var(--signal-positive)]' : pnl < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                      {formatCurrency(pnl, { compact: true, precision: 1, showSign: true })} ({formatPercent(pnlPct, { precision: 2, showSign: true })})
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Category Leaderboards</h3>
        <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
          <div className="flex flex-wrap gap-1 mb-3">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-1 text-[9px] font-bold rounded transition-all ${
                  selectedCategory === cat ? 'bg-[var(--text-primary)] text-[var(--bg-void)]' : 'bg-[var(--bg-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {cat.replace('Household', ' HH').replace('Government', 'Gov ')}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            {sortedByCategoryShare.slice(0, 10).map((c) => {
              const line = (c.productLines || []).find(l => l.category === selectedCategory)!;
              return (
                <div key={c.ticker} className="flex items-center justify-between p-2 border-b border-[var(--border-hairline)] last:border-0 text-[11px]">
                  <span className="font-bold text-[var(--text-primary)]">{c.ticker}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-secondary)]">{formatPercent(line.categoryMarketShare, { precision: 1 })}</span>
                    <span className={`text-[9px] font-bold ${line.competitiveness > 0 ? 'text-[var(--signal-positive)]' : 'text-[var(--signal-negative)]'}`}>
                      {line.competitiveness > 0 ? '▲' : '▼'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Market Movers</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
            <h4 className="text-[10px] text-[var(--text-tertiary)] font-bold">Top Earnings Surprises</h4>
            {biggestSurprises.map(c => (
              <div key={c.ticker} className="flex justify-between items-center text-[11px] border-b border-[var(--border-hairline)] last:border-0 pb-1 last:pb-0">
                <span className="font-bold text-[var(--text-primary)]">{c.ticker}</span>
                <span className={(c.lastEarningsSurprisePct || 0) >= 0 ? 'text-[var(--signal-positive)]' : 'text-[var(--signal-negative)]'}>
                  {formatPercent(c.lastEarningsSurprisePct, { precision: 2, showSign: true })}
                </span>
              </div>
            ))}
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
            <h4 className="text-[10px] text-[var(--text-tertiary)] font-bold">Top Share Movers (13W)</h4>
            {biggestShareMovers.map(c => {
              const line = (c.productLines || []).reduce((max, l) => Math.abs(l.categoryMarketShare - (l.categoryMarketShare13WeeksAgo ?? l.categoryMarketShare)) > Math.abs(max.categoryMarketShare - (max.categoryMarketShare13WeeksAgo ?? max.categoryMarketShare)) ? l : max, (c.productLines || [])[0]);
              const move = line.categoryMarketShare - (line.categoryMarketShare13WeeksAgo ?? line.categoryMarketShare);
              return (
                <div key={c.ticker} className="flex justify-between items-center text-[11px] border-b border-[var(--border-hairline)] last:border-0 pb-1 last:pb-0">
                  <span className="font-bold text-[var(--text-primary)]">{c.ticker}</span>
                  <span className={move >= 0 ? 'text-[var(--signal-positive)]' : 'text-[var(--signal-negative)]'}>
                    {formatPercent(move, { precision: 1, showSign: true })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
