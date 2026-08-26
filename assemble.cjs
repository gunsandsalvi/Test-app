const fs = require('fs');

const stages = [
  '01-macro-feedback.ts', '02-region-macro.ts', '03-category-demand.ts',
  '04-input-output.ts', '05-unit-bidding.ts', '06-fx-and-trade.ts',
  '07-commodities.ts', '08-company-fundamentals.ts', '09-concentration-risk.ts',
  '10-ipo-and-ma.ts', '11-fiscal-and-sovereign-debt.ts', '12-portfolio-and-positions.ts',
  '13-news-and-turn-summary.ts'
];

let body = '';

for (const stage of stages) {
  const content = fs.readFileSync('src/engine/simulation/stages/' + stage, 'utf8');
  // extract body: everything between `export function ... {` and the last `return ctx;`
  let match = content.match(/export function \w+\([^)]*\)(?:\s*:\s*\w+)?\s*\{([\s\S]*?)return ctx;/);
  if (match) {
    let stageBody = match[1];
    // remove `let ctx.state = ctx.state;` etc.
    stageBody = stageBody.replace(/let\s+state\s*=\s*ctx\.state;/, '');
    stageBody = stageBody.replace(/const\s+state\s*=\s*ctx\.state;/, '');
    stageBody = stageBody.replace(/let\s+[a-zA-Z0-9_]+\s*=\s*ctx\.[a-zA-Z0-9_]+;/g, '');
    stageBody = stageBody.replace(/ctx\.[a-zA-Z0-9_]+\s*=\s*[a-zA-Z0-9_]+;/g, '');
    
    // remove the initial comments like // We will extract variables from ctx
    stageBody = stageBody.replace(/\/\/ We will extract variables from ctx/g, '');
    stageBody = stageBody.replace(/\/\/ \(We will let typescript complain and manually fix it, or just use any\)/g, '');
    
    body += `\n    // === STAGE ${stage} ===\n` + stageBody;
  }
}

fs.writeFileSync('assembled_body.txt', body);
