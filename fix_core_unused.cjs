const fs = require('fs');
let co = fs.readFileSync('src/engine/simulation/core.ts', 'utf8');

co = co.replace(/let newRndExpense = comp.rndExpense \?\? 0;\s*let finalGrowthCapex = estNewGrowthCapex;\s*if \(\(comp.productLines \|\| \[\]\).some\(l => l.category === 'CorporateTech'\)\) \{\s*newRndExpense = estNewGrowthCapex \* 0.4;\s*finalGrowthCapex = estNewGrowthCapex \* 0.6;\s*\}/g, "");
co = co.replace("growthCapex: estNewGrowthCapex, // Replaced down below", "growthCapex: estNewGrowthCapex,");

co = co.replace(/const targetGrowthCapex = newRevenue \* growthCapexToRevenueRatio \* \(1 - rateDrag\) \* cashHealthFactor \* \(1 \+ qCapexEffect \+ competitivenessCapexEffect\) \* growthCapexAllocationShare;\s*const newGrowthCapex = Math.max\(0, \(comp.growthCapex \?\? \(comp.capex \* 0.4\)\) \* 0.90 \+ targetGrowthCapex \* 0.10\);/,
`const targetGrowthCapex = newRevenue * growthCapexToRevenueRatio * (1 - rateDrag) * cashHealthFactor * (1 + qCapexEffect + competitivenessCapexEffect) * growthCapexAllocationShare;
    let newGrowthCapex = Math.max(0, (comp.growthCapex ?? (comp.capex * 0.4)) * 0.90 + targetGrowthCapex * 0.10);
    let newRndExpense = comp.rndExpense ?? 0;
    if ((comp.productLines || []).some(l => l.category === 'CorporateTech')) {
        newRndExpense = newGrowthCapex * 0.4;
        newGrowthCapex = newGrowthCapex * 0.6;
    }`);

co = co.replace(/growthCapex: Number\(newGrowthCapex.toFixed\(1\)\),/, "growthCapex: Number(newGrowthCapex.toFixed(1)),\n      rndExpense: Number(newRndExpense.toFixed(1)),")

// Also fix `const rndSignal = newRndExpense > 0` - wait, the rndSignal relies on newRndExpense which is now declared further down.
// Let's just fix the whole thing safely:
// Just replace `rndSignal` block.
co = co.replace(/const rndSignal = newRndExpense > 0 \? \(newRndExpense \/ Math.max\(1, comp.annualRevenue\)\) \* 2 : 0;\s*const marginInvestmentSignal = \(\(comp.ebitdaMargin > 0.15 && comp.cash > 0\) \? 0.05 : -0.05\) \+ rndSignal;/g, 
  "const rndSignal = (comp.rndExpense ?? 0) > 0 ? ((comp.rndExpense ?? 0) / Math.max(1, comp.annualRevenue)) * 2 : 0;\n        const marginInvestmentSignal = ((comp.ebitdaMargin > 0.15 && comp.cash > 0) ? 0.05 : -0.05) + rndSignal;")


fs.writeFileSync('src/engine/simulation/core.ts', co);
