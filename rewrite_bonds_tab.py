import sys
import re

with open('src/components/BondsCdsTab.tsx', 'r') as f:
    text = f.read()

# I will replace the whole return statement of the map
# Find from "{filteredCompanies.map((comp) => {" to the end of that block.

start_str = "{filteredCompanies.map((comp) => {"
end_str = "      </div>\n    </div>\n  );\n};"
start_idx = text.find(start_str)
end_idx = text.find(end_str)

if start_idx == -1 or end_idx == -1:
    print("Could not find bounds")
    sys.exit(1)

prefix = text[:start_idx + len(start_str)]
suffix = text[end_idx:]

replacement = """
          const reg = state.regions[comp.region];
          const hazardRate = comp.isDefaulted ? 1.0 : (comp.oasSpreadBps / 10000) / (1 - comp.recoveryRate);
          return (
            <div
              key={comp.id}
              className={`bg-slate-900 border rounded-xl p-3 transition-all ${
                comp.isDefaulted
                  ? 'border-rose-500/60 bg-rose-950/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div onClick={() => onSelectCompany(comp)} className="cursor-pointer flex-1 pr-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold font-mono text-sm text-white">{comp.ticker}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getRatingBadgeColor(
                        comp.creditRating
                      )}`}
                    >
                      {comp.creditRating}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-medium">
                      {comp.region}
                    </span>
                    <span className="text-[9px] text-slate-400">{comp.sector}</span>
                  </div>
                  <h4 className="text-xs text-slate-300 mt-0.5 truncate max-w-[210px]">{comp.name}</h4>
                </div>
                <div className="text-right">
                  {viewMode === 'CDS' && (
                    <>
                      <div className="text-sm font-extrabold font-mono text-purple-300">
                        {comp.isDefaulted ? 'DEFAULT' : `${comp.cdsSpreadBps} bps`}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono">5Y CDS Spread</div>
                    </>
                  )}
                  {viewMode === 'CASH_DEBT' && (
                    <>
                      <div className="text-sm font-extrabold font-mono text-indigo-300">
                        {comp.isDefaulted ? 'DEFAULT' : `${comp.oasSpreadBps} bps`}
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono">Current OAS</div>
                    </>
                  )}
                </div>
              </div>

              {/* Credit Risk Metrics */}
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-3 font-mono text-slate-400">
                  <div>
                    <span className="text-slate-500 block text-[8px]">OAS SPREAD</span>
                    <span className="text-slate-200 font-semibold">{comp.oasSpreadBps} bps</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[8px]">LEVERAGE</span>
                    <span className="text-slate-200 font-semibold">{comp.leverage.toFixed(1)}x</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[8px]">COVERAGE</span>
                    <span className={`font-semibold ${comp.interestCoverage < 1.5 ? 'text-rose-400' : 'text-slate-200'}`}>
                      {comp.interestCoverage.toFixed(1)}x
                    </span>
                  </div>
                </div>
                {/* Trade Action Buttons */}
                <div className="flex items-center gap-1.5">
                  {viewMode === 'CDS' && (
                    <button
                      id={`btn-trade-cds-${comp.ticker}`}
                      onClick={() =>
                        onOpenTrade({
                          assetType: 'CDS',
                          id: `${comp.id}_CDS`,
                          symbol: comp.ticker,
                          name: `${comp.name} 5Y CDS`,
                          region: comp.region,
                          price: comp.cdsSpreadBps,
                          quoteUnit: 'bps',
                          details: {
                            tenorYears: 5,
                            cdsSpreadBps: comp.cdsSpreadBps,
                            oasSpreadBps: comp.oasSpreadBps,
                            rating: comp.creditRating,
                          },
                        })
                      }
                      disabled={comp.isDefaulted}
                      className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-[10px] font-bold shadow-sm transition-all disabled:opacity-40"
                    >
                      Trade CDS
                    </button>
                  )}
                </div>
              </div>

              {/* CASH DEBT TRANCHES */}
              {viewMode === 'CASH_DEBT' && (
                <div className="mt-3 space-y-1.5">
                  {comp.debtTranches?.map((tranche) => {
                    const remainingTenorYears = Math.max(0.01, (tranche.maturityWeek - state.week) / 52);
                    const isFixed = tranche.rateType === 'FIXED';
                    const rateDesc = isFixed 
                      ? `${((tranche.couponRate ?? 0) * 100).toFixed(1)}% Fixed`
                      : `Floating +${tranche.floatingMarginBps}bps`;
                    
                    return (
                      <div key={tranche.id} className="flex items-center justify-between bg-slate-800/50 p-2 rounded text-[10px] border border-slate-700/50">
                        <div className="font-mono text-slate-300 flex-1">
                          {comp.ticker} {remainingTenorYears.toFixed(1)}Y {rateDesc} <span className="text-slate-500 text-[9px]">(due wk {tranche.maturityWeek})</span>
                        </div>
                        <button
                          onClick={() => {
                            const assetType = isFixed ? 'CORP_BOND' : 'LEVERAGED_LOAN';
                            onOpenTrade({
                              assetType,
                              id: tranche.id,
                              symbol: tranche.id,
                              name: `${comp.name} ${remainingTenorYears.toFixed(1)}Y ${isFixed ? 'Senior Bond' : 'Loan'}`,
                              region: comp.region,
                              price: comp.isDefaulted ? (isFixed ? comp.recoveryRate * 100 : 65.0) : 100, // Roughly 100 before pricing
                              quoteUnit: isFixed ? '% Par' : 'pts of par',
                              details: {
                                trancheId: tranche.id,
                                tenorYears: remainingTenorYears,
                                fixedRate: tranche.couponRate ?? 0,
                                rateType: tranche.rateType,
                                oasSpreadBps: comp.oasSpreadBps,
                                rating: comp.creditRating,
                                sector: comp.sector
                              },
                            });
                          }}
                          disabled={comp.isDefaulted}
                          className={`px-2 py-1 rounded text-white font-bold shadow-sm transition-all disabled:opacity-40 ${isFixed ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-amber-600 hover:bg-amber-500'}`}
                        >
                          Trade {isFixed ? 'Bond' : 'Loan'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
"""

with open('src/components/BondsCdsTab.tsx', 'w') as f:
    f.write(prefix + "\n" + replacement + suffix)

print("Done")
