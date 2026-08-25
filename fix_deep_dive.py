import re
with open('src/components/company/CompanyDeepDive.tsx', 'r') as f:
    c = f.read()

target = """            {(() => {
              const contracts = reg?.activeContracts || [];"""

replacement = """            {company.concentrationRiskFlags && company.concentrationRiskFlags.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/20 p-2 rounded-lg text-orange-400 text-[11px] space-y-1 mb-3">
                <div className="font-bold uppercase text-[9px] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Concentration Risk Flag
                </div>
                {company.concentrationRiskFlags.map((flag, idx) => (
                  <div key={idx}>• {flag}</div>
                ))}
              </div>
            )}
            
            {(() => {
              const contracts = reg?.activeContracts || [];"""

c = c.replace(target, replacement)
with open('src/components/company/CompanyDeepDive.tsx', 'w') as f:
    f.write(c)

