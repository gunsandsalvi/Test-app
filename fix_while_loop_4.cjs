const fs = require('fs');
let text = fs.readFileSync('src/engine/simulation/core.ts', 'utf-8');

text = text.replace(
  "while (bidIdx < bids.length && offerIdx < offers.length) {",
  "let loopCounter = 0;\n      while (bidIdx < bids.length && offerIdx < offers.length) {\n        if (loopCounter++ > 10000) break;"
);

fs.writeFileSync('src/engine/simulation/core.ts', text);
