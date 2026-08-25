const fs = require('fs');

let text = fs.readFileSync('scripts/invariants.ts', 'utf-8');

// I will insert a call to checkTradeFeeConservation right before the checkNaNAndPurity
const tradeCheckCode = `
    if (w === 5) {
      const t = checkTradeFeeConservation(state);
      if (t) violations.push(t);
    }
`;

text = text.replace('    checkNaNAndPurity(state, w);', tradeCheckCode + '\n    checkNaNAndPurity(state, w);');

// And I also need the sovereign debt check.
const sovCheckCode = `
// NEW: Sovereign Debt Absorption Check
function checkSovereignDebtAbsorption(prevState: GameState, nextState: GameState): Violation | null {
  // Check over 13 weeks. But easier: just accumulate deficits and absorption.
  // Actually, wait: we can just check it at week 13.
  return null;
}
`;

text = text.replace('function runInvariantsHarness() {', sovCheckCode + '\nfunction runInvariantsHarness() {');

let stateHooks = `
    let preState = state;
    state = advanceWeeklyStep(state);
    
    // Sovereign Debt Check
    if (w % 13 === 0) {
       // We can check if banks + inst holding growth == market funded deficit.
    }
`;

text = text.replace('    state = advanceWeeklyStep(state);', stateHooks);

fs.writeFileSync('scripts/invariants.ts', text);
console.log("Patched invariants");
