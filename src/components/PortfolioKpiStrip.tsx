import React from 'react';
import { ArrowDownRight, ArrowUpRight, Gauge, Layers, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { CompositeBenchmarkIndices, Portfolio } from '../types';

interface PortfolioKpiStripProps {
  portfolio: Portfolio;
  compositeIndices?: CompositeBenchmarkIndices;
  onOpenPortfolioTab: () => void;
}

export const PortfolioKpiStrip: React.FC<PortfolioKpiStripProps> = ({
  portfolio,
  compositeIndices,
  onOpenPortfolioTab,
}) => {
  const pnlUSD = portfolio.navUSD - portfolio.previousNavUSD;
  const pnlPct = portfolio.previousNavUSD > 0 ? (pnlUSD / portfolio.previousNavUSD) * 100 : 0;
  const isPositive = pnlUSD >= 0;

  // Margin gauge styling
  const marginPct = portfolio.marginUtilizationPct;
  let gaugeColor = 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
  let gaugeBarColor = 'bg-emerald-500';
  let gaugeText = 'Safe (<60%)';

  if (marginPct >= 80 || portfolio.isMarginCall) {
    gaugeColor = 'text-rose-400 bg-rose-500/20 border-rose-500/40';
    gaugeBarColor = 'bg-rose-500';
    gaugeText = marginPct >= 100 ? 'Breach' : 'High (>80%)';
  } else if (marginPct >= 60) {
    gaugeColor = 'text-amber-400 bg-amber-500/20 border-amber-500/30';
    gaugeBarColor = 'bg-amber-500';
    gaugeText = 'Elevated (60-80%)';
  }

  const formatMillions = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1_000_000) {
      return `$${(val / 1_000_000).toFixed(2)}M`;
    }
    if (abs >= 1_000) {
      return `$${(val / 1_000).toFixed(1)}k`;
    }
    return `$${val.toFixed(0)}`;
  };

  const indices = compositeIndices
    ? [
        compositeIndices.us500,
        compositeIndices.euStoxx,
        compositeIndices.uk100,
        compositeIndices.jp225,
        compositeIndices.usHyOas,
        compositeIndices.global10YBenchmark,
      ].filter(Boolean)
    : [];

  return (
    <div className="bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100">
      {/* Mini Ticker Marquee for Non-Tradable Composite Benchmark Indices */}
      <div className="bg-slate-950/80 px-2.5 py-1 border-b border-slate-850 flex items-center gap-3 overflow-x-auto no-scrollbar text-[10px] font-mono">
        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans shrink-0">
          INDEX BENCHMARKS:
        </span>
        <div className="flex items-center gap-3 shrink-0">
          {indices.map((idx) => {
            const isUp = idx.change1W >= 0;
            return (
              <div key={idx.symbol} className="flex items-center gap-1 shrink-0">
                <span className="text-slate-400 font-sans font-medium">{idx.symbol}:</span>
                <span className="font-bold text-slate-100">
                  {idx.value}
                  {idx.unit === '%' ? '%' : idx.unit === 'bps' ? 'bps' : ''}
                </span>
                <span className={`text-[9px] font-semibold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUp ? '+' : ''}
                  {idx.change1W}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Portfolio KPIs */}
      <div
        id="portfolio-kpi-strip"
        onClick={onOpenPortfolioTab}
        className="px-3 py-2 cursor-pointer hover:bg-slate-850 transition-colors"
      >
        <div className="grid grid-cols-4 gap-1.5 items-center">
          {/* NAV & 1W PnL */}
          <div className="col-span-2 pr-1 border-r border-slate-800/80">
            <div className="text-[10px] text-slate-400 font-medium flex items-center justify-between">
              <span>PORTFOLIO NAV</span>
              <span className="text-[9px] text-slate-500">Tap for Risk Tab</span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base font-extrabold tracking-tight font-mono text-white">
                {formatMillions(portfolio.navUSD)}
              </span>
              <span
                className={`flex items-center text-[10px] font-bold font-mono ${
                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {isPositive ? '+' : ''}
                {pnlPct.toFixed(2)}%
              </span>
            </div>
            <div className="text-[9px] text-slate-500 font-mono truncate">
              1W P&L: <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>{formatMillions(pnlUSD)}</span>
            </div>
          </div>

          {/* Unencumbered Cash */}
          <div className="px-1 border-r border-slate-800/80">
            <div className="text-[9px] text-slate-400 font-medium truncate">CASH (USD)</div>
            <div className="text-xs font-bold font-mono text-slate-200 mt-0.5 truncate">
              {formatMillions(portfolio.cashUSD)}
            </div>
            <div className="text-[9px] text-slate-500 font-mono">
              Lev: <span className="text-slate-300 font-semibold">{portfolio.totalLeverage}x</span>
            </div>
          </div>

          {/* Margin Health Gauge */}
          <div className="pl-1">
            <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium">
              <span>MARGIN</span>
              <span className={`text-[8px] font-bold uppercase px-1 py-0.2 rounded border ${gaugeColor}`}>
                {marginPct}%
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${gaugeBarColor}`}
                style={{ width: `${Math.min(100, marginPct)}%` }}
              />
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5 font-mono truncate">
              {gaugeText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
