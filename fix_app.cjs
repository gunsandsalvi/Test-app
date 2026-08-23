const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');

// Replace nav
const navRegex = /<nav className="flex items-center justify-between gap-1 p-2 bg-slate-900 border-b border-slate-800 text-\[10px\] font-bold uppercase tracking-wider shrink-0 overflow-x-auto no-scrollbar">[\s\S]*?<\/nav>/;

const newNav = `<nav className="flex items-center justify-start gap-1 p-2 bg-slate-900 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider shrink-0 overflow-x-auto no-scrollbar">
          <button
            id="nav-tab-macro"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'macro' }))}
            className={\`flex-none min-w-[70px] py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 \${
              state.selectedTab === 'macro'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }\`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Macro</span>
          </button>
          
          <button
            id="nav-tab-indices"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'indices' }))}
            className={\`flex-none min-w-[70px] py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 \${
              state.selectedTab === 'indices'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }\`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Indices</span>
          </button>
          
          <button
            id="nav-tab-equities"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'equities' }))}
            className={\`flex-none min-w-[70px] py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 \${
              state.selectedTab === 'equities'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }\`}
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>Equities</span>
          </button>
          
          <button
            id="nav-tab-commodities"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'commodities' }))}
            className={\`flex-none min-w-[90px] py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 \${
              state.selectedTab === 'commodities'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }\`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Commodities</span>
          </button>
          
          <button
            id="nav-tab-bonds_cds"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'bonds_cds' }))}
            className={\`flex-none min-w-[90px] py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 \${
              state.selectedTab === 'bonds_cds'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }\`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Credit/Bonds</span>
          </button>
          
          <button
            id="nav-tab-derivatives"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'derivatives' }))}
            className={\`flex-none min-w-[90px] py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 \${
              state.selectedTab === 'derivatives'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }\`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Derivatives</span>
          </button>
          
          <button
            id="nav-tab-risk"
            onClick={() => setState((prev) => ({ ...prev, selectedTab: 'risk' }))}
            className={\`flex-none min-w-[70px] py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 \${
              state.selectedTab === 'risk'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }\`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Risk ({state.portfolio.positions.length})</span>
          </button>
        </nav>`;

app = app.replace(navRegex, newNav);

// Replace main content
const mainRegex = /<main className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth no-scrollbar">[\s\S]*?<\/main>/;

const newMain = `<main className="flex-1 overflow-y-auto p-3 space-y-3 scroll-smooth no-scrollbar pb-24">
          {state.selectedTab === 'macro' && (
            <MacroTab
              state={state}
              onOpenTrade={handleOpenTrade}
              onOpenChart={(chartData) => setActiveChartData(chartData)}
            />
          )}
          {state.selectedTab === 'indices' && (
            <IndicesTab state={state} onOpenTrade={handleOpenTrade} onOpenChart={(chartData) => setActiveChartData(chartData)} />
          )}
          {state.selectedTab === 'equities' && (
            <EquitiesTab state={state} onOpenTrade={handleOpenTrade} onSelectCompany={(c) => setSelectedCompany(c)} onOpenChart={(chartData) => setActiveChartData(chartData)} />
          )}
          {state.selectedTab === 'commodities' && (
            <CommoditiesTab state={state} onOpenTrade={handleOpenTrade} onOpenChart={(chartData) => setActiveChartData(chartData)} />
          )}
          {state.selectedTab === 'bonds_cds' && (
            <BondsCdsTab state={state} onOpenTrade={handleOpenTrade} onSelectCompany={(c) => setSelectedCompany(c)} onOpenChart={(chartData) => setActiveChartData(chartData)} />
          )}
          {state.selectedTab === 'derivatives' && (
            <DerivativesTab state={state} onOpenTrade={handleOpenTrade} onOpenChart={(chartData) => setActiveChartData(chartData)} />
          )}
          {state.selectedTab === 'risk' && (
            <div className="flex flex-col gap-3">
              <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
                <button
                  onClick={() => setRiskView('portfolio')}
                  className={\`flex-1 py-1 text-xs font-bold rounded transition-all \${
                    riskView === 'portfolio' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }\`}
                >
                  Portfolio Risk
                </button>
                <button
                  onClick={() => setRiskView('intel')}
                  className={\`flex-1 py-1 text-xs font-bold rounded transition-all \${
                    riskView === 'intel' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }\`}
                >
                  Corporate Intel
                </button>
              </div>
              {riskView === 'portfolio' ? (
                <PortfolioRiskTab state={state} onClosePosition={handleClosePosition} />
              ) : (
                <CorporateIntelligenceTab state={state} />
              )}
            </div>
          )}
        </main>`;

app = app.replace(mainRegex, newMain);

fs.writeFileSync('src/App.tsx', app);
