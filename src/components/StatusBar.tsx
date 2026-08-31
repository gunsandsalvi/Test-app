import React from 'react';
import { GameState, RegionId } from '../types';
import { Play, Pause, FastForward, MoreVertical } from 'lucide-react';
import { formatCurrency } from '../engine/formatters';
import { REGION_IDS_SEED_ORDER } from '../domain/geography';

interface StatusBarProps {
  state: GameState;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onAdvanceWeek: (weeks: number) => void;
  isAutoAdvancing: boolean;
  onToggleAutoAdvance: () => void;
  onOpenOverflow: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  state,
  isExpanded,
  onToggleExpanded,
  onAdvanceWeek,
  isAutoAdvancing,
  onToggleAutoAdvance,
  onOpenOverflow,
}) => {
  const isMarginCall = state.portfolio.isMarginCall;
  const regions = REGION_IDS_SEED_ORDER;

  return (
    <div className="bg-slate-900 border-b border-slate-800 flex flex-col w-full z-10 shrink-0">
      {/* Collapsed Row */}
      <div 
        className="flex items-center justify-between h-[44px] px-4 cursor-pointer select-none"
        onClick={(e) => {
          // If clicking buttons, don't expand
          if ((e.target as HTMLElement).closest('.status-controls')) return;
          onToggleExpanded();
        }}
      >
        <div className="flex items-center gap-4">
          <div className="text-slate-200 font-bold text-sm tracking-wide">
            Week {state.currentWeek}
          </div>
          <div className="text-slate-300 text-sm font-medium">
            NAV: <span className={state.portfolio.navUSD >= state.portfolio.startingCapitalUSD ? 'text-emerald-400' : 'text-rose-400'}>
              {formatCurrency(state.portfolio.navUSD)}
            </span>
          </div>
          {isMarginCall && (
            <div className="bg-rose-900/50 text-rose-400 text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider animate-pulse">
              Margin Call
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 status-controls">
          <button
            onClick={() => onToggleAutoAdvance()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              isAutoAdvancing 
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            {isAutoAdvancing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isAutoAdvancing ? 'Auto' : 'Auto Step'}
          </button>
          
          <button
            onClick={() => onAdvanceWeek(1)}
            disabled={isAutoAdvancing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-xs font-semibold text-slate-300 transition-colors"
          >
            <FastForward className="w-3.5 h-3.5" />
            +7 Days
          </button>
          
          <button onClick={onOpenOverflow} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="flex flex-col border-t border-slate-800/50 bg-slate-900/50">
          <div className="flex items-center gap-6 px-4 py-2 border-t border-slate-800/30 bg-slate-900/30 overflow-x-auto">
            {regions.map(id => {
              const r = state.regions[id]; 
              const cc = r.bankingSector.creditConditionsIndex;
              const dot = cc < -0.3 ? 'bg-emerald-500' : cc > 0.3 ? 'bg-rose-500' : 'bg-amber-500';
              return (
                <div key={id} className="flex items-center gap-1.5 shrink-0 text-[10px]">
                  <span className="text-slate-400 font-semibold">{id}:</span>
                  <span className="text-slate-200 uppercase tracking-wider">{r.cycleRegime}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${dot} shadow-[0_0_4px_currentColor]`} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
