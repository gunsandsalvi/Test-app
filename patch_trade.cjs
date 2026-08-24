const fs = require('fs');
let code = fs.readFileSync('src/components/TradeTicketModal.tsx', 'utf-8');

const advancedStart = '{/* Dealer Selection Counterparties (With Inventory Axes) */}';
const marginStart = '{/* Execution Costs & Margining Summary */}';

let parts = code.split(advancedStart);
let parts2 = parts[1].split(marginStart);

let newMiddle = `
        <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors">
          {showAdvanced ? 'Hide' : 'Show'} advanced (dealer, spread, payoff) <ChevronRight className={\`w-3 h-3 transition-transform \${showAdvanced ? 'rotate-90' : ''}\`} />
        </button>

        {showAdvanced && (
          <div className="space-y-3 pt-3 border-t border-slate-800">
            {/* Dealer Selection Counterparties (With Inventory Axes) */}
` + parts2[0] + `
          </div>
        )}
        {/* Execution Costs & Margining Summary */}
`;

code = parts[0] + newMiddle + parts2[1];
fs.writeFileSync('src/components/TradeTicketModal.tsx', code);
