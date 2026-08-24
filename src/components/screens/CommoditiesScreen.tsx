import React from 'react';
import { GameState, Commodity } from '../../types';
import { formatCurrency } from '../../engine/formatters';
import { TapToChart } from '../shared/TapToChart';

export const CommoditiesScreen: React.FC<{ state: GameState, onOpenTrade: (i: any) => void }> = ({ state, onOpenTrade }) => {
  const commodities = Object.entries(state.commodities || {}).map(([id, c]: [string, Commodity]) => ({
    id, name: c.name, unit: (c as any).unit ?? 'unit', region: (c as any).region ?? 'Global',
    price: c.spotPrice, history: c.historicalPrices,
    obj: {
      assetType: 'COMMODITY', id, symbol: id, name: c.name, region: (c as any).region ?? 'Global',
      price: c.spotPrice, quoteUnit: `USD per ${(c as any).unit ?? 'unit'}`,
      details: { commodityId: id },
    },
  }));
  return (
    <div className="p-3 space-y-2 pb-20">
      {commodities.map(a => (
        <div key={a.id} onClick={() => onOpenTrade(a.obj)} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform">
          <div className="flex items-center justify-between">
            <div><div className="text-xs font-bold text-[var(--text-primary)]">{a.name}</div><div className="text-[10px] text-[var(--text-tertiary)]">{a.region} · per {a.unit}</div></div>
            <TapToChart label="" value={formatCurrency(a.price, { compact: false })} history={a.history} />
          </div>
        </div>
      ))}
    </div>
  );
};
