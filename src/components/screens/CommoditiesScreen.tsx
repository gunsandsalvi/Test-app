import React, { useState } from 'react';
import { GameState, Commodity } from '../../types';
import { formatCurrency, formatPercent } from '../../engine/formatters';
import { TapToChart } from '../shared/TapToChart';
import { priceCommodityFutures } from '../../engine/pricing';

type CommodityTab = 'spot' | 'curve' | 'supplychain';

export const CommoditiesScreen: React.FC<{ state: GameState, onOpenTrade: (i: any) => void }> = ({ state, onOpenTrade }) => {
  const [tab, setTab] = useState<CommodityTab>('spot');
  const rf = state.regions.USA?.policyRate ?? 0.04;

  const rawList = Array.isArray(state.commodities) ? state.commodities : Object.values(state.commodities || {});

  const commodities = rawList.map((c: Commodity) => {
    const spot = c.spotPrice ?? 100;
    const q = c.convenienceYield ?? 0.03;
    const tenors = [0, 1 / 12, 3 / 12, 6 / 12, 1];
    const futures = tenors.map(t => t === 0 ? spot : priceCommodityFutures(spot, rf, q, t));
    const isContango = futures[futures.length - 1] > spot;

    const obj = {
      assetType: 'COMMODITY', id: c.id, symbol: c.id, name: c.name, region: 'Global',
      price: spot, quoteUnit: `USD per ${c.unit || 'unit'}`,
      details: { commodityId: c.id },
    };

    return { ...c, spot, futures, isContango, obj };
  });

  return (
    <div className="p-3 space-y-4 pb-20">
      {/* Tab Selector */}
      <div className="flex overflow-x-auto no-scrollbar border-b border-[var(--border-hairline)] pb-1">
        {(['spot', 'curve', 'supplychain'] as CommodityTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-[11px] font-bold uppercase whitespace-nowrap transition-colors ${tab === t ? 'text-[var(--text-primary)] border-b-2 border-[var(--region-usa)]' : 'text-[var(--text-tertiary)]'}`}
          >
            {t === 'spot' ? 'Spot Markets' : t === 'curve' ? 'Futures Curve' : 'Supply Chain Linkage'}
          </button>
        ))}
      </div>

      {tab === 'spot' && (
        <div className="space-y-2">
          {commodities.map(c => {
            // Find active weather shock if any
            const activeWeather = Object.values(state.regions).find(r => r.weather && r.weather.affectedCommodityId === c.id && r.weather.severity !== 'Normal');
            return (
              <div key={c.id} onClick={() => onOpenTrade(c.obj)} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{c.name}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">{c.category} · per {c.unit}</div>
                  </div>
                  <TapToChart label="" value={formatCurrency(c.spot, { compact: false })} history={c.historicalPrices} />
                </div>

                <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-hairline)] font-mono">
                  <span>S/D Balance: <span className="font-bold text-[var(--text-primary)]">{c.supplyDemandBalance}</span></span>
                  <span>Inv Level: <span className="font-bold text-[var(--text-secondary)]">{formatPercent(c.inventoryLevelPct, { isDecimal: true })}</span></span>
                </div>

                {activeWeather && (
                  <div className="text-[9px] text-[var(--signal-negative)] font-bold bg-[var(--signal-negative)]/10 p-1.5 rounded">
                    ⚡ {activeWeather.weather.type} in {activeWeather.id} ({activeWeather.weather.severity}): {activeWeather.weather.economicImpact}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'curve' && (
        <div className="space-y-3">
          {commodities.map(c => {
            const minF = Math.min(...c.futures);
            const maxF = Math.max(...c.futures);
            const rangeF = maxF - minF || 1;
            const pts = c.futures.map((f, i) => `${(i / (c.futures.length - 1)) * 240},${40 - ((f - minF) / rangeF) * 32}`).join(' ');

            return (
              <div key={c.id} onClick={() => onOpenTrade(c.obj)} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{c.name} Term Structure</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">Convenience Yield: {formatPercent(c.convenienceYield ?? 0, { isDecimal: true })}</div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.isContango ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    {c.isContango ? 'Contango' : 'Backwardation'}
                  </span>
                </div>

                <div className="relative w-full h-12 flex items-center justify-center bg-[var(--bg-panel)] rounded p-2">
                  <svg width="240" height="40" className="overflow-visible">
                    <polyline points={pts} fill="none" stroke={c.isContango ? '#3b82f6' : '#a855f7'} strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </div>

                <div className="grid grid-cols-5 text-center text-[9px] font-mono text-[var(--text-tertiary)] border-t border-[var(--border-hairline)] pt-1">
                  <div>Spot: ${c.futures[0].toFixed(1)}</div>
                  <div>1M: ${c.futures[1].toFixed(1)}</div>
                  <div>3M: ${c.futures[2].toFixed(1)}</div>
                  <div>6M: ${c.futures[3].toFixed(1)}</div>
                  <div>1Y: ${c.futures[4].toFixed(1)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'supplychain' && (
        <div className="space-y-3">
          {Object.entries(state.regions).map(([rId, reg]) => {
            const indDemand = reg.categoryDemand.CorporateIndustrial;
            if (!indDemand) return null;
            return (
              <div key={rId} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[var(--text-primary)]">{rId} Industrial Inputs</span>
                  <span className="text-xs font-mono font-bold text-[var(--region-usa)]">Input Index: {indDemand.clearedInputPriceIndex.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] font-mono">
                  <span>Inventory Level: {formatCurrency(indDemand.inventoryLevelUSD, { compact: true })}</span>
                  <span>Input Pressure: {indDemand.inputCostPressure.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
