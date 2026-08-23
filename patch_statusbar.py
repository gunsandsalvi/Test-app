import sys

with open('src/App.tsx', 'r') as f:
    text = f.read()

# Add states for StatusBar
if 'const [isStatusBarExpanded, setIsStatusBarExpanded]' not in text:
    text = text.replace('const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);',
                        'const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);\n  const [isStatusBarExpanded, setIsStatusBarExpanded] = useState(false);\n  const [isOverflowOpen, setIsOverflowOpen] = useState(false);')

# Replace TopStatusBar and PortfolioKpiStrip with StatusBar
text = text.replace("import { TopStatusBar } from './components/TopStatusBar';", "import { StatusBar } from './components/StatusBar';\nimport { OverflowMenu } from './components/OverflowMenu';")
text = text.replace("import { PortfolioKpiStrip } from './components/PortfolioKpiStrip';\n", "")

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

new_bar = """        {/* Expandable Status Bar */}
        <StatusBar
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

if old_bar in text:
    text = text.replace(old_bar, new_bar)
else:
    print("could not find old bar")

with open('src/App.tsx', 'w') as f:
    f.write(text)

