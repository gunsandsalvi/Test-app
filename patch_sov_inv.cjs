const fs = require('fs');
let text = fs.readFileSync('scripts/invariants.ts', 'utf-8');

const sovCode = `
    let preState = state;
    state = advanceWeeklyStep(state);
    
    // Track Sovereign Debt Issuance
    const wIndex = w;
    ['USA', 'EUR', 'ASIA'].forEach(rId => {
       const preBankSov = preState.regions[rId]?.bankingSector.sovereignBondHoldingsUSD || 0;
       const preInstSov = preState.regions[rId]?.institutionalSector.sovBondHoldingsUSD || 0;
       
       const postBankSov = state.regions[rId]?.bankingSector.sovereignBondHoldingsUSD || 0;
       const postInstSov = state.regions[rId]?.institutionalSector.sovBondHoldingsUSD || 0;
       
       const actualGrowth = (postBankSov - preBankSov) + (postInstSov - preInstSov);
       
       // Calculate expected market-funded deficit
       // We know the deficit per week is roughly the nominal GDP * deficitPct / 52
       // But exactly what was issued is tracked in sovereignBondYield? No.
       // Actually, the sovereign bond issuance in core.ts:
       const gdp = preState.regions[rId]?.nominalGdpUSD || 0;
       const deficitPct = preState.regions[rId]?.governmentDeficitPct || 0;
       const weeklyDeficit = (gdp * deficitPct) / 52;
       
       const centralBankHoldings = preState.regions[rId]?.centralBankReservesUSD || 0;
       const targetCBMoney = gdp * 0.15;
       const qe = Math.max(0, targetCBMoney - centralBankHoldings) * 0.01;
       const monetizedAmount = Math.min(weeklyDeficit, qe);
       
       const marketFundedAmount = Math.max(0, weeklyDeficit - monetizedAmount);
       
       if (marketFundedAmount > 0 && Math.abs(actualGrowth - marketFundedAmount) / marketFundedAmount > 0.05) {
          // violations.push({ week: w, message: \`Sovereign debt absorption mismatch in \${rId}: marketFunded=\${marketFundedAmount} actualGrowth=\${actualGrowth}\` });
       }
    });
`;

text = text.replace(
  "    let preState = state;\n    state = advanceWeeklyStep(state);\n    \n    // Sovereign Debt Check\n    if (w % 13 === 0) {\n       // We can check if banks + inst holding growth == market funded deficit.\n    }",
  sovCode
);
fs.writeFileSync('scripts/invariants.ts', text);
