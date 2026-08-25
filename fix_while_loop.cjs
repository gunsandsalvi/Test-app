const fs = require('fs');

const path = 'src/engine/simulation/core.ts';
let text = fs.readFileSync(path, 'utf-8');

text = text.replace(
  "          if (bid.quantityUnits <= 0.0001) bidIdx++;",
  "          if (bid.quantityUnits <= 0.0001 || isNaN(bid.quantityUnits)) bidIdx++;"
);

text = text.replace(
  "          if (offer.quantityUnits <= 0.0001) offerIdx++;",
  "          if (offer.quantityUnits <= 0.0001 || isNaN(offer.quantityUnits)) offerIdx++;"
);

// To avoid `transactQty` being Infinity or NaN
text = text.replace(
  "          const transactQty = Math.min(bid.quantityUnits, offer.quantityUnits);",
  "          let transactQty = Math.min(bid.quantityUnits, offer.quantityUnits);\n          if (isNaN(transactQty) || !isFinite(transactQty)) transactQty = 0;"
);

// And we must break if both are 0 or both incremented?
// The above changes will increment bidIdx and offerIdx if they become NaN, effectively breaking the loop if everything is NaN.

fs.writeFileSync(path, text);
console.log("Patched while loop");
