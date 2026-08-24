import React, { useState, useMemo } from 'react';
import { GameState } from '../../types';
import { CompanyDeepDive } from '../company/CompanyDeepDive';

export const CorporatesScreen: React.FC<{ state: GameState, onOpenTrade: (i: any) => void }> = ({ state, onOpenTrade }) => {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return state.companies.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      c.ticker.toLowerCase().includes(search.toLowerCase())
    );
  }, [state.companies, search]);

  return (
    <div className="p-3 space-y-4 pb-20">
      <input 
        type="text" 
        placeholder="Search corporates..." 
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-secondary)] transition-colors"
      />
      
      <div className="space-y-2">
        {filtered.slice(0, 50).map(c => {
          const isExpanded = expandedId === c.id;
          return (
            <div key={c.id} className="rounded-xl overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
               <div 
                 className="p-3 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-transform"
                 onClick={() => setExpandedId(isExpanded ? null : c.id)}
               >
                 <div>
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-bold text-[var(--text-primary)]">{c.ticker}</span>
                     {c.isDefaulted && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[var(--signal-negative)]/20 text-[var(--signal-negative)]">DEFAULT</span>}
                   </div>
                   <div className="text-[10px] text-[var(--text-tertiary)]">{c.name}</div>
                 </div>
                 <div className="text-right">
                   <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)]">${c.stockPrice.toFixed(2)}</div>
                   <div className="text-[10px] text-[var(--text-tertiary)]">{c.sector}</div>
                 </div>
               </div>
               
               {isExpanded && (
                 <div className="border-t border-[var(--border-hairline)] bg-[var(--bg-void)]">
                   <CompanyDeepDive company={c} state={state} onOpenTrade={onOpenTrade} />
                 </div>
               )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

