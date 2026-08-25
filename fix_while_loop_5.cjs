const fs = require('fs');
let text = fs.readFileSync('src/engine/simulation/core.ts', 'utf-8');

const regex = /let transactQty = Math\.min[\s\S]*?if \(offer\.quantityUnits <= 0\.0001 \|\| isNaN\(offer\.quantityUnits\)\) offerIdx\+\+;/;

const replacement = `
          let transactQty = Math.min(bid.quantityUnits, offer.quantityUnits);
          if (!isFinite(transactQty) || isNaN(transactQty) || transactQty <= 0) {
            bidIdx++;
            offerIdx++;
            continue;
          }
          const matchPrice = (bid.maxPriceUSD + offer.minPriceUSD) / 2;
          clearedPriceUSD = matchPrice;
          openUnitsCleared += transactQty;

          if (!openSales[offer.companyId]) openSales[offer.companyId] = { units: 0, amount: 0 };
          openSales[offer.companyId].units += transactQty;
          openSales[offer.companyId].amount += transactQty * matchPrice;

          if (bid.companyId) {
            if (!openPurchases[bid.companyId]) openPurchases[bid.companyId] = { units: 0, amount: 0 };
            openPurchases[bid.companyId].units += transactQty;
            openPurchases[bid.companyId].amount += transactQty * matchPrice;
          }
          if (bid.isHouseholdAggregate && subUnitId === 'passenger_vehicles') {
            targetReg.householdState.durableGoodsStockUnits = (targetReg.householdState.durableGoodsStockUnits ?? 0) + transactQty;
          }

          bid.quantityUnits -= transactQty;
          offer.quantityUnits -= transactQty;

          if (bid.quantityUnits <= 0.0001 || !isFinite(bid.quantityUnits)) bidIdx++;
          if (offer.quantityUnits <= 0.0001 || !isFinite(offer.quantityUnits)) offerIdx++;
`;

text = text.replace(regex, replacement.trim());
fs.writeFileSync('src/engine/simulation/core.ts', text);
