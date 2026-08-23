import sys

with open('src/App.tsx', 'r') as f:
    text = f.read()

main_start = text.find('{/* Scrollable Tab Content View */}')
main_end = text.find('{/* Expandable News Ticker Drawer */}', main_start)

new_main = """{/* Scrollable Tab Content View */}
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

if main_start != -1 and main_end != -1:
    text = text[:main_start] + new_main + text[main_end:]
else:
    print("could not find main")

with open('src/App.tsx', 'w') as f:
    f.write(text)

