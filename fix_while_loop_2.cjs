const fs = require('fs');
let text = fs.readFileSync('src/engine/simulation/core.ts', 'utf-8');

// I will insert `let loopCounter = 0;` before the while loop, and break if it exceeds 10000.
text = text.replace(
  "while (bidIdx < bids.length && offerIdx < offers.length) {",
  "let loopCounter = 0;\n      while (bidIdx < bids.length && offerIdx < offers.length) {\n        if (loopCounter++ > 10000) break;"
);

fs.writeFileSync('src/engine/simulation/core.ts', text);
console.log("Patched while loop with safety counter");
