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
import { SECTOR_PPE_USEFUL_LIFE_YEARS } from '../constants';
import { CATEGORY_INPUT_REQUIREMENTS, PRIVATE_SEGMENT_SUPPLY_CATEGORIES, PRIVATE_SEGMENT_SUPPLY_SHARE, CAPEX_SUPPLIER_WEIGHTS, CAPEX_CATEGORY_PRIVATE_SEGMENT, CAPEX_PUBLIC_SUPPLY_SHARE } from '../../../domain/market-microstructure';
import { isActiveCompany, getOutputInventoryUnits, getOutputInventoryUSD, InputLot } from '../../../domain/company';
import { WeeklyStepContext } from './context';
import { random } from '../../rng';

// 1$ is 1$ Phase 3: a private-sector "company ID" for the auction — distinguishable from any
// real ticker so the post-clearing crediting step can tell it apart from a real company sale.
const privateSegmentOfferId = (segmentType: string) => `PRIVATE:${segmentType}`;
// Share of a buyer's real weekly input need it locks under a long-term contract when one forms;
// the rest stays spot-purchased. Real procurement splits roughly this way.
const CONTRACTED_DEMAND_SHARE = 0.6;

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

// 1$ is 1$ Phase 2/6: credit a real purchase onto the buyer's persisted input inventory as a
// NEW LOT — appended on top of whatever this same company already holds (and whatever it
// already bought this same week via a different subUnitId's auction pass or a different real
// seller), not merged into one blended average, since the whole point is to keep each real
// purchase's real counterparty and real price distinguishable (see domain/company.ts's
// InputLot doc comment) rather than collapsing them the moment they're credited.
function addInputInventory(update: any, baseComp: Company, subUnitId: string, sellerId: string, addedUnits: number, addedValueUSD: number, week: number) {
  if (addedUnits <= 0.0001) return;
  if (!update.inputInventoryBySubUnit) update.inputInventoryBySubUnit = {};
  const existingLots: InputLot[] = update.inputInventoryBySubUnit[subUnitId] ?? [...(baseComp.inputInventoryBySubUnit?.[subUnitId] ?? [])];
  update.inputInventoryBySubUnit[subUnitId] = [
    ...existingLots,
    { sellerId, unitsHeld: addedUnits, unitPriceUSD: addedValueUSD / addedUnits, acquiredWeek: week },
  ];
}

/**
 * Everything about a region's firms that does not change between one sub-unit's auction and the
 * next, computed once per region per week.
 *
 * Why this exists: every one of these lists used to be rebuilt inside each sub-unit's auction —
 * a full scan of the region's firms (and of each firm's product lines) per sub-unit, per region,
 * per week. At ~40 sub-units x 4 regions that is the same ~2,000-firm array walked hundreds of
 * times a week to answer questions whose answers were identical every time. Measured, stage 05
 * was 72.6% of the entire weekly step at 3.8 seconds a week; this is the reason.
 *
 * The lists are read-only within a week: the auction mutates `companyUpdates`, never the firm
 * objects these index, so one build per region is correct as well as faster.
 */
interface RegionMarketIndex {
  activeFirms: Company[];
  /**
   * Firms that genuinely consume each recipe-input sub-unit. Built by walking each firm's own
   * product lines ONCE and recording the inputs its industry requires — the inverse of asking,
   * for every sub-unit market, which of the region's ~500 firms happen to need it. Same answer,
   * O(firms x lines) instead of O(sub-units x firms x lines).
   */
  recipeInputBuyersBySubUnit: Map<string, Company[]>;
  /** subUnitId -> the firms that produce it (built from one pass over every firm's lines). */
  suppliersBySubUnit: Map<string, Company[]>;
  /** Firms with real capex, the customer base for every capital-goods category. */
  capexBuyers: Company[];
  byTicker: Map<string, Company>;
  byId: Map<string, Company>;
}

function buildRegionMarketIndex(ctx: WeeklyStepContext, regionId: RegionId): RegionMarketIndex {
  const activeFirms: Company[] = [];
  const suppliersBySubUnit = new Map<string, Company[]>();
  const capexBuyers: Company[] = [];
  const recipeInputBuyersBySubUnit = new Map<string, Company[]>();
  const byTicker = new Map<string, Company>();
  const byId = new Map<string, Company>();
  // HC3: the goods market has never cared who owns a supplier's equity — public and private
  // firms bid and offer in the same real auction.
  const walk = (c: Company) => {
    if (c.region !== regionId || !isActiveCompany(c)) return;
    activeFirms.push(c);
    byTicker.set(c.ticker, c);
    byId.set(c.id, c);
    if ((c.maintenanceCapex ?? 0) + (c.growthCapex ?? 0) > 0) capexBuyers.push(c);
    (c.productLines || []).forEach((l) => {
      const arr = suppliersBySubUnit.get(l.subUnitId);
      if (arr) arr.push(c); else suppliersBySubUnit.set(l.subUnitId, [c]);
      const reqs = CATEGORY_INPUT_REQUIREMENTS[l.industry];
      if (reqs) {
        Object.keys(reqs).forEach(inputSubUnitId => {
          if (!(reqs as any)[inputSubUnitId]) return;
          const buyers = recipeInputBuyersBySubUnit.get(inputSubUnitId);
          // A firm with two lines needing the same input is one buyer, not two: its need is
          // summed by computeRecipeInputNeedUSD when it bids.
          if (buyers) { if (buyers[buyers.length - 1] !== c) buyers.push(c); }
          else recipeInputBuyersBySubUnit.set(inputSubUnitId, [c]);
        });
      }
    });
  };
  ctx.prevActiveFirms.forEach(walk);
  ctx.prevActivePrivateFirms.forEach(walk);
  return { activeFirms, suppliersBySubUnit, capexBuyers, recipeInputBuyersBySubUnit, byTicker, byId };
}

function executeSubUnitBiddingMarket(
  ctx: WeeklyStepContext,
  subUnitId: string,
  baseUnitPrice: number,
  targetReg: Region,
  targetRegionId: RegionId,
  index: RegionMarketIndex,
  /**
   * ONLY this sub-unit's live contracts. Each market used to walk the region's entire contract
   * list to find its own — O(sub-units x contracts) for what is one grouping pass, and the
   * single largest cost left in this stage. The caller partitions once per region per week and
   * this returns the survivors for its own bucket.
   */
  ownContracts: SupplyContract[]
): SupplyContract[] {
  const { companyUpdates, nextWeek } = ctx;
  const demandState = targetReg.categoryDemand[subUnitId] as any;
  if (!demandState) return ownContracts;

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
  const remainingContracts: SupplyContract[] = [];
  // supUp.salesUnits/salesUSD are deliberately cross-sub-unit totals (other consumers want a
  // company's whole-business sales) — but the inventory formula below needs THIS sub-unit's
  // sales specifically, so track that separately rather than reading the contaminated total.
  const contractSalesUnitsBySupplier: Record<string, number> = {};

  ownContracts.forEach(contract => {

    const supplier = index.byTicker.get(contract.supplierCompanyId) ?? index.byId.get(contract.supplierCompanyId);
    const customer = index.byTicker.get(contract.customerCompanyId) ?? index.byId.get(contract.customerCompanyId);

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
          addInputInventory(custUp, customer, subUnitId, supplier.ticker, actualTransacted, paymentUSD, nextWeek);

          if (fillRate < 0.95) {
            // Named shock propagation: reduced fill rate constrains customer capacity directly
            custUp.inputSupplyConstraintFactor = Math.min(custUp.inputSupplyConstraintFactor ?? 1.0, Math.max(0.3, fillRate));
          }

          remainingContracts.push(contract);
        }
      }
    }
  });
  // 2. Open Bidding & Matching
  const bids: UnitBid[] = [];
  const offers: UnitOffer[] = [];

  // HC3: private firms produce, sell and buy in the same real auction — the goods market has
  // never cared who owns a supplier's equity. Their segment aggregates surrendered this slice
  // at the carve, so each real good is offered exactly once.
  const regionActiveFirms = index.activeFirms;
  const suppliers = index.suppliersBySubUnit.get(subUnitId) ?? [];
  const supplierSet = suppliers.length > 0 ? new Set(suppliers) : null;

  // A recipe-input category (upstream_extraction, specialty_metals) is bought by named
  // companies for a literal, computable reason — their own production recipe — not a generic
  // share of aggregate corporate demand; every company whose recipe actually needs this
  // category becomes a real customer, sized to that same real need (computeRecipeInputNeedUSD),
  // so what a company bids to buy here matches exactly what 08-company-fundamentals.ts later
  // draws down from its input inventory.
  const isRecipeInputCategory = Object.values(CATEGORY_INPUT_REQUIREMENTS).some(reqs => (reqs as any)?.[subUnitId] !== undefined);
  // 1$ is 1$ Phase 4: a capital-goods category (heavy_equipment, industrial_automation,
  // commercial_construction, enterprise_software, commercial_fleet) is bought by every company
  // for the same literal, computable reason — its own real weekly capex — replacing
  // 08b-capex-settlement.ts's parallel abstract demand-growth injection (retired) with real,
  // named, per-company bids sized directly from each buyer's own maintenanceCapex+growthCapex.
  const capexSupplierWeight = CAPEX_SUPPLIER_WEIGHTS[subUnitId];
  const isCapexSupplierCategory = capexSupplierWeight !== undefined;
  // Real, complete corporate demand for every OTHER category (see 03-category-demand.ts's
  // corporateDemandUSD — the same buyerMix/aggregate-investment math that feeds the region's
  // C+I+G identity, not a hand-picked per-category intensity list that only covered a handful
  // of categories and let every other one starve for real corporate buyers).
  const hasCorporateDemand = (demandState.corporateDemandUSD ?? 0) > 0;
  // Capital-goods categories draw from the pre-indexed capex buyers; everything else scans the
  // region's firms once. A producer of the category is never also its customer.
  const candidatePool = isCapexSupplierCategory
    ? index.capexBuyers
    : isRecipeInputCategory
      ? (index.recipeInputBuyersBySubUnit.get(subUnitId) ?? [])
      : regionActiveFirms;
  const customers = candidatePool.filter(c => {
    if (supplierSet?.has(c)) return false;
    if (isCapexSupplierCategory || isRecipeInputCategory) return true;
    return hasCorporateDemand;
  });
  const totalCustomerRevenueUSD = customers.reduce((s, c) => s + c.annualRevenue, 0) || 1;

  // Contracts indexed by counterparty, once, instead of re-scanned inside every supplier's and
  // every customer's loop. The scans were O(firms x contracts) per sub-unit per region per week
  // — the dominant cost in the stage that dominates the weekly step.
  const contractUnitsBySupplier = new Map<string, number>();
  const contractUnitsByCustomer = new Map<string, number>();
  remainingContracts.forEach(c => {
    contractUnitsBySupplier.set(c.supplierCompanyId, (contractUnitsBySupplier.get(c.supplierCompanyId) ?? 0) + c.quantityUnitsPerWeek);
    contractUnitsByCustomer.set(c.customerCompanyId, (contractUnitsByCustomer.get(c.customerCompanyId) ?? 0) + c.quantityUnitsPerWeek);
  });
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

    // Production is capacity x utilisation, in UNITS. The previous version sized production in
    // dollars (annualRevenue/52) and divided by the CURRENT price, so a doubling of price halved
    // the units the same plant produced — supply fell as price rose, which is the wrong sign and
    // closes a positive feedback loop. Measured, it drove the inflation runaway (§7.28):
    // defense_systems went to 9.3x its base price with supply collapsing 49 -> 22 units while
    // demand still stood at 1,255. Real capacity is physical: what price changes is how hard the
    // plant is run (productionResponseFactor) and whether the warehouse is already full
    // (productionThrottle), never how much the plant can make.
    if (!(line.weeklyCapacityUnits! > 0)) {
      // Seeded from this line's real baseline output at the price prevailing when it first
      // trades — at week 1 that is the bootstrap price, so capacity opens exactly where the old
      // dollar-anchored figure did and only the response to later price moves changes.
      line.weeklyCapacityUnits =
        ((comp.baselineAnnualRevenue || comp.annualRevenue) / 52) * (line.revenueShare ?? 1.0) / currentUnitPrice;
    } else {
      // Real net investment grows the plant: growth capex less depreciation, over the capital
      // stock. Both are nominal dollars, so the ratio is real and inflation cancels out of it.
      const grossPPE = comp.grossPPEUSD ?? 0;
      const netPPE = Math.max(1, grossPPE - (comp.accumulatedDepreciationUSD ?? 0));
      const weeklyDepreciationUSD = grossPPE / ((SECTOR_PPE_USEFUL_LIFE_YEARS[comp.sector] ?? 12) * 52);
      const netInvestmentRate = ((comp.growthCapex ?? 0) / 52 - weeklyDepreciationUSD) / netPPE;
      line.weeklyCapacityUnits = Math.max(
        0.0001,
        line.weeklyCapacityUnits! * (1 + Math.max(-0.02, Math.min(0.02, netInvestmentRate)))
      );
    }
    const targetProductionUnits = line.weeklyCapacityUnits! * productionResponseFactor * productionThrottle;
    const targetProductionUSD = targetProductionUnits * currentUnitPrice;

    const currentUnits = getOutputInventoryUnits(comp, subUnitId);
    const contractSales = (contractUnitsBySupplier.get(comp.ticker) ?? 0) + (contractUnitsBySupplier.get(comp.id) ?? 0);

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

  // 1$ is 1$ Phase 3: a real, sellable private-sector offer for categories where public company
  // supply can be sparse or entirely absent (confirmed: specialty_metals had zero real
  // suppliers in a sampled region) — a genuine named counterparty, not a residual write-off.
  const privateSegmentType = PRIVATE_SEGMENT_SUPPLY_CATEGORIES[subUnitId];
  if (privateSegmentType) {
    const segment = targetReg.privateSectorSegments?.find(s => s.segmentType === privateSegmentType);
    if (segment) {
      const segmentOfferUSD = (segment.annualRevenueUSD / 52) * PRIVATE_SEGMENT_SUPPLY_SHARE;
      const segmentOfferUnits = segmentOfferUSD / currentUnitPrice;
      if (segmentOfferUnits > 0.001) {
        offers.push({
          companyId: privateSegmentOfferId(privateSegmentType),
          quantityUnits: segmentOfferUnits,
          minPriceUSD: currentUnitPrice * 0.90,
        });
      }
    }
  }

  // 1$ is 1$ Phase 4: for capital-goods categories, the private segment is a real seller of
  // whatever share of the region's aggregate real capex demand in-region public producers don't
  // cover — replacing 08b-capex-settlement.ts's identical economics (same
  // CAPEX_PUBLIC_SUPPLY_SHARE split) with a real, price-competing offer in the actual auction
  // instead of a direct, un-auctioned credit to the segment's revenue.
  const capexPrivateSegmentType = isCapexSupplierCategory ? CAPEX_CATEGORY_PRIVATE_SEGMENT[subUnitId] : undefined;
  if (capexPrivateSegmentType) {
    const capexSegment = targetReg.privateSectorSegments?.find(s => s.segmentType === capexPrivateSegmentType);
    if (capexSegment) {
      const totalRegionCapexUSD = regionActiveFirms.reduce((s, c) => s + ((c.maintenanceCapex ?? 0) + (c.growthCapex ?? 0)), 0);
      const totalCategoryCapexDemandUSD = totalRegionCapexUSD * capexSupplierWeight!;
      const privateShareUSD = (1 - CAPEX_PUBLIC_SUPPLY_SHARE) * totalCategoryCapexDemandUSD;
      const capexSegmentOfferUnits = (privateShareUSD / 52) / currentUnitPrice;
      if (capexSegmentOfferUnits > 0.001) {
        offers.push({
          companyId: privateSegmentOfferId(capexPrivateSegmentType),
          quantityUnits: capexSegmentOfferUnits,
          minPriceUSD: currentUnitPrice * 0.90,
        });
      }
    }
  }

  // Corporate Customers submit bids
  customers.forEach(comp => {
    let demandUSD = 0;
    if (isCapexSupplierCategory) {
      const realCapexUSD = (comp.maintenanceCapex ?? 0) + (comp.growthCapex ?? 0);
      demandUSD = (realCapexUSD / 52) * capexSupplierWeight!;
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

    const contractPurchases = (contractUnitsByCustomer.get(comp.ticker) ?? 0) + (contractUnitsByCustomer.get(comp.id) ?? 0);

    const openBidUnits = Math.max(0, demandUnits - contractPurchases);

    if (openBidUnits > 0.001) {
      const cashRatio = comp.cash / Math.max(1, comp.annualRevenue);
      // A cash-strapped buyer discounting its OWN bid price used to be the mechanism here —
      // but under pro-rata clearing every in-the-money bid gets the same fill ratio regardless
      // of how far above the clearing price it sits, so a discounted bid is either fully in the
      // money like everyone else, or (once the clearing price rises past it) shut out entirely.
      // Confirmed by direct A/B instrumentation (see docs/MASTER_PLAN.md §7; full history in git):
      // this produced a real, compounding death spiral with no recovery path — low cash -> lower
      // bid price -> shut out -> can't get inputs -> less revenue -> less cash -> an even lower
      // price next week. A capital-constrained real buyer instead orders LESS at a normal market
      // price (real capital rationing), so whatever it does order actually clears — giving it a
      // path back up as its cash position recovers, instead of a one-way ratchet toward zero.
      const cashConstrainedQtyModifier = cashRatio < 0.02 ? 0.70 : 1.0;
      const cashRichPricePremium = cashRatio > 0.15 ? 1.15 : 1.0;
      const maxPriceUSD = currentUnitPrice * (0.95 + random() * 0.1) * cashRichPricePremium;

      bids.push({
        companyId: comp.ticker,
        quantityUnits: openBidUnits * cashConstrainedQtyModifier,
        maxPriceUSD,
      });
    }
  });

  // 1$ is 1$ Phase 3 (demand-side): the private sector spends real capex too — every segment
  // bids for capital-goods categories from its own real capexUSD, the same mechanism already
  // used for public companies, so a segment's capex dollars land on a real named supplier
  // (a public company, or another segment's own supply offer above) instead of only ever being
  // credited as an ambient revenue bump with no corresponding purchase anywhere in the auction.
  if (isCapexSupplierCategory) {
    (targetReg.privateSectorSegments || []).forEach(segment => {
      const segCapexUSD = segment.capexUSD ?? 0;
      if (segCapexUSD <= 0) return;
      const demandUSD = (segCapexUSD / 52) * capexSupplierWeight!;
      const demandUnits = demandUSD / currentUnitPrice;
      if (demandUnits > 0.001) {
        bids.push({
          companyId: privateSegmentOfferId(segment.segmentType),
          quantityUnits: demandUnits,
          maxPriceUSD: currentUnitPrice * (0.95 + random() * 0.1),
        });
      }
    });
  }

  // 1$ is 1$ Phase 3 (demand-side): the MANUFACTURING segment is the private-sector stand-in
  // for real industrial production — it already sells upstream_extraction/specialty_metals
  // output and heavy_equipment/industrial_automation/commercial_fleet capacity (above) — so it
  // also consumes the same literal recipe inputs a real IndustrialsMachinery company would,
  // proportional to its own revenue, closing the loop on its supply-side role with a real
  // purchase instead of leaving it a pure seller with no input demand of its own. (Other segment
  // types — PROFESSIONAL_SERVICES, RETAIL_TRADE, CONSTRUCTION_REALESTATE, HEALTHCARE_SERVICES —
  // aren't given a recipe-input demand here: which of these categories they'd plausibly consume
  // isn't well-grounded in the existing data, so this is deliberately left for a future pass
  // rather than guessed.)
  if (isRecipeInputCategory) {
    const manufacturingSegment = targetReg.privateSectorSegments?.find(s => s.segmentType === 'MANUFACTURING');
    if (manufacturingSegment) {
      const intensity = CATEGORY_INPUT_REQUIREMENTS['IndustrialsMachinery']?.[subUnitId];
      if (intensity) {
        const demandUSD = (manufacturingSegment.annualRevenueUSD / 52) * intensity;
        const demandUnits = demandUSD / currentUnitPrice;
        if (demandUnits > 0.001) {
          bids.push({
            companyId: privateSegmentOfferId('MANUFACTURING'),
            quantityUnits: demandUnits,
            maxPriceUSD: currentUnitPrice * (0.95 + random() * 0.1),
          });
        }
      }
    }
  }

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

  // Discover the market-clearing price and total cleared quantity via the standard sequential
  // double-auction walk — this correctly finds how much trades in aggregate and at what price.
  // Crucially, this pass only DISCOVERS clearedPriceUSD/openUnitsCleared; it does not decide who
  // gets how much (that used to double as the allocation mechanism too, via bidIdx/offerIdx
  // walking through the sorted arrays and draining bid.quantityUnits/offer.quantityUnits in
  // order) — a company sorted near the back of the queue could be shut out completely even when
  // the region's aggregate supply and demand balanced exactly, confirmed by direct
  // instrumentation (see docs/MASTER_PLAN.md §7; full history in git). Allocation below is
  // pro-rata among everyone who clears at the market price instead, the way real double auctions
  // and oversubscribed IPO allocations actually work.
  let clearedPriceUSD = currentUnitPrice;
  let openUnitsCleared = 0;
  {
    let bidIdx = 0;
    let offerIdx = 0;
    let remainingBidQty = bids.map(b => b.quantityUnits);
    let remainingOfferQty = offers.map(o => o.quantityUnits);
    let loopCounter = 0;
    while (bidIdx < bids.length && offerIdx < offers.length) {
      if (loopCounter++ > 10000) break;
      const bid = bids[bidIdx];
      const offer = offers[offerIdx];
      if (bid.maxPriceUSD >= offer.minPriceUSD) {
        const transactQty = Math.min(remainingBidQty[bidIdx], remainingOfferQty[offerIdx]);
        if (!isFinite(transactQty) || isNaN(transactQty) || transactQty <= 0) {
          bidIdx++;
          offerIdx++;
          continue;
        }
        clearedPriceUSD = (bid.maxPriceUSD + offer.minPriceUSD) / 2;
        openUnitsCleared += transactQty;
        remainingBidQty[bidIdx] -= transactQty;
        remainingOfferQty[offerIdx] -= transactQty;
        if (remainingBidQty[bidIdx] <= 0.0001) bidIdx++;
        if (remainingOfferQty[offerIdx] <= 0.0001) offerIdx++;
      } else {
        break;
      }
    }
  }

  const openSales: Record<string, { units: number; amount: number }> = {};
  const openPurchases: Record<string, { units: number; amount: number }> = {};
  // Every bid/offer that would trade at all at the clearing price is "in the money"; everyone
  // on the constrained side (whichever of demand/supply is smaller) gets the same fill ratio —
  // no one is shut out just because of where their entry happened to land in a sorted array.
  const inMoneyBids = bids.filter(b => b.maxPriceUSD >= clearedPriceUSD);
  const inMoneyOffers = offers.filter(o => o.minPriceUSD <= clearedPriceUSD);
  if (openUnitsCleared > 0.0001) {
    const totalInMoneyBidQty = inMoneyBids.reduce((s, b) => s + b.quantityUnits, 0);
    const totalInMoneyOfferQty = inMoneyOffers.reduce((s, o) => s + o.quantityUnits, 0);
    const bidFillRatio = totalInMoneyBidQty > 0 ? Math.min(1, openUnitsCleared / totalInMoneyBidQty) : 0;
    const offerFillRatio = totalInMoneyOfferQty > 0 ? Math.min(1, openUnitsCleared / totalInMoneyOfferQty) : 0;

    inMoneyOffers.forEach(offer => {
      const filledQty = offer.quantityUnits * offerFillRatio;
      if (filledQty <= 0.0001) return;
      if (!openSales[offer.companyId]) openSales[offer.companyId] = { units: 0, amount: 0 };
      openSales[offer.companyId].units += filledQty;
      openSales[offer.companyId].amount += filledQty * clearedPriceUSD;
    });

    inMoneyBids.forEach(bid => {
      const filledQty = bid.quantityUnits * bidFillRatio;
      if (filledQty <= 0.0001) return;
      if (bid.companyId) {
        if (!openPurchases[bid.companyId]) openPurchases[bid.companyId] = { units: 0, amount: 0 };
        openPurchases[bid.companyId].units += filledQty;
        openPurchases[bid.companyId].amount += filledQty * clearedPriceUSD;
      }
      if (bid.isHouseholdAggregate && subUnitId === 'passenger_vehicles') {
        targetReg.householdState.durableGoodsStockUnits = (targetReg.householdState.durableGoodsStockUnits ?? 0) + filledQty;
      }
    });
  }

  // 1$ is 1$ Phase 6: real open-market purchase lots — WHO a company's cleared purchase this
  // week actually came from, not just an anonymous pooled total. Pro-rata clearing doesn't pair
  // specific buyers with specific sellers (unlike a contract, which already has a named
  // supplier), but the aggregate quantities on both sides are fully known, so a simple
  // northwest-corner allocation (walk both sides in order, filling from the current seller until
  // either it or the current buyer is exhausted, then advance) produces a real, quantity-
  // consistent buyer/seller pairing — the same real-double-auction assumption a clearinghouse
  // actually uses to settle trades, not an invented attribution.
  const purchaseLots: { buyerId: string; sellerId: string; units: number }[] = [];
  if (openUnitsCleared > 0.0001) {
    const totalInMoneyOfferQty = inMoneyOffers.reduce((s, o) => s + o.quantityUnits, 0);
    const totalInMoneyBidQty = inMoneyBids.reduce((s, b) => s + b.quantityUnits, 0);
    const offerFillRatio = totalInMoneyOfferQty > 0 ? Math.min(1, openUnitsCleared / totalInMoneyOfferQty) : 0;
    const bidFillRatio = totalInMoneyBidQty > 0 ? Math.min(1, openUnitsCleared / totalInMoneyBidQty) : 0;
    const sellerRemaining = inMoneyOffers.map(o => ({ id: o.companyId, qty: o.quantityUnits * offerFillRatio })).filter(s => s.qty > 0.0001);
    const buyerRemaining = inMoneyBids.filter(b => b.companyId).map(b => ({ id: b.companyId!, qty: b.quantityUnits * bidFillRatio })).filter(b => b.qty > 0.0001);
    let si = 0, bi = 0;
    while (si < sellerRemaining.length && bi < buyerRemaining.length) {
      const s = sellerRemaining[si], b = buyerRemaining[bi];
      const qty = Math.min(s.qty, b.qty);
      if (qty > 0.0001) purchaseLots.push({ buyerId: b.id, sellerId: s.id, units: qty });
      s.qty -= qty; b.qty -= qty;
      if (s.qty <= 0.0001) si++;
      if (b.qty <= 0.0001) bi++;
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

    // Settlement pass: capacity was already seeded and evolved in the offer pass above; this
    // pass only reads it, so a week's investment is never applied twice.
    const capacityUnits = line.weeklyCapacityUnits
      ?? (((comp.baselineAnnualRevenue || comp.annualRevenue) / 52) * (line.revenueShare ?? 1.0) / currentUnitPrice);
    const targetProductionUnits = capacityUnits * productionResponseFactor * productionThrottle;
    const targetProductionUSD = targetProductionUnits * currentUnitPrice;

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

  // Credit the private segment's real cleared sale — not a Company, so it isn't in
  // companyUpdates; annualRevenueUSD is a run-rate (not an accumulator), so replace THIS
  // category's own prior contribution rather than stacking another annualized figure on top.
  // Tracked per sub-unit category (not one shared scalar) since multiple categories can route
  // to the same segment within the same week — see the field's own doc comment for why a
  // shared scalar corrupted annualRevenueUSD.
  if (privateSegmentType) {
    const segment = targetReg.privateSectorSegments?.find(s => s.segmentType === privateSegmentType);
    if (segment) {
      const sale = openSales[privateSegmentOfferId(privateSegmentType)];
      const newAnnualizedContribution = (sale?.amount ?? 0) * 52;
      const priorContribution = segment.realSupplySalesDerivedAnnualRevenueUSDBySubUnit?.[subUnitId] ?? 0;
      segment.annualRevenueUSD = Math.max(1, segment.annualRevenueUSD - priorContribution + newAnnualizedContribution);
      if (!segment.realSupplySalesDerivedAnnualRevenueUSDBySubUnit) segment.realSupplySalesDerivedAnnualRevenueUSDBySubUnit = {};
      segment.realSupplySalesDerivedAnnualRevenueUSDBySubUnit[subUnitId] = newAnnualizedContribution;
    }
  }

  // Same real-crediting treatment for the capex private-segment offer, per sub-unit category
  // for the identical reason (heavy_equipment, industrial_automation, and commercial_fleet all
  // route to MANUFACTURING and must not clobber each other's contribution).
  if (capexPrivateSegmentType) {
    const capexSegment = targetReg.privateSectorSegments?.find(s => s.segmentType === capexPrivateSegmentType);
    if (capexSegment) {
      const sale = openSales[privateSegmentOfferId(capexPrivateSegmentType)];
      const newAnnualizedContribution = (sale?.amount ?? 0) * 52;
      const priorContribution = capexSegment.capexDerivedAnnualRevenueUSDBySubUnit?.[subUnitId] ?? 0;
      capexSegment.annualRevenueUSD = Math.max(1, capexSegment.annualRevenueUSD - priorContribution + newAnnualizedContribution);
      if (!capexSegment.capexDerivedAnnualRevenueUSDBySubUnit) capexSegment.capexDerivedAnnualRevenueUSDBySubUnit = {};
      capexSegment.capexDerivedAnnualRevenueUSDBySubUnit[subUnitId] = newAnnualizedContribution;
    }
  }

  customers.forEach(comp => {
    const purchase = openPurchases[comp.ticker];
    if (purchase) {
      if (!companyUpdates[comp.ticker]) companyUpdates[comp.ticker] = {};
      const custUp = companyUpdates[comp.ticker];
      custUp.cashChange = (custUp.cashChange ?? 0) - purchase.amount;
      custUp.purchasesUnits = (custUp.purchasesUnits ?? 0) + purchase.units;
      custUp.purchasesUSD = (custUp.purchasesUSD ?? 0) + purchase.amount;
      // Credit each real lot this buyer's cleared purchase actually came from (see
      // purchaseLots above), not one blended total — a company can genuinely buy from more
      // than one real seller (or a private-segment offer) in the same week's auction.
      purchaseLots.filter(l => l.buyerId === comp.ticker).forEach(l => {
        addInputInventory(custUp, comp, subUnitId, l.sellerId, l.units, l.units * clearedPriceUSD, nextWeek);
      });
    }
  });

  // 4. Contract Formation (B2B corporate matching only) — candidates are whoever actually
  // transacted this week (in the money at the clearing price), not "fully drained" as before
  // (that concept no longer applies now that allocation is pro-rata, not sequential). Pro-rata
  // allocation means most of both sides typically clear at once, so both pools can be as large
  // as the whole supplier/customer base — pairing every bid with every offer here (as the old
  // "usually only a couple of fully-filled entries" code did) is O(n²) and was confirmed to
  // make a week's simulation step hang. One random candidate partner per bid keeps the same
  // "each active bidder has some chance of striking a new long-term deal this week" behavior
  // at O(n) instead.
  const matchedBids = inMoneyBids.filter(b => b.companyId);
  const matchedOffers = inMoneyOffers;

  matchedBids.forEach(bid => {
    if (matchedOffers.length === 0) return;
    const offer = matchedOffers[Math.floor(random() * matchedOffers.length)];
    if (random() < 0.15 && bid.companyId) {
      const supplierComp = index.byTicker.get(offer.companyId as string);
      const customerComp = index.byTicker.get(bid.companyId as string);

        if (supplierComp && customerComp) {
          const totalSuppliersRevenue = suppliers.reduce((s, c) => s + c.annualRevenue, 0);
          const supplierMarketShare = supplierComp.annualRevenue / Math.max(1, totalSuppliersRevenue);
          const relativeSize = customerComp.annualRevenue / Math.max(1, supplierComp.annualRevenue);
          const supplierPowerFactor = 0.5 + (supplierMarketShare - 0.25) * 0.5;
          const customerBargainingPower = (relativeSize > 1.0 ? 0.6 : 0.4) * (1.0 - supplierPowerFactor);
          let contractPrice = clearedPriceUSD * (1.0 - (customerBargainingPower - 0.3) * 0.05);
          let duration = 12 + Math.floor(random() * 40);

          // Hedging for revenue volatility
          const revHist = customerComp.revenueHistory || [];
          let revVol = 0;
          if (revHist.length > 3) {
            const meanRev = revHist.reduce((s, v) => s + v, 0) / revHist.length;
            const varRev = revHist.reduce((s, v) => s + Math.pow(v - meanRev, 2), 0) / revHist.length;
            revVol = Math.sqrt(varRev) / meanRev;
          }
          if (revVol > 0.05) {
            duration = 52 + Math.floor(random() * 52); // Seek longer contracts
            const impliedPd = Math.max(0, Math.min(1, 1 / (1 + Math.exp(customerComp.interestCoverage * 0.8 - customerComp.leverage * 0.4))));
            const costOfCapital = 0.05 + (impliedPd * 0.60);
            const hedgingPremium = costOfCapital * 0.20; // Modest price premium
            contractPrice *= (1.0 + hedgingPremium);
          }

          // A contract is the locked-price form of the buyer's REAL demand — never an
          // independent quantity. The previous sizing was a hardcoded random ladder
          // (default 2,000–12,000 units/week regardless of who was buying), which for a
          // five-figure-per-unit input meant committing a buyer to tens of millions a week it
          // had no use for. For as long as cash never actually settled (pre-S5) this was
          // invisible; the S5 ledger exposed it in its first measured week: firms paying 2-3x
          // their entire cost structure for inputs, 48 weeks of unusable inventory, and a large
          // share of measured "energy sales" being this fantasy contract flow. Recorded in the
          // plan (§7.24). The buyer locks a share of the weekly need its own bid already
          // expresses, capped by what this supplier actually offered — spot covers the rest.
          const baseContractUnits = Math.min(
            bid.quantityUnits * CONTRACTED_DEMAND_SHARE,
            offer.quantityUnits
          );
          if (baseContractUnits <= 0.001) return;

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

  // 5. Save Category Demand state metrics
  // remainingContracts is already exactly this sub-unit's book — no filter needed.
  const activeSubUnitContracts = remainingContracts;
  demandState.unitPriceUSD = Number(clearedPriceUSD.toFixed(2));
  demandState.totalUnitsSuppliedThisWeek = openUnitsCleared + activeSubUnitContracts.reduce((s, c) => s + c.quantityUnitsPerWeek, 0);
  // bid.quantityUnits is each bid's original requested amount (no longer drained down during
  // matching — allocation is pro-rata, computed separately above), so this sum already is the
  // full open-market demand; adding openUnitsCleared again would double-count the filled share.
  demandState.totalUnitsDemandedThisWeek = bids.reduce((s, b) => s + b.quantityUnits, 0) + activeSubUnitContracts.reduce((s, c) => s + c.quantityUnitsPerWeek, 0);
  // S8: measured against a FIXED baseline, not against last week. `baseUnitPrice` here is the
  // caller's seed — this category's price LAST week — so the old form made this a week-over-week
  // change while every consumer read it as a level versus baseline (1.0 = at baseline). Two
  // different periodicities in one field, exactly what rule 9 exists to catch. The baseline is
  // captured the first time the category clears and never rewritten.
  if (!(demandState.baseUnitPriceUSD > 0)) demandState.baseUnitPriceUSD = clearedPriceUSD;
  demandState.clearedInputPriceIndex = Number((clearedPriceUSD / demandState.baseUnitPriceUSD).toFixed(4));

  return remainingContracts;
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

    // One index per region per week — see buildRegionMarketIndex for why.
    const index = buildRegionMarketIndex(ctx, regionId);

    // Partition the region's contract book by sub-unit ONCE, so each market touches only its
    // own paper instead of walking the whole book to find it. Buckets for sub-units this loop
    // never visits are still carried through, so no contract is lost.
    const contractsBySubUnit = new Map<string, SupplyContract[]>();
    (reg.activeContracts || []).forEach(c => {
      const bucket = contractsBySubUnit.get(c.subUnitId);
      if (bucket) bucket.push(c); else contractsBySubUnit.set(c.subUnitId, [c]);
    });

    Object.values(INDUSTRY_SUBUNITS).flat().forEach(subUnit => {
      const seed = reg.categoryDemand[subUnit.unitId]?.unitPriceUSD;
      const survivors = executeSubUnitBiddingMarket(
        ctx, subUnit.unitId, Math.max(1, seed || 1), reg, regionId, index,
        contractsBySubUnit.get(subUnit.unitId) ?? []
      );
      contractsBySubUnit.set(subUnit.unitId, survivors);
    });

    const reassembled: SupplyContract[] = [];
    contractsBySubUnit.forEach(bucket => { bucket.forEach(c => reassembled.push(c)); });
    reg.activeContracts = reassembled;
  });

  const realizedIndexVol = computeRealizedVol(state.compositeIndices.us500.historical ?? [], 13);
  const baselineVol = 0.16;
  const usaRegime = ctx.updatedRegions.USA.cycleRegime;
  const regimeVolPremium = usaRegime === 'Recession' ? 0.08 : usaRegime === 'Slowdown' ? 0.03 : 0;
  ctx.marketVolComponent = Math.max(0, realizedIndexVol - baselineVol) * 0.5 + regimeVolPremium;
}
