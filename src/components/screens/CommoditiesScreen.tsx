import React from 'react';
import { GameState, Commodity } from '../../types';

export const CommoditiesScreen: React.FC<{ state: GameState, onOpenTrade: (i: any) => void }> = ({ state, onOpenTrade }) => {
  const commodities = Object.values(state.commodities || {}).map((c: Commodity) => ({
    id: c.id,
    name: c.name,
    ticker: c.id,
    region: 'Global',
    price: c.spotPrice,
    change: c.spotPrice - (c.historicalPrices[0] || c.spotPrice),
    type: 'commodity',
    obj: c
  }));

  return (
    <div className="p-3 space-y-2 pb-20">
      {commodities.map(a => (
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
  );
};
