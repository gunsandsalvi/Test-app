const fs = require('fs');
let code = fs.readFileSync('src/components/TradeTicketModal.tsx', 'utf-8');

let replaceStr = `        {/* Execution Costs & Margining Summary */}

        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-[10px] font-mono">
          <div className="flex items-center justify-between text-slate-400">
            <span>Execution Spread:</span>
            <span className="text-amber-400 font-bold">{spreadBps} bps</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Estimated Spread Cost:</span>
            <span className="text-slate-200">\${spreadCostUSD.toFixed(0)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800/80">
            <span>Initial Margin Required:</span>
            <span className="text-emerald-400 font-extrabold">{formatCurrency(initialMarginUSD)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Unencumbered Cash:</span>
            <span className="text-slate-300">{formatCurrency(state.portfolio.cashUSD)}</span>
          </div>
        </div>`;

let newStr = `          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-[10px] font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span>Execution Spread:</span>
              <span className="text-amber-400 font-bold">{spreadBps} bps</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Estimated Spread Cost:</span>
              <span className="text-slate-200">\${spreadCostUSD.toFixed(0)}</span>
            </div>
          </div>
        </div>
        )}
        
        {/* Always visible margin required */}
        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-[10px] font-mono mt-3">
          <div className="flex items-center justify-between text-slate-400">
            <span>Estimated Total Cost (Spread):</span>
            <span className="text-slate-200">\${spreadCostUSD.toFixed(0)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800/80">
            <span>Initial Margin Required:</span>
            <span className="text-emerald-400 font-extrabold">{formatCurrency(initialMarginUSD)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Unencumbered Cash:</span>
            <span className="text-slate-300">{formatCurrency(state.portfolio.cashUSD)}</span>
          </div>
        </div>`;

code = code.replace(replaceStr, newStr).replace(`          </div>
        )}
        {/* Execution Costs & Margining Summary */}`, ``);
fs.writeFileSync('src/components/TradeTicketModal.tsx', code);
