import React, { useState } from 'react';
import { COMMODITY_QUANTITY_UNIT, GameState, Commodity, Region, RegionId } from '../../types';
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

    const prevPrice = c.historicalPrices?.[c.historicalPrices.length - 2] ?? spot;
    const change1W = spot - prevPrice;
    const changePct = prevPrice > 0 ? (change1W / prevPrice) * 100 : 0;

    const obj = {
      assetType: 'COMMODITY', id: c.id, symbol: c.id, name: c.name, region: 'Global',
      price: spot, quoteUnit: `USD per ${c.unit || 'unit'}`,
      details: { commodityId: c.id },
    };

    return { ...c, spot, futures, isContango, change1W, changePct, obj };
  }).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

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
          <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold flex justify-between">
            <span>Commodities (Sorted by 1W Move)</span>
            <span>Spot Price</span>
          </div>

          {commodities.map(c => {
            const activeWeatherEntry = (Object.entries(state.regions) as [RegionId, Region][]).find(([, r]) => r.weather && r.weather.affectedCommodityId === c.id && r.weather.severity !== 'Normal');
            const activeWeather = activeWeatherEntry ? { id: activeWeatherEntry[0], weather: activeWeatherEntry[1].weather } : undefined;

            return (
              <div key={c.id} onClick={() => onOpenTrade(c.obj)} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform space-y-2 hover:border-[var(--text-tertiary)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)]">{c.name}</span>
                      {Math.abs(c.changePct) > 1.0 && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[var(--signal-neutral)]/20 text-[var(--signal-neutral)]">VOLATILE</span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">{c.category} · per {c.unit}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-[var(--font-numeric)] font-bold text-[var(--text-primary)]">
                      {formatCurrency(c.spot, { compact: false })}
                    </div>
                    <div className={`text-[10px] font-bold ${c.change1W > 0 ? 'text-[var(--signal-positive)]' : c.change1W < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                      {c.change1W > 0 ? '+' : ''}{formatCurrency(c.change1W, { compact: false })} ({c.changePct.toFixed(2)}%)
                    </div>
                  </div>
                </div>

                <TapToChart label="Price History" value={formatCurrency(c.spot, { compact: false })} history={c.historicalPrices} />

                {(() => {
                  const unitLabel = { BARREL: 'bbl', MMBTU: 'MMBtu', TROY_OZ: 'troy oz', TONNE: 'tonnes' }[COMMODITY_QUANTITY_UNIT[c.id]] ?? 'units';
                  return (
                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-hairline)] font-mono">
                      <div className="flex flex-col">
                        <span>Supply: {(c.weeklySupplyUnits ?? 0).toLocaleString(undefined, {maximumFractionDigits:0})} {unitLabel}</span>
                        <span>Demand: {(c.weeklyDemandUnits ?? 0).toLocaleString(undefined, {maximumFractionDigits:0})} {unitLabel}</span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span>Bal: <span className="font-bold text-[var(--text-primary)]">{c.supplyDemandBalance}</span></span>
                        <span>Inv: <span className="font-bold text-[var(--text-secondary)]">{formatPercent(c.inventoryLevelPct, { isDecimal: true })}</span></span>
                      </div>
                    </div>
                  );
                })()}

                {activeWeather && activeWeather.weather && (
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
              <div key={c.id} onClick={() => onOpenTrade(c.obj)} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform space-y-2 hover:border-[var(--text-tertiary)]">
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
          {(Object.entries(state.regions) as [RegionId, Region][]).map(([rId, reg]) => {
            const indDemand = (reg.categoryDemand as any).heavy_equipment;
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
