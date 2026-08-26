import React, { useState } from 'react';
import { GameState, ProductCategory } from '../../types';
import { formatCurrency, formatPercent } from '../../engine/formatters';

export const MyBookScreen: React.FC<{ state: GameState, prevState?: GameState | null, onNavigate?: (dest: any, payload?: any) => void }> = ({ state }) => {
  const portfolio = state.portfolio;
  const nav = portfolio.navUSD;

  const initialCapital = 25000000;
  const returnPct = (nav - initialCapital) / initialCapital;

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('ConsumerStaples');
  const categories: ProductCategory[] = [
    'Energy', 'MaterialsChemicals', 'IndustrialsMachinery', 'AerospaceDefense',
    'AutomotiveTransport', 'TechHardwareSemis', 'SoftwareDigitalServices',
    'Telecommunications', 'HealthcarePharma', 'ConsumerStaples',
    'ConsumerDiscretionaryRetail', 'LuxuryGoods', 'MediaEntertainment',
    'RealEstateConstruction'
  ];

  const sortedPositions = [...portfolio.positions].sort((a, b) => {
    const valA = a.notional || (a.currentPrice * a.quantity);
    const costA = a.entryPrice * a.quantity;
    const pnlA = Math.abs(valA - costA);

    const valB = b.notional || (b.currentPrice * b.quantity);
    const costB = b.entryPrice * b.quantity;
    const pnlB = Math.abs(valB - costB);

    return pnlB - pnlA;
  });

  const companiesInCategory = state.companies.filter(c => !c.isDefaulted && c.productLines?.some(l => l.industry === selectedCategory));
  const sortedByCategoryShare = [...companiesInCategory].sort((a, b) => {
    const shareA = (a.productLines || []).find(l => l.industry === selectedCategory)?.categoryMarketShare ?? 0;
    const shareB = (b.productLines || []).find(l => l.industry === selectedCategory)?.categoryMarketShare ?? 0;
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
        <div className="flex justify-between items-center">
          <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Active Positions ({portfolio.positions.length})</h3>
          <span className="text-[10px] text-[var(--text-tertiary)]">Sorted by P&L Swing</span>
        </div>

        {portfolio.positions.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--text-tertiary)] border border-dashed border-[var(--border-hairline)] rounded-xl">
            No active positions. Open trades from the Market screen.
          </div>
        ) : (
          <div className="space-y-2">
            {sortedPositions.map(p => {
              const currentVal = p.notional || (p.currentPrice * p.quantity);
              const costBasis = p.entryPrice * p.quantity;
              const pnl = currentVal - costBasis;
              const pnlPct = costBasis !== 0 ? pnl / costBasis : 0;

              const getAttributionLabel = () => {
                if (p.assetType === 'EQUITY') return `Equity Move: ${formatCurrency(pnl, { compact: true, showSign: true })}`;
                if (p.assetType === 'FX_SPOT') return `FX Spot Drift: ${formatCurrency(pnl, { compact: true, showSign: true })}`;
                if (p.assetType === 'COMMODITY') return `Commodity Spot Move: ${formatCurrency(pnl, { compact: true, showSign: true })}`;
                if (p.assetType === 'SOV_BOND' || p.assetType === 'IRS') return `Yield Curve Delta: ${formatCurrency(pnl, { compact: true, showSign: true })}`;
                if (p.assetType === 'CDS') return `Credit Default Spread Delta: ${formatCurrency(pnl, { compact: true, showSign: true })}`;
                if ((p.assetType === 'CORP_BOND' || (p.assetType as string) === 'LEVERAGED_LOAN' || (p.assetType as string) === 'LEV_LOAN') && p.entryOasSpreadBps !== undefined) {
                  const currentCompany = state.companies.find(c => c.debtTranches?.some(t => t.id === p.trancheId));
                  const currentOas = currentCompany?.oasSpreadBps ?? p.entryOasSpreadBps;
                  const spreadDiffBps = p.entryOasSpreadBps - currentOas;
                  const approxSpreadPnL = (spreadDiffBps / 10000) * currentVal * (p.tenorYears || 5);
                  const ratePnL = pnl - approxSpreadPnL;
                  return `Rate Component: ${formatCurrency(ratePnL, { compact: true, showSign: true })} · Spread Component: ${formatCurrency(approxSpreadPnL, { compact: true, showSign: true })}`;
                }
                return `MTM PnL Attribution: ${formatCurrency(pnl, { compact: true, showSign: true })}`;
              };

              return (
                <div key={p.id} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-1.5 hover:border-[var(--text-tertiary)] transition-colors">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{p.symbol}</span>
                        {Math.abs(pnl) > 50000 && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[var(--signal-neutral)]/20 text-[var(--signal-neutral)]">TOP MOVER</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{p.assetType} • {p.direction}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)] font-bold">
                        {formatCurrency(currentVal, { compact: true, precision: 1 })}
                      </div>
                      <div className={`text-[10px] font-bold ${pnl > 0 ? 'text-[var(--signal-positive)]' : pnl < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                        {formatCurrency(pnl, { compact: true, precision: 1, showSign: true })} ({formatPercent(pnlPct, { precision: 2, showSign: true })})
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-hairline)] font-mono">
                    {getAttributionLabel()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Category Market Share Leaderboards</h3>
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
                {cat.replace(/([A-Z])/g, ' $1').trim()}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            {sortedByCategoryShare.slice(0, 10).map((c) => {
              const line = (c.productLines || []).find(l => l.industry === selectedCategory)!;
              return (
                <div key={c.ticker} className="flex items-center justify-between p-2 border-b border-[var(--border-hairline)] last:border-0 text-[11px]">
                  <span className="font-bold text-[var(--text-primary)]">{c.ticker}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-secondary)] font-mono">{formatPercent(line.categoryMarketShare, { precision: 1 })}</span>
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
            <h4 className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase">Top Earnings Surprises</h4>
            {biggestSurprises.map(c => (
              <div key={c.ticker} className="flex justify-between items-center text-[11px] border-b border-[var(--border-hairline)] last:border-0 pb-1 last:pb-0 font-mono">
                <span className="font-bold text-[var(--text-primary)]">{c.ticker}</span>
                <span className={(c.lastEarningsSurprisePct || 0) >= 0 ? 'text-[var(--signal-positive)] font-bold' : 'text-[var(--signal-negative)] font-bold'}>
                  {formatPercent(c.lastEarningsSurprisePct, { precision: 2, showSign: true })}
                </span>
              </div>
            ))}
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
            <h4 className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase">Top Share Movers (13W)</h4>
            {biggestShareMovers.map(c => {
              const line = (c.productLines || []).reduce((max, l) => Math.abs(l.categoryMarketShare - (l.categoryMarketShare13WeeksAgo ?? l.categoryMarketShare)) > Math.abs(max.categoryMarketShare - (max.categoryMarketShare13WeeksAgo ?? max.categoryMarketShare)) ? l : max, (c.productLines || [])[0]);
              const move = line.categoryMarketShare - (line.categoryMarketShare13WeeksAgo ?? line.categoryMarketShare);
              return (
                <div key={c.ticker} className="flex justify-between items-center text-[11px] border-b border-[var(--border-hairline)] last:border-0 pb-1 last:pb-0 font-mono">
                  <span className="font-bold text-[var(--text-primary)]">{c.ticker}</span>
                  <span className={move >= 0 ? 'text-[var(--signal-positive)] font-bold' : 'text-[var(--signal-negative)] font-bold'}>
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
