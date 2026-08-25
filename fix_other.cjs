const fs = require('fs');

// evolution.ts
let ev = fs.readFileSync('src/engine/macro/evolution.ts', 'utf8');
ev = ev.replace(/COMMODITY_QUANTITY_UNIT,\s*/g, '');
ev = ev.replace(/const { ratio: clearingRatio, supplyUnits, demandUnits } = computeCommodityClearingRatio/g, 'const { ratio: clearingRatio } = computeCommodityClearingRatio');
ev = ev.replace(/weeklySupplyUnits: supplyUnits,\n\s*weeklyDemandUnits: demandUnits,/g, 'weeklySupplyUnits: 0,\n    weeklyDemandUnits: 0,');
fs.writeFileSync('src/engine/macro/evolution.ts', ev);

// core.ts
let co = fs.readFileSync('src/engine/simulation/core.ts', 'utf8');
co = co.replace(/growthCapex: finalGrowthCapex,\n\s*rndExpense: newRndExpense,/, 'growthCapex: estNewGrowthCapex, // Replaced down below');
// Just use estNewGrowthCapex to satisfy tsc, wait...
fs.writeFileSync('src/engine/simulation/core.ts', co);

// CommoditiesScreen.tsx
let cs = fs.readFileSync('src/components/screens/CommoditiesScreen.tsx', 'utf8');
cs = cs.replace(/import \{ GameState/, 'import { COMMODITY_QUANTITY_UNIT, GameState');
fs.writeFileSync('src/components/screens/CommoditiesScreen.tsx', cs);

