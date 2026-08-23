import sys
import re

with open('src/App.tsx', 'r') as f:
    text = f.read()

# Replace TopStatusBar and PortfolioKpiStrip with StatusBar
text = text.replace("import { TopStatusBar } from './components/TopStatusBar';", "import { StatusBar } from './components/StatusBar';\nimport { OverflowMenu } from './components/OverflowMenu';")
text = text.replace("import { PortfolioKpiStrip } from './components/PortfolioKpiStrip';\n", "")

# Add states for StatusBar
if 'const [isStatusBarExpanded, setIsStatusBarExpanded]' not in text:
    text = text.replace('const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);',
                        'const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);\n  const [isStatusBarExpanded, setIsStatusBarExpanded] = useState(false);\n  const [isOverflowOpen, setIsOverflowOpen] = useState(false);')

# Replace the TopStatusBar and PortfolioKpiStrip block in App.tsx render
old_bar = """        {/* Top Status Bar */}
        <TopStatusBar
          state={state}
          onAdvanceWeek={handleAdvanceWeek}
          isAutoAdvancing={isAutoAdvancing}
          onToggleAutoAdvance={() => setIsAutoAdvancing(!isAutoAdvancing)}
          onOpenManual={() => setShowManual(true)}
          onOpenDiagnostics={() => setShowDiagnostics(true)}
        />

        {/* Sticky Portfolio KPI Strip */}
        <PortfolioKpiStrip
          state={state}
          onOpenPortfolioTab={() => setState((prev) => ({ ...prev, selectedTab: 'portfolio' }))}
        />"""

new_bar = """        <StatusBar
          state={state}
          isExpanded={isStatusBarExpanded}
          onToggleExpanded={() => setIsStatusBarExpanded(p => !p)}
          onAdvanceWeek={handleAdvanceWeek}
          isAutoAdvancing={isAutoAdvancing}
          onToggleAutoAdvance={() => setIsAutoAdvancing(!isAutoAdvancing)}
          onOpenOverflow={() => setIsOverflowOpen(true)}
        />
        {isOverflowOpen && (
          <OverflowMenu
            state={state}
            onClose={() => setIsOverflowOpen(false)}
            onRestart={handleResetGame}
          />
        )}"""

text = text.replace(old_bar, new_bar)

# Refactor the Navigation Tab Bar
old_nav = """        <nav className="flex items-center justify-between gap-1 p-2 bg-slate-900 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider shrink-0 overflow-x-auto no-scrollbar">"""

new_nav_full = """        <nav className="flex items-center justify-between gap-1 p-2 bg-slate-900 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider shrink-0 overflow-x-auto no-scrollbar">
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

nav_start = text.find('<nav className="flex items-center')
nav_end = text.find('</nav>', nav_start) + 6
text = text[:nav_start] + new_nav_full + text[nav_end:]


# Refactor tab contents
old_main = """        {/* Scrollable Tab Content View */}"""
main_start = text.find(old_main)
main_end = text.find('        {/* Expandable News Ticker Drawer */}')

new_main = """        {/* Scrollable Tab Content View */}
        <main className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth no-scrollbar">
          {state.selectedTab === 'macro' && (
            <MacroTab
              state={state}
              onOpenTrade={handleOpenTrade}
              onOpenChart={(c) => setActiveChartData(c)}
            />
          )}
          {state.selectedTab === 'markets' && (
            <div className="flex flex-col gap-4">
              <EquitiesTab state={state} onOpenTrade={handleOpenTrade} onSelectCompany={(c) => setSelectedCompany(c)} onOpenChart={(c) => setActiveChartData(c)} />
              <BondsCdsTab state={state} onOpenTrade={handleOpenTrade} onSelectCompany={(c) => setSelectedCompany(c)} onOpenChart={(c) => setActiveChartData(c)} />
            </div>
          )}
          {state.selectedTab === 'credit' && (
            <div className="flex flex-col gap-4 p-4 items-center justify-center text-slate-500 h-64 text-sm font-medium">
              Credit dashboard coming soon.
            </div>
          )}
          {state.selectedTab === 'risk' && (
            <PortfolioRiskTab state={state} onClosePosition={handleClosePosition} />
          )}
        </main>
"""

text = text[:main_start] + new_main + text[main_end:]

with open('src/App.tsx', 'w') as f:
    f.write(text)

