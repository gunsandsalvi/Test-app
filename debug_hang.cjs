const fs = require('fs');
let text = fs.readFileSync('src/engine/simulation/core.ts', 'utf-8');

// The safety counter we added was:
// let loopCounter = 0;
// while (...) { if (loopCounter++ > 10000) break; ...
// Let's print out what is happening.
text = text.replace(
  "if (loopCounter++ > 10000) break;",
  "if (loopCounter++ > 100) {\n          console.log(`Hanging! bidIdx=${bidIdx} offerIdx=${offerIdx} bids=${bids.length} offers=${offers.length} bid.qty=${bids[bidIdx]?.quantityUnits} offer.qty=${offers[offerIdx]?.quantityUnits} transactQty=${Math.min(bids[bidIdx]?.quantityUnits, offers[offerIdx]?.quantityUnits)}`);\n          break;\n        }"
);
fs.writeFileSync('src/engine/simulation/core.ts', text);
