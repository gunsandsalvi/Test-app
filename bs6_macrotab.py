import sys

with open('src/components/MacroTab.tsx', 'r') as f:
    text = f.read()

old = """      {/* Regional Climate / Weather Impact Card */}"""

new = """      {/* Banking Sector Snapshot */}
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
      </div>

      {/* Regional Climate / Weather Impact Card */}"""

if old in text:
    text = text.replace(old, new)
    with open('src/components/MacroTab.tsx', 'w') as f:
        f.write(text)
    print("Added Banking Sector Snapshot to MacroTab.tsx")
else:
    print("Not found")

