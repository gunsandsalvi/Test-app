import React, { useState } from 'react';
import { Sparkline, SegmentedBar } from './charts/Charts';
import {
  Activity,
  AlertOctagon,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  CheckCircle2,
  Coins,
  DollarSign,
  Layers,
  LineChart,
  Percent,
  PieChart,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { GameState, Position, ReturnAttribution } from '../types';
import { formatCurrency, formatPercent } from '../engine/formatters';

interface PortfolioRiskTabProps {
  state: GameState;
  onClosePosition: (positionId: string) => void;
}

export const PortfolioRiskTab: React.FC<PortfolioRiskTabProps> = ({
  state,
  onClosePosition,
}) => {
  const [activeView, setActiveView] = useState<'POSITIONS' | 'ATTRIBUTION' | 'GREEKS' | 'DEALERS'>('POSITIONS');
  const portfolio = state.portfolio;
  const positions = portfolio.positions;

  const formatUSD = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(val / 1_000).toFixed(1)}k`;
    return `$${val.toFixed(0)}`;
  };

  // Quantitative Stats Calculations
  const startingCap = portfolio.startingCapitalUSD;
  const totalReturnUSD = portfolio.navUSD - startingCap;
  const totalReturnPct = (totalReturnUSD / startingCap) * 100;

  // Rolling Sharpe & Drawdown
  const navHist = portfolio.historicalNav;
  let maxDrawdownPct = 0;
  let peak = navHist[0] || startingCap;
  navHist.forEach((nav) => {
    if (nav > peak) peak = nav;
    const dd = ((peak - nav) / peak) * 100;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  });

  // Benchmark tracking comparison
  const benchmarkRecords = portfolio.historicalBenchmarks || [];
  const latestBenchmark = benchmarkRecords.slice(-1)[0] || {
    benchmark6040: startingCap,
    cashHurdle: startingCap,
  };
  const b6040ReturnPct = ((latestBenchmark.benchmark6040 - startingCap) / startingCap) * 100;
  const cashHurdleReturnPct = ((latestBenchmark.cashHurdle - startingCap) / startingCap) * 100;
  const alphaVs6040Pct = totalReturnPct - b6040ReturnPct;

  // Attribution totals
  const cumAttr = portfolio.cumulativeAttribution;
  const lastAttr = portfolio.lastWeekAttribution;

  const attributionCategories: { key: keyof ReturnAttribution; label: string; desc: string; color: string }[] = [
    { key: 'carryUSD', label: 'Net Carry & Yield', desc: 'Coupons, dividends, cash yield, financing costs', color: 'text-emerald-400' },
    { key: 'macroRatesUSD', label: 'Macro & Rates Curve', desc: 'Sovereign curve shifts & DV01 duration moves', color: 'text-blue-400' },
    { key: 'creditSpreadUSD', label: 'Credit Spread & OAS', desc: 'Corporate bond & CDS spread tightening/widening', color: 'text-indigo-400' },
    { key: 'equityDeltaUSD', label: 'Equity & Commodity Delta', desc: 'Stock & commodity price shifts from fundamentals', color: 'text-amber-400' },
    { key: 'volThetaUSD', label: 'Volatility & Theta', desc: 'Options vega shocks & time decay harvest', color: 'text-purple-400' },
  ];

  // SVG Chart: Multi-line comparison (Portfolio NAV vs 60/40 Benchmark vs Cash Hurdle)
  const svgW = 340;
  const svgH = 110;
  const pad = 14;

  const allVals = [
    ...(navHist || [startingCap]),
    ...(benchmarkRecords || []).map((b) => b.benchmark6040),
    ...(benchmarkRecords || []).map((b) => b.cashHurdle),
  ].filter((v) => typeof v === 'number' && !isNaN(v));
  const safeVals = allVals.length > 0 ? allVals : [startingCap];
  const minVal = Math.min(...safeVals) * 0.98;
  const maxVal = Math.max(...safeVals) * 1.02;
  const valRange = maxVal - minVal || 1;

  const getSvgPoints = (data: number[]) => {
    return data.map((v, idx) => {
      const x = pad + (idx / Math.max(1, data.length - 1)) * (svgW - pad * 2);
      const y = svgH - pad - ((v - minVal) / valRange) * (svgH - pad * 2);
      return `${x},${y}`;
    }).join(' ');
  };

  const navPoints = getSvgPoints(navHist);
  const b6040Points = getSvgPoints(benchmarkRecords.map((b) => b.benchmark6040));
  const cashPoints = getSvgPoints(benchmarkRecords.map((b) => b.cashHurdle));

  return (
    <div className="space-y-3 pb-20">
      {/* Asset Allocation Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-sm">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Gross Asset Allocation</h3>
        <SegmentedBar 
          segments={[
            { value: portfolio.positions.filter(p => p.assetType === 'EQUITY').reduce((s,p) => s + p.notional, 0), color: '#3b82f6', label: 'Equities' },
            { value: portfolio.positions.filter(p => p.assetType === 'CORP_BOND' || p.assetType === 'SOV_BOND' || p.assetType === 'LEVERAGED_LOAN').reduce((s,p) => s + p.notional, 0), color: '#10b981', label: 'Bonds' },
            { value: portfolio.positions.filter(p => p.assetType === 'CDS').reduce((s,p) => s + p.notional, 0), color: '#f59e0b', label: 'CDS' },
            { value: portfolio.positions.filter(p => !['EQUITY','CORP_BOND','SOV_BOND','CDS','LEVERAGED_LOAN'].includes(p.assetType)).reduce((s,p) => s + p.notional, 0), color: '#8b5cf6', label: 'Other' },
          ]} 
          height={12} 
        />
        <div className="flex justify-between text-[9px] text-slate-400 mt-1.5 font-medium">
          <span className="text-blue-400">Equities</span>
          <span className="text-emerald-400">Bonds</span>
          <span className="text-amber-400">CDS</span>
          <span className="text-purple-400">Other</span>
        </div>
      </div>

      {/* Mini Performance Trajectory & Benchmark Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
          <div className="flex items-center gap-1.5">
            <LineChart className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white">Fund NAV vs 60/40 Benchmark</h3>
          </div>
          <span className={`text-[10px] font-mono font-bold ${alphaVs6040Pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            Alpha: {alphaVs6040Pct >= 0 ? '+' : ''}{alphaVs6040Pct.toFixed(2)}%
          </span>
        </div>

        <div className="w-full bg-slate-950/90 rounded-lg p-2.5 border border-slate-800/80">
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-24">
            {/* Gridlines */}
            <line x1={pad} y1={pad} x2={svgW - pad} y2={pad} stroke="#334155" strokeDasharray="3,3" strokeWidth="0.5" />
            <line x1={pad} y1={svgH / 2} x2={svgW - pad} y2={svgH / 2} stroke="#334155" strokeDasharray="3,3" strokeWidth="0.5" />
            <line x1={pad} y1={svgH - pad} x2={svgW - pad} y2={svgH - pad} stroke="#334155" strokeDasharray="3,3" strokeWidth="0.5" />

            {/* Cash Hurdle (Slate dotted) */}
            <polyline
              fill="none"
              stroke="#64748b"
              strokeWidth="1.5"
              strokeDasharray="4,3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={cashPoints}
            />

            {/* 60/40 Benchmark (Amber line) */}
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={b6040Points}
            />

            {/* Fund NAV (Emerald bold) */}
            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={navPoints}
            />
          </svg>

          {/* Chart Legend */}
          <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mt-2 pt-1 border-t border-slate-900">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Fund NAV: <strong className="text-white">{formatCurrency(portfolio.navUSD)}</strong></span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>60/40 ({b6040ReturnPct >= 0 ? '+' : ''}{b6040ReturnPct.toFixed(1)}%)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>Cash 5%</span>
            </div>
          </div>
        </div>

        {/* Quant Performance KPI Grid */}
        <div className="grid grid-cols-4 gap-1.5 mt-2 text-[10px] font-mono">
          <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
            <span className="text-[8px] text-slate-500 block uppercase">Total Return</span>
            <span className={`font-bold mt-0.5 block ${totalReturnUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalReturnPct >= 0 ? '+' : ''}{totalReturnPct.toFixed(2)}%
            </span>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
            <span className="text-[8px] text-slate-500 block uppercase">Max Drawdown</span>
            <span className="font-bold text-rose-400 mt-0.5 block">
              -{maxDrawdownPct.toFixed(2)}%
            </span>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
            <span className="text-[8px] text-slate-500 block uppercase">Realized P&L</span>
            <span className={`font-bold mt-0.5 block ${portfolio.realizedPnLTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatCurrency(portfolio.realizedPnLTotal)}
            </span>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-center">
            <span className="text-[8px] text-slate-500 block uppercase">Gross Lev</span>
            <span className="font-bold text-slate-200 mt-0.5 block">
              {portfolio.totalLeverage}x
            </span>
          </div>
        </div>
      </div>

      {/* Segmented View Switcher */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-bold">
        <button
          onClick={() => setActiveView('POSITIONS')}
          className={`py-1.5 rounded-lg transition-all ${
            activeView === 'POSITIONS' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Books ({positions.length})
        </button>
        <button
          onClick={() => setActiveView('ATTRIBUTION')}
          className={`py-1.5 rounded-lg transition-all ${
            activeView === 'ATTRIBUTION' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Attribution
        </button>
        <button
          onClick={() => setActiveView('GREEKS')}
          className={`py-1.5 rounded-lg transition-all ${
            activeView === 'GREEKS' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Greeks
        </button>
        <button
          onClick={() => setActiveView('DEALERS')}
          className={`py-1.5 rounded-lg transition-all ${
            activeView === 'DEALERS' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Dealers
        </button>
      </div>

      {/* 1. Open Positions View */}
      {activeView === 'POSITIONS' && (
        <div className="space-y-2">
          {positions.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
              <Layers className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <h4 className="text-xs font-bold text-slate-300">No Open Positions</h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Explore the Equities, Bonds & CDS, or Derivatives tabs to execute trades.
              </p>
            </div>
          ) : (
            positions.map((pos) => {
              const isProfit = pos.unrealizedPnL >= 0;
              const dealer = state.dealers.find((d) => d.id === pos.dealerId);

              return (
                <div
                  key={pos.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-3 transition-all hover:border-slate-700"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold font-mono text-xs text-white">{pos.symbol}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                          {pos.assetType}
                        </span>
                        <span
                          className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded ${
                            pos.direction.includes('LONG') || pos.direction.includes('BUY') || pos.direction.includes('PAY')
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {pos.direction.replace('_', ' ')}
                        </span>
                      </div>
                      <h4 className="text-xs text-slate-300 mt-0.5 truncate max-w-[210px]">{pos.name}</h4>
                    </div>

                    <div className="text-right">
                      <div
                        className={`text-xs font-extrabold font-mono flex items-center justify-end ${
                          isProfit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isProfit ? '+' : ''}{formatCurrency(pos.unrealizedPnL)}
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono">Unrealized MTM</span>
                    </div>
                  </div>

                  {/* Position Details Matrix */}
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-[10px] font-mono text-slate-400">
                    <div>
                      <span className="text-slate-500 text-[8px] block uppercase">Notional</span>
                      <span className="text-slate-200 font-semibold">{formatCurrency(pos.notional)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[8px] block uppercase">PB Margin</span>
                      <span className="text-slate-200 font-semibold">{formatCurrency(pos.marginRequirement)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[8px] block uppercase">Dealer</span>
                      <span className="text-indigo-300 font-semibold truncate block">
                        {dealer?.name.split(' ')[0] || 'Alpha'}
                      </span>
                    </div>
                  </div>

                  {/* Close Action */}
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[9px] text-slate-500">
                      Opened: Week {pos.openedWeek}
                    </span>
                    <button
                      id={`btn-close-pos-${pos.id}`}
                      onClick={() => onClosePosition(pos.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white text-[10px] font-bold shadow-sm transition-all"
                    >
                      <XCircle className="w-3 h-3" />
                      <span>Close Book</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 2. Performance Attribution (5-bucket return breakdown) */}
      {activeView === 'ATTRIBUTION' && (
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <div>
                <h3 className="text-xs font-bold text-white">Brinson-Fachler Risk & Return Attribution</h3>
                <p className="text-[10px] text-slate-400">Cumulative decomposition across 5 alpha buckets</p>
              </div>
              <Award className="w-4 h-4 text-amber-400" />
            </div>

            <div className="space-y-2 mt-3">
              {attributionCategories.map((cat) => {
                const val = cumAttr[cat.key];
                const lastVal = lastAttr[cat.key];
                const isPos = val >= 0;

                return (
                  <div
                    key={cat.key}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-xs font-bold text-white">{cat.label}</span>
                      <p className="text-[9px] text-slate-400">{cat.desc}</p>
                    </div>

                    <div className="text-right font-mono">
                      <span className={`text-xs font-extrabold block ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPos ? '+' : ''}{formatCurrency(val)}
                      </span>
                      <span className="text-[8px] text-slate-500 block">
                        Last Wk: {lastVal >= 0 ? '+' : ''}{formatCurrency(lastVal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. Factor Greeks & DV01 */}
      {activeView === 'GREEKS' && (
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <h3 className="text-xs font-bold text-white">Portfolio Factor Sensitivity & Greeks</h3>
              <span className="text-[9px] text-slate-400 font-mono">Aggregated Exposure</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[9px] text-slate-500 font-semibold uppercase block">Net Delta Exposure (Δ)</span>
                <span className="text-sm font-extrabold font-mono text-blue-400 mt-1 block">
                  {formatCurrency(portfolio.netDeltaUSD)}
                </span>
                <span className="text-[8px] text-slate-500 mt-0.5 block">Equity & Spot directional delta</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[9px] text-slate-500 font-semibold uppercase block">Net DV01 (Rates Risk)</span>
                <span className="text-sm font-extrabold font-mono text-indigo-400 mt-1 block">
                  {formatCurrency(portfolio.netDV01USD)}/bp
                </span>
                <span className="text-[8px] text-slate-500 mt-0.5 block">PnL sensitivity to 1 bp curve shift</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[9px] text-slate-500 font-semibold uppercase block">Net Vega (ν)</span>
                <span className="text-sm font-extrabold font-mono text-purple-400 mt-1 block">
                  {formatCurrency(portfolio.netVegaUSD)}/1%
                </span>
                <span className="text-[8px] text-slate-500 mt-0.5 block">Exposure to 1 point vol change</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[9px] text-slate-500 font-semibold uppercase block">Net Gamma (Γ)</span>
                <span className="text-sm font-extrabold font-mono text-emerald-400 mt-1 block">
                  {formatCurrency(portfolio.netGammaUSD)}
                </span>
                <span className="text-[8px] text-slate-500 mt-0.5 block">Curvature & convex delta acceleration</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Counterparty Dealers Risk & Inventory Axes */}
      {activeView === 'DEALERS' && (
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <div>
                <h3 className="text-xs font-bold text-white">Prime Brokers & Counterparty Inventory Axes</h3>
                <p className="text-[10px] text-slate-400">Unified PB Margining & Active Desk Flow</p>
              </div>
            </div>

            <div className="space-y-2 mt-2">
              {state.dealers.map((dealer) => {
                const dealerPositions = positions.filter((p) => p.dealerId === dealer.id);
                const grossExposureUSD = dealerPositions.reduce((sum, p) => sum + p.notional, 0);
                const limitUtilization = dealer.creditLimitUSD > 0 ? (grossExposureUSD / dealer.creditLimitUSD) * 100 : 0;

                return (
                  <div
                    key={dealer.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white">{dealer.name}</span>
                        <p className="text-[9px] text-indigo-300 font-semibold">{dealer.inventoryAxe}</p>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        {dealer.axeBadge}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-400">{dealer.axeDescription}</p>

                    {/* Credit Limit Progress */}
                    <div className="pt-1 border-t border-slate-900">
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                        <span>Line Used: {formatCurrency(grossExposureUSD)}</span>
                        <span>Credit Limit: {formatCurrency(dealer.creditLimitUSD)} ({limitUtilization.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-purple-500 transition-all duration-300"
                          style={{ width: `${Math.min(100, limitUtilization)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
