import sys
with open('src/components/BondsCdsTab.tsx', 'r') as f:
    text = f.read()

old_tabs = """
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-bold text-center">
        <button
          onClick={() => setViewMode('CDS')}
          className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
            viewMode === 'CDS'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>CDS Swaps</span>
        </button>
        <button
          onClick={() => setViewMode('CASH_DEBT')}
          className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
            viewMode === 'CASH_DEBT'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Percent className="w-3.5 h-3.5" />
          <span>Senior Bonds</span>
        </button>
        <button
          onClick={() => setViewMode('LEVERAGED_LOANS')}
          className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
            viewMode === 'LEVERAGED_LOANS'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>1st Lien Loans</span>
        </button>
      </div>
"""

new_tabs = """
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-bold text-center">
        <button
          onClick={() => setViewMode('CDS')}
          className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
            viewMode === 'CDS'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>CDS Swaps</span>
        </button>
        <button
          onClick={() => setViewMode('CASH_DEBT')}
          className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
            viewMode === 'CASH_DEBT'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Cash Debt (Tranches)</span>
        </button>
      </div>
"""

text = text.replace(old_tabs.strip(), new_tabs.strip())
with open('src/components/BondsCdsTab.tsx', 'w') as f:
    f.write(text)
