import React, { useState, useMemo } from 'react';
import { GameState, Company } from '../../types';
import { CompanyDeepDive } from '../company/CompanyDeepDive';
import { formatCurrency } from '../../engine/formatters';
import { ChevronLeft } from 'lucide-react';

export const CorporatesScreen: React.FC<{
  state: GameState;
  onOpenTrade: (i: any) => void;
  selectedCompany?: Company | null;
  onSelectCompany?: (c: Company | null) => void;
}> = ({ state, onOpenTrade, selectedCompany: propSelected, onSelectCompany }) => {
  const [search, setSearch] = useState('');
  const [internalSelected, setInternalSelected] = useState<Company | null>(null);

  const selected = propSelected !== undefined ? propSelected : internalSelected;
  const setSelected = (c: Company | null) => {
    if (onSelectCompany) onSelectCompany(c);
    setInternalSelected(c);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return state.companies;
    const q = search.toLowerCase().trim();
    
    return state.companies
      .map(c => {
        const t = c.ticker.toLowerCase();
        const n = c.name.toLowerCase();
        const s = c.sector.toLowerCase();
        let score = -1;
        
        if (t === q) score = 0; // Exact ticker match
        else if (t.startsWith(q)) score = 1; // Ticker prefix match
        else if (n.includes(q)) score = 2; // Name substring
        else if (s.includes(q)) score = 3; // Sector match
        
        return { c, score };
      })
      .filter(item => item.score !== -1)
      .sort((a, b) => a.score - b.score)
      .map(item => item.c);
  }, [state.companies, search]);

  if (selected) {
    const live = state.companies.find(c => c.id === selected.id) ?? selected;
    return (
      <div>
        <button onClick={() => setSelected(null)} className="flex items-center gap-1 p-3 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          <ChevronLeft className="w-4 h-4" /> All Corporates
        </button>
        <CompanyDeepDive company={live} state={state} onOpenTrade={onOpenTrade} />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 pb-20">
      <input
        type="text"
        placeholder="Search corporates..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-secondary)] transition-colors"
      />
      <div className="space-y-2">
        {filtered.slice(0, 50).map(c => (
          <div key={c.id} onClick={() => setSelected(c)} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer active:scale-[0.99] transition-transform flex items-center justify-between hover:border-[var(--text-tertiary)]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--text-primary)]">{c.ticker}</span>
                {c.isDefaulted && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[var(--signal-negative)]/20 text-[var(--signal-negative)]">DEFAULT</span>}
              </div>
              <div className="text-[10px] text-[var(--text-tertiary)]">{c.name}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)]">{formatCurrency(c.stockPrice, { compact: false })}</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">{c.sector}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
