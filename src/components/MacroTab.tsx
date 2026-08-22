import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Calendar,
  Compass,
  DollarSign,
  Globe,
  Landmark,
  Layers,
  LineChart,
  Percent,
  Shield,
  Sliders,
  Sun,
  TrendingDown,
  TrendingUp,
  Wind,
  Zap,
} from 'lucide-react';
import { Commodity, FxPair, GameState, RegionId, TradeableInstrument } from '../types';
import { calculateNelsonSiegelZeroRate } from '../engine/nelsonSiegel';
import { formatBps, formatCurrency, formatPercent } from '../engine/formatters';

interface MacroTabProps {
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

export const MacroTab: React.FC<MacroTabProps> = ({ state, onOpenTrade, onOpenChart }) => {
  const [selectedRegionId, setSelectedRegionId] = useState<RegionId>('USA');
  const [showHistoryCurves, setShowHistoryCurves] = useState<boolean>(true);
  const region = state.regions[selectedRegionId];

  const tenors = [
    { label: '3M', years: 0.25, rate: region.zeroRates.tenor3M, duration: 0.25, pbLev: 50 },
    { label: '2Y', years: 2.0, rate: region.zeroRates.tenor2Y, duration: 1.9, pbLev: 40 },
    { label: '5Y', years: 5.0, rate: region.zeroRates.tenor5Y, duration: 4.5, pbLev: 30 },
    { label: '10Y', years: 10.0, rate: region.zeroRates.tenor10Y, duration: 8.6, pbLev: 20 },
    { label: '30Y', years: 30.0, rate: region.zeroRates.tenor30Y, duration: 18.2, pbLev: 15 },
  ];

  // Taylor rule calculation
  const taylorTarget =
    region.neutralRate +
    region.inflation +
    0.5 * (region.inflation - region.targetInflation) +
    0.5 * (region.gdpGrowth - region.potentialGdpGrowth);
  const taylorGapBps = Math.round((taylorTarget - region.policyRate) * 10000);

  // Nelson-Siegel curve points for visual SVG curve
  const curvePoints: { x: number; y: number; t: number; rate: number }[] = [];
  const minRate = 0.0;
  const maxRate = 0.07;
  const svgWidth = 320;
  const svgHeight = 110;
  const padding = 16;

  for (let i = 0; i <= 30; i += 1) {
    const t = i === 0 ? 0.25 : i;
    const rate = calculateNelsonSiegelZeroRate(t, region.yieldCurveParams);
    const x = padding + (i / 30) * (svgWidth - padding * 2);
    const y = svgHeight - padding - ((rate - minRate) / (maxRate - minRate)) * (svgHeight - padding * 2);
    curvePoints.push({ x, y, t, rate });
  }

  const svgPathData = curvePoints.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  // Multi-Region Policy Rate Comparison
  const regionsList: RegionId[] = ['USA', 'UK', 'EUR', 'JPN'];

  return (
    <div className="space-y-4 pb-20">
      {/* Region Selector Pills */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto no-scrollbar">
        {regionsList.map((rId) => {
          const reg = state.regions[rId];
          const isSelected = selectedRegionId === rId;
          return (
            <button
              key={rId}
              onClick={() => setSelectedRegionId(rId)}
              className={`flex-1 min-w-[76px] py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>{reg.symbol}</span>
              <span>{rId}</span>
            </button>
          );
        })}
      </div>

      {/* Sovereign Hub Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white leading-tight font-mono">
                  {region.name} Sovereign Profile
                </h2>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-emerald-300 font-mono font-bold border border-slate-700">
                  {region.sovereignRating || 'AAA'} Stable
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border ${region.cycleRegime === 'Expansion' ? 'bg-emerald-900/50 text-emerald-400 border-emerald-800' : region.cycleRegime === 'Recession' ? 'bg-red-900/50 text-red-400 border-red-800' : 'bg-amber-900/50 text-amber-400 border-amber-800'}`}>
                  {region.cycleRegime}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{region.centralBank} • {region.currency}</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-lg font-extrabold font-mono text-white">
              {formatPercent(region.policyRate, { isDecimal: true })}
            </div>
            <div className="text-[9px] text-slate-400 uppercase font-medium">Policy Rate</div>
          </div>
        </div>

        {/* Institutional Sovereign Debt Profile */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-850">
            <span className="text-[9px] text-slate-400 uppercase font-mono block">Debt-to-GDP</span>
            <span className="text-xs font-bold font-mono text-white">
              {formatPercent(region.debtToGdpPct || 1.15, { isDecimal: true })}
            </span>
            <span className="text-[8px] text-slate-500 block">Sovereign Leverage</span>
          </div>

          <div className="p-2 rounded-xl bg-slate-950 border border-slate-850">
            <span className="text-[9px] text-slate-400 uppercase font-mono block">Fiscal Deficit / GDP</span>
            <span
              className={`text-xs font-bold font-mono ${
                region.fiscalDeficitPctGdp > 0.06 ? 'text-amber-400' : 'text-slate-200'
              }`}
            >
              {formatPercent(region.fiscalDeficitPctGdp, { isDecimal: true })}
            </span>
            {region.fiscalDeficitPctGdp > 0.06 ? (
              <span className="text-[8px] text-amber-400 font-bold block">Warning: &gt;6% Deficit</span>
            ) : (
              <span className="text-[8px] text-slate-500 block">Fiscal Rule Compliant</span>
            )}
          </div>

          <div className="p-2 rounded-xl bg-slate-950 border border-slate-850">
            <span className="text-[9px] text-slate-400 uppercase font-mono block">Current Account</span>
            <span className="text-xs font-bold font-mono text-emerald-400">
              {formatCurrency(region.tradeBalance, { compact: true })}
            </span>
            <span className="text-[8px] text-slate-500 block">Net External Flow</span>
          </div>

          <div className="p-2 rounded-xl bg-slate-950 border border-slate-850">
            <span className="text-[9px] text-slate-400 uppercase font-mono block">Labor Market & Wage</span>
            <span className="text-xs font-bold font-mono text-cyan-300">
              {formatPercent(region.wageGrowth || 0.038, { isDecimal: true })}
            </span>
            <span className="text-[8px] text-slate-500 block">
              U: {formatPercent(region.unemploymentRate, { isDecimal: true })}
            </span>
          </div>
        </div>

        {/* Macro KPI Grid with Chart Triggers */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-center">
          <div
            onClick={() =>
              onOpenChart?.({
                id: `${selectedRegionId}_CPI`,
                title: `${region.name} Headline & Core CPI Inflation`,
                subtitle: `Target: ${(region.targetInflation * 100).toFixed(1)}%`,
                currentValue: region.inflation * 100,
                unit: '%',
                historicalSeries: region.historicalInflation.map((i) => i * 100),
              })
            }
            className="bg-slate-950/80 hover:bg-slate-800/80 p-2.5 rounded-xl border border-slate-850 cursor-pointer transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-400 font-medium">Inflation ($\pi$)</span>
              <BarChart2 className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 transition-colors" />
            </div>
            <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">
              {formatPercent(region.inflation, { isDecimal: true })}
            </div>
            <div className="text-[8px] text-slate-500">Core: {formatPercent(region.coreInflation || region.inflation * 0.9, { isDecimal: true })}</div>
          </div>

          <div
            onClick={() =>
              onOpenChart?.({
                id: `${selectedRegionId}_GDP`,
                title: `${region.name} Real GDP Growth Trajectory`,
                subtitle: `Potential Growth: ${(region.potentialGdpGrowth * 100).toFixed(1)}%`,
                currentValue: region.gdpGrowth * 100,
                unit: '%',
                historicalSeries: region.historicalGdpGrowth.map((g) => g * 100),
              })
            }
            className="bg-slate-950/80 hover:bg-slate-800/80 p-2.5 rounded-xl border border-slate-850 cursor-pointer transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-400 font-medium">GDP Growth ($y$)</span>
              <BarChart2 className="w-3 h-3 text-slate-500 group-hover:text-emerald-400 transition-colors" />
            </div>
            <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
              {formatPercent(region.gdpGrowth, { isDecimal: true, showSign: true })}
            </div>
            <div className="text-[8px] text-slate-500">Pot: {formatPercent(region.potentialGdpGrowth, { isDecimal: true })}</div>
          </div>

          <div
            onClick={() =>
              onOpenChart?.({
                id: `${selectedRegionId}_RATE`,
                title: `${region.name} Policy Discount Rate Series`,
                subtitle: `${region.centralBank} Benchmark Target`,
                currentValue: region.policyRate * 100,
                unit: '%',
                historicalSeries: region.historicalPolicyRates.map((r) => r * 100),
              })
            }
            className="bg-slate-950/80 hover:bg-slate-800/80 p-2.5 rounded-xl border border-slate-850 cursor-pointer transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-400 font-medium">Policy Rate</span>
              <BarChart2 className="w-3 h-3 text-slate-500 group-hover:text-purple-400 transition-colors" />
            </div>
            <div className="text-sm font-bold font-mono text-purple-300 mt-0.5">
              {formatPercent(region.policyRate, { isDecimal: true })}
            </div>
            <div className="text-[8px] text-slate-500">Neutral: {formatPercent(region.neutralRate, { isDecimal: true })}</div>
          </div>
        </div>

        {/* Household & Consumer Sector Strip */}
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Household & Consumer Sector
            </h3>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
            <div className="p-2 rounded-xl bg-slate-950 border border-slate-850">
              <span className="text-[9px] text-slate-400 block font-mono">Consumer Sent.</span>
              <div className="text-xs font-bold text-white font-mono mt-1">
                {region.householdState?.consumerConfidence.toFixed(1) || '100.0'}
              </div>
              <span className="text-[8px] text-slate-500 block">Baseline 100</span>
            </div>

            <div className="p-2 rounded-xl bg-slate-950 border border-slate-850">
              <span className="text-[9px] text-slate-400 block font-mono">Wage Grw YoY</span>
              <div className="text-xs font-bold text-cyan-300 font-mono mt-1">
                {formatPercent(region.householdState?.wageGrowth || 0, { isDecimal: true, showSign: true })}
              </div>
              <span className="text-[8px] text-slate-500 block">Avg Hr Earnings</span>
            </div>

            <div className="p-2 rounded-xl bg-slate-950 border border-slate-850">
              <span className="text-[9px] text-slate-400 block font-mono">Savings Rate</span>
              <div className="text-xs font-bold text-amber-300 font-mono mt-1">
                {formatPercent(region.householdState?.savingsRate || 0, { isDecimal: true })}
              </div>
              <span className="text-[8px] text-slate-500 block">Pers. Savings %</span>
            </div>

            <div className="p-2 rounded-xl bg-slate-950 border border-slate-850">
              <span className="text-[9px] text-slate-400 block font-mono">Real Rtl Sales</span>
              <div className="text-xs font-bold text-emerald-400 font-mono mt-1">
                {formatPercent(region.householdState?.realConsumptionGrowth || 0, { isDecimal: true, showSign: true })}
              </div>
              <span className="text-[8px] text-slate-500 block">Consumpt YoY</span>
            </div>
          </div>
        </div>
      </div>

      {/* Central Bank Taylor Rule & Dot Plot Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Taylor Rule & Dot Plot Target Projections</h3>
          </div>
          <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
            taylorGapBps > 0 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
          }`}>
            Gap: {formatBps(taylorGapBps, { showSign: true })}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-850 text-center">
            <div className="text-[9px] text-slate-400 font-medium">Taylor Rule Target</div>
            <div className="text-sm font-extrabold font-mono text-indigo-300 mt-0.5">
              {formatPercent(taylorTarget, { isDecimal: true })}
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">$r^* + \pi + 0.5(\pi-\pi^*) + 0.5(y-y^*)$</div>
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-850 text-center">
            <div className="text-[9px] text-slate-400 font-medium">Dot Plot 1Y Proj</div>
            <div className="text-sm font-extrabold font-mono text-white mt-0.5">
              {formatPercent(region.dotPlot1Y, { isDecimal: true })}
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">1-Year Terminal Target</div>
          </div>

          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-850 text-center">
            <div className="text-[9px] text-slate-400 font-medium">Dot Plot 2Y Proj</div>
            <div className="text-sm font-extrabold font-mono text-white mt-0.5">
              {formatPercent(region.dotPlot2Y, { isDecimal: true })}
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">2-Year Terminal Target</div>
          </div>
        </div>
      </div>

      {/* Sovereign Nelson-Siegel Yield Curve Visualizer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {selectedRegionId} Sovereign Nelson-Siegel Yield Curve
            </h3>
          </div>
          <button
            onClick={() => setShowHistoryCurves(!showHistoryCurves)}
            className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
              showHistoryCurves ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {showHistoryCurves ? 'History Overlay ON' : 'History OFF'}
          </button>
        </div>

        {/* SVG Yield Curve Graph */}
        <div className="bg-slate-950 rounded-xl p-2.5 border border-slate-850">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-28 overflow-visible">
            {/* Grid lines */}
            <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="#334155" strokeWidth="1" />
            <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
            <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />

            {/* Historical Curve Overlay */}
            {showHistoryCurves && region.historicalZeroCurves.length > 1 && (
              <path
                d={curvePoints.map((pt, idx) => {
                  const histZero = region.historicalZeroCurves[0];
                  const t = pt.t;
                  const histRate = t <= 0.25 ? histZero.tenor3M : t <= 2 ? histZero.tenor2Y : t <= 5 ? histZero.tenor5Y : t <= 10 ? histZero.tenor10Y : histZero.tenor30Y;
                  const y = svgHeight - padding - ((histRate - minRate) / (maxRate - minRate)) * (svgHeight - padding * 2);
                  return `${idx === 0 ? 'M' : 'L'} ${pt.x} ${y}`;
                }).join(' ')}
                fill="none"
                stroke="#64748b"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.6"
              />
            )}

            {/* Current Nelson-Siegel Continuous Curve */}
            <path d={svgPathData} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />

            {/* Tenor Key Marker Dots */}
            {tenors.map((tenor) => {
              const x = padding + (tenor.years / 30) * (svgWidth - padding * 2);
              const y = svgHeight - padding - ((tenor.rate - minRate) / (maxRate - minRate)) * (svgHeight - padding * 2);
              return (
                <g key={tenor.label}>
                  <circle cx={x} cy={y} r="3.5" fill="#10b981" stroke="#0f172a" strokeWidth="1.5" />
                  <text x={x} y={y - 7} fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="monospace">
                    {(tenor.rate * 100).toFixed(2)}%
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Tenor labels row */}
          <div className="flex justify-between px-3 text-[9px] font-mono text-slate-400 mt-1 border-t border-slate-850 pt-1">
            <span>3M</span>
            <span>2Y</span>
            <span>5Y</span>
            <span>10Y</span>
            <span>30Y</span>
          </div>
        </div>
      </div>

      {/* Multi-Tenor Sovereign Bond Trading Desk (3M, 2Y, 5Y, 10Y, 30Y) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {selectedRegionId} Sovereign Multi-Tenor Bond Desk
            </h3>
          </div>
          <span className="text-[10px] text-slate-400">Institutional Full Curve Access</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {tenors.map((t) => (
            <div
              key={t.label}
              className="p-3 bg-slate-950 border border-slate-800 hover:border-emerald-500/40 rounded-xl transition-all flex flex-col justify-between space-y-2 group shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-xs text-white font-mono">
                      {selectedRegionId} {t.label} Bond
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 font-mono text-emerald-300">
                      {t.years}Y
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Dur: ~{t.duration}y • {t.pbLev}x PB Leverage
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-extrabold font-mono text-emerald-400">
                    {formatPercent(t.rate, { isDecimal: true })}
                  </div>
                  <span className="text-[9px] text-slate-500 uppercase block font-mono">Zero Yield</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={() =>
                    onOpenTrade({
                      assetType: 'SOV_BOND',
                      id: `${selectedRegionId}_SOV_${t.label}`,
                      symbol: `${selectedRegionId} ${t.label}`,
                      name: `${region.name} ${t.label} Sovereign Benchmark Bond`,
                      region: selectedRegionId,
                      price: 100.0,
                      quoteUnit: 'pts of par',
                      details: {
                        tenorYears: t.years,
                        couponRate: t.rate,
                      },
                    })
                  }
                  className="py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-[10px] font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>Trade Bond</span>
                </button>

                <button
                  onClick={() =>
                    onOpenTrade({
                      assetType: 'IRS',
                      id: `${selectedRegionId}_IRS_${t.label}`,
                      symbol: `${selectedRegionId} IRS ${t.label}`,
                      name: `${region.name} ${t.label} Interest Rate Swap`,
                      region: selectedRegionId,
                      price: t.rate,
                      quoteUnit: '% par rate',
                      details: {
                        tenorYears: t.years,
                        couponRate: t.rate,
                        referenceBenchmark: `${region.currency} Policy Rate`,
                      },
                    })
                  }
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold font-mono uppercase tracking-wider transition-all border border-slate-700 flex items-center justify-center gap-1"
                >
                  <span>Swap</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cross-Currency Basis Swaps & Derivatives */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {selectedRegionId} Cross-Currency Basis Swaps (XCS)
            </h3>
          </div>
          <span className="text-[10px] text-slate-400">Interbank FX Liquidity</span>
        </div>

        <div className="space-y-2">
          {state.fxPairs
            .filter((fx) => fx.base === selectedRegionId || fx.quote === selectedRegionId)
            .map((fx) => (
              <div
                key={fx.pair}
                onClick={() =>
                  onOpenTrade({
                    assetType: 'XCS',
                    id: `XCS_${fx.pair}`,
                    symbol: fx.pair,
                    name: `${fx.pair} Cross-Currency Basis Swap (5Y)`,
                    region: selectedRegionId,
                    price: fx.basisSpreadBps,
                    quoteUnit: 'bps basis spread',
                    details: {
                      tenorYears: 5,
                      baseCurrency: fx.base,
                      quoteCurrency: fx.quote,
                    },
                  })
                }
                className="p-3 bg-slate-950/80 hover:bg-slate-850 border border-slate-800 rounded-xl cursor-pointer transition-all flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-white">{fx.pair} Basis Swap</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                      {formatBps(fx.basisSpreadBps)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Spot FX: {fx.rate} • 1W Δ: {fx.change1W > 0 ? `+${fx.change1W}` : fx.change1W}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold font-mono text-blue-400">Trade Basis</span>
                  <div className="text-[9px] text-slate-500">25x PB Lev</div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Regional Climate / Weather Impact Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Climate & Weather Anomaly Monitor</h3>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
            {region.weather.type} • {region.weather.severity}
          </span>
        </div>
        <p className="text-xs text-slate-300 font-medium">{region.weather.title}</p>
        <p className="text-[11px] text-slate-400 leading-relaxed">{region.weather.economicImpact}</p>
      </div>
    </div>
  );
};
