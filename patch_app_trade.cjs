const fs = require('fs');

const path = 'src/App.tsx';
let text = fs.readFileSync(path, 'utf-8');

const regex = /const handleExecuteTrade = \(\n    posData: Omit<\n      Position,\n      'id' \| 'openedWeek' \| 'unrealizedPnL' \| 'realizedPnL' \| 'maintenanceMargin' \| 'weeklyFinancingCost'\n    >,\n    executionDetails\?: \{ fillPrice: number; counterpartyFeeUSD: number; sourcedFrom: string; spreadCostUSD: number \}\n  \) => \{\n    setState\(\(prev\) => \{\n      const newPos: Position = \{[\s\S]*?totalRequiredMarginUSD: totalMarginReq,\n          totalMaintenanceMarginUSD: totalMaintMargin,\n          marginUtilizationPct,\n          isMarginCall: navUSD < totalMaintMargin,\n        \},\n      \};\n    \}\);\n  \};/m;

// Since regex on this huge string is prone to failure, let's just insert an import and rewrite handleExecuteTrade exactly.
text = text.replace(
  "import { Region, GameState, Position, Instrument, Dealer, MarketNews, TurnSummary } from './types';",
  "import { Region, GameState, Position, Instrument, Dealer, MarketNews, TurnSummary } from './types';\nimport { executeTrade } from './engine/simulation/trade';"
);

let start = -1, end = -1;
const lines = text.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const handleExecuteTrade = (')) {
    start = i;
  }
  // The end is the closing brace of handleExecuteTrade. It's followed by return <div ...> or something.
  if (start !== -1 && lines[i].includes('  };')) {
    // Wait, the state setter closing is `    });` and then `  };`.
    if (lines[i-1].includes('    });')) {
      end = i;
      break;
    }
  }
}

if (start !== -1 && end !== -1) {
  const newFunc = `  const handleExecuteTrade = (
    posData: Omit<
      Position,
      'id' | 'openedWeek' | 'unrealizedPnL' | 'realizedPnL' | 'maintenanceMargin' | 'weeklyFinancingCost'
    >,
    executionDetails?: { fillPrice: number; counterpartyFeeUSD: number; sourcedFrom: string; spreadCostUSD: number }
  ) => {
    setState((prev) => executeTrade(prev, posData, executionDetails));
  };`;
  
  lines.splice(start, end - start + 1, newFunc);
  fs.writeFileSync(path, lines.join('\n'));
  console.log("Patched handleExecuteTrade in App.tsx!");
} else {
  console.log("Could not find handleExecuteTrade!");
}
