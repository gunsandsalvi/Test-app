/**
 * Stage 5: Generalized Unit Bidding & Contract Market
 *
 * For every industry sub-unit in every region: settles existing supply contracts, runs an
 * open bid/offer clearing auction for the residual (household/government aggregate demand
 * plus corporate open demand against supplier open offers), and probabilistically forms new
 * long-term B2B supply contracts from matched participants.
 */

import { GameState, Region, RegionId, UnitBid, UnitOffer, SupplyContract, Company } from '../../../types';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { CATEGORY_INPUT_REQUIREMENTS } from '../../../domain/market-microstructure';
import { isActiveCompany, getOutputInventoryUnits, getOutputInventoryUSD, getInputInventoryUnits, getInputInventoryUSD } from '../../../domain/company';
import { WeeklyStepContext } from './context';

// 1$ is 1$ Phase 2: this company's real weekly need for inputSubUnitId, from the same literal
// recipe (CATEGORY_INPUT_REQUIREMENTS) that 08-company-fundamentals.ts uses to draw down input
// inventory — bidding to this real, recipe-derived need (instead of a generic revenue-share
// slice of aggregate corporate demand) is what makes what a company buys here actually match
// what it consumes there, rather than two independently-sized, unrelated numbers.
function computeRecipeInputNeedUSD(comp: Company, inputSubUnitId: string): number {
  return (comp.productLines || []).reduce((sum, line) => {
    const reqs = CATEGORY_INPUT_REQUIREMENTS[line.industry];
    const intensity = reqs?.[inputSubUnitId];
    if (!intensity) return sum;
    return sum + (comp.annualRevenue / 52) * (line.revenueShare ?? 1.0) * intensity;
  }, 0);
}

function setOutputInventory(update: any, subUnitId: string, unitsHeld: number, unitPriceUSD: number) {
  if (!update.outputInventoryBySubUnit) update.outputInventoryBySubUnit = {};
  update.outputInventoryBySubUnit[subUnitId] = { unitsHeld, valueUSD: unitsHeld * unitPriceUSD };
}

// 1$ is 1$ Phase 2: credit a real purchase onto the buyer's persisted input inventory —
// accumulate on top of whatever this same company already holds (and whatever it already
// bought this same week via a different subUnitId's auction pass), not a fresh snapshot like
// output inventory, since input stock is genuinely carried and drawn down over many weeks.
function addInputInventory(update: any, baseComp: Company, subUnitId: string, addedUnits: number, addedValueUSD: number) {
  if (!update.inputInventoryBySubUnit) update.inputInventoryBySubUnit = {};
  const existing = update.inputInventoryBySubUnit[subUnitId] ?? {
    unitsHeld: getInputInventoryUnits(baseComp, subUnitId),
    valueUSD: getInputInventoryUSD(baseComp, subUnitId),
  };
  update.inputInventoryBySubUnit[subUnitId] = {
    unitsHeld: existing.unitsHeld + addedUnits,
    valueUSD: existing.valueUSD + addedValueUSD,
  };
}

function executeSubUnitBiddingMarket(
  ctx: WeeklyStepContext,
  subUnitId: string,
  baseUnitPrice: number,
  targetReg: Region,
  targetRegionId: RegionId
) {
  const { companyUpdates, prevActiveFirms, nextWeek } = ctx;
  const demandState = targetReg.categoryDemand[subUnitId] as any;
  if (!demandState) return;

  if (!demandState.unitPriceUSD || demandState.unitPriceUSD <= 0) {
    demandState.unitPriceUSD = baseUnitPrice;
  }
  const currentUnitPrice = demandState.unitPriceUSD;

  // Suppliers price their NEXT offer off the price this same clearing produces — a one-period
  // feedback loop. Combined with how elastic productionResponseFactor is (up to 2x production
  // for a ~33% price move), reacting to the raw, single-week cleared price is the textbook
  // cobweb-cycle setup: overproduce this week because last week's price was high, crash the
  // price, underproduce next week because it was low, repeat — with the swings growing, not
  // damping. Suppliers instead react to a slow-moving average of price (an "expectation"),
  // which is what breaks a cobweb cycle in practice.
  if (!demandState.smoothedUnitPriceUSD || demandState.smoothedUnitPriceUSD <= 0) {
    demandState.smoothedUnitPriceUSD = currentUnitPrice;
  }
  demandState.smoothedUnitPriceUSD = demandState.smoothedUnitPriceUSD * 0.75 + currentUnitPrice * 0.25;
  const supplierExpectedUnitPrice = demandState.smoothedUnitPriceUSD;

  // 1. Process active contracts
  if (!targetReg.activeContracts) targetReg.activeContracts = [];
  const remainingContracts: SupplyContract[] = [];
  // supUp.salesUnits/salesUSD are deliberately cross-sub-unit totals (other consumers want a
  // company's whole-business sales) — but the inventory formula below needs THIS sub-unit's
  // sales specifically, so track that separately rather than reading the contaminated total.
  const contractSalesUnitsBySupplier: Record<string, number> = {};

  targetReg.activeContracts.forEach(contract => {
    if (contract.subUnitId !== subUnitId) {
      remainingContracts.push(contract);
      return;
    }

    const supplier = prevActiveFirms.find(c => c.ticker === contract.supplierCompanyId || c.id === contract.supplierCompanyId);
    const customer = prevActiveFirms.find(c => c.ticker === contract.customerCompanyId || c.id === contract.customerCompanyId);

    if (supplier && customer) {
      if (!isActiveCompany(supplier)) {
        // Supplier default shock propagates directly to named contract counterparties first
        if (!companyUpdates[customer.ticker]) companyUpdates[customer.ticker] = {};
        const custUp = companyUpdates[customer.ticker];
        custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, 0.70);
      } else if (isActiveCompany(customer)) {
        contract.weeksRemaining -= 1;
        if (contract.weeksRemaining >= 0) {
          // Execute weekly contract transaction
          const supplierUnits = getOutputInventoryUnits(supplier, subUnitId);
          const actualTransacted = Math.min(contract.quantityUnitsPerWeek, supplierUnits);
          const paymentUSD = actualTransacted * contract.priceUSD;
          const fillRate = contract.quantityUnitsPerWeek > 0 ? actualTransacted / contract.quantityUnitsPerWeek : 1.0;

          if (!companyUpdates[supplier.ticker]) companyUpdates[supplier.ticker] = {};
          if (!companyUpdates[customer.ticker]) companyUpdates[customer.ticker] = {};

          const supUp = companyUpdates[supplier.ticker];
          setOutputInventory(supUp, subUnitId, Math.max(0, supplierUnits - actualTransacted), currentUnitPrice);
          supUp.cashChange = (supUp.cashChange ?? 0) + paymentUSD;
          supUp.salesUnits = (supUp.salesUnits ?? 0) + actualTransacted;
          supUp.salesUSD = (supUp.salesUSD ?? 0) + paymentUSD;
          contractSalesUnitsBySupplier[supplier.ticker] = (contractSalesUnitsBySupplier[supplier.ticker] ?? 0) + actualTransacted;

          const custUp = companyUpdates[customer.ticker];
          custUp.cashChange = (custUp.cashChange ?? 0) - paymentUSD;
          custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + actualTransacted;
          custUp.purchasesUSD = (custUp.purchasesUSD ?? 0) + paymentUSD;
          addInputInventory(custUp, customer, subUnitId, actualTransacted, paymentUSD);

          if (fillRate < 0.95) {
            // Named shock propagation: reduced fill rate constrains customer capacity directly
            custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, Math.max(0.3, fillRate));
          }

          remainingContracts.push(contract);
        }
      }
    }
  });
  targetReg.activeContracts = remainingContracts;

  // 2. Open Bidding & Matching
  const bids: UnitBid[] = [];
  const offers: UnitOffer[] = [];

  const regionActiveFirms = prevActiveFirms.filter(c => c.region === targetRegionId && isActiveCompany(c));
  const suppliers = regionActiveFirms.filter(c => (c.productLines || []).some(l => l.subUnitId === subUnitId));

  // A recipe-input category (upstream_extraction, specialty_metals) is bought by named
  // companies for a literal, computable reason — their own production recipe — not a generic
  // share of aggregate corporate demand; every company whose recipe actually needs this
  // category becomes a real customer, sized to that same real need (computeRecipeInputNeedUSD),
  // so what a company bids to buy here matches exactly what 08-company-fundamentals.ts later
  // draws down from its input inventory.
  const isRecipeInputCategory = Object.values(CATEGORY_INPUT_REQUIREMENTS).some(reqs => (reqs as any)?.[subUnitId] !== undefined);
  // Real, complete corporate demand for every OTHER category (see 03-category-demand.ts's
  // corporateDemandUSD — the same buyerMix/aggregate-investment math that feeds the region's
  // C+I+G identity, not a hand-picked per-category intensity list that only covered a handful
  // of categories and let every other one starve for real corporate buyers).
  const hasCorporateDemand = subUnitId === 'industrial_automation' || (demandState.corporateDemandUSD ?? 0) > 0;
  const customers = regionActiveFirms.filter(c => {
    if ((c.productLines || []).some(l => l.subUnitId === subUnitId)) return false;
    return isRecipeInputCategory ? computeRecipeInputNeedUSD(c, subUnitId) > 0 : hasCorporateDemand;
  });
  const totalCustomerRevenueUSD = customers.reduce((s, c) => s + c.annualRevenue, 0) || 1;
  // Suppliers submit unit offers
  suppliers.forEach(comp => {
    const line = (comp.productLines || []).find(l => l.subUnitId === subUnitId)!;
    const warehouseCapacityUSD = comp.annualRevenue * 0.15;
    const currentInvUSD = getOutputInventoryUSD(comp, subUnitId);
    // A hard on/off switch here (full production, then a sudden drop to 30% once inventory
    // crosses one threshold) is a bang-bang controller with no hysteresis — it doesn't damp
    // toward equilibrium, it oscillates around the threshold forever (backlog clears -> snap
    // back to full production -> oversupply -> throttle again), producing multi-x week-to-week
    // swings in real cleared sales even when underlying demand is stable. A continuous response
    // that scales down smoothly as the inventory/capacity ratio grows converges instead.
    const inventoryToCapacityRatio = currentInvUSD / Math.max(1, warehouseCapacityUSD);
    const productionThrottle = Math.max(0.3, Math.min(1.0, 1.0 - (inventoryToCapacityRatio - 1.0) * 0.7));
    const priceSignal = (supplierExpectedUnitPrice / baseUnitPrice) - 1.0;
    const productionResponseFactor = Math.max(0.5, Math.min(2.0, 1.0 + priceSignal * 1.5));
    const targetProductionUSD = (comp.annualRevenue / 52) * (line?.revenueShare ?? 1.0) * productionResponseFactor * productionThrottle;
    const targetProductionUnits = targetProductionUSD / currentUnitPrice;

    const currentUnits = getOutputInventoryUnits(comp, subUnitId);
    const contractSales = remainingContracts
      .filter(c => (c.supplierCompanyId === comp.ticker || c.supplierCompanyId === comp.id) && c.subUnitId === subUnitId)
      .reduce((s, c) => s + c.quantityUnitsPerWeek, 0);

    const openOfferUnits = Math.max(0, targetProductionUnits + currentUnits - contractSales);

    if (openOfferUnits > 0.001) {
      const baseMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
      const costRate = Math.max(0.40, Math.min(0.98, 1 - baseMargin));
      const ratingPdMap: Record<string, number> = {
        'AAA': 0.0002, 'AA': 0.001, 'A': 0.003, 'BBB': 0.01, 'BB': 0.03, 'B': 0.08, 'CCC': 0.20
      };
      const pd = ratingPdMap[comp.creditRating] ?? 0.03;
      const expectedLoss = pd * 0.60;
      const costOfCapital = 0.05 + expectedLoss;
      const marginPremium = costOfCapital * 1.5;
      const minPriceUSD = currentUnitPrice * costRate * (1 + marginPremium);

      offers.push({
        companyId: comp.ticker,
        quantityUnits: openOfferUnits,
        minPriceUSD,
      });
    }
  });

  // Corporate Customers submit bids
  customers.forEach(comp => {
    let demandUSD = 0;
    if (subUnitId === 'industrial_automation') {
      const realCapexUSD = (comp.maintenanceCapex ?? 0) + (comp.growthCapex ?? 0);
      demandUSD = (realCapexUSD / 52) * 0.35;
    } else if (isRecipeInputCategory) {
      demandUSD = computeRecipeInputNeedUSD(comp, subUnitId);
    } else {
      // This company's real named bid is its revenue share of the category's real total
      // corporate demand — every company that could plausibly buy this category gets a bid
      // sized to its own scale, and the bids sum exactly to the real regional total.
      const totalCorpDemandUSD = demandState.corporateDemandUSD ?? 0;
      demandUSD = (totalCorpDemandUSD / 52) * (comp.annualRevenue / totalCustomerRevenueUSD);
    }
    const demandUnits = demandUSD / currentUnitPrice;

    const contractPurchases = remainingContracts
      .filter(c => (c.customerCompanyId === comp.ticker || c.customerCompanyId === comp.id) && c.subUnitId === subUnitId)
      .reduce((s, c) => s + c.quantityUnitsPerWeek, 0);

    const openBidUnits = Math.max(0, demandUnits - contractPurchases);

    if (openBidUnits > 0.001) {
      const cashRatio = comp.cash / Math.max(1, comp.annualRevenue);
      const cashModifier = cashRatio < 0.02 ? 0.85 : cashRatio > 0.15 ? 1.15 : 1.0;
      const maxPriceUSD = currentUnitPrice * (0.95 + Math.random() * 0.1) * cashModifier;

      bids.push({
        companyId: comp.ticker,
        quantityUnits: openBidUnits,
        maxPriceUSD,
      });
    }
  });

  // Look up buyer mix for this subUnit
  const allSubUnits = Object.values(INDUSTRY_SUBUNITS).flat();
  const subUnitDef = allSubUnits.find(su => su.unitId === subUnitId);
  const govShare = subUnitDef?.buyerMix.GOVERNMENT ?? 0;
  const hhShare = subUnitDef?.buyerMix.HOUSEHOLD ?? 0;

  // Government Aggregate Bid
  if (govShare > 0) {
    const govWeeklyDemandUSD = (demandState.demandLevelUSD * govShare) / 52;
    const govDemandUnits = govWeeklyDemandUSD / currentUnitPrice;
    if (govDemandUnits > 0.001) {
      bids.push({
        isGovernmentAggregate: true,
        quantityUnits: govDemandUnits,
        maxPriceUSD: currentUnitPrice * 1.10
      });
    }
  }

  // Household Aggregate Bid
  if (hhShare > 0) {
    const hhWeeklyDemandUSD = (demandState.demandLevelUSD * hhShare) / 52;
    let hhDemandUnits = hhWeeklyDemandUSD / currentUnitPrice;

    if (subUnitId === 'passenger_vehicles') {
      const initialStock = targetReg.householdState.durableGoodsStockUnits ?? ((demandState.demandLevelUSD * hhShare / currentUnitPrice) * 3.5);
      const scrappageRate = 0.12 / 52;
      const replacementDemandUnits = initialStock * scrappageRate;
      const targetStock = (targetReg.estimatedHouseholdIncomeUSD * (1 - targetReg.householdState.savingsRate) * 0.10) / currentUnitPrice;
      const expansionDemandUnits = Math.max(0, (targetStock - initialStock) * 0.05);
      hhDemandUnits = replacementDemandUnits + expansionDemandUnits;
      targetReg.householdState.durableGoodsStockUnits = initialStock - (initialStock * scrappageRate);
    }

    if (hhDemandUnits > 0.001) {
      const priceElasticityPremium = Math.tanh(0.05) * 0.15;
      const hhMaxPriceUSD = currentUnitPrice * (1.0 + priceElasticityPremium);

      bids.push({
        isHouseholdAggregate: true,
        quantityUnits: hhDemandUnits,
        maxPriceUSD: hhMaxPriceUSD,
      });
    }
  }

  // Sort bids desc, offers asc
  bids.sort((a, b) => b.maxPriceUSD - a.maxPriceUSD);
  offers.sort((a, b) => a.minPriceUSD - b.minPriceUSD);

  let clearedPriceUSD = currentUnitPrice;
  let openUnitsCleared = 0;
  let bidIdx = 0;
  let offerIdx = 0;

  const openSales: Record<string, { units: number; amount: number }> = {};
  const openPurchases: Record<string, { units: number; amount: number }> = {};

  let loopCounter = 0;
  while (bidIdx < bids.length && offerIdx < offers.length) {
    if (loopCounter++ > 10000) break;

    const bid = bids[bidIdx];
    const offer = offers[offerIdx];

    if (bid.maxPriceUSD >= offer.minPriceUSD) {
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
    } else {
      break;
    }
  }

  // 3. Save matching results to updates
  suppliers.forEach(comp => {
    const sale = openSales[comp.ticker];
    if (!companyUpdates[comp.ticker]) companyUpdates[comp.ticker] = {};
    const supUp = companyUpdates[comp.ticker];
    const initialUnits = getOutputInventoryUnits(comp, subUnitId);

    const line = (comp.productLines || []).find(l => l.subUnitId === subUnitId)!;
    const warehouseCapacityUSD = comp.annualRevenue * 0.15;
    const currentInvUSD = getOutputInventoryUSD(comp, subUnitId);
    // A hard on/off switch here (full production, then a sudden drop to 30% once inventory
    // crosses one threshold) is a bang-bang controller with no hysteresis — it doesn't damp
    // toward equilibrium, it oscillates around the threshold forever (backlog clears -> snap
    // back to full production -> oversupply -> throttle again), producing multi-x week-to-week
    // swings in real cleared sales even when underlying demand is stable. A continuous response
    // that scales down smoothly as the inventory/capacity ratio grows converges instead.
    const inventoryToCapacityRatio = currentInvUSD / Math.max(1, warehouseCapacityUSD);
    const productionThrottle = Math.max(0.3, Math.min(1.0, 1.0 - (inventoryToCapacityRatio - 1.0) * 0.7));
    const priceSignal = (supplierExpectedUnitPrice / baseUnitPrice) - 1.0;
    const productionResponseFactor = Math.max(0.5, Math.min(2.0, 1.0 + priceSignal * 1.5));
    const targetProductionUSD = (comp.annualRevenue / 52) * (line?.revenueShare ?? 1.0) * productionResponseFactor * productionThrottle;
    const targetProductionUnits = targetProductionUSD / currentUnitPrice;

    const contractSalesUnitsThisSubUnit = contractSalesUnitsBySupplier[comp.ticker] ?? 0;
    if (sale) {
      setOutputInventory(supUp, subUnitId, Math.max(0, initialUnits + targetProductionUnits - contractSalesUnitsThisSubUnit - sale.units), clearedPriceUSD);
      supUp.cashChange = (supUp.cashChange ?? 0) + sale.amount;
      supUp.salesUnits = (supUp.salesUnits ?? 0) + sale.units;
      supUp.salesUSD = (supUp.salesUSD ?? 0) + sale.amount;
    } else {
      setOutputInventory(supUp, subUnitId, Math.max(0, initialUnits + targetProductionUnits - contractSalesUnitsThisSubUnit), clearedPriceUSD);
    }
    supUp._targetProductionUSD = (supUp._targetProductionUSD ?? 0) + targetProductionUSD;
  });

  customers.forEach(comp => {
    const purchase = openPurchases[comp.ticker];
    if (purchase) {
      if (!companyUpdates[comp.ticker]) companyUpdates[comp.ticker] = {};
      const custUp = companyUpdates[comp.ticker];
      custUp.cashChange = (custUp.cashChange ?? 0) - purchase.amount;
      custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + purchase.units;
      custUp.purchasesUSD = (custUp.purchasesUSD ?? 0) + purchase.amount;
      addInputInventory(custUp, comp, subUnitId, purchase.units, purchase.amount);
    }
  });

  // 4. Contract Formation (B2B corporate matching only)
  const matchedBids = bids.filter(b => b.companyId && b.quantityUnits < 0.01);
  const matchedOffers = offers.filter(o => o.quantityUnits < 0.01);

  matchedBids.forEach(bid => {
    matchedOffers.forEach(offer => {
      if (Math.random() < 0.15 && bid.companyId) {
        const supplierComp = suppliers.find(s => s.ticker === offer.companyId);
        const customerComp = customers.find(c => c.ticker === bid.companyId);

        if (supplierComp && customerComp) {
          const totalSuppliersRevenue = suppliers.reduce((s, c) => s + c.annualRevenue, 0);
          const supplierMarketShare = supplierComp.annualRevenue / Math.max(1, totalSuppliersRevenue);
          const relativeSize = customerComp.annualRevenue / Math.max(1, supplierComp.annualRevenue);
          const supplierPowerFactor = 0.5 + (supplierMarketShare - 0.25) * 0.5;
          const customerBargainingPower = (relativeSize > 1.0 ? 0.6 : 0.4) * (1.0 - supplierPowerFactor);
          let contractPrice = clearedPriceUSD * (1.0 - (customerBargainingPower - 0.3) * 0.05);
          let duration = 12 + Math.floor(Math.random() * 40);

          // Hedging for revenue volatility
          const revHist = customerComp.revenueHistory || [];
          let revVol = 0;
          if (revHist.length > 3) {
            const meanRev = revHist.reduce((s, v) => s + v, 0) / revHist.length;
            const varRev = revHist.reduce((s, v) => s + Math.pow(v - meanRev, 2), 0) / revHist.length;
            revVol = Math.sqrt(varRev) / meanRev;
          }
          if (revVol > 0.05) {
            duration = 52 + Math.floor(Math.random() * 52); // Seek longer contracts
            const impliedPd = Math.max(0, Math.min(1, 1 / (1 + Math.exp(customerComp.interestCoverage * 0.8 - customerComp.leverage * 0.4))));
            const costOfCapital = 0.05 + (impliedPd * 0.60);
            const hedgingPremium = costOfCapital * 0.20; // Modest price premium
            contractPrice *= (1.0 + hedgingPremium);
          }

          const baseContractUnits = subUnitId === 'industrial_automation'
            ? (Math.random() * 2 + 0.5)
            : subUnitId === 'passenger_vehicles'
            ? (Math.random() * 15 + 3)
            : subUnitId === 'pharmaceuticals'
            ? (Math.random() * 800 + 200)
            : subUnitId === 'refined_products'
            ? (Math.random() * 5000 + 1000)
            : (Math.random() * 10000 + 2000);

          const newContract: SupplyContract = {
            supplierCompanyId: offer.companyId,
            customerCompanyId: bid.companyId,
            subUnitId,
            priceUSD: Number(contractPrice.toFixed(2)),
            quantityUnitsPerWeek: Number(baseContractUnits.toFixed(2)),
            weeksRemaining: duration,
          };
          remainingContracts.push(newContract);
        }
      }
    });
  });

  targetReg.activeContracts = remainingContracts;

  // 5. Save Category Demand state metrics
  const activeSubUnitContracts = remainingContracts.filter(c => c.subUnitId === subUnitId);
  demandState.unitPriceUSD = Number(clearedPriceUSD.toFixed(2));
  demandState.totalUnitsSuppliedThisWeek = openUnitsCleared + activeSubUnitContracts.reduce((s, c) => s + c.quantityUnitsPerWeek, 0);
  demandState.totalUnitsDemandedThisWeek = bids.reduce((s, b) => s + b.quantityUnits, 0) + openUnitsCleared + activeSubUnitContracts.reduce((s, c) => s + c.quantityUnitsPerWeek, 0);
  demandState.clearedInputPriceIndex = Number((clearedPriceUSD / baseUnitPrice).toFixed(4));
}

function computeRealizedVol(historicalValues: number[], window: number): number {
  const recent = historicalValues.slice(-window);
  if (recent.length < 2) return 0.15;
  const returns = recent.slice(1).map((v, i) => Math.log(v / recent[i]));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance * 52);
}

export function runUnitBiddingStage(state: GameState, ctx: WeeklyStepContext): void {
  Object.keys(ctx.updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = ctx.updatedRegions[regionId];

    Object.values(INDUSTRY_SUBUNITS).flat().forEach(subUnit => {
      const seed = reg.categoryDemand[subUnit.unitId]?.unitPriceUSD;
      executeSubUnitBiddingMarket(ctx, subUnit.unitId, Math.max(1, seed || 1), reg, regionId);
    });
  });

  const realizedIndexVol = computeRealizedVol(state.compositeIndices.us500.historical ?? [], 13);
  const baselineVol = 0.16;
  const usaRegime = ctx.updatedRegions.USA.cycleRegime;
  const regimeVolPremium = usaRegime === 'Recession' ? 0.08 : usaRegime === 'Slowdown' ? 0.03 : 0;
  ctx.marketVolComponent = Math.max(0, realizedIndexVol - baselineVol) * 0.5 + regimeVolPremium;
}
