import React, { useState } from 'react';
import { GameState, FxPair, RegionId } from '../../types';
import { formatCurrency, formatPercent } from '../../engine/formatters';

type FxTab = 'pairs' | 'carry' | 'flows';

export const FxScreen: React.FC<{ state: GameState, onOpenTrade: (i: any) => void, onNavigate: (dest: any, payload?: any) => void }> = ({ state, onOpenTrade, onNavigate }) => {
  const [fxTab, setFxTab] = useState<FxTab>('pairs');

  return (
    <div className="p-3 space-y-4 pb-20">
      {/* Tab Selector */}
      <div className="flex overflow-x-auto no-scrollbar border-b border-[var(--border-hairline)] pb-1">
        {(['pairs', 'carry', 'flows'] as FxTab[]).map(t => (
          <button
            key={t}
            onClick={() => setFxTab(t)}
            className={`px-4 py-1.5 text-[11px] font-bold uppercase whitespace-nowrap transition-colors ${fxTab === t ? 'text-[var(--text-primary)] border-b-2 border-[var(--region-usa)]' : 'text-[var(--text-tertiary)]'}`}
          >
            {t === 'pairs' ? 'FX Pairs & XCS' : t === 'carry' ? 'Carry Trade' : 'Trade Flows & Corporates'}
          </button>
        ))}
      </div>

      {fxTab === 'pairs' && (
        <div className="space-y-3">
          {(state.fxPairs || []).map((fx: FxPair) => {
            const baseRate = state.regions[fx.base as RegionId]?.policyRate ?? 0;
            const quoteRate = state.regions[fx.quote as RegionId]?.policyRate ?? 0;
            const change1W = fx.rate - (fx.historicalRates?.[0] || fx.rate);
            const fxAssetObj = {
              assetType: 'FX_SPOT', id: fx.pair, symbol: fx.pair, name: `${fx.pair} Spot`,
              region: fx.base, price: fx.rate, quoteUnit: fx.pair,
              details: { base: fx.base, quote: fx.quote },
            };

            return (
              <div key={fx.pair} onClick={() => onOpenTrade(fxAssetObj)} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{fx.pair} Spot</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">{fx.base} / {fx.quote}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-[var(--font-numeric)] font-bold text-[var(--text-primary)]">
                      {fx.rate > 10 ? fx.rate.toFixed(2) : fx.rate.toFixed(4)}
                    </div>
                    <div className={`text-[10px] font-bold ${change1W > 0 ? 'text-[var(--signal-positive)]' : change1W < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                      {change1W > 0 ? '+' : ''}{change1W.toFixed(4)}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-hairline)] flex justify-between font-mono">
                  <span>{fx.base}: {formatPercent(baseRate, { isDecimal: true })}</span>
                  <span>{fx.quote}: {formatPercent(quoteRate, { isDecimal: true })}</span>
                </div>

                <div className="text-[9px] text-[var(--signal-positive)] italic">
                  {quoteRate > baseRate
                    ? `${fx.quote} carries a rate premium — UIP implies ${fx.base} should strengthen`
                    : `${fx.base} carries a rate premium — UIP implies ${fx.quote} should strengthen`}
                </div>
              </div>
            );
          })}

          <div className="pt-2">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Cross-Currency Basis Swaps (XCS)</h3>
            {(state.fxPairs || []).map((fx: FxPair) => {
              const basisBps = fx.basisSpreadBps || 0;
              const xcsObj = {
                assetType: 'XCS', id: `XCS_${fx.pair}`, symbol: fx.pair, name: `${fx.pair} 5Y Basis Swap`,
                region: fx.base, price: basisBps, quoteUnit: 'bps Basis',
                details: { tenorYears: 5 }
              };
              return (
                <div key={xcsObj.id} onClick={() => onOpenTrade(xcsObj)} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform mb-2">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">XCS {fx.pair} 5Y</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">USD Liquidity Premium</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-[var(--font-numeric)] font-bold text-[var(--text-primary)]">
                      {basisBps.toFixed(1)} <span className="text-[10px] text-[var(--text-tertiary)]">bps</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {fxTab === 'carry' && (
        <div className="space-y-2">
          {(state.fxPairs || []).map(fx => {
            const baseRate = state.regions[fx.base as RegionId]?.policyRate ?? 0;
            const quoteRate = state.regions[fx.quote as RegionId]?.policyRate ?? 0;
            const rateDiff = quoteRate - baseRate;
            return (
              <div key={fx.pair} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
                <div className="flex justify-between items-center">
                  <div className="text-xs font-bold text-[var(--text-primary)]">{fx.pair} Carry Mechanics</div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${rateDiff >= 0 ? 'bg-[var(--signal-positive)]/20 text-[var(--signal-positive)]' : 'bg-[var(--signal-negative)]/20 text-[var(--signal-negative)]'}`}>
                    {formatPercent(rateDiff, { isDecimal: true, showSign: true })} Spread
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] font-mono flex justify-between">
                  <span>Borrow {fx.base} @ {formatPercent(baseRate, { isDecimal: true })}</span>
                  <span>Lend {fx.quote} @ {formatPercent(quoteRate, { isDecimal: true })}</span>
                </div>
                <div className="text-[9px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-hairline)]">
                  Annualized raw carry (excluding spot FX drift) = {formatPercent(Math.abs(rateDiff), { isDecimal: true })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {fxTab === 'flows' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Regional Trade Balances</h3>
            {(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).map(r => {
              const reg = state.regions[r];
              if (!reg) return null;
              return (
                <div key={r} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-[var(--text-primary)]">{r} ({reg.name})</span>
                    <span className={`text-xs font-bold font-mono ${reg.tradeBalance >= 0 ? 'text-[var(--signal-positive)]' : 'text-[var(--signal-negative)]'}`}>
                      {formatCurrency(reg.tradeBalance, { compact: true, showSign: true })}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] font-mono">
                    <span>Exports: {formatCurrency(reg.exportsUSD, { compact: true })}</span>
                    <span>Imports: {formatCurrency(reg.importsUSD, { compact: true })}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--border-hairline)]">
            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">FX-Sensitive Corporates</h3>
            <div className="space-y-1.5">
              {state.companies
                .filter(c => {
                  const r = state.regions[c.region];
                  return r && (r.exportsUSD / Math.max(1, r.importsUSD)) > 1.05;
                })
                .slice(0, 10)
                .map(c => (
                  <button
                    key={c.id}
                    onClick={() => onNavigate('market', { marketSub: 'corporates', companyTicker: c.ticker })}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--text-tertiary)] transition-colors text-left"
                  >
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">{c.ticker}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">{c.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[var(--signal-neutral)]/20 text-[var(--signal-neutral)]">FX-Exporter</span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">{c.region}</span>
                    </div>
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
