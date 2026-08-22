import React from 'react';
import { Activity, AlertTriangle, BookOpen, Calendar, FastForward, Play, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';
import { GameState, RegionId } from '../types';
import { formatPercent, formatSimulationDate } from '../engine/formatters';

interface TopStatusBarProps {
  state: GameState;
  onAdvanceWeek: () => void;
  isAutoAdvancing: boolean;
  onToggleAutoAdvance: () => void;
  onOpenManual?: () => void;
  onOpenDiagnostics?: () => void;
}

export const TopStatusBar: React.FC<TopStatusBarProps> = ({
  state,
  onAdvanceWeek,
  isAutoAdvancing,
  onToggleAutoAdvance,
  onOpenManual,
  onOpenDiagnostics,
}) => {
  const regions: RegionId[] = ['USA', 'UK', 'JPN', 'EUR'];
  const formattedDate = formatSimulationDate(state.currentWeek);

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-3 py-2 text-slate-100 sticky top-0 z-30 shadow-md">
      {/* Top row: Calendar date, Simulation speed, Risk badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-xs">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-white tracking-wide">
                {formattedDate}
              </span>
              {state.turnSummary?.defaultedCompanies && state.turnSummary.defaultedCompanies.length > 0 && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.2 text-[9px] font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  DEFAULT
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">Institutional Multi-Asset Macro Terminal</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {state.portfolio.isMarginCall && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/50 text-rose-300 text-[10px] font-bold animate-pulse">
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              <span>MARGIN CALL</span>
            </div>
          )}

          {onOpenDiagnostics && (
            <button
              onClick={onOpenDiagnostics}
              className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-700/60 text-[11px] font-mono font-medium transition-all shadow-sm"
              title="Open Engine Diagnostics & Vector Inspector"
            >
              <Activity className="w-3 h-3 text-cyan-400" />
              <span>Diagnostics</span>
            </button>
          )}

          {onOpenManual && (
            <button
              onClick={onOpenManual}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium transition-all"
              title="Open Desk Manual"
            >
              <BookOpen className="w-3 h-3 text-blue-400" />
              <span>Manual</span>
            </button>
          )}

          <button
            id="btn-auto-step"
            onClick={onToggleAutoAdvance}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
              isAutoAdvancing
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
            title="Toggle Auto Advance"
          >
            <Play className={`w-3 h-3 ${isAutoAdvancing ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span>{isAutoAdvancing ? 'Pause' : 'Auto Step'}</span>
          </button>

          <button
            id="btn-step-week-top"
            onClick={onAdvanceWeek}
            disabled={state.isGameOver}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[11px] font-bold shadow-sm transition-all disabled:opacity-50"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>+7 Days</span>
          </button>
        </div>
      </div>

      {/* Central Bank Policy Rate Ticker */}
      <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between overflow-x-auto no-scrollbar text-[10px] gap-2 text-slate-300">
        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold shrink-0">CENTRAL BANK RATES:</span>
        <div className="flex items-center gap-3 shrink-0">
          {regions.map((regId) => {
            const reg = state.regions[regId];
            return (
              <div key={regId} className="flex items-center gap-1 shrink-0 font-mono">
                <span className="text-slate-400 font-sans font-semibold">{reg.symbol} {regId}:</span>
                <span className="font-bold text-white">{formatPercent(reg.policyRate, { isDecimal: true, precision: 2 })}</span>
                <span className="text-[9px] text-slate-500 font-sans">
                  (Inflation {formatPercent(reg.inflation, { isDecimal: true, precision: 1 })})
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </header>
  );
};
