import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  Layers,
  Percent,
  Radio,
  RefreshCw,
  Sliders,
  Terminal,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { GameState, RegionId } from '../types';
import {
  cleanLatexTokens,
  formatBps,
  formatCurrency,
  formatPercent,
  formatSimulationDate,
} from '../engine/formatters';

interface DiagnosticsModalProps {
  state: GameState;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ state, onClose }) => {
  const [activeTab, setActiveTab] = useState<'MACRO' | 'MICRO' | 'CREDIT_RISK' | 'LOGS'>('MACRO');
  const regions: RegionId[] = ['USA', 'UK', 'JPN', 'EUR'];
  const formattedDate = formatSimulationDate(state.currentWeek);

  // Aggregate CapEx across all 50 firms per region
  const getRegionalMicroAggregation = (rId: RegionId) => {
    const companiesInRegion = state.companies.filter((c) => c.region === rId);
    const totalCapex = companiesInRegion.reduce((sum, c) => sum + (c.capex || c.ebitda * 0.3), 0);
    const avgMarkup =
      companiesInRegion.reduce((sum, c) => sum + ((c as any).pricingPowerMarkupPct || 0.12), 0) /
      Math.max(1, companiesInRegion.length);
    const totalDebt = companiesInRegion.reduce((sum, c) => sum + c.totalDebt, 0);
    const regionObj = state.regions[rId];
    
    // 1. Normalized CapEx impact calculation
    const baselineCapex = companiesInRegion.length * 50; 
    const aggregateCapexGrowth = (totalCapex / Math.max(1, baselineCapex)) - 1.0;
    const capexGdpImpactPct = Math.max(0.0005, Math.min(0.0035, aggregateCapexGrowth * 0.02 + 0.0015));
    
    const markupCpiImpactPct = avgMarkup * 0.15;
    
    // 2. Household Spending -> Retail Sector Revenue Drag/Boost (in bps)
    const retailRevBoostPct = (regionObj?.householdState?.realConsumptionGrowth || 0) * 1.6;
    const retailRevBoostBps = retailRevBoostPct * 10000;
    
    // 3. Wage-Push Inflation Contribution to Core CPI (in bps)
    const wagePushPct = Math.max(0, (regionObj?.householdState?.wageGrowth || 0) - 0.015) * 0.40;
    const wagePushBps = (wagePushPct * 0.02) * 10000; // Scaled by weekly factor

    return {
      companyCount: companiesInRegion.length,
      totalCapex,
      capexGdpImpactPct,
      avgMarkup,
      markupCpiImpactPct,
      totalDebt,
      retailRevBoostBps,
      wagePushBps,
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 animate-in fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-cyan-500/40 rounded-2xl p-4 sm:p-5 space-y-4 max-h-[92vh] overflow-y-auto shadow-[0_0_50px_rgba(6,182,212,0.15)] font-mono">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Engine Debugger & Diagnostics Matrix
                </h3>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                  {formattedDate}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-sans">
                Closed-Loop Macro ↔ Micro Bidirectional Coupling Engine
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-bold text-center">
          <button
            onClick={() => setActiveTab('MACRO')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'MACRO' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            1. Macro Vectors
          </button>
          <button
            onClick={() => setActiveTab('MICRO')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'MICRO' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            2. Micro Aggregation
          </button>
          <button
            onClick={() => setActiveTab('CREDIT_RISK')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'CREDIT_RISK' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            3. Credit & Health
          </button>
          <button
            onClick={() => setActiveTab('LOGS')}
            className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
              activeTab === 'LOGS' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3 h-3" />
            <span>4. Step Logs</span>
          </button>
        </div>

        {/* TAB 1: MACRO TRANSMISSION VECTORS */}
        {activeTab === 'MACRO' && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-cyan-400 uppercase tracking-wider border-b border-slate-850 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                <span>Macro → Micro Vectors (Inertial Taylor Rule & Yield Curves)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-normal">Inertia ρ = 0.85</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {regions.map((rId) => {
                const reg = state.regions[rId];
                const rStarTarget = rId === 'USA' ? '1.00%' : rId === 'UK' ? '0.75%' : rId === 'EUR' ? '0.50%' : '-0.25%';
                return (
                  <div
                    key={rId}
                    className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-sans flex items-center gap-1">
                        <span>{reg.symbol}</span>
                        <span>{reg.name}</span>
                      </span>
                      <span className="text-[11px] text-cyan-300 font-bold">
                        {formatPercent(reg.policyRate, { isDecimal: true, precision: 2 })} Policy
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-400">
                      <div>
                        <span>r* Equilibrium:</span>{' '}
                        <span className="text-white font-bold">{rStarTarget}</span>
                      </div>
                      <div>
                        <span>Inflation Gap:</span>{' '}
                        <span className="text-amber-400 font-bold">
                          {formatPercent(reg.inflation - reg.targetInflation, { isDecimal: true, showSign: true, precision: 2 })}
                        </span>
                      </div>
                      <div>
                        <span>5Y Zero Rate:</span>{' '}
                        <span className="text-emerald-400 font-bold">
                          {formatPercent(reg.zeroRates.tenor5Y, { isDecimal: true, precision: 2 })}
                        </span>
                      </div>
                      <div>
                        <span>10Y - 2Y Slope:</span>{' '}
                        <span className="text-purple-300 font-bold">
                          {formatBps((reg.zeroRates.tenor10Y - reg.zeroRates.tenor2Y) * 10000, { precision: 1 })}
                        </span>
                      </div>
                      <div>
                        <span>Nelson-Siegel β₀ (Level):</span>{' '}
                        <span className="text-slate-300 font-bold">{reg.yieldCurveParams.beta0.toFixed(4)}</span>
                      </div>
                      <div>
                        <span>Nelson-Siegel β₁ (Slope):</span>{' '}
                        <span className="text-slate-300 font-bold">{reg.yieldCurveParams.beta1.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: MICRO AGGREGATION MATRIX */}
        {activeTab === 'MICRO' && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider border-b border-slate-850 pb-1.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Micro → Macro Aggregations (Bottom-up Corporate Feedback)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-normal">200 Issuers Aggregated</span>
            </div>

            <div className="space-y-2.5">
              {regions.map((rId) => {
                const agg = getRegionalMicroAggregation(rId);
                return (
                  <div
                    key={rId}
                    className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">
                        {rId} Corporate Sector ({agg.companyCount} Active Issuers)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Aggregate CapEx: {formatCurrency(agg.totalCapex, { compact: true })}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-850">
                        <span className="text-slate-500 text-[9px] block uppercase">CapEx → GDP Addition</span>
                        <span className="text-emerald-400 font-bold text-xs mt-0.5 block">
                          +{formatPercent(agg.capexGdpImpactPct, { isDecimal: true, precision: 2 })}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-850">
                        <span className="text-slate-500 text-[9px] block uppercase">Wage-Push → Core CPI</span>
                        <span className="text-amber-400 font-bold text-xs mt-0.5 block">
                          +{agg.wagePushBps.toFixed(1)} bps
                        </span>
                      </div>

                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-850">
                        <span className="text-slate-500 text-[9px] block uppercase">Consumpt → Rtl Rev</span>
                        <span className="text-cyan-400 font-bold text-xs mt-0.5 block">
                          {agg.retailRevBoostBps > 0 ? '+' : ''}{agg.retailRevBoostBps.toFixed(1)} bps
                        </span>
                      </div>

                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-850">
                        <span className="text-slate-500 text-[9px] block uppercase">Aggregated Sector Debt</span>
                        <span className="text-indigo-300 font-bold text-xs mt-0.5 block">
                          {formatCurrency(agg.totalDebt, { compact: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: CREDIT & LIQUIDITY HEALTH */}
        {activeTab === 'CREDIT_RISK' && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-amber-400 uppercase tracking-wider border-b border-slate-850 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                <span>Credit Transition & Liquidity Health Matrix</span>
              </div>
              <span className="text-[10px] text-slate-500 font-normal">Real-Time Risk</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block uppercase text-[9px]">Margin Utilization</span>
                <span className={`text-sm font-bold mt-0.5 block ${state.portfolio.marginUtilizationPct > 80 ? 'text-rose-400' : 'text-white'}`}>
                  {state.portfolio.marginUtilizationPct.toFixed(1)}%
                </span>
                <span className="text-[9px] text-slate-500">Maint: {formatCurrency(state.portfolio.maintenanceMarginUSD, { compact: true })}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block uppercase text-[9px]">Portfolio Net DV01</span>
                <span className="text-sm font-bold text-cyan-300 mt-0.5 block">
                  {formatCurrency(state.portfolio.netDV01USD, { showSign: true, compact: true })}
                </span>
                <span className="text-[9px] text-slate-500">Per 1 bp shift</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block uppercase text-[9px]">Portfolio Delta</span>
                <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                  {formatCurrency(state.portfolio.netDeltaUSD, { showSign: true, compact: true })}
                </span>
                <span className="text-[9px] text-slate-500">Net equity sensitivity</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-slate-500 block uppercase text-[9px]">Defaulted Issuers</span>
                <span className="text-sm font-bold text-rose-400 mt-0.5 block">
                  {state.companies.filter((c) => c.isDefaulted).length} / 200
                </span>
                <span className="text-[9px] text-slate-500">Senior recovery: ~40%</span>
              </div>
            </div>

            {/* Issuer Rating Breakdown */}
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-300 uppercase block">Issuer Credit Rating Distribution</span>
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                {(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'] as const).map((r) => {
                  const count = state.companies.filter((c) => c.creditRating === r).length;
                  return (
                    <div key={r} className="px-2 py-1 rounded bg-slate-950 border border-slate-800 flex items-center gap-1">
                      <span className="text-slate-400 font-bold">{r}:</span>
                      <span className="text-white font-bold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LIVE STEP EXECUTION LOGS */}
        {activeTab === 'LOGS' && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-400 uppercase tracking-wider border-b border-slate-850 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                <span>Live Execution Step Stream ({state.diagnosticsLogs?.length || 0} Events)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-normal">Chronological Ledger</span>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {(state.diagnosticsLogs || []).slice(-20).reverse().map((log: any, idx: number) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.2 rounded font-bold ${
                        log.category === 'MACRO'
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : log.category === 'MICRO'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : log.category === 'CREDIT'
                          ? 'bg-rose-500/20 text-rose-300'
                          : log.category === 'EARNINGS'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-indigo-500/20 text-indigo-300'
                      }`}>
                        {log.category}
                      </span>
                      <span className="text-slate-400 font-bold">
                        {formatSimulationDate(log.week)}
                      </span>
                    </div>
                    <span className="text-slate-600 text-[9px]">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}</span>
                  </div>

                  <p className="text-slate-200 font-medium">{cleanLatexTokens(log.message)}</p>
                  {log.deltaText && (
                    <p className="text-[10px] text-slate-400 font-mono">{cleanLatexTokens(log.deltaText)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
