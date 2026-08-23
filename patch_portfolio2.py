import sys

with open('src/components/PortfolioRiskTab.tsx', 'r') as f:
    text = f.read()

target = """    <div className="space-y-3 pb-20">
      {/* Mini Performance Trajectory & Benchmark Chart */}"""

replacement = """    <div className="space-y-3 pb-20">
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

      {/* Mini Performance Trajectory & Benchmark Chart */}"""

if target in text:
    text = text.replace(target, replacement)
    with open('src/components/PortfolioRiskTab.tsx', 'w') as f:
        f.write(text)
    print("Success")
else:
    print("Failed to find target")

