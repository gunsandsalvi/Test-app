import sys

with open('src/components/BondsCdsTab.tsx', 'r') as f:
    text = f.read()

import_str = "import { CreditConditionsMeter } from './charts/Charts';\n"
text = text.replace("import { GameState, Company, RegionId } from '../types';", "import { GameState, Company, RegionId } from '../types';\n" + import_str)

target = """      {/* Credit Overview Header */}
      <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
        <span>{filteredCompanies.length} Credit Names</span>
        <span>Senior 1st Lien Recovery: 65% • Unsecured Bond: 40%</span>
      </div>"""

replacement = """      {/* Credit Market Overview & Conditions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Corporate Credit Conditions</h3>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span>{filteredCompanies.length} Credit Names</span>
            <span>Avg Rec: 40%</span>
          </div>
        </div>
        <CreditConditionsMeter index={state.regions[selectedRegion]?.bankingSector?.creditConditionsIndex || 0} width={120} />
      </div>"""

if target in text:
    text = text.replace(target, replacement)
    
with open('src/components/BondsCdsTab.tsx', 'w') as f:
    f.write(text)
