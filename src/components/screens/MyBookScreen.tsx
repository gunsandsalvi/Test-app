import React from 'react';
import { GameState } from '../../types';

export const MyBookScreen: React.FC<{ state: GameState }> = ({ state }) => {
  const portfolio = state.portfolio;
  const nav = portfolio.cashUSD + portfolio.positions.reduce((sum, p) => sum + (p.notional || (p.currentPrice * p.quantity)), 0);
  const initialCapital = 25000000;
  const returnPct = (nav - initialCapital) / initialCapital;

  return (
    <div className="p-3 space-y-6 pb-20">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">My Book</h2>
        <div className="flex items-end gap-3">
          <span className="text-2xl font-[var(--font-numeric)] text-[var(--text-primary)] font-bold">
            ${(nav / 1000000).toFixed(2)}M
          </span>
          <span className={`text-sm font-[var(--font-numeric)] font-bold pb-1 ${returnPct > 0 ? 'text-[var(--signal-positive)]' : returnPct < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
            {returnPct > 0 ? '+' : ''}{(returnPct * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Active Positions ({portfolio.positions.length})</h3>
        {portfolio.positions.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--text-tertiary)] border border-dashed border-[var(--border-hairline)] rounded-xl">
            No active positions. Open trades from the Market screen.
          </div>
        ) : (
          <div className="space-y-2">
            {portfolio.positions.map(p => {
              const currentVal = p.notional || (p.currentPrice * p.quantity);
              const costBasis = p.entryPrice * p.quantity;
              const pnl = currentVal - costBasis;
              const pnlPct = costBasis !== 0 ? pnl / costBasis : 0;
              return (
                <div key={p.id} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex justify-between items-center">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{p.symbol}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">{p.assetType} • {p.direction}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-[var(--font-numeric)] text-[var(--text-primary)]">${(currentVal / 1000).toFixed(1)}k</div>
                    <div className={`text-[10px] font-bold ${pnl > 0 ? 'text-[var(--signal-positive)]' : pnl < 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                      {pnl > 0 ? '+' : ''}{(pnl / 1000).toFixed(1)}k ({(pnlPct * 100).toFixed(2)}%)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Corporate Intel</h3>
        <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
          <p className="text-sm text-[var(--text-tertiary)] text-center">Select companies to monitor their intelligence reports.</p>
        </div>
      </div>
    </div>
  );
};
