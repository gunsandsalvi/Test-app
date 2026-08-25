const fs = require('fs');
let text = fs.readFileSync('src/engine/macro/banking.ts', 'utf-8');

text = text.replace(
  "const newCentralBankReservesWithMonetization = newCentralBankReservesFinal + (monetizedAmountUSD ?? 0);",
  "const newCentralBankReservesWithMonetization = Math.max(0, newCentralBankReservesFinal + (monetizedAmountUSD ?? 0));"
);

fs.writeFileSync('src/engine/macro/banking.ts', text);
console.log("Patched central bank reserves");
