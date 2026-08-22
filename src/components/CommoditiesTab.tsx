import React from 'react';
import {
  Activity,
  BarChart2,
  CheckCircle2,
  Droplet,
  Flame,
  Globe,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wheat,
  Zap,
} from 'lucide-react';
import { Commodity, GameState, TradeableInstrument } from '../types';
import { formatBps, formatCurrency, formatPercent } from '../engine/formatters';

interface CommoditiesTabProps {
  state: GameState;
  onOpenTrade: (instrument: any) => void;
  onOpenChart?: (chartData: {
    id: string;
    title: string;
    subtitle?: string;
    currentValue: number;
    unit?: string;
    historicalSeries: number[];
  }) => void;
}

export const CommoditiesTab: React.FC<CommoditiesTabProps> = ({
  state,
  onOpenTrade,
  onOpenChart,
}) => {
  const getCommodityIcon = (type: string) => {
    switch (type) {
      case 'ENERGY':
        return <Flame className="w-4 h-4 text-amber-400" />;
      case 'METALS':
        return <Layers className="w-4 h-4 text-cyan-400" />;
      case 'AGRI':
        return <Wheat className="w-4 h-4 text-emerald-400" />;
      default:
        return <Zap className="w-4 h-4 text-blue-400" />;
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Global Commodities & Physical Desk</h2>
              <p className="text-[10px] text-slate-400">Energy, Industrial Metals, Precious Metals & Agris</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold border border-slate-700">
            {state.commodities.length} Contracts
          </span>
        </div>
      </div>

      {/* Commodity Contracts Grid */}
      <div className="space-y-2.5">
        {state.commodities.map((comm) => {
              const isUp = (comm.change1W ?? 0) >= 0;
              const histPrices = comm.historicalPrices?.length > 0 ? comm.historicalPrices : [comm.spotPrice];
              const minP = Math.min(...histPrices);
              const maxP = Math.max(...histPrices);
              const range = maxP - minP || 1;
              const isBackwardation = comm.futures1M < comm.spotPrice;
              const curveStructure = isBackwardation ? 'BACKWARDATION' : 'CONTANGO';
              const rollYieldPct = comm.spotPrice > 0 ? ((comm.spotPrice - comm.futures1M) / comm.spotPrice) * 12 : 0;
              const currentSpotPrice = comm.spotPrice ?? 0;

              return (
                <div
                  key={comm.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 space-y-2.5 transition-all shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                        {getCommodityIcon(comm.category)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-sm text-white font-mono">{comm.symbol}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                            {comm.category}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              isBackwardation
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {curveStructure}
                          </span>
                        </div>
                        <h3 className="text-xs font-semibold text-slate-300 mt-0.5">{comm.name}</h3>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-extrabold font-mono text-white">
                        ${currentSpotPrice.toFixed(2)}
                      </div>
                      <div
                        className={`text-[10px] font-mono font-bold flex items-center justify-end gap-0.5 ${
                          isUp ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        <span>
                          {isUp ? '+' : ''}
                          {(comm.change1W ?? 0).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sparkline & Term Structure Info */}
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80 text-[10px] font-mono">
                    <div className="p-1.5 rounded bg-slate-950 border border-slate-850">
                      <span className="text-slate-500 text-[8px] block uppercase">Roll Yield</span>
                      <span
                        className={`font-bold ${
                          rollYieldPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPercent(rollYieldPct, { isDecimal: true, showSign: true })}/yr
                      </span>
                    </div>

                    <div className="p-1.5 rounded bg-slate-950 border border-slate-850">
                      <span className="text-slate-500 text-[8px] block uppercase">Global Stocks</span>
                      <span className="font-bold text-slate-200">{comm.inventoryLevelPct}% Avg</span>
                    </div>

                    <div className="p-1.5 rounded bg-slate-950 border border-slate-850">
                      <span className="text-slate-500 text-[8px] block uppercase">PB Margin</span>
                      <span className="font-bold text-cyan-300">10.0x Lev</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    {onOpenChart && (
                      <button
                        onClick={() =>
                          onOpenChart({
                            id: comm.symbol,
                            title: `${comm.name} (${comm.symbol})`,
                            subtitle: `${comm.category} • Forward Curve: ${curveStructure}`,
                            currentValue: currentSpotPrice,
                            unit: '$',
                            historicalSeries: histPrices,
                          })
                        }
                        className="flex-1 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs font-mono font-medium border border-slate-800 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>52W Chart</span>
                      </button>
                    )}

                    <button
                      onClick={() =>
                        onOpenTrade({
                          assetType: 'COMMODITY',
                          id: comm.id,
                          symbol: comm.symbol,
                          name: comm.name,
                          region: 'USA',
                          price: currentSpotPrice,
                          quoteUnit: 'USD',
                          details: {
                            category: comm.category,
                            curveStructure,
                            rollYieldPct,
                          },
                        })
                      }
                      className="flex-1 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 active:scale-95 text-white text-xs font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Trade Contract</span>
                    </button>
                  </div>
                </div>
              );
        })}
      </div>
    </div>
  );
};
