import React, { useState, useMemo } from 'react';
import { GameState } from '../../types';

export const MarketScreen: React.FC<{ state: GameState, onOpenTrade: (i: any) => void }> = ({ state, onOpenTrade }) => {
  const [filter, setFilter] = useState<'equities' | 'bonds' | 'commodities'>('equities');

  const assets = useMemo(() => {
    if (filter === 'equities') {
      return state.companies
        .filter(c => !c.isDefaulted && c.stockPrice > 0)
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, 50)
        .map(c => ({
          id: c.id,
          name: c.name,
          ticker: c.ticker,
          region: c.region,
          price: c.stockPrice,
          change: c.stockPrice - (c.historicalPrices[0] || c.stockPrice),
          type: 'equity',
          obj: c
        }));
    }
    if (filter === 'bonds') {
      return state.companies
        .filter(c => !c.isDefaulted)
        .flatMap(c => (c.debtTranches || []).map(d => ({
          id: d.id,
          name: `${c.ticker} ${Math.round((d.maturityWeek - d.originationWeek) / 52)}Y`,
          ticker: d.id,
          region: c.region,
          price: 100, // simplify for UI
          change: 0,
          type: 'bond',
          obj: d
        }))).slice(0, 50);
    }
    if (filter === 'commodities') {
      return Object.values(state.commodities || {}).map(c => ({
        id: c.id,
        name: c.name,
        ticker: c.id,
        region: 'Global',
        price: c.spotPrice,
        change: c.spotPrice - (c.historicalPrices[0] || c.spotPrice),
        type: 'commodity',
        obj: c
      }));
    }
    return [];
  }, [state, filter]);

  return (
    <div className="p-3 space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Markets</h2>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {(['equities', 'bonds', 'commodities'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize whitespace-nowrap transition-colors ${
              filter === f 
                ? 'bg-[var(--text-primary)] text-[var(--bg-void)]' 
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {assets.map(a => (
          <div key={a.id} onClick={() => onOpenTrade(a.obj)} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform">
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)]">{a.ticker}</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">{a.name}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)]">
                {a.price > 10 ? a.price.toFixed(2) : a.price.toFixed(4)}
              </div>
              <div className={`text-[10px] font-bold ${a.change > 0 ? 'text-[var(--signal-positive)]' : a.change < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                {a.change > 0 ? '+' : ''}{a.change.toFixed(2)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
