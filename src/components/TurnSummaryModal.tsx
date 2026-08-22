import React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  FastForward,
  Landmark,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { GameState } from '../types';
import { formatCurrency, formatPercent, formatSimulationDate } from '../engine/formatters';

interface TurnSummaryModalProps {
  state: GameState;
  onClose: () => void;
}

export const TurnSummaryModal: React.FC<TurnSummaryModalProps> = ({ state, onClose }) => {
  const summary = state.turnSummary;
  if (!summary) return null;

  const isProfit = summary.pnlDeltaUSD >= 0;
  const settlementDate = formatSimulationDate(summary.week);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-2xl animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 font-extrabold text-sm border border-emerald-500/30">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-white">Weekly Settlement Summary</h3>
              <p className="text-[10px] text-slate-400">{settlementDate} • Mark-to-Market</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PnL Highlight Banner */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between ${
            isProfit
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
          }`}
        >
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider block">Net Period P&L</span>
            <div className="text-lg font-extrabold font-mono mt-0.5">
              {formatCurrency(summary.pnlDeltaUSD, { showSign: true, compact: true })}
            </div>
          </div>

          <div className="text-right font-mono text-sm font-extrabold flex items-center gap-1">
            {isProfit ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            <span>{formatPercent(summary.pnlDeltaPct, { isDecimal: false, showSign: true, precision: 2 })}</span>
          </div>
        </div>

        {/* Accruals Matrix */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[9px] text-slate-500 block uppercase">Cash Interest Earned</span>
            <span className="text-emerald-400 font-bold mt-0.5 block">
              +{formatCurrency(summary.interestIncomeUSD, { compact: true })}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
            <span className="text-[9px] text-slate-500 block uppercase">Repo Financing Paid</span>
            <span className="text-rose-400 font-bold mt-0.5 block">
              -{formatCurrency(summary.financingCostUSD, { compact: true })}
            </span>
          </div>
        </div>

        {/* Corporate Defaults or Ratings Changes */}
        {summary.defaultedCompanies && summary.defaultedCompanies.length > 0 && (
          <div className="p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs space-y-1">
            <div className="flex items-center gap-1 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Corporate Insolvencies (Chapter 11):</span>
            </div>
            <p className="text-[11px] text-rose-300">
              {summary.defaultedCompanies.join(', ')} defaulted on senior debt obligations.
            </p>
          </div>
        )}

        {summary.ratingsChanges && summary.ratingsChanges.length > 0 && (
          <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[10px] space-y-1">
            <span className="text-slate-400 font-semibold block">Credit Rating Migrations:</span>
            {summary.ratingsChanges.slice(0, 3).map((rc, idx) => (
              <div key={idx} className="flex items-center justify-between text-slate-300 font-mono">
                <span>{rc.ticker}:</span>
                <span className="text-amber-400 font-bold">{rc.from} → {rc.to}</span>
              </div>
            ))}
          </div>
        )}

        {/* Continue Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5"
        >
          <span>Continue Trading</span>
        </button>
      </div>
    </div>
  );
};
