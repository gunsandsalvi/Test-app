import React from 'react';
import {
  BarChart2,
  Calendar,
  ChevronRight,
  Flame,
  Globe,
  Layers,
  LineChart,
  Percent,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { CompositeBenchmarkIndices, GameState, IndexMetric } from '../types';
import { formatBps, formatCurrency, formatPercent, formatSimulationDate } from '../engine/formatters';

interface IndicesTabProps {
  state: GameState;
  onOpenChart: (chartData: {
    id: string;
    title: string;
    subtitle?: string;
    currentValue: number;
    unit?: string;
    historicalSeries: number[];
  }) => void;
}

export const IndicesTab: React.FC<IndicesTabProps> = ({ state, onOpenChart }) => {
  const { compositeIndices, currentWeek } = state;

  const renderSparkline = (series: number[], isPositive: boolean) => {
    if (!series || series.length < 2) return null;
    const data = series.slice(-13); // Last 13 weeks sparkline
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 80;
    const height = 28;
    const padding = 2;

    const points = data.map((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const strokeColor = isPositive ? '#10b981' : '#f43f5e';

    return (
      <svg width={width} height={height} className="overflow-visible shrink-0">
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  const renderIndexCard = (
    key: keyof CompositeBenchmarkIndices,
    metric: IndexMetric,
    categoryLabel: string,
    categoryBadgeColor: string,
    description: string
  ) => {
    const isSpreadOrYield = metric.unit === 'bps' || metric.unit === '%';
    // For spread indices, rising spread is generally negative credit sentiment
    const isPositiveChange = metric.change1W >= 0;
    const isGood = metric.unit === 'bps' ? metric.change1W <= 0 : isPositiveChange;

    return (
      <div
        key={key}
        id={`index-card-${key}`}
        onClick={() =>
          onOpenChart({
            id: key,
            title: metric.name,
            subtitle: `${metric.symbol} • ${categoryLabel} Benchmark (Non-Tradable)`,
            currentValue: metric.value,
            unit: metric.unit === 'pts' ? '' : metric.unit === 'bps' ? ' bps' : metric.unit === '$' ? '$' : metric.unit,
            historicalSeries: metric.historical,
          })
        }
        className="p-3.5 bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-2xl cursor-pointer transition-all shadow-md group hover:shadow-cyan-950/20"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-extrabold font-mono text-sm text-white group-hover:text-cyan-300 transition-colors">
              {metric.symbol}
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${categoryBadgeColor}`}>
              {categoryLabel}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono group-hover:text-cyan-400 transition-colors">
            <span>Interactive Chart</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="text-xs text-slate-300 font-semibold mt-1">
          {metric.name}
        </div>

        <div className="flex items-end justify-between mt-3 pt-2.5 border-t border-slate-800/80">
          <div>
            <div className="text-xl font-extrabold font-mono text-white tracking-tight">
              {metric.unit === '$'
                ? formatCurrency(metric.value)
                : metric.unit === 'bps'
                ? `${metric.value} bps`
                : metric.unit === '%'
                ? `${metric.value.toFixed(2)}%`
                : `${metric.value.toLocaleString()} pts`}
            </div>

            <div
              className={`flex items-center gap-1 text-[11px] font-mono font-bold mt-0.5 ${
                isPositiveChange ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPositiveChange ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>
                {isPositiveChange ? '+' : ''}
                {metric.change1W.toFixed(2)} {metric.unit === 'pts' ? 'pts' : metric.unit}
              </span>
              <span className="text-[10px] text-slate-500 font-normal">1W Change</span>
            </div>
          </div>

          {/* Mini Sparkline */}
          <div className="flex flex-col items-end gap-1">
            {renderSparkline(metric.historical, isPositiveChange)}
            <span className="text-[8px] text-slate-500 font-mono">13-Week Trend</span>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 mt-2 bg-slate-950/60 rounded-lg p-1.5 border border-slate-800/50">
          {description}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 border border-blue-900/40 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Composite Benchmark Indices
              </h2>
              <p className="text-[11px] text-slate-400">
                Non-tradable market-wide composite benchmarks for risk modeling and asset pricing.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-1 rounded bg-blue-950 text-blue-300 border border-blue-800">
            {formatSimulationDate(currentWeek)}
          </span>
        </div>
      </div>

      {/* 1. Global Equity Indices */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <div className="flex items-center gap-1.5">
            <LineChart className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Global Equity Benchmarks (Cap-Weighted)
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">4 Regions</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {renderIndexCard(
            'us500',
            compositeIndices.us500,
            'Equities',
            'bg-blue-500/20 text-blue-300 border-blue-500/40',
            'Market cap-weighted composite tracking 50 major US corporate issuers across Tech, Energy, Financials, Industrials, and Consumer sectors.'
          )}
          {renderIndexCard(
            'euStoxx',
            compositeIndices.euStoxx,
            'Equities',
            'bg-blue-500/20 text-blue-300 border-blue-500/40',
            'Eurozone blue-chip benchmark tracking leading 50 corporate enterprises across Germany, France, Italy, and the Netherlands.'
          )}
          {renderIndexCard(
            'uk100',
            compositeIndices.uk100,
            'Equities',
            'bg-blue-500/20 text-blue-300 border-blue-500/40',
            'UK FTSE 100 proxy tracking London-listed multinationals with high global commodity and financial services exposure.'
          )}
          {renderIndexCard(
            'jp225',
            compositeIndices.jp225,
            'Equities',
            'bg-blue-500/20 text-blue-300 border-blue-500/40',
            'Nikkei 225 price-weighted composite reflecting Japanese industrial conglomerates, robotics, semiconductor equipment, and export leaders.'
          )}
        </div>
      </section>

      {/* 2. Credit Spread Indices */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Regional Credit Spread Benchmarks (OAS)
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Corporate Spreads</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* US Credit */}
          {renderIndexCard(
            'usIgOas',
            compositeIndices.usIgOas,
            'Investment Grade',
            'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
            'US Investment Grade corporate bond spread index (AAA through BBB).'
          )}
          {renderIndexCard(
            'usHyOas',
            compositeIndices.usHyOas,
            'High Yield',
            'bg-amber-500/20 text-amber-300 border-amber-500/40',
            'US High Yield corporate debt spread composite (BB, B, CCC).'
          )}
          
          {/* EU Credit */}
          {renderIndexCard(
            'euIgOas',
            compositeIndices.euIgOas,
            'Investment Grade',
            'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
            'Eurozone Investment Grade corporate bond spread index.'
          )}
          {renderIndexCard(
            'euHyOas',
            compositeIndices.euHyOas,
            'High Yield',
            'bg-amber-500/20 text-amber-300 border-amber-500/40',
            'Eurozone High Yield corporate debt spread composite.'
          )}
          
          {/* UK Credit */}
          {renderIndexCard(
            'ukIgOas',
            compositeIndices.ukIgOas,
            'Investment Grade',
            'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
            'UK Investment Grade corporate bond spread index.'
          )}
          {renderIndexCard(
            'ukHyOas',
            compositeIndices.ukHyOas,
            'High Yield',
            'bg-amber-500/20 text-amber-300 border-amber-500/40',
            'UK High Yield corporate debt spread composite.'
          )}

          {/* JP Credit */}
          {renderIndexCard(
            'jpIgOas',
            compositeIndices.jpIgOas,
            'Investment Grade',
            'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
            'Japan Investment Grade corporate bond spread index.'
          )}
          {renderIndexCard(
            'jpHyOas',
            compositeIndices.jpHyOas,
            'High Yield',
            'bg-amber-500/20 text-amber-300 border-amber-500/40',
            'Japan High Yield corporate debt spread composite.'
          )}
        </div>
      </section>

      {/* 3. Rates & Commodities Benchmarks */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Sovereign Rates & Commodities Benchmarks
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Macro Aggregates</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {renderIndexCard(
            'global10YBenchmark',
            compositeIndices.global10YBenchmark,
            'Sovereign Rates',
            'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
            'Cross-region 10Y benchmark sovereign yield average across US Treasuries, German Bunds, UK Gilts, and Japanese Government Bonds (JGBs).'
          )}
          {renderIndexCard(
            'gsciCommodity',
            compositeIndices.gsciCommodity,
            'Commodities',
            'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
            'S&P GSCI proxy index tracking production-weighted basket of 9 physical commodities across Energy (WTI, Brent, Gas), Metals, and Agriculture.'
          )}
        </div>
      </section>
    </div>
  );
};
