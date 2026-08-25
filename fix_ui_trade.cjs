const fs = require('fs');

// TradeTicketModal
const ttPath = 'src/components/TradeTicketModal.tsx';
let tt = fs.readFileSync(ttPath, 'utf-8');

tt = tt.replace(
  "executionDetails?: { fillPrice: number; counterpartyFeeUSD: number; sourcedFrom: string }",
  "executionDetails?: { fillPrice: number; counterpartyFeeUSD: number; sourcedFrom: string; spreadCostUSD: number }"
);
tt = tt.replace(
  "const resolveCounterpartyFill = (instrument: any, quantityUSD: number, region: Region) => {",
  "const resolveCounterpartyFill = (instrument: any, quantityUSD: number, region: Region, spreadCostUSD: number) => {"
);
tt = tt.replace(
  "return { fillPrice: instrument.price, counterpartyFeeUSD: 0, sourcedFrom: 'Bank inventory' };",
  "return { fillPrice: instrument.price, counterpartyFeeUSD: 0, sourcedFrom: 'Bank inventory', spreadCostUSD };"
);
tt = tt.replace(
  "return { fillPrice: instrument.price * (1 + intermediationFeeRate), counterpartyFeeUSD: shortfallUSD * intermediationFeeRate, sourcedFrom: 'Bank intermediated (sourced externally)' };",
  "return { fillPrice: instrument.price * (1 + intermediationFeeRate), counterpartyFeeUSD: shortfallUSD * intermediationFeeRate, sourcedFrom: 'Bank intermediated (sourced externally)', spreadCostUSD };"
);
tt = tt.replace(
  "const executionDetails = useMemo(() => resolveCounterpartyFill(instrument, notionalUSD, region), [instrument, notionalUSD, region]);",
  "const executionDetails = useMemo(() => resolveCounterpartyFill(instrument, notionalUSD, region, spreadCostUSD), [instrument, notionalUSD, region, spreadCostUSD]);"
);

fs.writeFileSync(ttPath, tt);

// App.tsx
const appPath = 'src/App.tsx';
let app = fs.readFileSync(appPath, 'utf-8');

app = app.replace(
  "executionDetails?: { fillPrice: number; counterpartyFeeUSD: number; sourcedFrom: string }",
  "executionDetails?: { fillPrice: number; counterpartyFeeUSD: number; sourcedFrom: string; spreadCostUSD: number }"
);

// We need to find the handleExecuteTrade body in App.tsx
// Delete:
// const spreadBps = 15;
// const spreadFee = (posData.notional * spreadBps) / 10000;
// And replace const updatedCash = prev.portfolio.cashUSD - spreadFee;
// with const updatedCash = prev.portfolio.cashUSD - (executionDetails?.spreadCostUSD ?? 0);

app = app.replace(/const spreadBps = 15;\n\s*const spreadFee = \(posData\.notional \* spreadBps\) \/ 10000;\n/, "");
app = app.replace(
  "const updatedCash = prev.portfolio.cashUSD - spreadFee;",
  "const updatedCash = prev.portfolio.cashUSD - (executionDetails?.spreadCostUSD ?? 0);"
);

// We need to find the `if (executionDetails)` block in `handleExecuteTrade` and add spreadCostUSD to bankEquityUSD
const bankEquityUpdateOld = "bankEquityUSD: region.bankingSector.bankEquityUSD + executionDetails.counterpartyFeeUSD";
const bankEquityUpdateNew = "bankEquityUSD: region.bankingSector.bankEquityUSD + executionDetails.counterpartyFeeUSD + executionDetails.spreadCostUSD";
app = app.replace(bankEquityUpdateOld, bankEquityUpdateNew);

// Delete leftover comment block
const leftoverComment = `        /* 
         * Actually, we don't need to manually debit the quantity if it's too complex,
         * because this is just an instant snapshot mark. 
         * But for completeness, let's at least mark the counterparty fee as banking revenue.
         */`;
app = app.replace(leftoverComment, "        // Bank inventory sourced first, then largest institutional holder.");

fs.writeFileSync(appPath, app);
console.log("Patched App.tsx and TradeTicketModal.tsx");
