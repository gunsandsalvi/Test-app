import sys

with open('src/App.tsx', 'r') as f:
    text = f.read()

nav_start = text.find('{/* Segmented Navigation Tab Bar */}')
nav_end = text.find('</nav>', nav_start) + 6

new_nav = """{/* Segmented Navigation Tab Bar */}
        <nav className="flex items-center justify-between gap-1 p-2 bg-slate-900 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider shrink-0 overflow-x-auto no-scrollbar">
          <button
            id="nav-tab-macro"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'macro' }))}
            className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              state.selectedTab === 'macro'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Macro</span>
          </button>
          
          <button
            id="nav-tab-markets"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'markets' }))}
            className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              state.selectedTab === 'markets'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Markets</span>
          </button>
          
          <button
            id="nav-tab-credit"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'credit' }))}
            className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              state.selectedTab === 'credit'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Credit</span>
          </button>
          
          <button
            id="nav-tab-risk"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'risk' }))}
            className={`flex-1 py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              state.selectedTab === 'risk'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Risk ({state.portfolio.positions.length})</span>
          </button>
        </nav>"""

if nav_start != -1:
    text = text[:nav_start] + new_nav + text[nav_end:]
    
with open('src/App.tsx', 'w') as f:
    f.write(text)

