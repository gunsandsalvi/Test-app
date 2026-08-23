import sys

with open('src/App.tsx', 'r') as f:
    text = f.read()

# Add riskView state
if 'const [riskView, setRiskView]' not in text:
    s = text.find('const [isOverflowOpen, setIsOverflowOpen] = useState(false);')
    if s != -1:
        e = text.find('\n', s)
        text = text[:e+1] + "  const [riskView, setRiskView] = useState<'portfolio' | 'intel'>('portfolio');\n" + text[e+1:]

# Import CorporateIntelligenceTab
import_str = "import { CorporateIntelligenceTab } from './components/CorporateIntelligenceTab';\n"
if "CorporateIntelligenceTab" not in text:
    s = text.find("import { PortfolioRiskTab } from './components/PortfolioRiskTab';")
    if s != -1:
        e = text.find('\n', s)
        text = text[:e+1] + import_str + text[e+1:]

# Replace risk tab render
old_risk = """          {state.selectedTab === 'risk' && (
            <PortfolioRiskTab state={state} onClosePosition={handleClosePosition} />
          )}"""

new_risk = """          {state.selectedTab === 'risk' && (
            <div className="flex flex-col gap-3">
              <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
                <button
                  onClick={() => setRiskView('portfolio')}
                  className={`flex-1 py-1 text-xs font-bold rounded transition-all ${
                    riskView === 'portfolio' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Portfolio Risk
                </button>
                <button
                  onClick={() => setRiskView('intel')}
                  className={`flex-1 py-1 text-xs font-bold rounded transition-all ${
                    riskView === 'intel' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
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
          )}"""

if old_risk in text:
    text = text.replace(old_risk, new_risk)

with open('src/App.tsx', 'w') as f:
    f.write(text)

