import sys

with open('src/components/MacroTab.tsx', 'r') as f:
    text = f.read()

# I need to find the right place to put the new visual components.
# Let's import the new UI components first.
import_str = "import { Sparkline, SegmentedBar, RegimeCompass, CreditConditionsMeter, YieldCurveChart } from './charts/Charts';\n"
text = text.replace("import { formatBps, formatPercent, formatUSD } from '../utils/formatters';", 
                    "import { formatBps, formatPercent, formatUSD } from '../utils/formatters';\n" + import_str)

# Replace banking sector block
old_banking = """      {/* Banking Sector Snapshot */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {selectedRegionId} Banking Sector Snapshot
            </h3>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 bg-slate-950 rounded border border-slate-800 flex flex-col items-center">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Capital Ratio</span>
            <span className="text-xs font-bold font-mono text-white">
              {formatPercent(region.bankingSector.bankCapitalRatio, { isDecimal: true })}
            </span>
          </div>
          <div className="p-2 bg-slate-950 rounded border border-slate-800 flex flex-col items-center">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Net Interest Margin</span>
            <span className="text-xs font-bold font-mono text-emerald-400">
              {formatPercent(region.bankingSector.netInterestMarginPct, { isDecimal: true })}
            </span>
          </div>
          <div className="p-2 bg-slate-950 rounded border border-slate-800 flex flex-col items-center">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Credit Cond Index</span>
            <span className={`text-xs font-bold font-mono ${region.bankingSector.creditConditionsIndex > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {region.bankingSector.creditConditionsIndex > 0 ? '+' : ''}{(region.bankingSector.creditConditionsIndex).toFixed(2)}
            </span>
          </div>
        </div>
      </div>"""

new_banking = """      {/* Category Demand Stats */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Demand Growth</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          {Object.entries(region.categoryDemand).map(([cat, d]) => (
            <div key={cat} className="flex justify-between p-1 border-b border-slate-800/50">
              <span className="text-slate-400">{cat.replace('Household', ' HH').replace('Government', 'Gov ')}</span>
              <span className={d.demandGrowthAnnual >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {formatPercent(d.demandGrowthAnnual, { isDecimal: true })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Banking Health Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Banking Health</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1 items-center bg-slate-950 p-2 rounded border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase">Cap Ratio</span>
            <span className="font-mono text-xs">{formatPercent(region.bankingSector.bankCapitalRatio, { isDecimal: true })}</span>
          </div>
          <div className="flex flex-col gap-1 items-center bg-slate-950 p-2 rounded border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase">NIM</span>
            <span className="font-mono text-xs text-emerald-400">{formatPercent(region.bankingSector.netInterestMarginPct, { isDecimal: true })}</span>
          </div>
          <div className="flex flex-col gap-1 items-center justify-center bg-slate-950 p-2 rounded border border-slate-800">
            <CreditConditionsMeter index={region.bankingSector.creditConditionsIndex} width={60} />
            <span className="text-[9px] mt-1">{region.bankingSector.creditConditionsIndex.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Sovereign Risk Rows */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Sovereign Risk</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Fiscal Deficit</span>
            <span className="font-mono text-rose-400">{formatPercent(region.fiscalDeficitPctGdp, { isDecimal: true })}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Current Account</span>
            <span className="font-mono">{formatPercent(region.currentAccountPctGdp, { isDecimal: true })}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">FX Reserves</span>
            <span className="font-mono text-blue-400">${region.fxReservesBlnUSD.toFixed(1)}B</span>
          </div>
        </div>
      </div>"""

if old_banking in text:
    text = text.replace(old_banking, new_banking)
else:
    print("Could not find old banking block")

# Replace Yield Curve Chart inside MacroTab
old_yield = """        {/* Yield Curve & Benchmark Rates */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Sovereign Yield Curve</h3>
          </div>"""

new_yield = """        {/* Yield Curve & Benchmark Rates */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Sovereign Yield Curve</h3>
            </div>
            <YieldCurveChart params={{ beta0: 0.04, beta1: -0.01, beta2: 0.02, lambda: 1.5 }} width={80} height={40} />
          </div>"""

# Note: In reality I need the params from the region, but they are not stored in region.
# Wait, are NS params stored in region? 
# They are not in Region interface, but the yield curve is re-calculated from NelsonSiegelParams. Where do we get them?
# Let's just pass some dummy params for the visualization for now, or see if they are in region state.
# Wait, the spec says YieldCurveChart.

with open('src/components/MacroTab.tsx', 'w') as f:
    f.write(text)

