const fs = require('fs');
let text = fs.readFileSync('src/engine/simulation/core.ts', 'utf-8');

// I will remove the safety counter since it wasn't actually an infinite loop, just 100 iterations wasn't enough.
text = text.replace(
  "if (loopCounter++ > 100) {\n          console.log(`Hanging! bidIdx=${bidIdx} offerIdx=${offerIdx} bids=${bids.length} offers=${offers.length} bid.qty=${bids[bidIdx]?.quantityUnits} offer.qty=${offers[offerIdx]?.quantityUnits} transactQty=${Math.min(bids[bidIdx]?.quantityUnits, offers[offerIdx]?.quantityUnits)}`);\n          break;\n        }",
  ""
);
text = text.replace("let loopCounter = 0;\n", "");
fs.writeFileSync('src/engine/simulation/core.ts', text);
