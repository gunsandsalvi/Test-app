import sys

with open('src/components/PortfolioRiskTab.tsx', 'r') as f:
    text = f.read()

import_str = "import { Sparkline, SegmentedBar } from './charts/Charts';\n"
text = text.replace("import { formatUSD, formatPercent } from '../utils/formatters';", 
                    "import { formatCurrency, formatPercent } from '../engine/formatters';\n" + import_str)
# Wait, let's fix formatters if needed
text = text.replace("import { formatUSD, formatPercent } from '../utils/formatters';", "import { formatCurrency, formatPercent } from '../engine/formatters';\n" + import_str)
# Also change any formatUSD calls
text = text.replace("formatUSD(", "formatCurrency(")

# I will find a good place to insert the SegmentedBar.
target = """    <div className="space-y-4 pb-20">
      {/* 1. Header & KPI Cards */}"""

replacement = """    <div className="space-y-4 pb-20">
      {/* Asset Allocation Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Gross Asset Allocation</h3>
        <SegmentedBar 
          segments={[
            { value: portfolio.positions.filter(p => p.assetType === 'EQUITY').reduce((s,p) => s + p.notional, 0), color: '#3b82f6', label: 'Equities' },
            { value: portfolio.positions.filter(p => p.assetType === 'CORP_BOND' || p.assetType === 'SOV_BOND').reduce((s,p) => s + p.notional, 0), color: '#10b981', label: 'Bonds' },
            { value: portfolio.positions.filter(p => p.assetType === 'CDS').reduce((s,p) => s + p.notional, 0), color: '#f59e0b', label: 'CDS' },
            { value: portfolio.positions.filter(p => !['EQUITY','CORP_BOND','SOV_BOND','CDS'].includes(p.assetType)).reduce((s,p) => s + p.notional, 0), color: '#8b5cf6', label: 'Derivatives & Other' },
          ]} 
          height={16} 
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-medium">
          <span className="text-blue-400">Equities</span>
          <span className="text-emerald-400">Bonds</span>
          <span className="text-amber-400">CDS</span>
          <span className="text-purple-400">Other</span>
        </div>
      </div>

      {/* 1. Header & KPI Cards */}"""

if target in text:
    text = text.replace(target, replacement)
    
with open('src/components/PortfolioRiskTab.tsx', 'w') as f:
    f.write(text)

