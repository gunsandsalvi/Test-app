const fs = require('fs');
let text = fs.readFileSync('scripts/invariants.ts', 'utf-8');

const sovCode = `
    let preState = state;
    state = advanceWeeklyStep(state);
    
    // Track Sovereign Debt Issuance
    ['USA', 'EUR', 'ASIA'].forEach(rId => {
       const preBankSov = preState.regions[rId]?.bankingSector.sovereignBondHoldingsUSD || 0;
       const preInstSov = preState.regions[rId]?.institutionalSector.sovBondHoldingsUSD || 0;
       
       const postBankSov = state.regions[rId]?.bankingSector.sovereignBondHoldingsUSD || 0;
       const postInstSov = state.regions[rId]?.institutionalSector.sovBondHoldingsUSD || 0;
       
       const actualGrowth = (postBankSov - preBankSov) + (postInstSov - preInstSov);
       
       const gdp = preState.regions[rId]?.nominalGdpUSD || 0;
       const deficitPct = preState.regions[rId]?.governmentDeficitPct || 0;
       const weeklyDeficit = (gdp * deficitPct) / 52;
       
       const centralBankHoldings = preState.regions[rId]?.centralBankReservesUSD || 0;
       const targetCBMoney = gdp * 0.15;
       const qe = Math.max(0, targetCBMoney - centralBankHoldings) * 0.01;
       const monetizedAmount = Math.min(weeklyDeficit, qe);
       
       const marketFundedAmount = Math.max(0, weeklyDeficit - monetizedAmount);
       
       // Accumulate
       if (!global.sovAccumulator) global.sovAccumulator = {};
       if (!global.sovAccumulator[rId]) global.sovAccumulator[rId] = { growth: 0, expected: 0 };
       
       global.sovAccumulator[rId].growth += actualGrowth;
       global.sovAccumulator[rId].expected += marketFundedAmount;
       
       if (w % 13 === 0) {
          const accGrowth = global.sovAccumulator[rId].growth;
          const accExpected = global.sovAccumulator[rId].expected;
          if (accExpected > 0 && Math.abs(accGrowth - accExpected) / accExpected > 0.05) {
             violations.push({ week: w, message: \`Sovereign debt absorption mismatch in \${rId} over 13 weeks: expected=\${accExpected.toFixed(2)} actualGrowth=\${accGrowth.toFixed(2)}\` });
          }
          global.sovAccumulator[rId].growth = 0;
          global.sovAccumulator[rId].expected = 0;
       }
    });
`;

text = text.replace(
  /    \/\/ Track Sovereign Debt Issuance[\s\S]*?\}\);\n/,
  sovCode
);
fs.writeFileSync('scripts/invariants.ts', text);
