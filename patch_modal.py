import sys

with open('src/components/CompanyDetailModal.tsx', 'r') as f:
    text = f.read()

start_str = "            {/* 2. Senior Secured First Lien Leveraged Loan */}"
end_str = "            {/* 4. 5Y Credit Default Swap (CDS) */}"

start = text.find(start_str)
end = text.find(end_str)

replacement = """{/* Capital structure summary */}
            <CapitalStructureBar tranches={company.debtTranches || []} currentWeek={currentWeek} />

            {/* Debt Tranches — one row per real tranche */}
            {company.debtTranches?.map((tranche) => {
              const remainingTenorYears = Math.max(0.01, (tranche.maturityWeek - currentWeek) / 52);
              const isFixed = tranche.rateType === 'FIXED';
              const rateDesc = isFixed ? `${((tranche.couponRate ?? 0) * 100).toFixed(1)}% Fixed` : `Floating +${tranche.floatingMarginBps}bps`;
              return (
                <div
                  key={tranche.id}
                  onClick={() => {
                    onClose();
                    onOpenTrade({
                      assetType: isFixed ? 'CORP_BOND' : 'LEVERAGED_LOAN',
                      id: tranche.id, symbol: tranche.id,
                      name: `${company.name} ${remainingTenorYears.toFixed(1)}Y ${isFixed ? 'Senior Bond' : 'Loan'}`,
                      region: company.region,
                      price: company.isDefaulted ? (isFixed ? company.recoveryRate * 100 : 65.0) : 100,
                      quoteUnit: isFixed ? '% Par' : 'pts of par',
                      details: { trancheId: tranche.id, tenorYears: remainingTenorYears, fixedRate: tranche.couponRate ?? 0, rateType: tranche.rateType, oasSpreadBps: company.oasSpreadBps, rating: company.creditRating, sector: company.sector },
                    });
                  }}
                  className="p-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl cursor-pointer transition-all flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-xs text-white">{remainingTenorYears.toFixed(1)}Y {rateDesc}</span>
                    <div className="text-[10px] text-slate-400 font-mono">due wk {tranche.maturityWeek}</div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold font-mono ${isFixed ? 'text-indigo-400' : 'text-amber-400'}`}>Trade {isFixed ? 'Bond' : 'Loan'}</span>
                    <div className="text-[9px] text-slate-500">{isFixed ? '15x' : '10x'} PB Lev</div>
                  </div>
                </div>
              );
            })}
"""

text = text[:start] + replacement + text[end:]

# Add imports
import_str = "import { CapitalStructureBar } from './charts/Charts';\n"
if "CapitalStructureBar" not in text:
    s = text.find("import React")
    e = text.find("\n", s)
    text = text[:e+1] + import_str + text[e+1:]

with open('src/components/CompanyDetailModal.tsx', 'w') as f:
    f.write(text)

