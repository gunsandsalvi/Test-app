const fs = require('fs');
let code = fs.readFileSync('src/components/TradeTicketModal.tsx', 'utf-8');
code = code.replace(`        
          </div>
        )}
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-[10px] font-mono">
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
        )}`, `          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-[10px] font-mono">
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
        )}`);
fs.writeFileSync('src/components/TradeTicketModal.tsx', code);
