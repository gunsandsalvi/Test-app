import re
import os

with open("src/components/company/CompanyDeepDive.tsx", "r") as f:
    content = f.read()

# Replace tab === 'supplychain' content
supplychain_old = """{tab === 'supplychain' && (
          <div className="text-xs text-[var(--text-tertiary)] italic text-center py-4">
            Detailed supply chain dependency graphing not yet available.
          </div>
        )}"""

supplychain_new = """{tab === 'supplychain' && (
          <div className="space-y-3">
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold border-b border-[var(--border-hairline)] pb-1 mb-2">Key Supply Relationships</div>
            {(() => {
              const rels = (reg as any).supplyRelationships || [];
              const asSupplier = rels.filter((r: any) => r.supplierCompanyId === company.id);
              const asCustomer = rels.filter((r: any) => r.customerCompanyId === company.id);
              
              if (asSupplier.length === 0 && asCustomer.length === 0) {
                 return <div className="text-[11px] text-[var(--text-tertiary)] italic">No explicit major bilateral supply contracts found. Operates primarily via spot markets.</div>;
              }

              return (
                <div className="space-y-4">
                  {asSupplier.length > 0 && (
                    <div className="space-y-1">
                       <div className="text-[9px] text-[var(--text-secondary)] font-bold mb-1">MAJOR CUSTOMERS (Downstream)</div>
                       {asSupplier.map((r: any, i: number) => {
                          const cst = state.companies.find(c => c.id === r.customerCompanyId);
                          return (
                            <div key={i} className="flex justify-between items-center p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                               <div>
                                 <div className="text-[11px] font-bold">{cst?.name || r.customerCompanyId}</div>
                                 <div className="text-[9px] text-[var(--text-tertiary)]">Contract Strength: {(r.relationshipStrength * 100).toFixed(0)}%</div>
                               </div>
                               <div className="text-right">
                                 <div className="text-[11px] font-[var(--font-numeric)]">{formatCurrency(r.weeklyVolumeUSD, { compact: true })}/wk</div>
                               </div>
                            </div>
                          );
                       })}
                    </div>
                  )}
                  {asCustomer.length > 0 && (
                    <div className="space-y-1">
                       <div className="text-[9px] text-[var(--text-secondary)] font-bold mb-1">MAJOR SUPPLIERS (Upstream)</div>
                       {asCustomer.map((r: any, i: number) => {
                          const sup = state.companies.find(c => c.id === r.supplierCompanyId);
                          return (
                            <div key={i} className="flex justify-between items-center p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                               <div>
                                 <div className="text-[11px] font-bold">{sup?.name || r.supplierCompanyId}</div>
                                 <div className="text-[9px] text-[var(--text-tertiary)]">Contract Strength: {(r.relationshipStrength * 100).toFixed(0)}%</div>
                               </div>
                               <div className="text-right">
                                 <div className="text-[11px] font-[var(--font-numeric)]">{formatCurrency(r.weeklyVolumeUSD, { compact: true })}/wk</div>
                               </div>
                            </div>
                          );
                       })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}"""
        
if supplychain_old in content:
    content = content.replace(supplychain_old, supplychain_new)
else:
    # If it's not exactly that, find where to insert it or if there is no supplychain block yet
    if "{tab === 'supplychain' &&" not in content:
        # Just put it after exposure
        exposure_block_end = ")}"""
        # wait, that's too vague, I'll insert it using regex
        pass

with open("src/components/company/CompanyDeepDive.tsx", "w") as f:
    f.write(content)

