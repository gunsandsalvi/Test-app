import React from 'react';
import { GameState, FxPair, Company } from '../../types';

export const FxScreen: React.FC<{ state: GameState, onOpenTrade: (i: any) => void, onNavigate: (dest: any, payload?: any) => void }> = ({ state, onOpenTrade, onNavigate }) => {
  const fxAssets = (state.fxPairs || []).map((fx: FxPair) => ({
    id: fx.pair,
    name: `${fx.pair} Spot`,
    ticker: fx.pair,
    region: fx.base,
    price: fx.rate,
    change: fx.rate - (fx.historicalRates[0] || fx.rate),
    type: 'fx',
    obj: fx
  }));

  const xcsAssets = (state.fxPairs || []).map((fx: FxPair) => {
    const basisBps = fx.basisSpreadBps || 0;
    return {
      id: `XCS_${fx.pair}`,
      name: `${fx.pair} 5Y Basis Swap`,
      ticker: `XCS ${fx.pair}`,
      region: fx.base,
      price: basisBps,
      change: 0,
      type: 'derivative',
      obj: {
        assetType: 'XCS',
        id: `XCS_${fx.pair}`,
        symbol: fx.pair,
        name: `${fx.pair} Cross-Currency Basis Swap`,
        region: fx.base,
        price: basisBps,
        quoteUnit: 'bps Basis',
        details: { tenorYears: 5 }
      }
    };
  });

  const assets = [...fxAssets, ...xcsAssets];

  return (
    <div className="p-3 space-y-4 pb-20">
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
      
      <div className="pt-4 border-t border-[var(--border-hairline)]">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">FX-Sensitive Corporates</h3>
        <p className="text-[10px] text-[var(--text-tertiary)] mb-3">Companies in export-heavy regions with meaningful currency exposure.</p>
        <div className="space-y-2">
          {state.companies
            .filter(c => {
               const r = state.regions[c.region];
               return (r.exportsUSD / Math.max(1, r.importsUSD)) > 1.05; // meaningful exports exposure
            })
            .slice(0, 10)
            .map(c => (
              <button 
                key={c.id} 
                onClick={() => onNavigate('market', { marketSub: 'corporates', companyTicker: c.ticker })}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--text-tertiary)] transition-colors text-left"
              >
                 <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{c.ticker}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">{c.name}</div>
                 </div>
                 <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[var(--signal-neutral)]/20 text-[var(--signal-neutral)]">FX-Sensitive</span>
                    <span className="text-[10px] text-[var(--text-tertiary)]">{c.region}</span>
                 </div>
              </button>
            ))
          }
        </div>
      </div>
    </div>
  );
};
