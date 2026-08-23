import React from 'react';
import { GameState } from '../types';
import { X, RefreshCw, FileText } from 'lucide-react';

interface OverflowMenuProps {
  onClose: () => void;
  onRestart: () => void;
  state: GameState;
}

export const OverflowMenu: React.FC<OverflowMenuProps> = ({ onClose, onRestart, state }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h3 className="text-slate-200 font-bold text-sm tracking-wide flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            Diagnostics & Menu
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4 flex flex-col gap-4 text-sm text-slate-300">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Current Week:</span>
              <span className="font-mono text-slate-200">{state.currentWeek}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Companies:</span>
              <span className="font-mono text-slate-200">{state.companies.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Global AUM:</span>
              <span className="font-mono text-slate-200">${(state.portfolio.navUSD / 1e9).toFixed(2)}B</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Sim Clock:</span>
              <span className="font-mono text-slate-200">{new Date(2024, 0, 1 + state.currentWeek * 7).toISOString().split('T')[0]}</span>
            </div>
          </div>
          
          <button 
            onClick={() => {
              if (window.confirm("Are you sure you want to restart the simulation? All progress will be lost.")) {
                onRestart();
                onClose();
              }
            }}
            className="mt-2 flex items-center justify-center gap-2 px-4 py-2 bg-rose-900/30 text-rose-400 hover:bg-rose-900/50 rounded-md font-semibold text-xs border border-rose-800/50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Restart Simulation
          </button>
        </div>
      </div>
    </div>
  );
};
