import sys
import re

with open('src/components/MacroTab.tsx', 'r') as f:
    text = f.read()

# I will find the Yield Curve section and replace it entirely.
start_idx = text.find('{/* Yield Curve & Benchmark Rates */}')
end_idx = text.find('{/* Sovereign Bonds List */}')

if start_idx != -1 and end_idx != -1:
    new_yield_section = """{/* Yield Curve & Benchmark Rates */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Sovereign Yield Curve</h3>
          </div>
          
          <div className="flex justify-center bg-slate-950 p-4 rounded-xl border border-slate-800">
            <YieldCurveChart params={region.yieldCurveParams} width={300} height={100} />
          </div>
          
          {/* Below we have the Benchmarks Grid */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/60 flex items-center justify-between cursor-pointer hover:border-blue-500/50 transition-colors"
                 onClick={() => onOpenTrade({ assetType: 'IRS', id: `${selectedRegionId}_IRS_Policy`, symbol: `${selectedRegionId} OIS`, name: `${region.name} Overnight Index Swap`, region: selectedRegionId, price: region.policyRate, quoteUnit: '% par rate', details: { tenorYears: 0.25, couponRate: region.policyRate, referenceBenchmark: `${region.currency} Policy Rate` } })}>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Policy Rate</span>
                <span className="text-[9px] text-slate-600">Neutral: {formatPercent(region.neutralRate, { isDecimal: true })}</span>
              </div>
              <span className="text-sm font-black font-mono text-white">{formatPercent(region.policyRate, { isDecimal: true })}</span>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/60 flex flex-col justify-center">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Taylor Gap</span>
              <div className="flex items-end justify-between">
                <span className={`text-sm font-black font-mono ${taylorGapBps > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {taylorGapBps > 0 ? '+' : ''}{taylorGapBps} bps
                </span>
                <span className="text-[9px] text-slate-600">to {formatPercent(taylorTarget, { isDecimal: true })}</span>
              </div>
            </div>
          </div>
        </div>

        """
    text = text[:start_idx] + new_yield_section + text[end_idx:]

with open('src/components/MacroTab.tsx', 'w') as f:
    f.write(text)
